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
  // ⛏️ Rohstoffe nach HERKUNFT getrennt (JP 2026-08-06: „abgebaut durch Kolonien
  // und durch Schiffe sowie Wrackausbeute sind doch Unterschiede").
  //   mined*  = alles, was über harvest_space hereinkommt: Kolonie-Erträge,
  //             Dauerernte-Routen UND Bergungsrouten. Die RPC liefert eine
  //             Gesamtsumme — feiner geht es ohne Server-Änderung nicht.
  //   flight* = einzelne Abbau-Flüge (Reise mit Auftrag „abbauen").
  //   loot*   = Kampfbeute aus gewonnenen Gefechten.
  minedErz: 0, minedKri: 0, minedPla: 0, minedQua: 0,
  flightErz: 0, flightKri: 0, flightPla: 0, flightQua: 0,
  lootCc: 0, lootErz: 0, lootKri: 0, lootPla: 0, lootQua: 0,
  quadrantsScouted: 0, coloniesFounded: 0, planetsLost: 0,
  helpSent: 0, ccFromSpace: 0, maxPower: 0,
  ambushes: 0, firstAt: null, lastAt: null,
  // 🧾 Verluste EINZELN nach Schiffstyp (JP 2026-08-06). `shipsLost` oben bleibt
  // als Gesamtzahl bestehen — die läuft schon länger mit und wäre sonst entwertet.
  // Quelle ist `res.lost` aus claim_space_arrival/resolve_space_wave, dieselbe
  // Struktur, die wrLossBreakdown in weltraum.js für die Kampfberichte auswertet.
  lostByType: {},
};
function wrStatsOf(u) {
  const s = u?.map_data?.wrStats;
  const out = (s && typeof s === 'object')
    ? Object.assign({}, WR_STATS_LEER, s)
    : Object.assign({}, WR_STATS_LEER);
  // ⚠️ PFLICHT-KOPIE: Object.assign ist flach. Ohne diese Zeile zeigt `lostByType`
  // bei einem Spieler ohne eigene Werte auf DAS OBJEKT IN WR_STATS_LEER — die erste
  // Mutation würde die Vorlage vergiften und die Verluste bei allen anderen mitzählen.
  out.lostByType = Object.assign({}, (s && s.lostByType) || {});
  return out;
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

// Verluste je Schiffstyp sammeln. Eigene Funktion statt eines weiteren Feldes in
// wrBump: dort werden Zahlen addiert, hier eine Map — das sauber zu trennen ist
// billiger, als beide Fälle in einer Schleife zu unterscheiden.
function wrBumpLost(lost) {
  try {
    if (!lost || typeof lost !== 'object') return;
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    _wrPending = _wrPending || { add: {}, max: {}, lost: {} };
    _wrPending.lost = _wrPending.lost || {};
    let any = false;
    for (const [k, v] of Object.entries(lost)) {
      const n = parseInt(v, 10) || 0;
      if (n <= 0) continue;
      _wrPending.lost[k] = (_wrPending.lost[k] || 0) + n;
      any = true;
    }
    if (!any) return;
    try {
      const cur = wrStatsOf(me);
      for (const [k, v] of Object.entries(lost)) {
        const n = parseInt(v, 10) || 0;
        if (n > 0) cur.lostByType[k] = (cur.lostByType[k] || 0) + n;
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
    s.lostByType = Object.assign({}, (md && md.wrStats && md.wrStats.lostByType) || {});
    for (const [k, v] of Object.entries(batch.add)) s[k] = Math.round(((s[k] || 0) + v) * 100) / 100;
    for (const [k, v] of Object.entries(batch.max)) s[k] = Math.max(s[k] || 0, v);
    for (const [k, v] of Object.entries(batch.lost || {})) s.lostByType[k] = (s.lostByType[k] || 0) + v;
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
      ? { add: Object.assign({}, batch.add, _wrPending.add),
          max: Object.assign({}, batch.max, _wrPending.max),
          lost: (() => {
            const m = Object.assign({}, batch.lost || {});
            for (const [k, v] of Object.entries(_wrPending.lost || {})) m[k] = (m[k] || 0) + v;
            return m;
          })() }
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
  // ⚠️ FIX 2026-08-06: bisher landete JEDE Rohstoff-Rückkehr unter „erbeutet" —
  // auch der reine Abbau-Flug. Das vermischte Bergbau und Kriegsbeute in einer
  // Zahl. Jetzt entscheidet der Auftrag, in welchen Topf es geht.
  const bergbau = (r.intent === 'harvest');
  const P = bergbau ? 'flight' : 'loot';
  if (r.erz > 0)      d[P + 'Erz'] = r.erz;
  if (r.kristall > 0) d[P + 'Kri'] = r.kristall;
  if (r.plasmoid > 0) d[P + 'Pla'] = r.plasmoid;
  if (r.quantum > 0)  d[P + 'Qua'] = r.quantum;
  if (r.shipsLost > 0) d.shipsLost = r.shipsLost;
  wrBump(d);
  wrBumpLost(r.lost);
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
  wrBumpLost(r.lost);
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
/* ── Detail-Auflistungen (Flotte, Geschütze, Forschung, Ausbau) ───────────── */
.wrs-who { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
.wrs-whobtn { padding: 4px 10px; border-radius: 7px; border: 1px solid #24305a;
  background: #101733; color: #8b9ac4; font-size: .72rem; font-family: inherit; cursor: pointer; }
.wrs-whobtn.active { border-color: #d4aa37; background: #1c2440; color: #ffd15c; }
.wrs-sub-title { font-size: .78rem; font-weight: 700; color: #dce6ff; margin: 12px 0 5px;
  padding-bottom: 4px; border-bottom: 1px solid #1e2947; }
.wrs-sub-title:first-child { margin-top: 0; }
.wrs-line { display: grid; grid-template-columns: 26px 1fr auto; gap: 8px; align-items: center;
  padding: 4px 0; border-bottom: 1px solid #161f3c; font-size: .76rem; color: #c3cfee; }
.wrs-line:last-child { border-bottom: 0; }
.wrs-line-ic { width: 26px; height: 26px; display: flex; align-items: center;
  justify-content: center; font-size: 1rem; }
.wrs-line-ic img { width: 100%; height: 100%; object-fit: contain; display: block; }
/* Emoji-Rückfall nach dem etablierten Muster: default AUS, erscheint nur, wenn
   onerror am img feuert und die Hülle .wr-art-fail bekommt. So flackert beim
   Neurendern kein Emoji auf (die Lehre aus dem "aufflackernden Baukran").
   ACHTUNG: in diesem CSS-Block sind keine Backticks erlaubt — er steht in einem
   Template-String und wuerde sonst die Datei zerreissen. */
.wrs-line-fb { display: none; font-size: 1.05rem; }
.wr-art-fail .wrs-line-fb { display: inline-flex; }
.wrs-art { position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 1.5em; height: 1.5em; vertical-align: -.35em; margin-right: 3px; }
.wrs-art img { width: 100%; height: 100%; object-fit: contain; display: block; }
.wrs-art-fb { display: none; font-size: 1em; }
.wr-art-fail .wrs-art-fb { display: inline-flex; }
.wrs-line-n { color: #dce6ff; font-weight: 700; font-variant-numeric: tabular-nums;
  white-space: nowrap; }
.wrs-line-n .wr-sub { font-weight: 400; }
.wrs-line-lost { color: #e08a8a; }
.wrs-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.wrs-chip { font-size: .68rem; padding: 2px 7px; border-radius: 999px;
  background: rgba(255,255,255,.05); color: #a8b6dc; }
.wrs-chartwrap { position: relative; height: 190px; margin: 8px 0 2px; }
.wrs-empty { font-size: .74rem; color: #7f8fbb; padding: 6px 0; }
/* ── 🪨 Rohstoffzeile entzerren (JP 2026-08-06) ────────────────────────────────
   Die HUD-Leiste in weltraum.css ist eine EINZEILIGE Flexbox mit flex:1 je Kachel.
   Bei sechs Rohstoffen und fünfstelligen Zahlen (6.077 · 2.633 · 2.606 …) reicht
   die Breite nicht mehr — Symbol und Zahl schieben sich ineinander.
   ⚠️ Diese Regeln stehen bewusst HIER und nicht in weltraum.css: der <style>-Block
   wird nach dem Stylesheet in den <head> gehängt und gewinnt damit bei gleicher
   Spezifität, ohne dass eine fremde Datei angefasst werden muss.
   Lösung: umbrechen statt quetschen — bei sechs Kacheln zwei Reihen à drei. */
.wr-hud { flex-wrap: wrap; gap: 5px; }
.wr-res { flex: 1 1 92px; min-width: 0; padding: 3px 6px; gap: 4px; }
.wr-res-v { font-size: .8rem; font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; }
.wr-res-art, .wr-res-ic { flex: 0 0 auto; }
@media (max-width: 600px) { .wr-res-l { display: none; } }
/* ── Herkunftstabelle der Rohstoffe ─────────────────────────────────────────── */
.wrs-res-table { width: 100%; border-collapse: collapse; font-size: .74rem; }
.wrs-res-table th { color: #7f8fbb; font-size: .66rem; font-weight: 600; text-align: right;
  padding: 4px 5px; border-bottom: 1px solid #24305a; white-space: nowrap; }
.wrs-res-table th:first-child { text-align: left; }
.wrs-res-table td { padding: 5px; text-align: right; color: #c3cfee;
  border-bottom: 1px solid #161f3c; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wrs-res-table td:first-child { text-align: left; }
.wrs-res-table tr:last-child td { border-bottom: 0; }
.wrs-res-sum { color: #dce6ff; font-weight: 700; }
.wrs-res-0 { color: #4a5680; }
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
        ${kpi('🪙 CC aus dem All', _f(st.ccFromSpace))}
        ${kpi('🤝 Verstärkung geschickt', _f(st.helpSent))}
        ${kpi('💣 Hinterhalte', _f(st.ambushes))}
        ${st.planetsLost ? kpi('🪐 Planeten zurückgefallen', _f(st.planetsLost)) : ''}
      </div>
      ${wrsRohstoffTabelleHtml(st)}
      <div class="wrs-note">Diese Zähler laufen ab dem Tag, an dem die Statistik eingebaut wurde —
        alles davor lässt sich nicht rekonstruieren. Die Werte oben in der Rangliste (Planeten,
        Kolonien, Flotte, Forschung) zeigen dagegen immer den vollen, aktuellen Stand.</div>
    </div>`;
}

// 🪨 Woher die Rohstoffe kamen. Vier Sorten × drei Herkünfte — als Tabelle, weil
// zwölf Zahlen als Kacheln unlesbar würden (genau das Problem, das JP in der
// Rohstoffzeile gemeldet hat).
//
// ⚠️ EHRLICHE GRENZE: `harvest_space` liefert EINE Summe für Kolonie-Erträge,
// Dauerernte- UND Bergungsrouten. Feiner geht es nur mit einer Server-Änderung;
// die Spalte heisst deshalb bewusst „Kolonien & Routen" und nicht „Kolonien".
function wrsRohstoffTabelleHtml(st) {
  // 27p: die echten Rohstoff-Bilder statt Emoji (JP 2026-08-20). ⚠️ typeof-Guard, weil
  // diese Datei auch ohne weltraum.js geladen werden koennte — Regel 3: eine Anzeige
  // darf nie der Grund sein, dass die Statistik gar nicht erst erscheint.
  const ic = (k, fb) => (typeof wrIc === 'function') ? wrIc(k) : fb;
  const sorten = [
    { ic:ic('erz', '🪨'), name:'Erz',           m:st.minedErz, f:st.flightErz, l:st.lootErz },
    { ic:ic('kri', '💎'), name:'Kristall',      m:st.minedKri, f:st.flightKri, l:st.lootKri },
    { ic:ic('pla', '🟣'), name:'Plasmoid',      m:st.minedPla, f:st.flightPla, l:st.lootPla },
    { ic:ic('qua', '🌀'), name:'Quantenschaum', m:st.minedQua, f:st.flightQua, l:st.lootQua },
  ];
  if (!sorten.some(s => (s.m + s.f + s.l) > 0)) return '';
  const z = (v) => v > 0 ? _f(v) : '<span class="wrs-res-0">·</span>';
  const rows = sorten.map(s => `
    <tr>
      <td>${s.ic} ${s.name}</td>
      <td>${z(s.m)}</td><td>${z(s.f)}</td><td>${z(s.l)}</td>
      <td class="wrs-res-sum">${z(s.m + s.f + s.l)}</td>
    </tr>`).join('');
  return `
    <div class="wrs-sub-title" style="margin-top:12px">${ic('erz', '🪨')} Rohstoffe nach Herkunft</div>
    <div class="wrs-tablewrap"><table class="wrs-res-table">
      <thead><tr><th>Sorte</th><th>🏙️ Kolonien &amp; Routen</th><th>⛏️ Abbau-Flüge</th>
        <th>🏴 Kampfbeute</th><th>Σ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="wrs-note">Kolonie-Ertrag, Dauerernte und Wrack-Bergung kommen alle über dasselbe
      Einsammeln herein und lassen sich ohne Server-Änderung nicht weiter trennen.
      <strong>Abbau-Flüge</strong> sind einzelne Reisen mit dem Auftrag „abbauen" — sie zählten
      früher fälschlich als Beute und werden ab jetzt getrennt geführt.</div>`;
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

// ── 🔍 Detail-Auflistungen je Spieler ─────────────────────────────────────
// Alles aus vorhandenen Daten: Flotte aus members.space, Geschütze aus
// base.turrets + space_planets.turrets, Forschung aus space.tech, Ausbauten aus
// base/yard/power und den Kolonie-Zeilen. Nichts davon wird hier berechnet —
// nur ausgezählt und gruppiert.
let _wrsDetail = null;   // gewählter Spieler (null = ich)

function wrsDetailUser() {
  const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
  if (_wrsDetail) {
    const u = wrAllUsers().find(x => x.id === _wrsDetail);
    if (u) return u;
  }
  return me || wrAllUsers()[0] || null;
}

function wrsFleetRows(u) {
  const rows = [];
  try {
    const ships = wrShipsOf(u);
    const away  = (typeof wrAwayShipsAll === 'function') ? wrAwayShipsAll(u) : {};
    const lost  = wrStatsOf(u).lostByType || {};
    const defs  = (typeof SPACE_SHIPS !== 'undefined') ? SPACE_SHIPS : [];
    for (const s of defs) {
      const h = parseInt(ships[s.key], 10) || 0;
      const a = parseInt(away[s.key], 10) || 0;
      const l = parseInt(lost[s.key], 10) || 0;
      if (h + a + l < 1) continue;
      rows.push({ key: s.key, name: s.name, icon: s.icon, atk: s.atk || 0, home: h, away: a, lost: l });
    }
    // Verluste eines Typs, den es in SPACE_SHIPS nicht (mehr) gibt, gehen sonst
    // still verloren — lieber unter dem Schlüssel anzeigen als verschweigen.
    for (const [k, v] of Object.entries(lost)) {
      if (rows.some(r => r.key === k)) continue;
      const n = parseInt(v, 10) || 0;
      if (n > 0) rows.push({ key: k, name: k, icon: '❔', atk: 0, home: 0, away: 0, lost: n });
    }
  } catch (e) { /* leere Liste ist besser als keine Karte */ }
  return rows;
}

function wrsTurrets(u) {
  const hafen = {}, kolo = {};
  const add = (m, type, lv, atk) => {
    const e = m[type] || (m[type] = { n: 0, atk: 0, lv: {} });
    e.n++; e.atk += atk; e.lv[lv] = (e.lv[lv] || 0) + 1;
  };
  const lvOf = (s) => Math.max(1, Math.min(3, parseInt(s?.level, 10) || 1));
  try {
    for (const s of Object.values(u?.space?.base?.turrets || {})) {
      if (!s || typeof s !== 'object' || !s.type) continue;
      const lv = lvOf(s);
      add(hafen, s.type, lv, (typeof wrTurretStats === 'function' ? (wrTurretStats(s.type, lv)?.atk || 0) : 0));
    }
    for (const p of wrPlanets()) {
      if (!p || p.colonized_by !== u.id) continue;
      for (const s of Object.values(p.turrets || {})) {
        if (!s || typeof s !== 'object' || !s.type) continue;
        const lv = lvOf(s);
        add(kolo, s.type, lv, (typeof wrPturretStats === 'function' ? (wrPturretStats(s.type, lv)?.atk || 0) : 0));
      }
    }
  } catch (e) {}
  return { hafen, kolo };
}

function wrsTechRows(u) {
  const out = [];
  try {
    if (typeof SPACE_TECH_ASTE === 'undefined' || typeof SPACE_TECH === 'undefined') return out;
    const own = u?.space?.tech || {};
    for (const a of SPACE_TECH_ASTE) {
      const list = SPACE_TECH.filter(t => t.ast === a.key);
      const hat  = list.filter(t => own[t.key]);
      out.push({ ast: a, total: list.length, owned: hat.length, names: hat.map(t => t.name) });
    }
  } catch (e) {}
  return out;
}

function wrsAusbau(u) {
  const sp = u?.space || {};
  const o = {
    port: Math.max(1, parseInt(sp.base?.level, 10) || 1),
    yard: Math.max(1, parseInt(sp.yard?.level, 10) || 1),
    gen: null, genLv: 0,
    kol: { 1: 0, 2: 0, 3: 0 }, stations: 0, colGen: 0, colTurrets: 0, routes: 0,
  };
  try {
    const g = sp.base?.power;
    if (g && g.type) {
      const def = (typeof SPACE_POWER_BY_KEY !== 'undefined') ? SPACE_POWER_BY_KEY[g.type] : null;
      o.gen = def ? (def.icon + ' ' + def.name) : g.type;
      o.genDef = def || null;        // für das Render-Bild in der Ausbau-Kachel
      o.genLv = Math.max(1, Math.min(3, parseInt(g.level, 10) || 1));
    }
    for (const p of wrPlanets()) {
      if (!p || p.colonized_by !== u.id) continue;
      const lv = (typeof wrColonyLevel === 'function') ? wrColonyLevel(p) : 1;
      o.kol[lv] = (o.kol[lv] || 0) + 1;
      if (p.station) o.stations++;
      if (p.power && p.power.type) o.colGen++;
      o.colTurrets += Object.values(p.turrets || {}).filter(s => s && s.type).length;
    }
    o.routes = Object.keys(sp.routes || {}).length;
  } catch (e) {}
  return o;
}

// Die Diagramm-Daten werden beim HTML-Bau eingesammelt und nach dem Einhängen
// gezeichnet — ein <canvas> lässt sich erst bemalen, wenn es im DOM steht.
let _wrsCharts = [], _wrsChartData = null;

function wrsShipIcon(key, fallback) {
  return (typeof wrShipArt === 'function') ? wrShipArt(key, 'wr-mini') : (fallback || '🚀');
}

// ── 🖼️ Echte Assets statt Emoji ────────────────────────────────────────────
// ⚠️ Die Ordner sind NICHT einheitlich: Geschütz-Renders liegen seit JPs Umstellung
// vom 29.07. in `assets/weltraum/` (die Forschungsbilder — die alte space/turret_*-
// Charge sah bei allen vier gleich aus), Schiffe/Basen/Äste in `assets/space/`.
// Deshalb wird der Ordner immer aus der Definition gelesen (wrTurretFolder bzw.
// `folder` beim Generator) und nie fest verdrahtet.
function wrsTurretIcon(key) {
  const t = (typeof SPACE_TURRET_BY_KEY !== 'undefined') ? SPACE_TURRET_BY_KEY[key] : null;
  const emoji = t?.icon || '🛡️';
  if (t && typeof wrTurretImg === 'function') {
    return wrTurretImg(t) + `<span class="wrs-line-fb">${emoji}</span>`;
  }
  return emoji;
}
function wrsAstIcon(a) {
  if (!a) return '🔬';
  if (!a.art) return a.icon || '🔬';
  return `<img src="assets/space/${a.art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
    ><span class="wrs-line-fb">${a.icon || '🔬'}</span>`;
}
// Kleines Inline-Bild für die Ausbau-Kacheln (Hafen, Werft, Kraftwerk).
function wrsMiniArt(folder, art, emoji) {
  if (!art) return emoji || '';
  return `<span class="wrs-art"><img src="assets/${folder || 'space'}/${art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
    ><span class="wrs-art-fb">${emoji || ''}</span></span>`;
}

function wrsDetailHtml() {
  const u = wrsDetailUser();
  if (!u) return '';
  const me = (typeof currentUserData !== 'undefined' && currentUserData?.id) || null;
  const users = wrsRows().map(r => r.u);
  const who = users.map(x =>
    `<button class="wrs-whobtn${x.id === u.id ? ' active' : ''}" data-wrs-detail="${_e(x.id)}"
      >${_e(x.name)}${x.id === me ? ' (du)' : ''}</button>`).join('');

  // ── Flotte + Verluste ──
  const fl = wrsFleetRows(u);
  const flHtml = fl.length ? fl.map(r => `
    <div class="wrs-line">
      <span class="wrs-line-ic">${wrsShipIcon(r.key, r.icon)}</span>
      <span>${_e(r.name)}${r.atk ? ` <span class="wr-sub">⚔️ ${r.atk}</span>` : ''}</span>
      <span class="wrs-line-n">${_f(r.home)}${r.away ? ` <span class="wr-sub">+${_f(r.away)} unterwegs</span>` : ''}${
        r.lost ? ` <span class="wrs-line-lost">−${_f(r.lost)}</span>` : ''}</span>
    </div>`).join('') : '<div class="wrs-empty">Noch kein Schiff gebaut.</div>';

  // ── Geschütze ──
  const tu = wrsTurrets(u);
  const tKeys = [...new Set([...Object.keys(tu.hafen), ...Object.keys(tu.kolo)])];
  const tDefs = (typeof SPACE_TURRETS !== 'undefined') ? SPACE_TURRETS : [];
  tKeys.sort((a, b) => (tDefs.findIndex(x => x.key === a)) - (tDefs.findIndex(x => x.key === b)));
  const tName = (k) => (tDefs.find(x => x.key === k) || {}).name || k;
  const tIcon = (k) => (tDefs.find(x => x.key === k) || {}).icon || '🛡️';
  const lvTxt = (e) => Object.keys(e.lv).sort().map(l => `${e.lv[l]}× St.${l}`).join(' · ');
  const tuHtml = tKeys.length ? tKeys.map(k => {
    const h = tu.hafen[k], c = tu.kolo[k];
    return `
      <div class="wrs-line">
        <span class="wrs-line-ic">${wrsTurretIcon(k)}</span>
        <span>${_e(tName(k))}
          <span class="wr-sub">${[h ? 'Hafen: ' + lvTxt(h) : '', c ? 'Kolonien: ' + lvTxt(c) : ''].filter(Boolean).join(' · ')}</span></span>
        <span class="wrs-line-n">${_f((h?.n || 0) + (c?.n || 0))} <span class="wr-sub">🛡️ ${_f((h?.atk || 0) + (c?.atk || 0))}</span></span>
      </div>`;
  }).join('') : '<div class="wrs-empty">Noch kein Geschütz gebaut.</div>';

  // ── Forschung ──
  const te = wrsTechRows(u);
  const teHtml = te.length ? te.map(t => `
    <div class="wrs-line">
      <span class="wrs-line-ic">${wrsAstIcon(t.ast)}</span>
      <span>${_e(t.ast.name)}
        ${t.names.length ? `<span class="wrs-chips">${t.names.map(n => `<span class="wrs-chip">${_e(n)}</span>`).join('')}</span>` : '<span class="wr-sub">noch nichts erforscht</span>'}</span>
      <span class="wrs-line-n">${t.owned}<span class="wr-sub">/${t.total}</span></span>
    </div>`).join('') : '';

  // ── Ausbauten ──
  const a = wrsAusbau(u);
  const kpi = (l, v) => `<div class="wrs-kpi"><span class="wrs-kpi-l">${l}</span><span class="wrs-kpi-v">${v}</span></div>`;
  const auHtml = `<div class="wrs-grid">
      ${kpi('🛰️ Raumhafen', wrsMiniArt('space', 'base_' + a.port, '🛰️') + 'Stufe ' + a.port)}
      ${kpi('🏗️ Werft', wrsMiniArt('space', 'base_werft_' + a.yard, '🏗️') + 'Stufe ' + a.yard)}
      ${kpi('⚡ Kraftwerk', a.genDef
        ? wrsMiniArt(a.genDef.folder, a.genDef.art, a.genDef.icon)
          + `${_e(a.genDef.name)}<br><span class="wr-sub">Stufe ${a.genLv}</span>`
        : (a.gen ? _e(a.gen) : '—'))}
      ${kpi('🪐 Kolonien', `${a.kol[1] + a.kol[2] + a.kol[3]}<br><span class="wr-sub">${a.kol[3]}× St.3 · ${a.kol[2]}× St.2 · ${a.kol[1]}× St.1</span>`)}
      ${kpi('📡 Stationen', a.stations || '—')}
      ${kpi('🛡️ Kolonie-Geschütze', a.colTurrets || '—')}
      ${kpi('⚡ Kolonie-Kraftwerke', a.colGen || '—')}
      ${kpi('🛰️ Routen', a.routes || '—')}
    </div>`;

  // Daten für die Diagramme merken (gezeichnet wird nach dem Einhängen)
  _wrsChartData = {
    fleet: fl.filter(r => r.home + r.away + r.lost > 0).slice(0, 14),
    turret: tKeys.map(k => ({ name: tName(k), h: tu.hafen[k]?.n || 0, c: tu.kolo[k]?.n || 0 })),
    tech: te,
  };

  return `
    <div class="wr-card">
      <div class="wr-card-title">🔍 Detailansicht
        <span class="wr-sub">— ${_e(u.name)}</span></div>
      ${users.length > 1 ? `<div class="wrs-who">${who}</div>` : ''}

      <div class="wrs-sub-title">🚀 Flotte &amp; Verluste</div>
      ${flHtml}
      ${_wrsChartData.fleet.length ? '<div class="wrs-chartwrap"><canvas id="wrs-c-fleet"></canvas></div>' : ''}

      <div class="wrs-sub-title">🛡️ Geschütze</div>
      ${tuHtml}
      ${_wrsChartData.turret.length ? '<div class="wrs-chartwrap"><canvas id="wrs-c-turret"></canvas></div>' : ''}

      <div class="wrs-sub-title">🔬 Forschung</div>
      ${teHtml || '<div class="wrs-empty">Keine Forschungsdaten.</div>'}
      ${te.length ? '<div class="wrs-chartwrap"><canvas id="wrs-c-tech"></canvas></div>' : ''}

      <div class="wrs-sub-title">🏗️ Ausbauten</div>
      ${auHtml}

      <div class="wrs-note">Die roten Zahlen in der Flotte sind <strong>Verluste nach Typ</strong> —
        sie zählen ab Einbau der Statistik und schrumpfen nie, auch wenn du neu baust.
        <em>Unterwegs</em> sind Schiffe, die gerade in einem Verband fliegen.</div>
    </div>`;
}

// ── 📊 Säulendiagramme (Chart.js) ─────────────────────────────────────────
// Chart.js liegt bereits per CDN in der index.html. ⚠️ Eigene Instanzen mit
// eigenem Aufräumen: die Auswertungsseite hält ihre Diagramme in `charts.main`
// und zerstört sie selbst — würden wir uns dort einhängen, zerstörte jede Seite
// die Diagramme der anderen. Vor jedem Neuzeichnen destroy(), sonst bleiben beim
// Tab-Wechsel Canvas-Leichen samt Event-Listenern zurück.
const WRS_CHART_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#c3cfee', boxWidth: 11, font: { size: 10 } } } },
  scales: {
    x: { ticks: { color: '#8b9ac4', font: { size: 9 }, maxRotation: 60, minRotation: 0 },
         grid: { color: '#1a2344' } },
    y: { beginAtZero: true, ticks: { color: '#8b9ac4', font: { size: 9 }, precision: 0 },
         grid: { color: '#1a2344' } },
  },
};

function wrsDestroyCharts() {
  for (const c of _wrsCharts) { try { c.destroy(); } catch (e) {} }
  _wrsCharts = [];
}

function wrsChart(id, labels, datasets, extra) {
  try {
    const cv = document.getElementById(id);
    if (!cv || typeof Chart === 'undefined') return;
    const opts = Object.assign({}, WRS_CHART_OPTS, extra || {});
    _wrsCharts.push(new Chart(cv.getContext('2d'), { type: 'bar', data: { labels, datasets }, options: opts }));
  } catch (e) { console.warn('[wr-stats] Diagramm ' + id + ':', e.message); }
}

function wrsBuildCharts() {
  wrsDestroyCharts();
  const d = _wrsChartData;
  if (!d) return;
  try {
    if (d.fleet?.length) {
      const ds = [
        { label: 'Im Hafen',  data: d.fleet.map(r => r.home), backgroundColor: '#4d7fd4' },
        { label: 'Unterwegs', data: d.fleet.map(r => r.away), backgroundColor: '#7ad48a' },
        { label: 'Verloren',  data: d.fleet.map(r => r.lost), backgroundColor: '#e08a8a' },
      ].filter(x => x.data.some(v => v > 0));
      wrsChart('wrs-c-fleet', d.fleet.map(r => r.name), ds);
    }
    if (d.turret?.length) {
      const ds = [
        { label: 'Raumhafen', data: d.turret.map(r => r.h), backgroundColor: '#ffc94a' },
        { label: 'Kolonien',  data: d.turret.map(r => r.c), backgroundColor: '#a24bd8' },
      ].filter(x => x.data.some(v => v > 0));
      wrsChart('wrs-c-turret', d.turret.map(r => r.name), ds);
    }
    if (d.tech?.length) {
      // Gestapelt: erforscht gegen offen — so ist auf einen Blick zu sehen,
      // welcher Ast noch Luft hat, ohne die Zahlen zu vergleichen.
      wrsChart('wrs-c-tech', d.tech.map(t => t.ast.name), [
        { label: 'Erforscht', data: d.tech.map(t => t.owned), backgroundColor: '#7ad48a' },
        { label: 'Offen',     data: d.tech.map(t => t.total - t.owned), backgroundColor: '#2a3660' },
      ], { scales: Object.assign({}, WRS_CHART_OPTS.scales, {
        x: Object.assign({ stacked: true }, WRS_CHART_OPTS.scales.x),
        y: Object.assign({ stacked: true }, WRS_CHART_OPTS.scales.y) }) });
    }
  } catch (e) { console.warn('[wr-stats] Diagramme:', e.message); }
}

function wrsPanelHtml() {
  try {
    const rows = wrsRows();
    return wrsRanglisteHtml(rows) + wrsRegionenHtml() + wrsSteckbriefHtml()
         + wrsDetailHtml() + wrsClanHtml();
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
      if (typeof _wrTab === 'undefined' || _wrTab !== 'stats') { wrsDestroyCharts(); return; }
      const wrap = document.querySelector('#imp-content .wr-wrap') ||
                   document.querySelector('.wr-wrap');
      if (!wrap) return;
      const box = document.createElement('div');
      box.id = 'wr-stats-panel';
      box.innerHTML = wrsPanelHtml();
      wrap.appendChild(box);
      box.addEventListener('click', (e) => {
        const s = e.target.closest('[data-wrs-sort]');
        if (s) { _wrsSort = s.dataset.wrsSort; window.wrRender(); return; }
        const d = e.target.closest('[data-wrs-detail]');
        if (d) { _wrsDetail = d.dataset.wrsDetail; window.wrRender(); return; }
      });
      // Diagramme erst NACH dem Einhängen — ein <canvas> ausserhalb des DOM
      // hat keine Grösse, Chart.js zeichnet dann ins Leere.
      wrsBuildCharts();
    } catch (e) { console.warn('[wr-stats] Render-Patch:', e.message); }
  };
})();

// ── 🎨 Regionen auf der Sternkarte ────────────────────────────────────────
// ⚠️ NEUFASSUNG 2026-08-06 (JP: „Die Darstellung der Gebiete ist etwas schlecht zu
// differenzieren"). Die erste Fassung legte über JEDES Hexfeld einer kontrollierten
// Region einen Schleier in der SPIELERFARBE und umrandete jede Wabe einzeln. Zwei
// Fehler auf einmal:
//   1. Hält ein Spieler mehrere Regionen, haben sie alle dieselbe Farbe — dann sieht
//      man zwar „das gehört jemandem", aber nicht mehr, WO eine Region aufhört.
//   2. Sechs Einzelumrandungen je Region ergeben ein Wabengitter, keine Fläche.
// Jetzt: nur noch der AUSSENUMRISS wird gezogen, und zwar in der REGIONSFARBE —
// dadurch ist jede Region an sich selbst erkennbar. Wem sie gehört, sagt die
// Beschriftung: Punkt und Name in der Spielerfarbe. Freie Regionen bekommen einen
// dünnen gestrichelten Umriss, damit die Karte überall gegliedert ist.
//
// Kantenzuordnung (flat-top-Hex, Vertices bei 0°,60°,…): Kante i liegt zwischen
// Vertex i und i+1, ihre Mitte zeigt in Richtung 30°+60°·i. Nachgerechnet über
// wrHexCenter ergibt das die Nachbar-Reihenfolge unten — sie ist NICHT die aus
// wrScoutable (dort steht dieselbe Menge in anderer Ordnung).
const WRS_EDGE_DIR = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];

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
      const R = size * 0.92;
      const vx = (x, i) => x + R * Math.cos(Math.PI / 180 * (60 * i));
      const vy = (y, i) => y + R * Math.sin(Math.PI / 180 * (60 * i));

      ctx.save();
      ctx.translate(cx + panX, cy + panY);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      const nameOf = (id) => wrAllUsers().find(u => u.id === id)?.name || 'Unbekannt';

      for (const r of WR_REGIONS) {
        const st = wrRegionStand(r.key);
        const h = st.holder;
        const halterFarbe = h && typeof wrMemberColor === 'function' ? wrMemberColor(h.id) : null;
        let sx = 0, sy = 0, n = 0;

        // ① Sehr leichte Tönung nur bei Besitz — sie soll die Planeten nicht überdecken.
        if (h) {
          ctx.globalAlpha = 0.07;
          ctx.fillStyle = halterFarbe || r.color;
          for (const key of r.q) {
            const [qx, qy] = key.split(',').map(Number);
            const c = wrHexCenter(qx, qy, size);
            const x = cx + c.x, y = cy + c.y;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) { const px = vx(x, i), py = vy(y, i); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
            ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // ② Aussenumriss: nur Kanten zeichnen, deren Nachbar NICHT zur Region gehört.
        ctx.beginPath();
        for (const key of r.q) {
          const [qx, qy] = key.split(',').map(Number);
          const c = wrHexCenter(qx, qy, size);
          const x = cx + c.x, y = cy + c.y;
          sx += x; sy += y; n++;
          for (let i = 0; i < 6; i++) {
            const nk = (qx + WRS_EDGE_DIR[i][0]) + ',' + (qy + WRS_EDGE_DIR[i][1]);
            if (WR_REGION_OF[nk] === r.key) continue;      // Innenkante → weglassen
            ctx.moveTo(vx(x, i), vy(y, i));
            ctx.lineTo(vx(x, (i + 1) % 6), vy(y, (i + 1) % 6));
          }
        }
        ctx.strokeStyle = r.color;
        if (h) {
          ctx.setLineDash([]); ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
          ctx.shadowColor = r.color; ctx.shadowBlur = 6;
        } else {
          ctx.setLineDash([5, 5]); ctx.lineWidth = 1.1; ctx.globalAlpha = 0.4;
        }
        ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.globalAlpha = 1;

        // ③ Beschriftung mit dunkler Unterlegung — ohne die ist der Text über den
        // Planeten unlesbar (das war in JPs Screenshot das eigentliche Problem).
        if (n) {
          const mx = sx / n, my = sy / n - size * 0.55;
          const txt = r.icon + ' ' + r.name;
          const sub = h ? nameOf(h.id) : null;
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const w = Math.max(ctx.measureText(txt).width,
                             sub ? ctx.measureText(sub).width : 0) + 14;
          const hgt = sub ? 30 : 18;
          ctx.globalAlpha = 0.72; ctx.fillStyle = '#080b18';
          if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(mx - w / 2, my - hgt / 2, w, hgt, 6); ctx.fill();
          } else {
            ctx.fillRect(mx - w / 2, my - hgt / 2, w, hgt);   // ältere Browser
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = r.color;
          ctx.fillText(txt, mx, sub ? my - 6 : my);
          if (sub) {
            ctx.font = '10px system-ui';
            ctx.fillStyle = halterFarbe || '#8b9ac4';
            ctx.fillText(sub, mx, my + 8);
          }
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
