// ═══════════════════════════════════════════════════════════════════════════
// weltraum_sold.js — ⚓ Flottensold · 🏛️ Kolonie-Verwaltung · ⚡ Betriebskosten
// NACH weltraum_stats.js laden.
//
// Das Endgame-Problem (JP 2026-08-06): über 800.000 CC, alles erforscht, CC wird
// im All nur noch EINMALIG ausgegeben. Es fehlt eine laufende Ausgabenseite.
//
// Lösung ohne SQL: zeitbasierte Abbuchung beim Login — das exakte Spiegelbild von
// `claimPassive` in db.js. Dort wird Einkommen für die verstrichene Zeit
// gutgeschrieben, hier wird Unterhalt für dieselbe Zeit abgebucht. Wer die App
// nicht öffnet, bekommt beides nicht; die Symmetrie stimmt also.
//
// ⚠️ BEWUSST OHNE ZÄHNE (JP-Entscheidung): Reicht das Guthaben nicht, wird nur
// abgebucht, was da ist — der Rest wird ERLASSEN. Kein Schuldenkonto, keine
// Sperre. Das Einmotten unbezahlter Flotten wäre die eigentliche Konsequenz,
// lässt sich aber clientseitig nicht durchsetzen: Kampfkraft rechnet der Server
// aus `space.fleets` und ignoriert jedes Client-Flag. Diese Regel steht in
// PLAN_weltraum_ausbau.md §B.5 für Claude Code bereit.
//
// ⚠️ AUTORITÄTS-REGEL: Es wird NUR gelesen (Flotte, Kolonien, Anlagen) und über
// die bestehenden RPCs `spend_coins` und `save_map_data` geschrieben. Kein
// Eingriff in `space`.
// ⚠️ Regel 4: jede Abbuchung landet im Tages-Log (Rubrik `weltraum`).
// ⚠️ Regel 3: nichts hier darf die App kippen.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
'use strict';

if (typeof DB === 'undefined' || typeof window.wrLive !== 'function') {
  console.warn('[wr-sold] weltraum_stats.js muss VOR dieser Datei geladen werden.');
  return;
}

// ── Sätze (frei justierbar) ────────────────────────────────────────────────
// ⚠️ Das sind KEINE Spiegel-Konstanten — sie existieren serverseitig nicht und
// dürfen deshalb hier frei gesetzt werden. Bezugsgrösse ist jeweils der
// CC-Bauwert aus SPACE_SHIPS / SPACE_TURRETS / SPACE_POWER (die sind Spiegel und
// werden nur GELESEN).
const WRS_SOLD_SHIP   = 0.01;   // 1,0 % des Bauwerts pro Tag und Schiff
const WRS_SOLD_ROUTE  = 0.005;  // stationierte Schiffe zur Hälfte — sie erwirtschaften selbst
const WRS_SOLD_ANLAGE = 0.005;  // 0,5 % für Geschütze und Reaktoren
const WRS_SOLD_STATION = 0.01;  // 1,0 % — die Station ist das mächtigste Bauwerk im Spiel
                                //   und war als einziges ohne jeden Unterhalt (JP 2026-08-06)
const WRS_KOL_BASIS   = 400;    // CC/Tag je Kolonie-Stufe
const WRS_KOL_STEIG   = 0.15;   // + 15 % je weiterer Kolonie (progressiv)
const WRS_GRACE_TAGE  = 7;      // Schonfrist: berechnen und anzeigen, aber nicht abbuchen
const WRS_CAP_TAGE    = 14;     // wie claimPassive: höchstens 14 Tage auf einmal
const WRS_MIN_TAG     = 0.25;   // unter 6 Stunden gar nicht erst abrechnen

function _e(s) { return (typeof _wrEsc === 'function') ? _wrEsc(s) : String(s == null ? '' : s); }
function _f(n) { return (typeof wrFmt === 'function') ? wrFmt(n) : Math.round(n || 0).toLocaleString('de-DE'); }
function wrsMe() { return (typeof currentUserData !== 'undefined' && currentUserData) || null; }
function wrsPlanets() { return (typeof _wrGalaxy !== 'undefined' && _wrGalaxy?.planets) || []; }

