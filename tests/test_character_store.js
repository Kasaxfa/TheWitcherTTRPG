const assert = require("node:assert/strict");
const test = require("node:test");
const CharacterStore = require("../character-store.js");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const inventoryItem = (id, name, quantity, unitWeightKg, itemId = null) => ({
  id,
  itemId,
  name,
  quantity,
  unitWeightKg,
  custom: itemId === null,
});

test("first load creates a versioned character with a persistent ID", () => {
  const storage = new MemoryStorage();
  const { store } = CharacterStore.load(storage);
  assert.equal(store.format, CharacterStore.FORMAT);
  assert.equal(store.schemaVersion, CharacterStore.SCHEMA_VERSION);
  assert.equal(store.characters.length, 1);
  assert.equal(store.activeCharacterId, store.characters[0].characterId);
  assert.ok(store.characters[0].characterId);
  assert.equal(CharacterStore.load(storage).store.characters[0].characterId, store.characters[0].characterId);
});

test("version 1 characters migrate without losing sheet data and keep a raw backup", () => {
  const storage = new MemoryStorage();
  const original = CharacterStore.createStore("Персонаж до обновления");
  original.schemaVersion = 1;
  original.characters[0].schemaVersion = 1;
  original.characters[0].personal.name = "Геральт";
  original.characters[0].attributes.REF = 9;
  original.characters[0].equipment.items.push(inventoryItem("gear-migration", "Медальон", 1, 0.2));
  delete original.characters[0].lifePath;
  const raw = JSON.stringify(original);
  storage.setItem(CharacterStore.STORAGE_KEY, raw);

  const result = CharacterStore.load(storage);
  const migrated = result.store.characters[0];
  assert.equal(result.migratedSchemaVersion, true);
  assert.equal(result.store.schemaVersion, CharacterStore.SCHEMA_VERSION);
  assert.equal(migrated.schemaVersion, CharacterStore.SCHEMA_VERSION);
  assert.equal(migrated.characterId, original.characters[0].characterId);
  assert.equal(migrated.personal.name, "Геральт");
  assert.equal(migrated.attributes.REF, 9);
  assert.deepEqual(migrated.attributeModifiers.REF, { permanent: 0, temporary: 0 });
  assert.equal(migrated.equipment.items[0].name, "Медальон");
  assert.deepEqual(migrated.lifePath.outcomes, []);
  assert.equal(storage.getItem(`${CharacterStore.STORAGE_KEY}.backup-v1`), raw);
  assert.equal(CharacterStore.load(storage).migratedSchemaVersion, false);
});

test("version 2 characters gain separate modifiers without losing ratings or source values", () => {
  const storage = new MemoryStorage();
  const original = CharacterStore.createStore("Сохранение версии 2");
  original.schemaVersion = 2;
  const character = original.characters[0];
  character.schemaVersion = 2;
  character.attributes.BODY = 6;
  character.skills.push({ id: "old-skill", name: "Ближний бой", attribute: "REF", rank: 5 });
  delete character.attributeModifiers;
  const raw = JSON.stringify(original);
  storage.setItem(CharacterStore.STORAGE_KEY, raw);

  const result = CharacterStore.load(storage);
  const migrated = result.store.characters[0];
  assert.equal(result.migratedSchemaVersion, true);
  assert.equal(result.store.schemaVersion, 9);
  assert.equal(migrated.attributes.BODY, 6);
  assert.deepEqual(migrated.attributeModifiers.BODY, { permanent: 0, temporary: 0 });
  assert.equal(migrated.skills[0].rank, 5);
  assert.equal(migrated.skills[0].permanentModifier, 0);
  assert.equal(migrated.skills[0].temporaryModifier, 0);
  assert.equal(storage.getItem(`${CharacterStore.STORAGE_KEY}.backup-v2`), raw);
});

