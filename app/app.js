function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`; t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

// Achievement-Popups werden in einer Warteschlange NACHEINANDER gezeigt. Vorher
// überschrieben sich gleichzeitig freigeschaltete Achievements (gemeinsames Element +
// gemeinsamer Timeout) → man sah nur das letzte kurz aufblitzen. Genau das passiert beim
// ersten Eintrag nach einem Update, wenn mehrere neue Achievements auf einmal fallen.
let _achQueue = [];
let _achBusy  = false;
function showAchievementPopup(ach) {
  if (!ach) return;
  _achQueue.push(ach);
  if (!_achBusy) _drainAchQueue();
}
function _drainAchQueue() {
  const p = document.getElementById('achievement-popup');
  if (!p || !_achQueue.length) { _achBusy = false; return; }
  _achBusy = true;
  const ach = _achQueue.shift();
  p.querySelector('.ach-icon').textContent = ach.icon || '🏆';
  p.querySelector('.ach-name').textContent = ach.name || '';
  p.querySelector('.ach-desc').textContent = ach.desc || '';
  p.classList.add('show');
  setTimeout(() => {
    p.classList.remove('show');
    setTimeout(_drainAchQueue, 400); // kurze Lücke, dann das nächste
  }, 2600);
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser     = null;
let currentUserData = null;
let appData         = null;
let leaderboardData = [];
let activeView      = 'rangliste';
let pollInterval    = null;
let charts          = {};

// ── Views ─────────────────────────────────────────────────────────────────────
const views = ['rangliste','profil','statistiken','halloffame','saisons','nachrichten','admin','imperium','qrcode']

function switchView(view) {
  views.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === view);
    document.querySelector(`[data-view="${v}"]`)?.classList.toggle('active', v === view);
  });
  activeView = view;
  if (view === 'rangliste')   renderLeaderboard();
  if (view === 'profil') {
    renderProfile();
    renderCoinSection(currentUserData);
    renderSprueche(currentUserData);
    // Coin-Anzeige im Header aktualisieren
    const hc = document.getElementById('header-coins');
    if (hc && currentUserData?.coins !== undefined) {
      hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(currentUserData.coins)}`;
    }
  }
  if (view === 'imperium')    renderImperium();
  if (view === 'statistiken') renderStats();
  if (view === 'halloffame')  renderHallOfFame();
  if (view === 'saisons')     renderSeasons();
  if (view === 'nachrichten') { renderMessages(); renderPackPresets(currentUserData); }
  if (view === 'admin')       renderAdmin();
  if (view === 'qrcode')      renderQR();
}

function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }

// ── App zeigen ────────────────────────────────────────────────────────────────
function showApp() {
  hide('loading-screen'); hide('group-screen'); hide('auth-screen');
  show('app-screen');
  const group = AUTH.getGroup();
  document.getElementById('header-username').textContent = currentUser.name;
  document.getElementById('header-groupname').textContent = group?.name || '';
  document.getElementById('nav-admin').classList.toggle('hidden', !currentUserData?.isAdmin);
  const headerAv = document.getElementById('btn-logout');
  if (headerAv) headerAv.textContent = currentUserData?.cosmetics?.avatar || '☕';
  if (typeof applyTheme === 'function') applyTheme(currentUserData?.cosmetics?.theme || 'default');
  startPolling();
  DB.getPinnedMessage().then(renderPinnwand);
  switchView('rangliste');
  // Kaffee-Quiz: am 1./15. ggf. Einladungs-Modal zeigen (nur wenn noch nicht gespielt).
  if (typeof Quiz !== 'undefined') Quiz.checkAndMaybePopup();
  // "Was ist neu"-Hinweis: leicht verzögert, damit er nicht mit dem Quiz-Modal kollidiert
  // (Quiz-Invite hat Vorrang — falls es gerade offen ist, kommt der Hinweis beim nächsten Login).
  setTimeout(() => {
    const qm = document.getElementById('quiz-modal');
    const quizOpen = !!qm && !qm.classList.contains('hidden');
    if (!quizOpen) checkAndMaybeShowWhatsNew();
  }, 700);
  // Passives Einkommen beim App-Start einlösen (entkoppelt von Tassen). Der
  // Gehalts-Snapshot läuft ERST danach (verkettet), nicht parallel: sein map_data-Write
  // (`{...md0, salaryHistory}`) würde sonst den frisch von claimPassive geschriebenen
  // Passiv-Eintrag im Tages-Log überschreiben (Read-modify-write-Clobber).
  // Gehalts-Snapshots für das 💰 Gehalts-Chart: alle Gruppenmitglieder im 5h-Raster
  // (clientseitig auf 1×/5h-Bucket gedrosselt, Bucket-idempotent). So zeigt der Verlauf
  // die ganze Gruppe — nicht nur, wer die App zuletzt geöffnet hat.
  claimPassiveAndRefresh().then(() => { if (currentUser?.id) DB.recordSalarySnapshotsAll(); });
}

// Passives Einkommen einlösen und bei Gutschrift Anzeige aktualisieren.
let _lastPassiveAttempt = 0;
async function claimPassiveAndRefresh(force = false) {
  if (!currentUser?.id) return;
  // Drosselung: höchstens alle 15 Min einen DB-Versuch (Server begrenzt ohnehin auf 1×/Std)
  if (!force && Date.now() - _lastPassiveAttempt < 15 * 60 * 1000) return;
  _lastPassiveAttempt = Date.now();
  // Passiv- UND Login-Bonus-Gutschrift NACHEINANDER einlösen — beide schreiben einen
  // Tages-Log-Eintrag ins map_data (claimPassive den Passiv-, claimLoginBonus den
  // Login-Eintrag; claimLoginBonus liest dabei das von claimPassive aktualisierte
  // map_data frisch). ERST danach ein einziges refreshData. So kann kein zwischendurch
  // ausgelöster Refresh/Snapshot den gerade geschriebenen Passiv-Eintrag clobbern.
  let earned = 0, lb = 0, tribute = [];
  try { earned = await DB.claimPassive(currentUser.id); }
  catch (e) { console.warn('Passiv-Einlösung fehlgeschlagen:', e.message); }
  // Täglicher Login-Bonus (idempotent pro Tag, eskaliert mit der Login-Serie)
  try { lb = await DB.claimLoginBonus(currentUser.id); }
  catch (e) { console.warn('Login-Bonus fehlgeschlagen:', e.message); }
  // 🕊️ Fälligen Friedensbündnis-Tribut abbuchen (server-seitig auf 7 Tage gegated,
  // hier nur "anstoßen" wie Passiv-/Login-Bonus — kein Cron). Schreibt selbst einen
  // -CC-Log-Eintrag (settleAllianceTributes) — Ergebnis hier nur für Toast/Refresh nötig.
  try { tribute = await DB.settleAllianceTributes(currentUser.id); } catch (e) {}
  const tributePaid = (tribute || []).filter(t => t.amount_paid > 0);
  if (earned > 0 || (lb && lb.reward) || tributePaid.length) {
    try { await refreshData(); } catch (e) {}
    const hc = document.getElementById('header-coins');
    if (hc && currentUserData?.coins !== undefined) {
      hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(currentUserData.coins)}`;
    }
    if (earned > 0) showToast(`⚙️ +${earned} CC passives Einkommen`, 'success');
    if (lb && lb.reward) showToast(`📅 +${lb.reward} CC Login-Bonus (Tag ${lb.streak})`, 'success');
    for (const t of tributePaid) showToast(`🕊️ -${t.amount_paid} CC Friedenstribut an ${t.receiver_name || '?'}`, 'info');
  }
  dailyGroupTasks(); // Tagesabgabe + Wochen-Challenge (selbst idempotent pro Tag/Woche)
}

// Gruppen-Tagesaufgaben: 1%-Tagesabgabe der Top-3-Verdiener + kollektive Wochen-Challenge.
// Beide DB-Funktionen sind über Datum/ISO-Woche idempotent — mehrfaches Aufrufen ist harmlos.
async function dailyGroupTasks() {
  if (!currentUser?.id) return;
  let changed = false;
  // (Die Kaffee-Aufgabe wird NICHT beim Login angekündigt, sondern erst bei Erfüllung
  //  über DB.claimDailyTask in den Chat gepostet.)
  try {
    const levy = await DB.applyDailyLevy();
    if (levy && (levy.levied > 0 || levy.interest > 0)) {
      changed = true;
      try {
        const pct = Math.round((levy.rate || 0.05) * 100);
        const zins = levy.interest > 0
          ? ` 💰 Spar-Zins (${Math.round((levy.interestRate || 0) * 100)} %/Tag): +${levy.interest} GC.`
          : '';
        const who = levy.details.map(d => `${d.name} (${d.amt} CC)`).join(', ');
        const abgabe = levy.levied > 0
          ? `Tagesabgabe (${pct} % vom Tageseinkommen): ${who} führen zusammen ${levy.levied} CC an die Gruppenkasse ab.`
          : 'Tagesabgabe: heute kein Einkommen abzuführen.';
        await DB.postMessage(`🏛️ ${abgabe}${zins} (Stand: ${levy.newBalance} GC)`, 'Gruppenkasse');
      } catch (e) {}
      try { await DB.syncTreasuryGoals(); } catch (e) {}
    }
  } catch (e) { console.warn('Tagesabgabe fehlgeschlagen:', e.message); }
  try {
    const wc = await DB.checkWeeklyChallenge(appData?.dailyStats || {});
    if (wc && wc.justCompleted) {
      changed = true;
      try { await DB.postMessage(`${WEEKLY_CHALLENGE.icon} Wochen-Challenge geschafft: „${WEEKLY_CHALLENGE.label}"! Alle erhalten +${wc.reward} CC. ☕`, 'Gruppenkasse'); } catch (e) {}
      showToast(`${WEEKLY_CHALLENGE.icon} Wochen-Challenge geschafft! +${wc.reward} CC`, 'success');
    }
  } catch (e) { console.warn('Wochen-Challenge fehlgeschlagen:', e.message); }
  // Saison automatisch abschließen, wenn heute der letzte Tag des Monats ist und sie
  // noch nicht geschlossen wurde — sonst muss ein Admin manuell daran denken. Sicher
  // bei Mehrfachaufruf durch mehrere gleichzeitig aktive Clients (Idempotenz-Guard
  // in DB.closeSeason).
  try {
    const close = await DB.autoCloseSeasonIfDue();
    if (close && !close.alreadyClosed) {
      changed = true;
      if (close.winner) {
        const CC_BY_RANK = [50, 20, 10];
        const CC_PART    = 5;
        let rank = 0;
        const lines = close.standings.map((m, i) => {
          if (i > 0 && m.sc !== close.standings[i - 1].sc) rank = i;
          const cc    = CC_BY_RANK[rank] ?? CC_PART;
          const medal = ['🥇','🥈','🥉'][rank] || `${rank + 1}.`;
          return `${medal} ${m.name} (${m.sc} ☕, +${cc} CC)`;
        }).join(' · ');
        const championNames = (close.winners || [close.winner]).map(w => w.name).join(' & ');
        const themeMsg = close.themeId ? ` 🎨 Theme „${close.themeId}" freigeschaltet.` : '';
        try {
          await DB.postMessage(
            `🏁 Saison ${close.seasonId} automatisch abgeschlossen! 🏆 Champion: ${championNames} (${close.winner.sc} ☕).${themeMsg}\n${lines}`,
            'Saison-Abschluss'
          );
        } catch (e) {}
      } else {
        try {
          await DB.postMessage(`🏁 Saison ${close.seasonId} automatisch abgeschlossen — kein aktiver Teilnehmer.`, 'Saison-Abschluss');
        } catch (e) {}
      }
    }
  } catch (e) { console.warn('Saison-Auto-Abschluss fehlgeschlagen:', e.message); }
  if (changed) { try { await refreshData(); } catch (e) {} }
}

function showNamePicker(users) {
  hide('loading-screen'); hide('group-screen'); hide('app-screen');
  show('auth-screen');
  const btns = document.getElementById('user-buttons');
  btns.innerHTML = users.length === 0
    ? '<p class="empty-hint" style="margin:0">Noch niemand dabei. Trag deinen Namen ein!</p>'
    : users.map(u => `<button class="user-btn" data-uid="${_esc(u.id)}">${_esc(u.name)}</button>`).join('');
  btns.querySelectorAll('.user-btn').forEach(btn =>
    btn.addEventListener('click', () => selectExistingUser(btn.dataset.uid, users))
  );
}

function showGroupScreen() {
  hide('loading-screen'); hide('auth-screen'); hide('app-screen');
  show('group-screen');
}

async function selectExistingUser(uid, users) {
  const user = users.find(u => u.id === uid);
  if (!user) return;
  AUTH.setCurrentUser(user);
  currentUser = { id: user.id, name: user.name };
  currentUserData = user;
  showApp();
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(refreshData, 30000);
}

