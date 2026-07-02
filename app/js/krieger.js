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
];

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
const KRIEGER_ENEMIES = [
  { tier:'t1',   name:'Schaum-Gesindel', flavor:['🫧 Milchschaum-Wicht','👹 Bohnen-Goblin','🟤 Kaffeesatz-Schleim'], hp:60,  atk:11, def:2,  ccMin:20,  ccMax:35,  ep:25,  minLevel:1,  maxDist:15 },
  { tier:'t2',   name:'Mahlwerk-Bande',  flavor:['⚙️ Mahlwerk-Golem','👻 Filterpapier-Geist','🔨 Tamper-Troll'],      hp:110, atk:16, def:7,  ccMin:45,  ccMax:75,  ep:55,  minLevel:15, maxDist:35 },
  { tier:'t3',   name:'Röster-Horde',    flavor:['🔥 Röstkammer-Zwerg','🕷️ Säure-Spinne','🐍 Crema-Hydra'],          hp:200, atk:25, def:13, ccMin:90,  ccMax:140, ep:100, minLevel:30, maxDist:60 },
  { tier:'t4',   name:'Koffein-Elite',   flavor:['⚡ Koffein-Berserker','👻 Espresso-Geist','🗿 Robusta-Titan'],      hp:340, atk:36, def:20, ccMin:170, ccMax:260, ep:170, minLevel:50, maxDist:90 },
  { tier:'boss', name:'Der Espresso-Drache', flavor:['🐉 Der Espresso-Drache'], hp:650, atk:50, def:28, ccMin:350, ccMax:550, ep:350, minLevel:80, maxDist:9999 },
];

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
function kriegerStepsAllowed(level, dd) {
  const lvl = level || 1;
  const base = lvl <= 10 ? 10 + (lvl - 1) * 2 : 28 + Math.floor((lvl - 10) / 5) * 5;
  return base + (dd ? kriegerFeetBonus(dd) : 0);
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
  return { ...(dd || {}), pos: { x: tx, y: ty } };
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
        } else {
          const cc = KRIEGER_GIMMICKS[0].cc;
          const amount = cc[0] + Math.floor(_tileRng(tx, ty, 8484, worldSeed)() * (cc[1] - cc[0] + 1));
          gimmick = { cc: amount };
        }
      }
    }
  }

  const newDungeonData = {
    ...dd,
    pos: { x: tx, y: ty },
    explored: newExplored,
    steps_today: stepsUsed + 1,
    steps_date: today,
  };

  return { newDungeonData, gimmick, encounter };
}

// ── Kampf-Client (ruft NUR die serverseitige RPC auf — keine Client-Logik) ──────
async function kriegerFight(memberId, enemyTier) {
  return DB.dungeonFight(memberId, enemyTier); // { won, log, cc_awarded, ep_awarded, new_level, leveled_up, set_bonus, rounds, new_dungeon_data } | { error }
}

// ── Canvas-Rendering (analog karteRender in karte.js, aber Labyrinth statt Biom-System):
// Felswände sind IMMER sichtbar (kein Fog — sie sind feste Geometrie, kein verstecktes
// Wissen), nur der Boden-INHALT (Encounter/Fund) bleibt bis zum Betreten verborgen.
// ──────────────────────────────────────────────────────────────────────────────────────
function kriegerRender(canvas, dd, worldSeed, vpX, vpY) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, T = KRIEGER_TILE;
  const COLS = Math.floor(W / T), ROWS = Math.floor(H / T);

  const pos       = kriegerPos(dd);
  const explored  = dd?.explored || {};
  const encounters = dd?.encounters || {};
  const gimmickTiles = dd?.gimmickTiles || {};
  const level     = dd?.level || 1;

  const originX = (vpX !== undefined) ? vpX : pos.x - Math.floor(COLS / 2);
  const originY = (vpY !== undefined) ? vpY : pos.y - Math.floor(ROWS / 2);

  ctx.clearRect(0, 0, W, H);

  for (let vy = 0; vy < ROWS; vy++) {
    for (let vx = 0; vx < COLS; vx++) {
      const wx = originX + vx, wy = originY + vy;
      const px = vx * T, py = vy * T;
      const key = `${wx},${wy}`;
      const inBounds = wx >= 0 && wx < KRIEGER_WORLD && wy >= 0 && wy < KRIEGER_WORLD;
      const isBoss = wx === KRIEGER_BOSS_POS.x && wy === KRIEGER_BOSS_POS.y;

      if (!inBounds) { ctx.fillStyle = '#0a0807'; ctx.fillRect(px, py, T, T); continue; }

      // Felswand: immer sichtbar (Labyrinth-Grenze), unabhängig vom Fog. Versiegelte
      // Drachenhöhle (vor Stufe 80) sieht optisch ebenfalls wie Fels aus — kein Spoiler.
      // Optik 2026-07-02, überarbeitet: Wand zurück auf das ursprüngliche Braun (User fand
      // Grün/Blau-Kombi zu "blau-grün"), stattdessen die begehbare, aber noch unerkundete
      // Fläche (Fog) auf neutrales Grau — hebt sich klar von Wand-Braun UND Boden-Braun ab.
      const sealedBoss = isBoss && level < KRIEGER_BOSS_MIN_LEVEL;
      if (kriegerIsWall(wx, wy, worldSeed) || sealedBoss) {
        ctx.fillStyle = '#241d16';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(px + 2, py + 3, 3, 3);
        ctx.fillRect(px + T - 7, py + T - 8, 4, 4);
        continue;
      }

      if (!explored[key]) {
        // Grau + Schraffur statt Flat-Fill — hebt sich als "noch unerkundet" ab,
        // ohne so dunkel/eintönig wie vorher zu wirken.
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(px, py, T, T);
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, T, T);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -T; i <= T; i += 5) {
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + T, py + T);
        }
        ctx.stroke();
        ctx.restore();
        // Bossfeld bleibt (sobald freigeschaltet) auch durch Nebel als Questziel sichtbar
        if (isBoss) {
          ctx.globalAlpha = 0.55;
          ctx.font = `${Math.floor(T * 0.7)}px sans-serif`;
          ctx.fillText('🐉', px + 2, py + T - 3);
          ctx.globalAlpha = 1.0;
        }
        continue;
      }

      // Erkundeter Pfad: 2-Ton helles Steinboden-Braun (vorher zu dunkel/kaum
      // unterscheidbar vom Fog)
      const checker = (wx + wy) % 2 === 0;
      ctx.fillStyle = checker ? '#a3805a' : '#8f6d48';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);

      if (isBoss) {
        ctx.font = `${Math.floor(T * 0.7)}px sans-serif`;
        ctx.fillText('🐉', px + 2, py + T - 3);
      } else if (encounters[key]) {
        ctx.font = `${Math.floor(T * 0.6)}px sans-serif`;
        ctx.fillText('⚔️', px + 3, py + T - 4);
      } else if (gimmickTiles[key]) {
        ctx.globalAlpha = 0.55; // bereits eingesammelt — nur noch schwacher Hinweis
        ctx.font = `${Math.floor(T * 0.55)}px sans-serif`;
        ctx.fillText('🪙', px + 3, py + T - 4);
        ctx.globalAlpha = 1.0;
      }
    }
  }

  // Spieler-Marker
  const ppx = (pos.x - originX) * T, ppy = (pos.y - originY) * T;
  if (ppx >= 0 && ppx < W && ppy >= 0 && ppy < H) {
    ctx.font = `${Math.floor(T * 0.75)}px sans-serif`;
    ctx.fillText('🧍', ppx + 2, ppy + T - 3);
  }
}
