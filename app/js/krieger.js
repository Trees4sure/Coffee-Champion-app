// ═══════════════════════════════════════════════════════════════════════════
// krieger.js — Kaffee-Krieger RPG: Ausrüstung, Gegner, Dungeon-Karte, Kampf-Client
// Nutzt _tileRng/_kRng/_karteWorldSeed aus karte.js (muss VOR dieser Datei laden).
// ═══════════════════════════════════════════════════════════════════════════

const KRIEGER_WORLD      = 150;
const KRIEGER_START_X    = 75;
const KRIEGER_START_Y    = 75;
const KRIEGER_TILE       = 20;
const KRIEGER_GIMMICK_P  = 0.25;   // Fundchance pro neuem Feld
const KRIEGER_ENEMY_P    = 0.15;   // Encounter-Chance pro neuem Feld (2026-07-15: 0.12→0.15, „mehr Gegner")
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

// 💰 Rückkaufwert (JP 2026-07-30: „dass man Tränke verkaufen kann wäre gut" — er hatte
// über 30 Stück je Sorte liegen, weil Tränke aus Dungeon-Funden schneller reinkommen als
// man sie verbraucht: max. 1–2 pro Kampf).
// 50 % ist bewusst deutlich unter dem Kaufpreis: Tränke sollen kein Sparbuch werden.
// ⚠️ Immer auf den GRUNDPREIS anwenden, nie auf den gezahlten — mit dem Handel-Set kauft
// man 15 % billiger, und ein Rückkauf über 50 % des Grundpreises wäre bei einem künftigen
// Rabatt >50 % eine Geldmaschine. Spiegel von KRIEGER_POTION_SELL_PCT in db.js.
const KRIEGER_POTION_SELL_PCT = 0.5;
// Sicherheitsreserve des Sammel-Verkaufs: „alle bis auf 5". Ohne sie wäre ein Fehlklick
// gleichbedeutend mit „Bestand weg" — und Tränke sind vor einem Burgkampf genau das,
// worauf man sich verlässt.
const KRIEGER_POTION_KEEP = 5;
function kriegerPotionSellValue(potion) {
  return Math.floor((potion?.cost || 0) * KRIEGER_POTION_SELL_PCT);
}

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

// ── 🔩 Aufgebrochene Wände (2026-07-21) ───────────────────────────────────────
// Messung dieser Session: nur ~20% der offenen Felder sind vom Start aus erreichbar —
// die Höhlengenerierung verbindet garantiert NUR Start↔Boss. Kaffeebohrer und
// Kaffeegranate sind die Antwort darauf: sie sprengen Fels weg und erschließen neue
// Gebiete. Die Durchbrüche leben in dd.brokenWalls{"x,y":ts} (dungeon_data, keine SQL).
//
// WICHTIG — der KARTENRAND bleibt immer Fels: `x<=0 || …` wird vor der Prüfung
// abgefragt, sonst könnte man sich aus der Welt heraussprengen.
function kriegerIsBroken(dd, x, y) { return !!(dd?.brokenWalls?.[`${x},${y}`]); }
// Die dd-bewusste Variante von kriegerIsWall. Überall dort verwendet, wo es um
// BEGEHBARKEIT geht (Laufen, Rendern, Explore). kriegerIsWall selbst bleibt
// absichtlich unverändert — die Landmarken-Platzierung muss auf der UNGESPRENGTEN
// Karte rechnen, sonst würden Burgen umziehen, sobald jemand bohrt.
function kriegerIsWallFor(dd, x, y, worldSeed) {
  if (x <= 0 || y <= 0 || x >= KRIEGER_WORLD - 1 || y >= KRIEGER_WORLD - 1) return true;
  if (kriegerIsBroken(dd, x, y)) return false;
  return kriegerIsWall(x, y, worldSeed);
}

// Werkzeuge — Verbrauchsgüter (Entscheidung 2026-07-21: kein Dauer-Werkzeug, sonst wäre
// die halbe Karte nach einem Kauf offen und der Erkundungsdruck weg).
// Bestand in dd.tools{key:anzahl}, analog zu dd.potions.
// REGELANPASSUNG 2026-07-21 (JP: „die Bombe ist da und die Granate — nicht als erstes"):
// Werkzeug ist Erschließungs-Gerät fürs mittlere Spiel, kein Startkauf. Es öffnet den Weg
// zu den Spezialisten/Burgen (ab Stufe 26) — davor gibt es nichts, wozu man sich durchgraben
// müsste, und ein Bohrer auf Stufe 3 nimmt der Höhle den Erkundungsdruck.
//   Bohrer:  ohne Gate → ab Stufe 18
//   Granate: ohne Gate → ab Stufe 26  (= Stufe des ersten Spezialisten)
// Die Shop-Sektion steht außerdem nicht mehr an zweiter, sondern an LETZTER Stelle.
const KRIEGER_TOOLS = [
  { key:'bohrer',  icon:'🔩', name:'Kaffeebohrer',  cost:250, radius:0, minLevel:18,
    desc:'Bricht EINE angrenzende Felswand auf. Verbraucht sich dabei.' },
  { key:'granate', icon:'💣', name:'Kaffeegranate', cost:600, radius:1, minLevel:26,
    desc:'Sprengt ein 3×3-Feld Fels weg — öffnet ganze Gänge auf einen Schlag.' },
];
function kriegerToolByKey(key)   { return KRIEGER_TOOLS.find(t => t.key === key) || null; }
function kriegerToolCount(dd, key) { return Math.max(0, (dd?.tools && dd.tools[key]) || 0); }
function kriegerHasAnyTool(dd)   { return KRIEGER_TOOLS.some(t => kriegerToolCount(dd, t.key) > 0); }

