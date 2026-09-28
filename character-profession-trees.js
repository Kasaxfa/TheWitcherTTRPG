(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CharacterProfessionTrees = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TREE_LIST = Object.freeze([
    {
      professionId: "bard", defining: "Уличное выступление", attribute: "EMP", sourcePage: 62,
      branches: [
        { id: "A", name: "Обольститель", nodes: [["Повторное выступление", "EMP"], ["Заворожить публику", "EMP"], ["Добрый друг", "EMP"]] },
        { id: "B", name: "Информатор", nodes: [["Незаметность", "INT"], ["Пустить слух", "INT"], ["Сойти за своего", "INT"]] },
        { id: "C", name: "Интриган", nodes: [["Коварство", "EMP"], ["Подколка", "EMP"], ["И ты, Брут", "EMP"]] },
      ],
    },
    {
      professionId: "witcher", defining: "Подготовка ведьмака", attribute: "INT", sourcePage: 63,
      branches: [
        { id: "A", name: "Магический клинок", nodes: [["Медитация", null], ["Магический источник", null], ["Гелиотроп", "WILL"]] },
        { id: "B", name: "Мутант", nodes: [["Крепкий желудок", null], ["Ярость", null], ["Трансмутация", "BODY"]] },
        { id: "C", name: "Убийца", nodes: [["Отбивание стрел", "DEX"], ["Быстрый удар", "REF"], ["Вихрь", "REF"]] },
      ],
    },
    {
      professionId: "warrior", defining: "Крепче стали", attribute: "BODY", sourcePage: 64,
      branches: [
        { id: "A", name: "Стрелок", nodes: [["Максимальная дистанция", "DEX"], ["Двойной выстрел", "DEX"], ["Точный прицел", "DEX"]] },
        { id: "B", name: "Охотник за головами", nodes: [["Ищейка", "INT"], ["Ловушка воина", "CRA"], ["Тактическое преимущество", "INT"]] },
        { id: "C", name: "Потрошитель", nodes: [["Неистовство", "WILL"], ["Двуручник", "BODY"], ["Игнорировать удар", "BODY"]] },
      ],
    },
    {
      professionId: "priest", defining: "Посвящённый", attribute: "EMP", sourcePage: 65,
      branches: [
        { id: "A", name: "Проповедник", nodes: [["Божественная сила", null], ["Божественный авторитет", "EMP"], ["Предвидение", "WILL"]] },
        { id: "B", name: "Друид", nodes: [["Единение с природой", null], ["Знаки природы", "INT"], ["Союзник природы", "WILL"]] },
        { id: "C", name: "Фанатик", nodes: [["Кровавые ритуалы", "WILL"], ["Рвение", "EMP"], ["Слово божье", "EMP"]] },
      ],
    },
    {
      professionId: "mage", defining: "Магические познания", attribute: "INT", sourcePage: 66,
      branches: [
        { id: "A", name: "Политик", nodes: [["Строить козни", "INT"], ["Сплетни", "INT"], ["Полезные связи", "INT"]] },
        { id: "B", name: "Учёный", nodes: [["Анализ", "INT"], ["Дистилляция", "CRA"], ["Мутация", "INT"]] },
        { id: "C", name: "Архимаг", nodes: [["Укрепление связи", null], ["Устойчивость к двимериту", "WILL"], ["Усиление магии", "WILL"]] },
      ],
    },
    {
      professionId: "doctor", defining: "Лечащее прикосновение", attribute: "CRA", sourcePage: 67,
      branches: [
        { id: "A", name: "Хирург", nodes: [["Диагноз", "INT"], ["Осмотр", "INT"], ["Эффективная хирургия", "CRA"]] },
        { id: "B", name: "Травник", nodes: [["Палатка лекаря", "CRA"], ["Подручные средства", "INT"], ["Растительное лекарство", "CRA"]] },
        { id: "C", name: "Анатом", nodes: [["Кровавая рана", "INT"], ["Практическая резня", "INT"], ["Калечащая рана", "INT"]] },
      ],
    },
    {
      professionId: "criminal", defining: "Профессиональная паранойя", attribute: "INT", sourcePage: 68,
      branches: [
        { id: "A", name: "Вор", nodes: [["Присмотреться", "INT"], ["Повторный взлом", "INT"], ["Залечь на дно", "INT"]] },
        { id: "B", name: "Атаман", nodes: [["Уязвимость", "EMP"], ["Взять на заметку", "WILL"], ["Сбор", "WILL"]] },
        { id: "C", name: "Ассасин", nodes: [["Прицеливание", "DEX"], ["Прямо в глаз", "DEX"], ["Удар ассасина", "DEX"]] },
      ],
    },
    {
      professionId: "craftsman", defining: "Быстрый ремонт", attribute: "CRA", sourcePage: 69,
      branches: [
        { id: "A", name: "Оружейник", nodes: [["Большой каталог", "INT"], ["Подмастерье", "CRA"], ["Мастерская работа", "CRA"]] },
        { id: "B", name: "Алхимик", nodes: [["Список лекарств", "INT"], ["Двойная порция", "CRA"], ["Адаптация", "CRA"]] },
        { id: "C", name: "Импровизатор", nodes: [["Улучшение", "CRA"], ["Серебрение", "CRA"], ["Прицельный удар", "CRA"]] },
      ],
    },
    {
      professionId: "merchant", defining: "Бывалый путешественник", attribute: "INT", sourcePage: 70,
      branches: [
        { id: "A", name: "Посредник", nodes: [["Рынок", "INT"], ["Нечестная сделка", "EMP"], ["Обещание", "EMP"]] },
        { id: "B", name: "Человек со связями", nodes: [["Трущобы", "EMP"], ["Свой человек", "INT"], ["Карта сокровищ", "INT"]] },
        { id: "C", name: "Гавенкар", nodes: [["Хорошие связи", "WILL"], ["Сбытчик", "INT"], ["Воинский долг", "EMP"]] },
      ],
    },
  ].map(profession => Object.freeze({
    ...profession,
    branches: Object.freeze(profession.branches.map(branch => Object.freeze({
      ...branch,
      nodes: Object.freeze(branch.nodes.map(([name, attribute], index) => Object.freeze({
        id: `${profession.professionId}.${branch.id}${index + 1}`,
        name,
        attribute,
        rank: 0,
        tier: index + 1,
      }))),
    }))),
  })));

  const TREES = Object.freeze(Object.fromEntries(TREE_LIST.map(tree => [tree.professionId, tree])));

  function createProgress() {
    return { branches: { A: [0, 0, 0], B: [0, 0, 0], C: [0, 0, 0] } };
  }

  function ensureProgress(character, professionId) {
    if (!character || !TREES[professionId]) return false;
    character.professionTrees ||= {};
    const before = JSON.stringify(character.professionTrees[professionId]);
    const old = character.professionTrees[professionId] || {};
    const progress = { branches: {} };
    for (const branchId of ["A", "B", "C"]) {
      const values = old.branches?.[branchId];
      progress.branches[branchId] = Array.from({ length: 3 }, (_, index) => {
        const value = Number(values?.[index] ?? 0);
        return Number.isFinite(value) ? Math.max(0, Math.min(10, Math.trunc(value))) : 0;
      });
    }
    character.professionTrees[professionId] = progress;
    return before !== JSON.stringify(progress);
  }

  function getNodeState(character, professionId, branchId, index) {
    ensureProgress(character, professionId);
    const ranks = character?.professionTrees?.[professionId]?.branches?.[branchId] || [0, 0, 0];
    const unlocked = index === 0 || ranks[index - 1] >= 5;
    return { rank: ranks[index] ?? 0, unlocked, nextUnlockAt: index > 0 ? 5 : null };
  }

  function setRank(character, professionId, branchId, index, value) {
    if (!TREES[professionId] || !["A", "B", "C"].includes(branchId) || !Number.isInteger(index) || index < 0 || index > 2) {
      return { ok: false, message: "Эта способность не относится к выбранному дереву." };
    }
    ensureProgress(character, professionId);
    const state = getNodeState(character, professionId, branchId, index);
    const rank = Number(value);
    if (!state.unlocked) return { ok: false, message: "Сначала доведите предыдущую способность этой ветви до 5." };
    if (!Number.isInteger(rank) || rank < 0 || rank > 10) return { ok: false, message: "Рейтинг способности должен быть от 0 до 10." };
    const ranks = character.professionTrees[professionId].branches[branchId];
    if (index < 2 && rank < 5 && ranks.slice(index + 1).some(nextRank => nextRank > 0)) {
      return { ok: false, message: "Сначала сбросьте ранг открытой следующей способности." };
    }
    character.professionTrees[professionId].branches[branchId][index] = rank;
    return { ok: true, rank, unlockedNext: rank >= 5 && index < 2 };
  }

  return Object.freeze({ TREE_LIST, TREES, createProgress, ensureProgress, getNodeState, setRank });
});
