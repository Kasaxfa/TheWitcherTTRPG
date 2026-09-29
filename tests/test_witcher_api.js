const assert = require("node:assert/strict");
const test = require("node:test");
const Api = require("../witcher-api.js");
const Creation = require("../character-creation.js");

test("inventory totals preserve the 0.05 kg standard arrow weight and count unknown weights", () => {
  const character = { equipment: { items: [
    { quantity: 4, unitWeightKg: 0.05 },
    { quantity: 2, unitWeightKg: 1.5 },
    { quantity: 1, unitWeightKg: null },
  ] } };
  const before = structuredClone(character);
  const result = Api.inventoryWeight(character);
  assert.deepEqual(result, { knownKg: 3.2, unknownCount: 1 });
  assert.deepEqual(character, before, "calculating total carried weight is read-only");
});

test("armor EV counts a worn catalog item once across body zones and respects its override", () => {
  const character = { equipment: {
    items: [
      { id: "armor-a", itemId: "catalog-armor", armorEv: null },
      { id: "armor-b", itemId: null, armorEv: 2, customCategory: "armor" },
    ],
    combat: { armorByZone: {
      head: { inventoryEntryId: "armor-a" }, torso: { inventoryEntryId: "armor-a" },
      leftArm: { inventoryEntryId: "armor-b" }, rightArm: { inventoryEntryId: "missing" },
    } },
  } };
  const before = structuredClone(character);
  const result = Api.armorLoadoutStats(character, (id, attr) => id === "catalog-armor" && attr === "encumbrance" ? 3 : null);
  assert.deepEqual(result, { ev: 5, knownEv: 5, unknownCount: 0, itemCount: 2 });
  assert.deepEqual(character, before, "armor EV calculation does not mutate equipment slots");
});

test("derived-value queries do not initialize or otherwise mutate the character", () => {
  const character = { personal: { race: "Человек" }, attributes: { BODY: 5, WILL: 5, SPD: 5 }, skills: [], equipment: { items: [] } };
  const before = structuredClone(character);
  Api.deriveCharacter(character, { carriedWeightKg: 0, unknownWeightCount: 0, armorEv: 0 });
  assert.deepEqual(character, before);
});

test("advancement view getters do not create draft or tree data while rendering", () => {
  const character = { attributes: {}, skills: [], professionTrees: {} };
  const before = structuredClone(character);
  Api.getAdvancementView(character);
  Api.getProfessionNodeState(character, "criminal", "A", 0);
  assert.deepEqual(character, before);
});

test("combat domain rules distinguish catalog armor, shields, and custom armor regions", () => {
  const getItem = id => id === "armor" || id === "shield" ? { type: "armor" } : null;
  const getAttribute = (id, key) => key === "armor_region" && id === "shield" ? "Щит" : id === "armor" ? "Голова" : null;
  assert.equal(Api.combatItemAllowed({ itemId: "armor" }, "armor", getItem, getAttribute), true);
  assert.equal(Api.combatItemAllowed({ itemId: "shield" }, "armor", getItem, getAttribute), false);
  assert.equal(Api.combatItemAllowed({ itemId: "shield" }, "shield", getItem, getAttribute), true);
  assert.equal(Api.armorCoversZone({ itemId: "armor" }, "head", getItem, getAttribute), true);
  assert.equal(Api.armorCoversZone({ itemId: "armor" }, "torso", getItem, getAttribute), false);
  assert.equal(Api.armorCoversZone({ customCategory: "armor" }, "leftLeg"), true);
});

test("creation API validates without changing an identity draft", () => {
  const draft = { step: "identity", race: "Человек", professionId: "criminal", age: "30" };
  assert.equal(Api.validateCreationStep(draft), "");
  assert.deepEqual(draft, { step: "identity", race: "Человек", professionId: "criminal", age: "30" });
  assert.match(Api.validateCreationStep({ ...draft, race: "Краснолюд", professionId: "mage" }), /недопустима/);
});

