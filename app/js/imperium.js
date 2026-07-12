// ═══════════════════════════════════════════════════════════════════════════
// imperium.js — CoffeeCoins Imperium: Forschungsbaum, Kasse, Cosmetics, Sprüche
// Wird nach app.js geladen; füllt den View #view-imperium
// und die Profil-Platzhalter #coins-section, #sprueche-section
// ═══════════════════════════════════════════════════════════════════════════

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
function _esc2(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _fmtCoins(n) {
  const v = parseFloat(n) || 0;
  return v % 1 === 0 ? v.toLocaleString('de-DE') : v.toFixed(1);
}

function _coinBadge(amount, size = 'sm') {
  const sizes = { lg: '56px', md: '38px', sm: '22px' };
  const iconSizes = { lg: '20px', md: '14px', sm: '9px' };
  const s = sizes[size] || sizes.sm;
  const i = iconSizes[size] || iconSizes.sm;
  return `<span class="cc-coin cc-coin-${size}" style="width:${s};height:${s}" aria-hidden="true">
    <span style="font-size:${i}">🫘</span>
  </span>`;
}

// Aktualisiert die CC-Anzeige oben links im Header (neben dem Namen) —
// muss nach jedem Kauf/jeder Einzahlung im Imperium aufgerufen werden.
function _updateHeaderCoins(member) {
  const hc = document.getElementById('header-coins');
  if (hc && member?.coins !== undefined) {
    hc.innerHTML = `<span style="font-size:11px">🫘</span>${Math.floor(member.coins)}`;
  }
}

// ── Theme-Paletten ────────────────────────────────────────────────────────────
// Jedes Theme färbt die Akzent- und Hintergrundfarben der App ein (CSS-Variablen).
// "default" entspricht den ursprünglichen Werten aus style.css :root.
const THEME_PALETTES = {
  default:    { gold:'#d4aa37', bright:'#f0c84a', dim:'#7a6118', bg:'#0d0b08', bg2:'#141008', bg3:'#1c160d', bg4:'#241c0f' },
  waldcafe:   { gold:'#5a9e6f', bright:'#7fc99a', dim:'#2e4f37', bg:'#0b120d', bg2:'#0f1810', bg3:'#15211a', bg4:'#1c2b22' },
  berge:      { gold:'#7ba7c9', bright:'#a9cce8', dim:'#3c5a70', bg:'#0a0e12', bg2:'#0e1419', bg3:'#141c24', bg4:'#1c2733' },
  fruehling:  { gold:'#e08fb0', bright:'#f5b8cf', dim:'#7a3d50', bg:'#120c10', bg2:'#181016', bg3:'#21161d', bg4:'#2c1e26' },
  beach:      { gold:'#5fc9c0', bright:'#8fe8df', dim:'#2e6660', bg:'#081012', bg2:'#0c171a', bg3:'#102025', bg4:'#162b32' },
  midnight:   { gold:'#8a7ff0', bright:'#b3aafc', dim:'#3f3a80', bg:'#0a0a14', bg2:'#0e0e1c', bg3:'#141428', bg4:'#1c1c38' },
  herbst:     { gold:'#d97b3f', bright:'#f5a35f', dim:'#7a3f1a', bg:'#120c08', bg2:'#18110a', bg3:'#21170d', bg4:'#2c1f12' },
  zen:        { gold:'#9ab87a', bright:'#c2dba0', dim:'#4e5f3a', bg:'#0c100b', bg2:'#11160f', bg3:'#171f14', bg4:'#1f2a1a' },
  roester:    { gold:'#e05a3f', bright:'#ff8a6a', dim:'#7a2a1a', bg:'#140a08', bg2:'#1a0d09', bg3:'#23120c', bg4:'#301810' },
  // Saisonale Gewinner-Themes
  saison_jan: { gold:'#7ec8e3', bright:'#b0e6f7', dim:'#345a6e', bg:'#0a1014', bg2:'#0e161b', bg3:'#142028', bg4:'#1c2c36' },
  saison_feb: { gold:'#e0527a', bright:'#ff8aa8', dim:'#7a283d', bg:'#120a0e', bg2:'#180e14', bg3:'#21131b', bg4:'#2c1924' },
  saison_mar: { gold:'#8fd98f', bright:'#b8f0b8', dim:'#3d6b3d', bg:'#0b120b', bg2:'#0f180f', bg3:'#152115', bg4:'#1c2b1c' },
  saison_apr: { gold:'#f0d96a', bright:'#fff0a0', dim:'#7a6a2a', bg:'#120f08', bg2:'#18150a', bg3:'#211d0d', bg4:'#2c2712' },
  saison_mai: { gold:'#e08fb0', bright:'#f5b8cf', dim:'#7a3d50', bg:'#120c10', bg2:'#181016', bg3:'#21161d', bg4:'#2c1e26' },
  saison_jun: { gold:'#f5c542', bright:'#ffe080', dim:'#7a5e1a', bg:'#120e08', bg2:'#18130a', bg3:'#211a0d', bg4:'#2c2412' },
  saison_jul: { gold:'#5fc9c0', bright:'#8fe8df', dim:'#2e6660', bg:'#081012', bg2:'#0c171a', bg3:'#102025', bg4:'#162b32' },
  saison_aug: { gold:'#d9b35a', bright:'#f0d68a', dim:'#6e571f', bg:'#120e08', bg2:'#18130a', bg3:'#21190d', bg4:'#2c2212' },
  saison_sep: { gold:'#d97b3f', bright:'#f5a35f', dim:'#7a3f1a', bg:'#120c08', bg2:'#18110a', bg3:'#21170d', bg4:'#2c1f12' },
  saison_okt: { gold:'#e0792e', bright:'#ffab5e', dim:'#7a3a10', bg:'#120c08', bg2:'#18100a', bg3:'#21160d', bg4:'#2c1e12' },
  saison_nov: { gold:'#9aa3a8', bright:'#c5ccd0', dim:'#4a5256', bg:'#0c0e0f', bg2:'#101315', bg3:'#161a1c', bg4:'#1f2326' },
  saison_dez: { gold:'#e0a23f', bright:'#ffce7a', dim:'#7a4a10', bg:'#120e08', bg2:'#18130a', bg3:'#211a0d', bg4:'#2c2412' },
};

// Wendet das Cosmetics-Theme des aktiven Users als App-Farbschema an
function applyTheme(themeId) {
  const p = THEME_PALETTES[themeId] || THEME_PALETTES.default;
  const root = document.documentElement.style;
  root.setProperty('--gold',        p.gold);
  root.setProperty('--gold-bright', p.bright);
  root.setProperty('--gold-dim',    p.dim);
  root.setProperty('--gold-glow',   p.gold + '40');
  root.setProperty('--bg',  p.bg);
  root.setProperty('--bg2', p.bg2);
  root.setProperty('--bg3', p.bg3);
  root.setProperty('--bg4', p.bg4);
}

// ── Imperium Haupt-View ───────────────────────────────────────────────────────
async function renderImperium() {
  const view = document.getElementById('view-imperium');
  if (!view) return;
  if (!currentUserData || !appData) {
    view.innerHTML = '<p style="color:var(--muted);text-align:center;padding:32px">Lade…</p>';
    return;
  }

  const member   = appData.users.find(u => u.id === currentUserData.id) || currentUserData;
  const research = member.research || {};

  view.innerHTML = `
    <div class="imperium-header">
      <div class="imperium-coins">
        ${_coinBadge(member.coins, 'md')}
        <span class="imperium-coins-val">${_fmtCoins(member.coins)}</span>
        <span class="imperium-coins-lbl">CC</span>
        <span class="imperium-passive" id="imp-passive">+${_fmtCoins(
          (() => {
            const rPD = typeof calcResearchPerDay === 'function' ? calcResearchPerDay(research) : 0;
            const bPD = typeof calcBuildingPerDay === 'function' ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
            return Math.round((rPD + bPD) * 100) / 100;
          })()
        )}/Tag</span>
      </div>
      <div class="imperium-score">
        Forschungs-Score: <strong>${(typeof calcResearchScore === 'function' ? calcResearchScore(research) : 0).toLocaleString('de-DE')} CC</strong>
      </div>
    </div>

    <div class="imperium-tabs" id="imp-tabs">
      <button class="imp-tab active" data-tab="baum">🌳 Forschung</button>
      <button class="imp-tab" data-tab="karte">🗺️ Karte</button>
      <button class="imp-tab" data-tab="welt">🌍 Weltkarte</button>
      <button class="imp-tab" data-tab="krieger">⚔️ Krieger</button>
      ${(research.kaffeegarten && research.lim_edition) ? '<button class="imp-tab" data-tab="garden">🪴 Garten</button>' : ''}
      ${(research.kaffeemobil && research.barista_kurs && research.fahrender_haendler) ? '<button class="imp-tab" data-tab="mobil">🚐 Kaffeemobil</button>' : ''}
      <button class="imp-tab" data-tab="stats">📊 Statistik</button>
      <button class="imp-tab" data-tab="kasse">🏛️ Kasse</button>
      <button class="imp-tab" data-tab="cosmetics">🎨 Cosmetics</button>
    </div>

    <div id="imp-content"></div>
  `;

  document.getElementById('imp-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.imp-tab');
    if (!btn) return;
    document.querySelectorAll('.imp-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Karte/Welt/Krieger-Tab: immer aktuellsten Stand (currentUserData hat map_data/dungeon_data/coins-Updates)
    const freshMember = (btn.dataset.tab === 'karte' || btn.dataset.tab === 'welt' || btn.dataset.tab === 'krieger' || btn.dataset.tab === 'garden' || btn.dataset.tab === 'mobil') ? (currentUserData || member) : member;
    _renderImperiumTab(btn.dataset.tab, freshMember);
  });

  _renderImperiumTab('baum', member);
}

async function _renderImperiumTab(tab, member) {
  const el = document.getElementById('imp-content');
  if (!el) return;
  if (tab === 'baum')      el.innerHTML = _buildForschungsbaum(member.research || {});
  if (tab === 'kasse')     el.innerHTML = await _buildKasse(member);
  if (tab === 'karte')     { el.innerHTML = ''; _buildKarte(member, el); return; }
  if (tab === 'welt')      { el.innerHTML = ''; _buildWeltkarte(member, el); return; }
  if (tab === 'stats')     el.innerHTML = _buildImperiumStats();
  if (tab === 'cosmetics') el.innerHTML = _buildCosmetics(member);
  if (tab === 'krieger')   { el.innerHTML = ''; _buildKrieger(member, el); return; }
  if (tab === 'garden')    el.innerHTML = _buildGarten(member);
  if (tab === 'mobil')     { el.innerHTML = ''; if (typeof _buildKaffeemobil === 'function') _buildKaffeemobil(member, el); return; }
  // Event-Delegation für Kaufbuttons
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-buy]');
    if (btn) await _handleBuy(btn.dataset.buy, member);
    const cBtn = e.target.closest('[data-contribute]');
    if (cBtn) await _handleContribute(cBtn.dataset.contribute, member);
    const cosBtn = e.target.closest('[data-cosm-set]');
    if (cosBtn) await _handleCosmeticsSet(cosBtn.dataset.cosmSet, cosBtn.dataset.cosmVal, member);
    const gBtn = e.target.closest('[data-garden-buy]');
    if (gBtn) await _handleGardenBuy(gBtn.dataset.gardenBuy, member);
    const gAcc = e.target.closest('[data-garden-epoch]');
    if (gAcc && !gBtn) {
      const c = document.getElementById('garden-ep-' + gAcc.dataset.gardenEpoch);
      if (c) { c.classList.toggle('open'); _gardenOpenEpoch = c.classList.contains('open') ? gAcc.dataset.gardenEpoch : null; }
    }
  };
}

// ── Forschungsbaum ────────────────────────────────────────────────────────────
function _buildForschungsbaum(research) {
  if (typeof RESEARCH_PATHS === 'undefined') return '<p style="color:var(--muted);padding:16px">Lade Forschungsdaten…</p>';

  let html = '';
  for (let tier = 1; tier <= 5; tier++) {
    const ti = TIER_NAMES[tier];
    const allTierItems = [];
    for (const [key, path] of Object.entries(RESEARCH_PATHS)) {
      for (const item of path.items) {
        if (item.tier === tier) allTierItems.push({ ...item, path: key, pathIcon: path.icon });
      }
    }

    html += `<div class="cc-tier-section">
      <div class="cc-tier-header" style="background:${ti.color};border-color:${ti.border};color:${ti.text}">
        <span>T${tier} — ${ti.name}</span>
        <span class="cc-tier-range">${getTierRange(tier)}</span>
      </div>
      <div class="cc-research-grid">`;

    for (const item of allTierItems) {
      const owned = !!research[item.id];
      const _bp = [];
      if (item.perCup > 0) _bp.push(`+${item.perCup} CC/T`);
      if (item.perDay > 0) _bp.push(`+${item.perDay} CC/Tag`);
      if (!_bp.length && item.special) _bp.push('✦');
      const bonus = _bp.join(' · ');
      // Voraussetzungen: fehlende Items ermitteln (Namen aus normalen Items ODER Kombos)
      const missing = (item.requires || []).filter(r => !research[r]);
      const prereqOk = missing.length === 0;
      const missingNames = missing.map(r => {
        const ri = getAllResearchItems().find(i => i.id === r) || (RESEARCH_COMBOS || []).find(c => c.id === r);
        return ri ? `${ri.icon} ${ri.name}` : r;
      }).join(', ');
      html += `<div class="cc-ri ${owned ? 'cc-ri-owned' : !prereqOk ? 'cc-ri-locked' : ''}" title="${_esc2(item.name)} — ${_esc2(bonus)}">
        <span class="cc-ri-path">${item.pathIcon}</span>
        <div class="cc-ri-icon">${item.icon}</div>
        <p class="cc-ri-name">${_esc2(item.name)}</p>
        <p class="cc-ri-cost">${owned ? '✓' : item.cost.toLocaleString('de-DE') + ' CC'}</p>
        <p class="cc-ri-bonus">${_esc2(bonus)}</p>
        ${owned ? ''
          : prereqOk ? `<button class="cc-buy-btn" data-buy="${item.id}">Kaufen</button>`
          : `<p class="cc-ri-locked-lbl">🔒 Voraussetzung fehlt</p><p class="cc-ri-need">Braucht: ${_esc2(missingNames)}</p>`}
      </div>`;
    }
    html += `</div></div>`;
  }

  // Kombinations-Freischaltungen
  html += `<div class="cc-combos-section">
    <div class="section-title" style="margin:16px 0 10px">✦ Kombinations-Freischaltungen</div>`;

  for (const combo of RESEARCH_COMBOS) {
    const owned    = !!research[combo.id];
    const prereqs  = (combo.requires || []).every(req => research[req]);
    const canBuy   = !owned && prereqs;
    html += `<div class="cc-combo-card ${owned ? 'cc-combo-owned' : prereqs && !owned ? 'cc-combo-ready' : ''}">
      <div class="cc-combo-parts">
        ${(combo.requires || []).map(r => {
          const ri = RESEARCH_COMBOS.find(c => c.id === r) || getAllResearchItems().find(i => i.id === r);
          const ricon = ri?.icon || '?';
          const rown  = !!research[r];
          return `<span class="cc-combo-chip ${rown ? 'cc-combo-chip-ok' : ''}">${ricon} ${ri?.name || r}</span>`;
        }).join('<span class="cc-combo-plus">+</span>')}
        <span class="cc-combo-arrow">→</span>
        <span class="cc-combo-result">${combo.icon} ${_esc2(combo.name)}</span>
        ${combo.cost === 0 ? '<span class="cc-combo-free">gratis!</span>' : `<span class="cc-combo-cost">${combo.cost} CC</span>`}
      </div>
      <p class="cc-combo-desc">${_esc2(combo.desc)}</p>
      ${owned ? '<p class="cc-combo-owned-lbl">✓ Freigeschaltet</p>' :
        canBuy ? `<button class="cc-buy-btn cc-combo-buy-btn" data-buy="${combo.id}">${combo.cost === 0 ? 'Freischalten' : 'Kaufen'}</button>` :
        '<p class="cc-combo-locked">🔒 Voraussetzungen fehlen</p>'}
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── 🪴 Kaffee-Garten (Erlebnis-Minigame #1) ─────────────────────────────────
// Zuletzt geöffnete Epoche merken, damit ein Kauf nicht zurück zu Epoche 1 springt.
let _gardenOpenEpoch = null;

function _buildGarten(member) {
  if (typeof GARDEN_EPOCHS === 'undefined') return '<p style="color:var(--muted);padding:16px">Lade Garten…</p>';
  const garden = member.garden || {};
  const total  = GARDEN_TOTAL;
  const have   = gardenLexikonCount(garden);
  const pct    = Math.round((have / total) * 100);
  const value  = gardenValue(garden);
  const openId = _gardenOpenEpoch || GARDEN_EPOCHS[0].id;
  const gPerDay = (typeof gardenPerDay === 'function') ? gardenPerDay(garden, member.research) : 0;
  const gPerCup = (typeof gardenPerCup === 'function') ? gardenPerCup(garden, member.research) : 0;

  const epochsHtml = GARDEN_EPOCHS.map(ep => {
    const cnt      = gardenEpochUnlockedCount(garden, ep.id);
    const complete = cnt === 12;
    const tiles = (GARDEN_ELEMENTS[ep.id] || []).map((elm, i) => {
      const slot  = i + 1;
      const id    = gardenElementId(ep.id, slot);
      const owned = gardenIsUnlocked(garden, id);
      const rar   = gardenRarity(slot);
      if (owned) {
        return `<div class="cc-gt owned cc-gt-${rar}">
          <div class="cc-gt-icon">${elm.icon}</div>
          <p class="cc-gt-name">${_esc2(elm.name)}</p>
          <p class="cc-gt-story">${_esc2(elm.story)}</p>
        </div>`;
      }
      return `<div class="cc-gt locked cc-gt-${rar}">
        <div class="cc-gt-icon">🔒</div>
        <p class="cc-gt-name">${_esc2(elm.name)}</p>
        <p class="cc-gt-rar">${gardenRarityLabel(slot)} · +${gardenSlotPerDay(slot)}/Tag</p>
        <button class="cc-buy-btn cc-gt-buy" data-garden-buy="${id}">${gardenElementCost(slot)} CC</button>
      </div>`;
    }).join('');
    return `<div class="cc-garden-epoch${ep.id === openId ? ' open' : ''}" id="garden-ep-${ep.id}">
      <div class="cc-garden-ep-head" data-garden-epoch="${ep.id}">
        <span class="cc-garden-ep-title">${ep.icon} ${_esc2(ep.name)}</span>
        <span class="cc-garden-ep-sub">${_esc2(ep.sub)}</span>
        <span class="cc-garden-ep-count${complete ? ' done' : ''}">${complete ? '✓ ' : ''}${cnt}/12</span>
      </div>
      <div class="cc-garden-grid">${tiles}</div>
    </div>`;
  }).join('');

  return `<div class="cc-garden">
    <div class="cc-garden-intro">
      <p class="cc-garden-lead">🪴 <strong>Kaffee-Garten</strong> — ein Diorama der Kaffeegeschichte. Jedes Element erzählt ein Stück Historie, füllt dein <strong>Kaffee-Lexikon</strong> und wirft <strong>Einkommen</strong> ab (Passiv/Tag + pro Tasse). Volle Epoche = <strong>+100 CC</strong>.</p>
      <div class="cc-garden-progress">
        <div class="cc-garden-prog-lbl">📖 Kaffee-Lexikon: <strong>${have}/${total}</strong> Einträge · Sammlungswert ${_fmtCoins(value)} CC</div>
        <div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
        <div class="cc-garden-income">🪙 Garten-Einkommen: <strong>+${_fmtCoins(gPerDay)} CC/Tag</strong>${gPerCup > 0 ? ` · <strong>+${gPerCup} CC/Tasse</strong>` : ''} <span class="cc-garden-income-note">(inkl. deiner Forschungs-Boni)</span></div>
      </div>
    </div>
    ${epochsHtml}
  </div>`;
}

async function _handleGardenBuy(elementId, member) {
  try {
    const res = await DB.unlockGardenElement(member.id, elementId);
    if (res?.error) {
      const map = { already_unlocked: 'Schon in deinem Garten.', insufficient: 'Nicht genug CoffeeCoins.', bad_element: 'Unbekanntes Element.', not_found: 'Mitglied nicht gefunden.' };
      showToast(map[res.error] || 'Freischalten fehlgeschlagen', 'error'); return;
    }
    const slot    = gardenSlotOfId(elementId);
    const epochId = elementId.split('_')[0];
    const def     = gardenElementDef(epochId, slot);
    const epDef   = gardenEpochDef(epochId);
    _gardenOpenEpoch = epochId; // beim Neu-Rendern die aktuelle Epoche offen halten
    // Tages-Log / Bilanz (Rubrik „erlebnis", Freischaltung = invest:true) — nie kaufblockierend
    try {
      const entries = [{ label: `🪴 Garten: ${def?.name || elementId}`, amount: -(res.cost || 0), cat: 'erlebnis', detail: 'Kaffee-Garten', invest: true }];
      if (res.epoch_complete && res.epoch_bonus > 0)
        entries.push({ label: `🪴 Epoche komplett: ${epDef?.name || epochId}`, amount: res.epoch_bonus, cat: 'erlebnis' });
      await DB.appendTodayLogFresh(member.id, entries);
    } catch (e) { /* non-critical */ }
    appData = await DB.fetchData();
    const updated = appData.users.find(u => u.id === member.id);
    if (updated) currentUserData = { ...currentUserData, ...updated };
    _updateHeaderCoins(updated || member);
    if (res.epoch_complete) showToast(`🪴 Epoche „${epDef?.name}" komplett! +${res.epoch_bonus} CC`, 'success');
    else showToast(`🪴 ${def?.name || 'Element'} freigeschaltet! (−${res.cost} CC)`, 'success');
    try { if (res.epoch_complete && epDef) await DB.postMessage(`🪴 ${member.name} hat die Garten-Epoche „${epDef.name}" vollendet!`, member.name); } catch (e) { /* non-critical */ }
    // Achievement: volles Lexikon (alle 84) → Garten-Kurator (+250 CC via achievements.js)
    try {
      const existing = currentUserData?.achievements || {};
      if (!existing.garten_epoch_all && updated && gardenAllComplete(updated.garden)) {
        await DB.grantAchievements(member.id, { garten_epoch_all: true });
        currentUserData = { ...currentUserData, achievements: { ...existing, garten_epoch_all: true } };
        const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === 'garten_epoch_all');
        if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
        try { await DB.postMessage(`🏆 ${member.name} hat das Kaffee-Lexikon vollständig gefüllt — Garten-Kurator!`, member.name); } catch (e) {}
      }
    } catch (e) { /* non-critical */ }
    _renderImperiumTab('garden', updated || member);
  } catch (e) { showToast(e.message, 'error'); }
}

// Banner mit allen aktiven Gruppen-Boni (Tasse/Passiv/Schritte/Schatz)
// Stufen-Banner der Gruppenkasse (Stufe X/5, frische Mechanik, Fortschritt zur nächsten Stufe)
function _kasseLevelBanner(treasury) {
  if (typeof treasuryLevelInfo !== 'function') return '';
  const info = treasuryLevelInfo(treasury);
  const nextTxt = info.next
    ? `Nächste Stufe: ${info.next.icon} ${_esc2(info.next.name)} bei ${info.next.threshold.toLocaleString('de-DE')} GC Gesamt-Einzahlungen`
    : '🏆 Höchste Stufe erreicht!';
  const bar = info.next
    ? `<div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${info.pct}%"></div></div>
       <p class="cc-progress-pct">${_fmtCoins(info.total)} / ${info.next.threshold.toLocaleString('de-DE')} GC Gesamt-Einzahlungen (${info.pct}%)</p>`
    : '';
  return `<div class="cc-kasse-level">
    <div class="cc-kasse-level-head"><span class="cc-kasse-level-badge">${info.icon} Stufe ${info.level}/5 · ${_esc2(info.name)}</span></div>
    <p class="cc-kasse-level-mech">${_esc2(info.mechanic)}</p>
    <p class="cc-kasse-level-next">${nextTxt}</p>
    ${bar}
  </div>`;
}

function _kassePerksBanner(perks) {
  const parts = [];
  if (perks.perCup   > 0) parts.push(`<strong>+${perks.perCup} CC/Tasse</strong>`);
  if (perks.perDay   > 0) parts.push(`<strong>+${perks.perDay} CC passiv/Tag</strong>`);
  if (perks.steps    > 0) parts.push(`<strong>+${perks.steps} Karten-Schritte/Tag</strong>`);
  if (perks.treasure > 0) parts.push(`<strong>+${Math.round(perks.treasure * 100)}% Schatzausbeute</strong>`);
  if (!parts.length) return '';
  return `<div class="cc-kasse-perks">🎁 Aktive Gruppen-Boni für ALLE: ${parts.join(' · ')}</div>`;
}

