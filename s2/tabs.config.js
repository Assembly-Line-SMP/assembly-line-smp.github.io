// ---------- Tab registry ----------
// This is the single place to add, remove, or toggle tabs.
//
// To add a new tab:
//   1. Create tabs/<id>.html   (markup that goes inside the panel)
//   2. Create tabs/<id>.js     (optional: export an init() function)
//   3. Create tabs/<id>.css    (optional: styles scoped to this tab)
//   4. Add an entry below.
//
// To remove a tab for a self-hosted instance: delete its entry here
// (and optionally delete its tabs/<id>.* files). No other file needs
// to change.
//
// Fields:
//   id       - unique string, used for data-view / data-view-panel and
//              to build the default tabs/<id>.html|js|css paths
//   label    - text shown in the nav rail
//   icon     - Material Symbols icon name
//   enabled  - if false, the tab is hidden and skipped entirely
//   hasScript / hasStyle - set to false if that tab has no .js/.css file

window.TABS_CONFIG = [
  { id: "map", label: "Map", icon: "map", enabled: true },
  { id: "chat", label: "Chat", icon: "chat_bubble", enabled: true },
  { id: "analytics", label: "Analytics", icon: "bar_chart", enabled: true },
];
