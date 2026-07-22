// ═══════════════════════════════════════════════════════════════════════════
// cafe.js — ☕ Café 2.0: selbstverwaltende Filiale + Stil-System (Erlebnis-Minigame #3)
// Plan: plans/PLAN_cafe.md  ·  SQL: sql/migration_2026-07-17_cafe_filiale.sql
// Muss VOR imperium.js geladen werden (imperium.js hängt den Tab ein, delegiert an _buildCafe).
//
// ÖKONOMIE = FILIALE mit eigener Kasse (cafe.kasse), getrennt von der Hauptkasse (member.coins):
//   • Einlage: Spieler schießt Startkapital aus der Hauptkasse in die Café-Kasse.
//   • Ausbau:  Geräte/Möbel/Personal werden AUS DER CAFÉ-KASSE bezahlt.
//   • Betrieb: idle & server-autoritativ (claim_cafe, Deckel 14 Tage). Umsatz→Kasse, Kosten←Kasse.
//   • Ausschüttung: nur der Gewinn geht zur Quote (payoutRatio %) an die Hauptkasse, Rest thésauriert.
//   • Auto-Ausbau: optional reinvestiert die Filiale ihren thésaurierten Gewinn selbst.
//   • Ring-fenced: Verluste fressen nur die Café-Kasse (Boden 0), nie die Hauptkasse.
// STIL: 6 Stile ziehen andere Klientel an (kundenMult × ccMult) — über Lifetime-Umsatz freigeschaltet.
// Die Szene ist ein warmes Hintergrundbild + Ambient-Animation (Deko/Feedback — schreibt NIE Coins).
// ═══════════════════════════════════════════════════════════════════════════

// ── Katalog: Geräte / Möbel / Personal (Balance-Platzhalter, zentral justierbar) ──
const CAFE_EQUIP = {
  maschine: { icon:'☕', name:'Espressomaschine', max:4, cost:[450,1400,3800,9000],
              kap:[60,110,175,260], quality:[0.25,0.55,0.85,1.15],
              tiers:['Einsteiger-Siebträger','Halbautomat','Dual-Boiler','Siebträger-Ikone'] },
  muehle:   { icon:'⚙️', name:'Mühle', max:3, cost:[300,900,2400], quality:[0.10,0.25,0.40],
              tiers:['Handmühle','Scheibenmühle','Präzisionsmühle'] },
  kuehlung: { icon:'🧊', name:'Kühlung', max:3, cost:[250,800,2000], menu:[0.4,0.9,1.4],
              tiers:['Kühlschrank','Kühltheke','Vitrinen-Kühlung'] },
  theke:    { icon:'🪟', name:'Theke', max:3, cost:[250,700,1600], service:[1,2,3],
              tiers:['Holztheke','Servicetheke','Barista-Station'] },
};
const CAFE_MOEBEL = {
  tische: { icon:'🪑', name:'Tisch (+2 Plätze)', kind:'count', max:12, cost:180, hip:3, seats:2 },
  deko:   { icon:'🖼️', name:'Deko-Stufe',        kind:'level', max:3, cost:[400,900,1800], hip:8 },
  sofa:   { icon:'🛋️', name:'Loungesofa',        kind:'level', max:2, cost:[1200,2600], hip:12, seats:3 },
};
const CAFE_STAFF = {
  barista: { icon:'👷', name:'Barista', max:4, hire:600, lohn:25, kapBonus:45 },
};

const CAFE_P = {
  kundenBasis: 70, menuBase: 4.5, ccCap: 10, umschlag: 10, zutatCC: 0.4,
  mieteBasis: 40, mietePGeraet: 6, mietePMoebel: 4, rufEase: 0.15,
  claimCapDays: 14, openMinInvest: 2500, autoReserveDays: 5,
  // Ausschüttung (JP 2026-07-22): ROLLBACK auf die alten Regeln — Cap 100 %, linearer Payout,
  // KEIN Raubbau-/Ruf-Malus mehr. Begründung: das Café ist die Late-Game-Geldmaschine, die die
  // Raumfahrt finanziert („kostet ultra viel, bringt sehr viel ein — am Ende zählt nur noch das All").
  // Muss dem SQL gleichen: migration_2026-07-22_cafe_payout_revert.sql.
  maxPayout: 100, defaultPayout: 60,
};

// ── Stil-Katalog: jeder Stil zieht andere Klientel an (Menge × Ausgabe) ──────
// Freischaltung über Café-Lifetime-Umsatz (minUmsatz). sterne = Prestige (1..3).
const CAFE_STIL = {
  klassisch: { name:'Klassisch', color:'#c9a24a', tag:'Der bewährte Klassiker. Gemütlich, zuverlässig, immer beliebt.',
    klientel:'Studenten, Berufstätige, Nachbarn', sterne:1, kundenMult:1.00, ccMult:1.00, zufrBias:0.00, minUmsatz:0,
    thumb:'assets/cafe/thumb_klassisch.jpg', scene:'assets/cafe/scene_klassisch.jpg' },
  hipp: { name:'Hipp', color:'#7fc99a', tag:'Kreativ. Bunt. Frei. Ein Treffpunkt für Visionäre.',
    klientel:'Studenten, Kreative, Freelancer', sterne:2, kundenMult:1.20, ccMult:1.10, zufrBias:0.02, minUmsatz:5000,
    thumb:'assets/cafe/thumb_hipp.jpg', scene:'assets/cafe/scene_hipp.jpg' },
  inn: { name:'Inn (Gemütlich)', color:'#8bbf5a', tag:'Gemütlich. Echt. Herzlich. Wie zu Hause – nur besser.',
    klientel:'Familien, Touristen, Genießer', sterne:2, kundenMult:1.10, ccMult:1.25, zufrBias:0.04, minUmsatz:15000,
    thumb:'assets/cafe/thumb_inn.jpg', scene:'assets/cafe/scene_inn.jpg' },
  chic: { name:'Chic', color:'#d98fb0', tag:'Stilvoll. Trendbewusst. Ein Erlebnis.',
    klientel:'Influencer, Trendsetter, Lifestyle-Liebhaber', sterne:3, kundenMult:0.90, ccMult:1.60, zufrBias:-0.02, minUmsatz:40000,
    thumb:'assets/cafe/thumb_chic.jpg', scene:'assets/cafe/scene_chic.jpg' },
  edel: { name:'Edel', color:'#9fb0c9', tag:'Exklusiv. Elegant. Perfekt.',
    klientel:'Geschäftsleute, Feinschmecker, Anspruchsvolle', sterne:3, kundenMult:0.70, ccMult:2.10, zufrBias:-0.04, minUmsatz:100000,
    thumb:'assets/cafe/thumb_edel.jpg', scene:'assets/cafe/scene_edel.jpg' },
  adlig: { name:'Adlig', color:'#b58fd9', tag:'Luxus. Prestige. Ein Statement.',
    klientel:'High Society, VIPs, Sammler', sterne:3, kundenMult:0.50, ccMult:3.20, zufrBias:-0.06, minUmsatz:250000,
    thumb:'assets/cafe/thumb_adlig.jpg', scene:'assets/cafe/scene_adlig.jpg' },
};
const CAFE_STIL_ORDER = ['klassisch','hipp','inn','chic','edel','adlig'];
function cafeStilDef(id) { return CAFE_STIL[id] || CAFE_STIL.klassisch; }

