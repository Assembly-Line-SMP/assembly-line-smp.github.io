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
let existingSuggestions = new Map();
let publicThreshold = 10;
let publicNextUpdate = "";

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
    const params = new URLSearchParams({
      q: query,
      facets: JSON.stringify([["versions:1.21.1"]]),
    });

    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!res.ok) throw new Error("search failed");
    const data = await res.json();
    const compatibleHits = (data.hits || []).filter(
      (hit) => Array.isArray(hit.versions) && hit.versions.includes("1.21.1")
    );
    renderSearchResults(compatibleHits);
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
    const existing = existingSuggestions.get(hit.slug);
    const existingStatus = existing ? getSuggestionStatus(existing) : null;
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
      ${!alreadyInPack && existingStatus === "rejected" ? `<span class="search-result__already">Rejected — cannot suggest again</span>` : ""}
      ${!alreadyInPack && alreadySuggested && existingStatus !== "rejected" ? `<span class="search-result__already">Already suggested</span>` : ""}
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
  const suggestionReason = window.prompt("Why would you like this mod? (optional)", "");
  if (suggestionReason === null) return;
  const category = window.prompt("Category (optional: QoL, utility, content, performance, visuals)", "");
  if (category === null) return;
  const compatibility = window.prompt("Compatibility notes (optional: client/server, conflicts, dependencies)", "");
  if (compatibility === null) return;

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
        suggestion_reason: suggestionReason.trim(),
        category: category.trim(),
        compatibility: compatibility.trim(),
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
    publicThreshold = Number(data.auto_add_threshold || data.threshold || data.vote_threshold || 10);
    publicNextUpdate = data.next_update_date || data.next_update || "";
    existingSlugs = new Set(suggestionsCache.map((s) => s.modrinth_slug).filter(Boolean));
    existingSuggestions = new Map(suggestionsCache.map((s) => [s.modrinth_slug, s]).filter(([slug]) => slug));
    renderSuggestions();
  } catch {
    suggestionsListEl.innerHTML = `<p class="suggest-empty">Couldn't load suggestions. Try refreshing.</p>`;
  }
}

