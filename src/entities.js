'use strict';
// ---------------------------------------------------------------------------
// Ennemis : unités aériennes et terrestres, missiles, projectiles.
// Tous les objets vivent dans G (l'état de la partie, voir game.js).
// ---------------------------------------------------------------------------

const ENEMY_BULLET = {
  bullet: { r: 4, color: '255,210,120', len: 14 },
  shell: { r: 5, color: '255,150,80', len: 10 },
  flak: { r: 5, color: '255,240,200', len: 6 },
  shrapnel: { r: 3, color: '255,190,120', len: 8 },
  orb: { r: 8, color: '255,60,110', len: 0 },
};

function fireBullet(x, y, ang, speed, dmg, kind = 'bullet', extra = {}) {
  const d = ENEMY_BULLET[kind];
  G.eBullets.push({
    x,
    y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r: d.r,
    dmg: dmg * G.lp.dmgMul,
    kind,
    life: extra.life ?? 6,
    tx: extra.tx,
    ty: extra.ty,
    ground: !!extra.ground,
  });
}

function aimAt(x, y, lead = 0) {
  const p = G.player;
  return U.angleTo(x, y, p.x + p.vx * lead, p.y + p.vy * lead);
}

// --- Missiles ennemis --------------------------------------------------------

function spawnMissile(kind, x, y, ang, opts = {}) {
  const d = MISSILES[kind];
  const m = {
    cat: 'missile',
    kind,
    x,
    y,
    ang,
    speed: kind === 'hyper' ? d.speed : d.speed * 0.45,
    hp: d.hp * (opts.hpMul ?? 1) * (1 + (G.lp.n - 1) * 0.05),
    maxHp: d.hp,
    r: d.r,
    t: 0,
    life: d.life,
    air: true,
    warn: d.warn ? d.warn : 0,
    flash: 0,
    lock: true,
    def: d,
  };
  m.maxHp = m.hp;
  G.enemies.push(m);
  if (kind !== 'hyper') SFX.play('enemyMissile', x);
  return m;
}

function missileTrail(m) {
  const k = {
    rocket: 'dark',
    homing: 'hot',
    cluster: 'dark',
    hyper: 'hyper',
    fire: 'fire',
    emp: 'emp',
    swarm: 'hot',
    heavy: 'dark',
  }[m.kind];
  const sc = m.kind === 'heavy' ? 2 : m.kind === 'swarm' ? 0.6 : 1;
  G.fx.trail(m.x, m.y, m.ang, k, sc);
}

function updateMissile(m, dt) {
  const p = G.player;
  const d = m.def;
  m.t += dt;
  if (m.warn > 0) {
    // missile hypersonique : phase d'alerte (ligne rouge), pas encore lancé
    m.warn -= dt;
    if (m.warn <= 0) SFX.play('missile', m.x);
    else {
      SFX.play('warning');
      return;
    }
  }
  // accélération
  if (m.speed < d.speed) m.speed = Math.min(d.speed, m.speed + d.speed * 1.4 * dt);
  // guidage
  let turn = d.turn * (G.radarBoost ? 1.3 : 1);
  if (m.stun > 0) {
    m.stun -= dt;
    turn = 0;
  }
  if (turn > 0 && m.lock && p.alive) {
    if (m.t > m.life) m.lock = false;
    const want = U.angleTo(m.x, m.y, p.x, p.y);
    const diff = U.angDiff(m.ang, want);
    m.ang += U.clamp(diff, -turn * dt, turn * dt);
    if (m.kind === 'homing' || m.kind === 'emp' || m.kind === 'fire') {
      if (U.dist2(m.x, m.y, p.x, p.y) < 520 * 520) G.lockWarning = true;
    }
  }
  m.x += Math.cos(m.ang) * m.speed * dt;
  m.y += Math.sin(m.ang) * m.speed * dt;
  if (Math.random() < (m.kind === 'swarm' ? 0.5 : 0.9)) missileTrail(m);
  // missile à fragmentation : se divise à l'approche
  if (m.kind === 'cluster' && (m.t > 2.2 || (m.t > 0.6 && U.dist2(m.x, m.y, p.x, p.y) < 300 * 300))) {
    m.dead = true;
    G.fx.explode(m.x, m.y, 28, 'small');
    SFX.play('explosionSmall', m.x);
    const base = aimAt(m.x, m.y);
    for (let i = 0; i < 6; i++) {
      const r = spawnMissile('rocket', m.x, m.y, base + (i - 2.5) * 0.16, { hpMul: 0.6 });
      r.speed = MISSILES.rocket.speed;
    }
    return;
  }
  // hors écran
  if (m.x < -200 || m.x > VW + 200 || m.y < -260 || m.y > VH + 200) m.dead = true;
}