// Welche Felder würde dieses Werkzeug hier tatsächlich freisprengen?
// Nur echte Felswände zählen (offener Boden „verbraucht" keine Sprengung), und der
// Kartenrand ist ausgenommen — sonst wäre die Granate am Rand eine Nullnummer und
// der Spieler hätte 600 CC für nichts ausgegeben.
function kriegerBlastTiles(dd, tx, ty, tool, worldSeed) {
  const r = tool?.radius || 0;
  const out = [];
  for (let y = ty - r; y <= ty + r; y++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if (x <= 0 || y <= 0 || x >= KRIEGER_WORLD - 1 || y >= KRIEGER_WORLD - 1) continue; // Rand bleibt
      if (!kriegerIsWallFor(dd, x, y, worldSeed)) continue;                                // schon offen
      out.push({ x, y });
    }
  }
  return out;
}
// Neues dungeon_data nach dem Sprengen (rein additiv, bestehende Durchbrüche bleiben).
function kriegerApplyBlast(dd, tiles, toolKey) {
  const broken = { ...(dd?.brokenWalls || {}) };
  const now = Date.now();
  for (const t of tiles) broken[`${t.x},${t.y}`] = now;
  const tools = { ...(dd?.tools || {}) };
  tools[toolKey] = Math.max(0, (tools[toolKey] || 0) - 1);
  return { ...dd, brokenWalls: broken, tools };
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
  // ── Mittelalterlich (Tier 1: ab Stufe 1 · Tier 2 „Veredelt": ab Stufe 15) ──
  // Gate 2026-07-15 gesenkt 20→15 (User: „nicht genug schlagbare Gegner bis L20"): mit T2-Gear
  // ab L15 wird die große t2-Population schlagbar → t1-Grind nur bis ~L15 nötig. Dafür t1-Kern
  // vergrößert (maxDist 15→28) + Gegnerdichte erhöht (KRIEGER_ENEMY_P 0.12→0.15) = „deutlich mehr t1".
  { key:'schwert_mittelalter_t1',  slot:'weapon',   culture:'mittelalter', tier:1, icon:'⚔️', name:'Langschwert',        cost:140, minLevel:1,  atk:8,  def:0,  crit:0 },
  { key:'ruestung_mittelalter_t1', slot:'armor',    culture:'mittelalter', tier:1, icon:'🛡️', name:'Kettenrüstung',      cost:150, minLevel:1,  atk:0,  def:8,  crit:0 },
  { key:'amulett_mittelalter_t1',  slot:'talisman', culture:'mittelalter', tier:1, icon:'🧿', name:'Wappenschild-Anhänger', cost:120, minLevel:1, atk:0, def:0, crit:4 },
  { key:'stiefel_mittelalter_t1',  slot:'feet',     culture:'mittelalter', tier:1, icon:'👢', name:'Wanderstiefel',      cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'schwert_mittelalter_t2',  slot:'weapon',   culture:'mittelalter', tier:2, icon:'⚔️', name:'Ritterschwert',      cost:420, minLevel:15, atk:22, def:0,  crit:0 },
  { key:'ruestung_mittelalter_t2', slot:'armor',    culture:'mittelalter', tier:2, icon:'🛡️', name:'Plattenrüstung',     cost:450, minLevel:15, atk:0,  def:22, crit:0 },
  { key:'amulett_mittelalter_t2',  slot:'talisman', culture:'mittelalter', tier:2, icon:'🧿', name:'Drachenwappen-Amulett', cost:380, minLevel:15, atk:0, def:0, crit:10 },
  { key:'stiefel_mittelalter_t2',  slot:'feet',     culture:'mittelalter', tier:2, icon:'👢', name:'Ritterstiefel',      cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Europäisch ──
  { key:'rapier_europa_t1',        slot:'weapon',   culture:'europa', tier:1, icon:'🤺', name:'Rapier',           cost:150, minLevel:1,  atk:6,  def:0,  crit:2 },
  { key:'wams_europa_t1',          slot:'armor',    culture:'europa', tier:1, icon:'👘', name:'Samtwams',         cost:130, minLevel:1,  atk:0,  def:6,  crit:0 },
  { key:'siegelring_europa_t1',    slot:'talisman', culture:'europa', tier:1, icon:'💍', name:'Siegelring',       cost:120, minLevel:1,  atk:3,  def:3,  crit:0 },
  { key:'schuhe_europa_t1',        slot:'feet',     culture:'europa', tier:1, icon:'👞', name:'Lederschuhe',      cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'degen_europa_t2',         slot:'weapon',   culture:'europa', tier:2, icon:'🤺', name:'Hofdegen',         cost:480, minLevel:15, atk:18, def:0,  crit:6 },
  { key:'harnisch_europa_t2',      slot:'armor',    culture:'europa', tier:2, icon:'👘', name:'Brokat-Harnisch',  cost:420, minLevel:15, atk:0,  def:20, crit:0 },
  { key:'adelssiegel_europa_t2',   slot:'talisman', culture:'europa', tier:2, icon:'💍', name:'Adelssiegel',      cost:400, minLevel:15, atk:8,  def:8,  crit:4 },
  { key:'reitstiefel_europa_t2',   slot:'feet',     culture:'europa', tier:2, icon:'👞', name:'Reitstiefel',      cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Orientalisch ──
  { key:'saebel_orient_t1',        slot:'weapon',   culture:'orient', tier:1, icon:'🗡️', name:'Krummsäbel',       cost:160, minLevel:1,  atk:10, def:-2, crit:0 },
  { key:'kaftan_orient_t1',        slot:'armor',    culture:'orient', tier:1, icon:'🧥', name:'Seidenkaftan',     cost:110, minLevel:1,  atk:0,  def:4,  crit:0 },
  { key:'basaramulett_orient_t1',  slot:'talisman', culture:'orient', tier:1, icon:'🧿', name:'Basar-Amulett',    cost:170, minLevel:1,  atk:0,  def:0,  crit:7 },
  { key:'sandalen_orient_t1',      slot:'feet',     culture:'orient', tier:1, icon:'🥿', name:'Basar-Sandalen',   cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'saebel_orient_t2',        slot:'weapon',   culture:'orient', tier:2, icon:'🗡️', name:'Damaszener-Säbel', cost:500, minLevel:15, atk:26, def:-4, crit:0 },
  { key:'kettenhemd_orient_t2',    slot:'armor',    culture:'orient', tier:2, icon:'🧥', name:'Seiden-Kettenhemd',cost:380, minLevel:15, atk:0,  def:12, crit:5 },
  { key:'wesiramulett_orient_t2',  slot:'talisman', culture:'orient', tier:2, icon:'🧿', name:'Wesir-Amulett',    cost:600, minLevel:15, atk:0,  def:0,  crit:18 },
  { key:'kamelstiefel_orient_t2',  slot:'feet',     culture:'orient', tier:2, icon:'🥿', name:'Karawanen-Stiefel',cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Südamerikanisch ──
  { key:'keule_suedamerika_t1',    slot:'weapon',   culture:'suedamerika', tier:1, icon:'🏏', name:'Obsidian-Keule',  cost:140, minLevel:1,  atk:6,  def:2,  crit:0 },
  { key:'umhang_suedamerika_t1',   slot:'armor',    culture:'suedamerika', tier:1, icon:'🪶', name:'Federumhang',     cost:150, minLevel:1,  atk:0,  def:5,  crit:2 },
  { key:'sonnenscheibe_suedamerika_t1', slot:'talisman', culture:'suedamerika', tier:1, icon:'☀️', name:'Sonnenscheibe', cost:130, minLevel:1, atk:2, def:2, crit:2 },
  { key:'sandalen_suedamerika_t1', slot:'feet',     culture:'suedamerika', tier:1, icon:'🩴', name:'Naturfaser-Sandalen', cost:130, minLevel:1, atk:0, def:0, crit:0, steps:5 },
  { key:'keule_suedamerika_t2',    slot:'weapon',   culture:'suedamerika', tier:2, icon:'🏏', name:'Sonnenkeule',     cost:440, minLevel:15, atk:16, def:8,  crit:0 },
  { key:'umhang_suedamerika_t2',   slot:'armor',    culture:'suedamerika', tier:2, icon:'🪶', name:'Kondorumhang',    cost:460, minLevel:15, atk:0,  def:14, crit:6 },
  { key:'goldscheibe_suedamerika_t2', slot:'talisman', culture:'suedamerika', tier:2, icon:'☀️', name:'Goldene Sonnenscheibe', cost:480, minLevel:15, atk:8, def:8, crit:8 },
  { key:'kondorstiefel_suedamerika_t2', slot:'feet', culture:'suedamerika', tier:2, icon:'🩴', name:'Kondorfeder-Stiefel', cost:420, minLevel:15, atk:0, def:0, crit:0, steps:12 },

  // ══ Utility-Kulturen (2026-07-13) ══════════════════════════════════════════════════════════
  // 4 neue Kulturen mit NICHT-Kampf-Set-Boni (dungeon_fight bleibt unangetastet; Set-Effekt rein
  // clientseitig). Die 3 Kernteile (weapon/armor/talisman) gehen dennoch mit ihren Kampfwerten in
  // den serverseitigen Kampf ein → müssen in _krieger_item_stats/_krieger_item_culture (SQL,
  // migration_2026-07-13) gespiegelt sein. 'feet' bleibt clientseitig (kein SQL-Eintrag).
  // Kein Tier 3 (JP-Entscheidung: Kernset + Stiefel, T1+T2).

  // ── Steppe/Nomaden 🐺 · Set „Steppenwind" (+5 Schritte/Tag + Eröffnungssalve) — Bogen: ATK/CRIT, wenig DEF ──
  { key:'bogen_steppe_t1',    slot:'weapon',   culture:'steppe', tier:1, icon:'🏹', name:'Reflexbogen',            cost:150, minLevel:1,  atk:9,  def:-1, crit:2 },
  { key:'lamellen_steppe_t1', slot:'armor',    culture:'steppe', tier:1, icon:'🧥', name:'Lamellenrüstung',        cost:130, minLevel:1,  atk:0,  def:6,  crit:0 },
  { key:'feder_steppe_t1',    slot:'talisman', culture:'steppe', tier:1, icon:'🪶', name:'Adlerfeder-Talisman',    cost:140, minLevel:1,  atk:0,  def:0,  crit:5 },
  { key:'stiefel_steppe_t1',  slot:'feet',     culture:'steppe', tier:1, icon:'👟', name:'Steppenstiefel',         cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'bogen_steppe_t2',    slot:'weapon',   culture:'steppe', tier:2, icon:'🏹', name:'Kompositbogen',          cost:480, minLevel:15, atk:24, def:-2, crit:4 },
  { key:'lamellen_steppe_t2', slot:'armor',    culture:'steppe', tier:2, icon:'🧥', name:'Schwere Lamellenrüstung',cost:420, minLevel:15, atk:0,  def:18, crit:2 },
  { key:'feder_steppe_t2',    slot:'talisman', culture:'steppe', tier:2, icon:'🪶', name:'Adlerschwinge-Talisman', cost:440, minLevel:15, atk:0,  def:0,  crit:12 },
  { key:'stiefel_steppe_t2',  slot:'feet',     culture:'steppe', tier:2, icon:'👟', name:'Nomadenstiefel',         cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Handelsgilde/Hanse ⚖️ · Set „Handelsprivileg" (−15% Ausrüstung & Tränke) — DEF-Tank ──
  { key:'degen_handel_t1',  slot:'weapon',   culture:'handel', tier:1, icon:'⚔️', name:'Kontor-Degen',        cost:150, minLevel:1,  atk:6,  def:2,  crit:0 },
  { key:'robe_handel_t1',   slot:'armor',    culture:'handel', tier:1, icon:'🧥', name:'Zunft-Robe',          cost:140, minLevel:1,  atk:0,  def:8,  crit:0 },
  { key:'siegel_handel_t1', slot:'talisman', culture:'handel', tier:1, icon:'💰', name:'Handelssiegel',       cost:130, minLevel:1,  atk:0,  def:3,  crit:1 },
  { key:'schuhe_handel_t1', slot:'feet',     culture:'handel', tier:1, icon:'👞', name:'Kontor-Schuhe',       cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'degen_handel_t2',  slot:'weapon',   culture:'handel', tier:2, icon:'⚔️', name:'Meister-Kontor-Degen',cost:460, minLevel:15, atk:16, def:6,  crit:0 },
  { key:'robe_handel_t2',   slot:'armor',    culture:'handel', tier:2, icon:'🧥', name:'Hanse-Robe',          cost:440, minLevel:15, atk:0,  def:24, crit:0 },
  { key:'siegel_handel_t2', slot:'talisman', culture:'handel', tier:2, icon:'💰', name:'Großhandelssiegel',   cost:440, minLevel:15, atk:0,  def:8,  crit:4 },
  { key:'schuhe_handel_t2', slot:'feet',     culture:'handel', tier:2, icon:'👞', name:'Patrizier-Schuhe',    cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Freibeuter/Piraten ☠️ · Set „Freibeuterglück" (+50% Fund-Chance im Dungeon) — ATK/CRIT-Raider ──
  { key:'entermesser_freibeuter_t1', slot:'weapon',   culture:'freibeuter', tier:1, icon:'🗡️', name:'Entermesser',        cost:150, minLevel:1,  atk:8,  def:0,  crit:3 },
  { key:'mantel_freibeuter_t1',      slot:'armor',    culture:'freibeuter', tier:1, icon:'🧥', name:'Freibeuter-Mantel',  cost:130, minLevel:1,  atk:0,  def:5,  crit:1 },
  { key:'kompass_freibeuter_t1',     slot:'talisman', culture:'freibeuter', tier:1, icon:'🧭', name:'Schatzkompass',      cost:140, minLevel:1,  atk:1,  def:0,  crit:4 },
  { key:'seestiefel_freibeuter_t1',  slot:'feet',     culture:'freibeuter', tier:1, icon:'🥾', name:'Seestiefel',         cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'entermesser_freibeuter_t2', slot:'weapon',   culture:'freibeuter', tier:2, icon:'🗡️', name:'Kapitäns-Säbel',     cost:480, minLevel:15, atk:20, def:0,  crit:6 },
  { key:'mantel_freibeuter_t2',      slot:'armor',    culture:'freibeuter', tier:2, icon:'🧥', name:'Kapitäns-Mantel',    cost:420, minLevel:15, atk:0,  def:14, crit:4 },
  { key:'kompass_freibeuter_t2',     slot:'talisman', culture:'freibeuter', tier:2, icon:'🧭', name:'Goldkompass',        cost:440, minLevel:15, atk:4,  def:0,  crit:12 },
  { key:'seestiefel_freibeuter_t2',  slot:'feet',     culture:'freibeuter', tier:2, icon:'🥾', name:'Kaperfahrer-Stiefel',cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Kundschafter/Späher 🔭 · Set „Späherauge" (deckt passiv die Umgebung r=2 auf) — CRIT-Präzision ──
  { key:'dolch_spaeher_t1',       slot:'weapon',   culture:'spaeher', tier:1, icon:'🗡️', name:'Späher-Dolch',      cost:150, minLevel:1,  atk:7,  def:0,  crit:4 },
  { key:'tarnumhang_spaeher_t1',  slot:'armor',    culture:'spaeher', tier:1, icon:'🧥', name:'Tarnumhang',        cost:130, minLevel:1,  atk:0,  def:4,  crit:2 },
  { key:'fernrohr_spaeher_t1',    slot:'talisman', culture:'spaeher', tier:1, icon:'🔭', name:'Fernrohr-Talisman', cost:140, minLevel:1,  atk:0,  def:0,  crit:6 },
  { key:'pfadstiefel_spaeher_t1', slot:'feet',     culture:'spaeher', tier:1, icon:'🥾', name:'Pfadfinderstiefel', cost:130, minLevel:1,  atk:0,  def:0,  crit:0, steps:5 },
  { key:'dolch_spaeher_t2',       slot:'weapon',   culture:'spaeher', tier:2, icon:'🗡️', name:'Meucheldolch',      cost:480, minLevel:15, atk:18, def:0,  crit:8 },
  { key:'tarnumhang_spaeher_t2',  slot:'armor',    culture:'spaeher', tier:2, icon:'🧥', name:'Schattenumhang',    cost:420, minLevel:15, atk:0,  def:12, crit:6 },
  { key:'fernrohr_spaeher_t2',    slot:'talisman', culture:'spaeher', tier:2, icon:'🔭', name:'Adlerauge-Fernrohr', cost:440, minLevel:15, atk:0,  def:0,  crit:16 },
  { key:'pfadstiefel_spaeher_t2', slot:'feet',     culture:'spaeher', tier:2, icon:'🥾', name:'Kundschafterstiefel',cost:420, minLevel:15, atk:0,  def:0,  crit:0, steps:12 },

  // ── Tier 3 „Meisterlich" (ab Stufe 35, 2026-07-15 gesenkt 60→35) — 2 Waffen/Kultur: Pfad A klassisch, Pfad B mit Mechanik-Twist ──
  // KEIN Lock/Pfadzwang (JP-Entscheidung): beide frei kauf-/ausrüstbar. `mech` steuert serverseitige
  // Sonder-Logik in dungeon_fight (Waffen-Key-Prefix streitkolben/armbrust/wurfmesser/kriegsbogen) — die
  // Twist-Beschreibung ist reine UI-Vorschau, die Wirkung rechnet die RPC. Stats MÜSSEN mit
  // _krieger_item_stats() in migration_2026-07-08 übereinstimmen.
  // ── 🔥 TIER 4: Aschegürtel-Waffen (2026-07-30) ─────────────────────────────
  // JPs Belohnung ① — „neue Ausrüstungs-Stufe über allen bisherigen Sets".
  //
  // ⚠️ BEWUSST IN DEN BESTEHENDEN 8 KULTUREN, nicht als neunte Kultur:
  //   • kriegerBestOwnedInSlot sortiert nach `tier` absteigend → Tier 4 wird automatisch
  //     das beste Stück im Slot, ohne eine Zeile Sonderlogik.
  //   • Die Set-Boni bleiben gültig: eine Tier-4-Waffe ist weiter Teil ihres Kultur-Sets.
  //   • Eine neue Kultur hätte in KRIEGER_CULTURE_NAMES eingetragen werden müssen — und
  //     kriegerLordGate/kriegerCitadelLordGate iterieren genau darüber. Der BURGHERR
  //     hätte damit plötzlich auch das neue Set verlangt: eine stille Verschärfung des
  //     Bestands-Endgames, die niemand bestellt hat.
  // Stufe 60 / ~4 500 CC: erreichbar, sobald der Aschegürtel anfängt (t5 ab Stufe 42),
  // aber deutlich über Tier 3 (Stufe 35 / ~780 CC).
  { key:'schwert_mittelalter_t4',      slot:'weapon', culture:'mittelalter', tier:4, icon:'⚔️', name:'Aschekling-Zweihänder', cost:4600, minLevel:60, atk:52, def:4,  crit:0 },
  { key:'degen_europa_t4',             slot:'weapon', culture:'europa',      tier:4, icon:'🤺', name:'Glutstahl-Degen',       cost:4700, minLevel:60, atk:46, def:0,  crit:14 },
  { key:'saebel_orient_t4',            slot:'weapon', culture:'orient',      tier:4, icon:'🗡️', name:'Obsidian-Säbel',        cost:4800, minLevel:60, atk:48, def:0,  crit:12 },
  { key:'keule_suedamerika_t4',        slot:'weapon', culture:'suedamerika', tier:4, icon:'🪓', name:'Sonnenstein-Keule',     cost:4600, minLevel:60, atk:54, def:0,  crit:0 },
  { key:'bogen_steppe_t4',             slot:'weapon', culture:'steppe',      tier:4, icon:'🏹', name:'Steppenwind-Bogen',     cost:4700, minLevel:60, atk:50, def:0,  crit:8 },
  { key:'waage_handel_t4',             slot:'weapon', culture:'handel',      tier:4, icon:'⚖️', name:'Kontor-Streitwaage',    cost:4500, minLevel:60, atk:44, def:8,  crit:4 },
  { key:'entermesser_freibeuter_t4',   slot:'weapon', culture:'freibeuter',  tier:4, icon:'☠️', name:'Kaper-Entermesser',     cost:4700, minLevel:60, atk:51, def:0,  crit:10 },
  { key:'armbrust_spaeher_t4',         slot:'weapon', culture:'spaeher',     tier:4, icon:'🔭', name:'Fernrohr-Armbrust',     cost:4800, minLevel:60, atk:47, def:0,  crit:16 },
  { key:'schwert_mittelalter_t3',      slot:'weapon', culture:'mittelalter', tier:3, icon:'⚔️', name:'Zweihänder',      cost:780, minLevel:35, atk:34, def:0,  crit:0 },
  { key:'streitkolben_mittelalter_t3', slot:'weapon', culture:'mittelalter', tier:3, icon:'🔨', name:'Streitkolben',    cost:760, minLevel:35, atk:26, def:2,  crit:0, mech:'streitkolben', mechDesc:'Ignoriert 50% der gegnerischen Verteidigung.' },
  { key:'degen_europa_t3',             slot:'weapon', culture:'europa',      tier:3, icon:'🤺', name:'Meisterdegen',     cost:800, minLevel:35, atk:28, def:0,  crit:10 },
  { key:'armbrust_europa_t3',          slot:'weapon', culture:'europa',      tier:3, icon:'🏹', name:'Armbrust',         cost:760, minLevel:35, atk:20, def:0,  crit:6,  mech:'armbrust', mechDesc:'Garantierter Bonus-Erstschlag in Runde 1 (dafür niedrigerer Grund-ATK).' },
  { key:'saebel_orient_t3',            slot:'weapon', culture:'orient',      tier:3, icon:'🗡️', name:'Shamshir',        cost:800, minLevel:35, atk:38, def:-6, crit:0 },
  { key:'wurfmesser_orient_t3',        slot:'weapon', culture:'orient',      tier:3, icon:'🔪', name:'Wurfmesser-Set',   cost:780, minLevel:35, atk:20, def:0,  crit:8,  mech:'wurfmesser', mechDesc:'Mehrere kleine Treffer, jeder mit eigener CRIT-Chance (CRIT-Synergie).' },
  { key:'keule_suedamerika_t3',        slot:'weapon', culture:'suedamerika', tier:3, icon:'🏏', name:'Kriegskeule',     cost:780, minLevel:35, atk:26, def:12, crit:0 },
  { key:'kriegsbogen_suedamerika_t3',  slot:'weapon', culture:'suedamerika', tier:3, icon:'🏹', name:'Kriegsbogen',     cost:760, minLevel:35, atk:24, def:4,  crit:0,  mech:'kriegsbogen', mechDesc:'Bonus-Schaden gegen Gegner mit hoher Verteidigung.' },

  // ── Tier 3 Rüstung + Talisman (NEU 2026-07-15, ab Stufe 35) — vervollständigen das Meister-Set
  // (weapon+armor+talisman gleicher Kultur → Set-Bonus). Nur die 4 klassischen Kulturen (Utility-
  // Kulturen bleiben bei T2). Kampfwerte MÜSSEN mit _krieger_item_stats() in migration_2026-07-15b
  // übereinstimmen; _krieger_item_culture erkennt die Kultur bereits per LIKE am Key. ──
  { key:'ruestung_mittelalter_t3', slot:'armor',    culture:'mittelalter', tier:3, icon:'🛡️', name:'Turnierrüstung',      cost:740, minLevel:35, atk:0,  def:32, crit:0 },
  { key:'amulett_mittelalter_t3',  slot:'talisman', culture:'mittelalter', tier:3, icon:'🧿', name:'Großmeister-Wappen',   cost:700, minLevel:35, atk:0,  def:4,  crit:14 },
  { key:'harnisch_europa_t3',      slot:'armor',    culture:'europa',      tier:3, icon:'👘', name:'Kürass-Harnisch',      cost:740, minLevel:35, atk:0,  def:30, crit:0 },
  { key:'adelssiegel_europa_t3',   slot:'talisman', culture:'europa',      tier:3, icon:'💍', name:'Fürstensiegel',        cost:720, minLevel:35, atk:10, def:10, crit:8 },
  { key:'kettenhemd_orient_t3',    slot:'armor',    culture:'orient',      tier:3, icon:'🧥', name:'Sultans-Kettenhemd',   cost:720, minLevel:35, atk:0,  def:16, crit:10 },
  { key:'wesiramulett_orient_t3',  slot:'talisman', culture:'orient',      tier:3, icon:'🧿', name:'Kalifen-Amulett',      cost:780, minLevel:35, atk:0,  def:0,  crit:26 },
  { key:'umhang_suedamerika_t3',   slot:'armor',    culture:'suedamerika', tier:3, icon:'🪶', name:'Quetzal-Umhang',       cost:740, minLevel:35, atk:0,  def:20, crit:10 },
  { key:'goldscheibe_suedamerika_t3', slot:'talisman', culture:'suedamerika', tier:3, icon:'☀️', name:'Sonnengott-Scheibe', cost:760, minLevel:35, atk:10, def:10, crit:12 },

  // ── Tier 3 VERVOLLSTÄNDIGT (2026-07-21, JP: „nicht alle Kulturen haben Stufe-3-Ausrüstung") ──
  // Vorher-Zustand, gemessen statt geschätzt:
  //   • 4 klassische Kulturen: T3 = 2 Waffen + Rüstung + Talisman → STIEFEL fehlten
  //     (T1/T2 hatten je einen) — ein T3-Träger fiel beim Schritte-Budget auf T2 zurück.
  //   • 4 Utility-Kulturen (Steppe/Handel/Freibeuter/Späher): GAR KEIN T3 — ihre Sets
  //     endeten auf T2 und waren ab Stufe 35 chancenlos gegen die Kern-Kulturen.
  // Jetzt hat jede der 8 Kulturen alle 4 Slots in allen 3 Tiers.
  //
  // ⚠️ Zwei Regeln, die diesen Block bestimmen:
  //  1. `feet` steht NICHT in _krieger_item_stats() — Stiefel haben keine Kampfwerte,
  //     nur `steps` (rein clientseitig). Die 8 neuen Stiefel brauchen deshalb KEIN SQL.
  //  2. weapon/armor/talisman werden serverseitig gelesen → die 12 Utility-Kampfteile
  //     MÜSSEN mit migration_2026-07-21i_krieger_t3_utility.sql übereinstimmen.
  // Bewusst KEINE zweite Waffe mit `mech` für die Utility-Kulturen: die Mechaniken
  // (streitkolben/armbrust/wurfmesser/kriegsbogen) erkennt dungeon_fight am Key-Prefix,
  // eine neue würde einen Eingriff in die Kampf-RPC verlangen. Die Utility-Kulturen
  // tragen ihre Eigenart ohnehin im Set-Bonus, nicht in der Waffe.

  // Stiefel T3 der 4 klassischen Kulturen (steps 12 → 20, kein SQL nötig)
  { key:'stiefel_mittelalter_t3',      slot:'feet', culture:'mittelalter', tier:3, icon:'👢', name:'Turnierstiefel',      cost:700, minLevel:35, atk:0, def:0, crit:0, steps:20 },
  { key:'reitstiefel_europa_t3',       slot:'feet', culture:'europa',      tier:3, icon:'👞', name:'Hofreitstiefel',      cost:700, minLevel:35, atk:0, def:0, crit:0, steps:20 },
  { key:'kamelstiefel_orient_t3',      slot:'feet', culture:'orient',      tier:3, icon:'🥿', name:'Seidenstraßen-Stiefel', cost:700, minLevel:35, atk:0, def:0, crit:0, steps:20 },
  { key:'kondorstiefel_suedamerika_t3',slot:'feet', culture:'suedamerika', tier:3, icon:'🩴', name:'Anden-Stiefel',       cost:700, minLevel:35, atk:0, def:0, crit:0, steps:20 },

  // Steppe 🐺 — ATK/CRIT, wenig DEF (Linie aus T1/T2 fortgeschrieben)
  { key:'bogen_steppe_t3',    slot:'weapon',   culture:'steppe', tier:3, icon:'🏹', name:'Khan-Reflexbogen',    cost:780, minLevel:35, atk:32, def:-3, crit:6 },
  { key:'lamellen_steppe_t3', slot:'armor',    culture:'steppe', tier:3, icon:'🧥', name:'Khan-Lamellenpanzer', cost:720, minLevel:35, atk:0,  def:26, crit:3 },
  { key:'feder_steppe_t3',    slot:'talisman', culture:'steppe', tier:3, icon:'🪶', name:'Steppenadler-Schwinge', cost:740, minLevel:35, atk:0, def:0,  crit:18 },
  { key:'stiefel_steppe_t3',  slot:'feet',     culture:'steppe', tier:3, icon:'👟', name:'Khan-Stiefel',        cost:700, minLevel:35, atk:0,  def:0,  crit:0, steps:20 },

  // Handelsgilde ⚖️ — DEF-Tank
  { key:'degen_handel_t3',  slot:'weapon',   culture:'handel', tier:3, icon:'⚔️', name:'Patrizier-Degen',    cost:760, minLevel:35, atk:22, def:10, crit:0 },
  { key:'robe_handel_t3',   slot:'armor',    culture:'handel', tier:3, icon:'🧥', name:'Kontorherren-Robe',  cost:740, minLevel:35, atk:0,  def:34, crit:0 },
  { key:'siegel_handel_t3', slot:'talisman', culture:'handel', tier:3, icon:'💰', name:'Hansesiegel',        cost:740, minLevel:35, atk:0,  def:12, crit:8 },
  { key:'schuhe_handel_t3', slot:'feet',     culture:'handel', tier:3, icon:'👞', name:'Ratsherren-Schuhe',  cost:700, minLevel:35, atk:0,  def:0,  crit:0, steps:20 },

  // Freibeuter ☠️ — ATK/CRIT-Raider
  { key:'entermesser_freibeuter_t3', slot:'weapon',   culture:'freibeuter', tier:3, icon:'🗡️', name:'Admirals-Säbel',   cost:780, minLevel:35, atk:28, def:0,  crit:10 },
  { key:'mantel_freibeuter_t3',      slot:'armor',    culture:'freibeuter', tier:3, icon:'🧥', name:'Admirals-Mantel',  cost:720, minLevel:35, atk:0,  def:20, crit:6 },
  { key:'kompass_freibeuter_t3',     slot:'talisman', culture:'freibeuter', tier:3, icon:'🧭', name:'Sternkompass',     cost:750, minLevel:35, atk:6,  def:0,  crit:18 },
  { key:'seestiefel_freibeuter_t3',  slot:'feet',     culture:'freibeuter', tier:3, icon:'🥾', name:'Admirals-Stiefel', cost:700, minLevel:35, atk:0,  def:0,  crit:0, steps:20 },

  // Späher 🔭 — CRIT-Präzision
  { key:'dolch_spaeher_t3',       slot:'weapon',   culture:'spaeher', tier:3, icon:'🗡️', name:'Schattenklinge',       cost:780, minLevel:35, atk:24, def:0,  crit:14 },
  { key:'tarnumhang_spaeher_t3',  slot:'armor',    culture:'spaeher', tier:3, icon:'🧥', name:'Nebelumhang',          cost:720, minLevel:35, atk:0,  def:16, crit:10 },
  { key:'fernrohr_spaeher_t3',    slot:'talisman', culture:'spaeher', tier:3, icon:'🔭', name:'Falkenauge-Fernrohr',  cost:760, minLevel:35, atk:0,  def:0,  crit:22 },
  { key:'pfadstiefel_spaeher_t3', slot:'feet',     culture:'spaeher', tier:3, icon:'🥾', name:'Grenzgänger-Stiefel',  cost:700, minLevel:35, atk:0,  def:0,  crit:0, steps:20 },

  // ── Kaffeesatz-Lesen / Sicht (Etappe 4, Slot 'scan') — kulturunabhängig, KEINE Kampfwerte.
  // Deckt Feld-KATEGORIEN im Nebel auf (⚔️/🪙), nie exakte Belohnung. Rein clientseitig
  // (kein Eintrag in _krieger_item_stats nötig, da dungeon_fight sie nicht liest).
  { key:'kaffeeglas_scan', slot:'scan', culture:null, tier:1, icon:'🔍', name:'Kaffee-Glas',        cost:200, minLevel:5, atk:0, def:0, crit:0, scan:'line',    scanDesc:'Deckt 5 Felder in der zuletzt gelaufenen Richtung auf.' },
  { key:'wirbelsud_scan',  slot:'scan', culture:null, tier:2, icon:'🌀', name:'Wirbel-Sud',         cost:450, minLevel:15, atk:0, def:0, crit:0, scan:'ring',    scanDesc:'Deckt einen Ring bei Radius 3 um dich auf (aktualisiert sich beim Laufen).' },
  { key:'orakel_scan',     slot:'scan', culture:null, tier:3, icon:'🔮', name:'Kaffeesatz-Orakel',  cost:850, minLevel:45, atk:0, def:0, crit:0, scan:'checker', scanDesc:'Deckt jedes 2. Feld in Radius 6 auf — große, aber lückenhafte Sicht.' },

  // ── 🧱 Belagerung (Slot 'siege', 2026-07-21) ──────────────────────────────
  // Reine GATE-ÖFFNER für die Burgmauern (siehe kriegerCastleGate). Bewusst nur ein
  // kleiner ATK-Bonus: sie sollen die normale Ausrüstungs-Progression nicht verdrängen,
  // sondern Zugang zu neuem Content geben. Eigene „Kultur" belagerung → bekommt im Shop
  // automatisch eine eigene Sektion; nie Teil eines Set-Bonus (kriegerActiveSetCulture
  // prüft nur weapon+armor+talisman, dieser Slot kann also nie ein Set kapern).
  { key:'ramme_siege',     slot:'siege', culture:'belagerung', tier:1, icon:'🔨', name:'Sturmramme',   cost:900,  minLevel:25, atk:6,  def:0, crit:0, siege:1, mechDesc:'Bricht die Mauer der Nordfeste (Belagerungsstufe 1).' },
  { key:'katapult_siege',  slot:'siege', culture:'belagerung', tier:2, icon:'🎯', name:'Katapult',     cost:1800, minLevel:30, atk:12, def:0, crit:0, siege:2, mechDesc:'Belagerungsstufe 2 — öffnet zusätzlich die Ostwacht.' },
  { key:'trebuchet_siege', slot:'siege', culture:'belagerung', tier:3, icon:'⚙️', name:'Trebuchet',    cost:3200, minLevel:35, atk:20, def:0, crit:0, siege:3, mechDesc:'Belagerungsstufe 3 — bricht die Mauern der 8 Burgen und die Bastionen der Zitadellen I–II.' },
  // 🔥 BELAGERUNGSSTUFE 4 (2026-07-30) — der Schlüssel zu den Zitadellen 9–16.
  // ⚠️ OHNE dieses Gerät sind Grad III und IV des Aschegürtels nicht öffenbar; das war der
  // letzte echte Blocker der Leiter. `siege:4` ist der Wert, den kriegerCitadelGate prüft.
  // Preis/Stufe bewusst deutlich über dem Trebuchet: es ist Endgame-Gerät, kein Zwischenschritt.
  { key:'moerser_siege',   slot:'siege', culture:'belagerung', tier:4, icon:'🌋', name:'Aschemörser',  cost:12000, minLevel:70, atk:34, def:0, crit:0, siege:4, mechDesc:'Belagerungsstufe 4 — sprengt auch verglaste Asche. Öffnet die Zitadellen III–IV.' },
];

// ── Begleiter (4. Slot, Etappe 3) ─────────────────────────────────────────────
// Pro Kultur ein Begleittier mit passivem Kampf-Skill — bewusst NICHT Teil des 3-Slot-Set-Bonus
// (keine Regeländerung am bestehenden Set). Nur EINER gleichzeitig aktiv (dd.companion = key).
// Besitz in dd.owned (wie Items), Wirkung serverseitig in dungeon_fight (Key-basiert).
const KRIEGER_COMPANIONS = [
  { key:'falke_mittelalter', culture:'mittelalter', icon:'🦅', name:'Wappenfalke',    cost:600, minLevel:10, desc:'+10% CoffeeCoins nach jedem Sieg.' },
  { key:'pudel_europa',      culture:'europa',      icon:'🐩', name:'Salon-Pudel',    cost:600, minLevel:10, desc:'+10% EP nach jedem Sieg.' },
  { key:'kamel_orient',      culture:'orient',      icon:'🐪', name:'Karawanen-Kamel',cost:600, minLevel:10, desc:'+50% Trost-EP bei einer Niederlage.' },
  { key:'lama_suedamerika',  culture:'suedamerika', icon:'🦙', name:'Anden-Lama',     cost:600, minLevel:10, desc:'Heilt +2 HP pro Runde (stapelt mit dem Sonnenkraft-Set).' },
];
function kriegerCompanionByKey(key) { return KRIEGER_COMPANIONS.find(c => c.key === key) || null; }
function kriegerActiveCompanion(dd) { return kriegerCompanionByKey(dd?.companion); }

// ── Reittiere (Slot 'mount', Etappe 5) ────────────────────────────────────────
// Erhöhen das tägliche Schritte-Budget (client, via kriegerStepsAllowed) UND geben einen
// kleinen Kampf-Boost (atk/def/crit), der serverseitig in dungeon_fight angewendet wird
// (Anti-Tamper: nur wenn im Besitz). Nur EINES aktiv (dd.mount). Nicht Teil des Set-Bonus.
// atk/def/crit MÜSSEN mit _krieger_mount_stats() in migration_2026-07-09 übereinstimmen.
const KRIEGER_MOUNTS = [
  { key:'pferd_mount',   icon:'🐴', name:'Streitross',  cost:700,  minLevel:15, steps:10, atk:5,  def:5,  crit:0, desc:'+10 Schritte/Tag · im Kampf +5 ATK & +5 DEF.' },
  { key:'pegasus_mount', icon:'🦄', name:'Pegasus',     cost:1000, minLevel:30, steps:12, atk:0,  def:12, crit:0, desc:'+12 Schritte/Tag · im Kampf +12 DEF.' },
  { key:'greif_mount',   icon:'🦅', name:'Greif',       cost:1100, minLevel:40, steps:14, atk:0,  def:0,  crit:8, desc:'+14 Schritte/Tag · im Kampf +8 CRIT-Chance.' },
  { key:'dino_mount',    icon:'🦖', name:'Ur-Saurier',  cost:1300, minLevel:55, steps:8,  atk:14, def:0,  crit:0, desc:'+8 Schritte/Tag · im Kampf +14 ATK.' },
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
function kriegerPeekTile(tx, ty, worldSeed, dd) {
  // dd optional (Bestandsschutz für alte Aufrufe): mit dd werden aufgesprengte Wände
  // als begehbar gemeldet, ohne dd bleibt das Verhalten exakt wie bisher.
  if (dd ? kriegerIsWallFor(dd, tx, ty, worldSeed) : kriegerIsWall(tx, ty, worldSeed)) return null;
  if (tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y) return { type: 'boss' };
  // Landmarken (2026-07-21) werden ohnehin durch den Nebel gezeichnet — der Scan meldet
  // hier „leer", damit er kein zweites Icon auf dasselbe Feld legt.
  if (typeof kriegerSiteAt === 'function' && kriegerSiteAt(tx, ty, worldSeed)) return { type: 'empty' };
  const dist = Math.max(Math.abs(tx - KRIEGER_START_X), Math.abs(ty - KRIEGER_START_Y));
  const rEnc = _tileRng(tx, ty, 5151, worldSeed)();
  if (rEnc < KRIEGER_ENEMY_P) return { type: 'enemy', tier: kriegerTierForDistance(dist, tx, ty, worldSeed) };
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
  const spaeher = kriegerSetActive(dd, 'spaeher'); // Späherauge-Set: passiver Umgebungs-Scan
  if (!scan && !spaeher) return [];
  const p = kriegerPos(dd);
  const out = [];
  const push = (x, y) => { if (x > 0 && x < KRIEGER_WORLD - 1 && y > 0 && y < KRIEGER_WORLD - 1) out.push({ x, y }); };
  if (scan && scan.scan === 'line') {
    let dx = dd?.lastDir?.dx || 0, dy = dd?.lastDir?.dy || 0;
    if (dx === 0 && dy === 0) dx = 1; // Fallback: nach rechts, falls noch nie gelaufen
    for (let k = 1; k <= 5; k++) push(p.x + dx * k, p.y + dy * k);
  } else if (scan && scan.scan === 'ring') {
    const r = 3;
    for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++) {
      if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) === r) push(x, y);
    }
  } else if (scan && scan.scan === 'checker') {
    const r = 6;
    for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++) {
      const cd = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
      if (cd >= 1 && cd <= r && ((x + y) % 2 === 0)) push(x, y);
    }
  }
  // Späherauge (2026-07-13): gefüllter Umgebungs-Block (Chebyshev ≤ r), unabhängig vom Scan-Item.
  if (spaeher) {
    const r = KRIEGER_SPAEHER_SET_RADIUS;
    for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++) {
      const cd = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
      if (cd >= 1 && cd <= r) push(x, y);
    }
  }
  return out;
}

const KRIEGER_CULTURE_NAMES = {
  mittelalter: '🛡️ Mittelalterlich',
  europa:      '🏰 Europäisch',
  orient:      '🌙 Orientalisch',
  suedamerika: '🦙 Südamerikanisch',
  steppe:      '🐺 Steppe',
  handel:      '⚖️ Handelsgilde',
  freibeuter:  '☠️ Freibeuter',
  spaeher:     '🔭 Kundschafter',
  // Keine echte Kultur, sondern eine eigene Shop-Sektion für den Belagerungs-Slot
  // (2026-07-21). Bildet nie ein Set: kriegerActiveSetCulture verlangt weapon+armor+
  // talisman derselben Kultur, und 'belagerung' hat ausschließlich slot:'siege'.
  // kriegerOwnedCompleteSets filtert sie aus demselben Grund automatisch heraus.
  belagerung:  '🧱 Belagerung',
};

const KRIEGER_SET_BONUSES = {
  mittelalter: { name: 'Eisern',         desc: 'Erste 2 gegnerische Treffer −50% Schaden, weitere −10% + Rüstungsdurchschlag (ignoriert 40% der Gegner-Verteidigung)' },
  europa:      { name: 'Hofdiplomatie',  desc: '25% Chance auf einen Extra-Angriff pro Runde + Sieg gibt +50% CC' },
  orient:      { name: 'Wüstensturm',    desc: 'CRIT-Chance +10 Prozentpunkte, CRITs treffen ×2,5 und jeder CRIT heilt +4 HP' },
  suedamerika: { name: 'Sonnenkraft',    desc: 'Heilt +3 HP pro Runde + Sieg gibt +20% EP' },
  // Utility-Sets (2026-07-13): teils Nicht-Kampf-Boni, clientseitig (Steppe-Salve/Europa/etc. serverseitig).
  steppe:      { name: 'Steppenwind',    desc: '+5 Schritte/Tag + Eröffnungssalve (Gratis-Fernschuss vor Runde 1)' },
  handel:      { name: 'Handelsprivileg',desc: '−25% Preis auf Ausrüstung & Tränke + 40% Trank-Rückvergütung nach Sieg' },
  freibeuter:  { name: 'Freibeuterglück',desc: '+50% Fund-Chance UND +75% CC pro Fund im Dungeon' },
  spaeher:     { name: 'Späherauge',     desc: 'deckt passiv die Umgebung (Radius 2) im Nebel auf' },
};

function kriegerItemsBySlot(slot) { return KRIEGER_ITEMS.filter(i => i.slot === slot); }
function kriegerItemByKey(key)    { return KRIEGER_ITEMS.find(i => i.key === key) || null; }

// Alle kulturgebundenen Items eines Tiers besessen? (Sammler-Achievements 2026-07-16b) — deckt die
// 8 Kulturen × 4 Slots je Tier ab (Scan-Items culture:null zählen bewusst nicht mit).
function kriegerOwnsAllTier(dd, tier) {
  const owned = dd?.owned || {};
  const items = KRIEGER_ITEMS.filter(i => i.culture && i.tier === tier);
  return items.length > 0 && items.every(i => owned[i.key]);
}

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
  if (!w || !a || !t) return null;
  // Härtung 2026-07-21: das Item muss auch WIRKLICH in den Slot gehören, in dem es steckt.
  // Vorher wurde nur die Kultur verglichen — ein (durch alte/kaputte Daten) in den
  // Waffen-Slot geratenes Rüstungs- oder Belagerungs-Item hätte ein Set vorgetäuscht.
  // Mit den neuen slot:'siege'-Items (alle Kultur 'belagerung') wäre daraus sonst ein
  // frei erfindbares „Set" geworden, das die harten Kultur-Gates aushebelt.
  if (w.slot !== 'weapon' || a.slot !== 'armor' || t.slot !== 'talisman') return null;
  if (w.culture === a.culture && a.culture === t.culture) return w.culture;
  return null;
}

// ── Utility-Set-Boni (2026-07-13) ─────────────────────────────────────────────
// 4 neue Kulturen mit NICHT-Kampf-Set-Boni. Alle Effekte rein clientseitig (dungeon_fight
// bleibt unangetastet). Aktiv, sobald weapon+armor+talisman derselben Kultur getragen werden.
const KRIEGER_STEPPE_SET_STEPS     = 5;    // Steppenwind: +Schritte/Tag (2026-07-16: 8→5, dafür Eröffnungssalve serverseitig)
const KRIEGER_HANDEL_SET_DISCOUNT  = 0.25; // Handelsprivileg: −25% auf Ausrüstung & Tränke (2026-07-16: 0.15→0.25)
const KRIEGER_HANDEL_POTION_REFUND = 0.4;  // Handelsprivileg: 40% Trank-Wert zurück nach Sieg mit Trank
const KRIEGER_REFUND_CAP           = 20;   // Anti-Grind (2026-07-16, 2026-07-16d: 10→20): max. Sieg-Schritt-Erstattungen/Tag
// Level-abhängiger Deckel (2026-07-17, User): ab Stufe 25 nur noch 10 Sieg-Erstattungen/Tag
// (statt 20) — hohe Level erreichen das "die Beine werden schwer"-Ende früher. Darunter bleibt 20.
const KRIEGER_REFUND_CAP_HL        = 10;   // gesenkter Deckel für hohe Level
const KRIEGER_REFUND_CAP_HL_LEVEL  = 25;   // ab dieser Stufe greift der gesenkte Deckel
function kriegerRefundCap(level) {
  return (level || 1) >= KRIEGER_REFUND_CAP_HL_LEVEL ? KRIEGER_REFUND_CAP_HL : KRIEGER_REFUND_CAP;
}
const KRIEGER_FREIBEUTER_FIND_MULT = 1.5;  // Freibeuterglück: ×1.5 Fund-Chance
const KRIEGER_SPAEHER_SET_RADIUS   = 2;    // Späherauge: passiver Umgebungs-Scan (Chebyshev r)
function kriegerSetActive(dd, culture) {
  return kriegerActiveSetCulture(dd?.equipped) === culture;
}
function kriegerSetStepBonus(dd) { return kriegerSetActive(dd, 'steppe') ? KRIEGER_STEPPE_SET_STEPS : 0; }
function kriegerPriceFactor(dd)  { return kriegerSetActive(dd, 'handel') ? (1 - KRIEGER_HANDEL_SET_DISCOUNT) : 1; }
function kriegerDiscountedCost(baseCost, dd) { return Math.round((baseCost || 0) * kriegerPriceFactor(dd)); }
function kriegerFindMult(dd)     { return kriegerSetActive(dd, 'freibeuter') ? KRIEGER_FREIBEUTER_FIND_MULT : 1; }

// ── Auto-Ausrüsten (2026-07-15, User-Wunsch: „ein Klick, der ein komplettes Set anlegt") ──
// Bestes besessenes Item eines Slots (optional kulturgefiltert): höchster Tier, bei
// Gleichstand nach Schritten (feet), Tier (scan) bzw. Kampfsumme (weapon/armor/talisman).
function kriegerBestOwnedInSlot(dd, slot, culture) {
  const owned = dd?.owned || {};
  const cand = KRIEGER_ITEMS.filter(i => i.slot === slot && owned[i.key] && (!culture || i.culture === culture));
  if (!cand.length) return null;
  const score = i => slot === 'feet' ? (i.steps || 0)
    : slot === 'scan' ? (i.tier || 0)
    : ((i.atk || 0) + (i.def || 0) + (i.crit || 0));
  return cand.slice().sort((a, b) => (b.tier - a.tier) || (score(b) - score(a)))[0];
}
// Kulturen, deren komplettes Kern-Set (weapon+armor+talisman) bereits im Besitz ist.
function kriegerOwnedCompleteSets(dd) {
  return Object.keys(KRIEGER_CULTURE_NAMES).filter(c =>
    kriegerBestOwnedInSlot(dd, 'weapon', c) &&
    kriegerBestOwnedInSlot(dd, 'armor', c) &&
    kriegerBestOwnedInSlot(dd, 'talisman', c));
}
// Neues equipped-Objekt: Kern-Set einer Kultur anlegen + besten besessenen feet/scan-Slot füllen
// (feet/scan sind nicht Teil des Set-Bonus → global bestes ist immer vorteilhaft).
function kriegerEquipSetLoadout(dd, culture) {
  const eq = { ...(dd?.equipped || {}) };
  const w = kriegerBestOwnedInSlot(dd, 'weapon', culture);
  const a = kriegerBestOwnedInSlot(dd, 'armor', culture);
  const t = kriegerBestOwnedInSlot(dd, 'talisman', culture);
  if (w) eq.weapon = w.key;
  if (a) eq.armor = a.key;
  if (t) eq.talisman = t.key;
  const feet = kriegerBestOwnedInSlot(dd, 'feet');
  const scan = kriegerBestOwnedInSlot(dd, 'scan');
  if (feet) eq.feet = feet.key;
  if (scan) eq.scan = scan.key;
  return eq;
}

// ── Gegner (MUSS exakt mit _krieger_enemy_stats in SQL übereinstimmen) ──────
// CC-Belohnungen 2026-06-30 nach unten korrigiert (User-Feedback "darf nicht zu viel sein"),
// 2026-07-04 wieder auf die ursprünglichen Plan-Werte angehoben (lohnte sich nicht gegenüber
// Ausrüstungspreisen) — muss synchron mit _krieger_enemy_stats() in
// migration_kaffee_krieger.sql bleiben, hier nur die UI-Vorschau vor dem Kampf.
// abilities[] MUSS index-gleich zu flavor[] und exakt zu _krieger_enemy_ability(tier,idx)
// in migration_2026-07-04_krieger_erweiterung_e1.sql passen (gleiche Sync-Pflicht wie die Stats).
const KRIEGER_ENEMIES = [
  // Level-Gates 2026-07-13 gesenkt (Balance-Fix, PLAN_krieger_levelgates_senken.md): die t1-Zone
  // (Distanz ≤15) liefert laut Labyrinth-Simulation im Schnitt nur ~780 erreichbare EP — die alte
  // t2-Schwelle (Stufe 8 / 1.470 EP) war damit aus reinem t1-Content oft gar nicht erreichbar.
  // Nur minLevel gesenkt (t2 8→4, t3 18→9, t4 32→16); Distanz-Zonen/Stats/Boss unverändert.
  { tier:'t1',   name:'Schaum-Gesindel', flavor:['🫧 Milchschaum-Wicht','👹 Bohnen-Goblin','🟤 Kaffeesatz-Schleim'], abilities:['aufschaeumen','bohnenwurf','zaeh'], hp:60,  atk:11, def:2,  ccMin:20,  ccMax:35,  ep:25,  minLevel:1,  maxDist:28 },
  { tier:'t2',   name:'Mahlwerk-Bande',  flavor:['⚙️ Mahlwerk-Golem','👻 Filterpapier-Geist','🔨 Tamper-Troll'],      abilities:['stampfer','durchsichtig','verdichtung'], hp:110, atk:16, def:7,  ccMin:45,  ccMax:75,  ep:55,  minLevel:4,  maxDist:46 },
  { tier:'t3',   name:'Röster-Horde',    flavor:['🔥 Röstkammer-Zwerg','🕷️ Säure-Spinne','🐍 Crema-Hydra'],          abilities:['roestfeuer','aetzend','regeneration'], hp:200, atk:25, def:13, ccMin:90,  ccMax:140, ep:100, minLevel:9,  maxDist:60 },
  // ── 🔥 DER ASCHEGÜRTEL (2026-07-30) ────────────────────────────────────────
  // ⚠️ REIHENFOLGE IST FUNKTION, NICHT KOSMETIK: kriegerZoneTier() läuft dieses Array
  // von oben nach unten und nimmt den ERSTEN Eintrag mit `dist <= maxDist`. Die neuen
  // Tiers MÜSSEN deshalb VOR t4 stehen (t4 hat maxDist 90 und würde sonst alles
  // abfangen). Ergebnis der Zonen-Obergrenzen:
  //   dist ≤ 60 → unverändert t3 oder tiefer   ·   61–64 → t5   ·   65–69 → t6   ·   70+ → t7
  // t4 ist damit für kein erreichbares Feld mehr die Obergrenze — es taucht aber weiter
  // auf, weil kriegerTierForDistance() alle Tiers UNTER der Zone mit einmischt
  // (in einer t5-Zone: t5 ~37 % · t4 ~25 % · t3/t2/t1 je ~12 %). Bestandsspieler finden
  // draussen also weiterhin kämpfbare Gegner, auch unter Stufe 42.
  //
  // ⚠️ GEMESSENE WELTGRENZE: die erreichbare Karte endet bei Distanz **72** (150×150,
  // Start 75,75, Labyrinth-Flood-Fill lässt nur 10–12 % der Felder übrig). Ein Ring
  // „ab 80" wäre tote Inhalte gewesen. Darum liegt der Gürtel bei 56–72.
  //
  // Werte: Basis hier, Level-Zuschlag kommt oben drauf (atk +lv/4, def +lv/5, hp +lv×2).
  // Auf Spielerstufe 100 also t5 720/83/54 · t6 980/103/66 · t7 1350/129/82 — gegen
  // 480 Spieler-HP. Fähigkeiten sind bewusst BESTEHENDE Schlüssel: nur die sind in
  // dungeon_fight implementiert, ein neuer Name wäre eine wirkungslose Fähigkeit.
  { tier:'t5',   name:'Aschebrut',       flavor:['🌑 Aschekriecher','🔥 Glutbalg','🗻 Schlackekolossus'],           abilities:['aetzend','roestfeuer','bitterkern'],       hp:520,  atk:58,  def:34, ccMin:420,  ccMax:640,  ep:460,  minLevel:42, maxDist:64 },
  { tier:'t6',   name:'Glutkelch-Garde', flavor:['⚱️ Glutkelch-Wache','👁️ Schattenröster','⛓️ Kesselfürst'],        abilities:['verdichtung','geistform','adrenalinschub'], hp:780,  atk:78,  def:46, ccMin:700,  ccMax:1050, ep:720,  minLevel:58, maxDist:69 },
  { tier:'t7',   name:'Obsidian-Orden',  flavor:['🕳️ Obsidian-Novize','⚔️ Obsidian-Klinge','🐲 Obsidian-Großmeister'], abilities:['regeneration','stampfer','flammenatem'], hp:1150, atk:104, def:62, ccMin:1200, ccMax:1800, ep:1100, minLevel:75, maxDist:9999 },
  { tier:'t4',   name:'Koffein-Elite',   flavor:['⚡ Koffein-Berserker','👻 Espresso-Geist','🗿 Robusta-Titan'],      abilities:['adrenalinschub','geistform','bitterkern'], hp:340, atk:36, def:20, ccMin:170, ccMax:260, ep:170, minLevel:16, maxDist:90 },
  { tier:'boss', name:'Der Espresso-Drache', flavor:['🐉 Der Espresso-Drache'], abilities:['flammenatem'], hp:650, atk:50, def:28, ccMin:350, ccMax:550, ep:350, minLevel:55, maxDist:9999 },
];

// Flavor-Staffelung (Spiegel zu _krieger_flavor_mod in dungeon_fight): die 3 Flavor-
// Varianten je Tier geben gestaffelte Werte — idx0 ×0.7 (schwach), idx1 ×1.0, idx2 ×1.4
// (zäh). Boss + fehlender Index → ×1.0. Skaliert HP/ATK/DEF (Anzeige) und serverseitig EP.
function kriegerFlavorMod(tier, idx) {
  if (tier === 'boss' || idx == null) return 1;
  // 🔥 ZITADELLEN (2026-07-30): Faktor 1, ihre Tabellenwerte GELTEN.
  // ⚠️ BEFUND beim Bauen: Landmarken haben einelementige `flavor`-Arrays, also liefert
  // kriegerEnemyFlavorIdx immer 0 — und idx 0 bedeutet unten 0,7. Spezialisten und Burgen
  // werden dadurch seit dem 21.07. mit 70 % ihrer Tabellenwerte gekämpft.
  // Das wird hier NICHT korrigiert: es ist live eingespielte Balance, und ein stiller
  // Sprung auf 143 % wäre genau die Art Änderung, die niemand bestellt hat.
  // Die Zitadellen bekommen aber eine saubere Ausnahme, damit die dokumentierten Werte
  // (SQL und Client) auch die gekämpften sind — sonst wäre die ganze Eskalationsleiter
  // um 30 % verschoben und der Migrations-Kopf gelogen.
  // typeof-Wächter: die Tabelle steht weiter unten in der Datei. Zur AUFRUFZEIT ist sie
  // längst initialisiert, aber ein Aufruf während der Skript-Auswertung wäre sonst ein
  // ReferenceError (TDZ) — und der würde den ganzen Krieger-Tab lahmlegen.
  if (typeof KRIEGER_CITADEL_STATS === 'object' && KRIEGER_CITADEL_STATS[tier]) return 1;
  if (idx === 0) return 0.7;
  if (idx === 2) return 1.4;
  return 1;
}

// ── Gegner-Level-System (Balance-Rework 2026-07-13b) ─────────────────────────
// Jeder Gegner hat ein eigenes, tier-gebändertes Level, deterministisch aus den
// Tile-Koordinaten gewürfelt (löst zugleich den Flavor-Reroll-Exploit: gleiches
// Feld → immer gleiche Stufe/gleicher Flavor). Wirkt spiegelbildlich zum Spieler
// auf ATK/DEF/HP und erhöht die EP. Bänder MÜSSEN zu _krieger_enemy_level_band in
// migration_2026-07-13b_krieger_gegner_level.sql passen (Server clampt darauf).
// Bänder 2026-07-15 gesenkt (User: „Gegner viel zu stark, selbst L10 voll ausgerüstet"):
// die Ober-Level lagen deutlich über dem Spieler, der einen Tier gerade erst erreicht →
// Werte skalierten den Gegner weit über die eigene Ausrüstung. Enger + niedriger, damit
// Gegner nahe am eigenen Level bleiben. MUSS zu _krieger_enemy_level_band in SQL passen.
const KRIEGER_ENEMY_LEVEL_BANDS = { t1:[1,6], t2:[3,11], t3:[9,17], t4:[16,27], boss:[60,60],
  // 🔥 Aschegürtel (2026-07-30): WEITE Bänder mit Absicht — hier gilt NICHT die
  // Zufallslogik unten, sondern KRIEGER_SCALING_TIERS (Level = Spielerlevel + Offset).
  // ⚠️ Ohne diese Sonderbehandlung würde `lo + rng()*(hi-lo+1)` einen Gegner bis Stufe
  // 999 würfeln. Die Bänder sind nur die Server-Klammer, nicht die Verteilung.
  t5:[42,999], t6:[58,999], t7:[75,999],
  // Zitadellen: feste Leiter je Grad (die SQL clampt darauf). Bewusst NICHT mitwachsend —
  // eine Zitadelle wird einmal erobert und respawnt nie; ein mitwachsendes Ziel könnte
  // man nie endgültig schlagen.
  zit1_mauer:[45,60],  zit1_herr:[45,60],   zit2_mauer:[65,85],  zit2_herr:[65,85],
  zit3_mauer:[90,115], zit3_herr:[90,115],  zit4_mauer:[120,150], zit4_herr:[120,150],
  // Spezialisten/Burgen (2026-07-21): FESTE Level statt Band — sie stehen an festen Orten,
  // ein gewürfeltes Level wäre hier nur Rauschen. Muss zu _krieger_enemy_level_band in
  // migration_2026-07-21_krieger_burgen.sql passen (Server clampt darauf).
  sp_mittelalter:[26,26], sp_steppe:[27,27],      sp_spaeher:[28,28],  sp_europa:[29,29],
  sp_handel:[30,30],      sp_freibeuter:[31,31],  sp_suedamerika:[32,32], sp_orient:[34,34],
  burg_mauer:[26,26], burg_soeldner:[28,28], burg_bogen:[28,28], burg_hauptmann:[30,30],
  burg_hund:[27,27],  burg_magier:[30,30],   burg_giftmisch:[29,29], burg_herr:[38,38] };

// Deterministisches Gegner-Level für ein Feld (eigener Salt 3131, NICHT von anderen
// _tileRng-Salts belegt). Boss = fest 60.
// 🔥 MITWACHSENDE GEGNER (Aschegürtel, JP-Entscheidung 2026-07-30: „Ring + mitwachsende
// Gegner", ohne Deckel). Offset auf das SPIELERLEVEL — negativ = etwas leichter als man
// selbst, positiv = ebenbürtig bis fordernd.
// Damit wird der Gürtel nie wieder zu leicht, auch nicht auf Stufe 300.
// Der Sinn: JP war auf Stufe 100 gegen Gegner mit festem Level 16–27 unterwegs. Ein
// fester Wert veraltet zwangsläufig; ein Offset nicht.
const KRIEGER_SCALING_TIERS = { t5: -6, t6: -2, t7: +3 };
function kriegerEnemyLevel(tx, ty, tier, worldSeed, playerLevel) {
  const band = KRIEGER_ENEMY_LEVEL_BANDS[tier] || [0, 0];
  let lo = band[0], hi = band[1];
  // ⚠️ MUSS VOR der Zufallslogik stehen: die Bänder der neuen Tiers reichen bis 999,
  // ein `rng()` darüber würfelte Gegner jenseits jeder Spielbarkeit.
  const off = KRIEGER_SCALING_TIERS[tier];
  if (off !== undefined) {
    // ±2 Jitter, deterministisch pro Feld (gleicher Salt wie unten — dasselbe Feld
    // liefert immer dieselbe Stufe, kein Reroll durch Neuladen).
    const j = (typeof _tileRng === 'function')
      ? Math.floor(_tileRng(tx, ty, 3131, worldSeed)() * 5) - 2 : 0;
    // Auf das Band klemmen: `lo` ist das min_level des Tiers (der Server clampt ebenso,
    // ein manipulierter Client kann die Gegner also nicht herunterrechnen).
    return Math.max(lo, Math.min(hi, (playerLevel || lo) + off + j));
  }
  // Ab Spieler-Stufe 20 keine trivialen Level-1-Gegner mehr (User-Wunsch 2026-07-15): der
  // Level-Boden steigt mit dem Spieler (L20→4, L26→10, …), bleibt aber IM Tier-Band (min hi),
  // damit der Server-Clamp (_krieger_enemy_level_band) den Wert nicht wieder senkt → kein SQL.
  if (playerLevel && playerLevel >= 20) {
    lo = Math.max(lo, Math.min(hi, playerLevel - 16));
  }
  if (hi <= lo) return lo;
  if (typeof _tileRng !== 'function') return lo;
  return lo + Math.floor(_tileRng(tx, ty, 3131, worldSeed)() * (hi - lo + 1));
}

// Deterministischer Flavor-Index für ein Feld — GLEICHER Salt (6262) wie in
// kriegerExploreTile, damit die Prompt-Anzeige exakt zum gespeicherten Fund passt.
function kriegerEnemyFlavorIdx(tx, ty, tier, worldSeed) {
  const def = kriegerEnemyDef(tier);
  const n = (def && def.flavor) ? def.flavor.length : 1;
  if (typeof _tileRng !== 'function') return 0;
  return Math.floor(_tileRng(tx, ty, 6262, worldSeed)() * n);
}

// Skalierte Gegnerwerte (Flavor-Mod + Level-Bonus) für die Prompt-Anzeige — Spiegel
// der SQL-Formel: erst Flavor-Mod runden, DANN die Level-Boni addieren.
function kriegerEnemyStatsScaled(tier, flavorIdx, eLevel) {
  const def = kriegerEnemyDef(tier);
  if (!def) return { hp: 1, atk: 1, def: 0 };
  const fmod = kriegerFlavorMod(tier, flavorIdx);
  let hp  = Math.max(1, Math.round(def.hp  * fmod));
  let atk = Math.max(1, Math.round(def.atk * fmod));
  let dfn = Math.max(0, Math.round(def.def * fmod));
  const lv = Math.max(0, eLevel | 0);
  if (lv > 0) {
    atk += Math.floor(lv / 4);
    dfn += Math.floor(lv / 5);
    hp  += lv * 2;
  }
  return { hp, atk, def: dfn };
}

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
  regeneration:   { icon:'🐍', name:'Regeneration',  desc:'heilt sich einen festen HP-Betrag pro Runde (nicht unter 30% HP)' },
  adrenalinschub: { icon:'⚡', name:'Adrenalinschub',desc:'Schaden steigt, je niedriger seine HP' },
  geistform:      { icon:'👻', name:'Geistform',     desc:'dein erster Treffer im Kampf ist wirkungslos' },
  bitterkern:     { icon:'🗿', name:'Bitterkern',    desc:'−25% erlittener Schaden, dafür schwächere Angriffe' },
  flammenatem:    { icon:'🐉', name:'Flammenatem',   desc:'gewaltiger Feuer-Burst alle 5 Runden' },
};
function kriegerEnemyAbility(key) { return KRIEGER_ENEMY_ABILITIES[key] || null; }

