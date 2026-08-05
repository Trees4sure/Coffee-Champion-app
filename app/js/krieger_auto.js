// ═══════════════════════════════════════════════════════════════════════════
// krieger_auto.js — 🤖 Auto-Lauf ("Patrouille") für den Kaffee-Krieger
// ═══════════════════════════════════════════════════════════════════════════
// Stand: 2026-08-05 · Plan: plans/PLAN_krieger_autolauf.md
//
// ZWECK
//   Ab Stufe KRIEGER_AUTO_MIN_LEVEL kann der Spieler gegen CC einen automatischen
//   Erkundungs- und Kampflauf kaufen. Der Krieger sucht sich selbst den Weg zu
//   unerkundeten Feldern, wählt vor jedem Gegner das beste Loadout aus dem EIGENEN
//   BESITZ und kämpft nur, wenn er den Kampf voraussichtlich gewinnt. Zu starke
//   Gegner bleiben stehen und können später manuell angegangen werden.
//
// ARCHITEKTUR
//   • KEINE SQL-Migration. Es werden ausschließlich vorhandene RPC-Wrapper genutzt:
//     DB.spendCoins, DB.addCoins, DB.saveDungeonData, DB.dungeonFight,
//     DB.appendTodayLog, DB.updateMapData, DB.postMessage, DB.grantAchievements.
//   • Der Kampfausgang bleibt zu 100 % serverseitig (dungeon_fight). Dieses Modul
//     entscheidet nur, OB gekämpft wird — nicht, wie der Kampf ausgeht.
//   • Muss NACH krieger.js und imperium.js geladen werden (nutzt deren Globals).
//   • Vollständig additiv: wird dieses File nicht geladen, verhält sich die App
//     exakt wie vorher. Jeder Zugriff auf fremde Funktionen ist typeof-geprüft.
//
// ⚠️ ARCHITEKTUR-SYNC (wichtigster Fehlerkandidat dieses Features)
//   _kaExpDmg() / kriegerAutoWinChance() SPIEGELN die Schadensformel aus der
//   SQL-Funktion dungeon_fight(). Weicht sie ab, verliert der Auto-Lauf systematisch
//   Kämpfe, die er für sicher hielt. Bei jeder Änderung an dungeon_fight MUSS diese
//   Datei nachgezogen werden (nie umgekehrt — die SQL ist die Wahrheit).
// ═══════════════════════════════════════════════════════════════════════════

// ── Konstanten / Balancing ──────────────────────────────────────────────────
const KRIEGER_AUTO_MIN_LEVEL    = 80;    // R1 — Freischaltung
const KRIEGER_AUTO_COST_PER_LV  = 5;     // R2 — Kosten = Stufe × Faktor
const KRIEGER_AUTO_MIN_WINPCT   = 0.60;  // R7 — nur kämpfen ab dieser Siegchance
const KRIEGER_AUTO_REFUND_UNDER = 0.50;  // R9 — anteilige Erstattung unter dieser Nutzung
const KRIEGER_AUTO_STEP_DELAY   = 110;   // ms Pause je Schritt (UI bleibt bedienbar)
const KRIEGER_AUTO_WALK_DELAY   = 35;    // ms Pause je Feld beim kostenlosen Zurücklaufen
const KRIEGER_AUTO_MAX_ACTIONS  = 600;   // harte Not-Obergrenze gegen Endlosschleifen
// 🧊 Cold Brew: heilt laut Trankbeschreibung „+50 % Max-HP vor Kampfbeginn".
// Wird eingesetzt, wenn der Kampf NUR damit über die 60-%-Schwelle kommt — nie vorsorglich.
const KRIEGER_AUTO_COLDBREW_KEY  = 'coldbrew';
const KRIEGER_AUTO_COLDBREW_HEAL = 0.5;  // Anteil der Max-HP, der geheilt wird
const KRIEGER_AUTO_COLDBREW_CAP  = true; // true = Heilung wird bei Max-HP gedeckelt (⚠️ gegen SQL prüfen)
// Sicherheitsreserve: unterhalb dieser Stückzahl rührt der Auto-Lauf die Tränke nicht an
// (Spiegel von KRIEGER_POTION_KEEP — das ist JPs Burgkampf-Reserve).
const KRIEGER_AUTO_POTION_KEEP  = (typeof KRIEGER_POTION_KEEP !== 'undefined') ? KRIEGER_POTION_KEEP : 5;

function kriegerAutoCost(level) {
  return Math.max(1, (level || 1) * KRIEGER_AUTO_COST_PER_LV);
}

// Laufzeit-Flags (überleben Re-Renders innerhalb der Session, analog _kriegerSubTab)
let _kriegerAutoRunning = false;
let _kriegerAutoStop    = false;

// ── Defensive Wrapper um Funktionen aus krieger.js/imperium.js ──────────────
// Die App darf niemals abstürzen, nur weil eine dieser Funktionen in einer
// älteren/neueren Version anders heißt oder fehlt.
function _kaEsc(s) { return (typeof _esc2 === 'function') ? _esc2(String(s)) : String(s); }
function _kaToast(msg, kind) { if (typeof showToast === 'function') showToast(msg, kind || 'info'); }

// Wand-Prüfung: bevorzugt die dd-bewusste Variante (berücksichtigt gesprengte
// Wände aus dd.brokenWalls), fällt sonst auf die klassische Variante zurück.
function _kaIsWall(dd, x, y, seed) {
  if (typeof kriegerIsWallFor === 'function') return kriegerIsWallFor(dd, x, y, seed);
  if (typeof kriegerIsWall === 'function')    return kriegerIsWall(x, y, seed);
  return false;
}
function _kaLevelAtk(level) { return (typeof kriegerLevelAtkBonus === 'function') ? kriegerLevelAtkBonus(level) : 0; }
function _kaLevelDef(level) { return (typeof kriegerLevelDefBonus === 'function') ? kriegerLevelDefBonus(level) : 0; }
function _kaArmorDur(dd, key) { return (typeof kriegerArmorDur === 'function') ? kriegerArmorDur(dd, key) : 100; }
function _kaSetCulture(eq)  { return (typeof kriegerActiveSetCulture === 'function') ? kriegerActiveSetCulture(eq) : null; }
function _kaSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER — HIER ANPASSEN (Claude Code)
// ═══════════════════════════════════════════════════════════════════════════
// Diese fünf Funktionen sind die EINZIGE Stelle, an der dieses Modul auf Mechaniken
// zugreift, die ich beim Schreiben nicht einsehen konnte (persistente HP, Talentbaum,
// Level-Cap). Jede hat einen defensiven Fallback, damit nichts abstürzt — aber solange
// die Fallbacks greifen, RECHNET DER AUTO-LAUF FALSCH. Bitte gegen die Live-Version
// prüfen und bei Bedarf ersetzen.
//
// Bekannter Messwert aus JPs Screenshot (2026-08-05, Stufe 141): ❤️ 508/721.
// Die alte Formel 80 + Stufe×4 ergäbe 644 — die Differenz von 77 kommt vermutlich aus
// dem Talentbaum. Genau deshalb existiert dieser Adapter.

