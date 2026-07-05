// ═══════════════════════════════════════════════════════════════════════════
// krieger.js — Kaffee-Krieger RPG: Ausrüstung, Gegner, Dungeon-Karte, Kampf-Client
// Nutzt _tileRng/_kRng/_karteWorldSeed aus karte.js (muss VOR dieser Datei laden).
// ═══════════════════════════════════════════════════════════════════════════

const KRIEGER_WORLD      = 150;
const KRIEGER_START_X    = 75;
const KRIEGER_START_Y    = 75;
const KRIEGER_TILE       = 20;
const KRIEGER_GIMMICK_P  = 0.25;   // Fundchance pro neuem Feld
const KRIEGER_ENEMY_P    = 0.12;   // Encounter-Chance pro neuem Feld
const KRIEGER_GIMMICKS   = [
  { emoji:'🪙', cc: [1, 8] }, // Standard-Fund (CC)
];
// 🎁 Ausrüstungsfunde (2026-07-04, User-Idee): ~20% der Funde sind statt CC ein thematischer
// Ausrüstungsfund passend zum Slot — gewährt einen 50%-Rabatt-Gutschein auf den nächsten Kauf/
// Ausbau eines Items DIESES Slots (kulturunabhängig). Nur 1 Gutschein gleichzeitig aktiv (siehe
// kriegerExploreTile) — kein Stapeln, sonst normaler CC-Fund als Fallback.
const KRIEGER_VOUCHER_CHANCE = 0.2;
const KRIEGER_VOUCHER_FINDS = [
  { slot:'weapon',   emoji:'⚔️', name:'Altes Schwertteil entdeckt' },
  { slot:'weapon',   emoji:'⚔️', name:'Angerosteter Klingensplitter entdeckt' },
  { slot:'armor',    emoji:'🛡️', name:'Helmvisier entdeckt' },
  { slot:'armor',    emoji:'🛡️', name:'Verbeulter Brustpanzer-Rest entdeckt' },
  { slot:'talisman', emoji:'🧿', name:'Zerbrochener Talisman-Splitter entdeckt' },
];

// ── Tränke (Etappe 2, 2026-07-07) ─────────────────────────────────────────────
// Verbrauchsgegenstände, max. 1 pro Kampf. Effekt serverseitig in dungeon_fight
// (p_potion_key) — die keys MÜSSEN mit der SQL-CASE in migration_2026-07-07 übereinstimmen.
// Bestand lebt in dungeon_data.potions{key:anzahl}. Kaufbar im Shop UND seltener Dungeon-Fund.
const KRIEGER_POTIONS = [
  { key:'espresso',         icon:'☕', name:'Espresso',          cost:25, desc:'+30% ATK für diesen Kampf.' },
  { key:'latte',            icon:'🥛', name:'Latte Macchiato',   cost:25, desc:'+30% DEF für diesen Kampf.' },
  { key:'mokka',            icon:'🍫', name:'Mokka',             cost:30, desc:'+15 CRIT-Chance für diesen Kampf.' },
  { key:'coldbrew',         icon:'🧊', name:'Cold Brew',         cost:30, desc:'Sofort-Heilung: +50% Max-HP vor Kampfbeginn.' },
  { key:'ristretto_doppio', icon:'⚡', name:'Ristretto Doppio',  cost:40, desc:'Garantierter Bonus-Erstschlag in Runde 1.' },
  { key:'karamell',         icon:'🌰', name:'Karamell-Macchiato',cost:80, desc:'+15% ATK, +15% DEF und +8 CRIT gleichzeitig.' },
];
function kriegerPotionByKey(key) { return KRIEGER_POTIONS.find(p => p.key === key) || null; }
function kriegerPotionCount(dd, key) { return Math.max(0, (dd?.potions && dd.potions[key]) || 0); }

// Seltener Trank-Fund im Dungeon (analog KRIEGER_VOUCHER_FINDS) — bevorzugt günstige Tränke.
const KRIEGER_POTION_FIND_CHANCE = 0.18;   // Anteil der Fund-Felder, die einen Trank statt CC geben
const KRIEGER_POTION_FIND_POOL = ['espresso','latte','mokka','coldbrew','ristretto_doppio'];

// Eigener Welt-Seed, deterministisch aus dem bestehenden Karten-Seed abgeleitet —
// gleiche Karte für alle Gruppenmitglieder, aber anderes Layout als die Pixel-Karte.
function _kriegerWorldSeed() {
  return ((typeof _karteWorldSeed === 'function' ? _karteWorldSeed() : 1) + 7777777) >>> 0;
}

// ── Labyrinth-Generierung (Felsen/Pfade) ──────────────────────────────────────
// Statt eines reinen Fog-of-War auf offenem Gelände (wie die Pixel-Karte) hat der
// Dungeon feste, undurchquerbare Felswände — ein echtes Labyrinth. Generiert per
// Zellularautomat (klassische Höhlen-Generierung, "4-5-Regel") aus dem Welt-Seed,
// EINMAL pro Sitzung berechnet und gecacht (150×150 = 22.500 Zellen, < 10ms, aber
// kein Grund das bei jedem Render neu zu tun). Garantiert per Flood-Fill, dass Start
// und Boss-Feld immer verbunden sind — notfalls wird ein direkter Gang freigesprengt.
// Mauern sind dabei IMMER sichtbar (kein Fog) — nur der Boden-INHALT (Encounter/Fund)
// bleibt bis zum Betreten verborgen. Sonst wäre Navigation im Nebel reines Raten.
let _kriegerMazeCache = {};

function kriegerIsWall(x, y, worldSeed) {
  if (x <= 0 || y <= 0 || x >= KRIEGER_WORLD - 1 || y >= KRIEGER_WORLD - 1) return true; // Kartenrand = Fels
  const grid = _kriegerMazeGrid(worldSeed);
  return grid[y * KRIEGER_WORLD + x] === 1;
}

function _kriegerMazeGrid(worldSeed) {
  if (_kriegerMazeCache[worldSeed]) return _kriegerMazeCache[worldSeed];
  const N = KRIEGER_WORLD;
  const rng = _kRng((worldSeed ^ 0x4D617A65) >>> 0); // eigener PRNG-Strom, getrennt vom restlichen Welt-Seed
  let grid = new Uint8Array(N * N);

  // 1) Rausch-Initialisierung (~45% Wand), Kartenrand immer Fels
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      grid[y * N + x] = edge ? 1 : (rng() < 0.45 ? 1 : 0);
    }
  }

  // 2) Zellularautomat-Glättung für organische Gänge statt reinem Rauschen
  const countWallNeighbors = (g, x, y) => {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || g[ny * N + nx] === 1) c++;
    }
    return c;
  };
  for (let iter = 0; iter < 4; iter++) {
    const next = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      if (edge) { next[y * N + x] = 1; continue; }
      const wn = countWallNeighbors(grid, x, y);
      next[y * N + x] = wn >= 5 ? 1 : (wn <= 2 ? 0 : grid[y * N + x]);
    }
    grid = next;
  }

  // 3) Start- und Boss-Feld + 2-Tile-Puffer immer freiräumen (nie eingemauert)
  const clearArea = (cx, cy, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x > 0 && y > 0 && x < N - 1 && y < N - 1) grid[y * N + x] = 0;
    }
  };
  clearArea(KRIEGER_START_X, KRIEGER_START_Y, 2);
  clearArea(KRIEGER_BOSS_POS.x, KRIEGER_BOSS_POS.y, 2);

  // 4) Erreichbarkeit garantieren: Flood-Fill vom Start zum Boss-Feld, sonst direkten
  // Gang freisprengen — wichtiger als ein "perfektes" Labyrinth ist, dass es lösbar bleibt.
  if (!_kriegerFloodReaches(grid, N, KRIEGER_START_X, KRIEGER_START_Y, KRIEGER_BOSS_POS.x, KRIEGER_BOSS_POS.y)) {
    _kriegerCarveCorridor(grid, N, KRIEGER_START_X, KRIEGER_START_Y, KRIEGER_BOSS_POS.x, KRIEGER_BOSS_POS.y);
  }

  _kriegerMazeCache[worldSeed] = grid;
  return grid;
}

function _kriegerFloodReaches(grid, N, sx, sy, tx, ty) {
  const seen = new Uint8Array(N * N);
  const stack = [[sx, sy]];
  seen[sy * N + sx] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === tx && y === ty) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const idx = ny * N + nx;
      if (seen[idx] || grid[idx] === 1) continue;
      seen[idx] = 1;
      stack.push([nx, ny]);
    }
  }
  return false;
}

// Notfall-Verbindung: gerader Gang (erst X-, dann Y-Achse) zwischen zwei Punkten freiräumen.
function _kriegerCarveCorridor(grid, N, x1, y1, x2, y2) {
  let x = x1, y = y1;
  while (x !== x2) { grid[y * N + x] = 0; x += x2 > x ? 1 : -1; }
  while (y !== y2) { grid[y * N + x] = 0; y += y2 > y ? 1 : -1; }
  grid[y2 * N + x2] = 0;
}

