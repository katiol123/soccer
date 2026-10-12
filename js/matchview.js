/* Экран матча: связывает движок, анимированное поле и интерфейс */
(function (G) {
  'use strict';
  const U = G.U, UI = G.UI, TAC = G.TAC, BOARD = G.BOARD, AI = G.AI, SFX = G.SFX, FX = G.FX;
  const el = U.el;

  const ATT_TXT = rp => [
    rp >= 3 ? (rp === 4 ? 'УДАР по воротам!' : 'Дальний удар') : '+ угроза (заряд удара)',
    rp === 4 ? '+ к моменту' : 'Продвижение пасом',
    rp === 4 ? '+ к моменту' : 'Продвижение, снимает прессинг; 4+ — финт',
    rp === 4 ? '+ к моменту' : 'Рывок (×1.8 в контратаке)',
    'Борьба за мяч: снимает прессинг',
    rp >= 3 ? 'Открывания: + к моменту, подачи' : 'Открывания: продвижение'
  ];
  const DEF_TXT = () => [
    'Блок: снимает угрозу, + щит',
    'Перехват: + прессинг',
    'Заряд для контратаки',
    'Возврат назад: − темп соперника',
    'ПРЕССИНГ → отбор мяча (риск фола)',
    'Щит: ослабляет атаки и удары'
  ];

  class MatchScreen {
    constructor(opts) {
      this.o = opts;
      this.match = opts.match;
      this.watch = this.match.t.home.ctrl === 'ai' && this.match.t.away.ctrl === 'ai';
      this.speed = this.watch ? 1.5 : 1;
      this.autoHuman = false;
      this.feedCount = 0;
      this.tab = 'feed';
    }

    humanSide() {
      if (this.match.t.home.ctrl === 'human') return 'home';
      if (this.match.t.away.ctrl === 'human') return 'away';
      return null;
    }

    build() {
      const m = this.match, H = m.t.home.club, A = m.t.away.club;
      const root = el('div.screen.match-screen');
      root.style.setProperty('--home', G.GFX.teamColor(H)); root.style.setProperty('--away', G.GFX.teamColor(A));
      root.style.setProperty('--home2', H.c2); root.style.setProperty('--away2', A.c2);
      // табло
      const sb = el('div.scorebar');
      const team = (club, side) => el('div.sb-team.' + side, null, [UI.crest(club, 46), el('div.sb-tn', null, [el('b', { text: club.name }), el('small', { text: club.coach.name + (m.t[side].ctrl === 'human' ? ' · вы' : ' · ИИ') })])]);
      this.scoreEl = el('div.sb-score', { text: '0 : 0' });
      this.timeEl = el('div.sb-time', { text: "1'" });
      this.progEl = el('div.sb-prog', null, [el('i')]);
      sb.append(team(H, 'home'), el('div.sb-center', null, [this.scoreEl, this.timeEl, this.progEl]), team(A, 'away'));
      root.appendChild(sb);

      const grid = el('div.match-grid');
      // левая панель
      const left = el('aside.mpanel.mleft');
      this.pitch = el('div.mini-pitch');
      for (let z = 0; z < 5; z++) this.pitch.appendChild(el('div.zone', { 'data-z': z }));
      this.pitch.append(el('div.mp-line'), el('div.mp-circle'), el('div.mp-box.l'), el('div.mp-box.r'), el('div.mp-goal.l'), el('div.mp-goal.r'));
      this.ballEl = el('div.mp-ball');
      this.arrowEl = el('div.mp-arrow');
      this.pitch.append(this.arrowEl, this.ballEl);
      left.appendChild(el('div.mp-wrap', null, [el('div.mp-labels', null, [el('span', { text: H.short }), el('span', { text: 'атака →  ← атака' }), el('span', { text: A.short })]), this.pitch]));
      this.sitEl = el('div.situation');
      left.appendChild(this.sitEl);
      this.meters = {};
      const meter = (k, label, cls) => {
        const m = el('div.meter' + (cls ? '.' + cls : ''), null, [el('div.meter-top', null, [el('span', { text: label }), el('b', { text: '0' })]), el('div.meter-bar', null, [el('i')])]);
        this.meters[k] = m; return m;
      };
      left.appendChild(el('div.meters', null, [meter('mom', 'Темп атаки'), meter('charge', 'Угроза воротам'), meter('press', 'Прессинг обороны'), meter('cc', 'Заряд контратаки'),
        meter('shH', 'Щит ' + H.short, 'home'), meter('shA', 'Щит ' + A.short, 'away')]));
      this.legendEl = el('div.legend');
      left.appendChild(this.legendEl);
      grid.appendChild(left);

      // центр
      const center = el('main.mcenter');
      this.turnEl = el('div.turn-ind');
      center.appendChild(this.turnEl);
      this.boardHost = el('div.board-host');
      center.appendChild(this.boardHost);
      const bar = el('div.action-bar');
      const hs = this.humanSide();
      if (hs) {
        bar.appendChild(el('button.btn.small', { html: '⚙ Тактика', onclick: () => this.openTactics() }));
        bar.appendChild(el('button.btn.small.ghost', { html: '💡 Подсказка', onclick: () => this.hint() }));
        this.autoBtn = el('button.btn.small.ghost', { html: '🤖 Автоигра', title: 'ИИ-ассистент делает ходы за вас', onclick: () => { this.autoHuman = !this.autoHuman; this.autoBtn.classList.toggle('on', this.autoHuman); if (this.autoHuman && this.humanWait) this.humanWait(null); } });
        bar.appendChild(this.autoBtn);
      }
      const spd = el('div.seg.speed');
      [[1, '×1'], [1.5, '×1.5'], [2.5, '×2.5'], [5, '×5']].forEach(([v, t]) => spd.appendChild(el('button' + (v === this.speed ? '.on' : ''), { text: t, onclick: (e) => { this.setSpeed(v); U.$$('button', spd).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); } })));
      bar.appendChild(spd);
      if (this.watch) bar.appendChild(el('button.btn.small.ghost', { text: '⏭ Досимулировать', onclick: () => { this.skip = true; } }));
      this.sndBtn = el('button.icon-btn', { title: 'Звук', text: SFX.on ? '🔊' : '🔇', onclick: () => { SFX.on = !SFX.on; this.sndBtn.textContent = SFX.on ? '🔊' : '🔇'; if (this.o.onSound) this.o.onSound(SFX.on); } });
      bar.appendChild(this.sndBtn);
      center.appendChild(bar);
      grid.appendChild(center);

      // правая панель
      const right = el('aside.mpanel.mright');
      const tabs = el('div.tabs');
      [['feed', 'Комментарий'], ['stats', 'Статистика'], ['lineups', 'Составы']].forEach(([k, t]) => tabs.appendChild(el('button' + (k === this.tab ? '.on' : ''), { text: t, 'data-k': k, onclick: () => { this.tab = k; U.$$('button', tabs).forEach(b => b.classList.toggle('on', b.dataset.k === k)); this.renderTab(); } })));
      right.appendChild(tabs);
      this.feedEl = el('div.feed');
      this.tabEl = el('div.tab-body');
      right.append(this.feedEl, this.tabEl);
      grid.appendChild(right);
      root.appendChild(grid);
      this.root = root;
      return root;
    }

    setSpeed(v) { this.speed = v; if (this.bv) this.bv.speed = v; }

    async run() {
      const m = this.match;
      this.bv = new G.BoardView(this.boardHost, { onSwap: (a, b) => this.onHumanSwap(a, b) });
      this.bv.speed = this.speed;
      this.bv.setBoard(m.board);
      this.renderHud(m.hud());
      this.renderFeed();
      this.renderTab();
      await U.sleep(400);
      SFX.whistle(true);
      this.bv.banner('НАЧАЛО МАТЧА');
      await U.sleep(900 / this.speed);
      while (!m.over) {
        if (this.skip) { await this.skipToEnd(); break; }
        if (m.halftime) { m.halftime = false; await this.halftime(); continue; }
        if (m.pending) { await this.penalty(); continue; }
        if (m.injPending) { await this.injuryPause(); continue; }
        await this.turn();
      }
      this.bv.setEnabled(false);
      SFX.whistle(true);
      this.renderAll();
      await U.sleep(600);
      return m;
    }

    async skipToEnd() {
      const m = this.match;
      this.bv.setEnabled(false);
      m.log = false;
      m.simulate();
      m.log = true;
      this.bv.sync();
      this.renderAll();
    }

    async turn() {
      const m = this.match, side = m.cur, ts = m.t[side];
      this.renderTurn();
      let mv;
      if (ts.ctrl === 'human' && !this.autoHuman) {
        mv = await this.waitHuman();
        if (!mv) return; // переключение на автоигру или пауза
      } else {
        await U.sleep((this.watch ? 380 : 520) / this.speed);
        const choice = AI.chooseMove(m, side, ts.ctrl === 'human' ? { skill: 0.9 } : null);
        if (!choice) { m.board.shuffle(); await this.bv.shuffleAnim(); return; }
        this.bv.showHint(choice);
        await U.sleep(260 / this.speed);
        this.bv.clearHint();
        mv = choice;
      }
      await this.execute(mv.a, mv.b);
    }

    waitHuman() {
      this.bv.setEnabled(true);
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this.hint(true), 12000);
      return new Promise(res => {
        this.humanWait = (mv) => { this.humanWait = null; clearTimeout(this.hintTimer); this.bv.setEnabled(false); res(mv); };
      });
    }

    async onHumanSwap(a, b) {
      if (!this.humanWait) return;
      const valid = this.match.board.isValidSwap(a, b);
      if (!valid) {
        this.bv.setEnabled(false);
        await this.bv.animSwap(a, b, false);
        this.bv.setEnabled(true);
        return;
      }
      this.bv.clearHint();
      this.humanWait({ a, b });
    }

    hint(soft) {
      const hs = this.humanSide();
      if (!hs || this.match.cur !== hs || !this.humanWait) return;
      const mv = AI.chooseMove(this.match, hs, { skill: 1 });
      if (mv) { this.bv.showHint(mv); if (!soft) UI.toast('Помощник тренера рекомендует этот ход'); }
    }

    async execute(a, b) {
      const m = this.match;
      const prevHud = m.hud();
      await this.bv.animSwap(a, b, true);
      const out = m.playMove(a, b);
      if (!out) { this.bv.sync(); return; }
      let goalFx = null;
      await this.bv.playSteps(out.res.steps, (i, st, byType) => {
        const fx = out.stepFx[i] || [];
        this.showStepFx(fx, st, byType, out.side, i === 0 && out.critical);
        const s = fx.find(f => f.k === 'state');
        if (s) this.renderHud(s.s);
        const g = fx.find(f => f.k === 'goal');
        if (g) goalFx = g;
      });
      if (out.shuffled) await this.bv.shuffleAnim();
      this.bv.sync();
      this.renderFeed();
      if (goalFx) await this.celebrate(goalFx.goal);
      if (out.extra && !m.over && !m.pending && m.cur === out.side) this.bv.banner('ЕЩЁ ХОД!', '#00ff87');
      this.renderAll();
    }

    showStepFx(fx, st, byType, side, critical) {
      // подписи эффектов возле сожжённых блоков
      const shown = new Set();
      if (critical) this.bv.banner('РЕШАЮЩИЙ МОМЕНТ ×1.5', '#ffd23f');
      for (const f of fx) {
        if (f.t != null && byType[f.t] && !shown.has(f.t)) {
          const cells = byType[f.t];
          const r = U.avg(cells, c => c.r), c = U.avg(cells, c => c.c);
          this.bv.floatText(f.text, r, c, BOARD.GEMS[f.t].color);
          shown.add(f.t);
        } else if (['event', 'shot', 'save', 'miss', 'advance', 'special', 'combo'].includes(f.k)) {
          const color = f.k === 'save' ? '#04f5ff' : f.k === 'shot' ? '#ff3b5c' : f.k === 'advance' ? '#00ff87' : '#fff';
          if (f.k === 'advance' && !f.text) continue;
          this.bv.banner(f.text, color);
          if (f.k === 'shot') SFX.kick();
          if (f.k === 'save') SFX.save();
          if (f.text === 'ОТБОР!') SFX.tackle();
          if (f.text === 'ФОЛ!' || f.text === 'ОФСАЙД!') SFX.whistle(false);
        }
      }
    }

    async celebrate(g) {
      const m = this.match, club = m.t[g.side].club;
      SFX.goal();
      FX.confetti([club.c1, club.c2, '#ffffff', '#00ff87'], this.speed > 2 ? 60 : 160);
      const ov = el('div.goal-overlay', null, [
        el('div.go-sweep'),
        el('div.go-word', null, 'ГОЛ!'.split('').map((ch, i) => el('span', { text: ch, style: { animationDelay: (i * 70) + 'ms' } }))),
        el('div.go-info', null, [UI.crest(club, 54), el('div', null, [el('b', { text: g.scorer + ' ' + g.min }), el('small', { text: g.assist ? 'Ассист: ' + g.assist : ({ pen: 'С пенальти', fk: 'Со штрафного', header: 'Головой', long: 'Издали' }[g.kind] || '') })])]),
        el('div.go-score', { text: `${m.t.home.club.short} ${m.score.home} : ${m.score.away} ${m.t.away.club.short}` })
      ]);
      ov.style.setProperty('--gc', club.c1); ov.style.setProperty('--gc2', club.c2);
      this.root.appendChild(ov);
      this.root.classList.add('shake-screen');
      setTimeout(() => this.root.classList.remove('shake-screen'), 600);
      await U.sleep(Math.max(900, 2600 / Math.min(this.speed, 2.5)));
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 400);
    }

    /* ---------- HUD ---------- */
    renderHud(s) {
      const m = this.match;
      this.scoreEl.textContent = `${s.score.home} : ${s.score.away}`;
      if (this._lastScore && (this._lastScore.home !== s.score.home || this._lastScore.away !== s.score.away)) {
        this.scoreEl.classList.remove('bump'); void this.scoreEl.offsetWidth; this.scoreEl.classList.add('bump');
      }
      this._lastScore = s.score;
      this.timeEl.textContent = m.over ? 'Матч окончен' : `${m.minuteLabel()} · ${m.half} тайм`;
      this.progEl.firstChild.style.width = (m.progress() * 100) + '%';
      // мини-поле
      const possColor = s.poss === 'home' ? 'var(--home)' : 'var(--away)';
      const x = 10 + s.ball * 20;
      let frac = Math.min(1, s.mom);
      const dir = s.poss === 'home' ? 1 : -1;
      const bx = s.ball === (s.poss === 'home' ? 4 : 0) ? x : x + dir * frac * 9;
      this.ballEl.style.left = bx + '%';
      this.ballEl.style.setProperty('--pc', possColor);
      this.arrowEl.style.left = bx + '%';
      this.arrowEl.className = 'mp-arrow ' + s.poss;
      this.arrowEl.style.setProperty('--pc', possColor);
      U.$$('.zone', this.pitch).forEach((z, i) => { z.classList.toggle('on', i === s.ball); z.style.setProperty('--pc', possColor); });
      const att = s.poss, def = att === 'home' ? 'away' : 'home';
      const rp = att === 'home' ? s.ball : 4 - s.ball;
      this.setMeter('mom', rp === 4 ? 100 : frac * 100, rp === 4 ? 'в штрафной' : Math.round(frac * 100) + '%', possColor);
      this.setMeter('charge', s.charge[att], Math.round(s.charge[att]) + (rp >= 3 ? ' / 60 авто' : ''), '#ff3b5c');
      this.setMeter('press', s.pressure[def], Math.round(s.pressure[def]) + ' / 100', def === 'home' ? 'var(--home)' : 'var(--away)');
      this.setMeter('cc', s.cc[def] / 70 * 100, Math.round(s.cc[def]), '#22d36b');
      this.setMeter('shH', s.shield.home, Math.round(s.shield.home), '#b45cff');
      this.setMeter('shA', s.shield.away, Math.round(s.shield.away), '#b45cff');
      // ситуация
      let sit = '', sc = '';
      const an = m.t[att].club.name;
      if (s.setPiece) { sit = `Угловой у «${m.t[s.setPiece].club.name}» — фиолетовые или красные блоки замыкают подачу`; sc = 'hot'; }
      else if (s.counter) { sit = `⚡ Контратака «${m.t[s.counter.side].club.name}»: рывки ×${s.counter.mult}`; sc = 'hot'; }
      else if (rp === 4) { sit = `«${an}» в штрафной! Красные блоки — удар`; sc = 'hot'; }
      else if (rp === 3) { sit = `«${an}» на подступах к штрафной — возможен дальний удар`; }
      else if (s.pressure[def] > 65) { sit = `Сильный прессинг «${m.t[def].club.name}» — мяч может быть потерян`; sc = 'warn'; }
      else sit = `Мяч у «${an}» ${['у своих ворот', 'на своей половине', 'в центре поля'][rp] || ''}`;
      this.sitEl.textContent = sit;
      this.sitEl.className = 'situation ' + sc;
      this._hud = s;
    }

    setMeter(k, pct, label, color) {
      const mm = this.meters[k];
      mm.querySelector('i').style.width = U.clamp(pct, 0, 100) + '%';
      if (color) mm.querySelector('i').style.background = color;
      mm.querySelector('b').textContent = label;
    }

    renderTurn() {
      const m = this.match, side = m.cur, ts = m.t[side];
      const human = ts.ctrl === 'human' && !this.autoHuman;
      const att = m.poss === side;
      this.turnEl.innerHTML = '';
      this.turnEl.className = 'turn-ind ' + side + (human ? ' you' : '');
      this.turnEl.append(UI.crest(ts.club, 22), el('b', { text: human ? 'ВАШ ХОД' : `Ходит ${ts.club.name}` }), el('span', { text: att ? ' · атака' : ' · оборона' }));
      this.boardHost.style.setProperty('--turn', side === 'home' ? 'var(--home)' : 'var(--away)');
      this.renderLegend();
    }

    renderLegend() {
      const m = this.match, side = m.cur, s = this._hud;
      if (!s) return;
      const att = m.poss === side;
      const rp = m.rp(m.poss);
      const txt = att ? ATT_TXT(rp) : DEF_TXT();
      this.legendEl.innerHTML = '';
      this.legendEl.appendChild(el('div.legend-h', { text: `Что дают блоки ${m.t[side].ctrl === 'human' && !this.autoHuman ? 'вам' : '«' + m.t[side].club.short + '»'} сейчас (${att ? 'атака' : 'оборона'})` }));
      BOARD.GEMS.forEach((g, i) => {
        const ic = el('span.lg-ico.t' + i);
        ic.innerHTML = G.GFX.GEM_ICONS[i];
        this.legendEl.appendChild(el('div.lg-row', null, [ic, el('b', { text: g.n }), el('span', { text: txt[i] })]));
      });
    }

    renderFeed() {
      const evs = this.match.events;
      for (; this.feedCount < evs.length; this.feedCount++) {
        const e = evs[this.feedCount];
        if (e.quiet) continue;
        const side = e.side;
        const item = el('div.fe.' + e.kind + (side ? '.' + side : ''), null, [el('span.fe-min', { text: e.min }), el('span.fe-ico', { text: ICONS[e.kind] || '•' }), el('span.fe-txt', { text: e.text })]);
        this.feedEl.prepend(item);
      }
    }

    renderTab() {
      const m = this.match;
      this.feedEl.style.display = this.tab === 'feed' ? '' : 'none';
      this.tabEl.style.display = this.tab === 'feed' ? 'none' : '';
      this.tabEl.innerHTML = '';
      if (this.tab === 'stats') this.tabEl.appendChild(statsBlock(m));
      if (this.tab === 'lineups') this.tabEl.appendChild(lineupsBlock(m));
    }
    renderAll() { this.renderHud(this.match.hud()); this.renderFeed(); this.renderTab(); this.renderTurn(); }

    /* ---------- перерыв / тактика ---------- */
    async halftime() {
      const m = this.match;
      SFX.whistle(true);
      this.renderAll();
      this.bv.banner('ПЕРЕРЫВ');
      const hs = this.humanSide();
      if (!hs || this.watch) { await U.sleep(1500 / this.speed); return; }
      const content = el('div.halftime', null, [
        el('div.ht-score', { text: `${m.t.home.club.name} ${m.score.home} : ${m.score.away} ${m.t.away.club.name}` }),
        statsBlock(m),
        el('div.ht-notes', null, m.t[m.other(hs)].notes.slice(-3).map(n => el('div', { text: '🧠 ' + m.t[m.other(hs)].coach.name + ': ' + n })))
      ]);
      const md = UI.modal({ title: 'Перерыв', content, closable: false, buttons: [{ text: '⚙ Тактика и замены', cls: 'ghost', value: 'tac' }, { text: 'Второй тайм ▶', cls: 'primary', value: 'go' }] });
      const v = await md.result;
      if (v === 'tac') await this.openTactics();
      SFX.whistle(false);
    }

    /* Травма у игрока пользователя: пауза и предложение замены */
    async injuryPause() {
      const m = this.match, { side, p } = m.injPending;
      m.injPending = null;
      const ts = m.t[side];
      if (!ts.onPitch.some(x => x.p === p)) return;
      if (this.autoHuman) { AI.handleInjury(m, side, p); this.renderAll(); return; }
      this.renderAll();
      this.bv.banner('ТРАВМА');
      const content = el('div', null, [el('p', { text: `${p.name} получил травму и не может продолжать в полную силу (свежесть ${Math.round(p.m.fit)}%).` }), el('p.muted', { text: ts.subsLeft > 0 ? `Замен осталось: ${ts.subsLeft}.` : 'Замен не осталось — игроку придётся доигрывать.' })]);
      const btns = ts.subsLeft > 0 ? [{ text: 'Доиграет', cls: 'ghost', value: 'stay' }, { text: '🔄 Сделать замену', cls: 'primary', value: 'sub' }] : [{ text: 'Продолжить', cls: 'primary', value: 'stay' }];
      const v = await UI.modal({ title: '✚ Травма', content, closable: false, buttons: btns }).result;
      if (v === 'sub') await this.openTactics();
    }

    openTactics() {
      const hs = this.humanSide();
      if (!hs) return Promise.resolve();
      const ed = UI.TacticsEditor(UI.matchModel(this.match, hs));
      const md = UI.modal({ title: 'Тактика по ходу матча', content: ed, wide: true, buttons: [{ text: 'Готово', cls: 'primary' }], onClose: () => { this.renderFeed(); this.renderTab(); } });
      return md.result;
    }

    /* ---------- пенальти ---------- */
    async penalty() {
      const m = this.match, side = m.pending.side, ts = m.t[side], ds = m.other(side);
      const kicker = m.pickShooter(side, 'pen'), gk = m.t[ds].gk();
      const hs = this.autoHuman ? null : this.humanSide();
      let kDir = null, gDir = null;
      const goal = el('div.pen-goal', null, [el('div.pen-net'), el('div.pen-keeper', { text: '🧤' }), el('div.pen-ball', { text: '⚽' })]);
      const info = el('div.pen-info', { text: `${kicker ? kicker.name : ''} против ${gk ? gk.name : 'вратаря'}` });
      const zones = el('div.pen-zones');
      const content = el('div.penalty', null, [info, goal, zones]);
      const md = UI.modal({ title: `Пенальти! «${ts.club.name}»`, content, closable: false });
      let pick = null;
      if (hs === side || hs === ds) {
        const asKicker = hs === side;
        info.textContent = asKicker ? `Вы бьёте: ${kicker.name} (Удар ${kicker.a.sho}, Хладн. ${kicker.a.com}). Куда?` : `Вы в воротах: ${gk ? gk.name + ' (Рефлексы ' + gk.a.ref + ')' : ''}. Куда прыгать?`;
        pick = await new Promise(res => {
          ['Влево', 'По центру', 'Вправо'].forEach((t, i) => zones.appendChild(el('button.btn' + (i === 1 ? '.ghost' : ''), { text: t, onclick: () => res(i) })));
        });
        zones.innerHTML = '';
        if (asKicker) kDir = pick; else gDir = pick;
      } else await U.sleep(700 / this.speed);
      const r = m.resolvePenalty(kDir, gDir);
      const kp = ['18%', '50%', '82%'];
      goal.querySelector('.pen-keeper').style.left = kp[r.gDir];
      goal.querySelector('.pen-keeper').classList.add('dive' + r.gDir);
      SFX.kick();
      const ball = goal.querySelector('.pen-ball');
      ball.style.left = kp[r.kDir];
      ball.style.top = r.result === 'miss' ? '-20%' : '30%';
      ball.style.transform = 'translate(-50%,-50%) scale(.6)';
      await U.sleep(700);
      info.textContent = r.result === 'goal' ? 'ГОЛ!' : r.result === 'saved' ? 'ВРАТАРЬ ОТРАЗИЛ!' : 'МИМО!';
      info.className = 'pen-info big ' + r.result;
      if (r.result === 'saved') SFX.save();
      await U.sleep(1100);
      md.close();
      this.bv.sync();
      this.renderFeed();
      const g = r.fx.find(f => f.k === 'goal');
      if (g) await this.celebrate(g.goal);
      this.renderAll();
    }
  }

  const ICONS = { goal: '⚽', save: '🧤', miss: '↗', yellow: '🟨', red: '🟥', foul: '✋', sub: '🔄', tactic: '🧠', corner: '⚑', offside: '🚩', tackle: '🛡', counter: '⚡', half: '⏸', end: '🏁', whistle: '📣', penalty: '🎯', injury: '✚', danger: '🔥', advance: '➜', skill: '✨', clear: '🧱', info: '•', trait: '✦' };

  function statsBlock(m) {
    const h = m.t.home.st, a = m.t.away.st;
    const possH = Math.round(100 * h.poss / Math.max(1, h.poss + a.poss));
    const rows = [
      ['Владение', possH + '%', (100 - possH) + '%', possH, 100 - possH],
      ['Удары', h.shots, a.shots], ['В створ', h.onT, a.onT], ['xG', h.xg.toFixed(2), a.xg.toFixed(2), h.xg, a.xg],
      ['Угловые', h.corners, a.corners], ['Отборы', h.wins, a.wins], ['Фолы', h.fouls, a.fouls], ['Офсайды', h.offsides, a.offsides], ['Жёлтые', h.yc, a.yc], ['Красные', h.rc, a.rc]
    ];
    const box = el('div.stats');
    box.style.setProperty('--home', G.GFX.teamColor(m.t.home.club));
    box.style.setProperty('--away', G.GFX.teamColor(m.t.away.club));
    for (const r of rows) {
      const hv = r[3] != null ? r[3] : +r[1], av = r[4] != null ? r[4] : +r[2];
      const tot = hv + av || 1;
      const bar = el('div.st-bar', null, [el('i.h'), el('i.a')]);
      bar.children[0].style.width = (hv / tot * 100) + '%';
      bar.children[1].style.width = (av / tot * 100) + '%';
      box.appendChild(el('div.st-row', null, [el('div.st-top', null, [el('b', { text: r[1] }), el('span', { text: r[0] }), el('b', { text: r[2] })]), bar]));
    }
    // график давления
    const hist = m.momentumHistory;
    if (hist.length > 2) {
      const w = 300, hgt = 60;
      const pts = hist.map((v, i) => `${(i / (hist.length - 1) * w).toFixed(1)},${(hgt / 2 - v / 2.5 * (hgt / 2)).toFixed(1)}`).join(' ');
      const svg = `<svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" class="mom-chart"><defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--home)"/><stop offset=".5" stop-color="rgba(255,255,255,.2)"/><stop offset="1" stop-color="var(--away)"/></linearGradient></defs><line x1="0" y1="${hgt / 2}" x2="${w}" y2="${hgt / 2}" stroke="rgba(255,255,255,.15)"/><polyline points="${pts}" fill="none" stroke="url(#mg)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
      box.appendChild(el('div.st-chart', null, [el('div.st-chart-h', { text: 'Ход игры: вверх — атака хозяев, вниз — атака гостей' }), el('div', { html: svg })]));
    }
    return box;
  }

  function lineupsBlock(m) {
    const box = el('div.lineups');
    for (const s of ['home', 'away']) {
      const ts = m.t[s];
      const col = el('div.lu-col', null, [el('h4', null, [UI.crest(ts.club, 20), ' ' + ts.club.short + ' · ' + ts.tac.formation + ' · ' + TAC.PLANS[ts.tac.plan].n])]);
      ts.onPitch.forEach(x => {
        if (!x.p) { col.appendChild(el('div.lu-p.off', { text: x.slot.label + ' — удалён' })); return; }
        const p = x.p;
        col.appendChild(el('div.lu-p', null, [el('span.lu-pos', { text: x.slot.label }), el('span.lu-n', null, [p.name + (p.m.goals ? ' ' + '⚽'.repeat(p.m.goals) : '') + (p.m.yc ? ' 🟨' : '') + ' ', UI.formBadge(p), ' ', UI.traitIcons(p)]), UI.fitBar(p.m.fit)]));
      });
      col.appendChild(el('div.lu-sub', { text: `Замен осталось: ${ts.subsLeft}` }));
      box.appendChild(col);
    }
    return box;
  }

  /* Итоговое окно матча */
  MatchScreen.fullTime = function (m) {
    const H = m.t.home, A = m.t.away;
    const content = el('div.fulltime');
    content.appendChild(el('div.ft-head', null, [
      el('div.ft-team', null, [UI.crest(H.club, 64), el('b', { text: H.club.name })]),
      el('div.ft-score', { text: `${m.score.home} : ${m.score.away}` }),
      el('div.ft-team', null, [UI.crest(A.club, 64), el('b', { text: A.club.name })])
    ]));
    const gl = el('div.ft-goals');
    m.goals.forEach(g => gl.appendChild(el('div.ft-g.' + g.side, { text: `⚽ ${g.min} ${g.scorer}${g.kind === 'pen' ? ' (пен.)' : ''}` })));
    content.appendChild(gl);
    const all = H.club.players.concat(A.club.players).filter(p => p.m && p.m.played);
    const motm = all.slice().sort((a, b) => (b.m.rating || 0) - (a.m.rating || 0))[0];
    if (motm) content.appendChild(el('div.ft-motm', null, [el('small', { text: 'Игрок матча' }), el('b', { text: `${motm.name} — ${motm.m.rating}` })]));
    const cols = el('div.ft-ratings');
    for (const ts of [H, A]) {
      const col = el('div.ft-col', null, [el('h4', { text: ts.club.name })]);
      ts.club.players.filter(p => p.m && p.m.played).sort((a, b) => (b.m.rating || 0) - (a.m.rating || 0)).forEach(p => {
        col.appendChild(el('div.ft-r', null, [el('span', { text: p.name }), el('b', { text: (p.m.rating || 0).toFixed(1), style: { color: p.m.rating >= 7.5 ? '#00ff87' : p.m.rating >= 6.5 ? '#e7d64a' : '#ff8a3d' } })]));
      });
      cols.appendChild(col);
    }
    content.appendChild(cols);
    content.appendChild(statsBlock(m));
    return UI.modal({ title: 'Финальный свисток', content, wide: true, closable: false, buttons: [{ text: 'Продолжить', cls: 'primary' }] }).result;
  };

  G.MatchScreen = MatchScreen;
})(typeof window !== 'undefined' ? window : globalThis);
