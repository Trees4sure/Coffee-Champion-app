// ═══════════════════════════════════════════════════════════════════════════
// karte.js — Pixel Exploration Karte für Coffee Champion Imperium
// Geladen vor imperium.js; alle Exports als globale Funktionen.
// ═══════════════════════════════════════════════════════════════════════════

const KARTE_WORLD       = 128;
const KARTE_TILE        = 20;
const KARTE_VP_COLS     = 32;
const KARTE_VP_ROWS     = 28;
const KARTE_START_X     = 64;
const KARTE_START_Y     = 64;
const KARTE_BASE_STEPS  = 5;
const KARTE_EXTRA_STEPS = 5;
const KARTE_MAX_STEPS   = 10;
const KARTE_RESPAWN_MS  = 7 * 24 * 3600_000;
const KARTE_TREASURE_P  = 0.30;
const KARTE_EVENT_CHANCE = 0.20;

// ── Schatz-Bibliothek ─────────────────────────────────────────────────────────
const KARTE_TREASURES = [
  { emoji:'🥟', name:'Maultaschen vom Vortag',         cc:5,  quote:'Kalt, aber die Kantine war geschlossen. Survival at its finest.' },
  { emoji:'🥗', name:'Salatbar mit 14 Zutaten',        cc:8,  quote:'Gute Vorsätze plus 14 Toppings. Du bist heute ein anderer Mensch.' },
  { emoji:'🥙', name:'Döner mit allem',                cc:7,  quote:'Soße läuft die Hand runter. Das Meeting kann kurz warten.' },
  { emoji:'🍜', name:'Chinamann des Vertrauens',       cc:4,  quote:'Ente süßsauer? Hühnchen Teriyaki? Man erfährt es nie. Aber warm.' },
  { emoji:'🍝', name:'Pesto-Nudeln',                   cc:3,  quote:'Selbstgekocht oder Dose — diese Frage bleibt offen. Schmeckt.' },
  { emoji:'📦', name:'Mikrowellenessen',               cc:2,  quote:'3 Minuten, 850 Watt, Träume von echtem Essen. Kommt schon.' },
  { emoji:'🍕', name:'Tiefkühl-Pizza',                 cc:6,  quote:'Knusprig-Experiment. Der Ofen im Pausenraum lebt noch!' },
  { emoji:'🥩', name:'Frikadelle',                     cc:5,  quote:'Aus der Imbissvitrine. Noch ein bisschen warm. Gut genug für heute.' },
  { emoji:'🍞', name:'Fettbemme',                      cc:2,  quote:'Butterbrot auf Lehrertisch-Niveau. Aber ehrlich und sättigend.' },
  { emoji:'🧀', name:'Käsebrötchen',                   cc:3,  quote:'Gouda schmilzt noch leicht. Der 9-Uhr-Bäckerei-Run hat sich gelohnt.' },
  { emoji:'🌭', name:'Wiener Wurst',                   cc:4,  quote:'Mit Senf aus dem Päckchen. Klassiker des Büro-Overland-Survivals.' },
  { emoji:'🫙', name:'Kuskus-Salat',                   cc:6,  quote:'Minze, Feta, Granatapfelkerne. Jemand hat zu viele Kochsendungen gesehen.' },
  { emoji:'🍦', name:'Joghurt zum Nachtisch!',         cc:3,  quote:'Erdbeere ODER Mango — und das ist der kleine Luxus des Tages.' },
  { emoji:'🍪', name:'Kekse aus der Teeküche',         cc:2,  quote:'Wer hat die hingestellt? Danke, du anonymer Held dieser Etage.' },
  { emoji:'🍨', name:'Eiscreme aus der Tiefkühltruhe', cc:7,  quote:'Ein Magnum. Im Büro. Es gibt Gott und er liebt uns.' },
  { emoji:'🥤', name:'Cola aus dem Schrank',           cc:1,  quote:'Nicht explizit deine. Aber niemand schaut gerade hin. Prost.' },
  { emoji:'🥐', name:'Croissant vom Catering',         cc:4,  quote:'Übergeblieben vom Meeting der Führungsriege. Ihr Verlust, dein Gewinn.' },
  { emoji:'🍫', name:'Notfall-Schokolade',             cc:5,  quote:'In der Schublade der Assistentin. Sie weiß es. Sie schweigt. Du schuldest ihr.' },
  { emoji:'🥪', name:'Belegte Brote vom Catering',     cc:3,  quote:'Um 14:30 Uhr noch warm genug. Gerade noch so.' },
  { emoji:'☕', name:'Geheime zweite Kaffeemaschine',  cc:10, quote:'EINE ZWEITE KAFFEEMASCHINE. Im Keller. Schicksal hat dich hierher geführt.' },
  { emoji:'💰', name:'Kleingeld auf dem Kopierer',     cc:1,  quote:'1.80 Euro. Reicht für... symbolisch was. Schön trotzdem.' },
  { emoji:'🧃', name:'Multivitaminsaft',               cc:2,  quote:'Gesund ist auch eine Überlebensstrategie. Zählt.' },
];

