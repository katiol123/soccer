/* Тактика: схемы, роли, оценка игроков, автоматический выбор состава */
(function (G) {
  'use strict';
  const U = G.U;

  /* Вклад роли в фазы игры: back — оборона/начало атаки, mid — центр поля, front — финальная треть */
  const ROLES = {
    GK: { line: 'GK', w: { back: 0, mid: 0, front: 0 }, r: { ref: 3, pos: 2, com: 1.5, pas: 1 } },
    CB: { line: 'DF', w: { back: 1, mid: 0.25, front: 0.05 }, r: { tac: 3, pos: 3, com: 1, pac: 1, sta: 1, pas: 0.5 } },
    FB: { line: 'DF', w: { back: 0.85, mid: 0.55, front: 0.25 }, r: { pac: 2.5, tac: 2, sta: 2, pos: 1.5, pas: 1, dri: 1 } },
    WB: { line: 'DF', w: { back: 0.7, mid: 0.7, front: 0.4 }, r: { pac: 2.5, sta: 2.5, tac: 1.5, dri: 1.5, pas: 1, pos: 1 } },
    DM: { line: 'MF', w: { back: 0.6, mid: 1, front: 0.25 }, r: { tac: 3, pos: 2.5, pas: 2, sta: 1.5, com: 1 } },
    CM: { line: 'MF', w: { back: 0.35, mid: 1, front: 0.5 }, r: { pas: 3, sta: 2, dri: 1.5, tac: 1.5, pos: 1, com: 1, sho: 0.5 } },
    WM: { line: 'MF', w: { back: 0.3, mid: 0.8, front: 0.7 }, r: { pac: 2.5, dri: 2.5, pas: 2, sta: 1.5, sho: 1 } },
    AM: { line: 'MF', w: { back: 0.1, mid: 0.7, front: 0.9 }, r: { pas: 2.5, dri: 2.5, sho: 2, com: 1.5, pos: 0.5 } },
    W: { line: 'FW', w: { back: 0.1, mid: 0.45, front: 1 }, r: { pac: 3, dri: 3, sho: 2, com: 1 } },
    ST: { line: 'FW', w: { back: 0.05, mid: 0.3, front: 1 }, r: { sho: 3, com: 2, pos: 2, dri: 1, pac: 1.5 } }
  };

  const S = (role, label, x, y) => ({ role, label, x, y });
  const GKS = S('GK', 'ВР', 50, 6);
  const BACK4 = [S('FB', 'ЛЗ', 14, 26), S('CB', 'ЦЗ', 37, 20), S('CB', 'ЦЗ', 63, 20), S('FB', 'ПЗ', 86, 26)];
  const BACK3 = [S('CB', 'ЦЗ', 28, 21), S('CB', 'ЦЗ', 50, 18), S('CB', 'ЦЗ', 72, 21)];
  const BACK5 = [S('WB', 'ЛФЗ', 10, 32), S('CB', 'ЦЗ', 30, 20), S('CB', 'ЦЗ', 50, 18), S('CB', 'ЦЗ', 70, 20), S('WB', 'ПФЗ', 90, 32)];

  const FORMATIONS = {
    '4-4-2': [GKS, ...BACK4, S('WM', 'ЛП', 14, 54), S('CM', 'ЦП', 38, 48), S('CM', 'ЦП', 62, 48), S('WM', 'ПП', 86, 54), S('ST', 'НП', 38, 78), S('ST', 'НП', 62, 78)],
    '4-3-3': [GKS, ...BACK4, S('CM', 'ЦП', 28, 48), S('DM', 'ОП', 50, 40), S('CM', 'ЦП', 72, 48), S('W', 'ЛВ', 16, 74), S('ST', 'НП', 50, 82), S('W', 'ПВ', 84, 74)],
    '4-2-3-1': [GKS, ...BACK4, S('DM', 'ОП', 37, 40), S('DM', 'ОП', 63, 40), S('AM', 'ЛАП', 16, 63), S('AM', 'ЦАП', 50, 61), S('AM', 'ПАП', 84, 63), S('ST', 'НП', 50, 83)],
    '4-1-4-1': [GKS, ...BACK4, S('DM', 'ОП', 50, 37), S('WM', 'ЛП', 14, 58), S('CM', 'ЦП', 37, 55), S('CM', 'ЦП', 63, 55), S('WM', 'ПП', 86, 58), S('ST', 'НП', 50, 82)],
    '3-5-2': [GKS, ...BACK3, S('WB', 'ЛФЗ', 10, 50), S('CM', 'ЦП', 33, 48), S('DM', 'ОП', 50, 40), S('CM', 'ЦП', 67, 48), S('WB', 'ПФЗ', 90, 50), S('ST', 'НП', 38, 79), S('ST', 'НП', 62, 79)],
    '3-4-3': [GKS, ...BACK3, S('WB', 'ЛФЗ', 10, 50), S('CM', 'ЦП', 38, 45), S('CM', 'ЦП', 62, 45), S('WB', 'ПФЗ', 90, 50), S('W', 'ЛВ', 18, 75), S('ST', 'НП', 50, 82), S('W', 'ПВ', 82, 75)],
    '5-3-2': [GKS, ...BACK5, S('CM', 'ЦП', 28, 48), S('DM', 'ОП', 50, 42), S('CM', 'ЦП', 72, 48), S('ST', 'НП', 38, 77), S('ST', 'НП', 62, 77)],
    '5-4-1': [GKS, ...BACK5, S('WM', 'ЛП', 14, 54), S('CM', 'ЦП', 38, 47), S('CM', 'ЦП', 62, 47), S('WM', 'ПП', 86, 54), S('ST', 'НП', 50, 79)]
  };

  /* Планы на игру */
  const PLANS = {
    possession: { n: 'Владение', icon: '◆', d: 'Синие блоки (Пас) продвигают мяч на 30% сильнее, соперник хуже отбирает. Рывки слабее.' },
    counter: { n: 'Контратаки', icon: '⚡', d: 'Жёлтые блоки (Скорость) сильнее на 30%. После отбора — длинное окно контратаки ×1.8.' },
    gegenpress: { n: 'Прессинг', icon: '✸', d: 'Оранжевые блоки (Отбор) сильнее на 30%, а на чужой половине — на 50%. Быстрее устаёт.' },
    wings: { n: 'Фланги и навесы', icon: '⤴', d: 'Дриблинг +20%, открывания (Позиция) в атаке +35%, больше угловых и ударов головой.' },
    direct: { n: 'Прямой футбол', icon: '➚', d: 'Любое продвижение +12%, дальние удары уже с 3 красных блоков, но точность ударов ниже.' },
    park: { n: 'Автобус', icon: '▮', d: 'Защитный щит +45%, все оборонительные действия +15%, атака −25%.' }
  };
  const MENTALITY = ['Оборона', 'Баланс', 'Атака'];
  const PRESSING = ['Низкий', 'Средний', 'Высокий'];
  const LINE = ['Низкая', 'Средняя', 'Высокая'];

  function lineSuit(pPos, line) {
    if (pPos === line) return 1;
    if (pPos === 'GK' || line === 'GK') return 0.3;
    const order = { DF: 0, MF: 1, FW: 2 };
    const d = Math.abs(order[pPos] - order[line]);
    return d === 1 ? 0.86 : 0.7;
  }

  function roleRatingRaw(p, role) {
    const R = ROLES[role].r;
    let s = 0, w = 0;
    for (const k in R) { s += (p.a[k] || 1) * R[k]; w += R[k]; }
    return s / w;
  }
  function roleRating(p, role) {
    return roleRatingRaw(p, role) * lineSuit(p.pos, ROLES[role].line);
  }
  const NAT_ROLES = { GK: ['GK'], DF: ['CB', 'FB', 'WB'], MF: ['DM', 'CM', 'AM', 'WM'], FW: ['ST', 'W'] };
  function overall(p) {
    let best = 0;
    for (const r of NAT_ROLES[p.pos]) best = Math.max(best, roleRatingRaw(p, r));
    return best;
  }
  function bestRole(p) {
    let best = 0, br = NAT_ROLES[p.pos][0];
    for (const r of NAT_ROLES[p.pos]) { const v = roleRatingRaw(p, r); if (v > best) { best = v; br = r; } }
    return br;
  }

  /* Доступность: травма и дисквалификация. Дисквалификации в лиге и кубке раздельные —
     TAC.cupMode включается на время подготовки кубкового матча */
  function available(p) { return p.inj <= 0 && (TAC.cupMode ? (p.csusp || 0) <= 0 : p.susp <= 0); }

  /* Жадный подбор лучших 11 под схему с учётом свежести */
  /* Форма: средняя оценка последних матчей (взвешенная) → бонус ко всем характеристикам от −2 до +2 */
  /* Типичная (средняя) оценка по позиции — точка отсчёта для формы, развития, стоимости.
     Обновлять при изменении формулы оценок в движке (замер по полному сезону всех лиг). */
  const RATING_NORM = { GK: 6.7, DF: 6.55, MF: 6.55, FW: 6.55 };
  const ratingNorm = p => RATING_NORM[p && p.pos] || 6.56;
  const FORM_NEUTRAL = 6.56, FORM_STEP = 0.45;
  function formBonus(p) {
    const n = ratingNorm(p), f = p.form == null ? n : p.form;
    return Math.round(Math.max(-2, Math.min(2, (f - n) / FORM_STEP)) * 10) / 10;
  }
  /* Форма = взвешенная средняя последних 5 оценок (свежие важнее: 5,4,3,2,1).
     Пока сыграно меньше 3 матчей, недостающие считаются нейтральными. */
  const FORM_W = [5, 4, 3, 2, 1];
  function computeForm(p) {
    const r = (p.lastR || []).slice(-5).reverse();
    let s = 0, w = 0;
    r.forEach((v, i) => { s += v * FORM_W[i]; w += FORM_W[i]; });
    for (let i = r.length; i < 3; i++) { s += ratingNorm(p) * FORM_W[i]; w += FORM_W[i]; }
    return w ? s / w : ratingNorm(p);
  }
  function formLabel(b) {
    return b >= 1.5 ? 'Отличная' : b >= 0.5 ? 'Хорошая' : b > -0.5 ? 'Обычная' : b > -1.5 ? 'Плохая' : 'Ужасная';
  }

  function bestXI(club, formation, opts) {
    opts = opts || {};
    const slots = FORMATIONS[formation];
    const pool = club.players.filter(p => available(p) && !(opts.exclude && opts.exclude.has(p.id)));
    const fitW = opts.fitWeight == null ? 1 : opts.fitWeight;
    const pairs = [];
    slots.forEach((s, si) => {
      pool.forEach(p => {
        const fitF = 1 - fitW * (1 - (0.55 + 0.45 * p.fit / 100));
        let tv = G.TRAITS ? G.TRAITS.value(p, opts.ctx) : 0;
        if (opts.bias) tv += opts.bias(p);   // мягкие предпочтения тренера
        // обещание игрового времени арендованному игроку (ИИ его соблюдает)
        if (p.loan && p.loan.to === club.id && G.TR && opts.honorLoans !== false) tv += G.TR.PROMISE[p.loan.promise].bonus;
        const fb = opts.noForm ? 0 : formBonus(p) * lineSuit(p.pos, ROLES[s.role].line);
        // погода: ИИ учитывает, кому в такую погоду будет тяжело
        const wa = opts.wx && G.ENGINE ? (1 - G.ENGINE.wxSens(p, opts.wx)) * 0.4 : 0;
        pairs.push({ si, p, v: (roleRating(p, s.role) + tv + fb + wa) * fitF });
      });
    });
    pairs.sort((a, b) => b.v - a.v);
    const lineup = new Array(slots.length).fill(null);
    const used = new Set();
    let filled = 0;
    for (const pr of pairs) {
      if (filled === slots.length) break;
      if (lineup[pr.si] || used.has(pr.p.id)) continue;
      lineup[pr.si] = pr.p.id; used.add(pr.p.id); filled++;
    }
    const rest = pool.filter(p => !used.has(p.id)).sort((a, b) => overall(b) * (0.6 + 0.4 * b.fit / 100) - overall(a) * (0.6 + 0.4 * a.fit / 100));
    const bench = [];
    const gk = rest.find(p => p.pos === 'GK');
    if (gk) bench.push(gk.id);
    for (const p of rest) { if (bench.length >= 9) break; if (!bench.includes(p.id) && p.pos !== 'GK') bench.push(p.id); }
    return { lineup, bench };
  }

  function lineupRating(club, formation, lineup) {
    const slots = FORMATIONS[formation];
    const byId = playerMap(club);
    let s = 0;
    lineup.forEach((id, i) => { const p = byId[id]; if (p) s += roleRating(p, slots[i].role); });
    return s / slots.length;
  }

  function playerMap(club) {
    if (!club._map || club._mapN !== club.players.length) {
      club._map = {}; club._mapN = club.players.length;
      club.players.forEach(p => { club._map[p.id] = p; });
    }
    return club._map;
  }

  function teamRating(club) {
    if (club._trFixed != null) return club._trFixed;   // повтор матча: сила клуба на момент игры
    const f = club.coach && club.coach.formations ? club.coach.formations[0] : '4-4-2';
    const xi = bestXI(club, f, { fitWeight: 0, noForm: true });
    return lineupRating(club, f, xi.lineup);
  }

  function defaultTactics(club) {
    const c = club.coach;
    const formation = c.formations[0];
    const xi = bestXI(club, formation);
    return {
      formation, plan: c.plan,
      mentality: Math.round(c.mentality), pressing: Math.round(c.pressing), line: Math.round(c.line),
      lineup: xi.lineup, bench: xi.bench
    };
  }

  const TAC = G.TAC = { cupMode: false, ROLES, FORMATIONS, PLANS, MENTALITY, PRESSING, LINE, NAT_ROLES, lineSuit, roleRating, roleRatingRaw, overall, bestRole, bestXI, lineupRating, teamRating, defaultTactics, playerMap, available, formBonus, formLabel, computeForm, FORM_NEUTRAL, RATING_NORM, ratingNorm };
})(typeof window !== 'undefined' ? window : globalThis);
