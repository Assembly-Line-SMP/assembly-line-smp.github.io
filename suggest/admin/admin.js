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
  loadUsers();
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

/* ---------- User moderation ---------- */
const usersListEl = document.getElementById("admin-users");
const userSearchInput = document.getElementById("user-search");
const userSortSelect = document.getElementById("user-sort");
let usersCache = [];

document.getElementById("users-refresh").addEventListener("click", loadUsers);
userSearchInput.addEventListener("input", renderUsers);
userSortSelect.addEventListener("change", renderUsers);

async function loadUsers() {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
  if (!res.ok) {
    usersListEl.innerHTML = `<p class="suggest-empty">Couldn't load users.</p>`;
    return;
  }
  const data = await res.json();
  usersCache = data.users || [];
  renderUsers();
}

function renderUsers() {
  const query = userSearchInput.value.trim().toLowerCase();
  const users = usersCache.filter((user) =>
    `${user.username} ${user.discord_id}`.toLowerCase().includes(query)
  );
  const sortBy = userSortSelect.value;
  users.sort((a, b) => {
    if (sortBy === "votes") return b.vote_count - a.vote_count;
    if (sortBy === "suggestions") return b.suggestion_count - a.suggestion_count;
    return sortBy === "oldest"
      ? (a.last_login || 0) - (b.last_login || 0)
      : (b.last_login || 0) - (a.last_login || 0);
  });

  if (!users.length) {
    usersListEl.innerHTML = `<p class="suggest-empty">No matching users.</p>`;
    return;
  }

  usersListEl.innerHTML = "";
  users.forEach((user) => usersListEl.appendChild(renderUserCard(user)));
}

function renderUserCard(user) {
  const card = document.createElement("article");
  card.className = `admin-user-card${user.shadow_banned ? " admin-user-card--banned" : ""}`;
  card.innerHTML = `
    <div class="admin-user-card__main">
      ${user.avatar_url ? `<img class="admin-user-avatar" src="${escapeHtml(user.avatar_url)}" alt="" />` : `<span class="admin-user-avatar admin-user-avatar--empty material-symbols-rounded">person</span>`}
      <div class="admin-user-card__identity">
        <strong>${escapeHtml(user.username)}</strong>
        <code>${escapeHtml(user.discord_id)}</code>
        <span>${user.last_login ? `Last login ${escapeHtml(new Date(user.last_login * 1000).toLocaleString())}` : "No login recorded"}</span>
      </div>
      <div class="admin-user-card__stats">
        <span>${user.suggestion_count} suggestions</span>
        <span>${user.vote_count} votes</span>
        ${user.shadow_banned ? `<b>Shadow-banned</b>` : ""}
      </div>
      <div class="admin-card-actions admin-user-actions">
        <button class="admin-clear-votes" title="Remove all of this user's votes" aria-label="Remove all votes"><span class="material-symbols-rounded">how_to_vote</span></button>
        <button class="admin-shadow-ban" title="${user.shadow_banned ? "Remove shadow ban" : "Shadow-ban user"}" aria-label="${user.shadow_banned ? "Remove shadow ban" : "Shadow-ban user"}">
          <span class="material-symbols-rounded">${user.shadow_banned ? "person_check" : "person_off"}</span>
        </button>
      </div>
    </div>
    <details class="admin-user-details">
      <summary>View activity</summary>
      <div class="admin-user-activity"><p class="suggest-empty">Open to load activity.</p></div>
    </details>
  `;

  card.querySelector(".admin-clear-votes").addEventListener("click", async () => {
    if (!confirm(`Remove all votes by ${user.username}?`)) return;
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(user.discord_id)}/votes`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (!res.ok) return showToast("Couldn't remove votes.");
    showToast("User votes removed.");
    await Promise.all([loadUsers(), loadAdminList()]);
  });

  card.querySelector(".admin-shadow-ban").addEventListener("click", async () => {
    const action = user.shadow_banned ? "unban" : "shadow-ban";
    const message = user.shadow_banned
      ? `Remove the shadow ban for ${user.username}? Their private-only suggestions and votes will be permanently discarded.`
      : `Shadow-ban ${user.username}? Their public suggestions and votes will be removed; their account will continue to see a private-only view.`;
    if (!confirm(message)) return;
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(user.discord_id)}/shadow-ban`, {
      method: user.shadow_banned ? "DELETE" : "POST", headers: authHeaders(),
    });
    if (!res.ok) return showToast("Moderation action failed.");
    showToast(user.shadow_banned ? "Shadow ban removed; private data purged." : "User shadow-banned.");
    await Promise.all([loadUsers(), loadAdminList()]);
  });

  const activity = card.querySelector(".admin-user-activity");
  card.querySelector(".admin-user-details").addEventListener("toggle", async (event) => {
    if (!event.currentTarget.open || event.currentTarget.dataset.loaded) return;
    event.currentTarget.dataset.loaded = "true";
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(user.discord_id)}`, { headers: authHeaders() });
    if (!res.ok) {
      activity.innerHTML = `<p class="suggest-empty">Couldn't load activity.</p>`;
      return;
    }
    const data = await res.json();
    activity.innerHTML = `
      <div><h4>Suggestions (${data.suggestions.length})</h4>
        ${data.suggestions.length ? data.suggestions.map((suggestion) => `<p>${escapeHtml(suggestion.title)} <span>${suggestion.upvotes}↑ ${suggestion.downvotes}↓${suggestion.id < 0 ? " · private" : ""}</span></p>`).join("") : `<p>No suggestions.</p>`}
      </div>
      <div><h4>Votes (${data.votes.length})</h4>
        ${data.votes.length ? data.votes.map((vote) => `<p>${escapeHtml(vote.title || "Removed suggestion")} <span>${vote.direction === "up" ? "Upvote" : "Downvote"}${vote.visibility === "shadow" ? " · private" : ""}</span></p>`).join("") : `<p>No votes.</p>`}
      </div>`;
  });
  return card;
}