function renderSuggestions() {
  let items = [...suggestionsCache];
  items.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  if (currentSort === "top") {
    items = items.filter((s) => getSuggestionStatus(s) !== "rejected");
    items.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else if (currentSort === "new") {
    items = items.filter((s) => getSuggestionStatus(s) !== "rejected");
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (currentSort === "approved") {
    items = items.filter((s) => getSuggestionStatus(s) === "approved");
    items.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else if (currentSort === "rejected") {
    items = items.filter((s) => getSuggestionStatus(s) === "rejected");
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
  const status = getSuggestionStatus(s);
  if (status === "rejected") card.classList.add("suggestion-card--rejected");
  if (s.modrinth_slug){
    card.addEventListener("click", (event) => {
      if (event.target.closest(".vote-control")) return; // don't navigate if clicking on vote buttons
      window.open(`https://modrinth.com/mod/${s.modrinth_slug}`, "_blank");
    });
  }
  
  card.style.cursor = s.modrinth_slug ? "pointer" : "default";

  const net = s.upvotes - s.downvotes;
  const userVote = s.your_vote; // "up" | "down" | null
  const eligible = status === "pending" && net >= publicThreshold;
  const nextUpdate = s.next_update_date || s.approved_for_date || publicNextUpdate;
  const approvedTooltip = nextUpdate
    ? `Coming ${formatUpdateDate(nextUpdate)}`
    : "Approved — update date pending";
  const badge = status === "rejected"
    ? `<span class="suggestion-card__badge suggestion-card__badge--rejected">Rejected</span>`
    : status === "approved"
      ? `<span class="suggestion-card__badge suggestion-card__badge--approved" title="${escapeHtml(approvedTooltip)}">Approved</span>`
      : eligible
        ? `<span class="suggestion-card__badge suggestion-card__badge--eligible">Ready to approve</span>`
        : "";
  const votingDisabled = status === "rejected" || status === "approved";

  card.innerHTML = `
    <img class="suggestion-card__icon" src="${s.icon_url || ""}" alt="" onerror="this.style.visibility='hidden'" />
    <div class="suggestion-card__body">
      <div class="suggestion-card__title-row">
        <p class="suggestion-card__title">${escapeHtml(s.title)}</p>
        ${badge}
      </div>
      <p class="suggestion-card__desc">${escapeHtml(s.description || "")}</p>
      <p class="suggestion-card__meta">Suggested by ${s.suggested_by_discord_id
        ? `<button type="button" class="suggestion-author" data-discord-id="${escapeHtml(s.suggested_by_discord_id)}">${escapeHtml(s.suggested_by || "someone")}</button>`
        : escapeHtml(s.suggested_by || "someone")}</p>
      ${s.suggestion_reason ? `<p class="suggestion-card__reason"><strong>Why:</strong> ${escapeHtml(s.suggestion_reason)}</p>` : ""}
      ${status === "rejected" && s.rejection_reason ? `<p class="suggestion-card__reason suggestion-card__reason--rejection"><strong>Rejected:</strong> ${escapeHtml(s.rejection_reason)}</p>` : ""}
      ${s.category ? `<p class="suggestion-card__reason"><strong>Category:</strong> ${escapeHtml(s.category)}</p>` : ""}
      ${s.compatibility ? `<p class="suggestion-card__reason"><strong>Compatibility:</strong> ${escapeHtml(s.compatibility)}</p>` : ""}
    </div>
    <div class="vote-control">
      <button class="vote-up ${userVote === "up" ? "vote-active--up" : ""}" aria-label="Upvote" ${votingDisabled ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_upward</span>
      </button>
      <span class="vote-control__count">${net}</span>
      <button class="vote-down ${userVote === "down" ? "vote-active--down" : ""}" aria-label="Downvote" ${votingDisabled ? "disabled" : ""}>
        <span class="material-symbols-rounded">arrow_downward</span>
      </button>
    </div>
  `;

  const social = document.createElement("details");
  social.className = "suggestion-social";
  social.innerHTML = `
    <summary>Discussion</summary>
    <div class="suggestion-comments"></div>
  `;
  social.addEventListener("toggle", (event) => {
    if (event.currentTarget.open) loadComments(s.id, social);
  });
  card.appendChild(social);

  const socialActions = document.createElement("div");
  socialActions.className = "suggestion-social-actions";
  socialActions.innerHTML = `
    ${currentUser ? `<button type="button" class="suggestion-watch" title="Watch for status updates"><span class="material-symbols-rounded">notifications</span></button>` : ""}
    ${currentUser ? `<button type="button" class="suggestion-reaction" data-emoji="👍" title="React thumbs up">👍</button><button type="button" class="suggestion-reaction" data-emoji="❤️" title="React heart">❤️</button>` : ""}
  `;
  const watchButton = socialActions.querySelector(".suggestion-watch");
  if (watchButton) {
    watchButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const watching = watchButton.classList.toggle("is-active");
      const res = await fetch(`${API_BASE}/suggestions/${s.id}/watch`, {
        method: watching ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        watchButton.classList.toggle("is-active", !watching);
        showToast("Couldn't update watch status.");
      } else {
        showToast(watching ? "You’re watching this suggestion." : "Watch removed.");
      }
    });
  }
  socialActions.querySelectorAll(".suggestion-reaction").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`${API_BASE}/suggestions/${s.id}/reactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: button.dataset.emoji }),
      });
      if (res.ok) {
        button.classList.toggle("is-active");
        showToast("Reaction updated.");
      } else {
        showToast("Couldn't update reaction.");
      }
    });
  });
  card.appendChild(socialActions);

  card.querySelectorAll(".suggestion-author").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(button.dataset.discordId)}`);
      if (!res.ok) return showToast("Couldn't load profile.");
      const profile = await res.json();
      showToast(`${profile.username} · ${profile.suggestion_count} suggestions · ${profile.approved_count} approved · ${profile.vote_count} votes${profile.badges.length ? ` · ${profile.badges.join(", ")}` : ""}`);
    });
  });

  const shareButton = document.createElement("button");
  shareButton.className = "suggestion-share";
  shareButton.type = "button";
  shareButton.title = "Copy suggestion link";
  shareButton.innerHTML = `<span class="material-symbols-rounded">share</span>`;
  shareButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const url = new URL(window.location.href);
    url.hash = `suggestion-${s.id}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("Suggestion link copied.");
    } catch {
      showToast("Couldn't copy the link.");
    }
  });
  card.querySelector(".suggestion-card__body").appendChild(shareButton);

  card.querySelector(".vote-up").addEventListener("click", () => castVote(s.id, "up"));
  card.querySelector(".vote-down").addEventListener("click", () => castVote(s.id, "down"));

  return card;
}

async function castVote(suggestionId, direction) {
  if (!requireLogin()) return;
  const suggestion = suggestionsCache.find((item) => item.id === suggestionId);
  if (suggestion && ["approved", "rejected"].includes(getSuggestionStatus(suggestion))) {
    showToast("Voting is closed for this suggestion.");
    return;
  }
  let reason = null;
  if (direction === "down") {
    reason = window.prompt("Optional reason for your downvote", "");
    if (reason === null) return;
    reason = reason.trim();
  }

  try {
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/vote`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, reason }),
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

/* ---------- Comments and reports ---------- */
async function loadComments(suggestionId, container) {
  const commentsEl = container.querySelector(".suggestion-comments");
  commentsEl.innerHTML = `<p class="suggest-empty">Loading discussion…</p>`;
  try {
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/comments`, { credentials: "include" });
    if (!res.ok) throw new Error("load failed");
    const data = await res.json();
    renderComments(suggestionId, commentsEl, data.comments || []);
  } catch {
    commentsEl.innerHTML = `<p class="suggest-empty">Couldn't load discussion.</p>`;
  }
}

