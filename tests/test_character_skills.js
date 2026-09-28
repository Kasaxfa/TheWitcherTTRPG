const assert = require("node:assert/strict");
const test = require("node:test");
const CharacterStore = require("../character-store.js");
const CharacterSkills = require("../character-skills.js");

test("new character receives every common skill with its leading attribute", () => {
  const character = CharacterStore.createCharacter("Новый лист");
  CharacterSkills.initializeCharacterSkills(character);

  const general = character.skills.filter(skill => skill.source === "general");
  assert.equal(CharacterSkills.SKILLS.length, 50);
  assert.equal(general.length, CharacterSkills.SKILLS.length);
  assert.deepEqual(general.map(skill => skill.catalogId).sort(), CharacterSkills.SKILLS.map(skill => skill.id).sort());
  assert.ok(general.every(skill => skill.rank === 0 && skill.attribute));
});

test("selecting a profession adds its defining skill and ten professional skills", () => {
  for (const profession of CharacterSkills.PROFESSIONS) {
    const character = CharacterStore.createCharacter();
    CharacterSkills.initializeCharacterSkills(character);
    CharacterSkills.setProfession(character, profession.id);

    const professional = character.skills.filter(skill => skill.source === "profession" && skill.professionId === profession.id);
    const expected = profession.id === "warrior" ? 6 : 11;
    assert.equal(professional.length, expected, profession.name);
    assert.equal(professional.find(skill => skill.professionSkillId === `${profession.id}.defining`).name, profession.defining.name);
    assert.ok(professional.every(skill => skill.rank >= 1));
    if (profession.languageChoices) {
      assert.equal(professional.filter(skill => skill.name.startsWith("Язык ")).length, 1);
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
  character.skills.find(skill => skill.catalogId === "athletics").rank = 4;
  CharacterStore.save(localStorage, characterStore);

  const loaded = CharacterStore.load(localStorage).store.characters[0];
  CharacterSkills.initializeCharacterSkills(loaded);
  assert.equal(loaded.personal.professionId, "warrior");
  assert.deepEqual(loaded.professionSkillChoices.warrior, selected);
  assert.equal(loaded.skills.find(skill => skill.catalogId === "athletics").rank, 4);
  assert.equal(CharacterSkills.getProfessionSkillCount(loaded, "warrior"), 11);
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
