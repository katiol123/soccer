/* Чемпионат Англии: календарь, таблица, статистика, сохранение */
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

  function newGame(opts) {
    const clubs = DATA.createWorld(opts.seed || Math.floor(Math.random() * 1e9));
    const ids = U.shuffle(clubs.map(c => c.id));
    const st = {
      v: 1, mode: opts.mode, userClub: opts.clubId || null,
      season: 1, seasonName: '2025/26', round: 0,
      clubs, fixtures: schedule(ids),
      settings: { turns: opts.turns || 24, speed: 1, sound: true },
      userTactics: null, news: []
    };
    if (st.userClub) {
      const c = club(st, st.userClub);
      st.userTactics = TAC.defaultTactics(c);
      st.news.push({ r: 0, text: `Вы возглавили «${c.name}». Совет директоров ждёт результата!` });
    }
    G.FIN.init(st);
    return st;
  }

  function club(st, id) { return st.clubs.find(c => c.id === id); }

  function standings(st) {
    const rows = {};
    st.clubs.forEach(c => { rows[c.id] = { id: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; });
    st.fixtures.forEach(rd => rd.forEach(f => {
      if (!f.res) return;
      const h = rows[f.h], a = rows[f.a], hs = f.res.hs, as = f.res.as;
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (hs < as) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }));
    const list = Object.values(rows);
    list.forEach(r => { r.gd = r.gf - r.ga; r.form = r.form.slice(-5); });
    list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || club(st, x.id).name.localeCompare(club(st, y.id).name));
    return list;
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
          p.st.apps++; p.st.goals += p.m.goals; p.st.assists += p.m.assists;
          p.st.yc += p.m.yc; p.st.rsum += p.m.rating || 6.5;
          p.lp = st.round;
          if (p.m.rc) { p.st.rc++; p.susp = Math.max(p.susp, U.randInt(1, 3)); G.FIN.fines(st, ts.club, p); }
          if (p.m.yc && !p.m.rc) { p.yc += p.m.yc; if (p.yc >= 5) { p.susp = Math.max(p.susp, 1); p.yc = 0; } }
          if (p.m.inj) p.inj = Math.max(1, U.randInt(1, 4) + (p.h && p.h.pro >= 15 ? -1 : p.h && p.h.pro <= 6 ? 1 : 0));
          p.fit = Math.round(p.m.fit);
          p.lastR = (p.lastR || []).concat([p.m.rating || 6.5]).slice(-5);
          p.form = TAC.computeForm(p);
          if (!motm || (p.m.rating || 0) > (motm.m.rating || 0)) motm = p;
        }
      }
    }
    fixture.res = { hs: match.score.home, as: match.score.away, goals, stats, motm: motm ? motm.name : null, motmR: motm ? motm.m.rating : null, watched: !!match.watched };
    G.FIN.matchday(st, fixture, standings(st));
    // очистка временных данных
    for (const s of ['home', 'away']) match.t[s].club.players.forEach(p => { delete p.m; });
  }

  /* Переход к следующему туру: восстановление, травмы, дисквалификации */
  function advance(st) {
    const rd = st.fixtures[st.round];
    const playedClubs = new Set();
    rd.forEach(f => { playedClubs.add(f.h); playedClubs.add(f.a); });
    st.clubs.forEach(c => c.players.forEach(p => {
      p.fit = Math.min(100, p.fit + 24 + p.a.sta * 0.9 + ((p.h ? p.h.pro : 10) - 10) * 0.5);
      if (p.inj > 0) p.inj--;
      if (p.susp > 0 && playedClubs.has(c.id)) p.susp--;
    }));
    G.FIN.round(st);
    st.round++;
    if (st.userClub) fixUserTactics(st);
  }

  /* Если в составе игрока травмы/дисквалификации — заменить автоматически */
  function fixUserTactics(st) {
    const c = club(st, st.userClub);
    const t = st.userTactics;
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
    msgs.forEach(m => st.news.push({ r: st.round, text: m }));
    return msgs;
  }

  function seasonOver(st) { return st.round >= st.fixtures.length; }

  function newSeason(st) {
    const table = standings(st);
    st.history = st.history || [];
    st.history.push({ season: st.seasonName, champion: table[0].id, user: st.userClub ? table.findIndex(r => r.id === st.userClub) + 1 : null });
    G.FIN.seasonEnd(st, table);
    st.season++;
    const y = 2024 + st.season;
    st.seasonName = y + '/' + String(y + 1).slice(2);
    st.round = 0;
    st.fixtures = schedule(U.shuffle(st.clubs.map(c => c.id)));
    const devs = [];
    st.clubs.forEach(c => c.players.forEach(p => {
      p.age++;
      const d = develop(p);
      devs.push({ p, c, d });
      p.lastR = (p.lastR || []).slice(-2); // в новый сезон переносятся только 2 последние оценки
      p.form = TAC.computeForm(p);
      p.fit = 100; p.inj = 0; p.susp = 0; p.yc = 0;
      p.st = { apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, rsum: 0 };
    }));
    // новости межсезонья
    const pool = st.userClub ? devs.filter(x => x.c.id === st.userClub) : devs;
    const up = pool.filter(x => x.d.total > 0).sort((a, b) => b.d.total - a.d.total).slice(0, 3);
    const down = pool.filter(x => x.d.total < 0).sort((a, b) => a.d.total - b.d.total).slice(0, 3);
    if (up.length) st.news.push({ r: 0, text: '📈 Прогресс за межсезонье: ' + up.map(x => `${x.p.name} (+${x.d.total}${x.d.avg ? ', ср. ' + x.d.avg.toFixed(2) : ''})`).join(', ') + '.' });
    if (down.length) st.news.push({ r: 0, text: '📉 Сдали: ' + down.map(x => `${x.p.name} (${x.d.total}${x.d.avg ? ', ср. ' + x.d.avg.toFixed(2) : ''})`).join(', ') + '.' });
    G.FIN.seasonStart(st);
    if (st.userClub) fixUserTactics(st);
  }

  /* Развитие игрока за межсезонье: возраст + средняя оценка + игровое время */
  function develop(p) {
    const apps = p.st.apps, avg = apps ? p.st.rsum / apps : null;
    const grade = apps < 5 ? 'few' : avg > 7.0 ? 'good' : avg < 6.3 ? 'bad' : 'ok';
    const play = U.clamp(apps / 19, 0.25, 1);
    const pro = p.h ? p.h.pro : 10;
    const perfK = { good: 1.5, ok: 1, bad: 0.55, few: 0.8 }[grade] * (0.8 + pro * 0.02);
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

  function topScorers(st, n) {
    const all = [];
    st.clubs.forEach(c => c.players.forEach(p => { if (p.st.goals || p.st.assists) all.push({ p, c }); }));
    return all.sort((a, b) => b.p.st.goals - a.p.st.goals || b.p.st.assists - a.p.st.assists).slice(0, n || 15);
  }

  function save(st) {
    try {
      const s = JSON.stringify(st, (k, v) => (k === 'm' || k[0] === '_') ? undefined : v);
      localStorage.setItem(SAVE_KEY, s);
      return true;
    } catch (e) { return false; }
  }
  function load() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      const st = JSON.parse(s);
      if (!st || st.v !== 1) return null;
      if (G.TRAITS) G.TRAITS.ensure(st.clubs);
      st.clubs.forEach(c => c.players.forEach(p => { if (!p.lastR) { p.lastR = []; p.form = TAC.computeForm(p); } }));
      G.FIN.init(st);
      return st;
    } catch (e) { return null; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } }

  G.LEAGUE = { newGame, club, standings, record, advance, fixUserTactics, seasonOver, newSeason, topScorers, save, load, hasSave, clearSave, schedule };
})(typeof window !== 'undefined' ? window : globalThis);
