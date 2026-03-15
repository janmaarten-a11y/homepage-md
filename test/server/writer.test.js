import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { addBookmark, removeBookmark, updateBookmark } from '../../src/server/writer.js';
import { parseMarkdown } from '../../src/server/parser.js';

let testDir;
let testFile;

async function setupFile(content) {
  testDir = join(tmpdir(), `homepage-md-test-${randomUUID()}`);
  await mkdir(testDir, { recursive: true });
  testFile = join(testDir, 'test.md');
  await writeFile(testFile, content);
  return testFile;
}

async function readAndParse(filePath) {
  const source = await readFile(filePath, 'utf-8');
  return parseMarkdown(source);
}

const SAMPLE_MD = `# Test Bookmarks

## Streaming

- [Netflix](https://www.netflix.com)
  - description: Family streaming account
- [YouTube](https://www.youtube.com)

### Music

- [Spotify](https://open.spotify.com)
  - description: Family plan
  - icon: https://example.com/spotify.png

## School

- [School Portal](https://school.example.com)
  - description: Grades and attendance
`;

describe('addBookmark', () => {
  it('adds a bookmark to an existing category', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'Disney+',
      url: 'https://www.disneyplus.com',
      description: 'Kids profile',
      category: 'Streaming',
    });
    const result = await readAndParse(fp);
    const streaming = result.categories[0];
    const titles = streaming.bookmarks.map((b) => b.title);
    assert.ok(titles.includes('Disney+'));
  });

  it('adds a bookmark to an existing subcategory', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'Bandcamp',
      url: 'https://bandcamp.com',
      category: 'Streaming',
      subcategory: 'Music',
    });
    const result = await readAndParse(fp);
    const music = result.categories[0].subcategories[0];
    const titles = music.bookmarks.map((b) => b.title);
    assert.ok(titles.includes('Bandcamp'));
  });

  it('creates a new category if it does not exist', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'New Link',
      url: 'https://newlink.com',
      category: 'New Category',
    });
    const result = await readAndParse(fp);
    const names = result.categories.map((c) => c.name);
    assert.ok(names.includes('New Category'));
    const newCat = result.categories.find((c) => c.name === 'New Category');
    assert.equal(newCat.bookmarks[0].title, 'New Link');
  });

  it('creates a new subcategory if it does not exist', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'Podcast App',
      url: 'https://podcasts.example.com',
      category: 'Streaming',
      subcategory: 'Podcasts',
    });
    const result = await readAndParse(fp);
    const streaming = result.categories[0];
    const subNames = streaming.subcategories.map((s) => s.name);
    assert.ok(subNames.includes('Podcasts'));
  });

  it('preserves description and icon metadata', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'Custom',
      url: 'https://custom.example.com',
      description: 'A custom bookmark',
      icon: 'https://example.com/icon.png',
      category: 'School',
    });
    const result = await readAndParse(fp);
    const school = result.categories[1];
    const custom = school.bookmarks.find((b) => b.title === 'Custom');
    assert.equal(custom.description, 'A custom bookmark');
    assert.equal(custom.icon, 'https://example.com/icon.png');
  });

  it('preserves existing bookmarks', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'New',
      url: 'https://new.example.com',
      category: 'Streaming',
    });
    const result = await readAndParse(fp);
    const streaming = result.categories[0];
    assert.ok(streaming.bookmarks.some((b) => b.title === 'Netflix'));
    assert.ok(streaming.bookmarks.some((b) => b.title === 'YouTube'));
  });

  it('preserves the page title', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await addBookmark(fp, {
      title: 'New',
      url: 'https://new.example.com',
      category: 'Streaming',
    });
    const result = await readAndParse(fp);
    assert.equal(result.title, 'Test Bookmarks');
  });
});

describe('removeBookmark', () => {
  it('removes a bookmark by URL', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await removeBookmark(fp, 'https://www.netflix.com');
    const result = await readAndParse(fp);
    const streaming = result.categories[0];
    const urls = streaming.bookmarks.map((b) => b.url);
    assert.ok(!urls.includes('https://www.netflix.com'));
  });

  it('removes the bookmark and its metadata lines', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await removeBookmark(fp, 'https://open.spotify.com');
    const source = await readFile(fp, 'utf-8');
    assert.ok(!source.includes('open.spotify.com'));
    assert.ok(!source.includes('Family plan'));
    assert.ok(!source.includes('spotify.png'));
  });

  it('preserves other bookmarks', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await removeBookmark(fp, 'https://www.netflix.com');
    const result = await readAndParse(fp);
    const streaming = result.categories[0];
    assert.ok(streaming.bookmarks.some((b) => b.title === 'YouTube'));
  });

  it('throws when the bookmark is not found', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await assert.rejects(
      () => removeBookmark(fp, 'https://nonexistent.example.com'),
      { message: /not found/i }
    );
  });
});

describe('updateBookmark', () => {
  it('updates the title', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://www.netflix.com', { title: 'Netflix HD' });
    const result = await readAndParse(fp);
    const netflix = result.categories[0].bookmarks.find((b) => b.url === 'https://www.netflix.com');
    assert.equal(netflix.title, 'Netflix HD');
  });

  it('updates the URL', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://www.netflix.com', { url: 'https://netflix.com/browse' });
    const result = await readAndParse(fp);
    const urls = result.categories[0].bookmarks.map((b) => b.url);
    assert.ok(urls.includes('https://netflix.com/browse'));
    assert.ok(!urls.includes('https://www.netflix.com'));
  });

  it('updates the description', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://www.netflix.com', { description: 'Updated description' });
    const result = await readAndParse(fp);
    const netflix = result.categories[0].bookmarks.find((b) => b.url === 'https://www.netflix.com');
    assert.equal(netflix.description, 'Updated description');
  });

  it('adds a description where there was none', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://www.youtube.com', { description: 'Video site' });
    const result = await readAndParse(fp);
    const youtube = result.categories[0].bookmarks.find((b) => b.url === 'https://www.youtube.com');
    assert.equal(youtube.description, 'Video site');
  });

  it('removes description when set to null', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://www.netflix.com', { description: null });
    const result = await readAndParse(fp);
    const netflix = result.categories[0].bookmarks.find((b) => b.url === 'https://www.netflix.com');
    assert.equal(netflix.description, null);
  });

  it('preserves fields not included in updates', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await updateBookmark(fp, 'https://open.spotify.com', { title: 'Spotify Premium' });
    const result = await readAndParse(fp);
    const spotify = result.categories[0].subcategories[0].bookmarks[0];
    assert.equal(spotify.title, 'Spotify Premium');
    assert.equal(spotify.description, 'Family plan');
    assert.equal(spotify.icon, 'https://example.com/spotify.png');
  });

  it('throws when the bookmark is not found', async () => {
    const fp = await setupFile(SAMPLE_MD);
    await assert.rejects(
      () => updateBookmark(fp, 'https://nonexistent.example.com', { title: 'X' }),
      { message: /not found/i }
    );
  });

  it('round-trips: parse → update → parse preserves structure', async () => {
    const fp = await setupFile(SAMPLE_MD);
    const before = await readAndParse(fp);
    await updateBookmark(fp, 'https://www.netflix.com', { title: 'Netflix Updated' });
    const after = await readAndParse(fp);

    assert.equal(after.title, before.title);
    assert.equal(after.categories.length, before.categories.length);
    assert.equal(after.categories[0].subcategories.length, before.categories[0].subcategories.length);
  });
});
