'use strict';
// ---------------------------------------------------------------------------
// Données : armement du joueur, améliorations du hangar, missiles ennemis,
// unités ennemies et définition des 20 niveaux.
// ---------------------------------------------------------------------------

// Canon principal (clic gauche). Le niveau évolue dans le hangar.
// pattern : [décalage x, angle en degrés] pour chaque tube.
const GUN_LEVELS = [
  { name: 'Canon M61 Vulcan', rate: 9, dmg: 10, speed: 1350, heat: 2.2, kind: 'bullet', pattern: [[0, 0]], cost: 0 },
  { name: 'Canons jumelés', rate: 10, dmg: 10, speed: 1350, heat: 2.4, kind: 'bullet', pattern: [[-7, 0], [7, 0]], cost: 400 },
  { name: 'Canons jumelés cadence +', rate: 14, dmg: 11, speed: 1450, heat: 2.2, kind: 'bullet', pattern: [[-7, 0], [7, 0]], cost: 900 },
  { name: 'Triple dispersion', rate: 13, dmg: 12, speed: 1450, heat: 2.6, kind: 'bullet', pattern: [[-8, -4], [0, 0], [8, 4]], cost: 1600 },
  { name: 'Salve pentagonale', rate: 13, dmg: 12, speed: 1500, heat: 2.8, kind: 'bullet', pattern: [[-14, -10], [-7, -4], [0, 0], [7, 4], [14, 10]], cost: 2500 },
  { name: 'Canons lourds 30 mm', rate: 14, dmg: 16, speed: 1600, heat: 2.8, kind: 'heavy', pattern: [[-16, -9], [-7, -3], [0, 0], [7, 3], [16, 9]], wing: true, cost: 3800 },
  { name: 'Laser à impulsions', rate: 15, dmg: 20, speed: 2100, heat: 2.6, kind: 'laser', pierce: 2, pattern: [[-18, -7], [-8, -2], [0, 0], [8, 2], [18, 7]], wing: true, cost: 5500 },
  { name: 'Canon à plasma', rate: 14, dmg: 30, speed: 1500, heat: 2.5, kind: 'plasma', pierce: 3, pattern: [[-20, -9], [-9, -3], [0, 0], [9, 3], [20, 9]], wing: true, cost: 8000 },
];

// Améliorations du hangar. value(l) donne la valeur pour le niveau l.
const UPGRADES = {
  gun: { name: 'Canon principal', icon: '🔫', max: GUN_LEVELS.length - 1, desc: (l) => GUN_LEVELS[l].name },
  armor: {
    name: 'Blindage',
    icon: '🛡️',
    max: 6,
    costs: [400, 750, 1450, 2300, 3600, 5200],
    value: (l) => 100 + l * 30,
    desc: (l) => `Coque : ${100 + l * 30} PV`,
  },
  shield: {
    name: 'Bouclier énergétique',
    icon: '💠',
    max: 5,
    costs: [650, 1300, 2200, 3600, 5200],
    value: (l) => [0, 35, 60, 90, 125, 165][l],
    desc: (l) => (l === 0 ? 'Aucun bouclier' : `Bouclier : ${[0, 35, 60, 90, 125, 165][l]} pts, régénération`),
  },
  cooling: {
    name: 'Refroidissement',
    icon: '❄️',
    max: 5,
    costs: [350, 700, 1400, 2300, 3850],
    value: (l) => 32 + l * 13,
    desc: (l) => `Dissipation : ${32 + l * 13} °/s`,
  },
  engine: {
    name: 'Réacteur',
    icon: '🔥',
    max: 5,
    costs: [300, 600, 1200, 2100, 3300],
    value: (l) => 900 + l * 140,
    desc: (l) => `Vitesse max : ${900 + l * 140} km/h`,
  },
  bay: {
    name: 'Soute à munitions',
    icon: '📦',
    max: 5,
    costs: [450, 900, 1650, 2750, 4400],
    value: (l) => 1 + l * 0.3,
    desc: (l) => `Capacité : x${(1 + l * 0.3).toFixed(1)}`,
  },
  magnet: {
    name: 'Collecteur',
    icon: '🧲',
    max: 3,
    costs: [300, 850, 1950],
    value: (l) => 60 + l * 90,
    desc: (l) => `Rayon de collecte : ${60 + l * 90} m`,
  },
};

