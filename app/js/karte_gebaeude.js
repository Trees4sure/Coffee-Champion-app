// ═══════════════════════════════════════════════════════════════════════════
// karte_gebaeude.js — 🏗️ Gebäude-Übersicht für den Karten-Tab
// ═══════════════════════════════════════════════════════════════════════════
// Stand: 2026-08-05 · JP-Wunsch: „alle möglichen Gebäudetypen und deren Stats
// aufführen, die Anzahl, die man davon hat und wie viel es in Summe für den Tag bringt."
//
// Zeigt ALLE 15 Gebäude aus KARTE_BUILDINGS mit ihren Anforderungen und Erträgen,
// dazu den eigenen Bestand und das Tageseinkommen je Typ und in Summe.
//
// ARCHITEKTUR
//   • Rein lesend. Es wird nichts gebaut, gekauft oder gespeichert — das Modul kann
//     den Spielstand nicht verändern.
//   • KEINE SQL, kein Patch an imperium.js oder karte.js. Hängt sich selbst ein.
//   • Alle Zahlen kommen aus den vorhandenen Funktionen (karteBuildCost,
//     calcBuildingPerDay, calcBuildingStepBonus, karteBuildRemaining) — es wird
//     nichts nachgerechnet, was schon existiert.
//   • Muss NACH karte.js und imperium.js geladen werden.
// ═══════════════════════════════════════════════════════════════════════════

function _kgEsc(s) { return (typeof _esc2 === 'function') ? _esc2(String(s)) : String(s); }

// Terrain-Namen für die Anzeige — die Keys stehen so in KARTE_BUILDINGS.
const KG_TERRAIN_NAMES = {
  GRASS: '🌿 Wiese', FOREST: '🌲 Wald', MOUNTAIN: '⛰️ Berg',
  RIVER: '💧 Fluss', COFFEE: '☕ Kaffeefeld', PATH: '🛤️ Weg', ANY: 'überall',
};
function _kgTerrain(def) {
  if (!def?.terrain) return '—';
  const list = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
  return list.map(t => KG_TERRAIN_NAMES[t] || t).join(' / ');
}

// Bestand eines Typs, aufgeschlüsselt nach fertig / im Bau / heute beschädigt.
function kgBuildingTally(mapData, key) {
  const now = Date.now();
  const today = (typeof _todayKey === 'function') ? _todayKey() : '';
  let done = 0, building = 0, damaged = 0;
  for (const b of Object.values(mapData?.buildings || {})) {
    if (b.type !== key) continue;
    if (b.completesAt > now) { building++; continue; }
    done++;
    if (b.damaged === today) damaged++;
  }
  return { done, building, damaged, total: done + building };
}

// Nächste Fertigstellung eines Typs (für „🚧 noch 2 Tage")
function _kgNextDone(mapData, key) {
  const now = Date.now();
  let soonest = null;
  for (const b of Object.values(mapData?.buildings || {})) {
    if (b.type !== key || b.completesAt <= now) continue;
    if (soonest === null || b.completesAt < soonest) soonest = b.completesAt;
  }
  if (soonest === null) return null;
  return (typeof karteBuildRemaining === 'function')
    ? karteBuildRemaining(soonest, now) : { text: '…', short: '…' };
}

