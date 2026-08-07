// ═══════════════════════════════════════════════════════════════════════════
// karte_auto.js — 🥾 Auto-Wanderung für die Pixel-Karte
// ═══════════════════════════════════════════════════════════════════════════
// Stand: 2026-08-05 · Schwestermodul zu krieger_auto.js
//
// ZWECK
//   Für eine Pauschale von KARTE_AUTO_COST CC läuft die Figur den Tag allein ab:
//   sie sucht sich den Weg zum nächsten unerkundeten Feld, deckt es auf, sammelt
//   Schätze ein und arbeitet Events ab — ohne ein Popup pro Fund. Am Ende steht
//   EINE Zusammenfassung mit gezählten Funden („5× Döner mit allem, 2× Eiscreme").
//
// ARCHITEKTUR — der entscheidende Unterschied zum Krieger-Modul
//   Die Karte hat erheblich mehr Sonderlogik als der Dungeon: CIQ-Perks (Schatzgräber,
//   Glückssträhne, Kaffeesatz-Leser), Fremd-Debuffs (Schatzräuber), Barista-Bart-Ausschüttung,
//   Gruppenkassen-Boni, Forschungs-Tier-Faktoren, 20 Event-Typen mit teils negativen Folgen.
//   Das alles NACHZUBAUEN wäre garantiert irgendwann falsch.
//
//   Deshalb ruft dieses Modul für JEDEN Schritt die vorhandene Funktion
//   _handleKarteStep() aus imperium.js auf. Sie bleibt die alleinige Wahrheit für
//   Schatzwert, Eventfolgen, CC-Buchung und Tages-Log. Dieses Modul entscheidet nur,
//   WOHIN gelaufen wird — und unterdrückt währenddessen die Einzel-Popups.
//
//   Die Unterdrückung geschieht durch temporäres Ersetzen von _showKarteDiscovery,
//   _showKarteEvent, _showDungeonModal und DB.postMessage. Alle vier werden in einem
//   finally-Block wieder eingesetzt — auch wenn mittendrin ein Fehler auftritt.
//
//   KEINE SQL. Muss NACH karte.js und imperium.js geladen werden.
//   Rein additiv: fehlt diese Datei, verhält sich die App exakt wie vorher.
// ═══════════════════════════════════════════════════════════════════════════

// ── Konstanten ──────────────────────────────────────────────────────────────
const KARTE_AUTO_COST       = 200;  // Pauschale je Lauf (JP-Vorgabe 2026-08-05)
// Mindestzahl freier Schritte, ab der der Lauf überhaupt kaufbar ist.
// Rechnung: Schatzchance 30 %, Durchschnittswert der 22 Schätze ~4,2 CC → roh etwa
// 1,3 CC pro Feld. Mit Trüffelnase, Rucksack, Forschungs-Tier-Faktor und Gruppenbonus
// kommt man realistisch auf 4–6 CC pro Feld. Die Pauschale rechnet sich damit erst
// jenseits von ~40 Feldern; bei 5 Schritten wären es 40 CC pro Feld — ein Reinfall,
// den man erst nach dem Bezahlen merkt. 20 ist die untere Schmerzgrenze.
// ⚠️ Wer die Pauschale ändert, sollte diesen Wert mitziehen.
const KARTE_AUTO_MIN_STEPS  = 20;
const KARTE_AUTO_STEP_DELAY = 180;  // ms je aufgedecktem Feld (dazu kommt die RPC-Laufzeit)
const KARTE_AUTO_WALK_DELAY = 40;   // ms je Feld beim kostenlosen Zurücklaufen
const KARTE_AUTO_MAX_ACTIONS = 400; // harte Not-Obergrenze gegen Endlosschleifen

let _karteAutoRunning = false;
let _karteAutoStop    = false;

// ── Defensive Helfer ────────────────────────────────────────────────────────
function _kbEsc(s)  { return (typeof _esc2 === 'function') ? _esc2(String(s)) : String(s); }
function _kbToast(m, k) { if (typeof showToast === 'function') showToast(m, k || 'info'); }
function _kbSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _kbToday() {
  if (typeof _todayKey === 'function') return _todayKey();
  return new Date().toLocaleDateString('de-DE');
}
function _kbStepsLeft(state) {
  return (typeof karteStepsLeft === 'function')
    ? karteStepsLeft(state.mapData, state.research) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) Wegfindung
