// ═══════════════════════════════════════════════════════════════════════════
// weltraum_extras.js — 🚀 Startpaket · 🎖️ Hall of Fame · 👤 Profil ·
//                      📈 Score-Verlauf · 📅 Wochenbericht · ⏪ Backfill
// NACH weltraum_stats.js und weltraum_aufgaben.js laden.
//
// Das ist der Rest aus Teil A des Plans — alles, was OHNE SQL geht. Bewusst NICHT
// enthalten (braucht Teil B/Claude Code): Flug-, Bau- und Forschungszeiten,
// Koloniekosten, Regionsboni, Belohnungen in Schiffen/Rohstoffen, PvP.
// Die +15-%-Übernahmeregel ist auf JPs Wunsch vorerst ganz draussen.
//
// ⚠️ AUTORITÄTS-REGEL: gelesen wird nur, was der Server geschrieben hat;
// geschrieben wird ausschliesslich in map_data (save_map_data) und über add_coins.
// ⚠️ `DB.saveSpace` wird hier bewusst NICHT benutzt: der Server mutiert `space`
// laufend (Reisen, Raffinerie, Tankstände). Ein Client-Write nach Last-Write-Wins
// könnte eine fliegende Flotte oder eine laufende Charge still löschen.
// ⚠️ Regel 3: keine dieser Erweiterungen darf die App kippen — alles try/catch.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
'use strict';

if (typeof DB === 'undefined' || typeof window.wrLive !== 'function' || typeof window.wrScore !== 'function') {
  console.warn('[wr-extras] weltraum_stats.js muss VOR dieser Datei geladen werden.');
  return;
}

function _e(s) { return (typeof _wrEsc === 'function') ? _wrEsc(s) : String(s == null ? '' : s); }
function _f(n) { return (typeof wrFmt === 'function') ? wrFmt(n) : Math.round(n || 0).toLocaleString('de-DE'); }
function wrxUsers() {
  try { return (typeof appData !== 'undefined' && appData?.users) ? appData.users : []; }
  catch (e) { return []; }
}
function wrxMe() { return (typeof currentUserData !== 'undefined' && currentUserData) || null; }

// map_data frisch lesen, EIN Feld mergen, zurückschreiben. Dasselbe Muster wie
// appendTodayLogFresh — ein Write hier darf weder Tages-Log noch wrStats/wrTasks
// überschreiben.
async function wrxPatchMd(patch) {
  const me = wrxMe();
  if (!me?.id) return null;
  let md = {};
  try { md = await DB.fetchMemberMapData(me.id); } catch (e) { md = me.map_data || {}; }
  const next = Object.assign({}, md || {}, patch);
  await DB.updateMapData(me.id, next);
  try {
    me.map_data = next;
    const u = wrxUsers().find(x => x.id === me.id);
    if (u) u.map_data = next;
    if (typeof _wrMember !== 'undefined' && _wrMember && _wrMember.id === me.id) _wrMember.map_data = next;
  } catch (e) {}
  return next;
}

function wrxToast(msg, kind) {
  if (typeof showToast === 'function') { try { showToast(msg, kind || 'info'); return; } catch (e) {} }
  console.log('[wr-extras]', msg);
}

// ═══ 1. 🚀 Startpaket für Neueinsteiger ═══════════════════════════════════
// JPs Ausgangslage: er ist selbst Spitzenreiter, die anderen haben noch nicht
// angefangen. Ohne Starthilfe kriecht ein Neustarter bei null los, während Ring 2
// längst besetzt ist — das ist der sicherste Weg, dass er es gar nicht erst
// versucht.
//
// ⚠️ FAIRNESS: Der Bonus geht AUSSCHLIESSLICH an Spieler, die im All noch nichts
// erreicht haben, und wird NICHT rückwirkend gezahlt. Sonst finanziert der
// Führende sich selbst — das muss auch so im Popup stehen, nicht nur im Code.
const WRX_START_BASIS = 8000;    // Sockel, damit Sonde + Jäger + Fregatte drin sind
const WRX_START_PRO_PUNKT = 40;  // CC je Score-Punkt Rückstand auf den Besten
const WRX_START_MAX = 60000;

