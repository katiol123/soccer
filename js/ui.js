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
      // клик по имени игрока — его карточка (клуб или свободный агент)
      document.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('[data-player]');
        if (!t || !this.st) return;
        const id = t.dataset.player, st = this.st;
        let club = null, p = null;
        for (const c of st.clubs) { p = c.players.find(x => x.id === id); if (p) { club = c; break; } }
        if (!p) { p = (st.fa || []).find(x => x.id === id); club = p ? { id: '_fa', name: 'Свободный агент', c1: '#444', c2: '#888', short: 'FA' } : null; }
        if (!p) return;
        e.preventDefault(); e.stopPropagation();
        UI.playerModal(p, club);
      }, true);
      // клик по названию клуба — его состав (вкладка «Состав и тактика» / «Клубы»)
      document.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('[data-club]');
        if (!t || !this.st || LEAGUE.seasonOver(this.st) || !document.querySelector('.screen.hub')) return;
        const c = LEAGUE.club(this.st, t.dataset.club);
        if (!c) return;
        e.preventDefault(); e.stopPropagation();
        document.querySelectorAll('#modal-root .modal-x').forEach(b => b.click());
        this.squadClub = c.id; this._pickLg = c.league;
        this.hub('squad');
        window.scrollTo(0, 0);
      }, true);
      this.menu();
    },

    show(node, quiet) {
      const app = document.getElementById('app');
      const old = app.firstElementChild;
      // тихая перерисовка того же экрана — без анимации и прокрутки
      if (quiet && old) { const y = window.scrollY; old.replaceWith(node); window.scrollTo(0, y); return; }
      node.classList.add('enter');
      if (old) {
        old.classList.add('leave');
        setTimeout(() => old.remove(), 260);
      }
      app.appendChild(node);
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('enter')));
      window.scrollTo(0, 0);
    },

    storeInfo() {
      const m = G.STORE ? G.STORE.meta : null;
      if (!m || !m.raw) return 'Сохранение: ' + (m ? m.backend : 'localStorage');
      return `Сохранение: ${m.backend}${G.STORE.hasGzip ? ', сжатие gzip' : ''} · ${(m.stored / 1024).toFixed(0)} КБ (без сжатия ${(m.raw / 1024).toFixed(0)} КБ)`;
    },

    importSave() {
      const inp = el('input', { type: 'file', accept: '.gz,.json,application/gzip,application/json', style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) return;
        try {
          if (!(await this.confirmOverwrite())) return;
          this.st = await LEAGUE.importSave(f);
          this.tab = 'home';
          this.hub();
          UI.toast('Сохранение загружено из файла');
        } catch (e) { UI.toast('Не удалось загрузить: ' + e.message, 'warn'); }
      });
      document.body.appendChild(inp);
      inp.click();
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
      const contSlot = el('div.cont-slot');
      const card = el('div.menu-card', null, [
        el('div.logo', null, [
          el('div.logo-gems', null, [0, 1, 2].map(t => { const g = el('span.lg-ico.t' + [0, 3, 5][t]); g.innerHTML = GFX.GEM_ICONS[[0, 3, 5][t]]; return g; })),
          el('h1', { text: 'КОМБИНАЦИЯ' }),
          el('div.logo-sub', { text: 'Футбольный менеджер · Три в ряд · Премьер-лига' })
        ]),
        el('div.menu-btns', null, [
          contSlot,
          el('button.btn.big.new-career', { onclick: () => this.teamSelect() }, [el('span', { text: '⚽ Новая карьера' }), el('small', { text: 'Выберите клуб и приведите его к титулу' })]),
          el('button.btn.big', { onclick: () => this.spectatorSetup() }, [el('span', { text: '👁 Режим зрителя' }), el('small', { text: 'Наблюдайте за битвой тренеров-ИИ' })]),
          el('div.menu-row', null, [
            el('button.btn.ghost', { text: '📖 Как играть', onclick: () => this.howTo() }),
            el('button.btn.ghost', { text: '📂 Загрузить из файла', onclick: () => this.importSave() })
          ])
        ])
      ]);
      // сохранение загружается асинхронно (IndexedDB)
      LEAGUE.load().then(saved => {
        if (!saved) { U.$('.new-career', card).classList.add('primary'); return; }
        contSlot.appendChild(el('button.btn.primary.big', { onclick: () => { this.st = saved; this.tab = 'home'; this.hub(); } }, [el('span', { text: '▶ Продолжить' }), el('small', { text: (saved.userClub ? LEAGUE.club(saved, saved.userClub).name : 'Режим зрителя') + ` · ${LEAGUE.leagueInfo(saved).name} · сезон ${saved.seasonName} · ${LEAGUE.seasonOver(saved) ? 'итоги сезона' : LEAGUE.weekLabel(saved).toLowerCase()}` })]));
      });
      root.appendChild(card);
      root.appendChild(el('div.menu-foot', { text: 'Премьер-лига, Чемпионшип и Первая лига 2025/26 · игроки и тренеры вымышлены' }));
      this.show(root);
    },

    async confirmOverwrite() {
      if (!(await LEAGUE.hasSave())) return true;
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
      // предварительные финансы мира, чтобы показать бюджет зарплат до старта
      const pre = { clubs: world, season: 1, leagues: {} };
      G.DATA.LEAGUE_ORDER.forEach(id => { pre.leagues[id] = { id, fixtures: [] }; });
      G.FIN.init(pre);
      const opts = { turns: 24 };
      const root = el('div.screen.select');
      root.appendChild(el('div.sel-head', null, [
        el('button.icon-btn', { text: '←', onclick: () => this.menu() }),
        el('div', null, [el('h2', { text: 'Выберите клуб' }), el('p', { text: 'Каждый клуб возглавляет тренер со своей философией. Вы замените его у руля.' })]),
        this.lengthPicker(opts)
      ]));
      const grid = el('div.club-grid');
      const detail = el('div.club-detail');
      let lid = G.DATA.LEAGUE_ORDER[0], ratings = [];
      const GOALS = {
        1: ['Чемпионство', 'Чемпионство', 'Лига чемпионов', 'Лига чемпионов', 'Еврокубки', 'Еврокубки', 'Еврокубки'],
        2: ['Прямое повышение', 'Прямое повышение', 'Плей-офф за повышение', 'Плей-офф за повышение', 'Плей-офф за повышение', 'Плей-офф за повышение']
      };
      const goal = (c) => { const i = ratings.findIndex(x => x.c === c), L = G.DATA.LEAGUES[c.league]; return (GOALS[L.tier] || GOALS[2])[i] || (i < ratings.length * 0.7 ? 'Середина таблицы' : L.relegate ? 'Сохранить прописку' : 'Укрепиться в лиге'); };
      const pick = (c, r) => {
        U.$$('.club-card', grid).forEach(x => x.classList.toggle('on', x.dataset.id === c.id));
        detail.innerHTML = '';
        detail.style.setProperty('--c1', c.c1); detail.style.setProperty('--c2', c.c2);
        const top = c.players.slice().sort((a, b) => TAC.overall(b) - TAC.overall(a)).slice(0, 5);
        const expect = goal(c);
        detail.append(
          el('div.cd-top', null, [UI.crest(c, 88), el('div', null, [el('h3', { text: c.name }), el('div.cd-sub', { text: `${G.DATA.LEAGUES[c.league].name} · ${c.stadium} · ${c.city}` }), UI.stars(r), el('div.cd-exp', { text: 'Цель: ' + expect + (G.FIN.cupTarget(c) != null ? ` · Кубок: ${G.FIN.cupStageName({}, G.FIN.cupTarget(c))}` : '') })])]),
          el('div.cd-fin', null, [
            el('div', null, [el('small', { text: 'Бюджет зарплат' }), el('b', { text: c.fin ? G.FIN.fmtW(c.fin.wageBudget) : '—' })]),
            el('div', null, [el('small', { text: 'Стоимость состава' }), el('b', { text: G.FIN.fmtM(G.FIN.squadValue(c)) })]),
            el('div', null, [el('small', { text: 'Стадион' }), el('b', { text: Math.round((c.cap || G.FIN.CAPACITY[c.id] || 30) * 1000).toLocaleString('ru') + ' мест' })]),
            c.own ? el('div', { title: G.FIN.ownerLabel(c)[1] }, [el('small', { text: 'Владелец' }), el('b', { text: G.FIN.ownerLabel(c)[0] })]) : null,
            el('div', null, [el('small', { text: 'Престиж' }), el('b', { text: `${Math.round(G.FIN.pres(c))} · ${G.FIN.presLabel(G.FIN.pres(c))}` })])
          ]),
          el('div.cd-coach', null, [el('small', { text: 'Нынешний тренер (уступит вам место)' }), el('b', { text: `${c.coach.name} (${c.coach.nat})` }), el('p', { text: c.coach.motto }),
            el('div.cd-tags', null, [el('span', { text: c.coach.formations.join(' / ') }), el('span', { text: TAC.PLANS[c.coach.plan].icon + ' ' + TAC.PLANS[c.coach.plan].n })])]),
          el('div.cd-players', null, [el('small', { text: 'Лидеры состава' })].concat(top.map(p => el('div.cd-p', { onclick: () => UI.playerModal(p, c), title: 'Карточка игрока' }, [el('span.bp-pos', { text: UI.posShort(p.pos) }), el('span', null, [p.name + (p.star ? ' ★ ' : ' '), UI.traitIcons(p)]), el('b', { text: TAC.overall(p).toFixed(1), style: { color: U.attrColor(TAC.overall(p)) } })])))),
          el('button.btn.primary.big', { onclick: async () => { if (!(await this.confirmOverwrite())) return; this.startGame('manager', c.id, world, opts.turns); } }, [el('span', { text: `Возглавить «${c.name}»` })])
        );
      };
      const tabs = el('div.seg.lg-seg');
      const fill = () => {
        ratings = world.filter(c => c.league === lid).map(c => ({ c, r: TAC.teamRating(c) })).sort((a, b) => b.r - a.r);
        grid.innerHTML = '';
        ratings.forEach(({ c, r }) => {
          const card = el('button.club-card', { 'data-id': c.id, onclick: () => pick(c, r) }, [UI.crest(c, 52), el('div.cc-t', null, [el('b', { text: c.name }), el('small', { text: c.coach.name })]), UI.stars(r)]);
          card.style.setProperty('--c1', c.c1);
          grid.appendChild(card);
        });
        U.$$('button', tabs).forEach(b => b.classList.toggle('on', b.dataset.lg === lid));
        pick(ratings[0].c, ratings[0].r);
      };
      G.DATA.LEAGUE_ORDER.forEach(id => tabs.appendChild(el('button', { 'data-lg': id, text: `${G.DATA.LEAGUES[id].name} (${world.filter(c => c.league === id).length})`, onclick: () => { lid = id; fill(); } })));
      root.appendChild(el('div.sel-tabs', null, [tabs]));
      root.appendChild(el('div.sel-body', null, [grid, detail]));
      this.show(root);
      fill();
    },

    spectatorSetup() {
      const opts = { turns: 24, league: G.DATA.LEAGUE_ORDER[0] };
      const seg = el('div.seg');
      G.DATA.LEAGUE_ORDER.forEach(id => seg.appendChild(el('button' + (id === opts.league ? '.on' : ''), { text: G.DATA.LEAGUES[id].name, onclick: (e) => { opts.league = id; U.$$('button', seg).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      const content = el('div', null, [el('p', { text: 'Все 68 клубов Премьер-лиги, Чемпионшипа и Первой лиги управляются тренерами-ИИ со своими предпочтениями. Вы можете смотреть любой матч недели в реальном времени или симулировать неделю целиком. Сезон идёт во всех лигах одновременно: в конце — вылет, повышение и плей-офф.' }), el('div.len-pick', null, [el('span', { text: 'Следить за лигой:' }), seg]), this.lengthPicker(opts)]);
      UI.modal({ title: 'Режим зрителя', content, buttons: [{ text: 'Отмена', cls: 'ghost', value: false }, { text: 'Начать сезон', cls: 'primary', value: true }] }).result.then(async v => {
        if (!v) return;
        if (!(await this.confirmOverwrite())) return;
        this.startGame('spectator', null, null, opts.turns, opts.league);
      });
    },

    startGame(mode, clubId, world, turns, league) {
      // используем тот же мир, что был показан при выборе клуба
      const st = LEAGUE.newGame({ mode, clubId, turns, world, league });
      this.st = st;
      this._vlg = null;
      LEAGUE.save(st);
      this.tab = 'home';
      this.hub();
      if (mode === 'manager') setTimeout(() => this.howTo(true), 400);
    },

    /* ---------- Хаб ---------- */
    hub(tab) {
      if (tab) this.tab = tab;
      TAC.cupMode = false;
      const st = this.st;
      if (LEAGUE.seasonOver(st)) return this.seasonEnd();
      const root = el('div.screen.hub');
      if (st.sacked && st.userClub) setTimeout(() => this.sackModal(), 300);
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      if (uc) { root.style.setProperty('--c1', uc.c1); root.style.setProperty('--c2', uc.c2); }
      const nav = el('nav.hub-nav');
      const tabs = [['home', 'Главная'], ['squad', uc ? 'Состав и тактика' : 'Клубы'], ['table', 'Таблица'], ['fixtures', 'Календарь'], ['stats', 'Статистика'], ['finance', 'Финансы'], ['transfers', 'Трансферы'], ['cup', 'Кубок'], ['charts', 'Графики']];
      tabs.forEach(([k, n]) => nav.appendChild(el('button' + (this.tab === k ? '.on' : ''), { text: n, onclick: () => this.hub(k) })));
      const top = el('header.topbar', null, [
        el('div.tb-brand', { onclick: () => this.gameMenu() }, [el('span.tb-logo', { text: 'К' }), el('span', { text: 'КОМБИНАЦИЯ' })]),
        el('div.tb-club', null, uc ? [UI.crest(uc, 30), el('div', null, [el('b', null, [UI.cname(uc)]), el('small', { text: `${LEAGUE.leagueInfo(st).short} · ${st.seasonName} · ${LEAGUE.weekLabel(st)}` })])] : [el('span.tb-eye', { text: '👁' }), el('div', null, [el('b', { text: 'Режим зрителя' }), el('small', { text: `Сезон ${st.seasonName} · неделя ${st.round + 1}/${LEAGUE.weeks(st)}` })])]),
        nav,
        el('button.icon-btn', { text: '☰', title: 'Меню', onclick: () => this.gameMenu() })
      ]);
      root.appendChild(top);
      const body = el('div.hub-body');
      root.appendChild(body);
      ({ home: () => this.tabHome(body), squad: () => this.tabSquad(body), table: () => this.tabTable(body), fixtures: () => this.tabFixtures(body), stats: () => this.tabStats(body), finance: () => this.tabFinance(body), transfers: () => this.tabTransfers(body), cup: () => this.tabCup(body), charts: () => this.tabCharts(body) })[this.tab]();
      this.show(root);
    },

    gameMenu() {
      const content = el('div.gm', null, [
        el('button.btn', { text: '📖 Как играть', onclick: () => { md.close(); this.howTo(); } }),
        el('button.btn', { text: '✦ Особенности игроков', onclick: () => { md.close(); UI.traitsGuide(); } }),
        el('button.btn', { text: SFX.on ? '🔊 Звук: вкл' : '🔇 Звук: выкл', onclick: (e) => { SFX.on = !SFX.on; this.soundPref(SFX.on); e.target.textContent = SFX.on ? '🔊 Звук: вкл' : '🔇 Звук: выкл'; } }),
        el('div.len-wrap', null, [this.lengthPicker(this.st.settings)]),
        el('button.btn', { text: '💾 Сохранить', onclick: () => { LEAGUE.save(this.st); UI.toast('Игра сохранена'); } }),
        el('div.gm-row', null, [
          el('button.btn.ghost', { text: '⬇ Экспорт в файл', onclick: () => LEAGUE.exportSave(this.st).then(() => UI.toast('Файл сохранения скачан')) }),
          el('button.btn.ghost', { text: '📂 Загрузить из файла', onclick: () => { md.close(); this.importSave(); } })
        ]),
        el('div.muted.small-note.store-info', { text: this.storeInfo() }),
        el('button.btn.ghost', { text: '⏏ Выйти в главное меню', onclick: () => { LEAGUE.save(this.st); md.close(); this.menu(); } })
      ]);
      const md = UI.modal({ title: 'Меню', content, onClose: () => LEAGUE.save(this.st) });
    },

    /* Решение тренера соперника кэшируется на тур, чтобы скаут-отчёт совпадал с матчем */
    oppPlan(f, opp, uc, home) {
      const key = this.st.season + ':' + this.st.round + ':' + opp.id + (f.cup ? ':cup' : '');
      if (!this._pred || this._pred.key !== key) this._pred = { key, tac: AI.prepare(opp, uc, home, LEAGUE.prepOpts(this.st, f, opp)) };
      return this._pred.tac;
    },

    roundFixtures(lid) { const st = this.st; return st.leagues[lid || st.lg].fixtures[st.round] || []; },
    /* Матч пользователя на этой неделе: сначала кубок (середина недели), потом лига */
    userFixture() {
      const st = this.st, u = st.userClub;
      if (!u) return null;
      const ct = (G.CUP ? G.CUP.weekTies(st) : []).find(f => f.h === u || f.a === u);
      if (ct && !ct.res) return ct;
      return this.roundFixtures().find(f => f.h === u || f.a === u) || ct || null;
    },
    /* Тактика пользователя на матч: в кубке — отдельная копия (можно выставить резерв, не трогая основу) */
    userTac(f) {
      const st = this.st;
      if (!f || !f.cup) return st.userTactics;
      const key = st.season + ':' + st.round;
      if (!st.cupTac || st.cupTac.key !== key) st.cupTac = { key, tac: JSON.parse(JSON.stringify(st.userTactics)) };
      // в кубке действуют кубковые дисквалификации
      const prev = TAC.cupMode; TAC.cupMode = true;
      LEAGUE.fixUserTactics(st, st.cupTac.tac);
      TAC.cupMode = prev;
      return st.cupTac.tac;
    },
    /* Лига, которую просматривает пользователь (таблица, календарь, статистика, матчи недели) */
    vlg() { const st = this.st; return this._vlg && st.leagues[this._vlg] ? this._vlg : st.lg; },
    leagueSeg(cur, onPick) {
      const st = this.st, ids = LEAGUE.leagueIds(st);
      if (ids.length < 2) return null;
      const seg = el('div.seg.lg-seg');
      ids.forEach(lid => seg.appendChild(el('button' + (lid === cur ? '.on' : ''), { text: LEAGUE.leagueInfo(st, lid).name, onclick: () => { this._vlg = lid; if (onPick) onPick(lid); else this.hub(); } })));
      return seg;
    },

    tabHome(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const grid = el('div.home-grid');
      const main = el('div.home-main');
      const side = el('div.home-side');
      const uf = this.userFixture();
      if (uc && uf && !uf.res) main.appendChild(this.nextMatchCard(uf));
      else if (uc && uf && uf.res) main.appendChild(el('div.card.notice', null, [el('b', { text: 'Ваш матч недели сыгран.' }), el('span', { text: ' Досмотрите другие игры или переходите дальше — несыгранные матчи досимулируются.' })]));
      else if (uc && !uf) {
        const left = LEAGUE.clubMatches(st, uc.id, st.round, LEAGUE.weeks(st));
        main.appendChild(el('div.card.notice', null, [el('b', { text: left ? 'На этой неделе у вас нет матча.' : 'Ваш сезон завершён.' }), el('span', { text: left ? ` Пауза в календаре лиги — команда отдыхает, игровое время и доверие совета не меняются.` : ' Идут последние матчи других турниров (плей-офф). Следите за ними или переходите дальше.' })]));
      }
      main.appendChild(this.roundCard());
      // мини-таблица
      side.appendChild(this.miniTable());
      if (uc && uc.fin) side.appendChild(this.transferMini(uc));
      if (uc && uc.fin) side.appendChild(this.financeMini(uc));
      if (uc) {
        const last = [];
        (st.leagues[uc.league] || st.leagues[st.lg]).fixtures.slice(0, st.round + 1).forEach(rd => rd.forEach(f => { if (f.res && (f.h === uc.id || f.a === uc.id)) last.push(f); }));
        if (last.length) {
          const box = el('div.card', null, [el('h3', { text: 'Последние матчи' })]);
          last.slice(-5).reverse().forEach(f => box.appendChild(this.resultRow(f, uc.id)));
          side.appendChild(box);
        }
        const news = el('div.card', null, [el('h3', { text: 'Новости' })]);
        st.news.slice(-6).reverse().forEach(n => news.appendChild(el('div.news', { text: n.text })));
        side.appendChild(news);
      } else {
        const sc = LEAGUE.topScorers(st, 5, this.vlg());
        if (sc.length) {
          const box = el('div.card', null, [el('h3', { text: 'Бомбардиры' })]);
          sc.forEach((x, i) => box.appendChild(el('div.mini-row', { onclick: () => UI.playerModal(x.p, x.c) }, [el('span.pos', { text: i + 1 }), UI.crest(x.c, 18), el('span.nm', { text: x.p.name }), el('b', { text: x.p.st.goals })])));
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
      const pos = id => { const c = LEAGUE.club(st, id), t = LEAGUE.standings(st, c.league); return (t.findIndex(r => r.id === id) + 1) + (f.cup ? ` (${LEAGUE.leagueInfo(st, c.league).short})` : ''); };
      const card = el('div.card.next-match');
      card.style.setProperty('--h', home.c1); card.style.setProperty('--a', away.c1);
      card.append(
        el('div.nm-label', { text: f.cup ? `🏆 ${G.CUP.NAME} · ${G.CUP.roundName(st, f)} · ${f.neutral ? 'стадион «Уэмбли»' : home.stadium}` : `${LEAGUE.leagueInfo(st).name} · ${LEAGUE.weekLabel(st)} · ${f.po === 'final' ? 'стадион «Уэмбли»' : home.stadium}` }),
        el('div.nm-teams', null, [
          el('div.nm-t', null, [UI.crest(home, 72), el('b', null, [UI.cname(home)]), el('small', { text: `${pos(home.id)} место · ${TAC.teamRating(home).toFixed(1)}` })]),
          el('div.nm-vs', { text: 'VS' }),
          el('div.nm-t', null, [UI.crest(away, 72), el('b', null, [UI.cname(away)]), el('small', { text: `${pos(away.id)} место · ${TAC.teamRating(away).toFixed(1)}` })])
        ]),
        this.envLine(f),
        el('div.nm-scout', null, [
          el('div.nm-scout-h', null, [el('span', { text: '🔎 Скаутский отчёт' }), el('b', { text: `${opp.coach.name}` })]),
          UI.coachTraits(opp.coach, { hideEmpty: true }),
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
      const st = this.st, lid = this.vlg(), rd = this.roundFixtures(lid);
      const card = el('div.card.round');
      const allDone = rd.every(f => f.res);
      card.appendChild(el('div.round-h', null, [el('h3', { text: `Неделя ${st.round + 1} · ${LEAGUE.weekLabel(st, lid)}` }), el('small', { text: !rd.length ? 'В этой лиге матчей нет' : allDone ? 'Все матчи сыграны' : 'Смотрите любой матч ИИ вживую или симулируйте' })]));
      const cupBox = this.cupWeekBox();
      if (cupBox) card.appendChild(cupBox);
      const seg = this.leagueSeg(lid);
      if (seg) card.appendChild(seg);
      const list = el('div.fixtures');
      if (!rd.length) list.appendChild(el('div.muted', { text: 'Пауза в календаре этой лиги.' }));
      const myCup = st.userClub && (G.CUP ? G.CUP.weekTies(st) : []).find(f => !f.res && (f.h === st.userClub || f.a === st.userClub));
      const tbl = LEAGUE.standings(st, lid), place = id => tbl.findIndex(r => r.id === id) + 1;
      rd.forEach(f => {
        const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
        const mine = st.userClub && (f.h === st.userClub || f.a === st.userClub);
        const row = el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''));
        row.append(
          el('div.fx-t.h', null, [el('span', null, [UI.cname(h), el('small.fx-pos', { text: ` (${place(h.id)})` })]), UI.crest(h, 26)]),
          el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}` : '– : –' }),
          el('div.fx-t.a', null, [UI.crest(a, 26), el('span', null, [UI.cname(a), el('small.fx-pos', { text: ` (${place(a.id)})` })])])
        );
        const acts = el('div.fx-act');
        if (!f.res) {
          if (mine && myCup) acts.appendChild(el('button.btn.small', { text: 'После кубка', disabled: true, title: 'Сначала сыграйте кубковый матч середины недели' }));
          else if (mine) acts.appendChild(el('button.btn.small.primary', { text: 'Играть', onclick: () => this.prematch(f) }));
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
      const uf = this.userFixture(), isMine = f => st.userClub && (f.h === st.userClub || f.a === st.userClub);
      const remainingAI = rd.filter(f => !f.res && !isMine(f));
      if (remainingAI.length) foot.appendChild(el('button.btn', { text: `⚡ Симулировать ${remainingAI.length === rd.filter(f => !isMine(f)).length ? 'тур' : 'остальные'} (${remainingAI.length})`, onclick: () => this.simRemaining(lid) }));
      if (!uf || uf.res) {
        const left = LEAGUE.weekFixtures(st).filter(f => !f.res).length;
        foot.appendChild(el('button.btn.primary.big', { text: st.round + 1 >= LEAGUE.weeks(st) ? 'Завершить сезон 🏆' : 'Следующая неделя →', title: left ? `Несыгранные матчи недели во всех лигах (${left}) будут досимулированы` : '', onclick: () => this.nextRound() }));
      } else if (!remainingAI.length) foot.appendChild(el('span.muted', { text: 'Остался только ваш матч.' }));
      card.appendChild(foot);
      return card;
    },

    /* Условия матча: погода, ожидаемая посещаемость и сила поддержки */
    envLine(f) {
      const env = LEAGUE.matchEnv(this.st, f), wx = G.ENGINE.WEATHER[env.weather], hk = Math.round((Math.sqrt(G.ENGINE.homeK(env)) - 1) * 1000) / 10;
      const fans = Math.round(env.fill * env.cap * 1000).toLocaleString('ru');
      return el('div.env-line', null, [
        env.derby ? el('b.derby-tag', { text: '🔥 Дерби', title: 'Матч соперников: больше спроса и страстей, победа и поражение сильнее влияют на болельщиков' }) : null,
        !env.neutral ? el('span', { title: 'Настроение болельщиков хозяев: влияет на спрос и давление трибун', text: `${G.FIN.fansLabel(env.fans == null ? 60 : env.fans)[1]} болельщики ${Math.round(env.fans == null ? 60 : env.fans)}` }) : null,
        el('span', { title: wx.d, text: `${wx.i} ${wx.n}` }),
        el('span', { text: `🏟 ~${fans} зрителей (${Math.round(env.fill * 100)}%)` }),
        !env.neutral && env.tp ? el('span', { title: 'Цена билета хозяев (множитель к базовой цене клуба)', text: `🎟 £${Math.round(G.FIN.ticket(LEAGUE.club(this.st, f.h)) * (f.cup ? 0.85 : 1) * env.tp)} (×${env.tp})` }) : null,
        el('span', { title: 'Полный стадион давит на гостей: хуже хладнокровие, больше нервных фолов и карточек, судья охотнее ставит пенальти в их ворота. Эффект нарастает к аншлагу.', text: env.neutral ? '⚖ нейтральное поле' : `📣 давление трибун: ${G.ENGINE.crowdLabel(G.ENGINE.crowdOf(env))} (${Math.round(G.ENGINE.crowdOf(env) * 100)}) · атака +${hk}%` }),
        env.weather !== 'clear' ? el('small.muted', { text: wx.d }) : null
      ]);
    },

    /* Цена билетов на домашний матч: прогноз заполняемости, выручки и поддержки по каждому варианту */
    priceBox(f, redraw) {
      const st = this.st, env = LEAGUE.matchEnv(st, f), opts = G.FIN.pricing(st, f);
      const box = el('div.price-box', null, [el('div.pb-h', null, [el('b', { text: '🎟 Цена билетов на матч' }), el('small.muted', { text: `важность матча для болельщиков: ${Math.round((env.imp || 0) * 100)}% · ${f.cup ? 'в кубке выручка делится 55/45' : 'дороже — больше денег, но меньше зрителей; полный стадион давит на гостей (разница между ~75% и аншлагом — около 0.15 очка за матч)'}` })])]);
      const row = el('div.pb-row');
      opts.forEach(o => {
        const hk = Math.round((Math.sqrt(o.homeK) - 1) * 1000) / 10;
        row.appendChild(el('button.pb-opt' + (o.m === env.tp ? '.on' : ''), { onclick: () => { G.FIN.setPrice(st, f, o.m); LEAGUE.save(st); redraw(); } }, [
          el('b', { text: `£${o.price}` }), el('small', { text: `×${o.m}` }),
          el('span', { text: `${Math.round(o.fill * 100)}% трибун` }), el('span', { text: `${G.FIN.fmtM(o.rev)}` }), el('span.muted', { text: `📣 ${G.ENGINE.crowdLabel(o.crowd)} (${Math.round(o.crowd * 100)})` }), el('span', { text: G.FIN.priceMood(o.m) ? `болельщики ${G.FIN.priceMood(o.m) > 0 ? '+' : ''}${G.FIN.priceMood(o.m)}` : 'болельщики ±0', style: { color: G.FIN.priceMood(o.m) < 0 ? '#e66767' : G.FIN.priceMood(o.m) > 0 ? '#0ca30c' : '' } })
        ]));
      });
      box.appendChild(row);
      return box;
    },

    /* Кубковые матчи недели на главной: свой матч и самые громкие пары */
    cupWeekBox() {
      const st = this.st, ties = G.CUP ? G.CUP.weekTies(st) : [];
      if (!ties.length) return null;
      const R = G.CUP.roundAt(st, st.round), u = st.userClub;
      const lv = f => G.FIN.level(LEAGUE.club(st, f.h)) + G.FIN.level(LEAGUE.club(st, f.a));
      const show = ties.slice().sort((a, b) => ((b.h === u || b.a === u) - (a.h === u || a.a === u)) || lv(a) - lv(b)).slice(0, 6);
      const box = el('div.cup-box', null, [el('div.cup-h', null, [el('b', { text: `🏆 ${G.CUP.NAME} · ${R.name}` }), el('small.muted', { text: 'середина недели — до матчей лиги' })])]);
      const lg = c => LEAGUE.leagueInfo(st, c.league).short;
      show.forEach(f => {
        const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a), mine = u && (f.h === u || f.a === u);
        const acts = el('div.fx-act');
        if (!f.res) {
          if (mine) acts.appendChild(el('button.btn.small.primary', { text: 'Играть', onclick: () => this.prematch(f) }));
          else acts.append(el('button.btn.small', { text: '👁', title: 'Смотреть', onclick: () => this.watchMatch(f) }), el('button.btn.small.ghost', { text: '⚡', title: 'Быстрая симуляция', onclick: () => { this.simFixture(f); LEAGUE.save(st); this.hub(); } }));
        } else acts.appendChild(el('button.btn.small.ghost', { text: 'Отчёт', onclick: () => this.report(f) }));
        box.appendChild(el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''), null, [
          el('div.fx-t.h', null, [el('span', null, [UI.cname(h), el('small.fx-pos', { text: ` (${lg(h)})` })]), UI.crest(h, 24)]),
          el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}${f.res.pen ? ' п.' : ''}` : '– : –' }),
          el('div.fx-t.a', null, [UI.crest(a, 24), el('span', null, [UI.cname(a), el('small.fx-pos', { text: ` (${lg(a)})` })])]), acts]));
      });
      const left = ties.filter(f => !f.res && !(u && (f.h === u || f.a === u)));
      const foot = el('div.cup-foot');
      if (ties.length > show.length) foot.appendChild(el('button.btn.small.ghost', { text: `Все пары (${ties.length})`, onclick: () => this.hub('cup') }));
      if (left.length) foot.appendChild(el('button.btn.small', { text: `⚡ Сыграть кубок (${left.length})`, onclick: async () => { await this.simList(left, 'Кубок Англии...'); LEAGUE.save(st); this.hub(); } }));
      box.appendChild(foot);
      return box;
    },

    /* Имя игрока по id — ссылкой, если игрок ещё в игре (иначе просто текст) */
    pnameById(id, name) {
      const st = this.st;
      for (const c of st.clubs) { const p = c.players.find(x => x.id === id); if (p) return UI.pname(p); }
      const p = (st.fa || []).find(x => x.id === id);
      return p ? UI.pname(p) : name;
    },

    /* ---------- Графики: динамика клубов по неделям ---------- */
    tabCharts(body) {
      const st = this.st, T = st.trk;
      const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500']; // проверенная палитра для тёмного фона
      const M = {
        bal: { n: 'Баланс', unit: 'млн £', fmt: v => G.FIN.fmtM(v) },
        rank: { n: 'Место', unit: 'место в пирамиде лиг', inv: true },
        pts: { n: 'Очки', unit: 'очки в сезоне', season: true },
        val: { n: 'Стоимость состава', unit: 'млн £', fmt: v => G.FIN.fmtM(v) },
        wage: { n: 'Зарплаты', unit: 'тыс. £ в неделю', fmt: v => `£${Math.round(v)} тыс./нед` },
        pres: { n: 'Престиж', unit: 'престиж 1–99', fmt: v => Math.round(v) },
        fans: { n: 'Болельщики', unit: 'настроение 0–100', fmt: v => Math.round(v) },
        conf: { n: 'Доверие совета', unit: '%, только ваш клуб', fmt: v => Math.round(v) + '%', user: true }
      };
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const C = this.chart = this.chart || { m: 'bal', range: 'season', clubs: [], slot: {} };
      if (!C.clubs.length) { const first = uc || LEAGUE.leagueClubs(st, this.vlg())[0]; C.clubs = [first.id]; C.slot = { [first.id]: 0 }; }
      if (C.m === 'conf' && !uc) C.m = 'bal';
      const wrap = el('div.charts');
      const card = el('div.card.wide-card');
      // показатель и период
      const mseg = el('div.seg.wrap');
      Object.keys(M).filter(k => !M[k].user || uc).forEach(k => mseg.appendChild(el('button' + (C.m === k ? '.on' : ''), { text: M[k].n, onclick: () => { C.m = k; this.hub('charts'); } })));
      const rseg = el('div.seg');
      [['season', 'Этот сезон'], ['all', 'Все сезоны']].forEach(([k, n]) => rseg.appendChild(el('button' + (C.range === k ? '.on' : ''), { text: n, onclick: () => { C.range = k; this.hub('charts'); } })));
      card.appendChild(el('div.ch-controls', null, [mseg, rseg]));
      if (!T || T.t.length < 2) { card.appendChild(el('div.muted', { text: 'График появится после первых недель сезона — история записывается каждую неделю.' })); wrap.appendChild(card); body.appendChild(wrap); return; }
      // выбранные клубы: цвет закреплён за клубом, а не за порядком
      const leg = el('div.ch-legend');
      const sel = C.m === 'conf' ? [uc.id] : C.clubs;
      sel.forEach(id => {
        const c = LEAGUE.club(st, id); if (!c) return;
        const col = COLORS[C.m === 'conf' ? 0 : C.slot[id] || 0];
        leg.appendChild(el('span.ch-chip', null, [el('i', { style: { background: col } }), UI.cname(c), C.m !== 'conf' && C.clubs.length > 1 ? el('button.ch-x', { text: '×', title: 'Убрать', onclick: () => { C.clubs = C.clubs.filter(x => x !== id); delete C.slot[id]; this.hub('charts'); } }) : null]));
      });
      card.appendChild(leg);
      // данные
      const idx = T.t.map((t, i) => i).filter(i => C.range === 'all' || Math.floor(T.t[i] / 100) === st.season);
      const series = sel.map(id => {
        const s = T.c[id] || {};
        const vals = idx.map(i => C.m === 'conf' ? T.conf[i] : (s[C.m] || [])[i]);
        return { id, c: LEAGUE.club(st, id), col: COLORS[C.m === 'conf' ? 0 : C.slot[id] || 0], vals, tier: idx.map(i => (s.tier || [])[i]), pos: idx.map(i => (s.pos || [])[i]) };
      });
      const all = series.flatMap(s => s.vals).filter(v => v != null);
      if (!all.length) { card.appendChild(el('div.muted', { text: 'Для этого показателя пока нет данных.' })); wrap.appendChild(card); body.appendChild(wrap); return; }
      card.appendChild(this.lineChart(st, idx.map(i => T.t[i]), series, M[C.m]));
      // таблица: сейчас / мин / макс / изменение
      const tbl = el('table.league.ch-table');
      tbl.appendChild(el('thead', null, [el('tr', null, ['Клуб', 'Сейчас', 'Мин.', 'Макс.', 'Изменение'].map(h => el('th', { text: h })))]));
      const tb = el('tbody'), f = M[C.m].fmt || (v => Math.round(v));
      series.forEach(s => {
        const v = s.vals.filter(x => x != null);
        if (!v.length) return;
        const d = v[v.length - 1] - v[0], good = M[C.m].inv ? d < 0 : d > 0;
        tb.appendChild(el('tr', null, [el('td.club', null, [el('i.ch-sw', { style: { background: s.col } }), UI.crest(s.c, 20), UI.cname(s.c)]), el('td', { text: f(v[v.length - 1]) }), el('td', { text: f(M[C.m].inv ? Math.max(...v) : Math.min(...v)) }), el('td', { text: f(M[C.m].inv ? Math.min(...v) : Math.max(...v)) }),
          el('td', { text: d === 0 ? '—' : M[C.m].inv ? `${d < 0 ? '▲' : '▼'} ${Math.abs(d)} ${U.plural(Math.abs(d), 'место', 'места', 'мест')}` : (d > 0 ? '+' : '−') + (C.m === 'bal' || C.m === 'val' ? G.FIN.fmtM(Math.abs(d)).replace('−', '') : Math.round(Math.abs(d) * 10) / 10), style: { color: d === 0 ? '' : good ? '#0ca30c' : '#e66767' } })]));
      });
      tbl.appendChild(tb);
      card.appendChild(el('div.table-scroll', null, [tbl]));
      wrap.appendChild(card);
      // выбор клубов для сравнения
      if (C.m !== 'conf') {
        const pc = el('div.card.wide-card', null, [el('h3', { text: `Сравнить клубы (до 4) · выбрано ${C.clubs.length}` })]);
        const pl = this._chLg && st.leagues[this._chLg] ? this._chLg : (uc ? uc.league : this.vlg());
        const seg = this.leagueSeg(pl, l => { this._chLg = l; this.hub('charts'); });
        if (seg) pc.appendChild(seg);
        const picker = el('div.club-picker');
        LEAGUE.leagueClubs(st, pl).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
          const on = C.clubs.includes(c.id);
          picker.appendChild(el('button' + (on ? '.on' : ''), { title: c.name, onclick: () => {
            if (on) { if (C.clubs.length > 1) { C.clubs = C.clubs.filter(x => x !== c.id); delete C.slot[c.id]; } }
            else if (C.clubs.length < 4) { const used = new Set(Object.values(C.slot)); let k = 0; while (used.has(k)) k++; C.clubs.push(c.id); C.slot[c.id] = k; }
            else UI.toast('Не больше 4 клубов на одном графике');
            this.hub('charts');
          } }, [UI.crest(c, 26)]));
        });
        pc.appendChild(picker);
        wrap.appendChild(pc);
      }
      body.appendChild(wrap);
    },

    /* Линейный график (SVG): сетка, границы сезонов, подписи линий, перекрестие с подсказкой */
    lineChart(st, ts, series, meta) {
      const NS = 'http://www.w3.org/2000/svg', W = 900, H = 330, L = 64, R = 70, Tp = 14, B = 34;
      const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
      const N = ts.length, xs = i => L + (N > 1 ? i / (N - 1) : 0.5) * (W - L - R);
      let vals = series.flatMap(s => s.vals).filter(v => v != null), lo = Math.min(...vals), hi = Math.max(...vals);
      if (meta.inv) { lo = 1; hi = Math.max(hi, 20); }
      if (lo === hi) { lo -= 1; hi += 1; }
      // «красивые» деления
      const span = hi - lo, step0 = span / 5, mag = Math.pow(10, Math.floor(Math.log10(step0))), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => span / k <= 6) || mag * 10;
      const y0 = meta.inv ? 1 : Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
      const ys = v => meta.inv ? Tp + (v - y0) / (y1 - y0) * (H - Tp - B) : H - B - (v - y0) / (y1 - y0) * (H - Tp - B);
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ch-svg', role: 'img', 'aria-label': `${meta.n}: ${series.map(s => s.c.name).join(', ')}` });
      // полосы лиг для места в пирамиде
      if (meta.inv) {
        let off = 0;
        LEAGUE.leagueIds(st).forEach((lid, k) => {
          const n = LEAGUE.leagueClubs(st, lid).length, a = off + 1, b = off + n;
          if (a <= y1) {
            svg.appendChild(mk('rect', { x: L, y: ys(a - 0.5 < 1 ? 1 : a - 0.5), width: W - L - R, height: Math.max(0, ys(Math.min(b + 0.5, y1)) - ys(a - 0.5 < 1 ? 1 : a - 0.5)), fill: k % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,0)' }));
            const t = mk('text', { x: W - R + 8, y: ys(Math.min((a + b) / 2, y1)), class: 'ch-band', 'dominant-baseline': 'middle' }); t.textContent = LEAGUE.leagueInfo(st, lid).short; svg.appendChild(t);
          }
          off += n;
        });
      }
      // сетка и ось Y
      const ticks = [];
      if (meta.inv) { ticks.push(1); for (let v = 5; v <= y1; v += y1 > 40 ? 10 : 5) ticks.push(v); }
      else for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
      for (const v of ticks) {
        const y = ys(v);
        svg.appendChild(mk('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'ch-grid' }));
        const t = mk('text', { x: L - 8, y, class: 'ch-tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
        t.textContent = meta.inv ? Math.round(v) : (Math.abs(step) >= 1 ? Math.round(v) : v.toFixed(1)); svg.appendChild(t);
      }
      const ul = mk('text', { x: W - R, y: H - 6, class: 'ch-tick', 'text-anchor': 'end' }); ul.textContent = meta.unit; svg.appendChild(ul);
      // границы сезонов
      const sOf = t => Math.floor(t / 100), sName = s => { const y = 2024 + s; return y + '/' + String(y + 1).slice(2); };
      ts.forEach((t, i) => {
        if (i === 0 || sOf(t) !== sOf(ts[i - 1])) {
          const x = xs(i);
          if (i > 0) svg.appendChild(mk('line', { x1: x, x2: x, y1: Tp, y2: H - B, class: 'ch-season' }));
          const lb = mk('text', { x: x + 4, y: H - B + 16, class: 'ch-tick' }); lb.textContent = sName(sOf(t)); svg.appendChild(lb);
        }
      });
      // линии (разрыв на пропусках и — для очков — на границе сезона)
      series.forEach(s => {
        let d = '', pen = false;
        s.vals.forEach((v, i) => {
          const brk = v == null || (meta.season && i > 0 && sOf(ts[i]) !== sOf(ts[i - 1]));
          if (v == null) { pen = false; return; }
          d += `${pen && !brk ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`; pen = true;
        });
        svg.appendChild(mk('path', { d, fill: 'none', stroke: s.col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        // подпись у конца линии
        let li = s.vals.length - 1; while (li >= 0 && s.vals[li] == null) li--;
        if (li >= 0 && series.length <= 4) {
          svg.appendChild(mk('circle', { cx: xs(li), cy: ys(s.vals[li]), r: 4, fill: s.col, stroke: '#1a1430', 'stroke-width': 2 }));
          const t = mk('text', { x: xs(li) + 8, y: ys(s.vals[li]), class: 'ch-label', 'dominant-baseline': 'middle' }); t.textContent = s.c.short; svg.appendChild(t);
        }
      });
      // перекрестие и подсказка
      const box = el('div.ch-box'), tip = el('div.ch-tip');
      const cross = mk('line', { y1: Tp, y2: H - B, class: 'ch-cross', visibility: 'hidden' });
      const dots = series.map(s => { const c = mk('circle', { r: 4, fill: s.col, stroke: '#1a1430', 'stroke-width': 2, visibility: 'hidden' }); svg.appendChild(c); return c; });
      svg.appendChild(cross);
      const hit = mk('rect', { x: L, y: Tp, width: W - L - R, height: H - Tp - B, fill: 'transparent' });
      svg.appendChild(hit);
      const fmt = meta.fmt || (v => Math.round(v));
      const show = ev => {
        const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
        const i = Math.max(0, Math.min(N - 1, Math.round((px - L) / (W - L - R) * (N - 1))));
        cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i)); cross.setAttribute('visibility', 'visible');
        tip.innerHTML = '';
        tip.appendChild(el('b', { text: `${sName(sOf(ts[i]))} · неделя ${ts[i] % 100}` }));
        series.forEach((s, k) => {
          const v = s.vals[i];
          if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
          dots[k].setAttribute('cx', xs(i)); dots[k].setAttribute('cy', ys(v)); dots[k].setAttribute('visibility', 'visible');
          const txt = meta.inv ? `${s.pos[i]}-е · ${LEAGUE.leagueInfo(st, G.DATA.LEAGUE_ORDER[(s.tier[i] || 1) - 1]).name}` : fmt(v);
          tip.appendChild(el('div', null, [el('i', { style: { background: s.col } }), `${s.c.short}: ${txt}`]));
        });
        tip.style.display = 'block';
        const left = xs(i) / W * r.width;
        tip.style.left = Math.min(left + 12, r.width - 200) + 'px';
        tip.style.top = '8px';
      };
      hit.addEventListener('mousemove', show);
      hit.addEventListener('touchstart', e => show(e.touches[0]), { passive: true });
      hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.style.display = 'none'; });
      box.append(svg, tip);
      return box;
    },

    /* Вкладка «Кубок»: все раунды, пары и результаты */
    tabCup(body) {
      const st = this.st, cup = st.cup, u = st.userClub;
      const card = el('div.card.wide-card');
      if (!cup || cup.season !== st.season) { card.append(el('h3', { text: G.CUP.NAME }), el('div.muted', { text: 'Кубок стартует со следующего сезона.' })); body.appendChild(card); return; }
      card.appendChild(el('h3', { text: `${G.CUP.NAME} ${st.seasonName}` }));
      let status = '';
      if (u) {
        const all = cup.rounds.flatMap(r => r.ties.map(f => ({ f, r })));
        const mineT = all.filter(x => x.f.h === u || x.f.a === u), last = mineT[mineT.length - 1];
        if (cup.winner === u) status = '🏆 Вы — обладатель Кубка Англии!';
        else if (!last) status = `Ваш клуб вступит в борьбу в раунде «${cup.rounds[1] ? cup.rounds[1].name : cup.rounds[0].name}».`;
        else if (last.f.res && LEAGUE.winner(last.f) !== u) status = `Вы выбыли: ${last.r.name}.`;
        else status = last.f.res ? 'Вы прошли дальше — ждём жеребьёвку.' : `Ваш матч: ${last.r.name}, неделя ${last.r.week + 1}.`;
      }
      if (status) card.appendChild(el('div.cup-status', { text: status }));
      card.appendChild(el('div.muted.small-note', { text: 'Матчи на выбывание, ничья — серия пенальти. Клубы Премьер-лиги и Чемпионшипа вступают в 3-м раунде. Полуфиналы и финал — на «Уэмбли». Призовые за каждый раунд и выручка от билетов — обоим клубам.' }));
      cup.rounds.slice().reverse().forEach(R => {
        const sec = el('div.cup-round', null, [el('h4', { text: `${R.name} · неделя ${R.week + 1}${R.ties.length ? '' : ' · жеребьёвка впереди'}` })]);
        const ties = R.ties.slice().sort((a, b) => ((b.h === u || b.a === u) - (a.h === u || a.a === u)));
        ties.forEach(f => {
          const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a), w = LEAGUE.winner(f), mine = u && (f.h === u || f.a === u);
          sec.appendChild(el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''), { onclick: () => f.res && this.report(f) }, [
            el('div.fx-t.h' + (w === h.id ? '.win' : ''), null, [el('span', null, [UI.cname(h), el('small.fx-pos', { text: ` (${LEAGUE.leagueInfo(st, h.league).short})` })]), UI.crest(h, 22)]),
            el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}${f.res.pen ? ' п.' : ''}` : '– : –' }),
            el('div.fx-t.a' + (w === a.id ? '.win' : ''), null, [UI.crest(a, 22), el('span', null, [UI.cname(a), el('small.fx-pos', { text: ` (${LEAGUE.leagueInfo(st, a.league).short})` })])])]));
        });
        if (R.ties.length || R === cup.rounds[cup.rounds.length - 1]) card.appendChild(sec);
      });
      const wins = (st.history || []).filter(h => h.cup).slice(-6).reverse();
      if (wins.length) card.appendChild(el('div.cup-round', null, [el('h4', { text: 'Обладатели' })].concat(wins.map(h => { const c = LEAGUE.club(st, h.cup); return el('div.mini-row', null, [el('span.pos', { text: h.season }), UI.crest(c, 18), el('span.nm', { text: c.name })]); }))));
      body.appendChild(card);
    },

    async simRemaining(lid) {
      const rd = this.roundFixtures(lid), u = this.st.userClub, mine = f => f.h === u || f.a === u;
      // сначала кубок середины недели, затем лига
      const cup = (G.CUP ? G.CUP.weekTies(this.st) : []).filter(f => !f.res && !mine(f));
      await this.simList(cup.concat(rd.filter(f => !f.res && !mine(f))));
      LEAGUE.save(this.st);
      this.hub();
    },
    /* Симуляция списка матчей с оверлеем */
    async simList(todo, title) {
      if (!todo.length) return;
      const ov = el('div.sim-overlay', null, [el('div.sim-box', null, [el('div.spinner'), el('b', { text: title || 'Симуляция матчей...' }), el('div.sim-list')])]);
      document.body.appendChild(ov);
      const list = ov.querySelector('.sim-list');
      for (const f of todo) {
        await U.sleep(todo.length > 14 ? 8 : 30);
        this.simFixture(f);
        const h = LEAGUE.club(this.st, f.h), a = LEAGUE.club(this.st, f.a);
        list.appendChild(el('div.sim-r', { text: `${h.short} ${f.res.hs}:${f.res.as} ${a.short}` }));
      }
      await U.sleep(todo.length > 14 ? 250 : 500);
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 300);
    },

    makeMatch(f, opts) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
      const uc = st.userClub;
      const tacFor = (club, opp, home) => {
        if (club.id === uc) return this.userTac(f);
        return AI.prepare(club, opp, home, LEAGUE.prepOpts(st, f, club));
      };
      const env = LEAGUE.matchEnv(st, f);
      const ht = opts && opts.homeTac || tacFor(h, a, true), at = opts && opts.awayTac || tacFor(a, h, false);
      return new ENGINE.Match({
        home: { club: h, tactics: ht, ctrl: (opts && opts.human === 'home') ? 'human' : 'ai' },
        away: { club: a, tactics: at, ctrl: (opts && opts.human === 'away') ? 'human' : 'ai' },
        turns: st.settings.turns, log: !!(opts && opts.log), interactive: !!(opts && opts.interactive), env
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
    prematch(f, quiet) {
      const st = this.st, uc = LEAGUE.club(st, st.userClub);
      LEAGUE.fixUserTactics(st);
      TAC.cupMode = !!f.cup;
      const isHome = f.h === uc.id;
      const opp = LEAGUE.club(st, isHome ? f.a : f.h);
      const oppTac = this.oppPlan(f, opp, uc, !isHome);
      const root = el('div.screen.prematch');
      root.style.setProperty('--c1', uc.c1);
      const header = el('div.pm-head', null, [
        el('button.icon-btn', { text: '←', onclick: () => this.hub('home') }),
        el('div.pm-title', null, [UI.crest(LEAGUE.club(st, f.h), 40), el('h2', { text: `${f.cup ? '🏆 ' : ''}${LEAGUE.club(st, f.h).name} — ${LEAGUE.club(st, f.a).name}` }), UI.crest(LEAGUE.club(st, f.a), 40)]),
        el('button.btn.primary.big', { text: 'На поле ▶', onclick: () => this.playUserMatch(f, oppTac) })
      ]);
      root.appendChild(header);
      let envEl = this.envLine(f);
      root.appendChild(envEl);
      if (f.h === st.userClub && !f.neutral) {
        // смена цены обновляет только блок цен и строку условий матча
        let pb;
        const redraw = () => { const ne = this.envLine(f), np = this.priceBox(f, redraw); envEl.replaceWith(ne); pb.replaceWith(np); envEl = ne; pb = np; };
        pb = this.priceBox(f, redraw);
        root.appendChild(pb);
      }
      const body = el('div.pm-body');
      const mine = el('div.card.pm-mine', null, [el('h3', { text: 'Ваша тактика' })]);
      const myTac = this.userTac(f);
      if (f.cup) {
        mine.appendChild(el('div.cup-tools', null, [
          el('small.muted', { text: `${G.CUP.NAME}, ${G.CUP.roundName(st, f)}: состав на кубок отдельный — основа на лигу не меняется.` }),
          el('div.cup-btns', null, [
            el('button.btn.small', { text: '🔄 Резерв от ассистента', title: 'Ассистент даст отдых сильнейшим и самым уставшим', onclick: () => { const k = f.neutral ? 0 : Math.max(3, G.CUP.rotation(uc, opp, f)); const ex = AI.cupRest(uc, opp, f, k) || new Set(); const xi = TAC.bestXI(uc, myTac.formation, { exclude: ex }); myTac.lineup = xi.lineup; myTac.bench = xi.bench; this.prematch(f, true); } }),
            el('button.btn.small.ghost', { text: '↺ Основной состав', onclick: () => { st.cupTac = null; this.prematch(f, true); } })
          ])
        ]));
      }
      mine.appendChild(UI.TacticsEditor(UI.prematchModel(uc, myTac)));
      const theirs = el('div.card.pm-opp', null, [el('h3', { text: `Соперник: ${opp.name}` })]);
      theirs.appendChild(el('div.pm-coach', null, [el('b', { text: `${opp.coach.name} (${opp.coach.nat})` }), UI.coachTraits(opp.coach, { hideEmpty: true }), el('p', { text: opp.coach.motto })]));
      theirs.appendChild(el('div.cd-tags', null, [el('span', { text: oppTac.formation }), el('span', { text: TAC.PLANS[oppTac.plan].icon + ' ' + TAC.PLANS[oppTac.plan].n }), el('span', { text: 'Менталитет: ' + TAC.MENTALITY[oppTac.mentality] }), el('span', { text: 'Прессинг: ' + TAC.PRESSING[oppTac.pressing] }), el('span', { text: 'Линия: ' + TAC.LINE[oppTac.line] })]));
      const map0 = TAC.playerMap(opp);
      const notes = el('div.pm-notes', null, [el('small', { text: 'Решения тренера соперника:' })].concat(oppTac.notes.map(n => el('div', { text: '🧠 ' + n }))));
      theirs.appendChild(notes);
      const oppTr = oppTac.lineup.map(id => map0[id]).filter(p => p && p.tr && p.tr.length);
      if (oppTr.length) {
        const tbox = el('div.pm-notes', null, [el('small', { text: 'Скаут: особенности игроков соперника' })]);
        oppTr.slice(0, 6).forEach(p => p.tr.forEach(id => { const t = G.TRAITS.LIST[id]; tbox.appendChild(el('div', { title: t.d }, [`${t.i} `, UI.pname(p), ` — ${t.n}`])); }));
        theirs.appendChild(tbox);
      }
      const map = TAC.playerMap(opp);
      const ol = el('div.pm-xi');
      TAC.FORMATIONS[oppTac.formation].forEach((s, i) => { const p = map[oppTac.lineup[i]]; if (p) ol.appendChild(el('div.pm-p', null, [el('span.lu-pos', { text: s.label }), el('span', null, [UI.pname(p), ' ', UI.formBadge(p), ' ', UI.traitIcons(p)]), el('b', { text: TAC.roleRating(p, s.role).toFixed(1), style: { color: U.attrColor(TAC.roleRating(p, s.role)) } })])); });
      theirs.appendChild(ol);
      body.append(mine, theirs);
      root.appendChild(body);
      this.show(root, quiet);
    },

    async playUserMatch(f, oppTac) {
      const st = this.st;
      const T = this.userTac(f);
      const valid = T.lineup.filter(Boolean).length === 11 && T.lineup.some(id => { const p = TAC.playerMap(LEAGUE.club(st, st.userClub))[id]; return p && p.pos === 'GK'; });
      if (!valid) {
        const ok = await UI.modal({ title: 'Проблема с составом', content: el('p', { text: 'В составе нет вратаря или не хватает игроков. Всё равно начать?' }), buttons: [{ text: 'Исправить', cls: 'ghost', value: false }, { text: 'Играть', cls: 'primary', value: true }] }).result;
        if (!ok) return;
      }
      const human = f.h === st.userClub ? 'home' : 'away';
      const m = this.makeMatch(f, { human, log: true, interactive: true, homeTac: human === 'away' ? oppTac : null, awayTac: human === 'home' ? oppTac : null });
      await this.playMatchScreen(m);
      await G.MatchScreen.fullTime(m);
      // перенос изменений тактики (без замен) в сохранение
      T.mentality = m.t[human].tac.mentality;
      T.plan = m.t[human].tac.plan;
      this.afterUserMatch(f, m);
    },

    report(f) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a), r = f.res;
      const content = el('div.report');
      content.appendChild(el('div.ft-head', null, [el('div.ft-team', null, [UI.crest(h, 54), el('b', null, [UI.cname(h)])]), el('div.ft-score', { text: `${r.hs} : ${r.as}` }), el('div.ft-team', null, [UI.crest(a, 54), el('b', null, [UI.cname(a)])])]));
      const gl = el('div.ft-goals');
      r.goals.forEach(g => gl.appendChild(el('div.ft-g.' + g.side, { text: `⚽ ${g.min} ${g.scorer}${g.kind === 'pen' ? ' (пен.)' : ''}${g.assist ? ' (' + g.assist + ')' : ''}` })));
      content.appendChild(gl);
      if (r.motm) { const mp = h.players.concat(a.players).find(x => x.name === r.motm); content.appendChild(el('div.ft-motm', null, [el('small', { text: 'Игрок матча' }), el('b', null, [mp ? UI.pname(mp) : r.motm, ` — ${r.motmR}`])])); }
      if (r.att) content.appendChild(el('div.muted', { text: `🏟 ${f.neutral ? '«Уэмбли»' : h.stadium}: ${r.att.toLocaleString('ru')} зрителей${f.env ? ` · ${G.ENGINE.WEATHER[f.env.weather].i} ${G.ENGINE.WEATHER[f.env.weather].n}` : ''}`, style: { textAlign: 'center' } }));
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

    async nextRound() {
      const st = this.st;
      if (this._busy) return;
      this._busy = true;
      try { await this.simList(LEAGUE.weekFixtures(st).filter(f => !f.res), 'Матчи недели во всех лигах...'); } finally { this._busy = false; }
      LEAGUE.advance(st);
      LEAGUE.save(st);
      if (LEAGUE.seasonOver(st)) return this.seasonEnd();
      this.hub('home');
      if (st.userClub) {
        const t = LEAGUE.standings(st);
        const pos = t.findIndex(r => r.id === st.userClub) + 1;
        UI.toast(`${LEAGUE.weekLabel(st)}. Вы на ${pos}-м месте.`);
      }
    },

    seasonEnd() {
      const st = this.st, sum = LEAGUE.seasonSummary(st), ids = LEAGUE.leagueIds(st), top = ids[0];
      const ttop = LEAGUE.standings(st, top);
      const champ = LEAGUE.club(st, sum.champions[top]);
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const root = el('div.screen.season-end');
      const up = uc ? sum.promoted.find(x => x.id === uc.id) : null, down = uc ? sum.relegated.find(x => x.id === uc.id) : null;
      const hero = up ? uc : champ;
      root.style.setProperty('--c1', hero.c1); root.style.setProperty('--c2', hero.c2);
      let userTxt = null;
      if (uc) {
        const t = LEAGUE.standings(st, uc.league), pos = t.findIndex(r => r.id === uc.id) + 1, L = G.DATA.LEAGUES[uc.league] || {};
        if (pos === 1 && L.tier === 1) userTxt = 'Это ваша команда! Вы — чемпион! 🎉';
        else if (up) userTxt = `Ваш клуб занял ${pos}-е место и выходит в ${G.DATA.LEAGUES[up.to].acc}${sum.playoffs[up.from] === uc.id ? ' через плей-офф' : ''}! 🎉`;
        else if (down) userTxt = `Ваш клуб занял ${pos}-е место. Увы, вылет в ${G.DATA.LEAGUES[down.to].acc}...`;
        else userTxt = `Ваш клуб занял ${pos}-е место.${L.zones && L.zones.cl && pos <= L.zones.cl ? ' Лига чемпионов!' : ''}`;
      }
      const sc = LEAGUE.topScorers(st, 1, top)[0];
      const names = arr => arr.map(x => LEAGUE.club(st, x.id).name).join(', ');
      const other = el('div.se-leagues');
      ids.slice(1).forEach(lid => {
        const c = LEAGUE.club(st, sum.champions[lid]);
        other.appendChild(el('div.se-lg', null, [UI.crest(c, 40), el('div', null, [el('small', { text: `Победитель: ${LEAGUE.leagueInfo(st, lid).name}` }), el('b', { text: c.name })])]));
      });
      ids.slice(1).forEach(lid => {
        const to = LEAGUE.above(lid), upL = sum.promoted.filter(x => x.from === lid), dn = sum.relegated.filter(x => x.from === to.id), po = sum.playoffs[lid];
        if (upL.length) other.appendChild(el('div.se-move.up', null, [el('small', { text: `⬆ В ${to.acc}` }), el('b', { text: names(upL) + (po ? ` (плей-офф: ${LEAGUE.club(st, po).name})` : '') })]));
        if (dn.length) other.appendChild(el('div.se-move.down', null, [el('small', { text: `⬇ В ${G.DATA.LEAGUES[lid].acc}` }), el('b', { text: names(dn) })]));
      });
      if (st.cup && st.cup.season === st.season && st.cup.winner) {
        const cw = LEAGUE.club(st, st.cup.winner);
        other.insertBefore(el('div.se-lg', null, [UI.crest(cw, 40), el('div', null, [el('small', { text: `Обладатель: ${G.CUP.NAME}` }), el('b', { text: cw.name + (cw.id === st.userClub ? ' — это вы! 🎉' : '') })])]), other.firstChild);
      }
      root.append(
        el('div.se-trophy', { text: '🏆' }),
        el('h1', { text: 'Чемпион Англии' }),
        el('div.se-champ', null, [UI.crest(champ, 120), el('b', { text: champ.name }), el('small', { text: `${ttop[0].pts} очков · ${champ.coach.name}` })]),
        userTxt ? el('div.se-user', { text: userTxt }) : null,
        sc ? el('div.se-user.small', null, ['Лучший бомбардир: ', UI.pname(sc.p), ` (${sc.c.name}) — ${sc.p.st.goals}`]) : null,
        other.children.length ? other : null,
        el('div.se-btns', null, [
          el('button.btn.ghost', { text: 'Итоговые таблицы', onclick: () => { const b = el('div'); let cur = uc ? uc.league : top; const draw = () => { b.innerHTML = ''; const sg = this.leagueSeg(cur, l => { cur = l; draw(); }); if (sg) b.appendChild(sg); this.tableEl(b, cur); this.playoffEl(b, cur); }; draw(); UI.modal({ title: 'Итоговые таблицы ' + st.seasonName, content: b, wide: true }); } }),
          el('button.btn.primary.big', { text: 'Новый сезон ▶', onclick: () => { LEAGUE.newSeason(st); LEAGUE.save(st); this._vlg = null; this.hub('home'); } })
        ])
      );
      this.show(root);
      setTimeout(() => { FX.confetti([hero.c1, hero.c2, '#ffd23f', '#ffffff'], 260); SFX.goal(); }, 400);
    },

    /* ---------- Вкладки ---------- */
    miniTable() {
      const st = this.st, lid = st.userClub ? st.lg : this.vlg(), t = LEAGUE.standings(st, lid);
      const box = el('div.card', null, [el('h3', { text: LEAGUE.leagueInfo(st, lid).name })]);
      let rows = t.map((r, i) => ({ r, i }));
      if (st.userClub) {
        const ui = t.findIndex(r => r.id === st.userClub);
        const from = U.clamp(ui - 3, 0, t.length - 7);
        rows = rows.slice(from, from + 7);
      } else rows = rows.slice(0, 8);
      rows.forEach(({ r, i }) => {
        const c = LEAGUE.club(st, r.id);
        box.appendChild(el('div.mini-row' + (r.id === st.userClub ? '.me' : ''), null, [el('span.pos', { text: i + 1 }), UI.crest(c, 18), el('span.nm', null, [UI.cname(c)]), el('span.muted', { text: r.p }), el('b', { text: r.pts })]));
      });
      box.appendChild(el('button.btn.ghost.small', { text: 'Вся таблица', onclick: () => { this._vlg = lid; this.hub('table'); } }));
      return box;
    },

    resultRow(f, uid) {
      const st = this.st, h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
      const my = f.h === uid ? f.res.hs : f.res.as, th = f.h === uid ? f.res.as : f.res.hs;
      const r = my > th ? 'W' : my < th ? 'L' : 'D';
      return el('div.res-row', { onclick: () => this.report(f) }, [el('span.form-b.' + r, { text: { W: 'В', D: 'Н', L: 'П' }[r] }), el('span', { text: `${h.short} ${f.res.hs}:${f.res.as} ${a.short}` })]);
    },

    tabTable(body) {
      const st = this.st, lid = this.vlg();
      const card = el('div.card.wide-card');
      card.appendChild(el('h3', { text: `${LEAGUE.leagueInfo(st, lid).name} ${st.seasonName}` }));
      const seg = this.leagueSeg(lid);
      if (seg) card.appendChild(seg);
      this.tableEl(card, lid);
      this.playoffEl(card, lid);
      body.appendChild(card);
    },

    /* Сетка плей-офф (если в лиге он есть) */
    playoffEl(host, lid) {
      const st = this.st, L = G.DATA.LEAGUES[lid];
      if (!L || !L.playoff) return;
      const fx = st.leagues[lid].fixtures, W = fx.length;
      const semis = fx[W - 2] || [], fin = fx[W - 1] || [];
      const box = el('div.po-box', null, [el('h4', { text: `Плей-офф за ${L.playoff[0]}–${L.playoff[1]} места: путёвка в ${(LEAGUE.above(lid) || L).acc}` })]);
      const row = (f, tag) => {
        const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a), w = LEAGUE.winner(f);
        return el('div.fx-row.po' + (f.res ? '.done' : ''), { onclick: () => f.res && this.report(f) }, [el('small.po-tag', { text: tag }),
          el('div.fx-t.h' + (w === h.id ? '.win' : ''), null, [UI.cname(h), UI.crest(h, 22)]),
          el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}${f.res.pen ? ' (пен.)' : ''}` : '– : –' }),
          el('div.fx-t.a' + (w === a.id ? '.win' : ''), null, [UI.crest(a, 22), UI.cname(a)])]);
      };
      if (!semis.length) {
        const t = LEAGUE.standings(st, lid), s = i => LEAGUE.club(st, t[i - 1].id).short;
        box.appendChild(el('div.muted', { text: `После ${LEAGUE.roundsTotal(st, lid)}-го тура: полуфиналы 3-е — 6-е и 4-е — 5-е места, финал на «Уэмбли». Сейчас: ${s(3)} — ${s(6)}, ${s(4)} — ${s(5)}.` }));
      } else {
        semis.forEach(f => box.appendChild(row(f, 'Полуфинал')));
        fin.forEach(f => box.appendChild(row(f, 'Финал')));
      }
      host.appendChild(box);
    },

    tableEl(host, lid) {
      const st = this.st;
      lid = lid || st.lg;
      const t = LEAGUE.standings(st, lid), Z = (G.DATA.LEAGUES[lid] || {}).zones || {}, n = t.length;
      const zoneOf = i => Z.cl && i < Z.cl ? 'cl' : Z.el && i < Z.el ? 'el' : Z.ecl && i < Z.ecl ? 'ecl' : Z.up && i < Z.up ? 'up' : Z.po && i < Z.po ? 'po' : Z.rel && i >= n - Z.rel ? 'rel' : '';
      const tbl = el('table.league');
      tbl.appendChild(el('thead', null, [el('tr', null, ['#', 'Клуб', 'И', 'В', 'Н', 'П', 'Мячи', 'Р', 'О', 'Форма'].map(h => el('th', { text: h })))]));
      const tb = el('tbody');
      t.forEach((r, i) => {
        const c = LEAGUE.club(st, r.id);
        const zone = zoneOf(i);
        const form = el('td.form');
        r.form.forEach(x => form.appendChild(el('span.form-b.' + x, { text: { W: 'В', D: 'Н', L: 'П' }[x] })));
        tb.appendChild(el('tr' + (zone ? '.' + zone : '') + (r.id === st.userClub ? '.me' : ''), null, [
          el('td.pos', { text: i + 1 }), el('td.club', null, [UI.crest(c, 22), UI.cname(c)]),
          el('td', { text: r.p }), el('td', { text: r.w }), el('td', { text: r.d }), el('td', { text: r.l }), el('td', { text: `${r.gf}:${r.ga}` }), el('td', { text: (r.gd > 0 ? '+' : '') + r.gd }), el('td.pts', r.ded ? { text: r.pts + '*', title: `−${r.ded} очков: внешнее управление` } : { text: r.pts }), form
        ]));
      });
      tbl.appendChild(tb);
      host.appendChild(el('div.table-scroll', null, [tbl]));
      const ZN = { cl: 'Лига чемпионов', el: 'Лига Европы', ecl: 'Лига конференций', up: 'Прямое повышение', po: 'Плей-офф за повышение', rel: 'Вылет' };
      host.appendChild(el('div.legend-zones', null, Object.keys(ZN).filter(k => Z[k]).map(k => el('span.' + k, { text: ZN[k] }))));
      t.filter(r => r.ded).forEach(r => host.appendChild(el('div.muted.small-note', { text: `* «${LEAGUE.club(st, r.id).name}»: −${r.ded} очков за внешнее управление.` })));
    },

    tabFixtures(body) {
      const st = this.st, lid = this.vlg(), fx = st.leagues[lid].fixtures;
      const wk = fx.map((rd, i) => rd.length ? i : -1).filter(i => i >= 0);
      let r = wk.findIndex(i => i >= st.round);
      if (r < 0) r = wk.length - 1;
      const card = el('div.card.wide-card');
      const seg = this.leagueSeg(lid);
      const head = el('div.fx-head');
      const list = el('div.fixtures');
      const render = () => {
        const w = wk[r];
        head.innerHTML = '';
        head.append(el('button.icon-btn', { text: '‹', onclick: () => { r = Math.max(0, r - 1); render(); } }), el('h3', null, [LEAGUE.weekLabel(st, lid, w), el('small.muted', { text: ` · неделя ${w + 1}` })]), el('button.icon-btn', { text: '›', onclick: () => { r = Math.min(wk.length - 1, r + 1); render(); } }));
        list.innerHTML = '';
        const tbl = LEAGUE.standings(st, lid), place = id => tbl.findIndex(r => r.id === id) + 1;
        fx[w].forEach(f => {
          const h = LEAGUE.club(st, f.h), a = LEAGUE.club(st, f.a);
          const mine = st.userClub && (f.h === st.userClub || f.a === st.userClub);
          const row = el('div.fx-row' + (mine ? '.mine' : '') + (f.res ? '.done' : ''), { onclick: () => f.res && this.report(f) }, [
            el('div.fx-t.h', null, [el('span', null, [UI.cname(h), el('small.fx-pos', { text: ` (${place(h.id)})` })]), UI.crest(h, 24)]),
            el('div.fx-s', { text: f.res ? `${f.res.hs} : ${f.res.as}${f.res.pen ? ' п.' : ''}` : '– : –' }),
            el('div.fx-t.a', null, [UI.crest(a, 24), el('span', null, [UI.cname(a), el('small.fx-pos', { text: ` (${place(a.id)})` })])])
          ]);
          list.appendChild(row);
        });
      };
      render();
      card.append(seg || '', head, list);
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      if (uc && uc.league === lid) {
        const my = el('div.card', null, [el('h3', { text: 'Ваш календарь' })]);
        const tl = el('div.my-fixtures');
        fx.forEach((rd, i) => {
          const f = rd.find(x => x.h === uc.id || x.a === uc.id);
          if (!f) return;
          const opp = LEAGUE.club(st, f.h === uc.id ? f.a : f.h);
          const res = f.res ? (f.h === uc.id ? [f.res.hs, f.res.as] : [f.res.as, f.res.hs]) : null;
          const won = f.res && LEAGUE.winner(f) === uc.id;
          const cls = res ? (res[0] > res[1] || (res[0] === res[1] && f.po && won) ? 'W' : res[0] < res[1] || f.po ? 'L' : 'D') : (i === st.round ? 'next' : '');
          const n = f.po ? 'ПО' : LEAGUE.roundOf(st, lid, i);
          tl.appendChild(el('div.mf.' + (cls || 'fut'), { title: `${LEAGUE.weekLabel(st, lid, i)}: ${opp.name}`, onclick: () => { r = wk.indexOf(i); render(); } }, [el('small', { text: n }), UI.crest(opp, 22), el('span', { text: f.h === uc.id ? 'Д' : 'Г' }), el('b', { text: res ? res.join(':') : '' })]));
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
      if (req.length) box.appendChild(el('div.fm-warn', null, ['✉ Просят о трансфере: '].concat(req.flatMap((p, i) => i ? [', ', UI.pname(p)] : [UI.pname(p)]))));
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
      const f = this.trF = this.trF || { lg: '', pos: 'ALL', sort: 'ovr', maxAge: 0, minOvr: 0, maxPrice: 0, listedOnly: false, q: '', trait: '' };
      const bar = el('div.tr-filters');
      const sel = (opts, key, conv) => { const s = el('select', { onchange: (e) => { f[key] = conv ? conv(e.target.value) : e.target.value; render(); } }); opts.forEach(([v, n]) => { const o = el('option', { value: v, text: n }); if (String(f[key]) === String(v)) o.selected = true; s.appendChild(o); }); return s; };
      bar.append(
        el('input.tr-q', { placeholder: 'Имя игрока…', value: f.q, oninput: (e) => { f.q = e.target.value; render(); } }),
        sel([['ALL', 'Все позиции'], ['GK', 'Вратари'], ['DF', 'Защитники'], ['MF', 'Полузащитники'], ['FW', 'Нападающие']], 'pos'),
        sel([[0, 'Любой возраст'], [21, 'до 21'], [23, 'до 23'], [26, 'до 26'], [29, 'до 29']], 'maxAge', Number),
        sel([['', 'Все лиги']].concat(LEAGUE.leagueIds(st).map(l => [l, LEAGUE.leagueInfo(st, l).name])), 'lg'),
        sel([[0, 'Любой рейтинг'], [11, '11+'], [12, '12+'], [13, '13+'], [14, '14+'], [15, '15+'], [16, '16+'], [17, '17+']], 'minOvr', Number),
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
          el('td', null, [UI.crest(c, 20), ' ', UI.cname(c, c.short)]),
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
      if (!m.offers.length) { card.appendChild(el('div.muted', { text: G.TR.windowState(st).open ? 'Пока предложений нет. Выставьте игроков на трансфер во вкладке «Продажа» — клубы начнут присылать ставки после матчей недели.' : 'Окно закрыто.' })); return; }
      m.offers.forEach(o => {
        const f = G.TR.findPlayer(st, o.pid), buyer = LEAGUE.club(st, o.from);
        if (!f || !buyer) return;
        const p = f.p;
        const row = el('div.offer', null, [
          UI.crest(buyer, 34),
          el('div.offer-t', null, [el('b', null, [`«${buyer.name}» → `, UI.pname(p)]), el('small', { text: `${UI.posName(p.pos)}, ${p.age} · рейтинг ${TAC.overall(p).toFixed(1)} · стоимость ${G.FIN.fmtM(G.FIN.value(p))} · действует до ${o.expires + 1}-й недели` })]),
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
      card.appendChild(el('div.muted.small-note', { text: 'Выставленные игроки чаще получают предложения, но клубы предлагают меньше. За сильных игроков клубы могут прислать предложение и без выставления. Предложения приходят каждую неделю, пока открыто окно.' }));
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
        const mine = h.to === st.userClub ? 'in' : h.from === st.userClub ? 'out' : '';
        if (!a && b) { card.appendChild(el('div.hist-row' + (mine ? '.' + mine : ''), null, [el('small', { text: `${h.season}, нед. ${h.round}` }), el('b', null, [this.pnameById(h.pid, h.name)]), el('span', null, ['свободный агент → ', UI.crest(b, 18), ' ', UI.cname(b, b.short)]), el('b.loan-tag', { text: 'бесплатно' })])); return; }
        if (!a) return;
        if (!b) { card.appendChild(el('div.hist-row', null, [el('small', { text: `${h.season}, нед. ${h.round}` }), el('b', null, [this.pnameById(h.pid, h.name)]), el('span', null, [UI.crest(a, 18), ' ', UI.cname(a, a.short), ' → свободный агент']), el('b', { text: '—' })])); return; }
        if (h.loan) { card.appendChild(el('div.hist-row' + (mine ? '.' + mine : ''), null, [el('small', { text: `${h.season}, нед. ${h.round}` }), el('b', null, [this.pnameById(h.pid, h.name)]), el('span', null, [UI.crest(a, 18), ' ', UI.cname(a, a.short), ' → ', UI.crest(b, 18), ' ', UI.cname(b, b.short)]), el('b.loan-tag', { text: 'аренда' + (h.fee ? ' · ' + G.FIN.fmtM(h.fee) : '') })])); return; }
        card.appendChild(el('div.hist-row' + (mine ? '.' + mine : ''), null, [el('small', { text: `${h.season}, нед. ${h.round}` }), el('b', null, [this.pnameById(h.pid, h.name)]), el('span', null, [UI.crest(a, 18), ' ', UI.cname(a, a.short), ' → ', UI.crest(b, 18), ' ', UI.cname(b, b.short)]), el('b', { text: G.FIN.fmtM(h.fee) })]));
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
          el('td', { text: G.FIN.fmtM(G.FIN.value(p)) }), el('td', { text: G.FIN.fmtW(d.wage) }), el('td', { text: `${d.idle} нед.` }),
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
        el('div.pc-head', null, [el('div', null, [el('div.pc-name', null, [UI.pname(p)]), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · свободный агент ${d.idle} нед.` })])]),
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
        const pos = LEAGUE.standings(st, c.league).findIndex(r => r.id === c.id) + 1;
        content.appendChild(el('div.offer', null, [UI.crest(c, 40), el('div.offer-t', null, [el('b', { text: c.name }), el('small', { text: `${LEAGUE.leagueInfo(st, c.league).name}: ${pos}-е место · цель совета: ${c.fin.target}-е · бюджет ${G.FIN.fmtM(c.fin.transferBudget || 0)}${recent ? ' · только что уволили тренера' : ''}` })]),
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
      content.append(el('div.pc-head', null, [el('div', null, [el('div.pc-name', null, [UI.pname(p)]), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · зарплата ${G.FIN.fmtW(p.wage)}` })])]),
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
      content.append(el('div.pc-head', null, [UI.crest(owner, 40), el('div', null, [el('div.pc-name', null, [UI.pname(p)]), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · «${owner.name}»` })])]),
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
      const head = el('div.pc-head', null, [UI.crest(seller, 44), el('div', null, [el('div.pc-name', null, [UI.pname(p)]), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · «${seller.name}» · ${TR.aiListed(seller, p) ? 'клуб готов продать' : TR.STATUS_TXT[TR.status(seller, p)]}` })])]);
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
      if (f.embargo) box.appendChild(el('div.fm-warn', { text: '⛔ Запрет на регистрацию игроков' }));
      const fl = G.FIN.fansLabel(G.FIN.fans(c));
      box.appendChild(el('div.fm-row', null, [el('span', { text: 'Болельщики' }), el('b', { text: `${fl[1]} ${Math.round(G.FIN.fans(c))} · ${fl[0].toLowerCase()}` })]));
      return box;
    },

    boardMeter() {
      const b = this.st.board;
      const col = b.conf >= 60 ? '#00ff87' : b.conf >= 35 ? '#ffd23f' : '#ff4d6d';
      const cupN = G.FIN.cupStageName(this.st, b.cup);
      const m = el('div.meter.board-m', null, [el('div.meter-top', null, [el('span', { text: `Доверие совета · цель: ${b.target}-е место${cupN ? ` · кубок: ${cupN}` : ''}` }), el('b', { text: Math.round(b.conf) + '%' })]), el('div.meter-bar', null, [el('i')])]);
      m.querySelector('i').style.width = b.conf + '%';
      m.querySelector('i').style.background = col;
      return m;
    },

    tabFinance(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const club = (!uc && this.finClub && LEAGUE.club(st, this.finClub)) || uc || LEAGUE.leagueClubs(st, this.vlg())[0];
      const own = club === uc;
      const f = club.fin;
      const wrap = el('div.fin-wrap');
      if (!uc) {
        const pl = this._pickLg && st.leagues[this._pickLg] ? this._pickLg : club.league;
        const seg = this.leagueSeg(pl, l => { this._pickLg = l; this._vlg = l; this.finClub = null; this.hub('finance'); });
        if (seg) wrap.appendChild(seg);
        const picker = el('div.club-picker');
        LEAGUE.leagueClubs(st, pl).sort((a, b) => b.fin.balance - a.fin.balance).forEach(c => picker.appendChild(el('button' + (c === club ? '.on' : ''), { title: `${c.name}: ${G.FIN.fmtM(c.fin.balance)}`, onclick: () => { this.finClub = c.id; this.hub('finance'); } }, [UI.crest(c, 26)])));
        wrap.appendChild(picker);
      }
      // ключевые показатели
      const bill = G.FIN.wageBill(club);
      const kpi = (label, val, sub, cls) => el('div.card.kpi' + (cls ? '.' + cls : ''), null, [el('small', { text: label }), el('b', { text: val }), sub ? el('span', { text: sub }) : null]);
      const s = f.season;
      const income = s.tv + s.gate + s.comm + s.prize + (s.owner || 0) + Math.max(0, s.transfers || 0), expense = s.wages + s.ops + Math.min(0, s.transfers || 0);
      const kpis = el('div.kpis', null, [
        kpi('Баланс клуба', G.FIN.fmtM(f.balance), `${income + expense >= 0 ? '+' : ''}${(income + expense).toFixed(1)} млн за сезон`, f.balance < 0 ? 'neg' : ''),
        kpi('Зарплатная ведомость', `£${bill} тыс./нед`, `бюджет £${f.wageBudget} тыс. · ${G.FIN.yearly(bill).toFixed(0)} млн/год`, bill > f.wageBudget ? 'neg' : ''),
        kpi('Стоимость состава', G.FIN.fmtM(G.FIN.squadValue(club)), `${club.players.length} игроков`),
        kpi('Стадион', Math.round((club.cap || G.FIN.CAPACITY[club.id] || 30) * 1000).toLocaleString('ru') + ' мест', `базовая цена билета ~£${Math.round(G.FIN.ticket(club))}`),
        kpi(`${G.FIN.fansLabel(G.FIN.fans(club))[1]} Болельщики`, `${Math.round(G.FIN.fans(club))} · ${G.FIN.fansLabel(G.FIN.fans(club))[0]}`, 'растут от побед, дерби, кубка, громких покупок и дешёвых билетов; падают от поражений, продажи звёзд и дорогих билетов. Влияют на посещаемость, давление трибун и доверие совета', G.FIN.fans(club) < 25 ? 'neg' : ''),
        kpi('⭐ Престиж', `${Math.round(G.FIN.pres(club))} · ${G.FIN.presLabel(G.FIN.pres(club))}`, 'растёт от трофеев, мест выше ожиданий, повышений и кубка; влияет на спонсоров, спрос на билеты, интерес игроков и академию'),
        kpi(G.FIN.ownerLabel(club)[0], `${G.FIN.fmtM(f.ownLeft || 0)} из ${G.FIN.fmtM(G.FIN.ownerCap(club))}`, `столько владелец ещё готов вложить в этом сезоне — ${G.FIN.ownerLabel(club)[1]}`),
        f.embargo ? kpi('⛔ Запрет на регистрацию', 'Долг ' + G.FIN.fmtM(-f.balance), `снимут, когда долг станет меньше ${G.FIN.fmtM(G.FIN.debtLimit(club) / 2)}; внешнее управление — при долге ${G.FIN.fmtM(G.FIN.debtLimit(club) * 3)}`, 'neg') : null,
        f.para ? kpi('«Парашют»', G.FIN.fmtM(f.para[0]) + ' в этом сезоне', f.para.length > 1 ? `ещё ${f.para.slice(1).map(v => '£' + v + ' млн').join(', ')} в следующих` : 'последний год выплат', 'ok') : null
      ]);
      wrap.appendChild(kpis);
      if (own) {
        const seg = el('div.seg.wrap');
        G.FIN.PRICES.forEach(m => seg.appendChild(el('button' + (m === (st.ticketM || 1) ? '.on' : ''), { text: `×${m} · £${Math.round(G.FIN.ticket(club) * m)}`, onclick: (e) => {
          st.ticketM = m;
          LEAGUE.weekFixtures(st).forEach(fx => { if (!fx.res && fx.h === club.id && fx.env && !fx.neutral) G.FIN.setPrice(st, fx, m); });
          LEAGUE.save(st);
          U.$$('button', seg).forEach(b => b.classList.toggle('on', b === e.currentTarget));
        } })));
        wrap.appendChild(el('div.card.price-default', null, [el('h3', { text: '🎟 Цена билетов по умолчанию' }),
          el('p.muted', { text: 'Дорогие билеты приносят больше денег, но часть болельщиков останется дома — поддержка трибун и домашнее преимущество слабеют. Престижному клубу и в важных матчах болельщики прощают высокие цены. Перед каждым домашним матчем цену можно изменить с прогнозом заполняемости и выручки.' }), seg]));
      }
      const grid = el('div.fin-grid');
      // доходы и расходы
      const led = el('div.card', null, [el('h3', { text: `Сезон ${st.seasonName}: доходы и расходы` })]);
      const rows = [['Телеправа', s.tv, 'Равная доля каждую неделю (+ «парашют» после вылета) + премия за место в конце сезона'], ['Билеты', s.gate, 'Каждый домашний матч: вместимость × посещаемость × цена билета'], ['Спонсоры', s.comm, 'Зависят от статуса клуба'], ['Призовые', s.prize, 'В конце сезона: место в таблице (в АПЛ — ещё и еврокубки за 1–6 места)'], ['Зарплаты', s.wages, `Каждую неделю календаря: ведомость × 52 / ${LEAGUE.weeks(st)} недель сезона`], ['Операционные', s.ops, 'Персонал, инфраструктура, поездки, штрафы игроков'], ['Трансферы', s.transfers || 0, 'Покупки (−) и продажи (+) игроков'], ['Владелец', s.owner || 0, 'Взносы владельца: покрывают минус на балансе в пределах его возможностей на сезон']];
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
      const ch = el('div.card', null, [el('h3', { text: 'Баланс по неделям' })]);
      const h = f.hist.slice(-40);
      if (h.length > 1) {
        const w = 300, hh = 90, mn = Math.min(0, ...h), mx = Math.max(...h), rng = mx - mn || 1;
        const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(hh - (v - mn) / rng * (hh - 10) - 5).toFixed(1)}`).join(' ');
        const zero = hh - (0 - mn) / rng * (hh - 10) - 5;
        ch.appendChild(el('div', { html: `<svg viewBox="0 0 ${w} ${hh}" class="fin-chart" preserveAspectRatio="none"><line x1="0" x2="${w}" y1="${zero}" y2="${zero}" stroke="rgba(255,255,255,.2)" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="#00ff87" stroke-width="2.5" stroke-linejoin="round"/></svg>` }));
        ch.appendChild(el('div.muted.small-note', { text: `от ${G.FIN.fmtM(h[0])} до ${G.FIN.fmtM(h[h.length - 1])}` }));
      } else ch.appendChild(el('div.muted', { text: 'График появится после первых недель.' }));
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
          el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]), el('td.pname', null, [UI.face(p, 24, club), ' ' + p.name + (p.star ? ' ★ ' : ' '), UI.traitIcons(p)]), el('td', { text: p.age }),
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
        UI.modal({ title: 'Переговоры о контракте', content: el('div.renew', null, [el('div.pc-name', null, [UI.pname(p)]), el('p', { text: d.refuse }), el('div.agent', null, G.FIN.agentNotes(p, club).map(t => el('div', { text: '💬 ' + t })))]), buttons: [{ text: 'Понятно', cls: 'ghost' }] });
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
      content.append(el('div.pc-head', null, [el('div', null, [el('div.pc-name', null, [UI.pname(p)]), el('div.pc-sub', { text: `${UI.posName(p.pos)} · ${p.age} лет · рейтинг ${TAC.overall(p).toFixed(1)} · стоимость ${G.FIN.fmtM(G.FIN.value(p))}` })])]),
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
      const st = this.st, lid = this.vlg();
      const seg = this.leagueSeg(lid);
      const sub = el('div.seg');
      [['lead', 'Лидеры'], ['totw', 'Сборная тура'], ['tots', 'Сборная чемпионата']].forEach(([k, n]) => sub.appendChild(el('button' + ((this._statSub || 'lead') === k ? '.on' : ''), { text: n, onclick: () => { this._statSub = k; this.hub(); } })));
      body.appendChild(el('div.card.seg-card.stat-segs', null, [seg, sub]));
      if (this._statSub === 'totw' || this._statSub === 'tots') return this.teamXI(body, lid, this._statSub);
      const grid = el('div.stats-grid');
      const all = [];
      const played = (LEAGUE.standings(st, lid)[0] || { p: 0 }).p;
      LEAGUE.leagueClubs(st, lid).forEach(c => c.players.forEach(p => all.push({ p, c })));
      const block = (title, arr, val) => {
        const b = el('div.card', null, [el('h3', { text: title })]);
        arr.forEach((x, i) => b.appendChild(el('div.mini-row', { onclick: () => UI.playerModal(x.p, x.c) }, [el('span.pos', { text: i + 1 }), UI.crest(x.c, 18), el('span.nm', { text: x.p.name }), el('b', { text: val(x) })])));
        if (!arr.length) b.appendChild(el('div.muted', { text: 'Пока нет данных' }));
        return b;
      };
      grid.appendChild(block('Бомбардиры', all.filter(x => x.p.st.goals).sort((a, b) => b.p.st.goals - a.p.st.goals || a.p.st.apps - b.p.st.apps).slice(0, 12), x => x.p.st.goals));
      grid.appendChild(block('Ассистенты', all.filter(x => x.p.st.assists).sort((a, b) => b.p.st.assists - a.p.st.assists).slice(0, 12), x => x.p.st.assists));
      grid.appendChild(block('Лучшие оценки', all.filter(x => x.p.st.apps >= Math.max(1, Math.floor(played / 3))).sort((a, b) => b.p.st.rsum / b.p.st.apps - a.p.st.rsum / a.p.st.apps).slice(0, 12), x => (x.p.st.rsum / x.p.st.apps).toFixed(2)));
      grid.appendChild(block('Жёлтые карточки', all.filter(x => x.p.st.yc).sort((a, b) => b.p.st.yc - a.p.st.yc).slice(0, 12), x => x.p.st.yc));
      body.appendChild(grid);
    },

    /* Сборная тура / чемпионата: поле 4-3-3 с лицами, гербами и оценками */
    teamXI(body, lid, kind) {
      const st = this.st;
      const find = (id, cid) => {
        for (const c of st.clubs) { const p = c.players.find(x => x.id === id); if (p) return { p, c }; }
        const p = (st.fa || []).find(x => x.id === id);
        return p ? { p, c: st.clubs.find(c => c.id === cid) || { id: '_fa', name: 'Свободный агент', c1: '#444', c2: '#888', short: 'FA' } } : null;
      };
      const card = el('div.card.xi-card');
      let data, title, sub;
      if (kind === 'totw') {
        data = LEAGUE.teamOfWeek(st, lid, this._totwWeek);
        if (!data) { card.appendChild(el('div.muted', { text: 'Туры ещё не сыграны — сборная тура появится после первого тура.' })); body.appendChild(card); return; }
        const idx = data.weeks.indexOf(data.week);
        const go = d => { this._totwWeek = data.weeks[idx + d]; this.hub(); };
        title = 'Сборная тура';
        sub = el('div.xi-nav', null, [
          el('button.btn.small.ghost', { text: '◀', disabled: idx <= 0, onclick: () => go(-1) }),
          el('b', { text: `${LEAGUE.weekLabel(st, lid, data.week)} · неделя ${data.week + 1}` }),
          el('button.btn.small.ghost', { text: '▶', disabled: idx >= data.weeks.length - 1, onclick: () => go(1) })
        ]);
      } else {
        data = LEAGUE.teamOfSeason(st, lid);
        title = 'Сборная чемпионата';
        sub = el('small.muted', { text: data.played ? `Средняя оценка за сезон · не меньше ${data.min} ${U.plural(data.min, 'матча', 'матчей', 'матчей')} в лиге (сыграно туров: ${data.played})` : 'Сезон ещё не начался' });
        if (!data.xi.length) { card.appendChild(el('h3', { text: title })); card.appendChild(sub); body.appendChild(card); return; }
      }
      card.appendChild(el('div.xi-head', null, [el('h3', null, [`${title} · ${LEAGUE.leagueInfo(st, lid).name} `, data.scheme ? el('span.xi-scheme', { text: data.scheme }) : null]), sub]));
      const pitch = el('div.xi-pitch');
      pitch.appendChild(el('div.xi-lines', { html: '<i class="h"></i><i class="c"></i><i class="b1"></i><i class="b2"></i>' }));
      for (const pos of ['FW', 'MF', 'DF', 'GK']) {
        const row = el('div.xi-row');
        data.xi.filter(e => e.pos === pos).forEach(e => {
          const f = find(e.id, e.c); if (!f) return;
          const c = st.clubs.find(x => x.id === e.c) || f.c;
          const nm = f.p.name.split(' '), last = nm.slice(1).join(' ') || nm[0];
          const r = e.r;
          row.appendChild(el('div.xi-p', { onclick: () => UI.playerModal(f.p, f.c), title: `${f.p.name} — ${c.name}` }, [
            el('div.xi-av', null, [UI.face(f.p, 58, c), el('span.xi-crest', null, [UI.crest(c, 22)]), el('b.xi-r', { text: r.toFixed(kind === 'totw' ? 1 : 2), style: { background: r >= 8 ? '#00c46a' : r >= 7 ? '#8bc34a' : r >= 6.5 ? '#c9a800' : '#e0702a' } })]),
            el('div.xi-nm', null, [el('small', { text: nm.length > 1 ? nm[0] : '' }), el('span', { text: last })]),
            (e.g || e.a) ? el('div.xi-ga', { text: (e.g ? '⚽' + (e.g > 1 ? '×' + e.g : '') : '') + (e.a ? ' 🅰' + (e.a > 1 ? '×' + e.a : '') : '') }) : null
          ]));
        });
        pitch.appendChild(row);
      }
      card.appendChild(pitch);
      body.appendChild(card);
    },

    tabSquad(body) {
      const st = this.st;
      const uc = st.userClub ? LEAGUE.club(st, st.userClub) : null;
      const club = this.squadClub && LEAGUE.club(st, this.squadClub) || uc || LEAGUE.leagueClubs(st, this.vlg())[0];
      const own = uc && club === uc;
      const wrap = el('div.squad-wrap');
      const pl = this._pickLg && st.leagues[this._pickLg] ? this._pickLg : club.league;
      const seg = this.leagueSeg(pl, l => { this._pickLg = l; this._vlg = l; this.squadClub = null; this.hub('squad'); });
      if (seg) wrap.appendChild(seg);
      const picker = el('div.club-picker');
      LEAGUE.leagueClubs(st, pl).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
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
        wrap.appendChild(el('div.card.coach-card', null, [UI.crest(club, 64), el('div', null, [el('h3', { text: club.name }), el('b', { text: `Тренер: ${c.name} (${c.nat})` }), UI.coachTraits(c), el('p', { text: c.motto }),
          el('div.cd-tags', null, [el('span', { text: `⭐ Престиж ${Math.round(G.FIN.pres(club))} · ${G.FIN.presLabel(G.FIN.pres(club))}` }), el('span', { text: 'Схемы: ' + c.formations.join(', ') }), el('span', { text: TAC.PLANS[c.plan].icon + ' ' + TAC.PLANS[c.plan].n }), el('span', { text: 'Менталитет ' + TAC.MENTALITY[Math.round(c.mentality)] }), el('span', { text: 'Прессинг ' + TAC.PRESSING[Math.round(c.pressing)] }), el('span', { text: 'Гибкость ' + Math.round(c.adapt * 100) + '%' }), el('span', { text: 'Мастерство ' + Math.round(c.skill * 100) + '%' })])])]));
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
        tbl.appendChild(el('thead', null, [el('tr', null, cols.map(([k, n]) => el('th' + (k === sortK ? '.on' : ''), { text: n, 'data-tip': G.DATA.ATTRS.find(a => a.k === k) ? UI.attrTip(G.DATA.ATTRS.find(a => a.k === k)) : null, onclick: () => { if (sortK === k) dir = -dir; else { sortK = k; dir = (k === 'pos' || k === 'name') ? 1 : -1; } render(); } })))]));
        const tb = el('tbody');
        club.players.slice().sort((a, b) => { const x = get(a, sortK), y = get(b, sortK); return (x > y ? 1 : x < y ? -1 : 0) * dir; }).forEach(p => {
          const tr = el('tr' + (TAC.available(p) ? '' : '.unavail'), { onclick: () => UI.playerModal(p, club) });
          tr.appendChild(el('td', null, [el('span.bp-pos', { text: UI.posShort(p.pos) })]));
          tr.appendChild(el('td.pname', null, [p.name + (p.star ? ' ★' : '') + (p.inj > 0 ? ' ✚' : '') + (p.susp > 0 ? ' 🟥' : '') + (p.csusp > 0 ? ' 🏆🟥' : '') + (p.loan ? ' 🤝' : '') + (p.academy === club.id ? ' 🎓' : '') + (p.retiring ? ' 👴' : '') + ' ', UI.traitIcons(p)]));
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
        el('p', { text: 'Клуб получает телеправа и спонсорские деньги каждую неделю, выручку от билетов — за домашние матчи, призовые — в конце сезона (зависят от места, 1–6 места дают еврокубковые премии). Расходы — зарплаты и операционные траты. Стоимость игрока зависит от рейтинга, возраста, формы, оценок, особенностей и срока контракта. Продлевайте контракты в разделе «Финансы»: игрок называет требования, а совет директоров не даст выйти за бюджет зарплат. Непродлённые игроки летом уходят бесплатно. Совет следит за местом относительно цели и за финансами.' }),
        el('p', { text: 'Почти все клубы ниже АПЛ тратят больше, чем зарабатывают, — разницу покрывает владелец. У каждого клуба свой владелец: миллиардер гасит почти любые убытки, а у «владельца без денег» клуб должен жить по средствам (сколько он ещё готов вложить в этом сезоне — во вкладке «Финансы»). Если денег владельца не хватает и долг растёт, лига запрещает регистрировать новых игроков (порог: £40 млн в АПЛ, £12 млн в Чемпионшипе, £5 млн в Первой лиге): нельзя покупать и брать в аренду, а свободных агентов — только с зарплатой до £12 тыс./нед. При долге втрое выше порога клуб уходит во внешнее управление: −12 очков, кредиторы списывают часть долга, зарплаты урезаются на 20%, лучших игроков выставляют на продажу, клуб покупает новый владелец. Клубы-ИИ в долгах переходят в режим экономии: продают самых высокооплачиваемых игроков, расторгают контракты с дорогими запасными и продлевают только молодых лидеров со скидкой. Свободные агенты без клуба стареют и теряют форму, возрастные и слабые завершают карьеру.' }),
        el('p', { text: 'У каждого игрока есть скрытый характер — амбиции, преданность, профессионализм и темперамент. Цифр не видно, но их выдают реплики агента в переговорах и мнение тренерского штаба в карточке. Амбициозные просят больше и упорнее торгуются, а если переросли клуб — хотят уйти; преданные идут на уступки; профессионалы лучше прогрессируют и быстрее восстанавливаются; вспыльчивые жалуются в прессе на скамейку. Настроение игрока зависит от игрового времени и результатов и влияет на переговоры.' }),
        el('h4', { text: 'Лиги: Премьер-лига, Чемпионшип, Первая лига' }),
        el('p', { text: 'В игре три дивизиона английского футбола, сезон в них идёт одновременно по общему календарю недель. В Чемпионшипе и Первой лиге по 24 клуба и 46 туров, поэтому в Премьер-лиге (38 туров) бывают недели без матчей — команда отдыхает, игровое время и доверие совета в такие недели не меняются. Из АПЛ и Чемпионшипа вылетают по три клуба; в Чемпионшипе и Первой лиге первые два клуба выходят напрямую, а 3–6 места разыгрывают третью путёвку в плей-офф (полуфиналы и финал на «Уэмбли», ничья — серия пенальти). У каждой лиги своя экономика: чем ниже дивизион, тем скромнее телеправа, билеты и спонсоры (еврокубки — только в АПЛ). Вылетевшие клубы два сезона получают «парашютные» выплаты (£40 и £30 млн), а зарплаты их игроков по пункту о вылете снижаются на 25% — амбициозные игроки этим недовольны. Совет директоров особенно ценит повышение в классе и очень болезненно воспринимает вылет. Покупать и брать в аренду можно игроков из любой лиги: амбициозные звёзды неохотно идут в клуб дивизионом ниже, а молодёжь грандов охотно едет в Чемпионшип за игровой практикой.' }),
        el('h4', { text: 'Кубок Англии и нагрузка' }),
        el('p', { text: 'Кубок Англии разыгрывают все 68 клубов на выбывание (ничья — серия пенальти). Самые слабые клубы Первой лиги начинают с 1-го раунда, остальные вступают в 3-м. Полуфиналы и финал — на «Уэмбли». Раунды назначены на свободные недели Премьер-лиги, а у Чемпионшипа и Первой лиги кубковая неделя становится двойной: матч в середине недели, затем матч лиги, и между ними команда восстанавливается лишь наполовину. Тренеры-ИИ ротируют состав в кубке: чем сильнее клуб относительно соперника, тем больше игроков отдыхает (в полуфинале и финале — сильнейший состав), поэтому кубок богат сенсациями. Вы можете выставить отдельный кубковый состав — кнопка «Резерв от ассистента» перед матчем — основа на лигу при этом не меняется. Кубковые матчи дают игровое время запасным, призовые и половину выручки от билетов даже проигравшему. Уставшие игроки (свежесть ниже 70%) травмируются заметно чаще, а совсем вымотанные могут получить мышечную травму без контакта. Если травму получает ваш игрок, матч останавливается и вам предлагают сделать замену.' }),
        el('p', { text: 'Трибуны и цена билетов. Домашнее преимущество во многом создают болельщики: полный стадион давит на гостей — у них падает хладнокровие (меньше удачных решающих моментов, хуже удары), они чаще нервно фолят, судья охотнее показывает им карточки и ставит пенальти в их ворота. Эффект нарастает к аншлагу и больше на крупных аренах: разница между заполнением ~75% и полным стадионом — примерно 0.13 очка за домашний матч. Дорогие билеты дают больше денег, но часть болельщиков останется дома. Цену можно выбрать перед каждым домашним матчем; ИИ взвешивает свои финансы и важность матча. Престиж клуба растёт от трофеев и успехов и поднимает спонсорские доходы, спрос на билеты, интерес игроков и уровень академии.' }),
        el('p', { text: 'Болельщики. У каждого клуба своё настроение трибун: оно растёт от побед, побед в дерби (матчи соседей и давних соперников), кубковых сенсаций, громких покупок и дешёвых билетов и падает от поражений, продажи звёзд и дорогих билетов. Довольные болельщики заполняют стадион и давят на гостей сильнее, недовольные остаются дома, а совет директоров следит за их настроением. Провальная серия может затянуть в петлю «пустые трибуны — нет поддержки — новые поражения»: разорвать её помогают победа в дерби, громкий трансфер или дешёвые билеты. Владелец. Амбициозный владелец при деньгах выделяет средства на трансферы, но поднимает планку совета; владелец без амбиций ставит скромные цели. После внешнего управления новый владелец приходит со своими требованиями. Погода и особенности: техничным игрокам (импровизаторы, финтёры, мастера техничного удара, распасовщики) непогода мешает сильнее, силовым и выносливым — меньше, а жёсткий отбор, игра головой и пушечный удар на вязком поле даже в плюсе. Ветер мешает навесам, дальним ударам и стандартам. Тренеры-ИИ учитывают это при выборе состава.' }),
        el('p', { text: 'Настроение влияет на поведение на поле, а не на мастерство (за мастерство отвечает форма). Счастливые игроки больше работают без мяча — в отборе и позиционной обороне. Недовольные «филонят» и окончательно выключаются, если команда проигрывает в два мяча; их игра становится нестабильной. Обиженные вспыльчивые игроки чаще фолят и получают карточки. Кубковые матчи засчитываются в развитие: игровое время в кубке (с коэффициентом 0.8) и оценки идут в зачёт роста в межсезонье.' }),
        el('h4', { text: 'Трансферы' }),
        el('p', { text: 'Летнее окно открыто перед сезоном и в первые недели, зимнее — в середине сезона (точные сроки — на главной и во вкладке «Трансферы»). Покупка идёт в два шага: сначала договоритесь с клубом о сумме (он может принять, назвать свою цену или отказать; ключевые игроки топ-клубов не продаются), затем — с игроком о зарплате и сроке: амбициозные просят больше и не хотят в клуб скромнее, преданные не хотят уходить из своего. Трансферный бюджет выделяет совет директоров, 70% от продаж возвращается в него. Выставляйте игроков на трансфер — клубы будут присылать предложения; недовольные игроки сами просят о трансфере. Клубы-ИИ торгуют и между собой: закрывают слабые позиции и ищут игроков под идею тренера.' }),
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