// ═══════════════════════════════════════════════════════════════════════════
// Breitensuche über bereits ERKUNDETE Felder (dorthin läuft man gratis, siehe
// karteWalkBack) bis zu einem erkundeten Feld, das einen unerkundeten, heute nicht
// gesperrten Nachbarn hat. Nur dieser letzte Schritt kostet ein Tageskontingent.
//
// `blocked` stammt aus dem tile_block-Event („ein Tier blockiert das Feld heute") und
// gilt laut Design nur für unerkundete Felder — deshalb wird es nur beim Ziel geprüft.
function karteAutoFindTarget(state) {
  const mapData  = state.mapData || {};
  const start    = (typeof kartePos === 'function') ? kartePos(mapData) : { x: 0, y: 0 };
  const explored = mapData.explored || {};
  const blocked  = mapData.blocked  || {};
  const today    = _kbToday();
  const N        = (typeof KARTE_WORLD !== 'undefined') ? KARTE_WORLD : 128;
  const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  const seen  = new Set([`${start.x},${start.y}`]);
  const prev  = new Map();
  const queue = [start];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];

    // 1) unerkundeter, betretbarer Nachbar?
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = `${nx},${ny}`;
      if (explored[k]) continue;
      if (blocked[k] === today) continue;      // 🐾 heute gesperrt
      const path = [];
      let node = cur;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift(node);
        node = prev.get(`${node.x},${node.y}`);
      }
      return { path, target: { x: nx, y: ny } };
    }

    // 2) weiter über erkundete Nachbarn
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !explored[k]) continue;
      seen.add(k);
      prev.set(k, cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) Der Lauf
// ═══════════════════════════════════════════════════════════════════════════

function _kbBuildState() {
  const member = (typeof currentUserData !== 'undefined' && currentUserData) ? currentUserData : null;
  if (!member || !member.id) return null;
  const tile = (typeof KARTE_TILE !== 'undefined') ? KARTE_TILE : 20;
  const N    = (typeof KARTE_WORLD !== 'undefined') ? KARTE_WORLD : 128;
  const canvas = document.getElementById('cc-karte-canvas');
  const COLS = Math.floor((canvas?.width  || 320) / tile);
  const ROWS = Math.floor((canvas?.height || 280) / tile);
  const mapData = member.map_data || {};
  const pos  = (typeof kartePos === 'function') ? kartePos(mapData) : { x: 64, y: 64 };
  const state = {
    mapData,
    research: member.research || {},
    memberCoins: member.coins || 0,
    vpX: Math.max(0, Math.min(N - COLS, pos.x - Math.floor(COLS / 2))),
    vpY: Math.max(0, Math.min(N - ROWS, pos.y - Math.floor(ROWS / 2))),
  };
  // ⚠️ KEIN Fallback-Seed. _karteWorldSeed() bestimmt Terrain, Schatzplätze und
  // Schatzindizes. Mit einem falschen Seed würde _handleKarteStep Schätze an Stellen
  // eintragen, an denen laut echter Welt keine sind — die Karte wäre dauerhaft
  // verfälscht. Fehlt die Funktion, läuft das Modul lieber gar nicht.
  if (typeof _karteWorldSeed !== 'function') return null;
  const seed = _karteWorldSeed();
  return { member, state, seed, COLS, ROWS, MARGIN: 4 };
}

function _kbRepaint(state, seed) {
  const canvas = document.getElementById('cc-karte-canvas');
  if (canvas && typeof karteRender === 'function') {
    karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);
  }
  if (typeof _karteUpdateHUD === 'function') _karteUpdateHUD(state);
}

