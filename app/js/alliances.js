// ═══════════════════════════════════════════════════════════════════════════
// alliances.js — Weltbündnisse (plans/PLAN_weltbuendnisse.md)
// Muss NACH world.js geladen werden (nutzt worldRanksForMember/_esc2/_fmtCoins),
// VOR imperium.js (das keine direkten Verweise braucht — world.js selbst ruft
// die Render-Funktionen hier auf).
//
// Drei Typen, Antrag (propose_alliance) → Annahme/Ablehnung (respond_alliance):
// 🕊️ Frieden + 🛡️ Schutz sind PERSONENbezogen (an die Regenten gebunden, lösen
// sich bei Rang-1-Verlust auf) — 🤝 Handel ist dagegen LÄNDERbezogen: einmal
// geschlossen, läuft es weiter, egal wer country_a/country_b regiert ("das Geld
// bekommt der regierende Mitspieler"). Antragsteller bietet beim Handel ein
// CC-Geschenk an (fließt erst bei Annahme), danach +10% auf das Einkommen AUS
// DEM JEWEILIGEN LAND (nicht global) für beide aktuellen Regenten. Bonus-/
// Tribut-Prozentsätze sind hier UND in db.js (_allianceTradeBonus /
// settleAllianceTributes) hinterlegt — müssen synchron gehalten werden.
// ═══════════════════════════════════════════════════════════════════════════

const ALLIANCE_MIN_OFFER = 35;        // Basis-Mindest-CC-Geschenk beim Handelsbündnis-Antrag
const ALLIANCE_OFFER_VALUE_PCT = 0.05; // + 5% vom Gesamtwert des Ziel-Landes (worldCountryValue)

// Mindest-Geschenk für einen Handelsbündnis-Antrag an targetCountryId: Basis + Prozentsatz vom
// Gesamtwert des Ziel-Landes (Summe aller Investitionen + Gebäudewert, siehe worldCountryValue in
// world.js) — ein bereits stark ausgebautes Land ist "teurer" zu umwerben als ein unbebautes.
function allianceMinOffer(targetCountryId, investments, byCountry) {
  const value = (typeof worldCountryValue === 'function') ? worldCountryValue(targetCountryId, investments, byCountry) : 0;
  return Math.round(ALLIANCE_MIN_OFFER + value * ALLIANCE_OFFER_VALUE_PCT);
}

const ALLIANCE_TYPES = [
  { id: 'handel', icon: '🤝', name: 'Handelsbündnis', durationDays: 14, bonusPct: 0.10, needsAccept: true,
    desc: `Du bietest mind. ${ALLIANCE_MIN_OFFER} CC als Geschenk an (mehr bei stark ausgebauten Ländern) — nimmt er/sie an, laufen 14 Tage lang +10% auf das Einkommen AUS DIESEM LAND für beide Seiten. Länderbezogen: wechselt die Regierung, profitiert automatisch der neue Regent — das Bündnis bricht dadurch nicht ab.` },
  { id: 'frieden', icon: '🕊️', name: 'Friedensbündnis', durationDays: 7, tributPct: 0.10, needsAccept: true,
    desc: 'Du zahlst 10% deines wöchentlichen Welt-Einkommens Tribut — dafür kann dich der Empfänger 7 Tage lang nicht per Investment aus Rang 1 verdrängen.' },
  { id: 'schutz', icon: '🛡️', name: 'Schutzbündnis', durationDays: 14, needsAccept: true,
    desc: 'Symmetrisch & kostenlos: 14 Tage lang könnt ihr euch gegenseitig nicht per Söldner sabotieren.' },
];

function allianceDef(id) { return ALLIANCE_TYPES.find(a => a.id === id) || null; }

// Aktive/pending Allianz zwischen zwei Mitgliedern (frieden/schutz, personenbezogen) bzw.
// zwei Ländern (handel, länderbezogen — siehe Kopfkommentar). Richtung egal.
function _allianceBetween(alliances, type, memberA, memberB, countryA, countryB) {
  if (type === 'handel') {
    return (alliances || []).find(a => a.type === 'handel' && (a.status === 'pending' || a.status === 'active')
      && ((a.country_a === countryA && a.country_b === countryB) || (a.country_a === countryB && a.country_b === countryA))) || null;
  }
  return (alliances || []).find(a => a.type === type && (a.status === 'pending' || a.status === 'active')
    && ((a.member_a === memberA && a.member_b === memberB) || (a.member_a === memberB && a.member_b === memberA))) || null;
}
function _allianceCounterpart(a, memberId) { return a.member_a === memberId ? a.member_b : a.member_a; }
function _allianceDaysLeft(a) {
  if (!a.expires_at) return null;
  return Math.max(0, Math.ceil((new Date(a.expires_at).getTime() - Date.now()) / 86400000));
}

