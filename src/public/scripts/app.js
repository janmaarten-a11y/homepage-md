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
let suppressSSEReload = false;

evtSource.addEventListener('message', (event) => {
  if (suppressSSEReload) return;
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'update') {
      window.location.reload();
    }
  } catch {
    // Ignore malformed events
  }
});

/**
 * Reload the page after a CRUD operation, suppressing the SSE-triggered
 * reload and optionally restoring focus to a specific bookmark.
 */
function reloadAfterEdit(focusUrl) {
  suppressSSEReload = true;
  if (focusUrl) {
    try { sessionStorage.setItem('homepage-md-focus', focusUrl); } catch { /* ignore */ }
  }
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Page data — shared by search bangs and comboboxes
// ---------------------------------------------------------------------------

const pageData = JSON.parse(document.getElementById('js-page-data')?.textContent || '{}');

// ---------------------------------------------------------------------------
// Focus restoration — after a CRUD reload, focus the edited bookmark
// ---------------------------------------------------------------------------

try {
  const focusUrl = sessionStorage.getItem('homepage-md-focus');
  if (focusUrl) {
    sessionStorage.removeItem('homepage-md-focus');
    const card = document.querySelector(`.c-bookmark[data-url="${CSS.escape(focusUrl)}"]`);
    if (card) {
      const link = card.querySelector('.c-bookmark__link');
      if (link) {
        // Scroll into view and focus after the page settles
        requestAnimationFrame(() => {
          link.focus({ preventScroll: true });
          card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        });
      }
    }
  }
} catch { /* ignore */ }

// ---------------------------------------------------------------------------
// Search — filter bookmarks on the current page
// ---------------------------------------------------------------------------

const searchInput = document.getElementById('js-search');
const searchEmpty = document.querySelector('.js-search-empty');
const searchStatus = document.getElementById('js-search-status');
const bangHint = document.querySelector('.js-bang-hint');
const searchShortcuts = document.querySelector('.c-search__shortcuts');
const bookmarks = document.querySelectorAll('.c-bookmark');
const categories = document.querySelectorAll('.c-category');
const subcategories = document.querySelectorAll('.c-subcategory');

let debounceTimer;
let activeBang = null;

// Load bangs from page data
const allBangs = (pageData.bangs || []).reduce((map, b) => {
  map[b.prefix.toLowerCase()] = b;
  return map;
}, {});

/**
 * Check if the search value starts with a bang prefix.
 * Returns { bang, query } or null.
 */
function matchBang(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('!')) return null;

  // Try to match "!prefix rest of query"
  const spaceIdx = trimmed.indexOf(' ');
  const prefix = spaceIdx > 0 ? trimmed.substring(0, spaceIdx) : trimmed;
  const query = spaceIdx > 0 ? trimmed.substring(spaceIdx + 1).trim() : '';
  const bang = allBangs[prefix.toLowerCase()];

  return bang ? { bang, query, prefix } : null;
}

function showBangHint(prefix, bang, query) {
  if (!bangHint) return;
  const name = extractBangName(bang.url);
  if (query) {
    bangHint.textContent = `Press Enter to search ${name} for \u201C${query}\u201D`;
  } else {
    bangHint.textContent = `${prefix} \u2192 ${name} \u2014 type your search query`;
  }
  bangHint.hidden = false;
}

function showBangList() {
  if (!bangHint) return;
  const entries = Object.values(allBangs);
  if (entries.length === 0) return;
  bangHint.textContent = entries.map((b) => `${b.prefix} ${extractBangName(b.url)}`).join('  \u00B7  ');
  bangHint.hidden = false;
}

function hideBangHint() {
  if (!bangHint) return;
  bangHint.textContent = '';
  bangHint.hidden = true;
}

