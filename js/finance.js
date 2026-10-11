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
  /* Уровень клуба для игрока: ожидаемое место и сила игрока относительно состава */
  function clubCore(club) {
    const o = club.players.map(TAC.overall).sort((a, b) => b - a).slice(0, 14);
    return U.avg(o);
  }
  /* Хочет ли амбициозный игрок в клуб уровнем выше */
  function outgrown(p, club) {
    const h = p.h || {};
    return (h.amb || 10) >= 14 && TAC.overall(p) >= clubCore(club) + 1 && ((club.fin && club.fin.target) || 10) > 6;
  }
  function moodLabel(m) {
    return m >= 80 ? ['Счастлив', '😄'] : m >= 60 ? ['Доволен', '🙂'] : m >= 40 ? ['Нейтрален', '😐'] : m >= 20 ? ['Недоволен', '😒'] : ['Хочет уйти', '😠'];
  }

  /* Требование игрока при продлении (фиксируется на сезон).
     Амбиции поднимают зарплату и упорство, преданность даёт скидку и терпение, настроение — надбавку или отказ. */
  function demand(st, p, club) {
    if (p.dem && p.dem.season === st.season) return p.dem;
    const h = p.h || { amb: 10, loy: 10, pro: 10, tem: 10 };
    const mood = p.mood == null ? 60 : p.mood;
    let w = fairWage(p) * (1 + TAC.formBonus(p) * 0.06) * (0.95 + U.rnd() * 0.15);
    if (p.st && p.st.apps >= 5) w *= U.clamp(1 + (p.st.rsum / p.st.apps - 6.5) * 0.12, 0.9, 1.15);
    if (p.age >= 31) w *= 0.9;
    w *= 1 + (h.amb - 10) * 0.025;          // амбиции: до ±25%
    w *= 1 - (h.loy - 10) * 0.012;          // преданность: скидка «для своих»
    w *= mood < 35 ? 1.1 : mood > 80 ? 0.95 : 1;
    let years = p.age <= 23 ? [3, 5] : p.age <= 29 ? [2, 4] : [1, 2];
    const big = club ? outgrown(p, club) : false;
    if (big) { w *= 1.15; years = [1, 2]; }
    else if (h.loy >= 14) years = [years[0], Math.min(5, years[1] + 1)];
    let refuse = null;
    if (mood < 20) refuse = 'Игрок недоволен своим положением и не намерен продлевать контракт.';
    else if (big && h.amb >= 17 && mood < 55) refuse = 'Игрок хочет перейти в клуб, который борется за титулы, и отказывается от продления.';
    const tries = U.clamp(2 + (h.loy >= 14 ? 1 : 0) - (h.amb >= 16 ? 1 : 0), 1, 3);
    p.dem = { season: st.season, wage: Math.round(Math.max(w, p.wage * 0.85)), years, tries, refuse, big };
    return p.dem;
  }

  /* Реплики агента и игрока: косвенно выдают скрытый характер */
  function agentNotes(p, club) {
    const h = p.h || {}, n = [];
    if (outgrown(p, club)) n.push('Агент: «Мой клиент перерос этот уровень. Он хочет играть в Лиге чемпионов — нужно очень серьёзное предложение».');
    if (h.amb >= 15) n.push('Агент: «Он знает себе цену и не привык уступать».');
    else if (h.amb <= 6) n.push('Агент: «Деньги для него не главное — лишь бы получать игровое время».');
    if (h.loy >= 15) n.push('Игрок не раз говорил, что любит этот клуб и хотел бы здесь остаться.');
    else if (h.loy <= 6) n.push('Агент намекает, что интерес к игроку есть и у других клубов.');
    const m = p.mood == null ? 60 : p.mood;
    if (m < 35) n.push('Игрок недоволен своей ролью в команде — это скажется на требованиях.');
    else if (m > 80) n.push('Игрок счастлив в клубе и настроен на диалог.');
    if (!n.length) n.push('Агент: «Мы открыты к разговору, если условия будут честными».');
    return n;
  }
  /* Мнение тренерского штаба о характере своих игроков */
  function staffNotes(p) {
    const h = p.h || {}, n = [];
    if (h.pro >= 15) n.push('Первым приходит на тренировку и последним уходит — образцовый профессионал.');
    else if (h.pro <= 6) n.push('Бывает, опаздывает на тренировки и не следит за режимом.');
    if (h.tem >= 15) n.push('Взрывной характер: болезненно переносит скамейку и может высказаться в прессе.');
    else if (h.tem <= 6) n.push('Невозмутим, никогда не выносит сор из избы.');
    if (h.amb >= 16) n.push('Очень амбициозен: хочет играть всегда и только за трофеи.');
    return n;
  }

  function initContract(p, rng) {
    rng = rng || Math.random;
    const maxY = p.age >= 32 ? 2 : p.age >= 29 ? 3 : 5;
    p.contract = 1 + Math.floor(rng() * maxY);
    p.wage = Math.round(fairWage(p) * (0.85 + rng() * 0.3));
  }

  /* ---------- клуб ---------- */
  /* Зарплатная ведомость: свои игроки, арендованные (доля арендатора) и отданные в аренду (остаток платит владелец) */
  function wageBill(club) {
    let s = 0;
    for (const p of club.players) s += (p.wage || 0) * (p.loan && p.loan.to === club.id ? p.loan.share : 1);
    for (const l of (club.loansOut || [])) s += l.wage * (1 - l.share);
    return Math.round(s);
  }
  const yearly = w => w * 52 / 1000;                                              // тыс./нед → млн/год
  function squadValue(club) { return Math.round(U.sum(club.players, value)); }
  function ticket(club) { return 40 + (club.str - 10) * 10; }                     // £ за билет
  function commercial(club) { return 12 * Math.exp(0.65 * (club.str - 10)); }      // млн/сезон
  function operating(club) { return 30 + (club.str - 10) * 15; }                   // млн/сезон

  function emptyLedger() { return { tv: 0, gate: 0, comm: 0, prize: 0, wages: 0, ops: 0, transfers: 0 }; }

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
    st.clubs.forEach(c => c.players.forEach(p => {
      if (p.contract == null || p.wage == null) initContract(p, rng);
      if (!p.h) G.DATA.rollHidden(p, rng);
    }));
    const exp = expectedPositions(st);
    st.clubs.forEach(c => {
      if (!c.fin) {
        c.fin = { balance: Math.round(20 + (c.str - 10) * 35), season: emptyLedger(), last: null, hist: [] };
        c.fin.hist.push(c.fin.balance);
      }
      c.fin.target = exp[c.id];
      setBudget(st, c, exp[c.id]);
      if (c.fin.transferBudget == null) c.fin.transferBudget = Math.round(Math.max(0, c.fin.balance * 0.5));
      if (c.fin.season.transfers == null) c.fin.season.transfers = 0;
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
    if (G.TR) G.TR.syncLoanWages(st);
    moodRound(st);
    if (st.userClub) { boardRound(st); contractReminder(st); }
  }

  /* Напоминание об истекающих контрактах (тур 25 и 33) */
  function contractReminder(st) {
    if (st.round !== 24 && st.round !== 32) return;
    const club = st.clubs.find(c => c.id === st.userClub);
    const exp = club.players.filter(p => p.contract <= 1 && !(p.loan && p.loan.to === club.id)).concat(G.TR ? G.TR.loansOut(st, club.id).map(x => x.p).filter(p => p.contract <= 1) : []);
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
      c.fin.last = Object.assign({}, s, { season: st.seasonName, profit: Math.round((s.tv + s.gate + s.comm + s.prize + s.wages + s.ops + (s.transfers || 0)) * 10) / 10, pos: i + 1 });
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
    // контракты: ИИ-клубы продлевают нужных, непродлённые становятся свободными агентами
    G.CAR.contractsEnd(st, report);
    report.forEach(t => st.news.push({ r: 0, text: t }));
    G.CAR.checkUser(st, true);
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
    st.clubs.forEach(c => { c.fin.target = exp[c.id]; setBudget(st, c, exp[c.id]); c.fin.transferBudget = Math.round(Math.max(0, c.fin.balance * 0.5)); });
    if (st.userClub) { st.board.target = exp[st.userClub]; st.board.warned = false; }
  }

  /* Продление контракта игроком-пользователем */
  function renew(st, club, p, wage, years) {
    const d = demand(st, p, club);
    const h = p.h || { amb: 10, loy: 10 };
    if (d.refuse) return { ok: false, msg: `${p.name}: ${d.refuse}` };
    if (d.tries <= 0) return { ok: false, msg: `${p.name} больше не хочет обсуждать контракт в этом сезоне.` };
    const newBill = wageBill(club) - p.wage + wage;
    if (newBill > club.fin.wageBudget) return { ok: false, msg: `Совет директоров не одобрит: ведомость (${newBill} тыс./нед) превысит бюджет зарплат (${club.fin.wageBudget} тыс./нед).` };
    const yearsOk = years >= d.years[0] && years <= d.years[1];
    const need = d.wage * (yearsOk ? 1 : 1.08 + Math.max(0, h.amb - 10) * 0.005);
    // «зона торга» ниже требования: шире у преданных, уже у амбициозных
    const zone = U.clamp(0.06 + (h.loy - 10) * 0.006 - (h.amb - 10) * 0.005, 0.01, 0.14);
    const accept = wage >= need || (wage >= need * (1 - zone) && U.rnd() < (wage - need * (1 - zone)) / (need * zone));
    if (!accept) {
      d.tries--;
      d.wage = Math.round(d.wage * (1.02 + h.amb * 0.0025));
      if (p.mood != null) p.mood = Math.max(0, p.mood - (2 + Math.max(0, h.amb - 10) * 0.5));
      return { ok: false, msg: d.tries > 0 ? `${p.name} отклоняет предложение и поднимает требования до ${d.wage} тыс./нед.` : `${p.name} обиделся и прекращает переговоры до конца сезона.` };
    }
    p.wage = Math.round(wage);
    p.contract = years;
    p.dem = null;
    if (p.mood != null) p.mood = Math.min(100, p.mood + 10);
    return { ok: true, msg: `${p.name} подписывает новый контракт: ${p.wage} тыс. £/нед на ${years} ${U.plural(years, 'год', 'года', 'лет')}.` };
  }

  /* Настроение после тура: игровое время, важность игрока, амбиции, результат */
  function moodRound(st) {
    const rd = st.fixtures[st.round] || [];
    const res = {};
    rd.forEach(f => { if (!f.res) return; const d = Math.sign(f.res.hs - f.res.as); res[f.h] = d; res[f.a] = -d; });
    for (const c of st.clubs) {
      const core = clubCore(c);
      for (const p of c.players) {
        if (!p.h) continue;
        if (p.mood == null) p.mood = 65;
        const amb = p.h.amb;
        if (p.lp === st.round) p.mood += 2.5 + (res[c.id] > 0 ? 1 : 0);
        else if (TAC.available(p)) {
          const imp = U.clamp((TAC.overall(p) - core) / 2 + 1, 0, 3);
          p.mood -= (1.2 + imp * 1.4) * (0.4 + amb / 16);
        }
        if (res[c.id] != null) p.mood += res[c.id] * (amb / 10);
        p.mood += (60 - p.mood) * 0.06;
        p.mood = U.clamp(p.mood, 0, 100);
        // жалобы в прессе (клуб пользователя)
        if (c.id === st.userClub && p.mood < 30 && p.h.tem >= 12 && (p.cmp || -99) < st.round - 6 && U.rnd() < 0.12 + (p.h.tem - 12) * 0.03) {
          p.cmp = st.round;
          st.news.push({ r: st.round, text: `😤 ${p.name} публично жалуется в прессе на нехватку игрового времени. Совет директоров недоволен шумом вокруг команды.` });
          if (st.board) st.board.conf = Math.max(0, st.board.conf - 1.5);
        }
      }
    }
  }

  /* Штраф за удаление (2 недельные зарплаты), вспыльчивые реагируют на штраф */
  function fines(st, club, p) {
    if (!club.fin) return;
    const fine = Math.round(p.wage * 2);
    club.fin.balance += fine / 1000;
    club.fin.season.ops += fine / 1000;
    if (p.h && p.h.tem >= 14) p.mood = Math.max(0, (p.mood || 60) - 8);
    if (club.id === st.userClub) st.news.push({ r: st.round, text: `💷 Клуб оштрафовал ${p.name} на £${fine} тыс. за удаление.${p.h && p.h.tem >= 14 ? ' Игрок воспринял штраф болезненно.' : ''}` });
  }

  const fmtM = v => (v < 0 ? '−' : '') + '£' + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + ' млн';
  const fmtW = v => '£' + Math.round(v) + ' тыс./нед';

  G.FIN = { CAPACITY, value, fairWage, demand, init, matchday, round, seasonEnd, seasonStart, renew, agentNotes, staffNotes, moodLabel, fines, outgrown, wageBill, squadValue, yearly, projectedIncome, ticket, commercial, operating, fmtM, fmtW, initContract };
})(typeof window !== 'undefined' ? window : globalThis);