// ── Länder-Sheet-Sektion: Bündnisse mit dem Regenten DIESES Landes ──────────
// governor: { member_id, member_name } (rank 1) aus fetchCountryStandings. myCountryId:
// ein Land, das `member` selbst gerade regiert (nötig für den Antrag — ein Spieler kann
// mehrere Länder regieren, hier bewusst einfach das erste gefundene verwendet). investments/
// byCountry: für die wertabhängige Mindest-Geschenkhöhe des Handelsbündnisses (country = Ziel-Land).
function renderAllianceSection(country, member, governor, alliances, myCountryId, investments, byCountry) {
  if (!governor || governor.member_id === member.id) return '';
  if (!myCountryId) {
    return `<div class="cc-world-section-title">🤝 Bündnisse</div>
      <p class="cc-world-pctnote">Werde zuerst selbst Regent eines Landes, um Bündnisse zu schließen.</p>`;
  }
  const minOffer = allianceMinOffer(country.id, investments, byCountry);
  const rows = ALLIANCE_TYPES.map(def => {
    const a = _allianceBetween(alliances, def.id, member.id, governor.member_id, myCountryId, country.id);
    let action;
    if (!a) {
      action = (def.id === 'handel')
        ? `<input type="number" class="cc-alliance-offer" data-alliance-offer-for="handel"
             min="${minOffer}" step="5" placeholder="≥${minOffer} CC">
           <button class="cc-build-btn cc-world-bbtn" data-alliance-propose="${def.id}" data-alliance-min-offer="${minOffer}">Vorschlagen</button>`
        : `<button class="cc-build-btn cc-world-bbtn" data-alliance-propose="${def.id}">Vorschlagen</button>`;
    } else if (a.status === 'active') {
      const days = _allianceDaysLeft(a);
      action = `<span class="cc-world-garde-on">✓ aktiv${days != null ? ` · noch ${days}d` : ''}</span>`;
    } else if (a.member_a === member.id) {
      action = `<span class="cc-world-blocked">⏳ wartet auf Annahme${a.offer_cc > 0 ? ` · ${_fmtCoins(a.offer_cc)} CC angeboten` : ''}</span>`;
    } else if (a.member_b === member.id) {
      action = `<span class="cc-world-blocked">📨 Antrag${a.offer_cc > 0 ? `: ${_fmtCoins(a.offer_cc)} CC angeboten` : ''}</span>
                 <button class="cc-build-btn cc-world-bbtn" data-alliance-accept="${a.id}">✅</button>
                 <button class="cc-build-btn cc-world-bbtn" data-alliance-decline="${a.id}">✕</button>`;
    } else {
      // Regierung hat seit dem Antrag gewechselt (nur bei 'handel' möglich, das
      // länderbezogen weiterläuft) — der neue Regent kann hier nicht antworten,
      // nur der ursprüngliche member_b (respond_alliance prüft das serverseitig).
      action = `<span class="cc-world-blocked">📨 Antrag offen (wartet auf ${_esc2(governor.member_name)})</span>`;
    }
    return `<div class="cc-alliance-row">
      <div class="cc-alliance-row-head">
        <span class="cc-alliance-name">${def.icon} ${_esc2(def.name)}</span>
        <span class="cc-alliance-actions">${action}</span>
      </div>
      <p class="cc-alliance-desc">${_esc2(def.desc)}</p>
    </div>`;
  }).join('');
  return `<div class="cc-world-section-title">🤝 Bündnisse <span>mit ${_esc2(governor.member_name)}</span></div>
    <div class="cc-alliance-list">${rows}</div>`;
}