function wrxIstNeuling(u) {
  try {
    const live = window.wrLive(u) || {};
    const st = window.wrStatsOf(u) || {};
    // „Noch nichts erreicht": keine Kolonie, kein befreiter Planet, keine
    // nennenswerte Flotte und keine gewonnenen Gefechte.
    return (live.colonies || 0) === 0 && (live.freed || 0) === 0
        && (live.power || 0) < 400 && (st.battlesWon || 0) === 0;
  } catch (e) { return false; }
}

function wrxStartBetrag(u) {
  try {
    let best = 0;
    for (const x of wrxUsers()) {
      try { best = Math.max(best, window.wrScore(window.wrLive(x), window.wrStatsOf(x)) || 0); }
      catch (e) {}
    }
    const eigen = window.wrScore(window.wrLive(u), window.wrStatsOf(u)) || 0;
    const rueck = Math.max(0, best - eigen);
    return Math.min(WRX_START_MAX, Math.round(WRX_START_BASIS + rueck * WRX_START_PRO_PUNKT));
  } catch (e) { return WRX_START_BASIS; }
}

let _wrxStartBusy = false;
async function wrxStartpaket() {
  if (_wrxStartBusy) return;
  const me = wrxMe();
  if (!me?.id) return;
  if (me.map_data?.wrStarter) return;         // schon erhalten
  if (!wrxIstNeuling(me)) {
    // Bestandsspieler: Marker still setzen, damit die Prüfung nicht ewig läuft.
    try { await wrxPatchMd({ wrStarter: { at: new Date().toISOString(), amount: 0, reason: 'bestand' } }); }
    catch (e) {}
    return;
  }
  if (wrxModalOffen()) return;
  _wrxStartBusy = true;
  try {
    const betrag = wrxStartBetrag(me);
    // ⚠️ Erst den Marker schreiben, dann zahlen — dieselbe Regel wie bei den
    // Auftragskarten. Eine doppelte Auszahlung wäre der teurere Fehler.
    await wrxPatchMd({ wrStarter: { at: new Date().toISOString(), amount: betrag } });
    await DB.addCoins(me.id, betrag);
    try { me.coins = (parseFloat(me.coins) || 0) + betrag; } catch (e) {}
    try { if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: me.coins }); } catch (e) {}
    try {
      await DB.appendTodayLogFresh(me.id, [{
        label: '🚀 Startkapital Raumfahrtbehörde', amount: betrag, cat: 'weltraum',
        detail: 'Einmalige Starthilfe für den Weltraum-Einstieg' }]);
    } catch (e) {}
    try {
      if (typeof wrChat === 'function') {
        wrChat(`🚀 ${_e(me.name || 'Jemand')} startet ins All — die Kaffee-Raumfahrtbehörde `
             + `zahlt ${_f(betrag)} CC Starthilfe. Willkommen im Clan!`);
      }
    } catch (e) {}
    wrxStartPopup(betrag);
  } catch (e) {
    console.warn('[wr-extras] Startpaket:', e.message);
  } finally { _wrxStartBusy = false; }
}

function wrxModalOffen() {
  try {
    for (const id of ['quiz-modal', 'survey-modal', 'whats-new-modal', 'loan-modal',
                      'wr-help-modal', 'wrt-intro', 'wrx-start']) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && (el.innerHTML || '').trim()) return true;
    }
  } catch (e) {}
  return false;
}

