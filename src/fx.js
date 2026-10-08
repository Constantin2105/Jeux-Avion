'use strict';
// ---------------------------------------------------------------------------
// Effets visuels : particules (lueurs additives, fumée, étincelles, débris),
// ondes de choc, éclairs, traces au sol, flash et tremblement d'écran.
// ---------------------------------------------------------------------------

const SmokeTint = {
  cache: new Map(),
  get(v) {
    // v : niveau de gris (quantifié)
    const q = Math.round(v / 16) * 16;
    let c = this.cache.get(q);
    if (c) return c;
    const s = 64;
    c = U.makeCanvas(s, s);
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${q},${q},${q},0.85)`);
    gr.addColorStop(0.55, `rgba(${q},${q},${q},0.4)`);
    gr.addColorStop(1, `rgba(${q},${q},${q},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, s, s);
    this.cache.set(q, c);
    return c;
  },
};

const MAX_PARTICLES = 2600;

class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.bolts = [];
    this.decals = [];
    this.lights = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '255,255,255';
    this.empFlash = 0;
  }

  // --- création de particules -------------------------------------------------
  add(p) {
    if (this.parts.length >= MAX_PARTICLES) {
      // remplace une particule ancienne
      this.parts[Math.floor(Math.random() * this.parts.length)] = p;
      return p;
    }
    this.parts.push(p);
    return p;
  }

  // particule lumineuse additive
  glow(x, y, vx, vy, life, size, size1, r, g, b, opts = {}) {
    return this.add({
      t: 'g',
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      size1,
      r,
      g,
      b,
      a: opts.a ?? 1,
      drag: opts.drag ?? 2,
      scroll: opts.scroll ?? 0,
      layer: opts.layer ?? 1,
    });
  }

  smoke(x, y, vx, vy, life, size, size1, grey, opts = {}) {
    return this.add({
      t: 's',
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      size1,
      grey,
      a: opts.a ?? 0.7,
      drag: opts.drag ?? 1.5,
      scroll: opts.scroll ?? 0.6,
      layer: opts.layer ?? 1,
      rot: Math.random() * TAU,
    });
  }

  spark(x, y, vx, vy, life, len, r, g, b, opts = {}) {
    return this.add({
      t: 'k',
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      len,
      r,
      g,
      b,
      drag: opts.drag ?? 3,
      scroll: opts.scroll ?? 0,
      layer: opts.layer ?? 1,
      w: opts.w ?? 1.6,
    });
  }

  debris(x, y, vx, vy, life, size, color, opts = {}) {
    return this.add({
      t: 'd',
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      color,
      drag: opts.drag ?? 1.8,
      scroll: opts.scroll ?? 0.5,
      layer: opts.layer ?? 1,
      rot: Math.random() * TAU,
      vr: U.rand(-12, 12),
      burn: opts.burn ?? true,
    });
  }

  ring(x, y, r0, r1, life, color, width = 4, opts = {}) {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width, scroll: opts.scroll ?? 0, fill: opts.fill ?? false });
  }

  bolt(x1, y1, x2, y2, life = 0.15, color = '120,220,255') {
    const pts = [[x1, y1]];
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([U.lerp(x1, x2, t) + U.rand(-14, 14), U.lerp(y1, y2, t) + U.rand(-14, 14)]);
    }
    pts.push([x2, y2]);
    this.bolts.push({ pts, life, max: life, color });
  }

  light(x, y, r, life, rgb, opts = {}) {
    this.lights.push({ x, y, r, life, max: life, rgb, scroll: opts.scroll ?? 0 });
  }

  decal(x, y, r, kind = 'scorch') {
    this.decals.push({ x, y, r, kind, rot: Math.random() * TAU, life: kind === 'fire' ? 8 : 1e9 });
    if (this.decals.length > 90) this.decals.shift();
  }

  addShake(v) {
    this.shake = Math.min(40, this.shake + v);
  }

  addFlash(v, color = '255,255,255') {
    if (v > this.flash) {
      this.flash = v;
      this.flashColor = color;
    }
  }

  // --- traînées ------------------------------------------------------------------
  trail(x, y, ang, kind, scale = 1) {
    const bx = x - Math.cos(ang) * 12 * scale;
    const by = y - Math.sin(ang) * 12 * scale;
    const back = 40;
    switch (kind) {
      case 'hot':
        this.glow(bx, by, -Math.cos(ang) * back, -Math.sin(ang) * back, 0.12, 12 * scale, 4, 255, 200, 90);
        this.smoke(bx, by, U.rand(-8, 8), U.rand(-8, 8), U.rand(0.6, 1.1), 5 * scale, 18 * scale, 200, { a: 0.35 });
        break;
      case 'dark':
        this.glow(bx, by, 0, 0, 0.1, 10 * scale, 3, 255, 140, 50);
        this.smoke(bx, by, U.rand(-6, 6), U.rand(-6, 6), U.rand(0.7, 1.2), 5 * scale, 20 * scale, 70, { a: 0.45 });
        break;
      case 'fire':
        this.glow(bx, by, U.rand(-20, 20), U.rand(-20, 20), 0.3, 14 * scale, 4, 255, 110, 20);
        this.smoke(bx, by, U.rand(-6, 6), U.rand(-6, 6), 0.9, 5, 18, 50, { a: 0.4 });
        break;
      case 'emp':
        this.glow(bx, by, U.rand(-30, 30), U.rand(-30, 30), 0.25, 12 * scale, 3, 80, 200, 255);
        if (Math.random() < 0.15) this.spark(bx, by, U.rand(-150, 150), U.rand(-150, 150), 0.15, 8, 160, 240, 255);
        break;
      case 'hyper':
        this.glow(bx, by, 0, 0, 0.18, 16 * scale, 6, 255, 160, 60);
        this.smoke(bx, by, 0, 0, 0.5, 4, 10, 230, { a: 0.25 });
        break;
      case 'player':
        this.glow(bx, by, 0, 0, 0.1, 9 * scale, 3, 255, 220, 140);
        this.smoke(bx, by, U.rand(-5, 5), U.rand(-5, 5), U.rand(0.5, 0.9), 3 * scale, 14 * scale, 230, { a: 0.3 });
        break;
      default:
        break;
    }
  }

  // --- explosions -------------------------------------------------------------
  // kind : small | medium | big | huge | cluster | fire | emp | plasma | thermo | nuke | water | metal | tiny
  explode(x, y, size, kind = 'medium', ground = false) {
    const layer = ground ? 0 : 1;
    const scroll = ground ? 1 : 0.35;
    const s = size;
    switch (kind) {
      case 'emp': {
        this.glow(x, y, 0, 0, 0.35, s * 1.4, s * 2.2, 90, 200, 255, { layer, scroll });
        this.ring(x, y, 5, s * 3.2, 0.7, '120,220,255', 5);
        this.ring(x, y, 5, s * 2.1, 0.5, '220,250,255', 2);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * TAU;
          this.bolt(x, y, x + Math.cos(a) * s * 1.8, y + Math.sin(a) * s * 1.8, 0.2);
        }
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(100, 450);
          this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.2, 0.5), 10, 150, 230, 255);
        }
        this.light(x, y, s * 5, 0.4, '80,180,255');
        this.empFlash = Math.max(this.empFlash, 0.4);
        break;
      }
      case 'fire': {
        this.glow(x, y, 0, 0, 0.3, s * 1.2, s * 2, 255, 150, 40, { layer, scroll });
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(30, 220);
          this.glow(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.4, 1.1), U.rand(10, 22), 4, 255, U.rand(70, 160), 20, { layer, scroll });
        }
        for (let i = 0; i < 10; i++) this.smoke(x + U.rand(-s, s) * 0.5, y + U.rand(-s, s) * 0.5, U.rand(-20, 20), U.rand(-20, 20), U.rand(1.2, 2.2), s * 0.4, s * 1.4, 40, { layer, scroll });
        this.light(x, y, s * 4, 0.6, '255,120,30');
        break;
      }
      case 'plasma': {
        this.glow(x, y, 0, 0, 0.25, s, s * 2, 200, 120, 255, { layer, scroll });
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(80, 300);
          this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.15, 0.35), 8, 200, 160, 255);
        }
        this.ring(x, y, 3, s * 1.5, 0.3, '200,150,255', 2);
        break;
      }
      case 'water': {
        this.ring(x, y, 4, s * 2.2, 0.9, '230,245,255', 4, { scroll: 1 });
        this.ring(x, y, 4, s * 1.3, 0.7, '255,255,255', 2, { scroll: 1 });
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(40, 260);
          this.smoke(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.5, 1.2), s * 0.2, s * 0.7, 240, { a: 0.8, layer: 0, scroll: 1, drag: 3 });
        }
        this.glow(x, y, 0, 0, 0.2, s, s * 1.5, 255, 230, 180, { layer: 0, scroll: 1 });
        break;
      }
      case 'thermo': {
        this.addFlash(0.55, '255,210,160');
        this.addShake(26);
        this.glow(x, y, 0, 0, 0.5, s, s * 3.5, 255, 240, 200, { layer, scroll });
        this.ring(x, y, 10, s * 3.4, 0.9, '255,230,190', 10);
        this.ring(x, y, 10, s * 2.4, 1.2, '255,140,60', 6);
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(60, 520);
          this.glow(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.5, 1.4), U.rand(20, 46), 6, 255, U.rand(90, 200), 30, { layer, scroll, drag: 2.5 });
        }
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(30, 280);
          this.smoke(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(2, 3.5), s * 0.4, s * 1.4, U.rand(30, 70), { layer, scroll });
        }
        this.light(x, y, s * 6, 1.2, '255,160,80');
        if (ground) this.decal(x, y, s * 1.6);
        break;
      }
      case 'nuke': {
        this.addFlash(1, '255,255,240');
        this.addShake(40);
        this.glow(x, y, 0, 0, 1.4, 120, VW * 0.9, 255, 250, 220, { layer: 1, scroll: 0.5 });
        this.ring(x, y, 20, VW * 1.1, 2.0, '255,250,230', 18);
        this.ring(x, y, 20, VW * 0.8, 2.6, '255,170,80', 12);
        this.ring(x, y, 20, VW * 0.5, 3.0, '255,90,40', 8);
        for (let i = 0; i < 160; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(80, 900);
          this.glow(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.8, 2.4), U.rand(30, 80), 10, 255, U.rand(80, 220), U.rand(20, 80), { layer: 1, scroll: 0.5, drag: 1.4 });
        }
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(40, 500);
          this.smoke(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(3, 5), 60, 220, U.rand(40, 110), { layer: 1, scroll: 0.5, drag: 1.2 });
        }
        this.light(x, y, VW, 2.5, '255,200,120');
        this.decal(x, y, 260);
        break;
      }
      case 'cluster': {
        // plusieurs petites détonations en chaîne
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * TAU;
          const d = U.rand(10, s * 1.4);
          this.explode(x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.45, 'small', ground);
        }
        this.ring(x, y, 4, s * 2.2, 0.5, '255,220,160', 3);
        break;
      }
      default: {
        // explosion "classique" : flash + boule de feu + fumée + étincelles + débris
        const k = { tiny: 0.4, small: 0.7, medium: 1, big: 1.5, huge: 2.2, metal: 1 }[kind] || 1;
        const n = Math.floor(10 + 22 * k);
        this.glow(x, y, 0, 0, 0.18 + 0.1 * k, s * 0.8, s * 2.6, 255, 245, 210, { layer, scroll });
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(20, 190) * k * (s / 40);
          const life = U.rand(0.35, 0.9) * (0.8 + k * 0.3);
          this.glow(x, y, Math.cos(a) * v, Math.sin(a) * v, life, U.rand(10, 22) * (s / 40), U.rand(2, 6), 255, U.rand(80, 190), U.rand(10, 50), { layer, scroll });
        }
        for (let i = 0; i < n * 0.6; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(10, 110) * k * (s / 40);
          this.smoke(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(1.0, 2.2) * (0.7 + k * 0.3), s * 0.25, s * U.rand(0.8, 1.4), U.rand(30, 80), { layer, scroll, a: 0.65 });
        }
        for (let i = 0; i < n * 0.8; i++) {
          const a = Math.random() * TAU;
          const v = U.rand(150, 600) * Math.sqrt(k);
          this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.15, 0.45), U.rand(6, 14), 255, U.rand(180, 240), 120, { layer, scroll });
        }
        if (k >= 0.7) {
          for (let i = 0; i < 4 + k * 5; i++) {
            const a = Math.random() * TAU;
            const v = U.rand(80, 320) * k;
            this.debris(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.6, 1.4), U.rand(2, 5) * k, kind === 'metal' ? '#555a60' : '#2a2420', { layer, scroll });
          }
          this.ring(x, y, s * 0.2, s * (1.6 + k * 0.5), 0.35 + k * 0.1, '255,230,190', 2 + k * 2);
        }
        this.light(x, y, s * (2.5 + k), 0.25 + 0.15 * k, '255,170,80');
        if (k >= 1.5) this.addShake(4 * k);
        if (ground && k >= 0.7) this.decal(x, y, s * 0.8);
        break;
      }
    }
  }

  // --- mise à jour ---------------------------------------------------------------
  update(dt, scrollSpeed) {
    const ps = this.parts;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += (p.vy + scrollSpeed * p.scroll) * dt;
      if (p.t === 'd') {
        p.rot += p.vr * dt;
        if (p.burn && Math.random() < 0.3) this.smoke(p.x, p.y, 0, 0, 0.6, 2, 8, 50, { a: 0.4, scroll: p.scroll });
      }
      ps[w++] = p;
    }
    ps.length = w;
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      r.y += scrollSpeed * r.scroll * dt;
      return r.life > 0;
    });
    this.bolts = this.bolts.filter((b) => (b.life -= dt) > 0);
    this.lights = this.lights.filter((l) => {
      l.life -= dt;
      l.y += scrollSpeed * l.scroll * dt;
      return l.life > 0;
    });
    for (const d of this.decals) d.y += scrollSpeed * dt;
    this.decals = this.decals.filter((d) => d.y < VH + 300 && (d.life -= dt) > 0);
    this.shake *= Math.exp(-5 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.empFlash = Math.max(0, this.empFlash - dt);
  }

  // --- rendu --------------------------------------------------------------------
  drawDecals(ctx) {
    for (const d of this.decals) {
      if (d.kind === 'scorch') {
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(10,8,6,0.75)');
        g.addColorStop(0.5, 'rgba(25,18,12,0.45)');
        g.addColorStop(1, 'rgba(30,20,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      } else if (d.kind === 'fire') {
        const a = Math.min(1, d.life / 2);
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(40,20,10,${0.6 * a})`);
        g.addColorStop(1, 'rgba(20,10,5,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
    }
  }

  // part : 'normal' (fumée, débris) ou 'add' (lueurs, étincelles)
  drawLayer(ctx, layer, part = 'all') {
    if (part !== 'add') this.drawNormal(ctx, layer);
    if (part !== 'normal') this.drawAdd(ctx, layer);
  }

  drawNormal(ctx, layer) {
    for (const p of this.parts) {
      if (p.layer !== layer || p.t !== 's') continue;
      const t = 1 - p.life / p.max;
      const size = p.size + (p.size1 - p.size) * U.easeOut(t);
      const a = p.a * (1 - t) * Math.min(1, t * 8 + 0.2);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(SmokeTint.get(p.grey), p.x - size, p.y - size, size * 2, size * 2);
    }
    for (const p of this.parts) {
      if (p.layer !== layer || p.t !== 'd') continue;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawAdd(ctx, layer) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.layer !== layer) continue;
      if (p.t === 'g') {
        const t = 1 - p.life / p.max;
        const size = p.size + (p.size1 - p.size) * t;
        const a = p.a * (1 - t);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        // la couleur se refroidit avec le temps (jaune -> rouge)
        const g = p.g * (1 - t * 0.6);
        const b = p.b * (1 - t);
        ctx.drawImage(Glow.get(Math.round(p.r / 16) * 16, Math.round(g / 16) * 16, Math.round(b / 16) * 16), p.x - size, p.y - size, size * 2, size * 2);
      } else if (p.t === 'k') {
        const t = p.life / p.max;
        ctx.globalAlpha = t;
        ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.lineWidth = p.w;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const l = p.len * Math.min(1.5, sp / 300);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * l, p.y - (p.vy / sp) * l);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawTop(ctx) {
    // anneaux d'onde de choc
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * U.easeOut(t);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = `rgb(${r.color})`;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // éclairs
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      const a = b.life / b.max;
      ctx.strokeStyle = `rgba(${b.color},${a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      b.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // éclairages dynamiques
    for (const l of this.lights) {
      const a = l.life / l.max;
      const [r, g, b] = l.rgb.split(',').map(Number);
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(Glow.get(r, g, b, 128), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawScreen(ctx) {
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(1, this.flash)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }
}
