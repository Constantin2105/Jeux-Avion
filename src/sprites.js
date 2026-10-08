'use strict';
// ---------------------------------------------------------------------------
// Sprites procéduraux haute résolution (vue de dessus, nez vers le haut).
// Chaque sprite est pré-rendu une fois dans un canvas hors écran (x2) avec sa
// silhouette d'ombre et sa version "épave".
// ---------------------------------------------------------------------------

const SPR_SCALE = 2;

const Sprites = {
  list: {},
  camoCache: {},

  // Crée un sprite : draw(ctx) dessine centré sur (0,0) en unités monde.
  make(name, w, h, draw) {
    const c = U.makeCanvas(w * SPR_SCALE, h * SPR_SCALE);
    const x = c.getContext('2d');
    x.scale(SPR_SCALE, SPR_SCALE);
    x.translate(w / 2, h / 2);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    draw(x);
    const s = { c, w, h, shadow: this.silhouette(c, 'rgba(0,0,0,1)'), wreck: null };
    if (name) this.list[name] = s;
    return s;
  },

  silhouette(src, color) {
    const c = U.makeCanvas(src.width, src.height);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  },

  wreckOf(s) {
    if (s.wreck) return s.wreck;
    const c = U.makeCanvas(s.c.width, s.c.height);
    const x = c.getContext('2d');
    x.drawImage(s.c, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(25,18,12,0.82)';
    x.fillRect(0, 0, c.width, c.height);
    // traces de brûlure
    for (let i = 0; i < 6; i++) {
      const gx = Math.random() * c.width;
      const gy = Math.random() * c.height;
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, c.width * 0.3);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
    }
    s.wreck = c;
    return c;
  },

  // Dessine un sprite à (x,y) avec rotation, échelle et alpha
  draw(ctx, s, x, y, rot = 0, scale = 1, alpha = 1, sx = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (scale !== 1 || sx !== 1) ctx.scale(scale * sx, scale);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  },

  drawShadow(ctx, s, x, y, rot = 0, scale = 1, alpha = 0.35, sx = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale * sx, scale);
    ctx.globalAlpha *= alpha;
    ctx.drawImage(s.shadow, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  },

  drawWreck(ctx, s, x, y, rot = 0, scale = 1, alpha = 1) {
    const c = this.wreckOf(s);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha *= alpha;
    ctx.drawImage(c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  },

  init() {
    makeAircraftSprites();
    makeMissileSprites();
    makeBossSprites();
  },

  // Sprites au sol teintés selon le camouflage du thème
  ground(camo) {
    if (!this.camoCache[camo]) this.camoCache[camo] = makeGroundSprites(camo);
    return this.camoCache[camo];
  },
};

// ---- helpers de dessin ------------------------------------------------------

function sym(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(-pts[i][0], pts[i][1]);
  ctx.closePath();
}

function poly(ctx, pts, mirror = false) {
  ctx.beginPath();
  ctx.moveTo(mirror ? -pts[0][0] : pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(mirror ? -pts[i][0] : pts[i][0], pts[i][1]);
  ctx.closePath();
}

function hGrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

// Ombrage cylindrique (fuselage) : lumière venant du haut-gauche
function cylinder(ctx, half, base) {
  return hGrad(ctx, -half, half, [
    [0, shade(base, -0.35)],
    [0.28, shade(base, 0.28)],
    [0.5, shade(base, 0.1)],
    [0.85, shade(base, -0.25)],
    [1, shade(base, -0.45)],
  ]);
}

// éclaircit (+) ou assombrit (-) une couleur hex
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function panelLines(ctx, lines, alpha = 0.28, width = 0.35) {
  ctx.save();
  ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const l of lines) {
    ctx.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

function canopy(ctx, cx, cy, rx, ry) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  g.addColorStop(0, '#9fe6ff');
  g.addColorStop(0.35, '#2a6f9a');
  g.addColorStop(0.7, '#0c2236');
  g.addColorStop(1, '#05101a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(30,35,40,0.9)';
  ctx.stroke();
  // reflet
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.25, ry * 0.4, -0.2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  // arceau
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + ry * 0.25);
  ctx.quadraticCurveTo(cx, cy + ry * 0.05, cx + rx, cy + ry * 0.25);
  ctx.strokeStyle = 'rgba(40,45,50,0.8)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

function roundel(ctx, x, y, r, colors) {
  colors.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(x, y, r * (1 - i / colors.length), 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
  });
}

function nozzle(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, '#120c08');
  g.addColorStop(0.55, '#3a332c');
  g.addColorStop(0.8, '#8c8478');
  g.addColorStop(1, '#3c3730');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

function camoBlotches(ctx, clipFn, colors, seed, count, size) {
  const rng = makeRng(seed);
  ctx.save();
  clipFn();
  ctx.clip();
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    const x = (rng() - 0.5) * size * 2;
    const y = (rng() - 0.5) * size * 2;
    const r = 3 + rng() * size * 0.18;
    for (let a = 0; a < TAU; a += TAU / 7) {
      const rr = r * (0.6 + rng() * 0.6);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---- avions -----------------------------------------------------------------

function drawPlayerJet(ctx) {
  const base = '#8d9aa8';
  // --- ailes delta ---
  const wing = [
    [9, -8],
    [22, 4],
    [46, 26],
    [46, 33],
    [38, 35],
    [9, 35],
  ];
  const wingPath = () => {
    poly(ctx, wing);
  };
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    wingPath();
    ctx.fillStyle = vGrad(ctx, -8, 35, [
      [0, shade(base, 0.2)],
      [1, shade(base, -0.15)],
    ]);
    ctx.fill();
    camoBlotches(ctx, wingPath, ['rgba(70,82,96,0.45)', 'rgba(120,132,146,0.35)'], m ? 11 : 7, 10, 40);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(30,35,42,0.85)';
    wingPath();
    ctx.stroke();
    // bord d'attaque clair
    ctx.beginPath();
    ctx.moveTo(10, -7);
    ctx.lineTo(45.5, 26.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // volets / élevons
    panelLines(ctx, [
      [14, 31, 44, 31],
      [27, 31, 27, 35],
      [37, 31, 37, 35],
      [18, 6, 18, 31],
      [30, 18, 30, 31],
    ]);
    // pylônes + réservoir
    ctx.fillStyle = '#5a6470';
    ctx.fillRect(20.5, 12, 1.8, 10);
    ctx.beginPath();
    ctx.ellipse(21.4, 17, 3.1, 11, 0, 0, TAU);
    ctx.fillStyle = hGrad(ctx, 18, 25, [
      [0, '#6c7682'],
      [0.35, '#c9d0d8'],
      [1, '#59626d'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // bombe sous l'aile
    ctx.beginPath();
    ctx.ellipse(32, 22, 2.4, 7.5, 0, 0, TAU);
    ctx.fillStyle = hGrad(ctx, 29.6, 34.4, [
      [0, '#4e5636'],
      [0.4, '#8a935f'],
      [1, '#3d4429'],
    ]);
    ctx.fill();
    ctx.fillStyle = '#e3c341';
    ctx.fillRect(29.8, 16.5, 4.4, 0.9);
    // missile en bout d'aile
    ctx.beginPath();
    ctx.ellipse(46, 18, 1.6, 12, 0, 0, TAU);
    ctx.fillStyle = hGrad(ctx, 44.4, 47.6, [
      [0, '#9da3a8'],
      [0.4, '#f4f6f8'],
      [1, '#8a9096'],
    ]);
    ctx.fill();
    ctx.fillStyle = '#c73a2f';
    ctx.fillRect(44.5, 7.5, 3, 1.4);
    ctx.fillStyle = '#4a4e52';
    poly(ctx, [
      [44.4, 26],
      [42.4, 30],
      [44.6, 29.5],
    ]);
    ctx.fill();
    // cocarde
    roundel(ctx, 32, 28.5, 3.6, ['#1f3f9a', '#f2f2f2', '#d0252f']);
    ctx.restore();
  }

  // --- canards ---
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    poly(ctx, [
      [7.5, -27],
      [19, -17.5],
      [19, -14.5],
      [8.5, -15],
    ]);
    ctx.fillStyle = vGrad(ctx, -27, -14, [
      [0, shade(base, 0.25)],
      [1, shade(base, -0.2)],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,35,42,0.8)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // entrées d'air
    poly(ctx, [
      [8.5, -14],
      [12.5, -12],
      [12.5, -2],
      [9.5, -2],
    ]);
    ctx.fillStyle = '#1a1e22';
    ctx.fill();
    ctx.restore();
  }

  // --- fuselage ---
  const fus = [
    [0, -57],
    [1.6, -54],
    [3.2, -49],
    [5, -42],
    [6.6, -34],
    [8, -24],
    [9.2, -12],
    [10.2, 2],
    [10.4, 18],
    [9.8, 32],
    [9, 44],
    [8.6, 52],
    [0, 52],
  ];
  sym(ctx, fus);
  ctx.fillStyle = cylinder(ctx, 10.5, base);
  ctx.fill();
  camoBlotches(ctx, () => sym(ctx, fus), ['rgba(70,82,96,0.4)', 'rgba(130,142,156,0.35)'], 3, 9, 50);
  // reflet longitudinal
  ctx.save();
  sym(ctx, fus);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-4.5, -50, 2.4, 98);
  ctx.restore();
  sym(ctx, fus);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(25,30,36,0.9)';
  ctx.stroke();
  // radôme
  ctx.save();
  sym(ctx, fus);
  ctx.clip();
  ctx.fillStyle = 'rgba(40,46,54,0.55)';
  ctx.fillRect(-10, -60, 20, 13);
  ctx.restore();
  // perche de ravitaillement
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4.2, -40);
  ctx.lineTo(5, -50);
  ctx.stroke();

  panelLines(ctx, [
    [-6.6, -34, 6.6, -34],
    [-9, -8, 9, -8],
    [-10.2, 10, 10.2, 10],
    [-9.8, 30, 9.8, 30],
    [-3, -20, -3, 44],
    [3, -20, 3, 44],
  ]);

  // dérive (vue de dessus)
  poly(ctx, [
    [-1.4, 12],
    [1.4, 12],
    [1.2, 50],
    [-1.2, 50],
  ]);
  ctx.fillStyle = hGrad(ctx, -1.4, 1.4, [
    [0, '#c5ced8'],
    [1, '#4e5864'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // tuyères
  nozzle(ctx, -4.6, 51.5, 4.3);
  nozzle(ctx, 4.6, 51.5, 4.3);

  // verrière
  canopy(ctx, 0, -32, 4.3, 11);

  // numéro
  ctx.fillStyle = 'rgba(20,24,30,0.7)';
  ctx.font = 'bold 4px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('07', 0, 24);
}

function drawEnemyFighter(ctx, base, accent, variant = 0) {
  // type Su-27 : ailes en flèche, double dérive, empennages séparés
  const wing = [
    [12, -8],
    [44, 20],
    [45, 27],
    [14, 26],
  ];
  const tail = [
    [11, 34],
    [28, 46],
    [28, 51],
    [10, 51],
  ];
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    poly(ctx, wing);
    ctx.fillStyle = vGrad(ctx, -8, 27, [
      [0, shade(base, 0.15)],
      [1, shade(base, -0.25)],
    ]);
    ctx.fill();
    camoBlotches(ctx, () => poly(ctx, wing), [shade(base, -0.35), shade(base, 0.2)], m ? 5 : 9, 8, 30);
    poly(ctx, wing);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    poly(ctx, tail);
    ctx.fillStyle = shade(base, -0.1);
    ctx.fill();
    ctx.stroke();
    panelLines(ctx, [
      [16, 22, 42, 22],
      [26, 9, 26, 24],
    ]);
    // missiles sous les ailes
    for (const mx of [24, 34]) {
      ctx.beginPath();
      ctx.ellipse(mx, 12 + (mx - 24) * 0.4, 1.5, 8, 0, 0, TAU);
      ctx.fillStyle = '#d8d8d0';
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(mx - 1.5, 4 + (mx - 24) * 0.4, 3, 1.2);
    }
    // insigne
    ctx.save();
    ctx.translate(32, 18);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU * 2) / 5;
      ctx.lineTo(Math.cos(a) * 4, Math.sin(a) * 4);
    }
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#f5f5f5';
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  const fus = [
    [0, -60],
    [2.4, -54],
    [4.6, -44],
    [6, -32],
    [7, -20],
    [12, -11],
    [13, 0],
    [13.5, 28],
    [12, 44],
    [10, 54],
    [0, 52],
  ];
  sym(ctx, fus);
  ctx.fillStyle = cylinder(ctx, 13.5, base);
  ctx.fill();
  sym(ctx, fus);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.save();
  sym(ctx, fus);
  ctx.clip();
  ctx.fillStyle = 'rgba(30,30,30,0.55)';
  ctx.fillRect(-12, -62, 24, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(-5, -55, 2.5, 100);
  ctx.restore();
  panelLines(ctx, [
    [-7, -20, 7, -20],
    [-13, 4, 13, 4],
    [-13, 26, 13, 26],
    [0, -10, 0, 50],
  ]);
  // doubles dérives
  for (const fx of [-9, 9]) {
    poly(ctx, [
      [fx - 1.3, 26],
      [fx + 1.3, 26],
      [fx + 1.1, 52],
      [fx - 1.1, 52],
    ]);
    ctx.fillStyle = hGrad(ctx, fx - 1.3, fx + 1.3, [
      [0, shade(base, 0.3)],
      [1, shade(base, -0.5)],
    ]);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(fx - 1.2, 44, 2.4, 3);
  }
  nozzle(ctx, -6, 53, 4.6);
  nozzle(ctx, 6, 53, 4.6);
  canopy(ctx, 0, -34, 4.2, 10);
  if (variant === 1) {
    // as : bandes rouges
    ctx.fillStyle = 'rgba(200,20,20,0.75)';
    ctx.fillRect(-13, 8, 26, 3);
    ctx.fillRect(-13, 13, 26, 1.5);
  }
}

function drawInterceptor(ctx) {
  const base = '#3d4248';
  const wing = [
    [10, 6],
    [36, 24],
    [36, 32],
    [11, 30],
  ];
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    poly(ctx, wing);
    ctx.fillStyle = vGrad(ctx, 6, 32, [
      [0, shade(base, 0.2)],
      [1, shade(base, -0.3)],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    poly(ctx, [
      [9, 40],
      [22, 50],
      [22, 54],
      [9, 54],
    ]);
    ctx.fillStyle = shade(base, -0.1);
    ctx.fill();
    ctx.stroke();
    // grosses entrées d'air
    poly(ctx, [
      [7, -26],
      [13, -20],
      [13, 4],
      [8, 4],
    ]);
    ctx.fillStyle = hGrad(ctx, 7, 13, [
      [0, shade(base, 0.25)],
      [1, shade(base, -0.4)],
    ]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(8.5, -22, 3.5, 3);
    // missile long
    ctx.beginPath();
    ctx.ellipse(26, 20, 1.8, 11, 0, 0, TAU);
    ctx.fillStyle = '#c9c9c0';
    ctx.fill();
    ctx.fillStyle = '#c52b2b';
    ctx.fillRect(24.2, 9, 3.6, 1.6);
    ctx.restore();
  }
  const fus = [
    [0, -64],
    [2, -58],
    [4, -48],
    [5.5, -34],
    [7, -20],
    [8, 0],
    [9, 30],
    [8.5, 52],
    [0, 54],
  ];
  sym(ctx, fus);
  ctx.fillStyle = cylinder(ctx, 9, base);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.save();
  sym(ctx, fus);
  ctx.clip();
  ctx.fillStyle = '#1b1d20';
  ctx.fillRect(-9, -66, 18, 12);
  ctx.restore();
  panelLines(ctx, [
    [-8, 0, 8, 0],
    [-9, 28, 9, 28],
  ]);
  for (const fx of [-6, 6]) {
    poly(ctx, [
      [fx - 1.2, 30],
      [fx + 1.2, 30],
      [fx + 1, 54],
      [fx - 1, 54],
    ]);
    ctx.fillStyle = '#25282c';
    ctx.fill();
    ctx.fillStyle = '#d9a12b';
    ctx.fillRect(fx - 1, 46, 2, 2.5);
  }
  nozzle(ctx, -4.5, 54, 4.4);
  nozzle(ctx, 4.5, 54, 4.4);
  canopy(ctx, 0, -38, 3.6, 9);
}

function drawBomber(ctx) {
  const base = '#6b7055';
  // ailes en flèche, 4 réacteurs
  const wing = [
    [8, -18],
    [118, 34],
    [120, 44],
    [104, 46],
    [10, 18],
  ];
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    poly(ctx, wing);
    ctx.fillStyle = vGrad(ctx, -18, 46, [
      [0, shade(base, 0.2)],
      [1, shade(base, -0.3)],
    ]);
    ctx.fill();
    camoBlotches(ctx, () => poly(ctx, wing), ['rgba(60,60,40,0.5)', 'rgba(120,120,90,0.35)'], m ? 21 : 13, 22, 120);
    poly(ctx, wing);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    panelLines(ctx, [
      [20, 14, 110, 42],
      [40, 4, 40, 25],
      [70, 18, 70, 34],
      [95, 30, 95, 41],
    ]);
    // nacelles moteur
    for (const [ex, ey] of [
      [42, 6],
      [76, 22],
    ]) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6, 17, 0, 0, TAU);
      ctx.fillStyle = hGrad(ctx, ex - 6, ex + 6, [
        [0, '#2c2e24'],
        [0.35, '#9a9c86'],
        [1, '#2a2b22'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey - 14, 4.2, 0, TAU);
      ctx.fillStyle = '#121212';
      ctx.fill();
      nozzle(ctx, ex, ey + 16, 3.6);
    }
    ctx.restore();
  }
  // empennage
  for (const m of [false, true]) {
    ctx.save();
    if (m) ctx.scale(-1, 1);
    poly(ctx, [
      [6, 62],
      [40, 78],
      [40, 85],
      [6, 82],
    ]);
    ctx.fillStyle = shade(base, -0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.stroke();
    ctx.restore();
  }
  const fus = [
    [0, -84],
    [5, -78],
    [9, -66],
    [11, -40],
    [11.5, 40],
    [9, 70],
    [5, 86],
    [0, 88],
  ];
  sym(ctx, fus);
  ctx.fillStyle = cylinder(ctx, 11.5, base);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  panelLines(ctx, [
    [-11, -40, 11, -40],
    [-11, 0, 11, 0],
    [-11, 40, 11, 40],
    [0, -60, 0, 80],
  ]);
  // vitrage du nez
  ctx.beginPath();
  ctx.ellipse(0, -74, 5, 7, 0, 0, TAU);
  ctx.fillStyle = 'rgba(30,70,100,0.85)';
  ctx.fill();
  canopy(ctx, 0, -60, 5, 6);
  // tourelle de queue
  ctx.beginPath();
  ctx.arc(0, 84, 4, 0, TAU);
  ctx.fillStyle = '#2e2f26';
  ctx.fill();
  // insigne
  ctx.fillStyle = '#b52a2a';
  ctx.beginPath();
  ctx.moveTo(-90, 30);
  ctx.lineTo(-84, 22);
  ctx.lineTo(-78, 30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(90, 30);
  ctx.lineTo(84, 22);
  ctx.lineTo(78, 30);
  ctx.closePath();
  ctx.fill();
}

function drawDrone(ctx) {
  const base = '#7d7f7a';
  sym(ctx, [
    [0, -20],
    [4, -14],
    [22, 10],
    [23, 15],
    [6, 12],
    [4, 18],
    [0, 18],
  ]);
  ctx.fillStyle = vGrad(ctx, -20, 18, [
    [0, shade(base, 0.25)],
    [1, shade(base, -0.35)],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // winglets
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#3f403d';
    ctx.fillRect(s * 22.5 - 1, 6, 2, 10);
  }
  // tête
  ctx.beginPath();
  ctx.ellipse(0, -10, 3.5, 7, 0, 0, TAU);
  ctx.fillStyle = '#2c2c2c';
  ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(0, -15, 1.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d4b106';
  ctx.fillRect(-6, 0, 12, 2);
}

function drawHeliBody(ctx, base) {
  // poutre de queue
  poly(ctx, [
    [-2.4, 10],
    [2.4, 10],
    [1.6, 56],
    [-1.6, 56],
  ]);
  ctx.fillStyle = hGrad(ctx, -2.4, 2.4, [
    [0, shade(base, 0.2)],
    [1, shade(base, -0.4)],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // stabilisateur
  ctx.fillStyle = shade(base, -0.1);
  ctx.fillRect(-10, 46, 20, 3.5);
  // rotor de queue
  ctx.fillStyle = '#222';
  ctx.fillRect(2, 52, 1.5, 9);
  // ailettes avec paniers roquettes
  for (const s of [-1, 1]) {
    ctx.fillStyle = shade(base, -0.15);
    ctx.fillRect(s > 0 ? 8 : -24, -2, 16, 5);
    for (const px of [16, 22]) {
      ctx.beginPath();
      ctx.ellipse(s * px, 1, 2.6, 7, 0, 0, TAU);
      ctx.fillStyle = '#3b3d35';
      ctx.fill();
      ctx.fillStyle = '#c7a43a';
      ctx.fillRect(s * px - 2, -6, 4, 1);
    }
  }
  // fuselage
  sym(ctx, [
    [0, -34],
    [4, -30],
    [7, -20],
    [9, -6],
    [9, 8],
    [6, 16],
    [0, 18],
  ]);
  ctx.fillStyle = cylinder(ctx, 9, base);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // canon sous le nez
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(-1, -42, 2, 9);
  canopy(ctx, 0, -22, 4.6, 8);
  canopy(ctx, 0, -10, 4.2, 5);
  // moteurs
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 6, 2, 3, 8, 0, 0, TAU);
    ctx.fillStyle = shade(base, -0.25);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -2, 3, 0, TAU);
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();
}

function makeAircraftSprites() {
  Sprites.make('player', 100, 118, drawPlayerJet);
  Sprites.make('fighter', 96, 120, (c) => drawEnemyFighter(c, '#6e7562', '#c92a2a'));
  Sprites.make('ace', 96, 120, (c) => drawEnemyFighter(c, '#2f3136', '#e02020', 1));
  Sprites.make('interceptor', 76, 124, drawInterceptor);
  Sprites.make('bomber', 246, 180, drawBomber);
  Sprites.make('drone', 50, 42, drawDrone);
  Sprites.make('heli', 54, 100, (c) => drawHeliBody(c, '#55603f'));
  Sprites.make('heliBoss', 54, 100, (c) => drawHeliBody(c, '#3a3f44'));
}

// ---- missiles et bombes -------------------------------------------------------

function drawMissileShape(ctx, len, rad, body, opts = {}) {
  const half = len / 2;
  // ailerons arrière
  ctx.fillStyle = opts.fin || '#333';
  for (const s of [-1, 1]) {
    poly(ctx, [
      [s * rad, half - len * 0.22],
      [s * (rad + (opts.finW || rad * 1.4)), half],
      [s * rad, half],
    ]);
    ctx.fill();
  }
  if (opts.canard) {
    for (const s of [-1, 1]) {
      poly(ctx, [
        [s * rad, -half + len * 0.22],
        [s * (rad + rad * 0.9), -half + len * 0.3],
        [s * rad, -half + len * 0.32],
      ]);
      ctx.fill();
    }
  }
  // corps
  ctx.beginPath();
  ctx.moveTo(-rad, half);
  ctx.lineTo(-rad, -half + rad * 2.2);
  ctx.quadraticCurveTo(-rad, -half, 0, -half);
  ctx.quadraticCurveTo(rad, -half, rad, -half + rad * 2.2);
  ctx.lineTo(rad, half);
  ctx.closePath();
  ctx.fillStyle = hGrad(ctx, -rad, rad, [
    [0, shade(body, -0.4)],
    [0.35, shade(body, 0.35)],
    [1, shade(body, -0.5)],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  if (opts.nose) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = opts.nose;
    ctx.fillRect(-rad, -half, rad * 2, rad * 2.4);
    ctx.restore();
  }
  (opts.bands || []).forEach(([y, h, col]) => {
    ctx.fillStyle = col;
    ctx.fillRect(-rad, -half + len * y, rad * 2, h);
  });
}

function makeMissileSprites() {
  // --- ennemis ---
  Sprites.make('m_rocket', 18, 32, (c) => drawMissileShape(c, 30, 3, '#8c8c84', { fin: '#2f2f2f', bands: [[0.25, 1.4, '#b02a2a']] }));
  Sprites.make('m_homing', 20, 42, (c) =>
    drawMissileShape(c, 40, 3.6, '#e8e8e2', { fin: '#3a3a3a', canard: true, nose: '#2e2e2e', bands: [[0.32, 1.6, '#c22'], [0.38, 1, '#c22']] }),
  );
  Sprites.make('m_cluster', 28, 48, (c) => {
    drawMissileShape(c, 46, 6, '#6d7348', { fin: '#2d301d', finW: 7, bands: [[0.22, 2, '#e6c229'], [0.85, 1.5, '#e6c229']] });
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-6, -8 + i * 7);
      c.lineTo(6, -8 + i * 7);
      c.stroke();
    }
  });
  Sprites.make('m_hyper', 16, 58, (c) => {
    drawMissileShape(c, 56, 3.2, '#2a2b30', { fin: '#141416', finW: 4 });
    const g = c.createLinearGradient(0, -28, 0, -14);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.3, '#ff8a2a');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -28);
    c.quadraticCurveTo(3.2, -24, 3.2, -14);
    c.lineTo(-3.2, -14);
    c.quadraticCurveTo(-3.2, -24, 0, -28);
    c.fill();
  });
  Sprites.make('m_fire', 24, 42, (c) =>
    drawMissileShape(c, 40, 5, '#7a1f12', { fin: '#2a0d08', nose: '#ff7a1a', bands: [[0.4, 2, '#ffb000'], [0.55, 1.5, '#ffb000']] }),
  );
  Sprites.make('m_emp', 24, 42, (c) => {
    drawMissileShape(c, 40, 5, '#1f3d66', { fin: '#0e1c30', nose: '#9ff', canard: true });
    c.strokeStyle = '#4fe3ff';
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-5, -6 + i * 5);
      c.lineTo(5, -4 + i * 5);
      c.stroke();
    }
  });
  Sprites.make('m_swarm', 10, 18, (c) => drawMissileShape(c, 16, 1.8, '#b8b8b0', { fin: '#333', nose: '#d22' }));
  Sprites.make('m_heavy', 44, 84, (c) => {
    drawMissileShape(c, 80, 10, '#43464a', { fin: '#1f2124', finW: 12, canard: true });
    // ogive rayée jaune/noir
    c.save();
    c.beginPath();
    c.rect(-10, -30, 20, 12);
    c.clip();
    for (let i = -4; i < 6; i++) {
      c.fillStyle = i % 2 ? '#111' : '#e8c21a';
      c.beginPath();
      c.moveTo(-10 + i * 5, -30);
      c.lineTo(-5 + i * 5, -30);
      c.lineTo(-15 + i * 5, -18);
      c.lineTo(-20 + i * 5, -18);
      c.fill();
    }
    c.restore();
    panelLines(c, [
      [-10, 0, 10, 0],
      [-10, 20, 10, 20],
    ], 0.5, 0.6);
  });

  // --- joueur ---
  Sprites.make('p_aim', 14, 36, (c) => drawMissileShape(c, 34, 2.4, '#f2f2f0', { fin: '#555', canard: true, nose: '#3a3a3a', bands: [[0.3, 1.2, '#d4a514']] }));
  Sprites.make('p_agm', 14, 30, (c) => drawMissileShape(c, 28, 2.8, '#5d6b3a', { fin: '#2b3018', canard: true, nose: '#222', bands: [[0.5, 1.2, '#d4a514']] }));
  Sprites.make('p_mk82', 22, 34, (c) => {
    c.fillStyle = '#3a3e2a';
    for (const s of [-1, 1]) {
      poly(c, [
        [s * 2, 10],
        [s * 9, 16],
        [s * 9, 16.5],
        [s * 2, 16.5],
      ]);
      c.fill();
    }
    c.beginPath();
    c.ellipse(0, 0, 5, 14, 0, 0, TAU);
    c.fillStyle = hGrad(c, -5, 5, [
      [0, '#3e4429'],
      [0.35, '#8e9a62'],
      [1, '#343922'],
    ]);
    c.fill();
    c.fillStyle = '#e4c23b';
    c.fillRect(-4.6, -9, 9.2, 1.4);
  });
  Sprites.make('p_cluster', 24, 36, (c) => {
    c.beginPath();
    c.ellipse(0, 0, 6, 15, 0, 0, TAU);
    c.fillStyle = hGrad(c, -6, 6, [
      [0, '#5a4a2a'],
      [0.35, '#c8a05a'],
      [1, '#4a3b20'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(0, -14);
    c.lineTo(0, 14);
    c.stroke();
    c.fillStyle = '#ffb347';
    c.fillRect(-5.6, -6, 11.2, 1.4);
    c.fillRect(-5.6, 4, 11.2, 1.4);
  });
  Sprites.make('p_napalm', 20, 40, (c) => {
    c.beginPath();
    c.ellipse(0, 0, 5.5, 17, 0, 0, TAU);
    c.fillStyle = hGrad(c, -5.5, 5.5, [
      [0, '#6c6f72'],
      [0.35, '#eef0f2'],
      [1, '#5b5e61'],
    ]);
    c.fill();
    c.fillStyle = '#ff6a00';
    c.fillRect(-5.2, -2, 10.4, 2);
  });
  Sprites.make('p_emp', 24, 38, (c) => {
    drawMissileShape(c, 34, 6, '#21426e', { fin: '#0e1c30', nose: '#4fd8ff' });
    c.strokeStyle = '#4fd8ff';
    c.lineWidth = 1;
    c.strokeRect(-6, -4, 12, 10);
  });
  Sprites.make('p_thermo', 28, 44, (c) => {
    drawMissileShape(c, 40, 7.5, '#262626', { fin: '#111', finW: 7 });
    c.fillStyle = '#ff3d3d';
    c.fillRect(-7.5, -6, 15, 2.5);
    c.fillStyle = '#ffd400';
    c.fillRect(-7.5, -1, 15, 1.5);
  });
  Sprites.make('p_nuke', 32, 50, (c) => {
    drawMissileShape(c, 46, 9, '#e9e9e2', { fin: '#555', finW: 8 });
    c.beginPath();
    c.arc(0, 2, 6, 0, TAU);
    c.fillStyle = '#ffd400';
    c.fill();
    c.fillStyle = '#111';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(0, 2);
      c.arc(0, 2, 5.5, -Math.PI / 2 + (i * TAU) / 3 - 0.5, -Math.PI / 2 + (i * TAU) / 3 + 0.5);
      c.closePath();
      c.fill();
    }
    c.beginPath();
    c.arc(0, 2, 1.4, 0, TAU);
    c.fillStyle = '#ffd400';
    c.fill();
  });
  Sprites.make('p_bomblet', 8, 10, (c) => {
    c.beginPath();
    c.arc(0, 0, 3.2, 0, TAU);
    c.fillStyle = '#c8a05a';
    c.fill();
    c.strokeStyle = '#3a2a10';
    c.lineWidth = 0.6;
    c.stroke();
  });
}

// ---- unités au sol ------------------------------------------------------------

const CAMO = {
  desert: { base: '#b39867', dark: '#7c6643', light: '#d4bd8a' },
  green: { base: '#5e6b3f', dark: '#3c4527', light: '#7e8c58' },
  navy: { base: '#7d8790', dark: '#4f575e', light: '#a9b2ba' },
  snow: { base: '#d9dde0', dark: '#8f979c', light: '#ffffff' },
  urban: { base: '#7a7d80', dark: '#4c4f52', light: '#a3a6a9' },
  dark: { base: '#4a4640', dark: '#2a2723', light: '#6c665c' },
};

function treads(ctx, x, y, w, h) {
  ctx.fillStyle = '#1e1e1c';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(90,90,85,0.9)';
  ctx.lineWidth = 0.6;
  for (let i = y + 1.5; i < y + h; i += 3) {
    ctx.beginPath();
    ctx.moveTo(x, i);
    ctx.lineTo(x + w, i);
    ctx.stroke();
  }
}

function makeGroundSprites(camoName) {
  const C = CAMO[camoName] || CAMO.green;
  const S = {};
  S.tankHull = Sprites.make(null, 44, 62, (c) => {
    treads(c, -21, -28, 8, 56);
    treads(c, 13, -28, 8, 56);
    poly(c, [
      [-14, -29],
      [14, -29],
      [16, -24],
      [16, 28],
      [-16, 28],
      [-16, -24],
    ]);
    c.fillStyle = vGrad(c, -29, 28, [
      [0, C.light],
      [1, C.dark],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
    panelLines(c, [
      [-16, -18, 16, -18],
      [-16, 18, 16, 18],
    ], 0.35, 0.6);
    c.fillStyle = C.dark;
    c.fillRect(-10, 20, 8, 6);
    c.fillRect(2, 20, 8, 6);
  });
  S.tankTurret = Sprites.make(null, 30, 78, (c) => {
    // canon vers le haut
    c.fillStyle = hGrad(c, -2, 2, [
      [0, '#2a2a28'],
      [0.4, C.light],
      [1, '#1e1e1c'],
    ]);
    c.fillRect(-2, -38, 4, 30);
    c.fillStyle = '#222';
    c.fillRect(-2.8, -39, 5.6, 4);
    c.beginPath();
    c.ellipse(0, 2, 12, 14, 0, 0, TAU);
    const g = c.createRadialGradient(-4, -3, 1, 0, 2, 15);
    g.addColorStop(0, C.light);
    g.addColorStop(1, C.dark);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
    c.beginPath();
    c.arc(4, 5, 3.5, 0, TAU);
    c.fillStyle = C.dark;
    c.fill();
    c.stroke();
  });
  S.samHull = Sprites.make(null, 40, 76, (c) => {
    for (const y of [-26, -10, 14, 28]) {
      c.fillStyle = '#1b1b1b';
      c.fillRect(-18, y - 4, 4, 8);
      c.fillRect(14, y - 4, 4, 8);
    }
    c.fillStyle = vGrad(c, -36, 36, [
      [0, C.light],
      [1, C.dark],
    ]);
    c.fillRect(-15, -36, 30, 72);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.strokeRect(-15, -36, 30, 72);
    // cabine
    c.fillStyle = C.dark;
    c.fillRect(-14, -35, 28, 14);
    c.fillStyle = 'rgba(40,80,110,0.9)';
    c.fillRect(-11, -34, 22, 4);
  });
  S.samLauncher = Sprites.make(null, 34, 56, (c) => {
    c.fillStyle = '#2b2b29';
    c.fillRect(-13, -4, 26, 14);
    for (let i = 0; i < 4; i++) {
      const x = -12 + i * 6.3;
      c.fillStyle = hGrad(c, x, x + 5, [
        [0, C.dark],
        [0.4, C.light],
        [1, C.dark],
      ]);
      c.fillRect(x, -26, 5, 34);
      c.fillStyle = '#c62828';
      c.fillRect(x + 0.6, -26, 3.8, 2.5);
    }
  });
  S.flakBase = Sprites.make(null, 64, 64, (c) => {
    // sacs de sable
    for (let a = 0; a < TAU; a += TAU / 16) {
      c.beginPath();
      c.ellipse(Math.cos(a) * 24, Math.sin(a) * 24, 6, 4, a + Math.PI / 2, 0, TAU);
      c.fillStyle = '#9c8a64';
      c.fill();
      c.strokeStyle = 'rgba(60,45,25,0.8)';
      c.lineWidth = 0.6;
      c.stroke();
    }
    c.beginPath();
    c.arc(0, 0, 19, 0, TAU);
    c.fillStyle = '#4b4a40';
    c.fill();
    c.beginPath();
    c.arc(0, 0, 10, 0, TAU);
    c.fillStyle = C.dark;
    c.fill();
  });
  S.flakGun = Sprites.make(null, 26, 70, (c) => {
    for (const x of [-4.5, 4.5]) {
      c.fillStyle = hGrad(c, x - 1.6, x + 1.6, [
        [0, '#1c1c1c'],
        [0.4, '#777'],
        [1, '#1c1c1c'],
      ]);
      c.fillRect(x - 1.6, -32, 3.2, 30);
      c.fillStyle = '#111';
      c.fillRect(x - 2.2, -34, 4.4, 4);
    }
    c.beginPath();
    c.ellipse(0, 2, 10, 11, 0, 0, TAU);
    c.fillStyle = vGrad(c, -9, 13, [
      [0, C.light],
      [1, C.dark],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
  });
  S.bunker = Sprites.make(null, 84, 84, (c) => {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + Math.PI / 6;
      c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
    }
    c.closePath();
    const g = c.createRadialGradient(-10, -10, 4, 0, 0, 42);
    g.addColorStop(0, '#b9b5aa');
    g.addColorStop(1, '#5d5a52');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1.2;
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + Math.PI / 6;
      c.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
    }
    c.closePath();
    c.fillStyle = '#8c887e';
    c.fill();
    c.stroke();
    // meurtrières
    c.fillStyle = '#111';
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      c.save();
      c.rotate(a);
      c.fillRect(-6, -36, 12, 3);
      c.restore();
    }
    // lanceurs
    c.fillStyle = '#3d3b36';
    c.fillRect(-12, -12, 24, 24);
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc(-7 + (i % 3) * 7, -7 + Math.floor(i / 3) * 7, 2.4, 0, TAU);
      c.fillStyle = '#0d0d0d';
      c.fill();
    }
  });
  S.radarBase = Sprites.make(null, 60, 60, (c) => {
    c.fillStyle = C.dark;
    c.fillRect(-26, -26, 52, 52);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1;
    c.strokeRect(-26, -26, 52, 52);
    c.fillStyle = C.base;
    c.fillRect(-22, -22, 44, 44);
    c.beginPath();
    c.arc(0, 0, 8, 0, TAU);
    c.fillStyle = '#333';
    c.fill();
    // générateur
    c.fillStyle = '#556';
    c.fillRect(10, 12, 12, 8);
  });
  S.radarDish = Sprites.make(null, 64, 30, (c) => {
    c.beginPath();
    c.ellipse(0, 0, 30, 9, 0, Math.PI, TAU);
    c.lineTo(30, 3);
    c.ellipse(0, 3, 30, 5, 0, 0, Math.PI, false);
    c.closePath();
    c.fillStyle = vGrad(c, -9, 8, [
      [0, '#f0f0ea'],
      [1, '#7d7d76'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = -24; i <= 24; i += 8) {
      c.beginPath();
      c.moveTo(i, -7);
      c.lineTo(i, 6);
      c.stroke();
    }
  });
  S.frigate = Sprites.make(null, 56, 176, (c) => {
    sym(c, [
      [0, -86],
      [8, -66],
      [16, -36],
      [19, 0],
      [19, 60],
      [16, 84],
      [0, 85],
    ]);
    c.fillStyle = hGrad(c, -19, 19, [
      [0, '#4b545c'],
      [0.35, '#a4adb5'],
      [1, '#3f474e'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 1;
    c.stroke();
    // pont
    c.fillStyle = '#6f777e';
    c.fillRect(-12, -30, 24, 70);
    // superstructure
    c.fillStyle = vGrad(c, -26, 12, [
      [0, '#d4dadf'],
      [1, '#7e868c'],
    ]);
    c.fillRect(-11, -24, 22, 36);
    c.strokeRect(-11, -24, 22, 36);
    c.fillStyle = '#20262b';
    c.fillRect(-9, -22, 18, 3);
    // mât radar
    c.beginPath();
    c.arc(0, -4, 5, 0, TAU);
    c.fillStyle = '#e8ecef';
    c.fill();
    c.stroke();
    // cellules VLS
    for (let i = 0; i < 8; i++) {
      c.fillStyle = '#2a3035';
      c.fillRect(-8 + (i % 4) * 4.4, -50 + Math.floor(i / 4) * 5, 3.6, 4);
    }
    // canon avant
    c.beginPath();
    c.arc(0, -62, 6, 0, TAU);
    c.fillStyle = '#c4cbd0';
    c.fill();
    c.stroke();
    c.fillStyle = '#222';
    c.fillRect(-1, -78, 2, 14);
    // hélipad
    c.strokeStyle = '#e8e8e8';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 60, 11, 0, TAU);
    c.stroke();
    c.font = 'bold 12px sans-serif';
    c.fillStyle = '#e8e8e8';
    c.textAlign = 'center';
    c.fillText('H', 0, 64);
  });
  S.boat = Sprites.make(null, 30, 76, (c) => {
    sym(c, [
      [0, -36],
      [7, -20],
      [11, 0],
      [11, 30],
      [9, 36],
      [0, 36],
    ]);
    c.fillStyle = hGrad(c, -11, 11, [
      [0, '#4a5258'],
      [0.35, '#b6bec4'],
      [1, '#3e454b'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 0.8;
    c.stroke();
    c.fillStyle = '#d6dce0';
    c.fillRect(-6, -6, 12, 16);
    c.fillStyle = '#1e2428';
    c.fillRect(-5, -5, 10, 3);
    c.fillStyle = '#333';
    c.fillRect(-1, -30, 2, 12);
    c.beginPath();
    c.arc(0, -18, 3.5, 0, TAU);
    c.fillStyle = '#7e868c';
    c.fill();
  });
  return S;
}

// ---- boss -----------------------------------------------------------------

function makeBossSprites() {
  // Cuirassé
  Sprites.make('battleship', 170, 540, (c) => {
    sym(c, [
      [0, -268],
      [22, -220],
      [52, -140],
      [70, -40],
      [72, 120],
      [64, 220],
      [44, 262],
      [0, 268],
    ]);
    c.fillStyle = hGrad(c, -72, 72, [
      [0, '#3c444b'],
      [0.3, '#97a1aa'],
      [0.6, '#76808a'],
      [1, '#2f363c'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = 2;
    c.stroke();
    // pont en teck
    sym(c, [
      [0, -240],
      [18, -200],
      [44, -130],
      [58, -40],
      [60, 120],
      [52, 210],
      [34, 246],
      [0, 250],
    ]);
    c.fillStyle = '#8a7350';
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(50,35,20,0.35)';
    c.lineWidth = 0.6;
    for (let x = -60; x < 60; x += 4) {
      c.beginPath();
      c.moveTo(x, -260);
      c.lineTo(x, 260);
      c.stroke();
    }
    c.restore();
    // superstructure
    c.fillStyle = vGrad(c, -90, 60, [
      [0, '#cfd6db'],
      [1, '#6d767d'],
    ]);
    c.fillRect(-34, -90, 68, 150);
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 1.5;
    c.strokeRect(-34, -90, 68, 150);
    c.fillStyle = '#9aa3aa';
    c.fillRect(-24, -70, 48, 60);
    c.strokeRect(-24, -70, 48, 60);
    // cheminées
    for (const y of [10, 36]) {
      c.beginPath();
      c.ellipse(0, y, 12, 9, 0, 0, TAU);
      c.fillStyle = '#3a3f44';
      c.fill();
      c.beginPath();
      c.ellipse(0, y, 8, 5.5, 0, 0, TAU);
      c.fillStyle = '#0d0d0d';
      c.fill();
    }
    // radar
    c.beginPath();
    c.arc(0, -46, 10, 0, TAU);
    c.fillStyle = '#e9edf0';
    c.fill();
    c.stroke();
    // cellules VLS
    for (let i = 0; i < 24; i++) {
      c.fillStyle = '#262b30';
      c.fillRect(-26 + (i % 8) * 6.8, 80 + Math.floor(i / 8) * 7, 5.6, 5.6);
    }
    for (let i = 0; i < 16; i++) {
      c.fillStyle = '#262b30';
      c.fillRect(-26 + (i % 8) * 6.8, -134 + Math.floor(i / 8) * 7, 5.6, 5.6);
    }
  });
  // Tourelle navale (pièce de boss)
  Sprites.make('navalTurret', 50, 96, (c) => {
    for (const x of [-9, 0, 9]) {
      c.fillStyle = hGrad(c, x - 2.5, x + 2.5, [
        [0, '#2a2e32'],
        [0.4, '#9aa2a8'],
        [1, '#22262a'],
      ]);
      c.fillRect(x - 2.5, -46, 5, 40);
    }
    c.beginPath();
    c.moveTo(-20, -6);
    c.lineTo(20, -6);
    c.lineTo(22, 14);
    c.quadraticCurveTo(0, 26, -22, 14);
    c.closePath();
    c.fillStyle = vGrad(c, -6, 22, [
      [0, '#b7c0c7'],
      [1, '#5b646b'],
    ]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = 1.2;
    c.stroke();
  });
  // Forteresse volante
  Sprites.make('fortress', 540, 320, (c) => {
    const base = '#5d6470';
    const wing = [
      [20, -60],
      [262, 40],
      [266, 66],
      [230, 72],
      [24, 40],
    ];
    for (const m of [false, true]) {
      c.save();
      if (m) c.scale(-1, 1);
      poly(c, wing);
      c.fillStyle = vGrad(c, -60, 72, [
        [0, shade(base, 0.25)],
        [1, shade(base, -0.35)],
      ]);
      c.fill();
      camoBlotches(c, () => poly(c, wing), ['rgba(40,44,52,0.5)', 'rgba(140,146,156,0.3)'], m ? 33 : 37, 40, 260);
      poly(c, wing);
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.lineWidth = 1.5;
      c.stroke();
      panelLines(c, [
        [40, 30, 250, 66],
        [100, -16, 100, 50],
        [170, 20, 170, 60],
        [220, 46, 220, 68],
      ], 0.35, 0.8);
      for (const [ex, ey] of [
        [76, -4],
        [136, 24],
        [196, 46],
      ]) {
        c.beginPath();
        c.ellipse(ex, ey, 11, 30, 0, 0, TAU);
        c.fillStyle = hGrad(c, ex - 11, ex + 11, [
          [0, '#202328'],
          [0.35, '#a6adb8'],
          [1, '#1d2025'],
        ]);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.stroke();
        c.beginPath();
        c.arc(ex, ey - 26, 7, 0, TAU);
        c.fillStyle = '#0a0a0a';
        c.fill();
        nozzle(c, ex, ey + 28, 7);
      }
      c.fillStyle = '#b52a2a';
      c.beginPath();
      c.moveTo(230, 56);
      c.lineTo(240, 42);
      c.lineTo(250, 56);
      c.closePath();
      c.fill();
      // empennage
      poly(c, [
        [14, 110],
        [80, 132],
        [80, 146],
        [14, 140],
      ]);
      c.fillStyle = shade(base, -0.1);
      c.fill();
      c.stroke();
      c.restore();
    }
    const fus = [
      [0, -158],
      [10, -146],
      [20, -120],
      [24, -60],
      [24, 100],
      [18, 140],
      [8, 156],
      [0, 158],
    ];
    sym(c, fus);
    c.fillStyle = cylinder(c, 24, base);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 1.5;
    c.stroke();
    panelLines(c, [
      [-24, -60, 24, -60],
      [-24, 0, 24, 0],
      [-24, 60, 24, 60],
      [0, -120, 0, 150],
    ], 0.35, 0.8);
    canopy(c, 0, -128, 9, 12);
    // soute à bombes
    c.fillStyle = '#2b2f36';
    c.fillRect(-12, -20, 24, 70);
    c.strokeStyle = 'rgba(255,200,0,0.6)';
    c.lineWidth = 1;
    c.strokeRect(-12, -20, 24, 70);
  });
  // Tourelle de boss aérienne
  Sprites.make('airTurret', 34, 60, (c) => {
    for (const x of [-4, 4]) {
      c.fillStyle = '#1f1f1f';
      c.fillRect(x - 1.4, -28, 2.8, 24);
    }
    c.beginPath();
    c.arc(0, 0, 11, 0, TAU);
    const g = c.createRadialGradient(-4, -4, 1, 0, 0, 12);
    g.addColorStop(0, '#d9dee3');
    g.addColorStop(0.6, '#6c737b');
    g.addColorStop(1, '#2d3136');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.arc(-2.5, -2.5, 3.5, 0, TAU);
    c.fillStyle = 'rgba(80,160,220,0.8)';
    c.fill();
  });
  // Lanceur de missiles (pièce)
  Sprites.make('launcherPart', 50, 50, (c) => {
    c.fillStyle = '#3b3e42';
    c.fillRect(-22, -22, 44, 44);
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = 1.2;
    c.strokeRect(-22, -22, 44, 44);
    for (let i = 0; i < 16; i++) {
      c.beginPath();
      c.arc(-15 + (i % 4) * 10, -15 + Math.floor(i / 4) * 10, 3.6, 0, TAU);
      c.fillStyle = '#0a0a0a';
      c.fill();
      c.beginPath();
      c.arc(-15 + (i % 4) * 10, -15 + Math.floor(i / 4) * 10, 1.6, 0, TAU);
      c.fillStyle = '#b02a2a';
      c.fill();
    }
  });
  // Citadelle
  Sprites.make('citadel', 520, 400, (c) => {
    // murs extérieurs (étoile de Vauban simplifiée)
    c.beginPath();
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + Math.PI / 8;
      const r = i % 2 === 0 ? 1 : 0.78;
      pts.push([Math.cos(a) * 250 * r, Math.sin(a) * 190 * r]);
    }
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    c.fillStyle = '#6b665c';
    c.fill();
    c.strokeStyle = '#2b2925';
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0] * 0.9, p[1] * 0.9) : c.moveTo(p[0] * 0.9, p[1] * 0.9)));
    c.closePath();
    c.fillStyle = '#4b4a45';
    c.fill();
    // cour intérieure béton
    c.fillStyle = vGrad(c, -120, 120, [
      [0, '#8d8a80'],
      [1, '#5f5c55'],
    ]);
    c.fillRect(-170, -120, 340, 240);
    c.strokeStyle = '#2b2925';
    c.lineWidth = 2;
    c.strokeRect(-170, -120, 340, 240);
    // routes / marquages
    c.strokeStyle = 'rgba(240,210,60,0.6)';
    c.lineWidth = 2;
    c.setLineDash([10, 8]);
    c.beginPath();
    c.moveTo(-170, 0);
    c.lineTo(170, 0);
    c.moveTo(0, -120);
    c.lineTo(0, 120);
    c.stroke();
    c.setLineDash([]);
    // bâtiments
    const blds = [
      [-150, -100, 70, 50],
      [80, -100, 70, 50],
      [-150, 50, 70, 50],
      [80, 50, 70, 50],
    ];
    for (const [x, y, w, h] of blds) {
      c.fillStyle = '#b3aea3';
      c.fillRect(x, y, w, h);
      c.fillStyle = '#7e7a72';
      c.fillRect(x + 4, y + 4, w - 8, h - 8);
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeRect(x, y, w, h);
    }
    // noyau central
    c.beginPath();
    c.arc(0, 0, 56, 0, TAU);
    const g = c.createRadialGradient(-16, -16, 6, 0, 0, 60);
    g.addColorStop(0, '#cfcac0');
    g.addColorStop(1, '#4a4741');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#222';
    c.lineWidth = 2.5;
    c.stroke();
  });
  // Aile volante Oméga
  Sprites.make('omega', 640, 340, (c) => {
    const body = [
      [0, -160],
      [60, -110],
      [200, -20],
      [318, 70],
      [312, 92],
      [220, 76],
      [160, 120],
      [100, 96],
      [50, 150],
      [0, 120],
    ];
    sym(c, body);
    c.fillStyle = vGrad(c, -160, 150, [
      [0, '#3b3f48'],
      [0.5, '#22252c'],
      [1, '#121418'],
    ]);
    c.fill();
    c.strokeStyle = '#0a0a0c';
    c.lineWidth = 2;
    c.stroke();
    // reflets / panneaux
    c.save();
    sym(c, body);
    c.clip();
    c.strokeStyle = 'rgba(120,140,170,0.25)';
    c.lineWidth = 1;
    for (let i = -300; i < 300; i += 28) {
      c.beginPath();
      c.moveTo(i, -160);
      c.lineTo(i + 160, 160);
      c.stroke();
    }
    const hl = c.createLinearGradient(-200, -160, 200, 160);
    hl.addColorStop(0, 'rgba(255,255,255,0.12)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fillRect(-320, -170, 640, 340);
    c.restore();
    // lignes lumineuses
    c.strokeStyle = '#ff2d55';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-300, 78);
    c.lineTo(-200, -6);
    c.lineTo(-60, -100);
    c.moveTo(300, 78);
    c.lineTo(200, -6);
    c.lineTo(60, -100);
    c.stroke();
    // cockpit
    c.beginPath();
    c.ellipse(0, -100, 16, 30, 0, 0, TAU);
    c.fillStyle = '#ff2d55';
    c.globalAlpha = 0.85;
    c.fill();
    c.globalAlpha = 1;
    // moteurs
    for (const x of [-90, -40, 40, 90]) {
      c.beginPath();
      c.ellipse(x, 110, 14, 10, 0, 0, TAU);
      c.fillStyle = '#0b0b0d';
      c.fill();
      c.strokeStyle = '#555b66';
      c.lineWidth = 2;
      c.stroke();
    }
  });
}
