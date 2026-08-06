// ---------- Suggest a Mod: client logic ----------
// All data (search, suggestions, votes, auth) is proxied through the
// backend on raspi.kubabin.dev (see main.py). This page never talks to
// Modrinth or Discord directly.

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "/suggest/api"
  : "https://raspi.kubabin.dev/suggest/api";

const AUTH_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "/suggest/auth"
  : "https://raspi.kubabin.dev/suggest/auth";

/* ---------- Theme (same pattern as s1/s2 main.js) ---------- */
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

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
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

initializeTheme();

/* ---------- Toast ---------- */
const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("toast--visible"), 2600);
}

/* ---------- Auth ---------- */
const authArea = document.getElementById("auth-area");
let currentUser = null; // { id, username, avatar } or null

async function loadAuthState() {
  try {
    const res = await fetch(`${AUTH_BASE}/me`, { credentials: "include" });
    if (res.ok) {
      currentUser = await res.json();
    } else {
      currentUser = null;
    }
  } catch {
    currentUser = null;
  }
  renderAuthArea();
}

function renderAuthArea() {
  authArea.innerHTML = "";
  if (currentUser) {
    const el = document.createElement("div");
    el.className = "auth-user";
    el.innerHTML = `
      <img class="auth-user__avatar" src="${currentUser.avatar_url}" alt="" />
      <span>${currentUser.username}</span>
    `;
    authArea.appendChild(el);
  } else {
    const btn = document.createElement("a");
    btn.className = "auth-login-button";
    btn.href = `${AUTH_BASE}/login?redirect=${encodeURIComponent(window.location.href)}`;
    btn.innerHTML = `<span class="material-symbols-rounded">login</span> Login with Discord`;
    authArea.appendChild(btn);
  }
}

function requireLogin() {
  if (!currentUser) {
    showToast("Log in with Discord to do that.");
    return false;
  }
  return true;
}

/* ---------- Modrinth search (proxied through backend) ---------- */
const searchInput = document.getElementById("search-input");
const searchResultsEl = document.getElementById("search-results");
let searchDebounce = null;
let existingSlugs = new Set(); // filled in once suggestions load

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const query = searchInput.value.trim();
  if (!query) {
    searchResultsEl.style.display = "none";
    return;
  }
  searchDebounce = setTimeout(() => runSearch(query), 300);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".suggest-search")) {
    searchResultsEl.style.display = "none";
  }
});

async function runSearch(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("search failed");
    const data = await res.json();
    renderSearchResults(data.hits || []);
  } catch {
    searchResultsEl.innerHTML = `<p class="suggest-empty">Search failed. Try again in a moment.</p>`;
    searchResultsEl.style.display = "block";
  }
}

function renderSearchResults(hits) {
  if (hits.length === 0) {
    searchResultsEl.innerHTML = `<p class="suggest-empty">No mods found.</p>`;
    searchResultsEl.style.display = "block";
    return;
  }

  searchResultsEl.innerHTML = "";
  hits.forEach((hit) => {
    const alreadySuggested = existingSlugs.has(hit.slug);
    const alreadyInPack = !!hit.already_in_pack;
    const blocked = alreadySuggested || alreadyInPack;

    const row = document.createElement("div");
    row.className = "search-result";
    row.innerHTML = `
      <img src="${hit.icon_url || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="search-result__text">
        <div class="search-result__title">${escapeHtml(hit.title)}</div>
        <div class="search-result__desc">${escapeHtml(hit.description || "")}</div>
      </div>
      ${alreadyInPack ? `<span class="search-result__already">Already in modpack</span>` : ""}
      ${!alreadyInPack && alreadySuggested ? `<span class="search-result__already">Already suggested</span>` : ""}
    `;
    if (!blocked) {
      row.addEventListener("click", () => submitSuggestion(hit));
    }
    searchResultsEl.appendChild(row);
  });
  searchResultsEl.style.display = "block";
}

