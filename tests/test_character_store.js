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

test("legacy inventory migrates to the first character and remains available as a backup", () => {
  const storage = new MemoryStorage();
  const legacy = {
    version: 1,
    capacityKg: 75,
    items: [inventoryItem("entry-1", "Стальной меч", 1, 1.4, "item-sword")],
  };
  const legacyRaw = JSON.stringify(legacy);
  storage.setItem(CharacterStore.LEGACY_INVENTORY_KEY, legacyRaw);

  const result = CharacterStore.load(storage);
  const first = result.store.characters[0];
  assert.equal(result.migratedLegacyInventory, true);
  assert.equal(first.personal.name, "Персонаж 1");
  assert.deepEqual(first.equipment, { capacityKg: 75, items: legacy.items });
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
  first.skills.push({ id: "skill-1", name: "Ближний бой", attribute: "REF", rank: 6 });
  first.state.currentHp = 28;
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
  assert.equal(restoredFirst.skills[0].rank, 6);
  assert.equal(restoredFirst.state.currentHp, 28);
  assert.equal(restoredFirst.abilities[0].name, "Знак Квен");
  assert.equal(restoredFirst.equipment.items[0].name, "Медальон");
  assert.equal(restoredSecond.equipment.items.length, 0);
  assert.equal(restoredSecond.equipment.capacityKg, 10);
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
  assert.throws(() => CharacterStore.parseImport({ format: CharacterStore.FORMAT, schemaVersion: 999, characters: [] }), /новее поддерживаемого/);
});

test("legacy inventory backup imports as an additional character", () => {
  const payload = {
    format: "witcher-workshop-inventory",
    version: 1,
    capacityKg: null,
    items: [inventoryItem("entry-1", "Амулет", 2, 0.1)],
  };
  const result = CharacterStore.parseImport(payload);
  assert.equal(result.kind, "legacy-inventory");
  assert.equal(result.store.characters[0].equipment.items[0].quantity, 2);
  assert.equal(result.store.characters[0].equipment.capacityKg, null);
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
