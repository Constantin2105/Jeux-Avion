'use strict';
// ---------------------------------------------------------------------------
// Cinématiques : lecteur de séquences (intro de campagne, fin du jeu),
// décors (piste, porte-avions), post-traitement d'image (étalonnage par
// thème, vignettage, voile atmosphérique, traînées de vitesse).
// ---------------------------------------------------------------------------

// --- Post-traitement ---------------------------------------------------------

const GRADES = {
  desert: { tint: '255,170,90', a: 0.16, haze: '255,225,180' },
  canyon: { tint: '255,130,70', a: 0.18, haze: '255,210,170' },
  coast: { tint: '120,200,255', a: 0.1, haze: '210,235,255' },
  ocean: { tint: '90,170,255', a: 0.14, haze: '200,230,255' },
  jungle: { tint: '120,220,140', a: 0.12, haze: '210,240,215' },
  mountains: { tint: '150,190,255', a: 0.12, haze: '225,235,255' },
  arctic: { tint: '150,210,255', a: 0.18, haze: '235,245,255' },
  city: { tint: '170,190,220', a: 0.1, haze: '220,228,240' },
  citynight: { tint: '60,90,200', a: 0.2, haze: '60,80,140' },
  volcano: { tint: '255,90,40', a: 0.2, haze: '120,70,50' },
  base: { tint: '120,220,220', a: 0.12, haze: '200,230,235' },
  basenight: { tint: '200,60,140', a: 0.16, haze: '70,50,90' },
  sunrise: { tint: '255,140,60', a: 0.24, haze: '255,200,150' },
};