test("version 3 characters migrate profession identity and choice storage without losing skills", () => {
  const storage = new MemoryStorage();
  const original = CharacterStore.createStore("Версия 3");
  original.schemaVersion = 3;
  const character = original.characters[0];
  character.schemaVersion = 3;
  character.personal.profession = "Бард";
  character.attributes.INT = 7;
  character.skills.push({ id: "old-skill", name: "Харизма", attribute: "EMP", rank: 4, permanentModifier: 1, temporaryModifier: 0 });
  const raw = JSON.stringify(original);
  storage.setItem(CharacterStore.STORAGE_KEY, raw);

  const result = CharacterStore.load(storage);
  const migrated = result.store.characters[0];
  assert.equal(result.store.schemaVersion, 9);
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(migrated.personal.profession, "Бард");
  assert.equal(migrated.personal.professionId, "");
  assert.deepEqual(migrated.professionSkillChoices, {});
  assert.equal(migrated.attributes.INT, 7);
  assert.equal(migrated.skills[0].rank, 4);
  assert.equal(migrated.skills[0].permanentModifier, 1);
  assert.equal(storage.getItem(`${CharacterStore.STORAGE_KEY}.backup-v3`), raw);
});

test("version 4 migration adds creation, generated life path, profession-tree storage, and development without losing data", () => {
  const original = CharacterStore.createStore("Версия 4");
  original.schemaVersion = 4;
  const character = original.characters[0];
  character.schemaVersion = 4;
  character.personal.race = "Человек";
  character.attributes.INT = 8;
  character.skills.push({ id: "stable-skill", name: "Дедукция", attribute: "INT", rank: 3 });
  delete character.creation;
  delete character.professionTrees;
  delete character.development;
  delete character.lifePath.generated;
  const migrated = CharacterStore.migrateStore(original).characters[0];
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(migrated.personal.race, "Человек");
  assert.equal(migrated.attributes.INT, 8);
  assert.equal(migrated.skills[0].id, "stable-skill");
  assert.deepEqual(migrated.creation, {});
  assert.deepEqual(migrated.professionTrees, {});
  assert.deepEqual(migrated.development, { earnedPoints: 0, availablePoints: 0, draft: { attributes: {}, skills: {}, professionAbilities: {} } });
  assert.equal(migrated.lifePath.generated, null);
});

test("version 5 migration adds an empty improvement-point ledger and preserves the character", () => {
  const original = CharacterStore.createStore("Версия 5");
  original.schemaVersion = 5;
  const character = original.characters[0];
  character.schemaVersion = 5;
  character.personal.name = "Цири";
  character.attributes.INT = 8;
  character.skills.push({ id: "stable-skill", name: "Дедукция", attribute: "INT", rank: 4 });
  delete character.development;
  const migrated = CharacterStore.migrateStore(original);
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(migrated.characters[0].schemaVersion, 9);
  assert.equal(migrated.characters[0].personal.name, "Цири");
  assert.equal(migrated.characters[0].attributes.INT, 8);
  assert.equal(migrated.characters[0].skills[0].id, "stable-skill");
  assert.deepEqual(migrated.characters[0].development, { earnedPoints: 0, availablePoints: 0, draft: { attributes: {}, skills: {}, professionAbilities: {} } });
});

test("version 6 migration adds a draft ledger and preserves available improvement points", () => {
  const original = CharacterStore.createStore("Версия 6");
  original.schemaVersion = 6;
  const character = original.characters[0];
  character.schemaVersion = 6;
  character.development = { earnedPoints: 25, availablePoints: 9 };
  const migrated = CharacterStore.migrateStore(original);
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(migrated.characters[0].schemaVersion, 9);
  assert.deepEqual(migrated.characters[0].development, { earnedPoints: 25, availablePoints: 9, draft: { attributes: {}, skills: {}, professionAbilities: {} } });
});