// Fortschrittsanzeige der wöchentlichen Gruppen-Challenge
function _kasseWeeklyChallenge() {
  if (typeof WEEKLY_CHALLENGE === 'undefined' || typeof isoWeekKey !== 'function') return '';
  const wk = isoWeekKey();
  let progress = 0;
  for (const [date, d] of Object.entries(appData?.dailyStats || {})) {
    if (isoWeekKey(date) === wk) progress += (d.total || 0);
  }
  const goal = WEEKLY_CHALLENGE.goalCups;
  const done = progress >= goal;
  const pct  = Math.min(100, Math.round((progress / goal) * 100));
  return `<div class="cc-goal ${done ? 'cc-goal-done' : ''}" style="margin-bottom:16px">
    <div class="cc-goal-head">
      <span class="cc-goal-icon">${WEEKLY_CHALLENGE.icon}</span>
      <span class="cc-goal-name">Wochen-Challenge</span>
      <span class="cc-goal-cost">+${WEEKLY_CHALLENGE.reward} CC für alle</span>
    </div>
    <p class="cc-goal-desc">${_esc2(WEEKLY_CHALLENGE.label)}</p>
    ${done
      ? '<p class="cc-goal-done-lbl">✓ Diese Woche geschafft!</p>'
      : `<div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
         <p class="cc-progress-pct">${progress} / ${goal} Tassen (${pct}%)</p>`}
  </div>`;
}

// ── Kaffee-Kasse ──────────────────────────────────────────────────────────────
async function _buildKasse(member) {
  if (typeof KASSE_GOALS === 'undefined') return '';
  // Selbstheilend: erreichte Ziele freischalten (still, ohne Chat-Post — der läuft nur beim Einzahlen)
  try { await DB.syncTreasuryGoals(); } catch (e) {}
  let treasury = { balance: 0, contributions: {}, unlocked_goals: {} };
  try { treasury = await DB.fetchTreasury(); } catch (e) {}

  const myContrib = parseFloat((treasury.contributions || {})[member.id]) || 0;
  const perks   = (typeof treasuryGroupPerks === 'function') ? treasuryGroupPerks(treasury) : { perCup: 0, perDay: 0 };
  const topId   = (typeof treasuryTopContributor === 'function') ? treasuryTopContributor(treasury, (appData?.users || []).map(u => u.id)) : null;
  const topUser = topId && appData?.users ? appData.users.find(u => u.id === topId) : null;
  let html = `
    <div class="cc-kasse-header">
      <div class="cc-kasse-balance">
        ${_coinBadge(treasury.balance, 'md')}
        <span class="cc-kasse-bal-val">${_fmtCoins(treasury.balance)}</span>
        <span style="font-size:.8rem;color:var(--muted)"> GC Gruppenstand</span>
      </div>
      <p class="cc-kasse-mycontrib">Dein Beitrag: <strong>${_fmtCoins(myContrib)} GC</strong></p>
      ${topUser ? `<p class="cc-kasse-mycontrib">🎗️ Größter Wohltäter: <strong>${_esc2(topUser.name)}</strong></p>` : ''}
    </div>
    ${_kasseLevelBanner(treasury)}
    ${_kassePerksBanner(perks)}
    ${_kasseWeeklyChallenge()}
    <div class="cc-kasse-contribute">
      <input type="number" id="kasse-input" min="1" max="9999" placeholder="CC einzahlen…" style="width:120px">
      <button class="btn-primary" data-contribute="kasse" style="padding:8px 16px;font-size:.82rem">🏛️ Einzahlen</button>
    </div>
    <div class="section-title" style="margin:16px 0 8px">Gruppen-Ziele</div>`;

  const curLevel = (typeof treasuryLevelInfo === 'function') ? treasuryLevelInfo(treasury).level : 99;
  for (const goal of KASSE_GOALS) {
    const unlocked    = !!(treasury.unlocked_goals || {})[goal.id];
    const levelLocked = (goal.level || 1) > curLevel;
    const pct         = Math.min(100, Math.round((treasury.balance / goal.cost) * 100));
    html += `<div class="cc-goal ${unlocked ? 'cc-goal-done' : ''} ${levelLocked ? 'cc-goal-locked' : ''}">
      <div class="cc-goal-head">
        <span class="cc-goal-icon">${goal.icon}</span>
        <span class="cc-goal-name">${_esc2(goal.name)}</span>
        <span class="cc-goal-cost">${goal.cost.toLocaleString('de-DE')} GC</span>
      </div>
      <p class="cc-goal-desc">${_esc2(goal.desc)}</p>
      ${unlocked
        ? '<p class="cc-goal-done-lbl">✓ Erreicht!</p>'
        : levelLocked
          ? `<p class="cc-goal-locked-lbl">🔒 Ab Kassen-Stufe ${goal.level} freischaltbar</p>`
          : `<div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
             <p class="cc-progress-pct">${pct}% (${_fmtCoins(treasury.balance)} / ${goal.cost.toLocaleString('de-DE')} GC)</p>`}
    </div>`;
  }
  return html;
}

// ── Imperium Statistik ────────────────────────────────────────────────────────
// ── Passiv-Einkommen Breakdown ────────────────────────────────────────────────
function _buildPassivBreakdown(member) {
  const research  = member.research       || {};
  const buildings = member.map_data?.buildings || {};
  const lines = [];

  if (typeof getAllResearchItems === 'function') {
    for (const item of getAllResearchItems()) {
      if (!research[item.id] || !(item.perDay > 0)) continue;
      lines.push({ icon: item.icon, label: item.name, value: item.perDay, type: 'research' });
    }
  }
  if (typeof RESEARCH_COMBOS !== 'undefined') {
    for (const combo of RESEARCH_COMBOS) {
      if (!research[combo.id] || !(combo.perDay > 0)) continue;
      lines.push({ icon: combo.icon, label: combo.name, value: combo.perDay, type: 'combo' });
    }
  }

  const mults = [];
  if (research.bio_zertifikat) mults.push('🌿 Bio-Zertifikat ×1,2');
  if (research.weltkonzern)    mults.push('👑 Weltkonzern ×3');
  if (research.weltreise)      mults.push('🧳 Weltreise ×1,5');

  const now   = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  for (const b of Object.values(buildings)) {
    if (b.completesAt > now) continue;
    if (b.damaged === today) continue;
    const def = (typeof karteBuildingDef === 'function') ? karteBuildingDef(b.type) : null;
    if (!def || !(def.perDay > 0)) continue;
    lines.push({ icon: def.emoji, label: def.name, value: def.perDay, type: 'building' });
  }

  if (lines.length === 0 && mults.length === 0) return '';

  const researchRaw = lines.filter(l => l.type !== 'building').reduce((s, l) => s + l.value, 0);
  let researchFinal = researchRaw;
  if (research.bio_zertifikat) researchFinal *= 1.2;
  if (research.weltkonzern)    researchFinal *= 3;
  if (research.weltreise)      researchFinal *= 1.5;
  researchFinal = Math.round(researchFinal * 100) / 100;
  const buildingTotal = lines.filter(l => l.type === 'building').reduce((s, l) => s + l.value, 0);
  const total = Math.round((researchFinal + buildingTotal) * 100) / 100;

  const rowHtml = lines.map(l => `
    <div class="cc-passiv-row">
      <span class="cc-passiv-icon">${l.icon}</span>
      <span class="cc-passiv-label">${_esc2(l.label)}</span>
      <span class="cc-passiv-val">+${_fmtCoins(l.value)}/Tag</span>
    </div>`).join('');

  const multHtml = mults.length ? `
    <div class="cc-passiv-mults">${mults.map(m => `<span class="cc-passiv-mult">${m}</span>`).join('')}</div>` : '';

  return `
    <div class="cc-passiv-breakdown">
      <button class="cc-passiv-toggle" onclick="this.parentElement.classList.toggle('open')">
        ⚙️ +${_fmtCoins(total)} CC/Tag <span class="cc-passiv-arrow">▸</span>
      </button>
      <div class="cc-passiv-detail">
        ${rowHtml}
        ${multHtml}
        <div class="cc-passiv-total">Gesamt: +${_fmtCoins(total)} CC/Tag</div>
      </div>
    </div>`;
}

// ── Forschungs-Heatmap ────────────────────────────────────────────────────────
function _buildForschungsHeatmap(users) {
  if (!users?.length || typeof RESEARCH_PATHS === 'undefined') return '';

  const cols = users.map(u => ({
    name:   u.name,
    avatar: u.cosmetics?.avatar || '☕',
    res:    u.research || {},
  }));

  function coverageBar(count, total) {
    const pct  = total > 0 ? Math.round((count / total) * 100) : 0;
    const fill = count === total       ? '#FAC775'
               : count >= total * 0.6  ? '#c88a30'
               : count >= total * 0.3  ? '#7a4a10'
               : 'rgba(255,255,255,0.12)';
    return `<div class="cc-hm-cov"><div class="cc-hm-cov-bar" style="width:${pct}%;background:${fill}"></div></div>
            <span class="cc-hm-cov-num">${count}/${total}</span>`;
  }

  const header = `
    <tr class="cc-hm-header">
      <th class="cc-hm-th-item">Forschung</th>
      ${cols.map(c => `<th class="cc-hm-th-player" title="${_esc2(c.name)}">
        <span class="cc-hm-av">${c.avatar}</span>
        <span class="cc-hm-pname">${_esc2(c.name.slice(0,5))}</span>
      </th>`).join('')}
      <th class="cc-hm-th-cov">Abdeckung</th>
    </tr>`;

  function pathRows(pathIcon, pathName, items) {
    const headerRow = `<tr class="cc-hm-path-header">
      <td colspan="${cols.length + 2}" class="cc-hm-path-label">${pathIcon} ${_esc2(pathName)}</td>
    </tr>`;
    const tierColors = { 1:'#9FE1CB', 2:'#FAC775', 3:'#EF9F27', 4:'#e07020', 5:'#BA7517' };
    const itemRows = items.map(item => {
      const count = cols.filter(c => !!c.res[item.id]).length;
      const cells = cols.map(c => {
        const owned = !!c.res[item.id];
        return `<td class="cc-hm-td"><div class="cc-hm-cell ${owned ? 'cc-hm-owned' : ''}">${owned ? '✓' : ''}</div></td>`;
      }).join('');
      const tc = tierColors[item.tier] || '#888';
      const tierBadge = item.tier
        ? `<span class="cc-hm-tier" style="color:${tc};border-color:${tc}40">T${item.tier}</span>`
        : `<span class="cc-hm-tier" style="color:#FAC775;border-color:#FAC77540">✦</span>`;
      return `<tr class="cc-hm-row">
        <td class="cc-hm-td-item"><div style="display:flex;align-items:center;gap:5px;white-space:nowrap">
          <span class="cc-hm-icon">${item.icon}</span>
          <span class="cc-hm-name">${_esc2(item.name)}</span>
          ${tierBadge}
        </div></td>
        ${cells}
        <td class="cc-hm-td-cov">${coverageBar(count, cols.length)}</td>
      </tr>`;
    }).join('');
    return headerRow + itemRows;
  }

  let rows = '';
  for (const [, path] of Object.entries(RESEARCH_PATHS)) {
    rows += pathRows(path.icon, path.name, path.items);
  }
  if (typeof RESEARCH_COMBOS !== 'undefined' && RESEARCH_COMBOS.length) {
    rows += pathRows('✦', 'Kombos', RESEARCH_COMBOS.map(c => ({ ...c, tier: null })));
  }

  const totalItems = Object.values(RESEARCH_PATHS).reduce((s, p) => s + p.items.length, 0)
                   + ((typeof RESEARCH_COMBOS !== 'undefined') ? RESEARCH_COMBOS.length : 0);
  const summaryRow = `<tr class="cc-hm-summary">
    <td class="cc-hm-td-item" style="color:rgba(255,255,255,.5);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Gesamt</td>
    ${cols.map(c => {
      const owned = Object.values(RESEARCH_PATHS).reduce((s, p) => s + p.items.filter(i => !!c.res[i.id]).length, 0)
                  + ((typeof RESEARCH_COMBOS !== 'undefined') ? RESEARCH_COMBOS.filter(co => !!c.res[co.id]).length : 0);
      const pct = Math.round((owned / totalItems) * 100);
      return `<td class="cc-hm-td" style="text-align:center">
        <div style="font-size:11px;font-weight:700;color:#FAC775">${owned}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.35)">${pct}%</div>
      </td>`;
    }).join('')}
    <td></td>
  </tr>`;

  return `<div class="cc-hm-scroll">
    <table class="cc-hm-table">
      <thead>${header}</thead>
      <tbody>${rows}${summaryRow}</tbody>
    </table>
  </div>`;
}

function _buildImperiumStats() {
  if (!appData?.users?.length) return '<p style="color:var(--muted);padding:16px">Keine Daten verfügbar</p>';
  const users = [...appData.users].sort((a,b) => (calcResearchScore(b.research||{}) - calcResearchScore(a.research||{})));
  // Welt-Daten (gruppenweit) für die kompakte Welt-Statistik-Zeile je Spieler
  const _wInv = (appData.worldInvestments) || [];
  const _wByCountry = (typeof worldBuildingsByCountry === 'function') ? worldBuildingsByCountry(appData.worldBuildings || []) : {};

  // ── Gruppenkasse-Übersicht (Stand, aktive Boni, Wohltäter) ───────────────────
  const _tr     = appData.treasury || { balance: 0, contributions: {}, unlocked_goals: {} };
  const _perks  = (typeof treasuryGroupPerks === 'function') ? treasuryGroupPerks(_tr) : { perCup: 0, perDay: 0 };
  const _topId  = (typeof treasuryTopContributor === 'function') ? treasuryTopContributor(_tr, users.map(u => u.id)) : null;
  const _topU   = _topId ? users.find(u => u.id === _topId) : null;
  const _perkStr = [
    _perks.perCup   > 0 ? `+${_perks.perCup} CC/Tasse` : '',
    _perks.perDay   > 0 ? `+${_perks.perDay} CC passiv/Tag` : '',
    _perks.steps    > 0 ? `+${_perks.steps} Schritte/Tag` : '',
    _perks.treasure > 0 ? `+${Math.round(_perks.treasure * 100)}% Schatz` : '',
  ].filter(Boolean).join(' · ') || 'noch keine — fülle die Kasse!';
  const _lvl = (typeof treasuryLevelInfo === 'function') ? treasuryLevelInfo(_tr) : null;
  let html = `<div class="cc-collapse-section">
    <button class="cc-collapse-btn" onclick="this.parentElement.classList.toggle('open')">
      🏛️ Gruppenübersicht <span class="cc-collapse-arrow">▸</span>
    </button>
    <div class="cc-collapse-body"><div class="cc-stats-kasse">
      <div class="cc-stats-kasse-row"><span>🏛️ Gruppenkasse</span><strong>${_fmtCoins(_tr.balance)} GC</strong></div>
      ${_lvl ? `<div class="cc-stats-kasse-row"><span>${_lvl.icon} Kassen-Stufe</span><strong>${_lvl.level}/5 · ${_esc2(_lvl.name)}</strong></div>` : ''}
      <div class="cc-stats-kasse-row"><span>🎁 Aktive Gruppen-Boni</span><strong>${_perkStr}</strong></div>
      ${_topU ? `<div class="cc-stats-kasse-row"><span>🎗️ Größter Wohltäter</span><strong>${_esc2(_topU.name)}</strong></div>` : ''}
    </div></div>
  </div>`;
  // ── Dungeon-Rangliste + Spieler-Karten (aufklappbar) ────────────────────────
  let _statsBody = '';
  const _dungUsers = users.filter(u => (u.map_data?.dungeonStats?.count || 0) > 0);
  if (_dungUsers.length > 0) {
    const _dBest   = [..._dungUsers].sort((a,b) => (b.map_data.dungeonStats.bestScore||0) - (a.map_data.dungeonStats.bestScore||0))[0];
    const _dActive = [..._dungUsers].sort((a,b) => (b.map_data.dungeonStats.count||0)     - (a.map_data.dungeonStats.count||0))[0];
    _statsBody += `<div class="cc-stats-kasse" style="margin-top:10px">
      <div class="cc-stats-kasse-row"><span>⚔️ Reaktionsstärkster</span><strong>${_esc2(_dBest.name)} · ${_dBest.map_data.dungeonStats.bestScore} Pkte.</strong></div>
      <div class="cc-stats-kasse-row"><span>🏚️ Meiste Dungeons</span><strong>${_esc2(_dActive.name)} · ${_dActive.map_data.dungeonStats.count}×</strong></div>
    </div>`;
  }
  _statsBody += '<div class="cc-stats-list">';
  for (const u of users) {
    const score   = typeof calcResearchScore  === 'function' ? calcResearchScore(u.research   || {}) : 0;
    const perDay  = typeof calcResearchPerDay === 'function' ? calcResearchPerDay(u.research  || {}) : 0;
    const perCup  = typeof calcResearchPerCup === 'function' ? calcResearchPerCup(u.research  || {}) : 0;
    const cosm    = u.cosmetics || {};
    const avatar  = cosm.avatar || '☕';
    // Karten-Statistiken
    const md        = u.map_data || {};
    const explCount = Object.keys(md.explored  || {}).length;
    const trCount   = Object.keys(md.treasures || {}).length;
    const upg       = md.upgrades || {};
    // Gebäude-Statistik
    const buildings = md.buildings || {};
    const bldDone   = Object.values(buildings).filter(b => b.completesAt <= Date.now());
    const bldPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(buildings) : 0;
    const bldIcons  = bldDone.map(b => {
      const d = (typeof karteBuildingDef === 'function') ? karteBuildingDef(b.type) : null;
      return d ? d.emoji : '';
    }).join('');
    const itemIcons = (typeof KARTE_ITEMS !== 'undefined' ? KARTE_ITEMS : [])
      .filter(function(i) {
        return !!(upg[i.key]) || (i.key === 'walking_boots' && upg.boots) || (i.key === 'coffee_nose' && upg.nose);
      })
      .map(function(i) { return i.emoji; })
      .join('');
    const today         = typeof _todayKey === 'function' ? _todayKey() : '';
    const activeEffects = (md.activeEffects || []).filter(function(e) { return e.expires === today; });
    const effectLine    = activeEffects.map(function(e) {
      if (e.type === 'step_bonus')     return '⚡+' + e.amount + ' Schritte';
      if (e.type === 'step_malus')     return '⚡−' + e.amount + ' Schritte';
      if (e.type === 'build_block')    return '🚫 Baustopp';
      if (e.type === 'treasure_boost') return '⚡×' + e.factor + ' Schatz';
      if (e.type === 'cc_multiplier')  return '⚡×1–' + e.max + ' Schatz';
      return '';
    }).filter(Boolean).join(' · ');
    _statsBody += `<div class="cc-stats-player">
      <div class="cc-stats-av">${avatar}</div>
      <div class="cc-stats-info">
        <div class="cc-stats-name">${_esc2(u.name)}</div>
        <div class="cc-stats-sub">
          ${_coinBadge(u.coins, 'sm')} ${_fmtCoins(u.coins)} CC
          &nbsp;·&nbsp; Forschung: ${score.toLocaleString('de-DE')} CC
          &nbsp;·&nbsp; +${_fmtCoins(perCup)}/T &nbsp;·&nbsp; +${_fmtCoins(perDay)}/Tag
        </div>
        <div class="cc-stats-sub cc-stats-karte">
          🗺️ ${explCount} Felder &nbsp;·&nbsp; 🏆 ${trCount} Schätze
          ${md.dungeonStats?.count ? `&nbsp;·&nbsp; ⚔️ ${md.dungeonStats.count}× (Best: ${md.dungeonStats.bestScore})` : ''}
          ${itemIcons ? '&nbsp;·&nbsp; ' + itemIcons : ''}
          ${effectLine ? '&nbsp;·&nbsp; <span class="cc-stats-effect">' + _esc2(effectLine) + '</span>' : ''}
        </div>
        ${bldDone.length ? `<div class="cc-stats-sub cc-stats-karte">🏗️ ${bldDone.length} Gebäude ${bldIcons}${bldPerDay > 0 ? ' &nbsp;·&nbsp; +' + _fmtCoins(bldPerDay) + '/Tag' : ''}</div>` : ''}
        ${typeof worldStatLineHTML === 'function' ? worldStatLineHTML(u, _wInv, _wByCountry) : ''}
        ${_buildResearchBars(u.research || {})}
      </div>
    </div>`;
  }
  _statsBody += '</div>';

  html += `<div class="cc-collapse-section">
    <button class="cc-collapse-btn" onclick="this.parentElement.classList.toggle('open')">
      👥 Spieler-Statistiken <span class="cc-collapse-arrow">▸</span>
    </button>
    <div class="cc-collapse-body">${_statsBody}</div>
  </div>`;

  const _hmContent = _buildForschungsHeatmap(appData.users);
  if (_hmContent) {
    html += `<div class="cc-collapse-section">
      <button class="cc-collapse-btn" onclick="this.parentElement.classList.toggle('open')">
        🔬 Forschungs-Heatmap <span class="cc-collapse-arrow">▸</span>
      </button>
      <div class="cc-collapse-body">${_hmContent}</div>
    </div>`;
  }

  const _krContent = _buildKriegerStats(appData.users);
  if (_krContent) {
    html += `<div class="cc-collapse-section">
      <button class="cc-collapse-btn" onclick="this.parentElement.classList.toggle('open')">
        ⚔️ Kaffee-Krieger <span class="cc-collapse-arrow">▸</span>
      </button>
      <div class="cc-collapse-body">${_krContent}</div>
    </div>`;
  }

  return html;
}

// Gruppen-Bestenliste Kaffee-Krieger (Statistik-Tab) — analog _buildForschungsHeatmap,
// sortiert nach Stufe absteigend. null wenn niemand je gespielt hat (kein leerer Block).
function _buildKriegerStats(users) {
  if (typeof kriegerProgress !== 'function') return null;
  const rows = (users || [])
    .map(u => ({ u, dd: u.dungeon_data || {} }))
    .filter(({ dd }) => (dd.level || 1) > 1 || (dd.wins || 0) > 0 || (dd.losses || 0) > 0)
    .map(({ u, dd }) => ({ u, dd, prog: kriegerProgress(dd) }))
    .sort((a, b) => b.prog.level - a.prog.level || b.prog.xp - a.prog.xp);
  if (!rows.length) return null;

  return rows.map(({ u, dd, prog }) => {
    const ownedCount = Object.keys(dd.owned || {}).length;
    return `<div class="cc-stats-kasse-row">
      <span>⚔️ ${_esc2(u.name)} · Stufe ${prog.level}${prog.need ? ` (${prog.pct}%)` : ' (MAX)'}</span>
      <strong>🏆 ${dd.wins || 0} · 💀 ${dd.losses || 0} · 🐉 ${dd.bossKills || 0} · 🎒 ${ownedCount}/${KRIEGER_ITEMS.length}</strong>
    </div>`;
  }).join('');
}

