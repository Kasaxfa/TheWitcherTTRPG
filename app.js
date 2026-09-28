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

  const attributeLabels = {
    INT: "Интеллект", REF: "Реакция", DEX: "Ловкость", BODY: "Телосложение",
    SPD: "Скорость", EMP: "Эмпатия", CRA: "Ремесло", WILL: "Воля", LUCK: "Удача",
  };

  function renderCharacterSelector() {
    const select = $("#character-select");
    select.innerHTML = characterStore.characters.map((character, index) => {
      const name = character.personal.name.trim() || `Персонаж ${index + 1}`;
      const suffix = [character.personal.race, character.personal.profession].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(character.characterId)}">${escapeHtml(name)}${suffix ? ` — ${escapeHtml(suffix)}` : ""}</option>`;
    }).join("");
    select.value = characterStore.activeCharacterId;
    $("#delete-character").disabled = characterStore.characters.length <= 1 || !persistenceReady;
    $("#new-character").disabled = !persistenceReady;
    $("#inventory-character-name").textContent = activeCharacter().personal.name.trim() || "Без имени";
  }

  function renderSkillRows() {
    const list = $("#character-skills");
    if (!activeCharacter().skills.length) {
      list.innerHTML = `<p class="character-empty">Навыки пока не добавлены.</p>`;
      return;
    }
    list.innerHTML = activeCharacter().skills.map(skill => `<div class="character-entry skill-entry" data-skill-id="${escapeHtml(skill.id)}">
      <input data-skill-field="name" maxlength="120" value="${escapeHtml(skill.name)}" aria-label="Название навыка">
      <select data-skill-field="attribute" aria-label="Ведущая характеристика"><option value="">Не указана</option>${window.CharacterStore.ATTRIBUTES.map(attribute => `<option value="${attribute}"${skill.attribute === attribute ? " selected" : ""}>${attribute} · ${attributeLabels[attribute]}</option>`).join("")}</select>
      <input data-skill-field="rank" type="number" min="0" max="1000" step="1" value="${skill.rank === null ? "" : escapeHtml(skill.rank)}" aria-label="Рейтинг навыка">
      <button class="character-remove" type="button" data-remove-skill="${escapeHtml(skill.id)}" aria-label="Удалить навык">×</button>
    </div>`).join("");
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
    list.innerHTML = activeCharacter().lifePath.outcomes.map(outcome => `<div class="character-entry life-path-outcome" data-life-path-outcome-id="${escapeHtml(outcome.id)}">
      <select data-life-path-outcome-field="type" aria-label="Тип последствия">${types.map(type => `<option value="${type}"${outcome.type === type ? " selected" : ""}>${type}</option>`).join("")}</select>
      <textarea data-life-path-outcome-field="description" maxlength="20000" rows="2" placeholder="Описание последствия" aria-label="Описание последствия">${escapeHtml(outcome.description)}</textarea>
      <input data-life-path-outcome-field="source" maxlength="2000" value="${escapeHtml(outcome.source)}" placeholder="Источник или заметка" aria-label="Источник или заметка">
      <button class="character-remove" type="button" data-remove-life-path-outcome="${escapeHtml(outcome.id)}" aria-label="Удалить последствие">×</button>
    </div>`).join("");
  }

  function renderCharacterEditor() {
    const character = activeCharacter();
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
    renderCharacterSelector();
    renderSkillRows();
    renderAbilityRows();
    renderLifePathOutcomes();
  }

  function updateCharacterPath(path, value) {
    const parts = path.split(".");
    if (parts.length === 1) activeCharacter()[parts[0]] = value;
    else activeCharacter()[parts[0]][parts[1]] = value;
  }

  function addNewCharacter() {
    const character = window.CharacterStore.createCharacter(`Персонаж ${characterStore.characters.length + 1}`);
    characterStore.characters.push(character);
    characterStore.activeCharacterId = character.characterId;
    inventory = character.equipment;
    renderCharacterEditor();
    renderInventory();
    persistStore("Создан новый персонаж.");
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

  function exportCharacterData() {
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
      downloadJson(window.CharacterStore.createBackup(characterStore), "witcher-characters.json");
      setSaveMessage("Резервная копия персонажей скачана.");
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
    } else skill[control.dataset.skillField] = control.value;
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
    document.querySelectorAll("#character-form input, #character-form select, #character-form textarea, #character-form button, #character-select, #new-character, #delete-character, #inventory-page input, #inventory-page button")
      .forEach(control => { control.disabled = true; });
    $("#export-characters").disabled = false;
    $("#import-characters").disabled = false;
    $("#character-message").textContent = `${persistenceError} Данные в браузере оставлены без изменений; загрузите резервную копию.`;
    $("#character-message").classList.add("is-error");
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

  function updateCharacterFromForm(event) {
    const textControl = event.target.closest("[data-character-path]");
    const numberControl = event.target.closest("[data-character-number]");
    const linesControl = event.target.closest("[data-character-lines]");
    if (textControl) {
      updateCharacterPath(textControl.dataset.characterPath, textControl.value);
      if (textControl.dataset.characterPath.startsWith("personal.")) renderCharacterSelector();
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
    persistStore("Лист персонажа обновлён.", event.type === "change");
  }

  $("#character-form").addEventListener("input", updateCharacterFromForm);
  $("#character-form").addEventListener("change", updateCharacterFromForm);
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
  $("#character-select").addEventListener("change", event => {
    if (!characterStore.characters.some(character => character.characterId === event.target.value)) return;
    persistStore("", true);
    characterStore.activeCharacterId = event.target.value;
    inventory = activeCharacter().equipment;
    renderCharacterEditor();
    renderInventory();
    persistStore("Выбран другой персонаж.");
  });
  $("#new-character").addEventListener("click", addNewCharacter);
  $("#delete-character").addEventListener("click", () => {
    if (characterStore.characters.length <= 1) return;
    const character = activeCharacter();
    const name = character.personal.name.trim() || "Без имени";
    if (!window.confirm(`Удалить персонажа «${name}» и его инвентарь?`)) return;
    characterStore.characters = characterStore.characters.filter(value => value.characterId !== character.characterId);
    characterStore.activeCharacterId = characterStore.characters[0].characterId;
    inventory = activeCharacter().equipment;
    renderCharacterEditor();
    renderInventory();
    persistStore("Персонаж удалён.");
  });
  $("#add-character-skill").addEventListener("click", () => {
    activeCharacter().skills.push({ id: createEntryId(), name: "", attribute: null, rank: null });
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
  $("#export-characters").addEventListener("click", exportCharacterData);
  $("#import-characters").addEventListener("click", () => $("#character-file").click());
  $("#character-file").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ.");
      const payload = JSON.parse(await file.text());
      const imported = window.CharacterStore.parseImport(payload, { cleanLegacyEntry: cleanEntry });
      let candidate;
      if (imported.kind === "characters" && persistenceReady) {
        if (!window.confirm("Заменить текущий список персонажей этим файлом? Сначала скачайте JSON-резервную копию.")) return;
        const currentRaw = localStorage.getItem(window.CharacterStore.STORAGE_KEY);
        if (currentRaw !== null) localStorage.setItem(`${window.CharacterStore.STORAGE_KEY}.pre-import-backup`, currentRaw);
        candidate = imported.store;
      } else if (imported.kind === "legacy-inventory" && persistenceReady) {
        candidate = JSON.parse(JSON.stringify(characterStore));
        const newCharacter = imported.store.characters[0];
        newCharacter.personal.name = `Персонаж ${candidate.characters.length + 1}`;
        candidate.characters.push(newCharacter);
        candidate.activeCharacterId = newCharacter.characterId;
      } else {
        const currentRaw = localStorage.getItem(window.CharacterStore.STORAGE_KEY);
        if (currentRaw !== null) localStorage.setItem(`${window.CharacterStore.STORAGE_KEY}.recovery-backup`, currentRaw);
        candidate = imported.store;
      }
      characterStore = window.CharacterStore.save(localStorage, candidate);
      persistenceReady = true;
      persistenceError = "";
      inventory = activeCharacter().equipment;
      renderCharacterEditor();
      renderInventory();
      lockEditingForInvalidSave();
      setSaveMessage(imported.kind === "legacy-inventory" ? "Старый инвентарь добавлен отдельным персонажем." : "Резервная копия персонажей загружена.");
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
      (activePage === "items" ? $("#item-search") : $("#search")).focus();
    }
    if (event.key === "Escape" && document.activeElement.matches("input[type=search]")) {
      document.activeElement.value = "";
      renderRecipes();
      renderItems();
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