test("version 7 migration adds combat, wound, and magic sections without replacing older entries", () => {
  const original = CharacterStore.createStore("Версия 7");
  original.schemaVersion = 7;
  const character = original.characters[0];
  character.schemaVersion = 7;
  character.personal.name = "Трисс";
  character.state.currentHp = 22;
  character.state.conditions = ["Оглушена"];
  delete character.state.wounds;
  delete character.magic;
  character.equipment.items.push(inventoryItem("old-gear", "Посох", 1, 1.5, "catalog-staff"));
  delete character.equipment.items[0].conditionNotes;
  delete character.equipment.items[0].armorEv;
  delete character.equipment.items[0].customCategory;
  delete character.equipment.combat;

  const migrated = CharacterStore.migrateStore(original);
  const restored = migrated.characters[0];
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(restored.characterId, character.characterId);
  assert.equal(restored.personal.name, "Трисс");
  assert.equal(restored.state.currentHp, 22);
  assert.deepEqual(restored.state.conditions, ["Оглушена"]);
  assert.deepEqual(restored.state.wounds, []);
  assert.equal(restored.state.currentReputation, null);
  assert.equal(restored.state.reputationNotes, "");
  assert.deepEqual(restored.magic, { energyBase: null, energyCurrent: null, vigor: null, vigorModifier: null, focus: null, entries: [] });
  assert.equal(restored.equipment.items[0].id, "old-gear");
  assert.equal(restored.equipment.items[0].conditionNotes, "");
  assert.equal(restored.equipment.items[0].armorEv, null);
  assert.deepEqual(restored.equipment.combat.weapons, []);
  assert.equal(restored.equipment.combat.shield.inventoryEntryId, null);
});

test("version 8 migration preserves ambiguous language ratings and discards manual carrying capacity", () => {
  const store = CharacterStore.createStore("Версия 8");
  store.schemaVersion = 8;
  const character = store.characters[0];
  character.schemaVersion = 8;
  character.equipment.capacityKg = 75;
  character.skills.push({ id: "old-language", catalogId: "language", name: "Язык", attribute: "INT", rank: 4, permanentModifier: 1, temporaryModifier: 0, source: "profession" });

  const migrated = CharacterStore.migrateStore(store);
  const restored = migrated.characters[0];
  assert.equal(migrated.schemaVersion, 9);
  assert.deepEqual(restored.professionLanguageChoices, {});
  assert.equal(Object.hasOwn(restored.equipment, "capacityKg"), false);
  const language = restored.skills.find(skill => skill.id === "old-language");
  assert.equal(language.catalogId, null);
  assert.equal(language.legacyLanguage, true);
  assert.equal(language.rank, 4);
  assert.equal(language.permanentModifier, 1);
  assert.equal(language.source, "other");
});

test("pending advancement survives normalization and rejects missing skill links", () => {
  const store = CharacterStore.createStore("Черновик");
  const character = store.characters[0];
  character.attributes.INT = 5;
  character.skills.push({ id: "stable-skill", name: "Внимание", attribute: "INT", rank: 1 });
  character.development = {
    earnedPoints: 60,
    availablePoints: 7,
    draft: { attributes: { INT: 1 }, skills: { "stable-skill": 2 }, professionAbilities: {} },
  };
  const normalized = CharacterStore.migrateStore(store).characters[0];
  assert.deepEqual(normalized.development.draft, character.development.draft);
  normalized.development.draft.skills.missing = 1;
  assert.throws(() => CharacterStore.migrateStore({ ...store, characters: [normalized] }), /недопустимое улучшение навыка/);
});

test("reserved draft points cannot exceed the earned balance", () => {
  const store = CharacterStore.createStore("Баланс О.У.");
  const character = store.characters[0];
  character.attributes.INT = 5;
  character.development = { earnedPoints: 40, availablePoints: 0, draft: { attributes: { INT: 1 }, skills: {}, professionAbilities: {} } };
  assert.throws(() => CharacterStore.migrateStore(store), /не хватает на сохранённый черновик/);
});

test("improvement-point balances must be integers and available points cannot exceed earned points", () => {
  const store = CharacterStore.createStore();
  store.characters[0].development = { earnedPoints: 2, availablePoints: 3 };
  assert.throws(() => CharacterStore.migrateStore(store), /Баланс очков улучшения/);
  store.characters[0].development = { earnedPoints: 2.5, availablePoints: 1 };
  assert.throws(() => CharacterStore.migrateStore(store), /Баланс очков улучшения/);
});

