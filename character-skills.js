(function (root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
  if (root) root.CharacterSkills = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RACES = Object.freeze(["Человек", "Эльф", "Краснолюд", "Ведьмак"]);
  const GENDERS = Object.freeze(["Мужской", "Женский", "Другое"]);

  const SKILLS = Object.freeze([
    { id: "awareness", name: "Внимание", attribute: "INT" },
    { id: "wilderness-survival", name: "Выживание в дикой природе", attribute: "INT" },
    { id: "deduction", name: "Дедукция", attribute: "INT" },
    { id: "monster-lore", name: "Монстрология", attribute: "INT", doubleCost: true },
    { id: "education", name: "Образование", attribute: "INT" },
    { id: "streetwise", name: "Ориентирование в городе", attribute: "INT" },
    { id: "teaching", name: "Передача знаний", attribute: "INT" },
    { id: "tactics", name: "Тактика", attribute: "INT", doubleCost: true },
    { id: "trade", name: "Торговля", attribute: "INT" },
    { id: "etiquette", name: "Этикет", attribute: "INT" },
    { id: "language", name: "Язык", attribute: "INT", doubleCost: true },
    { id: "melee", name: "Ближний бой", attribute: "REF" },
    { id: "brawling", name: "Борьба", attribute: "REF" },
    { id: "riding", name: "Верховая езда", attribute: "REF" },
    { id: "polearms", name: "Владение древковым оружием", attribute: "REF" },
    { id: "light-blades", name: "Владение лёгкими клинками", attribute: "REF" },
    { id: "swordsmanship", name: "Владение мечом", attribute: "REF" },
    { id: "seamanship", name: "Мореплавство", attribute: "REF" },
    { id: "dodge-evade", name: "Уклонение/Изворотливость", attribute: "REF" },
    { id: "athletics", name: "Атлетика", attribute: "DEX" },
    { id: "sleight-of-hand", name: "Ловкость рук", attribute: "DEX" },
    { id: "stealth", name: "Скрытность", attribute: "DEX" },
    { id: "crossbow", name: "Стрельба из арбалета", attribute: "DEX" },
    { id: "bow", name: "Стрельба из лука", attribute: "DEX" },
    { id: "strength", name: "Сила", attribute: "BODY" },
    { id: "endurance", name: "Стойкость", attribute: "BODY" },
    { id: "gambling", name: "Азартные игры", attribute: "EMP" },
    { id: "appearance", name: "Внешний вид", attribute: "EMP" },
    { id: "performance", name: "Выступление", attribute: "EMP" },
    { id: "art", name: "Искусство", attribute: "EMP" },
    { id: "leadership", name: "Лидерство", attribute: "EMP" },
    { id: "deceit", name: "Обман", attribute: "EMP" },
    { id: "human-perception", name: "Понимание людей", attribute: "EMP" },
    { id: "seduction", name: "Соблазнение", attribute: "EMP" },
    { id: "persuasion", name: "Убеждение", attribute: "EMP" },
    { id: "charisma", name: "Харизма", attribute: "EMP" },
    { id: "alchemy", name: "Алхимия", attribute: "CRA", doubleCost: true },
    { id: "lockpicking", name: "Взлом замков", attribute: "CRA" },
    { id: "trap-knowledge", name: "Знание ловушек", attribute: "CRA", doubleCost: true },
    { id: "crafting", name: "Изготовление", attribute: "CRA", doubleCost: true },
    { id: "disguise", name: "Маскировка", attribute: "CRA" },
    { id: "first-aid", name: "Первая помощь", attribute: "CRA" },
    { id: "forgery", name: "Подделывание", attribute: "CRA" },
    { id: "intimidation", name: "Запугивание", attribute: "WILL" },
    { id: "hexing", name: "Наведение порчи", attribute: "WILL", doubleCost: true },
    { id: "rituals", name: "Проведение ритуалов", attribute: "WILL", doubleCost: true },
    { id: "resist-magic", name: "Сопротивление магии", attribute: "WILL", doubleCost: true },
    { id: "resist-persuasion", name: "Сопротивление убеждению", attribute: "WILL" },
    { id: "spellcasting", name: "Сотворение заклинаний", attribute: "WILL", doubleCost: true },
    { id: "courage", name: "Храбрость", attribute: "WILL" },
  ]);

  const BY_ID = new Map(SKILLS.map(skill => [skill.id, skill]));
  const COMBAT_SKILLS = Object.freeze([
    "athletics", "melee", "brawling", "riding", "polearms",
    "light-blades", "swordsmanship", "crossbow", "bow", "tactics",
  ]);

  const PROFESSIONS = Object.freeze([
    {
      id: "bard", name: "Бард", defining: { name: "Уличное выступление", attribute: "EMP" },
      skills: ["charisma", "deceit", "performance", "human-perception", "persuasion", "streetwise", "art", "seduction", "etiquette"],
      languageChoices: 1,
    },
    {
      id: "witcher", name: "Ведьмак", defining: { name: "Подготовка ведьмака", attribute: "INT" },
      skills: ["awareness", "deduction", "spellcasting", "alchemy", "dodge-evade", "wilderness-survival", "swordsmanship", "athletics", "stealth", "riding"],
    },
    {
      id: "warrior", name: "Воин", defining: { name: "Крепче стали", attribute: "BODY" },
      skills: ["wilderness-survival", "courage", "strength", "intimidation", "dodge-evade"],
      choice: { id: "warrior-combat", label: "Выберите 5 боевых навыков", requiredCount: 5, options: COMBAT_SKILLS },
    },
    {
      id: "priest", name: "Жрец", defining: { name: "Посвящённый", attribute: "EMP" },
      skills: ["rituals", "leadership", "courage", "human-perception", "hexing", "first-aid", "charisma", "wilderness-survival", "teaching", "spellcasting"],
    },
    {
      id: "mage", name: "Маг", defining: { name: "Магические познания", attribute: "INT" },
      skills: ["human-perception", "spellcasting", "hexing", "resist-magic", "polearms", "education", "rituals", "etiquette", "seduction", "appearance"],
    },
    {
      id: "doctor", name: "Медик", defining: { name: "Лечащее прикосновение", attribute: "CRA" },
      skills: ["resist-persuasion", "charisma", "etiquette", "courage", "human-perception", "wilderness-survival", "trade", "deduction", "light-blades", "alchemy"],
    },
    {
      id: "criminal", name: "Преступник", defining: { name: "Профессиональная паранойя", attribute: "INT" },
      skills: ["sleight-of-hand", "lockpicking", "streetwise", "forgery", "deceit", "stealth", "intimidation", "light-blades", "athletics", "awareness"],
    },
    {
      id: "craftsman", name: "Ремесленник", defining: { name: "Быстрый ремонт", attribute: "CRA" },
      skills: ["crafting", "trade", "athletics", "endurance", "strength", "streetwise", "art", "alchemy", "education", "persuasion"],
    },
    {
      id: "merchant", name: "Торговец", defining: { name: "Бывалый путешественник", attribute: "INT" },
      skills: ["charisma", "light-blades", "education", "streetwise", "trade", "persuasion", "human-perception", "gambling", "resist-persuasion"],
      languageChoices: 2,
    },
  ]);

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function findProfession(idOrName) {
    const value = String(idOrName || "").trim().toLocaleLowerCase("ru-RU");
    return PROFESSIONS.find(profession => profession.id === value || profession.name.toLocaleLowerCase("ru-RU") === value) || null;
  }

  function findCharacterProfession(character) {
    return findProfession(character?.personal?.professionId) || findProfession(character?.personal?.profession);
  }

  function ensureGeneralSkills(character) {
    if (!Array.isArray(character.skills)) character.skills = [];
    for (const skill of character.skills) {
      const match = SKILLS.find(entry => entry.name === skill.name && entry.attribute === skill.attribute);
      if (match && !skill.professionSkillId) skill.catalogId ||= match.id;
      if (!skill.source) skill.source = skill.catalogId ? "general" : "custom";
    }
    for (const definition of SKILLS) {
      let skill = character.skills.find(entry => entry.catalogId === definition.id && !entry.professionSkillId);
      if (!skill) {
        skill = character.skills.find(entry => entry.name === definition.name && entry.attribute === definition.attribute && !entry.professionSkillId);
        if (skill) skill.catalogId = definition.id;
      }
      if (!skill) {
        skill = {
          id: makeId(), catalogId: definition.id, source: "general", name: definition.name,
          attribute: definition.attribute, rank: 0, permanentModifier: 0, temporaryModifier: 0,
        };
        character.skills.push(skill);
      } else {
        skill.source ||= "general";
        if (skill.rank === null || skill.rank === undefined) skill.rank = 0;
      }
    }
  }

  function getSkill(character, definition) {
    return character.skills.find(skill => skill.catalogId === definition.id && !skill.professionSkillId)
      || character.skills.find(skill => skill.name === definition.name && skill.attribute === definition.attribute && !skill.professionSkillId);
  }

  function professionSkillRecord(character, definition, profession, slotId = null, displayName = null) {
    let skill = slotId
      ? character.skills.find(entry => entry.professionSkillId === slotId)
      : getSkill(character, definition);
    if (!skill) {
      skill = {
        id: makeId(), name: displayName || definition.name, attribute: definition.attribute,
        rank: 1, permanentModifier: 0, temporaryModifier: 0,
      };
      character.skills.push(skill);
    }
    skill.catalogId = definition.id;
    skill.source = "profession";
    skill.professionId = profession.id;
    if (slotId) skill.professionSkillId = slotId;
    skill.name = displayName || definition.name;
    skill.attribute = definition.attribute;
    if (skill.rank === null || skill.rank === undefined || Number(skill.rank) < 1) skill.rank = 1;
    skill.permanentModifier ??= 0;
    skill.temporaryModifier ??= 0;
    return skill;
  }

  function applyProfession(character, professionId = character?.personal?.professionId) {
    const profession = findProfession(professionId);
    for (const skill of character.skills) {
      if (skill.source === "profession") {
        skill.source = skill.catalogId && !skill.professionSkillId ? "general" : "other";
        skill.professionId = null;
      }
    }
    if (!profession) {
      character.personal.profession = "";
      character.personal.professionId = "";
      return;
    }
    character.personal.profession = profession.name;
    character.personal.professionId = profession.id;
    ensureGeneralSkills(character);

    const defining = {
      id: `defining-${profession.id}`, name: profession.defining.name,
      attribute: profession.defining.attribute,
    };
    professionSkillRecord(character, defining, profession, `${profession.id}.defining`, profession.defining.name);

    for (const skillId of profession.skills) {
      const definition = BY_ID.get(skillId);
      if (definition) professionSkillRecord(character, definition, profession);
    }

    if (profession.languageChoices) {
      const definition = BY_ID.get("language");
      const displayName = `Язык (выберите ${profession.languageChoices})`;
      const skill = professionSkillRecord(character, definition, profession, `${profession.id}.language`, displayName);
      skill.specializationCount = profession.languageChoices;
    }

    const choices = character.professionSkillChoices?.[profession.id] || [];
    for (const skillId of choices) {
      const definition = BY_ID.get(skillId);
      if (definition && profession.choice?.options.includes(skillId)) professionSkillRecord(character, definition, profession);
    }
  }

  function initializeCharacterSkills(character) {
    const before = JSON.stringify({ skills: character.skills, professionId: character.personal?.professionId, profession: character.personal?.profession });
    ensureGeneralSkills(character);
    const profession = findCharacterProfession(character);
    if (profession) applyProfession(character, profession.id);
    return before !== JSON.stringify({ skills: character.skills, professionId: character.personal?.professionId, profession: character.personal?.profession });
  }

  function setProfession(character, professionId) {
    applyProfession(character, professionId);
  }

  function setProfessionChoices(character, professionId, selectedIds) {
    const profession = findProfession(professionId);
    if (!profession?.choice) return { ok: false, message: "У этой профессии нет набора навыков на выбор." };
    const unique = [...new Set(selectedIds)];
    if (unique.length > profession.choice.requiredCount) {
      return { ok: false, message: `Нужно выбрать ровно ${profession.choice.requiredCount} навыков.` };
    }
    if (unique.some(id => !profession.choice.options.includes(id))) {
      return { ok: false, message: "В выборе есть навык вне списка профессии." };
    }
    character.professionSkillChoices ||= {};
    character.professionSkillChoices[profession.id] = unique;
    applyProfession(character, profession.id);
    return { ok: true, selectedIds: unique };
  }

  function createCustomSkill() {
    return { id: makeId(), name: "", attribute: null, rank: null, permanentModifier: 0, temporaryModifier: 0, source: "custom" };
  }

  function getProfessionSkillCount(character, professionId) {
    return character.skills.filter(skill => skill.source === "profession" && skill.professionId === professionId).length;
  }

  return Object.freeze({
    RACES, GENDERS, SKILLS, PROFESSIONS, COMBAT_SKILLS,
    findProfession, findCharacterProfession, initializeCharacterSkills, setProfession,
    setProfessionChoices, createCustomSkill, getProfessionSkillCount,
  });
});
