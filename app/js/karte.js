// ═══════════════════════════════════════════════════════════════════════════
// karte.js — Pixel Exploration Karte für Coffee Champion Imperium
// Geladen vor imperium.js; alle Exports als globale Funktionen.
// ═══════════════════════════════════════════════════════════════════════════

const KARTE_WORLD      = 64;   // Weltgröße (64×64 Tiles)
const KARTE_TILE       = 16;   // Pixel pro Tile im Canvas
const KARTE_VP_COLS    = 32;   // Viewport-Breite in Tiles
const KARTE_VP_ROWS    = 28;   // Viewport-Höhe in Tiles
const KARTE_START_X    = 32;   // Start-X in der Weltmitte
const KARTE_START_Y    = 32;   // Start-Y in der Weltmitte
const KARTE_BASE_STEPS = 5;    // Basis-Schritte pro Tag
const KARTE_EXTRA_STEPS = 5;  // Kaufbare Zusatz-Schritte
const KARTE_MAX_STEPS   = 10; // Tages-Maximum
const KARTE_RESPAWN_MS = 7 * 24 * 3600_000; // Schatz-Respawn nach 7 Tagen
const KARTE_TREASURE_P = 0.30; // 30 % Chance auf latenten Schatz

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

// ── Charakter-Upgrades ───────────────────────────────────────────────────────
const KARTE_UPGRADES = [
  { key: 'boots',   emoji: '👟', name: 'Wanderschuhe',  cost: 50,  desc: '+2 Schritte pro Tag' },
  { key: 'nose',    emoji: '🔍', name: 'Schatzgespür',  cost: 80,  desc: 'Schatz-Chance +50%' },
  { key: 'compass', emoji: '🧭', name: 'Kompass',        cost: 120, desc: 'Umgebung durch Nebel' },
];

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
// 4×4-Tile Patches für zusammenhängende Biome
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

// ── Steps-Logik ───────────────────────────────────────────────────────────────
function karteStepsAllowed(mapData) {
  const bootBonus = mapData?.upgrades?.boots ? 2 : 0;
  const extra     = mapData?.steps_extra_date === _todayKey() ? KARTE_EXTRA_STEPS : 0;
  return Math.min(KARTE_MAX_STEPS + bootBonus, KARTE_BASE_STEPS + bootBonus + extra);
}

function karteExtraStepsBought(mapData) {
  return mapData?.steps_extra_date === _todayKey();
}

function _todayKey() {
  return new Date().toLocaleDateString('de-DE');
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
  const p = kartePos(mapData);
  return Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1 && !(p.x === tx && p.y === ty);
}

// Gibt { newMapData, treasure } zurück; treasure ist null wenn keiner gefunden.
function karteExploreTile(tx, ty, mapData, worldSeed, opts) {
  const now = Date.now();
  const stepsUsed = karteStepsUsed(mapData);
  const treasureP = opts?.treasureBoost ? KARTE_TREASURE_P * 1.5 : KARTE_TREASURE_P;

  const newExplored = { ...(mapData?.explored || {}), [`${tx},${ty}`]: now };
  let newTreasures = { ...(mapData?.treasures || {}) };
  let treasure = null;

  if (karteTreasureSpot(tx, ty, worldSeed, treasureP)) {
    const prev = newTreasures[`${tx},${ty}`];
    const isRespawn = prev && (now - prev.ts > KARTE_RESPAWN_MS);
    if (!prev || isRespawn) {
      const round = (prev?.round || 0) + (isRespawn ? 1 : 0);
      const idx = karteTreasureIndex(tx, ty, worldSeed, round);
      treasure = KARTE_TREASURES[idx];
      newTreasures[`${tx},${ty}`] = { i: idx, ts: now, round };
    }
  }

  const newMapData = {
    ...mapData,
    pos: { x: tx, y: ty },
    explored: newExplored,
    treasures: newTreasures,
    steps_today: stepsUsed + 1,
    steps_date: _todayKey(),
  };

  return { newMapData, treasure };
}

// ── Canvas-Rendering ──────────────────────────────────────────────────────────
// vpX, vpY = Weltkoordinaten der linken oberen Ecke des Viewports (kein Auto-Centering!)
function karteRender(canvas, mapData, worldSeed, vpX, vpY) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const T = KARTE_TILE;
  const COLS = Math.floor(W / T);
  const ROWS = Math.floor(H / T);

  const pos       = kartePos(mapData);
  const explored  = mapData?.explored  || {};
  const treasures = mapData?.treasures || {};
  const hasCompass = !!(mapData?.upgrades?.compass);
  const originX   = (vpX !== undefined) ? vpX : pos.x - Math.floor(COLS / 2);
  const originY   = (vpY !== undefined) ? vpY : pos.y - Math.floor(ROWS / 2);

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

        // Kompass: Terrain angrenzender Tiles gedimmt anzeigen
        if (inBounds && hasCompass && Math.abs(wx - pos.x) <= 1 && Math.abs(wy - pos.y) <= 1) {
          const { color } = _tileColor(wx, wy, worldSeed);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.38;
          ctx.fillRect(px, py, T, T);
          ctx.globalAlpha = 1.0;
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

      // Textur-Variation
      const texR = _tileRng(wx * 3 + 7, wy * 3 + 11, 55, worldSeed)();
      if (texR > 0.72) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      } else if (texR < 0.14) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
      }

      // Terrain-Details (skaliert mit T=16)
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

      // ── Spieler-Charakter (16×16) ──
      if (wx === pos.x && wy === pos.y) {
        // Aura
        const aura = ctx.createRadialGradient(px + T/2, py + T/2, 0, px + T/2, py + T/2, T * 1.5);
        aura.addColorStop(0, 'rgba(212,175,55,0.2)');
        aura.addColorStop(1, 'rgba(212,175,55,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(px - T, py - T, T * 3, T * 3);
        // Schatten
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px + 4, py + 14, 8, 2);
        // Beine
        ctx.fillStyle = '#1a2840';
        ctx.fillRect(px + 4, py + 10, 2, 5);
        ctx.fillRect(px + 10, py + 10, 2, 5);
        // Körper (blaue Jacke)
        ctx.fillStyle = '#263a5a';
        ctx.fillRect(px + 3, py + 6, 10, 5);
        // Kopf
        ctx.fillStyle = '#8a5430';
        ctx.fillRect(px + 5, py + 1, 6, 6);
        // Haare
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(px + 5, py + 1, 6, 3);
        // Augen
        ctx.fillStyle = '#1a1008';
        ctx.fillRect(px + 6, py + 4, 1, 1);
        ctx.fillRect(px + 9, py + 4, 1, 1);
        // Kaffeetasse
        ctx.fillStyle = '#FAC775';
        ctx.fillRect(px + 13, py + 7, 3, 3);
      }
    }
  }

  // Vignette (Nebelrand um Viewport)
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.min(W, H) * 0.7);
  vig.addColorStop(0, 'rgba(12,10,7,0)');
  vig.addColorStop(1, 'rgba(12,10,7,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