async function refreshData() {
  try {
    const [data, pinned] = await Promise.all([DB.fetchData(), DB.getPinnedMessage()]);
    appData = data;
    leaderboardData = DB.getLeaderboard(appData);
    currentUserData = appData.users.find(u => u.id === currentUser?.id) || currentUserData;
    renderPinnwand(pinned);
    if (activeView === 'rangliste') renderLeaderboard();
    const el = document.getElementById('last-refreshed');
    if (el) el.textContent = 'Aktualisiert: ' + new Date().toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch (e) { console.warn('Refresh fehlgeschlagen:', e.message); }
  // Passives Einkommen für lange offene Sessions (intern auf 15 Min / 1 Std gedrosselt).
  // Snapshot verkettet DANACH (nicht parallel), sonst clobbert sein map_data-Write den
  // frisch geschriebenen Passiv-Eintrag im Tages-Log. Bucket-gedrosselt, idempotent.
  claimPassiveAndRefresh().then(() => { if (currentUser?.id) DB.recordSalarySnapshotsAll(); });
}

// ── Nachrichten ───────────────────────────────────────────────────────────────
// System-/Automaten-Absender → landen im 📰 News-Stream statt im persönlichen 💬 Chat.
// (Klassifizierung über den Absendernamen — keine Schema-Änderung nötig. Künftige
// CIQ-Broadcasts einfach unter einem dieser Namen posten, dann landen sie automatisch in News.)
const CC_NEWS_SENDERS = new Set([
  'Gruppenkasse', 'Kaffee-Aufgabe', 'Koffein-Polizei', 'Work-Life-Balance-Polizei', 'Kaffee-Kasse',
  'Büro-Krieg', 'CIQ-Labor', 'Förderstelle', 'Anonymer Tipp', 'Kaffee-Markt', 'Saison-Abschluss',
]);
function _isNewsMsg(m) { return CC_NEWS_SENDERS.has(m.member_name); }
let _msgTab = 'chat';

// Sub-Tab-Leiste (💬 Chat / 📰 News) einmalig in den Chat-View injizieren (kein index.html-Edit).
function ensureMsgTabs() {
  const view = document.getElementById('view-nachrichten');
  if (!view || document.getElementById('msg-tabbar')) return;
  const bar = document.createElement('div');
  bar.id = 'msg-tabbar';
  bar.className = 'msg-tabbar';
  bar.innerHTML = `
    <button class="msg-tab active" data-mtab="chat">💬 Chat</button>
    <button class="msg-tab" data-mtab="news">📰 News</button>`;
  view.insertBefore(bar, view.firstChild);
  bar.querySelectorAll('.msg-tab').forEach(b => b.onclick = () => {
    _msgTab = b.dataset.mtab;
    bar.querySelectorAll('.msg-tab').forEach(x => x.classList.toggle('active', x === b));
    renderMessages();
  });
}

async function renderMessages() {
  ensureMsgTabs();
  const list    = document.getElementById('messages-list');
  const inputBar = document.querySelector('#view-nachrichten .messages-input-bar');
  // Composer nur im Chat zeigen — News ist nur-lesen
  if (inputBar) inputBar.style.display = (_msgTab === 'news') ? 'none' : '';
  list.innerHTML = '<div class="msg-empty">Lade…</div>';
  const all = await DB.fetchMessages();
  const msgs = all.filter(m => _msgTab === 'news' ? _isNewsMsg(m) : !_isNewsMsg(m));
  if (!msgs.length) {
    list.innerHTML = `<div class="msg-empty">${_msgTab === 'news'
      ? '📰 Noch keine News. Hier landen automatische Meldungen (Kasse, Polizei, Aufgaben …).'
      : '☕ Noch keine Nachrichten. Schreib als Erster!'}</div>`;
    return;
  }
  const fmtMeta = (m) => {
    const time = new Date(m.created_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const date = new Date(m.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
    const showDate = new Date().toDateString() !== new Date(m.created_at).toDateString();
    return `${showDate ? date + ' ' : ''}${time}`;
  };
  if (_msgTab === 'news') {
    list.innerHTML = msgs.map(m => `
      <div class="news-item">
        <div class="news-sender">${_esc(m.member_name)}</div>
        <div class="news-body">${_esc(m.message)}</div>
        <div class="news-time">${fmtMeta(m)}</div>
      </div>`).join('');
  } else {
    list.innerHTML = msgs.map(m => {
      const own = m.member_name === currentUser?.name;
      return `<div class="msg-item ${own ? 'own' : 'other'}">
        <div class="msg-bubble">${_esc(m.message)}</div>
        <div class="msg-meta">${own ? '' : `${_esc(m.member_name)} · `}${fmtMeta(m)}</div>
      </div>`;
    }).join('');
  }
  list.scrollTop = list.scrollHeight;
}

async function sendMessage(text) {
  if (!text?.trim()) return;
  try {
    await DB.postMessage(text, currentUser.name);
    document.getElementById('msg-input').value = '';
    await renderMessages();
  } catch (e) { showToast(e.message, 'error'); }
}

// Zusätzliche Kurz-Presets für freigeschaltete Spruch-Packs (passend zu "☕ Kaffee alle!")
function renderPackPresets(member) {
  const el = document.getElementById('pinnwand-packs');
  if (!el) return;
  const unlocked = member?.cosmetics?.unlockedPacks || {};
  const packIds = Object.keys(unlocked)
    .filter(packId => unlocked[packId] && typeof PACK_PRESETS !== 'undefined' && PACK_PRESETS[packId]);

  // Jeder Pack liefert mehrere Presets (Array) — alle einsammeln
  const messages = packIds.flatMap(packId => {
    const p = PACK_PRESETS[packId];
    return Array.isArray(p) ? p : [p];
  });

  if (!messages.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';

  el.innerHTML = messages.map(msg =>
    `<button class="preset-btn" data-msg="${_esc(msg)}">${_esc(msg)}</button>`
  ).join('');
  el.querySelectorAll('.preset-btn').forEach(btn =>
    btn.addEventListener('click', () => sendMessage(btn.dataset.msg))
  );
}

// ── Pinnwand ──────────────────────────────────────────────────────────────────
function renderPinnwand(pinned) {
  const display = document.getElementById('pinnwand-display');
  if (!display) return;
  const expired = pinned?.pinned_at &&
    (new Date() - new Date(pinned.pinned_at)) > 24 * 60 * 60 * 1000;
  if (expired) { DB.clearPinnedMessage(); display.classList.add('hidden'); return; }
  if (pinned?.pinned_message) {
    document.getElementById('pinnwand-text').textContent = pinned.pinned_message;
    document.getElementById('pinnwand-by').textContent = pinned.pinned_by ? `— ${pinned.pinned_by}` : '';
    display.classList.remove('hidden');
  } else {
    display.classList.add('hidden');
  }
}

async function postPinnwand(msg) {
  if (!msg?.trim()) return;
  try {
    await Promise.all([
      DB.setPinnedMessage(msg, currentUser.name),
      DB.postMessage(msg, currentUser.name)
    ]);
    renderPinnwand({ pinned_message: msg, pinned_by: currentUser.name });
    document.getElementById('pinnwand-input').value = '';
    showToast('📌 Nachricht gepostet!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function clearPinnwand() {
  try {
    await DB.clearPinnedMessage();
    renderPinnwand({});
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Gruppe erstellen / beitreten ──────────────────────────────────────────────
function switchGroupTab(tab) {
  document.getElementById('tab-create-btn').classList.toggle('active', tab === 'create');
  document.getElementById('tab-join-btn').classList.toggle('active', tab === 'join');
  document.getElementById('panel-create').classList.toggle('hidden', tab !== 'create');
  document.getElementById('panel-join').classList.toggle('hidden', tab !== 'join');
}

async function createGroup() {
  const name = document.getElementById('create-name').value.trim();
  const pass = document.getElementById('create-pass').value.trim();
  if (!name) { showToast('Bitte Gruppenname eingeben', 'error'); return; }
  if (!pass)  { showToast('Bitte Passwort eingeben', 'error'); return; }
  const btn = document.getElementById('btn-create'); btn.disabled = true; btn.textContent = 'Erstelle…';
  try {
    const group = await DB.createGroup(name, pass);
    AUTH.setGroup(group);
    show('loading-screen'); hide('group-screen');
    await loadAndShowApp();
  } catch (e) {
    showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Gruppe erstellen';
  }
}

async function joinGroup() {
  const name = document.getElementById('join-name').value.trim();
  const pass = document.getElementById('join-pass').value.trim();
  if (!name) { showToast('Bitte Gruppenname eingeben', 'error'); return; }
  if (!pass)  { showToast('Bitte Passwort eingeben', 'error'); return; }
  const btn = document.getElementById('btn-join'); btn.disabled = true; btn.textContent = 'Suche…';
  try {
    const group = await DB.joinGroup(name, pass);
    AUTH.setGroup(group);
    show('loading-screen'); hide('group-screen');
    await loadAndShowApp();
  } catch (e) {
    showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Beitreten';
  }
}

// ── Name registrieren ─────────────────────────────────────────────────────────
async function registerNewUser() {
  const inp = document.getElementById('new-name-input');
  const name = inp.value.trim();
  if (!name) { showToast('Bitte einen Namen eingeben', 'error'); return; }
  const btn = document.getElementById('btn-register'); btn.disabled = true;
  try {
    const newUser = await DB.registerUser(name);
    appData = await DB.fetchData();
    leaderboardData = DB.getLeaderboard(appData);
    AUTH.setCurrentUser(newUser);
    currentUser = { id: newUser.id, name: newUser.name };
    currentUserData = newUser;
    showApp();
    showToast('☕ Willkommen! Du startest mit +50 CC Startkapital.', 'success');
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; }
}

// ── Tassen eintragen ──────────────────────────────────────────────────────────
async function quickAdd(amount) {
  if (!currentUser) return;
  const btn = document.querySelector(`[data-quick="${amount}"]`);
  if (btn) btn.disabled = true;
  try {
    const newAch = await DB.addCups(currentUser.id, amount);
    showToast(`+${amount} Tasse${amount > 1 ? 'n' : ''} eingetragen!`, 'success');
    for (const a of newAch) showAchievementPopup(a);
    await refreshData();
    if (activeView === 'profil') {
      renderProfile();
      renderCoinSection(currentUserData);
      renderSprueche(currentUserData);
    }
    // CoffeeCoin Feedback
    if (newAch.coinsEarned > 0) {
      showToast(`+${newAch.coinsEarned.toFixed(1)} ☕ CC`, 'success');
    }
    if (newAch.morning) {
      setTimeout(() => showToast('🌅 Morgenröte +1 CC/Tasse!', 'info'), 600);
    }
    if (newAch.passiveEarned > 0) {
      setTimeout(() => showToast(`🌿 +${newAch.passiveEarned.toFixed(1)} CC passiv`, 'info'), 1200);
    }
    if (newAch.caffeineRedFlag) {
      setTimeout(() => showToast(newAch.caffeineRedFlag, 'error'), 1800);
    }
    if (newAch.caffeinePenalty > 0) {
      setTimeout(() => showToast(`💸 −${newAch.caffeinePenalty} CC Koffein-Strafe → Gruppenkasse`, 'error'), 2400);
    }
    // Header-Coins nach Reload aktualisieren
    const hc = document.getElementById('header-coins');
    if (hc && appData?.users) {
      const me = appData.users.find(u => u.id === currentUserData?.id);
      if (me) hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(me.coins)}`;
    }
  } catch (e) { showToast(e.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

async function customAdd() {
  const inp = document.getElementById('custom-cups-input');
  const val = parseInt(inp.value);
  if (isNaN(val) || val < 1) { showToast('Ungültige Menge', 'error'); return; }
  inp.value = '';
  await quickAdd(val);
}

async function profileAddCups() {
  const inp = document.getElementById('profile-cups-input');
  const val = parseInt(inp.value);
  if (isNaN(val) || val < 1) { showToast('Bitte eine Zahl eingeben', 'error'); return; }
  inp.value = '';
  await quickAdd(val);
  renderProfile();
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function renderLeaderboard() {
  const podium = document.getElementById('podium');
  const container = document.getElementById('leaderboard-table');
  if (!container) return;
  // „Wohltäter" = größter Einzahler in die Gruppenkasse
  const benefactorId = (typeof treasuryTopContributor === 'function')
    ? treasuryTopContributor(appData?.treasury, leaderboardData.map(u => u.id)) : null;
  const benefactorBadge = (u) => (benefactorId && u.id === benefactorId) ? ' <span class="wohltaeter-badge" title="Größter Einzahler in die Gruppenkasse">🎗️ Wohltäter</span>' : '';
  const top3 = leaderboardData.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const podiumPos   = ['silver','gold','bronze'];
  podium.innerHTML = podiumOrder.map((u, i) => u ? `
    <div class="podium-place podium-${podiumPos[i]}">
      <div class="podium-rank">${['🥈','🥇','🥉'][i]}</div>
      <div class="podium-name">${_esc2(u.cosmetics?.avatar || '☕')} ${_esc(u.name)}</div>
      <div class="podium-cups">${u.totalCups} ☕</div>
      <div class="podium-title">${_esc(DB.getTitle(u.totalCups))}${_esc(_zusatztitelSuffix(u))}${benefactorBadge(u)}</div>
    </div>` : '<div class="podium-place podium-empty"></div>').join('');
  container.innerHTML = `<table>
    <thead><tr><th>#</th><th>Name</th><th>Titel</th><th>Tassen</th></tr></thead>
    <tbody>${leaderboardData.map((u, i) => `
      <tr class="${u.id === currentUser?.id ? 'own-row' : ''}">
        <td>${i + 1}</td><td>${_esc2(u.cosmetics?.avatar || '☕')} ${_esc(u.name)}${benefactorBadge(u)}</td>
        <td class="title-cell">${_esc(DB.getTitle(u.totalCups))}${_esc(_zusatztitelSuffix(u))}</td>
        <td>${u.totalCups}</td>
      </tr>`).join('')}
    </tbody></table>`;
  ensureRegelwerk();
}

// ── "Was ist neu"-Popup ──────────────────────────────────────────────────────
// Zeigt einmalig pro Versionsstand eine Kurzfassung der jüngsten neuen Features beim
// App-Start. Idempotent über map_data.whatsNewSeen = WHATS_NEW_VERSION (analog Login-Bonus/
// Tagesaufgaben-Muster) — wer schon dran war, sieht es nicht erneut. Bei künftigen neuen
// Features: WHATS_NEW_VERSION + WHATS_NEW_ITEMS aktualisieren, dann poppt es einmalig erneut auf.
const WHATS_NEW_VERSION = '2026-07-06-anlage-rework';
const WHATS_NEW_ITEMS = [
  { icon: '🏦', title: 'Stille Anlage neu aufgestellt', text: 'Deine Stille Anlage wirft jetzt keinen festen Zins mehr ab, sondern einen Anteil am Gebäude-Einkommen des Landes — je mehr du anlegst (bis 1.250 CC/Land), desto größer dein Anteil (bis 20 %). Länder ohne Gebäude werfen nichts ab. Und neu: du kannst dein Kapital jederzeit wieder auszahlen — dabei gehen 20 % als Entschädigung an die Erbauer des Landes, die dir die Erträge erst ermöglicht haben (leeres Land: 0 %).' },
];

function checkAndMaybeShowWhatsNew() {
  if (!currentUserData || typeof currentUser === 'undefined' || !currentUser?.id) return;
  if (currentUserData.map_data?.whatsNewSeen === WHATS_NEW_VERSION) return;
  _showWhatsNewModal();
}

function _showWhatsNewModal() {
  let m = document.getElementById('whats-new-modal');
  if (!m) { m = document.createElement('div'); m.id = 'whats-new-modal'; m.className = 'hidden'; document.body.appendChild(m); }
  const itemsHtml = WHATS_NEW_ITEMS.map(i => `
    <div style="text-align:left;margin:10px 0">
      <strong>${i.icon} ${_esc(i.title)}</strong>
      <p style="margin:3px 0 0;font-size:0.85rem;line-height:1.4;color:var(--muted)">${_esc(i.text)}</p>
    </div>`).join('');
  m.innerHTML = `
    <div class="quiz-backdrop"></div>
    <div class="quiz-box">
      <div class="quiz-card" style="text-align:center">
        <div class="quiz-emoji">🆕</div>
        <h2>Neu im Coffee Champion!</h2>
        ${itemsHtml}
        <p class="quiz-hint" style="margin-top:12px">📖 Alle Details stehen wie immer im Regelwerk unten in der Rangliste.</p>
        <button class="btn-primary quiz-cta" id="whats-new-ok">Verstanden, los geht's!</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
  document.getElementById('whats-new-ok').onclick = async () => {
    m.classList.add('hidden');
    try {
      const md = { ...(currentUserData.map_data || {}), whatsNewSeen: WHATS_NEW_VERSION };
      currentUserData = { ...currentUserData, map_data: md };
      await DB.updateMapData(currentUser.id, md);
    } catch (e) { /* non-critical — poppt im Zweifel nochmal auf */ }
  };
}

// ── Regelwerk / Spickzettel (unten in der Rangliste, einmal injiziert) ──────────
function ensureRegelwerk() {
  const host = document.getElementById('view-rangliste');
  if (!host || document.getElementById('cc-regelwerk')) return;
  const sec = (icon, title, body) =>
    `<details class="cc-rw-item"><summary>${icon} ${title}</summary><div class="cc-rw-body">${body}</div></details>`;
  const wrap = document.createElement('div');
  wrap.id = 'cc-regelwerk';
  wrap.className = 'cc-regelwerk';
  wrap.innerHTML = `
    <div class="cc-rw-hero">
      <div class="cc-rw-hero-title">☕📖 Das große Coffee-Champion-Regelwerk</div>
      <div class="cc-rw-hero-sub">Kleiner Durchhänger? Kaffee leer, Motivation auch? Dann gönn dir die
      Coffee-Champion-Ship — <b>hier gibst du's dir richtig.</b> Alles vom ersten Schluck bis zum
      Kaffee-Imperium. Aufklappen, schlürfen, dominieren. 😏</div>
    </div>
    <div class="cc-rw-list">
    ${sec('☕', 'Tassen & CoffeeCoins (CC)', `
      Jede eingetragene Tasse bringt dir <b>Basis-CC</b> — die Hauptwährung deines Aufstiegs.
      Forschung, Schätze, Boni & Co. legen ordentlich drauf.<br>
      <span class="cc-rw-hl">Tageslimit:</span> normal bis zu <b>15 Tassen/Tag</b>. Wer's übertreibt,
      lernt die Koffein-Polizei kennen (siehe ganz unten 🚩).<br>
      <span class="cc-rw-hl">Profi-Tipp:</span> Im Profil-Tab unter „☕ Heute erhalten" siehst du genau,
      woher jeder CC kam. Keine Geheimniskrämerei.`)}
    ${sec('🔥', 'Die Serie (Streak)', `
      Trag <b>jeden Tag</b> mindestens eine Tasse ein und deine Serie wächst.
      Bei <b>5 · 20 · 100</b> Tagen gibt's fette Meilenstein-Boni obendrauf.
      Ein Tag Pause = Serie reißt. Disziplin schmeckt bitter, zahlt sich aber aus.`)}
    ${sec('🏆', 'Achievements', `
      Über 20 Abzeichen warten — erste Tasse, Sparfuchs, Forscher, Serien-Held …
      Jedes schaltet sich automatisch frei und wirft <b>CC</b> ab.
      Neueinsteiger kassieren die Einsteiger-Achievements gleich beim Loslegen.`)}
    ${sec('🧠', 'Kaffee-Quiz & Kaffee-IQ (CIQ)', `
      Jeden <b>Mittwoch</b> öffnet das Quiz: 10 Fragen, 15 Sekunden pro Frage,
      Sofort-Feedback. Pro Treffer <b>+4 CC</b> und <b>+1 CIQ</b>.<br>
      <span class="cc-rw-hl">CIQ ist dein Köpfchen-Score</span> — er sinkt nie und ist die Eintrittskarte
      für die schlauen (und fiesen 😈) CIQ-Fähigkeiten. Wer klug ist, soll's auch spüren.`)}
    ${sec('🗺️', 'Die Karte: Schätze, Items & Events', `
      Erkunde die Pixel-Karte mit täglichen Schritten und stolpere über <b>Büro-Schätze</b> (CC!).<br>
      <span class="cc-rw-hl">RPG-Items</span> in 5 Slots verstärken dich: Schuhe stapeln Schritte
      (Wanderschuhe +2 & Trailrunner = <b>+6</b>), Rucksack gibt <b>×1,25 CC</b> auf jeden Fund,
      Thermos trotzt Pannen, Trüffelnase findet mehr, der Barista-Bart 🧔 kassiert bei Gruppen-Funden mit.<br>
      <span class="cc-rw-hl">Zufalls-Events</span> würzen den Tag: mal Segen, mal Streich.`)}
    ${sec('🏗️', 'Gebäude & Passiv-Einkommen', `
      Auf erkundetem, gleichem Terrain baust du <b>Gebäude</b> (1×1 bis 3×3) — die werfen
      <b>Einkommen ab, während du nichts tust</b>. Bauzeit läuft in Echtzeit, kein Klick nötig.
      Passives Einkommen sammelt sich (gedeckelt auf ein paar Tage), also schau ab und zu rein.
      Der Handelshafen ⚓ schneidet sogar bei fremden Forschungskäufen mit.`)}
    ${sec('🔬', 'Forschung', `
      Im Imperium-Tab wächst dein <b>Forschungsbaum</b> (5 Tiers). Items geben CC pro Tasse
      <i>und</i> pro Tag. Höhere Tiers brauchen Voraussetzungen — erst die Basis, dann der Luxus.
      <b>Jedes voll abgeschlossene Tier</b> verstärkt alle Forschungs-Effekte.`)}
    ${sec('🌍', 'Weltkarte', `
      Mit der <b>Welthandels-Lizenz</b> (Forschung) öffnet sich die Welt: investiere CC in G20-Länder,
      verdränge die Konkurrenz und sichere dir <b>Regierung, Baurecht & Erträge</b>.
      Baue Landes-Strukturen (nur mit <b>Einfluss im Land</b> — Top 3), halte Rang 1 — Rang 2 & 3 zahlen dir sogar Steuer. Kaffee-Imperialismus, charmant.<br>
      <span class="cc-rw-hl">🏛️ Erbauer-Dividende:</span> Wer in einem Land baut, kassiert jede Woche
      automatisch <b>15 % seiner Baukosten</b> zurück — zusätzlich zum Rang-Ertrag und
      <b>egal, ob der Rang gehalten oder verloren geht</b>. Einmal gebaut, zahlt sich's dauerhaft aus.<br>
      <span class="cc-rw-hl">🏦 Stille Anlage:</span> Willst du Ertrag <b>ohne PvP</b>? Leg CC in einem Land an
      (Länder-Menü) — du bekommst einen <b>Anteil am Gebäude-Einkommen des Landes</b> (mehr Kapital = mehr Anteil,
      bis 20 % bei 1.250 CC), <b>täglich passiv</b> und <b>ohne Rang-Einfluss</b>. Länder ohne Gebäude werfen nichts ab.
      <b>Auszahlen</b> geht jederzeit — 20 % gehen dabei als Entschädigung an die Erbauer des Landes.`)}
    ${sec('⚔️', 'Kaffee-Krieger — Dungeon, Ausrüstung & Kämpfe', `
      Eigener Imperium-Reiter „⚔️ Krieger": Erkunde dein <b>persönliches Felsenlabyrinth</b> — die
      täglichen Schritte wachsen mit deiner Krieger-Stufe. Auf neu betretenen Feldern warten
      <b>kleine Funde</b> (🪙 1–8 CC, sofort gutgeschrieben) oder <b>Gegner</b>.
      <span class="cc-rw-hl">Gegner-Felder verschwinden NICHT</span> nach einem Kampf — komm mit
      besserer Ausrüstung jederzeit zurück und versuch's erneut.<br>
      <span class="cc-rw-hl">Kämpfe laufen automatisch</span> (kein Klick-Skill): deine Werte
      (ATK/DEF/CRIT aus Waffe/Rüstung/Talisman) treten gegen den Gegner an. <b>Sieg</b> bringt CC + EP,
      <b>Niederlage</b> kostet nichts außer etwas Trost-EP — verlieren darf man hier ruhig.<br>
      <span class="cc-rw-hl">4 Kulturen</span> (Mittelalterlich, Europäisch, Orientalisch,
      Südamerikanisch) mit Einsteiger- und veredelter Profi-Ausrüstung. Trägst du alle 3 Slots
      derselben Kultur, aktiviert sich ein <b>Set-Bonus</b> (Schadensschild, mehr CC, mehr CRIT
      oder mehr EP). Am Kartenrand wartet <b>Der Espresso-Drache 🐉</b> — die Höhle bleibt bis
      <b>Stufe 80</b> versiegelt, danach 1× pro Woche bezwingbar.`)}
    ${sec('💰', 'Gruppenkasse & Stufen', `
      Zahl freiwillig in die <b>Gruppenkasse</b> ein — gemeinsam erreicht ihr 5 Kassen-Stufen,
      die neue Ziele & dauerhafte Perks für <i>alle</i> freischalten (Dividende, Spar-Zins …).<br>
      <span class="cc-rw-hl">🎗️ Wohltäter:</span> Der größte Einzahler trägt sichtbar die Krone.
      Jeder steuert <b>5 % seines Tageseinkommens</b> als Tagesabgabe bei (ab 18 Uhr).
      Wöchentliche Gruppen-Challenges geben's allen zurück.`)}
    ${sec('📅', 'Tägliche Belohnungen', `
      <b>Willkommensbonus</b> für Neue (+50 CC), <b>Login-Bonus</b>, der mit deiner Login-Serie wächst,
      und <b>persönliche Tagesaufgaben</b> (Latte trinken, Kollegen Kaffee schenken …) für extra CC.
      Reine Ehrensache — die Gruppe schaut zu. 😇`)}
    ${sec('🚩', 'Die dunkle Seite: Koffein-Polizei & Wochenende', `
      Mehr als <b>6 Tassen an einem Tag</b>? Am nächsten Tag drosselt dich die Koffein-Polizei auf 3 —
      plus eine kleine Strafe in die Gruppenkasse (und einen frechen Spruch im Chat).<br>
      <span class="cc-rw-hl">Wochenend-Abgabe:</span> Wer Sa/So grinden will, spendet den Tassen-Ertrag
      an die Kasse. Work-Life-Balance-Polizei grüßt. Karten-Pannen wandern ebenfalls in die Kasse.`)}
    ${sec('🎗️', 'Titel & Ruhm', `
      Dein Titel wächst mit den Tassen, dazu kommen <b>Zusatztitel</b> aus Cosmetics.
      Die <b>Hall of Fame</b> und der druckbare <b>Poster</b> verewigen die Champions in vielen Kategorien —
      Vermögen, Karte, Gebäude, Forschung, Schätze, Welt. Ruhm hält länger als Crema.`)}
    </div>
    <div class="cc-rw-foot">Noch Fragen? Trink einen Kaffee. Kommt von allein. ☕</div>`;
  host.appendChild(wrap);
}

// Zusatztitel (aus Cosmetics) als Suffix für die Titel-Anzeige — leer wenn keiner aktiv.
function _zusatztitelSuffix(u) {
  const ztId = u.cosmetics?.zusatztitel;
  if (!ztId || typeof ZUSATZTITEL === 'undefined') return '';
  const ztDef = (ZUSATZTITEL || []).find(z => z.id === ztId);
  return ztDef ? ` · ${ztDef.icon} ${ztDef.name}` : '';
}

// ── Profil-Untertabs (Tagesstatistik / CIQ / Achievements+Tagesaufgabe+Sprüche) ──────
// Reiner Anzeige-Toggle — der Inhalt aller 3 Panels wird bei jedem renderProfile()
// unabhängig vom aktiven Tab neu befüllt (siehe renderCiqPerks/renderDailyTask/
// renderSprueche), hier wird nur ein-/ausgeblendet.
function switchProfileSubtab(name) {
  document.querySelectorAll('#profile-subtabs [data-profile-subtab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.profileSubtab === name));
  ['stats', 'ciq', 'achievements'].forEach(t =>
    document.getElementById(`profile-subtab-${t}`)?.classList.toggle('hidden', t !== name));
}

// ── Profil ────────────────────────────────────────────────────────────────────
function renderProfile() {
  const u = currentUserData;
  if (!u) return;
  const profAv = document.querySelector('#view-profil .profile-avatar');
  if (profAv) profAv.textContent = u.cosmetics?.avatar || '☕';
  document.getElementById('profile-name').textContent   = u.name;
  document.getElementById('profile-title').textContent  = DB.getTitle(u.totalCups);
  document.getElementById('profile-cups').textContent   = u.totalCups;
  document.getElementById('profile-streak').textContent = u.currentStreak;
  const totalBeans = Math.min(Math.floor(u.totalCups / 10), 100);
  document.getElementById('beans-container').innerHTML  = Array.from({ length: totalBeans }, () => '<span class="bean">🫘</span>').join('');
  const tiers = [50,100,250,500,750,1000,1500,2500,5000];
  const next  = tiers.find(t => t > u.totalCups);
  if (next) {
    document.getElementById('next-tier-bar').style.width = `${Math.round((u.totalCups / next) * 100)}%`;
    document.getElementById('next-tier-label').textContent = `${u.totalCups} / ${next} Tassen`;
  } else {
    document.getElementById('next-tier-bar').style.width = '100%';
    document.getElementById('next-tier-label').textContent = 'Maximaler Rang erreicht!';
  }
  const logSection = document.getElementById('today-log-section');
  const logList    = document.getElementById('today-log-list');
  if (logSection && logList) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const log = (u.map_data?.todayLog?.date === todayKey) ? (u.map_data.todayLog.entries || []) : [];
    if (log.length) {
      logSection.style.display = '';
      logList.innerHTML = log.slice().reverse().map(e => {
        const neg = e.amount < 0;
        return `
        <div class="today-log-row">
          <span class="today-log-label">${_esc(e.label)}</span>
          <span class="today-log-amount"${neg ? ' style="color:#e0795a"' : ''}>${neg ? '' : '+'}${_fmtCoins(e.amount)} CC</span>
        </div>${e.detail ? `<div class="today-log-detail">${_esc(e.detail)}</div>` : ''}`;
      }).join('');
    } else {
      logSection.style.display = 'none';
      logList.innerHTML = '';
    }
  }

  renderDailyTask(u);
  renderCiqPerks(u);

  document.getElementById('achievements-grid').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="achievement-card ${u.achievements?.[a.id] ? 'unlocked' : 'locked'}" title="${_esc(a.desc)}">
      <div class="ach-icon-sm">${a.icon}</div>
      <div class="ach-name-sm">${_esc(a.name)}</div>
    </div>`).join('');
  const seasonId = DB.getSeasonId();
  document.getElementById('season-cups').textContent = (u.seasonCups || {})[seasonId] || 0;
  const rank = leaderboardData.findIndex(x => x.id === currentUser.id) + 1;
  document.getElementById('season-rank').textContent = rank || '—';
  if (typeof Quiz !== 'undefined') Quiz.renderProfileSection(u);
}

// ✨ Kaffee-Aufgabe der Tage (rotiert alle 3 Tage). Wird dynamisch ins Profil injiziert
// (kein index.html-Edit) — landet im Untertab "🏆 Achievements" (voran der Achievements-
// Grid, siehe Profil-Untertabs), zusammen mit Achievements + Sprüche. Einlösen ist
// Goodwill — Kontrolle liegt in der Gruppe.
function renderDailyTask(u) {
  if (typeof currentDailyTask !== 'function') return;
  const { period, task } = currentDailyTask(undefined, u.id); // persönliche Aufgabe je Mitglied
  const periodKey = 'p' + period;
  let sec = document.getElementById('daily-task-section');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'daily-task-section';
    sec.className = 'progress-section';
    const tab = document.getElementById('profile-subtab-achievements');
    if (tab) tab.insertBefore(sec, tab.firstChild);
    else return; // Profil-DOM (noch) nicht da
  }
  const claimed = !!(u.map_data?.taskClaims?.[periodKey]);
  sec.innerHTML = `
    <div class="section-title">✨ Kaffee-Aufgabe der Tage</div>
    <div class="daily-task-card${claimed ? ' done' : ''}">
      <div class="dt-icon">${task.icon}</div>
      <div class="dt-body">
        <div class="dt-text">${_esc(task.text)}</div>
        <div class="dt-meta">Belohnung: +${task.reward} CC · 🤝 Ehrensache, Kontrolle in der Gruppe</div>
      </div>
      ${claimed
        ? '<span class="dt-done">✓ erledigt</span>'
        : '<button class="btn-primary dt-btn" id="dt-claim">Erledigt – einlösen</button>'}
    </div>`;
  if (!claimed) {
    const btn = document.getElementById('dt-claim');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await DB.claimDailyTask(currentUser.id, periodKey, task.id, task.reward);
        if (r?.ok) {
          await refreshData();
          showToast(`✨ +${r.reward} CC – Aufgabe erfüllt!`, 'success');
          renderProfile();
        } else if (r?.already) {
          showToast('Diese Aufgabe ist für die laufende Periode schon erledigt.', 'info');
          renderProfile();
        } else {
          showToast('Konnte nicht einlösen.', 'error'); btn.disabled = false;
        }
      } catch (e) { showToast(e.message, 'error'); btn.disabled = false; }
    };
  }
}

// 🧠 CIQ-Fähigkeiten — dynamisch ins Profil injiziert (kein index.html-Edit), landet im
// eigenen Untertab "🧠 CIQ" (siehe Profil-Untertabs).
// CIQ (cosmetics.quiz.ciq) ist die Schwelle, bezahlt wird mit CC. Plan: plans/2026-06-26-ciq-faehigkeiten-plan.md
function renderCiqPerks(u) {
  if (typeof CIQ_PERKS === 'undefined') return;
  const cosm = u.cosmetics || {};
  const ciq  = (typeof ciqGetCiq === 'function') ? ciqGetCiq(cosm) : 0;
  const perks = cosm.ciq_perks || {};
  const now  = Date.now();
  // Voraussetzungs-Check (nur was in Phase A relevant ist)
  const incomeBuildings = Object.values(u.map_data?.buildings || {}).filter(b => b && (b.completesAt || 0) <= now).length;
  const condMet = (def) => {
    if (def.id === 'grossroester' || def.id === 'bautraeger_lizenz') return incomeBuildings >= 1;
    if (def.id === 'handelsattache') return !!(u.research && u.research.welthandelslizenz);
    return true;
  };

  let sec = document.getElementById('ciq-perks-section');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'ciq-perks-section';
    sec.className = 'progress-section';
    const tab = document.getElementById('profile-subtab-ciq');
    if (tab) tab.appendChild(sec);
    else return;
  }

  // 🧠 Eigene aktive Debuffs (von ANDEREN auferlegt) — sichtbar machen, sonst merkt
  // das Opfer nie, dass z.B. die Tagesabgabe gerade doppelt ist.
  const myDebuffs = (u.map_data?.ciq_debuffs || []).filter(d => d && new Date(d.expires_at).getTime() > now);
  const debuffHint = myDebuffs.length ? `
    <div class="ciq-debuff-warning">⚠️ Aktive Debuffs gegen dich: ${myDebuffs.map(d => {
      const def = (typeof ciqDef === 'function') ? ciqDef(d.type) : null;
      const hrs = Math.max(1, Math.round((new Date(d.expires_at).getTime() - now) / 3600000));
      return `${def?.icon || '⚠️'} ${_esc(def?.name || d.type)} (noch ~${hrs} h)`;
    }).join(' · ')}</div>` : '';

  // 🎯 Angriffs-Reihenfolge sichtbar machen (User-Wunsch: die Ziel-Auswahl "rutscht"
  // durchs 12h-Opfer-Schutzschild, ohne diese Liste war völlig unklar, wer gerade
  // dran/geschützt ist — wer zuerst angreift, bekommt oft die größere Beute).
  const queue = (typeof ciqAttackQueue === 'function') ? ciqAttackQueue(appData?.users, u.id, now) : [];
  const queueHtml = queue.length ? `
    <div class="ciq-debuff-warning" style="background:rgba(212,170,55,.08);border-color:rgba(212,170,55,.35)">
      <div style="font-weight:700;margin-bottom:4px">🎯 Angriffs-Reihenfolge (Rangliste)</div>
      <div style="color:var(--muted);font-size:.72rem;margin-bottom:8px">Angriffe treffen immer den höchstplatzierten NICHT geschützten Spieler. Wer zuerst angreift, trifft entsprechend oft die größere Beute — Getroffene sind 12h geschützt und rutschen aus der Reihe, der/die Nächste rückt nach.</div>
      ${queue.map((t, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border-radius:6px;font-size:.82rem;${t.shieldedUntil
          ? 'opacity:.55'
          : 'background:rgba(212,170,55,.14);border:1px solid rgba(212,170,55,.4)'}">
          <span style="font-weight:700;color:${t.shieldedUntil ? 'var(--muted)' : 'var(--cream)'}">#${i + 1} ${_esc(t.name)}</span>
          <span style="font-weight:700;color:${t.shieldedUntil ? 'var(--muted)' : 'var(--gold)'}">${t.shieldedUntil
            ? `🛡️ geschützt noch ~${Math.max(1, Math.round((t.shieldedUntil - now) / 3600000))} h`
            : '⚔️ angreifbar'}</span>
        </div>`).join('')}
    </div>` : '';

  // Karte für einen einzelnen Perk bauen — wird unten für "🧠 Fähigkeiten" (Selbst-Buffs)
  // und "⚔️ Angriffe & Debuffs" (PvP) getrennt aufgerufen (User-Wunsch: Fähigkeiten und
  // Angriffe im CIQ-Tab unterteilen statt einer gemischten Liste).
  const renderCiqCard = (def) => {
    const isPvp   = def.type === 'attack' || def.type === 'debuff';
    const owned   = !isPvp && !!perks[def.id]?.at;
    const timed   = def.type === 'timed';
    const active  = timed && perks[def.id]?.active_until && new Date(perks[def.id].active_until).getTime() > now;
    const reachable = ciq >= (def.ciq || 0);
    const ok      = condMet(def);
    const cooldownUntil = isPvp && typeof ciqAttackCooldownUntil === 'function'
      ? ciqAttackCooldownUntil(u.map_data, def.id) : null;
    let stateCls = 'locked', actionHtml = '';
    if (def.pending) {
      stateCls = 'pending';
      actionHtml = `<span class="ciq-state ciq-soon">🔜 bald verfügbar</span>`;
    } else if (owned) {
      stateCls = 'owned';
      actionHtml = `<span class="ciq-state ciq-on">✓ dauerhaft aktiv</span>`;
    } else if (active) {
      stateCls = 'owned';
      const until = new Date(perks[def.id].active_until);
      const hrs = Math.max(1, Math.round((until.getTime() - now) / 3600000));
      actionHtml = `<span class="ciq-state ciq-on">⏳ aktiv – noch ~${hrs} h</span>`;
    } else if (cooldownUntil) {
      const hrs = Math.max(1, Math.round((cooldownUntil - now) / 3600000));
      actionHtml = `<span class="ciq-state ciq-lock">⏳ Cooldown noch ~${hrs} h</span>`;
    } else if (!reachable) {
      actionHtml = `<span class="ciq-state ciq-lock">🔒 ab CIQ ${def.ciq}</span>`;
    } else if (!ok) {
      actionHtml = `<span class="ciq-state ciq-lock">🔒 ${_esc(def.condText || 'Voraussetzung fehlt')}</span>`;
    } else if (isPvp) {
      stateCls = 'buyable';
      actionHtml = `<button class="btn-primary ciq-attack" data-perk="${def.id}">${def.type === 'attack' ? 'Angreifen' : 'Auslösen'} · ${def.cc} 🫘</button>`;
    } else {
      stateCls = 'buyable';
      actionHtml = `<button class="btn-primary ciq-buy" data-perk="${def.id}">Kaufen · ${def.cc} 🫘</button>`;
    }
    const meta = [];
    if (isPvp) meta.push(def.type === 'attack' ? '⚔️ Sofort' : `🩹 ${def.durationH} h Debuff`);
    else if (timed) meta.push(`⏱️ ${def.durationH >= 24 ? (def.durationH / 24) + ' Tage' : def.durationH + ' h'}`);
    else meta.push('♾️ dauerhaft');
    meta.push(`🧠 CIQ ${def.ciq}`);
    // Informant zeigt sein Ergebnis nicht hier im Profil, sondern in der Statistik —
    // ohne diesen Hinweis wirkt der Kauf wie ein Blindkauf (Fundstelle sonst unklar).
    const locHint = def.id === 'informant'
      ? `<div class="ciq-hint" style="color:var(--muted);font-size:.72rem;margin-top:3px">📍 Ergebnis erscheint unter 📊 Statistik → 💰 Gehalt.</div>`
      : '';
    // Live-Beschreibung MIT eingesetztem Ziel-Namen statt der abstrakten "Rangliste-
    // Erster/Top 3"-Formulierung — die Ziel-Auswahl "rutscht" durchs 12h-Opfer-
    // Schutzschild ständig weiter, ohne konkreten Namen war kaum nachvollziehbar,
    // WER gerade getroffen würde.
    const liveDesc = (isPvp && typeof ciqPerkDesc === 'function')
      ? ciqPerkDesc(def, appData?.users, u.id)
      : def.desc;
    return `
      <div class="ciq-card ciq-${stateCls}${isPvp ? ' ciq-pvp' : ''}">
        <div class="ciq-head"><span class="ciq-icon">${def.tier} ${def.icon}</span>
          <span class="ciq-name">${_esc(def.name)}</span></div>
        <div class="ciq-desc">${_esc(liveDesc)}</div>
        ${locHint}
        <div class="ciq-foot"><span class="ciq-meta">${meta.join(' · ')}</span>${actionHtml}</div>
      </div>`;
  };
  const buffCards   = CIQ_PERKS.filter(d => d.type !== 'attack' && d.type !== 'debuff').map(renderCiqCard).join('');
  const attackCards = CIQ_PERKS.filter(d => d.type === 'attack' || d.type === 'debuff').map(renderCiqCard).join('');

  sec.innerHTML = `
    <div class="section-title">🧠 CIQ <span class="ciq-score">Dein Kaffee-IQ: ${Math.floor(ciq)}</span></div>
    <div class="ciq-intro">Wer klug ist, soll's auch spüren. Quiz-Wissen (CIQ) schaltet Fähigkeiten frei — bezahlt wird mit 🫘. CIQ sinkt nie.</div>
    ${debuffHint}

    <div class="section-title" style="margin-top:14px">🧠 Fähigkeiten</div>
    <button class="ciq-toggle-btn" onclick="this.classList.toggle('open');this.nextElementSibling.style.display=this.classList.contains('open')?'':'none'">
      Fähigkeiten anzeigen <span class="ciq-toggle-arrow">▸</span>
    </button>
    <div class="ciq-grid" style="display:none">${buffCards}</div>

    <div class="section-title" style="margin-top:14px">⚔️ Angriffe &amp; Debuffs</div>
    <div class="ciq-intro">Frisch getroffene Spieler sind 12h vor weiteren Angriffen geschützt — die Ziel-Auswahl rutscht dann automatisch weiter.</div>
    ${queueHtml}
    <button class="ciq-toggle-btn" onclick="this.classList.toggle('open');this.nextElementSibling.style.display=this.classList.contains('open')?'':'none'">
      Angriffe anzeigen <span class="ciq-toggle-arrow">▸</span>
    </button>
    <div class="ciq-grid" style="display:none">${attackCards}</div>`;

  sec.querySelectorAll('.ciq-buy').forEach(btn => {
    btn.onclick = async () => {
      const perkId = btn.dataset.perk;
      const def = CIQ_PERKS.find(p => p.id === perkId);
      btn.disabled = true;
      try {
        const r = await DB.buyCiqPerk(currentUser.id, perkId);
        if (r?.ok) {
          await refreshData();
          // Informant zeigt sein Ergebnis nicht am Kauf-Ort (Profil), sondern in der Statistik —
          // ohne diesen Hinweis direkt bei der Aktion wirkt der Kauf wie er nichts bewirkt hätte.
          const locSuffix = perkId === 'informant' ? ' Bericht steht unter 📊 Statistik → 💰 Gehalt.' : '';
          showToast(`🧠 „${def?.name || 'Fähigkeit'}" freigeschaltet!${locSuffix}`, 'success');
          renderProfile();
        } else {
          const msg = {
            not_enough_ciq: `Dafür brauchst du CIQ ${def?.ciq}. Trink weniger, lern mehr. 🧠`,
            not_enough_cc:  'Nicht genug CoffeeCoins.',
            already_owned:  'Hast du schon dauerhaft.',
            already_active: 'Läuft gerade noch – erst ablaufen lassen.',
            pending:        'Diese Fähigkeit kommt bald.',
          }[r?.error] || 'Konnte nicht freischalten.';
          showToast(msg, r?.error === 'not_enough_cc' ? 'error' : 'info');
          btn.disabled = false;
        }
      } catch (e) { showToast(e.message, 'error'); btn.disabled = false; }
    };
  });

  // 🧠 Angriffs-/Debuff-Perks: serverseitige RPC, Ziel wird automatisch bestimmt
  // (kein Auswahl-Dialog — siehe PLAN_ciq_angriffe.md §5 "Kein Opfer wählen").
  sec.querySelectorAll('.ciq-attack').forEach(btn => {
    btn.onclick = async () => {
      const perkId = btn.dataset.perk;
      const def = CIQ_PERKS.find(p => p.id === perkId);
      btn.disabled = true; btn.textContent = '⏳';
      try {
        const r = await DB.applyCiqAttack(currentUser.id, perkId);
        if (r?.ok) {
          await refreshData();
          const gained = r.cc_gained > 0 ? ` (+${r.cc_gained} 🫘)` : '';
          showToast(`✓ ${def?.name || 'Angriff'} gegen ${r.target_name || 'Ziel'}${gained}`, 'success');
          if (r.broadcast_msg) { try { await DB.postMessage(r.broadcast_msg, 'CIQ-Labor'); } catch (e) {} }
        } else {
          const msg = {
            not_enough_ciq:    `Dafür brauchst du CIQ ${def?.ciq}. Trink weniger, lern mehr. 🧠`,
            insufficient_coins:'Nicht genug CoffeeCoins.',
            cooldown:          'Dieser Angriff braucht noch Pause — erst Cooldown abwarten.',
            no_target:         'Gerade kein gültiges Ziel in der Gruppe (zu wenig Mitspieler).',
            no_yield:          `Bei ${r?.target_name || 'dem Ziel'} gab es gerade nichts zu holen.`,
            unknown_perk:      'Unbekannte Fähigkeit.',
          }[r?.error] || 'Konnte nicht ausgeführt werden.';
          showToast(msg, r?.error === 'insufficient_coins' ? 'error' : 'info');
          btn.disabled = false;
        }
      } catch (e) { showToast(e.message, 'error'); btn.disabled = false; }
      finally { renderProfile(); }
    };
  });
}

