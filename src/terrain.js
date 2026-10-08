'use strict';
// ---------------------------------------------------------------------------
// Terrain procédural défilant par "morceaux" (chunks) de VW x VH.
// - couleur de base calculée en basse résolution avec bruit fBm + ombrage du
//   relief (lumière haut-gauche), générée progressivement pour éviter les
//   saccades ;
// - décor (arbres, rochers, bâtiments, routes...) dessiné en pleine
//   résolution, placé sur une grille monde => raccords parfaits entre chunks.
// ---------------------------------------------------------------------------

const T_RES = 2;
const T_LW = VW / T_RES;
const T_LH = VH / T_RES;
const CELL = 160;

function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      return U.mixColor(a[1], b[1], k);
    }
  }
  return stops[stops.length - 1][1];
}

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// --- Fonctions d'échantillonnage par thème -----------------------------------
// renvoie [r,g,b, hauteur pour l'ombrage, classe] ; classe 0 = eau, 1 = sol
const THEME_SAMPLERS = {
  desert(N, x, y) {
    const h = N.a.fbm(x / 900, y / 900, 5);
    const m = N.b.fbm(x / 260, y / 260, 3);
    const dune = Math.sin(x * 0.011 + y * 0.004 + m * 9) * 0.5 + 0.5;
    let c = ramp(
      [
        [0.25, [178, 138, 88]],
        [0.45, [212, 178, 120]],
        [0.6, [228, 198, 142]],
        [0.72, [200, 156, 100]],
        [0.85, [150, 108, 70]],
      ],
      h + (dune - 0.5) * 0.06,
    );
    const rock = N.c.ridged(x / 400, y / 400, 3);
    if (rock > 0.78) c = U.mixColor(c, [120, 90, 64], Math.min(1, (rock - 0.78) * 6));
    return [c[0], c[1], c[2], h * 0.7 + dune * 0.025 + rock * 0.05, 1];
  },
  canyon(N, x, y) {
    const r = N.a.ridged(x / 700, y / 700, 5);
    const m = N.b.fbm(x / 200, y / 200, 3);
    const e = 1 - r;
    if (e < 0.1) {
      const c = ramp(
        [
          [0, [40, 92, 104]],
          [0.1, [70, 120, 110]],
        ],
        e,
      );
      return [c[0], c[1], c[2], 0, 0];
    }
    const strata = Math.sin(e * 60 + m * 3) * 0.5 + 0.5;
    let c = ramp(
      [
        [0.1, [120, 70, 44]],
        [0.3, [164, 86, 52]],
        [0.5, [196, 116, 70]],
        [0.75, [214, 150, 96]],
        [1, [226, 176, 122]],
      ],
      e,
    );
    c = U.mixColor(c, [150, 80, 50], strata * 0.18);
    return [c[0], c[1], c[2], e * 1.4, 1];
  },
  coast(N, x, y) {
    const h = N.a.fbm(x / 1000, y / 1000, 6) + (x / VW - 0.5) * 0.25;
    const m = N.b.fbm(x / 240, y / 240, 3);
    if (h < 0.47) {
      const c = ramp(
        [
          [0.25, [14, 52, 92]],
          [0.4, [22, 90, 130]],
          [0.46, [52, 150, 168]],
          [0.47, [120, 196, 190]],
        ],
        h,
      );
      return [c[0], c[1], c[2], 0, 0];
    }
    let c;
    if (h < 0.5) c = [222, 206, 160];
    else c = ramp(
      [
        [0.5, [110, 140, 70]],
        [0.6, [76, 118, 52]],
        [0.75, [60, 96, 44]],
        [0.9, [110, 100, 80]],
      ],
      h + (m - 0.5) * 0.1,
    );
    return [c[0], c[1], c[2], h, 1];
  },
  ocean(N, x, y) {
    const h = N.a.fbm(x / 1100, y / 1100, 6);
    const m = N.b.fbm(x / 120, y / 120, 3);
    if (h < 0.66) {
      const c = ramp(
        [
          [0.2, [8, 34, 70]],
          [0.5, [14, 60, 104]],
          [0.62, [26, 104, 140]],
          [0.66, [90, 180, 186]],
        ],
        h + (m - 0.5) * 0.04,
      );
      return [c[0], c[1], c[2], 0, 0];
    }
    let c;
    if (h < 0.685) c = [226, 210, 164];
    else c = ramp(
      [
        [0.69, [96, 146, 70]],
        [0.8, [60, 110, 50]],
        [0.9, [100, 96, 80]],
      ],
      h,
    );
    return [c[0], c[1], c[2], h, 1];
  },
  jungle(N, x, y) {
    const h = N.a.fbm(x / 700, y / 700, 6);
    const m = N.b.fbm(x / 160, y / 160, 4);
    const rv = Math.abs(N.c.fbm(x / 1400, y / 1400, 4) - 0.5);
    if (rv < 0.022) {
      const c = ramp(
        [
          [0, [56, 86, 66]],
          [0.022, [88, 110, 78]],
        ],
        rv,
      );
      return [c[0], c[1], c[2], 0, 0];
    }
    if (rv < 0.03) return [128, 112, 74, h, 1];
    const c = ramp(
      [
        [0.2, [30, 70, 30]],
        [0.45, [40, 92, 36]],
        [0.6, [58, 110, 44]],
        [0.8, [36, 80, 34]],
      ],
      h * 0.6 + m * 0.4,
    );
    return [c[0], c[1], c[2], h + m * 0.15, 1];
  },
  mountains(N, x, y) {
    const h = N.a.fbm(x / 900, y / 900, 6);
    const r = N.b.ridged(x / 700, y / 700, 5);
    const e = h * 0.45 + r * 0.55;
    if (e < 0.24) return [40, 90, 120, 0.24, 0];
    const c = ramp(
      [
        [0.24, [86, 118, 64]],
        [0.4, [70, 104, 54]],
        [0.52, [104, 100, 80]],
        [0.64, [128, 122, 112]],
        [0.72, [210, 214, 220]],
        [0.9, [248, 250, 252]],
      ],
      e,
    );
    return [c[0], c[1], c[2], e * 1.5, 1];
  },
  arctic(N, x, y) {
    const h = N.a.fbm(x / 800, y / 800, 6);
    const cr = N.b.ridged(x / 300, y / 300, 3);
    if (h < 0.38) {
      const c = ramp(
        [
          [0.2, [12, 30, 50]],
          [0.38, [30, 70, 96]],
        ],
        h,
      );
      return [c[0], c[1], c[2], 0, 0];
    }
    let c = ramp(
      [
        [0.38, [170, 205, 225]],
        [0.42, [222, 236, 245]],
        [0.6, [240, 246, 250]],
        [0.8, [208, 222, 236]],
      ],
      h,
    );
    if (cr > 0.9) c = U.mixColor(c, [110, 150, 180], (cr - 0.9) * 8);
    return [c[0], c[1], c[2], h * 0.8, 1];
  },
  city(N, x, y) {
    const m = N.a.fbm(x / 300, y / 300, 3);
    const v = 104 + (m - 0.5) * 30;
    return [v, v, v + 4, 0, 1];
  },
  citynight(N, x, y) {
    return THEME_SAMPLERS.city(N, x, y);
  },
  volcano(N, x, y) {
    const h = N.a.fbm(x / 700, y / 700, 6);
    const r = N.b.ridged(x / 520, y / 520, 4);
    if (r > 0.86) {
      const k = Math.min(1, (r - 0.86) * 9);
      const c = U.mixColor([200, 60, 10], [255, 220, 90], k);
      return [c[0], c[1], c[2], 0, 2];
    }
    const c = ramp(
      [
        [0.2, [34, 30, 30]],
        [0.45, [58, 52, 50]],
        [0.6, [80, 72, 66]],
        [0.8, [46, 40, 38]],
      ],
      h,
    );
    const glow = Math.max(0, r - 0.74) * 4;
    return [c[0] + glow * 120, c[1] + glow * 30, c[2], h + r * 0.2, 1];
  },
  base(N, x, y) {
    const m = N.a.fbm(x / 400, y / 400, 3);
    const tx = Math.floor(x / 96);
    const ty = Math.floor(y / 96);
    const t = (hash2(tx, ty, 7) % 100) / 100;
    const v = 78 + t * 14 + (m - 0.5) * 16;
    return [v, v + 2, v + 6, 0, 1];
  },
  basenight(N, x, y) {
    return THEME_SAMPLERS.base(N, x, y);
  },
};

