// ═══════════════════════════════════════════════════════════════════════════
// kaffeemobil.js — 🚐 Kaffeemobil: Welteroberung (Erlebnis-Minigame #2)
// Plan: plans/PLAN_kaffeemobil_welteroberung.md (Etappe 3 = Client-Kern).
// VOR imperium.js laden. Der Graph (Städte/Kanten) kommt SERVER-seitig
// (DB.fetchMobilGraph) und wird hier gecached — einzige Wahrheit, kein JS-Duplikat.
// Reise-/Ankunfts-Logik läuft server-autoritativ über DB.startTrip/DB.claimArrival;
// dieses Modul rendert nur die geteilte Weltkarte + Reise-UI und löst Ankünfte ein.
// ═══════════════════════════════════════════════════════════════════════════

const KM_CONT_COLOR = { de:'#e0b24d', eu:'#8fbf6f', af:'#d98a4a', as:'#c86fa8',
                        na:'#5f9ec8', sa:'#5fc89a', oc:'#b06fc8' };
// Kantentyp → Farbe / Leaflet-dashArray (null = durchgezogen) / Label
const KM_KIND = { land:{c:'#d4b354',d:null,  lbl:'🚗 Straße'},
                  sea: {c:'#5aa6da',d:'4 8', lbl:'⚓ Fähre/Fracht'},
                  air: {c:'#cf8fd6',d:'2 10',lbl:'✈️ Frachtflug'} };

// Die Karte ist jetzt eine echte Leaflet-Slippy-Map (dieselbe Basiskarte wie im
// Weltimperium, js/world.js). Die Städte liegen in der DB weiterhin als projizierte
// x/y (0..1000 × 0..500, äquirektangular) — daraus rechnen wir die geografischen
// lat/lon zurück (Inverse von x=(lon+180)/360·1000, y=(90-lat)/180·500), damit die
// Punkte exakt auf der echten Weltkarte sitzen. Kein SQL-Change nötig.
function kmCityLat(c) { return 90 - (c.y / 500) * 180; }
function kmCityLng(c) { return (c.x / 1000) * 360 - 180; }
// Antimeridian-Normalisierung: zieht lng2 in die Nähe von lng1, damit Linien/Fahrten
// die kürzere Strecke nehmen (statt quer über die ganze Karte, wenn ±180 überschritten wird).
function kmWrapLng(lng2, lng1) {
  while (lng2 - lng1 > 180)  lng2 -= 360;
  while (lng2 - lng1 < -180) lng2 += 360;
  return lng2;
}

let _kmGraph = null;      // { cities:{id:city}, adj:{id:[{to,kind,cost,dur}]}, pair:{key:edge} }
let _kmMap   = null;      // Leaflet-Karte (dieselbe Basiskarte wie im Weltimperium)
let _kmMobileMarkers = {};// { userId: L.marker } — für die Fahrt-Animation im Loop
let _kmGeo   = null;      // gecachte assets/g20.geojson (Länder-Umrisse, wie im Weltimperium)
let _kmEl    = null;      // Container
let _kmMember= null;      // aktuelles Mitglied (currentUserData)
let _kmRaf   = null;      // Animations-Frame
let _kmLastPaint = 0;     // Throttle
let _kmClaiming = false;  // In-Flight-Guard für Ankunft
let _kmBusy  = false;     // In-Flight-Guard für Reisestart
let _kmPopupTimer = null; // Auto-Ausblenden des Ankunfts-Popups

// ── Graph laden/cachen ───────────────────────────────────────────────────────
async function kmEnsureGraph() {
  if (_kmGraph) return _kmGraph;
  const g = await DB.fetchMobilGraph();
  const cities = {}; (g.cities || []).forEach(c => { c.lat = kmCityLat(c); c.lng = kmCityLng(c); cities[c.id] = c; });
  const adj = {}; Object.keys(cities).forEach(id => adj[id] = []);
  const pair = {};
  (g.edges || []).forEach(e => {
    if (adj[e.a]) adj[e.a].push({ to:e.b, kind:e.kind, cost:e.cost_cc, dur:e.duration_min });
    if (adj[e.b]) adj[e.b].push({ to:e.a, kind:e.kind, cost:e.cost_cc, dur:e.duration_min });
    pair[kmPairKey(e.a, e.b)] = e;
  });
  _kmGraph = { cities, adj, pair };
  return _kmGraph;
}
function kmPairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

