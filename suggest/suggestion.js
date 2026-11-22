const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "/suggest/api"
  : "https://raspi.kubabin.dev/suggest/api";
const AUTH_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "/suggest/auth"
  : "https://raspi.kubabin.dev/suggest/auth";

const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeIcon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
  localStorage.setItem("theme", theme);
}
const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

const toastEl = document.getElementById("toast");
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  setTimeout(() => toastEl.classList.remove("toast--visible"), 2600);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

const authArea = document.getElementById("auth-area");
let currentUser = null;
let suggestion = null;

async function loadAuth() {
  try {
    const res = await fetch(`${AUTH_BASE}/me`, { credentials: "include" });
    currentUser = res.ok ? await res.json() : null;
  } catch {
    currentUser = null;
  }
  authArea.innerHTML = currentUser
    ? `<div class="auth-user"><img class="auth-user__avatar" src="${escapeHtml(currentUser.avatar_url)}" alt="" /><span>${escapeHtml(currentUser.username)}</span></div>`
    : `<a class="auth-login-button" href="${AUTH_BASE}/login?redirect=${encodeURIComponent(window.location.href)}"><span class="material-symbols-rounded">login</span> Login with Discord</a>`;
}

function requireLogin() {
  if (currentUser) return true;
  showToast("Log in with Discord to do that.");
  return false;
}

function getStatus(item) {
  if (item.status) return item.status;
  if (item.rejected) return "rejected";
  if (item.approved || item.added) return "approved";
  return "pending";
}

async function loadSuggestion() {
  const id = new URL(window.location.href).searchParams.get("id");
  if (!id) {
    document.getElementById("detail-content").innerHTML = `<p class="suggest-empty">Suggestion not found.</p>`;
    return;
  }
  const res = await fetch(`${API_BASE}/suggestions/${encodeURIComponent(id)}`, { credentials: "include" });
  if (!res.ok) {
    document.getElementById("detail-content").innerHTML = `<p class="suggest-empty">Couldn't load this suggestion.</p>`;
    return;
  }
  suggestion = await res.json();
  document.title = `${suggestion.title} — Suggest a Mod`;
  document.getElementById("detail-title").textContent = suggestion.title;
  renderSuggestion();
}