// Impact d'un missile ennemi : effet selon le type
function missileImpact(m, hitPlayer) {
  const p = G.player;
  const d = m.def;
  const dmg = d.dmg * G.lp.dmgMul;
  switch (d.impact) {
    case 'emp':
      G.fx.explode(m.x, m.y, 50, 'emp');
      SFX.play('emp', m.x);
      if (hitPlayer) {
        p.damage(dmg, 'emp');
        p.empT = 2.6;
        p.shield = 0;
      }
      break;
    case 'fire':
      G.fx.explode(m.x, m.y, 40, 'fire');
      SFX.play('napalm', m.x);
      if (hitPlayer) {
        p.damage(dmg, 'fire');
        p.burnT = 4.5;
      }
      break;
    case 'huge': {
      G.fx.explode(m.x, m.y, 70, 'huge');
      G.fx.addShake(14);
      SFX.play('explosionBig', m.x);
      // dégâts de zone : même abattue près du joueur, la Titan blesse
      const dd = U.dist(m.x, m.y, p.x, p.y);
      if (hitPlayer) p.damage(dmg, 'blast');
      else if (dd < 150) p.damage(dmg * 0.5 * (1 - dd / 150), 'blast');
      break;
    }
    case 'big':
      G.fx.explode(m.x, m.y, 50, 'big');
      SFX.play('explosion', m.x);
      if (hitPlayer) p.damage(dmg, 'blast');
      break;
    case 'cluster':
      G.fx.explode(m.x, m.y, 36, 'cluster');
      SFX.play('explosion', m.x, 0.7);
      if (hitPlayer) p.damage(dmg, 'blast');
      break;
    case 'tiny':
      G.fx.explode(m.x, m.y, 18, 'tiny');
      SFX.play('explosionSmall', m.x, 0.5);
      if (hitPlayer) p.damage(dmg, 'blast');
      break;
    default:
      G.fx.explode(m.x, m.y, d.impact === 'small' ? 26 : 36, d.impact === 'small' ? 'small' : 'medium');
      SFX.play('explosionSmall', m.x);
      if (hitPlayer) p.damage(dmg, 'blast');
  }
}

