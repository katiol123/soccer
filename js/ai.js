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
  function prepare(club, opp, isHome) {
    const c = club.coach;
    const notes = [];
    const myR = TAC.teamRating(club), oppR = TAC.teamRating(opp);
    const diff = myR - oppR + (isHome ? 0.35 : -0.35);
    // схема
    let best = null;
    for (const f of Object.keys(TAC.FORMATIONS)) {
      const xi = TAC.bestXI(club, f);
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
    let bestPlan = null;
    for (const k in aff) {
      let s = aff[k] * (0.4 + c.adapt);
      if (k === c.plan) s += 3 * (1.2 - c.adapt) + 1;
      if (diff < -1.5 && (k === 'park' || k === 'counter')) s += 1.3 * c.adapt;
      if (diff > 1.5 && (k === 'possession' || k === 'gegenpress')) s += 0.8 * c.adapt;
      if (k === 'park' && diff > -1) s -= 3;
      if (opp.coach.line >= 1.5 && k === 'counter') s += 0.7 * c.adapt;
      if (!bestPlan || s > bestPlan.s) bestPlan = { k, s };
    }
    const plan = bestPlan.k;
    if (plan !== c.plan) notes.push(`План изменён на «${TAC.PLANS[plan].n}»: ${planReason(plan, prof, oprof, diff)}.`);
    else notes.push(`Фирменный план — «${TAC.PLANS[plan].n}».`);

    let pressing = c.pressing;
    if (prof.sta < 11) pressing -= 0.5 * c.adapt;
    if (plan === 'gegenpress') pressing = Math.max(pressing, 1.6);
    if (plan === 'park') pressing = Math.min(pressing, 0.8);
    let line = c.line;
    if (oprof.fwPac > prof.dfPac + 1.5) { line -= 0.8 * c.adapt; if (c.adapt > 0.4) notes.push('У соперника быстрые форварды — линию обороны опускаем.'); }
    if (plan === 'park') line = Math.min(line, 0.6);
    const tactics = {
      formation, plan, mentality,
      pressing: U.clamp(Math.round(pressing), 0, 2), line: U.clamp(Math.round(line), 0, 2),
      lineup: best.xi.lineup, bench: best.xi.bench
    };
    // ротация
    const map = TAC.playerMap(club);
    const rested = club.players.filter(p => TAC.available(p) && p.fit < 75 && TAC.overall(p) > myR - 0.5 && !best.xi.lineup.includes(p.id));
    if (rested.length) notes.push(`Ротация: отдых для ${rested.slice(0, 2).map(p => p.name).join(', ')}.`);
    tactics.notes = notes;
    return tactics;
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
      const tired = ts.onPitch.filter(x => x.p && x.slot.role !== 'GK' && (x.p.m.fit < 60 - (1 - c.temper) * 6 || x.p.m.inj || (x.p.m.yc && min < 75 && c.adapt > 0.6 && x.p.m.fit < 75)))
        .sort((a, b) => a.p.m.fit - b.p.m.fit);
      if (tired.length) {
        const x = tired[0];
        let line = x.p.pos;
        if (min >= 65 && diff < 0 && x.p.pos !== 'FW' && ts.subsLeft >= 2) line = 'FW';
        if (min >= 70 && diff > 0 && x.p.pos === 'FW' && c.adapt > 0.4) line = 'DF';
        const sub = bestSub(ts, x.p, line);
        if (sub) {
          const why = x.p.m.inj ? 'вынужденная замена' : x.p.m.yc && x.p.m.fit >= 60 ? 'страховка от второй жёлтой' : line !== x.p.pos ? (line === 'FW' ? 'нужен ещё один нападающий' : 'укрепляем оборону') : 'свежие ноги';
          match.substitute(side, x.p.id, sub.id, true);
          match.say('sub', `${ts.coach.name} меняет: ${sub.name} вместо ${x.p.name} (${why}).`, side);
          m.lastSubMove = match.moveNo;
        }
      }
    }
    // тактические изменения по счёту
    const stage = min >= 85 ? 3 : min >= 75 ? 2 : min >= 60 ? 1 : 0;
    if (stage && !m.done['s' + stage]) {
      m.done['s' + stage] = true;
      const react = c.temper * 0.6 + c.adapt * 0.6;
      if (diff < 0 && U.rnd() < react + 0.2) {
        if (ts.tac.mentality < 2) { match.setTactic(side, 'mentality', ts.tac.mentality + 1); coachSay(match, side, 'Проигрываем — вперёд! Менталитет атакующий.'); }
        if (stage >= 2 && c.adapt > 0.35 && ts.tac.plan !== 'direct' && ts.tac.plan !== 'wings') {
          const np = ts.club.players && xiProfile(ts.club, ts.tac.formation, ts.onPitch.filter(x => x.p).map(x => x.p.id)).dri > 11 ? 'wings' : 'direct';
          match.setTactic(side, 'plan', np);
          coachSay(match, side, `Меняем план на «${TAC.PLANS[np].n}».`);
        }
        if (stage >= 2 && c.adapt > 0.5 && ATTACK_SHIFT[ts.tac.formation] !== ts.tac.formation && ts.redCount === 0) {
          const nf = ATTACK_SHIFT[ts.tac.formation];
          match.setFormation(side, nf);
          coachSay(match, side, `Перестройка на ${nf} — больше людей в атаке.`);
        }
        if (stage === 3 && ts.tac.pressing < 2) { match.setTactic(side, 'pressing', 2); coachSay(match, side, 'Прессинг на максимум!'); }
      } else if (diff > 0 && U.rnd() < react + (diff === 1 ? 0.15 : -0.1)) {
        if (stage >= 2 && ts.tac.mentality > 0 && ts.coach.mentality < 1.7) { match.setTactic(side, 'mentality', ts.tac.mentality - 1); coachSay(match, side, 'Удерживаем счёт, без лишнего риска.'); }
        if (stage === 3 && diff === 1 && c.adapt > 0.5) {
          const nf = DEFENSE_SHIFT[ts.tac.formation];
          if (nf !== ts.tac.formation) { match.setFormation(side, nf); }
          match.setTactic(side, 'plan', 'park');
          coachSay(match, side, `Ставим автобус: ${ts.tac.formation}, все назад!`);
        }
      } else if (diff === 0 && stage >= 2) {
        const myR = TAC.teamRating(ts.club), oR = TAC.teamRating(match.t[match.other(side)].club);
        if (myR > oR + 0.5 && ts.tac.mentality < 2 && U.rnd() < react) { match.setTactic(side, 'mentality', 2); coachSay(match, side, 'Ничья нас не устраивает — атакуем!'); }
        else if (myR < oR - 1 && ts.tac.mentality > 0 && U.rnd() < react) { match.setTactic(side, 'mentality', 0); coachSay(match, side, 'Очко против фаворита — тоже результат.'); }
      }
    }
  }

  function halftime(match, side) {
    const ts = match.t[side];
    if (ts.ctrl !== 'ai') return;
    const c = ts.coach;
    const diff = match.score[side] - match.score[match.other(side)];
    const opp = match.t[match.other(side)];
    if (diff <= -2 && c.adapt > 0.3) {
      const nf = ATTACK_SHIFT[ts.tac.formation];
      if (nf !== ts.tac.formation && ts.redCount === 0) { match.setFormation(side, nf); coachSay(match, side, `В перерыве: переходим на ${nf}.`); }
      ts.tac.mentality = 2;
    } else if (diff < 0 && U.rnd() < c.adapt) {
      // анализ: где соперник нас обыгрывает
      if (opp.st.wins > ts.st.wins + 2 && ts.tac.plan !== 'direct') { ts.tac.plan = 'direct'; coachSay(match, side, 'Нас душат прессингом — играем проще, прямыми передачами.'); }
      else if (ts.tac.mentality < 2) { ts.tac.mentality++; coachSay(match, side, 'Во втором тайме добавляем в атаке.'); }
    } else if (diff > 0 && opp.st.xg > ts.st.xg + 0.6 && ts.tac.line > 0) {
      ts.tac.line--; coachSay(match, side, 'Ведём, но соперник создаёт много — опускаем линию.');
    }
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

  G.AI = { prepare, matchStart, think, halftime, onGoal, onRedCard, handleInjury, chooseMove, gemWeights, penaltyKick, penaltyDive, xiProfile };
})(typeof window !== 'undefined' ? window : globalThis);
