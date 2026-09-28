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

test("armor EV and encumbrance update attribute-based skills and magic skills", () => {
  const character = characterWith(6, 7, 8);
  character.attributes.REF = 7;
  character.attributes.DEX = 6;
  character.skills.push(
    { id: "dodge", catalogId: "dodge-evade", name: "Уклонение", attribute: "REF", rank: 1 },
    { id: "spell", catalogId: "spellcasting", name: "Сотворение заклинаний", attribute: "WILL", rank: 2 },
  );
  const derived = Rules.deriveCharacter(character, { carriedWeightKg: 70, armorEv: 3 });
  assert.equal(derived.equipmentAdjustedAttributes.REF, 2);
  assert.equal(derived.equipmentAdjustedAttributes.DEX, 1);
  assert.equal(derived.equipmentAdjustedAttributes.SPD, 6);
  assert.equal(derived.skills.find(skill => skill.id === "dodge").total, 3);
  assert.equal(derived.skills.find(skill => skill.id === "dodge").equipmentPenalty, 5);
  assert.equal(derived.skills.find(skill => skill.id === "spell").total, 6);
  assert.equal(derived.skills.find(skill => skill.id === "spell").armorPenalty, 3);
});

test("unknown armor EV is shown as unknown rather than treated as zero", () => {
  const character = characterWith(6, 7, 8);
  character.attributes.REF = 7;
  character.skills.push(
    { id: "dodge", catalogId: "dodge-evade", name: "Уклонение", attribute: "REF", rank: 1 },
    { id: "hex", catalogId: "hexing", name: "Наведение порчи", attribute: "WILL", rank: 2 },
  );
  const derived = Rules.deriveCharacter(character, { armorEv: null, unknownArmorEvCount: 1 });
  assert.equal(derived.equipmentAdjustedAttributes.REF, null);
  assert.equal(derived.skills.find(skill => skill.id === "dodge").total, null);
  assert.equal(derived.skills.find(skill => skill.id === "hex").total, null);
  assert.equal(derived.armor.unknownCount, 1);
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

test("racial attribute adjustments appear as a separate component and affect derived values", () => {
  const character = characterWith(6, 5, 8);
  character.personal.race = "Ведьмак";
  character.attributes.REF = 8;
  character.attributes.DEX = 7;
  character.attributes.EMP = 3;
  const derived = Rules.deriveCharacter(character);
  assert.equal(derived.attributes.REF.racial, 1);
  assert.equal(derived.attributes.REF.total, 9);
  assert.equal(derived.attributes.DEX.total, 8);
  assert.equal(derived.attributes.EMP.total, 1);
});

test("racial skill bonuses and homeland bonuses are included once in skill totals", () => {
  const character = characterWith(6, 5, 8);
  character.personal.race = "Эльф";
  character.attributes.DEX = 7;
  character.lifePath.generated = { effects: [{ type: "Родина", effect: { type: "skillBonus", skillId: "bow", value: 1 } }] };
  character.skills.push({ id: "bow", catalogId: "bow", name: "Стрельба из лука", attribute: "DEX", rank: 2 });
  const skill = Rules.deriveCharacter(character).skills[0];
  assert.equal(skill.racialBonus, 2);
  assert.equal(skill.originBonus, 1);
  assert.equal(skill.total, 12);
});

test("dwarf capacity includes the racial 25 kg bonus", () => {
  const character = characterWith(6, 5, 8);
  character.personal.race = "Краснолюд";
  const derived = Rules.deriveCharacter(character);
  assert.equal(derived.encumbranceKg, 85);
  assert.equal(derived.racialCapacityBonus, 25);
  assert.equal(derived.naturalProtection, 2);
});
