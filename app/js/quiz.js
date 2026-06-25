// js/quiz.js — Kaffee-Quiz (CIQ): Modal-Logik, Timer, Sofort-Feedback, Anzeige.
// Globale Funktionen (kein Build-Step), wie der Rest der Codebasis.
// Aller Quiz-Zugriff läuft über DB.quiz*-RPCs (Antwortschlüssel ist anon-geschützt).
// Nutzt zur Laufzeit app.js-Globals (_esc, _fmtCoins, currentUser, appData, refreshData).
const Quiz = (() => {
  const TIMER_SEC   = 15;
  const FEEDBACK_MS = 3500;   // Auto-Weiter-Fallback nach dem Sofort-Feedback
  let state = null;           // { attemptId, periodId, questions, idx, score }
  let timerHandle = null;
  let autoNext = null;
  let qStart = 0;
  let answering = false;

  function _modal() {
    let m = document.getElementById('quiz-modal');
    if (!m) { m = document.createElement('div'); m.id = 'quiz-modal'; m.className = 'hidden'; document.body.appendChild(m); }
    return m;
  }
  function _show(html) {
    const m = _modal();
    m.innerHTML = `<div class="quiz-backdrop"></div><div class="quiz-box">${html}</div>`;
    m.classList.remove('hidden');
  }
  function _close() {
    const m = document.getElementById('quiz-modal');
    if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
    _clearTimers();
    state = null; answering = false;
  }
  function _clearTimers() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    if (autoNext) { clearTimeout(autoNext); autoNext = null; }
  }

  // ── App-Start: Status holen, ggf. Einladungs-Screen zeigen ────────────────────
  async function checkAndMaybePopup() {
    if (typeof currentUser === 'undefined' || !currentUser?.id) return;
    let st;
    try { st = await DB.quizStatus(currentUser.id); } catch (e) { return; }
    if (!st || st.error || !st.should_popup) return;
    _showInvite();
  }

  function _showInvite() {
    _show(`
      <div class="quiz-card quiz-invite">
        <div class="quiz-emoji">🧠☕</div>
        <h2>Kaffee-Quiz</h2>
        <p>Heute ist Quiz-Tag! 10 Fragen rund um Kaffee — pro Frage 15 Sekunden.
           Für jede richtige Antwort gibt's <b>4 CC</b> und <b>+1 Kaffee-IQ</b>.</p>
        <p class="quiz-hint">Ein Versuch pro Runde · kein Zurück · kein Googeln 😏</p>
        <button class="btn-primary quiz-cta" id="quiz-start-btn">Jetzt mitmachen und gewinnen</button>
        <button class="quiz-link-btn" id="quiz-later-btn">Später</button>
      </div>`);
    document.getElementById('quiz-start-btn').onclick = _start;
    document.getElementById('quiz-later-btn').onclick = _close;
  }

  async function _start() {
    const btn = document.getElementById('quiz-start-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Lädt…'; }
    let res;
    try { res = await DB.quizStart(currentUser.id); } catch (e) { res = { error: e.message }; }
    if (!res || res.error) {
      const map = { not_quiz_day: 'Heute ist kein Quiz-Tag.', already_started: 'Du hast diese Runde schon gespielt.' };
      _info(map[res?.error] || 'Quiz gerade nicht verfügbar.');
      return;
    }
    state = { attemptId: res.attempt_id, periodId: res.period_id, questions: res.questions || [], idx: 0, score: 0 };
    try { sessionStorage.setItem('cc_quiz_attempt', JSON.stringify({ id: state.attemptId, period: state.periodId })); } catch (e) {}
    if (!state.questions.length) { _info('Für diese Runde sind keine Fragen hinterlegt.'); return; }
    _renderQuestion();
  }

  function _info(msg) {
    _show(`<div class="quiz-card"><div class="quiz-emoji">🫤</div><p>${_esc(msg)}</p><button class="btn-primary quiz-cta" id="quiz-ok">OK</button></div>`);
    document.getElementById('quiz-ok').onclick = _close;
  }

  // ── Frage rendern + 10-Sek-Countdown ─────────────────────────────────────────
  function _renderQuestion() {
    _clearTimers();
    answering = false;
    const q = state.questions[state.idx];
    if (!q) { _finish(); return; }
    const opts = [q.opt_a, q.opt_b, q.opt_c, q.opt_d];
    _show(`
      <div class="quiz-card quiz-q">
        <div class="quiz-q-head">
          <span class="quiz-q-num">Frage ${state.idx + 1}/10</span>
          <span class="quiz-q-theme">${_esc(q.theme)}</span>
          <span class="quiz-timer" id="quiz-timer">${TIMER_SEC}</span>
        </div>
        <div class="quiz-timer-bar"><div class="quiz-timer-fill" id="quiz-timer-fill"></div></div>
        <div class="quiz-q-text">${_esc(q.question)}</div>
        <div class="quiz-opts" id="quiz-opts">
          ${opts.map((o, i) => `<button class="quiz-opt" data-choice="${i + 1}">${_esc(o)}</button>`).join('')}
        </div>
        <div class="quiz-feedback hidden" id="quiz-feedback"></div>
      </div>`);
    document.querySelectorAll('#quiz-opts .quiz-opt').forEach(b =>
      b.onclick = () => _choose(parseInt(b.dataset.choice, 10)));
    qStart = Date.now();
    _startTimer();
  }

  function _startTimer() {
    let left = TIMER_SEC;
    const tEl = document.getElementById('quiz-timer');
    const fEl = document.getElementById('quiz-timer-fill');
    if (fEl) {
      fEl.style.transition = 'none'; fEl.style.width = '100%';
      requestAnimationFrame(() => { fEl.style.transition = `width ${TIMER_SEC}s linear`; fEl.style.width = '0%'; });
    }
    timerHandle = setInterval(() => {
      left--;
      if (tEl) tEl.textContent = Math.max(0, left);
      if (left <= 0) { _clearTimers(); _choose(null); }  // Timeout = unbeantwortet (= falsch)
    }, 1000);
  }

  // ── Antwort festschreiben + Sofort-Feedback ──────────────────────────────────
  async function _choose(choice) {
    if (answering) return;
    answering = true;
    _clearTimers();
    const q  = state.questions[state.idx];
    const ms = Date.now() - qStart;
    document.querySelectorAll('#quiz-opts .quiz-opt').forEach(b => {
      b.disabled = true;
      if (choice !== null && parseInt(b.dataset.choice, 10) === choice) b.classList.add('chosen');
    });
    let res;
    try { res = await DB.quizAnswer(state.attemptId, q.id, choice, ms); } catch (e) { res = { error: e.message }; }
    if (res && !res.error) {
      if (res.is_correct) state.score++;
      _showFeedback(res, choice);
    } else {
      _next();  // Fehler → ohne Crash weiter (zählt serverseitig als unbeantwortet)
    }
  }

  function _showFeedback(res, choice) {
    const correct = res.correct;  // 1..4
    document.querySelectorAll('#quiz-opts .quiz-opt').forEach(b => {
      const c = parseInt(b.dataset.choice, 10);
      if (c === correct) b.classList.add('correct');
      else if (c === choice) b.classList.add('wrong');
    });
    const fb = document.getElementById('quiz-feedback');
    if (fb) {
      const head = res.is_correct ? '✅ Richtig!' : (choice === null ? '⏱️ Zeit abgelaufen' : '❌ Leider falsch');
      fb.classList.remove('hidden');
      fb.innerHTML = `
        <div class="quiz-fb-head ${res.is_correct ? 'ok' : 'no'}">${head}</div>
        <div class="quiz-fb-expl">${_esc(res.explanation || '')}</div>
        <button class="btn-primary quiz-cta" id="quiz-next-btn">${state.idx >= 9 ? 'Auswerten' : 'Weiter'}</button>`;
      document.getElementById('quiz-next-btn').onclick = _next;
    }
    autoNext = setTimeout(_next, FEEDBACK_MS);
  }

  function _next() {
    _clearTimers();
    answering = false;
    state.idx++;
    if (state.idx >= state.questions.length) _finish();
    else _renderQuestion();
  }

  // ── Abschluss + Gutschrift ───────────────────────────────────────────────────
  async function _finish() {
    _clearTimers();
    _show(`<div class="quiz-card"><div class="quiz-emoji">⏳</div><p>Wird ausgewertet…</p></div>`);
    let res;
    try { res = await DB.quizFinalize(state.attemptId); } catch (e) { res = { error: e.message }; }
    try { sessionStorage.removeItem('cc_quiz_attempt'); } catch (e) {}
    if (!res || res.error) {
      _info('Auswertung fehlgeschlagen. Deine Antworten sind gespeichert und werden später gewertet.');
      return;
    }
    _show(`
      <div class="quiz-card quiz-result">
        <div class="quiz-emoji">🧠</div>
        <h2>${res.score}/10 richtig</h2>
        <p class="quiz-reward">+${_fmtCoins(res.cc)} CC · +${res.ciq} Kaffee-IQ</p>
        <p class="quiz-hint">Gesamt-Kaffee-IQ: <b>${res.total_ciq}</b></p>
        <button class="btn-primary quiz-cta" id="quiz-done-btn">Stark!</button>
      </div>`);
    document.getElementById('quiz-done-btn').onclick = async () => {
      _close();
      try { if (typeof refreshData === 'function') await refreshData(); } catch (e) {}
      const hc = document.getElementById('header-coins');
      if (hc && typeof currentUserData !== 'undefined' && currentUserData?.coins !== undefined) {
        hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(currentUserData.coins)}`;
      }
    };
  }

  // ── Anzeige-Helfer ───────────────────────────────────────────────────────────
  function _currentPeriod() {
    const d = new Date();
    const half = d.getDate() >= 15 ? 2 : 1;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${half}`;
  }
  function _periodLabel(p) {
    const [y, m, h] = String(p).split('-');
    const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return `${names[parseInt(m, 10) - 1] || m} ${y} (${h === '2' ? '2.' : '1.'} Hälfte)`;
  }

  // Profil: „🧠 Kaffee-IQ" — dynamisch vor die Achievements injiziert (kein index.html-Edit).
  function renderProfileSection(u) {
    if (!u) return;
    let sec = document.getElementById('quiz-profile-section');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'quiz-profile-section';
      sec.className = 'progress-section';
      const achSec = document.getElementById('achievements-grid')?.closest('.progress-section');
      if (achSec && achSec.parentNode) achSec.parentNode.insertBefore(sec, achSec);
      else return;
    }
    const q = u.cosmetics?.quiz || {};
    const ciq = q.ciq || 0;
    const hist = q.history || {};
    const keys = Object.keys(hist).sort().reverse().slice(0, 8);
    sec.innerHTML = `
      <div class="section-title">🧠 Kaffee-IQ</div>
      <div class="quiz-ciq-big">${ciq}<span> CIQ</span></div>
      ${keys.length
        ? `<div class="quiz-hist">${keys.map(k =>
            `<div class="quiz-hist-row"><span>${_esc(_periodLabel(k))}</span><span>${hist[k].score}/10</span></div>`).join('')}</div>`
        : `<p class="quiz-hint">Noch keine Quiz-Runde gespielt. Am 1. und 15. jedes Monats geht's los!</p>`}`;
  }

  // Saisons: „Quiz dieser Runde" + CIQ-Bestenliste — an #seasons-container angehängt.
  async function renderSeasonsSection() {
    const cont = document.getElementById('seasons-container');
    if (!cont) return;
    const users  = (typeof appData !== 'undefined' && appData?.users) ? appData.users : [];
    const ranked = users.map(u => ({ name: u.name, ciq: (u.cosmetics?.quiz?.ciq) || 0 }))
                        .filter(x => x.ciq > 0).sort((a, b) => b.ciq - a.ciq);
    const sec = document.createElement('div');
    sec.className = 'quiz-season-section';
    sec.innerHTML = `
      <div class="section-title" style="margin-top:20px">🧠 Quiz dieser Runde</div>
      <div id="quiz-reveal" class="quiz-reveal"><p class="quiz-hint">Lädt…</p></div>
      <div class="section-title" style="margin-top:18px">🏅 Kaffee-IQ Bestenliste</div>
      ${_ciqBoard(ranked)}`;
    cont.appendChild(sec);

    let rev;
    try { rev = await DB.quizGroupReveal(_currentPeriod()); } catch (e) { rev = { error: e.message }; }
    const box = document.getElementById('quiz-reveal');
    if (!box) return;
    if (!rev || rev.error) { box.innerHTML = `<p class="empty-hint">Quiz-Auswertung nicht verfügbar.</p>`; return; }
    if (rev.not_started) { box.innerHTML = `<p class="quiz-hint">Das erste Kaffee-Quiz startet am 1. Juli 2026. 📅</p>`; return; }
    if (!rev.revealed) {
      box.innerHTML = `<p class="quiz-hint">Auswertung erscheint, sobald alle teilgenommen haben (${rev.done || 0}/${rev.total || 0}) — oder der Quiz-Tag laut Server-Uhr vorbei ist.</p>`;
      return;
    }
    box.innerHTML = _revealHtml(rev);
  }

  function _ciqBoard(ranked) {
    if (!ranked.length) return `<p class="empty-hint">Noch keine Kaffee-IQ-Punkte in dieser Gruppe.</p>`;
    return `<table class="quiz-ciq-board"><tbody>${ranked.map((r, i) =>
      `<tr><td class="qz-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.'}</td>
           <td class="qz-name">${_esc(r.name)}</td><td class="qz-score">${r.ciq} CIQ</td></tr>`).join('')}</tbody></table>`;
  }

  function _revealHtml(rev) {
    const qs = rev.questions || [], parts = rev.participants || [];
    const idOrder = qs.map(q => q.id);
    const head = idOrder.map((_, i) => `<th>${i + 1}</th>`).join('');
    const rows = parts.map(p => {
      const m = {}; (p.answers || []).forEach(a => { m[a.question_id] = a; });
      const cells = idOrder.map(id => {
        const a = m[id];
        if (!a || a.chosen == null) return '<td class="qz-miss">–</td>';
        return a.correct ? '<td class="qz-ok">✓</td>' : '<td class="qz-no">✗</td>';
      }).join('');
      return `<tr><td class="qz-name">${_esc(p.name)}</td><td class="qz-score">${p.score}</td>${cells}</tr>`;
    }).join('');
    const sol = qs.map((q, i) => {
      const optText = [q.opt_a, q.opt_b, q.opt_c, q.opt_d][q.correct - 1];
      return `<div class="quiz-sol"><div class="quiz-sol-q"><b>${i + 1}.</b> ${_esc(q.question)}</div>
              <div class="quiz-sol-ans">✅ ${_esc(optText)}</div>
              <div class="quiz-sol-expl">${_esc(q.explanation)}</div></div>`;
    }).join('');
    return `
      <div class="quiz-reveal-note">${rev.reason === 'all_done' ? 'Alle haben teilgenommen 🎉' : 'Quiz-Tag vorbei — Auswertung freigeschaltet.'}</div>
      <div class="quiz-matrix-wrap">
        <table class="quiz-matrix"><thead><tr><th>Name</th><th>Pkt</th>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${idOrder.length + 2}">Keine Teilnahmen.</td></tr>`}</tbody></table>
      </div>
      <details class="quiz-solutions"><summary>Lösungen &amp; Begründungen anzeigen</summary>${sol}</details>`;
  }

  return { checkAndMaybePopup, renderProfileSection, renderSeasonsSection };
})();