const Post = {
  vignette: null,
  getVignette() {
    if (this.vignette) return this.vignette;
    const c = U.makeCanvas(VW / 2, VH / 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    this.vignette = c;
    return c;
  },
  // étalonnage couleur + voile d'altitude + lumière du soleil + vignettage
  apply(ctx, theme, time = 0) {
    const gr = GRADES[theme] || GRADES.city;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(${gr.tint},${gr.a * 2.2})`;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
    // voile atmosphérique (plus dense en haut : effet de profondeur)
    const h = ctx.createLinearGradient(0, 0, 0, VH * 0.55);
    h.addColorStop(0, `rgba(${gr.haze},0.16)`);
    h.addColorStop(1, `rgba(${gr.haze},0)`);
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, VW, VH * 0.55);
    // reflet du soleil (haut gauche)
    if (!THEMES[theme] || !THEMES[theme].night) {
      ctx.globalCompositeOperation = 'screen';
      const s = ctx.createRadialGradient(VW * 0.12, -VH * 0.1, 10, VW * 0.12, -VH * 0.1, VW * 0.55);
      const pulse = 0.12 + Math.sin(time * 0.3) * 0.02;
      s.addColorStop(0, `rgba(255,240,200,${pulse * 1.6})`);
      s.addColorStop(0.4, `rgba(255,220,170,${pulse * 0.5})`);
      s.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(this.getVignette(), 0, 0, VW, VH);
    ctx.restore();
  },
};

// Traînées de vent qui donnent la sensation de vitesse
class SpeedLines {
  constructor(n = 26) {
    this.l = [];
    for (let i = 0; i < n; i++) this.l.push(this.make(Math.random() * VH));
  }
  make(y) {
    return { x: Math.random() * VW, y: y ?? -60, len: U.rand(40, 140), sp: U.rand(1.6, 3.2), a: U.rand(0.04, 0.12) };
  }
  update(dt, scroll) {
    for (const s of this.l) {
      s.y += scroll * s.sp * dt * 2.2;
      if (s.y - s.len > VH) Object.assign(s, this.make());
    }
  }
  draw(ctx, k = 1) {
    ctx.save();
    ctx.lineWidth = 1.2;
    for (const s of this.l) {
      ctx.strokeStyle = `rgba(255,255,255,${s.a * k})`;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y - s.len * k);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- Décors de décollage ------------------------------------------------------

function drawRunway(ctx, x, y, w, len, night = false) {
  // y : extrémité basse de la piste ; elle s'étend vers le haut sur len px
  ctx.save();
  ctx.fillStyle = night ? 'rgba(20,24,20,0.8)' : 'rgba(70,90,60,0.55)';
  ctx.fillRect(x - w / 2 - 60, y - len, w + 120, len);
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#2c2f33');
  g.addColorStop(0.5, '#3b3f44');
  g.addColorStop(1, '#2a2d31');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, y - len, w, len);
  // traces de pneus
  ctx.fillStyle = 'rgba(10,10,10,0.25)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x - 30 + i * 12, y - len, 4, len);
  // bandes de seuil
  ctx.fillStyle = '#e8e8e8';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(x - w / 2 + 12 + i * ((w - 24) / 8), y - 70, (w - 24) / 8 - 8, 50);
    ctx.fillRect(x - w / 2 + 12 + i * ((w - 24) / 8), y - len + 20, (w - 24) / 8 - 8, 50);
  }
  // numéro de piste
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('36', x, y - 110);
  // axe central
  for (let yy = y - 180; yy > y - len + 100; yy -= 90) ctx.fillRect(x - 3, yy - 45, 6, 45);
  // bords + feux
  ctx.fillRect(x - w / 2 + 4, y - len, 3, len);
  ctx.fillRect(x + w / 2 - 7, y - len, 3, len);
  ctx.globalCompositeOperation = 'lighter';
  for (let yy = y - 20; yy > y - len; yy -= 60) {
    for (const s of [-1, 1]) {
      const lx = x + s * (w / 2 + 10);
      ctx.drawImage(Glow.get(255, 230, 160), lx - 7, yy - 7, 14, 14);
    }
  }
  ctx.restore();
}

function drawCarrier(ctx, x, y, s = 1) {
  // porte-avions : pont vu de dessus, y = arrière du navire
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // sillage
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(-70, 0);
  ctx.lineTo(70, 0);
  ctx.lineTo(160, 500);
  ctx.lineTo(-160, 500);
  ctx.closePath();
  ctx.fill();
  // coque
  ctx.beginPath();
  ctx.moveTo(-90, 0);
  ctx.lineTo(-100, -500);
  ctx.lineTo(-80, -900);
  ctx.lineTo(-20, -1040);
  ctx.lineTo(60, -1000);
  ctx.lineTo(130, -700);
  ctx.lineTo(150, -380);
  ctx.lineTo(95, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-100, 0, 150, 0);
  g.addColorStop(0, '#4a5158');
  g.addColorStop(0.5, '#6d757c');
  g.addColorStop(1, '#40474d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // piste de catapulte
  ctx.fillStyle = '#e8e8e8';
  for (let yy = -40; yy > -900; yy -= 70) ctx.fillRect(-3, yy - 35, 6, 35);
  ctx.strokeStyle = '#e8c21a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-40, -20);
  ctx.lineTo(-40, -950);
  ctx.moveTo(40, -20);
  ctx.lineTo(40, -950);
  ctx.stroke();
  // piste oblique
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.moveTo(-60, -60);
  ctx.lineTo(120, -620);
  ctx.stroke();
  ctx.setLineDash([]);
  // îlot
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(108, -470, 40, 140);
  ctx.fillStyle = '#9aa3ab';
  ctx.fillRect(96, -480, 36, 140);
  ctx.fillStyle = '#e9edf0';
  ctx.beginPath();
  ctx.arc(114, -450, 9, 0, TAU);
  ctx.fill();
  ctx.font = 'bold 70px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('91', 60, -780);
  ctx.restore();
}

// --- Texte de cinéma ------------------------------------------------------------

function typewriter(text, t, cps = 42) {
  return text.slice(0, Math.max(0, Math.floor(t * cps)));
}

function drawBars(ctx, k) {
  if (k <= 0) return;
  const h = 86 * k;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, h);
  ctx.fillRect(0, VH - h, VW, h);
}

function drawSubtitle(ctx, text, alpha = 1) {
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(text, VW / 2 + 2, VH - 43 + 2);
  ctx.fillStyle = '#f2f6fa';
  ctx.fillText(text, VW / 2, VH - 43);
  ctx.restore();
}

// --- Lecteur de séquences ---------------------------------------------------

const Cinema = {
  active: false,
  shots: [],
  i: 0,
  t: 0,
  onEnd: null,
  ending: false,

  play(shots, onEnd) {
    this.shots = shots;
    this.i = 0;
    this.t = 0;
    this.onEnd = onEnd;
    this.active = true;
    this.ending = false;
    Input.release();
    UI.show('none');
    SFX.resume();
    SFX.startMusic(7);
    if (shots[0].init) shots[0].init();
  },

  skip() {
    if (!this.active || this.ending) return;
    this.finish();
  },

  finish() {
    this.ending = true;
    this.active = false;
    SFX.stopMusic();
    SFX.stopEngine();
    Input.release();
    const cb = this.onEnd;
    this.onEnd = null;
    if (cb) cb();
  },

  update(dt) {
    const s = this.shots[this.i];
    this.t += dt;
    if (s.update) s.update(dt, this.t);
    if (this.t >= s.dur) {
      this.i++;
      this.t = 0;
      if (this.i >= this.shots.length) return this.finish();
      if (this.shots[this.i].init) this.shots[this.i].init();
    }
  },

  draw(ctx) {
    const s = this.shots[this.i];
    if (!s) return;
    s.draw(ctx, this.t);
    drawBars(ctx, 1);
    for (const [a, b, txt] of s.subs || []) {
      if (this.t >= a && this.t <= b) {
        const fade = Math.min(1, (b - this.t) / 0.4);
        drawSubtitle(ctx, typewriter(txt, this.t - a), fade);
      }
    }
    // fondu entre les plans
    const f = Math.max(0, 1 - this.t / 0.6, 1 - (s.dur - this.t) / 0.6);
    if (f > 0 && !s.noFade) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, f)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.font = `600 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('Clic ou Échap pour passer ▸▸', VW - 24, 52);
  },
};

// --- Plans de l'introduction ------------------------------------------------

function introShots() {
  const shots = [];

  // 1. Carte tactique
  const map = {
    dur: 8.5,
    subs: [
      [0.6, 4.2, '2031. Le Front Oméga lance une offensive éclair sur toute la frontière.'],
      [4.5, 8.2, 'En 72 heures, nos défenses aériennes sont anéanties.'],
    ],
    init() {
      const n = new Noise2D(31);
      this.coast = [];
      for (let a = 0; a < TAU; a += TAU / 140) {
        const r = 300 + (n.fbm(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, 4) - 0.5) * 340;
        this.coast.push([760 + Math.cos(a) * r * 1.5, 470 + Math.sin(a) * r]);
      }
      this.blips = Array.from({ length: 34 }, () => ({ x: U.rand(900, 1450), y: U.rand(180, 760), p: Math.random() * TAU }));
    },
    draw(ctx, t) {
      const g = ctx.createRadialGradient(VW / 2, VH / 2, 100, VW / 2, VH / 2, VW * 0.7);
      g.addColorStop(0, '#0a2a36');
      g.addColorStop(1, '#020a10');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
      ctx.strokeStyle = 'rgba(80,220,255,0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < VW; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, VH);
        ctx.stroke();
      }
      for (let y = 0; y < VH; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VW, y);
        ctx.stroke();
      }
      // continent
      ctx.beginPath();
      this.coast.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,90,100,0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,230,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // zone ennemie qui avance
      ctx.save();
      ctx.clip();
      const r = 220 + t * 95;
      const rg = ctx.createRadialGradient(1500, 470, r * 0.6, 1500, 470, r);
      rg.addColorStop(0, 'rgba(255,40,40,0.38)');
      rg.addColorStop(1, 'rgba(255,40,40,0.1)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(1500, 470, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,70,70,0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // flèches d'offensive
      ctx.strokeStyle = '#ff4040';
      ctx.fillStyle = '#ff4040';
      ctx.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        const y0 = 230 + i * 120;
        const len = Math.min(1, t / 6) * (260 + (i % 2) * 90);
        const x0 = 1430;
        const x1 = x0 - len;
        const y1 = y0 + (i - 2) * 20 * Math.min(1, t / 6);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 30, x1, y1);
        ctx.stroke();
        const a = Math.atan2(y1 - y0 + 30, x1 - (x0 + x1) / 2);
        ctx.beginPath();
        ctx.moveTo(x1 + Math.cos(a) * 18, y1 + Math.sin(a) * 18);
        ctx.lineTo(x1 + Math.cos(a + 2.4) * 18, y1 + Math.sin(a + 2.4) * 18);
        ctx.lineTo(x1 + Math.cos(a - 2.4) * 18, y1 + Math.sin(a - 2.4) * 18);
        ctx.closePath();
        ctx.fill();
      }
      // échos ennemis
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.blips) {
        if (b.x > 1500 - (220 + t * 95)) {
          const a = 0.5 + 0.5 * Math.sin(t * 6 + b.p);
          ctx.globalAlpha = a;
          ctx.drawImage(Glow.get(255, 50, 50), b.x - 9, b.y - 9, 18, 18);
        }
      }
      ctx.globalAlpha = 1;
      // base alliée + balayage radar
      const bx = 480;
      const by = 560;
      ctx.drawImage(Glow.get(60, 170, 255), bx - 16, by - 16, 32, 32);
      ctx.globalCompositeOperation = 'source-over';
      const sw = t * 2.2;
      const sg = ctx.createConicGradient ? ctx.createConicGradient(sw, bx, by) : null;
      if (sg) {
        sg.addColorStop(0, 'rgba(80,220,255,0.35)');
        sg.addColorStop(0.08, 'rgba(80,220,255,0)');
        sg.addColorStop(1, 'rgba(80,220,255,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(bx, by, 260, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(80,220,255,0.4)';
      ctx.lineWidth = 1;
      for (const rr of [90, 180, 260]) {
        ctx.beginPath();
        ctx.arc(bx, by, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = '#7fd8ff';
      ctx.textAlign = 'left';
      ctx.fillText('BASE AÉRIENNE 117 — ESCADRON SKY STRIKE', bx + 22, by + 5);
      ctx.fillStyle = 'rgba(160,230,255,0.8)';
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(`QG ALLIÉ · SITUATION TACTIQUE · J+${1 + Math.floor(t / 3)}`, 40, 130);
      ctx.fillStyle = '#ff6060';
      ctx.fillText(`FORCES HOSTILES DÉTECTÉES : ${U.fmt(1200 + Math.floor(t * 410))}`, 40, 156);
    },
  };
  shots.push(map);

  // 2. L'armada ennemie au-dessus d'une ville en flammes
  const armada = {
    dur: 8,
    subs: [
      [0.5, 3.9, 'Leurs bombardiers frappent nos villes. Leurs missiles saturent le ciel.'],
      [4.2, 7.8, 'Le Front prépare son arme ultime : le prototype Oméga.'],
    ],
    init() {
      this.terrain = new Terrain('citynight', 777);
      this.fx = new FX();
      this.D = 0;
      this.planes = [];
      for (let i = 0; i < 3; i++) this.planes.push({ spr: 'bomber', x: 420 + i * 380, y: -250 - i * 120, vy: 90, s: 1 });
      for (let i = 0; i < 8; i++) this.planes.push({ spr: 'fighter', x: U.rand(100, VW - 100), y: -150 - U.rand(0, 600), vy: 260, s: 1 });
      this.boomT = 0;
    },
    update(dt) {
      this.D += 70 * dt;
      this.terrain.update(this.D);
      for (const p of this.planes) p.y += p.vy * dt;
      this.boomT -= dt;
      if (this.boomT <= 0) {
        this.boomT = U.rand(0.15, 0.45);
        const x = U.rand(80, VW - 80);
        const y = U.rand(80, VH - 120);
        this.fx.explode(x, y, U.rand(30, 70), U.pick(['big', 'medium', 'fire']), true);
        SFX.play('explosion', x, 0.5);
      }
      for (const p of this.planes) if (p.spr === 'bomber' && Math.random() < 0.05) this.fx.trail(p.x, p.y + 60, Math.PI / 2, 'dark', 1);
      this.fx.update(dt, 70);
    },
    draw(ctx, t) {
      this.terrain.draw(ctx);
      this.fx.drawDecals(ctx);
      this.fx.drawLayer(ctx, 0, 'normal');
      for (const p of this.planes) {
        const spr = Sprites.list[p.spr];
        Sprites.drawShadow(ctx, spr, p.x + 90, p.y + 120, Math.PI, 0.85, 0.3);
      }
      for (const p of this.planes) {
        const spr = Sprites.list[p.spr];
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(Glow.get(255, 160, 80), p.x - 14, p.y - spr.h * 0.5 - 14, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
        Sprites.draw(ctx, spr, p.x, p.y, Math.PI);
      }
      this.fx.drawLayer(ctx, 1, 'normal');
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(90,90,140)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = 'source-over';
      this.terrain.drawLights(ctx);
      this.fx.drawLayer(ctx, 0, 'add');
      this.fx.drawLayer(ctx, 1, 'add');
      this.fx.drawTop(ctx);
      Post.apply(ctx, 'citynight', t);
    },
  };
  shots.push(armada);

  // 3. Décollage de la base
  const takeoff = {
    dur: 9,
    subs: [
      [0.4, 3.6, 'Il ne reste qu\'un escadron opérationnel.'],
      [3.9, 8.6, '« Sky Strike, ici la tour. Piste 36, autorisé au décollage. Bonne chance. »'],
    ],
    init() {
      this.terrain = new Terrain('base', 991);
      this.fx = new FX();
      this.D = 0;
      this.speed = 0;
      this.ry = VH + 260;
      this.lines = new SpeedLines(30);
      SFX.startEngine();
    },
    update(dt, t) {
      const target = t < 2 ? 0 : t < 6.5 ? 1100 : 300;
      this.speed += (target - this.speed) * Math.min(1, dt * (t < 6.5 ? 0.9 : 1.5));
      this.D += this.speed * dt;
      this.ry += this.speed * dt;
      this.terrain.update(this.D);
      this.lines.update(dt, this.speed * 0.3);
      SFX.setEngine(U.clamp(this.speed / 1100, 0.2, 1));
      const alt = U.clamp((t - 4.6) / 2.2, 0, 1);
      const x = VW / 2;
      const y = VH * 0.6 - alt * 60;
      if (t > 1.6) {
        this.fx.smoke(x + U.rand(-10, 10), y + 90, U.rand(-30, 30), 160 + this.speed * 0.3, 1.2, 10, 50, 200, { a: 0.35 * (1 - alt), layer: 0 });
      }
      this.fx.update(dt, 0);
    },
    draw(ctx, t) {
      this.terrain.draw(ctx);
      drawRunway(ctx, VW / 2, this.ry, 230, 4200);
      this.fx.drawLayer(ctx, 0, 'normal');
      const alt = U.clamp((t - 4.6) / 2.2, 0, 1);
      const spr = Sprites.list.player;
      const x = VW / 2;
      const y = VH * 0.6 - alt * 60;
      const sc = 1.7 + alt * 0.5;
      Sprites.drawShadow(ctx, spr, x + 8 + alt * 150, y + 8 + alt * 190, 0, sc * (1 - alt * 0.15), 0.4 - alt * 0.12);
      ctx.globalCompositeOperation = 'lighter';
      const thr = t > 1.6 ? 1 : 0.3;
      for (const ex of [-4.6, 4.6]) {
        const f = (30 + thr * 40) * (0.85 + Math.random() * 0.3);
        ctx.drawImage(Glow.get(...PlayerLook.flame), x + ex * sc - f, y + 52 * sc - f * 0.5, f * 2, f * 2.6);
        ctx.drawImage(Glow.get(140, 180, 255), x + ex * sc - 10, y + 50 * sc, 20, 40 * thr + 10);
      }
      ctx.globalCompositeOperation = 'source-over';
      Sprites.draw(ctx, spr, x, y, 0, sc);
      this.lines.draw(ctx, U.clamp(this.speed / 1100, 0, 1));
      Post.apply(ctx, 'base', t);
    },
  };
  shots.push(takeoff);

  // 4. Titre au-dessus des nuages
  const title = {
    dur: 6,
    noFade: false,
    subs: [[2.6, 5.8, 'Pilote, la reconquête commence maintenant.']],
    init() {
      this.clouds = [];
      for (let i = 0; i < 16; i++) this.clouds.push({ spr: U.pick(CloudSprites.list), x: U.rand(-200, VW + 200), y: U.rand(-300, VH), s: U.rand(1, 2.4), sp: U.rand(500, 900) });
    },
    update(dt) {
      for (const c of this.clouds) {
        c.y += c.sp * dt;
        if (c.y > VH + 300) {
          c.y = -300;
          c.x = U.rand(-200, VW + 200);
        }
      }
    },
    draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, '#2c6fb3');
      g.addColorStop(1, '#a9d4f5');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
      for (const c of this.clouds) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(c.spr.c, c.x - (c.spr.w * c.s) / 2, c.y - (c.spr.h * c.s) / 2, c.spr.w * c.s, c.spr.h * c.s);
      }
      ctx.globalAlpha = 1;
      const spr = Sprites.list.player;
      const bank = Math.sin(t * 1.3) * 0.4;
      const x = VW / 2 + Math.sin(t * 0.9) * 40;
      const y = VH * 0.62;
      ctx.globalCompositeOperation = 'lighter';
      for (const ex of [-4.6, 4.6]) {
        const f = 56 * (0.85 + Math.random() * 0.3);
        ctx.drawImage(Glow.get(...PlayerLook.flame), x + ex * 2.2 - f, y + 52 * 2.2 - f * 0.5, f * 2, f * 2.6);
      }
      ctx.globalCompositeOperation = 'source-over';
      Sprites.draw(ctx, spr, x, y, bank * 0.08, 2.2, 1, 1 - Math.abs(bank) * 0.28);
      // titre
      const a = U.clamp((t - 0.8) / 0.8, 0, 1);
      if (t > 0.8 && t < 1.1) {
        ctx.fillStyle = `rgba(255,255,255,${1 - (t - 0.8) / 0.3})`;
        ctx.fillRect(0, 0, VW, VH);
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = `900 ${110 + (1 - a) * 40}px "Orbitron", ${FONT}`;
      ctx.shadowColor = 'rgba(0,120,255,0.8)';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SKY STRIKE', VW / 2, VH * 0.3);
      ctx.shadowBlur = 0;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillStyle = '#ffb000';
      ctx.fillText('O P É R A T I O N   R E C O N Q U Ê T E', VW / 2, VH * 0.3 + 50);
      ctx.restore();
    },
  };
  shots.push(title);
  return shots;
}

