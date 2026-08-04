// ═══════════════════════════════════════════════════════════════════════════
// weltraum_stats.js — 📊 Weltraum-Statistik · 🗺️ Regionen · 🏆 Erfolge
// NACH weltraum.js laden (patcht wrRender/wrDrawMap und ergänzt WR_TABS).
//
// ⚠️ AUTORITÄTS-REGEL (Kopf von weltraum.js): Reisezeiten, Kampf, Beute und
// Kolonie-Erträge rechnet ausschliesslich der Server. Diese Datei hält sich
// strikt daran:
//   • Sie LIEST nur, was der Server bereits geschrieben hat (space_planets via
//     _wrGalaxy, members.space/map_data via appData.users).
//   • Sie SCHREIBT nur in map_data.wrStats — über den bestehenden Weg
//     DB.fetchMemberMapData → DB.updateMapData (RPC save_map_data).
//   • Sie fasst KEINE Spiegel-Konstante an (SPACE_MIN_PER_RING, buildMin,
//     SPACE_TECH, WR_TURRET_*, WR_REFINE …). Keine Zahl wird hier gerechnet,
//     die drüben in SQL auch gerechnet wird.
// Alles, was Regeln ÄNDERT (Flug-/Bauzeiten, Regionsboni, +15 %-Übernahme),
// braucht eine Migration und steht bewusst NICHT hier drin.
//
// ⚠️ Regel 3 (CLAUDE.md): Diese Datei darf die App nie kippen. Jeder Einstieg
// liegt in try/catch, jeder Feldzugriff nutzt Optional Chaining. Fehlt
// weltraum.js oder db.js, tut die Datei schlicht nichts.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
'use strict';

// Ohne Weltraum-Modul gibt es nichts zu erweitern — still aussteigen.
if (typeof WR_TABS === 'undefined' || typeof DB === 'undefined') {
  console.warn('[wr-stats] weltraum.js/db.js fehlen — Statistik-Modul inaktiv.');
  return;
}

// ── 🗺️ Regionen ────────────────────────────────────────────────────────────
// Ring 1–3 sind exakt 36 Quadranten; sie teilen sich in acht unregelmässige
// Regionen (3–6 Quadranten). Der Heimatquadrant 0,0 bleibt neutral.
//
// ⚠️ BEWUSST EINE FESTE TABELLE, kein Winkel-/Rundungscode: eine Region, die
// je nach Rundung springt, ist bei der Kontrollrechnung nicht zu debuggen.
const WR_REGIONS = [
  { key:'lactea',    icon:'🥛', name:'Lactea-Rift',    color:'#cfd8ff',
    desc:'Der dunkle Riss quer durch die Galaxie — am Raumhafen aufgespalten.',
    q:['-3,1','-2,1','-1,0','1,0','2,-1','3,-1'] },
  { key:'roest',     icon:'🔥', name:'Röstgürtel',     color:'#e08a5a',
    desc:'Verkohlter Trümmergürtel. Erzreich, heiss, bitter umkämpft.',
    q:['1,-1','1,-2','2,-2','2,-3','3,-3','3,-2'] },
  { key:'boreas',    icon:'♨️', name:'Boreas-Kessel',  color:'#7fd4ff',
    desc:'Ein nördliches Kesselgebiet, das seit Äonen nicht abkühlt.',
    q:['-3,0','-2,-1','-2,0','-1,-1','-1,-2'] },
  { key:'saccharia', icon:'✨', name:'Saccharia-Nebel',color:'#ffe6a0',
    desc:'Kristalliner Staubnebel bis an den äussersten Rand.',
    q:['0,-1','0,-2','0,-3','1,-3'] },
  { key:'filtrat',   icon:'🧊', name:'Filtratbarriere',color:'#9fe8dd',
    desc:'Die äussere Schwelle, an der alles hängen bleibt, was nicht durchkam.',
    q:['-3,2','-3,3','-2,2','-2,3'] },
  { key:'sediment',  icon:'🌑', name:'Sedimentgraben', color:'#a24bd8',
    desc:'Absinkzone. Was hier unten liegt, liegt lange.',
    q:['-1,1','-1,2','-1,3','0,1'] },
  { key:'crema',     icon:'☕', name:'Crema-Bogen',    color:'#d4aa37',
    desc:'Goldener Schichtbogen — leichter zu sehen als zu halten.',
    q:['0,2','0,3','1,1','1,2'] },
  { key:'sporn',     icon:'☄️', name:'Rührsporn',      color:'#8fd98f',
    desc:'Schmaler Seitenarm der Rift. Klein, aber alle rühren hier mit.',
    q:['2,0','2,1','3,0'] },
];
const WR_REGION_OF = {};
for (const r of WR_REGIONS) for (const k of r.q) WR_REGION_OF[k] = r.key;
const wrRegionDef = (key) => WR_REGIONS.find(r => r.key === key) || null;

// Selbsttest beim Laden: Vollständigkeit + Überschneidungsfreiheit. Läuft einmal,
// meldet sich nur im Fehlerfall — ein vergessener Quadrant fällt sonst nie auf.
try {
  if (typeof wrAllQuadrants === 'function') {
    const soll = wrAllQuadrants().filter(q => q.ring > 0).map(q => q.key).sort();
    const ist  = Object.keys(WR_REGION_OF).sort();
    const fehlt = soll.filter(k => !WR_REGION_OF[k]);
    const zuviel = ist.filter(k => !soll.includes(k));
    let doppelt = 0;
    const seen = {};
    for (const r of WR_REGIONS) for (const k of r.q) { if (seen[k]) doppelt++; seen[k] = 1; }
    if (fehlt.length || zuviel.length || doppelt) {
      console.warn('[wr-stats] Regionen-Tabelle unstimmig:',
        { fehlt, zuviel, doppelt, soll: soll.length, ist: ist.length });
    }
  }
} catch (e) { /* Selbsttest darf nie stören */ }

