const assert = require("node:assert/strict");
const test = require("node:test");
const Advancement = require("../character-advancement.js");
const CharacterStore = require("../character-store.js");
const Trees = require("../character-profession-trees.js");
const CharacterSkills = require("../character-skills.js");

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

test("the three language skills advance independently and each rank costs double", () => {
  const character = CharacterStore.createCharacter("Языки");
  character.personal.homeland = "Темерия";
  CharacterSkills.initializeCharacterSkills(character);
  const languages = character.skills.filter(skill => skill.languageId);
  assert.equal(languages.length, 3);
  Advancement.awardPoints(character, 20);
  assert.equal(Advancement.stageSkillUpgrade(character, languages.find(skill => skill.languageId === "common").id, { doubleCost: true }).cost, 16);
  assert.equal(Advancement.stageSkillUpgrade(character, languages.find(skill => skill.languageId === "elder-speech").id, { doubleCost: true }).cost, 2);
  assert.equal(Advancement.stageSkillUpgrade(character, languages.find(skill => skill.languageId === "dwarven").id, { doubleCost: true }).cost, 2);
  assert.equal(Advancement.applyDraft(character, Trees).appliedPoints, 20);
  assert.ok(languages.every(skill => skill.rank === 1));
  assert.equal(languages.find(skill => skill.languageId === "common").nativeBonus, 8);
  assert.equal(Advancement.stageSkillUpgrade(character, languages.find(skill => skill.languageId === "common").id, { doubleCost: true }).ok, false);
});

test("skill upgrades stay pending until apply and rank-up cost escalates", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.skills.push({ id: "ordinary", catalogId: "awareness", name: "Внимание", attribute: "INT", rank: 0 });
  character.skills.push({ id: "complex", catalogId: "monster-lore", name: "Монстрология", attribute: "INT", rank: 0 });
  Advancement.awardPoints(character, 8);

  assert.equal(Advancement.stageSkillUpgrade(character, "ordinary").cost, 1);
  assert.equal(Advancement.stageSkillUpgrade(character, "ordinary").cost, 1);
  assert.equal(Advancement.stageSkillUpgrade(character, "complex", { doubleCost: true }).cost, 2);
  assert.equal(character.skills[0].rank, 0);
  assert.equal(character.skills[1].rank, 0);
  assert.deepEqual(Advancement.draftSummary(character, Trees), {
    earnedPoints: 8,
    availablePoints: 4,
    reservedPoints: 4,
    spentPoints: 0,
    hasDraft: true,
  });

  assert.equal(Advancement.undoSkillUpgrade(character, "ordinary").cost, 1);
  assert.equal(Advancement.draftCount(character, "skills", "ordinary"), 1);
  assert.equal(character.development.availablePoints, 5);
  assert.equal(Advancement.applyDraft(character, Trees).appliedPoints, 3);
  assert.equal(character.skills[0].rank, 1);
  assert.equal(character.skills[1].rank, 1);
  assert.equal(character.development.availablePoints, 5);
  assert.equal(Advancement.draftSummary(character, Trees).spentPoints, 3);
  assert.equal(Advancement.undoSkillUpgrade(character, "ordinary").ok, false);
});

test("attributes can be adjusted down before apply and applied points cannot be reassigned", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.attributes.INT = 5;
  Advancement.awardPoints(character, 110);
  assert.equal(Advancement.stageAttributeUpgrade(character, "INT").cost, 50);
  assert.equal(Advancement.stageAttributeUpgrade(character, "INT").cost, 60);
  assert.equal(character.attributes.INT, 5);
  assert.equal(Advancement.undoAttributeUpgrade(character, "INT").cost, 60);
  assert.equal(character.development.availablePoints, 60);
  assert.equal(Advancement.applyDraft(character, Trees).appliedPoints, 50);
  assert.equal(character.attributes.INT, 6);
  assert.equal(Advancement.undoAttributeUpgrade(character, "INT").ok, false);
  assert.equal(Advancement.stageAttributeUpgrade(character, "REF").ok, false);
  assert.equal(character.development.availablePoints, 60);
});

test("canceling the draft returns all reserved points without changing ranks", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.attributes.INT = 4;
  character.skills.push({ id: "ordinary", catalogId: "awareness", name: "Внимание", attribute: "INT", rank: 0 });
  Advancement.awardPoints(character, 50);
  Advancement.stageAttributeUpgrade(character, "INT");
  Advancement.stageSkillUpgrade(character, "ordinary");
  assert.equal(Advancement.cancelDraft(character, Trees).refunded, 41);
  assert.equal(character.attributes.INT, 4);
  assert.equal(character.skills[0].rank, 0);
  assert.equal(character.development.availablePoints, 50);
  assert.equal(Advancement.draftSummary(character, Trees).hasDraft, false);
});

test("profession tree can stage the unlocking rank and then invest in the next node", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.personal.professionId = "criminal";
  Trees.ensureProgress(character, "criminal");
  assert.equal(Trees.setRank(character, "criminal", "A", 0, 4).ok, true);
  Advancement.awardPoints(character, 16);

  assert.equal(Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 0, Trees).cost, 4);
  assert.equal(Advancement.professionAbilityState(character, "criminal", "A", 1, Trees).unlocked, true);
  assert.equal(Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 1, Trees).cost, 1);
  for (let index = 0; index < 4; index += 1) assert.equal(Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 1, Trees).ok, true);
  assert.equal(Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 2, Trees).cost, 1);
  assert.deepEqual(character.professionTrees.criminal.branches.A, [4, 0, 0]);

  const undone = Advancement.undoProfessionAbilityUpgrade(character, "criminal", "A", 0, Trees);
  assert.equal(undone.ok, true);
  assert.equal(undone.refundedDescendants, 12);
  assert.deepEqual(character.development.draft.professionAbilities, {});
  assert.equal(character.development.availablePoints, 16);
  assert.equal(Advancement.applyDraft(character, Trees).ok, false);
  assert.deepEqual(character.professionTrees.criminal.branches.A, [4, 0, 0]);
});

test("an earlier profession ability remains upgradeable after the last node reaches rank 10", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.personal.professionId = "criminal";
  Trees.ensureProgress(character, "criminal");
  Trees.setRank(character, "criminal", "A", 0, 5);
  Trees.setRank(character, "criminal", "A", 1, 5);
  Trees.setRank(character, "criminal", "A", 2, 10);
  Advancement.awardPoints(character, 5);

  assert.equal(Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 0, Trees).ok, true);
  assert.equal(Advancement.applyDraft(character, Trees).ok, true);
  assert.deepEqual(character.professionTrees.criminal.branches.A, [6, 5, 10]);
});

test("a locked profession ability cannot reserve points", () => {
  const character = CharacterStore.createCharacter("Тест");
  character.personal.professionId = "criminal";
  Advancement.awardPoints(character, 10);
  const result = Advancement.stageProfessionAbilityUpgrade(character, "criminal", "A", 1, Trees);
  assert.equal(result.ok, false);
  assert.match(result.message, /предыдущее умение/);
  assert.equal(Advancement.progression(character).availablePoints, 10);
});
