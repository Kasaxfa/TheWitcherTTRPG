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
  const RACE_ATTRIBUTES = Object.freeze({
    "Ведьмак": Object.freeze({ REF: 1, DEX: 1, EMP: -4 }),
  });
  const MINIMUM_RACE_ATTRIBUTES = Object.freeze({ "Ведьмак": Object.freeze({ EMP: 1 }) });
  const RACE_SKILLS = Object.freeze({
    "Человек": Object.freeze({ deduction: 1 }),
    "Эльф": Object.freeze({ art: 1, bow: 2 }),
    "Краснолюд": Object.freeze({ strength: 1, trade: 1 }),
    "Ведьмак": Object.freeze({ awareness: 1 }),
  });
  const SKILL_NAMES = Object.freeze({
    "Внимание": "awareness", "Дедукция": "deduction", "Искусство": "art", "Стрельба из лука": "bow",
    "Сила": "strength", "Торговля": "trade",
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
      const race = character.personal?.race || "";
      const racial = finiteNumber(RACE_ATTRIBUTES[race]?.[code]) ?? 0;
      const background = (character.lifePath?.generated?.effects || [])
        .filter(effect => effect?.type === "attributeModifier" && effect.attribute === code)
        .reduce((sum, effect) => sum + (finiteNumber(effect.value) ?? 0), 0);
      const minimum = MINIMUM_RACE_ATTRIBUTES[race]?.[code] ?? null;
      const rawTotal = base === null ? null : base + permanent + temporary + racial + background;
      return [code, {
        base,
        permanent,
        temporary,
        racial,
        background,
        total: rawTotal === null ? null : minimum === null ? rawTotal : Math.max(minimum, rawTotal),
      }];
    }));
  }

  function skillCatalogId(skill) {
    return skill?.catalogId || SKILL_NAMES[skill?.name] || null;
  }

  function skillBonuses(character, skill) {
    const skillId = skillCatalogId(skill);
    const racial = finiteNumber(RACE_SKILLS[character.personal?.race || ""]?.[skillId]) ?? 0;
    const origin = (character.lifePath?.generated?.effects || [])
      .filter(effect => {
        const bonus = effect?.effect?.type === "skillBonus" ? effect.effect : effect;
        return bonus?.type === "skillBonus" && bonus.skillId === skillId;
      })
      .reduce((sum, effect) => {
        const bonus = effect?.effect?.type === "skillBonus" ? effect.effect : effect;
        return sum + (finiteNumber(bonus.value) ?? 0);
      }, 0);
    return { racial, origin };
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
    const racialCapacityBonus = character.personal?.race === "Краснолюд" ? 25 : 0;
    const encumbranceKg = body === null || body < 1 ? null : body * 10 + racialCapacityBonus;
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

    const skills = (Array.isArray(character.skills) ? character.skills : []).map(skill => {
      const bonuses = skillBonuses(character, skill);
      const baseTotal = calculateSkill(skill, attributes);
      return {
        id: skill.id,
        racialBonus: bonuses.racial,
        originBonus: bonuses.origin,
        total: baseTotal === null ? null : baseTotal + bonuses.racial + bonuses.origin,
      };
    });

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
      racialCapacityBonus,
      liftLimitKg,
      naturalProtection: character.personal?.race === "Краснолюд" ? 2 : 0,
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

  return Object.freeze({ ATTRIBUTE_CODES, effectiveAttribute, calculateAttributes, calculateSkill, skillBonuses, deriveCharacter });
});
