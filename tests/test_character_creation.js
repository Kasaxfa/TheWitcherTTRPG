const assert = require("node:assert/strict");
const test = require("node:test");
const Creation = require("../character-creation.js");

test("point-buy pools and their balanced starting arrays match 60, 70, and 80", () => {
  assert.deepEqual(Creation.POINT_BUY_POOLS, [60, 70, 80]);
  for (const pool of Creation.POINT_BUY_POOLS) {
    const attributes = Creation.balancedAttributes(pool);
    assert.equal(Object.values(attributes).reduce((sum, value) => sum + value, 0), pool);
    assert.ok(Object.values(attributes).every(value => value >= 1 && value <= 10));
    assert.equal(Creation.validatePointBuy(attributes, pool).ok, true);
  }
});

test("point buy rejects values outside the pool and the 1–10 starting range", () => {
  const attributes = Creation.balancedAttributes(70);
  attributes.INT = 11;
  assert.equal(Creation.validatePointBuy(attributes, 70).ok, false);
  attributes.INT = 1;
  assert.equal(Creation.validatePointBuy(attributes, 60).ok, false);
});

test("each rolled characteristic must receive a distinct d10 result", () => {
  const rolls = [3, 4, 5, 6, 7, 8, 9, 10, 3];
  const assignments = Object.fromEntries(Creation.ATTRIBUTES.map((code, index) => [code, index]));
  assert.deepEqual(Creation.validateDiceAssignment(assignments, rolls).attributes.INT, 3);
  assignments.REF = assignments.INT;
  assert.equal(Creation.validateDiceAssignment(assignments, rolls).ok, false);
});

test("race and profession combinations enforce witcher and mage/priest restrictions", () => {
  assert.equal(Creation.validRaceProfession("Ведьмак", "witcher"), true);
  assert.equal(Creation.validRaceProfession("Человек", "witcher"), false);
  assert.equal(Creation.validRaceProfession("Краснолюд", "mage"), false);
  assert.equal(Creation.validRaceProfession("Эльф", "priest"), true);
});

test("standard life path records decade events and leaves every generated name blank", () => {
  const path = Creation.generateStandardLifePath({ race: "Человек", age: 36, random: () => 0.99 });
  assert.equal(path.kind, "standard");
  assert.equal(path.decadeEvents.length, 3);
  assert.ok(path.relatives.every(relative => relative.name === ""));
  assert.ok(path.rolls.length > 0);
});

test("witcher life path requires a rule-valid age and records school, travel, and decade rolls", () => {
  assert.throws(() => Creation.generateWitcherLifePath({ age: 49 }), /50 до 260/);
  const path = Creation.generateWitcherLifePath({ age: 60, random: () => 0.99 });
  assert.equal(path.kind, "witcher");
  assert.equal(path.school, "Школа Медведя");
  assert.equal(path.travelAge, 29);
  assert.equal(path.decadeEvents.length, 3);
  assert.ok(path.relatives.every(relative => relative.name === ""));
});
