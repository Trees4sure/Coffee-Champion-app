// js/survey.js — Monatliche Feedback-Umfrage (Coffee Champion), plans/Umfrage.md
// Globale Funktionen (kein Build-Step), wie der Rest der Codebasis.
// Verfügbarkeit wird CLIENT-seitig aus dem Datum abgeleitet (Standard: letzter Freitag im Monat,
// 07:30 → +24 h) — kein Cron, analog zum Quiz. Abgabe/Belohnung laufen über DB.submitSurvey.
// Nutzt zur Laufzeit app.js-Globals: _esc, _fmtCoins, currentUser, currentUserData, appData,
// refreshData, showToast, DB.
const Survey = (() => {
  const REWARD = 30;

  // Ausnahme-Termine je Monat (überschreiben den „letzter Freitag"-Standard für DIESEN Monat).
  // Key = 'YYYY-MM', Wert = 'YYYY-MM-DD' (Umfrage-Tag, Fenster 07:30 → +24 h). Der period_key bleibt
  // 'YYYY-MM' → pro Monat weiterhin genau EINE Umfrage. Erste Umfrage: Mi 08.07.2026 (JP-Wunsch).
  const OVERRIDES = {
    '2026-07': '2026-07-08',
  };

  // Bewertete Spielsequenzen (1–5 Sterne). Reihenfolge = Anzeige-Reihenfolge.
  const FEATURES = [
    { key: 'gesamt',     icon: '⭐', label: 'Gesamteindruck' },
    { key: 'basis',      icon: '☕', label: 'Kaffee-Tracking & Rangliste' },
    { key: 'forschung',  icon: '🔬', label: 'Forschung' },
    { key: 'karte',      icon: '🗺️', label: 'Karte, Erkundung & Gebäude' },
    { key: 'welt',       icon: '🌍', label: 'Welthandel' },
    { key: 'krieger',    icon: '⚔️', label: 'Kaffee-Krieger (neu!)' },
    { key: 'quiz',       icon: '🧠', label: 'Kaffee-Quiz' },
    { key: 'wirtschaft', icon: '🏦', label: 'Gruppenkasse & Wirtschaft' },
    { key: 'jagd',       icon: '🎯', label: 'Kaffeejagd' },
  ];

  // Vorformulierte Verbesserungsvorschläge (Mehrfachauswahl).
  const SUGGESTIONS = [
    { key: 'less_more',    label: '🎯 Weniger Neues — lieber Bestehendes verbessern' },
    { key: 'welt_balance', label: '⚖️ Welthandel-Balancing überarbeiten (Dividende/Investition)' },
    { key: 'simpler',      label: '🧭 Übersichtlicher / einfacher machen' },
    { key: 'tutorial',     label: '📖 Mehr Erklärungen / Einsteiger-Hilfe' },
    { key: 'mobile',       label: '📱 Bessere Handy-Darstellung' },
    { key: 'more_pvp',     label: '⚔️ Mehr Wettbewerb / PvP' },
    { key: 'more_coop',    label: '🤝 Mehr Team-Zusammenarbeit' },
    { key: 'krieger_more', label: '🗡️ Kaffee-Krieger weiter ausbauen' },
    { key: 'all_good',     label: '👍 Passt eigentlich alles super' },
  ];
  const SUGG_LABEL = Object.fromEntries(SUGGESTIONS.map(s => [s.key, s.label]));
  const FEAT_LABEL = Object.fromEntries(FEATURES.map(f => [f.key, `${f.icon} ${f.label}`]));

  let state = null; // { period, ratings:{}, suggestions:Set, submitting }

  // ── Perioden-Logik: letzter Freitag im Monat, Fenster 07:30 → +24 h ───────────
  function _lastFridayDay(year, month0) {
    const d = new Date(year, month0 + 1, 0);        // letzter Tag des Monats (lokal)
    const back = (d.getDay() - 5 + 7) % 7;          // 5 = Freitag
    return d.getDate() - back;
  }
  function _windowFor(year, month0) {
    const key = `${year}-${String(month0 + 1).padStart(2, '0')}`;
    const ov  = OVERRIDES[key];
    const day = ov ? parseInt(ov.split('-')[2], 10) : _lastFridayDay(year, month0);
    const start = new Date(year, month0, day, 7, 30, 0, 0);
    const end   = new Date(start.getTime() + 24 * 3600 * 1000);
    return { key, start, end };
  }
  // Aktives Fenster bestimmen (aktueller ODER Vormonat — Fenster kann über Monatsgrenze laufen).
  function _activeWindow(now = new Date()) {
    const cur  = _windowFor(now.getFullYear(), now.getMonth());
    if (now >= cur.start && now < cur.end) return cur;
    const pm   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = _windowFor(pm.getFullYear(), pm.getMonth());
    if (now >= prev.start && now < prev.end) return prev;
    return null;
  }
  function _periodLabel(key) {
    const [y, m] = String(key).split('-');
    const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return `${names[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function _modal() {
    let m = document.getElementById('survey-modal');
    if (!m) { m = document.createElement('div'); m.id = 'survey-modal'; m.className = 'hidden'; document.body.appendChild(m); }
    return m;
  }
  function _show(html) {
    const m = _modal();
    m.innerHTML = `<div class="survey-backdrop"></div><div class="survey-box">${html}</div>`;
    m.classList.remove('hidden');
  }
  function _close() {
    const m = document.getElementById('survey-modal');
    if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
    state = null;
  }

  // ── App-Start: bei aktivem Fenster + noch nicht abgegeben → Popup ─────────────
  async function checkAndMaybePopup() {
    if (typeof currentUser === 'undefined' || !currentUser?.id) return;
    const win = _activeWindow();
    if (!win) return;                                   // kein Umfrage-Tag → keine DB-Last
    try { if (sessionStorage.getItem('cc_survey_dismissed_' + win.key)) return; } catch (e) {}
    // Ein anderes Modal offen? (Quiz hat Vorrang.) Dann nicht überlagern.
    const qm = document.getElementById('quiz-modal');
    if (qm && !qm.classList.contains('hidden')) return;
    let mine = null;
    try { mine = await DB.surveyMyResponse(currentUser.id, win.key); } catch (e) { return; }
    if (mine) return;                                   // schon teilgenommen
    _showSurvey(win);
  }

  function _showSurvey(win) {
    state = { period: win.key, ratings: {}, suggestions: new Set(), submitting: false };
    _show(`
      <div class="survey-card">
        <div class="survey-head">
          <div class="survey-emoji">📋☕</div>
          <h2>Kaffee-Umfrage</h2>
          <p class="survey-sub">${_esc(_periodLabel(win.key))} · dauert keine 2 Minuten · <b>+${REWARD} CC</b> fürs Mitmachen</p>
          <p class="survey-hint">Deine Meinung steuert, was als Nächstes verbessert wird — zuletzt neu: der ⚔️ Kaffee-Krieger.</p>
        </div>

        <div class="survey-section-title">Wie gut gefallen dir die Bereiche? <span>(1 = mau · 5 = top)</span></div>
        <div class="survey-ratings" id="survey-ratings">
          ${FEATURES.map(f => `
            <div class="survey-rate-row" data-feat="${f.key}">
              <span class="survey-rate-lbl">${f.icon} ${_esc(f.label)}</span>
              <span class="survey-stars">
                ${[1,2,3,4,5].map(n => `<button type="button" class="survey-star" data-feat="${f.key}" data-val="${n}" aria-label="${n}">☆</button>`).join('')}
              </span>
            </div>`).join('')}
        </div>

        <div class="survey-section-title">Was sollen wir angehen? <span>(Mehrfachauswahl)</span></div>
        <div class="survey-suggs" id="survey-suggs">
          ${SUGGESTIONS.map(s => `
            <button type="button" class="survey-sugg" data-sugg="${s.key}">${_esc(s.label)}</button>`).join('')}
        </div>

        <div class="survey-section-title">Noch etwas auf dem Herzen? <span>(optional)</span></div>
        <textarea id="survey-freetext" class="survey-textarea" maxlength="600"
          placeholder="Was fehlt, was nervt, was wünschst du dir? (Balancing, Bedienung, Ideen …)"></textarea>

        <div class="survey-actions">
          <button class="btn-primary survey-submit" id="survey-submit-btn">Absenden & +${REWARD} CC kassieren</button>
          <button class="survey-link-btn" id="survey-later-btn">Später</button>
        </div>
        <div class="survey-err hidden" id="survey-err"></div>
      </div>`);

    // Sterne
    document.querySelectorAll('#survey-ratings .survey-star').forEach(b => {
      b.onclick = () => {
        const feat = b.dataset.feat, val = parseInt(b.dataset.val, 10);
        state.ratings[feat] = val;
        document.querySelectorAll(`.survey-star[data-feat="${feat}"]`).forEach(s => {
          s.textContent = parseInt(s.dataset.val, 10) <= val ? '★' : '☆';
          s.classList.toggle('on', parseInt(s.dataset.val, 10) <= val);
        });
      };
    });
    // Vorschläge (Toggle)
    document.querySelectorAll('#survey-suggs .survey-sugg').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.sugg;
        if (state.suggestions.has(k)) { state.suggestions.delete(k); b.classList.remove('on'); }
        else { state.suggestions.add(k); b.classList.add('on'); }
      };
    });
    document.getElementById('survey-submit-btn').onclick = _submit;
    document.getElementById('survey-later-btn').onclick = () => {
      try { sessionStorage.setItem('cc_survey_dismissed_' + win.key, '1'); } catch (e) {}
      _close();
    };
  }

  async function _submit() {
    if (!state || state.submitting) return;
    // Mindestens der Gesamteindruck sollte bewertet sein — sanfter Zwang, sonst leere Umfragen.
    if (state.ratings.gesamt == null) {
      const err = document.getElementById('survey-err');
      if (err) { err.textContent = 'Bitte bewerte wenigstens den ⭐ Gesamteindruck.'; err.classList.remove('hidden'); }
      const row = document.querySelector('.survey-rate-row[data-feat="gesamt"]');
      if (row) { row.classList.add('survey-rate-missing'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    state.submitting = true;
    const btn = document.getElementById('survey-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sende…'; }
    const freetext = (document.getElementById('survey-freetext')?.value || '').trim().slice(0, 600);
    let res;
    try {
      res = await DB.submitSurvey(currentUser.id, state.period, state.ratings, [...state.suggestions], freetext);
    } catch (e) { res = { error: e.message }; }

    if (!res || res.error) {
      if (res?.error === 'already_submitted') { _thanks(true); return; }
      state.submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = `Absenden & +${REWARD} CC kassieren`; }
      const err = document.getElementById('survey-err');
      if (err) { err.textContent = 'Absenden fehlgeschlagen — bitte später erneut versuchen.'; err.classList.remove('hidden'); }
      return;
    }
    // Chat-Post (nicht personenbezogenes Feedback, nur Teilnahme sichtbar machen)
    try { await DB.postMessage(`📋 ${currentUser.name} hat an der Kaffee-Umfrage teilgenommen! (+${_fmtCoins(res.reward || REWARD)} CC)`, 'Umfrage'); } catch (e) {}
    _thanks(false, res.reward || REWARD);
  }

  function _thanks(alreadyDone, reward) {
    _show(`
      <div class="survey-card survey-thanks">
        <div class="survey-emoji">🙏☕</div>
        <h2>${alreadyDone ? 'Schon abgegeben!' : 'Danke dir!'}</h2>
        <p>${alreadyDone
          ? 'Für diese Umfrage hast du bereits abgestimmt.'
          : `Deine Rückmeldung ist gespeichert. <b>+${_fmtCoins(reward || REWARD)} CC</b> sind gutgeschrieben.`}</p>
        <p class="survey-hint">Die Ergebnisse erscheinen unter <b>🏆 Saison</b>.</p>
        <button class="btn-primary survey-cta" id="survey-done-btn">Stark!</button>
      </div>`);
    document.getElementById('survey-done-btn').onclick = async () => {
      _close();
      try { if (typeof refreshData === 'function') await refreshData(); } catch (e) {}
      const hc = document.getElementById('header-coins');
      if (hc && typeof currentUserData !== 'undefined' && currentUserData?.coins !== undefined) {
        hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(currentUserData.coins)}`;
      }
    };
  }

  // ── Aggregation ──────────────────────────────────────────────────────────────
  function _aggregate(rows) {
    const ratingSum = {}, ratingCnt = {}, suggCnt = {}, texts = [];
    const nameOf = id => ((typeof appData !== 'undefined' && appData?.users) || []).find(u => u.id === id)?.name || 'Jemand';
    rows.forEach(r => {
      const rat = r.ratings || {};
      Object.keys(rat).forEach(k => {
        const v = parseInt(rat[k], 10);
        if (v >= 1 && v <= 5) { ratingSum[k] = (ratingSum[k] || 0) + v; ratingCnt[k] = (ratingCnt[k] || 0) + 1; }
      });
      (r.suggestions || []).forEach(s => { suggCnt[s] = (suggCnt[s] || 0) + 1; });
      if (r.freetext && r.freetext.trim()) texts.push({ name: nameOf(r.member_id), text: r.freetext.trim() });
    });
    return { count: rows.length, ratingSum, ratingCnt, suggCnt, texts };
  }

  function _stars(avg) {
    const full = Math.round(avg);
    return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
  }

  function _resultsHtml(periodKey, agg, active) {
    if (!agg.count) {
      return `<p class="empty-hint">${active ? 'Umfrage läuft — sei die/der Erste! 📋' : 'Für diese Runde liegen noch keine Antworten vor.'}</p>`;
    }
    const feats = FEATURES
      .filter(f => agg.ratingCnt[f.key])
      .map(f => ({ f, avg: agg.ratingSum[f.key] / agg.ratingCnt[f.key], n: agg.ratingCnt[f.key] }))
      .sort((a, b) => b.avg - a.avg);
    const ratingRows = feats.map(({ f, avg, n }) => `
      <div class="survey-res-row">
        <span class="survey-res-lbl">${f.icon} ${_esc(f.label)}</span>
        <span class="survey-res-bar"><span class="survey-res-fill" style="width:${(avg / 5 * 100).toFixed(0)}%"></span></span>
        <span class="survey-res-val">${_stars(avg)} <b>${avg.toFixed(1)}</b><small>/${n}</small></span>
      </div>`).join('');

    const suggs = SUGGESTIONS
      .map(s => ({ s, n: agg.suggCnt[s.key] || 0 }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    const suggRows = suggs.length
      ? `<div class="survey-res-suggs">${suggs.map(({ s, n }) =>
          `<div class="survey-res-sugg"><span>${_esc(s.label)}</span><span class="survey-res-cnt">${n}×</span></div>`).join('')}</div>`
      : '';

    const texts = agg.texts.length
      ? `<details class="survey-res-texts"><summary>💬 Freitext-Rückmeldungen (${agg.texts.length})</summary>${
          agg.texts.map(t => `<div class="survey-res-text"><b>${_esc(t.name)}:</b> ${_esc(t.text)}</div>`).join('')}</details>`
      : '';

    return `
      <div class="survey-res-note">${active ? '📋 Umfrage läuft noch' : '✅ Umfrage abgeschlossen'} · ${agg.count} Teilnahme${agg.count === 1 ? '' : 'n'}</div>
      ${ratingRows}
      ${suggs.length ? `<div class="survey-res-subtitle">Meistgewünscht</div>${suggRows}` : ''}
      ${texts}`;
  }

  // ── Saison-Bereich: Ergebnisse anhängen ──────────────────────────────────────
  async function renderSeasonsSection() {
    const cont = document.getElementById('seasons-container');
    if (!cont) return;
    const sec = document.createElement('div');
    sec.className = 'survey-season-section';
    sec.innerHTML = `
      <div class="section-title" style="margin-top:22px">📋 Kaffee-Umfrage</div>
      <div id="survey-results" class="survey-results"><p class="quiz-hint">Lädt…</p></div>`;
    cont.appendChild(sec);

    const win = _activeWindow();
    let rows = [];
    try {
      // Alle Antworten der Gruppe holen, nach Periode gruppieren, jüngste (oder aktive) zeigen.
      const all = await DB.fetchAllSurveyResponses();
      const byPeriod = {};
      (all || []).forEach(r => { (byPeriod[r.period_key] = byPeriod[r.period_key] || []).push(r); });
      const periods = Object.keys(byPeriod).sort();
      // Läuft gerade eine Umfrage → immer diese Periode (auch ohne Antworten → „sei die/der Erste").
      // Sonst die jüngste abgeschlossene Periode mit Antworten anzeigen.
      const showKey = win ? win.key : (periods[periods.length - 1] || null);
      rows = showKey ? (byPeriod[showKey] || []) : [];
      const box = document.getElementById('survey-results');
      if (!box) return;
      if (!showKey) { box.innerHTML = `<p class="empty-hint">Noch keine Umfrage durchgeführt. Die erste startet am Mittwoch, 8. Juli 2026 — danach monatlich. 📅</p>`; return; }
      const active = !!(win && win.key === showKey);
      box.innerHTML = `<div class="survey-res-period">${_esc(_periodLabel(showKey))}</div>` + _resultsHtml(showKey, _aggregate(rows), active);
    } catch (e) {
      const box = document.getElementById('survey-results');
      if (box) box.innerHTML = `<p class="empty-hint">Umfrage-Ergebnisse gerade nicht verfügbar.</p>`;
    }
  }

  // ── Admin: Download-Button für den Feedback-Export ────────────────────────────
  function renderAdminSection() {
    if (typeof currentUserData === 'undefined' || !currentUserData?.isAdmin) return;
    const host = document.getElementById('admin-user-list');
    if (!host || !host.parentNode) return;
    let sec = document.getElementById('survey-admin-section');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'survey-admin-section';
      sec.className = 'survey-admin-section';
      host.parentNode.insertBefore(sec, host.nextSibling);
    }
    sec.innerHTML = `
      <div class="section-title" style="margin-top:20px">📋 Umfrage-Feedback</div>
      <p class="survey-hint">Alle Antworten als Datei exportieren — zum Weitergeben an die Entwicklung.</p>
      <div class="survey-admin-btns">
        <button class="btn-secondary" id="survey-dl-json">⬇️ Als JSON</button>
        <button class="btn-secondary" id="survey-dl-txt">⬇️ Als Textbericht</button>
      </div>`;
    document.getElementById('survey-dl-json').onclick = () => _download('json');
    document.getElementById('survey-dl-txt').onclick  = () => _download('txt');
  }

  async function _download(fmt) {
    let all;
    try { all = await DB.fetchAllSurveyResponses(); }
    catch (e) { if (typeof showToast === 'function') showToast('Export fehlgeschlagen: ' + (e.message || ''), 'error'); return; }
    if (!all || !all.length) { if (typeof showToast === 'function') showToast('Noch keine Umfrage-Antworten vorhanden.', 'info'); return; }
    const nameOf = id => ((typeof appData !== 'undefined' && appData?.users) || []).find(u => u.id === id)?.name || id;
    const group  = (typeof AUTH !== 'undefined' && AUTH.getGroup) ? (AUTH.getGroup()?.name || 'gruppe') : 'gruppe';
    const stamp  = new Date().toISOString().slice(0, 10);
    let blob, fname;

    if (fmt === 'json') {
      const payload = {
        group, exported_at: new Date().toISOString(),
        features: FEAT_LABEL, suggestions: SUGG_LABEL,
        responses: all.map(r => ({
          name: nameOf(r.member_id), period: r.period_key,
          ratings: r.ratings || {}, suggestions: r.suggestions || [],
          freetext: r.freetext || '', at: r.created_at
        }))
      };
      blob  = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      fname = `umfrage_${group}_${stamp}.json`;
    } else {
      const byPeriod = {};
      all.forEach(r => { (byPeriod[r.period_key] = byPeriod[r.period_key] || []).push(r); });
      const lines = [`KAFFEE-UMFRAGE — ${group}`, `Export: ${new Date().toLocaleString('de-DE')}`, ''];
      Object.keys(byPeriod).sort().reverse().forEach(pk => {
        const rows = byPeriod[pk], agg = _aggregate(rows);
        lines.push(`===== ${_periodLabel(pk)} — ${agg.count} Teilnahme(n) =====`, '', 'Bewertungen (Ø von 5):');
        FEATURES.forEach(f => { if (agg.ratingCnt[f.key]) lines.push(`  ${f.icon} ${f.label}: ${(agg.ratingSum[f.key] / agg.ratingCnt[f.key]).toFixed(2)} (n=${agg.ratingCnt[f.key]})`); });
        const suggs = SUGGESTIONS.filter(s => agg.suggCnt[s.key]).sort((a, b) => (agg.suggCnt[b.key] || 0) - (agg.suggCnt[a.key] || 0));
        if (suggs.length) { lines.push('', 'Verbesserungswünsche:'); suggs.forEach(s => lines.push(`  ${s.label}: ${agg.suggCnt[s.key]}×`)); }
        if (agg.texts.length) { lines.push('', 'Freitext:'); agg.texts.forEach(t => lines.push(`  - ${t.name}: ${t.text}`)); }
        lines.push('');
      });
      blob  = new Blob([lines.join('\n')], { type: 'text/plain' });
      fname = `umfrage_${group}_${stamp}.txt`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  return { checkAndMaybePopup, renderSeasonsSection, renderAdminSection };
})();
