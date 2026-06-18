// ═══════════════════════════════════════════════════════════════════════════
// world.js — Weltkarte: Globaler Kaffee-Imperialismus (Phase 1 MVP)
// Muss VOR imperium.js geladen werden. Braucht Leaflet (window.L).
// Einfluss ist verdränglich (kein Refund): wer kumulativ am meisten in ein Land
// investiert, hält Rang 1 (Regierung) und kassiert den vollen Länderbonus.
// ═══════════════════════════════════════════════════════════════════════════

// slots: rank 1 = Regierung, 2 = Baurecht I, 3 = Baurecht II. perCup = /Tasse, perDay = /Tag.
const WORLD_COUNTRIES = [
  { id:'brazil',     iso:'BR', flag:'🇧🇷', name:'Brasilien',     specialty:'Arabica-Plantagen',          slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'argentina',  iso:'AR', flag:'🇦🇷', name:'Argentinien',   specialty:'Cortado-Kultur',             slots:[{rank:1,label:'Regierung',perCup:0,perDay:4},{rank:2,label:'Baurecht I',perCup:0.1,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'mexico',     iso:'MX', flag:'🇲🇽', name:'Mexiko',        specialty:'Chiapas-Hochland',           slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'usa',        iso:'US', flag:'🇺🇸', name:'USA',           specialty:'Specialty Coffee',           slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:4},{rank:3,label:'Baurecht II',perCup:0.3,perDay:0}] },
  { id:'canada',     iso:'CA', flag:'🇨🇦', name:'Kanada',        specialty:'Nordhandel',                 slots:[{rank:1,label:'Regierung',perCup:0,perDay:3},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.1,perDay:0}] },
  { id:'germany',    iso:'DE', flag:'🇩🇪', name:'Deutschland',   specialty:'Präzisions-Röstung',         slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:3}] },
  { id:'france',     iso:'FR', flag:'🇫🇷', name:'Frankreich',    specialty:'Café-Terrasse',              slots:[{rank:1,label:'Regierung',perCup:0,perDay:5},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'italy',      iso:'IT', flag:'🇮🇹', name:'Italien',       specialty:'Espresso-Heimat',            slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'uk',         iso:'GB', flag:'🇬🇧', name:'UK',            specialty:'Specialty-Bewegung',         slots:[{rank:1,label:'Regierung',perCup:0,perDay:4},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'japan',      iso:'JP', flag:'🇯🇵', name:'Japan',         specialty:'Pour-Over-Präzision',        slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.3,perDay:0}] },
  { id:'china',      iso:'CN', flag:'🇨🇳', name:'China',         specialty:'Yunnan-Plantagen',           slots:[{rank:1,label:'Regierung',perCup:0,perDay:6},{rank:2,label:'Baurecht I',perCup:0,perDay:4},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'southkorea', iso:'KR', flag:'🇰🇷', name:'Südkorea',      specialty:'Café-Innovation',            slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'india',      iso:'IN', flag:'🇮🇳', name:'Indien',        specialty:'Monsoon Malabar',            slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'indonesia',  iso:'ID', flag:'🇮🇩', name:'Indonesien',    specialty:'Kopi Luwak',                 slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.4,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'saudi',      iso:'SA', flag:'🇸🇦', name:'Saudi-Arabien', specialty:'Qahwa-Handelsnetz',          slots:[{rank:1,label:'Regierung',perCup:0,perDay:5},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'turkey',     iso:'TR', flag:'🇹🇷', name:'Türkei',        specialty:'Türkischer Mokka',           slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'southafrica',iso:'ZA', flag:'🇿🇦', name:'Südafrika',     specialty:'Cape-Specialty',             slots:[{rank:1,label:'Regierung',perCup:0,perDay:4},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'australia',  iso:'AU', flag:'🇦🇺', name:'Australien',    specialty:'Flat White',                 slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'russia',     iso:'RU', flag:'🇷🇺', name:'Russland',      specialty:'Import-Monopol',             slots:[{rank:1,label:'Regierung',perCup:0,perDay:5},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
];

const WORLD_MIN_INVEST = 25;

function _worldById(id)   { return WORLD_COUNTRIES.find(c => c.id === id) || null; }
function _worldByIso(iso) { return WORLD_COUNTRIES.find(c => c.iso === iso) || null; }
function _worldSlot(country, rank) { return country?.slots.find(s => s.rank === rank) || null; }

// Boni aus eigener Rang-Position. rankMap = { countryId: rank }
function calcWorldPerCup(rankMap) {
  let b = 0;
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const slot = _worldSlot(_worldById(cid), rank);
    if (slot) b += slot.perCup || 0;
  }
  return Math.round(b * 100) / 100;
}
function calcWorldPerDay(rankMap) {
  let b = 0;
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const slot = _worldSlot(_worldById(cid), rank);
    if (slot) b += slot.perDay || 0;
  }
  return Math.round(b * 100) / 100;
}

// Freischaltung über das Forschungs-Item „Welthandels-Lizenz" (200 CC, alle T1 nötig)
function canAccessWorldMap(member) {
  return !!(member && member.research && member.research['welthandelslizenz']);
}

// Detail-Strings für „Heute erhalten" (analog Forschung/Gebäude)
function worldPerDayDetail(rankMap) {
  const parts = [];
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const c = _worldById(cid); const slot = _worldSlot(c, rank);
    if (c && slot && (slot.perDay || 0) > 0) parts.push(`${c.flag} ${c.name} +${slot.perDay}/Tag`);
  }
  return parts.join(', ');
}
function worldPerCupDetail(rankMap) {
  const parts = [];
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const c = _worldById(cid); const slot = _worldSlot(c, rank);
    if (c && slot && (slot.perCup || 0) > 0) parts.push(`${c.flag}+${slot.perCup}`);
  }
  return parts.join(', ');
}