// Maximale Trefferpunkte inklusive aller dauerhaften Boni (Talente etc.).
function _kaMaxHp(dd) {
  if (typeof kriegerMaxHp === 'function') { const v = kriegerMaxHp(dd); if (v > 0) return v; }
  if (dd?.hpMax > 0) return dd.hpMax;
  if (dd?.maxHp > 0) return dd.maxHp;
  return 80 + (dd?.level || 1) * 4;   // ⚠️ Fallback der Ursprungsversion
}

// Aktueller HP-Stand. Kritisch: der Auto-Lauf muss mit den ECHTEN HP rechnen, nicht
// mit vollen — sonst hält er einen Kampf für sicher, den er halbtot verliert.
function _kaCurHp(dd) {
  if (typeof kriegerCurrentHp === 'function') { const v = kriegerCurrentHp(dd); if (v !== undefined && v !== null) return Math.max(0, v); }
  if (dd?.hp !== undefined && dd.hp !== null) return Math.max(0, dd.hp);
  if (dd?.hpCurrent !== undefined && dd.hpCurrent !== null) return Math.max(0, dd.hpCurrent);
  return _kaMaxHp(dd);                // ⚠️ Fallback: nimmt volle HP an
}

// Dauerhafte Talent-Boni auf die Kampfwerte. Erwartet { atk, def, crit }.
function _kaTalentBonus(dd) {
  if (typeof kriegerTalentBonus === 'function') {
    const t = kriegerTalentBonus(dd) || {};
    return { atk: t.atk || 0, def: t.def || 0, crit: t.crit || 0 };
  }
  return { atk: 0, def: 0, crit: 0 };  // ⚠️ Fallback: Talente wirken nicht auf die Schätzung
}

// Höchste erreichbare Stufe — nur für die Anzeige „Stufe X von Y" relevant.
function _kaLevelCap() {
  if (typeof KRIEGER_MAX_LEVEL !== 'undefined') return KRIEGER_MAX_LEVEL;
  return 0; // 0 = unbekannt, Anzeige lässt den Zusatz dann weg
}

