'use strict';
// ---------------------------------------------------------------------------
// Audio synthétisé avec WebAudio : aucun fichier son externe requis.
// ---------------------------------------------------------------------------

const SFX = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  noiseBuf: null,
  engine: null,
  volume: 0.7,
  musicVolume: 0.35,
  lastPlay: {},
  music: null,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfxGain = c.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  },
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  },

  // Limite la fréquence de répétition d'un même son
  throttle(name, ms) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return false;
    this.lastPlay[name] = now;
    return true;
  },

  noise(dur, { type = 'lowpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.002, pan = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = U.clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    src.connect(f);
    f.connect(g);
    node.connect(this.sfxGain);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  },

  tone(dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.005, pan = 0, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = U.clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  panOf(x) {
    return ((x / VW) * 2 - 1) * 0.7;
  },

  // ---- effets sonores du jeu -------------------------------------------
  play(name, x = VW / 2, power = 1) {
    if (!this.ctx) return;
    const pan = this.panOf(x);
    switch (name) {
      case 'gun':
        if (!this.throttle('gun', 55)) return;
        this.noise(0.07, { type: 'bandpass', freq: 2600, freqEnd: 900, q: 0.8, gain: 0.16, pan });
        this.tone(0.06, { type: 'square', freq: 180, freqEnd: 60, gain: 0.05, pan });
        break;
      case 'laser':
        if (!this.throttle('laser', 60)) return;
        this.tone(0.12, { type: 'sawtooth', freq: 1400, freqEnd: 300, gain: 0.07, pan });
        break;
      case 'plasma':
        if (!this.throttle('plasma', 70)) return;
        this.tone(0.18, { type: 'sine', freq: 900, freqEnd: 120, gain: 0.12, pan });
        this.noise(0.1, { type: 'highpass', freq: 3000, gain: 0.05, pan });
        break;
      case 'enemyGun':
        if (!this.throttle('enemyGun', 90)) return;
        this.noise(0.06, { type: 'bandpass', freq: 1500, q: 1.2, gain: 0.07, pan });
        break;
      case 'bombDrop':
        this.tone(0.6, { type: 'sine', freq: 1200, freqEnd: 300, gain: 0.08, pan });
        break;
      case 'missile':
        if (!this.throttle('missile', 50)) return;
        this.noise(0.7, { type: 'bandpass', freq: 600, freqEnd: 2400, q: 0.7, gain: 0.22, attack: 0.02, pan });
        break;
      case 'enemyMissile':
        if (!this.throttle('enemyMissile', 120)) return;
        this.noise(0.5, { type: 'bandpass', freq: 500, freqEnd: 1800, q: 0.9, gain: 0.1, attack: 0.03, pan });
        break;
      case 'explosionSmall':
        if (!this.throttle('exS', 40)) return;
        this.noise(0.45, { type: 'lowpass', freq: 2200, freqEnd: 200, gain: 0.35 * power, pan });
        break;
      case 'explosion':
        if (!this.throttle('exM', 50)) return;
        this.noise(1.1, { type: 'lowpass', freq: 1500, freqEnd: 60, gain: 0.6 * power, pan });
        this.tone(0.8, { type: 'sine', freq: 90, freqEnd: 30, gain: 0.4 * power, pan });
        break;
      case 'explosionBig':
        this.noise(2.4, { type: 'lowpass', freq: 1200, freqEnd: 40, gain: 0.9, attack: 0.01, pan });
        this.tone(1.8, { type: 'sine', freq: 70, freqEnd: 22, gain: 0.7, pan });
        break;
      case 'nuke':
        this.noise(5, { type: 'lowpass', freq: 2500, freqEnd: 30, gain: 1, attack: 0.01 });
        this.tone(4, { type: 'sine', freq: 55, freqEnd: 18, gain: 0.9 });
        this.tone(2.5, { type: 'sawtooth', freq: 120, freqEnd: 30, gain: 0.15 });
        break;
      case 'emp':
        this.tone(1.2, { type: 'sawtooth', freq: 80, freqEnd: 2400, gain: 0.15, pan });
        this.tone(1.2, { type: 'square', freq: 2000, freqEnd: 60, gain: 0.07, pan });
        this.noise(1.0, { type: 'highpass', freq: 4000, gain: 0.12, pan });
        break;
      case 'napalm':
        this.noise(1.6, { type: 'bandpass', freq: 400, freqEnd: 150, q: 0.5, gain: 0.45, attack: 0.05, pan });
        break;
      case 'hit':
        if (!this.throttle('hit', 35)) return;
        this.tone(0.04, { type: 'square', freq: 900, freqEnd: 500, gain: 0.04, pan });
        break;
      case 'metalHit':
        if (!this.throttle('mhit', 60)) return;
        this.tone(0.08, { type: 'triangle', freq: 1600, freqEnd: 900, gain: 0.05, pan });
        break;
      case 'playerHit':
        if (!this.throttle('phit', 90)) return;
        this.noise(0.25, { type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.5 });
        this.tone(0.2, { type: 'square', freq: 140, freqEnd: 70, gain: 0.12 });
        break;
      case 'shieldHit':
        if (!this.throttle('shit', 90)) return;
        this.tone(0.25, { type: 'sine', freq: 1300, freqEnd: 500, gain: 0.12 });
        break;
      case 'pickup':
        this.tone(0.12, { type: 'triangle', freq: 880, gain: 0.15 });
        this.tone(0.18, { type: 'triangle', freq: 1320, gain: 0.15, delay: 0.07 });
        break;
      case 'coin':
        if (!this.throttle('coin', 50)) return;
        this.tone(0.1, { type: 'square', freq: 1760, gain: 0.05 });
        this.tone(0.14, { type: 'square', freq: 2350, gain: 0.05, delay: 0.05 });
        break;
      case 'switch':
        this.tone(0.06, { type: 'square', freq: 600, gain: 0.06 });
        this.tone(0.06, { type: 'square', freq: 900, gain: 0.06, delay: 0.05 });
        break;
      case 'empty':
        this.tone(0.1, { type: 'square', freq: 160, gain: 0.08 });
        break;
      case 'warning':
        if (!this.throttle('warn', 420)) return;
        this.tone(0.15, { type: 'square', freq: 1050, gain: 0.07 });
        this.tone(0.15, { type: 'square', freq: 1050, gain: 0.07, delay: 0.2 });
        break;
      case 'lock':
        if (!this.throttle('lock', 260)) return;
        this.tone(0.08, { type: 'sine', freq: 1900, gain: 0.08 });
        break;
      case 'overheat':
        this.noise(0.6, { type: 'highpass', freq: 3000, freqEnd: 800, gain: 0.15 });
        this.tone(0.5, { type: 'square', freq: 400, freqEnd: 120, gain: 0.08 });
        break;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(0.3, { type: 'triangle', freq: f, gain: 0.14, delay: i * 0.1 }));
        break;
      case 'boss':
        this.tone(1.6, { type: 'sawtooth', freq: 55, gain: 0.25 });
        this.tone(1.6, { type: 'sawtooth', freq: 58, gain: 0.25 });
        break;
      case 'click':
        this.tone(0.05, { type: 'triangle', freq: 1200, gain: 0.06 });
        break;
      case 'buy':
        this.tone(0.1, { type: 'triangle', freq: 990, gain: 0.12 });
        this.tone(0.2, { type: 'triangle', freq: 1480, gain: 0.12, delay: 0.08 });
        break;
      default:
        break;
    }
  },

  // ---- bruit moteur continu -----------------------------------------------
  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.0;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;
    const og = c.createGain();
    og.gain.value = 0.015;
    osc.connect(og);
    og.connect(g);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start();
    osc.start();
    g.gain.linearRampToValueAtTime(0.12, c.currentTime + 1);
    this.engine = { src, f, g, osc };
  },
  setEngine(throttle) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.f.frequency.setTargetAtTime(300 + throttle * 700, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(60 + throttle * 50, t, 0.1);
  },
  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => {
      try {
        e.src.stop();
        e.osc.stop();
      } catch (err) {
        /* déjà arrêté */
      }
    }, 600);
    this.engine = null;
  },

  // ---- musique procédurale simple (basse + percussions) --------------------
  startMusic(intensity = 0) {
    if (!this.ctx) return;
    this.stopMusic();
    const c = this.ctx;
    const bpm = 128 + intensity * 4;
    const step = 60 / bpm / 4;
    const scales = [
      [0, 3, 5, 7, 10],
      [0, 2, 3, 7, 8],
      [0, 3, 5, 6, 7],
    ];
    const scale = scales[intensity % scales.length];
    const root = [41.2, 43.65, 46.25, 49][intensity % 4];
    const pattern = [];
    for (let i = 0; i < 16; i++) pattern.push(Math.random() < 0.55 ? U.pick(scale) : null);
    pattern[0] = 0;
    pattern[8] = 0;
    let next = c.currentTime + 0.1;
    let idx = 0;
    const self = this;
    const timer = setInterval(() => {
      if (!self.ctx) return;
      while (next < self.ctx.currentTime + 0.25) {
        const s = idx % 16;
        const bar = Math.floor(idx / 16) % 4;
        const shift = [0, 0, 5, 3][bar];
        const n = pattern[s];
        if (n !== null) self.musicNote(next, root * Math.pow(2, (n + shift) / 12), step * 1.8);
        if (s % 4 === 0) self.kick(next);
        if (s % 8 === 4) self.snare(next);
        if (s % 2 === 1) self.hat(next);
        next += step;
        idx++;
      }
    }, 60);
    this.music = { timer };
  },
  musicNote(t, freq, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    f.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.25);
  },
  snare(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start(t, Math.random());
    s.stop(t + 0.2);
  },
  hat(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  },
  stopMusic() {
    if (this.music) {
      clearInterval(this.music.timer);
      this.music = null;
    }
  },
};
