# Copilot Instructions — HomepageMD

## Architecture Overview

Server-rendered MPA (Node.js 22+, ES modules, zero dependencies beyond `lucide-static`) serving a household bookmark dashboard. Each Markdown file in `bookmarks/` becomes a page. The server parses Markdown, resolves favicons, fetches weather data, and renders full HTML documents. Client-side JS handles search, keyboard navigation, view mode switching, CRUD forms, tooltips, weather panel, and speed test.

**Runtime:** Custom HTTP server on port 2525 with SSE for live updates and `fs.watch` for file change detection.

**Deployment:** Docker (`node:22-alpine`), docker-compose, designed for Synology NAS with Tailscale.

## Project Structure

```
bookmarks/          Markdown bookmark pages (one file per page)
config/             User-customizable files (mounted as single Docker volume)
  bangs.md          Search shortcut definitions (!g, !w, etc.)
  custom.css        User CSS overrides (loaded last, always wins)
  footer.md         Footer content (Markdown)
icons/              Manual favicon overrides (domain.{png,svg,ico,webp})
favicon-cache/      Auto-populated favicon disk cache (Docker named volume)
themes/             Theme CSS files (default.css, terminal.css, ...)
src/
  server/
    index.js        HTTP server, API routes, SSE, file watcher, static serving
    renderer.js     Full HTML page generation (no templating framework)
    parser.js       Markdown → structured data (pages + bangs)
    writer.js       Markdown write-back (CRUD + location updates)
    weather.js      Open-Meteo forecast, NWS alerts, AQI, moon phase, aurora
    favicon.js      Favicon resolution chain (SSRF-protected, stale-while-revalidate)
    config.js       Environment variable configuration
    auth.js         Optional token-based auth (timing-safe comparison)
    metadata.js     Fetch page <title> + <meta description> for URL (SSRF-safe)
    lucide.js       Resolve Lucide icon SVGs by name from lucide-static package
  public/
    scripts/app.js  All client-side interactivity (~1700 lines)
    styles/main.css All styles in CSS cascade layers
test/
  server/           Node.js built-in test runner (node --test)
```

## API Routes

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| GET | `/` | Redirect to default page | No |
| GET | `/{slug}` | Render bookmark page | No |
| POST | `/api/bookmarks/{slug}` | Add bookmark | Yes* |
| PUT | `/api/bookmarks/{slug}` | Update bookmark | Yes* |
| DELETE | `/api/bookmarks/{slug}` | Delete bookmark | Yes* |
| POST | `/api/metadata` | Fetch URL title/description | Yes |
| GET | `/api/weather/{slug}` | Weather data for page location | No |
| PUT | `/api/location/{slug}` | Update page location | Yes* |
| POST | `/api/auth` | Login (set auth cookie) | No |
| POST | `/api/auth/logout` | Logout (clear cookie) | No |
| GET | `/api/auth/status` | Check if authenticated | No |
| GET | `/api/events` | SSE stream for live updates | No |

\* Pages with `access: open` metadata bypass auth for write operations.

All write endpoints require CSRF header: `X-Requested-With: HomepageMD`. Rate limits are IP-based and in-memory.

## Markdown Format

```markdown
# Page Title

- location: Seattle, WA
- access: open

> [!WELCOME] Optional banner title
> Optional multi-line description

## Category Name
- subtitle: Optional category description
- icon: lucide-icon-name

### Subcategory Name
- subtitle: Optional
- icon: server

- [Bookmark Title](https://example.com)
  - description: Max 160 chars
  - icon: https://custom-icon-url.com/icon.png
  - tags: tag1, tag2, tag3
```

### Bangs (`config/bangs.md`)

```markdown
- !g https://www.google.com/search?q=%s&udm=14
- !w https://en.wikipedia.org/w/index.php?search=%s
- !copilot https://copilot.microsoft.com/?q=%s [Copilot prompt]
```

Format: `- !prefix url-with-%s-placeholder [optional custom label]`

## Styling Conventions

- **CSS cascade layers:** `@layer config, resets, components, utilities`
- **OKLCH colors** with CSS custom properties — see `:root` in `main.css`
- **CSS logical properties** (`inline-size`, `block-size`, `inset-inline-*`) — never `width`/`height`/`top`/`left`
- **BEM-ish naming:** `.c-component__element--modifier` for components, `.u-utility` for utilities, `.js-hook` for JS targets
- **Inter font** via Bunny Fonts CDN
- **Icons:** Lucide (via `lucide-static` npm package) resolved server-side as inline SVGs with `aria-hidden="true"`
- Use CSS custom properties for all colors — never raw `hex` or raw `oklch()` in component rules
- Minimum font-size: `1rem` (project convention)
- Theme overrides use the same custom properties; `config/custom.css` loads last and always wins
- Dark mode via `prefers-color-scheme` + manual overrides in `.is-light` / `.is-dark` body classes