function _kgBuildHtml(member) {
  if (typeof KARTE_BUILDINGS === 'undefined') return '';
  const mapData = member?.map_data || {};
  const cosm    = member?.cosmetics || {};

  // Nach Pfad gruppieren, Reihenfolge wie in KARTE_BUILDINGS (leicht → schwer)
  const groups = [];
  for (const def of KARTE_BUILDINGS) {
    let g = groups.find(x => x.path === def.path);
    if (!g) { g = { path: def.path, items: [] }; groups.push(g); }
    g.items.push(def);
  }

  let totalPerDay = 0, totalOwned = 0, totalBuilding = 0, totalDamaged = 0;
  let html = '';

  for (const g of groups) {
    let rows = '';
    for (const def of g.items) {
      const t = kgBuildingTally(mapData, def.key);
      totalOwned    += t.done;
      totalBuilding += t.building;
      totalDamaged  += t.damaged;
      // Heute beschädigte Gebäude bringen nichts — genau wie in calcBuildingPerDay.
      const perDaySum = (def.perDay || 0) * Math.max(0, t.done - t.damaged);
      totalPerDay += perDaySum;

      const cost = (typeof karteBuildCost === 'function')
        ? karteBuildCost(def, mapData, cosm) : (def.cost || 0);
      const size = `${def.w || 1}×${def.h || 1}`;
      const extras = [];
      if (def.adjacent)   extras.push(`angrenzend ${_kgTerrain({ terrain: def.adjacent })}`);
      if (def.requires) {
        const r = KARTE_BUILDINGS.find(b => b.key === def.requires);
        extras.push(`braucht ${r ? r.emoji + ' ' + r.name : def.requires} in ${def.requireRange || 3} Feldern`);
      }
      if (def.stepBonus)  extras.push(`+${def.stepBonus} Schritt${def.stepBonus > 1 ? 'e' : ''}/Tag`);
      if (def.fogRadius)  extras.push(`deckt Nebel r=${def.fogRadius} auf`);
      if (def.harbor)     extras.push('1 % an Forschungskäufen');

      const nx = _kgNextDone(mapData, def.key);
      const status = t.total === 0
        ? '<span style="opacity:.45">—</span>'
        : `<strong>${t.done}×</strong>`
          + (t.building ? ` <span style="opacity:.7">+${t.building} 🚧${nx ? ' ' + _kgEsc(nx.short) : ''}</span>` : '')
          + (t.damaged  ? ` <span style="color:#ff9a8a">⚠️${t.damaged}</span>` : '');

      rows += `<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <span>${def.emoji} <strong>${_kgEsc(def.name)}</strong></span>
          <span style="text-align:right;white-space:nowrap">${status}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;opacity:.75;margin-top:2px">
          <span>${_kgEsc(_kgTerrain(def))} · ${size} · ${def.days} Tag${def.days > 1 ? 'e' : ''} · ${cost.toLocaleString('de-DE')} 🫘</span>
          <span style="white-space:nowrap">${def.perDay ? `+${def.perDay}/Tag` : '—'}</span>
        </div>
        ${extras.length ? `<div style="font-size:10.5px;opacity:.55;margin-top:2px">${_kgEsc(extras.join(' · '))}</div>` : ''}
        ${perDaySum ? `<div style="font-size:11px;color:var(--gold-bright);margin-top:2px">bringt dir ${perDaySum}/Tag</div>` : ''}
      </div>`;
    }
    html += `<div style="margin-top:10px">
      <div style="font-weight:700;font-size:12px;opacity:.85">${_kgEsc(g.path)}</div>${rows}</div>`;
  }

  // Gegenprobe mit der Originalfunktion — weicht sie ab, stimmt eine Annahme oben nicht.
  const official = (typeof calcBuildingPerDay === 'function')
    ? calcBuildingPerDay(mapData.buildings) : totalPerDay;
  const stepBonus = (typeof calcBuildingStepBonus === 'function')
    ? calcBuildingStepBonus(mapData.buildings) : 0;

  const kopf = `<div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="opacity:.75">Fertige Gebäude</span><strong>${totalOwned}</strong></div>
    ${totalBuilding ? `<div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="opacity:.75">Im Bau</span><strong>🚧 ${totalBuilding}</strong></div>` : ''}
    ${totalDamaged ? `<div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="opacity:.75">Heute beschädigt</span><strong style="color:#ff9a8a">⚠️ ${totalDamaged}</strong></div>` : ''}
    ${stepBonus ? `<div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="opacity:.75">Schritte durch Gebäude</span><strong>+${stepBonus}/Tag</strong></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid rgba(255,255,255,.15);margin-top:5px;padding-top:5px">
      <span>Einkommen heute</span><span>+${Math.round(official)} 🫘/Tag</span></div>`;

  return `<div style="padding:2px 0">${kopf}${html}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gruppenansicht — nach Personen aufgedröselt
// ═══════════════════════════════════════════════════════════════════════════
// Quelle ist appData.users (dieselbe Liste, aus der auch die Statistik-Kacheln in
// imperium.js gespeist werden). Jeder Eintrag trägt sein eigenes map_data.buildings.
// Rein lesend; fehlt appData, bleibt die Ansicht leer statt zu krachen.
function _kgGroupHtml() {
  const users = (typeof appData !== 'undefined' && Array.isArray(appData?.users)) ? appData.users : null;
  if (!users || !users.length) {
    return '<div style="font-size:12px;opacity:.6;padding:6px 0">Keine Gruppendaten geladen.</div>';
  }
  if (typeof KARTE_BUILDINGS === 'undefined') return '';

  const rows = users.map(u => {
    const md = u.map_data || {};
    const perDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(md.buildings) : 0;
    const steps  = (typeof calcBuildingStepBonus === 'function') ? calcBuildingStepBonus(md.buildings) : 0;
    let done = 0, building = 0, damaged = 0;
    const byType = new Map();
    for (const def of KARTE_BUILDINGS) {
      const t = kgBuildingTally(md, def.key);
      done += t.done; building += t.building; damaged += t.damaged;
      if (t.total > 0) byType.set(def.key, { def, t });
    }
    // Auffälligste Bauten zuerst — bei vielen Typen wird die Zeile sonst unlesbar.
    const liste = [...byType.values()]
      .sort((a, b) => b.t.done - a.t.done || (b.def.perDay || 0) - (a.def.perDay || 0))
      .map(x => `${x.def.emoji}${x.t.done + x.t.building}`)
      .join(' ');
    return { name: u.name || '?', perDay, steps, done, building, damaged, liste };
  }).sort((a, b) => b.perDay - a.perDay || b.done - a.done);

  const sumPerDay = rows.reduce((s, r) => s + r.perDay, 0);
  const sumDone   = rows.reduce((s, r) => s + r.done, 0);

  const body = rows.map((r, i) => `<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <span>${i === 0 && r.perDay > 0 ? '👑 ' : ''}<strong>${_kgEsc(r.name)}</strong></span>
        <span style="white-space:nowrap">+${Math.round(r.perDay)} 🫘/Tag</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;opacity:.75;margin-top:2px">
        <span>${r.done} fertig${r.building ? ` · 🚧 ${r.building}` : ''}${r.damaged ? ` · ⚠️ ${r.damaged}` : ''}${r.steps ? ` · +${r.steps} Schritte` : ''}</span>
      </div>
      ${r.liste ? `<div style="font-size:13px;margin-top:3px;letter-spacing:1px">${r.liste}</div>` : ''}
    </div>`).join('');

  return `<div style="padding:2px 0">
    <div style="display:flex;justify-content:space-between;font-size:12px">
      <span style="opacity:.75">Gebäude in der Gruppe</span><strong>${sumDone}</strong></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid rgba(255,255,255,.15);margin-top:5px;padding-top:5px">
      <span>Gruppen-Einkommen</span><span>+${Math.round(sumPerDay)} 🫘/Tag</span></div>
    ${body}
    <div style="font-size:10.5px;opacity:.5;margin-top:8px">
      Die Symbolzeile zeigt Anzahl je Gebäudetyp (fertig + im Bau).
    </div>
  </div>`;
}

// ── Einhängen (eigene aufklappbare Sektion am Ende des Karten-Tabs) ─────────
// Gewählte Ansicht überlebt Re-Renders innerhalb der Sitzung.
let _kgView = 'mine';

function karteGebaeudeMount() {
  const canvas = document.getElementById('cc-karte-canvas');
  if (!canvas) return;
  const host = canvas.parentElement;
  if (!host) return;
  const member = (typeof currentUserData !== 'undefined') ? currentUserData : null;
  if (!member) return;

  // Aufklapp-Zustand und gewählte Ansicht über einen Re-Render hinweg merken
  const wasOpen = document.getElementById('kg-details')?.open;
  document.getElementById('kg-wrap')?.remove();

  const view = _kgView;   // 'mine' | 'group'
  const tab = (id, label) => `<button data-kg-view="${id}"
    style="flex:1;padding:5px 8px;font-size:11px;border-radius:8px;cursor:pointer;
    border:1px solid ${view === id ? 'var(--gold)' : 'rgba(255,255,255,.15)'};
    background:${view === id ? 'rgba(212,175,55,.15)' : 'transparent'};
    color:inherit;font-weight:${view === id ? '700' : '400'}">${label}</button>`;

  const wrap = document.createElement('div');
  wrap.id = 'kg-wrap';
  wrap.style.cssText = 'margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px';
  wrap.innerHTML = `<details id="kg-details" ${wasOpen ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:700;list-style:none">🏗️ Gebäude-Übersicht</summary>
      <div style="display:flex;gap:6px;margin:8px 0">${tab('mine', '🏠 Meine')}${tab('group', '👥 Gruppe')}</div>
      <div>${view === 'group' ? _kgGroupHtml() : _kgBuildHtml(member)}</div>
    </details>`;
  host.appendChild(wrap);

  wrap.querySelectorAll('[data-kg-view]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      _kgView = b.dataset.kgView;
      karteGebaeudeMount();
      document.getElementById('kg-details')?.setAttribute('open', '');
    });
  });
}

