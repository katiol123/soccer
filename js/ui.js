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
      UI.renewHook = {
        can: (p, club) => this.st && club.id === this.st.userClub && p.contract <= 2 && !p.loan,
        own: (club) => this.st && club.id === this.st.userClub,
        open: (p, club) => this.renewModal(p, club)
      };
      UI.buyHook = {
        can: (p, club) => this.st && this.st.userClub && !!club.players && club.id !== this.st.userClub && G.TR.windowState(this.st).open,
        open: (p) => this.buyModal(p.id)
      };
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
          el('div.cd-fin', null, [
            el('div', null, [el('small', { text: 'Бюджет зарплат' }), el('b', { text: c.fin ? G.FIN.fmtW(c.fin.wageBudget) : '—' })]),
            el('div', null, [el('small', { text: 'Стоимость состава' }), el('b', { text: G.FIN.fmtM(G.FIN.squadValue(c)) })]),
            el('div', null, [el('small', { text: 'Стадион' }), el('b', { text: Math.round((G.FIN.CAPACITY[c.id] || 30) * 1000).toLocaleString('ru') + ' мест' })])
          ]),
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
        st.board = null;
        G.FIN.init(st);
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
      if (st.sacked && st.userClub) setTimeout(() => this.sackModal(), 300);
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      if (uc) { root.style.setProperty('--c1', uc.c1); root.style.setProperty('--c2', uc.c2); }
      const nav = el('nav.hub-nav');
      const tabs = [['home', 'Главная'], ['squad', uc ? 'Состав и тактика' : 'Клубы'], ['table', 'Таблица'], ['fixtures', 'Календарь'], ['stats', 'Статистика'], ['finance', 'Финансы'], ['transfers', 'Трансферы']];
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
      ({ home: () => this.tabHome(body), squad: () => this.tabSquad(body), table: () => this.tabTable(body), fixtures: () => this.tabFixtures(body), stats: () => this.tabStats(body), finance: () => this.tabFinance(body), transfers: () => this.tabTransfers(body) })[this.tab]();
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
      if (uc && uc.fin) side.appendChild(this.transferMini(uc));
      if (uc && uc.fin) side.appendChild(this.financeMini(uc));
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
      if (r.att) content.appendChild(el('div.muted', { text: `🏟 ${h.stadium}: ${r.att.toLocaleString('ru')} зрителей`, style: { textAlign: 'center' } }));
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

    /* ---------- Трансферы ---------- */
    transferMini(c) {
      const st = this.st, w = G.TR.windowState(st), m = G.TR.market(st);
      const box = el('div.card.fin-mini', { onclick: () => this.hub('transfers') }, [el('h3', { text: 'Трансферы' })]);
      box.appendChild(el('div.fm-row', null, [el('span', { text: w.name }), el('b', { text: w.open ? '🟢 ' + w.text : '🔴 ' + w.text })]));
      box.appendChild(el('div.fm-row', null, [el('span', { text: 'Бюджет' }), el('b', { text: G.FIN.fmtM(c.fin.transferBudget || 0) })]));
      if (m.offers.length) box.appendChild(el('div.fm-warn', { text: `📨 Входящих предложений: ${m.offers.length}` }));
      const req = c.players.filter(p => p.treq && !m.listed.includes(p.id));
      if (req.length) box.appendChild(el('div.fm-warn', { text: `✉ Просят о трансфере: ${req.map(p => p.name).join(', ')}` }));
      return box;
    },

    tabTransfers(body) {
      const st = this.st, w = G.TR.windowState(st), m = G.TR.market(st);
      if (!st.userClub) {
        const wrap = el('div.fin-wrap');
        wrap.appendChild(el('div.kpis', null, [el('div.card.kpi' + (w.open ? '.ok' : '.neg'), null, [el('small', { text: w.name }), el('b', { text: w.open ? 'Открыто' : 'Закрыто' }), el('span', { text: w.text })]),
          el('div.card.kpi', null, [el('small', { text: 'Сделок за всё время' }), el('b', { text: m.history.filter(h => h.to).length }), el('span', { text: 'клубы-ИИ покупают под нужды состава и идеи тренера' })])]));
        const card = el('div.card.wide-card');
        this.trHistory(card);
        wrap.appendChild(card);
        body.appendChild(wrap);
        return;
      }
      const me = LEAGUE.club(st, st.userClub);
      this.trTab = this.trTab || 'search';
      const wrap = el('div.fin-wrap');
      const kpi = (label, val, sub, cls) => el('div.card.kpi' + (cls ? '.' + cls : ''), null, [el('small', { text: label }), el('b', { text: val }), sub ? el('span', { text: sub }) : null]);
      wrap.appendChild(el('div.kpis', null, [
        kpi(w.name, w.open ? 'Открыто' : 'Закрыто', w.text, w.open ? 'ok' : 'neg'),
        kpi('Трансферный бюджет', G.FIN.fmtM(me.fin.transferBudget || 0), '70% от продаж возвращается в бюджет'),
        kpi('Зарплаты', `£${G.FIN.wageBill(me)} / ${me.fin.wageBudget} тыс.`, 'ведомость / бюджет в неделю', G.FIN.wageBill(me) > me.fin.wageBudget ? 'neg' : ''),
        kpi('Состав', `${me.players.length} / ${G.TR.MAX_SQUAD}`, 'максимум игроков в заявке')
      ]));
      const tabs = el('div.seg.tr-tabs');
      [['search', 'Поиск'], ['free', 'Свободные агенты'], ['offers', `Предложения${m.offers.length ? ' (' + m.offers.length + ')' : ''}`], ['sell', 'Продажа'], ['loans', 'Аренды'], ['short', `Избранное${m.short.length ? ' (' + m.short.length + ')' : ''}`], ['history', 'История']].forEach(([k, n]) => tabs.appendChild(el('button' + (this.trTab === k ? '.on' : ''), { text: n, onclick: () => { this.trTab = k; this.hub('transfers'); } })));
      wrap.appendChild(tabs);
      const card = el('div.card.wide-card');
      if (this.trTab === 'search') this.trSearch(card);
      else if (this.trTab === 'short') this.trList(card, G.TR.search(st, {}).filter(x => m.short.includes(x.p.id)), 'Избранное пусто — отмечайте игроков звёздочкой в поиске.');
      else if (this.trTab === 'offers') this.trOffers(card);
      else if (this.trTab === 'sell') this.trSell(card);
      else if (this.trTab === 'loans') this.trLoans(card);
      else if (this.trTab === 'free') this.trFree(card);
      else this.trHistory(card);
      wrap.appendChild(card);
      body.appendChild(wrap);
    },

    trSearch(card) {
      const st = this.st;
      const f = this.trF = this.trF || { pos: 'ALL', sort: 'ovr', maxAge: 0, minOvr: 0, maxPrice: 0, listedOnly: false, q: '', trait: '' };
      const bar = el('div.tr-filters');
      const sel = (opts, key, conv) => { const s = el('select', { onchange: (e) => { f[key] = conv ? conv(e.target.value) : e.target.value; render(); } }); opts.forEach(([v, n]) => { const o = el('option', { value: v, text: n }); if (String(f[key]) === String(v)) o.selected = true; s.appendChild(o); }); return s; };
      bar.append(
        el('input.tr-q', { placeholder: 'Имя игрока…', value: f.q, oninput: (e) => { f.q = e.target.value; render(); } }),
        sel([['ALL', 'Все позиции'], ['GK', 'Вратари'], ['DF', 'Защитники'], ['MF', 'Полузащитники'], ['FW', 'Нападающие']], 'pos'),
        sel([[0, 'Любой возраст'], [21, 'до 21'], [23, 'до 23'], [26, 'до 26'], [29, 'до 29']], 'maxAge', Number),
        sel([[0, 'Любой рейтинг'], [13, '13+'], [14, '14+'], [15, '15+'], [16, '16+'], [17, '17+']], 'minOvr', Number),
        sel([[0, 'Любая цена'], [5, 'до £5 млн'], [15, 'до £15 млн'], [30, 'до £30 млн'], [60, 'до £60 млн'], [100, 'до £100 млн']], 'maxPrice', Number),
        sel([['', 'Любая особенность']].concat(Object.keys(G.TRAITS.LIST).map(k => [k, G.TRAITS.LIST[k].i + ' ' + G.TRAITS.LIST[k].n])), 'trait'),
        sel([['ovr', 'Сорт.: рейтинг'], ['value', 'Сорт.: дороже'], ['cheap', 'Сорт.: дешевле'], ['age', 'Сорт.: моложе']], 'sort'),
        el('label.tr-chk', null, [el('input', { type: 'checkbox', checked: f.listedOnly || null, onchange: (e) => { f.listedOnly = e.target.checked; render(); } }), ' только продаваемые'])
      );
      card.appendChild(bar);
      const host = el('div');
      card.appendChild(host);
      const render = () => { host.innerHTML = ''; this.trList(host, G.TR.search(st, f).slice(0, 80), 'Никого не найдено — ослабьте фильтры.'); };
      render();
    },

    trList(host, rows, empty) {
      const st = this.st, m = G.TR.market(st), w = G.TR.windowState(st);
      if (!rows.length) { host.appendChild(el('div.muted', { text: empty })); return; }
      const tbl = el('table.squad');
      tbl.appendChild(el('thead', null, [el('tr', null, ['', 'Поз', 'Игрок', 'Клуб', 'Воз', 'Рейт', 'Форма', 'Статус', 'Стоимость', 'Зарплата', 'Контр.', ''].map(t => el('th', { text: t })))]));
      const tb = el('tbody');
      rows.forEach(({ p, c, ovr, v, listed, st: s, nfs, onLoan }) => {
        const starOn = m.short.includes(p.id);
        tb.appendChild(el('tr', { onclick: () => UI.playerModal(p, c) }, [
          el('td', null, [el('button.star-btn' + (starOn ? '.on' : ''), { text: starOn ? '★' : '☆', title: 'Избранное', onclick: (e) => { e.stopPropagation(); m.short = starOn ? m.short.filter(id => id !== p.id) : m.short.concat([p.id]); e.target.classList.toggle('on'); e.target.textContent = m.short.includes(p.id) ? '★' : '☆'; LEAGUE.save(st); } })]),
          el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]),
          el('td.pname', null, [p.name + ' ', UI.traitIcons(p)]),
          el('td', null, [UI.crest(c, 20), ' ' + c.short]),
          el('td', { text: p.age }),
          el('td', null, [el('b', { text: ovr.toFixed(1), style: { color: U.attrColor(ovr) } })]),
          el('td', null, [UI.formBadge(p)]),
          el('td', null, [el('span.tr-st.' + (onLoan ? 'loan' : nfs ? 'nfs' : listed ? 'listed' : s), { text: onLoan ? 'В аренде' : nfs ? 'Не продаётся' : listed ? 'Готовы продать' : G.TR.STATUS_TXT[s] })]),
          el('td', { text: G.FIN.fmtM(v) }),
          el('td', { text: '£' + p.wage + 'к' }),
          el('td', { text: p.contract }),
          el('td.tr-btns', null, [w.open && st.userClub && !nfs ? el('button.btn.small', { text: 'Купить', onclick: (e) => { e.stopPropagation(); this.buyModal(p.id); } }) : null,
            w.open && st.userClub && !onLoan && (s === 'rotation' || s === 'surplus' || p.age <= 22) && s !== 'key' ? el('button.btn.small.ghost', { text: 'Аренда', onclick: (e) => { e.stopPropagation(); this.loanInModal(p.id); } }) : null])
        ]));
      });
      tbl.appendChild(tb);
      host.appendChild(el('div.table-scroll', null, [tbl]));
    },

    trOffers(card) {
      const st = this.st, m = G.TR.market(st);
      card.appendChild(el('h3', { text: 'Входящие предложения' }));
      if (!m.offers.length) { card.appendChild(el('div.muted', { text: G.TR.windowState(st).open ? 'Пока предложений нет. Выставьте игроков на трансфер во вкладке «Продажа» — клубы начнут присылать ставки после туров.' : 'Окно закрыто.' })); return; }
      m.offers.forEach(o => {
        const f = G.TR.findPlayer(st, o.pid), buyer = LEAGUE.club(st, o.from);
        if (!f || !buyer) return;
        const p = f.p;
        const row = el('div.offer', null, [
          UI.crest(buyer, 34),
          el('div.offer-t', null, [el('b', { text: `«${buyer.name}» → ${p.name}` }), el('small', { text: `${UI.posName(p.pos)}, ${p.age} · рейтинг ${TAC.overall(p).toFixed(1)} · стоимость ${G.FIN.fmtM(G.FIN.value(p))} · действует до ${o.expires + 1}-го тура` })]),
          el('div.offer-fee', { text: G.FIN.fmtM(o.fee) }),
          el('div.offer-act', null, [
            el('button.btn.small.primary', { text: 'Принять', onclick: () => this.answer(o.id, 'accept') }),
            el('button.btn.small', { text: 'Хочу больше', disabled: o.haggled || null, onclick: () => this.answer(o.id, 'more') }),
            el('button.btn.small.ghost', { text: 'Отклонить', onclick: () => this.answer(o.id, 'reject') })
          ])
        ]);
        card.appendChild(row);
      });
    },

    answer(id, action) {
      const r = G.TR.answerOffer(this.st, id, action);
      UI.toast(r.msg, r.ok ? '' : 'warn');
      LEAGUE.save(this.st);
      this.hub('transfers');
    },

    trSell(card) {
      const st = this.st, me = LEAGUE.club(st, st.userClub), m = G.TR.market(st);
      card.appendChild(el('h3', { text: 'Продажа игроков' }));
      card.appendChild(el('div.muted.small-note', { text: 'Выставленные игроки чаще получают предложения, но клубы предлагают меньше. За сильных игроков клубы могут прислать предложение и без выставления. Предложения приходят после туров, пока открыто окно.' }));
      const tbl = el('table.squad');
      tbl.appendChild(el('thead', null, [el('tr', null, ['Поз', 'Игрок', 'Воз', 'Рейт', 'Настр.', 'Стоимость', 'Зарплата', 'Контр.', ''].map(t => el('th', { text: t })))]));
      const tb = el('tbody');
      me.players.filter(p => !p.loan).sort((a, b) => (b.treq ? 1 : 0) - (a.treq ? 1 : 0) || TAC.overall(b) - TAC.overall(a)).forEach(p => {
        const on = m.listed.includes(p.id);
        const ml = G.FIN.moodLabel(p.mood == null ? 60 : p.mood);
        tb.appendChild(el('tr' + (on ? '.listed-row' : ''), { onclick: () => UI.playerModal(p, me) }, [
          el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]),
          el('td.pname', null, [p.name + ' ', UI.traitIcons(p), p.treq ? el('span.treq', { text: ' ✉ просит трансфер' }) : null]),
          el('td', { text: p.age }), el('td', null, [el('b', { text: TAC.overall(p).toFixed(1), style: { color: U.attrColor(TAC.overall(p)) } })]),
          el('td', { text: ml[1], title: ml[0] }), el('td', { text: G.FIN.fmtM(G.FIN.value(p)) }), el('td', { text: '£' + p.wage + 'к' }), el('td', { text: p.contract }),
          el('td.tr-btns', null, [el('button.btn.small' + (on ? '.on' : ''), { text: on ? 'Снять с трансфера' : 'Выставить', onclick: (e) => { e.stopPropagation(); G.TR.list(st, p.id, !on); LEAGUE.save(st); this.hub('transfers'); } }),
            G.TR.windowState(st).open ? el('button.btn.small.ghost', { text: 'В аренду', onclick: (e) => { e.stopPropagation(); this.loanOutModal(p.id); } }) : null])
        ]));
      });
      tbl.appendChild(tb);
      card.appendChild(el('div.table-scroll', null, [tbl]));
    },

    trHistory(card) {
      const st = this.st, m = G.TR.market(st);
      card.appendChild(el('h3', { text: 'История трансферов' }));
      if (!m.history.length) { card.appendChild(el('div.muted', { text: 'Сделок пока не было.' })); return; }
      m.history.slice().reverse().forEach(h => {
        const a = h.from ? LEAGUE.club(st, h.from) : null, b = h.to ? LEAGUE.club(st, h.to) : null;
        if (!a && b) { card.appendChild(el('div.hist-row.' + mine, null, [el('small', { text: `${h.season}, тур ${h.round}` }), el('b', { text: h.name }), el('span', null, ['свободный агент → ', UI.crest(b, 18), ` ${b.short}`]), el('b.loan-tag', { text: 'бесплатно' })])); return; }
        if (!a) return;
        if (!b) { card.appendChild(el('div.hist-row', null, [el('small', { text: `${h.season}, тур ${h.round}` }), el('b', { text: h.name }), el('span', null, [UI.crest(a, 18), ` ${a.short} → свободный агент`]), el('b', { text: '—' })])); return; }
        const mine = h.to === st.userClub ? 'in' : h.from === st.userClub ? 'out' : '';
        if (h.loan) { card.appendChild(el('div.hist-row.' + mine, null, [el('small', { text: `${h.season}, тур ${h.round}` }), el('b', { text: h.name }), el('span', null, [UI.crest(a, 18), ` ${a.short} → `, UI.crest(b, 18), ` ${b.short}`]), el('b.loan-tag', { text: 'аренда' + (h.fee ? ' · ' + G.FIN.fmtM(h.fee) : '') })])); return; }
        card.appendChild(el('div.hist-row.' + mine, null, [el('small', { text: `${h.season}, тур ${h.round}` }), el('b', { text: h.name }), el('span', null, [UI.crest(a, 18), ` ${a.short} → `, UI.crest(b, 18), ` ${b.short}`]), el('b', { text: G.FIN.fmtM(h.fee) })]));
      });
    },

    /* ---------- Свободные агенты ---------- */
    trFree(card) {
      const st = this.st, CAR = G.CAR, fa = CAR.pool(st);
      card.appendChild(el('h3', { text: `Свободные агенты (${fa.length})` }));
      card.appendChild(el('div.muted.small-note', { text: 'Игроки без клуба: не продлили контракт или были отчислены. Подписать можно в любое время, без платы за трансфер. Чем дольше игрок без клуба, тем скромнее его требования. Ветераны 34+ без клуба завершают карьеру летом.' }));
      if (!fa.length) { card.appendChild(el('div.muted', { text: 'Сейчас свободных агентов нет.' })); return; }
      const tbl = el('table.squad');
      tbl.appendChild(el('thead', null, [el('tr', null, ['Поз', 'Игрок', 'Воз', 'Рейт', 'Стоимость', 'Просит', 'Без клуба', ''].map(t => el('th', { text: t })))]));
      const tb = el('tbody');
      fa.slice().sort((a, b) => TAC.overall(b) - TAC.overall(a)).forEach(p => {
        const d = CAR.faDemand(st, p);
        tb.appendChild(el('tr', { onclick: () => UI.playerModal(p, { id: '_fa', name: 'Свободный агент', c1: '#444', c2: '#888', short: 'FA' }) }, [
          el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]), el('td.pname', null, [p.name + ' ', UI.traitIcons(p)]), el('td', { text: p.age }),
          el('td', null, [el('b', { text: TAC.overall(p).toFixed(1), style: { color: U.attrColor(TAC.overall(p)) } })]),
          el('td', { text: G.FIN.fmtM(G.FIN.value(p)) }), el('td', { text: G.FIN.fmtW(d.wage) }), el('td', { text: `${d.idle} ${U.plural(d.idle, 'тур', 'тура', 'туров')}` }),
          el('td', null, [el('button.btn.small.primary', { text: 'Подписать', onclick: (e) => { e.stopPropagation(); this.faModal(p.id); } })])
        ]));
      });
      tbl.appendChild(tb);
      card.appendChild(el('div.table-scroll', null, [tbl]));
    },

    faModal(pid) {
      const st = this.st, CAR = G.CAR, p = CAR.pool(st).find(x => x.id === pid);
      if (!p) return;
      const d = CAR.faDemand(st, p), me = LEAGUE.club(st, st.userClub);
      const state = { wage: d.wage, years: d.years[0] };
      const wv = el('b'), msg = el('div.renew-hint');
      const upd = () => { wv.textContent = `${G.FIN.fmtW(state.wage)} · ведомость ${G.FIN.wageBill(me) + state.wage} / ${me.fin.wageBudget}`; };
      const slider = el('input', { type: 'range', min: Math.round(d.wage * 0.7), max: Math.round(d.wage * 1.3), step: 1, value: d.wage, oninput: (e) => { state.wage = +e.target.value; upd(); } });
      const yrs = el('div.seg');
      [1, 2, 3, 4].forEach(y => yrs.appendChild(el('button' + (y === state.years ? '.on' : ''), { text: y + ' ' + U.plural(y, 'год', 'года', 'лет'), onclick: (e) => { state.years = y; U.$$('button', yrs).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); } })));
      upd();
      const content = el('div.renew', null, [
        el('div.pc-head', null, [el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · свободный агент ${d.idle} ${U.plural(d.idle, 'тур', 'тура', 'туров')}` })])]),
        el('div.agent', null, [el('div', { text: `💬 Агент: «Он просит ${G.FIN.fmtW(d.wage)}, контракт на ${d.years[0]}–${d.years[1]} ${U.plural(d.years[1], 'год', 'года', 'лет')}».` })]),
        el('div.renew-row', null, [el('span', { text: 'Зарплата' }), slider, wv]), el('div.renew-row', null, [el('span', { text: 'Срок' }), yrs]), msg,
        el('div.renew-btns', null, [el('button.btn.primary', { text: 'Подписать контракт', onclick: () => { const r = CAR.signFree(st, st.userClub, pid, state.wage, state.years); if (r.ok) { md.close(); UI.toast(r.msg); st.news.push({ r: st.round, text: '✍ ' + r.msg }); LEAGUE.save(st); this.hub('transfers'); } else msg.textContent = r.msg; } })])
      ]);
      const md = UI.modal({ title: 'Свободный агент', content, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
    },

    /* ---------- Увольнение ---------- */
    sackModal() {
      const st = this.st, CAR = G.CAR;
      if (!st.sacked || document.querySelector('.modal.sack')) return;
      const old = LEAGUE.club(st, st.sacked.club);
      const offers = CAR.jobOffers(st);
      const content = el('div.sack-box', null, [
        el('div.se-trophy', { text: '📉' }),
        el('p.lead', { text: `Совет директоров «${old.name}» принял решение расторгнуть с вами контракт. Доверие упало до ${st.sacked.conf}%.` }),
        el('h4', { text: 'Вам поступили предложения' })
      ]);
      offers.forEach(c => {
        const recent = st.sacks && st.sacks[c.id + '@' + st.season];
        const pos = LEAGUE.standings(st).findIndex(r => r.id === c.id) + 1;
        content.appendChild(el('div.offer', null, [UI.crest(c, 40), el('div.offer-t', null, [el('b', { text: c.name }), el('small', { text: `${pos}-е место · цель совета: ${c.fin.target}-е · бюджет ${G.FIN.fmtM(c.fin.transferBudget || 0)}${recent ? ' · только что уволили тренера' : ''}` })]),
          el('div.offer-act', null, [el('button.btn.small.primary', { text: 'Возглавить', onclick: () => { CAR.takeJob(st, c.id); LEAGUE.save(st); md.close(); this.hub('home'); UI.toast(`Вы — новый тренер «${c.name}»!`); } })])]));
      });
      const md = UI.modal({ title: 'Вы уволены', cls: 'sack', content, closable: false, buttons: [
        { text: 'Продолжить в режиме зрителя', cls: 'ghost', onClick: () => { CAR.toSpectator(st); LEAGUE.save(st); setTimeout(() => this.hub('home'), 50); } },
        { text: 'Главное меню', cls: 'ghost', onClick: () => { LEAGUE.save(st); setTimeout(() => this.menu(), 50); } }
      ] });
    },

    /* ---------- Аренды ---------- */
    trLoans(card) {
      const st = this.st, me = LEAGUE.club(st, st.userClub), TR = G.TR;
      card.appendChild(el('h3', { text: 'Отданы в аренду' }));
      const out = TR.loansOut(st, me.id);
      if (!out.length) card.appendChild(el('div.muted', { text: 'Никого. Отправить игрока набираться опыта можно во вкладке «Продажа» → «В аренду». Игровая практика в аренде ускоряет развитие в межсезонье.' }));
      out.forEach(({ p, c }) => {
        const mm = TR.loanMinutes(st, p), L = p.loan, avg = p.st.apps ? (p.st.rsum / p.st.apps).toFixed(2) : '—';
        card.appendChild(el('div.offer', { onclick: () => UI.playerModal(p, c) }, [UI.crest(c, 34),
          el('div.offer-t', null, [el('b', { text: `${p.name} → «${c.name}»` }), el('small', { text: `${TR.PROMISE[L.promise].n} · ${st.round > (L.round0 || 0) ? `сыграл ${mm.played} из ${mm.possible}` : 'ещё не играл'} · ср. оценка ${avg} · они платят ${Math.round(L.share * 100)}% зарплаты${L.option ? ' · опция выкупа ' + G.FIN.fmtM(L.option) : ''}${p.contract <= 1 ? ' · ⚠ контракт истекает' : ''}` })]),
          el('div.offer-fee', { text: Math.round(mm.share * 100) + '%' , title: 'Доля сыгранных матчей' }),
          el('div.offer-act', null, [p.contract <= 2 ? el('button.btn.small', { text: 'Продлить контракт', onclick: (e) => { e.stopPropagation(); this.renewModal(p, me); } }) : null])
        ]));
      });
      card.appendChild(el('h3', { text: 'Арендованы', style: { marginTop: '18px' } }));
      const ins = TR.loansIn(me);
      if (!ins.length) card.appendChild(el('div.muted', { text: `Арендовать игрока можно в «Поиске» — кнопка «Аренда». Не больше ${4} арендованных одновременно.` }));
      ins.forEach(p => {
        const owner = LEAGUE.club(st, p.loan.from), mm = TR.loanMinutes(st, p), L = p.loan;
        const need = TR.PROMISE[L.promise].k;
        const early = st.round - (L.round0 || 0) < 3;
        const ok = early || mm.share + 0.05 >= need;
        card.appendChild(el('div.offer', { onclick: () => UI.playerModal(p, me) }, [UI.crest(owner, 34),
          el('div.offer-t', null, [el('b', { text: `${p.name} (из «${owner.name}»)` }), el('small', { text: `Обещано: ${TR.PROMISE[L.promise].n.toLowerCase()}${need ? ` (≥${Math.round(need * 100)}% матчей)` : ''} · ${st.round > (L.round0 || 0) ? `сыграл ${mm.played} из ${mm.possible}` : 'ещё не играл'} · вы платите ${Math.round(L.share * 100)}% зарплаты (${Math.round(p.wage * L.share)} тыс./нед)` }), need ? el('small.' + (ok ? 'ok-txt' : 'warn-txt'), { text: early ? 'Ставьте его в состав — клуб следит за игровым временем' : ok ? '✓ Обещание выполняется' : '⚠ Обещание нарушается — зимой клуб может отозвать игрока' }) : null]),
          el('div.offer-fee', { text: L.option ? G.FIN.fmtM(L.option) : '—', title: 'Опция выкупа' }),
          el('div.offer-act', null, [L.option ? el('button.btn.small.primary', { text: 'Выкупить', onclick: (e) => { e.stopPropagation(); const r = TR.exerciseOption(st, p); UI.toast(r.msg, r.ok ? '' : 'warn'); LEAGUE.save(st); this.hub('transfers'); } }) : null])
        ]));
      });
    },

    loanOutModal(pid) {
      const st = this.st, TR = G.TR, me = LEAGUE.club(st, st.userClub), p = me.players.find(x => x.id === pid);
      const v = G.FIN.value(p);
      const terms = { promise: 'start', share: 0.5, option: null };
      const content = el('div.renew');
      const list = el('div');
      const shareV = el('b');
      const redrawList = () => {
        list.innerHTML = '';
        const r = TR.loanOutOffers(st, pid, terms);
        if (r.error) { list.appendChild(el('div.renew-hint', { text: r.error })); return; }
        if (!r.list.length) { list.appendChild(el('div.muted', { text: 'На таких условиях никто не готов взять игрока. Снизьте долю зарплаты, ослабьте гарантии или добавьте опцию выкупа.' })); return; }
        r.list.forEach(o => list.appendChild(el('div.offer', null, [UI.crest(o.c, 30),
          el('div.offer-t', null, [el('b', { text: o.c.name }), el('small', { text: `${o.fit >= 0 ? 'будет игроком основы' : o.fit >= -1.5 ? 'борьба за место в составе' : 'скорее запасной'} · готовы платить до ${o.pay}% зарплаты` })]),
          el('div.offer-fee', { text: o.fee ? G.FIN.fmtM(o.fee) : 'без платы', title: 'Плата за аренду' }),
          el('div.offer-act', null, [el('button.btn.small.primary', { text: 'Отдать', onclick: () => { const res = TR.loanOut(st, pid, o.c.id, Object.assign({}, terms, { fee: o.fee })); UI.toast(res.msg, res.ok ? '' : 'warn'); LEAGUE.save(st); md.close(); this.hub('transfers'); } })])
        ])));
      };
      const promise = el('div.seg');
      [['start', 'Основа'], ['rot', 'Ротация'], ['none', 'Без гарантий']].forEach(([k, n]) => promise.appendChild(el('button' + (k === terms.promise ? '.on' : ''), { text: n, onclick: (e) => { terms.promise = k; U.$$('button', promise).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); redrawList(); } })));
      const opt = el('div.seg');
      [[null, 'Нет'], [1, `${G.FIN.fmtM(v)}`], [1.3, `${G.FIN.fmtM(Math.round(v * 13) / 10)}`]].forEach(([k, n]) => opt.appendChild(el('button' + (k === null ? '.on' : ''), { text: n, onclick: (e) => { terms.option = k ? Math.round(v * k * 10) / 10 : null; U.$$('button', opt).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); redrawList(); } })));
      const slider = el('input', { type: 'range', min: 0, max: 100, step: 5, value: 50, oninput: (e) => { terms.share = +e.target.value / 100; shareV.textContent = `${e.target.value}% (${Math.round(p.wage * terms.share)} тыс./нед)`; redrawList(); } });
      shareV.textContent = `50% (${Math.round(p.wage * 0.5)} тыс./нед)`;
      content.append(el('div.pc-head', null, [el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · зарплата ${G.FIN.fmtW(p.wage)}` })])]),
        el('div.muted.small-note', { text: 'Игровая практика в аренде (8+ матчей, а лучше 15+) ускоряет развитие в межсезонье. В конце сезона игрок вернётся — если арендатор не исполнит опцию выкупа.' }),
        el('div.renew-row', null, [el('span', { text: 'Гарантии' }), promise]),
        el('div.renew-row', null, [el('span', { text: 'Платят они' }), slider, shareV]),
        el('div.renew-row', null, [el('span', { text: 'Опция выкупа' }), opt]),
        el('h4', { text: 'Заинтересованные клубы' }), list);
      redrawList();
      const md = UI.modal({ title: 'Аренда: отдать игрока', content, wide: true, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
    },

    loanInModal(pid) {
      const st = this.st, TR = G.TR;
      const r = TR.loanInTerms(st, pid);
      if (r.error) { UI.toast(r.error, 'warn'); return; }
      const { p, owner, terms } = r;
      const content = el('div.renew');
      const info = el('div.renew-info');
      const me = LEAGUE.club(st, st.userClub);
      const redraw = () => {
        info.innerHTML = '';
        info.append(
          el('div', null, [el('small', { text: 'Гарантии игрового времени' }), el('b', { text: TR.PROMISE[terms.promise].n + (TR.PROMISE[terms.promise].k ? ` (≥${Math.round(TR.PROMISE[terms.promise].k * 100)}% матчей)` : '') })]),
          el('div', null, [el('small', { text: 'Вы платите' }), el('b', { text: `${Math.round(terms.share * 100)}% зарплаты — ${Math.round(p.wage * terms.share)} тыс./нед` })]),
          el('div', null, [el('small', { text: 'Плата за аренду' }), el('b', { text: terms.fee ? G.FIN.fmtM(terms.fee) : 'нет' })]),
          el('div', null, [el('small', { text: 'Опция выкупа' }), el('b', { text: terms.option ? G.FIN.fmtM(terms.option) : 'нет' })])
        );
      };
      redraw();
      const msg = el('div.renew-hint');
      let haggled = false;
      content.append(el('div.pc-head', null, [UI.crest(owner, 40), el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · «${owner.name}»` })])]),
        el('div.agent', null, [el('div', { text: `💬 «${owner.name}»: ${terms.promise === 'start' ? '«Он должен играть — иначе заберём его зимой».' : terms.promise === 'rot' ? '«Ждём, что он будет получать минуты».' : '«Готовы отпустить без условий».'}` })]),
        info, msg,
        el('div.renew-btns', null, [
          el('button.btn.primary', { text: 'Арендовать', onclick: () => { const res = TR.loanIn(st, pid, terms); if (res.ok) { md.close(); UI.toast(res.msg); LEAGUE.save(st); this.hub('transfers'); } else msg.textContent = res.msg; } }),
          el('button.btn', { text: 'Попросить снизить долю зарплаты', onclick: (e) => { if (haggled) return; haggled = true; e.target.disabled = true; if (U.rnd() < 0.5 && terms.share > 0.3) { terms.share = Math.max(0.2, Math.round((terms.share - 0.15) * 100) / 100); msg.textContent = `«${owner.name}» соглашается: вы платите ${Math.round(terms.share * 100)}%.`; redraw(); } else msg.textContent = `«${owner.name}» не уступает.`; } })
        ]));
      const md = UI.modal({ title: 'Аренда: взять игрока', content, buttons: [{ text: 'Закрыть', cls: 'ghost' }] });
      void me;
    },

    /* Переговоры о покупке: клуб → личные условия */
    buyModal(pid) {
      const st = this.st, TR = G.TR;
      const f = TR.findPlayer(st, pid); if (!f) return;
      const { p, c: seller } = f, me = LEAGUE.club(st, st.userClub);
      const n = TR.neg(st, pid);
      const content = el('div.renew');
      let md;
      const v = G.FIN.value(p);
      const head = el('div.pc-head', null, [UI.crest(seller, 44), el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · «${seller.name}» · ${TR.aiListed(seller, p) ? 'клуб готов продать' : TR.STATUS_TXT[TR.status(seller, p)]}` })])]);
      const stepClub = () => {
        content.innerHTML = '';
        content.appendChild(head);
        const nfs = TR.notForSale(st, seller, p);
        const ask = TR.asking(st, seller, p);
        const info = el('div.renew-info', null, [
          el('div', null, [el('small', { text: 'Рыночная стоимость' }), el('b', { text: G.FIN.fmtM(v) })]),
          el('div', null, [el('small', { text: 'Ориентир клуба (оценка скаутов)' }), el('b', { text: nfs ? 'не продаётся' : `${G.FIN.fmtM(ask * 0.9)} – ${G.FIN.fmtM(ask * 1.1)}` })]),
          el('div', null, [el('small', { text: 'Ваш трансферный бюджет' }), el('b', { text: G.FIN.fmtM(me.fin.transferBudget || 0) })]),
          el('div', null, [el('small', { text: 'Попыток осталось' }), el('b', { text: n.tries })])
        ]);
        content.appendChild(info);
        const state = { offer: Math.round(Math.min(me.fin.transferBudget || v, v) * 10) / 10 };
        const val = el('b');
        const max = Math.max(Math.round(v * 0.6 * 10) / 10 + 0.1, Math.round(Math.min(v * 2.2, me.fin.transferBudget || 0) * 10) / 10);
        const slider = el('input', { type: 'range', min: Math.round(v * 0.4 * 10) / 10, max, step: 0.1, value: state.offer, oninput: (e) => { state.offer = +e.target.value; val.textContent = G.FIN.fmtM(state.offer); } });
        val.textContent = G.FIN.fmtM(state.offer);
        content.appendChild(el('div.renew-row', null, [el('span', { text: 'Предложение' }), slider, val]));
        const msg = el('div.renew-hint');
        content.appendChild(msg);
        const btns = el('div.renew-btns');
        btns.appendChild(el('button.btn.primary', { text: 'Отправить предложение клубу', onclick: () => {
          const r = TR.bidClub(st, pid, state.offer);
          LEAGUE.save(st);
          if (r.status === 'accept') { stepTerms(r.msg); return; }
          msg.textContent = r.msg;
          if (r.status === 'counter') {
            btns.querySelectorAll('.cnt').forEach(b => b.remove());
            btns.appendChild(el('button.btn.cnt', { text: `Согласиться на ${G.FIN.fmtM(r.fee)}`, onclick: () => { const a = TR.acceptCounter(st, pid); LEAGUE.save(st); if (a && a.status === 'accept') stepTerms(a.msg); else msg.textContent = a ? a.msg : ''; } }));
          }
          info.lastChild.querySelector('b').textContent = TR.neg(st, pid).tries;
        } }));
        content.appendChild(btns);
      };
      const stepTerms = (lead) => {
        content.innerHTML = '';
        content.appendChild(head);
        content.appendChild(el('div.tr-ok', { text: '✅ ' + lead }));
        const t = TR.terms(st, p, seller, me);
        content.appendChild(el('div.agent', null, t.notes.map(x => el('div', { text: '💬 ' + x }))));
        if (t.refuse) { content.appendChild(el('div.renew-hint', { text: t.refuse })); return; }
        const state = { wage: t.wage, years: Math.round((t.years[0] + t.years[1]) / 2) };
        const info = el('div.renew-info');
        const redraw = () => {
          info.innerHTML = '';
          info.append(
            el('div', null, [el('small', { text: 'Сейчас получает' }), el('b', { text: G.FIN.fmtW(p.wage) })]),
            el('div', null, [el('small', { text: 'Требование' }), el('b', { text: `${G.FIN.fmtW(t.wage)}, ${t.years[0]}–${t.years[1]} ${U.plural(t.years[1], 'год', 'года', 'лет')}` })]),
            el('div' + (G.FIN.wageBill(me) + state.wage > me.fin.wageBudget ? '.neg' : ''), null, [el('small', { text: 'Ведомость после подписания' }), el('b', { text: `${G.FIN.wageBill(me) + state.wage} / ${me.fin.wageBudget} тыс./нед` })]),
            el('div', null, [el('small', { text: 'Попыток осталось' }), el('b', { text: t.tries })])
          );
          wv.textContent = G.FIN.fmtW(state.wage);
        };
        const wv = el('b');
        const slider = el('input', { type: 'range', min: Math.round(t.wage * 0.75), max: Math.round(t.wage * 1.4), step: 1, value: t.wage, oninput: (e) => { state.wage = +e.target.value; redraw(); } });
        const yrs = el('div.seg');
        [1, 2, 3, 4, 5].forEach(y => yrs.appendChild(el('button' + (y === state.years ? '.on' : ''), { text: y + ' ' + U.plural(y, 'год', 'года', 'лет'), onclick: (e) => { state.years = y; U.$$('button', yrs).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); } })));
        const msg = el('div.renew-hint');
        content.append(info, el('div.renew-row', null, [el('span', { text: 'Зарплата' }), slider, wv]), el('div.renew-row', null, [el('span', { text: 'Срок' }), yrs]), msg,
          el('div.renew-btns', null, [el('button.btn.primary', { text: 'Предложить контракт', onclick: () => {
            const r = TR.offerTerms(st, pid, state.wage, state.years);
            LEAGUE.save(st);
            if (r.ok) { md.close(); UI.toast(r.msg); G.FX.confetti([me.c1, me.c2, '#00ff87'], 120); G.SFX.goal(); this.hub(this.tab); return; }
            msg.textContent = r.msg; redraw();
            if (r.final) content.querySelector('.renew-btns').remove();
          } })]));
        redraw();
      };
      if (n.fee) stepTerms(`Сумма с клубом согласована: ${G.FIN.fmtM(n.fee)}.`); else stepClub();
      md = UI.modal({ title: 'Трансфер', content, buttons: [{ text: 'Закрыть', cls: 'ghost' }], onClose: () => { if (this.tab === 'transfers') this.hub('transfers'); } });
    },

    /* ---------- Финансы ---------- */
    financeMini(c) {
      const st = this.st, f = c.fin;
      const box = el('div.card.fin-mini', { onclick: () => this.hub('finance') }, [el('h3', { text: 'Финансы' })]);
      box.appendChild(el('div.fm-row', null, [el('span', { text: 'Баланс' }), el('b' + (f.balance < 0 ? '.neg' : ''), { text: G.FIN.fmtM(f.balance) })]));
      const bill = G.FIN.wageBill(c);
      box.appendChild(el('div.fm-row', null, [el('span', { text: 'Зарплаты' }), el('b' + (bill > f.wageBudget ? '.neg' : ''), { text: `${bill} / ${f.wageBudget} тыс./нед` })]));
      if (st.board) box.appendChild(this.boardMeter());
      const exp = c.players.filter(p => p.contract <= 1).length;
      if (exp) box.appendChild(el('div.fm-warn', { text: `✍ Истекают контракты: ${exp}` }));
      return box;
    },

    boardMeter() {
      const b = this.st.board;
      const col = b.conf >= 60 ? '#00ff87' : b.conf >= 35 ? '#ffd23f' : '#ff4d6d';
      const m = el('div.meter.board-m', null, [el('div.meter-top', null, [el('span', { text: `Доверие совета · цель: ${b.target}-е место` }), el('b', { text: Math.round(b.conf) + '%' })]), el('div.meter-bar', null, [el('i')])]);
      m.querySelector('i').style.width = b.conf + '%';
      m.querySelector('i').style.background = col;
      return m;
    },

    tabFinance(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const club = (!uc && this.finClub && LEAGUE.club(st, this.finClub)) || uc || st.clubs[0];
      const own = club === uc;
      const f = club.fin;
      const wrap = el('div.fin-wrap');
      if (!uc) {
        const picker = el('div.club-picker');
        st.clubs.slice().sort((a, b) => b.fin.balance - a.fin.balance).forEach(c => picker.appendChild(el('button' + (c === club ? '.on' : ''), { title: `${c.name}: ${G.FIN.fmtM(c.fin.balance)}`, onclick: () => { this.finClub = c.id; this.hub('finance'); } }, [UI.crest(c, 26)])));
        wrap.appendChild(picker);
      }
      // ключевые показатели
      const bill = G.FIN.wageBill(club);
      const kpi = (label, val, sub, cls) => el('div.card.kpi' + (cls ? '.' + cls : ''), null, [el('small', { text: label }), el('b', { text: val }), sub ? el('span', { text: sub }) : null]);
      const s = f.season;
      const income = s.tv + s.gate + s.comm + s.prize + Math.max(0, s.transfers || 0), expense = s.wages + s.ops + Math.min(0, s.transfers || 0);
      const kpis = el('div.kpis', null, [
        kpi('Баланс клуба', G.FIN.fmtM(f.balance), `${income + expense >= 0 ? '+' : ''}${(income + expense).toFixed(1)} млн за сезон`, f.balance < 0 ? 'neg' : ''),
        kpi('Зарплатная ведомость', `£${bill} тыс./нед`, `бюджет £${f.wageBudget} тыс. · ${G.FIN.yearly(bill).toFixed(0)} млн/год`, bill > f.wageBudget ? 'neg' : ''),
        kpi('Стоимость состава', G.FIN.fmtM(G.FIN.squadValue(club)), `${club.players.length} игроков`),
        kpi('Стадион', Math.round((G.FIN.CAPACITY[club.id] || 30) * 1000).toLocaleString('ru') + ' мест', `билет ~£${Math.round(G.FIN.ticket(club))}`)
      ]);
      wrap.appendChild(kpis);
      const grid = el('div.fin-grid');
      // доходы и расходы
      const led = el('div.card', null, [el('h3', { text: `Сезон ${st.seasonName}: доходы и расходы` })]);
      const rows = [['Телеправа', s.tv, 'Равная доля каждый тур + премия за место в конце сезона'], ['Билеты', s.gate, 'Каждый домашний матч: вместимость × посещаемость × цена билета'], ['Спонсоры', s.comm, 'Зависят от статуса клуба'], ['Призовые', s.prize, 'В конце сезона: место в таблице и еврокубки (1–6 место)'], ['Зарплаты', s.wages, 'Каждый тур: ведомость × 52 недели / 38 туров'], ['Операционные', s.ops, 'Персонал, инфраструктура, поездки, штрафы игроков'], ['Трансферы', s.transfers || 0, 'Покупки (−) и продажи (+) игроков']];
      const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r[1])));
      rows.forEach(([n, v, d]) => {
        const bar = el('div.led-bar', null, [el('i')]);
        bar.firstChild.style.width = (Math.abs(v) / maxAbs * 100) + '%';
        bar.firstChild.style.background = v >= 0 ? '#00ff87' : '#ff4d6d';
        led.appendChild(el('div.led-row', { title: d }, [el('span', { text: n }), bar, el('b', { text: (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) })]));
      });
      led.appendChild(el('div.led-row.total', null, [el('span', { text: 'Итого' }), el('span'), el('b' + (income + expense < 0 ? '.neg' : ''), { text: (income + expense >= 0 ? '+' : '−') + Math.abs(income + expense).toFixed(1) + ' млн' })]));
      if (f.last) led.appendChild(el('div.muted.small-note', { text: `Прошлый сезон (${f.last.season}, ${f.last.pos}-е место): ${f.last.profit >= 0 ? 'прибыль' : 'убыток'} ${G.FIN.fmtM(Math.abs(f.last.profit))}` }));
      grid.appendChild(led);
      // график баланса + совет
      const side = el('div.fin-side');
      const ch = el('div.card', null, [el('h3', { text: 'Баланс по турам' })]);
      const h = f.hist.slice(-40);
      if (h.length > 1) {
        const w = 300, hh = 90, mn = Math.min(0, ...h), mx = Math.max(...h), rng = mx - mn || 1;
        const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(hh - (v - mn) / rng * (hh - 10) - 5).toFixed(1)}`).join(' ');
        const zero = hh - (0 - mn) / rng * (hh - 10) - 5;
        ch.appendChild(el('div', { html: `<svg viewBox="0 0 ${w} ${hh}" class="fin-chart" preserveAspectRatio="none"><line x1="0" x2="${w}" y1="${zero}" y2="${zero}" stroke="rgba(255,255,255,.2)" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="#00ff87" stroke-width="2.5" stroke-linejoin="round"/></svg>` }));
        ch.appendChild(el('div.muted.small-note', { text: `от ${G.FIN.fmtM(h[0])} до ${G.FIN.fmtM(h[h.length - 1])}` }));
      } else ch.appendChild(el('div.muted', { text: 'График появится после первых туров.' }));
      side.appendChild(ch);
      if (own && st.board) {
        const bc = el('div.card', null, [el('h3', { text: 'Совет директоров' }), this.boardMeter(),
          el('p.muted.small-note', { text: 'Доверие растёт, если команда идёт выше цели, и падает при провалах, отрицательном балансе и превышении бюджета зарплат. В конце сезона совет подводит итоги.' })]);
        side.appendChild(bc);
      }
      grid.appendChild(side);
      wrap.appendChild(grid);
      // контракты
      const cc = el('div.card.wide-card', null, [el('div.round-h', null, [el('h3', { text: 'Контракты' }), own ? el('button.btn.small', { text: '✍ Продлить всех истекающих на их условиях', onclick: () => this.renewAll(club) }) : null])]);
      const tbl = el('table.squad');
      tbl.appendChild(el('thead', null, [el('tr', null, ['Поз', 'Игрок', 'Воз', 'Рейт', 'Форма', 'Настр.', 'Стоимость', 'Зарплата', 'Контракт', ''].map(t => el('th', { text: t })))]));
      const tb = el('tbody');
      club.players.slice().sort((a, b) => a.contract - b.contract || b.wage - a.wage).forEach(p => {
        const tr = el('tr', { onclick: () => UI.playerModal(p, club) }, [
          el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]), el('td.pname', null, [p.name + (p.star ? ' ★ ' : ' '), UI.traitIcons(p)]), el('td', { text: p.age }),
          el('td', null, [el('b', { text: TAC.overall(p).toFixed(1), style: { color: U.attrColor(TAC.overall(p)) } })]), el('td', null, [UI.formBadge(p)]), el('td', { text: G.FIN.moodLabel(p.mood == null ? 60 : p.mood)[1], title: G.FIN.moodLabel(p.mood == null ? 60 : p.mood)[0] }),
          el('td', { text: G.FIN.fmtM(G.FIN.value(p)) }), el('td', { text: G.FIN.fmtW(p.wage) }),
          el('td' + (p.contract <= 1 ? '.ctr-warn' : ''), { text: p.contract <= 1 ? 'истекает летом' : `${p.contract} ${U.plural(p.contract, 'сезон', 'сезона', 'сезонов')}` }),
          el('td.tr-btns', null, [own && p.contract <= 2 && !p.loan ? el('button.btn.small', { text: 'Продлить', onclick: (e) => { e.stopPropagation(); this.renewModal(p, club); } }) : null,
            own && !p.loan ? el('button.btn.small.ghost', { text: 'Отчислить', title: 'Расторгнуть контракт', onclick: (e) => { e.stopPropagation(); this.releaseModal(p); } }) : null])
        ]);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      cc.appendChild(el('div.table-scroll', null, [tbl]));
      if (own) cc.appendChild(el('div.muted.small-note', { text: 'Игроки с истёкшим контрактом летом уходят бесплатно. Пока трансферный рынок закрыт, их место займут выпускники академии.' }));
      wrap.appendChild(cc);
      body.appendChild(wrap);
    },

    renewModal(p, club) {
      const st = this.st;
      const d = G.FIN.demand(st, p, club);
      if (d.refuse) {
        UI.modal({ title: 'Переговоры о контракте', content: el('div.renew', null, [el('div.pc-name', { text: p.name }), el('p', { text: d.refuse }), el('div.agent', null, G.FIN.agentNotes(p, club).map(t => el('div', { text: '💬 ' + t })))]), buttons: [{ text: 'Понятно', cls: 'ghost' }] });
        return;
      }
      if (d.tries <= 0) { UI.toast(`${p.name} не хочет обсуждать контракт до конца сезона`, 'warn'); return; }
      const state = { wage: d.wage, years: Math.round((d.years[0] + d.years[1]) / 2) };
      const content = el('div.renew');
      const info = el('div.renew-info');
      const redraw = () => {
        const newBill = G.FIN.wageBill(club) - p.wage + state.wage;
        const yearsOk = state.years >= d.years[0] && state.years <= d.years[1];
        info.innerHTML = '';
        info.append(
          el('div', null, [el('small', { text: 'Сейчас' }), el('b', { text: `${G.FIN.fmtW(p.wage)}, ещё ${p.contract} сез.` })]),
          el('div', null, [el('small', { text: 'Требование игрока' }), el('b', { text: `${G.FIN.fmtW(d.wage)}, ${d.years[0]}–${d.years[1]} ${U.plural(d.years[1], 'год', 'года', 'лет')}` })]),
          el('div' + (newBill > club.fin.wageBudget ? '.neg' : ''), null, [el('small', { text: 'Ведомость после подписания' }), el('b', { text: `${newBill} / ${club.fin.wageBudget} тыс./нед` })]),
          el('div', null, [el('small', { text: 'Попыток осталось' }), el('b', { text: d.tries })])
        );
        wageVal.textContent = G.FIN.fmtW(state.wage) + (state.wage < d.wage ? ' — ниже требования' : '');
        hint.textContent = !yearsOk ? `Срок ${state.years} ${U.plural(state.years, 'год', 'года', 'лет')} игроку не по душе — без надбавки ~8% не согласится.` : '';
      };
      const wageVal = el('b');
      const slider = el('input', { type: 'range', min: Math.round(d.wage * 0.75), max: Math.round(d.wage * 1.4), value: d.wage, step: 1, oninput: (e) => { state.wage = +e.target.value; redraw(); } });
      const yrs = el('div.seg');
      [1, 2, 3, 4, 5].forEach(y => yrs.appendChild(el('button' + (y === state.years ? '.on' : ''), { text: y + ' ' + U.plural(y, 'год', 'года', 'лет'), onclick: (e) => { state.years = y; U.$$('button', yrs).forEach(b => b.classList.remove('on')); e.target.classList.add('on'); redraw(); } })));
      const hint = el('div.renew-hint');
      content.append(el('div.pc-head', null, [el('div', null, [el('div.pc-name', { text: p.name }), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · стоимость ${G.FIN.fmtM(G.FIN.value(p))}` })])]),
        el('div.agent', null, G.FIN.agentNotes(p, club).map(t => el('div', { text: '💬 ' + t }))),
        info, el('div.renew-row', null, [el('span', { text: 'Зарплата' }), slider, wageVal]), el('div.renew-row', null, [el('span', { text: 'Срок' }), yrs]), hint);
      redraw();
      UI.modal({ title: 'Переговоры о контракте', content, buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Предложить', cls: 'primary', value: true }] }).result.then(v => {
        if (!v) return;
        const r = G.FIN.renew(st, club, p, state.wage, state.years);
        UI.toast(r.msg, r.ok ? '' : 'warn');
        if (r.ok) st.news.push({ r: st.round, text: '✍ ' + r.msg });
        LEAGUE.save(st);
        this.hub(this.tab);
      });
    },

    releaseModal(p) {
      const st = this.st, cost = G.CAR.releaseCost(p);
      UI.modal({ title: 'Расторгнуть контракт?', content: el('p', { text: `${p.name} станет свободным агентом. Компенсация — 50% оставшегося контракта: ${G.FIN.fmtM(cost)}.` }), buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Отчислить', cls: 'primary', value: true }] }).result.then(v => {
        if (!v) return;
        const r = G.CAR.userRelease(st, p.id);
        UI.toast(r.msg, r.ok ? '' : 'warn'); LEAGUE.save(st); this.hub(this.tab);
      });
    },

    renewAll(club) {
      const st = this.st;
      const list = club.players.filter(p => p.contract <= 1);
      if (!list.length) { UI.toast('Нет истекающих контрактов'); return; }
      const ok = [], fail = [];
      list.sort((a, b) => TAC.overall(b) - TAC.overall(a)).forEach(p => {
        const d = G.FIN.demand(st, p, club);
        if (d.refuse) { fail.push(p.name + ' (отказывается продлевать)'); return; }
        if (d.tries <= 0) { fail.push(p.name + ' (отказ от переговоров)'); return; }
        const r = G.FIN.renew(st, club, p, d.wage, Math.round((d.years[0] + d.years[1]) / 2));
        (r.ok ? ok : fail).push(r.ok ? p.name : p.name + (r.msg.includes('бюджет') ? ' (нет бюджета)' : ''));
      });
      const content = el('div', null, [ok.length ? el('p', { text: '✅ Продлены: ' + ok.join(', ') }) : null, fail.length ? el('p', { text: '❌ Не продлены: ' + fail.join(', ') }) : null]);
      if (ok.length) st.news.push({ r: st.round, text: `✍ Продлены контракты: ${ok.join(', ')}.` });
      LEAGUE.save(st);
      UI.modal({ title: 'Продление контрактов', content, buttons: [{ text: 'OK', cls: 'primary' }] }).result.then(() => this.hub('finance'));
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
      const cols = [['pos', 'Поз'], ['name', 'Игрок'], ['age', 'Воз']].concat(G.DATA.ATTRS.map(a => [a.k, a.n.slice(0, 3)])).concat([['ref', 'Реф'], ['ovr', 'Рейт'], ['form', 'Форма'], ['fit', 'Свеж'], ['apps', 'И'], ['goals', 'Г'], ['rat', 'Оц'], ['val', 'Стоим.'], ['wage', 'З/п'], ['ctr', 'Контр.']]);
      let sortK = 'pos', dir = 1;
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      const get = (p, k) => k === 'pos' ? order[p.pos] * 100 - TAC.overall(p) : k === 'name' ? p.name : k === 'age' ? p.age : k === 'ovr' ? TAC.overall(p) : k === 'fit' ? p.fit : k === 'form' ? TAC.formBonus(p) : k === 'apps' ? p.st.apps : k === 'goals' ? p.st.goals : k === 'rat' ? (p.st.apps ? p.st.rsum / p.st.apps : 0) : k === 'val' ? G.FIN.value(p) : k === 'wage' ? p.wage : k === 'ctr' ? p.contract : p.a[k];
      const tblWrap = el('div.table-scroll');
      const render = () => {
        const tbl = el('table.squad');
        tbl.appendChild(el('thead', null, [el('tr', null, cols.map(([k, n]) => el('th' + (k === sortK ? '.on' : ''), { text: n, title: (G.DATA.ATTRS.find(a => a.k === k) || {}).d || '', onclick: () => { if (sortK === k) dir = -dir; else { sortK = k; dir = (k === 'pos' || k === 'name') ? 1 : -1; } render(); } })))]));
        const tb = el('tbody');
        club.players.slice().sort((a, b) => { const x = get(a, sortK), y = get(b, sortK); return (x > y ? 1 : x < y ? -1 : 0) * dir; }).forEach(p => {
          const tr = el('tr' + (TAC.available(p) ? '' : '.unavail'), { onclick: () => UI.playerModal(p, club) });
          tr.appendChild(el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]));
          tr.appendChild(el('td.pname', null, [p.name + (p.star ? ' ★' : '') + (p.inj > 0 ? ' ✚' : '') + (p.susp > 0 ? ' 🟥' : '') + (p.loan ? ' 🤝' : '') + (p.academy === club.id ? ' 🎓' : '') + (p.retiring ? ' 👴' : '') + ' ', UI.traitIcons(p)]));
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
          tr.appendChild(el('td', { text: '£' + G.FIN.value(p).toFixed(1) + 'м' }));
          tr.appendChild(el('td', { text: '£' + p.wage + 'к' }));
          tr.appendChild(el('td' + (p.contract <= 1 ? '.ctr-warn' : ''), { text: p.contract }));
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
        el('h4', { text: 'Финансы и контракты' }),
        el('p', { text: 'Клуб получает телеправа и спонсорские деньги каждый тур, выручку от билетов — за домашние матчи, призовые — в конце сезона (зависят от места, 1–6 места дают еврокубковые премии). Расходы — зарплаты и операционные траты. Стоимость игрока зависит от рейтинга, возраста, формы, оценок, особенностей и срока контракта. Продлевайте контракты в разделе «Финансы»: игрок называет требования, а совет директоров не даст выйти за бюджет зарплат. Непродлённые игроки летом уходят бесплатно. Совет следит за местом относительно цели и за финансами.' }),
        el('p', { text: 'У каждого игрока есть скрытый характер — амбиции, преданность, профессионализм и темперамент. Цифр не видно, но их выдают реплики агента в переговорах и мнение тренерского штаба в карточке. Амбициозные просят больше и упорнее торгуются, а если переросли клуб — хотят уйти; преданные идут на уступки; профессионалы лучше прогрессируют и быстрее восстанавливаются; вспыльчивые жалуются в прессе на скамейку. Настроение игрока зависит от игрового времени и результатов и влияет на переговоры.' }),
        el('h4', { text: 'Трансферы' }),
        el('p', { text: 'Летнее окно открыто перед сезоном и до 3-го тура, зимнее — с 19-го по 21-й тур. Покупка идёт в два шага: сначала договоритесь с клубом о сумме (он может принять, назвать свою цену или отказать; ключевые игроки топ-клубов не продаются), затем — с игроком о зарплате и сроке: амбициозные просят больше и не хотят в клуб скромнее, преданные не хотят уходить из своего. Трансферный бюджет выделяет совет директоров, 70% от продаж возвращается в него. Выставляйте игроков на трансфер — клубы будут присылать предложения; недовольные игроки сами просят о трансфере. Клубы-ИИ торгуют и между собой: закрывают слабые позиции и ищут игроков под идею тренера.' }),
        el('p', { text: 'Аренды: отдайте молодого или лишнего игрока в другой клуб (вкладка «Продажа» → «В аренду»), задав гарантии игрового времени, долю зарплаты и опцию выкупа; или арендуйте игрока сами (кнопка «Аренда» в поиске). Практика в аренде ускоряет развитие в межсезонье. Не выполните обещание игрового времени — зимой клуб-владелец отзовёт игрока. В конце сезона арендованные возвращаются домой.' }),
        el('h4', { text: 'Академия, ветераны, свободные агенты, увольнение' }),
        el('p', { text: 'Каждое лето академия выпускает 2–3 молодых игроков 🎓; их скрытый потенциал (штаб оценивает его звёздами) определяет, как быстро они будут расти. Ветераны 33+ ближе к концу сезона объявляют о завершении карьеры 👴. Игроки без продлённого контракта и отчисленные становятся свободными агентами — их можно подписать в любое время без платы за трансфер. Клубы-ИИ увольняют неудачливых тренеров; вас уволят, если доверие совета упадёт слишком низко (ниже 12% по ходу сезона или ниже 20% по его итогам) — тогда можно принять предложение другого клуба.' }),
        el('h4', { text: 'Особенности игроков' }),
        el('p', null, [`У игроков есть особенности (всего ${Object.keys(G.TRAITS.LIST).length}): «Спорит с судьями», «Бьёт при первой возможности», «Передерживает мяч», «Решает в концовке», «Хрупкий» и другие. Они срабатывают, пока игрок на поле, и меняют силу блоков, удары, фолы, карточки, усталость и травмы. Значки видны в составе и на схеме — наведите на значок, чтобы прочитать эффект. `, el('button.btn.ghost.small', { text: 'Все особенности', onclick: () => UI.traitsGuide() })]),
        el('p', { text: 'Тренеры-ИИ выбирают схему и план исходя из своих предпочтений, состава и силы соперника, а по ходу матча реагируют на счёт, усталость и удаления. В перерыве, на 60-й и 75-й минутах тренер разбирает игру: если команду душат прессингом, техничный состав переходит на «Владение», а слабый технически — на «Прямой футбол»; против низкого блока идёт через фланги или бьёт издали, против высокой линии — на рывки за спину; опускает линию против быстрых нападающих, снижает прессинг при усталости и карточках, добавляет полузащитника, если проигрывает центр.'})
      ]);
      UI.modal({ title: first ? 'Добро пожаловать в «Комбинацию»!' : 'Как играть', content, wide: true, buttons: [{ text: first ? 'Поехали!' : 'Понятно', cls: 'primary' }] });
    }
  };

  G.App = App;
})(typeof window !== 'undefined' ? window : globalThis);
