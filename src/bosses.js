'use strict';
// ---------------------------------------------------------------------------
// Boss : corps principal + pièces destructibles (tourelles, lanceurs, DCA).
// ---------------------------------------------------------------------------

function makePart(ox, oy, weapon, hp, opts = {}) {
  return {
    cat: 'part',
    ox,
    oy,
    weapon,
    hp,
    maxHp: hp,
    r: opts.r ?? 22,
    ang: Math.PI / 2,
    fireT: U.rand(1, 3),
    flash: 0,
    dead: false,
    x: 0,
    y: 0,
    spr: opts.spr,
    scale: opts.scale ?? 1,
  };
}

function spawnBoss(kind) {
  const d = BOSSES[kind];
  const mini = kind.startsWith('mini_');
  const hp = d.hp * (mini ? G.lp.hpMul : 1);
  const b = {
    cat: 'boss',
    kind,
    name: d.name,
    ground: d.ground,
    air: !d.ground,
    x: VW / 2,
    y: -300,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    t: 0,
    state: 'enter',
    phase: 1,
    flash: 0,
    stun: 0,
    parts: [],
    hit: [],
    fireT: 2,
    fire2T: 4,
    fire3T: 6,
    spiral: 0,
    dying: 0,
    rotor: 0,
  };
  switch (kind) {
    case 'battleship':
      b.spr = Sprites.list.battleship;
      b.y = -320;
      b.holdY = 330;
      b.hit = [
        [0, -160, 50],
        [0, -60, 66],
        [0, 60, 70],
        [0, 170, 56],
      ];
      for (const oy of [-215, -165, 140, 195]) b.parts.push(makePart(0, oy, 'naval', 380, { spr: Sprites.list.navalTurret, r: 26 }));
      for (const oy of [-125, 92]) b.parts.push(makePart(0, oy, 'launcher', 320, { spr: Sprites.list.launcherPart, r: 22, scale: 0.8 }));
      break;
    case 'fortress':
      b.spr = Sprites.list.fortress;
      b.y = -220;
      b.holdY = 210;
      b.hit = [
        [0, -60, 40],
        [0, 40, 50],
        [-130, 30, 44],
        [130, 30, 44],
        [-220, 55, 34],
        [220, 55, 34],
      ];
      for (const [ox, oy] of [
        [-106, 34],
        [106, 34],
        [-166, 56],
        [166, 56],
      ])
        b.parts.push(makePart(ox, oy, 'turret', 450, { spr: Sprites.list.airTurret, r: 20 }));
      b.parts.push(makePart(0, -96, 'turret', 450, { spr: Sprites.list.airTurret, r: 20 }));
      break;
    case 'citadel':
      b.spr = Sprites.list.citadel;
      b.y = -260;
      b.holdY = 250;
      b.hit = [[0, 0, 70]];
      for (const [ox, oy] of [
        [-115, -75],
        [115, -75],
        [-115, 75],
        [115, 75],
      ])
        b.parts.push(makePart(ox, oy, 'launcher', 520, { spr: Sprites.list.launcherPart, r: 24 }));
      for (const [ox, oy] of [
        [228, 72],
        [-228, -72],
        [-94, 172],
        [94, -172],
      ])
        b.parts.push(makePart(ox, oy, 'flak', 420, { r: 24 }));
      break;
    case 'omega':
      b.spr = Sprites.list.omega;
      b.y = -260;
      b.holdY = 210;
      b.hit = [
        [0, -40, 70],
        [0, 60, 60],
        [-150, 30, 50],
        [150, 30, 50],
        [-250, 70, 34],
        [250, 70, 34],
      ];
      for (const [ox, oy] of [
        [-120, -4],
        [120, -4],
        [-220, 52],
        [220, 52],
      ])
        b.parts.push(makePart(ox, oy, 'turret', 650, { spr: Sprites.list.airTurret, r: 20 }));
      for (const ox of [-62, 62]) b.parts.push(makePart(ox, 70, 'launcher', 700, { spr: Sprites.list.launcherPart, r: 22, scale: 0.8 }));
      break;
    case 'mini_gunship':
      b.spr = Sprites.list.heliBoss;
      b.scale = 2.3;
      b.y = -200;
      b.holdY = 190;
      b.hit = [
        [0, -30, 34],
        [0, 20, 30],
        [0, 80, 18],
      ];
      break;
    case 'mini_launcher':
      b.y = -150;
      b.holdY = 200;
      b.scale = 2.1;
      b.hit = [[0, 0, 60]];
      b.turret = Math.PI / 2;
      break;
    case 'mini_destroyer':
      b.y = -260;
      b.holdY = 230;
      b.scale = 1.55;
      b.hit = [
        [0, -80, 34],
        [0, 0, 36],
        [0, 80, 32],
      ];
      b.turret = Math.PI / 2;
      break;
    default:
      break;
  }
  G.boss = b;
  SFX.play('boss');
  return b;
}