// ── Café-Level & XP (abgeleitet aus lifetime.umsatz — server-autoritativ via claim) ──
function _cafeLvlThreshold(n) { return n <= 1 ? 0 : Math.round(1500 * Math.pow(n - 1, 1.7)); }
function cafeLevelInfo(umsatz) {
  umsatz = Math.max(0, umsatz || 0); let lvl = 1;
  while (_cafeLvlThreshold(lvl + 1) <= umsatz && lvl < 99) lvl++;
  const cur = _cafeLvlThreshold(lvl), nxt = _cafeLvlThreshold(lvl + 1);
  const into = umsatz - cur, span = Math.max(1, nxt - cur);
  return { level: lvl, into: Math.round(into), span: Math.round(span), pct: Math.min(100, Math.round(into / span * 100)), nextAt: nxt };
}
function cafeLevelBonus(level) { return 1 + Math.min(0.30, Math.max(0, level - 1) * 0.01); }  // +1% Kundenbasis/Level, Deckel +30%

// ── Rezepte: freischaltbare Getränke (aus der Café-Kasse), heben Menüwert/Gäste/Zufriedenheit ──
const CAFE_REZEPTE = {
  cappuccino: { icon:'☕', name:'Cappuccino',           cost:600,  menu:0.6, desc:'Milchschaum-Klassiker · +0,6 Menüwert' },
  flatwhite:  { icon:'🥛', name:'Flat White',           cost:1200, menu:0.9, desc:'Feiner Microfoam · +0,9 Menüwert' },
  kuchen:     { icon:'🍰', name:'Hausgemachter Kuchen',  cost:2000, menu:1.1, zufr:0.03, desc:'+1,1 Menüwert · Gäste zufriedener' },
  coldbrew:   { icon:'🧊', name:'Cold Brew',            cost:2400, menu:1.3, reqKuehlung:1, desc:'Braucht Kühlung ≥ I · +1,3 Menüwert' },
  matcha:     { icon:'🍵', name:'Matcha Latte',          cost:3200, menu:1.4, kunden:0.06, desc:'+1,4 Menüwert · +6 % Gäste (Trend)' },
  signature:  { icon:'✨', name:'Signature-Drink',       cost:6500, menu:2.4, zufr:0.02, desc:'Dein Aushängeschild · +2,4 Menüwert' },
};
const CAFE_REZEPT_ORDER = ['cappuccino','flatwhite','kuchen','coldbrew','matcha','signature'];
function cafeRecipeBonus(state) {
  const r = state.rezepte || {}; let menu = 0, kunden = 0, zufr = 0;
  for (const id in CAFE_REZEPTE) { if (r[id]) { const d = CAFE_REZEPTE[id]; menu += d.menu||0; kunden += d.kunden||0; zufr += d.zufr||0; } }
  return { menu, kunden, zufr };
}

// ── Tägliche Aufgaben: Pool state-ableitbarer Ziele; 3/Tag deterministisch nach Datum ──
// check(m, st, lvl) → { cur, target }. done = cur>=target. Belohnung skaliert leicht mit Level (Deckel im RPC 150).
const CAFE_TASKS = [
  { id:'ruf',     icon:'⭐', label:'Café-Ruf auf {t}% bringen',      unit:'%',  reward:40, target:(l)=>Math.min(90, 55 + l*2),   cur:(m,st)=>Math.round(st.ruf) },
  { id:'zufr',    icon:'❤️', label:'Ø-Zufriedenheit auf {t}% halten', unit:'%',  reward:45, target:()=>80,                        cur:(m,st,l,mt)=>Math.round(mt.zufr/1.4*100) },
  { id:'gewinn',  icon:'💰', label:'Gewinn/Tag von {t} CC erreichen', unit:'CC', reward:50, target:(l)=>200 + l*120,             cur:(m,st,l,mt)=>Math.max(0, mt.netto) },
  { id:'auslast', icon:'📊', label:'Auslastung auf {t}% bringen',     unit:'%',  reward:45, target:()=>70,                        cur:(m,st,l,mt)=>mt.auslastung },
  { id:'gaeste',  icon:'👥', label:'{t} Gäste/Tag anziehen',          unit:'',   reward:45, target:(l)=>60 + l*8,                cur:(m,st,l,mt)=>mt.kunden },
  { id:'kasse',   icon:'🏦', label:'Café-Kasse auf {t} CC bringen',   unit:'CC', reward:50, target:(l)=>1000 + l*400,            cur:(m,st)=>Math.round(st.kasse) },
];
function _cafeDaySeed() { const d = new Date(); return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate(); }
function cafeDailyTasks(member, state, b, metrics) {
  const lvl = cafeLevelInfo(state.lifetime.umsatz).level;
  const claimed = (state.tasks && state.tasks.claimed) || {};
  const todayKey = (state.tasks && state.tasks.date) || '';
  const isToday = todayKey === new Date().toISOString().slice(0,10);
  // 3 Aufgaben deterministisch nach Tagesseed rotieren
  const seed = _cafeDaySeed(); const n = CAFE_TASKS.length;
  const idxs = [seed % n, (seed*7+3) % n, (seed*13+5) % n];
  const uniq = [...new Set(idxs)]; let k = 0; while (uniq.length < 3) { const c = (seed + (++k)) % n; if (!uniq.includes(c)) uniq.push(c); }
  return uniq.slice(0,3).map(i => {
    const T = CAFE_TASKS[i];
    const target = T.target(lvl);
    const cur = T.cur(member, state, lvl, metrics);
    const reward = Math.min(150, T.reward + lvl * 4);
    return { id:T.id, icon:T.icon, label:T.label.replace('{t}', _cFmt(target)), unit:T.unit,
      cur, target, pct: Math.min(100, Math.round(cur / Math.max(1,target) * 100)),
      done: cur >= target, claimed: !!(isToday && claimed[T.id]), reward };
  });
}

// ── Schema / Defaults ────────────────────────────────────────────────────────
function cafeDefaultBranch() {
  return { id:'haupt', name:'Stammhaus',
    equip:{ maschine:0, muehle:0, kuehlung:0, theke:0 },
    moebel:{ tische:0, deko:0, sofa:0 }, staff:{ barista:0 }, miete:CAFE_P.mieteBasis };
}
function cafeState(member) {
  const md = (member && member.map_data) || {};
  const c = md.cafe || {};
  const branches = (Array.isArray(c.branches) && c.branches.length) ? c.branches : [cafeDefaultBranch()];
  const lt = c.lifetime || {};
  return {
    version: c.version || 1, opened: !!c.opened, openedAt: c.openedAt || null,
    lastClaim: c.lastClaim || null, useBeans: c.useBeans !== false, ruf: c.ruf || 0,
    kasse: Math.max(0, c.kasse || 0),
    payoutRatio: (c.payoutRatio == null ? CAFE_P.defaultPayout : Math.max(0, Math.min(CAFE_P.maxPayout, c.payoutRatio))),
    autoBuild: !!c.autoBuild,
    stil: (c.stil && CAFE_STIL[c.stil]) ? c.stil : 'klassisch',
    rezepte: c.rezepte || {},
    tasks: c.tasks || {},
    lifetime: { umsatz: lt.umsatz || 0, gaeste: lt.gaeste || 0, netto: lt.netto || 0, distributed: lt.distributed || 0 },
    lastPurchase: c.lastPurchase || null,
    branches: branches.map(b => ({ ...cafeDefaultBranch(), ...b,
      equip:{ ...cafeDefaultBranch().equip, ...(b.equip||{}) },
      moebel:{ ...cafeDefaultBranch().moebel, ...(b.moebel||{}) },
      staff:{ ...cafeDefaultBranch().staff, ...(b.staff||{}) } })),
  };
}
function cafeBranch(state) { return state.branches[0]; }
function cafeResearchUnlocked(member) { const r = (member && member.research) || {}; return !!r.erstes_cafe; }