// ── Gebäude (Phase 2) — gehören dem Land, Wirkung rangabhängig ───────────────
const WORLD_BUILD_RANK_PCT = { 1: 1.0, 2: 0.5, 3: 0.2 };
// 4 Gebäude pro Land (Einstieg / 2× Standard / Premium). _a/_b = bisherige Standard-IDs
// (Test-Bauten bleiben gültig), _c = günstiger Einstieg, _d = Premium.
const WORLD_BUILDINGS = {
  brazil:     [{id:'brazil_c',name:'Kaffeefarm',icon:'🌱',cost:30,perCup:0.1,perDay:0},{id:'brazil_a',name:'Arabica-Plantage',icon:'🌿',cost:80,perCup:0.3,perDay:0},{id:'brazil_b',name:'Ernte-Kooperative',icon:'🧺',cost:60,perCup:0,perDay:2},{id:'brazil_d',name:'Exportplantage',icon:'🚢',cost:180,perCup:0.5,perDay:0}],
  argentina:  [{id:'argentina_c',name:'Mate-Ecke',icon:'🧉',cost:35,perCup:0,perDay:1},{id:'argentina_a',name:'Estancia-Café',icon:'🏡',cost:60,perCup:0,perDay:2},{id:'argentina_b',name:'Cortado-Bar',icon:'🥤',cost:50,perCup:0,perDay:1},{id:'argentina_d',name:'Tango-Kaffeehaus',icon:'💃',cost:160,perCup:0,perDay:5}],
  mexico:     [{id:'mexico_c',name:'Bohnen-Stand',icon:'🌽',cost:35,perCup:0.1,perDay:0},{id:'mexico_a',name:'Bergplantage',icon:'⛰️',cost:70,perCup:0.2,perDay:0},{id:'mexico_b',name:'Mischungswerk',icon:'🏭',cost:60,perCup:0,perDay:2},{id:'mexico_d',name:'Hochland-Estate',icon:'🏞️',cost:170,perCup:0.5,perDay:0}],
  usa:        [{id:'usa_c',name:'Coffee-Truck',icon:'🚚',cost:40,perCup:0,perDay:1},{id:'usa_a',name:'Cold-Brew-Fabrik',icon:'🧊',cost:90,perCup:0,perDay:4},{id:'usa_b',name:'Marketing-Agentur',icon:'📣',cost:80,perCup:0.3,perDay:0},{id:'usa_d',name:'Specialty-Imperium',icon:'🏙️',cost:185,perCup:0,perDay:6}],
  canada:     [{id:'canada_c',name:'Coffee-Ecke',icon:'☕',cost:35,perCup:0,perDay:1},{id:'canada_a',name:'Franchise-Kette',icon:'🍁',cost:70,perCup:0,perDay:3},{id:'canada_b',name:'Lager-Hub',icon:'📦',cost:50,perCup:0,perDay:2},{id:'canada_d',name:'Nordhandels-Hub',icon:'🛷',cost:160,perCup:0,perDay:5}],
  germany:    [{id:'germany_c',name:'Kaffee-Kiosk',icon:'🏪',cost:35,perCup:0,perDay:1},{id:'germany_a',name:'Hochleistungs-Rösterei',icon:'🔥',cost:100,perCup:0.4,perDay:0},{id:'germany_b',name:'Forschungslabor',icon:'🔬',cost:90,perCup:0.3,perDay:0},{id:'germany_d',name:'Präzisions-Rösterei',icon:'🏰',cost:170,perCup:0.55,perDay:0}],
  france:     [{id:'france_c',name:'Bistro-Ecke',icon:'🥐',cost:35,perCup:0,perDay:1},{id:'france_a',name:'Café-Terrasse',icon:'☕',cost:70,perCup:0,perDay:3},{id:'france_b',name:'French-Press-Werk',icon:'🫖',cost:60,perCup:0.2,perDay:0},{id:'france_d',name:'Grand-Café',icon:'🗼',cost:180,perCup:0,perDay:6}],
  italy:      [{id:'italy_c',name:'Caffè-Bar',icon:'☕',cost:35,perCup:0.1,perDay:0},{id:'italy_a',name:'Barista-Schule',icon:'🎓',cost:80,perCup:0.3,perDay:0},{id:'italy_b',name:'Espresso-Bar-Kette',icon:'🍸',cost:70,perCup:0,perDay:3},{id:'italy_d',name:'Espresso-Imperium',icon:'🏛️',cost:170,perCup:0.55,perDay:0}],
  uk:         [{id:'uk_c',name:'Coffee-Shop',icon:'🫖',cost:35,perCup:0,perDay:1},{id:'uk_a',name:'Specialty-Café-Kette',icon:'☕',cost:70,perCup:0.2,perDay:0},{id:'uk_b',name:'Import-Hafen',icon:'⚓',cost:60,perCup:0,perDay:2},{id:'uk_d',name:'London-Roastery',icon:'🎩',cost:165,perCup:0.5,perDay:0}],
  japan:      [{id:'japan_c',name:'Dosen-Automat',icon:'🥫',cost:35,perCup:0,perDay:1},{id:'japan_a',name:'Kissaten',icon:'🏮',cost:70,perCup:0,perDay:3},{id:'japan_b',name:'Pour-Over-Labor',icon:'🧪',cost:80,perCup:0.3,perDay:0},{id:'japan_d',name:'Siphon-Manufaktur',icon:'⚗️',cost:175,perCup:0.5,perDay:0}],
  china:      [{id:'china_c',name:'Teehaus-Filiale',icon:'🍵',cost:40,perCup:0,perDay:1},{id:'china_a',name:'Mega-Chain-Lizenz',icon:'🏙️',cost:120,perCup:0,perDay:5},{id:'china_b',name:'Yunnan-Plantage',icon:'🌄',cost:80,perCup:0.2,perDay:0},{id:'china_d',name:'Riesenmarkt-Konzern',icon:'🐉',cost:190,perCup:0,perDay:7}],
  southkorea: [{id:'southkorea_c',name:'Insta-Café',icon:'📸',cost:35,perCup:0,perDay:1},{id:'southkorea_a',name:'Trend-Café',icon:'✨',cost:70,perCup:0,perDay:3},{id:'southkorea_b',name:'Innovation-Lab',icon:'💡',cost:70,perCup:0.2,perDay:0},{id:'southkorea_d',name:'Dalgona-Imperium',icon:'🥚',cost:160,perCup:0,perDay:5}],
  india:      [{id:'india_c',name:'Chai-Stand',icon:'🫖',cost:30,perCup:0.1,perDay:0},{id:'india_a',name:'Monsoon-Plantage',icon:'🌧️',cost:70,perCup:0.2,perDay:0},{id:'india_b',name:'Gewürzwerk',icon:'🌶️',cost:60,perCup:0,perDay:2},{id:'india_d',name:'Malabar-Estate',icon:'🏞️',cost:165,perCup:0.5,perDay:0}],
  indonesia:  [{id:'indonesia_c',name:'Insel-Stand',icon:'🏝️',cost:35,perCup:0.1,perDay:0},{id:'indonesia_a',name:'Kopi-Luwak-Farm',icon:'🐱',cost:90,perCup:0.4,perDay:0},{id:'indonesia_b',name:'Insel-Rösterei',icon:'🔥',cost:70,perCup:0,perDay:2},{id:'indonesia_d',name:'Archipel-Konzern',icon:'🌋',cost:180,perCup:0.5,perDay:0}],
  saudi:      [{id:'saudi_c',name:'Qahwa-Zelt',icon:'⛺',cost:35,perCup:0,perDay:1},{id:'saudi_a',name:'Qahwa-Haus',icon:'🕌',cost:70,perCup:0,perDay:3},{id:'saudi_b',name:'Gewürzhandelsnetz',icon:'🐪',cost:80,perCup:0,perDay:2},{id:'saudi_d',name:'Wüsten-Handelsimperium',icon:'🏜️',cost:170,perCup:0,perDay:5}],
  turkey:     [{id:'turkey_c',name:'Cezve-Stand',icon:'🫙',cost:30,perCup:0.1,perDay:0},{id:'turkey_a',name:'Traditionskaffeehaus',icon:'☕',cost:60,perCup:0,perDay:2},{id:'turkey_b',name:'Cezve-Fabrik',icon:'🏭',cost:50,perCup:0.2,perDay:0},{id:'turkey_d',name:'Basar-Imperium',icon:'🕌',cost:160,perCup:0.5,perDay:0}],
  southafrica:[{id:'southafrica_c',name:'Township-Café',icon:'🏘️',cost:35,perCup:0,perDay:1},{id:'southafrica_a',name:'Safari-Café',icon:'🦁',cost:60,perCup:0,perDay:2},{id:'southafrica_b',name:'Cape-Rösterei',icon:'🔥',cost:70,perCup:0.2,perDay:0},{id:'southafrica_d',name:'Kap-Plantage',icon:'🏔️',cost:165,perCup:0.5,perDay:0}],
  australia:  [{id:'australia_c',name:'Flat-White-Stand',icon:'🥛',cost:35,perCup:0.1,perDay:0},{id:'australia_a',name:'Melbourne-Café-Kette',icon:'🦘',cost:80,perCup:0,perDay:3},{id:'australia_b',name:'Flat-White-Export',icon:'🚢',cost:70,perCup:0.2,perDay:0},{id:'australia_d',name:'Barista-Hauptstadt',icon:'🏙️',cost:170,perCup:0.5,perDay:0}],
  russia:     [{id:'russia_c',name:'Datscha-Kaffee',icon:'🛖',cost:35,perCup:0,perDay:1},{id:'russia_a',name:'Sibirisches Kaffeehaus',icon:'❄️',cost:70,perCup:0,perDay:3},{id:'russia_b',name:'Import-Depot',icon:'📦',cost:60,perCup:0,perDay:2},{id:'russia_d',name:'Transsib-Handelsnetz',icon:'🚂',cost:175,perCup:0,perDay:5}],
};