// ── Ausrüstung (weapon/armor/talisman MÜSSEN exakt mit _krieger_item_stats /
// _krieger_item_culture in SQL übereinstimmen — die 3 Slots gehen in den serverseitigen
// Kampf ein. Der Slot 'feet' (Stiefel) ist eine reine Client-/Storage-Erweiterung: er
// beeinflusst nur kriegerStepsAllowed() hier im Frontend, dungeon_fight() liest ihn nicht,
// deshalb ist dafür KEINE SQL-Änderung nötig.) ──
const KRIEGER_ITEMS = [
  // ── Mittelalterlich (Tier 1: ab Stufe 1 · Tier 2 „Veredelt": ab Stufe 20) ──
  { key:'schwert_mittelalter_t1',  slot:'weapon',   culture:'mittelalter', tier:1, icon:'⚔️', name:'Langschwert',        cost:140, minLevel:1,  atk:8,  def:0,  crit:0 },
  { key:'ruestung_mittelalter_t1', slot:'armor',    culture:'mittelalter', tier:1, icon:'🛡️', name:'Kettenrüstung',      cost:150, minLevel:1,  atk:0,  def:8,  crit:0 },
  { key:'amulett_mittelalter_t1',  slot:'talisman', culture:'mittelalter', tier:1, icon:'🧿', name:'Wappenschild-Anhänger', cost:120, minLevel:1, atk:0, def:0, crit:4 },
  { key:'stiefel_mittelalter_t1',  slot:'feet',     culture:'mittelalter', tier:1, icon:'👢', name:'Wanderstiefel',      cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'schwert_mittelalter_t2',  slot:'weapon',   culture:'mittelalter', tier:2, icon:'⚔️', name:'Ritterschwert',      cost:420, minLevel:20, atk:22, def:0,  crit:0 },
  { key:'ruestung_mittelalter_t2', slot:'armor',    culture:'mittelalter', tier:2, icon:'🛡️', name:'Plattenrüstung',     cost:450, minLevel:20, atk:0,  def:22, crit:0 },
  { key:'amulett_mittelalter_t2',  slot:'talisman', culture:'mittelalter', tier:2, icon:'🧿', name:'Drachenwappen-Amulett', cost:380, minLevel:20, atk:0, def:0, crit:10 },
  { key:'stiefel_mittelalter_t2',  slot:'feet',     culture:'mittelalter', tier:2, icon:'👢', name:'Ritterstiefel',      cost:420, minLevel:20, atk:0,  def:0,  crit:0, steps:12 },

  // ── Europäisch ──
  { key:'rapier_europa_t1',        slot:'weapon',   culture:'europa', tier:1, icon:'🤺', name:'Rapier',           cost:150, minLevel:1,  atk:6,  def:0,  crit:2 },
  { key:'wams_europa_t1',          slot:'armor',    culture:'europa', tier:1, icon:'👘', name:'Samtwams',         cost:130, minLevel:1,  atk:0,  def:6,  crit:0 },
  { key:'siegelring_europa_t1',    slot:'talisman', culture:'europa', tier:1, icon:'💍', name:'Siegelring',       cost:120, minLevel:1,  atk:3,  def:3,  crit:0 },
  { key:'schuhe_europa_t1',        slot:'feet',     culture:'europa', tier:1, icon:'👞', name:'Lederschuhe',      cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'degen_europa_t2',         slot:'weapon',   culture:'europa', tier:2, icon:'🤺', name:'Hofdegen',         cost:480, minLevel:20, atk:18, def:0,  crit:6 },
  { key:'harnisch_europa_t2',      slot:'armor',    culture:'europa', tier:2, icon:'👘', name:'Brokat-Harnisch',  cost:420, minLevel:20, atk:0,  def:20, crit:0 },
  { key:'adelssiegel_europa_t2',   slot:'talisman', culture:'europa', tier:2, icon:'💍', name:'Adelssiegel',      cost:400, minLevel:20, atk:8,  def:8,  crit:4 },
  { key:'reitstiefel_europa_t2',   slot:'feet',     culture:'europa', tier:2, icon:'👞', name:'Reitstiefel',      cost:420, minLevel:20, atk:0,  def:0,  crit:0, steps:12 },

  // ── Orientalisch ──
  { key:'saebel_orient_t1',        slot:'weapon',   culture:'orient', tier:1, icon:'🗡️', name:'Krummsäbel',       cost:160, minLevel:1,  atk:10, def:-2, crit:0 },
  { key:'kaftan_orient_t1',        slot:'armor',    culture:'orient', tier:1, icon:'🧥', name:'Seidenkaftan',     cost:110, minLevel:1,  atk:0,  def:4,  crit:0 },
  { key:'basaramulett_orient_t1',  slot:'talisman', culture:'orient', tier:1, icon:'🧿', name:'Basar-Amulett',    cost:170, minLevel:1,  atk:0,  def:0,  crit:7 },
  { key:'sandalen_orient_t1',      slot:'feet',     culture:'orient', tier:1, icon:'🥿', name:'Basar-Sandalen',   cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'saebel_orient_t2',        slot:'weapon',   culture:'orient', tier:2, icon:'🗡️', name:'Damaszener-Säbel', cost:500, minLevel:20, atk:26, def:-4, crit:0 },
  { key:'kettenhemd_orient_t2',    slot:'armor',    culture:'orient', tier:2, icon:'🧥', name:'Seiden-Kettenhemd',cost:380, minLevel:20, atk:0,  def:12, crit:5 },
  { key:'wesiramulett_orient_t2',  slot:'talisman', culture:'orient', tier:2, icon:'🧿', name:'Wesir-Amulett',    cost:600, minLevel:20, atk:0,  def:0,  crit:18 },
  { key:'kamelstiefel_orient_t2',  slot:'feet',     culture:'orient', tier:2, icon:'🥿', name:'Karawanen-Stiefel',cost:420, minLevel:20, atk:0,  def:0,  crit:0, steps:12 },

  // ── Südamerikanisch ──
  { key:'keule_suedamerika_t1',    slot:'weapon',   culture:'suedamerika', tier:1, icon:'🏏', name:'Obsidian-Keule',  cost:140, minLevel:1,  atk:6,  def:2,  crit:0 },
  { key:'umhang_suedamerika_t1',   slot:'armor',    culture:'suedamerika', tier:1, icon:'🪶', name:'Federumhang',     cost:150, minLevel:1,  atk:0,  def:5,  crit:2 },
  { key:'sonnenscheibe_suedamerika_t1', slot:'talisman', culture:'suedamerika', tier:1, icon:'☀️', name:'Sonnenscheibe', cost:130, minLevel:1, atk:2, def:2, crit:2 },
  { key:'sandalen_suedamerika_t1', slot:'feet',     culture:'suedamerika', tier:1, icon:'🩴', name:'Naturfaser-Sandalen', cost:130, minLevel:1, atk:0, def:0, crit:0, steps:5 },
  { key:'keule_suedamerika_t2',    slot:'weapon',   culture:'suedamerika', tier:2, icon:'🏏', name:'Sonnenkeule',     cost:440, minLevel:20, atk:16, def:8,  crit:0 },
  { key:'umhang_suedamerika_t2',   slot:'armor',    culture:'suedamerika', tier:2, icon:'🪶', name:'Kondorumhang',    cost:460, minLevel:20, atk:0,  def:14, crit:6 },
  { key:'goldscheibe_suedamerika_t2', slot:'talisman', culture:'suedamerika', tier:2, icon:'☀️', name:'Goldene Sonnenscheibe', cost:480, minLevel:20, atk:8, def:8, crit:8 },
  { key:'kondorstiefel_suedamerika_t2', slot:'feet', culture:'suedamerika', tier:2, icon:'🩴', name:'Kondorfeder-Stiefel', cost:420, minLevel:20, atk:0, def:0, crit:0, steps:12 },

  // ── Tier 3 „Meisterlich" (ab Stufe 60) — 2 Waffen/Kultur: Pfad A klassisch, Pfad B mit Mechanik-Twist ──
  // KEIN Lock/Pfadzwang (JP-Entscheidung): beide frei kauf-/ausrüstbar. `mech` steuert serverseitige
  // Sonder-Logik in dungeon_fight (Waffen-Key-Prefix streitkolben/armbrust/wurfmesser/kriegsbogen) — die
  // Twist-Beschreibung ist reine UI-Vorschau, die Wirkung rechnet die RPC. Stats MÜSSEN mit
  // _krieger_item_stats() in migration_2026-07-08 übereinstimmen.
  { key:'schwert_mittelalter_t3',      slot:'weapon', culture:'mittelalter', tier:3, icon:'⚔️', name:'Zweihänder',      cost:780, minLevel:60, atk:34, def:0,  crit:0 },
  { key:'streitkolben_mittelalter_t3', slot:'weapon', culture:'mittelalter', tier:3, icon:'🔨', name:'Streitkolben',    cost:760, minLevel:60, atk:26, def:2,  crit:0, mech:'streitkolben', mechDesc:'Ignoriert 50% der gegnerischen Verteidigung.' },
  { key:'degen_europa_t3',             slot:'weapon', culture:'europa',      tier:3, icon:'🤺', name:'Meisterdegen',     cost:800, minLevel:60, atk:28, def:0,  crit:10 },
  { key:'armbrust_europa_t3',          slot:'weapon', culture:'europa',      tier:3, icon:'🏹', name:'Armbrust',         cost:760, minLevel:60, atk:20, def:0,  crit:6,  mech:'armbrust', mechDesc:'Garantierter Bonus-Erstschlag in Runde 1 (dafür niedrigerer Grund-ATK).' },
  { key:'saebel_orient_t3',            slot:'weapon', culture:'orient',      tier:3, icon:'🗡️', name:'Shamshir',        cost:800, minLevel:60, atk:38, def:-6, crit:0 },
  { key:'wurfmesser_orient_t3',        slot:'weapon', culture:'orient',      tier:3, icon:'🔪', name:'Wurfmesser-Set',   cost:780, minLevel:60, atk:20, def:0,  crit:8,  mech:'wurfmesser', mechDesc:'Mehrere kleine Treffer, jeder mit eigener CRIT-Chance (CRIT-Synergie).' },
  { key:'keule_suedamerika_t3',        slot:'weapon', culture:'suedamerika', tier:3, icon:'🏏', name:'Kriegskeule',     cost:780, minLevel:60, atk:26, def:12, crit:0 },
  { key:'kriegsbogen_suedamerika_t3',  slot:'weapon', culture:'suedamerika', tier:3, icon:'🏹', name:'Kriegsbogen',     cost:760, minLevel:60, atk:24, def:4,  crit:0,  mech:'kriegsbogen', mechDesc:'Bonus-Schaden gegen Gegner mit hoher Verteidigung.' },

  // ── Kaffeesatz-Lesen / Sicht (Etappe 4, Slot 'scan') — kulturunabhängig, KEINE Kampfwerte.
  // Deckt Feld-KATEGORIEN im Nebel auf (⚔️/🪙), nie exakte Belohnung. Rein clientseitig
  // (kein Eintrag in _krieger_item_stats nötig, da dungeon_fight sie nicht liest).
  { key:'kaffeeglas_scan', slot:'scan', culture:null, tier:1, icon:'🔍', name:'Kaffee-Glas',        cost:200, minLevel:20, atk:0, def:0, crit:0, scan:'line',    scanDesc:'Deckt 5 Felder in der zuletzt gelaufenen Richtung auf.' },
  { key:'wirbelsud_scan',  slot:'scan', culture:null, tier:2, icon:'🌀', name:'Wirbel-Sud',         cost:450, minLevel:40, atk:0, def:0, crit:0, scan:'ring',    scanDesc:'Deckt einen Ring bei Radius 3 um dich auf (aktualisiert sich beim Laufen).' },
  { key:'orakel_scan',     slot:'scan', culture:null, tier:3, icon:'🔮', name:'Kaffeesatz-Orakel',  cost:850, minLevel:60, atk:0, def:0, crit:0, scan:'checker', scanDesc:'Deckt jedes 2. Feld in Radius 6 auf — große, aber lückenhafte Sicht.' },
];

