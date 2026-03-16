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

function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(errorEl) {
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.hidden = true;
}

// Track which element opened each dialog so we can return focus
const dialogOpeners = new WeakMap();

function openDialog(dialog, opener) {
  if (!dialog) return;
  dialogOpeners.set(dialog, opener || document.activeElement);
  dialog.showModal();
  const closeBtn = dialog.querySelector('.c-dialog__close');
  if (closeBtn) closeBtn.focus();
}

function returnFocus(dialog) {
  const opener = dialogOpeners.get(dialog);
  if (opener && typeof opener.focus === 'function') {
    opener.focus();
  }
  dialogOpeners.delete(dialog);
}

function closeDialog(dialog) {
  if (!dialog) return;
  dialog.close();
  // focus return handled by the 'close' event listener below
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

  // "?" opens keyboard help (unless in an input)
  if (event.key === '?' && !isEditing(event.target)) {
    event.preventDefault();
    const helpDialog = document.querySelector('.js-keyboard-help');
    if (helpDialog) openDialog(helpDialog);
    return;
  }

  // Escape clears and blurs the search input
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    filterBookmarks('');
    searchInput.blur();
  }
});

// Keyboard help close button
const keyboardHelpClose = document.querySelector('.js-keyboard-help-close');
const keyboardHelpDialog = document.querySelector('.js-keyboard-help');
if (keyboardHelpClose && keyboardHelpDialog) {
  keyboardHelpClose.addEventListener('click', () => closeDialog(keyboardHelpDialog));
}

// Return focus when any dialog closes (Escape, close button, or form submit)
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => returnFocus(dialog));
}

function isEditing(element) {
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

// ---------------------------------------------------------------------------
// Bookmark card roving focus — arrow keys navigate link → edit → delete
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (event) => {
  const card = event.target.closest('.c-bookmark');
  if (!card) return;

  const focusable = [
    card.querySelector('.c-bookmark__link'),
    card.querySelector('.js-edit-open'),
    card.querySelector('.js-delete'),
  ].filter(Boolean);

  const currentIdx = focusable.indexOf(event.target);
  if (currentIdx === -1) return;

  let nextIdx = -1;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIdx = currentIdx + 1;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIdx = currentIdx - 1;
  } else if (event.key === 'Escape' && currentIdx > 0) {
    nextIdx = 0; // Return to the link
  } else {
    return;
  }

  if (nextIdx >= 0 && nextIdx < focusable.length) {
    event.preventDefault();
    focusable[nextIdx].focus();
  }
});

// ---------------------------------------------------------------------------
// Add bookmark dialog
// ---------------------------------------------------------------------------

const addDialog = document.querySelector('.js-add-dialog');
const addForm = document.querySelector('.js-add-form');
const addOpenBtns = document.querySelectorAll('.js-add-open');
const addCancelBtn = document.querySelector('.js-add-cancel');
const fetchMetaBtn = document.querySelector('.js-fetch-meta');
const addUrlInput = document.querySelector('.js-add-url');
const addTitleInput = document.querySelector('.js-add-title');
const addDescInput = document.querySelector('.js-add-description');
const addError = document.querySelector('.js-add-error');

if (addDialog) {
  for (const btn of addOpenBtns) {
    btn.addEventListener('click', () => {
      clearError(addError);
      openDialog(addDialog, btn);
    });
  }
}

if (addCancelBtn && addDialog) {
  addCancelBtn.addEventListener('click', () => closeDialog(addDialog));
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
        icon: formData.get('icon') || null,
        category: formData.get('category'),
        subcategory: formData.get('subcategory') || null,
      });
      addDialog.close();
      addForm.reset();
      // SSE will trigger reload, but reload immediately for responsiveness
      window.location.reload();
    } catch (err) {
      showError(addError, `Failed to add bookmark: ${err.message}`);
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
const editIcon = document.querySelector('.js-edit-icon');
const editFetchMetaBtn = document.querySelector('.js-edit-fetch-meta');
const editError = document.querySelector('.js-edit-error');

if (editCancelBtn && editDialog) {
  editCancelBtn.addEventListener('click', () => closeDialog(editDialog));
}

// Fetch metadata in edit dialog — overwrites if URL changed, fills empty if same
if (editFetchMetaBtn) {
  editFetchMetaBtn.addEventListener('click', async () => {
    const url = editUrl?.value?.trim();
    if (!url) return;

    const urlChanged = url !== editOriginalUrl.value;

    editFetchMetaBtn.disabled = true;
    editFetchMetaBtn.textContent = 'Fetching…';

    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.title && editTitle) {
        if (urlChanged || !editTitle.value) editTitle.value = data.title;
      }
      if (data.description && editDescription) {
        if (urlChanged || !editDescription.value) editDescription.value = data.description;
      }
    } catch {
      // Silently fail
    } finally {
      editFetchMetaBtn.disabled = false;
      editFetchMetaBtn.textContent = 'Fetch title & description';
    }
  });
}