function _buildResearchBars(research) {
  let html = '<div class="cc-res-bars">';
  for (const [key, path] of Object.entries(RESEARCH_PATHS || {})) {
    const total  = path.items.length;
    const owned  = path.items.filter(i => research[i.id]).length;
    const pct    = total > 0 ? Math.round((owned / total) * 100) : 0;
    html += `<div class="cc-res-bar-row">
      <span class="cc-res-bar-lbl">${path.icon}</span>
      <div class="cc-res-bar"><div class="cc-res-bar-fill" style="width:${pct}%"></div></div>
      <span class="cc-res-bar-val">${owned}/${total}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

// ── Cosmetics ─────────────────────────────────────────────────────────────────
function _buildCosmetics(member) {
  const cosm     = member.cosmetics || {};
  const research = member.research  || {};
  const achs     = member.achievements || {};

  // Ermittle freigeschaltete Themes
  function themeUnlocked(t) {
    if (t.free) return true;
    if (t.id === 'waldcafe'  && research.natur_cafe)         return true;
    if (t.id === 'berge'     && research.weltreise)           return true;
    if (t.id === 'fruehling' && member.maxStreak >= 30)       return true;
    if (t.id === 'beach'     && (member.monthlyWins || 0) > 0)return true;
    if (t.id === 'midnight'  && member.maxStreak >= 100)      return true;
    if (t.id === 'herbst'    && member.totalCups >= 500)      return true;
    if (t.id === 'zen'       && research.wildnis_camp)        return true;
    if (t.id === 'roester'   && research.fahrende_roesterei)  return true;
    // Saisonale Gewinner-Themes
    if (t.id.startsWith('saison_') && (cosm.seasonThemes || []).includes(t.id)) return true;
    return false;
  }

  function avatarUnlocked(a) {
    if (a.free) return true;
    if (a.id === 'keimling' && research.duengemittel)         return true;
    if (a.id === 'feuer'    && research.roestmaschine)        return true;
    if (a.id === 'welt'     && research.weltreise)            return true;
    if (a.id === 'kunst'    && research.barista_kunstwerk)    return true;
    if (a.id === 'krone'    && member.totalCups >= 5000)      return true;
    if ((a.id === 'kanne' || a.id === 'bubble') && a.cost)   return !!(cosm.boughtAvatars || {})[a.id];
    return false;
  }

  const activeTheme  = cosm.theme  || 'default';
  const activeAvatar = cosm.avatar || '☕';
  const activeTitel  = cosm.zusatztitel || '';
  const cafeName     = cosm.cafeName || '';

  let html = `
    <div class="cc-info-box" style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:.82rem;line-height:1.5;opacity:.85">
      ℹ️ <strong>Was bringen Cosmetics?</strong> Sie sind dein Style, nicht dein Vorteil — kein Effekt auf CC oder Forschung.
      <br>🎨 <strong>Theme</strong> ändert sofort die Farben der ganzen App (Hintergrund, Akzentfarbe, Header).
      <br>🎭 <strong>Avatar</strong> erscheint überall neben deinem Namen (Rangliste, Chat, Header).
      <br>🏷️ <strong>Zusatztitel</strong> wird hinter deinem Namen angezeigt — Statussymbol für Forschung/Erfolge.
      <br>☕ <strong>Café-Name</strong> ist dein persönlicher Gruppen-Spitzname.
    </div>

    <div class="section-title" style="margin-bottom:8px">☕ Café-Name</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input type="text" id="cafe-name-input" value="${_esc2(cafeName)}" placeholder="z.B. Kaffeehaus zur goldenen Bohne" maxlength="40" style="flex:1">
      <button class="btn-primary" data-cosm-set="cafeName" data-cosm-val="__input__cafe-name-input" style="padding:8px 14px;font-size:.82rem">Speichern</button>
    </div>

    <div class="section-title" style="margin-bottom:8px">🎭 Avatar</div>
    <div class="cc-cosm-grid" style="margin-bottom:16px">
      ${(COSMETIC_AVATARS || []).map(a => {
        const unlocked = avatarUnlocked(a);
        const active   = (cosm.avatar || '☕') === a.icon;
        return `<div class="cc-cosm-item ${active ? 'cc-cosm-active' : ''} ${!unlocked ? 'cc-cosm-locked' : ''}">
          <div class="cc-cosm-icon">${a.icon}</div>
          <p class="cc-cosm-name">${a.name}</p>
          <p class="cc-cosm-how">${a.how}</p>
          ${unlocked && !active ? `<button class="cc-cosm-btn" data-cosm-set="avatar" data-cosm-val="${a.icon}">Auswählen</button>` : ''}
          ${a.cost && !avatarUnlocked(a) ? `<button class="cc-cosm-btn" data-cosm-set="buyAvatar" data-cosm-val="${a.id}">Kaufen ${a.cost} CC</button>` : ''}
        </div>`;
      }).join('')}
    </div>

    <div class="section-title" style="margin-bottom:8px">🌲 Theme</div>
    <div class="cc-cosm-grid" style="margin-bottom:16px">
      ${(COSMETIC_THEMES || []).map(t => {
        const unlocked = themeUnlocked(t);
        const active   = activeTheme === t.id;
        return `<div class="cc-cosm-item ${active ? 'cc-cosm-active' : ''} ${!unlocked ? 'cc-cosm-locked' : ''}">
          <div class="cc-cosm-icon">${t.icon}</div>
          <p class="cc-cosm-name">${t.name}</p>
          <p class="cc-cosm-how">${t.how}</p>
          ${unlocked && !active ? `<button class="cc-cosm-btn" data-cosm-set="theme" data-cosm-val="${t.id}">Auswählen</button>` : ''}
        </div>`;
      }).join('')}
    </div>

    <div class="section-title" style="margin-bottom:8px">🏷️ Zusatztitel</div>
    <div class="cc-cosm-grid">
      ${(ZUSATZTITEL || []).map(z => {
        const unlocked = _isTitelUnlocked(z, member);
        const active   = activeTitel === z.id;
        return `<div class="cc-cosm-item ${active ? 'cc-cosm-active' : ''} ${!unlocked ? 'cc-cosm-locked' : ''}">
          <div class="cc-cosm-icon" style="font-size:18px">${z.icon}</div>
          <p class="cc-cosm-name">${z.name}</p>
          <p class="cc-cosm-how">${z.how}</p>
          ${unlocked && !active ? `<button class="cc-cosm-btn" data-cosm-set="zusatztitel" data-cosm-val="${z.id}">Aktivieren</button>` : ''}
          ${z.cost > 0 && !unlocked ? `<button class="cc-cosm-btn" data-cosm-set="buyTitel" data-cosm-val="${z.id}">Kaufen ${z.cost} CC</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  return html;
}

function _isTitelUnlocked(z, member) {
  const r = member.research || {};
  const cosm = member.cosmetics || {};
  if (z.id === 'caffe_nerd')   return !!(cosm.boughtTitel || {}).caffe_nerd;
  if (z.id === 'roestmeister') return !!r.roestmaschine;
  if (z.id === 'baron')        return !!r.exportplantage;
  if (z.id === 'bio')          return !!r.bio_zertifikat;
  if (z.id === 'toepfer')      return !!r.eigene_tasse;
  if (z.id === 'ki')           return !!r.ki_kaffee_genie;
  if (z.id === 'berg')         return !!(cosm.boughtTitel || {}).berg;
  if (z.id === 'nomade')       return !!r.fahrende_roesterei;
  if (z.id === 'wald')         return !!r.natur_cafe;
  if (z.id === 'kuenstler')    return !!r.barista_kunstwerk;
  if (z.id === 'beach')        return !!(cosm.boughtTitel || {}).beach;
  if (z.id === 'kaiser')       return member.totalCups >= 5000;
  return false;
}

// ── Event-Handler: Kauf, Kasse, Cosmetics ────────────────────────────────────
async function _handleBuy(itemId, member) {
  try {
    // Welche Zusatztitel hatte der Spieler VOR dem Kauf? (für Titel-Freischaltungs-Chat)
    const titlesBefore = (typeof ZUSATZTITEL !== 'undefined')
      ? (ZUSATZTITEL || []).filter(z => _isTitelUnlocked(z, member)) : [];

    const result = await DB.purchaseResearchItem(member.id, itemId);
    appData = await DB.fetchData();
    const updatedMember = appData.users.find(u => u.id === member.id);
    if (updatedMember) currentUserData = { ...currentUserData, ...updatedMember };
    _updateHeaderCoins(updatedMember || member);
    showToast(`✓ ${result.item.name || itemId} freigeschaltet! (-${result.item.cost || 0} CC)`, 'success');
    if (result.autoUnlocked?.length) {
      for (const c of result.autoUnlocked) showToast(`✦ Kombo: ${c.name} freigeschaltet!`, 'success');
    }

    // Chat-Benachrichtigungen — Fehler hier dürfen den Kauf nicht beeinträchtigen.
    try {
      await DB.postMessage(`${member.name} hat ${result.item.icon} ${result.item.name} freigeschaltet! 🔬`, member.name);
      for (const combo of (result.autoUnlocked || [])) {
        await DB.postMessage(`${member.name} hat ✦ ${combo.icon} ${combo.name} kombiniert! 🎉`, member.name);
      }
      // Neu freigeschaltete Zusatztitel (durch Forschung, z.B. Röstmeister/Baron/Bio…)
      if (typeof ZUSATZTITEL !== 'undefined' && updatedMember) {
        const titlesAfter = (ZUSATZTITEL || []).filter(z => _isTitelUnlocked(z, updatedMember));
        for (const t of titlesAfter.filter(z => !titlesBefore.find(b => b.id === z.id))) {
          await DB.postMessage(`${member.name} hat den Titel ${t.icon} ${t.name} freigeschaltet! ✨`, member.name);
        }
      }
    } catch (e) { console.warn('Chat-Post (Forschung) fehlgeschlagen:', e); }

    await renderImperium();
  } catch (e) { showToast(e.message, 'error'); }
}

async function _handleContribute(_, member) {
  const input  = document.getElementById('kasse-input');
  const amount = parseFloat(input?.value || '0');
  if (!amount || amount < 1) { showToast('Betrag eingeben!', 'error'); return; }
  try {
    const result = await DB.contributeToTreasury(member.id, amount);
    // Einzahlungs-Meldung in den Gruppen-Chat
    try {
      await DB.postMessage(`🏛️ ${_esc2(member.name)} hat ${_fmtCoins(amount)} CC in die Gruppenkasse eingezahlt! (Stand: ${_fmtCoins(result.treasury_balance)} GC)`, member.name);
    } catch (e) { console.warn('Chat-Post (Einzahlung) fehlgeschlagen:', e); }
    // Erreichte Gruppen-Ziele freischalten + im Chat verkünden
    try {
      const newly = await DB.syncTreasuryGoals();
      for (const g of newly) {
        await DB.postMessage(`${g.icon} Gruppen-Ziel erreicht: „${g.name}"! ${g.desc} — gilt ab jetzt für alle.`, member.name);
      }
      if (newly.length) showToast(`${newly[0].icon} Gruppen-Ziel freigeschaltet: ${newly[0].name}!`, 'success');
    } catch (e) { console.warn('syncTreasuryGoals fehlgeschlagen:', e); }
    appData = await DB.fetchData();
    const updatedMember = appData.users.find(u => u.id === member.id);
    if (updatedMember) currentUserData = { ...currentUserData, ...updatedMember };
    _updateHeaderCoins(updatedMember || member);
    showToast(`🏛️ ${_fmtCoins(amount)} GC eingezahlt! Kasse: ${_fmtCoins(result.treasury_balance)} GC`, 'success');
    await renderImperium();
  } catch (e) { showToast(e.message, 'error'); }
}

async function _handleCosmeticsSet(field, val, member) {
  // Wert aus Input-Feld lesen wenn nötig
  if (val && val.startsWith('__input__')) {
    const inputId = val.replace('__input__', '');
    val = document.getElementById(inputId)?.value?.trim() || '';
  }

  const cosm = { ...(member.cosmetics || {}) };

  if (field === 'avatar')      cosm.avatar = val;
  if (field === 'theme')       cosm.theme  = val;
  if (field === 'cafeName')    cosm.cafeName = val;
  if (field === 'zusatztitel') cosm.zusatztitel = val;

  if (field === 'buyAvatar') {
    const av = (COSMETIC_AVATARS || []).find(a => a.id === val);
    if (!av?.cost) return;
    const newCoins = await DB.spendCoins(member.id, av.cost);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    cosm.boughtAvatars = { ...(cosm.boughtAvatars || {}), [val]: true };
    cosm.avatar = av.icon;
    try { await DB.appendTodayLogFresh(member.id, [{ label: `🎨 Avatar: ${av.name}`, amount: -av.cost, cat: 'cosmetics', detail: 'Cosmetics' }]); } catch (e) {}
    showToast(`✓ Avatar "${av.name}" gekauft! (-${av.cost} CC)`, 'success');
  }

  if (field === 'buyTitel') {
    const t = (ZUSATZTITEL || []).find(z => z.id === val);
    if (!t?.cost) return;
    const newCoins = await DB.spendCoins(member.id, t.cost);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    cosm.boughtTitel = { ...(cosm.boughtTitel || {}), [val]: true };
    cosm.zusatztitel = val;
    try { await DB.appendTodayLogFresh(member.id, [{ label: `🏷️ Titel: ${t.name}`, amount: -t.cost, cat: 'cosmetics', detail: 'Cosmetics' }]); } catch (e) {}
    showToast(`✓ Titel "${t.name}" gekauft! (-${t.cost} CC)`, 'success');
    try {
      await DB.postMessage(`${member.name} hat den Titel ${t.icon} ${t.name} erworben! ✨`, member.name);
    } catch (e) { console.warn('Chat-Post (Titel-Kauf) fehlgeschlagen:', e); }
  }

  try {
    await DB.saveCosmetics(member.id, cosm);
    appData = await DB.fetchData();
    const updatedMember = appData.users.find(u => u.id === member.id);
    if (updatedMember) currentUserData = { ...currentUserData, ...updatedMember };
    _updateHeaderCoins(updatedMember || member);
    if (field === 'theme') applyTheme(cosm.theme);
    if (field === 'avatar' || field === 'buyAvatar') {
      const headerAv = document.getElementById('btn-logout');
      if (headerAv) headerAv.textContent = cosm.avatar || '☕';
    }
    if (field !== 'cafeName') showToast('✓ Gespeichert!', 'success');
    _renderImperiumTab('cosmetics', updatedMember || member);
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Profil-Zusätze: Coins + Sprüche ──────────────────────────────────────────
function renderCoinSection(member) {
  const el = document.getElementById('coins-section');
  if (!el || !member) return;
  const cosm     = member.cosmetics  || {};
  const lt       = DB.getTitle ? DB.getTitle(member.totalCups) : '';
  const ztDef    = (ZUSATZTITEL || []).find(z => z.id === cosm.zusatztitel);
  const cafeName = cosm.cafeName
    ? `<p class="cc-cafe-name">„${_esc2(cosm.cafeName)}"</p>`
    : '';

  // Saisonpokale
  const trophies = cosm.trophies || [];
  const MONATE   = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const trophyHtml = trophies.length > 0
    ? `<div class="cc-trophies">${trophies.map(sid => {
        const [y, mo] = sid.split('-');
        return `<span class="cc-trophy" title="Champion ${MONATE[parseInt(mo)-1]} ${y}">🏆<small>${MONATE[parseInt(mo)-1]}&nbsp;${y.slice(2)}</small></span>`;
      }).join('')}</div>`
    : '';

  // Jahres-Champion
  const jcHtml = cosm.jahresChampion
    ? `<div class="cc-jahres-champion">🌟 Jahres-Champion ${cosm.jahresChampion}</div>`
    : '';

  el.innerHTML = `
    <div class="cc-profile-coins">
      <div class="section-title" style="margin-bottom:10px">☕ CoffeeCoins</div>
      <div class="cc-coins-display">
        ${_coinBadge(member.coins, 'lg')}
        <div>
          <div class="cc-coins-amount">${_fmtCoins(member.coins)} CC</div>
          <div class="cc-coins-passive">+${_fmtCoins(typeof calcResearchPerCup === 'function' ? calcResearchPerCup(member.research||{}) : 0)} CC/Tasse</div>
          ${_buildPassivBreakdown(member)}
        </div>
      </div>
      ${cafeName}
      ${trophyHtml}
      ${jcHtml}
      ${lt || ztDef ? `<div class="cc-titel-combo">
        ${lt ? `<span class="cc-lt">${_esc2(lt)}</span>` : ''}
        ${ztDef ? `<span class="cc-sep">·</span><span class="cc-zt">${ztDef.icon} ${_esc2(ztDef.name)}</span>` : ''}
      </div>` : ''}
    </div>`;
}

function renderSprueche(member) {
  const el = document.getElementById('sprueche-section');
  if (!el || !member) return;
  const cosm     = member.cosmetics   || {};
  const achs     = member.achievements || {};
  const packs    = cosm.unlockedPacks  || {};
  const quote    = (typeof getCurrentSpruch === 'function')
    ? getCurrentSpruch(member.totalCups, achs, packs)
    : '„Kaffee ist fertig."';

  const availPacks = (SPRUCH_PACKS || []).filter(p => !packs[p.id]);

  const boosterCost = typeof SPRUCH_BOOSTER_COST !== 'undefined' ? SPRUCH_BOOSTER_COST : 250;

  el.innerHTML = `
    <div class="cc-sprueche-section">
      <div class="section-title" style="margin-bottom:8px">💬 Markiger Spruch</div>
      <div class="cc-quote-card">„${_esc2(quote)}"</div>
      ${availPacks.length > 0 ? `
        <div class="section-title" style="margin:12px 0 8px">🎁 Spruch-Packs (je 50 CC)</div>
        <div class="cc-pack-grid">
          ${availPacks.map(p => `
            <div class="cc-pack-item">
              <span class="cc-pack-icon">${p.icon}</span>
              <p class="cc-pack-name">${p.name}</p>
              <button class="cc-pack-buy" data-buy-pack="${p.id}">50 CC</button>
            </div>`).join('')}
        </div>` : ''}
      ${availPacks.length > 1 ? `
        <div class="cc-booster-card">
          <span class="cc-pack-icon">🚀</span>
          <div>
            <p class="cc-pack-name" style="margin-bottom:2px">Sprüche-Booster</p>
            <p class="cc-cosm-how" style="margin:0">Alle ${availPacks.length} restlichen Packs auf einmal</p>
          </div>
          <button class="cc-pack-buy" data-buy-booster="1">${boosterCost} CC</button>
        </div>` : ''}
    </div>`;

  el.onclick = async (e) => {
    const boosterBtn = e.target.closest('[data-buy-booster]');
    if (boosterBtn) {
      const newCoins = await DB.spendCoins(member.id, boosterCost);
      if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
      const newUnlocked = { ...(cosm.unlockedPacks || {}) };
      for (const p of availPacks) newUnlocked[p.id] = true;
      const newCosm = { ...(member.cosmetics || {}), unlockedPacks: newUnlocked };
      await DB.saveCosmetics(member.id, newCosm);
      try { await DB.appendTodayLogFresh(member.id, [{ label: '🚀 Sprüche-Booster', amount: -boosterCost, cat: 'cosmetics', detail: 'Cosmetics' }]); } catch (e) {}
      appData = await DB.fetchData();
      const updated = appData.users.find(u => u.id === member.id);
      if (updated) { currentUserData = { ...currentUserData, ...updated }; renderSprueche(updated); }
      _updateHeaderCoins(updated || member);
      if (typeof renderPackPresets === 'function') renderPackPresets(updated || member);
      showToast(`🚀 Sprüche-Booster aktiviert! ${availPacks.length} Packs freigeschaltet! (-${boosterCost} CC)`, 'success');
      return;
    }
    const btn = e.target.closest('[data-buy-pack]');
    if (!btn) return;
    const packId = btn.dataset.buyPack;
    const newCoins = await DB.spendCoins(member.id, 50);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    const newCosm = { ...(member.cosmetics || {}), unlockedPacks: { ...(cosm.unlockedPacks || {}), [packId]: true } };
    await DB.saveCosmetics(member.id, newCosm);
    try { await DB.appendTodayLogFresh(member.id, [{ label: '💬 Sprüche-Pack', amount: -50, cat: 'cosmetics', detail: 'Cosmetics' }]); } catch (e) {}
    appData = await DB.fetchData();
    const updated = appData.users.find(u => u.id === member.id);
    if (updated) { currentUserData = { ...currentUserData, ...updated }; renderSprueche(updated); }
    _updateHeaderCoins(updated || member);
    if (typeof renderPackPresets === 'function') renderPackPresets(updated || member);
    showToast(`🎁 Pack freigeschaltet! (-50 CC)`, 'success');
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Pixel Exploration Karte ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _karteSeedCache = null;
function _karteWorldSeed() {
  if (_karteSeedCache !== null) return _karteSeedCache;
  try {
    const group = AUTH.getGroup();
    const gid = group?.id || group?.name;
    if (!gid) return 12345678;
    let h = 5381;
    for (let i = 0; i < gid.length; i++) h = (((h << 5) + h) + gid.charCodeAt(i)) | 0;
    _karteSeedCache = (h >>> 0) || 12345678;
    return _karteSeedCache;
  } catch { return 12345678; }
}

// Aktualisiert nur die Text/Bar-Elemente — kein DOM-Rebuild
function _karteUpdateHUD(state) {
  const stepsMax  = karteStepsAllowed(state.mapData, state.research);
  const stepsUsed = karteStepsUsed(state.mapData);
  const stepsLeft = Math.max(0, stepsMax - stepsUsed);
  const pos       = kartePos(state.mapData);
  const explCount = Object.keys(state.mapData.explored  || {}).length;
  const trCount   = Object.keys(state.mapData.treasures || {}).length;

  const fill    = document.getElementById('karte-step-fill');
  const num     = document.getElementById('karte-step-num');
  const hint    = document.getElementById('karte-hint');
  const posEl   = document.getElementById('karte-pos');
  const statsEl = document.getElementById('karte-stats');
  const buyBtn  = document.getElementById('cc-karte-buy-steps');

  if (fill) fill.style.width = `${stepsMax > 0 ? Math.min(100, stepsUsed / stepsMax * 100) : 0}%`;
  if (num)  num.textContent  = `${stepsUsed}/${stepsMax}`;
  if (hint) {
    hint.className = 'cc-karte-hint' + (stepsLeft === 0 ? ' cc-karte-hint--done' : '');
    hint.innerHTML = stepsLeft === 0
      ? '⏳ Alle Schritte verbraucht — morgen wieder 5 verfügbar!'
      : `Klick auf ein <span style="color:var(--gold)">leuchtendes</span> Feld &nbsp;(${stepsLeft} Schritte übrig)`;
  }
  if (posEl)   posEl.textContent   = `📍 ${pos.x}, ${pos.y}`;
  if (statsEl) statsEl.textContent = `🗺️ ${explCount} Felder · 🏆 ${trCount} Schätze`;
  if (buyBtn)  buyBtn.style.display = !karteExtraStepsBought(state.mapData) ? 'block' : 'none';
}

function _buildKarte(member, el) {
  let mapData = member.map_data || {};

  // Start-Tile beim ersten Öffnen auto-erkunden
  if (!mapData.explored || Object.keys(mapData.explored).length === 0) {
    mapData = {
      ...mapData,
      pos: { x: KARTE_START_X, y: KARTE_START_Y },
      explored: { [`${KARTE_START_X},${KARTE_START_Y}`]: Date.now() },
    };
    DB.updateMapData(member.id, mapData).catch(() => {});
  }

  const _COLS = Math.floor(320 / KARTE_TILE);
  const _ROWS = Math.floor(280 / KARTE_TILE);
  const _MARGIN = 4;  // Rand-Abstand bevor Viewport scrollt

  // Viewport auf aktuelle Spielerposition zentrieren (nicht auf Start)
  const initPos = kartePos(mapData);
  const state = {
    mapData,
    research: member.research || {}, // für Forschungs-Tier-Schritte/Schatz-Bonus
    memberCoins: member.coins || 0,
    vpX: Math.max(0, Math.min(KARTE_WORLD - _COLS, initPos.x - Math.floor(_COLS / 2))),
    vpY: Math.max(0, Math.min(KARTE_WORLD - _ROWS, initPos.y - Math.floor(_ROWS / 2))),
  };
  const seed  = _karteWorldSeed();

  // Gruppenkasse-Schritte-Bonus (Ziel „Gruppen-Wanderwege") für die Schritt-Berechnung setzen
  if (typeof karteSetGroupSteps === 'function' && typeof treasuryGroupPerks === 'function') {
    karteSetGroupSteps(treasuryGroupPerks(appData?.treasury).steps);
  }

  // Fertiggestellte Baustellen seit dem letzten Öffnen melden (einmalig, done-Flag)
  const _justDone = Object.entries(state.mapData.buildings || {})
    .filter(([, b]) => b.completesAt <= Date.now() && !b.done);
  if (_justDone.length) {
    const nb = { ...state.mapData.buildings };
    for (const [k, b] of _justDone) nb[k] = { ...b, done: true };
    state.mapData = { ...state.mapData, buildings: nb };
    DB.updateMapData(member.id, state.mapData).catch(() => {});
    currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
    // Fertigstellung wie ein Achievement anzeigen ("Wassermühle aktiv!")
    _justDone.forEach(([, b], i) => {
      const def = karteBuildingDef(b.type);
      if (!def) return;
      const desc = def.perDay    ? `Liefert jetzt +${def.perDay} CC/Tag`
                 : def.harbor    ? 'Handelshafen aktiv — 1% aller Forschungskäufe'
                 : def.stepBonus ? `Dauerhaft +${def.stepBonus} Schritt/Tag`
                 : def.fogRadius ? 'Deckt den Nebel im Umkreis auf'
                 : 'Gebäude fertiggestellt';
      setTimeout(() => {
        if (typeof showAchievementPopup === 'function') {
          showAchievementPopup({ icon: def.emoji, name: `${def.name} aktiv!`, desc });
        } else {
          showToast(`🏗️ ${def.name} aktiv!`, 'success');
        }
      }, i * 3700); // mehrere Fertigstellungen nacheinander, nicht überlappend
    });
  }

  // ── DOM einmalig aufbauen ──────────────────────────────────────────────
  const stepsMax0  = karteStepsAllowed(state.mapData, state.research);
  const stepsUsed0 = karteStepsUsed(state.mapData);
  const stepsLeft0 = Math.max(0, stepsMax0 - stepsUsed0);
  const extraB0    = karteExtraStepsBought(state.mapData);
  const pos0       = kartePos(state.mapData);
  const expl0      = Object.keys(state.mapData.explored  || {}).length;
  const tr0        = Object.keys(state.mapData.treasures || {}).length;
  const buyBtnDisplay = !extraB0 ? 'block' : 'none';
  const hintClass     = stepsLeft0 === 0 ? ' cc-karte-hint--done' : '';
  const hintText      = stepsLeft0 === 0
    ? '&#9203; Alle Schritte verbraucht &mdash; morgen wieder 5 verf&uuml;gbar!'
    : 'Klick auf ein <span style="color:var(--gold)">leuchtendes</span> Feld &nbsp;(' + stepsLeft0 + ' Schritte &uuml;brig)';

  // Item-Karten nach Slot gruppiert aufbauen (kein verschachteltes Template-Literal)
  const _slots0 = [...new Set(KARTE_ITEMS.map(function(i) { return i.slot; }))];
  const upgradeHtml = _slots0.map(function(slot) {
    const slotItems  = KARTE_ITEMS.filter(function(i) { return i.slot === slot; });
    const bestOwned0 = _getBestItemInSlot(slot, state.mapData?.upgrades || {});
    const itemsHtml  = slotItems.map(function(u) {
      const owned = !!(state.mapData?.upgrades?.[u.key]) ||
        (u.key === 'walking_boots' && state.mapData?.upgrades?.boots) ||
        (u.key === 'coffee_nose'   && state.mapData?.upgrades?.nose);
      const STACK_SLOTS = ['feet', 'bag'];
      const superseded = owned && bestOwned0 && bestOwned0.key !== u.key && !STACK_SLOTS.includes(slot);
      const actionHtml = owned
        ? '<div class="cc-karte-upg-status">' + (superseded ? '⬆️ Ersetzt' : '✅ Aktiv') + '</div>'
        : '<button class="cc-karte-upg-buy" data-upg="' + u.key + '" data-cost="' + u.cost + '">' + u.cost + ' 🫘</button>';
      return '<div class="cc-karte-upg-card' + (owned ? (superseded ? ' superseded' : ' owned') : '') + '">'
        + '<div class="cc-karte-upg-icon">' + u.emoji + '</div>'
        + '<div class="cc-karte-upg-name">' + u.name + '</div>'
        + '<div class="cc-karte-upg-desc">' + u.desc + '</div>'
        + actionHtml + '</div>';
    }).join('');
    return '<div class="cc-karte-slot">'
      + '<div class="cc-karte-slot-label">' + KARTE_SLOT_NAMES[slot] + '</div>'
      + '<div class="cc-karte-slot-items">' + itemsHtml + '</div></div>';
  }).join('');

  const stepBarPct = stepsMax0 > 0 ? Math.min(100, stepsUsed0 / stepsMax0 * 100) : 0;

  el.innerHTML = `
    <div class="cc-karte-wrap">
      <div class="cc-karte-topbar">
        <span id="karte-pos">📍 ${pos0.x}, ${pos0.y}</span>
        <span id="karte-stats">🗺️ ${expl0} Felder &nbsp;&middot;&nbsp; 🏆 ${tr0} Schätze</span>
      </div>
      <canvas id="cc-karte-canvas" class="cc-karte-canvas" width="320" height="280"></canvas>
      <div class="cc-karte-step-row">
        <span class="cc-karte-step-lbl">Schritte heute</span>
        <div class="cc-karte-step-bar-wrap">
          <div class="cc-karte-step-bar">
            <div class="cc-karte-step-fill" id="karte-step-fill" style="width:${stepBarPct}%"></div>
          </div>
        </div>
        <span id="karte-step-num">${stepsUsed0}/${stepsMax0}</span>
      </div>
      <button class="cc-karte-buy-steps" id="cc-karte-buy-steps" style="display:${buyBtnDisplay}">
        +5 Schritte kaufen &nbsp;&middot;&nbsp; 10 🫘 CC
      </button>
      <p class="cc-karte-hint${hintClass}" id="karte-hint">${hintText}</p>
      <p class="cc-karte-hint" style="opacity:.6;font-size:10px;margin-top:-2px">🏗️ Tipp auf ein erkundetes Feld, um dort zu bauen &nbsp;·&nbsp; ziehen = Karte verschieben</p>
      <div class="cc-karte-upgrades" id="karte-upgrades">${upgradeHtml}</div>
    </div>
    <div id="cc-karte-popup" class="cc-karte-popup hidden"></div>
  `;

  const canvas = document.getElementById('cc-karte-canvas');
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);

  // Kauf-Button Handler
  document.getElementById('cc-karte-buy-steps')?.addEventListener('click', async () => {
    const newCoins = await DB.spendCoins(member.id, 10);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    state.memberCoins = newCoins;
    currentUserData = { ...(currentUserData || {}), coins: newCoins };
    _updateHeaderCoins({ coins: newCoins });
    state.mapData = DB.appendTodayLog({ ...state.mapData, steps_extra_date: new Date().toLocaleDateString('de-DE') },
      [{ label: '👣 +5 Schritte gekauft', amount: -10, cat: 'karte', detail: 'Erkundungskarte' }]);
    await DB.updateMapData(member.id, state.mapData).catch(() => {});
    currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
    showToast('✅ +5 Schritte freigeschaltet!', 'success');
    _karteUpdateHUD(state);
    const c = document.getElementById('cc-karte-canvas');
    if (c) karteRender(c, state.mapData, seed, state.vpX, state.vpY, state.research);
  });

  // Upgrade-Kauf Handler
  document.getElementById('karte-upgrades')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-upg]');
    if (!btn) return;
    await _handleKarteUpgrade(btn.dataset.upg, parseInt(btn.dataset.cost), member, state, seed);
  });

  // ── Canvas-Interaktion: Tippen = Schritt/Bauen, Ziehen = Karte verschieben ──
  // Tap-vs-Drag-Unterscheidung über _DRAG_THRESH, damit normales Antippen nicht
  // versehentlich als Wischen gewertet wird (und umgekehrt).
  let _down = false, _moved = false, _sx = 0, _sy = 0, _startVpX = 0, _startVpY = 0;
  const _DRAG_THRESH = 8; // px

  function _tileFromEvent(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    return {
      tx: state.vpX + Math.floor(cx / KARTE_TILE),
      ty: state.vpY + Math.floor(cy / KARTE_TILE),
    };
  }

  canvas?.addEventListener('pointerdown', (e) => {
    _down = true; _moved = false;
    _sx = e.clientX; _sy = e.clientY;
    _startVpX = state.vpX; _startVpY = state.vpY;
    canvas.setPointerCapture?.(e.pointerId);
  });

  canvas?.addEventListener('pointermove', (e) => {
    if (!_down) return;
    const dxPx = e.clientX - _sx;
    const dyPx = e.clientY - _sy;
    if (!_moved && Math.abs(dxPx) < _DRAG_THRESH && Math.abs(dyPx) < _DRAG_THRESH) return;
    _moved = true;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    // Wischen nach rechts schiebt den Karten-Inhalt nach rechts → Viewport nach links
    const dxT = Math.round(dxPx * scaleX / KARTE_TILE);
    const dyT = Math.round(dyPx * scaleY / KARTE_TILE);
    const nvX = Math.max(0, Math.min(KARTE_WORLD - _COLS, _startVpX - dxT));
    const nvY = Math.max(0, Math.min(KARTE_WORLD - _ROWS, _startVpY - dyT));
    if (nvX !== state.vpX || nvY !== state.vpY) {
      state.vpX = nvX; state.vpY = nvY;
      karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);
    }
  });

  async function _onCanvasTap(e) {
    if (_moved) return; // war ein Wischen, kein Tippen
    const { tx, ty } = _tileFromEvent(e);
    // 0) Dungeon-Marker angetippt → Dungeon-Modal öffnen
    const _dt = state.mapData?.dungeonTile;
    if (state.mapData?.dungeonAvailable && _dt && tx === _dt.x && ty === _dt.y) {
      _showDungeonModal(member, state, seed);
      return;
    }
    // 1) Betretbares (angrenzendes, unerkundetes) Feld → Schritt
    if (karteCanStep(tx, ty, state.mapData, state.research)) {
      await _handleKarteStep(tx, ty, member, state, seed, _COLS, _ROWS, _MARGIN);
      return;
    }
    // 2) Erkundetes Feld → Gebäude-Info (falls Footprint trifft) oder Bau-Menü
    if (karteIsExplored(tx, ty, state.mapData)) {
      const cover = karteBuildingCovering(tx, ty, state.mapData.buildings || {});
      if (cover) { _showKarteBuildingInfo(cover.b); return; }

      // 2b) Steckenbleib-Schutz: Wenn der Spieler aktuell KEINEN regulären Schritt mehr
      // machen kann (alle 8 Nachbarn schon erkundet), hat freies Zurücklaufen Vorrang
      // vor dem Bau-Menü — sonst verhindert ein bebaubares Nachbarfeld (der Normalfall!)
      // das Zurücklaufen weiterhin permanent, weil unten der options.length-Branch zuerst
      // greift. Im NICHT-feststeckenden Normalfall bleibt das Bau-Menü wie gewohnt Vorrang
      // (kein Verlust der bisherigen "auf Nachbarfeld tippen → bauen"-UX).
      if (karteCanWalkBack(tx, ty, state.mapData) && karteIsStuck(state.mapData, state.research)) {
        await _handleKarteWalkBack(tx, ty, member, state, _COLS, _ROWS, _MARGIN);
        return;
      }

      const options = karteBuildableAt(tx, ty, state.mapData, seed);
      if (options.length) {
        if (karteIsBuildBlocked(state.mapData)) {
          showToast('🏛️ Umweltbehörde: heute keine Baugenehmigung!', 'error');
          return;
        }
        _showKarteBuildMenu(options, tx, ty, member, state, seed);
        return;
      }
      // 3) Leeres, bereits erkundetes Nachbarfeld ohne Bau-Option → kostenlos dorthin
      // zurücklaufen (kein Schrittverbrauch) — auch im Nicht-stuck-Fall, da hier sonst
      // (wie vor diesem Fix) gar nichts passieren würde.
      if (karteCanWalkBack(tx, ty, state.mapData)) {
        await _handleKarteWalkBack(tx, ty, member, state, _COLS, _ROWS, _MARGIN);
      }
    }
  }

  // Kostenloses Zurücklaufen auf ein erkundetes Feld — kein Schritt-/DB-Explore-Aufruf,
  // nur Position + Viewport + Render aktualisieren (Pendant zum Tail von _handleKarteStep).
  async function _handleKarteWalkBack(tx, ty, member, state, COLS, ROWS, MARGIN) {
    const prevMapData = state.mapData;
    state.mapData = karteWalkBack(tx, ty, state.mapData);
    try {
      await DB.updateMapData(member.id, state.mapData);
    } catch (e) {
      state.mapData = prevMapData;
      showToast('Konnte nicht zurücklaufen.', 'error');
      return;
    }
    currentUserData = { ...(currentUserData || {}), map_data: state.mapData };

    const pos  = kartePos(state.mapData);
    const pvpX = pos.x - state.vpX;
    const pvpY = pos.y - state.vpY;
    if (pvpX < MARGIN)            state.vpX = Math.max(0, pos.x - MARGIN);
    else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(KARTE_WORLD - COLS, pos.x - (COLS - MARGIN - 1));
    if (pvpY < MARGIN)            state.vpY = Math.max(0, pos.y - MARGIN);
    else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(KARTE_WORLD - ROWS, pos.y - (ROWS - MARGIN - 1));

    const canvas = document.getElementById('cc-karte-canvas');
    if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);
    _karteUpdateHUD(state);
  }

  canvas?.addEventListener('pointerup', (e) => {
    if (!_down) return;
    _down = false;
    canvas.releasePointerCapture?.(e.pointerId);
    _onCanvasTap(e);
  });
  canvas?.addEventListener('pointercancel', () => { _down = false; });
}

async function _handleKarteStep(tx, ty, member, state, seed, COLS, ROWS, MARGIN) {
  const prevMapData  = state.mapData;
  const upg          = state.mapData?.upgrades || {};
  const sensorItem   = _getBestItemInSlot('sensor', upg);
  const hasBart      = !!upg.barista_bart;            // look-Slot hat nur ein Item
  const sensorFactor = sensorItem?.key === 'truffle_nose' ? 2.2 : sensorItem ? 1.5 : 1.0;

  const _grpTreasure = (typeof treasuryGroupPerks === 'function') ? treasuryGroupPerks(appData?.treasury).treasure : 0;
  // 🧠 CIQ Karten-Perks: Schatzgräber (+50% Schatz-CC), Glückssträhne (+30% Schatz-/Event-Chance), Kaffeesatz-Leser (nur positive Events)
  const _cosm = member.cosmetics || {};
  const _ciqSchatz = (typeof ciqActive === 'function') && ciqActive(_cosm, 'schatzgraeber');
  const _ciqGlueck = (typeof ciqActive === 'function') && ciqActive(_cosm, 'gluecksstraehne');
  const _ciqSatz   = (typeof ciqActive === 'function') && ciqActive(_cosm, 'kaffeesatz_leser');
  let ccFactor = (1 + 0.25 * ((typeof completedResearchTiers === 'function') ? completedResearchTiers(member.research) : 0)) * (1 + _grpTreasure);
  if (_ciqSchatz) ccFactor *= 1.5;
  const { newMapData, treasure, event, dungeon } = karteExploreTile(tx, ty, state.mapData, seed, {
    treasureFactor: sensorFactor * (_ciqGlueck ? 1.3 : 1),
    backpackBoost:  !!upg.backpack,
    ccFactor,
    eventChanceFactor: _ciqGlueck ? 1.3 : 1,
    onlyPositiveEvents: _ciqSatz,
  });
  state.mapData = newMapData;

  try {
    await DB.updateMapData(member.id, newMapData);
  } catch {
    state.mapData = prevMapData;
    showToast('Karte konnte nicht gespeichert werden.', 'error');
    return;
  }

  currentUserData = { ...(currentUserData || {}), map_data: newMapData };

  if (treasure) {
    const bartBonus  = hasBart ? 1 : 0;
    let totalCC      = treasure.cc + bartBonus;
    // 🧠 CIQ Schatzräuber (Fremd-Debuff): die Hälfte JEDES Schatzfundes geht an den
    // Angreifer, solange der Debuff aktiv ist (24h) — NICHT mehr nur beim ersten Fund.
    // Vorher wurde der Eintrag nach einem einzigen Treffer aus ciq_debuffs entfernt; bei
    // seltenen Schatzfunden lohnten sich die 25 CC Angriffskosten damit kaum (User-Feedback
    // 2026-07-04). Der Debuff läuft jetzt einfach über ciqDebuffEntry()/expires_at aus, wie
    // alle anderen zeitlich befristeten Debuffs auch.
    const raubEntry = (typeof ciqDebuffEntry === 'function') ? ciqDebuffEntry(state.mapData, 'schatz_raeuber') : null;
    let raubStolen = 0, raubFrom = null;
    if (raubEntry) {
      raubStolen = Math.round(totalCC * (raubEntry.amount || 0.5));
      raubFrom   = raubEntry.from;
      totalCC    = totalCC - raubStolen;
    }
    // Optimistic UI update sofort
    state.memberCoins += totalCC;
    currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
    _updateHeaderCoins({ coins: state.memberCoins });
    try {
      await DB.addCoins(member.id, totalCC);
    } catch (e) { console.warn('add_coins Fehler:', e); }
    if (raubStolen > 0 && raubFrom) {
      DB.addCoins(raubFrom, raubStolen).catch(() => {});
      DB.postMessage(`💎 Ein Spitzel hat ${raubStolen} CC vom Schatzfund von ${_esc2(member.name)} abgezweigt!`, 'CIQ-Labor').catch(() => {});
      // Angreifer-Seite (raubFrom = ein anderer Spieler, nicht der aktive Client): Tages-Log
      // + ciqCcEarned nachführen — lief bisher nur über die CC-Gutschrift, tauchte nirgends auf.
      // Fresh-Read-Merge auf fremdes map_data (Race-Muster wie beim Bündnis-Tribut); nicht-kritisch:
      // darf den Schatzfund-Flow des Finders nie blockieren.
      (async () => {
        try {
          const fresh = await DB.fetchMemberMapData(raubFrom);
          let md = DB.appendTodayLog(fresh, [{ label: `💎 Schatzräuber-Beute von ${member.name}`, amount: raubStolen }]);
          md = { ...md, ciqCcEarned: (md.ciqCcEarned || 0) + raubStolen };
          await DB.updateMapData(raubFrom, md);
        } catch (e) { /* non-critical */ }
      })();
    }
    // Barista Bart: jeder ANDERE Mitspieler mit Bart erhält +1 CC pro Schatzfund
    if (typeof DB.payBaristaBartGroup === 'function') {
      DB.payBaristaBartGroup(member.id).catch(() => {});
    }
    try {
      const logEntries = [{ label: `🗺️ ${treasure.name}`, amount: totalCC, aggKey: 'karte_treasure', aggBase: '🗺️ Kartenschätze', detail: 'Karten-Erkundung' }];
      if (raubStolen > 0) logEntries.push({ label: '💎 Schatzräuber-Abzweig', amount: -raubStolen });
      state.mapData = DB.appendTodayLog(state.mapData, logEntries);
      // Lifetime-Summe für den Informant-Bericht (_ccTreasureCc in app.js) — additiv, keine SQL nötig.
      state.mapData = { ...state.mapData, totalTreasureCc: (state.mapData.totalTreasureCc || 0) + totalCC };
      // Opfer-Lifetime-Summe „durch Angriffe verloren" (Informant, ciqCcLost) — der Finder ist der
      // aktive User, daher hier direkt am eigenen map_data (kein Fresh-Read nötig).
      if (raubStolen > 0) state.mapData = { ...state.mapData, ciqCcLost: (state.mapData.ciqCcLost || 0) + raubStolen };
      currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
      await DB.updateMapData(member.id, state.mapData);
    } catch (e) { console.warn('Tages-Log (Schatz) Fehler:', e); }
    try {
      await DB.postMessage(
        `🗺️ ${_esc2(member.name)} hat "${_esc2(treasure.name)}" entdeckt! (+${totalCC} ☕ CC)\n"${_esc2(treasure.quote)}"`,
        member.name
      );
    } catch (e) { console.warn('Chat-Broadcast Fehler:', e); }
    const displayTreasure = (bartBonus || raubStolen > 0) ? { ...treasure, cc: totalCC } : treasure;
    _showKarteDiscovery(displayTreasure); // nicht-blockierendes Auto-Popup (kein zusätzlicher Toast)
  } else if (event) {
    const eff = event.effect;
    let bonusCC   = 0;
    let penaltyCC = 0;
    let noteText  = '';

    if (eff.type === 'cc_bonus') {
      bonusCC  = eff.amount;
      noteText = '+' + bonusCC + ' CC';
    } else if (eff.type === 'cc_random') {
      bonusCC  = Math.floor(Math.random() * (eff.max - eff.min + 1)) + eff.min;
      noteText = '+' + bonusCC + ' CC';
    } else if (eff.type === 'cc_risk') {
      bonusCC  = eff.cc;
      noteText = '+' + eff.cc + ' CC, -' + eff.malus + ' Schritt morgen';
      // step_malus für morgen in activeEffects nachtragen
      const tom = _tomorrowKey();
      state.mapData = {
        ...state.mapData,
        activeEffects: [...(state.mapData.activeEffects || []),
          { type: 'step_malus', amount: eff.malus, expires: tom }]
      };
      state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name}`, amount: bonusCC, cat: 'karte' }]);
      await DB.updateMapData(member.id, state.mapData).catch(() => {});
      currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
    } else if (eff.type === 'step_malus' && eff.when === 'today') {
      noteText = '-' + eff.amount + ' Schritt heute';
    } else if (eff.type === 'step_malus' && eff.when === 'tomorrow') {
      noteText = '-' + eff.amount + ' Schritte morgen';
    } else if (eff.type === 'build_block') {
      noteText = '🚫 Heute keine Baugenehmigung';
    } else if (eff.type === 'cc_penalty') {
      penaltyCC = eff.amount;
      noteText  = '−' + penaltyCC + ' CC';
    } else if (eff.type === 'tile_block') {
      noteText = '🐾 Ein Feld ist heute blockiert';
    } else if (eff.type === 'storm_damage') {
      noteText = '🏚️ Ein Gebäude pausiert heute';
    } else if (eff.type === 'step_bonus') {
      noteText = '+' + eff.amount + ' Schritte heute';
    } else if (eff.type === 'treasure_boost') {
      noteText = 'Nächster Schatz ×' + eff.factor + ' CC';
    } else if (eff.type === 'cc_multiplier') {
      noteText = 'Nächster Schatz ×1–' + eff.max + ' CC';
    }

    if (bonusCC > 0) {
      state.memberCoins += bonusCC;
      currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
      _updateHeaderCoins({ coins: state.memberCoins });
      await DB.addCoins(member.id, bonusCC).catch(() => {});
      // cc_risk hat den Log-Eintrag bereits oben (zusammen mit dem step_malus) gespeichert
      if (eff.type !== 'cc_risk') {
        try {
          state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name}`, amount: bonusCC, cat: 'karte' }]);
          currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
          await DB.updateMapData(member.id, state.mapData);
        } catch (e) { console.warn('Tages-Log (Event) Fehler:', e); }
      }
    }

    if (penaltyCC > 0) {
      // gedeckelt aufs Guthaben — nie ins Minus
      const pay = Math.min(penaltyCC, state.memberCoins || 0);
      if (pay > 0) {
        state.memberCoins -= pay;
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
        _updateHeaderCoins({ coins: state.memberCoins });
        try { await DB.spendCoins(member.id, pay); } catch (e) { console.warn('cc_penalty Fehler:', e); }
        // Malus fließt in die Gruppenkasse (wie die Koffein-Strafe)
        try {
          if (typeof DB.addPenaltyToTreasury === 'function') await DB.addPenaltyToTreasury(pay);
        } catch (e) { console.warn('Malus → Gruppenkasse Fehler:', e); }
        try {
          state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name} → Gruppenkasse`, amount: -pay, cat: 'strafen' }]);
          currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
          await DB.updateMapData(member.id, state.mapData);
        } catch (e) { console.warn('Tages-Log (Strafe) Fehler:', e); }
      }
    }

    _showKarteEvent(event, noteText); // nicht-blockierendes Auto-Popup (kein zusätzlicher Toast)
  }

  // Viewport nur an Rändern verschieben (Spieler läuft sichtbar übers Canvas)
  const pos  = kartePos(state.mapData);
  const pvpX = pos.x - state.vpX;
  const pvpY = pos.y - state.vpY;
  if (pvpX < MARGIN)            state.vpX = Math.max(0, pos.x - MARGIN);
  else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(KARTE_WORLD - COLS, pos.x - (COLS - MARGIN - 1));
  if (pvpY < MARGIN)            state.vpY = Math.max(0, pos.y - MARGIN);
  else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(KARTE_WORLD - ROWS, pos.y - (ROWS - MARGIN - 1));

  // Canvas smooth neu zeichnen mit stabilem Viewport
  const canvas = document.getElementById('cc-karte-canvas');
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);

  _karteUpdateHUD(state);

  // Dungeon-Meilenstein: Modal nach Canvas-Update anzeigen
  if (dungeon) _showDungeonModal(member, state, seed);
}

async function _handleKarteUpgrade(key, cost, member, state, seed) {
  const upg = KARTE_ITEMS.find(u => u.key === key);
  if (!upg) return;
  const newCoins = await DB.spendCoins(member.id, cost);
  if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }

  state.memberCoins = newCoins;
  currentUserData = { ...(currentUserData || {}), coins: newCoins };
  _updateHeaderCoins({ coins: newCoins });

  state.mapData = DB.appendTodayLog({ ...state.mapData, upgrades: { ...(state.mapData.upgrades || {}), [key]: true } },
    [{ label: `🗺️ ${upg.name}`, amount: -cost, cat: 'karte', detail: 'Karten-Ausrüstung', invest: true }]);
  await DB.updateMapData(member.id, state.mapData).catch(() => {});
  currentUserData = { ...(currentUserData || {}), map_data: state.mapData };

  showToast(`${upg.emoji} ${upg.name} freigeschaltet!`, 'success');

  // Upgrade-Card auf "Aktiv" umschalten
  const btn = document.querySelector(`[data-upg="${key}"]`);
  if (btn) {
    const card = btn.closest('.cc-karte-upg-card');
    if (card) {
      card.classList.add('owned');
      const statusEl = document.createElement('div');
      statusEl.className = 'cc-karte-upg-status';
      statusEl.textContent = '✅ Aktiv';
      btn.replaceWith(statusEl);
    }
  }

  // Canvas neu rendern (Kompass ändert Fog-Rendering)
  const canvas = document.getElementById('cc-karte-canvas');
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);
  _karteUpdateHUD(state);
}

// ── Karten-Popups: Modal (mit Buttons) vs. Auto (Entdeckung/Ereignis) ──────────
// Entdeckungs-/Ereignis-Meldungen sollen das Weitergehen NICHT blockieren: kein
// "Weiter"-Button, nicht-blockierende Overlay (pointer-events:none → Taps gehen
// direkt aufs Canvas zum nächsten Feld) und Auto-Ausblenden nach kurzer Zeit.
let _kartePopupTimer = null;

// Modal-Popup (Bau-Menü / Gebäude-Info) — räumt einen evtl. laufenden Auto-Timer ab
// und stellt sicher, dass das Overlay wieder blockierend ist (kein --auto).
function _karteModalPopup() {
  const popup = document.getElementById('cc-karte-popup');
  if (!popup) return null;
  if (_kartePopupTimer) { clearTimeout(_kartePopupTimer); _kartePopupTimer = null; }
  popup.classList.remove('hidden', 'cc-karte-popup--auto');
  return popup;
}

// Auto-Popup — nicht-blockierend, verschwindet nach ms von selbst.
function _karteAutoPopup(innerHTML, ms = 2600) {
  const popup = document.getElementById('cc-karte-popup');
  if (!popup) return;
  if (_kartePopupTimer) { clearTimeout(_kartePopupTimer); _kartePopupTimer = null; }
  popup.className = 'cc-karte-popup cc-karte-popup--auto';
  popup.innerHTML = innerHTML;
  _kartePopupTimer = setTimeout(() => {
    const p = document.getElementById('cc-karte-popup');
    if (p) { p.classList.add('hidden'); p.classList.remove('cc-karte-popup--auto'); }
    _kartePopupTimer = null;
  }, ms);
}

function _showKarteDiscovery(treasure) {
  _karteAutoPopup(`
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr">✦ ENTDECKUNG!</div>
      <div class="cc-karte-popup-body">
        <span class="cc-karte-popup-emoji">${treasure.emoji}</span>
        <div class="cc-karte-popup-text">
          <strong>${_esc2(treasure.name)}</strong>
          <em>"${_esc2(treasure.quote)}"</em>
          <span class="cc-karte-popup-cc">+${treasure.cc} 🫘 CC</span>
        </div>
      </div>
    </div>
  `);
}

// ── Dungeon-Modal ─────────────────────────────────────────────────────────────
function _showDungeonModal(member, state, seed) {
  const popup = _karteModalPopup();
  if (!popup) return;
  const canAfford = (state.memberCoins || 0) >= 10;
  popup.innerHTML = `
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr">⚔️ DUNGEON ENTDECKT!</div>
      <div class="cc-karte-popup-body">
        <span class="cc-karte-popup-emoji" style="font-size:2.2rem">🏚️</span>
        <div class="cc-karte-popup-text">
          <strong>Ein verlassenes Lager wartet auf dich!</strong>
          <em>"Drinnen riecht es nach Kaffee… und Gefahr."</em>
          <span class="cc-karte-popup-cc">Einsatz: 10 🫘 → Kasse · Auszahlung: 0–25 🫘</span>
        </div>
      </div>
      <div class="cc-dungeon-btns">
        ${canAfford
          ? `<button class="jagd-btn" id="cc-dungeon-enter">⚔️ Betreten (10 🫘)</button>`
          : `<div class="jagd-no-cc">Zu wenig CC — mind. 10 🫘 nötig</div>`}
        <button class="cc-karte-popup-close"
          onclick="document.getElementById('cc-karte-popup').classList.add('hidden')">
          ⏳ Später
        </button>
      </div>
    </div>`;

  const enterBtn = popup.querySelector('#cc-dungeon-enter');
  if (enterBtn) enterBtn.onclick = async () => {
    document.getElementById('cc-karte-popup')?.classList.add('hidden');
    if (typeof openDungeonMinigame !== 'function') return;
    await openDungeonMinigame(member, {
      onStake: () => {
        state.memberCoins = Math.max(0, (state.memberCoins || 0) - 10);
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
        if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
      },
      onComplete: async (cc, score) => {
        // Dungeon-Stats aktualisieren
        const prevStats = state.mapData.dungeonStats || { count: 0, bestScore: 0 };
        const newStats  = { count: prevStats.count + 1, bestScore: Math.max(prevStats.bestScore || 0, score || 0) };
        state.mapData = {
          ...state.mapData,
          dungeonAvailable: false, dungeonTile: null,
          dungeonStats: newStats,
        };
        // Tages-Log
        state.mapData = DB.appendTodayLog(state.mapData, [{ label: `⚔️ Dungeon (${score || 0} Pkt.)`, amount: cc, cat: 'karte' }]);
        currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
        await DB.updateMapData(member.id, state.mapData).catch(() => {});
        // Coins
        if (cc > 0) {
          state.memberCoins = (state.memberCoins || 0) + cc;
          currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
          if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
        }
        // Canvas + HUD
        const cvs = document.getElementById('cc-karte-canvas');
        if (cvs) karteRender(cvs, state.mapData, seed, state.vpX, state.vpY, state.research);
        _karteUpdateHUD(state);
        // Chat-Broadcast
        try {
          const ccTxt = cc > 0 ? ` (+${cc} 🫘)` : '';
          await DB.postMessage(`⚔️ ${_esc2(member.name)} hat im Dungeon ${score || 0} Punkte gemacht${ccTxt}!`, member.name);
        } catch (e) { /* non-critical */ }
        // Dungeon-Achievements prüfen
        try {
          const existing = currentUserData?.achievements || {};
          const toGrant = {};
          if (!existing.dungeon_first  && newStats.count     >= 1)  toGrant.dungeon_first  = true;
          if (!existing.dungeon_5      && newStats.count     >= 5)  toGrant.dungeon_5      = true;
          if (!existing.dungeon_master && newStats.bestScore >= 60) toGrant.dungeon_master = true;
          if (Object.keys(toGrant).length > 0) {
            await DB.grantAchievements(member.id, toGrant);
            currentUserData = { ...(currentUserData || {}), achievements: { ...existing, ...toGrant } };
            for (const id of Object.keys(toGrant)) {
              const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === id);
              if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
            }
          }
        } catch (e) { /* non-critical */ }
      }
    });
  };
}

// ── Gebäude-Bau ───────────────────────────────────────────────────────────────
function _buildingEffectLabel(b) {
  if (b.perDay)    return `+${b.perDay} CC/Tag`;
  if (b.harbor)    return '1% aller Forschungskäufe der Gruppe';
  if (b.stepBonus) return `+${b.stepBonus} Schritt${b.stepBonus > 1 ? 'e' : ''}/Tag`;
  if (b.fogRadius) return 'Deckt Nebel im Umkreis auf';
  return '';
}

function _showKarteBuildMenu(options, cx, cy, member, state, seed) {
  const popup = _karteModalPopup();
  if (!popup) return;
  const rows = options.map(({ def, ax, ay }) => {
    const cost   = (typeof karteBuildCost === 'function') ? karteBuildCost(def, state.mapData, member.cosmetics) : def.cost;
    const afford = (state.memberCoins || 0) >= cost;
    const ownedType = (typeof karteBuildingCountOfType === 'function') ? karteBuildingCountOfType(state.mapData, def.key) : 0;
    const w = def.w || 1, h = def.h || 1;
    const size = (w > 1 || h > 1) ? ` · ${w}×${h}` : '';
    const ownedNote = ownedType > 0 ? ` · du hast ${ownedType}×` : '';
    return `<div class="cc-build-opt">
      <span class="cc-build-emoji">${def.emoji}</span>
      <div class="cc-build-info">
        <strong>${_esc2(def.name)}${size}</strong>
        <span class="cc-build-eff">${_buildingEffectLabel(def)} · fertig in ${def.days} Tag${def.days > 1 ? 'en' : ''}${ownedNote}</span>
      </div>
      <button class="cc-build-btn" data-build="${def.key}" data-ax="${ax}" data-ay="${ay}" ${afford ? '' : 'disabled'}>${afford ? 'Bauen' : 'zu wenig'} · ${cost} 🫘</button>
    </div>`;
  }).join('');
  popup.innerHTML = `
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr">🏗️ HIER BAUEN &nbsp;(${cx}, ${cy})</div>
      <p class="cc-build-hint">📈 Jeder weitere Bau desselben Typs kostet mehr</p>
      <div class="cc-build-list">${rows}</div>
      <button class="cc-karte-popup-close"
        onclick="document.getElementById('cc-karte-popup').classList.add('hidden')">
        Abbrechen
      </button>
    </div>
  `;
  const list = popup.querySelector('.cc-build-list');
  if (list) list.onclick = async (e) => {
    const btn = e.target.closest('[data-build]');
    if (!btn || btn.disabled) return;
    await _handleKarteBuild(btn.dataset.build, parseInt(btn.dataset.ax, 10), parseInt(btn.dataset.ay, 10), member, state, seed);
  };
}

function _showKarteBuildingInfo(b) {
  const popup = _karteModalPopup();
  if (!popup) return;
  const def = karteBuildingDef(b.type);
  if (!def) return;
  let status;
  if (b.completesAt <= Date.now()) {
    if (typeof _todayKey === 'function' && b.damaged === _todayKey()) {
      status = '🌩️ Sturmschaden — heute kein Einkommen (morgen repariert)';
    } else {
      status = _buildingEffectLabel(def) || 'Fertiggestellt';
    }
  } else {
    const rem = (typeof karteBuildRemaining === 'function')
      ? karteBuildRemaining(b.completesAt)
      : { text: Math.max(1, Math.ceil((b.completesAt - Date.now()) / 86400000)) + ' Tage' };
    status = `🚧 Im Bau — noch ca. ${rem.text}`;
  }
  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr">${def.emoji} ${_esc2(def.name)}</div>
      <div class="cc-karte-popup-body">
        <span class="cc-karte-popup-emoji">${def.emoji}</span>
        <div class="cc-karte-popup-text">
          <strong>${_esc2(def.name)}</strong>
          <em>${_esc2(status)}</em>
        </div>
      </div>
      <button class="cc-karte-popup-close"
        onclick="document.getElementById('cc-karte-popup').classList.add('hidden')">
        Schließen
      </button>
    </div>
  `;
}

async function _handleKarteBuild(buildingKey, ax, ay, member, state, seed) {
  const def = karteBuildingDef(buildingKey);
  if (!def) return;
  if (karteIsBuildBlocked(state.mapData)) {
    showToast('🏛️ Heute keine Baugenehmigung (Umweltbehörde)!', 'error');
    return;
  }
  // Re-Validierung (Stand kann sich seit Menü-Anzeige geändert haben)
  if (!karteCanBuildAt(buildingKey, ax, ay, state.mapData, seed)) {
    showToast('Hier kann nicht (mehr) gebaut werden.', 'error');
    return;
  }
  const cost = (typeof karteBuildCost === 'function') ? karteBuildCost(def, state.mapData, member.cosmetics) : def.cost;
  const newCoins = await DB.spendCoins(member.id, cost);
  if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }

  state.memberCoins = newCoins;
  currentUserData = { ...(currentUserData || {}), coins: newCoins };
  _updateHeaderCoins({ coins: newCoins });

  state.mapData = DB.appendTodayLog(karteStartBuild(buildingKey, ax, ay, state.mapData, Date.now()),
    [{ label: `🏗️ Bau: ${def.name}`, amount: -cost, cat: 'karte', detail: 'Erkundungskarte', invest: true }]);
  try {
    await DB.updateMapData(member.id, state.mapData);
  } catch {
    showToast('Bau konnte nicht gespeichert werden.', 'error');
  }
  currentUserData = { ...(currentUserData || {}), map_data: state.mapData };

  document.getElementById('cc-karte-popup')?.classList.add('hidden');
  showToast(`🏗️ ${def.name} im Bau — fertig in ${def.days} Tag${def.days > 1 ? 'en' : ''}!`, 'success');

  // Gruppen-Broadcast im Chat (analog zum Schatz-Fund)
  try {
    await DB.postMessage(
      `🏗️ ${_esc2(member.name)} baut "${_esc2(def.name)}" ${def.emoji} — fertig in ${def.days} Tag${def.days > 1 ? 'en' : ''}!`,
      member.name
    );
  } catch (e) { console.warn('Chat-Broadcast (Bau) Fehler:', e); }

  const canvas = document.getElementById('cc-karte-canvas');
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY, state.research);
  _karteUpdateHUD(state);
}