function renderSuggestion() {
  const status = getStatus(suggestion);
  const net = suggestion.upvotes - suggestion.downvotes;
  const voteDisabled = status === "approved" || status === "rejected";
  const nextUpdate = suggestion.next_update_date;
  let statusBadge = "";
  if (status === "approved") statusBadge = `<span class="suggestion-card__badge suggestion-card__badge--approved" title="${escapeHtml(nextUpdate ? `Coming ${new Date(nextUpdate).toLocaleString()}` : "Update date pending")}">Approved</span>`;
  if (status === "rejected") statusBadge = `<span class="suggestion-card__badge suggestion-card__badge--rejected">Rejected</span>`;
  if (net >= Number(suggestion.auto_add_threshold || 10) && status === "pending") statusBadge = `<span class="suggestion-card__badge suggestion-card__badge--eligible">Ready to approve</span>`;

  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <article class="suggestion-detail-card">
      <div class="suggestion-detail-head">
        <img class="suggestion-detail-icon" src="${escapeHtml(suggestion.icon_url || "")}" alt="" onerror="this.style.visibility='hidden'" />
        <div>
          <h2 class="suggestion-detail-title">${escapeHtml(suggestion.title)} ${statusBadge}</h2>
          <p class="suggestion-detail-meta">Suggested by ${escapeHtml(suggestion.suggested_by || "someone")} · ${suggestion.upvotes} up · ${suggestion.downvotes} down</p>
        </div>
        <div class="vote-control">
          <button class="vote-up ${suggestion.your_vote === "up" ? "vote-active--up" : ""}" aria-label="Upvote" ${voteDisabled ? "disabled" : ""}><span class="material-symbols-rounded">arrow_upward</span></button>
          <span class="vote-control__count">${net}</span>
          <button class="vote-down ${suggestion.your_vote === "down" ? "vote-active--down" : ""}" aria-label="Downvote" ${voteDisabled ? "disabled" : ""}><span class="material-symbols-rounded">arrow_downward</span></button>
        </div>
      </div>
      ${suggestion.description ? `<p class="suggestion-detail-description">${escapeHtml(suggestion.description)}</p>` : ""}
      ${suggestion.suggestion_reason ? `<section class="suggestion-detail-section"><h2>Why this mod?</h2><p>${escapeHtml(suggestion.suggestion_reason)}</p></section>` : ""}
      ${suggestion.compatibility ? `<section class="suggestion-detail-section"><h2>Side</h2><p>${escapeHtml(suggestion.compatibility)}</p></section>` : ""}
      ${status === "rejected" && suggestion.rejection_reason ? `<section class="suggestion-detail-section"><h2>Rejection reason</h2><p>${escapeHtml(suggestion.rejection_reason)}</p></section>` : ""}
      ${status === "approved" ? `<section class="suggestion-detail-section"><h2>Update</h2><p>${suggestion.next_update_date ? `Coming ${escapeHtml(new Date(suggestion.next_update_date).toLocaleString())}` : "Update date pending"}</p></section>` : ""}
      <div class="suggestion-detail-actions">
        ${suggestion.modrinth_slug ? `<a class="primary" href="https://modrinth.com/mod/${encodeURIComponent(suggestion.modrinth_slug)}" target="_blank" rel="noopener"><span class="material-symbols-rounded">open_in_new</span> Open on Modrinth</a>` : ""}
        ${currentUser ? `<button id="watch-button" type="button"><span class="material-symbols-rounded">notifications</span> Watch</button>` : ""}
        ${suggestion.suggested_by_discord_id ? `<button id="profile-button" type="button"><span class="material-symbols-rounded">person</span> Suggester profile</button>` : ""}
        <button id="share-button" type="button"><span class="material-symbols-rounded">share</span> Copy link</button>
        ${currentUser ? `<button id="report-button" type="button"><span class="material-symbols-rounded">flag</span> Report</button>` : ""}
      </div>
      <div class="suggestion-detail-reactions">
        ${currentUser ? `<button type="button" data-reaction="👍">👍</button><button type="button" data-reaction="❤️">❤️</button><button type="button" data-reaction="🔥">🔥</button>` : ""}
      </div>
      <section class="suggestion-detail-discussion">
        <h2>Discussion</h2>
        <div id="detail-comments"></div>
      </section>
    </article>
  `;

  content.querySelector(".vote-up").addEventListener("click", () => castVote("up"));
  content.querySelector(".vote-down").addEventListener("click", () => castVote("down"));
  content.querySelector("#share-button").addEventListener("click", shareSuggestion);
  content.querySelector("#watch-button")?.addEventListener("click", toggleWatch);
  content.querySelector("#report-button")?.addEventListener("click", reportSuggestion);
  content.querySelector("#profile-button")?.addEventListener("click", showProfile);
  content.querySelectorAll("[data-reaction]").forEach((button) => button.addEventListener("click", () => react(button.dataset.reaction)));
  loadComments();
}

async function castVote(direction) {
  if (!requireLogin()) return;
  if (getStatus(suggestion) !== "pending") return showToast("Voting is closed for this suggestion.");
  let reason = null;
  if (direction === "down") {
    reason = window.prompt("Optional reason for your downvote", "");
    if (reason === null) return;
  }
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/vote`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, reason }),
  });
  if (!res.ok) return showToast("Couldn't record your vote.");
  suggestion = await res.json();
  renderSuggestion();
  showToast("Vote updated.");
}

async function toggleWatch(event) {
  if (!requireLogin()) return;
  const button = event.currentTarget;
  const watching = button.classList.toggle("is-active");
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/watch`, {
    method: watching ? "POST" : "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    button.classList.toggle("is-active", !watching);
    return showToast("Couldn't update watch status.");
  }
  showToast(watching ? "You're watching this suggestion." : "Watch removed.");
}

async function react(emoji) {
  if (!requireLogin()) return;
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/reactions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) return showToast("Couldn't update reaction.");
  const data = await res.json();
  const button = document.querySelector(`[data-reaction="${CSS.escape(emoji)}"]`);
  button?.classList.toggle("is-active");
  showToast("Reaction updated.");
}

async function shareSuggestion() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Suggestion link copied.");
  } catch {
    showToast("Couldn't copy the link.");
  }
}

async function reportSuggestion() {
  if (!requireLogin()) return;
  const reason = window.prompt("Why are you reporting this suggestion?", "");
  if (reason === null) return;
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/report`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  showToast(res.ok ? "Report submitted." : "Couldn't submit report.");
}