test("generated life-path event links must point to a stored relative", () => {
  const store = CharacterStore.createStore();
  store.characters[0].lifePath.generated = {
    kind: "standard", rolls: [], effects: [], relatives: [],
    decadeEvents: [{ id: "event-1", title: "Событие", description: "", personId: "missing-relative" }],
  };
  assert.throws(() => CharacterStore.migrateStore(store), /ссылается на отсутствующего родственника/);
});

test("legacy inventory migrates to the first character and remains available as a backup", () => {
  const storage = new MemoryStorage();
  const legacy = {
    version: 1,
    items: [inventoryItem("entry-1", "Стальной меч", 1, 1.4, "item-sword")],
  };
  const legacyRaw = JSON.stringify(legacy);
  storage.setItem(CharacterStore.LEGACY_INVENTORY_KEY, legacyRaw);

  const result = CharacterStore.load(storage);
  const first = result.store.characters[0];
  assert.equal(result.migratedLegacyInventory, true);
  assert.equal(first.personal.name, "Персонаж 1");
  assert.equal(Object.hasOwn(first.equipment, "capacityKg"), false);
  assert.deepEqual(first.equipment.items[0], {
    ...legacy.items[0], conditionNotes: "", armorEv: null, customCategory: "",
  });
  assert.deepEqual(first.equipment.combat.armorByZone, {
    head: { inventoryEntryId: null, currentSP: null, damage: "" },
    torso: { inventoryEntryId: null, currentSP: null, damage: "" },
    rightArm: { inventoryEntryId: null, currentSP: null, damage: "" },
    leftArm: { inventoryEntryId: null, currentSP: null, damage: "" },
    rightLeg: { inventoryEntryId: null, currentSP: null, damage: "" },
    leftLeg: { inventoryEntryId: null, currentSP: null, damage: "" },
  });
  assert.equal(storage.getItem(CharacterStore.LEGACY_INVENTORY_KEY), legacyRaw);
  assert.deepEqual(result.store.legacyInventoryBackup, legacy);
  const backup = CharacterStore.createBackup(result.store);
  assert.deepEqual(backup.legacyInventoryBackup, legacy);
  assert.deepEqual(CharacterStore.parseImport(backup).store.legacyInventoryBackup, legacy);
});

test("characters keep independent sheets and inventories after save and reload", () => {
  const storage = new MemoryStorage();
  const { store } = CharacterStore.load(storage);
  const first = store.characters[0];
  first.personal.name = "Геральт";
  first.attributes.REF = 9;
  first.attributeModifiers.REF = { permanent: 1, temporary: -2 };
  first.skills.push({ id: "skill-1", name: "Ближний бой", attribute: "REF", rank: 6, permanentModifier: 2, temporaryModifier: -1 });
  first.state.currentHp = 28;
  first.state.currentReputation = 4;
  first.state.reputationNotes = "Известен в Блавикене";
  first.abilities.push({ id: "ability-1", name: "Знак Квен", description: "Защитный знак" });
  first.equipment.items.push(inventoryItem("entry-1", "Медальон", 1, 0.2));
  const second = CharacterStore.createCharacter("Йеннифэр");
  second.equipment.capacityKg = 10;
  store.characters.push(second);
  store.activeCharacterId = second.characterId;
  CharacterStore.save(storage, store);

  const reloaded = CharacterStore.load(storage).store;
  const restoredFirst = reloaded.characters.find(character => character.characterId === first.characterId);
  const restoredSecond = reloaded.characters.find(character => character.characterId === second.characterId);
  assert.equal(reloaded.activeCharacterId, second.characterId);
  assert.equal(restoredFirst.personal.name, "Геральт");
  assert.equal(restoredFirst.attributes.REF, 9);
  assert.deepEqual(restoredFirst.attributeModifiers.REF, { permanent: 1, temporary: -2 });
  assert.equal(restoredFirst.skills[0].rank, 6);
  assert.equal(restoredFirst.skills[0].permanentModifier, 2);
  assert.equal(restoredFirst.skills[0].temporaryModifier, -1);
  assert.equal(restoredFirst.state.currentHp, 28);
  assert.equal(restoredFirst.state.currentReputation, 4);
  assert.equal(restoredFirst.state.reputationNotes, "Известен в Блавикене");
  assert.equal(restoredFirst.abilities[0].name, "Знак Квен");
  assert.equal(restoredFirst.equipment.items[0].name, "Медальон");
  assert.equal(restoredSecond.equipment.items.length, 0);
  assert.equal(Object.hasOwn(restoredSecond.equipment, "capacityKg"), false);
});

