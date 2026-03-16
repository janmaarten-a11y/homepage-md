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
const dialogTargetBtns = new WeakMap();

function openDialog(dialog, opener, targetBtn) {
  if (!dialog) return;
  dialogOpeners.set(dialog, opener || document.activeElement);
  if (targetBtn) dialogTargetBtns.set(dialog, targetBtn);
  dialog.showModal();
  const closeBtn = dialog.querySelector('.c-dialog__close');
  if (closeBtn) closeBtn.focus();
}

function returnFocus(dialog) {
  const opener = dialogOpeners.get(dialog);
  const targetBtn = dialogTargetBtns.get(dialog);
  if (opener && typeof opener.focus === 'function') {
    // Focus the link first to trigger :focus-within (makes action buttons visible)
    opener.focus();
    if (targetBtn) {
      // Then shift focus to the specific button once it's visible
      requestAnimationFrame(() => targetBtn.focus());
    }
  }
  dialogOpeners.delete(dialog);
  dialogTargetBtns.delete(dialog);
}

function closeDialog(dialog) {
  if (!dialog) return;
  dialog.close();
  // focus return handled by the 'close' event listener below
}

async function apiRequest(method, slug, body) {
  const res = await fetch(`/api/bookmarks/${encodeURIComponent(slug)}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HomepageMD' },
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
      if (addUrlInput && !addUrlInput.value) addUrlInput.value = 'https://';
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
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HomepageMD' },
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
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HomepageMD' },
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
  const categoryName = card.dataset.category || '';
  const subcategoryName = card.dataset.subcategory || '';
  const titleEl = card.querySelector('.c-bookmark__title');
  const descEl = card.querySelector('.c-bookmark__description');

  editOriginalUrl.value = url;
  editUrl.value = url;
  editTitle.value = titleEl?.textContent || '';
  editDescription.value = descEl?.textContent || '';
  if (editIcon) editIcon.value = iconUrl;
  const editCategory = editDialog.querySelector('.js-edit-category');
  const editSubcategory = editDialog.querySelector('.js-edit-subcategory');
  if (editCategory) editCategory.value = categoryName;
  if (editSubcategory) editSubcategory.value = subcategoryName;
  editDialog.dataset.originalCategory = categoryName;
  editDialog.dataset.originalSubcategory = subcategoryName;

  clearError(editError);
  const bookmarkLink = card.querySelector('.c-bookmark__link');
  openDialog(editDialog, bookmarkLink, editBtn);
});

if (editForm) {
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const slug = getPageSlug();
    const originalUrl = editOriginalUrl.value;

    try {
      const editCategoryVal = editDialog.querySelector('.js-edit-category')?.value || '';
      const editSubcategoryVal = editDialog.querySelector('.js-edit-subcategory')?.value || '';
      const categoryChanged = editCategoryVal !== (editDialog.dataset.originalCategory || '')
        || editSubcategoryVal !== (editDialog.dataset.originalSubcategory || '');
      await apiRequest('PUT', slug, {
        url: originalUrl,
        title: editTitle.value,
        newUrl: editUrl.value !== originalUrl ? editUrl.value : undefined,
        description: editDescription.value || null,
        icon: editIcon?.value || null,
        category: categoryChanged ? editCategoryVal : undefined,
        subcategory: categoryChanged ? (editSubcategoryVal || undefined) : undefined,
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
  openDialog(deleteDialog, bookmarkLink, deleteBtn);
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
// Popovers — view options + TOC (desktop), drawers (mobile)
// ---------------------------------------------------------------------------

const menuToggle = document.querySelector('.js-menu-toggle');
const menuDrawer = document.querySelector('.js-menu-drawer');
const viewToggle = document.querySelector('.js-view-toggle');
const viewPopover = document.querySelector('.js-view-popover');
const tocToggle = document.querySelector('.js-toc-toggle');
const tocPopover = document.querySelector('.js-toc-popover');
const mainContent = document.getElementById('main-content');

// --- Popover helpers (desktop) ---

function closePopover(toggle, popover) {
  if (!popover) return;
  popover.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

function openPopover(toggle, popover) {
  if (!popover) return;
  popover.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  const firstFocusable = popover.querySelector('a, button, input, [tabindex="0"]');
  firstFocusable?.focus();
}

function isPopoverOpen(popover) {
  return popover && !popover.hidden;
}

function togglePopover(toggle, popover) {
  if (isPopoverOpen(popover)) {
    closePopover(toggle, popover);
    toggle?.focus();
  } else {
    // Close other popovers first
    if (isPopoverOpen(viewPopover) && popover !== viewPopover) closePopover(viewToggle, viewPopover);
    if (isPopoverOpen(tocPopover) && popover !== tocPopover) closePopover(tocToggle, tocPopover);
    openPopover(toggle, popover);
  }
}

if (viewToggle && viewPopover) {
  viewToggle.addEventListener('click', () => togglePopover(viewToggle, viewPopover));
}

if (tocToggle && tocPopover) {
  tocToggle.addEventListener('click', () => togglePopover(tocToggle, tocPopover));
}

// Close TOC popover when a link is clicked
for (const link of document.querySelectorAll('.js-toc-link')) {
  link.addEventListener('click', () => {
    closePopover(tocToggle, tocPopover);
  });
}

// Close popovers on click outside
document.addEventListener('click', (event) => {
  if (viewPopover && isPopoverOpen(viewPopover)) {
    if (!viewPopover.contains(event.target) && !viewToggle.contains(event.target)) {
      closePopover(viewToggle, viewPopover);
    }
  }
  if (tocPopover && isPopoverOpen(tocPopover)) {
    if (!tocPopover.contains(event.target) && !tocToggle.contains(event.target)) {
      closePopover(tocToggle, tocPopover);
    }
  }
});

// Close popovers when tabbing out
document.addEventListener('focusin', (event) => {
  if (viewPopover && isPopoverOpen(viewPopover)) {
    if (!viewPopover.contains(event.target) && !viewToggle.contains(event.target)) {
      closePopover(viewToggle, viewPopover);
    }
  }
  if (tocPopover && isPopoverOpen(tocPopover)) {
    if (!tocPopover.contains(event.target) && !tocToggle.contains(event.target)) {
      closePopover(tocToggle, tocPopover);
    }
  }
});

// --- Mobile drawer helpers ---

function isDrawerOpen(drawer) {
  return drawer && !drawer.hidden;
}

function openDrawer(drawer) {
  drawer.hidden = false;
}

function closeDrawerEl(drawer) {
  drawer.hidden = true;
}

function closeDrawer(toggle, drawer) {
  closeDrawerEl(drawer);
  toggle?.setAttribute('aria-expanded', 'false');
}

function updateInert() {
  const anyOpen = isDrawerOpen(menuDrawer);
  document.querySelector('.c-header')?.classList.toggle('is-drawer-open', anyOpen);
  if (mainContent) mainContent.inert = anyOpen;
  const fab = document.querySelector('.c-fab');
  if (fab) fab.inert = anyOpen;
}

function toggleMobileDrawer(toggle, drawer) {
  const wasOpen = isDrawerOpen(drawer);

  if (wasOpen) {
    closeDrawerEl(drawer);
  } else {
    openDrawer(drawer);
  }
  toggle.setAttribute('aria-expanded', String(!wasOpen));
  updateInert();

  if (!wasOpen) {
    const firstFocusable = drawer.querySelector('a, button, input, [tabindex="0"]');
    firstFocusable?.focus();
  } else {
    toggle.focus();
  }
}

if (menuToggle && menuDrawer) {
  menuToggle.addEventListener('click', () => toggleMobileDrawer(menuToggle, menuDrawer));
}

// Escape closes any open popover or drawer
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  if (isPopoverOpen(viewPopover)) {
    closePopover(viewToggle, viewPopover);
    viewToggle?.focus();
    return;
  }
  if (isPopoverOpen(tocPopover)) {
    closePopover(tocToggle, tocPopover);
    tocToggle?.focus();
    return;
  }
  if (menuDrawer && isDrawerOpen(menuDrawer)) {
    closeDrawer(menuToggle, menuDrawer);
    updateInert();
    menuToggle?.focus();
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

// ---------------------------------------------------------------------------
// ARIA Combobox — filtered autocomplete for category/subcategory fields
// ---------------------------------------------------------------------------

const pageData = JSON.parse(document.getElementById('js-page-data')?.textContent || '{}');
const allCategories = (pageData.categories || []).map((c) => ({ label: c, value: c }));
const allSubcategoryPairs = (pageData.subcategories || []).map((s) => ({
  label: `${s.category} > ${s.subcategory}`,
  value: s.subcategory,
}));

function initCombobox(input, listbox, options, { onSelect } = {}) {
  if (!input || !listbox) return;

  let activeIndex = -1;

  function renderOptions(filter) {
    const term = filter.toLowerCase().trim();
    const matches = options.filter((o) =>
      o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)
    );
    const isNew = term && !options.some((o) => o.value.toLowerCase() === term);

    listbox.innerHTML = '';
    activeIndex = -1;

    matches.forEach((opt, i) => {
      const li = document.createElement('li');
      li.textContent = opt.label;
      li.dataset.value = opt.value;
      li.className = 'c-combobox__option';
      li.setAttribute('role', 'option');
      li.id = `${listbox.id}-opt-${i}`;
      li.addEventListener('click', () => selectOption(opt.value));
      listbox.appendChild(li);
    });

    if (isNew) {
      const li = document.createElement('li');
      li.textContent = `Create "${filter.trim()}"`;
      li.dataset.value = filter.trim();
      li.className = 'c-combobox__option c-combobox__option--new';
      li.setAttribute('role', 'option');
      li.id = `${listbox.id}-opt-new`;
      li.addEventListener('click', () => selectOption(filter.trim()));
      listbox.appendChild(li);
    }

    const hasItems = listbox.children.length > 0;
    listbox.hidden = !hasItems || !term;
    input.setAttribute('aria-expanded', String(!listbox.hidden));
  }

  function selectOption(value) {
    input.value = value;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (onSelect) onSelect(value);
    input.focus();
  }

  function setActive(index) {
    const items = listbox.querySelectorAll('[role="option"]');
    items.forEach((item) => item.removeAttribute('aria-selected'));
    if (index >= 0 && index < items.length) {
      activeIndex = index;
      items[index].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', items[index].id);
      items[index].scrollIntoView({ block: 'nearest' });
    } else {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }
  }

  input.addEventListener('input', () => renderOptions(input.value));
  input.addEventListener('focus', () => { if (input.value) renderOptions(input.value); });

  input.addEventListener('keydown', (event) => {
    const items = listbox.querySelectorAll('[role="option"]');
    if (!items.length || listbox.hidden) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const selected = items[activeIndex];
      if (selected) selectOption(selected.dataset.value || selected.textContent);
    } else if (event.key === 'Escape') {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
  });

  // Close listbox when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.c-combobox') || !input.contains(event.target)) {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
  });
}

// Helper: find the parent category for a subcategory
function findCategoryForSubcategory(subcategoryName) {
  const pair = (pageData.subcategories || []).find((s) => s.subcategory === subcategoryName);
  return pair ? pair.category : null;
}

// Initialize all comboboxes
initCombobox(
  document.querySelector('.js-add-category'),
  document.querySelector('.js-add-category-listbox'),
  allCategories
);
initCombobox(
  document.querySelector('.js-add-subcategory'),
  document.querySelector('.js-add-subcategory-listbox'),
  allSubcategoryPairs,
  {
    onSelect(value) {
      const cat = findCategoryForSubcategory(value);
      const catInput = document.querySelector('.js-add-category');
      if (cat && catInput) catInput.value = cat;
    },
  }
);
initCombobox(
  document.querySelector('.js-edit-category'),
  document.querySelector('.js-edit-category-listbox'),
  allCategories
);
initCombobox(
  document.querySelector('.js-edit-subcategory'),
  document.querySelector('.js-edit-subcategory-listbox'),
  allSubcategoryPairs,
  {
    onSelect(value) {
      const cat = findCategoryForSubcategory(value);
      const catInput = document.querySelector('.js-edit-category');
      if (cat && catInput) catInput.value = cat;
    },
  }
);

// ---------------------------------------------------------------------------
// Weather widget
// ---------------------------------------------------------------------------

const weatherBtn = document.querySelector('.js-weather-toggle');
const weatherPanel = document.querySelector('.js-weather-panel');
const weatherIcon = document.querySelector('.js-weather-icon');
const weatherLabel = document.querySelector('.js-weather-label');
const weatherCurrent = document.querySelector('.js-weather-current');
const weatherAlerts = document.querySelector('.js-weather-alerts');
const weatherForecast = document.querySelector('.js-weather-forecast');

const WEATHER_ICONS = {
  'clear': '\u2600\uFE0F',
  'partly-cloudy': '\u26C5',
  'cloudy': '\u2601\uFE0F',
  'fog': '\uD83C\uDF2B\uFE0F',
  'drizzle': '\uD83C\uDF26\uFE0F',
  'rain': '\uD83C\uDF27\uFE0F',
  'freezing': '\uD83E\uDDCA',
  'snow': '\u2744\uFE0F',
  'thunderstorm': '\u26C8\uFE0F',
};

function renderWeather(data) {
  if (!data || !weatherBtn) return;

  // Show the button with current temp and icon
  const icon = WEATHER_ICONS[data.current.icon] || '\uD83C\uDF24\uFE0F';
  weatherIcon.textContent = icon;
  weatherLabel.textContent = `${data.current.temp}${data.units.temp}`;
  weatherBtn.hidden = false;
  weatherBtn.setAttribute('aria-label', `Weather: ${data.current.temp}${data.units.temp}, ${data.current.condition}. Activate to show forecast.`);

  // Current conditions
  weatherCurrent.innerHTML = `
    <div class="c-weather-panel__summary">
      <span class="c-weather-panel__temp">${data.current.temp}${data.units.temp}</span>
      <span class="c-weather-panel__condition">${escapeText(data.current.condition)}</span>
    </div>
    <dl class="c-weather-panel__details">
      <div><dt>Feels like</dt><dd>${data.current.feelsLike}${data.units.temp}</dd></div>
      <div><dt>Wind</dt><dd>${data.current.wind} ${data.units.wind}</dd></div>
      <div><dt>Today</dt><dd>${data.today.high}° / ${data.today.low}°</dd></div>
      <div><dt>Tomorrow</dt><dd>${data.tomorrow.high}° / ${data.tomorrow.low}°</dd></div>
    </dl>`;

  // Alerts
  if (data.alerts.length > 0) {
    weatherAlerts.innerHTML = `<ul class="c-weather-panel__alert-list">
${data.alerts.map((a) => `      <li>${escapeText(a.text)}</li>`).join('\n')}
    </ul>`;
  } else {
    weatherAlerts.innerHTML = `<p class="c-weather-panel__no-alerts">No notable weather changes expected.</p>`;
  }

  // Tomorrow's forecast
  weatherForecast.innerHTML = `
    <div class="c-weather-panel__day">
      <strong>Tomorrow</strong> — ${escapeText(data.tomorrow.condition)},
      ${data.tomorrow.high}° / ${data.tomorrow.low}°${data.tomorrow.precipChance > 0 ? `, ${data.tomorrow.precipChance}% chance of precipitation` : ''}
    </div>`;
}

function escapeText(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

if (weatherBtn && weatherPanel) {
  // Toggle panel
  weatherBtn.addEventListener('click', () => {
    const isOpen = !weatherPanel.hidden;
    weatherPanel.hidden = !isOpen ? false : true;
    weatherPanel.hidden = isOpen;
    weatherBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Close on focusin outside
  document.addEventListener('focusin', (event) => {
    if (!weatherPanel.hidden) {
      if (!weatherPanel.contains(event.target) && !weatherBtn.contains(event.target)) {
        weatherPanel.hidden = true;
        weatherBtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // Fetch weather data
  const slug = getPageSlug();
  fetch(`/api/weather/${encodeURIComponent(slug)}`)
    .then((res) => res.json())
    .then((data) => renderWeather(data))
    .catch(() => {});
}
