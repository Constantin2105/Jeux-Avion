'use strict';
// ---------------------------------------------------------------------------
// Partie en cours : déroulement d'un niveau, génération des vagues,
// collisions, bonus, rendu.
// ---------------------------------------------------------------------------

let G = null;

const PICKUPS = {
  credit: { color: [255, 210, 60], label: '' },
  repair: { color: [80, 255, 120], label: '+' },
  ammo: { color: [255, 150, 40], label: 'M' },
  power: { color: [200, 110, 255], label: 'P' },
  shield: { color: [80, 190, 255], label: 'S' },
};

class Game {
  constructor(levelN, save) {
    G = this;
    this.save = save;
    this.lp = levelParams(levelN);
    this.terrain = new Terrain(this.lp.themeId, levelN * 7919 + 13);
    this.clouds = new Clouds(this.lp.theme.clouds, this.lp.theme.night);
    this.fx = new FX();
    this.gs = Sprites.ground(this.lp.theme.camo);
    this.night = this.lp.theme.night;
    this.enemies = [];
    this.eBullets = [];
    this.pBullets = [];
    this.pOrd = [];
    this.hazards = [];
    this.pickups = [];
    this.wrecks = [];
    this.falling = [];
    this.popups = [];
    this.banners = [];
    this.boss = null;
    this.empWave = null;
    this.D = 0;
    this.scroll = this.lp.scroll;
    this.scrollTarget = this.lp.scroll;
    this.time = 0;
    this.levelTime = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.paused = false;
    this.score = 0;
    this.credits = 0;
    this.kills = 0;
    this.missilesDown = 0;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.waveT = 2.5;
    this.groundT = 1.5;
    this.ammoDropT = 8;
    this.lockWarning = false;
    this.radarBoost = false;
    this.damageFlash = 0;
    this.shieldFlash = 0;
    this.weaponFlash = 0;
    this.muzzle = 0;
    this.player = new Player(save);
    this.banner(`NIVEAU ${levelN}`, '#ffffff', 3, this.lp.def.name.toUpperCase());
    SFX.startEngine();
    SFX.startMusic(levelN);
  }

  banner(text, color = '#fff', dur = 1.6, sub = '') {
    // évite les doublons simultanés
    if (this.banners.some((b) => b.text === text && b.t < 0.5)) return;
    this.banners.push({ text, color, dur, sub, t: 0 });
  }

  popup(x, y, text, color = '#ffd84a') {
    this.popups.push({ x, y, text, color, t: 0 });
  }

  addCredits(n, x, y) {
    this.credits += n;
    if (x !== undefined) this.popup(x, y, `+${n} ¢`);
  }

  get progress() {
    return U.clamp(this.levelTime / this.lp.duration, 0, 1);
  }

  // --- Directeur de vagues --------------------------------------------------
  director(dt) {
    const lp = this.lp;
    const prog = this.progress;
    const inBoss = this.state === 'boss' || this.state === 'bossWarn';
    const intensity = (0.75 + 0.6 * prog) * Math.sqrt(lp.rate);
    this.waveT -= dt * intensity * (inBoss ? 0.35 : 1);
    if (this.waveT <= 0) {
      this.waveT = U.rand(3.0, 4.6);
      this.spawnWave();
    }
    if (!inBoss) {
      this.groundT -= dt * Math.pow(lp.rate, 0.4);
      if (this.groundT <= 0) {
        this.groundT = U.rand(3.6, 6);
        this.spawnGroundGroup();
      }
    }
    // pendant un boss au sol : ravitaillement en munitions
    if (inBoss && this.boss && this.boss.ground) {
      this.ammoDropT -= dt;
      if (this.ammoDropT <= 0) {
        this.ammoDropT = 9;
        this.pickups.push({ x: U.rand(200, VW - 200), y: -30, kind: 'ammo', t: 0 });
      }
    }
  }