// ── Random Events (20 Stück) ─────────────────────────────────────────────────
const KARTE_EVENTS = [
  { id: 'coffee_broken',    emoji: '☕💔', name: 'Kaffeemaschine defekt!',
    text: 'Totalausfall auf Etage 3. Fußmarsch zur Kantine. -2 Schritte morgen.',
    effect: { type: 'step_malus', amount: 2, when: 'tomorrow' } },
  { id: 'birthday_cake',    emoji: '🎂',  name: 'Sabine hat Geburtstag!',
    text: 'Es gibt Kuchen. Wer Sabine ist, bleibt offen. +5 CC.',
    effect: { type: 'cc_bonus', amount: 5 } },
  { id: 'printer_jam',      emoji: '📠',  name: 'Drucker kaputt!',
    text: 'Wie immer, sagt jeder. Du nutzt die Zeit produktiv. Nächster Schatz ×2 CC.',
    effect: { type: 'treasure_boost', factor: 2 } },
  { id: 'stairs_sprint',    emoji: '🏃',  name: 'Aufzug streikt — Treppe!',
    text: 'Du läufst. Du brennst. Du lebst. +3 Bonus-Schritte heute.',
    effect: { type: 'step_bonus', amount: 3, when: 'today' } },
  { id: 'mystery_package',  emoji: '📦',  name: 'Mysterium-Paket',
    text: 'Kein Absender. Kein Empfänger. Finder = Behalter.',
    effect: { type: 'cc_random', min: 1, max: 12 } },
  { id: 'good_idea',        emoji: '💡',  name: 'Gute Idee im Flur!',
    text: 'Du hast einen Gedanken gehabt. Dein Gehirn belohnt sich selbst. +5 CC.',
    effect: { type: 'cc_bonus', amount: 5 } },
  { id: 'spontaneous_meet', emoji: '📣',  name: 'Spontan-Meeting!',
    text: '"Kurz zusammenkommen." — Es dauert 50 Minuten. -1 Schritt heute.',
    effect: { type: 'step_malus', amount: 1, when: 'today' } },
  { id: 'chefs_espresso',   emoji: '😈',  name: 'Chefs Espresso geklaut!',
    text: '+20 CC sofort. -1 Schritt morgen. Keine Reue.',
    effect: { type: 'cc_risk', cc: 20, malus: 1 } },
  { id: 'microwave_feast',  emoji: '🍱',  name: 'Mikrowellen-Jackpot!',
    text: 'Unbekannte Lunchbox. Noch warm. Keine Fragen. +3 CC.',
    effect: { type: 'cc_bonus', amount: 3 } },
  { id: 'vip_elevator',     emoji: '🛗',  name: 'Privat-Aufzug entdeckt!',
    text: 'VIP-Only. Du bist VIP. Heute. +2 Schritte.',
    effect: { type: 'step_bonus', amount: 2, when: 'today' } },
  { id: 'office_rumor',     emoji: '🤫',  name: 'Büroflüstern!',
    text: 'Du hörst etwas. Du sagst nichts. Nächster Schatz ×1,5 CC.',
    effect: { type: 'treasure_boost', factor: 1.5 } },
  { id: 'dice_oracle',      emoji: '🎲',  name: 'Das Würfel-Orakel',
    text: 'Alles auf eine Karte. Nächster Schatz ×1–6 CC.',
    effect: { type: 'cc_multiplier', min: 1, max: 6 } },
  { id: 'fire_alarm',       emoji: '🚨',  name: 'Feueralarm!',
    text: 'Alle raus. Alle warten. Du hast trotzdem 2 Schritte gemacht. +2 heute.',
    effect: { type: 'step_bonus', amount: 2, when: 'today' } },
  { id: 'fridge_mission',   emoji: '🧊',  name: 'Kühlschrank-Kontrolle',
    text: 'Jemand hat aufgeräumt. Was bleibt, gehört jetzt dir.',
    effect: { type: 'cc_random', min: 2, max: 7 } },
  { id: 'welcome_cake',     emoji: '👋',  name: 'Neuer Kollege!',
    text: 'Er heißt Tim. Oder Tom. Egal — er bringt Kekse. +6 CC.',
    effect: { type: 'cc_bonus', amount: 6 } },
  { id: 'wifi_outage',      emoji: '📵',  name: 'WLAN ausgefallen!',
    text: 'Kein Internet, kein Stress. Du hast dich sinnvoll beschäftigt. +4 CC.',
    effect: { type: 'cc_bonus', amount: 4 } },
  { id: 'overtime_call',    emoji: '⏰',  name: '"Kannst du kurz bleiben?"',
    text: '+7 CC. -1 Schritt morgen. Du weißt, warum.',
    effect: { type: 'cc_risk', cc: 7, malus: 1 } },
  { id: 'lost_and_found',   emoji: '🎫',  name: 'Fundsachen-Kiste!',
    text: 'Offiziell Fundsachen. Inoffiziell: Schatzgrube.',
    effect: { type: 'cc_random', min: 1, max: 9 } },
  { id: 'secret_snacks',    emoji: '🍫',  name: 'Geheimvorrat!',
    text: 'Hinter dem Drucker. Wer das versteckt hat, hätte es besser machen sollen. +4 CC.',
    effect: { type: 'cc_bonus', amount: 4 } },
  { id: 'new_machine',      emoji: '✨',  name: 'Neue Kaffeemaschine!',
    text: 'Vollautomatik. Milchaufschäumer. Die Frage nach dem Sinn des Lebens: beantwortet. +8 CC.',
    effect: { type: 'cc_bonus', amount: 8 } },
  // ── Stufe-1 Flavor-Events (milde „Gegner" ohne eigenes Kampfsystem) ──
  { id: 'umweltbehoerde',   emoji: '🏛️',  name: 'Umweltbehörde-Kontrolle!',
    text: 'Klemmbrett, Warnweste, viele Fragen. Heute wird NICHT gebaut. Bau für heute gesperrt.',
    effect: { type: 'build_block', when: 'today' } },
  { id: 'demonstranten',    emoji: '📢',  name: 'Demonstranten vor dem Büro!',
    text: '"Mehr Pausen für alle!" Du kommst kaum durch. -2 Schritte heute.',
    effect: { type: 'step_malus', amount: 2, when: 'today' } },
  { id: 'wespennest',       emoji: '🐝',  name: 'Wespennest im Treppenhaus!',
    text: 'Niemand will da durch. Umweg über den Hinterausgang. -1 Schritt heute.',
    effect: { type: 'step_malus', amount: 1, when: 'today' } },
  { id: 'sturmwarnung',     emoji: '🌪️',  name: 'Unwetterwarnung!',
    text: 'Sturmböen, Regen quer. Heute bleibt man lieber drin. -2 Schritte heute.',
    effect: { type: 'step_malus', amount: 2, when: 'today' } },
  { id: 'eichhoernchen',    emoji: '🐿️',  name: 'Eichhörnchen-Invasion!',
    text: 'Sie horten Nüsse im Aktenschrank. Chaos. -1 Schritt heute, dafür süß.',
    effect: { type: 'step_malus', amount: 1, when: 'today' } },
  // ── Stufe 2: Strafzölle / Bußgelder (kosten echte CC, gedeckelt aufs Guthaben) ──
  { id: 'strafzoll',        emoji: '💸',  name: 'Strafzoll-Bescheid!',
    text: 'Die Behörde greift zu. Bürokratie kennt kein Erbarmen. -15 CC.',
    effect: { type: 'cc_penalty', amount: 15 } },
  { id: 'bussgeld',         emoji: '🧾',  name: 'Bußgeld: Kaffee überm Limit!',
    text: 'Angeblich „gewerbliche Mengen". Absurd, aber teuer. -10 CC.',
    effect: { type: 'cc_penalty', amount: 10 } },
  // ── Stufe 3: Tier blockiert ein Feld / Sturmschaden an einem Gebäude ──
  { id: 'bueroganse',       emoji: '🦢',  name: 'Aggressive Bürogänse!',
    text: 'Sie haben ein Feld besetzt. Heute kommt da niemand durch.',
    effect: { type: 'tile_block' } },
  { id: 'gewittersturm',    emoji: '⛈️',  name: 'Gewittersturm!',
    text: 'Ein Gebäude hat Sturmschaden — heute kein Einkommen. Morgen ist es repariert.',
    effect: { type: 'storm_damage' } },
];

