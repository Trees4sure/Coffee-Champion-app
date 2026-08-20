// ═══════════════════════════════════════════════════════════════════════════
// weltraum_aufgaben.js — 🎯 Auftragskarten für das Weltall („Zug um Zug")
// NACH weltraum_stats.js laden (nutzt wrLive/wrStatsOf/wrRegionsOf von dort).
//
// Jeder Spieler hält drei offene Karten: kurzfristige (Tage) und langfristige
// (Wochen) Ziele. Sie sind persönlich und deterministisch gezogen — zwei Spieler
// bekommen unterschiedliche Karten, aber niemand kann würfeln, bis ihm eine passt.
//
// ⚠️ AUTORITÄTS-REGEL (Kopf von weltraum.js): Der Server rechnet Reisen, Kampf,
// Beute und Erträge. Diese Datei rechnet NICHTS davon nach:
//   • Der Fortschritt wird aus VORHANDENEN Daten ausgezählt (space_planets,
//     members.space, map_data.wrStats) — dadurch kann er nicht verloren gehen
//     und ein Neuladen der Seite ändert ihn nicht.
//   • Belohnt wird in CC über die bestehende RPC add_coins.
//   • Belohnungen in Schiffen/Rohstoffen brauchen eine eigene RPC und sind
//     bewusst NICHT enthalten (siehe PLAN_weltraum_ausbau.md, Teil B.3).
//
// ⚠️ Regel 4 (Statistik-Vollständigkeit): Jede CC-Gutschrift landet im Tages-Log
// (cat 'weltraum'), sonst wäre sie im Profil unsichtbar.
// ⚠️ Regel 3: Nichts hier darf die App kippen — alles in try/catch.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
'use strict';

if (typeof WR_TABS === 'undefined' || typeof DB === 'undefined') {
  console.warn('[wr-tasks] weltraum.js/db.js fehlen — Aufgaben-Modul inaktiv.');
  return;
}
if (typeof window.wrLive !== 'function' || typeof window.wrStatsOf !== 'function') {
  console.warn('[wr-tasks] weltraum_stats.js muss VOR dieser Datei geladen werden.');
  return;
}

// ⚠️ 27p: Rohstoff-Icons in den Auftragskarten (JP 2026-08-20: „die plasmoid assets und
// erz sowie kristall assets sollst du verwenden").
// `WRT_TASKS` ist eine Modul-Konstante und wird beim LADEN ausgewertet — `wrIc` muss zu
// diesem Zeitpunkt schon dastehen. Tut es: index.html laedt weltraum.js VOR dieser Datei
// (Zeile 364 vs. 366), und `wrIc` ist dort eine Funktions-Deklaration.
// Der typeof-Guard faengt trotzdem ab, falls die Reihenfolge je kippt — dann steht das
// Emoji da, statt dass die ganze Auftragsliste beim Laden wegbricht (Regel 3).
//
// ⚠️ Zielcontainer geprueft, nicht angenommen: `.wrt-ic` ist flex mit align-items:center
// (kein stretch) und `.wrt-done-row` hat KEINEN span-Elementselektor. Die
// „leere Kreise"-Falle vom 2026-07-21 (`.wr-lb-stats span` traf jede Icon-Huelle)
// greift hier also nicht.
function _wrtIc(key, fb) {
  try { return (typeof wrIc === 'function') ? wrIc(key) : fb; } catch (e) { return fb; }
}

const WRT_SLOTS = 3;          // gleichzeitig offene Karten
const WRT_DONE_KEEP = 40;     // erfüllte Aufträge im Archiv

function _e(s) { return (typeof _wrEsc === 'function') ? _wrEsc(s) : String(s == null ? '' : s); }
function _f(n) { return (typeof wrFmt === 'function') ? wrFmt(n) : Math.round(n || 0).toLocaleString('de-DE'); }
function wrtPlanets() { return (typeof _wrGalaxy !== 'undefined' && _wrGalaxy?.planets) || []; }
function wrtToday() { return new Date().toISOString().slice(0, 10); }

// ── Kontext: alles, was eine Aufgabe zum Messen braucht ────────────────────
// Einmal pro Render gebaut und durchgereicht — nicht je Karte neu ausgezählt.
function wrtCtx(u) {
  const live = window.wrLive(u) || {};
  const st   = window.wrStatsOf(u) || {};
  const sp   = u?.space || {};
  const ships = sp.fleets?.home?.ships || {};
  let maxColLevel = 0, colTurrets = 0, ringColonies = 0;
  try {
    for (const p of wrtPlanets()) {
      if (!p || p.colonized_by !== u.id) continue;
      const lv = (typeof wrColonyLevel === 'function') ? wrColonyLevel(p) : 1;
      maxColLevel = Math.max(maxColLevel, lv);
      colTurrets += Object.values(p.turrets || {}).filter(s => s && s.type).length;
      if ((parseInt(p.ring, 10) || 0) >= 2) ringColonies++;
    }
  } catch (e) {}
  // Grösster vollständig erforschter Ast (für „erforsche einen Ast komplett")
  let astComplete = 0;
  try {
    if (typeof SPACE_TECH_ASTE !== 'undefined' && typeof SPACE_TECH !== 'undefined') {
      const own = sp.tech || {};
      for (const a of SPACE_TECH_ASTE) {
        const list = SPACE_TECH.filter(t => t.ast === a.key);
        if (list.length && list.every(t => own[t.key])) astComplete++;
      }
    }
  } catch (e) {}
  return { u, live, st, sp, ships, maxColLevel, colTurrets, ringColonies, astComplete };
}

