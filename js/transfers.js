/* Трансферный рынок (этап 2): окна, бюджет, покупка (клуб → личные условия), продажа, предложения ИИ, запросы на трансфер */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;
  const STARTERS = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const MIN_POS = { GK: 2, DF: 6, MF: 6, FW: 3 };
  const MAX_SQUAD = 30;

  const FIN = () => G.FIN;
  const club = (st, id) => st.clubs.find(c => c.id === id);
  const findPlayer = (st, pid) => { for (const c of st.clubs) { const p = c.players.find(x => x.id === pid); if (p) return { p, c }; } return null; };

  function market(st) {
    if (!st.market) st.market = { offers: [], listed: [], history: [], neg: {}, short: [], seq: 1 };
    return st.market;
  }

  /* ---------- окна ---------- */
  function windowState(st) {
    const r = st.round; // индекс следующей недели календаря (0 = перед стартом сезона)
    const K = G.LEAGUE.cal(st), wk = n => `${n}-й недели`;
    if (r <= K.summerEnd) return { open: true, id: st.season + 's', name: 'Летнее окно', closes: K.summerEnd + 1, text: `закроется после ${wk(K.summerEnd + 1)}` };
    if (r >= K.winter[0] && r <= K.winter[1]) return { open: true, id: st.season + 'w', name: 'Зимнее окно', closes: K.winter[1] + 1, text: `закроется после ${wk(K.winter[1] + 1)}` };
    return { open: false, id: null, name: r < K.winter[0] ? 'Зимнее окно' : 'Летнее окно', opens: r < K.winter[0] ? K.winter[0] + 1 : null, text: r < K.winter[0] ? `откроется перед ${K.winter[0] + 1}-й неделей` : 'откроется летом' };
  }

  /* ---------- статус игрока в клубе ---------- */
  function status(c, p) {
    const byOvr = c.players.slice().sort((a, b) => TAC.overall(b) - TAC.overall(a));
    if (byOvr.indexOf(p) < 3) return 'key';
    const same = byOvr.filter(x => x.pos === p.pos);
    const i = same.indexOf(p);
    if (i < STARTERS[p.pos]) return 'starter';
    if (i < STARTERS[p.pos] + 2) return 'rotation';
    return 'surplus';
  }
  const STATUS_TXT = { key: 'Ключевой игрок', starter: 'Игрок основы', rotation: 'Ротация', surplus: 'Запасной' };

  function core(c) { return U.avg(c.players.map(TAC.overall).sort((a, b) => b - a).slice(0, 14)); }

  /* Режим экономии: клуб под запретом или в минусе без денег владельца */
  function austerity(c) { return !!c.fin && (FIN().embargo(c) || (c.fin.balance < 0 && !(c.fin.ownLeft > 0.05))); }
  /* Распродажа: в режиме экономии клуб готов продать самых высокооплачиваемых игроков */
  function fireSale(c, p) {
    if (p.loan || !austerity(c)) return false;
    return c.players.filter(x => !x.loan).sort((a, b) => b.wage - a.wage).slice(0, 5).includes(p);
  }
  /* ИИ-клуб готов отпустить: лишний, возрастной, недовольный или дорогой при распродаже */
  function aiListed(c, p) {
    const s = status(c, p);
    return (s === 'surplus' && (p.age >= 30 || TAC.overall(p) < core(c) - 1.5)) || (p.mood != null && p.mood < 22) || fireSale(c, p);
  }

  function posCount(c, pos) { return c.players.filter(p => p.pos === pos).length; }

  /* Сколько хочет клуб-продавец */
  function asking(st, seller, p) {
    const s = status(seller, p);
    let k = { key: 1.6, starter: 1.3, rotation: 1.1, surplus: 0.9 }[s];
    if (seller.id !== st.userClub && aiListed(seller, p)) k *= 0.85;
    if (seller.fin && seller.fin.balance < 20) k *= 0.9;
    if (windowState(st).id && windowState(st).id.endsWith('w')) k *= 1.1;
    return Math.max(0.3, Math.round(FIN().value(p) * k * 10) / 10);
  }
  function notForSale(st, seller, p) {
    if (p.loan) return `Игрок в аренде (принадлежит «${(st.clubs.find(c => c.id === p.loan.from) || {}).name}»).`;
    if (posCount(seller, p.pos) <= MIN_POS[p.pos]) return 'Клубу некем заменить игрока на этой позиции.';
    if (status(seller, p) === 'key' && FIN().level(seller) <= 6 && !aiListed(seller, p)) return 'Ключевой игрок клуба — не продаётся.';
    return null;
  }

  function negKey(st, pid) { return pid + '@' + (windowState(st).id || 'x'); }
  function neg(st, pid) {
    const m = market(st), k = negKey(st, pid);
    if (!m.neg[k]) m.neg[k] = { tries: 3, fee: null, termsTries: null };
    return m.neg[k];
  }

  /* ---------- шаг 1: переговоры с клубом ---------- */
  function bidClub(st, pid, offer) {
    const w = windowState(st);
    if (!w.open) return { status: 'closed', msg: 'Трансферное окно закрыто.' };
    const f = findPlayer(st, pid); if (!f) return { status: 'reject', msg: 'Игрок не найден.' };
    const { p, c: seller } = f;
    const me = club(st, st.userClub);
    if (FIN().embargo(me)) return { status: 'reject', msg: 'Лига запретила клубу регистрировать новых игроков из-за долгов.' };
    const n = neg(st, pid);
    if (n.fee) return { status: 'accept', fee: n.fee, msg: 'Сумма уже согласована.' };
    const nfs = notForSale(st, seller, p);
    if (nfs) return { status: 'nosale', msg: `«${seller.name}»: ${nfs}` };
    if (me.players.length >= MAX_SQUAD) return { status: 'reject', msg: `В составе уже ${MAX_SQUAD} игроков — сначала кого-то продайте.` };
    if (offer > me.fin.transferBudget + 0.001) return { status: 'reject', msg: `Не хватает трансферного бюджета (${FIN().fmtM(me.fin.transferBudget)}).` };
    if (n.tries <= 0) return { status: 'reject', msg: `«${seller.name}» больше не хочет обсуждать этого игрока в это окно.` };
    const ask = asking(st, seller, p);
    if (offer >= ask) { n.fee = Math.round(offer * 10) / 10; return { status: 'accept', fee: n.fee, msg: `«${seller.name}» принимает предложение ${FIN().fmtM(n.fee)}. Теперь — личные условия игрока.` }; }
    n.tries--;
    if (offer >= ask * 0.8 && n.tries > 0) {
      const counter = Math.round((ask * 0.65 + offer * 0.35) * 10) / 10;
      n.counter = counter;
      return { status: 'counter', fee: counter, msg: `«${seller.name}» отклоняет ${FIN().fmtM(offer)}, но готов отпустить игрока за ${FIN().fmtM(counter)}.` };
    }
    return { status: 'reject', msg: n.tries > 0 ? `«${seller.name}» считает предложение несерьёзным. Попыток осталось: ${n.tries}.` : `«${seller.name}» прекращает переговоры.` };
  }
  function acceptCounter(st, pid) {
    const n = neg(st, pid);
    if (!n.counter) return null;
    const me = club(st, st.userClub);
    if (n.counter > me.fin.transferBudget) return { status: 'reject', msg: 'Не хватает трансферного бюджета.' };
    n.fee = n.counter; n.counter = null;
    return { status: 'accept', fee: n.fee, msg: `Сумма согласована: ${FIN().fmtM(n.fee)}. Теперь — личные условия игрока.` };
  }

  /* ---------- шаг 2: личные условия ---------- */
  function terms(st, p, from, to) {
    const n = neg(st, p.id);
    if (n.terms) return n.terms;
    const h = p.h || { amb: 10, loy: 10, pro: 10, tem: 10 };
    const mood = p.mood == null ? 60 : p.mood;
    const fromT = FIN().level(from), toT = FIN().level(to);
    const step = fromT - toT; // >0 — переход в клуб уровнем выше
    let w = FIN().fairWage(p) * (1 + (h.amb - 10) * 0.025) * (0.97 + U.rnd() * 0.1);
    w *= Math.max(1, p.wage / FIN().fairWage(p)) > 1.1 ? 1.08 : 1;               // не хочет терять в деньгах
    if (step >= 3) w *= 0.95; else if (step <= -3) w *= 1.12 + Math.max(0, h.amb - 12) * 0.02;
    if (mood < 35) w *= 0.92;
    w = Math.max(w, p.wage * 1.05);                                                 // переход — значит прибавка
    const years = p.age <= 23 ? [3, 5] : p.age <= 29 ? [2, 5] : [1, 3];
    let refuse = null;
    if (h.loy >= 16 && mood >= 55 && U.rnd() < 0.6) refuse = 'Игрок предан своему клубу и не хочет уходить.';
    else if (h.amb >= 15 && step <= -6) refuse = 'Игрок считает ваш клуб шагом назад и отказывается от перехода.';
    const notes = [];
    if (step >= 3) notes.push('Агент: «Для него это шаг вперёд — он готов на разумные условия».');
    if (step <= -3) notes.push('Агент: «Переход в клуб скромнее — нужна весомая компенсация».');
    if (mood < 35) notes.push('Игрок недоволен в своём клубе и хочет сменить обстановку.');
    if (h.amb >= 15) notes.push('Агент: «Мой клиент знает себе цену».');
    if (h.loy >= 15) notes.push('Игрок известен преданностью своему клубу.');
    if (!notes.length) notes.push('Агент: «Обсудим, если условия будут достойными».');
    n.terms = { wage: Math.round(w), years, refuse, notes, tries: U.clamp(2 + (h.loy >= 14 ? 0 : 0) - (h.amb >= 16 ? 1 : 0), 1, 2) };
    return n.terms;
  }

  function offerTerms(st, pid, wage, years) {
    const f = findPlayer(st, pid); if (!f) return { ok: false, msg: 'Игрок не найден.' };
    const { p, c: seller } = f;
    const me = club(st, st.userClub);
    const n = neg(st, pid);
    if (!n.fee) return { ok: false, msg: 'Сначала договоритесь с клубом.' };
    const t = terms(st, p, seller, me);
    if (t.refuse) return { ok: false, final: true, msg: `${p.name}: ${t.refuse}` };
    if (t.tries <= 0) return { ok: false, final: true, msg: `${p.name} отказался от перехода.` };
    if (FIN().wageBill(me) + wage > me.fin.wageBudget) return { ok: false, msg: `Совет директоров не одобрит: ведомость превысит бюджет зарплат (${me.fin.wageBudget} тыс./нед).` };
    if (n.fee > me.fin.transferBudget + 0.001) return { ok: false, msg: 'Не хватает трансферного бюджета.' };
    const h = p.h || { amb: 10, loy: 10 };
    const yearsOk = years >= t.years[0] && years <= t.years[1];
    const need = t.wage * (yearsOk ? 1 : 1.08);
    const zone = U.clamp(0.06 - (h.amb - 10) * 0.005, 0.01, 0.1);
    const ok = wage >= need || (wage >= need * (1 - zone) && U.rnd() < (wage - need * (1 - zone)) / (need * zone));
    if (!ok) {
      t.tries--;
      t.wage = Math.round(t.wage * (1.03 + h.amb * 0.002));
      return { ok: false, final: t.tries <= 0, msg: t.tries > 0 ? `${p.name} отклоняет условия и просит ${t.wage} тыс./нед.` : `${p.name} отказался от перехода.` };
    }
    const fee = n.fee;
    complete(st, p, seller, me, fee, Math.round(wage), years);
    return { ok: true, final: true, msg: `${p.name} переходит в «${me.name}» за ${FIN().fmtM(fee)}! Контракт: ${Math.round(wage)} тыс./нед на ${years} ${U.plural(years, 'год', 'года', 'лет')}.` };
  }

  /* ---------- проведение сделки ---------- */
  function freeNumber(c) {
    const used = new Set(c.players.map(p => p.num));
    for (let n = 2; n < 99; n++) if (!used.has(n)) return n;
    return 99;
  }
  function complete(st, p, from, to, fee, wage, years, opts) {
    const m = market(st);
    from.players = from.players.filter(x => x !== p); delete from._map;
    p.club = to.id; p.num = freeNumber(to); p.moved = windowState(st).id; p.joined = st.season; p.wage = wage; p.contract = years; p.dem = null; p.mood = 72; p.treq = false;
    to.players.push(p); delete to._map;
    const F = FIN();
    to.fin.balance -= fee; to.fin.season.transfers = (to.fin.season.transfers || 0) - fee;
    from.fin.balance += fee; from.fin.season.transfers = (from.fin.season.transfers || 0) + fee;
    if (to.fin.transferBudget != null) to.fin.transferBudget = Math.max(0, Math.round((to.fin.transferBudget - fee) * 10) / 10);
    if (from.fin.transferBudget != null) from.fin.transferBudget = Math.round((from.fin.transferBudget + fee * 0.7) * 10) / 10;
    m.listed = m.listed.filter(id => id !== p.id);
    m.offers = m.offers.filter(o => o.pid !== p.id);
    m.history.push({ season: st.seasonName, round: st.round + 1, pid: p.id, name: p.name, from: from.id, to: to.id, fee });
    if (!(opts && opts.quiet)) st.news.push({ r: st.round, text: `🔁 ${p.name}: «${from.name}» → «${to.name}» за ${F.fmtM(fee)}.` });
    // ИИ-клуб, оставшийся без игроков на позиции, подписывает свободного агента
    for (const c of [from, to]) {
      if (c.id === st.userClub) continue;
      if (posCount(c, p.pos) < MIN_POS[p.pos]) G.CAR.takeFromPool(st, c, p.pos);
    }
    if (G.LEAGUE && st.userClub) G.LEAGUE.fixUserTactics(st);
  }

  /* ---------- продажа: выставление и предложения ИИ ---------- */
  function list(st, pid, on) {
    const m = market(st);
    m.listed = m.listed.filter(id => id !== pid);
    if (on) m.listed.push(pid);
    const f = findPlayer(st, pid);
    if (f && on && f.p.treq) { f.p.mood = Math.min(100, (f.p.mood || 50) + 15); }
  }

  function aiBids(st) {
    const w = windowState(st);
    if (!w.open || !st.userClub) return;
    const m = market(st), me = club(st, st.userClub);
    m.offers = m.offers.filter(o => o.expires >= st.round && findPlayer(st, o.pid) && findPlayer(st, o.pid).c === me);
    if (m.offers.length >= 4) return;
    const myCore = core(me);
    const cands = me.players.filter(p => !p.loan && posCount(me, p.pos) > MIN_POS[p.pos] && !m.offers.some(o => o.pid === p.id));
    for (const c of st.clubs) {
      if (c.id === st.userClub || m.offers.length >= 4 || FIN().embargo(c)) continue;
      const cc = core(c);
      const anyListed = cands.some(p => m.listed.includes(p.id) && TAC.overall(p) >= cc - 3.5);
      if (U.rnd() > (anyListed ? 0.22 : 0.1)) continue;
      const budget = Math.max(0, c.fin.balance * 0.5);
      const pool = cands.filter(p => {
        const v = FIN().value(p);
        if (v * 1.1 > budget) return false;
        const listed = m.listed.includes(p.id);
        return listed ? TAC.overall(p) >= cc - 3.5 : (TAC.overall(p) >= cc + 0.7 && p.age <= 31);
      });
      if (!pool.length) continue;
      const p = U.pickWeighted(pool, x => (m.listed.includes(x.id) ? 3 : 1) * (1 + Math.max(0, TAC.overall(x) - cc)));
      const listed = m.listed.includes(p.id);
      const fee = Math.round(FIN().value(p) * (listed ? U.rand(0.8, 1.05) : U.rand(1.05, 1.4)) * 10) / 10;
      m.offers.push({ id: m.seq++, pid: p.id, from: c.id, fee, expires: Math.min(w.closes - 1, st.round + 2), listed });
      st.news.push({ r: st.round, text: `📨 «${c.name}» предлагает ${FIN().fmtM(fee)} за ${p.name}${listed ? '' : ' (игрок не выставлялся)'}. Ответьте в разделе «Трансферы».` });
      cands.splice(cands.indexOf(p), 1);
    }
    void myCore;
  }

  function answerOffer(st, offerId, action) {
    const m = market(st);
    const o = m.offers.find(x => x.id === offerId);
    if (!o) return { ok: false, msg: 'Предложение больше не актуально.' };
    const f = findPlayer(st, o.pid), buyer = club(st, o.from);
    if (!f || !buyer) { m.offers = m.offers.filter(x => x !== o); return { ok: false, msg: 'Предложение больше не актуально.' }; }
    const p = f.p, me = f.c;
    if (action === 'reject') {
      m.offers = m.offers.filter(x => x !== o);
      if (p.treq) p.mood = Math.max(0, (p.mood || 40) - 8);
      return { ok: true, msg: `Предложение «${buyer.name}» отклонено.` };
    }
    if (action === 'more') {
      if (o.haggled) return { ok: false, msg: `«${buyer.name}» не будет повышать ставку ещё раз.` };
      o.haggled = true;
      if (U.rnd() < 0.55) { o.fee = Math.round(o.fee * U.rand(1.08, 1.2) * 10) / 10; return { ok: true, msg: `«${buyer.name}» повышает предложение до ${FIN().fmtM(o.fee)}.` }; }
      m.offers = m.offers.filter(x => x !== o);
      return { ok: false, msg: `«${buyer.name}» отзывает предложение.` };
    }
    // принять
    const h = p.h || {};
    if (h.loy >= 16 && (p.mood || 60) >= 55 && !p.treq && U.rnd() < 0.5) {
      m.offers = m.offers.filter(x => x !== o);
      return { ok: false, msg: `${p.name} отказывается уходить — он предан клубу. Его настроение упало.`, mood: p.mood = Math.max(0, (p.mood || 60) - 15) };
    }
    const wage = Math.round(Math.max(p.wage * 1.05, FIN().fairWage(p)));
    complete(st, p, me, buyer, o.fee, wage, p.age <= 27 ? 4 : 2);
    return { ok: true, msg: `${p.name} продан в «${buyer.name}» за ${FIN().fmtM(o.fee)}.` };
  }

  /* ---------- сделки между ИИ-клубами ---------- */
  const PLAN_ATTR = { possession: ['pas'], counter: ['pac'], gegenpress: ['tac', 'sta'], wings: ['dri', 'pos'], direct: ['sho', 'pac'], park: ['pos', 'tac'] };
  const POS_ACC = { GK: 'позицию вратаря', DF: 'оборону', MF: 'центр поля', FW: 'атаку' };
  const POS_GEN = { GK: 'вратарей', DF: 'защитников', MF: 'полузащитников', FW: 'нападающих' };

  /* Потребности клуба: слабые места в основе и нехватка глубины (по убыванию важности) */
  const DEPTH = { GK: 3, DF: 7, MF: 7, FW: 4 };
  function needs(c) {
    const cc = core(c);
    const out = [];
    for (const pos of ['GK', 'DF', 'MF', 'FW']) {
      const same = c.players.filter(p => p.pos === pos && p.age <= 33).sort((a, b) => TAC.overall(b) - TAC.overall(a));
      const starters = same.slice(0, STARTERS[pos]);
      const lack = Math.max(0, DEPTH[pos] - same.length);
      const worst = starters.length ? TAC.overall(starters[starters.length - 1]) : 0;
      out.push({ pos, gap: cc - worst + lack * 1.2, worst, lack, cc });
    }
    return out.sort((a, b) => b.gap - a.gap);
  }
  function weakest(c) { return needs(c)[0]; }

  function aiMarket(st) {
    const w = windowState(st);
    if (!w.open) return;
    const m = market(st);
    m.ai = m.ai || {};
    const deals = [];
    for (const buyer of U.shuffle(st.clubs.slice())) {
      if (buyer.id === st.userClub || FIN().embargo(buyer)) continue;
      const key = buyer.id + '@' + w.id;
      const short = buyer.players.length < 22;
      if ((m.ai[key] || 0) >= (short ? 3 : 2) || U.rnd() > (short ? 0.6 : 0.35)) continue;
      const budget = buyer.fin.transferBudget || 0;
      if (budget < 2) continue;
      const coach = buyer.coach, attrs = PLAN_ATTR[coach.plan] || [];
      const bT = FIN().level(buyer);
      let need = null, cands = [];
      for (const nd of needs(buyer).slice(0, 2)) {
        if (nd.gap < 0.6 && !nd.lack) continue;
        cands = [];
        for (const seller of st.clubs) {
          if (seller === buyer || seller.id === st.userClub || seller.players.length <= (austerity(seller) ? 18 : 22)) continue;
          for (const p of seller.players) {
            if (p.pos !== nd.pos || p.age > 31 || p.moved === w.id || p.joined === st.season || p.loan) continue;
            const ovr = TAC.overall(p);
            if (ovr < (nd.lack ? nd.cc - 2.5 : nd.worst + 0.5)) continue;
            if (notForSale(st, seller, p)) continue;
            // топ-клубы не отдают конкурентам игроков основы
            const sst = status(seller, p);
            if (!fireSale(seller, p) && (sst === 'key' || (sst === 'starter' && FIN().level(seller) <= 6))) continue;
            const fee = asking(st, seller, p);
            if (fee > budget) continue;
            // игрок согласится?
            const h = p.h || {}, sT = FIN().level(seller);
            if (h.loy >= 16 && (p.mood || 60) >= 55) continue;
            if (h.amb >= 15 && bT - sT >= 6) continue;
            const fit = attrs.length ? U.avg(attrs, k => p.a[k]) - 10 : 0;
            const score = (ovr - (nd.lack ? nd.cc - 2.5 : nd.worst)) * 2 + fit * 0.15 * (1.3 - coach.adapt) + (p.age <= 23 ? 0.6 : 0) - fee / Math.max(5, budget) * 1.5 + (aiListed(seller, p) ? 0.4 : 0);
            cands.push({ p, seller, fee, score, fit });
          }
        }
        if (cands.length) { need = nd; break; }
      }
      if (!cands.length) continue;
      cands.sort((a, b) => b.score - a.score);
      const pick = cands[Math.min(cands.length - 1, U.rnd() < 0.7 ? 0 : U.randInt(0, 2))];
      const fee = Math.round(pick.fee * U.rand(1, 1.08) * 10) / 10;
      const wage = Math.round(Math.max(pick.p.wage * 1.05, FIN().fairWage(pick.p) * (1 + ((pick.p.h || {}).amb - 10) * 0.02)));
      const yrs = pick.p.age <= 24 ? U.randInt(4, 5) : pick.p.age <= 28 ? U.randInt(3, 4) : 2;
      const why = need.lack ? `закрывает нехватку ${POS_GEN[need.pos]}` : `усиливает ${POS_ACC[need.pos]}`;
      const style = pick.fit >= 4 && attrs.length ? ` — идеально под «${TAC.PLANS[coach.plan].n}»` : '';
      complete(st, pick.p, pick.seller, buyer, fee, wage, yrs, { quiet: true });
      m.ai[key] = (m.ai[key] || 0) + 1;
      deals.push({ fee, text: `🔁 «${buyer.name}» ${why}${style}: ${pick.p.name} (${UI_POS[pick.p.pos]}, ${pick.p.age}, ${TAC.overall(pick.p).toFixed(1)}) из «${pick.seller.name}» за ${FIN().fmtM(fee)}.` });
      trimSquad(st, buyer);
    }
    // в ленту — крупные сделки (в режиме зрителя — все)
    deals.sort((a, b) => b.fee - a.fee).forEach((d, i) => { if (!st.userClub || d.fee >= 25 || i < 2) st.news.push({ r: st.round, text: d.text }); });
  }
  const UI_POS = { GK: 'ВР', DF: 'ЗЩ', MF: 'ПЗ', FW: 'НП' };

  /* Переполненный состав: отчисляем слабейших «лишних» */
  function trimSquad(st, c) {
    while (c.players.length > 28) {
      const surplus = c.players.filter(p => !p.loan && posCount(c, p.pos) > MIN_POS[p.pos] + 1).sort((a, b) => TAC.overall(a) - TAC.overall(b));
      if (!surplus.length) break;
      G.CAR.release(st, c, surplus[0], 'trim');
    }
  }

  /* Недовольные игроки клуба пользователя просят о трансфере */
  function requests(st) {
    if (!st.userClub) return;
    const me = club(st, st.userClub), m = market(st);
    for (const p of me.players) {
      if (p.treq) continue;
      const big = FIN().outgrown(p, me) && p.h && p.h.amb >= 17;
      if ((p.mood != null && p.mood < 20) || (big && p.mood < 50)) {
        p.treq = true;
        st.news.push({ r: st.round, text: `✉ ${p.name} просит выставить его на трансфер${big ? ' — хочет играть в клубе уровнем выше' : ' — недоволен своим положением'}.${m.listed.includes(p.id) ? '' : ' Если отказать, настроение испортится ещё сильнее.'}` });
      }
    }
  }

  /* Вызывается после каждого тура (до перехода к следующему) и в начале сезона */
  function afterRound(st) {
    const m = market(st);
    const w = windowState(st);
    if (!w.open) { if (m.offers.length) m.offers = []; }
    else { aiMarket(st); aiLoans(st); aiBids(st); }
    checkPromises(st);
    requests(st);
    // отказ выставить просящего о трансфере
    if (st.userClub) club(st, st.userClub).players.forEach(p => { if (p.treq && !m.listed.includes(p.id)) p.mood = Math.max(0, (p.mood || 30) - 1.5); });
  }

  /* Поиск */
  function search(st, f) {
    const out = [];
    for (const c of st.clubs) {
      if (c.id === st.userClub) continue;
      for (const p of c.players) {
        const ovr = TAC.overall(p), v = FIN().value(p);
        if (f.pos && f.pos !== 'ALL' && p.pos !== f.pos) continue;
        if (f.maxAge && p.age > f.maxAge) continue;
        if (f.minOvr && ovr < f.minOvr) continue;
        if (f.maxPrice && v > f.maxPrice) continue;
        if (f.trait && !(p.tr || []).includes(f.trait)) continue;
        if (f.lg && c.league !== f.lg) continue;
        if (f.q && !p.name.toLowerCase().includes(f.q.toLowerCase())) continue;
        const nfs = !!notForSale(st, c, p);
        if (f.listedOnly && nfs) continue;
        out.push({ p, c, ovr, v, listed: aiListed(c, p), st: status(c, p), nfs, onLoan: !!p.loan });
      }
    }
    const k = f.sort || 'ovr';
    out.sort((a, b) => k === 'value' ? b.v - a.v : k === 'age' ? a.p.age - b.p.age : k === 'cheap' ? a.v - b.v : b.ovr - a.ovr);
    return out;
  }


  /* =================== АРЕНДЫ (этап 3) =================== */
  const PROMISE = { start: { n: 'Игрок основы', k: 0.6, bonus: 1.2 }, rot: { n: 'Ротация', k: 0.3, bonus: 0.5 }, none: { n: 'Без гарантий', k: 0, bonus: 0 } };
  const MAX_LOANS_IN = 4;

  function loansOut(st, cid) { const out = []; st.clubs.forEach(c => c.players.forEach(p => { if (p.loan && p.loan.from === cid) out.push({ p, c }); })); return out; }
  function loansIn(c) { return c.players.filter(p => p.loan && p.loan.to === c.id); }

  /* Пересчёт «чужих» зарплат: владелец платит (1 − доля) за отданных в аренду */
  function syncLoanWages(st) {
    st.clubs.forEach(c => { c.loansOut = []; });
    st.clubs.forEach(c => c.players.forEach(p => {
      if (!p.loan) return;
      const owner = club(st, p.loan.from);
      if (owner) owner.loansOut.push({ pid: p.id, wage: p.wage, share: p.loan.share });
    }));
  }

  /* Игровое время в аренде: сколько матчей сыграно из возможных */
  function loanMinutes(st, p) {
    const played = Math.max(0, (p.st.apps || 0) - (p.loan.apps0 || 0));
    const possible = Math.max(1, G.LEAGUE.clubMatches(st, p.loan.to, p.loan.round0 || 0, st.round));
    return { played, possible, share: played / possible };
  }

  /* Перемещение игрока в аренду */
  function moveLoan(st, p, from, to, terms) {
    from.players = from.players.filter(x => x !== p); delete from._map;
    p.loan = { from: from.id, to: to.id, share: terms.share, promise: terms.promise, option: terms.option || null, fee: terms.fee || 0, season: st.season, round0: st.round, apps0: p.st.apps, num0: p.num };
    p.num = freeNumber(to);
    to.players.push(p); delete to._map;
    p.moved = windowState(st).id;
    if (terms.fee) { to.fin.balance -= terms.fee; to.fin.season.transfers = (to.fin.season.transfers || 0) - terms.fee; from.fin.balance += terms.fee; from.fin.season.transfers = (from.fin.season.transfers || 0) + terms.fee; }
    if (terms.promise === 'start') p.mood = Math.min(100, (p.mood || 60) + 10);
    market(st).history.push({ season: st.seasonName, round: st.round + 1, pid: p.id, name: p.name, from: from.id, to: to.id, fee: terms.fee || 0, loan: true });
    syncLoanWages(st);
    if (st.userClub) G.LEAGUE.fixUserTactics(st);
  }

  /* Возврат из аренды */
  function returnLoan(st, p, reason) {
    const cur = club(st, p.loan.to), owner = club(st, p.loan.from);
    if (!cur || !owner) { p.loan = null; return; }
    cur.players = cur.players.filter(x => x !== p); delete cur._map;
    const used = new Set(owner.players.map(x => x.num));
    p.num = used.has(p.loan.num0) ? freeNumber(owner) : p.loan.num0;
    owner.players.push(p); delete owner._map;
    p.loanExp = Math.max(0, (p.st.apps || 0) - (p.loan.apps0 || 0));
    p.loanLast = { to: cur.id, apps: p.loanExp, season: st.seasonName, reason };
    p.loan = null;
    syncLoanWages(st);
  }

  /* Исполнение опции выкупа */
  function exerciseOption(st, p) {
    const L = p.loan; if (!L || !L.option) return { ok: false, msg: 'Опции выкупа нет.' };
    const owner = club(st, L.from), cur = club(st, L.to);
    if (FIN().embargo(cur)) return { ok: false, msg: 'Лига запретила клубу регистрировать новых игроков из-за долгов.' };
    if (cur.fin.transferBudget != null && cur.id === st.userClub && L.option > cur.fin.transferBudget) return { ok: false, msg: 'Не хватает трансферного бюджета.' };
    p.loan = null;
    cur.players = cur.players.filter(x => x !== p); delete cur._map;
    owner.players.push(p); delete owner._map; // complete() снимет игрока с владельца
    complete(st, p, owner, cur, L.option, p.wage, p.contract < 2 ? 3 : p.contract, { quiet: cur.id !== st.userClub && owner.id !== st.userClub });
    syncLoanWages(st);
    return { ok: true, msg: `«${cur.name}» выкупает ${p.name} за ${FIN().fmtM(L.option)}.` };
  }

  /* --- отдать своего игрока в аренду: какие клубы заинтересованы --- */
  function loanOutOffers(st, pid, terms) {
    const me = club(st, st.userClub), p = me.players.find(x => x.id === pid);
    if (!p) return { error: 'Игрок не найден.' };
    if (!windowState(st).open) return { error: 'Трансферное окно закрыто.' };
    if (p.loan) return { error: 'Игрок сам находится в аренде.' };
    if (posCount(me, p.pos) <= MIN_POS[p.pos]) return { error: 'Некем заменить игрока на этой позиции.' };
    const h = p.h || {};
    if (terms.promise === 'none' && h.amb >= 14) return { error: `${p.name} не хочет сидеть в запасе в другом клубе — нужна гарантия игрового времени.` };
    const ovr = TAC.overall(p), out = [];
    for (const c of st.clubs) {
      if (c === me || loansIn(c).length >= 2) continue;
      const same = c.players.filter(x => x.pos === p.pos).sort((a, b) => TAC.overall(b) - TAC.overall(a));
      const worst = same.length >= STARTERS[p.pos] ? TAC.overall(same[STARTERS[p.pos] - 1]) : 0;
      const fit = ovr - worst;
      const needFit = terms.promise === 'start' ? -0.3 : terms.promise === 'rot' ? -1.5 : -3;
      if (fit < needFit) continue;
      // сколько готовы платить: чем полезнее игрок и богаче клуб — тем больше
      let pay = U.clamp(0.35 + fit * 0.18 + (c.fin.balance > 150 ? 0.15 : 0) - (terms.promise === 'start' ? 0.15 : terms.promise === 'rot' ? 0.05 : 0) + (terms.option ? 0.1 : 0), 0, 1);
      if (terms.option && terms.option < FIN().value(p) * 0.9) pay += 0.1;
      if (pay + 0.001 < terms.share) continue;
      const fee = Math.round(Math.max(0, FIN().value(p) * 0.04 * (fit + 1)) * 10) / 10;
      out.push({ c, pay: Math.round(pay * 100), fee: Math.max(0, Math.min(fee, c.fin.transferBudget || 0)), fit });
    }
    out.sort((a, b) => b.fee - a.fee || b.fit - a.fit);
    return { list: out.slice(0, 6) };
  }
  function loanOut(st, pid, toId, terms) {
    const me = club(st, st.userClub), p = me.players.find(x => x.id === pid), to = club(st, toId);
    if (!p || !to) return { ok: false, msg: 'Сделка невозможна.' };
    moveLoan(st, p, me, to, terms);
    st.news.push({ r: st.round, text: `🤝 ${p.name} отправлен в аренду в «${to.name}» до конца сезона (${PROMISE[terms.promise].n.toLowerCase()}, «${to.name}» платит ${Math.round(terms.share * 100)}% зарплаты${terms.option ? ', опция выкупа ' + FIN().fmtM(terms.option) : ''}).` });
    return { ok: true, msg: `${p.name} уходит в аренду в «${to.name}».` };
  }

  /* --- взять в аренду: условия клуба-владельца --- */
  function loanInTerms(st, pid) {
    const f = findPlayer(st, pid); if (!f) return { error: 'Игрок не найден.' };
    const { p, c: owner } = f, me = club(st, st.userClub);
    if (!windowState(st).open) return { error: 'Трансферное окно закрыто.' };
    if (FIN().embargo(me)) return { error: 'Лига запретила клубу регистрировать новых игроков из-за долгов.' };
    if (p.loan) return { error: 'Игрок уже в аренде.' };
    if (loansIn(me).length >= MAX_LOANS_IN) return { error: `Не больше ${MAX_LOANS_IN} арендованных игроков.` };
    if (me.players.length >= MAX_SQUAD) return { error: `В составе уже ${MAX_SQUAD} игроков.` };
    const s = status(owner, p);
    const young = p.age <= 22;
    if (s === 'key' || (s === 'starter' && !young)) return { error: `«${owner.name}» не отдаёт в аренду игроков основы.` };
    if (posCount(owner, p.pos) <= MIN_POS[p.pos]) return { error: `«${owner.name}» некем заменить игрока.` };
    if (p.contract <= 1 && !young) return { error: 'У игрока истекает контракт — клуб не видит смысла в аренде.' };
    const ownerTop = FIN().level(owner) <= 8;
    const promise = young && ownerTop ? 'start' : young ? 'rot' : 'none';
    let share = U.clamp(0.5 + (young ? 0.15 : 0) + (ownerTop ? 0.15 : 0) + (s === 'surplus' ? -0.2 : 0), 0.3, 1);
    const fee = Math.round(FIN().value(p) * (young && ownerTop ? 0.06 : 0.03) * 10) / 10;
    const option = (s === 'surplus' && !young) || p.age >= 27 ? Math.round(FIN().value(p) * 1.1 * 10) / 10 : null;
    return { p, owner, terms: { share: Math.round(share * 100) / 100, promise, fee, option } };
  }
  function loanIn(st, pid, terms) {
    const me = club(st, st.userClub), f = findPlayer(st, pid);
    if (!f) return { ok: false, msg: 'Игрок не найден.' };
    const add = Math.round(f.p.wage * terms.share);
    if (FIN().wageBill(me) + add > me.fin.wageBudget) return { ok: false, msg: `Совет не одобрит: зарплатная ведомость превысит бюджет (${me.fin.wageBudget} тыс./нед).` };
    if (terms.fee > (me.fin.transferBudget || 0)) return { ok: false, msg: 'Не хватает трансферного бюджета на плату за аренду.' };
    me.fin.transferBudget = Math.round(((me.fin.transferBudget || 0) - terms.fee) * 10) / 10;
    moveLoan(st, f.p, f.c, me, terms);
    st.news.push({ r: st.round, text: `🤝 ${f.p.name} переходит в «${me.name}» на правах аренды из «${f.c.name}».` });
    return { ok: true, msg: `${f.p.name} арендован до конца сезона!` };
  }

  /* --- аренды между ИИ-клубами: гранды отдают молодёжь за практикой --- */
  function aiLoans(st) {
    const w = windowState(st); if (!w.open) return;
    const m = market(st); m.ail = m.ail || {};
    const deals = [];
    for (const owner of st.clubs) {
      if (owner.id === st.userClub || FIN().level(owner) > 10) continue;
      const kids = owner.players.filter(p => !p.loan && p.age <= 22 && ['surplus', 'rotation'].includes(status(owner, p)) && posCount(owner, p.pos) > MIN_POS[p.pos] + 1 && p.moved !== w.id);
      for (const p of kids) {
        if (U.rnd() > 0.25 || (m.ail[owner.id + w.id] || 0) >= 2) continue;
        const ovr = TAC.overall(p);
        const takers = st.clubs.filter(c => c !== owner && c.id !== st.userClub && !FIN().embargo(c) && loansIn(c).length < 2 && c.players.length < 28).map(c => {
          const same = c.players.filter(x => x.pos === p.pos).sort((a, b) => TAC.overall(b) - TAC.overall(a));
          const worst = same.length >= STARTERS[p.pos] ? TAC.overall(same[STARTERS[p.pos] - 1]) : 0;
          return { c, fit: ovr - worst };
        }).filter(x => x.fit >= -0.8).sort((a, b) => b.fit - a.fit);
        if (!takers.length) continue;
        const t = takers[0];
        moveLoan(st, p, owner, t.c, { share: 0.6, promise: t.fit >= 0 ? 'start' : 'rot', fee: 0, option: null });
        m.ail[owner.id + w.id] = (m.ail[owner.id + w.id] || 0) + 1;
        deals.push(`🤝 Аренда за игровой практикой: ${p.name} (${p.age}, ${ovr.toFixed(1)}) из «${owner.name}» в «${t.c.name}».`);
      }
    }
    deals.slice(0, st.userClub ? 2 : 6).forEach(t => st.news.push({ r: st.round, text: t }));
  }

  /* Зимняя проверка обещаний: если арендатор-пользователь не даёт играть — владелец отзывает игрока */
  function checkPromises(st) {
    if (st.round !== G.LEAGUE.cal(st).winter[0] || !st.userClub) return;
    const me = club(st, st.userClub);
    loansIn(me).forEach(p => {
      const L = p.loan, need = PROMISE[L.promise].k;
      if (!need) return;
      const mm = loanMinutes(st, p);
      if (mm.share + 0.05 < need) {
        const owner = club(st, L.from);
        returnLoan(st, p, 'recall');
        st.news.push({ r: st.round, text: `📞 «${owner.name}» досрочно отзывает ${p.name} из аренды: обещали ${PROMISE[L.promise].n.toLowerCase()}, а он сыграл ${mm.played} из ${mm.possible}.` });
        if (st.board) st.board.conf = Math.max(0, st.board.conf - 1);
      }
    });
  }

  /* Конец сезона: опции выкупа и возвращение арендованных */
  function endLoans(st) {
    const all = [];
    st.clubs.forEach(c => c.players.forEach(p => { if (p.loan) all.push(p); }));
    for (const p of all) {
      const L = p.loan, cur = club(st, L.to), owner = club(st, L.from);
      const apps = (p.st.apps || 0) - (L.apps0 || 0), avg = p.st.apps ? p.st.rsum / p.st.apps : 0;
      if (L.option && cur.id !== st.userClub && apps >= 12 && avg >= 6.9 && L.option <= (cur.fin.transferBudget || 0) * 1.2) {
        const r = exerciseOption(st, p);
        if (owner.id === st.userClub || !st.userClub) st.news.push({ r: 0, text: `💰 ${r.msg}` });
        continue;
      }
      returnLoan(st, p, 'end');
      if (owner.id === st.userClub) st.news.push({ r: 0, text: `↩ ${p.name} вернулся из аренды (играл за «${cur.name}»): ${apps} ${U.plural(apps, 'матч', 'матча', 'матчей')}${apps ? `, средняя оценка ${avg.toFixed(2)}` : ''}.` });
      if (cur.id === st.userClub) st.news.push({ r: 0, text: `↩ Арендованный ${p.name} вернулся в «${owner.name}».` });
    }
  }

  G.TR = { austerity, fireSale, PROMISE, loansOut, loansIn, syncLoanWages, loanMinutes, returnLoan, exerciseOption, loanOutOffers, loanOut, loanInTerms, loanIn, aiLoans, checkPromises, endLoans, aiMarket, weakest, needs, market, windowState, status, STATUS_TXT, aiListed, asking, notForSale, neg, bidClub, acceptCounter, terms, offerTerms, list, answerOffer, afterRound, search, findPlayer, MAX_SQUAD, MIN_POS };
})(typeof window !== 'undefined' ? window : globalThis);
