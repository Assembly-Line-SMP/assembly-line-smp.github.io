# Website code
All code for the website is in this directory. Maintained by Pavle012.

## Structure

```
website/
  index.html          shell only: <head>, nav rail container, empty tab-root
  main.js             reads tabs.config.js, builds nav rail, loads tabs on demand
  tabs.config.js       the tab registry - add/remove/enable tabs here
  styles/
    base.css          design tokens, layout, nav rail, shared styles
  tabs/
    <id>.html         tab markup (injected into a <section> at runtime)
    <id>.js           optional tab logic, exposes window.TAB_MODULES.<id>
    <id>.css          optional tab-specific styles
```

## Adding a new tab

1. Create `tabs/<id>.html` with the markup that should appear inside the tab.
2. (Optional) Create `tabs/<id>.js`:
   ```js
   window.TAB_MODULES = window.TAB_MODULES || {};
   window.TAB_MODULES.<id> = {
     init(panelEl) {
       // runs once, the first time this tab is opened
     },
     onActivate(panelEl) {
       // runs every time this tab is opened (optional)
     },
   };
   ```
3. (Optional) Create `tabs/<id>.css` for tab-specific styles.
4. Add an entry to `tabs.config.js`:
   ```js
   { id: "<id>", label: "Display name", icon: "material_symbol_name", enabled: true }
   ```

That's it - `main.js` handles wiring the nav button, fetching the HTML,
loading the CSS/JS, and calling `init`/`onActivate` automatically.

## Removing / disabling a tab (self-hosting)

To hide a tab without deleting anything, set `enabled: false` on its entry
in `tabs.config.js`. See the `season` tab for an example - it ships
disabled by default.

To remove a tab entirely, delete its entry from `tabs.config.js` and
(optionally) delete its `tabs/<id>.*` files. No other file needs to change.

## Notes

- `server.py` (project root) serves this folder as-is and proxies
  `/api/chat` and `/api/<table>` - no changes needed when adding/removing tabs.
- Tabs are lazy-loaded: a tab's HTML/CSS/JS is only fetched the first time
  a user clicks it, and stays in the DOM (just hidden) after that.
- Chat polling and Chart.js instances keep running once started, even if
  you switch to another tab - this is intentional (matches original behavior).
