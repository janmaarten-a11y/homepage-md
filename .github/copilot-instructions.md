# Copilot Instructions — HomepageMD

## Architecture Overview

Server-rendered MPA (Node.js 22+, ES modules, zero frameworks) serving a household bookmark dashboard. Each Markdown file in `bookmarks/` becomes a page. The server parses Markdown, resolves favicons, fetches weather data, and renders full HTML documents. Client-side JS handles search, keyboard navigation, view mode switching, CRUD forms, tooltips, weather panel, and speed test.

**Runtime:** Custom HTTP server on port 2525 with SSE for live updates and `fs.watch` for file change detection.

**Deployment:** Docker (`node:22-alpine`), docker-compose, designed for Synology NAS with Tailscale.

## Key Files

- **`src/server/index.js`** — HTTP server, API routes, SSE, file watcher, theme scanning, static file serving
- **`src/server/renderer.js`** — Full HTML page generation (header, toolbar, dialogs, bookmarks, footer)
- **`src/server/parser.js`** — Markdown → structured data (title, location, bangs, categories, bookmarks)
- **`src/server/writer.js`** — Markdown write-back for CRUD operations and location updates
- **`src/server/weather.js`** — Open-Meteo + NWS alerts + AQI + astronomy data
- **`src/server/favicon.js`** — Favicon resolution chain (SSRF-protected)
- **`src/server/config.js`** — Environment variable configuration
- **`src/public/scripts/app.js`** — All client-side interactivity (~1700 lines): tooltips, search, keyboard nav, view modes, CRUD, weather, speed test, SSE
- **`src/public/styles/main.css`** — All styles in CSS cascade layers (`@layer config, resets, components, utilities`), OKLCH colors, CSS logical properties
- **`themes/terminal.css`** — CRT-inspired terminal theme (green-on-black, scanlines, monospace)

## Styling Conventions

- **CSS cascade layers:** `@layer config, resets, components, utilities`
- **OKLCH colors** with CSS custom properties — see `:root` in `main.css`
- **CSS logical properties** (`inline-size`, `block-size`, `inset-inline-*`) — no `width`/`height`/`top`/`left`
- **BEM-ish naming:** `.c-component__element--modifier` for components, `.u-utility` for utilities, `.js-hook` for JS targets
- **Inter font** via Bunny Fonts CDN
- **Icons:** Lucide (via `lucide-static` npm package) resolved server-side as inline SVGs
- Use CSS custom properties for all colors — never raw hex or raw oklch in component rules
- Minimum font-size: `1rem` (project convention)
- Theme overrides use the same custom properties; `custom.css` loads last and always wins

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

## Development Commands

```bash
npm run dev    # Start server with file watching
npm test       # Node.js built-in test runner
```

## Code Patterns

- ES modules throughout (`import`/`export`)
- Server renders complete HTML — no client-side templating framework
- Client JS uses delegated event listeners and `document.querySelector`
- View preferences stored per-page in `localStorage` (`homepage-md-view-{slug}`), with global fallback (`homepage-md-view`)
- Theme preference also stored in cookie for FOUC prevention
- SSE suppression flag in `sessionStorage` prevents double-reload after CRUD operations
- Focus restoration after edit: save bookmark URL → find after reload → focus edit button