function wrxStartPopup(betrag) {
  try {
    if (document.getElementById('wrx-start')) return;
    const m = document.createElement('div');
    m.id = 'wrx-start';
    m.innerHTML = `
      <div class="quiz-backdrop"></div>
      <div class="quiz-box"><div class="quiz-card" style="text-align:center">
        <div class="quiz-emoji">🚀</div>
        <h2>Startkapital der Raumfahrtbehörde</h2>
        <p style="font-size:.88rem;color:var(--gold);font-weight:700;margin:6px 0">
          +${_f(betrag)} CC</p>
        <p style="font-size:.84rem;line-height:1.5;color:var(--muted);text-align:left">
          Damit du nicht bei null anfängst, während andere schon Ring 2 halten:
          Die Behörde spendiert dir ein <strong>einmaliges Startkapital</strong> für deine
          erste Sonde, ein paar Jäger und den ersten Röstkometen.<br><br>
          Der Betrag richtet sich nach deinem <strong>Rückstand auf den Spitzenreiter</strong> —
          je weiter der vorn ist, desto mehr bekommst du. Wer im All schon etwas erreicht hat,
          bekommt <strong>nichts</strong>, auch nicht rückwirkend: die Starthilfe soll den
          Einstieg bezahlen, nicht den Vorsprung vergrössern.<br><br>
          Schau als Erstes in den 🎯 Aufgaben-Tab — die Karten dort führen dich Schritt für
          Schritt durch den Anfang.
        </p>
        <button class="btn-primary quiz-cta" id="wrx-start-ok">Auf geht's!</button>
      </div></div>`;
    document.body.appendChild(m);
    m.querySelector('#wrx-start-ok').onclick = () => m.remove();
  } catch (e) { wrxToast(`🚀 +${_f(betrag)} CC Startkapital für den Weltraum-Einstieg!`, 'success'); }
}

// ═══ 2. 📈 Score-Verlauf ═══════════════════════════════════════════════════
// Jeder Spieler schreibt AUSSCHLIESSLICH seine eigene Historie (map_data.wrScoreHist).
// ⚠️ Bewusst nicht wie recordSalarySnapshotsAll für alle Mitglieder mitschreiben:
// das wäre ein Fremd-Write auf map_data und damit ein Clobber-Risiko für Daten,
// die uns nicht gehören. Das Diagramm zeigt trotzdem alle — sobald jemand den
// Statistik-Tab öffnet, legt er seinen eigenen Punkt ab.
const WRX_BUCKET_MS = 6 * 60 * 60 * 1000;   // ein Punkt je 6 Stunden
const WRX_HIST_MAX = 240;

function wrxBucket(ts) { return Math.floor((ts || Date.now()) / WRX_BUCKET_MS) * WRX_BUCKET_MS; }

function wrxHistOf(u) {
  const h = u?.map_data?.wrScoreHist;
  return Array.isArray(h) ? h.filter(p => p && p.ts) : [];
}

let _wrxSnapBusy = false;
async function wrxSnapshot() {
  if (_wrxSnapBusy) return;
  const me = wrxMe();
  if (!me?.id) return;
  try {
    const bucket = wrxBucket();
    const hist = wrxHistOf(me).slice();
    if (hist.some(p => p.ts === bucket)) return;      // in diesem Fenster schon
    const live = window.wrLive(me), st = window.wrStatsOf(me);
    if (!live) return;
    // Ohne jede Weltraum-Aktivität keinen Punkt schreiben — sonst füllt sich die
    // Historie mit Nullen, bevor jemand überhaupt gestartet ist.
    if (!live.freed && !live.colonies && !live.power && !live.tech) return;
    _wrxSnapBusy = true;
    hist.push({ ts: bucket, score: window.wrScore(live, st), col: live.colonies,
                freed: live.freed, reg: live.regions, pow: live.power });
    hist.sort((a, b) => a.ts - b.ts);
    await wrxPatchMd({ wrScoreHist: hist.slice(-WRX_HIST_MAX) });
  } catch (e) { console.warn('[wr-extras] Snapshot:', e.message); }
  finally { _wrxSnapBusy = false; }
}

// ── Diagramm im Statistik-Tab ──
let _wrxChart = null;
function wrxDestroyChart() { try { if (_wrxChart) _wrxChart.destroy(); } catch (e) {} _wrxChart = null; }

function wrxVerlaufHtml() {
  const mit = wrxUsers().filter(u => wrxHistOf(u).length >= 2);
  if (!mit.length) {
    return `<div class="wr-card">
      <div class="wr-card-title">📈 Score-Verlauf</div>
      <div class="wr-sub">Der Verlauf baut sich ab jetzt alle 6 Stunden auf — schau in ein paar
        Tagen wieder rein. Er zeigt jeden, der den Statistik-Tab benutzt.</div></div>`;
  }
  return `<div class="wr-card">
      <div class="wr-card-title">📈 Score-Verlauf
        <span class="wr-sub">— ${mit.length} Spieler mit Historie</span></div>
      <div class="wrs-chartwrap" style="height:220px"><canvas id="wrx-c-score"></canvas></div>
      <div class="wrs-note">Jeder Punkt entsteht, wenn ein Spieler den Statistik-Tab öffnet
        (höchstens einer je 6 Stunden). Wer die App länger nicht benutzt, hat eine Lücke —
        die Linie wird dann einfach durchgezogen.</div>
    </div>`;
}

