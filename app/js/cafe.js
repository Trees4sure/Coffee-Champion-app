// ═══════════════════════════════════════════════════════════════════════════
// cafe.js — ☕ Café-Simulator (Erlebnis-Minigame #3)
// Plan: plans/PLAN_cafe.md
// Muss VOR imperium.js geladen werden (imperium.js hängt den Tab ein, delegiert
// an _buildCafe). Ownt seinen eigenen DOM/Canvas (Muster wie kaffeemobil.js).
//
// State lebt in map_data.cafe (single-player, filialfähig → branches[]). Kein neues
// Tabellen-Schema; RPCs open_cafe / buy_cafe_item / claim_cafe arbeiten auf map_data.
// Ökonomie ist IDLE + server-autoritativ: der Client rechnet die Tagesraten (Formeln
// unten), die RPC claim_cafe multipliziert mit dem Zeit-Delta (Deckel 14 Tage).
// Die 2D-Szene ist reine Deko/Feedback — sie schreibt NIE Coins (kein Exploit).
// ═══════════════════════════════════════════════════════════════════════════

// ── Katalog (Balance-Platzhalter, zentral & leicht justierbar) ───────────────
// Geräte: Güteklassen 0(=nicht gekauft)..maxLevel. cost[i] = Preis von Stufe i→i+1.
const CAFE_EQUIP = {
  maschine: { icon:'☕', name:'Espressomaschine', max:4, cost:[450,1400,3800,9000],
              kap:[60,110,175,260], quality:[0.25,0.55,0.85,1.15],       // je Stufe: Kapazität(Tassen/Tag) + Qualitäts-Index
              tiers:['Einsteiger-Siebträger','Halbautomat','Dual-Boiler','Siebträger-Ikone'] },
  muehle:   { icon:'⚙️', name:'Mühle', max:3, cost:[300,900,2400], quality:[0.10,0.25,0.40],
              tiers:['Handmühle','Scheibenmühle','Präzisionsmühle'] },
  kuehlung: { icon:'🧊', name:'Kühlung', max:3, cost:[250,800,2000], menu:[0.4,0.9,1.4],   // hebt Ø-Menüwert (Cold Brew/Kuchen)
              tiers:['Kühlschrank','Kühltheke','Vitrinen-Kühlung'] },
  theke:    { icon:'🪟', name:'Theke', max:3, cost:[250,700,1600], service:[1,2,3],          // Service-Stufe senkt Warte-Abbrüche
              tiers:['Holztheke','Servicetheke','Barista-Station'] },
};
// Möbel: Anzahl (tische) bzw. Stufe (deko/sofa). Hip-Score → Kundenzahl.
const CAFE_MOEBEL = {
  tische: { icon:'🪑', name:'Tisch (+2 Plätze)', kind:'count', max:12, cost:180, hip:3, seats:2 },
  deko:   { icon:'🖼️', name:'Deko-Stufe',        kind:'level', max:3, cost:[400,900,1800], hip:8 },
  sofa:   { icon:'🛋️', name:'Loungesofa',        kind:'level', max:2, cost:[1200,2600], hip:12, seats:3 },
};
const CAFE_STAFF = {
  barista: { icon:'👷', name:'Barista', max:4, hire:600, lohn:25, kapBonus:45 },   // +Kapazität-Deckel, kostet Lohn/Tag
};

// Formel-Parameter (Balance §5, §13). Café = mittlere, spürbare Einkommensquelle.
const CAFE_P = {
  kundenBasis: 70,       // Grund-Laufkundschaft
  menuBase: 4.5,         // Ø-Getränkewert (CC) vor Qualität/Kühlung
  ccCap: 10,             // Deckel CC/Tasse
  umschlag: 10,          // Sitzplatz-Umschlag pro Tag
  zutatCC: 0.4,          // Zutatenkosten CC/Tasse (CC-Fallback ohne Bohnen)
  mieteBasis: 40, mietePGeraet: 6, mietePMoebel: 4,
  rufEase: 0.15,         // Ruf nähert sich Tages-Zufriedenheit
  claimCapDays: 14,
  openMinInvest: 2500,   // Richtwert Mindest-Setup (Anzeige)
};

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
  return {
    version: c.version || 1, opened: !!c.opened, openedAt: c.openedAt || null,
    lastClaim: c.lastClaim || null, useBeans: c.useBeans !== false, ruf: c.ruf || 0,
    lifetime: c.lifetime || { umsatz:0, gaeste:0, netto:0 },
    lastPurchase: c.lastPurchase || null,
    branches: branches.map(b => ({ ...cafeDefaultBranch(), ...b,
      equip:{ ...cafeDefaultBranch().equip, ...(b.equip||{}) },
      moebel:{ ...cafeDefaultBranch().moebel, ...(b.moebel||{}) },
      staff:{ ...cafeDefaultBranch().staff, ...(b.staff||{}) } })),
  };
}
function cafeBranch(state) { return state.branches[0]; }

function cafeResearchUnlocked(member) {
  const r = (member && member.research) || {};
  return !!r.erstes_cafe;
}