function bossPartsAlive(b) {
  return b.parts.filter((p) => !p.dead).length;
}

function bossFireMissiles(x, y, n, kinds) {
  for (let i = 0; i < n; i++) {
    const k = U.pick(kinds.filter((k) => G.lp.missiles.includes(k) || k === 'homing' || k === 'rocket'));
    launchFrom(x + U.rand(-10, 10), y, k);
  }
}

function updatePart(b, p, dt) {
  const cos = 1;
  p.x = b.x + p.ox * (b.scale || 1) * cos;
  p.y = b.y + p.oy * (b.scale || 1);
  if (p.flash > 0) p.flash -= dt;
  if (p.dead) {
    if (Math.random() < 0.25) G.fx.smoke(p.x + U.rand(-8, 8), p.y + U.rand(-8, 8), U.rand(-10, 10), U.rand(-10, 10), 1.5, 6, 26, 40, { a: 0.5, layer: b.ground ? 0 : 1, scroll: 0.3 });
    if (Math.random() < 0.2) G.fx.glow(p.x + U.rand(-8, 8), p.y + U.rand(-8, 8), 0, 0, 0.3, 10, 3, 255, 120, 30, { layer: b.ground ? 0 : 1 });
    return;
  }
  const want = aimAt(p.x, p.y);
  p.ang += U.clamp(U.angDiff(p.ang, want), -2 * dt, 2 * dt);
  if (b.state !== 'fight' || b.stun > 0) return;
  const r = rate() * (b.phase >= 2 ? 1.35 : 1);
  if ((p.fireT -= dt * r) > 0) return;
  switch (p.weapon) {
    case 'naval':
      p.fireT = U.rand(1.8, 2.6);
      for (let i = -1; i <= 1; i++) fireBullet(p.x + Math.cos(p.ang) * 40, p.y + Math.sin(p.ang) * 40, p.ang + i * 0.12, 340, 12, 'shell');
      G.fx.glow(p.x + Math.cos(p.ang) * 44, p.y + Math.sin(p.ang) * 44, 0, 0, 0.15, 18, 30, 255, 200, 120);
      G.fx.smoke(p.x + Math.cos(p.ang) * 44, p.y + Math.sin(p.ang) * 44, 0, 0, 1, 10, 30, 170, { a: 0.5 });
      SFX.play('explosionSmall', p.x, 0.5);
      break;
    case 'turret':
      p.fireT = U.rand(1.2, 1.9);
      p.burst = 4;
      break;
    case 'launcher':
      p.fireT = U.rand(3.2, 4.4);
      bossFireMissiles(p.x, p.y, b.phase >= 2 ? 3 : 2, ['homing', 'fire', 'emp', 'cluster', 'swarm']);
      G.fx.smoke(p.x, p.y, 0, 0, 1.2, 12, 40, 200, { a: 0.6 });
      break;
    case 'flak': {
      p.fireT = U.rand(1.6, 2.4);
      const P = G.player;
      const tx = P.x + P.vx * 0.5 + U.rand(-40, 40);
      const ty = P.y + P.vy * 0.5 + U.rand(-40, 40);
      fireBullet(p.x, p.y, U.angleTo(p.x, p.y, tx, ty), 540, 10, 'flak', { tx, ty });
      break;
    }
    default:
      break;
  }
}

function updatePartBursts(p, dt) {
  if (p.burst > 0 && !p.dead && (p.burstT = (p.burstT ?? 0) - dt) <= 0) {
    p.burst--;
    p.burstT = 0.09;
    fireBullet(p.x + Math.cos(p.ang) * 26, p.y + Math.sin(p.ang) * 26, p.ang + U.rand(-0.04, 0.04), 520, 8);
    SFX.play('enemyGun', p.x);
  }
}