// Kontrolle einer Region: die meisten Kolonien gewinnen. Gleichstand → Summe der
// Kolonie-Stufen, dann Planeten-Geschütze; bleibt es gleich, kontrolliert niemand.
// Rein rechnerisch aus der Planetentabelle — kein gespeicherter Zustand, kein SQL.
function wrRegionStand(regionKey) {
  const pls = (typeof _wrGalaxy !== 'undefined' && _wrGalaxy?.planets) || [];
  const by = {};
  for (const p of pls) {
    if (!p || WR_REGION_OF[p.quadrant] !== regionKey) continue;
    if (!p.colonized_by) continue;
    const e = by[p.colonized_by] || (by[p.colonized_by] = { id: p.colonized_by, col: 0, lvl: 0, def: 0 });
    e.col += 1;
    e.lvl += (typeof wrColonyLevel === 'function') ? wrColonyLevel(p) : 1;
    e.def += (typeof wrPlanetDef === 'function') ? wrPlanetDef(p) : 0;
  }
  const list = Object.values(by).sort((a, b) => b.col - a.col || b.lvl - a.lvl || b.def - a.def);
  if (!list.length) return { list, holder: null };
  const t = list[0];
  const gleich = list[1] && list[1].col === t.col && list[1].lvl === t.lvl && list[1].def === t.def;
  return { list, holder: gleich ? null : t };
}
function wrRegionsOf(memberId) {
  return WR_REGIONS.filter(r => wrRegionStand(r.key).holder?.id === memberId).length;
}

// ── 📈 Karriere-Zähler (map_data.wrStats) ──────────────────────────────────
// Live-Werte (Planeten, Kolonien, Flotte) kommen aus der Galaxie und brauchen
// keinen Zähler. Hier stehen nur die Dinge, die NUR im Moment des Ereignisses
// bekannt sind und sonst für immer verloren wären.
const WR_STATS_LEER = {
  v: 1,
  battlesWon: 0, battlesLost: 0, foesDefeated: 0,
  wavesWon: 0, wavesLost: 0, waveStrengthMax: 0,
  shipsBuilt: 0, shipsLost: 0,
  minedErz: 0, minedKri: 0, minedPla: 0, minedQua: 0,
  lootCc: 0, lootErz: 0, lootKri: 0, lootPla: 0, lootQua: 0,
  quadrantsScouted: 0, coloniesFounded: 0, planetsLost: 0,
  helpSent: 0, ccFromSpace: 0, maxPower: 0,
  ambushes: 0, firstAt: null, lastAt: null,
};
function wrStatsOf(u) {
  const s = u?.map_data?.wrStats;
  return (s && typeof s === 'object') ? Object.assign({}, WR_STATS_LEER, s) : Object.assign({}, WR_STATS_LEER);
}

// Sammelt Deltas und schreibt sie gebündelt — nicht bei jedem Klick.
// ⚠️ Immer FRISCH lesen und nur wrStats mergen (Muster appendTodayLogFresh):
// ein Statistik-Write darf niemals den Tages-Log oder salaryHistory clobbern.
let _wrPending = null, _wrFlushTimer = null, _wrFlushBusy = false;
const WR_FLUSH_MS = 5000;

function wrBump(delta, maxFields) {
  try {
    if (!delta) return;
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    _wrPending = _wrPending || { add: {}, max: {} };
    for (const [k, v] of Object.entries(delta)) {
      const n = parseFloat(v) || 0;
      if (!n) continue;
      if (maxFields && maxFields.indexOf(k) >= 0) _wrPending.max[k] = Math.max(_wrPending.max[k] || 0, n);
      else _wrPending.add[k] = (_wrPending.add[k] || 0) + n;
    }
    // Lokal sofort mitziehen — die Anzeige soll nicht 5 s nachhinken. Der Server-
    // Stand kommt beim Flush; bis dahin ist der lokale Wert die bessere Näherung.
    try {
      const cur = wrStatsOf(me);
      for (const [k, v] of Object.entries(delta)) {
        const n = parseFloat(v) || 0;
        if (!n) continue;
        if (maxFields && maxFields.indexOf(k) >= 0) cur[k] = Math.max(cur[k] || 0, n);
        else cur[k] = Math.round(((cur[k] || 0) + n) * 100) / 100;
      }
      me.map_data = Object.assign({}, me.map_data || {}, { wrStats: cur });
    } catch (e) {}
    if (_wrFlushTimer) clearTimeout(_wrFlushTimer);
    _wrFlushTimer = setTimeout(() => { wrFlushStats(); }, WR_FLUSH_MS);
  } catch (e) { /* non-critical */ }
}

