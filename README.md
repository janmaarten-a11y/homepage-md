# homepage.md

**A Markdown-powered homepage for your household and every device.**

A household bookmark dashboard that reads Markdown files and renders them as a clean, accessible, searchable web page. Runs as a small Node.js server — designed for a home server, a NAS, or anywhere you can run Docker or Node.js.

## Features

### Core

- **Markdown as source of truth** — edit `.md` files in any text editor, or use the built-in web UI
- **Add, edit, delete** bookmarks through the dashboard — changes write back to Markdown
- **Multiple pages** — each `.md` file in `bookmarks/` becomes a page in the top navigation
- **Categories, subcategories, and tags** — organize bookmarks with headings, subtitles, and filterable tags
- **Real-time search** — filter bookmarks instantly by title, description, URL, or tag (press `/` to focus)
- **Search engine shortcuts** — type `!g climate change` to search Google, `!w cats` for Wikipedia, and more — configurable per page
- **Favicon resolution** — automatic icons via local cache, direct fetch, DuckDuckGo fallback, or manual overrides
- **Live updates** — Server-Sent Events push changes to all open browsers when files change

### Dashboard

- **Weather** — local conditions, forecast, air quality, moon phase, sunrise/sunset, aurora forecast, and weather alerts
- **Speed test** — one-click download and upload speed measurement via Cloudflare

### Customization

- **View modes** — Rows, Columns, or List layout × Detailed or Condensed density, saved per page with an option to apply to all pages
- **Themes** — switchable via the toolbar; ships with Default and Terminal (CRT-inspired green-on-black)
- **Color modes** — System, Light, or Dark — automatic via `prefers-color-scheme` or manual toggle
- **Custom CSS** — override any design token via `custom.css`, which loads after themes and always wins

### Access & security

- **Optional auth** — set `AUTH_TOKEN` to require a passphrase for editing; pages stay readable without logging in
- **Per-page bypass** — mark a page `access: open` to allow anyone to edit it, even when auth is enabled

### Technical