// --- Plans de la fin ----------------------------------------------------------

function victoryShots() {
  const shots = [];
  shots.push({
    dur: 7,
    subs: [
      [0.5, 3.4, 'Le prototype Oméga s\'écrase sur sa propre base.'],
      [3.6, 6.8, 'Privé de son arme ultime, le Front Oméga capitule.'],
    ],
    init() {
      this.terrain = new Terrain('base', 4321);
      this.fx = new FX();
      this.D = 0;
      this.boomT = 0;
    },
    update(dt, t) {
      this.D += 40 * dt;
      this.terrain.update(this.D);
      const k = Math.min(1, t / 5.5);
      const x = VW / 2 + Math.sin(t * 0.7) * 80;
      const y = VH * 0.4 + k * 120;
      this.boomT -= dt;
      if (this.boomT <= 0 && t < 5.6) {
        this.boomT = U.rand(0.1, 0.3);
        this.fx.explode(x + U.rand(-200, 200) * (1 - k * 0.5), y + U.rand(-80, 80), U.rand(30, 60), U.pick(['big', 'medium', 'fire']));
        SFX.play('explosion', x, 0.6);
      }
      this.fx.smoke(x + U.rand(-120, 120) * (1 - k * 0.5), y, 0, 60, 2, 20, 70, 30, { a: 0.6 });
      if (t >= 5.6 && !this.crashed) {
        this.crashed = true;
        this.fx.explode(x, y, 200, 'nuke', true);
        SFX.play('nuke');
      }
      this.fx.update(dt, 40);
    },
    draw(ctx, t) {
      this.terrain.draw(ctx);
      this.fx.drawDecals(ctx);
      this.fx.drawLayer(ctx, 0, 'normal');
      const k = Math.min(1, t / 5.5);
      if (!this.crashed) {
        const spr = Sprites.list.omega;
        const x = VW / 2 + Math.sin(t * 0.7) * 80;
        const y = VH * 0.4 + k * 120;
        const s = 1 - k * 0.55;
        Sprites.drawShadow(ctx, spr, x + 160 * (1 - k), y + 200 * (1 - k), t * 0.25, s, 0.3);
        Sprites.draw(ctx, spr, x, y, t * 0.25, s);
      }
      this.fx.drawLayer(ctx, 1, 'normal');
      this.fx.drawLayer(ctx, 0, 'add');
      this.fx.drawLayer(ctx, 1, 'add');
      this.fx.drawTop(ctx);
      this.fx.drawScreen(ctx);
      Post.apply(ctx, 'base', t);
    },
  });
  shots.push({
    dur: 8,
    subs: [
      [0.5, 3.8, 'Au lever du soleil, l\'escadron Sky Strike rentre à la base.'],
      [4.0, 7.7, 'La paix revient. Merci, pilote.'],
    ],
    init() {
      this.terrain = new Terrain('ocean', 2468);
      this.D = 0;
      this.lines = new SpeedLines(20);
    },
    update(dt) {
      this.D += 160 * dt;
      this.terrain.update(this.D);
      this.lines.update(dt, 160);
    },
    draw(ctx, t) {
      this.terrain.draw(ctx);
      const spr = Sprites.list.player;
      const form = [
        [0, 0, 1.3],
        [-170, 150, 1.1],
        [170, 150, 1.1],
        [-330, 290, 1],
        [330, 290, 1],
      ];
      const bx = VW / 2;
      const by = VH * 0.42 + Math.sin(t * 0.6) * 20;
      for (const [ox, oy, s] of form) Sprites.drawShadow(ctx, spr, bx + ox + 110, by + oy + 140, 0, s, 0.25);
      for (const [ox, oy, s] of form) {
        ctx.globalCompositeOperation = 'lighter';
        const f = 26 * s * (0.85 + Math.random() * 0.3);
        ctx.drawImage(Glow.get(...PlayerLook.flame), bx + ox - f, by + oy + 52 * s - f * 0.4, f * 2, f * 2.4);
        ctx.globalCompositeOperation = 'source-over';
        Sprites.draw(ctx, spr, bx + ox, by + oy, 0, s);
      }
      this.lines.draw(ctx, 0.6);
      // lumière dorée du lever de soleil
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      const sky = ctx.createLinearGradient(0, 0, 0, VH);
      sky.addColorStop(0, 'rgba(255,150,60,0.75)');
      sky.addColorStop(0.6, 'rgba(255,120,80,0.3)');
      sky.addColorStop(1, 'rgba(120,80,160,0.2)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = 'screen';
      const sun = ctx.createRadialGradient(VW * 0.5, -60, 20, VW * 0.5, -60, VW * 0.6);
      sun.addColorStop(0, 'rgba(255,230,170,0.9)');
      sun.addColorStop(0.3, 'rgba(255,170,90,0.35)');
      sun.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
      ctx.drawImage(Post.getVignette(), 0, 0, VW, VH);
    },
  });
  shots.push({
    dur: 9,
    draw(ctx, t) {
      ctx.fillStyle = '#03070c';
      ctx.fillRect(0, 0, VW, VH);
      const lines = [
        ['SKY STRIKE', 64, '#ffffff'],
        ['', 30],
        ['Conception & développement', 20, '#7fd8ff'],
        ['constantin2105', 30, '#ffffff'],
        ['', 20],
        ['Graphismes, sons et musique', 20, '#7fd8ff'],
        ['100 % procéduraux', 30, '#ffffff'],
        ['', 30],
        ['Merci d\'avoir joué !', 40, '#ffb000'],
      ];
      let y = VH + 40 - t * 120;
      ctx.textAlign = 'center';
      for (const [txt, size, col] of lines) {
        ctx.font = `700 ${size}px ${FONT}`;
        ctx.fillStyle = col || '#fff';
        ctx.fillText(txt, VW / 2, y);
        y += size + 22;
      }
    },
  });
  return shots;
}