function updateBoss(b, dt) {
  b.t += dt;
  if (b.flash > 0) b.flash -= dt;
  if (b.stun > 0) b.stun -= dt;
  b.rotor += dt * 26;
  // mort : chaîne d'explosions
  if (b.state === 'dying') {
    b.dying += dt;
    b.y += (b.ground ? G.scroll * 0.3 : 30) * dt;
    if (Math.random() < 0.35) {
      const h = U.pick(b.hit);
      const s = b.scale || 1;
      const x = b.x + h[0] * s + U.rand(-h[2], h[2]);
      const y = b.y + h[1] * s + U.rand(-h[2], h[2]);
      G.fx.explode(x, y, U.rand(30, 60), U.pick(['medium', 'big']), b.ground);
      SFX.play('explosion', x, 0.8);
      G.fx.addShake(3);
    }
    if (b.dying > 2.6) {
      G.fx.explode(b.x, b.y, 120, b.ground ? 'thermo' : 'huge', b.ground);
      G.fx.addFlash(0.6, '255,230,200');
      G.fx.addShake(30);
      SFX.play('explosionBig', b.x);
      if (b.ground) G.wrecks.push({ spr: b.kind === 'mini_launcher' ? G.gs.samHull : b.kind === 'mini_destroyer' ? G.gs.frigate : b.spr, x: b.x, y: b.y, rot: 0, scale: b.scale || 1, naval: G.lp.naval });
      G.boss = null;
      G.onBossKilled(b);
    }
    return;
  }
  // entrée
  if (b.state === 'enter') {
    const target = b.holdY;
    b.y += Math.max(40, (target - b.y) * 1.2) * dt;
    if (b.kind === 'citadel') G.scrollTarget = Math.max(0, G.lp.scroll * Math.min(1, (target - b.y) / 300));
    if (b.y >= target - 2) {
      b.y = target;
      b.state = 'fight';
      if (b.kind === 'citadel') G.scrollTarget = 0;
    }
  }
  for (const p of b.parts) {
    updatePart(b, p, dt);
    updatePartBursts(p, dt);
  }
  if (b.state !== 'fight') return;
  // phases
  const frac = b.hp / b.maxHp;
  if (b.phase === 1 && (frac < 0.55 || (b.parts.length && !bossPartsAlive(b)))) {
    b.phase = 2;
    G.banner('PHASE 2', '#ff4d4d');
    SFX.play('boss');
  }
  if (b.phase === 2 && frac < 0.25 && (b.kind === 'omega' || b.kind === 'citadel' || b.kind === 'fortress')) {
    b.phase = 3;
    G.banner('PHASE FINALE', '#ff2d55');
    SFX.play('boss');
  }
  if (b.stun > 0) return;
  const r = rate() * (b.phase === 2 ? 1.3 : b.phase === 3 ? 1.6 : 1);
  const P = G.player;
  switch (b.kind) {
    case 'battleship':
      b.x = VW / 2 + Math.sin(b.t * 0.22) * 360;
      if (Math.random() < 0.7) G.fx.smoke(b.x + U.rand(-60, 60), b.y + 270, U.rand(-30, 30), 30, 2, 10, 40, 245, { a: 0.5, layer: 0 });
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = b.phase >= 2 ? 3.2 : 5;
        if (b.phase >= 2 && G.lp.missiles.includes('hyper')) for (let i = 0; i < 2; i++) launchFrom(b.x, b.y, 'hyper');
        else bossFireMissiles(b.x, b.y - 40, 4, ['homing', 'cluster']);
      }
      break;
    case 'fortress':
      b.x = VW / 2 + Math.sin(b.t * 0.35) * 280;
      b.y = b.holdY + Math.sin(b.t * 0.6) * 40;
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = 4.2;
        // soute : torpilles lourdes / fragmentation
        const k = b.phase >= 2 && G.lp.missiles.includes('heavy') ? 'heavy' : 'cluster';
        spawnMissile(k, b.x, b.y + 30, Math.PI / 2);
        if (b.phase >= 2) spawnMissile('cluster', b.x, b.y + 30, Math.PI / 2 + 0.4);
      }
      if ((b.fire2T -= dt * r) <= 0) {
        b.fire2T = 0.12;
        if (Math.random() < 0.4) fireBullet(b.x, b.y + 150, aimAt(b.x, b.y + 150) + U.rand(-0.15, 0.15), 440, 7);
      }
      if (b.phase >= 3 && (b.fire3T -= dt * r) <= 0) {
        b.fire3T = 3;
        bossFireMissiles(b.x, b.y, 2, ['swarm', 'homing']);
      }
      break;
    case 'citadel':
      G.scrollTarget = 0;
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = b.phase >= 2 ? 2.6 : 4;
        bossFireMissiles(b.x, b.y, b.phase >= 3 ? 3 : 2, ['swarm', 'emp', 'fire', 'homing']);
      }
      if (b.phase >= 2 && (b.fire3T -= dt * r) <= 0) {
        b.fire3T = 4.5;
        for (let i = 0; i < (b.phase >= 3 ? 3 : 2); i++) launchFrom(b.x, b.y, 'hyper');
      }
      break;
    case 'omega': {
      const s = b.phase === 3 ? 1.5 : 1;
      b.x = VW / 2 + Math.sin(b.t * 0.4 * s) * 360;
      b.y = b.holdY + Math.sin(b.t * 0.8 * s) * 60;
      if (b.phase >= 2) {
        // spirales d'orbes
        if ((b.fire2T -= dt) <= 0) {
          b.fire2T = b.phase === 3 ? 0.07 : 0.11;
          b.spiral += 0.37;
          const n = b.phase === 3 ? 3 : 2;
          for (let i = 0; i < n; i++) fireBullet(b.x, b.y - 40, b.spiral + (i * TAU) / n, 240, 9, 'orb', { life: 8 });
        }
      }
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = b.phase >= 2 ? 3.4 : 5;
        bossFireMissiles(b.x, b.y, 2, ['swarm', 'emp', 'fire']);
      }
      if (b.phase >= 2 && (b.fire3T -= dt * r) <= 0) {
        b.fire3T = b.phase === 3 ? 3 : 5;
        launchFrom(b.x, b.y, 'hyper');
        if (b.phase === 3) spawnMissile('heavy', b.x, b.y + 60, Math.PI / 2);
      }
      break;
    }
    case 'mini_gunship': {
      b.x += U.clamp((P.x - b.x) * 0.6, -160, 160) * dt;
      b.y = b.holdY + Math.sin(b.t * 0.9) * 50;
      b.ang = aimAt(b.x, b.y);
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = U.rand(1.1, 1.6);
        b.burst = 6;
      }
      if (b.burst > 0 && (b.burstT = (b.burstT ?? 0) - dt) <= 0) {
        b.burst--;
        b.burstT = 0.08;
        const a = aimAt(b.x, b.y);
        fireBullet(b.x + Math.cos(a) * 80, b.y + Math.sin(a) * 80, a + U.rand(-0.06, 0.06), 520, 8);
        SFX.play('enemyGun', b.x);
      }
      if ((b.fire2T -= dt * r) <= 0) {
        b.fire2T = U.rand(2.6, 3.4);
        const a = aimAt(b.x, b.y);
        for (let i = -2; i <= 2; i++) spawnMissile('rocket', b.x + i * 20, b.y + 20, a + i * 0.1);
      }
      if ((b.fire3T -= dt * r) <= 0) {
        b.fire3T = U.rand(4.5, 6);
        bossFireMissiles(b.x, b.y, 2, ['homing', 'fire', 'emp', 'swarm']);
      }
      break;
    }
    case 'mini_launcher':
      b.x = VW / 2 + Math.sin(b.t * 0.3) * 420;
      b.turret += U.clamp(U.angDiff(b.turret, aimAt(b.x, b.y)), -1.2 * dt, 1.2 * dt);
      if (Math.random() < 0.2) G.fx.smoke(b.x + U.rand(-30, 30), b.y + 80, 0, 0, 1, 6, 20, 120, { a: 0.4, layer: 0 });
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = b.phase >= 2 ? 2.4 : 3.2;
        bossFireMissiles(b.x, b.y, b.phase >= 2 ? 4 : 3, ['homing', 'cluster', 'fire', 'emp', 'swarm', 'rocket']);
        G.fx.smoke(b.x, b.y, 0, 0, 1.4, 20, 50, 200, { a: 0.6, layer: 0 });
      }
      if (b.phase >= 2 && G.lp.missiles.includes('hyper') && (b.fire3T -= dt * r) <= 0) {
        b.fire3T = 5;
        launchFrom(b.x, b.y, 'hyper');
      }
      break;
    case 'mini_destroyer':
      b.x = VW / 2 + Math.sin(b.t * 0.25) * 380;
      if (Math.random() < 0.7) G.fx.smoke(b.x + U.rand(-20, 20), b.y + 140, U.rand(-20, 20), 30, 1.8, 8, 34, 245, { a: 0.5, layer: 0 });
      b.turret += U.clamp(U.angDiff(b.turret, aimAt(b.x, b.y - 96)), -1.4 * dt, 1.4 * dt);
      if ((b.fireT -= dt * r) <= 0) {
        b.fireT = 3;
        bossFireMissiles(b.x, b.y - 40, 3, ['homing', 'cluster', 'rocket']);
      }
      if ((b.fire2T -= dt * r) <= 0) {
        b.fire2T = 1.2;
        for (let i = -1; i <= 1; i++) fireBullet(b.x, b.y - 96, b.turret + i * 0.1, 360, 11, 'shell');
      }
      break;
    default:
      break;
  }
  // fumée quand endommagé
  if (frac < 0.5 && Math.random() < 0.5) {
    const h = U.pick(b.hit);
    const s = b.scale || 1;
    G.fx.smoke(b.x + h[0] * s + U.rand(-20, 20), b.y + h[1] * s + U.rand(-20, 20), 0, 0, 1.6, 8, 30, 40, { a: 0.5, layer: b.ground ? 0 : 1, scroll: 0.3 });
  }
}

