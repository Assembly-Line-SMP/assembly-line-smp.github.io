// ---------- Main orchestrator ----------
// Reads tabs.config.js, builds the nav rail, and lazily loads each tab's
// HTML/CSS/JS the first time it's opened. See tabs.config.js for how to
// add, remove, or toggle tabs.

const pageTitle = document.getElementById("page-title");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const navItemsEl = document.getElementById("nav-items");
const tabRootEl = document.getElementById("tab-root");

const tabs = (window.TABS_CONFIG || []).filter((tab) => tab.enabled);
const loadedStyles = new Set();
const loadedPanels = new Map(); // id -> panel element
let currentView = null;

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeIcon.textContent = isDark ? "light_mode" : "dark_mode";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  localStorage.setItem("theme", theme);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
  applyTheme(initialTheme);
}

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

/* ---------- Nav rail ---------- */
function buildNavRail() {
  tabs.forEach((tab, index) => {
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.view = tab.id;
    button.dataset.selected = index === 0 ? "true" : "false";

    button.innerHTML = `
      <span class="nav-item__indicator">
        <span class="material-symbols-outlined">${tab.icon}</span>
      </span>
      <span class="nav-item__label">${tab.label}</span>
    `;

    button.addEventListener("click", () => activateView(tab.id));
    navItemsEl.appendChild(button);
  });
}

/* ---------- Per-tab asset loading ---------- */
function loadStyle(id) {
  if (loadedStyles.has(id)) return;
  loadedStyles.add(id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `tabs/${id}.css`;
  // Silently ignore tabs that have no CSS file.
  link.onerror = () => link.remove();
  document.head.appendChild(link);
}

function loadScript(id) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `tabs/${id}.js`;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false); // tab has no JS - that's fine
    document.body.appendChild(script);
  });
}

async function loadPanel(tab) {
  if (loadedPanels.has(tab.id)) {
    return loadedPanels.get(tab.id);
  }

  const panel = document.createElement("section");
  panel.className = "view-panel";
  panel.dataset.viewPanel = tab.id;
  panel.hidden = true;

  try {
    const response = await fetch(`tabs/${tab.id}.html`);
    panel.innerHTML = response.ok
      ? await response.text()
      : `<p class="analytics__status">Couldn't load this tab.</p>`;
  } catch (error) {
    console.warn(`Unable to load tabs/${tab.id}.html:`, error);
    panel.innerHTML = `<p class="analytics__status">Couldn't load this tab.</p>`;
  }

  tabRootEl.appendChild(panel);
  loadStyle(tab.id);
  await loadScript(tab.id);

  window.TAB_MODULES?.[tab.id]?.init?.(panel);

  loadedPanels.set(tab.id, panel);
  return panel;
}

/* ---------- View switching ---------- */
async function activateView(viewId) {
  const tab = tabs.find((t) => t.id === viewId) || tabs[0];
  if (!tab) return;

  currentView = tab.id;

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.dataset.selected = item.dataset.view === tab.id ? "true" : "false";
  });

  const panel = await loadPanel(tab);

  document.querySelectorAll(".view-panel").forEach((p) => {
    const isActive = p.dataset.viewPanel === tab.id;
    p.hidden = !isActive;
    p.classList.toggle("view-panel--active", isActive);
  });

  window.TAB_MODULES?.[tab.id]?.onActivate?.(panel);

  pageTitle.textContent = "Create: Assembly Line SMP";
}

/* ---------- Boot ---------- */
initializeTheme();
buildNavRail();
if (tabs.length > 0) {
  activateView(tabs[0].id);
}