// ── Tagessatz berechnen ────────────────────────────────────────────────────
// Liefert eine vollständige Aufschlüsselung — dieselbe Funktion speist die
// Abbuchung UND die Anzeige, damit beide nie auseinanderlaufen.
function wrsSoldRate(u) {
  const o = { fleet: 0, routes: 0, colonies: 0, defense: 0, power: 0, total: 0,
              nShips: 0, nRoute: 0, nCol: 0, nTur: 0, nGen: 0, nStat: 0, station: 0, detail: [] };
  try {
    const sp = u?.space || {};
    const shipDef = (k) => (typeof SPACE_SHIPS !== 'undefined')
      ? SPACE_SHIPS.find(s => s.key === k) : null;

    // ① Flotte: im Hafen + unterwegs. Beides ist einsatzbereit und kostet voll.
    const home = sp.fleets?.home?.ships || {};
    const away = (typeof wrAwayShipsAll === 'function') ? wrAwayShipsAll(u) : {};
    for (const k of new Set([...Object.keys(home), ...Object.keys(away)])) {
      const n = (parseInt(home[k], 10) || 0) + (parseInt(away[k], 10) || 0);
      if (n <= 0) continue;
      const d = shipDef(k);
      if (!d) continue;
      o.fleet += n * (d.cc || 0) * WRS_SOLD_SHIP;
      o.nShips += n;
    }

    // ② Stationierte Schiffe (Dauerernte-/Bergungsrouten) — halber Satz.
    for (const r of Object.values(sp.routes || {})) {
      const n = parseInt(r?.count, 10) || 0;
      if (n <= 0) continue;
      const d = shipDef(r.ship || 'ernter');
      if (!d) continue;
      o.routes += n * (d.cc || 0) * WRS_SOLD_ROUTE;
      o.nRoute += n;
    }

    // ③ Kolonie-Verwaltung, PROGRESSIV: die n-te Kolonie kostet das
    // (1 + 0,15·(n−1))-fache. Das bremst Expansion, ohne jemanden zu bestrafen.
    // ⚠️ Reihenfolge = Planeten-ID (stabil sortiert). Ein Gründungsdatum steht
    // clientseitig nicht zuverlässig zur Verfügung; die Summe ist von der
    // Reihenfolge ohnehin unabhängig, nur die Zuordnung „welche ist die teuerste"
    // wäre eine andere.
    const kols = wrsPlanets()
      .filter(p => p && p.colonized_by === u.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    kols.forEach((p, i) => {
      const lv = (typeof wrColonyLevel === 'function') ? wrColonyLevel(p) : 1;
      const kosten = WRS_KOL_BASIS * lv * (1 + WRS_KOL_STEIG * i);
      o.colonies += kosten;
      o.nCol++;
    });

    // ④ Anlagen: Geschütze (Hafen + Kolonien) und Reaktoren.
    const turCc = (type, lv, kolonie) => {
      try {
        const st = kolonie && typeof wrPturretStats === 'function'
          ? wrPturretStats(type, lv)
          : (typeof wrTurretStats === 'function' ? wrTurretStats(type, lv) : null);
        return st?.cc || 0;
      } catch (e) { return 0; }
    };
    for (const s of Object.values(sp.base?.turrets || {})) {
      if (!s || typeof s !== 'object' || !s.type) continue;
      const lv = Math.max(1, Math.min(3, parseInt(s.level, 10) || 1));
      o.defense += turCc(s.type, lv, false) * WRS_SOLD_ANLAGE;
      o.nTur++;
    }
    for (const p of kols) {
      for (const s of Object.values(p.turrets || {})) {
        if (!s || typeof s !== 'object' || !s.type) continue;
        const lv = Math.max(1, Math.min(3, parseInt(s.level, 10) || 1));
        o.defense += turCc(s.type, lv, true) * WRS_SOLD_ANLAGE;
        o.nTur++;
      }
      // 📡 Quadranten-Station: schützt bis zu acht Planeten dauerhaft — ein Bauwerk
      // dieser Tragweite darf nicht kostenlos laufen. Bezugsgrösse ist WR_STATION
      // (Spiegel-Konstante, wird nur GELESEN); ohne sie greift ein Rückfallwert.
      if (p.station) {
        const wert = (typeof WR_STATION !== 'undefined' && WR_STATION?.cc) ? WR_STATION.cc : 30000;
        o.station += wert * WRS_SOLD_STATION;
        o.nStat++;
      }
      if (p.power && p.power.type && typeof wrPgenStats === 'function') {
        const lv = Math.max(1, Math.min(3, parseInt(p.power.level, 10) || 1));
        o.power += (wrPgenStats(p.power.type, lv)?.cc || 0) * WRS_SOLD_ANLAGE;
        o.nGen++;
      }
    }
    const g = sp.base?.power;
    if (g && g.type && typeof wrPowerStats === 'function') {
      const lv = Math.max(1, Math.min(3, parseInt(g.level, 10) || 1));
      o.power += (wrPowerStats(g.type, lv)?.cc || 0) * WRS_SOLD_ANLAGE;
      o.nGen++;
    }

    o.fleet = Math.round(o.fleet); o.routes = Math.round(o.routes);
    o.colonies = Math.round(o.colonies); o.defense = Math.round(o.defense);
    o.power = Math.round(o.power); o.station = Math.round(o.station);
    o.total = o.fleet + o.routes + o.colonies + o.defense + o.power + o.station;
  } catch (e) { console.warn('[wr-sold] Satz:', e.message); }
  return o;
}

// ── Zustand in map_data.wrSold ─────────────────────────────────────────────
function wrsSoldState(u) {
  const s = u?.map_data?.wrSold;
  return (s && typeof s === 'object') ? Object.assign({}, s) : null;
}

// ── Abbuchung ──────────────────────────────────────────────────────────────
let _wrsBusy = false;

async function wrsSoldAbbuchen() {
  if (_wrsBusy) return;
  const me = wrsMe();
  if (!me?.id) return;
  _wrsBusy = true;
  try {
    const rate = wrsSoldRate(me);

    // ── Erstkontakt: Schonfrist starten, nichts abbuchen ──
    let st = wrsSoldState(me);
    if (!st) {
      const jetzt = Date.now();
      await wrsSoldSave({ since: new Date(jetzt).toISOString(),
                          graceUntil: new Date(jetzt + WRS_GRACE_TAGE * 86400000).toISOString(),
                          paid: 0, days: 0 });
      if (rate.total > 0) wrsSoldPopup(rate);
      return;
    }
    if (rate.total <= 0) return;                       // nichts zu unterhalten

    const seit = Date.parse(st.since || '');
    if (!Number.isFinite(seit)) { await wrsSoldSave(Object.assign({}, st, { since: new Date().toISOString() })); return; }
    const tage = Math.min(WRS_CAP_TAGE, (Date.now() - seit) / 86400000);
    if (tage < WRS_MIN_TAG) return;                    // Kleckerbeträge vermeiden

    // ── Schonfrist läuft noch: nur mitzählen, nicht abbuchen ──
    const grace = Date.parse(st.graceUntil || '');
    if (Number.isFinite(grace) && Date.now() < grace) return;

    const faellig = Math.round(rate.total * tage);
    if (faellig < 1) return;

    // ⚠️ REIHENFOLGE WIE IN applyDailyLevy: den Zeitstempel ZUERST vorrücken,
    // dann abbuchen. `wrSold` liegt in map_data und ist Last-Write-Wins — zwei
    // gleichzeitig offene Geräte würden sonst denselben Zeitraum doppelt kassieren.
    // Schlägt das Abbuchen danach fehl, ist der Sold für diesen Zeitraum erlassen;
    // das ist die harmlosere Richtung.
    await wrsSoldSave(Object.assign({}, st, {
      since: new Date().toISOString(),
      paid: Math.round((parseFloat(st.paid) || 0) + faellig),
      days: Math.round(((parseFloat(st.days) || 0) + tage) * 100) / 100,
    }));

    // Ohne Zähne: es wird abgebucht, was da ist. Ein Rest wird ERLASSEN — kein
    // Schuldenkonto, keine Sperre (JP-Entscheidung 2026-08-06).
    const guthaben = Math.floor(parseFloat(me.coins) || 0);
    const zahlen = Math.min(faellig, guthaben);
    if (zahlen < 1) return;

    let rest = null;
    try { rest = await DB.spendCoins(me.id, zahlen); } catch (e) { return; }
    if (rest === null || rest === undefined) return;    // Server sagt: reicht nicht

    try {
      me.coins = rest;
      if (typeof appData !== 'undefined' && appData?.users) {
        const u = appData.users.find(x => x.id === me.id);
        if (u) u.coins = rest;
      }
      if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: rest });
    } catch (e) {}

    // Regel 4: aufgeschlüsselt ins Tages-Log, damit im Profil sichtbar ist,
    // WOFÜR das Geld weg ist — eine Sammelzeile „Unterhalt" wäre wertlos.
    try {
      const anteil = (x) => Math.round(zahlen * (x / rate.total));
      const posten = [];
      if (rate.fleet + rate.routes > 0) posten.push({
        label: '⚓ Flottensold', amount: -anteil(rate.fleet + rate.routes), cat: 'weltraum',
        detail: `${_f(rate.nShips)} Schiffe${rate.nRoute ? ` + ${_f(rate.nRoute)} stationiert` : ''}`
              + ` · ${Math.round(tage * 10) / 10} Tage`,
        aggKey: 'space_sold', aggBase: '⚓ Flottensold' });
      if (rate.colonies > 0) posten.push({
        label: '🏛️ Kolonie-Verwaltung', amount: -anteil(rate.colonies), cat: 'weltraum',
        detail: `${rate.nCol} Kolonien`, aggKey: 'space_kolverw', aggBase: '🏛️ Kolonie-Verwaltung' });
      if (rate.defense + rate.power + rate.station > 0) posten.push({
        label: '⚡ Betriebskosten Anlagen',
        amount: -anteil(rate.defense + rate.power + rate.station), cat: 'weltraum',
        detail: `${rate.nTur} Geschütze · ${rate.nGen} Reaktoren`
              + (rate.nStat ? ` · ${rate.nStat} Station${rate.nStat === 1 ? '' : 'en'}` : ''),
        aggKey: 'space_betrieb', aggBase: '⚡ Betriebskosten Anlagen' });
      if (posten.length) await DB.appendTodayLogFresh(me.id, posten);
    } catch (e) {}

    if (typeof showToast === 'function') {
      showToast(`⚓ Unterhalt für ${Math.round(tage * 10) / 10} Tage: −${_f(zahlen)} CC`, 'info');
    }
  } catch (e) {
    console.warn('[wr-sold] Abbuchung:', e.message);
  } finally { _wrsBusy = false; }
}