function wrxBuildChart() {
  try {
    wrxDestroyChart();
    const cv = document.getElementById('wrx-c-score');
    if (!cv || typeof Chart === 'undefined') return;
    const mit = wrxUsers().filter(u => wrxHistOf(u).length >= 2);
    if (!mit.length) return;
    const buckets = [...new Set(mit.flatMap(u => wrxHistOf(u).map(p => p.ts)))].sort((a, b) => a - b);
    const label = (ts) => {
      const d = new Date(ts);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
           + ' ' + String(d.getHours()).padStart(2, '0') + 'h';
    };
    const ds = mit.map(u => {
      const m = {};
      for (const p of wrxHistOf(u)) m[p.ts] = p.score;
      const col = (typeof wrMemberColor === 'function') ? wrMemberColor(u.id) : '#4d7fd4';
      return { label: u.name, data: buckets.map(b => (b in m ? m[b] : null)),
               spanGaps: true, borderColor: col, backgroundColor: col + '33',
               borderWidth: 2, tension: 0.25, pointRadius: 2, fill: false };
    });
    _wrxChart = new Chart(cv.getContext('2d'), {
      type: 'line', data: { labels: buckets.map(label), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#c3cfee', boxWidth: 11, font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: '#8b9ac4', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: '#1a2344' } },
          y: { beginAtZero: true, ticks: { color: '#8b9ac4', font: { size: 9 } }, grid: { color: '#1a2344' } },
        },
      },
    });
  } catch (e) { console.warn('[wr-extras] Verlaufs-Diagramm:', e.message); }
}

// ═══ 3. ⏪ Backfill aus dem 📜-Protokoll ═══════════════════════════════════
// Die Karriere-Zähler starten bei null — zwei Wochen Spielzeit wären damit
// entwertet. Ein Teil lässt sich aus den [[wr]]-Chatmeldungen rekonstruieren, die
// wrChatReport seit jeher schreibt.
//
// ⚠️ EHRLICHE GRENZE: DB.fetchMessages liefert die letzten 120 Nachrichten der
// GANZEN Gruppe. Was älter ist oder herausgerollt wurde, ist unwiederbringlich.
// Der Backfill ist deshalb eine Untergrenze, keine Wahrheit — und läuft genau
// EINMAL (Marker `backfilled`), damit er sich nicht selbst aufaddiert.
async function wrxBackfill() {
  const me = wrxMe();
  if (!me?.id) return;
  try {
    const st = window.wrStatsOf(me);
    if (st.backfilled) return;
    let msgs = [];
    try { msgs = (await DB.fetchMessages()) || []; } catch (e) { return; }
    const name = String(me.name || '');
    if (!name) return;
    const mark = (typeof WR_CHAT_MARK !== 'undefined') ? WR_CHAT_MARK : '[[wr]]';
    const add = { battlesWon: 0, battlesLost: 0, quadrantsScouted: 0,
                  coloniesFounded: 0, wavesWon: 0, shipsBuilt: 0 };
    for (const m of msgs) {
      const t = typeof m?.message === 'string' ? m.message : '';
      if (!t || t.indexOf(mark) === -1) continue;
      if (t.indexOf(name) === -1) continue;
      if (t.indexOf('hat die Wächter von') >= 0) add.battlesWon++;
      else if (t.indexOf('an den Wächtern gescheitert') >= 0) add.battlesLost++;
      else if (t.indexOf('aufgeklärt') >= 0) add.quadrantsScouted++;
      else if (t.indexOf('hat eine Kolonie auf') >= 0) add.coloniesFounded++;
      else if (t.indexOf('am Raumhafen abgewehrt') >= 0) add.wavesWon++;
      else if (t.indexOf('hat in der Werft gebaut') >= 0) {
        // „🏗️ Name hat in der Werft gebaut: [[s:jaeger]] 12× Jäger · …"
        let n = 0, re = /(\d+)×/g, mm;
        while ((mm = re.exec(t))) n += parseInt(mm[1], 10) || 0;
        add.shipsBuilt += n;
      }
    }
    const gefunden = Object.values(add).reduce((a, b) => a + b, 0);
    const neu = Object.assign({}, st);
    for (const [k, v] of Object.entries(add)) neu[k] = (neu[k] || 0) + v;
    neu.backfilled = true;
    neu.backfillAt = new Date().toISOString();
    await wrxPatchMd({ wrStats: neu });
    if (gefunden > 0) {
      wrxToast(`⏪ ${gefunden} frühere Weltraum-Ereignisse aus dem Protokoll nachgetragen.`, 'info');
    }
  } catch (e) { console.warn('[wr-extras] Backfill:', e.message); }
}