function extractBangName(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    // Capitalize first letter
    return host.charAt(0).toUpperCase() + host.slice(1);
  } catch {
    return 'the web';
  }
}

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
    const value = searchInput.value;
    const match = matchBang(value);

    // Show/hide keyboard shortcut hints based on whether there's text
    if (searchShortcuts) searchShortcuts.hidden = value.length > 0;

    if (match) {
      // Bang detected — freeze bookmark filtering, show hint
      activeBang = match;
      hideBangHint();
      showBangHint(match.prefix, match.bang, match.query);
      searchEmpty.hidden = true;
      searchStatus.textContent = '';
    } else if (value.trim() === '!' && Object.keys(allBangs).length > 0) {
      // Just "!" typed — show available bangs
      activeBang = null;
      showBangList();
      searchEmpty.hidden = true;
      searchStatus.textContent = '';
    } else {
      // Normal bookmark search
      activeBang = null;
      hideBangHint();
      debounceTimer = setTimeout(() => filterBookmarks(value), 100);
    }
  });

  // Enter key: if a bang is active and there's a query, redirect
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && activeBang && activeBang.query) {
      event.preventDefault();
      const url = activeBang.bang.url.replace('%s', encodeURIComponent(activeBang.query));
      window.open(url, '_blank', 'noopener');
      // Clear the search after redirect
      searchInput.value = '';
      activeBang = null;
      hideBangHint();
      if (searchShortcuts) searchShortcuts.hidden = false;
      filterBookmarks('');
    }
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
    hideBangHint();
    if (searchShortcuts) searchShortcuts.hidden = false;
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
    card.querySelector('.js-copy-url'),
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
      reloadAfterEdit(formData.get('url'));
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
      reloadAfterEdit(editUrl.value || originalUrl);
    } catch (err) {
      showError(editError, `Failed to update bookmark: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Copy bookmark URL to clipboard
// ---------------------------------------------------------------------------

document.addEventListener('click', (event) => {
  const copyBtn = event.target.closest('.js-copy-url');
  if (!copyBtn) return;

  const card = copyBtn.closest('.c-bookmark');
  if (!card) return;

  const url = card.dataset.url || '';
  navigator.clipboard.writeText(url).then(() => {
    const origLabel = copyBtn.getAttribute('aria-label');
    const origHTML = copyBtn.innerHTML;

    // Swap to check icon + green color
    const checkIcon = pageData.weatherIcons?.['clipboard-check'];
    if (checkIcon) copyBtn.innerHTML = checkIcon;
    copyBtn.style.color = 'oklch(55% 0.2 145)';
    copyBtn.setAttribute('aria-label', 'Copied!');

    setTimeout(() => {
      copyBtn.innerHTML = origHTML;
      copyBtn.style.color = '';
      copyBtn.setAttribute('aria-label', origLabel);
      if (document.activeElement === copyBtn || document.activeElement === document.body) {
        copyBtn.focus();
      }
    }, 1500);
  });
});

// ---------------------------------------------------------------------------
// Delete bookmark (modal dialog)
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
  const deleteBtn = event.target.closest('.js-edit-delete');
  if (!deleteBtn) return;
  if (!editDialog || !deleteDialog) return;

  const url = editOriginalUrl.value;
  const title = editTitle.value || url;

  deleteMessage.textContent = `Are you sure you want to delete "${title}"?`;
  deleteUrlInput.value = url;
  clearError(deleteError);
  editDialog.close();
  openDialog(deleteDialog, null, deleteBtn);
});

if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', async () => {
    const url = deleteUrlInput.value;
    const slug = getPageSlug();

    try {
      await apiRequest('DELETE', slug, { url });
      closeDialog(deleteDialog);
      reloadAfterEdit();
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

  // Layout — remove all, then add the active one
  document.body.classList.remove('is-columns', 'is-list');
  if (prefs.layout !== 'grid') {
    document.body.classList.add(`is-${prefs.layout}`);
  }

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
let weatherCurrentLocation = '';
const weatherLabel = document.querySelector('.js-weather-label');
const weatherCurrent = document.querySelector('.js-weather-current');
const weatherAlerts = document.querySelector('.js-weather-alerts');
const weatherForecast = document.querySelector('.js-weather-forecast');

const WEATHER_ICONS = {
  'clear': 'sun',
  'partly-cloudy': 'cloud-sun',
  'cloudy': 'cloud',
  'fog': 'cloud-fog',
  'drizzle': 'cloud-drizzle',
  'rain': 'cloud-rain',
  'freezing': 'snowflake',
  'snow': 'cloud-snow',
  'thunderstorm': 'cloud-lightning',
};

/** Resolve a Lucide icon name to inline SVG, with emoji fallback. */
function wi(name, fallback = '') {
  return pageData.weatherIcons?.[name] || fallback;
}

function renderWeather(data) {
  if (!data || !weatherBtn) return;

  const locationName = data.location.region
    ? `${data.location.name}, ${data.location.region}`
    : data.location.name;
  weatherCurrentLocation = locationName;

  // Update the button with current temp and icon
  const iconName = WEATHER_ICONS[data.current.icon] || 'cloud-sun';
  const tempF = data.units.temp === '\u00B0F' ? data.current.temp : data.current.temp * 9 / 5 + 32;
  let btnIconName = iconName;
  if (tempF <= 25) btnIconName = 'snowflake';
  else if (tempF >= 85) btnIconName = 'thermometer';
  weatherIcon.innerHTML = wi(btnIconName, '\u2601\uFE0F');
  weatherLabel.textContent = `${data.current.temp}${data.units.temp}`;
  weatherBtn.disabled = false;
  weatherBtn.setAttribute('aria-label', `Weather for ${locationName}: ${data.current.temp}${data.units.temp}, ${data.current.condition}. Activate to show forecast.`);

  // Forecast link — national weather service based on country
  const forecastUrl = getForecastUrl(data.location);

  // AQI stat
  const aqiHtml = data.aqi
    ? `<div class="c-weather-panel__stat">
        <dt>${wi('haze', '\uD83C\uDF2B\uFE0F')} <a href="https://www.airnow.gov" rel="noopener">Air quality</a></dt>
        <dd><span class="c-weather-panel__aqi" data-level="${aqiLevel(data.aqi.value)}">${data.aqi.value}</span> ${escapeText(data.aqi.label)}</dd>
      </div>`
    : '';

  // NWS alerts
  let nwsHtml = '';
  if (data.nwsAlerts && data.nwsAlerts.length > 0) {
    nwsHtml = `<div class="c-weather-panel__nws-alerts">
${data.nwsAlerts.map((a) => {
  const link = a.url ? ` <a href="${escapeText(a.url)}" rel="noopener">Details \u2192</a>` : '';
  return `      <p class="c-weather-panel__nws-alert" data-severity="${escapeText(a.severity)}">${escapeText(a.headline)}${link}</p>`;
}).join('\n')}
    </div>`;
  }

  // Derived alerts
  let derivedHtml = '';
  if (data.alerts.length > 0) {
    derivedHtml = `<ul class="c-weather-panel__alert-list">
${data.alerts.map((a) => `      <li>${escapeText(a.text)}</li>`).join('\n')}
    </ul>`;
  }

  const alertsHtml = nwsHtml || derivedHtml
    ? nwsHtml + derivedHtml
    : `<p class="c-weather-panel__no-alerts">No notable weather changes expected.</p>`;

  // Moon hero — conditional display for full moon vs. upcoming
  let moonHero = '';
  if (data.moon) {
    if (data.moon.isFullMoon) {
      // It's a full moon now — celebrate it
      moonHero = `<div class="c-weather-panel__moon-hero">
        <p class="c-weather-panel__moon-label">${wi('moon', '\uD83C\uDF15')} ${escapeText(data.moon.fullMoonName || 'Full Moon')} tonight!</p>
        <p class="c-weather-panel__moon-date">${data.moon.illumination}% illuminated</p>
        <p class="c-weather-panel__astro-line">Next new moon \u2014 ${escapeText(data.moon.nextNewMoon)} (in ${data.moon.daysToNewMoon} days)</p>
      </div>`;
    } else {
      const fullMoonText = `${escapeText(data.moon.nextFullMoon)}`;
      const daysLabel = `<span class="c-weather-panel__astro-sub">in ${data.moon.daysToFullMoon} days</span>`;
      moonHero = `<div class="c-weather-panel__moon-hero">
        <p class="c-weather-panel__moon-label">Next full moon \u2014 ${escapeText(data.moon.fullMoonName || 'Full Moon')}</p>
        <p class="c-weather-panel__moon-date">${wi('moon', '\uD83C\uDF15')} ${fullMoonText} ${daysLabel}</p>
        <p class="c-weather-panel__astro-line">${escapeText(data.moon.phase)}, ${data.moon.illumination}% illuminated</p>
      </div>`;
    }
  }

  // Sun times
  const sunLine = data.today.sunrise && data.today.sunset
    ? `<p class="c-weather-panel__astro-line">${wi('sunrise', '\u2600\uFE0F')} Sunrise ${data.today.sunrise} \u00B7 ${wi('sunset', '\uD83C\uDF05')} Sunset ${data.today.sunset}</p>`
    : '';

  // Eclipse
  const eclipseLine = data.eclipse
    ? `<p class="c-weather-panel__astro-line">${wi('eclipse', '\uD83D\uDD2D')} Next eclipse \u2014 <a href="${escapeText(data.eclipse.url)}" rel="noopener">${escapeText(data.eclipse.type)}, ${escapeText(data.eclipse.date)}</a></p>`
    : '';

  // Aurora
  const auroraLine = data.aurora?.possible
    ? `<p class="c-weather-panel__astro-line c-weather-panel__aurora">${wi('moon-star', '\uD83C\uDF0C')} Aurora possible${data.aurora.hoursAway > 0 ? ` in ~${data.aurora.hoursAway}h` : ''} (Kp ${data.aurora.kp}) \u2014 <a href="${escapeText(data.aurora.url)}" rel="noopener">Forecast</a></p>`
    : '';

  // Tomorrow
  const tomorrowHtml = `<div class="c-weather-panel__tomorrow">
    <strong>Tomorrow</strong> \u2014 ${escapeText(data.tomorrow.condition)},
    ${data.tomorrow.high}\u00B0 / ${data.tomorrow.low}\u00B0${data.tomorrow.precipChance > 0 ? `, ${data.tomorrow.precipChance}% precip` : ''}
  </div>`;

  const editLocationIcon = wi('pencil', '&#9998;');

  // Left column: heading + conditions + alerts
  weatherCurrent.innerHTML = `
    <div class="c-weather-panel__heading">
      <h2 class="c-weather-panel__location">Forecast for <a href="${forecastUrl}" rel="noopener">${escapeText(locationName)}</a></h2>
      <button type="button" class="c-btn c-btn--icon c-weather-panel__edit-btn js-location-edit" aria-label="Edit location">${editLocationIcon}</button>
    </div>
    <div class="c-weather-panel__summary">
      <span class="c-weather-panel__temp">${data.current.temp}${data.units.temp}</span>
      <span class="c-weather-panel__condition">${escapeText(data.current.condition)}</span>
    </div>
    <dl class="c-weather-panel__details">
      <div class="c-weather-panel__stat"><dt>${wi('thermometer', '\uD83C\uDF21\uFE0F')} Feels like</dt><dd>${data.current.feelsLike}${data.units.temp}</dd></div>
      <div class="c-weather-panel__stat"><dt>${wi('arrow-up-down', '\u2195\uFE0F')} High / Low</dt><dd>${data.today.high}\u00B0 / ${data.today.low}\u00B0</dd></div>
      <div class="c-weather-panel__stat"><dt>${wi('wind', '\uD83D\uDCA8')} Wind</dt><dd>${data.current.wind} ${data.units.wind}</dd></div>
${aqiHtml}
    </dl>
${alertsHtml}`;

  // Right column: moon hero → sun → tomorrow
  weatherAlerts.innerHTML = '';
  weatherForecast.innerHTML = `
    <div class="c-weather-panel__sidebar">
      <div class="c-weather-panel__astro-section">
${moonHero}
${sunLine}
${eclipseLine}
${auroraLine}
      </div>
${tomorrowHtml}
    </div>`;
}

function aqiLevel(value) {
  if (value <= 50) return 'good';
  if (value <= 100) return 'moderate';
  if (value <= 150) return 'sensitive';
  if (value <= 200) return 'unhealthy';
  if (value <= 300) return 'very-unhealthy';
  return 'hazardous';
}

function getForecastUrl(location) {
  const { latitude, longitude, countryCode, name } = location;
  const ll = latitude && longitude;

  const nationalServices = {
    US: ll ? `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}` : 'https://www.weather.gov',
    CA: 'https://weather.gc.ca',
    GB: 'https://www.metoffice.gov.uk/weather/forecast',
    FR: 'https://meteofrance.com',
    DE: 'https://www.dwd.de/DE/wetter/vorhersage_aktuell/vorhersage_aktuell_node.html',
    NO: ll ? `https://www.yr.no/en/forecast/daily-table/${latitude},${longitude}` : 'https://www.yr.no',
    SE: 'https://www.smhi.se/vader',
    FI: 'https://www.ilmatieteenlaitos.fi/saa',
    DK: 'https://www.dmi.dk/vejrarkiv/',
    NL: 'https://www.knmi.nl/nederland-nu/weer/verwachtingen',
    JP: 'https://www.jma.go.jp/bosai/forecast/',
    AU: 'https://www.bom.gov.au',
    IE: 'https://www.met.ie/forecasts',
    IS: 'https://vedur.is',
    IT: 'https://www.meteoam.it',
    ES: 'https://www.aemet.es',
    PT: 'https://www.ipma.pt',
    CN: 'https://weather.cma.cn',
    IN: 'https://mausam.imd.gov.in',
    IL: 'https://ims.gov.il',
    HK: 'https://www.hko.gov.hk',
    TW: 'https://www.cwa.gov.tw',
    PH: 'https://www.pagasa.dost.gov.ph',
    ID: 'https://www.bmkg.go.id',
    MN: 'https://www.weather.gov.mn',
    TR: 'https://www.mgm.gov.tr',
  };

  if (countryCode && nationalServices[countryCode]) {
    return nationalServices[countryCode];
  }

  // Fallback: wttr.in works globally
  return `https://wttr.in/${encodeURIComponent(name)}`;
}

