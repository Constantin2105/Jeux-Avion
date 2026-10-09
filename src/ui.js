'use strict';
// ---------------------------------------------------------------------------
// Interface : menus, hangar (améliorations + missions), écrans de fin,
// sauvegarde locale.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'skystrike-save-v1';

const Save = {
  defaults() {
    return {
      unlocked: 1,
      credits: 0,
      upgrades: { gun: 0, armor: 0, shield: 0, cooling: 0, engine: 0, bay: 0, magnet: 0 },
      best: {},
      totalScore: 0,
      settings: { volume: 0.7, music: 0.35 },
      won: false,
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.defaults();
      const d = this.defaults();
      const s = JSON.parse(raw);
      return { ...d, ...s, upgrades: { ...d.upgrades, ...(s.upgrades || {}) }, settings: { ...d.settings, ...(s.settings || {}) } };
    } catch (e) {
      return this.defaults();
    }
  },
  write(s) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (e) {
      /* stockage indisponible */
    }
  },
};

// Niveau requis pour chaque palier du canon
const GUN_REQ = [1, 1, 2, 2, 3, 4, 5, 6];

const $ = (sel) => document.querySelector(sel);

function spriteURL(name, size = 64, rot = 0) {
  const spr = Sprites.list[name];
  if (!spr) return '';
  const c = U.makeCanvas(size, size);
  const x = c.getContext('2d');
  x.translate(size / 2, size / 2);
  x.rotate(rot);
  const s = (size * 0.9) / Math.max(spr.w, spr.h);
  x.drawImage(spr.c, (-spr.w * s) / 2, (-spr.h * s) / 2, spr.w * s, spr.h * s);
  return c.toDataURL();
}