// ── 📜 Auftragskatalog ─────────────────────────────────────────────────────
// `cum: true`  → kumulative Leistung. Beim Ziehen wird der aktuelle Stand als
//                Basis gemerkt; gezählt wird nur, was DANACH passiert
//                („befreie 3 Planeten", nicht „besitze 3").
// `cum: false` → Zustandsziel, gilt auch mit Altbestand („besitze 5 Kolonien").
// `min`        → Eignung: erst anbieten, wenn es überhaupt erreichbar ist.
//                Damit zieht ein Einsteiger keine Ring-3-Karte.
const WRT_TASKS = [
  // ── Kurzfristig (Tage) ──
  { id:'k_frei3',   kind:'kurz', icon:'⚔️', title:'Vorstoß',            text:'Befreie 3 Planeten von ihren Wächtern.',
    goal:3,    reward:600,  cum:true,  m:(c)=>c.live.freed },
  { id:'k_siege5',  kind:'kurz', icon:'🎖️', title:'Feuertaufe',         text:'Gewinne 5 Gefechte gegen Wächter.',
    goal:5,    reward:700,  cum:true,  m:(c)=>c.st.battlesWon },
  { id:'k_scout3',  kind:'kurz', icon:'🛰️', title:'Kartograf',          text:'Kläre 3 Quadranten für den Clan auf.',
    goal:3,    reward:650,  cum:true,  m:(c)=>c.st.quadrantsScouted },
  { id:'k_bau20',   kind:'kurz', icon:'🏗️', title:'Serienfertigung',    text:'Baue 20 Schiffe in der Werft.',
    goal:20,   reward:600,  cum:true,  m:(c)=>c.st.shipsBuilt },
  { id:'k_erz600',  kind:'kurz', icon:_wrtIc('erz', '🪨'), title:'Erzlieferung',       text:'Fördere und erbeute 600 Erz.',
    goal:600,  reward:550,  cum:true,  m:(c)=>c.st.minedErz + c.st.lootErz },
  { id:'k_kri150',  kind:'kurz', icon:_wrtIc('kri', '💎'), title:'Kristallschicht',    text:'Fördere und erbeute 150 Koffeinkristall.',
    goal:150,  reward:700,  cum:true,  m:(c)=>c.st.minedKri + c.st.lootKri },
  { id:'k_ring2',   kind:'kurz', icon:'🚀', title:'Aufbruch nach außen',text:'Befreie einen Planeten im zweiten Ring.',
    goal:2,    reward:900,  cum:false, m:(c)=>c.live.maxRing },
  { id:'k_tech3',   kind:'kurz', icon:'🔬', title:'Forschungsschub',    text:'Erforsche 3 neue Weltraum-Techniken.',
    goal:3,    reward:800,  cum:true,  m:(c)=>c.live.tech },
  { id:'k_welle',   kind:'kurz', icon:'🛡️', title:'Hafenwache',         text:'Wehre eine Angriffswelle auf deinen Raumhafen ab.',
    goal:1,    reward:800,  cum:true,  m:(c)=>c.st.wavesWon },
  { id:'k_geschuetz',kind:'kurz',icon:'🔩', title:'Flankendeckung',     text:'Bring die Feuerkraft deines Raumhafens auf 500.',
    goal:500,  reward:750,  cum:false, m:(c)=>c.live.turret },
  { id:'k_route2',  kind:'kurz', icon:'🛰️', title:'Versorgungslinie',   text:'Halte 2 Dauerernte- oder Bergungsrouten gleichzeitig.',
    goal:2,    reward:500,  cum:false, m:(c)=>c.live.routes },
  { id:'k_hilfe',   kind:'kurz', icon:'🤝', title:'Waffenhilfe',        text:'Schick einem Clan-Mitglied Verstärkung gegen eine Welle.',
    goal:1,    reward:900,  cum:true,  m:(c)=>c.st.helpSent },

  // ── Langfristig (Wochen) ──
  { id:'l_kol5',    kind:'lang', icon:'🪐', title:'Siedlungswelle',     text:'Besitze 5 Kolonien gleichzeitig.',
    goal:5,    reward:3500,  cum:false, m:(c)=>c.live.colonies },
  { id:'l_kol10',   kind:'lang', icon:'🌇', title:'Kolonialmacht',      text:'Besitze 10 Kolonien gleichzeitig.',
    goal:10,   reward:7000,  cum:false, m:(c)=>c.live.colonies, min:(c)=>c.live.colonies >= 3 },
  { id:'l_kol3lvl', kind:'lang', icon:'🏙️', title:'Metropolbau',        text:'Bring eine Kolonie auf Ausbaustufe 3.',
    goal:3,    reward:4000,  cum:false, m:(c)=>c.maxColLevel, min:(c)=>c.live.colonies >= 1 },
  { id:'l_region1', kind:'lang', icon:'🗺️', title:'Landnahme',          text:'Kontrolliere eine Region der Galaxie.',
    goal:1,    reward:5000,  cum:false, m:(c)=>c.live.regions, min:(c)=>c.live.colonies >= 2 },
  { id:'l_region3', kind:'lang', icon:'🌌', title:'Sektorenherrschaft', text:'Kontrolliere drei Regionen gleichzeitig.',
    goal:3,    reward:12000, cum:false, m:(c)=>c.live.regions, min:(c)=>c.live.regions >= 1 },
  { id:'l_ring3',   kind:'lang', icon:'🌠', title:'Grenzgang',          text:'Befreie einen Planeten im äußersten Ring.',
    goal:3,    reward:4500,  cum:false, m:(c)=>c.live.maxRing, min:(c)=>c.live.maxRing >= 2 },
  { id:'l_station', kind:'lang', icon:'📡', title:'Quadranten-Kommando',text:'Errichte eine Quadranten-Station.',
    goal:1,    reward:8000,  cum:false, m:(c)=>c.live.stations, min:(c)=>c.maxColLevel >= 1 },
  { id:'l_flotte',  kind:'lang', icon:'💫', title:'Armada',             text:'Stell eine Heimatflotte mit 3.000 Kampfkraft auf.',
    goal:3000, reward:5500,  cum:false, m:(c)=>c.live.power },
  { id:'l_mutter',  kind:'lang', icon:'🛸', title:'Flaggschiff',        text:'Stell ein Mutterschiff in Dienst.',
    goal:1,    reward:9000,  cum:false, m:(c)=>parseInt(c.ships.mutterschiff, 10) || 0,
    min:(c)=>c.live.power >= 800 },
  { id:'l_ast',     kind:'lang', icon:'🔬', title:'Fachrichtung',       text:'Erforsche einen Technik-Ast vollständig.',
    goal:1,    reward:9000,  cum:false, m:(c)=>c.astComplete, min:(c)=>c.live.tech >= 4 },
  { id:'l_foes',    kind:'lang', icon:'💀', title:'Wächterjagd',        text:'Besiege insgesamt 5.000 Wächterstärke.',
    goal:5000, reward:6000,  cum:true,  m:(c)=>c.st.foesDefeated },
  { id:'l_colguns', kind:'lang', icon:'🛡️', title:'Festungswelten',     text:'Baue 5 Geschütze auf deinen Kolonien.',
    goal:5,    reward:6500,  cum:false, m:(c)=>c.colTurrets, min:(c)=>c.live.colonies >= 2 },
  { id:'l_ringkol', kind:'lang', icon:_wrtIc('pla', '🟣'), title:'Tiefe Vorposten',    text:'Halte 3 Kolonien jenseits des ersten Rings.',
    goal:3,    reward:7500,  cum:false, m:(c)=>c.ringColonies, min:(c)=>c.live.maxRing >= 2 },
  { id:'l_hafen',   kind:'lang', icon:'🛰️', title:'Vollausbau',         text:'Bring deinen Raumhafen auf Stufe 3.',
    goal:3,    reward:4000,  cum:false, m:(c)=>c.live.port },
];
const WRT_BY_ID = WRT_TASKS.reduce((m, t) => (m[t.id] = t, m), {});