// map_data frisch lesen, nur wrSold mergen (Muster appendTodayLogFresh).
async function wrsSoldSave(next) {
  const me = wrsMe();
  if (!me?.id) return;
  let md = {};
  try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
  const out = Object.assign({}, md || {}, { wrSold: next });
  await DB.updateMapData(me.id, out);
  try {
    me.map_data = out;
    if (typeof appData !== 'undefined' && appData?.users) {
      const u = appData.users.find(x => x.id === me.id);
      if (u) u.map_data = out;
    }
    if (typeof _wrMember !== 'undefined' && _wrMember && _wrMember.id === me.id) _wrMember.map_data = out;
  } catch (e) {}
}

// ── 📣 Ankündigung (Regel 1 + 3) ───────────────────────────────────────────
// Laufende Kosten, die unangekündigt auftauchen, wirken wie ein Fehler. Das
// Popup kommt EINMAL beim Erstkontakt und nennt den Tagessatz sowie das Ende der
// Schonfrist.
function wrsSoldPopup(rate) {
  try {
    for (const id of ['quiz-modal', 'survey-modal', 'whats-new-modal', 'loan-modal',
                      'wr-help-modal', 'wrt-intro', 'wrx-start', 'wrs-sold-intro']) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && (el.innerHTML || '').trim()) return;
    }
    const m = document.createElement('div');
    m.id = 'wrs-sold-intro';
    m.innerHTML = `
      <div class="quiz-backdrop"></div>
      <div class="quiz-box"><div class="quiz-card" style="text-align:center">
        <div class="quiz-emoji">⚓</div>
        <h2>Neu: Unterhalt im All</h2>
        <p style="font-size:.84rem;line-height:1.5;color:var(--muted);text-align:left">
          Eine Flotte kostet ab jetzt <strong>täglich CoffeeCoins</strong> — genau wie deine
          Kolonien Verwaltung brauchen und Geschütze und Reaktoren im Betrieb Geld kosten.
          Bisher war CC im All nur eine Einmalausgabe; wer durch war, hatte keine Ausgabenseite
          mehr. Jetzt ist eine grosse Flotte kein Besitz mehr, sondern eine Entscheidung.<br><br>
          <strong>Dein aktueller Satz: ${_f(rate.total)} CC pro Tag</strong><br>
          <span style="font-size:.78rem">
            ⚓ Flotte ${_f(rate.fleet + rate.routes)} · 🏛️ Kolonien ${_f(rate.colonies)} ·
            ⚡ Anlagen ${_f(rate.defense + rate.power)}${rate.station ? ` · 📡 Stationen ${_f(rate.station)}` : ''}</span><br><br>
          Kolonien werden dabei <strong>progressiv</strong> teurer: jede weitere kostet 15 %
          mehr als die vorige. Abgerechnet wird beim Öffnen der App für die verstrichene Zeit —
          spiegelbildlich zum passiven Einkommen, das genauso läuft.<br><br>
          <strong>Die ersten ${WRS_GRACE_TAGE} Tage sind frei.</strong> Der Sold wird berechnet
          und angezeigt, aber noch nicht abgebucht — Zeit, deine Flotte zu sortieren.
          Reicht das Guthaben später nicht, wird nur abgebucht, was da ist; ein Rest verfällt.
          Es gibt keine Schulden und keine Sperre.
        </p>
        <button class="btn-primary quiz-cta" id="wrs-sold-ok">Verstanden</button>
      </div></div>`;
    document.body.appendChild(m);
    m.querySelector('#wrs-sold-ok').onclick = () => m.remove();
  } catch (e) { /* Popup darf nie blockieren */ }
}

