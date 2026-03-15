# HomepageMD

**Your bookmarks, in Markdown. Your homepage, everywhere.**

A household bookmark dashboard that reads Markdown files and renders them as a clean, accessible, searchable web page. Runs as a small Node.js server — designed for a home server (Synology NAS), accessible locally and remotely via Tailscale.

## Features

- **Markdown as source of truth** — edit `.md` files in any text editor, or use the built-in web UI
- **Add, edit, delete** bookmarks through the dashboard — changes write back to Markdown
- **Real-time search** — filter bookmarks instantly by title, description, or URL (press `/` to focus)
- **Multiple pages** — each `.md` file in `bookmarks/` becomes a page in the top navigation
- **Categories and subcategories** — `##` headings are categories, `###` headings are subcategories
- **Favicon resolution** — automatic icons via local cache, direct fetch, DuckDuckGo fallback, or manual overrides
- **View modes** — Grid or Columns layout × Detailed or Condensed density, saved per page
- **Dark mode** — automatic via `prefers-color-scheme`
- **Live updates** — Server-Sent Events push changes to all open browsers when files change
- **Keyboard navigation** — `/` to search, `Escape` to clear, arrow keys to reach edit/delete, skip-to-content link
- **Category jump links** — sticky navigation bar for quick access to sections
- **Docker-ready** — single container, Synology-friendly
- **Customizable** — override any design token via `custom.css`
- **Optional auth** — `AUTH_TOKEN` env var protects write endpoints
- **No dependencies** — zero `node_modules` in production, just Node.js built-ins
- **Accessible** — semantic HTML, proper heading hierarchy, `aria-labelledby`, `aria-live`, `focus-visible`, WCAG 2.2 reviewed

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
cp .env.example .env    # edit to customize
docker compose up -d
```

Open `http://localhost:2525` in your browser.

### Local development

Requires Node.js 22+.

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
npm install
npm run dev
```

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `2525` | Server port |
| `DEFAULT_PAGE` | `homepage` | The `.md` filename (without extension) served at `/` |
| `BOOKMARKS_DIR` | `./bookmarks` | Path to the bookmarks directory |
| `ICONS_DIR` | `./icons` | Path to manual favicon overrides |
| `FAVICON_CACHE_DIR` | `./favicon-cache` | Path to the favicon cache |
| `CUSTOM_CSS_PATH` | `./custom.css` | Path to the user CSS overrides file |
| `AUTH_TOKEN` | *(none)* | Shared passphrase for write endpoints (disabled by default) |
| `FAVICON_TTL_DAYS` | `7` | Days before a cached favicon is re-fetched |

## Data format

Each `.md` file in the `bookmarks/` directory is a page. The grammar:

```markdown
# Page Title

## Category Name

### Subcategory Name