// ── RPG Items (Slot-System) ──────────────────────────────────────────────────
// Slot-Tier: gleicher Slot → höheres Tier hat Vorrang, kein Stacking
// Backward-compat: alter key 'boots' → 'walking_boots', 'nose' → 'coffee_nose'
const KARTE_ITEMS = [
  { key: 'walking_boots', slot: 'feet',   tier: 1, emoji: '👟', name: 'Wanderschuhe', cost:  50, desc: '+2 Schritte/Tag' },
  { key: 'trail_runner',  slot: 'feet',   tier: 2, emoji: '🥾', name: 'Trailrunner',   cost: 150, desc: '+4 Schritte/Tag' },
  { key: 'coffee_nose',   slot: 'sensor', tier: 1, emoji: '🔍', name: 'Schatzgespür', cost:  80, desc: 'Schatz-Chance +50%' },
  { key: 'truffle_nose',  slot: 'sensor', tier: 2, emoji: '🐽', name: 'Trüffelnase',   cost: 200, desc: 'Schatz-Chance +120%' },
  { key: 'compass',       slot: 'nav',    tier: 1, emoji: '🧭', name: 'Kompass',       cost: 120, desc: '1 Feld durch Nebel' },
  { key: 'old_map',       slot: 'nav',    tier: 2, emoji: '🗺️', name: 'Alte Karte',    cost: 300, desc: '2 Felder + ✦ durch Nebel' },
  { key: 'thermos',       slot: 'bag',    tier: 1, emoji: '☕', name: 'Thermos',       cost:  60, desc: 'Event-Malus ignorieren' },
  { key: 'backpack',      slot: 'bag',    tier: 2, emoji: '🎒', name: 'Rucksack',      cost: 150, desc: 'Respawn-Felder +25% Schatz' },
  { key: 'barista_bart',  slot: 'look',   tier: 1, emoji: '🧔', name: 'Barista Bart',  cost: 250, desc: '+1 CC je Schatzfund' },
];

const KARTE_SLOT_NAMES = {
  feet:   '👟 Füße',
  sensor: '🔍 Sensorik',
  nav:    '🧭 Navigation',
  bag:    '☕ Rucksack',
  look:   '🧔 Stil',
};

// Bestes Item im Slot (höchstes Tier das besessen wird)
function _getBestItemInSlot(slot, upgrades) {
  if (!upgrades) return null;
  function isOwned(key) {
    if (upgrades[key]) return true;
    // Backward-compat
    if (key === 'walking_boots' && upgrades.boots)      return true;
    if (key === 'coffee_nose'   && upgrades.nose)       return true;
    return false;
  }
  return KARTE_ITEMS
    .filter(i => i.slot === slot && isOwned(i.key))
    .sort((a, b) => b.tier - a.tier)[0] || null;
}

// ── Gebäude (Bau-System) ──────────────────────────────────────────────────────
// 15 Gebäude in 6 Terrain-Pfaden + 1 Sonderbau. Gespeichert in
// mapData.buildings[`${x},${y}`] = { type, startedAt, completesAt, done }.
// Felder pro Gebäude:
//   terrain   : Pflicht-Terrain (String, Array oder 'ANY') — gilt für ALLE Footprint-Tiles
//   w, h      : Footprint-Größe in Tiles (default 1×1). Mehrtägige Gebäude belegen
//               tatsächlich w×h zusammenhängende Tiles, die danach blockiert sind.
//   adjacent  : Terrain, das orthogonal an den Footprint angrenzen muss (z.B. RIVER)
//   requires  : Gebäude-Key, der fertig in requireRange (Chebyshev, ab Anker) stehen muss
//   cost/days : CC-Kosten und Bauzeit in Tagen
//   perDay    : passives CC-Einkommen nach Fertigstellung
//   stepBonus : dauerhafter Bonus auf das tägliche Schritte-Cap
//   fogRadius : deckt dauerhaft Nebel im Umkreis auf (nur Aussichtsturm)
//   harbor    : true = Handelshafen (1% Anteil an Forschungskäufen, s. db.js)
const KARTE_BUILDINGS = [
  // ── Wiese (GRASS) ──
  { key:'kaffeeplantage',   emoji:'🌱', name:'Kaffeeplantage',   path:'Wiese',        terrain:'GRASS',    w:2, h:2,                                cost:300,   days:3, perDay:8  },
  { key:'oekodorf',         emoji:'🏡', name:'Ökodorf',          path:'Wiese',        terrain:'GRASS',    w:3, h:3, requires:'kaffeeplantage', requireRange:4, cost:1500, days:6, perDay:25 },
  // ── Wald (FOREST) ──
  { key:'sammelhuette',     emoji:'🛖', name:'Sammelhütte',      path:'Wald',         terrain:'FOREST',                                            cost:150,   days:2, perDay:5  },
  { key:'toepferei',        emoji:'🏺', name:'Töpferei',         path:'Wald',         terrain:['FOREST','PATH'], adjacent:'RIVER',                 cost:500,   days:3, perDay:12 },
  // ── Berg (MOUNTAIN) ──
  { key:'serverraum',       emoji:'🖥️', name:'Serverraum',       path:'Berg',         terrain:'MOUNTAIN',                                          cost:200,   days:2, perDay:5  },
  { key:'steinbruch',       emoji:'⛏️', name:'Steinbruch',       path:'Berg',         terrain:'MOUNTAIN', w:2, h:2,                                cost:600,   days:4, perDay:12 },
  // ── Fluss (RIVER) ──
  { key:'wasserquelle',     emoji:'💧', name:'Wasserquelle',     path:'Fluss',        terrain:'RIVER',                                             cost:100,   days:1, perDay:4  },
  { key:'wassermuehle',     emoji:'🏞️', name:'Wassermühle',      path:'Fluss',        terrain:'MOUNTAIN', adjacent:'RIVER',                        cost:500,   days:4, perDay:14 },
  { key:'handelshafen',     emoji:'⚓', name:'Handelshafen',     path:'Fluss',        terrain:'RIVER',    w:2, h:2,                                cost:800,   days:5, perDay:0, harbor:true },
  // ── Kaffeefelder (COFFEE) ──
  { key:'roesterei',        emoji:'🔥', name:'Rösterei',         path:'Kaffeefelder', terrain:'COFFEE',                                            cost:350,   days:3, perDay:10 },
  { key:'cafe',             emoji:'🏠', name:'Café',             path:'Kaffeefelder', terrain:'COFFEE',   w:2, h:2, requires:'roesterei', requireRange:4, cost:900, days:4, perDay:18 },
  // ── Weg (PATH) ──
  { key:'aktenlager',       emoji:'📦', name:'Aktenlager',       path:'Weg',          terrain:'PATH',                                              cost:250,   days:2, perDay:0, stepBonus:1 },
  { key:'verpackungsfabrik',emoji:'🏭', name:'Verpackungsfabrik',path:'Weg',          terrain:'PATH',     w:2, h:2,                                cost:1200,  days:5, perDay:20 },
  { key:'logistikzentrum',  emoji:'🏗️', name:'Logistikzentrum',  path:'Weg',          terrain:'PATH',     w:3, h:3,                                cost:3000,  days:7, perDay:35 },
  // ── Sonderbau (überall) ──
  { key:'aussichtsturm',    emoji:'🗼', name:'Aussichtsturm',    path:'Sonderbau',    terrain:'ANY',                                               cost:150,   days:1, perDay:0, fogRadius:1 },
];

