import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMarkdown } from '../../src/server/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

async function loadFixture(name) {
  return readFile(join(FIXTURES, name), 'utf-8');
}

describe('parseMarkdown', () => {
  it('extracts the page title from an H1 heading', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    assert.equal(result.title, 'Household Bookmarks');
  });

  it('extracts categories from H2 headings', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const names = result.categories.map((c) => c.name);
    assert.deepEqual(names, ['Streaming', 'School', 'Home Server']);
  });

  it('generates slugified IDs for categories', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const ids = result.categories.map((c) => c.id);
    assert.deepEqual(ids, ['streaming', 'school', 'home-server']);
  });

  it('extracts subcategories from H3 headings', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const streaming = result.categories[0];
    const subNames = streaming.subcategories.map((s) => s.name);
    assert.deepEqual(subNames, ['Video', 'Music']);
  });

  it('generates compound IDs for subcategories', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const streaming = result.categories[0];
    const subIds = streaming.subcategories.map((s) => s.id);
    assert.deepEqual(subIds, ['streaming-video', 'streaming-music']);
  });

  it('extracts bookmarks with title and URL', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const video = result.categories[0].subcategories[0];
    assert.equal(video.bookmarks[0].title, 'Netflix');
    assert.equal(video.bookmarks[0].url, 'https://www.netflix.com');
  });

  it('extracts description metadata', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const video = result.categories[0].subcategories[0];
    assert.equal(video.bookmarks[0].description, 'Family streaming account');
  });

  it('extracts icon metadata', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const homeServer = result.categories[2];
    assert.equal(homeServer.bookmarks[0].icon, 'https://www.synology.com/img/company/branding/synology_logo.jpg');
  });

  it('sets description and icon to null when not provided', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const video = result.categories[0].subcategories[0];
    const youtube = video.bookmarks[2];
    assert.equal(youtube.description, null);
    assert.equal(youtube.icon, null);
  });

  it('places bookmarks directly in category when no subcategory', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const school = result.categories[1];
    assert.equal(school.bookmarks.length, 2);
    assert.equal(school.subcategories.length, 0);
    assert.equal(school.bookmarks[0].title, 'School Portal');
  });

  it('handles empty files', async () => {
    const source = await loadFixture('empty.md');
    const result = parseMarkdown(source);
    assert.equal(result.title, null);
    assert.deepEqual(result.categories, []);
  });

  it('silently skips malformed or unrecognized lines', async () => {
    const source = await loadFixture('malformed.md');
    const result = parseMarkdown(source);
    assert.equal(result.title, 'Malformed Test File');
    // Only "Valid Category" has a proper H2
    assert.equal(result.categories.length, 1);
    assert.equal(result.categories[0].name, 'Valid Category');
  });

  it('parses valid bookmarks within a malformed file', async () => {
    const source = await loadFixture('malformed.md');
    const result = parseMarkdown(source);
    const cat = result.categories[0];
    // Should find the valid bookmarks and skip non-bookmark list items
    const titles = cat.bookmarks.map((b) => b.title);
    assert.ok(titles.includes('Valid Bookmark'));
  });

  it('handles both description and icon on the same bookmark', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    const synology = result.categories[2].bookmarks[0];
    assert.equal(synology.description, 'NAS admin panel');
    assert.equal(synology.icon, 'https://www.synology.com/img/company/branding/synology_logo.jpg');
  });

  it('only uses the first H1 as the title', () => {
    const source = '# First Title\n# Second Title\n';
    const result = parseMarkdown(source);
    assert.equal(result.title, 'First Title');
  });

  it('extracts subtitle from a category', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    assert.equal(result.categories[0].subtitle, 'Movies, TV, and music');
  });

  it('sets subtitle to null when not provided', async () => {
    const source = await loadFixture('valid.md');
    const result = parseMarkdown(source);
    // School category has no subtitle
    assert.equal(result.categories[1].subtitle, null);
  });

  it('extracts subtitle from a subcategory', () => {
    const source = '# T\n## Cat\n### Sub\n  - subtitle: Sub description\n- [Link](https://x.com)\n';
    const result = parseMarkdown(source);
    assert.equal(result.categories[0].subcategories[0].subtitle, 'Sub description');
  });

  it('does not assign subtitle to a bookmark', () => {
    const source = '# T\n## Cat\n- [Link](https://x.com)\n  - subtitle: This is not a bookmark subtitle\n';
    const result = parseMarkdown(source);
    // subtitle after a bookmark should not be treated as bookmark metadata
    // (subtitle only applies to headings, not bookmarks)
    assert.equal(result.categories[0].bookmarks[0].description, null);
  });

  it('extracts a welcome message with title and description', () => {
    const source = '# T\n\n> [!WELCOME] Hello!\n> This is the dashboard.\n\n## Cat\n';
    const result = parseMarkdown(source);
    assert.deepStrictEqual(result.welcome, { title: 'Hello!', description: 'This is the dashboard.' });
  });

  it('extracts a welcome message with title only', () => {
    const source = '# T\n> [!WELCOME] Hello!\n## Cat\n';
    const result = parseMarkdown(source);
    assert.deepStrictEqual(result.welcome, { title: 'Hello!', description: null });
  });

  it('extracts a welcome message with description only', () => {
    const source = '# T\n> [!WELCOME]\n> A description here.\n## Cat\n';
    const result = parseMarkdown(source);
    assert.deepStrictEqual(result.welcome, { title: null, description: 'A description here.' });
  });

  it('joins multi-line welcome descriptions', () => {
    const source = '# T\n> [!WELCOME] Hi\n> Line one.\n> Line two.\n## Cat\n';
    const result = parseMarkdown(source);
    assert.deepStrictEqual(result.welcome, { title: 'Hi', description: 'Line one. Line two.' });
  });

  it('sets welcome to null when not present', () => {
    const source = '# T\n## Cat\n- [Link](https://x.com)\n';
    const result = parseMarkdown(source);
    assert.strictEqual(result.welcome, null);
  });
});
