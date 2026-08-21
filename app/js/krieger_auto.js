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
//   _kaPlayerDmg() / _kaEnemyDmg() / _kaMaxRounds() / kriegerAutoWinChance() SPIEGELN die
//   Schadensformel aus der SQL-Funktion dungeon_fight(). Weicht sie ab, verliert der
//   Auto-Lauf systematisch Kämpfe, die er für sicher hielt. Bei jeder Änderung an
//   dungeon_fight MUSS diese Datei nachgezogen werden (nie umgekehrt — die SQL ist die
//   Wahrheit). Prüfstand: plans/tests/test_krieger_auto.js.
//   Stand des Abgleichs: migration_2026-07-30_krieger_levelcap.sql (2026-08-17).
// ═══════════════════════════════════════════════════════════════════════════

// ── Konstanten / Balancing ──────────────────────────────────────────────────
// R1 — Freischaltung. 2026-08-06 von 80 auf 20 gesenkt (JP): Stufe 80 war am
// Boss-Gate ausgerichtet, aber der Auto-Lauf ist kein Endgame-Inhalt, sondern nimmt
// Fleißarbeit ab — und die beginnt viel früher. Ab Stufe 20 gibt es rund 40 Schritte
// am Tag und genug erkundete Felder, dass sich ein Lauf lohnt.
// Nebenwirkung, bewusst in Kauf genommen: Die Kosten (5 × Stufe) betragen auf Stufe 20
// nur 100 CC. Das ist günstig, aber die Erträge auf diesem Niveau sind ebenfalls klein.
const KRIEGER_AUTO_MIN_LEVEL    = 20;
const KRIEGER_AUTO_COST_PER_LV  = 5;     // R2 — Kosten = Stufe × Faktor
const KRIEGER_AUTO_MIN_WINPCT   = 0.60;  // R7 — nur kämpfen ab dieser Siegchance
// Selbstkorrektur: Jede Niederlage ist der Beweis, dass die Schätzung zu optimistisch war
// (falsche Schadensformel, unbekannte HP, fehlende Talente). Statt weiter blind zu vertrauen,
// steigt die Schwelle nach jeder Niederlage — nach der dritten wird gar nicht mehr gekämpft
// und nur noch erkundet. Das wirkt UNABHÄNGIG davon, ob der Adapter korrekt ausgefüllt ist.
const KRIEGER_AUTO_LOSS_PENALTY = 0.10;  // +10 Prozentpunkte je Niederlage
const KRIEGER_AUTO_MAX_LOSSES   = 3;     // danach: nur noch erkunden
// ── Abwechslung zwischen Altlasten und Erkundung (2026-08-05) ──────────────
// Phase 1 hatte absoluten Vorrang. Auf einer weit erkundeten Karte liegen aber
// hunderte alte Gegnerfelder — der Lauf hätte sie erst alle abgearbeitet und wäre
// nie zum Erkunden gekommen. Für den Spieler sah das aus wie Stillstand: die Figur
// bewegte sich kaum, der Schrittzähler blieb auf 0, und ein besiegtes Feld behält
// sein ⚔️-Symbol (es wird nur blasser). Deshalb jetzt: immer abwechselnd.
// Umweg zu einem alten Gegner. Solange noch Schritte übrig sind, bleibt er kurz —
// Erkundung hat dann Vorrang und lange Anmärsche würden nur Zeit fressen. Sind die
// Tagesschritte aufgebraucht, kostet Laufen nichts mehr außer Zeit: dann darf der
// Krieger weit ausholen, denn Aufräumen ist alles, was noch geht (JP 2026-08-05:
// „er soll enden, wenn er keine Gegner mehr findet, nicht wenn die Schritte vorbei sind").
// ⚠️ 27y — JP 2026-08-21: „Es werden die Felder eher gesucht, als gekämpft, obwohl
// kampffähig … ich würde gerne alle offenen Kämpfe absuchen, wenn keine auffindbar
// Karte ergründen."
// Damit ist die Abwechslung vom 2026-08-05 (nach jedem Altlasten-Kampf zwingend ein
// Erkundungsschritt, und dabei nur 20 Felder Umkreis) wieder AUFGEHOBEN. Ihr Anlass war
// ein anderer Fehler: ein besiegtes Feld behielt seinen Encounter-Eintrag, der Krieger
// fand es sofort wieder und drehte sich im Kreis. Das ist seit demselben Tag behoben
// (der Eintrag wird nach einem Sieg gelöscht) — die Abwechslung hat seither nur noch
// erreichbare Kämpfe liegen lassen.
//   ⚠️ ÜBERTRAGBARE LEHRE: Eine Notmassnahme gegen ein Symptom überlebt die Behebung
//   der Ursache und wirkt dann als reine Bremse. Wer ein Symptom dämpft, muss den
//   Dämpfer beim Beheben der Ursache mit aufräumen.
const KRIEGER_AUTO_MAX_DETOUR      = 70;   // einheitlich — vorher 20, solange Schritte übrig
const KRIEGER_AUTO_MAX_DETOUR_LATE = 70;   // gleicher Wert, Name bleibt für die Rückfallsuche
const KRIEGER_AUTO_MAX_REVISITS    = 400;  // Obergrenze alter Felder pro Lauf (Sicherung)
// 🛌 AUTO-HEILUNG (JP 2026-08-21: „Es sollte eh neben cold brew automatik auch HP
// auffüllen automatik geben.")
// BEFUND, der das dringend macht: Der Chip-Schaden beträgt 2 % der Max-HP JE RUNDE —
// auf Stufe 171 sind das ~18 HP pro Runde, auch gegen den schwächsten Gegner. Nach
// zwei Dutzend Kämpfen ist der Krieger unten, `rSurv` fällt, und ab da meidet der Lauf
// ALLES. Genau das ist JPs „sehr viele Gegner weggelassen, die eigentlich überhaupt
// kein Problem darstellen". Ohne Heilung ist ein langer Lauf nicht möglich.
const KRIEGER_AUTO_HEAL_AT     = 0.45;  // unter 45 % Max-HP wird aufgefüllt
const KRIEGER_AUTO_HEAL_MAX    = 6;     // höchstens so viele Erholungen je Lauf
const KRIEGER_AUTO_HEAL_KEEP_CC = 150;  // dieser CC-Rest bleibt immer stehen
const KRIEGER_AUTO_REFUND_UNDER = 0.50;  // R9 — anteilige Erstattung unter dieser Nutzung
const KRIEGER_AUTO_STEP_DELAY   = 110;   // ms Pause je Schritt (UI bleibt bedienbar)
const KRIEGER_AUTO_WALK_DELAY   = 35;    // ms Pause je Feld beim kostenlosen Zurücklaufen
const KRIEGER_AUTO_MAX_ACTIONS  = 2500;  // harte Not-Obergrenze gegen Endlosschleifen
// 🧊 Cold Brew: heilt laut Trankbeschreibung „+50 % Max-HP vor Kampfbeginn".
// Wird eingesetzt, wenn der Kampf NUR damit über die 60-%-Schwelle kommt — nie vorsorglich.
const KRIEGER_AUTO_COLDBREW_KEY  = 'coldbrew';
const KRIEGER_AUTO_COLDBREW_HEAL = 0.5;  // Anteil der Max-HP, der geheilt wird
const KRIEGER_AUTO_COLDBREW_CAP  = true; // true = Heilung wird bei Max-HP gedeckelt (⚠️ gegen SQL prüfen)
// Sicherheitsreserve: unterhalb dieser Stückzahl rührt der Auto-Lauf die Tränke nicht an
// (Spiegel von KRIEGER_POTION_KEEP — das ist JPs Burgkampf-Reserve).
const KRIEGER_AUTO_POTION_KEEP  = (typeof KRIEGER_POTION_KEEP !== 'undefined') ? KRIEGER_POTION_KEEP : 5;

// Preis der 🛌 Vollen Erholung — Spiegel von KRIEGER_FULL_HEAL_COST aus krieger.js.
// ⚠️ typeof-Prüfung mit dem RICHTIGEN Namen (die Adapter-Lehre von 2026-08-17: ein
// falsch geratener Name wird von `typeof` in einen stillen Rückfall verwandelt).
const KRIEGER_AUTO_HEAL_COST = (typeof KRIEGER_FULL_HEAL_COST !== 'undefined')
  ? KRIEGER_FULL_HEAL_COST : 60;

function kriegerAutoCost(level) {
  return Math.max(1, (level || 1) * KRIEGER_AUTO_COST_PER_LV);
}

// 🛌 Wird die Auto-Heilung für den nächsten Lauf verwendet? Im Start-Dialog umschaltbar,
// überlebt (wie _kriegerSubTab) Re-Renders innerhalb der Sitzung.
let _kriegerAutoHeal = true;

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
// ADAPTER — ✅ AUSGEFÜLLT 2026-08-17 (gegen js/krieger.js + die Live-SQL)
// ═══════════════════════════════════════════════════════════════════════════
// Diese Funktionen sind die EINZIGE Stelle, an der dieses Modul auf Mechaniken zugreift,
// die beim Schreiben nicht einsehbar waren (persistente HP, Talentbaum, Level-Deckel).
//
// ⚠️ BEFUND: ALLE FÜNF Vorgaben trafen daneben — nicht weil die Mechanik fehlte, sondern
// weil sie ANDERS HEISST. Jede Prüfung `typeof kriegerMaxHp === 'function'` war schlicht
// false, und das Modul ist stillschweigend in seine Notnagel-Zweige gefallen:
//
//   geraten                  tatsächlich in krieger.js
//   ─────────────────────────────────────────────────────────────────────────
//   kriegerMaxHp(dd)      →  kriegerHpMax(dd)          (Zeile 893)
//   kriegerCurrentHp(dd)  →  kriegerHp(dd)             (Zeile 898)
//   kriegerTalentBonus()  →  kriegerTalentStatBonus()  (Zeile 910) — ANDERE FORM!
//   KRIEGER_MAX_LEVEL     →  KRIEGER_LEVEL_MAX         (Zeile 1571, Wert 999)
//   _kaFightSupportsPotion→  entfällt, Signatur bestätigt (siehe unten)
//
// ⚠️ ÜBERTRAGBARE LEHRE: Ein `typeof x === 'function'`-Fallback macht einen falschen
// NAMEN unsichtbar. Er schützt vor dem Absturz und verbirgt dabei genau den Fehler, den
// ein Absturz sofort gezeigt hätte. Wer so einen Adapter baut, muss den Namen gegen die
// Quelle prüfen — nicht gegen die eigene Erinnerung.
//
// ✅ ABNAHMETEST BESTANDEN (Handover §8): JPs Screenshot vom 2026-08-05 zeigt bei
// Stufe 141 ❤️ 508/721. `kriegerHpMax` rechnet 80 + 141×4 = 644, und mit den Talenten
// „Vollmundig" (+8 % Max-HP) UND „Meisterröster" (alle Talente ×1,5) wird daraus
// 644 × (1 + 0,08 × 1,5) = 644 × 1,12 = 721,3 → **721**. Exakt der Screenshot-Wert; die
// im Handover gesuchten „fehlenden 77" sind genau diese beiden Talente.

