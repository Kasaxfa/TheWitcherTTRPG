(() => {
  const recipes = window.RECIPES || [];
  const items = window.ITEMS || [];
  const alchemySymbols = window.ALCHEMY_SYMBOLS || {};
  const itemAliases = window.ITEM_ID_ALIASES || {};
  const itemById = new Map(items.map(item => [item.id, item]));
  const sections = { recipes: "Рецепты", items: "Предметы", inventory: "Инвентарь", characters: "Персонажи" };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const numberText = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
  let activePage = "recipes";
  let characterViewMode = "library";
  let renameTargetCharacterId = null;

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
        ${recipe.priceCrowns !== null && recipe.priceCrowns !== undefined ? `<div><span class="detail-label">Цена</span><span class="detail-value">${numberText(recipe.priceCrowns)} кр.</span></div>` : ""}
        ${recipe.surchargeCrowns !== null && recipe.surchargeCrowns !== undefined ? `<div><span class="detail-label">Доплата за изготовление</span><span class="detail-value">${numberText(recipe.surchargeCrowns)} кр.</span></div>` : ""}
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
      const labels = { where_found: "Где найти", availability: "Доступность", acquisition_method: "Где найти", alchemy_group: "Группа", effect: "Эффект", duration: "Длительность", toxicity: "Токсичность", application: "Применение", notes: "Примечание" };
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
    return { id: String(raw.id || createEntryId()).slice(0, 120), itemId, name, quantity, unitWeightKg: unitWeight, custom: !itemId };
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
      : `из ${numberText(capacity)} кг · ${inventory.capacityKg === null ? "ENC по BODY" : "задано вручную"}`;
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
    if (derived.load.status === "over-lift-limit") warnings.push(`Вес превышает предел подъёма по BODY (${numberText(derived.liftLimitKg)} кг).`);
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
    renderCharacterDerived();
  }

  function addInventoryEntry(entry) {
    const existing = entry.itemId && inventory.items.find(item => item.itemId === entry.itemId);
    if (existing) {
      existing.quantity += entry.quantity;
      if (entry.unitWeightKg !== null) existing.unitWeightKg = entry.unitWeightKg;
    } else inventory.items.push(entry);
    saveInventory("Инвентарь сохранён в этом браузере.");
  }

  const attributeLabels = {
    INT: "Интеллект", REF: "Реакция", DEX: "Ловкость", BODY: "Телосложение",
    SPD: "Скорость", EMP: "Эмпатия", CRA: "Ремесло", WILL: "Воля", LUCK: "Удача",
  };

  const valueOrDash = value => value === null || value === undefined ? "—" : numberText(value);

  function activeDerivedValues() {
    const character = activeCharacter();
    const weight = inventoryWeight(character);
    return window.CharacterRules.deriveCharacter(character, {
      carriedWeightKg: weight.knownKg,
      unknownWeightCount: weight.unknownCount,
    });
  }

  function renderAttributeRows() {
    const character = activeCharacter();
    const values = window.CharacterRules.calculateAttributes(character);
    $("#character-attributes").innerHTML = window.CharacterStore.ATTRIBUTES.map(code => {
      const value = values[code];
      return `<div class="character-stat-row" data-attribute-row="${code}">
        <strong class="character-stat-name">${escapeHtml(attributeLabels[code])}<span>${code}</span></strong>
        <label class="field">Исходное<input data-attribute-input="${code}.base" type="number" min="0" max="1000" step="1" value="${value.base === null ? "" : escapeHtml(value.base)}" aria-label="Исходное значение: ${attributeLabels[code]}"></label>
        <label class="field">Постоянное<input data-attribute-input="${code}.permanent" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(value.permanent)}" aria-label="Постоянное изменение: ${attributeLabels[code]}"></label>
        <label class="field">Временное<input data-attribute-input="${code}.temporary" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(value.temporary)}" aria-label="Временное изменение: ${attributeLabels[code]}"></label>
        <output class="character-stat-total" data-attribute-total="${code}" aria-label="Итог: ${attributeLabels[code]}">${valueOrDash(value.total)}</output>
      </div>`;
    }).join("");
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
      output.textContent = valueOrDash(derived.attributes[output.dataset.attributeTotal]?.total);
    });
    const entries = [
      ["Физическая основа · B", valueOrDash(derived.physicalBasis)],
      ["Максимум ПЗ", valueOrDash(derived.maxHp)],
      ["Максимум Выносливости", valueOrDash(derived.maxSta)],
      ["Восстановление · REC", valueOrDash(derived.recovery)],
      ["Устойчивость · STUN", valueOrDash(derived.stun)],
      ["Бег за ход · RUN", derived.runMeters === null ? "—" : `${numberText(derived.runMeters)} м`],
      ["Прыжок · LEAP", derived.leapMeters === null ? "—" : `${numberText(derived.leapMeters)} м`],
      ["Переносимый вес · ENC", derived.encumbranceKg === null ? "—" : `${numberText(derived.encumbranceKg)} кг`],
      ["Предел подъёма", derived.liftLimitKg === null ? "—" : `${numberText(derived.liftLimitKg)} кг`],
      ["Бонус ближнего боя", derived.meleeDamageBonus === null ? "—" : `${derived.meleeDamageBonus > 0 ? "+" : ""}${derived.meleeDamageBonus}`],
      ["Удар рукой", derived.punchDamage || "—"],
      ["Удар ногой", derived.kickDamage || "—"],
    ];
    const loadValue = derived.load.status === "within-capacity" ? "Штрафа нет"
      : derived.load.status === "encumbered" ? `−${derived.load.penalty} к REF, DEX и SPD`
        : derived.load.status === "over-lift-limit" ? "Выше предела подъёма"
          : "Вес неизвестен";
    const loadHint = derived.load.status === "unknown" && derived.load.unknownWeightCount
      ? "Укажите вес всех предметов в инвентаре"
      : derived.encumbranceKg === null ? "Введите BODY для расчёта переносимого веса"
        : `Вес инвентаря: ${numberText(derived.load.carriedWeightKg)} кг`;
    entries.push(["Штраф от нагрузки", loadValue, loadHint]);
    $("#character-derived-values").innerHTML = entries.map(([label, value, hint]) => `<div class="character-derived-card">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </div>`).join("");

    const notes = [];
    if (derived.attributes.BODY.total === null || derived.attributes.WILL.total === null) notes.push("Для расчёта физической основы, максимума ПЗ, Выносливости, REC и STUN укажите BODY и WILL.");
    if (derived.attributes.SPD.total === null) notes.push("Для расчёта бега и прыжка укажите SPD.");
    if (derived.attributes.BODY.total === null) notes.push("Для расчёта переносимого веса и урона укажите BODY.");
    if (derived.physicalBasis !== null && !derived.physicalBasisSupported) notes.push(`Физическая основа B=${derived.physicalBasis}: в проверенной таблице нет строки для этого значения.`);
    if (derived.meleeDamageBonus === null && derived.attributes.BODY.total !== null) notes.push(`BODY=${numberText(derived.attributes.BODY.total)}: значение урона отсутствует в проверенной таблице.`);
    if (derived.load.status === "over-lift-limit") notes.push("Штрафы за перегруз здесь не вычисляются: вес выше предела подъёма, указанного для BODY.");
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
    const professional = character.skills.filter(skill => skill.source === "profession" && skill.professionId === profession?.id);
    const general = character.skills.filter(skill => skill.source === "general");
    const other = character.skills.filter(skill => !["profession", "general"].includes(skill.source));
    const skillRow = skill => {
      const definition = catalog.SKILLS.find(entry => entry.id === skill.catalogId);
      const fixed = Boolean(definition || skill.professionSkillId);
      const sourceLabel = skill.source === "profession" ? "Профессия" : skill.source === "general" ? "Общий список" : "Дополнительный";
      const attribute = attributeLabels[skill.attribute] ? `${skill.attribute} · ${attributeLabels[skill.attribute]}` : "Характеристика не указана";
      const nameControl = fixed
        ? `<div class="skill-name-field"><strong>${escapeHtml(skill.name)}</strong><span class="skill-attribute-label">${escapeHtml(attribute)}</span>${definition?.doubleCost ? `<small>Повышение стоит вдвое дороже</small>` : ""}</div>`
        : `<label class="field skill-name-field">Навык<input data-skill-field="name" maxlength="120" value="${escapeHtml(skill.name)}" aria-label="Название навыка"></label>`;
      const attributeControl = fixed ? "" : `<label class="field skill-attribute-field">Ведущая характеристика<select data-skill-field="attribute" aria-label="Ведущая характеристика"><option value="">Не указана</option>${window.CharacterStore.ATTRIBUTES.map(code => `<option value="${code}"${skill.attribute === code ? " selected" : ""}>${code} · ${attributeLabels[code]}</option>`).join("")}</select></label>`;
      const removable = skill.source === "custom" || skill.source === "other";
      return `<div class="character-entry skill-entry${fixed ? " catalog-skill-entry" : ""}" data-skill-id="${escapeHtml(skill.id)}">
        ${nameControl}${attributeControl}
        <label class="field">Рейтинг<input data-skill-field="rank" type="number" min="${skill.source === "profession" ? "1" : "0"}" max="1000" step="1" value="${skill.rank === null ? "" : escapeHtml(skill.rank)}" aria-label="Рейтинг навыка ${escapeHtml(skill.name)}"></label>
        <label class="field">Постоянное<input data-skill-field="permanentModifier" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(skill.permanentModifier)}" aria-label="Постоянное изменение навыка ${escapeHtml(skill.name)}"></label>
        <label class="field">Временное<input data-skill-field="temporaryModifier" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(skill.temporaryModifier)}" aria-label="Временное изменение навыка ${escapeHtml(skill.name)}"></label>
        <output class="skill-total" data-skill-total="${escapeHtml(skill.id)}"><span>Итог</span><strong>—</strong></output>
        ${removable ? `<button class="character-remove" type="button" data-remove-skill="${escapeHtml(skill.id)}" aria-label="Удалить навык ${escapeHtml(skill.name)}">×</button>` : `<span class="skill-source-label">${sourceLabel}</span>`}
      </div>`;
    };
    const attributeOrder = window.CharacterStore.ATTRIBUTES.filter(code => code !== "SPD" && code !== "LUCK");
    const professionalHeading = profession
      ? `<div class="skill-group-heading"><h3>Навыки профессии: ${escapeHtml(profession.name)}</h3><span>${professional.length}/11</span></div>`
      : `<div class="skill-group-heading"><h3>Профессиональные навыки</h3><span>Выберите профессию выше</span></div>`;
    const professionalHtml = professional.length
      ? professional.map(skillRow).join("")
      : `<p class="character-empty">Выберите профессию, чтобы добавить её определяющий навык и набор.</p>`;
    const generalHtml = attributeOrder.map(attribute => {
      const skills = general.filter(skill => skill.attribute === attribute);
      if (!skills.length) return "";
      return `<section class="skill-attribute-group"><h4>${escapeHtml(attributeLabels[attribute])} <span>${attribute}</span></h4>${skills.map(skillRow).join("")}</section>`;
    }).join("");
    list.innerHTML = `<section class="skill-group">${professionalHeading}${professionalHtml}</section>
      <section class="skill-group"><div class="skill-group-heading"><h3>Общие навыки</h3><span>${general.length} навыков</span></div>${generalHtml || `<p class="character-empty">Общие навыки не найдены.</p>`}</section>
      ${other.length ? `<section class="skill-group"><div class="skill-group-heading"><h3>Дополнительные навыки</h3><span>${other.length}</span></div>${other.map(skillRow).join("")}</section>` : ""}`;
    renderProfessionChoiceFields(profession, character);
    $("#character-profession-skill-note").textContent = profession
      ? `Профиль ${profession.name}: определяющий навык и профессиональный набор. На создании у всех 11 профессиональных навыков должен быть рейтинг не ниже 1; общий список навыков остаётся доступен каждому.`
      : "Все навыки общего списка показаны ниже. После выбора профессии появятся её определяющий навык и профессиональный набор.";
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
      return `<label class="profession-choice-option"><input type="checkbox" data-profession-choice="${escapeHtml(skillId)}"${checked}><span>${escapeHtml(skill.name)}</span><small>${skill.attribute} · ${escapeHtml(attributeLabels[skill.attribute])}</small></label>`;
    }).join("");
    container.innerHTML = `<fieldset class="profession-choice-box"><legend>${escapeHtml(profession.choice.label)}</legend><p>Выбрано ${selected.length} из ${profession.choice.requiredCount}. Отметьте любые навыки из списка.</p><div class="profession-choice-grid">${options}</div></fieldset>`;
  }

  function renderSkillTotals(derived = activeDerivedValues()) {
    const totals = new Map(derived.skills.map(skill => [skill.id, skill.total]));
    document.querySelectorAll("[data-skill-total]").forEach(output => {
      const total = totals.get(output.dataset.skillTotal);
      const display = output.querySelector("strong");
      if (display) display.textContent = valueOrDash(total);
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
    renderAttributeRows();
    renderSkillRows();
    renderAbilityRows();
    renderLifePathOutcomes();
    renderCharacterDerived();
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

  function addNewCharacter() {
    if (!persistenceReady) return;
    const character = window.CharacterStore.createCharacter(uniqueCharacterName(`Персонаж ${characterStore.characters.length + 1}`));
    window.CharacterSkills.initializeCharacterSkills(character);
    characterStore.characters.push(character);
    characterStore.activeCharacterId = character.characterId;
    inventory = character.equipment;
    characterViewMode = "editor";
    $("#character-library").hidden = true;
    $("#character-editor").hidden = false;
    renderCharacterEditor();
    renderInventory();
    persistStore("Создан новый персонаж.");
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
    if (control.dataset.skillField === "rank") {
      const value = control.value === "" ? null : Number(control.value);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1000)) return true;
      skill.rank = value;
    } else if (control.dataset.skillField === "permanentModifier" || control.dataset.skillField === "temporaryModifier") {
      const value = control.value === "" ? 0 : Number(control.value);
      if (!Number.isInteger(value) || value < -1000 || value > 1000) return true;
      skill[control.dataset.skillField] = value;
    } else skill[control.dataset.skillField] = control.value;
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
    document.querySelectorAll("#character-form input, #character-form select, #character-form textarea, #character-form button, #new-character, #character-editor button, #inventory-page input, #inventory-page button")
      .forEach(control => { control.disabled = true; });
    $("#export-characters").disabled = false;
    $("#import-characters").disabled = false;
    $("#recover-character-data").hidden = false;
    $("#character-message").textContent = `${persistenceError} Данные в браузере оставлены без изменений; загрузите резервную копию.`;
    $("#character-message").classList.add("is-error");
  }

  function showPage(page) {
    if (!sections[page]) return;
    activePage = page;
    if (page === "characters" && characterViewMode === "library") renderCharacterLibrary();
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

  function updateCharacterFromForm(event) {
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
      if (selection === "race") character.personal.race = selectControl.value;
      else if (selection === "gender") character.personal.gender = selectControl.value;
      else if (selection === "profession") {
        if (selectControl.value === "legacy-profession") return true;
        window.CharacterSkills.setProfession(character, selectControl.value);
        if (!selectControl.value) character.professionSkillChoices = {};
      }
      renderCharacterSelects(character);
      renderSkillRows();
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
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100000)) return;
      const [section, key] = numberControl.dataset.characterNumber.split(".");
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
  $("#new-character").addEventListener("click", addNewCharacter);
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
    activeCharacter().skills.push({ id: createEntryId(), name: "", attribute: null, rank: null, permanentModifier: 0, temporaryModifier: 0 });
    renderSkillRows();
    persistStore("Добавлен навык.");
    [...$("#character-skills").querySelectorAll('[data-skill-field="name"]')].at(-1)?.focus();
  });
  $("#character-skills").addEventListener("input", updateSkillFromControl);
  $("#character-skills").addEventListener("change", updateSkillFromControl);
  $("#character-skills").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-skill]");
    if (!button) return;
    activeCharacter().skills = activeCharacter().skills.filter(skill => skill.id !== button.dataset.removeSkill);
    renderSkillRows();
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
    addInventoryEntry({ id: createEntryId(), itemId: item.id, name: item.name, quantity, unitWeightKg, custom: false });
    event.target.reset();
    selectedInventoryItemId = null;
    closeInventorySuggestions();
    $("#inventory-search-help").textContent = "";
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
  if (sections[initialPage]) showPage(initialPage);
})();