// ── Begleiter (4. Slot, Etappe 3) ─────────────────────────────────────────────
// Pro Kultur ein Begleittier mit passivem Kampf-Skill — bewusst NICHT Teil des 3-Slot-Set-Bonus
// (keine Regeländerung am bestehenden Set). Nur EINER gleichzeitig aktiv (dd.companion = key).
// Besitz in dd.owned (wie Items), Wirkung serverseitig in dungeon_fight (Key-basiert).
const KRIEGER_COMPANIONS = [
  { key:'falke_mittelalter', culture:'mittelalter', icon:'🦅', name:'Wappenfalke',    cost:600, minLevel:40, desc:'+10% CoffeeCoins nach jedem Sieg.' },
  { key:'pudel_europa',      culture:'europa',      icon:'🐩', name:'Salon-Pudel',    cost:600, minLevel:40, desc:'+10% EP nach jedem Sieg.' },
  { key:'kamel_orient',      culture:'orient',      icon:'🐪', name:'Karawanen-Kamel',cost:600, minLevel:40, desc:'+50% Trost-EP bei einer Niederlage.' },
  { key:'lama_suedamerika',  culture:'suedamerika', icon:'🦙', name:'Anden-Lama',     cost:600, minLevel:40, desc:'Heilt 2% Max-HP pro Kampfrunde.' },
];
function kriegerCompanionByKey(key) { return KRIEGER_COMPANIONS.find(c => c.key === key) || null; }
function kriegerActiveCompanion(dd) { return kriegerCompanionByKey(dd?.companion); }

// ── Reittiere (Slot 'mount', Etappe 5) ────────────────────────────────────────
// Erhöhen das tägliche Schritte-Budget (client, via kriegerStepsAllowed) UND geben einen
// kleinen Kampf-Boost (atk/def/crit), der serverseitig in dungeon_fight angewendet wird
// (Anti-Tamper: nur wenn im Besitz). Nur EINES aktiv (dd.mount). Nicht Teil des Set-Bonus.
// atk/def/crit MÜSSEN mit _krieger_mount_stats() in migration_2026-07-09 übereinstimmen.
const KRIEGER_MOUNTS = [
  { key:'pferd_mount',   icon:'🐴', name:'Streitross',  cost:700,  minLevel:30, steps:10, atk:5,  def:5,  crit:0, desc:'+10 Schritte/Tag · im Kampf +5 ATK & +5 DEF.' },
  { key:'pegasus_mount', icon:'🦄', name:'Pegasus',     cost:1000, minLevel:50, steps:12, atk:0,  def:12, crit:0, desc:'+12 Schritte/Tag · im Kampf +12 DEF.' },
  { key:'greif_mount',   icon:'🦅', name:'Greif',       cost:1100, minLevel:55, steps:14, atk:0,  def:0,  crit:8, desc:'+14 Schritte/Tag · im Kampf +8 CRIT-Chance.' },
  { key:'dino_mount',    icon:'🦖', name:'Ur-Saurier',  cost:1300, minLevel:70, steps:8,  atk:14, def:0,  crit:0, desc:'+8 Schritte/Tag · im Kampf +14 ATK.' },
];
function kriegerMountByKey(key) { return KRIEGER_MOUNTS.find(m => m.key === key) || null; }
function kriegerActiveMount(dd) { return kriegerMountByKey(dd?.mount); }
function kriegerMountStepBonus(dd) { const m = kriegerActiveMount(dd); return m?.steps || 0; }

// ── Kartografie A (Etappe 4): Fast-Travel — BFS über erkundete Felder ──────────
// 8-Nachbarschaft (Chebyshev), nur erkundete Felder; alle Kanten kostenlos → unweighted
// BFS liefert den kürzesten Pfad. Rein clientseitig (wie kriegerWalkBack), keine RPC.
function kriegerFindPath(fromPos, toPos, dd) {
  if (!kriegerIsExplored(toPos.x, toPos.y, dd)) return null;
  const key = (x, y) => `${x},${y}`;
  const start = key(fromPos.x, fromPos.y);
  if (start === key(toPos.x, toPos.y)) return [];
  const visited = new Set([start]);
  const queue = [[fromPos.x, fromPos.y]];
  const prev = {};
  const MAX_NODES = 30000; // Sicherheitsnetz (150×150-Welt)
  let steps = 0;
  while (queue.length && steps++ < MAX_NODES) {
    const [cx, cy] = queue.shift();
    if (cx === toPos.x && cy === toPos.y) {
      const path = [];
      let k = key(cx, cy);
      while (k !== start) { path.unshift(k); k = prev[k]; }
      return path.map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy, nk = key(nx, ny);
      if (visited.has(nk) || !kriegerIsExplored(nx, ny, dd)) continue;
      visited.add(nk); prev[nk] = key(cx, cy); queue.push([nx, ny]);
    }
  }
  return null;
}

// ── Kartografie B (Etappe 4): Kaffeesatz-Scouting — Read-only-Vorschau ──────────
// Identische RNG-Aufrufe wie kriegerExploreTile, aber OHNE jede Mutation (kein Explore,
// kein steps_today). Liefert nur die KATEGORIE, nie die exakte Belohnung/Flavor.
function kriegerPeekTile(tx, ty, worldSeed) {
  if (kriegerIsWall(tx, ty, worldSeed)) return null;
  if (tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y) return { type: 'boss' };
  const dist = Math.max(Math.abs(tx - KRIEGER_START_X), Math.abs(ty - KRIEGER_START_Y));
  const rEnc = _tileRng(tx, ty, 5151, worldSeed)();
  if (rEnc < KRIEGER_ENEMY_P) return { type: 'enemy', tier: kriegerTierForDistance(dist) };
  const rGim = _tileRng(tx, ty, 7373, worldSeed)();
  if (rGim < KRIEGER_GIMMICK_P) return { type: 'find' };
  return { type: 'empty' };
}