function worldBuildingDef(countryId, buildingId) {
  return (WORLD_BUILDINGS[countryId] || []).find(b => b.id === buildingId) || null;
}
function _levelMult(level) { return level === 2 ? 1.6 : 1; }

// byCountry: { countryId: [{building_id, level, member_id}] } — aus DB.fetchAllWorldBuildings()
function worldBuildingsByCountry(rows) {
  const m = {};
  for (const r of (rows || [])) (m[r.country_id] = m[r.country_id] || []).push(r);
  return m;
}
// Rangabhängiger Gebäude-Bonus (eigener Rang × Summe aller Land-Gebäude)
function calcWorldBuildingPerCup(rankMap, byCountry) {
  let b = 0;
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const pct = WORLD_BUILD_RANK_PCT[rank] || 0; if (!pct) continue;
    for (const blt of (byCountry?.[cid] || [])) {
      const def = worldBuildingDef(cid, blt.building_id); if (!def) continue;
      b += (def.perCup || 0) * _levelMult(blt.level) * pct;
    }
  }
  return Math.round(b * 100) / 100;
}
function calcWorldBuildingPerDay(rankMap, byCountry) {
  let b = 0;
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const pct = WORLD_BUILD_RANK_PCT[rank] || 0; if (!pct) continue;
    for (const blt of (byCountry?.[cid] || [])) {
      const def = worldBuildingDef(cid, blt.building_id); if (!def) continue;
      b += (def.perDay || 0) * _levelMult(blt.level) * pct;
    }
  }
  return Math.round(b * 100) / 100;
}
function calcGardeCost(countryId, byCountry) {
  const levels = (byCountry?.[countryId] || []).reduce((s, b) => s + (b.level || 1), 0);
  return 40 + levels * 15;
}
function worldBuildingPerDayDetail(rankMap, byCountry) {
  const parts = [];
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const pct = WORLD_BUILD_RANK_PCT[rank] || 0; if (!pct) continue;
    for (const blt of (byCountry?.[cid] || [])) {
      const def = worldBuildingDef(cid, blt.building_id); if (!def || !(def.perDay > 0)) continue;
      parts.push(`${def.icon} ${def.name}${blt.level === 2 ? ' L2' : ''} +${Math.round(def.perDay * _levelMult(blt.level) * pct * 100) / 100}/Tag`);
    }
  }
  return parts.join(', ');
}

