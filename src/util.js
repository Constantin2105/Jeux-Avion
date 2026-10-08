'use strict';
// ---------------------------------------------------------------------------
// Utilitaires : maths, aléatoire, bruit procédural, cache de sprites lumineux
// ---------------------------------------------------------------------------

const VW = 1600; // largeur virtuelle du monde
const VH = 900; // hauteur virtuelle du monde
const TAU = Math.PI * 2;

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  dist2: (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  },
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  // différence d'angle normalisée dans [-PI, PI]
  angDiff: (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  },
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  smooth: (t) => t * t * (3 - 2 * t),
  weighted(table) {
    // table : [[valeur, poids], ...]
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [v, w] of table) {
      r -= w;
      if (r <= 0) return v;
    }
    return table[table.length - 1][0];
  },
  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  },
  rgba(r, g, b, a) {
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  },
  mixColor(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  },
  fmt(n) {
    return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  },
};

// Générateur pseudo-aléatoire déterministe (mulberry32)
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bruit de valeur 2D lissé + fBm, continu dans l'espace monde (permet des
// morceaux de terrain qui se raccordent parfaitement).
class Noise2D {
  constructor(seed) {
    const rng = makeRng(seed);
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = [];
    for (let i = 0; i < 256; i++) {
      p.push(i);
      this.vals[i] = rng();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  value(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const p = this.perm;
    const v = this.vals;
    const a = v[p[p[X] + Y]];
    const b = v[p[p[X + 1] + Y]];
    const c = v[p[p[X] + Y + 1]];
    const d = v[p[p[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  fbm(x, y, oct = 5) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.value(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  ridged(x, y, oct = 4) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(this.value(x * f, y * f) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
}

// Cache de sprites "lueur" (dégradé radial) pour les particules additives.
const Glow = {
  cache: new Map(),
  get(r, g, b, size = 64) {
    const key = `${r | 0},${g | 0},${b | 0},${size}`;
    let c = this.cache.get(key);
    if (c) return c;
    c = U.makeCanvas(size, size);
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.25, `rgba(${r},${g},${b},0.65)`);
    gr.addColorStop(0.6, `rgba(${r},${g},${b},0.15)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    this.cache.set(key, c);
    return c;
  },
  // sprite de fumée doux (non additif)
  smoke: null,
  getSmoke() {
    if (this.smoke) return this.smoke;
    const s = 64;
    const c = U.makeCanvas(s, s);
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, s, s);
    this.smoke = c;
    return c;
  },
};