const RELIEF = {
  desert: 9,
  canyon: 16,
  coast: 10,
  ocean: 8,
  jungle: 9,
  mountains: 20,
  arctic: 8,
  city: 0,
  citynight: 0,
  volcano: 12,
  base: 0,
  basenight: 0,
};

// --- Décor ----------------------------------------------------------------------

function drawShadowed(ctx, fn, ox = 6, oy = 6, alpha = 0.35) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.globalAlpha = alpha;
  fn(true);
  ctx.restore();
  fn(false);
}

function tree(ctx, x, y, r, col, rng) {
  drawShadowed(
    ctx,
    (sh) => {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = rng() * TAU;
        ctx.moveTo(x + Math.cos(a) * r * 0.3 + r * 0.8, y + Math.sin(a) * r * 0.3);
        ctx.arc(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, r * (0.75 + rng() * 0.25), 0, TAU);
      }
      if (sh) {
        ctx.fillStyle = '#000';
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.2);
        g.addColorStop(0, `rgb(${col[0] + 40},${col[1] + 50},${col[2] + 30})`);
        g.addColorStop(1, `rgb(${col[0] * 0.55},${col[1] * 0.6},${col[2] * 0.55})`);
        ctx.fillStyle = g;
        ctx.fill();
      }
    },
    r * 0.5,
    r * 0.5,
    0.4,
  );
}

