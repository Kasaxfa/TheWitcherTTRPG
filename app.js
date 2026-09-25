(() => {
  const recipes = window.RECIPES || [];
  const alchemySymbols = window.ALCHEMY_SYMBOLS || {};
  const list = document.querySelector("#recipe-list");
  const search = document.querySelector("#search");
  const tierSelect = document.querySelector("#tier-filter");
  const clearButton = document.querySelector("#clear-filters");
  const quickFilters = document.querySelector("#quick-filters");
  const emptyState = document.querySelector("#empty-state");
  const resultCount = document.querySelector("#result-count");
  const listLabel = document.querySelector("#list-label");
  const sectionNames = { all: "Все рецепты", alchemy: "Алхимия", weapon: "Оружие", armor: "Броня", material: "Компоненты" };
  let activeSection = "all";
  let activeCategory = "";

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

  function formula(ingredients) {
    const symbols = ingredients.filter(x => alchemySymbols[x.itemId]);
    if (!symbols.length) return "";
    return `<span class="formula" role="img" aria-label="Формула: ${escapeHtml(symbols.map(x => `${alchemySymbols[x.itemId].name}, ${x.quantity} шт.`).join("; "))}">${symbols.map(x => {
      const symbol = alchemySymbols[x.itemId];
      const count = Number(x.quantity);
      if (!Number.isInteger(count) || count < 1 || count > 30) return "";
      return Array.from({ length: count }, () => `<svg class="alchemy-symbol" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="${escapeHtml(symbol.color)}"/><path d="${escapeHtml(symbol.path)}" fill="none" stroke="white" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`).join("");
    }).join("")}</span>`;
  }

  function getCategories() {
    const candidates = recipes.filter(item => activeSection === "all" || item.type === activeSection);
    return [...new Set(candidates.map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ru"));
  }

  function renderQuickFilters() {
    const categories = getCategories();
    if (!categories.length) { quickFilters.replaceChildren(); return; }
    quickFilters.innerHTML = `<button class="category-chip ${activeCategory ? "" : "active"}" data-category="">Все подкатегории</button>${categories.map(category => `<button class="category-chip ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}`;
    quickFilters.querySelectorAll(".category-chip").forEach(button => button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderQuickFilters();
      render();
    }));
  }

  function recipeCard(item) {
    const ingredients = item.ingredients || [];
    const preview = item.type === "alchemy" ? formula(ingredients) : ingredients.slice(0, 3).map(x => x.name).join(" · ") + (ingredients.length > 3 ? ` · +${ingredients.length - 3}` : "");
    const time = item.time ? `<span class="meta-pill time"><strong>Время</strong>${escapeHtml(item.time)}</span>` : "";
    const dc = item.dc ? `<span class="meta-pill"><strong>СЛ</strong>${escapeHtml(item.dc)}</span>` : "";
    return `<details class="recipe-card">
      <summary class="recipe-summary">
        <span class="recipe-title-block"><span class="recipe-title">${escapeHtml(item.name)}</span><span class="recipe-subtitle">${escapeHtml(item.category || item.typeLabel || "")}</span></span>
        <span class="ingredient-preview">${item.type === "alchemy" ? preview : escapeHtml(preview || "Состав не указан")}</span>
        ${dc}${time}<span class="card-arrow" aria-hidden="true">⌄</span>
      </summary>
      <div class="recipe-details"><div class="detail-grid">
        <div><span class="detail-label">Уровень</span><span class="detail-value">${escapeHtml(item.tier || "—")}</span></div>
        ${item.dc ? `<div><span class="detail-label">Сложность изготовления</span><span class="detail-value">${escapeHtml(item.dc)}</span></div>` : ""}
        ${item.time ? `<div><span class="detail-label">Время изготовления</span><span class="detail-value">${escapeHtml(item.time)}</span></div>` : ""}
        ${item.type === "alchemy" ? `<div class="full-width"><span class="detail-label">Формула · символы ингредиентов</span>${formula(ingredients)}</div>` : ""}
        <div class="full-width"><span class="detail-label">Компоненты</span><span class="ingredient-list">${ingredients.map(x => `<span class="ingredient-tag">${escapeHtml(x.name)}${x.quantity ? ` ×${escapeHtml(x.quantity)}` : ""}</span>`).join("") || `<span class="detail-value">Не указаны</span>`}</span></div>
      </div><div class="source-page">Источник: книга правил, стр. ${escapeHtml(item.page || "—")}</div></div>
    </details>`;
  }

  function render() {
    const query = normalize(search.value.trim());
    const items = recipes.filter(item => {
      if (activeSection !== "all" && item.type !== activeSection) return false;
      if (activeCategory && item.category !== activeCategory) return false;
      if (tierSelect.value && item.tier !== tierSelect.value) return false;
      const haystack = normalize([item.name, item.category, item.tier, ...(item.ingredients || []).map(x => x.name)].join(" "));
      return !query || haystack.includes(query);
    });
    list.innerHTML = items.map(recipeCard).join("");
    emptyState.hidden = items.length > 0;
    resultCount.textContent = String(items.length);
    listLabel.textContent = activeCategory ? `${sectionNames[activeSection]} · ${activeCategory}` : sectionNames[activeSection];
    document.querySelector("#count-all").textContent = String(recipes.length);
    for (const type of ["alchemy", "weapon", "armor", "material"]) {
      document.querySelector(`#count-${type}`).textContent = String(recipes.filter(item => item.type === type).length);
    }
  }

  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
    activeSection = button.dataset.section;
    activeCategory = "";
    document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item === button));
    renderQuickFilters();
    render();
  }));
  search.addEventListener("input", render);
  tierSelect.addEventListener("change", render);
  clearButton.addEventListener("click", () => { search.value = ""; tierSelect.value = ""; activeCategory = ""; renderQuickFilters(); render(); search.focus(); });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); search.focus(); }
    if (event.key === "Escape" && document.activeElement === search) { search.value = ""; render(); search.blur(); }
  });
  renderQuickFilters();
  render();
})();
