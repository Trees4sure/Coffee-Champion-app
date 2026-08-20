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
  const o = { fleet: 0, routes: 0, colonies: 0, defense: 0, power: 0, total: 0, garrison: 0,
              nShips: 0, nRoute: 0, nCol: 0, nTur: 0, nGen: 0, nStat: 0, nGarrison: 0,
              station: 0, detail: [] };
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

    // ②b 🛡️ Garnison auf Kolonien — VOLLER Satz (27k, R10). Sie erwirtschaftet nichts,
    // deshalb kein Routen-Rabatt. Transporte zählen mit: sie sind im Dienst.
    // ⚠️ Eingemottet ⇒ 0, spiegelbildlich zu `_space_garrison_power` und zum Server.
    // Sonst zeigte die Kostenkarte einen Posten, den der Server gar nicht abbucht.
    const eingemottet = !!(sp.fleets?.mothballed
      && Object.values(sp.fleets.mothballed).some(v => (parseInt(v, 10) || 0) > 0));
    if (!eingemottet) {
      const garQuellen = Object.values(sp.garrison || {}).map(g => g?.ships || {})
        .concat((Array.isArray(sp.garrisonTrips) ? sp.garrisonTrips : []).map(t => t?.ships || {}));
      for (const ships of garQuellen) {
        for (const [k, v] of Object.entries(ships)) {
          const n = parseInt(v, 10) || 0;
          if (n <= 0) continue;
          const d = shipDef(k);
          if (!d) continue;
          o.garrison  += n * (d.cc || 0) * WRS_SOLD_SHIP;
          o.nGarrison += n;
        }
      }
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
    o.garrison = Math.round(o.garrison);
    o.total = o.fleet + o.routes + o.colonies + o.defense + o.power + o.station + o.garrison;
  } catch (e) { console.warn('[wr-sold] Satz:', e.message); }
  return o;
}

// ── Zustand in map_data.wrSold ─────────────────────────────────────────────
function wrsSoldState(u) {
  const s = u?.map_data?.wrSold;
  return (s && typeof s === 'object') ? Object.assign({}, s) : null;
}

// ── Abbuchung ──────────────────────────────────────────────────────────────
// ⚠️ SEIT 26w RECHNET DER SERVER. Diese Funktion bucht NICHTS mehr selbst ab — sie
// ruft `space_charge_sold` und stellt das Ergebnis dar.
//
// Warum der Wechsel: Der ursprüngliche Client-Sold war „ohne Zähne" (siehe Kopf dieser
// Datei) — reichte das Guthaben nicht, wurde der Rest ERLASSEN. Damit war der Sold für
// einen reichen Spieler eine Gebühr und für einen armen gar nichts; er bremste also
// niemanden. Die eigentliche Konsequenz, das EINMOTTEN, war clientseitig unmöglich:
// Kampfkraft rechnet der Server aus `space.fleets` und ignoriert jedes Client-Flag.
// 26w löst das, indem es die Schiffe nicht markiert, sondern nach
// `space.fleets.mothballed` VERSCHIEBT — dann ist die Heimatflotte schlicht leer.
//
// ⚠️ HIER DARF NIE WIEDER `DB.spendCoins` STEHEN. Zwei Abbuchungen für denselben
// Zeitraum sind die naheliegendste Art, dieses Feature kaputtzumachen, und sie fällt im
// Betrieb kaum auf — man sieht nur, dass das Geld schneller weg ist als angekündigt.
// Der Zustand liegt seit 26w in `space.sold`, NICHT mehr in `map_data.wrSold`
// (die Migration hat ihn einmalig übernommen).
let _wrsBusy = false;

