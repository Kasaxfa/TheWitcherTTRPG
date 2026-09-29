(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("./character-rules.js") : root?.CharacterRules,
    typeof module !== "undefined" && module.exports ? require("./character-skills.js") : root?.CharacterSkills,
    typeof module !== "undefined" && module.exports ? require("./character-creation.js") : root?.CharacterCreation,
    typeof module !== "undefined" && module.exports ? require("./character-store.js") : root?.CharacterStore,
    typeof module !== "undefined" && module.exports ? require("./character-profession-trees.js") : root?.CharacterProfessionTrees,
    typeof module !== "undefined" && module.exports ? require("./character-advancement.js") : root?.CharacterAdvancement,
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.WitcherApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (rules, skills, creation, store, professionTrees, advancement) {
  "use strict";

  function inventoryWeight(character) {
    const entries = character?.equipment?.items || [];
    return {
      knownKg: entries.reduce((sum, entry) => sum + (entry.unitWeightKg == null ? 0 : entry.unitWeightKg * entry.quantity), 0),
      unknownCount: entries.filter(entry => entry.unitWeightKg == null).length,
    };
  }

  function armorLoadoutStats(character, getCatalogAttribute = () => null) {
    const combat = character?.equipment?.combat;
    if (!combat?.armorByZone) return { ev: 0, knownEv: 0, unknownCount: 0, itemCount: 0 };
    const items = character.equipment?.items || [];
    const wornIds = [...new Set(Object.values(combat.armorByZone).map(slot => slot.inventoryEntryId).filter(Boolean))];
    const worn = wornIds.map(id => items.find(entry => entry.id === id)).filter(Boolean);
    let knownEv = 0;
    let unknownCount = 0;
    for (const entry of worn) {
      const catalogValue = entry.itemId ? getCatalogAttribute(entry.itemId, "encumbrance") : null;
      const raw = entry.armorEv ?? catalogValue;
      const ev = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      if (!Number.isFinite(ev) || ev < 0) unknownCount += 1;
      else knownEv += ev;
    }
    return { ev: unknownCount ? null : knownEv, knownEv, unknownCount, itemCount: worn.length };
  }

  function isShieldEquipment(entry, getCatalogAttribute = () => null) {
    const region = entry?.itemId ? getCatalogAttribute(entry.itemId, "armor_region") : "";
    return String(region || "").toLocaleLowerCase("ru-RU").includes("щит") || entry?.customCategory === "shield";
  }

  function combatItemAllowed(entry, kind, getCatalogItem = () => null, getCatalogAttribute = () => null) {
    const item = entry?.itemId ? getCatalogItem(entry.itemId) : null;
    if (kind === "weapon") return item?.type === "weapon" || entry?.customCategory === "weapon";
    if (kind === "armor") return (item?.type === "armor" && !isShieldEquipment(entry, getCatalogAttribute)) || entry?.customCategory === "armor";
    return (item?.type === "armor" && isShieldEquipment(entry, getCatalogAttribute)) || entry?.customCategory === "shield";
  }

  function armorCoversZone(entry, zone, getCatalogItem = () => null, getCatalogAttribute = () => null) {
    if (entry?.customCategory === "armor") return true;
    const region = String(entry?.itemId ? getCatalogAttribute(entry.itemId, "armor_region") || "" : "").toLocaleLowerCase("ru-RU");
    const matches = {
      head: region.includes("голов"), torso: region.includes("туловищ"),
      rightArm: region.includes("рук"), leftArm: region.includes("рук"),
      rightLeg: region.includes("ног"), leftLeg: region.includes("ног"),
    };
    return Boolean(matches[zone]);
  }

  function professionSkillDescriptors(draft) {
    const profession = skills?.findProfession(draft?.professionId);
    if (!profession) return [];
    const result = [{
      key: `defining-${profession.id}`, name: profession.defining.name, attribute: profession.defining.attribute,
      catalogId: null, doubleCost: false, defining: true,
    }];
    for (const skillId of profession.skills) {
      const definition = skills.SKILLS.find(skill => skill.id === skillId);
      if (definition) result.push({ key: definition.id, ...definition });
    }
    for (const languageId of draft.professionLanguageChoices || []) {
      const language = skills.LANGUAGES.find(entry => entry.id === languageId);
      if (language) result.push({ key: `${profession.id}.language.${language.id}`, catalogId: "language", languageId: language.id, name: `Язык: ${language.name}`, attribute: "INT", doubleCost: true });
    }
    for (const skillId of draft.professionChoices || []) {
      const definition = skills.SKILLS.find(skill => skill.id === skillId);
      if (definition) result.push({ key: definition.id, ...definition });
    }
    return result.map(skill => ({ ...skill, rank: draft.professionRanks?.[skill.key] ?? 1, minimumRank: 1, maximumRank: creation.STARTING_SKILL_MAX, costPerRank: startingSkillCost(skill) }));
  }

  function startingGeneralSkills(draft) {
    const professionalIds = new Set(professionSkillDescriptors(draft).map(skill => skill.catalogId).filter(Boolean));
    return skills.SKILLS.filter(skill => skill.id !== "language" && !professionalIds.has(skill.id))
      .map(skill => ({ ...skill, key: skill.id, rank: draft.generalRanks?.[skill.id] ?? 0, minimumRank: 0, maximumRank: creation.STARTING_SKILL_MAX, costPerRank: startingSkillCost(skill) }));
  }

  function creationView(draft) {
    const professional = professionSkillDescriptors(draft);
    const general = startingGeneralSkills(draft);
    const profession = skills.findProfession(draft?.professionId);
    const professionalExpected = profession ? 1 + profession.skills.length + (profession.languageChoices || 0) + (profession.choice?.requiredCount || 0) : 0;
    const professionalSpent = startingSkillSpent(professional);
    const generalSpent = startingSkillSpent(general);
    const professionalBudget = creation.PROFESSION_SKILL_POINTS;
    const generalBudget = creationGeneralBudget(draft);
    const withControls = (entries, spent, budget) => entries.map(skill => ({ ...skill,
      canIncrease: skill.rank < skill.maximumRank && spent + skill.costPerRank <= budget,
      canDecrease: skill.rank > skill.minimumRank,
    }));
    const attributes = draft?.attributes || (draft?.attributeMode === "points" ? creation.balancedAttributes(draft.attributePool) : null);
    const pointBuy = attributes && draft?.attributeMode === "points" ? validateStartingAttributeAllocation(attributes, draft.attributePool) : null;
    return {
      professional: withControls(professional, professionalSpent, professionalBudget),
      general: withControls(general, generalSpent, generalBudget),
      professionalSpent, professionalBudget,
      professionalExpected, professionalComplete: professionalExpected > 0 && professional.length === professionalExpected,
      maximumStartingRank: creation.STARTING_SKILL_MAX,
      generalSpent, generalBudget: creationGeneralBudget({ ...draft, attributes }),
      attributes: attributes ? { ...attributes } : null,
      attributeSpent: pointBuy?.spent ?? null, attributeRemaining: pointBuy?.remaining ?? null,
      attributePool: Number(draft?.attributePool ?? 0),
      pointBuyValid: pointBuy?.ok ?? false,
      canIncreaseAttribute: Object.fromEntries(creation.ATTRIBUTES.map(code => {
        if (!attributes) return [code, false];
        const projected = { ...attributes, [code]: Number(attributes[code]) + 1 };
        return [code, validateStartingAttributeAllocation(projected, draft.attributePool).ok];
      })),
    };
  }

  function startingSkillCost(skill) { return skill.doubleCost ? 2 : 1; }
  function startingSkillSpent(list) { return list.reduce((sum, skill) => sum + skill.rank * startingSkillCost(skill), 0); }

  function validateStartingAttributeAllocation(attributes, pool) {
    const budget = Number(pool);
    if (!creation.POINT_BUY_POOLS.includes(budget)) return { ok: false, message: "Выберите пул 60, 70 или 80." };
    const values = creation.ATTRIBUTES.map(code => Number(attributes?.[code]));
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 10)) return { ok: false, message: "Каждая характеристика должна быть от 1 до 10." };
    const spent = values.reduce((sum, value) => sum + value, 0);
    if (spent > budget) return { ok: false, message: `Распределено ${spent} из доступных ${budget} очков.` };
    return { ok: true, spent, remaining: budget - spent };
  }

  function creationGeneralBudget(draft) {
    if (!draft?.attributes) return 0;
    const raceTraits = creation.RACE_TRAITS[draft.race] || {};
    const getValue = code => {
      const base = Number(draft.attributes[code] || 0);
      const racial = Number(raceTraits.attributeModifiers?.[code] || 0);
      const minimum = raceTraits.minimumAttributes?.[code] || 0;
      return Math.max(minimum, base + racial);
    };
    return getValue("INT") + getValue("REF");
  }

  function validateCreationStep(draft) {
    if (!draft) return "Нет данных мастера создания.";
    if (draft.step === "identity") {
      const age = Number(draft.age);
      if (!draft.race || !draft.professionId) return "Выберите расу и профессию.";
      if (!creation.validRaceProfession(draft.race, draft.professionId)) return "Эта комбинация расы и профессии недопустима по правилам.";
      if (!Number.isInteger(age) || age < (draft.race === "Ведьмак" ? 50 : 1) || age > 260) return draft.race === "Ведьмак" ? "Возраст ведьмака должен быть от 50 до 260 лет." : "Укажите возраст целым числом от 1 до 260.";
      return "";
    }
    if (draft.step === "background") {
      if (!draft.backgroundMode) return "Выберите ручную или случайную предысторию.";
      if (draft.backgroundMode === "random" && !draft.generatedLifePath) return "Сначала сгенерируйте предысторию.";
      return "";
    }
    if (draft.step === "attributes") {
      if (draft.attributeMode === "points") return creation.validatePointBuy(draft.attributes, draft.attributePool).message || "";
      if (draft.attributeMode === "dice") {
        const result = creation.validateDiceAssignment(draft.diceAssignments, draft.rolls);
        return result.ok ? "" : result.message;
      }
      return "Выберите способ определения характеристик.";
    }
    const profession = skills.findProfession(draft.professionId);
    if (profession?.choice && draft.professionChoices.length !== profession.choice.requiredCount) return `Для профессии «${profession.name}» нужно выбрать ровно ${profession.choice.requiredCount} навыков.`;
    if (profession?.languageChoices && draft.professionLanguageChoices.length !== profession.languageChoices) return `Для профессии «${profession.name}» нужно выбрать ровно ${profession.languageChoices} ${profession.languageChoices === 1 ? "язык" : "языка"}.`;
    const profSkills = professionSkillDescriptors(draft);
    const expected = 1 + profession.skills.length + (profession.languageChoices || 0) + (profession.choice?.requiredCount || 0);
    if (profSkills.length !== expected) return `В профессиональном наборе должно быть ${expected} навыков, сейчас: ${profSkills.length}.`;
    const profSpent = startingSkillSpent(profSkills);
    if (profSpent !== 44) return `Распределите 44 очка между профессиональными навыками. Сейчас распределено ${profSpent}.`;
    const generalSpent = startingSkillSpent(startingGeneralSkills(draft));
    const generalBudget = creationGeneralBudget(draft);
    if (generalSpent > generalBudget) return `Общие навыки стоят ${generalSpent} очков при доступных ${generalBudget}.`;
    return "";
  }

  function createCharacterFromDraft(draft, name) {
    const error = validateCreationStep(draft);
    if (error) return { ok: false, error };
    const character = store.createCharacter(name || "Новый персонаж");
    character.personal.race = draft.race;
    character.personal.age = String(draft.age);
    character.personal.homeland = draft.backgroundMode === "manual" ? (draft.homeland || "").trim() : "";
    character.personal.professionId = draft.professionId;
    character.personal.profession = skills.findProfession(draft.professionId)?.name || "";
    character.attributes = { ...draft.attributes };
    character.creation = { method: "guided", backgroundMode: draft.backgroundMode, attributeMethod: draft.attributeMode, attributePool: draft.attributeMode === "points" ? Number(draft.attributePool) : null, attributeRolls: draft.attributeMode === "dice" ? [...draft.rolls] : [], professionSkillBudget: 44, generalSkillBudget: creationGeneralBudget(draft) };
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
    skills.setProfession(character, draft.professionId);
    const profession = skills.findProfession(draft.professionId);
    if (profession?.choice) skills.setProfessionChoices(character, profession.id, draft.professionChoices);
    if (profession?.languageChoices) skills.setProfessionLanguageChoices(character, profession.id, draft.professionLanguageChoices);
    skills.initializeCharacterSkills(character);
    const professionalRanks = new Map(professionSkillDescriptors(draft).map(skill => [skill.key, skill.rank]));
    for (const skill of character.skills) {
      if (skill.source === "profession") {
        const key = skill.professionSkillId || skill.catalogId;
        if (professionalRanks.has(key)) skill.rank = professionalRanks.get(key);
      } else if (skill.source === "general") skill.rank = draft.generalRanks?.[skill.languageId ? `language.${skill.languageId}` : skill.catalogId] ?? 0;
    }
    character.professionTrees[draft.professionId] = professionTrees.createProgress();
    skills.applyNativeLanguage(character);
    return { ok: true, character };
  }

  function rollAttributeAllocation(draft) {
    return creation.validateDiceAssignment(draft?.diceAssignments, draft?.rolls);
  }

  function allocateStartingSkill(draft, kind, key, value) {
    const list = kind === "profession" ? professionSkillDescriptors(draft) : startingGeneralSkills(draft);
    const entry = list.find(skill => skill.key === key);
    if (!entry) return { ok: false, message: "Навык не найден в распределении." };
    const rank = Number(value);
    const minimum = kind === "profession" ? 1 : 0;
    if (!Number.isInteger(rank) || rank < minimum || rank > creation.STARTING_SKILL_MAX) return { ok: false, message: `Рейтинг «${entry.name}» должен быть от ${minimum} до ${creation.STARTING_SKILL_MAX}.` };
    entry.rank = rank;
    const spent = startingSkillSpent(list);
    const budget = kind === "profession" ? creation.PROFESSION_SKILL_POINTS : creationGeneralBudget(draft);
    if (spent > budget) return { ok: false, message: `Не хватает очков: распределено ${spent}, доступно ${budget}.` };
    if (kind === "profession") draft.professionRanks[key] = rank;
    else draft.generalRanks[key] = rank;
    return { ok: true, key, rank, spent, budget };
  }

  function changeCreationAttribute(draft, code, delta) {
    if (!draft || !creation.ATTRIBUTES.includes(code)) return { ok: false, message: "Характеристика не найдена." };
    const current = Number(draft.attributes?.[code]);
    const next = current + Number(delta);
    if (!Number.isInteger(next) || next < 1 || next > 10) return { ok: false, message: "Характеристики при создании должны быть от 1 до 10." };
    const projected = { ...draft.attributes, [code]: next };
    const check = validateStartingAttributeAllocation(projected, draft.attributePool);
    if (!check.ok) return { ok: false, message: check.message };
    draft.attributes = projected;
    return { ok: true, attributes: { ...projected }, spent: check.spent, budget: Number(draft.attributePool) };
  }

  function setCreationAttributePool(draft, pool) {
    const value = Number(pool);
    if (!creation.POINT_BUY_POOLS.includes(value)) return { ok: false, message: "Выберите допустимый пул характеристик: 60, 70 или 80." };
    draft.attributePool = value;
    draft.attributes = creation.balancedAttributes(value);
    return { ok: true, pool: value, attributes: { ...draft.attributes } };
  }

  function setCreationAttributeMode(draft, mode) {
    if (mode === "points") {
      const pool = creation.POINT_BUY_POOLS.includes(Number(draft.attributePool)) ? Number(draft.attributePool) : 70;
      const result = setCreationAttributePool(draft, pool);
      draft.attributeMode = "points";
      return { ...result, mode };
    }
    if (mode !== "dice") return { ok: false, message: "Выберите броски или распределение очков." };
    draft.attributeMode = "dice";
    draft.rolls = creation.rollAttributes();
    draft.diceAssignments = {};
    draft.attributes = null;
    return { ok: true, mode, rolls: [...draft.rolls] };
  }

  function assignCreationDie(draft, code, rollIndex) {
    if (!creation.ATTRIBUTES.includes(code)) return { ok: false, message: "Характеристика не найдена." };
    const value = Number(rollIndex);
    if (!Number.isInteger(value) || value < 0 || value >= (draft.rolls || []).length) return { ok: false, message: "Бросок не найден." };
    const assignedElsewhere = Object.entries(draft.diceAssignments || {}).some(([otherCode, assigned]) => otherCode !== code && Number(assigned) === value);
    if (assignedElsewhere) return { ok: false, message: "Каждый результат можно назначить только одной характеристике." };
    draft.diceAssignments ||= {};
    draft.diceAssignments[code] = value;
    return { ok: true, assignments: { ...draft.diceAssignments } };
  }

  function setCreationChoices(draft, kind, selectedIds) {
    const profession = skills.findProfession(draft?.professionId);
    const isLanguage = kind === "language";
    const choice = isLanguage ? profession?.languageChoices : profession?.choice;
    if (!choice) return { ok: false, message: isLanguage ? "У этой профессии нет языковых специализаций." : "У этой профессии нет навыков на выбор." };
    const unique = [...new Set(selectedIds || [])];
    if (unique.length !== (selectedIds || []).length) return { ok: false, message: "Нельзя выбрать один вариант дважды." };
    if (unique.length > (isLanguage ? choice : choice.requiredCount)) return { ok: false, message: `Можно выбрать не больше ${isLanguage ? choice : choice.requiredCount} вариантов.` };
    const allowed = isLanguage ? skills.LANGUAGES.map(language => language.id) : choice.options;
    if (unique.some(id => !allowed.includes(id))) return { ok: false, message: "Выбор не входит в список профессии." };
    if (isLanguage) draft.professionLanguageChoices = unique;
    else draft.professionChoices = unique;
    return { ok: true, selectedIds: unique };
  }

  function updateCreationField(draft, field, value) {
    if (!draft || !["name", "race", "professionId", "age", "homeland", "witcherRisk", "backgroundMode", "generatedLifePath", "step"].includes(field)) return { ok: false, message: "Поле мастера создания недоступно." };
    if (field === "race" && value && !skills.RACES.includes(value)) return { ok: false, message: "Раса не найдена." };
    if (field === "professionId" && value && !skills.findProfession(value)) return { ok: false, message: "Профессия не найдена." };
    if (field === "backgroundMode" && !["manual", "random"].includes(value)) return { ok: false, message: "Неизвестный способ создания предыстории." };
    if (field === "witcherRisk" && !["cautious", "normal", "medium", "risky"].includes(value)) return { ok: false, message: "Неизвестный уровень риска." };
    draft[field] = value;
    if (field === "race" && draft.professionId && !creation.validRaceProfession(value, draft.professionId)) {
      draft.professionId = "";
      draft.professionChoices = [];
      draft.professionLanguageChoices = [];
      draft.professionRanks = {};
    }
    if (["race", "age", "homeland", "witcherRisk", "backgroundMode"].includes(field)) draft.generatedLifePath = null;
    if (field === "professionId") {
      draft.professionChoices = [];
      draft.professionLanguageChoices = [];
      draft.professionRanks = {};
    }
    return { ok: true, value: draft[field] };
  }

  function rollCreationAttributes(draft) {
    const result = rollAttributeAllocation(draft);
    if (!result.ok) return result;
    draft.attributes = result.attributes;
    return result;
  }

  function changeCreationSkill(draft, kind, key, delta) {
    const current = (kind === "profession" ? professionSkillDescriptors(draft) : startingGeneralSkills(draft))
      .find(skill => skill.key === key)?.rank;
    if (current === undefined) return { ok: false, message: "Навык не найден в распределении." };
    return allocateStartingSkill(draft, kind, key, Number(current) + Number(delta));
  }

  function advancementView(character) {
    const summary = advancement.draftSummary(character, professionTrees);
    const derived = rules.calculateAttributes(character);
    const attributes = rules.ATTRIBUTE_CODES.map(code => {
      const base = character.attributes?.[code];
      const pending = advancement.draftCount(character, "attributes", code);
      const rank = base === null || base === undefined ? null : Number(base) + pending;
      const cost = advancement.attributeUpgradeCost(rank);
      return { code, base: base ?? null, pending, rank, total: derived[code]?.total ?? null, cost,
        canBuy: cost !== null && summary.availablePoints >= cost,
        canUndo: pending > 0,
        status: base === null || base === undefined ? "set-base" : cost === null ? "max" : "ready" };
    });
    const skillsView = (character.skills || []).map(skill => {
      const definition = skills.SKILLS.find(entry => entry.id === skill.catalogId);
      const baseRank = (Number.isInteger(skill.rank) ? skill.rank : 0) + Number(skill.nativeBonus || 0);
      const pending = advancement.draftCount(character, "skills", skill.id);
      const rank = baseRank + pending;
      const cost = advancement.skillUpgradeCost(rank, Boolean(definition?.doubleCost));
      const type = skill.professionSkillId ? "Проф. умение" : skill.source === "profession" ? "Стартовый набор" : skill.source === "general" ? "Общий навык" : "Свой навык";
      return { id: skill.id, name: skill.name || "Без названия", attribute: skill.attribute, baseRank, pending, rank, cost,
        canBuy: cost !== null && summary.availablePoints >= cost, canUndo: pending > 0,
        doubleCost: Boolean(definition?.doubleCost), type };
    });
    const profession = skills.findCharacterProfession(character);
    const tree = profession && professionTrees.TREES[profession.id];
    const treeBranches = tree ? tree.branches.map(branch => ({ id: branch.id, name: branch.name, nodes: branch.nodes.map((node, index) => {
      const state = advancement.professionAbilityState(character, profession.id, branch.id, index, professionTrees);
      const cost = advancement.skillUpgradeCost(state.rank, false);
      return { professionId: profession.id, branchId: branch.id, index, name: node.name, ...state, cost,
        canBuy: state.unlocked && cost !== null && summary.availablePoints >= cost,
        canUndo: state.pending > 0, status: state.unlocked ? "Открыто" : "Закрыто до ранга 5 предыдущего узла" };
    }) })) : [];
    return { ...summary, attributes, skills: skillsView, profession: profession ? { id: profession.id, name: profession.name } : null, treeBranches };
  }

  function stageImprovement(character, kind, key, detail = {}) {
    if (kind === "attribute") return advancement.stageAttributeUpgrade(character, key);
    if (kind === "skill") {
      const skill = character?.skills?.find(entry => entry.id === key);
      const definition = skills.SKILLS.find(entry => entry.id === skill?.catalogId);
      return skill ? advancement.stageSkillUpgrade(character, key, definition || {}) : { ok: false, message: "Навык не найден." };
    }
    if (kind === "professionAbility") return advancement.stageProfessionAbilityUpgrade(character, detail.professionId, detail.branchId, detail.index, professionTrees);
    return { ok: false, message: "Неизвестный вид улучшения." };
  }

  function setCharacterAttribute(character, code, part, value) {
    if (!store.ATTRIBUTES.includes(code)) return { ok: false, message: "Характеристика не найдена." };
    if (!["base", "permanent", "temporary"].includes(part)) return { ok: false, message: "Неизвестная часть характеристики." };
    if (!validAttributeValue(part, value)) return { ok: false, message: "Недопустимое значение характеристики." };
    if (part === "base" && advancement.draftCount(character, "attributes", code) > 0) return { ok: false, message: "Сначала примените или отмените черновые улучшения этой характеристики." };
    if (part === "base") character.attributes[code] = value === "" ? null : value;
    else {
      character.attributeModifiers ||= {};
      character.attributeModifiers[code] ||= { permanent: 0, temporary: 0 };
      character.attributeModifiers[code][part] = value ?? 0;
    }
    return { ok: true, value: part === "base" ? character.attributes[code] : character.attributeModifiers[code][part], total: rules.calculateAttributes(character)[code]?.total ?? null };
  }

  function setCharacterProfession(character, professionId) {
    if (professionId && !skills.findProfession(professionId)) return { ok: false, message: "Профессия не найдена." };
    if (professionId && !creation.validRaceProfession(character.personal?.race, professionId)) return { ok: false, message: "Эта раса не может выбрать указанную профессию." };
    if (advancement.draftSummary(character, professionTrees).hasDraft) return { ok: false, message: "Перед сменой профессии примените прокачку или отмените черновик." };
    skills.setProfession(character, professionId);
    if (!professionId) character.professionSkillChoices = {};
    return { ok: true };
  }

  function setCharacterRace(character, race) {
    if (race && !skills.RACES.includes(race)) return { ok: false, message: "Раса не найдена." };
    const professionId = character.personal?.professionId;
    if (race && professionId && !creation.validRaceProfession(race, professionId)) return { ok: false, message: "Эта раса несовместима с выбранной профессией по правилам." };
    character.personal.race = race;
    return { ok: true };
  }

  function removeSkill(character, skillId) {
    const skill = character?.skills?.find(entry => entry.id === skillId);
    if (!skill) return { ok: false, message: "Навык не найден." };
    if (!new Set(["custom", "other"]).has(skill.source)) return { ok: false, message: "Этот навык нельзя удалить из листа." };
    while (advancement.draftCount(character, "skills", skillId) > 0) {
      const result = undoImprovement(character, "skill", skillId);
      if (!result.ok) return result;
    }
    character.skills = character.skills.filter(entry => entry.id !== skillId);
    return { ok: true };
  }

  function updateCharacterField(character, path, value) {
    const segments = String(path || "").split(".");
    const roots = new Set(["personal", "state", "attributes", "attributeModifiers", "equipment", "lifePath", "magic", "notes", "creation", "updatedAt"]);
    if (segments.length < 1 || !roots.has(segments[0]) || segments.some(part => !part || ["__proto__", "prototype", "constructor"].includes(part))) return { ok: false, message: "Поле персонажа недоступно для изменения." };
    if (segments[0] === "attributes" && segments.length === 2) return setCharacterAttribute(character, segments[1], "base", value);
    if (segments[0] === "attributeModifiers" && segments.length === 3) return setCharacterAttribute(character, segments[1], segments[2], value);
    if (segments[0] === "personal" && segments[1] === "race") return setCharacterRace(character, value);
    if (segments[0] === "personal" && segments[1] === "professionId") return setCharacterProfession(character, value);
    if (segments[0] === "state" && segments[1] === "currentLuck") {
      const luck = Number(value);
      if (!Number.isFinite(luck) || luck < 0 || luck > 100000) return { ok: false, message: "Удача должна быть неотрицательным числом." };
    }
    if (["state.currentHp", "state.currentSta", "state.currentLuck", "state.currentReputation", "magic.vigorModifier"].includes(segments.join("."))) {
      const n = value === null || value === "" ? null : Number(value);
      const minimum = segments.join(".") === "magic.vigorModifier" ? -100000 : 0;
      if (n !== null && (!Number.isFinite(n) || n < minimum || n > 100000)) return { ok: false, message: "Числовое значение вне допустимого диапазона." };
      value = n;
    }
    if (segments.join(".") === "state.conditions" && !Array.isArray(value)) return { ok: false, message: "Список состояний должен быть массивом." };
    let target = character;
    for (const part of segments.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object") return { ok: false, message: "Раздел листа не найден." };
      target = target[part];
    }
    target[segments.at(-1)] = value;
    return { ok: true, value };
  }

  function readRaw(storage, key) { return storage.getItem(key); }
  function writeRaw(storage, key, value) { storage.setItem(key, value); return true; }
  function backupRaw(storage, sourceKey, backupKey) {
    const raw = storage.getItem(sourceKey);
    if (raw === null) return { ok: true, backedUp: false };
    storage.setItem(backupKey, raw);
    return { ok: true, backedUp: true, raw };
  }

  function setActiveCharacter(storeValue, characterId) {
    const character = storeValue?.characters?.find(entry => entry.characterId === characterId);
    if (!character) return { ok: false, message: "Персонаж не найден." };
    storeValue.activeCharacterId = characterId;
    return { ok: true, character };
  }

  function addCharacterToStore(storeValue, character) {
    if (!Array.isArray(storeValue?.characters) || !character?.characterId || storeValue.characters.some(entry => entry.characterId === character.characterId)) return { ok: false, message: "Нельзя добавить персонажа с таким ID." };
    storeValue.characters.push(character);
    storeValue.activeCharacterId = character.characterId;
    return { ok: true, character };
  }

  function removeCharacterFromStore(storeValue, characterId) {
    if (!Array.isArray(storeValue?.characters) || storeValue.characters.length <= 1) return { ok: false, message: "В хранилище должен остаться хотя бы один персонаж." };
    const index = storeValue.characters.findIndex(entry => entry.characterId === characterId);
    if (index < 0) return { ok: false, message: "Персонаж не найден." };
    const [character] = storeValue.characters.splice(index, 1);
    if (storeValue.activeCharacterId === characterId) storeValue.activeCharacterId = storeValue.characters[0].characterId;
    return { ok: true, character, activeCharacterId: storeValue.activeCharacterId };
  }

  const recordCollections = Object.freeze({
    skills: character => character.skills,
    abilities: character => character.abilities,
    outcomes: character => character.lifePath.outcomes,
    wounds: character => character.state.wounds,
    magicEntries: character => character.magic.entries,
    inventoryItems: character => character.equipment.items,
  });
  const recordFields = Object.freeze({
    skills: new Set(["name", "attribute", "permanentModifier", "temporaryModifier"]),
    abilities: new Set(["name", "description"]),
    outcomes: new Set(["type", "description", "source"]),
    wounds: new Set(["location", "title", "description", "status"]),
    magicEntries: new Set(["kind", "name", "catalogRef", "cost", "effect", "range", "duration", "time", "difficulty", "components", "notes"]),
    inventoryItems: new Set(["quantity", "unitWeightKg", "conditionNotes", "armorEv"]),
  });

  function getRecords(character, collection) {
    const getter = recordCollections[collection];
    if (!getter) return null;
    const records = getter(character);
    return Array.isArray(records) ? records : null;
  }

  function updateCharacterRecord(character, collection, id, field, value) {
    const records = getRecords(character, collection);
    const record = records?.find(entry => entry.id === id);
    if (!record || !recordFields[collection]?.has(field)) return { ok: false, message: "Запись или поле не найдены." };
    if (collection === "inventoryItems") {
      if (field === "quantity" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) return { ok: false, message: "Количество должно быть больше нуля." };
      if (["unitWeightKg", "armorEv"].includes(field) && value !== null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || (field === "armorEv" && Number(value) > 100))) return { ok: false, message: "Недопустимое значение веса или EV." };
      if (["unitWeightKg", "armorEv"].includes(field)) value = value === "" ? null : value === null ? null : Number(value);
      if (field === "quantity") value = Number(value);
    }
    if (["permanentModifier", "temporaryModifier"].includes(field)) {
      const modifier = Number(value);
      if (!Number.isInteger(modifier) || modifier < -1000 || modifier > 1000) return { ok: false, message: "Модификатор навыка должен быть от −1000 до 1000." };
      value = modifier;
    }
    record[field] = value;
    return { ok: true, record };
  }

  function addCharacterRecord(character, collection, record) {
    const records = getRecords(character, collection);
    if (!records || !record || typeof record.id !== "string" || records.some(entry => entry.id === record.id)) return { ok: false, message: "Нельзя добавить эту запись." };
    records.push(record);
    return { ok: true, record };
  }

  function removeCharacterRecord(character, collection, id) {
    const records = getRecords(character, collection);
    if (!records) return { ok: false, message: "Раздел листа не найден." };
    const index = records.findIndex(record => record.id === id);
    if (index < 0) return { ok: false, message: "Запись не найдена." };
    records.splice(index, 1);
    return { ok: true };
  }

  function updateGeneratedRelativeName(character, relativeId, name) {
    const relative = character?.lifePath?.generated?.relatives?.find(entry => entry.id === relativeId);
    if (!relative) return { ok: false, message: "Связанный персонаж не найден." };
    relative.name = String(name ?? "").slice(0, 200);
    return { ok: true, record: relative };
  }

  function addInventoryItem(character, entry, separate = false) {
    const entries = character?.equipment?.items;
    if (!Array.isArray(entries) || !entry?.id) return { ok: false, message: "Предмет инвентаря не задан." };
    const existing = !separate && entry.itemId ? entries.find(item => item.itemId === entry.itemId) : null;
    if (existing) {
      existing.quantity = Number(existing.quantity) + Number(entry.quantity);
      if (entry.unitWeightKg !== null && entry.unitWeightKg !== undefined) existing.unitWeightKg = entry.unitWeightKg;
      return { ok: true, entry: existing, merged: true };
    }
    if (entries.some(item => item.id === entry.id)) return { ok: false, message: "ID предмета уже используется." };
    entries.push(entry);
    return { ok: true, entry, merged: false };
  }

  function removeInventoryItem(character, entryId) {
    const entries = character?.equipment?.items;
    const entry = entries?.find(item => item.id === entryId);
    if (!entry) return { ok: false, message: "Предмет не найден в инвентаре." };
    const combat = character.equipment.combat;
    for (const slot of Object.values(combat?.armorByZone || {})) if (slot.inventoryEntryId === entryId) slot.inventoryEntryId = null;
    for (const weapon of combat?.weapons || []) if (weapon.inventoryEntryId === entryId) weapon.inventoryEntryId = null;
    if (combat?.shield?.inventoryEntryId === entryId) combat.shield.inventoryEntryId = null;
    entries.splice(entries.indexOf(entry), 1);
    return { ok: true };
  }

  function clearInventory(character) {
    const entries = character?.equipment?.items;
    if (!Array.isArray(entries)) return { ok: false, message: "Инвентарь не найден." };
    for (const entry of [...entries]) removeInventoryItem(character, entry.id);
    return { ok: true };
  }

  function addCombatWeapon(character, id) {
    const weapons = character?.equipment?.combat?.weapons;
    if (!Array.isArray(weapons) || weapons.length >= 2) return { ok: false, message: "Можно вести не больше двух слотов оружия." };
    if (weapons.some(weapon => weapon.id === id)) return { ok: false, message: "ID слота оружия уже используется." };
    const slot = weapons.some(weapon => weapon.slot === "primary") ? "backup" : "primary";
    const weapon = { id, slot, inventoryEntryId: null, name: "", reliability: "" };
    weapons.push(weapon);
    return { ok: true, weapon };
  }

  function removeCombatWeapon(character, id) {
    const weapons = character?.equipment?.combat?.weapons;
    const index = weapons?.findIndex(weapon => weapon.id === id) ?? -1;
    if (index < 0) return { ok: false, message: "Слот оружия не найден." };
    weapons.splice(index, 1);
    return { ok: true };
  }

  function setCombatShield(character, shield) {
    if (!character?.equipment?.combat) return { ok: false, message: "Боевой раздел не найден." };
    if (shield && shield.inventoryEntryId && !character.equipment.items.some(item => item.id === shield.inventoryEntryId)) return { ok: false, message: "Предмет не найден в инвентаре." };
    character.equipment.combat.shield = shield;
    return { ok: true };
  }

  function setCombatSlotField(character, kind, slotKey, field, value, catalog = {}) {
    const combat = character.equipment?.combat;
    if (!combat) return { ok: false, message: "Боевой раздел не найден." };
    if (kind === "armor") {
      const slot = combat.armorByZone?.[slotKey];
      if (!slot) return { ok: false, message: "Зона брони не найдена." };
      if (field === "inventoryEntryId") {
        if (value && !character.equipment.items.some(entry => entry.id === value)) return { ok: false, message: "Предмет не найден в инвентаре." };
        slot.inventoryEntryId = value || null;
        slot.currentSP = value && catalog.armorRating !== null && catalog.armorRating !== undefined ? Number(catalog.armorRating) : null;
        slot.damage = "";
      } else if (field === "currentSP") {
        const n = value === "" || value === null ? null : Number(value);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return { ok: false, message: "Текущая прочность не может быть отрицательной." };
        slot.currentSP = n;
      } else if (["damage", "notes"].includes(field)) slot[field] = value;
      else return { ok: false, message: "Поле зоны брони недоступно." };
      return { ok: true, record: slot };
    }
    if (kind === "weapon") {
      const weapon = combat.weapons.find(entry => entry.id === slotKey);
      if (!weapon) return { ok: false, message: "Слот оружия не найден." };
      if (field === "slot") {
        if (!["primary", "backup"].includes(value)) return { ok: false, message: "Недопустимый слот оружия." };
        if (combat.weapons.some(entry => entry !== weapon && entry.slot === value)) return { ok: false, message: "Этот слот оружия уже занят." };
        weapon.slot = value;
      } else if (field === "inventoryEntryId") {
        if (value && !character.equipment.items.some(entry => entry.id === value)) return { ok: false, message: "Предмет не найден в инвентаре." };
        if (value && combat.weapons.some(entry => entry !== weapon && entry.inventoryEntryId === value)) return { ok: false, message: "Предмет уже назначен другому слоту оружия." };
        weapon.inventoryEntryId = value || null;
        weapon.name = catalog.name || "";
        weapon.reliability = catalog.reliability == null ? "" : String(catalog.reliability);
      } else if (["name", "reliability", "currentSP", "damage"].includes(field)) weapon[field] = value;
      else return { ok: false, message: "Поле оружия недоступно." };
      return { ok: true, record: weapon };
    }
    if (kind === "shield") {
      if (!combat.shield) return { ok: false, message: "Слот щита отсутствует." };
      if (field === "inventoryEntryId") {
        if (value && !character.equipment.items.some(entry => entry.id === value)) return { ok: false, message: "Предмет не найден в инвентаре." };
        combat.shield.inventoryEntryId = value || null;
      } else if (field === "currentSP") {
        const n = value === "" || value === null ? null : Number(value);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return { ok: false, message: "Текущая прочность не может быть отрицательной." };
        combat.shield.currentSP = n;
      } else if (["damage", "notes"].includes(field)) combat.shield[field] = value;
      else return { ok: false, message: "Поле щита недоступно." };
      return { ok: true, record: combat.shield };
    }
    return { ok: false, message: "Неизвестный тип боевого слота." };
  }

  function ensureProfessionTree(character, professionId) {
    return professionTrees.ensureProgress(character, professionId);
  }

  function undoImprovement(character, kind, key, detail = {}) {
    if (kind === "attribute") return advancement.undoAttributeUpgrade(character, key);
    if (kind === "skill") {
      const skill = character?.skills?.find(entry => entry.id === key);
      const definition = skills.SKILLS.find(entry => entry.id === skill?.catalogId);
      return skill ? advancement.undoSkillUpgrade(character, key, definition || {}) : { ok: false, message: "Навык не найден." };
    }
    if (kind === "professionAbility") return advancement.undoProfessionAbilityUpgrade(character, detail.professionId, detail.branchId, detail.index, professionTrees);
    return { ok: false, message: "Неизвестный вид улучшения." };
  }

  function validAttributeValue(part, value) {
    if (value === null || value === undefined || value === "") return true;
    const number = Number(value);
    if (!Number.isInteger(number)) return false;
    return part === "base" ? number >= 0 && number <= 1000 : number >= -1000 && number <= 1000;
  }

  const api = {
    attributes: store.ATTRIBUTES,
    storageKeys: Object.freeze({ characters: store.STORAGE_KEY, legacyInventory: store.LEGACY_INVENTORY_KEY }),
    loadCharacters: (...args) => store.load(...args),
    saveCharacters: (...args) => store.save(...args),
    createCharacterStore: (...args) => store.createStore(...args),
    readRaw, writeRaw, backupRaw,
    copyCharacter: (...args) => store.copyCharacter(...args),
    createBackup: (...args) => store.createBackup(...args),
    parseImport: (...args) => store.parseImport(...args),
    races: skills.RACES, genders: skills.GENDERS, languages: skills.LANGUAGES, skillDefinitions: skills.SKILLS,
    professions: skills.PROFESSIONS, combatSkills: skills.COMBAT_SKILLS, raceTraits: creation.RACE_TRAITS,
    attributeCodes: rules.ATTRIBUTE_CODES, pointBuyPools: creation.POINT_BUY_POOLS,
    professionTrees: deepFreeze({ ...professionTrees.TREES }),
    findProfession: skills.findProfession, findCharacterProfession: skills.findCharacterProfession,
    languageForHomeland: skills.languageForHomeland, setProfession: skills.setProfession,
    setProfessionChoices: skills.setProfessionChoices, setProfessionLanguageChoices: skills.setProfessionLanguageChoices,
    applyNativeLanguage: skills.applyNativeLanguage, initializeCharacterSkills: skills.initializeCharacterSkills,
    setCharacterProfession, setCharacterRace, setCharacterAttribute, removeSkill,
    setActiveCharacter, addCharacterToStore, removeCharacterFromStore,
    updateCharacterField, addCharacterRecord, updateCharacterRecord, removeCharacterRecord, setCombatSlotField,
    updateGeneratedRelativeName, addInventoryItem, removeInventoryItem, clearInventory,
    addCombatWeapon, removeCombatWeapon, setCombatShield,
    generateLifePath: creation.generateLifePath, balancedAttributes: creation.balancedAttributes,
    validRaceProfession: creation.validRaceProfession, rollAttributes: creation.rollAttributes,
    calculateAttributes: rules.calculateAttributes, deriveCharacter: rules.deriveCharacter,
    getProfessionNodeState: professionTrees.getNodeState,
    ensureProfessionTree,
    getAdvancementView: advancementView, stageImprovement, undoImprovement,
    applyAdvancement: (character) => advancement.applyDraft(character, professionTrees),
    cancelAdvancement: (character) => advancement.cancelDraft(character, professionTrees),
    awardImprovementPoints: advancement.awardPoints,
    inventoryWeight, armorLoadoutStats, isShieldEquipment, combatItemAllowed, armorCoversZone,
    professionSkillDescriptors, startingGeneralSkills, startingSkillCost, startingSkillSpent, creationGeneralBudget,
    creationView, setCreationAttributePool, setCreationAttributeMode, assignCreationDie, setCreationChoices, updateCreationField, rollCreationAttributes,
    validateCreationStep, rollAttributeAllocation, allocateStartingSkill, changeCreationAttribute,
    changeCreationSkill, validAttributeValue, createCharacterFromDraft,
  };
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return Object.freeze(api);
});
