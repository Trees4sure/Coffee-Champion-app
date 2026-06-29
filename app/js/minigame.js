// ═══════════════════════════════════════════════════════════════════════════
// minigame.js — Kaffee-Dungeon: 10 CC Einsatz → 0–25 CC Auszahlung
// Einstieg: openDungeonMinigame(member, { onStake, onComplete })
// Kein Cooldown — Dungeon erscheint über karte.js (alle 15 Felder).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const JAGD_ITEMS = [
  { e:'☕', p:1,  sp:1.2, fr:.34, wv:false, sz:36 },
  { e:'🫘', p:2,  sp:1.5, fr:.22, wv:false, sz:32 },
  { e:'🫖', p:3,  sp:1.7, fr:.14, wv:true,  sz:38 },
  { e:'💰', p:5,  sp:2.2, fr:.11, wv:false, sz:34 },
  { e:'⭐', p:10, sp:3.0, fr:.04, wv:true,  sz:30 },
  { e:'😴', p:-3, sp:0.9, fr:.09, wv:false, sz:38, bad:true },
  { e:'🧊', p:-2, sp:1.3, fr:.06, wv:false, sz:32, bad:true },
];
const _JAGD_TF = JAGD_ITEMS.reduce((s, t) => s + t.fr, 0);

function _jagdPickItem() {
  let r = Math.random() * _JAGD_TF;
  for (const t of JAGD_ITEMS) { r -= t.fr; if (r <= 0) return t; }
  return JAGD_ITEMS[0];
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Haupt-Einstieg: Overlay über der ganzen App ───────────────────────────────
async function openDungeonMinigame(member, opts) {
  // Overlay anlegen
  const overlay = document.createElement('div');
  overlay.id = 'cc-dungeon-overlay';
  overlay.className = 'jagd-overlay';
  overlay.innerHTML = `
    <div class="jagd-wrap" id="jagd-inner">
      <div class="jagd-preview-title" style="margin-bottom:8px">⚔️ KAFFEE-DUNGEON</div>
      <div class="jagd-legend">
        ☕ +1 &nbsp; 🫘 +2 &nbsp; 🫖 +3 &nbsp; 💰 +5 &nbsp; ⭐ +10
        &nbsp;·&nbsp;
        <span class="jagd-bad">😴 −3</span> &nbsp; <span class="jagd-bad">🧊 −2</span>
      </div>
      <div class="jagd-game-root">
        <div class="jagd-hud">
          <span>⭐ <span id="jagd-sc">0</span></span>
          <span><span id="jagd-tc">30</span>s</span>
          <span class="jagd-hud-lbl">KAFFEE-JAGD</span>
        </div>
        <div class="jagd-tbar-wrap"><div id="jagd-tbar" style="width:100%"></div></div>
        <canvas id="jagd-cv" width="640" height="300"></canvas>
      </div>
      <button class="cc-karte-popup-close" id="jagd-abort-btn" style="margin-top:10px">✖ Abbruch (Einsatz bleibt)</button>
    </div>`;
  document.body.appendChild(overlay);

  let aborted = false;
  document.getElementById('jagd-abort-btn')?.addEventListener('click', () => { aborted = true; });

  // Session starten (deducts 10 CC server-side)
  let result;
  try {
    result = await DB.startMinigame(member.id);
  } catch (e) {
    _jagdOverlayMsg(overlay, '❌ Fehler: ' + (e.message || 'unbekannt'), 2200);
    return;
  }

  if (result?.error) {
    let msg = '❌ ' + result.error;
    if (result.error === 'insufficient_coins') msg = '💸 Nicht genug CoffeeCoins!';
    if (result.error === 'session_in_progress') msg = '⏳ Schon ein Spiel aktiv — kurz warten.';
    _jagdOverlayMsg(overlay, msg, 2200);
    return;
  }

  const sessionId = result.session_id;
  if (opts?.onStake) opts.onStake(); // 10 CC sofort im UI abziehen

  // Countdown 3–2–1
  await _jagdCountdown();
  if (aborted) {
    _jagdOverlayMsg(overlay, '🏃 Abgebrochen — Einsatz in der Kasse.', 2000, () => {
      if (opts?.onComplete) opts.onComplete(0);
    });
    return;
  }

  // Spiel
  const gameStartTs = Date.now();
  const score = await _jagdRunGame(overlay, () => aborted);
  const duration = Date.now() - gameStartTs;

  if (aborted) {
    _jagdOverlayMsg(overlay, '🏃 Abgebrochen — Einsatz in der Kasse.', 2000, () => {
      if (opts?.onComplete) opts.onComplete(0);
    });
    return;
  }

  // Auswerten
  const inner = overlay.querySelector('#jagd-inner');
  if (inner) inner.innerHTML = '<p style="color:var(--muted);text-align:center;padding:32px">Auswerten…</p>';

  let claimResult;
  try {
    claimResult = await DB.claimMinigame(sessionId, member.id, Math.max(0, score), duration + 600);
  } catch (e) {
    claimResult = { coins_awarded: 0 };
  }

  const cc = claimResult?.coins_awarded ?? 0;

  _jagdRenderResult(inner || overlay, Math.max(0, score), cc);
  await _sleep(3500);
  overlay.remove();
  if (opts?.onComplete) opts.onComplete(cc, Math.max(0, score));
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function _jagdOverlayMsg(overlay, msg, ms, cb) {
  const wrap = overlay.querySelector('#jagd-inner');
  if (wrap) wrap.innerHTML = `<div class="jagd-result" style="padding:2rem;text-align:center">${msg}</div>`;
  setTimeout(() => { overlay.remove(); if (cb) cb(); }, ms);
}

function _jagdCountdown() {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)',
      'font-size:5rem', 'font-weight:bold',
      'color:#FAC775', 'text-shadow:0 0 30px #FAC775',
      'z-index:5100', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(el);
    let n = 3;
    const tick = () => {
      if (n === 0) { el.remove(); resolve(); return; }
      el.textContent = n--;
      setTimeout(tick, 900);
    };
    tick();
  });
}