test("copying a character preserves its data and assigns independent persistent IDs", () => {
  const original = CharacterStore.createCharacter("Йеннифэр");
  original.skills.push({ id: "skill-1", name: "Магические познания", attribute: "INT", rank: 8 });
  original.abilities.push({ id: "ability-1", name: "Телепортация", description: "Способность" });
  original.equipment.items.push(inventoryItem("gear-1", "Посох", 1, 1.2, "catalog-staff"));
  original.equipment.items.push({ id: "gear-armor", itemId: null, name: "Кожаная куртка", quantity: 1, unitWeightKg: 2, customCategory: "armor", armorEv: 1, conditionNotes: "Потёрта" });
  original.equipment.items.push({ id: "gear-shield", itemId: null, name: "Дорожный щит", quantity: 1, unitWeightKg: 3, customCategory: "shield", armorEv: null, conditionNotes: "" });
  original.equipment.combat.weapons.push({ id: "combat-weapon", slot: "primary", inventoryEntryId: "gear-1", name: "Посох", reliability: "8", conditionNotes: "" });
  original.equipment.combat.armorByZone.torso.inventoryEntryId = "gear-armor";
  original.equipment.combat.armorByZone.leftArm.inventoryEntryId = "gear-armor";
  original.equipment.combat.armorByZone.rightArm.inventoryEntryId = "gear-armor";
  original.equipment.combat.shield.inventoryEntryId = "gear-shield";
  original.state.wounds.push({ id: "wound-1", location: "torso", title: "Ушиб", description: "", status: "active" });
  original.magic.entries.push({ id: "magic-1", kind: "sign", name: "Квен", catalogRef: { type: "recipe", id: "recipe-quen", name: "Квен" }, cost: "2", effect: "Щит", range: "", duration: "", time: "", difficulty: "", components: "", notes: "" });
  original.lifePath.outcomes.push({ id: "outcome-1", type: "Событие", description: "Встреча", source: "Аретуза" });

  const copy = CharacterStore.copyCharacter(original, "Йеннифэр (копия)");
  assert.notEqual(copy.characterId, original.characterId);
  assert.notEqual(copy.skills[0].id, original.skills[0].id);
  assert.notEqual(copy.abilities[0].id, original.abilities[0].id);
  assert.notEqual(copy.equipment.items[0].id, original.equipment.items[0].id);
  assert.notEqual(copy.lifePath.outcomes[0].id, original.lifePath.outcomes[0].id);
  assert.equal(copy.personal.name, "Йеннифэр (копия)");
  assert.equal(copy.equipment.items[0].itemId, "catalog-staff");
  assert.notEqual(copy.state.wounds[0].id, original.state.wounds[0].id);
  assert.notEqual(copy.magic.entries[0].id, original.magic.entries[0].id);
  assert.equal(copy.magic.entries[0].catalogRef.id, "recipe-quen");
  const copiedArmorId = copy.equipment.items.find(item => item.name === "Кожаная куртка").id;
  assert.notEqual(copiedArmorId, "gear-armor");
  assert.equal(copy.equipment.combat.armorByZone.torso.inventoryEntryId, copiedArmorId);
  assert.equal(copy.equipment.combat.armorByZone.leftArm.inventoryEntryId, copiedArmorId);
  assert.equal(copy.equipment.combat.armorByZone.rightArm.inventoryEntryId, copiedArmorId);
  assert.notEqual(copy.equipment.combat.weapons[0].id, original.equipment.combat.weapons[0].id);
  assert.equal(copy.equipment.combat.weapons[0].inventoryEntryId, copy.equipment.items[0].id);
  assert.equal(copy.equipment.combat.shield.inventoryEntryId, copy.equipment.items.find(item => item.name === "Дорожный щит").id);
  assert.equal(copy.equipment.items.find(item => item.name === "Кожаная куртка").conditionNotes, "Потёрта");
  assert.equal(copy.notes, original.notes);
});

