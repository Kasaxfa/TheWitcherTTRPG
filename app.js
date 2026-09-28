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
      const statNotes = [shortAttribute(code)];
      if (value.racial) statNotes.push(`раса ${signed(value.racial)}`);
      if (value.background) statNotes.push(`предыстория ${signed(value.background)}`);
      return `<div class="character-stat-row" data-attribute-row="${code}">
        <strong class="character-stat-name">${escapeHtml(attributeLabels[code])}<span>${escapeHtml(statNotes.join(" · "))}</span></strong>
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
        return skills.length ? `<details class="creation-skill-group"><summary>${escapeHtml(attributeLabels[code])} · ${shortAttribute(code)} <span>${skills.length} навыков</span></summary><div>${skills.map(skill => creationSkillRow(skill, "general")).join("")}</div></details>` : "";
      }).join("");
      body = `${professionChoiceHtml}<div class="creation-skill-section"><div class="creation-budget-readout"><span>Профессиональные навыки · рейтинг не ниже 1, максимум 6 на создании</span><strong>${profSpent} / 44</strong></div><div class="creation-profession-skill-list">${professionalHtml}</div></div>
        <div class="creation-skill-section"><div class="creation-budget-readout"><span>Общие навыки · бюджет Инт + Реа</span><strong>${generalSpent} / ${generalBudget}</strong></div><p class="creation-rule-note">Остаток общего бюджета можно не тратить. Сложные навыки с пометкой ×2 стоят 2 очка за ранг.</p>${generalHtml}</div>`;
    }

    $("#character-create-content").innerHTML = `${header}<div class="creation-step-content">${body}</div>`;
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
    const professional = character.skills.filter(skill => skill.source === "profession" && skill.professionId === profession?.id);
    const general = character.skills.filter(skill => skill.source === "general");
    const other = character.skills.filter(skill => !["profession", "general"].includes(skill.source));
    const skillRow = skill => {
      const definition = catalog.SKILLS.find(entry => entry.id === skill.catalogId);
      const fixed = Boolean(definition || skill.professionSkillId);
      const sourceLabel = skill.source === "profession" ? "Профессия" : skill.source === "general" ? "Общий список" : "Дополнительный";
      const attribute = attributeLabels[skill.attribute] ? `${shortAttribute(skill.attribute)} · ${attributeLabels[skill.attribute]}` : "Характеристика не указана";
      const nameControl = fixed
        ? `<div class="skill-name-field"><strong>${escapeHtml(skill.name)}</strong><span class="skill-attribute-label">${escapeHtml(attribute)}</span>${definition?.doubleCost ? `<small>Повышение стоит вдвое дороже</small>` : ""}</div>`
        : `<label class="field skill-name-field">Навык<input data-skill-field="name" maxlength="120" value="${escapeHtml(skill.name)}" aria-label="Название навыка"></label>`;
      const attributeControl = fixed ? "" : `<label class="field skill-attribute-field">Ведущая характеристика<select data-skill-field="attribute" aria-label="Ведущая характеристика"><option value="">Не указана</option>${window.CharacterStore.ATTRIBUTES.map(code => `<option value="${code}"${skill.attribute === code ? " selected" : ""}>${shortAttribute(code)} · ${attributeLabels[code]}</option>`).join("")}</select></label>`;
      const removable = skill.source === "custom" || skill.source === "other";
      return `<div class="character-entry skill-entry${fixed ? " catalog-skill-entry" : ""}" data-skill-id="${escapeHtml(skill.id)}">
        ${nameControl}${attributeControl}
        <label class="field">Рейтинг<input data-skill-field="rank" type="number" min="${skill.source === "profession" ? "1" : "0"}" max="1000" step="1" value="${skill.rank === null ? "" : escapeHtml(skill.rank)}" aria-label="Рейтинг навыка ${escapeHtml(skill.name)}"></label>
        <label class="field">Постоянное<input data-skill-field="permanentModifier" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(skill.permanentModifier)}" aria-label="Постоянное изменение навыка ${escapeHtml(skill.name)}"></label>
        <label class="field">Временное<input data-skill-field="temporaryModifier" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(skill.temporaryModifier)}" aria-label="Временное изменение навыка ${escapeHtml(skill.name)}"></label>
        <output class="skill-total" data-skill-total="${escapeHtml(skill.id)}"><span>Итог</span><strong>—</strong><small data-skill-bonus></small></output>
        ${removable ? `<button class="character-remove" type="button" data-remove-skill="${escapeHtml(skill.id)}" aria-label="Удалить навык ${escapeHtml(skill.name)}">×</button>` : `<span class="skill-source-label">${sourceLabel}</span>`}
      </div>`;
    };
    const attributeOrder = window.CharacterStore.ATTRIBUTES.filter(code => code !== "SPD" && code !== "LUCK");
    const professionalHtml = professional.length
      ? professional.map(skillRow).join("")
      : `<p class="character-empty">Выберите профессию, чтобы добавить её определяющий навык и набор.</p>`;
    const generalHtml = attributeOrder.map(attribute => {
      const skills = general.filter(skill => skill.attribute === attribute);
      if (!skills.length) return "";
      return `<section class="skill-attribute-group"><h4>${escapeHtml(attributeLabels[attribute])} <span>${shortAttribute(attribute)}</span></h4>${skills.map(skillRow).join("")}</section>`;
    }).join("");
    list.innerHTML = `<details class="skill-group skill-group-disclosure">
        <summary class="skill-disclosure-summary"><span>Профессиональный набор${profession ? ` · ${escapeHtml(profession.name)}` : ""}</span><span>${professional.length} навыков</span></summary>
        ${professionalHtml}
      </details>
      <details class="skill-group skill-group-disclosure">
        <summary class="skill-disclosure-summary"><span>Общие навыки</span><span>${general.length}</span></summary>
        ${generalHtml || `<p class="character-empty">Общие навыки не найдены.</p>`}
      </details>
      ${other.length ? `<section class="skill-group"><div class="skill-group-heading"><h3>Дополнительные навыки</h3><span>${other.length}</span></div>${other.map(skillRow).join("")}</section>` : ""}`;
    renderProfessionChoiceFields(profession, character);
    $("#character-profession-skill-note").textContent = profession
      ? `Стартовый набор ${profession.name}: 11 навыков. Дерево развития находится во вкладке «Способности».`
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
    container.innerHTML = `<div class="race-trait-heading"><strong>Особенности расы · ${escapeHtml(character.personal.race)}</strong><span>Игровые эффекты</span></div>
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
      container.innerHTML = `<p class="character-empty">Выберите профессию, чтобы открыть её дерево способностей.</p>`;
      return;
    }
    window.CharacterProfessionTrees.ensureProgress(character, profession.id);
    const branches = tree.branches.map(branch => `<details class="profession-tree-branch">
      <summary><span>${escapeHtml(branch.name)}</span><span>3 способности</span></summary>
      <div class="profession-tree-node-list">${branch.nodes.map((node, index) => {
        const state = window.CharacterProfessionTrees.getNodeState(character, profession.id, branch.id, index);
        return `<div class="profession-tree-node${state.unlocked ? "" : " is-locked"}">
          <div class="profession-tree-node-name"><span>${index + 1}</span><strong>${escapeHtml(node.name)}</strong>${node.attribute ? `<small>${shortAttribute(node.attribute)}</small>` : ""}</div>
          <div class="profession-tree-rank"><button class="tree-rank-button" type="button" data-tree-step="-1" data-tree-profession="${profession.id}" data-tree-branch="${branch.id}" data-tree-index="${index}" aria-label="Уменьшить ранг способности ${escapeHtml(node.name)}"${!state.unlocked || state.rank <= 0 ? " disabled" : ""}>−</button>
            <input data-tree-rank="${profession.id}.${branch.id}.${index}" type="number" min="0" max="10" step="1" value="${state.rank}" aria-label="Ранг способности ${escapeHtml(node.name)}"${!state.unlocked ? " disabled" : ""}>
            <button class="tree-rank-button" type="button" data-tree-step="1" data-tree-profession="${profession.id}" data-tree-branch="${branch.id}" data-tree-index="${index}" aria-label="Увеличить ранг способности ${escapeHtml(node.name)}"${!state.unlocked || state.rank >= 10 ? " disabled" : ""}>＋</button></div>
          <small class="profession-tree-unlock">${state.unlocked ? (index < 2 && state.rank < 5 ? `Следующая способность откроется на ранге ${state.nextUnlockAt}.` : "Доступно") : `Откроется при ранге 5 предыдущей способности.`}</small>
        </div>`;
      }).join("")}</div></details>`).join("");
    container.innerHTML = `<div class="profession-tree-heading"><div><h3>Дерево профессии · ${escapeHtml(profession.name)}</h3><p>Следующий узел открывается при ранге 5 предыдущего.</p></div><span>0–10</span></div><div class="profession-tree-branches">${branches}</div>`;
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
    renderRaceTraits(character);
    renderGeneratedLifePath(character);
    renderProfessionTree(character);
    renderAbilityRows();
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

  function changeProfessionTreeRank(professionId, branchId, index, nextRank) {
    const result = window.CharacterProfessionTrees.setRank(activeCharacter(), professionId, branchId, index, nextRank);
    if (!result.ok) {
      setSaveMessage(result.message, true);
      renderProfessionTree();
      return;
    }
    renderProfessionTree();
    persistStore("Дерево профессии обновлено.");
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

  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  document.querySelectorAll("[data-character-tab]").forEach(button => {
    button.addEventListener("click", () => showCharacterTab(button.dataset.characterTab));
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
    const treeRankControl = event.target.closest("[data-tree-rank]");
    if (treeRankControl) {
      if (event.type !== "change") return true;
      const [professionId, branchId, index] = treeRankControl.dataset.treeRank.split(".");
      changeProfessionTreeRank(professionId, branchId, Number(index), Number(treeRankControl.value));
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
  $("#character-profession-tree").addEventListener("click", event => {
    const button = event.target.closest("[data-tree-step]");
    if (!button) return;
    const professionId = button.dataset.treeProfession;
    const branchId = button.dataset.treeBranch;
    const index = Number(button.dataset.treeIndex);
    const current = activeCharacter().professionTrees?.[professionId]?.branches?.[branchId]?.[index] ?? 0;
    changeProfessionTreeRank(professionId, branchId, index, current + Number(button.dataset.treeStep));
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
  if (sections[initialPage] || initialPage === "inventory" || initialPage.startsWith("characters/")) showPage(initialPage);
})();