function karteBuildingDef(key) {
  return KARTE_BUILDINGS.find(b => b.key === key) || null;
}

// Restzeit bis Fertigstellung, menschlich gerundet (Stunden statt ganzer Tagesblöcke).
// { text: fürs Popup ("9 Std." / "45 Min" / "3 Tage"), short: fürs Canvas ("9h" / "45m" / "3d") }
function karteBuildRemaining(completesAt, nowTs) {
  const ms = (completesAt || 0) - (nowTs || Date.now());
  if (ms <= 0)              return { text: 'fertig',     short: '✓' };
  if (ms < 3600000)         { const m = Math.max(1, Math.round(ms / 60000));  return { text: `${m} Min`,  short: `${m}m` }; }
  if (ms <= 24 * 3600000)   { const h = Math.max(1, Math.round(ms / 3600000)); return { text: `${h} Std.`, short: `${h}h` }; }
  const d = Math.round(ms / 86400000);                                         return { text: `${d} Tage`, short: `${d}d` };
}

// Fertige, einkommensbringende Gebäude als Quellen-Liste (für „Heute erhalten"-Aufschlüsselung)
function buildingPerDaySources(buildings) {
  const now = Date.now(), today = _todayKey();
  const out = [];
  for (const b of Object.values(buildings || {})) {
    if (b.completesAt > now || b.damaged === today) continue;
    const def = karteBuildingDef(b.type);
    if (def && (def.perDay || 0) > 0) out.push({ icon: def.emoji, name: def.name, perDay: def.perDay });
  }
  return out;
}
function buildingPerDayDetail(buildings) {
  return buildingPerDaySources(buildings).map(s => `${s.icon} ${s.name} +${s.perDay}/Tag`).join(', ');
}

function _karteHasAdjacent(x, y, terrain, worldSeed) {
  const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  return nb.some(([nx, ny]) =>
    nx >= 0 && nx < KARTE_WORLD && ny >= 0 && ny < KARTE_WORLD &&
    karteTerrain(nx, ny, worldSeed) === terrain);
}

function _karteHasBuildingNear(type, x, y, mapData, range) {
  const blds = mapData?.buildings || {};
  const now = Date.now();
  for (const [k, b] of Object.entries(blds)) {
    if (b.type !== type || b.completesAt > now) continue;
    const [bx, by] = k.split(',').map(Number);
    if (Math.abs(bx - x) <= range && Math.abs(by - y) <= range) return true;
  }
  return false;
}

// Alle Tiles, die ein an (ax,ay) verankertes Gebäude belegt (Anker = obere linke Ecke)
function karteBuildingFootprint(ax, ay, def) {
  const w = def?.w || 1, h = def?.h || 1;
  const tiles = [];
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      tiles.push([ax + dx, ay + dy]);
  return tiles;
}

// Gebäude (Anker-Eintrag), dessen Footprint das Tile (tx,ty) abdeckt — oder null
function karteBuildingCovering(tx, ty, buildings) {
  for (const [coord, b] of Object.entries(buildings || {})) {
    const def = karteBuildingDef(b.type);
    const w = b.w || def?.w || 1, h = b.h || def?.h || 1;
    const [bx, by] = coord.split(',').map(Number);
    if (tx >= bx && tx < bx + w && ty >= by && ty < by + h) return { coord, b };
  }
  return null;
}

// Prüft, ob ein an (ax,ay) verankertes Gebäude komplett baubar ist (ganzer Footprint)
function karteCanBuildAt(buildingKey, ax, ay, mapData, worldSeed) {
  const def = karteBuildingDef(buildingKey);
  if (!def) return false;
  const buildings = mapData?.buildings || {};
  const footprint = karteBuildingFootprint(ax, ay, def);
  for (const [tx, ty] of footprint) {
    if (tx < 0 || tx >= KARTE_WORLD || ty < 0 || ty >= KARTE_WORLD) return false;
    if (!karteIsExplored(tx, ty, mapData)) return false;          // alles erkundet
    if (karteBuildingCovering(tx, ty, buildings)) return false;    // nichts überbauen
    if (def.terrain !== 'ANY') {
      const allowed = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
      if (!allowed.includes(karteTerrain(tx, ty, worldSeed))) return false; // einheitliches Terrain
    }
  }
  if (def.adjacent) {
    const anyAdj = footprint.some(([tx, ty]) => _karteHasAdjacent(tx, ty, def.adjacent, worldSeed));
    if (!anyAdj) return false;
  }
  if (def.requires && !_karteHasBuildingNear(def.requires, ax, ay, mapData, def.requireRange || 3)) return false;
  return true;
}

