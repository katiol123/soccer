/* Данные: клубы АПЛ, тренеры, генерация составов */
(function (G) {
  'use strict';
  const U = G.U;

  /* Характеристики игроков (1..20). Все восемь полевых участвуют в движке матча. */
  const ATTRS = [
    { k: 'sho', n: 'Удар', d: 'Качество ударов, дальние удары, штрафные' },
    { k: 'pas', n: 'Пас', d: 'Продвижение мяча синими блоками (Пас)' },
    { k: 'dri', n: 'Дриблинг', d: 'Зелёные блоки: обводка, снятие прессинга' },
    { k: 'pac', n: 'Скорость', d: 'Жёлтые блоки: рывки, контратаки, отбеги назад' },
    { k: 'tac', n: 'Отбор', d: 'Оранжевые блоки: прессинг и отбор мяча' },
    { k: 'pos', n: 'Позиция', d: 'Фиолетовые блоки: защитный щит, открывания, игра головой' },
    { k: 'sta', n: 'Выносливость', d: 'Усталость по ходу матча, борьба за мяч' },
    { k: 'com', n: 'Хладнокровие', d: 'Реализация, пенальти, критические эффекты, фолы' }
  ];
  const GK_ATTR = { k: 'ref', n: 'Рефлексы', d: 'Сейвы вратаря' };

  const CLUBS = [
    { id: 'ars', name: 'Арсенал', short: 'ARS', c1: '#EF0107', c2: '#FFFFFF', c3: '#063672', pat: 'sleeve', str: 14.2, city: 'Лондон', stadium: 'Эмирейтс' },
    { id: 'avl', name: 'Астон Вилла', short: 'AVL', c1: '#670E36', c2: '#95BFE5', c3: '#FEE505', pat: 'half', str: 12.8, city: 'Бирмингем', stadium: 'Вилла Парк' },
    { id: 'bou', name: 'Борнмут', short: 'BOU', c1: '#DA291C', c2: '#111111', c3: '#ffffff', pat: 'stripes', str: 11.8, city: 'Борнмут', stadium: 'Виталити' },
    { id: 'bre', name: 'Брентфорд', short: 'BRE', c1: '#E30613', c2: '#FFFFFF', c3: '#140e0c', pat: 'stripes', str: 11.6, city: 'Лондон', stadium: 'Джитек' },
    { id: 'bha', name: 'Брайтон', short: 'BHA', c1: '#0057B8', c2: '#FFFFFF', c3: '#FFCD00', pat: 'stripes', str: 12.2, city: 'Брайтон', stadium: 'Амекс' },
    { id: 'bur', name: 'Бёрнли', short: 'BUR', c1: '#6C1D45', c2: '#99D6EA', c3: '#EDE939', pat: 'half', str: 10.4, city: 'Бёрнли', stadium: 'Терф Мур' },
    { id: 'che', name: 'Челси', short: 'CHE', c1: '#034694', c2: '#FFFFFF', c3: '#DBA111', pat: 'solid', str: 13.4, city: 'Лондон', stadium: 'Стэмфорд Бридж' },
    { id: 'cry', name: 'Кристал Пэлас', short: 'CRY', c1: '#1B458F', c2: '#C4122E', c3: '#ffffff', pat: 'stripes', str: 11.9, city: 'Лондон', stadium: 'Селхерст Парк' },
    { id: 'eve', name: 'Эвертон', short: 'EVE', c1: '#003399', c2: '#FFFFFF', c3: '#ffffff', pat: 'solid', str: 11.3, city: 'Ливерпуль', stadium: 'Хилл Дикинсон' },
    { id: 'ful', name: 'Фулхэм', short: 'FUL', c1: '#F4F4F4', c2: '#111111', c3: '#CC0000', pat: 'band', str: 11.5, city: 'Лондон', stadium: 'Крейвен Коттедж' },
    { id: 'lee', name: 'Лидс Юнайтед', short: 'LEE', c1: '#F7F7F7', c2: '#1D428A', c3: '#FFCD00', pat: 'band', str: 10.8, city: 'Лидс', stadium: 'Элланд Роуд' },
    { id: 'liv', name: 'Ливерпуль', short: 'LIV', c1: '#C8102E', c2: '#00B2A9', c3: '#F6EB61', pat: 'solid', str: 14.3, city: 'Ливерпуль', stadium: 'Энфилд' },
    { id: 'mci', name: 'Манчестер Сити', short: 'MCI', c1: '#6CABDD', c2: '#1C2C5B', c3: '#ffffff', pat: 'solid', str: 14.0, city: 'Манчестер', stadium: 'Этихад' },
    { id: 'mun', name: 'Манчестер Юнайтед', short: 'MUN', c1: '#DA291C', c2: '#FBE122', c3: '#111111', pat: 'chevron', str: 12.6, city: 'Манчестер', stadium: 'Олд Траффорд' },
    { id: 'new', name: 'Ньюкасл', short: 'NEW', c1: '#241F20', c2: '#FFFFFF', c3: '#41B6E6', pat: 'stripes', str: 13.0, city: 'Ньюкасл', stadium: 'Сент-Джеймс Парк' },
    { id: 'nfo', name: 'Ноттингем Форест', short: 'NFO', c1: '#DD0000', c2: '#FFFFFF', c3: '#111111', pat: 'chevron', str: 12.0, city: 'Ноттингем', stadium: 'Сити Граунд' },
    { id: 'sun', name: 'Сандерленд', short: 'SUN', c1: '#EB172B', c2: '#FFFFFF', c3: '#111111', pat: 'stripes', str: 10.6, city: 'Сандерленд', stadium: 'Стэдиум оф Лайт' },
    { id: 'tot', name: 'Тоттенхэм', short: 'TOT', c1: '#132257', c2: '#FFFFFF', c3: '#ffffff', pat: 'band', str: 12.6, city: 'Лондон', stadium: 'Тоттенхэм Хотспур' },
    { id: 'whu', name: 'Вест Хэм', short: 'WHU', c1: '#7A263A', c2: '#1BB1E7', c3: '#F3D459', pat: 'sleeve', str: 11.4, city: 'Лондон', stadium: 'Лондон Стэдиум' },
    { id: 'wol', name: 'Вулверхэмптон', short: 'WOL', c1: '#FDB913', c2: '#231F20', c3: '#ffffff', pat: 'solid', str: 11.0, city: 'Вулверхэмптон', stadium: 'Молинью' }
  ];

  /* Вымышленные тренеры. Предпочтения определяют поведение ИИ.
     mentality/pressing/line: 0..2, adapt — насколько подстраивается под состав и соперника,
     skill — качество ходов в 3-в-ряд, temper — реактивность по ходу матча. */
  const COACHES = {
    ars: { name: 'Хавьер Ольмедо', nat: 'Испания', formations: ['4-3-3', '4-2-3-1'], plan: 'possession', mentality: 1.3, pressing: 1.7, line: 1.7, adapt: 0.6, skill: 0.9, temper: 0.5, subAt: 62,
      motto: 'Контроль мяча и высокий прессинг. Терпеливо раскачивает оборону.' },
    avl: { name: 'Рикардо Вальдес', nat: 'Испания', formations: ['4-2-3-1', '4-4-2'], plan: 'counter', mentality: 1.1, pressing: 1.2, line: 1.8, adapt: 0.8, skill: 0.82, temper: 0.6, subAt: 60,
      motto: 'Агрессивная высокая линия с офсайдными ловушками и быстрыми выпадами.' },
    bou: { name: 'Андони Ируэта', nat: 'Испания', formations: ['4-2-3-1', '4-4-2'], plan: 'gegenpress', mentality: 1.4, pressing: 2, line: 1.5, adapt: 0.5, skill: 0.78, temper: 0.7, subAt: 58,
      motto: 'Тотальный прессинг по всему полю и вертикальные атаки.' },
    bre: { name: 'Томас Фрост', nat: 'Дания', formations: ['4-3-3', '5-3-2'], plan: 'direct', mentality: 1.0, pressing: 1.1, line: 1.0, adapt: 0.85, skill: 0.8, temper: 0.5, subAt: 64,
      motto: 'Прагматик: стандарты, прямые передачи и дисциплина.' },
    bha: { name: 'Лукас Хайнрих', nat: 'Германия', formations: ['4-2-3-1', '3-4-3'], plan: 'possession', mentality: 1.3, pressing: 1.4, line: 1.6, adapt: 0.7, skill: 0.84, temper: 0.6, subAt: 60,
      motto: 'Смелый позиционный футбол, много ротации и молодёжи.' },
    bur: { name: 'Стивен Колдуэлл', nat: 'Англия', formations: ['4-4-2', '5-4-1'], plan: 'park', mentality: 0.6, pressing: 0.8, line: 0.6, adapt: 0.7, skill: 0.72, temper: 0.4, subAt: 66,
      motto: 'Компактный низкий блок, каждое очко на вес золота.' },
    che: { name: 'Энцо Маранья', nat: 'Италия', formations: ['4-2-3-1', '3-4-3'], plan: 'possession', mentality: 1.2, pressing: 1.4, line: 1.5, adapt: 0.75, skill: 0.84, temper: 0.6, subAt: 60,
      motto: 'Владение и ротация звёзд. Любит перестраиваться по ходу игры.' },
    cry: { name: 'Оливер Штайнер', nat: 'Австрия', formations: ['3-4-3', '5-3-2'], plan: 'counter', mentality: 0.9, pressing: 1.3, line: 1.0, adapt: 0.55, skill: 0.8, temper: 0.5, subAt: 63,
      motto: 'Три центральных защитника и молниеносные контратаки.' },
    eve: { name: 'Дэвид Морроу', nat: 'Шотландия', formations: ['4-4-2', '4-1-4-1', '5-4-1'], plan: 'wings', mentality: 0.8, pressing: 1.0, line: 0.8, adapt: 0.6, skill: 0.76, temper: 0.4, subAt: 67,
      motto: 'Надёжность, фланги и навесы в штрафную.' },
    ful: { name: 'Мигель Сантуш', nat: 'Португалия', formations: ['4-2-3-1', '4-3-3'], plan: 'possession', mentality: 1.0, pressing: 1.1, line: 1.2, adapt: 0.7, skill: 0.8, temper: 0.5, subAt: 61,
      motto: 'Комбинационный футбол через центр поля.' },
    lee: { name: 'Даниэль Фэрке', nat: 'Германия', formations: ['4-3-3', '4-2-3-1'], plan: 'gegenpress', mentality: 1.2, pressing: 1.6, line: 1.3, adapt: 0.5, skill: 0.74, temper: 0.7, subAt: 59,
      motto: 'Энергия, интенсивность и вера в свою идею даже против грандов.' },
    liv: { name: 'Арне ван дер Берг', nat: 'Нидерланды', formations: ['4-2-3-1', '4-3-3'], plan: 'possession', mentality: 1.4, pressing: 1.5, line: 1.6, adapt: 0.7, skill: 0.9, temper: 0.5, subAt: 63,
      motto: 'Спокойный контроль, позиционные атаки и смертоносные фланги.' },
    mci: { name: 'Хосеп Марти', nat: 'Испания', formations: ['4-1-4-1', '4-3-3', '3-4-3'], plan: 'possession', mentality: 1.6, pressing: 1.6, line: 1.9, adapt: 0.9, skill: 0.92, temper: 0.6, subAt: 65,
      motto: 'Перфекционист владения. Постоянно экспериментирует со схемами.' },
    mun: { name: 'Руй Фонсека', nat: 'Португалия', formations: ['3-4-3', '3-5-2'], plan: 'counter', mentality: 1.1, pressing: 1.3, line: 1.3, adapt: 0.3, skill: 0.78, temper: 0.6, subAt: 62,
      motto: 'Упрямо верен схеме с тремя защитниками, ставит на переходы.' },
    new: { name: 'Эдди Хоуэлл', nat: 'Англия', formations: ['4-3-3', '4-4-2'], plan: 'gegenpress', mentality: 1.2, pressing: 1.8, line: 1.4, adapt: 0.65, skill: 0.84, temper: 0.6, subAt: 62,
      motto: 'Физика, прессинг и бешеная интенсивность.' },
    nfo: { name: 'Нуну Перейра', nat: 'Португалия', formations: ['4-2-3-1', '5-4-1'], plan: 'counter', mentality: 0.8, pressing: 0.9, line: 0.7, adapt: 0.75, skill: 0.8, temper: 0.4, subAt: 65,
      motto: 'Глубокий блок и смертельные контратаки через скорость.' },
    sun: { name: 'Режис Ле Бри', nat: 'Франция', formations: ['4-2-3-1', '4-3-3'], plan: 'direct', mentality: 0.9, pressing: 1.2, line: 1.0, adapt: 0.7, skill: 0.74, temper: 0.6, subAt: 60,
      motto: 'Молодая голодная команда, прямой футбол без лишних касаний.' },
    tot: { name: 'Анже Костич', nat: 'Австралия', formations: ['4-3-3'], plan: 'gegenpress', mentality: 1.8, pressing: 1.8, line: 2, adapt: 0.15, skill: 0.8, temper: 0.8, subAt: 64,
      motto: '«Мы играем только так». Атака при любом счёте.' },
    whu: { name: 'Грэм Поттс', nat: 'Англия', formations: ['3-4-3', '4-2-3-1'], plan: 'wings', mentality: 1.0, pressing: 1.1, line: 1.1, adapt: 0.8, skill: 0.76, temper: 0.5, subAt: 62,
      motto: 'Гибкие схемы, игра через фланги и стандарты.' },
    wol: { name: 'Витор Перейра', nat: 'Португалия', formations: ['3-5-2', '5-3-2'], plan: 'counter', mentality: 0.8, pressing: 1.0, line: 0.8, adapt: 0.6, skill: 0.74, temper: 0.5, subAt: 63,
      motto: 'Пять защитников и быстрые форварды на контратаках.' }
  };

  const FIRST = ['Джеймс', 'Гарри', 'Джек', 'Оливер', 'Томас', 'Джордж', 'Уильям', 'Чарли', 'Дэниел', 'Бен', 'Кайл', 'Райан', 'Льюис', 'Мейсон', 'Коннор', 'Джош', 'Люк', 'Нейтан', 'Эллиот', 'Морган',
    'Мохамед', 'Бруну', 'Лукас', 'Матеус', 'Габриэл', 'Диогу', 'Жуан', 'Рафаэл', 'Педру', 'Тиагу', 'Алехандро', 'Пабло', 'Марк', 'Мартин', 'Себастьян', 'Луис', 'Карлос', 'Альваро', 'Хуан', 'Серхио',
    'Кевин', 'Тимо', 'Флориан', 'Ян', 'Йонас', 'Николас', 'Антуан', 'Тео', 'Жюль', 'Ибрагима', 'Мусса', 'Амаду', 'Юссуф', 'Сандро', 'Марко', 'Лоренцо', 'Федерико', 'Вильям', 'Кристиан', 'Эрлинг',
    'Доминик', 'Каи', 'Ноа', 'Эмиль', 'Рико', 'Илайджа', 'Деклан', 'Тайрон', 'Джейдон', 'Эзри'];
  const LAST = ['Смит', 'Уокер', 'Тейлор', 'Браун', 'Уилсон', 'Робертс', 'Эванс', 'Томпсон', 'Райт', 'Холл', 'Грин', 'Кларк', 'Харрис', 'Льюис', 'Морган', 'Кук', 'Белл', 'Уорд', 'Мур', 'Джексон',
    'Тернер', 'Хьюз', 'Палмер', 'Беннетт', 'Грей', 'Фостер', 'Хант', 'Миллс', 'Росс', 'Хадсон', 'Кейн', 'Мейтленд', 'Додд', 'Шоу', 'Уэббер', 'Стоун', 'Барнс', 'Пэрриш', 'Колдер', 'Бэйли',
    'Мартинес', 'Сильва', 'Гомес', 'Перейра', 'Родригес', 'Фернандес', 'Сантос', 'Алмейда', 'Нуньес', 'Кастро', 'Морено', 'Торрес', 'Ривас', 'Мендоса', 'Коста', 'Лима', 'Оливейра', 'Варгас', 'Эрнандес', 'Рамос',
    'Мюллер', 'Шнайдер', 'Вебер', 'Хоффман', 'Кляйн', 'Берг', 'Ларсен', 'Нильсен', 'Йоханссон', 'Эриксен', 'Дюбуа', 'Лефевр', 'Морель', 'Бонне', 'Диалло', 'Траоре', 'Камара', 'Сисе', 'Мбемба', 'Окафор',
    'Асамоа', 'Менса', 'Бойе', 'Росси', 'Риччи', 'Конти', 'Ван Дейк', 'Де Врис', 'Янссен', 'Петрович', 'Новак', 'Ковач', 'Яшич', 'Андерсен', 'Ито', 'Ким', 'Пак', 'Окоро', 'Адеми', 'Хаддад'];

  /* Шаблоны характеристик по позициям (смещение относительно уровня игрока) */
  const TEMPLATES = {
    GK: { sho: -9, pas: -2, dri: -7, pac: -5, tac: -7, pos: 2, sta: -1, com: 1, ref: 3 },
    DF: { sho: -5, pas: -1, dri: -3, pac: 0, tac: 3, pos: 3, sta: 1, com: 0, ref: -12 },
    MF: { sho: -1, pas: 3, dri: 1, pac: 0, tac: 0, pos: 0, sta: 2, com: 1, ref: -12 },
    FW: { sho: 3, pas: -1, dri: 2, pac: 2, tac: -6, pos: 1, sta: 0, com: 1, ref: -12 }
  };
  /* Архетипы добавляют индивидуальность */
  const ARCHETYPES = {
    DF: [{ n: 'Стоппер', m: { tac: 2, pos: 1, pac: -1, dri: -1 } }, { n: 'Атакующий фулбек', m: { pac: 2, dri: 2, pas: 1, tac: -1, pos: -2 } }, { n: 'Плеймейкер обороны', m: { pas: 3, com: 1, pac: -2 } }, { n: 'Скоростной защитник', m: { pac: 3, tac: 1, com: -2, pas: -1 } }],
    MF: [{ n: 'Опорник', m: { tac: 3, pos: 2, sho: -2, dri: -2 } }, { n: 'Плеймейкер', m: { pas: 3, com: 1, tac: -2, sta: -1 } }, { n: 'Box-to-box', m: { sta: 3, tac: 1, sho: 1, com: -1 } }, { n: 'Вингер', m: { pac: 3, dri: 2, tac: -3, pos: -1 } }, { n: 'Атакующий хав', m: { dri: 2, sho: 2, pas: 1, tac: -3, sta: -1 } }],
    FW: [{ n: 'Таргетмен', m: { pos: 3, sho: 1, pac: -2, dri: -1 } }, { n: 'Скоростной форвард', m: { pac: 3, dri: 1, pos: -1, pas: -1 } }, { n: 'Бомбардир', m: { sho: 3, com: 2, sta: -2, pas: -2 } }, { n: 'Ложная девятка', m: { pas: 3, dri: 2, sho: -1, pos: -1 } }],
    GK: [{ n: 'Вратарь-реакция', m: { ref: 2, pas: -1 } }, { n: 'Вратарь-свипер', m: { pas: 3, pac: 3, com: 1, ref: -1 } }, { n: 'Классический вратарь', m: { pos: 2, com: 1 } }]
  };

  /* Один игрок: уровень q, возраст, архетип, характеристики, особенности */
  function makePlayer(club, pos, q, age, rng, usedNames, id, num, star) {
    let name;
    do {
      name = U.pick(FIRST, rng) + ' ' + U.pick(LAST, rng);
    } while (usedNames.has(name));
    usedNames.add(name);
    if (age < 21) q -= 0.8;
    if (age > 32) q -= 0.5;
    const arch = U.pick(ARCHETYPES[pos], rng);
    const a = {};
    const tpl = TEMPLATES[pos];
    for (const k in tpl) {
      let v = q + tpl[k] + (arch.m[k] || 0) + (rng() * 4.4 - 2.2);
      if (k === 'sta' && age > 30) v -= (age - 30) * 0.5;
      if (k === 'pac' && age > 29) v -= (age - 29) * 0.4;
      if (k === 'com' && age > 27) v += 1;
      a[k] = U.clamp(Math.round(v), 1, 20);
    }
    const pl = {
      id, club: club.id, name, pos, age, num, role: arch.n, star: !!star,
      a, fit: 100, form: 6.45, lastR: [], inj: 0, susp: 0, yc: 0,
      st: { apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, rsum: 0 }
    };
    pl.tr = G.TRAITS ? G.TRAITS.roll(pl, rng) : [];
    rollHidden(pl, rng);
    if (G.CAR) G.CAR.rollPot(pl, rng);
    return pl;
  }

  /* Скрытый характер (1..20): амбиции, преданность, профессионализм, темперамент.
     Игроку цифры не показываются — только поведение и реплики агента. */
  function rollHidden(p, rng) {
    rng = rng || Math.random;
    const has = id => p.tr && p.tr.includes(id);
    const r = (base, spread) => U.clamp(Math.round(base + (rng() + rng() + rng() - 1.5) * spread), 1, 20);
    let amb = 10 + (p.age <= 23 ? 2 : p.age >= 31 ? -2 : 0) + (p.star ? 3 : 0) + (has('selfish') ? 3 : 0) + (has('bigGame') ? 2 : 0);
    let loy = 10 + (p.age >= 29 ? 2 : 0) + (has('leader') ? 3 : 0) - (has('selfish') ? 2 : 0) - (has('homeBird') ? -2 : 0);
    let pro = 10 + (p.age >= 27 ? 1 : 0) + (has('leader') ? 3 : 0) + (has('engine') || has('steady') ? 2 : 0) - (has('lazy') ? 4 : 0) - (has('inconsistent') ? 2 : 0);
    let tem = 10 + (has('argue') ? 4 : 0) + (has('hothead') ? 5 : 0) - (has('calm') ? 4 : 0) + (p.a.com <= 9 ? 2 : p.a.com >= 15 ? -2 : 0);
    p.h = { amb: r(amb, 5), loy: r(loy, 5), pro: r(pro, 5), tem: r(tem, 5) };
    if (p.mood == null) p.mood = 65;
    return p.h;
  }

  function generateSquad(club, rng, usedNames, idStart) {
    const plan = [['GK', 3], ['DF', 8], ['MF', 8], ['FW', 5]];
    const starters = { GK: 1, DF: 4, MF: 4, FW: 2 };
    const players = [];
    const nums = U.shuffle(Array.from({ length: 45 }, (_, i) => i + 2), rng);
    let numIdx = 0;
    const isTop = club.str >= 13.9;
    const stars = isTop ? 2 : 1;
    let starIdx = [];
    // распределим звёзд по полевым линиям
    for (let s = 0; s < stars; s++) starIdx.push(U.pick(['FW', 'MF', 'MF', 'FW', 'DF'], rng));
    let id = idStart;
    for (const [pos, count] of plan) {
      for (let i = 0; i < count; i++) {
        const tier = i < starters[pos] ? 0.9 : (i < starters[pos] + 2 ? -0.2 : -1.6);
        let q = club.str + tier + (rng() * 2.4 - 1.2);
        let star = false;
        const si = starIdx.indexOf(pos);
        if (si >= 0 && i === 0) { q += isTop ? 2.2 : 1.6; star = true; starIdx.splice(si, 1); }
        const age = Math.floor(18 + rng() * 17);
        const num = pos === 'GK' && i === 0 ? 1 : nums[numIdx++];
        const pl = makePlayer(club, pos, q, age, rng, usedNames, club.id + '_' + (id++), num, star);
        players.push(pl);
      }
    }
    return players;
  }

  /* Вместимость стадионов (тыс. мест) */
  const CAPACITY = { ars: 60.7, avl: 42.8, bou: 11.3, bre: 17.3, bha: 31.8, bur: 21.9, che: 40.3, cry: 25.5, eve: 52.9, ful: 29.6, lee: 37.8, liv: 61.3, mci: 53.4, mun: 74.3, new: 52.3, nfo: 30.4, sun: 49.0, tot: 62.8, whu: 62.5, wol: 31.8 };

  /* ---------- Чемпионшип 2025/26 ---------- */
  const C2 = (id, name, short, c1, c2, pat, str, city, stadium, cap) => ({ id, name, short, c1, c2, c3: '#ffffff', pat, str, city, stadium, cap });
  const CLUBS2 = [
    C2('bir', 'Бирмингем Сити', 'BIR', '#1D3E9E', '#FFFFFF', 'solid', 9.6, 'Бирмингем', 'Сент-Эндрюс', 29.4),
    C2('bla', 'Блэкберн Роверс', 'BLB', '#009EE0', '#FFFFFF', 'half', 9.4, 'Блэкберн', 'Ивуд Парк', 31.4),
    C2('bri', 'Бристоль Сити', 'BRC', '#E21A23', '#FFFFFF', 'solid', 9.4, 'Бристоль', 'Эштон Гейт', 27.0),
    C2('cha', 'Чарльтон Атлетик', 'CHA', '#D4021D', '#FFFFFF', 'sleeve', 8.7, 'Лондон', 'Вэлли', 27.1),
    C2('cov', 'Ковентри Сити', 'COV', '#77B5E5', '#FFFFFF', 'band', 9.9, 'Ковентри', 'Ковентри Билдинг Сосайети Арена', 32.6),
    C2('der', 'Дерби Каунти', 'DER', '#F2F2F2', '#111111', 'band', 9.0, 'Дерби', 'Прайд Парк', 33.6),
    C2('hul', 'Халл Сити', 'HUL', '#F5A12D', '#111111', 'stripes', 9.1, 'Халл', 'МКМ Стэдиум', 25.4),
    C2('ips', 'Ипсвич Таун', 'IPS', '#0044A9', '#FFFFFF', 'solid', 10.4, 'Ипсвич', 'Портман Роуд', 30.0),
    C2('lei', 'Лестер Сити', 'LEI', '#003090', '#FDBE11', 'solid', 10.6, 'Лестер', 'Кинг Пауэр', 32.3),
    C2('mid', 'Мидлсбро', 'MID', '#E11B22', '#FFFFFF', 'band', 10.0, 'Мидлсбро', 'Ривер-Сайд', 34.7),
    C2('mil', 'Миллуолл', 'MIL', '#001D5E', '#FFFFFF', 'solid', 9.0, 'Лондон', 'Ден', 20.1),
    C2('nor', 'Норвич Сити', 'NOR', '#FFF200', '#00A650', 'solid', 9.7, 'Норидж', 'Кэрроу Роуд', 27.4),
    C2('oxf', 'Оксфорд Юнайтед', 'OXF', '#FFDF00', '#001D5E', 'band', 8.6, 'Оксфорд', 'Кассам', 12.5),
    C2('por', 'Портсмут', 'POR', '#001489', '#E10600', 'solid', 8.8, 'Портсмут', 'Фраттон Парк', 20.9),
    C2('pne', 'Престон Норт Энд', 'PNE', '#F4F4F4', '#00205B', 'band', 9.1, 'Престон', 'Дипдейл', 23.4),
    C2('qpr', 'Куинз Парк Рейнджерс', 'QPR', '#1D5BA4', '#FFFFFF', 'band', 8.9, 'Лондон', 'Лофтус Роуд', 18.4),
    C2('shu', 'Шеффилд Юнайтед', 'SHU', '#EE2737', '#FFFFFF', 'stripes', 10.2, 'Шеффилд', 'Брэмолл Лейн', 32.1),
    C2('shw', 'Шеффилд Уэнсдей', 'SHW', '#0060A9', '#FFFFFF', 'stripes', 8.8, 'Шеффилд', 'Хиллсборо', 39.7),
    C2('sou', 'Саутгемптон', 'SOU', '#D71920', '#FFFFFF', 'stripes', 10.5, 'Саутгемптон', 'Сент-Мэрис', 32.4),
    C2('sto', 'Сток Сити', 'STO', '#E03A3E', '#FFFFFF', 'stripes', 9.3, 'Сток-он-Трент', 'Бет365 Стэдиум', 30.1),
    C2('swa', 'Суонси Сити', 'SWA', '#F4F4F4', '#111111', 'band', 9.0, 'Суонси', 'Суонси.ком Стэдиум', 21.0),
    C2('wat', 'Уотфорд', 'WAT', '#FBEE23', '#11210C', 'solid', 9.2, 'Уотфорд', 'Викаридж Роуд', 22.2),
    C2('wba', 'Вест Бромвич', 'WBA', '#122F67', '#FFFFFF', 'stripes', 9.8, 'Уэст-Бромидж', 'Хоторнс', 26.9),
    C2('wre', 'Рексем', 'WRE', '#D71921', '#FFFFFF', 'solid', 9.5, 'Рексем', 'Рейскорс Граунд', 12.6)
  ];
  const K = (name, nat, formations, plan, mentality, pressing, line, adapt, skill, temper, subAt, motto) => ({ name, nat, formations, plan, mentality, pressing, line, adapt, skill, temper, subAt, motto });
  const COACHES2 = {
    bir: K('Крис Дэвенпорт', 'Англия', ['4-2-3-1', '4-3-3'], 'possession', 1.4, 1.5, 1.6, 0.6, 0.8, 0.5, 62, 'Амбициозный проект: доминировать с мячом и вернуться в элиту.'),
    bla: K('Валерьен Исмаэль', 'Франция', ['3-4-3', '3-5-2'], 'gegenpress', 1.3, 1.9, 1.6, 0.3, 0.76, 0.7, 60, 'Бешеный прессинг и вертикальные атаки — без компромиссов.'),
    bri: K('Гэрри Шелтон', 'Англия', ['4-4-2', '4-2-3-1'], 'direct', 1.0, 1.1, 1.0, 0.7, 0.74, 0.5, 64, 'Быстро вперёд, стандарты и командная работа.'),
    cha: K('Натан Джонс', 'Уэльс', ['4-4-2', '5-3-2'], 'park', 0.7, 1.0, 0.7, 0.6, 0.72, 0.8, 63, 'Выжить любой ценой: компактность и дух.'),
    cov: K('Фрэнк Лэмптон', 'Англия', ['4-2-3-1', '4-3-3'], 'possession', 1.3, 1.4, 1.4, 0.75, 0.8, 0.5, 61, 'Молодая техничная команда, ставка на атаку.'),
    der: K('Джон Эустас', 'Англия', ['4-3-3', '4-2-3-1'], 'counter', 1.0, 1.2, 1.1, 0.7, 0.75, 0.4, 63, 'Аккуратная оборона и быстрые переходы.'),
    hul: K('Серхей Якирович', 'Хорватия', ['4-1-4-1', '4-3-3'], 'wings', 1.1, 1.2, 1.2, 0.65, 0.74, 0.6, 62, 'Широкие атаки и навесы в штрафную.'),
    ips: K('Киран Маккенна', 'Сев. Ирландия', ['4-2-3-1', '3-4-3'], 'possession', 1.5, 1.6, 1.7, 0.7, 0.86, 0.5, 64, 'Тактический новатор: смелые атаки и асимметрия.'),
    lei: K('Мартин Чиприани', 'Италия', ['4-3-3', '4-2-3-1'], 'possession', 1.4, 1.5, 1.6, 0.6, 0.84, 0.5, 63, 'Терпеливое владение — наш путь обратно наверх.'),
    mid: K('Роб Эдвардс', 'Уэльс', ['4-2-3-1', '4-4-2'], 'gegenpress', 1.3, 1.7, 1.5, 0.6, 0.8, 0.6, 61, 'Энергия, прессинг и вера в молодёжь.'),
    mil: K('Алекс Нил', 'Шотландия', ['3-5-2', '5-3-2'], 'direct', 0.9, 1.4, 0.9, 0.55, 0.74, 0.8, 62, 'Неудобный соперник: борьба за каждый мяч на «Дене».'),
    nor: K('Лиам Мэннинг', 'Англия', ['4-3-3', '3-4-3'], 'possession', 1.2, 1.3, 1.5, 0.6, 0.78, 0.5, 63, 'Позиционная игра и развитие молодых.'),
    oxf: K('Гэри Роуэтт', 'Англия', ['4-4-2', '5-4-1'], 'park', 0.6, 0.9, 0.6, 0.7, 0.72, 0.4, 65, 'Низкий блок и стандарты — каждое очко бесценно.'),
    por: K('Джон Моузинью', 'Португалия', ['4-2-3-1', '4-4-2'], 'counter', 0.9, 1.1, 0.9, 0.65, 0.73, 0.6, 62, 'Страсть «Фраттон Парк» и быстрые контратаки.'),
    pne: K('Пол Хекингботтом', 'Англия', ['3-5-2', '5-3-2'], 'direct', 0.9, 1.2, 0.9, 0.6, 0.74, 0.5, 64, 'Три центральных защитника и прямой футбол.'),
    qpr: K('Хулиан Стеллини', 'Испания', ['4-3-3', '4-2-3-1'], 'possession', 1.1, 1.3, 1.3, 0.7, 0.75, 0.5, 62, 'Испанская школа в Западном Лондоне.'),
    shu: K('Крис Уайлдер', 'Англия', ['3-5-2', '3-4-3'], 'wings', 1.1, 1.3, 1.2, 0.35, 0.8, 0.7, 63, 'Атакующие центральные защитники и навесы — фирменный стиль.'),
    shw: K('Дэнни Рёль', 'Германия', ['4-2-3-1', '4-3-3'], 'gegenpress', 1.2, 1.7, 1.4, 0.5, 0.74, 0.6, 61, 'Немецкий прессинг даже в трудные времена.'),
    sou: K('Уилл Стилл', 'Бельгия', ['4-3-3', '3-4-3'], 'possession', 1.4, 1.5, 1.7, 0.65, 0.82, 0.6, 62, 'Молодой и дерзкий: смелый футбол на возвращение.'),
    sto: K('Марк Робинс', 'Англия', ['4-2-3-1', '4-4-2'], 'counter', 1.0, 1.2, 1.1, 0.75, 0.77, 0.5, 63, 'Прагматизм и быстрые фланги.'),
    swa: K('Алан Шихан', 'Ирландия', ['4-3-3', '4-2-3-1'], 'possession', 1.1, 1.2, 1.4, 0.55, 0.75, 0.4, 63, 'Пасы, пасы и ещё раз пасы — валлийская традиция.'),
    wat: K('Пауло Пеззолано', 'Уругвай', ['4-4-2', '4-2-3-1'], 'direct', 1.1, 1.3, 1.1, 0.75, 0.74, 0.6, 61, 'Интенсивность и прямолинейность.'),
    wba: K('Райан Мейсон', 'Англия', ['4-2-3-1', '4-3-3'], 'possession', 1.2, 1.4, 1.4, 0.7, 0.8, 0.5, 62, 'Контроль мяча и молодые таланты.'),
    wre: K('Фил Паркинсон', 'Англия', ['3-5-2', '4-4-2'], 'wings', 1.1, 1.2, 1.0, 0.55, 0.78, 0.6, 63, 'Голливудская сказка продолжается: навесы и характер.')
  };

  /* Реестр лиг: клубы, тренеры, деньги и правила.
     fin: телеправа (равная доля и за место), еврокубки по местам, коэффициенты билетов/спонсоров/расходов */
  const LEAGUES = {
    eng1: { id: 'eng1', name: 'Премьер-лига', acc: 'Премьер-лигу', short: 'АПЛ', country: 'Англия', flag: '🏴', tier: 1, clubs: CLUBS, coaches: COACHES,
      relegate: 3, fin: { tvEqual: 85, tvMerit: 3.2, euro: [55, 55, 55, 55, 25, 12], ticketK: 1, commK: 1, opsK: 1 },
      zones: { cl: 4, el: 5, ecl: 6, rel: 3 } },
    eng2: { id: 'eng2', name: 'Чемпионшип', acc: 'Чемпионшип', short: 'EFL', country: 'Англия', flag: '🏴', tier: 2, clubs: CLUBS2, coaches: COACHES2,
      promote: 2, playoff: [3, 6], relegate: 0, fin: { tvEqual: 16, tvMerit: 0.5, euro: [], ticketK: 0.65, commK: 0.55, opsK: 0.42, parachute: [40, 30] },
      zones: { up: 2, po: 6 } }
  };
  const LEAGUE_ORDER = ['eng1', 'eng2'];

  function createWorld(seed, leagueIds) {
    const rng = U.seeded(seed || 20252026);
    const used = new Set();
    const clubs = [];
    for (const lid of (leagueIds || LEAGUE_ORDER)) {
      const L = LEAGUES[lid];
      L.clubs.forEach(c => clubs.push(makeClub(c, L, rng, used)));
    }
    return clubs;
  }
  function makeClub(c, L, rng, used) {
    const club = Object.assign({}, c);
    club.league = L.id;
    if (club.cap == null) club.cap = CAPACITY[c.id] || 30;
    if (club.c3 == null) club.c3 = '#ffffff';
    club.coach = Object.assign({ id: 'c_' + c.id }, L.coaches[c.id]);
    club.players = generateSquad(club, rng, used, 1);
    return club;
  }

  G.DATA = { ATTRS, GK_ATTR, CLUBS, CLUBS2, COACHES, LEAGUES, LEAGUE_ORDER, CAPACITY, makeClub, createWorld, makePlayer, TEMPLATES, rollHidden };
})(typeof window !== 'undefined' ? window : globalThis);