/* ---------- Suggestions list ---------- */
const adminListEl = document.getElementById("admin-list");
const adminFiltersEl = document.getElementById("admin-filters");
const suggestionSearchInput = document.getElementById("suggestion-search");
const suggestionSortSelect = document.getElementById("suggestion-sort");
let adminCache = [];
let currentFilter = "all";

adminFiltersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  currentFilter = chip.dataset.filter;
  [...adminFiltersEl.children].forEach((c) => c.classList.toggle("chip--active", c === chip));
  renderAdminList();
});
suggestionSearchInput.addEventListener("input", renderAdminList);
suggestionSortSelect.addEventListener("change", renderAdminList);

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
  const query = suggestionSearchInput.value.trim().toLowerCase();
  let items = adminCache.filter((suggestion) =>
    `${suggestion.title} ${suggestion.suggested_by} ${suggestion.modrinth_slug}`.toLowerCase().includes(query)
  );
  if (currentFilter === "pending") items = items.filter((s) => !s.added);
  if (currentFilter === "added") items = items.filter((s) => s.added);

  const sortBy = suggestionSortSelect.value;
  items.sort((a, b) => {
    if (sortBy === "newest") return b.created_at - a.created_at;
    if (sortBy === "controversial") return (b.upvotes + b.downvotes) - (a.upvotes + a.downvotes);
    return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
  });

  if (items.length === 0) {
    adminListEl.innerHTML = `<p class="suggest-empty">Nothing here.</p>`;
    return;
  }

  adminListEl.innerHTML = "";
  items.forEach((s) => adminListEl.appendChild(renderAdminCard(s)));
}