async function wrFlushStats() {
  if (_wrFlushBusy || !_wrPending) return;
  const batch = _wrPending;
  _wrPending = null;
  if (_wrFlushTimer) { clearTimeout(_wrFlushTimer); _wrFlushTimer = null; }
  _wrFlushBusy = true;
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    let md = {};
    try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
    const s = Object.assign({}, WR_STATS_LEER, (md && md.wrStats) || {});
    for (const [k, v] of Object.entries(batch.add)) s[k] = Math.round(((s[k] || 0) + v) * 100) / 100;
    for (const [k, v] of Object.entries(batch.max)) s[k] = Math.max(s[k] || 0, v);
    if (!s.firstAt) s.firstAt = new Date().toISOString();
    s.lastAt = new Date().toISOString();
    const next = Object.assign({}, md || {}, { wrStats: s });
    await DB.updateMapData(me.id, next);
    // Lokale Kopien mitziehen, damit die Statistik ohne Reload stimmt.
    try {
      if (typeof currentUserData !== 'undefined' && currentUserData) currentUserData.map_data = next;
      if (typeof appData !== 'undefined' && appData?.users) {
        const u = appData.users.find(x => x.id === me.id);
        if (u) u.map_data = next;
      }
      if (typeof _wrMember !== 'undefined' && _wrMember && _wrMember.id === me.id) _wrMember.map_data = next;
    } catch (e) {}
    try { await wrCheckStatsAchievements(); } catch (e) {}
  } catch (e) {
    // Fehlgeschlagene Deltas zurücklegen — beim nächsten Ereignis wird es erneut versucht.
    _wrPending = _wrPending
      ? { add: Object.assign({}, batch.add, _wrPending.add), max: Object.assign({}, batch.max, _wrPending.max) }
      : batch;
    console.warn('[wr-stats] Speichern fehlgeschlagen:', e.message);
  } finally { _wrFlushBusy = false; }
}
// Beim Wegschalten der App noch offene Zähler wegschreiben.
try {
  document.addEventListener('visibilitychange', () => { if (document.hidden) wrFlushStats(); });
} catch (e) {}

// ── 🔌 Ereignis-Erfassung: DB-Methoden umhüllen ────────────────────────────
// Bewusst hier und nicht in weltraum.js: die DB-Methoden sind der EINE Ort, an
// dem jedes Weltraum-Ereignis vorbeikommt (Tab offen oder nicht, Auto-Claim
// beim App-Start eingeschlossen). Die Hülle reicht das Original unverändert
// durch — schlägt die Zählung fehl, merkt das Spiel davon nichts.
function wrWrap(name, fn) {
  const orig = DB[name];
  if (typeof orig !== 'function') return;
  DB[name] = async function (...args) {
    const res = await orig.apply(DB, args);
    try { fn(res, args); } catch (e) { console.warn('[wr-stats] ' + name + ':', e.message); }
    return res;
  };
}

wrWrap('claimSpaceArrival', (r) => {
  if (!r || r.error || r.nothing) return;
  const d = {};
  if (r.ambushed) d.ambushes = 1;
  if (r.intent === 'attack' && !r.ambushed && !r.recalled) {
    if (r.won) { d.battlesWon = 1; d.foesDefeated = parseFloat(r.enemy) || 0; }
    else d.battlesLost = 1;
  }
  if (r.intent === 'scout' && !r.ambushed && !r.recalled) d.quadrantsScouted = 1;
  if (r.intent === 'colonize' && !r.note && !r.ambushed && !r.recalled) d.coloniesFounded = 1;
  if (r.cc > 0)       { d.lootCc = r.cc; d.ccFromSpace = r.cc; }
  if (r.erz > 0)      d.lootErz = r.erz;
  if (r.kristall > 0) d.lootKri = r.kristall;
  if (r.plasmoid > 0) d.lootPla = r.plasmoid;
  if (r.quantum > 0)  d.lootQua = r.quantum;
  if (r.shipsLost > 0) d.shipsLost = r.shipsLost;
  wrBump(d);
});

wrWrap('harvestSpace', (r) => {
  if (!r || r.error) return;
  const d = {};
  if (r.erz > 0)      d.minedErz = r.erz;
  if (r.kristall > 0) d.minedKri = r.kristall;
  if (r.plasmoid > 0) d.minedPla = r.plasmoid;
  if (r.quantum > 0)  d.minedQua = r.quantum;
  wrBump(d);
});

wrWrap('resolveSpaceWave', (r) => {
  if (!r || r.error || r.nothing || !r.resolved) return;
  const d = { shipsLost: r.shipsLost || 0 };
  if (r.won) { d.wavesWon = 1; if (r.cc > 0) { d.ccFromSpace = r.cc; } }
  else d.wavesLost = 1;
  wrBump(d, []);
  if (r.won) wrBump({ waveStrengthMax: parseFloat(r.strength) || 0 }, ['waveStrengthMax']);
});

wrWrap('claimSpaceBuild', (r) => {
  if (!r || r.error || !Array.isArray(r.got)) return;
  const n = r.got.reduce((a, g) => a + (parseInt(g?.count, 10) || 0), 0);
  if (n > 0) wrBump({ shipsBuilt: n });
});

wrWrap('sendSpaceHelp', (r) => { if (r && !r.error && r.ok !== false) wrBump({ helpSent: 1 }); });

wrWrap('refineClaim',    (r) => { if (r && !r.error && r.cc > 0) wrBump({ ccFromSpace: r.cc }); });
wrWrap('spaceTransmute', (r) => { if (r && !r.error && r.cc > 0) wrBump({ ccFromSpace: r.cc }); });

wrWrap('sweepSpaceReconquest', (r) => {
  if (!r || r.error || !Array.isArray(r.lost)) return;
  const me = (typeof currentUserData !== 'undefined' && currentUserData?.id) || null;
  const n = r.lost.filter(p => p && p.memberId === me).length;
  if (n > 0) wrBump({ planetsLost: n });
});

// ── 🔢 Live-Kennzahlen je Spieler (aus Galaxie + members.space) ────────────
function wrPlanets() { return (typeof _wrGalaxy !== 'undefined' && _wrGalaxy?.planets) || []; }
function wrShipsOf(u) { return u?.space?.fleets?.home?.ships || {}; }

