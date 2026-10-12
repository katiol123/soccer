/* Этап 5: академия, завершение карьеры, свободные агенты, тренерская карусель и увольнение */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;
  const FIN = () => G.FIN, TR = () => G.TR;
  const POS_S = { GK: 'ВР', DF: 'ЗЩ', MF: 'ПЗ', FW: 'НП' };
  const club = (st, id) => st.clubs.find(c => c.id === id);
  const usedNames = st => { const s = new Set(); st.clubs.forEach(c => c.players.forEach(p => s.add(p.name))); (st.fa || []).forEach(p => s.add(p.name)); return s; };
  const freeNum = c => { const u = new Set(c.players.map(p => p.num)); for (let n = 2; n < 99; n++) if (!u.has(n)) return n; return 99; };

  /* ---------- потенциал ---------- */
  /* Скрытый потолок развития (1..20). Высокий потенциал ускоряет рост молодых */
  function rollPot(p, rng) {
    rng = rng || Math.random;
    const o = TAC.overall(p);
    if (p.age >= 26) p.pot = Math.round(Math.min(20, o + rng()));
    else p.pot = Math.round(U.clamp(o + (26 - p.age) * (0.2 + rng() * 0.35) + (rng() - 0.5) * 2, o, 20));
    return p.pot;
  }
  function potStars(p) { return U.clamp(Math.round(((p.pot || 10) - 9) / 2.2), 1, 5); }

  /* ---------- академия ---------- */
  function academy(st) {
    const out = [];
    const used = usedNames(st);
    for (const c of st.clubs) {
      const n = 2 + (U.rnd() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const pos = U.pickWeighted(['GK', 'DF', 'MF', 'FW'], x => ({ GK: 0.6, DF: 1.6, MF: 1.6, FW: 1.2 })[x] / Math.max(1, c.players.filter(p => p.pos === x).length - (x === 'GK' ? 1 : 5)));
        const gem = U.rnd() < 0.06;
        const q = c.str - 2.6 + U.rnd() * 1.8 + (gem ? 2.5 : 0);
        const age = U.randInt(17, 18);
        const p = G.DATA.makePlayer(c, pos, q, age, Math.random, used, c.id + '_ac' + st.season + '_' + Math.floor(Math.random() * 1e7), freeNum(c), false);
        p.academy = c.id;
        p.pot = Math.round(U.clamp(TAC.overall(p) + (gem ? 5 : 2) + U.rnd() * 4.5, 8, 20));
        p.contract = 3; p.wage = Math.round(FIN().fairWage(p) * 0.6);
        c.players.push(p); delete c._map;
        out.push({ c, p, gem });
      }
    }
    if (st.userClub) {
      const mine = out.filter(x => x.c.id === st.userClub);
      st.news.push({ r: 0, text: `🎓 Выпуск академии: ${mine.map(x => `${x.p.name} (${x.p.age}, ${POS_S[x.p.pos]}, потенциал ${'★'.repeat(potStars(x.p))}${x.gem ? ' — настоящий талант!' : ''})`).join(', ')}.` });
    }
    const gems = out.filter(x => x.gem && x.c.id !== st.userClub);
    if (gems.length) st.news.push({ r: 0, text: `💎 Таланты из академий: ${gems.slice(0, 3).map(x => `${x.p.name} («${x.c.name}»)`).join(', ')}.` });
  }

  /* ---------- завершение карьеры ---------- */
  function announceRetirements(st) {
    const notable = [];
    for (const c of st.clubs) for (const p of c.players) {
      if (p.retiring || p.age < 33) continue;
      const pro = p.h ? p.h.pro : 10;
      let ch = 0.12 + (p.age - 33) * 0.18 - (pro - 10) * 0.02 + (TAC.overall(p) < 13 ? 0.1 : 0) + (p.inj > 0 ? 0.1 : 0);
      if (p.age >= 37) ch = 0.92;
      if (U.rnd() < ch) {
        p.retiring = true;
        if (c.id === st.userClub || TAC.overall(p) >= 16) notable.push({ p, c });
      }
    }
    notable.forEach(({ p, c }) => st.news.push({ r: st.round, text: `👴 ${p.name} («${c.name}», ${p.age}) объявил, что завершит карьеру по окончании сезона.` }));
  }
  function retire(st) {
    const gone = [];
    for (const c of st.clubs) {
      const r = c.players.filter(p => p.retiring);
      if (!r.length) continue;
      c.players = c.players.filter(p => !p.retiring); delete c._map;
      r.forEach(p => gone.push({ p, c }));
    }
    retirePool(st);
    const mine = gone.filter(x => x.c.id === st.userClub);
    if (mine.length) st.news.push({ r: 0, text: `🎩 Завершили карьеру: ${mine.map(x => `${x.p.name} (${x.p.age}, ${x.p.st.apps} матчей в последнем сезоне)`).join(', ')}. Спасибо за всё!` });
    const stars = gone.filter(x => x.c.id !== st.userClub && TAC.overall(x.p) >= 16);
    if (stars.length) st.news.push({ r: 0, text: `🎩 Лига прощается: ${stars.slice(0, 4).map(x => `${x.p.name} («${x.c.name}»)`).join(', ')} завершили карьеру.` });
    st.retired = (st.retired || 0) + gone.length;
  }

  /* Свободные агенты стареют и без тренировок теряют форму; возрастные, слабые и долго
     сидящие без клуба завершают карьеру. Пул ограничен самыми востребованными */
  const POOL_MAX = 70;
  function retirePool(st) {
    const fa = pool(st), now = st.season * 100 + st.round, out = [];
    st.fa = fa.filter(p => {
      p.age++;
      if (p.age >= 30) for (const k in p.a) if (U.rnd() < 0.3) p.a[k] = Math.max(1, p.a[k] - 1);
      const idle = now - (p.faSince || 0), ovr = TAC.overall(p);
      let ch = p.age >= 36 ? 1 : p.age >= 33 ? 0.35 + (p.age - 33) * 0.2 : p.age >= 30 ? 0.1 : 0;
      if (idle >= 100) ch += 0.35;          // целый сезон без клуба
      if (ovr < 10) ch += 0.3;
      if (U.rnd() < ch) { out.push(p); return false; }
      return true;
    });
    st.fa = st.fa.sort((a, b) => FIN().value(b) - FIN().value(a)).slice(0, POOL_MAX);
    const notable = out.filter(p => TAC.overall(p) >= 15);
    if (notable.length) st.news.push({ r: 0, text: `🎩 Не найдя клуба, завершили карьеру: ${notable.slice(0, 4).map(p => `${p.name} (${p.age})`).join(', ')}${out.length > notable.length ? ` и ещё ${out.length - notable.length} свободных агентов` : ''}.` });
    st.faRetired = (st.faRetired || 0) + out.length;
  }

  /* ---------- свободные агенты ---------- */
  function pool(st) { if (!st.fa) st.fa = []; return st.fa; }
  function release(st, c, p, why) {
    c.players = c.players.filter(x => x !== p); delete c._map;
    p.club = null; p.loan = null; p.contract = 0; p.treq = false; p.retiring = false;
    p.faSince = st.season * 100 + st.round;
    pool(st).push(p);
    if (TR()) { const m = TR().market(st); m.listed = m.listed.filter(id => id !== p.id); m.offers = m.offers.filter(o => o.pid !== p.id); m.history.push({ season: st.seasonName, round: st.round + 1, pid: p.id, name: p.name, from: c.id, to: null, fee: 0, why }); }
  }
  /* Отчисление игрока пользователем: компенсация 50% оставшегося контракта */
  function releaseCost(p) { return Math.round(p.wage * 52 / 1000 * Math.max(0, p.contract) * 0.5 * 10) / 10; }
  function userRelease(st, pid) {
    const c = club(st, st.userClub), p = c.players.find(x => x.id === pid);
    if (!p || p.loan) return { ok: false, msg: 'Нельзя отчислить этого игрока.' };
    if (c.players.filter(x => x.pos === p.pos).length <= TR().MIN_POS[p.pos]) return { ok: false, msg: 'Некем заменить игрока на этой позиции.' };
    const cost = releaseCost(p);
    c.fin.balance -= cost; c.fin.season.ops -= cost;
    release(st, c, p, 'release');
    G.LEAGUE.fixUserTactics(st);
    st.news.push({ r: st.round, text: `✂ ${p.name} отчислен${cost ? `, компенсация ${FIN().fmtM(cost)}` : ''}. Теперь он свободный агент.` });
    return { ok: true, msg: `${p.name} отчислен.` };
  }

  /* Требования свободного агента: чем дольше без клуба, тем скромнее */
  function faDemand(st, p) {
    const h = p.h || { amb: 10 };
    const idle = Math.max(0, st.season * 100 + st.round - (p.faSince || 0));
    const w = FIN().fairWage(p) * (1 + (h.amb - 10) * 0.02) * Math.max(0.6, 1 - idle * 0.015);
    const years = p.age <= 23 ? [2, 4] : p.age <= 30 ? [1, 3] : [1, 2];
    return { wage: Math.round(w), years, idle };
  }
  function signFree(st, cid, pid, wage, years, ai) {
    const fa = pool(st), p = fa.find(x => x.id === pid), c = club(st, cid);
    if (!p || !c) return { ok: false, msg: 'Игрок уже подписал контракт с другим клубом.' };
    const d = faDemand(st, p);
    if (!ai) {
      if (c.players.length >= TR().MAX_SQUAD) return { ok: false, msg: `В составе уже ${TR().MAX_SQUAD} игроков.` };
      if (FIN().wageBill(c) + wage > c.fin.wageBudget) return { ok: false, msg: 'Совет не одобрит: превышен бюджет зарплат.' };
      if (FIN().embargo(c) && wage > FIN().EMB_WAGE) return { ok: false, msg: `Запрет на регистрацию: лига разрешает подписывать только свободных агентов с зарплатой до £${FIN().EMB_WAGE} тыс./нед.` };
      const h = p.h || { amb: 10 };
      if (h.amb >= 16 && TAC.overall(p) >= 16 && FIN().level(c) >= 14 && d.idle < 10) return { ok: false, msg: `${p.name} ждёт предложений от клубов посильнее.` };
      p.faTries = (p.faTries == null ? 2 : p.faTries);
      if (wage < d.wage * 0.95) {
        p.faTries--;
        if (p.faTries <= 0) { p.faTries = 2; return { ok: false, msg: `${p.name} не устраивают условия. Попробуйте позже — со временем он станет сговорчивее.` }; }
        return { ok: false, msg: `${p.name} просит не меньше ${d.wage} тыс./нед.` };
      }
    }
    st.fa = fa.filter(x => x !== p);
    p.club = c.id; p.wage = Math.round(wage); p.contract = years; p.num = freeNum(c); p.mood = 70; p.faSince = null; p.dem = null; p.joined = st.season;
    c.players.push(p); delete c._map;
    if (TR()) TR().market(st).history.push({ season: st.seasonName, round: st.round + 1, pid: p.id, name: p.name, from: null, to: c.id, fee: 0, free: true });
    if (!ai) G.LEAGUE.fixUserTactics(st);
    return { ok: true, msg: `${p.name} подписывает контракт с «${c.name}» как свободный агент: ${Math.round(wage)} тыс./нед на ${years} ${U.plural(years, 'год', 'года', 'лет')}.` };
  }
  /* ИИ закрывает дыры свободными агентами */
  function aiFree(st, force) {
    const fa = pool(st);
    if (!fa.length) return;
    for (const c of st.clubs) {
      if (c.id === st.userClub) continue;
      if (!force && U.rnd() > 0.2) continue;
      if (FIN().embargo(c) && c.players.length >= 20) continue; // под запретом — только в крайнем случае
      const needs = TR().needs(c).filter(n => n.lack > 0 || c.players.length < 22);
      for (const nd of needs.slice(0, 2)) {
        const cand = fa.filter(p => p.pos === nd.pos && TAC.overall(p) >= nd.cc - 3).sort((a, b) => TAC.overall(b) - TAC.overall(a))[0];
        if (!cand) continue;
        const d = faDemand(st, cand);
        const r = signFree(st, c.id, cand.id, d.wage, U.randInt(d.years[0], d.years[1]), true);
        if (r.ok && (TAC.overall(cand) >= 15.5 || !st.userClub)) st.news.push({ r: st.round, text: `✍ ${r.msg}` });
        break;
      }
    }
  }
  /* Замена на позиции: сначала из пула, иначе — сгенерированный свободный агент */
  function takeFromPool(st, c, pos) {
    const fa = pool(st);
    const p = fa.filter(x => x.pos === pos).sort((a, b) => TAC.overall(b) - TAC.overall(a))[0];
    if (p) { const d = faDemand(st, p); signFree(st, c.id, p.id, d.wage, d.years[0], true); return p; }
    const np = G.DATA.makePlayer(c, pos, c.str - 1, U.randInt(22, 31), Math.random, usedNames(st), c.id + '_fa' + Math.floor(Math.random() * 1e7), freeNum(c), false);
    np.contract = 2; np.wage = Math.round(FIN().fairWage(np)); rollPot(np);
    c.players.push(np); delete c._map;
    return np;
  }

  /* Конец контрактов (вызывается из финансов в конце сезона) */
  function contractsEnd(st, report) {
    for (const c of st.clubs) {
      const leaving = [];
      c.players.forEach(p => {
        p.contract = (p.contract || 1) - 1;
        if (p.contract > 0) return;
        if (c.id === st.userClub) { leaving.push(p); return; }
        // ИИ: продлевает нужных, отпускает возрастных запасных; в режиме экономии продлевает только молодых ключевых
        const s = TR().status(c, p), tight = TR().austerity(c);
        const posN = c.players.filter(x => x.pos === p.pos).length;
        if ((s === 'surplus' && p.age >= 29) || (p.age >= 32 && s !== 'key' && U.rnd() < 0.5) || (tight && !(s === 'key' && p.age <= 29))) {
          if (posN > TR().MIN_POS[p.pos] + 1) { leaving.push(p); return; }
        }
        const d = FIN().demand(st, p, c); p.wage = tight ? Math.round(Math.min(d.wage, p.wage * 0.9)) : d.wage; p.contract = U.randInt(d.years[0], d.years[1]);
      });
      if (!leaving.length) continue;
      leaving.forEach(p => release(st, c, p, 'contract'));
      if (c.id === st.userClub) report.push(`👋 Контракты истекли, клуб покидают свободными агентами: ${leaving.map(p => p.name).join(', ')}.`);
      // минимальный состав по позициям
      for (const pos of ['GK', 'DF', 'MF', 'FW']) {
        while (c.players.filter(p => p.pos === pos).length < TR().MIN_POS[pos]) {
          const np = takeFromPool(st, c, pos);
          if (c.id === st.userClub) report.push(`🧩 Чтобы закрыть позицию, подписан ${np.name} (${POS_S[pos]}, ${np.age}).`);
        }
      }
    }
    // пул ограничен лучшими
    st.fa = pool(st).sort((a, b) => FIN().value(b) - FIN().value(a)).slice(0, POOL_MAX + 20);
  }

  /* Переполненные составы ИИ: слабейших запасных — в свободные агенты */
  function trimAI(st) {
    for (const c of st.clubs) {
      if (c.id === st.userClub) continue;
      // режим экономии: расторжение по соглашению сторон с самыми дорогими запасными
      if (TR().austerity(c)) {
        const cut = [];
        for (let i = 0; i < 3 && c.players.length > 22; i++) {
          const exp = c.players.filter(p => !p.loan && p.age >= 26 && ['surplus', 'rotation'].includes(TR().status(c, p)) && c.players.filter(x => x.pos === p.pos).length > TR().MIN_POS[p.pos] + 1).sort((a, b) => b.wage - a.wage)[0];
          if (!exp) break;
          release(st, c, exp, 'austerity'); cut.push(exp);
        }
        if (cut.length && !st.userClub) st.news.push({ r: 0, text: `✂ «${c.name}» экономит: контракты расторгнуты с ${cut.map(p => p.name).join(', ')}.` });
      }
      while (c.players.length > 28) {
        const sur = c.players.filter(p => !p.loan && c.players.filter(x => x.pos === p.pos).length > TR().MIN_POS[p.pos] + 1).sort((a, b) => TAC.overall(a) - TAC.overall(b));
        if (!sur.length) break;
        release(st, c, sur[0], 'trim');
      }
    }
  }

  /* ---------- тренеры ---------- */
  const PLANS = ['possession', 'counter', 'gegenpress', 'wings', 'direct', 'park'];
  const FORMS = ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1'];
  const NATS = ['Англия', 'Испания', 'Италия', 'Германия', 'Португалия', 'Франция', 'Нидерланды', 'Шотландия', 'Бельгия', 'Аргентина'];
  const COACH_FIRST = ['Марко', 'Стефан', 'Педро', 'Ральф', 'Шон', 'Маурицио', 'Юлиан', 'Гари', 'Роберто', 'Франк', 'Тьерри', 'Эрик', 'Скотт', 'Хулен', 'Паулу'];
  const COACH_LAST = ['Вернер', 'Альварес', 'Брукс', 'Рикелли', 'Хольм', 'Даннинг', 'Морено', 'Кэррик', 'Бьянки', 'Леклерк', 'Сантана', 'Флетчер', 'Остин', 'Фернандес', 'Новак'];
  const MOTTOS = {
    possession: 'Мяч должен быть у нас — терпеливо ищет бреши.', counter: 'Отдать мяч и убить контратакой.', gegenpress: 'Отбор сразу после потери — лучший плеймейкер.',
    wings: 'Ширина, навесы и игра на втором этаже.', direct: 'Быстрее к чужим воротам, без лишних касаний.', park: 'Сначала надёжность — потом всё остальное.'
  };
  function genCoach(c) {
    const xi = TAC.bestXI(c, '4-4-2', { fitWeight: 0 });
    const prof = G.AI.xiProfile(c, '4-4-2', xi.lineup);
    const aff = { possession: prof.pas, counter: prof.pac, gegenpress: (prof.tac + prof.sta) / 2, wings: (prof.dri + prof.pos) / 2, direct: (prof.sho + prof.pac) / 2, park: (prof.pos + prof.tac) / 2 - 1 };
    const plan = U.pickWeighted(PLANS, k => Math.pow(aff[k], 3));
    const f1 = U.pick(FORMS), f2 = U.pick(FORMS.filter(f => f !== f1));
    const name = U.pick(COACH_FIRST) + ' ' + U.pick(COACH_LAST);
    const r = () => Math.round(U.rand(0.6, 1.8) * 10) / 10;
    return { id: 'c_' + c.id + '_' + Math.floor(Math.random() * 1e6), name, nat: U.pick(NATS), formations: [f1, f2], plan, mentality: r(), pressing: plan === 'gegenpress' ? 1.8 : r(), line: r(), adapt: Math.round(U.rand(0.2, 0.9) * 100) / 100, skill: Math.round(U.rand(0.72, 0.9) * 100) / 100, temper: Math.round(U.rand(0.3, 0.8) * 100) / 100, subAt: U.randInt(58, 67), motto: MOTTOS[plan], hired: true };
  }

  /* ИИ-клубы увольняют неудачливых тренеров (≈1/3, 1/2 и 3/4 сезона, в каждой лиге) */
  function aiSackings(st) {
    if (!G.LEAGUE.cal(st).sacks.includes(st.round)) return;
    st.sacks = st.sacks || {};
    G.LEAGUE.leagueIds(st).forEach(lid => G.LEAGUE.standings(st, lid).forEach((r, i, table) => {
      const c = club(st, r.id);
      if (c.id === st.userClub || st.sacks[c.id + '@' + st.season]) return;
      const gap = ((i + 1) - (c.fin.target || 10)) * 20 / table.length;
      if (gap < 5) return;
      if (U.rnd() > 0.2 + (gap - 5) * 0.12) return;
      const old = c.coach;
      c.coach = genCoach(c);
      st.sacks[c.id + '@' + st.season] = st.round;
      st.news.push({ r: st.round, text: `🔥 «${c.name}» увольняет ${old.name} (${i + 1}-е место при цели ${c.fin.target}-е). Новый главный тренер — ${c.coach.name} (${c.coach.nat}): ${c.coach.formations[0]}, «${TAC.PLANS[c.coach.plan].n}».` });
    }));
  }

  /* Увольнение пользователя */
  function checkUser(st, seasonEnd) {
    if (!st.userClub || !st.board || st.sacked) return;
    const b = st.board;
    if ((seasonEnd && b.conf < 20) || (!seasonEnd && st.round >= G.LEAGUE.cal(st).boardMin && b.conf < 12)) {
      const c = club(st, st.userClub);
      st.sacked = { club: c.id, season: st.season, round: st.round, conf: Math.round(b.conf) };
      st.news.push({ r: st.round, text: `⛔ Совет директоров «${c.name}» расторг контракт с главным тренером. Доверие упало до ${Math.round(b.conf)}%.` });
    }
  }
  /* Предложения работы после увольнения: клубы скромнее и те, что недавно уволили тренера */
  function jobOffers(st) {
    const old = st.sacked ? club(st, st.sacked.club) : null;
    const lvl = old ? FIN().level(old) : 10;
    const cands = st.clubs.filter(c => c !== old).map(c => {
      const recent = st.sacks && st.sacks[c.id + '@' + st.season], L = FIN().level(c);
      return { c, s: (recent ? 3 : 0) + (L >= lvl ? 2 - Math.max(0, L - lvl - 8) * 0.25 : -((lvl - L) * 0.8)) + U.rnd() * 2 };
    }).sort((a, b) => b.s - a.s);
    return cands.slice(0, 3).map(x => x.c);
  }
  function takeJob(st, cid) {
    const old = club(st, st.userClub), nc = club(st, cid);
    old.coach = genCoach(old);
    st.news.push({ r: st.round, text: `«${old.name}» назначает нового тренера: ${old.coach.name}.` });
    st.userClub = nc.id;
    st.userTactics = TAC.defaultTactics(nc);
    st.board = { conf: 55, target: nc.fin.target || 10 };
    st.lg = nc.league || st.lg;
    st.sacked = null;
    if (TR()) { const m = TR().market(st); m.listed = []; m.offers = []; m.short = []; }
    st.career = (st.career || []).concat([{ club: nc.id, season: st.seasonName, round: st.round + 1 }]);
    st.news.push({ r: st.round, text: `🤝 Вы возглавили «${nc.name}». Новый вызов, новая цель — ${st.board.target}-е место.` });
  }
  function toSpectator(st) {
    const old = club(st, st.userClub);
    if (old) old.coach = genCoach(old);
    st.mode = 'spectator'; st.userClub = null; st.userTactics = null; st.board = null; st.sacked = null;
  }

  /* ---------- точки входа ---------- */
  /* Стартовый пул свободных агентов: ветераны, неудачники отбора, молодёжь без клуба */
  function seedPool(st, n) {
    const used = usedNames(st), fake = { id: 'fa', str: 11.5 };
    for (let i = 0; i < n; i++) {
      const pos = U.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']);
      const age = U.pick([19, 20, 22, 25, 27, 29, 30, 31, 32, 33]);
      const p = G.DATA.makePlayer(fake, pos, 9.5 + U.rnd() * 4.5, age, Math.random, used, 'fa_' + Math.floor(Math.random() * 1e9), 0, false);
      p.club = null; p.contract = 0; p.wage = Math.round(FIN().fairWage(p)); p.faSince = (st.season || 1) * 100;
      st.fa.push(p);
    }
  }

  function ensure(st) {
    if (!st.fa) { st.fa = []; seedPool(st, 25); }
    pool(st);
    st.clubs.forEach(c => c.players.forEach(p => { if (p.pot == null) rollPot(p); }));
  }
  /* После каждого тура (st.round уже указывает на следующий тур) */
  function afterRound(st) {
    const K = G.LEAGUE.cal(st);
    if (st.round === K.retire) announceRetirements(st);
    aiSackings(st);
    if (st.round > 0 && st.round % K.freeEvery === 0) aiFree(st, false);
    checkUser(st, false);
  }

  G.CAR = { trimAI, rollPot, potStars, academy, announceRetirements, retire, pool, release, userRelease, releaseCost, faDemand, signFree, aiFree, takeFromPool, contractsEnd, genCoach, aiSackings, checkUser, jobOffers, takeJob, toSpectator, ensure, afterRound };
})(typeof window !== 'undefined' ? window : globalThis);
