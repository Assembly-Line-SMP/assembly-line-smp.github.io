// ---------- Analytics tab ----------
window.TAB_MODULES = window.TAB_MODULES || {};

(function () {
  const analyticsApiBase = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "/s2/api"
    : "https://raspi.kubabin.dev/api/s2";

  let loaded = false;
  const chartInstances = {};
  let panelRoot = null;

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function showAnalyticsError(wrapEl) {
    wrapEl.innerHTML = "";
    const errEl = document.createElement("p");
    errEl.className = "analytics__status";
    errEl.textContent = "Couldn't load this data right now.";
    wrapEl.appendChild(errEl);
  }

  async function fetchAnalyticsTable(tableName) {
    const response = await fetch(`${analyticsApiBase}/${tableName}`);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  }

  /* --- Stat card: All-Time Peak --- */
  async function loadGlobalPeak() {
    const wrapEl = panelRoot.querySelector('[data-stat-wrap="global_player_peaks"]');
    if (!wrapEl) return;

    try {
      const rows = await fetchAnalyticsTable("global_player_peaks");
      const row = rows[0];
      if (!row) {
        showAnalyticsError(wrapEl);
        return;
      }

      wrapEl.innerHTML = "";
      const card = document.createElement("div");
      card.className = "analytics__stat-card";

      const icon = document.createElement("div");
      icon.className = "analytics__stat-icon";
      icon.innerHTML = '<span class="material-symbols-rounded">groups</span>';

      const textWrap = document.createElement("div");
      const value = document.createElement("p");
      value.className = "analytics__stat-value";
      value.textContent = row.peak_online_players ?? "—";

      const label = document.createElement("p");
      label.className = "analytics__stat-label";
      label.textContent = `Reached ${formatDateTime(row.peak_recorded_at)}`;

      textWrap.append(value, label);
      card.append(icon, textWrap);
      wrapEl.appendChild(card);
    } catch (error) {
      console.warn("Unable to load global_player_peaks:", error);
      showAnalyticsError(wrapEl);
    }
  }

  /* --- Bar chart: Daily Peaks --- */
  async function loadDailyPeaksChart() {
    const wrapEl = panelRoot.querySelector('[data-chart-wrap="daily_player_peaks"]');
    const canvas = panelRoot.querySelector('[data-chart-canvas="daily_player_peaks"]');
    if (!wrapEl || !canvas) return;

    try {
      let rows = await fetchAnalyticsTable("daily_player_peaks");
      rows.sort((a, b) => new Date(a.peak_date) - new Date(b.peak_date));
      rows = rows.slice(-60); // last 60 days

      if (!rows.length) {
        showAnalyticsError(wrapEl);
        return;
      }

      wrapEl.querySelector(".analytics__status")?.remove();
      canvas.hidden = false;

      const primary = getThemeColor("--md-sys-color-primary");
      const onSurfaceVariant = getThemeColor("--md-sys-color-on-surface-variant");
      const gridColor = getThemeColor("--md-sys-color-outline-variant");

      chartInstances.daily_player_peaks?.destroy();
      chartInstances.daily_player_peaks = new Chart(canvas, {
        type: "bar",
        data: {
          labels: rows.map((r) => formatDate(r.peak_date)),
          datasets: [{
            label: "Peak players",
            data: rows.map((r) => r.peak_online_players),
            backgroundColor: primary,
            borderRadius: 6,
            maxBarThickness: 28,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 10,
              cornerRadius: 12,
              titleFont: { family: "Google Sans Flex" },
              bodyFont: { family: "Google Sans Flex" },
            },
          },
          scales: {
            x: {
              ticks: { color: onSurfaceVariant, maxRotation: 0, autoSkip: true, font: { family: "Google Sans Flex", size: 11 } },
              grid: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: { color: onSurfaceVariant, precision: 0, font: { family: "Google Sans Flex", size: 11 } },
              grid: { color: gridColor },
            },
          },
        },
      });
    } catch (error) {
      console.warn("Unable to load daily_player_peaks:", error);
      showAnalyticsError(wrapEl);
    }
  }

  /* --- Line chart: Live Player Count Samples --- */
  async function loadPlayerCountChart() {
    const wrapEl = panelRoot.querySelector('[data-chart-wrap="player_count_samples"]');
    const canvas = panelRoot.querySelector('[data-chart-canvas="player_count_samples"]');
    if (!wrapEl || !canvas) return;

    try {
      let rows = await fetchAnalyticsTable("player_count_samples");
      rows.sort((a, b) => new Date(a.sampled_at) - new Date(b.sampled_at));
      rows = rows.slice(-150); // most recent samples

      if (!rows.length) {
        showAnalyticsError(wrapEl);
        return;
      }

      wrapEl.querySelector(".analytics__status")?.remove();
      canvas.hidden = false;

      const primary = getThemeColor("--md-sys-color-primary");
      const secondaryContainer = getThemeColor("--md-sys-color-secondary-container");
      const onSurfaceVariant = getThemeColor("--md-sys-color-on-surface-variant");
      const gridColor = getThemeColor("--md-sys-color-outline-variant");

      chartInstances.player_count_samples?.destroy();
      chartInstances.player_count_samples = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map((r) => formatDateTime(r.sampled_at)),
          datasets: [{
            label: "Online players",
            data: rows.map((r) => r.online_players),
            borderColor: primary,
            backgroundColor: secondaryContainer,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 8,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 10,
              cornerRadius: 12,
              titleFont: { family: "Google Sans Flex" },
              bodyFont: { family: "Google Sans Flex" },
            },
          },
          scales: {
            x: {
              ticks: { display: false },
              grid: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: { color: onSurfaceVariant, precision: 0, font: { family: "Google Sans Flex", size: 11 } },
              grid: { color: gridColor },
            },
          },
        },
      });
    } catch (error) {
      console.warn("Unable to load player_count_samples:", error);
      showAnalyticsError(wrapEl);
    }
  }

  /* --- Table: Player Stats --- */
  function renderPlayerStatsTable(wrapEl, rows) {
    wrapEl.innerHTML = "";

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "analytics__status";
      empty.textContent = "No data available yet.";
      wrapEl.appendChild(empty);
      return;
    }

    const columns = [
      { key: "player_name", label: "Player" },
      { key: "first_joined_at", label: "First joined", type: "datetime" },
      { key: "last_seen_at", label: "Last seen", type: "datetime" },
    ];

    const scrollDiv = document.createElement("div");
    scrollDiv.className = "analytics__table-scroll";

    const table = document.createElement("table");
    table.className = "analytics__table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((col) => {
        const td = document.createElement("td");
        const value = row[col.key];
        td.textContent = col.type === "datetime" ? formatDateTime(value) : (value ?? "—");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    scrollDiv.appendChild(table);
    wrapEl.appendChild(scrollDiv);
  }

  async function loadPlayerStatsTable() {
    const wrapEl = panelRoot.querySelector('[data-table-wrap="player_stats"]');
    if (!wrapEl) return;

    try {
      let rows = await fetchAnalyticsTable("player_stats");
      rows.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
      rows = rows.slice(0, 150);
      renderPlayerStatsTable(wrapEl, rows);
    } catch (error) {
      console.warn("Unable to load player_stats:", error);
      showAnalyticsError(wrapEl);
    }
  }

  function loadAllAnalytics() {
    loadGlobalPeak();
    loadDailyPeaksChart();
    loadPlayerCountChart();
    loadPlayerStatsTable();
  }

  window.TAB_MODULES.analytics = {
    init(panelEl) {
      panelRoot = panelEl;
    },

    // Analytics data is loaded lazily, only the first time this tab
    // is actually opened (matches the original behavior).
    onActivate() {
      if (!loaded) {
        loaded = true;
        loadAllAnalytics();
      }
    },
  };
})();
