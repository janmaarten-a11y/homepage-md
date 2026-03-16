/**
 * HTML renderer for HomepageMD.
 *
 * Generates complete HTML pages from parsed bookmark data.
 * Server-rendered MPA — each route gets a fully formed HTML document.
 */

/**
 * Render a full HTML page for a set of parsed bookmark data.
 *
 * @param {object} pageData - Output of parseMarkdown()
 * @param {object} options
 * @param {Array<{name: string, slug: string}>} options.pages - All available pages for nav
 * @param {string} options.currentSlug - The active page slug
 * @param {object} options.faviconUrls - Map of bookmark URL → resolved favicon path
 * @returns {string} Complete HTML document
 */
export function renderPage(pageData, { pages, currentSlug, faviconUrls, defaultPage }) {
  const title = pageData.title || 'HomepageMD';
  const nav = renderNav(pages, currentSlug, defaultPage);
  const jumpLinks = renderJumpLinks(pageData.categories);
  const main = renderMain(pageData, faviconUrls);
  const categories = pageData.categories.map((c) => c.name);
  const subcategoryNames = pageData.categories.flatMap((c) => c.subcategories.map((s) => s.name));

  const search = renderSearch();
  const addBtn = renderAddButton();
  const toolbar = renderToolbar();
  const addDialog = renderAddDialog(categories, subcategoryNames, currentSlug);
  const deleteDialog = renderDeleteDialog();
  const keyboardHelp = renderKeyboardHelp();

  const iconMenu = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>';
  const iconSettings = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="2.5"/><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4"/></svg>';
  const iconPlus = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — HomepageMD</title>
  <link rel="preconnect" href="https://fonts.bunny.net">
  <link rel="stylesheet" href="https://fonts.bunny.net/css?family=inter:400,500,600,700">
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/custom.css">
</head>
<body data-slug="${escapeAttr(currentSlug)}">
  <noscript><p class="c-noscript">This dashboard requires JavaScript for search, editing, and view options. Bookmarks are still visible below.</p></noscript>
  <a href="#main-content" class="c-skip-link">Skip to content</a>
  <header class="c-header">
    <div class="c-header__top">
      <button type="button" class="c-header__menu-btn js-menu-toggle" aria-expanded="false" aria-controls="js-menu-drawer" aria-label="Menu">${iconMenu}</button>
      <h1 class="c-header__title">${escapeHtml(title)}</h1>
      <button type="button" class="c-header__view-btn js-view-menu-toggle" aria-expanded="false" aria-controls="js-view-drawer" aria-label="View options">${iconSettings}</button>
${nav}
${search}
    </div>
    <div class="c-header__toolbar js-view-drawer" id="js-view-drawer">
${addBtn}
${toolbar}
    </div>
  </header>
  <aside class="c-drawer js-menu-drawer" id="js-menu-drawer" hidden>
    <nav class="c-drawer__nav" aria-label="Pages">
${pages.length > 1 ? pages.map((p) => {
    const ariaCurrent = p.slug === currentSlug ? ' aria-current="page"' : '';
    return `      <a href="/${encodeURIComponent(p.slug)}" class="c-drawer__link"${ariaCurrent}>${escapeHtml(p.name)}</a>`;
  }).join('\n') : ''}
    </nav>
${pageData.categories.length > 1 ? `    <nav class="c-drawer__categories" aria-label="Categories">
${pageData.categories.map((cat) => `      <a href="#${escapeAttr(cat.id)}" class="c-drawer__link js-drawer-category">${escapeHtml(cat.name)}</a>`).join('\n')}
    </nav>` : ''}
  </aside>
${jumpLinks}
  <main id="main-content">
${main}
  </main>
  <button type="button" class="c-fab js-add-open">${iconPlus} <span class="c-fab__label">Add link</span></button>
  <p class="c-search-empty js-search-empty" hidden>No bookmarks match your search.</p>
  <div class="u-visually-hidden" aria-live="polite" id="js-search-status"></div>
${addDialog}
  <dialog class="c-dialog js-edit-dialog">
    <form method="dialog" class="c-dialog__form js-edit-form">
      <div class="c-dialog__header">
        <h2 class="c-dialog__title">Edit Bookmark</h2>
        <button type="button" class="c-btn c-btn--icon c-dialog__close js-edit-cancel" aria-label="Close">&times;</button>
      </div>
      <div class="c-dialog__error js-edit-error" role="alert" hidden></div>
      <input type="hidden" name="originalUrl" class="js-edit-original-url">
      <label class="c-dialog__label">
        URL
        <input type="url" name="url" class="c-dialog__input js-edit-url" required>
      </label>
      <button type="button" class="c-btn c-btn--small js-edit-fetch-meta">Fetch title &amp; description</button>
      <label class="c-dialog__label">
        Title
        <input type="text" name="title" class="c-dialog__input js-edit-title" required>
      </label>
      <label class="c-dialog__label">
        Description <span class="c-dialog__hint">(max 160 characters)</span>
        <input type="text" name="description" class="c-dialog__input js-edit-description" maxlength="160">
      </label>
      <label class="c-dialog__label" id="edit-category-label">
        Category
        <div class="c-combobox">
          <input type="text" name="category" class="c-dialog__input c-combobox__input js-edit-category" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="js-edit-category-listbox" aria-labelledby="edit-category-label" autocomplete="off" required>
          <ul class="c-combobox__listbox js-edit-category-listbox" id="js-edit-category-listbox" role="listbox" hidden></ul>
          <span class="c-combobox__hint js-combobox-hint" hidden></span>
        </div>
      </label>
      <label class="c-dialog__label" id="edit-subcategory-label">
        Subcategory <span class="c-dialog__hint">(optional)</span>
        <div class="c-combobox">
          <input type="text" name="subcategory" class="c-dialog__input c-combobox__input js-edit-subcategory" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="js-edit-subcategory-listbox" aria-labelledby="edit-subcategory-label" autocomplete="off">
          <ul class="c-combobox__listbox js-edit-subcategory-listbox" id="js-edit-subcategory-listbox" role="listbox" hidden></ul>
          <span class="c-combobox__hint js-combobox-hint" hidden></span>
        </div>
      </label>
      <label class="c-dialog__label">
        Icon URL <span class="c-dialog__hint">(optional)</span>
        <input type="url" name="icon" class="c-dialog__input js-edit-icon" placeholder="https://…">
      </label>
      <div class="c-dialog__actions">
        <button type="submit" class="c-btn c-btn--primary">Save</button>
      </div>
    </form>
  </dialog>
${deleteDialog}
${keyboardHelp}
  <script id="js-page-data" type="application/json">${JSON.stringify({ categories: categories, subcategories: [...new Set(subcategoryNames)] })}</script>
  <script src="/scripts/app.js" type="module"></script>
</body>
</html>`;
}

function renderSearch() {
  return `    <search class="c-search">
      <label for="js-search" class="u-visually-hidden">Search bookmarks</label>
      <div class="c-search__wrap">
        <input type="search" id="js-search" class="c-search__input" placeholder="Search bookmarks…" autocomplete="off">
        <kbd class="c-search__shortcut" aria-hidden="true">/</kbd>
      </div>
    </search>`;
}

function renderAddButton() {
  return `    <button type="button" class="c-btn c-btn--primary js-add-open" aria-label="Add link">+ Add link</button>`;
}

function renderToolbar() {
  // Inline SVG icons (16×16, currentColor)
  const iconGrid = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>';
  const iconColumns = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="14" rx="1"/><rect x="11" y="1" width="4" height="14" rx="1"/></svg>';
  const iconDetailed = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="3" x2="15" y2="3"/><line x1="1" y1="6" x2="10" y2="6"/><line x1="1" y1="10" x2="15" y2="10"/><line x1="1" y1="13" x2="10" y2="13"/></svg>';
  const iconCondensed = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="3" x2="15" y2="3"/><line x1="1" y1="7" x2="15" y2="7"/><line x1="1" y1="11" x2="15" y2="11"/></svg>';
  const iconSun = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="3.05" y1="3.05" x2="4.46" y2="4.46"/><line x1="11.54" y1="11.54" x2="12.95" y2="12.95"/><line x1="3.05" y1="12.95" x2="4.46" y2="11.54"/><line x1="11.54" y1="4.46" x2="12.95" y2="3.05"/></svg>';
  const iconMoon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 8.5a5.5 5.5 0 0 1-6-6 5.5 5.5 0 1 0 6 6z"/></svg>';
  const iconSystem = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="9" rx="1.5"/><line x1="5" y1="14" x2="11" y2="14"/><line x1="8" y1="11" x2="8" y2="14"/></svg>';

  return `      <div class="c-toolbar" role="toolbar" aria-label="View options">
        <div class="c-toolbar__group" role="group" aria-label="Layout">
          <button type="button" class="c-toolbar__btn js-layout-btn" data-value="grid" aria-pressed="true" title="Grid layout">${iconGrid} <span class="c-toolbar__label">Grid</span></button>
          <button type="button" class="c-toolbar__btn js-layout-btn" data-value="columns" aria-pressed="false" title="Columns layout">${iconColumns} <span class="c-toolbar__label">Columns</span></button>
        </div>
        <div class="c-toolbar__separator" aria-hidden="true"></div>
        <div class="c-toolbar__group" role="group" aria-label="Density">
          <button type="button" class="c-toolbar__btn js-density-btn" data-value="detailed" aria-pressed="true" title="Detailed view">${iconDetailed} <span class="c-toolbar__label">Detailed</span></button>
          <button type="button" class="c-toolbar__btn js-density-btn" data-value="condensed" aria-pressed="false" title="Condensed view">${iconCondensed} <span class="c-toolbar__label">Condensed</span></button>
        </div>
        <div class="c-toolbar__separator" aria-hidden="true"></div>
        <div class="c-toolbar__group" role="group" aria-label="Color mode">
          <button type="button" class="c-toolbar__btn js-color-btn" data-value="system" aria-pressed="true" title="System theme">${iconSystem} <span class="c-toolbar__label">System</span></button>
          <button type="button" class="c-toolbar__btn js-color-btn" data-value="light" aria-pressed="false" title="Light theme">${iconSun} <span class="c-toolbar__label">Light</span></button>
          <button type="button" class="c-toolbar__btn js-color-btn" data-value="dark" aria-pressed="false" title="Dark theme">${iconMoon} <span class="c-toolbar__label">Dark</span></button>
        </div>
      </div>`;
}

function renderDeleteDialog() {
  return `  <dialog class="c-dialog c-dialog--small js-delete-dialog">
    <form method="dialog" class="c-dialog__form">
      <div class="c-dialog__header">
        <h2 class="c-dialog__title">Delete Bookmark</h2>
        <button type="button" class="c-btn c-btn--icon c-dialog__close js-delete-cancel" aria-label="Close">&times;</button>
      </div>
      <div class="c-dialog__error js-delete-error" role="alert" hidden></div>
      <p class="c-dialog__message js-delete-message">Are you sure?</p>
      <input type="hidden" class="js-delete-url">
      <div class="c-dialog__actions">
        <button type="button" class="c-btn c-btn--danger js-delete-confirm">Delete</button>
        <button type="button" class="c-btn js-delete-cancel">Cancel</button>
      </div>
    </form>
  </dialog>`;
}

function renderKeyboardHelp() {
  return `  <dialog class="c-dialog c-dialog--small js-keyboard-help">
    <div class="c-dialog__form">
      <div class="c-dialog__header">
        <h2 class="c-dialog__title">Keyboard Shortcuts</h2>
        <button type="button" class="c-btn c-btn--icon c-dialog__close js-keyboard-help-close" aria-label="Close">&times;</button>
      </div>
      <dl class="c-shortcut-list">
        <div class="c-shortcut-list__item"><dt><kbd>/</kbd></dt><dd>Focus search</dd></div>
        <div class="c-shortcut-list__item"><dt><kbd>Esc</kbd></dt><dd>Clear search / close dialog</dd></div>
        <div class="c-shortcut-list__item"><dt><kbd>→</kbd> <kbd>↓</kbd></dt><dd>Edit / Delete actions</dd></div>
        <div class="c-shortcut-list__item"><dt><kbd>←</kbd> <kbd>↑</kbd></dt><dd>Return to bookmark</dd></div>
        <div class="c-shortcut-list__item"><dt><kbd>?</kbd></dt><dd>This help</dd></div>
      </dl>
    </div>
  </dialog>`;
}

function renderJumpLinks(categories) {
  if (categories.length <= 1) return '';

  const links = categories
    .map((cat) => `    <a href="#${escapeAttr(cat.id)}" class="c-jump-links__link">${escapeHtml(cat.name)}</a>`)
    .join('\n');

  return `  <nav class="c-jump-links" aria-label="Categories">
${links}
  </nav>`;
}

function renderAddDialog(categories, subcategoryNames, currentSlug) {
  const categoryOptions = categories
    .map((name) => `        <option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
    .join('\n');
  const subcategoryOptions = [...new Set(subcategoryNames)]
    .map((name) => `        <option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
    .join('\n');

  return `  <dialog class="c-dialog js-add-dialog">
    <form method="dialog" class="c-dialog__form js-add-form">
      <div class="c-dialog__header">
        <h2 class="c-dialog__title">Add Link</h2>
        <button type="button" class="c-btn c-btn--icon c-dialog__close js-add-cancel" aria-label="Close">&times;</button>
      </div>
      <input type="hidden" name="page" value="${escapeAttr(currentSlug)}">
      <div class="c-dialog__error js-add-error" role="alert" hidden></div>
      <label class="c-dialog__label">
        URL
        <input type="url" name="url" class="c-dialog__input js-add-url" required placeholder="https://…">
      </label>
      <button type="button" class="c-btn c-btn--small js-fetch-meta">Fetch title &amp; description</button>
      <label class="c-dialog__label">
        Title
        <input type="text" name="title" class="c-dialog__input js-add-title" required>
      </label>
      <label class="c-dialog__label">
        Description <span class="c-dialog__hint">(max 160 characters)</span>
        <input type="text" name="description" class="c-dialog__input js-add-description" maxlength="160">
      </label>
      <label class="c-dialog__label" id="add-category-label">
        Category
        <div class="c-combobox">
          <input type="text" name="category" class="c-dialog__input c-combobox__input js-add-category" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="js-add-category-listbox" aria-labelledby="add-category-label" autocomplete="off" required>
          <ul class="c-combobox__listbox js-add-category-listbox" id="js-add-category-listbox" role="listbox" hidden></ul>
          <span class="c-combobox__hint js-combobox-hint" hidden></span>
        </div>
      </label>
      <label class="c-dialog__label" id="add-subcategory-label">
        Subcategory <span class="c-dialog__hint">(optional)</span>
        <div class="c-combobox">
          <input type="text" name="subcategory" class="c-dialog__input c-combobox__input js-add-subcategory" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="js-add-subcategory-listbox" aria-labelledby="add-subcategory-label" autocomplete="off">
          <ul class="c-combobox__listbox js-add-subcategory-listbox" id="js-add-subcategory-listbox" role="listbox" hidden></ul>
          <span class="c-combobox__hint js-combobox-hint" hidden></span>
        </div>
      </label>
      <label class="c-dialog__label">
        Icon URL <span class="c-dialog__hint">(optional)</span>
        <input type="url" name="icon" class="c-dialog__input js-add-icon" placeholder="https://…">
      </label>
      <div class="c-dialog__actions">
        <button type="submit" class="c-btn c-btn--primary">Add Link</button>
      </div>
    </form>
  </dialog>`;
}

function renderNav(pages, currentSlug, defaultPage) {
  if (pages.length <= 1) return '';

  // Place the default page first, then sort the rest alphabetically
  const sorted = [...pages].sort((a, b) => {
    if (a.slug === defaultPage) return -1;
    if (b.slug === defaultPage) return 1;
    return a.name.localeCompare(b.name);
  });

  const links = sorted
    .map((page) => {
      const ariaCurrent = page.slug === currentSlug ? ' aria-current="page"' : '';
      return `      <a href="/${encodeURIComponent(page.slug)}" class="c-nav__link"${ariaCurrent}>${escapeHtml(page.name)}</a>`;
    })
    .join('\n');

  return `    <nav class="c-nav" aria-label="Pages">
${links}
    </nav>`;
}

function renderMain(pageData, faviconUrls) {
  return pageData.categories.map((category) => renderCategory(category, faviconUrls)).join('\n');
}

function renderCategory(category, faviconUrls) {
  const directBookmarks = category.bookmarks.length
    ? `      <ul class="c-bookmark-list" role="list">
${category.bookmarks.map((b) => renderBookmark(b, faviconUrls, category.name, null)).join('\n')}
      </ul>`
    : '';

  const subcategories = category.subcategories
    .map((sub) => renderSubcategory(sub, faviconUrls, category.name))
    .join('\n');

  return `    <section class="c-category" aria-labelledby="${escapeAttr(category.id)}">
      <h2 id="${escapeAttr(category.id)}">${escapeHtml(category.name)}</h2>
${directBookmarks}
${subcategories}
    </section>`;
}

function renderSubcategory(subcategory, faviconUrls, categoryName) {
  return `      <section class="c-subcategory" aria-labelledby="${escapeAttr(subcategory.id)}">
        <h3 id="${escapeAttr(subcategory.id)}">${escapeHtml(subcategory.name)}</h3>
        <ul class="c-bookmark-list" role="list">
${subcategory.bookmarks.map((b) => renderBookmark(b, faviconUrls, categoryName, subcategory.name)).join('\n')}
        </ul>
      </section>`;
}

function renderBookmark(bookmark, faviconUrls, categoryName, subcategoryName) {
  const faviconUrl = faviconUrls[bookmark.url] || '/icons/default.svg';
  const description = bookmark.description
    ? `\n            <p class="c-bookmark__description">${escapeHtml(bookmark.description)}</p>`
    : '';

  const searchText = [bookmark.title, bookmark.description || '', bookmark.url].join(' ');
  const iconData = bookmark.icon ? ` data-icon="${escapeAttr(bookmark.icon)}"` : '';
  const catData = categoryName ? ` data-category="${escapeAttr(categoryName)}"` : '';
  const subData = subcategoryName ? ` data-subcategory="${escapeAttr(subcategoryName)}"` : '';

  const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>';
  const ICON_DELETE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="4" x2="13" y2="4"/><path d="M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4"/><path d="M4 4l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4"/></svg>';

  return `          <li class="c-bookmark" data-search="${escapeAttr(searchText.toLowerCase())}" data-url="${escapeAttr(bookmark.url)}"${iconData}${catData}${subData} aria-roledescription="bookmark, use arrow keys for actions">
            <div class="c-bookmark__header">
              <a href="${escapeAttr(bookmark.url)}" class="c-bookmark__link">
                <img src="${escapeAttr(faviconUrl)}" alt="" class="c-bookmark__icon" loading="lazy" width="32" height="32">
                <span class="c-bookmark__title">${escapeHtml(bookmark.title)}</span>
              </a>
              <div class="c-bookmark__actions">
                <button type="button" class="c-btn c-btn--icon js-edit-open" aria-label="Edit ${escapeAttr(bookmark.title)}" tabindex="-1">${ICON_EDIT}</button>
                <button type="button" class="c-btn c-btn--icon c-btn--danger js-delete" aria-label="Delete ${escapeAttr(bookmark.title)}" tabindex="-1">${ICON_DELETE}</button>
              </div>
            </div>${description}
          </li>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/'/g, '&#39;');
}
