(function (root, factory) {
  const skillCatalog = typeof module !== "undefined" && module.exports
    ? require("./character-skills.js")
    : root?.CharacterSkills;
  const api = factory(skillCatalog);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CharacterAdvancement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (skillCatalog) {
  "use strict";

  const MAX_RANK = 10;
  const MAX_BASE_ATTRIBUTE = 10;
  const MAX_POINTS = 100000;
  const DRAFT_GROUPS = ["attributes", "skills", "professionAbilities"];

  function emptyDraft() {
    return { attributes: {}, skills: {}, professionAbilities: {} };
  }

  function progression(character) {
    if (!character || typeof character !== "object") throw new Error("Не найден лист персонажа.");
    character.development ||= { earnedPoints: 0, availablePoints: 0, draft: emptyDraft() };
    character.development.draft ||= emptyDraft();
    for (const group of DRAFT_GROUPS) character.development.draft[group] ||= {};
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

  function draftCount(character, group, key) {
    const draft = character?.development?.draft || {};
    return Math.max(0, Number(draft[group]?.[key] || 0));
  }

  function setDraftCount(character, group, key, count) {
    const map = progression(character).draft[group];
    if (count > 0) map[key] = count;
    else delete map[key];
  }

  function rankCostFrom(baseRank, count, doubleCost = false) {
    let total = 0;
    for (let offset = 0; offset < count; offset += 1) {
      const cost = skillUpgradeCost(baseRank + offset, doubleCost);
      if (cost === null) return null;
      total += cost;
    }
    return total;
  }

  function effectiveSkillRank(skill) {
    return Number(skill?.rank ?? 0) + Number(skill?.nativeBonus ?? 0);
  }

  function attributeDraftCost(character, code) {
    const count = draftCount(character, "attributes", code);
    const base = character.attributes?.[code];
    let total = 0;
    for (let offset = 0; offset < count; offset += 1) {
      const cost = attributeUpgradeCost(Number(base) + offset);
      if (cost === null) return null;
      total += cost;
    }
    return total;
  }

  function treeKey(professionId, branchId, index) {
    return `${professionId}:${branchId}:${index}`;
  }

  function parseTreeKey(key) {
    const match = /^([a-z0-9-]+):([ABC]):([012])$/i.exec(key);
    return match ? { professionId: match[1], branchId: match[2], index: Number(match[3]) } : null;
  }

  function treeRank(character, professionId, branchId, index, trees) {
    return trees.getNodeState(character, professionId, branchId, index).rank;
  }

  function treeDraftCost(character, key, trees) {
    const parsed = parseTreeKey(key);
    if (!parsed) return null;
    const count = draftCount(character, "professionAbilities", key);
    return rankCostFrom(treeRank(character, parsed.professionId, parsed.branchId, parsed.index, trees), count);
  }

  function professionAbilityState(character, professionId, branchId, index, trees) {
    const catalog = trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null);
    const branch = catalog?.TREES?.[professionId]?.branches?.find(entry => entry.id === branchId);
    if (!branch?.nodes?.[index]) return null;
    const base = catalog.getNodeState(character, professionId, branchId, index);
    const key = treeKey(professionId, branchId, index);
    const pending = draftCount(character, "professionAbilities", key);
    const previousRank = index === 0 ? null
      : professionAbilityState(character, professionId, branchId, index - 1, catalog)?.rank ?? 0;
    return {
      rank: base.rank + pending,
      baseRank: base.rank,
      pending,
      unlocked: index === 0 || previousRank >= 5,
      nextUnlockAt: index > 0 ? 5 : null,
    };
  }

  function draftCosts(character, trees) {
    const draft = progression(character).draft;
    let total = 0;
    for (const [code, count] of Object.entries(draft.attributes)) {
      const cost = attributeDraftCost(character, code);
      if (cost === null || !Number.isInteger(count)) return null;
      total += cost;
    }
    for (const [skillId, count] of Object.entries(draft.skills)) {
      const skill = character.skills?.find(entry => entry.id === skillId);
      if (!skill || !Number.isInteger(count)) return null;
      const definition = skill.catalogId && skillCatalog?.SKILLS?.find(entry => entry.id === skill.catalogId);
      const cost = rankCostFrom(effectiveSkillRank(skill), count, Boolean(definition?.doubleCost));
      if (cost === null) return null;
      total += cost;
    }
    for (const [key, count] of Object.entries(draft.professionAbilities)) {
      if (!Number.isInteger(count)) return null;
      const cost = treeDraftCost(character, key, trees);
      if (cost === null) return null;
      total += cost;
    }
    return total;
  }

  function hasPendingRanks(character) {
    const draft = progression(character).draft;
    return DRAFT_GROUPS.some(group => Object.keys(draft[group]).length > 0);
  }

  function reserve(character, group, key, currentRank, cost, maxRank = MAX_RANK) {
    const points = progression(character);
    if (currentRank >= maxRank) return { ok: false, message: "Улучшение уже достигло максимального ранга." };
    if (cost === null || !Number.isInteger(cost) || cost < 0) return { ok: false, message: "Не удалось определить стоимость улучшения." };
    if (points.availablePoints < cost) return { ok: false, message: "Недостаточно доступных очков улучшения." };
    points.availablePoints -= cost;
    setDraftCount(character, group, key, draftCount(character, group, key) + 1);
    return { ok: true, cost, pendingRank: currentRank + 1, availablePoints: points.availablePoints };
  }

  function releaseLast(character, group, key, baseRank, doubleCost = false, maxRank = MAX_RANK) {
    const pending = draftCount(character, group, key);
    if (pending < 1) return { ok: false, message: "Для отмены сначала добавьте улучшение в черновик." };
    const lastRank = baseRank + pending - 1;
    const cost = group === "attributes"
      ? attributeUpgradeCost(lastRank)
      : skillUpgradeCost(lastRank, doubleCost);
    if (cost === null) return { ok: false, message: "Черновик улучшения повреждён." };
    setDraftCount(character, group, key, pending - 1);
    progression(character).availablePoints += cost;
    return { ok: true, cost, pendingRank: baseRank + pending - 1, availablePoints: progression(character).availablePoints };
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

  function stageSkillUpgrade(character, skillId, definition = {}) {
    const skill = character?.skills?.find(entry => entry.id === skillId);
    if (!skill) return { ok: false, message: "Навык не найден." };
    const baseRank = effectiveSkillRank(skill);
    const currentRank = baseRank + draftCount(character, "skills", skillId);
    return reserve(character, "skills", skillId, currentRank, skillUpgradeCost(currentRank, Boolean(definition.doubleCost)));
  }

  function undoSkillUpgrade(character, skillId, definition = {}) {
    const skill = character?.skills?.find(entry => entry.id === skillId);
    if (!skill) return { ok: false, message: "Навык не найден." };
    return releaseLast(character, "skills", skillId, effectiveSkillRank(skill), Boolean(definition.doubleCost));
  }

  function stageAttributeUpgrade(character, code) {
    const base = character?.attributes?.[code];
    if (base === null || base === undefined) return { ok: false, message: "Сначала задайте исходное значение характеристики." };
    const currentRank = Number(base) + draftCount(character, "attributes", code);
    return reserve(character, "attributes", code, currentRank, attributeUpgradeCost(currentRank), MAX_BASE_ATTRIBUTE);
  }

  function undoAttributeUpgrade(character, code) {
    const base = character?.attributes?.[code];
    if (base === null || base === undefined) return { ok: false, message: "У характеристики нет исходного значения." };
    return releaseLast(character, "attributes", code, Number(base), false, MAX_BASE_ATTRIBUTE);
  }

  function stageProfessionAbilityUpgrade(character, professionId, branchId, index, trees) {
    const catalog = trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null);
    if (!catalog) return { ok: false, message: "Дерево профессии недоступно." };
    const tree = catalog.TREES?.[professionId];
    const branch = tree?.branches?.find(entry => entry.id === branchId);
    if (!branch?.nodes?.[index]) return { ok: false, message: "Умение не найдено в дереве профессии." };
    const state = professionAbilityState(character, professionId, branchId, index, catalog);
    if (!state.unlocked) return { ok: false, message: "Сначала доведите предыдущее умение этой ветви до 5." };
    const key = treeKey(professionId, branchId, index);
    const currentRank = state.rank;
    return reserve(character, "professionAbilities", key, currentRank, skillUpgradeCost(currentRank));
  }

  function undoProfessionAbilityUpgrade(character, professionId, branchId, index, trees) {
    const catalog = trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null);
    if (!catalog) return { ok: false, message: "Дерево профессии недоступно." };
    const key = treeKey(professionId, branchId, index);
    const state = catalog.getNodeState(character, professionId, branchId, index);
    const result = releaseLast(character, "professionAbilities", key, state.rank);
    if (!result.ok || index >= 2) return result;
    const nextState = professionAbilityState(character, professionId, branchId, index, catalog);
    if (nextState.rank >= 5) return result;
    let refundedDescendants = 0;
    for (let child = index + 1; child < 3; child += 1) {
      const childKey = treeKey(professionId, branchId, child);
      const childRank = catalog.getNodeState(character, professionId, branchId, child).rank;
      const pending = draftCount(character, "professionAbilities", childKey);
      const childCost = rankCostFrom(childRank, pending);
      if (childCost === null) return { ok: false, message: "Не удалось пересчитать черновик следующей способности." };
      refundedDescendants += childCost;
      setDraftCount(character, "professionAbilities", childKey, 0);
    }
    progression(character).availablePoints += refundedDescendants;
    return { ...result, refundedDescendants, availablePoints: progression(character).availablePoints };
  }

  function countDraftRanks(character, group, key) {
    return draftCount(character, group, key);
  }

  function cancelDraft(character, trees) {
    const points = progression(character);
    const cost = draftCosts(character, trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null));
    if (cost === null) return { ok: false, message: "Не удалось пересчитать очки черновика." };
    if (!hasPendingRanks(character)) return { ok: false, message: "Нет неподтверждённых улучшений." };
    points.availablePoints += cost;
    points.draft = emptyDraft();
    return { ok: true, refunded: cost, availablePoints: points.availablePoints };
  }

  function applyDraft(character, trees) {
    const catalog = trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null);
    if (!catalog) return { ok: false, message: "Дерево профессии недоступно." };
    const points = progression(character);
    const draft = points.draft;
    const cost = draftCosts(character, catalog);
    if (cost === null) return { ok: false, message: "Черновик содержит неизвестный навык или повреждённую стоимость." };
    if (!hasPendingRanks(character)) return { ok: false, message: "Добавьте улучшения перед применением." };

    for (const [code, count] of Object.entries(draft.attributes)) {
      const base = character.attributes?.[code];
      if (attributeUpgradeCost(Number(base) + count - 1) === null) return { ok: false, message: "Исходное значение характеристики изменилось. Пересоберите черновик." };
    }
    for (const [skillId, count] of Object.entries(draft.skills)) {
      const skill = character.skills?.find(entry => entry.id === skillId);
      if (!skill || effectiveSkillRank(skill) + count > MAX_RANK) return { ok: false, message: "Ранг навыка изменился. Пересоберите черновик." };
    }
    for (const [key, count] of Object.entries(draft.professionAbilities)) {
      const parsed = parseTreeKey(key);
      const node = parsed && catalog.TREES?.[parsed.professionId]?.branches?.find(branch => branch.id === parsed.branchId)?.nodes?.[parsed.index];
      const state = parsed && professionAbilityState(character, parsed.professionId, parsed.branchId, parsed.index, catalog);
      if (!node || !state?.unlocked || state.baseRank + count > MAX_RANK) return { ok: false, message: "Дерево изменилось; повторите прокачку и проверьте блокировки." };
    }

    for (const [code, count] of Object.entries(draft.attributes)) character.attributes[code] = Number(character.attributes[code]) + count;
    for (const [skillId, count] of Object.entries(draft.skills)) {
      const skill = character.skills.find(entry => entry.id === skillId);
      skill.rank = Number(skill.rank ?? 0) + count;
    }
    const treeUpgrades = Object.entries(draft.professionAbilities)
      .map(([key, count]) => ({ ...parseTreeKey(key), count }))
      .sort((a, b) => a.professionId.localeCompare(b.professionId) || a.branchId.localeCompare(b.branchId) || a.index - b.index);
    for (const upgrade of treeUpgrades) {
      const state = catalog.getNodeState(character, upgrade.professionId, upgrade.branchId, upgrade.index);
      const result = catalog.setRank(character, upgrade.professionId, upgrade.branchId, upgrade.index, state.rank + upgrade.count);
      if (!result.ok) throw new Error(result.message);
    }
    points.draft = emptyDraft();
    return { ok: true, appliedPoints: cost, availablePoints: points.availablePoints };
  }

  function draftSummary(character, trees) {
    const draft = character?.development?.draft || emptyDraft();
    const snapshot = {
      ...character,
      development: {
        earnedPoints: Number(character?.development?.earnedPoints ?? 0),
        availablePoints: Number(character?.development?.availablePoints ?? 0),
        draft: Object.fromEntries(DRAFT_GROUPS.map(group => [group, { ...(draft[group] || {}) }])),
      },
    };
    const cost = draftCosts(snapshot, trees || (typeof globalThis !== "undefined" ? globalThis.CharacterProfessionTrees : null));
    if (cost === null) throw new Error("Черновик прокачки повреждён.");
    const points = snapshot.development;
    return {
      earnedPoints: points.earnedPoints,
      availablePoints: points.availablePoints,
      reservedPoints: cost,
      spentPoints: points.earnedPoints - points.availablePoints - cost,
      hasDraft: hasPendingRanks(snapshot),
    };
  }

  return Object.freeze({
    MAX_RANK,
    MAX_BASE_ATTRIBUTE,
    MAX_POINTS,
    emptyDraft,
    progression,
    skillUpgradeCost,
    attributeUpgradeCost,
    draftCosts,
    draftSummary,
    draftCount: countDraftRanks,
    treeKey,
    professionAbilityState,
    awardPoints,
    stageSkillUpgrade,
    undoSkillUpgrade,
    stageAttributeUpgrade,
    undoAttributeUpgrade,
    stageProfessionAbilityUpgrade,
    undoProfessionAbilityUpgrade,
    applyDraft,
    cancelDraft,
  });
});