- [Bookmark Title](https://example.com)
  - description: A short description (max 160 chars)
  - icon: https://example.com/custom-icon.png
```

### Rules

- `# Heading 1` — page title (one per file)
- `## Heading 2` — category
- `### Heading 3` — subcategory (within the parent category)
- `- [Title](URL)` — bookmark
- `- description: text` — description (indented, under a bookmark)
- `- icon: url` — custom icon override (indented, under a bookmark)
- Everything else is silently ignored — add comments, notes, or blank lines freely

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus the search field |
| `Escape` | Clear search and return focus to the page |
| `→` / `↓` | From a bookmark link, move to Edit → Delete |
| `←` / `↑` | Reverse: Delete → Edit → Link |
| `Escape` | From Edit/Delete, return to the bookmark link |
| `Tab` | Move to the next bookmark (skips edit/delete buttons) |

## View modes

The **View** dropdown in the header offers two independent axes:

- **Density**: Detailed (shows descriptions) / Condensed (hides descriptions, tighter padding)
- **Layout**: Grid (card grid) / Columns (subcategories as horizontal columns)

Preferences are saved per page in the browser's `localStorage`.

## API

All write endpoints are protected by `AUTH_TOKEN` when configured.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/{slug}` | Render a bookmark page |
| `POST` | `/api/bookmarks/{slug}` | Add a bookmark |
| `PUT` | `/api/bookmarks/{slug}` | Update a bookmark |
| `DELETE` | `/api/bookmarks/{slug}` | Remove a bookmark |
| `POST` | `/api/metadata` | Fetch title and description from a URL |
| `GET` | `/api/events` | Server-Sent Events stream for live updates |

### Example: add a bookmark

```bash
curl -X POST http://localhost:2525/api/bookmarks/homepage \
  -H 'Content-Type: application/json' \
  -d '{"title":"GitHub","url":"https://github.com","description":"Code hosting","category":"Dev"}'
```

## Favicon resolution

Icons are resolved in this order:

1. **Manual override** — `icons/{domain}.{png,svg,ico,webp}`
2. **Inline override** — `icon:` metadata in the Markdown file
3. **Local cache** — `favicon-cache/` (refreshed on file change, configurable TTL)
4. **Direct fetch** — parse the target page's `<link rel="icon">` tag server-side (SSRF-protected)
5. **DuckDuckGo fallback** — `https://icons.duckduckgo.com/ip3/{domain}.ico`
6. **Generic placeholder** — bundled default icon

## Custom styling

Edit `custom.css` in the project root to override design tokens:

```css
:root {
  --color-bg: oklch(25% 0.02 260);
  --color-text: oklch(90% 0 0);
  --color-primary: oklch(70% 0.18 150);
  --color-surface: oklch(30% 0.02 260);
}
```

Available tokens: `--color-bg`, `--color-text`, `--color-primary`, `--color-surface`, `--color-border`, `--color-focus`, `--color-muted`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-base`, `--font-mono`. See `custom.css` for the full list.

## Project structure

```
homepage-md/
  src/
    server/
      index.js            # HTTP server, SSE, API routes, file watcher
      config.js           # Environment variable configuration
      parser.js           # Markdown → structured data
      favicon.js          # Favicon resolution chain (SSRF-protected)
      renderer.js         # HTML page generation
      writer.js           # Markdown write-back (add/remove/update)
      auth.js             # Optional AUTH_TOKEN middleware
      metadata.js         # Page title/description fetcher
    public/
      styles/
        main.css          # App styles (cascade layers, Piccalilli reset)
      scripts/
        app.js            # Client: search, keyboard nav, view modes, CRUD
  bookmarks/
    homepage.md           # Default bookmarks file (household example)
  icons/                  # Manual favicon overrides
  favicon-cache/          # Auto-fetched cached icons (Docker volume)
  custom.css              # User style overrides
  test/
    server/
      parser.test.js      # 15 tests
      favicon.test.js     # 19 tests
      renderer.test.js    # 27 tests
      writer.test.js      # 19 tests
      auth.test.js        # 8 tests
    fixtures/
      valid.md
      malformed.md
      empty.md
  .env.example            # Documented environment config template
  package.json
  Dockerfile
  docker-compose.yml
  .editorconfig
  .gitignore
  LICENSE
```

## Development

```bash
npm run dev    # Start server with auto-restart on changes
npm test       # Run all tests (Node.js built-in test runner)
```

## Deployment

### Synology NAS

1. Install **Container Manager** from Synology Package Center
2. Clone this repo or copy it to your NAS
3. Copy `.env.example` to `.env` and configure
4. Run `docker compose up -d`
5. Access at `http://your-synology:2525`

### Remote access via Tailscale

Install the [Tailscale package for Synology](https://tailscale.com/kb/1131/synology). Access HomepageMD from any device on your tailnet.

### Public sharing via Tailscale Funnel (advanced)

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) can expose HomepageMD to the public internet without port forwarding or a reverse proxy:

```bash
# On your Synology (with Tailscale installed)
tailscale funnel 2525
```

This creates a public URL like `https://your-synology.ts.net` that anyone can access. Combined with `AUTH_TOKEN`, you can allow public read access while protecting write endpoints. Funnel handles HTTPS termination automatically.

**Note:** Without Funnel, HomepageMD is only accessible within your tailnet. URL sharing only works with recipients who are on the same tailnet or have Tailscale node sharing configured.

### Sync

Sync only the `bookmarks/` and `icons/` directories to family devices via Sync.com, Syncthing, or similar. Edits sync to the server, and the dashboard updates live via SSE.

## Accessibility

- Semantic HTML: proper `h1` → `h2` → `h3` heading hierarchy
- `aria-labelledby` on every category and subcategory section
- `role="list"` on bookmark lists (preserved despite CSS resets)
- Skip-to-content link as the first focusable element
- `aria-live="polite"` region announces search results to screen readers
- `:focus-visible` focus indicators on all interactive elements
- Roving `tabindex` — 1 tab stop per bookmark, arrow keys for edit/delete
- `prefers-reduced-motion` — animations only when the user hasn't opted out
- `prefers-color-scheme` — automatic dark mode
- Minimum target size (WCAG 2.5.8) on all buttons and links
- CSS cascade layers for predictable specificity
- Piccalilli modern CSS reset as foundation

## Roadmap

- [x] **v0.1** — Read and render
- [x] **v0.2** — Search, keyboard navigation, skip-to-content
- [x] **v0.3** — Add/edit/delete through the web UI, auth, metadata fetch
- [ ] **v0.4** — Drag-and-drop reordering, documentation site
- [ ] Browser extension — save to dashboard with one click
- [ ] Per-page access control — share individual pages publicly
- [ ] Tags in addition to categories
- [ ] Import from browser bookmark format (Netscape HTML)

## License

[MIT](LICENSE)