// Effektive Kampfkraft der Heimatflotte: dieselben Faktoren, die auch der
// Server auf den Verband legt (Technik, Flaggschiff, Träger) — die Funktionen
// stammen aus weltraum.js, hier wird nichts nachgerechnet.
function wrPowerOf(u) {
  try {
    const ships = wrShipsOf(u);
    let p = (typeof wrFleetPower === 'function') ? wrFleetPower(ships) : 0;
    if (typeof wrTechFleet === 'function')      p *= wrTechFleet(u);
    if (typeof wrFlagshipBonus === 'function')  p *= wrFlagshipBonus(ships);
    if (typeof wrCarrierBonus === 'function')   p *= wrCarrierBonus(ships);
    return Math.round(p);
  } catch (e) { return 0; }
}

function wrLive(u) {
  const pls = wrPlanets();
  const o = {
    id: u.id, name: u.name,
    freed: 0, colonies: 0, colonyLevels: 0, defense: 0, stations: 0,
    maxRing: 0, regions: 0,
    power: wrPowerOf(u),
    turret: 0, port: 0, yard: 0, tech: 0, techMax: 0,
    erz: 0, kristall: 0, plasmoid: 0, quantum: 0,
    ships: 0, routes: 0, hasSpace: false,
  };
  try {
    for (const p of pls) {
      if (!p) continue;
      if (p.cleared_by === u.id) { o.freed++; o.maxRing = Math.max(o.maxRing, parseInt(p.ring, 10) || 0); }
      if (p.colonized_by === u.id) {
        o.colonies++;
        o.colonyLevels += (typeof wrColonyLevel === 'function') ? wrColonyLevel(p) : 1;
        o.defense += (typeof wrPlanetDef === 'function') ? wrPlanetDef(p) : 0;
        if (p.station) o.stations++;
        o.maxRing = Math.max(o.maxRing, parseInt(p.ring, 10) || 0);
      }
    }
    o.regions = wrRegionsOf(u.id);
    const sp = u.space || {};
    o.hasSpace = !!(sp && Object.keys(sp).length);
    o.erz      = Math.floor(parseFloat(sp.erz) || 0);
    o.kristall = Math.floor(parseFloat(sp.kristall) || 0);
    o.plasmoid = Math.floor(parseFloat(sp.plasmoid) || 0);
    o.quantum  = Math.floor(parseFloat(sp.quantum) || 0);
    o.port     = Math.max(1, parseInt(sp.base?.level, 10) || 1);
    o.yard     = Math.max(1, parseInt(sp.yard?.level, 10) || 1);
    o.tech     = Object.keys(sp.tech || {}).length;
    o.techMax  = (typeof SPACE_TECH !== 'undefined') ? SPACE_TECH.length : 0;
    o.routes   = Object.keys(sp.routes || {}).length;
    o.ships    = Object.values(wrShipsOf(u)).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
    o.turret   = (typeof wrTurretPower === 'function') ? Math.round(wrTurretPower(u)) : 0;
  } catch (e) { /* eine kaputte Zeile darf die Tabelle nicht kippen */ }
  return o;
}

// Raumfahrt-Score — EIN Wert für die Rangliste. Startwerte, bewusst grob:
// Präsenz (Kolonien/Regionen) wiegt schwerer als reine Zahlenmasse.
function wrScore(o, st) {
  return Math.round(
      (o.freed || 0) * 10
    + (o.colonies || 0) * 25
    + (o.colonyLevels || 0) * 10
    + (o.regions || 0) * 100
    + (o.stations || 0) * 60
    + (o.tech || 0) * 8
    + (o.power || 0) / 100
    + (o.turret || 0) / 100
    + ((st?.foesDefeated || 0) / 500)
  );
}

function wrAllUsers() {
  try { return (typeof appData !== 'undefined' && appData?.users) ? appData.users : []; }
  catch (e) { return []; }
}

// ── 🎨 Styles (mitgeliefert, damit es bei EINER neuen Datei bleibt) ────────
(function injectCss() {
  try {
    if (document.getElementById('wr-stats-css')) return;
    const s = document.createElement('style');
    s.id = 'wr-stats-css';
    s.textContent = `
.wrs-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.wrs-table { width: 100%; border-collapse: collapse; font-size: .76rem; min-width: 430px; }
.wrs-table th { color: #7f8fbb; font-weight: 600; text-align: right; padding: 5px 6px;
  border-bottom: 1px solid #24305a; white-space: nowrap; font-size: .68rem;
  text-transform: uppercase; letter-spacing: .03em; }
.wrs-table th:first-child, .wrs-table td:first-child { text-align: left; }
.wrs-table td { padding: 6px; border-bottom: 1px solid #161f3c; color: #c3cfee;
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.wrs-table tr:last-child td { border-bottom: 0; }
.wrs-me td { background: rgba(212,170,55,.09); color: #f0e2bd; }
.wrs-rank { color: #7f8fbb; width: 1.6em; }
.wrs-sortbar { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.wrs-sort { padding: 4px 9px; border-radius: 7px; border: 1px solid #24305a;
  background: #101733; color: #8b9ac4; font-size: .7rem; font-family: inherit; cursor: pointer; }
.wrs-sort.active { border-color: #4d7fd4; background: #1d2a55; color: #dce6ff; }
.wrs-reg { display: flex; align-items: center; gap: 9px; padding: 7px 0;
  border-bottom: 1px solid #161f3c; }
.wrs-reg:last-child { border-bottom: 0; }
.wrs-reg-ic { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; font-size: .95rem;
  background: #101733; border: 1px solid #24305a; }
.wrs-reg-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.wrs-reg-n { font-size: .8rem; font-weight: 600; color: #dce6ff; }
.wrs-reg-d { font-size: .68rem; color: #7f8fbb; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.wrs-reg-h { font-size: .74rem; font-weight: 700; white-space: nowrap; text-align: right; }
.wrs-reg-free { color: #7f8fbb; font-weight: 400; }
.wrs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 7px; }
.wrs-kpi { background: #101733; border: 1px solid #24305a; border-radius: 9px;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.wrs-kpi-l { font-size: .66rem; color: #7f8fbb; }
.wrs-kpi-v { font-size: .95rem; font-weight: 700; color: #dce6ff;
  font-variant-numeric: tabular-nums; }
.wrs-bar { height: 7px; border-radius: 4px; overflow: hidden; background: #1a2344;
  border: 1px solid #24305a; margin: 6px 0 4px; }
.wrs-bar-fill { height: 100%; background: linear-gradient(90deg, #4d7fd4, #7ad48a); }
.wrs-note { font-size: .7rem; color: #7f8fbb; line-height: 1.45; margin-top: 8px; }
`;
    document.head.appendChild(s);
  } catch (e) { /* ohne CSS sieht es schlicht aus, funktioniert aber */ }
})();