async function showProfile() {
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(suggestion.suggested_by_discord_id)}`);
  if (!res.ok) return showToast("Couldn't load profile.");
  const profile = await res.json();
  showToast(`${profile.username} · ${profile.suggestion_count} suggestions · ${profile.approved_count} approved · ${profile.vote_count} votes${profile.badges.length ? ` · ${profile.badges.join(", ")}` : ""}`);
}

async function loadComments() {
  const commentsEl = document.getElementById("detail-comments");
  commentsEl.innerHTML = `<p class="suggest-empty">Loading discussion…</p>`;
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/comments`, { credentials: "include" });
  if (!res.ok) {
    commentsEl.innerHTML = `<p class="suggest-empty">Couldn't load discussion.</p>`;
    return;
  }
  const data = await res.json();
  commentsEl.innerHTML = "";
  const comments = data.comments || [];
  comments.filter((comment) => !comment.parent_id).forEach((comment) => {
    commentsEl.appendChild(renderComment(comment, comments));
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
    if (await postComment(null, form.querySelector("textarea").value)) loadComments();
  });
  commentsEl.appendChild(form);
}

function renderComment(comment, comments) {
  const item = document.createElement("article");
  item.className = "suggestion-comment";
  item.innerHTML = `
    ${comment.avatar_url ? `<img src="${escapeHtml(comment.avatar_url)}" alt="" />` : `<span class="suggestion-comment__avatar material-symbols-rounded">person</span>`}
    <div class="suggestion-comment__body">
      <p><strong>${escapeHtml(comment.deleted ? "Deleted comment" : comment.username)}</strong><span>${comment.edited_at ? "edited" : ""}</span></p>
      ${comment.deleted ? "<em>Comment removed.</em>" : `<div>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</div>`}
      ${comment.deleted ? "" : `
        <div class="suggestion-comment__actions">
          ${currentUser ? `<button type="button" data-action="reply">Reply</button>` : ""}
          ${currentUser && currentUser.id === comment.discord_id ? `<button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button>` : ""}
          ${currentUser ? `<button type="button" data-action="report">Report</button>` : ""}
        </div>`}
    </div>
  `;
  const replies = comments.filter((reply) => reply.parent_id === comment.id);
  if (replies.length) {
    const repliesEl = document.createElement("div");
    repliesEl.className = "suggestion-comment-replies";
    replies.forEach((reply) => repliesEl.appendChild(renderComment(reply, comments)));
    item.querySelector(".suggestion-comment__body").appendChild(repliesEl);
  }
  item.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => commentAction(comment, button.dataset.action)));
  return item;
}

async function postComment(parentId, body) {
  const res = await fetch(`${API_BASE}/suggestions/${suggestion.id}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: body.trim(), parent_id: parentId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(data.detail || "Couldn't post comment.");
    return false;
  }
  return true;
}

async function commentAction(comment, action) {
  if (action === "reply") {
    const body = window.prompt("Reply", "");
    if (body && await postComment(comment.id, body)) loadComments();
  } else if (action === "edit") {
    const body = window.prompt("Edit comment", comment.body);
    if (body === null || !body.trim()) return;
    await fetch(`${API_BASE}/suggestions/${suggestion.id}/comments/${comment.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    loadComments();
  } else if (action === "delete") {
    if (!confirm("Delete this comment?")) return;
    await fetch(`${API_BASE}/suggestions/${suggestion.id}/comments/${comment.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    loadComments();
  } else if (action === "report") {
    const reason = window.prompt("Why are you reporting this comment?", "");
    if (reason === null) return;
    await fetch(`${API_BASE}/suggestions/${suggestion.id}/report`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, comment_id: comment.id }),
    });
    showToast("Report submitted.");
  }
}

(async function init() {
  await loadAuth();
  await loadSuggestion();
})();