function rock(ctx, x, y, r, col, rng) {
  const pts = [];
  const n = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.7 + rng() * 0.4);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
  }
  drawShadowed(
    ctx,
    (sh) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      if (sh) {
        ctx.fillStyle = '#000';
      } else {
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, `rgb(${col[0] + 45},${col[1] + 40},${col[2] + 35})`);
        g.addColorStop(1, `rgb(${col[0] * 0.5},${col[1] * 0.5},${col[2] * 0.5})`);
        ctx.fillStyle = g;
      }
      ctx.fill();
    },
    r * 0.4,
    r * 0.4,
    0.4,
  );
}

function building(ctx, x, y, w, h, roof, rng, night) {
  const height = 6 + rng() * 22;
  // ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + height, y + height);
  ctx.lineTo(x + w + height, y + h + height);
  ctx.lineTo(x + height, y + h + height);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, `rgb(${roof[0] + 30},${roof[1] + 30},${roof[2] + 30})`);
  g.addColorStop(1, `rgb(${roof[0] - 20},${roof[1] - 20},${roof[2] - 20})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  // équipements de toit
  const n = Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const bw = 6 + rng() * 10;
    const bh = 6 + rng() * 10;
    const bx = x + 5 + rng() * Math.max(1, w - bw - 10);
    const by = y + 5 + rng() * Math.max(1, h - bh - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(bx + 2, by + 2, bw, bh);
    ctx.fillStyle = `rgb(${roof[0] + 50},${roof[1] + 50},${roof[2] + 50})`;
    ctx.fillRect(bx, by, bw, bh);
  }
  if (night && rng() < 0.7) {
    // fenêtres éclairées sur les toits vitrés / balises
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,210,120,0.9)' : 'rgba(170,220,255,0.85)';
    const rows = Math.floor(h / 10);
    const cols = Math.floor(w / 10);
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) if (rng() < 0.3) ctx.fillRect(x + 4 + j * 10, y + 4 + i * 10, 4, 4);
  }
}

const THEME_DECOR = {
  desert(ctx, rng, cx, cy, T) {
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (rng() < 0.55) rock(ctx, x, y, 3 + rng() * 9, [120, 92, 62], rng);
      else {
        // buisson sec
        ctx.fillStyle = 'rgba(92,86,48,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, 2 + rng() * 4, 0, TAU);
        ctx.fill();
      }
    }
    if (rng() < 0.04) {
      // palmiers d'oasis
      for (let i = 0; i < 4; i++) tree(ctx, cx + rng() * CELL, cy + rng() * CELL, 7 + rng() * 4, [70, 110, 40], rng);
    }
  },
  canyon(ctx, rng, cx, cy, T) {
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 0) continue;
      rock(ctx, x, y, 3 + rng() * 10, [140, 80, 50], rng);
    }
  },
  coast(ctx, rng, cx, cy, T) {
    const n = 2 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 0) {
        if (rng() < 0.4) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 6, y - 2, x + 12, y);
          ctx.stroke();
        }
      } else tree(ctx, x, y, 6 + rng() * 6, [50, 96, 40], rng);
    }
  },
  ocean(ctx, rng, cx, cy, T) {
    const n = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + rng() * 0.2})`;
        ctx.lineWidth = 1 + rng();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 7, y - 2.5, x + 14 + rng() * 8, y);
        ctx.stroke();
      } else if (rng() < 0.8) tree(ctx, x, y, 6 + rng() * 5, [60, 110, 46], rng);
    }
  },
  jungle(ctx, rng, cx, cy, T) {
    const n = 10 + Math.floor(rng() * 10);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 0) continue;
      const g = 0.7 + rng() * 0.6;
      tree(ctx, x, y, 7 + rng() * 9, [34 * g, 84 * g, 30 * g], rng);
    }
  },
  mountains(ctx, rng, cx, cy, T) {
    const n = 4 + Math.floor(rng() * 8);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      const s = T.sample(x, y);
      if (s[4] === 0) continue;
      if (s[3] < 0.85) tree(ctx, x, y, 4 + rng() * 4, [30, 66, 36], rng);
      else if (s[3] < 1.05 && rng() < 0.4) rock(ctx, x, y, 3 + rng() * 6, [110, 104, 96], rng);
    }
  },
  arctic(ctx, rng, cx, cy, T) {
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 0) {
        // petits blocs de glace
        ctx.fillStyle = 'rgba(220,236,246,0.9)';
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + rng() * 6, 2 + rng() * 4, rng() * 3, 0, TAU);
        ctx.fill();
      } else if (rng() < 0.5) tree(ctx, x, y, 3 + rng() * 3, [40, 70, 56], rng);
      else rock(ctx, x, y, 2 + rng() * 5, [120, 130, 140], rng);
    }
  },
  city(ctx, rng, cx, cy, T, night) {
    // une cellule = un pâté de maisons entouré de rues
    const road = 26;
    ctx.fillStyle = night ? '#1d1f24' : '#3b3d42';
    ctx.fillRect(cx, cy, CELL, road);
    ctx.fillRect(cx, cy, road, CELL);
    ctx.strokeStyle = night ? 'rgba(220,200,120,0.35)' : 'rgba(240,230,200,0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cx + road, cy + road / 2);
    ctx.lineTo(cx + CELL, cy + road / 2);
    ctx.moveTo(cx + road / 2, cy + road);
    ctx.lineTo(cx + road / 2, cy + CELL);
    ctx.stroke();
    ctx.setLineDash([]);
    // trottoirs
    ctx.fillStyle = night ? '#3a3b3f' : '#8d8e90';
    ctx.fillRect(cx + road, cy + road, CELL - road, 4);
    ctx.fillRect(cx + road, cy + road, 4, CELL - road);
    // voitures
    const cars = Math.floor(rng() * 3);
    for (let i = 0; i < cars; i++) {
      const horiz = rng() < 0.5;
      const p = road + rng() * (CELL - road - 14);
      ctx.fillStyle = U.pick(['#b22', '#eee', '#234', '#cc3', '#555', '#2a6']);
      if (horiz) ctx.fillRect(cx + p, cy + (rng() < 0.5 ? 4 : 15), 12, 7);
      else ctx.fillRect(cx + (rng() < 0.5 ? 4 : 15), cy + p, 7, 12);
    }
    const bx = cx + road + 6;
    const by = cy + road + 6;
    const bs = CELL - road - 10;
    if (rng() < 0.14) {
      // parc
      ctx.fillStyle = night ? '#1f3320' : '#4f7a3a';
      ctx.fillRect(bx, by, bs, bs);
      for (let i = 0; i < 6; i++) tree(ctx, bx + 10 + rng() * (bs - 20), by + 10 + rng() * (bs - 20), 6 + rng() * 6, [40, 90, 40], rng);
      return;
    }
    const roofs = [
      [120, 120, 125],
      [150, 140, 130],
      [96, 104, 112],
      [170, 160, 150],
      [130, 90, 80],
    ];
    const split = rng();
    if (split < 0.35) {
      building(ctx, bx, by, bs, bs, U.pick(roofs), rng, night);
    } else if (split < 0.7) {
      const w1 = bs * (0.4 + rng() * 0.2);
      building(ctx, bx, by, w1 - 4, bs, U.pick(roofs), rng, night);
      building(ctx, bx + w1 + 4, by, bs - w1 - 4, bs * 0.5 - 4, U.pick(roofs), rng, night);
      building(ctx, bx + w1 + 4, by + bs * 0.5 + 4, bs - w1 - 4, bs * 0.5 - 4, U.pick(roofs), rng, night);
    } else {
      const h = bs / 2 - 4;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) building(ctx, bx + i * (h + 8), by + j * (h + 8), h, h, U.pick(roofs), rng, night);
    }
    if (night) {
      // lampadaires
      for (let i = 0; i < 3; i++) {
        const lx = cx + road + rng() * (CELL - road);
        const g = ctx.createRadialGradient(lx, cy + road / 2, 0, lx, cy + road / 2, 22);
        g.addColorStop(0, 'rgba(255,200,110,0.55)');
        g.addColorStop(1, 'rgba(255,200,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx - 22, cy + road / 2 - 22, 44, 44);
      }
    }
  },
  citynight(ctx, rng, cx, cy, T) {
    THEME_DECOR.city(ctx, rng, cx, cy, T, true);
  },
  volcano(ctx, rng, cx, cy, T) {
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + rng() * CELL;
      const y = cy + rng() * CELL;
      if (T.cls(x, y) === 2) continue;
      rock(ctx, x, y, 3 + rng() * 9, [50, 44, 42], rng);
    }
    if (rng() < 0.06) {
      // cratère fumant
      const x = cx + CELL / 2;
      const y = cy + CELL / 2;
      const r = 20 + rng() * 25;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(255,120,20,0.9)');
      g.addColorStop(0.35, 'rgba(90,30,10,0.9)');
      g.addColorStop(0.7, 'rgba(30,24,22,0.9)');
      g.addColorStop(1, 'rgba(30,24,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  },
  base(ctx, rng, cx, cy, T, night) {
    // joints de dalles
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, CELL, CELL);
    const r = rng();
    const mx = cx + CELL / 2;
    const my = cy + CELL / 2;
    if (r < 0.12) {
      // hélipad
      ctx.fillStyle = '#3e4248';
      ctx.beginPath();
      ctx.arc(mx, my, 54, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#e8c21a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, 46, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#eee';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', mx, my + 2);
    } else if (r < 0.3) {
      // hangar
      const w = 110;
      const h = 70;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(mx - w / 2 + 12, my - h / 2 + 12, w, h);
      const g = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2, 0);
      g.addColorStop(0, '#5a6068');
      g.addColorStop(0.35, '#b8bfc6');
      g.addColorStop(1, '#3e434a');
      ctx.fillStyle = g;
      ctx.fillRect(mx - w / 2, my - h / 2, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let i = -w / 2; i < w / 2; i += 8) {
        ctx.beginPath();
        ctx.moveTo(mx + i, my - h / 2);
        ctx.lineTo(mx + i, my + h / 2);
        ctx.stroke();
      }
    } else if (r < 0.45) {
      // réservoirs
      for (let i = 0; i < 3; i++) {
        const x = cx + 30 + i * 46;
        const y = my;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, 19, 0, TAU);
        ctx.fill();
        const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 20);
        g.addColorStop(0, '#f0f0ea');
        g.addColorStop(1, '#80807a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 19, 0, TAU);
        ctx.fill();
      }
    } else if (r < 0.62) {
      // conteneurs
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = U.pick(['#8a3a2a', '#2a5a8a', '#6a7a2a', '#aa7a2a', '#555']);
        const x = cx + 20 + (i % 3) * 42;
        const y = cy + 40 + Math.floor(i / 3) * 24;
        ctx.fillRect(x, y, 36, 16);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeRect(x, y, 36, 16);
      }
    } else if (r < 0.7) {
      // marquages de piste
      ctx.fillStyle = '#2f3237';
      ctx.fillRect(cx, cy + 40, CELL, 80);
      ctx.fillStyle = '#ddd';
      for (let i = 0; i < CELL; i += 40) ctx.fillRect(cx + i + 5, cy + 78, 22, 4);
    }
    if (night || rng() < 0.3) {
      const lx = cx + 6;
      const ly = cy + 6;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 18);
      g.addColorStop(0, night ? 'rgba(255,60,60,0.9)' : 'rgba(255,60,60,0.5)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 18, ly - 18, 36, 36);
    }
  },
  basenight(ctx, rng, cx, cy, T) {
    THEME_DECOR.base(ctx, rng, cx, cy, T, true);
  },
};