// ── Formeln (rein — Preview UND Client-Rate an claim_cafe) ────────────────────
function cafeHipScore(b) {
  return b.moebel.tische * CAFE_MOEBEL.tische.hip + b.moebel.deko * CAFE_MOEBEL.deko.hip + b.moebel.sofa * CAFE_MOEBEL.sofa.hip;
}
function cafeSeats(b) { return b.moebel.tische * CAFE_MOEBEL.tische.seats + b.moebel.sofa * CAFE_MOEBEL.sofa.seats; }
function _cafeTier(arr, lvl) { if (!lvl || lvl <= 0) return 0; return arr[Math.min(lvl, arr.length) - 1] || 0; }
function cafeCapacity(b) { return _cafeTier(CAFE_EQUIP.maschine.kap, b.equip.maschine) + b.staff.barista * CAFE_STAFF.barista.kapBonus; }
function cafeQualityIndex(b) { return 1 + _cafeTier(CAFE_EQUIP.maschine.quality, b.equip.maschine) + _cafeTier(CAFE_EQUIP.muehle.quality, b.equip.muehle); }
function cafeMenuValue(state, b) { return CAFE_P.menuBase + _cafeTier(CAFE_EQUIP.kuehlung.menu, b.equip.kuehlung) + cafeRecipeBonus(state).menu; }
function cafeServiceLevel(b) { return _cafeTier(CAFE_EQUIP.theke.service, b.equip.theke); }

function cafeKundenzahl(state, b) {
  const stil = cafeStilDef(state.stil);
  const hip = cafeHipScore(b);
  const rufF = 0.6 + 0.4 * (state.ruf / 100);
  const lvlF = cafeLevelBonus(cafeLevelInfo(state.lifetime.umsatz).level);
  const rez = cafeRecipeBonus(state);
  return Math.round(CAFE_P.kundenBasis * (1 + hip / 100) * rufF * stil.kundenMult * lvlF * (1 + rez.kunden));
}
function cafeVerkauft(state, b) {
  const kunden = cafeKundenzahl(state, b);
  const kap = cafeCapacity(b);
  const sitz = cafeSeats(b) * CAFE_P.umschlag;
  return Math.max(0, Math.min(kunden, kap, sitz));
}
function cafeCcProTasse(state, b) {
  const stil = cafeStilDef(state.stil);
  const cap = CAFE_P.ccCap * stil.ccMult;
  return Math.min(cap, cafeMenuValue(state, b) * cafeQualityIndex(b) * stil.ccMult);
}
function cafeOekoBonus(member, state) {
  if (!state.useBeans) return 0;
  const oeko = ((member.map_data || {}).rohstoffe || {}).oeko || 0;
  return oeko > 0 ? 0.15 : 0;
}
function cafeZufriedenheit(member, state, b) {
  const stil = cafeStilDef(state.stil);
  const kunden = cafeKundenzahl(state, b);
  const kap = Math.max(1, cafeCapacity(b));
  const andrang = kunden / kap;
  const svc = cafeServiceLevel(b) * 0.05;
  const qBonus = (cafeQualityIndex(b) - 1) * 0.3;
  let z = 1.4 - 0.5 * Math.max(0, andrang - 1 - svc) + qBonus + cafeOekoBonus(member, state) + stil.zufrBias + cafeRecipeBonus(state).zufr;
  return Math.max(0.6, Math.min(1.4, z));
}
function cafeMietePerDay(b) {
  const gSum = b.equip.maschine + b.equip.muehle + b.equip.kuehlung + b.equip.theke;
  const mSum = b.moebel.tische + b.moebel.deko + b.moebel.sofa;
  return CAFE_P.mieteBasis + CAFE_P.mietePGeraet * gSum + CAFE_P.mietePMoebel * mSum;
}
function cafeLohnPerDay(b) { return b.staff.barista * CAFE_STAFF.barista.lohn; }

// Vollständige Tages-Kennzahlen (Preview + Claim-Rate). Ein Objekt, eine Wahrheit.
function cafeDayMetrics(member, state, b) {
  const kunden   = cafeKundenzahl(state, b);
  const verkauft = cafeVerkauft(state, b);
  const ccTasse  = cafeCcProTasse(state, b);
  const zufr     = cafeZufriedenheit(member, state, b);
  const umsatz   = Math.round(verkauft * ccTasse * zufr);
  const miete    = cafeMietePerDay(b);
  const lohn     = cafeLohnPerDay(b);
  const roh = (member.map_data || {}).rohstoffe || {};
  let beansOeko = 0, beansStd = 0, zutatCC = 0;
  if (state.useBeans) {
    const needOeko = Math.min(verkauft, roh.oeko || 0);
    const needStd  = Math.min(verkauft - needOeko, roh.std || 0);
    beansOeko = needOeko; beansStd = needStd;
    zutatCC = Math.round((verkauft - needOeko - needStd) * CAFE_P.zutatCC);
  } else {
    zutatCC = Math.round(verkauft * CAFE_P.zutatCC);
  }
  const netto = umsatz - miete - lohn - zutatCC;   // Gewinn/Tag (kann negativ sein; Server ring-fenced auf Kasse)
  const ratio = state.payoutRatio;
  // Linearer Payout (Rollback JP 2026-07-22): Quote × Gewinn, ohne Raubbau-Abzug und ohne
  // Ruf-Malus. Muss dem SQL-v_dist in claim_cafe gleichen (migration_2026-07-22_cafe_payout_revert.sql).
  const ausschuettung = netto > 0 ? Math.round(netto * ratio / 100) : 0;
  const thesauriert = netto - ausschuettung;        // bei Verlust = netto (negativ), frisst die Kasse
  const kap  = Math.max(1, cafeCapacity(b));
  return { kunden, verkauft, ccTasse:Math.round(ccTasse*10)/10, zufr:Math.round(zufr*100)/100,
    umsatz, miete, lohn, zutatCC, beansOeko, beansStd, netto, ausschuettung, thesauriert,
    kapazitaet:kap, auslastung:Math.round(verkauft / kap * 100),
    rufTarget: Math.round(Math.max(0, state.ruf + (zufr * 100 - state.ruf) * CAFE_P.rufEase)) };
}

// Gewinn/Tag (Filial-intern) — 0 wenn nicht eröffnet.
function cafePerDay(member) {
  try {
    if (!cafeResearchUnlocked(member)) return 0;
    const st = cafeState(member); if (!st.opened) return 0;
    return cafeDayMetrics(member, st, cafeBranch(st)).netto;
  } catch (e) { return 0; }
}
// Ausschüttung/Tag an die Hauptkasse — das ist die tatsächliche Coin-Einnahme (Statistik).
function cafeDistributedPerDay(member) {
  try {
    if (!cafeResearchUnlocked(member)) return 0;
    const st = cafeState(member); if (!st.opened) return 0;
    return cafeDayMetrics(member, st, cafeBranch(st)).ausschuettung;
  } catch (e) { return 0; }
}
// Café-Kasse (fürs Vermögen).
function cafeKasse(member) {
  try { return Math.max(0, cafeState(member).kasse || 0); } catch (e) { return 0; }
}