async function karteAutoRun(ctx) {
  const { member, state, seed, COLS, ROWS, MARGIN } = ctx;

  const rep = {
    cost: KARTE_AUTO_COST, steps: 0, walked: 0,
    treasures: [], events: [],
    coinsBefore: state.memberCoins || 0, coinsAfter: state.memberCoins || 0,
    dungeonArgs: null, endReason: 'steps',
  };

  const budget0 = _kbStepsLeft(state);
  if (budget0 < KARTE_AUTO_MIN_STEPS) {
    _kbToast(`🥾 Auto-Wanderung lohnt sich erst ab ${KARTE_AUTO_MIN_STEPS} freien Schritten.`, 'info');
    return null;
  }
  if (!karteAutoFindTarget(state)) {
    _kbToast('🧭 Von hier aus ist kein unerkundetes Feld erreichbar.', 'info');
    return null;
  }
  if ((state.memberCoins || 0) < KARTE_AUTO_COST) {
    _kbToast(`Du brauchst ${KARTE_AUTO_COST} CC für die Auto-Wanderung.`, 'info');
    return null;
  }

  // ── Pauschale abbuchen ────────────────────────────────────────────────────
  try {
    const left = await DB.spendCoins(member.id, KARTE_AUTO_COST);
    if (left === null || left === undefined) { _kbToast('Nicht genug CoffeeCoins.', 'error'); return null; }
    state.memberCoins = left;
    rep.coinsBefore = left;
    if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: left };
    if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: left });
  } catch (e) {
    _kbToast(e.message || 'Pauschale konnte nicht abgebucht werden.', 'error');
    return null;
  }

  // Gebühr ins Tages-Log (die Fundeinnahmen schreibt _handleKarteStep bereits selbst)
  try {
    state.mapData = DB.appendTodayLog(state.mapData, [
      { label: '🥾 Auto-Wanderung Pauschale', amount: -KARTE_AUTO_COST, detail: `${budget0} Schritte` },
    ]);
    await DB.updateMapData(member.id, state.mapData);
    if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
  } catch (e) { /* nicht kritisch */ }

  // ── Popups und Chat-Broadcasts einsammeln statt anzeigen ─────────────────
  // ⚠️ Diese vier Funktionen werden im finally-Block IMMER wiederhergestellt.
  const g = window;
  const orig = {
    disc: g._showKarteDiscovery,
    ev:   g._showKarteEvent,
    dun:  g._showDungeonModal,
    post: (typeof DB !== 'undefined') ? DB.postMessage : null,
  };

  _karteAutoRunning = true;
  _karteAutoStop    = false;

  try {
    if (typeof orig.disc === 'function') g._showKarteDiscovery = (t) => { if (t) rep.treasures.push(t); };
    if (typeof orig.ev   === 'function') g._showKarteEvent     = (e, note) => { if (e) rep.events.push({ emoji: e.emoji, name: e.name, note: note || '' }); };
    if (typeof orig.dun  === 'function') g._showDungeonModal   = (...args) => { rep.dungeonArgs = args; };
    if (typeof orig.post === 'function') DB.postMessage = async () => ({ ok: true }); // Einzelfunde nicht broadcasten

    let actions = 0;
    while (actions < KARTE_AUTO_MAX_ACTIONS) {
      actions++;
      if (_karteAutoStop) { rep.endReason = 'stopped'; break; }

      // Schrittkontingent LIVE prüfen — anders als im Dungeon wird es hier bewusst
      // nicht eingefroren: Events können heute Schritte geben oder nehmen, und beides
      // soll sich sofort auswirken.
      if (_kbStepsLeft(state) <= 0) { rep.endReason = 'steps'; break; }

      const route = karteAutoFindTarget(state);
      if (!route) { rep.endReason = 'blocked'; break; }

      // kostenlos über erkundete Felder laufen
      for (const tile of route.path) {
        if (typeof karteWalkBack !== 'function') break;
        state.mapData = karteWalkBack(tile.x, tile.y, state.mapData);
        rep.walked++;
        _kbRepaint(state, seed);
        await _kbSleep(KARTE_AUTO_WALK_DELAY);
      }

      // Zielfeld aufdecken — komplette Logik liegt in _handleKarteStep
      if (typeof _handleKarteStep !== 'function') { rep.endReason = 'error'; break; }
      const before = _kbStepsLeft(state);
      try {
        await _handleKarteStep(route.target.x, route.target.y, member, state, seed, COLS, ROWS, MARGIN);
      } catch (e) {
        console.warn('Auto-Wanderung: Schritt fehlgeschlagen:', e);
        rep.endReason = 'error';
        break;
      }
      rep.steps++;

      // Sicherung gegen Stillstand: wenn sich das Kontingent nicht bewegt hat UND
      // die Position gleich geblieben ist, wurde der Schritt abgelehnt (etwa weil
      // das Speichern fehlschlug). Dann abbrechen statt endlos zu wiederholen.
      const pos = (typeof kartePos === 'function') ? kartePos(state.mapData) : null;
      if (pos && (pos.x !== route.target.x || pos.y !== route.target.y) && _kbStepsLeft(state) === before) {
        rep.endReason = 'error';
        break;
      }

      _karteAutoUpdateProgress(rep, state);
      await _kbSleep(KARTE_AUTO_STEP_DELAY);
    }
    if (actions >= KARTE_AUTO_MAX_ACTIONS && rep.endReason === 'steps') rep.endReason = 'safety';
  } catch (e) {
    console.warn('Auto-Wanderung abgebrochen:', e);
    rep.endReason = 'error';
  } finally {
    if (typeof orig.disc === 'function') g._showKarteDiscovery = orig.disc;
    if (typeof orig.ev   === 'function') g._showKarteEvent     = orig.ev;
    if (typeof orig.dun  === 'function') g._showDungeonModal   = orig.dun;
    if (typeof orig.post === 'function') DB.postMessage        = orig.post;
    _karteAutoRunning = false;
    _karteAutoStop    = false;
  }

  rep.coinsAfter = state.memberCoins || 0;
  _kbRepaint(state, seed);
  await _karteAutoFinish(ctx, rep);
  return rep;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) Zusammenfassung