// Texture de grain (rend le terrain moins "lisse")
let GRAIN = null;
function grainPattern(ctx) {
  if (!GRAIN) {
    const c = U.makeCanvas(256, 256);
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    GRAIN = c;
  }
  return ctx.createPattern(GRAIN, 'repeat');
}

class Terrain {
  constructor(themeId, seed) {
    this.theme = themeId;
    this.seed = seed;
    this.night = THEMES[themeId].night;
    this.N = { a: new Noise2D(seed), b: new Noise2D(seed + 101), c: new Noise2D(seed + 202) };
    this.sampler = THEME_SAMPLERS[themeId];
    this.decor = THEME_DECOR[themeId];
    this.relief = RELIEF[themeId];
    this.chunks = new Map();
    this.D = 0;
    // génère tout de suite les premiers morceaux
    for (let k = 0; k < 2; k++) {
      const ch = this.createChunk(k);
      while (!ch.ready) this.work(ch, 1e9);
    }
  }

  sample(x, gy) {
    return this.sampler(this.N, x, gy);
  }
  cls(x, gy) {
    return this.sampler(this.N, x, gy)[4];
  }
  // classe du terrain à une position écran
  clsAtScreen(x, sy) {
    return this.cls(x, sy - this.D);
  }

  createChunk(k) {
    const ch = {
      k,
      row: -1,
      ready: false,
      low: U.makeCanvas(T_LW, T_LH + 2),
      canvas: null,
      prevRow: null,
    };
    ch.lctx = ch.low.getContext('2d');
    ch.img = ch.lctx.createImageData(T_LW, T_LH + 2);
    this.chunks.set(k, ch);
    return ch;
  }