// ── Ablage in map_data.wrTasks ─────────────────────────────────────────────
const WRT_LEER = { v: 1, seq: 0, active: [], done: [], swapDay: null, intro: false };
function wrtOf(u) {
  const t = u?.map_data?.wrTasks;
  const o = (t && typeof t === 'object') ? Object.assign({}, WRT_LEER, t) : Object.assign({}, WRT_LEER);
  // ⚠️ Flache Kopien: sonst zeigen active/done auf die Arrays IN WRT_LEER und die
  // erste Mutation vergiftet die Vorlage für alle anderen Spieler (dieselbe Falle
  // wie bei lostByType in der Statistik).
  o.active = Array.isArray(o.active) ? o.active.slice() : [];
  o.done   = Array.isArray(o.done)   ? o.done.slice()   : [];
  return o;
}

// Deterministischer Zufall aus Mitglieds-ID + Zählerstand — dieselbe Mulberry32-
// Familie wie in karte.js/weltraum.js. Persistiert wird die gezogene Karte
// ohnehin; der Seed sorgt nur dafür, dass zwei Spieler nicht dasselbe ziehen.
function wrtHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wrtPrng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Eine Karte ziehen. `avoid` = Schlüssel, die gerade offen sind oder kürzlich
// erfüllt wurden. Bevorzugt wird die Sorte, die im Slot fehlt (2× kurz, 1× lang),
// damit nicht drei Wochenziele gleichzeitig liegen.
function wrtDraw(ctx, tasks, wantKind, seedExtra) {
  const offen = new Set(tasks.active.map(a => a.tpl));
  const letzte = new Set(tasks.done.slice(-6).map(d => d.tpl));
  const passt = (t) => {
    if (offen.has(t.id)) return false;
    if (letzte.has(t.id)) return false;
    if (typeof t.min === 'function') { try { if (!t.min(ctx)) return false; } catch (e) { return false; } }
    // Zustandsziele, die schon erfüllt sind, wären ein Geschenk — nicht anbieten.
    if (!t.cum) { try { if ((t.m(ctx) || 0) >= t.goal) return false; } catch (e) { return false; } }
    return true;
  };
  let pool = WRT_TASKS.filter(t => t.kind === wantKind && passt(t));
  if (!pool.length) pool = WRT_TASKS.filter(t => passt(t));          // Sorte notfalls egal
  if (!pool.length) pool = WRT_TASKS.filter(t => !offen.has(t.id));  // notfalls Wiederholung
  if (!pool.length) return null;
  const rnd = wrtPrng(wrtHash((ctx.u?.id || 'x') + ':' + (tasks.seq || 0) + ':' + (seedExtra || '')));
  const t = pool[Math.floor(rnd() * pool.length)];
  const card = { id: 'a' + Date.now().toString(36) + Math.floor(rnd() * 1000).toString(36),
                 tpl: t.id, at: new Date().toISOString() };
  if (t.cum) { try { card.base = Math.round(t.m(ctx) || 0); } catch (e) { card.base = 0; } }
  return card;
}

