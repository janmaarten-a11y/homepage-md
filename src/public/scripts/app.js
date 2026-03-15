/**
 * HomepageMD — Client-side enhancements.
 *
 * v0.1: SSE live-update listener
 * v0.2: Search filtering, keyboard navigation
 * v0.3: Add/edit/delete bookmark forms
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPageSlug() {
  const path = window.location.pathname.slice(1);
  return path || document.querySelector('input[name="page"]')?.value || 'homepage';
}

async function apiRequest(method, slug, body) {
  const res = await fetch(`/api/bookmarks/${encodeURIComponent(slug)}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------------------------------------------------------------------------
// SSE — live updates
// ---------------------------------------------------------------------------

const evtSource = new EventSource('/api/events');

evtSource.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'update') {
      window.location.reload();
    }
  } catch {
    // Ignore malformed events
  }
});

// ---------------------------------------------------------------------------
// Search — filter bookmarks on the current page
// ---------------------------------------------------------------------------

const searchInput = document.getElementById('js-search');
const searchEmpty = document.querySelector('.js-search-empty');
const searchStatus = document.getElementById('js-search-status');
const bookmarks = document.querySelectorAll('.c-bookmark');
const categories = document.querySelectorAll('.c-category');
const subcategories = document.querySelectorAll('.c-subcategory');

let debounceTimer;

function filterBookmarks(query) {
  const term = query.toLowerCase().trim();
  let visibleCount = 0;

  for (const bookmark of bookmarks) {
    const searchText = bookmark.dataset.search || '';
    const matches = term === '' || searchText.includes(term);
    bookmark.hidden = !matches;
    if (matches) visibleCount++;
  }

  // Hide categories and subcategories that have no visible bookmarks
  for (const sub of subcategories) {
    const hasVisible = sub.querySelector('.c-bookmark:not([hidden])');
    sub.hidden = !hasVisible;
  }

  for (const cat of categories) {
    const hasVisible = cat.querySelector('.c-bookmark:not([hidden])');
    cat.hidden = !hasVisible;
  }

  // Show/hide the "no results" message
  const hasQuery = term !== '';
  searchEmpty.hidden = !hasQuery || visibleCount > 0;

  // Announce result count to screen readers
  if (hasQuery) {
    searchStatus.textContent = visibleCount === 0
      ? 'No bookmarks match your search.'
      : `${visibleCount} bookmark${visibleCount === 1 ? '' : 's'} found.`;
  } else {
    searchStatus.textContent = '';
  }
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => filterBookmarks(searchInput.value), 100);
  });
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (event) => {
  // "/" focuses the search input (unless already in an input/textarea)
  if (event.key === '/' && !isEditing(event.target)) {
    event.preventDefault();
    searchInput?.focus();
    return;
  }

  // Escape clears and blurs the search input
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    filterBookmarks('');
    searchInput.blur();
  }
});

function isEditing(element) {
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

// ---------------------------------------------------------------------------
// Add bookmark dialog
// ---------------------------------------------------------------------------

const addDialog = document.querySelector('.js-add-dialog');
const addForm = document.querySelector('.js-add-form');
const addOpenBtn = document.querySelector('.js-add-open');
const addCancelBtn = document.querySelector('.js-add-cancel');
const fetchMetaBtn = document.querySelector('.js-fetch-meta');
const addUrlInput = document.querySelector('.js-add-url');
const addTitleInput = document.querySelector('.js-add-title');
const addDescInput = document.querySelector('.js-add-description');

if (addOpenBtn && addDialog) {
  addOpenBtn.addEventListener('click', () => addDialog.showModal());
}

if (addCancelBtn && addDialog) {
  addCancelBtn.addEventListener('click', () => addDialog.close());
}

if (fetchMetaBtn) {
  fetchMetaBtn.addEventListener('click', async () => {
    const url = addUrlInput?.value?.trim();
    if (!url) return;

    fetchMetaBtn.disabled = true;
    fetchMetaBtn.textContent = 'Fetching…';

    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.title && addTitleInput && !addTitleInput.value) {
        addTitleInput.value = data.title;
      }
      if (data.description && addDescInput && !addDescInput.value) {
        addDescInput.value = data.description;
      }
    } catch {
      // Silently fail — user can type manually
    } finally {
      fetchMetaBtn.disabled = false;
      fetchMetaBtn.textContent = 'Fetch title & description';
    }
  });
}

if (addForm) {
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const slug = getPageSlug();

    try {
      await apiRequest('POST', slug, {
        title: formData.get('title'),
        url: formData.get('url'),
        description: formData.get('description') || null,
        category: formData.get('category'),
        subcategory: formData.get('subcategory') || null,
      });
      addDialog.close();
      addForm.reset();
      // SSE will trigger reload, but reload immediately for responsiveness
      window.location.reload();
    } catch (err) {
      alert(`Failed to add bookmark: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Edit bookmark dialog
// ---------------------------------------------------------------------------

const editDialog = document.querySelector('.js-edit-dialog');
const editForm = document.querySelector('.js-edit-form');
const editCancelBtn = document.querySelector('.js-edit-cancel');
const editOriginalUrl = document.querySelector('.js-edit-original-url');
const editTitle = document.querySelector('.js-edit-title');
const editUrl = document.querySelector('.js-edit-url');
const editDescription = document.querySelector('.js-edit-description');

if (editCancelBtn && editDialog) {
  editCancelBtn.addEventListener('click', () => editDialog.close());
}

document.addEventListener('click', (event) => {
  const editBtn = event.target.closest('.js-edit-open');
  if (!editBtn) return;

  const card = editBtn.closest('.c-bookmark');
  if (!card || !editDialog) return;

  const url = card.dataset.url || '';
  const titleEl = card.querySelector('.c-bookmark__title');
  const descEl = card.querySelector('.c-bookmark__description');

  editOriginalUrl.value = url;
  editUrl.value = url;
  editTitle.value = titleEl?.textContent || '';
  editDescription.value = descEl?.textContent || '';

  editDialog.showModal();
});

if (editForm) {
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const slug = getPageSlug();
    const originalUrl = editOriginalUrl.value;

    try {
      await apiRequest('PUT', slug, {
        url: originalUrl,
        title: editTitle.value,
        newUrl: editUrl.value !== originalUrl ? editUrl.value : undefined,
        description: editDescription.value || null,
      });
      editDialog.close();
      window.location.reload();
    } catch (err) {
      alert(`Failed to update bookmark: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Delete bookmark
// ---------------------------------------------------------------------------

document.addEventListener('click', async (event) => {
  const deleteBtn = event.target.closest('.js-delete');
  if (!deleteBtn) return;

  const card = deleteBtn.closest('.c-bookmark');
  if (!card) return;

  const url = card.dataset.url || '';
  const titleEl = card.querySelector('.c-bookmark__title');
  const title = titleEl?.textContent || url;

  if (!confirm(`Delete "${title}"?`)) return;

  const slug = getPageSlug();

  try {
    await apiRequest('DELETE', slug, { url });
    window.location.reload();
  } catch (err) {
    alert(`Failed to delete bookmark: ${err.message}`);
  }
});