test("a character export restores the same IDs and complete entered model", () => {
  const source = new MemoryStorage();
  const { store } = CharacterStore.load(source);
  const character = store.characters[0];
  character.personal.name = "Ламберт";
  character.personal.profession = "Ведьмак";
  character.attributes.WILL = 8;
  character.skills.push({ id: "skill-will", name: "Храбрость", attribute: "WILL", rank: 5 });
  character.state.conditions.push("Ранен");
  character.abilities.push({ id: "ability-quen", name: "Квен", description: "Знак ведьмака" });
  character.lifePath.allies.push("Весемир");
  character.lifePath.outcomes.push({ id: "outcome-1", type: "Событие", description: "Нашёл старую карту", source: "Каэр Морхен" });
  character.equipment.items.push(inventoryItem("gear-1", "Серебряный меч", 1, 1.6, "item-silver-sword"));
  character.notes = "Ищет работу в Новиграде";
  CharacterStore.save(source, store);

  const restored = CharacterStore.parseImport(CharacterStore.createBackup(store)).store;
  const restoredCharacter = restored.characters[0];
  assert.equal(restoredCharacter.characterId, character.characterId);
  assert.equal(restoredCharacter.personal.profession, "Ведьмак");
  assert.equal(restoredCharacter.attributes.WILL, 8);
  assert.equal(restoredCharacter.skills[0].rank, 5);
  assert.deepEqual(restoredCharacter.state.conditions, ["Ранен"]);
  assert.equal(restoredCharacter.abilities[0].description, "Знак ведьмака");
  assert.deepEqual(restoredCharacter.lifePath.allies, ["Весемир"]);
  assert.deepEqual(restoredCharacter.lifePath.outcomes, [{ id: "outcome-1", type: "Событие", description: "Нашёл старую карту", source: "Каэр Морхен" }]);
  assert.equal(restoredCharacter.equipment.items[0].itemId, "item-silver-sword");
  assert.equal(restoredCharacter.notes, "Ищет работу в Новиграде");
});

test("backup JSON validates and rejects ambiguous character IDs", () => {
  const store = CharacterStore.createStore();
  const backup = CharacterStore.createBackup(store);
  assert.equal(CharacterStore.parseImport(backup).kind, "characters");

  const duplicate = structuredClone(backup);
  duplicate.characters.push(structuredClone(duplicate.characters[0]));
  assert.throws(() => CharacterStore.parseImport(duplicate), /Повторяется characterId/);
  const danglingActiveId = structuredClone(backup);
  danglingActiveId.activeCharacterId = "missing-character";
  assert.throws(() => CharacterStore.parseImport(danglingActiveId), /ID активного персонажа/);
  const invalidLifePath = structuredClone(backup);
  invalidLifePath.characters[0].lifePath.allies = "не массив";
  assert.throws(() => CharacterStore.parseImport(invalidLifePath), /должен быть списком/);
  const duplicateOutcomeId = structuredClone(backup);
  duplicateOutcomeId.characters[0].lifePath.outcomes = [
    { id: "same", type: "Событие", description: "Первое", source: "" },
    { id: "same", type: "Событие", description: "Второе", source: "" },
  ];
  assert.throws(() => CharacterStore.parseImport(duplicateOutcomeId), /Повторяется ID последствия/);
  assert.throws(() => CharacterStore.parseImport({ format: CharacterStore.FORMAT, schemaVersion: 999, characters: [] }), /новее поддерживаемого/);
});