// Ausgerüstetes Sicht-Item (Slot 'scan') oder null.
function kriegerActiveScan(dd) {
  const item = kriegerItemByKey(dd?.equipped?.scan);
  return (item && item.scan) ? item : null;
}
// Felder, die das ausgerüstete Scan-Item aufdeckt (unbeschränkt; Render filtert auf Nebel+Viewport).
function kriegerScanTiles(dd) {
  const scan = kriegerActiveScan(dd);
  if (!scan) return [];
  const p = kriegerPos(dd);
  const out = [];
  const push = (x, y) => { if (x > 0 && x < KRIEGER_WORLD - 1 && y > 0 && y < KRIEGER_WORLD - 1) out.push({ x, y }); };
  if (scan.scan === 'line') {
    let dx = dd?.lastDir?.dx || 0, dy = dd?.lastDir?.dy || 0;
    if (dx === 0 && dy === 0) dx = 1; // Fallback: nach rechts, falls noch nie gelaufen
    for (let k = 1; k <= 5; k++) push(p.x + dx * k, p.y + dy * k);
  } else if (scan.scan === 'ring') {
    const r = 3;
    for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++) {
      if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) === r) push(x, y);
    }
  } else if (scan.scan === 'checker') {
    const r = 6;
    for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++) {
      const cd = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
      if (cd >= 1 && cd <= r && ((x + y) % 2 === 0)) push(x, y);
    }
  }
  return out;
}

const KRIEGER_CULTURE_NAMES = {
  mittelalter: '🛡️ Mittelalterlich',
  europa:      '🏰 Europäisch',
  orient:      '🌙 Orientalisch',
  suedamerika: '🦙 Südamerikanisch',
};

const KRIEGER_SET_BONUSES = {
  mittelalter: { name: 'Eisern',         desc: 'Erste 2 gegnerische Treffer pro Kampf −50% Schaden' },
  europa:      { name: 'Hofdiplomatie',  desc: 'Sieg gibt +20% CC' },
  orient:      { name: 'Wüstensturm',    desc: 'CRIT-Chance +10 Prozentpunkte' },
  suedamerika: { name: 'Sonnenkraft',    desc: 'Sieg gibt +20% EP' },
};

function kriegerItemsBySlot(slot) { return KRIEGER_ITEMS.filter(i => i.slot === slot); }
function kriegerItemByKey(key)    { return KRIEGER_ITEMS.find(i => i.key === key) || null; }

// Stiefel-Bonus (2026-07-05, User-Wunsch): ausgerüstetes 'feet'-Item erhöht das tägliche
// Dungeon-Schritte-Budget dauerhaft. Rein additiv zum +5-Sieg-Bonus aus _runKriegerFight —
// beide stapeln sich normal, da Sieg-Bonus die VERBRAUCHTEN Schritte senkt, Stiefel dagegen
// das ERLAUBTE Budget anheben.
function kriegerFeetBonus(dd) {
  const item = kriegerItemByKey(dd?.equipped?.feet);
  return item?.steps || 0;
}

// Aktives Set (3 gleichkultur. Items in weapon/armor/talisman) oder null
function kriegerActiveSetCulture(equipped) {
  if (!equipped?.weapon || !equipped?.armor || !equipped?.talisman) return null;
  const w = kriegerItemByKey(equipped.weapon), a = kriegerItemByKey(equipped.armor), t = kriegerItemByKey(equipped.talisman);
  if (w && a && t && w.culture === a.culture && a.culture === t.culture) return w.culture;
  return null;
}

// ── Gegner (MUSS exakt mit _krieger_enemy_stats in SQL übereinstimmen) ──────
// CC-Belohnungen 2026-06-30 nach unten korrigiert (User-Feedback "darf nicht zu viel sein"),
// 2026-07-04 wieder auf die ursprünglichen Plan-Werte angehoben (lohnte sich nicht gegenüber
// Ausrüstungspreisen) — muss synchron mit _krieger_enemy_stats() in
// migration_kaffee_krieger.sql bleiben, hier nur die UI-Vorschau vor dem Kampf.
// abilities[] MUSS index-gleich zu flavor[] und exakt zu _krieger_enemy_ability(tier,idx)
// in migration_2026-07-04_krieger_erweiterung_e1.sql passen (gleiche Sync-Pflicht wie die Stats).
const KRIEGER_ENEMIES = [
  { tier:'t1',   name:'Schaum-Gesindel', flavor:['🫧 Milchschaum-Wicht','👹 Bohnen-Goblin','🟤 Kaffeesatz-Schleim'], abilities:['aufschaeumen','bohnenwurf','zaeh'], hp:60,  atk:11, def:2,  ccMin:20,  ccMax:35,  ep:25,  minLevel:1,  maxDist:15 },
  { tier:'t2',   name:'Mahlwerk-Bande',  flavor:['⚙️ Mahlwerk-Golem','👻 Filterpapier-Geist','🔨 Tamper-Troll'],      abilities:['stampfer','durchsichtig','verdichtung'], hp:110, atk:16, def:7,  ccMin:45,  ccMax:75,  ep:55,  minLevel:15, maxDist:35 },
  { tier:'t3',   name:'Röster-Horde',    flavor:['🔥 Röstkammer-Zwerg','🕷️ Säure-Spinne','🐍 Crema-Hydra'],          abilities:['roestfeuer','aetzend','regeneration'], hp:200, atk:25, def:13, ccMin:90,  ccMax:140, ep:100, minLevel:30, maxDist:60 },
  { tier:'t4',   name:'Koffein-Elite',   flavor:['⚡ Koffein-Berserker','👻 Espresso-Geist','🗿 Robusta-Titan'],      abilities:['adrenalinschub','geistform','bitterkern'], hp:340, atk:36, def:20, ccMin:170, ccMax:260, ep:170, minLevel:50, maxDist:90 },
  { tier:'boss', name:'Der Espresso-Drache', flavor:['🐉 Der Espresso-Drache'], abilities:['flammenatem'], hp:650, atk:50, def:28, ccMin:350, ccMax:550, ep:350, minLevel:80, maxDist:9999 },
];

// Anzeige-Metadaten zu jeder Gegner-Signatur-Fähigkeit (Kampfvorschau + Log-Zeilen).
const KRIEGER_ENEMY_ABILITIES = {
  aufschaeumen:   { icon:'🫧', name:'Aufschäumen',   desc:'+20% Schaden alle 3 Runden' },
  bohnenwurf:     { icon:'👹', name:'Bohnenwurf',    desc:'ignoriert jeden 3. Treffer 20% deiner Verteidigung' },
  zaeh:           { icon:'🟤', name:'Zäh',           desc:'15% Chance, einen tödlichen Treffer bei 1 HP zu überleben' },
  stampfer:       { icon:'⚙️', name:'Stampfer',      desc:'jede 4. Runde doppelter Schaden' },
  durchsichtig:   { icon:'👻', name:'Durchsichtig',  desc:'20% Chance, deinem Treffer auszuweichen' },
  verdichtung:    { icon:'🔨', name:'Verdichtung',   desc:'Verteidigung steigt mit jeder Runde' },
  roestfeuer:     { icon:'🔥', name:'Röstfeuer',     desc:'Schadens-Burst alle 5 Runden' },
  aetzend:        { icon:'🕷️', name:'Ätzend',        desc:'deine Verteidigung sinkt pro erlittenem Treffer' },
  regeneration:   { icon:'🐍', name:'Regeneration',  desc:'heilt sich 4% HP/Runde (nicht unter 30% HP)' },
  adrenalinschub: { icon:'⚡', name:'Adrenalinschub',desc:'Schaden steigt, je niedriger seine HP' },
  geistform:      { icon:'👻', name:'Geistform',     desc:'dein erster Treffer im Kampf ist wirkungslos' },
  bitterkern:     { icon:'🗿', name:'Bitterkern',    desc:'−25% erlittener Schaden, dafür schwächere Angriffe' },
  flammenatem:    { icon:'🐉', name:'Flammenatem',   desc:'gewaltiger Feuer-Burst alle 5 Runden' },
};
function kriegerEnemyAbility(key) { return KRIEGER_ENEMY_ABILITIES[key] || null; }

