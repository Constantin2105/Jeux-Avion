'use strict';
// ---------------------------------------------------------------------------
// Démarrage : canvas, entrées, boucle principale, scène de fond du menu.
// ---------------------------------------------------------------------------

const View = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };

const Input = {
  mouse: { x: VW / 2, y: VH * 0.75, left: false, right: false },
  init(canvas) {
    const toWorld = (e) => {
      this.mouse.x = U.clamp((e.clientX * View.dpr - View.ox) / View.scale, 0, VW);
      this.mouse.y = U.clamp((e.clientY * View.dpr - View.oy) / View.scale, 0, VH);
    };
    window.addEventListener('mousemove', toWorld);
    canvas.addEventListener('mousedown', (e) => {
      SFX.resume();
      toWorld(e);
      if (Cinema.active) {
        Cinema.skip();
        e.preventDefault();
        return;
      }
      if (G && G.state === 'intro') G.skipIntro();
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.release());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (G && !G.paused && G.player.alive) G.player.cycle(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (Cinema.active) {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') Cinema.skip();
        return;
      }
      if (!G) return;
      if (G.state === 'intro' && (e.key === ' ' || e.key === 'Enter')) G.skipIntro();
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (G.finished || !G.player.alive) return;
        if (G.paused) UI.resume();
        else UI.pause();
        return;
      }
      if (G.paused) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) G.player.select(n - 1);
      if (e.key === 'q' || e.key === 'Q' || e.key === 'a' || e.key === 'A') G.player.cycle(-1);
      if (e.key === 'e' || e.key === 'E') G.player.cycle(1);
    });
  },
  release() {
    this.mouse.left = false;
    this.mouse.right = false;
  },
};

function toggleFullscreen() {
  if (window.desktop && window.desktop.toggleFullscreen) window.desktop.toggleFullscreen();
  else if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// --- Scène de fond du menu : survol en boucle avec l'avion du joueur --------
const MenuScene = {
  terrain: null,
  clouds: null,
  D: 0,
  t: 0,
  theme: null,
  init(themeId = 'coast') {
    this.theme = themeId;
    this.terrain = new Terrain(themeId, 4242);
    this.clouds = new Clouds(0.6, false);
    this.D = 0;
  },
  update(dt) {
    this.t += dt;
    this.D += 120 * dt;
    this.terrain.update(this.D);
    this.clouds.update(dt, 120);
  },
  draw(ctx) {
    this.terrain.draw(ctx);
    this.clouds.drawShadows(ctx);
    const spr = Sprites.list.player;
    const x = VW * 0.72 + Math.sin(this.t * 0.5) * 120;
    const y = VH * 0.62 + Math.sin(this.t * 0.8) * 40;
    const bank = Math.cos(this.t * 0.5) * 0.6;
    const sx = 1 - Math.abs(bank) * 0.28;
    Sprites.drawShadow(ctx, spr, x + 110, y + 140, 0, 1.5, 0.3, sx);
    ctx.globalCompositeOperation = 'lighter';
    for (const ex of [-4.6, 4.6]) {
      const f = 34 * (0.85 + Math.random() * 0.3);
      ctx.drawImage(Glow.get(255, 150, 60), x + ex * 1.6 * sx - f, y + 84 - f * 0.5, f * 2, f * 2.4);
    }
    ctx.globalCompositeOperation = 'source-over';
    Sprites.draw(ctx, spr, x, y, 0, 1.6, 1, sx);
    // ailiers
    for (const [ox, oy] of [
      [-190, 150],
      [170, 190],
    ]) {
      Sprites.drawShadow(ctx, spr, x + ox + 80, y + oy + 110, 0, 1.1, 0.25, sx);
      Sprites.draw(ctx, spr, x + ox, y + oy, 0, 1.15, 1, sx);
    }
    this.clouds.draw(ctx);
    Post.apply(ctx, 'coast', this.t);
    // assombrissement léger pour la lisibilité du menu
    const g = ctx.createLinearGradient(0, 0, VW, 0);
    g.addColorStop(0, 'rgba(4,8,14,0.85)');
    g.addColorStop(0.5, 'rgba(4,8,14,0.35)');
    g.addColorStop(1, 'rgba(4,8,14,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  },
};

// --- Boucle principale ----------------------------------------------------
(function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  function resize() {
    View.dpr = Math.min(2, window.devicePixelRatio || 1);
    View.w = Math.floor(window.innerWidth * View.dpr);
    View.h = Math.floor(window.innerHeight * View.dpr);
    canvas.width = View.w;
    canvas.height = View.h;
    View.scale = Math.min(View.w / VW, View.h / VH);
    View.ox = (View.w - VW * View.scale) / 2;
    View.oy = (View.h - VH * View.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  Sprites.init();
  CloudSprites.init();
  Input.init(canvas);
  MenuScene.init();
  UI.init();

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020407';
    ctx.fillRect(0, 0, View.w, View.h);
    ctx.setTransform(View.scale, 0, 0, View.scale, View.ox, View.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.clip();
    if (Cinema.active) {
      Cinema.update(dt);
      if (Cinema.active) Cinema.draw(ctx);
    } else if (G) {
      if (!G.paused) G.update(dt);
      G.draw(ctx);
    } else {
      MenuScene.update(dt);
      MenuScene.draw(ctx);
    }
    ctx.restore();
    canvas.style.cursor = Cinema.active || (G && !G.paused && !G.finished) ? 'none' : 'default';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
