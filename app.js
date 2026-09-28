(() => {
  const recipes = window.RECIPES || [];
  const items = window.ITEMS || [];
  const alchemySymbols = window.ALCHEMY_SYMBOLS || {};
  const itemAliases = window.ITEM_ID_ALIASES || {};
  const itemById = new Map(items.map(item => [item.id, item]));
  const sections = { recipes: "Рецепты", items: "Предметы", characters: "Персонажи" };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const numberText = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
  let activePage = "recipes";
  let characterViewMode = "library";
  let activeCharacterTab = "sheet";
  let renameTargetCharacterId = null;
  let characterCreationDraft = null;

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
    const outputs = (recipe.outputs || []).map(output => {
      const label = `${escapeHtml(output.name)}${output.quantity !== 1 ? ` ×${escapeHtml(output.quantity)}` : ""}`;
      return output.itemId
        ? `<button type="button" class="catalog-inline-link" data-open-catalog-item="${escapeHtml(output.itemId)}">${label}</button>`
        : `<span>${label}</span>`;
    }).join(" ");
    return `<details class="recipe-card" data-recipe-id="${escapeHtml(recipe.id)}">
      <summary class="recipe-summary"><span class="recipe-title-block"><span class="recipe-title">${escapeHtml(recipe.name)}</span></span>
        <span class="ingredient-preview">${preview || "Состав не указан"}</span>${dc}${time}<span class="card-arrow" aria-hidden="true">⌄</span></summary>
      <div class="recipe-details"><div class="detail-grid">
        <div><span class="detail-label">Уровень</span><span class="detail-value">${escapeHtml(recipe.tier || "—")}</span></div>
        ${recipe.dc ? `<div><span class="detail-label">Сложность изготовления</span><span class="detail-value">${escapeHtml(recipe.dc)}</span></div>` : ""}
        ${recipe.time ? `<div><span class="detail-label">Время</span><span class="detail-value">${escapeHtml(recipe.time)}</span></div>` : ""}
        ${recipe.priceCrowns !== null && recipe.priceCrowns !== undefined ? `<div><span class="detail-label">Цена</span><span class="detail-value">${numberText(recipe.priceCrowns)} кр.</span></div>` : ""}
        ${recipe.surchargeCrowns !== null && recipe.surchargeCrowns !== undefined ? `<div><span class="detail-label">Доплата за изготовление</span><span class="detail-value">${numberText(recipe.surchargeCrowns)} кр.</span></div>` : ""}
        ${(recipe.outputs || []).length ? `<div class="full-width"><span class="detail-label">Результат</span><span class="detail-value">${outputs}</span></div>` : ""}
        ${recipe.type === "alchemy" ? `<div class="full-width"><span class="detail-label">Формула · символы ингредиентов</span>${formula(ingredients)}</div>` : ""}
        <div class="full-width"><span class="detail-label">Компоненты · нажмите, чтобы открыть предмет</span><span class="ingredient-list">${ingredients.map(ingredient => {
          const label = `${escapeHtml(ingredient.name)}${ingredient.quantity ? ` ×${escapeHtml(ingredient.quantity)}` : ""}`;
          return ingredient.itemId
            ? `<button type="button" class="ingredient-tag catalog-inline-link" data-open-catalog-item="${escapeHtml(ingredient.itemId)}">${label}</button>`
            : `<span class="ingredient-tag">${label}</span>`;
        }).join("") || `<span class="detail-value">Не указаны</span>`}</span></div>
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
      const labels = { where_found: "Где найти", availability: "Доступность", acquisition_method: "Где найти", alchemy_group: "Группа", effect: "Эффект", duration: "Длительность", toxicity: "Токсичность", application: "Применение", notes: "Примечание" };
      return `<div class="detail-block"><span class="detail-label">${labels[key] || escapeHtml(key)}</span><p>${escapeHtml(value)}</p></div>`;
    }).join("");
    const attributes = item.attributes?.length ? `<div class="detail-block"><span class="detail-label">Характеристики</span><div class="attribute-list">${item.attributes.map(attribute => `<div class="attribute-row"><span>${escapeHtml(attribute.label)}</span><strong>${fieldValue(attribute.value, attribute.unit)}</strong></div>`).join("")}</div></div>` : "";
    const effects = item.effects?.length ? `<div class="detail-block"><span class="detail-label">Эффекты</span>${item.effects.map(effect => `<p>${escapeHtml(effect.text)}${effect.duration ? ` · ${escapeHtml(effect.duration)}` : ""}</p>`).join("")}</div>` : "";
    const description = item.description ? `<div class="detail-block"><span class="detail-label">Описание</span><p>${escapeHtml(item.description)}</p></div>` : "";
    const related = recipes.filter(recipe => (recipe.ingredients || []).some(entry => entry.itemId === item.id)
      || (recipe.outputs || []).some(entry => entry.itemId === item.id));
    const relatedRecipes = related.length ? `<details class="related-recipe-links"><summary>Связанные рецепты и чертежи</summary><div>${related.map(recipe => `<button type="button" class="catalog-inline-link" data-open-recipe="${escapeHtml(recipe.id)}">${escapeHtml(recipe.name)} · ${recipe.type === "alchemy" ? "Алхимия" : "Ремесло"}</button>`).join("")}</div></details>` : "";
    return `<details class="item-card" data-item-id="${escapeHtml(item.id)}"><summary class="item-summary"><span class="item-name">${escapeHtml(item.name)}</span><span class="card-arrow" aria-hidden="true">⌄</span><span class="item-kind">${escapeHtml(item.typeLabel)}</span><span class="item-quick-meta">${quick.join("") || "Сведения о весе и цене отсутствуют"}</span></summary>
      <div class="item-details">${description}${narrative}${attributes}${effects}${relatedRecipes}</div></details>`;
  }

  function setItemFilterOptions(select, placeholder, values) {
    const previous = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = values.includes(previous) ? previous : "";
  }

  function updateItemFilters() {
    const isIngredient = $("#item-type-filter").value === "ingredient";
    const isEquipment = $("#item-type-filter").value === "equipment";
    const ingredients = items.filter(item => item.type === "ingredient");
    const availabilities = [...new Set(ingredients.map(item => item.details?.availability).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const groups = [...new Set(ingredients.map(item => item.details?.alchemy_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const equipmentCategories = [...new Set(items.filter(item => item.type === "equipment")
      .flatMap(item => item.attributes || [])
      .filter(attribute => attribute.code === "equipment_category")
      .map(attribute => attribute.value))].sort((a, b) => a.localeCompare(b, "ru"));
    setItemFilterOptions($("#item-availability-filter"), "Любая доступность", availabilities);
    setItemFilterOptions($("#item-group-filter"), "Любая группа", groups);
    setItemFilterOptions($("#item-equipment-category-filter"), "Всё снаряжение", equipmentCategories);
    $("#item-availability-wrap").hidden = !isIngredient || availabilities.length < 2;
    $("#item-group-wrap").hidden = !isIngredient || groups.length < 2;
    $("#item-equipment-category-wrap").hidden = !isEquipment || equipmentCategories.length < 2;
  }

  function renderItems() {
    const terms = normalize($("#item-search").value.trim()).split(/\s+/).filter(Boolean);
    const type = $("#item-type-filter").value;
    const availability = $("#item-availability-filter").value;
    const group = $("#item-group-filter").value;
    const equipmentCategory = $("#item-equipment-category-filter").value;
    const visible = items.filter(item => {
      if (type && item.type !== type) return false;
      if (availability && item.details?.availability !== availability) return false;
      if (group && item.details?.alchemy_group !== group) return false;
      if (equipmentCategory && !item.attributes?.some(attribute => attribute.code === "equipment_category" && attribute.value === equipmentCategory)) return false;
      const detailLabels = { where_found: "где найти", availability: "доступность", acquisition_method: "где найти", alchemy_group: "алхимическая группа", effect: "эффект", duration: "длительность", toxicity: "токсичность", application: "применение", notes: "примечание" };
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
    $("#clear-item-filters").disabled = !$("#item-search").value && !type && !availability && !group && !equipmentCategory;
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
    if (!name) return null;
    const armorEv = raw.armorEv === null || raw.armorEv === "" || raw.armorEv === undefined ? null : Number(raw.armorEv);
    if (armorEv !== null && (!Number.isFinite(armorEv) || armorEv < 0 || armorEv > 100)) return null;
    return {
      id: String(raw.id || createEntryId()).slice(0, 120),
      itemId,
      name,
      quantity,
      unitWeightKg: unitWeight,
      conditionNotes: String(raw.conditionNotes ?? "").slice(0, 2000),
      armorEv,
      customCategory: itemId ? "" : ["other", "weapon", "armor", "shield"].includes(raw.customCategory) ? raw.customCategory : "other",
      custom: !itemId,
    };
  }

  let persistenceReady = true;
  let persistenceError = "";
  let migrationNotice = "";
  let characterStore;
  try {
    const loaded = window.CharacterStore.load(localStorage, { cleanLegacyEntry: cleanEntry });
    characterStore = loaded.store;
    if (loaded.migratedLegacyInventory) migrationNotice = "Старый инвентарь перенесён в «Персонаж 1». Исходный JSON сохранён для восстановления.";
    if (loaded.migratedSchemaVersion) migrationNotice = "Формат листа обновлён; исходная версия сохранена в резервной копии браузера.";
  } catch (error) {
    persistenceReady = false;
    persistenceError = error.message || "Не удалось проверить сохранение.";
    characterStore = window.CharacterStore.createStore("Данные не загружены");
  }

  function activeCharacter() {
    return characterStore.characters.find(character => character.characterId === characterStore.activeCharacterId) || characterStore.characters[0];
  }

  let inventory = activeCharacter().equipment;
  let saveTimer = null;

  function setSaveMessage(message, isError = false) {
    const characterMessage = $("#character-message");
    if (characterMessage) {
      characterMessage.textContent = message;
      characterMessage.classList.toggle("is-error", isError);
    }
    const inventoryMessage = $("#inventory-message");
    if (inventoryMessage) {
      inventoryMessage.textContent = message;
      inventoryMessage.classList.toggle("is-error", isError);
    }
  }

  function persistStore(message = "", immediate = true) {
    if (!persistenceReady) {
      setSaveMessage(`Сохранение заблокировано: ${persistenceError} Загрузите проверенный JSON-файл.`, true);
      return false;
    }
    if (saveTimer) window.clearTimeout(saveTimer);
    const write = () => {
      saveTimer = null;
      try {
        activeCharacter().updatedAt = new Date().toISOString();
        characterStore = window.CharacterStore.save(localStorage, characterStore);
        inventory = activeCharacter().equipment;
        const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date());
        setSaveMessage(`${message ? `${message} ` : ""}Сохранено локально в ${time}.`);
      } catch (error) {
        setSaveMessage(`Не удалось сохранить. Скачайте JSON-резервную копию. ${error.message || ""}`.trim(), true);
      }
    };
    if (immediate) write();
    else {
      setSaveMessage("Сохраняю изменения…");
      saveTimer = window.setTimeout(write, 300);
    }
    return true;
  }

  function saveInventory(message = "Изменения инвентаря сохранены.") {
    activeCharacter().equipment = inventory;
    persistStore(message, true);
    renderInventory();
  }

  function inventoryWeight(character = activeCharacter()) {
    const entries = character.equipment?.items || [];
    return {
      knownKg: entries.reduce((sum, entry) => sum + (entry.unitWeightKg === null ? 0 : entry.unitWeightKg * entry.quantity), 0),
      unknownCount: entries.filter(entry => entry.unitWeightKg === null).length,
    };
  }

  const inventorySearchItems = items.filter(item => item.type !== "transport" && !alchemySymbols[item.id]);
  let selectedInventoryItemId = null;
  let inventoryMatches = [];
  let activeInventoryMatch = -1;

  function closeInventorySuggestions() {
    $("#inventory-search-results").hidden = true;
    $("#inventory-item-search").setAttribute("aria-expanded", "false");
    $("#inventory-item-search").removeAttribute("aria-activedescendant");
    activeInventoryMatch = -1;
  }

  function setActiveInventoryMatch(index) {
    activeInventoryMatch = index;
    const options = $("#inventory-search-results").querySelectorAll("[role=option]");
    options.forEach((option, position) => {
      option.setAttribute("aria-selected", String(position === index));
      option.classList.toggle("active", position === index);
    });
    if (index >= 0) {
      $("#inventory-item-search").setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else $("#inventory-item-search").removeAttribute("aria-activedescendant");
  }

  function renderInventorySuggestions() {
    const query = normalize($("#inventory-item-search").value.trim());
    const results = $("#inventory-search-results");
    if (!query) {
      inventoryMatches = [];
      closeInventorySuggestions();
      $("#inventory-search-help").textContent = "";
      return;
    }
    const terms = query.split(/\s+/);
    inventoryMatches = inventorySearchItems
      .filter(item => terms.every(term => normalize(`${item.name} ${item.typeLabel}`).includes(term)))
      .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query))
        || a.name.localeCompare(b.name, "ru") || a.typeLabel.localeCompare(b.typeLabel, "ru"))
      .slice(0, 8);
    results.innerHTML = inventoryMatches.map((item, index) => `<div id="inventory-search-option-${index}" class="inventory-search-option" role="option" aria-selected="false" data-item-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.typeLabel)} · ${item.weightKg === null ? "Вес не указан" : `${numberText(item.weightKg)} кг`}</span></div>`).join("");
    results.hidden = inventoryMatches.length === 0;
    $("#inventory-item-search").setAttribute("aria-expanded", String(inventoryMatches.length > 0));
    $("#inventory-search-help").textContent = inventoryMatches.length
      ? "Выберите предмет: стрелки для перемещения, Enter для подтверждения."
      : "Совпадений нет. Уточните название или добавьте свой предмет.";
    setActiveInventoryMatch(-1);
  }

  function selectInventoryItem(item) {
    selectedInventoryItemId = item.id;
    $("#inventory-item-search").value = item.name;
    $("#inventory-item-search").setCustomValidity("");
    $("#inventory-unit-weight").value = item.weightKg ?? "";
    $("#inventory-search-help").textContent = `Выбрано: ${item.name} · ${item.typeLabel}.`;
    closeInventorySuggestions();
    $("#inventory-quantity").focus();
  }

  function renderInventory() {
    $("#inventory-character-name").textContent = activeCharacter().personal.name.trim() || "Без имени";
    const { knownKg: knownWeight, unknownCount } = inventoryWeight();
    const derived = window.CharacterRules.deriveCharacter(activeCharacter(), { carriedWeightKg: knownWeight, unknownWeightCount: unknownCount });
    const capacity = inventory.capacityKg ?? derived.encumbranceKg;
    $("#capacity-input").value = inventory.capacityKg === null ? "" : String(inventory.capacityKg);
    $("#weight-total").textContent = `${numberText(knownWeight)} кг${unknownCount ? " + ?" : ""}`;
    $("#weight-caption").textContent = capacity === null
      ? "грузоподъёмность не задана"
      : `из ${numberText(capacity)} кг · ${inventory.capacityKg === null ? "Вес по Тел" : "задано вручную"}`;
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
    if (derived.load.status === "over-lift-limit") warnings.push(`Вес превышает предел подъёма по Тел (${numberText(derived.liftLimitKg)} кг).`);
    $("#weight-warning").hidden = warnings.length === 0;
    $("#weight-warning").textContent = warnings.join(" ");
    $("#inventory-list").innerHTML = inventory.items.map(entry => {
      const total = entry.unitWeightKg === null ? "Вес не указан" : `${numberText(entry.unitWeightKg * entry.quantity)} кг`;
      const kind = entry.custom ? "Свой предмет" : itemById.get(entry.itemId)?.typeLabel || "Предмет из каталога";
      const armorRelated = combatItemAllowed(entry, "armor");
      const catalogEv = catalogAttribute(combatInventoryItem(entry), "encumbrance");
      const itemName = entry.itemId
        ? `<button type="button" class="inventory-catalog-link" data-open-catalog-item="${escapeHtml(entry.itemId)}">${escapeHtml(entry.name)}</button>`
        : escapeHtml(entry.name);
      return `<div class="inventory-row" data-entry-id="${escapeHtml(entry.id)}">
        <div class="inventory-item-name">${itemName}<span class="inventory-subline">${escapeHtml(kind)}</span></div>
        <label class="sr-only" for="qty-${escapeHtml(entry.id)}">Количество: ${escapeHtml(entry.name)}</label><input id="qty-${escapeHtml(entry.id)}" class="inventory-input inventory-qty" data-field="quantity" type="number" min="0.1" step="0.1" value="${escapeHtml(entry.quantity)}" aria-label="Количество: ${escapeHtml(entry.name)}">
        <label class="sr-only" for="wt-${escapeHtml(entry.id)}">Вес за единицу в килограммах: ${escapeHtml(entry.name)}</label><input id="wt-${escapeHtml(entry.id)}" class="inventory-input inventory-unit" data-field="unitWeightKg" type="number" min="0" step="0.1" value="${entry.unitWeightKg === null ? "" : escapeHtml(entry.unitWeightKg)}" placeholder="Вес, кг" aria-label="Вес за единицу: ${escapeHtml(entry.name)}">
        <label class="sr-only" for="condition-${escapeHtml(entry.id)}">Состояние: ${escapeHtml(entry.name)}</label><input id="condition-${escapeHtml(entry.id)}" class="inventory-input inventory-condition" data-field="conditionNotes" maxlength="2000" value="${escapeHtml(entry.conditionNotes || "")}" placeholder="Состояние" aria-label="Состояние: ${escapeHtml(entry.name)}">
        ${armorRelated ? `<label class="sr-only" for="ev-${escapeHtml(entry.id)}">Переопределить EV брони: ${escapeHtml(entry.name)}</label><input id="ev-${escapeHtml(entry.id)}" class="inventory-input inventory-ev" data-field="armorEv" type="number" min="0" max="100" step="1" value="${entry.armorEv === null || entry.armorEv === undefined ? "" : escapeHtml(entry.armorEv)}" placeholder="EV ${catalogEv === null ? "?" : escapeHtml(catalogEv)}" aria-label="Переопределить EV брони: ${escapeHtml(entry.name)}">` : `<span class="inventory-no-ev">—</span>`}
        <span class="inventory-weight">${total}</span><button class="remove-item" type="button" data-remove="${escapeHtml(entry.id)}" aria-label="Удалить ${escapeHtml(entry.name)}">×</button></div>`;
    }).join("");
    $("#inventory-empty").hidden = inventory.items.length > 0;
    renderCharacterDerived();
    renderCharacterCombatEquipment();
  }

  function addInventoryEntry(entry, separate = false) {
    const existing = !separate && entry.itemId && inventory.items.find(item => item.itemId === entry.itemId);
    if (existing) {
      existing.quantity += entry.quantity;
      if (entry.unitWeightKg !== null) existing.unitWeightKg = entry.unitWeightKg;
    } else inventory.items.push(entry);
    saveInventory("Инвентарь сохранён в этом браузере.");
  }

  function unlinkInventoryEntry(entryId) {
    const combat = activeCharacter().equipment.combat;
    for (const slot of Object.values(combat.armorByZone)) {
      if (slot.inventoryEntryId === entryId) slot.inventoryEntryId = null;
    }
    for (const weapon of combat.weapons) {
      if (weapon.inventoryEntryId === entryId) weapon.inventoryEntryId = null;
    }
    if (combat.shield?.inventoryEntryId === entryId) combat.shield.inventoryEntryId = null;
  }

  const attributeLabels = {
    INT: "Интеллект", REF: "Реакция", DEX: "Ловкость", BODY: "Телосложение",
    SPD: "Скорость", EMP: "Эмпатия", CRA: "Ремесло", WILL: "Воля", LUCK: "Удача",
  };
  const attributeAbbreviations = {
    INT: "Инт", REF: "Реа", DEX: "Лвк", BODY: "Тел", SPD: "Скор",
    EMP: "Эмп", CRA: "Рем", WILL: "Воля", LUCK: "Удача",
  };
  const derivedAbbreviations = { REC: "Отдых", STUN: "Уст", RUN: "Бег", LEAP: "Прж", STA: "Вын", ENC: "Вес" };
  const shortAttribute = code => attributeAbbreviations[code] || code;
  const signed = value => value > 0 ? `+${value}` : String(value);

  const valueOrDash = value => value === null || value === undefined ? "—" : numberText(value);

  function activeDerivedValues() {
    const character = activeCharacter();
    const weight = inventoryWeight(character);
    const armor = armorLoadoutStats(character);
    return window.CharacterRules.deriveCharacter(character, {
      carriedWeightKg: weight.knownKg,
      unknownWeightCount: weight.unknownCount,
      armorEv: armor.ev,
      unknownArmorEvCount: armor.unknownCount,
    });
  }

  function armorLoadoutStats(character = activeCharacter()) {
    const combat = character.equipment?.combat;
    if (!combat?.armorByZone) return { ev: 0, knownEv: 0, unknownCount: 0, itemCount: 0 };
    const wornIds = [...new Set(Object.values(combat.armorByZone).map(slot => slot.inventoryEntryId).filter(Boolean))];
    const worn = wornIds.map(id => character.equipment.items.find(entry => entry.id === id)).filter(Boolean);
    let knownEv = 0;
    let unknownCount = 0;
    for (const entry of worn) {
      const catalogValue = catalogAttribute(entry.itemId ? itemById.get(entry.itemId) : null, "encumbrance");
      const raw = entry.armorEv ?? catalogValue;
      const ev = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      if (!Number.isFinite(ev) || ev < 0) unknownCount += 1;
      else knownEv += ev;
    }
    return { ev: unknownCount ? null : knownEv, knownEv, unknownCount, itemCount: worn.length };
  }

  function renderCharacterStatus(derived) {
    const character = activeCharacter();
    $("#character-sheet-race").textContent = character.personal.race.trim() || "Раса не указана";
    $("#character-sheet-profession").textContent = character.personal.profession.trim() || "Профессия не указана";
    const hp = character.state.currentHp;
    const sta = character.state.currentSta;
    const luck = character.state.currentLuck;
    $("#character-summary-hp").textContent = `${valueOrDash(hp)} / ${valueOrDash(derived.maxHp)}`;
    $("#character-summary-sta").textContent = `${valueOrDash(sta)} / ${valueOrDash(derived.maxSta)}`;
    $("#character-summary-luck").textContent = valueOrDash(luck);
    $("#character-summary-conditions").textContent = character.state.conditions.length
      ? character.state.conditions.join(" · ")
      : "Не отмечены";
  }

  function renderCharacterDerived() {
    if (!$("#character-derived-values")) return;
    const derived = activeDerivedValues();
    renderCharacterStatus(derived);
    renderSkillTotals(derived);
    document.querySelectorAll("[data-attribute-total]").forEach(output => {
      const code = output.dataset.attributeTotal;
      const total = ["REF", "DEX", "SPD"].includes(code)
        ? derived.equipmentAdjustedAttributes?.[code]
        : derived.attributes[code]?.total;
      output.textContent = valueOrDash(total);
    });
    const entries = [
      ["Физическая основа", valueOrDash(derived.physicalBasis)],
      ["Максимум ПЗ", valueOrDash(derived.maxHp)],
      [`Максимум Выносливости · ${derivedAbbreviations.STA}`, valueOrDash(derived.maxSta)],
      [`Отдых · ${derivedAbbreviations.REC}`, valueOrDash(derived.recovery)],
      [`Устойчивость · ${derivedAbbreviations.STUN}`, valueOrDash(derived.stun)],
      [`Бег за ход · ${derivedAbbreviations.RUN}`, derived.runMeters === null ? "—" : `${numberText(derived.runMeters)} м`],
      [`Прыжок · ${derivedAbbreviations.LEAP}`, derived.leapMeters === null ? "—" : `${numberText(derived.leapMeters)} м`],
      [`Переносимый вес · ${derivedAbbreviations.ENC}`, derived.encumbranceKg === null ? "—" : `${numberText(derived.encumbranceKg)} кг`],
      ["Предел подъёма", derived.liftLimitKg === null ? "—" : `${numberText(derived.liftLimitKg)} кг`],
      ["Бонус ближнего боя", derived.meleeDamageBonus === null ? "—" : `${derived.meleeDamageBonus > 0 ? "+" : ""}${derived.meleeDamageBonus}`],
      ["Удар рукой", derived.punchDamage || "—"],
      ["Удар ногой", derived.kickDamage || "—"],
    ];
    const loadValue = derived.load.status === "within-capacity" ? "Штрафа нет"
      : derived.load.status === "encumbered" ? `−${derived.load.penalty} к Реа, Лвк и Скор`
        : derived.load.status === "over-lift-limit" ? "Выше предела подъёма"
          : "Вес неизвестен";
    const loadHint = derived.load.status === "unknown" && derived.load.unknownWeightCount
      ? "Укажите вес всех предметов в инвентаре"
      : derived.encumbranceKg === null ? "Введите Тел для расчёта переносимого веса"
        : `Вес инвентаря: ${numberText(derived.load.carriedWeightKg)} кг`;
    entries.push(["Штраф от нагрузки", loadValue, loadHint]);
    $("#character-derived-values").innerHTML = entries.map(([label, value, hint]) => `<div class="character-derived-card">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </div>`).join("");

    const notes = [];
    if (derived.attributes.BODY.total === null || derived.attributes.WILL.total === null) notes.push("Для расчёта физической основы, максимума ПЗ, Выносливости, Отдыха и Устойчивости укажите Тел и Волю.");
    if (derived.attributes.SPD.total === null) notes.push("Для расчёта бега и прыжка укажите Скор.");
    if (derived.attributes.BODY.total === null) notes.push("Для расчёта переносимого веса и урона укажите Тел.");
    if (derived.physicalBasis !== null && !derived.physicalBasisSupported) notes.push(`Физическая основа B=${derived.physicalBasis}: в проверенной таблице нет строки для этого значения.`);
    if (derived.meleeDamageBonus === null && derived.attributes.BODY.total !== null) notes.push(`Тел=${numberText(derived.attributes.BODY.total)}: значение урона отсутствует в проверенной таблице.`);
    if (derived.load.status === "over-lift-limit") notes.push("Штрафы за перегруз здесь не вычисляются: вес выше предела подъёма, указанного для Тел.");
    if (derived.armor.unknownCount) notes.push(`EV брони неизвестно для ${derived.armor.unknownCount} надетых предметов: штрафы к Реа, Лвк и магическим навыкам не рассчитаны полностью.`);
    $("#character-derived-note").hidden = notes.length === 0;
    $("#character-derived-note").textContent = notes.join(" ");
  }

  function characterName(character, index = 0) {
    return character.personal.name.trim() || `Персонаж ${index + 1}`;
  }

  function uniqueCharacterName(proposed) {
    const used = new Set(characterStore.characters.map(character => normalize(character.personal.name.trim())).filter(Boolean));
    const base = proposed.trim() || "Новый персонаж";
    if (!used.has(normalize(base))) return base;
    let suffix = 2;
    while (used.has(normalize(`${base} ${suffix}`))) suffix++;
    return `${base} ${suffix}`;
  }

  const creationSteps = [
    ["identity", "Раса, профессия и возраст"],
    ["background", "Предыстория"],
    ["attributes", "Характеристики"],
    ["skills", "Навыки"],
  ];

  function professionSkillDescriptors(draft = characterCreationDraft) {
    const profession = window.CharacterSkills.findProfession(draft?.professionId);
    if (!profession) return [];
    const result = [{
      key: `defining-${profession.id}`, name: profession.defining.name, attribute: profession.defining.attribute,
      catalogId: null, doubleCost: false, defining: true,
    }];
    for (const skillId of profession.skills) {
      const definition = window.CharacterSkills.SKILLS.find(skill => skill.id === skillId);
      if (definition) result.push({ key: definition.id, ...definition });
    }
    if (profession.languageChoices) {
      const definition = window.CharacterSkills.SKILLS.find(skill => skill.id === "language");
      if (definition) result.push({ key: `${profession.id}.language`, ...definition, name: `Язык (выберите ${profession.languageChoices})` });
    }
    for (const skillId of draft.professionChoices || []) {
      const definition = window.CharacterSkills.SKILLS.find(skill => skill.id === skillId);
      if (definition) result.push({ key: definition.id, ...definition });
    }
    return result.map(skill => ({ ...skill, rank: draft.professionRanks[skill.key] ?? 1 }));
  }

  function startingGeneralSkills(draft = characterCreationDraft) {
    const professionalIds = new Set(professionSkillDescriptors(draft).map(skill => skill.catalogId).filter(Boolean));
    return window.CharacterSkills.SKILLS.filter(skill => !professionalIds.has(skill.id))
      .map(skill => ({ ...skill, key: skill.id, rank: draft.generalRanks[skill.id] ?? 0 }));
  }

  function startingSkillCost(skill) { return skill.doubleCost ? 2 : 1; }
  function startingSkillSpent(skills) { return skills.reduce((sum, skill) => sum + skill.rank * startingSkillCost(skill), 0); }

  function creationGeneralBudget(draft = characterCreationDraft) {
    if (!draft.attributes) return 0;
    const raceTraits = window.CharacterCreation.RACE_TRAITS[draft.race] || {};
    const getValue = code => {
      const base = Number(draft.attributes[code] || 0);
      const racial = Number(raceTraits.attributeModifiers?.[code] || 0);
      const minimum = raceTraits.minimumAttributes?.[code] || 0;
      return Math.max(minimum, base + racial);
    };
    return getValue("INT") + getValue("REF");
  }

  function newCharacterCreationDraft() {
    return {
      step: "identity", race: "", professionId: "", age: "", name: "", backgroundMode: "", generatedLifePath: null,
      witcherRisk: "medium", attributeMode: "", attributePool: 70, rolls: null, diceAssignments: {}, attributes: null,
      professionChoices: [], professionRanks: {}, generalRanks: {},
    };
  }

  function setCreationError(message = "") {
    const element = $("#character-create-error");
    element.textContent = message;
    element.hidden = !message;
  }

  function renderCreationWizard() {
    if (!characterCreationDraft) return;
    const draft = characterCreationDraft;
    const openSkillGroups = draft.step === "skills"
      ? new Set([...$("#character-create-content").querySelectorAll("details[data-creation-skill-group][open]")].map(group => group.dataset.creationSkillGroup))
      : new Set();
    const index = creationSteps.findIndex(([id]) => id === draft.step);
    const stepIndex = Math.max(0, index);
    const stepTitle = creationSteps[stepIndex][1];
    const progress = Math.round(((stepIndex + 1) / creationSteps.length) * 100);
    const header = `<div class="creation-progress-label"><span>Создание персонажа · шаг ${stepIndex + 1} из ${creationSteps.length}</span><strong>${progress}%</strong></div><div class="creation-progress"><span style="width:${progress}%"></span></div><h2 id="character-create-title">${escapeHtml(stepTitle)}</h2>`;
    let body = "";

    if (draft.step === "identity") {
      const professionOptions = window.CharacterSkills.PROFESSIONS.map(profession => `<option value="${profession.id}"${draft.professionId === profession.id ? " selected" : ""}>${escapeHtml(profession.name)}</option>`).join("");
      body = `<div class="creation-field-grid">
        <label class="field">Раса<select data-creation-field="race"><option value="">Выберите расу</option>${window.CharacterSkills.RACES.map(race => `<option value="${escapeHtml(race)}"${draft.race === race ? " selected" : ""}>${escapeHtml(race)}</option>`).join("")}</select></label>
        <label class="field">Профессия<select data-creation-field="profession"><option value="">Выберите профессию</option>${professionOptions}</select></label>
        <label class="field">Возраст<input data-creation-field="age" type="number" min="${draft.race === "Ведьмак" ? "50" : "1"}" max="260" step="1" value="${escapeHtml(draft.age)}" placeholder="Лет"></label>
        <label class="field">Имя персонажа <span class="field-optional">можно позже</span><input data-creation-field="name" maxlength="120" value="${escapeHtml(draft.name)}" placeholder="Персонаж ${characterStore.characters.length + 1}"></label>
      </div><p class="creation-rule-note">Ведьмак должен быть ведьмаком по профессии; маги и жрецы бывают людьми или эльфами. Для ведьмака по книге задан возраст 50–260 лет.</p>`;
    } else if (draft.step === "background") {
      const randomPath = draft.generatedLifePath;
      const generatedDetails = randomPath ? (randomPath.kind === "witcher"
        ? `<p><strong>${escapeHtml(randomPath.school)}</strong> · странствия с ${escapeHtml(randomPath.travelAge)} лет · ${escapeHtml(randomPath.training)} · ${escapeHtml(randomPath.trial)}</p>`
        : `<p><strong>Родина:</strong> ${escapeHtml(randomPath.homeland?.region || "—")} · <strong>Семья:</strong> ${escapeHtml(randomPath.familyFate || "—")}</p>`)
        + `<p>Событий по десятилетиям: ${(randomPath.decadeEvents || []).length}. Связанных персонажей: ${(randomPath.relatives || []).length}. Имена можно будет вписать в лист позже.</p>`
        + `<ol class="creation-preview-events">${(randomPath.decadeEvents || []).slice(0, 5).map(event => `<li><strong>${escapeHtml(event.title || event.type)}</strong>${event.decadeStart === undefined ? "" : ` · ${escapeHtml(event.decadeStart)}–${escapeHtml(event.decadeEnd)} лет`} — ${escapeHtml(event.description || "")}</li>`).join("")}</ol>`
        : "";
      body = `<div class="creation-choice-grid">
        <button type="button" class="creation-choice${draft.backgroundMode === "manual" ? " selected" : ""}" data-creation-background="manual"><strong>Создать самому</strong><span>Оставить историю пустой и заполнить её в листе.</span></button>
        <button type="button" class="creation-choice${draft.backgroundMode === "random" ? " selected" : ""}" data-creation-background="random"><strong>Сгенерировать случайно</strong><span>Броски по таблицам жизненного пути; имена близких оставим пустыми.</span></button>
      </div>${draft.race === "Ведьмак" ? `<label class="field creation-risk-field">Риск пути ведьмака<select data-creation-field="witcherRisk"><option value="cautious"${draft.witcherRisk === "cautious" ? " selected" : ""}>Осторожный</option><option value="normal"${draft.witcherRisk === "normal" ? " selected" : ""}>Обычный</option><option value="medium"${draft.witcherRisk === "medium" ? " selected" : ""}>Средний</option><option value="risky"${draft.witcherRisk === "risky" ? " selected" : ""}>Рискованный</option></select></label>` : ""}
        ${draft.backgroundMode === "random" ? `<div class="creation-generated-preview">${generatedDetails || `<button type="button" class="button secondary" data-creation-action="generate-life-path">Бросить события и показать результат</button>`}${randomPath ? `<button type="button" class="text-button" data-creation-action="generate-life-path">Сгенерировать заново</button>` : ""}</div>` : ""}`;
    } else if (draft.step === "attributes") {
      const modeChoices = `<div class="creation-choice-grid compact"><button type="button" class="creation-choice${draft.attributeMode === "dice" ? " selected" : ""}" data-attribute-mode="dice"><strong>Броски 9d10</strong><span>Каждый результат 1 или 2 перебрасывается.</span></button><button type="button" class="creation-choice${draft.attributeMode === "points" ? " selected" : ""}" data-attribute-mode="points"><strong>Распределить очки</strong><span>Выберите пул 60, 70 или 80.</span></button></div>`;
      if (draft.attributeMode === "points") {
        const attributes = draft.attributes || window.CharacterCreation.balancedAttributes(draft.attributePool);
        const total = Object.values(attributes).reduce((sum, value) => sum + Number(value || 0), 0);
        body = `${modeChoices}<label class="field creation-pool-field">Пул характеристик<select data-creation-field="attributePool">${window.CharacterCreation.POINT_BUY_POOLS.map(pool => `<option value="${pool}"${Number(draft.attributePool) === pool ? " selected" : ""}>${pool}</option>`).join("")}</select></label>
          <div class="creation-budget-readout"><span>Распределено</span><strong id="creation-attribute-spent">${total} / ${draft.attributePool}</strong></div>
          <div class="creation-stat-grid">${window.CharacterCreation.ATTRIBUTES.map(code => `<div class="creation-stat-row"><strong>${escapeHtml(attributeLabels[code])}<small>${shortAttribute(code)}</small></strong><button type="button" class="stepper-button" data-attribute-step="-1" data-attribute-code="${code}" aria-label="Уменьшить ${attributeLabels[code]}"${Number(attributes[code]) <= 1 ? " disabled" : ""}>−</button><input data-attribute-point="${code}" type="number" min="1" max="10" step="1" value="${escapeHtml(attributes[code])}" aria-label="${attributeLabels[code]}"><button type="button" class="stepper-button" data-attribute-step="1" data-attribute-code="${code}" aria-label="Увеличить ${attributeLabels[code]}"${Number(attributes[code]) >= 10 || total >= Number(draft.attributePool) ? " disabled" : ""}>＋</button></div>`).join("")}</div>
          <p class="creation-rule-note">Базовое значение каждой характеристики должно быть 1–10. Расовые модификаторы учитываются отдельно в листе.</p>`;
      } else if (draft.attributeMode === "dice") {
        const rolls = draft.rolls || [];
        const assigned = Object.values(draft.diceAssignments).map(Number);
        body = `${modeChoices}<p class="creation-rule-note">Назначьте каждому параметру один из девяти результатов. Каждый бросок можно использовать только один раз.</p><div class="creation-dice-grid">${window.CharacterCreation.ATTRIBUTES.map(code => `<label class="field">${escapeHtml(attributeLabels[code])} · ${shortAttribute(code)}<select data-dice-attribute="${code}"><option value="">Выберите результат</option>${rolls.map((value, rollIndex) => `<option value="${rollIndex}"${Number(draft.diceAssignments[code]) === rollIndex ? " selected" : ""}${assigned.includes(rollIndex) && Number(draft.diceAssignments[code]) !== rollIndex ? " disabled" : ""}>Бросок ${rollIndex + 1}: ${value}</option>`).join("")}</select></label>`).join("")}</div><div class="creation-rolls" aria-label="Результаты бросков">${rolls.map((value, index) => `<span>${index + 1}: <strong>${value}</strong></span>`).join("")}</div>`;
      } else body = `${modeChoices}<p class="creation-rule-note">Сначала выберите способ определения характеристик.</p>`;
    } else if (draft.step === "skills") {
      const professional = professionSkillDescriptors(draft);
      const profession = window.CharacterSkills.findProfession(draft.professionId);
      const profSpent = startingSkillSpent(professional);
      const general = startingGeneralSkills(draft);
      const generalSpent = startingSkillSpent(general);
      const generalBudget = creationGeneralBudget(draft);
      const professionChoiceHtml = profession?.choice ? `<fieldset class="creation-skill-choice"><legend>${escapeHtml(profession.choice.label)}</legend><p>Выберите ровно ${profession.choice.requiredCount} навыков, чтобы получить все профессиональные навыки.</p><div class="profession-choice-grid">${profession.choice.options.map(id => {
        const skill = window.CharacterSkills.SKILLS.find(value => value.id === id);
        return skill ? `<label class="profession-choice-option"><input type="checkbox" data-creation-profession-choice="${id}"${draft.professionChoices.includes(id) ? " checked" : ""}><span>${escapeHtml(skill.name)}</span><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}</small></label>` : "";
      }).join("")}</div></fieldset>` : "";
      const professionalHtml = professional.length === 11 ? professional.map(skill => creationSkillRow(skill, "profession")).join("") : `<p class="character-empty">Сначала выберите обязательные профессиональные навыки выше.</p>`;
      const generalHtml = window.CharacterStore.ATTRIBUTES.filter(code => !["SPD", "LUCK"].includes(code)).map(code => {
        const skills = general.filter(skill => skill.attribute === code);
        return skills.length ? `<details class="creation-skill-group" data-creation-skill-group="${code}"><summary>${escapeHtml(attributeLabels[code])} · ${shortAttribute(code)} <span>${skills.length} навыков</span></summary><div>${skills.map(skill => creationSkillRow(skill, "general")).join("")}</div></details>` : "";
      }).join("");
      body = `${professionChoiceHtml}<div class="creation-skill-section"><div class="creation-budget-readout"><span>Профессиональные навыки · рейтинг не ниже 1, максимум 6 на создании</span><strong>${profSpent} / 44</strong></div><div class="creation-profession-skill-list">${professionalHtml}</div></div>
        <div class="creation-skill-section"><div class="creation-budget-readout"><span>Общие навыки · бюджет Инт + Реа</span><strong>${generalSpent} / ${generalBudget}</strong></div><p class="creation-rule-note">Остаток общего бюджета можно не тратить. Сложные навыки с пометкой ×2 стоят 2 очка за ранг.</p>${generalHtml}</div>`;
    }

    $("#character-create-content").innerHTML = `${header}<div class="creation-step-content">${body}</div>`;
    for (const group of $("#character-create-content").querySelectorAll("details[data-creation-skill-group]")) {
      group.open = openSkillGroups.has(group.dataset.creationSkillGroup);
    }
    const actions = [];
    actions.push(`<button type="button" class="button secondary" data-creation-action="cancel">Отмена</button>`);
    if (stepIndex > 0) actions.push(`<button type="button" class="button secondary" data-creation-action="back">← Назад</button>`);
    actions.push(stepIndex === creationSteps.length - 1
      ? `<button type="button" class="button primary" data-creation-action="finish">Создать персонажа</button>`
      : `<button type="button" class="button primary" data-creation-action="next">Далее →</button>`);
    $("#character-create-actions").innerHTML = actions.join("");
  }

  function creationSkillRow(skill, kind) {
    const cost = startingSkillCost(skill);
    const minimum = kind === "profession" ? 1 : 0;
    return `<div class="creation-skill-row" data-creation-skill-row="${kind}.${escapeHtml(skill.key)}">
      <div><strong>${escapeHtml(skill.name)}</strong><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}${skill.doubleCost ? " · стоимость ×2" : ""}${skill.defining ? " · определяющий" : ""}</small></div>
      <button type="button" class="stepper-button" data-skill-step="-1" data-skill-kind="${kind}" data-skill-key="${escapeHtml(skill.key)}"${skill.rank <= minimum ? " disabled" : ""}>−</button>
      <input data-skill-rank="${kind}.${escapeHtml(skill.key)}" type="number" min="${minimum}" max="6" step="1" value="${skill.rank}" aria-label="Рейтинг: ${escapeHtml(skill.name)}">
      <button type="button" class="stepper-button" data-skill-step="1" data-skill-kind="${kind}" data-skill-key="${escapeHtml(skill.key)}"${skill.rank >= 6 ? " disabled" : ""}>＋</button>
      <span class="creation-skill-cost">${cost} оч. / ранг</span>
    </div>`;
  }

  function formatCharacterDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "дата не указана" : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderCharacterLibrary() {
    const list = $("#character-list");
    const query = normalize($("#character-search").value.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    const characters = persistenceReady ? characterStore.characters : [];
    const visible = characters.map((character, index) => ({ character, index })).filter(({ character }) => {
      const searchable = normalize([
        character.personal.name, character.personal.player, character.personal.race,
        character.personal.profession, character.personal.homeland, character.personal.location,
      ].join(" "));
      return terms.every(term => searchable.includes(term));
    });
    list.innerHTML = visible.map(({ character, index }) => {
      const name = characterName(character, index);
      const description = [character.personal.race || "Раса не указана", character.personal.profession || "Профессия не указана"].join(" · ");
      const active = character.characterId === characterStore.activeCharacterId;
      const deleteDisabled = characterStore.characters.length <= 1 || !persistenceReady;
      return `<article class="character-card" data-character-card-id="${escapeHtml(character.characterId)}">
        <div class="character-card-top"><span class="character-card-profession">${escapeHtml(character.personal.profession || "Персонаж")}</span>${active ? `<span class="character-card-active">Последний открыт</span>` : ""}</div>
        <h2>${escapeHtml(name)}</h2>
        <p class="character-card-description">${escapeHtml(description)}</p>
        <p class="character-card-player">${character.personal.player ? `Игрок: ${escapeHtml(character.personal.player)}` : "Игрок не указан"}</p>
        <p class="character-card-updated">Изменён ${escapeHtml(formatCharacterDate(character.updatedAt))}</p>
        <div class="character-card-actions">
          <button class="button primary" type="button" data-character-action="open" data-character-id="${escapeHtml(character.characterId)}">Открыть</button>
          <details class="character-card-menu"><summary aria-label="Действия с персонажем ${escapeHtml(name)}">•••</summary>
            <div class="character-card-menu-items">
              <button type="button" data-character-action="copy" data-character-id="${escapeHtml(character.characterId)}">Копировать</button>
              <button type="button" data-character-action="rename" data-character-id="${escapeHtml(character.characterId)}">Переименовать</button>
              <button type="button" data-character-action="export" data-character-id="${escapeHtml(character.characterId)}">Экспорт JSON</button>
              <button type="button" class="danger" data-character-action="delete" data-character-id="${escapeHtml(character.characterId)}"${deleteDisabled ? ` disabled title="В списке должен остаться хотя бы один персонаж"` : ""}>Удалить</button>
            </div>
          </details>
        </div>
      </article>`;
    }).join("");
    $("#character-empty").hidden = persistenceReady && characters.length > 0;
    $("#character-search-empty").hidden = !persistenceReady || characters.length === 0 || visible.length > 0;
    if (!persistenceReady) {
      $("#character-empty").hidden = false;
      $("#character-empty h2").textContent = "Не удалось загрузить персонажей";
      $("#character-empty p").textContent = "Загрузите проверенный JSON-файл; исходное сохранение не изменено.";
    } else {
      $("#character-empty h2").textContent = "Персонажей пока нет";
      $("#character-empty p").textContent = "Создайте персонажа или загрузите JSON-файл.";
    }
    $("#new-character").disabled = !persistenceReady;
    $("#recover-character-data").hidden = persistenceReady;
    $("#export-characters").disabled = !persistenceReady;
  }

  function showCharacterLibrary() {
    if (persistenceReady) persistStore("", true);
    characterViewMode = "library";
    $("#character-library").hidden = false;
    $("#character-editor").hidden = true;
    renderCharacterLibrary();
  }

  function showCharacterTab(tab, updateHash = true, focusTab = false) {
    const button = document.querySelector(`[data-character-tab="${tab}"]`);
    if (!button) return;
    activeCharacterTab = tab;
    document.querySelectorAll("[data-character-tab]").forEach(tabButton => {
      const selected = tabButton === button;
      tabButton.classList.toggle("active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-character-tab-panel]").forEach(panel => {
      panel.hidden = panel.dataset.characterTabPanel !== tab;
    });
    if (tab === "inventory") renderInventory();
    if (tab === "development") renderCharacterAdvancement();
    if (tab === "combat") renderCharacterCombatEquipment();
    if (tab === "abilities") renderCharacterMagic();
    if (focusTab) button.focus();
    if (updateHash && activePage === "characters") history.replaceState(null, "", `#characters/${tab}`);
  }

  function openCharacter(characterId) {
    if (!persistenceReady) return;
    const character = characterStore.characters.find(value => value.characterId === characterId);
    if (!character) return;
    persistStore("", true);
    characterStore.activeCharacterId = characterId;
    inventory = character.equipment;
    characterViewMode = "editor";
    $("#character-library").hidden = true;
    $("#character-editor").hidden = false;
    renderCharacterEditor();
    showCharacterTab("sheet");
    renderInventory();
    persistStore(`Открыт персонаж «${characterName(character)}».`);
  }

  function duplicateCharacter(characterId) {
    if (!persistenceReady) return;
    const source = characterStore.characters.find(character => character.characterId === characterId);
    if (!source) return;
    const copy = window.CharacterStore.copyCharacter(source, uniqueCharacterName(`${source.personal.name.trim() || "Персонаж"} (копия)`));
    characterStore.characters.push(copy);
    openCharacter(copy.characterId);
    persistStore(`Создана копия «${characterName(copy)}».`);
  }

  function beginRenameCharacter(characterId) {
    if (!persistenceReady) return;
    const character = characterStore.characters.find(value => value.characterId === characterId);
    if (!character) return;
    renameTargetCharacterId = characterId;
    const input = $("#rename-character-input");
    input.value = character.personal.name;
    input.setCustomValidity("");
    $("#rename-character-dialog").showModal();
    input.focus();
    input.select();
  }

  function deleteCharacter(characterId) {
    if (!persistenceReady || characterStore.characters.length <= 1) return;
    const character = characterStore.characters.find(value => value.characterId === characterId);
    if (!character) return;
    const name = characterName(character);
    if (!window.confirm(`Удалить «${name}» вместе с его листом и инвентарём?`)) return;
    characterStore.characters = characterStore.characters.filter(value => value.characterId !== characterId);
    if (characterStore.activeCharacterId === characterId) {
      characterStore.activeCharacterId = characterStore.characters[0].characterId;
      inventory = activeCharacter().equipment;
      renderCharacterEditor();
      renderInventory();
    }
    renderCharacterLibrary();
    persistStore(`Персонаж «${name}» удалён.`);
  }

  function renderSkillRows() {
    const list = $("#character-skills");
    const character = activeCharacter();
    const catalog = window.CharacterSkills;
    const profession = catalog.findCharacterProfession(character);
    const skillRow = skill => {
      const definition = catalog.SKILLS.find(entry => entry.id === skill.catalogId);
      const fixed = Boolean(definition || skill.professionSkillId);
      const removable = skill.source === "custom" || skill.source === "other";
      const currentRank = Number.isInteger(skill.rank) ? skill.rank : 0;
      const sourceLabel = skill.professionSkillId ? "Проф. навык" :
        skill.source === "profession" ? "В наборе профессии" :
        skill.source === "general" ? "Общий навык" : "Свой навык";
      const nameControl = fixed
        ? '<div class="skill-name-field"><button class="skill-settings-trigger" type="button" data-skill-setting-open="' + escapeHtml(skill.id) + '">' + escapeHtml(skill.name) + '</button><span class="skill-source-badge ' + (skill.source === "profession" ? 'is-professional' : '') + '">' + sourceLabel + '</span>' + (definition?.doubleCost ? '<small class="skill-cost-note">Сложный: цена ×2</small>' : '') + '</div>'
        : '<label class="field skill-name-field">Навык<input data-skill-field="name" maxlength="120" value="' + escapeHtml(skill.name) + '" aria-label="Название навыка"></label>';
      const attributeControl = fixed ? '' :
        '<label class="field skill-attribute-field">Характеристика<select data-skill-field="attribute" aria-label="Ведущая характеристика"><option value="">Не указана</option>' +
        window.CharacterStore.ATTRIBUTES.map(code => '<option value="' + code + '"' + (skill.attribute === code ? ' selected' : '') + '>' + escapeHtml(shortAttribute(code) + ' · ' + attributeLabels[code]) + '</option>').join("") +
        '</select></label>';
      const settingsControl = fixed ? '' : '<button class="skill-settings-icon" type="button" data-skill-setting-open="' + escapeHtml(skill.id) + '" aria-label="Настроить навык ' + escapeHtml(skill.name || "без названия") + '" title="Настроить навык">⚙</button>';
      const removeControl = removable
        ? '<button class="character-remove" type="button" data-remove-skill="' + escapeHtml(skill.id) + '" aria-label="Удалить навык ' + escapeHtml(skill.name || "без названия") + '">×</button>'
        : '';
      return '<div class="character-entry skill-entry' + (fixed ? ' catalog-skill-entry' : ' custom-skill-entry') + '" data-skill-id="' + escapeHtml(skill.id) + '">' +
        nameControl + attributeControl +
        '<span class="skill-rank-readout" aria-label="Ранг навыка ' + escapeHtml(skill.name) + '">Ранг <strong>' + currentRank + '</strong></span>' +
        '<output class="skill-total" data-skill-total="' + escapeHtml(skill.id) + '"><span>Итог</span><strong>—</strong><small data-skill-bonus></small></output>' +
        settingsControl + removeControl + '</div>';
    };
    const attributes = window.CharacterStore.ATTRIBUTES;
    const groups = attributes.map(attribute => {
      const skills = character.skills.filter(skill => skill.attribute === attribute);
      if (!skills.length) return "";
      const value = window.CharacterRules.calculateAttributes(character)[attribute]?.total;
      return '<section class="skill-attribute-group">' +
        '<div class="skill-attribute-heading">' +
        '<button class="attribute-setting-trigger" type="button" data-attribute-setting-open="' + attribute + '" aria-label="Настроить ' + escapeHtml(attributeLabels[attribute]) + '">' +
        '<span>' + escapeHtml(shortAttribute(attribute)) + '</span><strong data-attribute-total="' + attribute + '">' + valueOrDash(value) + '</strong><span class="attribute-setting-icon" aria-hidden="true">⚙</span></button>' +
        '<span class="skill-group-count">' + skills.length + '</span>' +
        '</div><div class="skill-attribute-body">' + skills.map(skillRow).join("") + '</div></section>';
    }).join("");
    const unassigned = character.skills.filter(skill => !attributes.includes(skill.attribute));
    const unassignedGroup = unassigned.length
      ? '<section class="skill-attribute-group unassigned-skill-group"><div class="skill-attribute-heading"><strong>Без характеристики</strong><span class="skill-group-count">' + unassigned.length + '</span></div><div class="skill-attribute-body">' + unassigned.map(skillRow).join("") + '</div></section>'
      : "";
    list.innerHTML = groups || unassignedGroup
      ? '<div class="skill-group-grid">' + groups + unassignedGroup + '</div>'
      : '<p class="character-empty">Добавьте профессию или собственные навыки — список будет показан здесь целиком.</p>';
    renderProfessionChoiceFields(profession, character);
    $("#character-profession-skill-note").textContent = profession
      ? 'Все общие и профессиональные навыки видны сразу; стартовые навыки выделены бирюзовой меткой.'
      : 'Нажмите на характеристику или навык, чтобы открыть его настройки. После выбора профессии появятся её стартовые навыки.';
    renderSkillTotals();
  }

  function renderProfessionChoiceFields(profession, character) {
    const container = $("#character-profession-choice-fields");
    if (!profession?.choice) {
      container.innerHTML = "";
      return;
    }
    const selected = character.professionSkillChoices?.[profession.id] || [];
    const options = profession.choice.options.map(skillId => {
      const skill = window.CharacterSkills.SKILLS.find(entry => entry.id === skillId);
      if (!skill) return "";
      const checked = selected.includes(skillId) ? " checked" : "";
      return `<label class="profession-choice-option"><input type="checkbox" data-profession-choice="${escapeHtml(skillId)}"${checked}><span>${escapeHtml(skill.name)}</span><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}</small></label>`;
    }).join("");
    container.innerHTML = `<fieldset class="profession-choice-box"><legend>${escapeHtml(profession.choice.label)}</legend><p>Выбрано ${selected.length} из ${profession.choice.requiredCount}. Отметьте любые навыки из списка.</p><div class="profession-choice-grid">${options}</div></fieldset>`;
  }

  function renderSkillTotals(derived = activeDerivedValues()) {
    const totals = new Map(derived.skills.map(skill => [skill.id, skill]));
    document.querySelectorAll("[data-skill-total]").forEach(output => {
      const skill = totals.get(output.dataset.skillTotal);
      const display = output.querySelector("strong");
      if (display) display.textContent = valueOrDash(skill?.total);
      const bonus = output.querySelector("[data-skill-bonus]");
      if (bonus) {
        const parts = [];
        if (skill?.racialBonus) parts.push(`раса ${signed(skill.racialBonus)}`);
        if (skill?.originBonus) parts.push(`родина ${signed(skill.originBonus)}`);
        if (skill?.equipmentPenalty) parts.push(`снаряжение −${skill.equipmentPenalty}`);
        if (skill?.armorPenalty) parts.push(`броня −${skill.armorPenalty}`);
        if (skill?.armorPenalty === null) parts.push("EV не учтено");
        bonus.textContent = parts.join(" · ");
      }
    });
  }

  function renderAbilityRows() {
    const list = $("#character-abilities");
    if (!activeCharacter().abilities.length) {
      list.innerHTML = `<p class="character-empty">Способности пока не добавлены.</p>`;
      return;
    }
    list.innerHTML = activeCharacter().abilities.map(ability => `<div class="character-entry ability-entry" data-ability-id="${escapeHtml(ability.id)}">
      <input data-ability-field="name" maxlength="120" value="${escapeHtml(ability.name)}" aria-label="Название способности">
      <textarea data-ability-field="description" maxlength="20000" rows="2" placeholder="Описание или заметка" aria-label="Описание способности">${escapeHtml(ability.description)}</textarea>
      <button class="character-remove" type="button" data-remove-ability="${escapeHtml(ability.id)}" aria-label="Удалить способность">×</button>
    </div>`).join("");
  }

  const bodyZoneLabels = {
    head: "Голова", torso: "Туловище", rightArm: "Правая рука", leftArm: "Левая рука",
    rightLeg: "Правая нога", leftLeg: "Левая нога", other: "Другая зона",
  };
  const magicKindLabels = {
    spell: "Заклинание", sign: "Знак", invocation: "Инвокация", hex: "Порча",
    ritual: "Ритуал", alchemy: "Алхимия", other: "Другое",
  };

  function catalogAttribute(item, code) {
    return item?.attributes?.find(attribute => attribute.code === code)?.value ?? null;
  }

  function magicCatalogRefLabel(reference) {
    if (!reference) return "";
    const kind = reference.type === "recipe" ? "Рецепт" : "Предмет";
    return `${kind} · ${reference.name || (reference.type === "recipe" ? recipes.find(recipe => recipe.id === reference.id)?.name : itemById.get(reference.id)?.name) || "Сохранённая запись"}`;
  }

  function magicCatalogInputValue(reference) {
    if (!reference) return "";
    const name = reference.name || (reference.type === "recipe" ? recipes.find(entry => entry.id === reference.id)?.name : itemById.get(reference.id)?.name) || "Сохранённая запись";
    const duplicateCount = [...recipes, ...items].filter(entry => normalize(entry.name) === normalize(name)).length;
    return `${magicCatalogRefLabel(reference)}${duplicateCount > 1 ? ` [${reference.id}]` : ""}`;
  }

  function findMagicCatalogRef(value) {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return null;
    const prefixed = /^(рецепт|предмет)\s*·\s*/i.exec(String(value).trim());
    let name = prefixed ? String(value).trim().slice(prefixed[0].length) : String(value).trim();
    const idSuffix = /\s+\[([^\]]+)\]$/.exec(name);
    if (idSuffix) name = name.slice(0, idSuffix.index).trim();
    const type = prefixed?.[1].toLocaleLowerCase("ru-RU") === "рецепт" ? "recipe"
      : prefixed ? "item" : null;
    const matches = [
      ...(type === null || type === "recipe" ? recipes.filter(entry => normalize(entry.name) === normalize(name) && (!idSuffix || entry.id === idSuffix[1])).map(entry => ({ type: "recipe", id: entry.id, name: entry.name })) : []),
      ...(type === null || type === "item" ? items.filter(entry => normalize(entry.name) === normalize(name) && (!idSuffix || entry.id === idSuffix[1])).map(entry => ({ type: "item", id: entry.id, name: entry.name })) : []),
    ];
    return matches.length === 1 ? matches[0] : null;
  }

  function magicCatalogOptions() {
    const candidates = [
      ...recipes.map(entry => ({ type: "recipe", id: entry.id, name: entry.name })),
      ...items.map(entry => ({ type: "item", id: entry.id, name: entry.name })),
    ];
    const counts = new Map();
    candidates.forEach(entry => counts.set(normalize(entry.name), (counts.get(normalize(entry.name)) || 0) + 1));
    return candidates.map(entry => {
      const prefix = entry.type === "recipe" ? "Рецепт" : "Предмет";
      const value = counts.get(normalize(entry.name)) > 1 ? `${prefix} · ${entry.name} [${entry.id}]` : entry.name;
      return `<option value="${escapeHtml(value)}" label="${prefix}"></option>`;
    }).join("");
  }

  function renderMagicEntries() {
    const list = $("#character-magic-entries");
    const magic = activeCharacter().magic;
    $("#character-magic-catalog-options").innerHTML = magicCatalogOptions();
    if (!magic.entries.length) {
      list.innerHTML = `<p class="character-empty">Известные магические способности и алхимические формулы пока не добавлены.</p>`;
      return;
    }
    list.innerHTML = magic.entries.map(entry => {
      const linked = entry.catalogRef
        ? `<button type="button" class="catalog-inline-link" data-open-catalog-reference="${escapeHtml(entry.catalogRef.type)}" data-catalog-reference-id="${escapeHtml(entry.catalogRef.id)}">Открыть связанный каталог: ${escapeHtml(magicCatalogRefLabel(entry.catalogRef))}</button>`
        : "";
      return `<article class="magic-entry" data-magic-entry-id="${escapeHtml(entry.id)}">
        <div class="magic-entry-heading"><label class="field">Тип<select data-magic-field="kind">${Object.entries(magicKindLabels).map(([value, label]) => `<option value="${value}"${entry.kind === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="field grow">Название<input data-magic-field="name" maxlength="200" value="${escapeHtml(entry.name)}" placeholder="Название способности"></label><button class="character-remove" type="button" data-remove-magic-entry="${escapeHtml(entry.id)}" aria-label="Удалить способность">×</button></div>
        <label class="field">Связать с каталогом <input data-magic-catalog-search list="character-magic-catalog-options" value="${escapeHtml(magicCatalogInputValue(entry.catalogRef))}" placeholder="Начните вводить название рецепта или предмета" title="Если одинаковые названия есть у рецепта или предмета, выберите запись с нужной пометкой"></label>
        ${linked}
        <div class="magic-entry-fields">
          <label class="field">Стоимость<input data-magic-field="cost" maxlength="500" value="${escapeHtml(entry.cost)}" placeholder="По правилам"></label>
          <label class="field">Дальность<input data-magic-field="range" maxlength="500" value="${escapeHtml(entry.range)}"></label>
          <label class="field">Длительность<input data-magic-field="duration" maxlength="500" value="${escapeHtml(entry.duration)}"></label>
          <label class="field">Время<input data-magic-field="time" maxlength="500" value="${escapeHtml(entry.time)}"></label>
          <label class="field">СЛ<input data-magic-field="difficulty" maxlength="200" value="${escapeHtml(entry.difficulty)}"></label>
          <label class="field">Компоненты<input data-magic-field="components" maxlength="2000" value="${escapeHtml(entry.components)}"></label>
          <label class="field magic-entry-wide">Эффект<textarea data-magic-field="effect" maxlength="20000" rows="3">${escapeHtml(entry.effect)}</textarea></label>
          <label class="field magic-entry-wide">Заметки<textarea data-magic-field="notes" maxlength="4000" rows="2">${escapeHtml(entry.notes)}</textarea></label>
        </div>
      </article>`;
    }).join("");
  }

  function renderCharacterMagic() {
    const character = activeCharacter();
    const profession = window.CharacterSkills.findCharacterProfession(character);
    const professionSupportsMagic = ["witcher", "priest", "mage"].includes(profession?.id);
    const visible = professionSupportsMagic || character.magic.entries.length > 0;
    $("#character-magic-panel").hidden = !visible;
    $("#character-magic-note").textContent = professionSupportsMagic
      ? "Поля зависят от выбранной профессии. Значения и эффекты вводятся по книге; неподтверждённые расчёты не выполняются."
      : "Эта профессия не получает магические поля автоматически; сохранённые записи оставлены доступными для ручного ведения.";
    renderMagicEntries();
  }

  function renderCharacterWounds() {
    const wounds = activeCharacter().state.wounds;
    const list = $("#character-wounds");
    if (!wounds.length) {
      list.innerHTML = `<p class="character-empty">Ранения не записаны.</p>`;
      return;
    }
    const statuses = { active: "Активно", treated: "Лечится", healed: "Залечено" };
    list.innerHTML = wounds.map(wound => `<article class="wound-entry" data-wound-id="${escapeHtml(wound.id)}">
      <div class="wound-entry-fields">
        <label class="field">Зона<select data-wound-field="location">${Object.entries(bodyZoneLabels).map(([value, label]) => `<option value="${value}"${wound.location === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field grow">Название<input data-wound-field="title" maxlength="200" value="${escapeHtml(wound.title)}" placeholder="Например, перелом"></label>
        <label class="field">Статус<select data-wound-field="status">${Object.entries(statuses).map(([value, label]) => `<option value="${value}"${wound.status === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <button class="character-remove" type="button" data-remove-wound="${escapeHtml(wound.id)}" aria-label="Удалить ранение">×</button>
        <label class="field wound-entry-description">Последствия и заметки<textarea data-wound-field="description" maxlength="4000" rows="2">${escapeHtml(wound.description)}</textarea></label>
      </div>
    </article>`).join("");
  }

  function combatInventoryItem(entry) {
    return entry.itemId ? itemById.get(entry.itemId) : null;
  }

  function isShieldEquipment(entry) {
    const item = combatInventoryItem(entry);
    return normalize(catalogAttribute(item, "armor_region") || "").includes("щит") || entry.customCategory === "shield";
  }

  function combatItemAllowed(entry, kind) {
    const item = combatInventoryItem(entry);
    if (kind === "weapon") return item?.type === "weapon" || entry.customCategory === "weapon";
    if (kind === "armor") return (item?.type === "armor" && !isShieldEquipment(entry)) || entry.customCategory === "armor";
    return (item?.type === "armor" && isShieldEquipment(entry)) || entry.customCategory === "shield";
  }

  function armorCoversZone(entry, zone) {
    if (entry.customCategory === "armor") return true;
    const region = normalize(catalogAttribute(combatInventoryItem(entry), "armor_region") || "");
    const matches = {
      head: region.includes("голов"),
      torso: region.includes("туловищ"),
      rightArm: region.includes("рук"),
      leftArm: region.includes("рук"),
      rightLeg: region.includes("ног"),
      leftLeg: region.includes("ног"),
    };
    return Boolean(matches[zone]);
  }

  function combatItemOptions(kind, selectedId, zone = "") {
    const combat = activeCharacter().equipment.combat;
    const assignedWeaponIds = kind === "weapon"
      ? new Set(combat.weapons.filter(weapon => weapon.inventoryEntryId && weapon.inventoryEntryId !== selectedId).map(weapon => weapon.inventoryEntryId))
      : new Set();
    const options = activeCharacter().equipment.items.filter(entry => combatItemAllowed(entry, kind)
      && (kind !== "armor" || armorCoversZone(entry, zone))
      && (!assignedWeaponIds.has(entry.id) || entry.id === selectedId));
    return `<option value="">Не выбрано</option>${options.map(entry => {
      const catalogItem = combatInventoryItem(entry);
      const category = catalogItem?.typeLabel || ({ weapon: "Оружие", armor: "Броня", shield: "Щит" }[entry.customCategory] || "Свой предмет");
      const quantity = entry.quantity > 1 ? ` ×${numberText(entry.quantity)}` : "";
      return `<option value="${escapeHtml(entry.id)}"${entry.id === selectedId ? " selected" : ""}>${escapeHtml(entry.name)}${quantity} · ${escapeHtml(category)}</option>`;
    }).join("")}`;
  }

  function combatCatalogLink(entry) {
    if (!entry?.itemId || !itemById.has(entry.itemId)) return "";
    return `<button type="button" class="catalog-inline-link" data-open-catalog-item="${escapeHtml(entry.itemId)}">Карточка каталога</button>`;
  }

  function renderCharacterCombatEquipment() {
    const character = activeCharacter();
    const equipment = character.equipment;
    const combat = equipment.combat;
    const armorZones = Object.entries(bodyZoneLabels).filter(([key]) => key !== "other");
    $("#character-armor-zones").innerHTML = armorZones.map(([zone, label]) => {
      const slot = combat.armorByZone[zone];
      const owned = equipment.items.find(entry => entry.id === slot.inventoryEntryId);
      const catalogItem = combatInventoryItem(owned || {});
      const baseSP = catalogAttribute(catalogItem, "armor_rating");
      const catalogEv = catalogAttribute(catalogItem, "encumbrance");
      const ev = owned?.armorEv ?? catalogEv;
      return `<div class="combat-zone-row" data-armor-zone="${zone}">
        <strong>${label}</strong>
        <label class="field">Броня<select data-armor-zone-item>${combatItemOptions("armor", slot.inventoryEntryId, zone)}</select></label>
        <label class="field">Текущая SP<input data-armor-zone-field="currentSP" type="number" min="0" step="1" value="${slot.currentSP ?? ""}" placeholder="${baseSP ?? "—"}"></label>
        <label class="field">Повреждение<input data-armor-zone-field="damage" maxlength="2000" value="${escapeHtml(slot.damage)}" placeholder="Не указано"></label>
        <span class="combat-zone-meta">${baseSP === null ? "SP из каталога: —" : `Базовая SP: ${escapeHtml(baseSP)}`} · EV: ${ev === null ? "—" : escapeHtml(ev)}</span>${combatCatalogLink(owned)}
      </div>`;
    }).join("");
    const armorStats = armorLoadoutStats(character);
    $("#character-armor-ev").textContent = `Суммарная скованность EV: ${armorStats.unknownCount ? `${numberText(armorStats.knownEv)} + ?` : numberText(armorStats.ev)}. Штраф к Реа/Лвк и магическим навыкам применяется автоматически.`;
    $("#character-combat-weapons").innerHTML = combat.weapons.length ? combat.weapons.map(weapon => {
      const owned = equipment.items.find(entry => entry.id === weapon.inventoryEntryId);
      const item = combatInventoryItem(owned || {});
      const reliability = catalogAttribute(item, "reliability") ?? weapon.reliability ?? "—";
      const statFields = [
        ["Точность", "accuracy"], ["Урон", "damage"], ["Тип урона", "damage_type"],
        ["Руки", "hands"], ["Дальность", "range"], ["Усиления", "enhancement_slots"],
        ["Скрытность", "concealment"],
      ].map(([label, code]) => [label, catalogAttribute(item, code)]).filter(([, value]) => value !== null && value !== undefined && value !== "");
      return `<article class="combat-weapon-row" data-combat-weapon-id="${escapeHtml(weapon.id)}">
        <label class="field">Слот<select data-combat-weapon-field="slot"><option value="primary"${weapon.slot === "primary" ? " selected" : ""}>Основное</option><option value="backup"${weapon.slot === "backup" ? " selected" : ""}>Запасное</option></select></label>
        <label class="field grow">Предмет<select data-combat-weapon-field="inventoryEntryId">${combatItemOptions("weapon", weapon.inventoryEntryId)}</select></label>
        <label class="field">Надёжность<input data-combat-weapon-field="reliability" maxlength="200" value="${escapeHtml(weapon.reliability || reliability)}" placeholder="${escapeHtml(reliability)}"></label>
        <span class="combat-zone-meta combat-entry-wide">${statFields.map(([label, value]) => `${escapeHtml(label)}: ${escapeHtml(value)}`).join(" · ") || "Характеристики доступны в карточке предмета."}${owned?.conditionNotes ? ` · Состояние: ${escapeHtml(owned.conditionNotes)}` : ""}</span>
        ${combatCatalogLink(owned)}<button class="character-remove" type="button" data-remove-combat-weapon="${escapeHtml(weapon.id)}" aria-label="Удалить слот оружия">×</button>
      </article>`;
    }).join("") : `<p class="character-empty">Оружие не назначено.</p>`;
    $("#add-character-combat-weapon").disabled = combat.weapons.length >= 2;
    if (combat.shield === null) {
      $("#add-character-shield").hidden = false;
      $("#character-combat-shield").innerHTML = `<p class="character-empty">Щит не назначен.</p>`;
    } else {
      $("#add-character-shield").hidden = true;
      const shield = combat.shield;
      const owned = equipment.items.find(entry => entry.id === shield.inventoryEntryId);
      const shieldReliability = catalogAttribute(combatInventoryItem(owned || {}), "reliability");
      $("#character-combat-shield").innerHTML = `<article class="combat-shield-row">
        <label class="field grow">Щит<select data-shield-field="inventoryEntryId">${combatItemOptions("shield", shield.inventoryEntryId)}</select></label>
        <label class="field">Текущая SP<input data-shield-field="currentSP" type="number" min="0" step="1" value="${shield.currentSP ?? ""}" placeholder="по каталогу"></label>
        <label class="field">Повреждение<input data-shield-field="damage" maxlength="2000" value="${escapeHtml(shield.damage)}"></label>
        <span class="combat-zone-meta combat-entry-wide">${shieldReliability === null ? "" : `Надёжность по каталогу: ${escapeHtml(shieldReliability)}`}${owned?.conditionNotes ? ` · Состояние: ${escapeHtml(owned.conditionNotes)}` : ""}</span>
        ${combatCatalogLink(owned)}<button class="character-remove" type="button" data-remove-character-shield aria-label="Убрать щит">×</button>
      </article>`;
    }
  }

  function renderLifePathOutcomes() {
    const list = $("#character-life-path-outcomes");
    if (!activeCharacter().lifePath.outcomes.length) {
      list.innerHTML = `<p class="character-empty">Последствия пока не добавлены.</p>`;
      return;
    }
    const types = ["Событие", "Союзник", "Враг", "Отношения", "Долг", "Прочее"];
    list.innerHTML = activeCharacter().lifePath.outcomes.map(outcome => {
      const outcomeTypes = types.includes(outcome.type) ? types : [outcome.type, ...types];
      return `<div class="character-entry life-path-outcome" data-life-path-outcome-id="${escapeHtml(outcome.id)}">
      <select data-life-path-outcome-field="type" aria-label="Тип последствия">${outcomeTypes.map(type => `<option value="${escapeHtml(type)}"${outcome.type === type ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select>
      <textarea data-life-path-outcome-field="description" maxlength="20000" rows="2" placeholder="Описание последствия" aria-label="Описание последствия">${escapeHtml(outcome.description)}</textarea>
      <input data-life-path-outcome-field="source" maxlength="2000" value="${escapeHtml(outcome.source)}" placeholder="Источник или заметка" aria-label="Источник или заметка">
      <button class="character-remove" type="button" data-remove-life-path-outcome="${escapeHtml(outcome.id)}" aria-label="Удалить последствие">×</button>
    </div>`;
    }).join("");
  }

  function renderRaceTraits(character = activeCharacter()) {
    const container = $("#character-race-traits");
    const traits = window.CharacterCreation.RACE_TRAITS[character.personal.race];
    if (!traits) {
      container.innerHTML = `<p class="character-empty">Выберите расу, чтобы увидеть её особенности и автоматически учитываемые бонусы.</p>`;
      return;
    }
    container.innerHTML = `<div class="race-trait-heading"><strong>${escapeHtml(character.personal.race)}</strong><span>Игровые эффекты</span></div>
      <ul>${traits.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>`;
  }

  function renderGeneratedLifePath(character = activeCharacter()) {
    const container = $("#character-life-path-generated");
    const generated = character.lifePath.generated;
    if (!generated) {
      container.innerHTML = `<p class="character-empty">Сгенерированные события появятся здесь. Для ручного варианта заполните поля выше.</p>`;
      return;
    }
    const details = generated.kind === "witcher"
      ? [
          ["Школа", generated.school], ["Возраст при поступлении", generated.ageAtSchool], ["Начало странствий", generated.travelAge ? `${generated.travelAge} лет` : ""], ["Событие обучения", generated.training],
          ["Испытание травами", generated.trial], ["Главное событие", generated.importantEvent], ["Сейчас", generated.presentStatus],
        ]
      : [["Родина", generated.homeland?.region], ["Судьба семьи", generated.familyFate], ["Положение семьи", generated.familyStation], ["Родители", generated.parents]];
    const summary = details.filter(([, value]) => value).map(([label, value]) => `<div class="generated-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    const events = (generated.decadeEvents || []).map(event => `<article class="generated-event">
      <div><strong>${escapeHtml(event.title || event.type || "Событие")}</strong><span>${event.decadeStart === undefined ? "" : `${escapeHtml(event.decadeStart)}–${escapeHtml(event.decadeEnd)} лет`}</span></div>
      <p>${escapeHtml(event.description || "")}</p>
    </article>`).join("");
    const relatives = (generated.relatives || []).map(relative => `<div class="generated-relative" data-relative-id="${escapeHtml(relative.id)}">
      <div class="generated-relative-role"><strong>${escapeHtml(relative.role)}</strong><small>${escapeHtml(relative.status || "")}</small></div>
      <label class="field">Имя<input data-generated-relative-name="${escapeHtml(relative.id)}" maxlength="200" value="${escapeHtml(relative.name || "")}" placeholder="Введите имя"></label>
      <p>${escapeHtml(relative.details || "")}</p>
    </div>`).join("");
    container.innerHTML = `<div class="generated-path-heading"><strong>Случайная предыстория</strong><span>Броски сохранены в JSON</span></div>
      <div class="generated-facts">${summary}</div>
      ${events ? `<div class="generated-event-list"><h3>События по десятилетиям</h3>${events}</div>` : ""}
      ${relatives ? `<div class="generated-relatives"><h3>Родственники и знакомые</h3><p>Добавьте имена персонам позже — генератор оставил их незаполненными.</p>${relatives}</div>` : ""}`;
  }

  function renderProfessionTree(character = activeCharacter()) {
    const container = $("#character-profession-tree");
    const profession = window.CharacterSkills.findCharacterProfession(character);
    const tree = profession && window.CharacterProfessionTrees.TREES[profession.id];
    if (!tree) {
      container.innerHTML = '<p class="character-empty">Выберите профессию, чтобы открыть её дерево способностей.</p>';
      return;
    }
    window.CharacterProfessionTrees.ensureProgress(character, profession.id);
    const branches = tree.branches.map(branch => {
      const nodes = branch.nodes.map((node, index) => {
        const state = window.CharacterProfessionTrees.getNodeState(character, profession.id, branch.id, index);
        const status = state.unlocked ? '<span class="tree-node-state is-available">Открыто</span>' : '<span class="tree-node-state is-locked">🔒 Закрыто</span>';
        const unlockText = state.unlocked
          ? (index < 2 && state.rank < 5 ? 'Следующее умение откроется на ранге 5.' : 'Можно улучшать во вкладке «Развитие».')
          : 'Откроется, когда предыдущее умение достигнет ранга 5.';
        return '<article class="profession-tree-node ' + (state.unlocked ? 'is-unlocked' : 'is-locked') + '"' + (state.unlocked ? '' : ' aria-disabled="true"') + '>' +
          '<button class="profession-tree-node-open" type="button" data-tree-open-profession="' + profession.id + '" data-tree-open-branch="' + branch.id + '" data-tree-open-index="' + index + '" aria-label="Открыть описание умения ' + escapeHtml(node.name) + '">' +
          '<span class="profession-tree-node-tier">' + (index + 1) + '</span><span class="profession-tree-node-copy"><strong>' + escapeHtml(node.name) + '</strong><small>' + (node.attribute ? escapeHtml(shortAttribute(node.attribute)) : 'Особая способность') + '</small></span><span class="profession-tree-node-kind">Дерево</span></button>' +
          '<div class="profession-tree-node-meta"><span class="profession-tree-rank-readout">Ранг ' + state.rank + '</span>' + status + '</div>' +
          '<small class="profession-tree-unlock">' + unlockText + '</small></article>';
      }).join("");
      return '<details class="profession-tree-branch"><summary><span>' + escapeHtml(branch.name) + '</span><span>3 умения</span></summary><div class="profession-tree-node-list">' + nodes + '</div></details>';
    }).join("");
    container.innerHTML = '<div class="profession-tree-heading"><div><h3>Дерево профессии · ' + escapeHtml(profession.name) + '</h3><p>Узлы дерева отмечены отдельным цветом. Закрытые умения откроются после ранга 5 предыдущего умения в ветви.</p></div><span>Ранги 0–10</span></div><div class="profession-tree-branches">' + branches + '</div>';
  }

  function renderCharacterAdvancement() {
    if (!$("#character-advancement-list")) return;
    const character = activeCharacter();
    const advancement = window.CharacterAdvancement;
    const points = advancement.draftSummary(character, window.CharacterProfessionTrees);
    $("#character-improvement-summary").innerHTML =
      '<div class="improvement-point-card"><span>Начислено</span><strong>' + points.earnedPoints + '</strong></div>' +
      '<div class="improvement-point-card"><span>Применено</span><strong>' + points.spentPoints + '</strong></div>' +
      '<div class="improvement-point-card is-reserved"><span>В черновике</span><strong>' + points.reservedPoints + '</strong></div>' +
      '<div class="improvement-point-card is-available"><span>Свободно</span><strong>' + points.availablePoints + '</strong></div>';
    $("#character-advancement-draft-note").textContent = points.hasDraft
      ? 'Черновик: ' + points.reservedPoints + ' О.У. · нажмите «Применить прокачку», чтобы закрепить изменения.'
      : 'Нет неподтверждённых улучшений.';
    $("#apply-character-improvements").disabled = !points.hasDraft;
    $("#cancel-character-improvements").disabled = !points.hasDraft;

    const attributeValues = window.CharacterRules.calculateAttributes(character);
    const attributeRows = window.CharacterStore.ATTRIBUTES.map(code => {
      const base = character.attributes[code];
      const pending = advancement.draftCount(character, "attributes", code);
      const projected = base === null || base === undefined ? null : Number(base) + pending;
      const cost = advancement.attributeUpgradeCost(projected);
      const canBuy = cost !== null && points.availablePoints >= cost;
      const description = base === null || base === undefined ? 'Сначала задайте исходное значение' : cost === null ? 'Достигнут предел 10' : 'Следующий ранг стоит ' + cost + ' О.У.';
      return '<div class="advancement-row advancement-attribute-row"><div class="advancement-row-title"><strong>' + escapeHtml(attributeLabels[code]) + '</strong><span>' + escapeHtml(shortAttribute(code)) + ' · итог ' + valueOrDash(attributeValues[code]?.total) + '</span></div>' +
        '<span class="advancement-current">' + valueOrDash(base) + (pending ? ' → ' + projected + ' <small>(+' + pending + ')</small>' : '') + '</span>' +
        '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-attribute="' + code + '"' + (pending ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение характеристики ' + escapeHtml(attributeLabels[code]) + '">−</button>' +
        '<button class="improvement-adjust-button is-add" type="button" data-stage-attribute="' + code + '"' + (canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение характеристики ' + escapeHtml(attributeLabels[code]) + ', стоимость ' + (cost ?? 'недоступно') + ' О.У.">' + (cost === null ? 'Максимум' : '+1 · ' + cost + ' О.У.') + '</button></div>' +
        '<small class="advancement-cost-note">' + description + '</small></div>';
    }).join("");

    const attributeOrder = window.CharacterStore.ATTRIBUTES;
    const skillRows = character.skills.map(skill => {
      const definition = window.CharacterSkills.SKILLS.find(entry => entry.id === skill.catalogId);
      const baseRank = Number.isInteger(skill.rank) ? skill.rank : 0;
      const pending = advancement.draftCount(character, "skills", skill.id);
      const rank = baseRank + pending;
      const cost = advancement.skillUpgradeCost(rank, Boolean(definition?.doubleCost));
      const canBuy = cost !== null && points.availablePoints >= cost;
      const type = skill.professionSkillId ? 'Проф. умение' : skill.source === 'profession' ? 'Стартовый набор' : skill.source === 'general' ? 'Общий навык' : 'Свой навык';
      return '<div class="advancement-row advancement-skill-row"><div class="advancement-row-title"><strong>' + escapeHtml(skill.name || 'Без названия') + '</strong><span>' + type + (definition?.doubleCost ? ' · сложный' : '') + '</span></div>' +
        '<span class="advancement-current">Ранг ' + baseRank + (pending ? ' → <strong>' + rank + '</strong> <small>(+' + pending + ')</small>' : '') + '</span>' +
        '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-skill="' + escapeHtml(skill.id) + '"' + (pending ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение навыка ' + escapeHtml(skill.name || 'без названия') + '">−</button>' +
        '<button class="improvement-adjust-button is-add" type="button" data-stage-skill="' + escapeHtml(skill.id) + '"' + (canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение навыка ' + escapeHtml(skill.name || 'без названия') + ', стоимость ' + (cost ?? 'недоступно') + ' О.У.">' + (cost === null ? 'Максимум' : '+1 · ' + cost + ' О.У.') + '</button></div></div>';
    });
    const skillGroups = attributeOrder.map(attribute => {
      const rows = character.skills.filter(skill => skill.attribute === attribute).map(skill => skillRows[character.skills.indexOf(skill)]).join("");
      return rows ? '<section class="advancement-skill-group"><h3>' + escapeHtml(shortAttribute(attribute)) + ' · ' + escapeHtml(attributeLabels[attribute]) + '</h3>' + rows + '</section>' : '';
    }).join("");
    const unassignedRows = character.skills.filter(skill => !attributeOrder.includes(skill.attribute)).map(skill => skillRows[character.skills.indexOf(skill)]).join("");
    const profession = window.CharacterSkills.findCharacterProfession(character);
    const tree = profession && window.CharacterProfessionTrees.TREES[profession.id];
    const treeGroups = tree ? tree.branches.map(branch => {
      const rows = branch.nodes.map((node, index) => {
        const state = advancement.professionAbilityState(character, profession.id, branch.id, index, window.CharacterProfessionTrees);
        const cost = advancement.skillUpgradeCost(state.rank, false);
        const canBuy = state.unlocked && cost !== null && points.availablePoints >= cost;
        const status = state.unlocked ? 'Открыто' : 'Закрыто до ранга 5 предыдущего узла';
        return '<div class="advancement-row advancement-tree-row' + (state.unlocked ? '' : ' is-locked') + '"><div class="advancement-row-title"><strong>' + escapeHtml(node.name) + '</strong><span>Умение дерева · ' + status + '</span></div>' +
          '<span class="advancement-current">Ранг ' + state.baseRank + (state.pending ? ' → <strong>' + state.rank + '</strong> <small>(+' + state.pending + ')</small>' : '') + '</span>' +
          '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-tree-profession="' + profession.id + '" data-undo-tree-branch="' + branch.id + '" data-undo-tree-index="' + index + '"' + (state.pending ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение умения ' + escapeHtml(node.name) + '">−</button>' +
          '<button class="improvement-adjust-button is-add" type="button" data-stage-tree-profession="' + profession.id + '" data-stage-tree-branch="' + branch.id + '" data-stage-tree-index="' + index + '"' + (canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение умения ' + escapeHtml(node.name) + ', стоимость ' + (cost ?? 'недоступно') + ' О.У.">' + (!state.unlocked ? 'Закрыто' : cost === null ? 'Максимум' : '+1 · ' + cost + ' О.У.') + '</button></div></div>';
      }).join("");
      return '<section class="advancement-skill-group advancement-tree-group"><h3>' + escapeHtml(branch.name) + '</h3>' + rows + '</section>';
    }).join("") : '<p class="character-empty">Выберите профессию, чтобы открыть её умения дерева.</p>';
    $("#character-advancement-list").innerHTML = '<section class="advancement-section"><h3>Характеристики</h3><div class="advancement-row-list">' + attributeRows + '</div></section>' +
      '<section class="advancement-section"><h3>Навыки</h3>' + skillGroups + (unassignedRows ? '<div class="advancement-skill-group"><h4>Без характеристики</h4>' + unassignedRows + '</div>' : '') + '</section>' +
      '<section class="advancement-section"><h3>Дерево профессии</h3><p class="character-panel-hint">Ранг 5 открывает следующий узел той же ветви. После открытия можно продолжать прокачивать любой узел до ранга 10.</p>' + treeGroups + '</section>';
  }

  function renderCharacterEditor() {
    const character = activeCharacter();
    const catalogChanged = window.CharacterSkills.initializeCharacterSkills(character);
    $("#character-editor-name").textContent = characterName(character);
    $("#inventory-character-name").textContent = character.personal.name.trim() || "Без имени";
    renderCharacterSelects(character);
    document.querySelectorAll("[data-character-path]").forEach(input => {
      const path = input.dataset.characterPath.split(".");
      input.value = path.length === 1 ? character[path[0]] ?? "" : character[path[0]]?.[path[1]] ?? "";
    });
    document.querySelectorAll("[data-character-number]").forEach(input => {
      const [section, key] = input.dataset.characterNumber.split(".");
      const value = character[section]?.[key];
      input.value = value === null || value === undefined ? "" : String(value);
    });
    document.querySelectorAll("[data-character-lines]").forEach(input => {
      const path = input.dataset.characterLines.split(".");
      input.value = path.reduce((value, part) => value?.[part], character)?.join("\n") || "";
    });
    $("#character-conditions").value = character.state.conditions.join("\n");
    renderSkillRows();
    renderRaceTraits(character);
    renderGeneratedLifePath(character);
    renderProfessionTree(character);
    renderCharacterAdvancement();
    renderAbilityRows();
    renderCharacterMagic();
    renderCharacterWounds();
    renderCharacterCombatEquipment();
    renderLifePathOutcomes();
    renderCharacterDerived();
    showCharacterTab(activeCharacterTab, false);
    if (catalogChanged && persistenceReady) persistStore("Список навыков персонажа обновлён.");
  }

  function fillCharacterSelect(select, placeholder, options, value, { keepUnknown = false } = {}) {
    const optionHtml = options.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`);
    if (keepUnknown && value && !options.some(option => option.value === value)) {
      optionHtml.push(`<option value="${escapeHtml(value)}">Сохранённое значение: ${escapeHtml(value)}</option>`);
    }
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionHtml.join("")}`;
    select.value = value && (options.some(option => option.value === value) || keepUnknown) ? value : "";
  }

  function renderCharacterSelects(character = activeCharacter()) {
    const personal = character.personal;
    fillCharacterSelect($("[data-character-select='race']"), "Выберите расу", window.CharacterSkills.RACES.map(value => ({ value, label: value })), personal.race, { keepUnknown: true });
    fillCharacterSelect($("[data-character-select='gender']"), "Не указано", window.CharacterSkills.GENDERS.map(value => ({ value, label: value })), personal.gender, { keepUnknown: true });
    const profession = window.CharacterSkills.findCharacterProfession(character);
    const professionOptions = window.CharacterSkills.PROFESSIONS.map(value => ({ value: value.id, label: value.name }));
    const currentProfessionValue = profession?.id || (personal.profession ? "legacy-profession" : "");
    if (currentProfessionValue === "legacy-profession") professionOptions.push({ value: currentProfessionValue, label: `Сохранённое значение: ${personal.profession}` });
    fillCharacterSelect($("[data-character-select='profession']"), "Выберите профессию", professionOptions, currentProfessionValue);
  }

  function updateCharacterPath(path, value) {
    const parts = path.split(".");
    if (parts.length === 1) activeCharacter()[parts[0]] = value;
    else activeCharacter()[parts[0]][parts[1]] = value;
  }

  function openAttributeSettings(code) {
    if (!window.CharacterStore.ATTRIBUTES.includes(code)) return;
    const character = activeCharacter();
    const values = window.CharacterRules.calculateAttributes(character)[code];
    $("#character-attribute-dialog").dataset.attribute = code;
    $("#character-attribute-dialog-title").textContent = attributeLabels[code] + " · " + shortAttribute(code);
    $("#character-attribute-base").value = values.base === null ? "" : String(values.base);
    $("#character-attribute-permanent").value = String(values.permanent);
    $("#character-attribute-temporary").value = String(values.temporary);
    const notes = [];
    if (values.racial) notes.push("раса " + signed(values.racial));
    if (values.background) notes.push("предыстория " + signed(values.background));
    $("#character-attribute-dialog-note").textContent = notes.length
      ? "Автоматические бонусы: " + notes.join(" · ") + "."
      : "Здесь можно скорректировать исходное значение и временные или постоянные модификаторы.";
    $("#character-attribute-dialog-total").textContent = valueOrDash(values.total);
    $("#character-attribute-dialog").showModal();
  }

  function openCharacterSkillSettings(skillId) {
    const character = activeCharacter();
    const skill = character.skills.find(entry => entry.id === skillId);
    if (!skill) return;
    const definition = window.CharacterSkills.SKILLS.find(entry => entry.id === skill.catalogId);
    const profession = window.CharacterSkills.findCharacterProfession(character);
    const source = skill.professionSkillId ? "Профессиональное умение" :
      skill.source === "profession" ? "Навык стартового набора" :
      skill.source === "general" ? "Общий навык" : "Собственный навык";
    const meta = [source, skill.attribute ? shortAttribute(skill.attribute) + " · " + attributeLabels[skill.attribute] : "Характеристика не указана"];
    if (profession && skill.professionSkillId) meta.push(profession.name);
    if (definition?.doubleCost) meta.push("Сложный навык · стоимость ×2");
    $("#character-skill-dialog").dataset.skillId = skill.id;
    $("#character-skill-dialog-title").textContent = skill.name || "Собственный навык";
    $("#character-skill-dialog-meta").textContent = meta.join(" · ");
    $("#character-skill-permanent").value = String(skill.permanentModifier ?? 0);
    $("#character-skill-temporary").value = String(skill.temporaryModifier ?? 0);
    $("#character-skill-dialog-rank").textContent = String(Number(skill.rank ?? 0));
    const derived = activeDerivedValues().skills.find(entry => entry.id === skill.id);
    $("#character-skill-dialog-total").textContent = valueOrDash(derived?.total);
    $("#character-skill-dialog").showModal();
  }

  function updateCharacterSkillSetting(event) {
    const control = event.target.closest("[data-skill-setting]");
    if (!control) return false;
    const skillId = $("#character-skill-dialog").dataset.skillId;
    const skill = activeCharacter().skills.find(entry => entry.id === skillId);
    if (!skill) return true;
    const value = control.value === "" ? 0 : Number(control.value);
    if (!Number.isInteger(value) || value < -1000 || value > 1000) {
      control.value = String(skill[control.dataset.skillSetting] ?? 0);
      return true;
    }
    skill[control.dataset.skillSetting] = value;
    renderCharacterDerived();
    const derived = activeDerivedValues().skills.find(entry => entry.id === skill.id);
    $("#character-skill-dialog-total").textContent = valueOrDash(derived?.total);
    persistStore("Настройки навыка обновлены.", event.type === "change");
    return true;
  }

  function openProfessionSkillDetails(professionId, branchId, index) {
    const tree = window.CharacterProfessionTrees.TREES[professionId];
    const branch = tree?.branches.find(item => item.id === branchId);
    const node = branch?.nodes[index];
    if (!node) return;
    const state = window.CharacterProfessionTrees.getNodeState(activeCharacter(), professionId, branchId, index);
    const profession = window.CharacterSkills.findProfession(professionId);
    const dialog = $("#profession-skill-dialog");
    dialog.dataset.profession = professionId;
    dialog.dataset.branch = branchId;
    dialog.dataset.index = String(index);
    $("#profession-skill-dialog-title").textContent = node.name;
    $("#profession-skill-dialog-meta").textContent = (profession?.name || "") + " · " + branch.name + " · " + (node.attribute ? shortAttribute(node.attribute) : "Особая способность") + " · ранг " + state.rank;
    $("#profession-skill-dialog-description").textContent = node.description || "Описание для этого умения пока не добавлено.";
    $("#profession-skill-dialog-status").textContent = state.unlocked
      ? "Умение открыто. Ранг повышается за очки улучшения во вкладке «Развитие»."
      : "Умение заблокировано. Повышайте предыдущее умение в этой ветви до ранга 5.";
    $("#open-profession-skill-development").disabled = !state.unlocked;
    dialog.showModal();
  }

  function updateAttributeSetting(event) {
    const control = event.target.closest("[data-attribute-setting]");
    if (!control) return false;
    const code = $("#character-attribute-dialog").dataset.attribute;
    const part = control.dataset.attributeSetting;
    if (!window.CharacterStore.ATTRIBUTES.includes(code)) return true;
    const value = control.value === "" ? null : Number(control.value);
    if (value !== null && (!Number.isInteger(value) || value < (part === "base" ? 0 : -1000) || value > (part === "base" ? 1000 : 1000))) {
      control.value = part === "base" ? activeCharacter().attributes[code] ?? "" : activeCharacter().attributeModifiers[code][part];
      return true;
    }
    if (part === "base" && window.CharacterAdvancement.draftCount(activeCharacter(), "attributes", code) > 0) {
      setSaveMessage("Сначала примените или отмените черновые улучшения этой характеристики.", true);
      control.value = activeCharacter().attributes[code] ?? "";
      return true;
    }
    if (part === "base") activeCharacter().attributes[code] = value;
    else activeCharacter().attributeModifiers[code][part] = value ?? 0;
    const result = window.CharacterRules.calculateAttributes(activeCharacter())[code];
    $("#character-attribute-dialog-total").textContent = valueOrDash(result.total);
    renderCharacterDerived();
    persistStore("Характеристика обновлена.", event.type === "change");
    return true;
  }

  function beginCharacterCreation() {
    if (!persistenceReady) return;
    characterCreationDraft = newCharacterCreationDraft();
    setCreationError("");
    renderCreationWizard();
    $("#character-create-dialog").showModal();
  }

  function closeCharacterCreation() {
    $("#character-create-dialog").close();
    characterCreationDraft = null;
    setCreationError("");
  }

  function changeCreationSkill(kind, key, nextRank) {
    const draft = characterCreationDraft;
    if (!draft) return;
    const skills = kind === "profession" ? professionSkillDescriptors(draft) : startingGeneralSkills(draft);
    const skill = skills.find(entry => entry.key === key);
    if (!skill) return;
    const rank = Number(nextRank);
    const minimum = kind === "profession" ? 1 : 0;
    if (!Number.isInteger(rank) || rank < minimum || rank > 6) {
      setCreationError(`Рейтинг «${skill.name}» должен быть от ${minimum} до 6.`);
      renderCreationWizard();
      return;
    }
    skill.rank = rank;
    const used = startingSkillSpent(skills);
    const budget = kind === "profession" ? 44 : creationGeneralBudget(draft);
    if (used > budget) {
      setCreationError(`Не хватает очков: распределено ${used}, доступно ${budget}.`);
      renderCreationWizard();
      return;
    }
    if (kind === "profession") draft.professionRanks[key] = rank;
    else draft.generalRanks[key] = rank;
    setCreationError("");
    renderCreationWizard();
  }

  function validateCreationStep() {
    const draft = characterCreationDraft;
    if (draft.step === "identity") {
      const age = Number(draft.age);
      if (!draft.race || !draft.professionId) return "Выберите расу и профессию.";
      if (!window.CharacterCreation.validRaceProfession(draft.race, draft.professionId)) return "Эта комбинация расы и профессии недопустима по правилам.";
      if (!Number.isInteger(age) || age < (draft.race === "Ведьмак" ? 50 : 1) || age > 260) {
        return draft.race === "Ведьмак" ? "Возраст ведьмака должен быть от 50 до 260 лет." : "Укажите возраст целым числом от 1 до 260.";
      }
      draft.age = String(age);
      return "";
    }
    if (draft.step === "background") {
      if (!draft.backgroundMode) return "Выберите ручную или случайную предысторию.";
      if (draft.backgroundMode === "random" && !draft.generatedLifePath) return "Сначала сгенерируйте предысторию.";
      return "";
    }
    if (draft.step === "attributes") {
      if (draft.attributeMode === "points") {
        const result = window.CharacterCreation.validatePointBuy(draft.attributes, draft.attributePool);
        if (!result.ok) return result.message;
        return "";
      }
      if (draft.attributeMode === "dice") {
        const result = window.CharacterCreation.validateDiceAssignment(draft.diceAssignments, draft.rolls);
        if (!result.ok) return result.message;
        draft.attributes = result.attributes;
        return "";
      }
      return "Выберите способ определения характеристик.";
    }
    const profession = window.CharacterSkills.findProfession(draft.professionId);
    if (profession?.choice && draft.professionChoices.length !== profession.choice.requiredCount) {
      return `Для профессии «${profession.name}» нужно выбрать ровно ${profession.choice.requiredCount} навыков.`;
    }
    const professionalSkills = professionSkillDescriptors(draft);
    if (professionalSkills.length !== 11) return `В профессиональном наборе должно быть 11 навыков, сейчас: ${professionalSkills.length}.`;
    const profSpent = startingSkillSpent(professionalSkills);
    if (profSpent !== 44) return `Распределите 44 очка между профессиональными навыками. Сейчас распределено ${profSpent}.`;
    const generalSkills = startingGeneralSkills(draft);
    const generalSpent = startingSkillSpent(generalSkills);
    const generalBudget = creationGeneralBudget(draft);
    if (generalSpent > generalBudget) return `Общие навыки стоят ${generalSpent} очков при доступных ${generalBudget}.`;
    return "";
  }

  function finishCharacterCreation() {
    const draft = characterCreationDraft;
    const error = validateCreationStep();
    if (error) { setCreationError(error); return; }
    const character = window.CharacterStore.createCharacter(uniqueCharacterName(draft.name.trim() || `Персонаж ${characterStore.characters.length + 1}`));
    character.personal.race = draft.race;
    character.personal.age = draft.age;
    character.personal.professionId = draft.professionId;
    character.personal.profession = window.CharacterSkills.findProfession(draft.professionId)?.name || "";
    character.attributes = { ...draft.attributes };
    character.creation = {
      method: "guided",
      backgroundMode: draft.backgroundMode,
      attributeMethod: draft.attributeMode,
      attributePool: draft.attributeMode === "points" ? Number(draft.attributePool) : null,
      attributeRolls: draft.attributeMode === "dice" ? [...draft.rolls] : [],
      professionSkillBudget: 44,
      generalSkillBudget: creationGeneralBudget(draft),
    };
    if (draft.backgroundMode === "random") {
      const generated = JSON.parse(JSON.stringify(draft.generatedLifePath));
      character.lifePath.generated = generated;
      if (generated.homeland?.region) {
        character.personal.homeland = generated.homeland.region;
        character.lifePath.familyHistory = generated.familyFate || "";
        character.lifePath.familyStation = generated.familyStation || "";
        character.lifePath.parents = generated.parents || "";
        character.lifePath.siblings = (generated.siblings || []).map(sibling => `${sibling.role}${sibling.ageBand ? `, ${sibling.ageBand.toLowerCase()}` : ""}: ${sibling.relation}; ${sibling.personality}`).join("\n");
      } else if (generated.kind === "witcher") {
        character.lifePath.familyHistory = `${generated.school}. ${generated.importantEvent}`;
        character.lifePath.familyStation = generated.presentStatus || "";
        character.lifePath.parents = generated.training || "";
      }
      character.lifePath.decadeEvents = (generated.decadeEvents || []).map(event => `${event.decadeStart === undefined ? "" : `${event.decadeStart}–${event.decadeEnd} лет: `}${event.title || event.type}. ${event.description || ""}`.trim());
      character.lifePath.allies = (generated.relatives || []).filter(relative => relative.role.startsWith("Союзник") || relative.role.startsWith("Друг")).map(relative => `${relative.role}: ${relative.details}`);
      character.lifePath.enemies = (generated.relatives || []).filter(relative => relative.role.startsWith("Враг")).map(relative => `${relative.role}: ${relative.details}`);
      character.lifePath.relationships = (generated.relatives || []).filter(relative => /возлюблен|роман|отношен/i.test(relative.role)).map(relative => `${relative.role}: ${relative.details}`);
    }
    window.CharacterSkills.setProfession(character, draft.professionId);
    const profession = window.CharacterSkills.findProfession(draft.professionId);
    if (profession?.choice) window.CharacterSkills.setProfessionChoices(character, profession.id, draft.professionChoices);
    window.CharacterSkills.initializeCharacterSkills(character);
    const professionalRanks = new Map(professionSkillDescriptors(draft).map(skill => [skill.key, skill.rank]));
    for (const skill of character.skills) {
      if (skill.source === "profession") {
        const key = skill.professionSkillId || skill.catalogId;
        if (professionalRanks.has(key)) skill.rank = professionalRanks.get(key);
      } else if (skill.source === "general") {
        skill.rank = draft.generalRanks[skill.catalogId] ?? 0;
      }
    }
    character.professionTrees[draft.professionId] = window.CharacterProfessionTrees.createProgress();
    characterStore.characters.push(character);
    characterStore.activeCharacterId = character.characterId;
    inventory = character.equipment;
    characterViewMode = "editor";
    $("#character-library").hidden = true;
    $("#character-editor").hidden = false;
    closeCharacterCreation();
    renderCharacterEditor();
    showCharacterTab("sheet");
    renderInventory();
    persistStore("Персонаж создан по шагам мастера.");
  }

  function moveCharacterCreation(direction) {
    const draft = characterCreationDraft;
    if (!draft) return;
    if (direction > 0) {
      const error = validateCreationStep();
      if (error) { setCreationError(error); return; }
    }
    const index = creationSteps.findIndex(([id]) => id === draft.step);
    draft.step = creationSteps[Math.max(0, Math.min(creationSteps.length - 1, index + direction))][0];
    setCreationError("");
    renderCreationWizard();
  }

  function generateCreationLifePath() {
    const draft = characterCreationDraft;
    try {
      draft.generatedLifePath = window.CharacterCreation.generateLifePath({
        race: draft.race,
        age: Number(draft.age),
        risk: draft.witcherRisk,
      });
      setCreationError("");
    } catch (error) {
      setCreationError(error.message || "Не удалось создать предысторию.");
    }
    renderCreationWizard();
  }

  function handleCreationInput(event) {
    const draft = characterCreationDraft;
    if (!draft) return;
    const field = event.target.closest("[data-creation-field]");
    if (field && ["input", "change"].includes(event.type)) {
      if (field.tagName === "SELECT" && event.type !== "change") return;
      const key = field.dataset.creationField;
      if (key === "race") {
        draft.race = field.value;
        if (draft.professionId && draft.race && !window.CharacterCreation.validRaceProfession(draft.race, draft.professionId)) {
          draft.professionId = "";
          draft.professionChoices = [];
        }
        draft.generatedLifePath = null;
        renderCreationWizard();
      } else if (key === "profession") {
        draft.professionId = field.value;
        draft.professionChoices = [];
        draft.professionRanks = {};
        renderCreationWizard();
      } else if (key === "age") {
        draft.age = field.value;
        if (draft.backgroundMode === "random") draft.generatedLifePath = null;
      } else if (key === "name") {
        draft.name = field.value;
      } else if (key === "witcherRisk") {
        draft.witcherRisk = field.value;
        if (draft.backgroundMode === "random" && draft.generatedLifePath) generateCreationLifePath();
      } else if (key === "attributePool") {
        draft.attributePool = Number(field.value);
        draft.attributes = window.CharacterCreation.balancedAttributes(draft.attributePool);
        renderCreationWizard();
      }
      return;
    }
    const attributeInput = event.target.closest("[data-attribute-point]");
    if (attributeInput && ["input", "change"].includes(event.type)) {
      const value = attributeInput.value === "" ? null : Number(attributeInput.value);
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) return;
      draft.attributes ||= window.CharacterCreation.balancedAttributes(draft.attributePool);
      draft.attributes[attributeInput.dataset.attributePoint] = value;
      const total = Object.values(draft.attributes).reduce((sum, current) => sum + Number(current || 0), 0);
      $("#creation-attribute-spent").textContent = `${total} / ${draft.attributePool}`;
      if (event.type === "change") renderCreationWizard();
      return;
    }
    const diceInput = event.target.closest("[data-dice-attribute]");
    if (diceInput && event.type === "change") {
      if (diceInput.value === "") delete draft.diceAssignments[diceInput.dataset.diceAttribute];
      else draft.diceAssignments[diceInput.dataset.diceAttribute] = Number(diceInput.value);
      renderCreationWizard();
      return;
    }
    const professionChoice = event.target.closest("[data-creation-profession-choice]");
    if (professionChoice && event.type === "change") {
      const skillId = professionChoice.dataset.creationProfessionChoice;
      const selected = new Set(draft.professionChoices);
      if (professionChoice.checked) selected.add(skillId); else selected.delete(skillId);
      const profession = window.CharacterSkills.findProfession(draft.professionId);
      if (profession?.choice && selected.size > profession.choice.requiredCount) {
        setCreationError(`Выберите ровно ${profession.choice.requiredCount} навыков.`);
        renderCreationWizard();
        return;
      }
      draft.professionChoices = [...selected];
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const skillInput = event.target.closest("[data-skill-rank]");
    if (skillInput && event.type === "change") {
      const value = skillInput.dataset.skillRank;
      const separator = value.indexOf(".");
      const kind = value.slice(0, separator);
      const key = value.slice(separator + 1);
      changeCreationSkill(kind, key, Number(skillInput.value));
    }
  }

  function handleCreationClick(event) {
    const draft = characterCreationDraft;
    if (!draft) return;
    const action = event.target.closest("[data-creation-action]")?.dataset.creationAction;
    if (action === "cancel") { closeCharacterCreation(); return; }
    if (action === "back") { moveCharacterCreation(-1); return; }
    if (action === "next") { moveCharacterCreation(1); return; }
    if (action === "finish") { finishCharacterCreation(); return; }
    if (action === "generate-life-path") { generateCreationLifePath(); return; }
    const background = event.target.closest("[data-creation-background]");
    if (background) {
      draft.backgroundMode = background.dataset.creationBackground;
      draft.generatedLifePath = null;
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const attributeMode = event.target.closest("[data-attribute-mode]");
    if (attributeMode) {
      draft.attributeMode = attributeMode.dataset.attributeMode;
      if (draft.attributeMode === "dice") {
        draft.rolls = window.CharacterCreation.rollAttributes();
        draft.diceAssignments = {};
        draft.attributes = null;
      } else {
        draft.attributePool ||= 70;
        draft.attributes = window.CharacterCreation.balancedAttributes(draft.attributePool);
      }
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const attributeStep = event.target.closest("[data-attribute-step]");
    if (attributeStep) {
      const code = attributeStep.dataset.attributeCode;
      draft.attributes ||= window.CharacterCreation.balancedAttributes(draft.attributePool);
      const nextValue = Number(draft.attributes[code]) + Number(attributeStep.dataset.attributeStep);
      const nextTotal = Object.values(draft.attributes).reduce((sum, value, index) => sum + (window.CharacterCreation.ATTRIBUTES[index] === code ? nextValue : Number(value)), 0);
      if (nextValue < 1 || nextValue > 10 || nextTotal > Number(draft.attributePool)) return;
      draft.attributes[code] = nextValue;
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const skillStep = event.target.closest("[data-skill-step]");
    if (skillStep) {
      const kind = skillStep.dataset.skillKind;
      const key = skillStep.dataset.skillKey;
      const skills = kind === "profession" ? professionSkillDescriptors(draft) : startingGeneralSkills(draft);
      const skill = skills.find(entry => entry.key === key);
      if (skill) changeCreationSkill(kind, key, skill.rank + Number(skillStep.dataset.skillStep));
    }
  }

  function downloadRawRecoveryBackup(raw) {
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "witcher-characters-recovery.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function recoverCharacterData() {
    if (persistenceReady) return;
    if (!window.confirm("Создать новый пустой лист? Текущее сохранение сначала будет сохранено отдельно, если браузер позволит.")) return;
    let raw = null;
    try { raw = localStorage.getItem(window.CharacterStore.STORAGE_KEY); }
    catch (error) { setSaveMessage(`Браузер не разрешил прочитать сохранение: ${error.message || "ошибка хранилища"}`, true); return; }
    if (raw !== null) {
      try { localStorage.setItem(`${window.CharacterStore.STORAGE_KEY}.recovery-backup-${Date.now()}`, raw); }
      catch { downloadRawRecoveryBackup(raw); }
    }
    const candidate = window.CharacterStore.createStore("Персонаж 1");
    window.CharacterSkills.initializeCharacterSkills(candidate.characters[0]);
    try {
      characterStore = window.CharacterStore.save(localStorage, candidate);
      persistenceReady = true;
      persistenceError = "";
      inventory = activeCharacter().equipment;
      characterViewMode = "editor";
      $("#character-library").hidden = true;
      $("#character-editor").hidden = false;
      renderCharacterLibrary();
      renderCharacterEditor();
      renderInventory();
      setSaveMessage(raw === null ? "Создан новый лист персонажа." : "Создан новый лист; прежнее сохранение сохранено отдельно или скачано.");
    } catch (error) {
      setSaveMessage(`Не удалось создать новый лист; исходное сохранение не заменено. ${error.message || "Ошибка хранилища."}`, true);
    }
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(value) {
    return String(value || "character").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "character";
  }

  function exportCharacterData(character = null) {
    try {
      if (!persistenceReady) {
        const raw = localStorage.getItem(window.CharacterStore.STORAGE_KEY) ?? localStorage.getItem(window.CharacterStore.LEGACY_INVENTORY_KEY);
        if (raw !== null) {
          const blob = new Blob([raw], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "witcher-characters-recovery.json";
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setSaveMessage("Исходное сохранение выгружено без изменений.");
          return;
        }
      }
      const payload = character
        ? { ...characterStore, activeCharacterId: character.characterId, characters: [character] }
        : characterStore;
      const backup = window.CharacterStore.createBackup(payload);
      if (character) delete backup.legacyInventoryBackup;
      const filename = character ? `witcher-${safeFilename(character.personal.name)}.json` : "witcher-characters.json";
      downloadJson(backup, filename);
      setSaveMessage(character ? `JSON персонажа «${characterName(character)}» скачан.` : "Резервная копия списка персонажей скачана.");
    } catch (error) {
      setSaveMessage(`Не удалось создать резервную копию: ${error.message || "ошибка"}`, true);
    }
  }

  function updateSkillFromControl(event) {
    const control = event.target.closest("[data-skill-field]");
    if (!control) return false;
    const row = control.closest("[data-skill-id]");
    const skill = activeCharacter().skills.find(value => value.id === row?.dataset.skillId);
    if (!skill) return true;
    if (control.dataset.skillField === "rank") return true;
    if (control.dataset.skillField === "permanentModifier" || control.dataset.skillField === "temporaryModifier") {
      const value = control.value === "" ? 0 : Number(control.value);
      if (!Number.isInteger(value) || value < -1000 || value > 1000) return true;
      skill[control.dataset.skillField] = value;
    } else skill[control.dataset.skillField] = control.value;
    if (control.dataset.skillField === "attribute" && event.type === "change") renderSkillRows();
    renderCharacterDerived();
    persistStore("Навыки обновлены.", event.type === "change");
    return true;
  }

  function updateAbilityFromControl(event) {
    const control = event.target.closest("[data-ability-field]");
    if (!control) return false;
    const row = control.closest("[data-ability-id]");
    const ability = activeCharacter().abilities.find(value => value.id === row?.dataset.abilityId);
    if (!ability) return true;
    ability[control.dataset.abilityField] = control.value;
    persistStore("Способности обновлены.", event.type === "change");
    return true;
  }

  function updateLifePathOutcomeFromControl(event) {
    const control = event.target.closest("[data-life-path-outcome-field]");
    if (!control) return false;
    const row = control.closest("[data-life-path-outcome-id]");
    const outcome = activeCharacter().lifePath.outcomes.find(value => value.id === row?.dataset.lifePathOutcomeId);
    if (!outcome) return true;
    outcome[control.dataset.lifePathOutcomeField] = control.value;
    persistStore("Жизненный путь обновлён.", event.type === "change");
    return true;
  }

  function lockEditingForInvalidSave() {
    if (persistenceReady) return;
    document.querySelectorAll("#character-editor input, #character-editor select, #character-editor textarea, #character-editor button, #new-character")
      .forEach(control => { control.disabled = true; });
    $("#export-characters").disabled = false;
    $("#import-characters").disabled = false;
    $("#recover-character-data").hidden = false;
    $("#character-message").textContent = `${persistenceError} Данные в браузере оставлены без изменений; загрузите резервную копию.`;
    $("#character-message").classList.add("is-error");
  }

  function showPage(page, requestedTab = null) {
    if (page === "inventory") {
      page = "characters";
      requestedTab = "inventory";
    }
    if (page.includes("/")) {
      const [pageName, tabName] = page.split("/", 2);
      page = pageName;
      requestedTab = tabName || requestedTab;
    }
    if (!sections[page]) return;
    activePage = page;
    if (page === "characters" && requestedTab && characterViewMode === "library" && persistenceReady) {
      openCharacter(activeCharacter().characterId);
    }
    if (page === "characters" && characterViewMode === "library") renderCharacterLibrary();
    document.querySelectorAll(".page-view").forEach(view => { view.hidden = view.id !== `${page}-page`; });
    document.querySelectorAll(".nav-item").forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    if (page === "characters" && requestedTab) showCharacterTab(requestedTab, false);
    document.title = `${sections[page]} — Кодекс ремесленника`;
    history.replaceState(null, "", `#${page}${page === "characters" && requestedTab ? `/${requestedTab}` : ""}`);
  }

  function openCatalogItem(itemId) {
    const id = resolveItemId(itemId);
    const item = itemById.get(id);
    if (!item) return;
    $("#item-search").value = item.name;
    $("#item-type-filter").value = "";
    $("#item-availability-filter").value = "";
    $("#item-group-filter").value = "";
    $("#item-equipment-category-filter").value = "";
    updateItemFilters();
    renderItems();
    showPage("items");
    const card = [...document.querySelectorAll(".item-card")].find(entry => entry.dataset.itemId === id);
    if (card) {
      card.open = true;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function openCatalogRecipe(recipeId) {
    const recipe = recipes.find(entry => entry.id === recipeId);
    if (!recipe) return;
    $("#recipe-domain").value = recipe.type === "alchemy" ? "alchemy" : "craft";
    $("#craft-type-filter").value = recipe.type === "alchemy" ? "" : recipe.type;
    $("#tier-filter").value = "";
    updateRecipeFilters();
    $("#craft-category-filter").value = recipe.category || "";
    $("#search").value = recipe.name;
    renderRecipes();
    showPage("recipes");
    const card = [...document.querySelectorAll(".recipe-card")].find(entry => entry.dataset.recipeId === recipeId);
    if (card) {
      card.open = true;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  document.addEventListener("click", event => {
    const itemButton = event.target.closest("[data-open-catalog-item]");
    const recipeButton = event.target.closest("[data-open-recipe]");
    const catalogReferenceButton = event.target.closest("[data-open-catalog-reference]");
    if (itemButton) {
      event.preventDefault();
      event.stopPropagation();
      openCatalogItem(itemButton.dataset.openCatalogItem);
    } else if (recipeButton) {
      event.preventDefault();
      event.stopPropagation();
      openCatalogRecipe(recipeButton.dataset.openRecipe);
    } else if (catalogReferenceButton) {
      event.preventDefault();
      event.stopPropagation();
      const type = catalogReferenceButton.dataset.openCatalogReference;
      if (type === "recipe") openCatalogRecipe(catalogReferenceButton.dataset.catalogReferenceId);
      else if (type === "item") openCatalogItem(catalogReferenceButton.dataset.catalogReferenceId);
    }
  });
  document.querySelectorAll("[data-character-tab]").forEach(button => {
    button.addEventListener("click", () => showCharacterTab(button.dataset.characterTab));
  });
  $("#characters-page").addEventListener("click", event => {
    const attributeButton = event.target.closest("[data-attribute-setting-open]");
    if (attributeButton) {
      openAttributeSettings(attributeButton.dataset.attributeSettingOpen);
      return;
    }
    const treeButton = event.target.closest("[data-tree-open-profession]");
    if (treeButton) {
      openProfessionSkillDetails(treeButton.dataset.treeOpenProfession, treeButton.dataset.treeOpenBranch, Number(treeButton.dataset.treeOpenIndex));
    }
  });
  $("[role='tablist'][aria-label='Разделы листа персонажа']").addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-character-tab]")];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    showCharacterTab(tabs[nextIndex].dataset.characterTab, true, true);
  });

  function updateCharacterFromForm(event) {
    const relativeNameControl = event.target.closest("[data-generated-relative-name]");
    if (relativeNameControl) {
      if (!['input', 'change'].includes(event.type)) return true;
      const relative = activeCharacter().lifePath.generated?.relatives?.find(entry => entry.id === relativeNameControl.dataset.generatedRelativeName);
      if (relative) {
        relative.name = relativeNameControl.value;
        persistStore("Имя персонажа из предыстории сохранено.", event.type === "change");
      }
      return true;
    }
    const selectControl = event.target.closest("[data-character-select]");
    const professionChoice = event.target.closest("[data-profession-choice]");
    if (professionChoice) {
      if (event.type !== "change") return true;
      const character = activeCharacter();
      const profession = window.CharacterSkills.findCharacterProfession(character);
      if (!profession?.choice) return true;
      const selected = [...(character.professionSkillChoices?.[profession.id] || [])];
      const skillId = professionChoice.dataset.professionChoice;
      const next = professionChoice.checked
        ? [...new Set([...selected, skillId])]
        : selected.filter(value => value !== skillId);
      const result = window.CharacterSkills.setProfessionChoices(character, profession.id, next);
      if (!result.ok) {
        setSaveMessage(result.message, true);
        renderProfessionChoiceFields(profession, character);
        return true;
      }
      renderSkillRows();
      renderCharacterDerived();
      persistStore("Профессиональные навыки обновлены.");
      return true;
    }
    if (selectControl) {
      if (event.type !== "change") return true;
      const character = activeCharacter();
      const selection = selectControl.dataset.characterSelect;
      const nextRace = selection === "race" ? selectControl.value : character.personal.race;
      const currentProfession = window.CharacterSkills.findCharacterProfession(character);
      const nextProfessionId = selection === "profession" ? selectControl.value : currentProfession?.id || "";
      if (nextRace && nextProfessionId && !window.CharacterCreation.validRaceProfession(nextRace, nextProfessionId)) {
        setSaveMessage("Эта раса несовместима с выбранной профессией по правилам.", true);
        renderCharacterSelects(character);
        return true;
      }
      if (selection === "race") character.personal.race = selectControl.value;
      else if (selection === "gender") character.personal.gender = selectControl.value;
      else if (selection === "profession") {
        if (selectControl.value === "legacy-profession") return true;
        if (window.CharacterAdvancement.draftSummary(character, window.CharacterProfessionTrees).hasDraft) {
          setSaveMessage("Перед сменой профессии примените прокачку или отмените черновик.", true);
          renderCharacterSelects(character);
          return true;
        }
        window.CharacterSkills.setProfession(character, selectControl.value);
        if (!selectControl.value) character.professionSkillChoices = {};
      }
      renderCharacterSelects(character);
      renderSkillRows();
      renderRaceTraits(character);
      renderProfessionTree(character);
      renderGeneratedLifePath(character);
      renderCharacterDerived();
      persistStore(selection === "profession" ? "Профессия и её навыки обновлены." : "Личные данные обновлены.");
      return true;
    }
    const textControl = event.target.closest("[data-character-path]");
    const numberControl = event.target.closest("[data-character-number]");
    const linesControl = event.target.closest("[data-character-lines]");
    const attributeControl = event.target.closest("[data-attribute-input]");
    if (attributeControl) {
      const [code, part] = attributeControl.dataset.attributeInput.split(".");
      const value = attributeControl.value === "" ? null : Number(attributeControl.value);
      if (value !== null && (!Number.isInteger(value) || value < (part === "base" ? 0 : -1000) || value > 1000)) return;
      if (part === "base") activeCharacter().attributes[code] = value;
      else activeCharacter().attributeModifiers[code][part] = value ?? 0;
    } else if (textControl) {
      updateCharacterPath(textControl.dataset.characterPath, textControl.value);
      if (textControl.dataset.characterPath === "personal.name") {
        $("#character-editor-name").textContent = textControl.value.trim() || "Без имени";
        $("#inventory-character-name").textContent = textControl.value.trim() || "Без имени";
      }
    } else if (numberControl) {
      const value = numberControl.value === "" ? null : Number(numberControl.value);
      const [section, key] = numberControl.dataset.characterNumber.split(".");
      const minimum = section === "magic" && key === "vigorModifier" ? -100000 : 0;
      if (value !== null && (!Number.isFinite(value) || value < minimum || value > 100000)) return;
      activeCharacter()[section][key] = value;
    } else if (linesControl) {
      const [section, key] = linesControl.dataset.characterLines.split(".");
      activeCharacter()[section][key] = linesControl.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    } else if (event.target.id === "character-conditions") {
      activeCharacter().state.conditions = event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    } else return;
    renderCharacterDerived();
    persistStore("Лист персонажа обновлён.", event.type === "change");
  }

  $("#character-form").addEventListener("input", updateCharacterFromForm);
  $("#character-form").addEventListener("change", updateCharacterFromForm);
  $("#start-character-session").addEventListener("click", () => {
    const luck = window.CharacterRules.calculateAttributes(activeCharacter()).LUCK.total;
    if (luck === null || luck < 0) {
      setSaveMessage("Сначала укажите характеристику Удачи.", true);
      return;
    }
    activeCharacter().state.currentLuck = luck;
    renderCharacterEditor();
    persistStore(`Новая сессия начата. Удача восстановлена до ${numberText(luck)}.`);
  });
  $("#add-character-wound").addEventListener("click", () => {
    activeCharacter().state.wounds.push({ id: createEntryId(), location: "other", title: "", description: "", status: "active" });
    renderCharacterWounds();
    persistStore("Добавлено ранение.");
    [...$("#character-wounds").querySelectorAll('[data-wound-field="title"]')].at(-1)?.focus();
  });
  $("#character-wounds").addEventListener("input", event => {
    const control = event.target.closest("[data-wound-field]");
    const wound = activeCharacter().state.wounds.find(entry => entry.id === control?.closest("[data-wound-id]")?.dataset.woundId);
    if (!control || !wound) return;
    wound[control.dataset.woundField] = control.value;
    persistStore("Ранение обновлено.", false);
  });
  $("#character-wounds").addEventListener("change", event => {
    const control = event.target.closest("[data-wound-field]");
    const wound = activeCharacter().state.wounds.find(entry => entry.id === control?.closest("[data-wound-id]")?.dataset.woundId);
    if (!control || !wound) return;
    wound[control.dataset.woundField] = control.value;
    persistStore("Ранение обновлено.");
  });
  $("#character-wounds").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-wound]");
    if (!button) return;
    activeCharacter().state.wounds = activeCharacter().state.wounds.filter(wound => wound.id !== button.dataset.removeWound);
    renderCharacterWounds();
    persistStore("Ранение удалено.");
  });
  $("#add-character-combat-weapon").addEventListener("click", () => {
    const weapons = activeCharacter().equipment.combat.weapons;
    if (weapons.length >= 2) return;
    const slot = weapons.some(weapon => weapon.slot === "primary") ? "backup" : "primary";
    weapons.push({ id: createEntryId(), slot, inventoryEntryId: null, name: "", reliability: "" });
    renderCharacterCombatEquipment();
    persistStore("Добавлен слот оружия.");
  });
  $("#character-combat-weapons").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-combat-weapons").addEventListener("change", updateCombatEquipmentFromControl);
  $("#character-combat-weapons").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-combat-weapon]");
    if (!button) return;
    const combat = activeCharacter().equipment.combat;
    combat.weapons = combat.weapons.filter(weapon => weapon.id !== button.dataset.removeCombatWeapon);
    renderCharacterCombatEquipment();
    renderCharacterDerived();
    persistStore("Слот оружия удалён.");
  });
  $("#character-armor-zones").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-armor-zones").addEventListener("change", updateCombatEquipmentFromControl);
  $("#add-character-shield").addEventListener("click", () => {
    const combat = activeCharacter().equipment.combat;
    if (combat.shield !== null) return;
    combat.shield = { inventoryEntryId: null, currentSP: null, damage: "" };
    renderCharacterCombatEquipment();
    persistStore("Добавлен слот щита.");
  });
  $("#character-combat-shield").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-combat-shield").addEventListener("change", updateCombatEquipmentFromControl);
  $("#character-combat-shield").addEventListener("click", event => {
    if (!event.target.closest("[data-remove-character-shield]")) return;
    activeCharacter().equipment.combat.shield = null;
    renderCharacterCombatEquipment();
    renderCharacterDerived();
    persistStore("Щит убран из боевого снаряжения.");
  });
  function updateCombatEquipmentFromControl(event) {
    const target = event.target;
    const character = activeCharacter();
    const armorRow = target.closest("[data-armor-zone]");
    if (armorRow) {
      const slot = character.equipment.combat.armorByZone[armorRow.dataset.armorZone];
      if (!slot) return;
      if (target.matches("[data-armor-zone-item]")) {
        slot.inventoryEntryId = target.value || null;
        const entry = character.equipment.items.find(item => item.id === slot.inventoryEntryId);
        const catalog = combatInventoryItem(entry || {});
        const baseSP = catalogAttribute(catalog, "armor_rating");
        slot.currentSP = baseSP === null || baseSP === "" ? null : Number(baseSP);
        slot.damage = "";
      } else {
        const field = target.dataset.armorZoneField;
        if (!field) return;
        if (field === "currentSP") {
          const value = target.value === "" ? null : Number(target.value);
          if (value !== null && (!Number.isFinite(value) || value < 0)) return;
          slot.currentSP = value;
        } else slot[field] = target.value;
      }
      if (event.type === "change") {
        renderCharacterCombatEquipment();
        renderCharacterDerived();
      }
      persistStore("Броня по зонам обновлена.", event.type === "change");
      return;
    }
    const weaponRow = target.closest("[data-combat-weapon-id]");
    if (weaponRow) {
      const weapon = character.equipment.combat.weapons.find(entry => entry.id === weaponRow.dataset.combatWeaponId);
      const field = target.dataset.combatWeaponField;
      if (!weapon || !field) return;
      if (field === "slot" && character.equipment.combat.weapons.some(entry => entry.id !== weapon.id && entry.slot === target.value)) {
        setSaveMessage(target.value === "primary" ? "Основное оружие уже назначено." : "Запасное оружие уже назначено.", true);
        renderCharacterCombatEquipment();
        return;
      }
      if (field === "inventoryEntryId") {
        if (target.value && character.equipment.combat.weapons.some(entry => entry.id !== weapon.id && entry.inventoryEntryId === target.value)) {
          setSaveMessage("Этот предмет уже назначен другому слоту оружия.", true);
          renderCharacterCombatEquipment();
          return;
        }
        weapon.inventoryEntryId = target.value || null;
        const entry = character.equipment.items.find(item => item.id === weapon.inventoryEntryId);
        const item = combatInventoryItem(entry || {});
        weapon.name = entry?.name || "";
        weapon.reliability = String(catalogAttribute(item, "reliability") ?? "");
      } else weapon[field] = target.value;
      if (event.type === "change") {
        renderCharacterCombatEquipment();
        renderCharacterDerived();
      }
      persistStore("Оружие обновлено.", event.type === "change");
      return;
    }
    const shieldControl = target.closest("[data-shield-field]");
    if (shieldControl && character.equipment.combat.shield) {
      const shield = character.equipment.combat.shield;
      const field = shieldControl.dataset.shieldField;
      if (field === "inventoryEntryId") shield.inventoryEntryId = shieldControl.value || null;
      else if (field === "currentSP") {
        const value = shieldControl.value === "" ? null : Number(shieldControl.value);
        if (value !== null && (!Number.isFinite(value) || value < 0)) return;
        shield.currentSP = value;
      } else shield[field] = shieldControl.value;
      if (event.type === "change") renderCharacterCombatEquipment();
      persistStore("Щит обновлён.", event.type === "change");
    }
  }
  $("#add-character-magic-entry").addEventListener("click", () => {
    activeCharacter().magic.entries.push({ id: createEntryId(), kind: "spell", name: "", catalogRef: null, cost: "", effect: "", range: "", duration: "", time: "", difficulty: "", components: "", notes: "" });
    renderMagicEntries();
    persistStore("Добавлена магическая запись.");
    [...$("#character-magic-entries").querySelectorAll('[data-magic-field="name"]')].at(-1)?.focus();
  });
  $("#character-magic-entries").addEventListener("input", updateMagicEntryFromControl);
  $("#character-magic-entries").addEventListener("change", updateMagicEntryFromControl);
  $("#character-magic-entries").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-magic-entry]");
    if (!button) return;
    activeCharacter().magic.entries = activeCharacter().magic.entries.filter(entry => entry.id !== button.dataset.removeMagicEntry);
    renderMagicEntries();
    persistStore("Магическая запись удалена.");
  });
  function updateMagicEntryFromControl(event) {
    const target = event.target;
    const entry = activeCharacter().magic.entries.find(value => value.id === target.closest("[data-magic-entry-id]")?.dataset.magicEntryId);
    if (!entry) return;
    if (target.matches("[data-magic-catalog-search]")) {
      const reference = findMagicCatalogRef(target.value);
      entry.catalogRef = reference;
      if (reference && !entry.name.trim()) entry.name = reference.name;
      if (event.type === "change") renderMagicEntries();
      persistStore("Связь с каталогом обновлена.", event.type === "change");
      return;
    }
    const field = target.dataset.magicField;
    if (!field) return;
    entry[field] = target.value;
    persistStore("Магическая запись обновлена.", event.type === "change");
  }
  $("#character-development-panel").addEventListener("click", event => {
    const applyButton = event.target.closest("#apply-character-improvements");
    const cancelButton = event.target.closest("#cancel-character-improvements");
    if (applyButton || cancelButton) {
      const result = applyButton
        ? window.CharacterAdvancement.applyDraft(activeCharacter(), window.CharacterProfessionTrees)
        : window.CharacterAdvancement.cancelDraft(activeCharacter(), window.CharacterProfessionTrees);
      if (!result.ok) {
        setSaveMessage(result.message, true);
        renderCharacterAdvancement();
        return;
      }
      renderSkillRows();
      renderProfessionTree();
      renderCharacterDerived();
      renderCharacterAdvancement();
      persistStore(applyButton ? "Прокачка применена. Потрачено " + result.appliedPoints + " О.У." : "Черновик отменён; возвращено " + result.refunded + " О.У.");
      return;
    }
    const stageAttribute = event.target.closest("[data-stage-attribute]");
    const undoAttribute = event.target.closest("[data-undo-attribute]");
    const stageSkill = event.target.closest("[data-stage-skill]");
    const undoSkill = event.target.closest("[data-undo-skill]");
    const stageTree = event.target.closest("[data-stage-tree-profession]");
    const undoTree = event.target.closest("[data-undo-tree-profession]");
    if (!stageAttribute && !undoAttribute && !stageSkill && !undoSkill && !stageTree && !undoTree) return;
    let result;
    if (stageAttribute) {
      result = window.CharacterAdvancement.stageAttributeUpgrade(activeCharacter(), stageAttribute.dataset.stageAttribute);
    } else if (undoAttribute) {
      result = window.CharacterAdvancement.undoAttributeUpgrade(activeCharacter(), undoAttribute.dataset.undoAttribute);
    } else if (stageSkill || undoSkill) {
      const skillId = stageSkill?.dataset.stageSkill || undoSkill.dataset.undoSkill;
      const skill = activeCharacter().skills.find(entry => entry.id === skillId);
      const definition = window.CharacterSkills.SKILLS.find(entry => entry.id === skill?.catalogId);
      result = stageSkill
        ? window.CharacterAdvancement.stageSkillUpgrade(activeCharacter(), skillId, definition || {})
        : window.CharacterAdvancement.undoSkillUpgrade(activeCharacter(), skillId, definition || {});
    } else {
      const button = stageTree || undoTree;
      result = stageTree ? window.CharacterAdvancement.stageProfessionAbilityUpgrade(
        activeCharacter(),
        button.dataset.stageTreeProfession,
        button.dataset.stageTreeBranch,
        Number(button.dataset.stageTreeIndex),
        window.CharacterProfessionTrees,
      ) : window.CharacterAdvancement.undoProfessionAbilityUpgrade(
        activeCharacter(),
        button.dataset.undoTreeProfession,
        button.dataset.undoTreeBranch,
        Number(button.dataset.undoTreeIndex),
        window.CharacterProfessionTrees,
      );
    }
    if (!result.ok) {
      setSaveMessage(result.message, true);
      renderCharacterAdvancement();
      return;
    }
    renderCharacterAdvancement();
    persistStore(stageAttribute || stageSkill || stageTree
      ? "Улучшение добавлено в черновик за " + result.cost + " О.У."
      : "Черновое улучшение снято; О.У. возвращены в свободный остаток.");
  });
  $("#award-improvement-points").addEventListener("click", () => {
    const input = $("#improvement-points-input");
    const result = window.CharacterAdvancement.awardPoints(activeCharacter(), input.value);
    if (!result.ok) {
      setSaveMessage(result.message, true);
      return;
    }
    input.value = "1";
    renderCharacterAdvancement();
    persistStore("Начислено " + result.awarded + " очков улучшения.");
  });
  $("#character-attribute-dialog").addEventListener("input", updateAttributeSetting);
  $("#character-attribute-dialog").addEventListener("change", updateAttributeSetting);
  $("#close-character-attribute-dialog").addEventListener("click", () => $("#character-attribute-dialog").close());
  $("#character-skill-dialog").addEventListener("input", updateCharacterSkillSetting);
  $("#character-skill-dialog").addEventListener("change", updateCharacterSkillSetting);
  $("#close-character-skill-dialog").addEventListener("click", () => $("#character-skill-dialog").close());
  $("#open-character-skill-development").addEventListener("click", () => {
    $("#character-skill-dialog").close();
    showCharacterTab("development");
  });
  $("#profession-skill-dialog").addEventListener("click", event => {
    if (event.target.closest("#close-profession-skill-dialog")) {
      $("#profession-skill-dialog").close();
      return;
    }
    if (event.target.closest("#open-profession-skill-development")) {
      const dialog = $("#profession-skill-dialog");
      const professionId = dialog.dataset.profession;
      const branchId = dialog.dataset.branch;
      const index = dialog.dataset.index;
      dialog.close();
      showCharacterTab("development");
      document.querySelector('[data-stage-tree-profession="' + professionId + '"][data-stage-tree-branch="' + branchId + '"][data-stage-tree-index="' + index + '"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
  $("#character-search").addEventListener("input", renderCharacterLibrary);
  $("#character-list").addEventListener("click", event => {
    const button = event.target.closest("[data-character-action]");
    if (!button) return;
    const characterId = button.dataset.characterId;
    const action = button.dataset.characterAction;
    button.closest("details")?.removeAttribute("open");
    if (action === "open") openCharacter(characterId);
    else if (action === "copy") duplicateCharacter(characterId);
    else if (action === "rename") beginRenameCharacter(characterId);
    else if (action === "export") {
      const character = characterStore.characters.find(value => value.characterId === characterId);
      if (character) exportCharacterData(character);
    } else if (action === "delete") deleteCharacter(characterId);
  });
  $("#new-character").addEventListener("click", beginCharacterCreation);
  $("#character-create-dialog").addEventListener("input", handleCreationInput);
  $("#character-create-dialog").addEventListener("change", handleCreationInput);
  $("#character-create-dialog").addEventListener("click", handleCreationClick);
  $("#character-create-dialog").addEventListener("cancel", event => { event.preventDefault(); closeCharacterCreation(); });
  $("#recover-character-data").addEventListener("click", recoverCharacterData);
  $("#export-characters").addEventListener("click", () => exportCharacterData());
  $("#import-characters").addEventListener("click", () => $("#character-file").click());
  $("#character-list-back").addEventListener("click", showCharacterLibrary);
  $("#rename-character-input").addEventListener("input", event => event.target.setCustomValidity(""));
  $("#rename-character-dialog").addEventListener("close", () => { renameTargetCharacterId = null; });
  $("#rename-character-form").addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const character = characterStore.characters.find(value => value.characterId === renameTargetCharacterId);
    const name = $("#rename-character-input").value.trim();
    if (!character || !name) {
      $("#rename-character-input").setCustomValidity("Введите имя персонажа.");
      $("#rename-character-input").reportValidity();
      return;
    }
    character.personal.name = name;
    character.updatedAt = new Date().toISOString();
    $("#character-editor-name").textContent = name;
    $("#inventory-character-name").textContent = name;
    renderCharacterLibrary();
    persistStore(`Персонаж переименован в «${name}».`);
    $("#rename-character-dialog").close();
  });
  $("#add-life-path-outcome").addEventListener("click", () => {
    activeCharacter().lifePath.outcomes.push({ id: createEntryId(), type: "Событие", description: "", source: "" });
    renderLifePathOutcomes();
    persistStore("Добавлено последствие жизненного пути.");
    [...$("#character-life-path-outcomes").querySelectorAll('[data-life-path-outcome-field="description"]')].at(-1)?.focus();
  });
  $("#character-life-path-outcomes").addEventListener("input", updateLifePathOutcomeFromControl);
  $("#character-life-path-outcomes").addEventListener("change", updateLifePathOutcomeFromControl);
  $("#character-life-path-outcomes").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-life-path-outcome]");
    if (!button) return;
    activeCharacter().lifePath.outcomes = activeCharacter().lifePath.outcomes.filter(outcome => outcome.id !== button.dataset.removeLifePathOutcome);
    renderLifePathOutcomes();
    persistStore("Последствие жизненного пути удалено.");
  });
  $("#add-character-skill").addEventListener("click", () => {
    activeCharacter().skills.push({ id: createEntryId(), name: "", attribute: null, rank: 0, permanentModifier: 0, temporaryModifier: 0, source: "custom" });
    renderSkillRows();
    persistStore("Добавлен навык.");
    [...$("#character-skills").querySelectorAll('[data-skill-field="name"]')].at(-1)?.focus();
  });
  $("#character-skills").addEventListener("input", updateSkillFromControl);
  $("#character-skills").addEventListener("change", updateSkillFromControl);
  $("#character-skills").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-skill]");
    const settings = event.target.closest("[data-skill-setting-open]");
    if (settings) {
      openCharacterSkillSettings(settings.dataset.skillSettingOpen);
      return;
    }
    if (!button) return;
    const character = activeCharacter();
    const skill = character.skills.find(value => value.id === button.dataset.removeSkill);
    const definition = window.CharacterSkills.SKILLS.find(entry => entry.id === skill?.catalogId);
    while (window.CharacterAdvancement.draftCount(character, "skills", button.dataset.removeSkill) > 0) {
      const undone = window.CharacterAdvancement.undoSkillUpgrade(character, button.dataset.removeSkill, definition || {});
      if (!undone.ok) break;
    }
    character.skills = character.skills.filter(value => value.id !== button.dataset.removeSkill);
    renderSkillRows();
    renderCharacterAdvancement();
    persistStore("Навык удалён.");
  });
  $("#add-character-ability").addEventListener("click", () => {
    activeCharacter().abilities.push({ id: createEntryId(), name: "", description: "" });
    renderAbilityRows();
    persistStore("Добавлена способность.");
    [...$("#character-abilities").querySelectorAll('[data-ability-field="name"]')].at(-1)?.focus();
  });
  $("#character-abilities").addEventListener("input", updateAbilityFromControl);
  $("#character-abilities").addEventListener("change", updateAbilityFromControl);
  $("#character-abilities").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-ability]");
    if (!button) return;
    activeCharacter().abilities = activeCharacter().abilities.filter(ability => ability.id !== button.dataset.removeAbility);
    renderAbilityRows();
    persistStore("Способность удалена.");
  });
  $("#character-file").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ.");
      const payload = JSON.parse(await file.text());
      const imported = window.CharacterStore.parseImport(payload, { cleanLegacyEntry: cleanEntry });
      let candidate;
      let resultMessage = "Резервная копия персонажей загружена.";
      if (imported.kind === "characters" && persistenceReady) {
        if (imported.store.characters.length === 1) {
          const incoming = imported.store.characters[0];
          if (!window.confirm(`Добавить персонажа «${characterName(incoming)}» в список?`)) return;
          candidate = JSON.parse(JSON.stringify(characterStore));
          const added = candidate.characters.some(character => character.characterId === incoming.characterId)
            ? window.CharacterStore.copyCharacter(incoming, uniqueCharacterName(`${incoming.personal.name.trim() || "Персонаж"} (копия)`))
            : incoming;
          candidate.characters.push(added);
          candidate.activeCharacterId = added.characterId;
          resultMessage = `Персонаж «${characterName(added)}» добавлен из JSON.`;
        } else {
          if (!window.confirm("Заменить текущий список персонажей этим файлом? Перед заменой текущие данные сохранятся в браузере.")) return;
          const currentRaw = localStorage.getItem(window.CharacterStore.STORAGE_KEY);
          if (currentRaw !== null) localStorage.setItem(`${window.CharacterStore.STORAGE_KEY}.pre-import-backup`, currentRaw);
          candidate = imported.store;
          resultMessage = "Список персонажей восстановлен из JSON.";
        }
      } else if (imported.kind === "legacy-inventory" && persistenceReady) {
        candidate = JSON.parse(JSON.stringify(characterStore));
        const newCharacter = imported.store.characters[0];
        newCharacter.personal.name = uniqueCharacterName(`Персонаж ${candidate.characters.length + 1}`);
        candidate.characters.push(newCharacter);
        candidate.activeCharacterId = newCharacter.characterId;
        resultMessage = "Старый инвентарь добавлен отдельным персонажем.";
      } else {
        const currentRaw = localStorage.getItem(window.CharacterStore.STORAGE_KEY);
        if (currentRaw !== null) localStorage.setItem(`${window.CharacterStore.STORAGE_KEY}.recovery-backup`, currentRaw);
        candidate = imported.store;
        resultMessage = imported.kind === "legacy-inventory" ? "Старый инвентарь восстановлен как первый персонаж." : "Список персонажей восстановлен из JSON.";
      }
      characterStore = window.CharacterStore.save(localStorage, candidate);
      persistenceReady = true;
      persistenceError = "";
      inventory = activeCharacter().equipment;
      characterViewMode = "library";
      $("#character-library").hidden = false;
      $("#character-editor").hidden = true;
      renderCharacterLibrary();
      renderCharacterEditor();
      renderInventory();
      lockEditingForInvalidSave();
      setSaveMessage(resultMessage);
    } catch (error) {
      setSaveMessage(`Не удалось загрузить JSON: ${error.message || "ошибка формата"}`, true);
    } finally { event.target.value = ""; }
  });

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
  $("#item-availability-filter").addEventListener("change", renderItems);
  $("#item-group-filter").addEventListener("change", renderItems);
  $("#item-equipment-category-filter").addEventListener("change", renderItems);
  $("#clear-item-filters").addEventListener("click", () => {
    $("#item-search").value = "";
    $("#item-type-filter").value = "";
    $("#item-equipment-category-filter").value = "";
    updateItemFilters();
    renderItems();
    $("#item-search").focus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      (activePage === "items" ? $("#item-search") : activePage === "characters" && characterViewMode === "library" ? $("#character-search") : $("#search")).focus();
    }
    if (event.key === "Escape" && document.activeElement.matches("input[type=search]")) {
      document.activeElement.value = "";
      renderRecipes();
      renderItems();
      if (document.activeElement.id === "character-search") renderCharacterLibrary();
      document.activeElement.blur();
    }
  });

  $("#inventory-item-search").addEventListener("input", event => {
    selectedInventoryItemId = null;
    event.target.setCustomValidity("");
    $("#inventory-unit-weight").value = "";
    renderInventorySuggestions();
  });
  $("#inventory-item-search").addEventListener("focus", () => {
    if (!selectedInventoryItemId) renderInventorySuggestions();
  });
  $("#inventory-item-search").addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!$("#inventory-search-results").hidden) closeInventorySuggestions();
      else {
        event.target.value = "";
        event.target.setCustomValidity("");
        selectedInventoryItemId = null;
        $("#inventory-unit-weight").value = "";
        renderInventorySuggestions();
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if ($("#inventory-search-results").hidden) renderInventorySuggestions();
      if (!inventoryMatches.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = activeInventoryMatch < 0 && direction < 0
        ? inventoryMatches.length - 1
        : (activeInventoryMatch + direction + inventoryMatches.length) % inventoryMatches.length;
      setActiveInventoryMatch(next);
    } else if (event.key === "Enter" && !$("#inventory-search-results").hidden && inventoryMatches.length) {
      event.preventDefault();
      selectInventoryItem(inventoryMatches[activeInventoryMatch < 0 ? 0 : activeInventoryMatch]);
    }
  });
  $("#inventory-search-results").addEventListener("pointerdown", event => {
    const option = event.target.closest("[data-item-id]");
    if (!option) return;
    event.preventDefault();
    selectInventoryItem(itemById.get(option.dataset.itemId));
  });
  $("#inventory-search-results").addEventListener("click", event => {
    const option = event.target.closest("[data-item-id]");
    if (option && selectedInventoryItemId !== option.dataset.itemId) selectInventoryItem(itemById.get(option.dataset.itemId));
  });
  $("#inventory-item-search").addEventListener("blur", closeInventorySuggestions);
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".inventory-search-control")) closeInventorySuggestions();
  });
  $("#add-inventory-item").addEventListener("submit", event => {
    event.preventDefault();
    const item = itemById.get(selectedInventoryItemId);
    if (!item) {
      $("#inventory-item-search").setCustomValidity("Выберите предмет в результатах поиска.");
      $("#inventory-item-search").reportValidity();
      return;
    }
    const quantity = Number($("#inventory-quantity").value);
    const weightRaw = $("#inventory-unit-weight").value;
    const unitWeightKg = weightRaw === "" ? null : Number(weightRaw);
    if (!item || !Number.isFinite(quantity) || quantity <= 0 || (unitWeightKg !== null && (!Number.isFinite(unitWeightKg) || unitWeightKg < 0))) return;
    addInventoryEntry({ id: createEntryId(), itemId: item.id, name: item.name, quantity, unitWeightKg, conditionNotes: "", armorEv: null, customCategory: "", custom: false }, $("#inventory-separate-entry").checked);
    event.target.reset();
    selectedInventoryItemId = null;
    closeInventorySuggestions();
    $("#inventory-search-help").textContent = "";
    $("#inventory-quantity").value = "1";
    $("#inventory-unit-weight").value = "";
    $("#inventory-separate-entry").checked = false;
  });
  $("#add-custom-item").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("#custom-item-name").value.trim();
    const quantity = Number($("#custom-item-quantity").value);
    const weightRaw = $("#custom-item-weight").value;
    const unitWeightKg = weightRaw === "" ? null : Number(weightRaw);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || (unitWeightKg !== null && (!Number.isFinite(unitWeightKg) || unitWeightKg < 0))) return;
    addInventoryEntry({ id: createEntryId(), itemId: null, name, quantity, unitWeightKg, conditionNotes: "", armorEv: null, customCategory: $("#custom-item-category").value, custom: true });
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
    } else if (input.dataset.field === "unitWeightKg") {
      const value = input.value === "" ? null : Number(input.value);
      if (value !== null && (!Number.isFinite(value) || value < 0)) { input.value = entry.unitWeightKg ?? ""; return; }
      entry.unitWeightKg = value;
    } else if (input.dataset.field === "conditionNotes") {
      entry.conditionNotes = input.value.slice(0, 2000);
    } else if (input.dataset.field === "armorEv") {
      const value = input.value === "" ? null : Number(input.value);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) { input.value = entry.armorEv ?? ""; return; }
      entry.armorEv = value;
    }
    saveInventory("Изменения сохранены.");
  });
  $("#inventory-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    unlinkInventoryEntry(button.dataset.remove);
    inventory.items = inventory.items.filter(item => item.id !== button.dataset.remove);
    saveInventory("Предмет удалён.");
  });
  $("#clear-inventory").addEventListener("click", () => {
    if (!inventory.items.length || !window.confirm("Удалить все предметы из инвентаря?")) return;
    inventory.items.forEach(item => unlinkInventoryEntry(item.id));
    inventory.items = [];
    saveInventory("Инвентарь очищен.");
  });
  updateRecipeFilters();
  updateItemFilters();
  renderRecipes();
  renderItems();
  renderCharacterLibrary();
  renderCharacterEditor();
  renderInventory();
  if (migrationNotice) setSaveMessage(migrationNotice);
  if (!persistenceReady) lockEditingForInvalidSave();
  window.addEventListener("pagehide", () => {
    if (saveTimer) persistStore("Лист персонажа обновлён.", true);
  });
  const initialPage = location.hash.slice(1);
  if (sections[initialPage] || initialPage === "inventory" || initialPage.startsWith("characters/")) showPage(initialPage);
})();
