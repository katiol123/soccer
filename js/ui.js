/* Экраны приложения и игровой цикл */
(function (G) {
  'use strict';
  const U = G.U, UI = G.UI, TAC = G.TAC, AI = G.AI, LEAGUE = G.LEAGUE, ENGINE = G.ENGINE, SFX = G.SFX, FX = G.FX, GFX = G.GFX, BOARD = G.BOARD;
  const el = U.el;

  const LENGTHS = [{ v: 16, n: 'Короткий', d: '≈16 ходов на команду' }, { v: 24, n: 'Стандарт', d: '≈24 хода на команду' }, { v: 32, n: 'Длинный', d: '≈32 хода на команду' }];

  const App = {
    st: null,
    tab: 'home',
    squadClub: null,

    init() {
      FX.init();
      try { SFX.on = localStorage.getItem('m3-sound') !== 'off'; } catch (e) { /* */ }
      document.addEventListener('pointerdown', () => SFX.ensure(), { once: true });
      this.menu();
    },

    show(node) {
      const app = document.getElementById('app');
      const old = app.firstElementChild;
      node.classList.add('enter');
      if (old) {
        old.classList.add('leave');
        setTimeout(() => old.remove(), 260);
      }
      app.appendChild(node);
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('enter')));
      window.scrollTo(0, 0);
    },

    soundPref(on) { try { localStorage.setItem('m3-sound', on ? 'on' : 'off'); } catch (e) { /* */ } },

    /* ---------- Главное меню ---------- */
    menu() {
      const root = el('div.screen.menu');
      const floaters = el('div.floaters');
      for (let i = 0; i < 18; i++) {
        const t = i % 6;
        const f = el('div.floater.t' + t);
        f.innerHTML = GFX.GEM_ICONS[t];
        f.style.left = (Math.random() * 100) + '%';
        f.style.animationDelay = (-Math.random() * 20) + 's';
        f.style.animationDuration = (14 + Math.random() * 14) + 's';
        f.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
        floaters.appendChild(f);
      }
      root.appendChild(floaters);
      const has = LEAGUE.hasSave();
      const saved = has ? LEAGUE.load() : null;
      const card = el('div.menu-card', null, [
        el('div.logo', null, [
          el('div.logo-gems', null, [0, 1, 2].map(t => { const g = el('span.lg-ico.t' + [0, 3, 5][t]); g.innerHTML = GFX.GEM_ICONS[[0, 3, 5][t]]; return g; })),
          el('h1', { text: 'КОМБИНАЦИЯ' }),
          el('div.logo-sub', { text: 'Футбольный менеджер · Три в ряд · Премьер-лига' })
        ]),
        el('div.menu-btns', null, [
          saved ? el('button.btn.primary.big', { onclick: () => { this.st = saved; this.tab = 'home'; this.hub(); } }, [el('span', { text: '▶ Продолжить' }), el('small', { text: (saved.userClub ? LEAGUE.club(saved, saved.userClub).name : 'Режим зрителя') + ` · сезон ${saved.seasonName} · тур ${Math.min(saved.round + 1, 38)}` })]) : null,
          el('button.btn.big' + (saved ? '' : '.primary'), { onclick: () => this.teamSelect() }, [el('span', { text: '⚽ Новая карьера' }), el('small', { text: 'Выберите клуб и приведите его к титулу' })]),
          el('button.btn.big', { onclick: () => this.spectatorSetup() }, [el('span', { text: '👁 Режим зрителя' }), el('small', { text: 'Наблюдайте за битвой тренеров-ИИ' })]),
          el('button.btn.ghost', { text: '📖 Как играть', onclick: () => this.howTo() })
        ])
      ]);
      root.appendChild(card);
      root.appendChild(el('div.menu-foot', { text: 'Клубы АПЛ 2025/26 · игроки и тренеры вымышлены' }));
      this.show(root);
    },

    confirmOverwrite() {
      if (!LEAGUE.hasSave()) return Promise.resolve(true);
      return UI.modal({ title: 'Новая игра', content: el('p', { text: 'Текущее сохранение будет перезаписано. Продолжить?' }), buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Да, начать', cls: 'primary', value: true }] }).result;
    },

    lengthPicker(state) {
      const seg = el('div.seg');
      LENGTHS.forEach(l => seg.appendChild(el('button' + (state.turns === l.v ? '.on' : ''), { text: l.n, title: l.d, onclick: (e) => { state.turns = l.v; U.$$('button', seg).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      return el('div.len-pick', null, [el('span', { text: 'Длина матча:' }), seg]);
    },

    /* ---------- Выбор команды ---------- */
    teamSelect() {
      const world = G.DATA.createWorld(Math.floor(Math.random() * 1e9));
      const opts = { turns: 24 };
      const root = el('div.screen.select');
      root.appendChild(el('div.sel-head', null, [
        el('button.icon-btn', { text: '←', onclick: () => this.menu() }),
        el('div', null, [el('h2', { text: 'Выберите клуб' }), el('p', { text: 'Каждый клуб возглавляет тренер со своей философией. Вы замените его у руля.' })]),
        this.lengthPicker(opts)
      ]));
      const grid = el('div.club-grid');
      const ratings = world.map(c => ({ c, r: TAC.teamRating(c) })).sort((a, b) => b.r - a.r);
      const detail = el('div.club-detail');
      const pick = (c, r) => {
        U.$$('.club-card', grid).forEach(x => x.classList.toggle('on', x.dataset.id === c.id));
        detail.innerHTML = '';
        detail.style.setProperty('--c1', c.c1); detail.style.setProperty('--c2', c.c2);
        const top = c.players.slice().sort((a, b) => TAC.overall(b) - TAC.overall(a)).slice(0, 5);
        const expect = r > 16.5 ? 'Чемпионство' : r > 15.8 ? 'Лига чемпионов' : r > 15 ? 'Еврокубки' : r > 14.4 ? 'Середина таблицы' : 'Сохранить прописку';
        detail.append(
          el('div.cd-top', null, [UI.crest(c, 88), el('div', null, [el('h3', { text: c.name }), el('div.cd-sub', { text: `${c.stadium} · ${c.city}` }), UI.stars(r), el('div.cd-exp', { text: 'Цель: ' + expect })])]),
          el('div.cd-coach', null, [el('small', { text: 'Нынешний тренер (уступит вам место)' }), el('b', { text: `${c.coach.name} (${c.coach.nat})` }), el('p', { text: c.coach.motto }),
            el('div.cd-tags', null, [el('span', { text: c.coach.formations.join(' / ') }), el('span', { text: TAC.PLANS[c.coach.plan].icon + ' ' + TAC.PLANS[c.coach.plan].n })])]),
          el('div.cd-players', null, [el('small', { text: 'Лидеры состава' })].concat(top.map(p => el('div.cd-p', null, [el('span.bp-pos', { text: UI.posShort(p.pos) }), el('span', null, [p.name + (p.star ? ' ★ ' : ' '), UI.traitIcons(p)]), el('b', { text: TAC.overall(p).toFixed(1), style: { color: U.attrColor(TAC.overall(p)) } })])))),
          el('button.btn.primary.big', { onclick: async () => { if (!(await this.confirmOverwrite())) return; this.startGame('manager', c.id, world, opts.turns); } }, [el('span', { text: `Возглавить «${c.name}»` })])
        );
      };
      ratings.forEach(({ c, r }) => {
        const card = el('button.club-card', { 'data-id': c.id, onclick: () => pick(c, r) }, [UI.crest(c, 52), el('div.cc-t', null, [el('b', { text: c.name }), el('small', { text: c.coach.name })]), UI.stars(r)]);
        card.style.setProperty('--c1', c.c1);
        grid.appendChild(card);
      });
      root.appendChild(el('div.sel-body', null, [grid, detail]));
      this.show(root);
      pick(ratings[0].c, ratings[0].r);
    },

    spectatorSetup() {
      const opts = { turns: 24 };
      const content = el('div', null, [el('p', { text: 'Все 20 клубов управляются тренерами-ИИ со своими предпочтениями. Вы можете смотреть любой матч тура в реальном времени или симулировать тур целиком.' }), this.lengthPicker(opts)]);
      UI.modal({ title: 'Режим зрителя', content, buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Начать сезон', cls: 'primary', value: true }] }).result.then(async v => {
        if (!v) return;
        if (!(await this.confirmOverwrite())) return;
        this.startGame('spectator', null, null, opts.turns);
      });
    },

    startGame(mode, clubId, world, turns) {
      const st = LEAGUE.newGame({ mode, clubId, turns });
      if (world) {
        // используем тот же мир, что был показан при выборе
        st.clubs = world;
        if (clubId) st.userTactics = TAC.defaultTactics(LEAGUE.club(st, clubId));
      }
      this.st = st;
      LEAGUE.save(st);
      this.tab = 'home';
      this.hub();
      if (mode === 'manager') setTimeout(() => this.howTo(true), 400);
    },

    /* ---------- Хаб ---------- */
    hub(tab) {
      if (tab) this.tab = tab;
      const st = this.st;
      if (LEAGUE.seasonOver(st)) return this.seasonEnd();
      const root = el('div.screen.hub');
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      if (uc) { root.style.setProperty('--c1', uc.c1); root.style.setProperty('--c2', uc.c2); }
      const nav = el('nav.hub-nav');
      const tabs = [['home', 'Главная'], ['squad', uc ? 'Состав и тактика' : 'Клубы'], ['table', 'Таблица'], ['fixtures', 'Календарь'], ['stats', 'Статистика']];
      tabs.forEach(([k, n]) => nav.appendChild(el('button' + (this.tab === k ? '.on' : ''), { text: n, onclick: () => this.hub(k) })));
      const top = el('header.topbar', null, [
        el('div.tb-brand', { onclick: () => this.gameMenu() }, [el('span.tb-logo', { text: 'К' }), el('span', { text: 'КОМБИНАЦИЯ' })]),
        el('div.tb-club', null, uc ? [UI.crest(uc, 30), el('div', null, [el('b', { text: uc.name }), el('small', { text: `Сезон ${st.seasonName} · Тур ${st.round + 1}/38` })])] : [el('span.tb-eye', { text: '👁' }), el('div', null, [el('b', { text: 'Режим зрителя' }), el('small', { text: `Сезон ${st.seasonName} · Тур ${st.round + 1}/38` })])]),
        nav,
        el('button.icon-btn', { text: '☰', title: 'Меню', onclick: () => this.gameMenu() })
      ]);
      root.appendChild(top);
      const body = el('div.hub-body');
      root.appendChild(body);
      ({ home: () => this.tabHome(body), squad: () => this.tabSquad(body), table: () => this.tabTable(body), fixtures: () => this.tabFixtures(body), stats: () => this.tabStats(body) })[this.tab]();
      this.show(root);
    },

    gameMenu() {
      const content = el('div.gm', null, [
        el('button.btn', { text: '📖 Как играть', onclick: () => { md.close(); this.howTo(); } }),
        el('button.btn', { text: '✦ Особенности игроков', onclick: () => { md.close(); UI.traitsGuide(); } }),
        el('button.btn', { text: SFX.on ? '🔊 Звук: вкл' : '🔇 Звук: выкл', onclick: (e) => { SFX.on = !SFX.on; this.soundPref(SFX.on); e.target.textContent = SFX.on ? '🔊 Звук: вкл' : '🔇 Звук: выкл'; } }),
        el('div.len-wrap', null, [this.lengthPicker(this.st.settings)]),
        el('button.btn', { text: '💾 Сохранить', onclick: () => { LEAGUE.save(this.st); UI.toast('Игра сохранена'); } }),
        el('button.btn.ghost', { text: '⏏ Выйти в главное меню', onclick: () => { LEAGUE.save(this.st); md.close(); this.menu(); } })
      ]);
      const md = UI.modal({ title: 'Меню', content, onClose: () => LEAGUE.save(this.st) });
    },

    /* Решение тренера соперника кэшируется на тур, чтобы скаут-отчёт совпадал с матчем */
    oppPlan(f, opp, uc, home) {
      const key = this.st.season + ':' + this.st.round + ':' + opp.id;
      if (!this._pred || this._pred.key !== key) this._pred = { key, tac: AI.prepare(opp, uc, home) };
      return this._pred.tac;
    },

    roundFixtures() { return this.st.fixtures[this.st.round]; },
    userFixture() { const u = this.st.userClub; return u ? this.roundFixtures().find(f => f.h === u || f.a === u) : null; },

    tabHome(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const grid = el('div.home-grid');
      const main = el('div.home-main');
      const side = el('div.home-side');
      const uf = this.userFixture();
      if (uc && uf && !uf.res) main.appendChild(this.nextMatchCard(uf));
      else if (uc && uf && uf.res) main.appendChild(el('div.card.notice', null, [el('b', { text: 'Ваш матч тура сыгран.' }), el('span', { text: ' Досмотрите или досимулируйте остальные игры и переходите к следующему туру.' })]));
      main.appendChild(this.roundCard());
      // мини-таблица
      side.appendChild(this.miniTable());
      if (uc) {
        const last = [];
        st.fixtures.slice(0, st.round + 1).forEach(rd => rd.forEach(f => { if (f.res && (f.h === uc.id || f.a === uc.id)) last.push(f); }));
        if (last.length) {
          const box = el('div.card', null, [el('h3', { text: 'Последние матчи' })]);
          last.slice(-5).reverse().forEach(f => box.appendChild(this.resultRow(f, uc.id)));
          side.appendChild(box);
        }
        const news = el('div.card', null, [el('h3', { text: 'Новости' })]);
        st.news.slice(-6).reverse().forEach(n => news.appendChild(el('div.news', { text: n.text })));
        side.appendChild(news);
      } else {
        const sc = LEAGUE.topScorers(st, 5);
        if (sc.length) {
          const box = el('div.card', null, [el('h3', { text: 'Бомбардиры' })]);
          sc.forEach((x, i) => box.appendChild(el('div.mini-row', null, [el('span.pos', { text: i + 1 }), UI.crest(x.c, 18), el('span.nm', { text: x.p.name }), el('b', { text: x.p.st.goals })])));
          side.appendChild(box);
        }
      }
      grid.append(main, side);
      body.appendChild(grid);
    },

    nextMatchCard(f) {
      const st = this.st, home = LEAGUE.club(st, f.h), away = LEAGUE.club(st, f.a);
      const uc = LEAGUE.club(st, st.userClub);
      const opp = uc === home ? away : home;
      const isHome = uc === home;
      const pred = this.oppPlan(f, opp, uc, !isHome);
      const table = LEAGUE.standings(st);
      const pos = id => table.findIndex(r => r.id === id) + 1;
      const card = el('div.card.next-match');
      card.style.setProperty('--h', home.c1); card.style.setProperty('--a', away.c1);
      card.append(
        el('div.nm-label', { text: `Тур ${st.round + 1} · ${home.stadium}` }),
        el('div.nm-teams', null, [
          el('div.nm-t', null, [UI.crest(home, 72), el('b', { text: home.name }), el('small', { text: `${pos(home.id)} место · ${TAC.teamRating(home).toFixed(1)}` })]),
          el('div.nm-vs', { text: 'VS' }),
          el('div.nm-t', null, [UI.crest(away, 72), el('b', { text: away.name }), el('small', { text: `${pos(away.id)} место · ${TAC.teamRating(away).toFixed(1)}` })])
        ]),
        el('div.nm-scout', null, [
          el('div.nm-scout-h', null, [el('span', { text: '🔎 Скаутский отчёт' }), el('b', { text: `${opp.coach.name}` })]),
          el('p', { text: opp.coach.motto }),
          el('div.cd-tags', null, [el('span', { text: 'Ожидаемая схема: ' + pred.formation }), el('span', { text: TAC.PLANS[pred.plan].icon + ' ' + TAC.PLANS[pred.plan].n }), el('span', { text: 'Менталитет: ' + TAC.MENTALITY[pred.mentality] }), el('span', { text: 'Прессинг: ' + TAC.PRESSING[pred.pressing] })])
        ]),
        el('div.nm-btns', null, [
          el('button.btn.ghost', { text: '⚙ Тактика', onclick: () => this.hub('squad') }),
          el('button.btn.ghost.small', { text: '⚡ Доверить ассистенту', title: 'Матч будет сыгран автоматически вашей тактикой', onclick: () => this.simUserMatch(f) }),
          el('button.btn.primary.big', { text: 'К матчу ▶', onclick: () => this.prematch(f) })
        ])
      );
      return card;
    },

    roundCard() {
      const st = this.st, rd = this.roundFixtures();
      const card = el('div.card.round');
      const allDone = rd.every(f => f.res);
      card.appendChild(el('div.round-h', null, [el('h3', { text: `Тур ${st.round + 1}` }), el('small', { text: allDone ? 'Все матчи сыграны' : 'Смотрите любой матч ИИ вживую или симулируйте' })]));
      const list = el('div.fixtures');
      rd.forEach(f => {
        const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
        const mine = st.userClub && (f.h === st.userClub || f.a === st.userClub);
        const row = el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''));
        row.append(
          el('div.fx-t.h', null, [el('span', { text: h.name }), UI.crest(h, 26)]),
          el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}` : '– : –' }),
          el('div.fx-t.a', null, [UI.crest(a, 26), el('span', { text: a.name })])
        );
        const acts = el('div.fx-act');
        if (!f.res) {
          if (mine) acts.appendChild(el('button.btn.small.primary', { text: 'Играть', onclick: () => this.prematch(f) }));
          else {
            acts.appendChild(el('button.btn.small', { text: '👁 Смотреть', onclick: () => this.watchMatch(f) }));
            acts.appendChild(el('button.btn.small.ghost', { text: '⚡', title: 'Быстрая симуляция', onclick: () => { this.simFixture(f); LEAGUE.save(st); this.hub(); } }));
          }
        } else {
          acts.appendChild(el('button.btn.small.ghost', { text: 'Отчёт', onclick: () => this.report(f) }));
        }
        row.appendChild(acts);
        list.appendChild(row);
      });
      card.appendChild(list);
      const foot = el('div.round-foot');
      const uf = this.userFixture();
      const remainingAI = rd.filter(f => !f.res && f !== uf);
      if (remainingAI.length) foot.appendChild(el('button.btn', { text: `⚡ Симулировать ${remainingAI.length === rd.length - (uf ? 1 : 0) ? 'тур' : 'остальные'} (${remainingAI.length})`, onclick: () => this.simRemaining() }));
      if (allDone) foot.appendChild(el('button.btn.primary.big', { text: st.round + 1 >= st.fixtures.length ? 'Завершить сезон 🏆' : 'Следующий тур →', onclick: () => this.nextRound() }));
      else if (uf && !uf.res && !remainingAI.length) foot.appendChild(el('span.muted', { text: 'Остался только ваш матч.' }));
      card.appendChild(foot);
      return card;
    },

    async simRemaining() {
      const rd = this.roundFixtures(), uf = this.userFixture();
      const todo = rd.filter(f => !f.res && f !== uf);
      const ov = el('div.sim-overlay', null, [el('div.sim-box', null, [el('div.spinner'), el('b', { text: 'Симуляция матчей...' }), el('div.sim-list')])]);
      document.body.appendChild(ov);
      const list = ov.querySelector('.sim-list');
      for (const f of todo) {
        await U.sleep(30);
        this.simFixture(f);
        const h = LEAGUE.club(this.st, f.h), a = LEAGUE.club(this.st, f.a);
        list.appendChild(el('div.sim-r', { text: `${h.short} ${f.res.hs}:${f.res.as} ${a.short}` }));
      }
      await U.sleep(500);
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 300);
      LEAGUE.save(this.st);
      this.hub();
    },

    makeMatch(f, opts) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
      const uc = st.userClub;
      const tacFor = (club, opp, home) => {
        if (club.id === uc && !(opts && opts.assistant)) return st.userTactics;
        if (club.id === uc) return st.userTactics;
        return AI.prepare(club, opp, home);
      };
      const ht = opts && opts.homeTac || tacFor(h, a, true), at = opts && opts.awayTac || tacFor(a, h, false);
      return new ENGINE.Match({
        home: { club: h, tactics: ht, ctrl: (opts && opts.human === 'home') ? 'human' : 'ai' },
        away: { club: a, tactics: at, ctrl: (opts && opts.human === 'away') ? 'human' : 'ai' },
        turns: st.settings.turns, log: !!(opts && opts.log), interactive: !!(opts && opts.interactive)
      });
    },

    simFixture(f) {
      const m = this.makeMatch(f);
      m.simulate();
      LEAGUE.record(this.st, f, m);
    },

    simUserMatch(f) {
      UI.modal({ title: 'Доверить матч ассистенту?', content: el('p', { text: 'Ассистент проведёт матч с вашей тактикой и составом. Он хорош, но не идеален.' }), buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Симулировать', cls: 'primary', value: true }] }).result.then(v => {
        if (!v) return;
        const m = this.makeMatch(f, { log: true });
        m.simulate();
        G.MatchScreen.fullTime(m).then(() => {
          this.afterUserMatch(f, m);
        });
      });
    },

    afterUserMatch(f, m) {
      const st = this.st, uc = st.userClub;
      const side = f.h === uc ? 'home' : 'away';
      const my = m.score[side], their = m.score[side === 'home' ? 'away' : 'home'];
      const opp = LEAGUE.club(st, side === 'home' ? f.a : f.h);
      st.news.push({ r: st.round, text: my > their ? `Победа над «${opp.name}» ${my}:${their}! Болельщики в восторге.` : my < their ? `Поражение от «${opp.name}» ${my}:${their}. Нужно делать выводы.` : `Ничья с «${opp.name}» ${my}:${their}.` });
      LEAGUE.record(st, f, m);
      LEAGUE.save(st);
      this.hub('home');
    },

    async watchMatch(f) {
      const m = this.makeMatch(f, { log: true, interactive: true });
      m.watched = true;
      const notes = el('div.prematch-notes');
      for (const s of ['home', 'away']) {
        const ts = m.t[s];
        notes.appendChild(el('div.pn', null, [UI.crest(ts.club, 34), el('div', null, [el('b', { text: `${ts.coach.name}: ${ts.tac.formation}, «${TAC.PLANS[ts.tac.plan].n}»` })].concat((ts.tac.notes || []).map(n => el('small', { text: n }))))]));
      }
      await UI.modal({ title: 'Перед матчем: решения тренеров', content: notes, wide: true, buttons: [{ text: 'Смотреть ▶', cls: 'primary' }] }).result;
      await this.playMatchScreen(m);
      await G.MatchScreen.fullTime(m);
      LEAGUE.record(this.st, f, m);
      LEAGUE.save(this.st);
      this.hub('home');
    },

    async playMatchScreen(m) {
      const ms = new G.MatchScreen({ match: m, onSound: on => this.soundPref(on) });
      this.show(ms.build());
      await U.sleep(300);
      await ms.run();
      ms.bv.destroy();
    },

    /* ---------- Предматчевый экран ---------- */
    prematch(f) {
      const st = this.st, uc = LEAGUE.club(st, st.userClub);
      LEAGUE.fixUserTactics(st);
      const isHome = f.h === uc.id;
      const opp = LEAGUE.club(st, isHome ? f.a : f.h);
      const oppTac = this.oppPlan(f, opp, uc, !isHome);
      const root = el('div.screen.prematch');
      root.style.setProperty('--c1', uc.c1);
      const header = el('div.pm-head', null, [
        el('button.icon-btn', { text: '←', onclick: () => this.hub('home') }),
        el('div.pm-title', null, [UI.crest(LEAGUE.club(st, f.h), 40), el('h2', { text: `${LEAGUE.club(st, f.h).name} — ${LEAGUE.club(st, f.a).name}` }), UI.crest(LEAGUE.club(st, f.a), 40)]),
        el('button.btn.primary.big', { text: 'На поле ▶', onclick: () => this.playUserMatch(f, oppTac) })
      ]);
      root.appendChild(header);
      const body = el('div.pm-body');
      const mine = el('div.card.pm-mine', null, [el('h3', { text: 'Ваша тактика' })]);
      mine.appendChild(UI.TacticsEditor(UI.prematchModel(uc, st.userTactics)));
      const theirs = el('div.card.pm-opp', null, [el('h3', { text: `Соперник: ${opp.name}` })]);
      theirs.appendChild(el('div.pm-coach', null, [el('b', { text: `${opp.coach.name} (${opp.coach.nat})` }), el('p', { text: opp.coach.motto })]));
      theirs.appendChild(el('div.cd-tags', null, [el('span', { text: oppTac.formation }), el('span', { text: TAC.PLANS[oppTac.plan].icon + ' ' + TAC.PLANS[oppTac.plan].n }), el('span', { text: 'Менталитет: ' + TAC.MENTALITY[oppTac.mentality] }), el('span', { text: 'Прессинг: ' + TAC.PRESSING[oppTac.pressing] }), el('span', { text: 'Линия: ' + TAC.LINE[oppTac.line] })]));
      const map0 = TAC.playerMap(opp);
      const notes = el('div.pm-notes', null, [el('small', { text: 'Решения тренера соперника:' })].concat(oppTac.notes.map(n => el('div', { text: '🧠 ' + n }))));
      theirs.appendChild(notes);
      const oppTr = oppTac.lineup.map(id => map0[id]).filter(p => p && p.tr && p.tr.length);
      if (oppTr.length) {
        const tbox = el('div.pm-notes', null, [el('small', { text: 'Скаут: особенности игроков соперника' })]);
        oppTr.slice(0, 6).forEach(p => p.tr.forEach(id => { const t = G.TRAITS.LIST[id]; tbox.appendChild(el('div', { title: t.d }, [`${t.i} ${p.name} — ${t.n}`])); }));
        theirs.appendChild(tbox);
      }
      const map = TAC.playerMap(opp);
      const ol = el('div.pm-xi');
      TAC.FORMATIONS[oppTac.formation].forEach((s, i) => { const p = map[oppTac.lineup[i]]; if (p) ol.appendChild(el('div.pm-p', null, [el('span.lu-pos', { text: s.label }), el('span', null, [p.name + ' ', UI.formBadge(p), ' ', UI.traitIcons(p)]), el('b', { text: TAC.roleRating(p, s.role).toFixed(1), style: { color: U.attrColor(TAC.roleRating(p, s.role)) } })])); });
      theirs.appendChild(ol);
      body.append(mine, theirs);
      root.appendChild(body);
      this.show(root);
    },

    async playUserMatch(f, oppTac) {
      const st = this.st;
      const valid = st.userTactics.lineup.filter(Boolean).length === 11 && st.userTactics.lineup.some(id => { const p = TAC.playerMap(LEAGUE.club(st, st.userClub))[id]; return p && p.pos === 'GK'; });
      if (!valid) {
        const ok = await UI.modal({ title: 'Проблема с составом', content: el('p', { text: 'В составе нет вратаря или не хватает игроков. Всё равно начать?' }), buttons: [{ text: 'Исправить', cls: 'ghost', value: false }, { text: 'Играть', cls: 'primary', value: true }] }).result;
        if (!ok) return;
      }
      const human = f.h === st.userClub ? 'home' : 'away';
      const m = this.makeMatch(f, { human, log: true, interactive: true, homeTac: human === 'away' ? oppTac : null, awayTac: human === 'home' ? oppTac : null });
      await this.playMatchScreen(m);
      await G.MatchScreen.fullTime(m);
      // перенос изменений тактики (без замен) в сохранение
      st.userTactics.mentality = m.t[human].tac.mentality;
      st.userTactics.plan = m.t[human].tac.plan;
      this.afterUserMatch(f, m);
    },

    report(f) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a), r = f.res;
      const content = el('div.report');
      content.appendChild(el('div.ft-head', null, [el('div.ft-team', null, [UI.crest(h, 54), el('b', { text: h.name })]), el('div.ft-score', { text: `${r.hs} : ${r.as}` }), el('div.ft-team', null, [UI.crest(a, 54), el('b', { text: a.name })])]));
      const gl = el('div.ft-goals');
      r.goals.forEach(g => gl.appendChild(el('div.ft-g.' + g.side, { text: `⚽ ${g.min} ${g.scorer}${g.kind === 'pen' ? ' (пен.)' : ''}${g.assist ? ' (' + g.assist + ')' : ''}` })));
      content.appendChild(gl);
      if (r.motm) content.appendChild(el('div.ft-motm', null, [el('small', { text: 'Игрок матча' }), el('b', { text: `${r.motm} — ${r.motmR}` })]));
      const s = r.stats;
      const tbl = el('div.stats');
      [['Удары', 'shots'], ['В створ', 'onT'], ['xG', 'xg'], ['Угловые', 'corners'], ['Отборы', 'wins'], ['Фолы', 'fouls'], ['Жёлтые', 'yc'], ['Красные', 'rc']].forEach(([n, k]) => {
        const hv = s.home[k], av = s.away[k], tot = (+hv + +av) || 1;
        const bar = el('div.st-bar', null, [el('i.h'), el('i.a')]);
        bar.children[0].style.width = (hv / tot * 100) + '%'; bar.children[1].style.width = (av / tot * 100) + '%';
        tbl.appendChild(el('div.st-row', null, [el('div.st-top', null, [el('b', { text: hv }), el('span', { text: n }), el('b', { text: av })]), bar]));
      });
      tbl.style.setProperty('--home', GFX.teamColor(h)); tbl.style.setProperty('--away', GFX.teamColor(a));
      content.appendChild(tbl);
      UI.modal({ title: 'Отчёт о матче', content, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
    },

    nextRound() {
      const st = this.st;
      LEAGUE.advance(st);
      LEAGUE.save(st);
      if (LEAGUE.seasonOver(st)) return this.seasonEnd();
      this.hub('home');
      if (st.userClub) {
        const t = LEAGUE.standings(st);
        const pos = t.findIndex(r => r.id === st.userClub) + 1;
        UI.toast(`Тур ${st.round + 1}. Вы на ${pos}-м месте.`);
      }
    },

    seasonEnd() {
      const st = this.st, table = LEAGUE.standings(st);
      const champ = LEAGUE.club(st, table[0].id);
      const root = el('div.screen.season-end');
      root.style.setProperty('--c1', champ.c1); root.style.setProperty('--c2', champ.c2);
      const up = st.userClub ? table.findIndex(r => r.id === st.userClub) + 1 : null;
      const sc = LEAGUE.topScorers(st, 1)[0];
      root.append(
        el('div.se-trophy', { text: '🏆' }),
        el('h1', { text: 'Чемпион Англии' }),
        el('div.se-champ', null, [UI.crest(champ, 120), el('b', { text: champ.name }), el('small', { text: `${table[0].pts} очков · ${champ.coach.name}` })]),
        up ? el('div.se-user', { text: up === 1 ? 'Это ваша команда! Вы — чемпион! 🎉' : `Ваш клуб занял ${up}-е место.${up <= 4 ? ' Лига чемпионов!' : up >= 18 ? ' Увы, вылет...' : ''}` }) : null,
        sc ? el('div.se-user.small', { text: `Лучший бомбардир: ${sc.p.name} (${sc.c.name}) — ${sc.p.st.goals}` }) : null,
        el('div.se-btns', null, [
          el('button.btn.ghost', { text: 'Итоговая таблица', onclick: () => { const b = el('div'); this.tableEl(b); UI.modal({ title: 'Итоговая таблица ' + st.seasonName, content: b, wide: true }); } }),
          el('button.btn.primary.big', { text: 'Новый сезон ▶', onclick: () => { LEAGUE.newSeason(st); LEAGUE.save(st); this.hub('home'); } })
        ])
      );
      this.show(root);
      setTimeout(() => { FX.confetti([champ.c1, champ.c2, '#ffd23f', '#ffffff'], 260); SFX.goal(); }, 400);
    },

    /* ---------- Вкладки ---------- */
    miniTable() {
      const st = this.st, t = LEAGUE.standings(st);
      const box = el('div.card', null, [el('h3', { text: 'Таблица' })]);
      let rows = t.map((r, i) => ({ r, i }));
      if (st.userClub) {
        const ui = t.findIndex(r => r.id === st.userClub);
        const from = U.clamp(ui - 3, 0, 13);
        rows = rows.slice(from, from + 7);
      } else rows = rows.slice(0, 8);
      rows.forEach(({ r, i }) => {
        const c = LEAGUE.club(st, r.id);
        box.appendChild(el('div.mini-row' + (r.id === st.userClub ? '.me' : ''), null, [el('span.pos', { text: i + 1 }), UI.crest(c, 18), el('span.nm', { text: c.name }), el('span.muted', { text: r.p }), el('b', { text: r.pts })]));
      });
      box.appendChild(el('button.btn.ghost.small', { text: 'Вся таблица', onclick: () => this.hub('table') }));
      return box;
    },

    resultRow(f, uid) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
      const my = f.h === uid ? f.res.hs : f.res.as, th = f.h === uid ? f.res.as : f.res.hs;
      const r = my > th ? 'W' : my < th ? 'L' : 'D';
      return el('div.res-row', { onclick: () => this.report(f) }, [el('span.form-b.' + r, { text: { W: 'В', D: 'Н', L: 'П' }[r] }), el('span', { text: `${h.short} ${f.res.hs}:${f.res.as} ${a.short}` })]);
    },

    tabTable(body) {
      const card = el('div.card.wide-card');
      card.appendChild(el('h3', { text: `Премьер-лига ${this.st.seasonName}` }));
      this.tableEl(card);
      body.appendChild(card);
    },

    tableEl(host) {
      const st = this.st, t = LEAGUE.standings(st);
      const tbl = el('table.league');
      tbl.appendChild(el('thead', null, [el('tr', null, ['#', 'Клуб', 'И', 'В', 'Н', 'П', 'Мячи', 'Р', 'О', 'Форма'].map(h => el('th', { text: h })))]));
      const tb = el('tbody');
      t.forEach((r, i) => {
        const c = LEAGUE.club(st, r.id);
        const zone = i < 4 ? 'cl' : i === 4 ? 'el' : i === 5 ? 'ecl' : i >= 17 ? 'rel' : '';
        const form = el('td.form');
        r.form.forEach(x => form.appendChild(el('span.form-b.' + x, { text: { W: 'В', D: 'Н', L: 'П' }[x] })));
        tb.appendChild(el('tr' + (zone ? '.' + zone : '') + (r.id === st.userClub ? '.me' : ''), null, [
          el('td.pos', { text: i + 1 }), el('td.club', null, [UI.crest(c, 22), el('span', { text: c.name })]),
          el('td', { text: r.p }), el('td', { text: r.w }), el('td', { text: r.d }), el('td', { text: r.l }), el('td', { text: `${r.gf}:${r.ga}` }), el('td', { text: (r.gd > 0 ? '+' : '') + r.gd }), el('td.pts', { text: r.pts }), form
        ]));
      });
      tbl.appendChild(tb);
      host.appendChild(el('div.table-scroll', null, [tbl]));
      host.appendChild(el('div.legend-zones', null, [el('span.cl', { text: 'Лига чемпионов' }), el('span.el', { text: 'Лига Европы' }), el('span.ecl', { text: 'Лига конференций' }), el('span.rel', { text: 'Вылет' })]));
    },

    tabFixtures(body) {
      const st = this.st;
      let r = Math.min(st.round, 37);
      const card = el('div.card.wide-card');
      const head = el('div.fx-head');
      const list = el('div.fixtures');
      const render = () => {
        head.innerHTML = '';
        head.append(el('button.icon-btn', { text: '‹', onclick: () => { r = Math.max(0, r - 1); render(); } }), el('h3', { text: `Тур ${r + 1}` }), el('button.icon-btn', { text: '›', onclick: () => { r = Math.min(37, r + 1); render(); } }));
        list.innerHTML = '';
        st.fixtures[r].forEach(f => {
          const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
          const mine = st.userClub && (f.h === st.userClub || f.a === st.userClub);
          const row = el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''), { onclick: () => f.res && this.report(f) }, [
            el('div.fx-t.h', null, [el('span', { text: h.name }), UI.crest(h, 24)]),
            el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}` : '– : –' }),
            el('div.fx-t.a', null, [UI.crest(a, 24), el('span', { text: a.name })])
          ]);
          list.appendChild(row);
        });
      };
      render();
      card.append(head, list);
      if (st.userClub) {
        const my = el('div.card', null, [el('h3', { text: 'Ваш календарь' })]);
        const tl = el('div.my-fixtures');
        st.fixtures.forEach((rd, i) => {
          const f = rd.find(x => x.h === st.userClub || x.a === st.userClub);
          const opp = LEAGUE.club(st, f.h === st.userClub ? f.a : f.h);
          const res = f.res ? (f.h === st.userClub ? [f.res.hs, f.res.as] : [f.res.as, f.res.hs]) : null;
          const cls = res ? (res[0] > res[1] ? 'W' : res[0] < res[1] ? 'L' : 'D') : (i === st.round ? 'next' : '');
          tl.appendChild(el('div.mf.' + (cls || 'fut'), { title: `Тур ${i + 1}: ${opp.name}`, onclick: () => { r = i; render(); } }, [el('small', { text: i + 1 }), UI.crest(opp, 22), el('span', { text: f.h === st.userClub ? 'Д' : 'Г' }), el('b', { text: res ? res.join(':') : '' })]));
        });
        my.appendChild(tl);
        body.append(card, my);
      } else body.appendChild(card);
    },

    tabStats(body) {
      const st = this.st;
      const grid = el('div.stats-grid');
      const all = [];
      st.clubs.forEach(c => c.players.forEach(p => all.push({ p, c })));
      const block = (title, arr, val) => {
        const b = el('div.card', null, [el('h3', { text: title })]);
        arr.forEach((x, i) => b.appendChild(el('div.mini-row', { onclick: () => UI.playerModal(x.p, x.c) }, [el('span.pos', { text: i + 1 }), UI.crest(x.c, 18), el('span.nm', { text: x.p.name }), el('b', { text: val(x) })])));
        if (!arr.length) b.appendChild(el('div.muted', { text: 'Пока нет данных' }));
        return b;
      };
      grid.appendChild(block('Бомбардиры', all.filter(x => x.p.st.goals).sort((a, b) => b.p.st.goals - a.p.st.goals || a.p.st.apps - b.p.st.apps).slice(0, 12), x => x.p.st.goals));
      grid.appendChild(block('Ассистенты', all.filter(x => x.p.st.assists).sort((a, b) => b.p.st.assists - a.p.st.assists).slice(0, 12), x => x.p.st.assists));
      grid.appendChild(block('Лучшие оценки', all.filter(x => x.p.st.apps >= Math.max(1, Math.floor(st.round / 3))).sort((a, b) => b.p.st.rsum / b.p.st.apps - a.p.st.rsum / a.p.st.apps).slice(0, 12), x => (x.p.st.rsum / x.p.st.apps).toFixed(2)));
      grid.appendChild(block('Жёлтые карточки', all.filter(x => x.p.st.yc).sort((a, b) => b.p.st.yc - a.p.st.yc).slice(0, 12), x => x.p.st.yc));
      body.appendChild(grid);
    },

    tabSquad(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const club = this.squadClub && LEAGUE.club(st, this.squadClub) || uc || st.clubs[0];
      const own = uc && club === uc;
      const wrap = el('div.squad-wrap');
      const picker = el('div.club-picker');
      st.clubs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
        const b = el('button' + (c === club ? '.on' : ''), { title: c.name, onclick: () => { this.squadClub = c.id; this.hub('squad'); } }, [UI.crest(c, 26)]);
        picker.appendChild(b);
      });
      wrap.appendChild(picker);
      if (own) {
        LEAGUE.fixUserTactics(st);
        const card = el('div.card.wide-card', null, [el('h3', { text: 'Тактика и стартовый состав' })]);
        card.appendChild(UI.TacticsEditor(Object.assign(UI.prematchModel(uc, st.userTactics), {})));
        wrap.appendChild(card);
      } else {
        const c = club.coach;
        wrap.appendChild(el('div.card.coach-card', null, [UI.crest(club, 64), el('div', null, [el('h3', { text: club.name }), el('b', { text: `Тренер: ${c.name} (${c.nat})` }), el('p', { text: c.motto }),
          el('div.cd-tags', null, [el('span', { text: 'Схемы: ' + c.formations.join(', ') }), el('span', { text: TAC.PLANS[c.plan].icon + ' ' + TAC.PLANS[c.plan].n }), el('span', { text: 'Менталитет ' + TAC.MENTALITY[Math.round(c.mentality)] }), el('span', { text: 'Прессинг ' + TAC.PRESSING[Math.round(c.pressing)] }), el('span', { text: 'Гибкость ' + Math.round(c.adapt * 100) + '%' }), el('span', { text: 'Мастерство ' + Math.round(c.skill * 100) + '%' })])])]));
      }
      wrap.appendChild(this.squadTable(club));
      body.appendChild(wrap);
    },

    squadTable(club) {
      const card = el('div.card.wide-card', null, [el('h3', { text: `Состав «${club.name}»` })]);
      const cols = [['pos', 'Поз'], ['name', 'Игрок'], ['age', 'Воз']].concat(G.DATA.ATTRS.map(a => [a.k, a.n.slice(0, 3)])).concat([['ref', 'Реф'], ['ovr', 'Рейт'], ['form', 'Форма'], ['fit', 'Свеж'], ['apps', 'И'], ['goals', 'Г'], ['rat', 'Оц']]);
      let sortK = 'pos', dir = 1;
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      const get = (p, k) => k === 'pos' ? order[p.pos] * 100 - TAC.overall(p) : k === 'name' ? p.name : k === 'age' ? p.age : k === 'ovr' ? TAC.overall(p) : k === 'fit' ? p.fit : k === 'form' ? TAC.formBonus(p) : k === 'apps' ? p.st.apps : k === 'goals' ? p.st.goals : k === 'rat' ? (p.st.apps ? p.st.rsum / p.st.apps : 0) : p.a[k];
      const tblWrap = el('div.table-scroll');
      const render = () => {
        const tbl = el('table.squad');
        tbl.appendChild(el('thead', null, [el('tr', null, cols.map(([k, n]) => el('th' + (k === sortK ? '.on' : ''), { text: n, title: (G.DATA.ATTRS.find(a => a.k === k) || {}).d || '', onclick: () => { if (sortK === k) dir = -dir; else { sortK = k; dir = (k === 'pos' || k === 'name') ? 1 : -1; } render(); } })))]));
        const tb = el('tbody');
        club.players.slice().sort((a, b) => { const x = get(a, sortK), y = get(b, sortK); return (x > y ? 1 : x < y ? -1 : 0) * dir; }).forEach(p => {
          const tr = el('tr' + (TAC.available(p) ? '' : '.unavail'), { onclick: () => UI.playerModal(p, club) });
          tr.appendChild(el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]));
          tr.appendChild(el('td.pname', null, [p.name + (p.star ? ' ★' : '') + (p.inj > 0 ? ' ✚' : '') + (p.susp > 0 ? ' 🟥' : '') + ' ', UI.traitIcons(p)]));
          tr.appendChild(el('td', { text: p.age }));
          G.DATA.ATTRS.forEach(a => tr.appendChild(el('td', null, [UI.attrCell(p.a[a.k])])));
          tr.appendChild(el('td', null, [p.pos === 'GK' ? UI.attrCell(p.a.ref) : el('span.muted', { text: '–' })]));
          const o = TAC.overall(p);
          tr.appendChild(el('td', null, [el('b', { text: o.toFixed(1), style: { color: U.attrColor(o) } })]));
          tr.appendChild(el('td', null, [UI.formBadge(p)]));
          tr.appendChild(el('td', null, [UI.fitBar(p.fit)]));
          tr.appendChild(el('td', { text: p.st.apps }));
          tr.appendChild(el('td', { text: p.st.goals }));
          tr.appendChild(el('td', { text: p.st.apps ? (p.st.rsum / p.st.apps).toFixed(1) : '–' }));
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        tblWrap.innerHTML = '';
        tblWrap.appendChild(tbl);
      };
      render();
      card.appendChild(tblWrap);
      return card;
    },

    /* ---------- Обучение ---------- */
    howTo(first) {
      const gem = (t) => { const s = el('span.lg-ico.t' + t); s.innerHTML = GFX.GEM_ICONS[t]; return s; };
      const rows = [
        [0, 'Удар', 'В штрафной соперника 3+ красных — удар по воротам. На подступах — дальний удар. Иначе копит «угрозу». В обороне — блокирует удары.', 'Удар, Хладнокровие'],
        [1, 'Пас', 'Главный способ продвигать мяч к чужим воротам. В обороне — перехват передач (добавляет прессинг).', 'Пас против Позиции'],
        [2, 'Дриблинг', 'Продвижение и снятие прессинга. Ряд из 4+ — финт, пробивающий защитный щит. В обороне — заряжает контратаку.', 'Дриблинг против Отбора'],
        [3, 'Скорость', 'Рывки: ×1.4–1.8 во время контратаки. Опасен против высокой линии (но офсайд!). В обороне — отбирает темп у атаки.', 'Скорость против Скорости'],
        [4, 'Отбор', 'В обороне — прессинг: шкала 100 = мяч отобран. Риск фола, карточки и пенальти. В атаке — защищает мяч от прессинга.', 'Отбор, Выносливость'],
        [5, 'Позиция', 'В обороне — защитный щит, ослабляющий продвижение и удары. В атаке — открывания, подачи, удары головой после угловых.', 'Позиция']
      ];
      const content = el('div.howto', null, [
        el('p.lead', { text: 'Матч — это поле «три в ряд», на котором команды ходят по очереди. Каждый собранный ряд превращается в футбольное действие, сила которого зависит от характеристик игроков, находящихся в нужной зоне поля, и от тактики.' }),
        el('h4', { text: 'Шесть блоков' }),
        el('div.ht-gems', null, rows.map(r => el('div.ht-gem', null, [gem(r[0]), el('div', null, [el('b', { text: r[1] }), el('p', { text: r[2] }), el('small', { text: 'Характеристики: ' + r[3] })])]))),
        el('h4', { text: 'Спецблоки и комбо' }),
        el('ul', null, [
          el('li', { text: '4 в ряд → линия (сжигает ряд/столбец) и дополнительный ход.' }),
          el('li', { text: 'Фигура L или T → бомба (взрыв 3×3).' }),
          el('li', { text: '5 в ряд → суперзвезда: поменяйте её с любым блоком, чтобы сжечь все блоки этого цвета.' }),
          el('li', { text: 'Меняйте два спецблока между собой — мощные комбинации. Каскады усиливают эффект (+20% за волну). Иногда ход становится «решающим моментом» (×1.5) — шанс зависит от Хладнокровия.' })
        ]),
        el('h4', { text: 'Поле и ситуации' }),
        el('p', { text: 'Поле делится на 5 зон. Темп атаки перемещает мяч к штрафной соперника; в штрафной темп превращается в «угрозу» — при 60+ удар наносится автоматически. Обороняющиеся копят прессинг (100 = отбор и шанс контратаки) и щит. Фолы приводят к штрафным, пенальти (вы выбираете угол!) и карточкам; удары — к угловым.' }),
        el('h4', { text: 'Характеристики и тактика' }),
        el('p', { text: 'У игроков 8 характеристик (1–20): Удар, Пас, Дриблинг, Скорость, Отбор, Позиция, Выносливость, Хладнокровие (+ Рефлексы у вратарей). В обороне у своих ворот работают защитники, в центре — полузащитники, у чужих ворот — нападающие: схема определяет, кто и где участвует. Усталость снижает все характеристики — делайте замены. План на игру, менталитет, прессинг и линия обороны меняют силу каждого цвета.' }),
        el('h4', { text: 'Форма и развитие' }),
        el('p', { text: 'Форма — взвешенная средняя оценок за 5 последних матчей (последний важнее всего). Отличная форма даёт до +2 ко всем характеристикам в матче, ужасная — до −2. Стрелки ⇈ ↑ → ↓ ⇊ видны в составе и на схеме; тренеры-ИИ и автосостав учитывают форму. В межсезонье характеристики меняются в зависимости от возраста, средней оценки (выше 7.0 — сильнее растут или медленнее стареют, ниже 6.3 — наоборот) и игровой практики.' }),
        el('h4', { text: 'Особенности игроков' }),
        el('p', null, [`У игроков есть особенности (всего ${Object.keys(G.TRAITS.LIST).length}): «Спорит с судьями», «Бьёт при первой возможности», «Передерживает мяч», «Решает в концовке», «Хрупкий» и другие. Они срабатывают, пока игрок на поле, и меняют силу блоков, удары, фолы, карточки, усталость и травмы. Значки видны в составе и на схеме — наведите на значок, чтобы прочитать эффект. `, el('button.btn.ghost.small', { text: 'Все особенности', onclick: () => UI.traitsGuide() })]),
        el('p', { text: 'Тренеры-ИИ выбирают схему и план исходя из своих предпочтений, состава и силы соперника, а по ходу матча реагируют на счёт, усталость и удаления. В перерыве, на 60-й и 75-й минутах тренер разбирает игру: если команду душат прессингом, техничный состав переходит на «Владение», а слабый технически — на «Прямой футбол»; против низкого блока идёт через фланги или бьёт издали, против высокой линии — на рывки за спину; опускает линию против быстрых нападающих, снижает прессинг при усталости и карточках, добавляет полузащитника, если проигрывает центр.'})
      ]);
      UI.modal({ title: first ? 'Добро пожаловать в «Комбинацию»!' : 'Как играть', content, wide: true, buttons: [{ text: first ? 'Поехали!' : 'Понятно', cls: 'primary' }] });
    }
  };

  G.App = App;
})(typeof window !== 'undefined' ? window : globalThis);