document.addEventListener('click', (event) => {
  const editBtn = event.target.closest('.js-edit-open');
  if (!editBtn) return;

  const card = editBtn.closest('.c-bookmark');
  if (!card || !editDialog) return;

  const url = card.dataset.url || '';
  const iconUrl = card.dataset.icon || '';
  const titleEl = card.querySelector('.c-bookmark__title');
  const descEl = card.querySelector('.c-bookmark__description');

  editOriginalUrl.value = url;
  editUrl.value = url;
  editTitle.value = titleEl?.textContent || '';
  editDescription.value = descEl?.textContent || '';
  if (editIcon) editIcon.value = iconUrl;

  clearError(editError);
  const bookmarkLink = card.querySelector('.c-bookmark__link');
  openDialog(editDialog, bookmarkLink);
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
        icon: editIcon?.value || null,
      });
      editDialog.close();
      window.location.reload();
    } catch (err) {
      showError(editError, `Failed to update bookmark: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Delete bookmark (modal dialog instead of confirm())
// ---------------------------------------------------------------------------

const deleteDialog = document.querySelector('.js-delete-dialog');
const deleteMessage = document.querySelector('.js-delete-message');
const deleteUrlInput = document.querySelector('.js-delete-url');
const deleteConfirmBtn = document.querySelector('.js-delete-confirm');
const deleteCancelBtn = document.querySelectorAll('.js-delete-cancel');
const deleteError = document.querySelector('.js-delete-error');

for (const btn of deleteCancelBtn) {
  btn.addEventListener('click', () => closeDialog(deleteDialog));
}

document.addEventListener('click', (event) => {
  const deleteBtn = event.target.closest('.js-delete');
  if (!deleteBtn) return;

  const card = deleteBtn.closest('.c-bookmark');
  if (!card || !deleteDialog) return;

  const url = card.dataset.url || '';
  const titleEl = card.querySelector('.c-bookmark__title');
  const title = titleEl?.textContent || url;

  deleteMessage.textContent = `Are you sure you want to delete "${title}"?`;
  deleteUrlInput.value = url;
  clearError(deleteError);
  const bookmarkLink = card.querySelector('.c-bookmark__link');
  openDialog(deleteDialog, bookmarkLink);
});

if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', async () => {
    const url = deleteUrlInput.value;
    const slug = getPageSlug();

    try {
      await apiRequest('DELETE', slug, { url });
      closeDialog(deleteDialog);
      window.location.reload();
    } catch (err) {
      showError(deleteError, `Failed to delete bookmark: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Mobile drawers — hamburger menu + view options
// ---------------------------------------------------------------------------

const menuToggle = document.querySelector('.js-menu-toggle');
const menuDrawer = document.querySelector('.js-menu-drawer');
const viewMenuToggle = document.querySelector('.js-view-menu-toggle');
const viewDrawer = document.querySelector('.js-view-drawer');
const mainContent = document.getElementById('main-content');
const jumpLinks = document.querySelector('.c-jump-links');

function isDrawerOpen(drawer) {
  if (!drawer) return false;
  // View toolbar uses is-open class; menu drawer uses hidden attribute
  if (drawer.classList.contains('c-header__toolbar')) return drawer.classList.contains('is-open');
  return !drawer.hidden;
}

function openDrawer(drawer) {
  if (drawer.classList.contains('c-header__toolbar')) {
    drawer.classList.add('is-open');
  } else {
    drawer.hidden = false;
  }
}

function closeDrawerEl(drawer) {
  if (drawer.classList.contains('c-header__toolbar')) {
    drawer.classList.remove('is-open');
  } else {
    drawer.hidden = true;
  }
}

function closeDrawer(toggle, drawer) {
  closeDrawerEl(drawer);
  toggle?.setAttribute('aria-expanded', 'false');
}

function updateInert() {
  const anyOpen = isDrawerOpen(menuDrawer) || isDrawerOpen(viewDrawer);
  document.querySelector('.c-header')?.classList.toggle('is-drawer-open', anyOpen);

  // Make non-drawer content inert when a drawer is open
  if (mainContent) mainContent.inert = anyOpen;
  if (jumpLinks) jumpLinks.inert = anyOpen;
  const fab = document.querySelector('.c-fab');
  if (fab) fab.inert = anyOpen;
}

function toggleDrawer(toggle, drawer, otherToggle, otherDrawer) {
  const wasOpen = isDrawerOpen(drawer);

  // Close the other drawer first
  if (otherDrawer && isDrawerOpen(otherDrawer)) {
    closeDrawer(otherToggle, otherDrawer);
  }

  if (wasOpen) {
    closeDrawerEl(drawer);
  } else {
    openDrawer(drawer);
  }
  toggle.setAttribute('aria-expanded', String(!wasOpen));

  updateInert();

  if (!wasOpen) {
    // Drawer just opened — focus first focusable element inside
    const firstFocusable = drawer.querySelector('a, button, input, [tabindex="0"]');
    firstFocusable?.focus();
  } else {
    // Drawer just closed — return focus to the trigger
    toggle.focus();
  }
}

if (menuToggle && menuDrawer) {
  menuToggle.addEventListener('click', () => {
    toggleDrawer(menuToggle, menuDrawer, viewMenuToggle, viewDrawer);
  });
}

if (viewMenuToggle && viewDrawer) {
  viewMenuToggle.addEventListener('click', () => {
    toggleDrawer(viewMenuToggle, viewDrawer, menuToggle, menuDrawer);
  });
}

// Escape closes any open drawer
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (menuDrawer && isDrawerOpen(menuDrawer)) {
    closeDrawer(menuToggle, menuDrawer);
    updateInert();
    menuToggle?.focus();
  } else if (viewDrawer && isDrawerOpen(viewDrawer)) {
    closeDrawer(viewMenuToggle, viewDrawer);
    updateInert();
    viewMenuToggle?.focus();
  }
});