function _showKarteEvent(event, noteText) {
  _karteAutoPopup(`
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr cc-karte-popup-hdr--event">⚡ EREIGNIS!</div>
      <div class="cc-karte-popup-body">
        <span class="cc-karte-popup-emoji">${event.emoji}</span>
        <div class="cc-karte-popup-text">
          <strong>${_esc2(event.name)}</strong>
          <em>${_esc2(event.text)}</em>
          ${noteText ? '<span class="cc-karte-popup-cc">' + _esc2(noteText) + '</span>' : ''}
        </div>
      </div>
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚔️ Kaffee-Krieger RPG — Plan: plans/PLAN_kaffee_krieger.md
// Eigenständiges System (eigene Dungeon-Karte/Schritte/Stufe), läuft parallel zu
// Kaffee-Jagd/Pixel-Karte/Weltkarte ohne sie zu beeinflussen (Designentscheidung
// im Plan §0 — bewusst NICHT verschmolzen, geringeres Risiko Bestehendes zu zerlegen).
// Kampfausgang ist ausschließlich serverseitig (RPC dungeon_fight) — alles hier ist
// nur Anzeige/Eingabe, "Server ist Wahrheit".
// ═══════════════════════════════════════════════════════════════════════════

let _kriegerSubTab = 'dungeon'; // überlebt Re-Renders innerhalb der Session (wie _msgTab)

function _buildKrieger(member, el) {
  let dd = member.dungeon_data || {};

  // Start-Tile beim ersten Öffnen auto-erkunden (analog _buildKarte)
  if (!dd.explored || Object.keys(dd.explored).length === 0) {
    dd = {
      ...dd,
      pos: { x: KRIEGER_START_X, y: KRIEGER_START_Y },
      explored: { [`${KRIEGER_START_X},${KRIEGER_START_Y}`]: Date.now() },
    };
    DB.saveDungeonData(member.id, dd).catch(() => {});
  }

  const _COLS = Math.floor(320 / KRIEGER_TILE);
  const _ROWS = Math.floor(280 / KRIEGER_TILE);
  const _MARGIN = 4;
  const initPos = kriegerPos(dd);
  const state = {
    dd,
    memberCoins: member.coins || 0,
    vpX: Math.max(0, Math.min(KRIEGER_WORLD - _COLS, initPos.x - Math.floor(_COLS / 2))),
    vpY: Math.max(0, Math.min(KRIEGER_WORLD - _ROWS, initPos.y - Math.floor(_ROWS / 2))),
  };
  const seed = _kriegerWorldSeed();

  el.innerHTML = `
    <div class="krieger-subtabs" id="krieger-subtabs">
      <button class="krieger-subtab" data-ksub="dungeon">⚔️ Dungeon</button>
      <button class="krieger-subtab" data-ksub="shop">🛒 Ausrüstung</button>
      <button class="krieger-subtab" data-ksub="potions">🧪 Tränke</button>
      <button class="krieger-subtab" data-ksub="talents">🌟 Talente</button>
      <button class="krieger-subtab" data-ksub="progress">📊 Fortschritt</button>
    </div>
    <div id="krieger-body"></div>
  `;

  el.querySelectorAll('.krieger-subtab').forEach(b => b.onclick = () => {
    _kriegerSubTab = b.dataset.ksub;
    try { b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (e) {}
    _kriegerRenderSubTab(member, state, seed, _COLS, _ROWS, _MARGIN);
  });

  _kriegerRenderSubTab(member, state, seed, _COLS, _ROWS, _MARGIN);
}

function _kriegerRenderSubTab(member, state, seed, COLS, ROWS, MARGIN) {
  document.querySelectorAll('.krieger-subtab').forEach(b => b.classList.toggle('active', b.dataset.ksub === _kriegerSubTab));
  const body = document.getElementById('krieger-body');
  if (!body) return;
  if (_kriegerSubTab === 'dungeon')  _kriegerRenderDungeon(member, state, seed, COLS, ROWS, MARGIN, body);
  if (_kriegerSubTab === 'shop')     _kriegerRenderShop(member, state, body);
  if (_kriegerSubTab === 'potions')  _kriegerRenderPotions(member, state, body);
  if (_kriegerSubTab === 'talents')  _kriegerRenderTalents(member, state, body);
  if (_kriegerSubTab === 'progress') _kriegerRenderProgress(member, state, body);
}

// ── Sub-Tab: Tränke (Etappe 2) ───────────────────────────────────────────────
// Kauf über spend_coins + save_dungeon_data (buyKriegerPotion). Bestand lebt in
// dungeon_data.potions{key:anzahl}; Verbrauch/Effekt passiert serverseitig im Kampf.
function _kriegerRenderPotions(member, state, body) {
  const dd = state.dd;
  const cards = (typeof KRIEGER_POTIONS !== 'undefined' ? KRIEGER_POTIONS : []).map(p => {
    const have = (typeof kriegerPotionCount === 'function') ? kriegerPotionCount(dd, p.key) : ((dd.potions || {})[p.key] || 0);
    // Handelsprivileg-Set (2026-07-13): −15% Anzeige-/Kaufpreis auf Tränke (gleiche Helferin wie db.js).
    const effCost = (typeof kriegerDiscountedCost === 'function') ? kriegerDiscountedCost(p.cost, dd) : p.cost;
    const canBuy = state.memberCoins >= effCost;
    const priceTxt = effCost < p.cost ? `⚖️ <s>${p.cost}</s> ${effCost}` : `${p.cost}`;
    return `<div class="krieger-item-card${have > 0 ? ' owned' : ''}">
      <div style="font-size:20px">${p.icon}</div>
      <div style="font-size:11px;font-weight:700">${_esc2(p.name)}${have > 0 ? ` <span style="color:#FAC775">×${have}</span>` : ''}</div>
      <div style="font-size:11px;color:var(--muted);margin:3px 0">${_esc2(p.desc)}</div>
      <div style="margin-top:5px"><button class="cc-build-btn krieger-potion-buy" data-potion="${p.key}"${canBuy ? '' : ' disabled'}>Kaufen · ${priceTxt} 🫘</button></div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <p style="font-size:12px;color:var(--muted);text-align:center;margin:2px 0 10px">Max. 1 Trank pro Kampf — vor dem „Kämpfen" auswählbar. Auch als seltener Dungeon-Fund.</p>
    <div class="krieger-shop-grid">${cards}</div>
  `;

  body.querySelectorAll('.krieger-potion-buy').forEach(btn => {
    btn.onclick = async () => {
      const potion = (typeof kriegerPotionByKey === 'function') ? kriegerPotionByKey(btn.dataset.potion) : null;
      if (!potion) return;
      btn.disabled = true;
      try {
        const newDD = await DB.buyKriegerPotion(member.id, potion, state.dd);
        state.dd = newDD;
        const paid = newDD._costPaid ?? potion.cost;
        state.memberCoins -= paid;
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
        _updateHeaderCoins({ coins: state.memberCoins });
        // Ausgabe im Tages-Log (Transparenz: fließt als Minus ins Netto-Gehalt des Tages).
        try {
          const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `🧪 Trank: ${potion.name}`, amount: -paid, detail: 'Kaffee-Krieger-Ausgabe' }]);
          if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
        } catch (e) { /* non-critical */ }
        showToast(`🧪 ${potion.name} gekauft!`, 'success');
        _kriegerRenderPotions(member, state, body);
      } catch (e) { showToast(e.message || 'Kauf fehlgeschlagen', 'error'); btn.disabled = false; }
    };
  });
}

// ── Sub-Tab: Talente ─────────────────────────────────────────────────────────
// Talentpunkte werden aus dem Level abgeleitet (1 je 10 Stufen, nicht gespeichert);
// Talente werden linear freigeschaltet (kriegerNextTalent = erstes noch nicht besessenes).
// Die Effekte selbst wirken serverseitig in dungeon_fight — hier nur Vergabe/Anzeige.
function _kriegerRenderTalents(member, state, body) {
  const dd = state.dd;
  const level    = dd.level || 1;
  const assigned = dd.talents || {};
  const points = (typeof kriegerTalentPoints === 'function') ? kriegerTalentPoints(dd) : 0;
  const next   = (typeof kriegerNextTalent  === 'function') ? kriegerNextTalent(dd)  : null;

  const cards = (typeof KRIEGER_TALENTS !== 'undefined' ? KRIEGER_TALENTS : []).map(t => {
    const owned     = !!assigned[t.key];
    const isNext    = !!(next && next.key === t.key);
    const canAssign = isNext && points > 0 && level >= t.level;
    let action;
    if (owned) {
      action = `<span class="ciq-state ciq-on">✓ freigeschaltet</span>`;
    } else if (canAssign) {
      action = `<button class="cc-build-btn krieger-talent-btn" data-talent="${t.key}">Freischalten · 1 🌟</button>`;
    } else if (level < t.level) {
      action = `<span class="ciq-state ciq-lock">🔒 ab Stufe ${t.level}</span>`;
    } else if (isNext) {
      action = `<span class="ciq-state ciq-lock">Kein Talentpunkt frei</span>`;
    } else {
      action = `<span class="ciq-state ciq-lock">🔒 vorheriges Talent zuerst</span>`;
    }
    return `<div class="krieger-item-card${owned ? ' owned' : ''}${!owned && level < t.level ? ' locked' : ''}">
      <div style="font-size:20px">${t.icon}</div>
      <div style="font-size:11px;font-weight:700">${_esc2(t.name)}</div>
      <div class="krieger-item-stats">Stufe ${t.level}</div>
      <div style="font-size:11px;color:var(--muted);margin:3px 0">${_esc2(t.desc)}</div>
      <div style="margin-top:5px">${action}</div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:12px;color:var(--muted)">1 Talentpunkt je 10 Krieger-Stufen</div>
      <div style="font-size:15px;font-weight:700;color:#FAC775">🌟 Verfügbare Talentpunkte: ${points}</div>
    </div>
    <div class="krieger-shop-grid">${cards}</div>
  `;

  body.querySelectorAll('.krieger-talent-btn').forEach(btn => {
    btn.onclick = () => _handleAssignTalent(member, state, body, btn.dataset.talent);
  });
}

async function _handleAssignTalent(member, state, body, key) {
  const dd  = state.dd;
  const def = (typeof kriegerTalentDef === 'function') ? kriegerTalentDef(key) : null;
  if (!def) return;
  // Gate erneut prüfen (Anzeige könnte veraltet sein): nur das nächste Talent,
  // Punkt frei, Level erreicht.
  const next   = (typeof kriegerNextTalent  === 'function') ? kriegerNextTalent(dd)  : null;
  const points = (typeof kriegerTalentPoints === 'function') ? kriegerTalentPoints(dd) : 0;
  if (!next || next.key !== key) { showToast('Erst das vorherige Talent freischalten.', 'error'); return; }
  if (points <= 0)               { showToast('Kein Talentpunkt frei.', 'error'); return; }
  if ((dd.level || 1) < def.level) { showToast(`Talent erst ab Stufe ${def.level}.`, 'error'); return; }

  const newTalents = { ...(dd.talents || {}), [key]: true };
  const newDD = { ...dd, talents: newTalents };
  try {
    await DB.saveDungeonData(member.id, newDD);
    state.dd = newDD;
    currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
    showToast(`🌟 Talent „${def.name}" freigeschaltet!`, 'success');
    try { await DB.postMessage(`🌟 ${_esc2(member.name)} hat das Krieger-Talent „${def.name}" freigeschaltet!`, member.name); } catch (e) {}
    // Talent-Achievements (ad-hoc, dürfen die Vergabe nie blockieren)
    try {
      const existing = currentUserData?.achievements || {};
      const toGrant = {};
      const total = (typeof KRIEGER_TALENTS !== 'undefined' ? KRIEGER_TALENTS.length : 10);
      if (!existing.krieger_talent_first) toGrant.krieger_talent_first = true;
      if (!existing.krieger_talent_full && Object.keys(newTalents).length >= total) toGrant.krieger_talent_full = true;
      if (Object.keys(toGrant).length > 0) {
        await DB.grantAchievements(member.id, toGrant);
        currentUserData = { ...currentUserData, achievements: { ...existing, ...toGrant } };
        for (const id of Object.keys(toGrant)) {
          const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === id);
          if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
        }
      }
    } catch (e) { /* non-critical */ }
    _kriegerRenderTalents(member, state, body);
  } catch (e) { showToast(e.message || 'Freischalten fehlgeschlagen', 'error'); }
}