- **No framework** — vanilla Node.js, ES modules, one dependency: [Lucide](https://lucide.dev) for icons
- **Docker-ready** — single container, works on any NAS or server
- **Keyboard accessible** — every feature reachable by keyboard, with shortcuts for common actions

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
| `THEMES_DIR` | `./themes` | Path to the themes directory |
| `FOOTER_PATH` | `./footer.md` | Path to the footer Markdown file |
| `AUTH_TOKEN` | *(none)* | Shared passphrase for write endpoints (disabled by default) |
| `AUTH_COOKIE_DAYS` | `30` | Days the login cookie remains valid |
| `FAVICON_TTL_DAYS` | `7` | Days before a cached favicon is re-fetched |

## Data format

Each `.md` file in the `bookmarks/` directory is a page. The grammar:

```markdown
# Page Title
  - location: City, State
  - access: open    # if you want anyone to be able to write it
  - bang: !g https://google.com/search?q=%s
  - bang: !w https://en.wikipedia.org/w/index.php?search=%s 

> [!WELCOME] Welcome!
> Your household dashboard for bookmarks and quick searches.

## Category Name
  - icon: home
  - subtitle: A short description of this category

### Subcategory Name
  - icon: server
  - subtitle: A short description of this subcategory

- [Bookmark Title](https://example.com)
  - description: A short description (max 160 chars)
  - tags: tailscale, admin
  - icon: https://example.com/custom-icon.png
```

### Rules

- `# Heading 1` — page title (one per file)
- `- location:` — location for the weather widget (indented, under the title)
- `- access: open` — allows anyone to edit this page without logging in (indented, under the title)
- `- bang: !prefix url` — search bang shortcut; `%s` is replaced with the query (indented, under the title)
- `> [!WELCOME] Title` — welcome banner with optional description on subsequent `>` lines
- `## Heading 2` — category
- `### Heading 3` — subcategory (within the parent category)
- `- icon: name` — Lucide icon shown next to a category or subcategory heading (see [lucide.dev/icons](https://lucide.dev/icons))
- `- subtitle:` — description shown under a category or subcategory heading
- `- [Title](URL)` — bookmark
- `- description: text` — description (indented, under a bookmark)
- `- tags: a, b, c` — comma-separated tags for filtering and organization (indented, under a bookmark)
- `- icon: url` — custom icon override (indented, under a bookmark)
- Everything else is silently ignored — add comments, notes, or blank lines freely

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus the search field |
| `?` | Open the keyboard shortcuts dialog |
| `Escape` | Clear search, close dialogs, or return focus to the page |
| `→` / `↓` | From a bookmark link, move to Edit → Copy URL |
| `←` / `↑` | Reverse: Copy URL → Edit → Link |
| `Tab` | Move to the next bookmark (skips edit/delete buttons) |

When search is focused, type `!` to see available search bangs. Type a bang prefix followed by a query (e.g., `!g climate change`) and press `Enter` to search in a new tab.

## View modes

The **View** dropdown in the header offers:

- **Layout**: Rows (card grid) / Columns (subcategories as horizontal columns) / List (full-width inline rows)
- **Density**: Detailed (shows descriptions) / Condensed (hides descriptions, tighter padding)
- **Theme**: Default / Terminal (or any custom theme in `themes/`)
- **Color mode**: System / Light / Dark
- **Apply to all pages**: Promotes the current settings as the global default

Preferences are saved per page in the browser's `localStorage`. The "Apply to all pages" button saves the current page's settings as the default for all pages and clears per-page overrides.

## Authentication

When `AUTH_TOKEN` is set, homepage.md operates in a **read-open, write-gated** mode:

- **Without logging in** — visitors can browse bookmarks, use search, view weather, and run speed tests. Edit controls (Add Link, Edit, Copy URL, Edit Location) are hidden.
- **After logging in** — a "Log in to edit" link in the footer opens a passphrase dialog. On success, a cookie is set and edit controls appear. A "Log out" link replaces it.

The login cookie is HttpOnly and SameSite=Lax. Its lifetime is controlled by `AUTH_COOKIE_DAYS` (default: 30 days).

### Per-page bypass

To allow anyone to edit a specific page without logging in, add `access: open` under the page title:

```markdown
# Kids' Bookmarks
  - access: open
```

Pages with `access: open` show edit controls for all visitors and skip auth on write endpoints. All other pages remain protected.

## API

All write endpoints are protected by `AUTH_TOKEN` when configured. Pages with `access: open` bypass auth for writes.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/{slug}` | Render a bookmark page |
| `POST` | `/api/bookmarks/{slug}` | Add a bookmark |
| `PUT` | `/api/bookmarks/{slug}` | Update a bookmark |
| `DELETE` | `/api/bookmarks/{slug}` | Remove a bookmark |
| `POST` | `/api/metadata` | Fetch title and description from a URL |
| `GET` | `/api/weather/{slug}` | Fetch weather data for a page's location |
| `PUT` | `/api/location/{slug}` | Update the location for a page |
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

Available tokens: `--color-bg`, `--color-text`, `--color-primary`, `--color-primary-hover`, `--color-danger`, `--color-surface`, `--color-border`, `--color-focus`, `--color-muted`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-base`, `--font-mono`. Tooltip colors (`--tooltip-bg`, `--tooltip-fg`) are scoped to `.c-tooltip`. See `custom.css` for the full list.

## Themes

Themes are CSS files in the `themes/` directory. The server discovers them at startup and lists them in the View options toolbar.

To create a theme:

1. Create a new `.css` file in `themes/` (e.g., `themes/ocean.css`)
2. Override design tokens (`:root { --color-bg: ...; }`) and/or component styles
3. For light/dark mode support, add `.is-light` and `.is-dark` selectors
4. Restart the server — the theme appears in the toolbar automatically

The built-in Terminal theme (`themes/terminal.css`) is a full example: CRT-inspired green-on-black with scanlines, monospace typography, and outlined elements.

`custom.css` loads after the active theme, so user overrides always win.

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
      writer.js           # Markdown write-back (add/edit/delete, location update)
      auth.js             # Optional AUTH_TOKEN middleware
      metadata.js         # Page title/description fetcher
      weather.js          # Weather data (Open-Meteo, NWS, AQI, astronomy)
      lucide.js           # Lucide icon resolver (SVG lookup by name)
    public/
      styles/
        main.css          # App styles (cascade layers, Piccalilli reset)
      scripts/
        app.js            # Client: search, keyboard nav, view modes, CRUD, weather, speed test, tooltips
  bookmarks/
    homepage.md           # Default bookmarks file (household example)
  themes/
    default.css           # Default theme (empty — uses main.css tokens)
    terminal.css          # CRT-inspired terminal theme
  icons/                  # Manual favicon overrides
  favicon-cache/          # Auto-fetched cached icons (Docker volume)
  custom.css              # User style overrides
  footer.md               # Footer content (Markdown)
  test/
    server/
      parser.test.js      # Markdown parser tests
      favicon.test.js     # Favicon resolution tests
      renderer.test.js    # HTML rendering tests
      writer.test.js      # Write-back tests
      auth.test.js        # Authentication tests
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

### Docker (recommended)

homepage.md ships with a `Dockerfile` and `docker-compose.yml`. On any machine with Docker:

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
cp .env.example .env    # edit to customize
docker compose up -d
```

Access at `http://your-server:2525`.

To persist data across container rebuilds, mount `bookmarks/`, `icons/`, `favicon-cache/`, and `custom.css` as volumes.

### Node.js

On any machine with Node.js 22+:

```bash
git clone https://github.com/janmaarten-a11y/homepage-md.git
cd homepage-md
npm install
cp .env.example .env
npm start
```

### NAS devices

Most NAS devices (Synology, QNAP, Unraid, etc.) support Docker via their package managers. Clone the repo to your NAS, configure `.env`, and run `docker compose up -d`.

### Remote access

For access outside your local network, use a VPN (e.g., Tailscale, WireGuard) or a reverse proxy with HTTPS. When exposing to the internet, set `AUTH_TOKEN` to protect write endpoints.

### Sync

Sync the `bookmarks/` and `icons/` directories to other devices via Syncthing, Dropbox, or similar. Edits sync to the server, and the dashboard updates live via SSE.

## Accessibility

**homepage.md** is a personal project, but is designed to work well for everyone including people who use screen readers, keyboard-only navigation, or other assistive technologies. In addition to skip links, respecting reduced motion, and clear focus indicators, a lot of work has gone into keyboard accessibility. Every feature works without a mouse. A single tab stop per bookmark keeps navigation fast; arrow keys reveal edit and copy actions. Press `/` to jump to search and `?` for the full shortcut list.

## Roadmap

- **Cross-page search** — search bookmarks across all pages, not just the current one
- **More themes** — additional built-in themes beyond Default and Terminal
- **Drag-and-drop reordering** — rearrange bookmarks and categories visually

## License

[MIT](LICENSE)