// Close drawers when a category link is clicked
for (const link of document.querySelectorAll('.js-drawer-category')) {
  link.addEventListener('click', () => {
    if (menuDrawer && isDrawerOpen(menuDrawer)) {
      closeDrawer(menuToggle, menuDrawer);
      updateInert();
    }
  });
}

// ---------------------------------------------------------------------------
// View preferences — per-page density × layout × color mode
// ---------------------------------------------------------------------------

const slug = getPageSlug();

function getViewPrefs() {
  try {
    const stored = localStorage.getItem(`homepage-md-view-${slug}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { density: 'detailed', layout: 'grid', colorMode: 'system' };
}

function saveViewPrefs(prefs) {
  try {
    localStorage.setItem(`homepage-md-view-${slug}`, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

function applyView(prefs) {
  document.body.classList.toggle('is-condensed', prefs.density === 'condensed');
  document.body.classList.toggle('is-columns', prefs.layout === 'columns');

  // Color mode
  document.body.classList.remove('is-light', 'is-dark');
  if (prefs.colorMode === 'light') document.body.classList.add('is-light');
  else if (prefs.colorMode === 'dark') document.body.classList.add('is-dark');

  // Sync toolbar button states
  for (const btn of document.querySelectorAll('.js-layout-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === prefs.layout));
  }
  for (const btn of document.querySelectorAll('.js-density-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === prefs.density));
  }
  for (const btn of document.querySelectorAll('.js-color-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === prefs.colorMode));
  }
}

// Initialize
const viewPrefs = getViewPrefs();
applyView(viewPrefs);

// Layout toggle buttons
for (const btn of document.querySelectorAll('.js-layout-btn')) {
  btn.addEventListener('click', () => {
    viewPrefs.layout = btn.dataset.value;
    saveViewPrefs(viewPrefs);
    applyView(viewPrefs);
  });
}

// Density toggle buttons
for (const btn of document.querySelectorAll('.js-density-btn')) {
  btn.addEventListener('click', () => {
    viewPrefs.density = btn.dataset.value;
    saveViewPrefs(viewPrefs);
    applyView(viewPrefs);
  });
}

// Color mode toggle buttons
for (const btn of document.querySelectorAll('.js-color-btn')) {
  btn.addEventListener('click', () => {
    viewPrefs.colorMode = btn.dataset.value;
    saveViewPrefs(viewPrefs);
    applyView(viewPrefs);
  });
}