// ── Formeln (rein, für Preview UND als Client-Rate an claim_cafe) ─────────────
function cafeHipScore(b) {
  return b.moebel.tische * CAFE_MOEBEL.tische.hip
       + b.moebel.deko   * CAFE_MOEBEL.deko.hip
       + b.moebel.sofa   * CAFE_MOEBEL.sofa.hip;
}
function cafeSeats(b) {
  return b.moebel.tische * CAFE_MOEBEL.tische.seats + b.moebel.sofa * CAFE_MOEBEL.sofa.seats;
}
// Sicherer Tier-Wert: Level auf die Array-Länge geklemmt (nie undefined/NaN, auch bei Über-Level).
function _cafeTier(arr, lvl) { if (!lvl || lvl <= 0) return 0; return arr[Math.min(lvl, arr.length) - 1] || 0; }
function cafeCapacity(b) {
  return _cafeTier(CAFE_EQUIP.maschine.kap, b.equip.maschine) + b.staff.barista * CAFE_STAFF.barista.kapBonus;
}
function cafeQualityIndex(b) {
  return 1 + _cafeTier(CAFE_EQUIP.maschine.quality, b.equip.maschine) + _cafeTier(CAFE_EQUIP.muehle.quality, b.equip.muehle);
}
function cafeMenuValue(b) { return CAFE_P.menuBase + _cafeTier(CAFE_EQUIP.kuehlung.menu, b.equip.kuehlung); }
function cafeServiceLevel(b) { return _cafeTier(CAFE_EQUIP.theke.service, b.equip.theke); }

function cafeKundenzahl(state, b) {
  const hip = cafeHipScore(b);
  const rufF = 0.6 + 0.4 * (state.ruf / 100);
  return Math.round(CAFE_P.kundenBasis * (1 + hip / 100) * rufF);
}
function cafeVerkauft(state, b) {
  const kunden = cafeKundenzahl(state, b);
  const kap = cafeCapacity(b);
  const sitz = cafeSeats(b) * CAFE_P.umschlag;
  return Math.max(0, Math.min(kunden, kap, sitz));
}
function cafeCcProTasse(b) {
  return Math.min(CAFE_P.ccCap, cafeMenuValue(b) * cafeQualityIndex(b));
}
// Öko-Bohnen-Bonus (0..0.15) auf die Zufriedenheit — nur wenn useBeans & Öko-Vorrat vorhanden.
function cafeOekoBonus(member, state) {
  if (!state.useBeans) return 0;
  const oeko = ((member.map_data || {}).rohstoffe || {}).oeko || 0;
  return oeko > 0 ? 0.15 : 0;
}
function cafeZufriedenheit(member, state, b) {
  const kunden = cafeKundenzahl(state, b);
  const kap = Math.max(1, cafeCapacity(b));
  const andrang = kunden / kap;                       // >1 = Überlauf, Wartezeit
  const svc = cafeServiceLevel(b) * 0.05;             // Theke federt Andrang ab
  const qBonus = (cafeQualityIndex(b) - 1) * 0.3;
  let z = 1.4 - 0.5 * Math.max(0, andrang - 1 - svc) + qBonus + cafeOekoBonus(member, state);
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
  const ccTasse  = cafeCcProTasse(b);
  const zufr     = cafeZufriedenheit(member, state, b);
  const umsatz   = Math.round(verkauft * ccTasse * zufr);
  const miete    = cafeMietePerDay(b);
  const lohn     = cafeLohnPerDay(b);
  // Zutaten: mit Bohnen ODER CC. Bohnen 1 CT ~ 1 Tasse; Öko zuerst, dann Std, Rest als CC.
  const useBeans = state.useBeans;
  const roh = (member.map_data || {}).rohstoffe || {};
  let beansOeko = 0, beansStd = 0, zutatCC = 0;
  if (useBeans) {
    const needOeko = Math.min(verkauft, roh.oeko || 0);
    const needStd  = Math.min(verkauft - needOeko, roh.std || 0);
    beansOeko = needOeko; beansStd = needStd;
    zutatCC = Math.round((verkauft - needOeko - needStd) * CAFE_P.zutatCC);
  } else {
    zutatCC = Math.round(verkauft * CAFE_P.zutatCC);
  }
  let netto = umsatz - miete - lohn - zutatCC;
  netto = Math.max(netto, -miete);                    // Negativ-Schutz: höchstens die Miete verlieren
  const kap  = Math.max(1, cafeCapacity(b));
  return { kunden, verkauft, ccTasse:Math.round(ccTasse*10)/10, zufr:Math.round(zufr*100)/100,
    umsatz, miete, lohn, zutatCC, beansOeko, beansStd, netto,
    kapazitaet:kap, auslastung:Math.round(verkauft / kap * 100),
    rufTarget: Math.round(state.ruf + (zufr * 100 - state.ruf) * CAFE_P.rufEase) };
}