async function submitSuggestion(hit) {
  if (!requireLogin()) return;

  try {
    const res = await fetch(`${API_BASE}/suggestions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modrinth_slug: hit.slug,
        title: hit.title,
        description: hit.description,
        icon_url: hit.icon_url,
      }),
    });

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      showToast(body.detail === "Mod is already in the modpack"
        ? "That mod's already in the modpack."
        : "That mod's already been suggested.");
    } else if (!res.ok) {
      throw new Error("submit failed");
    } else {
      showToast(`Suggested "${hit.title}"!`);
      searchInput.value = "";
      searchResultsEl.style.display = "none";
      await loadSuggestions();
    }
  } catch {
    showToast("Couldn't submit suggestion. Try again later.");
  }
}

/* ---------- Suggestions list ---------- */
const suggestionsListEl = document.getElementById("suggestions-list");
const sortFiltersEl = document.getElementById("sort-filters");
let currentSort = "top";
let suggestionsCache = [];

sortFiltersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  currentSort = chip.dataset.sort;
  [...sortFiltersEl.children].forEach((c) => c.classList.toggle("chip--active", c === chip));
  renderSuggestions();
});

async function loadSuggestions() {
  try {
    const res = await fetch(`${API_BASE}/suggestions`, { credentials: "include" });
    if (!res.ok) throw new Error("load failed");
    const data = await res.json();
    suggestionsCache = data.suggestions || [];
    existingSlugs = new Set(suggestionsCache.map((s) => s.modrinth_slug));
    renderSuggestions();
  } catch {
    suggestionsListEl.innerHTML = `<p class="suggest-empty">Couldn't load suggestions. Try refreshing.</p>`;
  }
}

function renderSuggestions() {
  let items = [...suggestionsCache];

  if (currentSort === "top") {
    items.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else if (currentSort === "new") {
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (currentSort === "added") {
    items = items.filter((s) => s.added);
    items.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  }

  if (items.length === 0) {
    suggestionsListEl.innerHTML = `<p class="suggest-empty">No suggestions yet. Be the first!</p>`;
    return;
  }

  suggestionsListEl.innerHTML = "";
  items.forEach((s) => suggestionsListEl.appendChild(renderSuggestionCard(s)));
}

function renderSuggestionCard(s) {
  const card = document.createElement("div");
  card.className = "suggestion-card";
  if (s.modrinth_slug){
    card.addEventListener("click", (event) => {
      if (event.target.closest(".vote-control")) return; // don't navigate if clicking on vote buttons
      window.open(`https://modrinth.com/mod/${s.modrinth_slug}`, "_blank");
    });
  }
  
  card.style.cursor = s.modrinth_slug ? "pointer" : "default";

  console.log(s);
  const net = s.upvotes - s.downvotes;
  const userVote = s.your_vote; // "up" | "down" | null

  card.innerHTML = `
    <img class="suggestion-card__icon" src="${s.icon_url || ""}" alt="" onerror="this.style.visibility='hidden'" />
    <div class="suggestion-card__body">
      <div class="suggestion-card__title-row">
        <p class="suggestion-card__title">${escapeHtml(s.title)}</p>
        ${s.added ? `<span class="suggestion-card__badge suggestion-card__badge--added">Added</span>` : ""}
      </div>
      <p class="suggestion-card__desc">${escapeHtml(s.description || "")}</p>
      <p class="suggestion-card__meta">Suggested by ${escapeHtml(s.suggested_by || "someone")}</p>
    </div>
    <div class="vote-control">
      <button class="vote-up ${userVote === "up" ? "vote-active--up" : ""}" aria-label="Upvote">
        <span class="material-symbols-rounded">arrow_upward</span>
      </button>
      <span class="vote-control__count">${net}</span>
      <button class="vote-down ${userVote === "down" ? "vote-active--down" : ""}" aria-label="Downvote">
        <span class="material-symbols-rounded">arrow_downward</span>
      </button>
    </div>
  `;

  card.querySelector(".vote-up").addEventListener("click", () => castVote(s.id, "up"));
  card.querySelector(".vote-down").addEventListener("click", () => castVote(s.id, "down"));

  return card;
}

async function castVote(suggestionId, direction) {
  if (!requireLogin()) return;

  try {
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/vote`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) throw new Error("vote failed");
    const updated = await res.json();

    // Merge the updated suggestion back into the cache and re-render.
    const idx = suggestionsCache.findIndex((s) => s.id === suggestionId);
    if (idx !== -1) suggestionsCache[idx] = updated;

    if (updated.added && !suggestionsCache[idx]?.__announced) {
      showToast(`"${updated.title}" reached the threshold and was added!`);
      updated.__announced = true;
    }

    renderSuggestions();
  } catch {
    showToast("Couldn't record your vote. Try again.");
  }
}

/* ---------- Utility ---------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ---------- Init ---------- */
(async function init() {
  await loadAuthState();
  await loadSuggestions();
})();
