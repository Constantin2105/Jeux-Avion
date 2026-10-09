'use strict';
// ---------------------------------------------------------------------------
// Joueur : pilotage à la souris, canon (clic gauche) avec surchauffe,
// armes secondaires (clic droit) sélectionnées à la molette.
// ---------------------------------------------------------------------------

class Player {
  constructor(save) {
    const up = save.upgrades;
    this.gunLevel = up.gun;
    this.gun = GUN_LEVELS[up.gun];
    this.maxHp = UPGRADES.armor.value(up.armor);
    this.hp = this.maxHp;
    this.maxShield = UPGRADES.shield.value(up.shield);
    this.shield = this.maxShield;
    this.cooling = UPGRADES.cooling.value(up.cooling);
    this.maxSpeed = UPGRADES.engine.value(up.engine) * 0.78;
    this.bayMul = UPGRADES.bay.value(up.bay);
    this.magnet = UPGRADES.magnet.value(up.magnet);
    this.x = VW / 2;
    this.y = VH + 120;
    this.vx = 0;
    this.vy = 0;
    this.r = 26;
    this.bank = 0;
    this.heat = 0;
    this.overheated = false;
    this.fireCd = 0;
    this.ordCd = 0;
    this.empT = 0;
    this.burnT = 0;
    this.invuln = 2.5;
    this.shieldDelay = 0;
    this.boostT = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.altBarrel = 0;
    // armes secondaires disponibles pour ce niveau
    this.ordnance = ORDNANCE.filter((o) => o.unlock <= G.lp.n);
    this.ammo = {};
    this.maxAmmo = {};
    for (const o of this.ordnance) {
      this.maxAmmo[o.id] = Math.max(1, Math.round(o.ammo * this.bayMul));
      this.ammo[o.id] = this.maxAmmo[o.id];
    }
    this.sel = 0;
    this.alt = 1; // altitude relative (0 = au sol, pendant le décollage)
  }

  get selected() {
    return this.ordnance[this.sel];
  }

  cycle(dir) {
    if (!this.ordnance.length) return;
    this.sel = (this.sel + dir + this.ordnance.length) % this.ordnance.length;
    SFX.play('switch');
    G.weaponFlash = 1.2;
  }

  select(i) {
    if (i < this.ordnance.length) {
      this.sel = i;
      SFX.play('switch');
      G.weaponFlash = 1.2;
    }
  }

