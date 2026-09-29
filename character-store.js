(function (root, factory) {
  const skillCatalog = typeof module !== "undefined" && module.exports
    ? require("./character-skills.js")
    : null;
  const store = factory(skillCatalog);
  if (typeof module !== "undefined" && module.exports) module.exports = store;
  if (root) root.CharacterStore = store;
})(typeof globalThis !== "undefined" ? globalThis : this, function (initialSkillCatalog) {
  "use strict";

  const FORMAT = "witcher-workshop-characters";
  const SCHEMA_VERSION = 9;
  const STORAGE_KEY = "witcher-workshop-characters-v1";
  const LEGACY_INVENTORY_KEY = "witcher-workshop-inventory-v1";
  const RULES_VERSION = "witcher-core-russian-errata-v5";
  const ATTRIBUTES = ["INT", "REF", "DEX", "BODY", "SPD", "EMP", "CRA", "WILL", "LUCK"];
  const ATTRIBUTE_SET = new Set(ATTRIBUTES);
  const BODY_ZONES = ["head", "torso", "rightArm", "leftArm", "rightLeg", "leftLeg"];
  const WOUND_STATUSES = new Set(["active", "treated", "healed"]);
  const MAGIC_KINDS = new Set(["spell", "sign", "invocation", "hex", "ritual", "alchemy", "other"]);
  const MAGIC_CATALOG_TYPES = new Set(["item", "recipe"]);
  const CUSTOM_EQUIPMENT_CATEGORIES = new Set(["other", "weapon", "armor", "shield"]);

  function createAttributeModifiers() {
    return Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, { permanent: 0, temporary: 0 }]));
  }

  function createCombatEquipment() {
    return {
      armorByZone: Object.fromEntries(BODY_ZONES.map(zone => [zone, { inventoryEntryId: null, currentSP: null, damage: "" }])),
      weapons: [],
      shield: { inventoryEntryId: null, currentSP: null, damage: "" },
    };
  }

  function createMagic() {
    return { energyBase: null, energyCurrent: null, vigor: null, vigorModifier: null, focus: null, entries: [] };
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `character-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function boundedString(value, label, max = 20000, allowEmpty = true) {
    if (typeof value !== "string") throw new Error(`${label}: ожидалась строка.`);
    if (value.length > max) throw new Error(`${label}: превышена допустимая длина.`);
    if (!allowEmpty && !value.trim()) throw new Error(`${label}: поле не может быть пустым.`);
    return value;
  }

  function optionalNumber(value, label, { min = 0, max = 100000 } = {}) {
    if (value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label}: недопустимое число.`);
    return number;
  }

  function createCharacter(name = "Новый персонаж") {
    const now = new Date().toISOString();
    return {
      characterId: makeId(),
      schemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION,
      createdAt: now,
      updatedAt: now,
      personal: {
        name,
        player: "",
        race: "",
        gender: "",
        age: "",
        homeland: "",
        location: "",
        profession: "",
        professionId: "",
      },
      lifePath: {
        familyHistory: "",
        familyStation: "",
        parents: "",
        siblings: "",
        decadeEvents: [],
        allies: [],
        enemies: [],
        relationships: [],
        addictionTrauma: "",
        style: "",
        values: "",
        outcomes: [],
        generated: null,
      },
      attributes: Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, null])),
      attributeModifiers: createAttributeModifiers(),
      skills: [],
      professionSkillChoices: {},
      professionLanguageChoices: {},
      professionTrees: {},
      creation: {},
      development: { earnedPoints: 0, availablePoints: 0, draft: { attributes: {}, skills: {}, professionAbilities: {} } },
      state: {
        currentHp: null,
        currentSta: null,
        currentLuck: null,
        currentReputation: null,
        reputationNotes: "",
        conditions: [],
        wounds: [],
      },
      abilities: [],
      magic: createMagic(),
      equipment: {
        items: [],
        combat: createCombatEquipment(),
      },
      notes: "",
    };
  }

  function createStore(name = "Персонаж 1") {
    const character = createCharacter(name);
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      activeCharacterId: character.characterId,
      characters: [character],
    };
  }

  function normalizeEquipmentEntry(raw, index) {
    if (!isObject(raw)) throw new Error(`Снаряжение ${index + 1}: ожидался объект.`);
    const id = boundedString(String(raw.id || makeId()), `Снаряжение ${index + 1}, ID`, 120, false);
    const itemId = raw.itemId === null || raw.itemId === undefined || raw.itemId === ""
      ? null
      : boundedString(String(raw.itemId), `Снаряжение ${index + 1}, ID каталога`, 160, false);
    const name = boundedString(String(raw.name || ""), `Снаряжение ${index + 1}, название`, 200, false).trim();
    const quantity = optionalNumber(raw.quantity, `Снаряжение «${name}», количество`, { min: Number.MIN_VALUE });
    if (quantity === null) throw new Error(`Снаряжение «${name}»: не указано количество.`);
    const unitWeightKg = optionalNumber(raw.unitWeightKg, `Снаряжение «${name}», вес`, { min: 0 });
    const conditionNotes = boundedString(String(raw.conditionNotes ?? ""), `Снаряжение «${name}», состояние`, 2000);
    const armorEv = optionalNumber(raw.armorEv ?? null, `Снаряжение «${name}», EV брони`, { min: 0, max: 100 });
    const customCategory = itemId === null ? String(raw.customCategory ?? "other") : "";
    if (itemId === null && !CUSTOM_EQUIPMENT_CATEGORIES.has(customCategory)) throw new Error(`Снаряжение «${name}»: неизвестный тип собственного предмета.`);
    return { ...raw, id, itemId, name, quantity, unitWeightKg, conditionNotes, armorEv, customCategory, custom: itemId === null };
  }

  function normalizeInventoryReference(value, label, inventoryIds, allowEmpty = true) {
    if (value === null || value === undefined || value === "") {
      if (allowEmpty) return null;
      throw new Error(`${label}: выберите предмет из инвентаря.`);
    }
    const id = boundedString(String(value), label, 160, false);
    if (!inventoryIds.has(id)) throw new Error(`${label}: связанный предмет отсутствует в инвентаре.`);
    return id;
  }

  function normalizeCombatEquipment(raw, inventoryItems) {
    if (!isObject(raw)) throw new Error("Боевые слоты снаряжения должны быть объектом.");
    const inventoryIds = new Set(inventoryItems.map(item => item.id));
    const armorRaw = raw.armorByZone ?? {};
    if (!isObject(armorRaw)) throw new Error("Броня по зонам должна быть объектом.");
    const armorByZone = {};
    for (const zone of BODY_ZONES) {
      const source = armorRaw[zone] ?? {};
      if (!isObject(source)) throw new Error(`Броня в зоне «${zone}» должна быть объектом.`);
      armorByZone[zone] = {
        inventoryEntryId: normalizeInventoryReference(source.inventoryEntryId, `Броня в зоне «${zone}»`, inventoryIds),
        currentSP: optionalNumber(source.currentSP ?? null, `Текущая прочность брони в зоне «${zone}»`, { min: 0, max: 100000 }),
        damage: boundedString(String(source.damage ?? ""), `Повреждение брони в зоне «${zone}»`, 2000),
      };
    }
    if (!Array.isArray(raw.weapons ?? [])) throw new Error("Оружие в боевой экипировке должно быть списком.");
    const weapons = (raw.weapons ?? []).map((weapon, index) => {
      if (!isObject(weapon)) throw new Error(`Оружие в боевой экипировке ${index + 1} должно быть объектом.`);
      const slot = boundedString(String(weapon.slot || "backup"), `Оружие ${index + 1}, слот`, 20, false);
      if (!new Set(["primary", "backup"]).has(slot)) throw new Error(`Оружие ${index + 1}: неизвестный слот.`);
      const name = boundedString(String(weapon.name ?? ""), `Оружие ${index + 1}, название`, 200);
      return {
        ...weapon,
        id: boundedString(String(weapon.id || makeId()), `Оружие ${index + 1}, ID`, 160, false),
        slot,
        inventoryEntryId: normalizeInventoryReference(weapon.inventoryEntryId, `Оружие ${index + 1}`, inventoryIds),
        name,
        reliability: boundedString(String(weapon.reliability ?? ""), `Оружие ${index + 1}, надёжность`, 200),
      };
    });
    ensureUnique(weapons, weapon => weapon.id, "ID оружия");
    ensureUnique(weapons.filter(weapon => weapon.inventoryEntryId), weapon => weapon.inventoryEntryId, "предмет экипировки в слотах оружия");
    ensureUnique(weapons, weapon => weapon.slot, "слот оружия");
    if (weapons.length > 2) throw new Error("На листе можно указать только основное и запасное оружие.");
    const shieldRaw = raw.shield === null ? null : raw.shield ?? {};
    if (shieldRaw !== null && !isObject(shieldRaw)) throw new Error("Щит должен быть объектом или null.");
    const shield = shieldRaw === null ? null : {
      ...shieldRaw,
      inventoryEntryId: normalizeInventoryReference(shieldRaw.inventoryEntryId, "Щит", inventoryIds),
      currentSP: optionalNumber(shieldRaw.currentSP ?? null, "Текущая прочность щита", { min: 0, max: 100000 }),
      damage: boundedString(String(shieldRaw.damage ?? ""), "Повреждение щита", 2000),
    };
    return { ...raw, armorByZone, weapons, shield };
  }

  function normalizeMagic(raw) {
    if (!isObject(raw)) throw new Error("Магические ресурсы персонажа должны быть объектом.");
    const magic = { ...createMagic(), ...raw };
    for (const key of ["energyBase", "energyCurrent", "vigor", "vigorModifier", "focus"]) {
      magic[key] = optionalNumber(magic[key], `Магический ресурс «${key}»`, { min: key === "vigorModifier" ? -100000 : 0, max: 100000 });
    }
    if (!Array.isArray(magic.entries)) throw new Error("Изученные способности должны быть списком.");
    magic.entries = magic.entries.map((entry, index) => {
      if (!isObject(entry)) throw new Error(`Магическая способность ${index + 1} должна быть объектом.`);
      const kind = boundedString(String(entry.kind || "other"), `Магическая способность ${index + 1}, тип`, 20, false);
      if (!MAGIC_KINDS.has(kind)) throw new Error(`Магическая способность ${index + 1}: неизвестный тип.`);
      const fields = {};
      for (const [key, max] of Object.entries({ name: 200, cost: 500, effect: 20000, range: 500, duration: 500, time: 500, difficulty: 200, components: 2000, notes: 4000 })) {
        fields[key] = boundedString(String(entry[key] ?? ""), `Магическая способность ${index + 1}, ${key}`, max);
      }
      let catalogRef = null;
      if (entry.catalogRef !== null && entry.catalogRef !== undefined && entry.catalogRef !== "") {
        if (!isObject(entry.catalogRef)) throw new Error(`Магическая способность ${index + 1}: ссылка на каталог имеет неверный формат.`);
        const type = boundedString(String(entry.catalogRef.type || ""), `Магическая способность ${index + 1}, тип каталога`, 20, false);
        if (!MAGIC_CATALOG_TYPES.has(type)) throw new Error(`Магическая способность ${index + 1}: неизвестный тип ссылки на каталог.`);
        catalogRef = {
          type,
          id: boundedString(String(entry.catalogRef.id || ""), `Магическая способность ${index + 1}, ID каталога`, 160, false),
          name: boundedString(String(entry.catalogRef.name ?? ""), `Магическая способность ${index + 1}, название в каталоге`, 200),
        };
      }
      return { ...entry, ...fields, id: boundedString(String(entry.id || makeId()), `Магическая способность ${index + 1}, ID`, 160, false), kind, catalogRef };
    });
    ensureUnique(magic.entries, entry => entry.id, "ID магической способности");
    return magic;
  }

  function normalizeCharacter(raw, index) {
    if (!isObject(raw)) throw new Error(`Персонаж ${index + 1}: ожидался объект.`);
    if (Number(raw.schemaVersion ?? SCHEMA_VERSION) !== SCHEMA_VERSION) {
      throw new Error(`Персонаж ${index + 1}: неподдерживаемая версия формата.`);
    }
    const characterId = boundedString(String(raw.characterId || ""), `Персонаж ${index + 1}, characterId`, 160, false).trim();
    const defaults = createCharacter("Новый персонаж");
    const personalRaw = raw.personal ?? {};
    const lifePathRaw = raw.lifePath ?? {};
    const attributesRaw = raw.attributes ?? {};
    const attributeModifiersRaw = raw.attributeModifiers ?? {};
    const stateRaw = raw.state ?? {};
    const equipmentRaw = raw.equipment ?? {};
    const magicRaw = raw.magic ?? defaults.magic;
    if (!isObject(personalRaw) || !isObject(lifePathRaw) || !isObject(attributesRaw) || !isObject(attributeModifiersRaw) || !isObject(stateRaw) || !isObject(equipmentRaw) || !isObject(magicRaw)) {
      throw new Error(`Персонаж ${index + 1}: личные данные, характеристики, состояние и снаряжение должны быть объектами.`);
    }

    const personal = { ...defaults.personal, ...personalRaw };
    for (const [key, value] of Object.entries(personal)) boundedString(value, `Личные данные «${key}»`, 2000);

    const lifePath = { ...defaults.lifePath, ...lifePathRaw };
    for (const key of ["familyHistory", "familyStation", "parents", "siblings", "addictionTrauma", "style", "values"]) {
      lifePath[key] = boundedString(lifePath[key], `Жизненный путь «${key}»`, 20000);
    }
    for (const key of ["decadeEvents", "allies", "enemies", "relationships"]) {
      if (!Array.isArray(lifePath[key])) throw new Error(`Жизненный путь «${key}» должен быть списком.`);
      lifePath[key] = lifePath[key].map((entry, entryIndex) => boundedString(entry, `Жизненный путь «${key}», запись ${entryIndex + 1}`, 2000, false).trim());
    }
    if (!Array.isArray(lifePath.outcomes)) throw new Error("Последствия жизненного пути должны быть списком.");
    lifePath.outcomes = lifePath.outcomes.map((outcome, outcomeIndex) => {
      if (!isObject(outcome)) throw new Error(`Последствие жизненного пути ${outcomeIndex + 1}: ожидался объект.`);
      const type = boundedString(String(outcome.type || "Прочее"), `Последствие ${outcomeIndex + 1}, тип`, 100, false).trim();
      const description = boundedString(String(outcome.description ?? ""), `Последствие ${outcomeIndex + 1}, описание`, 20000);
      const source = boundedString(String(outcome.source ?? ""), `Последствие ${outcomeIndex + 1}, источник`, 2000);
      const id = boundedString(String(outcome.id || makeId()), `Последствие ${outcomeIndex + 1}, ID`, 160, false);
      return { ...outcome, id, type, description, source };
    });
    ensureUnique(lifePath.outcomes, outcome => outcome.id, "ID последствия жизненного пути");
    if (lifePath.generated !== null && !isObject(lifePath.generated)) {
      throw new Error(`Жизненный путь персонажа ${index + 1}: сгенерированные данные должны быть объектом или null.`);
    }
    if (lifePath.generated !== null) {
      const serialized = JSON.stringify(lifePath.generated);
      if (!serialized || serialized.length > 500000) throw new Error(`Жизненный путь персонажа ${index + 1}: превышен размер сгенерированных данных.`);
      lifePath.generated = JSON.parse(serialized);
      const generated = lifePath.generated;
      for (const key of ["decadeEvents", "relatives", "rolls", "effects"]) {
        if (generated[key] !== undefined && !Array.isArray(generated[key])) throw new Error(`Сгенерированный жизненный путь: поле «${key}» должно быть массивом.`);
      }
      const relativeIds = new Set();
      for (const [relativeIndex, relative] of (generated.relatives || []).entries()) {
        if (!isObject(relative)) throw new Error(`Сгенерированный родственник ${relativeIndex + 1}: ожидался объект.`);
        relative.id = boundedString(String(relative.id || ""), `Сгенерированный родственник ${relativeIndex + 1}, ID`, 160, false);
        relative.role = boundedString(String(relative.role || ""), `Сгенерированный родственник ${relativeIndex + 1}, роль`, 200, false);
        relative.name = boundedString(String(relative.name ?? ""), `Имя родственника ${relativeIndex + 1}`, 200);
        relative.details = boundedString(String(relative.details ?? ""), `Сведения о родственнике ${relativeIndex + 1}`, 4000);
        relative.status = boundedString(String(relative.status ?? ""), `Статус родственника ${relativeIndex + 1}`, 200);
        if (relativeIds.has(relative.id)) throw new Error(`Повторяется ID сгенерированного родственника: ${relative.id}.`);
        relativeIds.add(relative.id);
      }
      const eventIds = new Set();
      for (const [eventIndex, event] of (generated.decadeEvents || []).entries()) {
        if (!isObject(event)) throw new Error(`Событие жизненного пути ${eventIndex + 1}: ожидался объект.`);
        event.id = boundedString(String(event.id || ""), `Событие жизненного пути ${eventIndex + 1}, ID`, 160, false);
        event.title = boundedString(String(event.title ?? event.type ?? "Событие"), `Событие жизненного пути ${eventIndex + 1}, заголовок`, 300);
        event.description = boundedString(String(event.description ?? ""), `Событие жизненного пути ${eventIndex + 1}, описание`, 4000);
        if (eventIds.has(event.id)) throw new Error(`Повторяется ID события жизненного пути: ${event.id}.`);
        eventIds.add(event.id);
        if (event.personId && !relativeIds.has(event.personId)) throw new Error(`Событие «${event.title}» ссылается на отсутствующего родственника ${event.personId}.`);
      }
    }

    const attributes = { ...defaults.attributes, ...attributesRaw };
    for (const attribute of ATTRIBUTES) attributes[attribute] = optionalNumber(attributes[attribute], `Характеристика ${attribute}`, { min: 0, max: 1000 });

    const attributeModifiers = createAttributeModifiers();
    for (const attribute of ATTRIBUTES) {
      const modifiers = attributeModifiersRaw[attribute] ?? {};
      if (!isObject(modifiers)) throw new Error(`Модификаторы характеристики ${attribute} должны быть объектом.`);
      attributeModifiers[attribute] = {
        permanent: optionalNumber(modifiers.permanent, `Постоянное изменение ${attribute}`, { min: -1000, max: 1000 }) ?? 0,
        temporary: optionalNumber(modifiers.temporary, `Временное изменение ${attribute}`, { min: -1000, max: 1000 }) ?? 0,
      };
    }

    if (!Array.isArray(raw.skills ?? [])) throw new Error(`Персонаж ${index + 1}: навыки должны быть массивом.`);
    const knownLanguages = new Set((initialSkillCatalog || globalThis.CharacterSkills)?.LANGUAGES?.map(language => language.id) || ["common", "elder-speech", "dwarven"]);
    const skills = (raw.skills ?? []).map((skill, skillIndex) => {
      if (!isObject(skill)) throw new Error(`Навык ${skillIndex + 1}: ожидался объект.`);
      const name = boundedString(String(skill.name || ""), `Навык ${skillIndex + 1}, название`, 200).trim();
      const attribute = skill.attribute === null || skill.attribute === undefined || skill.attribute === ""
        ? null
        : boundedString(String(skill.attribute), `Навык «${name}», характеристика`, 20, false);
      if (attribute !== null && !ATTRIBUTE_SET.has(attribute)) throw new Error(`Навык «${name}»: неизвестная характеристика ${attribute}.`);
      const rank = optionalNumber(skill.rank, `Навык «${name}», значение`, { min: 0, max: 1000 });
      const permanentModifier = optionalNumber(skill.permanentModifier ?? 0, `Навык «${name}», постоянное изменение`, { min: -1000, max: 1000 }) ?? 0;
      const temporaryModifier = optionalNumber(skill.temporaryModifier ?? 0, `Навык «${name}», временное изменение`, { min: -1000, max: 1000 }) ?? 0;
      if (skill.languageId !== undefined && skill.languageId !== null && !knownLanguages.has(skill.languageId)) {
        throw new Error(`Навык «${name}»: неизвестный ID языка.`);
      }
      const nativeBonus = optionalNumber(skill.nativeBonus ?? 0, `Навык «${name}», бонус родного языка`, { min: 0, max: 8 }) ?? 0;
      if (![0, 8].includes(nativeBonus) || (nativeBonus > 0 && !skill.languageId)) throw new Error(`Навык «${name}»: неверный бонус родного языка.`);
      return { ...skill, id: boundedString(String(skill.id || makeId()), `Навык «${name}», ID`, 160, false), name, attribute, rank, permanentModifier, temporaryModifier, nativeBonus };
    });
    ensureUnique(skills, item => item.id, "ID навыка");
    ensureUnique(skills.filter(skill => skill.languageId), item => item.languageId, "ID языка");

    const professionSkillChoicesRaw = raw.professionSkillChoices ?? {};
    if (!isObject(professionSkillChoicesRaw)) throw new Error(`Профессиональные навыки персонажа ${index + 1} должны быть объектом.`);
    const professionSkillChoices = {};
    for (const [professionId, choices] of Object.entries(professionSkillChoicesRaw)) {
      boundedString(professionId, `Профессия в выборе навыков персонажа ${index + 1}`, 120, false);
      if (!Array.isArray(choices)) throw new Error(`Выбор навыков профессии «${professionId}» должен быть списком.`);
      professionSkillChoices[professionId] = choices.map((choice, choiceIndex) =>
        boundedString(choice, `Выбор навыка профессии «${professionId}», запись ${choiceIndex + 1}`, 120, false));
      ensureUnique(professionSkillChoices[professionId], value => value, `ID выбранного навыка профессии «${professionId}»`);
    }

    const professionLanguageChoicesRaw = raw.professionLanguageChoices ?? {};
    if (!isObject(professionLanguageChoicesRaw)) throw new Error(`Языки профессиональных навыков персонажа ${index + 1} должны быть объектом.`);
    const professionLanguageChoices = {};
    for (const [professionId, choices] of Object.entries(professionLanguageChoicesRaw)) {
      boundedString(professionId, `Профессия в выборе языков персонажа ${index + 1}`, 120, false);
      if (!Array.isArray(choices)) throw new Error(`Выбор языков профессии «${professionId}» должен быть списком.`);
      professionLanguageChoices[professionId] = choices.map((choice, choiceIndex) => {
        const languageId = boundedString(choice, `Выбор языка профессии «${professionId}», запись ${choiceIndex + 1}`, 120, false);
        if (!knownLanguages.has(languageId)) throw new Error(`Выбран неизвестный язык «${languageId}» для профессии «${professionId}».`);
        return languageId;
      });
      ensureUnique(professionLanguageChoices[professionId], value => value, `ID выбранного языка профессии «${professionId}»`);
    }

    const professionTreesRaw = raw.professionTrees ?? {};
    if (!isObject(professionTreesRaw)) throw new Error(`Деревья профессий персонажа ${index + 1} должны быть объектом.`);
    const professionTrees = {};
    for (const [professionId, tree] of Object.entries(professionTreesRaw)) {
      boundedString(professionId, `Профессия в деревьях персонажа ${index + 1}`, 120, false);
      if (!isObject(tree) || !isObject(tree.branches ?? {})) throw new Error(`Ветка дерева профессии «${professionId}» имеет неверный формат.`);
      professionTrees[professionId] = { branches: {} };
      for (const branchId of ["A", "B", "C"]) {
        const ranks = tree.branches?.[branchId] ?? [0, 0, 0];
        if (!Array.isArray(ranks) || ranks.length !== 3 || ranks.some(rank => !Number.isInteger(rank) || rank < 0 || rank > 10)) {
          throw new Error(`Ранги дерева «${professionId}», ветка ${branchId}: нужны три целых значения от 0 до 10.`);
        }
        if ((ranks[1] > 0 && ranks[0] < 5) || (ranks[2] > 0 && ranks[1] < 5)) {
          throw new Error(`В дереве «${professionId}», ветка ${branchId} есть ранг закрытой способности.`);
        }
        professionTrees[professionId].branches[branchId] = [...ranks];
      }
    }
    const creationRaw = raw.creation ?? {};
    if (!isObject(creationRaw)) throw new Error(`Данные создания персонажа ${index + 1} должны быть объектом.`);
    const creationSerialized = JSON.stringify(creationRaw);
    if (!creationSerialized || creationSerialized.length > 100000) throw new Error(`Данные создания персонажа ${index + 1} слишком велики.`);
    const creation = JSON.parse(creationSerialized);

    const developmentRaw = raw.development ?? defaults.development;
    if (!isObject(developmentRaw)) throw new Error("Очки улучшения персонажа " + (index + 1) + " должны быть объектом.");
    const earnedPoints = optionalNumber(developmentRaw.earnedPoints ?? 0, "Всего начислено очков улучшения", { min: 0, max: 100000 });
    const availablePoints = optionalNumber(developmentRaw.availablePoints ?? 0, "Доступно очков улучшения", { min: 0, max: 100000 });
    if (!Number.isInteger(earnedPoints) || !Number.isInteger(availablePoints) || availablePoints > earnedPoints) {
      throw new Error("Баланс очков улучшения персонажа " + (index + 1) + " некорректен.");
    }
    const draftRaw = developmentRaw.draft ?? {};
    if (!isObject(draftRaw)) throw new Error(`Черновик прокачки персонажа ${index + 1} должен быть объектом.`);
    const draft = { attributes: {}, skills: {}, professionAbilities: {} };
    for (const group of ["attributes", "skills", "professionAbilities"]) {
      const map = draftRaw[group] ?? {};
      if (!isObject(map)) throw new Error(`Черновик «${group}» должен быть объектом.`);
      for (const [key, rawCount] of Object.entries(map)) {
        const count = optionalNumber(rawCount, `Черновик «${group}», ранг «${key}»`, { min: 1, max: 10 });
        if (!Number.isInteger(count)) throw new Error(`Черновик «${group}», ранг «${key}» должен быть целым числом.`);
        if (group === "attributes") {
          if (!ATTRIBUTE_SET.has(key) || attributes[key] === null || Number(attributes[key]) + count > 10) throw new Error(`Черновик содержит недопустимое улучшение характеристики «${key}».`);
        } else if (group === "skills") {
          const skill = skills.find(entry => entry.id === key);
          if (!skill || Number(skill.rank ?? 0) + Number(skill.nativeBonus ?? 0) + count > 10) throw new Error(`Черновик содержит недопустимое улучшение навыка «${key}».`);
        } else {
          const match = /^([a-z0-9-]+):([ABC]):([012])$/i.exec(key);
          const ranks = match && professionTrees[match[1]]?.branches?.[match[2]];
          const nodeIndex = match ? Number(match[3]) : -1;
          if (!match || !ranks || ranks[nodeIndex] + count > 10) throw new Error(`Черновик содержит недопустимое улучшение умения «${key}».`);
        }
        draft[group][key] = count;
      }
    }
    for (const [professionId, tree] of Object.entries(professionTrees)) {
      for (const [branchId, ranks] of Object.entries(tree.branches)) {
        const effective = ranks.map((rank, nodeIndex) => rank + Number(draft.professionAbilities[`${professionId}:${branchId}:${nodeIndex}`] || 0));
        if ((effective[1] > 0 && effective[0] < 5) || (effective[2] > 0 && effective[1] < 5)) {
          throw new Error(`В черновике дерева «${professionId}», ветка ${branchId} есть ранг закрытой способности.`);
        }
      }
    }
    const skillCatalog = initialSkillCatalog || globalThis.CharacterSkills;
    const rankCost = (baseRank, count, multiplier = 1) => {
      let total = 0;
      if (!Number.isInteger(baseRank)) return null;
      for (let offset = 0; offset < count; offset += 1) {
        const rank = baseRank + offset;
        if (rank >= 10) return null;
        total += Math.max(1, rank) * multiplier;
      }
      return total;
    };
    let reservedPoints = 0;
    for (const [code, count] of Object.entries(draft.attributes)) {
      for (let offset = 0; offset < count; offset += 1) reservedPoints += (Number(attributes[code]) + offset) * 10;
    }
    for (const [skillId, count] of Object.entries(draft.skills)) {
      const skill = skills.find(entry => entry.id === skillId);
      const definition = skill?.catalogId && skillCatalog?.SKILLS?.find(entry => entry.id === skill.catalogId);
      const cost = rankCost(Number(skill?.rank ?? 0) + Number(skill?.nativeBonus ?? 0), count, definition?.doubleCost ? 2 : 1);
      if (cost === null) throw new Error(`Черновик навыка «${skillId}» содержит неверные ранги.`);
      reservedPoints += cost;
    }
    for (const [key, count] of Object.entries(draft.professionAbilities)) {
      const match = /^([a-z0-9-]+):([ABC]):([012])$/i.exec(key);
      const baseRank = match ? professionTrees[match[1]]?.branches?.[match[2]]?.[Number(match[3])] : undefined;
      const cost = rankCost(Number(baseRank), count);
      if (cost === null) throw new Error(`Черновик умения «${key}» содержит неверные ранги.`);
      reservedPoints += cost;
    }
    if (availablePoints + reservedPoints > earnedPoints) throw new Error("Начисленных очков не хватает на сохранённый черновик прокачки.");
    const development = { earnedPoints, availablePoints, draft };

    const state = { ...defaults.state, ...stateRaw };
    for (const key of ["currentHp", "currentSta", "currentLuck", "currentReputation"]) state[key] = optionalNumber(state[key] ?? null, `Состояние «${key}»`, { min: 0, max: 100000 });
    state.reputationNotes = boundedString(String(state.reputationNotes ?? ""), "Заметки о репутации", 4000);
    if (!Array.isArray(state.conditions)) throw new Error(`Персонаж ${index + 1}: состояния должны быть массивом.`);
    state.conditions = state.conditions.map((condition, conditionIndex) => boundedString(condition, `Состояние ${conditionIndex + 1}`, 2000, false).trim());
    if (!Array.isArray(state.wounds ?? [])) throw new Error(`Персонаж ${index + 1}: ранения должны быть списком.`);
    state.wounds = (state.wounds ?? []).map((wound, woundIndex) => {
      if (!isObject(wound)) throw new Error(`Ранение ${woundIndex + 1}: ожидался объект.`);
      const location = boundedString(String(wound.location || "other"), `Ранение ${woundIndex + 1}, зона`, 20, false);
      if (!new Set([...BODY_ZONES, "other"]).has(location)) throw new Error(`Ранение ${woundIndex + 1}: неизвестная зона тела.`);
      const status = boundedString(String(wound.status || "active"), `Ранение ${woundIndex + 1}, состояние`, 20, false);
      if (!WOUND_STATUSES.has(status)) throw new Error(`Ранение ${woundIndex + 1}: неизвестный статус.`);
      return {
        ...wound,
        id: boundedString(String(wound.id || makeId()), `Ранение ${woundIndex + 1}, ID`, 160, false),
        location,
        title: boundedString(String(wound.title ?? ""), `Ранение ${woundIndex + 1}, название`, 200),
        description: boundedString(String(wound.description ?? ""), `Ранение ${woundIndex + 1}, описание`, 4000),
        status,
      };
    });
    ensureUnique(state.wounds, wound => wound.id, "ID ранения");

    if (!Array.isArray(raw.abilities ?? [])) throw new Error(`Персонаж ${index + 1}: способности должны быть массивом.`);
    const abilities = (raw.abilities ?? []).map((ability, abilityIndex) => {
      if (!isObject(ability)) throw new Error(`Способность ${abilityIndex + 1}: ожидался объект.`);
      const name = boundedString(String(ability.name || ""), `Способность ${abilityIndex + 1}, название`, 200).trim();
      const description = boundedString(String(ability.description ?? ""), `Способность «${name}», описание`, 20000);
      return { ...ability, id: boundedString(String(ability.id || makeId()), `Способность «${name}», ID`, 160, false), name, description };
    });
    ensureUnique(abilities, item => item.id, "ID способности");

    if (!Array.isArray(equipmentRaw.items ?? [])) throw new Error(`Персонаж ${index + 1}: снаряжение должно быть массивом.`);
    const equipmentItems = (equipmentRaw.items ?? []).map(normalizeEquipmentEntry);
    const combatRaw = equipmentRaw.combat ?? createCombatEquipment();
    const { capacityKg: _discardedCapacity, ...equipmentFields } = equipmentRaw;
    const equipment = { ...equipmentFields, items: equipmentItems, combat: normalizeCombatEquipment(combatRaw, equipmentItems) };
    ensureUnique(equipment.items, item => item.id, "ID предмета инвентаря");
    const magic = normalizeMagic(magicRaw);

    const name = boundedString(String(personal.name ?? ""), "Имя персонажа", 2000);
    const rulesVersion = boundedString(String(raw.rulesVersion ?? RULES_VERSION), "Версия правил", 200);
    const notes = boundedString(String(raw.notes ?? ""), "Заметки", 100000);
    const createdAt = boundedString(String(raw.createdAt ?? defaults.createdAt), "Дата создания", 100);
    const updatedAt = boundedString(String(raw.updatedAt ?? defaults.updatedAt), "Дата изменения", 100);
    return {
      ...defaults,
      ...raw,
      characterId,
      schemaVersion: SCHEMA_VERSION,
      rulesVersion,
      createdAt,
      updatedAt,
      personal: { ...personal, name },
      lifePath,
      attributes,
      attributeModifiers,
      skills,
      professionSkillChoices,
      professionLanguageChoices,
      professionTrees,
      creation,
      development,
      state,
      abilities,
      magic,
      equipment,
      notes,
    };
  }

  function ensureUnique(list, keySelector, label) {
    const values = new Set();
    for (const value of list) {
      const key = keySelector(value);
      if (values.has(key)) throw new Error(`Повторяется ${label}: ${key}.`);
      values.add(key);
    }
  }

  function copyCharacter(raw, name) {
    const copy = clone(normalizeCharacter(raw, 0));
    const now = new Date().toISOString();
    copy.characterId = makeId();
    copy.personal.name = boundedString(name ?? `${copy.personal.name || "Персонаж"} (копия)`, "Имя копии", 2000, false).trim();
    copy.createdAt = now;
    copy.updatedAt = now;
    for (const entry of copy.skills) entry.id = makeId();
    for (const entry of copy.abilities) entry.id = makeId();
    for (const wound of copy.state.wounds) wound.id = makeId();
    for (const entry of copy.magic.entries) entry.id = makeId();
    const inventoryIdMap = new Map();
    for (const entry of copy.equipment.items) {
      const previousId = entry.id;
      entry.id = makeId();
      inventoryIdMap.set(previousId, entry.id);
    }
    for (const slot of Object.values(copy.equipment.combat.armorByZone)) {
      if (slot.inventoryEntryId) slot.inventoryEntryId = inventoryIdMap.get(slot.inventoryEntryId) || null;
    }
    for (const weapon of copy.equipment.combat.weapons) {
      weapon.id = makeId();
      if (weapon.inventoryEntryId) weapon.inventoryEntryId = inventoryIdMap.get(weapon.inventoryEntryId) || null;
    }
    if (copy.equipment.combat.shield?.inventoryEntryId) {
      copy.equipment.combat.shield.inventoryEntryId = inventoryIdMap.get(copy.equipment.combat.shield.inventoryEntryId) || null;
    }
    for (const entry of copy.lifePath.outcomes) entry.id = makeId();
    if (copy.lifePath.generated) {
      const relativeIdMap = new Map();
      for (const relative of copy.lifePath.generated.relatives || []) {
        const oldId = relative.id;
        relative.id = makeId();
        relativeIdMap.set(oldId, relative.id);
      }
      for (const event of copy.lifePath.generated.decadeEvents || []) {
        event.id = makeId();
        if (event.personId && relativeIdMap.has(event.personId)) event.personId = relativeIdMap.get(event.personId);
      }
      for (const effect of copy.lifePath.generated.effects || []) if (effect.id) effect.id = makeId();
    }
    return normalizeCharacter(copy, 0);
  }

  const STORE_MIGRATIONS = Object.freeze({
    1: raw => ({
      ...raw,
      schemaVersion: 2,
      characters: raw.characters.map(character => ({ ...character, schemaVersion: 2 })),
    }),
    2: raw => ({
      ...raw,
      schemaVersion: 3,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 3,
        attributeModifiers: character.attributeModifiers ?? createAttributeModifiers(),
        skills: (character.skills ?? []).map(skill => ({
          ...skill,
          permanentModifier: skill.permanentModifier ?? 0,
          temporaryModifier: skill.temporaryModifier ?? 0,
        })),
      })),
    }),
    3: raw => ({
      ...raw,
      schemaVersion: 4,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 4,
        personal: { ...(character.personal ?? {}), professionId: character.personal?.professionId ?? "" },
        professionSkillChoices: character.professionSkillChoices ?? {},
      })),
    }),
    4: raw => ({
      ...raw,
      schemaVersion: 5,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 5,
        lifePath: { ...(character.lifePath ?? {}), generated: character.lifePath?.generated ?? null },
        professionTrees: character.professionTrees ?? {},
        creation: character.creation ?? {},
      })),
    }),
    5: raw => ({
      ...raw,
      schemaVersion: 6,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 6,
        development: character.development ?? { earnedPoints: 0, availablePoints: 0 },
      })),
    }),
    6: raw => ({
      ...raw,
      schemaVersion: 7,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 7,
        development: {
          ...(character.development ?? { earnedPoints: 0, availablePoints: 0 }),
          draft: character.development?.draft ?? { attributes: {}, skills: {}, professionAbilities: {} },
        },
      })),
    }),
    7: raw => ({
      ...raw,
      schemaVersion: 8,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 8,
        state: { ...(character.state ?? {}), currentReputation: character.state?.currentReputation ?? null, reputationNotes: character.state?.reputationNotes ?? "", wounds: character.state?.wounds ?? [] },
        magic: character.magic ?? createMagic(),
        equipment: {
          ...(character.equipment ?? {}),
          items: (character.equipment?.items ?? []).map(item => ({ ...item, conditionNotes: item.conditionNotes ?? "", armorEv: item.armorEv ?? null, customCategory: item.customCategory ?? (item.itemId ? "" : "other") })),
          combat: character.equipment?.combat ?? createCombatEquipment(),
        },
      })),
    }),
    8: raw => ({
      ...raw,
      schemaVersion: 9,
      characters: raw.characters.map(character => ({
        ...character,
        schemaVersion: 9,
        professionLanguageChoices: character.professionLanguageChoices ?? {},
        skills: (character.skills ?? []).map(skill => skill.catalogId === "language" && !skill.languageId
          ? { ...skill, catalogId: null, legacyLanguage: true, name: skill.name || "Язык (старый общий навык)", source: "other", professionId: null, professionSkillId: null }
          : skill),
        equipment: Object.fromEntries(Object.entries(character.equipment ?? {}).filter(([key]) => key !== "capacityKg")),
      })),
    }),
  });

  function migrateStore(raw) {
    if (!isObject(raw)) throw new Error("Файл персонажей должен содержать JSON-объект.");
    const sourceVersion = Number(raw.schemaVersion ?? raw.version);
    if (!Number.isInteger(sourceVersion) || sourceVersion < 1) throw new Error("В файле не указана поддерживаемая версия формата.");
    if (sourceVersion > SCHEMA_VERSION) throw new Error(`Формат ${sourceVersion} новее поддерживаемого (${SCHEMA_VERSION}); данные не изменены.`);
    let value = clone(raw);
    let version = sourceVersion;
    while (version < SCHEMA_VERSION) {
      const migration = STORE_MIGRATIONS[version];
      if (!migration) throw new Error(`Нет миграции формата ${version} → ${version + 1}; данные не изменены.`);
      const previousVersion = version;
      value = migration(value);
      version = Number(value.schemaVersion);
      if (!Number.isInteger(version) || version !== previousVersion + 1) throw new Error("Миграция не обновила версию формата последовательно.");
    }
    if (value.format !== FORMAT) throw new Error("Формат файла персонажей не распознан.");
    if (!Array.isArray(value.characters) || value.characters.length === 0) throw new Error("В файле должен быть хотя бы один персонаж.");
    const characters = value.characters.map(normalizeCharacter);
    ensureUnique(characters, character => character.characterId, "characterId");
    if (!characters.some(character => character.characterId === value.activeCharacterId)) {
      throw new Error("ID активного персонажа отсутствует в списке; файл не импортирован.");
    }
    const activeCharacterId = value.activeCharacterId;
    return { ...value, format: FORMAT, schemaVersion: SCHEMA_VERSION, activeCharacterId, characters };
  }

  function normalizeLegacyInventory(raw, cleanEntry = normalizeEquipmentEntry) {
    if (!isObject(raw) || Number(raw.version) !== 1 || !Array.isArray(raw.items)) {
      throw new Error("Старый инвентарь не соответствует формату версии 1.");
    }
    const items = raw.items.map((item, index) => {
      let result;
      try { result = cleanEntry(item, index); }
      catch { throw new Error(`Старый инвентарь содержит некорректную запись №${index + 1}; исходный файл оставлен без изменений.`); }
      if (!result) throw new Error(`Старый инвентарь содержит некорректную запись №${index + 1}; исходный файл оставлен без изменений.`);
      return normalizeEquipmentEntry(result, index);
    });
    ensureUnique(items, item => item.id, "ID предмета инвентаря");
    return { items };
  }

  function load(storage, { cleanLegacyEntry = normalizeEquipmentEntry } = {}) {
    const existingRaw = storage.getItem(STORAGE_KEY);
    if (existingRaw !== null) {
      let parsed;
      try { parsed = JSON.parse(existingRaw); }
      catch { throw new Error("Сохранение персонажей повреждено. Исходные данные оставлены на месте; импортируйте резервную копию."); }
      const parsedVersion = Number(parsed?.schemaVersion ?? parsed?.version);
      const normalized = migrateStore(parsed);
      if (parsedVersion < SCHEMA_VERSION) storage.setItem(`${STORAGE_KEY}.backup-v${parsedVersion}`, existingRaw);
      const normalizedRaw = JSON.stringify(normalized);
      if (normalizedRaw !== existingRaw) storage.setItem(STORAGE_KEY, normalizedRaw);
      return { store: normalized, migratedLegacyInventory: false, migratedSchemaVersion: parsedVersion < SCHEMA_VERSION, legacyBackup: null };
    }

    const legacyRaw = storage.getItem(LEGACY_INVENTORY_KEY);
    if (legacyRaw !== null) {
      let legacy;
      try { legacy = JSON.parse(legacyRaw); }
      catch { throw new Error("Старый инвентарь не читается как JSON. Исходные данные оставлены на месте."); }
      const equipment = normalizeLegacyInventory(legacy, cleanLegacyEntry);
      const store = createStore("Персонаж 1");
      store.characters[0].equipment = { ...equipment, combat: createCombatEquipment() };
      store.legacyInventoryBackup = clone(legacy);
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return { store, migratedLegacyInventory: true, migratedSchemaVersion: false, legacyBackup: clone(legacy) };
    }

    const store = createStore();
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return { store, migratedLegacyInventory: false, migratedSchemaVersion: false, legacyBackup: null };
  }

  function save(storage, store) {
    const normalized = migrateStore(store);
    const serialized = JSON.stringify(normalized);
    storage.setItem(STORAGE_KEY, serialized);
    return normalized;
  }

  function createBackup(store) {
    return { ...clone(migrateStore(store)), exportedAt: new Date().toISOString() };
  }

  function parseImport(payload, { cleanLegacyEntry = normalizeEquipmentEntry } = {}) {
    if (!isObject(payload)) throw new Error("JSON должен содержать объект.");
    if (payload.format === FORMAT) return { kind: "characters", store: migrateStore(payload) };
    if (payload.format === "witcher-workshop-inventory" && Number(payload.version) === 1) {
      const equipment = normalizeLegacyInventory(payload, cleanLegacyEntry);
      const store = createStore("Персонаж из резервной копии");
      store.characters[0].equipment = { ...equipment, combat: createCombatEquipment() };
      return { kind: "legacy-inventory", store };
    }
    throw new Error("Формат JSON не распознан.");
  }

  return {
    FORMAT,
    SCHEMA_VERSION,
    STORAGE_KEY,
    LEGACY_INVENTORY_KEY,
    ATTRIBUTES,
    RULES_VERSION,
    createCharacter,
    copyCharacter,
    createStore,
    migrateStore,
    normalizeLegacyInventory,
    load,
    save,
    createBackup,
    parseImport,
  };
});
