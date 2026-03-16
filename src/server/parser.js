/**
 * Markdown parser for HomepageMD.
 *
 * Parses a restricted Markdown grammar into structured bookmark data.
 * Unrecognized syntax is silently skipped.
 *
 * Output shape:
 * {
 *   title: string | null,
 *   categories: [{
 *     name: string,
 *     id: string,
 *     subtitle: string | null,
 *     bookmarks: [{ title, url, description, icon }],
 *     subcategories: [{ name, id, subtitle, bookmarks }]
 *   }]
 * }
 */

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BOOKMARK_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const METADATA_RE = /^\s+-\s+(description|icon|subtitle|location):\s+(.+)$/;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseMarkdown(source) {
  const lines = source.split('\n');
  const result = { title: null, location: null, categories: [] };

  let currentCategory = null;
  let currentSubcategory = null;
  let currentBookmark = null;

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const [, hashes, text] = headingMatch;
      const level = hashes.length;
      const name = text.trim();

      if (level === 1 && result.title === null) {
        result.title = name;
        currentBookmark = null;
      } else if (level === 2) {
        currentCategory = {
          name,
          id: slugify(name),
          subtitle: null,
          bookmarks: [],
          subcategories: [],
        };
        result.categories.push(currentCategory);
        currentSubcategory = null;
        currentBookmark = null;
      } else if (level === 3 && currentCategory) {
        currentSubcategory = {
          name,
          id: `${currentCategory.id}-${slugify(name)}`,
          subtitle: null,
          bookmarks: [],
        };
        currentCategory.subcategories.push(currentSubcategory);
        currentBookmark = null;
      }
      continue;
    }

    const bookmarkMatch = line.match(BOOKMARK_RE);
    if (bookmarkMatch && currentCategory) {
      const [, title, url] = bookmarkMatch;
      currentBookmark = {
        title: title.trim(),
        url: url.trim(),
        description: null,
        icon: null,
      };
      const target = currentSubcategory || currentCategory;
      target.bookmarks.push(currentBookmark);
      continue;
    }

    const metadataMatch = line.match(METADATA_RE);
    if (metadataMatch) {
      const [, key, value] = metadataMatch;

      // subtitle: applies to the current section (category or subcategory)
      if (key === 'subtitle' && !currentBookmark) {
        const target = currentSubcategory || currentCategory;
        if (target) target.subtitle = value.trim();
        continue;
      }

      // location: applies to the page (before any category, or at top level)
      if (key === 'location' && !currentBookmark) {
        if (!currentCategory) result.location = value.trim();
        continue;
      }

      // description/icon apply to the current bookmark
      if (currentBookmark) {
        if (key === 'description') {
          currentBookmark.description = value.trim();
        } else if (key === 'icon') {
          currentBookmark.icon = value.trim();
        }
      }
      continue;
    }

    // Everything else is silently skipped
  }

  return result;
}