function renderAdminCard(s) {
  const card = document.createElement("div");
  card.className = "suggestion-card admin-suggestion-card";
  const net = s.upvotes - s.downvotes;

  card.innerHTML = `
    <div class="admin-suggestion-main">
      <img class="suggestion-card__icon" src="${escapeHtml(s.icon_url || "")}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="suggestion-card__body">
        <div class="suggestion-card__title-row">
          <p class="suggestion-card__title">${escapeHtml(s.title)}</p>
          ${s.added ? `<span class="suggestion-card__badge suggestion-card__badge--added">Added</span>` : ""}
        </div>
        <p class="suggestion-card__desc">${escapeHtml(s.description || "")}</p>
        <p class="suggestion-card__meta">Suggested by ${escapeHtml(s.suggested_by || "someone")} · ${s.upvotes}↑ ${s.downvotes}↓ (net ${net})</p>
      </div>
      <div class="admin-card-actions">
        ${!s.added ? `<button class="admin-approve" title="Mark as added" aria-label="Mark as added"><span class="material-symbols-rounded">check</span></button>` : `<button class="admin-unapprove" title="Revert to pending" aria-label="Revert to pending"><span class="material-symbols-rounded">undo</span></button>`}
        <button class="admin-delete" title="Delete suggestion" aria-label="Delete suggestion"><span class="material-symbols-rounded">delete</span></button>
      </div>
    </div>
    <details class="admin-vote-manager">
      <summary>Manage votes · ${s.upvotes + s.downvotes} total</summary>
      <div class="admin-vote-list"><p class="suggest-empty">Open to load votes.</p></div>
    </details>
  `;

  const approveBtn = card.querySelector(".admin-approve");
  if (approveBtn) approveBtn.addEventListener("click", () => setAdded(s.id, true));
  const unapproveBtn = card.querySelector(".admin-unapprove");
  if (unapproveBtn) unapproveBtn.addEventListener("click", () => setAdded(s.id, false));
  card.querySelector(".admin-delete").addEventListener("click", () => deleteSuggestion(s.id));

  const voteDetails = card.querySelector(".admin-vote-manager");
  const voteList = card.querySelector(".admin-vote-list");
  voteDetails.addEventListener("toggle", async (event) => {
    if (!event.currentTarget.open || event.currentTarget.dataset.loaded) return;
    event.currentTarget.dataset.loaded = "true";
    const res = await fetch(`${API_BASE}/admin/suggestions/${s.id}/votes`, { headers: authHeaders() });
    if (!res.ok) {
      voteList.innerHTML = `<p class="suggest-empty">Couldn't load votes.</p>`;
      return;
    }
    const data = await res.json();
    if (!data.votes.length) {
      voteList.innerHTML = `<p class="suggest-empty">No votes to manage.</p>`;
      return;
    }
    voteList.innerHTML = data.votes.map((vote) => `
      <div class="admin-voter-row" data-user="${escapeHtml(vote.discord_id)}">
        <div><strong>${escapeHtml(vote.username || "Unknown user")}</strong><code>${escapeHtml(vote.discord_id)}</code></div>
        <span class="admin-voter-direction">${vote.direction === "up" ? "Upvote" : "Downvote"}</span>
        <div class="admin-voter-actions">
          <button data-direction="up" title="Set upvote" aria-label="Set upvote" class="${vote.direction === "up" ? "is-selected" : ""}"><span class="material-symbols-rounded">thumb_up</span></button>
          <button data-direction="down" title="Set downvote" aria-label="Set downvote" class="${vote.direction === "down" ? "is-selected" : ""}"><span class="material-symbols-rounded">thumb_down</span></button>
          <button data-direction="null" title="Remove vote" aria-label="Remove vote"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>`).join("");
    voteList.querySelectorAll(".admin-voter-row").forEach((row) => {
      row.querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
        const direction = button.dataset.direction === "null" ? null : button.dataset.direction;
        const update = await fetch(`${API_BASE}/admin/suggestions/${s.id}/votes/${encodeURIComponent(row.dataset.user)}`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        });
        if (!update.ok) return showToast("Vote update failed.");
        showToast(direction ? `Vote changed to ${direction}.` : "Vote removed.");
        await Promise.all([loadAdminList(), loadUsers()]);
      }));
    });
  });
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