// Armes secondaires (clic droit), changées avec la molette.
// target : 'ground' (explose au sol), 'air' (guidé air-air), 'all'
const ORDNANCE = [
  {
    id: 'mk82',
    name: 'Bombe Mk-82',
    short: 'MK-82',
    desc: 'Bombe à chute libre de 250 kg. Détruit les cibles au sol.',
    unlock: 1,
    ammo: 14,
    cooldown: 0.32,
    color: '#d9c27a',
  },
  {
    id: 'aam',
    name: 'Missile air-air AIM-9',
    short: 'AIM-9',
    desc: 'Missile à guidage infrarouge. Verrouille la cible aérienne la plus proche.',
    unlock: 1,
    ammo: 12,
    cooldown: 0.22,
    color: '#ffffff',
  },
  {
    id: 'cluster',
    name: 'Bombe à sous-munitions',
    short: 'CBU-87',
    desc: 'Libère 10 sous-munitions qui saturent une large zone au sol.',
    unlock: 2,
    ammo: 6,
    cooldown: 0.6,
    color: '#ffb347',
  },
  {
    id: 'napalm',
    name: 'Napalm',
    short: 'NAPALM',
    desc: 'Crée un tapis de flammes qui brûle les blindés pendant plusieurs secondes.',
    unlock: 3,
    ammo: 5,
    cooldown: 0.8,
    color: '#ff6a00',
  },
  {
    id: 'agm',
    name: 'Salve AGM-114 Hellfire',
    short: 'HELLFIRE',
    desc: '4 missiles guidés anti-blindés qui frappent chacun une cible au sol.',
    unlock: 4,
    ammo: 6,
    cooldown: 0.7,
    color: '#9acd32',
  },
  {
    id: 'emp',
    name: 'Bombe IEM',
    short: 'IEM',
    desc: 'Onde électromagnétique : détruit tous les missiles ennemis et paralyse les unités.',
    unlock: 5,
    ammo: 3,
    cooldown: 1.5,
    color: '#4fd8ff',
  },
  {
    id: 'thermo',
    name: 'Bombe thermobarique',
    short: 'THERMO',
    desc: 'Explosion à dépression gigantesque. Ravage le sol et le ciel.',
    unlock: 6,
    ammo: 2,
    cooldown: 2,
    color: '#ff3d3d',
  },
  {
    id: 'nuke',
    name: 'Ogive tactique « Soleil »',
    short: 'SOLEIL',
    desc: 'Arme ultime. Anéantit tout ce qui se trouve à l\'écran.',
    unlock: 7,
    ammo: 1,
    cooldown: 4,
    color: '#fff36b',
  },
];

// Missiles ennemis : chacun a un comportement et un impact différents.
const MISSILES = {
  rocket: {
    name: 'Roquette S-8',
    hp: 8,
    speed: 360,
    turn: 0,
    dmg: 12,
    r: 8,
    life: 6,
    impact: 'small',
    score: 40,
    credits: 3,
    unlock: 1,
  },
  homing: {
    name: 'Missile guidé « Vipère »',
    hp: 14,
    speed: 300,
    turn: 2.0,
    dmg: 18,
    r: 9,
    life: 7,
    impact: 'medium',
    score: 80,
    credits: 6,
    unlock: 2,
  },
  cluster: {
    name: 'Missile à fragmentation « Hydre »',
    hp: 24,
    speed: 230,
    turn: 0.6,
    dmg: 14,
    r: 12,
    life: 8,
    impact: 'cluster',
    score: 120,
    credits: 9,
    unlock: 4,
  },
  hyper: {
    name: 'Missile hypersonique « Lance »',
    hp: 10,
    speed: 1150,
    turn: 0,
    dmg: 30,
    r: 8,
    life: 3,
    impact: 'big',
    score: 150,
    credits: 10,
    unlock: 6,
    warn: 1.0,
  },
  fire: {
    name: 'Missile incendiaire « Phénix »',
    hp: 18,
    speed: 310,
    turn: 1.5,
    dmg: 10,
    r: 10,
    life: 7,
    impact: 'fire',
    score: 110,
    credits: 8,
    unlock: 7,
  },
  emp: {
    name: 'Missile brouilleur IEM',
    hp: 16,
    speed: 280,
    turn: 1.3,
    dmg: 8,
    r: 10,
    life: 7,
    impact: 'emp',
    score: 120,
    credits: 9,
    unlock: 9,
  },
  swarm: {
    name: 'Micro-missiles « Essaim »',
    hp: 4,
    speed: 430,
    turn: 3.6,
    dmg: 6,
    r: 6,
    life: 3.2,
    impact: 'tiny',
    score: 25,
    credits: 2,
    unlock: 11,
  },
  heavy: {
    name: 'Torpille aérienne « Titan »',
    hp: 80,
    speed: 150,
    turn: 0.7,
    dmg: 45,
    r: 16,
    life: 14,
    impact: 'huge',
    score: 300,
    credits: 25,
    unlock: 13,
  },
};

