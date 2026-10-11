/* Финансы: стоимость игроков, зарплаты и контракты, доходы и расходы клубов, совет директоров.
   Деньги — в млн £, зарплаты — в тыс. £ в неделю. */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;

  /* Вместимость стадионов (тыс. мест) */
  const CAPACITY = { ars: 60.7, avl: 42.8, bou: 11.3, bre: 17.3, bha: 31.8, bur: 21.9, che: 40.3, cry: 25.5, eve: 52.9, ful: 29.6, lee: 37.8, liv: 61.3, mci: 53.4, mun: 74.3, new: 52.3, nfo: 30.4, sun: 49.0, tot: 62.8, whu: 62.5, wol: 31.8 };
  const ROUNDS = 38;
  const TV_EQUAL = 85;            // равная доля телеправ за сезон
  const TV_MERIT = 3.2;            // за каждое место выше 20-го
  const EURO = [55, 55, 55, 55, 25, 12]; // премия за еврокубки по местам 1–6

  /* ---------- игрок ---------- */
  function ageK(age) {
    if (age <= 21) return 1.35;
    if (age <= 23) return 1.25;
    if (age <= 27) return 1;
    if (age <= 29) return 0.85;
    return [0.7, 0.55, 0.42, 0.32, 0.25, 0.2][Math.min(5, age - 30)];
  }
  function baseValue(p) {
    // экспонента от рейтинга: 15 → £15 млн, 17 → £50 млн, 18.5 → ~£120 млн
    return 15 * Math.exp(0.602 * (TAC.overall(p) - 15)) * (p.pos === 'GK' ? 0.7 : 1);
  }
  /* Рыночная стоимость, млн £ */
  function value(p) {
    let v = baseValue(p) * ageK(p.age);
    v *= 1 + TAC.formBonus(p) * 0.05;
    if (p.st && p.st.apps >= 5) v *= U.clamp(1 + (p.st.rsum / p.st.apps - 6.5) * 0.15, 0.85, 1.2);
    for (const id of (p.tr || [])) {
      const t = G.TRAITS.LIST[id];
      if (!t) continue;
      v *= t.tone === '+' ? 1.04 : t.tone === '−' ? 0.94 : 1;
    }
    const c = p.contract == null ? 3 : p.contract;
    v *= c <= 1 ? 0.7 : c === 2 ? 0.9 : 1;
    if (p.inj > 2) v *= 0.9;
    return Math.max(0.1, Math.round(v * 10) / 10);
  }
  /* «Справедливая» зарплата по уровню игрока, тыс. £/нед */
  function fairWage(p) {
    const w = 30 + 9 * Math.pow(baseValue(p), 0.7) * (p.age >= 31 ? 0.85 : 1) * (p.star ? 1.25 : 1);
    return Math.round(w);
  }
  /* Требование игрока при продлении (фиксируется на сезон) */
  function demand(st, p) {
    if (p.dem && p.dem.season === st.season) return p.dem;
    let w = fairWage(p) * (1 + TAC.formBonus(p) * 0.06) * (0.95 + U.rnd() * 0.2);
    if (p.st && p.st.apps >= 5) w *= U.clamp(1 + (p.st.rsum / p.st.apps - 6.5) * 0.12, 0.9, 1.15);
    if (p.age >= 31) w *= 0.9;
    const years = p.age <= 23 ? [3, 5] : p.age <= 29 ? [2, 4] : [1, 2];
    p.dem = { season: st.season, wage: Math.round(Math.max(w, p.wage * 0.85)), years, tries: 2 };
    return p.dem;
  }
  function initContract(p, rng) {
    rng = rng || Math.random;
    const maxY = p.age >= 32 ? 2 : p.age >= 29 ? 3 : 5;
    p.contract = 1 + Math.floor(rng() * maxY);
    p.wage = Math.round(fairWage(p) * (0.85 + rng() * 0.3));
  }

  /* ---------- клуб ---------- */
  function wageBill(club) { return U.sum(club.players, p => p.wage || 0); }        // тыс./нед
  const yearly = w => w * 52 / 1000;                                              // тыс./нед → млн/год
  function squadValue(club) { return Math.round(U.sum(club.players, value)); }
  function ticket(club) { return 40 + (club.str - 10) * 10; }                     // £ за билет
  function commercial(club) { return 12 * Math.exp(0.65 * (club.str - 10)); }      // млн/сезон
  function operating(club) { return 30 + (club.str - 10) * 15; }                   // млн/сезон

  function emptyLedger() { return { tv: 0, gate: 0, comm: 0, prize: 0, wages: 0, ops: 0 }; }

  /* Прогноз доходов на сезон (для бюджета зарплат) */
  function projectedIncome(club, expectedPos) {
    const cap = CAPACITY[club.id] || 30;
    return TV_EQUAL + TV_MERIT * (21 - expectedPos) + cap * ticket(club) * 0.95 * 19 / 1000 + commercial(club) + (EURO[expectedPos - 1] || 0);
  }

  function setBudget(st, club, expectedPos) {
    const inc = projectedIncome(club, expectedPos);
    const bill = wageBill(club);
    // правление разрешает тратить на зарплаты ~68% дохода, но не меньше текущей ведомости + 5%
    club.fin.wageBudget = Math.round(Math.max(bill * 1.05, inc * 0.68 * 1000 / 52));
  }

  function expectedPositions(st) {
    const order = st.clubs.map(c => ({ c, r: TAC.teamRating(c) })).sort((a, b) => b.r - a.r);
    const res = {};
    order.forEach((x, i) => { res[x.c.id] = i + 1; });
    return res;
  }

  /* Инициализация финансов для новой игры или старого сохранения */
  function init(st) {
    const rng = U.seeded(4242 + (st.season || 1));
    st.clubs.forEach(c => c.players.forEach(p => { if (p.contract == null || p.wage == null) initContract(p, rng); }));
    const exp = expectedPositions(st);
    st.clubs.forEach(c => {
      if (!c.fin) {
        c.fin = { balance: Math.round(20 + (c.str - 10) * 35), season: emptyLedger(), last: null, hist: [] };
        c.fin.hist.push(c.fin.balance);
      }
      c.fin.target = exp[c.id];
      setBudget(st, c, exp[c.id]);
    });
    if (st.userClub && !st.board) st.board = { conf: 60, target: exp[st.userClub] };
  }

  function book(club, key, amount) {
    club.fin.balance += amount;
    club.fin.season[key] += amount;
  }

  /* Домашний матч: выручка от билетов. Посещаемость зависит от места и формы */
  function matchday(st, fixture, table) {
    const club = st.clubs.find(c => c.id === fixture.h);
    if (!club || !club.fin) return;
    const pos = table ? table.findIndex(r => r.id === club.id) + 1 : 10;
    const att = U.clamp(0.82 + (20 - pos) * 0.008 + U.rnd() * 0.05, 0.75, 1);
    const gate = (CAPACITY[club.id] || 30) * att * ticket(club) / 1000;
    book(club, 'gate', Math.round(gate * 100) / 100);
    fixture.res.att = Math.round((CAPACITY[club.id] || 30) * att * 1000);
  }

  /* Каждый тур: телеправа (равная доля), спонсоры, зарплаты, операционные расходы */
  function round(st) {
    for (const c of st.clubs) {
      if (!c.fin) continue;
      book(c, 'tv', TV_EQUAL / ROUNDS);
      book(c, 'comm', commercial(c) / ROUNDS);
      book(c, 'wages', -yearly(wageBill(c)) / ROUNDS);
      book(c, 'ops', -operating(c) / ROUNDS);
      c.fin.balance = Math.round(c.fin.balance * 100) / 100;
      c.fin.hist.push(c.fin.balance);
      if (c.fin.hist.length > 80) c.fin.hist.shift();
    }
    if (st.userClub) { boardRound(st); contractReminder(st); }
  }

  /* Напоминание об истекающих контрактах (тур 25 и 33) */
  function contractReminder(st) {
    if (st.round !== 24 && st.round !== 32) return;
    const club = st.clubs.find(c => c.id === st.userClub);
    const exp = club.players.filter(p => p.contract <= 1);
    if (exp.length) st.news.push({ r: st.round, text: `✍ У ${exp.length} ${U.plural(exp.length, 'игрока', 'игроков', 'игроков')} контракт истекает летом: ${exp.slice(0, 5).map(p => p.name).join(', ')}${exp.length > 5 ? '…' : ''}. Продлите их в разделе «Финансы», иначе они уйдут бесплатно.` });
  }

  /* Доверие совета директоров: место относительно цели и состояние кассы */
  function boardRound(st) {
    const table = G.LEAGUE.standings(st);
    const pos = table.findIndex(r => r.id === st.userClub) + 1;
    const club = st.clubs.find(c => c.id === st.userClub);
    const b = st.board;
    const played = table[0].p;
    if (played < 3) return;
    let d = (b.target - pos) * 0.15;
    if (club.fin.balance < 0) d -= 1.5;
    if (wageBill(club) > club.fin.wageBudget) d -= 1;
    b.conf = U.clamp(Math.round((b.conf + d) * 10) / 10, 0, 100);
    if (b.conf < 25 && !b.warned) { b.warned = true; st.news.push({ r: st.round, text: '⚠ Совет директоров недоволен результатами. Доверие падает — нужно срочно исправлять ситуацию.' }); }
    if (b.conf >= 35) b.warned = false;
  }

  /* Конец сезона: призовые, еврокубки, итоги, контракты */
  function seasonEnd(st, table) {
    const report = [];
    table.forEach((r, i) => {
      const c = st.clubs.find(x => x.id === r.id);
      if (!c || !c.fin) return;
      book(c, 'prize', TV_MERIT * (20 - i) + (EURO[i] || 0));
      const s = c.fin.season;
      c.fin.last = Object.assign({}, s, { season: st.seasonName, profit: Math.round((s.tv + s.gate + s.comm + s.prize + s.wages + s.ops) * 10) / 10, pos: i + 1 });
      c.fin.season = emptyLedger();
    });
    // совет директоров подводит итоги
    if (st.userClub) {
      const pos = table.findIndex(r => r.id === st.userClub) + 1;
      const b = st.board, delta = b.target - pos;
      const verdict = delta >= 3 ? 'в восторге' : delta >= 0 ? 'доволен' : delta >= -3 ? 'разочарован' : 'в ярости';
      b.conf = U.clamp(b.conf + delta * 4, 5, 100);
      st.news.push({ r: 0, text: `🏛 Совет директоров ${verdict}: цель — ${b.target}-е место, итог — ${pos}-е. Доверие ${Math.round(b.conf)}%.` });
    }
    // контракты: ИИ-клубы продлевают нужных, клуб игрока теряет непродлённых
    st.clubs.forEach(c => {
      const leaving = [];
      c.players.forEach(p => {
        p.contract = (p.contract || 1) - 1;
        if (p.contract > 0) return;
        if (c.id === st.userClub) leaving.push(p);
        else { const d = demand(st, p); p.wage = d.wage; p.contract = U.randInt(d.years[0], d.years[1]); }
      });
      if (leaving.length) {
        c.players = c.players.filter(p => !leaving.includes(p));
        delete c._map;
        const names = leaving.map(p => p.name);
        report.push(`👋 Контракты истекли, клуб покидают: ${names.join(', ')}.`);
        // до открытия трансферного рынка место ушедших занимают выпускники академии
        const used = new Set(); st.clubs.forEach(x => x.players.forEach(p => used.add(p.name)));
        const academy = leaving.map(p => youth(st, c, p.pos, used));
        report.push(`🎓 Из академии в основную команду переведены: ${academy.map(p => `${p.name} (${p.pos === 'GK' ? 'ВР' : p.pos === 'DF' ? 'ЗЩ' : p.pos === 'MF' ? 'ПЗ' : 'НП'}, ${p.age})`).join(', ')}.`);
      }
    });
    report.forEach(t => st.news.push({ r: 0, text: t }));
  }

  function youth(st, club, pos, used) {
    const nums = new Set(club.players.map(p => p.num));
    let num = 30; while (nums.has(num)) num++;
    const id = club.id + '_y' + st.season + '_' + Math.floor(Math.random() * 1e6);
    const p = G.DATA.makePlayer(club, pos, club.str - 1.2 + Math.random() * 1.6, U.randInt(18, 21), Math.random, used, id, num, false);
    p.contract = 3; p.wage = Math.round(fairWage(p) * 0.7);
    club.players.push(p);
    delete club._map;
    return p;
  }

  /* Новый сезон: бюджеты по ожидаемому месту, новая цель правления */
  function seasonStart(st) {
    const exp = expectedPositions(st);
    st.clubs.forEach(c => { c.fin.target = exp[c.id]; setBudget(st, c, exp[c.id]); });
    if (st.userClub) { st.board.target = exp[st.userClub]; st.board.warned = false; }
  }

  /* Продление контракта игроком-пользователем */
  function renew(st, club, p, wage, years) {
    const d = demand(st, p);
    if (d.tries <= 0) return { ok: false, msg: `${p.name} больше не хочет обсуждать контракт в этом сезоне.` };
    const newBill = wageBill(club) - p.wage + wage;
    if (newBill > club.fin.wageBudget) return { ok: false, msg: `Совет директоров не одобрит: ведомость (${newBill} тыс./нед) превысит бюджет зарплат (${club.fin.wageBudget} тыс./нед).` };
    const yearsOk = years >= d.years[0] && years <= d.years[1];
    let need = d.wage * (yearsOk ? 1 : 1.08);
    let accept = wage >= need || (wage >= need * 0.9 && U.rnd() < (wage - need * 0.9) / (need * 0.1));
    if (!accept) {
      d.tries--;
      d.wage = Math.round(d.wage * 1.05);
      return { ok: false, msg: d.tries > 0 ? `${p.name} отклоняет предложение и поднимает требования до ${d.wage} тыс./нед.` : `${p.name} обиделся и прекращает переговоры до конца сезона.` };
    }
    p.wage = Math.round(wage);
    p.contract = years;
    p.dem = null;
    return { ok: true, msg: `${p.name} подписывает новый контракт: ${p.wage} тыс. £/нед на ${years} ${U.plural(years, 'год', 'года', 'лет')}.` };
  }

  const fmtM = v => (v < 0 ? '−' : '') + '£' + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + ' млн';
  const fmtW = v => '£' + Math.round(v) + ' тыс./нед';

  G.FIN = { CAPACITY, value, fairWage, demand, init, matchday, round, seasonEnd, seasonStart, renew, wageBill, squadValue, yearly, projectedIncome, ticket, commercial, operating, fmtM, fmtW, initContract };
})(typeof window !== 'undefined' ? window : globalThis);