function drawBoss(ctx, b) {
  const s = b.scale || 1;
  const shakeX = b.state === 'dying' ? U.rand(-3, 3) : 0;
  const x = b.x + shakeX;
  if (!b.ground) {
    // ombre d'un objet volant
    if (b.spr) Sprites.drawShadow(ctx, b.spr, x + 120, b.y + 160, 0, 0.9 * s, 0.25);
  }
  switch (b.kind) {
    case 'mini_launcher':
      Sprites.drawShadow(ctx, G.gs.samHull, x + 8, b.y + 8, 0, s, 0.4);
      Sprites.draw(ctx, G.gs.samHull, x, b.y, 0, s);
      Sprites.draw(ctx, G.gs.samLauncher, x, b.y + 16, b.turret + Math.PI / 2, s);
      break;
    case 'mini_destroyer':
      Sprites.draw(ctx, G.gs.frigate, x, b.y, 0, s);
      ctx.save();
      ctx.translate(x, b.y - 96);
      ctx.rotate(b.turret + Math.PI / 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(-2.5, -26, 5, 22);
      ctx.restore();
      break;
    case 'mini_gunship':
      Sprites.drawShadow(ctx, b.spr, x + 100, b.y + 140, (b.ang || Math.PI / 2) + Math.PI / 2, s * 0.9, 0.25);
      Sprites.draw(ctx, b.spr, x, b.y, (b.ang || Math.PI / 2) + Math.PI / 2, s);
      drawRotor(ctx, x, b.y, b.rotor, 50 * s);
      break;
    default: {
      Sprites.draw(ctx, b.spr, x, b.y, 0, s);
      if (b.kind === 'fortress' || b.kind === 'omega') {
        // lueur des réacteurs
        ctx.globalCompositeOperation = 'lighter';
        const engines =
          b.kind === 'fortress'
            ? [
                [-76, 24],
                [76, 24],
                [-136, 52],
                [136, 52],
                [-196, 74],
                [196, 74],
              ]
            : [
                [-90, 118],
                [-40, 118],
                [40, 118],
                [90, 118],
              ];
        const col = b.kind === 'omega' ? [255, 60, 110] : [255, 170, 80];
        for (const [ex, ey] of engines) {
          const f = 22 * (0.8 + Math.random() * 0.4);
          ctx.drawImage(Glow.get(col[0], col[1], col[2]), x + ex - f, b.y + ey - f, f * 2, f * 2);
        }
        if (b.kind === 'omega') {
          const pulse = 40 + Math.sin(b.t * 6) * 10;
          ctx.globalAlpha = 0.7;
          ctx.drawImage(Glow.get(255, 40, 90), x - pulse, b.y - 100 - pulse, pulse * 2, pulse * 2);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  // pièces
  for (const p of b.parts) {
    if (p.dead) {
      ctx.fillStyle = 'rgba(20,15,10,0.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      continue;
    }
    if (p.weapon === 'flak') {
      Sprites.draw(ctx, G.gs.flakBase, p.x, p.y, 0);
      Sprites.draw(ctx, G.gs.flakGun, p.x, p.y, p.ang + Math.PI / 2);
    } else if (p.weapon === 'launcher') {
      Sprites.draw(ctx, p.spr, p.x, p.y, 0, p.scale);
    } else {
      Sprites.draw(ctx, p.spr, p.x, p.y, p.ang + Math.PI / 2, p.scale);
    }
    if (p.flash > 0) drawHitFlash(ctx, p);
    // mini barre de vie
    const w = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - w / 2, p.y - p.r - 10, w, 4);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(p.x - w / 2, p.y - p.r - 10, (w * p.hp) / p.maxHp, 4);
  }
  if (b.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, b.flash * 5) * 0.35;
    const sc = b.scale || 1;
    for (const h of b.hit) {
      const r = h[2] * 1.4 * sc;
      ctx.drawImage(Glow.get(255, 255, 220), x + h[0] * sc - r, b.y + h[1] * sc - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (b.stun > 0) drawStun(ctx, { x: b.x, y: b.y, r: 120 });
}
