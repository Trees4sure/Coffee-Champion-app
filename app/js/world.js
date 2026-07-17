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
  // ── Neue Konsumländer (2026-07-14, PLAN_rohstofflaender §2b) — Rohwerte wie Bestand, Multiplikator wird unten aufgebacken ──
  { id:'norway',     iso:'NO', flag:'🇳🇴', name:'Norwegen',      specialty:'Fjord-Filterkaffee',         slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'sweden',     iso:'SE', flag:'🇸🇪', name:'Schweden',      specialty:'Fika-Kultur',                slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:4},{rank:3,label:'Baurecht II',perCup:0.3,perDay:0}] },
  { id:'finland',    iso:'FI', flag:'🇫🇮', name:'Finnland',      specialty:'Weltrekord-Pro-Kopf',        slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'denmark',    iso:'DK', flag:'🇩🇰', name:'Dänemark',      specialty:'Hygge-Kaffee',               slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'iceland',    iso:'IS', flag:'🇮🇸', name:'Island',        specialty:'Insel-Röster',               slots:[{rank:1,label:'Regierung',perCup:0.35,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.15,perDay:0}] },
  { id:'poland',     iso:'PL', flag:'🇵🇱', name:'Polen',         specialty:'Kawa-Kultur',                slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'ukraine',    iso:'UA', flag:'🇺🇦', name:'Ukraine',       specialty:'Lviv-Kaffeehäuser',          slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  // ── Konsumländer 2. Welle (2026-07-14) — Rohwerte wie Bestand, Multiplikator wird aufgebacken ──
  { id:'spain',       iso:'ES', flag:'🇪🇸', name:'Spanien',       specialty:'Café con Leche',             slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'portugal',    iso:'PT', flag:'🇵🇹', name:'Portugal',      specialty:'Bica & Pastéis',             slots:[{rank:1,label:'Regierung',perCup:0.4,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'ireland',     iso:'IE', flag:'🇮🇪', name:'Irland',        specialty:'Irish Coffee',               slots:[{rank:1,label:'Regierung',perCup:0,perDay:4},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'switzerland', iso:'CH', flag:'🇨🇭', name:'Schweiz',       specialty:'Präzisions-Aromatik',        slots:[{rank:1,label:'Regierung',perCup:0.5,perDay:0},{rank:2,label:'Baurecht I',perCup:0.3,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'austria',     iso:'AT', flag:'🇦🇹', name:'Österreich',    specialty:'Wiener Kaffeehaus',          slots:[{rank:1,label:'Regierung',perCup:0.45,perDay:0},{rank:2,label:'Baurecht I',perCup:0.25,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'hungary',     iso:'HU', flag:'🇭🇺', name:'Ungarn',        specialty:'Kávéház-Kultur',             slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'morocco',     iso:'MA', flag:'🇲🇦', name:'Marokko',       specialty:'Nus-Nus',                    slots:[{rank:1,label:'Regierung',perCup:0,perDay:3},{rank:2,label:'Baurecht I',perCup:0.2,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:2}] },
  { id:'egypt',       iso:'EG', flag:'🇪🇬', name:'Ägypten',       specialty:'Ahwa-Kultur',                slots:[{rank:1,label:'Regierung',perCup:0,perDay:4},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'libya',       iso:'LY', flag:'🇱🇾', name:'Libyen',        specialty:'Gahwa-Handel',               slots:[{rank:1,label:'Regierung',perCup:0,perDay:3},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.1,perDay:0}] },
  { id:'afghanistan', iso:'AF', flag:'🇦🇫', name:'Afghanistan',   specialty:'Qymaq-Chai',                 slots:[{rank:1,label:'Regierung',perCup:0,perDay:3},{rank:2,label:'Baurecht I',perCup:0.1,perDay:0},{rank:3,label:'Baurecht II',perCup:0,perDay:1}] },
  { id:'pakistan',    iso:'PK', flag:'🇵🇰', name:'Pakistan',      specialty:'Basar-Kaffee',               slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:2},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'newzealand',  iso:'NZ', flag:'🇳🇿', name:'Neuseeland',    specialty:'Flat-White-Heimat',          slots:[{rank:1,label:'Regierung',perCup:0.45,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
  { id:'chile',       iso:'CL', flag:'🇨🇱', name:'Chile',         specialty:'Café Cortado',               slots:[{rank:1,label:'Regierung',perCup:0.3,perDay:0},{rank:2,label:'Baurecht I',perCup:0,perDay:3},{rank:3,label:'Baurecht II',perCup:0.2,perDay:0}] },
];

const WORLD_MIN_INVEST = 25;

// ── Balancing 2026-06-20: Welt-Rang-Erträge spürbar anheben ─────────────────────
// Die Rang-Slot-Erträge waren zu niedrig (≈0,4/Tasse), um die Weltkarte attraktiv zu
// machen. Multiplikator wird EINMALIG beim Laden in die Tabelle gebacken, damit jede
// Lesestelle (Panel-Anzeige, „Heute erhalten"-Detail UND der Verdienst-Calc) denselben
// Wert sieht — kein Auseinanderlaufen von angezeigtem und tatsächlichem Ertrag.
const WORLD_SLOT_CUP_MULT = 3.5;   // 0,4 → 1,4 /Tasse
const WORLD_SLOT_DAY_MULT = 2.5;   // Tageserträge moderater angehoben
for (const _c of WORLD_COUNTRIES) for (const _s of _c.slots) {
  _s.perCup = Math.round((_s.perCup || 0) * WORLD_SLOT_CUP_MULT * 100) / 100;
  _s.perDay = Math.round((_s.perDay || 0) * WORLD_SLOT_DAY_MULT * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🫘 ROHSTOFF-/ANBAULÄNDER (2026-07-14, PLAN_rohstofflaender)
// Tropischer Kaffeegürtel: produziert Rohkaffee-Bohnen (Standard/Öko) statt CC.
// Verdränglich wie Konsumländer (worldRanksForMember/WORLD_BUILD_RANK_PCT geerbt),
// aber Ertrag = Bohnen; Investieren = Bau-Stränge L1–L5 hochziehen.
// signatur: outMult (±20 % Menge), oekoBase (Basis-Öko-Anteil 0..~0.12).
// ═══════════════════════════════════════════════════════════════════════════
const PRODUCER_COUNTRIES = [
  // Südamerika
  { id:'colombia',   iso:'CO', flag:'🇨🇴', name:'Kolumbien',      region:'Südamerika',  specialty:'Arabica-Hochland',      outMult:0.90, oekoBase:0.10 },
  { id:'peru',       iso:'PE', flag:'🇵🇪', name:'Peru',           region:'Südamerika',  specialty:'Bio-Hochland',          outMult:0.95, oekoBase:0.12 },
  { id:'ecuador',    iso:'EC', flag:'🇪🇨', name:'Ecuador',        region:'Südamerika',  specialty:'Galápagos-Arabica',     outMult:0.90, oekoBase:0.10 },
  { id:'venezuela',  iso:'VE', flag:'🇻🇪', name:'Venezuela',      region:'Südamerika',  specialty:'Maracaibo-Handel',      outMult:1.00, oekoBase:0.05 },
  { id:'bolivia',    iso:'BO', flag:'🇧🇴', name:'Bolivien',       region:'Südamerika',  specialty:'Yungas-Hochland',       outMult:0.90, oekoBase:0.10 },
  // Südostasien
  { id:'vietnam',    iso:'VN', flag:'🇻🇳', name:'Vietnam',        region:'Südostasien', specialty:'Robusta-Massenware',    outMult:1.25, oekoBase:0.00 },
  { id:'thailand',   iso:'TH', flag:'🇹🇭', name:'Thailand',       region:'Südostasien', specialty:'Doi-Chang-Arabica',     outMult:1.00, oekoBase:0.05 },
  { id:'laos',       iso:'LA', flag:'🇱🇦', name:'Laos',           region:'Südostasien', specialty:'Bolaven-Plateau',       outMult:1.00, oekoBase:0.06 },
  { id:'philippines',iso:'PH', flag:'🇵🇭', name:'Philippinen',    region:'Südostasien', specialty:'Barako-Sorte',          outMult:1.10, oekoBase:0.02 },
  // Afrika
  { id:'ethiopia',   iso:'ET', flag:'🇪🇹', name:'Äthiopien',      region:'Afrika',      specialty:'Arabica-Ursprung',      outMult:0.90, oekoBase:0.12 },
  { id:'kenya',      iso:'KE', flag:'🇰🇪', name:'Kenia',          region:'Afrika',      specialty:'AA-Spitzenlagen',       outMult:0.90, oekoBase:0.10 },
  { id:'uganda',     iso:'UG', flag:'🇺🇬', name:'Uganda',         region:'Afrika',      specialty:'Robusta-Wildkaffee',    outMult:1.20, oekoBase:0.02 },
  { id:'tanzania',   iso:'TZ', flag:'🇹🇿', name:'Tansania',       region:'Afrika',      specialty:'Kilimanjaro-Peaberry',  outMult:0.95, oekoBase:0.08 },
  { id:'rwanda',     iso:'RW', flag:'🇷🇼', name:'Ruanda',         region:'Afrika',      specialty:'Bourbon-Hügel',         outMult:0.90, oekoBase:0.10 },
  { id:'ivorycoast', iso:'CI', flag:'🇨🇮', name:'Elfenbeinküste', region:'Afrika',      specialty:'Robusta-Export',        outMult:1.20, oekoBase:0.00 },
  // Orient
  { id:'yemen',      iso:'YE', flag:'🇾🇪', name:'Jemen',          region:'Orient',      specialty:'Heritage-Mokka',        outMult:0.85, oekoBase:0.12 },
  { id:'iran',       iso:'IR', flag:'🇮🇷', name:'Iran',           region:'Orient',      specialty:'Qahve-Handelsroute',    outMult:1.00, oekoBase:0.04 },
  { id:'iraq',       iso:'IQ', flag:'🇮🇶', name:'Irak',           region:'Orient',      specialty:'Basra-Handelsroute',    outMult:1.00, oekoBase:0.04 },
];
const _PRODUCER_ISO = new Set(PRODUCER_COUNTRIES.map(c => c.iso));
// Handelseinheit: Rohkaffee wird in Tonnen gehandelt → „CT" = Coffee Tons (1 Bohnen-Einheit = 1 Tonne).
const PRODUCER_UNIT = 'CT';
// Versorgungs-Multiplikator (§6c): Referenz-Tassen/Tag, um den perCup-Anteil des Konsum-Einkommens
// in ein Tageseinkommen zu übersetzen (Balance-Knopf). Cap-% liegt server-seitig bei 40.
const SUPPLY_CUPS_REF = 5;
function isProducerIso(iso) { return _PRODUCER_ISO.has(iso); }
function _producerById(id)  { return PRODUCER_COUNTRIES.find(c => c.id === id) || null; }
function _producerByIso(iso){ return PRODUCER_COUNTRIES.find(c => c.iso === iso) || null; }

// 6 Bau-Stränge (Land-Ebene, je L0–L5). trackBase = Kosten-Basis (§5b), lohn nur Mitarbeiter.
const PRODUCER_TRACKS = [
  { id:'plantage',  icon:'🌱', name:'Plantage',    trackBase:90, desc:'Grundmenge · +4 🫘/Stufe' },
  { id:'wasser',    icon:'💧', name:'Wasser',      trackBase:70, desc:'+15% Output/Stufe · ⚠️ ohne = fast Stopp' },
  { id:'duenger',   icon:'🧪', name:'Dünger',      trackBase:70, desc:'+12% Output/Stufe · hebt Öko' },
  { id:'arbeit',    icon:'👷', name:'Mitarbeiter', trackBase:60, desc:'+10% Output/Stufe · 💸 Löhne/Tag' },
  { id:'trocknung', icon:'🌾', name:'Trocknung',   trackBase:80, desc:'+Öko-Quote · −Verderb' },
  { id:'logistik',  icon:'🚛', name:'Logistik',    trackBase:75, desc:'+Transport/Tag · −Verderb' },
];
function _producerTrack(id) { return PRODUCER_TRACKS.find(t => t.id === id) || null; }

// Produktionsformel pro Land/Tag (§5a). levels = { plantage,wasser,duenger,arbeit,trocknung,logistik } (0..5).
// perks (optional) = aggregierte Konsum→Anbau-Synergie (producerPerks): outputMult/oekoShareAdd/capacityMult.
function producerLandOutput(country, levels, perks) {
  const L = levels || {}; const pk = perks || {};
  const P = L.plantage|0, W = L.wasser|0, D = L.duenger|0, M = L.arbeit|0, T = L.trocknung|0, G = L.logistik|0;
  const outMult  = country ? (country.outMult || 1) : 1;
  const oekoBase = country ? (country.oekoBase || 0) : 0;
  const waterMult   = (W === 0) ? 0.40 : (1 + 0.15 * W);
  const duengerMult = 1 + 0.12 * D;
  const arbeitMult  = 1 + 0.10 * M;
  const rawOutput   = Math.round(4 * P * waterMult * duengerMult * arbeitMult * outMult);
  const oekoShare   = Math.min(0.90, 0.08 * D + 0.10 * T + oekoBase + (pk.oekoShareAdd || 0));
  const kapazitaet  = Math.round(6 * G * (1 + (pk.capacityMult || 0)));
  // outputMult wirkt auf die GELIEFERTE Menge (nach Transport-Deckel) → zuverlässiger Bonus,
  // auch wenn die Logistik limitiert (sonst würde er komplett im Verderb verpuffen).
  const delivered   = Math.round(Math.min(rawOutput, kapazitaet) * (1 + (pk.outputMult || 0)));
  const oekoDeliv   = Math.round(delivered * oekoShare);
  const stdDeliv    = delivered - oekoDeliv;
  const spoiled     = Math.max(0, rawOutput - delivered);
  return { rawOutput, oekoShare, kapazitaet, delivered, oekoDeliv, stdDeliv, spoiled };
}
// Löhne/Tag je Land (§5c): 2 × Mitarbeiter-Level.
function producerLohnPerDay(levels) { return 2 * ((levels && levels.arbeit) | 0); }
// Upgrade-Kosten L→L+1 (§5b), Rabatt via _worldCost (Handelsattaché) wiederverwendet.
function producerUpgradeCost(member, trackId, curLevel) {
  const t = _producerTrack(trackId); if (!t) return 0;
  return _worldCost(member, t.trackBase * ((curLevel | 0) + 1));
}

// Freischaltung: neues Forschungsitem „Erzeuger-Konzession" (getrennt von welthandelslizenz).
function canAccessProducer(member) {
  return !!(member && member.research && member.research['erzeugerkonzession']);
}
// Anbau-Länderlimit: höchstes voll besessenes Tier × 2 (knapper als Konsum × 3).
function producerCountryLimit(research) {
  return worldHighestCompletedTier(research) * 2;
}

let _producerInvCache = []; // alle world_producer_investments der Gruppe (für Limit + Karte)
let _producerTrackCache = {}; // { country_id: { track_id: level } } — Land-Bau-Stände

// Track-Rows [{country_id, track_id, level}] → { country_id: { track_id: level } }
function producerTracksByCountry(rows) {
  const m = {};
  for (const r of (rows || [])) (m[r.country_id] = m[r.country_id] || {})[r.track_id] = r.level;
  return m;
}
// Level-Objekt { plantage, wasser, duenger, arbeit, trocknung, logistik } für ein Land (0 default).
function producerLevelsFor(countryId, byCountry) {
  const t = (byCountry || _producerTrackCache)[countryId] || {};
  const o = {};
  for (const tr of PRODUCER_TRACKS) o[tr.id] = t[tr.id] | 0;
  return o;
}

// Rang aus rohen Anbau-Investitionen (analog worldRanksForMember, aber ohne Garde — v1).
// investments: Array { member_id, country_id, total_invested }
function producerRanksForMember(investments, memberId) {
  const byCountry = {};
  for (const w of (investments || [])) (byCountry[w.country_id] = byCountry[w.country_id] || []).push(w);
  const rankMap = {};
  const foreignGovt = new Set();
  for (const [cid, list] of Object.entries(byCountry)) {
    const eff = list.map(w => ({ member_id: w.member_id, e: Number(w.total_invested) || 0 }))
                    .sort((a, b) => b.e - a.e);
    const myIdx = eff.findIndex(w => w.member_id === memberId);
    if (myIdx >= 0 && myIdx < 3) rankMap[cid] = myIdx + 1;
    if (eff[0] && eff[0].member_id !== memberId) {
      const c = _producerById(cid); if (c) foreignGovt.add(c.iso);
    }
  }
  return { rankMap, foreignGovt };
}
// Füllfarbe für Anbauländer (rang-abhängig; unbesetzt = dunkelgrün, klar vom Konsum-Braun getrennt).
function producerCountryColor(iso, rankMap, foreignGovtIsoSet) {
  const c = _producerByIso(iso);
  const rank = c ? (rankMap || {})[c.id] : null;
  if (rank === 1) return '#d4aa37'; // Gold: eigene Erzeuger-Regierung
  if (rank === 2) return '#a0a0a0'; // Silber
  if (rank === 3) return '#cd7f32'; // Bronze
  if (foreignGovtIsoSet && foreignGovtIsoSet.has(iso)) return '#5a1a1a'; // fremd regiert
  return '#14301c'; // unbesetztes Anbauland (dunkelgrün)
}
function producerInvestedTotal(investments, memberId) {
  let s = 0;
  for (const w of (investments || [])) if (w.member_id === memberId) s += Number(w.total_invested) || 0;
  return Math.round(s);
}
// Zahl der Anbauländer, in denen das Mitglied mind. 1 CC investiert hat (fürs Limit).
function producerCountriesHeld(investments, memberId) {
  const set = new Set();
  for (const w of (investments || [])) if (w.member_id === memberId && (Number(w.total_invested) || 0) > 0) set.add(w.country_id);
  return set.size;
}

// ── 🔗 Konsum→Anbau-Synergie (2026-07-14): Premium-Gebäude (`_d`) bestimmter Konsumländer geben
// einen GLOBALEN Bonus auf die Anbau-Seite — aktiv, sobald das Gebäude im Land gebaut ist UND der
// Spieler dort Rang 1–3 hält (er profitiert wie bei jedem Land-Gebäude). Alles reine Boni.
// Effekt-Felder: oekoPriceMult/stdPriceMult (+% Verkaufspreis), oekoShareAdd (+Öko-Anteil),
// lohnMult (−% Löhne, negativ), outputMult (+% Output), capacityMult (+% Transportkapazität).
const PRODUCER_SYNERGY = {
  switzerland_d: { country:'switzerland', icon:'🌿', label:'Bio-Auktionshaus (CH)',      desc:'+50 % Öko-Verkaufspreis',     oekoPriceMult:0.50 },
  ireland_d:     { country:'ireland',     icon:'🥃', label:'Whiskey-Veredelung (IE)',    desc:'+25 % Öko-Verkaufspreis',     oekoPriceMult:0.25 },
  portugal_d:    { country:'portugal',    icon:'⚓', label:'Lissabon-Handelskontor (PT)', desc:'+30 % Standard-Verkaufspreis', stdPriceMult:0.30 },
  austria_d:     { country:'austria',     icon:'🎯', label:'Sortenrein-Manufaktur (AT)',  desc:'+10 % Öko-Anteil bei Ernte',   oekoShareAdd:0.10 },
  newzealand_d:  { country:'newzealand',  icon:'🏔️', label:'Southern-Roastery (NZ)',      desc:'+8 % Öko-Anteil (Aromatik)',   oekoShareAdd:0.08 },
  morocco_d:     { country:'morocco',     icon:'👷', label:'Atlas-Erntekooperative (MA)', desc:'−30 % Plantagen-Löhne',        lohnMult:-0.30 },
  afghanistan_d: { country:'afghanistan', icon:'🧵', label:'Seidenstraßen-Kontor (AF)',   desc:'−20 % Plantagen-Löhne',        lohnMult:-0.20 },
  pakistan_d:    { country:'pakistan',    icon:'🧑‍🌾', label:'Erntehelfer-Zentrale (PK)',   desc:'+15 % Bohnen-Output',          outputMult:0.15 },
  egypt_d:       { country:'egypt',       icon:'🔺', label:'Pyramiden-Handelshaus (EG)',  desc:'+20 % Transportkapazität',     capacityMult:0.20 },
};
// Aggregierte aktive Synergie-Boni des Mitglieds (braucht Konsum-Rang + gebautes Gebäude).
function producerPerks(member) {
  const out = { oekoPriceMult:0, stdPriceMult:0, oekoShareAdd:0, lohnMult:0, outputMult:0, capacityMult:0, active:[] };
  if (!member) return out;
  const { rankMap } = worldRanksForMember(_worldInvCache, member.id);
  for (const [bid, eff] of Object.entries(PRODUCER_SYNERGY)) {
    if (!rankMap[eff.country]) continue;                                   // kein Rang im Land → kein Bonus
    const blds = _worldBldCache[eff.country] || [];
    if (!blds.some(b => b.building_id === bid)) continue;                  // Gebäude nicht gebaut
    out.oekoPriceMult += eff.oekoPriceMult || 0;
    out.stdPriceMult  += eff.stdPriceMult  || 0;
    out.oekoShareAdd  += eff.oekoShareAdd  || 0;
    out.lohnMult      += eff.lohnMult      || 0;
    out.outputMult    += eff.outputMult    || 0;
    out.capacityMult  += eff.capacityMult  || 0;
    out.active.push({ icon: eff.icon, label: eff.label, desc: eff.desc });
  }
  out.oekoShareAdd = Math.min(out.oekoShareAdd, 0.20);   // Cap
  out.lohnMult     = Math.max(out.lohnMult, -0.60);      // max 60 % Lohn-Rabatt
  return out;
}

function _worldById(id)   { return WORLD_COUNTRIES.find(c => c.id === id) || null; }
function _worldByIso(iso) { return WORLD_COUNTRIES.find(c => c.iso === iso) || null; }
function _worldSlot(country, rank) { return country?.slots.find(s => s.rank === rank) || null; }
// 🧠 CIQ Handelsattaché: −15 % auf Welt-Struktur-Kosten (Anzeige UND Abbuchung).
function _worldCost(member, base) {
  if (member && typeof ciqActive === 'function' && ciqActive(member.cosmetics || {}, 'handelsattache'))
    return Math.max(1, Math.round(base * 0.85));
  return base;
}

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
function worldPerCupDetail(rankMap, byCountry) {
  const parts = [];
  for (const [cid, rank] of Object.entries(rankMap || {})) {
    const c = _worldById(cid); const slot = _worldSlot(c, rank);
    let v = (slot && (slot.perCup || 0) > 0) ? slot.perCup : 0;
    // Rangabhängiger Gebäude-Anteil dieses Landes mit einbeziehen (sonst fehlt der
    // Gebäude-perCup im „Heute erhalten"-Detail, obwohl er ausgezahlt wird).
    if (byCountry && typeof calcWorldBuildingPerCup === 'function') {
      v += calcWorldBuildingPerCup({ [cid]: rank }, byCountry) || 0;
    }
    if (c && v > 0) parts.push(`${c.flag}+${Math.round(v * 100) / 100}`);
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
  // ── Gebäude für die neuen Konsumländer (2026-07-14) — gleiche Roh-Skala; Multiplikator wird unten aufgebacken ──
  norway:     [{id:'norway_c',name:'Hafen-Kiosk',icon:'⚓',cost:35,perCup:0,perDay:1},{id:'norway_a',name:'Fjord-Rösterei',icon:'🏔️',cost:80,perCup:0.3,perDay:0},{id:'norway_b',name:'Filter-Manufaktur',icon:'☕',cost:70,perCup:0,perDay:3},{id:'norway_d',name:'Nordlicht-Kaffeehaus',icon:'🌌',cost:175,perCup:0.5,perDay:0}],
  sweden:     [{id:'sweden_c',name:'Fika-Ecke',icon:'🍰',cost:35,perCup:0,perDay:1},{id:'sweden_a',name:'Kanelbulle-Café',icon:'🥮',cost:70,perCup:0.2,perDay:0},{id:'sweden_b',name:'Design-Rösterei',icon:'🪑',cost:80,perCup:0,perDay:3},{id:'sweden_d',name:'Stockholm-Roastery',icon:'👑',cost:170,perCup:0.5,perDay:0}],
  finland:    [{id:'finland_c',name:'Sauna-Kaffeestube',icon:'🧖',cost:35,perCup:0,perDay:1},{id:'finland_a',name:'Pulla-Bäckerei',icon:'🥐',cost:70,perCup:0.2,perDay:0},{id:'finland_b',name:'Rekord-Rösterei',icon:'📈',cost:80,perCup:0.3,perDay:0},{id:'finland_d',name:'Helsinki-Kaffeepalast',icon:'🏛️',cost:175,perCup:0,perDay:5}],
  denmark:    [{id:'denmark_c',name:'Hygge-Ecke',icon:'🕯️',cost:35,perCup:0,perDay:1},{id:'denmark_a',name:'Smørrebrød-Café',icon:'🥪',cost:70,perCup:0.2,perDay:0},{id:'denmark_b',name:'Design-Kaffeebar',icon:'🚲',cost:70,perCup:0,perDay:3},{id:'denmark_d',name:'Kopenhagen-Roastery',icon:'👑',cost:170,perCup:0.5,perDay:0}],
  iceland:    [{id:'iceland_c',name:'Geysir-Kiosk',icon:'♨️',cost:35,perCup:0,perDay:1},{id:'iceland_a',name:'Lava-Rösterei',icon:'🌋',cost:70,perCup:0.2,perDay:0},{id:'iceland_b',name:'Gletscher-Kaffeebar',icon:'🧊',cost:60,perCup:0,perDay:2},{id:'iceland_d',name:'Reykjavík-Kaffeehaus',icon:'🐋',cost:160,perCup:0.45,perDay:0}],
  poland:     [{id:'poland_c',name:'Kawiarnia-Stand',icon:'☕',cost:30,perCup:0.1,perDay:0},{id:'poland_a',name:'Altstadt-Café',icon:'🏰',cost:60,perCup:0,perDay:2},{id:'poland_b',name:'Kawa-Rösterei',icon:'🔥',cost:60,perCup:0.2,perDay:0},{id:'poland_d',name:'Warschau-Kaffeehaus',icon:'🎹',cost:160,perCup:0.5,perDay:0}],
  ukraine:    [{id:'ukraine_c',name:'Straßen-Kaffee',icon:'☕',cost:30,perCup:0,perDay:1},{id:'ukraine_a',name:'Lviv-Kaffeehaus',icon:'🏛️',cost:60,perCup:0.2,perDay:0},{id:'ukraine_b',name:'Untergrund-Rösterei',icon:'🔥',cost:60,perCup:0,perDay:2},{id:'ukraine_d',name:'Kaffee-Bergwerk',icon:'⛏️',cost:160,perCup:0.5,perDay:0}],
  // ── Gebäude für die Konsumländer 2. Welle (2026-07-14) ──
  spain:      [{id:'spain_c',name:'Churrería-Ecke',icon:'🍩',cost:35,perCup:0,perDay:1},{id:'spain_a',name:'Tapas-Café',icon:'🥘',cost:70,perCup:0.2,perDay:0},{id:'spain_b',name:'Cortado-Bar',icon:'☕',cost:70,perCup:0,perDay:3},{id:'spain_d',name:'Barcelona-Roastery',icon:'🏛️',cost:175,perCup:0.5,perDay:0}],
  portugal:   [{id:'portugal_c',name:'Pastéis-Stand',icon:'🥧',cost:35,perCup:0,perDay:1},{id:'portugal_a',name:'Bica-Bar',icon:'☕',cost:65,perCup:0.2,perDay:0},{id:'portugal_b',name:'Azulejo-Café',icon:'🔵',cost:70,perCup:0,perDay:3},{id:'portugal_d',name:'Lissabon-Handelskontor',icon:'⚓',cost:170,perCup:0.5,perDay:0}],
  ireland:    [{id:'ireland_c',name:'Pub-Kaffee-Ecke',icon:'🍀',cost:35,perCup:0,perDay:1},{id:'ireland_a',name:'Irish-Coffee-Bar',icon:'☘️',cost:70,perCup:0,perDay:3},{id:'ireland_b',name:'Dubliner Rösterei',icon:'🔥',cost:70,perCup:0.2,perDay:0},{id:'ireland_d',name:'Whiskey-Kaffeehaus',icon:'🥃',cost:170,perCup:0,perDay:5}],
  switzerland:[{id:'switzerland_c',name:'Alp-Kaffeestube',icon:'🏔️',cost:40,perCup:0,perDay:1},{id:'switzerland_a',name:'Präzisions-Rösterei',icon:'⚙️',cost:90,perCup:0.3,perDay:0},{id:'switzerland_b',name:'Aroma-Labor',icon:'🧪',cost:90,perCup:0.35,perDay:0},{id:'switzerland_d',name:'Bio-Auktionshaus',icon:'🌿',cost:190,perCup:0.5,perDay:0}],
  austria:    [{id:'austria_c',name:'Melange-Ecke',icon:'☕',cost:35,perCup:0,perDay:1},{id:'austria_a',name:'Wiener Kaffeehaus',icon:'🎻',cost:80,perCup:0.3,perDay:0},{id:'austria_b',name:'Konditorei-Café',icon:'🍰',cost:70,perCup:0.25,perDay:0},{id:'austria_d',name:'Sortenrein-Manufaktur',icon:'🎯',cost:180,perCup:0.5,perDay:0}],
  hungary:    [{id:'hungary_c',name:'Kávéház-Stand',icon:'☕',cost:30,perCup:0.1,perDay:0},{id:'hungary_a',name:'Budapester Café',icon:'🏛️',cost:60,perCup:0,perDay:2},{id:'hungary_b',name:'Ruin-Bar-Kaffee',icon:'🎨',cost:60,perCup:0.2,perDay:0},{id:'hungary_d',name:'Donau-Kaffeepalast',icon:'🌉',cost:160,perCup:0.5,perDay:0}],
  morocco:    [{id:'morocco_c',name:'Souk-Kaffeestand',icon:'🕌',cost:30,perCup:0,perDay:1},{id:'morocco_a',name:'Nus-Nus-Café',icon:'🫖',cost:60,perCup:0,perDay:2},{id:'morocco_b',name:'Gewürz-Rösterei',icon:'🌶️',cost:60,perCup:0.2,perDay:0},{id:'morocco_d',name:'Atlas-Erntekooperative',icon:'👷',cost:165,perCup:0,perDay:5}],
  egypt:      [{id:'egypt_c',name:'Ahwa-Stand',icon:'☕',cost:30,perCup:0,perDay:1},{id:'egypt_a',name:'Nil-Kaffeehaus',icon:'🐫',cost:60,perCup:0,perDay:2},{id:'egypt_b',name:'Basar-Rösterei',icon:'🔥',cost:60,perCup:0.2,perDay:0},{id:'egypt_d',name:'Pyramiden-Handelshaus',icon:'🔺',cost:165,perCup:0,perDay:5}],
  libya:      [{id:'libya_c',name:'Wüsten-Kaffeezelt',icon:'⛺',cost:30,perCup:0,perDay:1},{id:'libya_a',name:'Gahwa-Haus',icon:'🕌',cost:60,perCup:0,perDay:2},{id:'libya_b',name:'Küsten-Import-Depot',icon:'⚓',cost:60,perCup:0,perDay:2},{id:'libya_d',name:'Sahara-Handelsroute',icon:'🐪',cost:160,perCup:0,perDay:5}],
  afghanistan:[{id:'afghanistan_c',name:'Chaikhana-Ecke',icon:'🫖',cost:30,perCup:0,perDay:1},{id:'afghanistan_a',name:'Qymaq-Kaffeehaus',icon:'☕',cost:55,perCup:0,perDay:2},{id:'afghanistan_b',name:'Basar-Röster',icon:'🔥',cost:55,perCup:0.15,perDay:0},{id:'afghanistan_d',name:'Seidenstraßen-Kontor',icon:'🧵',cost:155,perCup:0,perDay:4}],
  pakistan:   [{id:'pakistan_c',name:'Basar-Kaffeestand',icon:'☕',cost:30,perCup:0.1,perDay:0},{id:'pakistan_a',name:'Karachi-Café',icon:'🏙️',cost:60,perCup:0,perDay:2},{id:'pakistan_b',name:'Gewürz-Rösterei',icon:'🌶️',cost:60,perCup:0.2,perDay:0},{id:'pakistan_d',name:'Erntehelfer-Zentrale',icon:'👷',cost:165,perCup:0.5,perDay:0}],
  newzealand: [{id:'newzealand_c',name:'Flat-White-Stand',icon:'🥛',cost:35,perCup:0.1,perDay:0},{id:'newzealand_a',name:'Wellington-Café',icon:'🥝',cost:75,perCup:0.2,perDay:0},{id:'newzealand_b',name:'Kiwi-Rösterei',icon:'🔥',cost:70,perCup:0,perDay:3},{id:'newzealand_d',name:'Southern-Roastery',icon:'🏔️',cost:175,perCup:0.5,perDay:0}],
  chile:      [{id:'chile_c',name:'Café-con-Piernas',icon:'☕',cost:35,perCup:0,perDay:1},{id:'chile_a',name:'Santiago-Café',icon:'🏙️',cost:65,perCup:0,perDay:2},{id:'chile_b',name:'Anden-Rösterei',icon:'🔥',cost:65,perCup:0.2,perDay:0},{id:'chile_d',name:'Pazifik-Handelshafen',icon:'⚓',cost:170,perCup:0.5,perDay:0}],
};

// ── Balancing 2026-06-20: Welt-Gebäude auf Minimap-Niveau heben ─────────────────
// Ein komplett ausgebautes Land soll sich wie die Minimap-Gebäude lohnen — Ziel:
// vollständig (alle 4 Gebäude, L2) ≥ +10 CC/Tasse für den Rang-1-Halter. Kosten
// bleiben unverändert; nur der Ertrag wird einmalig in die Tabelle gebacken (eine
// Quelle der Wahrheit für Anzeige + Calc).
const WORLD_BLD_CUP_MULT = 8;
const WORLD_BLD_DAY_MULT = 5;
for (const _arr of Object.values(WORLD_BUILDINGS)) for (const _b of _arr) {
  _b.perCup = Math.round((_b.perCup || 0) * WORLD_BLD_CUP_MULT * 100) / 100;
  _b.perDay = Math.round((_b.perDay || 0) * WORLD_BLD_DAY_MULT * 100) / 100;
}

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
// Stufe 2 (Ausbau) kostet 2,5× den aktuellen Stufe-1-Preis (User-Vorgabe 2026-07-02).
function calcGardeUpgradeCost(countryId, byCountry) {
  return Math.round(calcGardeCost(countryId, byCountry) * 2.5);
}
// Effektiver Einfluss-Bonus je Garde-Stufe — konsistent zur DB (buy_garde/get_country_standings).
function _gardeBonus(level, top) {
  if (level === 1) return 0.15 * top;
  if (level === 2) return 0.30 * top;
  return 0;
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
    // Effektiver Einfluss = total + Garde-Stufen-Bonus (0/15%/30% × Top-Rohbetrag) — konsistent zur DB
    const top = Math.max(0, ...list.map(w => Number(w.total_invested) || 0));
    const eff = list.map(w => ({
      member_id: w.member_id,
      e: (Number(w.total_invested) || 0) + _gardeBonus(w.garde_level || 0, top),
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

// ── Tier-basiertes Länder-Limit ───────────────────────────────────────────────
// Gibt das höchste Tier zurück, bei dem ALLE Forschungs-Items besessen werden.
// Unabhängig von completedResearchTiers (der zählt alle, nicht nur das höchste).
function worldHighestCompletedTier(research) {
  if (!research) return 0;
  const items = getAllResearchItems();
  let highest = 0;
  for (let t = 1; t <= 5; t++) {
    const tierItems = items.filter(i => i.tier === t);
    if (tierItems.length && tierItems.every(i => research[i.id])) highest = t;
  }
  return highest;
}
// T1→3, T2→6, T3→9, T4→12, T5→15
function worldCountryLimit(research) {
  return worldHighestCompletedTier(research) * 3;
}

const _wfmt = (n) => (typeof _fmtCoins === 'function') ? _fmtCoins(n) : (Math.round(n * 100) / 100);

// ── UI: Weltkarte-Reiter ─────────────────────────────────────────────────────
let _worldMap = null;
let _worldGeoLayer = null;
let _worldBldCache = {}; // { countryId: [{building_id, level, member_id}] }
let _worldInvCache = []; // alle world_investments der Gruppe (für Limit-Prüfung)
let _worldAllianceCache = []; // alle world_alliances der Gruppe (für Länder-Sheet + Übersicht)

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
      <span><i style="background:#14301c;border:2px solid #3fae5a"></i>🫘 Anbauland</span>
    </div>
    <div id="cc-world-sheet" class="cc-world-sheet hidden"></div>
    <div id="cc-producer-panel"></div>
    <div id="cc-world-stats"></div>
    <div id="cc-world-devs"></div>`;

  // Investitionen der Gruppe laden (für Einfärbung) — robust, falls Backend noch nicht migriert
  let investments = [];
  try { investments = await DB.fetchAllWorldInvestments(); }
  catch (e) {
    document.getElementById('cc-world-map').innerHTML =
      `<p style="color:var(--muted);padding:16px">🌍 Weltkarte-Backend noch nicht aktiv. Bitte SQL-Migration in Supabase ausführen.</p>`;
    console.warn('fetchAllWorldInvestments:', e.message);
    return;
  }

  let bldRows = [];
  try { bldRows = await DB.fetchAllWorldBuildings(); } catch (e) { bldRows = []; }
  _worldBldCache = worldBuildingsByCountry(bldRows);
  _worldInvCache = investments; // für Tier-Limit-Prüfung in _openCountrySheet

  // 🫘 Anbauländer-Investitionen + Bau-Stände (grüne Rahmen + Rang) — still deaktiviert, falls Backend fehlt
  let producerInv = [];
  try { producerInv = (typeof DB.fetchAllProducerInvestments === 'function') ? await DB.fetchAllProducerInvestments() : []; }
  catch (e) { producerInv = []; }
  _producerInvCache = producerInv;
  let producerTracks = [];
  try { producerTracks = (typeof DB.fetchAllProducerTracks === 'function') ? await DB.fetchAllProducerTracks() : []; }
  catch (e) { producerTracks = []; }
  _producerTrackCache = producerTracksByCountry(producerTracks);
  const { rankMap: producerRankMap, foreignGovt: producerForeignGovt } = producerRanksForMember(producerInv, member.id);

  // 🤝 Weltbündnisse: erst Housekeeping (Ablauf/Rang-1-Verlust auflösen + Chat-Meldung),
  // dann den aktuellen Stand laden. Beides robust — [] bei fehlender Migration.
  const users = (typeof appData !== 'undefined' && appData && appData.users) ? appData.users : [member];
  let allianceChanges = [];
  try { if (typeof DB.reconcileWorldAlliances === 'function') allianceChanges = await DB.reconcileWorldAlliances(); } catch (e) {}
  let alliances = [];
  try { if (typeof DB.fetchAllWorldAlliances === 'function') alliances = await DB.fetchAllWorldAlliances(); } catch (e) {}
  _worldAllianceCache = alliances;
  if (allianceChanges.length && typeof allianceDef === 'function') {
    const nameOfA = (id) => (users.find(u => u.id === id) || {}).name || '—';
    for (const c of allianceChanges) {
      const def = allianceDef(c.type); if (!def) continue;
      const msg = c.event === 'expired'
        ? `${def.icon} Das ${def.name} zwischen ${nameOfA(c.member_a)} und ${nameOfA(c.member_b)} ist ausgelaufen.`
        : `${def.icon} Das ${def.name} zwischen ${nameOfA(c.member_a)} und ${nameOfA(c.member_b)} wurde aufgelöst (Rang-1-Verlust).`;
      DB.postMessage(msg, 'Weltkarte').catch(() => {});
    }
  }

  // Welt-Statistik + Entwicklungen rendern (Steuer-Statistik resilient: {} ohne 19d-Migration)
  let taxStats = {};
  try { if (typeof DB.fetchTaxStats === 'function') taxStats = await DB.fetchTaxStats(); } catch (e) { taxStats = {}; }
  const statsEl = document.getElementById('cc-world-stats');
  if (statsEl) {
    const { rankMap: _myAllianceRankMap } = worldRanksForMember(_worldInvCache, member.id);
    statsEl.innerHTML = _renderWeltStatistik(investments, _worldBldCache, member, taxStats, users)
      + ((typeof renderAllianceOverview === 'function') ? renderAllianceOverview(alliances, member, users, _myAllianceRankMap) : '');
    statsEl.querySelectorAll('[data-alliance-accept]').forEach(b => b.onclick = () => _handleRespondAlliance(b.dataset.allianceAccept, true, null, member));
    statsEl.querySelectorAll('[data-alliance-decline]').forEach(b => b.onclick = () => _handleRespondAlliance(b.dataset.allianceDecline, false, null, member));
  }
  const devsEl = document.getElementById('cc-world-devs');
  if (devsEl) {
    devsEl.innerHTML = _renderWeltEntwicklungen(member, investments, _worldBldCache);
    devsEl.querySelectorAll('[data-world-dev]').forEach(b => b.onclick = () => {
      const dev = WORLD_DEVS.find(d => d.id === b.dataset.worldDev);
      if (dev) _handleBuyWorldDev(member, dev);
    });
    const fd = devsEl.querySelector('[data-fund-deposit]');  if (fd) fd.onclick = () => _handleFundDeposit(member);
    const fw = devsEl.querySelector('[data-fund-withdraw]'); if (fw) fw.onclick = () => _handleFundWithdraw(member);
    const fv = devsEl.querySelector('[data-fund-dividend]'); if (fv) fv.onclick = () => _handleFundDividend(member);
    devsEl.querySelectorAll('[data-fund-mode]').forEach(b => { b.onclick = () => _handleFundMode(member, b.dataset.fundMode); });
  }
  // 🫘 Rohstoff-Panel (Lager + Ernte) — nur relevant, wenn Konzession ODER schon Anbau-Einfluss
  const prodPanelEl = document.getElementById('cc-producer-panel');
  if (prodPanelEl) {
    // 🫘 Ernte AUTOMATISCH einsammeln (alle Länder auf einmal), BEVOR das Panel gerendert wird,
    // damit es gleich den frischen Lagerstand zeigt — kein Länder-Klick, kein Button nötig.
    try { await _maybeAutoHarvest(member); } catch (e) { /* non-critical */ }
    prodPanelEl.innerHTML = _renderProducerPanel(member);
    const sb2 = prodPanelEl.querySelector('[data-prod-supply]');
    if (sb2) sb2.onclick = () => _handleClaimSupply(member);
    prodPanelEl.querySelectorAll('[data-prod-sell]').forEach(b => b.onclick = () => _handleSellBeans(member, b.dataset.prodSell));
  }
  _wireAccordions();

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
      style: (f) => {
        const iso = f.properties.iso;
        // 🫘 Anbauländer: grüner Rahmen markiert den Typ (Füllfarbe bleibt rang-abhängig).
        if (isProducerIso(iso)) return {
          fillColor: producerCountryColor(iso, producerRankMap, producerForeignGovt),
          weight: 2, color: '#3fae5a', fillOpacity: 0.78,
        };
        return {
          fillColor: getCountryColor(iso, rankMap, foreignGovt),
          weight: 1, color: 'rgba(0,0,0,0.6)', fillOpacity: 0.78,
        };
      },
      onEachFeature: (f, layer) => {
        const iso = f.properties.iso;
        const pc = _producerByIso(iso);
        if (pc) { layer.on('click', () => { if (typeof _openProducerSheet === 'function') _openProducerSheet(pc, member); }); return; }
        const c = _worldByIso(iso);
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

  const _myPassiveHere = (member.map_data && member.map_data.worldPassive && member.map_data.worldPassive[country.id]) || 0;
  // 🏦 Stille Anlage — Ertragsvorschau für dieses Land (Anteil am Gebäude-Einkommen)
  const _passiveIncomeHere = worldCountryBuildingIncomePerDay(country.id, _worldBldCache);
  const _passiveShareHere  = worldPassiveShare(_myPassiveHere);
  const _passiveYieldHere   = Math.round(_passiveIncomeHere * _passiveShareHere * 100) / 100;
  const _passivePct = String(Math.round(_passiveShareHere * 1000) / 10).replace('.', ',');
  const _passiveNoteLines = [
    `Anteil am <strong>Gebäude-Einkommen des Landes</strong> (${_wfmt(_passiveIncomeHere)} CC/Tag) — je mehr Kapital, desto größer dein Anteil (bis 20 % bei ${_wfmt(WORLD_PASSIVE_CAP)} CC). Verdrängt niemanden, zählt nicht auf den Rang.`,
  ];
  if (_passiveIncomeHere <= 0) _passiveNoteLines.push(`<em>Noch keine Gebäude in diesem Land — deine Anlage wirft hier aktuell nichts ab.</em>`);
  if (_myPassiveHere > 0) _passiveNoteLines.push(`Deine Anlage hier: <strong>${_wfmt(_myPassiveHere)} CC</strong> · Anteil <strong>${_passivePct} %</strong>${_passiveIncomeHere > 0 ? ` · <strong>+${_wfmt(_passiveYieldHere)} CC/Tag</strong>` : ''}.`);
  const _passiveWithdrawBlock = _myPassiveHere > 0
    ? `<div class="cc-world-invest">
         <input type="number" id="cc-world-withdraw-amount" min="1" step="5" max="${Math.floor(_myPassiveHere)}" placeholder="CC auszahlen (max. ${_wfmt(_myPassiveHere)})">
         <button class="cc-build-btn cc-world-withdraw-btn" data-world-withdraw="1">🏧 Auszahlen</button>
       </div>
       <p class="cc-world-pctnote cc-world-passive-fee">Auszahlen: 20 % gehen als Entschädigung an die Erbauer des Landes (leeres Land: 0 %).</p>`
    : '';
  // Rang 1 hängt am EFFEKTIVEN Einfluss (roh + Garde-Bonus des Regenten: +15% Stufe 1 /
  // +30% Stufe 2 des Spitzenwerts), nicht am rohen total_invested. Die reine Differenz
  // unterschätzte den nötigen Betrag, wenn der Regent eine Garde hat → Herausforderer
  // investierte „genug" und übernahm trotzdem nicht (JP-Bug 2026-07-03). Da die eigene
  // Investition selbst zum neuen Spitzenwert werden kann (der Garde-Bonus des Regenten
  // wächst dann mit — rekursiv), wird durch (1 + eigenerGardeFaktor − RegentGardeFaktor)
  // geteilt statt nur die Differenz zu bilden; ohne Garde (Faktor 0/0) = exakt die alte Formel.
  const _topGardeLvl = standings.length ? (standings[0].garde_level || 0) : 0;
  const _myGardeLvl  = myRow ? (myRow.garde_level || 0) : 0;
  const _fTop  = _gardeBonus(_topGardeLvl, 1);   // 0 / 0.15 / 0.30
  const _fMe   = _gardeBonus(_myGardeLvl, 1);
  const _denom = 1 + _fMe - _fTop;               // ∈ [0.70, 1.30], nie 0
  const needForTop = myRank === 1 ? 0
    : Math.max(WORLD_MIN_INVEST, Math.floor(topInv / _denom - myInv) + 1);
  const _gardeNote = _topGardeLvl > 0
    ? ` <span style="color:var(--muted);font-weight:400;font-size:.85em">(inkl. ${_topGardeLvl === 2 ? '☕☕ Garde Stufe 2 · +30 %' : '☕ Garde Stufe 1 · +15 %'} Verteidigungsbonus des Regenten)</span>`
    : '';
  const statusLine = myRank
    ? `Dein Einfluss: <strong>Rang ${myRank}</strong> · ${_wfmt(myInv)} CC investiert`
    : `Du hast hier noch keinen Einfluss.`;
  const topLine = myRank === 1
    ? `👑 Du regierst dieses Land.`
    : `Für Rang 1 nötig: <strong>${needForTop} CC</strong> mehr als der Spitzenreiter.${_gardeNote}`;

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
    if (level === 0 && canBuild)       btn = `<button class="cc-build-btn cc-world-bbtn" data-world-build="${def.id}">Bauen · ${_worldCost(member, def.cost)} 🫘</button>`;
    else if (level === 1 && canBuild)  btn = `<button class="cc-build-btn cc-world-bbtn" data-world-upgrade="${def.id}">Ausbau L2 · ${_worldCost(member, Math.round(def.cost * 0.5))} 🫘</button>`;
    else if (level === 0 && !canBuild) btn = `<span class="cc-world-blocked">🔒 Top 3 nötig</span>`;
    else                               btn = `<span class="cc-world-blocked">✓ ${lvlTxt}</span>`;
    // 🔗 Konsum→Anbau-Synergie: wenn dieses Gebäude einen globalen Anbau-Bonus trägt, sichtbar
    // ausweisen (unabhängig davon, ob der Spieler schon Plantagen hat).
    const syn = (typeof PRODUCER_SYNERGY !== 'undefined') ? PRODUCER_SYNERGY[def.id] : null;
    const synNote = syn ? `<span class="cc-world-bld-syn" title="Globaler Bonus auf deine Anbauländer (aktiv mit Rang hier + gebautem Gebäude)">🔗 Anbau-Bonus: ${_esc2(syn.desc)}</span>` : '';
    return `<div class="cc-world-bld${syn ? ' cc-world-bld-syn-row' : ''}">
      <span class="cc-world-bld-name">${def.icon} ${_esc2(def.name)} <em>${lvlTxt}</em></span>
      <span class="cc-world-bld-eff">${base}</span>
      ${btn}
      ${synNote}
    </div>`;
  }).join('');
  const hasSteuerberater = !!(member.map_data && member.map_data.worldDev && member.map_data.worldDev.steuerberater);
  const taxPct = hasSteuerberater ? 10 : 20;
  let pctNote;
  if (!myRank) {
    pctNote = `Investiere, um an den Land-Gebäude-Boni teilzuhaben (Bauen ab Rang 3).`;
  } else {
    pctNote = `Als Rang ${myRank} erhältst du <strong>${Math.round(pct * 100)}%</strong> der Land-Gebäude-Boni.`;
    if (myRank !== 1) pctNote += ` Beim Bauen zahlst du <strong>${taxPct} %</strong> Steuer an die Regierung${hasSteuerberater ? ' (💼 Steuerberater)' : ''}.`;
  }

  // ── Garde (nur der amtierende Regent, Rang 1, darf stationieren/ausbauen —
  //    Garde verteidigt die eigene Regierung, ist kein Aufhol-Tool für
  //    Herausforderer). 2 Stufen, je Person+Land genau 1 Kauf-Slot: Stufe 1
  //    (+15% Einfluss) → Ausbau Stufe 2 (2,5× Stufe-1-Preis, +30% Einfluss).
  //    Bleibt bei Verlust von Rang 1 bestehen (hängt an der Investment-Zeile).
  const gardeCost  = calcGardeCost(country.id, _worldBldCache);
  const gardeCost2 = calcGardeUpgradeCost(country.id, _worldBldCache);
  const gardeLevel = (myRow && myRow.garde_level) || 0;
  let gardeBlock;
  if (gardeLevel >= 2) {
    gardeBlock = `<span class="cc-world-garde-on">☕☕ Garde Stufe 2 aktiv · +30% Einfluss</span>`;
  } else if (gardeLevel === 1) {
    gardeBlock = myRank === 1
      ? `<span class="cc-world-garde-on">☕ Garde Stufe 1 aktiv · +15% Einfluss</span><br>
         <button class="cc-build-btn cc-world-bbtn" style="margin-top:4px" data-world-garde="1">⬆️ Ausbau Stufe 2 · ${gardeCost2} 🫘</button>`
      : `<span class="cc-world-garde-on">☕ Garde Stufe 1 aktiv · +15% Einfluss</span>`;
  } else if (myRank === 1) {
    gardeBlock = `<button class="cc-build-btn cc-world-bbtn" data-world-garde="1">☕ Garde stationieren · ${gardeCost} 🫘</button>`;
  } else if (myRow) {
    gardeBlock = `<span class="cc-world-blocked">Nur der Regent (Rang 1) kann eine Garde stationieren/ausbauen.</span>`;
  } else {
    gardeBlock = `<span class="cc-world-blocked">Investiere zuerst für eine Garde</span>`;
  }

  // ── Tier-basiertes Länder-Limit ──────────────────────────────────────────────
  const { rankMap: _myRankMap } = worldRanksForMember(_worldInvCache, member.id);
  const _myGovCount  = Object.values(_myRankMap).filter(r => r === 1).length;
  const _govLimit    = worldCountryLimit(member.research);
  const _govTier     = worldHighestCompletedTier(member.research);
  // Blockiert: Spieler ist hier NICHT Regent und hat sein Tier-Limit erreicht
  const atGovLimit   = (myRank !== 1) && (_myGovCount >= _govLimit);

  // ── Söldner-Sabotage (nur wenn freigeschaltet + fremder Regent) ──
  const ownsSoeldner = !!(member.map_data && member.map_data.worldDev && member.map_data.worldDev.soeldner);
  const governor = standings.find(s => s.rank === 1) || standings[0] || null;
  let sabotageBlock = '';
  if (ownsSoeldner && governor && governor.member_id !== member.id) {
    let sabotages = [];
    try { sabotages = await DB.fetchSabotages(); } catch (e) {}
    const active = sabotages.find(s => s.country_id === country.id && s.target_id === governor.member_id);
    if (active) {
      const until = new Date(active.expires_at).toLocaleDateString('de-DE');
      sabotageBlock = `<span class="cc-world-blocked">⚔️ ${_esc2(governor.member_name)} ist hier sabotiert (bis ${until})</span>`;
    } else {
      sabotageBlock = `<button class="cc-build-btn cc-world-bbtn cc-sabotage-btn" data-world-sabotage="1">⚔️ ${_esc2(governor.member_name)} ${SABOTAGE_DAYS} Tage lahmlegen · ${SABOTAGE_COST} 🫘</button>`;
    }
  }

  // ── Weltbündnisse mit dem Regenten dieses Landes (plans/PLAN_weltbuendnisse.md) ──
  const myGovernedCountryId = Object.entries(_myRankMap).find(([, r]) => r === 1)?.[0] || null;
  const allianceBlock = (typeof renderAllianceSection === 'function')
    ? renderAllianceSection(country, member, governor, _worldAllianceCache, myGovernedCountryId, _worldInvCache, _worldBldCache) : '';

  sheet.innerHTML = `
    <div class="cc-world-sheet-head">
      <span>${country.flag} <strong>${_esc2(country.name)}</strong> · ${_esc2(country.specialty)}</span>
      <button class="cc-world-close" data-world-close>✕</button>
    </div>
    <div class="cc-world-slots">${rows}</div>
    <p class="cc-world-status">${statusLine}<br>${topLine}</p>
    ${atGovLimit
      ? `<div class="cc-world-invest-locked">
           🔒 Länder-Limit: <strong>${_myGovCount}/${_govLimit}</strong> Regierungen (Tier ${_govTier}).
           Schließe <strong>Tier ${Math.min(_govTier + 1, 5)}</strong> vollständig ab,
           um +3 weitere Länder regieren zu dürfen.
         </div>`
      : `<div class="cc-world-invest">
           <input type="number" id="cc-world-amount" min="${WORLD_MIN_INVEST}" step="5" placeholder="CC (min. ${WORLD_MIN_INVEST})">
           <button class="cc-build-btn" data-world-invest="1">🌍 Einfluss stärken</button>
         </div>`
    }
    <div class="cc-world-section-title">🏦 Stille Anlage <span>(Ertrag ohne Rang-Einfluss)</span></div>
    <p class="cc-world-pctnote">${_passiveNoteLines.join('<br>')}</p>
    <div class="cc-world-invest">
      <input type="number" id="cc-world-passive-amount" min="${WORLD_MIN_INVEST}" step="5" placeholder="CC (min. ${WORLD_MIN_INVEST})">
      <button class="cc-build-btn" data-world-passive="1">🏦 Anlegen</button>
    </div>
    ${_passiveWithdrawBlock}
    <div class="cc-world-section-title">🏗️ Gebäude <span>(gehören dem Land)</span></div>
    <p class="cc-world-pctnote">${pctNote}</p>
    <div class="cc-world-blds">${bldRows}</div>
    <div class="cc-world-section-title">☕ Garde</div>
    <div class="cc-world-garde">${gardeBlock}</div>
    ${sabotageBlock ? `<div class="cc-world-section-title">⚔️ Sabotage</div><div class="cc-world-sabotage">${sabotageBlock}</div>` : ''}
    ${allianceBlock}`;

  sheet.querySelector('[data-world-close]').onclick = () => sheet.classList.add('hidden');
  const investBtn = sheet.querySelector('[data-world-invest]');
  if (investBtn) investBtn.onclick = () => _handleWorldInvest(country, member);
  const passiveBtn = sheet.querySelector('[data-world-passive]');
  if (passiveBtn) passiveBtn.onclick = () => _handlePassiveInvest(country, member);
  const withdrawBtn = sheet.querySelector('[data-world-withdraw]');
  if (withdrawBtn) withdrawBtn.onclick = () => _handlePassiveWithdraw(country, member);
  const gb = sheet.querySelector('[data-world-garde]'); if (gb) gb.onclick = () => _handleBuyGarde(country, member);
  sheet.querySelectorAll('[data-alliance-propose]').forEach(b => b.onclick = () => {
    const type = b.dataset.alliancePropose;
    const offerInput = b.closest('.cc-alliance-row')?.querySelector('[data-alliance-offer-for="handel"]');
    const minOffer = b.dataset.allianceMinOffer ? parseFloat(b.dataset.allianceMinOffer) : undefined;
    _handleProposeAlliance(type, country, governor, member, myGovernedCountryId, offerInput?.value, minOffer);
  });
  sheet.querySelectorAll('[data-alliance-accept]').forEach(b => b.onclick = () =>
    _handleRespondAlliance(b.dataset.allianceAccept, true, country, member));
  sheet.querySelectorAll('[data-alliance-decline]').forEach(b => b.onclick = () =>
    _handleRespondAlliance(b.dataset.allianceDecline, false, country, member));
  const sb = sheet.querySelector('[data-world-sabotage]'); if (sb && governor) sb.onclick = () => _handleSabotage(country, member, governor);
  sheet.querySelectorAll('[data-world-build]').forEach(b => b.onclick = () => {
    const def = worldBuildingDef(country.id, b.dataset.worldBuild); if (def) _handleBuildWorld(country, member, def);
  });
  sheet.querySelectorAll('[data-world-upgrade]').forEach(b => b.onclick = () => {
    const def = worldBuildingDef(country.id, b.dataset.worldUpgrade); if (def) _handleUpgradeWorld(country, member, def);
  });
}

// ── 🫘 Anbauland-Sheet (Bau-Stränge, Rang, Land-Produktion) ───────────────────
async function _openProducerSheet(country, member) {
  const sheet = document.getElementById('cc-world-sheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  sheet.innerHTML = `<p style="color:var(--muted);padding:14px">Lade ${country.flag} ${country.name}…</p>`;

  const hasAccess = canAccessProducer(member);

  let standings = [];
  try { standings = await DB.fetchProducerStandings(country.id); }
  catch (e) { console.warn('fetchProducerStandings:', e.message); }
  const myRow  = standings.find(s => s.member_id === member.id);
  const myRank = myRow ? myRow.rank : null;
  const myInv  = myRow ? Number(myRow.total_invested) : 0;
  const rankPct = myRank ? (WORLD_BUILD_RANK_PCT[myRank] || 0) : 0;

  const levels = producerLevelsFor(country.id);
  const out    = producerLandOutput(country, levels, producerPerks(member));
  const myDelivStd  = Math.round(out.stdDeliv  * rankPct);
  const myDelivOeko = Math.round(out.oekoDeliv * rankPct);
  const myLohn = Math.round(producerLohnPerDay(levels) * rankPct);

  const held   = producerCountriesHeld(_producerInvCache, member.id);
  const limit  = producerCountryLimit(member.research);
  const atLimit = !(myInv > 0) && held >= limit;

  const slotRows = [1, 2, 3].map(rank => {
    const occ = standings.find(s => s.rank === rank);
    const medal = ['🥇','🥈','🥉'][rank - 1];
    const label = rank === 1 ? 'Regent' : rank === 2 ? 'Baurecht I' : 'Baurecht II';
    const who = occ ? `${_esc2(occ.member_name)} · ${_wfmt(occ.total_invested)} CC` : '(frei)';
    const mine = occ && occ.member_id === member.id ? ' cc-world-mine' : '';
    return `<div class="cc-world-slot${mine}">
      <span class="cc-world-slot-rank">${medal} ${label}</span>
      <span class="cc-world-slot-who">${who}</span>
      <span class="cc-world-slot-bonus">${Math.round(WORLD_BUILD_RANK_PCT[rank] * 100)}% Ernte</span>
    </div>`;
  }).join('');

  const trackRows = PRODUCER_TRACKS.map(tr => {
    const lvl = levels[tr.id] || 0;
    const cost = producerUpgradeCost(member, tr.id, lvl);
    let btn;
    if (!hasAccess)   btn = `<span class="cc-world-blocked">🔒 Konzession nötig</span>`;
    else if (lvl >= 5) btn = `<span class="cc-world-blocked">✓ max L5</span>`;
    else if (atLimit)  btn = `<span class="cc-world-blocked">🔒 Limit</span>`;
    else               btn = `<button class="cc-build-btn cc-world-bbtn" data-prod-track="${tr.id}">${lvl === 0 ? 'Bauen' : 'Ausbau L' + (lvl + 1)} · ${cost} 🫘</button>`;
    return `<div class="cc-world-bld">
      <span class="cc-world-bld-name">${tr.icon} ${tr.name} <em>L${lvl}</em></span>
      ${btn}
      <span class="cc-world-bld-eff">${tr.desc}</span>
    </div>`;
  }).join('');

  const statusLine = myRank
    ? `Dein Einfluss: <strong>Rang ${myRank}</strong> · ${_wfmt(myInv)} CC · Ernteanteil <strong>${Math.round(rankPct * 100)}%</strong>`
    : `Du hast hier noch keinen Einfluss — ziehe einen Bau-Strang hoch, um Einfluss zu sammeln (der Zahler wird Regent).`;
  const verderb = out.spoiled > 0
    ? `<p class="cc-world-pctnote cc-world-passive-fee">⚠️ ${out.spoiled} ${PRODUCER_UNIT}/Tag verderben (Transport ${out.kapazitaet} < Produktion ${out.rawOutput}) — Logistik 🚛 ausbauen.</p>`
    : '';

  sheet.innerHTML = `
    <div class="cc-world-sheet-head">
      <span>${country.flag} <strong>${_esc2(country.name)}</strong> · 🫘 ${_esc2(country.specialty)}</span>
      <button class="cc-world-close" data-world-close>✕</button>
    </div>
    <div class="cc-world-slots">${slotRows}</div>
    <p class="cc-world-status">${statusLine}</p>
    ${!hasAccess ? `<div class="cc-world-invest-locked">🔒 Braucht die Forschung <strong>🫘 Erzeuger-Konzession</strong> (alle Tier-2-Forschungen + 400 CC), um hier Plantagen zu bauen.</div>` : ''}
    ${atLimit ? `<div class="cc-world-invest-locked">🔒 Anbau-Limit erreicht: <strong>${held}/${limit}</strong> Anbauländer. Schließe ein höheres Tier ab (+2 je Tier).</div>` : ''}
    <div class="cc-world-section-title">🏭 Land-Produktion <span>(pro Tag, in ${PRODUCER_UNIT})</span></div>
    <p class="cc-world-pctnote">
      Output: <strong>${out.delivered} ${PRODUCER_UNIT}</strong>/Tag (🌾 Öko ${out.oekoDeliv} · Standard ${out.stdDeliv}) · Öko-Quote ${Math.round(out.oekoShare * 100)}% · Transport ${out.kapazitaet} ${PRODUCER_UNIT}/Tag.<br>
      ${myRank ? `Dein Anteil (${Math.round(rankPct * 100)}%): <strong>🌾 ${myDelivOeko} Öko · ${myDelivStd} Standard</strong> ${PRODUCER_UNIT}/Tag${myLohn > 0 ? ` · 💸 Löhne ${myLohn} CC/Tag` : ''}` : `Ohne Rang erhältst du keinen Ernteanteil.`}
    </p>
    ${verderb}
    <div class="cc-world-section-title">🌱 Bau-Stränge <span>(Land-Ebene, L0–L5)</span></div>
    <div class="cc-world-blds">${trackRows}</div>
    <p class="cc-world-pctnote">Investieren = Bau-Strang hochziehen: du zahlst CC, das Land-Level steigt für alle, und du sammelst Einfluss (Rang). Ernte-Einlösung folgt separat.</p>`;

  sheet.querySelector('[data-world-close]').onclick = () => sheet.classList.add('hidden');
  sheet.querySelectorAll('[data-prod-track]').forEach(b => b.onclick = () => {
    const tr = _producerTrack(b.dataset.prodTrack); if (tr) _handleUpgradeProducerTrack(country, member, tr);
  });
}

async function _handleUpgradeProducerTrack(country, member, track) {
  if (!canAccessProducer(member)) { showToast('🔒 Erzeuger-Konzession nötig.', 'error'); return; }
  const levels = producerLevelsFor(country.id);
  const lvl = levels[track.id] || 0;
  if (lvl >= 5) { showToast('Bereits maximal ausgebaut (L5).', 'info'); return; }
  const held = producerCountriesHeld(_producerInvCache, member.id);
  const isNewHere = !_producerInvCache.some(w => w.member_id === member.id && w.country_id === country.id && (Number(w.total_invested) || 0) > 0);
  if (isNewHere && held >= producerCountryLimit(member.research)) {
    showToast(`🔒 Anbau-Limit erreicht (${held}/${producerCountryLimit(member.research)}).`, 'error'); return;
  }
  const cost = producerUpgradeCost(member, track.id, lvl);
  let res;
  try { res = await DB.upgradeProducerTrack(member.id, country.id, track.id, cost); }
  catch (e) { showToast(e.message || 'Ausbau fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'max_level')          { showToast('Bereits maximal ausgebaut (L5).', 'info'); return; }
  if (!res?.ok) { showToast('Ausbau fehlgeschlagen', 'error'); return; }
  showToast(`🌱 ${track.name} in ${country.flag} ${country.name} auf L${res.level} ausgebaut!`, 'success');
  try { await DB.postMessage(`${member.name} baut ${track.icon} ${track.name} (L${res.level}) in ${country.flag} ${country.name} 🫘`, member.name); } catch (e) {}
  await _producerRefreshAndReopen(country, member);
}

// Nach Anbau-Aktion: Daten frisch, Karte neu, Anbau-Sheet erneut öffnen.
async function _producerRefreshAndReopen(country, member) {
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}
  const el = document.getElementById('imp-content');
  if (el) {
    el.innerHTML = '';
    await _buildWeltkarte(currentUserData || member, el);
    await _openProducerSheet(country, currentUserData || member);
  }
}

// ── 🫘 Ernte / Lager (Schritt 3) ──────────────────────────────────────────────
function producerLagerOf(member) {
  const r = (member && member.map_data && member.map_data.rohstoffe) || {};
  return { std: Number(r.std) || 0, oeko: Number(r.oeko) || 0, lastHarvest: r.lastHarvest || null };
}
// Tages-Ertrag des Mitglieds über alle Anbauländer, in denen es Rang 1–3 hält (Ein-Quelle-der-Wahrheit).
function producerMemberDailyYield(member) {
  const { rankMap } = producerRanksForMember(_producerInvCache, member.id);
  const perks = producerPerks(member);
  const lohnFactor = 1 + (perks.lohnMult || 0);   // Synergie: günstige Arbeitskräfte senken die Löhne
  let stdPerDay = 0, oekoPerDay = 0, lohnPerDay = 0;
  const perCountry = [];
  for (const c of PRODUCER_COUNTRIES) {
    const rank = rankMap[c.id]; if (!rank) continue;
    const pct = WORLD_BUILD_RANK_PCT[rank] || 0; if (!pct) continue;
    const levels = producerLevelsFor(c.id);
    const out = producerLandOutput(c, levels, perks);
    const s = out.stdDeliv * pct, o = out.oekoDeliv * pct, l = producerLohnPerDay(levels) * lohnFactor * pct;
    stdPerDay += s; oekoPerDay += o; lohnPerDay += l;
    if (s + o > 0 || l > 0) perCountry.push({ c, rank, std: s, oeko: o, lohn: l });
  }
  return { stdPerDay, oekoPerDay, lohnPerDay, perCountry, perks };
}
const _r1 = (n) => Math.round(n * 10) / 10;

// UTC-Tages-Key, konsistent zur SQL (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')).
function _supplyTodayKey() { return new Date().toISOString().slice(0, 10); }

// Bohnen-Tagespreis-Faktor 0.70–1.40. PORTABLER Hash — MUSS identisch zur SQL sell_beans sein
// (h = Σ (h*31 + charCode) mod 100000 über `<UTC-Tag>:<member_id>`), damit Anzeige == Auszahlung.
function _beanFactor(memberId) {
  const s = _supplyTodayKey() + ':' + memberId;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return Math.round((0.70 + 0.70 * (h / 100000)) * 100) / 100;
}
function producerBeanPrices(memberId, perks) {
  const f = _beanFactor(memberId); const pk = perks || {};
  return {
    factor: f,
    oeko: Math.round(3.0 * f * (1 + (pk.oekoPriceMult || 0)) * 100) / 100,
    std:  Math.round(1.0 * f * (1 + (pk.stdPriceMult  || 0)) * 100) / 100,
  };
}

// Konsum-Tageseinkommen des Mitglieds (perDay + perCup×Referenz-Tassen) — Basis für den Versorgungsbonus.
function producerKonsumBasis(member) {
  const { rankMap } = worldRanksForMember(_worldInvCache, member.id);
  const perDay = ((typeof calcWorldPerDay === 'function' ? calcWorldPerDay(rankMap) : 0) || 0)
               + ((typeof calcWorldBuildingPerDay === 'function' ? calcWorldBuildingPerDay(rankMap, _worldBldCache) : 0) || 0);
  const perCup = ((typeof calcWorldPerCup === 'function' ? calcWorldPerCup(rankMap) : 0) || 0)
               + ((typeof calcWorldBuildingPerCup === 'function' ? calcWorldBuildingPerCup(rankMap, _worldBldCache) : 0) || 0);
  return Math.round((perDay + perCup * SUPPLY_CUPS_REF) * 100) / 100;
}
// Vorschau für Panel + Button-Gating (Formel identisch zur SQL claim_supply — Ein-Quelle-der-Wahrheit).
function producerSupplyPreview(member) {
  const basis  = producerKonsumBasis(member);
  const lager  = producerLagerOf(member);
  const bedarf = Math.round(0.5 * basis);
  const oekoUse = Math.min(lager.oeko, bedarf);
  const stdUse  = Math.min(lager.std, Math.max(0, bedarf - oekoUse));
  const pct     = Math.min(40, oekoUse * 0.8 + stdUse * 0.3);
  const bonus   = Math.round(pct / 100 * basis);
  const already = ((member.map_data && member.map_data.rohstoffe && member.map_data.rohstoffe.supplyLast) || '') === _supplyTodayKey();
  const activePct = (member.map_data && member.map_data.rohstoffe && member.map_data.rohstoffe.supplyPct) || 0;
  return { basis, bedarf, oekoUse, stdUse, pct, bonus, already, activePct };
}

// 💰 2c: Plantagen-Wirtschaftlichkeit — macht den CC-Effekt der Anbauländer nachvollziehbar.
// Nutzt producerMemberDailyYield (Produktion + Löhne je Land/Tag) + producerBeanPrices (CC-Wert
// der Bohnen). „Marktwert" = Tagesernte × aktueller Bohnen-Tagespreis (realisiert durch Verkauf
// ODER Märkte-Versorgung — dort ggf. höher). Netto = Marktwert − Plantagen-Löhne.
function _renderProducerWirtschaft(member, y) {
  if (!y || !y.perCountry || !y.perCountry.length) return '';
  const p = producerBeanPrices(member.id, y.perks);
  const posC = '#9FE1CB', negC = '#e0795a';
  let totProd = 0, totVal = 0, totLohn = 0;
  const rows = y.perCountry.map(pc => {
    const prod = pc.std + pc.oeko;
    const val  = pc.oeko * p.oeko + pc.std * p.std;
    const net  = val - pc.lohn;
    totProd += prod; totVal += val; totLohn += pc.lohn;
    return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:.72rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <span>${pc.c.flag} ${_esc2(pc.c.name)} <span style="opacity:.6">R${pc.rank}</span></span>
      <span style="text-align:right">🫘 ${_r1(prod)} → ~${_r1(val)} CC${pc.lohn > 0 ? ` − 💸 ${_r1(pc.lohn)}` : ''} = <strong style="color:${net >= 0 ? posC : negC}">${net >= 0 ? '+' : ''}${_r1(net)} CC</strong></span>
    </div>`;
  }).join('');
  const totNet = totVal - totLohn;
  return `
    <div class="cc-world-section-title">💰 Plantagen-Wirtschaftlichkeit <span>(Marktwert bei Tagespreis 🌾${p.oeko}/${p.std})</span></div>
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:8px 10px;margin-bottom:8px">
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.74rem;margin-bottom:5px">
        <span>Produktion <strong>+${_r1(totProd)} ${PRODUCER_UNIT}/Tag</strong></span>
        <span>Marktwert <strong>+${_r1(totVal)} CC/Tag</strong></span>
        ${totLohn > 0 ? `<span>Löhne <strong style="color:${negC}">−${_r1(totLohn)} CC/Tag</strong></span>` : ''}
        <span>Netto <strong style="color:${totNet >= 0 ? posC : negC}">${totNet >= 0 ? '+' : ''}${_r1(totNet)} CC/Tag</strong></span>
      </div>
      ${rows}
      <p class="cc-world-pctnote" style="margin:5px 0 0">„Marktwert" = Wert der Tagesernte zum aktuellen Bohnen-Tagespreis. Realisiert wird er über 🫘➡️💰 Verkauf oder 🏪 Märkte-Versorgung (dort ggf. höher).</p>
    </div>`;
}

function _renderProducerPanel(member) {
  const holds = producerCountriesHeld(_producerInvCache, member.id);
  if (!canAccessProducer(member) && holds === 0) return ''; // irrelevant → nichts anzeigen
  const lager = producerLagerOf(member);
  const y = producerMemberDailyYield(member);
  const totalPerDay = _r1(y.stdPerDay + y.oekoPerDay);
  const listing = y.perCountry.map(p => `${p.c.flag} ${p.c.name} (R${p.rank})`).join(', ') || '—';
  const canHarvest = totalPerDay > 0;
  return `
    <div class="cc-world-section-title">🫘 Rohstoff-Lager <span>(Rohkaffee in ${PRODUCER_UNIT} = Coffee Tons)</span></div>
    <div class="cc-producer-lager">
      <span>🌾 Öko: <strong>${lager.oeko}</strong> ${PRODUCER_UNIT}</span>
      <span>🫘 Standard: <strong>${lager.std}</strong> ${PRODUCER_UNIT}</span>
    </div>
    <p class="cc-world-pctnote">
      Tages-Ertrag: <strong>~${totalPerDay} ${PRODUCER_UNIT}</strong>/Tag (🌾 ${_r1(y.oekoPerDay)} · ${_r1(y.stdPerDay)})${y.lohnPerDay > 0 ? ` · 💸 Löhne ~${_r1(y.lohnPerDay)} CC/Tag` : ''}<br>
      Aus: ${listing}
    </p>
    ${_renderProducerWirtschaft(member, y)}
    ${(y.perks && y.perks.active.length) ? `<p class="cc-world-pctnote">🔗 <strong>Aktive Konsum→Anbau-Synergien:</strong> ${y.perks.active.map(a => `${a.icon} ${_esc2(a.desc)}`).join(' · ')}</p>` : ''}
    ${canHarvest
      ? `<p class="cc-world-pctnote">✅ Ernte läuft <strong>automatisch</strong>: Beim Öffnen der Weltkarte wandert der Ertrag <strong>aller</strong> deiner Anbauländer ins Lager (Löhne werden verrechnet) — kein Einsammeln, kein Länder-Klick nötig.</p>`
      : `<p class="cc-world-pctnote">Baue Plantagen in Anbauländern (🥇 Rang nötig), um Rohkaffee zu ernten.</p>`}
    ${_renderSupplySection(member)}
    ${_renderSellSection(member)}`;
}

// 🫘➡️💰 Brücke 2: Überschuss-Bohnen an der Kaffeebörse zu Tagespreis verkaufen.
function _renderSellSection(member) {
  const lager = producerLagerOf(member);
  if (lager.oeko <= 0 && lager.std <= 0) return '';
  const p = producerBeanPrices(member.id, producerPerks(member));
  const oekoGet = Math.round(lager.oeko * p.oeko);
  const stdGet  = Math.round(lager.std * p.std);
  const trend = p.factor >= 1.15 ? '📈 Hoch' : p.factor <= 0.85 ? '📉 Tief' : '➖ Normal';
  return `
    <div class="cc-world-section-title">🫘➡️💰 Bohnen-Verkauf <span>(Kaffeebörse · ${trend})</span></div>
    <p class="cc-world-pctnote">Tagespreis: 🌾 Öko <strong>${p.oeko}</strong> · Standard <strong>${p.std}</strong> CC/${PRODUCER_UNIT} (Faktor ${p.factor}×).</p>
    <div class="cc-boerse-actions">
      ${lager.oeko > 0 ? `<button class="cc-build-btn cc-world-bbtn" data-prod-sell="oeko">🌾 ${lager.oeko} Öko → +${oekoGet} CC</button>` : ''}
      ${lager.std > 0 ? `<button class="cc-build-btn cc-world-bbtn" data-prod-sell="std">🫘 ${lager.std} Std → +${stdGet} CC</button>` : ''}
    </div>`;
}

async function _handleSellBeans(member, kind) {
  const lager = producerLagerOf(member);
  const sellOeko = kind === 'oeko' ? lager.oeko : 0;
  const sellStd  = kind === 'std'  ? lager.std  : 0;
  if (sellOeko + sellStd <= 0) { showToast('Kein Vorrat zu verkaufen.', 'info'); return; }
  const perks = producerPerks(member);
  let res;
  try { res = await DB.sellBeans(member.id, sellOeko, sellStd, 1 + (perks.oekoPriceMult || 0), 1 + (perks.stdPriceMult || 0)); }
  catch (e) { showToast(e.message || 'Verkauf fehlgeschlagen', 'error'); return; }
  if (res?.error)   { showToast('Verkauf fehlgeschlagen: ' + res.error, 'error'); return; }
  if (res?.nothing) { showToast('Kein Vorrat zu verkaufen.', 'info'); return; }
  const sold = [];
  if (res.sold_oeko > 0) sold.push(`🌾 ${res.sold_oeko}`);
  if (res.sold_std > 0)  sold.push(`🫘 ${res.sold_std}`);
  showToast(`💰 Verkauft: ${sold.join(' · ')} ${PRODUCER_UNIT} → +${res.proceeds} CC`, 'success');
  try { await DB.appendTodayLogFresh(member.id, [{ label: '🫘➡️💰 Bohnen-Verkauf', amount: res.proceeds, cat: 'anbau', detail: 'Kaffeebörse' }]); } catch (e) {}
  await _producerRefreshAndReopenPanel(member);
}

// 🏪 Brücke 1: Bohnen → Konsum-Bonus (nur wenn der Spieler Konsum-Märkte hat).
function _renderSupplySection(member) {
  const sup = producerSupplyPreview(member);
  if (sup.basis <= 0) return '';
  let body;
  if (sup.already) {
    body = `✅ Heute bereits versorgt — <strong>+${Math.round(sup.activePct)}%</strong> aktiv.`;
  } else if (sup.bonus >= 1) {
    body = `Prognose: verbraucht 🌾 ${sup.oekoUse} · ${sup.stdUse} Standard → <strong>+${Math.round(sup.pct)}%</strong> ≈ <strong>+${sup.bonus} CC</strong> heute.`;
  } else if (sup.oekoUse + sup.stdUse < 1) {
    body = `Kein Rohkaffee im Lager — erst ernten, dann versorgen.`;
  } else {
    body = `Dein Konsum-Einkommen ist noch zu klein für einen spürbaren Bonus — erobere mehr Konsum-Länder, dann lohnt sich die Versorgung.`;
  }
  return `
    <div class="cc-world-section-title">🏪 Märkte versorgen <span>(Bohnen → Konsum-Bonus, max 40 %)</span></div>
    <p class="cc-world-pctnote">Bedarf heute: <strong>${sup.bedarf} ${PRODUCER_UNIT}</strong> (Öko zuerst) · Konsum-Tageseinkommen ~${_r1(sup.basis)} CC.<br>${body}</p>
    ${(!sup.already && sup.bonus >= 1) ? `<button class="cc-build-btn" data-prod-supply="1">🏪 Märkte versorgen (+${sup.bonus} CC)</button>` : ''}`;
}

async function _handleClaimSupply(member) {
  const basis = producerKonsumBasis(member);
  if (basis <= 0) { showToast('Du hast noch keine Konsum-Märkte (Welt-Rang nötig).', 'info'); return; }
  let res;
  try { res = await DB.claimSupply(member.id, basis); }
  catch (e) { showToast(e.message || 'Versorgung fehlgeschlagen', 'error'); return; }
  if (res?.error)   { showToast('Versorgung fehlgeschlagen: ' + res.error, 'error'); return; }
  if (res?.already) { showToast('✅ Du hast deine Märkte heute schon versorgt.', 'info'); return; }
  if (res?.nothing) { showToast('🫘 Nicht genug Bohnen für einen spürbaren Versorgungsbonus.', 'info'); return; }
  showToast(`🏪 Märkte versorgt: +${Math.round(res.pct)}% → +${res.bonus} CC (🌾 ${res.oeko_use} · ${res.std_use} verbraucht)`, 'success');
  try { await DB.appendTodayLogFresh(member.id, [{ label: `🏪 Versorgungsbonus (+${Math.round(res.pct)}%)`, amount: res.bonus, cat: 'anbau', detail: 'Anbau → Konsum-Märkte' }]); } catch (e) {}
  await _producerRefreshAndReopenPanel(member);
}

// Ernte läuft AUTOMATISCH: beim Öffnen der Weltkarte wandert der aufgelaufene Ertrag ins Lager
// (Löhne verrechnet). Server ist über das Zeit-Delta idempotent → mehrfaches Aufrufen doppelt
// nicht. Kurzer Throttle gegen Refresh-Spam nach Aktionen (Upgrade/Verkauf lösen ein Rebuild aus).
let _lastAutoHarvestAt = 0;
async function _maybeAutoHarvest(member) {
  if (Date.now() - _lastAutoHarvestAt < 15000) return null;
  _lastAutoHarvestAt = Date.now();
  const y = producerMemberDailyYield(member);
  if ((y.stdPerDay + y.oekoPerDay) <= 0) return null; // keine Produktion → nichts zu ernten
  let res;
  try { res = await DB.claimHarvest(member.id, y.stdPerDay, y.oekoPerDay, y.lohnPerDay); }
  catch (e) { return null; }
  if (!res || res.error || res.nothing) return null;
  // Lokal patchen (Lager + Coins), damit das gleich gerenderte Panel den frischen Stand zeigt.
  const md = { ...(member.map_data || {}) };
  md.rohstoffe = { ...(md.rohstoffe || {}), std: res.lager_std, oeko: res.lager_oeko };
  member.map_data = md;
  if (currentUserData) {
    currentUserData = { ...currentUserData, map_data: md, coins: (res.coins_left != null ? res.coins_left : currentUserData.coins) };
    if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: currentUserData.coins });
  }
  const parts = [];
  if (res.oeko > 0) parts.push(`🌾 ${res.oeko} Öko`);
  if (res.std > 0)  parts.push(`🫘 ${res.std} Std`);
  showToast(`🫘 Ernte automatisch eingesammelt: ${parts.join(' · ')} ${PRODUCER_UNIT}${res.lohn > 0 ? ` (−${res.lohn} CC Löhne)` : ''}`, 'success');
  if (res.lohn > 0) { try { await DB.appendTodayLogFresh(member.id, [{ label: '💸 Plantagen-Löhne', amount: -res.lohn, cat: 'anbau', detail: 'Anbauland-Betrieb' }]); } catch (e) {} }
  try { await _checkProducerAchievements(member, res); } catch (e) { /* non-critical */ }
  return res;
}

// 🏆 Bohnen-Lager-Meilensteine (CT) — ad-hoc bei der Ernte vergeben (condition:null in achievements.js).
async function _checkProducerAchievements(member, res) {
  const existing = (currentUserData && currentUserData.achievements) || member.achievements || {};
  const lagerTotal = (res.lager_std || 0) + (res.lager_oeko || 0);
  const toGrant = {};
  if (!existing.prod_first) toGrant.prod_first = true;
  if (!existing.prod_100 && lagerTotal >= 100) toGrant.prod_100 = true;
  if (!existing.prod_500 && lagerTotal >= 500) toGrant.prod_500 = true;
  if (!existing.prod_1000 && lagerTotal >= 1000) toGrant.prod_1000 = true;
  if (!existing.prod_oeko_100 && (res.lager_oeko || 0) >= 100) toGrant.prod_oeko_100 = true;
  const ids = Object.keys(toGrant);
  if (!ids.length) return;
  await DB.grantAchievements(member.id, toGrant);
  if (currentUserData) currentUserData = { ...currentUserData, achievements: { ...existing, ...toGrant } };
  for (const id of ids) {
    const a = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(x => x.id === id);
    if (a) showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success');
  }
}

// Rebuild der Welt-View nach Ernte (kein Länder-Sheet nötig).
async function _producerRefreshAndReopenPanel(member) {
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}
  const el = document.getElementById('imp-content');
  if (el) { el.innerHTML = ''; await _buildWeltkarte(currentUserData || member, el); }
}

// Nach einer Aktion: Coins/Header aktualisieren, Karte neu einfärben, Panel erneut öffnen
async function _worldRefreshAndReopen(country, member) {
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}
  const el = document.getElementById('imp-content');
  if (el) {
    el.innerHTML = '';
    await _buildWeltkarte(currentUserData || member, el);
    if (country) await _openCountrySheet(country, currentUserData || member);
  }
}

async function _handleBuildWorld(country, member, def) {
  const cost = _worldCost(member, def.cost);
  let res;
  try { res = await DB.buildWorldStructure(member.id, country.id, def.id, cost, false); }
  catch (e) { showToast(e.message || 'Bau fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'already_built')      { showToast('Schon gebaut.', 'error'); return; }
  if (res?.error === 'rank_required')      { showToast('🔒 Nur wer im Land Einfluss hat (Top 3), darf bauen — investiere erst.', 'error'); return; }
  if (!res?.ok) { showToast('Bau fehlgeschlagen', 'error'); return; }
  const taxMsg = res.tax_paid > 0 ? ` (${res.tax_paid} CC Steuer${res.tax_receiver ? ' an ' + res.tax_receiver : ''})` : '';
  showToast(`🏗️ ${def.name} in ${country.flag} ${country.name} gebaut!${taxMsg}`, 'success');
  try { await DB.postMessage(`${member.name} baut ${def.icon} ${def.name} in ${country.flag} ${country.name}!${taxMsg} 🏗️`, member.name); } catch (e) {}
  // CC-Ausgabe ins Tages-Log/Netto — build_world_structure zieht p_cost serverseitig ab (Steuer
  // wird daraus umgeleitet, nicht zusätzlich), loggt aber KEIN todayLog. Fresh-Merge gegen Clobbering.
  try { await DB.appendTodayLogFresh(member.id, [{ label: `🏗️ Welt-Bau: ${def.name} — ${country.flag} ${country.name}`, amount: -cost, cat: 'weltbau', detail: 'Welt-Gebäude', invest: true }]); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleUpgradeWorld(country, member, def) {
  const cost = _worldCost(member, Math.round(def.cost * 0.5));
  let res;
  try { res = await DB.buildWorldStructure(member.id, country.id, def.id, cost, true); }
  catch (e) { showToast(e.message || 'Ausbau fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'cannot_upgrade')     { showToast('Ausbau nicht möglich.', 'error'); return; }
  if (res?.error === 'rank_required')      { showToast('🔒 Nur wer im Land Einfluss hat (Top 3), darf ausbauen — investiere erst.', 'error'); return; }
  if (!res?.ok) { showToast('Ausbau fehlgeschlagen', 'error'); return; }
  const taxMsg = res.tax_paid > 0 ? ` (${res.tax_paid} CC Steuer${res.tax_receiver ? ' an ' + res.tax_receiver : ''})` : '';
  showToast(`⬆️ ${def.name} auf Level 2 ausgebaut!${taxMsg}`, 'success');
  try { await DB.postMessage(`${member.name} baut ${def.icon} ${def.name} in ${country.flag} ${country.name} aus!${taxMsg} ⬆️`, member.name); } catch (e) {}
  // CC-Ausgabe ins Tages-Log/Netto (build_world_structure loggt server-seitig nicht) — Fresh-Merge.
  try { await DB.appendTodayLogFresh(member.id, [{ label: `⬆️ Welt-Ausbau: ${def.name} — ${country.flag} ${country.name}`, amount: -cost, cat: 'weltbau', detail: 'Welt-Gebäude', invest: true }]); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleBuyGarde(country, member) {
  let res;
  try { res = await DB.buyGarde(member.id, country.id); }
  catch (e) { showToast(e.message || 'Garde fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast(`Nicht genug CC (kostet ${res.cost})!`, 'error'); return; }
  if (res?.error === 'no_investment')      { showToast('Investiere zuerst in dieses Land.', 'error'); return; }
  if (res?.error === 'already_max')        { showToast('Garde ist bereits auf Stufe 2 (Maximum).', 'error'); return; }
  if (res?.error === 'not_rank1')          { showToast('Nur der amtierende Regent (Rang 1) kann eine Garde stationieren/ausbauen.', 'error'); return; }
  if (!res?.ok) { showToast('Garde fehlgeschlagen', 'error'); return; }
  const msg = res.level === 2
    ? `⬆️ Kaffee-Garde in ${country.flag} ${country.name} auf Stufe 2 ausgebaut!`
    : `☕ Kaffee-Garde in ${country.flag} ${country.name} stationiert!`;
  showToast(msg, 'success');
  try { await DB.postMessage(`${member.name}: ${msg}`, member.name); } catch (e) {}
  // Garde-Kosten ins Tages-Log ("☕ Heute erhalten") — wurden bisher nirgends geloggt,
  // obwohl buy_garde() die Coins serverseitig korrekt abzieht. Nicht-kritisch: ein Fehler
  // hier darf den Garde-Kauf-Flow nicht beeinträchtigen (Coins sind bereits abgebucht).
  if (res.cost > 0) {
    try {
      const mdLog = DB.appendTodayLog(member.map_data || {},
        [{ label: `${res.level === 2 ? '⬆️ Garde-Ausbau' : '☕ Garde stationiert'} — ${country.flag} ${country.name}`, amount: -res.cost, cat: 'weltbau', invest: true }]);
      await DB.updateMapData(member.id, mdLog);
      if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), map_data: mdLog };
    } catch (e) { /* non-critical */ }
  }
  await _worldRefreshAndReopen(country, member);
}

// ── Weltbündnisse (plans/PLAN_weltbuendnisse.md) ─────────────────────────────
async function _handleProposeAlliance(type, country, governor, member, myCountryId, offerCc, minOffer) {
  if (!myCountryId) { showToast('Werde zuerst selbst Regent eines Landes.', 'error'); return; }
  const def = (typeof allianceDef === 'function') ? allianceDef(type) : null;
  const offer = Math.floor(parseFloat(offerCc) || 0);
  const requiredOffer = minOffer != null ? minOffer
    : ((typeof allianceMinOffer === 'function') ? allianceMinOffer(country.id, _worldInvCache, _worldBldCache) : ALLIANCE_MIN_OFFER);
  if (type === 'handel' && offer < requiredOffer) {
    showToast(`Handelsbündnis mit ${country.flag} ${country.name} braucht mind. ${requiredOffer} CC als Geschenk-Angebot.`, 'error');
    return;
  }
  let res;
  try { res = await DB.proposeAlliance(member.id, type, myCountryId, governor.member_id, country.id, offer); }
  catch (e) { showToast(e.message || 'Vorschlag fehlgeschlagen', 'error'); return; }
  if (res?.error === 'already_exists')      { showToast('Es gibt bereits ein Bündnis dieses Typs.', 'error'); return; }
  if (res?.error === 'not_rank1_self')      { showToast('Du regierst dein Land gerade nicht (mehr).', 'error'); return; }
  if (res?.error === 'not_rank1_target')    { showToast(`${governor.member_name} regiert ${country.name} gerade nicht (mehr).`, 'error'); return; }
  if (res?.error === 'self')                { showToast('Du kannst kein Bündnis mit dir selbst schließen.', 'error'); return; }
  if (res?.error === 'offer_too_low')       { showToast(`Angebot zu niedrig (Server-Minimum ${ALLIANCE_MIN_OFFER} CC).`, 'error'); return; }
  if (!res?.ok || !def) { showToast('Bündnis-Vorschlag fehlgeschlagen', 'error'); return; }
  const offerTxt = (type === 'handel') ? ` (${offer} CC Geschenk-Angebot)` : '';
  showToast(`${def.icon} Vorschlag an ${governor.member_name} gesendet.`, 'success');
  try { await DB.postMessage(`${def.icon} ${member.name} schlägt ${governor.member_name} ein ${def.name} vor${offerTxt}.`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

async function _handleRespondAlliance(allianceId, accept, country, member) {
  let res;
  try { res = await DB.respondAlliance(member.id, allianceId, accept); }
  catch (e) { showToast(e.message || 'Aktion fehlgeschlagen', 'error'); return; }
  if (res?.error === 'offer_unfunded') { showToast('Der Antragsteller hat gerade nicht mehr genug CC für sein Angebot.', 'error'); return; }
  if (res?.error === 'not_yours') { showToast('Dieser Antrag richtete sich an den vorherigen Regenten, nicht an dich.', 'error'); return; }
  if (!res?.ok) { showToast('Aktion fehlgeschlagen', 'error'); return; }
  const def = (typeof allianceDef === 'function') ? allianceDef(res.type) : null;
  const otherId = res.member_a === member.id ? res.member_b : res.member_a;
  const otherName = ((typeof appData !== 'undefined' && appData?.users) || []).find(u => u.id === otherId)?.name || '—';
  if (def) {
    const giftTxt = (accept && res.offer_cc > 0) ? ` (+${res.offer_cc} CC Geschenk erhalten)` : '';
    const msg = accept
      ? `${def.icon} ${member.name} nimmt das ${def.name} von ${otherName} an!${giftTxt}`
      : `${def.icon} ${member.name} lehnt das ${def.name} von ${otherName} ab.`;
    showToast(accept ? `${def.icon} Bündnis aktiv!${giftTxt}` : 'Abgelehnt.', accept ? 'success' : 'info');
    try { await DB.postMessage(msg, member.name); } catch (e) {}
  }
  await _worldRefreshAndReopen(country, member);
}

async function _handleWorldInvest(country, member) {
  const input  = document.getElementById('cc-world-amount');
  const amount = Math.floor(parseFloat(input?.value || '0'));
  if (!amount || amount < WORLD_MIN_INVEST) { showToast(`Mindestens ${WORLD_MIN_INVEST} CC investieren!`, 'error'); return; }

  // ── Tier-Limit Safety-Net (auch wenn UI-Block umgangen wird) ──
  {
    const { rankMap: _safeRankMap } = worldRanksForMember(_worldInvCache, member.id);
    const _safeGovCount = Object.values(_safeRankMap).filter(r => r === 1).length;
    const _safeLimit    = worldCountryLimit(member.research);
    if (_safeRankMap[country.id] !== 1 && _safeGovCount >= _safeLimit) {
      showToast(`🔒 Länder-Limit (${_safeLimit}) erreicht — schließe das nächste Forschungs-Tier ab!`, 'error');
      return;
    }
  }

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
  if (res?.error === 'peace_pact_blocked') { showToast('🕊️ Ein Friedensbündnis schützt diesen Regenten gerade vor dir.', 'error'); return; }
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

// 🏦 Stille Anlage: CC anlegen (Ertrag ohne Rang-Einfluss). Atomar via invest_passive-RPC.
async function _handlePassiveInvest(country, member) {
  const input = document.getElementById('cc-world-passive-amount');
  const amount = Math.floor(Number(input && input.value) || 0);
  if (!amount || amount < WORLD_MIN_INVEST) { showToast(`Mindestens ${WORLD_MIN_INVEST} CC!`, 'error'); return; }
  if ((member.coins || 0) < amount) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  let res;
  try { res = await DB.investPassive(member.id, country.id, amount); }
  catch (e) { showToast(e.message || 'Anlage fehlgeschlagen', 'error'); return; }
  if (res?.error === 'not_enough_cc') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'bad_amount')    { showToast(`Mindestens ${WORLD_MIN_INVEST} CC!`, 'error'); return; }
  if (res?.error === 'cap_reached')   { showToast(`Anlage-Deckel: max. ${_wfmt(res.cap || WORLD_PASSIVE_CAP)} CC pro Land (mehr erhöht den Anteil nicht).`, 'error'); return; }
  if (!res?.ok) { showToast(res?.error === 'not_found' ? 'Konto nicht gefunden' : 'Anlage fehlgeschlagen — Backend evtl. nicht migriert', 'error'); return; }
  showToast(`🏦 ${amount} CC in ${country.flag} ${country.name} angelegt — wirft täglich passiv ab!`, 'success');
  try { await DB.postMessage(`${member.name} legt ${amount} CC still in ${country.flag} ${country.name} an 🏦`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

// 🏦 Stille Anlage auszahlen (20 % Bauherren-Entschädigung). Atomar via withdraw_passive-RPC.
async function _handlePassiveWithdraw(country, member) {
  const input = document.getElementById('cc-world-withdraw-amount');
  const here = (member.map_data && member.map_data.worldPassive && member.map_data.worldPassive[country.id]) || 0;
  const amount = Math.floor(Number(input && input.value) || 0);
  if (!amount || amount < 1) { showToast('Betrag zum Auszahlen angeben.', 'error'); return; }
  if (amount > here) { showToast(`Du hast hier nur ${_wfmt(here)} CC angelegt.`, 'error'); return; }
  let res;
  try { res = await DB.withdrawPassive(member.id, country.id, amount); }
  catch (e) { showToast(e.message || 'Auszahlung fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_capital') { showToast(`Du hast hier nur ${_wfmt(res.have || here)} CC angelegt.`, 'error'); return; }
  if (res?.error === 'bad_amount')           { showToast('Ungültiger Betrag.', 'error'); return; }
  if (!res?.ok) { showToast(res?.error === 'not_found' ? 'Konto nicht gefunden' : 'Auszahlung fehlgeschlagen — Backend evtl. nicht migriert', 'error'); return; }
  const feeTxt = res.fee > 0 ? ` (−${_wfmt(res.fee)} CC Entschädigung an ${res.recipients} Erbauer)` : '';
  showToast(`🏧 ${_wfmt(res.payout)} CC ausgezahlt${feeTxt}.`, 'success');
  try { await DB.postMessage(`${member.name} zahlt ${_wfmt(amount)} CC Stille Anlage aus ${country.flag} ${country.name} aus 🏧`, member.name); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}

// ═══════════════════════════════════════════════════════════════════════════
// Welt-Statistik + Entwicklungen (Ergaenzung_Statistik_Weltkarte)
// ═══════════════════════════════════════════════════════════════════════════

// Freie (noch nicht gebaute) Gebäude eines Landes
function worldFreeBuildings(countryId, byCountry) {
  const built = new Set(((byCountry || {})[countryId] || []).map(b => b.building_id));
  return (WORLD_BUILDINGS[countryId] || []).filter(d => !built.has(d.id));
}

// Höchste Roh-Investition (Rang-1-Schwelle) eines Landes
function worldTopInvest(investments, countryId) {
  let t = 0;
  for (const w of (investments || [])) if (w.country_id === countryId) t = Math.max(t, Number(w.total_invested) || 0);
  return t;
}

// Gesamtwert eines Landes: Summe ALLER Investitionen (aller Spieler) + Gebäudewert
// (Baukosten, L2 = ×1.5 wie in worldStatsForMember). Misst, wie "ausgebaut" ein Land ist —
// genutzt für die Mindest-Geschenkhöhe beim Handelsbündnis-Antrag (alliances.js).
function worldCountryValue(countryId, investments, byCountry) {
  let v = 0;
  for (const w of (investments || [])) if (w.country_id === countryId) v += Number(w.total_invested) || 0;
  for (const b of (byCountry?.[countryId] || [])) {
    const def = worldBuildingDef(countryId, b.building_id);
    if (def) v += def.cost * (b.level === 2 ? 1.5 : 1);
  }
  return Math.round(v);
}

// Aktueller Regierungs-Inhaber (Rang 1, effektiver Einfluss) eines Landes
function worldGovernorId(investments, countryId) {
  const list = (investments || []).filter(w => w.country_id === countryId);
  if (!list.length) return null;
  const top = Math.max(0, ...list.map(w => Number(w.total_invested) || 0));
  let best = null, bestE = -1;
  for (const w of list) {
    const e = (Number(w.total_invested) || 0) + _gardeBonus(w.garde_level || 0, top);
    if (e > bestE) { bestE = e; best = w.member_id; }
  }
  return best;
}

// Aggregierte Welt-Kennzahlen je Member. byCountry = worldBuildingsByCountry(rows)
// Baukosten-Summe aller vom Mitglied erbauten Länder-Gebäude (L1 + 50% für L2-Ausbau).
// Einzige Quelle der Formel — worldStatsForMember().bldSpent UND die Erbauer-Dividende
// (db.js) rechnen darüber, damit die Bezugsgröße nie auseinanderläuft. Braucht nur
// byCountry (die Gebäude), kein investments/rankMap-Fetch.
function worldBuilderSpent(byCountry, memberId) {
  let spent = 0;
  for (const [cid, list] of Object.entries(byCountry || {})) {
    for (const b of (list || [])) {
      if (b.member_id === memberId) {
        const def = worldBuildingDef(cid, b.building_id);
        if (def) spent += def.cost * (b.level === 2 ? 1.5 : 1); // L1 + 50% Ausbau
      }
    }
  }
  return Math.round(spent);
}

// ── 💰 Stille Anlage (Ertrag ohne Rang-Einfluss) ─────────────────────────────
// Kapital liegt in member.map_data.worldPassive = { [countryId]: betrag } — komplett
// getrennt von world_investments und damit von worldRanksForMember: verdrängt niemanden,
// zählt nicht auf den Rang. Der Tages-Ertrag wird clientseitig ins Passiv-Einkommen
// eingerechnet (db.js).
// Ertrags-Rework (PLAN_stille_anlage_rework, 2026-07-03): kein fester Zins mehr, sondern
// ein kapitalabhängiger ANTEIL am Gebäude-Einkommen des Landes. Anteilssatz = min(20 %,
// floor(Kapital/25)×0,4 %), Kapital gedeckelt bei WORLD_PASSIVE_CAP/Land. Additiv/neu
// geprägt (wie die bestehenden 100/50/20 %-Rang-Sätze) — schmälert weder Rang-Boni noch
// die Erbauer-Dividende. Länder ohne Gebäude werfen 0 ab.
const WORLD_PASSIVE_CAP = 1250;             // max Kapital/Land (mehr erhöht den Anteil nicht)
const WORLD_PASSIVE_STEP = 25;              // je 25 CC Kapital …
const WORLD_PASSIVE_STEP_RATE = 0.004;      // … +0,4 % Anteilssatz
const WORLD_PASSIVE_MAX_SHARE = 0.20;       // Deckel 20 %
function worldPassiveShare(capital) {
  return Math.min(WORLD_PASSIVE_MAX_SHARE,
    Math.floor((Number(capital) || 0) / WORLD_PASSIVE_STEP) * WORLD_PASSIVE_STEP_RATE);
}
// Gebäude-GESAMTeinkommen/Tag eines Landes — ROHwert (perDay × Level-Mult), OHNE
// Rang-Gewichtung (anders als calcWorldBuildingPerDay, die den WORLD_BUILD_RANK_PCT-Faktor
// eines Mitglieds einbezieht). Bezugsgröße der Stillen Anlage.
function worldCountryBuildingIncomePerDay(countryId, byCountry) {
  let s = 0;
  for (const blt of (byCountry?.[countryId] || [])) {
    const def = worldBuildingDef(countryId, blt.building_id);
    if (def) s += (def.perDay || 0) * _levelMult(blt.level);
  }
  return Math.round(s * 100) / 100;
}
function worldPassiveTotal(member) {
  const wp = (member && member.map_data && member.map_data.worldPassive) || {};
  let s = 0; for (const v of Object.values(wp)) s += Number(v) || 0;
  return Math.round(s * 100) / 100;
}
// Tages-Ertrag der Stillen Anlage — braucht jetzt byCountry (Gebäude je Land). Ohne
// byCountry (Backend nicht migriert / kein Gebäude im Land) → 0, kein Crash.
function worldPassivePerDay(member, byCountry) {
  const wp = (member && member.map_data && member.map_data.worldPassive) || {};
  let s = 0;
  for (const [cid, cap] of Object.entries(wp)) {
    const share = worldPassiveShare(cap);
    if (share <= 0) continue;
    s += worldCountryBuildingIncomePerDay(cid, byCountry) * share;
  }
  return Math.round(s * 100) / 100;
}
function worldPassivePerDayDetail(member, byCountry) {
  const wp = (member && member.map_data && member.map_data.worldPassive) || {};
  const parts = [];
  for (const [cid, cap] of Object.entries(wp)) {
    const share = worldPassiveShare(cap);
    if (share <= 0) continue;
    const inc = worldCountryBuildingIncomePerDay(cid, byCountry);
    if (inc <= 0) continue;
    const c = _worldById(cid);
    parts.push(`${c ? c.flag : ''} ${Math.round(share * 1000) / 10} % von ${Math.round(inc)} CC`);
  }
  return parts.length ? `🏦 ${parts.join(', ')} Gebäude-Einkommen` : '';
}

function worldStatsForMember(investments, byCountry, memberId) {
  const { rankMap } = worldRanksForMember(investments, memberId);
  const governments = Object.values(rankMap).filter(r => r === 1).length;
  const baurechte   = Object.values(rankMap).filter(r => r === 2 || r === 3).length;
  const invested    = worldInvestedTotal(investments, memberId);
  const perDay = calcWorldPerDay(rankMap) + calcWorldBuildingPerDay(rankMap, byCountry);
  const perCup = calcWorldPerCup(rankMap) + calcWorldBuildingPerCup(rankMap, byCountry);
  const myBld = [];
  for (const [cid, list] of Object.entries(byCountry || {})) {
    for (const b of list) if (b.member_id === memberId) {
      myBld.push({ cid, def: worldBuildingDef(cid, b.building_id), level: b.level });
    }
  }
  return {
    rankMap, governments, baurechte, ranks: Object.keys(rankMap).length,
    invested, perDay: Math.round(perDay * 100) / 100, perCup: Math.round(perCup * 100) / 100,
    myBld, bldSpent: worldBuilderSpent(byCountry, memberId),
  };
}

// Kompakte Welt-Zeile für die Imperium-Statistik (gibt '' wenn keine Welt-Aktivität)
function worldStatLineHTML(u, investments, byCountry) {
  if (typeof worldStatsForMember !== 'function') return '';
  const s = worldStatsForMember(investments, byCountry, u.id);
  if (!s.ranks && !s.myBld.length) return '';
  const bldIcons = s.myBld.map(b => (b.def ? b.def.icon : '')).join('');
  return `<div class="cc-stats-sub cc-stats-karte cc-stats-welt">`
    + `🌍 ${s.governments}🏛️ &nbsp;·&nbsp; ${s.ranks} Länder &nbsp;·&nbsp; 💰 ${_wfmt(s.invested)} inv.`
    + (s.myBld.length ? ` &nbsp;·&nbsp; 🏗️ ${s.myBld.length} ${bldIcons}` : '')
    + (s.perDay > 0 ? ` &nbsp;·&nbsp; +${_wfmt(s.perDay)}/Tag` : '')
    + (s.perCup > 0 ? ` &nbsp;·&nbsp; +${s.perCup}/Tasse` : '')
    + `</div>`;
}

// Offen/Zu-Zustand der Welt-Akkordeons — überlebt den Refresh nach Kauf/Aktion
let _worldAccOpen = { stats: true, gallery: false, devs: false, alliances: false };

// ── Ausführliches Welt-Statistik-Panel ───────────────────────────────────────
function _renderWeltStatistik(investments, byCountry, member, taxStats, users) {
  const list = (users || []).map(u => ({ u, s: worldStatsForMember(investments, byCountry, u.id) }))
    .filter(x => x.s.ranks || x.s.myBld.length || worldPassiveTotal(x.u) > 0 || (x.u.map_data?.worldDev?.fund?.principal || 0) > 0)
    .sort((a, b) => (b.s.governments - a.s.governments) || (b.s.invested - a.s.invested) || (b.s.perDay - a.s.perDay));
  if (!list.length) return `
    <details class="cc-world-acc" data-acc="stats"${_worldAccOpen.stats ? ' open' : ''}><summary>📊 Welt-Statistik</summary>
      <p class="cc-world-empty">Noch keine Welt-Aktivität in der Gruppe. Investiere als Erster!</p></details>
    <details class="cc-world-acc" data-acc="gallery"${_worldAccOpen.gallery ? ' open' : ''}><summary>🏛️ Länder &amp; Gebäude</summary>
      <p class="cc-world-empty">Noch keine Gebäude weltweit.</p></details>`;

  const hasTax = !!(taxStats && Object.keys(taxStats).length);

  const rows = list.map(({ u, s }) => {
    const govFlags = Object.entries(s.rankMap).filter(([, r]) => r === 1)
      .map(([cid]) => (_worldById(cid) ? _worldById(cid).flag : '')).join('');
    const t = (taxStats || {})[u.id] || {};
    const mine = u.id === member.id ? ' cc-world-mine' : '';
    const divTotal = u.map_data?.worldDividend?.totalReceived || 0;
    const anlage = worldPassiveTotal(u);
    const anlageYield = (typeof worldPassivePerDay === 'function') ? worldPassivePerDay(u, byCountry) : 0;
    const boerse = u.map_data?.worldDev?.fund?.principal || 0;
    const _lagerOeko = Number(u.map_data?.rohstoffe?.oeko) || 0;
    const _lagerStd  = Number(u.map_data?.rohstoffe?.std) || 0;
    const _lagerTot  = _lagerOeko + _lagerStd;
    return `<div class="cc-wstat-row${mine}">
      <div class="cc-wstat-name">${_esc2(u.name)} <span class="cc-wstat-flags">${govFlags}</span></div>
      <div class="cc-wstat-cells">
        <span title="Regierungen">🏛️ ${s.governments}</span>
        <span title="Länder mit Einfluss">🗺️ ${s.ranks}</span>
        <span title="investiert gesamt">💰 ${_wfmt(s.invested)}</span>
        <span title="errichtete Gebäude">🏗️ ${s.myBld.length}</span>
        <span title="Welt-Einkommen / Tag">📈 +${_wfmt(s.perDay)}</span>
        ${s.perCup > 0 ? `<span title="Welt-Einfluss pro Tasse (Länder-Ränge + rangabhängige Gebäude)">☕ +${s.perCup}/Tasse</span>` : ''}
        ${anlage > 0 ? `<span class="cc-wstat-anlage" title="Stille Anlage: ${_wfmt(anlage)} CC Kapital · Anteil am Gebäude-Einkommen">🏦 ${_wfmt(anlage)}${anlageYield > 0 ? ` (+${_wfmt(anlageYield)}/Tag)` : ''}</span>` : ''}
        ${boerse > 0 ? `<span class="cc-wstat-boerse" title="Kaffeebörse: ${_wfmt(boerse)} CC angelegtes Kapital">💹 ${_wfmt(boerse)}</span>` : ''}
        ${_lagerTot > 0 ? `<span class="cc-wstat-anbau" title="Rohkaffee-Lager: 🌾 ${_lagerOeko} Öko · ${_lagerStd} Standard ${PRODUCER_UNIT}">🫘 ${_wfmt(_lagerTot)} ${PRODUCER_UNIT}</span>` : ''}
        ${divTotal > 0 ? `<span class="cc-wstat-div" title="Erbauer-Dividende erhalten (gesamt)">💵 ${_wfmt(divTotal)}</span>` : ''}
        ${hasTax ? `<span class="cc-wstat-tax" title="Steuern erhalten (Woche · gesamt)">🪙 ${_wfmt(t.received_7d || 0)}·${_wfmt(t.received_total || 0)}</span>` : ''}
        ${hasTax ? `<span class="cc-wstat-tax" title="Steuern gezahlt (Woche · gesamt)">💸 ${_wfmt(t.paid_7d || 0)}·${_wfmt(t.paid_total || 0)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const nameOf = (id) => { const u = (users || []).find(x => x.id === id); return u ? u.name : '—'; };
  const gallery = WORLD_COUNTRIES.map(c => {
    const blds = (byCountry || {})[c.id] || [];
    const govId = worldGovernorId(investments, c.id);
    if (!blds.length && !govId) return '';
    const items = blds.map(b => {
      const d = worldBuildingDef(c.id, b.building_id);
      return d ? `<span class="cc-wgal-b" title="${_esc2(d.name)}${b.level === 2 ? ' · Lvl 2' : ''} · erbaut: ${_esc2(nameOf(b.member_id))}">${d.icon}${b.level === 2 ? '²' : ''}</span>` : '';
    }).join('');
    return `<div class="cc-wgal-row">
      <span class="cc-wgal-flag">${c.flag}</span>
      <span class="cc-wgal-name">${_esc2(c.name)}${govId ? ` <em>👑 ${_esc2(nameOf(govId))}</em>` : ''}</span>
      <span class="cc-wgal-blds">${items || '<span class="cc-wgal-none">—</span>'}</span>
    </div>`;
  }).filter(Boolean).join('');

  const taxHint = hasTax ? '' : `<p class="cc-world-taxhint">🪙 Steuer-Statistik aktiv nach SQL-Migration <code>19d_world_tax_log</code>.</p>`;

  return `
    <details class="cc-world-acc" data-acc="stats"${_worldAccOpen.stats ? ' open' : ''}><summary>📊 Welt-Statistik</summary>
      <div class="cc-wstat-list">${rows}</div>
      ${taxHint}
    </details>
    <details class="cc-world-acc" data-acc="gallery"${_worldAccOpen.gallery ? ' open' : ''}><summary>🏛️ Länder &amp; Gebäude</summary>
      <div class="cc-wgal">${gallery || '<p class="cc-world-empty">Noch keine Gebäude weltweit.</p>'}</div>
    </details>`;
}

// ── Entwicklungen (kaufbare Welt-Boni / Analysen) ─────────────────────────────
const WORLD_DEVS = [
  { id: 'spionage',       icon: '🔍', name: 'Spionage-Netzwerk', cost: 200, desc: 'Deckt günstigste & teuerste Länder, den besten Bauplatz und das am leichtesten zu erobernde Land auf.' },
  { id: 'investor',       icon: '🔭', name: 'Investor-Analyse',  cost: 400, desc: 'Zeigt, wo noch Gebäude frei sind und wo der höchste Ertrag wartet.' },
  { id: 'garde_akademie', icon: '🛡️', name: 'Garde-Akademie',    cost: 400, desc: '+10 % auf alle deine Welt-Einkommen (Einfluss & Gebäude).' },
  { id: 'steuerberater',  icon: '💼', name: 'Steuerberater',     cost: 300, desc: 'Halbiert deine Bausteuer beim Bauen in fremden Ländern (20 % → 10 %).' },
  { id: 'boerse',         icon: '💹', name: 'Kaffeebörse-Zugang', cost: 300, desc: 'Schaltet die Kaffeebörse frei: CC anlegen und täglich Dividende kassieren.' },
  { id: 'soeldner',       icon: '⚔️', name: 'Söldner-Kontakt',   cost: 300, desc: 'Schaltet Sabotage frei: lege fremde Regenten in einem Land für einige Tage lahm.' },
];

// Söldner-Sabotage: Kosten pro Einsatz + Dauer
const SABOTAGE_COST = 80;
const SABOTAGE_DAYS = 3;

// ── Kaffeebörse (PvE-Fonds) ──────────────────────────────────────────────────
const FUND_MAX = 20000;
function _todayKeyW() { return (typeof _todayKey === 'function') ? _todayKey() : new Date().toISOString().slice(0, 10); }
function _fundHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
// Deterministische Tagesrendite je Spieler (0,5 %–1,7 %), kein Reroll durch Reload
function _fundRate(memberId) {
  return Math.round((0.005 + 0.012 * _fundHash(_todayKeyW() + ':' + memberId)) * 1000) / 1000;
}
function _fundOf(member) {
  const f = member && member.map_data && member.map_data.worldDev && member.map_data.worldDev.fund;
  return { principal: (f && f.principal) || 0, lastDiv: (f && f.lastDiv) || '', mode: (f && f.mode) || 'payout' };
}

function _spionageInfo(investments, byCountry, member) {
  const tops = WORLD_COUNTRIES.map(c => ({ c, top: worldTopInvest(investments, c.id) }));
  const withInv = tops.filter(x => x.top > 0);
  const cheapestCountry = (withInv.length ? withInv : tops).slice().sort((a, b) => a.top - b.top)[0];
  const dearestCountry  = tops.slice().sort((a, b) => b.top - a.top)[0];
  let cb = null; // bester (günstigster) freier Bauplatz
  for (const c of WORLD_COUNTRIES) for (const d of worldFreeBuildings(c.id, byCountry)) if (!cb || d.cost < cb.d.cost) cb = { c, d };
  const { rankMap } = worldRanksForMember(investments, member.id);
  let cc = null; // leichteste Eroberung (kleinste Lücke zu Rang 1)
  for (const c of WORLD_COUNTRIES) {
    if (rankMap[c.id] === 1) continue;
    const top  = worldTopInvest(investments, c.id);
    const mine = (investments || []).filter(w => w.country_id === c.id && w.member_id === member.id)
      .reduce((s, w) => s + (Number(w.total_invested) || 0), 0);
    const gap = Math.max(WORLD_MIN_INVEST, Math.floor(top - mine) + 1);
    if (!cc || gap < cc.gap) cc = { c, gap };
  }
  return { cheapestCountry, dearestCountry, cb, cc };
}

function _investorInfo(byCountry) {
  const free = WORLD_COUNTRIES.map(c => ({ c, defs: worldFreeBuildings(c.id, byCountry) })).filter(x => x.defs.length);
  let best = null; // höchster Ertrag unter freien Bauplätzen (perDay + perCup·5 als Heuristik)
  for (const c of WORLD_COUNTRIES) for (const d of worldFreeBuildings(c.id, byCountry)) {
    const y = (d.perDay || 0) + (d.perCup || 0) * 5;
    if (!best || y > best.y) best = { c, d, y };
  }
  return { free, best };
}

function _renderWeltEntwicklungen(member, investments, byCountry) {
  const owned = (member.map_data && member.map_data.worldDev) || {};
  const cards = WORLD_DEVS.map(dev => {
    if (!owned[dev.id]) {
      return `<div class="cc-wdev">
        <div class="cc-wdev-head"><span>${dev.icon} <strong>${_esc2(dev.name)}</strong></span>
          <button class="cc-build-btn cc-world-bbtn" data-world-dev="${dev.id}">${dev.cost} 🫘</button></div>
        <p class="cc-wdev-desc">${_esc2(dev.desc)}</p>
      </div>`;
    }
    let body = '';
    if (dev.id === 'spionage') {
      const i = _spionageInfo(investments, byCountry, member);
      const line = (lbl, c, val) => `<li>${lbl}: <strong>${c ? c.flag + ' ' + _esc2(c.name) : '—'}</strong>${val != null ? ` <span class="cc-wdev-val">${val}</span>` : ''}</li>`;
      body = `<ul class="cc-wdev-info">
        ${line('💸 Günstigstes Land (wenig Konkurrenz)', i.cheapestCountry && i.cheapestCountry.c, i.cheapestCountry ? `Spitze ${_wfmt(i.cheapestCountry.top)} CC` : null)}
        ${line('💎 Teuerstes Land', i.dearestCountry && i.dearestCountry.c, i.dearestCountry ? `Spitze ${_wfmt(i.dearestCountry.top)} CC` : null)}
        ${line('🏗️ Bester freier Bauplatz', i.cb && i.cb.c, i.cb ? `${i.cb.d.icon} ${_esc2(i.cb.d.name)} · ${i.cb.d.cost} CC` : null)}
        ${line('⚔️ Leichteste Eroberung', i.cc && i.cc.c, i.cc ? `${i.cc.gap} CC zu Rang 1` : '— (du regierst überall)')}
      </ul>`;
    } else if (dev.id === 'investor') {
      const i = _investorInfo(byCountry);
      const freeList = i.free.slice(0, 6).map(x => `${x.c.flag} ${x.defs.length}`).join(' &nbsp; ') || '—';
      body = `<ul class="cc-wdev-info">
        <li>🏝️ Freie Bauplätze: <strong>${freeList}</strong></li>
        <li>💰 Höchster Ertrag frei: <strong>${i.best ? i.best.c.flag + ' ' + _esc2(i.best.d.name) : '—'}</strong>${i.best ? ` <span class="cc-wdev-val">${i.best.d.perDay ? '+' + i.best.d.perDay + '/Tag' : '+' + i.best.d.perCup + '/Tasse'} · ${i.best.d.cost} CC</span>` : ''}</li>
      </ul>`;
    } else if (dev.id === 'garde_akademie') {
      body = `<p class="cc-wdev-desc">🛡️ +10 % auf alle Welt-Einkommen aktiv (Einfluss &amp; Gebäude).</p>`;
    } else if (dev.id === 'steuerberater') {
      body = `<p class="cc-wdev-desc">💼 Deine Bausteuer ist halbiert: <strong>10 %</strong> statt 20 % beim Bauen in fremden Ländern.</p>`;
    } else if (dev.id === 'soeldner') {
      body = `<p class="cc-wdev-desc">⚔️ Sabotage freigeschaltet: öffne ein Land mit fremdem Regenten — dort kannst du ihn für ${SABOTAGE_DAYS} Tage lahmlegen (${SABOTAGE_COST} 🫘).</p>`;
    } else if (dev.id === 'boerse') {
      body = _renderBoerse(member);
    }
    return `<div class="cc-wdev cc-wdev-owned">
      <div class="cc-wdev-head"><span>${dev.icon} <strong>${_esc2(dev.name)}</strong> <em>✓ aktiv</em></span></div>
      ${body}
    </div>`;
  }).join('');
  return `<details class="cc-world-acc" data-acc="devs"${_worldAccOpen.devs ? ' open' : ''}><summary>🔬 Entwicklungen</summary>
    <div class="cc-wdev-list">${cards}</div></details>`;
}

// Klapp-Zustände merken, damit sie einen Refresh (nach Kauf/Aktion) überleben
function _wireAccordions() {
  document.querySelectorAll('#cc-world-stats details[data-acc], #cc-world-devs details[data-acc]')
    .forEach(d => { d.ontoggle = () => { _worldAccOpen[d.dataset.acc] = d.open; }; });
}

async function _handleBuyWorldDev(member, dev) {
  let left;
  try { left = await DB.spendCoins(member.id, dev.cost); }
  catch (e) { showToast(e.message || 'Kauf fehlgeschlagen', 'error'); return; }
  if (left === null || left === undefined) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  let md = { ...(member.map_data || {}) };
  md.worldDev = { ...(md.worldDev || {}), [dev.id]: true };
  // Ausgabe im selben Write anhängen (Transparenz → Netto-Gehalt).
  try { md = DB.appendTodayLog(md, [{ label: `🔭 Entwicklung: ${dev.name}`, amount: -dev.cost, cat: 'weltbau', detail: 'Weltkarte', invest: true }]); } catch (e) {}
  try { await DB.updateMapData(member.id, md); } catch (e) { console.warn('worldDev save:', e); }
  if (currentUserData) currentUserData.map_data = md;
  member.map_data = md;
  showToast(`${dev.icon} ${dev.name} freigeschaltet!`, 'success');
  try { await DB.postMessage(`${member.name} schaltet die Entwicklung ${dev.icon} ${dev.name} frei! 🌍`, member.name); } catch (e) {}
  await _worldRefreshTab(member);
}

// Welt-Tab komplett neu aufbauen (nach Kauf/Entwicklung), ohne Länder-Panel
async function _worldRefreshTab(member) {
  try {
    appData = await DB.fetchData();
    const um = appData.users.find(u => u.id === member.id);
    if (um) { currentUserData = { ...currentUserData, ...um }; if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(um); }
  } catch (e) {}
  const el = document.getElementById('imp-content');
  if (el) { el.innerHTML = ''; await _buildWeltkarte(currentUserData || member, el); }
}

// ── Kaffeebörse: Panel + Aktionen (nutzt spend_coins / add_coins / save_map_data) ─
function _renderBoerse(member) {
  const f = _fundOf(member);
  const rate = _fundRate(member.id);
  const div = Math.floor(f.principal * rate);
  const claimed = f.lastDiv === _todayKeyW();
  const room = Math.max(0, FUND_MAX - f.principal);
  const reinvest = f.mode === 'reinvest';
  return `<div class="cc-boerse">
    <div class="cc-boerse-stat">
      <span>📦 Angelegt: <strong>${_wfmt(f.principal)} CC</strong></span>
      <span>📈 Heute: <strong>${(rate * 100).toFixed(1)} %</strong> → ${_wfmt(div)} CC</span>
    </div>
    <div class="cc-boerse-mode">
      <span class="cc-boerse-mode-lbl">Dividende:</span>
      <button class="cc-boerse-modebtn${reinvest ? '' : ' active'}" data-fund-mode="payout">💸 Aufs Guthaben</button>
      <button class="cc-boerse-modebtn${reinvest ? ' active' : ''}" data-fund-mode="reinvest">🔁 Reinvestieren</button>
    </div>
    <div class="cc-boerse-actions">
      <input type="number" id="cc-fund-amount" min="1" step="10" placeholder="CC (max ${room})">
      <button class="cc-build-btn cc-world-bbtn" data-fund-deposit="1">Einzahlen</button>
    </div>
    <div class="cc-boerse-actions">
      <button class="cc-build-btn cc-world-bbtn" data-fund-dividend="1"${(claimed || div < 1) ? ' disabled' : ''}>${claimed ? '✓ Heute gutgeschrieben' : '💰 Jetzt einsammeln ' + _wfmt(div) + ' 🫘'}</button>
      <button class="cc-build-btn cc-world-bbtn" data-fund-withdraw="1"${f.principal < 1 ? ' disabled' : ''}>Auszahlen</button>
    </div>
    <p class="cc-wdev-desc">Rendite schwankt täglich (0,5–1,7 %) und wird <strong>automatisch 1×/Tag</strong> ${reinvest ? '<strong>reinvestiert</strong> (bis ' + _wfmt(FUND_MAX) + ' CC, Überschuss aufs Guthaben)' : 'aufs <strong>Guthaben</strong>'} gutgeschrieben. „Jetzt einsammeln" nur, wenn du nicht auf den Tageslauf warten willst. Max. ${_wfmt(FUND_MAX)} CC.</p>
  </div>`;
}

async function _saveFund(member, fund, logEntries) {
  const md = { ...(member.map_data || {}) };
  md.worldDev = { ...(md.worldDev || {}), fund };
  let toSave = md;
  if (logEntries && typeof DB.appendTodayLog === 'function') {
    try { toSave = DB.appendTodayLog(md, logEntries); } catch (e) { toSave = md; }
  }
  try { await DB.updateMapData(member.id, toSave); } catch (e) { console.warn('Fonds-Save:', e); }
  if (currentUserData) currentUserData.map_data = toSave;
  member.map_data = toSave;
}

async function _handleFundDeposit(member) {
  const input = document.getElementById('cc-fund-amount');
  const amount = Math.floor(parseFloat(input && input.value || '0'));
  if (!amount || amount < 1) { showToast('Betrag eingeben!', 'error'); return; }
  const f = _fundOf(member);
  if (f.principal + amount > FUND_MAX) { showToast(`Max. ${_wfmt(FUND_MAX)} CC im Fonds.`, 'error'); return; }
  let left;
  try { left = await DB.spendCoins(member.id, amount); }
  catch (e) { showToast(e.message || 'Fehlgeschlagen', 'error'); return; }
  if (left === null || left === undefined) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  await _saveFund(member, { principal: f.principal + amount, lastDiv: f.lastDiv, mode: f.mode },
    [{ label: '💹 Kaffeebörse: Einzahlung', amount: -amount, detail: 'Einzahlung (Kapital)', kapital: true }]);
  showToast(`💹 ${amount} CC angelegt.`, 'success');
  await _worldRefreshTab(member);
}

async function _handleFundWithdraw(member) {
  const f = _fundOf(member);
  if (f.principal < 1) return;
  const _payout = f.principal;
  try { await DB.addCoins(member.id, _payout); }
  catch (e) { showToast(e.message || 'Fehlgeschlagen', 'error'); return; }
  showToast(`💹 ${_wfmt(_payout)} CC ausgezahlt.`, 'success');
  // kapital-neutraler Info-Eintrag (weder Einnahme noch Netto) — symmetrisch zur Einzahlung.
  await _saveFund(member, { principal: 0, lastDiv: f.lastDiv, mode: f.mode },
    [{ label: '💹 Kaffeebörse: Auszahlung', amount: _payout, detail: 'Auszahlung (Kapital)', kapital: true }]);
  await _worldRefreshTab(member);
}

// „Jetzt einsammeln" — manueller Vorgriff auf die automatische Tages-Dividende. Verhält sich
// genau wie der Auto-Claim in db.js (_checkAndClaimFundDividend), inkl. Modus (ausschüttend/
// thesaurierend). Nach dem Klick ist lastDiv=heute, der Auto-Claim überspringt den Tag dann.
async function _handleFundDividend(member) {
  const f = _fundOf(member);
  const today = _todayKeyW();
  if (f.lastDiv === today) { showToast('Dividende heute schon gutgeschrieben.', 'error'); return; }
  const div = Math.floor(f.principal * _fundRate(member.id));
  if (div < 1) { showToast('Noch keine Dividende — lege mehr an.', 'error'); return; }
  if (f.mode === 'reinvest') {
    const room = Math.max(0, FUND_MAX - f.principal);
    const add  = Math.min(div, room);
    const overflow = div - add;
    if (overflow > 0) { try { await DB.addCoins(member.id, overflow); } catch (e) { showToast(e.message || 'Fehlgeschlagen', 'error'); return; } }
    const logs = [{ label: '💹 Börsen-Dividende (reinvestiert)', amount: add, detail: 'Kaffeebörse' }];
    if (overflow > 0) logs.push({ label: '💹 Börsen-Dividende', amount: overflow, detail: 'Kaffeebörse (über Max)' });
    await _saveFund(member, { principal: f.principal + add, lastDiv: today, mode: 'reinvest' }, logs);
    showToast(`💹 ${div} CC reinvestiert${overflow > 0 ? ` (${_wfmt(overflow)} aufs Guthaben)` : ''}!`, 'success');
  } else {
    try { await DB.addCoins(member.id, div); }
    catch (e) { showToast(e.message || 'Fehlgeschlagen', 'error'); return; }
    await _saveFund(member, { principal: f.principal, lastDiv: today, mode: 'payout' }, [{ label: '💹 Börsen-Dividende', amount: div, detail: 'Kaffeebörse' }]);
    showToast(`💹 ${div} CC Dividende!`, 'success');
  }
  await _worldRefreshTab(member);
}

// Umschalter ausschüttend ⇄ thesaurierend (pro Konto, in map_data.worldDev.fund.mode).
async function _handleFundMode(member, mode) {
  if (mode !== 'payout' && mode !== 'reinvest') return;
  const f = _fundOf(member);
  if (f.mode === mode) return;
  await _saveFund(member, { principal: f.principal, lastDiv: f.lastDiv, mode });
  showToast(mode === 'reinvest' ? '🔁 Dividende wird ab jetzt reinvestiert.' : '💸 Dividende geht ab jetzt aufs Guthaben.', 'success');
  await _worldRefreshTab(member);
}

// ── Söldner-Sabotage (im Länder-Sheet) ───────────────────────────────────────
async function _handleSabotage(country, member, governor) {
  let res;
  try { res = await DB.castSabotage(member.id, governor.member_id, country.id, SABOTAGE_COST, SABOTAGE_DAYS); }
  catch (e) { showToast(e.message || 'Sabotage fehlgeschlagen', 'error'); return; }
  if (res?.error === 'insufficient_coins') { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
  if (res?.error === 'already_active')     { showToast('Hier läuft bereits eine Sabotage.', 'error'); return; }
  if (res?.error === 'self')               { showToast('Du kannst dich nicht selbst sabotieren.', 'error'); return; }
  if (res?.error === 'allied')             { showToast('🛡️ Ein Schutzbündnis verhindert Sabotage gegen diesen Regenten.', 'error'); return; }
  if (!res?.ok) { showToast('Sabotage fehlgeschlagen', 'error'); return; }
  showToast(`⚔️ Söldner sabotieren ${country.flag} ${country.name}!`, 'success');
  try { await DB.postMessage(`${member.name} schickt Söldner nach ${country.flag} ${country.name} — ${governor.member_name} verliert dort ${SABOTAGE_DAYS} Tage Einkommen! ⚔️`, member.name); } catch (e) {}
  // CC-Ausgabe ins Tages-Log/Netto — cast_sabotage zieht p_cost serverseitig ab, loggt aber KEIN
  // todayLog. Fresh-Merge gegen Clobbering.
  try { await DB.appendTodayLogFresh(member.id, [{ label: `⚔️ Söldner-Sabotage — ${country.flag} ${country.name}`, amount: -SABOTAGE_COST, cat: 'welt', detail: 'Sabotage' }]); } catch (e) {}
  await _worldRefreshAndReopen(country, member);
}
