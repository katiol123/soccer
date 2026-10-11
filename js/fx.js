/* Визуальные частицы, звук и графика (эмблемы, иконки блоков) */
(function (G) {
  'use strict';
  const U = G.U;

  /* ---------- частицы на холсте поверх экрана ---------- */
  const FX = {
    canvas: null, ctx: null, parts: [], running: false, dpr: 1,
    init() {
      this.canvas = document.getElementById('fx-canvas');
      this.ctx = this.canvas.getContext('2d');
      const resize = () => {
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = innerWidth * this.dpr; this.canvas.height = innerHeight * this.dpr;
        this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
      };
      resize(); addEventListener('resize', resize);
    },
    burst(x, y, color, count, opts) {
      opts = opts || {};
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, sp = (opts.speed || 4) * (0.4 + Math.random());
        this.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 1), life: 1, decay: 0.018 + Math.random() * 0.025,
          size: (opts.size || 4) * (0.5 + Math.random()), color, g: opts.gravity == null ? 0.12 : opts.gravity, shape: opts.shape || (Math.random() < 0.3 ? 'spark' : 'dot'), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3
        });
      }
      this.run();
    },
    confetti(colors, count) {
      for (let i = 0; i < count; i++) {
        this.parts.push({
          x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
          life: 1, decay: 0.004 + Math.random() * 0.004, size: 6 + Math.random() * 6, color: U.pick(colors), g: 0.04, shape: 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3
        });
      }
      this.run();
    },
    ring(x, y, color, maxR) {
      this.parts.push({ x, y, ring: true, r: 4, maxR: maxR || 90, life: 1, decay: 0.035, color });
      this.run();
    },
    run() {
      if (this.running) return;
      this.running = true;
      const tick = () => {
        const c = this.ctx, d = this.dpr;
        c.setTransform(d, 0, 0, d, 0, 0);
        c.clearRect(0, 0, innerWidth, innerHeight);
        c.globalCompositeOperation = 'lighter';
        this.parts = this.parts.filter(p => p.life > 0);
        for (const p of this.parts) {
          p.life -= p.decay;
          if (p.ring) {
            p.r += (p.maxR - p.r) * 0.15;
            c.globalAlpha = Math.max(0, p.life);
            c.strokeStyle = p.color; c.lineWidth = 4 * p.life;
            c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
            continue;
          }
          p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.rot += p.vr;
          c.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
          c.fillStyle = p.color;
          if (p.shape === 'rect') {
            c.globalCompositeOperation = 'source-over';
            c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore();
            c.globalCompositeOperation = 'lighter';
          } else if (p.shape === 'spark') {
            c.strokeStyle = p.color; c.lineWidth = p.size * 0.5;
            c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); c.stroke();
          } else {
            c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2); c.fill();
          }
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        if (this.parts.length) requestAnimationFrame(tick);
        else { this.running = false; c.clearRect(0, 0, innerWidth, innerHeight); }
      };
      requestAnimationFrame(tick);
    }
  };

  /* ---------- звук (синтез WebAudio, без файлов) ---------- */
  const SFX = {
    ctx: null, on: true, master: null,
    ensure() {
      if (!this.on) return null;
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
        } catch (e) { this.on = false; return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, dur, type, vol, slide) {
      const c = this.ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), c.currentTime + dur);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
    },
    noise(dur, freq, vol, q) {
      const c = this.ensure(); if (!c) return;
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, c.currentTime + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    },
    pop(c) { this.tone(420 + c * 90, 0.12, 'triangle', 0.22, 1.6); },
    swap() { this.tone(300, 0.06, 'sine', 0.12, 1.3); },
    bad() { this.tone(140, 0.18, 'square', 0.08, 0.7); },
    special() { this.tone(200, 0.35, 'sawtooth', 0.12, 4); this.noise(0.3, 3000, 0.08); },
    whistle(long) {
      const c = this.ensure(); if (!c) return;
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 2600; lfo.frequency.value = 28; lg.gain.value = 120;
      lfo.connect(lg); lg.connect(o.frequency);
      const d = long ? 0.9 : 0.35;
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.03);
      g.gain.setValueAtTime(0.06, c.currentTime + d - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d);
      o.connect(g); g.connect(this.master); o.start(); lfo.start(); o.stop(c.currentTime + d); lfo.stop(c.currentTime + d);
    },
    goal() {
      this.noise(2.4, 700, 0.5, 0.5);
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.18), i * 90));
    },
    save() { this.noise(0.6, 500, 0.25, 0.6); this.tone(180, 0.3, 'sine', 0.2, 0.6); },
    tackle() { this.tone(110, 0.15, 'square', 0.12, 0.6); },
    kick() { this.tone(90, 0.12, 'sine', 0.35, 0.5); this.noise(0.08, 2000, 0.1); }
  };

  /* ---------- эмблемы клубов ---------- */
  function crest(club, size) {
    const id = 'cr' + club.id + Math.floor(Math.random() * 1e6);
    const s = size || 48;
    const shield = 'M50 3 L94 15 V50 C94 76 74 93 50 101 C26 93 6 76 6 50 V15 Z';
    let pat = '';
    const c1 = club.c1, c2 = club.c2;
    switch (club.pat) {
      case 'stripes': for (let x = 12; x < 100; x += 20) pat += `<rect x="${x}" y="0" width="10" height="104" fill="${c2}"/>`; break;
      case 'half': pat = `<rect x="50" y="0" width="50" height="104" fill="${c2}"/>`; break;
      case 'sleeve': pat = `<rect x="0" y="0" width="100" height="30" fill="${c2}"/>`; break;
      case 'band': pat = `<rect x="0" y="72" width="100" height="14" fill="${c2}"/><rect x="0" y="16" width="100" height="6" fill="${c2}"/>`; break;
      case 'chevron': pat = `<path d="M0 20 L50 55 L100 20 V40 L50 75 L0 40Z" fill="${c2}"/>`; break;
      default: pat = `<circle cx="50" cy="52" r="30" fill="none" stroke="${c2}" stroke-width="5"/>`;
    }
    const light = false;
    const tc = '#fff';
    return `<svg class="crest" width="${s}" height="${s * 1.04}" viewBox="0 0 100 104" aria-hidden="true">
      <defs><clipPath id="${id}"><path d="${shield}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
      <g clip-path="url(#${id})"><rect width="100" height="104" fill="${c1}"/>${pat}<rect width="100" height="104" fill="url(#${id}g)"/></g>
      <path d="${shield}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="4"/>
      <text x="50" y="62" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="800" font-size="24" fill="${tc}" stroke="rgba(0,0,0,.7)" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${club.short}</text>
    </svg>`;
  }
  function isLight(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 170;
  }

  /* ---------- иконки блоков ---------- */
  const GEM_ICONS = [
    // Удар — мяч
    `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#fff"/><path d="M20 13 l5.5 4 -2.1 6.5 h-6.8 l-2.1 -6.5z" fill="#1a1a1a"/><path d="M20 7v6M25.5 17l6-2M23.4 23.5l3.6 5.2M16.6 23.5L13 28.7M14.5 17l-6-2" stroke="#1a1a1a" stroke-width="1.6"/></svg>`,
    // Пас — изогнутая стрелка
    `<svg viewBox="0 0 40 40"><path d="M8 28 C 10 14, 22 9, 30 14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M25 9 L33 15 L25 19" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="29" r="3" fill="#fff"/></svg>`,
    // Дриблинг — зигзаг
    `<svg viewBox="0 0 40 40"><path d="M7 30 L14 18 L21 26 L30 11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 10 L31 10 L31 17" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    // Скорость — молния
    `<svg viewBox="0 0 40 40"><path d="M23 5 L10 22 H19 L16 35 L30 17 H21 Z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    // Отбор — бутса
    `<svg viewBox="0 0 40 40"><path d="M9 11 h10 v9 l9 3.5 c4 1.5 4.5 7.5 0 7.5 H9 Z" fill="#fff"/><g fill="#fff"><rect x="10" y="32" width="3" height="3" rx="1"/><rect x="17" y="32" width="3" height="3" rx="1"/><rect x="24" y="32" width="3" height="3" rx="1"/></g><path d="M12 15h5M12 19h5" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/></svg>`,
    // Позиция — щит
    `<svg viewBox="0 0 40 40"><path d="M20 5 L32 9.5 V19 C32 27 26.5 32.5 20 35 C13.5 32.5 8 27 8 19 V9.5 Z" fill="#fff"/><path d="M20 10 V30 M13 17 H27" stroke="rgba(0,0,0,.3)" stroke-width="2"/></svg>`
  ];
  const STAR_ICON = `<svg viewBox="0 0 40 40"><path d="M20 4 L24.5 15 L36 15.5 L27 23 L30.5 34.5 L20 28 L9.5 34.5 L13 23 L4 15.5 L15.5 15 Z" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`;

  /* Яркий «экранный» цвет клуба для шкал и подсветки на тёмном фоне */
  function lum(hex) {
    const h = hex.replace('#', '');
    return parseInt(h.substr(0, 2), 16) * 0.299 + parseInt(h.substr(2, 2), 16) * 0.587 + parseInt(h.substr(4, 2), 16) * 0.114;
  }
  function teamColor(club) {
    if (lum(club.c1) >= 70) return club.c1;
    if (lum(club.c2) >= 70 && lum(club.c2) < 235) return club.c2;
    if (club.c3 && lum(club.c3) >= 70 && lum(club.c3) < 235) return club.c3;
    return '#8fb4ff';
  }

  G.FX = FX; G.SFX = SFX; G.GFX = { crest, GEM_ICONS, STAR_ICON, isLight, teamColor };
})(typeof window !== 'undefined' ? window : globalThis);
