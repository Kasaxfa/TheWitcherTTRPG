const assert = require("node:assert/strict");
const test = require("node:test");
const Advancement = require("../character-advancement.js");
const CharacterStore = require("../character-store.js");
const Trees = require("../character-profession-trees.js");

test("skill and attribute costs follow the advancement table and normal limits", () => {
  assert.equal(Advancement.skillUpgradeCost(0), 1);
  assert.equal(Advancement.skillUpgradeCost(3), 3);
  assert.equal(Advancement.skillUpgradeCost(3, true), 6);
  assert.equal(Advancement.skillUpgradeCost(10), null);
  assert.equal(Advancement.attributeUpgradeCost(0), 0);
  assert.equal(Advancement.attributeUpgradeCost(5), 50);
  assert.equal(Advancement.attributeUpgradeCost(10), null);
  assert.equal(Advancement.attributeUpgradeCost(null), null);
  assert.equal(Advancement.attributeUpgradeCost(undefined), null);
  assert.equal(Advancement.attributeUpgradeCost(""), null);
});

test("awarded points are spent transactionally on ordinary and complex skills", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.skills.push({ id: "ordinary", catalogId: "awareness", name: "Внимание", attribute: "INT", rank: 0 });
  character.skills.push({ id: "complex", catalogId: "monster-lore", name: "Монстрология", attribute: "INT", rank: 0 });

  assert.equal(Advancement.awardPoints(character, 4).ok, true);
  assert.equal(Advancement.improveSkill(character, "ordinary").cost, 1);
  assert.equal(character.skills[0].rank, 1);
  assert.equal(Advancement.improveSkill(character, "complex", { doubleCost: true }).cost, 2);
  assert.equal(character.skills[1].rank, 1);
  assert.equal(Advancement.progression(character).earnedPoints, 4);
  assert.equal(Advancement.progression(character).availablePoints, 1);

  const failed = Advancement.improveSkill(character, "complex", { doubleCost: true });
  assert.equal(failed.ok, false);
  assert.equal(character.skills[1].rank, 1);
  assert.equal(Advancement.progression(character).availablePoints, 1);
});

test("attributes cost ten times their current base value and stop at ten", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.attributes.INT = 5;
  character.attributes.REF = 10;
  Advancement.awardPoints(character, 50);

  const improved = Advancement.improveAttribute(character, "INT");
  assert.equal(improved.cost, 50);
  assert.equal(character.attributes.INT, 6);
  assert.equal(Advancement.progression(character).availablePoints, 0);
  assert.equal(Advancement.improveAttribute(character, "REF").ok, false);
});

test("profession-branch advancement unlocks the next node at rank five", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.personal.professionId = "criminal";
  Trees.ensureProgress(character, "criminal");
  assert.equal(Trees.setRank(character, "criminal", "A", 0, 4).ok, true);
  Advancement.awardPoints(character, 5);

  const fifthRank = Advancement.improveProfessionAbility(character, "criminal", "A", 0, Trees);
  assert.equal(fifthRank.cost, 4);
  assert.equal(Trees.getNodeState(character, "criminal", "A", 1).unlocked, true);
  const firstRank = Advancement.improveProfessionAbility(character, "criminal", "A", 1, Trees);
  assert.equal(firstRank.cost, 1);
  assert.equal(Trees.getNodeState(character, "criminal", "A", 1).rank, 1);
  assert.equal(Advancement.progression(character).availablePoints, 0);
});

test("a locked profession ability cannot spend points", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.personal.professionId = "criminal";
  Advancement.awardPoints(character, 10);
  const result = Advancement.improveProfessionAbility(character, "criminal", "A", 1, Trees);
  assert.equal(result.ok, false);
  assert.match(result.message, /предыдущую способность/);
  assert.equal(Advancement.progression(character).availablePoints, 10);
});