  damage(amount, kind = 'hit') {
    if (!this.alive || this.invuln > 0 || G.state === 'clear' || G.state === 'outro') return;
    let a = amount;
    if (this.shield > 0 && kind !== 'burn') {
      const absorbed = Math.min(this.shield, a);
      this.shield -= absorbed;
      a -= absorbed;
      SFX.play('shieldHit');
      G.shieldFlash = 0.4;
    }
    this.shieldDelay = 3.5;
    if (a > 0) {
      this.hp -= a;
      this.hitFlash = 0.25;
      if (kind !== 'burn') {
        SFX.play('playerHit');
        G.fx.addShake(Math.min(14, 3 + a * 0.3));
        G.damageFlash = Math.min(0.6, 0.2 + a / 60);
        for (let i = 0; i < 6; i++)
          G.fx.spark(this.x, this.y, U.rand(-300, 300), U.rand(-300, 300), 0.3, 10, 255, 200, 120);
      }
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.hp = 0;
    G.fx.explode(this.x, this.y, 90, 'huge');
    G.fx.explode(this.x, this.y, 60, 'fire');
    G.fx.addFlash(0.5, '255,200,150');
    G.fx.addShake(30);
    SFX.play('explosionBig', this.x);
    SFX.stopEngine();
    G.onPlayerDead();
  }

  update(dt) {
    if (!this.alive) return;
    const M = Input.mouse;
    // --- déplacement : l'avion suit la souris ---
    let tx = M.x;
    let ty = M.y;
    if (G.state === 'intro') {
      // décollage scénarisé
      tx = VW / 2;
      ty = G.introY;
      this.alt = G.introAlt;
    } else if (G.state === 'outro') {
      tx = this.x;
      ty = -400;
    }
    const maxV = G.state === 'outro' ? 1400 : this.maxSpeed;
    let dvx = (tx - this.x) * 7;
    let dvy = (ty - this.y) * 7;
    const len = Math.hypot(dvx, dvy);
    if (len > maxV) {
      dvx = (dvx / len) * maxV;
      dvy = (dvy / len) * maxV;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (G.state !== 'outro' && G.state !== 'intro') {
      this.x = U.clamp(this.x, 40, VW - 40);
      this.y = U.clamp(this.y, 70, VH - 60);
    }
    if (G.state === 'intro') {
      this.x = tx;
      this.y = ty;
      this.vx = 0;
      this.vy = 0;
    }
    const targetBank = U.clamp(this.vx / 700, -1, 1);
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 6);
    // tonneau de victoire
    if (G.state === 'outro') this.bank = Math.sin(G.stateT * 7) * 0.95;
    // traînées de condensation en bout d'aile lors des virages serrés
    if (Math.abs(this.bank) > 0.45 && this.alt > 0.9) {
      const sx = 1 - Math.abs(this.bank) * 0.28;
      for (const s of [-1, 1]) G.fx.smoke(this.x + s * 46 * sx, this.y + 30, 0, 0, 0.6, 2, 7, 245, { a: 0.35 * Math.abs(this.bank), scroll: 0.9, drag: 0 });
    }
    SFX.setEngine(U.clamp(len / this.maxSpeed, 0, 1));

    // --- timers ---
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.fireCd -= dt;
    this.ordCd -= dt;
    if (this.empT > 0) {
      this.empT -= dt;
      if (Math.random() < 0.4) G.fx.spark(this.x + U.rand(-30, 30), this.y + U.rand(-30, 30), U.rand(-120, 120), U.rand(-120, 120), 0.15, 10, 140, 230, 255);
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.damage(7 * G.lp.dmgMul * dt, 'burn');
      if (Math.random() < 0.7) {
        G.fx.glow(this.x + U.rand(-16, 16), this.y + U.rand(-10, 30), U.rand(-30, 30), 120, 0.4, 14, 4, 255, 120, 30);
        G.fx.smoke(this.x + U.rand(-10, 10), this.y + 20, 0, 160, 0.9, 6, 20, 40, { a: 0.5 });
      }
    }
    // bouclier
    if (this.maxShield > 0 && this.empT <= 0) {
      if (this.shieldDelay > 0) this.shieldDelay -= dt;
      else this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.12 * dt);
    }
    // traînée réacteur
    const back = 52;
    G.fx.trail(this.x - 4.6, this.y + back - 12, -Math.PI / 2, 'player', 0.8);
    G.fx.trail(this.x + 4.6, this.y + back - 12, -Math.PI / 2, 'player', 0.8);
    if (this.hp < this.maxHp * 0.35 && Math.random() < 0.5)
      G.fx.smoke(this.x + U.rand(-15, 15), this.y + 10, 0, 140, 1, 5, 22, 40, { a: 0.6 });

    // --- tir principal ---
    const canFire = G.state === 'play' || G.state === 'boss' || G.state === 'bossWarn';
    const firing = M.left && canFire && this.empT <= 0 && !this.overheated;
    const boosted = this.boostT > 0;
    if (firing && this.fireCd <= 0) {
      this.fireCd = 1 / (this.gun.rate * (boosted ? 1.5 : 1));
      this.shoot();
      if (!boosted) this.heat += this.gun.heat;
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheated = true;
        SFX.play('overheat');
        G.banner('SURCHAUFFE !', '#ff7a00', 1);
      }
    }
    if (!firing || boosted) this.heat = Math.max(0, this.heat - this.cooling * dt * (this.overheated ? 0.8 : 1));
    else this.heat = Math.max(0, this.heat - this.cooling * 0.25 * dt);
    if (this.overheated && this.heat < 30) this.overheated = false;