// Einfärbung nach eigenem Rang / fremder Regierung
function getCountryColor(iso, rankMap, foreignGovtIsoSet) {
  const c = _worldByIso(iso);
  const rank = c ? (rankMap || {})[c.id] : null;
  if (rank === 1) return '#d4aa37'; // Gold: eigene Regierung
  if (rank === 2) return '#a0a0a0'; // Silber: Baurecht I
  if (rank === 3) return '#cd7f32'; // Bronze: Baurecht II
  if (foreignGovtIsoSet && foreignGovtIsoSet.has(iso)) return '#5a1a1a'; // fremde Regierung
  return '#2a2010'; // unbesetzt
}

// ── Rang-Berechnung aus rohen Investitionen (clientseitig, für Karte & Diff) ──
// investments: Array { member_id, country_id, total_invested }
function worldRanksForMember(investments, memberId) {
  const byCountry = {};
  for (const w of (investments || [])) {
    (byCountry[w.country_id] = byCountry[w.country_id] || []).push(w);
  }
  const rankMap = {};               // { countryId: eigener Rang }
  const foreignGovt = new Set();    // ISO-Codes mit fremder Regierung (Rang 1)
  for (const [cid, list] of Object.entries(byCountry)) {
    // Effektiver Einfluss = total + (Garde ? 0.15 × Top-Rohbetrag : 0) — konsistent zur DB
    const top = Math.max(0, ...list.map(w => Number(w.total_invested) || 0));
    const eff = list.map(w => ({
      member_id: w.member_id,
      e: (Number(w.total_invested) || 0) + (w.garde_purchased ? 0.15 * top : 0),
    })).sort((a, b) => b.e - a.e);
    const myIdx = eff.findIndex(w => w.member_id === memberId);
    if (myIdx >= 0 && myIdx < 3) rankMap[cid] = myIdx + 1;
    if (eff[0] && eff[0].member_id !== memberId) {
      const c = _worldById(cid); if (c) foreignGovt.add(c.iso);
    }
  }
  return { rankMap, foreignGovt };
}

