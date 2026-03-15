# HomepageMD

**Your bookmarks, in Markdown. Your homepage, everywhere.**

A household bookmark dashboard that reads Markdown files and renders them as a clean, accessible, searchable web page. Runs as a small Node.js server on a home server (Synology NAS), accessible locally and remotely via Tailscale.

## Features (v0.1)

- Markdown files as the source of truth for bookmarks
- Categories (`##`) and subcategories (`###`) with proper heading hierarchy
- Favicon resolution: manual overrides → inline overrides → local cache → direct fetch → DuckDuckGo → placeholder
- Multi-page support — each `.md` file in `bookmarks/` becomes a navigable page
- Dark mode via `prefers-color-scheme`
- Live updates via Server-Sent Events when Markdown files change
- Customizable via CSS custom properties (`custom.css`)
- Docker-ready for Synology NAS deployment

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
docker compose up -d
```

Open `http://localhost:3000` in your browser.

### Local development

Requires Node.js 22+.

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
npm install
npm run dev
```

## Configuration

All configuration is via environment variables (set in `docker-compose.yml` or your shell):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DEFAULT_PAGE` | `homepage` | The `.md` filename (without extension) served at `/` |
| `BOOKMARKS_DIR` | `./bookmarks` | Path to the bookmarks directory |
| `ICONS_DIR` | `./icons` | Path to manual favicon overrides |
| `FAVICON_CACHE_DIR` | `./favicon-cache` | Path to the favicon cache |
| `CUSTOM_CSS_PATH` | `./custom.css` | Path to the user CSS overrides file |
| `AUTH_TOKEN` | *(none)* | Shared passphrase for write endpoints (optional) |
| `FAVICON_TTL_DAYS` | `7` | Days before a cached favicon is considered stale |

## Data format

Each `.md` file in the `bookmarks/` directory is a page. The Markdown grammar:

```markdown
# Page Title

## Category Name

### Subcategory Name

- [Bookmark Title](https://example.com)
  - description: A short description of the bookmark
  - icon: https://example.com/custom-icon.png
```

### Rules

- `# Heading 1` — page title (one per file)
- `## Heading 2` — category
- `### Heading 3` — subcategory (within the parent category)
- `- [Title](URL)` — bookmark
- `- description: text` — bookmark description (indented under a bookmark)
- `- icon: url` — inline icon override (indented under a bookmark)
- Everything else is silently ignored

## Favicon resolution

Icons are resolved in this order:

1. **Manual override** — `icons/{domain}.{png,svg,ico,webp}`
2. **Inline override** — `icon:` metadata in the Markdown file
3. **Local cache** — `favicon-cache/` (refreshed on file change, 7-day TTL)
4. **Direct fetch** — parse the target page's `<link rel="icon">` tag server-side (with SSRF protection)
5. **DuckDuckGo fallback** — `https://icons.duckduckgo.com/ip3/{domain}.ico`
6. **Generic placeholder** — default bookmark icon

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

See `custom.css` for the full list of available custom properties.

## Project structure

```
homepage-md/
  src/
    server/
      index.js            # HTTP server, SSE, file watcher
      config.js           # Environment variable configuration
      parser.js           # Markdown → structured data
      favicon.js          # Favicon resolution chain
      renderer.js         # HTML page generation
      writer.js           # Write-back to Markdown (v0.3)
    public/
      styles/
        main.css          # App styles (cascade layers)
      scripts/
        app.js            # Client-side enhancements (SSE listener)
  bookmarks/
    homepage.md           # Default bookmarks file
  icons/                  # Manual favicon overrides
  favicon-cache/          # Auto-fetched cached icons (Docker volume)
  custom.css              # User style overrides
  test/
    server/
      parser.test.js
      favicon.test.js
    fixtures/
      valid.md
      malformed.md
      empty.md
  package.json
  Dockerfile
  docker-compose.yml
  .editorconfig
  .gitignore
```

## Development

```bash
# Run in development mode (auto-restart on changes)
npm run dev

# Run tests
npm test
```

## Deployment

### Synology NAS

1. Install **Container Manager** from Synology Package Center
2. Clone this repo to your NAS or copy via `scp`
3. Run `docker compose up -d`
4. Access at `http://your-synology:3000`

### Remote access via Tailscale

Install the [Tailscale package for Synology](https://tailscale.com/kb/1131/synology). Access HomepageMD from any device on your tailnet at `http://your-synology:3000`.

### Sync

Sync only the `bookmarks/` and `icons/` directories to family devices via Sync.com, Syncthing, or similar. Edits sync to the server, and the dashboard updates live.

## Roadmap

- **v0.1** — Read and render (current)
- **v0.2** — Client-side search, keyboard navigation, skip-to-content link
- **v0.3** — Add/edit/delete bookmarks through the web UI
- **v0.4** — Drag-and-drop reordering, WCAG 2.2 audit, documentation site

## License

[MIT](LICENSE)