function _kriegerUpdateHud(state) {
  const prog = kriegerProgress(state.dd);
  const hud = document.querySelector('.krieger-hud');
  if (hud) {
    const pos = kriegerPos(state.dd);
    hud.innerHTML = `
      <span>📍 ${pos.x}, ${pos.y} &nbsp;·&nbsp; Stufe ${prog.level}</span>
      <span>👣 ${kriegerStepsUsed(state.dd)}/${kriegerStepsAllowed(prog.level, state.dd)}</span>`;
  }
  const bar = document.querySelector('.krieger-xp-bar');
  if (bar) bar.style.width = prog.pct + '%';
}

// ── Sub-Tab: Dungeon-Karte ───────────────────────────────────────────────────
function _kriegerRenderDungeon(member, state, seed, COLS, ROWS, MARGIN, body) {
  const prog = kriegerProgress(state.dd);
  const exLeft = KRIEGER_EXTRA_STEP_MAX - kriegerExtraStepsBought(state.dd);
  const _hpMax0 = (typeof kriegerHpMax === 'function') ? kriegerHpMax(state.dd) : (80 + prog.level * 4);
  const _hpNow0 = (typeof kriegerHp === 'function') ? kriegerHp(state.dd) : _hpMax0;
  body.innerHTML = `
    <div class="krieger-hud">
      <span>📍 ${kriegerPos(state.dd).x}, ${kriegerPos(state.dd).y} &nbsp;·&nbsp; Stufe ${prog.level}</span>
      <span>👣 ${kriegerStepsUsed(state.dd)}/${kriegerStepsAllowed(prog.level, state.dd)}</span>
    </div>
    <div class="krieger-xp-wrap"><div class="krieger-xp-bar" style="width:${prog.pct}%"></div></div>
    <canvas id="krieger-canvas" class="cc-karte-canvas" width="320" height="280" style="margin-top:8px"></canvas>
    <button class="cc-karte-buy-steps" id="krieger-buy-steps" style="display:${exLeft > 0 ? '' : 'none'}">
      +${KRIEGER_EXTRA_STEPS} Schritte kaufen &nbsp;&middot;&nbsp; ${KRIEGER_EXTRA_STEP_COST} 🫘 CC &nbsp;<span style="opacity:.65">(noch ${exLeft}×)</span>
    </button>
    <button class="cc-karte-buy-steps" id="krieger-buy-heal" style="display:${_hpNow0 < _hpMax0 ? '' : 'none'}">
      🛌 Volle Erholung (❤️ ${_hpNow0}/${_hpMax0}) &nbsp;&middot;&nbsp; ${KRIEGER_FULL_HEAL_COST} 🫘 CC
    </button>
    <p class="cc-karte-hint" style="opacity:.6;font-size:10px;margin-top:4px">⚔️ Tipp auf ein Gegner-/Boss-Feld zum Kämpfen &nbsp;·&nbsp; ziehen = Karte verschieben</p>
    <div id="krieger-popup" class="cc-karte-popup hidden"></div>
  `;
  const canvas = document.getElementById('krieger-canvas');
  if (canvas) kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);

  // Schritte dazukaufen (bis 3×/Tag, +5 Schritte / 10 CC) — analog Karten-Kauf.
  document.getElementById('krieger-buy-steps')?.addEventListener('click', async () => {
    const bought = kriegerExtraStepsBought(state.dd);
    if (bought >= KRIEGER_EXTRA_STEP_MAX) { showToast('Heute schon 3× gekauft — morgen wieder.', 'error'); return; }
    const newCoins = await DB.spendCoins(member.id, KRIEGER_EXTRA_STEP_COST);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    state.memberCoins = newCoins;
    currentUserData = { ...(currentUserData || {}), coins: newCoins };
    _updateHeaderCoins({ coins: newCoins });
    state.dd = { ...state.dd, steps_extra_date: _kriegerTodayKey(), steps_extra_count: bought + 1 };
    try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { /* non-critical */ }
    // Ausgabe ins Tages-Log/Netto (Konsum, KEIN invest) — fließt in die Bilanz (cat:'krieger').
    try {
      const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `👣 +${KRIEGER_EXTRA_STEPS} Krieger-Schritte gekauft`, amount: -KRIEGER_EXTRA_STEP_COST, cat: 'krieger', detail: 'Kaffee-Krieger-Dungeon' }]);
      if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
    } catch (e) { /* non-critical */ }
    showToast(`✅ +${KRIEGER_EXTRA_STEPS} Schritte freigeschaltet!`, 'success');
    _kriegerRenderDungeon(member, state, seed, COLS, ROWS, MARGIN, body);
  });

  // Volle Erholung kaufen (HP → 100 % für 60 CC). dd.hp ist server-autoritativ, aber wie alle
  // dd-Schreibvorgänge client-vertraut (Kauf kostet echte CC); der Server clampt beim nächsten
  // Kampf ohnehin auf sein hpMax (LEAST(hpMax, dd.hp)).
  document.getElementById('krieger-buy-heal')?.addEventListener('click', async () => {
    const hpMax = (typeof kriegerHpMax === 'function') ? kriegerHpMax(state.dd) : (80 + (state.dd.level || 1) * 4);
    const hpNow = (typeof kriegerHp === 'function') ? kriegerHp(state.dd) : hpMax;
    if (hpNow >= hpMax) { showToast('Du bist bereits voll erholt.', 'info'); return; }
    const newCoins = await DB.spendCoins(member.id, KRIEGER_FULL_HEAL_COST);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    state.memberCoins = newCoins;
    currentUserData = { ...(currentUserData || {}), coins: newCoins };
    _updateHeaderCoins({ coins: newCoins });
    state.dd = { ...state.dd, hp: hpMax, hpMax: hpMax, hpDate: _kriegerTodayKey() };
    try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { /* non-critical */ }
    try {
      const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: '🛌 Volle Erholung (Krieger)', amount: -KRIEGER_FULL_HEAL_COST, cat: 'krieger', detail: 'Kaffee-Krieger-Dungeon' }]);
      if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
    } catch (e) { /* non-critical */ }
    showToast('🛌 Vollständig erholt — ❤️ 100 %!', 'success');
    _kriegerRenderDungeon(member, state, seed, COLS, ROWS, MARGIN, body);
  });

  // ── Canvas-Interaktion (Tap = Schritt/Kampf, Ziehen = Karte verschieben) — 1:1 Muster wie _buildKarte ──
  let _down = false, _moved = false, _sx = 0, _sy = 0, _startVpX = 0, _startVpY = 0;
  const _DRAG_THRESH = 8;

  function _tileFromEvent(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    return { tx: state.vpX + Math.floor(cx / KRIEGER_TILE), ty: state.vpY + Math.floor(cy / KRIEGER_TILE) };
  }

  canvas?.addEventListener('pointerdown', (e) => {
    _down = true; _moved = false; _sx = e.clientX; _sy = e.clientY;
    _startVpX = state.vpX; _startVpY = state.vpY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas?.addEventListener('pointermove', (e) => {
    if (!_down) return;
    const dxPx = e.clientX - _sx, dyPx = e.clientY - _sy;
    if (!_moved && Math.abs(dxPx) < _DRAG_THRESH && Math.abs(dyPx) < _DRAG_THRESH) return;
    _moved = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const dxT = Math.round(dxPx * scaleX / KRIEGER_TILE);
    const dyT = Math.round(dyPx * scaleY / KRIEGER_TILE);
    const nvX = Math.max(0, Math.min(KRIEGER_WORLD - COLS, _startVpX - dxT));
    const nvY = Math.max(0, Math.min(KRIEGER_WORLD - ROWS, _startVpY - dyT));
    if (nvX !== state.vpX || nvY !== state.vpY) {
      state.vpX = nvX; state.vpY = nvY;
      kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);
    }
  });
  canvas?.addEventListener('pointerup', async (e) => {
    if (!_down) return;
    _down = false;
    canvas.releasePointerCapture?.(e.pointerId);
    if (_moved) return;
    const { tx, ty } = _tileFromEvent(e);
    await _handleKriegerTap(tx, ty, member, state, seed, COLS, ROWS, MARGIN);
  });
  canvas?.addEventListener('pointercancel', () => { _down = false; });
}