// Slots auffüllen — 2× kurz, 1× lang. Verändert `tasks` in place, gibt zurück,
// ob sich etwas geändert hat (nur dann wird geschrieben).
function wrtFill(ctx, tasks) {
  let changed = false;
  let guard = 0;
  while (tasks.active.length < WRT_SLOTS && guard++ < 10) {
    const langOffen = tasks.active.filter(a => WRT_BY_ID[a.tpl]?.kind === 'lang').length;
    const kind = langOffen < 1 ? 'lang' : 'kurz';
    tasks.seq = (tasks.seq || 0) + 1;
    const card = wrtDraw(ctx, tasks, kind, 's' + tasks.active.length);
    if (!card) break;
    tasks.active.push(card);
    changed = true;
  }
  // Verwaiste Karten (Katalog-Eintrag entfernt) still aussortieren, statt eine
  // leere Kachel zu rendern.
  const vor = tasks.active.length;
  tasks.active = tasks.active.filter(a => a && WRT_BY_ID[a.tpl]);
  if (tasks.active.length !== vor) changed = true;
  return changed;
}

function wrtProgress(ctx, card) {
  const t = WRT_BY_ID[card?.tpl];
  if (!t) return { now: 0, goal: 1, pct: 0, done: false, t: null };
  let now = 0;
  try { now = Math.round(t.m(ctx) || 0); } catch (e) { now = 0; }
  if (t.cum) now = Math.max(0, now - (parseInt(card.base, 10) || 0));
  const goal = t.goal || 1;
  return { now: Math.min(now, goal), raw: now, goal, pct: Math.min(100, Math.round(now / goal * 100)),
           done: now >= goal, t };
}

// ── Schreiben ──────────────────────────────────────────────────────────────
// Immer FRISCH lesen und nur wrTasks mergen (Muster appendTodayLogFresh) — ein
// Aufgaben-Write darf niemals Tages-Log, salaryHistory oder wrStats clobbern.
async function wrtSave(tasks) {
  const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
  if (!me?.id) return false;
  let md = {};
  try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
  const next = Object.assign({}, md || {}, { wrTasks: tasks });
  await DB.updateMapData(me.id, next);
  try {
    me.map_data = next;
    if (typeof appData !== 'undefined' && appData?.users) {
      const u = appData.users.find(x => x.id === me.id);
      if (u) u.map_data = next;
    }
    if (typeof _wrMember !== 'undefined' && _wrMember && _wrMember.id === me.id) _wrMember.map_data = next;
  } catch (e) {}
  return true;
}

let _wrtBusy = false;

