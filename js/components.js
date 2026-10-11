/* Общие компоненты интерфейса */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC, GFX = G.GFX, DATA = G.DATA;
  const el = U.el;

  const UI = {};

  UI.crest = (club, size) => {
    const s = el('span.crest-wrap');
    s.innerHTML = GFX.crest(club, size || 40);
    return s;
  };

  UI.toast = (text, type) => {
    const root = document.getElementById('toast-root');
    const t = el('div.toast' + (type ? '.' + type : ''), { text });
    root.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  };

  /* Модальное окно. buttons: [{text, cls, value, onClick}] — возвращает {el, close, result: Promise} */
  UI.modal = (opts) => {
    const root = document.getElementById('modal-root');
    const back = el('div.modal-back');
    const box = el('div.modal' + (opts.wide ? '.wide' : '') + (opts.cls ? '.' + opts.cls : ''));
    let resolve;
    const result = new Promise(r => { resolve = r; });
    const close = (v) => {
      back.classList.add('out');
      setTimeout(() => back.remove(), 250);
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose(v);
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape' && opts.closable !== false) close(null); };
    if (opts.title) {
      const head = el('div.modal-head', null, [el('h2', { text: opts.title })]);
      if (opts.closable !== false) head.appendChild(el('button.icon-btn.modal-x', { 'aria-label': 'Закрыть', onclick: () => close(null), html: '&times;' }));
      box.appendChild(head);
    }
    const body = el('div.modal-body');
    if (opts.content) body.appendChild(opts.content);
    box.appendChild(body);
    if (opts.buttons && opts.buttons.length) {
      const foot = el('div.modal-foot');
      opts.buttons.forEach(b => foot.appendChild(el('button.btn' + (b.cls ? '.' + b.cls : ''), {
        text: b.text, onclick: () => { if (b.onClick && b.onClick() === false) return; close(b.value != null ? b.value : b.text); }
      })));
      box.appendChild(foot);
    }
    back.appendChild(box);
    back.addEventListener('pointerdown', e => { if (e.target === back && opts.closable !== false) close(null); });
    root.appendChild(back);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => back.classList.add('in'));
    return { el: box, body, close, result };
  };

  /* Значки особенностей игрока (с подсказкой) */
  UI.traitIcons = (p) => {
    const s = el('span.trs');
    (p.tr || []).forEach(id => {
      const t = G.TRAITS.LIST[id];
      if (t) s.appendChild(el('i.tr.' + toneCls(t.tone), { text: t.i, title: `${t.n} — ${t.d}` }));
    });
    return s;
  };
  const toneCls = t => t === '+' ? 'pos' : t === '−' ? 'neg' : 'mix';
  UI.traitCard = (id) => {
    const t = G.TRAITS.LIST[id];
    return el('div.trc.' + toneCls(t.tone), null, [el('span.trc-i', { text: t.i }), el('div', null, [el('b', { text: t.n }), el('p', { text: t.d })])]);
  };
  /* Справочник всех особенностей */
  UI.traitsGuide = () => {
    const box = el('div.tr-guide');
    box.appendChild(el('p', { text: 'У каждого игрока может быть до трёх особенностей. Они срабатывают, пока игрок на поле, и меняют расчёты матча: силу блоков, удары, фолы, карточки, усталость, травмы. Зелёные — полезные, красные — вредные, жёлтые — палка о двух концах.' }));
    const grid = el('div.tr-grid');
    Object.keys(G.TRAITS.LIST).forEach(id => grid.appendChild(UI.traitCard(id)));
    box.appendChild(grid);
    return UI.modal({ title: `Особенности игроков (${Object.keys(G.TRAITS.LIST).length})`, content: box, wide: true, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
  };

  /* Индикатор формы */
  UI.formBadge = (p) => {
    const b = TAC.formBonus(p);
    const [ar, cls] = b >= 1.5 ? ['⇈', 'f2'] : b >= 0.5 ? ['↑', 'f1'] : b > -0.5 ? ['→', 'f0'] : b > -1.5 ? ['↓', 'fm1'] : ['⇊', 'fm2'];
    const last = (p.lastR || []).slice(-5).map(r => r.toFixed(1)).join(', ');
    return el('span.formb.' + cls, { text: ar, title: `Форма: ${TAC.formLabel(b)} (${b > 0 ? '+' : ''}${b.toFixed(1)} ко всем характеристикам)${last ? '\nПоследние оценки: ' + last : '\nЕщё не играл'}` });
  };

  UI.attrCell = (v) => {
    const s = el('span.attr', { text: v });
    s.style.setProperty('--ac', U.attrColor(v));
    return s;
  };

  UI.ovr = (p) => Math.round(TAC.overall(p) * 10) / 10;

  UI.stars = (r) => {
    // r ~ 12..18
    const n = U.clamp((r - 12.5) / 1.1 + 1, 0.5, 5);
    const s = el('span.stars');
    for (let i = 1; i <= 5; i++) s.appendChild(el('i' + (n >= i ? '.on' : n >= i - 0.5 ? '.half' : ''), { text: '★' }));
    return s;
  };

  UI.fitBar = (fit) => {
    const b = el('span.fit', { title: 'Свежесть ' + Math.round(fit) + '%' }, [el('i')]);
    b.firstChild.style.width = Math.round(fit) + '%';
    b.firstChild.style.background = fit > 80 ? '#00ff87' : fit > 60 ? '#e7d64a' : fit > 40 ? '#ff9f43' : '#ff4d6d';
    return b;
  };

  UI.playerModal = (p, club) => {
    const content = el('div.player-card');
    const head = el('div.pc-head', null, [
      el('div.pc-num', { text: p.num, style: { background: club.c1, color: GFX.isLight(club.c1) ? '#111' : '#fff' } }),
      el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${posName(p.pos)} · ${p.role} · ${p.age} ${U.plural(p.age, 'год', 'года', 'лет')}${p.star ? ' · ★ звезда' : ''}` })]),
      el('div.pc-ovr', null, [el('b', { text: UI.ovr(p).toFixed(1) }), el('small', { text: 'рейтинг' })])
    ]);
    content.appendChild(head);
    const attrs = el('div.pc-attrs');
    const list = DATA.ATTRS.slice();
    if (p.pos === 'GK') list.unshift(DATA.GK_ATTR);
    for (const a of list) {
      const v = p.a[a.k];
      const bar = el('div.pc-bar', null, [el('i')]);
      bar.firstChild.style.width = (v / 20 * 100) + '%';
      bar.firstChild.style.background = U.attrColor(v);
      attrs.appendChild(el('div.pc-attr', { title: a.d }, [el('span', { text: a.n }), bar, UI.attrCell(v)]));
    }
    content.appendChild(attrs);
    const fb = TAC.formBonus(p);
    const fbox = el('div.pc-form', null, [el('span', { text: 'Форма' }), UI.formBadge(p), el('b', { text: `${TAC.formLabel(fb)} · ${fb > 0 ? '+' : ''}${fb.toFixed(1)} ко всем характеристикам в матче` })]);
    const lr = el('div.pc-lastr', { title: 'Последние 5 оценок: слева старые, справа свежие. Свежие весят больше (5:4:3:2:1).' });
    (p.lastR || []).slice(-5).forEach(r => lr.appendChild(el('i', { text: r.toFixed(1), style: { background: r >= 7.5 ? 'rgba(0,255,135,.25)' : r >= 6.5 ? 'rgba(231,214,74,.2)' : 'rgba(255,77,109,.22)' } })));
    if (!lr.children.length) lr.appendChild(el('small', { text: 'нет сыгранных матчей' }));
    fbox.appendChild(lr);
    content.appendChild(fbox);
    if (p.dev) content.appendChild(el('div.pc-dev', { text: `Прошлое межсезонье: ${p.dev.total > 0 ? '+' : ''}${p.dev.total} к характеристикам` + (p.dev.avg ? ` (ср. оценка ${p.dev.avg.toFixed(2)}, ${p.dev.apps} матчей)` : ' (мало игровой практики)') }));
    if (p.tr && p.tr.length) {
      content.appendChild(el('div.pc-trh', null, [el('span', { text: 'Особенности' }), el('button.btn.ghost.small', { text: 'Все особенности', onclick: () => UI.traitsGuide() })]));
      const tl = el('div.pc-traits');
      p.tr.forEach(id => tl.appendChild(UI.traitCard(id)));
      content.appendChild(tl);
    } else content.appendChild(el('div.pc-trh', null, [el('span', { text: 'Особенностей нет — играет «по учебнику»' })]));
    const s = p.st;
    content.appendChild(el('div.pc-stats', null, [
      stat('Матчи', s.apps), stat('Голы', s.goals), stat('Ассисты', s.assists), stat('Ср. оценка', s.apps ? (s.rsum / s.apps).toFixed(2) : '—'), stat('ЖК', s.yc), stat('Свежесть', Math.round(p.fit) + '%')
    ]));
    if (p.inj > 0) content.appendChild(el('div.pc-warn', { text: `Травма: ещё ${p.inj} ${U.plural(p.inj, 'тур', 'тура', 'туров')}` }));
    if (p.susp > 0) content.appendChild(el('div.pc-warn', { text: `Дисквалификация: ${p.susp} ${U.plural(p.susp, 'матч', 'матча', 'матчей')}` }));
    UI.modal({ title: club.name, content, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
    function stat(n, v) { return el('div.pc-stat', null, [el('b', { text: v }), el('small', { text: n })]); }
  };

  function posName(p) { return { GK: 'Вратарь', DF: 'Защитник', MF: 'Полузащитник', FW: 'Нападающий' }[p]; }
  UI.posName = posName;
  UI.posShort = p => ({ GK: 'ВР', DF: 'ЗЩ', MF: 'ПЗ', FW: 'НП' }[p]);

  /* Распределение игроков по слотам новой схемы */
  UI.assign = (players, formation) => {
    const slots = TAC.FORMATIONS[formation];
    const out = new Array(slots.length).fill(null);
    const used = new Set();
    const gk = players.find(p => p && p.pos === 'GK');
    if (gk) { out[0] = gk; used.add(gk.id); }
    const pairs = [];
    slots.forEach((s, si) => { if (si === 0) return; players.forEach(p => { if (p && !used.has(p.id)) pairs.push({ si, p, v: TAC.roleRating(p, s.role) }); }); });
    pairs.sort((a, b) => b.v - a.v);
    for (const pr of pairs) { if (out[pr.si] || used.has(pr.p.id)) continue; out[pr.si] = pr.p; used.add(pr.p.id); }
    return out;
  };

  /* ---------- Редактор тактики ---------- */
  /* model: { club, getSlots():[{slot,p}], getBench():[p], swapPitch(i,j), swapBench(i,p) -> bool|string, setFormation(f), get(key), set(key,v), subsLeft?:()=>n, isMatch, auto?() } */
  UI.TacticsEditor = function (model) {
    const root = el('div.tactics');
    let selected = null; // {kind:'pitch', i} | {kind:'bench', p}
    const render = () => {
      root.innerHTML = '';
      const left = el('div.tac-left');
      const pitch = el('div.tac-pitch', null, [el('div.pl-box.top'), el('div.pl-box.bottom'), el('div.pl-circle'), el('div.pl-mid')]);
      const slots = model.getSlots();
      slots.forEach((x, i) => {
        const chip = el('button.chip' + (selected && selected.kind === 'pitch' && selected.i === i ? '.sel' : '') + (x.p ? '' : '.empty'));
        chip.style.left = x.slot.x + '%';
        chip.style.top = (100 - x.slot.y) + '%';
        if (x.p) {
          const r = TAC.roleRating(x.p, x.slot.role);
          const fit = x.p.m ? x.p.m.fit : x.p.fit;
          chip.append(
            el('span.chip-num', { text: x.p.num, style: { background: model.club.c1, color: GFX.isLight(model.club.c1) ? '#111' : '#fff', borderColor: model.club.c2 } }),
            el('span.chip-name', { text: shortName(x.p.name), title: (x.p.tr || []).map(id => G.TRAITS.LIST[id].i + ' ' + G.TRAITS.LIST[id].n).join('\n') }),
            UI.traitIcons(x.p),
            el('span.chip-meta', null, [el('b', { text: x.slot.label }), el('i', { text: r.toFixed(1), style: { color: U.attrColor(r) } }), UI.formBadge(x.p)]),
            UI.fitBar(fit)
          );
          if (x.p.pos !== TAC.ROLES[x.slot.role].line) chip.classList.add('offpos');
          if (x.p.m && x.p.m.yc) chip.appendChild(el('span.card-y'));
          if (x.p.m && x.p.m.inj) chip.appendChild(el('span.inj-ico', { text: '✚' }));
        } else chip.append(el('span.chip-name', { text: x.slot.role === 'GK' ? 'нет вратаря' : 'удалён' }));
        chip.onclick = () => clickPitch(i);
        pitch.appendChild(chip);
      });
      left.appendChild(pitch);
      const hint = el('div.tac-hint', { text: model.isMatch ? `Нажмите на игрока на поле, затем на запасного — замена (осталось: ${model.subsLeft()}). Два игрока на поле — поменять местами.` : 'Нажмите на игрока, затем на другого игрока или запасного, чтобы поменять их местами.' });
      left.appendChild(hint);

      const right = el('div.tac-right');
      // схема
      const fsec = el('div.tac-sec', null, [el('h4', { text: 'Схема' })]);
      const fgrid = el('div.seg.wrap');
      Object.keys(TAC.FORMATIONS).forEach(f => fgrid.appendChild(el('button' + (model.get('formation') === f ? '.on' : ''), { text: f, onclick: () => { model.setFormation(f); selected = null; render(); } })));
      fsec.appendChild(fgrid);
      right.appendChild(fsec);
      // план
      const psec = el('div.tac-sec', null, [el('h4', { text: 'План на игру' })]);
      const pgrid = el('div.plans');
      for (const k in TAC.PLANS) {
        const pl = TAC.PLANS[k];
        pgrid.appendChild(el('button.plan' + (model.get('plan') === k ? '.on' : ''), { title: pl.d, onclick: () => { model.set('plan', k); render(); } }, [el('span.plan-ico', { text: pl.icon }), el('span.plan-n', { text: pl.n })]));
      }
      psec.appendChild(pgrid);
      psec.appendChild(el('div.plan-desc', { text: TAC.PLANS[model.get('plan')].d }));
      right.appendChild(psec);
      // ползунки
      const seg = (title, key, names, desc) => {
        const s = el('div.tac-sec.row', null, [el('h4', { text: title, title: desc })]);
        const g = el('div.seg');
        names.forEach((n, i) => g.appendChild(el('button' + (model.get(key) === i ? '.on' : ''), { text: n, onclick: () => { model.set(key, i); render(); } })));
        s.appendChild(g);
        return s;
      };
      right.appendChild(seg('Менталитет', 'mentality', TAC.MENTALITY, 'Атака усиливает продвижение и удары, но ослабляет оборону'));
      right.appendChild(seg('Прессинг', 'pressing', TAC.PRESSING, 'Высокий прессинг сильнее отбирает, но быстрее утомляет игроков'));
      right.appendChild(seg('Линия обороны', 'line', TAC.LINE, 'Высокая: прессинг и офсайдные ловушки, но уязвимость к скорости. Низкая: щит у своей штрафной'));
      // скамейка
      const bsec = el('div.tac-sec', null, [el('h4', { text: model.isMatch ? `Скамейка · замен: ${model.subsLeft()}` : 'Скамейка' })]);
      const bl = el('div.bench');
      model.getBench().forEach(p => {
        const fit = p.m ? p.m.fit : p.fit;
        const b = el('button.bench-p' + (selected && selected.kind === 'bench' && selected.p === p ? '.sel' : ''), { onclick: () => clickBench(p) }, [
          el('span.bp-pos', { text: UI.posShort(p.pos) }), el('span.bp-name', { text: p.name }), UI.traitIcons(p), UI.formBadge(p), el('span.bp-ovr', { text: UI.ovr(p).toFixed(1), style: { color: U.attrColor(UI.ovr(p)) } }), UI.fitBar(fit)
        ]);
        bl.appendChild(b);
      });
      bsec.appendChild(bl);
      right.appendChild(bsec);
      if (model.auto) right.appendChild(el('button.btn.ghost.small', { text: '⟳ Автосостав', onclick: () => { model.auto(); selected = null; render(); } }));
      root.append(left, right);
    };
    const clickPitch = (i) => {
      if (!selected) { selected = { kind: 'pitch', i }; render(); return; }
      if (selected.kind === 'pitch') {
        if (selected.i !== i) model.swapPitch(selected.i, i);
        selected = null; render(); return;
      }
      const r = model.swapBench(i, selected.p);
      if (typeof r === 'string') UI.toast(r, 'warn');
      selected = null; render();
    };
    const clickBench = (p) => {
      if (selected && selected.kind === 'pitch') {
        const r = model.swapBench(selected.i, p);
        if (typeof r === 'string') UI.toast(r, 'warn');
        selected = null; render(); return;
      }
      selected = selected && selected.p === p ? null : { kind: 'bench', p };
      render();
    };
    render();
    root.refresh = render;
    return root;
  };

  function shortName(n) {
    const parts = n.split(' ');
    return parts.length > 1 ? parts[0][0] + '. ' + parts.slice(1).join(' ') : n;
  }
  UI.shortName = shortName;

  /* Модель редактора для предматчевой тактики */
  UI.prematchModel = (club, tac) => {
    const map = TAC.playerMap(club);
    return {
      club, isMatch: false,
      getSlots: () => TAC.FORMATIONS[tac.formation].map((s, i) => ({ slot: s, p: map[tac.lineup[i]] || null })),
      getBench: () => tac.bench.map(id => map[id]).filter(Boolean).concat(club.players.filter(p => !tac.lineup.includes(p.id) && !tac.bench.includes(p.id) && TAC.available(p))),
      swapPitch(i, j) { const t = tac.lineup[i]; tac.lineup[i] = tac.lineup[j]; tac.lineup[j] = t; },
      swapBench(i, p) {
        if (!TAC.available(p)) return 'Игрок недоступен';
        const out = tac.lineup[i];
        tac.lineup[i] = p.id;
        const bi = tac.bench.indexOf(p.id);
        if (bi >= 0) tac.bench[bi] = out; else { tac.bench.unshift(out); if (tac.bench.length > 9) tac.bench.pop(); }
        return true;
      },
      setFormation(f) {
        const players = tac.lineup.map(id => map[id]);
        const arr = UI.assign(players, f);
        tac.formation = f; tac.lineup = arr.map(p => p ? p.id : null);
      },
      get: k => tac[k], set: (k, v) => { tac[k] = v; },
      auto() { const xi = TAC.bestXI(club, tac.formation); tac.lineup = xi.lineup; tac.bench = xi.bench; }
    };
  };

  /* Модель редактора по ходу матча */
  UI.matchModel = (match, side) => {
    const ts = match.t[side];
    return {
      club: ts.club, isMatch: true,
      getSlots: () => ts.onPitch,
      getBench: () => ts.bench.filter(p => !ts.used.has(p.id)),
      subsLeft: () => ts.subsLeft,
      swapPitch(i, j) {
        const a = ts.onPitch[i], b = ts.onPitch[j];
        if ((a.slot.role === 'GK') !== (b.slot.role === 'GK') && !(a.p && b.p)) return;
        const t = a.p; a.p = b.p; b.p = t;
      },
      swapBench(i, p) {
        const x = ts.onPitch[i];
        if (!x.p) return 'Удалённого игрока заменить нельзя';
        if (ts.subsLeft <= 0) return 'Лимит замен исчерпан';
        match.substitute(side, x.p.id, p.id);
        return true;
      },
      setFormation(f) { match.setFormation(side, f); match.say('tactic', `${ts.club.name}: перестройка на ${f}.`, side); },
      get: k => ts.tac[k],
      set: (k, v) => { match.setTactic(side, k, v); }
    };
  };

  G.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
