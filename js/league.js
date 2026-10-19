/* Турниры: общий календарь недель, таблицы, плей-офф, вылет/повышение, статистика, сохранение */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC, DATA = G.DATA;
  const SAVE_KEY = 'match3-manager-save-v1';

  function schedule(ids) {
    const n = ids.length;
    const arr = ids.slice();
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const rd = [];
      for (let i = 0; i < n / 2; i++) {
        rd.push({ x: arr[i], y: arr[n - 1 - i] });
      }
      rounds.push(rd);
      arr.splice(1, 0, arr.pop());
    }
    // хозяева: чередуем дом/выезд — дома играет тот, у кого меньше домашних и кто был в гостях в прошлом туре
    const homes = {}, seq = {};
    ids.forEach(id => { homes[id] = 0; seq[id] = ''; });
    // штраф за серию: два дома подряд — сильно хочется в гости, два выезда — домой
    const score = (id, r) => {
      const t = seq[id].slice(-2);
      return (t === 'hh' ? 6 : t === 'aa' ? -6 : 0) + (t[1] === 'h' ? 2 : t[1] === 'a' ? -2 : 0) + homes[id] - r / 2;
    };
    for (let r = 0; r < rounds.length; r++) {
      rounds[r] = rounds[r].map(({ x, y }) => {
        const sx = score(x, r), sy = score(y, r);
        const xHome = sx < sy || (sx === sy && (r + x.length) % 2 === 0);
        const h = xHome ? x : y, a = xHome ? y : x;
        homes[h]++; seq[h] += 'h'; seq[a] += 'a';
        return { h, a };
      });
    }
    const second = rounds.map(rd => rd.map(f => ({ h: f.a, a: f.h })));
    return rounds.concat(second).map(rd => rd.map(f => Object.assign(f, { res: null })));
  }

  /* ---------- лиги ---------- */
  /* Клубы лиги */
  function leagueClubs(st, lid) { lid = lid || st.lg; return st.clubs.filter(c => (c.league || st.lg) === lid); }
  /* st.fixtures — прозрачный указатель на календарь текущей лиги (не сохраняется отдельно) */
  function attach(st) {
    if (Object.getOwnPropertyDescriptor(st, 'fixtures') && !Object.getOwnPropertyDescriptor(st, 'fixtures').get) {
      // старый формат: перенос календаря в лигу
      const fx = st.fixtures; delete st.fixtures;
      st.leagues = st.leagues || {}; st.lg = st.lg || 'eng1';
      st.leagues[st.lg] = Object.assign({ id: st.lg }, st.leagues[st.lg] || {}, { fixtures: fx });
    }
    Object.defineProperty(st, 'fixtures', {
      configurable: true, enumerable: false,
      get() { return this.leagues[this.lg].fixtures; },
      set(v) { this.leagues[this.lg].fixtures = v; }
    });
    return st;
  }
  function leagueInfo(st, lid) { const L = DATA.LEAGUES[lid || st.lg]; return L || { id: lid, name: 'Лига', short: '', flag: '' }; }
  function leagueIds(st) { return DATA.LEAGUE_ORDER.filter(id => st.leagues[id]).concat(Object.keys(st.leagues).filter(id => !DATA.LEAGUE_ORDER.includes(id))); }
  function tier(c) { const L = DATA.LEAGUES[c.league]; return L ? L.tier : 1; }
  /* Лига дивизионом выше */
  function above(lid) { const i = DATA.LEAGUE_ORDER.indexOf(lid); return i > 0 ? DATA.LEAGUES[DATA.LEAGUE_ORDER[i - 1]] : null; }

  /* ---------- календарь: общая шкала недель ---------- */
  /* Все лиги живут на одной шкале недель. Самая длинная лига играет каждую неделю,
     остальные распределяют туры равномерно (в свободные недели — пауза). Плей-офф — в последних неделях. */
  function buildCalendar(st) {
    const sched = {};
    let span = 0;
    for (const lid of leagueIds(st)) {
      sched[lid] = schedule(U.shuffle(leagueClubs(st, lid).map(c => c.id)));
      span = Math.max(span, sched[lid].length);
    }
    const po = leagueIds(st).some(lid => DATA.LEAGUES[lid] && DATA.LEAGUES[lid].playoff) ? 2 : 0;
    st.weeks = span + po;
    for (const lid of leagueIds(st)) {
      const R = sched[lid], weeks = Array.from({ length: st.weeks }, () => []);
      R.forEach((rd, k) => { weeks[R.length === span ? k : Math.round(k * (span - 1) / (R.length - 1))] = rd; });
      st.leagues[lid].fixtures = weeks;
      st.leagues[lid].rounds = R.length;
    }
    if (G.CUP) G.CUP.build(st);
  }
  /* Параметры подготовки ИИ к матчу: кубок, погода и ближайший кубковый матч (чтобы поберечь основу) */
  function prepOpts(st, f, c) {
    const next = !f.cup && G.CUP ? G.CUP.weekTies(st, st.round + 1).find(t => !t.res && (t.h === c.id || t.a === c.id)) : null;
    return { cup: f.cup ? f : null, env: matchEnv(st, f), nextCup: next ? { f: next, opp: club(st, next.h === c.id ? next.a : next.h), name: G.CUP.roundName(st, next) } : null };
  }
  /* Восстановление свежести за неделю */
  function recovery(p) { return 24 + p.a.sta * 0.9 + ((p.h ? p.h.pro : 10) - 10) * 0.5; }
  /* Играет ли клуб матч лиги на этой неделе */
  function hasLeagueMatch(st, c) { const fx = st.leagues[c.league] && st.leagues[c.league].fixtures[st.round]; return !!(fx && fx.some(f => f.h === c.id || f.a === c.id)); }
  function weeks(st) { return st.weeks || st.fixtures.length; }
  /* Ключевые недели сезона (в долях его длины — работает для любой длины календаря) */
  function cal(st) {
    const W = weeks(st), at = f => Math.round(W * f);
    return {
      weeks: W,
      summerEnd: Math.floor(W * 0.066),            // окно открыто, пока round <= summerEnd
      winter: [Math.ceil(W * 0.47), Math.floor(W * 0.53)],
      remind: [at(0.63), at(0.84)],
      retire: at(0.79),
      sacks: [at(0.32), at(0.53), at(0.74)],
      boardMin: at(0.21),
      freeEvery: Math.max(3, at(0.1))
    };
  }
  /* Номер тура лиги для недели (пауза → null) */
  function roundOf(st, lid, week) {
    const fx = st.leagues[lid || st.lg].fixtures;
    if (week == null) week = st.round;
    let n = 0;
    for (let i = 0; i <= Math.min(week, fx.length - 1); i++) if (fx[i].length && !fx[i][0].po) n++;
    return fx[week] && fx[week].length && !fx[week][0].po ? n : null;
  }
  function roundsTotal(st, lid) { return st.leagues[lid || st.lg].rounds || st.leagues[lid || st.lg].fixtures.filter(r => r.length).length; }
  function weekLabel(st, lid, week) {
    lid = lid || st.lg; if (week == null) week = st.round;
    const fx = st.leagues[lid].fixtures[week];
    if (fx && fx.length && fx[0].po) return fx[0].po === 'final' ? 'Финал плей-офф' : 'Полуфиналы плей-офф';
    const r = roundOf(st, lid, week);
    return r ? `Тур ${r}/${roundsTotal(st, lid)}` : 'Пауза в лиге';
  }
  /* Все матчи недели во всех лигах */
  function weekFixtures(st, week) {
    if (week == null) week = st.round;
    const out = G.CUP ? G.CUP.weekTies(st, week).slice() : []; // кубок — в середине недели, до матчей лиги
    for (const lid of leagueIds(st)) (st.leagues[lid].fixtures[week] || []).forEach(f => out.push(f));
    return out;
  }
  /* Сколько матчей клуб сыграл бы в неделях [from, to) */
  function clubMatches(st, cid, from, to) {
    const c = club(st, cid); if (!c) return 0;
    const fx = st.leagues[c.league] ? st.leagues[c.league].fixtures : [];
    let n = 0;
    for (let w = Math.max(0, from); w < Math.min(to, fx.length); w++) if (fx[w].some(f => f.h === cid || f.a === cid)) n++;
    return n;
  }

  /* Условия матча: погода (зимой — чаще дождь, тяжёлое поле и снег) и заполняемость стадиона.
     Определяются один раз и сохраняются в матче */
  function matchEnv(st, f) {
    if (f.env) return f.env;
    const x = st.round / Math.max(1, weeks(st) - 1), w = Math.exp(-Math.pow((x - 0.5) / 0.2, 2));
    const P = { clear: 0.55 - 0.3 * w, rain: 0.22 + 0.08 * w, wind: 0.12, heavy: 0.03 + 0.12 * w, snow: 0.08 * w };
    const H = club(st, f.h);
    f.env = { weather: U.pickWeighted(Object.keys(P), k => P[k]), neutral: !!f.neutral, cap: f.neutral ? 90 : (H.cap || 30), derby: isDerby(st, f.h, f.a), fans: Math.round(G.FIN.fans(H)) };
    if (f.neutral) { f.env.fill = Math.round(U.clamp(0.8 + U.rnd() * 0.2, 0.8, 1) * 1000) / 1000; f.env.tp = 1; return f.env; }
    // спрос, чувствительность к цене и выбор цены (ИИ — сам, пользователь — цена по умолчанию, можно изменить перед матчем)
    const imp = importance(st, f, H);
    f.env.imp = Math.round(imp * 100) / 100;
    f.env.dem = Math.round(G.FIN.matchDemand(st, f, imp) * 1000) / 1000;
    f.env.k = Math.round(G.FIN.elastic(H, imp) * 1000) / 1000;
    const m = H.id === st.userClub ? (st.ticketM || 1) : G.FIN.aiPrice(st, f, imp);
    G.FIN.setPrice(st, f, m);
    return f.env;
  }
  /* Дерби: клубы одного города и исторические соперники */
  const RIVALS = [['new', 'sun'], ['nfo', 'der'], ['ips', 'nor'], ['wba', 'wol'], ['avl', 'bir'], ['por', 'sou'], ['bla', 'bur'], ['lee', 'hud'], ['bri', 'car'], ['swa', 'car'], ['bol', 'wig'], ['bla', 'blp'], ['pne', 'blp'], ['lut', 'wat'], ['cov', 'lei'], ['bha', 'cry'], ['mid', 'sun'], ['ply', 'exe'], ['rea', 'oxf'], ['sto', 'pva'], ['bar', 'shw'], ['bar', 'rot'], ['don', 'rot'], ['mil', 'whu'], ['mid', 'new']];
  function isDerby(st, a, b) {
    const A = club(st, a), B = club(st, b);
    if (!A || !B) return false;
    return (A.city && A.city === B.city) || RIVALS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }
  /* Важность матча для клуба (0..1): стадия сезона, борьба за титул/повышение/выживание, кубковый раунд, соперник */
  function importance(st, f, c) {
    if (f.cup) return f.neutral ? 1 : U.clamp(0.3 + (f.cr || 0) * 0.12, 0, 1);
    if (f.po) return 1;
    const t = standings(st, c.league), N = t.length, i = t.findIndex(r => r.id === c.id), x = st.round / Math.max(1, weeks(st) - 1);
    const Z = (DATA.LEAGUES[c.league] || {}).zones || {}, me = t[i];
    let imp = 0.15 + 0.35 * x;
    const top = Z.cl || Z.up || 1;
    if (me.pts >= t[Math.min(N - 1, top - 1)].pts - 6) imp += 0.3 * (0.4 + x);
    if (Z.rel && i >= N - Z.rel - 3) imp += 0.3 * (0.4 + x);
    if (Z.po && i < Z.po + 2 && i >= (Z.up || 0)) imp += 0.15 * (0.4 + x);
    const opp = club(st, f.h === c.id ? f.a : f.h);
    if (opp && G.FIN.pres(opp) >= 75) imp += 0.1;
    if (isDerby(st, f.h, f.a)) imp += 0.25;
    return U.clamp(imp, 0, 1);
  }

  /* ---------- плей-офф ---------- */
  function winner(f) {
    if (!f.res) return null;
    if (f.res.hs !== f.res.as) return f.res.hs > f.res.as ? f.h : f.a;
    return f.res.pen === 'a' ? f.a : f.h;
  }
  function playoffStep(st) {
    for (const lid of leagueIds(st)) {
      const L = DATA.LEAGUES[lid];
      if (!L || !L.playoff) continue;
      const fx = st.leagues[lid].fixtures, W = fx.length;
      if (st.round === W - 2 && !fx[W - 2].length) {
        const t = standings(st, lid), s = i => t[i - 1].id;
        fx[W - 2] = [{ h: s(3), a: s(6), po: 'semi', res: null }, { h: s(4), a: s(5), po: 'semi', res: null }];
        st.news.push({ r: st.round, text: `🎟 Плей-офф ${L.name}: ${club(st, s(3)).name} — ${club(st, s(6)).name}, ${club(st, s(4)).name} — ${club(st, s(5)).name}. Победитель финала выходит в ${(above(lid) || L).acc}!` });
      }
      if (st.round === W - 1 && !fx[W - 1].length && fx[W - 2].length) {
        const [a, b] = fx[W - 2].map(winner);
        const t = standings(st, lid), pos = id => t.findIndex(r => r.id === id);
        const h = pos(a) < pos(b) ? a : b, aw = h === a ? b : a;
        fx[W - 1] = [{ h, a: aw, po: 'final', res: null }];
        st.news.push({ r: st.round, text: `🏟 Финал плей-офф ${L.name} на «Уэмбли»: «${club(st, h).name}» — «${club(st, aw).name}».${L.tier === 2 ? ' Самый дорогой матч в мире футбола!' : ''}` });
      }
    }
  }

  function newGame(opts) {
    const clubs = opts.world || DATA.createWorld(opts.seed || Math.floor(Math.random() * 1e9));
    const lids = DATA.LEAGUE_ORDER.filter(id => clubs.some(c => c.league === id));
    const user = opts.clubId ? clubs.find(c => c.id === opts.clubId) : null;
    const lid = user ? user.league : (opts.league || lids[0]);
    const st = {
      v: 2, mode: opts.mode, userClub: opts.clubId || null,
      season: 1, seasonName: '2025/26', round: 0,
      lg: lid, leagues: {},
      clubs,
      settings: { turns: opts.turns || 24, speed: 1, sound: true },
      userTactics: null, news: []
    };
    lids.forEach(id => { st.leagues[id] = { id, fixtures: [] }; });
    attach(st);
    buildCalendar(st);
    if (st.userClub) {
      const c = club(st, st.userClub);
      st.userTactics = TAC.defaultTactics(c);
      st.news.push({ r: 0, text: `Вы возглавили «${c.name}». Совет директоров ждёт результата!` });
    }
    G.FIN.init(st);
    G.CAR.ensure(st);
    track(st);
    return st;
  }

  function club(st, id) { return st.clubs.find(c => c.id === id); }

  function standings(st, lid) {
    lid = lid || st.lg;
    const rows = {};
    leagueClubs(st, lid).forEach(c => { rows[c.id] = { id: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; });
    st.leagues[lid].fixtures.forEach(rd => rd.forEach(f => {
      if (!f.res || f.po) return;
      const h = rows[f.h], a = rows[f.a], hs = f.res.hs, as = f.res.as;
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (hs < as) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }));
    const list = Object.values(rows);
    const D = st.ded || {};
    list.forEach(r => { r.gd = r.gf - r.ga; r.form = r.form.slice(-5); const d = D[st.season + ':' + r.id]; if (d) { r.pts -= d; r.ded = d; } });
    list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || club(st, x.id).name.localeCompare(club(st, y.id).name));
    return list;
  }

  /* Сборная тура: по каждой лиге и неделе храним лучших кандидатов на каждую линию;
     схема подбирается под них — та, что даёт наибольшую сумму оценок */
  const XI = { GK: 1, DF: 5, MF: 5, FW: 3 };
  const XI_SCHEMES = [[4, 3, 3], [4, 4, 2], [4, 5, 1], [3, 4, 3], [3, 5, 2], [5, 3, 2], [5, 4, 1]];
  function pickXI(c) {
    const sum = (arr, n) => arr.length >= n ? arr.slice(0, n).reduce((s, e) => s + e.r, 0) : -1e9;
    let best = null;
    XI_SCHEMES.forEach(([d, m, f], i) => {
      const v = sum(c.DF, d) + sum(c.MF, m) + sum(c.FW, f) - i * 1e-6;   // при равенстве — более привычная схема
      if (!best || v > best.v) best = { v, d, m, f };
    });
    const xi = [];
    const add = (pos, n) => c[pos].slice(0, n).forEach(e => xi.push(Object.assign({ pos }, e)));
    add('GK', 1); add('DF', best.d); add('MF', best.m); add('FW', best.f);
    return { scheme: `${best.d}-${best.m}-${best.f}`, xi };
  }
  function totwAdd(st, fixture, match) {
    const hc = club(st, fixture.h); if (!hc) return;
    const T = st.totw || (st.totw = { season: st.season, lg: {} });
    if (T.season !== st.season) { T.season = st.season; T.lg = {}; }
    const L = T.lg[hc.league] || (T.lg[hc.league] = {});
    const W = L[st.round] || (L[st.round] = { GK: [], DF: [], MF: [], FW: [] });
    for (const s of ['home', 'away']) for (const p of match.t[s].club.players) {
      if (!p.m || !p.m.played || !p.m.rating || !W[p.pos]) continue;
      const arr = W[p.pos];
      arr.push({ id: p.id, c: match.t[s].club.id, r: p.m.rating, g: p.m.goals, a: p.m.assists });
      arr.sort((x, y) => y.r - x.r || (y.g + y.a) - (x.g + x.a));
      arr.length = Math.min(arr.length, XI[p.pos]);
    }
  }
  /* Сборная тура лиги за неделю (или последнюю сыгранную) */
  function teamOfWeek(st, lid, week) {
    const L = st.totw && st.totw.season === st.season && st.totw.lg[lid];
    if (!L) return null;
    const weeks = Object.keys(L).map(Number).sort((a, b) => a - b);
    if (!weeks.length) return null;
    const w = week != null && L[week] ? week : weeks[weeks.length - 1];
    const t = pickXI(L[w]);
    return { week: w, weeks, xi: t.xi, scheme: t.scheme };
  }
  /* Сборная сезона: лучшие средние оценки в лиге (не меньше 40% сыгранных туров) */
  function teamOfSeason(st, lid) {
    const played = (standings(st, lid)[0] || { p: 0 }).p;
    const min = Math.max(1, Math.ceil(played * 0.4));
    const C = {};
    for (const pos of ['GK', 'DF', 'MF', 'FW']) {
      const cand = [];
      leagueClubs(st, lid).forEach(c => c.players.forEach(p => { if (p.pos === pos && p.st.apps >= min) cand.push({ id: p.id, c: c.id, r: p.st.rsum / p.st.apps, g: p.st.goals, a: p.st.assists, apps: p.st.apps }); }));
      C[pos] = cand.sort((x, y) => y.r - x.r || y.apps - x.apps).slice(0, XI[pos]);
    }
    if (!C.GK.length) return { played, min, xi: [] };
    const t = pickXI(C);
    return { played, min, xi: t.xi, scheme: t.scheme };
  }

  /* Учёт результата матча */
  function record(st, fixture, match) {
    const goals = match.goals.map(g => ({ side: g.side, min: g.min, scorer: g.scorer, assist: g.assist, kind: g.kind }));
    const stats = {};
    for (const s of ['home', 'away']) {
      const x = match.t[s].st;
      stats[s] = { shots: x.shots, onT: x.onT, xg: +x.xg.toFixed(2), poss: x.poss, corners: x.corners, fouls: x.fouls, yc: x.yc, rc: x.rc, wins: x.wins };
    }
    let motm = null;
    for (const s of ['home', 'away']) {
      const ts = match.t[s];
      for (const p of ts.club.players) {
        if (!p.m || !p.m.played) continue;
        if (p.m.played) {
          if (fixture.cup) { const cs = p.cst || (p.cst = { apps: 0, goals: 0, assists: 0, rsum: 0 }); cs.apps++; cs.goals += p.m.goals; cs.assists += p.m.assists; cs.rsum = (cs.rsum || 0) + (p.m.rating || TAC.ratingNorm(p)); }
          else {
            p.st.apps++; p.st.goals += p.m.goals; p.st.assists += p.m.assists;
            p.st.yc += p.m.yc; p.st.rsum += p.m.rating || TAC.ratingNorm(p);
          }
          p.lp = st.round;
          // дисквалификации раздельные: лига — за лигу, кубок — за кубок (3 жёлтые в кубке — пропуск матча)
          if (fixture.cup) {
            if (p.m.rc) { p.csusp = Math.max(p.csusp || 0, U.randInt(1, 2)); G.FIN.fines(st, ts.club, p); }
            else if (p.m.yc) { p.cyc = (p.cyc || 0) + p.m.yc; if (p.cyc >= 3) { p.csusp = Math.max(p.csusp || 0, 1); p.cyc = 0; } }
          } else {
            if (p.m.rc) { p.st.rc++; p.susp = Math.max(p.susp, U.randInt(1, 3)); G.FIN.fines(st, ts.club, p); }
            if (p.m.yc && !p.m.rc) { p.yc += p.m.yc; if (p.yc >= 5) { p.susp = Math.max(p.susp, 1); p.yc = 0; } }
          }
          if (p.m.inj) p.inj = Math.max(1, U.randInt(1, 4) + (p.h && p.h.pro >= 15 ? -1 : p.h && p.h.pro <= 6 ? 1 : 0));
          p.fit = Math.round(p.m.fit);
          p.lastR = (p.lastR || []).concat([p.m.rating || TAC.ratingNorm(p)]).slice(-5);
          p.form = TAC.computeForm(p);
          if (!motm || (p.m.rating || 0) > (motm.m.rating || 0)) motm = p;
        }
      }
    }
    // игрок матча получает небольшой прилив настроения
    if (motm && motm.mood != null) motm.mood = Math.min(100, motm.mood + 5);
    if (!fixture.cup && !fixture.po) totwAdd(st, fixture, match);
    fixture.res = { hs: match.score.home, as: match.score.away, goals, stats, motm: motm ? motm.name : null, motmR: motm ? motm.m.rating : null, watched: !!match.watched };
    // данные для повтора: снимок + журнал действий человека (в течение сезона)
    if (match.snap) fixture.rp = { season: st.season, s: match.snap, r: match.rec && match.rec.length ? match.rec : undefined };
    // плей-офф: ничья — серия пенальти (шанс зависит от силы и хладнокровия)
    if ((fixture.po || fixture.cup) && fixture.res.hs === fixture.res.as) {
      const ch = c => TAC.teamRating(c) + U.avg(c.players.map(p => p.a.com)) * 0.15;
      const H = match.t.home.club, A = match.t.away.club;
      const pH = U.clamp(0.5 + (ch(H) - ch(A)) * 0.05, 0.3, 0.7);
      fixture.res.pen = U.rnd() < pH ? 'h' : 'a';
      const w = fixture.res.pen === 'h' ? H : A;
      if (!fixture.cup || H.id === st.userClub || A.id === st.userClub || fixture.neutral) st.news.push({ r: st.round, text: `🎯 ${fixture.cup ? `${G.CUP.NAME}, ${G.CUP.roundName(st, fixture)}` : `${fixture.po === 'final' ? 'Финал' : 'Полуфинал'} плей-офф`}: ${H.name} ${fixture.res.hs}:${fixture.res.as} ${A.name}, в серии пенальти сильнее «${w.name}»!` });
    }
    const hc = club(st, fixture.h);
    G.FIN.matchday(st, fixture, standings(st, hc ? hc.league : st.lg));
    G.FIN.fansAfterMatch(st, fixture);
    // двойная неделя: между кубковым и лиговым матчем — половина недельного восстановления
    if (fixture.cup) for (const id of [fixture.h, fixture.a]) {
      const c = club(st, id);
      if (!hasLeagueMatch(st, c)) continue;
      c.dbl = st.round;
      c.players.forEach(p => { p.fit = Math.min(100, p.fit + recovery(p) / 2); });
    }
    // очистка временных данных
    for (const s of ['home', 'away']) match.t[s].club.players.forEach(p => { delete p.m; });
  }

  /* Переход к следующему туру: восстановление, травмы, дисквалификации */
  function advance(st) {
    const rd = weekFixtures(st);
    const playedLeague = new Set(), playedCup = new Set();
    rd.forEach(f => { const s = f.cup ? playedCup : playedLeague; s.add(f.h); s.add(f.a); });
    st.clubs.forEach(c => c.players.forEach(p => {
      p.fit = Math.min(100, p.fit + recovery(p) * (c.dbl === st.round ? 0.5 : 1));
      if (p.inj > 0) p.inj--;
      if (p.susp > 0 && playedLeague.has(c.id)) p.susp--;
      if (p.csusp > 0 && playedCup.has(c.id)) p.csusp--;
    }));
    G.FIN.round(st);
    st.round++;
    if (G.CUP) G.CUP.after(st, st.round - 1);
    track(st);
    playoffStep(st);
    if (G.TR) G.TR.afterRound(st);
    G.CAR.afterRound(st);
    if (st.userClub) fixUserTactics(st);
  }

  /* ---------- история для графиков ----------
     Каждую неделю — снимок по всем клубам: баланс, место в лиге и в пирамиде, очки, стоимость состава,
     зарплаты, престиж, болельщики; для клуба пользователя — доверие совета. Хранятся последние 5 сезонов */
  const TRK_KEYS = ['bal', 'pos', 'rank', 'pts', 'val', 'wage', 'pres', 'fans', 'tier'];
  const TRK_MAX = 5 * 49;
  function track(st) {
    const T = st.trk || (st.trk = { t: [], c: {}, conf: [] });
    T.t.push(st.season * 100 + st.round);
    const n = T.t.length, info = {};
    let offset = 0;
    for (const lid of leagueIds(st)) {
      const t = standings(st, lid);
      t.forEach((r, i) => { info[r.id] = { pos: i + 1, rank: offset + i + 1, pts: r.pts }; });
      offset += t.length;
    }
    const r1 = v => Math.round(v * 10) / 10;
    for (const c of st.clubs) {
      const s = T.c[c.id] || (T.c[c.id] = {});
      TRK_KEYS.forEach(k => { s[k] = s[k] || []; while (s[k].length < n - 1) s[k].push(null); });
      const x = info[c.id] || {}, started = st.round > 0;
      s.bal.push(c.fin ? r1(c.fin.balance) : null);
      s.pos.push(started ? x.pos : null); s.rank.push(started ? x.rank : null); s.pts.push(started ? x.pts : 0);
      s.val.push(c.fin ? Math.round(G.FIN.squadValue(c)) : null);
      s.wage.push(c.fin ? G.FIN.wageBill(c) : null);
      s.pres.push(r1(G.FIN.pres(c))); s.fans.push(r1(G.FIN.fans(c))); s.tier.push(tier(c));
    }
    T.conf.push(st.board && st.userClub ? Math.round(st.board.conf) : null);
    if (n > TRK_MAX) {
      const cut = n - TRK_MAX;
      T.t.splice(0, cut); T.conf.splice(0, cut);
      for (const id in T.c) TRK_KEYS.forEach(k => T.c[id][k] && T.c[id][k].splice(0, cut));
    }
  }

  /* Если в составе игрока травмы/дисквалификации — заменить автоматически */
  function fixUserTactics(st, tac) {
    const c = club(st, st.userClub);
    const t = tac || st.userTactics;
    const map = TAC.playerMap(c);
    const bad = t.lineup.some(id => !map[id] || !TAC.available(map[id]));
    const msgs = [];
    if (bad) {
      const used = new Set(t.lineup.filter(id => map[id] && TAC.available(map[id])));
      const slots = TAC.FORMATIONS[t.formation];
      t.lineup = t.lineup.map((id, i) => {
        if (map[id] && TAC.available(map[id])) return id;
        const cands = c.players.filter(p => TAC.available(p) && !used.has(p.id)).sort((a, b) => TAC.roleRating(b, slots[i].role) - TAC.roleRating(a, slots[i].role));
        if (map[id]) msgs.push(`${map[id].name} не может сыграть (${map[id].inj > 0 ? 'травма' : 'дисквалификация'}) — заменён на ${cands[0] ? cands[0].name : '—'}.`);
        if (cands[0]) { used.add(cands[0].id); return cands[0].id; }
        return null;
      });
    }
    const inXI = new Set(t.lineup);
    t.bench = t.bench.filter(id => map[id] && TAC.available(map[id]) && !inXI.has(id));
    const rest = c.players.filter(p => TAC.available(p) && !inXI.has(p.id) && !t.bench.includes(p.id)).sort((a, b) => TAC.overall(b) - TAC.overall(a));
    while (t.bench.length < 9 && rest.length) t.bench.push(rest.shift().id);
    if (t === st.userTactics) msgs.forEach(m => st.news.push({ r: st.round, text: m }));
    return msgs;
  }

  function seasonOver(st) { return st.round >= weeks(st); }

  /* Итоги сезона: чемпионы, вылет и повышение */
  function seasonSummary(st) {
    const out = { champions: {}, promoted: [], relegated: [], playoff: null, playoffs: {} };
    const ids = leagueIds(st);
    ids.forEach(lid => { const t = standings(st, lid); out.champions[lid] = t[0] ? t[0].id : null; });
    for (let i = 0; i < ids.length - 1; i++) {
      const up = DATA.LEAGUES[ids[i]], low = DATA.LEAGUES[ids[i + 1]];
      if (!up || !low) continue;
      const tu = standings(st, up.id), tl = standings(st, low.id);
      const down = up.relegate ? tu.slice(-up.relegate).map(r => r.id) : [];
      const rise = tl.slice(0, low.promote || 2).map(r => r.id);
      const fx = st.leagues[low.id].fixtures, fin = fx[fx.length - 1] && fx[fx.length - 1][0];
      const po = fin && fin.po === 'final' ? winner(fin) : (tl[low.promote || 2] ? tl[low.promote || 2].id : null);
      if (po) { rise.push(po); out.playoffs[low.id] = po; if (!out.playoff) out.playoff = po; }
      down.forEach(id => out.relegated.push({ id, from: up.id, to: low.id }));
      rise.forEach(id => out.promoted.push({ id, from: low.id, to: up.id }));
    }
    return out;
  }

  /* Перевод клубов между лигами */
  function moveClubs(st, sum) {
    const W = weeks(st);
    for (const r of sum.relegated) {
      const c = club(st, r.id); c.league = r.to; c.str = Math.max(8, c.str - 0.4);
      const P = DATA.LEAGUES[r.to].fin.parachute;
      if (P && c.fin) c.fin.para = P.slice();
      // пункт о вылете в контрактах: зарплаты −25%
      c.players.forEach(p => { p.wage = Math.round(p.wage * 0.75); if (p.h && p.h.amb >= 13) p.mood = Math.max(0, (p.mood || 60) - 15); });
      if (c.id === st.userClub) st.news.push({ r: 0, text: `⬇ «${c.name}» вылетает в ${DATA.LEAGUES[r.to].acc}. По условиям контрактов зарплаты снижены на 25%, «парашютные» выплаты помогут пережить удар. Амбициозные игроки расстроены.` });
    }
    for (const r of sum.promoted) {
      const c = club(st, r.id); c.league = r.to; c.str = c.str + 0.4; if (c.fin) c.fin.para = null;
      if (c.id === st.userClub) st.news.push({ r: 0, text: `⬆ «${c.name}» выходит в ${DATA.LEAGUES[r.to].acc}! Впереди — большие деньги и сильнейшие соперники.` });
    }
    void W;
  }

  /* Лиги из реестра, которых нет в старом сохранении, появляются с нового сезона */
  function addMissingLeagues(st) {
    const added = [];
    for (const lid of DATA.LEAGUE_ORDER) {
      if (st.leagues[lid] || st.clubs.some(c => c.league === lid)) continue;
      const used = new Set(); st.clubs.forEach(c => c.players.forEach(p => used.add(p.name)));
      const rng = U.seeded(Math.floor(Math.random() * 1e9));
      DATA.LEAGUES[lid].clubs.forEach(c => { if (!club(st, c.id)) st.clubs.push(DATA.makeClub(c, DATA.LEAGUES[lid], rng, used)); });
      st.leagues[lid] = { id: lid, fixtures: [] };
      added.push(lid);
    }
    if (added.length) { G.FIN.init(st); G.CAR.ensure(st); st.news.push({ r: 0, text: `🌍 Новый турнир в игре: ${added.map(l => DATA.LEAGUES[l].name).join(', ')}.` }); }
  }

  function newSeason(st) {
    st.coachArc = {};   // архив тренеров нужен только для повторов текущего сезона
    const sum = seasonSummary(st);
    const table = standings(st);
    st.history = st.history || [];
    st.history.push({ season: st.seasonName, cup: st.cup && st.cup.season === st.season ? st.cup.winner : null, champion: table[0].id, champions: sum.champions, promoted: sum.promoted.map(x => x.id), relegated: sum.relegated.map(x => x.id), playoff: sum.playoff, playoffs: sum.playoffs, lg: st.lg, user: st.userClub ? table.findIndex(r => r.id === st.userClub) + 1 : null });
    st.lastSummary = sum;
    if (G.TR) G.TR.endLoans(st);
    G.CAR.retire(st);
    G.FIN.seasonEnd(st, table, sum);
    moveClubs(st, sum);
    addMissingLeagues(st);
    if (st.userClub) st.lg = club(st, st.userClub).league;
    st.season++;
    const y = 2024 + st.season;
    st.seasonName = y + '/' + String(y + 1).slice(2);
    st.round = 0;
    buildCalendar(st);
    const devs = [];
    st.clubs.forEach(c => c.players.forEach(p => {
      p.age++;
      const d = develop(p);
      devs.push({ p, c, d });
      p.lastR = (p.lastR || []).slice(-2); // в новый сезон переносятся только 2 последние оценки
      p.form = TAC.computeForm(p);
      p.fit = 100; p.inj = 0; p.susp = 0; p.yc = 0; p.csusp = 0; p.cyc = 0;
      p.st = { apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, rsum: 0 }; p.cst = null;
    }));
    // новости межсезонья
    const pool = st.userClub ? devs.filter(x => x.c.id === st.userClub) : devs;
    const up = pool.filter(x => x.d.total > 0).sort((a, b) => b.d.total - a.d.total).slice(0, 3);
    const down = pool.filter(x => x.d.total < 0).sort((a, b) => a.d.total - b.d.total).slice(0, 3);
    if (up.length) st.news.push({ r: 0, text: '📈 Прогресс за межсезонье: ' + up.map(x => `${x.p.name} (+${x.d.total}${x.d.avg ? ', ср. ' + x.d.avg.toFixed(2) : ''})`).join(', ') + '.' });
    if (down.length) st.news.push({ r: 0, text: '📉 Сдали: ' + down.map(x => `${x.p.name} (${x.d.total}${x.d.avg ? ', ср. ' + x.d.avg.toFixed(2) : ''})`).join(', ') + '.' });
    G.CAR.academy(st);
    G.CAR.aiFree(st, true);
    G.CAR.trimAI(st);
    G.FIN.seasonStart(st);
    if (G.TR) { const m = G.TR.market(st); m.neg = {}; m.offers = []; G.TR.afterRound(st); }
    if (st.userClub) fixUserTactics(st);
    track(st);
  }

  /* Развитие игрока за межсезонье: возраст + средняя оценка + игровое время */
  function develop(p) {
    // кубковые матчи тоже идут в зачёт: в игровое время — с коэффициентом 0.8
    const capps = p.cst ? p.cst.apps : 0, crs = p.cst ? (p.cst.rsum || capps * TAC.ratingNorm(p)) : 0;
    const apps = p.st.apps + capps, avg = apps ? (p.st.rsum + crs) / apps : null;
    const nrm = TAC.ratingNorm(p);   // пороги — относительно типичной оценки для позиции
    const grade = apps < 5 ? 'few' : avg > nrm + 0.45 ? 'good' : avg < nrm - 0.3 ? 'bad' : 'ok';
    const play = U.clamp((p.st.apps + capps * 0.8) / 19, 0.25, 1);
    const pro = p.h ? p.h.pro : 10;
    const loanK = p.loanExp >= 15 ? 1.25 : p.loanExp >= 8 ? 1.1 : 1; // практика в аренде ускоряет рост
    // потенциал: чем больше запас до потолка, тем быстрее растут молодые
    const head = (p.pot == null ? TAC.overall(p) + 2 : p.pot) - TAC.overall(p);
    const potK = p.age <= 24 ? U.clamp(0.5 + head * 0.15, 0.35, 1.6) : 1;
    p.loanExp = 0;
    const perfK = { good: 1.5, ok: 1, bad: 0.55, few: 0.8 }[grade] * (0.8 + pro * 0.02) * loanK * potK;
    let total = 0;
    for (const k in p.a) {
      if (k === 'ref' && p.pos !== 'GK') continue;
      let delta = 0;
      if (p.age <= 23) {
        if (U.chance(0.45 * (0.5 + 0.5 * play) * perfK)) delta = grade === 'good' && U.chance(0.25) ? 2 : 1;
        if (grade === 'bad' && U.chance(0.08)) delta -= 1;
      } else if (p.age <= 30) {
        if (grade === 'good' && U.chance(0.2 * play)) delta = 1;
        if (grade === 'bad' && U.chance(0.12)) delta = -1;
      } else {
        const declK = { good: 0.5, ok: 1, bad: 1.4, few: 1.15 }[grade] * (1.3 - pro * 0.03);
        if (U.chance(0.45 * declK)) delta = -1;
      }
      if (U.chance(0.12)) delta += U.randInt(-1, 1);
      const nv = U.clamp(p.a[k] + delta, 1, 20);
      total += nv - p.a[k];
      p.a[k] = nv;
    }
    p.dev = { total, avg, apps, grade };
    return p.dev;
  }

  function topScorers(st, n, lid) {
    const all = [];
    st.clubs.forEach(c => { if (lid && c.league !== lid) return; c.players.forEach(p => { if (p.st.goals || p.st.assists) all.push({ p, c }); }); });
    return all.sort((a, b) => b.p.st.goals - a.p.st.goals || b.p.st.assists - a.p.st.assists).slice(0, n || 15);
  }

  /* ---------- сохранение ---------- */
  const serialize = st => JSON.stringify(st, (k, v) => (k === 'm' || k[0] === '_') ? undefined : v);
  function save(st) {
    try { if (G.STORE) G.STORE.save(serialize(st)); else localStorage.setItem('match3-manager-save-v1', serialize(st)); return true; } catch (e) { return false; }
  }
  /* Разбор и миграция сохранения (v1 → v2: лиги) */
  function revive(json) {
    if (!json) return null;
    const st = JSON.parse(json);
    if (!st || (st.v !== 1 && st.v !== 2)) return null;
    if (st.v === 1) { st.lg = 'eng1'; st.clubs.forEach(c => { c.league = 'eng1'; }); st.v = 2; }
    st.clubs.forEach(c => { if (!c.league) c.league = st.lg; if (c.cap == null) c.cap = DATA.CAPACITY[c.id] || 30; });
    attach(st);
    if (G.TRAITS) { G.TRAITS.ensure(st.clubs); if (st.fa) G.TRAITS.ensure([{ players: st.fa }]); }
    // форма пересчитывается всегда: точка отсчёта — типичная оценка позиции (могла измениться между версиями)
    st.clubs.forEach(c => c.players.forEach(p => { if (!p.lastR) p.lastR = []; p.form = TAC.computeForm(p); }));
    (st.fa || []).forEach(p => { if (!p.lastR) p.lastR = []; p.form = TAC.computeForm(p); });
    G.FIN.init(st);
    G.CAR.ensure(st);
    return st;
  }
  async function load() {
    try { return revive(G.STORE ? await G.STORE.load() : localStorage.getItem('match3-manager-save-v1')); } catch (e) { console.warn('load failed', e); return null; }
  }
  async function hasSave() { try { return G.STORE ? await G.STORE.has() : !!localStorage.getItem('match3-manager-save-v1'); } catch (e) { return false; } }
  async function clearSave() { if (G.STORE) await G.STORE.clear(); }
  async function exportSave(st) { await G.STORE.exportFile(serialize(st), `kombinaciya-${st.seasonName.replace('/', '-')}-tur${st.round + 1}`); }
  async function importSave(file) { const st = revive(await G.STORE.importFile(file)); if (!st) throw new Error('Файл не похож на сохранение игры'); save(st); return st; }

  G.LEAGUE = { teamOfWeek, teamOfSeason, track, isDerby, importance, prepOpts, matchEnv, leagueIds, tier, above, buildCalendar, weeks, cal, roundOf, roundsTotal, weekLabel, weekFixtures, clubMatches, winner, seasonSummary, leagueClubs, leagueInfo, attach, serialize, revive, exportSave, importSave, newGame, club, standings, record, advance, fixUserTactics, seasonOver, newSeason, topScorers, save, load, hasSave, clearSave, schedule };
})(typeof window !== 'undefined' ? window : globalThis);