// Kann der Kampf-RPC einen Trank entgegennehmen? Nur dann setzt der Auto-Lauf
// Cold Brew ein — sonst würde er auf eine Heilung wetten, die nie stattfindet.
function _kaFightSupportsPotion() {
  try { return typeof DB?.dungeonFight === 'function' && DB.dungeonFight.length >= 3; }
  catch (e) { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) Kampfabschätzung
// ═══════════════════════════════════════════════════════════════════════════

// Erwarteter Schaden pro Runde. SPIEGEL der SQL-Formel in dungeon_fight —
// bei Abweichung hier anpassen, nicht dort.
function _kaExpDmg(atk, def, crit) {
  const base = Math.max(1, (atk || 0) - (def || 0));
  const c    = Math.max(0, Math.min(100, crit || 0));
  return base * (1 + (c / 100) * 0.5); // Krit = +50 % Schaden
}

// Eigene Kampfwerte für ein HYPOTHETISCHES Loadout (nicht zwingend das ausgerüstete).
// Nur Items zählen, die auch im Besitz sind — dungeon_fight validiert das serverseitig,
// alles andere würde der Server ohnehin verwerfen.
function kriegerAutoStatsFor(dd, equipped) {
  const level = dd?.level || 1;
  let atk = _kaLevelAtk(level);
  let def = _kaLevelDef(level);
  let crit = 0;

  for (const slot of ['weapon', 'armor', 'talisman']) {
    const key = equipped ? equipped[slot] : null;
    if (!key || !(dd?.owned && dd.owned[key])) continue;
    const it = (typeof kriegerItemByKey === 'function') ? kriegerItemByKey(key) : null;
    if (!it) continue;
    atk  += it.atk  || 0;
    crit += it.crit || 0;
    // Rüstungs-DEF skaliert mit der Haltbarkeit — eine 20-%-Plattenrüstung kann
    // schlechter sein als eine volle T1-Rüstung. Genau diese Abwägung soll der
    // Optimierer treffen können.
    def  += (slot === 'armor')
      ? Math.round((it.def || 0) * _kaArmorDur(dd, key) / 100)
      : (it.def || 0);
  }

  // Dauerhafte Talent-Boni (Adapter — siehe oben)
  const tal = _kaTalentBonus(dd);
  atk += tal.atk; def += tal.def; crit += tal.crit;

  const setCulture = _kaSetCulture(equipped || {});
  if (setCulture === 'orient') crit += 10; // Wüstensturm

  // ❤️ AKTUELLE HP, nicht maximale — der Krieger geht mit dem in den Kampf,
  // was von den vorherigen Kämpfen übrig ist.
  return { atk, def, crit, hp: _kaCurHp(dd), hpMax: _kaMaxHp(dd), setCulture };
}

// Geschätzte Siegchance (0..1) gegen ein Gegner-Tier.
// Verfahren: Runden-Vergleich. rSurv = Runden, die ich überlebe; rNeed = Runden,
// die ich zum Töten brauche. Gleichstand ≈ 50 %, 20 % Vorsprung ≈ 60 %.
// withColdbrew = true rechnet die Sofort-Heilung mit ein.
function kriegerAutoWinChance(dd, equipped, tier, withColdbrew) {
  const enemy = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(tier) : null;
  if (!enemy) return { pct: 0, rNeed: 99, rSurv: 0 };

  const own   = kriegerAutoStatsFor(dd, equipped);
  const pDmg  = _kaExpDmg(own.atk, enemy.def, own.crit);
  const eDmg  = _kaExpDmg(enemy.atk, own.def, 0);

  // Set „Eisern": die ersten 2 gegnerischen Treffer −50 % → entspricht rund
  // einem zusätzlichen überlebten Treffer.
  let effHp = own.hp;
  if (withColdbrew) {
    const heal = own.hpMax * KRIEGER_AUTO_COLDBREW_HEAL;
    effHp = KRIEGER_AUTO_COLDBREW_CAP ? Math.min(own.hpMax, own.hp + heal) : own.hp + heal;
  }
  if (own.setCulture === 'mittelalter') effHp += eDmg;

  const rNeed = Math.ceil(enemy.hp / Math.max(0.01, pDmg));
  const rSurv = Math.ceil(effHp    / Math.max(0.01, eDmg));
  const raw   = 0.5 + 0.5 * (rSurv - rNeed) / Math.max(1, rNeed);
  return { pct: Math.max(0.02, Math.min(0.99, raw)), rNeed, rSurv };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) Ausrüstungs-Optimierer
// ═══════════════════════════════════════════════════════════════════════════
// Sucht das beste Loadout aus dem BESITZ gegen ein bestimmtes Gegner-Tier.
// Der 'feet'-Slot wird NIE angefasst (R5): Stiefel gehen in kriegerStepsAllowed()
// ein — ein Wechsel mitten im Lauf würde das Tagesbudget verändern.
function kriegerAutoBestLoadout(dd, tier, currentEquipped, withColdbrew) {
  if (typeof KRIEGER_ITEMS === 'undefined') return null;
  const owned = dd?.owned || {};
  const cand = slot => {
    const list = KRIEGER_ITEMS.filter(i => i.slot === slot && owned[i.key]).map(i => i.key);
    list.push(null); // "nichts tragen" ist immer eine (meist schlechte) Option
    return list;
  };
  const ws = cand('weapon'), as = cand('armor'), ts = cand('talisman');
  const cur = currentEquipped || dd?.equipped || {};

  let best = null;
  for (const w of ws) for (const a of as) for (const t of ts) {
    const eq  = { ...cur, weapon: w, armor: a, talisman: t }; // feet bleibt unberührt
    const est = kriegerAutoWinChance(dd, eq, tier, withColdbrew);
    const sameAsNow = (w === cur.weapon && a === cur.armor && t === cur.talisman);
    if (!best) { best = { equipped: eq, est, sameAsNow }; continue; }
    // Zielfunktion: höchste Siegchance → dann kürzerer Kampf → dann kein Wechsel
    if (est.pct > best.est.pct + 1e-9) { best = { equipped: eq, est, sameAsNow }; continue; }
    if (Math.abs(est.pct - best.est.pct) < 1e-9) {
      if (est.rNeed < best.est.rNeed) { best = { equipped: eq, est, sameAsNow }; continue; }
      if (est.rNeed === best.est.rNeed && sameAsNow && !best.sameAsNow) best = { equipped: eq, est, sameAsNow };
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) Wegfindung
// ═══════════════════════════════════════════════════════════════════════════
// Breitensuche über bereits ERKUNDETE Felder (dorthin läuft man kostenlos,
// siehe kriegerWalkBack) bis zu einem erkundeten Feld, das ein unerkundetes,
// begehbares Nachbarfeld hat. Dieses Nachbarfeld ist das Ziel — nur DIESER
// letzte Schritt kostet einen Tagesschritt.
//
// Das Boss-Feld wird nie als Ziel gewählt (R6): der Drachenkampf bleibt manuell.
function kriegerAutoFindTarget(dd, seed) {
  const start = (typeof kriegerPos === 'function') ? kriegerPos(dd) : { x: 0, y: 0 };
  const explored = dd?.explored || {};
  const bossX = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.x : -1;
  const bossY = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.y : -1;
  const N = (typeof KRIEGER_WORLD !== 'undefined') ? KRIEGER_WORLD : 150;

  const seen = new Set([`${start.x},${start.y}`]);
  const prev = new Map();
  const queue = [start];
  let head = 0;
  const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  while (head < queue.length) {
    const cur = queue[head++];

    // 1) Hat dieses erkundete Feld ein unerkundetes, begehbares Nachbarfeld?
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = `${nx},${ny}`;
      if (explored[k]) continue;
      if (nx === bossX && ny === bossY) continue;      // R6
      if (_kaIsWall(dd, nx, ny, seed)) continue;
      // Treffer — Pfad zurückverfolgen
      const path = [];
      let node = cur;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift(node);
        node = prev.get(`${node.x},${node.y}`);
      }
      return { path, target: { x: nx, y: ny } };
    }

    // 2) Weiter über erkundete Nachbarfelder
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !explored[k]) continue;
      seen.add(k);
      prev.set(k, cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return null; // eingemauert / alles erkundet
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) Der Lauf
// ═══════════════════════════════════════════════════════════════════════════

function _kaFollowViewport(state, COLS, ROWS, MARGIN) {
  const pos = (typeof kriegerPos === 'function') ? kriegerPos(state.dd) : null;
  if (!pos) return;
  const N = (typeof KRIEGER_WORLD !== 'undefined') ? KRIEGER_WORLD : 150;
  const pvpX = pos.x - state.vpX, pvpY = pos.y - state.vpY;
  if (pvpX < MARGIN)                 state.vpX = Math.max(0, pos.x - MARGIN);
  else if (pvpX > COLS - MARGIN - 1) state.vpX = Math.min(N - COLS, pos.x - (COLS - MARGIN - 1));
  if (pvpY < MARGIN)                 state.vpY = Math.max(0, pos.y - MARGIN);
  else if (pvpY > ROWS - MARGIN - 1) state.vpY = Math.min(N - ROWS, pos.y - (ROWS - MARGIN - 1));
}

function _kaRepaint(state, seed) {
  const canvas = document.getElementById('krieger-canvas');
  if (canvas && typeof kriegerRender === 'function') kriegerRender(canvas, state.dd, seed, state.vpX, state.vpY);
  if (typeof _kriegerUpdateHud === 'function') _kriegerUpdateHud(state);
}

// Frischestes map_data holen (currentUserData wird von anderen Flows fortgeschrieben)
function _kaMapData(member) {
  return (typeof currentUserData !== 'undefined' && currentUserData?.map_data)
    ? currentUserData.map_data
    : (member.map_data || {});
}

async function _kaLogToday(member, entries) {
  const clean = (entries || []).filter(e => e && e.amount);
  if (!clean.length) return;
  try {
    const md = DB.appendTodayLog(_kaMapData(member), clean);
    await DB.updateMapData(member.id, md);
    if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), map_data: md };
  } catch (e) { /* nicht kritisch — darf den Lauf nie blockieren */ }
}

