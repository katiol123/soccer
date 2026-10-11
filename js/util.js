/* Общие утилиты */
(function (G) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const U = {
    rnd: Math.random,
    seeded: mulberry32,
    rand(a, b) { return a + U.rnd() * (b - a); },
    randInt(a, b) { return Math.floor(a + U.rnd() * (b - a + 1)); },
    chance(p) { return U.rnd() < p; },
    pick(arr, r) { return arr[Math.floor((r || U.rnd)() * arr.length)]; },
    pickWeighted(items, weightFn) {
      let total = 0;
      for (const it of items) total += Math.max(0, weightFn(it));
      let x = U.rnd() * total;
      for (const it of items) {
        x -= Math.max(0, weightFn(it));
        if (x <= 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(arr, r) {
      const rr = r || U.rnd;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rr() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    sum(arr, f) { let s = 0; for (const x of arr) s += f ? f(x) : x; return s; },
    avg(arr, f) { return arr.length ? U.sum(arr, f) / arr.length : 0; },
    sleep(ms) { return new Promise(res => setTimeout(res, ms)); },
    clone(o) { return JSON.parse(JSON.stringify(o)); },
    plural(n, one, few, many) {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
      return many;
    },
    /* Создание DOM-элементов: el('div.cls#id', {attrs}, children) */
    el(spec, attrs, children) {
      const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
      const node = document.createElement((m && m[1]) || 'div');
      if (m && m[2]) {
        m[2].replace(/([.#])([\w-]+)/g, (_, t, v) => {
          if (t === '.') node.classList.add(v); else node.id = v;
        });
      }
      if (attrs) {
        for (const k in attrs) {
          const v = attrs[k];
          if (v == null || v === false) continue;
          if (k === 'html') node.innerHTML = v;
          else if (k === 'text') node.textContent = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
          else node.setAttribute(k, v === true ? '' : v);
        }
      }
      if (children != null) {
        (Array.isArray(children) ? children : [children]).forEach(ch => {
          if (ch == null || ch === false) return;
          node.appendChild(typeof ch === 'string' || typeof ch === 'number' ? document.createTextNode(String(ch)) : ch);
        });
      }
      return node;
    },
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    esc(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    /* Цвет оценки характеристики 1..20 */
    attrColor(v) {
      if (v >= 17) return '#00ff87';
      if (v >= 14) return '#7ee35b';
      if (v >= 11) return '#e7d64a';
      if (v >= 8) return '#ff9f43';
      return '#ff4d6d';
    }
  };

  G.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