// ── HP-Erkennung ────────────────────────────────────────────────────────────
// Mehrstufig, weil die Feldnamen von außen nicht bekannt sind. Reihenfolge:
//   1. bekannte Funktionsnamen aus krieger.js
//   2. numerische Felder in dungeon_data, die nach HP aussehen
//   3. Auslesen aus der Oberfläche („❤️ 508/721" in der Erholungs-Leiste)
//   4. Notformel — und dann bewusst PESSIMISTISCH, siehe unten
let _kaHpUnknown = false;
// ❤️ Direkt aus dem Kampfergebnis (result.hp / result.hp_max). Das ist die verlässlichste
// Quelle überhaupt — der Server sagt selbst, wie viel Leben übrig ist. Wird bei jedem
// Laufstart zurückgesetzt.
let _kaHpLive = { cur: null, max: null };

function _kaHpFromDom() {
  try {
    const scope = document.getElementById('imp-content') || document.body;
    const m = (scope?.textContent || '').match(/❤️[^\d]{0,4}(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    const cur = parseInt(m[1], 10), max = parseInt(m[2], 10);
    if (!(max > 0) || cur < 0 || cur > max) return null;
    return { cur, max };
  } catch (e) { return null; }
}

function _kaHpFromDd(dd) {
  if (!dd) return null;
  const num = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
  const maxK = ['hpMax','maxHp','hp_max','max_hp','healthMax','lebenMax'].find(k => num(dd[k]));
  const curK = ['hp','hpCurrent','currentHp','hp_current','health','leben'].find(k => num(dd[k]));
  if (!maxK && !curK) return null;
  const max = maxK ? dd[maxK] : null;
  const cur = curK ? dd[curK] : null;
  if (max && cur !== null) return { cur: Math.min(cur, max), max };
  if (max) return { cur: max, max };
  return null;
}

function _kaHpState(dd) {
  if (_kaHpLive.cur !== null && _kaHpLive.max) {
    _kaHpUnknown = false;
    return { cur: _kaHpLive.cur, max: _kaHpLive.max };
  }
  // ✅ Der echte Weg. `kriegerHpMax` spiegelt die SQL (80 + Stufe×4, +8 % bei Vollmundig,
  // das mit Meisterröster auf ×1,5 skaliert). `kriegerHp` kennt zusätzlich `dd.hpDate`:
  // an einem neuen Tag ist der Krieger voll geheilt, auch wenn `dd.hp` noch den Reststand
  // von gestern trägt. ⚠️ Genau das könnte _kaHpFromDd (das nur `dd.hp` liest) NICHT
  // wissen — es hätte den Lauf jeden Morgen mit den HP des Vorabends geplant.
  if (typeof kriegerHpMax === 'function') {
    const max = kriegerHpMax(dd);
    if (max > 0) {
      let cur = max;
      if (typeof kriegerHp === 'function') { const c = kriegerHp(dd); if (c !== undefined && c !== null) cur = Math.max(0, Math.min(max, c)); }
      else { const d = _kaHpFromDd(dd) || _kaHpFromDom(); if (d) cur = d.cur; }
      _kaHpUnknown = false;
      return { cur, max };
    }
  }
  const fromDd = _kaHpFromDd(dd);
  if (fromDd) { _kaHpUnknown = false; return fromDd; }

  const fromDom = _kaHpFromDom();
  if (fromDom) { _kaHpUnknown = false; return fromDom; }

  // Nichts gefunden. Die alte Formel als Notnagel — aber NICHT mit vollen HP rechnen.
  // Genau dieser Optimismus hat den Krieger vorher bis zur Erschöpfung kämpfen lassen.
  // 60 % ist eine bewusst vorsichtige Annahme: lieber ein paar Kämpfe zu wenig als
  // ein Lauf, der die Pauschale verbrennt.
  _kaHpUnknown = true;
  const max = 80 + (dd?.level || 1) * 4;
  return { cur: Math.round(max * 0.6), max };
}

function _kaMaxHp(dd) { return _kaHpState(dd).max; }
function _kaCurHp(dd) { return _kaHpState(dd).cur; }

// Dauerhafte Talent-Boni auf die Kampfwerte. Liefert { atk, def, crit }.
//
// ⚠️ `kriegerTalentStatBonus` hat eine ANDERE Form als hier ursprünglich erwartet:
// es liefert { crit, hpMult } — es gibt schlicht kein Talent, das ATK oder DEF dauerhaft
// hebt. Von den elf Talenten sind nur zwei statisch (fein_gemahlen: +5 CRIT · vollmundig:
// +8 % Max-HP), beide skaliert mit Meisterröster ×1,5. Der Rest wirkt DYNAMISCH im Kampf
// (Alpha-Strike, HP-abhängiger Schadensbonus, Rundenzahl …) und lässt sich nicht als
// Konstante addieren — das Nötige davon steht in _kaMaxRounds und _kaPlayerDmg.
//
// ⚠️ hpMult wird hier BEWUSST NICHT verwendet: `kriegerHpMax` hat den Bonus bereits
// eingerechnet (Zeile 895 in krieger.js). Ein zweites Mal angewandt hätte der Auto-Lauf
// mit 12 % zu vielen Trefferpunkten geplant — und wäre genau darum zu mutig gewesen.
function _kaTalentBonus(dd) {
  if (typeof kriegerTalentStatBonus === 'function') {
    const t = kriegerTalentStatBonus(dd) || {};
    return { atk: 0, def: 0, crit: t.crit || 0 };
  }
  return { atk: 0, def: 0, crit: 0 };  // ⚠️ Fallback: Talente wirken nicht auf die Schätzung
}

// Rundendeckel aus dungeon_fight: `v_max_rounds INT := 40`, mit dem Talent
// „Filterkaffee-Geduld" + ROUND(2 × v_tmult). ⚠️ Ein Kampf, der den Deckel reisst, ist
// eine NIEDERLAGE — die Schleife endet, `v_won` bleibt false. Das ist die zweite Art zu
// verlieren, und die Schätzung kannte sie bisher gar nicht (siehe kriegerAutoWinChance).
function _kaMaxRounds(dd) {
  const t = dd?.talents || {};
  const mult = t.meisterroester ? 1.5 : 1;
  return 40 + (t.filterkaffee ? Math.round(2 * mult) : 0);
}

// Höchste erreichbare Stufe — nur für die Anzeige „Stufe X von Y" relevant.
// ⚠️ Heisst KRIEGER_LEVEL_MAX (999 seit migration_2026-07-30_krieger_levelcap.sql),
// nicht KRIEGER_MAX_LEVEL. Die geratene Schreibweise lieferte immer 0 („unbekannt").
function _kaLevelCap() {
  if (typeof KRIEGER_LEVEL_MAX !== 'undefined') return KRIEGER_LEVEL_MAX;
  return 0; // 0 = unbekannt, Anzeige lässt den Zusatz dann weg
}

// (_kaFightSupportsPotion wurde entfernt: die Signatur von kriegerFight ist bestätigt —
//  potionKey ist Parameter 4. Die frühere Heuristik über Function.length hat bei einem
//  Default-Parameter nur 2 gezählt und war der Grund, warum Cold Brew nie zum Einsatz kam.)

// ═══════════════════════════════════════════════════════════════════════════
// 1) Kampfabschätzung
// ═══════════════════════════════════════════════════════════════════════════

// ── Gegnerwerte MIT Level- und Flavor-Skalierung ────────────────────────────
// ⚠️ DER FEHLER, der den Krieger Kämpfe verlieren ließ, die er für sicher hielt:
// KRIEGER_ENEMIES enthält nur BASISWERTE. Der echte Gegner bekommt obendrauf
//   hp + Level×2 · atk + floor(Level/4) · def + floor(Level/5)
// und vorher noch den Flavor-Faktor (idx0 ×0,7 · idx1 ×1,0 · idx2 ×1,4).
// Ein t4-Gegner auf Stufe 27 hat damit 394 statt 340 HP und 42 statt 36 ATK.
// Beides wird deterministisch aus den Feldkoordinaten bestimmt — dieselbe Rechnung
// wie im Prompt vor dem manuellen Kampf.
function _kaEnemyAt(tier, tx, ty, dd, seed) {
  const base = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(tier) : null;
  if (!base) return null;
  const idx = (typeof kriegerEnemyFlavorIdx === 'function') ? kriegerEnemyFlavorIdx(tx, ty, tier, seed) : 0;
  const fm  = (typeof kriegerFlavorMod === 'function') ? kriegerFlavorMod(tier, idx) : 1;
  const lvl = (typeof kriegerEnemyLevel === 'function')
    ? kriegerEnemyLevel(tx, ty, tier, seed, dd?.level || 1) : (dd?.level || 1);
  return {
    tier, flavorIdx: idx, level: lvl,
    hp:  Math.round((base.hp  || 1) * fm) + lvl * 2,
    atk: Math.round((base.atk || 1) * fm) + Math.floor(lvl / 4),
    def: Math.round((base.def || 0) * fm) + Math.floor(lvl / 5),
    name: base.name,
  };
}

// ── Erwarteter Schaden pro Runde ────────────────────────────────────────────
// SPIEGEL der Formeln aus dungeon_fight (zuletzt definiert in
// migration_2026-07-30_krieger_levelcap.sql). Bei Abweichung HIER anpassen, nicht dort.
//
// ⚠️ 2026-08-17 nachgeprüft (Handover §9.1, „wichtigster Fehlerkandidat" — zu Recht).
// Die alte gemeinsame Funktion `_kaExpDmg(atk, def, crit)` hatte ZWEI Fehler, die in
// entgegengesetzte Richtungen zogen und sich deshalb nie zu einem klaren Symptom addierten:
//
//   1. KRIT ist ×2, nicht ×1,5. Die SQL macht `v_dmg := v_dmg * 2` (mit Wüstensturm-Set
//      sogar `ROUND(v_dmg * 2.5)`). Angesetzt waren +50 % — der eigene Schaden wurde also
//      systematisch ZU NIEDRIG geschätzt, und der Lauf hat Gegner stehen lassen, die er
//      sicher gepackt hätte.
//   2. Der GEGNERSCHADEN hat keinen Boden von 1, sondern von 2 % der Max-HP:
//      `v_dmg := GREATEST(CEIL(v_php_max * 0.02)::INT, v_edmg - v_pdef_run)`
//      (Chip-Schaden, 2026-07-13b). Bei 721 Max-HP sind das mindestens **15 Schaden pro
//      Runde**, auch gegen den schwächsten Gegner. Mit dem angesetzten Boden von 1 hielt
//      sich ein gut gepanzerter Krieger für nahezu unsterblich (rSurv in den Hunderten)
//      und ging in lange Kämpfe, die er nicht durchhielt.
//
// Fehler 2 ist der schwerere: er wirkt genau dort, wo der Auto-Lauf seinen Zweck hat —
// bei vielen kleinen Kämpfen hintereinander.
//
// Spielerschaden. `setCulture` ist der aktive Set-Bonus (kriegerActiveSetCulture),
// `wmech` die Sonder-Mechanik der getragenen Waffe, `ability` die Gegner-Signatur.
//
// ⚠️ 27y — DER GRUND, WARUM DER LAUF ZU VIEL LIEGEN LIESS (JP 2026-08-21: „mir scheint
// da die Berechnung der Siegchancen noch falsch zu sein, also zu pessimistisch").
// Die vier T3-Waffen haben eine `mech`, die dungeon_fight seit dem 15.07. anwendet —
// der Schätzer kannte KEINE davon:
//   streitkolben  ignoriert 50 % der (schon durchschlagenen) Gegner-DEF
//   kriegsbogen   +40 % Schaden gegen DEF ≥ 15
//   wurfmesser    DREI zusätzliche CRIT-Würfe je Runde, jeder +60 % Grundschaden
//   armbrust      Bonus-Erstschlag (steckt in _kaFirstStrike, nicht hier)
// Ein Wurfmesser-Träger mit 40 CRIT schlägt damit real 1,72× so hart wie geschätzt.
//   ⚠️ ÜBERTRAGBARE LEHRE, dieselbe wie beim Adapter: Ein Schätzer, der nur die
//   ADDITIVEN Werte einer Ausrüstung liest (atk/def/crit), übersieht jede Mechanik —
//   und Mechaniken sind genau das, was hochstufige Gegenstände ausmacht.
function _kaPlayerDmg(atk, enemyDef, crit, setCulture, wmech, ability) {
  const a    = atk || 0;
  const eDef = enemyDef || 0;
  // Mittelalter-Set „Rüstungsdurchschlag": ROUND(v_edef_eff * 0.6) — 40 % der Gegner-DEF
  // werden ignoriert.
  const pen = (setCulture === 'mittelalter') ? Math.round(eDef * 0.6) : eDef;
  // Streitkolben halbiert danach nochmals (Spiegel: v_wmech = 'streitkolben').
  let base = (wmech === 'streitkolben')
    ? Math.max(1, a - Math.round(pen * 0.5))
    : Math.max(1, a - pen);
  // Kriegsbogen: +40 % gegen gut gepanzerte Gegner.
  if (wmech === 'kriegsbogen' && pen >= 15) base += Math.round(base * 0.40);
  const c = Math.max(0, Math.min(100, crit || 0)) / 100;
  let dmg;
  if (wmech === 'wurfmesser') {
    // DREI unabhängige CRIT-Würfe, jeder +60 % vom Grundschaden. Ersetzt den normalen
    // CRIT-Zweig (die SQL macht ELSIF) — kein Doppelzählen.
    dmg = base * (1 + 3 * c * 0.6);
  } else {
    // ×2 normal, ×2,5 mit Wüstensturm (orient). Die +10 CRIT des Sets stecken bereits in
    // `crit` (kriegerAutoStatsFor) — hier kommt nur der Multiplikator dazu.
    dmg = base * (1 + c * ((setCulture === 'orient') ? 2.5 : 2) - c);
  }
  // Europa-Set „Doppelter Espresso": 25 % Chance auf einen zweiten Schlag je Runde.
  // ⚠️ Der Zweitschlag ist in der SQL der GRUNDSCHADEN (v_patk − v_edef_eff), OHNE CRIT
  // und ohne Waffen-Mechanik. Der alte `dmg *= 1.25` hat den CRIT mitvervielfacht und
  // damit zu viel versprochen — hier nun exakt.
  if (setCulture === 'europa') dmg += 0.25 * Math.max(1, a - eDef);
  // Gegner-Signatur: 'durchsichtig' weicht 20 % aus, 'bitterkern' schluckt 25 %.
  if (ability === 'durchsichtig') dmg *= 0.80;
  if (ability === 'bitterkern')   dmg *= 0.75;
  return Math.max(0.01, dmg);
}

// Einmaliger Schaden VOR Runde 1 (Armbrust, Talent „Ristretto", Steppe-Salve).
// Wird in kriegerAutoWinChance von den Gegner-HP abgezogen, genau wie es die SQL tut.
function _kaFirstStrike(dd, atk, wmech, setCulture) {
  const t = dd?.talents || {};
  const mult = t.meisterroester ? 1.5 : 1;
  let fs = 0;
  if (wmech === 'armbrust') fs += Math.round((atk || 0) * 0.7);
  if (t.ristretto)          fs += Math.round((atk || 0) * 0.5 * mult);
  // Steppe-Set „Eröffnungssalve": ein kostenloser Fernschuss (0,8 × ATK) VOR Runde 1.
  if (setCulture === 'steppe') fs += Math.max(1, Math.round((atk || 0) * 0.8));
  return fs;
}

// Heilung je Runde, die der Krieger im Kampf selbst erzeugt — Spiegel des Blocks am
// Ende der WHILE-Schleife in dungeon_fight.
// ⚠️ 27y: Diese drei Quellen fehlten in der Schätzung vollständig. Wer Sonnenkraft-Set
// UND Anden-Lama trägt, regeneriert 5 HP je Runde — bei 18 Chip-Schaden ein knappes
// Drittel des Gegnerschadens. Ein Krieger, der real 70 Runden durchhält, wurde auf 47
// geschätzt und liess deshalb Gegner stehen.
function _kaSustain(dd, setCulture, crit) {
  let hps = 0;
  if (setCulture === 'suedamerika') hps += 3;
  if (dd?.companion === 'lama_suedamerika' && dd?.owned?.lama_suedamerika) hps += 2;
  // Orient-Set „Krit-Lebensraub": +4 HP je CRIT → Erwartungswert je Runde.
  if (setCulture === 'orient') hps += 4 * Math.max(0, Math.min(100, crit || 0)) / 100;
  return hps;
}

// Erwartungswert-Spiegel der Gegner-Signatur auf den GEGNERSCHADEN und die Gegner-HP.
// ⚠️ Bewusst als Faktoren, nicht als Rundenlogik: die Schätzung braucht einen Mittelwert,
// keinen Kampfverlauf. Ohne diesen Block war die Schätzung bei Burst-Gegnern zu MUTIG —
// die Korrektur zieht also nicht nur in eine Richtung.
function _kaAbilityMod(ability, dd) {
  const kalte = !!dd?.talents?.kalte_nerven;   // schluckt genau EINEN Burst
  const damp  = kalte ? 0.85 : 1;              // grobe Abschätzung dieses einen Mals
  switch (ability) {
    case 'aufschaeumen':   return { eDmg: 1 + (0.20 / 3) * damp, eHp: 1, regen: 0 };
    case 'stampfer':       return { eDmg: 1 + (1.00 / 4) * damp, eHp: 1, regen: 0 };
    case 'roestfeuer':     return { eDmg: 1 + (0.80 / 5) * damp, eHp: 1, regen: 0 };
    case 'flammenatem':    return { eDmg: 1 + (1.50 / 5) * damp, eHp: 1, regen: 0 };
    case 'adrenalinschub': return { eDmg: 1.30, eHp: 1, regen: 0 };   // Mittel über den Kampf
    case 'bitterkern':     return { eDmg: 0.85, eHp: 1, regen: 0 };   // ATK ×0,85 (Zeile 287)
    case 'aetzend':        return { eDmg: 1.15, eHp: 1, regen: 0 };   // eigene DEF bröckelt
    case 'geistform':      return { eDmg: 1, eHp: 1, regen: 0, lostRound: 1 };
    case 'zaeh':           return { eDmg: 1, eHp: 1.03, regen: 0 };
    case 'regeneration':   return { eDmg: 1, eHp: 1, regen: 1 };
    default:               return { eDmg: 1, eHp: 1, regen: 0 };
  }
}

// Gegnerschaden. ⚠️ `hpMax` ist Pflicht — ohne die eigenen Max-HP lässt sich der
// Chip-Schaden-Boden nicht rechnen, und genau der ist der Kern der Korrektur.
function _kaEnemyDmg(enemyAtk, ownDef, hpMax, setCulture) {
  let dmg = Math.max(Math.ceil((hpMax || 1) * 0.02), (enemyAtk || 0) - (ownDef || 0));
  // Mittelalter-Set: nach den ersten beiden halbierten Treffern dauerhaft ×0,9.
  // (Die zwei halben Treffer selbst stecken als Bonus-HP in kriegerAutoWinChance.)
  if (setCulture === 'mittelalter') dmg = Math.max(1, Math.round(dmg * 0.9));
  return dmg;
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

  // 🐴 REITTIER — ⚠️ 27y: fehlte seit jeher. `dungeon_fight` addiert
  // `_krieger_mount_stats(dd.mount)` auf ATK/DEF/CRIT (Zeile 211–216 der Migration),
  // sofern das Tier im Besitz ist. Der Ur-Saurier gibt +14 ATK, der Pegasus +12 DEF,
  // der Greif +8 CRIT — in JEDER Siegchance fehlten die.
  //   ⚠️ ÜBERTRAGBARE LEHRE: Ein Spiegel der Server-Formel muss die ganze
  //   AUSRÜSTUNGSLISTE spiegeln, nicht nur die drei Slots, an die man zuerst denkt.
  const mnt = (typeof kriegerActiveMount === 'function') ? kriegerActiveMount(dd) : null;
  if (mnt && dd?.owned?.[mnt.key]) { atk += mnt.atk || 0; def += mnt.def || 0; crit += mnt.crit || 0; }

  // Dauerhafte Talent-Boni (Adapter — siehe oben)
  const tal = _kaTalentBonus(dd);
  atk += tal.atk; def += tal.def; crit += tal.crit;

  const setCulture = _kaSetCulture(equipped || {});
  if (setCulture === 'orient') crit += 10; // Wüstensturm

  // Sonder-Mechanik der getragenen Waffe (nur die vier T3-Waffen haben eine).
  const wKey = equipped ? equipped.weapon : null;
  const wIt  = (wKey && dd?.owned?.[wKey] && typeof kriegerItemByKey === 'function')
    ? kriegerItemByKey(wKey) : null;
  const wmech = wIt?.mech || null;

  // ❤️ AKTUELLE HP, nicht maximale — der Krieger geht mit dem in den Kampf,
  // was von den vorherigen Kämpfen übrig ist.
  return { atk, def, crit, hp: _kaCurHp(dd), hpMax: _kaMaxHp(dd), setCulture, wmech };
}

// Signatur-Fähigkeit eines Gegners (aus tier + flavorIdx, Spiegel von
// _krieger_enemy_ability). KRIEGER_ENEMIES trägt sie als `abilities`-Array in derselben
// Reihenfolge wie `flavor`.
function _kaEnemyAbility(enemy) {
  if (!enemy) return null;
  const def = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(enemy.tier) : null;
  const list = def && def.abilities;
  if (!Array.isArray(list) || !list.length) return null;
  const i = Math.max(0, Math.min(list.length - 1, enemy.flavorIdx | 0));
  return list[i] || null;
}

// ── Namen für den Bericht (27z) ─────────────────────────────────────────────
// JP 2026-08-21: „wie viel man von was besiegt hat … welche Ausrüstung verwendet bzw.
// Kultur und woran man gescheitert ist — Stärke, Level der Kreaturen auch rein."
// ⚠️ Der Bericht nannte bisher nur das TIER („Röster-Horde: 7"). Das Tier ist aber nur
// die Gruppe; gekämpft wird gegen eine SIGNATUR (🔥 Röstkammer-Zwerg ×0,7 gegen
// 🐍 Crema-Hydra ×1,4 — Faktor DREI im Schaden). Wer nur das Tier meldet, verschweigt
// genau den Unterschied, der über Sieg und Niederlage entscheidet.
function _kaEnemyName(tier, flavorIdx) {
  const d = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(tier) : null;
  if (!d) return String(tier || '?');
  const f = Array.isArray(d.flavor) ? d.flavor[Math.max(0, Math.min(d.flavor.length - 1, flavorIdx | 0))] : null;
  return f || d.name || String(tier);
}
// Ausgerüstete Gegenstände als lesbare Liste + der aktive Set-Bonus.
function _kaGearText(equipped) {
  const teile = ['weapon', 'armor', 'talisman'].map(sl => {
    const k = equipped ? equipped[sl] : null;
    const it = (k && typeof kriegerItemByKey === 'function') ? kriegerItemByKey(k) : null;
    return it ? `${it.icon || ''} ${it.name}` : null;
  }).filter(Boolean);
  return teile.length ? teile.join(' · ') : 'nichts angelegt';
}
// Lesbarer Name einer Gegner-Signatur („Aufschäumen", „Stampfer" …). Ohne ihn stünde
// im Bericht der rohe Schlüssel — und der sagt niemandem, WARUM der Kampf schiefging.
function _kaAbilityName(key) {
  if (!key) return '';
  const a = (typeof kriegerEnemyAbility === 'function') ? kriegerEnemyAbility(key) : null;
  return a ? `${a.icon || ''} ${a.name}` : String(key);
}
function _kaSetText(equipped) {
  const c = _kaSetCulture(equipped || {});
  if (!c) return '';
  const b = (typeof KRIEGER_SET_BONUSES !== 'undefined') ? KRIEGER_SET_BONUSES[c] : null;
  return b ? `✨ ${b.name}` : `✨ ${c}`;
}

// Geschätzte Siegchance (0..1) gegen ein Gegner-Tier.
// Verfahren: Runden-Vergleich. rSurv = Runden, die ich überlebe; rNeed = Runden,
// die ich zum Töten brauche. Gleichstand ≈ 50 %, 20 % Vorsprung ≈ 60 %.
// enemy = Objekt aus _kaEnemyAt (bereits level- und flavorskaliert).
function kriegerAutoWinChance(dd, equipped, enemy, withColdbrew) {
  if (!enemy) return { pct: 0, rNeed: 99, rSurv: 0 };

  const own   = kriegerAutoStatsFor(dd, equipped);
  // Gegner-Signatur (aufschäumen/stampfer/durchsichtig …) — Erwartungswert, siehe _kaAbilityMod.
  const ab    = _kaEnemyAbility(enemy);
  const am    = _kaAbilityMod(ab, dd);
  const pDmg  = _kaPlayerDmg(own.atk, enemy.def, own.crit, own.setCulture, own.wmech, ab);
  const eDmg  = _kaEnemyDmg(enemy.atk * am.eDmg, own.def, own.hpMax, own.setCulture);
  // Eigene Heilung je Runde (Sonnenkraft, Anden-Lama, Krit-Lebensraub).
  const hps   = _kaSustain(dd, own.setCulture, own.crit);

  // 🧊 Cold Brew heilt 50 % der Max-HP, gedeckelt bei Max — gegen die SQL bestätigt:
  // `v_php := LEAST(v_php_max, GREATEST(0, v_php) + ROUND(v_php_max * 0.5))`.
  let effHp = own.hp;
  if (withColdbrew) {
    const heal = own.hpMax * KRIEGER_AUTO_COLDBREW_HEAL;
    effHp = KRIEGER_AUTO_COLDBREW_CAP ? Math.min(own.hpMax, own.hp + heal) : own.hp + heal;
  }
  // Mittelalter-Set „Eisern": die ersten 2 gegnerischen Treffer −50 % → zusammen ein
  // gesparter voller Treffer. (Die dauerhafte ×0,9 danach steckt schon in eDmg.)
  if (own.setCulture === 'mittelalter') effHp += eDmg;

  // Talent „Kaffeepause": einmalig +15 % Max-HP, sobald die Hälfte unterschritten ist.
  // Wirkt wie zusätzliche Trefferpunkte und fehlte in der Schätzung komplett.
  if (dd?.talents?.kaffeepause) {
    effHp += Math.round(own.hpMax * 0.15 * (dd.talents.meisterroester ? 1.5 : 1));
  }

  // Erstschlag VOR Runde 1: Armbrust, Talent „Ristretto", Steppe-„Eröffnungssalve".
  // ⚠️ Handover §9.2 fragte, ob eine der Utility-Kulturen doch kampfwirksam ist — die
  // Steppe ist es. Gegen schwache Gegner entscheidet sie den Kampf, bevor er beginnt.
  let eHp = Math.max(0, enemy.hp * am.eHp - _kaFirstStrike(dd, own.atk, own.wmech, own.setCulture));

  // 🐍 Regeneration: der Gegner heilt sich je Runde und verlängert den Kampf.
  // Spiegel: LEAST(15, GREATEST(4, floor(ep/12))) — ohne die EP zur Hand konservativ 8.
  const pNet  = am.regen ? Math.max(0.01, pDmg - 8) : pDmg;
  // 👻 Geistform: der erste Treffer ist wirkungslos → eine Runde geht verloren.
  const rNeed = Math.ceil(eHp / pNet) + (am.lostRound || 0);
  // ⚠️ Die eigene Heilung wird vom Gegnerschaden ABGEZOGEN, nicht auf die HP addiert —
  // so wie es die SQL Runde für Runde tut. Boden 1: unsterblich soll die Schätzung
  // niemanden machen, dafür gibt es den Rundendeckel weiter unten.
  const rSurv = Math.ceil(effHp / Math.max(1, eDmg - hps));

  // ⚠️ DIE ZWEITE ART ZU VERLIEREN: Die SQL-Schleife läuft `WHILE v_round < v_max_rounds`.
  // Wer bis dahin nicht durch ist, verliert — `v_won` bleibt false, egal wie viel Leben
  // noch übrig war. Die Schätzung kannte bisher nur „wer stirbt zuerst" und hätte einen
  // zähen Panzer gegen einen HP-starken Gegner mit 99 % bewertet, obwohl der Kampf am
  // Rundendeckel sicher verloren geht.
  const maxR = _kaMaxRounds(dd);
  if (rNeed > maxR) return { pct: 0.02, rNeed, rSurv, maxRounds: maxR, capped: true };

  const raw   = 0.5 + 0.5 * (rSurv - rNeed) / Math.max(1, rNeed);
  return { pct: Math.max(0.02, Math.min(0.99, raw)), rNeed, rSurv, maxRounds: maxR, capped: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) Ausrüstungs-Optimierer
// ═══════════════════════════════════════════════════════════════════════════
// Sucht das beste Loadout aus dem BESITZ gegen ein bestimmtes Gegner-Tier.
// Der 'feet'-Slot wird NIE angefasst (R5): Stiefel gehen in kriegerStepsAllowed()
// ein — ein Wechsel mitten im Lauf würde das Tagesbudget verändern.
function kriegerAutoBestLoadout(dd, enemy, currentEquipped, withColdbrew) {
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
    const est = kriegerAutoWinChance(dd, eq, enemy, withColdbrew);
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
// 3b) Offene Kämpfe auf bereits erkundeten Feldern
// ═══════════════════════════════════════════════════════════════════════════
// JP 2026-08-05: „bereits aufgedeckte Felder werden komplett ausgelassen".
// Genau die sind aber am wertvollsten — ein Kampf auf einem schon erkundeten Feld
// kostet KEINEN Tagesschritt (kriegerWalkBack ist gratis). Hier leben alte Gegner:
// früher gemiedene, verlorene und solche, die man manuell nie abgeräumt hat.
//
// Reihenfolge im Lauf: erst alle erreichbaren Altlasten wegräumen, dann neu erkunden.

let _kaPlanCache = new Map();

// Entscheidet, OB und WOMIT gegen ein Tier gekämpft wird. null = zu stark.
// Gecacht, weil die Suche nach offenen Kämpfen dieselbe Frage für dasselbe Tier
// mehrfach stellt; der Schlüssel enthält alles, was sich im Lauf ändern kann.
// lossCount = Zahl der Niederlagen in diesem Lauf (Selbstkorrektur, s. Konstanten oben)
// tx/ty werden gebraucht, weil Gegner-Level und Flavor aus den Feldkoordinaten stammen.
function _kaPlanFight(dd, tier, tx, ty, seed, lossCount) {
  if (!tier || tier === 'boss') return null;
  const losses = lossCount || 0;
  if (losses >= KRIEGER_AUTO_MAX_LOSSES) return null;   // ab hier nur noch erkunden
  const need = KRIEGER_AUTO_MIN_WINPCT + losses * KRIEGER_AUTO_LOSS_PENALTY;

  const enemy = _kaEnemyAt(tier, tx, ty, dd, seed);
  if (!enemy) return null;

  // 🧊 Ist Cold Brew verfügbar (über der Reserve), und ist der Krieger angeschlagen?
  // ⚠️ 27y: Cold Brew wurde bisher NUR eingesetzt, wenn ein Kampf sonst unter die
  // Schwelle fiel. Das ist zu sparsam: Trankfunde kommen schneller herein, als man sie
  // verbraucht (JP hatte über 30 Stück je Sorte), und ein Trank aus einem überlaufenden
  // Bestand ist der BILLIGERE Weg zurück auf volle HP als 60 CC für die Erholung.
  // Deshalb jetzt auch vorsorglich, sobald die HP unter dieselbe Schwelle fallen, ab
  // der geheilt würde — dann bleibt die bezahlte Erholung für den Fall, dass der
  // Trankvorrat aufgebraucht ist.
  const cbStock = (typeof kriegerPotionCount === 'function')
    ? kriegerPotionCount(dd, KRIEGER_AUTO_COLDBREW_KEY) : 0;
  const cbOk = cbStock > KRIEGER_AUTO_POTION_KEEP;
  const hurt = _kaMaxHp(dd) > 0 && _kaCurHp(dd) < _kaMaxHp(dd) * KRIEGER_AUTO_HEAL_AT;

  const armorKey = dd?.equipped?.armor || '';
  const ck = `${tier}|${enemy.level}|${enemy.flavorIdx}|${_kaCurHp(dd)}|${armorKey}|${_kaArmorDur(dd, armorKey)}|${losses}|${cbOk ? 1 : 0}`;
  if (_kaPlanCache.has(ck)) return _kaPlanCache.get(ck);

  let plan = null;
  const plain = kriegerAutoBestLoadout(dd, enemy, dd?.equipped, false);
  if (plain && plain.est.pct >= need && !(hurt && cbOk)) {
    plan = { best: plain, potionKey: null, enemy };
  } else if (cbOk) {
    const withCb = kriegerAutoBestLoadout(dd, enemy, dd?.equipped, true);
    if (withCb && withCb.est.pct >= need) {
      plan = { best: withCb, potionKey: KRIEGER_AUTO_COLDBREW_KEY, enemy };
    } else if (plain && plain.est.pct >= need) {
      // Der Trank half nicht — dann eben ohne (kein Trank verbrennen für nichts).
      plan = { best: plain, potionKey: null, enemy };
    }
  }
  _kaPlanCache.set(ck, plan);
  return plan;
}

// Nächstes erreichbares, bereits erkundetes Feld mit einem offenen Gegner, der
// aktuell zu schaffen ist. `skip` enthält Felder, die in diesem Lauf schon verloren
// wurden — ohne diese Sperre liefe der Krieger endlos zwischen Niederlage und
// Wiederholung hin und her.
function kriegerAutoFindPendingFight(dd, skip, lossCount, seed, maxDetour) {
  const enc = dd?.encounters || {};
  if (!Object.keys(enc).length) return null;

  const start = (typeof kriegerPos === 'function') ? kriegerPos(dd) : { x: 0, y: 0 };
  const explored = dd?.explored || {};
  const bossX = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.x : -1;
  const bossY = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.y : -1;
  const N = (typeof KRIEGER_WORLD !== 'undefined') ? KRIEGER_WORLD : 150;
  const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  const seen = new Set([`${start.x},${start.y}`]);
  const prev = new Map();
  const depth = new Map([[`${start.x},${start.y}`, 0]]);
  const queue = [start];
  let head = 0;

  const candidate = (x, y) => {
    const k = `${x},${y}`;
    if (skip && skip.has(k)) return null;
    if (x === bossX && y === bossY) return null;   // R6 — Drache bleibt manuell
    const tier = enc[k];
    if (!tier || tier === 'boss') return null;
    // ⚠️ Seit dem Respawn-Umbau bleibt der Encounter-Eintrag NACH einem Sieg stehen.
    // Ohne diese Prüfung liefe der Auto-Lauf immer wieder zu längst erledigten Feldern
    // (Cooldown) oder zu endgültig toten (permaDead) — genau der Eindruck, dass
    // „pausierte Kämpfe trotzdem bekämpft werden".
    if (typeof kriegerEnemyActive === 'function' && !kriegerEnemyActive(dd, k)) return null;
    return _kaPlanFight(dd, tier, x, y, seed, lossCount) ? { key: k, tier } : null;
  };

  while (head < queue.length) {
    const cur = queue[head++];
    const hit = candidate(cur.x, cur.y);
    if (hit) {
      const path = [];
      let node = cur;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift(node);
        node = prev.get(`${node.x},${node.y}`);
      }
      return { path, target: { x: cur.x, y: cur.y }, key: hit.key, tier: hit.tier };
    }
    // Umwegbegrenzung: ein alter Gegner 60 Felder entfernt ist die Laufzeit nicht wert
    // (bei 35 ms je Feld allein zwei Sekunden Anmarsch pro Richtung).
    const d = depth.get(`${cur.x},${cur.y}`) || 0;
    if (d >= (maxDetour || KRIEGER_AUTO_MAX_DETOUR)) continue;
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !explored[k]) continue;
      seen.add(k);
      prev.set(k, cur);
      depth.set(k, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// ── 27z: Was bleibt stehen, und WARUM? ──────────────────────────────────────
// JP 2026-08-21: „woran man gescheitert ist — Stärke, Level der Kreaturen auch rein."
//
// Der Lauf wusste das bisher nirgends: `kriegerAutoFindPendingFight` liefert entweder
// ein Ziel oder `null` — WELCHE Gegner es verworfen hat, verschwand in der Suche.
// Deshalb hier eine eigene Erhebung EINMAL am Laufende: derselbe BFS über die
// erkundeten Felder, aber statt des ersten Treffers werden die ABLEHNUNGEN gesammelt.
//
// ⚠️ Gerechnet wird mit VOLLEN HP, nicht mit dem Reststand. Sonst stünde im Bericht
// „zu stark" über Gegner, die nur deshalb liegen blieben, weil der Krieger am Ende
// müde war — und JP würde daraus die falsche Lehre ziehen (Ausrüstung kaufen statt
// heilen). Die Frage, die diese Liste beantwortet, ist: „Was schaffe ich mit dieser
// Ausrüstung grundsätzlich nicht?"
// ⚠️ Gedeckelt: die Karte hat bis zu 22.500 Felder. `LIMIT` bricht nach genug
// Stichproben ab — ein Bericht darf die Oberfläche nie sekundenlang blockieren.
function kriegerAutoSurveyTooStrong(dd, seed, maxDetour, limit) {
  const out = {};
  try {
    const enc = dd?.encounters || {};
    if (!Object.keys(enc).length) return [];
    const max = _kaMaxHp(dd);
    // Kopie mit vollen HP — die Erhebung fragt nach der AUSRÜSTUNG, nicht nach der Müdigkeit.
    const ddFull = { ...dd, hp: max,
      hpDate: (typeof _kriegerTodayKey === 'function') ? _kriegerTodayKey() : dd?.hpDate };
    const start = (typeof kriegerPos === 'function') ? kriegerPos(dd) : { x: 0, y: 0 };
    const explored = dd?.explored || {};
    const bossX = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.x : -1;
    const bossY = (typeof KRIEGER_BOSS_POS !== 'undefined') ? KRIEGER_BOSS_POS.y : -1;
    const N = (typeof KRIEGER_WORLD !== 'undefined') ? KRIEGER_WORLD : 150;
    const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const seen = new Set([`${start.x},${start.y}`]);
    const depth = new Map([[`${start.x},${start.y}`, 0]]);
    const queue = [start];
    let head = 0, geprueft = 0;
    const LIMIT = limit || 400;

    while (head < queue.length && geprueft < LIMIT) {
      const cur = queue[head++];
      const k = `${cur.x},${cur.y}`;
      const tier = enc[k];
      const istBoss = (cur.x === bossX && cur.y === bossY) || tier === 'boss';
      if (tier && !istBoss
          && !(typeof kriegerEnemyActive === 'function' && !kriegerEnemyActive(dd, k))) {
        geprueft++;
        const feind = _kaEnemyAt(tier, cur.x, cur.y, ddFull, seed);
        if (feind) {
          // Bestes Loadout aus dem BESITZ, mit Cold Brew — also die beste Chance,
          // die überhaupt zur Verfügung steht.
          const best = kriegerAutoBestLoadout(ddFull, feind, ddFull.equipped, true);
          const pct = best ? best.est.pct : 0;
          if (pct < KRIEGER_AUTO_MIN_WINPCT) {
            const ek = `${tier}|${feind.flavorIdx}`;
            const o = out[ek] || (out[ek] = { name: _kaEnemyName(tier, feind.flavorIdx), tier,
              n: 0, lvMin: Infinity, lvMax: 0, bestPct: 0, atk: 0, def: 0, hp: 0,
              capped: false, ability: _kaEnemyAbility(feind) });
            o.n++;
            o.lvMin = Math.min(o.lvMin, feind.level); o.lvMax = Math.max(o.lvMax, feind.level);
            if (pct >= o.bestPct) {
              o.bestPct = pct; o.atk = feind.atk; o.def = feind.def; o.hp = feind.hp;
              o.capped = !!(best && best.est.capped);
            }
          }
        }
      }
      const d = depth.get(k) || 0;
      if (d >= (maxDetour || KRIEGER_AUTO_MAX_DETOUR)) continue;
      for (const [dx, dy] of NB) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const nk = `${nx},${ny}`;
        if (seen.has(nk) || !explored[nk]) continue;
        seen.add(nk); depth.set(nk, d + 1); queue.push({ x: nx, y: ny });
      }
    }
  } catch (e) { return []; }   // Regel 3: ein Bericht darf nie der Grund für einen Absturz sein
  return Object.values(out).sort((a, b) => b.n - a.n).slice(0, 8);
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
    fights: 0, wins: 0, losses: 0, skipped: 0, revisits: 0,
    byTier: {}, skippedByTier: {},
    ccFight: 0, ccFind: 0, refund: 0, ep: 0,
    levelUps: [], vouchers: 0, potions: 0, coldbrews: 0,
    heals: 0, healCost: 0,
    // 🧪 Welche Tränke/Ausrüstungsgutscheine gefunden wurden. JP 2026-08-21: „Ich weiß
    // auch nicht, ob beim autolauf gefundene Schätze eingeführt werden, das gilt auch zu
    // testen." Sie werden es (Trank → dd.potions, Gutschein → dd.equipmentVoucher,
    // CC → rep.ccFind → DB.addCoins) — nur nannte das Protokoll bloss die ANZAHL.
    // ⚠️ Eine blosse Zahl ist nicht prüfbar. Ab jetzt steht da, WAS gefunden wurde.
    potionKinds: {}, voucherSlots: [],
    // 27z — nach Gegner-SIGNATUR statt nur nach Tier, mit Stufenband und CC/EP.
    kills: {},      // `tier|flavorIdx` → { tier, flavorIdx, n, cc, ep, lvMin, lvMax }
    defeats: [],    // jede Niederlage einzeln: gegen WEN, mit welchen Werten
    gear: {},       // welche Ausrüstung wie oft — samt Set-Bonus
    tooStrong: [],  // am Laufende erhoben: was bleibt stehen, und warum
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
  _kaPlanCache = new Map();
  _kaHpLive = { cur: null, max: null };   // pro Lauf frisch
  rep.hpStart = _kaCurHp(state.dd);
  rep.hpMax   = _kaMaxHp(state.dd);
  _kriegerAutoRunning = true;
  _kriegerAutoStop    = false;

  try {
    let actions = 0;
    const triedKeys = new Set();   // in diesem Lauf verlorene Felder — kein zweiter Versuch
    // Notbremse gegen Stillstand: zählt Kämpfe je Feld in diesem Lauf. Sollte die
    // Zustandsführung je wieder auseinanderlaufen, dreht sich der Krieger höchstens
    // zweimal im Kreis statt endlos — und das Protokoll zeigt es als gemiedenes Feld.
    const fightCount = new Map();

    // 🛌 AUTO-HEILUNG (27y). Kauft die „Volle Erholung" (dieselbe Aktion wie der Knopf
    // im Dungeon), wenn die HP unter KRIEGER_AUTO_HEAL_AT fallen.
    //
    // ⚠️ KEIN ZWEITES SYSTEM: Der Ablauf ist 1:1 der von `krieger-buy-heal` in
    // imperium.js — spendCoins, dd.hp/hpMax/hpDate setzen, saveDungeonData. Ein eigener
    // Heilweg wäre der Fall „zwei Dinge, ein Name" gewesen.
    // ⚠️ Nach der Heilung MUSS der Planungs-Cache fallen: seine Schlüssel enthalten die
    // alte HP, sonst gälte für den Rest des Laufs weiter die Bewertung eines
    // angeschlagenen Kriegers.
    // ⚠️ Cold Brew heilt zwar auch 50 % — aber NUR am Anfang eines Kampfes (er ist ein
    // Trank-Parameter von dungeon_fight, keine eigenständige Handlung). Deshalb bleibt
    // er das Mittel für den knappen Kampf, und die Erholung ist das für den langen Lauf.
    const maybeHeal = async (force) => {
      if (!_kriegerAutoHeal) return false;
      if (rep.heals >= KRIEGER_AUTO_HEAL_MAX) return false;
      const max = _kaMaxHp(state.dd), cur = _kaCurHp(state.dd);
      if (!(max > 0)) return false;
      if (!force && cur > max * KRIEGER_AUTO_HEAL_AT) return false;
      if (cur >= max) return false;
      // ⚠️ Reihenfolge der Mittel: erst der Trank, den es im Überfluss gibt, dann Geld.
      // Solange Cold Brew über der Reserve liegt, heilt ihn `_kaPlanFight` beim nächsten
      // Kampf gratis auf über die Hälfte — dann wäre die bezahlte Erholung Verschwendung.
      // ⚠️ `force` (0 HP, der Server verweigert den Kampf) übergeht das: dort zählt nur,
      // dass es überhaupt weitergeht.
      if (!force) {
        const cb = (typeof kriegerPotionCount === 'function')
          ? kriegerPotionCount(state.dd, KRIEGER_AUTO_COLDBREW_KEY) : 0;
        if (cb > KRIEGER_AUTO_POTION_KEEP) return false;
      }
      if ((state.memberCoins || 0) < KRIEGER_AUTO_HEAL_COST + KRIEGER_AUTO_HEAL_KEEP_CC) return false;
      let left;
      try { left = await DB.spendCoins(member.id, KRIEGER_AUTO_HEAL_COST); } catch (err) { return false; }
      if (left === null || left === undefined) return false;
      state.memberCoins = left;
      if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: left };
      if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: left });
      const today = (typeof _kriegerTodayKey === 'function') ? _kriegerTodayKey() : null;
      state.dd = { ...state.dd, hp: max, hpMax: max, ...(today ? { hpDate: today } : {}) };
      _kaHpLive = { cur: max, max };
      _kaPlanCache = new Map();
      try { await DB.saveDungeonData(member.id, state.dd); } catch (err) { /* nicht kritisch */ }
      rep.heals++;
      rep.healCost += KRIEGER_AUTO_HEAL_COST;
      _kaRepaint(state, seed);
      _kriegerAutoUpdateProgress(rep, budget);
      return true;
    };

    // Freies Laufen über bereits erkundete Felder (kostet keinen Tagesschritt).
    const walkPath = async (path) => {
      for (const tile of path || []) {
        if (typeof kriegerWalkBack !== 'function') break;
        state.dd = kriegerWalkBack(tile.x, tile.y, state.dd);
        rep.walked++;
        _kaFollowViewport(state, COLS, ROWS, MARGIN);
        _kaRepaint(state, seed);
        await _kaSleep(KRIEGER_AUTO_WALK_DELAY);
      }
    };

    // Führt einen geplanten Kampf aus. Rückgabe: 'won' | 'lost' | 'error' | 'noarmor'.
    const doFight = async (tier, key, plan, tx, ty) => {
      // Loadout setzen und dd speichern.
      // ⚠️ PFLICHT: dungeon_fight liefert new_dungeon_data zurück und überschreibt damit
      // den lokalen Stand. Ohne dieses Speichern gingen alle seit dem letzten Kampf
      // erkundeten Felder verloren.
      state.dd = { ...state.dd, equipped: { ...state.dd.equipped, ...plan.best.equipped } };
      try { await DB.saveDungeonData(member.id, state.dd); } catch (e) { return 'error'; }

      // ⚠️ VOLLSTÄNDIGE SIGNATUR — das war der schwerste Fehler der ersten Fassung:
      //   kriegerFight(memberId, enemyTier, flavorIdx, potionKey, potionKey2, enemyLevel)
      // Vorher wurde nur (id, tier) übergeben. Der Trank landete dadurch auf der
      // flavorIdx-Position, und das Gegner-Level fehlte ganz.
      const e = plan.enemy || {};
      let result;
      try {
        result = (typeof kriegerFight === 'function')
          ? await kriegerFight(member.id, tier, e.flavorIdx ?? 0, plan.potionKey || null, null, e.level)
          : await DB.dungeonFight(member.id, tier, e.flavorIdx ?? 0, plan.potionKey || null, null, e.level);
      } catch (err) { return 'error'; }
      // ⚠️ 27y: `dungeon_fight` bricht bei 0 HP mit `error: 'no_hp'` ab (Zeile 256 der
      // Migration). Das lief bisher in denselben Zweig wie ein Verbindungsabbruch und
      // beendete den ganzen Lauf mit „Verbindungsproblem" — obwohl nur geheilt werden
      // musste. Jetzt ein eigener Status, den die Schleife behandeln kann.
      //   ⚠️ ÜBERTRAGBARE LEHRE: „irgendein Fehler" als EIN Zustand verschenkt genau die
      //   Fälle, aus denen es einen Ausweg gäbe.
      if (result && result.error === 'no_hp') return 'nohp';
      if (!result || result.error) return 'error';

      if (plan.potionKey) rep.coldbrews++;
      rep.fights++;
      rep.byTier[tier] = (rep.byTier[tier] || 0) + 1;
      rep.ep += result.ep_awarded || 0;
      rep.loadouts[tier] = plan.best.equipped;

      // 27z: Ausrüstung mitschreiben. Der Optimierer wechselt je Gegner — ohne diese
      // Zählung stand im Bericht nur das Loadout des LETZTEN Kampfes je Tier, und das
      // sagt nichts darüber, womit die Arbeit tatsächlich gemacht wurde.
      try {
        const gk = ['weapon', 'armor', 'talisman'].map(sl => plan.best.equipped?.[sl] || '-').join('|');
        const g  = rep.gear[gk] || (rep.gear[gk] = {
          n: 0, wins: 0, text: _kaGearText(plan.best.equipped), set: _kaSetText(plan.best.equipped) });
        g.n++;
        if (result.won) g.wins++;
      } catch (err) { /* Regel 3: eine Statistik darf den Kampf nie stören */ }

      state.dd = result.new_dungeon_data || { ...state.dd, level: result.new_level };
      // ❤️ Die RPC liefert den echten HP-Stand zurück — verlässlicher als jede Schätzung.
      if (typeof result.hp === 'number')     _kaHpLive.cur = Math.max(0, result.hp);
      if (typeof result.hp_max === 'number') _kaHpLive.max = result.hp_max;
      // R3: Der +5-Schritte-Bonus pro Sieg wird im Auto-Lauf NICHT angewendet.

      if (result.cc_awarded > 0) {
        rep.ccFight += result.cc_awarded;
        state.memberCoins += result.cc_awarded;
        if (typeof currentUserData !== 'undefined') currentUserData = { ...(currentUserData || {}), coins: state.memberCoins };
        if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins: state.memberCoins });
      }
      if (result.leveled_up) rep.levelUps.push(result.new_level);

      // 27z: Gegner-Signatur samt Stufenband — gewonnen wie verloren.
      try {
        const ek = `${tier}|${e.flavorIdx ?? 0}`;
        if (result.won) {
          const k = rep.kills[ek] || (rep.kills[ek] = { tier, flavorIdx: e.flavorIdx ?? 0,
            name: _kaEnemyName(tier, e.flavorIdx), n: 0, cc: 0, ep: 0, lvMin: Infinity, lvMax: 0 });
          k.n++;
          k.cc += result.cc_awarded || 0;
          k.ep += result.ep_awarded || 0;
          const lv = result.enemy_level || e.level || 0;
          k.lvMin = Math.min(k.lvMin, lv); k.lvMax = Math.max(k.lvMax, lv);
        } else {
          // ⚠️ Eine Niederlage ist die WERTVOLLSTE Zeile des Berichts: sie sagt, wo die
          // Schätzung danebenlag. Deshalb einzeln — mit der Chance, die ihr zugetraut
          // wurde, und den Werten, gegen die sie antrat.
          rep.defeats.push({ name: _kaEnemyName(tier, e.flavorIdx), tier,
            level: result.enemy_level || e.level || 0,
            atk: e.atk || 0, def: e.def || 0, hp: e.hp || 0,
            pct: Math.round((plan.best?.est?.pct || 0) * 100),
            rounds: result.rounds || 0,
            ability: _kaEnemyAbility(e), coldbrew: !!plan.potionKey });
        }
      } catch (err) { /* Regel 3 */ }

      let status;
      if (result.won) {
        rep.wins++;
        status = 'won';
        // ⚠️ BUCHFÜHRUNG IST CLIENT-SACHE — und sie muss VOLLSTÄNDIG sein.
        // dungeon_fight bekommt keine Feldkoordinaten (memberId, tier, flavorIdx,
        // potionKey, potionKey2, enemyLevel); die RPC kann also gar nicht wissen,
        // welches Feld gefallen ist.
        //
        // ⚠️ LEHRGELD 2026-08-05: Ein Zwischenstand hat das Löschen des Encounters
        // entfernt und nur defeatedAt gesetzt — mit dem Kommentar in krieger.js als
        // Begründung („nach einem Sieg nicht mehr gelöscht"). Ergebnis in der Praxis:
        // das ⚔️ blieb stehen (Cooldown wird nur blasser gezeichnet), die Wegfindung
        // fand dasselbe Feld erneut, der Zähler lief und die Figur nicht.
        // Deshalb jetzt BEIDES:
        //   1. Encounter-Eintrag entfernen → Feld ist sichtbar erledigt, die Suche
        //      kann es nicht wiederfinden. Das ist die Fassung, die nachweislich lief.
        //   2. defeatedAt/permaDead trotzdem mitschreiben → der Zustand bleibt zu dem
        //      konsistent, was das manuelle Spiel erzeugt.
        //
        // BEWUSSTE ABWEICHUNG: Ohne Encounter-Eintrag respawnt dieses Feld nicht mehr.
        // Im manuellen Spiel käme der Gegner einmal zurück. Der Auto-Lauf verzichtet
        // also auf einen späteren Zweitkampf — der Preis dafür, dass er überhaupt
        // vorankommt. Wer respawnende Gegner will, kämpft manuell.
        if (key) {
          const wasDefeated = state.dd.defeatedAt?.[key] != null;
          const defeatedAt  = { ...(state.dd.defeatedAt || {}), [key]: Date.now() };
          const permaDead   = { ...(state.dd.permaDead  || {}) };
          if (wasDefeated) permaDead[key] = true;
          const enc = { ...(state.dd.encounters || {}) };
          delete enc[key];
          state.dd = { ...state.dd, encounters: enc, defeatedAt, permaDead };
        }
      } else {
        rep.losses++;
        status = 'lost';
        // R11: Niederlage OHNE Rüstung verbrennt die Tagesschritte → Lauf endet.
        const armorKey = state.dd.equipped?.armor;
        if (!(armorKey && state.dd.owned?.[armorKey])) {
          state.dd = {
            ...state.dd,
            steps_today: (typeof kriegerStepsAllowed === 'function') ? kriegerStepsAllowed(state.dd.level || 1, state.dd) : 999,
            steps_date: (typeof _kriegerTodayKey === 'function') ? _kriegerTodayKey() : new Date().toLocaleDateString('de-DE'),
          };
          status = 'noarmor';
        }
      }

      _kaRepaint(state, seed);
      _kriegerAutoUpdateProgress(rep, budget);
      return status;
    };

    while (actions < KRIEGER_AUTO_MAX_ACTIONS) {
      actions++;
      if (_kriegerAutoStop) { rep.endReason = 'stopped'; break; }

      // 🛌 Vor jeder Planung: sind die HP unten, erst auffüllen. Muss VOR
      // kriegerAutoFindPendingFight stehen — die Suche bewertet jedes Feld mit den
      // aktuellen HP und fände sonst gar nichts mehr, was zu schaffen wäre.
      await maybeHeal(false);

      // ── PHASE 1: offene Gegner auf bereits erkundeten Feldern ──────────────
      // Kostet keinen Tagesschritt und ist genau das, was JP will: erst alles
      // wegräumen, was erreichbar ist, und erst dann Neuland betreten (27y).
      const capHit    = rep.revisits >= KRIEGER_AUTO_MAX_REVISITS;
      const pend = !capHit
        ? kriegerAutoFindPendingFight(state.dd, triedKeys, rep.losses, seed, KRIEGER_AUTO_MAX_DETOUR)
        : null;
      if (pend && (fightCount.get(pend.key) || 0) >= 2) {
        triedKeys.add(pend.key);
        continue;
      }
      if (pend) {
        fightCount.set(pend.key, (fightCount.get(pend.key) || 0) + 1);
        await walkPath(pend.path);
        const plan = _kaPlanFight(state.dd, pend.tier, pend.target.x, pend.target.y, seed, rep.losses);
        if (!plan) { triedKeys.add(pend.key); continue; }   // HP inzwischen zu niedrig
        rep.revisits++;
        const st = await doFight(pend.tier, pend.key, plan, pend.target.x, pend.target.y);
        if (st === 'error')   { rep.endReason = 'error';   break; }
        if (st === 'noarmor') { rep.endReason = 'noarmor'; break; }
        if (st === 'nohp') {
          // Keine Trefferpunkte mehr. Heilen und dasselbe Feld nochmal — geht das nicht
          // (kein Geld, Deckel erreicht, Automatik aus), endet der Lauf mit klarem Grund
          // statt mit „Verbindungsproblem".
          if (await maybeHeal(true)) continue;
          rep.endReason = 'nohp'; break;
        }
        if (st === 'lost')    triedKeys.add(pend.key);
        await _kaSleep(KRIEGER_AUTO_STEP_DELAY);
        continue;
      }

      // ── PHASE 2: neues Feld erkunden ──────────────────────────────────────
      if (rep.steps >= budget) {
        // Schritte alle. Hierher kommt der Lauf nur, wenn Phase 1 nichts mehr gefunden
        // hat — also ist wirklich nichts Bekämpfbares mehr in Reichweite.
        rep.endReason = capHit ? 'revisitcap' : 'nofights';
        break;
      }

      const route = kriegerAutoFindTarget(state.dd, seed);
      if (!route) {
        // Nichts Neues erreichbar — aber vielleicht noch alte Felder. Dann weiterräumen,
        // statt den Lauf zu beenden.
        if (!capHit && kriegerAutoFindPendingFight(state.dd, triedKeys, rep.losses, seed,
                                                   KRIEGER_AUTO_MAX_DETOUR_LATE)) {
          continue;
        }
        rep.endReason = 'blocked';
        break;
      }

      await walkPath(route.path);

      // Zielfeld betreten — kostet einen Tagesschritt
      const tx = route.target.x, ty = route.target.y, key = `${tx},${ty}`;
      const res = kriegerExploreTile(tx, ty, state.dd, seed);
      let dd2 = res.newDungeonData;
      const gimmick = res.gimmick, encounter = res.encounter;
      if (encounter) dd2 = { ...dd2, encounters:   { ...(dd2.encounters   || {}), [key]: encounter.tier } };
      if (gimmick)   dd2 = { ...dd2, gimmickTiles: { ...(dd2.gimmickTiles || {}), [key]: true } };
      if (gimmick?.voucher) {
        dd2 = { ...dd2, equipmentVoucher: gimmick.voucher };
        rep.vouchers++;
        rep.voucherSlots.push(gimmick.name || gimmick.voucher.slot || 'Gutschein');
      }
      if (gimmick?.potion) {
        // ⚠️ kriegerExploreTile meldet den Trank nur — EINTRAGEN muss ihn der Aufrufer.
        // Genau deshalb sind die Trankfunde des Auto-Laufs vorher spurlos verschwunden.
        const pots = { ...(dd2.potions || {}) };
        pots[gimmick.potion] = (pots[gimmick.potion] || 0) + 1;
        dd2 = { ...dd2, potions: pots };
        rep.potions++;
        rep.potionKinds[gimmick.potion] = (rep.potionKinds[gimmick.potion] || 0) + 1;
      }
      if (gimmick?.cc)      rep.ccFind += gimmick.cc;
      state.dd = dd2;
      rep.steps++;

      _kaFollowViewport(state, COLS, ROWS, MARGIN);
      _kaRepaint(state, seed);
      _kriegerAutoUpdateProgress(rep, budget);

      // Frisch entdeckter Gegner (R7)
      if (encounter && encounter.tier !== 'boss') {
        const plan = _kaPlanFight(state.dd, encounter.tier, tx, ty, seed, rep.losses);
        if (!plan) {
          rep.skipped++;
          rep.skippedByTier[encounter.tier] = (rep.skippedByTier[encounter.tier] || 0) + 1;
        } else {
          const st = await doFight(encounter.tier, key, plan, tx, ty);
          if (st === 'error')   { rep.endReason = 'error';   break; }
          if (st === 'noarmor') { rep.endReason = 'noarmor'; break; }
          if (st === 'nohp') {
            // Das Feld ist erkundet und der Gegner bleibt stehen — heilen und weiter.
            if (!(await maybeHeal(true))) { rep.endReason = 'nohp'; break; }
            rep.skipped++;
            rep.skippedByTier[encounter.tier] = (rep.skippedByTier[encounter.tier] || 0) + 1;
          }
          if (st === 'lost')    triedKeys.add(key);
        }
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

  // 27z: erst die Erhebung (sie braucht den Zustand von JETZT), dann die HP-Momentaufnahme
  // freigeben — die Reihenfolge ist wichtig, sonst rechnet die Erhebung mit einem
  // frisch geleerten Cache und einer anderen HP-Quelle.
  rep.tooStrong = kriegerAutoSurveyTooStrong(state.dd, seed, KRIEGER_AUTO_MAX_DETOUR, 400);
  rep.hpEnd = _kaCurHp(state.dd);
  // ⚠️ 27y — JP 2026-08-21: „Auch wird komischerweise 0HP teilweise angegeben, auch nach
  // HP-Auffüllen."
  // BEFUND: `_kaHpLive` ist ein MODUL-Zustand und wurde bisher nur BEIM START eines
  // Laufs zurückgesetzt. Endete ein Lauf mit 0 HP, blieb `_kaHpLive.cur = 0` liegen —
  // und `_kaHpState()` bevorzugt diesen Wert vor allem anderen. Der Start-Dialog zeigte
  // danach „❤️ 0/721", auch nachdem der Spieler die Volle Erholung gekauft hatte, und
  // die Vorschau bewertete jeden Gegner mit 0 HP als aussichtslos.
  //   ⚠️ ÜBERTRAGBARE LEHRE: Ein Cache, der nur beim BETRETEN geleert wird, überlebt das
  //   Verlassen — und ist danach die einzige Quelle, die von der Aussenwelt nichts mehr
  //   mitbekommt. Ein Momentaufnahme-Cache gehört an BEIDEN Enden geleert.
  _kaHpLive = { cur: null, max: null };

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
  if (rep.endReason === 'blocked' && rep.steps < budget * KRIEGER_AUTO_REFUND_UNDER
      && (rep.ccFight + rep.ccFind) < cost) {
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
    { label: '🛌 Auto-Lauf Erholung',      amount: -rep.healCost, detail: `${rep.heals}× volle Erholung` },
  ]);

  _kaRepaint(state, seed);
  await _kriegerAutoFinish(member, state, rep);
  return rep;
}

// Chat (genau EINE Zusammenfassung) + Achievements
async function _kriegerAutoFinish(member, state, rep) {
  // ⚠️ Regel 1 (Statistik-Vollständigkeit): die Heilkosten sind eine Ausgabe des Laufs
  // und gehören in dieselbe Netto-Zeile wie die Gebühr — sonst meldet der Chat einen
  // Gewinn, den es nicht gab.
  const net = Math.round(rep.ccFight + rep.ccFind + rep.refund - rep.cost - rep.healCost);
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
        Der Krieger räumt zuerst alle erreichbaren offenen Kämpfe ab und erkundet erst
        dann weiter. Er wählt seine Ausrüstung selbst, füllt unterwegs seine HP auf und
        kämpft nur, wenn er gewinnen kann. Zu starke Gegner bleiben für dich stehen.
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
  if (!el) return;
  // Nach dem Schrittende läuft nur noch die Aufräumphase — das soll man sehen,
  // sonst wirkt ein Lauf mit „👣 19/19" wie hängengeblieben.
  const phase = rep.steps >= budget ? '♻️ Aufräumen' : `👣 ${rep.steps}/${budget}`;
  el.textContent = `${phase} · ⚔️ ${rep.wins} Siege · ♻️ ${rep.revisits} alte · 🚫 ${rep.skipped} gemieden`;
}

function _kriegerAutoConfirm(member, state, seed, COLS, ROWS, MARGIN) {
  const popup = document.getElementById('krieger-popup');
  if (!popup) return;
  const level = state.dd?.level || 1;
  const cost  = kriegerAutoCost(level);
  const left  = (typeof kriegerStepsLeft === 'function') ? kriegerStepsLeft(state.dd) : 0;

  // Vorschau: welches Tier wäre mit dem aktuellen Besitz schaffbar?
  // Vorschau mit einem typischen Gegner: Flavor ×1,0 und Gegner-Level = eigenes Level.
  // Auf dem Feld schwankt beides, deshalb ist das ein Richtwert, keine Zusage.
  const pos = (typeof kriegerPos === 'function') ? kriegerPos(state.dd) : { x: 0, y: 0 };
  const preview = ['t1','t2','t3','t4'].map(t => {
    const base = (typeof kriegerEnemyDef === 'function') ? kriegerEnemyDef(t) : null;
    if (!base) return '';
    const lvl = state.dd?.level || 1;
    const enemy = { tier: t, flavorIdx: 1, level: lvl,
      hp: base.hp + lvl * 2, atk: base.atk + Math.floor(lvl / 4), def: base.def + Math.floor(lvl / 5) };
    const b = kriegerAutoBestLoadout(state.dd, enemy, state.dd.equipped, false);
    const ok = b && b.est.pct >= KRIEGER_AUTO_MIN_WINPCT;
    return `<div style="display:flex;justify-content:space-between;font-size:11px">
      <span>${ok ? '⚔️' : '🚫'} ${_kaEsc(base.name || t)}</span>
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
          <div style="font-size:12px">Zustand: <strong>❤️ ${_kaCurHp(state.dd)}/${_kaMaxHp(state.dd)}</strong> · 🧊 ${(typeof kriegerPotionCount === 'function' ? kriegerPotionCount(state.dd, KRIEGER_AUTO_COLDBREW_KEY) : 0)} Cold Brew</div>
          ${/* 🛌 27y: Ohne Auffüllen endet jeder lange Lauf am Chip-Schaden (2 % Max-HP
                je Runde). Der Schalter steht hier und nicht in einem Einstellungsmenü, weil
                genau hier die Entscheidung fällt, wie teuer der Lauf werden darf (Regel 4:
                die Regel dort, wo man auf sie trifft). */''}
          <label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="krieger-auto-healbox" ${_kriegerAutoHeal ? 'checked' : ''}>
            <span>🛌 HP unterwegs auffüllen — unter ${Math.round(KRIEGER_AUTO_HEAL_AT * 100)} %,
              je ${KRIEGER_AUTO_HEAL_COST} 🫘, höchstens ${KRIEGER_AUTO_HEAL_MAX}×
              (max. ${KRIEGER_AUTO_HEAL_MAX * KRIEGER_AUTO_HEAL_COST} 🫘)</span>
          </label>
          <div style="margin-top:4px;font-size:11px;opacity:.7">Geschätzte Siegchance je Gegnerart:</div>
          ${preview}
          <div style="font-size:11px;opacity:.6;margin-top:4px">
            Erst werden ALLE erreichbaren offenen Kämpfe abgesucht, dann wird erkundet.
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
  document.getElementById('krieger-auto-healbox')?.addEventListener('change', (ev) => {
    _kriegerAutoHeal = !!ev.target.checked;
  });
  document.getElementById('krieger-auto-confirm').onclick = async () => {
    _kriegerAutoHeal = !!document.getElementById('krieger-auto-healbox')?.checked;
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
  const net = Math.round(rep.ccFight + rep.ccFind + rep.refund - rep.cost - rep.healCost);
  // 27z — die vier Blöcke, die JP wollte: was besiegt, was verloren, was gemieden,
  // womit gekämpft. Bewusst nach dem Vorbild des Karten-Autolaufs: eine ZEILE JE
  // GEGNERART mit Anzahl und Ertrag, nicht eine Sammelzahl.
  const lvTxt = (a, b) => (a === b || !Number.isFinite(a)) ? `Stufe ${b}` : `Stufe ${a}–${b}`;
  const zeile = (links, rechts) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">
    <span>${links}</span><span style="opacity:.75;text-align:right;white-space:nowrap">${rechts}</span></div>`;
  const trenner = '<div style="border-top:1px solid rgba(255,255,255,.12);margin:4px 0;padding-top:4px"></div>';
  const kopf = (t) => `<div style="font-size:11px;opacity:.6;margin-top:2px">${t}</div>`;

  const kills = Object.values(rep.kills || {}).sort((a, b) => b.n - a.n);
  const killListe = kills.length
    ? kills.map(k => zeile(`${k.n}× ${_kaEsc(k.name)} <span style="opacity:.6">${lvTxt(k.lvMin, k.lvMax)}</span>`,
                           `+${Math.round(k.cc)} 🫘 · ${Math.round(k.ep)} EP`)).join('')
    : '<div style="font-size:12px;opacity:.6">Kein Gegner gefallen.</div>';

  // ⚠️ Die Niederlagen sind die wertvollsten Zeilen: sie sagen, wo die Schätzung
  // danebenlag. Deshalb einzeln, mit der zugetrauten Chance NEBEN den echten Werten.
  const defeatListe = (rep.defeats || []).length
    ? (rep.defeats || []).slice(-6).map(d => zeile(
        `${_kaEsc(d.name)} <span style="opacity:.6">${lvTxt(d.level, d.level)}</span>`
        + (d.ability ? ` <span style="opacity:.55">· ${_kaEsc(_kaAbilityName(d.ability))}</span>` : '')
        + (d.coldbrew ? ' <span style="opacity:.55">· 🧊</span>' : ''),
        `⚔️ ${d.atk} · 🛡️ ${d.def} · ❤️ ${d.hp}`)
        + `<div style="font-size:11px;opacity:.55;margin:-2px 0 3px">`
        + `geschätzt ${d.pct} % Siegchance, verloren nach ${d.rounds || '?'} Runden</div>`).join('')
    : '';

  // Was in Reichweite stehen bleibt — mit Stärke und Stufe, bei VOLLEN HP gerechnet.
  const stark = rep.tooStrong || [];
  const starkListe = stark.length
    ? stark.map(s => zeile(
        `${s.n}× ${_kaEsc(s.name)} <span style="opacity:.6">${lvTxt(s.lvMin, s.lvMax)}</span>`,
        `⚔️ ${s.atk} · 🛡️ ${s.def} · ❤️ ${s.hp}`)
        + `<div style="font-size:11px;opacity:.55;margin:-2px 0 3px">beste Chance mit deiner Ausrüstung: `
        + `${Math.round(s.bestPct * 100)} %${s.capped ? ' — der Kampf reisst den 40-Runden-Deckel' : ''}</div>`).join('')
    : '';

  const gears = Object.values(rep.gear || {}).sort((a, b) => b.n - a.n).slice(0, 4);
  const gearListe = gears.length
    ? gears.map(g => zeile(`${_kaEsc(g.text)}${g.set ? ` <span style="opacity:.7">${_kaEsc(g.set)}</span>` : ''}`,
                           `${g.n} Kämpfe · ${g.wins} Siege`)).join('')
    : '';
  const endMsg = {
    budget:     'Alle Tagesschritte verbraucht.',
    nofights:   'Schritte aufgebraucht und kein schaffbarer Gegner mehr in Reichweite.',
    nohp:       'Keine Trefferpunkte mehr — und keine Erholung mehr möglich (Deckel, Geld oder Automatik aus).',
    revisitcap: `Obergrenze von ${KRIEGER_AUTO_MAX_REVISITS} aufgeräumten Feldern erreicht.`,
    stopped: 'Vom Spieler gestoppt.',
    blocked: 'Kein erreichbares unerkundetes Feld mehr — Bohrer oder Granate helfen weiter.',
    noarmor: 'Niederlage ohne Rüstung — die Tagesschritte sind aufgebraucht.',
    error:   'Vorzeitig beendet (Verbindungsproblem). Alles bis hierher wurde gespeichert.',
    safety:  'Sicherheitsgrenze erreicht.',
  }[rep.endReason] || '';
  const warnHp   = _kaHpUnknown ? 'Trefferpunkte konnten nicht ausgelesen werden — es wurde vorsichtig gerechnet.' : '';
  // Was genau gefunden wurde — damit sich „kommen die Funde an?" prüfen lässt.
  const fundTeile = Object.keys(rep.potionKinds || {}).map(k => {
    const pd = (typeof kriegerPotionByKey === 'function') ? kriegerPotionByKey(k) : null;
    return `${pd ? pd.icon : '🧪'} ${_kaEsc(pd ? pd.name : k)} ×${rep.potionKinds[k]}`;
  }).concat((rep.voucherSlots || []).map(v => `🎁 ${_kaEsc(v)}`));
  const fundLine = fundTeile.length ? `Eingebucht: ${fundTeile.join(' · ')}` : '';
  const warnLoss = rep.losses >= KRIEGER_AUTO_MAX_LOSSES ? `Nach ${rep.losses} Niederlagen wurde nur noch erkundet.` : '';

  const row = (l, v) => `<div style="display:flex;justify-content:space-between;font-size:12px"><span style="opacity:.75">${l}</span><span>${v}</span></div>`;

  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="krieger-fight-overlay">
      <div class="cc-karte-popup-inner" style="max-width:360px;width:100%">
        <div class="cc-karte-popup-hdr">🤖 Lauf-Protokoll</div>
        <div class="cc-karte-popup-body" style="flex-direction:column;align-items:stretch;gap:5px">
          ${row('Schritte / Felder', `${rep.steps} von ${rep.budget}`)}
          ${row('Kämpfe', `🏆 ${rep.wins} · 💀 ${rep.losses} · 🚫 ${rep.skipped} gemieden`)}
          ${trenner}${kopf('⚔️ Besiegt')}
          ${killListe}
          ${defeatListe ? `${trenner}${kopf('💀 Daran gescheitert')}${defeatListe}` : ''}
          ${starkListe ? `${trenner}${kopf('🚫 Bleibt in Reichweite stehen — bei vollen HP gerechnet')}${starkListe}` : ''}
          ${gearListe ? `${trenner}${kopf('🧥 Womit gekämpft wurde')}${gearListe}` : ''}
          ${trenner}
          ${rep.revisits ? row('Alte Felder geräumt', `♻️ ${rep.revisits}`) : ''}
          ${row('Kampfgewinne', `+${Math.round(rep.ccFight)} 🫘`)}
          ${row('Funde', `+${Math.round(rep.ccFind)} 🫘${rep.vouchers ? ` · 🎁 ${rep.vouchers}` : ''}${rep.potions ? ` · 🧪 ${rep.potions}` : ''}`)}
          ${fundLine ? `<div style="font-size:11px;opacity:.75">${fundLine}</div>` : ''}
          ${row('Gebühr', `−${rep.cost} 🫘`)}
          ${rep.refund ? row('Erstattung', `+${rep.refund} 🫘`) : ''}
          <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid rgba(255,255,255,.12);padding-top:5px;margin-top:3px">
            <span>Netto</span><span>${net >= 0 ? '+' : ''}${net} 🫘</span>
          </div>
          ${row('Erfahrung', `+${rep.ep} EP`)}
          ${row('Trefferpunkte', `❤️ ${rep.hpStart} → ${rep.hpEnd}${rep.hpMax ? ` / ${rep.hpMax}` : ''}`)}
          ${rep.coldbrews ? row('Cold Brew', `🧊 ${rep.coldbrews} eingesetzt`) : ''}
          ${rep.heals ? row('Erholung', `🛌 ${rep.heals}× · −${rep.healCost} 🫘`) : ''}
          ${rep.levelUps.length ? `<div class="krieger-levelup">🎉 Stufe ${rep.levelUps[rep.levelUps.length - 1]} erreicht!</div>` : ''}
          ${endMsg ? `<div style="font-size:11px;opacity:.6;margin-top:5px">${_kaEsc(endMsg)}</div>` : ''}
          ${warnLoss ? `<div style="font-size:11px;opacity:.75">⚠️ ${_kaEsc(warnLoss)}</div>` : ''}
          ${warnHp ? `<div style="font-size:11px;opacity:.75">⚠️ ${_kaEsc(warnHp)}</div>` : ''}
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
