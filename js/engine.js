/* Движок матча: футбол, разыгрываемый ходами в «3 в ряд».
   Поле разбито на 5 зон (0 — штрафная хозяев, 4 — штрафная гостей).
   Команда с мячом копит «темп» и продвигается к воротам, обороняющаяся — прессингует и строит щит. */
(function (G) {
  'use strict';
  const U = G.U, TAC = G.TAC, BOARD = G.BOARD, TRAITS = G.TRAITS;
  const TL = TRAITS.LIST;

  const CFG = {
    zoneCost: 32,          // темп для перехода в следующую зону
    base: { pas: 9, dri: 8, pac: 7 },
    pressBase: 16,
    shieldBase: 9,
    shieldCap: 100,
    boxShot: 0.2, boxShotPerGem: 0.06,
    longShot: 0.07, longShotPerGem: 0.03,
    header: 0.13,
    foulBase: 0.15,
    drain: 0.75,
    autoShot: 60
  };

  const PHASE = rp => rp <= 1 ? 'back' : rp === 2 ? 'mid' : 'front';
  const OTHER = s => s === 'home' ? 'away' : 'home';
  const R = (a, b) => U.clamp(Math.pow((a + 6) / (b + 6), 1.35), 0.5, 1.9);
  const ZONE_TXT = ['у своей штрафной', 'на своей половине', 'в центре поля', 'на половине соперника', 'в штрафной соперника'];
  const ATK_M = [0.86, 1, 1.14], DEF_M = [1.15, 1, 0.88];
  /* Погода: поправки к характеристикам, расход сил и эффективность планов */
  const WEATHER = {
    clear: { n: 'Ясно', i: '☀️', attr: {}, drain: 1, plan: {}, d: 'Идеальные условия' },
    rain: { n: 'Дождь', i: '🌧', attr: { dri: -1, pas: -0.5 }, drain: 1.05, plan: { possession: 0.96, direct: 1.03 }, d: 'Скользкий мяч мешает технике, выгоднее играть проще' },
    heavy: { n: 'Тяжёлое поле', i: '🟫', attr: { dri: -1.5, pas: -1, pac: -1 }, drain: 1.2, plan: { possession: 0.93, gegenpress: 0.96, direct: 1.05, park: 1.03 }, d: 'Вязкий газон: техника и скорость страдают, силы уходят быстрее' },
    wind: { n: 'Сильный ветер', i: '💨', attr: { sho: -1, pas: -0.5 }, drain: 1, plan: { wings: 0.94, direct: 0.97, counter: 1.03, possession: 1.02 }, d: 'Навесы и дальние удары летят мимо, лучше короткий пас' },
    snow: { n: 'Снег', i: '❄️', attr: { dri: -1, pac: -1, pas: -0.5 }, drain: 1.1, plan: { possession: 0.95, direct: 1.03, counter: 0.97 }, d: 'Мяч вязнет, скорость и обводка падают' }
  };
  /* Давление трибун на гостей (0..~1.6): нарастает к аншлагу, больше на крупных аренах; нейтральное поле — 0 */
  function crowdOf(env) {
    if (env && env.neutral) return 0;
    const cf = !env ? 0.85 : (env.fill == null ? 0.9 : env.fill);
    const fk = env && env.fans != null ? 0.75 + env.fans / 220 : 1;   // настроение болельщиков: 0 → ×0.75, 100 → ×1.2
    return 1.55 * Math.pow(cf, 2.5) * U.clamp(0.6 + ((env && env.cap) || 30) / 100, 0.6, 1.25) * fk;
  }
  function crowdLabel(c) { return c >= 1.05 ? 'ревущий аншлаг' : c >= 0.75 ? 'сильное' : c >= 0.45 ? 'заметное' : c > 0.1 ? 'слабое' : 'нет'; }
  /* Чувствительность игрока к погоде: техничным тяжелее, силовым и выносливым легче,
     а на вязком поле жёсткий отбор, игра головой и пушечный удар даже в плюсе. Ветер мешает навесам и дальним ударам */
  const WX_TECH = ['flair', 'dribbler', 'finesse', 'holder', 'tempo', 'vision', 'distributor'];
  const WX_PHYS = ['iron', 'engine', 'presser', 'wingMotor', 'hard', 'aerial', 'powerShot'];
  const WX_MUD = ['hard', 'aerial', 'powerShot'];
  const WX_WIND = ['crosser', 'longShots', 'aerial', 'setpiece'];
  function wxSens(p, weather) {
    if (!weather || weather === 'clear') return 1;
    const tr = p.tr || [], has = l => tr.some(t => l.includes(t));
    if (weather === 'wind') return has(WX_WIND) ? 1.8 : 1;
    if (has(WX_TECH)) return 1.7;
    if ((weather === 'heavy' || weather === 'rain') && has(WX_MUD)) return -0.4;
    if (has(WX_PHYS) || p.a.sta >= 16) return 0.4;
    return 1;
  }
  /* Домашнее преимущество: чем полнее и больше арена, тем сильнее поддержка (нейтральное поле — 0).
     Делится поровну: хозяева атакуют сильнее, гости — слабее, общее число голов почти не меняется */
  function homeK(env) {
    if (!env) return 1.07;
    if (env.neutral) return 1;
    const loud = U.clamp(0.6 + (env.cap || 30) / 100, 0.6, 1.25);
    return 1 + 0.08 * (env.fill == null ? 0.9 : env.fill) * loud;
  }
  const PRESS_M = [0.82, 1, 1.2], PRESS_DRAIN = [0.8, 1, 1.3];

  class TeamState {
    constructor(side, club, tactics, ctrl) {
      this.side = side; this.club = club; this.coach = club.coach; this.ctrl = ctrl || 'ai';
      this.tac = U.clone(tactics);
      const map = TAC.playerMap(club);
      const slots = TAC.FORMATIONS[this.tac.formation];
      this.onPitch = slots.map((s, i) => ({ slot: s, p: map[this.tac.lineup[i]] || null }));
      this.bench = this.tac.bench.map(id => map[id]).filter(Boolean);
      this.used = new Set(this.onPitch.filter(x => x.p).map(x => x.p.id));
      this.subsLeft = 5;
      this.shield = 15; this.pressure = 0; this.shotCharge = 0; this.counterCharge = 0;
      this.st = { shots: 0, onT: 0, xg: 0, goals: 0, passes: 0, wins: 0, fouls: 0, yc: 0, rc: 0, corners: 0, poss: 0, offsides: 0, saves: 0, gems: [0, 0, 0, 0, 0, 0] };
      this.onPitch.forEach(x => { if (x.p) Match.initPlayer(x.p, side); });
      this.bench.forEach(p => Match.initPlayer(p, side));
      this.redCount = 0;
      this.notes = []; // решения тренера (для интерфейса)
    }
    players() { return this.onPitch.filter(x => x.p).map(x => x.p); }
    gk() {
      const x = this.onPitch.find(o => o.p && o.slot.role === 'GK');
      return x ? x.p : null;
    }
  }

  class Match {
    static initPlayer(p, side) {
      p.m = { side, fit: p.fit, perf: 0, goals: 0, assists: 0, yc: 0, rc: false, off: false, inj: false, played: false, saves: 0, shift: 0 };
      if (TRAITS.has(p, 'inconsistent')) p.m.shift = U.rnd() < 0.5 ? 2 : -2;
      p.m.formB = TAC.formBonus(p);
      // настроение: влияет не на мастерство (за него отвечает форма), а на поведение
      const mood = p.mood == null ? 60 : p.mood, tem = p.h ? p.h.tem : 10;
      p.m.mood = mood;
      if (mood < 35 && !p.m.shift) p.m.shift = U.rnd() < 0.5 ? 1 : -1;       // нестабильность: может и блеснуть, и провалиться
      p.m.hot = mood < 35 && tem >= 12 ? 1 + (tem - 11) * 0.08 : 1;          // обиженный вспыльчивый чаще фолит
      p.m.temK = 1 + (tem - 10) * 0.02;                                          // темперамент: ±20% к фолам у крайних значений
    }
    /* Реплики о трибунах: в начале матча и изредка по ходу */
    crowdSay() {
      if (!this.log || !this.env || this.env.neutral) return;
      const c = this.crowd, H = this.t.home.club.name;
      if (!this._crowdSaid) {
        this._crowdSaid = true;
        const t = c >= 1.05 ? `Аншлаг! Стадион «${H}» ревёт — гостям здесь будет очень непросто.` : c >= 0.75 ? `Трибуны почти полны и заряжены — хозяевам есть на кого опереться.` : this.boo > 0 ? `Полупустой стадион, тишина... Болельщики «${H}» проголосовали ногами — и свистят своим.` : `Трибуны заполнены не до конца — атмосфера сдержанная.`;
        this.say('info', t, 'home');
        return;
      }
      if (U.rnd() < 0.03) {
        if (c >= 0.9) this.say('info', U.pick(['Стадион поёт, не умолкая ни на секунду.', 'Гул трибун давит на гостей — они спешат и ошибаются.', 'Болельщики встают со своих мест — хозяева прибавляют.']), 'home');
        else if (this.boo > 0.4) this.say('info', U.pick(['С трибун доносится свист — игроки «' + H + '» нервничают.', 'Пустые ряды и редкие аплодисменты — поддержки не чувствуется.']), 'home');
      }
    }
    /* Командный множитель фолов: темперамент игроков на поле и обиженные вспыльчивые */
    hotK(side) { const ps = this.t[side].onPitch.filter(x => x.p); return ps.length ? ps.reduce((a, x) => a + (x.p.m.hot || 1) * (x.p.m.temK || 1), 0) / ps.length : 1; }
    /* Самоотдача без мяча (отбор, позиционная игра): счастливые бьются, обиженные «выключаются» при плохом счёте */
    effort(p) {
      const mood = p.m.mood;
      if (mood == null) return 0;
      let e = mood >= 80 ? 0.75 : mood < 20 ? -1.5 : mood < 35 ? -1 : 0;
      if (mood < 35 && this.score[OTHER(p.m.side)] - this.score[p.m.side] >= 2) e -= 0.75;
      return e;
    }

    constructor(cfg) {
      this.cfg = cfg;
      this.rng = cfg.rng || Math.random;
      this.H = cfg.turns || 24; // ходов (суммарно на обе команды) в тайме
      this.log = !!cfg.log;
      this.interactive = !!cfg.interactive;
      this.env = cfg.env || null;
      this.wx = WEATHER[(this.env && this.env.weather) || 'clear'] || WEATHER.clear;
      this.homeK = homeK(this.env);
      // давление трибун (0 — пусто или нейтральное поле, ~1 — ревущий аншлаг на большой арене)
      // нарастает к аншлагу: полупустые трибуны почти не давят, ревущий полный стадион — сильно
      this.crowd = crowdOf(this.env);
      // свист пустых трибун: ниже половины заполнения хозяевам самим неуютно
      const fill0 = this.env && !this.env.neutral && this.env.fill != null ? this.env.fill : 1;
      this.boo = fill0 < 0.5 ? (0.5 - fill0) * 4 : 0;
      this.t = {
        home: new TeamState('home', cfg.home.club, cfg.home.tactics, cfg.home.ctrl),
        away: new TeamState('away', cfg.away.club, cfg.away.tactics, cfg.away.ctrl)
      };
      this.t.home.players().concat(this.t.away.players()).forEach(p => { p.m.played = true; });
      this.oppR = { home: TAC.teamRating(cfg.away.club), away: TAC.teamRating(cfg.home.club) };
      this.board = new BOARD.Board(8, this.rng);
      this.board.fill();
      this.ball = 2; this.poss = 'home'; this.mom = 0;
      this.counter = null; this.setPiece = null;
      this.half = 1; this.moveInHalf = 0;
      this.added = [U.randInt(1, 2), U.randInt(1, 4)];
      this.cur = 'home';
      this.score = { home: 0, away: 0 };
      this.goals = [];
      this.events = [];
      this.over = false;
      this.pending = null;
      this.halftime = false;
      this.extraStreak = 0;
      this.moveNo = 0;
      this.lastMoveSide = null;
      this.momentumHistory = [];
      this.say('whistle', 'Стартовый свисток! Матч начался.', null);
      if (G.AI) { G.AI.matchStart(this, 'home'); G.AI.matchStart(this, 'away'); }
    }

    /* ---------- справочные функции ---------- */
    rp(side) { return side === 'home' ? this.ball : 4 - this.ball; }
    other(s) { return OTHER(s); }
    minute() {
      const H = this.H, base = this.half === 1 ? 0 : 45;
      if (this.moveInHalf < H) return base + Math.floor(45 * this.moveInHalf / H) + 1;
      return base + 45;
    }
    minuteLabel() {
      const H = this.H;
      if (this.moveInHalf < H) return this.minute() + "'";
      return (this.half === 1 ? 45 : 90) + '+' + (this.moveInHalf - H + 1) + "'";
    }
    progress() {
      const H = this.H;
      const done = (this.half - 1) * H + Math.min(this.moveInHalf, H);
      return U.clamp(done / (2 * H), 0, 1);
    }

    fatF(p) { return 0.72 + 0.28 * (p.m.fit / 100); }
    /* Травма: у ИИ — вынужденная замена сразу, у живого игрока — пауза с предложением замены */
    onInjury(side, p) {
      if (this.t[side].ctrl === 'human' && this.interactive) { this.injPending = { side, p }; return; }
      if (G.AI) G.AI.handleInjury(this, side, p);
    }
    /* Усталость повышает риск травмы: ниже 70% свежести — до ×3 при 30% */
    fatInj(p) { return p.m.fit >= 70 ? 1 : 1 + (70 - p.m.fit) / 20; }

    /* ---------- особенности игроков ---------- */
    cond(side, w) {
      if (!w) return true;
      const min = this.minute(), d = this.score[side] - this.score[OTHER(side)];
      switch (w) {
        case 'losing': return d < 0;
        case 'losingLate': return d < 0 && min >= 70;
        case 'winningLate': return d > 0 && min >= 70;
        case 'lateNotWinning': return d <= 0 && min >= 70;
        case 'clutch': return min >= 75;
        case 'early': return this.half === 1 && min < 25;
        case 'strongOpp': return this.oppR[side] >= 16;
        case 'weakOpp': return this.oppR[side] <= 14.5;
        case 'away': return side === 'away';
      }
      return false;
    }
    /* Эффективная характеристика игрока с учётом особенностей */
    pa(p, k) {
      let v = p.a[k];
      const side = p.m ? p.m.side : 'home';
      for (const id of (p.tr || [])) {
        const t = TL[id];
        if (!t) continue;
        if (t.attr && this.cond(side, t.when)) v += (t.attr[k] || 0) + (t.attr.all || 0);
        if (t.attrHome) v += side === 'home' ? t.attrHome : -t.attrHome;
        if (id === 'flatTrack' && this.cond(side, 'strongOpp')) v -= 1;
      }
      if (p.m && p.m.shift) v += p.m.shift;
      if (p.m && p.m.formB) v += p.m.formB;
      if (this.wx.attr[k]) { if (p.m && p.m.wxs == null) p.m.wxs = wxSens(p, this.env && this.env.weather); v += this.wx.attr[k] * (p.m ? p.m.wxs : 1); }
      if (p.m && (k === 'tac' || k === 'pos')) v += this.effort(p);
      // трибуны давят на гостей: хладнокровие падает; хозяев поддерживают
      if (p.m && k === 'com') v += p.m.side === 'away' ? -this.crowd * 3.2 : this.crowd * 0.8 - this.boo;
      return U.clamp(v, 1, 22);
    }
    /* Командный множитель (произведение по игрокам на поле) */
    tmul(side, key) {
      let m = 1;
      for (const x of this.t[side].onPitch) {
        if (!x.p || !x.p.tr) continue;
        for (const id of x.p.tr) { const t = TL[id]; if (t && t.team && t.team[key] != null && this.cond(side, t.when)) m *= t.team[key]; }
      }
      return m;
    }
    tadd(side, key) {
      let a = 0;
      for (const x of this.t[side].onPitch) {
        if (!x.p || !x.p.tr) continue;
        for (const id of x.p.tr) { const t = TL[id]; if (t && t.team && t.team[key] != null && this.cond(side, t.when)) a += t.team[key]; }
      }
      return a;
    }
    /* Личные модификаторы игрока */
    pm(p, key) {
      let m = 1;
      if (p && p.tr) for (const id of p.tr) { const t = TL[id]; if (t && t.me && t.me[key] != null && this.cond(p.m ? p.m.side : 'home', t.when)) m *= t.me[key]; }
      return m;
    }
    padd(p, key) {
      let a = 0;
      if (p && p.tr) for (const id of p.tr) { const t = TL[id]; if (t && t.me && t.me[key] != null && this.cond(p.m ? p.m.side : 'home', t.when)) a += t.me[key]; }
      return a;
    }
    withTrait(side, id) { return this.t[side].onPitch.filter(x => x.p && TRAITS.has(x.p, id)).map(x => x.p); }
    traitNote(p, id) { return `${TL[id].i} ${p.name}`; }

    val(side, attr, phase) {
      const ts = this.t[side];
      let s = 0, w = 0;
      for (const x of ts.onPitch) {
        if (!x.p || x.slot.role === 'GK') continue;
        const role = TAC.ROLES[x.slot.role];
        const wt = role.w[phase];
        if (wt <= 0) continue;
        const suit = Math.sqrt(TAC.lineSuit(x.p.pos, role.line));
        s += wt * this.pa(x.p, attr) * this.fatF(x.p) * suit;
        w += wt;
      }
      return w ? s / w : 5;
    }
    numF(side, phase) {
      const BASE = { back: 5.1, mid: 5.8, front: 5.0 };
      let w = 0;
      for (const x of this.t[side].onPitch) if (x.p && x.slot.role !== 'GK') w += TAC.ROLES[x.slot.role].w[phase];
      return U.clamp(0.82 + 0.18 * (w / BASE[phase]), 0.75, 1.22);
    }
    gkVal(side) {
      const gk = this.t[side].gk();
      if (!gk) return { ref: 4, pos: 4, pas: 6, com: 6, p: null };
      const f = this.fatF(gk);
      return { ref: this.pa(gk, 'ref') * f, pos: this.pa(gk, 'pos') * f, pas: this.pa(gk, 'pas') * f, com: this.pa(gk, 'com') * f, p: gk };
    }
    pickPlayer(side, attr, phase, exclude) {
      const list = this.t[side].onPitch.filter(x => x.p && x.slot.role !== 'GK' && x.p !== exclude);
      if (!list.length) return null;
      const it = U.pickWeighted(list, x => Math.pow(TAC.ROLES[x.slot.role].w[phase] + 0.02, 1.5) * Math.pow(this.pa(x.p, attr), 1.6));
      return it.p;
    }
    plan(side) { return this.t[side].tac.plan; }
    atkM(side) { return ATK_M[this.t[side].tac.mentality] * (this.plan(side) === 'park' ? 0.75 : 1) * Math.pow(this.homeK, side === 'home' ? 0.5 : -0.5) * (this.wx.plan[this.plan(side)] || 1); }
    defM(side) { return DEF_M[this.t[side].tac.mentality] * (this.plan(side) === 'park' ? 1.15 : 1); }

    say(kind, text, side, extra) {
      const ev = Object.assign({ kind, text, side, min: this.minuteLabel ? this.minuteLabel() : "0'" }, extra || {});
      this.events.push(ev);
      if (this._moveEvents) this._moveEvents.push(ev);
      return ev;
    }
    pname(p) { return p ? p.name : 'Игрок'; }

    /* Снимок состояния для интерфейса */
    hud() {
      const h = this.t.home, a = this.t.away;
      return {
        ball: this.ball, poss: this.poss, mom: this.mom / CFG.zoneCost,
        score: { home: this.score.home, away: this.score.away },
        shield: { home: h.shield, away: a.shield }, pressure: { home: h.pressure, away: a.pressure },
        charge: { home: h.shotCharge, away: a.shotCharge }, cc: { home: h.counterCharge, away: a.counterCharge },
        counter: this.counter ? Object.assign({}, this.counter) : null, setPiece: this.setPiece ? this.setPiece.side : null
      };
    }

    /* ---------- основной ход ---------- */
    playMove(a, b) {
      if (this.over || this.pending) return null;
      const side = this.cur;
      const res = this.board.resolveMove(a, b);
      if (!res.valid) return null;
      this._moveEvents = [];
      const ctx = { side, critical: false, shotTaken: false, stopped: false };
      // «решающий момент» — критический ход зависит от хладнокровия
      const comV = this.val(side, 'com', side === this.poss ? PHASE(this.rp(side)) : PHASE(this.rp(side)));
      if (U.rnd() < comV / 170 + this.tadd(side, 'crit') + (side === 'home' ? 0.03 : -0.03) * this.crowd) { ctx.critical = true; }
      this.crowdSay();
      this.t[this.poss].st.poss++;
      const stepFx = [];
      for (const step of res.steps) {
        stepFx.push(this.applyStep(step, ctx));
      }
      const extra = !this.over && (res.firstMaxGroup >= 4 || (res.combo && res.combo.startsWith('star')));
      const out = { res, stepFx, events: this._moveEvents, extra: !!extra, side, critical: ctx.critical, shuffled: res.shuffled };
      this.lastResult = out;
      if (!this.pending) this.endMove(out.extra);
      this._moveEvents = null;
      return out;
    }

    applyStep(step, ctx) {
      const fx = [];
      if (ctx.stopped) return fx;
      const side = ctx.side, me = this.t[side];
      const c = step.counts;
      for (let i = 0; i < 6; i++) me.st.gems[i] += c[i];
      const casc = 1 + 0.2 * step.cascade;
      const crit = ctx.critical ? 1.5 : 1;
      const mult = casc * crit;
      const attacking = side === this.poss;
      if (step.combo) fx.push({ k: 'combo', text: comboName(step.combo) });

      if (attacking) this.attackStep(side, c, step, mult, fx, ctx);
      else this.defendStep(side, c, step, mult, fx, ctx);
      fx.push({ k: 'state', s: this.hud() });
      return fx;
    }

    attackStep(side, c, step, mult, fx, ctx) {
      const me = this.t[side], opp = this.t[OTHER(side)];
      const rp = this.rp(side), ph = PHASE(rp), dph = PHASE(4 - rp);
      const plan = me.tac.plan, oplan = opp.tac.plan;
      const shieldF = (1 - opp.shield / 230) * (oplan === 'park' ? 0.82 : 1);
      const aM = this.atkM(side) * this.numF(side, ph);
      let gain = 0;
      const directF = (plan === 'direct' ? 1.12 : 1) * this.tmul(side, 'atk');

      if (c[1]) { // Пас
        let g = this.tmul(side, 'pas') * CFG.base.pas * c[1] * R(this.val(side, 'pas', ph), this.val(OTHER(side), 'pos', dph)) * (plan === 'possession' ? 1.3 : 1) * (plan === 'counter' ? 0.9 : 1);
        g *= mult * aM * shieldF * directF;
        gain += g; me.st.passes += c[1];
        fx.push({ k: 'gain', t: 1, v: g, text: '+' + Math.round(g) + ' пас' });
        this.credit(side, 'pas', ph, 0.02 * c[1]);
      }
      if (c[2]) { // Дриблинг
        let g = this.tmul(side, 'dri') * CFG.base.dri * c[2] * R(this.val(side, 'dri', ph), this.val(OTHER(side), 'tac', dph)) * (plan === 'wings' ? 1.2 : 1);
        g *= mult * aM * shieldF * directF;
        gain += g;
        const rel = 6 * c[2] * mult * R(this.val(side, 'dri', ph), this.val(OTHER(side), 'tac', dph));
        opp.pressure = Math.max(0, opp.pressure - rel);
        fx.push({ k: 'gain', t: 2, v: g, text: '+' + Math.round(g) + ' обводка' });
        const dribbler = this.credit(side, 'dri', ph, 0.025 * c[2]);
        if (step.groups.some(gr => gr.t === 2 && gr.size >= 4) && opp.shield > 10) {
          opp.shield *= 0.45;
          fx.push({ k: 'special', t: 2, text: 'ФИНТ! Щит пробит' });
          if (this.log) this.say('skill', `${this.pname(dribbler)} финтом укладывает защитника — оборона рассыпается!`, side);
        }
      }
      if (c[3]) { // Скорость
        let cm = 1;
        if (this.counter && this.counter.side === side) cm = this.counter.mult * this.tmul(side, 'counterMult');
        const oline = opp.tac.line;
        const lineF = [0.85, 1, 1.25][oline];
        let g = this.tmul(side, 'pac') * (rp >= 2 ? this.tmul(OTHER(side), 'oppPac') : 1) * CFG.base.pac * c[3] * R(this.val(side, 'pac', ph), this.val(OTHER(side), 'pac', dph)) * (plan === 'counter' ? 1.3 : 1) * (plan === 'possession' ? 0.85 : 1) * cm * lineF;
        g *= mult * aM * shieldF * directF;
        gain += g;
        ctx.paceGain = (ctx.paceGain || 0) + g;
        fx.push({ k: 'gain', t: 3, v: g, text: '+' + Math.round(g) + (cm > 1 ? ' КОНТРАТАКА' : ' рывок') });
        this.credit(side, 'pac', ph, 0.02 * c[3]);
      }
      if (c[4]) { // Отбор у владеющей стороны = борьба за мяч
        const rel = 8 * c[4] * mult * R(this.val(side, 'sta', ph), this.val(OTHER(side), 'tac', dph));
        opp.pressure = Math.max(0, opp.pressure - rel);
        gain += 2 * c[4] * mult;
        fx.push({ k: 'info', t: 4, text: 'Борьба: −' + Math.round(rel) + ' прессинг' });
      }
      if (c[5]) { // Позиция: открывания
        const r = R(this.val(side, 'pos', ph), this.val(OTHER(side), 'pos', dph)) * (plan === 'wings' ? 1.35 : 1) * this.tmul(side, 'posAtk');
        if (rp >= 3) {
          const v = 7 * c[5] * mult * r * this.atkM(side);
          me.shotCharge = Math.min(100, me.shotCharge + v);
          fx.push({ k: 'charge', t: 5, text: '+' + Math.round(v) + ' к моменту' });
        } else {
          const g = 4.5 * c[5] * mult * r * aM * shieldF;
          gain += g;
          fx.push({ k: 'gain', t: 5, v: g, text: '+' + Math.round(g) + ' открывание' });
        }
      }
      if (c[0] && !(rp >= 3)) {
        const v = 4 * c[0] * mult;
        me.shotCharge = Math.min(100, me.shotCharge + v);
        fx.push({ k: 'charge', t: 0, text: '+' + Math.round(v) + ' угроза' });
      }

      // применяем темп
      if (gain > 0) this.addMomentum(side, gain, fx, ctx);
      if (ctx.stopped || this.poss !== side) return;

      // угловой/стандарт
      if (this.setPiece && this.setPiece.side === side && (c[5] >= 3 || c[0] >= 3)) {
        const sp = this.setPiece; this.setPiece = null;
        this.shoot(side, 'header', Math.max(c[5], c[0]), step, fx, ctx);
        return;
      }
      // удар
      const rpNow = this.rp(side);
      if (!ctx.shotTaken && rpNow >= 3 && me.shotCharge >= CFG.autoShot + this.tadd(side, 'autoShot') && c[0] < 3) {
        fx.push({ k: 'event', text: 'МОМЕНТ!' });
        this.shoot(side, rpNow === 4 ? 'box' : 'long', rpNow === 4 ? 3 : 4, step, fx, ctx);
        return;
      }
      if (!ctx.shotTaken && c[0] >= 3) {
        if (rpNow === 4) this.shoot(side, 'box', c[0], step, fx, ctx);
        else if (rpNow === 3) this.shoot(side, 'long', c[0], step, fx, ctx);
        else if (rpNow === 2 && c[0] >= 4) {
          const sh = this.withTrait(side, 'shooter');
          if (sh.length) {
            if (this.log) this.say('trait', `${this.traitNote(sh[0], 'shooter')} не думает — лупит из центра поля!`, side);
            this.shoot(side, 'vlong', c[0], step, fx, ctx, sh[0]);
          }
        }
      }
    }

    addMomentum(side, gain, fx, ctx) {
      const me = this.t[side], opp = this.t[OTHER(side)];
      if (this.rp(side) >= 4) {
        const v = gain * 0.9;
        me.shotCharge = Math.min(100, me.shotCharge + v);
        fx.push({ k: 'charge', t: 0, text: '+' + Math.round(v) + ' к моменту' });
        return;
      }
      this.mom += gain;
      while (this.mom >= CFG.zoneCost && this.poss === side) {
        if (this.rp(side) >= 4) {
          me.shotCharge = Math.min(100, me.shotCharge + (this.mom - CFG.zoneCost) * 0.9);
          this.mom = 0;
          break;
        }
        this.mom -= CFG.zoneCost;
        // офсайд при рывке против высокой линии
        const trapF = this.tmul(OTHER(side), 'oppOffside');
        if (ctx.paceGain && ctx.paceGain > gain * 0.4 && (opp.tac.line === 2 || (opp.tac.line === 1 && trapF > 1)) && this.rp(side) >= 2) {
          const p = 0.2 * R(this.val(OTHER(side), 'pos', 'back'), this.val(side, 'pos', 'front')) * this.tmul(side, 'offside') * trapF * (opp.tac.line === 1 ? 0.5 : 1);
          if (U.rnd() < p) {
            me.st.offsides++;
            fx.push({ k: 'event', text: 'ОФСАЙД!' });
            const runners = this.withTrait(side, 'runner');
            const fw = runners.length && U.rnd() < 0.7 ? runners[0] : this.pickPlayer(side, 'pac', 'front');
            const trapper = this.withTrait(OTHER(side), 'trap')[0];
            if (this.log) this.say('offside', TRAITS.has(fw, 'runner') ? `${this.traitNote(fw, 'runner')} снова стартует слишком рано — офсайд.` : trapper ? `${this.traitNote(trapper, 'trap')} синхронно выводит линию — ${this.pname(fw)} в офсайде!` : `${this.pname(fw)} убегает в отрыв, но флажок поднят — офсайд. Ловушка сработала.`, side);
            this.turnover(OTHER(side), 'offside', fx);
            ctx.stopped = true;
            return;
          }
        }
        this.ball += side === 'home' ? 1 : -1;
        const rp = this.rp(side);
        fx.push({ k: 'advance', zone: rp, text: ['', 'Выход из обороны', 'Центр поля', 'Чужая половина', 'В ШТРАФНОЙ!'][rp] });
        if (this.log) {
          const p = this.pickPlayer(side, U.pick(['pas', 'dri', 'pac']), PHASE(rp));
          const txt = [
            '',
            `${this.pname(p)} выводит мяч из-под давления.`,
            `${this.pname(p)} протаскивает мяч в центр поля.`,
            `${this.pname(p)} врывается на половину соперника!`,
            `${this.pname(p)} в штрафной соперника! Опасно!`
          ][rp];
          if (rp >= 3 || U.rnd() < 0.5) this.say(rp >= 4 ? 'danger' : 'advance', txt, side);
        }
      }
    }

    defendStep(side, c, step, mult, fx, ctx) {
      const me = this.t[side], opp = this.t[OTHER(side)], aSide = OTHER(side);
      const arp = this.rp(aSide), aph = PHASE(arp), ph = PHASE(4 - arp);
      const plan = me.tac.plan, oplan = opp.tac.plan;
      const dM = this.defM(side) * this.numF(side, ph) * this.tmul(side, 'def');
      const highUp = arp <= 1; // прессинг на чужой половине
      let press = 0;
      if (c[4]) { // Отбор
        let p = CFG.pressBase * c[4] * R(this.val(side, 'tac', ph), this.val(aSide, 'dri', aph)) * PRESS_M[me.tac.pressing];
        if (plan === 'gegenpress') p *= highUp ? 1.5 : 1.3;
        if (me.tac.line === 2 && highUp) p *= 1.15;
        if (oplan === 'possession') p *= 0.85;
        p *= mult * dM * this.tmul(side, 'press') * this.tmul(aSide, 'oppPress');
        press += p;
        fx.push({ k: 'press', t: 4, v: p, text: '+' + Math.round(p) + ' прессинг' });
        this.credit(side, 'tac', ph, 0.025 * c[4]);
        // фолы
        const tacV = this.val(side, 'tac', ph), comV = this.val(side, 'com', ph);
        let fp = CFG.foulBase * (c[4] / 3) * (1 + (11 - tacV) / 14) * (1 + (11 - comV) / 20) * [0.8, 1, 1.25][me.tac.pressing];
        if (step.groups.some(g => g.t === 4 && g.size >= 4)) fp *= 1.8;
        fp *= this.tmul(side, 'foul') * this.tmul(aSide, 'oppFoul') * this.hotK(side) * (side === 'away' ? 1 + 0.35 * this.crowd : 1);
        if (U.rnd() < U.clamp(fp, 0, 0.4)) {
          this.foul(side, ph, fx, ctx);
          return;
        }
      }
      if (c[1]) { // Пас: перехват линий
        const p = 4.5 * c[1] * R(this.val(side, 'pos', ph), this.val(aSide, 'pas', aph)) * mult * dM * this.tmul(side, 'press') * this.tmul(aSide, 'oppPress');
        press += p;
        fx.push({ k: 'press', t: 1, v: p, text: '+' + Math.round(p) + ' перехват' });
      }
      if (c[3]) { // Скорость: возврат назад
        const r = R(this.val(side, 'pac', ph), this.val(aSide, 'pac', aph));
        const m = 7 * c[3] * r * mult * dM * this.tmul(side, 'recover');
        this.mom = Math.max(0, this.mom - m);
        press += 2 * c[3] * mult;
        fx.push({ k: 'slow', t: 3, text: '−' + Math.round(m) + ' темп соперника' });
      }
      if (c[5]) { // Позиция: щит
        let s = CFG.shieldBase * c[5] * R(this.val(side, 'pos', ph), this.val(aSide, 'pos', aph)) * mult * dM;
        if (plan === 'park') s *= 1.45;
        s *= this.tmul(side, 'shield');
        if (me.tac.line === 0 && arp >= 3) s *= 1.15;
        me.shield = Math.min(CFG.shieldCap, me.shield + s);
        fx.push({ k: 'shield', t: 5, text: '+' + Math.round(s) + ' щит' });
        this.credit(side, 'pos', ph, 0.02 * c[5]);
        if (this.setPiece && this.setPiece.side === aSide && c[5] >= 3) {
          this.setPiece = null;
          fx.push({ k: 'event', text: 'Стандарт отбит' });
          if (this.log) this.say('clear', `${this.pname(this.pickPlayer(side, 'pos', 'back'))} выигрывает верх и выносит мяч.`, side);
        }
      }
      if (c[2]) { // Дриблинг: подготовка контратаки
        const v = 7 * c[2] * R(this.val(side, 'dri', 'front'), this.val(aSide, 'tac', 'back')) * mult * this.tmul(side, 'counterCharge');
        me.counterCharge = Math.min(70, me.counterCharge + v);
        fx.push({ k: 'charge', t: 2, text: '+' + Math.round(v) + ' к контратаке' });
      }
      if (c[0]) { // Удар: блоки и выносы
        const v = 10 * c[0] * mult;
        opp.shotCharge = Math.max(0, opp.shotCharge - v);
        me.shield = Math.min(CFG.shieldCap, me.shield + 3 * c[0] * mult);
        fx.push({ k: 'shield', t: 0, text: 'Блок: −' + Math.round(v) + ' угроза' });
      }
      if (press > 0) {
        me.pressure += press;
        if (me.pressure >= 100) {
          me.st.wins++;
          const p = this.pickPlayer(side, 'tac', ph);
          if (p) p.m.perf += 0.15;
          fx.push({ k: 'event', text: 'ОТБОР!' });
          const holders = this.withTrait(aSide, 'holder');
          if (holders.length && U.rnd() < 0.6) {
            holders[0].m.perf -= 0.1;
            if (this.log) this.say('trait', `${this.traitNote(holders[0], 'holder')} передержал мяч — и ${this.pname(p)} его отбирает!`, side);
          } else if (this.log) {
            const where = arp >= 3 ? 'у своей штрафной' : arp === 2 ? 'в центре поля' : 'высоко на чужой половине';
            this.say('tackle', `${this.pname(p)} отбирает мяч ${where}!`, side);
          }
          this.turnover(side, 'tackle', fx);
          ctx.stopped = false;
        }
      }
    }

    credit(side, attr, phase, amount) {
      const p = this.pickPlayer(side, attr, phase);
      if (p) p.m.perf += amount;
      return p;
    }

    turnover(newSide, reason, fx) {
      const nt = this.t[newSide], ot = this.t[OTHER(newSide)];
      this.poss = newSide;
      this.mom = nt.counterCharge;
      nt.counterCharge = 0;
      nt.pressure = 0; ot.pressure = 0;
      ot.shotCharge = 0;
      this.setPiece = null;
      if (reason === 'tackle' || reason === 'offside') {
        const counterPlan = nt.tac.plan === 'counter';
        this.counter = { side: newSide, left: counterPlan ? 3 : 2, mult: counterPlan ? 1.8 : 1.4 };
        if (reason === 'tackle' && this.rp(newSide) <= 2) {
          fx && fx.push({ k: 'event', text: 'КОНТРАТАКА!' });
          if (this.log && this.rp(newSide) <= 1 && U.rnd() < 0.6) this.say('counter', `${nt.club.name} моментально переходит в контратаку!`, newSide);
        }
      } else this.counter = null;
    }

    foul(side, ph, fx, ctx) {
      const me = this.t[side], aSide = OTHER(side), opp = this.t[aSide];
      me.st.fouls++;
      const list = me.onPitch.filter(x => x.p && x.slot.role !== 'GK');
      const fouler = U.pickWeighted(list, x => (TAC.ROLES[x.slot.role].w[ph] + 0.05) * (22 - this.pa(x.p, 'tac')) * (22 - this.pa(x.p, 'com')) * this.pm(x.p, 'foulW') * (x.p.m.hot || 1) * (x.p.m.temK || 1)).p;
      const victim = this.pickPlayer(aSide, 'dri', PHASE(this.rp(aSide)));
      me.pressure = 0;
      ctx.stopped = true;
      fx.push({ k: 'event', text: 'ФОЛ!' });
      const arp = this.rp(aSide);
      let card = null;
      const cardP = 0.3 + (10 - this.pa(fouler, 'com')) * 0.015 + (arp >= 3 ? 0.1 : 0) + (this.counter && this.counter.side === aSide ? 0.15 : 0) + this.padd(fouler, 'cardP') + ((fouler.m.hot || 1) - 1) * 0.15 + (fouler.m.side === 'away' ? 0.1 : -0.05) * this.crowd; // судья под давлением трибун
      if (U.rnd() < 0.012 * this.pm(fouler, 'redP') * (fouler.m.hot || 1)) card = 'red';
      else if (U.rnd() < cardP) card = fouler.m.yc >= 1 ? 'red2' : 'yellow';
      if (this.log || card) {
        const where = arp === 4 ? 'в штрафной' : arp === 3 ? 'у штрафной' : '';
        const tag = TRAITS.has(fouler, 'hard') ? this.traitNote(fouler, 'hard') + ' в своём стиле' : TRAITS.has(fouler, 'hothead') ? this.traitNote(fouler, 'hothead') + ' вспылил' : this.pname(fouler);
        this.say('foul', `Фол! ${tag}: сбивает ${this.pname(victim)} ${where}.${TRAITS.has(victim, 'diver') ? ' (а был ли контакт?..)' : ''}`, side);
      }
      if (card === 'yellow') {
        fouler.m.yc++; me.st.yc++; fouler.m.perf -= 0.3;
        this.say('yellow', `Жёлтая карточка: ${this.pname(fouler)}.`, side, { player: fouler.name });
        if (side === 'away' && this.crowd >= 0.75 && U.rnd() < 0.5) this.say('info', U.pick(['Трибуны неистовствуют — гости теряют самообладание.', 'Стадион ревёт, требуя карточку, — и судья не устоял.', 'Гостям тяжело: каждый их контакт встречают оглушительным свистом.']), 'home');
      } else if (card) {
        if (card === 'red2') { fouler.m.yc++; me.st.yc++; }
        fouler.m.rc = true; me.st.rc++; fouler.m.perf -= 1.5;
        this.say('red', card === 'red2' ? `Вторая жёлтая! ${this.pname(fouler)} удалён!` : `ПРЯМАЯ КРАСНАЯ! ${this.pname(fouler)} покидает поле!`, side, { player: fouler.name });
        this.sendOff(side, fouler);
        fx.push({ k: 'event', text: 'УДАЛЕНИЕ!' });
      }
      this.dissent(side, arp === 4 ? 1.6 : 1, fx);
      // травма
      if (victim && U.rnd() < 0.05 * this.pm(victim, 'injury') * this.fatInj(victim)) {
        victim.m.inj = true; victim.m.fit = Math.min(victim.m.fit, 30);
        this.say('injury', TRAITS.has(victim, 'glass') ? `${this.traitNote(victim, 'glass')} снова травмирован... Хрупкий, как стекло.` : `${this.pname(victim)} получает травму и хромает...`, aSide);
        this.onInjury(aSide, victim);
      }
      if (arp === 4 && U.rnd() < 0.55 + (aSide === 'home' ? 0.2 : -0.1) * this.crowd) {
        fx.push({ k: 'event', text: 'ПЕНАЛЬТИ!' });
        if (aSide === 'home' && this.crowd >= 0.75) this.say('info', 'Трибуны взрываются — весь стадион требует пенальти!', 'home');
        this.say('penalty', `ПЕНАЛЬТИ! Судья без колебаний показывает на точку!`, aSide);
        this.dissent(side, 2, fx);
        this.pending = { type: 'penalty', side: aSide };
        if (!this.interactive || (this.t.home.ctrl === 'ai' && this.t.away.ctrl === 'ai')) {
          this.pendingAuto = true;
        }
      } else if (arp >= 3) {
        fx.push({ k: 'event', text: 'ШТРАФНОЙ' });
        this.shoot(aSide, 'fk', 3, { cascade: 0 }, fx, ctx);
      } else {
        this.mom += 25;
        if (this.log && U.rnd() < 0.5) this.say('info', `${opp.club.name} быстро разыгрывает штрафной.`, aSide);
      }
    }

    /* Пререкания с судьёй (особенность «Спорит с судьями») */
    dissent(side, k, fx) {
      const ts = this.t[side];
      for (const p of this.withTrait(side, 'argue')) {
        if (p.m.off) continue;
        const leaders = this.withTrait(side, 'leader').filter(l => l !== p);
        const chance = this.padd(p, 'dissent') * k * (leaders.length ? 0.5 : 1);
        if (U.rnd() >= chance) continue;
        if (p.m.yc >= 1) {
          p.m.yc++; p.m.rc = true; ts.st.yc++; ts.st.rc++; p.m.perf -= 1.5;
          this.say('red', `${this.traitNote(p, 'argue')} не унимается — вторая жёлтая за пререкания! Удаление!`, side, { player: p.name });
          if (fx) fx.push({ k: 'event', text: 'УДАЛЕНИЕ!' });
          this.sendOff(side, p);
        } else {
          p.m.yc++; ts.st.yc++; p.m.perf -= 0.3;
          this.say('yellow', `${this.traitNote(p, 'argue')} спорит с судьёй — жёлтая за пререкания.`, side, { player: p.name });
        }
        break;
      }
    }

    sendOff(side, p) {
      const ts = this.t[side];
      const x = ts.onPitch.find(o => o.p === p);
      if (x) x.p = null;
      ts.redCount++;
      p.m.off = true;
      if (G.AI && ts.ctrl === 'ai') G.AI.onRedCard(this, side);
    }

    pickShooter(side, kind) {
      const list = this.t[side].onPitch.filter(x => x.p && x.slot.role !== 'GK');
      if (kind === 'pen' || kind === 'fk') {
        const key = kind === 'pen' ? 'penTaker' : 'fkTaker';
        return list.map(x => x.p).sort((a, b) => (this.pa(b, 'sho') + this.pa(b, 'com') + this.padd(b, key) * 12) - (this.pa(a, 'sho') + this.pa(a, 'com') + this.padd(a, key) * 12))[0];
      }
      const attr = kind === 'header' ? 'pos' : 'sho';
      const ph = kind === 'long' || kind === 'vlong' ? 'mid' : 'front';
      const kw = { box: 'boxW', long: 'longW', vlong: 'longW', header: 'headerW' }[kind];
      return U.pickWeighted(list, x => Math.pow(TAC.ROLES[x.slot.role].w[ph] + 0.08, 1.5) * Math.pow(this.pa(x.p, attr), 1.5) * this.pm(x.p, 'shotW') * this.pm(x.p, kw)).p;
    }

    shoot(side, kind, n, step, fx, ctx, forced) {
      ctx.shotTaken = true;
      const me = this.t[side], opp = this.t[OTHER(side)];
      const shooter = forced || this.pickShooter(side, kind);
      if (!shooter) return;
      const gk = this.gkVal(OTHER(side));
      let q;
      if (kind === 'box') q = CFG.boxShot + CFG.boxShotPerGem * (n - 3);
      else if (kind === 'long') q = CFG.longShot + CFG.longShotPerGem * (n - 4) + (me.tac.plan === 'direct' ? 0.03 : 0);
      else if (kind === 'header') q = CFG.header + 0.03 * (n - 3) * (me.tac.plan === 'wings' ? 1.3 : 1);
      else if (kind === 'fk') q = 0.07 + (this.pa(shooter, 'sho') - 10) * 0.006;
      else if (kind === 'vlong') q = CFG.longShot * 0.6 + 0.02 * (n - 4);
      q *= 1 + me.shotCharge / 100 * 0.6;
      const f = this.fatF(shooter);
      const skill = (kind === 'header' ? this.pa(shooter, 'pos') : this.pa(shooter, 'sho')) * 0.7 * f + this.pa(shooter, 'com') * 0.3 * f;
      // особенности бьющего и соперника
      const kq = { box: 'boxQ', long: 'longQ', vlong: 'longQ', header: 'headerQ', fk: 'fkQ' }[kind];
      const oq = { box: 'oppBoxQ', long: 'oppLongQ', vlong: 'oppLongQ', header: 'oppHeaderQ', fk: 'oppLongQ' }[kind];
      q *= this.pm(shooter, 'q') * this.pm(shooter, kq) * this.tmul(OTHER(side), oq) * this.tmul(OTHER(side), 'oppShotQ');
      q *= Math.pow(R(skill, gk.ref * 0.7 + gk.pos * 0.3), 1.15);
      if (kind !== 'fk') q *= 1 - opp.shield / 260;
      q *= this.atkM(side);
      if (me.tac.plan === 'direct') q *= 0.92;
      if (kind !== 'fk') q *= 1 + 0.12 * (step.cascade || 0);
      if (this.counter && this.counter.side === side) q *= 1.15;
      if (ctx.critical) q *= 1.25;
      q = U.clamp(q, 0.02, 0.72);
      me.st.shots++; me.st.xg += q;
      me.shotCharge = 0;
      const label = { box: 'удар', long: 'дальний удар', vlong: 'удар метров с тридцати пяти', header: 'удар головой', fk: 'штрафной' }[kind];
      fx.push({ k: 'shot', text: kind === 'long' || kind === 'vlong' ? 'ДАЛЬНИЙ УДАР!' : kind === 'header' ? 'УДАР ГОЛОВОЙ!' : kind === 'fk' ? 'ШТРАФНОЙ!' : 'УДАР!', q });
      const r = U.rnd();
      if (r < q) {
        me.st.onT++;
        this.goal(side, shooter, kind, fx);
        return;
      }
      // не гол
      const onTarget = U.rnd() < 0.5;
      shooter.m.perf += 0.05;
      if (onTarget) {
        me.st.onT++; opp.st.saves++;
        if (gk.p) { gk.p.m.perf += 0.25; gk.p.m.saves++; }
        fx.push({ k: 'save', text: 'СЕЙВ!' });
        if (this.log) this.say('save', `${this.pname(shooter)} — ${label}! ${gk.p ? this.pname(gk.p) : 'Вратарь'} тащит! ${q > 0.3 ? 'Невероятный сейв!' : ''}`, side, { q });
      } else {
        fx.push({ k: 'miss', text: 'МИМО' });
        if (this.log) this.say('miss', `${this.pname(shooter)} — ${label}... ${U.pick(['Мимо ворот!', 'Над перекладиной!', 'Заблокировано защитником!', 'В штангу!!!'])}`, side, { q });
      }
      const cornerP = ((onTarget ? 0.32 : 0.22) + (me.tac.plan === 'wings' ? 0.12 : 0)) * this.tmul(side, 'cornerP');
      if (U.rnd() < cornerP) {
        me.st.corners++;
        this.setPiece = { side, type: 'corner', created: this.moveNo };
        me.shotCharge = 20 + (me.tac.plan === 'wings' ? 15 : 0) + this.tadd(side, 'cornerCharge');
        this.ball = side === 'home' ? 4 : 0;
        opp.pressure = 0;
        fx.push({ k: 'event', text: 'УГЛОВОЙ' });
        if (this.log) this.say('corner', `Угловой. Нужны фиолетовые или красные блоки, чтобы замкнуть подачу!`, side);
      } else {
        // мяч у вратаря — он вводит его в игру
        this.ball = side === 'home' ? 3 : 1;
        this.turnover(OTHER(side), 'shot', fx);
        this.mom = 15 * R(gk.pas, 10) * this.tmul(OTHER(side), 'gkDist');
      }
      ctx.stopped = true;
    }

    goal(side, scorer, kind, fx) {
      const me = this.t[side], opp = this.t[OTHER(side)];
      this.score[side]++; me.st.goals++;
      scorer.m.goals++; scorer.m.perf += 1.1;
      let assist = null;
      if (kind !== 'pen' && kind !== 'fk' && U.rnd() < 0.78) {
        const list = me.onPitch.filter(x => x.p && x.p !== scorer && x.slot.role !== 'GK');
        if (list.length) {
          assist = U.pickWeighted(list, x => Math.pow(TAC.ROLES[x.slot.role].w.front + 0.1, 1.5) * Math.pow(this.pa(x.p, kind === 'header' ? 'pas' : U.pick(['pas', 'dri'])), 2) * this.pm(x.p, 'assistW')).p;
          assist.m.assists++; assist.m.perf += 0.55;
        }
      }
      opp.onPitch.forEach(x => { if (x.p && (x.slot.role === 'GK' || x.slot.role === 'CB')) x.p.m.perf -= 0.15; });
      const g = { side, min: this.minuteLabel(), scorer: scorer.name, scorerId: scorer.id, assist: assist ? assist.name : null, assistId: assist ? assist.id : null, kind };
      this.goals.push(g);
      fx.push({ k: 'goal', text: 'ГОЛ!', goal: g });
      const how = { box: U.pick(['пробивает в угол', 'расстреливает ворота', 'хладнокровно закатывает', 'бьёт под перекладину']), long: 'выстреливает издали — прямо в девятку', vlong: 'рискует из центра поля — и попадает!!!', header: 'замыкает подачу головой', fk: 'исполняет штрафной идеально', pen: 'реализует пенальти' }[kind];
      const aNote = assist && TRAITS.has(assist, 'vision') ? ` Передача от ${this.traitNote(assist, 'vision')} — увидел то, что не видел никто.` : assist ? ' Ассист: ' + assist.name + '.' : '';
      const sNote = TRAITS.has(scorer, 'clutch') && this.minute() >= 75 ? ' Снова решает в концовке!' : TRAITS.has(scorer, 'bigGame') && this.cond(side, 'strongOpp') ? ' Большие матчи — его стихия!' : '';
      this.say('goal', `ГОООЛ! ${scorer.name} ${how}!${aNote}${sNote} ${this.score.home}:${this.score.away}`, side, { goal: g });
      // розыгрыш с центра
      this.ball = 2; this.poss = OTHER(side); this.mom = 0;
      me.pressure = 0; opp.pressure = 0; me.shotCharge = 0; opp.shotCharge = 0;
      me.shield = 15; opp.shield = 15; this.counter = null; this.setPiece = null;
      me.counterCharge = 0; opp.counterCharge = 0;
      if (G.AI) { G.AI.onGoal(this, 'home'); G.AI.onGoal(this, 'away'); }
    }

    /* Пенальти: 0 — лево, 1 — центр, 2 — право */
    resolvePenalty(kDir, gDir) {
      const pd = this.pending;
      if (!pd || pd.type !== 'penalty') return null;
      const side = pd.side, me = this.t[side], opp = this.t[OTHER(side)];
      const kicker = this.pickShooter(side, 'pen');
      const gk = this.gkVal(OTHER(side));
      if (kDir == null) kDir = G.AI ? G.AI.penaltyKick(kicker) : U.randInt(0, 2);
      if (gDir == null) gDir = G.AI ? G.AI.penaltyDive(gk) : U.randInt(0, 2);
      this._moveEvents = [];
      const fx = [];
      me.st.shots++; me.st.xg += 0.76;
      let goal;
      const comF = (this.pa(kicker, 'com') * this.fatF(kicker) - 10) / 100;
      const trF = (gk.p ? this.padd(gk.p, 'penSave') : 0) - this.padd(kicker, 'penQ');
      if (kDir === gDir) {
        const saveP = kDir === 1 ? 0.85 : U.clamp(0.55 + (gk.ref - this.pa(kicker, 'sho')) / 40 + trF, 0.25, 0.9);
        goal = U.rnd() > saveP;
      } else {
        goal = U.rnd() < U.clamp(0.9 + comF + this.padd(kicker, 'penQ') * 0.4, 0.75, 0.98);
      }
      let result;
      if (goal) {
        me.st.onT++;
        this.goal(side, kicker, 'pen', fx);
        result = 'goal';
      } else {
        const saved = kDir === gDir;
        if (saved) { me.st.onT++; opp.st.saves++; if (gk.p) { gk.p.m.perf += 0.8; gk.p.m.saves++; } }
        kicker.m.perf -= 0.6;
        this.say(saved ? 'save' : 'miss', saved ? `${gk.p ? (TRAITS.has(gk.p, 'penStopper') ? this.traitNote(gk.p, 'penStopper') : gk.p.name) : 'Вратарь'} ПАРИРУЕТ ПЕНАЛЬТИ! ${kicker.name} не смог!` : `${kicker.name} бьёт мимо ворот с пенальти!`, side);
        this.ball = side === 'home' ? 4 : 0;
        this.turnover(OTHER(side), 'shot', fx);
        result = saved ? 'saved' : 'miss';
      }
      this.pending = null; this.pendingAuto = false;
      const ev = this._moveEvents; this._moveEvents = null;
      this.endMove(false);
      return { result, kDir, gDir, kicker, gk: gk.p, fx, events: ev };
    }

    /* ---------- завершение хода ---------- */
    endMove(extra) {
      const side = this.cur;
      this.moveNo++;
      // усталость
      for (const s of ['home', 'away']) {
        const ts = this.t[s];
        const drain = CFG.drain * this.wx.drain * PRESS_DRAIN[ts.tac.pressing] * (ts.tac.plan === 'gegenpress' ? 1.2 : 1) * (ts.tac.plan === 'park' ? 0.85 : 1);
        for (const x of ts.onPitch) {
          if (!x.p) continue;
          const role = x.slot.role === 'GK' ? 0.25 : 1;
          x.p.m.fit = Math.max(5, x.p.m.fit - drain * role * this.pm(x.p, 'drain') * (1.45 - x.p.a.sta / 20 * 0.9) * (0.9 + 0.2 * U.rnd()) * (24 / this.H));
          // мышечная травма на усталости (без контакта)
          if (role === 1 && !x.p.m.inj && x.p.m.fit < 45 && U.rnd() < 0.0006 * (45 - x.p.m.fit) / 10 * this.pm(x.p, 'injury') * (24 / this.H)) {
            x.p.m.inj = true; x.p.m.fit = Math.min(x.p.m.fit, 30);
            this.say('injury', `${this.pname(x.p)} хватается за заднюю поверхность бедра — сказывается усталость...`, s);
            this.onInjury(s, x.p);
          }
        }
        ts.shield = Math.max(0, ts.shield - 3.5);
        ts.pressure = Math.max(0, ts.pressure - 2);
      }
      if (this.counter && this.counter.side === side) {
        this.counter.left--;
        if (this.counter.left <= 0) this.counter = null;
      }
      if (this.setPiece && this.setPiece.side === side && this.setPiece.created < this.moveNo - 1) this.setPiece = null;
      this.momentumHistory.push(this.ball - 2 + (this.poss === 'home' ? 0.3 : -0.3));
      // время
      this.moveInHalf++;
      const halfLen = this.H + this.added[this.half - 1];
      this.lastMoveSide = side;
      if (this.moveInHalf >= halfLen) {
        if (this.half === 1) {
          this.half = 2; this.moveInHalf = 0;
          this.say('half', `Перерыв. Счёт ${this.score.home}:${this.score.away}.`, null);
          this.halftime = true;
          this.ball = 2; this.poss = 'away'; this.mom = 0; this.counter = null; this.setPiece = null;
          for (const s of ['home', 'away']) { const ts = this.t[s]; ts.pressure = 0; ts.shotCharge = 0; ts.shield = 15; ts.players().forEach(p => { p.m.fit = Math.min(100, p.m.fit + 6); }); }
          this.cur = 'away';
          this.extraStreak = 0;
          if (G.AI) { G.AI.halftime(this, 'home'); G.AI.halftime(this, 'away'); }
          return;
        } else {
          this.finish();
          return;
        }
      }
      if (extra && this.extraStreak < 2) {
        this.extraStreak++;
        this.say('extra', 'Дополнительный ход!', side, { quiet: true });
      } else {
        this.extraStreak = 0;
        this.cur = OTHER(side);
      }
      if (G.AI) { G.AI.think(this, 'home'); G.AI.think(this, 'away'); }
    }

    finish() {
      this.over = true;
      this.say('end', `Финальный свисток! ${this.t.home.club.name} ${this.score.home}:${this.score.away} ${this.t.away.club.name}`, null);
      // оценки
      const res = { home: Math.sign(this.score.home - this.score.away), away: Math.sign(this.score.away - this.score.home) };
      for (const s of ['home', 'away']) {
        const ts = this.t[s];
        const conceded = this.score[OTHER(s)];
        const all = ts.club.players.filter(p => p.m && p.m.played);
        for (const p of all) {
          let r = 6.2 + p.m.perf + res[s] * 0.35;
          if ((p.pos === 'DF' || p.pos === 'GK')) r += conceded === 0 ? 0.6 : -0.2 * conceded;
          r += (U.rnd() - 0.45) * 0.8;
          p.m.rating = U.clamp(Math.round(r * 10) / 10, 3, 10);
        }
      }
    }

    /* ---------- управление по ходу матча ---------- */
    substitute(side, outId, inId, silent) {
      const ts = this.t[side];
      if (ts.subsLeft <= 0) return false;
      const x = ts.onPitch.find(o => o.p && o.p.id === outId);
      const inP = ts.bench.find(p => p.id === inId);
      if (!x || !inP || ts.used.has(inId)) return false;
      x.p.m.subOff = true;
      x.p = inP; inP.m.played = true; ts.used.add(inId);
      ts.bench = ts.bench.filter(p => p.id !== inId);
      ts.subsLeft--;
      if (!silent || this.log) this.say('sub', `Замена в «${ts.club.name}»: ${inP.name} вместо ${TAC.playerMap(ts.club)[outId].name}.`, side);
      return true;
    }

    setFormation(side, formation) {
      const ts = this.t[side];
      const players = ts.players();
      const slots = TAC.FORMATIONS[formation];
      const pairs = [];
      slots.forEach((s, si) => players.forEach(p => pairs.push({ si, p, v: TAC.roleRating(p, s.role) * (s.role === 'GK' ? (p.pos === 'GK' ? 3 : 1) : 1) })));
      pairs.sort((a, b) => b.v - a.v);
      const out = slots.map(s => ({ slot: s, p: null }));
      const used = new Set();
      // сначала вратарь
      const gk = players.find(p => p.pos === 'GK');
      if (gk) { out[0].p = gk; used.add(gk.id); }
      for (const pr of pairs) {
        if (out[pr.si].p || used.has(pr.p.id)) continue;
        out[pr.si].p = pr.p; used.add(pr.p.id);
      }
      ts.onPitch = out;
      ts.tac.formation = formation;
    }

    setTactic(side, key, value) {
      const ts = this.t[side];
      if (key === 'formation') { this.setFormation(side, value); }
      else ts.tac[key] = value;
    }

    /* Быстрая симуляция без отрисовки */
    simulate() {
      let guard = 0;
      while (!this.over && guard++ < 2000) {
        if (this.pending) { this.resolvePenalty(); continue; }
        if (this.injPending) { const ip = this.injPending; this.injPending = null; if (G.AI) G.AI.handleInjury(this, ip.side, ip.p); }
        const mv = G.AI.chooseMove(this, this.cur);
        if (!mv) { this.board.shuffle(); continue; }
        this.playMove(mv.a, mv.b);
      }
      return this;
    }
  }

  function comboName(c) {
    return {
      'starstar': 'ДВЕ СУПЕРЗВЕЗДЫ!!!', 'star': 'СУПЕРЗВЕЗДА!', 'star+h': 'ЗВЕЗДА + ЛИНИЯ!', 'star+v': 'ЗВЕЗДА + ЛИНИЯ!', 'star+bomb': 'ЗВЕЗДА + БОМБА!',
      'bomb+bomb': 'МЕГАВЗРЫВ!', 'bomb+h': 'КРЕСТ-ВЗРЫВ!', 'bomb+v': 'КРЕСТ-ВЗРЫВ!', 'h+h': 'ПЕРЕКРЁСТОК!', 'h+v': 'ПЕРЕКРЁСТОК!', 'v+v': 'ПЕРЕКРЁСТОК!'
    }[c] || 'КОМБО!';
  }

  G.ENGINE = { Match, CFG, PHASE, R, ZONE_TXT, WEATHER, homeK, crowdOf, crowdLabel, wxSens };
})(typeof window !== 'undefined' ? window : globalThis);
