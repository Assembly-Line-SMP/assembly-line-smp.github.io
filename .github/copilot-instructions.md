# Copilot instructions

## Project overview

This repository is a static GitHub Pages website for Assembly Line SMP. It has no package manager, build step, or application framework:

- `index.html`, `landing.css`, `landing.js`, and `backgrounds/` form the landing page.
- `s1/`, `s2/`, and `s3/` are separate season deployments. Each season is a standalone page shell with a shared tab-based UI pattern.
- `suggest/` contains the mod-suggestion and voting frontend; `suggest/admin/` contains its admin frontend.
- `server.py` is a local-only development/proxy server. It is not used by GitHub Pages.
- `.github/workflows/static.yml` publishes the entire repository root to GitHub Pages when `main` is pushed.

The live pages depend on remote APIs. Do not assume that the browser UI can be fully exercised by opening HTML files directly.

## Build, preview, and validation

There is no build or package install step.

Preview the local site:

```bash
python3 server.py
```

The server listens on `http://localhost:8000`. It currently maps `/s1/` and `/s2/`, the landing page, and `/suggest/` with its API/auth proxies. Opening a `/s1/` or `/s2/` tab in a browser requires the backend endpoints to be reachable.

Useful preview URLs:

- `http://localhost:8000/`
- `http://localhost:8000/s1/`
- `http://localhost:8000/s2/`
- `http://localhost:8000/suggest/`
- `http://localhost:8000/suggest/admin/`

There is no Jest, Vitest, lint configuration, or other automated test runner. The repository's only standalone fetch script is:

```bash
python3 test-fetch.py
```

This is a continuous, polling chat viewer, not a test suite; stop it with `Ctrl+C`. It has no mode for running a single test.

For Python syntax-only checks:

```bash
python3 -m compileall server.py test-fetch.py
```

Validate JavaScript and frontend changes in a browser against the appropriate season or suggestion route. There is no headless-browser test command configured.

## Architecture and data flow

### Season pages

Each season index is a shell containing a nav rail and `#tab-root`; `tabs.config.js` is the tab registry and `main.js` performs lazy loading. The main orchestrator:

1. Filters `window.TABS_CONFIG` by `enabled`.
2. Builds navigation buttons.
3. Fetches `tabs/<id>.html` the first time a tab is activated.
4. Dynamically loads `tabs/<id>.css` and `tabs/<id>.js`, when present.
5. Calls `window.TAB_MODULES.<id>.init(panelEl)` once and `onActivate(panelEl)` on later activations.
6. Stores loaded panels and keeps them mounted, hidden by `hidden` and active CSS classes.

Tab modules are global IIFEs that extend `window.TAB_MODULES`. They should use the init/onActivate lifecycle rather than initializing from module load unless there is a deliberate need for background behavior.

The season implementations are not completely identical:

- `s1/` currently contains a seasonal goodbye and map tab.
- `s2/` contains map, chat, and analytics tabs.
- `s3/` contains map and chat tabs in the tab system. It also retains legacy `script.js` files that are not loaded by the current season `index.html` shells.

Chat and analytics polling/fetching intentionally remains active after its tab is loaded. `main.js` does not unmount or stop tab modules.

### API routing

Browser code selects API hosts by `window.location.hostname`:

- On `localhost` or `127.0.0.1`, season and suggestion code uses relative local routes.
- In production, it uses the explicit remote `kubabin.dev`/`raspi.kubabin.dev` endpoints.

`server.py` preserves this split by serving the static folders and reverse-proxying API requests. It also infers `/api/*` season context from the HTTP Referer for bare s1 calls. Keep local and production URL behavior synchronized when changing API endpoints.

The analytics whitelist in `server.py` is explicit (`daily_player_peaks`, `global_player_peaks`, `player_count_samples`, `player_stats`). Unknown table names are rejected rather than forwarded.

### Suggestion frontend

`suggest/suggest.js` owns Discord auth state, Modrinth search, suggestion submission, sorting, and voting. API calls use credentialed requests and the `raspi.kubabin.dev` backend in production. `suggest/admin/admin.js` is a separate authenticated admin UI over the `/suggest/api/admin/*` endpoints.

Keep user-visible strings escaped with `escapeHtml()` before inserting API or user content into HTML. Preserve `credentials: "include"` for authenticated suggestion and admin requests.

## Repository conventions

- Add or remove a season tab by editing that season's `tabs.config.js`; create `tabs/<id>.html`, plus optional `tabs/<id>.js` and `tabs/<id>.css`, in the same season directory. Do not add a tab to every season unless it is intended for every season.
- Tab IDs are used consistently in nav `data-view` attributes, panel `data-view-panel` attributes, hashes, asset paths, and `window.TAB_MODULES`.
- Tab assets are relative to the season directory, for example `tabs/analytics.css`, not repository-root paths.
- Season UI copies share structure and CSS conventions, but season-specific API bases must remain in their own chat and analytics modules.
- Shared theme behavior is implemented with `data-theme="dark|light"` and the existing CSS variables/localStorage key `theme`.
- Material Symbols and Google Fonts are CDN-loaded in the season and suggestion HTML; preserve these dependencies or update the HTML loading them consistently.
- Lazy-loading is intentional. Tab HTML and scripts must tolerate only being loaded after user activation and must be safe to initialize once.
- Remote API payload shapes are often normalized or tolerated as arrays, nested objects, or multiple field names, especially in chat code. Follow the existing normalization pattern instead of assuming one exact payload shape.
- The GitHub Pages deployment uploads `.` unchanged. Do not add a generated `dist/` step or require Node-based build output to deploy.
