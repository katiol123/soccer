/* Кубок Англии: матчи на выбывание для клубов всех лиг, раунды в свободные недели АПЛ,
   двойные недели для нижних лиг, ротация у ИИ, призовые и выручка от билетов */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;
  const NAME = 'Кубок Англии';
  const BY_SIZE = { 2: 'Финал', 4: '1/2 финала', 8: '1/4 финала', 16: '5-й раунд', 32: '4-й раунд', 64: '3-й раунд' };
  // доли сезона для раундов (последний — финал в последнюю неделю)
  const AT = [0.1, 0.4, 0.5, 0.6, 0.71, 0.84, 1];
  // призовые за победу в раунде по размеру раунда, млн £ (в финале — победителю)
  const PRIZE = { pre: 0.04, 64: 0.1, 32: 0.12, 16: 0.23, 8: 0.45, 4: 1.0, 2: 2.0 };
  const club = (st, id) => st.clubs.find(c => c.id === id);
  const L = () => G.LEAGUE;

  /* Сетка и календарь кубка на сезон */
  function build(st) {
    const ids = st.clubs.map(c => c.id), N = ids.length;
    let B = 1; while (B * 2 <= N) B *= 2;
    const pre = N - B; // столько пар играет предварительный раунд
    const sizes = [];
    if (pre > 0) sizes.push('pre');
    for (let s = B; s >= 2; s /= 2) sizes.push(s);
    // недели: ближайшие к целевым свободные недели высшей лиги
    const W = L().weeks(st), top = L().leagueIds(st)[0], fx = st.leagues[top].fixtures;
    const at = AT.slice(-sizes.length), taken = new Set(), weeks = [];
    at.forEach((f, i) => {
      if (i === at.length - 1) { weeks.push(W - 1); taken.add(W - 1); return; }
      let best = null;
      for (let w = 1; w < W - 1; w++) {
        if (taken.has(w) || (weeks.length && w <= weeks[weeks.length - 1])) continue;
        const d = Math.abs(w - f * (W - 1)) + (fx[w] && fx[w].length ? 6 : 0);
        if (!best || d < best.d) best = { w, d };
      }
      weeks.push(best.w); taken.add(best.w);
    });
    // предварительный раунд — самые слабые клубы низшего дивизиона
    const weak = st.clubs.slice().sort((a, b) => (L().tier(b) - L().tier(a)) || (TAC.teamRating(a) - TAC.teamRating(b))).slice(0, pre * 2).map(c => c.id);
    st.cup = {
      season: st.season, name: NAME, winner: null, runnerUp: null,
      alive: ids.filter(id => !weak.includes(id)),
      rounds: sizes.map((s, i) => ({ i, size: s, name: s === 'pre' ? '1-й раунд' : (BY_SIZE[s] || `Раунд ${s}`), week: weeks[i], ties: [] }))
    };
    if (pre > 0) st.cup.rounds[0].ties = pairs(st, U.shuffle(weak), 0);
    else draw(st, 0);
  }
  function pairs(st, list, ri) {
    const R = st.cup.rounds[ri], last = ri === st.cup.rounds.length - 1;
    const out = [];
    for (let i = 0; i + 1 < list.length; i += 2) out.push({ h: list[i], a: list[i + 1], res: null, cup: true, cr: ri, neutral: R.size === 4 || R.size === 2, fin: last });
    return out;
  }
  /* Жеребьёвка раунда из оставшихся клубов */
  function draw(st, ri) {
    const R = st.cup.rounds[ri];
    R.ties = pairs(st, U.shuffle(st.cup.alive.slice()), ri);
    st.cup.alive = [];
    const me = st.userClub && R.ties.find(f => f.h === st.userClub || f.a === st.userClub);
    if (me) {
      const opp = club(st, me.h === st.userClub ? me.a : me.h);
      st.news.push({ r: st.round, text: `🏆 Жеребьёвка: ${NAME}, ${R.name} — ${me.neutral ? 'на «Уэмбли» против' : me.h === st.userClub ? 'дома против' : 'в гостях у'} «${opp.name}» (${L().leagueInfo(st, opp.league).name}, неделя ${R.week + 1}).` });
    } else if (R.size <= 8) st.news.push({ r: st.round, text: `🏆 ${NAME}, ${R.name}: ${R.ties.map(f => `${club(st, f.h).short} — ${club(st, f.a).short}`).join(', ')}.` });
  }

  function roundAt(st, week) { return st.cup && st.cup.season === st.season ? st.cup.rounds.find(r => r.week === week) : null; }
  function weekTies(st, week) { const R = roundAt(st, week == null ? st.round : week); return R ? R.ties : []; }
  function roundName(st, f) { return st.cup && st.cup.rounds[f.cr] ? st.cup.rounds[f.cr].name : ''; }

  /* После недели: победители проходят дальше, призовые, жеребьёвка следующего раунда */
  function after(st, week) {
    const R = roundAt(st, week);
    if (!R || !R.ties.length || R.done) return;
    R.done = true;
    const prize = PRIZE[R.size] || 0;
    for (const f of R.ties) {
      const w = L().winner(f) || f.h, l = w === f.h ? f.a : f.h;
      const wc = club(st, w), lc = club(st, l);
      if (wc && wc.fin) { wc.fin.balance += prize; wc.fin.season.prize += prize; }
      if (R.size === 2) {
        st.cup.winner = w; st.cup.runnerUp = l;
        if (lc && lc.fin) { lc.fin.balance += prize / 2; lc.fin.season.prize += prize / 2; }
      } else st.cup.alive.push(w);
      if (st.userClub === l && R.size !== 2) st.news.push({ r: st.round, text: `💔 «${lc.name}» вылетает из Кубка Англии (${R.name}): ${club(st, f.h).short} ${f.res.hs}:${f.res.as}${f.res.pen ? ' (пен.)' : ''} ${club(st, f.a).short}.` });
    }
    // сенсации: клуб двумя дивизионами ниже (или дивизионом ниже против топ-6) выбивает фаворита
    R.ties.forEach(f => {
      const w = club(st, L().winner(f) || f.h), l = club(st, w.id === f.h ? f.a : f.h);
      if (L().tier(w) - L().tier(l) >= 2 || (L().tier(w) > L().tier(l) && G.FIN.level(l) <= 6)) st.news.push({ r: st.round, text: `😱 Сенсация в Кубке Англии! «${w.name}» (${L().leagueInfo(st, w.league).name}) выбивает «${l.name}»: ${club(st, f.h).short} ${f.res.hs}:${f.res.as}${f.res.pen ? ' (пен.)' : ''} ${club(st, f.a).short}.` });
    });
    if (R.size === 2) {
      const c = club(st, st.cup.winner);
      st.news.push({ r: st.round, text: `🏆 «${c.name}» — обладатель Кубка Англии ${st.seasonName}!` });
      if (st.userClub === c.id && st.board) st.board.conf = Math.min(100, st.board.conf + 12);
      return;
    }
    // в предварительном раунде к победителям присоединяются остальные клубы
    const next = st.cup.rounds[R.i + 1];
    if (next) draw(st, R.i + 1);
  }

  /* Ротация в кубке: сколько основных игроков отдыхает (полуфинал и финал — сильнейший состав) */
  function rotation(club, opp, f) {
    if (!f || !f.cup || f.neutral) return 0;
    const gap = TAC.teamRating(club) - TAC.teamRating(opp);
    const lvl = G.FIN.level(club);
    const k = gap * 1.6 + (lvl <= 6 ? 2 : lvl <= 20 ? 1 : 0) + (f.cr <= 1 ? 1 : 0) + (U.rnd() * 1.5 - 0.5);
    return Math.round(U.clamp(k, 0, 7));
  }

  G.CUP = { NAME, build, draw, weekTies, roundAt, roundName, after, rotation };
})(typeof window !== 'undefined' ? window : globalThis);