async function wrsSoldAbbuchen() {
  if (_wrsBusy) return;
  const me = wrsMe();
  if (!me?.id || typeof DB.chargeSpaceSold !== 'function') return;
  _wrsBusy = true;
  try {
    const res = await DB.chargeSpaceSold(me.id);
    if (!res || res.error) return;

    // Erstkontakt oder laufende Schonfrist: nur ankündigen, nichts ist passiert.
    if (res.grace) {
      const r = wrsSoldRate(me);
      if (r.total > 0 && !res.graceUntil) wrsSoldPopup(r);
      return;
    }
    if (!(res.charged > 0) && !res.mothballed) return;

    // Guthaben lokal nachziehen (der Server hat bereits abgebucht).
    try {
      if (typeof res.space === 'object' && res.space) me.space = res.space;
      const neu = Math.max(0, (parseFloat(me.coins) || 0) - (res.charged || 0));
      me.coins = neu;
      if (typeof appData !== 'undefined' && appData?.users) {
        const u = appData.users.find(x => x.id === me.id);
        if (u) { u.coins = neu; if (res.space) u.space = res.space; }
      }
      if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: neu });
    } catch (e) {}

    // Regel 4: aufgeschlüsselt ins Tages-Log, damit im Profil sichtbar ist, WOFÜR das
    // Geld weg ist — eine Sammelzeile „Unterhalt" wäre wertlos.
    // ⚠️ Die BETRÄGE kommen aus der Server-Antwort (`res.rate`), die STÜCKZAHLEN für den
    // Erklärtext aus der lokalen Rechnung. Nur so kann die Aufteilung nicht von dem
    // abweichen, was tatsächlich abgebucht wurde.
    try {
      const sr = res.rate || {};
      const tot = parseFloat(sr.total) || 0;
      const cnt = wrsSoldRate(me);
      const tage = parseFloat(res.days) || 0;
      const anteil = (x) => tot > 0 ? Math.round((res.charged || 0) * ((parseFloat(x) || 0) / tot)) : 0;
      const posten = [];
      const flotte = (parseFloat(sr.fleet) || 0) + (parseFloat(sr.routes) || 0);
      if (flotte > 0) posten.push({
        label: '⚓ Flottensold', amount: -anteil(flotte), cat: 'weltraum',
        detail: `${_f(cnt.nShips)} Schiffe${cnt.nRoute ? ` + ${_f(cnt.nRoute)} stationiert` : ''}`
              + ` · ${Math.round(tage * 10) / 10} Tage`,
        aggKey: 'space_sold', aggBase: '⚓ Flottensold' });
      // 🛡️ 27k / Handover §6: Der Garnisonsanteil MUSS getrennt ausgewiesen werden.
      // ⚠️ Nicht in den Flottensold addiert: Garnison zahlt 100 %, Routen 50 % — wer die
      // Posten zusammenwirft, kann hinterher nicht sehen, was das Parken auf den Kolonien
      // wirklich kostet, und genau das ist die Entscheidung, die man treffen soll.
      // `sr.garrison` liefert _space_sold_rate seit 27k; ältere Server liefern es nicht,
      // dann bleibt der Posten schlicht weg (kein Absturz, Regel 3).
      const garn = parseFloat(sr.garrison) || 0;
      if (garn > 0) posten.push({
        label: '🛡️ Garnisonssold', amount: -anteil(garn), cat: 'weltraum',
        detail: `${_f(sr.nGarrison || 0)} Schiffe auf Kolonien · voller Satz`
              + ` · ${Math.round(tage * 10) / 10} Tage`,
        aggKey: 'space_sold_gar', aggBase: '🛡️ Garnisonssold' });
      if ((parseFloat(sr.colonies) || 0) > 0) posten.push({
        label: '🏛️ Kolonie-Verwaltung', amount: -anteil(sr.colonies), cat: 'weltraum',
        detail: `${sr.colonyCount || cnt.nCol} Kolonien (progressiv)`,
        aggKey: 'space_kolverw', aggBase: '🏛️ Kolonie-Verwaltung' });
      const anlagen = (parseFloat(sr.defense) || 0) + (parseFloat(sr.power) || 0)
                    + (parseFloat(sr.station) || 0);
      if (anlagen > 0) posten.push({
        label: '⚡ Betriebskosten Anlagen', amount: -anteil(anlagen), cat: 'weltraum',
        detail: `${cnt.nTur} Geschütze · ${cnt.nGen} Reaktoren`
              + (cnt.nStat ? ` · ${cnt.nStat} Station${cnt.nStat === 1 ? '' : 'en'}` : ''),
        aggKey: 'space_betrieb', aggBase: '⚡ Betriebskosten Anlagen' });
      if (posten.length && (res.charged || 0) > 0) await DB.appendTodayLogFresh(me.id, posten);
    } catch (e) {}

    if (res.mothballed) {
      // ⚠️ Das ist die einzige Stelle, an der der Spieler erfährt, dass seine Flotte
      // handlungsunfähig ist. Sie MUSS den Weg zurück nennen — eine Warnung ohne Ausweg
      // liest sich wie ein Defekt.
      if (typeof showToast === 'function') {
        showToast(`⚓ Sold nicht gedeckt — die Heimatflotte ist eingemottet. `
                + `Rückstand ${_f(res.due)} CC begleichen, dann fliegt sie wieder.`, 'error');
      }
      // ⚠️ JP 2026-08-20: Ein Toast ist nach Sekunden fort — für einen Zustand, der TAGE
      // anhält, ist er der falsche Ort. Der Chat bleibt und ist im Clan nachlesbar; das
      // Panel im 🛩️-Tab (wrMothballHtml) ist der Ort, an den man zurückkehren kann.
      // try/catch: eine fehlgeschlagene Meldung darf die Abbuchung nie nachträglich kippen.
      try {
        if (typeof wrChat === 'function') {
          wrChat(`🧊 Die Heimatflotte von ${me.name || 'einem Clan-Mitglied'} ist eingemottet — `
               + `der Flottensold war nicht gedeckt (Rückstand ${_f(res.due)} CC). `
               + `Die Schiffe sind nicht verloren: im 🛩️ Flotten-Tab auslösen.`);
        }
      } catch (e) {}
    } else if (typeof showToast === 'function') {
      showToast(`⚓ Unterhalt für ${Math.round((parseFloat(res.days) || 0) * 10) / 10} Tage: `
              + `−${_f(res.charged)} CC`, 'info');
    }
  } catch (e) {
    console.warn('[wr-sold] Abbuchung:', e.message);
  } finally { _wrsBusy = false; }
}

