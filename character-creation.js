(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CharacterCreation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const POINT_BUY_POOLS = Object.freeze([60, 70, 80]);
  const PROFESSION_SKILL_POINTS = 44;
  const STARTING_SKILL_MAX = 6;
  const SKILL_MAX = 10;
  const ATTRIBUTES = Object.freeze(["INT", "REF", "DEX", "BODY", "SPD", "EMP", "CRA", "WILL", "LUCK"]);
  const RACE_NAMES = Object.freeze(["Человек", "Эльф", "Краснолюд", "Ведьмак"]);

  const RACE_TRAITS = Object.freeze({
    "Человек": Object.freeze({
      bonuses: Object.freeze({ deduction: 1 }),
      conditionalBonuses: Object.freeze({ charisma: 1, deceit: 1, persuasion: 1 }),
      features: Object.freeze([
        "Дедукция получает постоянный бонус +1.",
        "Харизма, Обман и Убеждение получают +1 при проверках против представителей других рас.",
        "Трижды за игровую сессию можно перебросить проваленную проверку Сопротивления убеждению или Храбрости; используется лучший результат. Повторный переброс одного уже успешного результата невозможен.",
      ]),
    }),
    "Эльф": Object.freeze({
      bonuses: Object.freeze({ art: 1, bow: 2 }),
      conditionalBonuses: Object.freeze({}),
      features: Object.freeze([
        "Искусство получает постоянный бонус +1, Стрельба из лука — +2.",
        "Животные относятся к эльфу дружелюбно, пока их не провоцируют.",
        "Эльф автоматически находит обычные растительные вещества, если нужные растения растут в этой местности.",
      ]),
    }),
    "Краснолюд": Object.freeze({
      bonuses: Object.freeze({ strength: 1, trade: 1 }),
      conditionalBonuses: Object.freeze({}),
      naturalProtection: 2,
      encumbranceBonusKg: 25,
      features: Object.freeze([
        "Сила и Торговля получают постоянный бонус +1.",
        "Естественная прочность тела 2 добавляется к прочности брони и не снижается разрушающим уроном.",
        "Переносимый вес увеличивается на 25 кг.",
      ]),
    }),
    "Ведьмак": Object.freeze({
      attributeModifiers: Object.freeze({ REF: 1, DEX: 1, EMP: -4 }),
      minimumAttributes: Object.freeze({ EMP: 1 }),
      bonuses: Object.freeze({ awareness: 1 }),
      conditionalBonuses: Object.freeze({}),
      features: Object.freeze([
        "Реакция и Ловкость получают постоянный бонус +1 и могут превысить обычный предел 10.",
        "Эмпатия уменьшается на 4, но не может стать ниже 1.",
        "Внимание получает постоянный бонус +1; ведьмак не получает штрафов за слабое освещение и может выслеживать цель по запаху.",
        "Ведьмаки невосприимчивы к болезням и способны использовать мутагены.",
        "Ведьмаку не требуются проверки Храбрости против Запугивания; расовое притупление эмоций даёт штраф −4 к Эмпатии.",
      ]),
    }),
  });

  const HOMELANDS = Object.freeze({
    north: Object.freeze([
      ["Редания", "education"], ["Каэдвен", "endurance"], ["Темерия", "charisma"], ["Аэдирн", "crafting"],
      ["Лирия и Ривия", "resist-persuasion"], ["Ковир и Повисс", "trade"], ["Скеллиге", "courage"],
      ["Цидарис", "seamanship"], ["Вердэн", "wilderness-survival"], ["Цинтра", "human-perception"],
    ]),
    nilfgaard: Object.freeze([
      ["Виковаро", "education"], ["Ангрен", "wilderness-survival"], ["Назайр", "brawling"], ["Метинна", "riding"],
      ["Мар-Тург", "endurance"], ["Гесо", "stealth"], ["Эббинг", "deduction"], ["Мехт", "charisma"],
      ["Геммера", "intimidation"], ["Этолия", "courage"],
    ]),
    elder: Object.freeze({ "Эльф": ["Доль Блатанна", "etiquette"], "Краснолюд": ["Махакама", "crafting"] }),
  });

  const FAMILY_EVENTS = Object.freeze({
    north: Object.freeze([
      "Родственники разошлись во время войны; их местонахождение неизвестно.", "Семью наказали за преступление или ложное обвинение.",
      "Дом покинут после появления призраков.", "Война лишила семью средств, и ей пришлось искать опасную работу.",
      "Семья увязла в долгах.", "Семья поссорилась с другой семьёй.", "Родственник стал жертвой давней вражды.",
      "Разбойники напали на семью.", "У семьи есть опасная тайна.", "Члены семьи враждуют друг с другом.",
    ]),
    nilfgaard: Object.freeze([
      "Семья пострадала из-за войны с Севером.", "Семью преследуют за преступление или ложное обвинение.",
      "Магия погубила одного из близких.", "Семья попала в опалу при смене власти.", "Семья избежала наказания, изменив положение.",
      "Родственников лишили титулов и выгнали из дома.", "Семейный магический долг втянул близких в опасность.",
      "Семья оказалась в немилости из-за поступка персонажа.", "У семьи есть опасная тайна.", "Родные погибли или разошлись после политического преследования.",
    ]),
    elder: Object.freeze([
      "Семья отреклась от персонажа из-за его поступков.", "Родственники изгнали персонажа.", "Семья пострадала во время войны.",
      "Родных преследуют из-за позиции большинства.", "Семья потеряла дом и титулы.", "Близкие вынуждены выживать в изгнании.",
      "Родственник связан с опасной магией.", "Семья разошлась из-за межрасовой вражды.", "У семьи есть опасная тайна.",
      "Один из предков известен среди Старших Народов.",
    ]),
  });

  const PARENT_EVENTS = Object.freeze([
    "Один или оба родителя погибли во время войны.", "Родители оставили ребёнка из-за тяжёлого положения.",
    "Родителей прокляли или они стали жертвами магии.", "Родитель продал или обменял ребёнка.",
    "Один из родителей оказался связан с преступной группой.", "Родителя убили из-за давней вражды.",
    "Родителя ложно обвинили в преступлении.", "Один из родителей умер от болезни.",
    "Родитель перешёл границу или предал прежних союзников.", "Родитель отказался от прежней жизни и семьи.",
  ]);

  const FAMILY_STATIONS = Object.freeze({
    north: Object.freeze(["Аристократия", "Под опекой мага", "Рыцарство", "Семья торговцев", "Семья мастеров", "Семья артистов", "Семья ремесленников", "Крестьянская семья", "Крестьянская семья", "Крестьянская семья"]),
    nilfgaard: Object.freeze(["Аристократия", "Высшее жречество", "Рыцарство", "Семья мастеров", "Семья торговцев", "Рабство", "Семья ремесленников", "Семья артистов", "Семья торговцев", "Крестьянская семья"]),
    elder: Object.freeze(["Аристократия", "Благородный воин", "Рыцарство", "Семья грамотных", "Артисты", "Семья мастеров", "Семья ремесленников", "Низкое происхождение", "Низкое происхождение", "Низкое происхождение"]),
  });

  const SIBLING_PROFILES = Object.freeze([
    ["Мужчина", "Младше", "Желает вам смерти", "Скромность"], ["Женщина", "Младше", "Ненавидит вас", "Агрессивность"],
    ["Мужчина", "Младше", "Завидует вам", "Доброта"], ["Женщина", "Младше", "Ничего особенного", "Причуды"],
    ["Мужчина", "Младше", "Ничего особенного", "Вдумчивость"], ["Женщина", "Старше", "Ничего особенного", "Болтливость"],
    ["Мужчина", "Старше", "Ничего особенного", "Романтичность"], ["Женщина", "Старше", "Любит вас", "Строгость"],
    ["Мужчина", "Старше", "Равняется на вас", "Ум"], ["Женщина", "Близнец", "Ревнует вас", "Инфантильность"],
  ]);

  const LUCK_EVENTS = Object.freeze([
    "Знакомый помог деньгами: 1d10 × 100 крон.", "Учитель дал +1 к навыку на ваш выбор с ведущей характеристикой Инт или новый навык с Инт +2.",
    "Знатный человек должен вам одну услугу.", "Боевой инструктор дал +1 к боевому навыку или новый боевой навык с Тел +2.",
    "Ведьмак должен вам одну услугу.", "Разбойники стали союзниками; можно просить об одной услуге в месяц.",
    "Вы приручили дикое животное.", "Маг должен вам одну услугу.", "Жрец благословил вас: +2 к Харизме при общении с единоверцами.",
    "Вы стали рыцарем и получили +2 к репутации в выбранной стране.",
  ]);

  const MISFORTUNE_EVENTS = Object.freeze([
    "Вы задолжали 1d10 × 100 крон.", "Вы провели 1d10 месяцев в заключении.", "У вас появилась зависимость на ваш выбор.",
    "Близкий человек погиб; отдельно определяется причина.", "Вас ложно обвинили; отдельно определяется обвинение.",
    "Вас разыскивают; отдельно определяется масштаб преследования.", "Вас шантажируют или раскрыли вашу тайну.",
    "Вы пережили несчастный случай; его последствия определяются ведущим.", "У вас появилась физическая или психическая травма.",
    "Вас прокляли.",
  ]);

  const ALLY_TYPES = Object.freeze([
    ["Охотник за головами", "Вы спасли его"], ["Маг", "Вы встретились в таверне"], ["Наставник или учитель", "Он спас вас"],
    ["Друг детства", "Он вас нанял"], ["Ремесленник", "Вы вместе попали в ловушку"], ["Бывший враг", "Вас заставили работать вместе"],
    ["Князь или княгиня", "Вы его наняли"], ["Жрец или жрица", "Вы сблизились после совместной попойки"],
    ["Воин", "Вы встретились в дороге"], ["Бард", "Вы сражались вместе"],
  ]);
  const ENEMY_TYPES = Object.freeze([
    ["Бывший друг", "Нападение"], ["Бывший возлюбленный", "Потеря возлюбленного"], ["Родственник", "Серьёзное унижение"],
    ["Враг детства", "Проклятие"], ["Культист", "Обвинение в незаконном колдовстве"], ["Бард", "Отказ в романтических притязаниях"],
    ["Воин", "Нанесение серьёзной раны"], ["Разбойник", "Шантаж"], ["Князь или княгиня", "Сорванные планы"],
    ["Маг", "Провокация нападения чудовища"],
  ]);

  const LOVE_TYPES = Object.freeze([
    { name: "Счастливая любовь", result: "Серьёзная связь продолжается; романтические события влияют на нынешние отношения." },
    { name: "Романтическая трагедия", result: "Возлюбленный исчез, погиб, был похищен или стал причиной опасного конфликта." },
    { name: "Трудная любовь", result: "Связь осложнена семьёй, ревностью, зависимостью, браком или постоянными ссорами." },
    { name: "Шлюхи и разгул", result: "В это десятилетие персонаж часто менял партнёров; значимых имён можно добавить вручную." },
  ]);

  const WITCHER_SCHOOLS = Object.freeze(["Школа Волка", "Школа Волка", "Школа Грифона", "Школа Грифона", "Школа Кота", "Школа Кота", "Школа Змеи", "Школа Змеи", "Школа Медведя", "Школа Медведя"]);
  const WITCHER_TRAINING = Object.freeze([
    ["Травма на Мучильне", "SPD", -1], ["Украденное знание", "witcherDiagram", 1], ["Завёл соперника", "witcherRival", 1],
    ["Лёгкие мутации", "trialBonus", 2], ["Негативные последствия магии", "energy", -1], ["Лучший в классе", "swordsmanship", 1],
    ["Плохая реакция на мутагены", "trialPenalty", -2], ["Завёл друга", "witcherFriend", 1], ["Травма на маятнике", "REF", -1],
    ["Глубокое изучение", "witcherPreparation", 1],
  ]);
  const WITCHER_TRIAL = Object.freeze([
    ["Почти смертельный исход", { EMP: -1, BODY: -1 }], ["Тяжёлые последствия", { EMP: -1 }],
    ["Приемлемые мутации", {}], ["Приемлемые мутации", {}], ["Приемлемые мутации", {}], ["Приемлемые мутации", {}],
    ["Приемлемые мутации", {}], ["Приемлемые мутации", {}], ["Приемлемые мутации", {}], ["Дополнительные мутации", { EMP: 1, DEX: 1 }],
  ]);
  const WITCHER_EVENTS = Object.freeze([
    "Получили ребёнка по Праву Неожиданности.", "Охота на разумное чудовище обернулась против вас.",
    "Сражались плечом к плечу с рыцарем.", "Маг удерживал вас для опытов над мутациями.",
    "Работали на дворянина и скрывали часть своих действий.", "Выходили за пределы Континента.",
    "Вступили в серьёзные отношения.", "Защищали крепость ведьмачьей школы и потеряли товарищей.",
    "Избавили город от чудовища, но жители испугались вас.", "Получили известность как герой после спасения поселения.",
  ]);
  const WITCHER_CURRENT = Object.freeze([
    "Личный ведьмак при важном заказчике.", "В поисках работы и постоянно в пути.", "Отшельник, вернувшийся в мир из-за чудовищ.",
    "Отшельник, вернувшийся в мир из-за чудовищ.", "Отшельник, вернувшийся в мир из-за чудовищ.", "Отшельник, вернувшийся в мир из-за чудовищ.",
    "Отшельник, вернувшийся в мир из-за чудовищ.", "Отшельник, вернувшийся в мир из-за чудовищ.", "Пытаетесь вести обычную жизнь.",
    "Опасный преступник, пытающийся выжить среди людей.",
  ]);
  const WITCHER_BENEFITS = Object.freeze([
    "Получили животное по Праву Неожиданности.", "Начали роман; его нынешнее состояние определяется отдельным броском.",
    "Получили неожиданную крупную сумму денег.", "Знатный человек должен вам ответную услугу.",
    "Получили рецепт ведьмачьего эликсира, масла или отвара.", "Получили +1 к репутации в выбранной стране.",
    "Разбойники стали союзниками; можно просить об услуге раз в месяц.", "Нашли предмет или сокровище в руинах.",
    "Маг должен вам одну услугу.", "Нашли наставника; можно получить +1 к зависимому от Инт навыку или новый с Инт +2.",
  ]);
  const WITCHER_HUNT_TARGETS = Object.freeze(["Дух", "Проклятое существо", "Гибрид", "Инсектоид", "Дух стихий", "Реликт", "Огр", "Драконоид", "Трупоед", "Вампир"]);
  const WITCHER_HUNT_PLACES = Object.freeze(["Лес", "Здание", "Заброшенное здание", "Морское побережье", "Горы", "Город", "Кладбище", "Деревня", "Река", "Пещера"]);
  const WITCHER_ALLY_TYPES = Object.freeze([
    ["Охотник за головами", "Вы спасли его"], ["Маг", "Вы встретились в таверне"], ["Наставник или учитель", "Он спас вас"],
    ["Друг детства", "Он вас нанял"], ["Ремесленник", "Вы вместе попали в ловушку"], ["Бывший враг", "Вас заставили работать вместе"],
    ["Князь или княгиня", "Вы его наняли"], ["Жрец или жрица", "Вы сблизились после попойки"], ["Солдат", "Вы встретились в пути"], ["Бард", "Вы вместе сражались"],
  ]);

  function d10(random = Math.random) {
    return Math.max(1, Math.min(10, Math.floor(random() * 10) + 1));
  }

  function validRaceProfession(race, professionId) {
    if (!RACE_NAMES.includes(race)) return false;
    if ((race === "Ведьмак") !== (professionId === "witcher")) return false;
    if (["mage", "priest"].includes(professionId) && !["Человек", "Эльф"].includes(race)) return false;
    return true;
  }

  function rollAttributes(random = Math.random) {
    return ATTRIBUTES.map(() => {
      let value = d10(random);
      while (value <= 2) value = d10(random);
      return value;
    });
  }

  function balancedAttributes(total) {
    if (!POINT_BUY_POOLS.includes(Number(total))) throw new Error("Выберите пул характеристик 60, 70 или 80.");
    const values = Array(ATTRIBUTES.length).fill(Math.floor(Number(total) / ATTRIBUTES.length));
    const remainder = Number(total) - values.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < remainder; index++) values[index]++;
    return Object.fromEntries(ATTRIBUTES.map((code, index) => [code, values[index]]));
  }

  function validatePointBuy(attributes, total) {
    if (!POINT_BUY_POOLS.includes(Number(total))) return { ok: false, message: "Выберите пул 60, 70 или 80." };
    const values = ATTRIBUTES.map(code => Number(attributes?.[code]));
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 10)) return { ok: false, message: "Каждая характеристика должна быть от 1 до 10." };
    const sum = values.reduce((acc, value) => acc + value, 0);
    if (sum !== Number(total)) return { ok: false, message: `Распределено ${sum} из ${total} очков.` };
    return { ok: true, spent: sum, remaining: 0 };
  }

  function validateDiceAssignment(assignments, rolls) {
    const indices = ATTRIBUTES.map(code => assignments?.[code]);
    if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= (rolls || []).length)) return { ok: false, message: "Назначьте каждый результат одной характеристике." };
    if (new Set(indices).size !== ATTRIBUTES.length || (rolls || []).length !== ATTRIBUTES.length) return { ok: false, message: "Каждый из девяти результатов можно назначить только один раз." };
    return { ok: true, attributes: Object.fromEntries(ATTRIBUTES.map(code => [code, rolls[assignments[code]]])) };
  }

  function skillCost(skill, catalog) {
    return catalog?.SKILLS?.find(definition => definition.id === skill?.catalogId)?.doubleCost ? 2 : 1;
  }

  function pointsSpent(skills, catalog) {
    return (Array.isArray(skills) ? skills : []).reduce((sum, skill) => sum + (Number(skill.rank) || 0) * skillCost(skill, catalog), 0);
  }

  function pointsRemaining(skills, budget, catalog) {
    return Number(budget) - pointsSpent(skills, catalog);
  }

  function tableEntry(items, roll) {
    return items[Math.max(1, Math.min(items.length, Number(roll))) - 1];
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() || `lifepath-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function generateStandardLifePath({ race, age, random = Math.random }) {
    const rolls = [];
    const roll = label => { const result = d10(random); rolls.push({ label, die: "d10", result }); return result; };
    const isHuman = race === "Человек";
    const originRoll = roll("Родина");
    const origin = isHuman ? (originRoll % 2 ? "north" : "nilfgaard") : "elder";
    let homeland;
    if (origin === "elder") {
      const [name, skillId] = HOMELANDS.elder[race] || ["Земли Старших Народов", null];
      homeland = { region: name, origin, skillBonus: skillId };
    } else if (origin === "nilfgaard") {
      const heartRoll = roll("Сердце Нильфгаарда или вассальное государство");
      const regionRoll = roll("Область Нильфгаарда");
      const region = heartRoll <= 3 ? "Сердце Нильфгаарда" : tableEntry(HOMELANDS.nilfgaard, regionRoll)[0];
      homeland = { region, origin, skillBonus: heartRoll <= 3 ? "deceit" : tableEntry(HOMELANDS.nilfgaard, regionRoll)[1] };
    } else {
      const regionRoll = roll("Королевство Севера");
      const [region, skillBonus] = tableEntry(HOMELANDS.north, regionRoll);
      homeland = { region, origin, skillBonus };
    }

    const familyRoll = roll("Судьба семьи");
    const familyFate = familyRoll % 2 === 0 ? "Хотя бы один родственник остался в живых." : tableEntry(FAMILY_EVENTS[origin], roll("Событие в семье"));
    const parentsRoll = roll("Судьба родителей");
    const relatives = [];
    let parentSummary = "Оба родителя живы.";
    if (parentsRoll % 2 !== 0) {
      const parentRoll = roll("Кто из родителей");
      const parentRole = parentRoll <= 4 ? "Отец" : parentRoll <= 8 ? "Мать" : "Оба родителя";
      const parentEvent = tableEntry(PARENT_EVENTS, roll("Событие с родителем"));
      parentSummary = `${parentRole}: ${parentEvent}`;
      const roles = parentRole === "Оба родителя" ? ["Отец", "Мать"] : [parentRole];
      roles.forEach(role => relatives.push({ id: id(), role, name: "", details: parentEvent, status: "Событие в прошлом" }));
    } else {
      relatives.push({ id: id(), role: "Отец", name: "", details: "Жив", status: "Жив" });
      relatives.push({ id: id(), role: "Мать", name: "", details: "Жива", status: "Жива" });
    }

    const familyStation = tableEntry(FAMILY_STATIONS[origin], roll("Положение семьи"));
    const siblingCountRoll = roll("Братья и сёстры");
    const siblingCount = race === "Эльф"
      ? siblingCountRoll <= 2 ? 1 : siblingCountRoll >= 9 ? 2 : 0
      : siblingCountRoll >= 9 ? 0 : siblingCountRoll;
    const siblings = [];
    for (let index = 0; index < siblingCount; index++) {
      const [gender, ageBand, relation, personality] = tableEntry(SIBLING_PROFILES, roll(`Родственник ${index + 1}`));
      siblings.push({ id: id(), role: gender === "Мужчина" ? "Брат" : "Сестра", name: "", gender, ageBand, relation, personality });
      relatives.push(siblings.at(-1));
    }

    const friendRoll = roll("Друг, оказавший влияние");
    const friend = tableEntry(ALLY_TYPES, friendRoll);
    relatives.push({ id: id(), role: "Друг из прошлого", name: "", details: `${friend[0]}: ${friend[1]}`, status: "Связь из жизненного пути" });

    const decadeEvents = [];
    for (let decadeStart = 10; decadeStart <= Math.floor(Number(age) / 10) * 10; decadeStart += 10) {
      const typeRoll = roll(`Событие за ${decadeStart}–${decadeStart + 9} лет`);
      if (typeRoll <= 4) {
        const outcomeRoll = roll(`Удача или неудача, ${decadeStart}–${decadeStart + 9}`);
        const lucky = outcomeRoll % 2 === 0;
        const detailRoll = roll(`${lucky ? "Удача" : "Неудача"}, ${decadeStart}–${decadeStart + 9}`);
        const description = tableEntry(lucky ? LUCK_EVENTS : MISFORTUNE_EVENTS, detailRoll);
        const event = { id: id(), decadeStart, decadeEnd: decadeStart + 9, type: lucky ? "Удача" : "Неудача", title: description.split(/[.:;]/)[0], description, rolls: [typeRoll, outcomeRoll, detailRoll] };
        decadeEvents.push(event);
        if (/близкий человек погиб/i.test(description)) {
          relatives.push({ id: id(), role: "Погибший близкий человек", name: "", details: description, status: "Погиб" });
        }
      } else if (typeRoll <= 7) {
        const kindRoll = roll(`Союзник или враг, ${decadeStart}–${decadeStart + 9}`);
        const isAlly = kindRoll % 2 === 0;
        const entryRoll = roll(`${isAlly ? "Союзник" : "Враг"}, ${decadeStart}–${decadeStart + 9}`);
        const [role, cause] = tableEntry(isAlly ? ALLY_TYPES : ENEMY_TYPES, entryRoll);
        const record = { id: id(), role: isAlly ? `Союзник: ${role}` : `Враг: ${role}`, name: "", details: cause, status: isAlly ? "Союзник" : "Враг" };
        relatives.push(record);
        decadeEvents.push({ id: id(), decadeStart, decadeEnd: decadeStart + 9, type: isAlly ? "Союзник" : "Враг", title: role, description: cause, rolls: [typeRoll, kindRoll, entryRoll], personId: record.id });
      } else {
        const loveRoll = roll(`Любовь, ${decadeStart}–${decadeStart + 9}`);
        const loveIndex = loveRoll === 1 ? 0 : loveRoll <= 4 ? 1 : loveRoll <= 6 ? 2 : 3;
        const kind = LOVE_TYPES[loveIndex];
        let description = kind.result;
        let lovePerson = null;
        if (loveIndex < 3) {
          const loveDetailRoll = roll(`Подробности отношений, ${decadeStart}–${decadeStart + 9}`);
          description += ` Итог по таблице: ${loveDetailRoll}.`;
          lovePerson = { id: id(), role: "Возлюбленный или возлюбленная", name: "", details: `${kind.name}. ${description}`, status: "Романтическая связь" };
          relatives.push(lovePerson);
        }
        decadeEvents.push({ id: id(), decadeStart, decadeEnd: decadeStart + 9, type: "Отношения", title: kind.name, description, rolls: loveIndex < 3 ? [typeRoll, loveRoll] : [typeRoll, loveRoll], personId: lovePerson?.id || null });
      }
    }

    const outcomes = [];
    if (homeland.skillBonus) outcomes.push({ id: id(), type: "Родина", description: `Бонус +1 к навыку «${homeland.skillBonus}»; применяется после выбора стартовых очков навыков.`, source: homeland.region, effect: { type: "skillBonus", skillId: homeland.skillBonus, value: 1 } });
    return {
      kind: "standard",
      rolls,
      homeland,
      familyFate,
      parents: parentSummary,
      familyStation,
      siblings,
      relatives,
      decadeEvents,
      effects: outcomes,
      generatedAt: new Date().toISOString(),
    };
  }

  function generateWitcherLifePath({ age, risk = "medium", random = Math.random }) {
    const currentAge = Number(age);
    if (!Number.isInteger(currentAge) || currentAge < 50 || currentAge > 260) throw new Error("Возраст ведьмака по книге должен быть от 50 до 260 лет.");
    const rolls = [];
    const roll = label => { const result = d10(random); rolls.push({ label, die: "d10", result }); return result; };
    const school = tableEntry(WITCHER_SCHOOLS, roll("Ведьмачья школа"));
    const ageRoll = roll("Возраст при поступлении в школу");
    const trainingAge = ageRoll <= 2 ? "младенцем" : ageRoll <= 8 ? "в 4–6 лет" : "в 8–11 лет";
    const travelAge = 19 + roll("Возраст, когда ведьмак начал странствовать");
    const trainingRoll = roll("Событие начального обучения");
    const [training, trainingEffect, trainingValue] = tableEntry(WITCHER_TRAINING, trainingRoll);
    const trialRoll = roll("Исход Испытания травами");
    const [trial, trialModifiers] = tableEntry(WITCHER_TRIAL, trialRoll);
    const importantRoll = roll("Самое важное событие");
    const importantEvent = tableEntry(WITCHER_EVENTS, importantRoll);
    const presentRoll = roll("Нынешнее положение");
    const presentStatus = tableEntry(WITCHER_CURRENT, presentRoll);
    const riskLevels = { cautious: 0, normal: 1, medium: 2, risky: 3 };
    const selectedRisk = riskLevels[risk] === undefined ? "medium" : risk;
    const distributions = [
      [{ max: 1, type: "Выгода" }, { max: 2, type: "Союзник" }, { max: 3, type: "Охота" }, { max: 10, type: "Ничего" }],
      [{ max: 1, type: "Выгода" }, { max: 2, type: "Союзник" }, { max: 5, type: "Охота" }, { max: 10, type: "Ничего" }],
      [{ max: 2, type: "Выгода" }, { max: 7, type: "Союзник" }, { max: 8, type: "Охота" }, { max: 10, type: "Ничего" }],
      [{ max: 5, type: "Выгода" }, { max: 7, type: "Союзник" }, { max: 9, type: "Охота" }, { max: 10, type: "Ничего" }],
    ][riskLevels[selectedRisk]];
    const decadeEvents = [];
    const relatives = [];
    for (let decadeStart = 30; decadeStart < currentAge; decadeStart += 10) {
      const resultRoll = roll(`Путь ведьмака, ${decadeStart}–${decadeStart + 9}`);
      const type = distributions.find(entry => resultRoll <= entry.max).type;
      const event = { id: id(), decadeStart, decadeEnd: decadeStart + 9, type, title: type, description: "", rolls: [resultRoll] };
      if (type === "Выгода") {
        const detailRoll = roll(`Выгода, ${decadeStart}–${decadeStart + 9}`);
        event.title = tableEntry(WITCHER_BENEFITS, detailRoll);
        event.description = event.title;
        event.rolls.push(detailRoll);
      } else if (type === "Союзник") {
        const personRoll = roll(`Союзник, ${decadeStart}–${decadeStart + 9}`);
        const [role, cause] = tableEntry(WITCHER_ALLY_TYPES, personRoll);
        const closenessRoll = roll(`Близость с союзником, ${decadeStart}–${decadeStart + 9}`);
        const closeness = closenessRoll <= 6 ? "Знакомые" : closenessRoll <= 9 ? "Друзья" : "Не разлей вода";
        const aliveRoll = Math.floor(random() * 100) + 1;
        rolls.push({ label: `Жив ли союзник, ${decadeStart}–${decadeStart + 9}`, die: "d100", result: aliveRoll });
        let details = `${cause}; близость: ${closeness}.`;
        if (aliveRoll <= 30) {
          const diedDecades = roll(`Сколько десятилетий назад умер союзник, ${decadeStart}–${decadeStart + 9}`);
          details += ` Союзник умер примерно ${diedDecades} десятилетий назад.`;
          event.rolls.push(diedDecades);
        } else details += " Союзник жив.";
        const person = { id: id(), role: `Союзник: ${role}`, name: "", details, status: aliveRoll <= 30 ? "Погиб" : "Жив", closeness };
        relatives.push(person);
        event.title = role;
        event.description = details;
        event.personId = person.id;
        event.rolls.push(personRoll, closenessRoll, aliveRoll);
      } else if (type === "Охота") {
        const targetRoll = roll(`Цель охоты, ${decadeStart}–${decadeStart + 9}`);
        const placeRoll = roll(`Место охоты, ${decadeStart}–${decadeStart + 9}`);
        const endingRoll = roll(`Итог охоты, ${decadeStart}–${decadeStart + 9}`);
        const twistRoll = roll(`Внезапный поворот, ${decadeStart}–${decadeStart + 9}`);
        const target = tableEntry(WITCHER_HUNT_TARGETS, targetRoll);
        const place = tableEntry(WITCHER_HUNT_PLACES, placeRoll);
        const ending = endingRoll <= 2 ? "Получили деньги и ушли" : endingRoll <= 4 ? "Заказчик отказался платить" : endingRoll <= 6 ? "Заказчик расплатился товарами" : endingRoll <= 8 ? "Бой оказался особенно тяжёлым" : "Бой оказался удивительно лёгким";
        const twist = twistRoll <= 4 ? "В охоте произошёл неожиданный поворот." : "Неожиданного поворота не было.";
        event.title = `Охота на ${target}`;
        event.description = `${target}, место: ${place}. ${ending}. ${twist} Персонаж получает +2 к проверкам Подготовки ведьмака по этому чудовищу.`;
        event.rolls.push(targetRoll, placeRoll, endingRoll, twistRoll);
      } else event.description = "За это десятилетие в дороге не произошло события, отмеченного в таблице.";
      decadeEvents.push(event);
    }

    const witcherRelatives = importantRoll === 1
      ? [{ id: id(), role: "Ребёнок по Праву Неожиданности", name: "", details: "Ведьмак получил ребёнка по Праву Неожиданности; дальнейшая судьба зависит от пола ребёнка и решения ведущего.", status: "Судьба не определена" }]
      : [];
    relatives.push(...witcherRelatives);
    const effects = Object.entries(trialModifiers).map(([code, value]) => ({ type: "attributeModifier", attribute: code, value, source: trial }));
    if (ATTRIBUTES.includes(trainingEffect)) effects.push({ type: "attributeModifier", attribute: trainingEffect, value: trainingValue, source: training });
    if (trainingEffect === "swordsmanship") effects.push({ type: "skillBonus", skillId: trainingEffect, value: trainingValue, source: training });
    return {
      kind: "witcher",
      rolls,
      school,
      ageAtSchool: trainingAge,
      travelAge,
      training,
      trainingEffect: { type: trainingEffect, value: trainingValue },
      trial,
      trialModifiers,
      trainingEffect,
      importantEvent,
      presentStatus,
      risk: selectedRisk,
      relatives,
      decadeEvents,
      effects,
      generatedAt: new Date().toISOString(),
    };
  }

  function generateLifePath(options) {
    return options?.race === "Ведьмак" ? generateWitcherLifePath(options) : generateStandardLifePath(options || {});
  }

  return Object.freeze({
    POINT_BUY_POOLS, PROFESSION_SKILL_POINTS, STARTING_SKILL_MAX, SKILL_MAX, ATTRIBUTES, RACE_NAMES, RACE_TRAITS,
    d10, validRaceProfession, rollAttributes, balancedAttributes, validatePointBuy, validateDiceAssignment,
    skillCost, pointsSpent, pointsRemaining, generateLifePath, generateStandardLifePath, generateWitcherLifePath,
  });
});