// ── Talentbaum (1 Punkt je 5 Stufen, lineare Freischaltung) ──────────────────
// Effekte werden serverseitig in dungeon_fight angewendet (Schadensformel/EP); der
// Client spiegelt nur die statisch anzeigbaren Boni (fein_gemahlen/vollmundig) in
// _kriegerOwnStats. Talentpunkte werden aus dem Level ABGELEITET (nicht gespeichert):
//   verfügbar = floor(level/5) − Anzahl vergebener Talente.
// Gates 2026-07-12 halbiert (L5..L55 statt L10..L100) + neues 'lehrmeister' (+15% EP,
// serverseitig in dungeon_fight). Reihenfolge = lineare Freischaltreihenfolge.
const KRIEGER_TALENTS = [
  { level:5,   key:'kaffeepause',     icon:'☕', name:'Kaffeepause',       desc:'Einmalige Selbstheilung (15% Max-HP) bei halber HP.' },
  { level:10,  key:'lehrmeister',     icon:'📖', name:'Lehrmeister',       desc:'+15% EP nach jedem Kampf (dauerhaft schnelleres Aufsteigen).' },
  { level:15,  key:'ristretto',       icon:'⚡', name:'Ristretto-Vorschlag',desc:'Garantierter Bonus-Schaden in Runde 1 (Alpha-Strike).' },
  { level:20,  key:'roestmeister_wut',icon:'🔥', name:'Röstmeister-Wut',   desc:'Dein Schaden steigt, je niedriger deine HP fällt.' },
  { level:25,  key:'zweite_kanne',    icon:'🫖', name:'Zweite Kanne',      desc:'15% Chance, einen genutzten Trank nicht zu verbrauchen.' },
  { level:30,  key:'filterkaffee',    icon:'⏳', name:'Filterkaffee-Geduld',desc:'+2 max. Kampfrunden (mehr Comeback-Chance).' },
  { level:35,  key:'fein_gemahlen',   icon:'🎯', name:'Fein gemahlen',     desc:'CRIT-Chance pauschal +5 Prozentpunkte.' },
  { level:40,  key:'nachschlag',      icon:'🔁', name:'Nachschlag',        desc:'10% Chance, nach einem Sieg sofort erneut anzugreifen.' },
  { level:45,  key:'kalte_nerven',    icon:'🧊', name:'Kalte Nerven',      desc:'Der erste gegnerische Signatur-Skill im Kampf ist wirkungslos.' },
  { level:50,  key:'vollmundig',      icon:'💪', name:'Vollmundig',        desc:'+8% Max-HP.' },
  { level:55,  key:'meisterroester',  icon:'👑', name:'Meisterröster',     desc:'Alle anderen Talente wirken +50% stärker.' },
];
function kriegerTalentDef(key) { return KRIEGER_TALENTS.find(t => t.key === key) || null; }
function kriegerAssignedTalentCount(dd) { return Object.keys(dd?.talents || {}).length; }
// Verfügbare, noch nicht vergebene Talentpunkte — aus dem Level abgeleitet (nie negativ).
function kriegerTalentPoints(dd) {
  return Math.max(0, Math.floor((dd?.level || 1) / 5) - kriegerAssignedTalentCount(dd));
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

// Zonen-Obergrenze: der höchste Tier, der bei dieser Distanz überhaupt auftreten darf.
function kriegerZoneTier(dist) {
  for (const e of KRIEGER_ENEMIES) {
    if (e.tier === 'boss') continue;
    if (dist <= e.maxDist) return e.tier;
  }
  return 't4';
}

// Welcher Gegner-Tier steht auf einem Feld? (Durchmischung 2026-07-15, User-Wunsch
// „bei weiter Entfernung nicht nur schwere Gegner".) Die Distanz setzt jetzt nur noch die
// OBERGRENZE — darunter tauchen auch schwächere Tiers auf, mit abnehmender Häufigkeit.
// Deterministisch pro Feld (eigener Salt 5253, kollidiert mit keinem anderen _tileRng-Salt),
// damit Explore, Peek/Scouting und der Kampf-Prompt exakt denselben Tier würfeln. Ohne
// Koordinaten/Seed (alte Aufrufe) Fallback auf die reine Zonen-Obergrenze (unverändertes Verhalten).
// ⚠️ Reihenfolge = Stärke-Reihenfolge. Sie steuert die Durchmischung: der Zonen-Tier
// bekommt Gewicht 3, der direkt darunter 2, alle tieferen je 1. Die drei Aschegürtel-Tiers
// gehören ans ENDE (stärkste), sonst würden sie als „schwächere Beimischung" auch in den
// Anfängerzonen auftauchen — die min_level-Prüfung würde den Kampf dann serverseitig
// ablehnen und der Spieler stünde vor einem unkämpfbaren Feld.
const KRIEGER_TIER_ORDER = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
function kriegerTierForDistance(dist, tx, ty, worldSeed) {
  const zone = kriegerZoneTier(dist);
  const maxIdx = KRIEGER_TIER_ORDER.indexOf(zone);
  if (maxIdx <= 0 || typeof _tileRng !== 'function' || tx == null || ty == null) return zone;
  // Gewichte: Zonen-Tier am häufigsten (3), direkt darunter (2), alle tieferen je (1).
  // Bsp. t4-Zone → t4 43% · t3 29% · t2 14% · t1 14%; t2-Zone → t2 60% · t1 40%.
  const weights = [];
  let total = 0;
  for (let i = 0; i <= maxIdx; i++) {
    const d = maxIdx - i;                       // 0 = Zonen-Tier
    const w = d === 0 ? 3 : (d === 1 ? 2 : 1);
    weights.push(w); total += w;
  }
  let r = _tileRng(tx, ty, 5253, worldSeed)() * total;
  for (let i = 0; i <= maxIdx; i++) {
    r -= weights[i];
    if (r < 0) return KRIEGER_TIER_ORDER[i];
  }
  return zone;
}

// ── Gegner-Respawn (2026-07-15, User-Wunsch) ──────────────────────────────────
// Besiegte Gegner regenerieren im GLOBALEN 3-Tage-Takt (kein Einzel-Cooldown pro Feld):
// erster Respawn-Tick 12.07.2026 13:00 (Ortszeit), danach alle 3 Tage (15./18./21. … je 13:00).
// Ein besiegtes Feld (dd.defeatedAt[key] = Zeitpunkt des Siegs) ist wieder kämpfbar, sobald der
// jüngste Respawn-Tick NACH seinem Sieg liegt. Löst das „schon aufgedeckt / kein t1-Nachschub in
// der Mitte"-Problem für Bestandsspieler (rein clientseitig in dungeon_data, keine SQL).
// ANKER bei abweichendem Live-Tag hier anpassen (Monat ist 0-basiert: 6 = Juli).
const KRIEGER_RESPAWN_ANCHOR    = new Date(2026, 6, 12, 13, 0, 0).getTime();
const KRIEGER_RESPAWN_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;
// Zeitpunkt des jüngsten Respawn-Ticks ≤ now (vor dem ersten Anker → -Infinity, nichts respawnt).
function kriegerLastRespawnTick(now) {
  now = now || Date.now();
  if (now < KRIEGER_RESPAWN_ANCHOR) return -Infinity;
  const k = Math.floor((now - KRIEGER_RESPAWN_ANCHOR) / KRIEGER_RESPAWN_PERIOD_MS);
  return KRIEGER_RESPAWN_ANCHOR + k * KRIEGER_RESPAWN_PERIOD_MS;
}
// Ist ein Gegnerfeld aktuell wieder kämpfbar? (nie besiegt ODER seit-Sieg ein Tick vergangen)
function kriegerEnemyRespawned(dd, key) {
  const d = dd?.defeatedAt?.[key];
  if (d == null) return true;
  return d < kriegerLastRespawnTick();
}
// Cooldown = besiegt UND noch nicht respawnt.
function kriegerEnemyOnCooldown(dd, key) {
  return dd?.defeatedAt?.[key] != null && !kriegerEnemyRespawned(dd, key);
}
// Aktiver Kampf möglich: Encounter existiert (Tier gespeichert) UND respawnt/nie besiegt
// UND nicht dauerhaft besiegt. `permaDead[key]` wird beim ZWEITEN Sieg über ein Feld gesetzt
// (User-Wunsch 2026-07-15: jeder Gegner respawnt höchstens 1×, danach endgültig weg —
// verhindert dauerndes Nach-Grinden desselben t1-Kerns).
function kriegerEnemyActive(dd, key) {
  if (dd?.permaDead?.[key]) return false;
  return !!(dd?.encounters?.[key]) && kriegerEnemyRespawned(dd, key);
}
// Endgültig besiegt (2. Sieg). Bug-Fix 2026-07-21: `permaDead` wurde bisher NUR in
// kriegerEnemyActive gelesen — im Canvas-Render und im Tap-Handler kam der Zustand nicht vor.
// Da der Encounter seit dem Respawn-Umbau nach einem Sieg nicht mehr gelöscht wird, blieb ein
// endgültig besiegtes Feld als ⚔️ in VOLLER Deckkraft stehen (kriegerEnemyOnCooldown ist dort
// false, weil der Respawn-Tick längst vorbei ist) und der Tap blieb stumm → wirkte wie
// „geschlagene Gegner verschwinden nicht".
function kriegerEnemyPermaDead(dd, key) { return !!(dd?.permaDead?.[key]); }
// Nächster Respawn-Zeitpunkt eines besiegten Feldes (für „regeneriert in …"-Anzeige); 0 = schon aktiv.
function kriegerNextRespawnAt(dd, key) {
  const d = dd?.defeatedAt?.[key];
  if (d == null || d < kriegerLastRespawnTick()) return 0;
  const k = Math.floor((d - KRIEGER_RESPAWN_ANCHOR) / KRIEGER_RESPAWN_PERIOD_MS) + 1;
  return KRIEGER_RESPAWN_ANCHOR + k * KRIEGER_RESPAWN_PERIOD_MS;
}

// ══ 🔱 Kultur-Spezialisten & 🏰 Burgen (2026-07-21) ═══════════════════════════
// Endgame-Ebene über den bestehenden t1–t4-Gegnern. Zwei Bausteine:
//
//  1. 8 KULTUR-SPEZIALISTEN — je einer pro Kultur, mit HARTEM Gate: ohne das passende
//     Set (weapon+armor+talisman derselben Kultur) ist der Kampf gar nicht erst möglich.
//     Jeder droppt ein 🔱 Kultur-Siegel. Damit bekommen die 4 Utility-Kulturen
//     (Steppe/Handel/Freibeuter/Späher) erstmals einen echten Kampf-Zweck, und alle 8
//     Sets werden nacheinander gebraucht statt sich für eines zu entscheiden.
//  2. 4 BURGEN — mehrstufig (Mauer → Torwache → Burgherr). Doppeltes Gate: Siegel öffnen
//     das Tor, der Belagerungs-Slot bricht die Mauer. Eroberte Burgen respawnen nie.
//
// WICHTIG — bestehende Gegner bleiben unangetastet (User-Vorgabe 2026-07-21): t1–t4 und
// der Boss behalten Werte, Gates und Balance. Alles hier ist additiv, eine eigene
// Gegner-Liste (KRIEGER_SPECIALS statt KRIEGER_ENEMIES), damit kriegerZoneTier /
// kriegerTierForDistance / KRIEGER_TIER_ORDER unverändert weiterlaufen.
// Die Werte MÜSSEN mit _krieger_enemy_stats in migration_2026-07-21_krieger_burgen.sql
// übereinstimmen (gleiche Regel wie bei KRIEGER_ENEMIES — hier nur die UI-Vorschau).

// Belagerungs-Stufe eines Spielers (0 = keine Waffe). Öffnet die Burg-Mauern.
const KRIEGER_SIEGE_SLOT = 'siege';
function kriegerSiegeLevel(dd) {
  const item = kriegerItemByKey(dd?.equipped?.[KRIEGER_SIEGE_SLOT]);
  return item?.siege || 0;
}

// ── Die 8 Kultur-Spezialisten ────────────────────────────────────────────────
// `dist` = Chebyshev-Ringabstand vom Startpunkt (bestimmt, wie weit man laufen muss);
// `gateCulture` = das Set, das den Kampf überhaupt erst freischaltet.
const KRIEGER_SPECIALISTS = [
  { tier:'sp_mittelalter', gateCulture:'mittelalter', icon:'🛡️', name:'Panzer-Perkolator', flavor:'🛡️ Panzer-Perkolator',
    minLevel:26, dist:32, level:26, hp:280, atk:24, def:58, ccMin:200, ccMax:290, ep:200,
    gateHint:'Seine Panzerung schluckt jeden normalen Hieb. Nur der Rüstungsdurchschlag des Mittelalter-Sets kommt durch.' },
  { tier:'sp_steppe', gateCulture:'steppe', icon:'🐎', name:'Steppenreiter', flavor:'🐎 Steppenreiter',
    minLevel:26, dist:34, level:27, hp:240, atk:34, def:16, ccMin:210, ccMax:300, ep:210,
    gateHint:'Er reitet davon, bevor du in Reichweite bist. Nur mit der Leichtfüßigkeit des Steppen-Sets holst du ihn ein.' },
  { tier:'sp_spaeher', gateCulture:'spaeher', icon:'🏹', name:'Turm-Armbruster', flavor:'🏹 Turm-Armbruster',
    minLevel:27, dist:37, level:28, hp:230, atk:38, def:18, ccMin:220, ccMax:310, ep:220,
    gateHint:'Er schießt aus einer Distanz, die du ohne die Sichtweite des Späher-Sets nie überbrückst.' },
  { tier:'sp_europa', gateCulture:'europa', icon:'🎩', name:'Zoll-Baron', flavor:'🎩 Zoll-Baron',
    minLevel:28, dist:39, level:29, hp:300, atk:30, def:24, ccMin:260, ccMax:360, ep:240,
    gateHint:'Er fordert für jede Runde Wegzoll. Ohne den CC-Fluss des Europa-Sets bist du vor ihm pleite.' },
  { tier:'sp_handel', gateCulture:'handel', icon:'⚗️', name:'Röst-Alchemist', flavor:'⚗️ Röst-Alchemist',
    minLevel:29, dist:42, level:30, hp:320, atk:32, def:22, ccMin:270, ccMax:380, ep:250,
    gateHint:'Nur mit Tränken beizukommen — und die ruinieren dich ohne die Rückvergütung des Handels-Sets.' },
  { tier:'sp_freibeuter', gateCulture:'freibeuter', icon:'🐙', name:'Seeungeheuer', flavor:'🐙 Seeungeheuer',
    minLevel:30, dist:44, level:31, hp:380, atk:35, def:20, ccMin:290, ccMax:400, ep:270,
    gateHint:'Auf dem Wasser bist du ohne das Freibeuter-Set schlicht das Beutetier.' },
  { tier:'sp_suedamerika', gateCulture:'suedamerika', icon:'🦠', name:'Schimmel-Hydra', flavor:'🦠 Schimmel-Hydra',
    minLevel:30, dist:46, level:32, hp:420, atk:26, def:26, ccMin:300, ccMax:420, ep:280,
    gateHint:'Ihr Ätzschaden zermürbt dich über viele Runden. Ohne die Regeneration des Südamerika-Sets stirbst du am Zermürben.' },
  { tier:'sp_orient', gateCulture:'orient', icon:'👻', name:'Geisterritter', flavor:'👻 Geisterritter',
    minLevel:32, dist:49, level:34, hp:360, atk:40, def:28, ccMin:330, ccMax:460, ep:310,
    gateHint:'Physischer Schaden geht durch ihn hindurch. Nur der Krit-Lebensraub des Orient-Sets trifft die Geistform.' },
];

// ── Die 4 Burgen (3 Wellen je Burg) ──────────────────────────────────────────
// `seals` = benötigte Kultur-Siegel fürs Tor, `siege` = benötigte Belagerungs-Stufe.
// Eine Burg JE KULTUR (User-Wunsch 2026-07-21) — dieselben 8 Kulturen wie bei den
// Spezialisten. `culture` ist dabei kein Set-Gate (das prüft nur der Spezialist), sondern
// bestimmt Thema, Ort und das VERLANGTE EIGENE SIEGEL: die Burg einer Kultur öffnet sich
// erst, wenn ihr Spezialist gefallen ist. Zusätzlich braucht sie `seals` Siegel insgesamt,
// sodass die Reihenfolge zwangsläufig von leicht nach schwer läuft.
const KRIEGER_CASTLES = [
  { key:'burg_mittelalter', culture:'mittelalter', icon:'🏰', name:'Eisenfeste',      dist:50, seals:1, siege:1, minLevel:25 },
  { key:'burg_steppe',      culture:'steppe',      icon:'🏕️', name:'Steppenlager',    dist:54, seals:2, siege:1, minLevel:27 },
  { key:'burg_spaeher',     culture:'spaeher',     icon:'🗼', name:'Späherturm',      dist:58, seals:3, siege:2, minLevel:29 },
  { key:'burg_europa',      culture:'europa',      icon:'🏛️', name:'Zollpalast',      dist:62, seals:4, siege:2, minLevel:31 },
  { key:'burg_handel',      culture:'handel',      icon:'⚖️', name:'Handelskontor',   dist:66, seals:5, siege:2, minLevel:33 },
  { key:'burg_freibeuter',  culture:'freibeuter',  icon:'🏴‍☠️', name:'Kaperfestung',   dist:70, seals:6, siege:3, minLevel:35 },
  { key:'burg_suedamerika', culture:'suedamerika', icon:'🗿', name:'Sonnenpyramide',  dist:73, seals:7, siege:3, minLevel:37 },
  { key:'burg_orient',      culture:'orient',      icon:'🕌', name:'Wüstenzitadelle', dist:76, seals:8, siege:3, minLevel:40 },
];
// Eine Burg läuft in DREI Phasen ab (User-Wunsch 2026-07-21):
//   1. 🧱 MAUER   — ein Kampf. Gate: Belagerungswaffe (siehe castle.siege).
//   2. ⬡ BURGHOF — ein eigenes HEX-FELD (Radius 2 = 19 Waben) mit einer Garnison aus
//      verschiedenen Feindtypen. JEDE besetzte Wabe muss fallen, bevor die Mitte aufgeht.
//   3. 👑 BURGHERR — sitzt in der Mitte des Hex-Felds. Gate: JEDES Ausrüstungsteil
//      besitzen (alle 8 Kultur-Kernsets + Belagerungswaffe), siehe kriegerLordGate.
// minLevel MUSS gesetzt sein: es geht 1:1 als min_level in _krieger_enemy_stats und ist der
// SERVERSEITIGE Schutz. Die Burg-Gates (Siegel/Belagerung) sind Client-Logik im Ehrensystem —
// ohne min_level könnte ein manipulierter Client die Burgkämpfe auf Stufe 1 auslösen.
const KRIEGER_CASTLE_WALL = { tier:'burg_mauer', icon:'🧱', name:'Mauerwächter', hp:300, atk:20, def:70, ccMin:150, ccMax:220, ep:160, minLevel:25 };
const KRIEGER_CASTLE_LORD = { tier:'burg_herr',  icon:'👑', name:'Burgherr',     hp:520, atk:46, def:34, ccMin:400, ccMax:560, ep:380, minLevel:35 };

// Garnison-Typen für die Waben — bewusst unterschiedliche Profile (Panzer/Glaskanone/
// Heiler/Schwarm), damit der Burghof sich nicht wie 8× derselbe Kampf anfühlt.
const KRIEGER_GARRISON = [
  { tier:'burg_soeldner',  icon:'🗡️', name:'Söldner',        hp:190, atk:30, def:14, ccMin:90,  ccMax:140, ep:110 , minLevel:25 },
  { tier:'burg_bogen',     icon:'🏹', name:'Bogenschütze',   hp:150, atk:38, def:8,  ccMin:95,  ccMax:150, ep:115 , minLevel:25 },
  { tier:'burg_hauptmann', icon:'🛡️', name:'Wachhauptmann',  hp:260, atk:26, def:30, ccMin:120, ccMax:180, ep:140 , minLevel:25 },
  { tier:'burg_hund',      icon:'🐕', name:'Kesselhund',     hp:120, atk:34, def:6,  ccMin:70,  ccMax:110, ep:90 , minLevel:25 },
  { tier:'burg_magier',    icon:'🧙', name:'Röstmagier',     hp:170, atk:42, def:10, ccMin:110, ccMax:170, ep:130 , minLevel:25 },
  { tier:'burg_giftmisch', icon:'⚗️', name:'Giftmischer',    hp:200, atk:28, def:18, ccMin:105, ccMax:160, ep:125 , minLevel:25 },
];

// Werte-Skalierung je Burg (Nordfeste ×1.0 … Zitadelle ×1.9) — eine Definition,
// vier Schwierigkeitsstufen, statt alles einzeln zu pflegen.
// BEWUSST KEINE per-Burg-Werteskalierung (verworfen 2026-07-21): der Server kennt beim
// Kampf nur `p_enemy_tier`, nicht die Burg — ein clientseitiger Multiplikator hätte die
// Vorschau im Prompt von den echten, serverseitig gewürfelten Werten abweichen lassen
// (dieselbe Sync-Pflicht wie bei KRIEGER_ENEMIES ↔ _krieger_enemy_stats).
// Die Burgen unterscheiden sich stattdessen über Dinge, die rein clientseitig sauber sind:
// Garnisonsgröße (6 → 13 Waben), Siegel-Bedarf (1 → 8), Belagerungsstufe (1 → 3) und
// Mindest-Level (25 → 40). Die Zitadelle ist damit ein deutlich längerer Kampf, ohne dass
// zwei Wahrheiten über die Gegnerwerte entstehen.

// ── Hex-Burghof: Axial-Koordinaten (q,r), Radius 2 → 19 Waben ────────────────
const KRIEGER_HEX_RADIUS = 2;
function kriegerHexCells() {
  const out = [];
  const R = KRIEGER_HEX_RADIUS;
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push({ q, r });
  }
  return out; // 19 Waben, Mitte {0,0} = Burgherr
}
// Garnisonsgröße je Burg: Eisenfeste 6 … Wüstenzitadelle 13 Waben besetzt (von 18 möglichen,
// die Mitte gehört dem Burgherrn). Hart gedeckelt, damit kein Hof „überbucht" werden kann.
function kriegerGarrisonSize(castleIdx) { return Math.min(18, 6 + (castleIdx || 0)); }
// Deterministische Belegung des Burghofs aus dem Welt-Seed: welche Wabe trägt welchen Typ?
// Gleiche Burg → bei jedem Spieler dasselbe Feld (passt zur „feste Burgen"-Entscheidung).
function kriegerGarrisonLayout(castleIdx, worldSeed) {
  const cells = kriegerHexCells().filter(c => !(c.q === 0 && c.r === 0)); // Mitte bleibt dem Burgherrn
  // Deterministisch mischen (Fisher-Yates mit tile-RNG, eigener Salt 4242).
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(_tileRng(castleIdx, i, 4242, worldSeed)() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const n = Math.min(kriegerGarrisonSize(castleIdx), cells.length);
  return cells.slice(0, n).map((c, i) => {
    const ti = Math.floor(_tileRng(castleIdx, 100 + i, 4343, worldSeed)() * KRIEGER_GARRISON.length);
    return { q: c.q, r: c.r, key: `${c.q},${c.r}`, def: KRIEGER_GARRISON[ti] };
  });
}

// ══ 🔥 DIE 16 ZITADELLEN DES ASCHEGÜRTELS (2026-07-30) ═══════════════════════
// JP: „deutlich mehr Zitadellen, als angegeben und jede Schwerer als die davor" —
// plus „damit man auch trebuchet braucht".
//
// Zwei Kämpfe je Zitadelle: 🧱 Bastion (Belagerungs-Gate) → 👑 Zitadellenherr.
// Bewusst KEIN Hex-Burghof wie bei den 8 Burgen: bei 16 Zielen wären das 300+ Kämpfe,
// und die Eskalation soll aus der STÄRKE kommen, nicht aus der Wiederholung.
//
// ⚠️ VIER GRADE mit eigenen Basiswerten (Spiegel von _krieger_enemy_stats in
// migration_2026-07-30b_krieger_ascheguertel.sql). Über den Level-Kanal allein wären
// 16 Stufen nur ~20 % Unterschied (Lvl 45 → 150 = +210 hp / +26 atk) — keine Eskalation.
//   Grad I  (1– 4): Belagerung 3 = TREBUCHET PFLICHT · Level 45– 60
//   Grad II (5– 8): Belagerung 3                     · Level 65– 85
//   Grad III(9–12): Belagerung 4 (neues Gerät)       · Level 90–115
//   Grad IV(13–16): Belagerung 4                     · Level 120–150
//
// ⚠️ GEMESSENE WELTGRENZE: erreichbar ist nur bis Distanz 72 (150×150, Start 75,75,
// Labyrinth lässt 10–12 % übrig). Ziel-Distanzen 56–71, in dieser Spanne platzieren sich
// 16 Landmarken über 4 Welt-Seeds zuverlässig (16/16 gemessen).
//
// KETTE statt Siegel-Zahl: Zitadelle N verlangt, dass N−1 gefallen ist. Das erzwingt die
// Reihenfolge leicht → schwer ohne eine zweite Währung, und „jede schwerer als die davor"
// ist dadurch garantiert erlebbar statt nur rechnerisch wahr.
const KRIEGER_CITADEL_GRADES = [
  { grade:1, wall:'zit1_mauer', lord:'zit1_herr', siege:3, minLevel:42, lvlLo:45,  lvlHi:60  },
  { grade:2, wall:'zit2_mauer', lord:'zit2_herr', siege:3, minLevel:58, lvlLo:65,  lvlHi:85  },
  { grade:3, wall:'zit3_mauer', lord:'zit3_herr', siege:4, minLevel:75, lvlLo:90,  lvlHi:115 },
  { grade:4, wall:'zit4_mauer', lord:'zit4_herr', siege:4, minLevel:95, lvlLo:120, lvlHi:150 },
];
// 16 Namen mit steigender Wucht — die Reihenfolge IST die Schwierigkeitsleiter.
const KRIEGER_CITADELS = [
  { key:'zit01', icon:'🕯️', name:'Aschewacht',        dist:56 },
  { key:'zit02', icon:'🪨', name:'Schlackebastei',     dist:57 },
  { key:'zit03', icon:'⚱️', name:'Urnenfeste',         dist:58 },
  { key:'zit04', icon:'🔥', name:'Glutschanze',        dist:60 },
  { key:'zit05', icon:'⛓️', name:'Kettenwall',         dist:61 },
  { key:'zit06', icon:'🌑', name:'Schattenhorst',      dist:62 },
  { key:'zit07', icon:'🕳️', name:'Schlundbastion',     dist:63 },
  { key:'zit08', icon:'⚡', name:'Zornesturm',         dist:64 },
  { key:'zit09', icon:'🗡️', name:'Klingenzitadelle',   dist:65 },
  { key:'zit10', icon:'🐲', name:'Drachenhort',        dist:66 },
  { key:'zit11', icon:'💀', name:'Knochenkrone',       dist:67 },
  { key:'zit12', icon:'🌪️', name:'Sturmzitadelle',     dist:68 },
  { key:'zit13', icon:'🕸️', name:'Nachtgespinst',      dist:69 },
  { key:'zit14', icon:'🜂', name:'Ewige Röstglut',     dist:70 },
  { key:'zit15', icon:'👁️', name:'Auge des Aschegürtels', dist:71 },
  { key:'zit16', icon:'👑', name:'Obsidianthron',      dist:71 },
];
// ⚠️ CLIENT-SYNC-PFLICHT: exakter Spiegel der Zitadellen-Zeilen in _krieger_enemy_stats
// (migration_2026-07-30b). Reine UI-Vorschau — gekämpft wird serverseitig.
// `flavor` bleibt einelementig: bei festen Landmarken wäre eine Flavor-Auswahl nur
// Rauschen (dieselbe Entscheidung wie bei Spezialisten/Burgen), und kriegerFlavorMod
// liefert für idx 0 den Faktor 0,7 — deshalb wird beim Kampf bewusst idx=1 geschickt
// (Faktor 1,0), sonst wären alle Zitadellen 30 % schwächer als die SQL-Werte.
const KRIEGER_CITADEL_STATS = {
  zit1_mauer: { tier:'zit1_mauer', icon:'🧱', name:'Aschebastion',      flavor:['🧱 Aschebastion'],      abilities:['verdichtung'],  hp:700,  atk:40,  def:110, ccMin:500,  ccMax:700,  ep:500,  minLevel:42 },
  zit1_herr:  { tier:'zit1_herr',  icon:'👑', name:'Zitadellenherr',    flavor:['👑 Zitadellenherr'],    abilities:['adrenalinschub'], hp:900,  atk:70,  def:50,  ccMin:1500, ccMax:2200, ep:1400, minLevel:45 },
  zit2_mauer: { tier:'zit2_mauer', icon:'🧱', name:'Glasmauer',         flavor:['🧱 Glasmauer'],         abilities:['verdichtung'],  hp:1000, atk:52,  def:140, ccMin:800,  ccMax:1100, ep:800,  minLevel:58 },
  zit2_herr:  { tier:'zit2_herr',  icon:'👑', name:'Glutvogt',          flavor:['👑 Glutvogt'],          abilities:['roestfeuer'],   hp:1300, atk:88,  def:62,  ccMin:2600, ccMax:3800, ep:2300, minLevel:62 },
  zit3_mauer: { tier:'zit3_mauer', icon:'🧱', name:'Obsidianwall',      flavor:['🧱 Obsidianwall'],      abilities:['bitterkern'],   hp:1400, atk:66,  def:175, ccMin:1300, ccMax:1800, ep:1300, minLevel:75 },
  zit3_herr:  { tier:'zit3_herr',  icon:'👑', name:'Aschefürst',        flavor:['👑 Aschefürst'],        abilities:['regeneration'], hp:1800, atk:108, def:76,  ccMin:4200, ccMax:6000, ep:3600, minLevel:80 },
  zit4_mauer: { tier:'zit4_mauer', icon:'🧱', name:'Thronwall',         flavor:['🧱 Thronwall'],         abilities:['bitterkern'],   hp:1900, atk:82,  def:215, ccMin:2000, ccMax:2800, ep:2000, minLevel:95 },
  zit4_herr:  { tier:'zit4_herr',  icon:'👑', name:'Der Obsidianfürst', flavor:['👑 Der Obsidianfürst'], abilities:['flammenatem'],  hp:2400, atk:132, def:92,  ccMin:6500, ccMax:9500, ep:5500, minLevel:100 },
};
// ⚠️ Beim Kampf IMMER diesen Index schicken, nie 0 — siehe Kommentar oben (kriegerFlavorMod).
const KRIEGER_CITADEL_FLAVOR_IDX = 1;

// Grad einer Zitadelle aus ihrem Index (0-basiert): 4 je Grad.
function kriegerCitadelGrade(idx) {
  return KRIEGER_CITADEL_GRADES[Math.min(KRIEGER_CITADEL_GRADES.length - 1, Math.floor(idx / 4))];
}
function kriegerCitadelIdx(key) { return KRIEGER_CITADELS.findIndex(c => c.key === key); }
// Level einer Zitadelle: linear über die 4 Stufen ihres Grades. Muss INNERHALB des
// SQL-Bandes liegen (_krieger_enemy_level_band clampt), sonst senkt der Server den Wert.
function kriegerCitadelLevel(idx) {
  const g = kriegerCitadelGrade(idx);
  const step = idx % 4;                       // 0..3 innerhalb des Grades
  return Math.round(g.lvlLo + (g.lvlHi - g.lvlLo) * (step / 3));
}
// Fortschritt lebt in dd.citadels[key] = { wall: ts, lord: ts } — gleiches Muster wie
// dd.castles, kein Schema-Change (dungeon_data ist JSONB).
function kriegerCitadelState(dd, key) {
  const c = dd?.citadels?.[key];
  return { wall: c?.wall || 0, lord: c?.lord || 0 };
}
function kriegerCitadelTaken(dd, key) { return !!kriegerCitadelState(dd, key).lord; }
function kriegerCitadelsTaken(dd) {
  return KRIEGER_CITADELS.filter(c => kriegerCitadelTaken(dd, c.key)).length;
}
// Gate der Bastion: Stufe · Vorgänger-Zitadelle · Belagerungsstufe.
// ⚠️ Reihenfolge der Prüfungen = Reihenfolge der Erklärungen. Zuerst das, was der Spieler
// am ehesten selbst beheben kann (Stufe), zuletzt der Kauf (Belagerungsgerät) — sonst
// schickt man ihn in den Shop, obwohl er ohnehin noch zu klein ist.
function kriegerCitadelGate(dd, cit) {
  const idx   = kriegerCitadelIdx(cit.key);
  const g     = kriegerCitadelGrade(idx);
  const level = dd?.level || 1;
  if (level < g.minLevel) {
    return { ok: false, reason: `🔒 ${cit.icon} ${cit.name} — erst ab Stufe ${g.minLevel} (du bist ${level}).` };
  }
  if (idx > 0) {
    const prev = KRIEGER_CITADELS[idx - 1];
    if (!kriegerCitadelTaken(dd, prev.key)) {
      return { ok: false, reason: `⛓️ Der Aschegürtel fällt nur der Reihe nach.\n\n🔒 Nötig: `
        + `${prev.icon} ${prev.name} erobern (Zitadelle ${idx} von ${KRIEGER_CITADELS.length}).` };
    }
  }
  const siege = kriegerSiegeLevel(dd);
  if (siege < g.siege) {
    const need = KRIEGER_ITEMS.find(i => i.slot === KRIEGER_SIEGE_SLOT && i.siege === g.siege);
    return { ok: false, reason: `🧱 Diese Mauer ist aus verglaster Asche — dein Gerät reicht nicht.\n\n`
      + `🔒 Nötig: ${need ? need.icon + ' ' + need.name : 'Belagerungsstufe ' + g.siege} (Krieger-Shop).` };
  }
  return { ok: true };
}
// Gate des Zitadellenherrn: die Bastion muss gefallen sein. Ab Grad III zusätzlich das
// volle Weltset wie beim Burgherrn — ab dort ist es Endgame-Ausrüstungsprüfung.
function kriegerCitadelLordGate(dd, cit) {
  const st = kriegerCitadelState(dd, cit.key);
  if (!st.wall) {
    return { ok: false, reason: `🧱 Erst die Bastion brechen — der Herr zeigt sich nicht durch die Mauer.` };
  }
  const g = kriegerCitadelGrade(kriegerCitadelIdx(cit.key));
  if (g.grade >= 3) {
    const owned = dd?.owned || {};
    const missing = [];
    for (const culture of Object.keys(KRIEGER_CULTURE_NAMES)) {
      if (culture === 'belagerung') continue;
      const need = ['weapon', 'armor', 'talisman'].some(slot =>
        !KRIEGER_ITEMS.some(i => i.culture === culture && i.slot === slot && owned[i.key]));
      if (need) missing.push(KRIEGER_CULTURE_NAMES[culture] || culture);
    }
    if (missing.length) {
      return { ok: false, reason: `👑 Ab dem ${g.grade}. Grad empfängt dich nur, wer die ganze Welt `
        + `gerüstet hat.\n\n🔒 Es fehlt noch Ausrüstung aus: ${missing.join(', ')}.` };
    }
  }
  return { ok: true };
}

// ── Burg-Fortschritt (lebt in dd.castles[castleKey]) ─────────────────────────
// { wall: ts, hex: { "q,r": ts }, lord: ts } — alles clientseitig in dungeon_data,
// keine eigene Tabelle nötig (gleiches Muster wie defeatedAt/permaDead).
function kriegerCastleState(dd, castleKey) {
  const c = dd?.castles?.[castleKey];
  return { wall: c?.wall || 0, hex: c?.hex || {}, lord: c?.lord || 0 };
}
function kriegerCastleWallDown(dd, castleKey) { return !!kriegerCastleState(dd, castleKey).wall; }
function kriegerCastleTaken(dd, castleKey)    { return !!kriegerCastleState(dd, castleKey).lord; }
// Wie viele Garnisons-Waben sind noch offen?
function kriegerGarrisonRemaining(dd, castleKey, castleIdx, worldSeed) {
  const st = kriegerCastleState(dd, castleKey);
  return kriegerGarrisonLayout(castleIdx, worldSeed).filter(g => !st.hex[g.key]).length;
}
function kriegerGarrisonCleared(dd, castleKey, castleIdx, worldSeed) {
  return kriegerGarrisonRemaining(dd, castleKey, castleIdx, worldSeed) === 0;
}

// Nachschlagen wie kriegerEnemyDef, aber für die neuen Tiers. Getrennte Funktion, damit
// kriegerEnemyDef (und alles was daran hängt) unverändert bleibt.
function kriegerSpecialDef(tier) {
  if (tier === KRIEGER_CASTLE_WALL.tier) return KRIEGER_CASTLE_WALL;
  if (tier === KRIEGER_CASTLE_LORD.tier) return KRIEGER_CASTLE_LORD;
  // 🔥 Zitadellen-Tiers (2026-07-30). Die Werte MÜSSEN mit _krieger_enemy_stats in
  // migration_2026-07-30b übereinstimmen — hier nur die UI-Vorschau (wie bei allen anderen).
  const z = KRIEGER_CITADEL_STATS[tier];
  if (z) return z;
  return KRIEGER_SPECIALISTS.find(s => s.tier === tier)
      || KRIEGER_GARRISON.find(g => g.tier === tier)
      || null;
}
function kriegerIsSpecialTier(tier) { return !!tier && (tier.startsWith('sp_') || tier.startsWith('burg_')); }

// Kompatibilität mit dem bestehenden Kampf-Prompt (_showKriegerFightPrompt erwartet
// flavor[] + abilities[]): die neuen Gegner haben je nur EINE Erscheinungsform, deshalb
// hier einmalig auf die Array-Form normalisiert. Spart einen zweiten, parallelen
// Kampf-Dialog — der bestehende funktioniert damit unverändert auch für Spezialisten,
// Garnison, Mauer und Burgherr.
(function _kriegerNormalizeSpecials() {
  const all = [...KRIEGER_SPECIALISTS, ...KRIEGER_GARRISON, KRIEGER_CASTLE_WALL, KRIEGER_CASTLE_LORD];
  for (const e of all) {
    if (typeof e.flavor === 'string') e.flavor = [e.flavor];
    if (!Array.isArray(e.flavor)) e.flavor = [`${e.icon} ${e.name}`];
    if (!Array.isArray(e.abilities)) e.abilities = [null];
  }
})();

// kriegerEnemyDef um die neuen Tiers erweitert (Fallback, t1–t4/boss bleiben vorrangig und
// exakt wie bisher) — dadurch funktionieren Prompt, Statistik und Kampf ohne Sonderweg.
const _kriegerEnemyDefBase = kriegerEnemyDef;
kriegerEnemyDef = function (tier) { return _kriegerEnemyDefBase(tier) || kriegerSpecialDef(tier); };

// ── Platzierung auf der Weltkarte (fix aus dem worldSeed) ────────────────────
// Entscheidung 2026-07-21: alle Spieler einer Gruppe finden dieselben Spezialisten und
// Burgen an denselben Koordinaten — dadurch sind Ortsangaben im Chat sinnvoll („Nordfeste
// bei 75/23") und es entsteht ein Wettlauf. Die Sites werden EINMAL pro Seed berechnet.
//
// Zwei Fallstricke, die hier abgefangen werden:
//   a) Der Zielpunkt kann eine Felswand sein → Spiralsuche nach der nächsten freien Wabe.
//   b) Er kann in einer abgeschlossenen Höhlentasche liegen → nur Felder, die per
//      Flood-Fill vom Startpunkt aus erreichbar sind, werden akzeptiert. Sonst stünde die
//      Burg hinter Fels und wäre unerreichbar (das Labyrinth garantiert von Haus aus nur
//      die Verbindung Start↔Boss).
let _kriegerReachCache = {};
function _kriegerReachableMask(worldSeed) {
  if (_kriegerReachCache[worldSeed]) return _kriegerReachCache[worldSeed];
  const N = KRIEGER_WORLD;
  const grid = _kriegerMazeGrid(worldSeed);
  const seen = new Uint8Array(N * N);
  const stack = [[KRIEGER_START_X, KRIEGER_START_Y]];
  seen[KRIEGER_START_Y * N + KRIEGER_START_X] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const idx = ny * N + nx;
      if (seen[idx] || grid[idx] === 1) continue;
      seen[idx] = 1;
      stack.push([nx, ny]);
    }
  }
  _kriegerReachCache[worldSeed] = seen;
  return seen;
}

