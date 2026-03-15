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
export function renderPage(pageData, { pages, currentSlug, faviconUrls }) {
  const title = pageData.title || 'HomepageMD';
  const nav = renderNav(pages, currentSlug);
  const main = renderMain(pageData, faviconUrls);

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
  <header class="c-header">
    <h1 class="c-header__title">${escapeHtml(title)}</h1>
${nav}
  </header>
  <main>
${main}
  </main>
  <script src="/scripts/app.js" type="module"></script>
</body>
</html>`;
}

function renderNav(pages, currentSlug) {
  if (pages.length <= 1) return '';

  const links = pages
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

  return `          <li class="c-bookmark">
            <a href="${escapeAttr(bookmark.url)}" class="c-bookmark__link">
              <img src="${escapeAttr(faviconUrl)}" alt="" class="c-bookmark__icon" loading="lazy" width="32" height="32">
              <span class="c-bookmark__title">${escapeHtml(bookmark.title)}</span>
            </a>${description}
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
