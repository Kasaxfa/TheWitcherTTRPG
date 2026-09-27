(() => {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');

  function sync() {
    const dark = root.dataset.theme === "dark";
    const action = dark ? "Включить светлую тему" : "Включить тёмную тему";
    toggle.setAttribute("aria-label", action);
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.title = action;
    toggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    toggle.querySelector(".theme-label").textContent = dark ? "Светлая тема" : "Тёмная тема";
    if (themeColor) themeColor.content = dark ? "#141c1e" : "#f5f7f6";
  }

  toggle.addEventListener("click", () => {
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try { localStorage.setItem("witcher-workshop-theme", dark ? "dark" : "light"); }
    catch (_) { /* Переключатель работает при недоступном хранилище. */ }
    sync();
  });

  sync();
})();
