// Симуляция целого сезона: node tools/season.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math, Date, JSON, setTimeout }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['util', 'traits', 'data', 'tactics', 'finance', 'board', 'engine', 'ai', 'league'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx, { filename: f });
const { LEAGUE, AI, ENGINE, TAC } = ctx;
const st = LEAGUE.newGame({ mode: 'spectator', seed: 7 });
const t0 = Date.now();
while (!LEAGUE.seasonOver(st)) {
  for (const f of st.fixtures[st.round]) {
    const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
    const m = new ENGINE.Match({ home: { club: h, tactics: AI.prepare(h, a, true) }, away: { club: a, tactics: AI.prepare(a, h, false) }, turns: st.settings.turns });
    m.simulate(); LEAGUE.record(st, f, m);
  }
  LEAGUE.advance(st);
}
console.log('сезон за', Date.now() - t0, 'мс');
LEAGUE.standings(st).forEach((r, i) => { const c = LEAGUE.club(st, r.id); console.log(String(i + 1).padStart(2), c.name.padEnd(20), c.str, TAC.teamRating(c).toFixed(1), r.w, r.d, r.l, r.gf + ':' + r.ga, r.pts); });
LEAGUE.topScorers(st, 5).forEach(x => console.log(x.p.name, x.c.short, x.p.st.goals, x.p.st.assists));