// ── Selbstmontage (gleiches Muster wie karte_auto.js) ──────────────────────
(function _kgInstallHook() {
  try {
    const g = window;
    if (typeof g._karteUpdateHUD !== 'function') return;
    const _orig = g._karteUpdateHUD;
    if (_orig.__kgWrapped) return;
    const wrapped = function (state) {
      const out = _orig.apply(this, arguments);
      try { karteGebaeudeMount(); } catch (e) { console.warn('Gebäude-Übersicht:', e); }
      return out;
    };
    wrapped.__kgWrapped = true;
    g._karteUpdateHUD = wrapped;
  } catch (e) { console.warn('Gebäude-Übersicht: Hook nicht möglich:', e); }
})();

(function _kgInstallObserver() {
  if (typeof document === 'undefined') return;
  let pending = false;
  const tryMount = () => {
    pending = false;
    try {
      if (!document.getElementById('cc-karte-canvas')) return;
      if (document.getElementById('kg-wrap')) return;
      karteGebaeudeMount();
    } catch (e) { console.warn('Gebäude-Übersicht:', e); }
  };
  const schedule = () => { if (!pending) { pending = true; setTimeout(tryMount, 80); } };
  try {
    new MutationObserver(schedule).observe(document.body || document.documentElement, {
      childList: true, subtree: true,
    });
    schedule();
  } catch (e) { console.warn('Gebäude-Übersicht: Beobachter:', e); }
})();
