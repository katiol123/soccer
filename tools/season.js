// Симуляция сезонов всех лиг: node tools/season.js [сезонов=1]
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math, Date, JSON, setTimeout }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['util', 'traits', 'data', 'tactics', 'finance', 'transfers', 'career', 'board', 'engine', 'ai', 'league'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx, { filename: f });
const { LEAGUE, AI, ENGINE, TAC, FIN, DATA } = ctx;
const N = +process.argv[2] || 1;
const st = LEAGUE.newGame({ mode: 'spectator', seed: 7 });
for (let s = 0; s < N; s++) {
  const t0 = Date.now();
  while (!LEAGUE.seasonOver(st)) {
    for (const f of LEAGUE.weekFixtures(st)) {
      const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
      const m = new ENGINE.Match({ home: { club: h, tactics: AI.prepare(h, a, true) }, away: { club: a, tactics: AI.prepare(a, h, false) }, turns: st.settings.turns });
      m.simulate(); LEAGUE.record(st, f, m);
    }
    LEAGUE.advance(st);
  }
  console.log(`\n=== ${st.seasonName}: ${st.weeks} недель за ${Date.now() - t0} мс ===`);
  for (const lid of LEAGUE.leagueIds(st)) {
    console.log(`-- ${DATA.LEAGUES[lid].name}`);
    LEAGUE.standings(st, lid).forEach((r, i) => { const c = LEAGUE.club(st, r.id); console.log(String(i + 1).padStart(2), c.name.padEnd(20), c.str.toFixed(1), TAC.teamRating(c).toFixed(1), r.p, r.w, r.d, r.l, (r.gf + ':' + r.ga).padEnd(7), String(r.pts).padStart(3), 'бал', c.fin.balance.toFixed(0).padStart(5), 'зп', String(FIN.wageBill(c)).padStart(5), '/', c.fin.wageBudget, 'игр', c.players.length); });
  }
  const sum = LEAGUE.seasonSummary(st);
  console.log('Повышение:', sum.promoted.map(x => LEAGUE.club(st, x.id).name).join(', '), '| плей-офф:', sum.playoff && LEAGUE.club(st, sum.playoff).name, '| вылет:', sum.relegated.map(x => LEAGUE.club(st, x.id).name).join(', '));
  const po = ['eng2', 'eng3'].filter(l => st.leagues[l]).flatMap(l => st.leagues[l].fixtures.slice(-2).flat()).map(f => `${LEAGUE.club(st, f.h).short} ${f.res.hs}:${f.res.as}${f.res.pen ? ' пен.' + f.res.pen : ''} ${LEAGUE.club(st, f.a).short}`);
  console.log('Плей-офф:', po.join(', '));
  LEAGUE.newSeason(st);
  const prof = lid => { const cs = LEAGUE.leagueClubs(st, lid); return cs.map(c => c.fin.last.profit); };
  for (const lid of LEAGUE.leagueIds(st)) { const p = st.clubs.filter(c => c.fin.last && LEAGUE.tier(c)).map(c => c); void p; }
  st.clubs.forEach(c => { if (c.fin.para) console.log('  парашют', c.name, c.league, JSON.stringify(c.fin.para)); });
  const L = st.clubs.map(c => ({ n: c.name, lg: c.league, pr: c.fin.last.profit, tv: c.fin.last.tv, w: c.fin.last.wages }));
  LEAGUE.leagueIds(st).forEach(lid => { const x = L.filter(r => r.lg === lid).map(r => r.pr); console.log(lid, 'прибыль прошл. сезона (по новой лиге): мин', Math.min(...x).toFixed(0), 'ср', (x.reduce((a, b) => a + b, 0) / x.length).toFixed(1), 'макс', Math.max(...x).toFixed(0)); });
  LEAGUE.leagueIds(st).forEach(lid => { const cs = LEAGUE.leagueClubs(st, lid); console.log(lid, 'владельцы вложили', cs.reduce((a, c) => a + (c.fin.last.owner || 0), 0).toFixed(1), '| в минусе', cs.filter(c => c.fin.balance < 0).length, '| запрет', cs.filter(c => c.fin.embargo).map(c => c.short).join(',') || '—', '| внешнее упр.', cs.filter(c => c.fin.admin).map(c => c.short + '×' + c.fin.admin).join(',') || '—'); });
  st.news.filter(n => /внешнее управление|запрещает/.test(n.text)).slice(-6).forEach(n => console.log('  ', n.text));
  console.log('Свободных агентов:', st.fa.length, '| ушли из пула:', st.faRetired || 0, '| трансферов в истории:', st.market ? st.market.history.length : 0);
}