// ── Talentbaum (1 Punkt je 10 Stufen, lineare Freischaltung) ─────────────────
// Effekte werden serverseitig in dungeon_fight angewendet (Schadensformel); der
// Client spiegelt nur die statisch anzeigbaren Boni (fein_gemahlen/vollmundig) in
// _kriegerOwnStats. Talentpunkte werden aus dem Level ABGELEITET (nicht gespeichert):
//   verfügbar = floor(level/10) − Anzahl vergebener Talente.
const KRIEGER_TALENTS = [
  { level:10,  key:'kaffeepause',     icon:'☕', name:'Kaffeepause',       desc:'Einmalige Selbstheilung (15% Max-HP) bei halber HP.' },
  { level:20,  key:'ristretto',       icon:'⚡', name:'Ristretto-Vorschlag',desc:'Garantierter Bonus-Schaden in Runde 1 (Alpha-Strike).' },
  { level:30,  key:'roestmeister_wut',icon:'🔥', name:'Röstmeister-Wut',   desc:'Dein Schaden steigt, je niedriger deine HP fällt.' },
  { level:40,  key:'zweite_kanne',    icon:'🫖', name:'Zweite Kanne',      desc:'15% Chance, einen genutzten Trank nicht zu verbrauchen.' },
  { level:50,  key:'filterkaffee',    icon:'⏳', name:'Filterkaffee-Geduld',desc:'+2 max. Kampfrunden (mehr Comeback-Chance).' },
  { level:60,  key:'fein_gemahlen',   icon:'🎯', name:'Fein gemahlen',     desc:'CRIT-Chance pauschal +5 Prozentpunkte.' },
  { level:70,  key:'nachschlag',      icon:'🔁', name:'Nachschlag',        desc:'10% Chance, nach einem Sieg sofort erneut anzugreifen.' },
  { level:80,  key:'kalte_nerven',    icon:'🧊', name:'Kalte Nerven',      desc:'Der erste gegnerische Signatur-Skill im Kampf ist wirkungslos.' },
  { level:90,  key:'vollmundig',      icon:'💪', name:'Vollmundig',        desc:'+8% Max-HP.' },
  { level:100, key:'meisterroester',  icon:'👑', name:'Meisterröster',     desc:'Alle anderen Talente wirken +50% stärker.' },
];
function kriegerTalentDef(key) { return KRIEGER_TALENTS.find(t => t.key === key) || null; }
function kriegerAssignedTalentCount(dd) { return Object.keys(dd?.talents || {}).length; }
// Verfügbare, noch nicht vergebene Talentpunkte — aus dem Level abgeleitet (nie negativ).
function kriegerTalentPoints(dd) {
  return Math.max(0, Math.floor((dd?.level || 1) / 10) - kriegerAssignedTalentCount(dd));
}

// ── Persistente HP (Etappe 2, 2026-07-07) ─────────────────────────────────────
// Server (dungeon_fight) ist autoritativ und schreibt dd.hp/hpMax/hpDate; der Client
// spiegelt nur für Anzeige + Kampf-Gating. Max-Formel MUSS zur SQL passen (80 + level*4,
// +8% bei Vollmundig, das seinerseits mit Meisterröster ×1.5 skaliert).
function kriegerHpMax(dd) {
  let max = 80 + (dd?.level || 1) * 4;
  if (dd?.talents?.vollmundig) max = Math.round(max * (1 + 0.08 * (dd.talents.meisterroester ? 1.5 : 1)));
  return max;
}
function kriegerHp(dd) {
  const max = kriegerHpMax(dd);
  if (!dd || dd.hpDate !== _kriegerTodayKey()) return max; // neuer Tag → voll (Server füllt beim 1. Kampf)
  return Math.max(0, Math.min(max, dd.hp == null ? max : dd.hp));
}
function kriegerCanFight(dd) { return kriegerHp(dd) > 0; }
// Nächstes zuweisbares Talent (lineare Reihenfolge): das erste noch nicht besessene.
function kriegerNextTalent(dd) {
  const talents = dd?.talents || {};
  return KRIEGER_TALENTS.find(t => !talents[t.key]) || null;
}
// Statisch anzeigbare Talent-Boni (Rest ist dynamisch im Kampf) — Spiegel zu dungeon_fight.
function kriegerTalentStatBonus(dd) {
  const t = dd?.talents || {};
  const mult = t.meisterroester ? 1.5 : 1.0;
  return {
    crit:   t.fein_gemahlen ? Math.round(5 * mult) : 0,
    hpMult: t.vollmundig ? (1 + 0.08 * mult) : 1,
  };
}

// ── "Die Goldene Kaffeebohne" — 5-teilige Sammel-Questline ───────────────────
// Freischaltung progressiv über 5 Meilensteine: je 1× Sieg gegen t1/t2/t3/t4 (4) +
// Boss 3× besiegt (1). Kapitel i wird sichtbar, sobald i Meilensteine erreicht sind.
const KRIEGER_GOLDEN_BEAN = [
  { chapter:1, title:'Der Duft aus der Tiefe',    text:'Man erzählt sich, tief im Labyrinth glimme eine Bohne aus reinem Gold — geröstet im ersten Feuer der Welt. Wer das Schaum-Gesindel besiegt, hört ihr Flüstern zum ersten Mal.' },
  { chapter:2, title:'Die mahlenden Wächter',     text:'Die Mahlwerk-Bande bewacht den zweiten Ring. Ihre Zahnräder mahlen die Zeit selbst — doch du zerbrichst sie und dringst tiefer vor.' },
  { chapter:3, title:'Im Röstschlund',            text:'Hitze, Säure, zischender Dampf: die Röster-Horde hütet den dritten Ring. Zwischen den Flammen erkennst du den goldenen Schimmer bereits deutlich.' },
  { chapter:4, title:'Die Koffein-Elite',         text:'Die letzten Wächter vor dem Kern — Berserker, Geist und Titan. Nur wer alle vier Ringe bezwingt, darf dem Drachen gegenübertreten.' },
  { chapter:5, title:'Das Herz aus Gold',         text:'Dreimal fiel der Espresso-Drache. In der Asche liegt sie endlich frei: die Goldene Kaffeebohne. Ihr Aroma macht dich zur Legende des Labyrinths.' },
];
// Erreichte Meilensteine (0..5) aus winsByTier + bossKills.
function kriegerGoldenBeanProgress(dd) {
  const wbt = dd?.winsByTier || {};
  let done = 0;
  if ((wbt.t1 || 0) >= 1) done++;
  if ((wbt.t2 || 0) >= 1) done++;
  if ((wbt.t3 || 0) >= 1) done++;
  if ((wbt.t4 || 0) >= 1) done++;
  if ((dd?.bossKills || 0) >= 3) done++;
  return { done, total: 5, complete: done >= 5 };
}

function kriegerEnemyDef(tier) { return KRIEGER_ENEMIES.find(e => e.tier === tier) || null; }

// Bossposition: fester Punkt am Kartenrand. Versiegelt bis Stufe 80 — siehe kriegerCanStep
// (man kann das Feld vorher nicht einmal BETRETEN, nicht nur "nicht kämpfen").
const KRIEGER_BOSS_POS = { x: KRIEGER_WORLD - 5, y: KRIEGER_WORLD - 5 };
const KRIEGER_BOSS_MIN_LEVEL = 80;

// Welcher Gegner-Tier passt zur Distanz vom Zentrum?
function kriegerTierForDistance(dist) {
  for (const e of KRIEGER_ENEMIES) {
    if (e.tier === 'boss') continue;
    if (dist <= e.maxDist) return e.tier;
  }
  return 't4';
}

// ── Stufen/EP ──────────────────────────────────────────────────────────────────
function kriegerXpForLevel(level) { return 50 + 40 * level; }
// Balance-Anpassung 2026-07-04 (User-Wunsch, "für die Motivation"): bis Stufe 10 gibt JEDE
// Stufe +2 Schritte (statt nur alle 5 Stufen +5) — frühe Level-Ups fühlen sich dadurch spürbar
// an. Ab Stufe 10 zurück zum ursprünglichen Rhythmus (alle 5 Stufen +5), auf den erreichten
// Stand bei Stufe 10 aufgesetzt. War vorher: `5 + floor(level/5)*5` (nur alle 5 Stufen).
// Basis-Anpassung 2026-07-02 (User: "es sind zu wenige Schritte, sollte mit 10 gestartet
// werden können"): Startwert 5→10 angehoben, komplette Kurve um +5 verschoben (gleiche Form).
// dd optional (2026-07-05): wenn übergeben, wird der Stiefel-Bonus (kriegerFeetBonus)
// addiert. Bestandsschutz: ohne dd (alte Aufrufe) unverändertes Verhalten.
// Schritte dazukaufen (analog Karte, 2026-07-12): bis 3×/Tag je +5 Schritte für 10 CC.
// Gespeichert in dd.steps_extra_date (Tages-Key) + dd.steps_extra_count (0..3). Tages-Reset
// implizit über Datumsvergleich. Fließt über kriegerExtraStepBonus in kriegerStepsAllowed.
const KRIEGER_EXTRA_STEPS     = 5;
const KRIEGER_EXTRA_STEP_COST = 10;
const KRIEGER_EXTRA_STEP_MAX  = 3;
function kriegerExtraStepsBought(dd) {
  if (!dd?.steps_extra_date || dd.steps_extra_date !== _kriegerTodayKey()) return 0;
  return Math.min(KRIEGER_EXTRA_STEP_MAX, dd.steps_extra_count || 0);
}
function kriegerExtraStepBonus(dd) { return kriegerExtraStepsBought(dd) * KRIEGER_EXTRA_STEPS; }
function kriegerStepsAllowed(level, dd) {
  const lvl = level || 1;
  const base = lvl <= 10 ? 10 + (lvl - 1) * 2 : 28 + Math.floor((lvl - 10) / 5) * 5;
  return base + (dd ? kriegerFeetBonus(dd) : 0) + (dd ? kriegerMountStepBonus(dd) : 0)
              + (dd ? kriegerExtraStepBonus(dd) : 0);
}
function kriegerProgress(dd) {
  const level = dd?.level || 1, xp = dd?.xp || 0;
  const need = level >= 100 ? 0 : kriegerXpForLevel(level);
  return { level, xp, need, pct: need ? Math.min(100, Math.round(xp / need * 100)) : 100 };
}

