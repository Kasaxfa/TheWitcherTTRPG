(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CharacterAdvancement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_RANK = 10;
  const MAX_BASE_ATTRIBUTE = 10;
  const MAX_POINTS = 100000;

  function progression(character) {
    if (!character || typeof character !== "object") throw new Error("Не найден лист персонажа.");
    character.development ||= { earnedPoints: 0, availablePoints: 0 };
    const earned = Number(character.development.earnedPoints ?? 0);
    const available = Number(character.development.availablePoints ?? 0);
    if (!Number.isInteger(earned) || !Number.isInteger(available) || earned < 0 || available < 0 || available > earned) {
      throw new Error("Баланс очков улучшения повреждён.");
    }
    return character.development;
  }

  function skillUpgradeCost(rank, doubleCost = false) {
    const current = Number(rank ?? 0);
    if (!Number.isInteger(current) || current < 0 || current > MAX_RANK) return null;
    if (current >= MAX_RANK) return null;
    return Math.max(1, current) * (doubleCost ? 2 : 1);
  }

  function attributeUpgradeCost(base) {
    if (base === null || base === undefined || base === "") return null;
    const current = Number(base);
    if (!Number.isInteger(current) || current < 0 || current >= MAX_BASE_ATTRIBUTE) return null;
    return current * 10;
  }

  function spend(character, cost) {
    const points = progression(character);
    if (!Number.isInteger(cost) || cost < 0) return { ok: false, message: "Не удалось определить стоимость улучшения." };
    if (points.availablePoints < cost) return { ok: false, message: "Недостаточно очков улучшения." };
    points.availablePoints -= cost;
    return { ok: true, cost, availablePoints: points.availablePoints };
  }

  function awardPoints(character, amount) {
    const points = progression(character);
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || value > MAX_POINTS) {
      return { ok: false, message: "Начислите целое число очков от 1 до 100 000." };
    }
    if (points.earnedPoints + value > MAX_POINTS || points.availablePoints + value > MAX_POINTS) {
      return { ok: false, message: "Сумма очков превысит допустимый предел." };
    }
    points.earnedPoints += value;
    points.availablePoints += value;
    return { ok: true, awarded: value, earnedPoints: points.earnedPoints, availablePoints: points.availablePoints };
  }

  function improveSkill(character, skillId, definition = {}) {
    const skill = character?.skills?.find(entry => entry.id === skillId);
    if (!skill) return { ok: false, message: "Навык не найден." };
    const current = Number(skill.rank ?? 0);
    const cost = skillUpgradeCost(current, Boolean(definition.doubleCost));
    if (cost === null) return { ok: false, message: "Навык уже достиг максимального ранга 10." };
    const result = spend(character, cost);
    if (!result.ok) return result;
    skill.rank = current + 1;
    return { ...result, rank: skill.rank, skill };
  }

  function improveAttribute(character, code) {
    const base = character?.attributes?.[code];
    const cost = attributeUpgradeCost(base);
    if (cost === null) return { ok: false, message: "Характеристика уже достигла обычного предела 10 либо не имеет исходного значения." };
    const result = spend(character, cost);
    if (!result.ok) return result;
    character.attributes[code] = Number(base) + 1;
    return { ...result, value: character.attributes[code] };
  }

  function improveProfessionAbility(character, professionId, branchId, index, trees) {
    const catalog = trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null);
    if (!catalog) return { ok: false, message: "Дерево профессии недоступно." };
    const tree = catalog.TREES?.[professionId];
    const branch = tree?.branches?.find(entry => entry.id === branchId);
    const node = branch?.nodes?.[index];
    if (!node) return { ok: false, message: "Умение не найдено в дереве профессии." };
    const state = catalog.getNodeState(character, professionId, branchId, index);
    if (!state.unlocked) return { ok: false, message: "Сначала доведите предыдущую способность этой ветви до 5." };
    const cost = skillUpgradeCost(state.rank, false);
    if (cost === null) return { ok: false, message: "Умение уже достигло максимального ранга 10." };
    const result = spend(character, cost);
    if (!result.ok) return result;
    const changed = catalog.setRank(character, professionId, branchId, index, state.rank + 1);
    if (!changed.ok) {
      character.development.availablePoints += cost;
      return changed;
    }
    return { ...result, rank: state.rank + 1, node };
  }

  return Object.freeze({
    MAX_RANK,
    MAX_BASE_ATTRIBUTE,
    MAX_POINTS,
    progression,
    skillUpgradeCost,
    attributeUpgradeCost,
    awardPoints,
    improveSkill,
    improveAttribute,
    improveProfessionAbility,
  });
});
