/* Финансы: стоимость игроков, зарплаты и контракты, доходы и расходы клубов, совет директоров.
   Деньги — в млн £, зарплаты — в тыс. £ в неделю. */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;

  /* Вместимость стадионов (тыс. мест) */
  const CAPACITY = { ars: 60.7, avl: 42.8, bou: 11.3, bre: 17.3, bha: 31.8, bur: 21.9, che: 40.3, cry: 25.5, eve: 52.9, ful: 29.6, lee: 37.8, liv: 61.3, mci: 53.4, mun: 74.3, new: 52.3, nfo: 30.4, sun: 49.0, tot: 62.8, whu: 62.5, wol: 31.8 };
  /* Экономика лиги: телеправа, премии, коэффициенты билетов/спонсоров/расходов (см. DATA.LEAGUES) */
  const DEF_FIN = { tvEqual: 85, tvMerit: 3.2, euro: [55, 55, 55, 55, 25, 12], ticketK: 1, commK: 1, opsK: 1 };
  function lgFin(club) { const L = G.DATA && G.DATA.LEAGUES[club.league]; return (L && L.fin) || DEF_FIN; }
  function lgSize(club) { const L = G.DATA && G.DATA.LEAGUES[club.league]; return L ? L.clubs.length : 20; }
  function weeks(st) { return G.LEAGUE && st.leagues ? G.LEAGUE.weeks(st) : 38; }
  /* Уровень клуба для сравнения между лигами: ожидаемое место + 20 за каждый дивизион ниже (меньше — выше) */
  function level(club) {
    const L = G.DATA && G.DATA.LEAGUES[club.league];
    return ((L ? L.tier : 1) - 1) * 20 + ((club.fin && club.fin.target) || 10);
  }
  /* ---------- престиж клуба (1..99) ----------
     Растёт от трофеев, высоких мест, повышений и кубка; падает от провалов, вылета, внешнего управления.
     «Статус» — денежная сила бренда: спонсоры, базовая цена билета, спрос на матчи */
  function presOf(str) { return U.clamp(Math.round(50 + (str - 10.5) * 12), 2, 98); }
  function pres(c) { return c.pres == null ? presOf(c.str) : c.pres; }
  function status(c) { return 10.5 + (pres(c) - 50) / 12; }
  function presLabel(p) { return p >= 85 ? 'Гранд' : p >= 68 ? 'Большой клуб' : p >= 48 ? 'Крепкий клуб' : p >= 30 ? 'Скромный клуб' : 'Маленький клуб'; }
  /* Привлекательность для игроков: уровень клуба с поправкой на престиж (меньше — привлекательнее) */
  function appeal(c) { return level(c) - (pres(c) - 50) / 8; }
  const PRES_BASE = [62, 32, 16];
  /* Итоги сезона для престижа всех клубов */
  function prestigeSeason(st, tables, sum) {
    const changes = {};
    tables.forEach(tbl => tbl.forEach((r, i) => {
      const c = st.clubs.find(x => x.id === r.id);
      if (!c || !c.fin) return;
      const t = tierOf(c), N = tbl.length, pos = i + 1, before = pres(c);
      let d = ((c.fin.target || pos) - pos) * 0.5 * 20 / N;
      if (pos === 1) d += t === 1 ? 8 : 4;
      if (t === 1 && pos <= 4) d += 2;
      if (sum && sum.promoted.some(x => x.id === c.id)) d += 5;
      if (sum && sum.relegated.some(x => x.id === c.id)) d -= 6;
      if (st.cup && st.cup.season === st.season && G.CUP) {
        if (st.cup.winner === c.id) d += 6; else if (st.cup.runnerUp === c.id) d += 2; else if (G.CUP.reached(st, c.id) >= 4) d += 1;
      }
      if (c.fin.embargo) d -= 1;
      if (d > 0) d *= U.clamp((100 - before) / 40, 0.15, 1);   // у вершины престиж растёт всё медленнее
      d += (PRES_BASE[Math.min(2, t - 1)] - before) * 0.05;
      c.pres = U.clamp(Math.round((before + d) * 10) / 10, 1, 99);
      changes[c.id] = c.pres - before;
    }));
    const me = st.userClub && st.clubs.find(c => c.id === st.userClub);
    if (me) { const d = changes[me.id] || 0; st.news.push({ r: 0, text: `⭐ Престиж «${me.name}»: ${Math.round(me.pres)} (${d >= 0 ? '+' : ''}${d.toFixed(1)}) — ${presLabel(me.pres).toLowerCase()}. Престиж влияет на спонсоров, спрос на билеты и интерес игроков.` }); }
  }

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
    if (p.st && p.st.apps >= 5) v *= U.clamp(1 + (p.st.rsum / p.st.apps - (G.TAC.ratingNorm(p) - 0.1)) * 0.15, 0.85, 1.2);
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
    const bv = baseValue(p);
    const w = 30 * Math.min(1, Math.pow(bv / 8, 1.3)) + 9 * Math.pow(bv, 0.7) * (p.age >= 31 ? 0.85 : 1) * (p.star ? 1.25 : 1);
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
    return (h.amb || 10) >= 14 && TAC.overall(p) >= clubCore(club) + 1 && appeal(club) > 6;
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
    if (p.st && p.st.apps >= 5) w *= U.clamp(1 + (p.st.rsum / p.st.apps - (G.TAC.ratingNorm(p) - 0.1)) * 0.12, 0.9, 1.15);
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
  function ticket(club) { return Math.max(12, (40 + (status(club) - 10) * 10) * lgFin(club).ticketK); }    // базовая цена билета, £
  function commercial(club) { return 12 * Math.exp(0.65 * (status(club) - 10)) * lgFin(club).commK; }       // млн/сезон
  function operating(club) { return Math.max(6, 30 + (club.str - 10) * 15) * lgFin(club).opsK; }     // млн/сезон
  function para(club) { return (club.fin && club.fin.para && club.fin.para[0]) || 0; }                  // «парашют», млн/сезон

  function emptyLedger() { return { tv: 0, gate: 0, comm: 0, prize: 0, wages: 0, ops: 0, transfers: 0, owner: 0 }; }

  /* ---------- владелец, запрет на регистрацию, внешнее управление ----------
     Убытки клубов покрывает владелец (в пределах своей «щедрости» за сезон). Если денег нет и долг растёт —
     лига запрещает регистрировать игроков, а при огромном долге клуб уходит во внешнее управление (−12 очков). */
  const OWN_K = [6, 1.4, 0.5];   // поддержка владельца за сезон на единицу щедрости, млн (по дивизионам)
  const EMB = [40, 12, 5];       // долг, при котором вводится запрет на регистрацию игроков, млн
  const EMB_WAGE = 12;           // при запрете можно подписать только свободного агента не дороже этого (тыс./нед)
  function tierOf(c) { const L = G.DATA && G.DATA.LEAGUES[c.league]; return L ? L.tier : 1; }
  function ownerCap(c) { return Math.round((c.own ? c.own.w : 10) * OWN_K[Math.min(2, tierOf(c) - 1)] * 10) / 10; }
  function debtLimit(c) { return EMB[Math.min(2, tierOf(c) - 1)]; }
  function rollOwner(rng, min) { return { w: U.clamp(Math.round(1 + 19 * Math.pow(rng(), 1.3)), min || 1, 20), amb: U.clamp(Math.round(1 + rng() * 19), 1, 20) }; }
  /* Амбиции владельца: поднимают или опускают планку совета (в местах) */
  function ownerShift(c) { const o = c.own || {}, a = o.amb == null ? 10 : o.amb; return Math.round((a - 10) / 4 * (o.w >= 8 ? 1 : 0.5)); }
  /* Цель совета с учётом амбиций владельца */
  function ownerGoal(c, exp) { const N = G.DATA && G.DATA.LEAGUES[c.league] ? G.DATA.LEAGUES[c.league].clubs.length : 20; return U.clamp(exp - ownerShift(c), 1, N); }
  /* Деньги владельца на трансферы в начале сезона: только амбициозные и при деньгах */
  function ownerFunds(c) { const o = c.own || {}; return Math.round(ownerCap(c) * 0.4 * U.clamp(((o.amb || 10) - 9) / 11, 0, 1) * (o.w >= 10 ? 1 : 0.4) * 10) / 10; }
  function ownerInvest(st, c) {
    const inj = ownerFunds(c);
    if (inj <= 0 || embargo(c)) return 0;
    book(c, 'owner', inj); c.fin.transferBudget = Math.round(((c.fin.transferBudget || 0) + inj) * 10) / 10;
    return inj;
  }
  function ownerLabel(c) {
    const w = c.own ? c.own.w : 10, a = c.own && c.own.amb != null ? c.own.amb : 10;
    const L = w >= 16 ? ['Миллиардер', 'покрывает почти любые убытки'] : w >= 11 ? ['Щедрый владелец', 'охотно гасит долги клуба'] : w >= 6 ? ['Осторожный владелец', 'помогает, но в разумных пределах'] : ['Владелец без денег', 'клуб должен жить по средствам'];
    const amb = a >= 15 ? 'амбициозен: даёт деньги на трансферы, но требует места выше' : a <= 6 ? 'без больших амбиций: цели скромнее' : 'амбиции умеренные';
    return [L[0], `${L[1]}; ${amb}`];
  }
  /* Цель совета в Кубке Англии — стадия, до которой нужно дойти (индекс раунда; null — без цели) */
  const CUP_STAGES = ['1-й раунд', '3-й раунд', '4-й раунд', '5-й раунд', '1/4 финала', '1/2 финала', 'Финал', 'Победа'];
  function cupTarget(c) {
    const L = level(c);
    return L <= 2 ? 6 : L <= 4 ? 5 : L <= 8 ? 4 : L <= 14 ? 3 : L <= 32 ? 2 : L >= 41 && L <= 46 ? 2 : null;
  }
  function cupStageName(st, i) {
    if (i == null) return null;
    const R = st.cup && st.cup.rounds;
    if (R && i < R.length) return R[i].name;
    return i >= (R ? R.length : 7) ? 'Победа' : CUP_STAGES[i];
  }
  /* Текст цели: «дойти до 1/4 финала» / «выиграть кубок» */
  function cupGoalText(st, i) { if (i == null) return null; const n = cupStageName(st, i); return n === 'Победа' ? 'выиграть кубок' : `дойти до стадии «${n}»`; }
  function embargo(c) { return !!(c.fin && c.fin.embargo); }
  /* Взносы владельца: гасят минус на балансе в пределах оставшейся поддержки на сезон */
  function ownerRound(st) {
    for (const c of st.clubs) {
      if (!c.fin || c.fin.balance >= 0 || !(c.fin.ownLeft > 0.05)) continue;
      const inj = Math.round(Math.min(-c.fin.balance + debtLimit(c) * 0.25, c.fin.ownLeft) * 10) / 10;
      book(c, 'owner', inj);
      c.fin.ownLeft = Math.round((c.fin.ownLeft - inj) * 10) / 10;
      if (c.id === st.userClub) st.news.push({ r: st.round, text: `💰 Владелец «${c.name}» вносит ${fmtM(inj)}, чтобы закрыть дыру в бюджете.${c.fin.ownLeft <= 0.05 ? ' Больше денег в этом сезоне он не даст.' : ''}` });
    }
  }
  /* Санкции: запрет на регистрацию и внешнее управление */
  function sanctions(st, final) {
    for (const c of st.clubs) {
      if (!c.fin) continue;
      const L = debtLimit(c), me = c.id === st.userClub;
      if (!c.fin.embargo && c.fin.balance < -L) {
        c.fin.embargo = true; c.fin.transferBudget = 0; c.fin.embSince = st.season;
        st.news.push({ r: st.round, text: `⛔ «${c.name}»: долг превысил ${fmtM(L)} — лига запрещает клубу регистрировать новых игроков.${me ? ` Можно подписывать только свободных агентов с зарплатой до £${EMB_WAGE} тыс./нед.` : ''}` });
      } else if (c.fin.embargo && c.fin.balance > -L / 2) {
        c.fin.embargo = false;
        if (me) st.news.push({ r: st.round, text: `✅ Запрет на регистрацию игроков снят: финансы «${c.name}» снова под контролем.` });
      }
      // хронический запрет (два сезона и больше) — кредиторы теряют терпение раньше
      const chronic = final && c.fin.embargo && st.season - (c.fin.embSince || st.season) >= 1;
      if (!(c.fin.ownLeft > 0.05) && (c.fin.balance < -3 * L || (chronic && c.fin.balance < -2 * L))) administration(st, c, final);
    }
  }
  function administration(st, c, final) {
    const L = debtLimit(c), season = st.season + (final ? 1 : 0);
    st.ded = st.ded || {};
    st.ded[season + ':' + c.id] = 12;
    // кредиторы списывают большую часть долга, клуб покупает новый владелец
    const written = -c.fin.balance - L * 0.8;
    c.fin.balance = -L * 0.8;
    c.own = rollOwner(Math.random, 8);
    c.fin.goal = ownerGoal(c, c.fin.target || 10);
    c.fin.ownLeft = ownerCap(c);
    c.fin.admin = (c.fin.admin || 0) + 1;
    c.pres = Math.max(1, pres(c) - 8);
    c.fin.embargo = true; c.fin.transferBudget = 0; c.fin.embSince = st.season + (final ? 1 : 0);
    c.players.forEach(p => { p.wage = Math.round(p.wage * 0.8); p.mood = Math.max(0, (p.mood == null ? 60 : p.mood) - 15); });
    // администраторы выставляют на продажу самых дорогих игроков
    const top = c.players.slice().sort((a, b) => value(b) - value(a)).slice(0, 2);
    if (c.id === st.userClub) {
      if (G.TR) { const m = G.TR.market(st); top.forEach(p => { if (!m.listed.includes(p.id)) m.listed.push(p.id); }); }
      if (st.board) st.board.conf = Math.max(0, st.board.conf - 20);
    } else top.forEach(p => { p.mood = Math.min(p.mood, 15); });
    st.news.push({ r: st.round, text: `🚨 «${c.name}» уходит во внешнее управление: кредиторы списывают ${fmtM(written)} долга, клуб получает −12 очков${final ? ' в следующем сезоне' : ''}, зарплаты урезаны на 20%, ${top.map(p => p.name).join(' и ')} выставлены на продажу. Клуб купил новый владелец${c.own.amb >= 15 ? ' — амбициозный, с большими планами' : c.own.amb <= 6 ? ' — осторожный, без громких целей' : ''}.` });
  }

  /* Прогноз доходов на сезон (для бюджета зарплат) */
  function projectedIncome(club, expectedPos) {
    const cap = club.cap || CAPACITY[club.id] || 30, F = lgFin(club), N = lgSize(club);
    return F.tvEqual + F.tvMerit * (N + 1 - expectedPos) + cap * ticket(club) * 0.95 * (N - 1) / 1000 + commercial(club) + ((F.euro || [])[expectedPos - 1] || 0) + para(club);
  }

  function setBudget(st, club, expectedPos) {
    const inc = projectedIncome(club, expectedPos);
    const bill = wageBill(club);
    // правление разрешает тратить на зарплаты ~68% дохода, но не меньше текущей ведомости + 5%
    club.fin.wageBudget = Math.round(Math.max(bill * 1.05, inc * 0.68 * 1000 / 52));
  }

  /* Ожидаемое место — внутри своей лиги */
  function expectedPositions(st) {
    const res = {};
    const lids = st.leagues ? Object.keys(st.leagues) : [null];
    for (const lid of lids) {
      const clubs = lid && G.LEAGUE ? G.LEAGUE.leagueClubs(st, lid) : st.clubs;
      clubs.map(c => ({ c, r: TAC.teamRating(c) })).sort((a, b) => b.r - a.r).forEach((x, i) => { res[x.c.id] = i + 1; });
    }
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
        const B = lgFin(c).bal || [20, 35, 10]; // стартовый баланс: база, прибавка за силу, опорная сила
        c.fin = { balance: Math.round(B[0] + (c.str - B[2]) * B[1]), season: emptyLedger(), last: null, hist: [] };
        c.fin.hist.push(c.fin.balance);
      }
      c.fin.target = exp[c.id];
      setBudget(st, c, exp[c.id]);
      if (c.fin.transferBudget == null) c.fin.transferBudget = Math.round(Math.max(0, c.fin.balance * 0.5));
      if (c.fin.season.transfers == null) c.fin.season.transfers = 0;
      if (c.fin.season.owner == null) c.fin.season.owner = 0;
      if (!c.own) c.own = rollOwner(rng);
      if (c.own.amb == null) c.own.amb = U.clamp(Math.round(1 + rng() * 19), 1, 20);
      if (c.fin.goal == null) { c.fin.goal = ownerGoal(c, exp[c.id]); if (!(st.round > 0) && st.season === 1 && !st.started) ownerInvest(st, c); }
      if (c.pres == null) c.pres = presOf(c.str);
      if (c.fin.ownLeft == null) c.fin.ownLeft = ownerCap(c);
    });
    st.started = true;
    if (st.userClub && !st.board) { const uc = st.clubs.find(c => c.id === st.userClub); st.board = { conf: 60, target: uc.fin.goal || exp[st.userClub] }; }
    if (st.board && st.board.cup === undefined) { const uc = st.clubs.find(c => c.id === st.userClub); st.board.cup = uc ? cupTarget(uc) : null; }
  }

  function book(club, key, amount) {
    club.fin.balance += amount;
    club.fin.season[key] += amount;
  }

  /* Домашний матч: выручка от билетов. Посещаемость зависит от места и формы */
  function matchday(st, fixture, table) {
    const club = st.clubs.find(c => c.id === fixture.h);
    if (!club || !club.fin) return;
    const env = fixture.env || (G.LEAGUE && G.LEAGUE.matchEnv(st, fixture));
    const att = env.fill, tp = env.tp || 1;
    if (fixture.cup) return cupGate(st, fixture, club, st.clubs.find(c => c.id === fixture.a), att, tp);
    const gate = (club.cap || CAPACITY[club.id] || 30) * att * ticket(club) * tp / 1000;
    book(club, 'gate', Math.round(gate * 100) / 100);
    fixture.res.att = Math.round((club.cap || CAPACITY[club.id] || 30) * att * 1000);
  }

  /* Кубок: выручка делится между клубами (55/45, на «Уэмбли» — поровну); выезд к клубу выше классом собирает аншлаг */
  /* ---------- болельщики (0..100) ----------
     Настроение трибун: серия результатов, дерби, кубок, громкие покупки и продажи звёзд, цены на билеты.
     Влияет на спрос, давление трибун и доверие совета. Провальная серия — пустеющая арена — ещё меньше поддержки */
  function fans(c) { return c.fans == null ? 60 : c.fans; }
  /* Реакция болельщиков на цену билетов за каждый домашний матч */
  function priceMood(m) { return m <= 0.85 ? 1 : m >= 1.75 ? -5 : m >= 1.45 ? -3 : m >= 1.2 ? -1 : 0; }
  function fansLabel(v) { return v >= 85 ? ['Город влюблён в команду', '😍'] : v >= 65 ? ['Болельщики довольны', '😊'] : v >= 45 ? ['Болельщики спокойны', '😐'] : v >= 25 ? ['Болельщики недовольны', '😠'] : ['Фанаты протестуют', '🔥']; }
  function fansAdd(st, c, d, why) {
    if (!c || !d) return;
    const before = fans(c);
    c.fans = U.clamp(Math.round((before + d) * 10) / 10, 0, 100);
    if (c.id !== st.userClub) return;
    const cross = t => (before >= t) !== (c.fans >= t);
    if (cross(25) && c.fans < 25) st.news.push({ r: st.round, text: `📢 Болельщики «${c.name}» недовольны${why ? ` (${why})` : ''}: трибуны пустеют, совет нервничает. Победа в дерби, громкий трансфер или дешёвые билеты помогут вернуть их.` });
    else if (cross(12) && c.fans < 12) st.news.push({ r: st.round, text: `🔥 Протесты у стадиона «${c.name}»: фанаты требуют перемен. Доверие совета тает.` });
    else if (cross(85) && c.fans >= 85) st.news.push({ r: st.round, text: `😍 Город влюблён в «${c.name}»: билеты сметают, стадион ревёт.` });
  }
  /* После матча: результат, дерби, кубок, цена билетов */
  function fansAfterMatch(st, f) {
    const H = st.clubs.find(c => c.id === f.h), A = st.clubs.find(c => c.id === f.a);
    const w = G.LEAGUE.winner(f), diff = f.res.hs - f.res.as, derby = f.env && f.env.derby;
    for (const [c, me] of [[H, 'h'], [A, 'a']]) {
      const my = me === 'h' ? diff : -diff, won = f.res.hs !== f.res.as ? my > 0 : (f.cup || f.po) ? w === c.id : null;
      let d = won === true ? 4 + (my >= 3 ? 2 : 0) : won === false ? -4 - (my <= -3 ? 2 : 0) : (me === 'h' ? -1 : 1);
      if (derby) d *= 1.8;
      if (f.cup) { const o = me === 'h' ? A : H; if (won === true && tierOf(o) < tierOf(c)) d += 4; if (won === false && tierOf(o) > tierOf(c)) d -= 5; }
      if (me === 'h' && f.env && f.env.tp) d += priceMood(f.env.tp);   // болельщики помнят цены
      fansAdd(st, c, d, won === false ? (derby ? 'проигрыш в дерби' : 'неудачная серия') : '');
    }
  }

  /* ---------- билеты: спрос и цена ----------
     Спрос на матч (может превышать 1 — аншлаг с запасом): место хозяев, престиж обоих клубов, важность матча, кубок, погода.
     Цена — множитель к базовой цене клуба. Дороже — больше денег за билет, но меньше зрителей и слабее поддержка */
  const PRICES = [0.7, 0.85, 1, 1.2, 1.45, 1.75];
  function matchDemand(st, f, imp) {
    const H = st.clubs.find(c => c.id === f.h), A = st.clubs.find(c => c.id === f.a);
    let d;
    if (f.cup) d = 0.7 + (tierOf(H) - tierOf(A)) * 0.12 + (f.cr || 0) * 0.04;
    else {
      const t = G.LEAGUE.standings(st, H.league), N = t.length, pos = t.findIndex(r => r.id === H.id) + 1;
      d = 0.8 + (N - pos) * 0.008 * 20 / N + (f.po ? 0.2 : 0);
    }
    d += (pres(H) - 45) / 250 + (pres(A) - 45) / 500 + imp * 0.12 + (U.rnd() - 0.5) * 0.06;
    d += (fans(H) - 55) / 220 + (f.env && f.env.derby ? 0.15 : 0);   // настроение болельщиков и дерби
    const wx = f.env && f.env.weather;
    d -= wx === 'snow' ? 0.08 : (wx === 'rain' || wx === 'heavy') ? 0.03 : 0;
    return Math.max(0.35, d);
  }
  /* Чувствительность к цене: у престижных клубов и в важных матчах болельщики готовы платить больше */
  function elastic(H, imp) { return U.clamp(1.2 - pres(H) / 120 - imp * 0.2, 0.45, 1.3); }
  function fillAt(env, m) { return U.clamp(env.dem * U.clamp(1 - env.k * (m - 1), 0.2, 1.6), 0.15, 1); }
  /* Прогноз по каждой цене: заполняемость, выручка за матч, поддержка трибун */
  function pricing(st, f) {
    const env = G.LEAGUE.matchEnv(st, f), H = st.clubs.find(c => c.id === f.h);
    const cap = env.cap, base = ticket(H) * (f.cup ? 0.85 : 1), share = f.cup ? 0.55 : 1;
    return PRICES.map(m => {
      const fill = fillAt(env, m), e = Object.assign({}, env, { fill });
      return { m, price: Math.round(base * m), fill, rev: Math.round(cap * fill * base * m * share / 10) / 100, homeK: G.ENGINE ? G.ENGINE.homeK(e) : 1, crowd: G.ENGINE ? G.ENGINE.crowdOf(e) : 0 };
    });
  }
  /* Выбор цены ИИ: деньги против поддержки. Долги, запрет и скупой владелец толкают цену вверх, важный матч — вниз */
  function aiPrice(st, f, imp) {
    const H = st.clubs.find(c => c.id === f.h), opts = pricing(st, f);
    let wMoney = 1 + (H.fin.balance < 0 ? 0.8 : 0) + (embargo(H) ? 0.7 : 0) + ((H.own ? H.own.w : 10) < 6 ? 0.3 : 0) + (wageBill(H) > H.fin.wageBudget ? 0.3 : 0) - (H.fin.balance > 150 ? 0.3 : 0);
    const wSport = 0.4 + imp * 1.6;
    const r1 = opts.find(o => o.m === 1).rev || 0.01;
    let best = null;
    for (const o of opts) {
      // поддержка: давление трибун на гостей (≈ +0.15 очка за матч между 75% и аншлагом) + небольшой плюс к атаке
      const u = (o.rev / r1) * wMoney * 3 + (o.crowd * 3.5 + (Math.sqrt(o.homeK) - 1) * 20) * wSport + priceMood(o.m) * 0.3 * (fans(H) < 40 ? 2 : 1) + (U.rnd() - 0.5) * 0.3;
      if (!best || u > best.u) best = { m: o.m, u };
    }
    return best.m;
  }
  /* Установка цены (пользователь перед матчем или по умолчанию) */
  function setPrice(st, f, m) {
    const env = G.LEAGUE.matchEnv(st, f);
    if (env.neutral) return env;
    env.tp = m; env.fill = Math.round(fillAt(env, m) * 1000) / 1000;
    return env;
  }
  function cupGate(st, f, H, A, att, tp) {
    const cap = f.neutral ? 90 : (H.cap || CAPACITY[H.id] || 30);
    const price = f.neutral ? 60 : ticket(H) * 0.85 * (tp || 1);
    const gate = Math.round(cap * att * price / 1000 * 100) / 100, hs = f.neutral ? 0.5 : 0.55;
    book(H, 'gate', gate * hs); if (A && A.fin) book(A, 'gate', gate * (1 - hs));
    f.res.att = Math.round(cap * att * 1000);
  }

  /* Каждую неделю календаря: телеправа (равная доля) и «парашют», спонсоры, зарплаты, операционные расходы.
     Годовые суммы делятся на число недель сезона — одинаково для всех лиг, в том числе в недели без матчей */
  function round(st) {
    const W = weeks(st);
    for (const c of st.clubs) {
      if (!c.fin) continue;
      book(c, 'tv', (lgFin(c).tvEqual + para(c)) / W);
      book(c, 'comm', commercial(c) / W);
      book(c, 'wages', -yearly(wageBill(c)) / W);
      book(c, 'ops', -operating(c) / W);
      c.fin.balance = Math.round(c.fin.balance * 100) / 100;
      c.fin.hist.push(c.fin.balance);
      if (c.fin.hist.length > 80) c.fin.hist.shift();
    }
    if (st.round % 4 === 3) ownerRound(st);
    for (const c of st.clubs) if (c.fans != null) c.fans += (55 - c.fans) * 0.04;   // со временем страсти утихают
    sanctions(st, false);
    if (G.TR) G.TR.syncLoanWages(st);
    moodRound(st);
    if (st.userClub) { boardRound(st); contractReminder(st); }
  }

  /* Напоминание об истекающих контрактах (≈2/3 и ≈5/6 сезона) */
  function contractReminder(st) {
    if (!G.LEAGUE.cal(st).remind.includes(st.round)) return;
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
    // неделя без матча (пауза в лиге, плей-офф) — доверие не меняется
    if (!G.LEAGUE.weekFixtures(st).some(f => !f.po && !f.cup && (f.h === st.userClub || f.a === st.userClub))) return;
    let d = (b.target - pos) * 0.15 * 20 / table.length * 38 / G.LEAGUE.roundsTotal(st);
    d += (fans(club) - 50) * 0.006;   // настроение трибун влияет на совет
    if (club.fin.balance < 0) d -= 1.5;
    if (wageBill(club) > club.fin.wageBudget) d -= 1;
    b.conf = U.clamp(Math.round((b.conf + d) * 10) / 10, 0, 100);
    if (b.conf < 25 && !b.warned) { b.warned = true; st.news.push({ r: st.round, text: '⚠ Совет директоров недоволен результатами. Доверие падает — нужно срочно исправлять ситуацию.' }); }
    if (b.conf >= 35) b.warned = false;
  }

  /* Конец сезона: призовые, еврокубки, итоги, контракты */
  function seasonEnd(st, table, sum) {
    const report = [];
    const tables = st.leagues ? Object.keys(st.leagues).map(lid => G.LEAGUE.standings(st, lid)) : [table];
    tables.forEach(tbl => tbl.forEach((r, i) => {
      const c = st.clubs.find(x => x.id === r.id);
      if (!c || !c.fin) return;
      const F = lgFin(c);
      book(c, 'prize', F.tvMerit * (tbl.length - 1 - i) + ((F.euro || [])[i] || 0));
      if (c.fin.para) { c.fin.para = c.fin.para.slice(1); if (!c.fin.para.length) c.fin.para = null; }
    }));
    // престиж по итогам сезона
    prestigeSeason(st, tables, sum);
    // владельцы закрывают сезон, лига проверяет долги
    ownerRound(st);
    sanctions(st, true);
    tables.forEach(tbl => tbl.forEach((r, i) => {
      const c = st.clubs.find(x => x.id === r.id);
      if (!c || !c.fin) return;
      const s = c.fin.season;
      c.fin.last = Object.assign({}, s, { season: st.seasonName, profit: Math.round((s.tv + s.gate + s.comm + s.prize + s.wages + s.ops + (s.transfers || 0)) * 10) / 10, pos: i + 1 });
      c.fin.season = emptyLedger();
    }));
    // совет директоров подводит итоги
    if (st.userClub) {
      const pos = table.findIndex(r => r.id === st.userClub) + 1;
      const b = st.board, delta = (b.target - pos) * 20 / table.length;
      const up = sum && sum.promoted.some(x => x.id === st.userClub), down = sum && sum.relegated.some(x => x.id === st.userClub);
      let verdict = delta >= 3 ? 'в восторге' : delta >= 0 ? 'доволен' : delta >= -3 ? 'разочарован' : 'в ярости';
      let conf = b.conf + delta * 4;
      if (up) { verdict = 'в восторге'; conf = Math.max(conf, b.conf) + 25; }
      if (down) { verdict = 'в ярости'; conf -= b.target <= table.length - 3 ? 25 : 8; }
      // кубок: сравнение достигнутой стадии с целью
      let cupTxt = '';
      if (b.cup != null && G.CUP && st.cup && st.cup.season === st.season) {
        const got = G.CUP.reached(st, st.userClub), dc = got - b.cup;
        conf += U.clamp(dc * 3, -9, 9);
        cupTxt = ` Кубок: цель — ${cupStageName(st, b.cup)}, итог — ${got < 0 ? 'не участвовал' : cupStageName(st, got)}${dc >= 0 ? ' ✔' : ' ✘'}.`;
      }
      b.conf = U.clamp(conf, 5, 100);
      const extra = up ? ' Клуб повышается в классе!' : down ? ' Клуб покидает лигу.' : '';
      st.news.push({ r: 0, text: `🏛 Совет директоров ${verdict}: цель — ${b.target}-е место, итог — ${pos}-е.${extra}${cupTxt} Доверие ${Math.round(b.conf)}%.` });
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
    const inv = {};
    st.clubs.forEach(c => {
      c.fin.target = exp[c.id]; c.fin.goal = ownerGoal(c, exp[c.id]);
      setBudget(st, c, exp[c.id]); c.fin.ownLeft = ownerCap(c);
      c.fin.transferBudget = c.fin.embargo ? 0 : Math.round(Math.max(0, c.fin.balance * 0.5));
      inv[c.id] = ownerInvest(st, c);
    });
    if (st.userClub) {
      const uc = st.clubs.find(c => c.id === st.userClub);
      st.board.target = uc.fin.goal; st.board.warned = false; st.board.cup = cupTarget(uc);
      const cg = cupGoalText(st, st.board.cup), sh = ownerShift(uc);
      st.news.push({ r: 0, text: `🏛 Задачи совета на сезон: ${st.board.target}-е место в лиге${cg ? `, в Кубке Англии — ${cg}` : ''}.${sh > 0 ? ' Амбициозный владелец поднял планку.' : sh < 0 ? ' Владелец без больших амбиций — цели скромные.' : ''}` });
      if (inv[uc.id] > 0) st.news.push({ r: 0, text: `💰 Владелец выделяет ${fmtM(inv[uc.id])} на трансферы — и ждёт результата.` });
    }
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
    const rd = G.LEAGUE ? G.LEAGUE.weekFixtures(st) : (st.fixtures[st.round] || []);
    const res = {}, played = new Set();
    rd.forEach(f => {
      played.add(f.h); played.add(f.a);
      if (!f.res) return;
      const w = G.LEAGUE.winner(f), d = f.res.hs !== f.res.as ? Math.sign(f.res.hs - f.res.as) : (f.po || f.cup) ? (w === f.h ? 1 : -1) : 0;
      res[f.h] = d; res[f.a] = -d;
    });
    for (const c of st.clubs) {
      if (!played.has(c.id)) continue; // неделя без матча: игровое время не учитывается
      const core = clubCore(c);
      for (const p of c.players) {
        if (!p.h) continue;
        if (p.mood == null) p.mood = 65;
        const amb = p.h.amb;
        if (p.lp === st.round) p.mood += 2.5 + (res[c.id] > 0 ? 1 : 0);
        else if (TAC.available(p)) {
          const imp = U.clamp((TAC.overall(p) - core) / 2 + 1, 0, 3);
          p.mood -= (1.2 + imp * 1.4) * (0.4 + amb / 16) * (c.id !== st.userClub && G.CTRAITS && G.CTRAITS.has(c.coach, 'psych') ? 0.75 : 1);   // психолог смягчает обиду запасных
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

  G.FIN = { CAPACITY, EMB_WAGE, priceMood, fans, fansLabel, fansAdd, fansAfterMatch, ownerShift, ownerGoal, ownerFunds, PRICES, matchDemand, elastic, fillAt, pricing, aiPrice, setPrice, pres, presOf, presLabel, status, appeal, prestigeSeason, cupTarget, cupStageName, cupGoalText, level, ownerCap, ownerLabel, debtLimit, embargo, lgFin, para, value, fairWage, demand, init, matchday, round, seasonEnd, seasonStart, renew, agentNotes, staffNotes, moodLabel, fines, outgrown, wageBill, squadValue, yearly, projectedIncome, ticket, commercial, operating, fmtM, fmtW, initContract };
})(typeof window !== 'undefined' ? window : globalThis);