// Auftrag einlösen.
// ⚠️ REIHENFOLGE IST ABSICHT: erst den Abschluss SCHREIBEN, dann die CC buchen.
// Bricht der Schreibvorgang ab, ist die Aufgabe lieber zweimal offen als zweimal
// bezahlt. Umgekehrt wäre jeder Netzfehler eine Geldmaschine.
async function wrtClaim(cardId) {
  if (_wrtBusy) return;
  _wrtBusy = true;
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    let md = {};
    try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
    const tasks = wrtOf({ map_data: md });
    const card = tasks.active.find(a => a && a.id === cardId);
    if (!card) { wrtToast('Dieser Auftrag ist nicht mehr offen.', 'info'); return; }
    if (tasks.done.some(d => d && d.id === cardId)) { wrtToast('Schon eingelöst.', 'info'); return; }
    const ctx = wrtCtx(Object.assign({}, me, { map_data: md }));
    const p = wrtProgress(ctx, card);
    if (!p.done) { wrtToast('Der Auftrag ist noch nicht erfüllt.', 'info'); return; }

    const reward = Math.max(0, Math.round(p.t.reward || 0));
    tasks.active = tasks.active.filter(a => a.id !== cardId);
    tasks.done.push({ id: card.id, tpl: card.tpl, at: new Date().toISOString(), reward });
    if (tasks.done.length > WRT_DONE_KEEP) tasks.done = tasks.done.slice(-WRT_DONE_KEEP);
    wrtFill(ctx, tasks);                       // Slot sofort nachziehen
    const next = Object.assign({}, md || {}, { wrTasks: tasks });
    await DB.updateMapData(me.id, next);       // ① Abschluss ist verbucht
    try {
      me.map_data = next;
      if (typeof appData !== 'undefined' && appData?.users) {
        const u = appData.users.find(x => x.id === me.id);
        if (u) u.map_data = next;
      }
      if (typeof _wrMember !== 'undefined' && _wrMember && _wrMember.id === me.id) _wrMember.map_data = next;
    } catch (e) {}

    if (reward > 0) {
      await DB.addCoins(me.id, reward);        // ② erst jetzt das Geld
      try { me.coins = (parseFloat(me.coins) || 0) + reward; } catch (e) {}
      try { if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: me.coins }); } catch (e) {}
      // Regel 4: ohne diesen Eintrag wäre die Belohnung im Profil unsichtbar.
      try {
        await DB.appendTodayLogFresh(me.id, [{
          label: '🎯 Weltraum-Auftrag: ' + p.t.title, amount: reward, cat: 'weltraum',
          detail: p.t.text, aggKey: 'space_task', aggBase: '🎯 Weltraum-Aufträge' }]);
      } catch (e) {}
    }
    wrtToast(`🎯 Auftrag „${p.t.title}" erfüllt — +${_f(reward)} CC`, 'success');
    // Der Clan soll es sehen: erfüllte Aufträge sind der soziale Motor des Features.
    try {
      if (typeof wrChat === 'function') {
        wrChat(`🎯 ${_e(me.name || 'Jemand')} hat den Auftrag „${_e(p.t.title)}" erfüllt `
             + `(${_e(p.t.text)}) — +${_f(reward)} CC.`);
      }
    } catch (e) {}
    try { await wrtCheckAchievements(tasks); } catch (e) {}
    if (typeof window.wrRender === 'function') window.wrRender();
  } catch (e) {
    wrtToast('Einlösen fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrtBusy = false; }
}

// Eine Karte tauschen — einmal pro Tag, ohne Kosten. Das ist das Zug-um-Zug-
// Gefühl: man darf eine Karte ablegen, aber nicht sortieren, bis sie passt.
async function wrtSwap(cardId) {
  if (_wrtBusy) return;
  _wrtBusy = true;
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    let md = {};
    try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
    const tasks = wrtOf({ map_data: md });
    const day = wrtToday();
    if (tasks.swapDay === day) { wrtToast('Heute hast du schon getauscht — morgen wieder.', 'info'); return; }
    const card = tasks.active.find(a => a && a.id === cardId);
    if (!card) { wrtToast('Diese Karte liegt nicht mehr.', 'info'); return; }
    const alt = WRT_BY_ID[card.tpl];
    const ctx = wrtCtx(Object.assign({}, me, { map_data: md }));
    tasks.active = tasks.active.filter(a => a.id !== cardId);
    tasks.seq = (tasks.seq || 0) + 1;
    const neu = wrtDraw(ctx, tasks, alt?.kind || 'kurz', 'swap');
    if (!neu) { wrtToast('Gerade ist keine andere Karte verfügbar.', 'info'); return; }
    tasks.active.push(neu);
    tasks.swapDay = day;
    await wrtSave(tasks);
    wrtToast(`🔄 Getauscht: „${WRT_BY_ID[neu.tpl]?.title || '?'}"`, 'success');
    if (typeof window.wrRender === 'function') window.wrRender();
  } catch (e) {
    wrtToast('Tauschen fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrtBusy = false; }
}

function wrtToast(msg, kind) {
  if (typeof showToast === 'function') { try { showToast(msg, kind || 'info'); return; } catch (e) {} }
  console.log('[wr-tasks]', msg);
}

// ── 🏆 Erfolge ─────────────────────────────────────────────────────────────
const WRT_ACHIEVEMENTS = [
  { id:'space_task_first', icon:'🎯', name:'Auftragsnehmer',  desc:'Ersten Weltraum-Auftrag erfüllt',   condition:null, coinReward:200  },
  { id:'space_task_10',    icon:'📋', name:'Auftragsprofi',   desc:'10 Weltraum-Aufträge erfüllt',      condition:null, coinReward:800  },
  { id:'space_task_25',    icon:'🎖️', name:'Auftragslegende', desc:'25 Weltraum-Aufträge erfüllt',      condition:null, coinReward:2500 },
];
try {
  if (typeof ACHIEVEMENTS !== 'undefined' && Array.isArray(ACHIEVEMENTS)) {
    for (const a of WRT_ACHIEVEMENTS) if (!ACHIEVEMENTS.some(x => x.id === a.id)) ACHIEVEMENTS.push(a);
  }
} catch (e) { console.warn('[wr-tasks] Achievements:', e.message); }

async function wrtCheckAchievements(tasks) {
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    const ex = me.achievements || {};
    const n = (tasks || wrtOf(me)).done.length;
    const g = {};
    if (!ex.space_task_first && n >= 1)  g.space_task_first = true;
    if (!ex.space_task_10    && n >= 10) g.space_task_10 = true;
    if (!ex.space_task_25    && n >= 25) g.space_task_25 = true;
    const keys = Object.keys(g);
    if (!keys.length) return;
    await DB.grantAchievements(me.id, g);
    try {
      if (typeof currentUserData !== 'undefined' && currentUserData) {
        currentUserData = Object.assign({}, currentUserData, { achievements: Object.assign({}, ex, g) });
      }
    } catch (e) {}
    for (const k of keys) {
      const a = WRT_ACHIEVEMENTS.find(x => x.id === k);
      if (a) wrtToast(`🏆 Achievement: ${a.name}! (+${a.coinReward} CC)`, 'success');
    }
  } catch (e) { console.warn('[wr-tasks] Achievement-Prüfung:', e.message); }
}

// ── 🎨 Styles ──────────────────────────────────────────────────────────────
(function css() {
  try {
    if (document.getElementById('wr-tasks-css')) return;
    const s = document.createElement('style');
    s.id = 'wr-tasks-css';
    s.textContent = `
.wrt-card { display: grid; grid-template-columns: 44px 1fr; gap: 10px; padding: 10px;
  margin-bottom: 9px; border-radius: 10px; background: #0d1430; border: 1px solid #24305a; }
.wrt-card.wrt-ready { border-color: #7ad48a; background: linear-gradient(150deg, #14301f, #0d1428); }
.wrt-card.wrt-lang { border-left: 3px solid #d4aa37; }
.wrt-ic { width: 44px; height: 44px; border-radius: 9px; display: flex; align-items: center;
  justify-content: center; font-size: 1.5rem; background: #101733; border: 1px solid #2a3660; }
.wrt-body { min-width: 0; }
.wrt-head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.wrt-title { font-size: .86rem; font-weight: 700; color: #dce6ff; }
.wrt-kind { font-size: .62rem; text-transform: uppercase; letter-spacing: .05em;
  padding: 1px 6px; border-radius: 999px; background: #1b2547; color: #8b9ac4; }
.wrt-kind-lang { background: rgba(212,170,55,.16); color: #ffd15c; }
.wrt-text { font-size: .76rem; color: #a8b6dc; line-height: 1.4; margin: 3px 0 6px; }
.wrt-bar { height: 8px; border-radius: 4px; overflow: hidden; background: #1a2344;
  border: 1px solid #24305a; }
.wrt-bar-fill { height: 100%; background: linear-gradient(90deg, #4d7fd4, #7ad48a);
  transition: width .3s ease; }
.wrt-ready .wrt-bar-fill { background: #7ad48a; }
.wrt-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  flex-wrap: wrap; margin-top: 5px; font-size: .74rem; color: #8b9ac4; }
.wrt-meta strong { color: #dce6ff; font-variant-numeric: tabular-nums; }
.wrt-reward { color: #ffd15c; font-weight: 700; white-space: nowrap; }
.wrt-act { display: flex; gap: 6px; margin-top: 7px; flex-wrap: wrap; }
.wrt-done-list { display: flex; flex-direction: column; gap: 4px; max-height: 210px; overflow-y: auto; }
.wrt-done-row { display: flex; align-items: center; gap: 8px; font-size: .74rem; color: #a8b6dc;
  padding: 5px 8px; border-radius: 7px; background: #0f1526; border: 1px solid #1e2947; }
.wrt-done-row .wrt-reward { margin-left: auto; }
.wrt-empty { font-size: .76rem; color: #7f8fbb; padding: 8px 0; }
`;
    document.head.appendChild(s);
  } catch (e) {}
})();

// ── 🎯 Der Aufgaben-Tab ────────────────────────────────────────────────────
// ⚠️ NICHT das Symbol 📜 verwenden — das trägt in weltraum.js schon der
// Protokoll-Tab. Zwei gleiche Symbole in einer Leiste sind auf dem Handy, wo nur
// die Symbole sichtbar sind (@430px greift .wr-tab-l { display:none }), nicht
// unterscheidbar.
if (!WR_TABS.some(t => t.key === 'aufgaben')) {
  const i = WR_TABS.findIndex(t => t.key === 'log');
  const tab = { key: 'aufgaben', icon: '🎯', name: 'Aufgaben' };
  if (i >= 0) WR_TABS.splice(i, 0, tab); else WR_TABS.push(tab);
}

function wrtPanelHtml() {
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me) return '';
    const ctx = wrtCtx(me);
    const tasks = wrtOf(me);
    // Beim ersten Öffnen (oder nach einem erfüllten Auftrag) fehlen Karten —
    // still nachziehen und einmalig speichern.
    if (wrtFill(ctx, tasks)) {
      wrtSave(tasks).then(() => { if (typeof window.wrRender === 'function') window.wrRender(); })
                    .catch(() => {});
    }
    const day = wrtToday();
    const swapFrei = tasks.swapDay !== day;

    const karten = tasks.active.map(card => {
      const p = wrtProgress(ctx, card);
      if (!p.t) return '';
      const lang = p.t.kind === 'lang';
      return `
        <div class="wrt-card${p.done ? ' wrt-ready' : ''}${lang ? ' wrt-lang' : ''}">
          <div class="wrt-ic">${p.t.icon}</div>
          <div class="wrt-body">
            <div class="wrt-head">
              <span class="wrt-title">${_e(p.t.title)}</span>
              <span class="wrt-kind${lang ? ' wrt-kind-lang' : ''}">${lang ? 'langfristig' : 'kurzfristig'}</span>
            </div>
            <div class="wrt-text">${_e(p.t.text)}</div>
            <div class="wrt-bar"><div class="wrt-bar-fill" style="width:${p.pct}%"></div></div>
            <div class="wrt-meta">
              <span>Fortschritt: <strong>${_f(p.now)} / ${_f(p.goal)}</strong> (${p.pct} %)</span>
              <span class="wrt-reward">+${_f(p.t.reward)} CC</span>
            </div>
            <div class="wrt-act">
              ${p.done
                ? `<button class="wr-btn wr-btn-sm wr-btn-go" data-wrt-claim="${_e(card.id)}"
                     style="width:auto">✅ Auftrag abschließen</button>`
                : `<button class="wr-btn wr-btn-sm" data-wrt-swap="${_e(card.id)}" ${swapFrei ? '' : 'disabled'}
                     >🔄 Tauschen${swapFrei ? '' : ' <span class="wr-btn-sub">heute schon getauscht</span>'}</button>`}
            </div>
          </div>
        </div>`;
    }).join('');

    const erledigt = tasks.done.slice().reverse().slice(0, 12).map(d => {
      const t = WRT_BY_ID[d.tpl];
      let wann = '';
      try {
        wann = new Date(d.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      } catch (e) {}
      return `<div class="wrt-done-row"><span>${t?.icon || '✅'}</span>
        <span>${_e(t?.title || d.tpl)}</span>
        <span class="wr-sub">${wann}</span>
        <span class="wrt-reward">+${_f(d.reward)}</span></div>`;
    }).join('');

    const summe = tasks.done.reduce((a, d) => a + (parseFloat(d.reward) || 0), 0);

    return `
      <div class="wr-card">
        <div class="wr-card-title">🎯 Deine Aufträge
          <span class="wr-sub">— ${tasks.active.length} von ${WRT_SLOTS} offen · ${tasks.done.length} erfüllt</span></div>
        ${karten || '<div class="wrt-empty">Karten werden gezogen …</div>'}
        <div class="wr-sub" style="margin-top:6px">Der Fortschritt wird aus deinem echten Stand
          gemessen — er kann nicht verloren gehen. Eine Karte darfst du <strong>einmal am Tag</strong>
          tauschen; nachgezogen wird erst, wenn ein Auftrag erfüllt ist. Deine Karten sind persönlich:
          jeder im Clan hat andere.</div>
      </div>
      ${tasks.done.length ? `
        <div class="wr-card">
          <div class="wr-card-title">✅ Erfüllte Aufträge
            <span class="wr-sub">— ${_f(summe)} CC insgesamt</span></div>
          <div class="wrt-done-list">${erledigt}</div>
        </div>` : ''}`;
  } catch (e) {
    console.warn('[wr-tasks] Panel:', e.message);
    return `<div class="wr-card"><div class="wr-card-title">🎯 Aufgaben</div>
      <div class="wr-sub">Die Aufträge konnten gerade nicht geladen werden.</div></div>`;
  }
}