// ── 📊 Der Statistik-Tab ───────────────────────────────────────────────────
// Als achter Eintrag in WR_TABS. wrSetTab prüft gegen genau dieses Array und
// wrRender blendet bei unbekanntem Tab alle bestehenden Panels aus — das eigene
// Panel wird danach angehängt (siehe Patch unten).
if (!WR_TABS.some(t => t.key === 'stats')) {
  WR_TABS.push({ key: 'stats', icon: '📊', name: 'Statistik' });
}

let _wrsSort = 'score';
const WRS_SORTS = [
  { key:'score',    label:'🏆 Score',      get:(r) => r.score },
  { key:'colonies', label:'🪐 Kolonien',   get:(r) => r.o.colonies },
  { key:'freed',    label:'⚔️ Planeten',   get:(r) => r.o.freed },
  { key:'regions',  label:'🗺️ Regionen',   get:(r) => r.o.regions },
  { key:'power',    label:'🚀 Kampfkraft', get:(r) => r.o.power },
  { key:'foes',     label:'💀 Feinde',     get:(r) => r.st.foesDefeated },
  { key:'tech',     label:'🔬 Forschung',  get:(r) => r.o.tech },
];

function _e(s) { return (typeof _wrEsc === 'function') ? _wrEsc(s) : String(s == null ? '' : s); }
function _f(n)  { return (typeof wrFmt === 'function') ? wrFmt(n) : Math.round(n || 0).toLocaleString('de-DE'); }

function wrsRows() {
  const me = (typeof currentUserData !== 'undefined' && currentUserData?.id) || null;
  const rows = [];
  for (const u of wrAllUsers()) {
    try {
      const o = wrLive(u), st = wrStatsOf(u);
      // Wer nie im All war, erscheint nicht in der Rangliste — er wäre eine
      // Nullzeile ohne Aussage. Der eigene Eintrag bleibt immer sichtbar.
      if (!o.hasSpace && !o.freed && !o.colonies && u.id !== me) continue;
      rows.push({ u, o, st, score: wrScore(o, st), me: u.id === me });
    } catch (e) { /* einzelnen Spieler überspringen, Tabelle bleibt */ }
  }
  const s = WRS_SORTS.find(x => x.key === _wrsSort) || WRS_SORTS[0];
  rows.sort((a, b) => (s.get(b) || 0) - (s.get(a) || 0) || a.u.name.localeCompare(b.u.name));
  return rows;
}

function wrsRanglisteHtml(rows) {
  const body = rows.map((r, i) => `
    <tr class="${r.me ? 'wrs-me' : ''}">
      <td><span class="wrs-rank">${i + 1}</span> ${_e(r.u.name)}</td>
      <td><strong>${_f(r.score)}</strong></td>
      <td>${_f(r.o.freed)}</td>
      <td>${_f(r.o.colonies)}${r.o.colonyLevels > r.o.colonies ? ` <span class="wr-sub">(${_f(r.o.colonyLevels)})</span>` : ''}</td>
      <td>${r.o.regions || '—'}</td>
      <td>${_f(r.o.power)}</td>
      <td>${_f(r.o.turret)}</td>
      <td>${_f(r.st.foesDefeated)}</td>
      <td>${r.o.tech}${r.o.techMax ? '/' + r.o.techMax : ''}</td>
      <td>${r.o.maxRing || '—'}</td>
    </tr>`).join('');
  return `
    <div class="wr-card">
      <div class="wr-card-title">🏆 Clan-Rangliste
        <span class="wr-sub">— ${rows.length} Raumfahrer</span></div>
      <div class="wrs-sortbar">${WRS_SORTS.map(s =>
        `<button class="wrs-sort${_wrsSort === s.key ? ' active' : ''}" data-wrs-sort="${s.key}">${s.label}</button>`).join('')}</div>
      <div class="wrs-tablewrap"><table class="wrs-table">
        <thead><tr>
          <th>Spieler</th><th>Score</th><th>⚔️ Pl.</th><th>🪐 Kol.</th><th>🗺️ Reg.</th>
          <th>🚀 Kraft</th><th>🛡️ Hafen</th><th>💀 Feinde</th><th>🔬 Tech</th><th>Ring</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="10">Noch niemand im All.</td></tr>'}</tbody>
      </table></div>
      <div class="wrs-note">Der <strong>Score</strong> gewichtet dauerhafte Präsenz höher als Zahlenmasse:
        Regionen 100 · Stationen 60 · Kolonien 25 (+10 je Stufe) · befreite Planeten 10 ·
        Forschung 8 · Kampfkraft und Hafen-Feuerkraft je ÷100 · besiegte Wächterstärke ÷500.
        <em>Kol.</em> zeigt in Klammern die Summe der Kolonie-Stufen.</div>
    </div>`;
}