function _jagdRenderResult(container, score, cc) {
  if (!container) return;
  const netto = cc - 10;
  const nettoTxt = netto >= 0 ? `+${netto} CC Gewinn` : `${netto} CC`;
  const nettoCol = netto >= 0 ? 'var(--gold,#d4aa37)' : 'var(--muted,#8a7a5a)';
  const perf = score >= 100 ? '🏆 Meisterklasse!' : score >= 50 ? '🌟 Gut gemacht!' : '☕ Nächstes Mal!';
  container.innerHTML = `
    <div class="jagd-result">
      <div class="jagd-result-score">${score} Punkte</div>
      <div style="font-size:1.1rem;margin-bottom:4px">${perf}</div>
      <div class="jagd-result-cc">${cc > 0 ? `+${cc} 🫘 CC gewonnen!` : '0 CC — weiter üben!'}</div>
      <div class="jagd-result-netto" style="color:${nettoCol}">${nettoTxt} (Einsatz 10 CC → Kasse)</div>
    </div>`;
}

// ── Canvas-Spiel (Promise — resolve(score) wenn fertig) ───────────────────────
function _jagdRunGame(overlay, isAborted) {
  return new Promise(resolve => {
    const cv  = overlay.querySelector('#jagd-cv');
    if (!cv) { resolve(0); return; }
    const W = cv.width, H = cv.height;
    const cx = cv.getContext('2d');
    const timerEl = overlay.querySelector('#jagd-tc');
    const scoreEl = overlay.querySelector('#jagd-sc');
    const tbarEl  = overlay.querySelector('#jagd-tbar');

    let items = [], pops = [], splats = [];
    let score = 0, tLeft = 30, running = true, shake = 0;
    let animId = null, spawnInt = null, timerInt = null, lastT = 0;

    function spawn() {
      const tp = _jagdPickItem();
      const left = Math.random() < .5;
      const spd = tp.sp * (1 + (30 - tLeft) / 45) * (W / 600);
      const y = 50 + Math.random() * (H - 100);
      items.push({
        x: left ? -55 : W + 55, y, by: y,
        vx: left ? spd : -spd,
        tp, t: Math.random() * Math.PI * 2,
        sz: tp.sz, hit: false, ha: 0
      });
    }

    spawnInt = setInterval(() => {
      if (!running) return;
      spawn();
      if (tLeft < 10) spawn();
    }, 650);

    timerInt = setInterval(() => {
      if (!running) return;
      if (isAborted()) { endGame(); return; }
      tLeft--;
      if (timerEl) timerEl.textContent = tLeft;
      if (tbarEl) tbarEl.style.width = (tLeft / 30 * 100) + '%';
      if (tLeft <= 0) endGame();
    }, 1000);

    function endGame() {
      if (!running) return;
      running = false;
      clearInterval(spawnInt);
      clearInterval(timerInt);
      cancelAnimationFrame(animId);
      cv.removeEventListener('click', hitHandler);
      cv.removeEventListener('touchstart', touchHandler);
      resolve(score);
    }

    function hitHandler(e) {
      if (!running) return;
      const rect = cv.getBoundingClientRect();
      const sx = W / rect.width, sy = H / rect.height;
      const mx = (e.clientX - rect.left) * sx;
      const my = (e.clientY - rect.top) * sy;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.hit) continue;
        if (Math.hypot(it.x - mx, it.y - my) < it.sz + 8) {
          it.hit = true; it.ha = 1;
          score += it.tp.p;
          if (scoreEl) scoreEl.textContent = Math.max(0, score);
          pops.push({
            x: it.x, y: it.y - 20,
            txt: (it.tp.p > 0 ? '+' : '') + it.tp.p,
            col: it.tp.bad ? '#ff6666' : '#ffd700', life: 1
          });
          splats.push({
            x: it.x, y: it.y, life: 1,
            col: it.tp.bad ? '#ff4455' : '#c07828',
            ps: Array.from({ length: 8 }, () => ({
              vx: (Math.random() - .5) * 5,
              vy: (Math.random() - .5) * 5 - 1,
              r: 2 + Math.random() * 4
            }))
          });
          if (it.tp.bad) shake = 9;
          break;
        }
      }
    }
    function touchHandler(e) { e.preventDefault(); hitHandler(e.touches[0]); }
    cv.addEventListener('click', hitHandler);
    cv.addEventListener('touchstart', touchHandler, { passive: false });

    function loop(now) {
      const dt = Math.min((now - lastT) / 16.67, 3); lastT = now;
      cx.save();
      if (shake-- > 0) cx.translate((Math.random() - .5) * 5, (Math.random() - .5) * 5);

      cx.fillStyle = '#110500'; cx.fillRect(0, 0, W, H);

      cx.globalAlpha = .04; cx.strokeStyle = '#c88830'; cx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        cx.beginPath();
        cx.arc(W * .1 + i * W * .16, H * .72, 26 + i * 9, 0, Math.PI * 2);
        cx.stroke();
      }
      cx.globalAlpha = 1;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.hit) {
          it.t += .055 * dt; it.x += it.vx * dt;
          if (it.tp.wv) it.y = it.by + Math.sin(it.t) * 28;
          if (it.x < -80 || it.x > W + 80) { items.splice(i, 1); continue; }
        } else {
          it.ha -= .09 * dt;
          if (it.ha <= 0) { items.splice(i, 1); continue; }
        }
        const sc2 = it.hit ? 1 + (1 - it.ha) * .5 : 1;
        cx.globalAlpha = it.hit ? it.ha : 1;
        cx.save(); cx.translate(it.x, it.y); cx.scale(sc2, sc2);
        cx.font = it.sz + 'px serif';
        cx.shadowColor = it.tp.bad ? '#5566ff' : '#dd8800'; cx.shadowBlur = 10;
        cx.fillText(it.tp.e, 0, 0);
        cx.shadowBlur = 0; cx.restore(); cx.globalAlpha = 1;
      }

      for (let i = splats.length - 1; i >= 0; i--) {
        const s = splats[i]; s.life -= .07 * dt;
        if (s.life <= 0) { splats.splice(i, 1); continue; }
        cx.globalAlpha = s.life; cx.fillStyle = s.col;
        const prog = 1 - s.life;
        for (const p of s.ps) {
          cx.beginPath();
          cx.arc(
            s.x + p.vx * 18 * prog,
            s.y + p.vy * 18 * prog + 12 * prog * prog,
            p.r * s.life, 0, Math.PI * 2
          );
          cx.fill();
        }
        cx.globalAlpha = 1;
      }

      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]; p.life -= .045 * dt; p.y -= 1.7 * dt;
        if (p.life <= 0) { pops.splice(i, 1); continue; }
        cx.globalAlpha = p.life;
        cx.font = 'bold 24px system-ui,sans-serif';
        cx.fillStyle = p.col; cx.shadowColor = p.col; cx.shadowBlur = 8;
        cx.fillText(p.txt, p.x, p.y);
        cx.shadowBlur = 0; cx.globalAlpha = 1;
      }

      cx.restore();
      if (running) animId = requestAnimationFrame(loop);
    }

    lastT = performance.now();
    animId = requestAnimationFrame(loop);
  });
}