// Gültigen Anker finden, sodass das geklickte Tile (cx,cy) im Footprint liegt.
// 1×1: muss exakt das Tile sein. Größer: probiert alle Anker, bei denen (cx,cy) drin liegt.
function _karteValidAnchorFor(def, cx, cy, mapData, worldSeed) {
  const w = def.w || 1, h = def.h || 1;
  if (w === 1 && h === 1) {
    return karteCanBuildAt(def.key, cx, cy, mapData, worldSeed) ? [cx, cy] : null;
  }
  for (let ax = cx - (w - 1); ax <= cx; ax++) {
    for (let ay = cy - (h - 1); ay <= cy; ay++) {
      if (karteCanBuildAt(def.key, ax, ay, mapData, worldSeed)) return [ax, ay];
    }
  }
  return null;
}

// Liste baubarer Gebäude am geklickten Tile: [{ def, ax, ay }] (ax/ay = gewählter Anker)
function karteBuildableAt(cx, cy, mapData, worldSeed) {
  const out = [];
  for (const def of KARTE_BUILDINGS) {
    const anchor = _karteValidAnchorFor(def, cx, cy, mapData, worldSeed);
    if (anchor) out.push({ def, ax: anchor[0], ay: anchor[1] });
  }
  return out;
}

// Baut ein Gebäude am Anker (reine Datentransformation, kein DB-Zugriff)
function karteStartBuild(buildingKey, ax, ay, mapData, now) {
  const def = karteBuildingDef(buildingKey);
  if (!def) return mapData;
  const buildings = { ...(mapData?.buildings || {}) };
  buildings[`${ax},${ay}`] = {
    type: buildingKey,
    startedAt: now,
    completesAt: now + def.days * 86400000,
    w: def.w || 1,
    h: def.h || 1,
  };
  return { ...mapData, buildings };
}

// Fertige Gebäude (completesAt <= jetzt); jedes Element: { coord, type, ... }
function karteBuildingsCompleted(buildings) {
  const now = Date.now();
  return Object.entries(buildings || {})
    .filter(([, b]) => b.completesAt <= now)
    .map(([coord, b]) => ({ ...b, coord }));
}

// Passives CC-Einkommen aller FERTIGEN Gebäude (analog calcResearchPerDay)
function calcBuildingPerDay(buildings) {
  const now = Date.now();
  const today = _todayKey();
  let sum = 0;
  for (const b of Object.values(buildings || {})) {
    if (b.completesAt > now) continue;
    if (b.damaged === today) continue; // Sturmschaden: heute kein Einkommen
    const def = karteBuildingDef(b.type);
    if (def) sum += (def.perDay || 0);
  }
  return Math.round(sum * 100) / 100;
}

// Baustopp heute aktiv? (z.B. durch Umweltbehörde-Event)
function karteIsBuildBlocked(mapData) {
  const today = _todayKey();
  return (mapData?.activeEffects || []).some(e => e.type === 'build_block' && e.expires === today);
}

// Dauerhafter Schritte-Cap-Bonus aller fertigen Gebäude (z.B. Aktenlager)
function calcBuildingStepBonus(buildings) {
  const now = Date.now();
  let s = 0;
  for (const b of Object.values(buildings || {})) {
    if (b.completesAt > now) continue;
    const def = karteBuildingDef(b.type);
    if (def) s += (def.stepBonus || 0);
  }
  return s;
}

// ── Terrain-Farben ────────────────────────────────────────────────────────────
const KARTE_TERRAIN_COLORS = {
  GRASS:    ['#2e4818','#243810','#3a5820'],
  FOREST:   ['#162c0a','#0e2008','#1a3010'],
  MOUNTAIN: ['#282220','#322a24','#3c3430'],
  RIVER:    ['#0c1e38','#0e2444','#122a4e'],
  COFFEE:   ['#2a1808','#3a2010','#221206'],
  PATH:     ['#3a2a12','#4a3818','#2e2010'],
};

// ── PRNG (Mulberry32) ─────────────────────────────────────────────────────────
function _kRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _tileRng(x, y, salt, worldSeed) {
  const s = (((x * 73856093) ^ (y * 19349663) ^ salt) + worldSeed) >>> 0;
  return _kRng(s);
}

// ── Terrain-Generierung ───────────────────────────────────────────────────────
function karteTerrain(x, y, worldSeed) {
  const cx = Math.floor(x / 4);
  const cy = Math.floor(y / 4);
  const r = _tileRng(cx * 200 + 1, cy * 200 + 1, 0, worldSeed)();
  if (r < 0.38) return 'GRASS';
  if (r < 0.58) return 'FOREST';
  if (r < 0.72) return 'MOUNTAIN';
  if (r < 0.80) return 'RIVER';
  if (r < 0.93) return 'COFFEE';
  return 'PATH';
}

function _tileColor(x, y, worldSeed) {
  const terrain = karteTerrain(x, y, worldSeed);
  const r = _tileRng(x, y, 99, worldSeed)();
  const idx = r < 0.33 ? 0 : r < 0.66 ? 1 : 2;
  return { terrain, color: KARTE_TERRAIN_COLORS[terrain][idx] };
}

// ── Schatz-Logik ──────────────────────────────────────────────────────────────
function karteTreasureSpot(x, y, worldSeed, p) {
  const terrain = karteTerrain(x, y, worldSeed);
  if (terrain === 'RIVER' || terrain === 'PATH') return false;
  return _tileRng(x, y, 777, worldSeed)() < (p !== undefined ? p : KARTE_TREASURE_P);
}