const UI = {
  save: null,
  selectedLevel: 1,
  hangarTab: 'missions',
  lastResults: null,

  init() {
    this.save = Save.load();
    SFX.setVolume(this.save.settings.volume);
    SFX.setMusicVolume(this.save.settings.music);
    this.selectedLevel = Math.min(this.save.unlocked, LEVELS.length);
    document.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        SFX.resume();
        SFX.play('click');
        this.action(el.dataset.action);
      });
    });
    $('#opt-volume').value = this.save.settings.volume;
    $('#opt-music').value = this.save.settings.music;
    $('#opt-volume').addEventListener('input', (e) => {
      this.save.settings.volume = parseFloat(e.target.value);
      SFX.resume();
      SFX.setVolume(this.save.settings.volume);
      Save.write(this.save);
    });
    $('#opt-music').addEventListener('input', (e) => {
      this.save.settings.music = parseFloat(e.target.value);
      SFX.setMusicVolume(this.save.settings.music);
      Save.write(this.save);
    });
    this.buildCodex();
    this.show('menu');
    this.refreshMenu();
  },

  show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('visible', s.id === id));
    this.current = id;
  },

  refreshMenu() {
    $('#menu-continue').textContent = this.save.unlocked > 1 ? `CONTINUER LA CAMPAGNE (niveau ${Math.min(this.save.unlocked, 20)})` : 'NOUVELLE CAMPAGNE';
  },

  action(a) {
    switch (a) {
      case 'campaign':
        if (!this.save.introSeen) this.playIntro();
        else this.openHangar();
        break;
      case 'intro':
        this.playIntro();
        break;
      case 'controls':
        this.prev = this.current;
        this.show('controls');
        break;
      case 'options':
        this.prev = this.current;
        this.show('options');
        break;
      case 'back':
        this.show(this.prev || 'menu');
        break;
      case 'quit':
        if (window.desktop) window.desktop.quit();
        else window.close();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'reset':
        if (confirm('Effacer toute la progression ?')) {
          this.save = Save.defaults();
          Save.write(this.save);
          this.selectedLevel = 1;
          this.refreshMenu();
        }
        break;
      case 'menu':
        this.endGame();
        this.show('menu');
        this.refreshMenu();
        break;
      case 'takeoff':
        this.startLevel(this.selectedLevel);
        break;
      case 'resume':
        this.resume();
        break;
      case 'abort':
        this.endGame();
        this.openHangar();
        break;
      case 'retry':
        this.startLevel(this.lastResults ? this.lastResults.level : this.selectedLevel);
        break;
      case 'next':
        this.startLevel(Math.min(LEVELS.length, (this.lastResults ? this.lastResults.level : 1) + 1));
        break;
      case 'hangar':
        this.endGame();
        this.openHangar();
        break;
      case 'tab-missions':
        this.hangarTab = 'missions';
        this.renderHangar();
        break;
      case 'tab-intel':
        this.hangarTab = 'intel';
        this.renderHangar();
        break;
      default:
        break;
    }
  },

  playIntro() {
    this.endGame();
    Cinema.play(introShots(), () => {
      this.save.introSeen = true;
      Save.write(this.save);
      this.openHangar();
    });
  },

  // --- Partie ---------------------------------------------------------------
  startLevel(n) {
    if (Cinema.active) Cinema.active = false;
    this.endGame();
    this.selectedLevel = n;
    Input.release();
    this.show('none');
    new Game(n, this.save);
  },

  endGame() {
    if (G) {
      SFX.stopEngine();
      SFX.stopMusic();
    }
    G = null;
  },

  pause() {
    if (!G) return;
    G.paused = true;
    Input.release();
    SFX.stopEngine();
    $('#pause-info').textContent = `Niveau ${G.lp.n} — ${G.lp.def.name}`;
    this.show('pause');
  },

  resume() {
    if (!G) return;
    G.paused = false;
    SFX.startEngine();
    this.show('none');
  },

  levelComplete(r) {
    this.lastResults = r;
    const s = this.save;
    s.credits += r.credits;
    s.totalScore += r.score;
    s.best[r.level] = Math.max(s.best[r.level] || 0, r.score);
    const newUnlock = r.level + 1 > s.unlocked && r.level < LEVELS.length;
    if (newUnlock) s.unlocked = r.level + 1;
    if (r.level === LEVELS.length) s.won = true;
    Save.write(s);
    if (r.level === LEVELS.length) {
      $('#victory-stats').innerHTML = this.statsHTML(r) + `<div class="stat big"><span>Score total de campagne</span><b>${U.fmt(s.totalScore)}</b></div>`;
      // différé : on est encore dans la mise à jour de la partie
      setTimeout(() => {
        this.endGame();
        Cinema.play(victoryShots(), () => this.show('victory'));
      }, 0);
      return;
    }
    $('#results-title').textContent = `MISSION ACCOMPLIE`;
    $('#results-sub').textContent = `Niveau ${r.level} — ${r.name}`;
    let extra = '';
    const unl = ORDNANCE.filter((o) => o.unlock === r.level + 1);
    if (unl.length) extra += `<div class="unlock">Nouvelle arme débloquée : <b>${unl.map((o) => o.name).join(', ')}</b></div>`;
    const gunIdx = GUN_REQ.indexOf(r.level + 1);
    if (gunIdx > 0) extra += `<div class="unlock">Nouveau canon disponible au hangar : <b>${GUN_LEVELS[gunIdx].name}</b></div>`;
    $('#results-stats').innerHTML = this.statsHTML(r) + extra;
    this.selectedLevel = Math.min(LEVELS.length, r.level + 1);
    this.show('results');
  },

  gameOver(r) {
    this.lastResults = r;
    const s = this.save;
    const kept = Math.floor(r.credits * 0.75);
    s.credits += kept;
    Save.write(s);
    $('#gameover-stats').innerHTML = this.statsHTML({ ...r, credits: kept }) + '<div class="note">75 % des crédits gagnés sont conservés. Améliorez votre avion au hangar !</div>';
    this.show('gameover');
  },

  statsHTML(r) {
    return `
      <div class="stat"><span>Score</span><b>${U.fmt(r.score)}</b></div>
      <div class="stat"><span>Crédits gagnés</span><b class="gold">+${U.fmt(r.credits)} ¢</b></div>
      <div class="stat"><span>Ennemis abattus</span><b>${r.kills}</b></div>
      <div class="stat"><span>Missiles interceptés</span><b>${r.missiles}</b></div>
      <div class="stat"><span>Meilleure série</span><b>${r.maxCombo}</b></div>
      ${r.won ? `<div class="stat"><span>Intégrité de la coque</span><b>${r.hpLeft} %</b></div>` : ''}`;
  },

  // --- Hangar ---------------------------------------------------------------
  openHangar() {
    this.show('hangar');
    this.renderHangar();
  },

  upgradeCost(key) {
    const lvl = this.save.upgrades[key];
    if (key === 'gun') return lvl + 1 < GUN_LEVELS.length ? GUN_LEVELS[lvl + 1].cost : null;
    const u = UPGRADES[key];
    return lvl < u.max ? u.costs[lvl] : null;
  },

  buy(key) {
    const cost = this.upgradeCost(key);
    if (cost === null || this.save.credits < cost) {
      SFX.play('empty');
      return;
    }
    if (key === 'gun' && GUN_REQ[this.save.upgrades.gun + 1] > this.save.unlocked) {
      SFX.play('empty');
      return;
    }
    this.save.credits -= cost;
    this.save.upgrades[key]++;
    Save.write(this.save);
    SFX.play('buy');
    this.renderHangar();
  },

  renderHangar() {
    const s = this.save;
    $('#hangar-credits').textContent = `${U.fmt(s.credits)} ¢`;
    $('#hangar-score').textContent = U.fmt(s.totalScore);

    // aperçu de l'avion
    const pv = $('#plane-preview');
    if (!pv.dataset.ready) {
      pv.dataset.ready = '1';
      this.animatePreview(pv);
    }

    // statistiques
    const up = s.upgrades;
    const stat = (label, val, max, txt) =>
      `<div class="pstat"><span>${label}</span><div class="pbar"><i style="width:${Math.round((val / max) * 100)}%"></i></div><em>${txt}</em></div>`;
    $('#plane-stats').innerHTML =
      stat('Coque', UPGRADES.armor.value(up.armor), UPGRADES.armor.value(6), `${UPGRADES.armor.value(up.armor)} PV`) +
      stat('Bouclier', UPGRADES.shield.value(up.shield), 165, `${UPGRADES.shield.value(up.shield)}`) +
      stat('Puissance de feu', GUN_LEVELS[up.gun].dmg * GUN_LEVELS[up.gun].pattern.length * GUN_LEVELS[up.gun].rate, 30 * 5 * 14, GUN_LEVELS[up.gun].name) +
      stat('Vitesse', UPGRADES.engine.value(up.engine), UPGRADES.engine.value(5), `${UPGRADES.engine.value(up.engine)} km/h`) +
      stat('Refroidissement', UPGRADES.cooling.value(up.cooling), UPGRADES.cooling.value(5), `${UPGRADES.cooling.value(up.cooling)} °/s`);

    // améliorations
    const rows = Object.keys(UPGRADES).map((key) => {
      const u = UPGRADES[key];
      const lvl = up[key];
      const cost = this.upgradeCost(key);
      const pips = Array.from({ length: u.max + 1 }, (_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
      let btn;
      let next = '';
      if (cost === null) btn = '<button class="buy max" disabled>MAX</button>';
      else {
        const req = key === 'gun' ? GUN_REQ[lvl + 1] : 1;
        next = `→ ${u.desc(lvl + 1)}`;
        if (req > s.unlocked) btn = `<button class="buy" disabled>Niveau ${req}</button>`;
        else btn = `<button class="buy" data-buy="${key}" ${s.credits < cost ? 'disabled' : ''}>${U.fmt(cost)} ¢</button>`;
      }
      return `<div class="uprow">
        <div class="upicon">${u.icon}</div>
        <div class="upinfo"><b>${u.name}</b><small>${u.desc(lvl)}</small><small class="next">${next}</small><div class="pips">${pips}</div></div>
        ${btn}
      </div>`;
    });
    $('#upgrades').innerHTML = rows.join('');
    $('#upgrades')
      .querySelectorAll('[data-buy]')
      .forEach((b) => b.addEventListener('click', () => this.buy(b.dataset.buy)));

    // arsenal
    $('#arsenal').innerHTML = ORDNANCE.map((o) => {
      const ok = o.unlock <= s.unlocked;
      const icon = { mk82: 'p_mk82', aam: 'p_aim', cluster: 'p_cluster', napalm: 'p_napalm', agm: 'p_agm', emp: 'p_emp', thermo: 'p_thermo', nuke: 'p_nuke' }[o.id];
      return `<div class="arm ${ok ? '' : 'locked'}" title="${o.desc}">
        <img src="${spriteURL(icon, 48, Math.PI / 4)}" alt="">
        <div><b style="color:${ok ? o.color : '#667'}">${o.name}</b><small>${ok ? o.desc : `Débloqué au niveau ${o.unlock}`}</small></div>
        <em>${ok ? `x${Math.round(o.ammo * UPGRADES.bay.value(up.bay))}` : '🔒'}</em>
      </div>`;
    }).join('');

    // onglets
    $('#tab-missions').classList.toggle('active', this.hangarTab === 'missions');
    $('#tab-intel').classList.toggle('active', this.hangarTab === 'intel');
    $('#missions-pane').style.display = this.hangarTab === 'missions' ? '' : 'none';
    $('#intel-pane').style.display = this.hangarTab === 'intel' ? '' : 'none';

    // missions
    const grid = LEVELS.map((L, i) => {
      const n = i + 1;
      const ok = n <= s.unlocked;
      const boss = !L.boss.startsWith('mini_');
      const best = s.best[n];
      return `<button class="lvl ${ok ? '' : 'locked'} ${n === this.selectedLevel ? 'sel' : ''} ${boss ? 'boss' : ''} theme-${L.theme}" data-lvl="${n}" ${ok ? '' : 'disabled'}>
        <b>${n}</b><small>${THEMES[L.theme].name}</small>${best ? '<i>★</i>' : ''}${boss ? '<u>BOSS</u>' : ''}
      </button>`;
    }).join('');
    $('#level-grid').innerHTML = grid;
    $('#level-grid')
      .querySelectorAll('[data-lvl]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          SFX.play('click');
          this.selectedLevel = parseInt(b.dataset.lvl, 10);
          this.renderHangar();
        }),
      );
    const L = LEVELS[this.selectedLevel - 1];
    const lp = levelParams(this.selectedLevel);
    const newMissiles = Object.keys(MISSILES).filter((k) => MISSILES[k].unlock === this.selectedLevel);
    const newArms = ORDNANCE.filter((o) => o.unlock === this.selectedLevel);
    $('#mission-info').innerHTML = `
      <h3>Niveau ${this.selectedLevel} — ${L.name}</h3>
      <p class="theme">${THEMES[L.theme].name}${THEMES[L.theme].night ? ' · nocturne' : ''} · Objectif final : <b>${BOSSES[L.boss].name}</b></p>
      <p>${L.brief}</p>
      <p class="threat">Menaces : ${lp.missiles.map((k) => MISSILES[k].name.split('«')[0].trim()).join(', ')}</p>
      ${newMissiles.length ? `<p class="new">⚠ Nouveau : ${newMissiles.map((k) => MISSILES[k].name).join(', ')}</p>` : ''}
      ${newArms.length ? `<p class="newarm">★ Nouvelle arme : ${newArms.map((o) => o.name).join(', ')}</p>` : ''}
      ${s.best[this.selectedLevel] ? `<p class="best">Meilleur score : ${U.fmt(s.best[this.selectedLevel])}</p>` : ''}`;
  },

  buildCodex() {
    const fx = {
      rocket: 'Vole en ligne droite. Faible blindage. Impact léger.',
      homing: 'Poursuit votre avion. Alerte « MISSILE VERROUILLÉ ». Impact moyen.',
      cluster: 'Se divise en 6 roquettes à l\'approche. Abattez-le de loin !',
      hyper: 'Une ligne rouge annonce sa trajectoire, puis il traverse l\'écran à vitesse extrême. Esquivez !',
      fire: 'Impact incendiaire : votre avion brûle et perd de la coque pendant plusieurs secondes.',
      emp: 'Impact IEM : armes et bouclier brouillés pendant 2,6 s.',
      swarm: 'Arrivent par groupes de 5, très agiles mais fragiles.',
      heavy: 'Très résistante et lente. Son explosion blesse même si elle est abattue trop près.',
    };
    $('#intel-pane').innerHTML = Object.keys(MISSILES)
      .map((k) => {
        const m = MISSILES[k];
        return `<div class="intel"><img src="${spriteURL('m_' + k, 56, Math.PI / 2)}" alt=""><div><b>${m.name}</b><small>Apparition : niveau ${m.unlock} · Dégâts ${m.dmg} · Blindage ${m.hp}</small><p>${fx[k]}</p></div></div>`;
      })
      .join('');
  },

  animatePreview(canvas) {
    const ctx = canvas.getContext('2d');
    let t = 0;
    const loop = () => {
      if (this.current !== 'hangar') {
        requestAnimationFrame(loop);
        return;
      }
      t += 1 / 60;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // plateforme
      const g = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.48);
      g.addColorStop(0, 'rgba(90,170,255,0.25)');
      g.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,200,255,0.25)';
      ctx.lineWidth = 1;
      for (let r = 40; r < w * 0.5; r += 30) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.55, r, r * 0.9, 0, 0, TAU);
        ctx.stroke();
      }
      const spr = Sprites.list.player;
      const rot = Math.sin(t * 0.6) * 0.5;
      const bank = Math.sin(t * 0.9) * 0.35;
      const s = (h * 0.8) / spr.h;
      ctx.save();
      ctx.translate(w / 2 + 26, h * 0.55 + 30);
      ctx.rotate(rot);
      ctx.scale(s * (1 - Math.abs(bank) * 0.3), s);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(spr.shadow, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.restore();
      ctx.save();
      ctx.translate(w / 2, h * 0.52);
      ctx.rotate(rot);
      ctx.scale(s * (1 - Math.abs(bank) * 0.3), s);
      ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.restore();
      requestAnimationFrame(loop);
    };
    loop();
  },
};
