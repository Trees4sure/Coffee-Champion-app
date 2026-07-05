// ============================================================================
// 🤝 Kaffee-Kredit — Peer-to-Peer-Kredit innerhalb der Gruppe (Client-Modul)
//
// Ein Spieler stellt eine Kreditanfrage (Ziel ≤ 500 CC). Mitspieler zahlen CC ein
// (mehrere Geber möglich) → der Betrag geht SOFORT an den Schuldner. Der Schuldner
// tilgt automatisch mit 25 % jedes Gehalts-Einkommens (Tassen + Passiv), bis Kredit
// + 20 % Zins getilgt sind; die Geber bekommen Einsatz + Zins anteilig zurück.
// Vorzeitige Abschlagszahlung jederzeit möglich.
//
// Alle Geld-Bewegungen laufen atomar server-seitig (migration_2026-07-12_kredit.sql).
// Dieses Modul ist reine UI: es liest loans/loan_contributions und ruft die RPC-Wrapper
// in db.js. Es wird als Sektion in den Profil-Untertab „📊 Tagesstatistik" injiziert
// (kein index.html-Edit, analog renderVermoegen). Nutzt app.js-Globals: currentUser,
// currentUserData, DB, showToast, refreshData, _esc, _fmtCoins.
//
// Konstanten MÜSSEN zu migration_2026-07-12_kredit.sql passen.
// ============================================================================
const Loans = (() => {
  const LOAN_MAX = 500, LOAN_MIN = 25, LOAN_RATE = 1.20, LOAN_SHARE = 0.25;
  const fmt = n => (typeof _fmtCoins === 'function') ? _fmtCoins(n) : Math.round(n).toLocaleString('de-DE');
  const esc = s => (typeof _esc === 'function') ? _esc(s) : String(s ?? '');
  // Schuldner-/Geber-Namen aus dem bereits geladenen appData auflösen (kein DB-Join nötig).
  const nameOf = id => (typeof appData !== 'undefined' ? (appData?.users || []).find(u => u.id === id)?.name : null) || '?';

  const ERR = {
    bad_target: `Betrag muss zwischen ${LOAN_MIN} und ${LOAN_MAX} CC liegen.`,
    bad_amount: 'Ungültiger Betrag.',
    active_loan_exists: 'Du hast bereits eine offene Kreditanfrage.',
    not_open: 'Diese Anfrage ist nicht mehr offen.',
    not_found: 'Anfrage nicht gefunden.',
    own_loan: 'Du kannst deine eigene Anfrage nicht finanzieren.',
    fully_funded: 'Diese Anfrage ist bereits voll finanziert.',
    not_enough_cc: 'Nicht genug CoffeeCoins!',
    already_funded: 'Anfrage ist schon (teil-)finanziert und lässt sich nicht mehr zurückziehen.',
    no_active_loan: 'Kein aktiver Kredit.',
    nothing_to_pay: 'Nichts zu tilgen.',
    not_owner: 'Das ist nicht deine Anfrage.',
  };
  const errMsg = e => ERR[e] || ('Fehler: ' + e);

  function _updateHeaderCoins() {
    const hc = document.getElementById('header-coins');
    if (hc && currentUserData?.coins != null) {
      hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(currentUserData.coins)}`;
    }
  }

  // Nach jeder Geld-Aktion: Daten neu ziehen (Header/Coins aktuell), Vermögens-Box
  // (loanDebt/loanClaim → Gesamtvermögen) und die Kredit-Sektion neu rendern.
  async function _afterAction() {
    try { await refreshData(); } catch (e) {}
    _updateHeaderCoins();
    if (typeof renderVermoegen === 'function' && currentUserData) { try { renderVermoegen(currentUserData); } catch (e) {} }
    renderSection();
  }

  function _myLoanHtml(myLoan) {
    if (myLoan) {
      const funded = +myLoan.funded || 0, due = +myLoan.due || 0, repaid = +myLoan.repaid || 0;
      const remaining = Math.max(0, due - repaid);
      const pct = due > 0 ? Math.min(100, Math.round(repaid / due * 100)) : 0;
      const canCancel = funded <= 0;
      return `
        <div class="loan-card loan-mine">
          <div class="loan-card-head">📄 Meine Kreditanfrage
            <span class="loan-badge">${funded >= myLoan.target ? 'voll finanziert' : 'offen'}</span></div>
          <div class="loan-line">Erhalten: <b>${fmt(funded)}</b> / ${fmt(myLoan.target)} CC &nbsp;·&nbsp; Schuld (inkl. 20 % Zins): <b>${fmt(due)}</b> CC</div>
          ${funded > 0 ? `
            <div class="loan-bar"><div class="loan-bar-fill" style="width:${pct}%"></div></div>
            <div class="loan-line">Getilgt: ${fmt(repaid)} CC &nbsp;·&nbsp; offen: <b>${fmt(remaining)}</b> CC &nbsp;<span class="loan-muted">(25 % jedes Einkommens tilgen automatisch)</span></div>
            <div class="loan-actions">
              <input type="number" class="loan-input" id="loan-repay-amount" min="1" step="1" placeholder="Betrag" />
              <button class="loan-btn" id="loan-repay-btn">Abschlag zahlen</button>
              <button class="loan-btn loan-btn-ghost" id="loan-repay-all-btn">Alles tilgen</button>
            </div>` : `
            <div class="loan-line loan-muted">Noch niemand hat eingezahlt.</div>
            ${canCancel ? `<div class="loan-actions"><button class="loan-btn loan-btn-ghost" id="loan-cancel-btn">Anfrage zurückziehen</button></div>` : ''}`}
        </div>`;
    }
    // Keine aktive Anfrage → Formular.
    return `
      <div class="loan-card">
        <div class="loan-card-head">🙋 Kredit anfragen</div>
        <div class="loan-line loan-muted">Betrag ${LOAN_MIN}–${LOAN_MAX} CC. Mitspieler zahlen ein, du bekommst es sofort und tilgst mit 25 % jedes Einkommens (Kredit + 20 % Zins).</div>
        <div class="loan-actions">
          <input type="number" class="loan-input" id="loan-request-amount" min="${LOAN_MIN}" max="${LOAN_MAX}" step="1" placeholder="z. B. 300" />
          <button class="loan-btn" id="loan-request-btn">Anfrage stellen</button>
        </div>
      </div>`;
  }

  function _othersHtml(others) {
    if (!others.length) return '';
    const myCoins = Math.floor(currentUserData?.coins || 0);
    const rows = others.map(l => {
      const room = Math.max(0, (+l.target || 0) - (+l.funded || 0));
      const name = esc(nameOf(l.borrower_id));
      return `
        <div class="loan-card loan-request" data-loan="${l.id}">
          <div class="loan-line"><b>${name}</b> braucht ${fmt(l.target)} CC &nbsp;·&nbsp; noch <b>${fmt(room)}</b> CC offen</div>
          <div class="loan-actions">
            <input type="number" class="loan-input" data-fund-amount="${l.id}" min="1" max="${Math.floor(room)}" step="1" placeholder="Betrag" ${myCoins < 1 ? 'disabled' : ''} />
            <button class="loan-btn" data-fund="${l.id}" data-borrower="${l.borrower_id}" ${myCoins < 1 ? 'disabled' : ''}>Einzahlen (+20 % Zins zurück)</button>
          </div>
        </div>`;
    }).join('');
    return `<div class="loan-subtitle">💸 Offene Anfragen in der Gruppe</div>${rows}`;
  }

  function _myLendsHtml(contribs) {
    if (!contribs.length) return '';
    const rows = contribs.map(c => {
      const amount = +c.amount || 0, due = +c.due || 0, repaid = +c.repaid || 0;
      const pct = due > 0 ? Math.min(100, Math.round(repaid / due * 100)) : 0;
      const name = esc(nameOf(c.loan?.borrower_id));
      return `
        <div class="loan-card loan-lend">
          <div class="loan-line">An <b>${name}</b> verliehen: ${fmt(amount)} CC → Anspruch <b>${fmt(due)}</b> CC</div>
          <div class="loan-bar"><div class="loan-bar-fill loan-bar-lend" style="width:${pct}%"></div></div>
          <div class="loan-line loan-muted">Zurück: ${fmt(repaid)} CC &nbsp;·&nbsp; offen: ${fmt(Math.max(0, due - repaid))} CC</div>
        </div>`;
    }).join('');
    return `<div class="loan-subtitle">📈 Meine Ausleihen</div>${rows}`;
  }

  function _wire(sec) {
    // Anfrage stellen
    sec.querySelector('#loan-request-btn')?.addEventListener('click', async () => {
      const amt = parseInt(sec.querySelector('#loan-request-amount')?.value, 10);
      if (!(amt >= LOAN_MIN && amt <= LOAN_MAX)) { showToast(ERR.bad_target, 'error'); return; }
      const r = await DB.requestLoan(currentUser.id, amt);
      if (r?.error) { showToast(errMsg(r.error), 'error'); return; }
      showToast('✅ Kreditanfrage gestellt!', 'success');
      // Ins 📰 News posten (Absender „Kaffee-Kredit" ⇒ CC_NEWS_SENDERS, dritte Person).
      try { await DB.postMessage(`🤝 ${currentUser.name} bittet um einen Kredit über ${amt} CC — wer hilft aus? Rückzahlung + 20 % Zins. (Profil → 📊 Tagesstatistik)`, 'Kaffee-Kredit'); } catch (e) {}
      _afterAction();
    });
    // Abschlagszahlung / alles tilgen
    sec.querySelector('#loan-repay-btn')?.addEventListener('click', async () => {
      const amt = parseFloat(sec.querySelector('#loan-repay-amount')?.value);
      if (!(amt > 0)) { showToast(ERR.bad_amount, 'error'); return; }
      await _doRepay(amt);
    });
    sec.querySelector('#loan-repay-all-btn')?.addEventListener('click', () => _doRepay(999999));
    // Anfrage zurückziehen
    sec.querySelector('#loan-cancel-btn')?.addEventListener('click', async () => {
      if (!_myLoanId) return;
      const r = await DB.cancelLoan(_myLoanId, currentUser.id);
      if (r?.error) { showToast(errMsg(r.error), 'error'); return; }
      showToast('Anfrage zurückgezogen.', 'info');
      _afterAction();
    });
    // Fremde Anfragen finanzieren
    sec.querySelectorAll('[data-fund]').forEach(btn => btn.addEventListener('click', async () => {
      const loanId = btn.dataset.fund;
      const amt = parseFloat(sec.querySelector(`[data-fund-amount="${loanId}"]`)?.value);
      if (!(amt > 0)) { showToast(ERR.bad_amount, 'error'); return; }
      btn.disabled = true;
      const r = await DB.fundLoan(loanId, currentUser.id, amt);
      if (r?.error) { showToast(errMsg(r.error), 'error'); btn.disabled = false; return; }
      showToast(`✅ ${fmt(r.funded)} CC eingezahlt — kommt mit 20 % Zins zurück!`, 'success');
      // Ins 📰 News posten (dritte Person): auch der Geber wird sichtbar.
      try { await DB.postMessage(`🤝 ${currentUser.name} hat ${nameOf(btn.dataset.borrower)} mit ${fmt(r.funded)} CC ausgeholfen (+20 % Zins).`, 'Kaffee-Kredit'); } catch (e) {}
      _afterAction();
    }));
  }

  let _myLoanId = null;
  async function _doRepay(amt) {
    const r = await DB.repayLoanEarly(currentUser.id, amt);
    if (r?.error) { showToast(errMsg(r.error), 'error'); return; }
    showToast(r.closed ? '🎉 Kredit vollständig getilgt!' : `✅ ${fmt(r.paid)} CC getilgt.`, 'success');
    // Ins 📰 News posten (dritte Person): vorzeitige Tilgung/Abschluss sichtbar.
    try {
      const msg = r.closed
        ? `🤝 ${currentUser.name} hat den Kaffee-Kredit vollständig zurückgezahlt. 🎉`
        : `🤝 ${currentUser.name} hat ${fmt(r.paid)} CC des Kredits vorzeitig getilgt.`;
      await DB.postMessage(msg, 'Kaffee-Kredit');
    } catch (e) {}
    _afterAction();
  }

  async function renderSection() {
    const host = document.getElementById('profile-subtab-stats');
    if (!host || !currentUser?.id) return;
    let sec = document.getElementById('loans-section');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'loans-section';
      sec.className = 'progress-section';
      const verm = document.getElementById('vermoegen-section');
      if (verm && verm.nextSibling) host.insertBefore(sec, verm.nextSibling);
      else host.appendChild(sec);
    }
    sec.innerHTML = `<div class="section-title">🤝 Kaffee-Kredit</div><p class="empty-hint" style="font-size:.8rem">lädt…</p>`;
    let groupLoans = [], myContribs = [];
    try {
      [groupLoans, myContribs] = await Promise.all([DB.fetchGroupLoans(), DB.fetchMyContributions(currentUser.id)]);
    } catch (e) { sec.innerHTML = `<div class="section-title">🤝 Kaffee-Kredit</div><p class="empty-hint">Konnte Kredite nicht laden.</p>`; return; }

    const myLoan = groupLoans.find(l => l.borrower_id === currentUser.id) || null;
    _myLoanId = myLoan?.id || null;
    // Fremde Anfragen mit noch offenem Finanzierungsspielraum (voll finanzierte, die nur
    // noch getilgt werden, sind nicht mehr finanzierbar → raus aus der Liste).
    const others = groupLoans.filter(l => l.borrower_id !== currentUser.id && ((+l.target || 0) - (+l.funded || 0)) > 0.01);
    const activeContribs = (myContribs || []).filter(c => c.loan && (+c.due - +c.repaid) > 0.01);

    sec.innerHTML = `
      <div class="section-title">🤝 Kaffee-Kredit</div>
      <div class="loan-intro">Hilf Kolleg:innen mit einem Kredit auf die Beine — als Geber bekommst du deinen Einsatz <b>plus 20 % Zins</b> zurück, sobald der Schuldner Einkommen erzielt.</div>
      ${_myLoanHtml(myLoan)}
      ${_othersHtml(others)}
      ${_myLendsHtml(activeContribs)}`;

    // Cancel-Button braucht die Loan-ID am Dataset (wird in _wire gelesen).
    const cb = sec.querySelector('#loan-cancel-btn');
    if (cb && _myLoanId) cb.dataset.loan = _myLoanId;
    _wire(sec);
  }

  // ── Broadcast-Popup: neue Kreditanfragen der Gruppe einmalig allen zeigen ──────
  // Poll-/Login-basiert (kein Push): beim App-Start prüfen, ob es offene Anfragen ANDERER
  // gibt, die dieser Client noch nicht gesehen hat (localStorage cc_loan_seen). Zeigt sie
  // einmalig als Modal (Vorbild: Quiz/Umfrage/What's-New) und markiert sie als gesehen.
  // „Gesehen"-Merkliste PRO NUTZER schlüsseln (nicht pro Browser) — sonst gilt beim
  // Spieler-Wechsel im selben Browser eine Anfrage für alle als gesehen, sobald EIN
  // Spieler sie gesehen hat.
  const _seenKey = () => 'cc_loan_seen_' + (currentUser?.id || 'anon');
  function _seenIds() { try { return JSON.parse(localStorage.getItem(_seenKey()) || '[]'); } catch (e) { return []; } }
  function _markSeen(ids) {
    try { const set = new Set([..._seenIds(), ...ids]); localStorage.setItem(_seenKey(), JSON.stringify([...set].slice(-100))); } catch (e) {}
  }
  function _anyModalOpen() {
    return ['quiz-modal', 'survey-modal', 'whats-new-modal', 'loan-modal'].some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
  }

  async function checkAndMaybePopup() {
    if (!currentUser?.id || _anyModalOpen()) return;
    let loans = [];
    try { loans = await DB.fetchGroupLoans(); } catch (e) { return; }
    const seen = new Set(_seenIds());
    const fresh = (loans || []).filter(l =>
      l.borrower_id !== currentUser.id &&
      ((+l.target || 0) - (+l.funded || 0)) > 0.01 &&
      !seen.has(l.id));
    if (!fresh.length || _anyModalOpen()) return;
    _markSeen(fresh.map(l => l.id));
    _showRequestPopup(fresh);
  }

  function _showRequestPopup(loans) {
    let m = document.getElementById('loan-modal');
    if (!m) { m = document.createElement('div'); m.id = 'loan-modal'; m.className = 'hidden'; document.body.appendChild(m); }
    const list = loans.map(l => {
      const room = Math.max(0, (+l.target || 0) - (+l.funded || 0));
      return `<div style="margin:8px 0"><strong>${esc(nameOf(l.borrower_id))}</strong> bittet um <b>${fmt(l.target)} CC</b> <span style="color:var(--muted)">(noch ${fmt(room)} offen)</span></div>`;
    }).join('');
    m.innerHTML = `
      <div class="quiz-backdrop"></div>
      <div class="quiz-box">
        <div class="quiz-card" style="text-align:center">
          <div class="quiz-emoji">🤝</div>
          <h2>${loans.length > 1 ? 'Neue Kreditanfragen!' : 'Neue Kreditanfrage!'}</h2>
          <p class="quiz-hint" style="margin:2px 0 8px">Hilf aus und bekomm deinen Einsatz + 20 % Zins zurück.</p>
          ${list}
          <button class="btn-primary quiz-cta" id="loan-modal-go" style="margin-top:12px">Jetzt helfen</button>
          <button class="quiz-cta" id="loan-modal-later" style="margin-top:6px;background:none;border:none;color:var(--muted);cursor:pointer">Später</button>
        </div>
      </div>`;
    m.classList.remove('hidden');
    const close = () => m.classList.add('hidden');
    document.getElementById('loan-modal-later').onclick = close;
    document.getElementById('loan-modal-go').onclick = () => {
      close();
      try {
        if (typeof switchView === 'function') switchView('profil');
        if (typeof switchProfileSubtab === 'function') switchProfileSubtab('stats');
        setTimeout(() => document.getElementById('loans-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
      } catch (e) {}
    };
  }

  return { renderSection, checkAndMaybePopup };
})();