function karteTreasureIndex(x, y, worldSeed, round) {
  const r = _tileRng(x + round * 300, y + round * 300, 1234, worldSeed)();
  return Math.floor(r * KARTE_TREASURES.length) % KARTE_TREASURES.length;
}

// ── Event-Logik ───────────────────────────────────────────────────────────────
function _todayNum() {
  return parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''), 10);
}

function karteEventSpot(x, y, worldSeed) {
  const s = (((x * 73856093) ^ (y * 19349663) ^ _todayNum()) + worldSeed) >>> 0;
  return _kRng(s)() < KARTE_EVENT_CHANCE;
}

function karteEventIndex(x, y, worldSeed) {
  const r = _tileRng(x + _todayNum(), y + _todayNum(), 9999, worldSeed)();
  return Math.floor(r * KARTE_EVENTS.length) % KARTE_EVENTS.length;
}

// ── Steps-Logik ───────────────────────────────────────────────────────────────
function _todayKey() {
  return new Date().toLocaleDateString('de-DE');
}

function _tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('de-DE');
}

function karteStepsAllowed(mapData) {
  const upg      = mapData?.upgrades || {};
  const bestFeet = _getBestItemInSlot('feet', upg);
  const footBonus = bestFeet?.key === 'trail_runner' ? 4 : bestFeet ? 2 : 0;
  const extra     = mapData?.steps_extra_date === _todayKey() ? KARTE_EXTRA_STEPS : 0;
  const hasBag    = !!_getBestItemInSlot('bag', upg);
  const today     = _todayKey();
  const effects   = mapData?.activeEffects || [];
  const stepBonus = effects
    .filter(e => e.type === 'step_bonus' && e.expires === today)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const stepMalus = hasBag ? 0
    : effects
        .filter(e => e.type === 'step_malus' && e.expires === today)
        .reduce((s, e) => s + (e.amount || 0), 0);
  const buildStep = calcBuildingStepBonus(mapData?.buildings);
  return Math.max(1, KARTE_BASE_STEPS + footBonus + extra + stepBonus + buildStep - stepMalus);
}

function karteExtraStepsBought(mapData) {
  return mapData?.steps_extra_date === _todayKey();
}

function karteStepsUsed(mapData) {
  if (!mapData?.steps_date || mapData.steps_date !== _todayKey()) return 0;
  return mapData.steps_today || 0;
}

function karteStepsLeft(mapData) {
  return Math.max(0, karteStepsAllowed(mapData) - karteStepsUsed(mapData));
}

// ── Positions- und Erkundungs-Logik ──────────────────────────────────────────
function kartePos(mapData) {
  return mapData?.pos ? { ...mapData.pos } : { x: KARTE_START_X, y: KARTE_START_Y };
}

function karteIsExplored(x, y, mapData) {
  return !!(mapData?.explored?.[`${x},${y}`]);
}

function karteCanStep(tx, ty, mapData) {
  if (karteStepsLeft(mapData) <= 0) return false;
  if (karteIsExplored(tx, ty, mapData)) return false;
  if (tx < 0 || tx >= KARTE_WORLD || ty < 0 || ty >= KARTE_WORLD) return false;
  if ((mapData?.blocked || {})[`${tx},${ty}`] === _todayKey()) return false; // Tier blockiert das Feld heute
  const p = kartePos(mapData);
  return Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1 && !(p.x === tx && p.y === ty);
}

// Gibt { newMapData, treasure, event } zurück; treasure/event sind null wenn nichts passiert.
function karteExploreTile(tx, ty, mapData, worldSeed, opts) {
  const now      = Date.now();
  const today    = _todayKey();
  const tomorrow = _tomorrowKey();
  const stepsUsed = karteStepsUsed(mapData);

  // Sensor-Item: Schatz-Faktor (1.0 = normal, 1.5 = Schatzgespür, 2.2 = Trüffelnase)
  const treasureFactor = opts?.treasureFactor ?? 1.0;
  const treasureP      = KARTE_TREASURE_P * treasureFactor;

  // activeEffects: nur nicht-abgelaufene behalten
  const effects     = (mapData?.activeEffects || []).filter(e =>
    e.expires === today || e.expires === tomorrow
  );
  // Treasure-Boost / CC-Multiplikator: wird beim Schatzfund verbraucht
  const boostEffect = effects.find(e =>
    (e.type === 'treasure_boost' || e.type === 'cc_multiplier') && e.expires === today
  );

  const newExplored    = { ...(mapData?.explored || {}), [`${tx},${ty}`]: now };
  let newTreasures     = { ...(mapData?.treasures || {}) };
  let newActiveEffects = [...effects];
  let newBlocked       = null; // nur gesetzt, wenn ein tile_block-Event ein Feld sperrt
  let newBuildings     = null; // nur gesetzt, wenn ein storm_damage-Event ein Gebäude trifft
  let treasure         = null;
  let event            = null;

  if (karteTreasureSpot(tx, ty, worldSeed, treasureP)) {
    const prev      = newTreasures[`${tx},${ty}`];
    const isRespawn = prev && (now - prev.ts > KARTE_RESPAWN_MS);
    if (!prev || isRespawn) {
      const round = (prev?.round || 0) + (isRespawn ? 1 : 0);
      const idx   = karteTreasureIndex(tx, ty, worldSeed, round);
      let cc      = KARTE_TREASURES[idx].cc;

      // Rucksack: Respawn-Felder geben +1 CC Bonus
      if (opts?.backpackBoost && isRespawn) cc += 1;

      // Aktiven Boost-Effect anwenden und verbrauchen
      if (boostEffect) {
        if (boostEffect.type === 'treasure_boost') {
          cc = Math.round(cc * (boostEffect.factor || 2));
        } else if (boostEffect.type === 'cc_multiplier') {
          const mult = Math.floor(Math.random() * ((boostEffect.max || 6) - (boostEffect.min || 1) + 1)) + (boostEffect.min || 1);
          cc = Math.round(cc * mult);
        }
        newActiveEffects = newActiveEffects.filter(e => e !== boostEffect);
      }

      treasure = { ...KARTE_TREASURES[idx], cc };
      newTreasures[`${tx},${ty}`] = { i: idx, ts: now, round };
    }
  } else {
    // Kein Schatz → Event-Check (20% Chance, täglich rotierend)
    if (karteEventSpot(tx, ty, worldSeed)) {
      const idx = karteEventIndex(tx, ty, worldSeed);
      event = KARTE_EVENTS[idx];
      const eff = event.effect;
      // Persistente Effects in activeEffects eintragen
      if (eff.type === 'step_bonus'    && eff.when === 'today')    newActiveEffects.push({ type: 'step_bonus',     amount: eff.amount,  expires: today    });
      if (eff.type === 'step_malus'    && eff.when === 'today')    newActiveEffects.push({ type: 'step_malus',     amount: eff.amount,  expires: today    });
      if (eff.type === 'step_malus'    && eff.when === 'tomorrow') newActiveEffects.push({ type: 'step_malus',     amount: eff.amount,  expires: tomorrow });
      if (eff.type === 'build_block'   && eff.when === 'today')    newActiveEffects.push({ type: 'build_block',                          expires: today    });
      if (eff.type === 'treasure_boost')                           newActiveEffects.push({ type: 'treasure_boost', factor: eff.factor,  expires: today    });
      if (eff.type === 'cc_multiplier')                            newActiveEffects.push({ type: 'cc_multiplier',  min: eff.min, max: eff.max, expires: today });
      // Tier blockiert ein angrenzendes, unerkundetes Feld für heute
      if (eff.type === 'tile_block') {
        const cand = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]
          .find(([nx, ny]) => nx >= 0 && nx < KARTE_WORLD && ny >= 0 && ny < KARTE_WORLD && !newExplored[`${nx},${ny}`]);
        const pruned = {}; // Altlasten vergangener Tage entfernen
        for (const [k, v] of Object.entries(mapData?.blocked || {})) if (v === today) pruned[k] = v;
        if (cand) pruned[`${cand[0]},${cand[1]}`] = today;
        newBlocked = pruned;
      }
      // Sturmschaden: ein fertiges Einkommens-Gebäude pausiert heute
      if (eff.type === 'storm_damage') {
        const blds = { ...(mapData?.buildings || {}) };
        const target = Object.entries(blds).find(([, b]) =>
          b.completesAt <= now && (karteBuildingDef(b.type)?.perDay || 0) > 0 && b.damaged !== today);
        if (target) { blds[target[0]] = { ...target[1], damaged: today }; newBuildings = blds; }
      }
      // cc_bonus, cc_random, cc_risk, cc_penalty → sofort in imperium.js ausgewertet, nicht hier gespeichert
    }
  }

  const newMapData = {
    ...mapData,
    pos:           { x: tx, y: ty },
    explored:      newExplored,
    treasures:     newTreasures,
    activeEffects: newActiveEffects,
    steps_today:   stepsUsed + 1,
    steps_date:    today,
    ...(newBlocked   ? { blocked:   newBlocked }   : {}),
    ...(newBuildings ? { buildings: newBuildings } : {}),
  };

  return { newMapData, treasure, event };
}