// Hauptschleife. Wirft nie — Fehler beenden den Lauf sauber und liefern trotzdem
// ein Protokoll zurück (Regel: Ergänzungen dürfen die App nie zum Absturz bringen).
async function kriegerAutoRun(member, state, seed, COLS, ROWS, MARGIN) {
  const level  = state.dd?.level || 1;
  const cost   = kriegerAutoCost(level);
  const budget = (typeof kriegerStepsLeft === 'function') ? kriegerStepsLeft(state.dd) : 0;

  const rep = {
    cost, budget, steps: 0, walked: 0,
    fights: 0, wins: 0, losses: 0, skipped: 0,
    byTier: {}, skippedByTier: {},
    ccFight: 0, ccFind: 0, refund: 0, ep: 0,
    levelUps: [], vouchers: 0, potions: 0, coldbrews: 0,
    hpStart: 0, hpEnd: 0, hpMax: 0,
    loadouts: {}, endReason: 'budget',
  };

  // ── Vorprüfungen ─────────────────────────────────────────────────────────
  if (level < KRIEGER_AUTO_MIN_LEVEL) { _kaToast(`🔒 Auto-Lauf ab Stufe ${KRIEGER_AUTO_MIN_LEVEL}.`, 'info'); return null; }
  if (budget <= 0)                    { _kaToast('👣 Für heute sind keine Schritte mehr übrig.', 'info'); return null; }
  if (!kriegerAutoFindTarget(state.dd, seed)) {
    _kaToast('🧱 Kein erreichbares unerkundetes Feld — hier hilft nur 🔩 Bohrer oder 💣 Granate.', 'info');
    return null;
  }
  if ((state.memberCoins || 0) < cost) { _kaToast(`Du brauchst ${cost} CC für den Auto-Lauf.`, 'info'); return null; }

  // ── Gebühr abbuchen (R2) ─────────────────────────────────────────────────
  try {
    const left = await DB.spendCoins(member.id, cost);
    if (left === null || left === undefined) { _kaToast('Nicht genug CoffeeCoins.', 'error'); return null; }
    state.memberCoins = left;
    if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: left };
    if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: left });
  } catch (e) {
    _kaToast(e.message || 'Gebühr konnte nicht abgebucht werden.', 'error');
    return null;
  }
  await _kaLogToday(member, [{ label: '🤖 Auto-Lauf Gebühr', amount: -cost, detail: `Stufe ${level} × ${KRIEGER_AUTO_COST_PER_LV} CC` }]);

  // ── Startzustand sichern ─────────────────────────────────────────────────
  const loadout0 = { ...(state.dd?.equipped || {}) };   // R8
  rep.hpStart = _kaCurHp(state.dd);
  rep.hpMax   = _kaMaxHp(state.dd);
  _kriegerAutoRunning = true;
  _kriegerAutoStop    = false;

  try {
    let actions = 0;
    while (rep.steps < budget && actions < KRIEGER_AUTO_MAX_ACTIONS) {
      actions++;
      if (_kriegerAutoStop) { rep.endReason = 'stopped'; break; }

      // (a) Ziel suchen
      const route = kriegerAutoFindTarget(state.dd, seed);
      if (!route) { rep.endReason = 'blocked'; break; }

      // (b) kostenlos über erkundete Felder dorthin laufen
      for (const tile of route.path) {
        if (typeof kriegerWalkBack !== 'function') break;
        state.dd = kriegerWalkBack(tile.x, tile.y, state.dd);
        rep.walked++;
        _kaFollowViewport(state, COLS, ROWS, MARGIN);
        _kaRepaint(state, seed);
        await _kaSleep(KRIEGER_AUTO_WALK_DELAY);
      }

      // (c) Zielfeld betreten — kostet einen Tagesschritt
      const tx = route.target.x, ty = route.target.y, key = `${tx},${ty}`;
      const res = kriegerExploreTile(tx, ty, state.dd, seed);
      let dd2 = res.newDungeonData;
      const gimmick = res.gimmick, encounter = res.encounter;
      if (encounter) dd2 = { ...dd2, encounters:   { ...(dd2.encounters   || {}), [key]: encounter.tier } };
      if (gimmick)   dd2 = { ...dd2, gimmickTiles: { ...(dd2.gimmickTiles || {}), [key]: true } };
      if (gimmick?.voucher) { dd2 = { ...dd2, equipmentVoucher: gimmick.voucher }; rep.vouchers++; }
      if (gimmick?.potion)  rep.potions++;   // Bestand kommt aus newDungeonData
      if (gimmick?.cc)      rep.ccFind += gimmick.cc;
      state.dd = dd2;
      rep.steps++;

      _kaFollowViewport(state, COLS, ROWS, MARGIN);
      _kaRepaint(state, seed);
      _kriegerAutoUpdateProgress(rep, budget);

      // (d) Kampfentscheidung (R7)
      if (encounter && encounter.tier !== 'boss') {
        const tier = encounter.tier;
        // Kein Cache: die HP sinken mit jedem Kampf, also muss die Chance jedes Mal
        // neu gerechnet werden (~4.000 Kombinationen, wenige Millisekunden).
        let best = kriegerAutoBestLoadout(state.dd, tier, state.dd.equipped, false);
        let potionKey = null;

        // 🧊 Cold Brew nur, wenn der Kampf ohne ihn NICHT reicht und mit ihm schon —
        // nie vorsorglich, und nie unter die Reserve von KRIEGER_AUTO_POTION_KEEP.
        if ((!best || best.est.pct < KRIEGER_AUTO_MIN_WINPCT) && _kaFightSupportsPotion()) {
          const stock = (typeof kriegerPotionCount === 'function')
            ? kriegerPotionCount(state.dd, KRIEGER_AUTO_COLDBREW_KEY) : 0;
          if (stock > KRIEGER_AUTO_POTION_KEEP) {
            const withCb = kriegerAutoBestLoadout(state.dd, tier, state.dd.equipped, true);
            if (withCb && withCb.est.pct >= KRIEGER_AUTO_MIN_WINPCT) {
              best = withCb;
              potionKey = KRIEGER_AUTO_COLDBREW_KEY;
            }
          }
        }

        if (!best || best.est.pct < KRIEGER_AUTO_MIN_WINPCT) {
          rep.skipped++;
          rep.skippedByTier[tier] = (rep.skippedByTier[tier] || 0) + 1;
          await _kaSleep(KRIEGER_AUTO_STEP_DELAY);
          continue; // Encounter bleibt stehen — später manuell angreifbar
        }

        // Loadout setzen (falls nötig) und dd speichern.
        // ⚠️ PFLICHT: dungeon_fight liefert new_dungeon_data zurück und überschreibt
        // damit den lokalen Stand. Ohne dieses Speichern gingen alle seit dem letzten
        // Kampf erkundeten Felder verloren.
        state.dd = { ...state.dd, equipped: { ...state.dd.equipped, ...best.equipped } };
        try { await DB.saveDungeonData(member.id, state.dd); }
        catch (e) { rep.endReason = 'error'; break; }

        let result;
        try {
          result = potionKey
            ? await DB.dungeonFight(member.id, tier, potionKey)
            : await DB.dungeonFight(member.id, tier);
        }
        catch (e) { rep.endReason = 'error'; break; }
        if (!result || result.error) { rep.endReason = 'error'; break; }

        if (potionKey) rep.coldbrews++;
        rep.fights++;
        rep.byTier[tier] = (rep.byTier[tier] || 0) + 1;
        rep.ep += result.ep_awarded || 0;
        const enemyDef = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(tier) : null;
        rep.loadouts[tier] = best.equipped;

        state.dd = result.new_dungeon_data || { ...state.dd, level: result.new_level };
        // R3: Der +5-Schritte-Bonus pro Sieg wird im Auto-Lauf NICHT angewendet.
        // (Manuelles Spiel bleibt unverändert — siehe _runKriegerFight in imperium.js.)

        if (result.cc_awarded > 0) {
          rep.ccFight += result.cc_awarded;
          state.memberCoins += result.cc_awarded;
          if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
          if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
        }
        if (result.leveled_up) rep.levelUps.push(result.new_level);

        if (result.won) {
          rep.wins++;
          // Gewonnenes Encounter-Feld entfernen (sonst unbegrenzt farmbar) —
          // identisch zur Logik in _runKriegerFight.
          if (state.dd.encounters?.[key]) {
            const { [key]: _drop, ...rest } = state.dd.encounters;
            state.dd = { ...state.dd, encounters: rest };
          }
        } else {
          rep.losses++;
          // R11: Niederlage OHNE Rüstung verbrennt die Tagesschritte → Lauf endet.
          const armorKey = state.dd.equipped?.armor;
          if (!(armorKey && state.dd.owned?.[armorKey])) {
            rep.endReason = 'noarmor';
            state.dd = {
              ...state.dd,
              steps_today: (typeof kriegerStepsAllowed === 'function') ? kriegerStepsAllowed(state.dd.level || 1, state.dd) : 999,
              steps_date: (typeof _kriegerTodayKey === 'function') ? _kriegerTodayKey() : new Date().toLocaleDateString('de-DE'),
            };
            break;
          }
        }

        _kaRepaint(state, seed);
        _kriegerAutoUpdateProgress(rep, budget);
      }

      await _kaSleep(KRIEGER_AUTO_STEP_DELAY);
    }
    if (actions >= KRIEGER_AUTO_MAX_ACTIONS && rep.endReason === 'budget') rep.endReason = 'safety';
  } catch (e) {
    console.warn('Auto-Lauf abgebrochen:', e);
    rep.endReason = 'error';
  }

  // ── Abschluss (läuft IMMER, auch nach Fehlern) ───────────────────────────
  _kriegerAutoRunning = false;
  _kriegerAutoStop    = false;

  rep.hpEnd = _kaCurHp(state.dd);

  // R8: Ausgangs-Loadout wiederherstellen
  state.dd = { ...state.dd, equipped: { ...(state.dd.equipped || {}), ...loadout0 } };

  // Statistik-Zähler (rein additiv; fehlt das Objekt, gilt alles als 0)
  const st = state.dd.autoStats || {};
  state.dd = { ...state.dd, autoStats: {
    runs:    (st.runs    || 0) + 1,
    steps:   (st.steps   || 0) + rep.steps,
    fights:  (st.fights  || 0) + rep.fights,
    wins:    (st.wins    || 0) + rep.wins,
    losses:  (st.losses  || 0) + rep.losses,
    skipped: (st.skipped || 0) + rep.skipped,
    ccGross: (st.ccGross || 0) + rep.ccFight + rep.ccFind,
    ccFees:  (st.ccFees  || 0) + rep.cost,
  }};

  try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { /* siehe unten */ }
  if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), dungeon_data: state.dd };

  // Fund-CC gesammelt gutschreiben (statt eines RPC pro Feld)
  if (rep.ccFind > 0) {
    try {
      await DB.addCoins(member.id, rep.ccFind);
      state.memberCoins += rep.ccFind;
      if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
      if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
    } catch (e) { rep.ccFind = 0; }
  }

  // R9: anteilige Erstattung, wenn der Lauf mangels erreichbarer Felder früh endete
  if (rep.endReason === 'blocked' && rep.steps < budget * KRIEGER_AUTO_REFUND_UNDER) {
    const unused = Math.max(0, budget - rep.steps);
    rep.refund = Math.floor(cost * (unused / Math.max(1, budget)));
    if (rep.refund > 0) {
      try {
        await DB.addCoins(member.id, rep.refund);
        state.memberCoins += rep.refund;
        if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
        if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
      } catch (e) { rep.refund = 0; }
    }
  }

  // Tages-Log / Profil (Regel 4: alle Einnahmen und Ausgaben des Tages)
  await _kaLogToday(member, [
    { label: '⚔️ Auto-Lauf Kampfgewinne', amount: rep.ccFight, detail: `${rep.wins} Siege / ${rep.fights} Kämpfe` },
    { label: '🪙 Auto-Lauf Dungeon-Funde', amount: rep.ccFind,  detail: `${rep.steps} Felder erkundet` },
    { label: '🤖 Auto-Lauf Erstattung',    amount: rep.refund,  detail: 'kein erreichbares Feld mehr' },
  ]);

  _kaRepaint(state, seed);
  await _kriegerAutoFinish(member, state, rep);
  return rep;
}