// Netto/Tag — für die Passiv-Summe (Statistik, app.js). 0 wenn nicht eröffnet.
function cafePerDay(member) {
  try {
    if (!cafeResearchUnlocked(member)) return 0;
    const st = cafeState(member); if (!st.opened) return 0;
    return cafeDayMetrics(member, st, cafeBranch(st)).netto;
  } catch (e) { return 0; }
}

// Mindeststandard für „Eröffnen" (summiert sich per Design auf ~2 500 CC).
function cafeCanOpen(b) {
  return b.equip.maschine >= 1 && b.equip.muehle >= 1 && b.equip.theke >= 1
      && b.moebel.tische >= 3 && b.staff.barista >= 1;
}
function cafeInvested(b) {
  let sum = 0;
  for (const k in CAFE_EQUIP) { const e = CAFE_EQUIP[k]; for (let i = 0; i < b.equip[k]; i++) sum += e.cost[i]; }
  const t = CAFE_MOEBEL.tische; sum += b.moebel.tische * t.cost;
  for (let i = 0; i < b.moebel.deko; i++) sum += CAFE_MOEBEL.deko.cost[i];
  for (let i = 0; i < b.moebel.sofa; i++) sum += CAFE_MOEBEL.sofa.cost[i];
  sum += b.staff.barista * CAFE_STAFF.barista.hire;
  return sum;
}
// Preis des nächsten Kaufs einer Kategorie (null = Maximum erreicht).
function cafeNextCost(b, cat, key) {
  if (cat === 'equip') { const e = CAFE_EQUIP[key]; return b.equip[key] < e.max ? e.cost[b.equip[key]] : null; }
  if (cat === 'staff') { const s = CAFE_STAFF[key]; return b.staff[key] < s.max ? s.hire : null; }
  const m = CAFE_MOEBEL[key];
  if (m.kind === 'count') return b.moebel[key] < m.max ? m.cost : null;
  return b.moebel[key] < m.max ? m.cost[b.moebel[key]] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  UI (ownt DOM; von imperium.js delegiert: _renderImperiumTab('cafe', ...))
// ═══════════════════════════════════════════════════════════════════════════
const _cEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
const _cFmt = n => (typeof _fmtCoins === 'function') ? _fmtCoins(n) : Math.round(n).toLocaleString('de-DE');
let _cafeRaf = null;

async function _buildCafe(member, el) {
  member = (typeof currentUserData !== 'undefined' && currentUserData) || member;
  const st = cafeState(member);
  const b  = cafeBranch(st);
  // Beim Öffnen automatisch den aufgelaufenen Ertrag abrechnen (idle-Claim).
  if (st.opened) { try { await cafeMaybeClaim(member, true, true); member = currentUserData || member; } catch (e) {} }
  const st2 = cafeState(member), b2 = cafeBranch(st2);

  el.innerHTML = st2.opened ? _cafeRenderBetrieb(member, st2, b2) : _cafeRenderAufbau(member, st2, b2);
  _cafeBindHandlers(el, member);
  if (st2.opened) _cafeStartScene(member, st2, b2);
}

function _cafeShopHTML(member, st, b, showOpen) {
  const coins = (member.coins || 0);
  const row = (cat, key, label, icon, lvl, max, cost, sub) => {
    let btn;
    if (cost == null) btn = `<span class="cc-cafe-max">✓ max</span>`;
    else if (coins < cost) btn = `<button class="cc-cafe-buy" data-cafe-buy="${cat}:${key}" disabled>${_cFmt(cost)} CC</button>`;
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
  html += '<div class="cc-cafe-shop-col"><h4>🛋️ Einrichtung</h4>';
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
      <p class="cc-cafe-lead">☕ <strong>Dein Café</strong> — kaufe erst die Grundausstattung zusammen. Ist der Mindeststandard erreicht, kannst du <strong>eröffnen</strong>: dann kommen Gäste, jeder Kaffee bringt CoffeeCoins, und dein Café läuft von selbst weiter.</p>
      <div class="cc-cafe-progress">
        <div class="cc-cafe-prog-bar"><span style="width:${pct}%"></span></div>
        <div class="cc-cafe-prog-lbl">🏗️ Grundausstattung investiert: <strong>${_cFmt(invested)}</strong> / ~${_cFmt(CAFE_P.openMinInvest)} CC</div>
      </div>
      ${canOpen
        ? `<button class="cc-cafe-open" data-cafe-open="1">🔓 Café eröffnen</button>`
        : `<div class="cc-cafe-openlock">🔒 Zum Eröffnen fehlt noch: <strong>${_cEsc(missing.join(', '))}</strong></div>`}
    </div>
    ${_cafeShopHTML(member, st, b, true)}
  </div>`;
}

function _cafeRenderBetrieb(member, st, b) {
  const m = cafeDayMetrics(member, st, b);
  const beansTxt = st.useBeans
    ? (m.beansOeko + m.beansStd > 0 ? `🌾 ${m.beansOeko} Öko · ${m.beansStd} Std${m.zutatCC>0?` · +${m.zutatCC} CC`:''}` : `${m.zutatCC} CC (kein Bohnenvorrat)`)
    : `${m.zutatCC} CC`;
  const nettoCls = m.netto >= 0 ? 'pos' : 'neg';
  const amort = (st.lastPurchase && m.netto > 0)
    ? `📈 letzte Anschaffung ${_cEsc(st.lastPurchase.name||'')} (${_cFmt(st.lastPurchase.cost||0)} CC) — bei aktuellem Netto in ~${Math.max(1,Math.ceil((st.lastPurchase.cost||0)/m.netto))} Tagen drin`
    : '';
  return `<div class="cc-cafe">
    <div class="cc-cafe-stage">
      <canvas id="cafe-canvas" width="820" height="440" aria-label="Café-Szene mit Gästen"></canvas>
    </div>
    <div class="cc-cafe-guv">
      <div class="cc-cafe-guv-head">📊 Wirtschaftlichkeit — ${_cEsc(b.name)}</div>
      <div class="cc-cafe-guv-grid">
        <div class="cc-cafe-kpi"><span class="k">Umsatz/Tag</span><span class="v">${_cFmt(m.umsatz)} CC</span></div>
        <div class="cc-cafe-kpi"><span class="k">Miete</span><span class="v neg">−${_cFmt(m.miete)}</span></div>
        <div class="cc-cafe-kpi"><span class="k">Löhne</span><span class="v neg">−${_cFmt(m.lohn)}</span></div>
        <div class="cc-cafe-kpi"><span class="k">Zutaten</span><span class="v neg" title="Bohnen aus dem Anbau-Imperium, Rest als CC">${_cEsc(beansTxt)}</span></div>
        <div class="cc-cafe-kpi big"><span class="k">Netto/Tag</span><span class="v ${nettoCls}">${m.netto>=0?'+':''}${_cFmt(m.netto)} CC</span></div>
      </div>
      <div class="cc-cafe-guv-grid sub">
        <div class="cc-cafe-kpi"><span class="k">Gäste/Tag</span><span class="v">${m.kunden}</span></div>
        <div class="cc-cafe-kpi"><span class="k">verkauft</span><span class="v">${m.verkauft} · ${m.ccTasse} CC/☕</span></div>
        <div class="cc-cafe-kpi"><span class="k">Ø Zufriedenheit</span><span class="v">${(m.zufr).toFixed(2)} ★</span></div>
        <div class="cc-cafe-kpi"><span class="k">Auslastung</span><span class="v">${m.auslastung}%</span></div>
      </div>
      <div class="cc-cafe-ruf"><span>⭐ Ruf</span><div class="cc-cafe-ruf-bar"><span style="width:${Math.round(st.ruf)}%"></span></div><span>${Math.round(st.ruf)}/100</span></div>
      ${amort ? `<p class="cc-cafe-amort">${amort}</p>` : ''}
      <label class="cc-cafe-beans"><input type="checkbox" data-cafe-beans ${st.useBeans?'checked':''}> 🫘 Bohnen aus dem Anbau-Imperium verwenden (🌾 Öko hebt die Zufriedenheit, senkt Kosten)</label>
      <p class="cc-cafe-claimnote">💤 Läuft idle weiter — der Ertrag wird beim Öffnen automatisch gutgeschrieben (max. ${CAFE_P.claimCapDays} Tage angesammelt).</p>
    </div>
    <div class="cc-cafe-shop-title">🛠️ Ausbauen — jedes Upgrade wirkt sofort auf die Zahlen oben</div>
    ${_cafeShopHTML(member, st, b, false)}
  </div>`;
}

function _cafeBindHandlers(el, member) {
  el.onclick = async (e) => {
    const buy = e.target.closest('[data-cafe-buy]');
    if (buy && !buy.disabled) { await _cafeBuy(buy.dataset.cafeBuy, member); return; }
    const open = e.target.closest('[data-cafe-open]');
    if (open) { await _cafeOpen(member); return; }
  };
  const bx = el.querySelector('[data-cafe-beans]');
  if (bx) bx.onchange = async () => { await _cafeToggleBeans(bx.checked, member); };
}

// ── Kauf / Eröffnen / Bohnen-Toggle ──────────────────────────────────────────
async function _cafeBuy(spec, member) {
  try {
    const [cat, key] = spec.split(':');
    const st = cafeState(member), b = cafeBranch(st);
    const cost = cafeNextCost(b, cat, key);
    if (cost == null) { showToast('Höchste Stufe erreicht.', 'info'); return; }
    const label = (cat==='equip'?CAFE_EQUIP[key].name:cat==='staff'?CAFE_STAFF[key].name:CAFE_MOEBEL[key].name);
    const res = await DB.buyCafeItem(member.id, cat, key, cost, label);
    if (res?.error) {
      const map = { insufficient:'Nicht genug CoffeeCoins.', maxed:'Höchste Stufe erreicht.', bad_item:'Unbekannter Posten.', not_found:'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Kauf fehlgeschlagen', 'error'); return;
    }
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
    if (res.coins_left != null) { currentUserData = { ...(currentUserData||{}), coins: res.coins_left }; if (typeof _updateHeaderCoins==='function') _updateHeaderCoins(currentUserData); }
    try { await DB.appendTodayLogFresh(member.id, [{ label:`☕ Café: ${label}`, amount:-(res.cost||0), cat:'cafe', detail:'Café-Ausbau', invest:true }]); } catch (e) {}
    showToast(`☕ ${label} gekauft (−${_cFmt(res.cost||0)} CC)`, 'success');
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
    if (res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
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
    if (res && res.map_data) { currentUserData = { ...(currentUserData||{}), map_data: res.map_data }; member.map_data = res.map_data; }
    _renderImperiumTab('cafe', currentUserData || member);
  } catch (e) { /* non-critical */ }
}

// ── Idle-Claim (server-autoritativ über Zeit-Delta) ──────────────────────────
// silent=true → nur gutschreiben, kein Toast/Chat (Auto-Claim beim Tab-Öffnen/Poll).
// force=true → Throttle umgehen (Tab-Öffnen). Ohne force max. 1 RPC / 5 min (Poll/showApp).
let _cafeClaiming = false, _cafeThrottleTs = 0;
async function cafeMaybeClaim(member, silent, force) {
  if (_cafeClaiming) return false;
  if (!force && Date.now() - _cafeThrottleTs < 5 * 60 * 1000) return false;
  _cafeThrottleTs = Date.now();
  member = (typeof currentUserData !== 'undefined' && currentUserData) || member;
  if (!member || !cafeResearchUnlocked(member)) return false;
  const st = cafeState(member); if (!st.opened) return false;
  // Erstkontakt: nur Zeitstempel setzen (kein rückwirkender Ertrag vor Eröffnung).
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
    if (credited !== 0) {
      try { await DB.appendTodayLogFresh(member.id, [{ label:`☕ Café-Ertrag (${res.days||0} Tag${(res.days||0)===1?'':'e'})`, amount:credited, cat:'cafe', detail:`Umsatz ${_cFmt(m.umsatz)} − Kosten`, aggKey:'cafe_ertrag', aggBase:'☕ Café-Ertrag' }]); } catch (e) {}
      if (!silent) showToast(`☕ Café-Ertrag: ${credited>=0?'+':''}${_cFmt(credited)} CC (${res.days||0} Tage)`, credited>=0?'success':'info');
    }
    // Achievements (ad-hoc, nie kritisch)
    try { await _cafeGrantAch(member, res, m); } catch (e) {}
    return true;
  } catch (e) { return false; }
  finally { _cafeClaiming = false; }
}

async function _cafeGrantAch(member, res, m) {
  const lt = (res.lifetime) || {};
  const ex = (currentUserData && currentUserData.achievements) || {};
  const grant = {};
  if (!ex.cafe_100  && (lt.gaeste||0) >= 100)   grant.cafe_100 = true;
  if (!ex.cafe_1000 && (lt.gaeste||0) >= 1000)  grant.cafe_1000 = true;
  if (!ex.cafe_5star && m.zufr >= 4.8)          grant.cafe_5star = true;
  if (!ex.cafe_tycoon && (lt.umsatz||0) >= 50000) grant.cafe_tycoon = true;
  const keys = Object.keys(grant); if (!keys.length) return;
  await DB.grantAchievements(member.id, grant);
  currentUserData = { ...currentUserData, achievements:{ ...ex, ...grant } };
  const A = (typeof ACHIEVEMENTS!=='undefined'?ACHIEVEMENTS:[]);
  keys.forEach(k => { const a = A.find(x=>x.id===k); if (a) showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success'); });
}

// ═══════════════════════════════════════════════════════════════════════════
//  2D-Szene (Deko/Feedback — schreibt nie Coins). Detaillierter Look wie Skizze.
// ═══════════════════════════════════════════════════════════════════════════
function _cafeStartScene(member, st, b) {
  const cv = document.getElementById('cafe-canvas'); if (!cv) return;
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (_cafeRaf) cancelAnimationFrame(_cafeRaf), _cafeRaf = null;

  const metrics = cafeDayMetrics(member, st, b);
  const spawnEvery = Math.max(14, Math.round(2600 / Math.max(6, metrics.kunden)));   // Andrang → Spawnrate
  const nTables = Math.max(3, Math.min(7, b.moebel.tische || 3));
  const machTier = b.equip.maschine || 1;

  const C = { floorA:'#5a3d28',floorB:'#4f3422',plank:'rgba(0,0,0,.13)',rug:'#7c4636',rugRing:'#9c6650',
    wall:'#2b1a12',wallTrim:'#3d2618',counter:'#6e4526',counterHi:'#875636',counterTop:'#8c5c3a',counterEdge:'#5a3820',
    steel:'#cfd3d5',steelDk:'#9aa0a3',brass:'#d9954f',brassDk:'#b8763a',wood:'#8a5a34',woodDk:'#6b4526',
    chair:'#4d331f',chairHi:'#5f4127',plantPot:'#a8623a',leaf1:'#3f8a4f',leaf2:'#2f6f40',apron:'#3f6d5a',cream:'#f3ead9',board:'#243027' };
  const WALL_H=60, COUNTER_Y=76, COUNTER_H=46, orderPt={x:W/2,y:150}, door={x:W/2,y:H-8};
  const tableXs = []; for (let i=0;i<nTables;i++) tableXs.push(90 + i*((W-180)/Math.max(1,nTables-1)));
  const tables = tableXs.map((x,i)=>({ x, y: 250 + (i%2)*95, occupied:false }));

  const guests=[]; let t=0, steam=[];
  const rnd=(a,c)=>a+Math.random()*(c-a), pick=a=>a[(Math.random()*a.length)|0];
  const SKIN=['#f4d0b0','#e8b48c','#d29b6e','#a9704a','#875838','#ffe0bd'];
  const HAIR=['#2b1b12','#4a2e18','#7a4a1e','#c9a24a','#d9d4cf','#8a8a8a','#b5453a','#1c1c1c'];
  const SHIRT=['#c96b5b','#5b86c9','#6ca86b','#c9a24a','#8a6bb0','#4aa79a','#c97fae','#5a5f6b','#d98b4a'];
  const DRINK=['☕','🥛','🧋','🍰','🧊'];
  const zufr = metrics.zufr;
  const goodC=['Bester Flat White!','Wow, so gemütlich ✨','Komm gern wieder','Perfekte Crema'];
  const mehC=['Etwas lang gewartet…','Naja, geht so'];
  const badC=['Viel zu lange! 😤','Schlange endlos'];

  function spawn(){ if (guests.length>13) return;
    guests.push({ x:door.x+rnd(-14,14), y:H, tx:orderPt.x, ty:orderPt.y, fx:0, fy:-1, state:'toQ',
      scale:rnd(.88,1.14), skin:pick(SKIN), hair:pick(HAIR), hairStyle:(Math.random()*3)|0, shirt:pick(SHIRT),
      acc:(Math.random()*4)|0, carry:(Math.random()*4)|0, patience:rnd(360,660), timer:0, drink:pick(DRINK), table:null, bub:null, bubT:0, mood:1 }); }
  function seat(){ const f=tables.filter(x=>!x.occupied); return f.length?pick(f):null; }
  function mv(g,sp){ const dx=g.tx-g.x,dy=g.ty-g.y,d=Math.hypot(dx,dy); if(d>.001){g.fx=dx/d;g.fy=dy/d;} if(d<sp){g.x=g.tx;g.y=g.ty;return true;} g.x+=dx/d*sp;g.y+=dy/d*sp;return false; }
  function bub(g,txt,m){ g.bub=txt; g.bubT=120; g.mood=m; }

  function step(){ t++; if (t%spawnEvery===0) spawn();
    const q=guests.filter(g=>g.state==='toQ'||g.state==='queue');
    guests.forEach(g=>{ g.timer++;
      if(g.state==='toQ'){ const i=q.indexOf(g); g.tx=orderPt.x-(q.length-1)*15+i*30; g.ty=orderPt.y; if(mv(g,1.7)) g.state='queue'; }
      else if(g.state==='queue'){ const i=q.indexOf(g); g.tx=orderPt.x-(q.length-1)*15+i*30; g.ty=orderPt.y; mv(g,1.5); g.fx=0; g.fy=-1;
        if(i===0 && g.timer>rnd(45,75)){ bub(g,g.drink+' ☕',1); const s=seat(); if(s){s.occupied=true;g.table=s;g.tx=s.x;g.ty=s.y+22;g.state='toSeat';} else {g.state='leave';g.tx=door.x;g.ty=H+24;} g.timer=0; }
        else if(g.timer>g.patience){ g.state='leave'; g.tx=door.x; g.ty=H+24; bub(g,pick(badC),0); g.timer=0; } }
      else if(g.state==='toSeat'){ if(mv(g,1.9)){g.state='sit';g.fx=0;g.fy=1;g.timer=0;} }
      else if(g.state==='sit'){ if(g.timer>rnd(160,260)){ const good=Math.random()<Math.max(.3,Math.min(.92,zufr/1.4)); bub(g,good?pick(goodC):pick(mehC),good?1:.5); if(g.table)g.table.occupied=false; g.state='leave'; g.tx=door.x; g.ty=H+24; g.timer=0; } }
      else if(g.state==='leave'){ mv(g,2.2); }
      if(g.bubT>0)g.bubT--; });
    for(let i=guests.length-1;i>=0;i--) if(guests[i].y>H+20) guests.splice(i,1);
  }

  function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function guest(g){ const s=g.scale, hx=g.x+g.fx*2.2*s, hy=g.y-3*s+g.fy*2.2*s;
    ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(g.x,g.y+11*s,12*s,5*s,0,0,7); ctx.fill();
    const tw=22*s,th=17*s; ctx.fillStyle=g.shirt; rr(g.x-tw/2,g.y-th/2+3,tw,th,7); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.12)'; rr(g.x-tw/2,g.y+th*0.18,tw,th*0.42,6); ctx.fill();
    if(g.hairStyle===2){ ctx.fillStyle=g.hair; ctx.beginPath(); ctx.arc(hx,hy+2*s,10*s,0,7); ctx.fill(); }
    ctx.fillStyle=g.skin; ctx.beginPath(); ctx.arc(hx,hy,7.5*s,0,7); ctx.fill();
    if(g.acc===2){ ctx.fillStyle='#b5453a'; ctx.beginPath(); ctx.arc(hx-g.fx*1.5*s,hy-g.fy*1.5*s,8*s,0,7); ctx.fill(); }
    else if(g.hairStyle!==3){ ctx.fillStyle=g.hair; ctx.beginPath(); ctx.arc(hx-g.fx*2*s,hy-g.fy*2*s,7.8*s,0,7); ctx.fill(); if(g.hairStyle===1){ctx.beginPath();ctx.arc(hx-g.fx*8*s,hy-g.fy*8*s,3.6*s,0,7);ctx.fill();} }
    const ex=hx+g.fx*3.4*s,ey=hy+g.fy*3.4*s,px=-g.fy,py=g.fx; ctx.fillStyle='#3a2a20';
    ctx.beginPath(); ctx.arc(ex+px*2.3*s,ey+py*2.3*s,1.1*s,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(ex-px*2.3*s,ey-py*2.3*s,1.1*s,0,7); ctx.fill();
    if(g.acc===1){ ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(ex+px*2.3*s,ey+py*2.3*s,2.2*s,0,7); ctx.arc(ex-px*2.3*s,ey-py*2.3*s,2.2*s,0,7); ctx.stroke(); }
    if(g.bubT>0&&g.bub){ ctx.font='12px system-ui,sans-serif'; const w=ctx.measureText(g.bub).width+16; const bx=Math.max(8,Math.min(W-w-8,g.x-w/2)),by=g.y-20*s-16;
      ctx.globalAlpha=Math.min(1,g.bubT/30); ctx.fillStyle=g.mood>=1?'#f6eedd':g.mood>=.5?'#efe0c6':'#e9c6bb'; rr(bx,by,w,21,7); ctx.fill();
      ctx.fillStyle='#2a1d14'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(g.bub,bx+8,by+11); ctx.globalAlpha=1; } }

  function draw(){
    ctx.fillStyle=C.floorA; ctx.fillRect(0,0,W,H);
    for(let y=WALL_H;y<H;y+=22){ ctx.fillStyle=((y/22)&1)?C.floorB:C.floorA; ctx.fillRect(0,y,W,22); ctx.strokeStyle=C.plank; ctx.beginPath(); ctx.moveTo(0,y+.5); ctx.lineTo(W,y+.5); ctx.stroke(); }
    ctx.save(); ctx.globalAlpha=.9; ctx.fillStyle=C.rug; ctx.beginPath(); ctx.ellipse(W/2,335,300,110,0,0,7); ctx.fill(); ctx.strokeStyle=C.rugRing; ctx.lineWidth=4; ctx.beginPath(); ctx.ellipse(W/2,335,275,96,0,0,7); ctx.stroke(); ctx.restore();
    // Pflanzen
    [[30,140],[W-30,140]].forEach(([px,py])=>{ ctx.fillStyle=C.plantPot; rr(px-14,py,28,18,4); ctx.fill(); for(let i=0;i<7;i++){ const a=-Math.PI/2+(i-3)*0.42,L=rnd(22,30); ctx.fillStyle=(i&1)?C.leaf1:C.leaf2; ctx.save(); ctx.translate(px,py-2); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0,-L/2,6,L/2,0,0,7); ctx.fill(); ctx.restore(); } });
    // Wand
    ctx.fillStyle=C.wall; ctx.fillRect(0,0,W,WALL_H); ctx.fillStyle=C.wallTrim; ctx.fillRect(0,WALL_H-5,W,5);
    ctx.fillStyle=C.board; rr(40,10,180,40,4); ctx.fill(); ctx.strokeStyle=C.brassDk; ctx.lineWidth=3; ctx.stroke();
    ctx.fillStyle='rgba(243,234,217,.85)'; ctx.font='11px Georgia,serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('☕ Espresso  🥛 Flat White', 52, 22); ctx.fillText('🍰 Kuchen  🧊 Cold Brew', 52, 38);
    const wx=305; ctx.fillStyle='#cfe6ff'; rr(wx,8,210,44,4); ctx.fill(); ctx.strokeStyle=C.wallTrim; ctx.lineWidth=5; ctx.stroke();
    ctx.strokeStyle='rgba(60,38,24,.9)'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(wx+105,8); ctx.lineTo(wx+105,52); ctx.moveTo(wx,30); ctx.lineTo(wx+210,30); ctx.stroke();
    [200,410,620].forEach(x=>{ ctx.strokeStyle='#241009'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,54); ctx.stroke(); ctx.fillStyle='rgba(255,214,150,.95)'; ctx.beginPath(); ctx.arc(x,60,5,0,7); ctx.fill(); });
    // Barista
    const bxp=470; ctx.fillStyle=C.apron; rr(bxp-12,40,24,24,7); ctx.fill(); ctx.fillStyle='#e8b48c'; ctx.beginPath(); ctx.arc(bxp,38,8,0,7); ctx.fill(); ctx.fillStyle='#3a2416'; ctx.beginPath(); ctx.arc(bxp,36,8,Math.PI,0); ctx.fill();
    // Theke
    ctx.fillStyle=C.counter; rr(50,COUNTER_Y,W-100,COUNTER_H,7); ctx.fill(); ctx.fillStyle=C.counterTop; rr(50,COUNTER_Y-6,W-100,12,6); ctx.fill();
    for(let x=90;x<W-60;x+=46){ ctx.strokeStyle=C.counterEdge; ctx.beginPath(); ctx.moveTo(x,COUNTER_Y+8); ctx.lineTo(x,COUNTER_Y+COUNTER_H-6); ctx.stroke(); }
    // Vitrine
    ctx.fillStyle='rgba(210,232,236,.5)'; rr(80,COUNTER_Y-20,140,18,4); ctx.fill(); ['#e6b24a','#d98a4a','#c96b5b'].forEach((c,i)=>{ ctx.fillStyle=c; ctx.beginPath(); ctx.arc(102+i*38,COUNTER_Y-11,6,Math.PI,0); ctx.fill(); });
    // Espressomaschine (Größe/Glanz nach Güteklasse)
    const mw=70+machTier*8, mx=W/2-mw/2, my=COUNTER_Y-28;
    ctx.fillStyle=C.steelDk; rr(mx,my,mw,30,5); ctx.fill(); ctx.fillStyle=C.steel; rr(mx+4,my+3,mw-8,14,3); ctx.fill();
    ctx.fillStyle=C.brass; rr(mx+mw/2-16,my+5,32,9,2); ctx.fill();
    for(let i=0;i<Math.min(6,2+machTier);i++){ ctx.fillStyle=C.cream; ctx.beginPath(); ctx.arc(mx+12+i*((mw-20)/5),my-2,3.2,0,7); ctx.fill(); }
    ctx.fillStyle=C.brass; ctx.beginPath(); ctx.arc(mx+mw*0.32,my+30,6,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(mx+mw*0.68,my+30,6,0,7); ctx.fill();
    // Kasse
    ctx.fillStyle='#33251b'; rr(W-190,COUNTER_Y-18,40,16,3); ctx.fill(); ctx.fillStyle='#6fd0a0'; rr(W-185,COUNTER_Y-14,18,9,2); ctx.fill();
    // Dampf
    if(!reduce){ if(t%9===0) steam.push({x:W/2+rnd(-18,18),y:COUNTER_Y-8,a:1}); steam.forEach(s=>{ s.y-=.55; s.a-=.012; s.x+=Math.sin(s.y/12)*.3; }); steam=steam.filter(s=>s.a>0); }
    // Tische
    tables.forEach(tb=>{ ctx.fillStyle=C.chair; rr(tb.x-9,tb.y-24,18,13,4); ctx.fill(); ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(tb.x,tb.y+4,20,8,0,0,7); ctx.fill();
      ctx.fillStyle=C.wood; ctx.beginPath(); ctx.arc(tb.x,tb.y,18,0,7); ctx.fill(); ctx.strokeStyle=C.woodDk; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#b5453a'; ctx.beginPath(); ctx.arc(tb.x+8,tb.y-3,3,0,7); ctx.fill(); ctx.fillStyle=C.chair; rr(tb.x-9,tb.y+11,18,13,4); ctx.fill(); });
    guests.forEach(g=>{ if(g.state==='sit'&&g.table){ ctx.fillStyle='#e7e0d2'; ctx.beginPath(); ctx.arc(g.table.x-6,g.table.y-2,5,0,7); ctx.fill(); ctx.fillStyle=C.cream; ctx.beginPath(); ctx.arc(g.table.x-6,g.table.y-2,3,0,7); ctx.fill(); } });
    // Tür
    ctx.fillStyle='#3a2416'; rr(door.x-32,H-8,64,8,3); ctx.fill(); ctx.fillStyle='rgba(243,233,220,.6)'; ctx.font='10px system-ui'; ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillText('EINGANG',door.x,H-11);
    guests.slice().sort((a,b)=>a.y-b.y).forEach(guest);
    if(!reduce) steam.forEach(s=>{ ctx.fillStyle='rgba(233,226,214,'+s.a*.5+')'; ctx.beginPath(); ctx.arc(s.x,s.y,3,0,7); ctx.fill(); });
  }

  function loop(){ if(!document.getElementById('cafe-canvas')){ _cafeRaf=null; return; } step(); draw(); _cafeRaf=requestAnimationFrame(loop); }
  for(let i=0;i<3;i++) setTimeout(spawn, i*300);
  _cafeRaf = requestAnimationFrame(loop);
}