// HoF-Helfer (Phase 1.5)
function worldInvestedTotal(investments, memberId) {
  let s = 0;
  for (const w of (investments || [])) if (w.member_id === memberId) s += Number(w.total_invested) || 0;
  return Math.round(s);
}
function worldGovernments(investments, memberId) {
  const { rankMap } = worldRanksForMember(investments, memberId);
  return Object.values(rankMap).filter(r => r === 1).length;
}

const _wfmt = (n) => (typeof _fmtCoins === 'function') ? _fmtCoins(n) : (Math.round(n * 100) / 100);

// ── UI: Weltkarte-Reiter ─────────────────────────────────────────────────────
let _worldMap = null;
let _worldGeoLayer = null;
let _worldBldCache = {}; // { countryId: [{building_id, level, member_id}] }

async function _buildWeltkarte(member, el) {
  if (!canAccessWorldMap(member)) {
    el.innerHTML = `<div class="cc-world-lock">
      <div class="cc-world-lock-icon">🌍🔒</div>
      <p><strong>Weltkarte gesperrt</strong></p>
      <p class="cc-world-lock-hint">Schalte zuerst die <strong>🌍 Welthandels-Lizenz</strong> frei:
      Forschung → Kombinations-Freischaltungen, <strong>200 CC</strong> — dafür müssen
      <strong>alle Tier-1-Forschungen</strong> abgeschlossen sein. Dann öffnet sich die globale Expansion.</p>
    </div>`;
    return;
  }
  if (typeof L === 'undefined') {
    el.innerHTML = `<p style="color:var(--muted);padding:16px">🌍 Karten-Bibliothek (Leaflet) nicht geladen.</p>`;
    return;
  }

  el.innerHTML = `
    <p class="cc-world-intro">🌍 Investiere CoffeeCoins in G20-Länder und sichere dir <strong>Einfluss</strong>.
      Wer kumulativ am meisten investiert, regiert das Land — CC sind permanent ausgegeben.</p>
    <div id="cc-world-map"></div>
    <div class="cc-world-legend">
      <span><i style="background:#d4aa37"></i>Regierung</span>
      <span><i style="background:#a0a0a0"></i>Baurecht I</span>
      <span><i style="background:#cd7f32"></i>Baurecht II</span>
      <span><i style="background:#5a1a1a"></i>fremd regiert</span>
      <span><i style="background:#2a2010"></i>frei</span>
    </div>
    <div id="cc-world-sheet" class="cc-world-sheet hidden"></div>`;

  // Investitionen der Gruppe laden (für Einfärbung) — robust, falls Backend noch nicht migriert
  let investments = [];
  try { investments = await DB.fetchAllWorldInvestments(); }
  catch (e) {
    document.getElementById('cc-world-map').innerHTML =
      `<p style="color:var(--muted);padding:16px">🌍 Weltkarte-Backend noch nicht aktiv. Bitte SQL-Migration in Supabase ausführen.</p>`;
    console.warn('fetchAllWorldInvestments:', e.message);
    return;
  }

  try { _worldBldCache = worldBuildingsByCountry(await DB.fetchAllWorldBuildings()); }
  catch (e) { _worldBldCache = {}; }

  const { rankMap, foreignGovt } = worldRanksForMember(investments, member.id);

  if (_worldMap) { try { _worldMap.remove(); } catch (e) {} _worldMap = null; }
  const map = L.map('cc-world-map', {
    center: [25, 10], zoom: 1, minZoom: 1, maxZoom: 5, worldCopyJump: true,
    attributionControl: false, scrollWheelZoom: true,
  });
  _worldMap = map;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 6,
  }).addTo(map);

  const geo = await fetch('assets/g20.geojson').then(r => r.json()).catch(() => null);
  if (geo) {
    _worldGeoLayer = L.geoJSON(geo, {
      style: (f) => ({
        fillColor: getCountryColor(f.properties.iso, rankMap, foreignGovt),
        weight: 1, color: 'rgba(0,0,0,0.6)', fillOpacity: 0.78,
      }),
      onEachFeature: (f, layer) => {
        const c = _worldByIso(f.properties.iso);
        if (!c) return;
        layer.on('click', () => _openCountrySheet(c, member));
      },
    }).addTo(map);
    try { map.fitBounds(_worldGeoLayer.getBounds(), { padding: [10, 10] }); } catch (e) {}
  }
  // Leaflet braucht ein invalidateSize, wenn der Container erst sichtbar wird
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 150);
}