// Chat (genau EINE Zusammenfassung) + Achievements
async function _kriegerAutoFinish(member, state, rep) {
  const net = rep.ccFight + rep.ccFind + rep.refund - rep.cost;
  try {
    await DB.postMessage(
      `🤖 ${_kaEsc(member.name)} schickte den Krieger auf Patrouille: ${rep.steps} Felder, ` +
      `${rep.wins} Siege, ${rep.losses} Niederlagen, ${net >= 0 ? '+' : ''}${net} 🫘 netto.`,
      member.name
    );
    for (const lv of rep.levelUps) {
      await DB.postMessage(`🎉 ${_kaEsc(member.name)} hat Krieger-Stufe ${lv} erreicht!`, member.name);
    }
  } catch (e) { /* nicht kritisch */ }

  try {
    const dd = state.dd;
    const existing = (typeof currentUserData !== 'undefined' && currentUserData?.achievements) || {};
    const st = dd.autoStats || {};
    const toGrant = {};
    if (!existing.krieger_auto_first  && (st.runs || 0) >= 1)  toGrant.krieger_auto_first  = true;
    if (!existing.krieger_auto_ten    && (st.runs || 0) >= 10) toGrant.krieger_auto_ten    = true;
    if (!existing.krieger_auto_flawless && rep.fights >= 10 && rep.losses === 0) toGrant.krieger_auto_flawless = true;
    if (!existing.krieger_level_100   && (dd.level || 1) >= 100) toGrant.krieger_level_100 = true;
    if (Object.keys(toGrant).length) {
      await DB.grantAchievements(member.id, toGrant);
      if (typeof currentUserData !== 'undefined') {
        currentUserData = { ...(currentUserData || {}), achievements: { ...existing, ...toGrant } };
      }
      for (const id of Object.keys(toGrant)) {
        const ach = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).find(a => a.id === id);
        if (ach) _kaToast(`🏆 Achievement: ${ach.name}!`, 'success');
      }
    }
  } catch (e) { /* nicht kritisch */ }

  _kriegerAutoShowReport(rep, state);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) Oberfläche
