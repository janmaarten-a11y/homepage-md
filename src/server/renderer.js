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

  const search = renderSearch();
  const addBtn = renderAddButton();
  const condensedToggle = renderCondensedToggle();
  const addDialog = renderAddDialog(categories, currentSlug);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — HomepageMD</title>
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/custom.css">
</head>
<body>
  <a href="#main-content" class="c-skip-link">Skip to content</a>
  <header class="c-header">
    <h1 class="c-header__title">${escapeHtml(title)}</h1>
${nav}
${search}
${condensedToggle}
${addBtn}
  </header>
${jumpLinks}
  <main id="main-content">
${main}
  </main>
  <p class="c-search-empty js-search-empty" hidden>No bookmarks match your search.</p>
  <div class="u-visually-hidden" aria-live="polite" id="js-search-status"></div>
${addDialog}
  <dialog class="c-dialog js-edit-dialog">
    <form method="dialog" class="c-dialog__form js-edit-form">
      <h2 class="c-dialog__title">Edit Bookmark</h2>
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
      <label class="c-dialog__label">
        Icon URL <span class="c-dialog__hint">(optional)</span>
        <input type="url" name="icon" class="c-dialog__input js-edit-icon" placeholder="https://…">
      </label>
      <div class="c-dialog__actions">
        <button type="submit" class="c-btn c-btn--primary">Save</button>
        <button type="button" class="c-btn js-edit-cancel">Cancel</button>
      </div>
    </form>
  </dialog>
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
  return `    <button type="button" class="c-btn c-btn--primary js-add-open" aria-label="Add bookmark">+ Add</button>`;
}

function renderCondensedToggle() {
  return `    <button type="button" class="c-btn c-btn--small js-condensed-toggle" aria-pressed="false" title="Toggle condensed view">Condensed</button>`;
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

function renderAddDialog(categories, currentSlug) {
  const categoryOptions = categories
    .map((name) => `        <option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
    .join('\n');

  return `  <dialog class="c-dialog js-add-dialog">
    <form method="dialog" class="c-dialog__form js-add-form">
      <h2 class="c-dialog__title">Add Bookmark</h2>
      <input type="hidden" name="page" value="${escapeAttr(currentSlug)}">
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
      <label class="c-dialog__label">
        Category
        <input type="text" name="category" list="js-category-list" class="c-dialog__input js-add-category" required>
        <datalist id="js-category-list">
${categoryOptions}
        </datalist>
      </label>
      <label class="c-dialog__label">
        Subcategory <span class="c-dialog__hint">(optional)</span>
        <input type="text" name="subcategory" class="c-dialog__input js-add-subcategory">
      </label>
      <label class="c-dialog__label">
        Icon URL <span class="c-dialog__hint">(optional)</span>
        <input type="url" name="icon" class="c-dialog__input js-add-icon" placeholder="https://…">
      </label>
      <div class="c-dialog__actions">
        <button type="submit" class="c-btn c-btn--primary">Add Bookmark</button>
        <button type="button" class="c-btn js-add-cancel">Cancel</button>
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
${category.bookmarks.map((b) => renderBookmark(b, faviconUrls)).join('\n')}
      </ul>`
    : '';

  const subcategories = category.subcategories
    .map((sub) => renderSubcategory(sub, faviconUrls))
    .join('\n');

  return `    <section class="c-category" aria-labelledby="${escapeAttr(category.id)}">
      <h2 id="${escapeAttr(category.id)}">${escapeHtml(category.name)}</h2>
${directBookmarks}
${subcategories}
    </section>`;
}

function renderSubcategory(subcategory, faviconUrls) {
  return `      <section class="c-subcategory" aria-labelledby="${escapeAttr(subcategory.id)}">
        <h3 id="${escapeAttr(subcategory.id)}">${escapeHtml(subcategory.name)}</h3>
        <ul class="c-bookmark-list" role="list">
${subcategory.bookmarks.map((b) => renderBookmark(b, faviconUrls)).join('\n')}
        </ul>
      </section>`;
}

function renderBookmark(bookmark, faviconUrls) {
  const faviconUrl = faviconUrls[bookmark.url] || '/icons/default.svg';
  const description = bookmark.description
    ? `\n            <p class="c-bookmark__description">${escapeHtml(bookmark.description)}</p>`
    : '';

  const searchText = [bookmark.title, bookmark.description || '', bookmark.url].join(' ');
  const iconData = bookmark.icon ? ` data-icon="${escapeAttr(bookmark.icon)}"` : '';

  return `          <li class="c-bookmark" data-search="${escapeAttr(searchText.toLowerCase())}" data-url="${escapeAttr(bookmark.url)}"${iconData}>
            <a href="${escapeAttr(bookmark.url)}" class="c-bookmark__link">
              <img src="${escapeAttr(faviconUrl)}" alt="" class="c-bookmark__icon" loading="lazy" width="32" height="32">
              <span class="c-bookmark__title">${escapeHtml(bookmark.title)}</span>
            </a>${description}
            <div class="c-bookmark__actions">
              <button type="button" class="c-btn c-btn--small js-edit-open" aria-label="Edit ${escapeAttr(bookmark.title)}">Edit</button>
              <button type="button" class="c-btn c-btn--small c-btn--danger js-delete" aria-label="Delete ${escapeAttr(bookmark.title)}">Delete</button>
            </div>
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