test("dice validation is read-only; allocation is a separate operation", () => {
  const rolls = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const assignments = Object.fromEntries(Creation.ATTRIBUTES.map((code, index) => [code, index]));
  const draft = { step: "attributes", attributeMode: "dice", rolls, diceAssignments: assignments, attributes: null };
  const before = structuredClone(draft);
  assert.equal(Api.validateCreationStep(draft), "");
  assert.deepEqual(draft, before);
  const allocation = Api.rollAttributeAllocation(draft);
  assert.equal(allocation.attributes.INT, 1);
  assert.equal(allocation.attributes.LUCK, 9);
  assert.deepEqual(draft, before);
  assert.equal(Api.rollCreationAttributes(draft).ok, true);
  assert.equal(draft.attributes.INT, 1);
});

test("character build happens through the API and applies +8 to the selected native language", () => {
  const draft = {
    step: "skills", race: "Ведьмак", professionId: "witcher", age: "60", backgroundMode: "manual",
    homeland: "Север", attributeMode: "points", attributePool: 70,
    attributes: Creation.balancedAttributes(70), professionChoices: [], professionLanguageChoices: [],
    professionRanks: {}, generalRanks: {},
  };
  const professional = Api.professionSkillDescriptors(draft);
  for (const skill of professional) draft.professionRanks[skill.key] = 1;
  let spent = Api.startingSkillSpent(Api.professionSkillDescriptors(draft));
  for (const skill of professional) {
    while (spent < 44 && draft.professionRanks[skill.key] < 6) {
      const cost = Api.startingSkillCost(skill);
      if (spent + cost > 44) break;
      draft.professionRanks[skill.key] += 1;
      spent += cost;
    }
  }
  assert.equal(spent, 44);
  const result = Api.createCharacterFromDraft(draft, "Тестовый ведьмак");
  assert.equal(result.ok, true, result.error);
  assert.equal(result.character.personal.name, "Тестовый ведьмак");
  assert.equal(result.character.skills.find(skill => skill.languageId === "common").nativeBonus, 8);
  assert.equal(result.character.skills.find(skill => skill.languageId === "elder-speech").nativeBonus, 0);
  assert.ok(result.character.professionTrees.witcher);
});


test("the public API contract does not expose internal rule modules or storage implementation", () => {
  for (const internal of ["rules", "skills", "creation", "advancement", "store"]) assert.equal(Object.hasOwn(Api, internal), false);
});

test("creation view exposes budgets and point-buy affordances without mutating the draft", () => {
  const draft = { race: "Человек", professionId: "witcher", attributeMode: "points", attributePool: 70,
    attributes: Creation.balancedAttributes(70), professionChoices: [], professionLanguageChoices: [], professionRanks: {}, generalRanks: {} };
  const before = structuredClone(draft);
  const view = Api.creationView(draft);
  assert.equal(view.professionalBudget, 44);
  assert.equal(view.professionalSpent, view.professional.reduce((sum, skill) => sum + skill.rank * skill.costPerRank, 0));
  assert.equal(view.generalBudget, view.attributes.INT + view.attributes.REF);
  assert.equal(view.attributeSpent, 70);
  assert.equal(view.pointBuyValid, true);
  assert.deepEqual(draft, before);
  assert.ok(view.professional.every(skill => skill.maximumRank === 6 && skill.minimumRank === 1 && skill.costPerRank >= 1));
});

test("starting attribute command enforces pool and range, while allowing redistribution", () => {
  const draft = { race: "Человек", attributeMode: "points", attributePool: 70, attributes: Creation.balancedAttributes(70) };
  const code = Creation.ATTRIBUTES[0];
  const initial = draft.attributes[code];
  const reduce = Api.changeCreationAttribute(draft, code, -1);
  assert.equal(reduce.ok, true);
  assert.equal(reduce.spent, 69);
  const raise = Api.changeCreationAttribute(draft, Creation.ATTRIBUTES[1], 1);
  assert.equal(raise.ok, true);
  assert.equal(raise.spent, 70);
  const before = structuredClone(draft);
  const exceed = Api.changeCreationAttribute(draft, Creation.ATTRIBUTES[1], 1);
  assert.equal(exceed.ok, false);
  assert.deepEqual(draft, before);
  assert.equal(Api.setCreationAttributePool(draft, 75).ok, false);
});