  // travail incrémental sur un chunk, limité par un budget en ms
  work(ch, budgetMs) {
    const t0 = performance.now();
    const gy0 = -ch.k * VH;
    const data = ch.img.data;
    const relief = this.relief;
    while (ch.row <= T_LH) {
      const j = ch.row;
      const gy = gy0 + j * T_RES;
      const rowH = new Float32Array(T_LW);
      let prevH = null;
      for (let i = 0; i < T_LW; i++) {
        const s = this.sampler(this.N, i * T_RES, gy);
        rowH[i] = s[3];
        let lum = 1;
        if (relief && s[4] !== 0) {
          const hl = i > 0 ? prevH : s[3];
          const hu = ch.prevRow ? ch.prevRow[i] : s[3];
          lum = U.clamp(1 + (2 * s[3] - hl - hu) * relief * 6, 0.55, 1.45);
        }
        prevH = s[3];
        const o = ((j + 1) * T_LW + i) * 4;
        data[o] = s[0] * lum;
        data[o + 1] = s[1] * lum;
        data[o + 2] = s[2] * lum;
        data[o + 3] = 255;
      }
      ch.prevRow = rowH;
      ch.row++;
      if (performance.now() - t0 > budgetMs) return;
    }
    this.finishChunk(ch);
  }