function wrsRegionenHtml() {
  const me = (typeof currentUserData !== 'undefined' && currentUserData?.id) || null;
  const nameOf = (id) => wrAllUsers().find(u => u.id === id)?.name || 'Unbekannt';
  const rows = WR_REGIONS.map(r => {
    const st = wrRegionStand(r.key);
    const h  = st.holder;
    const col = h && typeof wrMemberColor === 'function' ? wrMemberColor(h.id) : '#7f8fbb';
    const strittig = !h && st.list.length > 0;
    return `
      <div class="wrs-reg">
        <span class="wrs-reg-ic" style="border-color:${h ? col : '#24305a'}">${r.icon}</span>
        <span class="wrs-reg-txt">
          <span class="wrs-reg-n">${_e(r.name)} <span class="wr-sub">${r.q.length} Quadranten</span></span>
          <span class="wrs-reg-d">${_e(r.desc)}</span>
        </span>
        <span class="wrs-reg-h" style="color:${h ? col : ''}">${h
          ? `${_e(nameOf(h.id))}<br><span class="wr-sub">${h.col} Kolonien</span>`
          : strittig
            ? `<span class="wrs-reg-free">umkämpft</span><br><span class="wr-sub">${st.list.length} Parteien gleichauf</span>`
            : '<span class="wrs-reg-free">frei</span>'}</span>
      </div>`;
  }).join('');
  const meineRegionen = me ? wrRegionsOf(me) : 0;
  return `
    <div class="wr-card">
      <div class="wr-card-title">🗺️ Regionen
        <span class="wr-sub">— du kontrollierst ${meineRegionen} von ${WR_REGIONS.length}</span></div>
      ${rows}
      <div class="wrs-note">Eine Region gehört dem, der dort die <strong>meisten Kolonien</strong> hält
        (Gleichstand: Kolonie-Stufen, dann Geschütze). Sie wird laufend neu berechnet — wer verdrängt wird,
        verliert sie sofort. <em>Regionsboni und die Übernahmeregel für fremde Regionen folgen mit dem
        nächsten Server-Update; im Moment sind Regionen Ehre und Score.</em></div>
    </div>`;
}

function wrsSteckbriefHtml() {
  const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
  if (!me) return '';
  const st = wrStatsOf(me), o = wrLive(me);
  const kpi = (l, v) => `<div class="wrs-kpi"><span class="wrs-kpi-l">${l}</span><span class="wrs-kpi-v">${v}</span></div>`;
  const kaempfe = st.battlesWon + st.battlesLost;
  const quote = kaempfe ? Math.round(st.battlesWon / kaempfe * 100) : null;
  return `
    <div class="wr-card">
      <div class="wr-card-title">👤 Dein Steckbrief
        <span class="wr-sub">— Score ${_f(wrScore(o, st))}</span></div>
      <div class="wrs-grid">
        ${kpi('⚔️ Gefechte gewonnen', `${_f(st.battlesWon)}${quote != null ? ` <span class="wr-sub">${quote}%</span>` : ''}`)}
        ${kpi('💀 Wächterstärke besiegt', _f(st.foesDefeated))}
        ${kpi('🛡️ Wellen abgewehrt', `${_f(st.wavesWon)}${st.wavesLost ? ` <span class="wr-sub">/${_f(st.wavesLost)} verloren</span>` : ''}`)}
        ${kpi('🚨 Stärkste Welle', st.waveStrengthMax ? _f(st.waveStrengthMax) : '—')}
        ${kpi('🏗️ Schiffe gebaut', _f(st.shipsBuilt))}
        ${kpi('💥 Schiffe verloren', _f(st.shipsLost))}
        ${kpi('🛰️ Quadranten aufgeklärt', _f(st.quadrantsScouted))}
        ${kpi('🪐 Kolonien gegründet', _f(st.coloniesFounded))}
        ${kpi('⛏️ Abgebaut', `${_f(st.minedErz)} 🪨 · ${_f(st.minedKri)} 💎`)}
        ${kpi('🏴 Erbeutet', `${_f(st.lootErz)} 🪨 · ${_f(st.lootKri)} 💎`)}
        ${kpi('🟣🌀 Ring-Beute', `${_f(st.lootPla + st.minedPla)} 🟣 · ${_f(st.lootQua + st.minedQua)} 🌀`)}
        ${kpi('🪙 CC aus dem All', _f(st.ccFromSpace))}
        ${kpi('🤝 Verstärkung geschickt', _f(st.helpSent))}
        ${kpi('💣 Hinterhalte', _f(st.ambushes))}
        ${st.planetsLost ? kpi('🪐 Planeten zurückgefallen', _f(st.planetsLost)) : ''}
      </div>
      <div class="wrs-note">Diese Zähler laufen ab dem Tag, an dem die Statistik eingebaut wurde —
        alles davor lässt sich nicht rekonstruieren. Die Werte oben in der Rangliste (Planeten,
        Kolonien, Flotte, Forschung) zeigen dagegen immer den vollen, aktuellen Stand.</div>
    </div>`;
}