// ── Fog-of-War / Bewegung (analog karte.js, eigener Datensatz) ──────────────────
function kriegerPos(dd) { return dd?.pos ? { ...dd.pos } : { x: KRIEGER_START_X, y: KRIEGER_START_Y }; }
function kriegerIsExplored(x, y, dd) { return !!(dd?.explored?.[`${x},${y}`]); }

function _kriegerTodayKey() { return new Date().toLocaleDateString('de-DE'); }
function kriegerStepsUsed(dd) {
  if (!dd?.steps_date || dd.steps_date !== _kriegerTodayKey()) return 0;
  return dd.steps_today || 0;
}
function kriegerStepsLeft(dd) {
  const level = dd?.level || 1;
  return Math.max(0, kriegerStepsAllowed(level, dd) - kriegerStepsUsed(dd));
}
function kriegerCanStep(tx, ty, dd, worldSeed) {
  if (kriegerStepsLeft(dd) <= 0) return false;
  if (kriegerIsExplored(tx, ty, dd)) return false;
  if (tx < 0 || tx >= KRIEGER_WORLD || ty < 0 || ty >= KRIEGER_WORLD) return false;
  if (kriegerIsWall(tx, ty, worldSeed)) return false; // Felswand — Labyrinth-Begrenzung
  // Drachenhöhle bleibt versiegelt bis Stufe 80 — "erreichbar" heißt hier wörtlich:
  // man kann nicht einmal HINLAUFEN, nicht nur "nicht kämpfen".
  if (tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y && (dd?.level || 1) < KRIEGER_BOSS_MIN_LEVEL) return false;
  const p = kriegerPos(dd);
  return Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1 && !(p.x === tx && p.y === ty);
}

// Kostenloses Zurücklaufen auf ein bereits erkundetes Nachbarfeld (kein Schrittverbrauch,
// kein erneutes Explore/Fund). Behebt das "Steckenbleiben": sobald alle direkten Nachbarn
// erkundet sind, konnte man sich vorher NICHT mehr zu einem unerkundeten Feld anderswo
// zurückbewegen. Analog karteCanWalkBack/karteWalkBack in karte.js.
function kriegerCanWalkBack(tx, ty, dd) {
  if (!kriegerIsExplored(tx, ty, dd)) return false;
  if (tx < 0 || tx >= KRIEGER_WORLD || ty < 0 || ty >= KRIEGER_WORLD) return false;
  const p = kriegerPos(dd);
  return Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1 && !(p.x === tx && p.y === ty);
}
function kriegerWalkBack(tx, ty, dd) {
  const p = kriegerPos(dd);
  return { ...(dd || {}), pos: { x: tx, y: ty }, lastDir: { dx: Math.sign(tx - p.x), dy: Math.sign(ty - p.y) } };
}

// ── Level-Kampfbonus (2026-07-05): Level wirkt jetzt auch auf ATK/DEF, nicht nur HP.
// Muss zur SQL dungeon_fight passen (floor(level/4) ATK, floor(level/5) DEF). ───────
function kriegerLevelAtkBonus(level) { return Math.floor((level || 1) / 4); }
function kriegerLevelDefBonus(level) { return Math.floor((level || 1) / 5); }

// ── Rüstungs-Haltbarkeit (2026-07-05): 0..100, Standard 100. Niederlage MIT Rüstung
// senkt sie (serverseitig in dungeon_fight um 20); der Rüstungs-DEF skaliert damit. ──
function kriegerArmorDur(dd, key) {
  const v = dd && dd.armorDur ? dd.armorDur[key] : undefined;
  return (v === undefined || v === null) ? 100 : Math.max(0, Math.min(100, Number(v)));
}
const KRIEGER_REPAIR_FACTOR = 0.3; // Reparaturkosten = fehlende% × Basispreis × Faktor
function kriegerRepairCost(dd, key) {
  const item = (typeof kriegerItemByKey === 'function') ? kriegerItemByKey(key) : null;
  if (!item) return 0;
  const missing = (100 - kriegerArmorDur(dd, key)) / 100;
  return Math.ceil((item.cost || 0) * KRIEGER_REPAIR_FACTOR * missing);
}

// Betritt ein neues Feld. Gibt { newDungeonData, gimmick, encounter } zurück.
// encounter = { tier, flavorIdx } oder null.
// gimmick = { cc } (CC-Fund) ODER { voucher: {slot,pct}, emoji, name } (Ausrüstungsfund) oder null.
function kriegerExploreTile(tx, ty, dd, worldSeed) {
  // Defensiv: eine Felswand kann eigentlich nie hier ankommen (kriegerCanStep blockt das
  // schon in der UI), aber falls doch — unverändert zurückgeben statt einen Stein "begehbar" zu machen.
  if (kriegerIsWall(tx, ty, worldSeed)) return { newDungeonData: dd, gimmick: null, encounter: null };

  const today = _kriegerTodayKey();
  const stepsUsed = kriegerStepsUsed(dd);
  const newExplored = { ...(dd?.explored || {}), [`${tx},${ty}`]: Date.now() };

  let gimmick = null, encounter = null;

  const isBossTile = tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y;
  if (isBossTile) {
    encounter = { tier: 'boss', flavorIdx: 0 };
  } else {
    const dist = Math.max(Math.abs(tx - KRIEGER_START_X), Math.abs(ty - KRIEGER_START_Y));
    const rEnc = _tileRng(tx, ty, 5151, worldSeed)();
    if (rEnc < KRIEGER_ENEMY_P) {
      const tier = kriegerTierForDistance(dist);
      const def  = kriegerEnemyDef(tier);
      const flavorIdx = Math.floor(_tileRng(tx, ty, 6262, worldSeed)() * def.flavor.length);
      encounter = { tier, flavorIdx };
    } else {
      const rGim = _tileRng(tx, ty, 7373, worldSeed)();
      if (rGim < KRIEGER_GIMMICK_P) {
        const rType = _tileRng(tx, ty, 9494, worldSeed)();
        if (rType < KRIEGER_VOUCHER_CHANCE && !dd?.equipmentVoucher) {
          const vi = Math.floor(_tileRng(tx, ty, 10101, worldSeed)() * KRIEGER_VOUCHER_FINDS.length);
          const find = KRIEGER_VOUCHER_FINDS[vi];
          gimmick = { voucher: { slot: find.slot, pct: 0.5 }, emoji: find.emoji, name: find.name };
        } else if (rType < KRIEGER_VOUCHER_CHANCE + KRIEGER_POTION_FIND_CHANCE) {
          // Seltener Trank-Fund (Etappe 2): landet direkt im Bestand dd.potions[key].
          const pi = Math.floor(_tileRng(tx, ty, 11011, worldSeed)() * KRIEGER_POTION_FIND_POOL.length);
          const pKey = KRIEGER_POTION_FIND_POOL[pi];
          const pDef = kriegerPotionByKey(pKey);
          gimmick = { potion: pKey, emoji: pDef ? pDef.icon : '🧪', name: (pDef ? pDef.name : 'Trank') + ' gefunden' };
        } else {
          const cc = KRIEGER_GIMMICKS[0].cc;
          const amount = cc[0] + Math.floor(_tileRng(tx, ty, 8484, worldSeed)() * (cc[1] - cc[0] + 1));
          gimmick = { cc: amount };
        }
      }
    }
  }

  const _prev = kriegerPos(dd);
  const newDungeonData = {
    ...dd,
    pos: { x: tx, y: ty },
    explored: newExplored,
    steps_today: stepsUsed + 1,
    steps_date: today,
    lastDir: { dx: Math.sign(tx - _prev.x), dy: Math.sign(ty - _prev.y) }, // für Linien-Scan (Etappe 4)
  };

  return { newDungeonData, gimmick, encounter };
}

// ── Kampf-Client (ruft NUR die serverseitige RPC auf — keine Client-Logik) ──────
// flavorIdx (0-basiert, index-gleich zu enemyDef.flavor/abilities) bestimmt serverseitig
// die Gegner-Signatur-Fähigkeit. NULL/undefined = keine Fähigkeit (Rückwärtskompatibilität).
async function kriegerFight(memberId, enemyTier, flavorIdx, potionKey) {
  return DB.dungeonFight(memberId, enemyTier, flavorIdx, potionKey); // { won, log, cc_awarded, ep_awarded, new_level, leveled_up, set_bonus, rounds, enemy_ability, talent_points_gained, hp, hp_max, potion_used, new_dungeon_data } | { error }
}

