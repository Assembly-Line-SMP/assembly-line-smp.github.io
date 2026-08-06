// ---------- Admin panel logic ----------
// Auth here is a single shared token (see main.py: ADMIN_TOKEN), sent as
// a Bearer token on every admin API call. It is stored in sessionStorage
// only (cleared when the tab closes) — this is a simple shared-secret
// gate, not a real per-user login system.

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "/suggest/api"
  : "https://raspi.kubabin.dev/suggest/api";

/* ---------- Theme ---------- */
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeIcon.textContent = isDark ? "light_mode" : "dark_mode";
  localStorage.setItem("theme", theme);
}

(function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
})();

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

/* ---------- Toast ---------- */
const toastEl = document.getElementById("toast");
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  setTimeout(() => toastEl.classList.remove("toast--visible"), 2600);
}

/* ---------- Token gate ---------- */
const loginGate = document.getElementById("login-gate");
const adminContent = document.getElementById("admin-content");
const tokenInput = document.getElementById("admin-token-input");
const loginBtn = document.getElementById("admin-login-btn");
const loginError = document.getElementById("admin-login-error");

function getToken() {
  return sessionStorage.getItem("admin_token");
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

async function tryToken(token) {
  const res = await fetch(`${API_BASE}/admin/suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

loginBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  loginError.style.display = "none";
  const ok = await tryToken(token);
  if (ok) {
    sessionStorage.setItem("admin_token", token);
    enterAdmin();
  } else {
    loginError.style.display = "block";
  }
});

tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

function enterAdmin() {
  loginGate.style.display = "none";
  adminContent.style.display = "block";
  loadThreshold();
  loadAdminList();
  loadExistingModsCount();
}

/* ---------- Existing mods (duplicate check) sync ---------- */
const existingModsCountEl = document.getElementById("existing-mods-count");
const syncModsBtn = document.getElementById("sync-mods-btn");
const syncModsManualBtn = document.getElementById("sync-mods-manual-btn");
const syncModsInput = document.getElementById("sync-mods-input");

async function loadExistingModsCount() {
  const res = await fetch(`${API_BASE}/admin/existing-mods`, { headers: authHeaders() });
  if (!res.ok) {
    existingModsCountEl.textContent = "Couldn't load.";
    return;
  }
  const data = await res.json();
  existingModsCountEl.textContent = `${data.count} mod${data.count === 1 ? "" : "s"} tracked as already in the pack.`;
}

async function runSync(button, url, body) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Syncing…";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || "sync failed");
    }
    const data = await res.json();
    showToast(`Synced ${data.synced} mod(s).${data.unresolved.length ? ` ${data.unresolved.length} couldn't be resolved.` : ""}`);
    await loadExistingModsCount();
  } catch (err) {
    showToast(err.message || "Sync failed.");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

syncModsBtn.addEventListener("click", () => {
  runSync(syncModsBtn, `${API_BASE}/admin/existing-mods/sync`);
});

syncModsManualBtn.addEventListener("click", () => {
  const raw = syncModsInput.value.trim();
  if (!raw) {
    showToast("Paste some project IDs first.");
    return;
  }

  let projectIds;
  try {
    projectIds = raw.trim().startsWith("[")
      ? JSON.parse(raw)
      : raw.split(/[\s,]+/).filter(Boolean);
  } catch {
    showToast("Couldn't parse that input.");
    return;
  }

  runSync(syncModsManualBtn, `${API_BASE}/admin/existing-mods/sync-manual`, { project_ids: projectIds })
    .then(() => { syncModsInput.value = ""; });
});

/* ---------- Threshold ---------- */
const thresholdInput = document.getElementById("threshold-input");
const thresholdSaveBtn = document.getElementById("threshold-save-btn");

async function loadThreshold() {
  const res = await fetch(`${API_BASE}/admin/settings`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  thresholdInput.value = data.auto_add_threshold;
}

thresholdSaveBtn.addEventListener("click", async () => {
  const value = parseInt(thresholdInput.value, 10);
  if (!value || value < 1) {
    showToast("Enter a valid threshold.");
    return;
  }
  const res = await fetch(`${API_BASE}/admin/settings`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ auto_add_threshold: value }),
  });
  showToast(res.ok ? "Threshold saved." : "Couldn't save threshold.");
});

/* ---------- Suggestions list ---------- */
const adminListEl = document.getElementById("admin-list");
const adminFiltersEl = document.getElementById("admin-filters");
let adminCache = [];
let currentFilter = "all";

adminFiltersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  currentFilter = chip.dataset.filter;
  [...adminFiltersEl.children].forEach((c) => c.classList.toggle("chip--active", c === chip));
  renderAdminList();
});

async function loadAdminList() {
  const res = await fetch(`${API_BASE}/admin/suggestions`, { headers: authHeaders() });
  if (!res.ok) {
    adminListEl.innerHTML = `<p class="suggest-empty">Couldn't load suggestions.</p>`;
    return;
  }
  const data = await res.json();
  adminCache = data.suggestions || [];
  renderAdminList();
}

function renderAdminList() {
  let items = [...adminCache];
  if (currentFilter === "pending") items = items.filter((s) => !s.added);
  if (currentFilter === "added") items = items.filter((s) => s.added);

  items.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));

  if (items.length === 0) {
    adminListEl.innerHTML = `<p class="suggest-empty">Nothing here.</p>`;
    return;
  }

  adminListEl.innerHTML = "";
  items.forEach((s) => adminListEl.appendChild(renderAdminCard(s)));
}