function wrsClanHtml() {
  const pls = wrPlanets();
  if (!pls.length) return '';
  let frei = 0, kolonisiert = 0, wrack = 0, gesamt = pls.length;
  const jeRing = {};
  for (const p of pls) {
    const r = parseInt(p?.ring, 10) || 0;
    jeRing[r] = jeRing[r] || { n: 0, frei: 0 };
    jeRing[r].n++;
    if (p?.cleared_by) { frei++; jeRing[r].frei++; }
    if (p?.colonized_by) kolonisiert++;
    if ((typeof wrWreckLeft === 'function' ? wrWreckLeft(p) : 0) > 0) wrack++;
  }
  const pct = gesamt ? Math.round(frei / gesamt * 100) : 0;
  const ringe = Object.keys(jeRing).sort().map(r =>
    `<div class="wrs-kpi"><span class="wrs-kpi-l">Ring ${r}</span>
       <span class="wrs-kpi-v">${jeRing[r].frei}/${jeRing[r].n}</span></div>`).join('');
  return `
    <div class="wr-card">
      <div class="wr-card-title">🌌 Der Clan insgesamt
        <span class="wr-sub">— ${pct} % der Galaxie befreit</span></div>
      <div class="wrs-bar"><div class="wrs-bar-fill" style="width:${pct}%"></div></div>
      <div class="wrs-grid">
        <div class="wrs-kpi"><span class="wrs-kpi-l">Planeten gesamt</span><span class="wrs-kpi-v">${gesamt}</span></div>
        <div class="wrs-kpi"><span class="wrs-kpi-l">Befreit</span><span class="wrs-kpi-v">${frei}</span></div>
        <div class="wrs-kpi"><span class="wrs-kpi-l">Kolonisiert</span><span class="wrs-kpi-v">${kolonisiert}</span></div>
        <div class="wrs-kpi"><span class="wrs-kpi-l">♻️ Wrackfelder</span><span class="wrs-kpi-v">${wrack}</span></div>
        ${ringe}
      </div>
    </div>`;
}

function wrsPanelHtml() {
  try {
    const rows = wrsRows();
    return wrsRanglisteHtml(rows) + wrsRegionenHtml() + wrsSteckbriefHtml() + wrsClanHtml();
  } catch (e) {
    console.warn('[wr-stats] Panel:', e.message);
    return `<div class="wr-card"><div class="wr-card-title">📊 Statistik</div>
      <div class="wr-sub">Die Statistik konnte gerade nicht aufgebaut werden. Lade den Tab neu.</div></div>`;
  }
}

// ── 🔧 Einhängen: wrRender patchen ────────────────────────────────────────
// wrRender baut _wrEl komplett neu auf und kennt den 'stats'-Tab nicht — bei
// unbekanntem Tab sind alle bestehenden Panels `hidden`. Danach hängen wir
// unseres an. Bewusst KEINE Änderung an weltraum.js: so bleibt die Datei bei
// einem künftigen Update von Claude Code konfliktfrei.
(function patchRender() {
  const orig = window.wrRender;
  if (typeof orig !== 'function') { console.warn('[wr-stats] wrRender nicht gefunden.'); return; }
  window.wrRender = function () {
    orig.apply(this, arguments);
    try {
      if (typeof _wrTab === 'undefined' || _wrTab !== 'stats') return;
      const wrap = document.querySelector('#imp-content .wr-wrap') ||
                   document.querySelector('.wr-wrap');
      if (!wrap) return;
      const box = document.createElement('div');
      box.id = 'wr-stats-panel';
      box.innerHTML = wrsPanelHtml();
      wrap.appendChild(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-wrs-sort]');
        if (!b) return;
        _wrsSort = b.dataset.wrsSort;
        window.wrRender();
      });
    } catch (e) { console.warn('[wr-stats] Render-Patch:', e.message); }
  };
})();