// ── Canvas-Rendering ──────────────────────────────────────────────────────────
function karteRender(canvas, mapData, worldSeed, vpX, vpY) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const T = KARTE_TILE;
  const COLS = Math.floor(W / T);
  const ROWS = Math.floor(H / T);

  const pos      = kartePos(mapData);
  const explored = mapData?.explored  || {};
  const treasures = mapData?.treasures || {};
  const upg      = mapData?.upgrades  || {};

  // Item-Effekte im Renderer
  const navItem           = _getBestItemInSlot('nav',  upg);
  const navRadius         = navItem?.key === 'old_map' ? 2 : navItem ? 1 : 0;
  const showTreasureInFog = navItem?.key === 'old_map';
  const hasBart           = !!_getBestItemInSlot('look', upg);

  // Gebäude + Aussichtsturm-Positionen (für Nebel-Aufdeckung im Umkreis)
  const buildings = mapData?.buildings || {};
  const blocked   = mapData?.blocked   || {};
  const nowTs     = Date.now();
  const todayK    = _todayKey();
  const towers    = [];
  for (const [k, b] of Object.entries(buildings)) {
    if (b.type === 'aussichtsturm' && b.completesAt <= nowTs) {
      const [bx, by] = k.split(',').map(Number);
      towers.push([bx, by]);
    }
  }

  const originX = (vpX !== undefined) ? vpX : pos.x - Math.floor(COLS / 2);
  const originY = (vpY !== undefined) ? vpY : pos.y - Math.floor(ROWS / 2);

  ctx.clearRect(0, 0, W, H);

  for (let vy = 0; vy < ROWS; vy++) {
    for (let vx = 0; vx < COLS; vx++) {
      const wx = originX + vx;
      const wy = originY + vy;
      const px = vx * T;
      const py = vy * T;
      const key = `${wx},${wy}`;
      const inBounds = wx >= 0 && wx < KARTE_WORLD && wy >= 0 && wy < KARTE_WORLD;

      // ── Fog ──
      if (!inBounds || !explored[key]) {
        ctx.fillStyle = '#0c0a07';
        ctx.fillRect(px, py, T, T);

        // Nav-Item: Terrain im Radius gedimmt anzeigen
        if (inBounds && navRadius > 0 && Math.abs(wx - pos.x) <= navRadius && Math.abs(wy - pos.y) <= navRadius) {
          const { color } = _tileColor(wx, wy, worldSeed);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.38;
          ctx.fillRect(px, py, T, T);
          ctx.globalAlpha = 1.0;
        }

        // Aussichtsturm: deckt Terrain im Umkreis dauerhaft gedimmt auf
        if (inBounds && towers.length &&
            towers.some(([bx, by]) => Math.abs(bx - wx) <= 1 && Math.abs(by - wy) <= 1)) {
          const { color } = _tileColor(wx, wy, worldSeed);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.42;
          ctx.fillRect(px, py, T, T);
          ctx.globalAlpha = 1.0;
        }

        // Alte Karte: ✦ Schatz-Marker durch Nebel
        if (inBounds && showTreasureInFog && treasures[key]) {
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = '#FAC775';
          ctx.font = `bold ${Math.floor(T * 0.6)}px sans-serif`;
          ctx.fillText('✦', px + 4, py + T - 3);
          ctx.globalAlpha = 1.0;
        }

        // Tier blockiert dieses Feld heute → 🐾 statt betretbar
        if (inBounds && blocked[key] === todayK) {
          ctx.font = `${Math.floor(T * 0.7)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.fillText('🐾', px + 2, py + T - 3);
          continue;
        }

        // Highlight: angrenzend, betretbar
        if (inBounds && karteCanStep(wx, wy, mapData)) {
          ctx.fillStyle = 'rgba(212,175,55,0.15)';
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = 'rgba(212,175,55,0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
        }
        continue;
      }

      // ── Terrain ──
      const { terrain, color } = _tileColor(wx, wy, worldSeed);
      ctx.fillStyle = color;
      ctx.fillRect(px, py, T, T);

      const texR = _tileRng(wx * 3 + 7, wy * 3 + 11, 55, worldSeed)();
      if (texR > 0.72) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      } else if (texR < 0.14) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
      }

      const t3 = Math.floor(T * 0.3);
      const t7 = Math.floor(T * 0.7);
      if (terrain === 'FOREST') {
        const treeR = _tileRng(wx, wy, 333, worldSeed)();
        if (treeR > 0.4) {
          ctx.fillStyle = treeR > 0.7 ? '#0d1e06' : '#0e2208';
          ctx.fillRect(px + 2, py, T - 4, T - 2);
        }
      } else if (terrain === 'MOUNTAIN') {
        ctx.fillStyle = 'rgba(80,70,60,0.3)';
        ctx.fillRect(px + 3, py + 2, T - 6, 4);
        ctx.fillStyle = 'rgba(120,110,100,0.15)';
        ctx.fillRect(px + 5, py + 7, T - 10, 3);
      } else if (terrain === 'COFFEE') {
        ctx.fillStyle = '#3e2410';
        ctx.fillRect(px, py + t3, T, 2);
        ctx.fillRect(px, py + t7, T, 2);
      } else if (terrain === 'RIVER') {
        ctx.fillStyle = 'rgba(18,42,80,0.5)';
        ctx.fillRect(px + 2, py + t3, T - 4, Math.floor(T * 0.3));
      }

      // ── Schatz-Sparkle ──
      const tr = treasures[key];
      if (tr) {
        ctx.fillStyle = '#FAC775';
        ctx.font = `bold ${Math.floor(T * 0.75)}px sans-serif`;
        ctx.fillText('✦', px + 2, py + T - 2);
      }

      // ── Spieler-Charakter ──
      if (wx === pos.x && wy === pos.y) {
        const aura = ctx.createRadialGradient(px + T/2, py + T/2, 0, px + T/2, py + T/2, T * 1.5);
        aura.addColorStop(0, 'rgba(212,175,55,0.2)');
        aura.addColorStop(1, 'rgba(212,175,55,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(px - T, py - T, T * 3, T * 3);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px + 4, py + 14, 8, 2);
        ctx.fillStyle = '#1a2840';
        ctx.fillRect(px + 4, py + 10, 2, 5);
        ctx.fillRect(px + 10, py + 10, 2, 5);
        ctx.fillStyle = '#263a5a';
        ctx.fillRect(px + 3, py + 6, 10, 5);
        ctx.fillStyle = '#8a5430';
        ctx.fillRect(px + 5, py + 1, 6, 6);
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(px + 5, py + 1, 6, 3);
        ctx.fillStyle = '#1a1008';
        ctx.fillRect(px + 6, py + 4, 1, 1);
        ctx.fillRect(px + 9, py + 4, 1, 1);
        // Barista Bart: Pixel-Bart unter den Augen
        if (hasBart) {
          ctx.fillStyle = '#5a3018';
          ctx.fillRect(px + 5, py + 5, 6, 2);
          ctx.fillRect(px + 6, py + 6, 4, 1);
        }
        ctx.fillStyle = '#FAC775';
        ctx.fillRect(px + 13, py + 7, 3, 3);
      }
    }
  }

  // ── Gebäude-Pass (über dem Terrain, mehrere Tiles pro Gebäude) ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [coord, b] of Object.entries(buildings)) {
    const def = karteBuildingDef(b.type);
    if (!def) continue;
    const bw = b.w || def.w || 1, bh = b.h || def.h || 1;
    const [bx, by] = coord.split(',').map(Number);
    const bpx = (bx - originX) * T;
    const bpy = (by - originY) * T;
    const wPx = bw * T, hPx = bh * T;
    if (bpx + wPx <= 0 || bpy + hPx <= 0 || bpx >= W || bpy >= H) continue; // außer Sicht
    const building = b.completesAt > nowTs;
    // Footprint-Tönung + Rahmen
    ctx.fillStyle = building ? 'rgba(0,0,0,0.42)' : 'rgba(212,175,55,0.12)';
    ctx.fillRect(bpx, bpy, wPx, hPx);
    ctx.strokeStyle = building ? 'rgba(212,175,55,0.35)' : 'rgba(212,175,55,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bpx + 1, bpy + 1, wPx - 2, hPx - 2);
    // Emoji mittig, skaliert mit Footprint
    const fs = Math.floor(Math.min(wPx, hPx) * 0.7);
    ctx.font = `${fs}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(building ? '🚧' : def.emoji, bpx + wPx / 2, bpy + hPx / 2);
    // Resttage bei Baustelle
    if (building) {
      const rem = karteBuildRemaining(b.completesAt, nowTs);
      ctx.font = `bold ${Math.floor(T * 0.42)}px sans-serif`;
      ctx.fillStyle = '#FAC775';
      ctx.fillText(rem.short, bpx + wPx / 2, bpy + hPx - T * 0.32);
    } else if (b.damaged === todayK) {
      // Sturmschaden: rötliche Tönung + Warnsymbol, heute kein Einkommen
      ctx.fillStyle = 'rgba(170,40,30,0.30)';
      ctx.fillRect(bpx, bpy, wPx, hPx);
      ctx.font = `bold ${Math.floor(T * 0.5)}px sans-serif`;
      ctx.fillStyle = '#ff9a8a';
      ctx.fillText('⚠️', bpx + wPx / 2, bpy + hPx - T * 0.32);
    }
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.min(W, H) * 0.7);
  vig.addColorStop(0, 'rgba(12,10,7,0)');
  vig.addColorStop(1, 'rgba(12,10,7,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
