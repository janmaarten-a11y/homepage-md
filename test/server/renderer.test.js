import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../src/server/renderer.js';

const MINIMAL_PAGE = {
  title: 'Test Page',
  categories: [
    {
      name: 'Category One',
      id: 'category-one',
      bookmarks: [
        { title: 'Example', url: 'https://example.com', description: 'A test bookmark', icon: null },
      ],
      subcategories: [
        {
          name: 'Sub One',
          id: 'category-one-sub-one',
          bookmarks: [
            { title: 'Sub Bookmark', url: 'https://sub.example.com', description: null, icon: null },
          ],
        },
      ],
    },
  ],
};

const EMPTY_PAGE = { title: 'Empty', categories: [] };

const DEFAULT_OPTIONS = {
  pages: [{ name: 'Test Page', slug: 'test' }],
  currentSlug: 'test',
  faviconUrls: {},
  defaultPage: 'test',
};

describe('renderPage', () => {
  it('produces a valid HTML document', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes('</html>'));
  });

  it('includes a skip-to-content link as the first element in body', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    const bodyStart = html.indexOf('<body>');
    const skipLink = html.indexOf('<a href="#main-content" class="c-skip-link">Skip to content</a>');
    assert.ok(skipLink > bodyStart, 'skip link should appear after <body>');
    const headerStart = html.indexOf('<header');
    assert.ok(skipLink < headerStart, 'skip link should appear before <header>');
  });

  it('includes main element with id for skip link target', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('<main id="main-content">'));
  });

  it('includes a search form in the header', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('<search class="c-search">'));
    assert.ok(html.includes('id="js-search"'));
    assert.ok(html.includes('type="search"'));
    assert.ok(html.includes('<label for="js-search"'));
  });

  it('includes data-search attributes on bookmark items', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('data-search="'));
    // Should contain lowercase bookmark title in data-search
    assert.ok(html.includes('example'));
  });

  it('includes the bookmark title and URL in data-search', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    // data-search should contain "example a test bookmark https://example.com" (lowercased)
    assert.ok(html.includes('data-search="example a test bookmark https://example.com"'));
  });

  it('includes no-results message element (hidden by default)', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('class="c-search-empty js-search-empty"'));
    assert.ok(html.includes('hidden'));
    assert.ok(html.includes('No bookmarks match your search.'));
  });

  it('includes a live region for screen reader announcements', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(html.includes('id="js-search-status"'));
  });

  it('renders the page title in the heading and document title', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('<h1 class="c-header__title">Test Page</h1>'));
    assert.ok(html.includes('<title>Test Page — HomepageMD</title>'));
  });

  it('renders categories with aria-labelledby', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('aria-labelledby="category-one"'));
    assert.ok(html.includes('id="category-one"'));
  });

  it('renders subcategories with aria-labelledby', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('aria-labelledby="category-one-sub-one"'));
  });

  it('renders bookmark descriptions', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('c-bookmark__description'));
    assert.ok(html.includes('A test bookmark'));
  });

  it('omits description paragraph when no description', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    // Sub Bookmark has no description — check it doesn't get a description <p>
    const subBookmarkIdx = html.indexOf('Sub Bookmark');
    const nextLi = html.indexOf('</li>', subBookmarkIdx);
    const segment = html.slice(subBookmarkIdx, nextLi);
    assert.ok(!segment.includes('c-bookmark__description'));
  });

  it('does not render nav when there is only one page', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(!html.includes('c-nav'));
  });

  it('renders nav with aria-current for multi-page', () => {
    const options = {
      pages: [
        { name: 'Page A', slug: 'a' },
        { name: 'Page B', slug: 'b' },
      ],
      currentSlug: 'a',
      faviconUrls: {},
      defaultPage: 'a',
    };
    const html = renderPage(MINIMAL_PAGE, options);
    assert.ok(html.includes('aria-label="Pages"'));
    assert.ok(html.includes('aria-current="page"'));
    // Only the current page should have aria-current
    const matches = html.match(/aria-current="page"/g);
    assert.equal(matches.length, 1);
  });

  it('escapes HTML in titles and descriptions', () => {
    const page = {
      title: '<script>alert(1)</script>',
      categories: [
        {
          name: 'Cat & "Friends"',
          id: 'cat',
          bookmarks: [
            { title: '<b>Bold</b>', url: 'https://example.com', description: '<img onerror=alert(1)>', icon: null },
          ],
          subcategories: [],
        },
      ],
    };
    const html = renderPage(page, DEFAULT_OPTIONS);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<b>Bold</b>'));
    assert.ok(!html.includes('<img onerror'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Cat &amp; &quot;Friends&quot;'));
  });

  it('renders an empty page without errors', () => {
    const html = renderPage(EMPTY_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('<main id="main-content">'));
    assert.ok(html.includes('</main>'));
  });

  it('includes data-url attributes on bookmark items', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('data-url="https://example.com"'));
    assert.ok(html.includes('data-url="https://sub.example.com"'));
  });

  it('includes an Add Bookmark button', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-add-open'));
    assert.ok(html.includes('Add'));
  });

  it('includes an Add Bookmark dialog with form', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-add-dialog'));
    assert.ok(html.includes('js-add-form'));
    assert.ok(html.includes('name="url"'));
    assert.ok(html.includes('name="title"'));
    assert.ok(html.includes('name="category"'));
  });

  it('includes category options in the add dialog datalist', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('Category One'));
    assert.ok(html.includes('js-category-list'));
  });

  it('includes edit and delete buttons on each bookmark', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    const editBtns = html.match(/js-edit-open/g) || [];
    const deleteBtns = html.match(/js-delete/g) || [];
    // MINIMAL_PAGE has 2 bookmarks
    assert.equal(editBtns.length, 2);
    assert.equal(deleteBtns.length, 2);
  });

  it('includes an Edit Bookmark dialog', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-edit-dialog'));
    assert.ok(html.includes('js-edit-form'));
    assert.ok(html.includes('Edit Bookmark'));
  });

  it('includes a Fetch Metadata button in the add dialog', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-fetch-meta'));
    assert.ok(html.includes('Fetch title'));
  });

  it('includes a keyboard shortcut hint on the search field', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('c-search__shortcut'));
    assert.ok(html.includes('<kbd'));
    assert.ok(html.includes('/'));
  });

  it('renders category jump links when there are multiple categories', () => {
    const multiCatPage = {
      title: 'Multi',
      categories: [
        { name: 'Cat A', id: 'cat-a', bookmarks: [], subcategories: [] },
        { name: 'Cat B', id: 'cat-b', bookmarks: [], subcategories: [] },
      ],
    };
    const html = renderPage(multiCatPage, DEFAULT_OPTIONS);
    assert.ok(html.includes('c-jump-links'));
    assert.ok(html.includes('aria-label="Categories"'));
    assert.ok(html.includes('href="#cat-a"'));
    assert.ok(html.includes('href="#cat-b"'));
  });

  it('does not render jump links for a single category', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(!html.includes('c-jump-links'));
  });

  it('does not render jump links for an empty page', () => {
    const html = renderPage(EMPTY_PAGE, DEFAULT_OPTIONS);
    assert.ok(!html.includes('c-jump-links'));
  });

  it('includes a condensed view toggle button', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-condensed-toggle'));
    assert.ok(html.includes('aria-pressed="false"'));
    assert.ok(html.includes('Condensed'));
  });

  it('includes icon URL field in add dialog', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-add-icon'));
    assert.ok(html.includes('Icon URL'));
  });

  it('includes icon URL field in edit dialog', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-edit-icon'));
  });

  it('includes fetch metadata button in edit dialog', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    assert.ok(html.includes('js-edit-fetch-meta'));
  });

  it('includes maxlength on description fields', () => {
    const html = renderPage(MINIMAL_PAGE, DEFAULT_OPTIONS);
    const maxlengthCount = (html.match(/maxlength="160"/g) || []).length;
    // Both add and edit dialogs
    assert.equal(maxlengthCount, 2);
  });

  it('includes data-icon attribute when bookmark has an icon override', () => {
    const page = {
      title: 'Icons',
      categories: [
        {
          name: 'Cat',
          id: 'cat',
          bookmarks: [
            { title: 'A', url: 'https://a.com', description: null, icon: 'https://a.com/icon.png' },
            { title: 'B', url: 'https://b.com', description: null, icon: null },
          ],
          subcategories: [],
        },
      ],
    };
    const html = renderPage(page, DEFAULT_OPTIONS);
    assert.ok(html.includes('data-icon="https://a.com/icon.png"'));
    // B has no icon override — should not have data-icon
    const bSection = html.slice(html.indexOf('data-url="https://b.com"'));
    assert.ok(!bSection.startsWith('data-icon'));
  });

  it('places default page first in nav ordering', () => {
    const options = {
      pages: [
        { name: 'Zebra', slug: 'zebra' },
        { name: 'Alpha', slug: 'alpha' },
        { name: 'Home', slug: 'home' },
      ],
      currentSlug: 'zebra',
      faviconUrls: {},
      defaultPage: 'home',
    };
    const html = renderPage(MINIMAL_PAGE, options);
    const homeIdx = html.indexOf('/home"');
    const alphaIdx = html.indexOf('/alpha"');
    const zebraIdx = html.indexOf('/zebra"');
    assert.ok(homeIdx < alphaIdx, 'default page should appear before alphabetically sorted pages');
    assert.ok(alphaIdx < zebraIdx, 'remaining pages should be alphabetically sorted');
  });
});
