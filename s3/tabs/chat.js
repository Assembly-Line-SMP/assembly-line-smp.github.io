// ---------- Chat tab ----------
window.TAB_MODULES = window.TAB_MODULES || {};

(function () {
  const chatApiUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "/api/chat"
    : "https://season2.kubabin.dev/chat";

  let messagesEl = null;
  let scrollDownButton = null;
  let started = false;

  function getPlayerHeadUrl(username) {
    const safeName = encodeURIComponent(username.trim());
    return `https://mc-heads.net/avatar/${safeName}/64.png`;
  }

  function renderMessage({ author, text }) {
    const wrap = document.createElement("div");
    wrap.className = "message";

    const authorEl = document.createElement("p");
    authorEl.className = "message__author";
    authorEl.textContent = author;

    const row = document.createElement("div");
    row.className = "message__row";

    const avatar = document.createElement("img");
    avatar.className = "message__avatar";
    avatar.src = getPlayerHeadUrl(author);
    avatar.alt = `${author} head`;

    const bubble = document.createElement("div");
    bubble.className = "message__bubble";
    bubble.textContent = text;

    row.append(avatar, bubble);
    wrap.append(authorEl, row);
    messagesEl.appendChild(wrap);
  }

  function clearMessages() {
    messagesEl.innerHTML = "";
  }

  function shouldAutoScroll() {
    const threshold = 80;
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <= threshold;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    updateScrollButton();
  }

  function updateScrollButton() {
    if (!messagesEl || !scrollDownButton) return;
    const canScroll = messagesEl.scrollHeight > messagesEl.clientHeight + 1;
    const isNearBottom = shouldAutoScroll();
    scrollDownButton.classList.toggle("scroll-down-button--visible", canScroll && !isNearBottom);
  }

  function renderMessages(messages) {
    const wasNearBottom = shouldAutoScroll();
    clearMessages();
    messages.forEach(renderMessage);
    if (wasNearBottom) {
      scrollToBottom();
    }
  }

  function normalizeMessage(entry) {
    if (!entry || typeof entry !== "object") return null;

    const candidateText =
      entry.text ||
      entry.message ||
      entry.content ||
      entry.body ||
      entry.value ||
      "";
    const candidateAuthor =
      entry.player ||
      entry.author ||
      entry.username ||
      entry.user ||
      entry.name ||
      entry.sender ||
      "Unknown";

    const text = String(candidateText).trim();
    if (!text) return null;

    return {
      author: String(candidateAuthor),
      text,
    };
  }

  function normalizeMessages(payload) {
    if (Array.isArray(payload)) {
      return payload.map(normalizeMessage).filter(Boolean);
    }

    if (payload && typeof payload === "object") {
      const candidateArrays = [
        payload.messages,
        payload.chat,
        payload.data,
        payload.results,
        payload.items,
        payload.history,
      ].filter(Array.isArray);

      if (candidateArrays.length > 0) {
        return candidateArrays[0].map(normalizeMessage).filter(Boolean);
      }

      const nested = normalizeMessage(payload);
      if (nested) return [nested];
    }

    return [];
  }

  async function loadLatestChat() {
    try {
      const response = await fetch(chatApiUrl);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const messages = normalizeMessages(data).slice(-90); // Limit to the last 90 messages
      if (messages.length > 0) {
        renderMessages(messages);
        return;
      }
    } catch (error) {
      console.warn("Unable to load live chat messages:", error);
    }

    if (shouldAutoScroll()) {
      clearMessages();
      scrollToBottom();
    } else {
      clearMessages();
    }
  }

  function startChatPolling() {
    if (started) return;
    started = true;
    setInterval(() => {
      loadLatestChat();
    }, 2000);
  }

  window.TAB_MODULES.chat = {
    init(panelEl) {
      messagesEl = panelEl.querySelector("#messages");
      scrollDownButton = panelEl.querySelector("#scroll-down-button");

      scrollDownButton.addEventListener("click", () => {
        scrollToBottom();
      });

      messagesEl.addEventListener("scroll", () => updateScrollButton());
      window.addEventListener("resize", updateScrollButton);

      loadLatestChat();
      updateScrollButton();
      startChatPolling();
    },

    // Called by main.js whenever the chat tab is (re)activated,
    // so scroll position is corrected even if the tab was already loaded.
    onActivate() {
      window.requestAnimationFrame(() => {
        scrollToBottom();
        updateScrollButton();
      });
    },
  };
})();