function renderComments(suggestionId, commentsEl, comments) {
  commentsEl.innerHTML = "";

  comments.filter((comment) => !comment.parent_id).forEach((comment) => {
    commentsEl.appendChild(renderComment(suggestionId, comment, comments));
  });

  const form = document.createElement("form");
  form.className = "suggestion-comment-form";
  form.innerHTML = `
    <textarea maxlength="2000" placeholder="${currentUser ? "Join the discussion…" : "Log in to join the discussion"}" ${currentUser ? "" : "disabled"}></textarea>
    <button type="submit" ${currentUser ? "" : "disabled"}>Post</button>
  `;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireLogin()) return;
    await postComment(suggestionId, null, form.querySelector("textarea").value);
    await loadComments(suggestionId, commentsEl.closest(".suggestion-social"));
  });
  commentsEl.appendChild(form);
}

function renderComment(suggestionId, comment, allComments) {
  const item = document.createElement("article");
  item.className = `suggestion-comment${comment.deleted ? " suggestion-comment--deleted" : ""}`;
  item.innerHTML = `
    ${comment.avatar_url ? `<img src="${escapeHtml(comment.avatar_url)}" alt="" />` : `<span class="suggestion-comment__avatar material-symbols-rounded">person</span>`}
    <div class="suggestion-comment__body">
      <p><strong>${escapeHtml(comment.deleted ? "Deleted comment" : comment.username)}</strong>
      <span>${comment.created_at ? escapeHtml(new Date(comment.created_at * 1000).toLocaleString()) : ""}${comment.edited_at ? " · edited" : ""}</span></p>
      ${comment.deleted ? `<em>Comment removed.</em>` : `<div>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</div>`}
      ${comment.deleted ? "" : `
        <div class="suggestion-comment__actions">
          ${currentUser ? `<button type="button" data-comment-action="reply">Reply</button>` : ""}
          ${currentUser && currentUser.id === comment.discord_id ? `<button type="button" data-comment-action="edit">Edit</button><button type="button" data-comment-action="delete">Delete</button>` : ""}
          ${currentUser ? `<button type="button" data-comment-action="report">Report</button>` : ""}
        </div>`}
    </div>
  `;

  const replies = allComments.filter((reply) => reply.parent_id === comment.id);
  replies.forEach((reply) => item.appendChild(renderComment(suggestionId, reply, allComments)));

  item.querySelectorAll("[data-comment-action]").forEach((button) => {
    button.addEventListener("click", () => handleCommentAction(suggestionId, comment, button.dataset.commentAction, item));
  });
  return item;
}

async function postComment(suggestionId, parentId, body) {
  const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, parent_id: parentId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(data.detail || "Couldn't post comment.");
    return false;
  }
  return true;
}

async function handleCommentAction(suggestionId, comment, action, item) {
  if (action === "reply") {
    const body = window.prompt("Reply", "");
    if (!body) return;
    if (await postComment(suggestionId, comment.id, body)) {
      const details = item.closest(".suggestion-social");
      await loadComments(suggestionId, details);
    }
  } else if (action === "edit") {
    const body = window.prompt("Edit comment", comment.body);
    if (body === null || !body.trim()) return;
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/comments/${comment.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) await loadComments(suggestionId, item.closest(".suggestion-social"));
    else showToast("Couldn't edit comment.");
  } else if (action === "delete") {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/comments/${comment.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) await loadComments(suggestionId, item.closest(".suggestion-social"));
    else showToast("Couldn't delete comment.");
  } else if (action === "report") {
    const reason = window.prompt("Why are you reporting this comment?", "");
    if (reason === null) return;
    const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/report`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, comment_id: comment.id }),
    });
    showToast(res.ok ? "Report submitted." : "Couldn't submit report.");
  }
}

/* ---------- Utility ---------- */
function getSuggestionStatus(suggestion) {
  if (suggestion.status === "approved" || suggestion.status === "rejected" || suggestion.status === "pending") {
    return suggestion.status;
  }
  if (suggestion.rejected) return "rejected";
  if (suggestion.approved || suggestion.added) return "approved";
  return "pending";
}

function formatUpdateDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ---------- Announcements ---------- */
async function loadAnnouncements() {
  const section = document.getElementById("suggest-announcements");
  try {
    const res = await fetch(`${API_BASE}/announcements`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const announcements = (data.announcements || []).filter((item) => item.body);
    if (!announcements.length) {
      section.style.display = "none";
      return;
    }
    section.innerHTML = announcements.map((item) =>
      `<article>${item.pinned ? `<span>PINNED</span>` : ""}<p>${escapeHtml(item.body)}</p></article>`
    ).join("");
    section.style.display = "grid";
  } catch {
    section.style.display = "none";
  }
}

/* ---------- Init ---------- */
(async function init() {
  await loadAuthState();
  await loadSuggestions();
  await loadAnnouncements();
})();