async function _openCountrySheet(country, member) {
  const sheet = document.getElementById('cc-world-sheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  sheet.innerHTML = `<p style="color:var(--muted);padding:14px">Lade ${country.flag} ${country.name}…</p>`;

  let standings = [];
  try { standings = await DB.fetchCountryStandings(country.id); }
  catch (e) { console.warn('fetchCountryStandings:', e.message); }

  const myRow   = standings.find(s => s.member_id === member.id);
  const myRank  = myRow ? myRow.rank : null;
  const myInv   = myRow ? Number(myRow.total_invested) : 0;
  const topInv  = standings.length ? Number(standings[0].total_invested) : 0;
  const rows = country.slots.map(slot => {
    const occ = standings.find(s => s.rank === slot.rank);
    const bonus = slot.perCup > 0 ? `+${slot.perCup} CC/Tasse` : slot.perDay > 0 ? `+${slot.perDay} CC/Tag` : '—';
    const who  = occ ? `${_esc2(occ.member_name)} · ${_wfmt(occ.total_invested)} CC` : '(frei)';
    const medal = ['🥇','🥈','🥉'][slot.rank - 1];
    const mine = occ && occ.member_id === member.id ? ' cc-world-mine' : '';
    return `<div class="cc-world-slot${mine}">
      <span class="cc-world-slot-rank">${medal} ${slot.label}</span>
      <span class="cc-world-slot-who">${who}</span>
      <span class="cc-world-slot-bonus">${bonus}</span>
    </div>`;
  }).join('');

  const needForTop = myRank === 1 ? 0 : Math.max(WORLD_MIN_INVEST, Math.floor(topInv - myInv) + 1);
  const statusLine = myRank
    ? `Dein Einfluss: <strong>Rang ${myRank}</strong> · ${_wfmt(myInv)} CC investiert`
    : `Du hast hier noch keinen Einfluss.`;
  const topLine = myRank === 1
    ? `👑 Du regierst dieses Land.`
    : `Für Rang 1 nötig: <strong>${needForTop} CC</strong> mehr als der Spitzenreiter.`;

  // ── Gebäude (gehören dem Land, Wirkung rangabhängig) ──
  // Phase 3: Rang 1, 2 UND 3 dürfen bauen (Rang 2/3 zahlen 20% Steuer an Rang 1).
  const canBuild = myRank === 1 || myRank === 2 || myRank === 3;
  const pct = WORLD_BUILD_RANK_PCT[myRank] || 0;
  const blds = _worldBldCache[country.id] || [];
  const bldRows = (WORLD_BUILDINGS[country.id] || []).map(def => {
    const ex = blds.find(b => b.building_id === def.id);
    const level = ex ? ex.level : 0;
    const base = def.perCup > 0 ? `+${def.perCup}/Tasse` : `+${def.perDay}/Tag`;
    const lvlTxt = level === 0 ? 'frei' : level === 2 ? 'Lvl 2' : 'Lvl 1';
    let btn;
    if (level === 0 && canBuild)       btn = `<button class="cc-build-btn cc-world-bbtn" data-world-build="${def.id}">Bauen · ${def.cost} 🫘</button>`;
    else if (level === 1 && canBuild)  btn = `<button class="cc-build-btn cc-world-bbtn" data-world-upgrade="${def.id}">Ausbau L2 · ${Math.round(def.cost * 0.5)} 🫘</button>`;
    else if (level === 0 && !canBuild) btn = `<span class="cc-world-blocked">🔒 Top 3 nötig</span>`;
    else                               btn = `<span class="cc-world-blocked">✓ ${lvlTxt}</span>`;
    return `<div class="cc-world-bld">
      <span class="cc-world-bld-name">${def.icon} ${_esc2(def.name)} <em>${lvlTxt}</em></span>
      <span class="cc-world-bld-eff">${base}</span>
      ${btn}
    </div>`;
  }).join('');
  let pctNote;
  if (!myRank) {
    pctNote = `Investiere, um an den Land-Gebäude-Boni teilzuhaben (Bauen ab Rang 3).`;
  } else {
    pctNote = `Als Rang ${myRank} erhältst du <strong>${Math.round(pct * 100)}%</strong> der Land-Gebäude-Boni.`;
    if (myRank !== 1) pctNote += ` Beim Bauen zahlst du <strong>20 %</strong> Steuer an die Regierung.`;
  }

  // ── Garde ──
  const gardeCost = calcGardeCost(country.id, _worldBldCache);
  const hasGarde  = !!(myRow && myRow.garde);
  let gardeBlock;
  if (hasGarde)   gardeBlock = `<span class="cc-world-garde-on">☕ Garde aktiv · +15% Einfluss</span>`;
  else if (myRow) gardeBlock = `<button class="cc-build-btn cc-world-bbtn" data-world-garde="1">☕ Garde stationieren · ${gardeCost} 🫘</button>`;
  else            gardeBlock = `<span class="cc-world-blocked">Investiere zuerst für eine Garde</span>`;

  sheet.innerHTML = `
    <div class="cc-world-sheet-head">
      <span>${country.flag} <strong>${_esc2(country.name)}</strong> · ${_esc2(country.specialty)}</span>
      <button class="cc-world-close" data-world-close>✕</button>
    </div>
    <div class="cc-world-slots">${rows}</div>
    <p class="cc-world-status">${statusLine}<br>${topLine}</p>
    <div class="cc-world-invest">
      <input type="number" id="cc-world-amount" min="${WORLD_MIN_INVEST}" step="5" placeholder="CC (min. ${WORLD_MIN_INVEST})">
      <button class="cc-build-btn" data-world-invest="1">🌍 Einfluss stärken</button>
    </div>
    <div class="cc-world-section-title">🏗️ Gebäude <span>(gehören dem Land)</span></div>
    <p class="cc-world-pctnote">${pctNote}</p>
    <div class="cc-world-blds">${bldRows}</div>
    <div class="cc-world-section-title">☕ Garde</div>
    <div class="cc-world-garde">${gardeBlock}</div>`;

  sheet.querySelector('[data-world-close]').onclick = () => sheet.classList.add('hidden');
  sheet.querySelector('[data-world-invest]').onclick = () => _handleWorldInvest(country, member);
  const gb = sheet.querySelector('[data-world-garde]'); if (gb) gb.onclick = () => _handleBuyGarde(country, member);
  sheet.querySelectorAll('[data-world-build]').forEach(b => b.onclick = () => {
    const def = worldBuildingDef(country.id, b.dataset.worldBuild); if (def) _handleBuildWorld(country, member, def);
  });
  sheet.querySelectorAll('[data-world-upgrade]').forEach(b => b.onclick = () => {
    const def = worldBuildingDef(country.id, b.dataset.worldUpgrade); if (def) _handleUpgradeWorld(country, member, def);
  });
}

// Nach einer Aktion: Coins/Header aktualisieren, Karte neu einfärben, Panel erneut öffnen
async function _worldRefreshAndReopen(country, member) {
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}
  const el = document.getElementById('imp-content');
  if (el) { el.innerHTML = ''; await _buildWeltkarte(currentUserData || member, el); await _openCountrySheet(country, currentUserData || member); }
}

