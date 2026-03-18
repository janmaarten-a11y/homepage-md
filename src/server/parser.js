/**
 * Markdown parser for HomepageMD.
 *
 * Parses a restricted Markdown grammar into structured bookmark data.
 * Unrecognized syntax is silently skipped.
 *
 * Output shape:
 * {
 *   title: string | null,
 *   welcome: { title: string, description: string | null } | null,
 *   categories: [{
 *     name: string,
 *     id: string,
 *     icon: string | null,
 *     subtitle: string | null,
 *     bookmarks: [{ title, url, description, icon }],
 *     subcategories: [{ name, id, icon, subtitle, bookmarks }]
 *   }]
 * }
 */

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BOOKMARK_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const METADATA_RE = /^\s+-\s+(description|icon|subtitle|location|bang|access|tags):\s+(.+)$/;
const WELCOME_RE = /^>\s*\[!WELCOME\]\s*(.*)$/i;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseMarkdown(source) {
  const lines = source.split('\n');
  const result = { title: null, location: null, access: null, bangs: [], welcome: null, categories: [] };

  let currentCategory = null;
  let currentSubcategory = null;
  let currentBookmark = null;
  let inWelcome = false;

  for (const line of lines) {
    // Welcome block: > [!WELCOME] Title / > continuation lines
    const welcomeMatch = line.match(WELCOME_RE);
    if (welcomeMatch) {
      result.welcome = { title: welcomeMatch[1].trim() || null, description: null };
      inWelcome = true;
      continue;
    }
    if (inWelcome) {
      const bqMatch = line.match(BLOCKQUOTE_RE);
      if (bqMatch) {
        const text = bqMatch[1].trim();
        if (text) {
          result.welcome.description = result.welcome.description
            ? result.welcome.description + ' ' + text
            : text;
        }
        continue;
      }
      inWelcome = false;
    }

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
          icon: null,
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
          icon: null,
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
        tags: [],
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

      // bang: search shortcut, format "!prefix https://url?q=%s"
      if (key === 'bang' && !currentBookmark && !currentCategory) {
        const bangMatch = value.trim().match(/^(![\w-]+)\s+(\S+)$/);
        if (bangMatch) {
          result.bangs.push({ prefix: bangMatch[1], url: bangMatch[2] });
        }
        continue;
      }

      // access: page-level access control (e.g. "open")
      if (key === 'access' && !currentBookmark && !currentCategory) {
        result.access = value.trim().toLowerCase();
        continue;
      }

      // icon: on a section (category or subcategory) when no current bookmark
      if (key === 'icon' && !currentBookmark) {
        const target = currentSubcategory || currentCategory;
        if (target) target.icon = value.trim();
        continue;
      }

      // description/icon/tags apply to the current bookmark
      if (currentBookmark) {
        if (key === 'description') {
          currentBookmark.description = value.trim();
        } else if (key === 'icon') {
          currentBookmark.icon = value.trim();
        } else if (key === 'tags') {
          currentBookmark.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
      continue;
    }

    // Everything else is silently skipped
  }

  return result;
}
