/* ИИ тренеров: подготовка к матчу, решения по ходу игры, выбор ходов «3 в ряд» */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC;

  const ATTACK_SHIFT = { '5-4-1': '4-4-2', '5-3-2': '3-5-2', '4-1-4-1': '4-3-3', '4-4-2': '4-3-3', '4-2-3-1': '4-3-3', '3-5-2': '3-4-3', '4-3-3': '3-4-3', '3-4-3': '3-4-3' };
  const DEFENSE_SHIFT = { '3-4-3': '5-4-1', '4-3-3': '4-1-4-1', '4-2-3-1': '4-1-4-1', '4-4-2': '5-4-1', '3-5-2': '5-3-2', '4-1-4-1': '5-4-1', '5-3-2': '5-4-1', '5-4-1': '5-4-1' };

  function xiProfile(club, formation, lineup) {
    const map = TAC.playerMap(club);
    const ps = lineup.map(id => map[id]).filter(p => p && p.pos !== 'GK');
    const a = k => U.avg(ps, p => p.a[k]);
    const line = (pos, k) => { const l = ps.filter(p => p.pos === pos); return l.length ? U.avg(l, p => p.a[k]) : a(k); };
    return {
      pas: a('pas'), pac: a('pac'), tac: a('tac'), sta: a('sta'), dri: a('dri'), pos: a('pos'), sho: a('sho'), com: a('com'),
      fwPac: line('FW', 'pac'), dfPac: line('DF', 'pac'), fwSho: line('FW', 'sho')
    };
  }

  /* Подготовка к матчу: схема, состав и план с учётом предпочтений, состава и соперника */
  /* Подготовка к матчу; для кубка учитываются кубковые дисквалификации */
  function prepare(club, opp, isHome, opts) {
    const prev = TAC.cupMode;
    TAC.cupMode = !!(opts && opts.cup);
    try { return prepareInner(club, opp, isHome, opts); } finally { TAC.cupMode = prev; }
  }
  function prepareInner(club, opp, isHome, opts) {
    const c = club.coach;
    const notes = [];
    const myR = TAC.teamRating(club), oppR = TAC.teamRating(opp);
    const diff = myR - oppR + (isHome ? 0.35 : -0.35);
    const ctx = { strongOpp: oppR >= 16, weakOpp: oppR <= 14.5, away: !isHome };
    // кубок: ротация основы (сильнее соперник и решающие раунды — меньше ротации)
    const cupF = opts && opts.cup;
    let exclude = cupRest(club, opp, cupF);
    // впереди важный кубковый матч — гибкий тренер бережёт лидеров в лиге
    let saved = null;
    if (!cupF && opts && opts.nextCup) {
      const nc = opts.nextCup, stage = nc.f.cr || 0, ncR = TAC.teamRating(nc.opp);
      const important = stage >= 4 || (stage >= 3 && myR - oppR > 0.8) || (stage >= 2 && ncR > myR + 0.5 && myR - oppR > 1.2);
      if (important && U.rnd() < 0.35 + c.adapt * 0.6) {
        const avail = club.players.filter(p => TAC.available(p));
        const k = U.clamp(Math.round(c.adapt * 2 + (stage >= 5 ? 1 : 0)), 1, 3);
        if (avail.length - k >= 14) {
          const top = avail.filter(p => p.pos !== 'GK').sort((a, b) => TAC.overall(b) - TAC.overall(a)).slice(0, 11).sort((a, b) => (a.fit - b.fit) || (TAC.overall(b) - TAC.overall(a)));
          saved = top.slice(0, k);
          exclude = new Set(saved.map(p => p.id));
        }
      }
    }
    const HAS = G.TRAITS.has;
    // схема
    let best = null;
    for (const f of Object.keys(TAC.FORMATIONS)) {
      const xi = TAC.bestXI(club, f, { ctx, exclude, wx: opts && opts.env ? opts.env.weather : null });
      let score = TAC.lineupRating(club, f, xi.lineup);
      const pi = c.formations.indexOf(f);
      if (pi >= 0) score += (pi === 0 ? 0.9 : 0.6) * (1.25 - c.adapt);
      else score -= (1 - c.adapt) * 1.6;
      const backs = +f[0];
      if (diff < -1 && backs === 5) score += 0.5 * c.adapt;
      if (diff > 1 && (f === '4-3-3' || f === '3-4-3')) score += 0.35 * c.adapt;
      score += U.rnd() * 0.15;
      if (!best || score > best.score) best = { f, score, xi };
    }
    const formation = best.f;
    if (!c.formations.includes(formation)) notes.push(`Нестандартное решение: ${formation} вместо любимой ${c.formations[0]} — под имеющихся игроков.`);
    else if (formation !== c.formations[0]) notes.push(`Запасной вариант — ${formation}.`);
    else notes.push(`Любимая схема ${formation}.`);
    const prof = xiProfile(club, formation, best.xi.lineup);
    const oppXi = TAC.bestXI(opp, opp.coach.formations[0], { fitWeight: 0 });
    const oprof = xiProfile(opp, opp.coach.formations[0], oppXi.lineup);

    // менталитет
    let ment = c.mentality + c.adapt * (diff > 1.2 ? 0.5 : diff < -1.2 ? -0.7 : 0);
    if (isHome) ment += 0.15;
    const mentality = U.clamp(Math.round(ment), 0, 2);
    if (diff < -1.2 && c.adapt > 0.4) notes.push(`Соперник сильнее (${oppR.toFixed(1)} против ${myR.toFixed(1)}) — осторожный подход.`);
    if (diff > 1.2) notes.push(`Мы фавориты — играем первым номером.`);

    // план
    const aff = {
      possession: prof.pas, counter: prof.pac, gegenpress: (prof.tac + prof.sta) / 2,
      wings: (prof.dri + prof.pos) / 2, direct: (prof.sho + prof.pac) / 2, park: (prof.pos + prof.tac) / 2
    };
    let bestPlan = null, bestWx = null;
    const env = opts && opts.env, wx = env && G.ENGINE ? G.ENGINE.WEATHER[env.weather] : null;
    for (const k in aff) {
      let s = aff[k] * (0.4 + c.adapt);
      if (k === c.plan) s += 3 * (1.2 - c.adapt) + 1;
      if (diff < -1.5 && (k === 'park' || k === 'counter')) s += 1.3 * c.adapt;
      if (diff > 1.5 && (k === 'possession' || k === 'gegenpress')) s += 0.8 * c.adapt;
      if (k === 'park' && diff > -1) s -= 3;
      if (opp.coach.line >= 1.5 && k === 'counter') s += 0.7 * c.adapt;
      if (!bestPlan || s > bestPlan.s) bestPlan = { k, s, s0: s };
      // погода: гибкий тренер подстраивает план под условия
      const wk = wx && wx.plan[k] ? (wx.plan[k] - 1) * 45 * c.adapt : 0;
      if (!bestWx || s + wk > bestWx.s) bestWx = { k, s: s + wk };
    }
    const plan = bestWx.k;
    if (plan !== bestPlan.k) notes.push(`${wx.i} ${wx.n}: ${wx.d.toLowerCase()} — выбираем «${TAC.PLANS[plan].n}».`);
    if (plan !== c.plan) notes.push(`План изменён на «${TAC.PLANS[plan].n}»: ${planReason(plan, prof, oprof, diff)}.`);
    else notes.push(`Фирменный план — «${TAC.PLANS[plan].n}».`);

    let pressing = c.pressing;
    if (prof.sta < 11) pressing -= 0.5 * c.adapt;
    if (plan === 'gegenpress') pressing = Math.max(pressing, 1.6);
    if (plan === 'park') pressing = Math.min(pressing, 0.8);
    let line = c.line;
    const oppRunners = oppXi.lineup.map(id => TAC.playerMap(opp)[id]).filter(p => p && (HAS(p, 'runner') || HAS(p, 'counterKing')));
    if (oppRunners.length >= 2 && line >= 1.5 && c.adapt > 0.4) { line -= 0.7; notes.push(`У соперника ${oppRunners.length} игрока, любящих забегания (${oppRunners.map(p => p.name).join(', ')}), — без высокой линии.`); }
    if (oprof.fwPac > prof.dfPac + 1.5) { line -= 0.8 * c.adapt; if (c.adapt > 0.4) notes.push('У соперника быстрые форварды — линию обороны опускаем.'); }
    if (plan === 'park') line = Math.min(line, 0.6);
    const tactics = {
      formation, plan, mentality,
      pressing: U.clamp(Math.round(pressing), 0, 2), line: U.clamp(Math.round(line), 0, 2),
      lineup: best.xi.lineup, bench: best.xi.bench
    };
    // особенности в составе
    const map = TAC.playerMap(club);
    if (cupF && exclude && exclude.size) { const r = [...exclude].map(id => map[id]).filter(Boolean).sort((a, b) => TAC.overall(b) - TAC.overall(a)); notes.unshift(`Кубок: ротация — отдыхают ${r.slice(0, 3).map(p => p.name).join(', ')}${r.length > 3 ? ` и ещё ${r.length - 3}` : ''}.`); }
    else if (cupF && cupF.neutral) notes.unshift('Кубок: решающий матч — сильнейший состав.');
    const wxNow = opts && opts.env && opts.env.weather;
    if (wxNow && wxNow !== 'clear' && G.ENGINE) {
      const W = G.ENGINE.WEATHER[wxNow], sens = p => G.ENGINE.wxSens(p, wxNow);
      const out = club.players.filter(p => TAC.available(p) && !best.xi.lineup.includes(p.id) && sens(p) > 1.2 && TAC.overall(p) > myR - 0.3);
      const ins = best.xi.lineup.map(id => map[id]).filter(p => p && sens(p) < 0.5);
      if (out.length || ins.length) notes.push(`${W.i} ${W.n}: ${ins.length ? `ставка на ${ins.slice(0, 2).map(p => p.name).join(', ')}` : ''}${ins.length && out.length ? ', ' : ''}${out.length ? `${out[0].name} в такую погоду начнёт в запасе` : ''}.`);
    }
    if (saved) notes.unshift(`Впереди ${opts.nextCup.name} Кубка Англии против «${opts.nextCup.opp.name}» — бережём ${saved.map(p => p.name).join(', ')}.`);
    const xiP = best.xi.lineup.map(id => map[id]).filter(Boolean);
    const bg = xiP.filter(p => ctx.strongOpp ? HAS(p, 'bigGame') : ctx.weakOpp ? HAS(p, 'flatTrack') : false);
    if (bg.length) notes.push(`${ctx.strongOpp ? 'Против фаворита' : 'Против слабого'} ставка на ${bg.map(p => p.name).join(', ')} (${ctx.strongOpp ? '⭐ любит большие матчи' : '🐯 хорош против слабых'}).`);
    const benched = club.players.filter(p => TAC.available(p) && !best.xi.lineup.includes(p.id) && ((ctx.away && HAS(p, 'homeBird')) || (ctx.strongOpp && HAS(p, 'flatTrack'))) && TAC.overall(p) > myR);
    if (benched.length) notes.push(`${benched[0].name} начнёт в запасе: ${HAS(benched[0], 'homeBird') ? '🏠 в гостях он не тот' : '🐯 не тянет матчи с грандами'}.`);
    // форма
    const hot = xiP.filter(p => TAC.formBonus(p) >= 1.2).sort((a, b) => TAC.formBonus(b) - TAC.formBonus(a));
    if (hot.length) notes.push(`${hot.slice(0, 2).map(p => `${p.name} (+${TAC.formBonus(p).toFixed(1)})`).join(', ')} в отличной форме — в старте.`);
    const cold = club.players.filter(p => TAC.available(p) && !best.xi.lineup.includes(p.id) && TAC.formBonus(p) <= -1 && TAC.overall(p) > myR - 0.3);
    if (cold.length) notes.push(`${cold[0].name} не в форме (${TAC.formBonus(cold[0]).toFixed(1)}) — начнёт в запасе.`);
    const pens = xiP.filter(p => HAS(p, 'penalty'));
    if (pens.length) notes.push(`Пенальти бьёт ⚽ ${pens[0].name}.`);
    // ротация
    const rested = club.players.filter(p => TAC.available(p) && p.fit < 75 && TAC.overall(p) > myR - 0.5 && !best.xi.lineup.includes(p.id));
    if (rested.length) notes.push(`Ротация: отдых для ${rested.slice(0, 2).map(p => p.name).join(', ')}.`);
    tactics.notes = notes;
    return tactics;
  }

  /* Кого из основы оставить отдыхать в кубке: сильнейших и самых уставших, вратаря — только при большой ротации */
  function cupRest(club, opp, f, force) {
    const k = force != null ? force : f && G.CUP ? G.CUP.rotation(club, opp, f) : 0;
    if (!k) return null;
    const avail = club.players.filter(p => TAC.available(p));
    if (avail.length - k < 14) return null;
    const ranked = avail.filter(p => p.pos !== 'GK' || k >= 5).sort((a, b) => (TAC.overall(b) + (100 - b.fit) / 12) - (TAC.overall(a) + (100 - a.fit) / 12));
    const out = new Set();
    for (const p of ranked) {
      if (out.size >= k) break;
      if (p.pos === 'GK' && avail.filter(x => x.pos === 'GK' && !out.has(x.id)).length < 2) continue;
      out.add(p.id);
    }
    return out;
  }

  function planReason(plan, prof, oprof, diff) {
    switch (plan) {
      case 'counter': return diff < 0 ? 'соперник сильнее, а у нас есть скорость' : 'быстрые игроки и уязвимая линия соперника';
      case 'possession': return 'сильные пасующие в центре';
      case 'gegenpress': return 'выносливый и цепкий состав';
      case 'wings': return 'техничные фланговые и сильная игра на втором этаже';
      case 'direct': return 'мощная атака — меньше касаний, больше ударов';
      case 'park': return 'нужно выстоять против фаворита';
    }
    return '';
  }

  /* ---------- по ходу матча ---------- */
  function mem(match, side) {
    match._ai = match._ai || {};
    return match._ai[side] = match._ai[side] || { done: {}, lastSubMove: -10 };
  }
  function coachSay(match, side, text) {
    const ts = match.t[side];
    ts.notes.push(text);
    match.say('tactic', `${ts.coach.name}: ${text}`, side);
  }

  function matchStart(match, side) { mem(match, side); }

  function bestSub(ts, outP, preferLine) {
    const lines = preferLine ? [preferLine] : [outP.pos];
    let cands = ts.bench.filter(p => !ts.used.has(p.id) && p.pos !== 'GK' && lines.includes(p.pos));
    if (!cands.length) cands = ts.bench.filter(p => !ts.used.has(p.id) && p.pos !== 'GK');
    if (outP.pos === 'GK') cands = ts.bench.filter(p => p.pos === 'GK');
    if (!cands.length) return null;
    return cands.sort((a, b) => TAC.overall(b) * (0.6 + 0.4 * b.m.fit / 100) - TAC.overall(a) * (0.6 + 0.4 * a.m.fit / 100))[0];
  }

  function think(match, side) {
    const ts = match.t[side];
    if (ts.ctrl !== 'ai' || match.over) return;
    const m = mem(match, side), c = ts.coach;
    const min = match.minute();
    const diff = match.score[side] - match.score[match.other(side)];
    // замены уставших
    if (ts.subsLeft > 0 && min >= Math.max(46, c.subAt - 8) && match.moveNo - m.lastSubMove >= 3) {
      const risky = p => G.TRAITS.has(p, 'argue') || G.TRAITS.has(p, 'hothead') || G.TRAITS.has(p, 'hard');
      const tired = ts.onPitch.filter(x => x.p && x.slot.role !== 'GK' && (x.p.m.fit < 60 - (1 - c.temper) * 6 || x.p.m.inj || (x.p.m.yc && min < 75 && c.adapt > 0.6 && x.p.m.fit < 75) || (x.p.m.yc && risky(x.p) && min >= 50) || (G.TRAITS.has(x.p, 'nervous') && min >= 70 && diff <= 0 && c.adapt > 0.4)))
        .sort((a, b) => a.p.m.fit - b.p.m.fit);
      if (tired.length) {
        const x = tired[0];
        let line = x.p.pos;
        if (min >= 65 && diff < 0 && x.p.pos !== 'FW' && ts.subsLeft >= 2) line = 'FW';
        if (min >= 70 && diff > 0 && x.p.pos === 'FW' && c.adapt > 0.4) line = 'DF';
        const sub = bestSub(ts, x.p, line);
        if (sub) {
          const why = x.p.m.inj ? 'вынужденная замена' : x.p.m.yc && risky(x.p) ? 'горячая голова с жёлтой — от греха подальше' : G.TRAITS.has(x.p, 'nervous') && min >= 70 ? 'нервы подводят в концовке' : x.p.m.yc && x.p.m.fit >= 60 ? 'страховка от второй жёлтой' : line !== x.p.pos ? (line === 'FW' ? 'нужен ещё один нападающий' : 'укрепляем оборону') : 'свежие ноги';
          match.substitute(side, x.p.id, sub.id, true);
          match.say('sub', `${ts.coach.name} меняет: ${sub.name} вместо ${x.p.name} (${why}).`, side);
          m.lastSubMove = match.moveNo;
        }
      }
    }
    // диагностика игры (60' и 75') и реакция на счёт
    const stage = min >= 85 ? 3 : min >= 75 ? 2 : min >= 60 ? 1 : 0;
    if (stage && !m.done['s' + stage]) {
      m.done['s' + stage] = true;
      if (stage <= 2) diagnose(match, side, false);
      scoreReaction(match, side, stage);
    }
  }

  /* ---------- диагностика: что идёт не так и чем лечить ---------- */
  const MIDFIELD_SHIFT = { '4-4-2': '4-1-4-1', '4-3-3': '4-2-3-1', '3-4-3': '3-5-2', '5-3-2': '5-4-1', '4-2-3-1': '4-1-4-1', '3-5-2': '3-5-2', '4-1-4-1': '4-1-4-1', '5-4-1': '5-4-1' };

  /* Профиль игроков, которые сейчас на поле (с учётом формы, особенностей и усталости) */
  function liveProfile(match, side) {
    const ps = match.t[side].onPitch.filter(x => x.p && x.slot.role !== 'GK');
    const a = k => ps.length ? U.avg(ps, x => match.pa(x.p, k) * match.fatF(x.p)) : 8;
    const line = (pos, k) => { const l = ps.filter(x => x.p.pos === pos); return l.length ? U.avg(l, x => match.pa(x.p, k) * match.fatF(x.p)) : a(k); };
    const pr = { pas: a('pas'), dri: a('dri'), pac: a('pac'), sho: a('sho'), pos: a('pos'), tac: a('tac'), sta: a('sta'), com: a('com'), dfPac: line('DF', 'pac'), fwPac: line('FW', 'pac') };
    pr.tech = (pr.pas + pr.dri) / 2;          // техника: умение держать мяч под давлением
    pr.cross = (pr.dri + pr.pos) / 2;         // фланги и игра на втором этаже
    pr.fit = U.avg(ps, x => x.p.m.fit);
    pr.aerial = ps.filter(x => G.TRAITS.has(x.p, 'aerial') || G.TRAITS.has(x.p, 'crosser')).length;
    pr.long = ps.filter(x => G.TRAITS.has(x.p, 'longShots') || G.TRAITS.has(x.p, 'shooter')).length;
    return pr;
  }

  function setPlan(match, side, plan, text) {
    const ts = match.t[side];
    if (ts.tac.plan === plan) return false;
    match.setTactic(side, 'plan', plan);
    coachSay(match, side, text + ` (план «${TAC.PLANS[plan].n}»)`);
    return true;
  }

  /* Как ломать оборону, когда нужен гол */
  function chasePlan(me, opp, oppTs) {
    const lowBlock = oppTs.tac.plan === 'park' || oppTs.tac.line === 0 || oppTs.shield > 45;
    if (lowBlock) {
      if (me.cross >= 12 || me.aerial >= 1) return ['wings', 'Соперник встал низким блоком — идём через фланги и навесы'];
      if (me.long >= 1 || me.sho >= 13) return ['direct', 'Соперник закрылся — бьём при каждой возможности, в том числе издали'];
      return ['direct', 'Соперник закрылся — меньше касаний, больше ударов'];
    }
    if (oppTs.tac.line === 2 && me.fwPac >= 13.5) return ['counter', 'У соперника высокая линия — ловим на рывках за спину'];
    if (me.tech >= 13.5) return ['possession', 'Забираем мяч и методично давим'];
    return ['direct', 'Без изысков: быстрее к чужим воротам'];
  }

  /* Как удержать счёт */
  function holdPlan(me) {
    if (me.tech >= 13.5) return ['possession', 'Держим мяч и усыпляем игру — без мяча соперник не забьёт'];
    return ['park', 'Все назад, держим счёт'];
  }

  /* Разбор игры: в перерыве и по ходу матча. Чем гибче тренер, тем вероятнее он что-то меняет */
  function diagnose(match, side, isHalf) {
    const ts = match.t[side], os = match.other(side), opp = match.t[os], c = ts.coach;
    const me = liveProfile(match, side), them = liveProfile(match, os);
    const diff = match.score[side] - match.score[os];
    const possShare = ts.st.poss / Math.max(1, ts.st.poss + opp.st.poss);
    const minK = Math.max(0.5, match.minute() / 45); // нормировка на сыгранное время
    let changes = 0;
    const act = (chance) => changes < 2 && U.rnd() < chance;

    // 1. Нас душат прессингом (соперник часто отбирает мяч)
    if (opp.st.wins >= ts.st.wins + 2 && act(c.adapt + 0.15)) {
      if (me.tech >= 13 && me.tech >= them.tac) {
        if (setPlan(match, side, 'possession', `Нас прессингуют, но у нас техничные ребята (техника ${me.tech.toFixed(1)}) — держим мяч и выходим из-под давления`)) changes++;
      } else if (setPlan(match, side, 'direct', `Нас душат прессингом, а с техникой (${me.tech.toFixed(1)}) не перепасовать — играем проще, через верх`)) changes++;
      else if (ts.tac.mentality > 0 && diff >= 0) { match.setTactic(side, 'mentality', ts.tac.mentality - 1); coachSay(match, side, 'Прямой футбол не спасает от прессинга — отходим ниже и бьём на контратаку.'); changes++; }
    }
    // 2. Владеем, но не создаём (стерильное владение)
    if (possShare >= 0.56 && ts.st.xg < 0.35 * minK && diff <= 0 && act(c.adapt)) {
      const [plan, why] = chasePlan(me, them, opp);
      if (setPlan(match, side, plan, `Мяч у нас, а моментов нет. ${why}`)) changes++;
    }
    // 3. Нас переигрывают в центре (мало владения), а мы не играем от обороны
    if (possShare <= 0.4 && !['park', 'counter'].includes(ts.tac.plan) && act(c.adapt * 0.8)) {
      const nf = MIDFIELD_SHIFT[ts.tac.formation];
      if (nf !== ts.tac.formation && ts.redCount === 0) { match.setFormation(side, nf); coachSay(match, side, `Проигрываем центр поля — ещё один полузащитник, схема ${nf}.`); changes++; }
      else if (me.pac >= them.pac && setPlan(match, side, 'counter', 'Мяча у нас мало — отдаём его и бьём на контратаках')) changes++;
    }
    // 4. Соперник создаёт слишком много
    if (opp.st.xg > ts.st.xg + 0.5 * minK && act(c.adapt + 0.1)) {
      if (ts.tac.line >= 1 && them.fwPac > me.dfPac + 1) { match.setTactic(side, 'line', ts.tac.line - 1); coachSay(match, side, `Их быстрые нападающие убегают за спину — опускаем линию обороны.`); changes++; }
      else if (diff >= 0 && ts.tac.mentality > 0) { match.setTactic(side, 'mentality', ts.tac.mentality - 1); coachSay(match, side, 'Слишком много отдаём сопернику — чуть осторожнее.'); changes++; }
      else if (ts.tac.pressing < 2 && them.tech < 13) { match.setTactic(side, 'pressing', ts.tac.pressing + 1); coachSay(match, side, 'Они слабы технически — давим выше и не даём им строить атаки.'); changes++; }
    }
    // 5. Попадаемся в офсайд
    if (ts.st.offsides >= 3 && ts.tac.plan === 'counter' && act(c.adapt)) {
      if (setPlan(match, side, me.tech >= 13 ? 'possession' : 'wings', 'Постоянно в офсайде — хватит забеганий, строим атаки иначе')) changes++;
    }
    // 6. Устали
    if (me.fit < 62 && ts.tac.pressing === 2 && act(0.4 + c.adapt * 0.5)) {
      match.setTactic(side, 'pressing', 1);
      if (ts.tac.plan === 'gegenpress') ts.tac.plan = me.tech >= 13.5 ? 'possession' : 'counter';
      coachSay(match, side, `Ноги уже не те (свежесть ${Math.round(me.fit)}%) — снижаем прессинг, бережём силы.`); changes++;
    }
    // 7. Много карточек
    if (ts.st.yc >= 3 && ts.tac.pressing >= 1 && act(c.adapt)) {
      match.setTactic(side, 'pressing', ts.tac.pressing - 1);
      coachSay(match, side, `${ts.st.yc} жёлтых — аккуратнее в отборе, иначе останемся вдесятером.`); changes++;
    }
    // 8. В перерыве при крупном проигрыше — смелее
    if (isHalf && diff <= -2 && c.adapt > 0.3) {
      const nf = ATTACK_SHIFT[ts.tac.formation];
      if (nf !== ts.tac.formation && ts.redCount === 0) { match.setFormation(side, nf); coachSay(match, side, `В перерыве: переходим на ${nf}.`); }
      if (ts.tac.mentality < 2) { ts.tac.mentality = 2; coachSay(match, side, 'Терять нечего — все вперёд!'); }
    } else if (isHalf && diff < 0 && changes === 0 && ts.tac.mentality < 2 && U.rnd() < c.adapt) {
      ts.tac.mentality++; coachSay(match, side, 'Во втором тайме добавляем в атаке.');
    }
    return changes;
  }

  /* Реакция на счёт в концовке */
  function scoreReaction(match, side, stage) {
    const ts = match.t[side], c = ts.coach, os = match.other(side);
    const diff = match.score[side] - match.score[os];
    const react = c.temper * 0.6 + c.adapt * 0.6;
    const me = liveProfile(match, side), them = liveProfile(match, os);
    if (diff < 0 && U.rnd() < react + 0.2) {
      if (ts.tac.mentality < 2) { match.setTactic(side, 'mentality', ts.tac.mentality + 1); coachSay(match, side, 'Проигрываем — вперёд! Менталитет атакующий.'); }
      if (stage >= 2 && c.adapt > 0.35) {
        const [plan, why] = chasePlan(me, them, match.t[os]);
        setPlan(match, side, plan, why);
      }
      if (stage >= 2 && c.adapt > 0.5 && ATTACK_SHIFT[ts.tac.formation] !== ts.tac.formation && ts.redCount === 0) {
        const nf = ATTACK_SHIFT[ts.tac.formation];
        match.setFormation(side, nf);
        coachSay(match, side, `Перестройка на ${nf} — больше людей в атаке.`);
      }
      if (stage === 3 && ts.tac.pressing < 2 && me.fit > 45) { match.setTactic(side, 'pressing', 2); coachSay(match, side, 'Прессинг на максимум!'); }
    } else if (diff > 0 && U.rnd() < react + (diff === 1 ? 0.15 : -0.1)) {
      if (stage >= 2 && ts.tac.mentality > 0 && c.mentality < 1.7) { match.setTactic(side, 'mentality', ts.tac.mentality - 1); coachSay(match, side, 'Удерживаем счёт, без лишнего риска.'); }
      if (stage === 3 && diff === 1 && c.adapt > 0.5) {
        const [plan, why] = holdPlan(me);
        if (plan === 'park') {
          const nf = DEFENSE_SHIFT[ts.tac.formation];
          if (nf !== ts.tac.formation) match.setFormation(side, nf);
          setPlan(match, side, 'park', `${why}: ${ts.tac.formation}`);
        } else setPlan(match, side, plan, why);
      }
    } else if (diff === 0 && stage >= 2) {
      const myR = TAC.teamRating(ts.club), oR = TAC.teamRating(match.t[os].club);
      if (myR > oR + 0.5 && ts.tac.mentality < 2 && U.rnd() < react) { match.setTactic(side, 'mentality', 2); coachSay(match, side, 'Ничья нас не устраивает — атакуем!'); }
      else if (myR < oR - 1 && ts.tac.mentality > 0 && U.rnd() < react) { match.setTactic(side, 'mentality', 0); coachSay(match, side, 'Очко против фаворита — тоже результат.'); }
    }
  }

  function halftime(match, side) {
    const ts = match.t[side];
    if (ts.ctrl !== 'ai') return;
    const c = ts.coach;
    diagnose(match, side, true);
    // уставшие и предупреждённые
    const tired = ts.onPitch.filter(x => x.p && x.slot.role !== 'GK' && (x.p.m.fit < 66 || (x.p.m.yc && c.adapt > 0.7))).slice(0, 2);
    for (const x of tired) {
      const sub = bestSub(ts, x.p);
      if (sub && ts.subsLeft > 0) { match.substitute(side, x.p.id, sub.id, true); match.say('sub', `Замена в перерыве: ${sub.name} вместо ${x.p.name}.`, side); }
    }
  }

  function onGoal(match, side) {
    const ts = match.t[side];
    if (ts.ctrl !== 'ai') return;
    const diff = match.score[side] - match.score[match.other(side)];
    const min = match.minute();
    if (diff === -1 && min > 70 && ts.tac.mentality < 2 && U.rnd() < ts.coach.temper) {
      ts.tac.mentality = 2;
      coachSay(match, side, 'Пропустили — сразу вперёд!');
    }
  }

  function onRedCard(match, side) {
    const ts = match.t[side];
    const missing = ts.onPitch.find(x => !x.p);
    const min = match.minute();
    // вратарь удалён — выпускаем запасного вратаря
    if (missing && missing.slot.role === 'GK') {
      const gk = ts.bench.find(p => p.pos === 'GK');
      const outX = ts.onPitch.filter(x => x.p && x.p.pos === 'FW').sort((a, b) => TAC.overall(a.p) - TAC.overall(b.p))[0] || ts.onPitch.find(x => x.p);
      if (gk && ts.subsLeft > 0 && outX) {
        match.substitute(side, outX.p.id, gk.id, true);
        const gx = ts.onPitch.find(x => x.p === gk);
        gx.p = null; missing.p = gk;
        match.say('sub', `Резервный вратарь ${gk.name} выходит на поле.`, side);
      }
    }
    if (ts.coach.adapt > 0.3 && min < 80) {
      const nf = DEFENSE_SHIFT[ts.tac.formation] === '5-4-1' && ts.tac.formation !== '5-4-1' ? '4-4-2' : DEFENSE_SHIFT[ts.tac.formation];
      if (nf !== ts.tac.formation) { match.setFormation(side, nf); coachSay(match, side, `Остались вдесятером — перестраиваемся на ${nf}.`); }
    }
  }

  function handleInjury(match, side, p) {
    const ts = match.t[side];
    if (ts.subsLeft <= 0) return;
    const sub = bestSub(ts, p);
    if (sub) { match.substitute(side, p.id, sub.id, true); match.say('sub', `Вынужденная замена: ${sub.name} вместо травмированного ${p.name}.`, side); }
  }

  /* ---------- выбор хода на поле ---------- */
  function gemWeights(match, side) {
    const me = match.t[side], opp = match.t[match.other(side)];
    const plan = me.tac.plan;
    const w = [0, 0, 0, 0, 0, 0];
    if (match.poss === side) {
      const rp = match.rp(side);
      const adv = rp === 4 ? 0.45 : 1;
      w[1] = 1.0 * adv * (plan === 'possession' ? 1.3 : 1);
      w[2] = 0.95 * adv * (plan === 'wings' ? 1.15 : 1) + (opp.shield > 40 ? 0.3 : 0);
      w[3] = 0.9 * adv * (match.counter && match.counter.side === side ? 1.8 : 1) * (plan === 'counter' ? 1.2 : 1);
      w[4] = 0.25 + opp.pressure / 100 * 1.4;
      w[5] = rp >= 3 ? 0.95 + me.shotCharge / 200 : 0.4;
      w[0] = rp === 4 ? 2.4 : rp === 3 ? 0.8 : 0.25;
      if (match.setPiece && match.setPiece.side === side) { w[5] = 2.3; w[0] = Math.max(w[0], 2.3); }
    } else {
      const arp = match.rp(match.other(side));
      w[4] = 1.25 * [0.85, 1, 1.15][me.tac.pressing] * (plan === 'gegenpress' ? 1.2 : 1) + me.pressure / 100 * 0.8;
      w[5] = 0.7 + (arp >= 3 ? 0.7 : 0) + (match.setPiece ? 1.5 : 0) + (plan === 'park' ? 0.4 : 0);
      w[3] = 0.55 + match.mom / 100 * 0.9;
      w[1] = 0.6;
      w[2] = 0.35 + (plan === 'counter' ? 0.3 : 0);
      w[0] = arp === 4 ? 0.8 + opp.shotCharge / 100 : 0.3;
    }
    return w;
  }

  function scoreMove(match, side, w, mv) {
    const sim = match.board.clone(Math.random);
    const res = sim.resolveMove(mv.a, mv.b, true);
    if (!res.valid) return -1;
    let s = 0;
    const attacking = match.poss === side;
    const rp = match.rp(side);
    res.steps.forEach((st, i) => {
      const cf = 1 + 0.2 * st.cascade;
      for (let t = 0; t < 6; t++) s += w[t] * st.counts[t] * cf * (i === 0 ? 1 : 0.7);
      if (i === 0) s += st.created.length * 1.6;
    });
    const s0 = res.steps[0];
    if (attacking && s0 && s0.counts[0] >= 3 && (rp === 4 || (rp === 3 && s0.counts[0] >= 4))) s += rp === 4 ? 9 + 2 * s0.counts[0] : 4;
    if (res.firstMaxGroup >= 4) s += 4.5;
    return s;
  }

  function chooseMove(match, side, opts) {
    opts = opts || {};
    const moves = match.board.validMoves();
    if (!moves.length) return null;
    const ts = match.t[side];
    const w = gemWeights(match, side);
    const skill = opts.skill != null ? opts.skill : (ts.coach ? ts.coach.skill : 0.8);
    let best = null;
    for (const mv of moves) {
      let s = scoreMove(match, side, w, mv);
      s += (1 - skill) * U.rnd() * 14;
      if (!best || s > best.s) best = { a: mv.a, b: mv.b, s };
    }
    return best;
  }

  function penaltyKick(kicker) {
    const r = U.rnd();
    const center = kicker && kicker.a.com >= 15 ? 0.22 : 0.12;
    return r < center ? 1 : (U.rnd() < 0.5 ? 0 : 2);
  }
  function penaltyDive() {
    const r = U.rnd();
    return r < 0.1 ? 1 : (U.rnd() < 0.5 ? 0 : 2);
  }

  G.AI = { cupRest, liveProfile, diagnose, prepare, matchStart, think, halftime, onGoal, onRedCard, handleInjury, chooseMove, gemWeights, penaltyKick, penaltyDive, xiProfile };
})(typeof window !== 'undefined' ? window : globalThis);