// Eingemottete Flotte auslösen (Rückstand ganz bezahlen — keine Teilzahlung).
async function wrsUnmothball() {
  const me = wrsMe();
  if (!me?.id || typeof DB.unmothballSpace !== 'function') return;
  try {
    const res = await DB.unmothballSpace(me.id);
    if (!res || res.error) {
      if (typeof showToast === 'function') {
        showToast(res && res.need
          ? `Rückstand ${_f(res.need)} CC — so viel ist gerade nicht da.`
          : 'Auslösen fehlgeschlagen.', 'error');
      }
      return;
    }
    if (res.released) {
      if (typeof res.space === 'object' && res.space) me.space = res.space;
      // ⚠️ Zustandsübernahme ist Pflicht (Lehre aus 26w): der Server hat `coins` bereits
      // um `paid` gesenkt. Ohne das Nachziehen zeigt der Header bis zum nächsten Poll
      // den alten Stand, und der Spieler hält die Abbuchung für ausgeblieben.
      try {
        const neu = Math.max(0, (parseFloat(me.coins) || 0) - (parseFloat(res.paid) || 0));
        me.coins = neu;
        if (typeof appData !== 'undefined' && appData?.users) {
          const u = appData.users.find(x => x.id === me.id);
          if (u) { u.coins = neu; if (res.space) u.space = res.space; }
        }
        if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: neu });
      } catch (e) {}
      const n = (() => { try {
        return Object.values(res.ships || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      } catch (e) { return 0; } })();
      if (typeof showToast === 'function') {
        showToast(`⚓ Flotte ausgelöst (−${_f(res.paid)} CC)${n ? ` — ${_f(n)} Schiffe` : ''} `
                + `wieder einsatzbereit.`, 'success');
      }
      // Die Meldung, die JP gefehlt hat: „sie liegen wieder frei".
      try {
        if (typeof wrChat === 'function') {
          wrChat(`⚓ ${me.name || 'Ein Clan-Mitglied'} hat den Soldrückstand beglichen `
               + `(−${_f(res.paid)} CC)${n ? ` — ${_f(n)} Schiffe` : ''} sind wieder einsatzbereit.`);
        }
      } catch (e) {}
      try { if (typeof wrRender === 'function') wrRender(); } catch (e) {}
    }
  } catch (e) { console.warn('[wr-sold] Auslösen:', e.message); }
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
          und angezeigt, aber nicht abgebucht — Zeit, deine Flotte zu sortieren. Diese Tage
          werden auch später nicht nachgefordert.<br><br>
          <strong>Reicht das Guthaben nicht</strong>, wird abgebucht, was da ist — und der Rest
          bleibt als Rückstand stehen. Deine Heimatflotte wird dann <strong>eingemottet</strong>:
          die Schiffe sind nicht verloren, aber sie fliegen und verteidigen nicht mehr, bis du
          den Rückstand begleichst. Das geht jederzeit im 🛩️ Flotten-Tab.
          Eingemottete Schiffe kosten solange keinen Unterhalt.
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
          ${rate.garrison ? kpi('🛡️ Garnison', `${_f(rate.garrison)}<br><span class="wr-sub">${_f(rate.nGarrison)} Schiffe · voller Satz</span>`) : ''}
          ${kpi('🏛️ Kolonien', `${_f(rate.colonies)}<br><span class="wr-sub">${rate.nCol} Stück</span>`)}
          ${kpi('⚡ Anlagen', `${_f(rate.defense + rate.power)}<br><span class="wr-sub">${rate.nTur} Geschütze · ${rate.nGen} Reaktoren</span>`)}
          ${rate.nStat ? kpi('📡 Stationen', `${_f(rate.station)}<br><span class="wr-sub">${rate.nStat} Stück</span>`) : ''}
          ${kpi('🪙 Guthaben reicht', `${reicht > 999 ? '999+' : reicht} Tage`)}
          ${st?.paid ? kpi('📉 Bisher gezahlt', _f(st.paid)) : ''}
        </div>
        ${inGrace
          ? `<div class="wr-ok" style="margin-top:8px">🕊️ Schonfrist: noch ${restTage} Tag${restTage === 1 ? '' : 'e'}.
               Der Sold wird berechnet und angezeigt, aber nicht abgebucht — diese Tage
               werden auch später nicht nachgefordert.</div>`
          : ''}
        ${/* ⚠️ 27j: Hier stand „ein Rest verfällt" — die Regel von VOR 26w. Seit 26w
              bleibt der Rest als `sold.due` stehen und die Heimatflotte wird eingemottet.
              Dieselbe falsche Behauptung stand auch im Erklär-Popup weiter unten; beim
              Korrigieren fiel nur die eine auf, den Rest fand der Prüfstand.
              ⚠️ Merke: eine veraltete Aussage steht selten nur an EINER Stelle. */ ''}
        <div class="wrs-note">Abgerechnet wird beim Öffnen der App für die verstrichene Zeit
          (höchstens ${WRS_CAP_TAGE} Tage auf einmal) — spiegelbildlich zum passiven Einkommen.
          Kolonien werden progressiv teurer: jede weitere kostet ${Math.round(WRS_KOL_STEIG * 100)} %
          mehr als die vorige. Reicht das Guthaben nicht, wird abgebucht was da ist, der Rest
          bleibt als Rückstand stehen und die Heimatflotte wird eingemottet — auslösen im
          🛩️ Flotten-Tab.</div>
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
window.wrsUnmothball   = wrsUnmothball;

console.info('[wr-sold] Unterhalt aktiv — Flottensold, Kolonie-Verwaltung, Betriebskosten.');

})();