// ── Canvas-Rendering (analog karteRender in karte.js, aber Labyrinth statt Biom-System):
// Felswände sind IMMER sichtbar (kein Fog — sie sind feste Geometrie, kein verstecktes
// Wissen), nur der Boden-INHALT (Encounter/Fund) bleibt bis zum Betreten verborgen.
//
// „Kaffee-Höhle"-Optik (2026-07-04, PLAN_krieger_kartenoptik.md) — reine Rendering-
// Überarbeitung, KEINE Logik-Änderung (Schritte/Labyrinth/Fog-Zustand unverändert):
//   • Boden: EINE nahtlose Batch-Fläche (#a3805a) statt 2-Ton-Schachbrett mit Zellrahmen,
//     darüber deterministische weiche Schattierungs-Blobs (#8f6d48) + Rausch-Pattern
//   • Wände: organische Blobs via roundRect (arcTo-Fallback), Eckenradius nur an freien
//     Ecken — zusammenhängende Wandblöcke verschmelzen zu einem Felsbrocken (#241d16)
//   • Deko: Bohnen-Krümel (~10% Bodenfelder), Risse (~15% Wand-Außenkanten), Dampf nur
//     im Boss-Umkreis — alles deterministisch aus _tileRng, UNTER den Gameplay-Icons
//   • Fog (#5a5a5a + Schraffur) und Außenwelt (#0a0807) bewusst UNVERÄNDERT (Kontrast!)
// ──────────────────────────────────────────────────────────────────────────────────────

// Kachelbares Rausch-Pattern (4×4 Tiles = 80px), EINMAL pro Welt-Seed vorgerechnet und
// als CanvasPattern gecacht — pro Frame nur noch ein günstiges Pattern-Fill.
let _kriegerNoiseCache = { seed: null, pattern: null };
function _kriegerNoise(worldSeed) {
  if (_kriegerNoiseCache.seed === worldSeed && _kriegerNoiseCache.pattern) return _kriegerNoiseCache.pattern;
  const S = KRIEGER_TILE * 4;
  const off = document.createElement('canvas');
  off.width = S; off.height = S;
  const octx = off.getContext('2d');
  const rng = _kRng((worldSeed ^ 0x4E6F6973) >>> 0); // eigener Strom ("Nois")
  for (let i = 0; i < 420; i++) {
    const x = Math.floor(rng() * S), y = Math.floor(rng() * S), s = rng() < 0.7 ? 1 : 2;
    octx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.6)';
    octx.fillRect(x, y, s, s);
  }
  _kriegerNoiseCache = { seed: worldSeed, pattern: octx.createPattern(off, 'repeat') };
  return _kriegerNoiseCache.pattern;
}

// Abgerundetes Rechteck mit individuellen Eckenradien [tl, tr, br, bl] als Subpfad.
// Nutzt natives ctx.roundRect wenn vorhanden, sonst arcTo-Fallback (ältere Browser).
function _kriegerBlobPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  const [tl, tr, br, bl] = r;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

// Dampf-Animation nahe der Drachenhöhle: einziger animierter Teil der Karte. Ein einzelner,
// auf ~11 FPS gedrosselter rAF-Loop rendert die Karte neu, solange (a) der Boss-Umkreis im
// Viewport liegt und (b) der Canvas noch im DOM hängt — kein weltweiter Redraw-Loop.
let _kriegerSteamRaf = 0, _kriegerSteamArgs = null, _kriegerSteamLast = 0;
function _kriegerSteamLoop(canvas, dd, worldSeed, vpX, vpY) {
  _kriegerSteamArgs = { canvas, dd, worldSeed, vpX, vpY };
  if (_kriegerSteamRaf) return; // Loop läuft bereits — nur Args aktualisieren
  const tick = (ts) => {
    _kriegerSteamRaf = 0;
    const a = _kriegerSteamArgs;
    if (!a || !a.canvas.isConnected) { _kriegerSteamArgs = null; return; }
    if (ts - _kriegerSteamLast >= 90) {
      _kriegerSteamLast = ts;
      kriegerRender(a.canvas, a.dd, a.worldSeed, a.vpX, a.vpY); // re-schedult sich selbst
    } else {
      _kriegerSteamRaf = requestAnimationFrame(tick);
    }
  };
  _kriegerSteamRaf = requestAnimationFrame(tick);
}
function _kriegerSteamStop() {
  if (_kriegerSteamRaf) { cancelAnimationFrame(_kriegerSteamRaf); _kriegerSteamRaf = 0; }
  _kriegerSteamArgs = null;
}