    // --- arme secondaire ---
    if (M.right && canFire && this.ordCd <= 0 && this.selected) {
      if (this.empT > 0) {
        this.ordCd = 0.4;
        SFX.play('empty');
      } else if (this.ammo[this.selected.id] > 0) {
        this.ammo[this.selected.id]--;
        this.ordCd = this.selected.cooldown;
        launchOrdnance(this, this.selected.id);
      } else {
        this.ordCd = 0.35;
        SFX.play('empty');
        G.banner('PLUS DE MUNITIONS', '#ff4d4d', 0.8);
      }
    }
  }

  shoot() {
    const g = this.gun;
    const base = -Math.PI / 2;
    for (const [ox, deg] of g.pattern) {
      const a = base + (deg * Math.PI) / 180 + U.rand(-0.015, 0.015);
      const sx = this.x + ox * (1 - Math.abs(this.bank) * 0.25);
      const sy = this.y - 50 + Math.abs(ox) * 1.4;
      G.pBullets.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * g.speed + this.vx * 0.15,
        vy: Math.sin(a) * g.speed,
        dmg: g.dmg * (this.boostT > 0 ? 1.25 : 1),
        kind: g.kind,
        pierce: g.pierce || 0,
        hits: null,
        r: g.kind === 'plasma' ? 9 : g.kind === 'laser' ? 6 : 5,
        life: 1.2,
      });
    }
    // flash de bouche
    G.muzzle = 0.05;
    SFX.play(g.kind === 'laser' ? 'laser' : g.kind === 'plasma' ? 'plasma' : 'gun', this.x);
  }

  draw(ctx) {
    if (!this.alive) return;
    const spr = Sprites.list.player;
    const sx = 1 - Math.abs(this.bank) * 0.28;
    const blink = G.state !== 'intro' && this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    // ombre au sol (se rapproche de l'avion quand il est au sol)
    const al = this.alt;
    Sprites.drawShadow(ctx, spr, this.x + 6 + 64 * al, this.y + 6 + 89 * al, this.bank * 0.1, (0.82 + 0.18 * (1 - al)) * (0.85 + 0.15 * al), 0.42 - 0.12 * al, sx);
    ctx.save();
    if (al < 1) {
      const sc = 0.85 + 0.15 * al;
      ctx.translate(this.x, this.y);
      ctx.scale(sc, sc);
      ctx.translate(-this.x, -this.y);
    }
    // postcombustion
    ctx.globalCompositeOperation = 'lighter';
    const thr = U.clamp(-this.vy / 600, 0, 1);
    for (const ex of [-4.6, 4.6]) {
      const x = this.x + ex * sx;
      const y = this.y + 54;
      const f = (16 + thr * 18) * (0.85 + Math.random() * 0.3);
      ctx.drawImage(Glow.get(255, 150, 60), x - f, y - f * 0.6, f * 2, f * 2.2);
      ctx.drawImage(Glow.get(140, 180, 255), x - 6, y - 4, 12, 18 + thr * 16);
    }
    if (G.muzzle > 0) {
      for (const [ox] of this.gun.pattern) {
        const s = 16;
        ctx.drawImage(Glow.get(255, 230, 150), this.x + ox * sx - s, this.y - 56 - s, s * 2, s * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!blink) {
      Sprites.draw(ctx, spr, this.x, this.y, this.bank * 0.06, 1, 1, sx);
      // reflet de roulis : une aile s'éclaire, l'autre s'assombrit
      if (Math.abs(this.bank) > 0.05) {
        const shades = playerBankShades();
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.abs(this.bank) * 0.8);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.bank * 0.06);
        ctx.scale(sx, 1);
        ctx.drawImage(this.bank > 0 ? shades.right : shades.left, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
        ctx.restore();
      }
      if (this.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.hitFlash * 3;
        ctx.drawImage(Glow.get(255, 120, 80), this.x - 50, this.y - 50, 100, 100);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // bouclier
    if (this.shield > 0 && this.maxShield > 0) {
      const a = (G.shieldFlash > 0 ? 0.6 : 0.12) * Math.min(1, this.shield / this.maxShield + 0.3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(90,200,255,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 58, 66, 0, 0, TAU);
      ctx.stroke();
      if (G.shieldFlash > 0) {
        ctx.globalAlpha = G.shieldFlash;
        ctx.drawImage(Glow.get(80, 180, 255, 128), this.x - 70, this.y - 76, 140, 152);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.empT > 0) drawStun(ctx, { x: this.x, y: this.y, r: 55 });
    ctx.restore();
  }

  // feux de navigation (dessinés après l'assombrissement nocturne)
  drawLights(ctx) {
    if (!this.alive) return;
    const sx = 1 - Math.abs(this.bank) * 0.28;
    ctx.globalCompositeOperation = 'lighter';
    const on = Math.sin(G.time * 8) > 0.3;
    ctx.drawImage(Glow.get(255, 40, 40), this.x - 46 * sx - 7, this.y + 26 - 7, 14, 14);
    ctx.drawImage(Glow.get(40, 255, 80), this.x + 46 * sx - 7, this.y + 26 - 7, 14, 14);
    if (on) ctx.drawImage(Glow.get(255, 255, 255), this.x - 9, this.y + 40, 18, 18);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// --- Armes secondaires ------------------------------------------------------

// Balistique des bombes : vitesse initiale vers l'avant (vy0, négatif = vers le
// haut de l'écran), décélération (le sol défile), durée de chute.
const BOMB_PHYS = {
  mk82: { vy0: -330, fall: 0.85, vxMul: 0.4 },
  cluster: { vy0: -340, fall: 0.6, vxMul: 0.4 },
  napalm: { vy0: -330, fall: 0.7, vxMul: 0.4 },
  thermo: { vy0: -360, fall: 1.0, vxMul: 0.3 },
  nuke: { vy0: -380, fall: 1.3, vxMul: 0.2 },
};
const BOMB_DECEL = 280;

function makeBomb(p, id, extra) {
  const ph = BOMB_PHYS[id];
  return { kind: 'bomb', x: p.x, y: p.y + 10, vx: p.vx * ph.vxMul, vy: ph.vy0, t: 0, fall: ph.fall, ...extra };
}

// Point d'impact prévu (même intégration que updatePlayerOrdnance)
function predictImpact(p, id) {
  const ph = BOMB_PHYS[id];
  let x = p.x;
  let y = p.y + 10;
  let vx = p.vx * ph.vxMul;
  let vy = ph.vy0;
  const st = 1 / 60;
  for (let t = 0; t < ph.fall; t += st) {
    vx *= Math.exp(-1.2 * st);
    vy += BOMB_DECEL * st;
    x += vx * st;
    y += vy * st;
  }
  return { x, y };
}

function launchOrdnance(p, id) {
  const O = G.pOrd;
  switch (id) {
    case 'mk82':
      O.push(makeBomb(p, 'mk82', { spr: 'p_mk82', x: p.x + 20 * (p.altBarrel++ % 2 ? 1 : -1), radius: 95, dmg: 150, boom: 'big' }));
      SFX.play('bombDrop', p.x);
      break;
    case 'cluster':
      O.push(makeBomb(p, 'cluster', { spr: 'p_cluster', cluster: true }));
      SFX.play('bombDrop', p.x);
      break;
    case 'napalm':
      O.push(makeBomb(p, 'napalm', { spr: 'p_napalm', napalm: true }));
      SFX.play('bombDrop', p.x);
      break;
    case 'thermo':
      O.push(makeBomb(p, 'thermo', { spr: 'p_thermo', radius: 280, dmg: 520, boom: 'thermo', airDmg: 320 }));
      SFX.play('bombDrop', p.x);
      G.banner('BOMBE THERMOBARIQUE LARGUÉE', '#ff3d3d', 1.2);
      break;
    case 'nuke':
      O.push(makeBomb(p, 'nuke', { spr: 'p_nuke', nuke: true }));
      SFX.play('bombDrop', p.x);
      G.banner('OGIVE « SOLEIL » LARGUÉE', '#fff36b', 1.4);
      break;
    case 'emp':
      empBlast(p.x, p.y);
      break;
    case 'aam': {
      const side = p.altBarrel++ % 2 ? 1 : -1;
      const tgt = findTarget(p.x, p.y, true);
      O.push({ kind: 'missile', spr: 'p_aim', x: p.x + side * 30, y: p.y + 6, ang: -Math.PI / 2 + side * 0.25, speed: 200, max: 1050, turn: 6.5, target: tgt, t: 0, dmg: 90, air: true, radius: 50 });
      SFX.play('missile', p.x);
      break;
    }
    case 'agm': {
      const targets = findGroundTargets(4);
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        O.push({
          kind: 'missile',
          spr: 'p_agm',
          x: p.x + side * (18 + i * 6),
          y: p.y + 4,
          ang: -Math.PI / 2 + side * (0.4 + i * 0.1),
          speed: 160,
          max: 820,
          turn: 5,
          target: targets[i % Math.max(1, targets.length)] || null,
          t: -i * 0.06,
          dmg: 130,
          air: false,
          radius: 55,
        });
      }
      SFX.play('missile', p.x);
      break;
    }
    default:
      break;
  }
}

// Cible aérienne la plus proche en avant du joueur (unités prioritaires)
function findTarget(x, y, air) {
  let best = null;
  let bestScore = Infinity;
  const consider = (e) => {
    if (e.dead || e.gone) return;
    if (!onScreen(e, -10)) return;
    const d = U.dist(x, y, e.x, e.y);
    const ahead = e.y < y + 60 ? 0 : 400;
    const pri = e.cat === 'missile' ? 120 : 0;
    const s = d + ahead + pri;
    if (s < bestScore) {
      bestScore = s;
      best = e;
    }
  };
  for (const e of G.enemies) if (!!e.air === air && !(e.cat === 'missile' && e.warn > 0)) consider(e);
  const b = G.boss;
  if (b && b.air === air && b.state !== 'dying') {
    const parts = b.parts.filter((p) => !p.dead);
    if (parts.length) parts.forEach((p) => consider({ ...p, ref: p }));
    else consider({ x: b.x, y: b.y, ref: b, cat: 'boss' });
    if (best && best.ref) best = best.ref;
  }
  return best;
}

function findGroundTargets(n) {
  const list = G.enemies.filter((e) => !e.air && !e.dead && !e.gone && onScreen(e, -10));
  const b = G.boss;
  if (b && b.ground && b.state !== 'dying') {
    const parts = b.parts.filter((p) => !p.dead);
    if (parts.length) list.push(...parts);
    else list.push(b);
  }
  // les plus menaçants (les plus proches du haut de l'écran) d'abord
  list.sort((a, c) => U.dist2(a.x, a.y, G.player.x, G.player.y - 300) - U.dist2(c.x, c.y, G.player.x, G.player.y - 300));
  return list.slice(0, n);
}

function empBlast(x, y) {
  G.fx.explode(x, y, 160, 'emp');
  G.fx.ring(x, y, 20, 1100, 1.1, '120,220,255', 14);
  G.fx.ring(x, y, 20, 900, 1.3, '200,245,255', 5);
  G.fx.addFlash(0.35, '140,220,255');
  G.fx.addShake(10);
  SFX.play('emp', x);
  G.empWave = { x, y, r: 0, max: 1100, hit: new Set() };
  G.banner('IMPULSION IEM', '#4fd8ff', 1);
}

function updatePlayerOrdnance(dt) {
  for (const o of G.pOrd) {
    o.t += dt;
    if (o.kind === 'bomb') {
      o.vx *= Math.exp(-1.2 * dt);
      o.vy += BOMB_DECEL * dt; // la bombe "recule" à mesure qu'elle perd sa vitesse relative
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.t >= o.fall) {
        o.dead = true;
        bombImpact(o);
      }
    } else if (o.kind === 'bomblet') {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vx *= Math.exp(-2 * dt);
      o.vy *= Math.exp(-2 * dt);
      if (o.t >= o.fall) {
        o.dead = true;
        groundBlast(o.x, o.y, 48, 55, 'medium');
      }
    } else if (o.kind === 'missile') {
      if (o.t < 0) continue;
      o.speed = Math.min(o.max, o.speed + 1400 * dt);
      let tgt = o.target;
      if (tgt && (tgt.dead || tgt.gone || (tgt.cat === 'boss' && tgt.state === 'dying') || (tgt.cat === 'part' && tgt.dead))) tgt = o.target = null;
      if (!tgt && o.air && o.t > 0.2 && !o.retarget) {
        o.retarget = true;
        o.target = tgt = findTarget(o.x, o.y, true);
      }
      if (tgt && o.t > 0.12) {
        const want = U.angleTo(o.x, o.y, tgt.x, tgt.y);
        o.ang += U.clamp(U.angDiff(o.ang, want), -o.turn * dt, o.turn * dt);
      } else if (o.t > 0.12) {
        o.ang += U.clamp(U.angDiff(o.ang, -Math.PI / 2), -2 * dt, 2 * dt);
      }
      o.x += Math.cos(o.ang) * o.speed * dt;
      o.y += Math.sin(o.ang) * o.speed * dt;
      G.fx.trail(o.x, o.y, o.ang, 'hot', 0.7);
      // impact
      if (o.air) {
        const hit = hitAirAt(o.x, o.y, 14);
        if (hit) {
          o.dead = true;
          airBlast(o.x, o.y, o.radius, o.dmg);
        }
      } else if (tgt && U.dist2(o.x, o.y, tgt.x, tgt.y) < 24 * 24) {
        o.dead = true;
        groundBlast(o.x, o.y, o.radius, o.dmg, 'big');
      } else if (!tgt && o.t > 1.1) {
        o.dead = true;
        groundBlast(o.x, o.y, o.radius, o.dmg, 'big');
      }
      if (o.x < -100 || o.x > VW + 100 || o.y < -150 || o.y > VH + 100) o.dead = true;
    }
  }
  G.pOrd = G.pOrd.filter((o) => !o.dead);
  // onde IEM en expansion
  const w = G.empWave;
  if (w) {
    w.r += 1300 * dt;
    for (const e of G.enemies) {
      if (w.hit.has(e) || U.dist2(e.x, e.y, w.x, w.y) > w.r * w.r) continue;
      w.hit.add(e);
      if (e.cat === 'missile') {
        e.dead = true;
        G.fx.explode(e.x, e.y, 22, 'emp');
        G.addKill(e, true);
      } else {
        e.stun = 4.5;
        damageEnemy(e, 40, 'emp');
      }
    }
    for (const b of G.eBullets) if (U.dist2(b.x, b.y, w.x, w.y) < w.r * w.r) b.dead = true;
    if (G.boss && !w.hit.has(G.boss) && U.dist2(G.boss.x, G.boss.y, w.x, w.y) < w.r * w.r) {
      w.hit.add(G.boss);
      G.boss.stun = 2.5;
      damageBoss(G.boss, null, 120);
    }
    if (w.r > w.max) G.empWave = null;
  }
}

function bombImpact(o) {
  const naval = G.terrain.clsAtScreen(o.x, o.y) === 0;
  if (o.cluster) {
    G.fx.explode(o.x, o.y, 20, 'small');
    SFX.play('explosionSmall', o.x);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + U.rand(-0.2, 0.2);
      const v = U.rand(140, 300);
      G.pOrd.push({ kind: 'bomblet', spr: 'p_bomblet', x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, fall: U.rand(0.3, 0.55) });
    }
    return;
  }
  if (o.napalm) {
    SFX.play('napalm', o.x);
    for (let i = 0; i < 6; i++) {
      G.hazards.push({ x: o.x + U.rand(-20, 20), y: o.y - i * 48, r: 56, t: 0, life: 5.5, dps: 70 });
      G.fx.explode(o.x, o.y - i * 48, 40, 'fire', true);
      G.fx.decal(o.x, o.y - i * 48, 60, 'scorch');
    }
    return;
  }
  if (o.nuke) {
    nukeBlast(o.x, o.y);
    return;
  }
  groundBlast(o.x, o.y, o.radius, o.dmg, naval && o.boom !== 'thermo' ? 'water' : o.boom, o.airDmg);
}

// Explosion au sol : dégâts aux unités au sol (et aux unités aériennes basses
// pour les grosses charges)
function groundBlast(x, y, radius, dmg, boom = 'big', airDmg = 0) {
  const naval = G.terrain.clsAtScreen(x, y) === 0;
  G.fx.explode(x, y, Math.min(140, radius * 0.55), naval && boom !== 'thermo' ? 'water' : boom, true);
  if (boom === 'thermo') SFX.play('explosionBig', x);
  else SFX.play('explosion', x, 0.8);
  for (const e of G.enemies) {
    if (e.dead || e.gone) continue;
    const d = U.dist(x, y, e.x, e.y);
    if (!e.air && d < radius + e.r) damageEnemy(e, dmg * (1 - 0.5 * Math.min(1, d / (radius + e.r))), 'blast');
    else if (e.air && airDmg && d < radius) {
      if (e.cat === 'missile') {
        e.dead = true;
        G.fx.explode(e.x, e.y, 20, 'small');
        G.addKill(e, true);
      } else damageEnemy(e, airDmg, 'blast');
    }
  }
  const b = G.boss;
  if (b && b.state !== 'dying') {
    if (b.ground || airDmg) damageBossArea(b, x, y, radius, b.ground ? dmg : airDmg);
  }
  if (airDmg) for (const eb of G.eBullets) if (U.dist2(eb.x, eb.y, x, y) < radius * radius) eb.dead = true;
}

function airBlast(x, y, radius, dmg) {
  G.fx.explode(x, y, 34, 'medium');
  SFX.play('explosion', x, 0.6);
  for (const e of G.enemies) {
    if (e.dead || e.gone || !e.air) continue;
    const d = U.dist(x, y, e.x, e.y);
    if (d < radius + e.r) {
      if (e.cat === 'missile') {
        e.dead = true;
        missileKilled(e);
      } else damageEnemy(e, dmg * (1 - 0.4 * Math.min(1, d / (radius + e.r))), 'blast');
    }
  }
  const b = G.boss;
  if (b && b.air && b.state !== 'dying') damageBossArea(b, x, y, radius, dmg);
}

function nukeBlast(x, y) {
  G.fx.explode(x, y, 200, 'nuke', true);
  SFX.play('nuke', x);
  for (const e of G.enemies) {
    if (e.dead || e.gone) continue;
    if (e.cat === 'missile') {
      e.dead = true;
      G.addKill(e, true);
      continue;
    }
    if (onScreen(e, 60)) damageEnemy(e, 5000, 'blast');
  }
  for (const b of G.eBullets) b.dead = true;
  const b = G.boss;
  if (b && b.state !== 'dying') {
    for (const p of b.parts) if (!p.dead) damagePart(b, p, p.maxHp * 0.6);
    damageBoss(b, null, b.maxHp * 0.18);
  }
}

// --- Collisions / dégâts ------------------------------------------------------

function hitAirAt(x, y, r) {
  for (const e of G.enemies) {
    if (e.dead || e.gone || !e.air || (e.cat === 'missile' && e.warn > 0)) continue;
    if (U.dist2(x, y, e.x, e.y) < (r + e.r) * (r + e.r)) return e;
  }
  const b = G.boss;
  if (b && b.air && b.state === 'fight') {
    for (const p of b.parts) if (!p.dead && U.dist2(x, y, p.x, p.y) < (r + p.r) ** 2) return p;
    const s = b.scale || 1;
    for (const h of b.hit) if (U.dist2(x, y, b.x + h[0] * s, b.y + h[1] * s) < (r + h[2] * s) ** 2) return b;
  }
  return null;
}

function missileKilled(m) {
  // un missile abattu explose (la Titan reste dangereuse à proximité)
  const d = m.def;
  if (d.impact === 'huge' || d.impact === 'emp' || d.impact === 'fire') missileImpact(m, false);
  else {
    G.fx.explode(m.x, m.y, m.kind === 'swarm' ? 14 : 24, 'small');
    SFX.play('explosionSmall', m.x, 0.6);
  }
  G.addKill(m);
}

function damageEnemy(e, dmg, src = 'gun') {
  if (e.dead || e.gone) return;
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0) {
    e.dead = true;
    if (e.cat === 'missile') {
      missileKilled(e);
      return;
    }
    G.killUnit(e);
  } else if (src === 'gun') SFX.play(e.air ? 'hit' : 'metalHit', e.x);
}

function damagePart(b, p, dmg) {
  if (p.dead) return;
  p.hp -= dmg;
  p.flash = 0.08;
  if (p.hp <= 0) {
    p.dead = true;
    G.fx.explode(p.x, p.y, 50, 'big', b.ground);
    SFX.play('explosion', p.x);
    G.score += 500;
    G.addCredits(60, p.x, p.y);
    G.dropPickup(p.x, p.y, 0.8);
  }
}

function damageBoss(b, part, dmg) {
  if (!b || b.state !== 'fight') return;
  if (part && part !== b) {
    damagePart(b, part, dmg);
    // une partie des dégâts touche aussi la structure
    b.hp -= dmg * 0.35;
  } else {
    b.hp -= dmg;
    b.flash = 0.06;
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.state = 'dying';
    b.dying = 0;
    for (const p of b.parts) p.dead = true;
  }
}

function damageBossArea(b, x, y, radius, dmg) {
  if (b.state !== 'fight') return;
  let hitPart = false;
  for (const p of b.parts) {
    if (!p.dead && U.dist2(x, y, p.x, p.y) < (radius + p.r) ** 2) {
      damageBoss(b, p, dmg);
      hitPart = true;
    }
  }
  if (hitPart) return;
  const s = b.scale || 1;
  for (const h of b.hit) {
    if (U.dist2(x, y, b.x + h[0] * s, b.y + h[1] * s) < (radius + h[2] * s) ** 2) {
      damageBoss(b, null, dmg);
      return;
    }
  }
}

function updatePlayerBullets(dt) {
  for (const b of G.pBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.y < -40 || b.x < -40 || b.x > VW + 40) {
      b.dead = true;
      continue;
    }
    // cibles aériennes
    let target = null;
    for (const e of G.enemies) {
      if (e.dead || e.gone || (e.cat === 'missile' && e.warn > 0)) continue;
      if (b.hits && b.hits.has(e)) continue;
      const rr = e.air ? e.r + b.r : e.r * 0.8 + b.r;
      if (U.dist2(b.x, b.y, e.x, e.y) < rr * rr && (e.air || e.y > 0)) {
        target = e;
        break;
      }
    }
    if (target) {
      // le canon est 4x moins efficace contre les blindés au sol
      const dmg = target.air ? b.dmg : b.dmg * 0.25;
      damageEnemy(target, dmg, 'gun');
      bulletHitFx(b, target.air);
      if (b.pierce > 0) {
        b.pierce--;
        (b.hits || (b.hits = new Set())).add(target);
      } else b.dead = true;
      continue;
    }
    const boss = G.boss;
    if (boss && boss.state === 'fight') {
      const s = boss.scale || 1;
      let hit = null;
      for (const p of boss.parts) if (!p.dead && U.dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) ** 2) hit = p;
      if (!hit) for (const h of boss.hit) if (U.dist2(b.x, b.y, boss.x + h[0] * s, boss.y + h[1] * s) < (h[2] * s + b.r) ** 2) hit = boss;
      if (hit) {
        damageBoss(boss, hit, boss.ground ? b.dmg * 0.25 : b.dmg);
        bulletHitFx(b, !boss.ground);
        if (boss.ground) SFX.play('metalHit', b.x);
        else SFX.play('hit', b.x);
        b.dead = true;
      }
    }
  }
  G.pBullets = G.pBullets.filter((b) => !b.dead);
}