// ── 🔧 Einhängen ───────────────────────────────────────────────────────────
// Gleiches Muster wie weltraum_stats.js: wrRender baut _wrEl neu auf, kennt den
// Tab nicht und blendet bei unbekanntem Tab alle bestehenden Panels aus; danach
// hängen wir unseres an. weltraum.js bleibt unangetastet.
(function patchRender() {
  const orig = window.wrRender;
  if (typeof orig !== 'function') { console.warn('[wr-tasks] wrRender nicht gefunden.'); return; }
  window.wrRender = function () {
    orig.apply(this, arguments);
    try {
      if (typeof _wrTab === 'undefined' || _wrTab !== 'aufgaben') return;
      const wrap = document.querySelector('#imp-content .wr-wrap') || document.querySelector('.wr-wrap');
      if (!wrap) return;
      const box = document.createElement('div');
      box.id = 'wr-tasks-panel';
      box.innerHTML = wrtPanelHtml();
      wrap.appendChild(box);
      box.addEventListener('click', (e) => {
        const c = e.target.closest('[data-wrt-claim]');
        if (c && !c.disabled) { wrtClaim(c.dataset.wrtClaim); return; }
        const s = e.target.closest('[data-wrt-swap]');
        if (s && !s.disabled) { wrtSwap(s.dataset.wrtSwap); return; }
      });
    } catch (e) { console.warn('[wr-tasks] Render-Patch:', e.message); }
  };
})();