// Alle vom Start erreichbaren Felder mit ihrer Ringdistanz — die Kandidatenmenge für
// Landmarken. WICHTIG (Messung 2026-07-21): im generierten Labyrinth sind nur ~20% der
// offenen Felder vom Start aus erreichbar (die Höhlen-Generierung verbindet garantiert
// NUR Start↔Boss, alles andere sind abgeschlossene Taschen). Landmarken deshalb NICHT
// auf berechnete Himmelsrichtungen setzen — die landen fast immer hinter Fels —, sondern
// aus dieser Menge auswählen. Sonst wären 9 von 12 Burgen/Spezialisten unerreichbar.
function _kriegerReachableTiles(worldSeed) {
  const reach = _kriegerReachableMask(worldSeed);
  const out = [];
  for (let y = 2; y < KRIEGER_WORLD - 2; y++) {
    for (let x = 2; x < KRIEGER_WORLD - 2; x++) {
      if (!reach[y * KRIEGER_WORLD + x]) continue;
      if (x === KRIEGER_BOSS_POS.x && y === KRIEGER_BOSS_POS.y) continue;
      const d = Math.max(Math.abs(x - KRIEGER_START_X), Math.abs(y - KRIEGER_START_Y));
      if (d < 12) continue; // Startgebiet freihalten
      out.push({ x, y, d });
    }
  }
  return out;
}

