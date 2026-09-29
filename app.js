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
  const catalogView = window.CatalogView.createCatalogView({ recipes, alchemySymbols, itemById, resolveItemId, escapeHtml, numberText });
  let activePage = "recipes";
  let characterViewMode = "library";
  let activeCharacterTab = "sheet";
  let selectedRecipeId = null;
  let selectedItemId = null;
  let renameTargetCharacterId = null;
  let characterCreationDraft = null;

  function syncCatalogRowSelection(list, selectedId, idAttribute) {
    list.querySelectorAll(`[${idAttribute}]`).forEach(button => {
      const selected = button.getAttribute(idAttribute) === selectedId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function openMobileCatalogDetail(kind) {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    const { listId, detailId } = window.CatalogUi.catalogViewIds(kind);
    const columns = $(`#${listId}`).closest(".catalog-columns");
    columns.classList.add("mobile-detail-open");
    const detail = $(`#${detailId}`);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
    detail.querySelector(".mobile-detail-back").focus({ preventScroll: true });
  }

  function returnToCatalogResults(kind) {
    const { listId } = window.CatalogUi.catalogViewIds(kind);
    const columns = $(`#${listId}`).closest(".catalog-columns");
    columns.classList.remove("mobile-detail-open");
    const list = $(`#${listId}`);
    const selectedId = kind === "recipes" ? selectedRecipeId : selectedItemId;
    const idAttribute = kind === "recipes" ? "data-recipe-id" : "data-item-id";
    requestAnimationFrame(() => {
      const selected = [...list.querySelectorAll(`[${idAttribute}]`)]
        .find(button => button.getAttribute(idAttribute) === selectedId);
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: "nearest" });
    });
    list.closest(".catalog-results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateRecipeFilters() {
    const craft = $("#recipe-domain").value === "craft";
    const type = $("#craft-type-filter").value;
    $("#craft-type-wrap").hidden = !craft;
    $("#recipe-title").textContent = "Рецепты";
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
    if (!visible.some(recipe => recipe.id === selectedRecipeId)) selectedRecipeId = visible[0]?.id || null;
    $("#recipe-list").innerHTML = visible.map(recipe => catalogView.recipeCard(recipe, selectedRecipeId)).join("");
    $("#recipe-empty").hidden = visible.length > 0;
    const detail = $("#recipe-detail");
    detail.hidden = visible.length === 0;
    $("#recipe-detail-content").innerHTML = visible.length ? catalogView.recipeDetail(visible.find(recipe => recipe.id === selectedRecipeId)) : "";
    detail.closest(".catalog-columns").classList.toggle("is-empty", visible.length === 0);
    if (!visible.length) detail.closest(".catalog-columns").classList.remove("mobile-detail-open");
  }

  function setItemFilterOptions(select, placeholder, values) {
    const previous = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = values.includes(previous) ? previous : "";
  }

  function updateItemFilters() {
    const type = $("#item-type-filter").value;
    const isIngredient = type === "ingredient";
    const isEquipment = type === "equipment";
    const ingredients = items.filter(item => item.type === "ingredient");
    const availabilities = [...new Set(ingredients.map(item => item.details?.availability).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const groups = [...new Set(ingredients.map(item => item.details?.alchemy_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const equipmentCategories = [...new Set(items.filter(item => item.type === "equipment")
      .flatMap(item => item.attributes || [])
      .filter(attribute => attribute.code === "equipment_category")
      .map(attribute => attribute.value))].sort((a, b) => a.localeCompare(b, "ru"));
    const normalized = window.CatalogFilters.normalizeItemFilters(type, {
      availability: $("#item-availability-filter").value,
      group: $("#item-group-filter").value,
      equipmentCategory: $("#item-equipment-category-filter").value,
    }, {
      availability: isIngredient && availabilities.length >= 2,
      group: isIngredient && groups.length >= 2,
      equipmentCategory: isEquipment && equipmentCategories.length >= 2,
    });
    $("#item-availability-filter").value = normalized.availability;
    $("#item-group-filter").value = normalized.group;
    $("#item-equipment-category-filter").value = normalized.equipmentCategory;
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
    if (!visible.some(item => item.id === selectedItemId)) selectedItemId = visible[0]?.id || null;
    $("#item-list").innerHTML = visible.map(item => catalogView.itemCard(item, selectedItemId)).join("");
    $("#item-empty").hidden = visible.length > 0;
    const detail = $("#item-detail");
    detail.hidden = visible.length === 0;
    $("#item-detail-content").innerHTML = visible.length ? catalogView.itemDetail(visible.find(item => item.id === selectedItemId)) : "";
    detail.closest(".catalog-columns").classList.toggle("is-empty", visible.length === 0);
    if (!visible.length) detail.closest(".catalog-columns").classList.remove("mobile-detail-open");
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
    const loaded = window.WitcherApi.loadCharacters(localStorage, { cleanLegacyEntry: cleanEntry });
    characterStore = loaded.store;
    if (loaded.migratedLegacyInventory) migrationNotice = "Старый инвентарь перенесён в «Персонаж 1». Исходный JSON сохранён для восстановления.";
    if (loaded.migratedSchemaVersion) migrationNotice = "Формат листа обновлён; исходная версия сохранена в резервной копии браузера.";
  } catch (error) {
    persistenceReady = false;
    persistenceError = error.message || "Не удалось проверить сохранение.";
    characterStore = window.WitcherApi.createCharacterStore("Данные не загружены");
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
        window.WitcherApi.updateCharacterField(activeCharacter(), "updatedAt", new Date().toISOString());
        characterStore = window.WitcherApi.saveCharacters(localStorage, characterStore);
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
    persistStore(message, true);
    renderInventory();
  }

  function inventoryWeight(character = activeCharacter()) {
    return window.WitcherApi.inventoryWeight(character);
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
    const derived = window.WitcherApi.deriveCharacter(activeCharacter(), { carriedWeightKg: knownWeight, unknownWeightCount: unknownCount });
    const capacity = derived.encumbranceKg;
    $("#capacity-readout").textContent = capacity === null ? "—" : numberText(capacity);
    $("#weight-total").textContent = `${numberText(knownWeight)} кг${unknownCount ? " + ?" : ""}`;
    $("#weight-caption").textContent = capacity === null
      ? "введите Тел для расчёта"
      : `из ${numberText(capacity)} кг · расчёт по Тел`;
    const progress = $("#weight-progress");
    const track = $(".weight-track");
    const percent = capacity > 0 ? Math.min(100, knownWeight / capacity * 100) : 0;
    progress.style.width = `${percent}%`;
    track.classList.toggle("over", capacity !== null && capacity > 0 && knownWeight > capacity);
    track.setAttribute("aria-valuenow", String(Math.round(percent)));
    track.setAttribute("aria-valuemax", "100");
    const warnings = [];
    if (unknownCount) warnings.push(`У ${unknownCount} ${unknownCount === 1 ? "позиции" : "позиций"} не указан вес; общий вес показан без них.`);
    if (capacity !== null && knownWeight > capacity) warnings.push("Превышена грузоподъёмность по Тел.");
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
        <label class="sr-only" for="wt-${escapeHtml(entry.id)}">Вес за единицу в килограммах: ${escapeHtml(entry.name)}</label><input id="wt-${escapeHtml(entry.id)}" class="inventory-input inventory-unit" data-field="unitWeightKg" type="number" min="0" step="0.01" value="${entry.unitWeightKg === null ? "" : escapeHtml(entry.unitWeightKg)}" placeholder="Вес, кг" aria-label="Вес за единицу: ${escapeHtml(entry.name)}">
        <label class="sr-only" for="condition-${escapeHtml(entry.id)}">Состояние: ${escapeHtml(entry.name)}</label><input id="condition-${escapeHtml(entry.id)}" class="inventory-input inventory-condition" data-field="conditionNotes" maxlength="2000" value="${escapeHtml(entry.conditionNotes || "")}" placeholder="Состояние" aria-label="Состояние: ${escapeHtml(entry.name)}">
        ${armorRelated ? `<label class="sr-only" for="ev-${escapeHtml(entry.id)}">Переопределить EV брони: ${escapeHtml(entry.name)}</label><input id="ev-${escapeHtml(entry.id)}" class="inventory-input inventory-ev" data-field="armorEv" type="number" min="0" max="100" step="1" value="${entry.armorEv === null || entry.armorEv === undefined ? "" : escapeHtml(entry.armorEv)}" placeholder="EV ${catalogEv === null ? "?" : escapeHtml(catalogEv)}" aria-label="Переопределить EV брони: ${escapeHtml(entry.name)}">` : `<span class="inventory-no-ev">—</span>`}
        <span class="inventory-weight">${total}</span><button class="remove-item" type="button" data-remove="${escapeHtml(entry.id)}" aria-label="Удалить ${escapeHtml(entry.name)}">×</button></div>`;
    }).join("");
    $("#inventory-empty").hidden = inventory.items.length > 0;
    renderCharacterDerived();
    renderCharacterCombatEquipment();
  }

  function addInventoryEntry(entry, separate = false) {
    const result = window.WitcherApi.addInventoryItem(activeCharacter(), entry, separate);
    if (!result.ok) { setSaveMessage(result.message, true); return; }
    inventory = activeCharacter().equipment;
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
    const armor = armorLoadoutStats(character);
    return window.WitcherApi.deriveCharacter(character, {
      carriedWeightKg: weight.knownKg,
      unknownWeightCount: weight.unknownCount,
      armorEv: armor.ev,
      unknownArmorEvCount: armor.unknownCount,
    });
  }

  function armorLoadoutStats(character = activeCharacter()) {
    return window.WitcherApi.armorLoadoutStats(character, (itemId, attribute) => catalogAttribute(itemById.get(itemId), attribute));
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

  function newCharacterCreationDraft() {
    return {
      step: "identity", race: "", professionId: "", age: "", name: "", backgroundMode: "", generatedLifePath: null,
      witcherRisk: "medium", attributeMode: "", attributePool: 70, rolls: null, diceAssignments: {}, attributes: null,
      homeland: "", professionChoices: [], professionLanguageChoices: [], professionRanks: {}, generalRanks: {},
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
      const professionOptions = window.WitcherApi.professions.map(profession => `<option value="${profession.id}"${draft.professionId === profession.id ? " selected" : ""}>${escapeHtml(profession.name)}</option>`).join("");
      body = `<div class="creation-field-grid">
        <label class="field">Раса<select data-creation-field="race"><option value="">Выберите расу</option>${window.WitcherApi.races.map(race => `<option value="${escapeHtml(race)}"${draft.race === race ? " selected" : ""}>${escapeHtml(race)}</option>`).join("")}</select></label>
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
      </div>${draft.backgroundMode === "manual" ? `<label class="field creation-homeland-field">Родина / страна<input data-creation-field="homeland" maxlength="160" value="${escapeHtml(draft.homeland)}" placeholder="Например, Темерия или Махакама"></label><p class="creation-rule-note">Родина определяет родной язык. Нильфгаард, Доль Блатанна и Скеллиге — Старшая Речь; Север — Всеобщий; Махакама — Краснолюдский.</p>` : ""}${draft.race === "Ведьмак" ? `<label class="field creation-risk-field">Риск пути ведьмака<select data-creation-field="witcherRisk"><option value="cautious"${draft.witcherRisk === "cautious" ? " selected" : ""}>Осторожный</option><option value="normal"${draft.witcherRisk === "normal" ? " selected" : ""}>Обычный</option><option value="medium"${draft.witcherRisk === "medium" ? " selected" : ""}>Средний</option><option value="risky"${draft.witcherRisk === "risky" ? " selected" : ""}>Рискованный</option></select></label>` : ""}
        ${draft.backgroundMode === "random" ? `<div class="creation-generated-preview">${generatedDetails || `<button type="button" class="button secondary" data-creation-action="generate-life-path">Бросить события и показать результат</button>`}${randomPath ? `<button type="button" class="text-button" data-creation-action="generate-life-path">Сгенерировать заново</button>` : ""}</div>` : ""}`;
    } else if (draft.step === "attributes") {
      const modeChoices = `<div class="creation-choice-grid compact"><button type="button" class="creation-choice${draft.attributeMode === "dice" ? " selected" : ""}" data-attribute-mode="dice"><strong>Броски 9d10</strong><span>Каждый результат 1 или 2 перебрасывается.</span></button><button type="button" class="creation-choice${draft.attributeMode === "points" ? " selected" : ""}" data-attribute-mode="points"><strong>Распределить очки</strong><span>Выберите пул 60, 70 или 80.</span></button></div>`;
      if (draft.attributeMode === "points") {
        const creationModel = window.WitcherApi.creationView(draft);
        const attributes = creationModel.attributes;
        body = `${modeChoices}<label class="field creation-pool-field">Пул характеристик<select data-creation-field="attributePool">${window.WitcherApi.pointBuyPools.map(pool => `<option value="${pool}"${Number(draft.attributePool) === pool ? " selected" : ""}>${pool}</option>`).join("")}</select></label>
          <div class="creation-budget-readout"><span>Распределено</span><strong id="creation-attribute-spent">${creationModel.attributeSpent} / ${creationModel.attributePool}</strong></div>
          <div class="creation-stat-grid">${window.WitcherApi.attributeCodes.map(code => `<div class="creation-stat-row"><strong>${escapeHtml(attributeLabels[code])}<small>${shortAttribute(code)}</small></strong><button type="button" class="stepper-button" data-attribute-step="-1" data-attribute-code="${code}" aria-label="Уменьшить ${attributeLabels[code]}"${Number(attributes[code]) <= 1 ? " disabled" : ""}>−</button><input data-attribute-point="${code}" type="number" min="1" max="10" step="1" value="${escapeHtml(attributes[code])}" aria-label="${attributeLabels[code]}"><button type="button" class="stepper-button" data-attribute-step="1" data-attribute-code="${code}" aria-label="Увеличить ${attributeLabels[code]}"${!creationModel.canIncreaseAttribute[code] ? " disabled" : ""}>＋</button></div>`).join("")}</div>
          <p class="creation-rule-note">Базовое значение каждой характеристики должно быть 1–10. Расовые модификаторы учитываются отдельно в листе.</p>`;
      } else if (draft.attributeMode === "dice") {
        const rolls = draft.rolls || [];
        const assigned = Object.values(draft.diceAssignments).map(Number);
        body = `${modeChoices}<p class="creation-rule-note">Назначьте каждому параметру один из девяти результатов. Каждый бросок можно использовать только один раз.</p><div class="creation-dice-grid">${window.WitcherApi.attributeCodes.map(code => `<label class="field">${escapeHtml(attributeLabels[code])} · ${shortAttribute(code)}<select data-dice-attribute="${code}"><option value="">Выберите результат</option>${rolls.map((value, rollIndex) => `<option value="${rollIndex}"${Number(draft.diceAssignments[code]) === rollIndex ? " selected" : ""}${assigned.includes(rollIndex) && Number(draft.diceAssignments[code]) !== rollIndex ? " disabled" : ""}>Бросок ${rollIndex + 1}: ${value}</option>`).join("")}</select></label>`).join("")}</div><div class="creation-rolls" aria-label="Результаты бросков">${rolls.map((value, index) => `<span>${index + 1}: <strong>${value}</strong></span>`).join("")}</div>`;
      } else body = `${modeChoices}<p class="creation-rule-note">Сначала выберите способ определения характеристик.</p>`;
    } else if (draft.step === "skills") {
      const creationModel = window.WitcherApi.creationView(draft);
      const professional = creationModel.professional;
      const profession = window.WitcherApi.findProfession(draft.professionId);
      const profSpent = creationModel.professionalSpent;
      const general = creationModel.general;
      const generalSpent = creationModel.generalSpent;
      const generalBudget = creationModel.generalBudget;
      const professionChoiceHtml = profession?.choice ? `<fieldset class="creation-skill-choice"><legend>${escapeHtml(profession.choice.label)}</legend><p>Выберите ровно ${profession.choice.requiredCount} навыков, чтобы получить все профессиональные навыки.</p><div class="profession-choice-grid">${profession.choice.options.map(id => {
        const skill = window.WitcherApi.skillDefinitions.find(value => value.id === id);
        return skill ? `<label class="profession-choice-option"><input type="checkbox" data-creation-profession-choice="${id}"${draft.professionChoices.includes(id) ? " checked" : ""}><span>${escapeHtml(skill.name)}</span><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}</small></label>` : "";
      }).join("")}</div></fieldset>` : "";
      const professionLanguageHtml = profession?.languageChoices ? `<fieldset class="creation-skill-choice"><legend>Профессиональные языки</legend><p>Выберите ${profession.languageChoices} ${profession.languageChoices === 1 ? "язык" : "языка"}. Каждый язык будет отдельным навыком.</p><div class="profession-choice-grid">${window.WitcherApi.languages.map(language => `<label class="profession-choice-option"><input type="checkbox" data-creation-profession-language-choice="${language.id}"${draft.professionLanguageChoices.includes(language.id) ? " checked" : ""}><span>${escapeHtml(language.name)}</span><small>Инт · стоимость ×2</small></label>`).join("")}</div></fieldset>` : "";
      const professionalHtml = creationModel.professionalComplete ? professional.map(skill => creationSkillRow(skill, "profession")).join("") : `<p class="character-empty">Выберите профессиональные навыки и языки выше.</p>`;
      const generalHtml = window.WitcherApi.attributes.filter(code => !["SPD", "LUCK"].includes(code)).map(code => {
        const skills = general.filter(skill => skill.attribute === code);
        return skills.length ? `<details class="creation-skill-group" data-creation-skill-group="${code}"><summary>${escapeHtml(attributeLabels[code])} · ${shortAttribute(code)} <span>${skills.length} навыков</span></summary><div>${skills.map(skill => creationSkillRow(skill, "general")).join("")}</div></details>` : "";
      }).join("");
      const homeland = draft.backgroundMode === "random" ? draft.generatedLifePath?.homeland?.region : draft.homeland;
      const nativeLanguageId = window.WitcherApi.languageForHomeland(homeland, draft.generatedLifePath?.homeland?.origin || "");
      const nativeLanguage = window.WitcherApi.languages.find(language => language.id === nativeLanguageId);
      const homelandPrompt = draft.backgroundMode === "random"
        ? "Укажите родину в личных данных листа, если она не определена случайной предысторией."
        : "Укажите родину на шаге предыстории, чтобы применить бесплатный бонус +8.";
      const nativeLanguageNote = nativeLanguage
        ? `Родной язык: ${nativeLanguage.name} · +8 бесплатно, без расхода очков.`
        : `Родной язык не определён. ${homelandPrompt}`;
      const languageSummary = window.WitcherApi.languages.map(language => {
        const professional = draft.professionLanguageChoices.includes(language.id);
        const status = language.id === nativeLanguageId ? "родной · +8 бесплатно"
          : professional ? "профессиональный навык · ранг распределяется выше"
            : "доступен для прокачки за О.У.";
        return `<div class="creation-language-card${language.id === nativeLanguageId ? " is-native" : ""}"><strong>${escapeHtml(language.name)}</strong><span>${escapeHtml(status)}</span></div>`;
      }).join("");
      body = `${professionChoiceHtml}${professionLanguageHtml}<div class="creation-skill-section"><div class="creation-budget-readout"><span>Профессиональные навыки · рейтинг не ниже 1, максимум ${creationModel.maximumStartingRank} на создании</span><strong>${profSpent} / ${creationModel.professionalBudget}</strong></div><div class="creation-profession-skill-list">${professionalHtml}</div></div>
        <div class="creation-skill-section"><div class="creation-budget-readout"><span>Общие навыки · бюджет Инт + Реа</span><strong>${generalSpent} / ${generalBudget}</strong></div><p class="creation-rule-note">${nativeLanguageNote} Остаток общего бюджета можно не тратить. Языки развиваются отдельно; следующий ранг стоит вдвое дороже и не может превысить общий ранг 10.</p><div class="creation-language-grid">${languageSummary}</div>${generalHtml}</div>`;
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
    const cost = skill.costPerRank;
    const minimum = skill.minimumRank;
    return `<div class="creation-skill-row" data-creation-skill-row="${kind}.${escapeHtml(skill.key)}">
      <div><strong>${escapeHtml(skill.name)}</strong><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}${skill.doubleCost ? " · стоимость ×2" : ""}${skill.defining ? " · определяющий" : ""}</small></div>
      <button type="button" class="stepper-button" data-skill-step="-1" data-skill-kind="${kind}" data-skill-key="${escapeHtml(skill.key)}"${!skill.canDecrease ? " disabled" : ""}>−</button>
      <input data-skill-rank="${kind}.${escapeHtml(skill.key)}" type="number" min="${minimum}" max="${skill.maximumRank}" step="1" value="${skill.rank}" aria-label="Рейтинг: ${escapeHtml(skill.name)}">
      <button type="button" class="stepper-button" data-skill-step="1" data-skill-kind="${kind}" data-skill-key="${escapeHtml(skill.key)}"${!skill.canIncrease ? " disabled" : ""}>＋</button>
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
    syncShellContext();
  }

  function syncShellContext() {
    const editorActive = activePage === "characters" && characterViewMode === "editor";
    $("#top").dataset.view = editorActive ? "character-editor" : activePage === "characters" ? "character-library" : activePage;
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
    window.WitcherApi.setActiveCharacter(characterStore, characterId);
    inventory = character.equipment;
    const catalogChanged = window.WitcherApi.initializeCharacterSkills(character);
    characterViewMode = "editor";
    $("#character-library").hidden = true;
    $("#character-editor").hidden = false;
    syncShellContext();
    renderCharacterEditor();
    showCharacterTab("sheet");
    renderInventory();
    persistStore(catalogChanged ? `Список навыков персонажа «${characterName(character)}» обновлён.` : `Открыт персонаж «${characterName(character)}».`);
  }

  function duplicateCharacter(characterId) {
    if (!persistenceReady) return;
    const source = characterStore.characters.find(character => character.characterId === characterId);
    if (!source) return;
    const copy = window.WitcherApi.copyCharacter(source, uniqueCharacterName(`${source.personal.name.trim() || "Персонаж"} (копия)`));
    window.WitcherApi.addCharacterToStore(characterStore, copy);
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
    const removed = window.WitcherApi.removeCharacterFromStore(characterStore, characterId);
    if (!removed.ok) return;
    if (removed.activeCharacterId === characterStore.activeCharacterId && removed.character.characterId === characterId) {
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
    const profession = window.WitcherApi.findCharacterProfession(character);
    const skillRow = skill => {
      const definition = window.WitcherApi.skillDefinitions.find(entry => entry.id === skill.catalogId);
      const fixed = Boolean(definition || skill.professionSkillId);
      const removable = skill.source === "custom" || skill.source === "other";
      const currentRank = Number.isInteger(skill.rank) ? skill.rank : 0;
      const effectiveRank = currentRank + Number(skill.nativeBonus || 0);
      const sourceLabel = skill.professionSkillId ? "Проф. навык" :
        skill.source === "profession" ? "В наборе профессии" :
        skill.source === "general" ? "Общий навык" : "Свой навык";
      const nameControl = fixed
        ? '<div class="skill-name-field"><button class="skill-settings-trigger" type="button" data-skill-setting-open="' + escapeHtml(skill.id) + '">' + escapeHtml(skill.name) + '</button><span class="skill-source-badge ' + (skill.source === "profession" ? 'is-professional' : '') + '">' + sourceLabel + '</span>' + (definition?.doubleCost ? '<small class="skill-cost-note">Сложный: цена ×2</small>' : '') + '</div>'
        : '<label class="field skill-name-field">Навык<input data-skill-field="name" maxlength="120" value="' + escapeHtml(skill.name) + '" aria-label="Название навыка"></label>';
      const attributeControl = fixed ? '' :
        '<label class="field skill-attribute-field">Характеристика<select data-skill-field="attribute" aria-label="Ведущая характеристика"><option value="">Не указана</option>' +
        window.WitcherApi.attributes.map(code => '<option value="' + code + '"' + (skill.attribute === code ? ' selected' : '') + '>' + escapeHtml(shortAttribute(code) + ' · ' + attributeLabels[code]) + '</option>').join("") +
        '</select></label>';
      const settingsControl = fixed ? '' : '<button class="skill-settings-icon" type="button" data-skill-setting-open="' + escapeHtml(skill.id) + '" aria-label="Настроить навык ' + escapeHtml(skill.name || "без названия") + '" title="Настроить навык">⚙</button>';
      const removeControl = removable
        ? '<button class="character-remove" type="button" data-remove-skill="' + escapeHtml(skill.id) + '" aria-label="Удалить навык ' + escapeHtml(skill.name || "без названия") + '">×</button>'
        : '';
      return '<div class="character-entry skill-entry' + (fixed ? ' catalog-skill-entry' : ' custom-skill-entry') + '" data-skill-id="' + escapeHtml(skill.id) + '">' +
        nameControl + attributeControl +
        '<span class="skill-rank-readout" aria-label="Ранг навыка ' + escapeHtml(skill.name) + '">Ранг <strong>' + effectiveRank + '</strong>' + (skill.nativeBonus ? '<small>родной +8 · бесплатно</small>' : '') + '</span>' +
        '<output class="skill-total" data-skill-total="' + escapeHtml(skill.id) + '"><span>Итог</span><strong>—</strong><small data-skill-bonus></small></output>' +
        settingsControl + removeControl + '</div>';
    };
    const attributes = window.WitcherApi.attributes;
    const groups = attributes.map(attribute => {
      const skills = character.skills.filter(skill => skill.attribute === attribute);
      if (!skills.length) return "";
      const value = window.WitcherApi.calculateAttributes(character)[attribute]?.total;
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
    if (!profession?.choice && !profession?.languageChoices) {
      container.innerHTML = "";
      return;
    }
    const sections = [];
    if (profession.choice) {
      const selected = character.professionSkillChoices?.[profession.id] || [];
      const options = profession.choice.options.map(skillId => {
        const skill = window.WitcherApi.skillDefinitions.find(entry => entry.id === skillId);
        if (!skill) return "";
        const checked = selected.includes(skillId) ? " checked" : "";
        return `<label class="profession-choice-option"><input type="checkbox" data-profession-choice="${escapeHtml(skillId)}"${checked}><span>${escapeHtml(skill.name)}</span><small>${shortAttribute(skill.attribute)} · ${escapeHtml(attributeLabels[skill.attribute])}</small></label>`;
      }).join("");
      sections.push(`<fieldset class="profession-choice-box"><legend>${escapeHtml(profession.choice.label)}</legend><p>Выбрано ${selected.length} из ${profession.choice.requiredCount}. Отметьте любые навыки из списка.</p><div class="profession-choice-grid">${options}</div></fieldset>`);
    }
    if (profession.languageChoices) {
      const selected = character.professionLanguageChoices?.[profession.id] || [];
      const options = window.WitcherApi.languages.map(language => `<label class="profession-choice-option"><input type="checkbox" data-profession-language-choice="${language.id}"${selected.includes(language.id) ? " checked" : ""}><span>${escapeHtml(language.name)}</span><small>Инт · стоимость ×2</small></label>`).join("");
      sections.push(`<fieldset class="profession-choice-box"><legend>Языковые навыки профессии</legend><p>Выбрано ${selected.length} из ${profession.languageChoices}. У каждого языка свой ранг.</p><div class="profession-choice-grid">${options}</div></fieldset>`);
    }
    container.innerHTML = sections.join("");
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
        if (skill?.nativeBonus) parts.push(`родной язык ${signed(skill.nativeBonus)} · бесплатно`);
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
    const profession = window.WitcherApi.findCharacterProfession(character);
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
    return window.WitcherApi.isShieldEquipment(entry, (itemId, attribute) => catalogAttribute(itemById.get(itemId), attribute));
  }

  function combatItemAllowed(entry, kind) {
    return window.WitcherApi.combatItemAllowed(entry, kind, itemId => itemById.get(itemId), (itemId, attribute) => catalogAttribute(itemById.get(itemId), attribute));
  }

  function armorCoversZone(entry, zone) {
    return window.WitcherApi.armorCoversZone(entry, zone, itemId => itemById.get(itemId), (itemId, attribute) => catalogAttribute(itemById.get(itemId), attribute));
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
    const traits = window.WitcherApi.raceTraits[character.personal.race];
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
    const profession = window.WitcherApi.findCharacterProfession(character);
    const tree = profession && window.WitcherApi.professionTrees[profession.id];
    if (!tree) {
      container.innerHTML = '<p class="character-empty">Выберите профессию, чтобы открыть её дерево способностей.</p>';
      return;
    }
    const branches = tree.branches.map(branch => {
      const nodes = branch.nodes.map((node, index) => {
        const state = window.WitcherApi.getProfessionNodeState(character, profession.id, branch.id, index);
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
    const model = window.WitcherApi.getAdvancementView(activeCharacter());
    $("#character-improvement-summary").innerHTML =
      '<div class="improvement-point-card"><span>Начислено</span><strong>' + model.earnedPoints + '</strong></div>' +
      '<div class="improvement-point-card"><span>Применено</span><strong>' + model.spentPoints + '</strong></div>' +
      '<div class="improvement-point-card is-reserved"><span>В черновике</span><strong>' + model.reservedPoints + '</strong></div>' +
      '<div class="improvement-point-card is-available"><span>Свободно</span><strong>' + model.availablePoints + '</strong></div>';
    $("#character-advancement-draft-note").textContent = model.hasDraft
      ? 'Черновик: ' + model.reservedPoints + ' О.У. · нажмите «Применить прокачку», чтобы закрепить изменения.'
      : 'Нет неподтверждённых улучшений.';
    $("#apply-character-improvements").disabled = !model.hasDraft;
    $("#cancel-character-improvements").disabled = !model.hasDraft;

    const attributeRows = model.attributes.map(entry => {
      const description = entry.status === "set-base" ? "Сначала задайте исходное значение"
        : entry.status === "max" ? "Достигнут предел 10" : "Следующий ранг стоит " + entry.cost + " О.У.";
      return '<div class="advancement-row advancement-attribute-row"><div class="advancement-row-title"><strong>' + escapeHtml(attributeLabels[entry.code]) + '</strong><span>' + escapeHtml(shortAttribute(entry.code)) + ' · итог ' + valueOrDash(entry.total) + '</span></div>' +
        '<span class="advancement-current">' + valueOrDash(entry.base) + (entry.pending ? ' → ' + entry.rank + ' <small>(+' + entry.pending + ')</small>' : '') + '</span>' +
        '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-attribute="' + entry.code + '"' + (entry.canUndo ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение характеристики ' + escapeHtml(attributeLabels[entry.code]) + '">−</button>' +
        '<button class="improvement-adjust-button is-add" type="button" data-stage-attribute="' + entry.code + '"' + (entry.canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение характеристики ' + escapeHtml(attributeLabels[entry.code]) + ', стоимость ' + (entry.cost ?? 'недоступно') + ' О.У.">' + (entry.status === "max" ? 'Максимум' : entry.cost === null ? 'Недоступно' : '+1 · ' + entry.cost + ' О.У.') + '</button></div>' +
        '<small class="advancement-cost-note">' + description + '</small></div>';
    }).join("");

    const skillRows = model.skills.map(skill =>
      '<div class="advancement-row advancement-skill-row"><div class="advancement-row-title"><strong>' + escapeHtml(skill.name) + '</strong><span>' + skill.type + (skill.doubleCost ? ' · сложный' : '') + '</span></div>' +
      '<span class="advancement-current">Ранг ' + skill.baseRank + (skill.pending ? ' → <strong>' + skill.rank + '</strong> <small>(+' + skill.pending + ')</small>' : '') + '</span>' +
      '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-skill="' + escapeHtml(skill.id) + '"' + (skill.canUndo ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение навыка ' + escapeHtml(skill.name) + '">−</button>' +
      '<button class="improvement-adjust-button is-add" type="button" data-stage-skill="' + escapeHtml(skill.id) + '"' + (skill.canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение навыка ' + escapeHtml(skill.name) + ', стоимость ' + (skill.cost ?? 'недоступно') + ' О.У.">' + (skill.cost === null ? 'Максимум' : '+1 · ' + skill.cost + ' О.У.') + '</button></div></div>'
    );
    const skillGroups = window.WitcherApi.attributeCodes.map(attribute => {
      const rows = model.skills.filter(skill => skill.attribute === attribute).map(skill => skillRows[model.skills.indexOf(skill)]).join("");
      return rows ? '<section class="advancement-skill-group"><h3>' + escapeHtml(shortAttribute(attribute)) + ' · ' + escapeHtml(attributeLabels[attribute]) + '</h3>' + rows + '</section>' : '';
    }).join("");
    const unassignedRows = model.skills.filter(skill => !window.WitcherApi.attributeCodes.includes(skill.attribute)).map(skill => skillRows[model.skills.indexOf(skill)]).join("");
    const treeGroups = model.treeBranches.length ? model.treeBranches.map(branch => {
      const rows = branch.nodes.map(node => {
        const status = node.status;
        return '<div class="advancement-row advancement-tree-row' + (node.unlocked ? '' : ' is-locked') + '"><div class="advancement-row-title"><strong>' + escapeHtml(node.name) + '</strong><span>Умение дерева · ' + status + '</span></div>' +
          '<span class="advancement-current">Ранг ' + node.baseRank + (node.pending ? ' → <strong>' + node.rank + '</strong> <small>(+' + node.pending + ')</small>' : '') + '</span>' +
          '<div class="advancement-stepper"><button class="improvement-adjust-button" type="button" data-undo-tree-profession="' + node.professionId + '" data-undo-tree-branch="' + node.branchId + '" data-undo-tree-index="' + node.index + '"' + (node.canUndo ? '' : ' disabled') + ' aria-label="Убрать одно черновое улучшение умения ' + escapeHtml(node.name) + '">−</button>' +
          '<button class="improvement-adjust-button is-add" type="button" data-stage-tree-profession="' + node.professionId + '" data-stage-tree-branch="' + node.branchId + '" data-stage-tree-index="' + node.index + '"' + (node.canBuy ? '' : ' disabled') + ' aria-label="Добавить черновое улучшение умения ' + escapeHtml(node.name) + ', стоимость ' + (node.cost ?? 'недоступно') + ' О.У.">' + (!node.unlocked ? 'Закрыто' : node.cost === null ? 'Максимум' : '+1 · ' + node.cost + ' О.У.') + '</button></div></div>';
      }).join("");
      return '<section class="advancement-skill-group advancement-tree-group"><h3>' + escapeHtml(branch.name) + '</h3>' + rows + '</section>';
    }).join("") : '<p class="character-empty">Выберите профессию, чтобы открыть её умения дерева.</p>';
    $("#character-advancement-list").innerHTML = '<section class="advancement-section"><h3>Характеристики</h3><div class="advancement-row-list">' + attributeRows + '</div></section>' +
      '<section class="advancement-section"><h3>Навыки</h3>' + skillGroups + (unassignedRows ? '<div class="advancement-skill-group"><h4>Без характеристики</h4>' + unassignedRows + '</div>' : '') + '</section>' +
      '<section class="advancement-section"><h3>Дерево профессии</h3><p class="character-panel-hint">Ранг 5 открывает следующий узел той же ветви. После открытия можно продолжать прокачивать любой узел до ранга 10.</p>' + treeGroups + '</section>';
  }

  function renderCharacterEditor() {
    const character = activeCharacter();
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
    fillCharacterSelect($("[data-character-select='race']"), "Выберите расу", window.WitcherApi.races.map(value => ({ value, label: value })), personal.race, { keepUnknown: true });
    fillCharacterSelect($("[data-character-select='gender']"), "Не указано", window.WitcherApi.genders.map(value => ({ value, label: value })), personal.gender, { keepUnknown: true });
    const profession = window.WitcherApi.findCharacterProfession(character);
    const professionOptions = window.WitcherApi.professions.map(value => ({ value: value.id, label: value.name }));
    const currentProfessionValue = profession?.id || (personal.profession ? "legacy-profession" : "");
    if (currentProfessionValue === "legacy-profession") professionOptions.push({ value: currentProfessionValue, label: `Сохранённое значение: ${personal.profession}` });
    fillCharacterSelect($("[data-character-select='profession']"), "Выберите профессию", professionOptions, currentProfessionValue);
  }

  function updateCharacterPath(path, value) {
    return window.WitcherApi.updateCharacterField(activeCharacter(), path, value);
  }

  function openAttributeSettings(code) {
    if (!window.WitcherApi.attributes.includes(code)) return;
    const character = activeCharacter();
    const values = window.WitcherApi.calculateAttributes(character)[code];
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
    const definition = window.WitcherApi.skillDefinitions.find(entry => entry.id === skill.catalogId);
    const profession = window.WitcherApi.findCharacterProfession(character);
    const source = skill.professionSkillId ? "Профессиональное умение" :
      skill.source === "profession" ? "Навык стартового набора" :
      skill.source === "general" ? "Общий навык" : "Собственный навык";
    const meta = [source, skill.attribute ? shortAttribute(skill.attribute) + " · " + attributeLabels[skill.attribute] : "Характеристика не указана"];
    if (profession && skill.professionSkillId) meta.push(profession.name);
    if (definition?.doubleCost) meta.push("Сложный навык · стоимость ×2");
    if (skill.nativeBonus) meta.push(`Родной язык · +${skill.nativeBonus} бесплатно`);
    if (skill.languageId === "elder-speech") meta.push("Диалект может влиять на сложность проверки по решению ведущего");
    $("#character-skill-dialog").dataset.skillId = skill.id;
    $("#character-skill-dialog-title").textContent = skill.name || "Собственный навык";
    $("#character-skill-dialog-meta").textContent = meta.join(" · ");
    $("#character-skill-permanent").value = String(skill.permanentModifier ?? 0);
    $("#character-skill-temporary").value = String(skill.temporaryModifier ?? 0);
    $("#character-skill-dialog-rank").textContent = String(Number(skill.rank ?? 0) + Number(skill.nativeBonus ?? 0));
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
    const update = window.WitcherApi.updateCharacterRecord(activeCharacter(), "skills", skill.id, control.dataset.skillSetting, value);
    if (!update.ok) { setSaveMessage(update.message, true); return true; }
    renderCharacterDerived();
    const derived = activeDerivedValues().skills.find(entry => entry.id === skill.id);
    $("#character-skill-dialog-total").textContent = valueOrDash(derived?.total);
    persistStore("Настройки навыка обновлены.", event.type === "change");
    return true;
  }

  function openProfessionSkillDetails(professionId, branchId, index) {
    const tree = window.WitcherApi.professionTrees[professionId];
    const branch = tree?.branches.find(item => item.id === branchId);
    const node = branch?.nodes[index];
    if (!node) return;
    const state = window.WitcherApi.getProfessionNodeState(activeCharacter(), professionId, branchId, index);
    const profession = window.WitcherApi.findProfession(professionId);
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
    if (!window.WitcherApi.attributes.includes(code)) return true;
    const value = control.value === "" ? null : Number(control.value);
    const result = window.WitcherApi.setCharacterAttribute(activeCharacter(), code, part, value);
    if (!result.ok) {
      setSaveMessage(result.message, true);
      control.value = part === "base" ? activeCharacter().attributes[code] ?? "" : activeCharacter().attributeModifiers[code][part];
      return true;
    }
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

  function changeCreationSkill(kind, key, delta) {
    const draft = characterCreationDraft;
    if (!draft) return;
    const allocation = window.WitcherApi.changeCreationSkill(draft, kind, key, delta);
    if (!allocation.ok) {
      setCreationError(allocation.message);
      renderCreationWizard();
      return;
    }
    setCreationError("");
    renderCreationWizard();
  }

  function validateCreationStep() {
    return window.WitcherApi.validateCreationStep(characterCreationDraft);
  }

  function finishCharacterCreation() {
    const draft = characterCreationDraft;
    const result = window.WitcherApi.createCharacterFromDraft(draft, uniqueCharacterName(draft.name.trim() || `Персонаж ${characterStore.characters.length + 1}`));
    if (!result.ok) { setCreationError(result.error); return; }
    const character = result.character;
    window.WitcherApi.addCharacterToStore(characterStore, character);
    inventory = character.equipment;
    characterViewMode = "editor";
    $("#character-library").hidden = true;
    $("#character-editor").hidden = false;
    syncShellContext();
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
      if (draft.step === "attributes" && draft.attributeMode === "dice") {
        window.WitcherApi.rollCreationAttributes(draft);
      }
    }
    const index = creationSteps.findIndex(([id]) => id === draft.step);
    window.WitcherApi.updateCreationField(draft, "step", creationSteps[Math.max(0, Math.min(creationSteps.length - 1, index + direction))][0]);
    setCreationError("");
    renderCreationWizard();
  }

  function generateCreationLifePath() {
    const draft = characterCreationDraft;
    try {
      const generatedLifePath = window.WitcherApi.generateLifePath({
        race: draft.race,
        age: Number(draft.age),
        risk: draft.witcherRisk,
      });
      window.WitcherApi.updateCreationField(draft, "generatedLifePath", generatedLifePath);
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
      const apiKey = key === "profession" ? "professionId" : key;
      const update = window.WitcherApi.updateCreationField(draft, apiKey, field.value);
      if (!update.ok && key !== "attributePool") { setCreationError(update.message); return; }
      if (key === "race") {
        renderCreationWizard();
      } else if (key === "profession") {
        renderCreationWizard();
      } else if (key === "age") {
      } else if (key === "witcherRisk") {
        if (draft.backgroundMode === "random" && draft.generatedLifePath) generateCreationLifePath();
      } else if (key === "attributePool") {
        const result = window.WitcherApi.setCreationAttributePool(draft, Number(field.value));
        if (!result.ok) { setCreationError(result.message); return; }
        renderCreationWizard();
      }
      return;
    }
    const attributeInput = event.target.closest("[data-attribute-point]");
    if (attributeInput && ["input", "change"].includes(event.type)) {
      const value = Number(attributeInput.value);
      if (!Number.isInteger(value)) return;
      draft.attributes ||= window.WitcherApi.balancedAttributes(draft.attributePool);
      const code = attributeInput.dataset.attributePoint;
      const result = window.WitcherApi.changeCreationAttribute(draft, code, value - Number(draft.attributes[code]));
      if (!result.ok) {
        if (event.type === "change") { setCreationError(result.message); renderCreationWizard(); }
        return;
      }
      $("#creation-attribute-spent").textContent = `${result.spent} / ${result.budget}`;
      if (event.type === "change") renderCreationWizard();
      return;
    }
    const diceInput = event.target.closest("[data-dice-attribute]");
    if (diceInput && event.type === "change") {
      if (diceInput.value === "") delete draft.diceAssignments[diceInput.dataset.diceAttribute];
      else {
        const result = window.WitcherApi.assignCreationDie(draft, diceInput.dataset.diceAttribute, Number(diceInput.value));
        if (!result.ok) { setCreationError(result.message); renderCreationWizard(); return; }
      }
      renderCreationWizard();
      return;
    }
    const professionChoice = event.target.closest("[data-creation-profession-choice]");
    if (professionChoice && event.type === "change") {
      const skillId = professionChoice.dataset.creationProfessionChoice;
      const selected = new Set(draft.professionChoices);
      if (professionChoice.checked) selected.add(skillId); else selected.delete(skillId);
      const result = window.WitcherApi.setCreationChoices(draft, "profession", [...selected]);
      if (!result.ok) {
        setCreationError(result.message);
        renderCreationWizard();
        return;
      }
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const professionLanguageChoice = event.target.closest("[data-creation-profession-language-choice]");
    if (professionLanguageChoice && event.type === "change") {
      const languageId = professionLanguageChoice.dataset.creationProfessionLanguageChoice;
      const selected = new Set(draft.professionLanguageChoices);
      if (professionLanguageChoice.checked) selected.add(languageId); else selected.delete(languageId);
      const result = window.WitcherApi.setCreationChoices(draft, "language", [...selected]);
      if (!result.ok) {
        setCreationError(result.message);
        renderCreationWizard();
        return;
      }
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
      const model = window.WitcherApi.creationView(draft);
      const list = kind === "profession" ? model.professional : model.general;
      const current = list.find(entry => entry.key === key)?.rank;
      if (current !== undefined) changeCreationSkill(kind, key, Number(skillInput.value) - Number(current));
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
      window.WitcherApi.updateCreationField(draft, "backgroundMode", background.dataset.creationBackground);
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const attributeMode = event.target.closest("[data-attribute-mode]");
    if (attributeMode) {
      const modeResult = window.WitcherApi.setCreationAttributeMode(draft, attributeMode.dataset.attributeMode);
      if (!modeResult.ok) { setCreationError(modeResult.message); return; }
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const attributeStep = event.target.closest("[data-attribute-step]");
    if (attributeStep) {
      const code = attributeStep.dataset.attributeCode;
      draft.attributes ||= window.WitcherApi.balancedAttributes(draft.attributePool);
      const result = window.WitcherApi.changeCreationAttribute(draft, code, Number(attributeStep.dataset.attributeStep));
      if (!result.ok) { setCreationError(result.message); return; }
      setCreationError("");
      renderCreationWizard();
      return;
    }
    const skillStep = event.target.closest("[data-skill-step]");
    if (skillStep) {
      const kind = skillStep.dataset.skillKind;
      const key = skillStep.dataset.skillKey;
      const model = window.WitcherApi.creationView(draft);
      const skills = kind === "profession" ? model.professional : model.general;
      if (skills.some(entry => entry.key === key)) changeCreationSkill(kind, key, Number(skillStep.dataset.skillStep));
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
    try { raw = window.WitcherApi.readRaw(localStorage, window.WitcherApi.storageKeys.characters); }
    catch (error) { setSaveMessage(`Браузер не разрешил прочитать сохранение: ${error.message || "ошибка хранилища"}`, true); return; }
    if (raw !== null) {
      try { window.WitcherApi.writeRaw(localStorage, `${window.WitcherApi.storageKeys.characters}.recovery-backup-${Date.now()}`, raw); }
      catch { downloadRawRecoveryBackup(raw); }
    }
    const candidate = window.WitcherApi.createCharacterStore("Персонаж 1");
    window.WitcherApi.initializeCharacterSkills(candidate.characters[0]);
    try {
      characterStore = window.WitcherApi.saveCharacters(localStorage, candidate);
      persistenceReady = true;
      persistenceError = "";
      inventory = activeCharacter().equipment;
      characterViewMode = "editor";
      $("#character-library").hidden = true;
      $("#character-editor").hidden = false;
      syncShellContext();
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
        const raw = window.WitcherApi.readRaw(localStorage, window.WitcherApi.storageKeys.characters) ?? window.WitcherApi.readRaw(localStorage, window.WitcherApi.storageKeys.legacyInventory);
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
      const backup = window.WitcherApi.createBackup(payload);
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
      const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "skills", skill.id, control.dataset.skillField, value);
      if (!result.ok) { setSaveMessage(result.message, true); return true; }
    } else {
      const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "skills", skill.id, control.dataset.skillField, control.value);
      if (!result.ok) { setSaveMessage(result.message, true); return true; }
    }
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
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "abilities", ability.id, control.dataset.abilityField, control.value);
    if (!result.ok) return true;
    persistStore("Способности обновлены.", event.type === "change");
    return true;
  }

  function updateLifePathOutcomeFromControl(event) {
    const control = event.target.closest("[data-life-path-outcome-field]");
    if (!control) return false;
    const row = control.closest("[data-life-path-outcome-id]");
    const outcome = activeCharacter().lifePath.outcomes.find(value => value.id === row?.dataset.lifePathOutcomeId);
    if (!outcome) return true;
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "outcomes", outcome.id, control.dataset.lifePathOutcomeField, control.value);
    if (!result.ok) return true;
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
    if (page !== activePage) document.querySelectorAll(".catalog-columns.mobile-detail-open").forEach(columns => columns.classList.remove("mobile-detail-open"));
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
    syncShellContext();
    if (page === "characters" && requestedTab) showCharacterTab(requestedTab, false);
    document.title = `${sections[page]} — Кодекс ремесленника`;
    history.replaceState(null, "", `#${page}${page === "characters" && requestedTab ? `/${requestedTab}` : ""}`);
  }

  function openCatalogItem(itemId) {
    const id = resolveItemId(itemId);
    const item = itemById.get(id);
    if (!item) return;
    $("#item-search").value = item.name;
    selectedItemId = id;
    $("#item-type-filter").value = "";
    $("#item-availability-filter").value = "";
    $("#item-group-filter").value = "";
    $("#item-equipment-category-filter").value = "";
    updateItemFilters();
    renderItems();
    showPage("items");
    openMobileCatalogDetail("items");
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
    selectedRecipeId = recipe.id;
    renderRecipes();
    showPage("recipes");
    openMobileCatalogDetail("recipes");
  }

  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
  $("#recipe-list").addEventListener("click", event => {
    const button = event.target.closest("[data-recipe-id]");
    if (!button) return;
    selectedRecipeId = button.dataset.recipeId;
    syncCatalogRowSelection($("#recipe-list"), selectedRecipeId, "data-recipe-id");
    $("#recipe-detail-content").innerHTML = catalogView.recipeDetail(recipes.find(recipe => recipe.id === selectedRecipeId));
    openMobileCatalogDetail("recipes");
  });
  $("#item-list").addEventListener("click", event => {
    const button = event.target.closest("[data-item-id]");
    if (!button) return;
    selectedItemId = button.dataset.itemId;
    syncCatalogRowSelection($("#item-list"), selectedItemId, "data-item-id");
    $("#item-detail-content").innerHTML = catalogView.itemDetail(items.find(item => item.id === selectedItemId));
    openMobileCatalogDetail("items");
  });
  document.addEventListener("click", event => {
    const backButton = event.target.closest("[data-catalog-back]");
    if (backButton) {
      returnToCatalogResults(backButton.dataset.catalogBack);
      return;
    }
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
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-character-tab]")];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length;
    showCharacterTab(tabs[nextIndex].dataset.characterTab, true, true);
  });

  function updateCharacterFromForm(event) {
    const relativeNameControl = event.target.closest("[data-generated-relative-name]");
    if (relativeNameControl) {
      if (!['input', 'change'].includes(event.type)) return true;
      const result = window.WitcherApi.updateGeneratedRelativeName(activeCharacter(), relativeNameControl.dataset.generatedRelativeName, relativeNameControl.value);
      if (result.ok) {
        persistStore("Имя персонажа из предыстории сохранено.", event.type === "change");
      }
      return true;
    }
    const selectControl = event.target.closest("[data-character-select]");
    const professionChoice = event.target.closest("[data-profession-choice]");
    if (professionChoice) {
      if (event.type !== "change") return true;
      const character = activeCharacter();
      const profession = window.WitcherApi.findCharacterProfession(character);
      if (!profession?.choice) return true;
      const selected = [...(character.professionSkillChoices?.[profession.id] || [])];
      const skillId = professionChoice.dataset.professionChoice;
      const next = professionChoice.checked
        ? [...new Set([...selected, skillId])]
        : selected.filter(value => value !== skillId);
      const result = window.WitcherApi.setProfessionChoices(character, profession.id, next);
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
    const professionLanguageChoice = event.target.closest("[data-profession-language-choice]");
    if (professionLanguageChoice) {
      if (event.type !== "change") return true;
      const character = activeCharacter();
      const profession = window.WitcherApi.findCharacterProfession(character);
      if (!profession?.languageChoices) return true;
      const selected = [...(character.professionLanguageChoices?.[profession.id] || [])];
      const languageId = professionLanguageChoice.dataset.professionLanguageChoice;
      const next = professionLanguageChoice.checked
        ? [...new Set([...selected, languageId])]
        : selected.filter(value => value !== languageId);
      const result = window.WitcherApi.setProfessionLanguageChoices(character, profession.id, next);
      if (!result.ok) {
        setSaveMessage(result.message, true);
        renderProfessionChoiceFields(profession, character);
        return true;
      }
      renderSkillRows();
      renderCharacterDerived();
      persistStore("Профессиональные языки обновлены.");
      return true;
    }
    if (selectControl) {
      if (event.type !== "change") return true;
      const character = activeCharacter();
      const selection = selectControl.dataset.characterSelect;
      const nextRace = selection === "race" ? selectControl.value : character.personal.race;
      const currentProfession = window.WitcherApi.findCharacterProfession(character);
      const nextProfessionId = selection === "profession" ? selectControl.value : currentProfession?.id || "";
      if (nextRace && nextProfessionId && !window.WitcherApi.validRaceProfession(nextRace, nextProfessionId)) {
        setSaveMessage("Эта раса несовместима с выбранной профессией по правилам.", true);
        renderCharacterSelects(character);
        return true;
      }
      if (selection === "race") {
        const result = window.WitcherApi.setCharacterRace(character, selectControl.value);
        if (!result.ok) { setSaveMessage(result.message, true); renderCharacterSelects(character); return true; }
      } else if (selection === "gender") {
        const result = window.WitcherApi.updateCharacterField(character, "personal.gender", selectControl.value);
        if (!result.ok) { setSaveMessage(result.message, true); return true; }
      } else if (selection === "profession") {
        if (selectControl.value === "legacy-profession") return true;
        const result = window.WitcherApi.setCharacterProfession(character, selectControl.value);
        if (!result.ok) {
          setSaveMessage(result.message, true);
          renderCharacterSelects(character);
          return true;
        }
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
      if (!window.WitcherApi.validAttributeValue(part, value)) return;
      const result = window.WitcherApi.setCharacterAttribute(activeCharacter(), code, part, value);
      if (!result.ok) { setSaveMessage(result.message, true); return; }
    } else if (textControl) {
      updateCharacterPath(textControl.dataset.characterPath, textControl.value);
      if (textControl.dataset.characterPath === "personal.homeland" && event.type === "change") {
        window.WitcherApi.applyNativeLanguage(activeCharacter());
        renderSkillRows();
      }
      if (textControl.dataset.characterPath === "personal.name") {
        $("#character-editor-name").textContent = textControl.value.trim() || "Без имени";
        $("#inventory-character-name").textContent = textControl.value.trim() || "Без имени";
      }
    } else if (numberControl) {
      const value = numberControl.value === "" ? null : Number(numberControl.value);
      const [section, key] = numberControl.dataset.characterNumber.split(".");
      const result = window.WitcherApi.updateCharacterField(activeCharacter(), `${section}.${key}`, value);
      if (!result.ok) { setSaveMessage(result.message, true); return; }
    } else if (linesControl) {
      const [section, key] = linesControl.dataset.characterLines.split(".");
      const result = window.WitcherApi.updateCharacterField(activeCharacter(), `${section}.${key}`, linesControl.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
      if (!result.ok) { setSaveMessage(result.message, true); return; }
    } else if (event.target.id === "character-conditions") {
      const result = window.WitcherApi.updateCharacterField(activeCharacter(), "state.conditions", event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
      if (!result.ok) { setSaveMessage(result.message, true); return; }
    } else return;
    renderCharacterDerived();
    persistStore("Лист персонажа обновлён.", event.type === "change");
  }

  $("#character-form").addEventListener("input", updateCharacterFromForm);
  $("#character-form").addEventListener("change", updateCharacterFromForm);
  $("#start-character-session").addEventListener("click", () => {
    const luck = window.WitcherApi.calculateAttributes(activeCharacter()).LUCK.total;
    if (luck === null || luck < 0) {
      setSaveMessage("Сначала укажите характеристику Удачи.", true);
      return;
    }
    window.WitcherApi.updateCharacterField(activeCharacter(), "state.currentLuck", luck);
    renderCharacterEditor();
    persistStore(`Новая сессия начата. Удача восстановлена до ${numberText(luck)}.`);
  });
  $("#add-character-wound").addEventListener("click", () => {
    window.WitcherApi.addCharacterRecord(activeCharacter(), "wounds", { id: createEntryId(), location: "other", title: "", description: "", status: "active" });
    renderCharacterWounds();
    persistStore("Добавлено ранение.");
    [...$("#character-wounds").querySelectorAll('[data-wound-field="title"]')].at(-1)?.focus();
  });
  $("#character-wounds").addEventListener("input", event => {
    const control = event.target.closest("[data-wound-field]");
    const wound = activeCharacter().state.wounds.find(entry => entry.id === control?.closest("[data-wound-id]")?.dataset.woundId);
    if (!control || !wound) return;
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "wounds", wound.id, control.dataset.woundField, control.value);
    if (!result.ok) return;
    persistStore("Ранение обновлено.", false);
  });
  $("#character-wounds").addEventListener("change", event => {
    const control = event.target.closest("[data-wound-field]");
    const wound = activeCharacter().state.wounds.find(entry => entry.id === control?.closest("[data-wound-id]")?.dataset.woundId);
    if (!control || !wound) return;
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "wounds", wound.id, control.dataset.woundField, control.value);
    if (!result.ok) return;
    persistStore("Ранение обновлено.");
  });
  $("#character-wounds").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-wound]");
    if (!button) return;
    window.WitcherApi.removeCharacterRecord(activeCharacter(), "wounds", button.dataset.removeWound);
    renderCharacterWounds();
    persistStore("Ранение удалено.");
  });
  $("#add-character-combat-weapon").addEventListener("click", () => {
    const result = window.WitcherApi.addCombatWeapon(activeCharacter(), createEntryId());
    if (!result.ok) return;
    renderCharacterCombatEquipment();
    persistStore("Добавлен слот оружия.");
  });
  $("#character-combat-weapons").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-combat-weapons").addEventListener("change", updateCombatEquipmentFromControl);
  $("#character-combat-weapons").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-combat-weapon]");
    if (!button) return;
    window.WitcherApi.removeCombatWeapon(activeCharacter(), button.dataset.removeCombatWeapon);
    renderCharacterCombatEquipment();
    renderCharacterDerived();
    persistStore("Слот оружия удалён.");
  });
  $("#character-armor-zones").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-armor-zones").addEventListener("change", updateCombatEquipmentFromControl);
  $("#add-character-shield").addEventListener("click", () => {
    const result = window.WitcherApi.setCombatShield(activeCharacter(), { inventoryEntryId: null, currentSP: null, damage: "" });
    if (!result.ok) return;
    renderCharacterCombatEquipment();
    persistStore("Добавлен слот щита.");
  });
  $("#character-combat-shield").addEventListener("input", updateCombatEquipmentFromControl);
  $("#character-combat-shield").addEventListener("change", updateCombatEquipmentFromControl);
  $("#character-combat-shield").addEventListener("click", event => {
    if (!event.target.closest("[data-remove-character-shield]")) return;
    window.WitcherApi.setCombatShield(activeCharacter(), null);
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
        const entry = character.equipment.items.find(item => item.id === target.value);
        const catalog = combatInventoryItem(entry || {});
        const baseSP = catalogAttribute(catalog, "armor_rating");
        window.WitcherApi.setCombatSlotField(character, "armor", armorRow.dataset.armorZone, "inventoryEntryId", target.value, { armorRating: baseSP });
      } else {
        const field = target.dataset.armorZoneField;
        if (!field) return;
        const result = window.WitcherApi.setCombatSlotField(character, "armor", armorRow.dataset.armorZone, field, target.value);
        if (!result.ok) { setSaveMessage(result.message, true); return; }
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
      let result;
      if (field === "inventoryEntryId") {
        const entry = character.equipment.items.find(item => item.id === target.value);
        const item = combatInventoryItem(entry || {});
        result = window.WitcherApi.setCombatSlotField(character, "weapon", weapon.id, field, target.value, { name: entry?.name, reliability: catalogAttribute(item, "reliability") });
      } else result = window.WitcherApi.setCombatSlotField(character, "weapon", weapon.id, field, target.value);
      if (!result.ok) { setSaveMessage(result.message, true); renderCharacterCombatEquipment(); return; }
      if (event.type === "change") {
        renderCharacterCombatEquipment();
        renderCharacterDerived();
      }
      persistStore("Оружие обновлено.", event.type === "change");
      return;
    }
    const shieldControl = target.closest("[data-shield-field]");
    if (shieldControl && character.equipment.combat.shield) {
      const field = shieldControl.dataset.shieldField;
      const result = window.WitcherApi.setCombatSlotField(character, "shield", "shield", field, shieldControl.value);
      if (!result.ok) { setSaveMessage(result.message, true); return; }
      if (event.type === "change") renderCharacterCombatEquipment();
      persistStore("Щит обновлён.", event.type === "change");
    }
  }
  $("#add-character-magic-entry").addEventListener("click", () => {
    window.WitcherApi.addCharacterRecord(activeCharacter(), "magicEntries", { id: createEntryId(), kind: "spell", name: "", catalogRef: null, cost: "", effect: "", range: "", duration: "", time: "", difficulty: "", components: "", notes: "" });
    renderMagicEntries();
    persistStore("Добавлена магическая запись.");
    [...$("#character-magic-entries").querySelectorAll('[data-magic-field="name"]')].at(-1)?.focus();
  });
  $("#character-magic-entries").addEventListener("input", updateMagicEntryFromControl);
  $("#character-magic-entries").addEventListener("change", updateMagicEntryFromControl);
  $("#character-magic-entries").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-magic-entry]");
    if (!button) return;
    window.WitcherApi.removeCharacterRecord(activeCharacter(), "magicEntries", button.dataset.removeMagicEntry);
    renderMagicEntries();
    persistStore("Магическая запись удалена.");
  });
  function updateMagicEntryFromControl(event) {
    const target = event.target;
    const entry = activeCharacter().magic.entries.find(value => value.id === target.closest("[data-magic-entry-id]")?.dataset.magicEntryId);
    if (!entry) return;
    if (target.matches("[data-magic-catalog-search]")) {
      const reference = findMagicCatalogRef(target.value);
      window.WitcherApi.updateCharacterRecord(activeCharacter(), "magicEntries", entry.id, "catalogRef", reference);
      if (reference && !entry.name.trim()) window.WitcherApi.updateCharacterRecord(activeCharacter(), "magicEntries", entry.id, "name", reference.name);
      if (event.type === "change") renderMagicEntries();
      persistStore("Связь с каталогом обновлена.", event.type === "change");
      return;
    }
    const field = target.dataset.magicField;
    if (!field) return;
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "magicEntries", entry.id, field, target.value);
    if (!result.ok) { setSaveMessage(result.message, true); return; }
    persistStore("Магическая запись обновлена.", event.type === "change");
  }
  $("#character-development-panel").addEventListener("click", event => {
    const applyButton = event.target.closest("#apply-character-improvements");
    const cancelButton = event.target.closest("#cancel-character-improvements");
    if (applyButton || cancelButton) {
      const result = applyButton
        ? window.WitcherApi.applyAdvancement(activeCharacter())
        : window.WitcherApi.cancelAdvancement(activeCharacter());
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
      result = window.WitcherApi.stageImprovement(activeCharacter(), "attribute", stageAttribute.dataset.stageAttribute);
    } else if (undoAttribute) {
      result = window.WitcherApi.undoImprovement(activeCharacter(), "attribute", undoAttribute.dataset.undoAttribute);
    } else if (stageSkill || undoSkill) {
      const skillId = stageSkill?.dataset.stageSkill || undoSkill.dataset.undoSkill;
      result = stageSkill
        ? window.WitcherApi.stageImprovement(activeCharacter(), "skill", skillId)
        : window.WitcherApi.undoImprovement(activeCharacter(), "skill", skillId);
    } else {
      const button = stageTree || undoTree;
      const detail = stageTree
        ? { professionId: button.dataset.stageTreeProfession, branchId: button.dataset.stageTreeBranch, index: Number(button.dataset.stageTreeIndex) }
        : { professionId: button.dataset.undoTreeProfession, branchId: button.dataset.undoTreeBranch, index: Number(button.dataset.undoTreeIndex) };
      result = stageTree
        ? window.WitcherApi.stageImprovement(activeCharacter(), "professionAbility", null, detail)
        : window.WitcherApi.undoImprovement(activeCharacter(), "professionAbility", null, detail);
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
    const result = window.WitcherApi.awardImprovementPoints(activeCharacter(), input.value);
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
    window.WitcherApi.updateCharacterField(character, "personal.name", name);
    window.WitcherApi.updateCharacterField(character, "updatedAt", new Date().toISOString());
    $("#character-editor-name").textContent = name;
    $("#inventory-character-name").textContent = name;
    renderCharacterLibrary();
    persistStore(`Персонаж переименован в «${name}».`);
    $("#rename-character-dialog").close();
  });
  $("#add-life-path-outcome").addEventListener("click", () => {
    window.WitcherApi.addCharacterRecord(activeCharacter(), "outcomes", { id: createEntryId(), type: "Событие", description: "", source: "" });
    renderLifePathOutcomes();
    persistStore("Добавлено последствие жизненного пути.");
    [...$("#character-life-path-outcomes").querySelectorAll('[data-life-path-outcome-field="description"]')].at(-1)?.focus();
  });
  $("#character-life-path-outcomes").addEventListener("input", updateLifePathOutcomeFromControl);
  $("#character-life-path-outcomes").addEventListener("change", updateLifePathOutcomeFromControl);
  $("#character-life-path-outcomes").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-life-path-outcome]");
    if (!button) return;
    window.WitcherApi.removeCharacterRecord(activeCharacter(), "outcomes", button.dataset.removeLifePathOutcome);
    renderLifePathOutcomes();
    persistStore("Последствие жизненного пути удалено.");
  });
  $("#add-character-skill").addEventListener("click", () => {
    window.WitcherApi.addCharacterRecord(activeCharacter(), "skills", { id: createEntryId(), name: "", attribute: null, rank: 0, permanentModifier: 0, temporaryModifier: 0, source: "custom" });
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
    while (window.WitcherApi.getAdvancementView(character).skills.find(entry => entry.id === button.dataset.removeSkill)?.pending > 0) {
      const undone = window.WitcherApi.undoImprovement(character, "skill", button.dataset.removeSkill);
      if (!undone.ok) break;
    }
    window.WitcherApi.removeSkill(character, button.dataset.removeSkill);
    renderSkillRows();
    renderCharacterAdvancement();
    persistStore("Навык удалён.");
  });
  $("#add-character-ability").addEventListener("click", () => {
    window.WitcherApi.addCharacterRecord(activeCharacter(), "abilities", { id: createEntryId(), name: "", description: "" });
    renderAbilityRows();
    persistStore("Добавлена способность.");
    [...$("#character-abilities").querySelectorAll('[data-ability-field="name"]')].at(-1)?.focus();
  });
  $("#character-abilities").addEventListener("input", updateAbilityFromControl);
  $("#character-abilities").addEventListener("change", updateAbilityFromControl);
  $("#character-abilities").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-ability]");
    if (!button) return;
    window.WitcherApi.removeCharacterRecord(activeCharacter(), "abilities", button.dataset.removeAbility);
    renderAbilityRows();
    persistStore("Способность удалена.");
  });
  $("#character-file").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ.");
      const payload = JSON.parse(await file.text());
      const imported = window.WitcherApi.parseImport(payload, { cleanLegacyEntry: cleanEntry });
      let candidate;
      let resultMessage = "Резервная копия персонажей загружена.";
      if (imported.kind === "characters" && persistenceReady) {
        if (imported.store.characters.length === 1) {
          const incoming = imported.store.characters[0];
          if (!window.confirm(`Добавить персонажа «${characterName(incoming)}» в список?`)) return;
          candidate = JSON.parse(JSON.stringify(characterStore));
          const added = candidate.characters.some(character => character.characterId === incoming.characterId)
            ? window.WitcherApi.copyCharacter(incoming, uniqueCharacterName(`${incoming.personal.name.trim() || "Персонаж"} (копия)`))
            : incoming;
          window.WitcherApi.addCharacterToStore(candidate, added);
          resultMessage = `Персонаж «${characterName(added)}» добавлен из JSON.`;
        } else {
          if (!window.confirm("Заменить текущий список персонажей этим файлом? Перед заменой текущие данные сохранятся в браузере.")) return;
          window.WitcherApi.backupRaw(localStorage, window.WitcherApi.storageKeys.characters, `${window.WitcherApi.storageKeys.characters}.pre-import-backup`);
          candidate = imported.store;
          resultMessage = "Список персонажей восстановлен из JSON.";
        }
      } else if (imported.kind === "legacy-inventory" && persistenceReady) {
        candidate = JSON.parse(JSON.stringify(characterStore));
        const newCharacter = imported.store.characters[0];
        window.WitcherApi.updateCharacterField(newCharacter, "personal.name", uniqueCharacterName(`Персонаж ${candidate.characters.length + 1}`));
        window.WitcherApi.addCharacterToStore(candidate, newCharacter);
        resultMessage = "Старый инвентарь добавлен отдельным персонажем.";
      } else {
        window.WitcherApi.backupRaw(localStorage, window.WitcherApi.storageKeys.characters, `${window.WitcherApi.storageKeys.characters}.recovery-backup`);
        candidate = imported.store;
        resultMessage = imported.kind === "legacy-inventory" ? "Старый инвентарь восстановлен как первый персонаж." : "Список персонажей восстановлен из JSON.";
      }
      characterStore = window.WitcherApi.saveCharacters(localStorage, candidate);
      persistenceReady = true;
      persistenceError = "";
      inventory = activeCharacter().equipment;
      characterViewMode = "library";
      $("#character-library").hidden = false;
      $("#character-editor").hidden = true;
      syncShellContext();
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
    const cleared = window.CatalogFilters.clearItemFilters();
    $("#item-search").value = "";
    $("#item-type-filter").value = cleared.type;
    $("#item-availability-filter").value = cleared.availability;
    $("#item-group-filter").value = cleared.group;
    $("#item-equipment-category-filter").value = cleared.equipmentCategory;
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
  $("#inventory-list").addEventListener("change", event => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const row = input.closest("[data-entry-id]");
    const entry = inventory.items.find(item => item.id === row.dataset.entryId);
    if (!entry) return;
    const field = input.dataset.field;
    const result = window.WitcherApi.updateCharacterRecord(activeCharacter(), "inventoryItems", entry.id, field, field === "conditionNotes" ? input.value.slice(0, 2000) : input.value);
    if (!result.ok) { input.value = entry[field] ?? ""; return; }
    saveInventory("Изменения сохранены.");
  });
  $("#inventory-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    window.WitcherApi.removeInventoryItem(activeCharacter(), button.dataset.remove);
    saveInventory("Предмет удалён.");
  });
  $("#clear-inventory").addEventListener("click", () => {
    if (!inventory.items.length || !window.confirm("Удалить все предметы из инвентаря?")) return;
    window.WitcherApi.clearInventory(activeCharacter());
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
