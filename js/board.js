/* Логика поля «3 в ряд» без отрисовки: используется и в анимированном матче, и в быстрой симуляции */
(function (G) {
  'use strict';
  const U = G.U;

  /* 6 типов блоков = 6 футбольных действий */
  const GEMS = [
    { k: 'sho', n: 'Удар', color: '#ff3b5c', c2: '#b3002a', attr: 'sho' },
    { k: 'pas', n: 'Пас', color: '#3b8bff', c2: '#0b3fb0', attr: 'pas' },
    { k: 'dri', n: 'Дриблинг', color: '#22d36b', c2: '#057a39', attr: 'dri' },
    { k: 'pac', n: 'Скорость', color: '#ffd23f', c2: '#c08a00', attr: 'pac' },
    { k: 'tac', n: 'Отбор', color: '#ff8a3d', c2: '#b8460b', attr: 'tac' },
    { k: 'pos', n: 'Позиция', color: '#b45cff', c2: '#5d1aa8', attr: 'pos' }
  ];
  const NT = GEMS.length;
  let NEXT_ID = 1;

  function gem(t, sp) { return { id: NEXT_ID++, t, sp: sp || null }; }

  class Board {
    constructor(size, rng) {
      this.n = size || 8;
      this.rng = rng || Math.random;
      this.g = [];
    }

    clone(rng) {
      const b = new Board(this.n, rng || this.rng);
      b.g = this.g.map(row => row.map(x => x ? { id: x.id, t: x.t, sp: x.sp } : null));
      return b;
    }

    randType() { return Math.floor(this.rng() * NT); }

    fill() {
      const n = this.n;
      do {
        this.g = [];
        for (let r = 0; r < n; r++) {
          const row = [];
          for (let c = 0; c < n; c++) {
            let t, guard = 0;
            do {
              t = this.randType();
              guard++;
            } while (guard < 50 && ((c >= 2 && row[c - 1].t === t && row[c - 2].t === t) ||
              (r >= 2 && this.g[r - 1][c].t === t && this.g[r - 2][c].t === t)));
            row.push(gem(t));
          }
          this.g.push(row);
        }
      } while (this.validMoves().length < 4);
    }

    inside(r, c) { return r >= 0 && c >= 0 && r < this.n && c < this.n; }

    swap(a, b) {
      const t = this.g[a[0]][a[1]];
      this.g[a[0]][a[1]] = this.g[b[0]][b[1]];
      this.g[b[0]][b[1]] = t;
    }

    matchAt(r, c) {
      const x = this.g[r][c];
      if (!x || x.t < 0) return false;
      const t = x.t;
      let h = 1, v = 1;
      for (let i = c - 1; i >= 0 && this.g[r][i] && this.g[r][i].t === t; i--) h++;
      for (let i = c + 1; i < this.n && this.g[r][i] && this.g[r][i].t === t; i++) h++;
      if (h >= 3) return true;
      for (let i = r - 1; i >= 0 && this.g[i][c] && this.g[i][c].t === t; i--) v++;
      for (let i = r + 1; i < this.n && this.g[i][c] && this.g[i][c].t === t; i++) v++;
      return v >= 3;
    }

    isValidSwap(a, b) {
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return false;
      const ga = this.g[a[0]][a[1]], gb = this.g[b[0]][b[1]];
      if (!ga || !gb) return false;
      if (ga.sp === 'star' || gb.sp === 'star') return true;
      if (ga.sp && gb.sp) return true;
      this.swap(a, b);
      const ok = this.matchAt(a[0], a[1]) || this.matchAt(b[0], b[1]);
      this.swap(a, b);
      return ok;
    }

    validMoves() {
      const res = [];
      for (let r = 0; r < this.n; r++) {
        for (let c = 0; c < this.n; c++) {
          if (c + 1 < this.n && this.isValidSwap([r, c], [r, c + 1])) res.push({ a: [r, c], b: [r, c + 1] });
          if (r + 1 < this.n && this.isValidSwap([r, c], [r + 1, c])) res.push({ a: [r, c], b: [r + 1, c] });
        }
      }
      return res;
    }

    /* Группы совпадений (объединение пересекающихся линий для L/T-фигур) */
    findGroups() {
      const n = this.n, runs = [];
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          const x = this.g[r][c];
          if (!x || x.t < 0) { c++; continue; }
          let e = c + 1;
          while (e < n && this.g[r][e] && this.g[r][e].t === x.t) e++;
          if (e - c >= 3) { const cells = []; for (let i = c; i < e; i++) cells.push([r, i]); runs.push({ t: x.t, dir: 'h', cells }); }
          c = e;
        }
      }
      for (let c = 0; c < n; c++) {
        let r = 0;
        while (r < n) {
          const x = this.g[r][c];
          if (!x || x.t < 0) { r++; continue; }
          let e = r + 1;
          while (e < n && this.g[e][c] && this.g[e][c].t === x.t) e++;
          if (e - r >= 3) { const cells = []; for (let i = r; i < e; i++) cells.push([i, c]); runs.push({ t: x.t, dir: 'v', cells }); }
          r = e;
        }
      }
      // объединение
      const parent = runs.map((_, i) => i);
      const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
      const owner = {};
      runs.forEach((run, i) => {
        run.cells.forEach(([r, c]) => {
          const k = r * n + c;
          if (owner[k] != null) parent[find(i)] = find(owner[k]); else owner[k] = i;
        });
      });
      const groups = {};
      runs.forEach((run, i) => {
        const root = find(i);
        if (!groups[root]) groups[root] = { t: run.t, keys: new Set(), runs: [] };
        groups[root].runs.push(run);
        run.cells.forEach(([r, c]) => groups[root].keys.add(r * n + c));
      });
      return Object.values(groups);
    }

    /* Клетки, которые затрагивает спецблок */
    blastCells(sp, r, c, colorHint) {
      const n = this.n, out = [];
      if (sp === 'h') for (let i = 0; i < n; i++) out.push([r, i]);
      else if (sp === 'v') for (let i = 0; i < n; i++) out.push([i, c]);
      else if (sp === 'bomb') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.inside(r + dr, c + dc)) out.push([r + dr, c + dc]);
      } else if (sp === 'star') {
        let t = colorHint;
        if (t == null || t < 0) {
          const cnt = new Array(NT).fill(0);
          for (const row of this.g) for (const x of row) if (x && x.t >= 0) cnt[x.t]++;
          t = cnt.indexOf(Math.max(...cnt));
        }
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (this.g[i][j] && this.g[i][j].t === t) out.push([i, j]);
      }
      return out;
    }

    /* Полное разрешение хода: возвращает шаги для анимации и подсчёта эффектов */
    resolveMove(a, b, sim) {
      if (!this.isValidSwap(a, b)) return { valid: false, steps: [] };
      const n = this.n;
      const ga = this.g[a[0]][a[1]], gb = this.g[b[0]][b[1]];
      this.swap(a, b);
      // после обмена ga стоит в b, gb — в a
      let forced = null; // начальная зачистка от комбо спецблоков
      let combo = null;
      const triggeredIds = new Set();
      if (ga.sp === 'star' || gb.sp === 'star') {
        forced = new Map();
        const star = ga.sp === 'star' ? ga : gb;
        const other = star === ga ? gb : ga;
        const starPos = star === ga ? b : a;
        forced.set(starPos[0] * n + starPos[1], 'star');
        triggeredIds.add(star.id);
        if (other.sp === 'star') {
          combo = 'starstar';
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) forced.set(i * n + j, 'combo');
        } else {
          const t = other.t;
          combo = other.sp ? 'star+' + other.sp : 'star';
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const x = this.g[i][j];
            if (x && x.t === t) {
              if (other.sp && x !== other && !x.sp) x.sp = other.sp === 'bomb' ? 'bomb' : (this.rng() < 0.5 ? 'h' : 'v');
              forced.set(i * n + j, 'star');
            }
          }
        }
      } else if (ga.sp && gb.sp) {
        forced = new Map();
        const [r, c] = b;
        const kinds = [ga.sp, gb.sp].sort().join('+');
        combo = kinds;
        triggeredIds.add(ga.id); triggeredIds.add(gb.id);
        const add = (i, j) => { if (this.inside(i, j)) forced.set(i * n + j, 'combo'); };
        if (kinds === 'bomb+bomb') {
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
        } else if (kinds.includes('bomb')) {
          for (let d = -1; d <= 1; d++) for (let i = 0; i < n; i++) { add(r + d, i); add(i, c + d); }
        } else {
          for (let i = 0; i < n; i++) { add(r, i); add(i, c); }
        }
      }

      const steps = [];
      let cascade = 0;
      let firstMaxGroup = 0;
      while (cascade < 40) {
        const clear = new Map(); // key -> reason
        const creations = [];
        const groupInfo = [];
        if (forced) { forced.forEach((v, k) => clear.set(k, v)); forced = null; }
        const groups = this.findGroups();
        for (const grp of groups) {
          grp.keys.forEach(k => { if (!clear.has(k)) clear.set(k, 'match'); });
          let maxRun = 0, hasH = false, hasV = false, hRun = null;
          for (const run of grp.runs) {
            maxRun = Math.max(maxRun, run.cells.length);
            if (run.dir === 'h') { hasH = true; if (!hRun || run.cells.length > hRun) hRun = run.cells.length; } else hasV = true;
          }
          const size = grp.keys.size;
          groupInfo.push({ t: grp.t, size, maxRun });
          if (cascade === 0) firstMaxGroup = Math.max(firstMaxGroup, maxRun >= 5 ? 5 : size);
          let sp = null;
          if (maxRun >= 5) sp = 'star';
          else if (hasH && hasV) sp = 'bomb';
          else if (maxRun === 4) sp = hasH ? 'h' : 'v';
          if (sp) {
            // позиция создания: клетка обмена, если она в группе, иначе — середина
            let pos = null;
            for (const p of [a, b]) if (cascade === 0 && grp.keys.has(p[0] * n + p[1])) pos = p;
            if (!pos) {
              const arr = Array.from(grp.keys).map(k => [Math.floor(k / n), k % n]);
              arr.sort((x, y) => (y[0] - x[0]) || (x[1] - y[1]));
              pos = arr[Math.floor(arr.length / 2)];
            }
            creations.push({ r: pos[0], c: pos[1], t: sp === 'star' ? -1 : grp.t, sp });
          }
        }
        if (clear.size === 0) break;

        // цепная реакция спецблоков
        const queue = [];
        clear.forEach((reason, k) => {
          const x = this.g[Math.floor(k / n)][k % n];
          if (x && x.sp && !triggeredIds.has(x.id)) queue.push(k);
        });
        const blasts = [];
        while (queue.length) {
          const k = queue.shift();
          const r = Math.floor(k / n), c = k % n;
          const x = this.g[r][c];
          if (!x || triggeredIds.has(x.id)) continue;
          triggeredIds.add(x.id);
          blasts.push({ r, c, sp: x.sp, t: x.t });
          for (const [i, j] of this.blastCells(x.sp, r, c, null)) {
            const kk = i * n + j;
            if (!clear.has(kk)) {
              clear.set(kk, 'blast');
              const y = this.g[i][j];
              if (y && y.sp && !triggeredIds.has(y.id)) queue.push(kk);
            }
          }
        }

        const cleared = [];
        const counts = new Array(NT).fill(0);
        clear.forEach((reason, k) => {
          const r = Math.floor(k / n), c = k % n;
          const x = this.g[r][c];
          if (!x) return;
          cleared.push({ r, c, id: x.id, t: x.t, sp: x.sp, reason });
          if (x.t >= 0) counts[x.t]++;
          this.g[r][c] = null;
        });
        const created = [];
        for (const cr of creations) {
          if (this.g[cr.r][cr.c]) continue;
          const ng = gem(cr.t, cr.sp);
          this.g[cr.r][cr.c] = ng;
          created.push({ r: cr.r, c: cr.c, id: ng.id, t: ng.t, sp: ng.sp });
        }
        // гравитация
        const falls = [], spawns = [];
        for (let c = 0; c < n; c++) {
          let w = n - 1;
          for (let r = n - 1; r >= 0; r--) {
            const x = this.g[r][c];
            if (x) {
              if (w !== r) { this.g[w][c] = x; this.g[r][c] = null; falls.push({ id: x.id, c, from: r, to: w }); }
              w--;
            }
          }
          const missing = w + 1;
          for (let r = w; r >= 0; r--) {
            const ng = gem(this.randType());
            this.g[r][c] = ng;
            spawns.push({ id: ng.id, t: ng.t, sp: null, c, r, from: r - missing });
          }
        }
        steps.push({ cascade, cleared, counts, groups: groupInfo, created, blasts, falls, spawns, combo: cascade === 0 ? combo : null });
        cascade++;
      }
      let shuffled = false;
      if (!sim && this.validMoves().length === 0) { this.shuffle(); shuffled = true; }
      return { valid: true, steps, firstMaxGroup, combo, shuffled };
    }

    shuffle() {
      const n = this.n;
      const all = [];
      for (const row of this.g) for (const x of row) all.push(x);
      let guard = 0;
      do {
        U.shuffle(all, this.rng);
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) this.g[r][c] = all[r * n + c];
        guard++;
        if (guard > 30) { this.fill(); return; }
      } while (this.findGroups().length > 0 || this.validMoves().length === 0);
    }

    snapshot() { return this.g.map(row => row.map(x => ({ id: x.id, t: x.t, sp: x.sp }))); }
  }
  G.BOARD = { Board, GEMS, NT };
})(typeof window !== 'undefined' ? window : globalThis);