// ── 📊 Anzeige im Statistik-Tab ────────────────────────────────────────────
function wrsSoldCardHtml() {
  try {
    const me = wrsMe();
    if (!me) return '';
    const rate = wrsSoldRate(me);
    if (rate.total <= 0) return '';
    const st = wrsSoldState(me);
    const grace = st && Date.parse(st.graceUntil || '');
    const inGrace = Number.isFinite(grace) && Date.now() < grace;
    const restTage = inGrace ? Math.ceil((grace - Date.now()) / 86400000) : 0;
    const kpi = (l, v) => `<div class="wrs-kpi"><span class="wrs-kpi-l">${l}</span>
        <span class="wrs-kpi-v">${v}</span></div>`;
    // Reichweite: wie lange trägt das Guthaben den Unterhalt? Das ist die Zahl,
    // um die es eigentlich geht.
    const coins = Math.floor(parseFloat(me.coins) || 0);
    const reicht = rate.total > 0 ? Math.floor(coins / rate.total) : 999;
    return `
      <div class="wr-card">
        <div class="wr-card-title">⚓ Laufende Kosten
          <span class="wr-sub">— ${_f(rate.total)} CC pro Tag</span></div>
        <div class="wrs-grid">
          ${kpi('⚓ Flotte', `${_f(rate.fleet)}<br><span class="wr-sub">${_f(rate.nShips)} Schiffe</span>`)}
          ${rate.routes ? kpi('🛰️ Stationiert', `${_f(rate.routes)}<br><span class="wr-sub">${_f(rate.nRoute)} Schiffe</span>`) : ''}
          ${kpi('🏛️ Kolonien', `${_f(rate.colonies)}<br><span class="wr-sub">${rate.nCol} Stück</span>`)}
          ${kpi('⚡ Anlagen', `${_f(rate.defense + rate.power)}<br><span class="wr-sub">${rate.nTur} Geschütze · ${rate.nGen} Reaktoren</span>`)}
          ${rate.nStat ? kpi('📡 Stationen', `${_f(rate.station)}<br><span class="wr-sub">${rate.nStat} Stück</span>`) : ''}
          ${kpi('🪙 Guthaben reicht', `${reicht > 999 ? '999+' : reicht} Tage`)}
          ${st?.paid ? kpi('📉 Bisher gezahlt', _f(st.paid)) : ''}
        </div>
        ${inGrace
          ? `<div class="wr-ok" style="margin-top:8px">🕊️ Schonfrist: noch ${restTage} Tag${restTage === 1 ? '' : 'e'}.
               Der Sold wird berechnet und angezeigt, aber noch nicht abgebucht.</div>`
          : ''}
        <div class="wrs-note">Abgerechnet wird beim Öffnen der App für die verstrichene Zeit
          (höchstens ${WRS_CAP_TAGE} Tage auf einmal) — spiegelbildlich zum passiven Einkommen.
          Kolonien werden progressiv teurer: jede weitere kostet ${Math.round(WRS_KOL_STEIG * 100)} %
          mehr als die vorige. Reicht das Guthaben nicht, wird nur abgebucht, was da ist;
          ein Rest verfällt.</div>
      </div>`;
  } catch (e) { return ''; }
}

