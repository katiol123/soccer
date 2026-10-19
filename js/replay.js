/* Повтор матча: восстановление по снимку (составы, тактика, свежесть, настроение, форма), семени генератора
   и журналу действий (для матчей с участием человека). Доступен в течение сезона, пока живы игроки снимка */
(function (G) {
  'use strict';

  function findPlayer(st, id) {
    for (const c of st.clubs) for (const p of c.players) if (p.id === id) return p;
    for (const p of (st.fa || [])) if (p.id === id) return p;
    return null;
  }
  function can(st, f) { return !!(f && f.res && f.rp && f.rp.s && f.rp.season === st.season); }

  /* Новый матч, который сыграется в точности как оригинал */
  function build(st, f) {
    if (!can(st, f)) return null;
    const S = f.rp.s;
    const side = s => {
      const x = S[s], real = st.clubs.find(c => c.id === x.club);
      if (!real) return null;
      const players = [];
      const ids = (x.tac.lineup || []).concat(x.tac.bench || []).filter(Boolean);
      for (let i = 0; i < ids.length; i++) {
        if (!x.pl[i]) continue;
        const p0 = findPlayer(st, ids[i]);
        if (!p0) return null;
        const p = JSON.parse(JSON.stringify(p0, (k, v) => k === 'm' ? undefined : v));
        p.fit = x.pl[i][0]; p.mood = x.pl[i][1]; p.form = x.pl[i][2];
        players.push(p);
      }
      // тренер на момент матча (уволенные хранятся в архиве до конца сезона)
      const coach = real.coach && real.coach.id === x.coach ? real.coach : (st.coachArc && st.coachArc[x.coach]);
      if (!coach) return null;
      const club = Object.assign({}, real, { players, coach, _trFixed: x.tr });
      delete club._map; delete club._mapN;
      return { club, tactics: JSON.parse(JSON.stringify(x.tac)), ctrl: x.ctrl };
    };
    const home = side('home'), away = side('away');
    if (!home || !away) return null;
    return new G.ENGINE.Match({ home, away, turns: S.turns, env: S.env, seed: S.seed, interactive: !!S.inter, replay: { log: f.rp.r || [], i: 0 } });
  }

  /* Без отрисовки (для проверки): матч с человеком — по журналу, без человека — силами ИИ */
  function runHeadless(m) {
    const R = m.replay;
    if (!R || !R.log.length) return m.simulate();
    while (!m.over && R.i < R.log.length) {
      if (m.injPending) m.injPending = null;
      if (m.halftime) m.halftime = false;
      const [k, ...a] = R.log[R.i++];
      m[k](...a);
    }
    return m;
  }

  G.REPLAY = { can, build, runHeadless };
})(typeof window !== 'undefined' ? window : globalThis);