async function _handleKriegerTap(tx, ty, member, state, seed, COLS, ROWS, MARGIN) {
  const isBoss  = tx === KRIEGER_BOSS_POS.x && ty === KRIEGER_BOSS_POS.y;
  const key     = `${tx},${ty}`;
  const explored = kriegerIsExplored(tx, ty, state.dd);

  // 1) Bereits erkundetes Feld mit bekanntem Encounter (oder Bossfeld) → Kampf erneut
  // anbieten — aber NUR falls es noch nicht GEWONNEN wurde (Niederlage bleibt bewusst
  // erneut versuchbar, siehe Spieldesign-Kommentar in _runKriegerFight). Bug-Fix
  // 2026-07-04: vorher blieb ein Gegner-Feld auch nach einem SIEG unbegrenzt farmbar,
  // weil hier nicht zwischen Sieg/Niederlage unterschieden wurde.
  // Respawn (2026-07-15): nur AKTIVE Gegner (nie besiegt ODER seit dem letzten Respawn-Tick
  // regeneriert) bieten einen Kampf; auf Cooldown (besiegt, noch nicht respawnt) ist das Feld
  // begehbar und fällt in den Walkback/Fast-Travel-Zweig unten.
  const enemyActive = !isBoss && (typeof kriegerEnemyActive === 'function'
    ? kriegerEnemyActive(state.dd, key)
    : !!((state.dd.encounters || {})[key]));
  if (explored && (isBoss || enemyActive)) {
    const tier = isBoss ? 'boss' : state.dd.encounters[key];
    _showKriegerFightPrompt(member, state, tier, seed, COLS, ROWS, MARGIN, key);
    return;
  }
  // Erkundetes, leeres Feld: kostenlos dorthin zurücklaufen (kein Schrittverbrauch, kein
  // erneuter Fund) — sonst sitzt man fest, sobald alle Nachbarfelder erkundet sind.
  // Direkt angrenzend → 1-Schritt-Walkback (unverändert); weiter weg → Fast-Travel (Etappe 4).
  if (explored) {
    // Respawn-Hinweis: besiegtes, noch nicht regeneriertes Gegnerfeld angetippt → kurz erklären,
    // warum kein Kampf kommt (Feld ist trotzdem begehbar).
    if (typeof kriegerEnemyOnCooldown === 'function' && kriegerEnemyOnCooldown(state.dd, key)) {
      const at = (typeof kriegerNextRespawnAt === 'function') ? kriegerNextRespawnAt(state.dd, key) : 0;
      const when = at ? ` (regeneriert ~${new Date(at).toLocaleDateString('de-DE')})` : '';
      showToast(`🔁 Diesen Gegner hast du bereits besiegt — er kehrt beim nächsten Respawn zurück${when}.`, 'info');
    }
    if (kriegerCanWalkBack(tx, ty, state.dd)) {
      await _handleKriegerWalkBack(tx, ty, member, state, seed, COLS, ROWS, MARGIN);
    } else {
      await _handleKriegerFastTravel(tx, ty, member, state, seed, COLS, ROWS, MARGIN);
    }
    return;
  }

  // 1b) Versiegelte Drachenhöhle vor Stufe 80 angetippt → Hinweis statt stillem No-Op
  // (kriegerCanStep blockt das Betreten unten ohnehin, aber ohne Feedback wirkt es wie ein Bug).
  if (isBoss && (state.dd.level || 1) < KRIEGER_BOSS_MIN_LEVEL) {
    showToast(`🐉 Die Drachenhöhle bleibt bis Stufe ${KRIEGER_BOSS_MIN_LEVEL} versiegelt.`, 'info');
    return;
  }

  // 2) Unerkundetes, angrenzendes Feld → Schritt
  if (!kriegerCanStep(tx, ty, state.dd, seed)) return;

  const { newDungeonData, gimmick, encounter } = kriegerExploreTile(tx, ty, state.dd, seed);
  let dd2 = newDungeonData;
  if (encounter) dd2 = { ...dd2, encounters:   { ...(dd2.encounters   || {}), [key]: encounter.tier } };
  if (gimmick)   dd2 = { ...dd2, gimmickTiles: { ...(dd2.gimmickTiles || {}), [key]: true } };
  // 🎁 Ausrüstungsfund: Gutschein lebt in dungeon_data, muss VOR dem Speichern gesetzt sein
  // (wird beim nächsten passenden Kauf in buyKriegerItem() eingelöst, siehe db.js).
  if (gimmick?.voucher) dd2 = { ...dd2, equipmentVoucher: gimmick.voucher };
  // 🧪 Trank-Fund (Etappe 2): landet direkt im Bestand dd.potions[key], vor dem Speichern.
  if (gimmick?.potion) {
    const cur = (dd2.potions && dd2.potions[gimmick.potion]) || 0;
    dd2 = { ...dd2, potions: { ...(dd2.potions || {}), [gimmick.potion]: cur + 1 } };
  }

  const prevDd = state.dd;
  state.dd = dd2;
  try { await DB.saveDungeonData(member.id, state.dd); }
  catch (e) { state.dd = prevDd; showToast('Dungeon konnte nicht gespeichert werden.', 'error'); return; }
  currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };

  if (gimmick?.cc) {
    state.memberCoins += gimmick.cc;
    currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
    _updateHeaderCoins({ coins: state.memberCoins });
    try { await DB.addCoins(member.id, gimmick.cc); } catch (e) {}
    showToast(`🪙 +${gimmick.cc} CC im Dungeon gefunden!`, 'success');
    // Chat-Entlastung (2026-07-15, User: „Dungeon-Funde überschwemmen den Chat"): die häufigen
    // CC-Kleinfunde werden NICHT mehr im Chat gepostet — sie stehen weiter im Tages-Log
    // („🪙 Dungeon-Funde ×N", aggregiert) + Toast. Nur relevante Funde (Gutschein/Trank) bleiben
    // im Chat, ebenso Siege/Level-Ups/Set-Komplett.
    // Tages-Log (Profil "Heute erhalten") — frisch mergen (gegen Clobbering durch zeitgleiche Writes).
    try {
      const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: '🪙 Dungeon-Fund', amount: gimmick.cc, cat: 'karte', aggKey: 'krieger_dungeon_fund', aggBase: '🪙 Dungeon-Funde', detail: 'Kaffee-Krieger-Dungeon' }]);
      if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
    } catch (e) { /* non-critical */ }
  } else if (gimmick?.voucher) {
    const slotName = gimmick.voucher.slot === 'weapon' ? 'Waffen' : gimmick.voucher.slot === 'armor' ? 'Rüstungs' : 'Talisman';
    showToast(`${gimmick.emoji} ${gimmick.name}! Nächster ${slotName}-Kauf 50% günstiger.`, 'success');
    try { await DB.postMessage(`${gimmick.emoji} ${_esc2(member.name)} hat im Dungeon "${_esc2(gimmick.name)}" gefunden — 50% Rabatt auf den nächsten ${slotName}-Kauf!`, member.name); } catch (e) {}
  } else if (gimmick?.potion) {
    showToast(`${gimmick.emoji} ${gimmick.name}! Im 🧪 Tränke-Tab einsetzbar.`, 'success');
    try { await DB.postMessage(`${gimmick.emoji} ${_esc2(member.name)} hat im Dungeon einen Trank gefunden: ${_esc2(gimmick.name)}.`, member.name); } catch (e) {}
  }

  // Viewport nachziehen + neu rendern (analog _handleKarteStep)
  const pos = kriegerPos(state.dd);
  const pvpX = pos.x - state.vpX, pvpY = pos.y - state.vpY;
  if (pvpX < MARGIN)                 state.vpX = Math.max(0, pos.x - MARGIN);
  else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(KRIEGER_WORLD - COLS, pos.x - (COLS - MARGIN - 1));
  if (pvpY < MARGIN)                 state.vpY = Math.max(0, pos.y - MARGIN);
  else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(KRIEGER_WORLD - ROWS, pos.y - (ROWS - MARGIN - 1));

  const canvas = document.getElementById('krieger-canvas');
  if (canvas) kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);
  _kriegerUpdateHud(state);

  if (encounter) _showKriegerFightPrompt(member, state, encounter.tier, seed, COLS, ROWS, MARGIN, key);
}

// Kostenloses Zurücklaufen auf ein erkundetes Dungeon-Feld — nur Position + Viewport +
// Render, kein Schritt-/Explore-/Fund-Aufruf. Pendant zu _handleKarteWalkBack.
async function _handleKriegerWalkBack(tx, ty, member, state, seed, COLS, ROWS, MARGIN) {
  const prevDd = state.dd;
  state.dd = kriegerWalkBack(tx, ty, state.dd);
  try { await DB.saveDungeonData(member.id, state.dd); }
  catch (e) { state.dd = prevDd; showToast('Konnte nicht zurücklaufen.', 'error'); return; }
  currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };

  const pos  = kriegerPos(state.dd);
  const pvpX = pos.x - state.vpX, pvpY = pos.y - state.vpY;
  if (pvpX < MARGIN)                 state.vpX = Math.max(0, pos.x - MARGIN);
  else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(KRIEGER_WORLD - COLS, pos.x - (COLS - MARGIN - 1));
  if (pvpY < MARGIN)                 state.vpY = Math.max(0, pos.y - MARGIN);
  else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(KRIEGER_WORLD - ROWS, pos.y - (ROWS - MARGIN - 1));

  const canvas = document.getElementById('krieger-canvas');
  if (canvas) kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);
  _kriegerUpdateHud(state);
}

// Fast-Travel (Etappe 4): auf ein beliebiges bereits erkundetes Feld — Pfad per BFS,
// tile-weise animiert, KOSTENLOS (kein Schrittverbrauch). Persistiert nur EINMAL am Ende.
let _kriegerTravelSeq = 0;
async function _handleKriegerFastTravel(tx, ty, member, state, seed, COLS, ROWS, MARGIN) {
  const path = (typeof kriegerFindPath === 'function')
    ? kriegerFindPath(kriegerPos(state.dd), { x: tx, y: ty }, state.dd) : null;
  if (!path || !path.length) return; // kein Pfad (dank Flood-Fill quasi nie) → still ignorieren
  const myToken = ++_kriegerTravelSeq; // neuer Klick bricht eine laufende Animation ab
  const canvas = document.getElementById('krieger-canvas');
  for (const step of path) {
    if (myToken !== _kriegerTravelSeq) return; // abgebrochen durch neuen Klick
    state.dd = kriegerWalkBack(step.x, step.y, state.dd); // pos + lastDir, keine Mutation an explored/steps
    const pvpX = step.x - state.vpX, pvpY = step.y - state.vpY;
    if (pvpX < MARGIN)                 state.vpX = Math.max(0, step.x - MARGIN);
    else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(KRIEGER_WORLD - COLS, step.x - (COLS - MARGIN - 1));
    if (pvpY < MARGIN)                 state.vpY = Math.max(0, step.y - MARGIN);
    else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(KRIEGER_WORLD - ROWS, step.y - (ROWS - MARGIN - 1));
    if (canvas) kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);
    _kriegerUpdateHud(state);
    await new Promise(r => setTimeout(r, 110));
  }
  if (myToken !== _kriegerTravelSeq) return;
  currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
  try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { /* Position bleibt lokal, unkritisch */ }
}

// Eigene Werte rein zur ANZEIGE (Prompt/HUD) — der tatsächliche Kampfausgang kommt
// ausschließlich von der RPC, die dieselbe Formel serverseitig nachrechnet.
function _kriegerOwnStats(dd) {
  const eq = dd.equipped || {};
  const owned = dd.owned || {};
  let atk = 0, def = 0, crit = 0;
  for (const slot of ['weapon', 'armor', 'talisman']) {
    const key = eq[slot];
    if (key && owned[key]) {
      const item = kriegerItemByKey(key);
      if (item) {
        atk += item.atk; crit += item.crit;
        // Rüstungs-DEF skaliert mit Haltbarkeit (mirror dungeon_fight)
        def += (slot === 'armor')
          ? Math.round(item.def * kriegerArmorDur(dd, key) / 100)
          : item.def;
      }
    }
  }
  const setCulture = kriegerActiveSetCulture(eq);
  if (setCulture === 'orient') crit += 10;
  const level = dd.level || 1;
  atk += kriegerLevelAtkBonus(level); // Level-Kampfbonus (mirror dungeon_fight)
  def += kriegerLevelDefBonus(level);
  // Statisch anzeigbare Talent-Boni (fein_gemahlen/vollmundig) — Spiegel zu dungeon_fight
  const tb = (typeof kriegerTalentStatBonus === 'function') ? kriegerTalentStatBonus(dd) : { crit: 0, hpMult: 1 };
  crit += tb.crit;
  // Reittier-Kampf-Boost (Spiegel zu _krieger_mount_stats in dungeon_fight)
  const mnt = (typeof kriegerActiveMount === 'function') ? kriegerActiveMount(dd) : null;
  if (mnt) { atk += mnt.atk || 0; def += mnt.def || 0; crit += mnt.crit || 0; }
  return { atk, def, crit, hp: Math.round((80 + level * 4) * tb.hpMult), setCulture };
}

function _showKriegerFightPrompt(member, state, tier, seed, COLS, ROWS, MARGIN, key) {
  const enemyDef = kriegerEnemyDef(tier);
  if (!enemyDef) return;
  // Deterministisch aus den Feld-Koordinaten (2026-07-13b): gleiches Feld → immer
  // gleicher Flavor + gleiche Stufe (behebt den Reroll-Exploit). Boss: fest Flavor 0 / Stufe 60.
  const _kc = String(key || '').split(',');
  const _tx = parseInt(_kc[0], 10), _ty = parseInt(_kc[1], 10);
  const _coordsOk = Number.isFinite(_tx) && Number.isFinite(_ty);
  const flavorIdx = (tier === 'boss') ? 0
    : (_coordsOk && typeof kriegerEnemyFlavorIdx === 'function'
        ? kriegerEnemyFlavorIdx(_tx, _ty, tier, seed)
        : Math.floor(Math.random() * enemyDef.flavor.length));
  const eLevel = (tier === 'boss') ? 60
    : (_coordsOk && typeof kriegerEnemyLevel === 'function'
        ? kriegerEnemyLevel(_tx, _ty, tier, seed)
        : 0);
  const flavor = enemyDef.flavor[flavorIdx] || enemyDef.name;
  const flavorEmoji = flavor.split(' ')[0];
  const flavorName  = flavor.replace(/^\S+\s*/, '') || enemyDef.name;
  // Skalierte Gegnerwerte (Flavor-Mod + Level-Bonus) — Spiegel zu dungeon_fight.
  const fmod = (typeof kriegerFlavorMod === 'function') ? kriegerFlavorMod(tier, flavorIdx) : 1;
  const _es = (typeof kriegerEnemyStatsScaled === 'function')
    ? kriegerEnemyStatsScaled(tier, flavorIdx, eLevel)
    : { hp: Math.max(1, Math.round(enemyDef.hp * fmod)), atk: Math.max(1, Math.round(enemyDef.atk * fmod)), def: Math.max(0, Math.round(enemyDef.def * fmod)) };
  const eHp = _es.hp, eAtk = _es.atk, eDef = _es.def;
  const fLabel = fmod < 1 ? ' · schwach' : (fmod > 1 ? ' · zäh' : '');
  // Gegner-Signatur-Fähigkeit dieses Flavors (bestimmt serverseitig via flavorIdx)
  const ability = (enemyDef.abilities && typeof kriegerEnemyAbility === 'function')
    ? kriegerEnemyAbility(enemyDef.abilities[flavorIdx]) : null;
  const own = _kriegerOwnStats(state.dd);
  const setBonus = own.setCulture ? KRIEGER_SET_BONUSES[own.setCulture] : null;

  // Persistente HP (Etappe 2): aktueller Startwert + Gating
  const hpMax = (typeof kriegerHpMax === 'function') ? kriegerHpMax(state.dd) : own.hp;
  const hpNow = (typeof kriegerHp === 'function') ? kriegerHp(state.dd) : hpMax;
  const hpPct = Math.max(0, Math.round(hpNow / (hpMax || 1) * 100));

  // Vorrätige Tränke (max. 1 pro Kampf wählbar) — Cold Brew auch bei 0 HP zulässig (heilt vorher)
  const ownedPotions = (typeof KRIEGER_POTIONS !== 'undefined' ? KRIEGER_POTIONS : [])
    .map(p => ({ ...p, have: (typeof kriegerPotionCount === 'function') ? kriegerPotionCount(state.dd, p.key) : ((state.dd.potions || {})[p.key] || 0) }))
    .filter(p => p.have > 0);
  const hasColdBrew = ownedPotions.some(p => p.key === 'coldbrew');
  // Bei 0 HP nur kämpfbar, wenn ein Cold Brew da ist (heilt serverseitig VOR dem no_hp-Gate).
  const canFight = hpNow > 0 || hasColdBrew;
  let selectedBuff = null, selectedHeal = null; // Cold Brew (Heilung) + 1 Buff getrennt wählbar

  const popup = document.getElementById('krieger-popup');
  if (!popup) return;
  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="krieger-fight-overlay">
      <div class="cc-karte-popup-inner" style="max-width:360px;width:100%">
        <div class="cc-karte-popup-hdr">${tier === 'boss' ? '🐉 BOSSKAMPF' : '⚔️ Gegner entdeckt'}</div>
        <div class="cc-karte-popup-body" style="flex-direction:column;align-items:stretch;gap:8px">
          <div style="text-align:center;font-size:2em">${_esc2(flavorEmoji)}</div>
          <div style="text-align:center;font-weight:700">${_esc2(flavorName)} (${_esc2(enemyDef.name)})<span style="font-weight:400;opacity:.7;font-size:.85em">${eLevel > 0 ? ' · Stufe ' + eLevel : ''}${fLabel}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.85">
            <span>Gegner: ❤️${eHp} ⚔️${eAtk} 🛡️${eDef}</span>
            <span>Du: ⚔️${own.atk} 🛡️${own.def} 🎯${own.crit}%</span>
          </div>
          <div class="krieger-hp-bar-wrap" style="height:7px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.1)"><div class="krieger-hp-bar player" style="width:${hpPct}%;height:100%;background:${hpNow <= hpMax * 0.34 ? '#e07a5f' : '#6bbf59'}"></div></div>
          <div style="text-align:center;font-size:11px;opacity:.85">❤️ ${hpNow}/${hpMax} HP${canFight && hpNow <= hpMax * 0.34 ? ' — wenig! Heilung per Cold Brew oder morgen.' : ''}</div>
          ${ability ? `<div style="font-size:11px;color:#e59b6b;text-align:center">${_esc2(ability.icon)} Fähigkeit: ${_esc2(ability.name)} — ${_esc2(ability.desc)}</div>` : ''}
          ${setBonus ? `<div style="font-size:11px;color:#FAC775;text-align:center">✨ Set-Bonus aktiv: ${_esc2(setBonus.name)} — ${_esc2(setBonus.desc)}</div>` : ''}
          ${ownedPotions.length ? `
          <div style="font-size:11px;opacity:.7;text-align:center;margin-top:2px">🧪 Tränke (optional): 🧊 Cold Brew + 1 Buff gleichzeitig möglich</div>
          <div id="krieger-potion-picker" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
            ${ownedPotions.map(p => `<button class="cc-build-btn krieger-potion-pick" data-potion="${p.key}" style="flex:0 0 auto;font-size:11px;padding:4px 8px;opacity:.7">${p.icon} ${_esc2(p.name)} ×${p.have}</button>`).join('')}
          </div>` : ''}
          ${tier !== 'boss' ? '<div style="font-size:11px;opacity:.6;text-align:center">Niederlage = kein CC-Verlust, aber HP sinken (heilen morgen/per Trank).</div>' : ''}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px" id="krieger-fight-actions">
          ${canFight
            ? `<button class="cc-build-btn" id="krieger-fight-go" style="flex:1">⚔️ Kämpfen</button>`
            : `<div style="flex:1;text-align:center;font-size:12px;color:#e88;align-self:center">😵 Keine Kraft mehr — Cold Brew oder morgen wieder.</div>`}
          <button class="cc-karte-popup-close" id="krieger-fight-cancel" style="flex:1">${canFight ? 'Abbrechen' : 'Schließen'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('krieger-fight-cancel').onclick = () => popup.classList.add('hidden');
  // Trank-Auswahl: Cold Brew (Heilung) UND 1 Buff getrennt wählbar (je erneuter Klick hebt auf).
  // Buffs sind untereinander exklusiv (Radio); Cold Brew ist ein eigener Slot (auch bei 0 HP wählbar).
  popup.querySelectorAll('.krieger-potion-pick').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.potion;
      if (k === 'coldbrew') selectedHeal = (selectedHeal === k) ? null : k;
      else                  selectedBuff = (selectedBuff === k) ? null : k;
      popup.querySelectorAll('.krieger-potion-pick').forEach(x =>
        x.style.opacity = (x.dataset.potion === selectedHeal || x.dataset.potion === selectedBuff) ? '1' : '.7');
    };
  });
  const goBtn = document.getElementById('krieger-fight-go');
  if (goBtn) goBtn.onclick = () => _runKriegerFight(member, state, tier, seed, COLS, ROWS, MARGIN, key, flavorIdx, selectedBuff, selectedHeal, eLevel);
}