// ═══ 4. 📅 Wochenbericht im News-Kanal ════════════════════════════════════
// Einmal pro ISO-Woche, von wem auch immer die App zuerst öffnet.
// ⚠️ Die Idempotenz hängt am CHAT selbst, nicht an map_data: der Chat ist die
// einzige Quelle, die alle Clients gemeinsam sehen. Ein map_data-Marker wäre pro
// Spieler und der Bericht käme viermal.
function wrxIsoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - start) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-KW' + String(wk).padStart(2, '0');
}

// Der Absender muss in CC_NEWS_SENDERS stehen, sonst landet der Bericht im
// persönlichen Chat statt im 📰-News-Stream. Das Set ist zur Laufzeit erweiterbar
// (const bindet nur die Referenz, nicht den Inhalt) — so bleibt app.js unangetastet.
const WRX_SENDER = 'Weltraum-Kommando';
try {
  if (typeof CC_NEWS_SENDERS !== 'undefined' && CC_NEWS_SENDERS?.add) CC_NEWS_SENDERS.add(WRX_SENDER);
} catch (e) {}

let _wrxReportBusy = false;
async function wrxWochenbericht() {
  if (_wrxReportBusy) return;
  _wrxReportBusy = true;
  try {
    const kw = wrxIsoWeek(new Date());
    const kennung = '📅 Weltraum-Wochenbericht ' + kw;
    let msgs = [];
    try { msgs = (await DB.fetchMessages()) || []; } catch (e) { return; }
    if (msgs.some(m => typeof m?.message === 'string' && m.message.indexOf(kennung) >= 0)) return;

    const rows = [];
    for (const u of wrxUsers()) {
      try {
        const live = window.wrLive(u), st = window.wrStatsOf(u);
        if (!live || (!live.freed && !live.colonies && !live.power)) continue;
        rows.push({ u, live, score: window.wrScore(live, st) });
      } catch (e) {}
    }
    if (rows.length < 1) return;
    rows.sort((a, b) => b.score - a.score);

    const top = rows.slice(0, 5).map((r, i) =>
      `${['🥇','🥈','🥉'][i] || (i + 1) + '.'} ${r.u.name} — ${_f(r.score)} Pkt `
      + `(${r.live.colonies} Kolonien, ${r.live.freed} Planeten)`).join('\n');

    const regionen = [];
    try {
      for (const reg of (window.WR_REGIONS || [])) {
        const h = window.wrRegionStand(reg.key)?.holder;
        const nm = h ? (wrxUsers().find(x => x.id === h.id)?.name || '?') : null;
        regionen.push(`${reg.icon} ${reg.name}: ${nm || 'frei'}`);
      }
    } catch (e) {}

    let frei = 0, ges = 0;
    try {
      const pls = (typeof _wrGalaxy !== 'undefined' && _wrGalaxy?.planets) || [];
      ges = pls.length;
      frei = pls.filter(p => p?.cleared_by).length;
    } catch (e) {}

    const txt = `${kennung}\n\n🏆 Rangliste:\n${top}\n\n`
      + (regionen.length ? `🗺️ Regionen:\n${regionen.join(' · ')}\n\n` : '')
      + (ges ? `🌌 Galaxie: ${frei} von ${ges} Planeten befreit (${Math.round(frei / ges * 100)} %).` : '');
    await DB.postMessage(txt, WRX_SENDER);
  } catch (e) { console.warn('[wr-extras] Wochenbericht:', e.message); }
  finally { _wrxReportBusy = false; }
}