function bulletHitFx(b, air) {
  const c = b.kind === 'plasma' ? [200, 140, 255] : b.kind === 'laser' ? [120, 230, 255] : [255, 220, 140];
  G.fx.glow(b.x, b.y, 0, 0, 0.1, 10, 16, c[0], c[1], c[2], { layer: air ? 1 : 0 });
  for (let i = 0; i < 3; i++) G.fx.spark(b.x, b.y, U.rand(-200, 200), U.rand(-60, 160), 0.18, 6, c[0], c[1], c[2]);
  if (b.kind === 'plasma') G.fx.explode(b.x, b.y, 12, 'plasma');
}

function drawPlayerBullets(ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.pBullets) {
    switch (b.kind) {
      case 'laser':
        ctx.strokeStyle = 'rgba(120,230,255,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'plasma':
        ctx.drawImage(Glow.get(180, 110, 255), b.x - 18, b.y - 18, 36, 36);
        ctx.drawImage(Glow.get(255, 255, 255), b.x - 6, b.y - 6, 12, 12);
        break;
      case 'heavy':
        ctx.drawImage(Glow.get(255, 160, 60), b.x - 10, b.y - 10, 20, 20);
        ctx.strokeStyle = 'rgba(255,200,120,0.95)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
        ctx.stroke();
        break;
      default:
        ctx.drawImage(Glow.get(255, 210, 100), b.x - 8, b.y - 8, 16, 16);
        ctx.strokeStyle = 'rgba(255,240,180,0.95)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
        ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPlayerOrdnance(ctx) {
  for (const o of G.pOrd) {
    if (o.t < 0) continue;
    const spr = Sprites.list[o.spr];
    if (!spr) continue;
    if (o.kind === 'bomb' || o.kind === 'bomblet') {
      // la bombe rétrécit en tombant, son ombre se rapproche
      const k = Math.min(1, o.t / o.fall);
      const s = 1 - k * 0.55;
      Sprites.drawShadow(ctx, spr, o.x + 60 * (1 - k), o.y + 80 * (1 - k), 0, s, 0.3);
      Sprites.draw(ctx, spr, o.x, o.y, Math.sin(o.t * 6) * 0.08, s);
    } else {
      Sprites.drawShadow(ctx, spr, o.x + 40, o.y + 55, o.ang + Math.PI / 2, 0.9, 0.22);
      ctx.globalCompositeOperation = 'lighter';
      const bx = o.x - Math.cos(o.ang) * 16;
      const by = o.y - Math.sin(o.ang) * 16;
      ctx.drawImage(Glow.get(255, 200, 120), bx - 12, by - 12, 24, 24);
      ctx.globalCompositeOperation = 'source-over';
      Sprites.draw(ctx, spr, o.x, o.y, o.ang + Math.PI / 2);
    }
  }
}

// Masques d'ombrage pour simuler le roulis (une aile éclairée, l'autre dans
// l'ombre), calculés une seule fois à partir de la silhouette de l'avion.
let BANK_SHADES = null;
function playerBankShades() {
  if (BANK_SHADES) return BANK_SHADES;
  const spr = Sprites.list.player;
  const make = (dir) => {
    const c = U.makeCanvas(spr.c.width, spr.c.height);
    const x = c.getContext('2d');
    x.drawImage(spr.c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    const g = x.createLinearGradient(0, 0, c.width, 0);
    const lit = 'rgba(255,255,255,0.35)';
    const dark = 'rgba(0,0,0,0.45)';
    g.addColorStop(0, dir > 0 ? dark : lit);
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, dir > 0 ? lit : dark);
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  };
  BANK_SHADES = { left: make(-1), right: make(1) };
  return BANK_SHADES;
}