async function _runKriegerFight(member, state, tier, seed, COLS, ROWS, MARGIN, key, flavorIdx, potionKey, potionKey2, eLevel) {
  const popup = document.getElementById('krieger-popup');
  const btn = document.getElementById('krieger-fight-go');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Kämpft …'; }

  // Goldene-Bohne-Fortschritt VOR dem Kampf festhalten (für Kapitel-Freischaltungs-Erkennung)
  const _prevGolden = (typeof kriegerGoldenBeanProgress === 'function') ? kriegerGoldenBeanProgress(state.dd) : { done: 0, complete: false };

  let result;
  try { result = await kriegerFight(member.id, tier, flavorIdx, potionKey || null, potionKey2 || null, eLevel == null ? 0 : eLevel); }
  catch (e) { showToast(e.message || 'Kampf fehlgeschlagen', 'error'); if (btn) btn.disabled = false; return; }
  if (result?.error) {
    const msg = {
      boss_on_cooldown: 'Der Drache braucht noch Ruhe — erst in einer Woche wieder.',
      level_too_low:    `Dafür brauchst du mindestens Stufe ${result.min_level || '?'} (aktuell ${result.have ?? '?'}).`,
      unknown_enemy:    'Unbekannter Gegner.',
      no_hp:            'Keine Kraft mehr — heile dich (Cold Brew) oder komm morgen wieder.',
      no_potion:        'Dieser Trank ist nicht mehr im Bestand.',
      buff_stack:       'Nur Cold Brew + 1 Buff möglich — nicht zwei Buffs.',
    }[result.error] || 'Kampf fehlgeschlagen.';
    showToast(msg, 'info');
    if (btn) btn.disabled = false;
    return;
  }

  const enemyDef = kriegerEnemyDef(tier);
  const inner = popup.querySelector('.cc-karte-popup-inner');
  if (!inner) return;
  inner.innerHTML = `
    <div class="cc-karte-popup-hdr">${tier === 'boss' ? '🐉 BOSSKAMPF' : '⚔️ Kampf'}</div>
    <div class="krieger-hp-bar-wrap"><div class="krieger-hp-bar enemy" id="krieger-ehp" style="width:100%"></div></div>
    <div class="krieger-hp-bar-wrap"><div class="krieger-hp-bar player" id="krieger-php" style="width:100%"></div></div>
    <div id="krieger-log" style="max-height:160px;overflow-y:auto;margin-top:8px"></div>
    <div id="krieger-result" style="text-align:center;margin-top:10px"></div>
  `;
  const logEl  = document.getElementById('krieger-log');
  const ehpBar = document.getElementById('krieger-ehp');
  const phpBar = document.getElementById('krieger-php');
  // Flavor-Staffelung + Gegner-Level (Spiegel zu dungeon_fight): HP-Balken-Skala an die
  // serverseitig skalierte Gegner-HP anpassen, sonst passt die Animation nicht.
  const _fmod = (typeof kriegerFlavorMod === 'function') ? kriegerFlavorMod(tier, flavorIdx) : 1;
  const _esRun = (typeof kriegerEnemyStatsScaled === 'function')
    ? kriegerEnemyStatsScaled(tier, flavorIdx, (eLevel == null ? 0 : eLevel)) : null;
  const enemyHpMax = _esRun ? _esRun.hp : Math.max(1, Math.round(enemyDef.hp * _fmod));
  const ownHpMax   = (typeof kriegerHpMax === 'function') ? kriegerHpMax(state.dd) : (80 + (state.dd.level || 1) * 4);
  // Spieler-Balken auf den AKTUELLEN Startwert setzen (persistente HP), nicht fix 100%.
  if (phpBar) phpBar.style.width = Math.max(0, ((typeof kriegerHp === 'function' ? kriegerHp(state.dd) : ownHpMax) / (ownHpMax || 1)) * 100) + '%';

  // Log-Zeilen für Spieler-Fähigkeiten/Kultur-Effekte (side:'ability', who:'player')
  const PLAYER_SKILL_LABELS = {
    ristretto:          { icon: '⚡', name: 'Ristretto-Vorschlag' },
    ristretto_doppio:   { icon: '⚡', name: 'Ristretto Doppio (Trank)' },
    doppelter_espresso: { icon: '☕', name: 'Doppelter Espresso' },
    kaffeepause:        { icon: '☕', name: 'Kaffeepause' },
  };
  const log = result.log || [];
  for (const entry of log) {
    if (entry.side === 'ability') {
      await new Promise(r => setTimeout(r, 300));
      const meta = entry.who === 'enemy'
        ? (typeof kriegerEnemyAbility === 'function' ? kriegerEnemyAbility(entry.skill) : null)
        : PLAYER_SKILL_LABELS[entry.skill];
      const line = document.createElement('div');
      line.className = 'krieger-log-line ability';
      line.style.cssText = 'font-size:11px;font-style:italic;' + (entry.who === 'enemy' ? 'color:#e59b6b' : 'color:#FAC775');
      line.textContent = meta ? `${meta.icon} ${entry.who === 'enemy' ? 'Gegner' : 'Du'}: ${meta.name}!` : '✨ Fähigkeit ausgelöst';
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
      continue;
    }
    await new Promise(r => setTimeout(r, 400));
    const line = document.createElement('div');
    line.className = `krieger-log-line ${entry.side}`;
    line.textContent = entry.side === 'player'
      ? `Du triffst für ${entry.dmg} ⚔️`
      : `Der Gegner kontert für ${entry.dmg} 🛡️`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    if (entry.side === 'player' && ehpBar) ehpBar.style.width = Math.max(0, entry.hp_left / enemyHpMax * 100) + '%';
    if (entry.side === 'enemy'  && phpBar) phpBar.style.width = Math.max(0, entry.hp_left / ownHpMax * 100) + '%';
  }

  const resultEl = document.getElementById('krieger-result');
  const levelUpHtml = result.leveled_up ? `<div class="krieger-levelup">🎉 Stufenaufstieg auf ${result.new_level}!</div>` : '';
  const setHtml = result.set_bonus ? `<div style="font-size:11px;color:#FAC775">✨ ${_esc2(KRIEGER_SET_BONUSES[result.set_bonus]?.name || result.set_bonus)}-Bonus angewendet</div>` : '';
  const potHtml = result.potion_used && typeof kriegerPotionByKey === 'function' && kriegerPotionByKey(result.potion_used)
    ? `<div style="font-size:11px;color:#9fd">${kriegerPotionByKey(result.potion_used).icon} ${_esc2(kriegerPotionByKey(result.potion_used).name)} eingesetzt</div>` : '';
  const savedHtml = (result.potions_saved > 0)
    ? `<div style="font-size:11px;color:#9fd">🫖 Zweite Kanne: ${result.potions_saved} Trank${result.potions_saved > 1 ? 'e' : ''} nicht verbraucht!</div>` : '';
  const nachHtml = result.nachschlag
    ? `<div style="font-size:11px;color:#FAC775">🔁 Nachschlag! Doppelte Beute (CC + EP)</div>` : '';
  const hpHtml = (result.hp != null && result.hp_max != null)
    ? `<div style="font-size:12px;opacity:.85;margin-top:2px">❤️ ${result.hp}/${result.hp_max} HP übrig${result.hp <= 0 ? ' — bis morgen erschöpft (oder Cold Brew)' : ''}</div>` : '';
  resultEl.innerHTML = `
    <div class="${result.won ? 'krieger-result-win' : 'krieger-result-lose'}">${result.won ? '🏆 Sieg!' : '💀 Niederlage'}</div>
    <div style="margin-top:4px">+${result.cc_awarded} 🫘 CC &nbsp;·&nbsp; +${result.ep_awarded} EP</div>
    ${hpHtml}${potHtml}${savedHtml}${nachHtml}${levelUpHtml}${setHtml}
    <button class="cc-karte-popup-close" id="krieger-fight-close" style="margin-top:10px">Schließen</button>
  `;
  document.getElementById('krieger-fight-close').onclick = () => popup.classList.add('hidden');

  // State/Header aktualisieren
  state.dd = result.new_dungeon_data || { ...state.dd, level: result.new_level };
  if (result.cc_awarded > 0) state.memberCoins += result.cc_awarded;

  // Talentpunkt-Signal (Server zählt in diesem Kampf überschrittene 10er-Stufen)
  if (result.talent_points_gained > 0) {
    showToast(`🌟 ${result.talent_points_gained} Talentpunkt${result.talent_points_gained > 1 ? 'e' : ''} erhalten — im 🌟 Talente-Tab einsetzen!`, 'success');
  }
  // Goldene Kaffeebohne: wurde ein neues Kapitel freigeschaltet?
  let _goldenComplete = false;
  try {
    if (typeof kriegerGoldenBeanProgress === 'function') {
      const g = kriegerGoldenBeanProgress(state.dd);
      if (g.done > _prevGolden.done) {
        const chap = (typeof KRIEGER_GOLDEN_BEAN !== 'undefined') ? KRIEGER_GOLDEN_BEAN[g.done - 1] : null;
        if (chap) {
          showToast(`🫘 Goldene Kaffeebohne — Kapitel ${g.done}/5 „${chap.title}" freigeschaltet!`, 'success');
          try { await DB.postMessage(`🫘 ${_esc2(member.name)} hat Kapitel ${g.done}/5 der Legende der Goldenen Kaffeebohne freigeschaltet: „${chap.title}"`, member.name); } catch (e) { /* non-critical */ }
        }
      }
      _goldenComplete = g.complete;
    }
  } catch (e) { /* non-critical */ }

  let dungeonDirty = false;

  // Bonus (User-Wunsch 2026-07-05): jeder gewonnene Kampf gibt sofort +5 Schritte
  // zurück ("für den Moment") — reduziert nur die heute bereits verbrauchten
  // Dungeon-Schritte, die reguläre Tagesgrenze (kriegerStepsAllowed) bleibt
  // unverändert. Gilt auch für Boss-Siege.
  if (result.won) {
    const usedNow = kriegerStepsUsed(state.dd);
    state.dd = { ...state.dd, steps_today: Math.max(0, usedNow - 5), steps_date: _kriegerTodayKey() };
    dungeonDirty = true;
  }

  // Respawn (2026-07-15): nach einem SIEG (Nicht-Boss) den Encounter NICHT mehr löschen, sondern
  // den Sieg-Zeitpunkt in `defeatedAt[key]` merken. Das Feld ist ab dem nächsten globalen Respawn-
  // Tick (3-Tage-Takt, kriegerEnemyActive) wieder kämpfbar → dauerhafter t1-Nachschub in der Mitte.
  // Bis dahin ist es begehbar (siehe _handleKriegerTap: nur AKTIVE Gegner blocken/bieten Kampf).
  // Niederlage bleibt wie bisher sofort erneut versuchbar (kein defeatedAt-Eintrag).
  if (result.won && tier !== 'boss' && key && state.dd.encounters?.[key]) {
    state.dd = { ...state.dd, defeatedAt: { ...(state.dd.defeatedAt || {}), [key]: Date.now() } };
    dungeonDirty = true;
  }

  // Niederlage-Konsequenzen (2026-07-05): MIT Rüstung leidet die Haltbarkeit (bereits
  // serverseitig in dungeon_fight −20 gesenkt, steckt in new_dungeon_data). OHNE Rüstung
  // verfallen stattdessen die restlichen Tagesschritte.
  if (!result.won) {
    const armorKey = state.dd.equipped?.armor;
    const armorEquipped = !!(armorKey && state.dd.owned?.[armorKey]);
    if (armorEquipped) {
      showToast(`🛡️ Rüstung beschädigt (${kriegerArmorDur(state.dd, armorKey)}% Haltbarkeit) — beim 🔨 Schmied reparieren.`, 'info');
    } else {
      state.dd = { ...state.dd, steps_today: kriegerStepsAllowed(state.dd.level || 1, state.dd), steps_date: _kriegerTodayKey() };
      dungeonDirty = true;
      showToast('👟 Ohne Rüstung unterlegen — deine Tagesschritte für heute sind aufgebraucht!', 'error');
    }
  }

  if (dungeonDirty) {
    try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { /* non-critical */ }
  }

  currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
  _updateHeaderCoins({ coins: state.memberCoins });
  _kriegerUpdateHud(state);
  const canvas = document.getElementById('krieger-canvas');
  if (canvas) kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);

  // Tages-Log (Profil "Heute erhalten") — Kampf-CC wurde bisher nirgends geloggt, obwohl
  // die Gutschrift serverseitig in dungeon_fight() korrekt lief (nicht-kritisch: Fehler hier
  // dürfen den Kampf-Flow nicht blockieren).
  if (result.cc_awarded > 0) {
    try {
      const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `⚔️ Sieg: ${enemyDef.name}`, amount: result.cc_awarded, detail: 'Kaffee-Krieger-Kampf' }]);
      if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
    } catch (e) { /* non-critical */ }
  }

  // Chat-Broadcast (Pflicht laut Plan: Sieg/Niederlage/Level-Up/Boss-Kill)
  try {
    if (result.won) {
      await DB.postMessage(`⚔️ ${_esc2(member.name)} hat ${enemyDef.name} besiegt! (+${result.cc_awarded} CC, +${result.ep_awarded} EP)`, member.name);
      if (tier === 'boss') await DB.postMessage(`🐉 ${_esc2(member.name)} hat den Espresso-Drachen besiegt!`, member.name);
    } else {
      await DB.postMessage(`💀 ${_esc2(member.name)} ist gegen ${enemyDef.name} unterlegen (+${result.ep_awarded} Trost-EP).`, member.name);
    }
    if (result.leveled_up) await DB.postMessage(`🎉 ${_esc2(member.name)} hat Krieger-Stufe ${result.new_level} erreicht!`, member.name);
  } catch (e) { /* non-critical */ }

  // Achievements (Erster Sieg/Stufe 10/50/100/Drachentöter) — analog Kaffee-Jagd-Block
  try {
    const dd2 = state.dd;
    const existing = currentUserData?.achievements || {};
    const toGrant = {};
    if (!existing.krieger_first_win  && (dd2.wins  || 0) >= 1)   toGrant.krieger_first_win  = true;
    if (!existing.krieger_level_10   && (dd2.level || 1) >= 10)  toGrant.krieger_level_10   = true;
    if (!existing.krieger_level_50   && (dd2.level || 1) >= 50)  toGrant.krieger_level_50   = true;
    if (!existing.krieger_level_100  && (dd2.level || 1) >= 100) toGrant.krieger_level_100  = true;
    if (!existing.krieger_boss_kill  && (dd2.bossKills || 0) >= 1) toGrant.krieger_boss_kill = true;
    if (!existing.krieger_golden_bean && _goldenComplete)          toGrant.krieger_golden_bean = true;
    if (!existing.krieger_potion_10  && (dd2.potionsUsed || 0) >= 10) toGrant.krieger_potion_10 = true;
    if (Object.keys(toGrant).length > 0) {
      await DB.grantAchievements(member.id, toGrant);
      currentUserData = { ...(currentUserData || {}), achievements: { ...existing, ...toGrant } };
      for (const id of Object.keys(toGrant)) {
        const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === id);
        if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
      }
    }
  } catch (e) { /* non-critical */ }
}