// Unités ennemies (air et sol).
const UNITS = {
  // --- aériennes ---
  fighter: { air: true, hp: 45, r: 34, score: 150, credits: 18, unlock: 1, sprite: 'fighter' },
  drone: { air: true, hp: 16, r: 20, score: 70, credits: 8, unlock: 3, sprite: 'drone' },
  heli: { air: true, hp: 95, r: 40, score: 260, credits: 28, unlock: 3, sprite: 'heli' },
  interceptor: { air: true, hp: 70, r: 34, score: 260, credits: 30, unlock: 8, sprite: 'interceptor' },
  bomber: { air: true, hp: 320, r: 90, score: 700, credits: 80, unlock: 6, sprite: 'bomber' },
  ace: { air: true, hp: 180, r: 34, score: 600, credits: 70, unlock: 14, sprite: 'ace' },
  // --- au sol ---
  tank: { air: false, hp: 60, r: 26, score: 200, credits: 22, unlock: 1, sprite: 'tank' },
  sam: { air: false, hp: 70, r: 28, score: 280, credits: 30, unlock: 1, sprite: 'sam' },
  flak: { air: false, hp: 85, r: 26, score: 260, credits: 28, unlock: 2, sprite: 'flak' },
  radar: { air: false, hp: 55, r: 28, score: 350, credits: 40, unlock: 4, sprite: 'radar' },
  bunker: { air: false, hp: 170, r: 36, score: 450, credits: 50, unlock: 5, sprite: 'bunker' },
  frigate: { air: false, hp: 260, r: 60, score: 800, credits: 90, unlock: 1, sprite: 'frigate', naval: true },
  boat: { air: false, hp: 50, r: 26, score: 180, credits: 20, unlock: 1, sprite: 'boat', naval: true },
};

// Thèmes visuels des niveaux
const THEMES = {
  desert: { name: 'Désert', water: 0, clouds: 0.25, night: false, camo: 'desert' },
  canyon: { name: 'Canyon', water: 0.18, clouds: 0.2, night: false, camo: 'desert' },
  coast: { name: 'Côte', water: 0.55, clouds: 0.4, night: false, camo: 'green' },
  ocean: { name: 'Océan', water: 0.92, clouds: 0.45, night: false, camo: 'navy' },
  jungle: { name: 'Jungle', water: 0.12, clouds: 0.55, night: false, camo: 'green' },
  mountains: { name: 'Montagnes', water: 0.08, clouds: 0.65, night: false, camo: 'green' },
  arctic: { name: 'Arctique', water: 0.25, clouds: 0.5, night: false, camo: 'snow' },
  city: { name: 'Ville', water: 0, clouds: 0.3, night: false, camo: 'urban' },
  citynight: { name: 'Ville de nuit', water: 0, clouds: 0.25, night: true, camo: 'urban' },
  volcano: { name: 'Volcan', water: 0, clouds: 0.35, night: false, camo: 'dark' },
  base: { name: 'Base Oméga', water: 0, clouds: 0.2, night: false, camo: 'dark' },
  basenight: { name: 'Base Oméga (nuit)', water: 0, clouds: 0.2, night: true, camo: 'dark' },
};

