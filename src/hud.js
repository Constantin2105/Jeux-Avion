'use strict';
// ---------------------------------------------------------------------------
// Affichage tête haute (HUD) dessiné sur le canvas.
// ---------------------------------------------------------------------------

const FONT = '"Rajdhani","Segoe UI","Arial Narrow",Arial,sans-serif';

const HUD = {
  icons: {},

  icon(id) {
    if (this.icons[id]) return this.icons[id];
    const name = { mk82: 'p_mk82', aam: 'p_aim', cluster: 'p_cluster', napalm: 'p_napalm', agm: 'p_agm', emp: 'p_emp', thermo: 'p_thermo', nuke: 'p_nuke' }[id];
    this.icons[id] = Sprites.list[name];
    return this.icons[id];
  },

  panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(8,14,22,0.62)';
    ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - 10);
    ctx.lineTo(x + w - 10, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },

  bar(ctx, x, y, w, h, frac, c1, c2, label, value) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * U.clamp(frac, 0, 1), h);
    // graduations
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + (w * i) / 10, y, 1, h);
    ctx.font = `600 13px ${FONT}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,225,245,0.85)';
    ctx.fillText(label, x, y - 2);
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w, y - 2);
  },

  draw(ctx, G) {
    const P = G.player;
    ctx.save();
    // --- vignette de dégâts ---
    const low = P.alive && P.hp < P.maxHp * 0.3;
    const dmgA = Math.max(G.damageFlash, low ? 0.25 + Math.sin(G.time * 6) * 0.12 : 0);
    if (dmgA > 0) {
      const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.65);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(200,0,0,${dmgA})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (P.empT > 0) {
      ctx.globalAlpha = Math.min(0.5, P.empT * 0.3);
      ctx.fillStyle = 'rgba(80,190,255,0.25)';
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * VH;
        ctx.fillRect(0, y, VW, Math.random() * 3 + 1);
      }
      ctx.globalAlpha = 1;
    }
    if (G.fx.empFlash > 0) {
      ctx.fillStyle = `rgba(120,210,255,${G.fx.empFlash * 0.25})`;
      ctx.fillRect(0, 0, VW, VH);
    }

    // --- réticules ---
    if (P.alive && (G.state === 'play' || G.state === 'boss' || G.state === 'bossWarn')) this.drawTargeting(ctx, G, P);

    // en mode cinématique (bandes noires), l'interface s'efface
    if (G.bars < 0.5) {
    // --- panneau gauche : coque, bouclier, température ---
    this.panel(ctx, 16, 14, 300, P.maxShield > 0 ? 136 : 102);
    let y = 44;
    const hpF = P.hp / P.maxHp;
    this.bar(ctx, 30, y, 272, 12, hpF, hpF < 0.3 ? '#ff2b2b' : '#ff8a3c', hpF < 0.3 ? '#ff6b6b' : '#7dff8a', 'COQUE', `${Math.ceil(P.hp)} / ${P.maxHp}`);
    y += 34;
    if (P.maxShield > 0) {
      this.bar(ctx, 30, y, 272, 10, P.shield / P.maxShield, '#2a7bff', '#6fe3ff', 'BOUCLIER', P.empT > 0 ? 'BROUILLÉ' : `${Math.ceil(P.shield)}`);
      y += 34;
    }
    const heatCol = P.overheated ? (Math.sin(G.time * 20) > 0 ? '#ff2020' : '#ffaa00') : '#ffb000';
    this.bar(ctx, 30, y, 272, 8, P.heat / 100, '#ffd84a', heatCol, P.overheated ? 'SURCHAUFFE !' : 'TEMP. CANON', P.boostT > 0 ? `SURCHARGE ${P.boostT.toFixed(1)}s` : `${Math.round(P.heat)}°`);
    // statuts
    let sx = 30;
    const sy = y + 24;
    const tag = (txt, col) => {
      ctx.font = `700 13px ${FONT}`;
      const w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = col;
      ctx.fillRect(sx, sy, w, 20);
      ctx.fillStyle = '#05080c';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, sx + 7, sy + 10.5);
      sx += w + 6;
    };
    if (P.empT > 0) tag(`ARMES BROUILLÉES ${P.empT.toFixed(1)}s`, '#4fd8ff');
    if (P.burnT > 0) tag(`EN FEU ${P.burnT.toFixed(1)}s`, '#ff7a1a');
    if (G.radarBoost) tag('RADAR ENNEMI ACTIF', '#ff4d4d');

    // --- panneau droit : score / crédits ---
    this.panel(ctx, VW - 276, 14, 260, 92);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(U.fmt(G.score), VW - 32, 50);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`${U.fmt(G.credits)} ¢`, VW - 32, 74);
    ctx.fillStyle = 'rgba(200,225,245,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', VW - 260, 50);
    ctx.fillText(`ABATTUS ${G.kills} · MISSILES ${G.missilesDown}`, VW - 260, 96);
    if (G.combo >= 5) {
      ctx.textAlign = 'right';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = '#ff9d2e';
      ctx.fillText(`SÉRIE ${G.combo}  x${G.comboMul().toFixed(1)}`, VW - 32, 128);
    }

    // --- haut centre : progression ou boss ---
    if (G.boss) {
      const b = G.boss;
      const w = 640;
      const x = VW / 2 - w / 2;
      this.panel(ctx, x - 14, 12, w + 28, 54);
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6b6b';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(b.name.toUpperCase() + (b.phase > 1 ? `  —  PHASE ${b.phase}` : ''), VW / 2, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, 42, w, 12);
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#ff2d55');
      g.addColorStop(1, '#ff9d2e');
      ctx.fillStyle = g;
      ctx.fillRect(x, 42, (w * b.hp) / b.maxHp, 12);
      if (b.parts.length) {
        ctx.font = `600 12px ${FONT}`;
        ctx.fillStyle = 'rgba(255,200,200,0.8)';
        ctx.fillText(`Systèmes d'armes : ${bossPartsAlive(b)} / ${b.parts.length}`, VW / 2, 80);
      }
      if (b.ground) {
        ctx.font = `600 13px ${FONT}`;
        ctx.fillStyle = '#ffd84a';
        ctx.fillText('CIBLE AU SOL : utilisez les bombes (clic droit)', VW / 2, b.parts.length ? 98 : 80);
      }
    } else {
      const w = 420;
      const x = VW / 2 - w / 2;
      ctx.font = `600 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(200,225,245,0.85)';
      ctx.fillText(`NIVEAU ${G.lp.n} · ${G.lp.def.name.toUpperCase()}`, VW / 2, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, 34, w, 5);
      ctx.fillStyle = '#7dd3ff';
      ctx.fillRect(x, 34, w * G.progress, 5);
      ctx.fillStyle = '#ff5050';
      ctx.fillRect(x + w - 3, 31, 3, 11);
    }

    // --- alerte missile ---
    if (G.lockWarning && Math.sin(G.time * 16) > 0) {
      ctx.font = `800 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff3030';
      ctx.fillText('▲ MISSILE VERROUILLÉ ▲', VW / 2, G.boss ? 130 : 72);
    }
    // indicateurs de menaces hors écran (en haut)
    for (const e of G.enemies) {
      if (e.cat !== 'missile' || e.warn > 0 || e.y > 0 || e.y < -260) continue;
      const a = 0.5 + 0.5 * Math.sin(G.time * 20);
      ctx.fillStyle = `rgba(255,60,60,${a})`;
      ctx.beginPath();
      const x = U.clamp(e.x, 20, VW - 20);
      ctx.moveTo(x, 8 + 14);
      ctx.lineTo(x - 9, 8);
      ctx.lineTo(x + 9, 8);
      ctx.closePath();
      ctx.fill();
    }

    // --- sélecteur d'armes (bas) ---
    this.drawWeapons(ctx, G, P);

    // --- canon (bas gauche) ---
    this.panel(ctx, 16, VH - 70, 260, 54);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(200,225,245,0.75)';
    ctx.fillText('CANON  [CLIC GAUCHE]', 30, VH - 48);
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${P.gun.name}  (Nv ${P.gunLevel + 1})`, 30, VH - 26);

    }

    // --- bandes cinéma + cartes de titre ---
    drawBars(ctx, G.bars);
    if (G.state === 'intro') this.drawMissionCard(ctx, G);
    if (G.bossIntro > 0 && G.boss) this.drawBossCard(ctx, G);

    // --- bannières ---
    for (const b of G.banners) {
      const t = b.t / b.dur;
      const a = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const big = b.sub || b.dur >= 2.5;
      ctx.font = `800 ${big ? 64 : 34}px ${FONT}`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(b.text, VW / 2 + 3, VH * 0.36 + 3);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, VW / 2, VH * 0.36);
      if (b.sub) {
        ctx.font = `600 26px ${FONT}`;
        ctx.fillStyle = 'rgba(230,240,255,0.9)';
        ctx.fillText(b.sub, VW / 2, VH * 0.36 + 56);
      }
    }
    ctx.globalAlpha = 1;

    // --- curseur ---
    if (P.alive && G.state !== 'outro') {
      const m = Input.mouse;
      ctx.strokeStyle = 'rgba(160,230,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, TAU);
      ctx.moveTo(m.x - 16, m.y);
      ctx.lineTo(m.x - 5, m.y);
      ctx.moveTo(m.x + 5, m.y);
      ctx.lineTo(m.x + 16, m.y);
      ctx.moveTo(m.x, m.y - 16);
      ctx.lineTo(m.x, m.y - 5);
      ctx.moveTo(m.x, m.y + 5);
      ctx.lineTo(m.x, m.y + 16);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawMissionCard(ctx, G) {
    const t = G.stateT;
    const a = U.clamp(t / 0.6, 0, 1) * U.clamp((INTRO_DUR - t) / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const x = 90;
    const y = VH * 0.3;
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(x, y - 70, 6, 150);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = '#ffb000';
    ctx.fillText(`MISSION ${String(G.lp.n).padStart(2, '0')} / ${LEVELS.length}  ·  ${G.lp.theme.name.toUpperCase()}`, x + 24, y - 40);
    ctx.font = `900 58px "Orbitron", ${FONT}`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(G.lp.def.name.toUpperCase(), x + 27, y + 23);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(G.lp.def.name.toUpperCase(), x + 24, y + 20);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(230,240,255,0.92)';
    const brief = typewriter(G.lp.def.brief, Math.max(0, t - 0.7), 55);
    // retour à la ligne simple
    const words = brief.split(' ');
    let line = '';
    let ly = y + 62;
    for (const w of words) {
      if (ctx.measureText(line + w).width > 640) {
        ctx.fillText(line, x + 24, ly);
        line = '';
        ly += 30;
      }
      line += w + ' ';
    }
    ctx.fillText(line, x + 24, ly);
    ctx.restore();
    // invite à passer
    ctx.font = `600 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('Clic pour passer ▸▸', VW - 24, VH - 34);
    // statut de la tour
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(160,230,255,0.75)';
    const st = t < 1 ? 'MOTEURS : PLEINE PUISSANCE' : t < 2.2 ? 'ROULAGE · V1 · ROTATION' : t < 3.6 ? 'DÉCOLLAGE · TRAIN RENTRÉ' : 'MONTÉE · CAP MISSION';
    ctx.fillText(`${G.carrier ? 'CATAPULTE' : 'PISTE 36'}  ·  ${st}`, 24, VH - 34);
  },

  drawBossCard(ctx, G) {
    const b = G.boss;
    const d = BOSSES[b.kind];
    const total = b.kind.startsWith('mini_') ? 2.6 : 4;
    const t = total - G.bossIntro;
    const a = U.clamp(t / 0.4, 0, 1) * U.clamp(G.bossIntro / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = '#ff5050';
    ctx.fillText('— CONTACT HOSTILE MAJEUR —', VW / 2, VH - 120);
    ctx.font = `900 46px "Orbitron", ${FONT}`;
    const w = 40 + t * 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(b.name.toUpperCase(), VW / 2 + 3, VH - 70 + 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.name.toUpperCase(), VW / 2, VH - 70);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = 'rgba(255,200,200,0.85)';
    ctx.fillText(d.desc || '', VW / 2, VH - 40 + Math.min(0, w * 0));
    ctx.restore();
  },

  drawWeapons(ctx, G, P) {
    const list = P.ordnance;
    if (!list.length) return;
    const sw = 82;
    const sh = 70;
    const gap = 6;
    const total = list.length * (sw + gap) - gap;
    const x0 = VW / 2 - total / 2;
    const y0 = VH - sh - 14;
    list.forEach((o, i) => {
      const x = x0 + i * (sw + gap);
      const sel = i === P.sel;
      ctx.fillStyle = sel ? 'rgba(30,60,90,0.85)' : 'rgba(8,14,22,0.62)';
      ctx.fillRect(x, y0, sw, sh);
      ctx.strokeStyle = sel ? o.color : 'rgba(120,200,255,0.2)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + 0.5, y0 + 0.5, sw - 1, sh - 1);
      if (sel) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = o.color;
        ctx.fillRect(x, y0, sw, 3);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      const spr = this.icon(o.id);
      if (spr) {
        ctx.save();
        ctx.translate(x + 22, y0 + 32);
        ctx.rotate(Math.PI / 4);
        const s = 34 / Math.max(spr.w, spr.h);
        ctx.globalAlpha = P.ammo[o.id] > 0 ? 1 : 0.3;
        ctx.drawImage(spr.c, (-spr.w * s) / 2, (-spr.h * s) / 2, spr.w * s, spr.h * s);
        ctx.restore();
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 22px ${FONT}`;
      ctx.fillStyle = P.ammo[o.id] > 0 ? '#ffffff' : '#ff5050';
      ctx.fillText(String(P.ammo[o.id]), x + sw - 8, y0 + 38);
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(200,225,245,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(o.short, x + sw / 2, y0 + sh - 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(200,225,245,0.5)';
      ctx.fillText(String(i + 1), x + 5, y0 + 13);
    });
    // nom de l'arme sélectionnée
    const o = P.selected;
    ctx.textAlign = 'center';
    ctx.font = `700 16px ${FONT}`;
    ctx.globalAlpha = 0.55 + Math.min(1, G.weaponFlash) * 0.45;
    ctx.fillStyle = o.color;
    ctx.fillText(`${o.name}  [CLIC DROIT · MOLETTE]`, VW / 2, y0 - 10);
    ctx.globalAlpha = 1;
  },

  drawTargeting(ctx, G, P) {
    const o = P.selected;
    if (!o) return;
    const groundBomb = { mk82: 95, cluster: 150, napalm: 70, thermo: 280, nuke: 400 }[o.id];
    if (groundBomb) {
      const { x, y } = predictImpact(P, o.id);
      // pendant la chute, le sol défile
      const r = Math.min(groundBomb, 160);
      ctx.save();
      ctx.strokeStyle = `${o.color}`;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -G.time * 30;
      ctx.beginPath();
      if (o.id === 'napalm') ctx.ellipse(x, y - 120, 40, 150, 0, 0, TAU);
      else ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
      ctx.restore();
    } else if (o.id === 'aam') {
      const t = findTarget(P.x, P.y, true);
      if (t) {
        const s = 26 + Math.sin(G.time * 10) * 3;
        ctx.save();
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(t.x - s, t.y - s, s * 2, s * 2);
        ctx.font = `700 11px ${FONT}`;
        ctx.fillStyle = '#ff4040';
        ctx.textAlign = 'center';
        ctx.fillText('VERROUILLÉ', t.x, t.y - s - 6);
        ctx.restore();
      }
    } else if (o.id === 'agm') {
      ctx.save();
      ctx.strokeStyle = '#9acd32';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      for (const t of findGroundTargets(4)) {
        const s = 18;
        ctx.beginPath();
        ctx.moveTo(t.x - s, t.y - s + 6);
        ctx.lineTo(t.x - s, t.y - s);
        ctx.lineTo(t.x - s + 6, t.y - s);
        ctx.moveTo(t.x + s - 6, t.y - s);
        ctx.lineTo(t.x + s, t.y - s);
        ctx.lineTo(t.x + s, t.y - s + 6);
        ctx.moveTo(t.x + s, t.y + s - 6);
        ctx.lineTo(t.x + s, t.y + s);
        ctx.lineTo(t.x + s - 6, t.y + s);
        ctx.moveTo(t.x - s + 6, t.y + s);
        ctx.lineTo(t.x - s, t.y + s);
        ctx.lineTo(t.x - s, t.y + s - 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
};