// ═══ 5. 🎖️ Hall of Fame ═══════════════════════════════════════════════════
// renderHallOfFame (app.js) füllt #hof-container komplett neu. Wir hängen unsere
// Karten danach an — gleiche Kachel-Klassen, damit sie sich einfügen.
function wrxLeader(fn) {
  let best = null, bestVal = -1;
  for (const u of wrxUsers()) {
    let v = 0;
    try { v = fn(u) || 0; } catch (e) { v = 0; }
    if (v > bestVal) { bestVal = v; best = u; }
  }
  return (best && bestVal > 0) ? { val: bestVal, name: best.name } : { val: null, name: null };
}

(function patchHof() {
  const orig = window.renderHallOfFame;
  if (typeof orig !== 'function') { console.warn('[wr-extras] renderHallOfFame nicht gefunden.'); return; }
  window.renderHallOfFame = function () {
    orig.apply(this, arguments);
    try {
      const host = document.getElementById('hof-container');
      if (!host) return;
      const L = (fn) => wrxLeader(fn);
      const live = (u) => window.wrLive(u) || {};
      const st   = (u) => window.wrStatsOf(u) || {};
      const cards = [
        { icon:'🪐', label:'Meiste Kolonien',      L: L(u => live(u).colonies) },
        { icon:'⚔️', label:'Meiste Planeten befreit', L: L(u => live(u).freed) },
        { icon:'🗺️', label:'Meiste Regionen',      L: L(u => live(u).regions) },
        { icon:'💫', label:'Größte Flotte',        L: L(u => live(u).power), fmt: v => _f(v) + ' ⚔️' },
        { icon:'🛡️', label:'Stärkste Hafenfeste',  L: L(u => live(u).turret), fmt: v => _f(v) + ' 🛡️' },
        { icon:'💀', label:'Meiste Wächter besiegt',L: L(u => st(u).foesDefeated), fmt: v => _f(v) },
        { icon:'🚨', label:'Stärkste Welle abgewehrt', L: L(u => st(u).waveStrengthMax), fmt: v => _f(v) },
        { icon:'🎯', label:'Meiste Aufträge erfüllt', L: L(u => (u?.map_data?.wrTasks?.done || []).length) },
        { icon:'🏆', label:'Höchster Raumfahrt-Score', L: L(u => window.wrScore(live(u), st(u))), fmt: v => _f(v) },
      ];
      // Nur zeigen, wenn im Clan überhaupt jemand im All war — sonst neun leere Kacheln.
      if (!cards.some(c => c.L.val != null)) return;
      const html = cards.map(c => `
        <div class="hof-card">
          <div class="hof-icon">${c.icon}</div>
          <div class="hof-label">${c.label}</div>
          <div class="hof-value">${c.L.val != null ? (c.fmt ? c.fmt(c.L.val) : c.L.val) : '—'}</div>
          <div class="hof-name">${_e(c.L.name ?? '—')}</div>
        </div>`).join('');
      const box = document.createElement('div');
      box.className = 'hof-grid';
      box.style.marginTop = '10px';
      box.innerHTML = html;
      const titel = document.createElement('div');
      titel.className = 'section-title';
      titel.style.margin = '18px 0 6px';
      titel.textContent = '🚀 Weltraum-Champions';
      host.parentNode.insertBefore(titel, host.nextSibling);
      titel.parentNode.insertBefore(box, titel.nextSibling);
    } catch (e) { console.warn('[wr-extras] Hall of Fame:', e.message); }
  };
})();

// ═══ 6. 👤 Weltraum-Block im Profil ═══════════════════════════════════════
// Wird wie renderVermoegen/renderMobilProfil dynamisch in den Untertab
// „📊 Tagesstatistik" gehängt — kein index.html-Edit.
// 💥 Flottenverluste bewerten: Stückzahlen je Typ × Listenpreis, plus die drei
// schwersten Posten im Klartext. Liefert { cc, top } — beides rein für die Anzeige.
function wrxVerlustWert(st) {
  try {
    const lost = (st && st.lostByType) || {};
    const defs = (typeof SPACE_SHIPS !== 'undefined') ? SPACE_SHIPS : [];
    let cc = 0;
    const posten = [];
    for (const [k, v] of Object.entries(lost)) {
      const n = parseInt(v, 10) || 0;
      if (n <= 0) continue;
      const d = defs.find(s => s.key === k);
      const wert = n * (d?.cc || 0);
      cc += wert;
      posten.push({ name: d?.name || k, n, wert });
    }
    posten.sort((a, b) => b.wert - a.wert || b.n - a.n);
    const top = posten.slice(0, 3).map(p => `${p.n}× ${p.name}`).join(' · ');
    return { cc: Math.round(cc), top };
  } catch (e) { return { cc: 0, top: '' }; }
}