function escapeText(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

if (weatherBtn && weatherPanel) {
  const weatherStorageKey = `homepage-md-weather-${getPageSlug()}`;

  // Toggle panel
  weatherBtn.addEventListener('click', () => {
    const isOpen = !weatherPanel.hidden;
    weatherPanel.hidden = isOpen;
    weatherBtn.setAttribute('aria-expanded', String(!isOpen));
    localStorage.setItem(weatherStorageKey, String(!isOpen));
  });

  // Close on focusin outside
  document.addEventListener('focusin', (event) => {
    if (!weatherPanel.hidden) {
      if (!weatherPanel.contains(event.target) && !weatherBtn.contains(event.target)) {
        weatherPanel.hidden = true;
        weatherBtn.setAttribute('aria-expanded', 'false');
        localStorage.setItem(weatherStorageKey, 'false');
      }
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !weatherPanel.hidden) {
      weatherPanel.hidden = true;
      weatherBtn.setAttribute('aria-expanded', 'false');
      localStorage.setItem(weatherStorageKey, 'false');
      weatherBtn.focus();
    }
  });

  // Fetch weather data
  const slug = getPageSlug();
  fetch(`/api/weather/${encodeURIComponent(slug)}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data) {
        showWeatherError();
        return;
      }
      renderWeather(data);
      // Restore panel open state from localStorage
      if (localStorage.getItem(weatherStorageKey) === 'true') {
        weatherPanel.hidden = false;
        weatherBtn.setAttribute('aria-expanded', 'true');
      }
    })
    .catch(() => {
      showWeatherError();
    });

  function showWeatherError() {
    weatherIcon.textContent = '\u26A0\uFE0F';
    weatherLabel.textContent = 'Unavailable';
    weatherBtn.disabled = false;
    weatherBtn.setAttribute('aria-label', 'Weather data unavailable. Activate to retry.');
    weatherBtn.addEventListener('click', () => {
      window.location.reload();
    }, { once: true });
  }

  // Edit location dialog
  const locationDialog = document.querySelector('.js-location-dialog');
  const locationForm = document.querySelector('.js-location-form');
  const locationInput = document.querySelector('.js-location-input');
  const locationCancel = document.querySelector('.js-location-cancel');

  if (locationDialog && locationForm && locationInput) {
    // Open dialog when pencil button is clicked (delegated since it's injected)
    weatherPanel.addEventListener('click', (event) => {
      const editBtn = event.target.closest('.js-location-edit');
      if (!editBtn) return;
      locationInput.value = weatherCurrentLocation || '';
      openDialog(locationDialog, editBtn);
    });

    if (locationCancel) {
      locationCancel.addEventListener('click', () => closeDialog(locationDialog));
    }

    locationForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newLocation = locationInput.value.trim();
      if (!newLocation) return;

      try {
        const res = await fetch(`/api/location/${encodeURIComponent(getPageSlug())}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HomepageMD' },
          body: JSON.stringify({ location: newLocation }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        locationDialog.close();
        reloadAfterEdit();
      } catch (err) {
        // Show error inline (reuse dialog pattern)
        locationInput.setCustomValidity(err.message);
        locationInput.reportValidity();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Speed test — on-demand via Cloudflare endpoints
// ---------------------------------------------------------------------------

const speedBtn = document.querySelector('.js-speed-test');
const speedLabel = document.querySelector('.js-speed-label');

if (speedBtn && speedLabel) {
  let testing = false;

  // Restore last result from sessionStorage
  const lastResult = sessionStorage.getItem('homepage-md-speed');
  if (lastResult) {
    try {
      const saved = JSON.parse(lastResult);
      showSpeedResult(saved.down, saved.up);
    } catch { /* ignore */ }
  }

  speedBtn.addEventListener('click', async () => {
    if (testing) return;
    testing = true;
    speedBtn.disabled = true;

    try {
      // Download test
      updateSpeedLabel('Testing \u2193\u2026', 'Measuring download speed');
      const down = await measureDownload();

      // Upload test
      updateSpeedLabel(`\u2193 ${down} \u2022 Testing \u2191\u2026`, 'Measuring upload speed');
      const up = await measureUpload();

      // Show result
      showSpeedResult(down, up);
      sessionStorage.setItem('homepage-md-speed', JSON.stringify({ down, up }));
    } catch {
      updateSpeedLabel('Test failed', 'Speed test failed. Try again.');
    } finally {
      testing = false;
      speedBtn.disabled = false;
    }
  });

  function updateSpeedLabel(text, ariaLabel) {
    speedLabel.textContent = text;
    if (ariaLabel) {
      speedBtn.setAttribute('aria-label', ariaLabel);
    } else {
      speedBtn.removeAttribute('aria-label');
    }
  }

  function showSpeedResult(down, up) {
    speedLabel.textContent = `\u2193 ${down} \u2191 ${up}`;
    speedBtn.setAttribute('aria-label', `Speed test result: ${down} megabits per second download, ${up} megabits per second upload. Activate to test again.`);
  }

  function formatSpeed(mbps) {
    const val = parseFloat(mbps);
    if (val < 1) return val.toFixed(1);
    return Math.round(val).toString();
  }

  async function measureDownload() {
    const bytes = 10_000_000; // 10 MB
    const start = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
      cache: 'no-store',
    });
    await res.arrayBuffer();
    const elapsed = (performance.now() - start) / 1000;
    return formatSpeed((bytes * 8) / elapsed / 1_000_000);
  }

  async function measureUpload() {
    const bytes = 2_000_000; // 2 MB
    const blob = new Blob([new ArrayBuffer(bytes)]);
    const start = performance.now();
    await fetch('https://speed.cloudflare.com/__up', {
      method: 'POST',
      body: blob,
      cache: 'no-store',
    });
    const elapsed = (performance.now() - start) / 1000;
    return formatSpeed((bytes * 8) / elapsed / 1_000_000);
  }
}