async function _handleBuildWorld(country, member, def) {
  let res;
  try { res = await DB.buildWorldStructure(member.id, country.id, def.id, def.cost, false); }
  catch (e) { showToast(e.message || 'Bau fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'already_built')      { showToast('Schon gebaut.', 'error'); return; }
  if (!res?.ok) { showToast('Bau fehlgeschlagen', 'error'); return; }
  const taxMsg = res.tax_paid > 0 ? ` (${res.tax_paid} CC Steuer${res.tax_receiver ? ' an ' + res.tax_receiver : ''})` : '';
  showToast(`🏗️ ${def.name} in ${country.flag} ${country.name} gebaut!${taxMsg}`, 'success');
  try { await DB.postMessage(`${member.name} baut ${def.icon} ${def.name} in ${country.flag} ${country.name}!${taxMsg} 🏗️`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleUpgradeWorld(country, member, def) {
  const cost = Math.round(def.cost * 0.5);
  let res;
  try { res = await DB.buildWorldStructure(member.id, country.id, def.id, cost, true); }
  catch (e) { showToast(e.message || 'Ausbau fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'cannot_upgrade')     { showToast('Ausbau nicht möglich.', 'error'); return; }
  if (!res?.ok) { showToast('Ausbau fehlgeschlagen', 'error'); return; }
  const taxMsg = res.tax_paid > 0 ? ` (${res.tax_paid} CC Steuer${res.tax_receiver ? ' an ' + res.tax_receiver : ''})` : '';
  showToast(`⬆️ ${def.name} auf Level 2 ausgebaut!${taxMsg}`, 'success');
  try { await DB.postMessage(`${member.name} baut ${def.icon} ${def.name} in ${country.flag} ${country.name} aus!${taxMsg} ⬆️`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleBuyGarde(country, member) {
  let res;
  try { res = await DB.buyGarde(member.id, country.id); }
  catch (e) { showToast(e.message || 'Garde fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast(`Nicht genug CC (Garde kostet ${res.cost})!`, 'error'); return; }
  if (res?.error === 'no_investment')      { showToast('Investiere zuerst in dieses Land.', 'error'); return; }
  if (res?.error === 'already_garde')      { showToast('Garde bereits stationiert.', 'error'); return; }
  if (!res?.ok) { showToast('Garde fehlgeschlagen', 'error'); return; }
  showToast(`☕ Kaffee-Garde in ${country.flag} ${country.name} stationiert!`, 'success');
  try { await DB.postMessage(`${member.name} stationiert eine ☕ Kaffee-Garde in ${country.flag} ${country.name}!`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleWorldInvest(country, member) {
  const input  = document.getElementById('cc-world-amount');
  const amount = Math.floor(parseFloat(input?.value || '0'));
  if (!amount || amount < WORLD_MIN_INVEST) { showToast(`Mindestens ${WORLD_MIN_INVEST} CC investieren!`, 'error'); return; }

  // Rang VOR der Investition (für Verdrängungs-Erkennung)
  let before = [];
  try { before = await DB.fetchCountryStandings(country.id); } catch (e) {}
  const prevTop  = before[0] || null;
  const prevMine = before.find(s => s.member_id === member.id);
  const prevRank = prevMine ? prevMine.rank : null;

  let res;
  try { res = await DB.investInCountry(member.id, country.id, amount); }
  catch (e) { showToast(e.message || 'Investition fehlgeschlagen', 'error'); return; }
  if (res?.error === 'min_25')             { showToast(`Mindestens ${WORLD_MIN_INVEST} CC!`, 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (!res?.ok)                            { showToast('Investition fehlgeschlagen', 'error'); return; }

  showToast(`🌍 ${amount} CC in ${country.flag} ${country.name} investiert!`, 'success');

  // lokalen Coin-Stand & Header aktualisieren
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}

  // Rang NACH der Investition + Chat
  let after = [];
  try { after = await DB.fetchCountryStandings(country.id); } catch (e) {}
  const newMine = after.find(s => s.member_id === member.id);
  const newRank = newMine ? newMine.rank : null;
  try {
    await DB.postMessage(`${member.name} stärkt seinen Einfluss in ${country.flag} ${country.name} um ${amount} CC! 💰`, member.name);
    if (newRank === 1 && prevRank !== 1) {
      if (prevTop && prevTop.member_id !== member.id) {
        await DB.postMessage(`${member.name} verdrängt ${prevTop.member_name} aus der Regierung von ${country.flag} ${country.name}! ⚔️`, member.name);
      } else {
        await DB.postMessage(`${member.name} übernimmt die Regierung von ${country.flag} ${country.name}! 🏛️`, member.name);
      }
    } else if ((newRank === 2 || newRank === 3) && prevRank !== newRank) {
      await DB.postMessage(`${member.name} sichert sich Baurecht in ${country.flag} ${country.name}! 🏗️`, member.name);
    }
  } catch (e) { console.warn('Chat-Post (Welt) fehlgeschlagen:', e); }

  await _worldRefreshAndReopen(country, member);
}