(function patchProfil() {
  const orig = window.renderProfile;
  if (typeof orig !== 'function') { console.warn('[wr-extras] renderProfile nicht gefunden.'); return; }
  window.renderProfile = function () {
    orig.apply(this, arguments);
    try {
      const host = document.getElementById('profile-subtab-stats');
      const me = wrxMe();
      if (!host || !me) return;
      let sec = document.getElementById('wrx-profil');
      const live = window.wrLive(me) || {};
      const st = window.wrStatsOf(me) || {};
      // Wer nie im All war, braucht den Block nicht — er stünde nur als Nullzeile da.
      if (!live.freed && !live.colonies && !live.power && !live.tech) { if (sec) sec.remove(); return; }
      if (!sec) {
        sec = document.createElement('div');
        sec.id = 'wrx-profil';
        sec.className = 'progress-section';
        host.appendChild(sec);
      }
      const zeile = (l, v, neg) => `<div class="vermoegen-row">
          <span class="vermoegen-label">${l}</span>
          <span class="vermoegen-amount"${neg ? ' style="color:#e0795a"' : ''}>${v}</span></div>`;

      // 💥 Flottenverluste als MINUS (JP 2026-08-06). Zusätzlich zum Stückzähler der
      // Gegenwert in CC — sonst sagt „51 Schiffe verloren" nichts darüber, ob das
      // 51 Jäger oder 51 Schlachtschiffe waren.
      // ⚠️ Bewertet mit dem LISTENPREIS aus SPACE_SHIPS (ohne Werft-Rabatt und ohne
      // Rohstoffanteil). Das ist eine Schätzung des Anschaffungswerts, keine
      // Buchung — die Verluste tauchen deshalb bewusst NICHT im Tages-Log oder im
      // Vermögen auf: dort stünde sonst eine Ausgabe, die nie gebucht wurde.
      const verlust = wrxVerlustWert(st);
      const verlustZeile = st.shipsLost
        ? zeile('💥 Schiffe verloren',
            `−${_f(st.shipsLost)}${verlust.cc ? ` <span style="font-size:.72rem">(≈ −${_f(verlust.cc)} CC)</span>` : ''}`,
            true)
          + (verlust.top ? `<div class="vermoegen-row"><span class="vermoegen-label"
               style="color:var(--muted);font-size:.72rem;padding-left:14px">${verlust.top}</span>
               <span class="vermoegen-amount"></span></div>` : '')
        : '';
      // Negative Zeile im Stil der Vermögens-Box (dort färbt app.js Minusbeträge
      // ebenfalls mit #e0795a ein).
      const minus = (l, v, sub) => `<div class="vermoegen-row">
          <span class="vermoegen-label">${l}${sub ? `<span style="color:var(--muted);font-size:.72rem"> ${sub}</span>` : ''}</span>
          <span class="vermoegen-amount" style="color:#e0795a">−${v}</span></div>`;
      const verl = wrxVerlustWert(st);

      // Offene Auftragskarten mit Fortschritt — der häufigste Grund, ins Profil zu schauen.
      let auf = '';
      try {
        if (typeof window.wrtOf === 'function' && typeof window.wrtCtx === 'function') {
          const t = window.wrtOf(me), ctx = window.wrtCtx(me);
          const offen = (t.active || []).map(c => {
            const p = window.wrtProgress(ctx, c);
            if (!p.t) return '';
            return `<div class="vermoegen-row">
                <span class="vermoegen-label">${p.t.icon} ${_e(p.t.title)}
                  <span style="color:var(--muted);font-size:.72rem">${p.done ? '✅ erfüllt — einlösen!' : p.now + '/' + p.goal}</span></span>
                <span class="vermoegen-amount">+${_f(p.t.reward)} CC</span></div>`;
          }).join('');
          if (offen) auf = `<div class="section-title" style="margin-top:12px">🎯 Offene Aufträge</div>${offen}`;
        }
      } catch (e) {}

      sec.innerHTML = `
        <div class="section-title">🚀 Weltraum</div>
        <div class="vermoegen-total">${_f(window.wrScore(live, st))} <span class="vermoegen-cc">Score</span></div>
        <div class="vermoegen-list">
          ${zeile('⚔️ Befreite Planeten', _f(live.freed))}
          ${zeile('🪐 Kolonien', `${_f(live.colonies)}${live.colonyLevels > live.colonies ? ` (Stufen ${_f(live.colonyLevels)})` : ''}`)}
          ${zeile('🗺️ Regionen', live.regions || '—')}
          ${zeile('💫 Kampfkraft', _f(live.power))}
          ${zeile('🔬 Forschung', `${live.tech}${live.techMax ? '/' + live.techMax : ''}`)}
          ${zeile('💀 Wächterstärke besiegt', _f(st.foesDefeated))}
          ${verlustZeile}
          ${zeile('🪙 CC aus dem All', _f(st.ccFromSpace))}
        </div>
        ${auf}
        <div class="vermoegen-note">Details, Rangliste und Diagramme stehen im
          🏛️ Imperium unter 🚀 Weltall → 📊 Statistik.</div>`;
    } catch (e) { console.warn('[wr-extras] Profil-Block:', e.message); }
  };
})();