test("starting skill command enforces rating and profession budget", () => {
  const draft = { race: "Человек", professionId: "witcher", attributeMode: "points", attributePool: 70,
    attributes: Creation.balancedAttributes(70), professionChoices: [], professionLanguageChoices: [], professionRanks: {}, generalRanks: {} };
  const skill = Api.creationView(draft).professional[0];
  const beforeRank = skill.rank;
  const increase = Api.changeCreationSkill(draft, "profession", skill.key, 1);
  assert.equal(increase.ok, true);
  assert.equal(draft.professionRanks[skill.key], beforeRank + 1);
  const before = structuredClone(draft);
  const tooHigh = Api.changeCreationSkill(draft, "profession", skill.key, 100);
  assert.equal(tooHigh.ok, false);
  assert.deepEqual(draft, before);
});

test("advancement view reports eligibility and costs, and commands reserve only available points", () => {
  const character = {
    personal: { race: "Человек", professionId: "criminal" }, attributes: { INT: 2, REF: 2 }, attributeModifiers: {},
    skills: [{ id: "skill-1", catalogId: "awareness", name: "Внимание", attribute: "INT", rank: 1, nativeBonus: 0 }],
    professionTrees: {}, development: { earnedPoints: 20, availablePoints: 20, draft: { attributes: {}, skills: {}, professionAbilities: {} } },
  };
  const before = structuredClone(character);
  const view = Api.getAdvancementView(character);
  assert.deepEqual(character, before, "view query must not initialize or mutate character data");
  assert.equal(view.attributes.find(entry => entry.code === "INT").cost, 20);
  assert.equal(view.attributes.find(entry => entry.code === "INT").canBuy, true);
  assert.equal(view.skills[0].cost, 1);
  assert.equal(view.skills[0].canBuy, true);
  const locked = view.treeBranches[0].nodes[1];
  assert.equal(locked.unlocked, false);
  assert.equal(locked.canBuy, false);
  const staged = Api.stageImprovement(character, "attribute", "INT");
  assert.equal(staged.ok, true);
  assert.equal(Api.getAdvancementView(character).availablePoints, 0);
  const denied = Api.stageImprovement(character, "skill", "skill-1");
  assert.equal(denied.ok, false);
  assert.equal(Api.getAdvancementView(character).skills[0].pending, 0);
});

test("character and equipment commands validate edits and keep inventory links coherent", () => {
  const character = Api.createCharacterStore("Командный тест").characters[0];
  assert.equal(Api.updateCharacterField(character, "state.currentHp", -1).ok, false);
  assert.equal(Api.updateCharacterField(character, "state.currentHp", 12).ok, true);
  assert.equal(character.state.currentHp, 12);
  assert.equal(Api.setCharacterAttribute(character, "INT", "unknown", 1).ok, false);
  const item = { id: "owned-1", itemId: "sword", name: "Меч", quantity: 1, unitWeightKg: 1, armorEv: null };
  assert.equal(Api.addInventoryItem(character, item).ok, true);
  assert.equal(Api.addCombatWeapon(character, "weapon-1").ok, true);
  assert.equal(Api.setCombatSlotField(character, "weapon", "weapon-1", "inventoryEntryId", "owned-1", { name: "Меч", reliability: 10 }).ok, true);
  assert.equal(character.equipment.combat.weapons[0].name, "Меч");
  assert.equal(Api.removeInventoryItem(character, "owned-1").ok, true);
  assert.equal(character.equipment.combat.weapons[0].inventoryEntryId, null);
});

test("store and raw-storage writes use explicit persistence commands", () => {
  const store = Api.createCharacterStore("Первый");
  const second = Api.createCharacterStore("Второй").characters[0];
  assert.equal(Api.addCharacterToStore(store, second).ok, true);
  assert.equal(Api.setActiveCharacter(store, second.characterId).ok, true);
  assert.equal(store.activeCharacterId, second.characterId);
  assert.equal(Api.removeCharacterFromStore(store, second.characterId).ok, true);
  assert.equal(store.activeCharacterId, store.characters[0].characterId);
  const values = new Map([["source", "backup-value"]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(Api.readRaw(storage, "source"), "backup-value");
  assert.equal(Api.backupRaw(storage, "source", "backup").backedUp, true);
  assert.equal(Api.readRaw(storage, "backup"), "backup-value");
  assert.equal(Api.writeRaw(storage, "source", "updated"), true);
});