// ═══════════════════════════════════════════════════════════════════════════

// Wird am Ende von _kriegerRenderDungeon() aufgerufen (einzige Änderung an imperium.js).
function kriegerAutoMountControls(member, state, seed, COLS, ROWS, MARGIN, body) {
  if (!body) return;
  document.getElementById('krieger-auto-wrap')?.remove();

  const level = state.dd?.level || 1;
  const cost  = kriegerAutoCost(level);
  const left  = (typeof kriegerStepsLeft === 'function') ? kriegerStepsLeft(state.dd) : 0;
  const locked = level < KRIEGER_AUTO_MIN_LEVEL;

  const wrap = document.createElement('div');
  wrap.id = 'krieger-auto-wrap';
  wrap.style.cssText = 'margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px';

  if (locked) {
    wrap.innerHTML = `
      <div style="font-weight:700;opacity:.55">🔒 Auto-Lauf</div>
      <div style="font-size:11px;opacity:.55;margin-top:3px">
        Freigeschaltet ab Krieger-Stufe ${KRIEGER_AUTO_MIN_LEVEL} (aktuell ${level}).
      </div>`;
  } else if (_kriegerAutoRunning) {
    wrap.innerHTML = `
      <div style="font-weight:700">🤖 Patrouille läuft …</div>
      <div id="krieger-auto-progress" style="font-size:12px;margin-top:4px">👣 0/${left}</div>
      <button class="cc-karte-popup-close" id="krieger-auto-stop" style="width:100%;margin-top:8px">⏹ Lauf stoppen</button>`;
  } else {
    wrap.innerHTML = `
      <div style="font-weight:700">🤖 Auto-Lauf</div>
      <div style="font-size:11px;opacity:.7;margin-top:3px;line-height:1.4">
        Der Krieger erkundet allein, wählt seine Ausrüstung selbst und kämpft nur,
        wenn er gewinnen kann. Zu starke Gegner bleiben für dich stehen.
      </div>
      <button class="cc-build-btn" id="krieger-auto-go" style="width:100%;margin-top:8px"
        ${left <= 0 ? 'disabled' : ''}>
        ${left <= 0 ? '👣 Heute keine Schritte mehr' : `🤖 Starten — ${left} Schritte · ${cost} 🫘`}
      </button>`;
  }
  body.appendChild(wrap);

  document.getElementById('krieger-auto-stop')?.addEventListener('click', () => {
    _kriegerAutoStop = true;
    _kaToast('⏹ Lauf wird beendet …', 'info');
  });
  document.getElementById('krieger-auto-go')?.addEventListener('click', () => {
    _kriegerAutoConfirm(member, state, seed, COLS, ROWS, MARGIN);
  });
}

function _kriegerAutoUpdateProgress(rep, budget) {
  const el = document.getElementById('krieger-auto-progress');
  if (el) el.textContent = `👣 ${rep.steps}/${budget} · ⚔️ ${rep.wins} Siege · 🚫 ${rep.skipped} gemieden`;
}