// ── State-Helfer ─────────────────────────────────────────────────────────────
function kmMobil(m)    { return (m && m.mobil) || {}; }
function kmAt(m)       { return kmMobil(m).at || 'hamburg'; }
function kmVisited(m)  { return kmMobil(m).visited || {}; }
function kmTrip(m)     { const t = kmMobil(m).trip; return (t && typeof t === 'object') ? t : null; }
function kmUnique(m)   { return kmMobil(m).uniqueCount || Object.keys(kmVisited(m)).length || 1; }
function kmCooldownUntil(m, a, b) {
  const cd = kmMobil(m).edgeCooldown || {}; const v = cd[kmPairKey(a, b)];
  return v ? Date.parse(v) : 0;
}

// ── Reward-/Kosten-Vorschau (Spiegel §5c — reine Anzeige, Autorität = Server) ──
function kmPreview(m, edge, toId) {
  const dist = (_kmGraph.cities[toId] || {}).dist_rank || 0;
  const known = !!kmVisited(m)[toId];
  const costEff = known ? Math.round(edge.cost * 0.6) : edge.cost;
  if (!known) return { costEff, reward: Math.round(costEff*1.4 + dist*30 + dist*60), first:true };
  const vc = (kmVisited(m)[toId] && kmVisited(m)[toId].count) || 1;
  const base = costEff*1.4 + dist*30;
  const rf = Math.max(0.2, 0.6 - (Math.max(vc,1) - 1) * 0.08);
  return { costEff, reward: Math.max(Math.round(base*rf), Math.round(costEff*1.15)), first:false };
}