// ═══════════════════════════════════════════════════════════════════════════
// JP 2026-08-05: „zusammenfassen mit aufzählen: heute großen Appetit gehabt wie z.B.
// 5x Döner, 2x Eis usw.. 750 CC". Also nach Fundnamen gruppieren, absteigend nach
// Anzahl, mit Gesamtsumme.
function karteAutoTally(treasures) {
  const map = new Map();
  for (const t of treasures || []) {
    const key = t.name || '?';
    const e = map.get(key) || { emoji: t.emoji || '❓', name: key, count: 0, cc: 0 };
    e.count++;
    e.cc += t.cc || 0;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.cc - a.cc);
}

// Kurzform für den Chat: „5× Döner mit allem, 2× Eiscreme, 1× Fettbemme"
function _karteAutoTallyText(tally, max = 4) {
  const parts = tally.slice(0, max).map(t => `${t.count}× ${t.emoji} ${t.name}`);
  const restCount = tally.slice(max).reduce((s, t) => s + t.count, 0);
  if (restCount > 0) parts.push(`und ${restCount} weitere${restCount === 1 ? 'r Fund' : ' Funde'}`);
  return parts.join(', ');
}

async function _karteAutoFinish(ctx, rep) {
  const { member } = ctx;
  const tally = karteAutoTally(rep.treasures);
  const netto = rep.coinsAfter - rep.coinsBefore;   // ohne Pauschale (die ist schon abgezogen)

  // EINE Chat-Nachricht statt einer pro Fund
  try {
    if (tally.length) {
      await DB.postMessage(
        `🥾 ${_kbEsc(member.name)} war auf großer Tour und hatte mächtig Appetit: ` +
        `${_kbEsc(_karteAutoTallyText(tally))} — zusammen ${netto >= 0 ? '+' : ''}${netto} 🫘 ` +
        `auf ${rep.steps} Feldern.`,
        member.name
      );
    } else {
      await DB.postMessage(
        `🥾 ${_kbEsc(member.name)} hat ${rep.steps} Felder abgelaufen — und nichts als Staub gefunden.`,
        member.name
      );
    }
  } catch (e) { /* nicht kritisch */ }

  _karteAutoShowReport(ctx, rep, tally);
}