function kriegerRender(canvas, dd, worldSeed, vpX, vpY) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, T = KRIEGER_TILE;
  const COLS = Math.floor(W / T), ROWS = Math.floor(H / T);

  const pos       = kriegerPos(dd);
  const explored  = dd?.explored || {};
  const encounters = dd?.encounters || {};
  const gimmickTiles = dd?.gimmickTiles || {};
  const level     = dd?.level || 1;
  // Kaffeesatz-Scouting (Etappe 4): Kategorie-Vorschau auf unerkundeten Feldern im Scan-Muster.
  const scanKeys = new Set((typeof kriegerScanTiles === 'function' ? kriegerScanTiles(dd) : []).map(t => `${t.x},${t.y}`));

  const originX = (vpX !== undefined) ? vpX : pos.x - Math.floor(COLS / 2);
  const originY = (vpY !== undefined) ? vpY : pos.y - Math.floor(ROWS / 2);

  // Wand ODER versiegelte Drachenhöhle (vor Stufe 80 optisch Fels — kein Spoiler)
  const isWallLike = (wx, wy) => {
    if (wx === KRIEGER_BOSS_POS.x && wy === KRIEGER_BOSS_POS.y && level < KRIEGER_BOSS_MIN_LEVEL) return true;
    return kriegerIsWall(wx, wy, worldSeed);
  };

  // Hintergrund (außerhalb der Welt): unverändert fast schwarz
  ctx.fillStyle = '#0a0807';
  ctx.fillRect(0, 0, W, H);

  // ── Pass 0: Viewport-Tiles kategorisieren (nur COLS×ROWS, wie bisher) ──────────
  const floorTiles = [], fogTiles = [], wallTiles = [];
  const R = T * 0.38; // Eckenradius freier Wand-Ecken (~38% Tile, Plan §1)
  for (let vy = 0; vy < ROWS; vy++) {
    for (let vx = 0; vx < COLS; vx++) {
      const wx = originX + vx, wy = originY + vy;
      if (wx < 0 || wx >= KRIEGER_WORLD || wy < 0 || wy >= KRIEGER_WORLD) continue;
      const px = vx * T, py = vy * T;
      if (isWallLike(wx, wy)) {
        // Eckenradius pro Ecke: nur runden, wenn die Ecke „frei" liegt (vereinfachtes
        // Blob-Tileset). Beide anliegenden Seiten Wand → 0 (verschmilzt mit Nachbar).
        const wL = isWallLike(wx - 1, wy), wR = isWallLike(wx + 1, wy);
        const wU = isWallLike(wx, wy - 1), wD = isWallLike(wx, wy + 1);
        const radii = [
          (wL && wU) ? 0 : R,  // tl
          (wR && wU) ? 0 : R,  // tr
          (wR && wD) ? 0 : R,  // br
          (wL && wD) ? 0 : R,  // bl
        ];
        // Unterlage für die Eckausschnitte: dunkler Bodenton neben erkundetem Boden
        // (liest sich als Schattenfuge), sonst Fog-Grau, sonst Außen-Schwarz.
        let under = '#0a0807';
        let nearFloor = false, nearWalkable = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = wx + dx, ny = wy + dy;
          if (nx < 0 || nx >= KRIEGER_WORLD || ny < 0 || ny >= KRIEGER_WORLD) continue;
          if (isWallLike(nx, ny)) continue;
          nearWalkable = true;
          if (explored[`${nx},${ny}`]) { nearFloor = true; break; }
        }
        if (nearFloor) under = '#8f6d48';
        else if (nearWalkable) under = '#5a5a5a';
        wallTiles.push({ wx, wy, px, py, radii, under, outer: nearWalkable || nearFloor });
      } else if (explored[`${wx},${wy}`]) {
        floorTiles.push({ wx, wy, px, py });
      } else {
        fogTiles.push({ wx, wy, px, py });
      }
    }
  }

  const noise = _kriegerNoise(worldSeed);
  const NS = T * 4; // Pattern-Kachelgröße — Welt-Ausrichtung, damit beim Scrollen nichts "schwimmt"
  const noiseOffX = ((originX * T) % NS + NS) % NS;
  const noiseOffY = ((originY * T) % NS + NS) % NS;

  // ── Pass 1: Boden als EINE nahtlose Batch-Fläche (keine Zellrahmen mehr) ────────
  if (floorTiles.length) {
    ctx.beginPath();
    for (const t of floorTiles) ctx.rect(t.px, t.py, T, T);
    ctx.fillStyle = '#a3805a'; // heller Basiston (§4.1-Anker, unverändert hell)
    ctx.fill();

    // Weiche Schattierungs-Blobs im dunkleren 2-Ton (#8f6d48) + Rausch-Pattern —
    // beides auf die Bodenfläche geclippt (kein Ausbluten in Fog/Wand).
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#8f6d48';
    for (const t of floorTiles) {
      const rng = _tileRng(t.wx, t.wy, 1212, worldSeed); // eigenes Deko-Salt
      if (rng() < 0.65) {
        const cx = t.px + T * (0.25 + rng() * 0.5);
        const cy = t.py + T * (0.25 + rng() * 0.5);
        const rr = T * (0.45 + rng() * 0.4);
        ctx.globalAlpha = 0.16 + rng() * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.12;
    if (noise) {
      ctx.translate(-noiseOffX, -noiseOffY);
      ctx.fillStyle = noise;
      ctx.fillRect(0, 0, W + NS, H + NS);
    }
    ctx.restore();
    ctx.globalAlpha = 1.0;

    // Deko: Kaffeebohnen-Krümel auf ~10% der Bodenfelder — halbtransparent, deutlich
    // dezenter als jedes Gameplay-Icon, wird VOR den Icons gezeichnet (liegt darunter).
    for (const t of floorTiles) {
      const rng = _tileRng(t.wx, t.wy, 2121, worldSeed);
      if (rng() >= 0.10) continue;
      const bx = t.px + T * (0.3 + rng() * 0.4);
      const by = t.py + T * (0.3 + rng() * 0.4);
      const rot = rng() * Math.PI;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#4a301c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.8, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(163,128,90,.7)'; // Bohnen-Kerbe
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2.2, 0);
      ctx.lineTo(2.2, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Pass 2: Fog — UNVERÄNDERT (#5a5a5a + Diagonal-Schraffur, Plan §4.1) ─────────
  for (const t of fogTiles) {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(t.px, t.py, T, T);
    ctx.save();
    ctx.beginPath();
    ctx.rect(t.px, t.py, T, T);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -T; i <= T; i += 5) {
      ctx.moveTo(t.px + i, t.py);
      ctx.lineTo(t.px + i + T, t.py + T);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Pass 3: Wände als organische Blobs (ein Fels statt Einzelquadrate) ──────────
  if (wallTiles.length) {
    for (const t of wallTiles) { ctx.fillStyle = t.under; ctx.fillRect(t.px, t.py, T, T); }
    ctx.beginPath();
    for (const t of wallTiles) _kriegerBlobPath(ctx, t.px, t.py, T, T, t.radii);
    ctx.fillStyle = '#241d16'; // Wandfarbe UNVERÄNDERT (§4.1-Kontrast-Anker)
    ctx.fill();
    if (noise) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.10;
      ctx.translate(-noiseOffX, -noiseOffY);
      ctx.fillStyle = noise;
      ctx.fillRect(0, 0, W + NS, H + NS);
      ctx.restore();
      ctx.globalAlpha = 1.0;
    }
    for (const t of wallTiles) {
      // Speckles wie bisher (leicht eingerückt, damit sie in gerundeten Ecken bleiben)
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(t.px + 4, t.py + 5, 3, 3);
      ctx.fillRect(t.px + T - 8, t.py + T - 9, 4, 4);
      // Deko: Risse an ~15% der Wand-Außenkanten (deterministisch, Salt 3131)
      if (!t.outer) continue;
      const rng = _tileRng(t.wx, t.wy, 3131, worldSeed);
      if (rng() >= 0.15) continue;
      const x0 = t.px + 4 + rng() * (T - 12);
      const y0 = t.py + 4 + rng() * (T - 12);
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 2 + rng() * 4, y0 + 3 + rng() * 3);
      ctx.lineTo(x0 + 1 + rng() * 3, y0 + 7 + rng() * 3);
      ctx.stroke();
    }
  }

  // ── Pass 4: Dampfschwaden — NUR im Boss-Umkreis (Radius ~3), Plan §3/§5 ─────────
  const bvx = KRIEGER_BOSS_POS.x - originX, bvy = KRIEGER_BOSS_POS.y - originY;
  const steamVisible = bvx >= -3 && bvx <= COLS + 3 && bvy >= -3 && bvy <= ROWS + 3;
  if (steamVisible) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const bpx = bvx * T + T / 2, bpy = bvy * T + T / 2;
    for (let i = 0; i < 4; i++) {
      const rng = _tileRng(KRIEGER_BOSS_POS.x, KRIEGER_BOSS_POS.y, 4141 + i, worldSeed);
      const baseX = bpx + (rng() * 2 - 1) * 2.2 * T; // deterministische Basis im 3er-Radius
      const baseY = bpy + (rng() * 2 - 1) * 2.2 * T;
      const prog = ((now * 0.12) + i * 0.25) % 1;    // sanft aufsteigend + auslaufend
      const sx = baseX + Math.sin(now * 0.9 + i * 2.1) * 2;
      const sy = baseY - prog * 1.8 * T;
      const alpha = 0.20 * (1 - prog) + 0.03;
      const rr = T * (0.2 + prog * 0.35);
      ctx.fillStyle = `rgba(235,225,205,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Pass 5: Gameplay-Icons — IMMER über der Deko (⚔️/🪙/🐉 unverändert) ─────────
  for (const t of floorTiles) {
    const key = `${t.wx},${t.wy}`;
    const isBoss = t.wx === KRIEGER_BOSS_POS.x && t.wy === KRIEGER_BOSS_POS.y;
    if (isBoss) {
      ctx.font = `${Math.floor(T * 0.7)}px sans-serif`;
      ctx.fillText('🐉', t.px + 2, t.py + T - 3);
    } else if (encounters[key]) {
      ctx.font = `${Math.floor(T * 0.6)}px sans-serif`;
      ctx.fillText('⚔️', t.px + 3, t.py + T - 4);
    } else if (gimmickTiles[key]) {
      ctx.globalAlpha = 0.55; // bereits eingesammelt — nur noch schwacher Hinweis
      ctx.font = `${Math.floor(T * 0.55)}px sans-serif`;
      ctx.fillText('🪙', t.px + 3, t.py + T - 4);
      ctx.globalAlpha = 1.0;
    }
  }
  // ── Pass 5b: Kaffeesatz-Scouting-Vorschau — dim, NUR Kategorie (⚔️/🪙) auf Nebelfeldern ──
  if (scanKeys.size) {
    for (const t of fogTiles) {
      const key = `${t.wx},${t.wy}`;
      if (!scanKeys.has(key)) continue;
      if (t.wx === KRIEGER_BOSS_POS.x && t.wy === KRIEGER_BOSS_POS.y) continue; // Boss zeigt Pass 5c
      const peek = (typeof kriegerPeekTile === 'function') ? kriegerPeekTile(t.wx, t.wy, worldSeed) : null;
      if (!peek || peek.type === 'empty') continue;
      // dezenter heller Punkt als "hier wurde gelesen"-Marker, darüber das Kategorie-Icon (halbtransparent)
      ctx.fillStyle = 'rgba(255,244,214,.14)';
      ctx.fillRect(t.px + 2, t.py + 2, T - 4, T - 4);
      ctx.globalAlpha = 0.72;
      ctx.font = `${Math.floor(T * 0.5)}px sans-serif`;
      ctx.fillText(peek.type === 'enemy' ? '⚔️' : '🪙', t.px + T * 0.22, t.py + T - 5);
      ctx.globalAlpha = 1.0;
    }
  }

  // Bossfeld bleibt (sobald freigeschaltet) auch durch Nebel als Questziel sichtbar
  for (const t of fogTiles) {
    if (t.wx === KRIEGER_BOSS_POS.x && t.wy === KRIEGER_BOSS_POS.y) {
      ctx.globalAlpha = 0.55;
      ctx.font = `${Math.floor(T * 0.7)}px sans-serif`;
      ctx.fillText('🐉', t.px + 2, t.py + T - 3);
      ctx.globalAlpha = 1.0;
    }
  }

  // Spieler-Marker: 🧍-Emoji wie bisher (zuletzt = immer oben). Dezenter heller
  // Glow-Ring DARUNTER — rein zugunsten der Erkennbarkeit auf dem wärmeren Boden.
  const ppx = (pos.x - originX) * T, ppy = (pos.y - originY) * T;
  if (ppx >= 0 && ppx < W && ppy >= 0 && ppy < H) {
    const gcx = ppx + T / 2, gcy = ppy + T / 2;
    const glow = ctx.createRadialGradient(gcx, gcy, 1, gcx, gcy, T * 0.65);
    glow.addColorStop(0, 'rgba(255,244,214,.45)');
    glow.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gcx, gcy, T * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.floor(T * 0.75)}px sans-serif`;
    ctx.fillText('🧍', ppx + 2, ppy + T - 3);
  }

  // Dampf-Loop starten/stoppen (einziger animierter Teil — gedrosselt, Boss-nah)
  if (steamVisible) _kriegerSteamLoop(canvas, dd, worldSeed, vpX, vpY);
  else _kriegerSteamStop();
}