// ── 🎨 Regionen auf der Sternkarte ────────────────────────────────────────
// Nachträglicher, sehr dezenter Farbschleier über kontrollierte Regionen plus
// Namenszug. Läuft NACH wrDrawMap und wiederholt dessen Zoom/Pan-Transformation
// (dieselben Modul-Variablen), damit Zeichnung und Karte deckungsgleich bleiben.
// ⚠️ Bewusst mit niedriger Deckkraft und ohne Klick-Logik: die Karte bleibt in
// jeder Hinsicht das Original.
(function patchMap() {
  const orig = window.wrDrawMap;
  if (typeof orig !== 'function') return;
  window.wrDrawMap = function () {
    orig.apply(this, arguments);
    try {
      const cv = document.getElementById('wr-canvas');
      if (!cv || typeof wrHexCenter !== 'function') return;
      const ctx = cv.getContext('2d');
      const size = (typeof WR_HEX_SIZE !== 'undefined') ? WR_HEX_SIZE : 56;
      const cx = cv.width / 2, cy = cv.height / 2;
      const zoom = (typeof _wrZoom !== 'undefined') ? _wrZoom : 1;
      const panX = (typeof _wrPanX !== 'undefined') ? _wrPanX : 0;
      const panY = (typeof _wrPanY !== 'undefined') ? _wrPanY : 0;

      ctx.save();
      ctx.translate(cx + panX, cy + panY);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      for (const r of WR_REGIONS) {
        const st = wrRegionStand(r.key);
        if (!st.holder) continue;
        const col = (typeof wrMemberColor === 'function') ? wrMemberColor(st.holder.id) : r.color;
        let sx = 0, sy = 0, n = 0;
        for (const key of r.q) {
          const [qx, qy] = key.split(',').map(Number);
          const c = wrHexCenter(qx, qy, size);
          const x = cx + c.x, y = cy + c.y;
          sx += x; sy += y; n++;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i);
            const px = x + size * 0.92 * Math.cos(a), py = y + size * 0.92 * Math.sin(a);
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.globalAlpha = 0.10; ctx.fillStyle = col; ctx.fill();
          ctx.globalAlpha = 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (n) {
          ctx.globalAlpha = 0.9;
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = col;
          ctx.fillText(r.icon + ' ' + r.name, sx / n, sy / n - size * 0.72);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    } catch (e) { /* die Karte darf daran nie scheitern */ }
  };
})();

// ── 🏆 Neue Erfolge ────────────────────────────────────────────────────────
// Alle event-granted (condition:null) und hier geprüft: Regionen und Ring-Stand
// hängen an der Galaxie, die in checkAchievements() gar nicht vorliegt.
const WR_NEUE_ACHIEVEMENTS = [
  { id:'space_region_first', icon:'🗺️', name:'Regionsfürst',      desc:'Erste Region der Galaxie kontrolliert',        condition:null, coinReward:400  },
  { id:'space_region_three', icon:'🌌', name:'Sektorenherr',      desc:'Drei Regionen gleichzeitig kontrolliert',      condition:null, coinReward:900  },
  { id:'space_region_all',   icon:'🪬', name:'Herr der Galaxie',  desc:'Alle acht Regionen gleichzeitig kontrolliert', condition:null, coinReward:3000 },
  { id:'space_ring3',        icon:'🌠', name:'Grenzgänger',       desc:'Einen Planeten im äussersten Ring befreit',    condition:null, coinReward:400  },
  { id:'space_colonies_10',  icon:'🌇', name:'Kolonialmacht',     desc:'10 Kolonien gleichzeitig besessen',            condition:null, coinReward:600  },
  { id:'space_foes_10k',     icon:'💀', name:'Wächterschreck',    desc:'10.000 Wächterstärke insgesamt besiegt',       condition:null, coinReward:500  },
  { id:'space_armada',       icon:'💫', name:'Armada',            desc:'Heimatflotte mit 5.000 Kampfkraft',            condition:null, coinReward:500  },
  { id:'space_shipyard_100', icon:'🏗️', name:'Werftlegende',      desc:'100 Schiffe gebaut',                           condition:null, coinReward:400  },
];
try {
  if (typeof ACHIEVEMENTS !== 'undefined' && Array.isArray(ACHIEVEMENTS)) {
    for (const a of WR_NEUE_ACHIEVEMENTS) {
      if (!ACHIEVEMENTS.some(x => x.id === a.id)) ACHIEVEMENTS.push(a);
    }
  }
} catch (e) { console.warn('[wr-stats] Achievements:', e.message); }

// Prüfung läuft nach jedem Zähler-Flush und beim Öffnen des Statistik-Tabs.
// ⚠️ existing-Prüfung vor jedem Grant (Muster aus dem Bestandscode), damit
// nichts doppelt vergeben wird.
async function wrCheckStatsAchievements() {
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    const ex = me.achievements || {};
    const o = wrLive(me), st = wrStatsOf(me);
    const g = {};
    if (!ex.space_region_first && o.regions >= 1) g.space_region_first = true;
    if (!ex.space_region_three && o.regions >= 3) g.space_region_three = true;
    if (!ex.space_region_all   && o.regions >= WR_REGIONS.length) g.space_region_all = true;
    if (!ex.space_ring3        && o.maxRing >= 3) g.space_ring3 = true;
    if (!ex.space_colonies_10  && o.colonies >= 10) g.space_colonies_10 = true;
    if (!ex.space_foes_10k     && st.foesDefeated >= 10000) g.space_foes_10k = true;
    if (!ex.space_armada       && o.power >= 5000) g.space_armada = true;
    if (!ex.space_shipyard_100 && st.shipsBuilt >= 100) g.space_shipyard_100 = true;
    const keys = Object.keys(g);
    if (!keys.length) return;
    await DB.grantAchievements(me.id, g);
    try {
      if (typeof currentUserData !== 'undefined' && currentUserData) {
        currentUserData = Object.assign({}, currentUserData, { achievements: Object.assign({}, ex, g) });
      }
    } catch (e) {}
    for (const k of keys) {
      const a = WR_NEUE_ACHIEVEMENTS.find(x => x.id === k);
      if (a && typeof showToast === 'function') {
        showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success');
      }
    }
  } catch (e) { console.warn('[wr-stats] Achievement-Prüfung:', e.message); }
}

// Beim Öffnen des Statistik-Tabs einmal mitprüfen (dort liegt die Galaxie
// garantiert geladen vor). Gedrosselt, damit ein Neurendern nichts auslöst.
let _wrsAchTs = 0;
(function hookAchCheck() {
  const orig = window.wrSetTab;
  if (typeof orig !== 'function') return;
  window.wrSetTab = function (key) {
    orig.apply(this, arguments);
    if (key === 'stats' && Date.now() - _wrsAchTs > 60000) {
      _wrsAchTs = Date.now();
      wrCheckStatsAchievements();
    }
  };
})();

// Nach aussen sichtbar machen — für spätere Bausteine (Aufgaben, Regionsboni)
// und zum Nachschauen in der Konsole.
window.WR_REGIONS   = WR_REGIONS;
window.WR_REGION_OF = WR_REGION_OF;
window.wrRegionStand = wrRegionStand;
window.wrRegionsOf   = wrRegionsOf;
window.wrStatsOf     = wrStatsOf;
window.wrLive        = wrLive;
window.wrScore       = wrScore;
window.wrFlushStats  = wrFlushStats;

console.info('[wr-stats] Weltraum-Statistik aktiv — 8 Regionen, ' + WR_NEUE_ACHIEVEMENTS.length + ' neue Erfolge.');

})();