// ── 📣 Ankündigung beim ersten Öffnen (Projekt-Regel 3) ────────────────────
// Grössere Neuerungen brauchen ein Popup beim ersten Login. Die Datei kann
// WHATS_NEW_ITEMS in app.js nicht ergänzen (fremde Datei), deshalb ein eigenes,
// einmaliges Popup im etablierten Modal-Look (Muster wrCheckHelpPopup).
// Merker in map_data.wrTasks.intro — also serverseitig, nicht im localStorage:
// die Ankündigung soll auf jedem Gerät genau einmal kommen.
async function wrtIntro() {
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || null;
    if (!me?.id) return;
    if (wrtOf(me).intro) return;
    // Nicht über andere Modals legen (Quiz/Umfrage/What's-New/Kredit/Hilferuf).
    for (const id of ['quiz-modal', 'survey-modal', 'whats-new-modal', 'loan-modal', 'wr-help-modal']) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && el.innerHTML.trim()) return;
    }
    if (document.getElementById('wrt-intro')) return;
    const m = document.createElement('div');
    m.id = 'wrt-intro';
    m.innerHTML = `
      <div class="quiz-backdrop"></div>
      <div class="quiz-box"><div class="quiz-card" style="text-align:center">
        <div class="quiz-emoji">🎯</div>
        <h2>Neu im All: Auftragskarten</h2>
        <p style="font-size:.85rem;line-height:1.5;color:var(--muted);text-align:left">
          Im 🚀 Weltall-Tab liegt jetzt ein neuer Reiter <strong>🎯 Aufgaben</strong>. Du hältst
          dort <strong>drei Auftragskarten</strong> — zwei kurzfristige und eine langfristige, wie
          bei „Zug um Zug". Jede bringt CoffeeCoins, wenn du sie erfüllst.<br><br>
          Die Karten sind <strong>persönlich</strong>: jeder im Clan zieht andere, passend zu
          seinem Stand — Einsteiger bekommen keine Ring-3-Ziele. Der Fortschritt wird aus deinem
          echten Spielstand gemessen, du musst nichts abhaken und kannst nichts verlieren.
          Eine Karte darfst du <strong>einmal pro Tag tauschen</strong>; nachgezogen wird erst,
          wenn ein Auftrag erfüllt ist.<br><br>
          Neu ist außerdem die <strong>📊 Statistik</strong> mit Clan-Rangliste, den acht Regionen
          der Galaxie und Detaillisten samt Diagrammen zu Flotte, Geschützen, Forschung und
          Verlusten.
        </p>
        <button class="btn-primary quiz-cta" id="wrt-intro-ok">Aufträge ansehen</button>
      </div></div>`;
    document.body.appendChild(m);
    const schliessen = async () => {
      m.remove();
      try {
        let md = {};
        try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
        const tasks = wrtOf({ map_data: md });
        tasks.intro = true;
        await wrtSave(tasks);
      } catch (e) { /* im Zweifel kommt es nochmal — besser als nie */ }
    };
    m.querySelector('#wrt-intro-ok').onclick = schliessen;
  } catch (e) { console.warn('[wr-tasks] Intro:', e.message); }
}

// Beim Betreten des Weltall-Tabs anstossen — dort ist das Feature auch zu finden.
(function hookIntro() {
  const orig = window._buildWeltraum;
  if (typeof orig !== 'function') return;
  window._buildWeltraum = async function () {
    const r = await orig.apply(this, arguments);
    setTimeout(() => { wrtIntro(); }, 900);
    return r;
  };
})();

// Nach aussen sichtbar (Konsole/Folgebausteine)
window.WRT_TASKS   = WRT_TASKS;
window.wrtOf       = wrtOf;
window.wrtCtx      = wrtCtx;
window.wrtProgress = wrtProgress;
window.wrtClaim    = wrtClaim;

console.info('[wr-tasks] Auftragskarten aktiv — ' + WRT_TASKS.length + ' Vorlagen, '
  + WRT_SLOTS + ' Slots.');

})();