// Gehört diese Allianz zu mir? 'handel' (aktiv) = länderbezogen: gilt für wen auch immer
// GERADE eines der beiden Länder regiert (myRankMap), nicht für den ursprünglichen Unterzeichner.
// 'frieden'/'schutz' + jedes 'pending' bleiben personenbezogen (nur Antragsteller/Ziel sehen es).
function _allianceIsMine(a, memberId, myRankMap) {
  if (a.type === 'handel' && a.status === 'active') {
    return !!(myRankMap && (myRankMap[a.country_a] === 1 || myRankMap[a.country_b] === 1));
  }
  return a.member_a === memberId || a.member_b === memberId;
}
// Anzeige-Label der "anderen Seite": bei aktivem Handel das andere LAND (der Regent kann
// gewechselt haben), sonst der andere SPIELER.
function _allianceOtherLabel(a, memberId, myRankMap, users) {
  if (a.type === 'handel' && a.status === 'active') {
    const otherCountryId = (myRankMap && myRankMap[a.country_a] === 1) ? a.country_b : a.country_a;
    const c = (typeof _worldById === 'function') ? _worldById(otherCountryId) : null;
    return c ? `${c.flag} ${c.name}` : otherCountryId;
  }
  const u = (users || []).find(x => x.id === _allianceCounterpart(a, memberId));
  return u ? u.name : '—';
}

// Kompakte Bündnis-Zusammenfassung für einen Spieler (Informant-Bericht, app.js
// _informantStatsHtml). userRankMap = worldRanksForMember(appData.worldInvestments, u.id).rankMap —
// nötig, weil 'handel' länderbezogen ist (siehe _allianceIsMine): zählt für u, wenn u GERADE
// eines der beiden Bündnis-Länder regiert, nicht nur wenn u der Erst-Unterzeichner war.
function _allianceSummaryForUser(userId, alliances, userRankMap) {
  let handel = 0, friedenPay = 0, friedenGet = 0, schutz = 0;
  for (const a of (alliances || [])) {
    if (a.status !== 'active') continue;
    if (a.type === 'handel') {
      if (userRankMap && (userRankMap[a.country_a] === 1 || userRankMap[a.country_b] === 1)) handel++;
    } else if (a.type === 'frieden') {
      if (a.member_a === userId) friedenPay++;
      else if (a.member_b === userId) friedenGet++;
    } else if (a.type === 'schutz') {
      if (a.member_a === userId || a.member_b === userId) schutz++;
    }
  }
  return { handel, friedenPay, friedenGet, schutz };
}

// ── Welt-Statistik-Übersicht: alle eigenen Bündnisse (alle Länder) ──────────
// myRankMap: worldRanksForMember(...).rankMap von `member` — nötig, um bei 'handel' zu
// bestimmen, ob ich GERADE eines der beiden beteiligten Länder regiere.
function renderAllianceOverview(alliances, member, users, myRankMap) {
  const mine = (alliances || [])
    .filter(a => (a.status === 'pending' || a.status === 'active') && _allianceIsMine(a, member.id, myRankMap));
  if (!mine.length) {
    return `<details class="cc-world-acc" data-acc="alliances"${_worldAccOpen.alliances ? ' open' : ''}><summary>🤝 Meine Bündnisse</summary>
      <p class="cc-world-empty">Noch keine Bündnisse. Öffne im Länder-Sheet ein fremd regiertes Land, um eines vorzuschlagen.</p></details>`;
  }
  const rows = mine.map(a => {
    const def = allianceDef(a.type); if (!def) return '';
    const otherLabel = _esc2(_allianceOtherLabel(a, member.id, myRankMap, users));
    const days = _allianceDaysLeft(a);
    let statusTxt, actions = '';
    if (a.status === 'active') {
      statusTxt = `✓ aktiv${days != null ? ` · noch ${days}d` : ''}`;
    } else if (a.member_a === member.id) {
      statusTxt = `⏳ wartet auf Annahme${a.offer_cc > 0 ? ` · ${_fmtCoins(a.offer_cc)} CC angeboten` : ''}`;
    } else if (a.member_b === member.id) {
      statusTxt = `📨 Antrag offen${a.offer_cc > 0 ? ` · ${_fmtCoins(a.offer_cc)} CC angeboten` : ''}`;
      actions = `<button class="cc-build-btn cc-world-bbtn" data-alliance-accept="${a.id}">✅</button>
                 <button class="cc-build-btn cc-world-bbtn" data-alliance-decline="${a.id}">✕</button>`;
    } else {
      statusTxt = '📨 Antrag offen (wartet auf Antwort)';
    }
    return `<div class="cc-alliance-row">
      <span class="cc-alliance-name">${def.icon} ${_esc2(def.name)} · ${otherLabel}</span>
      <span class="cc-alliance-status">${statusTxt}</span>
      <span class="cc-alliance-actions">${actions}</span>
    </div>`;
  }).filter(Boolean).join('');
  return `<details class="cc-world-acc" data-acc="alliances"${_worldAccOpen.alliances ? ' open' : ''}><summary>🤝 Meine Bündnisse</summary>
    <div class="cc-alliance-list">${rows}</div></details>`;
}