function _kriegerAutoConfirm(member, state, seed, COLS, ROWS, MARGIN) {
  const popup = document.getElementById('krieger-popup');
  if (!popup) return;
  const level = state.dd?.level || 1;
  const cost  = kriegerAutoCost(level);
  const left  = (typeof kriegerStepsLeft === 'function') ? kriegerStepsLeft(state.dd) : 0;

  // Vorschau: welches Tier wäre mit dem aktuellen Besitz schaffbar?
  const preview = ['t1','t2','t3','t4'].map(t => {
    const b = kriegerAutoBestLoadout(state.dd, t, state.dd.equipped);
    const ok = b && b.est.pct >= KRIEGER_AUTO_MIN_WINPCT;
    const def = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(t) : null;
    return `<div style="display:flex;justify-content:space-between;font-size:11px">
      <span>${ok ? '⚔️' : '🚫'} ${_kaEsc(def?.name || t)}</span>
      <span style="opacity:.7">${b ? Math.round(b.est.pct * 100) : 0} %</span></div>`;
  }).join('');

  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="krieger-fight-overlay">
      <div class="cc-karte-popup-inner" style="max-width:360px;width:100%">
        <div class="cc-karte-popup-hdr">🤖 Auto-Lauf starten?</div>
        <div class="cc-karte-popup-body" style="flex-direction:column;align-items:stretch;gap:8px">
          <div style="font-size:12px">Der Krieger verbraucht <strong>alle ${left} Schritte</strong> von heute.</div>
          <div style="font-size:12px">Kosten: <strong>${cost} 🫘</strong> (Stufe ${level} × ${KRIEGER_AUTO_COST_PER_LV})</div>
          <div style="font-size:12px">Zustand: <strong>❤️ ${_kaCurHp(state.dd)}/${_kaMaxHp(state.dd)}</strong>${_kaFightSupportsPotion() ? ` · 🧊 ${(typeof kriegerPotionCount === 'function' ? kriegerPotionCount(state.dd, KRIEGER_AUTO_COLDBREW_KEY) : 0)} Cold Brew` : ''}</div>
          <div style="margin-top:4px;font-size:11px;opacity:.7">Geschätzte Siegchance je Gegnerart:</div>
          ${preview}
          <div style="font-size:11px;opacity:.6;margin-top:4px">
            Es wird nur gekämpft ab ${Math.round(KRIEGER_AUTO_MIN_WINPCT * 100)} % Siegchance.
            🧊 Cold Brew wird nur eingesetzt, wenn ein Kampf sonst zu knapp wäre — und nie
            unter ${KRIEGER_AUTO_POTION_KEEP} Stück Reserve.
            Der Drache bleibt unangetastet. Im Auto-Lauf gibt es keine Schritte für Siege zurück.
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="cc-build-btn" id="krieger-auto-confirm" style="flex:1">🤖 Los!</button>
          <button class="cc-karte-popup-close" id="krieger-auto-cancel" style="flex:1">Abbrechen</button>
        </div>
      </div>
    </div>`;

  document.getElementById('krieger-auto-cancel').onclick = () => popup.classList.add('hidden');
  document.getElementById('krieger-auto-confirm').onclick = async () => {
    popup.classList.add('hidden');
    _kriegerAutoRunning = true;
    if (typeof _kriegerRenderSubTab === 'function') _kriegerRenderSubTab(member, state, seed, COLS, ROWS, MARGIN);
    await kriegerAutoRun(member, state, seed, COLS, ROWS, MARGIN);
    if (typeof _kriegerRenderSubTab === 'function') _kriegerRenderSubTab(member, state, seed, COLS, ROWS, MARGIN);
  };
}

function _kriegerAutoShowReport(rep, state) {
  const popup = document.getElementById('krieger-popup');
  if (!popup) return;
  const net = rep.ccFight + rep.ccFind + rep.refund - rep.cost;
  const tierLine = Object.keys(rep.byTier).map(t => {
    const d = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(t) : null;
    return `${_kaEsc(d?.name || t)}: ${rep.byTier[t]}`;
  }).join(' · ') || '—';
  const endMsg = {
    budget:  'Alle Tagesschritte verbraucht.',
    stopped: 'Vom Spieler gestoppt.',
    blocked: 'Kein erreichbares unerkundetes Feld mehr — Bohrer oder Granate helfen weiter.',
    noarmor: 'Niederlage ohne Rüstung — die Tagesschritte sind aufgebraucht.',
    error:   'Vorzeitig beendet (Verbindungsproblem). Alles bis hierher wurde gespeichert.',
    safety:  'Sicherheitsgrenze erreicht.',
  }[rep.endReason] || '';

  const row = (l, v) => `<div style="display:flex;justify-content:space-between;font-size:12px"><span style="opacity:.75">${l}</span><span>${v}</span></div>`;

  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="krieger-fight-overlay">
      <div class="cc-karte-popup-inner" style="max-width:360px;width:100%">
        <div class="cc-karte-popup-hdr">🤖 Lauf-Protokoll</div>
        <div class="cc-karte-popup-body" style="flex-direction:column;align-items:stretch;gap:5px">
          ${row('Schritte / Felder', `${rep.steps} von ${rep.budget}`)}
          ${row('Kämpfe', `🏆 ${rep.wins} · 💀 ${rep.losses} · 🚫 ${rep.skipped} gemieden`)}
          ${row('Gegner', tierLine)}
          ${row('Kampfgewinne', `+${rep.ccFight} 🫘`)}
          ${row('Funde', `+${rep.ccFind} 🫘${rep.vouchers ? ` · 🎁 ${rep.vouchers}` : ''}${rep.potions ? ` · 🧪 ${rep.potions}` : ''}`)}
          ${row('Gebühr', `−${rep.cost} 🫘`)}
          ${rep.refund ? row('Erstattung', `+${rep.refund} 🫘`) : ''}
          <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid rgba(255,255,255,.12);padding-top:5px;margin-top:3px">
            <span>Netto</span><span>${net >= 0 ? '+' : ''}${net} 🫘</span>
          </div>
          ${row('Erfahrung', `+${rep.ep} EP`)}
          ${row('Trefferpunkte', `❤️ ${rep.hpStart} → ${rep.hpEnd}${rep.hpMax ? ` / ${rep.hpMax}` : ''}`)}
          ${rep.coldbrews ? row('Cold Brew', `🧊 ${rep.coldbrews} eingesetzt`) : ''}
          ${rep.levelUps.length ? `<div class="krieger-levelup">🎉 Stufe ${rep.levelUps[rep.levelUps.length - 1]} erreicht!</div>` : ''}
          ${endMsg ? `<div style="font-size:11px;opacity:.6;margin-top:5px">${_kaEsc(endMsg)}</div>` : ''}
          ${rep.skipped ? `<div style="font-size:11px;opacity:.6">Gemiedene Gegner bleiben stehen — du kannst sie jederzeit selbst angehen.</div>` : ''}
        </div>
        <button class="cc-karte-popup-close" id="krieger-auto-report-close" style="width:100%;margin-top:10px">Schließen</button>
      </div>
    </div>`;
  document.getElementById('krieger-auto-report-close').onclick = () => popup.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6) Selbstmontage — kein Patch an imperium.js nötig
