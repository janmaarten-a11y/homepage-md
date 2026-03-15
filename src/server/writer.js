/**
 * Markdown write-back for HomepageMD.
 *
 * Modifies bookmark Markdown files by operating on raw lines.
 * Preserves unrecognized content (comments, notes, blank lines).
 */

import { readFile, writeFile } from 'node:fs/promises';

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BOOKMARK_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const METADATA_RE = /^\s+-\s+(description|icon):\s+(.+)$/;

/**
 * Serialize a bookmark and its metadata to Markdown lines.
 */
function bookmarkToLines(bookmark) {
  const lines = [`- [${bookmark.title}](${bookmark.url})`];
  if (bookmark.description) {
    lines.push(`  - description: ${bookmark.description}`);
  }
  if (bookmark.icon) {
    lines.push(`  - icon: ${bookmark.icon}`);
  }
  return lines;
}

/**
 * Find the line range of a bookmark by URL.
 * Returns { start, end } (inclusive) or null if not found.
 * The range includes the bookmark line and any indented metadata lines that follow.
 */
function findBookmarkRange(lines, url) {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(BOOKMARK_RE);
    if (match && match[2].trim() === url) {
      let end = i;
      // Include subsequent metadata lines
      while (end + 1 < lines.length && lines[end + 1].match(METADATA_RE)) {
        end++;
      }
      return { start: i, end };
    }
  }
  return null;
}

/**
 * Find the line index of a heading by level and name.
 * Returns the line index or -1.
 */
function findHeading(lines, level, name) {
  const prefix = '#'.repeat(level);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match && match[1].length === level && match[2].trim() === name) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the insertion point for a new bookmark within a category or subcategory.
 * Returns the line index where the bookmark should be inserted (after existing bookmarks).
 */
function findInsertionPoint(lines, sectionStart, sectionLevel) {
  let insertAt = sectionStart + 1;

  for (let i = sectionStart + 1; i < lines.length; i++) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (headingMatch && headingMatch[1].length <= sectionLevel) {
      // Hit the next section at same or higher level — insert before it
      break;
    }
    insertAt = i + 1;
  }

  return insertAt;
}

/**
 * Add a bookmark to a Markdown file under the specified category and subcategory.
 * Creates the category/subcategory heading if it doesn't exist.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {object} bookmark - { title, url, description?, icon?, category, subcategory? }
 */
export async function addBookmark(filePath, bookmark) {
  const source = await readFile(filePath, 'utf-8');
  const lines = source.split('\n');

  let categoryIdx = findHeading(lines, 2, bookmark.category);

  // Create category if it doesn't exist
  if (categoryIdx === -1) {
    // Append at end of file
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(`## ${bookmark.category}`);
    categoryIdx = lines.length - 1;
  }

  let insertAt;

  if (bookmark.subcategory) {
    // Find or create subcategory within this category
    let subIdx = -1;
    for (let i = categoryIdx + 1; i < lines.length; i++) {
      const match = lines[i].match(HEADING_RE);
      if (match) {
        if (match[1].length <= 2) break; // Left the category
        if (match[1].length === 3 && match[2].trim() === bookmark.subcategory) {
          subIdx = i;
          break;
        }
      }
    }

    if (subIdx === -1) {
      // Create subcategory at the end of the category
      insertAt = findInsertionPoint(lines, categoryIdx, 2);
      const subLines = ['', `### ${bookmark.subcategory}`, ''];
      lines.splice(insertAt, 0, ...subLines);
      insertAt += subLines.length;
    } else {
      insertAt = findInsertionPoint(lines, subIdx, 3);
    }
  } else {
    // Insert directly into the category (before any subcategories)
    insertAt = categoryIdx + 1;
    // Skip past any existing direct bookmarks and their metadata
    while (insertAt < lines.length) {
      const line = lines[insertAt];
      const headingMatch = line.match(HEADING_RE);
      if (headingMatch) break; // Hit a heading — stop
      insertAt++;
    }
    // Back up to just before the heading (or end of file)
    // Actually, insert at the end of direct content before next heading
  }

  const newLines = bookmarkToLines(bookmark);
  lines.splice(insertAt, 0, ...newLines);

  await writeFile(filePath, lines.join('\n'));
}

/**
 * Remove a bookmark from a Markdown file by URL.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {string} url - The bookmark URL to remove
 */
export async function removeBookmark(filePath, url) {
  const source = await readFile(filePath, 'utf-8');
  const lines = source.split('\n');
  const range = findBookmarkRange(lines, url);

  if (!range) {
    throw new Error(`Bookmark not found: ${url}`);
  }

  lines.splice(range.start, range.end - range.start + 1);
  await writeFile(filePath, lines.join('\n'));
}

/**
 * Update a bookmark's properties in a Markdown file.
 * Only the provided fields in `updates` are changed.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {string} url - The current bookmark URL (used as identifier)
 * @param {object} updates - { title?, url?, description?, icon? }
 */
export async function updateBookmark(filePath, url, updates) {
  const source = await readFile(filePath, 'utf-8');
  const lines = source.split('\n');
  const range = findBookmarkRange(lines, url);

  if (!range) {
    throw new Error(`Bookmark not found: ${url}`);
  }

  // Parse the current bookmark from its lines
  const bookmarkMatch = lines[range.start].match(BOOKMARK_RE);
  const current = {
    title: bookmarkMatch[1].trim(),
    url: bookmarkMatch[2].trim(),
    description: null,
    icon: null,
  };

  for (let i = range.start + 1; i <= range.end; i++) {
    const metaMatch = lines[i].match(METADATA_RE);
    if (metaMatch) {
      current[metaMatch[1]] = metaMatch[2].trim();
    }
  }

  // Apply updates
  const updated = {
    title: updates.title ?? current.title,
    url: updates.url ?? current.url,
    description: updates.description !== undefined ? updates.description : current.description,
    icon: updates.icon !== undefined ? updates.icon : current.icon,
  };

  // Replace old lines with new
  const newLines = bookmarkToLines(updated);
  lines.splice(range.start, range.end - range.start + 1, ...newLines);

  await writeFile(filePath, lines.join('\n'));
}