  finishChunk(ch) {
    ch.lctx.putImageData(ch.img, 0, 0);
    const c = U.makeCanvas(VW, VH);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ch.low, 0, 1, T_LW, T_LH, 0, 0, VW, VH);
    // grain
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
    // décor sur grille monde (avec marge pour les objets à cheval)
    const gy0 = -ch.k * VH;
    ctx.save();
    ctx.translate(0, -gy0);
    const cy0 = Math.floor((gy0 - CELL) / CELL);
    const cy1 = Math.floor((gy0 + VH + CELL) / CELL);
    const self = this;
    const T = {
      cls: (x, y) => self.cls(x, y),
      sample: (x, y) => self.sample(x, y),
    };
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = -1; cx <= Math.ceil(VW / CELL); cx++) {
        const rng = makeRng(hash2(cx, cy, this.seed));
        this.decor(ctx, rng, cx * CELL, cy * CELL, T);
      }
    }
    ctx.restore();
    if (this.night) {
      // calque de lumières (ajouté en mode additif après l'assombrissement)
      const lc = U.makeCanvas(VW, VH);
      const lx = lc.getContext('2d');
      lx.translate(0, -gy0);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = -1; cx <= Math.ceil(VW / CELL); cx++) {
          const rng = makeRng(hash2(cx, cy, this.seed + 999));
          for (let i = 0; i < 3; i++) {
            if (rng() < 0.45) continue;
            const x = cx * CELL + rng() * CELL;
            const y = cy * CELL + rng() * CELL;
            const r = 5 + rng() * 16;
            const g = lx.createRadialGradient(x, y, 0, x, y, r);
            const warm = rng() < 0.7;
            g.addColorStop(0, warm ? 'rgba(255,190,100,0.85)' : 'rgba(140,200,255,0.8)');
            g.addColorStop(0.3, warm ? 'rgba(255,150,60,0.35)' : 'rgba(100,170,255,0.3)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            lx.fillStyle = g;
            lx.fillRect(x - r, y - r, r * 2, r * 2);
          }
        }
      }
      ch.lights = lc;
    }
    ch.canvas = c;
    ch.ready = true;
    ch.img = null;
    ch.low = null;
    ch.lctx = null;
    ch.prevRow = null;
  }

  update(D) {
    this.D = D;
    const k0 = Math.floor(D / VH);
    // morceaux nécessaires : visibles + 2 d'avance
    for (let k = k0; k <= k0 + 2; k++) if (!this.chunks.has(k)) this.createChunk(k);
    // travail incrémental (le plus proche d'abord)
    for (let k = k0; k <= k0 + 2; k++) {
      const ch = this.chunks.get(k);
      if (!ch.ready) {
        // un chunk visible non prêt doit être terminé immédiatement
        const visible = k <= k0 + 1;
        this.work(ch, visible ? 1e9 : 4);
        break;
      }
    }
    for (const k of this.chunks.keys()) if (k < k0 - 1) this.chunks.delete(k);
  }

  draw(ctx) {
    const D = this.D;
    const k0 = Math.floor(D / VH);
    for (let k = k0; k <= k0 + 1; k++) {
      const ch = this.chunks.get(k);
      if (!ch || !ch.ready) continue;
      const top = -k * VH + D;
      ctx.drawImage(ch.canvas, 0, Math.floor(top), VW, VH + 1);
    }
  }

  drawLights(ctx) {
    const D = this.D;
    const k0 = Math.floor(D / VH);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = k0; k <= k0 + 1; k++) {
      const ch = this.chunks.get(k);
      if (!ch || !ch.ready || !ch.lights) continue;
      ctx.drawImage(ch.lights, 0, Math.floor(-k * VH + D), VW, VH + 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// --- Nuages -------------------------------------------------------------------

const CloudSprites = {
  list: [],
  init() {
    for (let s = 0; s < 6; s++) {
      const w = 420;
      const h = 280;
      const c = U.makeCanvas(w, h);
      const x = c.getContext('2d');
      const rng = makeRng(1234 + s * 77);
      const puffs = 26 + Math.floor(rng() * 14);
      // dessous gris
      for (let pass = 0; pass < 2; pass++) {
        const r2 = makeRng(999 + s * 31);
        for (let i = 0; i < puffs; i++) {
          const a = r2() * TAU;
          const d = Math.pow(r2(), 0.7);
          const px = w / 2 + Math.cos(a) * d * w * 0.32;
          const py = h / 2 + Math.sin(a) * d * h * 0.28;
          const r = 30 + r2() * 46 * (1 - d * 0.5);
          const off = pass === 0 ? 8 : 0;
          const g = x.createRadialGradient(px - (pass ? 8 : 0), py - (pass ? 10 : 0), r * 0.1, px, py + off, r);
          if (pass === 0) {
            g.addColorStop(0, 'rgba(150,160,175,0.6)');
            g.addColorStop(1, 'rgba(150,160,175,0)');
          } else {
            g.addColorStop(0, 'rgba(255,255,255,0.95)');
            g.addColorStop(0.5, 'rgba(240,244,250,0.6)');
            g.addColorStop(1, 'rgba(230,236,245,0)');
          }
          x.fillStyle = g;
          x.beginPath();
          x.arc(px, py + off, r, 0, TAU);
          x.fill();
        }
      }
      this.list.push({ c, w, h, shadow: Sprites.silhouette(c, 'rgba(0,0,0,1)') });
    }
  },
};

class Clouds {
  constructor(density, night) {
    this.density = density;
    this.night = night;
    this.items = [];
    this.timer = 0;
    for (let i = 0; i < 6 * density; i++) this.spawn(U.rand(-300, VH));
  }
  spawn(y) {
    const spr = U.pick(CloudSprites.list);
    const high = Math.random() < 0.5;
    this.items.push({
      spr,
      x: U.rand(-200, VW + 200),
      y: y === undefined ? -spr.h * 1.6 : y,
      s: high ? U.rand(1.1, 1.8) : U.rand(0.7, 1.2),
      speed: high ? 1.9 : 1.45,
      alpha: high ? U.rand(0.55, 0.8) : U.rand(0.35, 0.6),
      drift: U.rand(-8, 8),
    });
  }
  update(dt, scroll) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = U.rand(2, 5) / Math.max(0.15, this.density);
      if (Math.random() < this.density + 0.1) this.spawn();
    }
    for (const c of this.items) {
      c.y += scroll * c.speed * dt;
      c.x += c.drift * dt;
    }
    this.items = this.items.filter((c) => c.y < VH + c.spr.h * c.s);
  }
  drawShadows(ctx) {
    for (const c of this.items) {
      const w = c.spr.w * c.s;
      const h = c.spr.h * c.s;
      ctx.globalAlpha = (this.night ? 0.08 : 0.16) * c.alpha;
      ctx.drawImage(c.spr.shadow, c.x - w / 2 + 140, c.y - h / 2 + 110, w, h);
    }
    ctx.globalAlpha = 1;
  }
  draw(ctx) {
    for (const c of this.items) {
      const w = c.spr.w * c.s;
      const h = c.spr.h * c.s;
      ctx.globalAlpha = c.alpha * (this.night ? 0.35 : 1);
      ctx.drawImage(c.spr.c, c.x - w / 2, c.y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }
}