let _kriegerSiteCache = null;
function kriegerSpecialSites(worldSeed) {
  if (_kriegerSiteCache && _kriegerSiteCache.seed === worldSeed) return _kriegerSiteCache.sites;
  const cand = _kriegerReachableTiles(worldSeed);
  const chosen = [];
  const MIN_SEP = 6; // Landmarken sollen nicht aufeinander kleben

  // Bestes erreichbares Feld für eine Wunsch-Distanz: möglichst nah an `targetDist`,
  // dabei möglichst weit weg von bereits vergebenen Landmarken. Deterministisch
  // (fester Kandidaten-Durchlauf + seed-abhängiger Mini-Jitter für Gruppenvielfalt).
  const pick = (targetDist, salt) => {
    let best = null, bestCost = Infinity;
    for (const c of cand) {
      if (c.taken) continue;
      let nearest = Infinity;
      for (const s of chosen) {
        const sep = Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y));
        if (sep < nearest) nearest = sep;
      }
      if (nearest < MIN_SEP) continue;
      const jitter = _tileRng(c.x, c.y, salt, worldSeed)() * 2.5;
      const cost = Math.abs(c.d - targetDist) - Math.min(nearest, 30) * 0.25 + jitter;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    if (best) { best.taken = true; chosen.push(best); }
    return best;
  };

  const sites = [];
  // Spezialisten zuerst (näher am Start), dann die Burgen (weiter draußen) — so bekommen
  // die knapperen Fernbereiche die Burgen und nicht zufällig ein Spezialist.
  KRIEGER_SPECIALISTS.forEach((sp, i) => {
    const p = pick(sp.dist, 6161 + i);
    if (p) sites.push({ kind: 'specialist', key: `${p.x},${p.y}`, x: p.x, y: p.y, def: sp });
  });
  KRIEGER_CASTLES.forEach((c, i) => {
    const p = pick(c.dist, 6262 + i);
    if (p) sites.push({ kind: 'castle', key: `${p.x},${p.y}`, x: p.x, y: p.y, def: c, idx: i });
  });
  // 🔥 Zitadellen ZULETZT (2026-07-30): Spezialisten und Burgen bekommen ihre Plätze
  // zuerst, damit der Aschegürtel keinen Bestands-Landmark verdrängt. `pick` liefert null,
  // wenn kein Feld mehr frei ist — dann fehlt die Zitadelle STILL. Gemessen: bei
  // Ziel-Distanzen 56–71 platzieren sich alle 16 über vier Welt-Seeds (16/16).
  // ⚠️ `plans/tests/test_zitadellen.js` prüft das nach; wer die Distanzen ändert, muss
  // den Test erneut laufen lassen — sonst verschwindet Inhalt unbemerkt.
  KRIEGER_CITADELS.forEach((c, i) => {
    const p = pick(c.dist, 7373 + i);
    if (p) sites.push({ kind: 'citadel', key: `${p.x},${p.y}`, x: p.x, y: p.y, def: c, idx: i });
  });

  _kriegerSiteCache = { seed: worldSeed, sites, map: new Map(sites.map(s => [s.key, s])) };
  return sites;
}
// Steht auf diesem Feld ein Spezialist oder eine Burg? (null = normales Feld)
function kriegerSiteAt(tx, ty, worldSeed) {
  kriegerSpecialSites(worldSeed);
  return _kriegerSiteCache?.map.get(`${tx},${ty}`) || null;
}