// Les 20 niveaux. boss : type de boss final ; sinon mini-boss.
const LEVELS = [
  { name: 'Opération Mirage', theme: 'desert', brief: 'Première sortie. Vous disposez de la bombe Mk-82 et du missile AIM-9. Abattez les roquettes et détruisez les blindés.', boss: 'mini_launcher' },
  { name: 'Tempête de sable', theme: 'desert', brief: 'Bombes à sous-munitions débloquées. Des missiles guidés « Vipère » ont été repérés.', boss: 'mini_gunship' },
  { name: 'Les gorges rouges', theme: 'canyon', brief: 'Napalm débloqué. La DCA ennemie s\'est retranchée dans le canyon.', boss: 'mini_launcher' },
  { name: 'Tête de pont', theme: 'coast', brief: 'Missiles Hellfire débloqués : ils frappent 4 cibles au sol à la fois. Appuyez le débarquement.', boss: 'mini_destroyer' },
  { name: 'Le Kraken', theme: 'ocean', brief: 'Bombe IEM débloquée. Un cuirassé lance-missiles géant menace la flotte. Coulez-le !', boss: 'battleship' },
  { name: 'Enfer vert', theme: 'jungle', brief: 'Bombe thermobarique débloquée. Missiles hypersoniques « Lance » détectés : surveillez les lignes rouges.', boss: 'mini_gunship' },
  { name: 'Le fleuve', theme: 'jungle', brief: 'Ogive tactique « Soleil » débloquée : tout votre arsenal est disponible. Attention aux missiles « Phénix ».', boss: 'mini_launcher' },
  { name: 'Cols d\'altitude', theme: 'mountains', brief: 'Des intercepteurs patrouillent les cols.', boss: 'mini_gunship' },
  { name: 'Nid d\'aigle', theme: 'mountains', brief: 'Les missiles brouilleurs IEM paralysent vos armes. Abattez-les avant l\'impact.', boss: 'mini_launcher' },
  { name: 'Forteresse volante', theme: 'arctic', brief: 'Un bombardier géant escorté traverse l\'Arctique. Interceptez-le !', boss: 'fortress' },
  { name: 'Banquise', theme: 'arctic', brief: 'Les essaims de micro-missiles arrivent : gardez la bombe IEM sous la main.', boss: 'mini_gunship' },
  { name: 'Black-out', theme: 'citynight', brief: 'Raid nocturne sur la capitale ennemie. Les tirs illuminent le ciel.', boss: 'mini_launcher' },
  { name: 'Rues de feu', theme: 'city', brief: 'Les torpilles aériennes « Titan » sont lourdes mais dévastatrices.', boss: 'mini_gunship' },
  { name: 'Quartier général', theme: 'city', brief: 'Les as ennemis entrent en jeu.', boss: 'mini_launcher' },
  { name: 'La Citadelle', theme: 'city', brief: 'Rasez la citadelle fortifiée et ses batteries de missiles.', boss: 'citadel' },
  { name: 'Cendres', theme: 'volcano', brief: 'Survolez la zone volcanique. Les défenses s\'intensifient.', boss: 'mini_gunship' },
  { name: 'Cœur de magma', theme: 'volcano', brief: 'Les défenses volcaniques s\'intensifient. Utilisez l\'ogive « Soleil » avec sagesse.', boss: 'mini_launcher' },
  { name: 'Périmètre Oméga', theme: 'base', brief: 'Percez les défenses de la base secrète.', boss: 'mini_gunship' },
  { name: 'Nuit noire', theme: 'basenight', brief: 'Dernière ligne de défense avant le prototype. Tout l\'arsenal ennemi est déployé.', boss: 'mini_launcher' },
  { name: 'Prototype Oméga', theme: 'base', brief: 'L\'aile volante Oméga décolle. Détruisez-la pour mettre fin à la guerre.', boss: 'omega' },
];

const BOSSES = {
  battleship: { name: 'Cuirassé « Kraken »', hp: 2600, ground: true, desc: 'Croiseur lance-missiles · 4 tourelles · 2 lanceurs verticaux' },
  fortress: { name: 'Forteresse volante « Albatros »', hp: 4200, ground: false, desc: 'Bombardier stratégique · 5 tourelles · torpilles Titan' },
  citadel: { name: 'Citadelle « Bastion »', hp: 5600, ground: true, desc: 'Forteresse terrestre · batteries SAM · DCA lourde' },
  omega: { name: 'Prototype « Oméga »', hp: 9000, ground: false, desc: 'Aile volante expérimentale · arme ultime du Front' },
  mini_gunship: { name: 'Hélicoptère lourd « Goliath »', hp: 900, ground: false, desc: 'Hélicoptère d\'assaut blindé' },
  mini_launcher: { name: 'Lance-missiles mobile « Scorpion »', hp: 800, ground: true, desc: 'Batterie mobile · cible au sol' },
  mini_destroyer: { name: 'Destroyer « Requin »', hp: 1300, ground: true, desc: 'Escorteur lance-missiles · cible navale' },
};

// Paramètres dérivés pour un niveau (1..20)
function levelParams(n) {
  const def = LEVELS[n - 1];
  const theme = THEMES[def.theme];
  const naval = theme.water > 0.5;
  const missiles = Object.keys(MISSILES).filter((k) => MISSILES[k].unlock <= n);
  const air = Object.keys(UNITS).filter((k) => UNITS[k].air && UNITS[k].unlock <= n);
  let ground = Object.keys(UNITS).filter((k) => !UNITS[k].air && UNITS[k].unlock <= n);
  if (naval) ground = ['frigate', 'boat'];
  else ground = ground.filter((k) => !UNITS[k].naval);
  if (def.theme === 'coast') ground.push('boat');
  return {
    n,
    def,
    theme,
    themeId: def.theme,
    duration: 70 + n * 3.5,
    hpMul: 1 + (n - 1) * 0.11,
    dmgMul: 1 + (n - 1) * 0.045,
    rate: 1 + (n - 1) * 0.085,
    missiles,
    air,
    ground,
    naval,
    scroll: 85 + Math.min(n, 15) * 2,
  };
}