// ── Sub-Tab: Ausrüstung (Shop) ───────────────────────────────────────────────
function _kriegerRenderShop(member, state, body) {
  const dd = state.dd;
  const owned = dd.owned || {};
  const equipped = dd.equipped || {};
  const level = dd.level || 1;

  const slotIcons = { weapon: '⚔️', armor: '🛡️', talisman: '🧿', feet: '👢', scan: '🔮' };
  const slotNames = { weapon: 'Waffe', armor: 'Rüstung', talisman: 'Talisman', feet: 'Stiefel', scan: 'Sicht' };
  const companionDef = (typeof kriegerActiveCompanion === 'function') ? kriegerActiveCompanion(dd) : null;
  const mountDef = (typeof kriegerActiveMount === 'function') ? kriegerActiveMount(dd) : null;
  const loadoutHtml = ['weapon', 'armor', 'talisman', 'feet', 'scan'].map(slot => {
    const key = equipped[slot];
    const item = key ? kriegerItemByKey(key) : null;
    return `<div class="krieger-slot${item ? ' filled' : ''}">
      <span class="krieger-slot-icon">${item ? item.icon : slotIcons[slot]}</span>
      <span>${item ? _esc2(item.name) : slotNames[slot] + ' leer'}</span>
    </div>`;
  }).join('') + `<div class="krieger-slot${mountDef ? ' filled' : ''}">
      <span class="krieger-slot-icon">${mountDef ? mountDef.icon : '🐎'}</span>
      <span>${mountDef ? _esc2(mountDef.name) : 'Reittier leer'}</span>
    </div><div class="krieger-slot${companionDef ? ' filled' : ''}">
      <span class="krieger-slot-icon">${companionDef ? companionDef.icon : '🐴'}</span>
      <span>${companionDef ? _esc2(companionDef.name) : 'Begleiter leer'}</span>
    </div>`;

  const setCulture = kriegerActiveSetCulture(equipped);
  const setHint = setCulture
    ? `<div style="font-size:12px;color:#FAC775;text-align:center;margin-bottom:10px">✨ Set aktiv: ${_esc2(KRIEGER_SET_BONUSES[setCulture].name)} — ${_esc2(KRIEGER_SET_BONUSES[setCulture].desc)}</div>`
    : '';

  // 🎁 Ausrüstungsfund-Gutschein (siehe krieger.js/db.js): beeinflusst Preis-Anzeige +
  // Kaufbarkeits-Check, damit die Karte nicht fälschlich "zu teuer" zeigt, wenn der
  // rabattierte Preis eigentlich schon leistbar wäre.
  const voucher = dd.equipmentVoucher;
  const sections = Object.keys(KRIEGER_CULTURE_NAMES).map(culture => {
    const items = KRIEGER_ITEMS.filter(i => i.culture === culture);
    const cards = items.map(item => {
      const isOwned    = !!owned[item.key];
      const isEquipped = equipped[item.slot] === item.key;
      const locked     = level < item.minLevel;
      const hasVoucher = !!(voucher && voucher.slot === item.slot);
      const voucherCost = hasVoucher ? Math.round(item.cost * (1 - (voucher.pct || 0.5))) : item.cost;
      // Handelsprivileg-Set (2026-07-13): −15% Anzeige-/Kaufpreis, wenn das Handel-Set getragen wird
      // (gleiche Helferin wie db.js → Anzeige == tatsächlich belasteter Betrag). Stapelt mit Gutschein.
      const effCost    = (typeof kriegerDiscountedCost === 'function') ? kriegerDiscountedCost(voucherCost, dd) : voucherCost;
      const canBuy     = !isOwned && !locked && state.memberCoins >= effCost;
      let action;
      if (isOwned) {
        action = isEquipped
          ? `<span class="ciq-state ciq-on">✓ ausgerüstet</span>`
          : `<button class="cc-build-btn krieger-equip-btn" data-equip="${item.key}" data-slot="${item.slot}">Ausrüsten</button>`;
      } else if (locked) {
        action = `<span class="ciq-state ciq-lock">🔒 ab Stufe ${item.minLevel}</span>`;
      } else {
        const priceTxt = effCost < item.cost ? `${hasVoucher ? '🎁' : '⚖️'} <s>${item.cost}</s> ${effCost}` : `${item.cost}`;
        action = `<button class="cc-build-btn krieger-buy-btn" data-buy-item="${item.key}"${canBuy ? '' : ' disabled'}>Kaufen · ${priceTxt} 🫘</button>`;
      }
      const statTxt = [
        item.atk ? `ATK+${item.atk}` : null,
        item.def ? `DEF${item.def > 0 ? '+' : ''}${item.def}` : null,
        item.crit ? `CRIT+${item.crit}%` : null,
        item.steps ? `👣+${item.steps} Schritte/Tag` : null,
      ].filter(Boolean).join(' · ');
      const mechTxt = item.mechDesc ? `<div style="font-size:10px;color:#e59b6b;margin-top:2px">⚙️ ${_esc2(item.mechDesc)}</div>` : '';
      return `<div class="krieger-item-card${isOwned ? ' owned' : ''}${locked ? ' locked' : ''}">
        <div style="font-size:20px">${item.icon}</div>
        <div style="font-size:11px;font-weight:700">${_esc2(item.name)}</div>
        <div class="krieger-item-stats">${statTxt}</div>
        ${mechTxt}
        <div style="margin-top:5px">${action}</div>
      </div>`;
    }).join('');
    // Set-Effekt-Transparenz (PLAN_krieger_set_transparenz): den Set-Bonus je Kultur schon vorab
    // zeigen, nicht erst wenn das Set komplett getragen wird. Text aus KRIEGER_SET_BONUSES (Single
    // Source of Truth) — fehlender Eintrag → Zeile entfällt (Crash-Sicherheit).
    const setDef = (typeof KRIEGER_SET_BONUSES !== 'undefined') ? KRIEGER_SET_BONUSES?.[culture] : null;
    const setCaption = setDef
      ? `<div class="krieger-set-caption">✨ Set „${_esc2(setDef.name)}" (Waffe + Rüstung + Talisman): ${_esc2(setDef.desc)}</div>`
      : '';
    return `<div class="krieger-shop-section">
      <div class="section-title" style="font-size:13px">${KRIEGER_CULTURE_NAMES[culture]}</div>
      ${setCaption}
      <div class="krieger-shop-grid">${cards}</div>
    </div>`;
  }).join('');

  // 🔨 Schmied: beschädigte (Haltbarkeit < 100 %) Rüstungen im Besitz reparieren.
  const damagedArmors = KRIEGER_ITEMS.filter(i => i.slot === 'armor' && owned[i.key] && kriegerArmorDur(dd, i.key) < 100);
  const schmiedHtml = `<div class="krieger-shop-section">
    <div class="section-title" style="font-size:13px">🔨 Schmied</div>
    ${damagedArmors.length ? damagedArmors.map(item => {
      const dur = kriegerArmorDur(dd, item.key);
      const cost = kriegerRepairCost(dd, item.key);
      const can = state.memberCoins >= cost;
      return `<div class="krieger-item-card owned">
        <div style="font-size:11px;font-weight:700">${item.icon} ${_esc2(item.name)}</div>
        <div class="krieger-item-stats">Haltbarkeit ${dur}% · DEF wirkt zu ${dur}%</div>
        <div style="margin-top:5px"><button class="cc-build-btn krieger-repair-btn" data-repair="${item.key}"${can ? '' : ' disabled'}>Reparieren · ${cost} 🫘</button></div>
      </div>`;
    }).join('') : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:4px">Alle Rüstungen intakt. 👍</div>'}
  </div>`;

  // 🐎 Reittiere (Etappe 5): Slot dd.mount — mehr Schritte + kleiner Kampf-Boost, 1 aktiv.
  const mountHtml = `<div class="krieger-shop-section">
    <div class="section-title" style="font-size:13px">🐎 Reittiere <span style="font-weight:400;font-size:11px;color:var(--muted)">· 1 aktiv, Schritte + Kampf-Boost</span></div>
    <div class="krieger-shop-grid">
      ${(typeof KRIEGER_MOUNTS !== 'undefined' ? KRIEGER_MOUNTS : []).map(m => {
        const isOwned  = !!owned[m.key];
        const isActive = dd.mount === m.key;
        const locked   = level < m.minLevel;
        const canBuy   = !isOwned && !locked && state.memberCoins >= m.cost;
        let action;
        if (isActive)      action = `<span class="ciq-state ciq-on">✓ aktiv</span> <button class="cc-build-btn krieger-mount-unequip" style="font-size:11px;padding:3px 8px">Absitzen</button>`;
        else if (isOwned)  action = `<button class="cc-build-btn krieger-mount-equip" data-mount="${m.key}">Aufsitzen</button>`;
        else if (locked)   action = `<span class="ciq-state ciq-lock">🔒 ab Stufe ${m.minLevel}</span>`;
        else               action = `<button class="cc-build-btn krieger-mount-buy" data-mount="${m.key}"${canBuy ? '' : ' disabled'}>Kaufen · ${m.cost} 🫘</button>`;
        return `<div class="krieger-item-card${isOwned ? ' owned' : ''}${locked ? ' locked' : ''}">
          <div style="font-size:20px">${m.icon}</div>
          <div style="font-size:11px;font-weight:700">${_esc2(m.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin:2px 0">${_esc2(m.desc)}</div>
          <div style="margin-top:5px">${action}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // 🐴 Begleiter (Etappe 3): 4. Slot, kein Teil des Set-Bonus, nur 1 aktiv (dd.companion).
  const companionHtml = `<div class="krieger-shop-section">
    <div class="section-title" style="font-size:13px">🐴 Begleiter <span style="font-weight:400;font-size:11px;color:var(--muted)">· 1 aktiv, nicht Teil des Sets</span></div>
    <div class="krieger-shop-grid">
      ${(typeof KRIEGER_COMPANIONS !== 'undefined' ? KRIEGER_COMPANIONS : []).map(c => {
        const isOwned  = !!owned[c.key];
        const isActive = dd.companion === c.key;
        const locked   = level < c.minLevel;
        const canBuy   = !isOwned && !locked && state.memberCoins >= c.cost;
        let action;
        if (isActive)      action = `<span class="ciq-state ciq-on">✓ aktiv</span> <button class="cc-build-btn krieger-comp-unequip" style="font-size:11px;padding:3px 8px">Ablegen</button>`;
        else if (isOwned)  action = `<button class="cc-build-btn krieger-comp-equip" data-comp="${c.key}">Ausrüsten</button>`;
        else if (locked)   action = `<span class="ciq-state ciq-lock">🔒 ab Stufe ${c.minLevel}</span>`;
        else               action = `<button class="cc-build-btn krieger-comp-buy" data-comp="${c.key}"${canBuy ? '' : ' disabled'}>Kaufen · ${c.cost} 🫘</button>`;
        return `<div class="krieger-item-card${isOwned ? ' owned' : ''}${locked ? ' locked' : ''}">
          <div style="font-size:20px">${c.icon}</div>
          <div style="font-size:11px;font-weight:700">${_esc2(c.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin:2px 0">${_esc2(c.desc)}</div>
          <div style="margin-top:5px">${action}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // 🔮 Kaffeesatz-Lesen (Etappe 4): Sicht-Items, Slot 'scan' (1 aktiv). Nutzt die generischen
  // krieger-buy-btn / krieger-equip-btn-Handler unten (Scan-Items sind normale KRIEGER_ITEMS).
  const scanItems = KRIEGER_ITEMS.filter(i => i.slot === 'scan');
  const scanHtml = `<div class="krieger-shop-section">
    <div class="section-title" style="font-size:13px">🔮 Kaffeesatz-Lesen <span style="font-weight:400;font-size:11px;color:var(--muted)">· Sicht, 1 aktiv</span></div>
    <div class="krieger-shop-grid">
      ${scanItems.map(item => {
        const isOwned    = !!owned[item.key];
        const isEquipped = equipped.scan === item.key;
        const locked     = level < item.minLevel;
        const canBuy     = !isOwned && !locked && state.memberCoins >= item.cost;
        let action;
        if (isOwned)      action = isEquipped
          ? `<span class="ciq-state ciq-on">✓ aktiv</span>`
          : `<button class="cc-build-btn krieger-equip-btn" data-equip="${item.key}" data-slot="scan">Ausrüsten</button>`;
        else if (locked)  action = `<span class="ciq-state ciq-lock">🔒 ab Stufe ${item.minLevel}</span>`;
        else              action = `<button class="cc-build-btn krieger-buy-btn" data-buy-item="${item.key}"${canBuy ? '' : ' disabled'}>Kaufen · ${item.cost} 🫘</button>`;
        return `<div class="krieger-item-card${isOwned ? ' owned' : ''}${locked ? ' locked' : ''}">
          <div style="font-size:20px">${item.icon}</div>
          <div style="font-size:11px;font-weight:700">${_esc2(item.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin:2px 0">${_esc2(item.scanDesc || '')}</div>
          <div style="margin-top:5px">${action}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // ⚡ Auto-Ausrüsten (2026-07-15, User-Wunsch: „ein Klick legt ein komplettes Set an"): je
  // vollständig besessenem Kern-Set ein Knopf → Waffe+Rüstung+Talisman dieser Kultur + bester
  // besessener Stiefel-/Sicht-Slot in einem Zug. Erspart das manuelle Umstecken.
  const completeSets = (typeof kriegerOwnedCompleteSets === 'function') ? kriegerOwnedCompleteSets(dd) : [];
  const autoEquipHtml = completeSets.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin:2px 0 10px">
    <span style="font-size:12px;color:var(--muted)">⚡ Schnell-Ausrüsten:</span>
    ${completeSets.map(c => `<button class="cc-build-btn krieger-autoequip-btn" data-set="${c}" style="font-size:11px;padding:4px 9px"${setCulture === c ? ' disabled' : ''}>${KRIEGER_CULTURE_NAMES[c]}${setCulture === c ? ' ✓' : ''}</button>`).join('')}
  </div>` : '';

  body.innerHTML = `<div class="krieger-loadout">${loadoutHtml}</div>${autoEquipHtml}${setHint}${schmiedHtml}${scanHtml}${mountHtml}${companionHtml}${sections}`;

  body.querySelectorAll('.krieger-buy-btn').forEach(btn => {
    btn.onclick = async () => {
      const item = kriegerItemByKey(btn.dataset.buyItem);
      if (!item) return;
      btn.disabled = true;
      try {
        const newDD = await DB.buyKriegerItem(member.id, item, state.dd);
        state.dd = newDD;
        // Tatsächlich belasteter Betrag (kann durch einen Ausrüstungsfund-Gutschein 50%
        // günstiger sein als item.cost, siehe buyKriegerItem in db.js) für die optimistische
        // Coins-Anzeige verwenden — sonst weicht die Anzeige vom echten Kontostand ab.
        state.memberCoins -= (newDD._costPaid ?? item.cost);
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
        _updateHeaderCoins({ coins: state.memberCoins });
        showToast(newDD._discountApplied
          ? `🛒 ${item.name} erworben! 🎁 Gutschein eingelöst (50% günstiger).`
          : `🛒 ${item.name} erworben!`, 'success');
        try { await DB.postMessage(`🛒 ${_esc2(member.name)} hat ${item.icon} ${_esc2(item.name)} erworben!`, member.name); } catch (e) {}
        // 🗡️ Achievement: erste Tier-3-Waffe (Meisterwaffe)
        if (item.tier === 3 && item.slot === 'weapon') {
          try {
            const existing = currentUserData?.achievements || {};
            if (!existing.krieger_tier3_first) {
              await DB.grantAchievements(member.id, { krieger_tier3_first: true });
              currentUserData = { ...currentUserData, achievements: { ...existing, krieger_tier3_first: true } };
              const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === 'krieger_tier3_first');
              if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
            }
          } catch (e) { /* non-critical */ }
        }
        // Ausgabe im Tages-Log (tatsächlich gezahlter Betrag, inkl. evtl. Gutschein-Rabatt).
        try {
          const paid = newDD._costPaid ?? item.cost;
          const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `🛒 ${item.name}`, amount: -paid, cat: 'krieger', detail: 'Kaffee-Krieger-Ausrüstung', invest: true }]);
          if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
        } catch (e) { /* non-critical */ }
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Kauf fehlgeschlagen', 'error'); btn.disabled = false; }
    };
  });

  body.querySelectorAll('.krieger-equip-btn').forEach(btn => {
    btn.onclick = async () => {
      const slot = btn.dataset.slot, key = btn.dataset.equip;
      const prevEquipped = state.dd.equipped || {};
      const newEquipped  = { ...prevEquipped, [slot]: key };
      const newDD = { ...state.dd, equipped: newEquipped };
      try {
        await DB.saveDungeonData(member.id, newDD);
        const wasComplete = kriegerActiveSetCulture(prevEquipped);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        const nowComplete = kriegerActiveSetCulture(newEquipped);
        if (nowComplete && !wasComplete) {
          const bonus = KRIEGER_SET_BONUSES[nowComplete];
          showToast(`✨ Set komplett: ${bonus.name}!`, 'success');
          try { await DB.postMessage(`✨ ${_esc2(member.name)} hat das ${KRIEGER_CULTURE_NAMES[nowComplete]}-Set komplettiert! (${_esc2(bonus.name)} aktiv)`, member.name); } catch (e) {}
          try {
            const existing = currentUserData?.achievements || {};
            if (!existing.krieger_set_complete) {
              await DB.grantAchievements(member.id, { krieger_set_complete: true });
              currentUserData = { ...currentUserData, achievements: { ...existing, krieger_set_complete: true } };
              const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === 'krieger_set_complete');
              if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
            }
          } catch (e) {}
        }
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Ausrüsten fehlgeschlagen', 'error'); }
    };
  });

  // ⚡ Auto-Ausrüsten: komplettes Kern-Set einer Kultur + bester Stiefel/Sicht in einem Klick.
  body.querySelectorAll('.krieger-autoequip-btn').forEach(btn => {
    btn.onclick = async () => {
      const culture = btn.dataset.set;
      if (typeof kriegerEquipSetLoadout !== 'function') return;
      const prevEquipped = state.dd.equipped || {};
      const newEquipped  = kriegerEquipSetLoadout(state.dd, culture);
      const newDD = { ...state.dd, equipped: newEquipped };
      btn.disabled = true;
      try {
        await DB.saveDungeonData(member.id, newDD);
        const wasComplete = kriegerActiveSetCulture(prevEquipped);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        const nowComplete = kriegerActiveSetCulture(newEquipped);
        const bonus = KRIEGER_SET_BONUSES[nowComplete] || KRIEGER_SET_BONUSES[culture];
        showToast(`✨ ${KRIEGER_CULTURE_NAMES[culture]}-Set angelegt${bonus ? ' — ' + bonus.name : ''}!`, 'success');
        if (nowComplete && !wasComplete) {
          try {
            const existing = currentUserData?.achievements || {};
            if (!existing.krieger_set_complete) {
              await DB.grantAchievements(member.id, { krieger_set_complete: true });
              currentUserData = { ...currentUserData, achievements: { ...existing, krieger_set_complete: true } };
              const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === 'krieger_set_complete');
              if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
            }
          } catch (e) { /* non-critical */ }
        }
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Ausrüsten fehlgeschlagen', 'error'); btn.disabled = false; }
    };
  });

  body.querySelectorAll('.krieger-repair-btn').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.repair;
      const cost = kriegerRepairCost(state.dd, key);
      if (cost <= 0) return;
      if (state.memberCoins < cost) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
      btn.disabled = true;
      try {
        const newDD = await DB.repairArmor(member.id, key, cost, state.dd);
        state.dd = newDD;
        state.memberCoins -= cost;
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
        _updateHeaderCoins({ coins: state.memberCoins });
        // Ausgabe im Tages-Log (Reparaturkosten).
        try {
          const item = kriegerItemByKey(key);
          const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `🔨 Reparatur: ${item ? item.name : 'Rüstung'}`, amount: -cost, cat: 'krieger', detail: 'Kaffee-Krieger-Ausrüstung' }]);
          if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
        } catch (e) { /* non-critical */ }
        showToast('🔨 Rüstung repariert — volle Haltbarkeit!', 'success');
        _kriegerRenderShop(member, state, body);
      } catch (e) { btn.disabled = false; showToast(e.message || 'Reparatur fehlgeschlagen', 'error'); }
    };
  });

  // 🐴 Begleiter kaufen (auto-ausrüsten, wenn noch keiner aktiv)
  body.querySelectorAll('.krieger-comp-buy').forEach(btn => {
    btn.onclick = async () => {
      const comp = (typeof kriegerCompanionByKey === 'function') ? kriegerCompanionByKey(btn.dataset.comp) : null;
      if (!comp) return;
      btn.disabled = true;
      try {
        let newDD = await DB.buyKriegerCompanion(member.id, comp, state.dd);
        state.memberCoins -= comp.cost;
        // Auto-ausrüsten, wenn bisher kein Begleiter aktiv ist (Komfort)
        if (!newDD.companion) {
          newDD = { ...newDD, companion: comp.key };
          try { await DB.saveDungeonData(member.id, newDD); } catch (e) { /* non-critical */ }
        }
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
        _updateHeaderCoins({ coins: state.memberCoins });
        showToast(`🐴 ${comp.name} erworben${state.dd.companion === comp.key ? ' & ausgerüstet' : ''}!`, 'success');
        try { await DB.postMessage(`🐴 ${_esc2(member.name)} hat den Begleiter ${comp.icon} ${_esc2(comp.name)} erworben!`, member.name); } catch (e) {}
        try {
          const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `🐴 Begleiter: ${comp.name}`, amount: -comp.cost, cat: 'krieger', detail: 'Kaffee-Krieger-Ausgabe', invest: true }]);
          if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
        } catch (e) { /* non-critical */ }
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Kauf fehlgeschlagen', 'error'); btn.disabled = false; }
    };
  });

  // 🐴 Begleiter ausrüsten (1 aktiv)
  body.querySelectorAll('.krieger-comp-equip').forEach(btn => {
    btn.onclick = async () => {
      const comp = (typeof kriegerCompanionByKey === 'function') ? kriegerCompanionByKey(btn.dataset.comp) : null;
      if (!comp) return;
      const newDD = { ...state.dd, companion: comp.key };
      try {
        await DB.saveDungeonData(member.id, newDD);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        showToast(`🐴 ${comp.name} ausgerüstet!`, 'success');
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Ausrüsten fehlgeschlagen', 'error'); }
    };
  });

  // 🐴 Begleiter ablegen
  body.querySelectorAll('.krieger-comp-unequip').forEach(btn => {
    btn.onclick = async () => {
      const newDD = { ...state.dd, companion: null };
      try {
        await DB.saveDungeonData(member.id, newDD);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Ablegen fehlgeschlagen', 'error'); }
    };
  });

  // 🐎 Reittier kaufen (auto-aufsitzen, wenn noch keins aktiv)
  body.querySelectorAll('.krieger-mount-buy').forEach(btn => {
    btn.onclick = async () => {
      const mount = (typeof kriegerMountByKey === 'function') ? kriegerMountByKey(btn.dataset.mount) : null;
      if (!mount) return;
      btn.disabled = true;
      try {
        let newDD = await DB.buyKriegerMount(member.id, mount, state.dd);
        state.memberCoins -= mount.cost;
        if (!newDD.mount) {
          newDD = { ...newDD, mount: mount.key };
          try { await DB.saveDungeonData(member.id, newDD); } catch (e) { /* non-critical */ }
        }
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), coins: state.memberCoins, dungeon_data: state.dd };
        _updateHeaderCoins({ coins: state.memberCoins });
        showToast(`🐎 ${mount.name} erworben${state.dd.mount === mount.key ? ' & aufgesessen' : ''}!`, 'success');
        try { await DB.postMessage(`🐎 ${_esc2(member.name)} hat das Reittier ${mount.icon} ${_esc2(mount.name)} erworben!`, member.name); } catch (e) {}
        try {
          const mdLog = await DB.appendTodayLogFresh(member.id, [{ label: `🐎 Reittier: ${mount.name}`, amount: -mount.cost, cat: 'krieger', detail: 'Kaffee-Krieger-Ausgabe', invest: true }]);
          if (mdLog) { currentUserData = { ...(currentUserData || {}), map_data: mdLog }; member.map_data = mdLog; }
        } catch (e) { /* non-critical */ }
        // Achievement: erstes Reittier
        try {
          const existing = currentUserData?.achievements || {};
          if (!existing.krieger_mount_first) {
            await DB.grantAchievements(member.id, { krieger_mount_first: true });
            currentUserData = { ...currentUserData, achievements: { ...existing, krieger_mount_first: true } };
            const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === 'krieger_mount_first');
            if (ach) showToast(`🏆 Achievement: ${ach.name}! (+${ach.coinReward} CC)`, 'success');
          }
        } catch (e) { /* non-critical */ }
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Kauf fehlgeschlagen', 'error'); btn.disabled = false; }
    };
  });

  // 🐎 Reittier aufsitzen (1 aktiv)
  body.querySelectorAll('.krieger-mount-equip').forEach(btn => {
    btn.onclick = async () => {
      const mount = (typeof kriegerMountByKey === 'function') ? kriegerMountByKey(btn.dataset.mount) : null;
      if (!mount) return;
      const newDD = { ...state.dd, mount: mount.key };
      try {
        await DB.saveDungeonData(member.id, newDD);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        showToast(`🐎 ${mount.name} aufgesessen!`, 'success');
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Aufsitzen fehlgeschlagen', 'error'); }
    };
  });

  // 🐎 Reittier absitzen
  body.querySelectorAll('.krieger-mount-unequip').forEach(btn => {
    btn.onclick = async () => {
      const newDD = { ...state.dd, mount: null };
      try {
        await DB.saveDungeonData(member.id, newDD);
        state.dd = newDD;
        currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };
        _kriegerRenderShop(member, state, body);
      } catch (e) { showToast(e.message || 'Absitzen fehlgeschlagen', 'error'); }
    };
  });
}

// ── Sub-Tab: Fortschritt ─────────────────────────────────────────────────────
function _kriegerRenderProgress(member, state, body) {
  const dd = state.dd;
  const prog = kriegerProgress(dd);
  const equipped = dd.equipped || {};
  const setCulture = kriegerActiveSetCulture(equipped);
  const ownedItems = KRIEGER_ITEMS.filter(i => (dd.owned || {})[i.key]);
  const itemsHtml = ownedItems.length
    ? ownedItems.map(i => `<div class="cc-passiv-detail-row"><span>${i.icon} ${_esc2(i.name)}</span><span>${equipped[i.slot] === i.key ? '✓ ausgerüstet' : ''}</span></div>`).join('')
    : '<p class="empty-hint">Noch keine Ausrüstung.</p>';

  // 🫘 Die Goldene Kaffeebohne — progressive 5-Kapitel-Questline
  const gb = (typeof kriegerGoldenBeanProgress === 'function') ? kriegerGoldenBeanProgress(dd) : { done: 0, total: 5, complete: false };
  const gbChapters = (typeof KRIEGER_GOLDEN_BEAN !== 'undefined' ? KRIEGER_GOLDEN_BEAN : []).map((ch, i) => {
    const unlocked = i < gb.done;
    return unlocked
      ? `<div style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06)"><div style="font-weight:700;font-size:12px">📜 Kapitel ${ch.chapter}: ${_esc2(ch.title)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${_esc2(ch.text)}</div></div>`
      : `<div style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);opacity:.5"><div style="font-weight:700;font-size:12px">🔒 Kapitel ${ch.chapter} — noch verborgen</div></div>`;
  }).join('');

  body.innerHTML = `
    <div class="krieger-xp-wrap" style="height:8px;border-radius:4px;overflow:hidden"><div class="krieger-xp-bar" style="width:${prog.pct}%"></div></div>
    <p style="text-align:center;margin:6px 0 14px">Stufe <strong>${prog.level}</strong>${prog.need ? ` &nbsp;·&nbsp; ${prog.xp}/${prog.need} EP (${prog.pct}%)` : ' (Maximalstufe erreicht)'}</p>
    <div class="cc-passiv-detail">
      <div class="cc-passiv-detail-row"><span>⚔️ Kampfwerte (inkl. Level)</span><span>ATK ${_kriegerOwnStats(dd).atk} · DEF ${_kriegerOwnStats(dd).def} · CRIT ${_kriegerOwnStats(dd).crit}%</span></div>
      <div class="cc-passiv-detail-row"><span>📈 Level-Bonus</span><span>+${kriegerLevelAtkBonus(prog.level)} ATK · +${kriegerLevelDefBonus(prog.level)} DEF · +${prog.level * 4} HP</span></div>
      <div class="cc-passiv-detail-row"><span>❤️ HP</span><span>${(typeof kriegerHp === 'function' ? kriegerHp(dd) : '—')}/${(typeof kriegerHpMax === 'function' ? kriegerHpMax(dd) : '—')}</span></div>
      <div class="cc-passiv-detail-row"><span>🏆 Siege</span><span>${dd.wins || 0}</span></div>
      <div class="cc-passiv-detail-row"><span>💀 Niederlagen</span><span>${dd.losses || 0}</span></div>
      <div class="cc-passiv-detail-row"><span>🐉 Boss-Kills</span><span>${dd.bossKills || 0}</span></div>
      <div class="cc-passiv-detail-row"><span>🧪 Tränke verbraucht</span><span>${dd.potionsUsed || 0}${dd.potionsSpent ? ` · ${_fmtCoins(dd.potionsSpent)} CC ausgegeben` : ''}</span></div>
      ${setCulture ? `<div class="cc-passiv-detail-row"><span>✨ Aktives Set</span><span>${_esc2(KRIEGER_SET_BONUSES[setCulture].name)}</span></div>` : ''}
      ${(typeof kriegerActiveMount === 'function' && kriegerActiveMount(dd)) ? `<div class="cc-passiv-detail-row"><span>🐎 Reittier</span><span>${kriegerActiveMount(dd).icon} ${_esc2(kriegerActiveMount(dd).name)}</span></div>` : ''}
      ${(typeof kriegerActiveCompanion === 'function' && kriegerActiveCompanion(dd)) ? `<div class="cc-passiv-detail-row"><span>🐴 Begleiter</span><span>${kriegerActiveCompanion(dd).icon} ${_esc2(kriegerActiveCompanion(dd).name)}</span></div>` : ''}
      ${(typeof kriegerActiveScan === 'function' && kriegerActiveScan(dd)) ? `<div class="cc-passiv-detail-row"><span>🔮 Sicht</span><span>${kriegerActiveScan(dd).icon} ${_esc2(kriegerActiveScan(dd).name)}</span></div>` : ''}
    </div>
    <div class="section-title" style="font-size:13px;margin-top:14px">🫘 Die Goldene Kaffeebohne (${gb.done}/${gb.total})</div>
    <p style="font-size:11px;color:var(--muted);text-align:center;margin:0 0 6px">Meilensteine: je 1 Sieg gegen Tier 1–4 &amp; den Espresso-Drachen 3× besiegen.</p>
    ${gbChapters}
    ${gb.complete ? '<p style="text-align:center;color:#FAC775;font-weight:700;margin-top:6px">✨ Die Legende ist vollständig!</p>' : ''}
    <div class="section-title" style="font-size:13px;margin-top:14px">🎒 Ausrüstung (${ownedItems.length}/${KRIEGER_ITEMS.length})</div>
    ${itemsHtml}
  `;
}