// ═══ 7. 🔧 Einhängen ══════════════════════════════════════════════════════
// Verlaufs-Diagramm an den Statistik-Tab hängen. ⚠️ Diese Datei lädt NACH
// weltraum_stats.js, unser Patch läuft also NACH dessen Panel-Aufbau — die Karte
// landet zuverlässig unter der Statistik.
(function patchRender() {
  const orig = window.wrRender;
  if (typeof orig !== 'function') return;
  window.wrRender = function () {
    orig.apply(this, arguments);
    try {
      if (typeof _wrTab === 'undefined' || _wrTab !== 'stats') { wrxDestroyChart(); return; }
      const wrap = document.querySelector('#imp-content .wr-wrap') || document.querySelector('.wr-wrap');
      if (!wrap || document.getElementById('wrx-verlauf')) return;
      const box = document.createElement('div');
      box.id = 'wrx-verlauf';
      box.innerHTML = wrxVerlaufHtml();
      wrap.appendChild(box);
      wrxBuildChart();
    } catch (e) { console.warn('[wr-extras] Verlaufs-Patch:', e.message); }
  };
})();

// Beim Öffnen des Statistik-Tabs einen Verlaufspunkt setzen.
(function hookTab() {
  const orig = window.wrSetTab;
  if (typeof orig !== 'function') return;
  window.wrSetTab = function (key) {
    orig.apply(this, arguments);
    if (key === 'stats') wrxSnapshot();
  };
})();

// Beim Betreten des Weltall-Tabs: Backfill (einmalig), Startpaket, Snapshot.
// Gestaffelt, damit die Popups sich nicht überlagern — das Aufgaben-Intro aus
// weltraum_aufgaben.js kommt nach 900 ms, unseres danach.
(function hookEntry() {
  const orig = window._buildWeltraum;
  if (typeof orig !== 'function') { console.warn('[wr-extras] _buildWeltraum nicht gefunden.'); return; }
  window._buildWeltraum = async function () {
    const r = await orig.apply(this, arguments);
    setTimeout(() => { wrxBackfill().then(() => wrxSnapshot()); }, 400);
    setTimeout(() => { wrxStartpaket(); }, 2200);
    setTimeout(() => { wrxWochenbericht(); }, 5000);
    return r;
  };
})();

window.wrxStartpaket   = wrxStartpaket;
window.wrxWochenbericht = wrxWochenbericht;
window.wrxSnapshot     = wrxSnapshot;
window.wrxBackfill     = wrxBackfill;
window.wrxHistOf       = wrxHistOf;

console.info('[wr-extras] Startpaket, Hall of Fame, Profil-Block, Score-Verlauf, '
  + 'Wochenbericht und Backfill aktiv.');

})();
