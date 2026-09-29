const assert = require("node:assert/strict");
const test = require("node:test");
const CharacterStore = require("../character-store.js");
const CharacterSkills = require("../character-skills.js");
const CharacterRules = require("../character-rules.js");

test("new character receives every common skill with its leading attribute", () => {
  const character = CharacterStore.createCharacter("Новый лист");
  CharacterSkills.initializeCharacterSkills(character);

  const general = character.skills.filter(skill => skill.source === "general");
  assert.equal(CharacterSkills.SKILLS.length, 50);
  assert.equal(general.length, CharacterSkills.SKILLS.length - 1 + CharacterSkills.LANGUAGES.length);
  assert.deepEqual(
    general.filter(skill => !skill.languageId).map(skill => skill.catalogId).sort(),
    CharacterSkills.SKILLS.filter(skill => skill.id !== "language").map(skill => skill.id).sort(),
  );
  assert.deepEqual(general.filter(skill => skill.languageId).map(skill => skill.languageId).sort(), CharacterSkills.LANGUAGES.map(language => language.id).sort());
  assert.ok(general.every(skill => skill.rank === 0 && skill.attribute));
  assert.equal(CharacterSkills.SKILLS.find(skill => skill.id === "etiquette").attribute, "INT");
});

test("selecting a profession adds its defining skill and ten professional skills", () => {
  for (const profession of CharacterSkills.PROFESSIONS) {
    const character = CharacterStore.createCharacter();
    CharacterSkills.initializeCharacterSkills(character);
    CharacterSkills.setProfession(character, profession.id);
    if (profession.languageChoices) {
      const selected = CharacterSkills.LANGUAGES.slice(0, profession.languageChoices).map(language => language.id);
      assert.equal(CharacterSkills.setProfessionLanguageChoices(character, profession.id, selected).ok, true);
    }

    const professional = character.skills.filter(skill => skill.source === "profession" && skill.professionId === profession.id);
    const expected = profession.id === "warrior" ? 6 : 1 + profession.skills.length + (profession.languageChoices || 0);
    assert.equal(professional.length, expected, profession.name);
    assert.equal(professional.find(skill => skill.professionSkillId === `${profession.id}.defining`).name, profession.defining.name);
    assert.ok(professional.every(skill => skill.rank >= 1));
    if (profession.languageChoices) {
      const languageSkills = professional.filter(skill => skill.languageId);
      assert.equal(languageSkills.length, profession.languageChoices);
      assert.equal(new Set(languageSkills.map(skill => skill.languageId)).size, profession.languageChoices);
    }
  }
});

test("warrior choice contains the book's ten combat skills and supports five selected skills", () => {
  const warrior = CharacterSkills.findProfession("warrior");
  const character = CharacterStore.createCharacter();
  CharacterSkills.initializeCharacterSkills(character);
  CharacterSkills.setProfession(character, warrior.id);

  assert.equal(warrior.choice.options.length, 10);
  const selection = warrior.choice.options.slice(0, 5);
  assert.equal(CharacterSkills.setProfessionChoices(character, warrior.id, selection).ok, true);
  assert.equal(CharacterSkills.getProfessionSkillCount(character, warrior.id), 11);
  assert.equal(CharacterSkills.setProfessionChoices(character, warrior.id, warrior.choice.options.slice(0, 6)).ok, false);
});

test("profession, starting skills, and warrior choices survive JSON save and reload", () => {
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  const characterStore = CharacterStore.createStore("Лист");
  const character = characterStore.characters[0];
  CharacterSkills.initializeCharacterSkills(character);
  CharacterSkills.setProfession(character, "warrior");
  const selected = CharacterSkills.findProfession("warrior").choice.options.slice(0, 5);
  CharacterSkills.setProfessionChoices(character, "warrior", selected);
  character.professionLanguageChoices.bard = ["elder-speech"];
  character.skills.find(skill => skill.catalogId === "athletics").rank = 4;
  CharacterStore.save(localStorage, characterStore);

  const loaded = CharacterStore.load(localStorage).store.characters[0];
  CharacterSkills.initializeCharacterSkills(loaded);
  assert.equal(loaded.personal.professionId, "warrior");
  assert.deepEqual(loaded.professionSkillChoices.warrior, selected);
  assert.deepEqual(loaded.professionLanguageChoices.bard, ["elder-speech"]);
  assert.equal(loaded.skills.find(skill => skill.catalogId === "athletics").rank, 4);
  assert.equal(CharacterSkills.getProfessionSkillCount(loaded, "warrior"), 11);
});