function drawMissile(ctx, m) {
  const spr = Sprites.list['m_' + m.kind];
  if (m.warn > 0) {
    // ligne d'alerte
    const a = 0.35 + 0.35 * Math.sin(G.time * 30);
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,40,${a})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + Math.cos(m.ang) * 2200, m.y + Math.sin(m.ang) * 2200);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // ombre
  Sprites.drawShadow(ctx, spr, m.x + 26, m.y + 36, m.ang + Math.PI / 2, 0.85, 0.22);
  // flamme du moteur
  const bx = m.x - Math.cos(m.ang) * spr.h * 0.5;
  const by = m.y - Math.sin(m.ang) * spr.h * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  const fl = (m.kind === 'heavy' ? 26 : m.kind === 'swarm' ? 9 : 16) * (0.8 + Math.random() * 0.4);
  const col = m.kind === 'emp' ? [90, 200, 255] : m.kind === 'fire' ? [255, 120, 30] : [255, 190, 90];
  ctx.drawImage(Glow.get(col[0], col[1], col[2]), bx - fl, by - fl, fl * 2, fl * 2);
  ctx.globalCompositeOperation = 'source-over';
  Sprites.draw(ctx, spr, m.x, m.y, m.ang + Math.PI / 2);
  if (m.flash > 0) drawHitFlash(ctx, m);
  // gyrophare des missiles guidés (aide à la lecture)
  if ((m.kind === 'homing' || m.kind === 'emp' || m.kind === 'fire' || m.kind === 'heavy') && Math.sin(G.time * 20) > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const c = m.kind === 'emp' ? [80, 220, 255] : [255, 40, 40];
    ctx.drawImage(Glow.get(c[0], c[1], c[2]), m.x - 10, m.y - 10, 20, 20);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// --- Unités -----------------------------------------------------------------

function spawnUnit(kind, x, y, opts = {}) {
  const d = UNITS[kind];
  const u = {
    cat: 'unit',
    kind,
    x,
    y,
    vx: opts.vx ?? 0,
    vy: opts.vy ?? 0,
    ang: opts.ang ?? Math.PI / 2,
    hp: d.hp * G.lp.hpMul,
    r: d.r,
    t: 0,
    air: d.air,
    def: d,
    fireT: U.rand(0.8, 2.2),
    fire2T: U.rand(2, 4),
    flash: 0,
    stun: 0,
    phase: Math.random() * TAU,
    turret: Math.PI / 2,
    ...opts,
  };
  u.maxHp = u.hp;
  G.enemies.push(u);
  return u;
}

function onScreen(e, m = 0) {
  return e.x > -m && e.x < VW + m && e.y > -m && e.y < VH + m;
}

function pickMissileKind(exclude = []) {
  const W = { rocket: 5, homing: 4.5, cluster: 2, hyper: 1.6, fire: 2.2, emp: 1.8, swarm: 2, heavy: 0.9 };
  const table = G.lp.missiles.filter((k) => !exclude.includes(k)).map((k) => [k, W[k]]);
  if (!table.length) return 'rocket';
  return U.weighted(table);
}

// Lancement d'un missile par une unité, gère les cas spéciaux (essaim, hyper)
function launchFrom(x, y, kind) {
  if (kind === 'swarm') {
    for (let i = 0; i < 5; i++) spawnMissile('swarm', x + U.rand(-10, 10), y, aimAt(x, y) + U.rand(-0.9, 0.9));
  } else if (kind === 'hyper') {
    const p = G.player;
    const sx = U.clamp(p.x + U.rand(-200, 200), 40, VW - 40);
    spawnMissile('hyper', sx, -60, U.angleTo(sx, -60, p.x, p.y));
  } else {
    spawnMissile(kind, x, y, aimAt(x, y) + U.rand(-0.25, 0.25));
  }
}

function rate() {
  return Math.sqrt(G.lp.rate);
}

const UNIT_AI = {
  fighter(u, dt) {
    u.t += dt;
    u.vx = Math.sin(u.t * 1.4 + u.phase) * 140;
    u.vy = u.speed ?? 250;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    u.ang = Math.atan2(u.vy, u.vx);
    if (u.y > 40 && u.y < VH * 0.7 && (u.fireT -= dt * rate()) <= 0 && !u.stun) {
      u.fireT = U.rand(1.4, 2.4);
      u.burst = 3;
    }
    if (u.burst > 0 && (u.burstT = (u.burstT ?? 0) - dt) <= 0) {
      u.burst--;
      u.burstT = 0.09;
      const a = aimAt(u.x, u.y, 0.3);
      fireBullet(u.x - 6, u.y + 30, a, 520, 7);
      fireBullet(u.x + 6, u.y + 30, a, 520, 7);
      SFX.play('enemyGun', u.x);
    }
    if (u.y > VH + 100) u.gone = true;
  },
  ace(u, dt) {
    u.t += dt;
    const p = G.player;
    const leave = u.t > 14;
    const ty = leave ? VH + 300 : 170 + Math.sin(u.t * 0.9 + u.phase) * 90;
    const tx = leave ? u.x : U.clamp(p.x + Math.sin(u.t * 1.7 + u.phase) * 260, 80, VW - 80);
    u.vx += U.clamp((tx - u.x) * 3 - u.vx, -900, 900) * dt * 2;
    u.vy += U.clamp((ty - u.y) * 3 - u.vy, -900, 900) * dt * 2;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    u.ang = Math.PI / 2 + U.clamp(u.vx / 900, -0.5, 0.5) * -1;
    u.bank = U.clamp(u.vx / 500, -1, 1);
    if (!u.stun && u.y > 30) {
      if ((u.fireT -= dt * rate()) <= 0) {
        u.fireT = U.rand(0.9, 1.6);
        u.burst = 5;
      }
      if ((u.fire2T -= dt * rate()) <= 0) {
        u.fire2T = U.rand(3.5, 5);
        spawnMissile(G.lp.missiles.includes('fire') ? 'fire' : 'homing', u.x - 20, u.y + 10, Math.PI / 2 + 0.3);
        spawnMissile('homing', u.x + 20, u.y + 10, Math.PI / 2 - 0.3);
      }
    }
    if (u.burst > 0 && (u.burstT = (u.burstT ?? 0) - dt) <= 0) {
      u.burst--;
      u.burstT = 0.07;
      const a = aimAt(u.x, u.y, 0.25);
      fireBullet(u.x, u.y + 34, a, 600, 8);
      SFX.play('enemyGun', u.x);
    }
    if (u.y > VH + 200) u.gone = true;
  },
  interceptor(u, dt) {
    u.t += dt;
    // trajectoire courbe depuis un côté
    const turn = u.side * 0.55;
    u.ang += turn * dt;
    u.x += Math.cos(u.ang) * 520 * dt;
    u.y += Math.sin(u.ang) * 520 * dt;
    if (!u.fired && u.t > 0.8 && onScreen(u, -40) && !u.stun) {
      u.fired = true;
      const k = G.lp.missiles.includes('emp') && Math.random() < 0.4 ? 'emp' : 'homing';
      spawnMissile(k, u.x, u.y, aimAt(u.x, u.y) - 0.2);
      spawnMissile(k, u.x, u.y, aimAt(u.x, u.y) + 0.2);
    }
    if (u.t > 2 && !onScreen(u, 200)) u.gone = true;
  },
  drone(u, dt) {
    u.t += dt;
    const p = G.player;
    if (!u.stun) {
      const want = U.angleTo(u.x, u.y, p.x, p.y);
      u.ang += U.clamp(U.angDiff(u.ang, want), -2.4 * dt, 2.4 * dt);
    }
    const sp = 300 + Math.min(1, u.t / 2) * 80;
    u.x += Math.cos(u.ang) * sp * dt;
    u.y += Math.sin(u.ang) * sp * dt;
    if (Math.random() < 0.5) G.fx.trail(u.x, u.y, u.ang, 'player', 0.5);
    if (u.t > 9 && !onScreen(u, 100)) u.gone = true;
  },
  heli(u, dt) {
    u.t += dt;
    u.rotor = (u.rotor ?? 0) + dt * 30;
    const p = G.player;
    const leaving = u.t > (u.stay ?? 9);
    const ty = leaving ? -300 : u.hoverY;
    const tx = leaving ? u.x : U.clamp(u.hoverX + Math.sin(u.t * 0.8 + u.phase) * 160, 60, VW - 60);
    u.vx = U.lerp(u.vx, (tx - u.x) * 1.5, dt * 2);
    u.vy = U.lerp(u.vy, (ty - u.y) * 1.5, dt * 2);
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    const want = U.angleTo(u.x, u.y, p.x, p.y);
    u.ang += U.clamp(U.angDiff(u.ang, want), -1.5 * dt, 1.5 * dt);
    if (!u.stun && u.y > 20 && !leaving) {
      if ((u.fireT -= dt * rate()) <= 0) {
        u.fireT = U.rand(1.0, 1.7);
        u.burst = 4;
      }
      if ((u.fire2T -= dt * rate()) <= 0) {
        u.fire2T = U.rand(2.5, 3.6);
        for (let i = -1; i <= 1; i++) spawnMissile('rocket', u.x + i * 18, u.y, u.ang + i * 0.12);
      }
    }
    if (u.burst > 0 && (u.burstT = (u.burstT ?? 0) - dt) <= 0) {
      u.burst--;
      u.burstT = 0.1;
      fireBullet(u.x + Math.cos(u.ang) * 40, u.y + Math.sin(u.ang) * 40, u.ang + U.rand(-0.05, 0.05), 480, 6);
      SFX.play('enemyGun', u.x);
    }
    if (leaving && u.y < -200) u.gone = true;
  },
  bomber(u, dt) {
    u.t += dt;
    u.y += 62 * dt;
    u.x += Math.sin(u.t * 0.4 + u.phase) * 30 * dt;
    u.ang = Math.PI / 2;
    if (!u.stun && u.y > 0 && u.y < VH * 0.75 && (u.fireT -= dt * rate()) <= 0) {
      u.fireT = U.rand(2.4, 3.4);
      const opts = ['homing'];
      if (G.lp.missiles.includes('cluster')) opts.push('cluster');
      if (G.lp.missiles.includes('heavy')) opts.push('heavy');
      const k = U.pick(opts);
      spawnMissile(k, u.x - 60, u.y + 20, Math.PI / 2);
      spawnMissile(k, u.x + 60, u.y + 20, Math.PI / 2);
    }
    // mitrailleur de queue
    if (!u.stun && u.y > 0 && (u.fire2T -= dt * rate()) <= 0) {
      u.fire2T = 0.18;
      if (Math.random() < 0.35) fireBullet(u.x, u.y + 80, aimAt(u.x, u.y + 80) + U.rand(-0.1, 0.1), 420, 6);
    }
    if (u.y > VH + 200) u.gone = true;
  },
  // ---- sol ----
  tank(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    if (!u.stun) {
      u.x += Math.cos(u.ang) * 28 * dt;
      u.y += Math.sin(u.ang) * 28 * dt;
      const want = aimAt(u.x, u.y);
      u.turret += U.clamp(U.angDiff(u.turret, want), -1.6 * dt, 1.6 * dt);
      if (u.y > 0 && u.y < VH - 40 && (u.fireT -= dt * rate()) <= 0) {
        u.fireT = U.rand(2.2, 3.4);
        fireBullet(u.x + Math.cos(u.turret) * 36, u.y + Math.sin(u.turret) * 36, u.turret, 360, 11, 'shell');
        G.fx.glow(u.x + Math.cos(u.turret) * 38, u.y + Math.sin(u.turret) * 38, 0, 0, 0.12, 12, 20, 255, 200, 120, { layer: 0, scroll: 1 });
        G.fx.smoke(u.x + Math.cos(u.turret) * 38, u.y + Math.sin(u.turret) * 38, 0, 0, 0.8, 6, 18, 160, { layer: 0, scroll: 1 });
        SFX.play('enemyGun', u.x);
      }
    }
    if (Math.random() < 0.08) G.fx.smoke(u.x - Math.cos(u.ang) * 26, u.y - Math.sin(u.ang) * 26, 0, 0, 1, 4, 12, 90, { a: 0.3, layer: 0, scroll: 1 });
  },
  sam(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    if (u.stun) return;
    const want = aimAt(u.x, u.y);
    u.turret += U.clamp(U.angDiff(u.turret, want), -1.2 * dt, 1.2 * dt);
    if (u.y > 10 && u.y < VH - 60 && (u.fireT -= dt * rate()) <= 0) {
      u.fireT = U.rand(3, 4.4);
      const k = pickMissileKind(['heavy', 'hyper']);
      launchFrom(u.x, u.y, k);
      G.fx.smoke(u.x, u.y, 0, 0, 1.4, 10, 34, 200, { layer: 0, scroll: 1 });
    }
  },
  flak(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    if (u.stun) return;
    const p = G.player;
    const want = aimAt(u.x, u.y, 0.5);
    u.turret += U.clamp(U.angDiff(u.turret, want), -2 * dt, 2 * dt);
    if (u.y > 10 && u.y < VH - 60 && (u.fireT -= dt * rate()) <= 0) {
      u.fireT = U.rand(1.6, 2.6);
      const tx = p.x + p.vx * 0.5 + U.rand(-50, 50);
      const ty = p.y + p.vy * 0.5 + U.rand(-50, 50);
      const a = U.angleTo(u.x, u.y, tx, ty);
      for (const s of [-1, 1]) {
        fireBullet(u.x + s * 5, u.y, a, 520, 9, 'flak', { tx: tx + s * 30, ty: ty + s * 10 });
      }
      G.fx.glow(u.x + Math.cos(a) * 34, u.y + Math.sin(a) * 34, 0, 0, 0.1, 10, 18, 255, 220, 150, { layer: 0, scroll: 1 });
      SFX.play('enemyGun', u.x);
    }
  },
  radar(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    if (!u.stun) u.turret += dt * 1.6;
  },
  bunker(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    if (u.stun) return;
    if (u.y > 10 && u.y < VH - 80 && (u.fireT -= dt * rate()) <= 0) {
      u.fireT = U.rand(3.5, 4.6);
      if (G.lp.missiles.includes('swarm') && Math.random() < 0.5) launchFrom(u.x, u.y, 'swarm');
      else {
        const a = aimAt(u.x, u.y);
        for (let i = -2; i <= 2; i++) spawnMissile('rocket', u.x, u.y, a + i * 0.14);
      }
    }
  },
  frigate(u, dt) {
    u.t += dt;
    u.y += G.scroll * 0.55 * dt;
    u.x += Math.sin(u.t * 0.3 + u.phase) * 14 * dt;
    if (Math.random() < 0.6) G.fx.smoke(u.x + U.rand(-14, 14), u.y + 86, U.rand(-20, 20), 20, 1.6, 6, 26, 245, { a: 0.5, layer: 0, scroll: 1 });
    if (u.stun) return;
    const want = aimAt(u.x, u.y - 62);
    u.turret += U.clamp(U.angDiff(u.turret, want), -1.4 * dt, 1.4 * dt);
    if (u.y > 0 && u.y < VH - 80) {
      if ((u.fireT -= dt * rate()) <= 0) {
        u.fireT = U.rand(3.2, 4.2);
        const k = pickMissileKind(['heavy', 'hyper', 'rocket']);
        launchFrom(u.x, u.y - 40, k);
        if (k !== 'swarm') launchFrom(u.x, u.y - 30, k);
      }
      if ((u.fire2T -= dt * rate()) <= 0) {
        u.fire2T = U.rand(1.2, 2);
        fireBullet(u.x, u.y - 62, u.turret, 380, 10, 'shell');
        SFX.play('enemyGun', u.x);
      }
    }
  },
  boat(u, dt) {
    u.t += dt;
    u.y += G.scroll * dt;
    u.x += u.vx * dt;
    if (u.x < 60 || u.x > VW - 60) u.vx *= -1;
    u.ang = Math.atan2(G.scroll * 0.3, u.vx);
    if (Math.random() < 0.6) G.fx.smoke(u.x - Math.cos(u.ang) * 36, u.y - Math.sin(u.ang) * 36, 0, 0, 1.2, 4, 16, 245, { a: 0.5, layer: 0, scroll: 1 });
    if (u.stun) return;
    if (u.y > 10 && u.y < VH - 60 && (u.fireT -= dt * rate()) <= 0) {
      u.fireT = U.rand(2.6, 3.8);
      spawnMissile('rocket', u.x, u.y, aimAt(u.x, u.y) - 0.1);
      spawnMissile('rocket', u.x, u.y, aimAt(u.x, u.y) + 0.1);
    }
  },
};

function updateUnit(u, dt) {
  if (u.stun > 0) {
    u.stun -= dt;
    if (u.stun <= 0) u.stun = 0;
    if (Math.random() < 0.15) G.fx.spark(u.x + U.rand(-u.r, u.r), u.y + U.rand(-u.r, u.r), U.rand(-80, 80), U.rand(-80, 80), 0.15, 8, 150, 230, 255);
    if (u.air && u.kind !== 'drone') {
      u.x += (u.vx || 0) * dt * 0.3;
      u.y += (u.air ? 80 : 0) * dt;
    }
  }
  UNIT_AI[u.kind](u, dt);
  if (!u.air && u.y > VH + 140) u.gone = true;
  // fumée quand endommagé
  if (u.hp < u.maxHp * 0.5 && Math.random() < 0.3) {
    G.fx.smoke(u.x + U.rand(-u.r, u.r) * 0.4, u.y + U.rand(-u.r, u.r) * 0.4, 0, 0, 1.2, 5, 20, 50, { a: 0.5, layer: u.air ? 1 : 0, scroll: u.air ? 0.6 : 1 });
    if (Math.random() < 0.3) G.fx.glow(u.x + U.rand(-10, 10), u.y + U.rand(-10, 10), 0, 0, 0.3, 8, 3, 255, 120, 30, { layer: u.air ? 1 : 0, scroll: u.air ? 0 : 1 });
  }
}

function drawUnit(ctx, u) {
  const S = G.gs;
  const flash = u.flash > 0;
  if (u.air) return drawAirUnit(ctx, u);
  // unités au sol : petite ombre portée + corps + tourelle
  const sh = (s, x, y, r) => Sprites.drawShadow(ctx, s, x + 5, y + 5, r, 1, 0.35);
  switch (u.kind) {
    case 'tank':
      sh(S.tankHull, u.x, u.y, u.ang + Math.PI / 2);
      Sprites.draw(ctx, S.tankHull, u.x, u.y, u.ang + Math.PI / 2);
      Sprites.draw(ctx, S.tankTurret, u.x, u.y, u.turret + Math.PI / 2);
      break;
    case 'sam':
      sh(S.samHull, u.x, u.y, 0);
      Sprites.draw(ctx, S.samHull, u.x, u.y, 0);
      Sprites.draw(ctx, S.samLauncher, u.x, u.y + 8, u.turret + Math.PI / 2);
      break;
    case 'flak':
      Sprites.draw(ctx, S.flakBase, u.x, u.y, 0);
      Sprites.draw(ctx, S.flakGun, u.x, u.y, u.turret + Math.PI / 2);
      break;
    case 'radar':
      sh(S.radarBase, u.x, u.y, 0);
      Sprites.draw(ctx, S.radarBase, u.x, u.y, 0);
      Sprites.drawShadow(ctx, S.radarDish, u.x + 14, u.y + 14, u.turret, 1, 0.3);
      Sprites.draw(ctx, S.radarDish, u.x, u.y, u.turret);
      break;
    case 'bunker':
      Sprites.draw(ctx, S.bunker, u.x, u.y, 0);
      break;
    case 'frigate':
      Sprites.draw(ctx, S.frigate, u.x, u.y, 0);
      // tourelle avant orientable
      ctx.save();
      ctx.translate(u.x, u.y - 62);
      ctx.rotate(u.turret + Math.PI / 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(-1.5, -18, 3, 16);
      ctx.restore();
      break;
    case 'boat':
      Sprites.draw(ctx, S.boat, u.x, u.y, u.ang + Math.PI / 2);
      break;
    default:
      break;
  }
  if (flash) drawHitFlash(ctx, u);
  if (u.stun > 0) drawStun(ctx, u);
}

function drawHitFlash(ctx, u) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, u.flash * 6) * 0.6;
  ctx.drawImage(Glow.get(255, 255, 220), u.x - u.r, u.y - u.r, u.r * 2, u.r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawStun(ctx, u) {
  ctx.save();
  ctx.strokeStyle = `rgba(120,220,255,${0.4 + Math.random() * 0.4})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(u.x, u.y, u.r * 1.1, Math.random() * TAU, Math.random() * TAU + 2);
  ctx.stroke();
  ctx.restore();
}

function drawRotor(ctx, x, y, rot, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(30,30,30,0.18)';
  ctx.fill();
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(20,20,20,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

function drawAirUnit(ctx, u) {
  const spr = Sprites.list[u.def.sprite];
  const rot = u.ang + Math.PI / 2;
  const sx = u.bank ? 1 - Math.abs(u.bank) * 0.25 : 1;
  const scale = u.scale || 1;
  // ombre au sol (décalée selon l'altitude)
  Sprites.drawShadow(ctx, spr, u.x + 60 * scale, u.y + 80 * scale, rot, 0.85 * scale, 0.28, sx);
  // flammes des réacteurs
  if (u.kind !== 'heli' && u.kind !== 'drone') {
    ctx.globalCompositeOperation = 'lighter';
    const back = spr.h * 0.47 * scale;
    const bx = u.x - Math.cos(u.ang) * back;
    const by = u.y - Math.sin(u.ang) * back;
    const f = (u.kind === 'bomber' ? 10 : 16) * (0.8 + Math.random() * 0.4);
    ctx.drawImage(Glow.get(255, 170, 80), bx - f, by - f, f * 2, f * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  Sprites.draw(ctx, spr, u.x, u.y, rot, scale, 1, sx);
  if (u.kind === 'heli') drawRotor(ctx, u.x + Math.cos(u.ang) * 4, u.y + Math.sin(u.ang) * 4, u.rotor || 0, 44 * scale);
  if (u.flash > 0) drawHitFlash(ctx, u);
  if (u.stun > 0) drawStun(ctx, u);
}

// --- Projectiles ennemis ------------------------------------------------------

function updateEnemyBullets(dt) {
  const p = G.player;
  for (const b of G.eBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.kind === 'flak' && b.tx !== undefined) {
      // explose en atteignant le point visé
      if ((b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy <= 0) {
        b.dead = true;
        G.fx.explode(b.x, b.y, 22, 'small');
        G.fx.smoke(b.x, b.y, 0, 0, 1.6, 10, 34, 40, { a: 0.8 });
        SFX.play('explosionSmall', b.x, 0.4);
        if (p.alive && U.dist2(b.x, b.y, p.x, p.y) < 70 * 70) p.damage(b.dmg, 'blast');
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8 + Math.random() * 0.3;
          G.eBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 3, dmg: b.dmg * 0.4, kind: 'shrapnel', life: 0.5 });
        }
        continue;
      }
    }
    if (b.life <= 0 || b.x < -50 || b.x > VW + 50 || b.y < -50 || b.y > VH + 50) b.dead = true;
  }
  G.eBullets = G.eBullets.filter((b) => !b.dead);
}

function drawEnemyBullets(ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.eBullets) {
    const d = ENEMY_BULLET[b.kind];
    const [r, g, bb] = d.color.split(',').map(Number);
    const s = b.kind === 'orb' ? 22 : b.kind === 'shell' ? 14 : 10;
    ctx.drawImage(Glow.get(r, g, bb), b.x - s, b.y - s, s * 2, s * 2);
    if (d.len) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = `rgb(${d.color})`;
      ctx.lineWidth = b.kind === 'shell' ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / sp) * d.len, b.y - (b.vy / sp) * d.len);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.kind === 'orb' ? 4 : 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
