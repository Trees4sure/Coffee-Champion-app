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
          typeof calcResearchPerDay === 'function' ? calcResearchPerDay(research) : 0
        )}/Tag</span>
      </div>
      <div class="imperium-score">
        Forschungs-Score: <strong>${(typeof calcResearchScore === 'function' ? calcResearchScore(research) : 0).toLocaleString('de-DE')} CC</strong>
      </div>
    </div>

    <div class="imperium-tabs" id="imp-tabs">
      <button class="imp-tab active" data-tab="baum">🌳 Forschung</button>
      <button class="imp-tab" data-tab="karte">🗺️ Karte</button>
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
    // Karte-Tab: immer aktuellsten Stand (currentUserData hat map_data-Updates)
    const freshMember = btn.dataset.tab === 'karte' ? (currentUserData || member) : member;
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
  if (tab === 'stats')     el.innerHTML = _buildImperiumStats();
  if (tab === 'cosmetics') el.innerHTML = _buildCosmetics(member);

  // Event-Delegation für Kaufbuttons
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-buy]');
    if (btn) await _handleBuy(btn.dataset.buy, member);
    const cBtn = e.target.closest('[data-contribute]');
    if (cBtn) await _handleContribute(cBtn.dataset.contribute, member);
    const cosBtn = e.target.closest('[data-cosm-set]');
    if (cosBtn) await _handleCosmeticsSet(cosBtn.dataset.cosmSet, cosBtn.dataset.cosmVal, member);
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
      const bonus = item.perCup > 0 ? `+${item.perCup}/T` : item.perDay > 0 ? `+${item.perDay}/Tag` : item.special ? '✦' : '';
      html += `<div class="cc-ri ${owned ? 'cc-ri-owned' : ''}" title="${_esc2(item.name)} — ${_esc2(bonus)}">
        <span class="cc-ri-path">${item.pathIcon}</span>
        <div class="cc-ri-icon">${item.icon}</div>
        <p class="cc-ri-name">${_esc2(item.name)}</p>
        <p class="cc-ri-cost">${owned ? '✓' : item.cost.toLocaleString('de-DE') + ' CC'}</p>
        <p class="cc-ri-bonus">${owned ? _esc2(bonus) : _esc2(bonus)}</p>
        ${!owned ? `<button class="cc-buy-btn" data-buy="${item.id}">Kaufen</button>` : ''}
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

// ── Kaffee-Kasse ──────────────────────────────────────────────────────────────
async function _buildKasse(member) {
  if (typeof KASSE_GOALS === 'undefined') return '';
  let treasury = { balance: 0, contributions: {}, unlocked_goals: {} };
  try { treasury = await DB.fetchTreasury(); } catch (e) {}

  const myContrib = parseFloat((treasury.contributions || {})[member.id]) || 0;
  let html = `
    <div class="cc-kasse-header">
      <div class="cc-kasse-balance">
        ${_coinBadge(treasury.balance, 'md')}
        <span class="cc-kasse-bal-val">${_fmtCoins(treasury.balance)}</span>
        <span style="font-size:.8rem;color:var(--muted)"> GC Gruppenstand</span>
      </div>
      <p class="cc-kasse-mycontrib">Dein Beitrag: <strong>${_fmtCoins(myContrib)} GC</strong></p>
    </div>
    <div class="cc-kasse-contribute">
      <input type="number" id="kasse-input" min="1" max="9999" placeholder="CC einzahlen…" style="width:120px">
      <button class="btn-primary" data-contribute="kasse" style="padding:8px 16px;font-size:.82rem">🏛️ Einzahlen</button>
    </div>
    <div class="section-title" style="margin:16px 0 8px">Gruppen-Ziele</div>`;

  for (const goal of KASSE_GOALS) {
    const unlocked  = !!(treasury.unlocked_goals || {})[goal.id];
    const pct       = Math.min(100, Math.round((treasury.balance / goal.cost) * 100));
    html += `<div class="cc-goal ${unlocked ? 'cc-goal-done' : ''}">
      <div class="cc-goal-head">
        <span class="cc-goal-icon">${goal.icon}</span>
        <span class="cc-goal-name">${_esc2(goal.name)}</span>
        <span class="cc-goal-cost">${goal.cost.toLocaleString('de-DE')} GC</span>
      </div>
      <p class="cc-goal-desc">${_esc2(goal.desc)}</p>
      ${unlocked
        ? '<p class="cc-goal-done-lbl">✓ Erreicht!</p>'
        : `<div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
           <p class="cc-progress-pct">${pct}% (${_fmtCoins(treasury.balance)} / ${goal.cost.toLocaleString('de-DE')} GC)</p>`}
    </div>`;
  }
  return html;
}

// ── Imperium Statistik ────────────────────────────────────────────────────────
function _buildImperiumStats() {
  if (!appData?.users?.length) return '<p style="color:var(--muted);padding:16px">Keine Daten verfügbar</p>';
  const users = [...appData.users].sort((a,b) => (calcResearchScore(b.research||{}) - calcResearchScore(a.research||{})));

  let html = '<div class="cc-stats-list">';
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
    html += `<div class="cc-stats-player">
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
          ${itemIcons ? '&nbsp;·&nbsp; ' + itemIcons : ''}
          ${effectLine ? '&nbsp;·&nbsp; <span class="cc-stats-effect">' + _esc2(effectLine) + '</span>' : ''}
        </div>
        ${bldDone.length ? `<div class="cc-stats-sub cc-stats-karte">🏗️ ${bldDone.length} Gebäude ${bldIcons}${bldPerDay > 0 ? ' &nbsp;·&nbsp; +' + _fmtCoins(bldPerDay) + '/Tag' : ''}</div>` : ''}
        ${_buildResearchBars(u.research || {})}
      </div>
    </div>`;
  }
  html += '</div>';
  return html;
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
    const result = await DB.purchaseResearchItem(member.id, itemId);
    appData = await DB.fetchData();
    const updatedMember = appData.users.find(u => u.id === member.id);
    if (updatedMember) currentUserData = { ...currentUserData, ...updatedMember };
    _updateHeaderCoins(updatedMember || member);
    showToast(`✓ ${result.item.name || itemId} freigeschaltet! (-${result.item.cost || 0} CC)`, 'success');
    if (result.autoUnlocked?.length) {
      for (const c of result.autoUnlocked) showToast(`✦ Kombo: ${c.name} freigeschaltet!`, 'success');
    }
    await renderImperium();
  } catch (e) { showToast(e.message, 'error'); }
}

async function _handleContribute(_, member) {
  const input  = document.getElementById('kasse-input');
  const amount = parseFloat(input?.value || '0');
  if (!amount || amount < 1) { showToast('Betrag eingeben!', 'error'); return; }
  try {
    const result = await DB.contributeToTreasury(member.id, amount);
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
    showToast(`✓ Avatar "${av.name}" gekauft! (-${av.cost} CC)`, 'success');
  }

  if (field === 'buyTitel') {
    const t = (ZUSATZTITEL || []).find(z => z.id === val);
    if (!t?.cost) return;
    const newCoins = await DB.spendCoins(member.id, t.cost);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    cosm.boughtTitel = { ...(cosm.boughtTitel || {}), [val]: true };
    cosm.zusatztitel = val;
    showToast(`✓ Titel "${t.name}" gekauft! (-${t.cost} CC)`, 'success');
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
          <div class="cc-coins-passive">+${_fmtCoins(typeof calcResearchPerCup === 'function' ? calcResearchPerCup(member.research||{}) : 0)} CC/Tasse &nbsp;·&nbsp; +${_fmtCoins(typeof calcResearchPerDay === 'function' ? calcResearchPerDay(member.research||{}) : 0)} CC/Tag</div>
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
  const stepsMax  = karteStepsAllowed(state.mapData);
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
    memberCoins: member.coins || 0,
    vpX: Math.max(0, Math.min(KARTE_WORLD - _COLS, initPos.x - Math.floor(_COLS / 2))),
    vpY: Math.max(0, Math.min(KARTE_WORLD - _ROWS, initPos.y - Math.floor(_ROWS / 2))),
  };
  const seed  = _karteWorldSeed();

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
  const stepsMax0  = karteStepsAllowed(state.mapData);
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
      const superseded = owned && bestOwned0 && bestOwned0.key !== u.key;
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
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY);

  // Kauf-Button Handler
  document.getElementById('cc-karte-buy-steps')?.addEventListener('click', async () => {
    const newCoins = await DB.spendCoins(member.id, 10);
    if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }
    state.memberCoins = newCoins;
    currentUserData = { ...(currentUserData || {}), coins: newCoins };
    _updateHeaderCoins({ coins: newCoins });
    state.mapData = { ...state.mapData, steps_extra_date: new Date().toLocaleDateString('de-DE') };
    await DB.updateMapData(member.id, state.mapData).catch(() => {});
    currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
    showToast('✅ +5 Schritte freigeschaltet!', 'success');
    _karteUpdateHUD(state);
    const c = document.getElementById('cc-karte-canvas');
    if (c) karteRender(c, state.mapData, seed, state.vpX, state.vpY);
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
      karteRender(canvas, state.mapData, seed, state.vpX, state.vpY);
    }
  });

  async function _onCanvasTap(e) {
    if (_moved) return; // war ein Wischen, kein Tippen
    const { tx, ty } = _tileFromEvent(e);
    // 1) Betretbares (angrenzendes, unerkundetes) Feld → Schritt
    if (karteCanStep(tx, ty, state.mapData)) {
      await _handleKarteStep(tx, ty, member, state, seed, _COLS, _ROWS, _MARGIN);
      return;
    }
    // 2) Erkundetes Feld → Gebäude-Info (falls Footprint trifft) oder Bau-Menü
    if (karteIsExplored(tx, ty, state.mapData)) {
      const cover = karteBuildingCovering(tx, ty, state.mapData.buildings || {});
      if (cover) { _showKarteBuildingInfo(cover.b); return; }
      const options = karteBuildableAt(tx, ty, state.mapData, seed);
      if (options.length) {
        if (karteIsBuildBlocked(state.mapData)) {
          showToast('🏛️ Umweltbehörde: heute keine Baugenehmigung!', 'error');
          return;
        }
        _showKarteBuildMenu(options, tx, ty, member, state, seed);
      }
    }
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
  const bagItem      = _getBestItemInSlot('bag',    upg);
  const hasBart      = !!_getBestItemInSlot('look', upg);
  const sensorFactor = sensorItem?.key === 'truffle_nose' ? 2.2 : sensorItem ? 1.5 : 1.0;

  const { newMapData, treasure, event } = karteExploreTile(tx, ty, state.mapData, seed, {
    treasureFactor: sensorFactor,
    backpackBoost:  bagItem?.key === 'backpack',
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
    const totalCC    = treasure.cc + bartBonus;
    // Optimistic UI update sofort
    state.memberCoins += totalCC;
    currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
    _updateHeaderCoins({ coins: state.memberCoins });
    try {
      await DB.addCoins(member.id, totalCC);
    } catch (e) { console.warn('add_coins Fehler:', e); }
    try {
      state.mapData = DB.appendTodayLog(state.mapData, [{ label: `🗺️ ${treasure.name}`, amount: totalCC }]);
      currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
      await DB.updateMapData(member.id, state.mapData);
    } catch (e) { console.warn('Tages-Log (Schatz) Fehler:', e); }
    try {
      await DB.postMessage(
        `🗺️ ${_esc2(member.name)} hat "${_esc2(treasure.name)}" entdeckt! (+${totalCC} ☕ CC)\n"${_esc2(treasure.quote)}"`,
        member.name
      );
    } catch (e) { console.warn('Chat-Broadcast Fehler:', e); }
    const displayTreasure = bartBonus ? { ...treasure, cc: totalCC } : treasure;
    _showKarteDiscovery(displayTreasure);
    showToast(`${treasure.emoji} ${treasure.name} entdeckt! +${totalCC} CC`, 'success');
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
      state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name}`, amount: bonusCC }]);
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
          state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name}`, amount: bonusCC }]);
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
        try {
          state.mapData = DB.appendTodayLog(state.mapData, [{ label: `${event.emoji} ${event.name}`, amount: -pay }]);
          currentUserData = { ...(currentUserData || {}), map_data: state.mapData };
          await DB.updateMapData(member.id, state.mapData);
        } catch (e) { console.warn('Tages-Log (Strafe) Fehler:', e); }
      }
    }

    _showKarteEvent(event, noteText);
    showToast(event.emoji + ' ' + event.name + (noteText ? ' — ' + noteText : ''), 'success');
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
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY);

  _karteUpdateHUD(state);
}

async function _handleKarteUpgrade(key, cost, member, state, seed) {
  const upg = KARTE_ITEMS.find(u => u.key === key);
  if (!upg) return;
  const newCoins = await DB.spendCoins(member.id, cost);
  if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }

  state.memberCoins = newCoins;
  currentUserData = { ...(currentUserData || {}), coins: newCoins };
  _updateHeaderCoins({ coins: newCoins });

  state.mapData = { ...state.mapData, upgrades: { ...(state.mapData.upgrades || {}), [key]: true } };
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
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY);
  _karteUpdateHUD(state);
}

function _showKarteDiscovery(treasure) {
  const popup = document.getElementById('cc-karte-popup');
  if (!popup) return;
  popup.classList.remove('hidden');
  popup.innerHTML = `
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
      <button class="cc-karte-popup-close"
        onclick="document.getElementById('cc-karte-popup').classList.add('hidden')">
        Weiter →
      </button>
    </div>
  `;
}

// ── Gebäude-Bau ───────────────────────────────────────────────────────────────
function _buildingEffectLabel(b) {
  if (b.perDay)    return `+${b.perDay} CC/Tag`;
  if (b.harbor)    return '1% aller Forschungskäufe der Gruppe';
  if (b.stepBonus) return `+${b.stepBonus} Schritt/Tag`;
  if (b.fogRadius) return 'Deckt Nebel im Umkreis auf';
  return '';
}

function _showKarteBuildMenu(options, cx, cy, member, state, seed) {
  const popup = document.getElementById('cc-karte-popup');
  if (!popup) return;
  popup.classList.remove('hidden');
  const rows = options.map(({ def, ax, ay }) => {
    const afford = (state.memberCoins || 0) >= def.cost;
    const w = def.w || 1, h = def.h || 1;
    const size = (w > 1 || h > 1) ? ` · ${w}×${h}` : '';
    return `<div class="cc-build-opt">
      <span class="cc-build-emoji">${def.emoji}</span>
      <div class="cc-build-info">
        <strong>${_esc2(def.name)}${size}</strong>
        <span class="cc-build-eff">${_buildingEffectLabel(def)} · fertig in ${def.days} Tag${def.days > 1 ? 'en' : ''}</span>
      </div>
      <button class="cc-build-btn" data-build="${def.key}" data-ax="${ax}" data-ay="${ay}" ${afford ? '' : 'disabled'}>${afford ? 'Bauen' : 'zu wenig'} · ${def.cost} 🫘</button>
    </div>`;
  }).join('');
  popup.innerHTML = `
    <div class="cc-karte-popup-inner">
      <div class="cc-karte-popup-hdr">🏗️ HIER BAUEN &nbsp;(${cx}, ${cy})</div>
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
  const popup = document.getElementById('cc-karte-popup');
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
    const daysLeft = Math.max(1, Math.ceil((b.completesAt - Date.now()) / 86400000));
    status = `🚧 Im Bau — noch ca. ${daysLeft} Tag${daysLeft > 1 ? 'e' : ''}`;
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
  const newCoins = await DB.spendCoins(member.id, def.cost);
  if (newCoins === null) { showToast('Nicht genug CoffeeCoins!', 'error'); return; }

  state.memberCoins = newCoins;
  currentUserData = { ...(currentUserData || {}), coins: newCoins };
  _updateHeaderCoins({ coins: newCoins });

  state.mapData = karteStartBuild(buildingKey, ax, ay, state.mapData, Date.now());
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
  if (canvas) karteRender(canvas, state.mapData, seed, state.vpX, state.vpY);
  _karteUpdateHUD(state);
}

function _showKarteEvent(event, noteText) {
  const popup = document.getElementById('cc-karte-popup');
  if (!popup) return;
  popup.classList.remove('hidden');
  popup.innerHTML = `
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
      <button class="cc-karte-popup-close"
        onclick="document.getElementById('cc-karte-popup').classList.add('hidden')">
        Weiter →
      </button>
    </div>
  `;
}