// ── 🔱 Kultur-Siegel ─────────────────────────────────────────────────────────
// Jeder besiegte Spezialist lässt das Siegel seiner Kultur fallen (dd.seals[culture] = ts).
function kriegerSeals(dd)      { return dd?.seals || {}; }
function kriegerSealCount(dd)  { return Object.keys(kriegerSeals(dd)).length; }
function kriegerHasSeal(dd, c) { return !!kriegerSeals(dd)[c]; }

// ── Gates ────────────────────────────────────────────────────────────────────
// Einheitliches Ergebnis { ok, reason } — die UI zeigt `reason` VOR dem Kampf an, nie als
// verlorenen Kampf (Anti-Frust-Regel: der Spieler weiß immer, was ihm konkret fehlt).
function kriegerSpecialistGate(dd, sp) {
  const level = dd?.level || 1;
  if (level < sp.minLevel) return { ok: false, reason: `🔒 ${sp.icon} ${sp.name} — erst ab Stufe ${sp.minLevel} (du bist ${level}).` };
  if (kriegerActiveSetCulture(dd?.equipped) !== sp.gateCulture) {
    const cname = KRIEGER_CULTURE_NAMES[sp.gateCulture] || sp.gateCulture;
    return { ok: false, reason: `${sp.icon} ${sp.gateHint}\n\n🔒 Nötig: komplettes ${cname}-Set (Waffe + Rüstung + Talisman).` };
  }
  return { ok: true };
}
// Burgmauer: Belagerungswaffe + Siegel fürs Tor.
function kriegerCastleGate(dd, castle) {
  const level = dd?.level || 1;
  if (level < castle.minLevel) return { ok: false, reason: `🔒 ${castle.icon} ${castle.name} — erst ab Stufe ${castle.minLevel} (du bist ${level}).` };
  // Eigenes Kultur-Siegel zuerst: die Burg einer Kultur öffnet sich erst, wenn ihr
  // Spezialist gefallen ist (sonst könnte man die Burgen an den Spezialisten vorbeispielen).
  if (castle.culture && !kriegerHasSeal(dd, castle.culture)) {
    const sp = KRIEGER_SPECIALISTS.find(s => s.gateCulture === castle.culture);
    const cname = KRIEGER_CULTURE_NAMES[castle.culture] || castle.culture;
    return { ok: false, reason: `🔱 Die ${castle.name} öffnet sich nur dem Träger des ${cname}-Siegels.\n\n🔒 Nötig: ${sp ? sp.icon + ' ' + sp.name : 'der Spezialist dieser Kultur'} besiegen.` };
  }
  const seals = kriegerSealCount(dd);
  if (seals < castle.seals) return { ok: false, reason: `🔱 Das Tor der ${castle.name} verlangt ${castle.seals} Kultur-Siegel — du hast ${seals}.\n\nSiegel bekommst du von den 8 Kultur-Spezialisten auf der Karte.` };
  const siege = kriegerSiegeLevel(dd);
  if (siege < castle.siege) {
    const need = KRIEGER_ITEMS.find(i => i.slot === KRIEGER_SIEGE_SLOT && i.siege === castle.siege);
    return { ok: false, reason: `🧱 Diese Mauer hältst du mit bloßen Händen nicht auf.\n\n🔒 Nötig: ${need ? need.icon + ' ' + need.name : 'Belagerungsstufe ' + castle.siege} (Krieger-Shop).` };
  }
  return { ok: true };
}
// Burgherr: JEDES Ausrüstungsteil besitzen (User-Wunsch 2026-07-21) — die Kern-Sets
// (Waffe+Rüstung+Talisman) aller 8 Kulturen plus die Belagerungswaffe der Burg.
function kriegerLordGate(dd, castle) {
  const owned = dd?.owned || {};
  const missing = [];
  for (const culture of Object.keys(KRIEGER_CULTURE_NAMES)) {
    if (culture === 'belagerung') continue;
    const need = ['weapon', 'armor', 'talisman'].some(slot =>
      !KRIEGER_ITEMS.some(i => i.culture === culture && i.slot === slot && owned[i.key]));
    if (need) missing.push(KRIEGER_CULTURE_NAMES[culture] || culture);
  }
  if (missing.length) {
    return { ok: false, reason: `👑 Der Burgherr empfängt nur, wer die ganze Welt bereist hat.\n\n🔒 Es fehlt noch Ausrüstung aus: ${missing.join(', ')}.` };
  }
  return { ok: true };
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
const KRIEGER_EXTRA_STEP_COST = 10;   // Basis/Fallback (Stufe 5) — siehe kriegerExtraStepCost
const KRIEGER_EXTRA_STEP_MAX  = 3;
// Regeländerung 2026-07-21 (User: „Schrittkosten immer das Doppelte des Levels, dann ist es
// fair"): der Zukauf kostete bisher PAUSCHAL 10 CC — für Stufe 2 spürbar, für Stufe 60 nichts.
// Jetzt skaliert er mit der Stufe: Kosten = Level × 2 CC.
//   Vorher: Stufe 5 → 10 CC · Stufe 30 → 10 CC · Stufe 60 → 10 CC
//   Nachher: Stufe 5 → 10 CC · Stufe 30 → 60 CC · Stufe 60 → 120 CC
// Minimum 2 CC (Stufe 1), damit der Einstieg nicht gratis wird.
function kriegerExtraStepCost(level) { return Math.max(2, (level || 1) * 2); }
// Volle Erholung: HP sofort auf 100 % für 60 CC (Alternative zu Cold Brew / „morgen wieder").
const KRIEGER_FULL_HEAL_COST  = 60;
function kriegerExtraStepsBought(dd) {
  if (!dd?.steps_extra_date || dd.steps_extra_date !== _kriegerTodayKey()) return 0;
  return Math.min(KRIEGER_EXTRA_STEP_MAX, dd.steps_extra_count || 0);
}
function kriegerExtraStepBonus(dd) { return kriegerExtraStepsBought(dd) * KRIEGER_EXTRA_STEPS; }
function kriegerStepsAllowed(level, dd) {
  const lvl = level || 1;
  const base = lvl <= 10 ? 10 + (lvl - 1) * 2 : 28 + Math.floor((lvl - 10) / 5) * 5;
  return base + (dd ? kriegerFeetBonus(dd) : 0) + (dd ? kriegerMountStepBonus(dd) : 0)
              + (dd ? kriegerExtraStepBonus(dd) : 0) + (dd ? kriegerSetStepBonus(dd) : 0);
}
// ⚠️ CLIENT-SYNC-PFLICHT: KRIEGER_LEVEL_MAX ist der Spiegel von `WHILE v_level < 999`
// in dungeon_fight (migration_2026-07-30_krieger_levelcap.sql).
//
// Vorher stand hier eine fest verdrahtete 100 — dieselbe Zahl wie serverseitig. JP
// 2026-07-30: „Problem wäre natürlich auch dass ab Level 100 kein Aufstieg mehr möglich
// ist..." Genau so war es: jede EP darüber verfiel ersatzlos, und die Anzeige stand
// dauerhaft auf „100 %". Ohne diese Anhebung ist jeder neue Endgame-Gegner wirkungslos —
// EP ohne Stufenaufstieg sind wertlos.
//
// 999 statt „unbegrenzt": die XP-Kurve (50 + 40 × Stufe) ist immer positiv, die
// Server-Schleife kann also nicht endlos laufen. Der Deckel schützt nur vor einem
// manipulierten XP-Wert. Bis Stufe 999 wären ~20 Mio. EP nötig — faktisch kein Deckel.
const KRIEGER_LEVEL_MAX = 999;
function kriegerProgress(dd) {
  const level = dd?.level || 1, xp = dd?.xp || 0;
  const need = level >= KRIEGER_LEVEL_MAX ? 0 : kriegerXpForLevel(level);
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
  // Aufgesprengte Wände (dd.brokenWalls) sind begehbar → dd-bewusste Variante.
  if (kriegerIsWallFor(dd, tx, ty, worldSeed)) return false; // Felswand — Labyrinth-Begrenzung
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
  if (kriegerIsWallFor(dd, tx, ty, worldSeed)) return { newDungeonData: dd, gimmick: null, encounter: null };

  const today = _kriegerTodayKey();
  const stepsUsed = kriegerStepsUsed(dd);
  const newExplored = { ...(dd?.explored || {}), [`${tx},${ty}`]: Date.now() };

  let gimmick = null, encounter = null;

  const isBossTile = tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y;
  // Spezialisten-/Burgfelder (2026-07-21) tragen NIE einen Zufallsgegner oder Fund: das
  // Betreten deckt die Landmarke nur auf, der Kampf startet erst durch Antippen (sonst
  // stolperte man ungewollt in einen gegateten Endgame-Kampf, während man nur läuft).
  const _site = (typeof kriegerSiteAt === 'function') ? kriegerSiteAt(tx, ty, worldSeed) : null;
  if (_site) {
    // kein encounter, kein gimmick — bewusst leer
  } else if (isBossTile) {
    encounter = { tier: 'boss', flavorIdx: 0 };
  } else {
    const dist = Math.max(Math.abs(tx - KRIEGER_START_X), Math.abs(ty - KRIEGER_START_Y));
    const rEnc = _tileRng(tx, ty, 5151, worldSeed)();
    if (rEnc < KRIEGER_ENEMY_P) {
      const tier = kriegerTierForDistance(dist, tx, ty, worldSeed);
      const def  = kriegerEnemyDef(tier);
      const flavorIdx = Math.floor(_tileRng(tx, ty, 6262, worldSeed)() * def.flavor.length);
      encounter = { tier, flavorIdx };
    } else {
      const rGim = _tileRng(tx, ty, 7373, worldSeed)();
      // Freibeuterglück-Set (2026-07-13): erhöht die Fund-Chance clientseitig (×1.5), deterministisch
      // pro Feld+Tag — ein zuvor „leeres" Feld kann so zum Fund werden. Encounter-Chance bleibt gleich.
      if (rGim < KRIEGER_GIMMICK_P * kriegerFindMult(dd)) {
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
          let amount = cc[0] + Math.floor(_tileRng(tx, ty, 8484, worldSeed)() * (cc[1] - cc[0] + 1));
          // Freibeuterglück (2026-07-15): das Set macht Funde nicht nur HÄUFIGER (×1.5 oben),
          // sondern auch WERTVOLLER — CC-Funde +75% (User: „gegenüber Späher noch nicht besser genug";
          // Späher dominiert durch Sicht, daher Freibeuter monetär deutlich anheben). Rein clientseitig.
          if (kriegerSetActive(dd, 'freibeuter')) amount = Math.round(amount * 1.75);
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
async function kriegerFight(memberId, enemyTier, flavorIdx, potionKey, potionKey2, enemyLevel) {
  return DB.dungeonFight(memberId, enemyTier, flavorIdx, potionKey, potionKey2, enemyLevel); // { won, log, cc_awarded, ep_awarded, new_level, leveled_up, set_bonus, rounds, enemy_ability, enemy_level, talent_points_gained, hp, hp_max, potion_used, potion_used2, new_dungeon_data } | { error }
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
    return kriegerIsWallFor(dd, wx, wy, worldSeed);
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
    } else if (encounters[key] && !(typeof kriegerEnemyPermaDead === 'function' && kriegerEnemyPermaDead(dd, key))) {
      // Endgültig besiegte Gegner werden GAR NICHT mehr gezeichnet (Entscheidung 2026-07-21:
      // „kann man den permaDead einfach entfernen, war schon so") — das Feld sieht wieder aus
      // wie vor dem Respawn-Umbau. Der Zweig hier greift nur noch für aktive Gegner und für
      // besiegte, die beim nächsten Tick zurückkehren (schwach angedeutet).
      // Altbestand: Felder mit permaDead-Flag UND noch vorhandenem encounters-Eintrag fallen
      // durch die Prüfung oben ebenfalls raus, ohne dass Daten migriert werden müssen.
      const _cd = (typeof kriegerEnemyOnCooldown === 'function') && kriegerEnemyOnCooldown(dd, key);
      if (_cd) ctx.globalAlpha = 0.28;
      ctx.font = `${Math.floor(T * 0.6)}px sans-serif`;
      ctx.fillText('⚔️', t.px + 3, t.py + T - 4);
      ctx.globalAlpha = 1.0;
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

  // ── Pass 5d: 🔱 Spezialisten & 🏰 Burgen (2026-07-21) ─────────────────────────
  // Landmarken. Sie stehen an FESTEN Orten und werden deshalb — anders als
  // Zufallsgegner — auch durch den Nebel angedeutet: sie sind Questziele, die man
  // ansteuern können muss, nicht Überraschungen, die man zufällig findet. Auf
  // erkundetem Boden voll sichtbar, im Nebel gedimmt (wie das Bossfeld darüber).
  // Zuletzt gezeichnet → liegen immer über Gegner-/Fund-Icons desselben Feldes.
  if (typeof kriegerSiteAt === 'function') {
    for (const t of [...floorTiles, ...fogTiles]) {
      const site = kriegerSiteAt(t.wx, t.wy, worldSeed);
      if (!site) continue;
      const isFog = !explored[`${t.wx},${t.wy}`];
      let icon = site.def.icon, alpha = isFog ? 0.5 : 1.0;
      if (site.kind === 'castle') {
        // Erobert → 🚩 Fahne statt Burg (klar unterscheidbar, „das ist erledigt").
        if (typeof kriegerCastleTaken === 'function' && kriegerCastleTaken(dd, site.def.key)) {
          icon = '🚩'; alpha = isFog ? 0.4 : 0.75;
        }
      } else if (site.kind === 'citadel') {
        // 🔥 Zitadellen (2026-07-30). Drei Zustände, damit man auf der Karte sieht, wo man
        // stehengeblieben ist: unangetastet → eigenes Symbol · Bastion gefallen → 🧱 ·
        // erobert → 🚩. Ohne diesen Zweig wären sie in den Spezialisten-Fall gelaufen und
        // hätten dauerhaft das Grundsymbol getragen (kein Absturz, aber kein Fortschritt
        // sichtbar — `site.def.gateCulture` ist bei Zitadellen undefined).
        const cst = (typeof kriegerCitadelState === 'function')
          ? kriegerCitadelState(dd, site.def.key) : { wall: 0, lord: 0 };
        if (cst.lord)      { icon = '🚩'; alpha = isFog ? 0.4 : 0.75; }
        else if (cst.wall) { icon = '🧱'; }
      } else if (typeof kriegerHasSeal === 'function' && kriegerHasSeal(dd, site.def.gateCulture)) {
        icon = '🔱'; alpha = isFog ? 0.4 : 0.7; // Siegel geholt → Spezialist erledigt
      }
      // Dezenter Sockel, damit die Landmarke sich vom Untergrund abhebt
      ctx.globalAlpha = isFog ? 0.25 : 0.4;
      // 🔥 Zitadellen bekommen einen glutroten Sockel — sie sollen sich auf den ersten
      // Blick von den goldenen Burgen und den blauen Spezialisten unterscheiden.
      ctx.fillStyle = site.kind === 'castle'  ? 'rgba(250,199,117,.5)'
                    : site.kind === 'citadel' ? 'rgba(255,120,70,.5)'
                                              : 'rgba(180,220,255,.45)';
      ctx.fillRect(t.px + 1, t.py + 1, T - 2, T - 2);
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.floor(T * (site.kind === 'castle' || site.kind === 'citadel' ? 0.78 : 0.66))}px sans-serif`;
      ctx.fillText(icon, t.px + 1, t.py + T - 2);
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
