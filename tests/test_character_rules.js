const assert = require("node:assert/strict");
const test = require("node:test");
const Rules = require("../character-rules.js");
const CharacterStore = require("../character-store.js");

function characterWith(body, will, speed) {
  const character = CharacterStore.createCharacter("Проверка правил");
  character.attributes.BODY = body;
  character.attributes.WILL = will;
  character.attributes.SPD = speed;
  return character;
}

test("derived values match the verified example BODY 6, WILL 5, SPD 8", () => {
  const derived = Rules.deriveCharacter(characterWith(6, 5, 8));
  assert.equal(derived.physicalBasis, 5);
  assert.equal(derived.maxHp, 25);
  assert.equal(derived.maxSta, 25);
  assert.equal(derived.recovery, 5);
  assert.equal(derived.stun, 5);
  assert.equal(derived.runMeters, 24);
  assert.equal(derived.leapMeters, 4);
  assert.equal(derived.encumbranceKg, 60);
  assert.equal(derived.liftLimitKg, 300);
  assert.equal(derived.meleeDamageBonus, 0);
  assert.equal(derived.punchDamage, "1d6");
  assert.equal(derived.kickDamage, "1d6+4");
});

test("permanent and temporary attribute changes immediately affect derived values", () => {
  const character = characterWith(6, 5, 8);
  character.attributeModifiers.SPD.temporary = 1;
  character.attributeModifiers.WILL.permanent = 1;
  const derived = Rules.deriveCharacter(character);
  assert.equal(derived.attributes.SPD.total, 9);
  assert.equal(derived.runMeters, 27);
  assert.equal(derived.leapMeters, 5);
  assert.equal(derived.physicalBasis, 6);
  assert.equal(derived.maxHp, 30);
});

test("skill totals combine leading attribute, rank, and separate modifiers", () => {
  const character = characterWith(6, 5, 8);
  character.attributes.REF = 9;
  character.skills.push({ id: "skill-melee", name: "Ближний бой", attribute: "REF", rank: 6, permanentModifier: 1, temporaryModifier: -2 });
  const derived = Rules.deriveCharacter(character);
  assert.equal(derived.skills[0].total, 14);
  assert.equal(Rules.calculateSkill({ attribute: "CRA", rank: 2 }, derived.attributes), null);
});

test("load penalties apply per full 5 kg and stop at the lift limit", () => {
  const character = characterWith(6, 5, 8);
  character.attributes.REF = 7;
  character.attributes.DEX = 6;
  const encumbered = Rules.deriveCharacter(character, { carriedWeightKg: 70 });
  assert.equal(encumbered.load.status, "encumbered");
  assert.equal(encumbered.load.penalty, 2);
  assert.deepEqual(encumbered.load.adjustedAttributes, { REF: 5, DEX: 4, SPD: 6 });

  const overLimit = Rules.deriveCharacter(character, { carriedWeightKg: 301 });
  assert.equal(overLimit.load.status, "over-lift-limit");
  assert.equal(overLimit.load.penalty, null);

  const unknown = Rules.deriveCharacter(character, { carriedWeightKg: 70, unknownWeightCount: 1 });
  assert.equal(unknown.load.status, "unknown");
  assert.equal(unknown.load.penalty, null);
});

test("values outside verified tables remain unknown instead of being extrapolated", () => {
  const character = characterWith(14, 14, 8);
  const derived = Rules.deriveCharacter(character);
  assert.equal(derived.physicalBasis, 14);
  assert.equal(derived.physicalBasisSupported, false);
  assert.equal(derived.maxHp, null);
  assert.equal(derived.stun, null);
  assert.equal(derived.meleeDamageBonus, null);
  assert.equal(derived.punchDamage, null);
});