test("each language has an independent rank and the homeland language receives a free +8", () => {
  const character = CharacterStore.createCharacter();
  character.personal.homeland = "Темерия";
  CharacterSkills.initializeCharacterSkills(character);

  const nativeId = CharacterSkills.applyNativeLanguage(character);
  assert.equal(nativeId, "common");
  const languages = character.skills.filter(skill => skill.languageId);
  assert.equal(languages.length, 3);
  assert.equal(new Set(languages.map(skill => skill.id)).size, 3);
  assert.ok(languages.every(skill => skill.rank === 0));
  assert.equal(languages.find(skill => skill.languageId === "common").nativeBonus, 8);
  assert.equal(languages.find(skill => skill.languageId === "elder-speech").nativeBonus, 0);
  character.attributes.INT = 5;
  const common = CharacterRules.deriveCharacter(character).skills.find(skill => skill.id === languages.find(entry => entry.languageId === "common").id);
  assert.equal(common.total, 13);
  assert.equal(common.nativeBonus, 8);
});

test("homeland rules distinguish Northern Common, Elder Speech, and Mahakam Dwarven", () => {
  assert.equal(CharacterSkills.languageForHomeland("Редания"), "common");
  assert.equal(CharacterSkills.languageForHomeland("Нильфгаард"), "elder-speech");
  assert.equal(CharacterSkills.languageForHomeland("Доль Блатанна"), "elder-speech");
  assert.equal(CharacterSkills.languageForHomeland("Скеллиге"), "elder-speech");
  assert.equal(CharacterSkills.languageForHomeland("Махакама"), "dwarven");
  assert.equal(CharacterSkills.languageForHomeland("Неизвестная область"), null);
});

test("profession language selections are unique and preserve each language rank independently", () => {
  const character = CharacterStore.createCharacter();
  CharacterSkills.initializeCharacterSkills(character);
  CharacterSkills.setProfession(character, "merchant");
  assert.equal(CharacterSkills.setProfessionLanguageChoices(character, "merchant", ["common", "dwarven"]).ok, true);
  assert.equal(CharacterSkills.setProfessionLanguageChoices(character, "merchant", ["common", "common"]).ok, false);
  assert.equal(CharacterSkills.setProfessionLanguageChoices(character, "merchant", ["common", "elder-speech", "dwarven"]).ok, false);
  const languages = character.skills.filter(skill => skill.source === "profession" && skill.languageId);
  assert.equal(languages.length, 2);
  languages.find(skill => skill.languageId === "common").rank = 4;
  assert.equal(languages.find(skill => skill.languageId === "dwarven").rank, 1);
});

test("changing profession preserves existing ratings and keeps the old defining skill", () => {
  const character = CharacterStore.createCharacter();
  CharacterSkills.initializeCharacterSkills(character);
  CharacterSkills.setProfession(character, "bard");
  const charisma = character.skills.find(skill => skill.catalogId === "charisma");
  charisma.rank = 5;

  CharacterSkills.setProfession(character, "doctor");
  assert.equal(character.skills.find(skill => skill.catalogId === "charisma").rank, 5);
  assert.equal(character.skills.find(skill => skill.professionSkillId === "bard.defining").source, "other");
  assert.equal(character.personal.professionId, "doctor");
});

test("the playable-race list matches the core rules and keeps criminal awareness in its starting package", () => {
  assert.deepEqual(CharacterSkills.RACES, ["Человек", "Эльф", "Краснолюд", "Ведьмак"]);
  assert.equal(CharacterSkills.RACES.includes("Полурослик"), false);
  const criminal = CharacterSkills.findProfession("criminal");
  assert.ok(criminal.skills.includes("awareness"));
});