function _karteAutoShowReport(ctx, rep, tally) {
  // Bewusst ein EIGENES Overlay statt des Karten-Popups: dessen innere Struktur und
  // Klassen gehören _showKarteDiscovery/_showKarteEvent, und die sollen von diesem
  // Modul nicht mitbenutzt werden.
  const host = _karteAutoEnsurePopupHost();
  if (!host) return;

  const netto  = rep.coinsAfter - rep.coinsBefore;
  const gesamt = netto - rep.cost;
  const endMsg = {
    steps:   'Alle Tagesschritte verbraucht.',
    stopped: 'Von dir gestoppt.',
    blocked: 'Kein erreichbares unerkundetes Feld mehr.',
    error:   'Vorzeitig beendet — alles bis hierher ist gespeichert.',
    safety:  'Sicherheitsgrenze erreicht.',
  }[rep.endReason] || '';

  const row = (l, v) => `<div style="display:flex;justify-content:space-between;font-size:12px;gap:8px">
    <span style="opacity:.75">${l}</span><span style="text-align:right">${v}</span></div>`;

  const fundListe = tally.length
    ? tally.map(t => `<div style="display:flex;justify-content:space-between;font-size:12px;gap:8px">
        <span>${t.count}× ${t.emoji} ${_kbEsc(t.name)}</span>
        <span style="opacity:.75">+${t.cc} 🫘</span></div>`).join('')
    : '<div style="font-size:12px;opacity:.6">Nichts gefunden — auch das kommt vor.</div>';

  const eventListe = rep.events.length
    ? rep.events.map(e => `<div style="font-size:11px;opacity:.75">${e.emoji} ${_kbEsc(e.name)}${e.note ? ` — ${_kbEsc(e.note)}` : ''}</div>`).join('')
    : '';

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="cc-karte-popup-inner" style="max-width:360px;width:100%">
      <div class="cc-karte-popup-hdr">🥾 Heute großen Appetit gehabt</div>
      <div class="cc-karte-popup-body" style="flex-direction:column;align-items:stretch;gap:5px">
        ${row('Felder aufgedeckt', `${rep.steps}`)}
        <div style="border-top:1px solid rgba(255,255,255,.12);margin:4px 0;padding-top:5px"></div>
        ${fundListe}
        ${eventListe ? `<div style="border-top:1px solid rgba(255,255,255,.12);margin:4px 0;padding-top:5px"></div>${eventListe}` : ''}
        <div style="border-top:1px solid rgba(255,255,255,.12);margin:4px 0;padding-top:5px"></div>
        ${row('Erbeutet', `+${netto} 🫘`)}
        ${row('Pauschale', `−${rep.cost} 🫘`)}
        <div style="display:flex;justify-content:space-between;font-weight:700">
          <span>Unterm Strich</span><span>${gesamt >= 0 ? '+' : ''}${gesamt} 🫘</span>
        </div>
        ${endMsg ? `<div style="font-size:11px;opacity:.6;margin-top:5px">${_kbEsc(endMsg)}</div>` : ''}
      </div>
      <button class="cc-karte-popup-close" id="karte-auto-report-close" style="width:100%;margin-top:10px">Schließen</button>
    </div>`;

  document.getElementById('karte-auto-report-close').onclick = () => {
    host.classList.add('hidden');
    host.innerHTML = '';
    // Karten-Tab neu aufbauen, damit die Tipp-Steuerung wieder auf frischem Stand ist
    try {
      const el = document.getElementById('imp-content');
      if (el && typeof _buildKarte === 'function' && typeof currentUserData !== 'undefined') {
        el.innerHTML = '';
        _buildKarte(currentUserData, el);
      }
    } catch (e) { /* egal */ }
    // Ein während des Laufs freigeschalteter Dungeon-Meilenstein kommt jetzt zum Zug
    if (rep.dungeonArgs && typeof _showDungeonModal === 'function') {
      try { _showDungeonModal(...rep.dungeonArgs); } catch (e) { /* egal */ }
    }
  };
}

// Falls die Karte kein eigenes Popup-Element hat, legen wir eines an.
function _karteAutoEnsurePopupHost() {
  let host = document.getElementById('karte-auto-popup');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'karte-auto-popup';
  host.className = 'cc-karte-popup';
  host.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;'
    + 'justify-content:center;padding:16px;background:rgba(0,0,0,.72)';
  document.body.appendChild(host);
  return host;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) Oberfläche
// ═══════════════════════════════════════════════════════════════════════════

function karteAutoMountControls() {
  const canvas = document.getElementById('cc-karte-canvas');
  if (!canvas) return;
  document.getElementById('karte-auto-wrap')?.remove();

  const ctx = _kbBuildState();
  if (!ctx) return;
  const left = _kbStepsLeft(ctx.state);

  const wrap = document.createElement('div');
  wrap.id = 'karte-auto-wrap';
  wrap.style.cssText = 'margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px';

  if (_karteAutoRunning) {
    wrap.innerHTML = `
      <div style="font-weight:700">🥾 Unterwegs …</div>
      <div id="karte-auto-progress" style="font-size:12px;margin-top:4px">👣 0 Felder</div>
      <button class="cc-karte-popup-close" id="karte-auto-stop" style="width:100%;margin-top:8px">⏹ Anhalten</button>`;
  } else {
    const ok = left >= KARTE_AUTO_MIN_STEPS;
    wrap.innerHTML = `
      <div style="font-weight:700">🥾 Auto-Wanderung</div>
      <div style="font-size:11px;opacity:.7;margin-top:3px;line-height:1.4">
        Läuft den Tag allein ab, deckt Feld für Feld auf und sammelt alles ein.
        Am Ende gibt es eine Zusammenfassung statt vieler Popups.
      </div>
      <button class="cc-build-btn" id="karte-auto-go" style="width:100%;margin-top:8px" ${ok ? '' : 'disabled'}>
        ${ok ? `🥾 Losgehen — ${left} Schritte · ${KARTE_AUTO_COST} 🫘`
             : `Erst ab ${KARTE_AUTO_MIN_STEPS} freien Schritten (${left} übrig)`}
      </button>`;
  }

  const anchor = document.getElementById('karte-hint') || canvas;
  (anchor.parentElement || canvas.parentElement)?.appendChild(wrap);

  document.getElementById('karte-auto-stop')?.addEventListener('click', () => {
    _karteAutoStop = true;
    _kbToast('⏹ Wanderung wird beendet …', 'info');
  });
  document.getElementById('karte-auto-go')?.addEventListener('click', async () => {
    const fresh = _kbBuildState();
    if (!fresh) return;
    _karteAutoRunning = true;
    karteAutoMountControls();
    await karteAutoRun(fresh);
    _karteAutoRunning = false;
    karteAutoMountControls();
  });
}

function _karteAutoUpdateProgress(rep, state) {
  const el = document.getElementById('karte-auto-progress');
  if (!el) return;
  const left = _kbStepsLeft(state);
  el.textContent = `👣 ${rep.steps} Felder · 🍽️ ${rep.treasures.length} Funde · ${left} Schritte übrig`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) Selbstmontage — kein Patch an imperium.js nötig
// ═══════════════════════════════════════════════════════════════════════════
// Weg A: _karteUpdateHUD umschließen. Die Funktion wird nach jedem Render und nach
// jedem Schritt aufgerufen und ist eine klassische function-Deklaration, liegt also
// auf window. Weg B: MutationObserver auf das Auftauchen des Canvas.
let _karteAutoHookInstalled = false;

(function _karteAutoInstallHook() {
  try {
    const g = window;
    if (typeof g._karteUpdateHUD !== 'function') return;
    const _orig = g._karteUpdateHUD;
    if (_orig.__kbWrapped) { _karteAutoHookInstalled = true; return; }
    const wrapped = function (state) {
      const out = _orig.apply(this, arguments);
      try { if (!document.getElementById('karte-auto-wrap')) karteAutoMountControls(); }
      catch (e) { console.warn('Auto-Wanderung: Panel nicht eingehängt:', e); }
      return out;
    };
    wrapped.__kbWrapped = true;
    g._karteUpdateHUD = wrapped;
    _karteAutoHookInstalled = true;
  } catch (e) { console.warn('Auto-Wanderung: Hook nicht möglich:', e); }
})();

(function _karteAutoInstallObserver() {
  if (_karteAutoHookInstalled) return;
  if (typeof document === 'undefined') return;
  let pending = false;
  const tryMount = () => {
    pending = false;
    try {
      if (!document.getElementById('cc-karte-canvas')) return;
      if (document.getElementById('karte-auto-wrap')) return;
      karteAutoMountControls();
    } catch (e) { console.warn('Auto-Wanderung: Selbstmontage fehlgeschlagen:', e); }
  };
  const schedule = () => { if (!pending) { pending = true; setTimeout(tryMount, 60); } };
  try {
    new MutationObserver(schedule).observe(document.body || document.documentElement, {
      childList: true, subtree: true,
    });
    schedule();
  } catch (e) { console.warn('Auto-Wanderung: Beobachter konnte nicht starten:', e); }
})();