  spawnWave() {
    const lp = this.lp;
    const n = lp.n;
    const table = [
      ['missiles', 6],
      ['rockets', 3],
    ];
    if (lp.air.includes('fighter')) table.push(['fighters', 4]);
    if (lp.air.includes('drone')) table.push(['drones', 2.5]);
    if (lp.air.includes('heli')) table.push(['heli', 2.5]);
    if (lp.air.includes('interceptor')) table.push(['interceptors', 2]);
    if (lp.air.includes('bomber')) table.push(['bomber', 1.3]);
    if (lp.air.includes('ace')) table.push(['ace', 1]);
    if (lp.missiles.includes('hyper')) table.push(['hyper', 1.4]);
    const w = U.weighted(table);
    const P = this.player;
    switch (w) {
      case 'missiles': {
        const count = U.randi(2, 3 + Math.floor(n / 5));
        for (let i = 0; i < count; i++) {
          const k = pickMissileKind(['hyper']);
          const x = U.rand(80, VW - 80);
          if (k === 'swarm') {
            for (let j = 0; j < 5; j++) spawnMissile('swarm', x + j * 16 - 32, -30 - j * 10, Math.PI / 2 + U.rand(-0.3, 0.3));
          } else {
            const m = spawnMissile(k, x, -40 - i * 50, U.angleTo(x, -40, P.x + U.rand(-120, 120), P.y));
            m.t = -i * 0.1;
          }
        }
        break;
      }
      case 'rockets': {
        const count = 5 + Math.floor(n / 3);
        const x0 = U.rand(150, VW - 150 - count * 60);
        for (let i = 0; i < count; i++) {
          const m = spawnMissile('rocket', x0 + i * 60 + U.rand(-10, 10), -40 - i * 30, Math.PI / 2 + U.rand(-0.05, 0.05));
          m.speed = MISSILES.rocket.speed * 0.9;
        }
        break;
      }
      case 'fighters': {
        const count = U.randi(3, 4 + Math.floor(n / 6));
        const cx = U.rand(250, VW - 250);
        const phase = Math.random() * TAU;
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 90;
          spawnUnit('fighter', cx + off, -80 - Math.abs(off) * 0.8, { phase, speed: 230 + n * 4 });
        }
        break;
      }
      case 'drones': {
        const count = U.randi(4, 6 + Math.floor(n / 5));
        for (let i = 0; i < count; i++) spawnUnit('drone', U.rand(60, VW - 60), -40 - i * 40, { ang: Math.PI / 2 });
        break;
      }
      case 'heli': {
        const count = U.randi(1, 2);
        for (let i = 0; i < count; i++) {
          const hx = U.rand(200, VW - 200);
          spawnUnit('heli', hx, -80, { hoverX: hx, hoverY: U.rand(110, 280), stay: U.rand(7, 11) });
        }
        break;
      }
      case 'interceptors': {
        const side = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 2; i++) {
          const x = side < 0 ? -60 : VW + 60;
          spawnUnit('interceptor', x, 60 + i * 70, { ang: side < 0 ? 0.35 : Math.PI - 0.35, side: side < 0 ? 1 : -1 });
        }
        break;
      }
      case 'bomber': {
        const bx = U.rand(300, VW - 300);
        spawnUnit('bomber', bx, -140);
        spawnUnit('fighter', bx - 170, -60, { speed: 70 });
        spawnUnit('fighter', bx + 170, -60, { speed: 70 });
        break;
      }
      case 'ace':
        spawnUnit('ace', U.rand(200, VW - 200), -80);
        this.banner('AS ENNEMI EN APPROCHE', '#ff4d4d', 1.4);
        break;
      case 'hyper': {
        const c = U.randi(1, 1 + Math.floor(n / 7));
        for (let i = 0; i < c; i++) launchFrom(0, 0, 'hyper');
        break;
      }
      default:
        break;
    }
  }

  // position x valide pour une unité au sol (terre ou eau selon le type)
  findGroundX(naval, y) {
    for (let i = 0; i < 16; i++) {
      const x = U.rand(90, VW - 90);
      const c = this.terrain.clsAtScreen(x, y);
      if (naval ? c === 0 : c === 1) return x;
    }
    return null;
  }

  spawnGroundGroup() {
    const lp = this.lp;
    const y = -90;
    if (lp.naval) {
      const x = this.findGroundX(true, y);
      if (x === null) return;
      if (Math.random() < 0.45) spawnUnit('frigate', x, y - 60, { turret: Math.PI / 2 });
      else for (let i = 0; i < 2; i++) spawnUnit('boat', U.clamp(x + i * 90, 60, VW - 60), y - i * 60, { vx: U.rand(-90, 90) || 50 });
      return;
    }
    const opts = [['convoy', 4]];
    if (lp.ground.includes('sam')) opts.push(['samsite', 3.5]);
    if (lp.ground.includes('flak')) opts.push(['flak', 2.5]);
    if (lp.ground.includes('bunker')) opts.push(['bunker', 1.5]);
    if (lp.ground.includes('radar')) opts.push(['radar', 1]);
    if (lp.ground.includes('boat')) opts.push(['boats', 1.5]);
    const kind = U.weighted(opts);
    if (kind === 'boats') {
      const x = this.findGroundX(true, y);
      if (x !== null) spawnUnit('boat', x, y, { vx: U.rand(-90, 90) || 50 });
      return;
    }
    const x = this.findGroundX(false, y);
    if (x === null) return;
    switch (kind) {
      case 'convoy': {
        const ang = U.pick([Math.PI / 2, Math.PI / 2 + 0.3, Math.PI / 2 - 0.3, 0, Math.PI]);
        const n = U.randi(2, 3 + Math.floor(lp.n / 8));
        for (let i = 0; i < n; i++)
          spawnUnit('tank', U.clamp(x - Math.cos(ang) * i * 60, 40, VW - 40), y - Math.sin(ang) * i * 60 - (ang === 0 || ang === Math.PI ? 0 : 0), { ang, turret: Math.PI / 2 });
        break;
      }
      case 'samsite':
        spawnUnit('sam', x, y, { turret: Math.PI / 2 });
        if (lp.ground.includes('flak') && Math.random() < 0.6) spawnUnit('flak', U.clamp(x + U.pick([-90, 90]), 50, VW - 50), y + 30, { turret: Math.PI / 2 });
        break;
      case 'flak':
        spawnUnit('flak', x, y, { turret: Math.PI / 2 });
        break;
      case 'bunker':
        spawnUnit('bunker', x, y - 20);
        break;
      case 'radar':
        spawnUnit('radar', x, y);
        if (lp.ground.includes('sam')) spawnUnit('sam', U.clamp(x + 100, 50, VW - 50), y + 40, { turret: Math.PI / 2 });
        break;
      default:
        break;
    }
  }

  // --- Événements -------------------------------------------------------------
  addKill(m, silent = false) {
    const d = m.def;
    this.missilesDown++;
    this.bumpCombo();
    this.score += Math.round(d.score * this.comboMul());
    this.credits += d.credits;
    if (!silent && Math.random() < 0.04) this.dropPickup(m.x, m.y, 1);
  }

  bumpCombo() {
    this.combo++;
    this.comboT = 2.2;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  comboMul() {
    return 1 + Math.min(4, Math.floor(this.combo / 5) * 0.5);
  }

  killUnit(e) {
    const d = e.def;
    this.kills++;
    this.bumpCombo();
    const sc = Math.round(d.score * this.comboMul());
    this.score += sc;
    this.addCredits(d.credits, e.x, e.y - 20);
    const naval = d.naval;
    if (e.air) {
      if (e.kind === 'drone') {
        this.fx.explode(e.x, e.y, 36, 'medium');
        SFX.play('explosion', e.x, 0.6);
      } else {
        this.fx.explode(e.x, e.y, e.kind === 'bomber' ? 70 : 44, e.kind === 'bomber' ? 'big' : 'medium');
        SFX.play('explosion', e.x);
        // l'épave tombe en vrille
        this.falling.push({
          spr: Sprites.list[d.sprite],
          x: e.x,
          y: e.y,
          rot: e.ang + Math.PI / 2,
          vr: U.rand(-4, 4),
          vx: (e.vx || 0) * 0.3 + U.rand(-40, 40),
          vy: (e.vy || 0) * 0.3 + 40,
          t: 0,
          dur: U.rand(0.9, 1.4),
          scale: e.scale || 1,
          big: e.kind === 'bomber',
        });
      }
    } else {
      this.fx.explode(e.x, e.y, e.kind === 'frigate' || e.kind === 'bunker' ? 70 : 46, naval ? 'water' : 'big', true);
      if (naval) this.fx.explode(e.x, e.y, 40, 'medium', true);
      SFX.play(e.kind === 'frigate' || e.kind === 'bunker' ? 'explosionBig' : 'explosion', e.x);
      const S = this.gs;
      const sprMap = { tank: S.tankHull, sam: S.samHull, flak: S.flakBase, radar: S.radarBase, bunker: S.bunker, frigate: S.frigate, boat: S.boat };
      this.wrecks.push({ spr: sprMap[e.kind], x: e.x, y: e.y, rot: e.kind === 'tank' || e.kind === 'boat' ? e.ang + Math.PI / 2 : 0, scale: 1, t: 0, naval });
    }
    this.dropPickup(e.x, e.y, d.air ? 0.22 : 0.3);
  }

  dropPickup(x, y, chance) {
    if (Math.random() > chance) return;
    const P = this.player;
    const table = [
      ['credit', 4],
      ['ammo', 3],
      ['repair', P.hp < P.maxHp * 0.7 ? 3 : 1],
      ['power', 1],
    ];
    if (P.maxShield > 0) table.push(['shield', 1]);
    this.pickups.push({ x, y, kind: U.weighted(table), t: 0 });
  }

  collect(pk) {
    const P = this.player;
    switch (pk.kind) {
      case 'credit': {
        const v = 40 + this.lp.n * 6;
        this.addCredits(v, pk.x, pk.y);
        SFX.play('coin');
        return;
      }
      case 'repair':
        P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.25);
        P.burnT = 0;
        this.popup(pk.x, pk.y, 'RÉPARATION', '#5f5');
        break;
      case 'shield':
        P.shield = P.maxShield;
        this.popup(pk.x, pk.y, 'BOUCLIER', '#5cf');
        break;
      case 'power':
        P.boostT = 8;
        P.heat = 0;
        P.overheated = false;
        this.popup(pk.x, pk.y, 'SURCHARGE !', '#c7f');
        this.banner('SURCHARGE : CADENCE MAX, SANS SURCHAUFFE', '#c77dff', 1.4);
        break;
      case 'ammo': {
        // recharge l'arme sélectionnée + un peu toutes les autres
        for (const o of P.ordnance) {
          const add = o.id === P.selected.id ? Math.ceil(P.maxAmmo[o.id] * 0.5) : Math.ceil(P.maxAmmo[o.id] * 0.15);
          if (o.id === 'nuke' && o.id !== P.selected.id) continue;
          P.ammo[o.id] = Math.min(P.maxAmmo[o.id], P.ammo[o.id] + add);
        }
        this.popup(pk.x, pk.y, 'MUNITIONS', '#fa4');
        break;
      }
      default:
        break;
    }
    SFX.play('pickup');
  }

  onBossKilled(b) {
    const big = !b.kind.startsWith('mini_');
    this.score += big ? 10000 : 3000;
    this.addCredits(big ? 1500 : 400, b.x, b.y);
    for (let i = 0; i < (big ? 10 : 5); i++) this.pickups.push({ x: b.x + U.rand(-120, 120), y: b.y + U.rand(-80, 80), kind: 'credit', t: 0 });
    this.state = 'clear';
    this.stateT = 0;
    this.scrollTarget = this.lp.scroll;
    this.banner('CIBLE DÉTRUITE', '#7dff8a', 2.5, b.name.toUpperCase());
    SFX.play('levelUp');
    // les menaces restantes s'autodétruisent
    for (const e of this.enemies) if (e.cat === 'missile') e.dead = true;
    this.eBullets.length = 0;
  }

  onPlayerDead() {
    this.state = 'dead';
    this.stateT = 0;
    SFX.stopMusic();
  }

  // --- Mise à jour ------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.stateT += dt;
    this.lockWarning = false;
    this.radarBoost = this.enemies.some((e) => e.kind === 'radar' && !e.dead && onScreen(e));
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2);
    this.weaponFlash = Math.max(0, this.weaponFlash - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    // défilement
    this.scroll += (this.scrollTarget - this.scroll) * Math.min(1, dt * 1.5);
    this.D += this.scroll * dt;
    this.terrain.update(this.D);
    this.clouds.update(dt, this.scroll);

    // états du niveau
    switch (this.state) {
      case 'intro':
        if (this.stateT > 2.4) {
          this.state = 'play';
          this.stateT = 0;
        }
        break;
      case 'play':
        this.levelTime += dt;
        this.director(dt);
        if (this.levelTime >= this.lp.duration) {
          this.state = 'bossWarn';
          this.stateT = 0;
          const bd = BOSSES[this.lp.def.boss];
          this.banner('⚠ ALERTE ⚠', '#ff3030', 3, bd.name.toUpperCase());
          SFX.play('warning');
        }
        break;
      case 'bossWarn':
        if (Math.floor(this.stateT * 2) !== Math.floor((this.stateT - dt) * 2)) SFX.play('warning');
        if (this.stateT > 3) {
          this.state = 'boss';
          this.stateT = 0;
          spawnBoss(this.lp.def.boss);
          if (this.lp.def.boss === 'mini_launcher' && this.lp.ground.includes('flak')) {
            spawnUnit('flak', 260, -60, { turret: Math.PI / 2 });
            spawnUnit('flak', VW - 260, -60, { turret: Math.PI / 2 });
          }
        }
        break;
      case 'boss':
        this.director(dt);
        break;
      case 'clear':
        if (this.stateT > 3.2) {
          this.state = 'outro';
          this.stateT = 0;
          // collecte automatique des bonus restants
          for (const pk of this.pickups) pk.magnet = true;
        }
        break;
      case 'outro':
        if (this.stateT > 2.4 && !this.finished) {
          this.finished = true;
          SFX.stopEngine();
          SFX.stopMusic();
          UI.levelComplete(this.results());
        }
        break;
      case 'dead':
        if (this.stateT > 3 && !this.finished) {
          this.finished = true;
          UI.gameOver(this.results());
        }
        break;
      default:
        break;
    }

    const P = this.player;
    P.update(dt);
    updatePlayerBullets(dt);
    updatePlayerOrdnance(dt);

    // ennemis
    for (const e of this.enemies) {
      if (e.dead || e.gone) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.cat === 'missile') updateMissile(e, dt);
      else updateUnit(e, dt);
    }
    if (this.boss) updateBoss(this.boss, dt);
    updateEnemyBullets(dt);

    // collisions avec le joueur
    if (P.alive) this.playerCollisions();

    this.enemies = this.enemies.filter((e) => !e.dead && !e.gone);

    // zones de feu (napalm)
    for (const h of this.hazards) {
      h.t += dt;
      h.y += this.scroll * dt;
      const k = 1 - h.t / h.life;
      if (Math.random() < 0.9 * k) {
        this.fx.glow(h.x + U.rand(-h.r, h.r) * 0.7, h.y + U.rand(-h.r, h.r) * 0.7, U.rand(-20, 20), U.rand(-60, -10), U.rand(0.4, 0.8), U.rand(14, 28), 4, 255, U.rand(80, 160), 20, { layer: 0, scroll: 1 });
        if (Math.random() < 0.3) this.fx.smoke(h.x + U.rand(-h.r, h.r) * 0.5, h.y, 0, -30, 1.6, 10, 40, 30, { a: 0.5, layer: 0, scroll: 1 });
      }
      for (const e of this.enemies) if (!e.air && U.dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) ** 2) damageEnemy(e, h.dps * dt, 'fire');
      if (this.boss && this.boss.ground) damageBossArea(this.boss, h.x, h.y, h.r, h.dps * dt);
    }
    this.hazards = this.hazards.filter((h) => h.t < h.life);

    // épaves au sol
    for (const w of this.wrecks) {
      w.t = (w.t || 0) + dt;
      w.y += this.scroll * dt;
      if (w.t < 6 && Math.random() < 0.35) {
        this.fx.smoke(w.x + U.rand(-10, 10), w.y + U.rand(-10, 10), U.rand(-10, 10), -20, 2, 6, 30, 35, { a: 0.55, layer: 0, scroll: 1 });
        if (Math.random() < 0.4) this.fx.glow(w.x + U.rand(-10, 10), w.y + U.rand(-10, 10), 0, -30, 0.4, 10, 3, 255, 120, 30, { layer: 0, scroll: 1 });
      }
    }
    this.wrecks = this.wrecks.filter((w) => w.y < VH + 300 && !(w.naval && w.t > 4));

    // avions abattus qui tombent
    for (const f of this.falling) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += (f.vy + this.scroll * 0.4) * dt;
      f.rot += f.vr * dt;
      this.fx.glow(f.x, f.y, 0, 0, 0.3, 16, 4, 255, 120, 30);
      this.fx.smoke(f.x, f.y, 0, 0, 1.4, 8, 30, 30, { a: 0.6 });
      if (f.t >= f.dur) {
        f.done = true;
        const water = this.terrain.clsAtScreen(f.x, f.y) === 0;
        this.fx.explode(f.x, f.y, f.big ? 70 : 44, water ? 'water' : 'big', true);
        SFX.play('explosion', f.x, 0.7);
      }
    }
    this.falling = this.falling.filter((f) => !f.done);

    // bonus
    for (const pk of this.pickups) {
      pk.t += dt;
      const d = U.dist(pk.x, pk.y, P.x, P.y);
      if (P.alive && (d < P.magnet || pk.magnet)) {
        const a = U.angleTo(pk.x, pk.y, P.x, P.y);
        const sp = 700;
        pk.x += Math.cos(a) * sp * dt;
        pk.y += Math.sin(a) * sp * dt;
      } else pk.y += this.scroll * 0.9 * dt;
      if (P.alive && d < 40) {
        pk.got = true;
        this.collect(pk);
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.got && pk.y < VH + 40);

    for (const p of this.popups) {
      p.t += dt;
      p.y -= 40 * dt;
    }
    this.popups = this.popups.filter((p) => p.t < 1.2);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.dur);

    if (this.lockWarning) SFX.play('lock');
    this.fx.update(dt, this.scroll);
  }

  playerCollisions() {
    const P = this.player;
    if (this.state === 'outro' || this.state === 'clear') return;
    for (const b of this.eBullets) {
      if (U.dist2(b.x, b.y, P.x, P.y) < (b.r + 16) ** 2) {
        b.dead = true;
        P.damage(b.dmg, 'bullet');
        this.fx.glow(b.x, b.y, 0, 0, 0.15, 10, 20, 255, 200, 120);
      }
    }
    for (const e of this.enemies) {
      if (e.dead || e.gone) continue;
      if (e.cat === 'missile') {
        if (e.warn > 0) continue;
        if (U.dist2(e.x, e.y, P.x, P.y) < (e.r + 22) ** 2) {
          e.dead = true;
          missileImpact(e, true);
        }
      } else if (e.air && U.dist2(e.x, e.y, P.x, P.y) < (e.r * 0.6 + 20) ** 2) {
        // collision directe
        P.damage(e.kind === 'drone' ? 22 * this.lp.dmgMul : 30, 'blast');
        damageEnemy(e, e.kind === 'drone' ? 999 : 80, 'blast');
      }
    }
  }

  results() {
    return {
      level: this.lp.n,
      name: this.lp.def.name,
      score: this.score,
      credits: this.credits,
      kills: this.kills,
      missiles: this.missilesDown,
      maxCombo: this.maxCombo,
      hpLeft: this.player.alive ? Math.round((this.player.hp / this.player.maxHp) * 100) : 0,
      won: this.state === 'outro',
    };
  }

  // --- Rendu ---------------------------------------------------------------
  draw(ctx) {
    ctx.save();
    if (this.fx.shake > 0) ctx.translate(U.rand(-1, 1) * this.fx.shake, U.rand(-1, 1) * this.fx.shake);
    // sol
    this.terrain.draw(ctx);
    this.fx.drawDecals(ctx);
    for (const w of this.wrecks) {
      if (!w.spr) continue;
      const a = w.naval ? Math.max(0, 1 - w.t / 4) : 1;
      Sprites.drawWreck(ctx, w.spr, w.x, w.y, w.rot, w.scale, a);
    }
    for (const e of this.enemies) if (!e.air) drawUnit(ctx, e);
    if (this.boss && this.boss.ground) drawBoss(ctx, this.boss);
    this.fx.drawLayer(ctx, 0, 'normal');
    if (!this.night) this.clouds.drawShadows(ctx);
    // air
    drawPlayerOrdnance(ctx);
    for (const f of this.falling) {
      const s = f.scale * (1 - (f.t / f.dur) * 0.45);
      Sprites.drawShadow(ctx, f.spr, f.x + 40 * (1 - f.t / f.dur), f.y + 55 * (1 - f.t / f.dur), f.rot, s, 0.3);
      Sprites.drawWreck(ctx, f.spr, f.x, f.y, f.rot, s);
    }
    for (const e of this.enemies) if (e.air && e.cat !== 'missile') drawUnit(ctx, e);
    if (this.boss && !this.boss.ground) drawBoss(ctx, this.boss);
    for (const e of this.enemies) if (e.cat === 'missile') drawMissile(ctx, e);
    this.player.draw(ctx);
    this.fx.drawLayer(ctx, 1, 'normal');
    // nuit : assombrissement global puis lumières additives
    if (this.night) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(78,88,130)';
      ctx.fillRect(-50, -50, VW + 100, VH + 100);
      ctx.globalCompositeOperation = 'source-over';
      this.terrain.drawLights(ctx);
    }
    this.fx.drawLayer(ctx, 0, 'add');
    this.fx.drawLayer(ctx, 1, 'add');
    drawEnemyBullets(ctx);
    drawPlayerBullets(ctx);
    this.drawPickups(ctx);
    this.fx.drawTop(ctx);
    this.player.drawLights(ctx);
    if (this.night) this.drawNightGlows(ctx);
    this.clouds.draw(ctx);
    // textes flottants
    ctx.font = 'bold 18px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.t / 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(p.text, p.x + 1.5, p.y + 1.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    this.fx.drawScreen(ctx);
    HUD.draw(ctx, this);
  }

  // à la nuit, les moteurs et missiles brillent davantage
  drawNightGlows(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.enemies) {
      if (!e.air) continue;
      const s = e.cat === 'missile' ? 18 : 26;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(Glow.get(255, 150, 70), e.x - s, e.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPickups(ctx) {
    for (const pk of this.pickups) {
      const d = PICKUPS[pk.kind];
      const bob = Math.sin(pk.t * 5) * 3;
      const [r, g, b] = d.color;
      ctx.globalCompositeOperation = 'lighter';
      const s = 34 + Math.sin(pk.t * 8) * 4;
      ctx.drawImage(Glow.get(r, g, b), pk.x - s, pk.y + bob - s, s * 2, s * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'credit') {
        ctx.scale(Math.cos(pk.t * 4), 1);
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fillStyle = '#e8b520';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff2a8';
        ctx.stroke();
        ctx.fillStyle = '#8a5e00';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('¢', 0, 1);
      } else {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(10,14,22,0.85)';
        ctx.fillRect(-12, -12, 24, 24);
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-12, -12, 24, 24);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.label, 0, 1);
      }
      ctx.restore();
    }
  }
}
