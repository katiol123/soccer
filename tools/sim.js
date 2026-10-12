// Headless-симуляция для проверки баланса: node tools/sim.js [matches]
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math, Date, JSON, setTimeout };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['util', 'traits', 'data', 'tactics', 'finance', 'transfers', 'career', 'board', 'engine', 'ai', 'league', 'cup'])
  if (fs.existsSync(path.join(__dirname, '../js', f + '.js'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx, { filename: f });
const { DATA, TAC, AI, ENGINE } = ctx;
const N = +process.argv[2] || 100;
const clubs = DATA.createWorld(1);
let goals = 0, shots = 0, hw = 0, dr = 0, aw = 0, xg = 0, pens = 0, reds = 0, yc = 0, fav = 0, favN = 0, corners = 0, poss = 0;
const t0 = Date.now();
const dist = {};
for (let i = 0; i < N; i++) {
  const h = clubs[i % 20], a = clubs[(i * 7 + 3) % 20 === i % 20 ? (i + 1) % 20 : (i * 7 + 3) % 20];
  clubs.forEach(c => c.players.forEach(p => p.fit = 100));
  const m = new ENGINE.Match({ home: { club: h, tactics: AI.prepare(h, a, true) }, away: { club: a, tactics: AI.prepare(a, h, false) }, turns: 24 });
  m.simulate();
  const g = m.score.home + m.score.away; goals += g; dist[g] = (dist[g] || 0) + 1;
  shots += m.t.home.st.shots + m.t.away.st.shots; xg += m.t.home.st.xg + m.t.away.st.xg;
  corners += m.t.home.st.corners + m.t.away.st.corners;
  reds += m.t.home.st.rc + m.t.away.st.rc; yc += m.t.home.st.yc + m.t.away.st.yc;
  pens += m.events.filter(e => e.kind === 'penalty').length;
  if (m.score.home > m.score.away) hw++; else if (m.score.home < m.score.away) aw++; else dr++;
  const d = h.str - a.str;
  if (Math.abs(d) > 1.5) { favN++; if ((d > 0 && m.score.home > m.score.away) || (d < 0 && m.score.away > m.score.home)) fav++; }
  poss += m.t.home.st.poss / (m.t.home.st.poss + m.t.away.st.poss);
}
const ms = (Date.now() - t0) / N;
console.log(`матчей ${N}, ${ms.toFixed(0)} мс/матч`);
console.log(`голы ${(goals / N).toFixed(2)}, удары ${(shots / N).toFixed(1)}, xG ${(xg / N).toFixed(2)}, угловые ${(corners / N).toFixed(1)}, пен ${(pens / N).toFixed(2)}, ЖК ${(yc / N).toFixed(1)}, КК ${(reds / N).toFixed(2)}`);
console.log(`П1 ${(hw / N * 100).toFixed(0)}% Н ${(dr / N * 100).toFixed(0)}% П2 ${(aw / N * 100).toFixed(0)}%  фаворит(>1.5) побеждает ${(fav / favN * 100).toFixed(0)}% из ${favN}, владение хозяев ${(poss / N * 100).toFixed(0)}%`);
console.log('распределение голов', JSON.stringify(dist));