function renderAdminCard(s) {
  const card = document.createElement("div");
  card.className = "suggestion-card";
  const net = s.upvotes - s.downvotes;

  card.innerHTML = `
    <img class="suggestion-card__icon" src="${s.icon_url || ""}" alt="" onerror="this.style.visibility='hidden'" />
    <div class="suggestion-card__body">
      <div class="suggestion-card__title-row">
        <p class="suggestion-card__title">${escapeHtml(s.title)}</p>
        ${s.added ? `<span class="suggestion-card__badge suggestion-card__badge--added">Added</span>` : ""}
      </div>
      <p class="suggestion-card__desc">${escapeHtml(s.description || "")}</p>
      <p class="suggestion-card__meta">
        Suggested by ${escapeHtml(s.suggested_by || "someone")} ·
        ${s.upvotes}↑ ${s.downvotes}↓ (net ${net})
      </p>
    </div>
    <div class="admin-card-actions">
      ${!s.added ? `<button class="admin-approve" title="Mark as added"><span class="material-symbols-rounded">check</span></button>` : `<button class="admin-unapprove" title="Revert to pending"><span class="material-symbols-rounded">undo</span></button>`}
      <button class="admin-delete" title="Delete suggestion"><span class="material-symbols-rounded">delete</span></button>
    </div>
  `;

  const approveBtn = card.querySelector(".admin-approve");
  if (approveBtn) approveBtn.addEventListener("click", () => setAdded(s.id, true));

  const unapproveBtn = card.querySelector(".admin-unapprove");
  if (unapproveBtn) unapproveBtn.addEventListener("click", () => setAdded(s.id, false));

  card.querySelector(".admin-delete").addEventListener("click", () => deleteSuggestion(s.id));

  return card;
}

async function setAdded(id, added) {
  const res = await fetch(`${API_BASE}/admin/suggestions/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ added }),
  });
  if (res.ok) {
    showToast(added ? "Marked as added." : "Reverted to pending.");
    await loadAdminList();
  } else {
    showToast("Action failed.");
  }
}

async function deleteSuggestion(id) {
  if (!confirm("Delete this suggestion permanently?")) return;
  const res = await fetch(`${API_BASE}/admin/suggestions/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.ok) {
    showToast("Deleted.");
    await loadAdminList();
  } else {
    showToast("Delete failed.");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ---------- Init: auto-unlock if a token is already stored ---------- */
(async function init() {
  const existing = getToken();
  if (existing && (await tryToken(existing))) {
    enterAdmin();
  }
})();