// ── Formatierung ─────────────────────────────────────────────────────────────
function kmFmtDur(min) {
  if (min < 60) return min + ' Min';
  const h = Math.round(min / 60);
  if (h < 24) return h + ' Std';
  const d = Math.floor(h / 24), r = h % 24;
  return r ? `${d} T ${r} Std` : `${d} T`;
}
function kmCountdown(ms) {
  if (ms <= 0) return 'gleich da';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return min + ' Min';
  const h = Math.floor(min / 60), rm = min % 60;
  if (h < 24) return rm ? `${h} Std ${rm} Min` : `${h} Std`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} T ${rh} Std` : `${d} T`;
}
function _kmEsc(s) { return (typeof _esc === 'function') ? _esc(s) : String(s == null ? '' : s); }

// ── Position eines Mobils als lat/lng (bei Fahrt entlang der Route interpoliert) ─
function kmPos(mobil) {
  const trip = (mobil && mobil.trip && typeof mobil.trip === 'object') ? mobil.trip : null;
  if (trip) {
    const a = _kmGraph.cities[trip.from], b = _kmGraph.cities[trip.to];
    if (a && b) {
      const s = Date.parse(trip.startAt), e = Date.parse(trip.arriveAt), now = Date.now();
      const p = (e > s) ? Math.max(0, Math.min(1, (now - s) / (e - s))) : 1;
      const lngB = kmWrapLng(b.lng, a.lng);
      return { lat: a.lat + (b.lat - a.lat) * p, lng: a.lng + (lngB - a.lng) * p, moving: true };
    }
  }
  const c = _kmGraph.cities[(mobil && mobil.at) || 'hamburg'];
  return c ? { lat: c.lat, lng: c.lng, moving: false } : { lat: 53.55, lng: 9.99, moving: false };
}

// ── View — Leaflet steuert Pan/Zoom selbst; „🎯" zentriert auf den Spieler ─────
function kmHome() {
  if (!_kmMap) return;
  const c = _kmGraph && (_kmGraph.cities[kmAt(_kmMember)] || _kmGraph.cities.hamburg);
  if (c) _kmMap.setView([c.lat, c.lng], 4, { animate: true });
}

// ── Haupt-Renderer ───────────────────────────────────────────────────────────
async function _buildKaffeemobil(member, el) {
  _kmEl = el; _kmMember = member || (typeof currentUserData !== 'undefined' ? currentUserData : null);
  el.innerHTML = '<p style="color:var(--muted);padding:16px">🌍 Lade Weltkarte …</p>';
  try { await kmEnsureGraph(); }
  catch (e) { el.innerHTML = '<p style="color:var(--muted);padding:16px">Weltkarte konnte nicht geladen werden. Ist die Kaffeemobil-Datenbank schon eingespielt?</p>'; return; }
  if (!_kmGraph || !Object.keys(_kmGraph.cities).length) {
    el.innerHTML = '<p style="color:var(--muted);padding:16px">Es sind 0 Städte geladen — vermutlich fehlt der Lese-Zugriff (RLS) auf <code>mobil_cities</code>/<code>mobil_edges</code>. Bitte die SELECT-Policy setzen (siehe Migration).</p>';
    return;
  }
  try { await kmCheckArrival(_kmMember); } catch (e) { /* non-critical */ }
  kmRender();
}

function kmRender() {
  if (!_kmEl) return;
  const m = _kmMember;
  const trip = kmTrip(m);
  const total = Object.keys(_kmGraph.cities).length;

  // Status-Banner
  let status;
  if (trip) {
    const to = _kmGraph.cities[trip.to], from = _kmGraph.cities[trip.from];
    status = `<div class="cc-mobil-status traveling">
        🚚 <strong>Unterwegs</strong> ${_kmEsc((from||{}).name)} → ${_kmEsc((to||{}).name)}
        <span class="km-eta" id="km-eta">· Ankunft in ${kmCountdown(Date.parse(trip.arriveAt) - Date.now())}</span>
        <div class="km-progress"><div class="km-progress-bar" id="km-progress"></div></div>
      </div>`;
  } else {
    const here = _kmGraph.cities[kmAt(m)] || {};
    status = `<div class="cc-mobil-status">
        📍 Aktuell in <strong>${_kmEsc(here.name)}</strong>
        · 🏆 bereist: <strong>${kmUnique(m)}/${total}</strong> Städte
      </div>`;
  }

  el_set(`
    <p class="cc-mobil-lead">🚐 <strong>Kaffeemobil</strong> — fahr mit deinem Kaffee von Stadt zu Stadt und erobere die Welt. Jede Reise kostet CoffeeCoins und dauert echte Zeit; bei Ankunft gibt es einen Reisebonus (je weiter, desto mehr). Start: Hamburg.</p>
    ${status}
    <div class="cc-mobil-maprow">
      <div class="cc-mobil-controls">
        <button class="km-ctrl" data-km-ctrl="in">➕</button>
        <button class="km-ctrl" data-km-ctrl="out">➖</button>
        <button class="km-ctrl" data-km-ctrl="home">🎯</button>
      </div>
      <div id="km-map" class="cc-mobil-map"></div>
    </div>
    <div class="cc-mobil-dest" id="km-dest">${kmDestList()}</div>
    <div id="km-dialog"></div>
  `);

  kmBuildMap();
  kmWireEvents();
  kmStartLoop();
}
function el_set(html) { if (_kmEl) _kmEl.innerHTML = html; }

// ── Leaflet-Weltkarte (dieselbe Basiskarte wie im Weltimperium) ──────────────
function kmBuildMap() {
  const host = document.getElementById('km-map');
  if (!host) return;
  if (typeof L === 'undefined') { host.innerHTML = '<p style="color:var(--muted);padding:16px">Karte konnte nicht geladen werden (Leaflet fehlt).</p>'; return; }
  if (_kmMap) { try { _kmMap.remove(); } catch (e) {} _kmMap = null; }
  _kmMobileMarkers = {};

  const g = _kmGraph, m = _kmMember;
  const cur = kmAt(m);
  const here = g.cities[cur] || g.cities.hamburg;
  const center = here ? [here.lat, here.lng] : [30, 10];

  const map = L.map('km-map', {
    center, zoom: 4, minZoom: 2, maxZoom: 7, worldCopyJump: true,
    attributionControl: false, zoomControl: false, scrollWheelZoom: true,
  });
  _kmMap = map;
  // Gleiche dunkle Basiskarte wie die Weltimperium-Karte (js/world.js) — kein Stil-Bruch.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 8,
  }).addTo(map);

  // Länder-Umrisse (dieselbe assets/g20.geojson wie im Weltimperium) als dezente Deko-Schicht.
  // Eigene Pane zwischen Kacheln (z 200) und Routen/Städten (overlayPane 400), pointer-events aus
  // → liegt sichtbar unter den Markern und fängt keine Klicks ab.
  map.createPane('kmCountries');
  map.getPane('kmCountries').style.zIndex = '250';
  map.getPane('kmCountries').style.pointerEvents = 'none';
  kmAddCountryOutlines(map);

  const reach = {}; (g.adj[cur] || []).forEach(n => reach[n.to] = n);
  const visited = kmVisited(m);
  const traveling = !!kmTrip(m);

  // Routen (Kanten) als Polylinien — hervorgehoben, wenn sie an der aktuellen Stadt hängen.
  const drawn = new Set();
  for (const id in g.adj) for (const n of g.adj[id]) {
    const key = kmPairKey(id, n.to); if (drawn.has(key)) continue; drawn.add(key);
    const a = g.cities[id], b = g.cities[n.to]; if (!a || !b) continue;
    const st = KM_KIND[n.kind] || KM_KIND.land;
    const hot = (id === cur || n.to === cur);
    L.polyline([[a.lat, a.lng], [b.lat, kmWrapLng(b.lng, a.lng)]], {
      color: st.c, weight: hot ? 2.6 : 1.1, opacity: hot ? 0.92 : 0.34,
      dashArray: st.d, interactive: false, lineJoin: 'round',
    }).addTo(map);
  }

  // Wer steht/fährt wo? (geteilte Karte)
  const users = (typeof appData !== 'undefined' && appData && appData.users) ? appData.users : [];
  const myId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  const occupied = {};
  for (const u of users) { if (u && u.mobil) occupied[u.mobil.at || 'hamburg'] = true; }

  // Städte als Kreis-Marker; Namen als Tooltip (nur aktuelle/erreichbare/besetzte dauerhaft).
  for (const id in g.cities) {
    const c = g.cities[id];
    const isCur = (id === cur), isReach = !!reach[id], isVis = !!visited[id];
    const fill = isVis ? (KM_CONT_COLOR[c.continent] || '#888') : '#3a3f46';
    const rad = isCur ? 7 : (isReach ? 6 : 4);
    const stroke = isCur ? '#ffd15c' : (isReach ? '#ffffff' : 'rgba(255,255,255,.45)');
    const clickable = isReach && !traveling;
    const mk = L.circleMarker([c.lat, c.lng], {
      radius: rad, fillColor: fill, fillOpacity: isVis ? 0.95 : 0.72,
      color: stroke, weight: isCur ? 3 : (isReach ? 2 : 1),
      className: clickable ? 'km-city km-city-go' : 'km-city',
    }).addTo(map);
    const label = _kmEsc(c.name) + (c.is_port ? ' ⚓' : '') + (c.is_air ? ' ✈️' : '');
    mk.bindTooltip(label, {
      permanent: isCur || isReach || !!occupied[id], direction: 'top',
      className: 'km-city-tip' + (isCur ? ' cur' : ''), offset: [0, -rad + 2], opacity: 0.95,
    });
    if (clickable) mk.on('click', () => kmConfirm(id));
  }

  // Mobile (alle Spieler) als 🚐-Icon — Position wird im Loop animiert (kmPos).
  for (const u of users) {
    if (!u || !u.mobil) continue;
    const p = kmPos(u.mobil); const mine = (u.id === myId);
    // Farbring in der Spielerfarbe der Auswertungs-Grafik (playerColor aus app.js) — das 🚐-Emoji
    // selbst lässt sich nicht einfärben, deshalb eine farbige Scheibe dahinter. Fallback auf die
    // bisherige schmucklose Darstellung, falls app.js (noch) nicht geladen ist.
    const col = (typeof playerColor === 'function') ? playerColor(u.id) : null;
    const html = col ? `<span class="km-mobil-dot" style="--kmc:${col}">🚐</span>` : '🚐';
    const icon = L.divIcon({ className: 'km-mobil-icon' + (mine ? ' mine' : ''), html, iconSize: [24, 24], iconAnchor: [12, 12] });
    _kmMobileMarkers[u.id] = L.marker([p.lat, p.lng], { icon, interactive: false, keyboard: false, zIndexOffset: mine ? 1000 : 400 }).addTo(map);
  }

  // Leaflet braucht ein invalidateSize, wenn der Container erst frisch eingehängt wurde.
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 120);
}

// Länder-Umrisse in die 'kmCountries'-Pane zeichnen (gecacht; asynchroner Fetch schadet nicht,
// da die Pane immer unter Routen/Städten liegt — egal, wann er auflöst). Nie kritisch.
function kmAddCountryOutlines(map) {
  const draw = (geo) => {
    if (!geo || !_kmMap || _kmMap !== map) return;   // Karte inzwischen neu gebaut → verwerfen
    try {
      L.geoJSON(geo, {
        pane: 'kmCountries', interactive: false,
        style: { fillColor: '#33414d', fillOpacity: 0.14, color: 'rgba(255,255,255,.20)', weight: 0.7 },
      }).addTo(map);
    } catch (e) { /* non-critical */ }
  };
  if (_kmGeo) { draw(_kmGeo); return; }
  fetch('assets/g20.geojson').then(r => r.json()).then(geo => { _kmGeo = geo; draw(geo); }).catch(() => {});
}

// ── Reiseziel-Liste ──────────────────────────────────────────────────────────
function kmDestList() {
  const m = _kmMember, cur = kmAt(m), trip = kmTrip(m);
  const neighbors = (_kmGraph.adj[cur] || []).slice().sort((a, b) => a.cost - b.cost);
  if (trip) return `<p class="km-dest-hint">🚚 Dein Mobil ist unterwegs — neue Reisen sind nach der Ankunft möglich.</p>`;
  if (!neighbors.length) return `<p class="km-dest-hint">Von hier führt aktuell keine Route weiter.</p>`;
  const coins = (m && m.coins) || 0;
  let rows = '';
  for (const n of neighbors) {
    const c = _kmGraph.cities[n.to]; if (!c) continue;
    const pv = kmPreview(m, n, n.to);
    const cdUntil = kmCooldownUntil(m, cur, n.to);
    const onCd = cdUntil > Date.now();
    const poor = coins < pv.costEff;
    const kind = KM_KIND[n.kind] || KM_KIND.land;
    const known = !!kmVisited(m)[n.to];
    let btn, cls = '';
    if (onCd) { btn = `⏳ ${kmCountdown(cdUntil - Date.now())}`; cls = 'cd'; }
    else if (poor) { btn = `zu wenig CC`; cls = 'poor'; }
    else btn = `Losfahren`;
    rows += `<div class="cc-mobil-dest-row ${cls}">
        <div class="km-dest-main">
          <span class="km-dest-name">${_kmEsc(c.name)}</span>
          <span class="km-dest-meta">${kind.lbl} · ⏱ ${kmFmtDur(n.dur)} · dist ${c.dist_rank}${known ? ' · bekannt −40%' : ''}</span>
        </div>
        <div class="km-dest-nums">
          <span class="km-dest-cost">−${pv.costEff}</span>
          <span class="km-dest-rew">+${pv.reward}${pv.first ? ' ⭐' : ''}</span>
        </div>
        <button class="km-go ${cls}" data-km-go="${n.to}" ${(onCd || poor) ? 'disabled' : ''}>${btn}</button>
      </div>`;
  }
  return `<h4 class="km-dest-title">🧭 Reiseziele ab ${_kmEsc((_kmGraph.cities[cur]||{}).name)}</h4>${rows}
    <p class="km-legend">⭐ Erstbesuch = Eroberungsbonus · ⏳ Strecke im Cooldown (kein direktes Hin-und-Her)</p>`;
}

// ── Events ───────────────────────────────────────────────────────────────────
function kmWireEvents() {
  const root = _kmEl; if (!root) return;
  // Städte-Klicks laufen jetzt über die Leaflet-Marker (kmBuildMap); Pan/Zoom macht Leaflet
  // selbst. Hier bleiben nur die Overlay-Buttons (Zoom/Home), die Reiseziel-Liste und der Dialog.
  root.onclick = async (e) => {
    const ctrl = e.target.closest('[data-km-ctrl]');
    if (ctrl) { const a = ctrl.dataset.kmCtrl;
      if (_kmMap) { if (a === 'in') _kmMap.zoomIn(); else if (a === 'out') _kmMap.zoomOut(); else kmHome(); }
      return; }
    const go = e.target.closest('[data-km-go]');
    if (go && !go.disabled) { kmConfirm(go.dataset.kmGo); return; }
    const dlg = e.target.closest('[data-km-dlg]');
    if (dlg) { const a = dlg.dataset.kmDlg; if (a === 'cancel') { const d=document.getElementById('km-dialog'); if(d) d.innerHTML=''; } else await kmStartTrip(a); return; }
  };
}

// ── Reise-Bestätigung ────────────────────────────────────────────────────────
function kmConfirm(toId) {
  const m = _kmMember, cur = kmAt(m);
  const n = (_kmGraph.adj[cur] || []).find(x => x.to === toId); if (!n) return;
  const c = _kmGraph.cities[toId]; const pv = kmPreview(m, n, toId);
  const kind = KM_KIND[n.kind] || KM_KIND.land;
  const d = document.getElementById('km-dialog'); if (!d) return;
  d.innerHTML = `<div class="cc-mobil-confirm">
      <div class="km-cf-head">🚐 Reise nach <strong>${_kmEsc(c.name)}</strong></div>
      <div class="km-cf-body">
        ${kind.lbl} · Dauer ⏱ ${kmFmtDur(n.dur)}<br>
        Einsatz <strong>−${pv.costEff} CC</strong> · Reisebonus bei Ankunft <strong>+${pv.reward} CC</strong>${pv.first ? ' ⭐ Erstbesuch' : ''}
      </div>
      <div class="km-cf-actions">
        <button class="btn-primary" data-km-dlg="${toId}">Losfahren</button>
        <button class="km-cf-cancel" data-km-dlg="cancel">Abbrechen</button>
      </div>
    </div>`;
}

// ── Reise starten ────────────────────────────────────────────────────────────
async function kmStartTrip(toId) {
  if (_kmBusy) return; _kmBusy = true;
  const d = document.getElementById('km-dialog'); if (d) d.innerHTML = '';
  try {
    const res = await DB.startTrip(currentUser.id, toId);
    if (res && res.error) { showToast(kmErr(res), 'error'); return; }
    const c = _kmGraph.cities[toId];
    const _cost = res.cost || 0;
    // Tages-Log (Rubrik erlebnis; Reise-Einsatz = Konsum, kein invest)
    try { await DB.appendTodayLogFresh(currentUser.id, [{ label: `🚐 Reise begonnen nach ${(c||{}).name || toId}`, amount: -_cost, cat: 'erlebnis', detail: 'Kaffeemobil' }]); } catch (e) {}
    await kmSyncAfterAction(res);
    showToast(`🚐 Reise begonnen nach ${(c||{}).name || toId} – ${_cost} CC · Ankunft in ${kmFmtDur((Date.parse(res.arriveAt)-Date.now())/60000)}`, 'success');
    kmRender();
  } catch (e) { showToast(e.message, 'error'); }
  finally { _kmBusy = false; }
}

// ── Ankunft einlösen ─────────────────────────────────────────────────────────
async function kmCheckArrival(member) {
  const m = member || _kmMember; const trip = kmTrip(m);
  if (!trip || _kmClaiming) return false;
  if (Date.now() < Date.parse(trip.arriveAt)) return false;
  _kmClaiming = true;
  // Reisedauer aus dem laufenden Trip (start→Ankunft) für die Meldungen festhalten.
  const _durMin = (trip.startAt && trip.arriveAt) ? Math.max(0, (Date.parse(trip.arriveAt) - Date.parse(trip.startAt)) / 60000) : 0;
  try {
    const res = await DB.claimArrival(currentUser.id);
    if (res && res.error) { if (res.error !== 'still_traveling') console.warn('claim_arrival:', res.error); return false; }
    const c = _kmGraph ? _kmGraph.cities[res.city] : null;
    const _durTxt = _durMin > 0 ? ` nach ${kmFmtDur(_durMin)}` : '';
    try { await DB.appendTodayLogFresh(currentUser.id, [{ label: `🏁 Ankunft in ${(c||{}).name || res.city}${_durTxt}`, amount: res.reward || 0, cat: 'erlebnis', detail: res.firstVisit ? 'Erstbesuch' : 'Kaffeemobil' }]); } catch (e) {}
    await kmSyncAfterAction(res);
    // Kleines Ankunfts-Popup für den Reisenden selbst (auch im Hintergrund/anderer Tab).
    kmShowArrival((c || {}).name || res.city, res.reward || 0, res.firstVisit, _durMin);
    // Ankunft in die Gruppe posten — mit Reisebonus (CC), bei JEDER Bereisung, nicht nur Erstbesuch (#2, 2026-07-15) — nie kritisch
    {
      const nm = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) || 'Jemand';
      const _cityNm = (c || {}).name || res.city;
      const _rw = res.reward || 0;
      const _msg = res.firstVisit
        ? `🚐 ${nm} hat ${_cityNm} ⭐ erstmals erreicht – +${_rw} CC Reisebonus!`
        : `🚐 ${nm} hat ${_cityNm} erreicht – +${_rw} CC erhalten`;
      try { await DB.postMessage(_msg, nm); } catch (e) {}
    }
    await kmGrantAchievements(res.mobil || (_kmMember && _kmMember.mobil));
    return true;
  } catch (e) { console.warn('kmCheckArrival:', e.message); return false; }
  finally { _kmClaiming = false; }
}

// ── Ankunfts-Popup (kleine, nicht-blockierende Karte) ────────────────────────
// Erscheint für den Reisenden selbst bei Ankunft — auch wenn der Kaffeemobil-Tab
// gerade nicht offen ist (Hintergrund-Ankunft via app.js). Hängt sich selbst an
// <body> (unabhängig vom Karte-Tab), nutzt aber dieselben .cc-karte-popup-Styles.
function kmShowArrival(cityName, reward, firstVisit, durMin) {
  try {
    let el = document.getElementById('cc-mobil-popup');
    if (!el) { el = document.createElement('div'); el.id = 'cc-mobil-popup'; document.body.appendChild(el); }
    el.className = 'cc-karte-popup cc-karte-popup--auto';
    const _durTxt = (durMin && durMin > 0) ? `Reise: ${kmFmtDur(durMin)} · ` : '';
    el.innerHTML = `
      <div class="cc-karte-popup-inner">
        <div class="cc-karte-popup-hdr">🏁 ANGEKOMMEN!</div>
        <div class="cc-karte-popup-body">
          <span class="cc-karte-popup-emoji">🚐</span>
          <div class="cc-karte-popup-text">
            <strong>${_kmEsc(cityName || 'Ziel')}${firstVisit ? ' ⭐' : ''}</strong>
            <em>${_durTxt}${firstVisit ? 'Erstbesuch — Entdecker-Bonus!' : 'Gute Reise gehabt.'}</em>
            <span class="cc-karte-popup-cc">+${reward} 🫘 CC Reisebonus</span>
          </div>
        </div>
      </div>`;
    clearTimeout(_kmPopupTimer);
    _kmPopupTimer = setTimeout(() => { const p = document.getElementById('cc-mobil-popup'); if (p) p.classList.add('hidden'); }, 3400);
  } catch (e) { /* non-critical */ }
}

// ── Nach Aktion: appData/Coins/Member syncen ─────────────────────────────────
async function kmSyncAfterAction(res) {
  try {
    if (typeof appData !== 'undefined') appData = await DB.fetchData();
    const updated = (typeof appData !== 'undefined' && appData) ? appData.users.find(u => u.id === currentUser.id) : null;
    if (updated) { _kmMember = updated; if (typeof currentUserData !== 'undefined') currentUserData = { ...currentUserData, ...updated }; }
    else if (res && res.mobil) { _kmMember = { ..._kmMember, mobil: res.mobil }; }
    if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins(updated || _kmMember);
  } catch (e) { if (res && res.mobil) _kmMember = { ..._kmMember, mobil: res.mobil }; }
}

function kmErr(res) {
  const map = { already_traveling:'Dein Mobil ist schon unterwegs.', no_edge:'Von hier gibt es keine direkte Route dorthin.',
    no_hub:'Übersee geht nur von einer Hafen- oder Flughafenstadt.', edge_cooldown:'Diese Strecke ist gerade im Cooldown — kein direktes Hin-und-Her.',
    insufficient:'Nicht genug CoffeeCoins für diese Reise.', not_found:'Mitglied nicht gefunden.' };
  return map[res.error] || 'Reise nicht möglich';
}

// ── Achievements vergeben (event-basiert, nach Ankunft; nie kritisch) ────────
async function kmGrantAchievements(mobil) {
  try {
    if (!mobil || typeof DB.grantAchievements !== 'function' || typeof ACHIEVEMENTS === 'undefined' || !_kmGraph) return;
    const owned   = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.achievements) || {};
    const vset    = new Set(Object.keys(mobil.visited || {}));
    const trips   = mobil.totalTrips || 0;
    const uniq    = mobil.uniqueCount || vset.size;
    const byCont  = {}, hasCont = {};
    for (const id in _kmGraph.cities) {
      const c = _kmGraph.cities[id];
      (byCont[c.continent] = byCont[c.continent] || []).push(id);
      if (vset.has(id)) hasCont[c.continent] = true;
    }
    const allIn = k => (byCont[k] || []).length > 0 && byCont[k].every(id => vset.has(id));
    const want = {
      mobil_first: trips >= 1,
      mobil_trips_10: trips >= 10,
      mobil_trips_50: trips >= 50,
      mobil_trips_100: trips >= 100,
      mobil_germany: allIn('de'),
      mobil_europe: allIn('eu'),
      mobil_continents: ['eu','af','as','na','sa','oc'].every(k => hasCont[k]),
      mobil_origins: ['addis','bogota','jakarta','hanoi'].every(id => vset.has(id)),
      mobil_world: uniq >= 50,
    };
    const grant = {};
    for (const id in want) if (want[id] && !owned[id]) grant[id] = true;
    if (!Object.keys(grant).length) return;
    await DB.grantAchievements(currentUser.id, grant);
    if (typeof currentUserData !== 'undefined' && currentUserData)
      currentUserData = { ...currentUserData, achievements: { ...owned, ...grant } };
    for (const id in grant) {
      const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) continue;
      showToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success');
    }
  } catch (e) { /* non-critical */ }
}

// ── Hintergrund-Ankunft (aus app.js showApp/Poll, auch ohne offenen Tab) ─────
// Löst eine fällige Fahrt global ein, damit man den Bonus nicht verpasst, wenn man
// den Kaffeemobil-Tab gerade nicht offen hat. Gated auf die Freischaltung + aktive
// Fahrt (kein Fetch/kein Aufwand für Spieler ohne das Feature). Nie kritisch.
async function kmMaybeArrive() {
  try {
    if (typeof currentUserData === 'undefined' || !currentUserData) return;
    const r = currentUserData.research || {};
    if (!(r.kaffeemobil && r.barista_kurs && r.fahrender_haendler)) return;
    const trip = currentUserData.mobil && currentUserData.mobil.trip;
    if (!trip || typeof trip !== 'object') return;
    if (Date.now() < Date.parse(trip.arriveAt)) return;
    await kmEnsureGraph();                 // für Städtenamen (gecached)
    const claimed = await kmCheckArrival(currentUserData);
    if (claimed && document.querySelector('#imp-content #km-map')) kmRender(); // offener Tab → neu zeichnen
  } catch (e) { /* non-critical */ }
}

// ── Animations-Loop (Countdown + fahrende Mobile) ────────────────────────────
function kmStartLoop() {
  if (_kmRaf) cancelAnimationFrame(_kmRaf);
  const step = (ts) => {
    const mapEl = document.getElementById('km-map');
    if (!mapEl || !document.body.contains(mapEl)) { _kmRaf = null; return; }   // Tab verlassen → Loop stoppen
    if (ts - _kmLastPaint > 500) {
      _kmLastPaint = ts;
      // Fahrende Mobile (aller Spieler) entlang ihrer Route bewegen
      const users = (typeof appData !== 'undefined' && appData && appData.users) ? appData.users : [];
      for (const u of users) {
        const mk = u && _kmMobileMarkers[u.id];
        if (!mk || !u.mobil) continue;
        const p = kmPos(u.mobil);
        try { mk.setLatLng([p.lat, p.lng]); } catch (e) {}
      }
      const trip = kmTrip(_kmMember);
      if (trip) {
        const rem = Date.parse(trip.arriveAt) - Date.now();
        const eta = document.getElementById('km-eta'); if (eta) eta.textContent = '· Ankunft in ' + kmCountdown(rem);
        const s = Date.parse(trip.startAt), e = Date.parse(trip.arriveAt);
        const bar = document.getElementById('km-progress'); if (bar && e > s) bar.style.width = Math.max(0, Math.min(100, (Date.now()-s)/(e-s)*100)) + '%';
        if (rem <= 0) { kmCheckArrival(_kmMember).then(ok => { if (ok) kmRender(); }); return; }
      }
    }
    _kmRaf = requestAnimationFrame(step);
  };
  _kmRaf = requestAnimationFrame(step);
}
