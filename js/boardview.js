/* Анимированное поле «3 в ряд» */
(function (G) {
  'use strict';
  const U = G.U, GFX = G.GFX, BOARD = G.BOARD;

  class BoardView {
    constructor(host, opts) {
      this.host = host;
      this.opts = opts || {};
      this.speed = 1;
      this.enabled = false;
      this.tiles = new Map();
      this.sel = null;
      this.el = U.el('div.board');
      this.cellsLayer = U.el('div.board-cells');
      this.tilesLayer = U.el('div.board-tiles');
      this.fxLayer = U.el('div.board-fx');
      this.el.append(this.cellsLayer, this.tilesLayer, this.fxLayer);
      for (let i = 0; i < 64; i++) this.cellsLayer.appendChild(U.el('div.cell' + (((i >> 3) + i) % 2 ? '.alt' : '')));
      host.appendChild(this.el);
      this.cs = 50;
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.el);
      this.bindInput();
    }

    destroy() { this.ro.disconnect(); }

    setBoard(board) { this.board = board; this.rebuild(); }

    ms(x) { return Math.max(16, x / this.speed); }
    wait(x) { return U.sleep(this.ms(x)); }

    layout() {
      const w = this.el.clientWidth;
      if (!w) return;
      this.cs = w / 8;
      this.el.style.setProperty('--cs', this.cs + 'px');
      this.tiles.forEach(el => this.place(el, el._r, el._c, false));
    }

    makeTile(g) {
      const el = U.el('div.tile.t' + (g.t < 0 ? 'x' : g.t));
      el.dataset.id = g.id;
      const face = U.el('div.gem');
      face.innerHTML = g.sp === 'star' ? GFX.STAR_ICON : GFX.GEM_ICONS[g.t];
      el.appendChild(face);
      if (g.sp) {
        el.classList.add('sp-' + g.sp);
        if (g.sp === 'h' || g.sp === 'v') el.appendChild(U.el('div.stripe'));
        if (g.sp === 'bomb') el.appendChild(U.el('div.bomb-ring'));
      }
      el._g = g;
      this.tilesLayer.appendChild(el);
      this.tiles.set(g.id, el);
      return el;
    }

    place(el, r, c, anim, dur) {
      el._r = r; el._c = c;
      if (anim === false) {
        el.style.transition = 'none';
        el.style.transform = `translate(${c * this.cs}px, ${r * this.cs}px)`;
        void el.offsetWidth;
        el.style.transition = '';
      } else {
        if (dur) el.style.transitionDuration = dur + 'ms';
        el.style.transform = `translate(${c * this.cs}px, ${r * this.cs}px)`;
      }
    }

    rebuild() {
      this.tilesLayer.innerHTML = '';
      this.tiles.clear();
      this.layout();
      const g = this.board.g;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const el = this.makeTile(g[r][c]);
        this.place(el, r, c, false);
      }
    }

    /* Проверка соответствия визуального состояния модели */
    sync() {
      const g = this.board.g, seen = new Set();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const x = g[r][c];
        seen.add(x.id);
        let el = this.tiles.get(x.id);
        if (!el || el._g.sp !== x.sp || el._g.t !== x.t) {
          if (el) el.remove();
          el = this.makeTile(x);
          this.place(el, r, c, false);
        } else if (el._r !== r || el._c !== c) this.place(el, r, c, false);
      }
      this.tiles.forEach((el, id) => { if (!seen.has(id)) { el.remove(); this.tiles.delete(id); } });
    }

    async shuffleAnim() {
      this.tiles.forEach(el => el.classList.add('shuffling'));
      await this.wait(350);
      this.rebuild();
      this.tiles.forEach(el => el.classList.add('born'));
      await this.wait(300);
      this.tiles.forEach(el => el.classList.remove('born'));
    }

    /* ---------- ввод ---------- */
    cellAt(e) {
      const rect = this.el.getBoundingClientRect();
      const c = Math.floor((e.clientX - rect.left) / (rect.width / 8));
      const r = Math.floor((e.clientY - rect.top) / (rect.height / 8));
      if (r < 0 || c < 0 || r > 7 || c > 7) return null;
      return [r, c];
    }
    bindInput() {
      const el = this.el;
      el.addEventListener('pointerdown', e => {
        if (!this.enabled) return;
        const cell = this.cellAt(e);
        if (!cell) return;
        e.preventDefault();
        this.drag = { cell, x: e.clientX, y: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      });
      el.addEventListener('pointermove', e => {
        if (!this.drag || !this.enabled) return;
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        const th = this.cs * 0.35;
        if (Math.abs(dx) < th && Math.abs(dy) < th) return;
        const [r, c] = this.drag.cell;
        const t = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
        this.drag = null;
        this.clearSel();
        if (t[0] >= 0 && t[1] >= 0 && t[0] < 8 && t[1] < 8) this.request([r, c], t);
      });
      el.addEventListener('pointerup', () => {
        if (!this.drag || !this.enabled) { this.drag = null; return; }
        const cell = this.drag.cell;
        this.drag = null;
        if (this.sel) {
          const d = Math.abs(this.sel[0] - cell[0]) + Math.abs(this.sel[1] - cell[1]);
          if (d === 1) { const a = this.sel; this.clearSel(); this.request(a, cell); return; }
          if (d === 0) { this.clearSel(); return; }
        }
        this.select(cell);
      });
    }
    select(cell) {
      this.clearSel();
      this.sel = cell;
      const el = this.elAt(cell);
      if (el) el.classList.add('sel');
      G.SFX.tone(660, 0.05, 'sine', 0.08);
    }
    clearSel() {
      if (this.sel) { const el = this.elAt(this.sel); if (el) el.classList.remove('sel'); }
      this.sel = null;
    }
    elAt([r, c]) { const g = this.board.g[r][c]; return g ? this.tiles.get(g.id) : null; }
    request(a, b) { if (this.opts.onSwap) this.opts.onSwap(a, b); }
    setEnabled(v) { this.enabled = v; this.el.classList.toggle('locked', !v); if (!v) this.clearSel(); }

    showHint(mv) {
      this.clearHint();
      [mv.a, mv.b].forEach(p => { const el = this.elAt(p); if (el) el.classList.add('hint'); });
    }
    clearHint() { this.tiles.forEach(el => el.classList.remove('hint')); }

    /* ---------- анимации хода ---------- */
    async animSwap(a, b, valid) {
      const ea = this.elAt(a), eb = this.elAt(b);
      if (!ea || !eb) return;
      ea.classList.add('moving'); eb.classList.add('moving');
      const d = this.ms(190);
      this.place(ea, b[0], b[1], true, d); this.place(eb, a[0], a[1], true, d);
      G.SFX.swap();
      await U.sleep(d + 10);
      if (!valid) {
        G.SFX.bad();
        this.place(ea, a[0], a[1], true, d); this.place(eb, b[0], b[1], true, d);
        await U.sleep(d + 10);
        ea.classList.add('shake'); eb.classList.add('shake');
        await U.sleep(this.ms(260));
        ea.classList.remove('shake'); eb.classList.remove('shake');
      }
      ea.classList.remove('moving'); eb.classList.remove('moving');
      ea.style.transitionDuration = ''; eb.style.transitionDuration = '';
    }

    center(r, c) {
      const rect = this.el.getBoundingClientRect();
      const cs = rect.width / 8;
      return { x: rect.left + (c + 0.5) * cs, y: rect.top + (r + 0.5) * cs };
    }

    beam(b) {
      const cls = b.sp === 'h' ? 'beam.h' : b.sp === 'v' ? 'beam.v' : b.sp === 'bomb' ? 'shock' : 'starflash';
      const el = U.el('div.' + cls);
      const color = b.t >= 0 ? BOARD.GEMS[b.t].color : '#fff';
      el.style.setProperty('--bc', color);
      if (b.sp === 'h') el.style.top = (b.r * this.cs) + 'px';
      if (b.sp === 'v') el.style.left = (b.c * this.cs) + 'px';
      if (b.sp === 'bomb') { el.style.left = ((b.c + 0.5) * this.cs) + 'px'; el.style.top = ((b.r + 0.5) * this.cs) + 'px'; }
      this.fxLayer.appendChild(el);
      setTimeout(() => el.remove(), 700);
      const p = this.center(b.r, b.c);
      G.FX.ring(p.x, p.y, color, b.sp === 'bomb' ? 120 : 60);
    }

    floatText(text, r, c, color, big) {
      const el = U.el('div.float-text' + (big ? '.big' : ''), { text });
      el.style.left = ((c + 0.5) * this.cs) + 'px';
      el.style.top = ((r + 0.5) * this.cs) + 'px';
      el.style.color = color || '#fff';
      this.fxLayer.appendChild(el);
      setTimeout(() => el.remove(), 1500 / Math.min(this.speed, 2));
    }

    banner(text, color) {
      if (this._banner) this._banner.remove();
      const el = U.el('div.board-banner', { text });
      this._banner = el;
      if (color) el.style.setProperty('--bc', color);
      this.fxLayer.appendChild(el);
      setTimeout(() => el.remove(), 1300 / Math.min(this.speed, 2));
    }

    async playSteps(steps, onStep) {
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i];
        if (st.combo) { this.el.classList.add('flash'); setTimeout(() => this.el.classList.remove('flash'), 500); G.SFX.special(); }
        st.blasts.forEach(b => this.beam(b));
        if (st.blasts.length) G.SFX.special();
        // исчезновение
        const byType = {};
        for (const cl of st.cleared) {
          const el = this.tiles.get(cl.id);
          if (!el) continue;
          el.classList.add('pop');
          this.tiles.delete(cl.id);
          setTimeout(() => el.remove(), this.ms(320));
          const p = this.center(cl.r, cl.c);
          const color = cl.t >= 0 ? BOARD.GEMS[cl.t].color : '#ffffff';
          G.FX.burst(p.x, p.y, color, this.speed > 2 ? 3 : 7, { speed: 3.5, size: 4 });
          if (cl.t >= 0) { (byType[cl.t] = byType[cl.t] || []).push(cl); }
        }
        G.SFX.pop(st.cascade);
        if (onStep) onStep(i, st, byType);
        await this.wait(240);
        // рождение спецблоков
        for (const cr of st.created) {
          const el = this.makeTile(cr);
          this.place(el, cr.r, cr.c, false);
          el.classList.add('born');
          setTimeout(() => el.classList.remove('born'), this.ms(400));
        }
        // падение
        let maxD = 0;
        for (const f of st.falls) {
          const el = this.tiles.get(f.id);
          if (!el) continue;
          const d = this.ms(110 + 60 * (f.to - f.from));
          maxD = Math.max(maxD, d);
          el.classList.add('falling');
          this.place(el, f.to, f.c, true, d);
        }
        for (const sp of st.spawns) {
          const el = this.makeTile(sp);
          this.place(el, sp.from, sp.c, false);
          el.classList.add('falling');
        }
        void this.tilesLayer.offsetWidth;
        for (const sp of st.spawns) {
          const el = this.tiles.get(sp.id);
          const d = this.ms(110 + 60 * (sp.r - sp.from));
          maxD = Math.max(maxD, d);
          this.place(el, sp.r, sp.c, true, d);
        }
        await U.sleep(maxD + 20);
        this.tiles.forEach(el => { if (el.classList.contains('falling')) { el.classList.remove('falling'); el.style.transitionDuration = ''; el.classList.add('land'); setTimeout(() => el.classList.remove('land'), 200); } });
      }
    }
  }

  G.BoardView = BoardView;
})(typeof window !== 'undefined' ? window : globalThis);