// ═══════════════════════════════════════════════════════════════════════════
// JP 2026-08-05: „Ich patche imperium.js hier jetzt nicht." Also hängt sich das Modul
// selbst ein. Zwei Wege, in dieser Reihenfolge:
//
//   WEG A (bevorzugt): _kriegerRenderDungeon umschließen. Die Funktion ist in
//   imperium.js als klassische `function`-Deklaration im Skript-Scope definiert und
//   liegt damit als Eigenschaft auf window — sie lässt sich ersetzen, und alle
//   späteren Aufrufe aus imperium.js laufen durch die neue Version. Vorteil: wir
//   bekommen das ECHTE state-Objekt des Tabs, inklusive korrektem Viewport.
//
//   WEG B (Notnagel): Ein MutationObserver wartet auf das Auftauchen von
//   #krieger-canvas und baut sich seinen eigenen Zustand aus currentUserData
//   zusammen. Greift nur, wenn Weg A nicht funktioniert (etwa weil die Funktion
//   in einer künftigen Version in ein Modul oder eine IIFE wandert).
//
// Beide Wege sind in try/catch gekapselt: schlägt die Montage fehl, bleibt die App
// exakt so, wie sie ohne diese Datei wäre.

let _kriegerAutoHookInstalled = false;

(function _kriegerAutoInstallHook() {
  try {
    const g = (typeof window !== 'undefined') ? window : null;
    if (!g || typeof g._kriegerRenderDungeon !== 'function') return;

    const _orig = g._kriegerRenderDungeon;
    if (_orig.__kaWrapped) { _kriegerAutoHookInstalled = true; return; }

    const wrapped = function (member, state, seed, COLS, ROWS, MARGIN, body) {
      const out = _orig.apply(this, arguments);
      try { kriegerAutoMountControls(member, state, seed, COLS, ROWS, MARGIN, body); }
      catch (e) { console.warn('Auto-Lauf-Panel konnte nicht eingehängt werden:', e); }
      return out;
    };
    wrapped.__kaWrapped = true;
    g._kriegerRenderDungeon = wrapped;
    _kriegerAutoHookInstalled = true;
  } catch (e) {
    console.warn('Auto-Lauf: Hook auf _kriegerRenderDungeon nicht möglich:', e);
  }
})();

// ── Weg B: Beobachter als Notnagel ──────────────────────────────────────────
// Baut Member/State/Seed aus currentUserData nach. Das state-Objekt ist dann NICHT
// dasselbe, das imperium.js nutzt — für den Lauf selbst ist das egal (wir speichern
// über DB und rendern das Canvas selbst), und beim nächsten Tab-Wechsel liest
// _buildKrieger ohnehin frisch aus currentUserData.
function _kriegerAutoBuildStandaloneState(canvas) {
  const member = (typeof currentUserData !== 'undefined' && currentUserData) ? currentUserData : null;
  if (!member || !member.id) return null;
  const dd = member.dungeon_data || {};
  const tile = (typeof KRIEGER_TILE !== 'undefined') ? KRIEGER_TILE : 20;
  const N    = (typeof KRIEGER_WORLD !== 'undefined') ? KRIEGER_WORLD : 150;
  const COLS = Math.floor((canvas?.width  || 320) / tile);
  const ROWS = Math.floor((canvas?.height || 280) / tile);
  const pos  = (typeof kriegerPos === 'function') ? kriegerPos(dd) : { x: 75, y: 75 };
  const state = {
    dd,
    memberCoins: member.coins || 0,
    vpX: Math.max(0, Math.min(N - COLS, pos.x - Math.floor(COLS / 2))),
    vpY: Math.max(0, Math.min(N - ROWS, pos.y - Math.floor(ROWS / 2))),
  };
  const seed = (typeof _kriegerWorldSeed === 'function') ? _kriegerWorldSeed() : 1;
  return { member, state, seed, COLS, ROWS, MARGIN: 4 };
}

(function _kriegerAutoInstallObserver() {
  if (_kriegerAutoHookInstalled) return;      // Weg A hat geklappt
  if (typeof document === 'undefined') return;

  let pending = false;
  const tryMount = () => {
    pending = false;
    try {
      const canvas = document.getElementById('krieger-canvas');
      if (!canvas) return;
      if (document.getElementById('krieger-auto-wrap')) return;   // schon da
      const body = document.getElementById('krieger-body') || canvas.parentElement;
      if (!body) return;
      const ctx = _kriegerAutoBuildStandaloneState(canvas);
      if (!ctx) return;
      kriegerAutoMountControls(ctx.member, ctx.state, ctx.seed, ctx.COLS, ctx.ROWS, ctx.MARGIN, body);
    } catch (e) { console.warn('Auto-Lauf: Selbstmontage fehlgeschlagen:', e); }
  };
  const schedule = () => { if (!pending) { pending = true; setTimeout(tryMount, 60); } };

  try {
    new MutationObserver(schedule).observe(document.body || document.documentElement, {
      childList: true, subtree: true,
    });
    schedule(); // falls der Tab beim Laden schon offen ist
  } catch (e) { console.warn('Auto-Lauf: Beobachter konnte nicht starten:', e); }
})();