function cafeCanOpen(b) {
  return b.equip.maschine >= 1 && b.equip.muehle >= 1 && b.equip.theke >= 1 && b.moebel.tische >= 3 && b.staff.barista >= 1;
}
function cafeInvested(b) {
  let sum = 0;
  for (const k in CAFE_EQUIP) { const e = CAFE_EQUIP[k]; for (let i = 0; i < b.equip[k]; i++) sum += e.cost[i]; }
  sum += b.moebel.tische * CAFE_MOEBEL.tische.cost;
  for (let i = 0; i < b.moebel.deko; i++) sum += CAFE_MOEBEL.deko.cost[i];
  for (let i = 0; i < b.moebel.sofa; i++) sum += CAFE_MOEBEL.sofa.cost[i];
  sum += b.staff.barista * CAFE_STAFF.barista.hire;
  return sum;
}
function cafeNextCost(b, cat, key) {
  if (cat === 'equip') { const e = CAFE_EQUIP[key]; return b.equip[key] < e.max ? e.cost[b.equip[key]] : null; }
  if (cat === 'staff') { const s = CAFE_STAFF[key]; return b.staff[key] < s.max ? s.hire : null; }
  const m = CAFE_MOEBEL[key];
  if (m.kind === 'count') return b.moebel[key] < m.max ? m.cost : null;
  return b.moebel[key] < m.max ? m.cost[b.moebel[key]] : null;
}
// Günstigstes verfügbares nächstes Upgrade über alle Kategorien (für Auto-Ausbau).
function _cafeCheapestNext(b) {
  let best = null;
  const consider = (cat, key, name) => { const c = cafeNextCost(b, cat, key); if (c != null && (!best || c < best.cost)) best = { cat, key, cost:c, name }; };
  for (const key in CAFE_EQUIP) consider('equip', key, CAFE_EQUIP[key].name);
  for (const key in CAFE_MOEBEL) consider('moebel', key, CAFE_MOEBEL[key].name);
  consider('staff', 'barista', CAFE_STAFF.barista.name);
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
//  UI (ownt DOM; von imperium.js delegiert: _renderImperiumTab('cafe', ...))
// ═══════════════════════════════════════════════════════════════════════════
const _cEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
const _cFmt = n => (typeof _fmtCoins === 'function') ? _fmtCoins(n) : Math.round(n).toLocaleString('de-DE');
const _cStars = n => '★★★☆☆☆'.slice(3 - n, 6 - n);   // n Vollsterne + Rest leer (max 3)
let _cafeRaf = null, _cafeView = 'main';

async function _buildCafe(member, el) {
  member = (typeof currentUserData !== 'undefined' && currentUserData) || member;
  const st = cafeState(member);
  // Beim Öffnen automatisch abrechnen (idle-Claim), außer im Stil-Screen.
  if (st.opened && _cafeView !== 'stil') { try { await cafeMaybeClaim(member, true, true); member = currentUserData || member; } catch (e) {} }
  const st2 = cafeState(member), b2 = cafeBranch(st2);

  if (_cafeView === 'stil') { el.innerHTML = _cafeRenderStilScreen(member, st2); _cafeBindHandlers(el, member); return; }
  el.innerHTML = st2.opened ? _cafeRenderBetrieb(member, st2, b2) : _cafeRenderAufbau(member, st2, b2);
  _cafeBindHandlers(el, member);
  if (st2.opened) _cafeStartScene(member, st2, b2);
}

// ── Café-Kasse-Leiste (Kasse + Einlage) — in Aufbau & Betrieb ────────────────
function _cafeKasseBar(member, st) {
  const coins = member.coins || 0;
  return `<div class="cc-cafe-kasse">
    <div class="cc-cafe-kasse-main">
      <span class="cc-cafe-kasse-lbl">🏦 Café-Kasse</span>
      <span class="cc-cafe-kasse-val">${_cFmt(st.kasse)} CC</span>
    </div>
    <div class="cc-cafe-deposit">
      <span class="cc-cafe-deposit-hint">Hauptkasse: ${_cFmt(coins)} CC</span>
      <input type="number" min="1" step="50" placeholder="Betrag" class="cc-cafe-dep-input" id="cafe-dep-input">
      <button class="cc-cafe-dep-btn" data-cafe-deposit="1">➕ Einlage</button>
    </div>
  </div>`;
}

function _cafeShopHTML(member, st, b) {
  const kasse = st.kasse || 0;
  const row = (cat, key, label, icon, lvl, max, cost, sub) => {
    let btn;
    if (cost == null) btn = `<span class="cc-cafe-max">✓ max</span>`;
    else if (kasse < cost) btn = `<button class="cc-cafe-buy" data-cafe-buy="${cat}:${key}" disabled title="Café-Kasse zu niedrig">${_cFmt(cost)} CC</button>`;
    else btn = `<button class="cc-cafe-buy" data-cafe-buy="${cat}:${key}">${lvl>0?'Ausbau':'Kaufen'} · ${_cFmt(cost)} CC</button>`;
    return `<div class="cc-cafe-item">
      <span class="cc-cafe-item-name">${icon} ${_cEsc(label)} ${max>1?`<em>${cat==='moebel'&&key==='tische'?b.moebel.tische+'×':'L'+lvl}</em>`:''}</span>
      ${btn}
      <span class="cc-cafe-item-eff">${_cEsc(sub)}</span>
    </div>`;
  };
  let html = '<div class="cc-cafe-shop">';
  html += '<div class="cc-cafe-shop-col"><h4>⚙️ Geräte</h4>';
  for (const key in CAFE_EQUIP) { const e = CAFE_EQUIP[key]; const lvl = b.equip[key]; const cost = cafeNextCost(b,'equip',key);
    const nextTier = lvl < e.max ? e.tiers[lvl] : e.tiers[e.max-1];
    html += row('equip', key, e.name, e.icon, lvl, e.max, cost, lvl>=e.max?'Höchste Güteklasse':`nächste: ${nextTier}`); }
  html += '</div>';
  html += '<div class="cc-cafe-shop-col"><h4>🛋️ Einrichtung & Personal</h4>';
  for (const key in CAFE_MOEBEL) { const m = CAFE_MOEBEL[key]; const lvl = b.moebel[key]; const cost = cafeNextCost(b,'moebel',key);
    html += row('moebel', key, m.name, m.icon, lvl, m.max, cost, `+${m.hip} Hip${m.seats?` · +${m.seats} Plätze`:''}`); }
  const s = CAFE_STAFF.barista; const scost = cafeNextCost(b,'staff','barista');
  html += row('staff', 'barista', s.name, s.icon, b.staff.barista, s.max, scost, `+${s.kapBonus} Kapazität · ${s.lohn} CC Lohn/Tag`);
  html += '</div></div>';
  return html;
}

function _cafeRenderAufbau(member, st, b) {
  const invested = cafeInvested(b);
  const pct = Math.min(100, Math.round(invested / CAFE_P.openMinInvest * 100));
  const canOpen = cafeCanOpen(b);
  const missing = [];
  if (b.equip.maschine < 1) missing.push('Espressomaschine');
  if (b.equip.muehle < 1) missing.push('Mühle');
  if (b.equip.theke < 1) missing.push('Theke');
  if (b.moebel.tische < 3) missing.push(`${3 - b.moebel.tische}× Tisch`);
  if (b.staff.barista < 1) missing.push('Barista');
  return `<div class="cc-cafe">
    <div class="cc-cafe-intro">
      <p class="cc-cafe-lead">☕ <strong>Deine Café-Filiale</strong> — sie verwaltet ihr Geld selbst. Lege zuerst <strong>Startkapital</strong> in die Café-Kasse ein, kaufe davon die Grundausstattung, und wenn der Mindeststandard steht, <strong>eröffnest</strong> du. Danach läuft alles idle: Gewinne fließen in die Kasse, ein Teil wird an dich <strong>ausgeschüttet</strong>.</p>
      ${_cafeKasseBar(member, st)}
      <div class="cc-cafe-progress">
        <div class="cc-cafe-prog-bar"><span style="width:${pct}%"></span></div>
        <div class="cc-cafe-prog-lbl">🏗️ Grundausstattung investiert: <strong>${_cFmt(invested)}</strong> / ~${_cFmt(CAFE_P.openMinInvest)} CC</div>
      </div>
      ${canOpen
        ? `<button class="cc-cafe-open" data-cafe-open="1">🔓 Café eröffnen</button>`
        : `<div class="cc-cafe-openlock">🔒 Zum Eröffnen fehlt noch: <strong>${_cEsc(missing.join(', '))}</strong></div>`}
    </div>
    ${_cafeShopHTML(member, st, b)}
  </div>`;
}

function _cafeRenderBetrieb(member, st, b) {
  const m = cafeDayMetrics(member, st, b);
  const stil = cafeStilDef(st.stil);
  const beansTxt = st.useBeans
    ? (m.beansOeko + m.beansStd > 0 ? `🌾 ${m.beansOeko} Öko · ${m.beansStd} Std${m.zutatCC>0?` · +${m.zutatCC} CC`:''}` : `${m.zutatCC} CC (kein Bohnenvorrat)`)
    : `${m.zutatCC} CC`;
  const nettoCls = m.netto >= 0 ? 'pos' : 'neg';
  return `<div class="cc-cafe">
    <div class="cc-cafe-stage">
      <div class="cc-cafe-stagetop">
        <button class="cc-cafe-stilbadge" data-cafe-stil="1" style="--stil:${stil.color}">
          <span class="cc-cafe-stilstars">${_cStars(stil.sterne)}</span> ${_cEsc(stil.name)} <span class="cc-cafe-stilchg">Stil ändern ▸</span>
        </button>
      </div>
      <canvas id="cafe-canvas" width="820" height="440" aria-label="Café-Szene"></canvas>
      <div class="cc-cafe-gaeste" id="cafe-gaeste"></div>
    </div>

    ${_cafeLevelBar(st)}

    <div class="cc-cafe-statbar">
      <div class="cc-cafe-stat"><span class="l">⭐ Ruf</span><span class="n">${Math.round(st.ruf)}%</span></div>
      <div class="cc-cafe-stat"><span class="l">❤️ Zufriedenheit</span><span class="n">${Math.round(m.zufr/1.4*100)}%</span></div>
      <div class="cc-cafe-stat"><span class="l">💰 Gewinn/Tag</span><span class="n ${nettoCls}">${m.netto>=0?'+':''}${_cFmt(m.netto)}</span></div>
      <div class="cc-cafe-stat"><span class="l">📊 Auslastung</span><span class="n">${m.auslastung}%</span></div>
    </div>

    ${_cafeTasksPanel(member, st, b, m)}

    <div class="cc-cafe-guv">
      <div class="cc-cafe-guv-head">🏦 Filiale — ${_cEsc(b.name)} <span class="cc-cafe-kassepill">Kasse: ${_cFmt(st.kasse)} CC</span></div>
      <div class="cc-cafe-guv-grid">
        <div class="cc-cafe-kpi"><span class="k">Umsatz/Tag</span><span class="v">${_cFmt(m.umsatz)} CC</span></div>
        <div class="cc-cafe-kpi"><span class="k">Miete</span><span class="v neg">−${_cFmt(m.miete)}</span></div>
        <div class="cc-cafe-kpi"><span class="k">Löhne</span><span class="v neg">−${_cFmt(m.lohn)}</span></div>
        <div class="cc-cafe-kpi"><span class="k">Zutaten</span><span class="v neg" title="Bohnen aus dem Anbau-Imperium, Rest als CC">${_cEsc(beansTxt)}</span></div>
        <div class="cc-cafe-kpi big"><span class="k">Gewinn/Tag</span><span class="v ${nettoCls}">${m.netto>=0?'+':''}${_cFmt(m.netto)} CC</span></div>
      </div>
      <div class="cc-cafe-split">
        <div class="cc-cafe-splitrow"><span>💸 Ausschüttung an Hauptkasse (${st.payoutRatio}%)</span><strong class="pos">+${_cFmt(m.ausschuettung)}/Tag</strong></div>
        <div class="cc-cafe-splitrow"><span>🏦 Thésauriert in Café-Kasse</span><strong>${m.thesauriert>=0?'+':''}${_cFmt(m.thesauriert)}/Tag</strong></div>
        <div class="cc-cafe-splitrow muted"><span>Σ ausgeschüttet (gesamt)</span><strong>${_cFmt(st.lifetime.distributed)} CC</strong></div>
      </div>

      <div class="cc-cafe-policy">
        <label class="cc-cafe-policy-row">
          <span>Ausschüttungsquote</span>
          <input type="range" min="0" max="${CAFE_P.maxPayout}" step="5" value="${st.payoutRatio}" data-cafe-payout id="cafe-payout">
          <output id="cafe-payout-out">${st.payoutRatio}%</output>
        </label>
        <p class="cc-cafe-policy-hint" style="margin:2px 0 6px;font-size:.8rem;color:var(--muted)">💡 Anteil des Tagesgewinns, der an deine Hauptkasse ausgeschüttet wird — der Rest bleibt in der Café-Kasse (Reserve & 🤖 Auto-Ausbau).</p>
        <label class="cc-cafe-toggle"><input type="checkbox" data-cafe-autobuild ${st.autoBuild?'checked':''}> 🤖 Auto-Ausbau — die Filiale reinvestiert ihren Gewinn selbst</label>
        <label class="cc-cafe-toggle"><input type="checkbox" data-cafe-beans ${st.useBeans?'checked':''}> 🫘 Bohnen aus dem Anbau-Imperium verwenden (🌾 Öko hebt die Zufriedenheit)</label>
      </div>

      <div class="cc-cafe-guv-grid sub">
        <div class="cc-cafe-kpi"><span class="k">Gäste/Tag</span><span class="v">${m.kunden}</span></div>
        <div class="cc-cafe-kpi"><span class="k">verkauft</span><span class="v">${m.verkauft} · ${m.ccTasse} CC/☕</span></div>
        <div class="cc-cafe-kpi"><span class="k">Ø Zufriedenheit</span><span class="v">${(m.zufr).toFixed(2)} ★</span></div>
        <div class="cc-cafe-kpi"><span class="k">Kapazität</span><span class="v">${m.kapazitaet}/Tag</span></div>
      </div>
      ${_cafeKasseBar(member, st)}
      <p class="cc-cafe-claimnote">💤 Läuft idle weiter — der ausgeschüttete Gewinn wird beim Öffnen automatisch gutgeschrieben (max. ${CAFE_P.claimCapDays} Tage angesammelt). Verluste treffen nur die Café-Kasse, nie deine Hauptkasse.</p>
    </div>

    ${_cafeRezeptePanel(member, st, b)}

    <div class="cc-cafe-shop-title">🛠️ Ausbauen — bezahlt aus der Café-Kasse, wirkt sofort auf die Zahlen oben</div>
    ${_cafeShopHTML(member, st, b)}
  </div>`;
}

// ── Panels: Level-Leiste · Tägliche Aufgaben · Rezepte ───────────────────────
function _cafeLevelBar(st) {
  const li = cafeLevelInfo(st.lifetime.umsatz);
  return `<div class="cc-cafe-levelbar">
    <div class="cc-cafe-levelmain"><span class="cc-cafe-levelno">☕ Café-Level ${li.level}</span>
      <span class="cc-cafe-levelxp">${_cFmt(li.into)} / ${_cFmt(li.span)} XP</span></div>
    <div class="cc-cafe-levelprog"><span style="width:${li.pct}%"></span></div>
  </div>`;
}
function _cafeTasksPanel(member, st, b, m) {
  const tasks = cafeDailyTasks(member, st, b, m);
  const rows = tasks.map(t => {
    const btn = t.claimed ? `<span class="cc-task-done">✓ eingelöst</span>`
      : t.done ? `<button class="cc-task-claim" data-cafe-task="${t.id}" data-reward="${t.reward}">+${t.reward} CC abholen</button>`
      : `<span class="cc-task-prog">${_cFmt(Math.min(t.cur,t.target))}/${_cFmt(t.target)}${t.unit}</span>`;
    return `<div class="cc-task ${t.claimed?'is-claimed':t.done?'is-done':''}">
      <span class="cc-task-ic">${t.icon}</span>
      <div class="cc-task-body">
        <div class="cc-task-lbl">${_cEsc(t.label)}</div>
        <div class="cc-task-bar"><span style="width:${t.pct}%"></span></div>
      </div>
      ${btn}
    </div>`;
  }).join('');
  return `<div class="cc-cafe-tasks">
    <div class="cc-cafe-tasks-head">📋 Tägliche Aufgaben</div>
    ${rows}
  </div>`;
}
function _cafeRezeptePanel(member, st, b) {
  const rez = st.rezepte || {};
  const cards = CAFE_REZEPT_ORDER.map(id => {
    const d = CAFE_REZEPTE[id];
    const owned = !!rez[id];
    const reqOk = !d.reqKuehlung || b.equip.kuehlung >= d.reqKuehlung;
    let btn;
    if (owned) btn = `<span class="cc-rez-owned">✓ freigeschaltet</span>`;
    else if (!reqOk) btn = `<span class="cc-rez-lock">🔒 Kühlung ≥ I nötig</span>`;
    else if ((st.kasse||0) < d.cost) btn = `<button class="cc-rez-buy" data-cafe-recipe="${id}" data-cost="${d.cost}" disabled>${_cFmt(d.cost)} CC</button>`;
    else btn = `<button class="cc-rez-buy" data-cafe-recipe="${id}" data-cost="${d.cost}">Freischalten · ${_cFmt(d.cost)} CC</button>`;
    return `<div class="cc-rez ${owned?'is-owned':''}">
      <span class="cc-rez-ic">${d.icon}</span>
      <div class="cc-rez-body"><div class="cc-rez-name">${_cEsc(d.name)}</div><div class="cc-rez-desc">${_cEsc(d.desc)}</div></div>
      ${btn}
    </div>`;
  }).join('');
  return `<div class="cc-cafe-rezepte">
    <div class="cc-cafe-rezepte-head">📖 Rezepte — freischaltbare Getränke (aus der Café-Kasse)</div>
    <div class="cc-rez-grid">${cards}</div>
  </div>`;
}

// ── Stil-Auswahl-Screen ──────────────────────────────────────────────────────
function _cafeRenderStilScreen(member, st) {
  const umsatz = st.lifetime.umsatz || 0;
  const cards = CAFE_STIL_ORDER.map(id => {
    const s = CAFE_STIL[id];
    const unlocked = umsatz >= s.minUmsatz;
    const current = st.stil === id;
    const btn = current ? `<span class="cc-stil-cur">✓ Aktiv</span>`
      : unlocked ? `<button class="cc-stil-pick" data-cafe-pickstil="${id}" data-min="${s.minUmsatz}">Auswählen</button>`
      : `<span class="cc-stil-lock">🔒 ab ${_cFmt(s.minUmsatz)} Umsatz</span>`;
    return `<div class="cc-stil-card ${current?'is-current':''} ${unlocked?'':'is-locked'}" style="--stil:${s.color}">
      <div class="cc-stil-banner">${_cEsc(s.name)}</div>
      <div class="cc-stil-thumbwrap"><img class="cc-stil-thumb" src="${s.thumb}" alt="${_cEsc(s.name)}" loading="lazy">
        ${unlocked?'':'<div class="cc-stil-lockov">🔒</div>'}</div>
      <div class="cc-stil-body">
        <div class="cc-stil-stars">${_cStars(s.sterne)}</div>
        <p class="cc-stil-tag">${_cEsc(s.tag)}</p>
        <p class="cc-stil-klientel">👥 ${_cEsc(s.klientel)}</p>
        <p class="cc-stil-econ">${s.kundenMult>=1?'📈':'📉'} Gäste ×${s.kundenMult.toFixed(2)} · 💎 CC/Tasse ×${s.ccMult.toFixed(2)}</p>
        ${btn}
      </div>
    </div>`;
  }).join('');
  return `<div class="cc-cafe cc-cafe-stilscreen">
    <div class="cc-stil-head">
      <button class="cc-stil-back" data-cafe-stilback="1">◂ Zurück</button>
      <h3>Wähle deinen Café-Stil ☕</h3>
      <p>Jeder Stil zieht andere Gäste an — von Studenten bis zur High Society. (Café-Umsatz gesamt: ${_cFmt(umsatz)} CC)</p>
    </div>
    <div class="cc-stil-grid">${cards}</div>
  </div>`;
}

function _cafeBindHandlers(el, member) {
  el.onclick = async (e) => {
    const buy = e.target.closest('[data-cafe-buy]');
    if (buy && !buy.disabled) { await _cafeBuy(buy.dataset.cafeBuy, member); return; }
    if (e.target.closest('[data-cafe-open]'))    { await _cafeOpen(member); return; }
    if (e.target.closest('[data-cafe-deposit]')) { await _cafeDeposit(el, member); return; }
    if (e.target.closest('[data-cafe-stil]'))    { _cafeView = 'stil'; _renderImperiumTab('cafe', currentUserData || member); return; }
    if (e.target.closest('[data-cafe-stilback]')){ _cafeView = 'main'; _renderImperiumTab('cafe', currentUserData || member); return; }
    const pick = e.target.closest('[data-cafe-pickstil]');
    if (pick) { await _cafePickStil(pick.dataset.cafePickstil, parseFloat(pick.dataset.min)||0, member); return; }
    const task = e.target.closest('[data-cafe-task]');
    if (task && !task.disabled) { await _cafeClaimTask(task.dataset.cafeTask, parseFloat(task.dataset.reward)||0, member); return; }
    const rez = e.target.closest('[data-cafe-recipe]');
    if (rez && !rez.disabled) { await _cafeUnlockRecipe(rez.dataset.cafeRecipe, parseFloat(rez.dataset.cost)||0, member); return; }
  };
  const bx = el.querySelector('[data-cafe-beans]');
  if (bx) bx.onchange = async () => { await _cafeToggleBeans(bx.checked, member); };
  const ab = el.querySelector('[data-cafe-autobuild]');
  if (ab) ab.onchange = async () => { await _cafeSetPolicy(member, null, ab.checked); };
  const po = el.querySelector('[data-cafe-payout]');
  if (po) {
    const out = el.querySelector('#cafe-payout-out');
    po.oninput = () => { if (out) out.textContent = po.value + '%'; };
    po.onchange = async () => { await _cafeSetPolicy(member, parseInt(po.value,10), null); };
  }
}

// ── Aktionen ─────────────────────────────────────────────────────────────────
function _cafeSyncUser(res, member) {
  if (res && res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
  if (res && res.coins_left != null) { currentUserData = { ...(currentUserData||{}), coins: res.coins_left }; if (typeof _updateHeaderCoins==='function') _updateHeaderCoins(currentUserData); }
}

async function _cafeBuy(spec, member) {
  try {
    const [cat, key] = spec.split(':');
    const st = cafeState(member), b = cafeBranch(st);
    const cost = cafeNextCost(b, cat, key);
    if (cost == null) { showToast('Höchste Stufe erreicht.', 'info'); return; }
    const label = (cat==='equip'?CAFE_EQUIP[key].name:cat==='staff'?CAFE_STAFF[key].name:CAFE_MOEBEL[key].name);
    const res = await DB.buyCafeItem(member.id, cat, key, cost, label);
    if (res?.error) {
      const map = { insufficient_kasse:'Café-Kasse zu niedrig — leg erst Kapital ein.', maxed:'Höchste Stufe erreicht.', bad_item:'Unbekannter Posten.', not_found:'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Kauf fehlgeschlagen', 'error'); return;
    }
    _cafeSyncUser(res, member);
    // Café-interne Kapitalbewegung (Kasse → Ausstattung): kapital:true → verzerrt die Bilanz nicht.
    try { await DB.appendTodayLogFresh(member.id, [{ label:`☕ Café-Ausbau: ${label}`, amount:-(res.cost||0), cat:'cafe', kapital:true, detail:'aus Café-Kasse' }]); } catch (e) {}
    showToast(`☕ ${label} gekauft (−${_cFmt(res.cost||0)} CC aus der Kasse)`, 'success');
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}

async function _cafeDeposit(el, member) {
  try {
    const inp = el.querySelector('#cafe-dep-input');
    const amount = Math.floor(parseFloat(inp && inp.value) || 0);
    if (amount <= 0) { showToast('Bitte einen Betrag eingeben.', 'info'); return; }
    if (amount > (member.coins || 0)) { showToast('Nicht genug in der Hauptkasse.', 'error'); return; }
    const res = await DB.depositCafe(member.id, amount);
    if (res?.error) {
      const map = { insufficient:'Nicht genug in der Hauptkasse.', bad_amount:'Ungültiger Betrag.', not_found:'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Einlage fehlgeschlagen', 'error'); return;
    }
    _cafeSyncUser(res, member);
    try { await DB.appendTodayLogFresh(member.id, [{ label:'🏢 Kapital-Einlage → Café-Kasse', amount:-(res.amount||amount), cat:'cafe', kapital:true, detail:'Startkapital' }]); } catch (e) {}
    showToast(`🏦 ${_cFmt(res.amount||amount)} CC in die Café-Kasse eingelegt`, 'success');
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}

async function _cafeOpen(member) {
  try {
    const res = await DB.openCafe(member.id);
    if (res?.error) {
      const map = { min_not_met:'Mindeststandard noch nicht erfüllt.', already:'Café ist schon eröffnet.', not_found:'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Eröffnen fehlgeschlagen', 'error'); return;
    }
    _cafeSyncUser(res, member);
    showToast('🎉 Café eröffnet! Willkommen im Geschäft.', 'success');
    try { await DB.postMessage(`☕ ${member.name} hat ein eigenes Café eröffnet!`, member.name); } catch (e) {}
    try {
      const ex = (currentUserData && currentUserData.achievements) || {};
      if (!ex.cafe_open) { await DB.grantAchievements(member.id, { cafe_open:true });
        currentUserData = { ...currentUserData, achievements:{ ...ex, cafe_open:true } };
        const a = (typeof ACHIEVEMENTS!=='undefined'?ACHIEVEMENTS:[]).find(x=>x.id==='cafe_open');
        if (a) showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success'); }
    } catch (e) {}
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}

async function _cafeToggleBeans(on, member) {
  try {
    const res = await DB.setCafeBeans(member.id, on);
    _cafeSyncUser(res, member);
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { /* non-critical */ }
}
async function _cafeSetPolicy(member, ratio, autobuild) {
  try {
    const st = cafeState(member);
    const r = ratio == null ? st.payoutRatio : Math.max(0, Math.min(CAFE_P.maxPayout, ratio));
    const a = autobuild == null ? st.autoBuild : autobuild;
    const res = await DB.setCafePolicy(member.id, r, a);
    _cafeSyncUser(res, member);
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { /* non-critical */ }
}
async function _cafeClaimTask(taskId, reward, member) {
  try {
    const res = await DB.claimCafeTask(member.id, taskId, reward);
    if (res?.error === 'already') { showToast('Diese Aufgabe hast du heute schon abgeholt.', 'info'); return; }
    if (res?.error) { showToast('Konnte nicht abholen.', 'error'); return; }
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
    if (res.coins != null) { currentUserData = { ...(currentUserData||{}), coins: res.coins }; if (typeof _updateHeaderCoins==='function') _updateHeaderCoins(currentUserData); }
    try { await DB.appendTodayLogFresh(member.id, [{ label:'📋 Café-Tagesaufgabe', amount:(res.reward||reward), cat:'cafe', detail:'Belohnung', aggKey:'cafe_task', aggBase:'📋 Café-Tagesaufgaben' }]); } catch (e) {}
    showToast(`📋 Aufgabe erledigt: +${_cFmt(res.reward||reward)} CC`, 'success');
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}
async function _cafeUnlockRecipe(id, cost, member) {
  try {
    const res = await DB.unlockCafeRecipe(member.id, id, cost);
    if (res?.error) {
      const map = { insufficient_kasse:'Café-Kasse zu niedrig.', already:'Schon freigeschaltet.', not_found:'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Freischalten fehlgeschlagen', 'error'); return;
    }
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
    const d = CAFE_REZEPTE[id] || { name:id };
    try { await DB.appendTodayLogFresh(member.id, [{ label:`📖 Rezept: ${d.name}`, amount:-(cost), cat:'cafe', kapital:true, detail:'aus Café-Kasse' }]); } catch (e) {}
    showToast(`📖 Rezept freigeschaltet: ${d.name}`, 'success');
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}
async function _cafePickStil(id, minUmsatz, member) {
  try {
    const res = await DB.setCafeStil(member.id, id, minUmsatz);
    if (res?.error === 'locked') { showToast('Dieser Stil ist noch nicht freigeschaltet.', 'info'); return; }
    _cafeSyncUser(res, member);
    _cafeView = 'main';
    showToast(`✨ Stil gewechselt: ${cafeStilDef(id).name}`, 'success');
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Idle-Claim (server-autoritativ) — credited = Ausschüttung an die Hauptkasse ─
let _cafeClaiming = false, _cafeThrottleTs = 0;
async function cafeMaybeClaim(member, silent, force) {
  if (_cafeClaiming) return false;
  if (!force && Date.now() - _cafeThrottleTs < 5 * 60 * 1000) return false;
  _cafeThrottleTs = Date.now();
  member = (typeof currentUserData !== 'undefined' && currentUserData) || member;
  if (!member || !cafeResearchUnlocked(member)) return false;
  const st = cafeState(member); if (!st.opened) return false;
  if (!st.lastClaim) { try { await DB.claimCafe(member.id, 0, 0, 0, st.ruf, 0, 0, true); } catch (e) {} return false; }
  const b = cafeBranch(st);
  const m = cafeDayMetrics(member, st, b);
  _cafeClaiming = true;
  try {
    const res = await DB.claimCafe(member.id, m.netto, m.beansStd, m.beansOeko, m.rufTarget, m.umsatz, m.kunden, false);
    if (res?.error || !res || res.nothing) return false;
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; if (member!==currentUserData) member.map_data = res.map_data; }
    const credited = res.credited || 0;
    if (res.coins != null) { currentUserData = { ...(currentUserData||{}), coins: res.coins }; if (typeof _updateHeaderCoins==='function') _updateHeaderCoins(currentUserData); }
    if (credited > 0) {
      try { await DB.appendTodayLogFresh(member.id, [{ label:`☕ Café-Ausschüttung (${res.days||0} Tag${(res.days||0)===1?'':'e'})`, amount:credited, cat:'cafe', detail:`Gewinn ${_cFmt(res.net||0)} · Quote ${st.payoutRatio}%`, aggKey:'cafe_dist', aggBase:'☕ Café-Ausschüttung' }]); } catch (e) {}
      if (!silent) showToast(`☕ Café-Ausschüttung: +${_cFmt(credited)} CC (${res.days||0} Tage)`, 'success');
    }
    try { await _cafeGrantAch(member, res, m); } catch (e) {}
    // Auto-Ausbau: reinvestiert thésaurierten Gewinn (rein café-intern, kein Coin-Fluss)
    if (st.autoBuild) { try { await _cafeAutoBuild(member); } catch (e) {} }
    return true;
  } catch (e) { return false; }
  finally { _cafeClaiming = false; }
}

async function _cafeAutoBuild(member) {
  for (let i = 0; i < 4; i++) {
    const st = cafeState(currentUserData || member), b = cafeBranch(st);
    const m = cafeDayMetrics(currentUserData || member, st, b);
    const reserve = Math.max(200, Math.round((m.miete + m.lohn) * CAFE_P.autoReserveDays));
    const next = _cafeCheapestNext(b);
    if (!next || (st.kasse - reserve) < next.cost) break;
    const res = await DB.buyCafeItem(member.id, next.cat, next.key, next.cost, next.name);
    if (res?.error) break;
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
    try { await DB.appendTodayLogFresh(member.id, [{ label:`🤖 Auto-Ausbau: ${next.name}`, amount:-(res.cost||next.cost), cat:'cafe', kapital:true, detail:'aus Café-Kasse' }]); } catch (e) {}
  }
}

async function _cafeGrantAch(member, res, m) {
  const lt = (res.lifetime) || {};
  const ex = (currentUserData && currentUserData.achievements) || {};
  const grant = {};
  if (!ex.cafe_100  && (lt.gaeste||0) >= 100)   grant.cafe_100 = true;
  if (!ex.cafe_1000 && (lt.gaeste||0) >= 1000)  grant.cafe_1000 = true;
  if (!ex.cafe_5star && m.zufr >= 1.35)         grant.cafe_5star = true;
  if (!ex.cafe_tycoon && (lt.umsatz||0) >= 50000) grant.cafe_tycoon = true;
  const keys = Object.keys(grant); if (!keys.length) return;
  await DB.grantAchievements(member.id, grant);
  currentUserData = { ...currentUserData, achievements:{ ...ex, ...grant } };
  const A = (typeof ACHIEVEMENTS!=='undefined'?ACHIEVEMENTS:[]);
  keys.forEach(k => { const a = A.find(x=>x.id===k); if (a) showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success'); });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Szene: warmes Hintergrundbild + Ambient-Animation (Dampf, Licht-Atmen)
//  + Gäste-Ticker (DOM). Reine Deko/Feedback — schreibt NIE Coins.
// ═══════════════════════════════════════════════════════════════════════════
const _cafeSceneCache = {};
function _cafeSceneImage(src) {
  if (_cafeSceneCache[src]) return _cafeSceneCache[src];
  const img = new Image(); img.src = src; _cafeSceneCache[src] = img; return img;
}

function _cafeStartScene(member, st, b) {
  const cv = document.getElementById('cafe-canvas'); if (!cv) return;
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (_cafeRaf) { cancelAnimationFrame(_cafeRaf); _cafeRaf = null; }

  const stil = cafeStilDef(st.stil);
  const img = _cafeSceneImage(stil.scene);
  const metrics = cafeDayMetrics(member, st, b);
  const lamps = [{x:.20,y:.30},{x:.50,y:.22},{x:.72,y:.28}];
  let t = 0, steam = [];

  function coverDraw() {
    if (!img.complete || !img.naturalWidth) { ctx.fillStyle = '#20120b'; ctx.fillRect(0,0,W,H); return; }
    const ir = img.naturalWidth / img.naturalHeight, cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw)/2; dy = 0; } else { dw = W; dh = W / ir; dx = 0; dy = (H - dh)/2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  function draw() {
    coverDraw();
    // sanftes „Atmen" des warmen Lichts
    const pulse = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(t/60));
    lamps.forEach(l => {
      const g = ctx.createRadialGradient(l.x*W, l.y*H, 4, l.x*W, l.y*H, 120);
      g.addColorStop(0, `rgba(255,206,120,${0.10 + 0.06*pulse})`); g.addColorStop(1, 'rgba(255,206,120,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    });
    // Dampf aus dem Thekenbereich (Mitte)
    if (!reduce) {
      if (t % 10 === 0 && steam.length < 26) steam.push({ x: W*0.5 + (Math.random()*40-20), y: H*0.42, a: 0.5 + Math.random()*0.3 });
      steam.forEach(s => { s.y -= 0.5; s.a -= 0.006; s.x += Math.sin(s.y/16)*0.3; });
      steam = steam.filter(s => s.a > 0);
      steam.forEach(s => { ctx.fillStyle = `rgba(240,232,220,${s.a*0.4})`; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); });
    }
    // warme Vignette für Tiefe
    const vg = ctx.createRadialGradient(W/2, H*0.52, H*0.35, W/2, H*0.52, H*0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,4,0.42)');
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  }
  function loop() { if (!document.getElementById('cafe-canvas')) { _cafeRaf = null; return; } t++; draw(); _cafeRaf = requestAnimationFrame(loop); }
  if (img.complete) draw(); else img.onload = draw;
  _cafeRaf = requestAnimationFrame(loop);

  // Gäste-Ticker (DOM)
  _cafeRenderGaeste(stil, metrics);
}

function _cafeRenderGaeste(stil, m) {
  const box = document.getElementById('cafe-gaeste'); if (!box) return;
  const typen = stil.klientel.split(',').map(s => s.trim());
  const moodFor = (z) => z >= 1.25 ? ['😄','Sehr zufrieden'] : z >= 1.05 ? ['😊','Zufrieden'] : z >= 0.85 ? ['😐','Ok'] : ['😕','Unzufrieden'];
  const nextIn = Math.max(3, Math.round(1400 / Math.max(6, m.kunden)));  // Sekunden bis nächster Gast (grob)
  const pick = typen.slice(0, 3);
  const rows = pick.map((t, i) => {
    const [emo, lbl] = moodFor(m.zufr + (i===1?0.1:0) - (i===2?0.08:0));
    return `<div class="cc-gast"><span class="cc-gast-n">${_cEsc(t)}</span><span class="cc-gast-m">${emo} ${lbl}</span></div>`;
  }).join('');
  box.innerHTML = `<div class="cc-gaeste-head">👥 Gäste</div>${rows}<div class="cc-gast-next">Nächster Gast in ~${nextIn}s</div>`;
}