## Accessibility Standards

- **WCAG 2.2 Level AA** as the goal
- All interactive elements keyboard-accessible with visible focus indicators
- Tooltips: Primer-style, `aria-describedby` for description type, `aria-labelledby` for label type, `:focus-visible` only, Escape to dismiss
- No `title` attributes (not accessible) — use tooltips instead
- No toasts — use inline status messages with `aria-live`
- No text truncation without accessible alternative
- Minimum 1rem font sizes
- `aria-label` only on interactive elements and landmarks
- Screen reader announcements via `aria-live="polite"` regions
- All icons are decorative (`aria-hidden="true"`) — accompanying text provides meaning
- Bookmark actions use `tabindex="-1"` for roving focus managed via keyboard navigation

## Security

- **SSRF protection**: Favicon and metadata fetches validate DNS-resolved IPs against all private/reserved RFC ranges before connecting. Redirect targets are re-validated.
- **Auth**: Timing-safe token comparison (`crypto.timingSafeEqual`). HttpOnly, SameSite=Lax cookies.
- **CSRF**: All write endpoints require `X-Requested-With: HomepageMD` header.
- **Rate limiting**: IP-based, in-memory, per operation type (5–30/min depending on endpoint).
- **Path traversal**: Static file serving uses `path.resolve()` normalization to verify paths stay within allowed directories.
- **Input validation**: Only `http://` and `https://` URLs accepted. Description capped at 160 chars.
- **HTML escaping**: `escapeHtml()` (& < > ") and `escapeAttr()` (+ ') applied to all user content before rendering.

## Favicon Resolution Chain

1. Manual override — `icons/{domain}.{png,svg,ico,webp}`
2. Inline metadata — `icon:` value from bookmark
3. Local cache (fresh) — `favicon-cache/{domain}.{ext}` within TTL
4. Direct fetch — parse target page `<link rel="icon">` (SSRF-safe)
5. DuckDuckGo fallback — `https://icons.duckduckgo.com/ip3/{domain}.ico`
6. Stale cache fallback — expired cached icon preferred over generic placeholder
7. Generic placeholder — `/icons/default.svg`

Cache uses stale-while-revalidate: expired icons are served as fallback while re-fetch is attempted. A 24-hour background refresh keeps icons current. Files are only deleted after 10× TTL (abandoned entries).

## Development Commands

```bash
npm run dev    # Start server with --watch (auto-restart on changes)
npm test       # Node.js built-in test runner (node --test)
npm start      # Production start (requires .env file)
```

## Testing Patterns

- **Runner:** Node.js built-in test runner (`node:test`)
- **Assertions:** `node:assert/strict`
- **Structure:** `describe` / `it` blocks, pure-function unit tests
- **Fixtures:** `test/fixtures/` with `.md` files (valid, empty, malformed)
- **Renderer tests:** Pass mock data to `renderPage()`, assert HTML output with regex/includes
- **Writer tests:** Use `tmp` directory, write fixture → mutate → re-parse → assert structure

## Code Patterns

- ES modules throughout (`import`/`export`), no CommonJS
- Single dependency: `lucide-static` for icon SVGs
- Server renders complete HTML documents — no client-side templating framework
- Client JS uses delegated event listeners and `document.querySelector` — no virtual DOM
- View preferences stored per-page in `localStorage` (`homepage-md-view-{slug}`), with global fallback (`homepage-md-view`)
- Theme preference stored in cookie (`homepage-md-theme`) for FOUC prevention
- SSE suppression flag in `sessionStorage` prevents double-reload after CRUD operations
- Focus restoration after edit: save bookmark URL → find after reload → focus edit button
- Atomic file writes in `writer.js`: write to `.tmp` then `rename()` to prevent corruption
- Weather data cached 30 minutes in-memory; geocode cached indefinitely
- Favicon disk cache uses named Docker volume for persistence across container restarts

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `2525` | Server port |
| `DEFAULT_PAGE` | `homepage` | Slug of the default bookmark page |
| `BOOKMARKS_DIR` | `./bookmarks` | Directory containing bookmark `.md` files |
| `ICONS_DIR` | `./icons` | Directory for manual favicon overrides |
| `FAVICON_CACHE_DIR` | `./favicon-cache` | Favicon disk cache directory |
| `CUSTOM_CSS_PATH` | `./config/custom.css` | Path to user CSS overrides |
| `FOOTER_PATH` | `./config/footer.md` | Path to footer Markdown content |
| `BANGS_PATH` | `./config/bangs.md` | Path to search shortcuts file |
| `THEMES_DIR` | `./themes` | Directory containing theme CSS files |
| `AUTH_TOKEN` | *(none)* | Passphrase for write access (disabled when unset) |
| `AUTH_COOKIE_DAYS` | `30` | Auth cookie expiration in days |
| `FAVICON_TTL_DAYS` | `7` | Days before cached favicons are re-fetched |
