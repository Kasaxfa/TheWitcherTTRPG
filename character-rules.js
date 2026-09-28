(function (root, factory) {
  const rules = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
  if (root) root.CharacterRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ATTRIBUTE_CODES = Object.freeze(["INT", "REF", "DEX", "BODY", "SPD", "EMP", "CRA", "WILL", "LUCK"]);
  const BODY_DAMAGE = Object.freeze({
    1: { melee: -4, punch: "1d6−4", kick: "1d6" },
    2: { melee: -4, punch: "1d6−4", kick: "1d6" },
    3: { melee: -2, punch: "1d6−2", kick: "1d6+2" },
    4: { melee: -2, punch: "1d6−2", kick: "1d6+2" },
    5: { melee: 0, punch: "1d6", kick: "1d6+4" },
    6: { melee: 0, punch: "1d6", kick: "1d6+4" },
    7: { melee: 2, punch: "1d6+2", kick: "1d6+6" },
    8: { melee: 2, punch: "1d6+2", kick: "1d6+6" },
    9: { melee: 4, punch: "1d6+4", kick: "1d6+8" },
    10: { melee: 4, punch: "1d6+4", kick: "1d6+8" },
    11: { melee: 6, punch: "1d6+6", kick: "1d6+10" },
    12: { melee: 6, punch: "1d6+6", kick: "1d6+10" },
    13: { melee: 8, punch: "1d6+8", kick: "1d6+12" },
  });

  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function modifierValue(modifiers, part) {
    return finiteNumber(modifiers?.[part]) ?? 0;
  }

  function effectiveAttribute(base, modifiers = {}) {
    const original = finiteNumber(base);
    if (original === null) return null;
    return original + modifierValue(modifiers, "permanent") + modifierValue(modifiers, "temporary");
  }

  function calculateAttributes(character) {
    return Object.fromEntries(ATTRIBUTE_CODES.map(code => {
      const modifiers = character.attributeModifiers?.[code] || {};
      const base = finiteNumber(character.attributes?.[code]);
      const permanent = modifierValue(modifiers, "permanent");
      const temporary = modifierValue(modifiers, "temporary");
      return [code, {
        base,
        permanent,
        temporary,
        total: effectiveAttribute(base, modifiers),
      }];
    }));
  }

  function calculateSkill(skill, attributes) {
    const attribute = skill?.attribute && attributes[skill.attribute] ? attributes[skill.attribute].total : null;
    if (attribute === null || attribute === undefined) return null;
    return attribute + (finiteNumber(skill.rank) ?? 0)
      + modifierValue(skill, "permanentModifier")
      + modifierValue(skill, "temporaryModifier");
  }

  function deriveCharacter(character, { carriedWeightKg = null, unknownWeightCount = 0 } = {}) {
    const attributes = calculateAttributes(character);
    const body = attributes.BODY.total;
    const will = attributes.WILL.total;
    const speed = attributes.SPD.total;
    const physicalBasis = body === null || will === null ? null : Math.floor((body + will) / 2);
    const basisSupported = physicalBasis !== null && physicalBasis >= 2 && physicalBasis <= 13;
    const encumbranceKg = body === null || body < 1 ? null : body * 10;
    const liftLimitKg = body === null || body < 1 ? null : body * 50;
    const damage = body !== null && Number.isInteger(body) ? BODY_DAMAGE[body] || null : null;
    const knownWeight = finiteNumber(carriedWeightKg);
    const hasCompleteWeight = knownWeight !== null && unknownWeightCount === 0;
    let loadStatus = "unknown";
    let loadPenalty = null;

    if (knownWeight !== null && encumbranceKg !== null && liftLimitKg !== null) {
      if (knownWeight > liftLimitKg) loadStatus = "over-lift-limit";
      else if (!hasCompleteWeight) loadStatus = "unknown";
      else if (knownWeight > encumbranceKg) {
        loadStatus = "encumbered";
        loadPenalty = Math.floor((knownWeight - encumbranceKg) / 5);
      } else loadStatus = "within-capacity";
    }

    const loadAdjusted = {};
    for (const code of ["REF", "DEX", "SPD"]) {
      const total = attributes[code].total;
      loadAdjusted[code] = total === null || loadPenalty === null
        ? total
        : Math.max(1, total - loadPenalty);
    }

    const skills = (Array.isArray(character.skills) ? character.skills : []).map(skill => ({
      id: skill.id,
      total: calculateSkill(skill, attributes),
    }));

    return {
      attributes,
      skills,
      physicalBasis,
      physicalBasisSupported: basisSupported,
      maxHp: basisSupported ? physicalBasis * 5 : null,
      maxSta: basisSupported ? physicalBasis * 5 : null,
      recovery: basisSupported ? physicalBasis : null,
      stun: basisSupported ? Math.min(physicalBasis, 10) : null,
      runMeters: speed === null ? null : speed * 3,
      leapMeters: speed === null ? null : Math.floor((speed * 3) / 5),
      encumbranceKg,
      liftLimitKg,
      meleeDamageBonus: damage?.melee ?? null,
      punchDamage: damage?.punch ?? null,
      kickDamage: damage?.kick ?? null,
      load: {
        status: loadStatus,
        penalty: loadPenalty,
        carriedWeightKg: knownWeight,
        unknownWeightCount: Math.max(0, Number(unknownWeightCount) || 0),
        adjustedAttributes: loadAdjusted,
      },
    };
  }

  return Object.freeze({ ATTRIBUTE_CODES, effectiveAttribute, calculateAttributes, calculateSkill, deriveCharacter });
});
