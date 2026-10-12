/* Генератор лиц игроков: лицо собирается из элементов (форма головы, кожа, причёска, брови, глаза, нос, рот,
   растительность, приметы) по «семени» игрока — у каждого своё, в каждой новой игре другое (имена и id новые).
   Выражение зависит от текущего настроения, возраст добавляет седину, залысины и морщины, травма — пластырь. */
(function (G) {
  'use strict';

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hex = c => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); };
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const shade = (c, k) => mix(c, k < 0 ? '#000000' : '#ffffff', Math.abs(k));
  const f1 = n => Math.round(n * 10) / 10;

  const SKIN = ['#f6d7c3', '#eec1a1', '#e0ac85', '#d29a6e', '#bd8158', '#a36a43', '#8a5534', '#6e4127', '#57321e', '#f3cfb0'];
  const HAIR = ['#14100e', '#2b1d14', '#3f2a1c', '#5a3a22', '#7a5230', '#a87b4c', '#d8b06a', '#e8d29a', '#a8432a', '#c25a2c'];
  const DYED = ['#f2f2f2', '#3a6fd8', '#e0459b', '#2fb86a', '#f0c419', '#8e44ad'];
  const EYES = ['#3b2516', '#5a3a22', '#2d6aa3', '#4a8a5c', '#6e7f8a', '#1c1c1c', '#8a6b2e'];

  /* Внешность — постоянные черты игрока */
  function genes(p) {
    const r = rng(hash(String(p.id) + '|' + p.name));
    const pick = a => a[Math.floor(r() * a.length)];
    const w = (arr) => { let s = 0; for (const x of arr) s += x[1]; let v = r() * s; for (const x of arr) { v -= x[1]; if (v <= 0) return x[0]; } return arr[0][0]; };
    const skinI = Math.floor(r() * SKIN.length);
    const dark = skinI >= 5 && skinI <= 8;
    let hairC = dark ? (r() < 0.9 ? pick(HAIR.slice(0, 3)) : pick(HAIR)) : pick(HAIR);
    const dyed = r() < 0.07;
    if (dyed) hairC = pick(DYED);
    const style = dark
      ? w([['bald', 6], ['buzz', 16], ['short', 8], ['afro', 10], ['curly', 10], ['dreads', 9], ['mohawk', 6], ['flat', 7], ['twists', 7], ['bun', 3], ['spiky', 3], ['band', 4]])
      : w([['bald', 4], ['buzz', 10], ['short', 12], ['side', 12], ['quiff', 8], ['spiky', 7], ['curly', 6], ['long', 6], ['bun', 5], ['mullet', 4], ['undercut', 9], ['mohawk', 3], ['flat', 2], ['band', 4], ['bowl', 3]]);
    return {
      skin: SKIN[skinI], hairC, dyed, style,
      hw: 20 + r() * 6,            // полуширина головы
      top: 17 + r() * 4,           // макушка
      chin: 81 + r() * 6,          // подбородок
      jaw: 0.5 + r() * 0.48,       // ширина челюсти (0.5 — клин, 1 — квадрат)
      chinFlat: r() * 5,
      ear: 0.8 + r() * 0.5,
      eyeY: 47 + r() * 4, eyeDx: 8.5 + r() * 3.2, eyeRx: 3.6 + r() * 1.4, eyeRy: 2.2 + r() * 1.6, eyeC: pick(EYES), lid: r() < 0.25,
      brow: w([['thin', 3], ['norm', 6], ['thick', 4], ['uni', 1], ['bushy', 2]]), browTilt: (r() - 0.5) * 2,
      nose: w([['small', 4], ['button', 3], ['long', 3], ['wide', 3], ['hook', 2], ['broad', 2], ['pointy', 2]]), noseL: 9 + r() * 5,
      mw: 5.5 + r() * 4.5, lips: r() < 0.35,
      beard: w([['none', 10], ['stubble', 6], ['moustache', 2], ['goatee', 3], ['full', 4], ['chinstrap', 2], ['handlebar', 1], ['soul', 1]]),
      hairline: r(), greyEarly: r() < 0.25, balding: r() < 0.35,
      freckles: r() < (hairC === HAIR[8] || hairC === HAIR[9] ? 0.55 : 0.08),
      scar: r() < 0.06 ? (r() < 0.5 ? 1 : -1) : 0, mole: r() < 0.1 ? [r() * 2 - 1, r()] : null,
      earring: r() < 0.12 ? (r() < 0.5 ? 1 : -1) : 0, tattoo: r() < 0.07, bandC: pick(['#ffffff', '#e23b3b', '#2a2a2a', '#3a6fd8', '#f0c419']),
      vol: r(), part: r() < 0.5 ? 1 : -1, cheek: r() < 0.3
    };
  }

  /* Выражение по настроению: 0..100 → от злости до широкой улыбки */
  function mood(m) {
    m = m == null ? 60 : m;
    if (m >= 80) return { k: 'joy', smile: 1, brow: 0.6, sq: 0.75 };
    if (m >= 60) return { k: 'ok', smile: 0.5, brow: 0.2, sq: 0.95 };
    if (m >= 40) return { k: 'flat', smile: 0, brow: 0, sq: 1 };
    if (m >= 20) return { k: 'sad', smile: -0.6, brow: -1, sq: 0.9 };
    return { k: 'angry', smile: -0.7, brow: 1.6, sq: 0.8 };
  }

  function headPath(g) {
    const { hw, top, chin, jaw } = g, cy = 52, jx = hw * jaw;
    return `M50,${f1(top)} C${f1(50 + hw * 0.92)},${f1(top)} ${f1(50 + hw)},${f1(top + 13)} ${f1(50 + hw)},${cy} ` +
      `C${f1(50 + hw)},${f1(cy + 15)} ${f1(50 + jx + 3)},${f1(chin - 6)} ${f1(50 + g.chinFlat)},${f1(chin)} ` +
      `L${f1(50 - g.chinFlat)},${f1(chin)} C${f1(50 - jx - 3)},${f1(chin - 6)} ${f1(50 - hw)},${f1(cy + 15)} ${f1(50 - hw)},${cy} ` +
      `C${f1(50 - hw)},${f1(top + 13)} ${f1(50 - hw * 0.92)},${f1(top)} 50,${f1(top)} Z`;
  }

  /* Причёска: задний слой (за головой) и передний (поверх) */
  function hair(g, age, out) {
    const { hw, top } = g, c = g.hairC, cd = shade(c, -0.25);
    let style = g.style;
    // с возрастом у склонных — залысины
    if (g.balding && age >= 31 && ['short', 'side', 'quiff', 'spiky', 'undercut', 'bowl', 'flat'].includes(style)) style = age >= 34 ? 'horseshoe' : 'recede';
    const L = 50 - hw - 1.2, R = 50 + hw + 1.2;
    const hl = top + 9 + g.hairline * 4;          // линия роста волос
    const vol = 3 + g.vol * 5;
    const cap = (h, lineY, side) => `M${f1(L)},${f1(lineY + (side || 12))} C${f1(L - 0.5)},${f1(top - h)} ${f1(R + 0.5)},${f1(top - h)} ${f1(R)},${f1(lineY + (side || 12))} ` +
      `L${f1(R - 2)},${f1(lineY + 4)} Q50,${f1(lineY - 3)} ${f1(L + 2)},${f1(lineY + 4)} Z`;
    const back = [], front = [];
    switch (style) {
      case 'bald': front.push(`<ellipse cx="${f1(50 - hw * 0.35)}" cy="${f1(top + 6)}" rx="5" ry="2.4" fill="#fff" opacity=".22"/>`); break;
      case 'buzz': front.push(`<path d="${cap(1.5, hl, 8)}" fill="${c}" opacity=".55"/>`); break;
      case 'short': front.push(`<path d="${cap(vol * 0.6, hl, 10)}" fill="${c}"/>`); break;
      case 'side': front.push(`<path d="${cap(vol * 0.7, hl, 10)}" fill="${c}"/>`, `<path d="M${f1(50 + g.part * hw * 0.35)},${f1(top - vol * 0.4)} Q${f1(50 - g.part * hw * 0.2)},${f1(hl - 4)} ${f1(50 - g.part * hw)},${f1(hl + 3)} L${f1(50 - g.part * hw * 0.3)},${f1(hl - 1)} Z" fill="${cd}"/>`, `<path d="M${f1(50 + g.part * hw * 0.35)},${f1(top - vol * 0.4)} L${f1(50 + g.part * hw * 0.45)},${f1(hl)}" stroke="${shade(c, 0.35)}" stroke-width=".8"/>`); break;
      case 'quiff': front.push(`<path d="${cap(vol * 0.6, hl, 10)}" fill="${c}"/>`, `<path d="M${f1(50 - hw * 0.7)},${f1(hl)} C${f1(50 - hw * 0.6)},${f1(top - 14)} ${f1(50 + hw * 0.8)},${f1(top - 16)} ${f1(50 + hw * 0.7)},${f1(hl - 2)} Z" fill="${c}"/>`, `<path d="M${f1(50 - hw * 0.3)},${f1(top - 6)} Q50,${f1(top - 12)} ${f1(50 + hw * 0.5)},${f1(top - 8)}" stroke="${shade(c, 0.3)}" stroke-width=".9" fill="none"/>`); break;
      case 'spiky': {
        let d = `M${f1(L)},${f1(hl + 8)} `;
        const n = 7;
        for (let i = 0; i <= n; i++) { const x = L + (R - L) * i / n, y = top - 2 - (i % 2 ? 0 : 7 + g.vol * 4) + Math.abs(i - n / 2) * 1.2; d += `L${f1(x)},${f1(y)} `; }
        d += `L${f1(R)},${f1(hl + 8)} Q50,${f1(hl - 2)} ${f1(L)},${f1(hl + 8)} Z`;
        front.push(`<path d="${d}" fill="${c}"/>`); break;
      }
      case 'curly': case 'afro': {
        const big = style === 'afro';
        if (big) back.push(`<ellipse cx="50" cy="${f1(top + 14)}" rx="${f1(hw + 10 + g.vol * 5)}" ry="${f1(hw + 6 + g.vol * 4)}" fill="${c}"/>`);
        const rr = big ? 5.5 : 3.6, n = big ? 9 : 8;
        for (let i = 0; i < n; i++) { const a = Math.PI * (1 - i / (n - 1)); front.push(`<circle cx="${f1(50 + Math.cos(a) * (hw - 1))}" cy="${f1(hl - 2 - Math.sin(a) * (hl - top + (big ? 6 : 2)))}" r="${rr}" fill="${i % 2 ? c : cd}"/>`); }
        front.push(`<path d="${cap(big ? 6 : 3, hl, 6)}" fill="${c}"/>`); break;
      }
      case 'twists': {
        front.push(`<path d="${cap(4, hl, 8)}" fill="${c}"/>`);
        for (let i = 0; i < 9; i++) { const x = L + 2 + (R - L - 4) * i / 8; front.push(`<rect x="${f1(x - 1.6)}" y="${f1(top - 7 + Math.abs(i - 4) * 1.4)}" width="3.2" height="9" rx="1.6" fill="${i % 2 ? c : cd}"/>`); }
        break;
      }
      case 'dreads': {
        for (let i = 0; i < 10; i++) { const x = L - 2 + (R - L + 4) * i / 9; back.push(`<rect x="${f1(x - 1.8)}" y="${f1(top + 8)}" width="3.6" height="${f1(40 + (i % 3) * 6)}" rx="1.8" fill="${i % 2 ? c : cd}"/>`); }
        front.push(`<path d="${cap(5, hl, 12)}" fill="${c}"/>`);
        for (let i = 0; i < 6; i++) front.push(`<path d="M${f1(L + 3 + i * (R - L - 6) / 5)},${f1(top)} l0,${f1(hl - top + 2)}" stroke="${cd}" stroke-width="1"/>`);
        break;
      }
      case 'mohawk': front.push(`<path d="${cap(1, hl, 8)}" fill="${c}" opacity=".3"/>`, `<path d="M${f1(50 - 4.5)},${f1(hl + 1)} C${f1(50 - 5)},${f1(top - 16 - g.vol * 6)} ${f1(50 + 5)},${f1(top - 16 - g.vol * 6)} ${f1(50 + 4.5)},${f1(hl + 1)} Z" fill="${c}"/>`); break;
      case 'long': back.push(`<path d="M${f1(L - 2)},${f1(top + 10)} C${f1(L - 6)},${f1(top + 40)} ${f1(L - 2)},${f1(top + 62)} ${f1(L + 6)},${f1(top + 66)} L${f1(R - 6)},${f1(top + 66)} C${f1(R + 2)},${f1(top + 62)} ${f1(R + 6)},${f1(top + 40)} ${f1(R + 2)},${f1(top + 10)} Z" fill="${c}"/>`);
        front.push(`<path d="${cap(vol * 0.7, hl, 22)}" fill="${c}"/>`, `<path d="M50,${f1(top - 2)} Q${f1(50 - hw * 0.6)},${f1(hl)} ${f1(L + 1)},${f1(hl + 18)}" stroke="${cd}" stroke-width="1" fill="none"/>`); break;
      case 'band': back.push(`<path d="M${f1(L - 3)},${f1(top + 8)} C${f1(L - 8)},${f1(top + 34)} ${f1(L - 4)},${f1(top + 52)} ${f1(L + 4)},${f1(top + 56)} L${f1(R - 4)},${f1(top + 56)} C${f1(R + 4)},${f1(top + 52)} ${f1(R + 8)},${f1(top + 34)} ${f1(R + 3)},${f1(top + 8)} Z" fill="${c}"/>`);
        front.push(`<path d="${cap(vol, hl, 14)}" fill="${c}"/>`, `<path d="M${f1(L)},${f1(hl + 1)} Q50,${f1(hl - 7)} ${f1(R)},${f1(hl + 1)}" stroke="${g.bandC}" stroke-width="3.2" fill="none"/>`); break;
      case 'bun': front.push(`<path d="${cap(3, hl, 10)}" fill="${c}"/>`, `<circle cx="50" cy="${f1(top - 5)}" r="${f1(5 + g.vol * 2)}" fill="${c}"/>`, `<path d="M45.5,${f1(top - 1)} L54.5,${f1(top - 1)}" stroke="${cd}" stroke-width="1.4"/>`); break;
      case 'mullet': back.push(`<path d="M${f1(L)},${f1(top + 24)} L${f1(L - 2)},${f1(top + 52)} L${f1(R + 2)},${f1(top + 52)} L${f1(R)},${f1(top + 24)} Z" fill="${c}"/>`); front.push(`<path d="${cap(vol * 0.5, hl, 16)}" fill="${c}"/>`); break;
      case 'undercut': front.push(`<path d="${cap(1, hl, 10)}" fill="${c}" opacity=".35"/>`, `<path d="M${f1(L + 3)},${f1(hl)} C${f1(L + 2)},${f1(top - 9 - g.vol * 3)} ${f1(R)},${f1(top - 8)} ${f1(R - 1)},${f1(hl - 1)} Q50,${f1(top + 1)} ${f1(L + 3)},${f1(hl)} Z" fill="${c}"/>`, `<path d="M${f1(50 - hw * 0.5)},${f1(top - 3)} Q${f1(50 + hw * 0.2)},${f1(top - 8)} ${f1(R - 3)},${f1(top + 2)}" stroke="${shade(c, 0.3)}" stroke-width=".8" fill="none"/>`); break;
      case 'flat': front.push(`<path d="M${f1(L + 1)},${f1(hl + 6)} L${f1(L + 1)},${f1(top - 7 - g.vol * 3)} L${f1(R - 1)},${f1(top - 7 - g.vol * 3)} L${f1(R - 1)},${f1(hl + 6)} Q50,${f1(hl - 1)} ${f1(L + 1)},${f1(hl + 6)} Z" fill="${c}"/>`); break;
      case 'bowl': front.push(`<path d="M${f1(L - 1)},${f1(hl + 10)} C${f1(L - 2)},${f1(top - vol)} ${f1(R + 2)},${f1(top - vol)} ${f1(R + 1)},${f1(hl + 10)} L${f1(R - 1)},${f1(hl + 4)} L${f1(L + 1)},${f1(hl + 4)} Z" fill="${c}"/>`); break;
      case 'recede': front.push(`<path d="${cap(vol * 0.4, hl + 5, 6)}" fill="${c}"/>`, `<ellipse cx="50" cy="${f1(hl + 1)}" rx="${f1(hw * 0.45)}" ry="5" fill="${g.skin}"/>`); break;
      case 'horseshoe': front.push(`<path d="M${f1(L)},${f1(hl + 14)} C${f1(L - 1)},${f1(hl)} ${f1(L + 3)},${f1(top + 8)} ${f1(L + 6)},${f1(top + 6)} L${f1(L + 5)},${f1(hl + 12)} Z" fill="${c}"/>`, `<path d="M${f1(R)},${f1(hl + 14)} C${f1(R + 1)},${f1(hl)} ${f1(R - 3)},${f1(top + 8)} ${f1(R - 6)},${f1(top + 6)} L${f1(R - 5)},${f1(hl + 12)} Z" fill="${c}"/>`, `<ellipse cx="${f1(50 - hw * 0.3)}" cy="${f1(top + 6)}" rx="5" ry="2.4" fill="#fff" opacity=".2"/>`); break;
    }
    out.back = back.join(''); out.front = front.join('');
  }

  function beard(g, ex, mouthY, c) {
    const { hw, chin, jaw } = g, jx = hw * jaw;
    switch (g.beard) {
      case 'stubble': return `<path d="M${f1(50 - hw * 0.92)},${f1(mouthY - 5)} C${f1(50 - hw * 0.9)},${f1(mouthY + 6)} ${f1(50 - jx - 2)},${f1(chin - 4)} 50,${f1(chin)} C${f1(50 + jx + 2)},${f1(chin - 4)} ${f1(50 + hw * 0.9)},${f1(mouthY + 6)} ${f1(50 + hw * 0.92)},${f1(mouthY - 5)} C${f1(50 + hw * 0.5)},${f1(mouthY - 1)} ${f1(50 + g.mw)},${f1(mouthY - 5)} 50,${f1(mouthY - 4)} C${f1(50 - g.mw)},${f1(mouthY - 5)} ${f1(50 - hw * 0.5)},${f1(mouthY - 1)} ${f1(50 - hw * 0.92)},${f1(mouthY - 5)} Z" fill="${c}" opacity=".2"/>`;
      case 'full': return `<path d="M${f1(50 - hw)},${f1(mouthY - 12)} C${f1(50 - hw - 1)},${f1(mouthY + 8)} ${f1(50 - jx - 4)},${f1(chin + 4)} 50,${f1(chin + 5)} C${f1(50 + jx + 4)},${f1(chin + 4)} ${f1(50 + hw + 1)},${f1(mouthY + 8)} ${f1(50 + hw)},${f1(mouthY - 12)} L${f1(50 + hw - 3)},${f1(mouthY - 6)} Q50,${f1(mouthY - 7)} ${f1(50 - hw + 3)},${f1(mouthY - 6)} Z" fill="${c}"/>` +
        `<ellipse cx="50" cy="${f1(mouthY + 0.5)}" rx="${f1(g.mw + 1.5)}" ry="2.6" fill="${g.skin}" opacity=".9"/>`;
      case 'goatee': return `<path d="M${f1(50 - g.mw * 0.7)},${f1(mouthY + 3)} Q50,${f1(chin + 4)} ${f1(50 + g.mw * 0.7)},${f1(mouthY + 3)} Q50,${f1(mouthY + 6)} ${f1(50 - g.mw * 0.7)},${f1(mouthY + 3)} Z" fill="${c}"/>` + `<path d="M${f1(50 - g.mw - 1)},${f1(mouthY - 1)} Q50,${f1(mouthY - 5)} ${f1(50 + g.mw + 1)},${f1(mouthY - 1)}" stroke="${c}" stroke-width="1.8" fill="none"/>`;
      case 'moustache': return `<path d="M${f1(50 - g.mw - 1)},${f1(mouthY - 0.5)} Q50,${f1(mouthY - 6)} ${f1(50 + g.mw + 1)},${f1(mouthY - 0.5)} Q50,${f1(mouthY - 3)} ${f1(50 - g.mw - 1)},${f1(mouthY - 0.5)} Z" fill="${c}"/>`;
      case 'handlebar': return `<path d="M${f1(50 - g.mw - 4)},${f1(mouthY - 4)} Q${f1(50 - g.mw - 2)},${f1(mouthY + 1)} ${f1(50 - g.mw + 1)},${f1(mouthY - 2)} Q50,${f1(mouthY - 6)} ${f1(50 + g.mw - 1)},${f1(mouthY - 2)} Q${f1(50 + g.mw + 2)},${f1(mouthY + 1)} ${f1(50 + g.mw + 4)},${f1(mouthY - 4)} Q50,${f1(mouthY - 2)} ${f1(50 - g.mw - 4)},${f1(mouthY - 4)} Z" fill="${c}"/>`;
      case 'chinstrap': return `<path d="M${f1(50 - hw)},${f1(mouthY - 14)} C${f1(50 - hw)},${f1(mouthY + 6)} ${f1(50 - jx - 3)},${f1(chin - 2)} 50,${f1(chin + 1)} C${f1(50 + jx + 3)},${f1(chin - 2)} ${f1(50 + hw)},${f1(mouthY + 6)} ${f1(50 + hw)},${f1(mouthY - 14)}" stroke="${c}" stroke-width="2.6" fill="none"/>`;
      case 'soul': return `<path d="M48.4,${f1(mouthY + 3)} L51.6,${f1(mouthY + 3)} L50,${f1(mouthY + 7)} Z" fill="${c}"/>`;
    }
    return '';
  }

  function nose(g, y0, skinD) {
    const y1 = y0 + g.noseL, s = `stroke="${skinD}" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    switch (g.nose) {
      case 'small': return `<path d="M48.5,${f1(y1 - 1)} Q50,${f1(y1 + 1)} 51.5,${f1(y1 - 1)}" ${s}/>`;
      case 'button': return `<circle cx="50" cy="${f1(y1 - 1.5)}" r="2.6" fill="${skinD}" opacity=".35"/><path d="M47.5,${f1(y1)} Q50,${f1(y1 + 1.5)} 52.5,${f1(y1)}" ${s}/>`;
      case 'long': return `<path d="M50.5,${f1(y0)} L51.5,${f1(y1 - 1)} Q50,${f1(y1 + 1.5)} 48,${f1(y1)}" ${s}/>`;
      case 'wide': return `<path d="M50,${f1(y0 + 3)} L50.6,${f1(y1 - 3)} M45.8,${f1(y1 - 1)} Q47,${f1(y1 + 1.5)} 50,${f1(y1 + 0.5)} Q53,${f1(y1 + 1.5)} 54.2,${f1(y1 - 1)}" ${s}/>`;
      case 'hook': return `<path d="M49.5,${f1(y0)} Q53.5,${f1(y0 + g.noseL * 0.5)} 52,${f1(y1)} Q50,${f1(y1 + 1)} 48.5,${f1(y1 - 0.5)}" ${s}/>`;
      case 'broad': return `<path d="M48.5,${f1(y0 + 2)} L47.5,${f1(y1 - 2)} M44.8,${f1(y1)} Q50,${f1(y1 + 3)} 55.2,${f1(y1)}" ${s}/><ellipse cx="50" cy="${f1(y1 - 1.2)}" rx="4.5" ry="2" fill="${skinD}" opacity=".25"/>`;
      case 'pointy': return `<path d="M50,${f1(y0)} L53,${f1(y1)} L48.5,${f1(y1 - 0.3)}" ${s}/>`;
    }
    return '';
  }

  function mouth(g, y, e, skinD) {
    const w = g.mw, lip = g.lips ? mix(skinD, '#b5524a', 0.5) : skinD;
    if (e.k === 'joy') return `<path d="M${f1(50 - w - 0.5)},${f1(y - 1)} Q50,${f1(y + 8)} ${f1(50 + w + 0.5)},${f1(y - 1)} Q50,${f1(y + 1)} ${f1(50 - w - 0.5)},${f1(y - 1)} Z" fill="#5b1f1f"/><path d="M${f1(50 - w + 1)},${f1(y - 0.2)} Q50,${f1(y + 1.6)} ${f1(50 + w - 1)},${f1(y - 0.2)} L${f1(50 + w - 2)},${f1(y + 1.6)} Q50,${f1(y + 3)} ${f1(50 - w + 2)},${f1(y + 1.6)} Z" fill="#fff"/>`;
    if (e.k === 'angry') return `<rect x="${f1(50 - w * 0.75)}" y="${f1(y - 1.2)}" width="${f1(w * 1.5)}" height="3" rx="1.2" fill="#fff" stroke="${lip}" stroke-width="1.1"/><path d="M${f1(50 - w * 0.75)},${f1(y + 0.3)} L${f1(50 + w * 0.75)},${f1(y + 0.3)}" stroke="#999" stroke-width=".5"/><path d="M${f1(50 - w * 0.95)},${f1(y + 2.5)} L${f1(50 - w * 0.75)},${f1(y + 1)} M${f1(50 + w * 0.95)},${f1(y + 2.5)} L${f1(50 + w * 0.75)},${f1(y + 1)}" stroke="${lip}" stroke-width="1"/>`;
    const c = e.smile * 4;
    return `<path d="M${f1(50 - w)},${f1(y - c * 0.3)} Q50,${f1(y + c)} ${f1(50 + w)},${f1(y - c * 0.3)}" stroke="${lip}" stroke-width="${g.lips ? 2 : 1.5}" fill="none" stroke-linecap="round"/>`;
  }

  function eyes(g, e, browC) {
    const out = [], y = g.eyeY, ry = g.eyeRy * e.sq;
    for (const s of [-1, 1]) {
      const x = 50 + s * g.eyeDx;
      out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(g.eyeRx)}" ry="${f1(ry)}" fill="#fff"/>`);
      const ir = Math.min(ry, 2.1);
      out.push(`<circle cx="${f1(x)}" cy="${f1(y + (e.k === 'sad' ? 0.6 : 0))}" r="${f1(ir)}" fill="${g.eyeC}"/><circle cx="${f1(x)}" cy="${f1(y + (e.k === 'sad' ? 0.6 : 0))}" r="${f1(ir * 0.5)}" fill="#111"/><circle cx="${f1(x + 0.7)}" cy="${f1(y - 0.7)}" r=".55" fill="#fff"/>`);
      if (g.lid || e.k === 'sad') out.push(`<path d="M${f1(x - g.eyeRx)},${f1(y - ry * 0.2)} Q${f1(x)},${f1(y - ry * 1.3)} ${f1(x + g.eyeRx)},${f1(y - ry * 0.2)} L${f1(x + g.eyeRx)},${f1(y - ry - 0.6)} L${f1(x - g.eyeRx)},${f1(y - ry - 0.6)} Z" fill="${g.skin}"/>`);
      out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(g.eyeRx)}" ry="${f1(ry)}" fill="none" stroke="${shade(g.skin, -0.45)}" stroke-width=".7"/>`);
      if (e.k === 'joy') out.push(`<path d="M${f1(x - g.eyeRx)},${f1(y + ry + 1)} Q${f1(x)},${f1(y + ry + 0.2)} ${f1(x + g.eyeRx)},${f1(y + ry + 1)}" stroke="${shade(g.skin, -0.3)}" stroke-width=".6" fill="none"/>`);
      // брови: злость — внутренние концы вниз, грусть — вверх
      const by = y - ry - 3.2, inner = x - s * g.eyeRx * 0.9, outer = x + s * (g.eyeRx + 1);
      const tilt = g.browTilt + (e.k === 'angry' ? 4 : e.k === 'sad' ? -2.4 : e.k === 'joy' ? -0.6 : 0);
      const th = { thin: 1.1, norm: 1.7, thick: 2.4, uni: 2, bushy: 3 }[g.brow] * (e.k === 'angry' ? 1.25 : 1);
      out.push(`<path d="M${f1(inner)},${f1(by + tilt * 0.6)} Q${f1(x)},${f1(by - 1.4 - (e.k === 'joy' ? 0.8 : 0))} ${f1(outer)},${f1(by - tilt * 0.3 + 0.6)}" stroke="${browC}" stroke-width="${th}" fill="none" stroke-linecap="round"/>`);
    }
    if (g.brow === 'uni') out.push(`<path d="M${f1(50 - g.eyeDx + g.eyeRx * 0.9)},${f1(y - ry - 3 + (e.k === 'angry' ? 1.5 : 0))} L${f1(50 + g.eyeDx - g.eyeRx * 0.9)},${f1(y - ry - 3 + (e.k === 'angry' ? 1.5 : 0))}" stroke="${browC}" stroke-width="1.6"/>`);
    return out.join('');
  }

  const cache = new Map();
  /* SVG-лицо игрока. club — для цвета формы (c1/c2), необязателен */
  function svg(p, club) {
    const md = p.mood == null ? 60 : p.mood, e = mood(md);
    const age = p.age || 25;
    const key = p.id + '|' + p.name + '|' + e.k + '|' + age + '|' + (p.inj > 0 ? 1 : 0) + '|' + (club ? club.c1 + club.c2 : '');
    if (cache.has(key)) return cache.get(key);
    const g = genes(p);
    // седина: с ~31 года (раньше — у склонных), краска седину не скрывает только у окрашенных
    const greyStart = g.greyEarly ? 28 : 32;
    const grey = !g.dyed && age > greyStart ? Math.min(0.75, (age - greyStart) / 9) : 0;
    const hc = grey ? mix(g.hairC, '#c9c9c9', grey) : g.hairC;
    const gg = Object.assign({}, g, { hairC: hc });
    const skinD = shade(g.skin, -0.3), c1 = club ? club.c1 : '#5b6270', c2 = club ? club.c2 : '#d9dde3';
    const h = {}; hair(gg, age, h);
    const mouthY = g.eyeY + 3 + g.noseL + 6.5;
    const parts = [];
    parts.push(h.back);
    // шея и футболка
    parts.push(`<path d="M42,${f1(g.chin - 8)} L42,96 L58,96 L58,${f1(g.chin - 8)} Z" fill="${shade(g.skin, -0.12)}"/>`);
    if (g.tattoo) parts.push(`<path d="M53,${f1(g.chin + 1)} q2,3 0,6 q-2,3 0,5" stroke="#2f4f5f" stroke-width="1.2" fill="none" opacity=".75"/>`);
    parts.push(`<path d="M10,100 C12,92 26,88 40,87 L50,95 L60,87 C74,88 88,92 90,100 Z" fill="${c1}"/><path d="M40,87 L50,95 L60,87" stroke="${c2}" stroke-width="2.4" fill="none"/>`);
    // уши
    for (const s of [-1, 1]) parts.push(`<ellipse cx="${f1(50 + s * g.hw)}" cy="${f1(g.eyeY + 3)}" rx="${f1(3.6 * g.ear)}" ry="${f1(6 * g.ear)}" fill="${g.skin}" stroke="${skinD}" stroke-width=".6"/>`);
    if (g.earring) parts.push(`<circle cx="${f1(50 + g.earring * g.hw)}" cy="${f1(g.eyeY + 3 + 6 * g.ear)}" r="1.4" fill="#ffd54a" stroke="#a88a20" stroke-width=".4"/>`);
    parts.push(`<path d="${headPath(g)}" fill="${g.skin}" stroke="${skinD}" stroke-width=".7"/>`);
    // морщины и румянец
    if (age >= 33) parts.push(`<path d="M${f1(50 - g.hw * 0.45)},${f1(g.top + 13)} Q50,${f1(g.top + 11.5)} ${f1(50 + g.hw * 0.45)},${f1(g.top + 13)} M${f1(50 - g.hw * 0.35)},${f1(g.top + 16)} Q50,${f1(g.top + 14.8)} ${f1(50 + g.hw * 0.35)},${f1(g.top + 16)}" stroke="${skinD}" stroke-width=".55" fill="none" opacity=".7"/>`);
    if (age >= 35) for (const s of [-1, 1]) parts.push(`<path d="M${f1(50 + s * (g.eyeDx + g.eyeRx + 1))},${f1(g.eyeY - 1)} l${s * 2},-1 M${f1(50 + s * (g.eyeDx + g.eyeRx + 1))},${f1(g.eyeY + 1)} l${s * 2},1" stroke="${skinD}" stroke-width=".5"/>`);
    if (g.cheek || e.k === 'joy') for (const s of [-1, 1]) parts.push(`<ellipse cx="${f1(50 + s * (g.eyeDx + 2))}" cy="${f1(g.eyeY + 8)}" rx="3.6" ry="2" fill="#e0607a" opacity="${e.k === 'joy' ? 0.28 : 0.15}"/>`);
    if (e.k === 'angry') parts.push(`<ellipse cx="50" cy="${f1(g.top + 13)}" rx="${f1(g.hw * 0.62)}" ry="6" fill="#d23b3b" opacity=".16"/>` + [-1, 1].map(s => `<ellipse cx="${f1(50 + s * (g.eyeDx + 2))}" cy="${f1(g.eyeY + 8)}" rx="4" ry="2.4" fill="#d23b3b" opacity=".25"/>`).join('') + `<path d="M47,${f1(g.eyeY - 7)} l1.2,2 M53,${f1(g.eyeY - 7)} l-1.2,2" stroke="${skinD}" stroke-width=".7"/>`);
    if (g.freckles) for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); parts.push(`<circle cx="${f1(50 + s * (5 + k * 1.9 + (k % 2) * 0.6))}" cy="${f1(g.eyeY + 5 + (k % 3) * 1.4)}" r=".55" fill="${shade(g.skin, -0.35)}"/>`); }
    if (g.mole) parts.push(`<circle cx="${f1(50 + g.mole[0] * g.hw * 0.6)}" cy="${f1(g.eyeY + 8 + g.mole[1] * 10)}" r=".9" fill="#4a2e22"/>`);
    parts.push(beard(gg, null, mouthY, hc));
    parts.push(eyes(gg, e, g.brow === 'thin' ? shade(hc, 0.1) : shade(hc, -0.1)));
    parts.push(nose(g, g.eyeY + 3, skinD));
    parts.push(mouth(g, mouthY, e, skinD));
    if (e.k === 'sad') parts.push(`<path d="M${f1(50 + g.eyeDx + 1)},${f1(g.eyeY + 3)} q.9,2 0,2.8 q-.9,-.8 0,-2.8 Z" fill="#7cc6ff" opacity=".85"/>`);
    if (g.scar) parts.push(`<path d="M${f1(50 + g.scar * (g.eyeDx + 1))},${f1(g.eyeY - 7)} l${g.scar * 2},9" stroke="${shade(g.skin, -0.4)}" stroke-width=".8"/><path d="M${f1(50 + g.scar * (g.eyeDx + 0.2))},${f1(g.eyeY - 4)} l${g.scar * 2},-.6 M${f1(50 + g.scar * (g.eyeDx + 1))},${f1(g.eyeY - 1)} l${g.scar * 2},-.6" stroke="${shade(g.skin, -0.4)}" stroke-width=".6"/>`);
    parts.push(h.front);
    if (p.inj > 0) parts.push(`<g transform="rotate(-18 ${f1(50 + g.hw * 0.45)} ${f1(g.top + 11)})"><rect x="${f1(50 + g.hw * 0.45 - 5)}" y="${f1(g.top + 9)}" width="10" height="4" rx="1" fill="#f3e2c7" stroke="#c9b08a" stroke-width=".4"/><rect x="${f1(50 + g.hw * 0.45 - 1.5)}" y="${f1(g.top + 9)}" width="3" height="4" fill="#e6cfa6"/></g>`);
    const out = `<svg viewBox="9 7 82 82" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
    if (cache.size > 3000) cache.clear();
    cache.set(key, out);
    return out;
  }

  G.FACE = { svg, genes, mood };
})(typeof window !== 'undefined' ? window : globalThis);
