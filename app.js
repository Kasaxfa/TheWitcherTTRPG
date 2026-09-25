(() => {
  const recipes = window.RECIPES || [];
  const items = window.ITEMS || [];
  const alchemySymbols = window.ALCHEMY_SYMBOLS || {};
  const itemAliases = window.ITEM_ID_ALIASES || {};
  const itemById = new Map(items.map(item => [item.id, item]));
  const storageKey = "witcher-workshop-inventory-v1";
  const sections = { recipes: "Рецепты", items: "Предметы", inventory: "Инвентарь" };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const numberText = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
  let activePage = "recipes";

  function formula(ingredients) {
    const relevant = ingredients.filter(ingredient => alchemySymbols[ingredient.itemId]);
    if (!relevant.length) return "";
    const label = relevant.map(ingredient => `${alchemySymbols[ingredient.itemId].name}, ${ingredient.quantity} шт.`).join("; ");
    const symbols = relevant.map(ingredient => {
      const symbol = alchemySymbols[ingredient.itemId];
      const count = Number(ingredient.quantity);
      if (!Number.isInteger(count) || count < 1 || count > 30) return "";
      return Array.from({ length: count }, () => `<svg class="alchemy-symbol" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="${escapeHtml(symbol.color)}"/><path d="${escapeHtml(symbol.path)}" fill="none" stroke="white" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`).join("");
    }).join("");
    return `<span class="formula" role="img" aria-label="Формула: ${escapeHtml(label)}">${symbols}</span>`;
  }

  function recipeCard(recipe) {
    const ingredients = recipe.ingredients || [];
    const preview = recipe.type === "alchemy"
      ? formula(ingredients)
      : ingredients.slice(0, 3).map(ingredient => escapeHtml(ingredient.name)).join(" · ") + (ingredients.length > 3 ? ` · +${ingredients.length - 3}` : "");
    const dc = recipe.dc ? `<span class="meta-pill"><strong>СЛ</strong>${escapeHtml(recipe.dc)}</span>` : "";
    const time = recipe.time ? `<span class="meta-pill time"><strong>Время</strong>${escapeHtml(recipe.time)}</span>` : "";
    const outputs = (recipe.outputs || []).map(output => `${escapeHtml(output.name)}${output.quantity !== 1 ? ` ×${escapeHtml(output.quantity)}` : ""}`).join(", ");
    return `<details class="recipe-card" data-recipe-id="${escapeHtml(recipe.id)}">
      <summary class="recipe-summary"><span class="recipe-title-block"><span class="recipe-title">${escapeHtml(recipe.name)}</span></span>
        <span class="ingredient-preview">${preview || "Состав не указан"}</span>${dc}${time}<span class="card-arrow" aria-hidden="true">⌄</span></summary>
      <div class="recipe-details"><div class="detail-grid">
        <div><span class="detail-label">Уровень</span><span class="detail-value">${escapeHtml(recipe.tier || "—")}</span></div>
        ${recipe.dc ? `<div><span class="detail-label">Сложность изготовления</span><span class="detail-value">${escapeHtml(recipe.dc)}</span></div>` : ""}
        ${recipe.time ? `<div><span class="detail-label">Время</span><span class="detail-value">${escapeHtml(recipe.time)}</span></div>` : ""}
        ${(recipe.outputs || []).length ? `<div class="full-width"><span class="detail-label">Результат</span><span class="detail-value">${outputs}</span></div>` : ""}
        ${recipe.type === "alchemy" ? `<div class="full-width"><span class="detail-label">Формула · символы ингредиентов</span>${formula(ingredients)}</div>` : ""}
        <div class="full-width"><span class="detail-label">Компоненты</span><span class="ingredient-list">${ingredients.map(ingredient => `<span class="ingredient-tag">${escapeHtml(ingredient.name)}${ingredient.quantity ? ` ×${escapeHtml(ingredient.quantity)}` : ""}</span>`).join("") || `<span class="detail-value">Не указаны</span>`}</span></div>
      </div></div>
    </details>`;
  }

  function updateRecipeFilters() {
    const craft = $("#recipe-domain").value === "craft";
    const type = $("#craft-type-filter").value;
    $("#craft-type-wrap").hidden = !craft;
    $("#recipe-title").textContent = craft ? "Ремесло" : "Алхимия";
    $("#recipe-intro").textContent = craft ? "Чертежи оружия, брони и материалов." : "Формулы алхимических средств и их состав.";
    const categories = craft && type
      ? [...new Set(recipes.filter(recipe => recipe.type === type).map(recipe => recipe.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"))
      : [];
    const categorySelect = $("#craft-category-filter");
    const previous = categorySelect.value;
    categorySelect.innerHTML = `<option value="">Любая подкатегория</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
    categorySelect.value = categories.includes(previous) ? previous : "";
    $("#craft-category-wrap").hidden = categories.length < 2;
  }

  function renderRecipes() {
    const query = normalize($("#search").value.trim());
    const tier = $("#tier-filter").value;
    const domain = $("#recipe-domain").value;
    const craftType = $("#craft-type-filter").value;
    const category = $("#craft-category-filter").value;
    const visible = recipes.filter(recipe => {
      if (domain === "alchemy" ? recipe.type !== "alchemy" : recipe.type === "alchemy") return false;
      if (domain === "craft" && craftType && recipe.type !== craftType) return false;
      if (domain === "craft" && craftType && category && recipe.category !== category) return false;
      if (tier && recipe.tier !== tier) return false;
      const text = normalize([recipe.name, recipe.category, recipe.tier, ...(recipe.ingredients || []).map(ingredient => ingredient.name)].join(" "));
      return !query || text.includes(query);
    });
    $("#recipe-list").innerHTML = visible.map(recipeCard).join("");
    $("#recipe-empty").hidden = visible.length > 0;
  }

  function fieldValue(value, unit) {
    if (value === null || value === undefined || value === "") return "Не указано";
    return `${escapeHtml(value)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
  }

  function itemCard(item) {
    const quick = [];
    if (item.weightKg !== null) quick.push(`<span><strong>Вес</strong> ${numberText(item.weightKg)} кг</span>`);
    if (item.costCrowns !== null) quick.push(`<span><strong>Цена</strong> ${numberText(item.costCrowns)} кр.</span>`);
    const details = item.details || {};
    const narrative = Object.entries(details).filter(([, value]) => value !== null && value !== "").map(([key, value]) => {
      const labels = { habitat: "Место обитания", rarity: "Редкость", acquisition_method: "Где найти", alchemy_group: "Группа", effect: "Эффект", duration: "Длительность", toxicity: "Токсичность", application: "Применение", notes: "Примечание" };
      return `<div class="detail-block"><span class="detail-label">${labels[key] || escapeHtml(key)}</span><p>${escapeHtml(value)}</p></div>`;
    }).join("");
    const attributes = item.attributes?.length ? `<div class="detail-block"><span class="detail-label">Характеристики</span><div class="attribute-list">${item.attributes.map(attribute => `<div class="attribute-row"><span>${escapeHtml(attribute.label)}</span><strong>${fieldValue(attribute.value, attribute.unit)}</strong></div>`).join("")}</div></div>` : "";
    const effects = item.effects?.length ? `<div class="detail-block"><span class="detail-label">Эффекты</span>${item.effects.map(effect => `<p>${escapeHtml(effect.text)}${effect.duration ? ` · ${escapeHtml(effect.duration)}` : ""}</p>`).join("")}</div>` : "";
    const description = item.description ? `<div class="detail-block"><span class="detail-label">Описание</span><p>${escapeHtml(item.description)}</p></div>` : "";
    return `<details class="item-card" data-item-id="${escapeHtml(item.id)}"><summary class="item-summary"><span class="item-name">${escapeHtml(item.name)}</span><span class="card-arrow" aria-hidden="true">⌄</span><span class="item-kind">${escapeHtml(item.typeLabel)}</span><span class="item-quick-meta">${quick.join("") || "Сведения о весе и цене отсутствуют"}</span></summary>
      <div class="item-details">${description}${narrative}${attributes}${effects}</div></details>`;
  }

  function setItemFilterOptions(select, placeholder, values) {
    const previous = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = values.includes(previous) ? previous : "";
  }

  function updateItemFilters() {
    const isIngredient = $("#item-type-filter").value === "ingredient";
    const ingredients = items.filter(item => item.type === "ingredient");
    const rarities = [...new Set(ingredients.map(item => item.details?.rarity).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const groups = [...new Set(ingredients.map(item => item.details?.alchemy_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    setItemFilterOptions($("#item-rarity-filter"), "Любая редкость", rarities);
    setItemFilterOptions($("#item-group-filter"), "Любая группа", groups);
    $("#item-rarity-wrap").hidden = !isIngredient || rarities.length < 2;
    $("#item-group-wrap").hidden = !isIngredient || groups.length < 2;
  }

  function renderItems() {
    const terms = normalize($("#item-search").value.trim()).split(/\s+/).filter(Boolean);
    const type = $("#item-type-filter").value;
    const rarity = $("#item-rarity-filter").value;
    const group = $("#item-group-filter").value;
    const visible = items.filter(item => {
      if (type && item.type !== type) return false;
      if (rarity && item.details?.rarity !== rarity) return false;
      if (group && item.details?.alchemy_group !== group) return false;
      const detailLabels = { habitat: "место обитания", rarity: "редкость", acquisition_method: "где найти", alchemy_group: "алхимическая группа", effect: "эффект", duration: "длительность", toxicity: "токсичность", application: "применение", notes: "примечание" };
      const searchable = normalize([
        item.name, item.typeLabel, item.description,
        ...Object.entries(item.details || {}).flatMap(([key, value]) => [detailLabels[key] || key, value]),
        ...(item.attributes || []).flatMap(attribute => [attribute.label, attribute.value]),
        ...(item.effects || []).flatMap(effect => [effect.text, effect.duration]),
      ].join(" "));
      return terms.every(term => searchable.includes(term));
    });
    $("#item-list").innerHTML = visible.map(itemCard).join("");
    $("#item-empty").hidden = visible.length > 0;
    $("#clear-item-filters").disabled = !$("#item-search").value && !type && !rarity && !group;
  }

  function resolveItemId(itemId) {
    let current = itemId;
    const seen = new Set();
    while (itemAliases[current] && !seen.has(current)) {
      seen.add(current);
      current = itemAliases[current];
    }
    return current;
  }

  function createEntryId() {
    return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function cleanEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const quantity = Number(raw.quantity);
    const unitWeight = raw.unitWeightKg === null || raw.unitWeightKg === "" || raw.unitWeightKg === undefined ? null : Number(raw.unitWeightKg);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return null;
    if (unitWeight !== null && (!Number.isFinite(unitWeight) || unitWeight < 0 || unitWeight > 100000)) return null;
    const itemId = raw.itemId ? resolveItemId(String(raw.itemId)) : null;
    const catalogItem = itemId ? itemById.get(itemId) : null;
    const name = String(raw.name || catalogItem?.name || "").trim().slice(0, 120);
    if (!name || (itemId && !catalogItem)) return null;
    return { id: String(raw.id || createEntryId()).slice(0, 120), itemId, name, quantity, unitWeightKg: unitWeight, custom: !itemId };
  }

  function readInventory() {
    const initial = { version: 1, capacityKg: null, items: [] };
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!stored || stored.version !== 1 || !Array.isArray(stored.items)) return initial;
      const capacity = stored.capacityKg === null || stored.capacityKg === "" ? null : Number(stored.capacityKg);
      initial.capacityKg = Number.isFinite(capacity) && capacity >= 0 && capacity <= 100000 ? capacity : null;
      initial.items = stored.items.map(cleanEntry).filter(Boolean);
      return initial;
    } catch { return initial; }
  }

  let inventory = readInventory();

  function saveInventory(message = "") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(inventory));
      $("#inventory-message").textContent = message;
    } catch {
      $("#inventory-message").textContent = "Браузер не смог сохранить данные. Скачайте JSON-файл как резервную копию.";
    }
    renderInventory();
  }

  function setupInventorySelect() {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    $("#inventory-item-select").innerHTML = `<option value="">Выберите предмет…</option>${sorted.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.typeLabel)}</option>`).join("")}`;
  }

  function renderInventory() {
    const knownWeight = inventory.items.reduce((sum, entry) => sum + (entry.unitWeightKg === null ? 0 : entry.unitWeightKg * entry.quantity), 0);
    const unknownCount = inventory.items.filter(entry => entry.unitWeightKg === null).length;
    const capacity = inventory.capacityKg;
    $("#capacity-input").value = capacity === null ? "" : String(capacity);
    $("#weight-total").textContent = `${numberText(knownWeight)} кг${unknownCount ? " + ?" : ""}`;
    $("#weight-caption").textContent = capacity === null ? "грузоподъёмность не задана" : `из ${numberText(capacity)} кг`;
    const progress = $("#weight-progress");
    const track = $(".weight-track");
    const percent = capacity > 0 ? Math.min(100, knownWeight / capacity * 100) : 0;
    progress.style.width = `${percent}%`;
    track.classList.toggle("over", capacity !== null && capacity > 0 && knownWeight > capacity);
    track.setAttribute("aria-valuenow", String(Math.round(percent)));
    track.setAttribute("aria-valuemax", "100");
    const warnings = [];
    if (unknownCount) warnings.push(`У ${unknownCount} ${unknownCount === 1 ? "позиции" : "позиций"} не указан вес; общий вес показан без них.`);
    if (capacity !== null && knownWeight > capacity) warnings.push("Превышена заданная грузоподъёмность.");
    $("#weight-warning").hidden = warnings.length === 0;
    $("#weight-warning").textContent = warnings.join(" ");
    $("#inventory-list").innerHTML = inventory.items.map(entry => {
      const total = entry.unitWeightKg === null ? "Вес не указан" : `${numberText(entry.unitWeightKg * entry.quantity)} кг`;
      const kind = entry.custom ? "Свой предмет" : itemById.get(entry.itemId)?.typeLabel || "Предмет из каталога";
      return `<div class="inventory-row" data-entry-id="${escapeHtml(entry.id)}">
        <div class="inventory-item-name">${escapeHtml(entry.name)}<span class="inventory-subline">${escapeHtml(kind)}</span></div>
        <label class="sr-only" for="qty-${escapeHtml(entry.id)}">Количество: ${escapeHtml(entry.name)}</label><input id="qty-${escapeHtml(entry.id)}" class="inventory-input inventory-qty" data-field="quantity" type="number" min="0.1" step="0.1" value="${escapeHtml(entry.quantity)}" aria-label="Количество: ${escapeHtml(entry.name)}">
        <label class="sr-only" for="wt-${escapeHtml(entry.id)}">Вес за единицу в килограммах: ${escapeHtml(entry.name)}</label><input id="wt-${escapeHtml(entry.id)}" class="inventory-input inventory-unit" data-field="unitWeightKg" type="number" min="0" step="0.1" value="${entry.unitWeightKg === null ? "" : escapeHtml(entry.unitWeightKg)}" placeholder="Вес, кг" aria-label="Вес за единицу: ${escapeHtml(entry.name)}">
        <span class="inventory-weight">${total}</span><button class="remove-item" type="button" data-remove="${escapeHtml(entry.id)}" aria-label="Удалить ${escapeHtml(entry.name)}">×</button></div>`;
    }).join("");
    $("#inventory-empty").hidden = inventory.items.length > 0;
  }

  function addInventoryEntry(entry) {
    const existing = entry.itemId && inventory.items.find(item => item.itemId === entry.itemId);
    if (existing) {
      existing.quantity += entry.quantity;
      if (entry.unitWeightKg !== null) existing.unitWeightKg = entry.unitWeightKg;
    } else inventory.items.push(entry);
    saveInventory("Инвентарь сохранён в этом браузере.");
  }

  function showPage(page) {
    if (!sections[page]) return;
    activePage = page;
    document.querySelectorAll(".page-view").forEach(view => { view.hidden = view.id !== `${page}-page`; });
    document.querySelectorAll(".nav-item").forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    document.title = `${sections[page]} — Кодекс ремесленника`;
    history.replaceState(null, "", `#${page}`);
  }

  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  $("#search").addEventListener("input", renderRecipes);
  $("#recipe-domain").addEventListener("change", () => {
    $("#craft-type-filter").value = "";
    updateRecipeFilters();
    renderRecipes();
  });
  $("#craft-type-filter").addEventListener("change", () => { updateRecipeFilters(); renderRecipes(); });
  $("#craft-category-filter").addEventListener("change", renderRecipes);
  $("#tier-filter").addEventListener("change", renderRecipes);
  $("#clear-filters").addEventListener("click", () => {
    $("#search").value = "";
    $("#tier-filter").value = "";
    $("#craft-type-filter").value = "";
    updateRecipeFilters();
    renderRecipes();
    $("#search").focus();
  });
  $("#item-search").addEventListener("input", renderItems);
  $("#item-type-filter").addEventListener("change", () => { updateItemFilters(); renderItems(); });
  $("#item-rarity-filter").addEventListener("change", renderItems);
  $("#item-group-filter").addEventListener("change", renderItems);
  $("#clear-item-filters").addEventListener("click", () => {
    $("#item-search").value = "";
    $("#item-type-filter").value = "";
    updateItemFilters();
    renderItems();
    $("#item-search").focus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      (activePage === "items" ? $("#item-search") : $("#search")).focus();
    }
    if (event.key === "Escape" && document.activeElement.matches("input[type=search]")) {
      document.activeElement.value = "";
      renderRecipes();
      renderItems();
      document.activeElement.blur();
    }
  });

  $("#inventory-item-select").addEventListener("change", event => {
    const item = itemById.get(event.target.value);
    $("#inventory-unit-weight").value = item?.weightKg ?? "";
  });
  $("#add-inventory-item").addEventListener("submit", event => {
    event.preventDefault();
    const item = itemById.get($("#inventory-item-select").value);
    const quantity = Number($("#inventory-quantity").value);
    const weightRaw = $("#inventory-unit-weight").value;
    const unitWeightKg = weightRaw === "" ? null : Number(weightRaw);
    if (!item || !Number.isFinite(quantity) || quantity <= 0 || (unitWeightKg !== null && (!Number.isFinite(unitWeightKg) || unitWeightKg < 0))) return;
    addInventoryEntry({ id: createEntryId(), itemId: item.id, name: item.name, quantity, unitWeightKg, custom: false });
    event.target.reset();
    $("#inventory-quantity").value = "1";
    $("#inventory-unit-weight").value = "";
  });
  $("#add-custom-item").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("#custom-item-name").value.trim();
    const quantity = Number($("#custom-item-quantity").value);
    const weightRaw = $("#custom-item-weight").value;
    const unitWeightKg = weightRaw === "" ? null : Number(weightRaw);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || (unitWeightKg !== null && (!Number.isFinite(unitWeightKg) || unitWeightKg < 0))) return;
    addInventoryEntry({ id: createEntryId(), itemId: null, name, quantity, unitWeightKg, custom: true });
    event.target.reset();
    $("#custom-item-quantity").value = "1";
  });
  $("#capacity-input").addEventListener("change", event => {
    const value = event.target.value;
    inventory.capacityKg = value === "" ? null : Number(value);
    if (inventory.capacityKg !== null && (!Number.isFinite(inventory.capacityKg) || inventory.capacityKg < 0)) inventory.capacityKg = null;
    saveInventory("Грузоподъёмность сохранена.");
  });
  $("#inventory-list").addEventListener("change", event => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const row = input.closest("[data-entry-id]");
    const entry = inventory.items.find(item => item.id === row.dataset.entryId);
    if (!entry) return;
    if (input.dataset.field === "quantity") {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) { input.value = entry.quantity; return; }
      entry.quantity = value;
    } else {
      const value = input.value === "" ? null : Number(input.value);
      if (value !== null && (!Number.isFinite(value) || value < 0)) { input.value = entry.unitWeightKg ?? ""; return; }
      entry.unitWeightKg = value;
    }
    saveInventory("Изменения сохранены.");
  });
  $("#inventory-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    inventory.items = inventory.items.filter(item => item.id !== button.dataset.remove);
    saveInventory("Предмет удалён.");
  });
  $("#clear-inventory").addEventListener("click", () => {
    if (!inventory.items.length || !window.confirm("Удалить все предметы из инвентаря?")) return;
    inventory.items = [];
    saveInventory("Инвентарь очищен.");
  });
  $("#export-inventory").addEventListener("click", () => {
    const payload = { format: "witcher-workshop-inventory", version: 1, exportedAt: new Date().toISOString(), capacityKg: inventory.capacityKg, items: inventory.items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "witcher-inventory.json";
    anchor.click();
    URL.revokeObjectURL(url);
    $("#inventory-message").textContent = "JSON-файл инвентаря скачан.";
  });
  $("#import-inventory").addEventListener("click", () => $("#inventory-file").click());
  $("#inventory-file").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Файл больше 5 МБ.");
      const payload = JSON.parse(await file.text());
      if (payload.version !== 1 || !Array.isArray(payload.items)) throw new Error("Формат JSON не распознан.");
      const imported = payload.items.map(cleanEntry);
      if (imported.some(entry => !entry)) throw new Error("В файле есть предметы с некорректными данными.");
      const capacity = payload.capacityKg === null || payload.capacityKg === "" ? null : Number(payload.capacityKg);
      if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0 || capacity > 100000)) throw new Error("Некорректная грузоподъёмность.");
      inventory = { version: 1, capacityKg: capacity, items: imported };
      saveInventory(`Загружено предметов: ${imported.length}.`);
    } catch (error) {
      $("#inventory-message").textContent = `Не удалось загрузить файл: ${error.message || "ошибка формата"}`;
    } finally { event.target.value = ""; }
  });

  setupInventorySelect();
  updateRecipeFilters();
  updateItemFilters();
  renderRecipes();
  renderItems();
  renderInventory();
  const initialPage = location.hash.slice(1);
  if (sections[initialPage]) showPage(initialPage);
})();