test("combat and magic references reject missing inventory entries and duplicate equipment links", () => {
  const character = CharacterStore.createCharacter("Проверка связей");
  character.equipment.items.push(inventoryItem("weapon-row", "Меч", 1, 1, "catalog-sword"));
  character.equipment.items.push(inventoryItem("armor-row", "Куртка", 1, 2));
  character.equipment.combat.weapons.push({ id: "weapon-main", slot: "primary", inventoryEntryId: "weapon-row", name: "Меч", reliability: "8", conditionNotes: "" });
  character.equipment.combat.armorByZone.torso.inventoryEntryId = "armor-row";
  character.magic.entries.push({ id: "magic-link", kind: "spell", name: "Знак", catalogRef: { type: "recipe", id: "recipe-sign", name: "Знак" } });
  assert.equal(CharacterStore.migrateStore({ ...CharacterStore.createStore(), activeCharacterId: character.characterId, characters: [character] }).characters[0].magic.entries[0].catalogRef.id, "recipe-sign");

  character.equipment.combat.armorByZone.torso.inventoryEntryId = "deleted-row";
  assert.throws(() => CharacterStore.migrateStore({ ...CharacterStore.createStore(), activeCharacterId: character.characterId, characters: [character] }), /отсутствует в инвентаре/);
  character.equipment.combat.armorByZone.torso.inventoryEntryId = "armor-row";
  character.equipment.combat.weapons.push({ id: "weapon-backup", slot: "backup", inventoryEntryId: "weapon-row", name: "Меч", reliability: "8", conditionNotes: "" });
  assert.throws(() => CharacterStore.migrateStore({ ...CharacterStore.createStore(), activeCharacterId: character.characterId, characters: [character] }), /Повторяется предмет экипировки/);
  character.equipment.combat.weapons[1].inventoryEntryId = null;
  character.equipment.combat.weapons[1].slot = "primary";
  assert.throws(() => CharacterStore.migrateStore({ ...CharacterStore.createStore(), activeCharacterId: character.characterId, characters: [character] }), /Повторяется слот оружия/);
  character.equipment.combat.weapons = character.equipment.combat.weapons.slice(0, 1);
  character.equipment.combat.shield = null;
  assert.equal(CharacterStore.migrateStore({ ...CharacterStore.createStore(), activeCharacterId: character.characterId, characters: [character] }).characters[0].equipment.combat.shield, null);
});

test("legacy inventory backup imports as an additional character", () => {
  const payload = {
    format: "witcher-workshop-inventory",
    version: 1,
    items: [inventoryItem("entry-1", "Амулет", 2, 0.1)],
  };
  const result = CharacterStore.parseImport(payload);
  assert.equal(result.kind, "legacy-inventory");
  assert.equal(result.store.characters[0].equipment.items[0].quantity, 2);
  assert.equal(Object.hasOwn(result.store.characters[0].equipment, "capacityKg"), false);
});

test("invalid stored JSON is not overwritten", () => {
  const storage = new MemoryStorage();
  const original = "{not valid JSON";
  storage.setItem(CharacterStore.STORAGE_KEY, original);
  assert.throws(() => CharacterStore.load(storage), /повреждено/);
  assert.equal(storage.getItem(CharacterStore.STORAGE_KEY), original);
});

test("invalid legacy inventory stays untouched and is not partially migrated", () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ version: 1, capacityKg: 10, items: [inventoryItem("entry-1", "", 1, 1)] });
  storage.setItem(CharacterStore.LEGACY_INVENTORY_KEY, original);
  assert.throws(() => CharacterStore.load(storage), /некорректную запись/);
  assert.equal(storage.getItem(CharacterStore.LEGACY_INVENTORY_KEY), original);
  assert.equal(storage.getItem(CharacterStore.STORAGE_KEY), null);
});