// ── Auswertung ────────────────────────────────────────────────────────────────
const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const COLORS  = ['#d4aa37','#4e9af1','#e06c75','#98c379','#c678dd','#e5c07b','#56b6c2','#abb2bf','#be5046','#61afef'];

let auswPeriod = 'monat';
let auswOffset = 0;

function getPeriodInfo() {
  const now = new Date();
  if (auswPeriod === 'monat') {
    const d = new Date(now.getFullYear(), now.getMonth() + auswOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONATE[d.getMonth()]} ${d.getFullYear()}` };
  }
  if (auswPeriod === 'quartal') {
    const baseQ = Math.floor(now.getMonth() / 3);
    const totalQ = baseQ + auswOffset;
    const year  = now.getFullYear() + Math.floor(totalQ / 4);
    const q     = ((totalQ % 4) + 4) % 4;
    return { year, q: q + 1, label: `Q${q + 1} ${year}`, months: [q*3+1, q*3+2, q*3+3] };
  }
  return { year: now.getFullYear() + auswOffset, label: String(now.getFullYear() + auswOffset) };
}

function chartOptions(indexAxis = 'x') {
  return { responsive: true, maintainAspectRatio: false, indexAxis,
    plugins: { legend: { labels: { color: '#c0b090', boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#8a7a5a', font: { size: 10 } }, grid: { color: '#2a2010' } },
      y: { ticks: { color: '#8a7a5a', font: { size: 10 } }, grid: { color: '#2a2010' } }
    }
  };
}

async function renderStats() {
  if (!appData) return;
  if (auswPeriod === 'gehalt') {
    document.getElementById('btn-period-prev').disabled = true;
    document.getElementById('btn-period-next').disabled = true;
    renderGehalt();
    return;
  }
  const info = getPeriodInfo();
  document.getElementById('period-label').textContent = info.label;
  document.getElementById('btn-period-prev').disabled = false;
  document.getElementById('btn-period-next').disabled = auswOffset >= 0;

  if (auswPeriod === 'monat') await renderMonat(info);
  else if (auswPeriod === 'quartal') renderQuartal(info);
  else renderJahr(info);
}

// 🕵️ Informant-Kompaktzeile: EIN Steckbrief über alle Spielsysteme hinweg — Forschung, Weltkarte,
// Pixel-Karte/Gebäude, Schätze, Kaffee-Krieger. Das ist genau das, was man sich sonst mühsam selbst
// aus Statistik/Weltkarte/Karte/Krieger-Tab zusammensuchen müsste. Wiederverwendet ausschließlich
// bestehende Helfer (_cc*-Familie aus der Hall-of-Fame-Logik, kriegerProgress aus krieger.js) —
// keine neue Datenquelle, nur neu zusammengestellt. Künftige Minigames (Garten/Spähung/Café/
// Logistik, siehe plans/PLAN_erlebnis_minigames.md) sollen hier je EINE weitere Zeile ergänzen,
// sobald sie existieren.
function _informantStatsHtml(u) {
  const items = [];

  const rTotal = (typeof getAllResearchItems === 'function') ? getAllResearchItems().length : 0;
  const rOwned = (typeof getAllResearchItems === 'function')
    ? getAllResearchItems().filter(i => (u.research || {})[i.id]).length : 0;
  const rScore = (typeof calcResearchScore === 'function') ? calcResearchScore(u.research || {}) : 0;
  items.push(`🔬 Forschung: ${rOwned}/${rTotal} Items · ${_fmtCoins(rScore)} Score`);

  const worldInv = (typeof _ccWorldInvested === 'function') ? _ccWorldInvested(u) : 0;
  const gov       = (typeof _ccGovernments === 'function') ? _ccGovernments(u) : 0;
  if (worldInv > 0 || gov > 0) items.push(`🌍 Weltkarte: ${_fmtCoins(worldInv)} CC investiert · ${gov} Regierung${gov === 1 ? '' : 'en'}`);

  // 🤝 Weltbündnisse: 'handel' ist länderbezogen (zählt, wenn u GERADE eines der beiden
  // Bündnis-Länder regiert — nicht nur beim Erst-Unterzeichner), 'frieden'/'schutz' bleiben
  // personenbezogen. Braucht appData.worldAlliances + das eigene Länder-Rangprofil von u.
  if (typeof _allianceSummaryForUser === 'function' && typeof worldRanksForMember === 'function') {
    const uRankMap = worldRanksForMember(appData?.worldInvestments, u.id).rankMap;
    const as = _allianceSummaryForUser(u.id, appData?.worldAlliances, uRankMap);
    const parts = [];
    if (as.handel > 0)     parts.push(`${as.handel}× 🤝`);
    if (as.friedenPay > 0) parts.push(`${as.friedenPay}× 🕊️ zahlt`);
    if (as.friedenGet > 0) parts.push(`${as.friedenGet}× 🕊️ erhält`);
    if (as.schutz > 0)     parts.push(`${as.schutz}× 🛡️`);
    if (parts.length) items.push(`🤝 Bündnisse: ${parts.join(' · ')}`);
  }

  const bldCount  = (typeof _ccBldCount === 'function') ? _ccBldCount(u) : 0;
  const explored  = (typeof _ccExploredPct === 'function') ? _ccExploredPct(u) : 0;
  if (bldCount > 0 || explored > 0) items.push(`🗺️ Karte: ${bldCount} Gebäude · ${explored}% erkundet`);

  const treasures   = (typeof _ccTreasures === 'function') ? _ccTreasures(u) : 0;
  const treasureCc  = (typeof _ccTreasureCc === 'function') ? _ccTreasureCc(u) : 0;
  if (treasures > 0) items.push(`💎 Schätze: ${treasures} gefunden · ${_fmtCoins(treasureCc)} CC`);

  const dd = u.dungeon_data || {};
  if ((dd.level || 1) > 1 || (dd.wins || 0) > 0 || (dd.losses || 0) > 0) {
    const prog = (typeof kriegerProgress === 'function') ? kriegerProgress(dd) : { level: dd.level || 1 };
    // totalCcEarned wird server-seitig in dungeon_fight() mitgeführt (siehe
    // migration_kaffee_krieger.sql) — ohne dieses Feld gäbe es keine Lifetime-Summe,
    // nur flüchtige Einzelkampf-Ergebnisse.
    const dGold = dd.totalCcEarned || 0;
    items.push(`⚔️ Krieger: Stufe ${prog.level} · ${dd.wins || 0}S/${dd.losses || 0}N · ${_fmtCoins(dGold)} CC insgesamt`);
  }

  // CIQ-Gesamtbild: Punktestand (Quiz), kumulierte CC aus Quiz-Runden UND aus CIQ-Angriffen,
  // plus welche Angriffs-/Debuff-Fähigkeiten der aktuelle CIQ-Stand freischaltet (Bedrohungs-
  // Einschätzung — Angriffs-Perks sind kein Dauerbesitz, sondern ab genug CIQ jederzeit nutzbar).
  // quizCC: cosmetics.quiz.history speichert pro Periode nur den Score, CC wird daraus abgeleitet
  // (aktueller Satz 4 CC/Punkt, seit Quiz-Einführung unverändert). ciqCcEarned: map_data-Feld,
  // serverseitig in apply_ciq_attack() mitgeführt (migration_2026-07-02_garde_level2_ciq_tracking.sql).
  const quiz = u.cosmetics?.quiz || {};
  const quizCiq   = quiz.ciq || 0;
  const quizCC    = Object.values(quiz.history || {}).reduce((s, h) => s + (h.score || 0) * 4, 0);
  const ciqEarned = u.map_data?.ciqCcEarned || 0;
  const ciqLost   = u.map_data?.ciqCcLost   || 0;
  const ciqSkills = (typeof CIQ_PERKS !== 'undefined')
    ? CIQ_PERKS.filter(p => (p.type === 'attack' || p.type === 'debuff') && quizCiq >= p.ciq).map(p => p.icon).join(' ')
    : '';
  if (quizCiq > 0 || quizCC > 0 || ciqEarned > 0 || ciqLost > 0) {
    items.push(`🧠 CIQ: ${quizCiq} Punkte · ${_fmtCoins(quizCC)} CC aus Quiz · ${_fmtCoins(ciqEarned)} CC aus Angriffen erbeutet${ciqLost > 0 ? ` · ${_fmtCoins(ciqLost)} CC durch Angriffe verloren` : ''}${ciqSkills ? ' · Fähigkeiten: ' + ciqSkills : ''}`);
  }

  if (!items.length) return '';
  return `<div class="cc-informant-stats" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0">
    ${items.map(t => `<span style="background:rgba(255,255,255,.05);border-radius:6px;padding:2px 7px;font-size:.72rem;color:var(--muted)">${t}</span>`).join('')}
  </div>`;
}

// 🧠 Welche CIQ-Vorteile (dauerhafte Perks + gerade aktive Selbst-Buffs) ein Spieler hat/nutzt —
// PvP-Angriffs-/Debuff-Perks bewusst ausgeschlossen (das sind Aktionen gegen andere, keine
// "gehaltenen" Vorteile). Rein aus bereits geladenen Daten (u.cosmetics.ciq_perks) + CIQ_PERKS-
// Definitionen (research.js) — kein neuer Datenzugriff.
function _informantCiqPerksHtml(u) {
  if (typeof CIQ_PERKS === 'undefined') return '';
  const perks = u.cosmetics?.ciq_perks || {};
  const now = Date.now();
  const active = CIQ_PERKS
    .filter(def => def.type === 'permanent' || def.type === 'timed')
    .map(def => {
      const e = perks[def.id];
      if (!e) return null;
      if (def.type === 'permanent') return e.at ? `${def.icon} ${def.name}` : null;
      if (!e.active_until || new Date(e.active_until).getTime() <= now) return null;
      const hrs = Math.max(1, Math.round((new Date(e.active_until).getTime() - now) / 3600000));
      return `${def.icon} ${def.name} (noch ~${hrs}h)`;
    })
    .filter(Boolean);
  if (!active.length) return '';
  return `<div style="margin:2px 0 4px;font-size:.72rem;color:var(--muted)">🧠 CIQ-Vorteile: ${active.join(' · ')}</div>`;
}

// 🕵️ Informant (CIQ-Perk): solange aktiv, zeigt die Gehaltsstatistik zusätzlich einen VOLLEN
// Steckbrief ALLER Gruppenmitglieder — nicht nur die nackten Guthaben-Summen, die man als Top 5
// ohnehin schon in der Chart-Tabelle darüber sieht. Zwei Ebenen pro Spieler: (1) die System-
// übergreifende Kompaktzeile aus _informantStatsHtml() (Forschung/Weltkarte/Karte/Schätze/Krieger),
// (2) die bestehende _buildPassivBreakdown() aus imperium.js für die Einzelaufschlüsselung des
// Passiv-Einkommens (Forschungs-Items/Kombos/Gebäude einzeln + Multiplikatoren). Alle nötigen
// Rohdaten sind client-seitig ohnehin schon geladen (RLS erlaubt gruppenweiten Lesezugriff) —
// Informant schaltet nur die ANZEIGE frei, holt nichts vom Server nach.
function _informantPanelHtml() {
  const cosm = currentUserData?.cosmetics || {};
  if (typeof ciqActive !== 'function' || !ciqActive(cosm, 'informant', Date.now())) return '';
  const until = cosm.ciq_perks?.informant?.active_until;
  const untilTxt = until ? new Date(until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  const rows = (appData.users || []).slice()
    .sort((a, b) => (b.coins || 0) - (a.coins || 0))
    .map(u => {
      const hist = u.map_data?.salaryHistory || [];
      const last = hist.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)).pop() || {};
      const perCup = (typeof calcResearchPerCup === 'function') ? calcResearchPerCup(u.research || {}) : 0;
      const stats = _informantStatsHtml(u);
      const ciqPerks = _informantCiqPerksHtml(u);
      const breakdown = (typeof _buildPassivBreakdown === 'function') ? _buildPassivBreakdown(u) : '';
      return `
        <div class="cc-informant-row" style="border-bottom:1px solid var(--gold-dim);padding:8px 2px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
            <strong>${_esc(u.name)}</strong>
            <span style="color:var(--muted);font-size:.78rem">🪙 ${_fmtCoins(u.coins || 0)} · 💰 ${last.day ?? '–'}/Tag realisiert · ☕ +${_fmtCoins(perCup)}/Tasse</span>
          </div>
          ${stats}
          ${ciqPerks}
          ${breakdown || '<p class="empty-hint" style="margin:4px 0 0;font-size:.75rem">Keine laufenden Forschungs-/Gebäude-Einnahmen.</p>'}
        </div>`;
    }).join('');
  return `
    <div class="section-title" style="margin-top:16px">🕵️ Informant — Geheimdienst-Bericht
      <span style="color:var(--muted);font-weight:400;font-size:.72rem">(noch bis ${untilTxt} Uhr)</span></div>
    <div class="cc-informant-list">${rows}</div>`;
}

// 💰 Einkommens-Verlauf der Top-5-Mitglieder (Liniendiagramm). Zeigt das realisierte
// GESAMT-Tageseinkommen (alle Quellen: Tassen, Schätze, Forschung, Welt, Login, Aufgaben),
// solange dafür Snapshot-Daten (gross) vorliegen — sonst Fallback auf passives Tagesgehalt.
// Datenquelle = map_data.salaryHistory (5h-Snapshot, baut sich ab Einführung auf).
function renderGehalt() {
  document.getElementById('period-label').textContent = 'Gehalts-Entwicklung';
  const top5 = leaderboardData.slice(0, 5);
  const histOf = u => ((appData.users.find(x => x.id === u.id) || u).map_data?.salaryHistory) || [];
  const tsOf   = h => h.ts || (h.d ? new Date(h.d + 'T00:00:00').getTime() : 0);
  const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };

  // Realisiertes Einkommen heute (gesamt) — live aus dem Tages-Log jedes Mitglieds.
  const todayKey = new Date().toISOString().slice(0, 10);
  const grossToday = u => {
    const tl = (appData.users.find(x => x.id === u.id) || u).map_data?.todayLog;
    if (!tl || tl.date !== todayKey) return 0;
    return Math.round((tl.entries || []).reduce((s, e) => s + (e.amount > 0 ? e.amount : 0), 0) * 100) / 100;
  };

  // Metrik: realisiertes Gesamteinkommen (gross), wenn irgendwo vorhanden — sonst passiv (day).
  const hasGross = top5.some(u => histOf(u).some(h => h.gross != null));
  const metric   = hasGross ? 'gross' : 'day';
  document.getElementById('chart-main-title').textContent =
    hasGross ? '💰 Einkommen/Tag (gesamt) – Verlauf' : '💰 Tages-Gehalt (passiv) – Verlauf';

  // Tagesweise gruppieren → je Tag der höchste Wert (bei gross = Tagesendstand, da kumulativ).
  const daySet = new Set();
  top5.forEach(u => histOf(u).forEach(h => { const t = tsOf(h); if (t) daySet.add(dayKey(t)); }));
  const days = [...daySet].sort();

  if (!days.length) {
    if (charts.main) { charts.main.destroy(); charts.main = null; }
    document.getElementById('period-summary').innerHTML =
      '<p style="color:var(--muted);padding:18px;text-align:center">📈 Noch keine Gehaltsdaten vorhanden.<br>Der Verlauf baut sich ab jetzt alle 5 Stunden auf — schau später wieder vorbei!</p>'
      + _informantPanelHtml();
    return;
  }

  const datasets = top5.map((u, i) => {
    const m = {};
    histOf(u).forEach(h => {
      const t = tsOf(h); if (!t) return;
      const v = h[metric]; if (v == null) return;
      const k = dayKey(t); m[k] = Math.max(k in m ? m[k] : -Infinity, v);
    });
    return {
      label: u.name,
      data: days.map(k => (k in m ? m[k] : null)),
      spanGaps: true, borderColor: COLORS[i], backgroundColor: COLORS[i] + '33',
      borderWidth: 2, tension: 0.25, pointRadius: 2, fill: false
    };
  });
  const labels = days.map(k => { const p = k.split('-'); return p[2] + '.' + p[1]; });
  if (charts.main) charts.main.destroy();
  charts.main = new Chart(document.getElementById('chart-main').getContext('2d'), {
    type: 'line', data: { labels, datasets }, options: chartOptions()
  });

  document.getElementById('period-summary').innerHTML = `
    <table><thead><tr><th>Name</th><th>📈 Heute gesamt</th><th>💰 /Tag passiv</th><th>☕ /Tasse</th><th>🪙 Guthaben</th></tr></thead><tbody>
    ${top5.map(u => {
      const sorted = histOf(u).slice().sort((a, b) => tsOf(a) - tsOf(b));
      const last = sorted[sorted.length - 1] || {};
      const gt = grossToday(u);
      return `<tr class="${u.id === currentUser?.id ? 'winner-row' : ''}"><td>${_esc(u.name)}</td><td>${gt > 0 ? _fmtCoins(gt) : '–'}</td><td>${last.day ?? '–'}</td><td>${last.cup ?? '–'}</td><td>${last.coins ?? '–'}</td></tr>`;
    }).join('')}
    </tbody></table>
    <p style="color:var(--muted);font-size:.72rem;padding:6px 4px 0">📈 „Heute gesamt" = alle heute realisierten CC (Tassen, Schätze, Forschung, Welt, Login, Aufgaben). Der Verlauf zeigt das Gesamteinkommen pro Tag, sobald genug Snapshots vorliegen.</p>
    ${_informantPanelHtml()}`;
}

async function renderMonat(info) {
  document.getElementById('chart-main-title').textContent = `☕ Tassen täglich – ${info.label}`;
  const rows = await DB.fetchMonthStats(info.year, info.month);
  const daysInMonth = new Date(info.year, info.month, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  const top5   = leaderboardData.slice(0, 5);
  const datasets = top5.map((u, i) => ({
    label: u.name,
    data: labels.map((_, di) => {
      const date = `${info.year}-${String(info.month).padStart(2,'0')}-${String(di+1).padStart(2,'0')}`;
      const row  = rows.find(r => r.date === date);
      return (row?.stats?.[u.id]) || 0;
    }),
    backgroundColor: COLORS[i] + '99', borderColor: COLORS[i], borderWidth: 1
  }));
  if (charts.main) charts.main.destroy();
  charts.main = new Chart(document.getElementById('chart-main').getContext('2d'), {
    type: 'bar', data: { labels, datasets },
    options: { ...chartOptions(), scales: { x: { stacked: true, ticks: { color: '#8a7a5a', font: { size: 9 } }, grid: { color: '#2a2010' } }, y: { stacked: true, ticks: { color: '#8a7a5a' }, grid: { color: '#2a2010' } } }, plugins: { legend: { labels: { color: '#c0b090', boxWidth: 10, font: { size: 10 } } } }, responsive: true, maintainAspectRatio: false }
  });
  const total = rows.reduce((s, r) => s + (r.total || 0), 0);
  const activeDays = rows.filter(r => r.total > 0).length;
  document.getElementById('period-summary').innerHTML = `
    <table><thead><tr><th>Name</th><th>Tassen</th><th>Ø/Tag</th></tr></thead><tbody>
    ${top5.map(u => {
      const cups = rows.reduce((s, r) => s + ((r.stats?.[u.id]) || 0), 0);
      return `<tr class="${u.id === currentUser?.id ? 'winner-row' : ''}"><td>${_esc(u.name)}</td><td>${cups}</td><td>${activeDays ? (cups/activeDays).toFixed(1) : '0'}</td></tr>`;
    }).join('')}
    <tr style="border-top:1px solid var(--gold-dim)"><td style="color:var(--muted)">Gesamt</td><td style="color:var(--gold);font-weight:700">${total}</td><td style="color:var(--muted)">${activeDays} aktive Tage</td></tr>
    </tbody></table>`;
}

function renderQuartal(info) {
  document.getElementById('chart-main-title').textContent = `📊 Tassen pro Monat – Q${info.q} ${info.year}`;
  const labels   = info.months.map(m => MONATE[m-1].slice(0,3));
  const top5     = leaderboardData.slice(0, 5);
  const datasets = top5.map((u, i) => ({
    label: u.name,
    data: info.months.map(m => {
      const sid = `${info.year}-${String(m).padStart(2,'0')}`;
      return (u.seasonCups || {})[sid] || 0;
    }),
    backgroundColor: COLORS[i] + '99', borderColor: COLORS[i], borderWidth: 1
  }));
  if (charts.main) charts.main.destroy();
  charts.main = new Chart(document.getElementById('chart-main').getContext('2d'), {
    type: 'bar', data: { labels, datasets }, options: chartOptions()
  });
  const seasons = (appData?.seasons || []).filter(s => info.months.includes(parseInt(s.season_id?.slice(5))));
  document.getElementById('period-summary').innerHTML = `
    <table><thead><tr><th>Monat</th><th>Sieger</th><th>Tassen</th></tr></thead><tbody>
    ${info.months.map(m => {
      const sid = `${info.year}-${String(m).padStart(2,'0')}`;
      const s   = seasons.find(x => x.season_id === sid);
      const winnerNames = (s?.winner_name || '').split(' & ').map(n => n.trim());
      return `<tr ${winnerNames.includes(currentUser?.name) ? 'class="winner-row"' : ''}><td>${MONATE[m-1]}</td><td>${_esc(s?.winner_name || '–')}</td><td>${s?.winner_cups || '–'}</td></tr>`;
    }).join('')}
    </tbody></table>`;
}

function renderJahr(info) {
  document.getElementById('chart-main-title').textContent = `🗓 Jahresübersicht ${info.year}`;
  const labels   = MONATE.map(m => m.slice(0,3));
  const top5     = leaderboardData.slice(0, 5);
  const datasets = top5.map((u, i) => ({
    label: u.name,
    data: Array.from({ length: 12 }, (_, mi) => {
      const sid = `${info.year}-${String(mi+1).padStart(2,'0')}`;
      return (u.seasonCups || {})[sid] || 0;
    }),
    backgroundColor: COLORS[i] + '99', borderColor: COLORS[i], borderWidth: 1
  }));
  if (charts.main) charts.main.destroy();
  charts.main = new Chart(document.getElementById('chart-main').getContext('2d'), {
    type: 'bar', data: { labels, datasets }, options: chartOptions()
  });
  const seasons = (appData?.seasons || []).filter(s => s.season_id?.startsWith(String(info.year)));
  const yearTotal = top5.map(u => ({
    name: u.name, id: u.id,
    cups: Array.from({length:12},(_,mi) => (u.seasonCups||{})[`${info.year}-${String(mi+1).padStart(2,'0')}`]||0).reduce((a,b)=>a+b,0),
    wins: seasons.filter(s => (s.winner_name || '').split(' & ').map(n => n.trim()).includes(u.name)).length
  })).sort((a,b) => b.cups - a.cups);
  document.getElementById('period-summary').innerHTML = `
    <table><thead><tr><th>Name</th><th>Tassen ${info.year}</th><th>Monatssiege</th></tr></thead><tbody>
    ${yearTotal.map((u,i) => `<tr class="${u.id===currentUser?.id?'winner-row':''} ${i===0?'winner-row':''}"><td>${i===0?'🏆 ':''} ${_esc(u.name)}</td><td>${u.cups}</td><td>${u.wins>0?'🥇'.repeat(u.wins):'-'}</td></tr>`).join('')}
    </tbody></table>`;
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────
// ── Imperium-Kennzahlen (geteilt von Hall of Fame + Poster) ─────────────────────
function _ccBldScore(u) {
  let s = 0;
  for (const b of Object.values(u.map_data?.buildings || {})) {
    const def = (typeof karteBuildingDef === 'function') ? karteBuildingDef(b.type) : null;
    if (def) s += def.cost || 0;
  }
  return s;
}
function _ccBldCount(u) {
  const now = Date.now();
  return Object.values(u.map_data?.buildings || {}).filter(b => b.completesAt <= now).length;
}
function _ccResearchScore(u) {
  return (typeof calcResearchScore === 'function') ? calcResearchScore(u.research || {}) : 0;
}
function _ccWealth(u) {
  return Math.round((u.coins || 0) + _ccResearchScore(u) + _ccBldScore(u));
}
function _ccTreasures(u) { return Object.keys(u.map_data?.treasures || {}).length; }
// Lifetime-CC-Summe aus Kartenschätzen — map_data.totalTreasureCc, mitgeführt seit 2026-07-02
// (Schätze davor zählen nicht rückwirkend nach, da es diese Summe vorher nicht gab).
function _ccTreasureCc(u) { return u.map_data?.totalTreasureCc || 0; }
function _ccExploredPct(u) {
  const WORLD = (typeof KARTE_WORLD !== 'undefined') ? KARTE_WORLD : 128;
  const n = Object.keys(u.map_data?.explored || {}).length;
  return Math.round(n / (WORLD * WORLD) * 1000) / 10;
}
function _ccCosmCount(u) {
  const c = u.cosmetics || {};
  let n = 0;
  n += (c.seasonThemes || []).length;
  n += (c.trophies || []).length;
  n += Object.keys(c.boughtAvatars || {}).length;
  n += Object.keys(c.boughtTitel || {}).length;
  if (c.theme && c.theme !== 'default') n += 1;
  if (c.avatar && c.avatar !== '☕')     n += 1;
  if (c.zusatztitel)                     n += 1;
  if (c.cafeName)                        n += 1;
  if (c.jahresChampion)                  n += 1;
  return n;
}
function _ccWorldInvested(u) {
  return (typeof worldInvestedTotal === 'function') ? worldInvestedTotal(appData?.worldInvestments, u.id) : 0;
}
function _ccGovernments(u) {
  return (typeof worldGovernments === 'function') ? worldGovernments(appData?.worldInvestments, u.id) : 0;
}
// Aktuell führender Spieler für eine Metrik (Live-Snapshot, kein persistierter Rekord)
function _ccLeader(users, fn) {
  let best = null, bestVal = -1;
  for (const u of (users || [])) {
    const v = fn(u) || 0;
    if (v > bestVal) { bestVal = v; best = u; }
  }
  return (best && bestVal > 0) ? { val: bestVal, name: best.name } : { val: null, name: null };
}

function renderHallOfFame() {
  const hof   = appData?.halloffame || {};
  const users = appData?.users || [];

  const wl = _ccLeader(users, _ccWealth);
  const el = _ccLeader(users, _ccExploredPct);
  const bl = _ccLeader(users, _ccBldCount);
  const rl = _ccLeader(users, _ccResearchScore);
  const tl = _ccLeader(users, _ccTreasures);
  const cl = _ccLeader(users, _ccCosmCount);
  const il = _ccLeader(users, _ccWorldInvested);
  const gl = _ccLeader(users, _ccGovernments);
  const ql = _ccLeader(users, u => u.cosmetics?.quiz?.ciq || 0);

  const cards = [
    { icon: '☕', label: 'Meiste Tassen',      val: hof.max_cups_value,       name: hof.max_cups_name },
    { icon: '🔥', label: 'Längste Serie',       val: hof.longest_streak_value, name: hof.longest_streak_name },
    { icon: '🏆', label: 'Meiste Monatssiege', val: hof.most_wins_value,       name: hof.most_wins_name },
    { icon: '💰', label: 'Größtes Vermögen',   val: wl.val != null ? `${wl.val.toLocaleString('de-DE')} CC` : null, name: wl.name },
    { icon: '🗺️', label: 'Karte erkundet',     val: el.val != null ? `${el.val}%` : null, name: el.name },
    { icon: '🏗️', label: 'Meiste Gebäude',     val: bl.val, name: bl.name },
    { icon: '🔬', label: 'Top-Forschung',      val: rl.val != null ? `${rl.val.toLocaleString('de-DE')} CC` : null, name: rl.name },
    { icon: '✦', label: 'Meiste Schätze',      val: tl.val, name: tl.name },
    { icon: '🎨', label: 'Meiste Cosmetics',   val: cl.val, name: cl.name },
    { icon: '🧠', label: 'Höchster Kaffee-IQ', val: ql.val != null ? `${ql.val} CIQ` : null, name: ql.name },
    { icon: '🌍', label: 'Größter Weltinvestor', val: il.val != null ? `${il.val.toLocaleString('de-DE')} CC` : null, name: il.name },
    { icon: '🏛️', label: 'Meiste Regierungen', val: gl.val, name: gl.name },
  ];

  document.getElementById('hof-container').innerHTML = cards.map(r => `
    <div class="hof-card">
      <div class="hof-icon">${r.icon}</div>
      <div class="hof-label">${r.label}</div>
      <div class="hof-value">${r.val ?? '—'}</div>
      <div class="hof-name">${_esc(r.name ?? '—')}</div>
    </div>`).join('');
}

// ── Saisons ───────────────────────────────────────────────────────────────────
function renderSeasons() {
  const seasons = DB.getSeasons(appData || { seasons: [] });
  document.getElementById('seasons-container').innerHTML = seasons.map(s => `
    <div class="season-card ${s.is_active ? 'season-active' : ''}">
      <div class="season-name">${_esc(s.name)} ${s.is_active ? '<span class="badge-active">AKTIV</span>' : ''}</div>
      <div class="season-dates">${s.start_date} – ${s.end_date}</div>
      <div class="season-winner">${s.winner_name ? `🏆 ${_esc(s.winner_name)} (${s.winner_cups} Tassen)` : 'Noch kein Sieger'}</div>
    </div>`).join('') || '<p class="empty-hint">Noch keine Saisons.</p>';
  if (typeof Quiz !== 'undefined') Quiz.renderSeasonsSection();
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function renderAdmin() {
  if (!currentUserData?.isAdmin) { switchView('rangliste'); return; }
  const group = AUTH.getGroup();
  document.getElementById('admin-group-name').textContent = group?.name || '—';
  document.getElementById('admin-user-list').innerHTML =
    leaderboardData.map(u => `
      <div class="admin-user-row">
        <span>${_esc(u.name)}</span>
        <span>Beitritt: ${u.joinDate}</span>
        <span>${u.totalCups} ☕</span>
        <span>${u.isAdmin ? '👑 Admin' : 'Teilnehmer'}</span>
      </div>`).join('') || '<p class="empty-hint">Keine Teilnehmer.</p>';
}

async function adminCloseSeason() {
  const seasonId = DB.getSeasonId();
  if (!confirm(`Saison "${seasonId}" wirklich abschließen?`)) return;
  try {
    const result = await DB.closeSeason(seasonId);
    await refreshData();
    renderAdmin();
    if (activeView === 'rangliste') renderLeaderboard();

    if (!result?.winner) {
      showToast('Saison abgeschlossen — kein aktiver Teilnehmer.', 'info');
      return;
    }

    // Ranglisten-Text für alle platzierten Spieler bauen (Gleichstand = gleicher Rang)
    const CC_BY_RANK = [50, 20, 10];
    const CC_PART    = 5;
    let rank = 0;
    const lines = result.standings.map((m, i) => {
      if (i > 0 && m.sc !== result.standings[i - 1].sc) rank = i;
      const cc    = CC_BY_RANK[rank] ?? CC_PART;
      const medal = ['🥇','🥈','🥉'][rank] || `${rank + 1}.`;
      return `${medal} ${m.name} — ${m.sc} Tassen (+${cc.toLocaleString('de-DE')} CC)`;
    }).join('\n');

    const themeMsg = result.themeId
      ? `\n🎨 Gewinner erhält Theme: ${result.themeId}`
      : '';

    const championNames = (result.winners || [result.winner]).map(w => w.name).join(' & ');

    alert(
      `☕ Saison ${seasonId} abgeschlossen!\n\n` +
      `🏆 Champion: ${championNames} (${result.winner.sc} Tassen)\n\n` +
      `Endstand:\n${lines}${themeMsg}`
    );
  } catch (e) { showToast(e.message, 'error'); }
}

async function adminResetData() {
  const group = AUTH.getGroup();
  if (!confirm(`ACHTUNG: Alle Daten der Gruppe "${group?.name}" werden gelöscht. Wirklich?`)) return;
  if (!confirm('Wirklich sicher? Das kann nicht rückgängig gemacht werden!')) return;
  try {
    const { createClient } = window.supabase;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await sb.from('entries').delete().eq('group_id', group.id);
    await sb.from('daily_stats').delete().eq('group_id', group.id);
    await sb.from('seasons').delete().eq('group_id', group.id);
    await sb.from('hall_of_fame').delete().eq('group_id', group.id);
    await sb.from('group_treasury').delete().eq('group_id', group.id);
    await sb.from('members').delete().eq('group_id', group.id);
    AUTH.clearAll();
    showToast('Alle Daten zurückgesetzt', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) { showToast(e.message, 'error'); }
}

// ── QR ────────────────────────────────────────────────────────────────────────
function renderQR() {
  const container = document.getElementById('qr-container');
  container.innerHTML = '';
  new QRCode(container, {
    text: window.location.href.split('?')[0],
    width: 256, height: 256,
    colorDark: '#1a0a00', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  document.getElementById('qr-url').textContent = '☕ Zur Coffee Champion App';
}

// ── Poster Generator ──────────────────────────────────────────────────────────
function renderPoster() {
  if (!appData || !leaderboardData.length) { showToast('Noch keine Daten für das Poster', 'error'); return; }
  const lb  = leaderboardData.slice(0, 15);
  const now = new Date();
  const monate = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const dateStr = `${monate[now.getMonth()]} ${now.getFullYear()}`;
  const tiers = [
    {cups:50,title:'Bohnenanwärter',icon:'🌱'},{cups:100,title:'Filtermeister',icon:'☕'},
    {cups:200,title:'Espresso-Ritter',icon:'⚔️'},{cups:350,title:'Koffein-Kommandant',icon:'🎖️'},
    {cups:500,title:'Bohnenkönig',icon:'👑'},{cups:750,title:'Kaffee-Legende',icon:'🏆'},
    {cups:1000,title:'Kaiser des Koffeins',icon:'⚡'},
  ];
  const rows = lb.map((u, i) => {
    const rank = i + 1;
    const badge = rank===1?`<span class="badge gold">1</span>`:rank===2?`<span class="badge silver">2</span>`:rank===3?`<span class="badge bronze">3</span>`:`<span class="rn">${rank}</span>`;
    return `<tr class="${rank<=3?'top3':''}"><td class="r-rank">${badge}</td><td class="r-name">${_esc(u.name)}</td><td class="r-cups">${'☕'.repeat(Math.min(Math.floor(u.totalCups/50),10))||'·'} <b>${u.totalCups}</b></td><td class="r-title">${_esc(DB.getTitle(u.totalCups))}</td></tr>`;
  }).join('');
  const milestones = tiers.map(t => { const n=leaderboardData.filter(u=>u.totalCups>=t.cups).length; return `<div class="ms ${n>0?'reached':''}"><div class="ms-cups">${t.cups}</div><div class="ms-icon">${t.icon}</div><div class="ms-info"><div class="ms-title">${t.title}</div><div class="ms-n">${n} erreicht</div></div></div>`; }).join('');
  const wallRows = lb.map(u => { const f=Math.min(Math.floor(u.totalCups/10),10); const cells=Array.from({length:10},(_,i)=>`<span class="bc ${i<f?'on':'off'}">🫘</span>`).join(''); const extra=u.totalCups>100?`<span class="extra">+${u.totalCups-100}</span>`:''; return `<tr><td class="wn">${_esc(u.name)}</td><td class="wb">${cells}${extra}</td><td class="wc">${u.totalCups}</td></tr>`; }).join('');
  // Imperium-Champions (gleiche Kennzahlen wie die Hall of Fame)
  const impCats = [
    { icon:'💰', label:'Vermögen',  L:_ccLeader(leaderboardData, _ccWealth),         fmt:v=>`${v.toLocaleString('de-DE')} CC` },
    { icon:'🗺️', label:'Karte',     L:_ccLeader(leaderboardData, _ccExploredPct),    fmt:v=>`${v}%` },
    { icon:'🏗️', label:'Gebäude',   L:_ccLeader(leaderboardData, _ccBldCount),       fmt:v=>`${v}` },
    { icon:'🔬', label:'Forschung', L:_ccLeader(leaderboardData, _ccResearchScore),  fmt:v=>`${v.toLocaleString('de-DE')} CC` },
    { icon:'✦', label:'Schätze',   L:_ccLeader(leaderboardData, _ccTreasures),      fmt:v=>`${v}` },
    { icon:'🎨', label:'Cosmetics', L:_ccLeader(leaderboardData, _ccCosmCount),      fmt:v=>`${v}` },
    { icon:'🌍', label:'Weltinvestor', L:_ccLeader(leaderboardData, _ccWorldInvested), fmt:v=>`${v.toLocaleString('de-DE')} CC` },
    { icon:'🏛️', label:'Regierungen', L:_ccLeader(leaderboardData, _ccGovernments),    fmt:v=>`${v}` },
  ];
  const hasImp = impCats.some(c => c.L.val != null);
  const impCards = impCats.map(c => `<div class="imp-card"><div class="imp-ic">${c.icon}</div><div class="imp-lbl">${c.label}</div><div class="imp-val">${c.L.val!=null?c.fmt(c.L.val):'—'}</div><div class="imp-nm">${_esc(c.L.name||'—')}</div></div>`).join('');
  const impSection = hasImp ? `<div class="imp"><div class="wall-hdr"><h2>🏛️ IMPERIUM-CHAMPIONS</h2><p>Vermögen · Karte · Gebäude · Forschung · Schätze · Style · Welt · Regierungen</p></div><div class="imp-grid">${impCards}</div></div>` : '';
  const group = AUTH.getGroup();
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Coffee Championship – ${dateStr}</title><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d0b08;color:#f2ead8;font-family:'Inter',sans-serif;font-size:13px;padding:16px}.poster{max-width:960px;margin:0 auto;border:2px solid #d4aa37;border-radius:10px;overflow:hidden;background:#0d0b08}.hdr{background:linear-gradient(180deg,#1e1810 0%,#0d0b08 100%);border-bottom:2px solid #d4aa37;padding:20px 28px;display:flex;align-items:center;justify-content:space-between}.hdr-trophy{font-size:2.8rem;filter:drop-shadow(0 0 14px #d4aa3799)}.hdr-center{text-align:center;flex:1}.hdr h1{font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;color:#d4aa37;letter-spacing:6px;text-shadow:0 0 30px #d4aa3799}.hdr-sub{color:#8a7a5a;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;margin-top:5px}.hdr-badge{text-align:center;background:#d4aa3715;border:1px solid #d4aa3755;border-radius:8px;padding:8px 16px}.hdr-badge .bl{color:#8a7a5a;font-size:0.6rem;letter-spacing:1px;text-transform:uppercase}.hdr-badge .bv{color:#d4aa37;font-size:0.9rem;font-weight:700;margin-top:2px}.body{display:flex}.lb{flex:1;padding:18px 22px;border-right:1px solid #2a2010}.sec-title{font-family:'Orbitron',sans-serif;color:#d4aa37;font-size:0.65rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid #2a2010}table{width:100%;border-collapse:collapse}td,th{padding:6px 5px;vertical-align:middle}th{color:#8a7a5a;font-size:0.65rem;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #2a2010}tr{border-bottom:1px solid #1a1408}tr.top3 td{background:#1a1408}.r-rank{width:34px;text-align:center}.r-name{font-weight:600;color:#f2ead8}.r-cups{color:#d4aa37;font-size:0.82rem;white-space:nowrap}.r-title{color:#8a7a5a;font-size:0.72rem;text-align:right}.badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-weight:900;font-size:0.75rem}.gold{background:#d4aa37;color:#0d0b08}.silver{background:#a8a8a8;color:#0d0b08}.bronze{background:#cd7f32;color:#0d0b08}.rn{color:#8a7a5a;font-size:0.82rem;display:inline-block;width:22px;text-align:center}.ms-col{width:190px;padding:18px 14px}.ms{display:flex;align-items:center;gap:8px;background:#1c160d;border:1px solid #2a2010;border-radius:5px;padding:7px 9px;margin-bottom:7px;opacity:.35}.ms.reached{opacity:1;border-color:#d4aa37;background:#1e1808}.ms-cups{font-family:'Orbitron',sans-serif;color:#d4aa37;font-size:0.85rem;font-weight:700;min-width:34px}.ms-icon{font-size:1rem}.ms-title{color:#f2ead8;font-size:0.7rem}.ms-n{color:#8a7a5a;font-size:0.62rem;margin-top:2px}.wall{border-top:2px solid #2a2010;background:#141008;padding:18px 22px}.wall-hdr{text-align:center;margin-bottom:14px}.wall-hdr h2{font-family:'Orbitron',sans-serif;color:#d4aa37;font-size:1rem;letter-spacing:4px;text-shadow:0 0 16px #d4aa3766}.wall-hdr p{color:#8a7a5a;font-size:0.65rem;letter-spacing:2px;text-transform:uppercase;margin-top:4px}.wn{width:110px;font-weight:600;font-size:0.82rem}.bc{margin:1px;display:inline-block}.bc.off{opacity:.1;filter:grayscale(1)}.bc.on{filter:drop-shadow(0 0 2px #d4aa3788)}.extra{color:#d4aa37;font-size:0.75rem;font-weight:700;margin-left:6px}.wc{width:50px;text-align:right;color:#d4aa37;font-weight:700;font-size:0.82rem}.ftr{border-top:1px solid #2a2010;background:#0a0804;padding:12px 28px;display:flex;align-items:center;justify-content:space-between}.motto{font-family:'Orbitron',sans-serif;color:#d4aa37;font-size:0.62rem;letter-spacing:3px;text-transform:uppercase}.pbtn{background:#d4aa37;color:#0d0b08;border:none;padding:8px 22px;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem;font-family:'Inter',sans-serif}.imp{border-top:2px solid #2a2010;background:#0f0c08;padding:18px 22px}.imp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.imp-card{background:#1c160d;border:1px solid #2a2010;border-radius:6px;padding:10px 8px;text-align:center}.imp-ic{font-size:1.2rem}.imp-lbl{color:#8a7a5a;font-size:0.58rem;letter-spacing:1px;text-transform:uppercase;margin-top:3px}.imp-val{font-family:'Orbitron',sans-serif;color:#d4aa37;font-size:0.85rem;font-weight:700;margin-top:3px}.imp-nm{color:#f2ead8;font-size:0.68rem;margin-top:2px}@media print{body{background:#0d0b08!important;padding:0}.poster{border:none;border-radius:0;max-width:100%}.pbtn{display:none}@page{size:A3 landscape;margin:8mm}}</style></head><body><div class="poster"><div class="hdr"><div class="hdr-trophy">🏆</div><div class="hdr-center"><h1>COFFEE CHAMPIONSHIP</h1><div class="hdr-sub">⚡ ${_esc(group?.name || 'Euer Team')} ⚡</div></div><div class="hdr-badge"><div class="bl">Saison</div><div class="bv">${dateStr}</div></div></div><div class="body"><div class="lb"><div class="sec-title">⚡ Rangliste</div><table><thead><tr><th>#</th><th>Name</th><th>☕ Tassen</th><th style="text-align:right">Titel</th></tr></thead><tbody>${rows}</tbody></table></div><div class="ms-col"><div class="sec-title">Meilensteine</div>${milestones}</div></div><div class="wall"><div class="wall-hdr"><h2>⚡ WALL OF CAFFEINE ⚡</h2><p>Jeder Schluck zählt · 1 Bohne = 10 Tassen</p></div><table><thead><tr><th style="text-align:left">Name</th><th>Fortschritt</th><th style="text-align:right">Tassen</th></tr></thead><tbody>${wallRows}</tbody></table></div>${impSection}<div class="ftr"><div class="motto">⚡ Mehr Kaffee · Mehr Power · Mehr wir ⚡</div><button class="pbtn" onclick="window.print()">🖨 Drucken</button></div></div></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { showToast('Popup blockiert — bitte Popups erlauben', 'error'); return; }
  win.document.write(html); win.document.close();
}

// ── App laden ─────────────────────────────────────────────────────────────────
async function loadAndShowApp() {
  try {
    appData = await DB.fetchData();
  } catch (e) {
    document.getElementById('loading-screen').innerHTML = `<div class="setup-guide"><h2>Verbindungsfehler</h2><p>${_esc(e.message)}</p></div>`;
    return;
  }
  leaderboardData = DB.getLeaderboard(appData);
  const stored = AUTH.getCurrentUser();
  if (stored) {
    const userInData = appData.users.find(u => u.id === stored.id);
    if (userInData) {
      currentUser = { id: stored.id, name: stored.name };
      currentUserData = userInData;
      showApp(); return;
    }
  }
  showNamePicker(leaderboardData);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  DB.init();

  // Event Listener
  document.getElementById('tab-create-btn').addEventListener('click', () => switchGroupTab('create'));
  document.getElementById('tab-join-btn').addEventListener('click',   () => switchGroupTab('join'));
  document.getElementById('btn-create').addEventListener('click', createGroup);
  document.getElementById('btn-join').addEventListener('click',   joinGroup);
  document.getElementById('create-pass').addEventListener('keydown', e => { if (e.key==='Enter') createGroup(); });
  document.getElementById('join-pass').addEventListener('keydown',   e => { if (e.key==='Enter') joinGroup(); });
  document.getElementById('btn-register').addEventListener('click', registerNewUser);
  document.getElementById('new-name-input').addEventListener('keydown', e => { if (e.key==='Enter') registerNewUser(); });
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => quickAdd(parseInt(btn.dataset.quick))));
  document.getElementById('btn-custom-add').addEventListener('click', customAdd);
  document.getElementById('custom-cups-input').addEventListener('keydown', e => { if (e.key==='Enter') customAdd(); });
  document.getElementById('btn-profile-add').addEventListener('click', profileAddCups);
  document.getElementById('profile-cups-input').addEventListener('keydown', e => { if (e.key==='Enter') profileAddCups(); });
  document.querySelectorAll('#profile-subtabs [data-profile-subtab]').forEach(btn =>
    btn.addEventListener('click', () => switchProfileSubtab(btn.dataset.profileSubtab)));
  document.getElementById('btn-refresh')?.addEventListener('click', async () => { await refreshData(); showToast('Aktualisiert', 'info'); });
  document.getElementById('btn-pinnwand-post').addEventListener('click', () => postPinnwand(document.getElementById('pinnwand-input').value));
  document.getElementById('pinnwand-input').addEventListener('keydown', e => { if (e.key === 'Enter') postPinnwand(e.target.value); });
  document.getElementById('btn-pinnwand-clear').addEventListener('click', clearPinnwand);
  document.querySelectorAll('#view-rangliste .preset-btn').forEach(btn => btn.addEventListener('click', () => postPinnwand(btn.dataset.msg)));
  document.querySelectorAll('#view-nachrichten .preset-btn').forEach(btn => btn.addEventListener('click', () => sendMessage(btn.dataset.msg)));
  document.getElementById('btn-msg-send').addEventListener('click', () => sendMessage(document.getElementById('msg-input').value));
  document.getElementById('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(e.target.value); });
  document.getElementById('btn-admin-close-season')?.addEventListener('click', adminCloseSeason);
  document.querySelectorAll('.period-btn').forEach(btn => btn.addEventListener('click', () => {
    auswPeriod = btn.dataset.period; auswOffset = 0;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderStats();
  }));
  document.getElementById('btn-period-prev')?.addEventListener('click', () => { auswOffset--; renderStats(); });
  document.getElementById('btn-period-next')?.addEventListener('click', () => { if (auswOffset < 0) { auswOffset++; renderStats(); } });
  document.getElementById('btn-admin-reset')?.addEventListener('click', adminResetData);
  document.getElementById('btn-poster')?.addEventListener('click', renderPoster);
  document.getElementById('btn-logout').addEventListener('click', () => {
    AUTH.clearCurrentUser();
    clearInterval(pollInterval); pollInterval = null;
    currentUser = null; currentUserData = null;
    location.reload();
  });
  document.getElementById('btn-leave-group')?.addEventListener('click', () => {
    if (confirm('Gruppe verlassen? Du kannst jederzeit wieder beitreten.')) {
      AUTH.clearAll(); location.reload();
    }
  });

  // Gespeicherte Gruppe prüfen
  const savedGroup = AUTH.getGroup();
  if (!savedGroup) { hide('loading-screen'); showGroupScreen(); return; }
  DB.setGroup(savedGroup.id);
  await loadAndShowApp();
});
