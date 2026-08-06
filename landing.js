(() => {
  const layers = {
    default: document.querySelector(".bg-default"),
    season1: document.querySelector(".bg-season1"),
    season2: document.querySelector(".bg-season2"),
  };

  function show(key) {
    for (const [name, el] of Object.entries(layers)) {
      if (!el) continue;
      el.classList.toggle("active", name === key);
    }
  }

  // Start on the default background.
  show("default");

  document.querySelectorAll(".season").forEach((el) => {
    const season = el.dataset.season;

    el.addEventListener("mouseenter", () => show(season));
    el.addEventListener("focus", () => show(season));

    el.addEventListener("mouseleave", () => show("default"));
    el.addEventListener("blur", () => show("default"));
  });
})();