(function patchRender() {
  const orig = window.wrRender;
  if (typeof orig !== 'function') return;
  window.wrRender = function () {
    orig.apply(this, arguments);
    try {
      if (typeof _wrTab === 'undefined' || _wrTab !== 'stats') return;
      if (document.getElementById('wrs-sold-card')) return;
      const wrap = document.querySelector('#imp-content .wr-wrap') || document.querySelector('.wr-wrap');
      if (!wrap) return;
      const html = wrsSoldCardHtml();
      if (!html) return;
      const box = document.createElement('div');
      box.id = 'wrs-sold-card';
      box.innerHTML = html;
      wrap.appendChild(box);
    } catch (e) { console.warn('[wr-sold] Anzeige:', e.message); }
  };
})();

// ── 🔧 Auslöser: beim Login und beim Betreten des Weltall-Tabs ─────────────
// showApp läuft genau einmal nach der Anmeldung — das ist der von JP gewünschte
// Zeitpunkt. Der zweite Haken am Weltall-Tab fängt lange Sitzungen ab, in denen
// showApp nicht erneut läuft.
(function hookLogin() {
  const orig = window.showApp;
  if (typeof orig === 'function') {
    window.showApp = function () {
      const r = orig.apply(this, arguments);
      // Verzögert, damit Passiv-Einkommen und Login-Bonus zuerst gutgeschrieben
      // sind — sonst bucht der Sold von einem Guthaben ab, das gleich noch steigt.
      setTimeout(() => { wrsSoldAbbuchen(); }, 6000);
      return r;
    };
  } else {
    console.warn('[wr-sold] showApp nicht gefunden — Abbuchung läuft nur über den Weltall-Tab.');
  }
  const ow = window._buildWeltraum;
  if (typeof ow === 'function') {
    window._buildWeltraum = async function () {
      const r = await ow.apply(this, arguments);
      setTimeout(() => { wrsSoldAbbuchen(); }, 3000);
      return r;
    };
  }
})();

window.wrsSoldRate     = wrsSoldRate;
window.wrsSoldAbbuchen = wrsSoldAbbuchen;

console.info('[wr-sold] Unterhalt aktiv — Flottensold, Kolonie-Verwaltung, Betriebskosten.');

})();
