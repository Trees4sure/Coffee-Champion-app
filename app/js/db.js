// Supabase-basiertes Daten-Layer — mit CoffeeCoins, Forschung, Kasse
const DB = (() => {
  let _sb = null;
  let _groupId = null;

  function init() {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function setGroup(id) { _groupId = id; }

  async function hashPassword(password) {
    const data = new TextEncoder().encode(password.trim());
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function getSeasonId() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getSeasonName(id) {
    const [y, m] = id.split('-');
    const monate = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return `Coffee Championship ${monate[parseInt(m) - 1]} ${y}`;
  }

  function getTitle(cups) {
    const tiers = [
      [5000,'Kaiser des Koffeins'],[2500,'Herrscher der Bohnen'],
      [1500,'Unsterblicher Koffeinlord'],[1000,'Kaffee-Legende'],
      [750,'Bohnenkönig'],[500,'Koffein-Kommandant'],
      [250,'Espresso-Ritter'],[100,'Filtermeister'],[50,'Bohnenanwärter'],
    ];
    for (const [min, title] of tiers) if (cups >= min) return title;
    return 'Kaffee-Neuling';
  }

  // ── Streak — Werktage (Mo–Fr), Wochenenden werden übersprungen ───────────────
  function calcStreak(activeDays) {
    if (!activeDays?.length) return 0;
    const daySet = new Set(activeDays);

    function prevWorkday(dateStr) {
      const d = new Date(dateStr + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }

    // Letzter Werktag (heute oder Freitag wenn Wochenende)
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    let cur = d.toISOString().slice(0, 10);

    // Falls heute noch nicht eingetragen, vorherigen Werktag als Basis
    if (!daySet.has(cur)) {
      cur = prevWorkday(cur);
      if (!daySet.has(cur)) return 0;
    }

    let streak = 0;
    while (daySet.has(cur)) {
      streak++;
      cur = prevWorkday(cur);
      if (streak > 600) break; // Sicherheitsnetz
    }
    return streak;
  }

  // ── User normalisieren — inkl. neue Felder ───────────────────────────────────
  function normalizeUser(u) {
    return {
      id: u.id, name: u.name, totalCups: u.total_cups || 0,
      currentStreak: u.current_streak || 0, maxStreak: u.max_streak || 0,
      monthlyWins: u.monthly_wins || 0, isAdmin: u.is_admin || false,
      joinDate: u.join_date, lastActive: u.last_active,
      achievements: u.achievements || {}, activeDays: u.active_days || [],
      seasonCups: u.season_cups || {},
      coins:     parseFloat(u.coins)     || 0,
      research:  u.research              || {},
      cosmetics: u.cosmetics             || {},
      map_data:  u.map_data              || {},
      // 📊 Tagesbilanz (eigene Spalte, migration_2026-07-21h) — NICHT aus map_data
      // ableiten: dort wird sie von veralteten Client-Kopien überschrieben.
      // ⚠️ Ein neues Feld MUSS hier stehen, sonst ist es nach jedem Reload weg
      // (derselbe Fehler wie damals bei map_data).
      day_stats: u.day_stats             || {},
      dungeon_data: u.dungeon_data       || {},
      mobil:     u.mobil                 || {},
      space:     u.space                 || {},   // 🚀 Weltraum (P1)
    };
  }

  // ── Tages-Log: woher kamen die CoffeeCoins heute? (Transparenz für Spieler) ──
  // Lebt in map_data.todayLog, wird bei Datumswechsel automatisch geleert.
  function appendTodayLog(mapData, entries) {
    if (!entries || !entries.length) return mapData || {};
    const day  = today();
    const prev = (mapData?.todayLog?.date === day) ? (mapData.todayLog.entries || []) : [];
    const list = prev.slice();
    const nowIso = new Date().toISOString();
    for (const raw of entries) {
      const e = { ...raw, t: nowIso };
      // Aggregierbare Einträge (z.B. Dungeon-Funde, Kartenschätze) werden in EINEM Tages-Eintrag
      // zusammengefasst statt jedes Mal neu angehängt — sonst verdrängen viele kleine Funde die
      // übrigen Einträge aus dem Limit. Gleicher `aggKey` → Betrag + Anzahl (`count`) aufsummiert,
      // Label „<aggBase> ×N", und der Eintrag wandert ans Ende (bleibt „frisch" → überlebt slice).
      if (e.aggKey) {
        const base = e.aggBase || e.label;
        const idx = list.findIndex(x => x.aggKey === e.aggKey);
        if (idx >= 0) {
          const ex = list.splice(idx, 1)[0];
          const cnt = (ex.count || 1) + 1;
          list.push({ ...ex, amount: Math.round(((ex.amount || 0) + (e.amount || 0)) * 100) / 100,
                      count: cnt, aggBase: base, label: `${base} ×${cnt}`, detail: e.detail || ex.detail, t: nowIso });
          continue;
        }
        e.count = 1; e.aggBase = base; e.label = base;
      }
      list.push(e);
    }
    const next = list.slice(-50);
    // Laufende Tages-Summen — UNABHÄNGIG vom 50-Einträge-Anzeigelimit oben. Ohne sie schrumpft
    // die angezeigte Tages-Einnahme, sobald ältere Log-Einträge aus dem 50er-Fenster fallen
    // (das war der „1800→1000"-Bug). Wir summieren die REINEN Zugänge (jeden eingehenden Eintrag),
    // nicht die gekappte/aggregierte Anzeige-Liste.
    const ps = (mapData?.todayLog?.date === day) ? (mapData.todayLog.sums || null) : null;
    let sGross = ps?.gross || 0, sSpent = ps?.spent || 0, sNet = ps?.net || 0;
    const sCats = { ...(ps?.cats || {}) };             // 2a: Tages-Netto je Rubrik (cat), cap-unabhängig
    for (const raw of entries) {
      const amt = raw.amount || 0;
      if (raw.kapital) continue;                       // reine Kapitalbewegung → zählt nirgends
      if (amt > 0) { sGross += amt; sNet += amt; }
      else if (!raw.invest) { sSpent += -amt; sNet += amt; } // Investitionen zählen nicht ins Netto
      else continue;                                   // Investition (negativ) → nicht ins Netto/Rubrik
      const rk = raw.cat || 'beute';                   // cat-lose Zugänge (Kämpfe/Schätze/CIQ) → „beute"
      sCats[rk] = Math.round(((sCats[rk] || 0) + amt) * 100) / 100;
    }
    const sums = { gross: Math.round(sGross * 100) / 100, spent: Math.round(sSpent * 100) / 100, net: Math.round(sNet * 100) / 100, cats: sCats };
    const ledger = _accrueLedger(mapData?.ledger, entries);
    const out = { ...(mapData || {}), todayLog: { date: day, entries: next, sums }, ledger };
    // 📊 Tagesbilanz v2 (2026-07-22): DELTA der gerade angehängten Einträge mitgeben.
    // Der Server ADDIERT diese Deltas atomar (add_day_stats) — im Gegensatz zu den
    // Totalen oben (sums) sind sie korrekt, egal wie veraltet die lokale map_data-Kopie
    // ist. Die alte Total+GREATEST-Fortschreibung fror ein, sobald der lokale todayLog
    // einmal zurückrollte („ab einem bestimmten Moment zählt es nicht mehr", JP).
    // `_dayDelta` ist ein NORMALES (enumerierbares) Feld, damit es Spreads wie
    // `{ ...md, x }` zwischen append und updateMapData überlebt — updateMapData
    // entfernt es VOR dem save_map_data-Write wieder (es darf nie im Blob landen).
    // Spiegelbild der sums-Regeln oben: kapital nie, invest nicht als Ausgabe.
    let dGross = 0, dSpent = 0; const dCats = {};
    for (const raw of entries) {
      const amt = raw.amount || 0;
      if (raw.kapital) continue;
      if (amt > 0) dGross += amt;
      else if (!raw.invest) dSpent += -amt;
      else continue;
      const rk = raw.cat || 'beute';
      dCats[rk] = Math.round(((dCats[rk] || 0) + amt) * 100) / 100;
    }
    const prevD = (mapData && mapData._dayDelta && mapData._dayDelta.day === day) ? mapData._dayDelta : null;
    if (prevD) {                                    // unbestätigtes Delta mitnehmen (Retry)
      dGross += prevD.gross || 0; dSpent += prevD.spent || 0;
      for (const k in (prevD.cats || {})) dCats[k] = Math.round(((dCats[k] || 0) + prevD.cats[k]) * 100) / 100;
    }
    out._dayDelta = { day, gross: Math.round(dGross * 100) / 100, spent: Math.round(dSpent * 100) / 100, cats: dCats };
    return out;
  }

  // ── 📊 Tagesbilanz: die EINE Quelle für „was kam heute rein" (0:00–24:00) ─────
  // Reihenfolge der Quellen ist Absicht:
  //   1. members.day_stats  — eigene Spalte, server-monoton (bump_day_stats). Kann von
  //      einem veralteten Client-Write NICHT gesenkt werden. Das ist der Normalfall.
  //   2. map_data.todayLog.sums — Fallback für die Zeit, bevor die Migration lief
  //      bzw. bevor der erste Bump des Tages passiert ist.
  //   3. Aufsummieren der Log-Einträge — letzter Fallback für Altbestände ohne `sums`
  //      (dort fehlt alles, was aus dem 50-Einträge-Fenster gefallen ist).
  // Gibt immer { date, gross, spent, net, cats } zurück; für einen fremden Tag Nullen.
  function dayStats(member, dayKey) {
    const day = dayKey || today();
    const r2  = n => Math.round((n || 0) * 100) / 100;
    const d   = member && (member.day_stats || member.dayStats);
    if (d && d.date === day) {
      const gross = r2(parseFloat(d.gross) || 0), spent = r2(parseFloat(d.spent) || 0);
      return { date: day, gross, spent, net: r2(gross - spent), cats: d.cats || {} };
    }
    const tl = member && member.map_data && member.map_data.todayLog;
    if (tl && tl.date === day) {
      if (tl.sums) return { date: day, gross: r2(tl.sums.gross), spent: r2(tl.sums.spent), net: r2(tl.sums.net), cats: tl.sums.cats || {} };
      const es = tl.entries || [];
      const gross = r2(es.reduce((s, e) => s + ((e.amount > 0 && !e.kapital) ? e.amount : 0), 0));
      const spent = r2(es.reduce((s, e) => s + ((e.amount < 0 && !e.invest && !e.kapital) ? -e.amount : 0), 0));
      return { date: day, gross, spent, net: r2(gross - spent), cats: {} };
    }
    return { date: day, gross: 0, spent: 0, net: 0, cats: {} };
  }

  // ── Bilanz-Ledger: kumulative Lifetime-Summen je Kategorie (Einnahmen/Ausgaben/Investitionen) ──
  // Wächst ab Einführung ("seit jetzt"). Erfasst NUR Einträge mit explizitem `cat` — retro-gezählte
  // Posten (Krieger-Kampf → dungeon_data.totalCcEarned, Tränke → potionsSpent, Kartenschätze →
  // totalTreasureCc, CIQ-Beute → ciqCcEarned) tragen bewusst KEIN cat und werden hier übersprungen,
  // damit sie in der Anzeige nicht doppelt gezählt werden (dort aus ihrem eigenen Zähler ergänzt).
  // Bucket: amount>0 → income · amount<0 & invest:true → invested · amount<0 sonst → spent.
  function _accrueLedger(prevLedger, entries) {
    const L = {
      income:   { ...(prevLedger?.income   || {}) },
      spent:    { ...(prevLedger?.spent    || {}) },
      invested: { ...(prevLedger?.invested || {}) },
    };
    for (const e of (entries || [])) {
      // kapital:true = reine Kapitalbewegung (Stille Anlage / Kaffeebörse Ein-/Auszahlen) →
      // weder Einnahme noch Ausgabe noch Investition. Wird komplett übersprungen.
      if (!e || !e.cat || !e.amount || e.kapital) continue;
      const bucket = e.amount > 0 ? 'income' : (e.invest ? 'invested' : 'spent');
      L[bucket][e.cat] = Math.round(((L[bucket][e.cat] || 0) + Math.abs(e.amount)) * 100) / 100;
    }
    return L;
  }

  // Frisch-Lesen + Anhängen + Schreiben in EINEM Schritt. Verhindert das Clobbering durch
  // zeitgleiche map_data-Writes (Passiv-Log/Gehalts-Snapshot laufen bei showApp) — dasselbe
  // Muster wie in claimPassive/_writeSalaryPoint. Für Ereignis-Einträge (Kampf-CC, Dungeon-Funde,
  // Trank-Ausgaben), die sonst auf einer veralteten member.map_data aufsetzen würden.
  // Gibt die frisch gemergte map_data zurück (oder null bei Fehler/leer).
  async function appendTodayLogFresh(memberId, entries) {
    if (!memberId || !entries || !entries.length) return null;
    try {
      const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
      const md = appendTodayLog((fresh && fresh.map_data) || {}, entries);
      await updateMapData(memberId, md);
      return md;
    } catch (e) { console.warn('appendTodayLogFresh fehlgeschlagen:', e.message); return null; }
  }

  // Passiv-Einkommen anteilig nach Forschung / Gebäude / Welt-Einfluss / Handelsbündnis
  // aufschlüsseln, jeweils mit Quellen-Detail (woraus es entsteht — für „Heute erhalten").
  // tradeBonusDay: additiver 🤝-Bündnisanteil (aus _allianceTradeBonus), separat von
  // wPerDay (Welt-Einfluss), damit er in der Anzeige nicht stillschweigend darin aufgeht.
  function _passiveLogEntries(member, passiveEarned, worldRankMap, worldByCountry, groupPerDay, tradeBonusDay) {
    const rPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    const bPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const wRank   = (worldRankMap && typeof calcWorldPerDay === 'function') ? calcWorldPerDay(worldRankMap) : 0;
    const wBld    = (worldRankMap && typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(worldRankMap, worldByCountry) : 0;
    const wPerDay = wRank + wBld;
    const gPerDay = groupPerDay || 0;
    const tPerDay = tradeBonusDay || 0;
    const pPerDay = (typeof worldPassivePerDay === 'function') ? worldPassivePerDay(member, worldByCountry) : 0; // 🏦 Stille Anlage
    const tot = rPerDay + bPerDay + wPerDay + gPerDay + tPerDay + pPerDay;
    if (tot <= 0) return [{ label: '⚙️ Passiv-Einkommen', amount: passiveEarned }];
    const bShare = Math.round(passiveEarned * (bPerDay / tot) * 100) / 100;
    const wShare = Math.round(passiveEarned * (wPerDay / tot) * 100) / 100;
    const gShare = Math.round(passiveEarned * (gPerDay / tot) * 100) / 100;
    const tShare = Math.round(passiveEarned * (tPerDay / tot) * 100) / 100;
    const pShare = Math.round(passiveEarned * (pPerDay / tot) * 100) / 100;
    const rShare = Math.round((passiveEarned - bShare - wShare - gShare - tShare - pShare) * 100) / 100;
    const wDetail = [
      (typeof worldPerDayDetail === 'function') ? worldPerDayDetail(worldRankMap) : '',
      (typeof worldBuildingPerDayDetail === 'function') ? worldBuildingPerDayDetail(worldRankMap, worldByCountry) : '',
    ].filter(Boolean).join(', ');
    const out = [];
    if (rShare > 0) out.push({ label: '⚙️ Forschung (passiv)', amount: rShare, cat: 'forschung', detail: (typeof researchPerDayDetail === 'function') ? researchPerDayDetail(member.research) : '' });
    if (bShare > 0) out.push({ label: '🏗️ Gebäude-Einkommen',  amount: bShare, cat: 'karte', detail: (typeof buildingPerDayDetail === 'function') ? buildingPerDayDetail(member.map_data?.buildings || {}) : '' });
    if (wShare > 0) out.push({ label: '🌍 Welt-Einfluss',       amount: wShare, cat: 'welt', detail: wDetail });
    if (tShare > 0) out.push({ label: '🤝 Handelsdividende',    amount: tShare, cat: 'welt', ally: true, detail: '+10% des Einkommens aus dem Partner-Land' });
    if (gShare > 0) out.push({ label: '🏛️ Gruppenkasse (passiv)', amount: gShare, cat: 'gruppe', detail: `+${gPerDay} CC/Tag für alle` });
    if (pShare > 0) out.push({ label: '🏦 Stille Anlage',        amount: pShare, cat: 'welt', detail: (typeof worldPassivePerDayDetail === 'function') ? worldPassivePerDayDetail(member, worldByCountry) : '' });
    return out;
  }

  // ── Gruppe erstellen ─────────────────────────────────────────────────────────
  async function createGroup(name, password) {
    const hash = await hashPassword(password);
    const { data, error } = await _sb.from('groups')
      .insert({ name: name.trim(), password_hash: hash })
      .select('id, name').single();
    if (error) {
      if (error.code === '23505') throw new Error('Gruppenname bereits vergeben');
      throw new Error(error.message);
    }
    _groupId = data.id;
    return data;
  }

  // ── Gruppe beitreten ─────────────────────────────────────────────────────────
  async function joinGroup(name, password) {
    const hash = await hashPassword(password);
    const { data, error } = await _sb.rpc('check_group_password', { p_name: name.trim(), p_hash: hash });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Falscher Gruppenname oder Passwort');
    _groupId = data[0].id;
    return { id: data[0].id, name: data[0].name };
  }

  // ── Daten laden ──────────────────────────────────────────────────────────────
  async function fetchData() {
    const [m, ds, s, h, wi, wb, wa, tr] = await Promise.all([
      _sb.from('members').select('*').eq('group_id', _groupId).order('total_cups', { ascending: false }),
      _sb.from('daily_stats').select('*').eq('group_id', _groupId).order('date', { ascending: false }).limit(90),
      _sb.from('seasons').select('*').eq('group_id', _groupId).order('season_id', { ascending: false }),
      _sb.from('hall_of_fame').select('*').eq('group_id', _groupId).maybeSingle(),
      // Welt-Daten (Phase 1.5): liefern {data:null,error} falls noch nicht migriert → []. Kein Reject.
      _sb.from('world_investments').select('member_id, country_id, total_invested, garde_level').eq('group_id', _groupId),
      _sb.from('world_buildings').select('member_id, country_id, building_id, level').eq('group_id', _groupId),
      // Weltbündnisse (für Informant-Bericht) — [] falls Migration noch nicht ausgeführt.
      _sb.from('world_alliances').select('id, type, member_a, member_b, country_a, country_b, payer_id, offer_cc, status, started_at, expires_at, last_tribut_at').eq('group_id', _groupId),
      _sb.from('group_treasury').select('balance, contributions, unlocked_goals').eq('group_id', _groupId).maybeSingle(),
    ]);
    return {
      users: (m.data || []).map(normalizeUser),
      dailyStats: Object.fromEntries((ds.data || []).map(d => [d.date, { date: d.date, total: d.total, entries: d.stats || {} }])),
      seasons: s.data || [],
      halloffame: h.data || {},
      worldInvestments: wi.data || [],
      worldBuildings: wb.data || [],
      worldAlliances: wa.data || [],
      treasury: tr.data || { balance: 0, contributions: {}, unlocked_goals: {} },
      entries: []
    };
  }

  // ── User registrieren ────────────────────────────────────────────────────────
  async function registerUser(name) {
    const { data: existing } = await _sb.from('members').select('id')
      .eq('group_id', _groupId).ilike('name', name.trim()).maybeSingle();
    if (existing) throw new Error('Name bereits vergeben');

    const { data: allMembers } = await _sb.from('members').select('id').eq('group_id', _groupId);
    const isAdmin = !allMembers || allMembers.length === 0;

    const { data, error } = await _sb.from('members').insert({
      group_id: _groupId, name: name.trim(),
      total_cups: 0, is_admin: isAdmin,
      join_date: today(), last_active: today(),
      achievements: {}, active_days: [], season_cups: {},
      coins: 50, research: {}, cosmetics: {}  // Willkommens-Startkapital (gegen die Anfangs-Durststrecke)
    }).select().single();
    if (error) throw new Error(error.message);
    await ensureSeason();
    return normalizeUser(data);
  }

  // Garde-Akademie-Entwicklung (+10% auf alle Welt-Einkommen) — aus map_data.worldDev
  function _gardeMult(member) {
    return (member && member.map_data && member.map_data.worldDev && member.map_data.worldDev.garde_akademie) ? 1.1 : 1;
  }

  // 🤝 Handelsbündnis: LÄNDERbezogen (nicht personenbezogen) — +10% auf das Einkommen AUS
  // Wechselseitige Handels-Dividende: Für jedes aktive Handelsbündnis, bei dem ICH gerade eines
  // der beiden Länder regiere, bekomme ich +10% des Einkommens aus dem PARTNER-Land (dem anderen
  // der beiden Pakt-Länder) — additiv obendrauf (das Partner-Einkommen wird nicht angetastet).
  // Symmetrisch by design: der Partner bekommt spiegelbildlich 10% aus meinem Land. Länderbezogen
  // (rankMap prüft live, wer country_a/country_b regiert — "das Geld bekommt der regierende
  // Mitspieler"). Additiver Bonus (kein Multiplikator wie _gardeMult). Der Satz 0.10 muss zu
  // ALLIANCE_TYPES.handel.bonusPct in alliances.js passen. Robust: {cup:0,day:0} bei fehlender
  // Tabelle/Migration.
  async function _allianceTradeBonus(rankMap, byCountry) {
    try {
      const { data, error } = await _sb.from('world_alliances')
        .select('country_a, country_b').eq('group_id', _groupId).eq('type', 'handel').eq('status', 'active');
      if (error) throw error;
      let cup = 0, day = 0;
      for (const pact of (data || [])) {
        // Welches Land regiere ICH? Die Dividende kommt vom PARTNER-Land (dem anderen).
        const iGovernA = (rankMap || {})[pact.country_a] === 1;
        const iGovernB = (rankMap || {})[pact.country_b] === 1;
        if (!iGovernA && !iGovernB) continue;          // Pakt gehört gerade nicht mir
        const partnerCid = iGovernA ? pact.country_b : pact.country_a; // ← Partner-Land
        const sub = { [partnerCid]: 1 };
        cup += (((typeof calcWorldPerCup === 'function') ? calcWorldPerCup(sub) : 0)
              + ((typeof calcWorldBuildingPerCup === 'function') ? calcWorldBuildingPerCup(sub, byCountry) : 0)) * 0.10;
        day += (((typeof calcWorldPerDay === 'function') ? calcWorldPerDay(sub) : 0)
              + ((typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(sub, byCountry) : 0)) * 0.10;
      }
      return { cup: Math.round(cup * 100) / 100, day: Math.round(day * 100) / 100 };
    } catch (e) { return { cup: 0, day: 0 }; }
  }

  // Gruppenkasse-Boni (perCup/perDay) aus freigeschalteten Gruppen-Zielen — robust,
  // {perCup:0,perDay:0} falls Tabelle/Helfer fehlt. Wirkt für ALLE Mitglieder gleich.
  async function _fetchGroupPerks() {
    try {
      const t = await fetchTreasury();
      return (typeof treasuryGroupPerks === 'function') ? treasuryGroupPerks(t) : { perCup: 0, perDay: 0 };
    } catch (e) { return { perCup: 0, perDay: 0 }; }
  }

  // Aktive Sabotagen GEGEN diesen Member (Set von country_id) — {} bei fehlender Tabelle
  async function _fetchActiveSabotages(memberId) {
    try {
      const { data, error } = await _sb.from('world_sabotage')
        .select('country_id').eq('group_id', _groupId).eq('target_id', memberId)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      return new Set((data || []).map(r => r.country_id));
    } catch (e) { return new Set(); }
  }

  // ── Welt-Ränge des Members laden (für Welt-Boni) — robust, {} bei Fehler ──────
  // Sabotierte Länder werden entfernt → der Member verliert dort vorübergehend das
  // Einkommen (Einfluss + Gebäude), behält aber clientseitig seinen sichtbaren Rang.
  async function _fetchWorldRankMap(memberId) {
    try {
      const { data, error } = await _sb.rpc('get_member_country_ranks', { p_member_id: memberId, p_group_id: _groupId });
      if (error) throw error;
      const m = {};
      for (const row of (data || [])) m[row.country_id] = row.rank;
      const sabotaged = await _fetchActiveSabotages(memberId);
      for (const cid of sabotaged) delete m[cid];
      return m;
    } catch (e) { return {}; } // Tabelle/RPC fehlt (nicht migriert) → keine Welt-Boni, kein Crash
  }

  // ── Land-Gebäude der Gruppe laden, gruppiert nach Land — {} bei Fehler ───────
  async function _fetchWorldBuildingsByCountry() {
    try {
      const { data, error } = await _sb.from('world_buildings')
        .select('member_id, country_id, building_id, level').eq('group_id', _groupId);
      if (error) throw error;
      return (typeof worldBuildingsByCountry === 'function') ? worldBuildingsByCountry(data || []) : {};
    } catch (e) { return {}; }
  }

  // ── Passiv-Einkommen prüfen und gutschreiben ─────────────────────────────────
  // worldRankMap optional durchreichen, um Doppel-Fetch zu sparen.
  // Braucht dieses Mitglied die Land-Gebäude-Daten (byCountry)? Ja bei eigenem Rang
  // (Welt-Einfluss-Gebäude) ODER wenn es eine Stille Anlage hält — deren Ertrag bemisst
  // sich seit dem Rework am Gebäude-Einkommen des Landes, also braucht auch ein reiner
  // Anleger ohne Rang die Gebäude-Daten (sonst Ertrag fälschlich 0).
  function _memberNeedsWorldBuildings(member, rankMap) {
    return Object.keys(rankMap || {}).length
      || (typeof worldPassiveTotal === 'function' && worldPassiveTotal(member) > 0);
  }

  async function _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry) {
    const _cosmP = member.cosmetics || {};
    let researchPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    let buildingPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    // 🧠 CIQ: Bohnen-Verständnis (+10% Forschung-Passiv), Großröster (+20% Gebäude-Passiv)
    if (typeof ciqResearchPassiveMult === 'function') researchPerDay = Math.round(researchPerDay * ciqResearchPassiveMult(_cosmP) * 100) / 100;
    if (typeof ciqBuildingPassiveMult === 'function') buildingPerDay = Math.round(buildingPerDay * ciqBuildingPassiveMult(_cosmP) * 100) / 100;
    const rankMap = worldRankMap || await _fetchWorldRankMap(memberId);
    const byCountry = worldByCountry || (_memberNeedsWorldBuildings(member, rankMap) ? await _fetchWorldBuildingsByCountry() : {});
    const _gm = _gardeMult(member);
    const worldPerDay = Math.round(((typeof calcWorldPerDay === 'function') ? calcWorldPerDay(rankMap) : 0) * _gm * 100) / 100;
    const worldBldPerDay = Math.round(((typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(rankMap, byCountry) : 0) * _gm * 100) / 100;
    const tradeBonus = await _allianceTradeBonus(rankMap, byCountry);
    const groupPerDay = (await _fetchGroupPerks()).perDay || 0; // Gruppenkasse-Passiv für alle
    const passiveInvestDay = (typeof worldPassivePerDay === 'function') ? worldPassivePerDay(member, byCountry) : 0; // 🏦 Stille Anlage
    const perDay = researchPerDay + buildingPerDay + worldPerDay + worldBldPerDay + tradeBonus.day + groupPerDay + passiveInvestDay;
    if (perDay <= 0) return { earned: 0, tradeBonusDay: 0 };

    const cosm = member.cosmetics || {};
    const lastClaim = cosm.lastPassiveClaim ? new Date(cosm.lastPassiveClaim) : new Date(member.joinDate || today());
    const hoursDiff = (Date.now() - lastClaim.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 1) return { earned: 0, tradeBonusDay: 0 }; // Max einmal pro Stunde

    const earned  = Math.round(perDay * (hoursDiff / 24) * 100) / 100;
    let capped    = Math.min(earned, perDay * 14); // Max 14 Tages-Passiv auf einmal (deckt Urlaub/längere Abwesenheit ab)
    // 🧠 CIQ Kaffeekartell (Selbst-Buff, 1h): alle eigenen CC-Einnahmen verdoppelt (auch Passiv).
    if (typeof ciqKartellMult === 'function') capped = Math.round(capped * ciqKartellMult(_cosmP) * 100) / 100;
    if (capped < 0.01) return { earned: 0, tradeBonusDay: 0 };

    await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: capped });
    const newCosmetics = { ...cosm, lastPassiveClaim: new Date().toISOString() };
    await _sb.from('members').update({ cosmetics: newCosmetics }).eq('id', memberId);
    return { earned: capped, tradeBonusDay: tradeBonus.day };
  }

  // ── 🏛️ Erbauer-Dividende (Welthandel) ────────────────────────────────────────
  // Wöchentlicher Fixbonus für jeden, der in einem Land gebaut hat — 15% der eigenen
  // Baukosten-Summe, UNABHÄNGIG vom aktuellen Rang (auch nach Verdrängung/Sabotage/Sturm).
  // Eigener 7-Tage-Timer (rollierend pro Mitglied), getrennt vom 1h-Passiv-Timer. Nutzt nur
  // bestehende RPCs (add_coins/save_map_data). Erstkontakt setzt nur den Zeitstempel, zahlt
  // nichts rückwirkend (kein Windfall beim Rollout).
  const WORLD_BUILDER_DIVIDEND_RATE = 0.15;
  const WORLD_BUILDER_DIVIDEND_INTERVAL = 7 * 86400000;

  async function _checkWorldBuilderDividend(memberId, member, worldByCountry) {
    if (typeof worldBuilderSpent !== 'function') return;              // world.js nicht geladen
    if (typeof canAccessWorldMap === 'function' && !canAccessWorldMap(member)) return;
    // WICHTIG: claimPassive lädt worldByCountry nur bei nicht-leerer rankMap. Ein aus ALLEN
    // Rängen verdrängter Erbauer hätte hier {} — genau der Fall, den die Dividende abdecken
    // soll. Darum byCountry nachladen, wenn leer (liefert alle Gruppen-Gebäude, rang-unabhängig).
    let byCountry = worldByCountry;
    if (!byCountry || !Object.keys(byCountry).length) byCountry = await _fetchWorldBuildingsByCountry();
    const spent = worldBuilderSpent(byCountry || {}, memberId);
    if (!spent) return;                                              // nichts gebaut → nichts zu tun
    // map_data frisch lesen — claimPassive hat evtl. gerade den Passiv-Tages-Log geschrieben;
    // stale member.map_data würde diesen Eintrag beim Merge clobbern.
    const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
    const md0 = (fresh && fresh.map_data) || member.map_data || {};
    const wd = md0.worldDividend || {};
    const now = Date.now();
    if (!wd.lastPaidAt) { // Erstkontakt: nur Startpunkt setzen, kein rückwirkender Bonus
      await updateMapData(memberId, { ...md0, worldDividend: { lastPaidAt: now, totalReceived: wd.totalReceived || 0 } });
      return;
    }
    if (now - wd.lastPaidAt < WORLD_BUILDER_DIVIDEND_INTERVAL) return; // Vorabprüfung (RPC prüft atomar erneut)
    const amount = Math.round(spent * WORLD_BUILDER_DIVIDEND_RATE * 100) / 100;
    if (amount < 1) { // zu klein — Zeitstempel trotzdem weiterschieben, kein Spam-Cent
      await updateMapData(memberId, { ...md0, worldDividend: { lastPaidAt: now, totalReceived: wd.totalReceived || 0 } });
      return;
    }
    // Atomare Auszahlung: claim_builder_dividend sperrt die Zeile, prüft die 7-Tage-Frist erneut
    // (schützt vor Cross-Device-Doppelzahlung) und schreibt Coins + Marker in EINEM Update — kein
    // Teilfehler-Fenster mehr (früher: erst add_coins, dann separat lastPaidAt → bei Fehler Re-Pay).
    let paid = false, viaRpc = false;
    try {
      const { data: res, error } = await _sb.rpc('claim_builder_dividend', {
        p_member_id: memberId, p_amount: amount, p_interval_ms: WORLD_BUILDER_DIVIDEND_INTERVAL
      });
      if (!error && res && typeof res.paid !== 'undefined') { viaRpc = true; paid = !!res.paid; }
    } catch (e) { /* RPC evtl. noch nicht migriert → Fallback unten */ }
    if (!viaRpc) {
      // Fallback (Backend noch nicht migriert): nicht-atomar wie zuvor.
      await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: amount });
      const newTotal = Math.round(((wd.totalReceived || 0) + amount) * 100) / 100;
      await updateMapData(memberId, { ...md0, worldDividend: { lastPaidAt: now, totalReceived: newTotal } });
      paid = true;
    }
    if (paid) {
      // Tages-Log frisch mergen — RPC/Fallback hat worldDividend + coins bereits geschrieben.
      try {
        const { data: f2 } = await _sb.from('members').select('map_data').eq('id', memberId).single();
        const md = appendTodayLog((f2 && f2.map_data) || md0, [{ label: '🏛️ Erbauer-Dividende', amount, cat: 'welt' }]);
        await updateMapData(memberId, md);
      } catch (e) { console.warn('Dividende-Tageslog konnte nicht gespeichert werden:', e); }
      if (typeof showToast === 'function') showToast(`🏛️ Erbauer-Dividende: +${amount} CC`, 'success');
    }
  }

  // ── 💹 Kaffeebörse: automatische Tages-Dividende ─────────────────────────────
  // Früher rein manuell (Klick auf „💰 Dividende"). Jetzt einmal pro Tag automatisch beim
  // Login/Poll — je nach fund.mode ausschüttend (aufs Guthaben) ODER thesaurierend
  // (reinvestiert ins principal bis FUND_MAX, Überschuss aufs Guthaben). KEIN Backlog:
  // pro Tag genau eine Gutschrift (lastDiv-Gate), verpasste Tage werden nicht nachgezahlt.
  // Nutzt die world.js-Globals _fundRate/_todayKeyW/FUND_MAX — WICHTIG: der Fonds-Tageskey
  // ist _todayKeyW() (de-DE-Format), NICHT das ISO-today() hier; sonst greift das lastDiv-Gate
  // nie und es würde bei jedem Aufruf erneut gezahlt. No-op ohne Fonds/ohne world.js.
  async function _checkAndClaimFundDividend(memberId, member) {
    if (typeof _fundRate !== 'function' || typeof _todayKeyW !== 'function' || typeof FUND_MAX === 'undefined') return;
    const fund0 = member.map_data?.worldDev?.fund;
    if (!fund0 || (fund0.principal || 0) < 1) return;
    const day = _todayKeyW();
    if (fund0.lastDiv === day) return;                       // Vorabprüfung — heute schon
    // map_data frisch lesen (gegen Clobbering durch zeitgleiche Writes) und Fonds-Update +
    // Tages-Log in EINEM Write mergen.
    const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
    const md0 = (fresh && fresh.map_data) || member.map_data || {};
    const f0  = (md0.worldDev && md0.worldDev.fund) || fund0;
    if (f0.lastDiv === day) return;                          // zwischenzeitlich schon (Race)
    const p0 = f0.principal || 0;
    if (p0 < 1) return;
    const mode = f0.mode || 'payout';
    const div  = Math.floor(p0 * _fundRate(memberId));
    const setFund = (fund, logs) => {
      const mdFund = { ...md0, worldDev: { ...(md0.worldDev || {}), fund } };
      return updateMapData(memberId, (logs && logs.length) ? appendTodayLog(mdFund, logs) : mdFund);
    };
    if (div < 1) { await setFund({ ...f0, lastDiv: day, mode }, null); return; } // zu klein → nur Marker
    if (mode === 'reinvest') {
      const room = Math.max(0, FUND_MAX - p0);
      const add  = Math.min(div, room);
      const overflow = div - add;                            // über FUND_MAX → aufs Guthaben
      if (overflow > 0) await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: overflow });
      const logs = [{ label: '💹 Börsen-Dividende (reinvestiert)', amount: add, detail: 'Kaffeebörse' }];
      if (overflow > 0) logs.push({ label: '💹 Börsen-Dividende', amount: overflow, detail: 'Kaffeebörse (über Max)' });
      await setFund({ ...f0, principal: p0 + add, lastDiv: day, mode }, logs);
    } else {
      await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: div });
      await setFund({ ...f0, principal: p0, lastDiv: day, mode }, [{ label: '💹 Börsen-Dividende', amount: div, detail: 'Kaffeebörse' }]);
    }
  }

  // ── Passives Einkommen EIGENSTÄNDIG einlösen (entkoppelt von Tassen) ──────────
  // Damit das passive Einkommen wirklich passiv ist: wird beim App-Start und
  // periodisch aufgerufen, nicht nur beim Tassen-Eintrag. Zeitbasiert (kein Cron),
  // _checkAndClaimPassive begrenzt selbst auf max. 1×/Stunde und 14 Tages-Passiv.
  // _passiveBusy verhindert, dass sich zwei eigene Aufrufe (Login + erster Poll)
  // überlappen und doppelt auszahlen.
  let _passiveBusy = false;
  async function claimPassive(memberId) {
    if (_passiveBusy || !memberId) return 0;
    _passiveBusy = true;
    try {
      const { data: raw } = await _sb.from('members').select('*').eq('id', memberId).single();
      if (!raw) return 0;
      const member = normalizeUser(raw);
      const worldRankMap = await _fetchWorldRankMap(memberId);
      const worldByCountry = _memberNeedsWorldBuildings(member, worldRankMap) ? await _fetchWorldBuildingsByCountry() : {};
      const { earned, tradeBonusDay } = await _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry);
      if (earned > 0) {
        // Tages-Log (Forschung / Gebäude / Welt / Handelsbündnis / Gruppenkasse anteilig + Quellen-Detail) — Fehler nicht eskalieren
        try {
          const gPerDay = (await _fetchGroupPerks()).perDay || 0;
          // map_data UNMITTELBAR vor dem Write frisch lesen und nur todayLog mergen:
          // sonst überschreibt ein zeitgleicher Gehalts-Snapshot (recordSalarySnapshotsAll
          // läuft ebenfalls bei showApp) den eben angehängten Passiv-Eintrag — und umgekehrt.
          // Das Write-Fenster schrumpft so auf einen RPC (wie in _writeSalaryPoint).
          const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
          const _pEntries = _passiveLogEntries(member, earned, worldRankMap, worldByCountry, gPerDay, tradeBonusDay);
          let md = appendTodayLog((fresh && fresh.map_data) || member.map_data, _pEntries);
          // 🤝 Lifetime-Zähler „aus Bündnissen erhalten" (passive Handelsdividende, ally:true).
          const _allyGain = _pEntries.reduce((s, e) => s + (e.ally ? (e.amount || 0) : 0), 0);
          if (_allyGain > 0) md = { ...md, allianceCcEarned: Math.round(((md.allianceCcEarned || 0) + _allyGain) * 100) / 100 };
          await updateMapData(memberId, md);
        } catch (e) { console.warn('Passiv-Log konnte nicht gespeichert werden:', e); }
      }
      // 🏛️ Erbauer-Dividende (eigener 7-Tage-Timer) — NACH der Passiv-Gutschrift, damit ein
      // Fehler hier nie das normale Passiv-Einkommen blockiert. Läuft auch, wenn earned==0.
      try {
        await _checkWorldBuilderDividend(memberId, member, worldByCountry);
      } catch (e) { console.warn('Erbauer-Dividende fehlgeschlagen (nicht kritisch):', e.message); }
      // 💹 Kaffeebörse: automatische Tages-Dividende (ausschüttend/thesaurierend) — auch bei earned==0.
      try {
        await _checkAndClaimFundDividend(memberId, member);
      } catch (e) { console.warn('Börsen-Dividende fehlgeschlagen (nicht kritisch):', e.message); }
      // 🤝 Kaffee-Kredit: 25 % des Passiv-Einkommens tilgen (No-op ohne aktiven Kredit).
      if (earned > 0) await applyLoanRepayment(memberId, earned);
      return earned;
    } catch (e) {
      console.warn('claimPassive fehlgeschlagen:', e.message);
      return 0;
    } finally {
      _passiveBusy = false;
    }
  }

  // ── Täglicher Login-Bonus ────────────────────────────────────────────────────
  // Eskaliert mit der Login-Serie (loginBonusFor in research.js), gedeckelt. Idempotent
  // pro Tag über map_data.loginBonus = { lastDate, streak }. Kein Cron — beim App-Start
  // eingelöst. Gibt { reward, streak } oder 0 (heute schon eingelöst / Fehler) zurück.
  async function claimLoginBonus(memberId) {
    if (!memberId) return 0;
    try {
      const { data: raw } = await _sb.from('members').select('map_data, cosmetics').eq('id', memberId).single();
      const md  = (raw && raw.map_data) || {};
      const lb  = md.loginBonus || {};
      const day = today();
      if (lb.lastDate === day) return 0; // heute bereits eingelöst
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yStr   = y.toISOString().slice(0, 10);
      const streak = (lb.lastDate === yStr) ? ((lb.streak || 0) + 1) : 1; // Lücke → Serie startet neu
      let reward = (typeof loginBonusFor === 'function') ? loginBonusFor(streak) : Math.min(5 + (streak - 1) * 2, 25);
      // 🧠 CIQ Wachmacher: Login-Bonus ×2
      if (typeof ciqRewardMult === 'function') reward = Math.round(reward * ciqRewardMult((raw && raw.cosmetics) || {}));
      await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: reward });
      const md2 = appendTodayLog({ ...md, loginBonus: { lastDate: day, streak } },
                    [{ label: `📅 Login-Bonus (Tag ${streak})`, amount: reward, cat: 'boni' }]);
      await updateMapData(memberId, md2);
      return { reward, streak };
    } catch (e) { console.warn('Login-Bonus fehlgeschlagen:', e.message); return 0; }
  }

  // ── Kaffee-Tagesaufgabe einlösen (Goodwill) ──────────────────────────────────
  // Eine rotierende Aufgabe je 3-Tage-Periode (currentDailyTask in research.js).
  // Idempotent pro Periode über map_data.taskClaims[periodKey]. Reine Ehrensache —
  // die Gruppe kontrolliert sich selbst. Bringt zusätzlich CC in Umlauf.
  async function claimDailyTask(memberId, periodKey, taskId, reward) {
    if (!memberId || !periodKey) return { error: 'bad_args' };
    try {
      const { data: raw } = await _sb.from('members').select('map_data, name, cosmetics').eq('id', memberId).single();
      const md     = (raw && raw.map_data) || {};
      const claims = { ...(md.taskClaims || {}) };
      if (claims[periodKey]) return { already: true };
      claims[periodKey] = { taskId, at: new Date().toISOString() };
      // alte Perioden beschneiden (nur die letzten ~12 behalten)
      const keys = Object.keys(claims).sort();
      while (keys.length > 12) delete claims[keys.shift()];
      let amt = Math.max(0, parseFloat(reward) || 0);
      // 🧠 CIQ Wachmacher: Tagesaufgaben-Belohnung ×2
      if (typeof ciqRewardMult === 'function') amt = Math.round(amt * ciqRewardMult((raw && raw.cosmetics) || {}));
      if (amt > 0) await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: amt });
      const md2 = appendTodayLog({ ...md, taskClaims: claims },
                    [{ label: '✨ Kaffee-Aufgabe', amount: amt, cat: 'boni' }]);
      await updateMapData(memberId, md2);
      // Erst bei ERFÜLLUNG in den Chat posten (nicht beim Login) — Name + Aufgabe.
      try {
        const t = (typeof currentDailyTask === 'function') ? currentDailyTask(undefined, memberId).task : null;
        const desc = t ? `${t.icon} ${t.text}` : 'ihre Kaffee-Aufgabe';
        await postMessage(`✅ ${raw?.name || 'Jemand'} hat die Kaffee-Aufgabe erfüllt: ${desc} (+${amt} CC)`, 'Kaffee-Aufgabe');
      } catch (e) { /* Chat-Fehler darf die Gutschrift nicht beeinträchtigen */ }
      return { ok: true, reward: amt };
    } catch (e) { console.warn('Tagesaufgabe fehlgeschlagen:', e.message); return { error: e.message }; }
  }

  // ── Gehalts-Snapshot (für das 💰 Gehalts-Liniendiagramm) ─────────────────────
  // Misst den aktuellen Verdienst (passives Tages-Gehalt aus allen Quellen +
  // pro-Tasse-Ertrag + Guthaben) und legt ihn in map_data.salaryHistory ab. Kein
  // Schema-Change (JSONB existiert). Statt 1×/Tag jetzt im 5h-Raster: pro 5h-Bucket
  // höchstens ein Punkt (idempotent — ein erneuter Lauf im selben Fenster überschreibt
  // den Bucket), max. 120 Punkte (~25 Tage). Schreibt über die save_map_data-RPC
  // (nicht per direktem .update() — das gab beim Karten-Feature 401-Fehler).
  const SALARY_BUCKET_MS = 5 * 60 * 60 * 1000; // 5h-Raster

  function _salaryBucket(ts) {
    return Math.floor((ts || Date.now()) / SALARY_BUCKET_MS) * SALARY_BUCKET_MS;
  }

  // Verdienst eines (bereits normalisierten) Members berechnen. byCountry + perks sind
  // gruppenweit identisch → einmal vorab laden und durchreichen spart Queries beim
  // Snapshotten aller Mitglieder. rankMap ist pro Member (Welt-Ränge/Sabotage).
  async function _computeSalary(member, byCountry, perks) {
    const research  = member.research || {};
    const rankMap   = await _fetchWorldRankMap(member.id);
    const bc        = byCountry || (_memberNeedsWorldBuildings(member, rankMap) ? await _fetchWorldBuildingsByCountry() : {});
    const pk        = perks || await _fetchGroupPerks();
    const gm        = _gardeMult(member);
    const tradeBonus = await _allianceTradeBonus(rankMap, bc);

    const resDay = (typeof calcResearchPerDay === 'function')      ? calcResearchPerDay(research) : 0;
    const bldDay = (typeof calcBuildingPerDay === 'function')      ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const wDay   = (typeof calcWorldPerDay === 'function')         ? calcWorldPerDay(rankMap) * gm : 0;
    const wbDay  = (typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(rankMap, bc) * gm : 0;
    const pInvDay = (typeof worldPassivePerDay === 'function') ? worldPassivePerDay(member, bc) : 0; // 🏦 Stille Anlage
    const perDay = Math.round((resDay + bldDay + wDay + wbDay + tradeBonus.day + (pk.perDay || 0) + pInvDay) * 100) / 100;

    const resCup = (typeof calcResearchPerCup === 'function')      ? calcResearchPerCup(research) : 0;
    const wCup   = (typeof calcWorldPerCup === 'function')         ? calcWorldPerCup(rankMap) * gm : 0;
    const wbCup  = (typeof calcWorldBuildingPerCup === 'function') ? calcWorldBuildingPerCup(rankMap, bc) * gm : 0;
    const perCup = Math.round((resCup + wCup + wbCup + tradeBonus.cup + (pk.perCup || 0)) * 100) / 100;

    // Realisiertes Gesamteinkommen HEUTE (alle Quellen: Tassen, Schätze, Forschung,
    // Welt, Login, Aufgaben …) — jetzt über dayStats() aus der eigenen day_stats-Spalte,
    // damit ein veralteter Client-Write den Tageswert nicht mehr zurückdrehen kann.
    const ds    = dayStats(member);
    // NET = realisiertes Tages-Einkommen MINUS KONSUM-Ausgaben (negative Log-Einträge, z.B. Tränke,
    // Reparatur, Steuer-Events, Strafen) = das „erweiterte Tages-Gehalt" für das Chart (Transparenz).
    // Investitionen (invest:true — Forschung, Karte/Gebäude, Welthandel, Krieger-Ausrüstung) zählen
    // NICHT ins Netto: sie mindern nicht das Gehalt, sondern wandern ins Gesamtvermögen (JP 2026-07-11).
    const gross = ds.gross;
    const net   = ds.net;

    return { day: perDay, cup: perCup, coins: Math.round(member.coins || 0), gross, net };
  }

  // Snapshot-Punkt schreiben — liest map_data UNMITTELBAR vor dem Write frisch und
  // merged nur salaryHistory darauf. So kann das Snapshotten fremder Mitglieder keine
  // zeitgleiche map_data-Änderung (Schatzfund, Bau, Karten-Fortschritt) überschreiben:
  // das Write-Fenster schrumpft auf einen RPC. 5h-Bucket, idempotent (überschreibt den
  // laufenden Bucket), Legacy-{d:'YYYY-MM-DD'} wird über Mitternacht auf ts gemappt, max 120.
  // Gestufte Auflösung, damit die GESAMTE Spielzeit erhalten bleibt (nicht nur ein
  // rollender Ausschnitt), ohne dass die History unbegrenzt wächst:
  //   < 3 Tage  : alle 5h-Punkte (Feindetail)
  //   3–30 Tage : 1 Punkt/Tag   (jüngster des Tages)
  //   > 30 Tage : 1 Punkt/Woche (jüngster der Woche)
  // Ergebnis: ~90 Punkte/Jahr, voller Langzeit-Trend + aktuelles Detail. Safety-Cap 400.
  function _salaryTsOf(h) { return h.ts || (h.d ? new Date(h.d + 'T00:00:00').getTime() : 0); }
  function _pruneSalaryHistory(hist, nowTs) {
    const now = nowTs || Date.now();
    const DAY = 86400000;
    const sorted = (hist || []).filter(h => _salaryTsOf(h) > 0).sort((a, b) => _salaryTsOf(a) - _salaryTsOf(b));
    const recent = [];
    const buckets = new Map(); // key → Punkt; aufsteigend sortiert → behält den jüngsten je Bucket
    for (const h of sorted) {
      const ts = _salaryTsOf(h);
      const age = now - ts;
      if (age < 3 * DAY) { recent.push(h); continue; }
      const key = age < 30 * DAY ? 'd' + Math.floor(ts / DAY) : 'w' + Math.floor(ts / (7 * DAY));
      buckets.set(key, h);
    }
    return [...buckets.values(), ...recent].sort((a, b) => _salaryTsOf(a) - _salaryTsOf(b)).slice(-400);
  }

  async function _writeSalaryPoint(memberId, sal) {
    const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
    const md0    = (fresh && fresh.map_data) || {};
    const bucket = _salaryBucket();
    const hist   = Array.isArray(md0.salaryHistory) ? md0.salaryHistory.slice() : [];
    const entry  = { ts: bucket, day: sal.day, cup: sal.cup, coins: sal.coins, gross: sal.gross, net: sal.net };
    const idx    = hist.findIndex(h => _salaryTsOf(h) === bucket);
    if (idx >= 0) hist[idx] = entry; else hist.push(entry);
    await updateMapData(memberId, { ...md0, salaryHistory: _pruneSalaryHistory(hist) });
  }

  async function recordSalarySnapshot(memberId) {
    if (!memberId) return;
    try {
      const { data: raw } = await _sb.from('members').select('*').eq('id', memberId).single();
      if (!raw) return;
      const sal = await _computeSalary(normalizeUser(raw));
      await _writeSalaryPoint(memberId, sal);
    } catch (e) { console.warn('Gehalts-Snapshot fehlgeschlagen:', e.message); }
  }

  // ALLE Gruppenmitglieder snapshotten — damit das Gehalts-Chart die ganze Gruppe
  // abbildet, nicht nur, wer die App zuletzt geöffnet hat. Clientseitig auf 1×/5h-Bucket
  // gedrosselt (_lastSalaryAllBucket); die Bucket-Idempotenz im Datensatz fängt parallele
  // Clients zusätzlich ab. Gruppenweite Daten (byCountry/perks) werden einmal geladen.
  let _lastSalaryAllBucket = 0;
  async function recordSalarySnapshotsAll() {
    const bucket = _salaryBucket();
    if (_lastSalaryAllBucket === bucket) return; // in diesem 5h-Fenster schon gelaufen
    _lastSalaryAllBucket = bucket;
    try {
      const { data: rows } = await _sb.from('members').select('*').eq('group_id', _groupId);
      if (!rows || !rows.length) { _lastSalaryAllBucket = 0; return; }
      const byCountry = await _fetchWorldBuildingsByCountry();
      const perks     = await _fetchGroupPerks();
      for (const raw of rows) {
        try {
          const sal = await _computeSalary(normalizeUser(raw), byCountry, perks);
          await _writeSalaryPoint(raw.id, sal);
        } catch (e) { /* einzelnes Mitglied überspringen, Lauf nicht abbrechen */ }
      }
    } catch (e) { console.warn('Gehalts-Snapshots (alle) fehlgeschlagen:', e.message); _lastSalaryAllBucket = 0; }
  }

  // ── Tassen eintragen ─────────────────────────────────────────────────────────
  async function addCups(memberId, amount) {
    amount = parseInt(amount);
    if (isNaN(amount) || amount < 1) throw new Error('Ungültige Menge');
    const now      = new Date();
    const hour     = now.getHours();
    const dateStr  = today();
    const monthStr = getSeasonId();

    // Member laden
    const { data: rawMember, error: mErr } = await _sb.from('members').select('*').eq('id', memberId).single();
    if (mErr || !rawMember) throw new Error('Mitglied nicht gefunden');

    // Tageslimit prüfen: normal 15 Tassen/Tag — aber wenn gestern über der Rot-Flaggen-
    // Schwelle getrunken wurde, ist heute eine Koffein-Red-Flag aktiv (map_data.caffeineFlag
    // === heute) → gedrosselt. Schwelle (normal 6) und Drosselung (normal 3) sind über die
    // CIQ-Fähigkeit Koffein-Toleranz anpassbar (2026-07-04 Redesign: echte Toleranz statt
    // Komplett-Immunität — siehe ciqCaffeineFlagThreshold/-Cap in research.js).
    const { data: todayStats } = await _sb.from('daily_stats').select('*')
      .eq('group_id', _groupId).eq('date', dateStr).maybeSingle();
    const alreadyToday = (todayStats?.stats || {})[memberId] || 0;
    const _cosm  = rawMember.cosmetics || {};
    const _nowMs = now.getTime();
    const flagThreshold = (typeof ciqCaffeineFlagThreshold === 'function') ? ciqCaffeineFlagThreshold(_cosm, _nowMs) : 6;
    const flagCap        = (typeof ciqCaffeineFlagCap === 'function') ? ciqCaffeineFlagCap(_cosm, _nowMs) : 3;
    const caffeineActive = rawMember.map_data?.caffeineFlag === dateStr;
    let dailyMax = caffeineActive ? flagCap : 15;
    if (!caffeineActive && typeof ciqDailyMax === 'function') dailyMax = ciqDailyMax(_cosm, _nowMs);
    else if (caffeineActive && typeof ciqActive === 'function' && ciqActive(_cosm, 'schwarzbrenner', _nowMs)) dailyMax = 9999;
    if (alreadyToday + amount > dailyMax) {
      throw new Error(caffeineActive
        ? `🚩 Koffein-Limit aktiv: wegen zu viel Koffein gestern heute nur ${dailyMax} Tassen (bereits ${alreadyToday} erfasst).`
        : `Tageslimit erreicht: heute bereits ${alreadyToday} von ${dailyMax} Tassen erfasst.`);
    }
    // Red-Flag für MORGEN: wer heute mit diesem Eintrag über die Schwelle kommt, wird morgen
    // gedrosselt (einmal pro Tag setzen, nicht bei jeder weiteren Tasse neu).
    const personalToday = alreadyToday + amount;
    const tomorrowStr   = new Date(Date.parse(dateStr + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const caffeineRedFlag = personalToday > flagThreshold && rawMember.map_data?.caffeineFlag !== tomorrowStr;
    const caffeineMsg = (caffeineRedFlag && typeof caffeineFlagMsg === 'function') ? caffeineFlagMsg(personalToday) : '';

    const member    = normalizeUser(rawMember);
    const activeDays = [...(member.activeDays || [])];
    if (!activeDays.includes(dateStr)) activeDays.push(dateStr);
    if (activeDays.length > 400) activeDays.splice(0, activeDays.length - 400);

    const newTotal     = member.totalCups + amount;
    const newStreak    = calcStreak(activeDays);
    const newMaxStreak = Math.max(member.maxStreak, newStreak);
    const seasonCups   = { ...member.seasonCups, [monthStr]: (member.seasonCups[monthStr] || 0) + amount };

    const updatedMember = { ...member, totalCups: newTotal, currentStreak: newStreak, maxStreak: newMaxStreak, seasonCups, activeDays };

    // Achievements prüfen — neue Einsteiger-Achievements werden für Bestandsspieler beim
    // nächsten Eintrag regulär freigeschaltet UND ausgezahlt (bewusst kein Grandfathering:
    // alle sollen profitieren, fair + bringt zusätzlich CC in Umlauf).
    const { unlocked: inputUnlocked, newAch: inputAch } = checkInputAchievements(amount, hour, updatedMember);
    const milestoneUnlocked = checkAchievements(updatedMember, inputAch);
    const allNew = [...inputUnlocked, ...milestoneUnlocked].filter(Boolean);
    const achievements = { ...(member.achievements || {}), ...inputAch };
    for (const a of milestoneUnlocked) achievements[a.id] = true;

    // Ranglisten-Achievements werden bei Saison-Ende vergeben (nicht hier)

    // Member updaten (current_streak wird separat atomar via claim_streak_bonus gesetzt, s.u.)
    await _sb.from('members').update({
      total_cups: newTotal,
      max_streak: newMaxStreak, last_active: dateStr,
      active_days: activeDays, season_cups: seasonCups, achievements
    }).eq('id', memberId);

    // Entry einfügen
    const { error: entryErr } = await _sb.from('entries').insert({ group_id: _groupId, member_id: memberId, amount, date: dateStr });
    if (entryErr) throw new Error(entryErr.message);

    // Daily stats upsert
    const newDayTotal = (todayStats?.total || 0) + amount;
    const newStats    = { ...(todayStats?.stats || {}), [memberId]: ((todayStats?.stats || {})[memberId] || 0) + amount };
    await _sb.from('daily_stats').upsert({ group_id: _groupId, date: dateStr, total: newDayTotal, stats: newStats }, { onConflict: 'group_id,date' });

    // 25 Tassen/Woche (pro Person) → witziger „spende mal echten Kaffee"-Aufruf im Chat
    // (einmal pro ISO-Woche, idempotent über map_data.coffeeDonateWeek). Reiner Gag/Goodwill.
    let donateGag = false;
    const isoWk = (typeof isoWeekKey === 'function') ? isoWeekKey(dateStr) : null;
    if (isoWk && rawMember.map_data?.coffeeDonateWeek !== isoWk) {
      try {
        const d = new Date(dateStr + 'T00:00:00Z');
        const dow = (d.getUTCDay() + 6) % 7; // Mo=0
        const monday = new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
        const { data: weekRows } = await _sb.from('daily_stats').select('stats')
          .eq('group_id', _groupId).gte('date', monday).lte('date', dateStr);
        const weekCups = (weekRows || []).reduce((s, r) => s + ((r.stats || {})[memberId] || 0), 0);
        donateGag = weekCups >= 25;
      } catch (e) { donateGag = false; }
    }

    // Hall of Fame
    const { data: hof } = await _sb.from('hall_of_fame').select('*').eq('group_id', _groupId).maybeSingle();
    const hofUpdates = { group_id: _groupId };
    if (!hof?.max_cups_value || newTotal > (hof.max_cups_value || 0)) {
      hofUpdates.max_cups_value = newTotal; hofUpdates.max_cups_name = member.name;
    }
    if (!hof?.longest_streak_value || newMaxStreak > (hof.longest_streak_value || 0)) {
      hofUpdates.longest_streak_value = newMaxStreak; hofUpdates.longest_streak_name = member.name;
    }
    await _sb.from('hall_of_fame').upsert({ ...(hof || {}), ...hofUpdates }, { onConflict: 'group_id' });

    // Saison sicherstellen
    await ensureSeason();

    // ── CoffeeCoins berechnen ─────────────────────────────────────────────────
    const baseCoins    = amount * 2;
    const morningBonus = (hour >= 5 && hour < 10) ? amount * 1 : 0; // Morgenröte-Bonus
    let researchBonus = (typeof calcResearchPerCup === 'function')
      ? Math.round(amount * calcResearchPerCup(member.research) * 100) / 100
      : 0;
    // 🧠 CIQ Reputationsangriff (Fremd-Debuff): −10 % Forschungs-CC/Tasse-Bonus für 4h.
    if (typeof ciqDebuffActive === 'function' && ciqDebuffActive(member.map_data, 'reputationsangriff')) {
      researchBonus = Math.round(researchBonus * 0.9 * 100) / 100;
    }
    // Welt-Einfluss-Bonus pro Tasse (eigene Länder-Ränge + rangabhängige Land-Gebäude) — robust, 0 falls Backend fehlt
    const worldRankMap = await _fetchWorldRankMap(memberId);
    const worldByCountry = _memberNeedsWorldBuildings(member, worldRankMap) ? await _fetchWorldBuildingsByCountry() : {};
    const worldPerCupBase = Math.round((((typeof calcWorldPerCup === 'function' ? calcWorldPerCup(worldRankMap) : 0)
                      + (typeof calcWorldBuildingPerCup === 'function' ? calcWorldBuildingPerCup(worldRankMap, worldByCountry) : 0))
                      * _gardeMult(member)) * 100) / 100;
    const tradeBonus = await _allianceTradeBonus(worldRankMap, worldByCountry);
    const worldBonus = Math.round(amount * worldPerCupBase * 100) / 100;
    // 🤝 Handelsbündnis separat gehalten (statt in worldPerCup gemischt), damit es im
    // Tages-Log als eigene Zeile erscheint statt still im Welt-Einfluss unterzugehen.
    const allianceCupBonus = Math.round(amount * tradeBonus.cup * 100) / 100;
    // Gruppenkasse-Bonus pro Tasse (freigeschaltete Gruppen-Ziele) — wirkt für alle gleich
    const groupPerks = await _fetchGroupPerks();
    const groupBonus = Math.round(amount * (groupPerks.perCup || 0) * 100) / 100;
    let achCoinTotal = 0;
    for (const a of allNew) achCoinTotal += (a.coinReward || 0);

    // Streak-Meilenstein Coins — current_streak wird atomar via DB-RPC gesetzt UND
    // geprüft (claim_streak_bonus, SQL: migration_2026-06-18_atomic_streak_bonus.sql).
    // Verhindert Doppel-Auszahlung bei nahezu gleichzeitigen Tassen-Eintragungen:
    // ein lokaler Vergleich (newStreak > member.currentStreak) reicht nicht, weil
    // zwei parallele Requests beide noch den alten Wert lesen könnten.
    let streakBonus = 0;
    let streakClaimed = false;
    try {
      const { data, error } = await _sb.rpc('claim_streak_bonus', { p_member_id: memberId, p_new_streak: newStreak });
      if (error) throw error;
      streakClaimed = !!data;
    } catch (e) {
      console.warn('claim_streak_bonus RPC fehlgeschlagen (SQL-Migration ausgeführt?), Fallback ohne Bonus:', e.message);
      // Fallback: current_streak trotzdem persistieren (sonst bleibt der Wert stehen), aber kein Bonus
      await _sb.from('members').update({ current_streak: newStreak }).eq('id', memberId);
    }
    if (streakClaimed) {
      if (newStreak >= 5   && newStreak % 5  === 0 && newStreak < 20)  streakBonus = 100;
      if (newStreak >= 20  && newStreak % 20 === 0 && newStreak < 100) streakBonus = 400;
      if (newStreak >= 100 && newStreak % 100 === 0)                    streakBonus = 2000;
    }

    // 🧠 CIQ-Fähigkeiten: zusätzliche CC auf diesen Tassen-Eintrag (Gedächtnis/Espresso/Schwarm/Erntehelfer/Schwarzbrenner)
    let ciqBonus = 0, ciqDetail = '';
    if (typeof ciqCupBonus === 'function') {
      const _activeMembers = Object.keys(newStats || {}).length;
      const _blds = member.map_data?.buildings || {};
      const _buildingCount = Object.values(_blds).filter(b => b && (b.completesAt || 0) <= _nowMs).length;
      const _ctx = { cupIncome: baseCoins + morningBonus + researchBonus + worldBonus + allianceCupBonus + groupBonus, amount, activeMembers: _activeMembers, buildingCount: _buildingCount, now: _nowMs };
      ciqBonus = ciqCupBonus(_cosm, _ctx);
      if (ciqBonus > 0 && typeof ciqCupBonusDetail === 'function') ciqDetail = ciqCupBonusDetail(_cosm, _ctx);
    }

    // 🧠 CIQ Kaffeekartell (Selbst-Buff, 1h): alle eigenen CC-Einnahmen verdoppelt.
    // Einmal hier berechnet, weil dieselbe Zahl gleich NOCHMAL beim Tages-Log gebraucht
    // wird (siehe unten) — sonst würden die Log-Zeilen nur die HALBE totalCoins-Summe
    // ausweisen, die tatsächlich gutgeschrieben wird.
    const kartellMult = (typeof ciqKartellMult === 'function') ? ciqKartellMult(_cosm) : 1;
    let totalCoins = baseCoins + morningBonus + researchBonus + worldBonus + allianceCupBonus + groupBonus + achCoinTotal + streakBonus + ciqBonus;
    if (kartellMult > 1) totalCoins = Math.round(totalCoins * kartellMult * 100) / 100;

    if (totalCoins > 0) {
      const { error: coinErr } = await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: totalCoins });
      if (coinErr) { console.error('add_coins fehlgeschlagen:', coinErr.message); totalCoins = 0; }
    }
    // Eigene Tasse: alle ANDEREN Mitspieler mit der Kombo erhalten +1 CC pro 10 Tassen
    payEigeneTasseGroup(memberId, amount).catch(() => {});

    // Passiv-Einkommen prüfen (Welt-Ränge + Gebäude wiederverwenden, kein Doppel-Fetch)
    const { earned: passiveEarned, tradeBonusDay: passiveTradeBonusDay } = await _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry);

    // 🚩 Koffein-Strafe an die Gruppenkasse — einmal beim Überschreiten von 6 Tassen.
    // Maßvoll (max. 15 CC) und aufs verfügbare Guthaben gedeckelt (nie Minus).
    const caffeinePenalty = caffeineRedFlag
      ? Math.min(15, Math.max(0, Math.floor((member.coins || 0) + totalCoins)))
      : 0;

    // 📅 Wochenend-Abgabe: Wer am Wochenende Tassen sammelt, muss GENAU den Betrag, den
    // er für diese Tassen bekommen hat (Basis + Boni pro Tasse, ohne Meilenstein-/Streak-CC),
    // an die Gruppenkasse abgeben → Tassen sammeln am Wochenende lohnt sich netto nicht.
    // Aufs verfügbare Guthaben gedeckelt (nie Minus, berücksichtigt eine evtl. Koffein-Strafe).
    const isWeekend = (now.getDay() === 0 || now.getDay() === 6); // So=0, Sa=6 (Ortszeit)
    const weekendCupIncome = Math.round((baseCoins + morningBonus + researchBonus + worldBonus + allianceCupBonus + groupBonus) * 100) / 100;
    const weekendLevy = isWeekend
      ? Math.round(Math.max(0, Math.min(weekendCupIncome, (member.coins || 0) + totalCoins - caffeinePenalty)) * 100) / 100
      : 0;

    // Tages-Log aktualisieren (woher kamen die Coins?) — Fehler hier dürfen den Tassen-Eintrag nicht blockieren
    try {
      const logEntries = [];
      // Kartell-Faktor auf jede Tassen-Einnahme-Zeile anwenden — genau die Komponenten,
      // die auch in totalCoins oben einfließen (Achievements/Streak eingeschlossen,
      // die werden von der RPC ebenfalls verdoppelt gutgeschrieben).
      const k = amt => kartellMult > 1 ? Math.round(amt * kartellMult * 100) / 100 : amt;
      if (baseCoins + morningBonus > 0) {
        logEntries.push({ label: amount > 1 ? `☕ ${amount} Tassen` : '☕ Tasse', amount: k(Math.round((baseCoins + morningBonus) * 100) / 100), cat: 'tassen' });
      }
      if (researchBonus > 0) {
        const detail = (typeof researchPerCupDetail === 'function')
          ? researchPerCupDetail(member.research, amount, calcResearchPerCup(member.research)) : '';
        logEntries.push({ label: '🔬 Forschung', amount: k(researchBonus), cat: 'forschung', detail });
      }
      if (worldBonus > 0) {
        const detail = (typeof worldPerCupDetail === 'function')
          ? `${amount}× à ${worldPerCupBase}/Tasse · ${worldPerCupDetail(worldRankMap, worldByCountry)}` : '';
        logEntries.push({ label: '🌍 Welt-Einfluss', amount: k(worldBonus), cat: 'welt', detail });
      }
      if (allianceCupBonus > 0) {
        logEntries.push({ label: '🤝 Handelsdividende', amount: k(allianceCupBonus), cat: 'welt', ally: true, detail: `${amount}× à ${tradeBonus.cup}/Tasse · +10% aus dem Partner-Land` });
      }
      if (groupBonus > 0) {
        logEntries.push({ label: '🏛️ Gruppenkasse', amount: k(groupBonus), cat: 'gruppe', detail: `${amount}× à ${groupPerks.perCup}/Tasse (Gruppen-Effekt)` });
      }
      for (const a of allNew) {
        if (a?.coinReward) logEntries.push({ label: `🏆 ${a.name || a.id}`, amount: k(a.coinReward), cat: 'boni' });
      }
      if (streakBonus > 0) logEntries.push({ label: `🔥 Streak ${newStreak}`, amount: k(streakBonus), cat: 'boni' });
      if (ciqBonus > 0)    logEntries.push({ label: '🧠 CIQ-Fähigkeit', amount: k(ciqBonus), cat: 'ciq', detail: ciqDetail });
      if (kartellMult > 1) logEntries.push({ label: '👑 Kaffeekartell aktiv', amount: 0, detail: 'Alle Tassen-Einnahmen oben bereits ×2 gerechnet' });
      if (caffeinePenalty > 0) logEntries.push({ label: '🚩 Koffein-Strafe → Gruppenkasse', amount: -caffeinePenalty, cat: 'strafen' });
      if (weekendLevy > 0)     logEntries.push({ label: '📅 Wochenend-Abgabe → Gruppenkasse', amount: -weekendLevy, cat: 'strafen' });
      if (passiveEarned > 0) {
        for (const e of _passiveLogEntries(member, passiveEarned, worldRankMap, worldByCountry, groupPerks.perDay, passiveTradeBonusDay)) logEntries.push(e);
      }

      let md = member.map_data || {};
      if (logEntries.length) md = appendTodayLog(md, logEntries);
      // 🤝 Lifetime-Zähler „aus Bündnissen erhalten" (Handelsdividende, ally:true) — für den Informant.
      const _allyGain = logEntries.reduce((s, e) => s + (e.ally ? (e.amount || 0) : 0), 0);
      if (_allyGain > 0) md = { ...md, allianceCcEarned: Math.round(((md.allianceCcEarned || 0) + _allyGain) * 100) / 100 };
      if (caffeineRedFlag)   md = { ...md, caffeineFlag: tomorrowStr }; // morgen Drosselung auf 3
      if (donateGag)         md = { ...md, coffeeDonateWeek: isoWk };   // Wochen-Gag 1×/Woche
      if (logEntries.length || caffeineRedFlag || donateGag) await updateMapData(memberId, md);
    } catch (e) { console.warn('Tages-Log konnte nicht gespeichert werden:', e); }

    // 🚩 Koffein-Red-Flag: Strafe an die Gruppenkasse + witzige Chat-Ankündigung (einmal)
    let caffeinePaid = 0;
    if (caffeineRedFlag) {
      if (caffeinePenalty > 0) {
        try {
          const left = await spendCoins(memberId, caffeinePenalty);
          if (left !== null && left !== undefined) {
            // Strafe in die Gruppenkasse: Balance erhöhen, unter reserviertem _-Key (zählt
            // NICHT als „Wohltäter"-Beitrag und nicht zur Kassen-Stufe — ist ja eine Strafe).
            const t = await fetchTreasury();
            const contribs = { ...(t.contributions || {}) };
            contribs._penalties = Math.round(((parseFloat(contribs._penalties) || 0) + caffeinePenalty) * 100) / 100;
            const newBal = Math.round(((parseFloat(t.balance) || 0) + caffeinePenalty) * 100) / 100;
            await _sb.from('group_treasury').upsert(
              { group_id: _groupId, balance: newBal, contributions: contribs, unlocked_goals: t.unlocked_goals || {} },
              { onConflict: 'group_id' });
            caffeinePaid = caffeinePenalty;
          }
        } catch (e) { console.warn('Koffein-Strafe fehlgeschlagen:', e.message); }
      }
      const strafe = caffeinePaid > 0
        ? ` 💸 Strafe: ${caffeinePaid} CC in die Gruppenkasse — alle müssen darunter leiden, wenn du zu zappelig bist!`
        : '';
      try { await postMessage(`🚩 ${member.name}: ${caffeineMsg}${strafe}`, 'Koffein-Polizei'); } catch (e) {}
    }

    // 📅 Wochenend-Abgabe: genau der Tassen-Betrag wandert in die Gruppenkasse + lustige Mahnung
    if (isWeekend && weekendLevy > 0) {
      try {
        const left = await spendCoins(memberId, weekendLevy);
        if (left !== null && left !== undefined) {
          await addPenaltyToTreasury(weekendLevy); // unter _penalties-Key (kein Wohltäter/keine Kassen-Stufe)
          const WEEKEND_MSGS = [
            'Wochenende! Der Kaffee läuft dir nicht weg — gönn dir mal eine Pause. ☕😴',
            'Am Wochenende wird nicht gegrindet, Kollege!',
            'Work-Life-Balance! Wochenend-Tassen teilst du gefälligst mit der Gruppe.',
            'Samstags-/Sonntagskaffee ist Luxus — den spendierst du der Gruppenkasse!'
          ];
          const spruch = WEEKEND_MSGS[Math.floor(Math.random() * WEEKEND_MSGS.length)];
          try { await postMessage(`📅 ${member.name}: ${spruch} 💸 ${weekendLevy} CC wandern dafür in die Gruppenkasse!`, 'Work-Life-Balance-Polizei'); } catch (e) {}
        }
      } catch (e) { console.warn('Wochenend-Abgabe fehlgeschlagen:', e.message); }
    }

    // ☕ 25 Tassen/Woche → witziger „echten Kaffee spenden"-Aufruf im Chat (1×/Woche, Goodwill)
    if (donateGag) {
      try { await postMessage(`☕ ${member.name}: 25 Tassen die Woche — da musst du mal neuen Kaffee spenden! (in echt 😉)`, 'Kaffee-Kasse'); } catch (e) {}
    }

    // 🤝 Kaffee-Kredit: 25 % des heutigen Gehalts-Einkommens (Tassen + Passiv) automatisch
    // tilgen, falls der Schuldner einen aktiven Kredit hat. No-op sonst. NACH allen
    // map_data-Writes oben (Server-Log der RPC wird sonst vom Client-Write geclobbert) und
    // best-effort (blockiert nie die Tassen-Gutschrift).
    await applyLoanRepayment(memberId, (totalCoins || 0) + (passiveEarned || 0));

    // Rückgabe: Array mit Achievement-Popups + Coin-Info als Eigenschaft
    allNew.coinsEarned   = totalCoins;
    allNew.passiveEarned = passiveEarned;
    allNew.morning       = morningBonus > 0;
    allNew.caffeineRedFlag = caffeineRedFlag ? caffeineMsg : null;
    allNew.caffeinePenalty = caffeinePaid; // tatsächlich an die Gruppenkasse abgeführte Strafe
    return allNew;
  }

  // ── Coins ausgeben ───────────────────────────────────────────────────────────
  async function spendCoins(memberId, amount) {
    const { data, error } = await _sb.rpc('spend_coins', {
      p_member_id: memberId,
      p_amount:    parseFloat(amount)
    });
    if (error) throw new Error(error.message);
    return data; // null = nicht genug Coins
  }

  // ── Kaffee-Kasse ─────────────────────────────────────────────────────────────
  async function fetchTreasury() {
    const { data } = await _sb.from('group_treasury')
      .select('*').eq('group_id', _groupId).maybeSingle();
    return data || { balance: 0, contributions: {}, unlocked_goals: {} };
  }

  async function contributeToTreasury(memberId, amount) {
    const { data, error } = await _sb.rpc('contribute_to_treasury', {
      p_member_id: memberId,
      p_group_id:  _groupId,
      p_amount:    parseFloat(amount)
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error === 'insufficient_coins' ? 'Nicht genug CoffeeCoins' : data.error);
    return data;
  }

  // ── Tagesabgabe (00:01-Logik) ────────────────────────────────────────────────
  // JEDES Mitglied führt LEVY_RATE seines GESAMTEN Tageseinkommens an die Gruppenkasse
  // ab — Tageseinkommen = passives Einkommen/Tag aus allen Quellen (Forschung/Welt/
  // Gebäude/Gruppenkasse) + heutige Tassen × (2 Basis-CC + perCup-Boni). So skaliert die
  // Abgabe mit der tatsächlichen Leistung statt mit dem Guthaben (Sparer werden nicht
  // bestraft, Vielverdiener tragen mehr). Gedeckelt aufs Guthaben (nie Minus). Einmal
  // pro Tag, idempotent über contributions._levy = Datum (reservierter Key, vom
  // Wohltäter-Helfer ignoriert). Clientseitig getriggert (kein Cron). → Chat in app.js.
  const LEVY_RATE = 0.05; // 5 % des Tageseinkommens
  const LEVY_HOUR = 18;   // erst ab 18 Uhr (Ortszeit) abrechnen — dann ist das Tageseinkommen erbracht
  async function applyDailyLevy() {
    try {
      // Tagesabgabe erst am Abend: vorher ist das Tageseinkommen noch nicht erbracht.
      // Kein Cron → läuft beim ersten App-Aufruf ab 18 Uhr; vor 18 Uhr passiert nichts.
      if (new Date().getHours() < LEVY_HOUR) return null;
      const day = today();
      const t = await fetchTreasury();
      const contribs = { ...(t.contributions || {}) };
      if (contribs._levy === day) return null; // heute bereits erledigt
      // Tagessperre sofort setzen (minimiert Doppelläufe paralleler Clients)
      contribs._levy = day;
      await _sb.from('group_treasury').upsert(
        { group_id: _groupId, balance: parseFloat(t.balance) || 0, contributions: contribs, unlocked_goals: t.unlocked_goals || {} },
        { onConflict: 'group_id' }
      );
      const { data: rows } = await _sb.from('members').select('*').eq('group_id', _groupId);
      if (!rows || !rows.length) return null;
      // Gruppenweite Daten + heutige Tassen einmal laden
      const byCountry = await _fetchWorldBuildingsByCountry();
      const perks     = await _fetchGroupPerks();
      const { data: ds } = await _sb.from('daily_stats').select('stats')
        .eq('group_id', _groupId).eq('date', day).maybeSingle();
      const cupsMap = (ds && ds.stats) || {};

      let levied = 0;
      const details = [];
      for (const raw of rows) {
        try {
          const member    = normalizeUser(raw);
          const sal       = await _computeSalary(member, byCountry, perks); // {day,cup,coins}
          const cupsToday = cupsMap[member.id] || 0;
          // Tageseinkommen = passiv/Tag + heutige Tassen × (Basis 2 CC + perCup-Boni)
          const income    = Math.round((sal.day + cupsToday * (2 + sal.cup)) * 100) / 100;
          let amt = Math.round(income * LEVY_RATE * 100) / 100;
          // 🧠 CIQ Steuerumgehung (Selbst-Buff, cosmetics.ciq_perks): heutige Abgabe = 0.
          if (typeof ciqActive === 'function' && ciqActive(member.cosmetics, 'steuerumgehung')) continue;
          // 🧠 CIQ Steuerprüfer (Fremd-Debuff, map_data.ciq_debuffs): doppelte Abgabe.
          if (typeof ciqDebuffActive === 'function' && ciqDebuffActive(member.map_data, 'steuer_pruefer')) {
            amt = Math.round(amt * 2 * 100) / 100;
          }
          if (amt < 0.01) continue;
          const bal = parseFloat(member.coins) || 0;
          if (amt > bal) amt = Math.round(bal * 100) / 100; // aufs Guthaben deckeln, nie Minus
          if (amt < 0.01) continue;
          const left = await spendCoins(member.id, amt);
          if (left === null || left === undefined) continue; // unerwartet nicht genug — überspringen
          levied = Math.round((levied + amt) * 100) / 100;
          contribs[member.id] = Math.round(((parseFloat(contribs[member.id]) || 0) + amt) * 100) / 100;
          details.push({ name: member.name, amt });
          // Today-Log: Abzug im Profil des Mitglieds sichtbar machen.
          // WICHTIG: frisch lesen → nur todayLog mergen (appendTodayLogFresh), NICHT das
          // batch-gefetchte member.map_data (rows von oben) wholesale zurückschreiben —
          // sonst clobbert diese Schleife einen zwischenzeitlich geschriebenen
          // salaryHistory-/todayLog-Punkt (Gehalts-Snapshot/Passiv-Claim laufen parallel).
          try {
            await appendTodayLogFresh(member.id, [{ label: '🏛️ Tagesabgabe → Kasse', amount: -amt, cat: 'gruppe' }]);
          } catch (_le) { /* non-critical */ }
        } catch (e) { /* einzelnes Mitglied überspringen */ }
      }
      // Spar-Zins der Kassen-Stufe (ab Stufe 4) auf den Kassenstand VOR Abgabe —
      // einmal pro Tag (gleiche Tagessperre wie die Abgabe). Wächst den Gruppenstand.
      const rate = (typeof treasuryInterestRate === 'function') ? treasuryInterestRate(t) : 0;
      const interest = rate > 0 ? Math.round((parseFloat(t.balance) || 0) * rate * 100) / 100 : 0;
      if (levied <= 0 && interest <= 0) return null;
      const newBalance = Math.round(((parseFloat(t.balance) || 0) + levied + interest) * 100) / 100;
      await _sb.from('group_treasury').update({ balance: newBalance, contributions: contribs }).eq('group_id', _groupId);
      return { levied, details, rate: LEVY_RATE, interest, interestRate: rate, newBalance };
    } catch (e) { console.warn('applyDailyLevy fehlgeschlagen:', e.message); return null; }
  }

  // ── Wochen-Challenge prüfen + bei Erreichen alle belohnen ─────────────────────
  // dailyStats = appData.dailyStats ({ 'YYYY-MM-DD': { total } }). Idempotent über
  // treasury.unlocked_goals['week_<isoKey>']. Gibt Fortschritt + ggf. justCompleted.
  async function checkWeeklyChallenge(dailyStats) {
    if (typeof WEEKLY_CHALLENGE === 'undefined' || typeof isoWeekKey !== 'function') return null;
    try {
      const wk      = isoWeekKey();
      const rewardK = `week_${wk}`;
      // Fortschritt: Summe aller Gruppen-Tassen der laufenden ISO-Woche
      let progress = 0;
      for (const [date, d] of Object.entries(dailyStats || {})) {
        if (isoWeekKey(date) === wk) progress += (d.total || 0);
      }
      const goal = WEEKLY_CHALLENGE.goalCups;
      const t = await fetchTreasury();
      const unlocked = { ...(t.unlocked_goals || {}) };
      if (unlocked[rewardK]) return { progress, goal, done: true, justCompleted: false };
      if (progress < goal) return { progress, goal, done: false, justCompleted: false };
      // Erreicht → beanspruchen (idempotent) und alle belohnen
      unlocked[rewardK] = { at: new Date().toISOString() };
      await _sb.from('group_treasury').upsert(
        { group_id: _groupId, balance: parseFloat(t.balance) || 0, contributions: t.contributions || {}, unlocked_goals: unlocked },
        { onConflict: 'group_id' }
      );
      // Belohnung × Kassen-Stufen-Multiplikator (ab Stufe 2 doppelt)
      const mult   = (typeof treasuryChallengeMult === 'function') ? treasuryChallengeMult(t) : 1;
      const reward = Math.round(WEEKLY_CHALLENGE.reward * mult);
      const { data: members } = await _sb.from('members').select('id').eq('group_id', _groupId);
      for (const m of (members || [])) {
        try { await _sb.rpc('add_coins', { p_member_id: m.id, p_amount: reward }); } catch (e) {}
      }
      return { progress, goal, done: true, justCompleted: true, reward, mult };
    } catch (e) { console.warn('checkWeeklyChallenge fehlgeschlagen:', e.message); return null; }
  }

  // Erreichte Gruppen-Ziele freischalten (Kassenstand ≥ Kosten). Idempotent, ohne neue SQL —
  // schreibt unlocked_goals direkt (RLS USING(true), GRANT UPDATE wie bei pinned_message/cosmetics).
  // Gibt die NEU freigeschalteten Ziele zurück (für Chat-Meldung). Stand bleibt erhalten (kein Abzug):
  // die Ziele sind Meilensteine, deren Effekt dauerhaft für alle gilt.
  async function syncTreasuryGoals() {
    if (typeof KASSE_GOALS === 'undefined') return [];
    try {
      const t = await fetchTreasury();
      const unlocked = { ...(t.unlocked_goals || {}) };
      // Nur Ziele bis zur aktuell erreichten Kassen-Stufe sind freischaltbar
      const curLevel = (typeof treasuryLevelInfo === 'function') ? treasuryLevelInfo(t).level : 99;
      const newly = [];
      for (const g of KASSE_GOALS) {
        if ((g.level || 1) > curLevel) continue; // Stufe noch nicht erreicht
        if (!unlocked[g.id] && (parseFloat(t.balance) || 0) >= g.cost) {
          unlocked[g.id] = { at: new Date().toISOString() };
          newly.push(g);
        }
      }
      if (newly.length) {
        await _sb.from('group_treasury').update({ unlocked_goals: unlocked }).eq('group_id', _groupId);
      }
      return newly;
    } catch (e) { console.warn('syncTreasuryGoals fehlgeschlagen:', e.message); return []; }
  }

  // ── Forschungsbaum-Kauf ──────────────────────────────────────────────────────
  async function purchaseResearchItem(memberId, itemId) {
    const allItems = (typeof getAllResearchItems === 'function') ? getAllResearchItems() : [];
    const allCombos = (typeof RESEARCH_COMBOS !== 'undefined') ? RESEARCH_COMBOS : [];

    // 🌌 Weltraum-Stufen sind ein eigener Zweig (SPACE_RESEARCH), laufen aber über
    // denselben Kaufweg — gleiche Coins-/Voraussetzungs-/Tages-Log-Behandlung.
    const allSpace = (typeof SPACE_RESEARCH !== 'undefined') ? SPACE_RESEARCH : [];

    const item  = allItems.find(i => i.id === itemId);
    const combo = allCombos.find(c => c.id === itemId);
    const space = allSpace.find(s => s.id === itemId);
    if (!item && !combo && !space) throw new Error('Item nicht gefunden');

    const target = item || combo || space;
    let cost     = target.cost || 0;

    const { data: raw } = await _sb.from('members')
      .select('coins, research, cosmetics').eq('id', memberId).single();
    if (!raw) throw new Error('Mitglied nicht gefunden');

    const research = raw.research || {};
    if (research[itemId]) throw new Error('Bereits freigeschaltet');

    // 🔬 CIQ Forscherdrang: −15 % auf den Forschungs-Kaufpreis
    if (cost > 0 && typeof ciqResearchCostMult === 'function') cost = Math.max(1, Math.round(cost * ciqResearchCostMult(raw.cosmetics || {})));

    // Voraussetzungen prüfen — für Kombos UND normale Items mit requires.
    // Gated nur Neukäufe; bereits besessene Items bleiben unberührt (target ist hier noch nicht owned).
    const prereqs = target.requires || [];
    if (prereqs.length && !prereqs.every(req => research[req])) {
      throw new Error('Voraussetzungen nicht erfüllt');
    }
    // Weltraum-Zweig zusätzlich hinter dem Endgame-Tor: das gesamte Grundspiel muss
    // erforscht sein. Wird auch in der UI geprüft — hier nochmal, damit ein direkter
    // Aufruf das Tor nicht umgeht.
    if (space && typeof isAllResearchComplete === 'function' && !isAllResearchComplete(research)) {
      throw new Error('Erst das gesamte Grundspiel erforschen');
    }

    // Coins abziehen (bei kostenpflichtigen Items)
    if (cost > 0) {
      const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: cost });
      if (error) throw new Error(error.message);
      if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
      // Ausgabe im Tages-Log (Transparenz → Netto-Gehalt).
      try { await appendTodayLogFresh(memberId, [{ label: `🔬 Forschung: ${target.name || itemId}`, amount: -cost, cat: 'forschung', detail: 'Forschungsbaum', invest: true }]); } catch (e) {}
    }

    // Item in research speichern
    const newResearch = { ...research, [itemId]: { at: new Date().toISOString() } };

    // Prüfen ob neue Gratis-Kombos automatisch freigeschaltet werden
    const autoUnlocked = [];
    for (const c of allCombos) {
      if (!newResearch[c.id] && c.cost === 0) {
        const allOwned = (c.requires || []).every(req => newResearch[req]);
        if (allOwned) {
          newResearch[c.id] = { at: new Date().toISOString(), auto: true };
          autoUnlocked.push(c);
        }
      }
    }

    await _sb.from('members').update({ research: newResearch }).eq('id', memberId);

    // ── Handelshafen-Anteil ───────────────────────────────────────────────────
    // Jedes Gruppenmitglied mit FERTIGEM Handelshafen erhält 1 % der Kaufkosten.
    // Nutzt die bestehende add_coins-RPC (keine neue SQL-Funktion nötig).
    if (cost > 0) {
      try {
        const cut = Math.round(cost * 0.01 * 100) / 100;
        if (cut > 0) {
          const { data: groupMembers } = await _sb.from('members')
            .select('id, map_data').eq('group_id', _groupId);
          const now = Date.now();
          for (const m of (groupMembers || [])) {
            const blds = m.map_data?.buildings || {};
            const hasHarbor = Object.values(blds).some(
              b => b.type === 'handelshafen' && b.completesAt <= now
            );
            if (!hasHarbor) continue;
            await _sb.rpc('add_coins', { p_member_id: m.id, p_amount: cut });
            // In das Tages-Log des Hafen-Besitzers eintragen (Transparenz)
            try {
              const ml = appendTodayLog(m.map_data, [{ label: '⚓ Handelshafen-Anteil', amount: cut, cat: 'welt' }]);
              await _sb.rpc('save_map_data', { p_member_id: m.id, p_map_data: ml });
            } catch (e) { /* Log-Fehler nicht eskalieren */ }
          }
        }
      } catch (e) { console.warn('Handelshafen-Anteil fehlgeschlagen:', e); }
    }

    return { item: target, autoUnlocked };
  }

  // ── Cosmetics speichern ──────────────────────────────────────────────────────
  async function saveCosmetics(memberId, cosmetics) {
    const { error } = await _sb.from('members')
      .update({ cosmetics })
      .eq('id', memberId);
    if (error) throw new Error(error.message);
    return cosmetics;
  }

  // ── 🧠 CIQ-Fähigkeit kaufen/aktivieren (Phase A: nur eigene Perks) ────────────
  // Validiert CIQ-Schwelle + CC + Doppelaktivierung clientnah, zieht CC via spend_coins
  // ab und schreibt den Perk nach cosmetics.ciq_perks (dauerhaft → {at}, zeitlich → {active_until}).
  // Fremdeffekte/PvP sind NICHT hier (Phase B/C, serverseitige RPCs). pending-Perks werden abgelehnt.
  async function buyCiqPerk(memberId, perkId) {
    const def = (typeof CIQ_PERKS !== 'undefined') ? CIQ_PERKS.find(p => p.id === perkId) : null;
    if (!def) return { error: 'unknown' };
    if (def.pending) return { error: 'pending' };
    const { data: raw } = await _sb.from('members').select('coins, cosmetics, map_data').eq('id', memberId).single();
    if (!raw) return { error: 'not_found' };
    const cosm  = raw.cosmetics || {};
    const ciq   = (typeof ciqGetCiq === 'function') ? ciqGetCiq(cosm) : 0;
    if (ciq < (def.ciq || 0)) return { error: 'not_enough_ciq', needed: def.ciq, have: ciq };
    const perks = { ...(cosm.ciq_perks || {}) };
    const now   = Date.now();
    if (def.type === 'permanent' && perks[perkId]) return { error: 'already_owned' };
    if (def.type === 'timed' && perks[perkId]?.active_until && new Date(perks[perkId].active_until).getTime() > now)
      return { error: 'already_active' };
    if ((def.cc || 0) > 0) {
      const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: def.cc });
      if (error) return { error: error.message };
      if (newCoins === null || newCoins === undefined) return { error: 'not_enough_cc' };
    }
    perks[perkId] = (def.type === 'timed')
      ? { active_until: new Date(now + (def.durationH || 24) * 3600000).toISOString() }
      : { at: new Date().toISOString() };
    const newCosm = { ...cosm, ciq_perks: perks };
    const { error: upErr } = await _sb.from('members').update({ cosmetics: newCosm }).eq('id', memberId);
    if (upErr) return { error: upErr.message };
    // Tages-Log: Kaufpreis der Fähigkeit sichtbar machen — bisher komplett unsichtbar,
    // nur der Kontostand sank (analog zum Handelsbündnis-Geschenk-Fund). Fresh-Read
    // direkt vor dem Merge (wie in claimLoginBonus), falls zwischenzeitlich ein
    // anderer Write (Passiv/Gehalt) das map_data schon weitergeschrieben hat.
    if ((def.cc || 0) > 0) {
      try {
        const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
        const md = appendTodayLog((fresh && fresh.map_data) || raw.map_data,
          [{ label: `🧠 ${def.name} freigeschaltet`, amount: -def.cc, cat: 'ciq' }]);
        await updateMapData(memberId, md);
      } catch (e) { console.warn('CIQ-Kauf-Log konnte nicht gespeichert werden:', e); }
    }
    return { ok: true, cosmetics: newCosm };
  }

  // ── 🧠 CIQ-Angriffsfähigkeit einsetzen (Phase B: PvP) ─────────────────────────
  // Reine Weiterleitung an die SECURITY-DEFINER-RPC apply_ciq_attack — Ziel-Bestimmung,
  // CIQ-/CC-Prüfung, Cooldown und der eigentliche CC-Transfer/Debuff-Eintrag laufen
  // ALLE serverseitig (kein Client-Side-Trust, siehe plans/PLAN_ciq_angriffe.md §3).
  async function applyCiqAttack(memberId, perkId) {
    const { data, error } = await _sb.rpc('apply_ciq_attack', {
      p_member_id: memberId,
      p_perk_id:   perkId,
      p_group_id:  _groupId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Schlanker Read-only-Zugriff aufs map_data eines (auch fremden) Mitglieds — für
  // Fresh-Read-Merge, wenn ein clientseitiger Effekt fremdes map_data schreiben muss
  // (z. B. Schatzräuber-Angreiferseite in imperium.js). {} bei Fehler/leer.
  async function fetchMemberMapData(memberId) {
    const { data, error } = await _sb.from('members').select('map_data').eq('id', memberId).single();
    if (error) throw new Error(error.message);
    return (data && data.map_data) || {};
  }

  // ── Saison abschließen ───────────────────────────────────────────────────────
  async function closeSeason(seasonId) {
    // Atomarer Idempotenz-Guard: UPDATE greift nur, wenn die Saison noch aktiv ist.
    // Liefert nur dann eine Zeile zurück, wenn DIESER Aufruf das Schließen "gewonnen"
    // hat — verhindert Doppel-Auszahlung, falls mehrere Mitglieder (z. B. beim
    // automatischen Abschluss am Monatsletzten) closeSeason fast gleichzeitig auslösen.
    const { data: claimed } = await _sb.from('seasons')
      .update({ is_active: false })
      .eq('group_id', _groupId).eq('season_id', seasonId).eq('is_active', true)
      .select('id');
    if (!claimed || claimed.length === 0) return { alreadyClosed: true };

    const [year] = seasonId.split('-');

    // ── 1. Alle Members laden und nach Saison-Cups sortieren ──────────────────
    const { data: members } = await _sb
      .from('members').select('*').eq('group_id', _groupId);

    const standings = (members || [])
      .map(m => ({ ...m, sc: (m.season_cups || {})[seasonId] || 0 }))
      .filter(m => m.sc > 0)          // nur wer in dieser Saison aktiv war
      .sort((a, b) => b.sc - a.sc || a.name.localeCompare(b.name)); // absteigend, bei Gleichstand alphabetisch

    if (!standings.length) {
      await _sb.from('seasons')
        .update({ is_active: false, winner_name: null, winner_cups: null })
        .eq('group_id', _groupId).eq('season_id', seasonId);
      return { winner: null, winners: [], standings: [] };
    }

    // Bei Gleichstand auf Platz 1 teilen sich alle Bestplatzierten den Sieg
    const topScore = standings[0].sc;
    const winners   = standings.filter(m => m.sc === topScore);

    // ── 2. Saison-Zeile abschließen ───────────────────────────────────────────
    await _sb.from('seasons')
      .update({
        is_active:    false,
        winner_name:  winners.map(w => w.name).join(' & '),
        winner_cups:  topScore,
      })
      .eq('group_id', _groupId)
      .eq('season_id', seasonId);

    // ── 3. CC-Staffelung für alle aktiven Teilnehmer (Gleichstand = gleicher Rang) ──
    const CC_BY_RANK = [50, 20, 10]; // Platz 1, 2, 3
    const CC_PARTICIPATION = 5;       // Platz 4+

    let rank = 0;
    for (let i = 0; i < standings.length; i++) {
      if (i > 0 && standings[i].sc !== standings[i - 1].sc) rank = i;
      const cc = CC_BY_RANK[rank] ?? CC_PARTICIPATION;
      await _sb.rpc('add_coins', { p_member_id: standings[i].id, p_amount: cc });
    }

    // ── 4. Gewinner: Pokal + Monats-Theme + monthly_wins + Achievement (alle Erstplatzierten) ──
    const themeId = (typeof getSeasonThemeId === 'function')
      ? getSeasonThemeId(seasonId)
      : null;

    for (const winnerData of winners) {
      const winnerCosm = winnerData.cosmetics || {};

      // Saison-Pokal sammeln
      const newTrophies = [...new Set([
        ...(winnerCosm.trophies || []),
        seasonId,
      ])];

      // Monats-Theme freischalten (ohne Jahr — einmal pro Monat reicht)
      const newSeasonThemes = themeId
        ? [...new Set([...(winnerCosm.seasonThemes || []), themeId])]
        : (winnerCosm.seasonThemes || []);

      const newWins = (winnerData.monthly_wins || 0) + 1;
      const newAch  = { ...(winnerData.achievements || {}), monthly_win: true };

      await _sb.from('members').update({
        monthly_wins: newWins,
        achievements: newAch,
        cosmetics:    { ...winnerCosm, trophies: newTrophies, seasonThemes: newSeasonThemes },
      }).eq('id', winnerData.id);

      // ── 5. Hall of Fame (unveränderte Logik) ────────────────────────────────
      const { data: hof } = await _sb
        .from('hall_of_fame').select('*')
        .eq('group_id', _groupId).maybeSingle();

      if (!hof?.most_wins_value || newWins > (hof.most_wins_value || 0)) {
        await _sb.from('hall_of_fame').upsert(
          { ...(hof || {}), group_id: _groupId, most_wins_value: newWins, most_wins_name: winnerData.name },
          { onConflict: 'group_id' }
        );
      }
    }

    // ── 5b. Platz 1/2/3: Achievements jede Saison neu vergeben ──────────────
    let _rIdx = 0;
    for (let i = 0; i < standings.length; i++) {
      if (i > 0 && standings[i].sc !== standings[i - 1].sc) _rIdx = i;
      const _achId = _rIdx === 0 ? 'top1' : _rIdx === 1 ? 'top2' : _rIdx === 2 ? 'top3' : null;
      if (!_achId) continue;
      const _mAch = { ...(standings[i].achievements || {}), [_achId]: true };
      await _sb.from('members').update({ achievements: _mAch }).eq('id', standings[i].id);
    }

    // ── 6. Jahres-Champion neu berechnen ──────────────────────────────────────
    await _updateJahresChampion(year);

    return { winner: winners[0], winners, standings, themeId };
  }

  // ── Jahres-Champion neu berechnen ────────────────────────────────────────────
  async function _updateJahresChampion(year) {
    // Alle abgeschlossenen Saisons des Jahres laden
    const { data: yearSeasons } = await _sb
      .from('seasons')
      .select('winner_name')
      .eq('group_id', _groupId)
      .gte('season_id', `${year}-01`)
      .lte('season_id', `${year}-12`)
      .eq('is_active', false);

    if (!yearSeasons?.length) return;

    // Siege pro Name zählen (bei geteilten Saison-Siegen zählt jeder Name einzeln)
    const wins = {};
    for (const s of yearSeasons) {
      if (!s.winner_name) continue;
      for (const name of s.winner_name.split(' & ').map(n => n.trim()).filter(Boolean)) {
        wins[name] = (wins[name] || 0) + 1;
      }
    }
    if (!Object.keys(wins).length) return;

    const maxWins = Math.max(...Object.values(wins));
    const championNames = Object.keys(wins).filter(k => wins[k] === maxWins);

    // Allen Members jahresChampion-Status korrekt setzen
    const { data: members2 } = await _sb
      .from('members').select('id, name, cosmetics')
      .eq('group_id', _groupId);

    for (const m of (members2 || [])) {
      const cosm       = m.cosmetics || {};
      const isChampion = championNames.includes(m.name);
      const hasYear    = cosm.jahresChampion === parseInt(year);

      if (isChampion && !hasYear) {
        // Jahres-Champion-Titel setzen
        await _sb.from('members').update({
          cosmetics: { ...cosm, jahresChampion: parseInt(year) },
        }).eq('id', m.id);

      } else if (!isChampion && hasYear) {
        // Titel entfernen (jemand anderes hat nun mehr Siege)
        const { jahresChampion: _remove, ...restCosm } = cosm;
        await _sb.from('members').update({ cosmetics: restCosm }).eq('id', m.id);
      }
      // isChampion && hasYear → bereits korrekt, nichts tun
      // !isChampion && !hasYear → bereits korrekt, nichts tun
    }
  }

  // ── Saison sicherstellen ─────────────────────────────────────────────────────
  async function ensureSeason() {
    const id = getSeasonId();
    const { data } = await _sb.from('seasons').select('id').eq('group_id', _groupId).eq('season_id', id).maybeSingle();
    if (!data) {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      await _sb.from('seasons').insert({ group_id: _groupId, season_id: id, name: getSeasonName(id), start_date: start, end_date: end, is_active: true });
    }
  }

  // ── Saison automatisch abschließen (letzter Monatstag, falls noch aktiv) ───────
  // Aufruf wie Tagesabgabe/Wochen-Challenge beim App-Start (app.js dailyGroupTasks) —
  // läuft an JEDEM Monatsletzten bei jedem aktiven Client, ist aber durch den
  // Idempotenz-Guard in closeSeason() ungefährlich bei Mehrfachaufruf.
  async function autoCloseSeasonIfDue() {
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() !== lastDayOfMonth) return null; // Ortszeit, analog Tagesabgabe (18 Uhr)

    const seasonId = getSeasonId();
    const { data: season } = await _sb.from('seasons').select('is_active')
      .eq('group_id', _groupId).eq('season_id', seasonId).maybeSingle();
    if (!season || season.is_active === false) return null; // nicht angelegt oder schon zu

    const result = await closeSeason(seasonId);
    return { ...result, seasonId };
  }

  // ── Abgeleitete Getter ───────────────────────────────────────────────────────
  // Tiebreak nach Name (statt reinem totalCups-Vergleich): ohne festen Tiebreak konnten
  // Spieler mit exakt gleichem Tassen-Stand (z.B. mehrere bei 0) je nach Aufruf in
  // wechselnder Reihenfolge erscheinen — wirkte willkürlich, u.a. weil dieselbe Rangliste
  // auch die CIQ-Angriffsziel-Auswahl bestimmt (siehe apply_ciq_attack() SQL + ciqAttackQueue
  // in research.js, dieselbe Tiebreak-Konvention).
  function getLeaderboard(data)   { return [...(data.users || [])].sort((a, b) => b.totalCups - a.totalCups || a.name.localeCompare(b.name)); }
  function getSeasons(data)       { return [...(data.seasons || [])].sort((a, b) => b.season_id?.localeCompare(a.season_id)); }
  function getDailyStats(data, days = 30) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return Object.values(data.dailyStats || {}).filter(d => d.date >= cutoff.toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── Auswertung ───────────────────────────────────────────────────────────────
  async function fetchMonthStats(year, month) {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end   = new Date(year, month, 0).toISOString().slice(0,10);
    const { data } = await _sb.from('daily_stats')
      .select('*').eq('group_id', _groupId)
      .gte('date', start).lte('date', end)
      .order('date', { ascending: true });
    return data || [];
  }

  async function fetchYearSeasons(year) {
    const { data } = await _sb.from('seasons')
      .select('*').eq('group_id', _groupId)
      .gte('season_id', `${year}-01`).lte('season_id', `${year}-12`)
      .order('season_id', { ascending: true });
    return data || [];
  }

  // ── Nachrichten ──────────────────────────────────────────────────────────────
  // Limit höher (120), damit die clientseitige Aufteilung in 💬 Chat / 📰 News
  // (nach System-Absendername, siehe app.js) für BEIDE Streams genug Material hat.
  async function fetchMessages(limit = 120) {
    const { data } = await _sb.from('messages')
      .select('*').eq('group_id', _groupId)
      .order('created_at', { ascending: false }).limit(limit);
    return (data || []).reverse();
  }

  async function postMessage(text, memberName) {
    const { error } = await _sb.from('messages')
      .insert({ group_id: _groupId, member_name: memberName, message: text.trim() });
    if (error) throw new Error(error.message);
  }

  // ── Karte ────────────────────────────────────────────────────────────────────
  async function updateMapData(memberId, mapData) {
    // 📊 Tagesbilanz v2: das von appendTodayLog angehängte Delta darf NIE in den
    // Blob — vor dem Write abtrennen, danach an add_day_stats flushen.
    const { _dayDelta, ...clean } = mapData || {};
    const { error } = await _sb.rpc('save_map_data', { p_member_id: memberId, p_map_data: clean });
    if (error) throw new Error(error.message);
    await _flushDayDelta(memberId, mapData, _dayDelta);
  }

  // 📊 Tagesbilanz v2 (migration_2026-07-22c): die Deltas der neu angehängten
  // Log-Einträge werden serverseitig ADDIERT (add_day_stats, FOR UPDATE) statt wie
  // in v1 client-berechnete Totale zu GREATEST-en. Die v1 fror ein, sobald der
  // lokale todayLog einmal zurückrollte: der Client schickte fortan Totale unter
  // dem gespeicherten Maximum, und alles danach Verdiente fehlte in der Summe.
  // updateMapData ist der EINE Ort, durch den jeder map_data-Write läuft; deshalb
  // muss keine der ~15 Aufrufstellen angefasst werden.
  // Best-effort: ein Fehler hier darf den eigentlichen Write nie eskalieren.
  // Bei Fehlschlag bleibt `_dayDelta` am lokalen Objekt hängen → der nächste
  // appendTodayLog/updateMapData desselben Objekts versucht es erneut.
  async function _flushDayDelta(memberId, mapDataObj, delta) {
    if (!memberId || !delta || !delta.day) return null;
    if (!(delta.gross > 0 || delta.spent > 0 || Object.keys(delta.cats || {}).length)) {
      if (mapDataObj) try { delete mapDataObj._dayDelta; } catch (e) {}
      return null;
    }
    try {
      const { data, error } = await _sb.rpc('add_day_stats', {
        p_member_id: memberId,
        p_day:       delta.day,
        p_gross:     delta.gross || 0,
        p_spent:     delta.spent || 0,
        p_cats:      delta.cats || {},
      });
      if (error) throw new Error(error.message);
      if (mapDataObj) try { delete mapDataObj._dayDelta; } catch (e) {}
      return data || null;
    } catch (e) {
      console.warn('add_day_stats fehlgeschlagen:', e.message);
      return null;
    }
  }

  // ── Kaffee-Krieger ───────────────────────────────────────────────────────────
  async function saveDungeonData(memberId, dungeonData) {
    const { error } = await _sb.rpc('save_dungeon_data', { p_member_id: memberId, p_dungeon_data: dungeonData });
    if (error) throw new Error(error.message);
  }

  async function dungeonFight(memberId, enemyTier, flavorIdx, potionKey, potionKey2, enemyLevel) {
    const { data, error } = await _sb.rpc('dungeon_fight', {
      p_member_id: memberId, p_group_id: _groupId, p_enemy_tier: enemyTier,
      p_flavor_idx: (flavorIdx === undefined ? null : flavorIdx),
      p_potion_key:  (potionKey  == null ? null : potionKey),
      p_potion_key2: (potionKey2 == null ? null : potionKey2),   // 2. Trank (Cold Brew + 1 Buff)
      p_today: new Date().toLocaleDateString('de-DE'),  // = _kriegerTodayKey(), persistente HP (Etappe 2)
      p_enemy_level: (enemyLevel == null ? null : enemyLevel),   // Gegner-Level (2026-07-13b); null = alter Client
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // 🧪 Trank kaufen (Etappe 2): atomarer Coin-Abzug (spend_coins) + Bestand in dungeon_data.potions.
  // Gleiches Muster/Vertrauensmodell wie buyKriegerItem. Verbrauch passiert serverseitig in dungeon_fight.
  async function buyKriegerPotion(memberId, potion, currentDungeonData) {
    if (!potion || !potion.key) throw new Error('Unbekannter Trank');
    // Handelsprivileg-Set (2026-07-13): −15% auf Tränke, wenn das Handel-Set getragen wird.
    const cost = (typeof kriegerDiscountedCost === 'function')
      ? kriegerDiscountedCost(potion.cost, currentDungeonData) : potion.cost;
    const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: cost });
    if (error) throw new Error(error.message);
    if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
    const potions = { ...(currentDungeonData?.potions || {}) };
    potions[potion.key] = (potions[potion.key] || 0) + 1;
    // Kumulative Trank-Ausgaben (CC) mitführen — Transparenz im Fortschritt-Tab.
    const potionsSpent = (currentDungeonData?.potionsSpent || 0) + (cost || 0);
    const newDD = { ...currentDungeonData, potions, potionsSpent };
    await saveDungeonData(memberId, newDD);
    return { ...newDD, _costPaid: cost };
  }

  // Kauf eines Krieger-Items: atomarer Coin-Abzug (bestehende spend_coins-RPC) +
  // Besitz in dungeon_data eintragen. Gleiches Muster wie purchaseResearchItem.
  async function buyKriegerItem(memberId, item, currentDungeonData) {
    const owned = currentDungeonData?.owned || {};
    if (owned[item.key]) throw new Error('Bereits im Besitz');
    if ((currentDungeonData?.level || 1) < item.minLevel) throw new Error('Stufe zu niedrig');
    // 🎁 Ausrüstungsfund-Gutschein (Dungeon-Karte, 2026-07-04): 50% Rabatt, wenn der Gutschein
    // zum Slot des gekauften Items passt — wird bei diesem Kauf verbraucht (egal ob Kauf oder
    // Ausbau), unabhängig von der Kultur. Nur EIN Gutschein kann je aktiv sein (siehe krieger.js).
    const voucher = currentDungeonData?.equipmentVoucher;
    const applyDiscount = !!(voucher && voucher.slot === item.slot);
    let cost = applyDiscount ? Math.round(item.cost * (1 - (voucher.pct || 0.5))) : item.cost;
    // Handelsprivileg-Set (2026-07-13): −15% auf Ausrüstung, wenn das Handel-Set getragen wird.
    // Stapelt multiplikativ mit dem Ausrüstungsfund-Gutschein. Anzeige nutzt dieselbe Helferin.
    if (typeof kriegerDiscountedCost === 'function') cost = kriegerDiscountedCost(cost, currentDungeonData);
    const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: cost });
    if (error) throw new Error(error.message);
    if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
    const newDD = { ...currentDungeonData, owned: { ...owned, [item.key]: true } };
    if (applyDiscount) delete newDD.equipmentVoucher;
    await saveDungeonData(memberId, newDD);
    return { ...newDD, _costPaid: cost, _discountApplied: applyDiscount };
  }

  // 🐴 Begleiter kaufen (Etappe 3): atomarer Coin-Abzug + Besitz in dungeon_data.owned (wie Items).
  // Ausrüsten (dd.companion) läuft separat über saveDungeonData im UI. Verbrauch/Wirkung serverseitig.
  async function buyKriegerCompanion(memberId, companion, currentDungeonData) {
    const owned = currentDungeonData?.owned || {};
    if (!companion || !companion.key) throw new Error('Unbekannter Begleiter');
    if (owned[companion.key]) throw new Error('Bereits im Besitz');
    if ((currentDungeonData?.level || 1) < (companion.minLevel || 1)) throw new Error('Stufe zu niedrig');
    const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: companion.cost });
    if (error) throw new Error(error.message);
    if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
    const newDD = { ...currentDungeonData, owned: { ...owned, [companion.key]: true } };
    await saveDungeonData(memberId, newDD);
    return newDD;
  }

  // 🐎 Reittier kaufen (Etappe 5): atomarer Coin-Abzug + Besitz in dungeon_data.owned.
  // Ausrüsten (dd.mount) läuft separat über saveDungeonData im UI. Kampf-Boost serverseitig.
  async function buyKriegerMount(memberId, mount, currentDungeonData) {
    const owned = currentDungeonData?.owned || {};
    if (!mount || !mount.key) throw new Error('Unbekanntes Reittier');
    if (owned[mount.key]) throw new Error('Bereits im Besitz');
    if ((currentDungeonData?.level || 1) < (mount.minLevel || 1)) throw new Error('Stufe zu niedrig');
    const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: mount.cost });
    if (error) throw new Error(error.message);
    if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
    const newDD = { ...currentDungeonData, owned: { ...owned, [mount.key]: true } };
    await saveDungeonData(memberId, newDD);
    return newDD;
  }

  // 🔨 Rüstung reparieren: atomarer Coin-Abzug (spend_coins) + Haltbarkeit auf 100 setzen.
  // Haltbarkeit lebt in dungeon_data.armorDur; Abzug bei Niederlage passiert serverseitig in
  // dungeon_fight. Reparatur clientseitig (gleiches Vertrauensmodell wie Kauf/Schritte).
  async function repairArmor(memberId, armorKey, cost, currentDungeonData) {
    if (!armorKey || !(cost > 0)) throw new Error('Nichts zu reparieren');
    const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: cost });
    if (error) throw new Error(error.message);
    if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
    const armorDur = { ...(currentDungeonData?.armorDur || {}), [armorKey]: 100 };
    const newDD = { ...currentDungeonData, armorDur };
    await saveDungeonData(memberId, newDD);
    return newDD;
  }

  async function addCoins(memberId, amount) {
    const { error } = await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: Math.max(0, amount) });
    if (error) throw new Error(error.message);
  }

  // ── Weltkarte ────────────────────────────────────────────────────────────────
  async function investInCountry(memberId, countryId, amount) {
    const { data, error } = await _sb.rpc('invest_in_country', {
      p_member_id: memberId, p_group_id: _groupId, p_country_id: countryId, p_amount: parseFloat(amount)
    });
    if (error) throw new Error(error.message);
    // Ausgabe im Tages-Log (Transparenz → Netto-Gehalt). Welt-Investition = CC dauerhaft weg.
    if (data && !data.error) {
      try { await appendTodayLogFresh(memberId, [{ label: `🌍 Welthandel: ${countryId}`, amount: -parseFloat(amount), cat: 'welt', detail: 'Welt-Investition', invest: true }]); } catch (e) {}
    }
    return data; // { ok, total_invested, coins_left } oder { error }
  }

  async function fetchCountryStandings(countryId) {
    const { data, error } = await _sb.rpc('get_country_standings', { p_group_id: _groupId, p_country_id: countryId });
    if (error) throw new Error(error.message);
    return data || [];
  }

  // 🏦 Stille Anlage: atomar CC abziehen + map_data.worldPassive[country] erhöhen.
  // Kein Rang-Einfluss (world_investments unberührt). { ok, invested, coins } | { error }.
  async function investPassive(memberId, countryId, amount) {
    const { data, error } = await _sb.rpc('invest_passive', {
      p_member_id: memberId, p_country_id: countryId, p_amount: parseFloat(amount)
    });
    if (error) return { error: error.message };
    // Ausgabe im Tages-Log (tatsächlich angelegter Betrag; kann durch Deckel < amount sein).
    if (data && !data.error) {
      const inv = (data.invested != null) ? data.invested : parseFloat(amount);
      // kapital:true → reine Kapitalbewegung (rückzahlbar), NICHT als Investition ins Ledger
      // buchen und NICHT vom Netto abziehen. Nur informativ im „Heute erhalten"-Log sichtbar.
      try { if (inv > 0) await appendTodayLogFresh(memberId, [{ label: `🏦 Stille Anlage: ${countryId}`, amount: -inv, detail: 'Einzahlung (Kapital)', kapital: true }]); } catch (e) {}
    }
    return data || { error: 'no_data' };
  }

  // 🏦 Stille Anlage auszahlen: atomar Kapital reduzieren, 80% an Investor, 20%
  // Bauherren-Entschädigung an die Erbauer des Landes (server, withdraw_passive).
  // Tages-Log für Investor UND Empfänger schreibt die RPC selbst.
  async function withdrawPassive(memberId, countryId, amount) {
    const { data, error } = await _sb.rpc('withdraw_passive', {
      p_member_id: memberId, p_country_id: countryId, p_amount: parseFloat(amount)
    });
    if (error) return { error: error.message };
    // Investor-Auszahlung als KAPITAL-NEUTRALEN Tages-Log-Eintrag schreiben (die RPC loggt
    // den eigenen Rückfluss bewusst NICHT mehr — Kapital-Rückfluss ist keine Einnahme).
    // kapital:true → weder Netto noch Bilanz-Ledger, nur informativ. Fresh-Merge, da die RPC
    // gerade worldPassive reduziert hat. Best-effort: Fehler darf die Auszahlung nicht stören.
    if (data && !data.error) {
      const payout = (data.payout != null) ? data.payout : parseFloat(amount);
      try { if (payout > 0) await appendTodayLogFresh(memberId, [{ label: `🏧 Stille Anlage ausgezahlt: ${countryId}`, amount: payout, detail: 'Auszahlung (Kapital)', kapital: true }]); } catch (e) {}
    }
    return data || { error: 'no_data' };
  }

  // ── 🤝 Kaffee-Kredit (P2P-Kredit in der Gruppe) ──────────────────────────────
  // Alle Geld-Bewegungen laufen atomar server-seitig (migration_2026-07-12_kredit.sql);
  // Tages-Logs schreiben die RPCs selbst (auch für offline Geber/Schuldner).
  async function requestLoan(memberId, target) {
    const { data, error } = await _sb.rpc('request_loan', { p_borrower_id: memberId, p_target: parseFloat(target) });
    if (error) return { error: error.message };
    return data || { error: 'no_data' };
  }
  async function fundLoan(loanId, lenderId, amount) {
    const { data, error } = await _sb.rpc('fund_loan', { p_loan_id: loanId, p_lender_id: lenderId, p_amount: parseFloat(amount) });
    if (error) return { error: error.message };
    return data || { error: 'no_data' };
  }
  // Wird nach jeder Gehalts-Gutschrift (Tassen/Passiv) aufgerufen — No-op ohne aktiven
  // Kredit. Best-effort: ein Fehler hier darf die Einkommens-Gutschrift NIE eskalieren.
  async function applyLoanRepayment(memberId, income) {
    if (!memberId || !(income > 0)) return null;
    try {
      const { data } = await _sb.rpc('apply_loan_repayment', { p_borrower_id: memberId, p_income: parseFloat(income) });
      return data || null;
    } catch (e) { console.warn('Kredit-Tilgung fehlgeschlagen (nicht kritisch):', e.message); return null; }
  }
  async function repayLoanEarly(memberId, amount) {
    const { data, error } = await _sb.rpc('repay_loan_early', { p_borrower_id: memberId, p_amount: parseFloat(amount) });
    if (error) return { error: error.message };
    return data || { error: 'no_data' };
  }
  async function cancelLoan(loanId, memberId) {
    const { data, error } = await _sb.rpc('cancel_loan', { p_loan_id: loanId, p_borrower_id: memberId });
    if (error) return { error: error.message };
    return data || { error: 'no_data' };
  }
  // Offene Kreditanfragen der eigenen Gruppe (zum Finanzieren). Schuldner-Namen löst der
  // Client aus appData.users auf (kein PostgREST-FK-Embed → robuster gegen Constraint-Namen).
  async function fetchGroupLoans() {
    const { data, error } = await _sb.from('loans')
      .select('*').eq('group_id', _groupId).eq('status', 'open').order('created_at', { ascending: true });
    if (error) { console.warn('fetchGroupLoans:', error.message); return []; }
    return data || [];
  }
  // Alle Beiträge, an denen ich als Geber beteiligt bin (für „Meine Ausleihen") + der
  // zugehörige Kredit (Vorwärts-Embed über die loan_id-FK = PostgREST-Standard, robust).
  async function fetchMyContributions(memberId) {
    const { data, error } = await _sb.from('loan_contributions')
      .select('*, loan:loans(*)').eq('lender_id', memberId);
    if (error) { console.warn('fetchMyContributions:', error.message); return []; }
    return data || [];
  }

  async function fetchAllWorldInvestments() {
    const { data, error } = await _sb.from('world_investments')
      .select('member_id, country_id, total_invested, garde_level').eq('group_id', _groupId);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function fetchAllWorldBuildings() {
    const { data, error } = await _sb.from('world_buildings')
      .select('member_id, country_id, building_id, level').eq('group_id', _groupId);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function buildWorldStructure(memberId, countryId, buildingId, cost, upgrade) {
    const { data, error } = await _sb.rpc('build_world_structure', {
      p_member_id: memberId, p_group_id: _groupId, p_country_id: countryId,
      p_building_id: buildingId, p_cost: parseFloat(cost), p_upgrade: !!upgrade
    });
    if (error) throw new Error(error.message);
    return data; // { ok, level } oder { error }
  }

  // ── 🫘 Anbauländer (Rohstoff-System) — alle robust gegen fehlende Migration ────
  async function fetchAllProducerInvestments() {
    const { data, error } = await _sb.from('world_producer_investments')
      .select('member_id, country_id, total_invested').eq('group_id', _groupId);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async function fetchAllProducerTracks() {
    const { data, error } = await _sb.from('world_producer_tracks')
      .select('country_id, track_id, level').eq('group_id', _groupId);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async function fetchProducerStandings(countryId) {
    const { data, error } = await _sb.rpc('get_producer_standings', { p_group_id: _groupId, p_country_id: countryId });
    if (error) throw new Error(error.message);
    return data || [];
  }
  // Bau-Strang hochziehen = Investieren (atomar). Tages-Log als Ausgabe (weltbau-Rubrik, invest).
  async function upgradeProducerTrack(memberId, countryId, trackId, cost) {
    const { data, error } = await _sb.rpc('upgrade_producer_track', {
      p_member_id: memberId, p_group_id: _groupId, p_country_id: countryId,
      p_track_id: trackId, p_cost: parseFloat(cost)
    });
    if (error) throw new Error(error.message);
    if (data && !data.error) {
      try { await appendTodayLogFresh(memberId, [{ label: `🫘 Anbau: ${trackId} — ${countryId}`, amount: -parseFloat(cost), cat: 'anbau', detail: 'Anbauland-Ausbau', invest: true }]); } catch (e) {}
    }
    return data; // { ok, level, total_invested, coins_left } | { error }
  }
  // Ernte einlösen: Client übergibt Tages-Rate, Server ist über das Zeit-Delta (map_data.rohstoffe.lastHarvest)
  // autoritativ + bucht Bohnen ins Lager, zieht Löhne ab (Safe-Fallback). Löhne loggt der Client (unten).
  async function claimHarvest(memberId, stdPerDay, oekoPerDay, lohnPerDay) {
    const { data, error } = await _sb.rpc('claim_harvest', {
      p_member_id: memberId,
      p_std_per_day: parseFloat(stdPerDay) || 0,
      p_oeko_per_day: parseFloat(oekoPerDay) || 0,
      p_lohn_per_day: parseFloat(lohnPerDay) || 0,
    });
    if (error) throw new Error(error.message);
    return data; // { ok, std, oeko, lohn, days, lager_std, lager_oeko } | { ok, nothing } | { error }
  }
  // Versorgungs-Multiplikator (Brücke 1): einmal/Tag Bohnen → % Bonus aufs Konsum-Tageseinkommen.
  // Client liefert die Konsum-Basis (aus JS-Welt-Daten); Server rechnet Formel + Verbrauch + Tages-Lock.
  async function claimSupply(memberId, konsumBasis) {
    const { data, error } = await _sb.rpc('claim_supply', {
      p_member_id: memberId, p_konsum_basis: parseFloat(konsumBasis) || 0,
    });
    if (error) throw new Error(error.message);
    return data; // { ok, pct, bonus, oeko_use, std_use, lager_* } | { ok, already|nothing } | { error }
  }
  // Bohnen an der Kaffeebörse verkaufen (Brücke 2). Server ist über Preis + Bestand autoritativ.
  // oekoPriceMult/stdPriceMult = Konsum→Anbau-Synergie-Faktoren (1.0 = kein Bonus); Server clamped [1,3].
  async function sellBeans(memberId, sellOeko, sellStd, oekoPriceMult, stdPriceMult) {
    const { data, error } = await _sb.rpc('sell_beans', {
      p_member_id: memberId, p_sell_oeko: parseFloat(sellOeko) || 0, p_sell_std: parseFloat(sellStd) || 0,
      p_oeko_price_mult: (oekoPriceMult != null ? parseFloat(oekoPriceMult) : 1),
      p_std_price_mult:  (stdPriceMult  != null ? parseFloat(stdPriceMult)  : 1),
    });
    if (error) throw new Error(error.message);
    return data; // { ok, proceeds, sold_oeko, sold_std, price_*, lager_* } | { ok, nothing } | { error }
  }

  // ── ☕ Café (Erlebnis-Minigame #3) ──────────────────────────────────────────
  // Kern-State in map_data.cafe; idle-Ertrag server-autoritativ über Zeit-Delta (wie claim_harvest).
  async function openCafe(memberId) {
    const { data, error } = await _sb.rpc('open_cafe', { p_member_id: memberId });
    if (error) throw new Error(error.message);
    return data; // { ok, map_data } | { error }
  }
  async function buyCafeItem(memberId, cat, key, cost, name) {
    const { data, error } = await _sb.rpc('buy_cafe_item', {
      p_member_id: memberId, p_cat: cat, p_key: key, p_cost: parseFloat(cost) || 0, p_name: name || ''
    });
    if (error) throw new Error(error.message);
    return data; // { ok, cost, coins_left, map_data } | { error }
  }
  async function claimCafe(memberId, netPerDay, beansStd, beansOeko, rufTarget, umsatzPerDay, gaestePerDay, touchOnly) {
    const { data, error } = await _sb.rpc('claim_cafe', {
      p_member_id: memberId, p_net_per_day: parseFloat(netPerDay) || 0,
      p_beans_std_per_day: parseFloat(beansStd) || 0, p_beans_oeko_per_day: parseFloat(beansOeko) || 0,
      p_ruf_target: parseFloat(rufTarget) || 0, p_umsatz_per_day: parseFloat(umsatzPerDay) || 0,
      p_gaeste_per_day: parseFloat(gaestePerDay) || 0, p_touch_only: !!touchOnly
    });
    if (error) throw new Error(error.message);
    return data; // { ok, credited, days, coins, lifetime, map_data } | { ok, nothing } | { error }
  }
  async function setCafeBeans(memberId, on) {
    const { data, error } = await _sb.rpc('set_cafe_beans', { p_member_id: memberId, p_on: !!on });
    if (error) throw new Error(error.message);
    return data; // { ok, map_data } | { error }
  }
  // Filiale-Ökonomie (Café 2.0): eigene Kasse, Einlage, Ausschüttungsquote/Auto-Ausbau, Stil.
  async function depositCafe(memberId, amount) {
    const { data, error } = await _sb.rpc('deposit_cafe', { p_member_id: memberId, p_amount: parseFloat(amount) || 0 });
    if (error) throw new Error(error.message);
    return data; // { ok, amount, coins_left, kasse, map_data } | { error }
  }
  async function setCafePolicy(memberId, ratio, autobuild) {
    const { data, error } = await _sb.rpc('set_cafe_policy', {
      p_member_id: memberId, p_ratio: parseFloat(ratio), p_autobuild: !!autobuild });
    if (error) throw new Error(error.message);
    return data; // { ok, map_data } | { error }
  }
  async function setCafeStil(memberId, stil, minUmsatz) {
    const { data, error } = await _sb.rpc('set_cafe_stil', {
      p_member_id: memberId, p_stil: stil, p_min_umsatz: parseFloat(minUmsatz) || 0 });
    if (error) throw new Error(error.message);
    return data; // { ok, map_data } | { error: 'locked' }
  }
  async function claimCafeTask(memberId, taskId, reward) {
    const { data, error } = await _sb.rpc('claim_cafe_task', {
      p_member_id: memberId, p_task_id: taskId, p_reward: parseFloat(reward) || 0 });
    if (error) throw new Error(error.message);
    return data; // { ok, reward, coins, map_data } | { error: 'already' }
  }
  async function unlockCafeRecipe(memberId, id, cost) {
    const { data, error } = await _sb.rpc('unlock_cafe_recipe', {
      p_member_id: memberId, p_id: id, p_cost: parseFloat(cost) || 0 });
    if (error) throw new Error(error.message);
    return data; // { ok, kasse_left, map_data } | { error }
  }

  async function buyGarde(memberId, countryId) {
    const { data, error } = await _sb.rpc('buy_garde', {
      p_member_id: memberId, p_group_id: _groupId, p_country_id: countryId
    });
    if (error) throw new Error(error.message);
    return data; // { ok, cost, level } oder { error, cost? }
  }

  // ── Söldner-Sabotage (Welt) ──────────────────────────────────────────────────
  // Setzt das Ziel für N Tage im betroffenen Land lahm (Einkommen pausiert).
  async function castSabotage(attackerId, targetId, countryId, cost, days) {
    const { data, error } = await _sb.rpc('cast_sabotage', {
      p_attacker_id: attackerId, p_group_id: _groupId, p_target_id: targetId,
      p_country_id: countryId, p_cost: parseFloat(cost), p_days: parseInt(days, 10)
    });
    if (error) throw new Error(error.message);
    return data; // { ok, expires_at } oder { error }
  }

  // Aktive Sabotagen der Gruppe (für Anzeige im Länder-Sheet) — [] bei fehlender Tabelle
  async function fetchSabotages() {
    try {
      const { data, error } = await _sb.from('world_sabotage')
        .select('attacker_id, target_id, country_id, expires_at')
        .eq('group_id', _groupId).gt('expires_at', new Date().toISOString());
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }

  // ── Weltbündnisse (PLAN_weltbuendnisse.md) ───────────────────────────────────
  // Alle Bündnisse der Gruppe — [] bei fehlender Tabelle (Migration noch nicht ausgeführt).
  async function fetchAllWorldAlliances() {
    try {
      const { data, error } = await _sb.from('world_alliances')
        .select('id, type, member_a, member_b, country_a, country_b, payer_id, offer_cc, status, started_at, expires_at, last_tribut_at')
        .eq('group_id', _groupId);
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }

  // offerCc: nur bei type='handel' relevant (CC-Geschenk, fließt erst bei Annahme) — bei
  // frieden/schutz einfach 0 mitschicken (RPC ignoriert es dort serverseitig).
  async function proposeAlliance(memberId, type, countryId, targetMemberId, targetCountryId, offerCc) {
    const { data, error } = await _sb.rpc('propose_alliance', {
      p_member_id: memberId, p_group_id: _groupId, p_type: type,
      p_country_id: countryId, p_target_member_id: targetMemberId, p_target_country_id: targetCountryId,
      p_offer_cc: parseFloat(offerCc) || 0
    });
    if (error) throw new Error(error.message);
    return data; // { ok, status } oder { error }
  }

  async function respondAlliance(memberId, allianceId, accept) {
    const { data, error } = await _sb.rpc('respond_alliance', {
      p_member_id: memberId, p_group_id: _groupId, p_alliance_id: allianceId, p_accept: !!accept
    });
    if (error) throw new Error(error.message);
    return data; // { ok, status, type, member_a, member_b } oder { error }
  }

  // Housekeeping (Ablauf + Rang-1-Verlust) — [] bei fehlender Tabelle/RPC, sonst Liste
  // von { event:'expired'|'broken', id, type, member_a, member_b } für Chat-Broadcasts.
  async function reconcileWorldAlliances() {
    try {
      const { data, error } = await _sb.rpc('reconcile_world_alliances', { p_group_id: _groupId });
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }

  // Fälligen Friedensbündnis-Tribut einlösen (10% des wöchentlichen Welt-Einkommens
  // des Zahlers je aktivem Pakt, serverseitig auf 7 Tage gegated). Wert muss zu
  // ALLIANCE_TYPES.frieden.tributPct in alliances.js passen. Aufruf analog claimPassive
  // beim App-Start/Poll — kein Cron, robust (Fehler brechen den Login-Flow nicht).
  async function settleAllianceTributes(memberId) {
    const results = [];
    try {
      const { data: rows } = await _sb.from('world_alliances')
        .select('id, started_at, last_tribut_at')
        .eq('group_id', _groupId).eq('type', 'frieden').eq('status', 'active').eq('payer_id', memberId);
      const due = (rows || []).filter(r => {
        const base = r.last_tribut_at ? new Date(r.last_tribut_at) : new Date(r.started_at);
        return Date.now() - base.getTime() >= 7 * 24 * 3600 * 1000;
      });
      if (!due.length) return results;

      const { data: raw } = await _sb.from('members').select('*').eq('id', memberId).single();
      if (!raw) return results;
      const member = normalizeUser(raw);
      const rankMap = await _fetchWorldRankMap(memberId);
      const byCountry = Object.keys(rankMap).length ? await _fetchWorldBuildingsByCountry() : {};
      const gm = _gardeMult(member);
      const worldPerDay = (((typeof calcWorldPerDay === 'function') ? calcWorldPerDay(rankMap) : 0)
        + ((typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(rankMap, byCountry) : 0)) * gm;
      const tribut = Math.max(0, Math.round(worldPerDay * 7 * 0.10 * 100) / 100);

      for (const row of due) {
        try {
          const { data, error } = await _sb.rpc('pay_alliance_tribut', {
            p_member_id: memberId, p_group_id: _groupId, p_alliance_id: row.id, p_amount: tribut
          });
          if (!error && data && data.ok) results.push(data);
        } catch (e) { /* einzelnes Bündnis überspringen, Rest weiterlaufen lassen */ }
      }

      // Tages-Log (Zahler-Sicht — der Empfänger erfährt seinen Zugewinn nur über den
      // steigenden Kontostand, analog zu anderen serverseitigen CC-Transfers wie
      // Sabotage/CIQ-Angriffen): -CC-Zeile je tatsächlich bezahltem Tribut.
      const paid = results.filter(r => r.amount_paid > 0);
      if (paid.length) {
        try {
          const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
          const logEntries = paid.map(r => ({ label: `🕊️ Friedenstribut → ${r.receiver_name || '?'}`, amount: -r.amount_paid, cat: 'welt' }));
          const md = appendTodayLog((fresh && fresh.map_data) || member.map_data, logEntries);
          await updateMapData(memberId, md);
        } catch (e) { console.warn('Tribut-Log konnte nicht gespeichert werden:', e); }
        // 🤝 Empfänger-Seite (offline): Lifetime-Zähler „aus Bündnis erhalten" + Transparenz-Log via
        // Fresh-Merge auf fremdes map_data (Muster wie Schatzräuber-Beute). pay_alliance_tribut hat die
        // Coins bereits gutgeschrieben — hier nur Zähler + Log. Nicht-kritisch (darf Payer-Flow nie brechen).
        for (const r of paid) {
          if (!r.receiver_id) continue;
          try {
            const { data: rf } = await _sb.from('members').select('map_data').eq('id', r.receiver_id).single();
            let rmd = appendTodayLog((rf && rf.map_data) || {}, [{ label: `🕊️ Friedenstribut erhalten von ${member.name}`, amount: r.amount_paid }]);
            rmd = { ...rmd, allianceCcEarned: Math.round(((rmd.allianceCcEarned || 0) + r.amount_paid) * 100) / 100 };
            await updateMapData(r.receiver_id, rmd);
          } catch (e) { /* non-critical */ }
        }
      }
    } catch (e) { console.warn('Bündnis-Tribut fehlgeschlagen:', e.message); }
    return results;
  }

  // Steuer-Statistik je Member (erhalten/gezahlt, Woche + gesamt).
  // Resilient: {} falls Migration 19d (world_tax_log + get_world_tax_stats) noch nicht ausgeführt.
  async function fetchTaxStats() {
    const { data, error } = await _sb.rpc('get_world_tax_stats', { p_group_id: _groupId });
    if (error) return {};
    const map = {};
    for (const r of (data || [])) {
      map[r.member_id] = {
        received_total: Number(r.received_total) || 0,
        received_7d:    Number(r.received_7d)    || 0,
        paid_total:     Number(r.paid_total)     || 0,
        paid_7d:        Number(r.paid_7d)        || 0,
      };
    }
    return map;
  }

  // ── Pinnwand ─────────────────────────────────────────────────────────────────
  async function getPinnedMessage() {
    const { data } = await _sb.from('groups_public')
      .select('pinned_message, pinned_by, pinned_at').eq('id', _groupId).single();
    return data || {};
  }

  async function setPinnedMessage(message, userName) {
    await _sb.from('groups').update({
      pinned_message: message.trim(), pinned_by: userName, pinned_at: new Date().toISOString()
    }).eq('id', _groupId);
  }

  async function clearPinnedMessage() {
    await _sb.from('groups').update({
      pinned_message: null, pinned_by: null, pinned_at: null
    }).eq('id', _groupId);
  }

  // ── Barista-Bart-Anteil ──────────────────────────────────────────────────────
  // Jeder ANDERE Mitspieler mit gekauftem Barista Bart erhält +1 CC, wenn irgendwer
  // einen Schatz findet (der Finder bekommt seinen +1 weiterhin lokal in imperium.js).
  // Nutzt add_coins + save_map_data wie der Handelshafen-Anteil — keine neue RPC nötig.
  async function payBaristaBartGroup(finderId) {
    try {
      const { data: members } = await _sb.from('members')
        .select('id, map_data').eq('group_id', _groupId);
      let count = 0;
      for (const m of (members || [])) {
        if (m.id === finderId) continue;            // Finder bekommt seinen Bonus lokal
        const upg = m.map_data?.upgrades || {};
        if (!upg.barista_bart) continue;
        await _sb.rpc('add_coins', { p_member_id: m.id, p_amount: 1 });
        try {
          // aggKey: alle Bart-Anteile eines Tages landen in EINEM Eintrag („🧔 Barista-Bart-Anteil ×N"),
          // sonst verdrängen viele 1-CC-Zeilen bei aktiver Gruppe den Rest aus dem 50er-Fenster.
          // appendTodayLogFresh statt appendTodayLog(m.map_data): das batch-gefetchte map_data ist
          // veraltet, sobald der Spieler parallel etwas schreibt (Clobber-Vektor wie in applyDailyLevy).
          await appendTodayLogFresh(m.id, [{ label: '🧔 Barista-Bart-Anteil', amount: 1, cat: 'karte',
                                             aggKey: 'barista_bart' }]);
        } catch (e) { /* Log-Fehler nicht eskalieren */ }
        count++;
      }
      return count;
    } catch (e) { console.warn('Barista-Bart-Anteil fehlgeschlagen:', e.message); return 0; }
  }

  // ── Karten-Malus an die Gruppenkasse ─────────────────────────────────────────
  // Verlorene CC aus Karten-Events (cc_penalty: Strafzoll/Bußgeld) fließen in die
  // Gruppenkasse — analog zur Koffein-Strafe. Unter reserviertem _penalties-Key:
  // zählt NICHT als „Wohltäter"-Beitrag und NICHT zur Kassen-Stufe. Die CC werden
  // zuvor in imperium.js per spendCoins vom Member abgezogen; hier nur die Kasse erhöhen.
  async function addPenaltyToTreasury(amount) {
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (amt <= 0) return 0;
    try {
      const t = await fetchTreasury();
      const contribs = { ...(t.contributions || {}) };
      contribs._penalties = Math.round(((parseFloat(contribs._penalties) || 0) + amt) * 100) / 100;
      const newBal = Math.round(((parseFloat(t.balance) || 0) + amt) * 100) / 100;
      await _sb.from('group_treasury').upsert(
        { group_id: _groupId, balance: newBal, contributions: contribs, unlocked_goals: t.unlocked_goals || {} },
        { onConflict: 'group_id' });
      return amt;
    } catch (e) { console.warn('Karten-Malus → Gruppenkasse fehlgeschlagen:', e.message); return 0; }
  }

  // Eigene-Tasse-Anteil (group_cup_1)
  // Wer die Forschungs-Kombo eigene_tasse besitzt, erhaelt +1 CC pro 10 Tassen
  // die ANDERE Mitspieler eintragen. Fire-and-forget aus addCups.
  // finderId = Member der gerade Tassen eingetragen hat (bekommt KEINEN Anteil).
  async function payEigeneTasseGroup(finderId, amount) {
    const cups = parseInt(amount) || 0;
    if (cups <= 0) return 0;
    const bonus = Math.floor(cups / 10); // +1 CC pro 10 Tassen, abgerundet
    if (bonus <= 0) return 0;
    try {
      const { data: members } = await _sb.from('members')
        .select('id, research, map_data').eq('group_id', _groupId);
      let count = 0;
      for (const m of (members || [])) {
        if (m.id === finderId) continue;
        if (!(m.research || {}).eigene_tasse) continue;
        await _sb.rpc('add_coins', { p_member_id: m.id, p_amount: bonus });
        try {
          const ml = appendTodayLog(m.map_data, [{ label: '+' + cups + ' Tassen (Eigene Tasse)', amount: bonus, cat: 'tassen' }]);
          await _sb.rpc('save_map_data', { p_member_id: m.id, p_map_data: ml });
        } catch (e) {}
        count++;
      }
      return count;
    } catch (e) { console.warn('Eigene-Tasse-Anteil fehlgeschlagen:', e.message); return 0; }
  }

  // ── Kaffee-Quiz (CIQ) ──────────────────────────────────────────────────────
  // Aller Quiz-Zugriff läuft über SECURITY-DEFINER-RPCs (Antwortschlüssel ist für
  // anon nicht lesbar). Jede Funktion gibt die RPC-Nutzdaten zurück oder {error}.
  async function quizStatus(memberId) {
    if (!memberId || !_groupId) return { error: 'no_session' };
    const { data, error } = await _sb.rpc('quiz_status', { p_member_id: memberId, p_group_id: _groupId });
    if (error) return { error: error.message };
    return data || {};
  }
  async function quizStart(memberId) {
    if (!memberId || !_groupId) return { error: 'no_session' };
    const { data, error } = await _sb.rpc('quiz_start', { p_member_id: memberId, p_group_id: _groupId });
    if (error) return { error: error.message };
    return data || {};
  }
  async function quizAnswer(attemptId, questionId, chosen, ms) {
    const { data, error } = await _sb.rpc('quiz_answer', {
      p_attempt_id: attemptId, p_question_id: questionId,
      p_chosen: chosen, p_ms: ms,
    });
    if (error) return { error: error.message };
    return data || {};
  }
  async function quizFinalize(attemptId) {
    const { data, error } = await _sb.rpc('quiz_finalize', { p_attempt_id: attemptId });
    if (error) return { error: error.message };
    return data || {};
  }
  async function quizGroupReveal(periodId) {
    if (!_groupId) return { error: 'no_session' };
    const { data, error } = await _sb.rpc('quiz_group_reveal', { p_group_id: _groupId, p_period_id: periodId });
    if (error) return { error: error.message };
    return data || {};
  }

  // ── Feedback-Umfrage (plans/Umfrage.md) ──────────────────────────────────────
  async function submitSurvey(memberId, periodKey, ratings, suggestions, freetext) {
    const { data, error } = await _sb.rpc('submit_survey', {
      p_member_id:  memberId,
      p_group_id:   _groupId,
      p_period_key: periodKey,
      p_ratings:    ratings || {},
      p_suggestions: suggestions || [],
      p_freetext:   freetext || null,
    });
    if (error) throw new Error(error.message);
    return data; // { ok, reward } | { error }
  }
  // Hat DIESES Mitglied in DIESER Periode schon abgestimmt? (leichter Popup-Gate-Check)
  async function surveyMyResponse(memberId, periodKey) {
    if (!_groupId) return null;
    const { data, error } = await _sb.from('survey_responses')
      .select('id').eq('group_id', _groupId).eq('member_id', memberId).eq('period_key', periodKey).maybeSingle();
    if (error) return null;
    return data || null;
  }
  // Alle Antworten der Gruppe (Ergebnis-Anzeige + Admin-Export). [] bei fehlender Tabelle.
  async function fetchAllSurveyResponses() {
    if (!_groupId) return [];
    try {
      const { data, error } = await _sb.from('survey_responses')
        .select('member_id, period_key, ratings, suggestions, freetext, created_at')
        .eq('group_id', _groupId).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }

  // ── Achievements direkt vergeben (z.B. für Dungeon-Erfolge) ─────────────────
  async function grantAchievements(memberId, newAchs) {
    const u = (typeof appData !== 'undefined' && appData?.users) ? appData.users.find(u => u.id === memberId) : null;
    const merged = { ...(u?.achievements || {}), ...newAchs };
    const { error } = await _sb.from('members').update({ achievements: merged }).eq('id', memberId);
    if (error) throw new Error(error.message);
    return merged;
  }

  // ── Kaffee-Jagd Minigame ──────────────────────────────────────────────────
  async function startMinigame(memberId) {
    const { data, error } = await _sb.rpc('start_minigame', {
      p_member_id: memberId,
      p_group_id:  _groupId,
    });
    if (error) throw new Error(error.message);
    return data; // { session_id } | { error, next_play? }
  }

  async function claimMinigame(sessionId, memberId, score, durationMs) {
    const { data, error } = await _sb.rpc('claim_minigame', {
      p_session_id:  sessionId,
      p_member_id:   memberId,
      p_score:       score,
      p_duration_ms: durationMs,
    });
    if (error) throw new Error(error.message);
    return data; // { coins_awarded, score } | { error }
  }

  async function getMinigameStatus(memberId) {
    const { data, error } = await _sb.rpc('get_minigame_status', {
      p_member_id: memberId,
    });
    if (error) throw new Error(error.message);
    return data || {}; // { can_play, in_first_week, next_play, played_today, claimed, coins_awarded, score }
  }

  // ── 🚐 Kaffeemobil (Erlebnis-Minigame #2) ────────────────────────────────────
  // Der Graph (Städte/Kanten) ist server-seitiger Content — einmal lesen, Client cached.
  async function fetchMobilGraph() {
    const [c, e] = await Promise.all([
      _sb.from('mobil_cities').select('id,name,continent,x,y,dist_rank,is_port,is_air'),
      _sb.from('mobil_edges').select('a,b,kind,cost_cc,duration_min'),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (e.error) throw new Error(e.error.message);
    return { cities: c.data || [], edges: e.data || [] };
  }
  // Reise starten — Kosten/Dauer/Ankunftszeit server-autoritativ; Client liefert nur die Ziel-ID.
  async function startTrip(memberId, toId) {
    const { data, error } = await _sb.rpc('start_trip', {
      p_member_id: memberId, p_group_id: _groupId, p_to: toId,
    });
    if (error) throw new Error(error.message);
    return data; // { ok, from, to, kind, cost, arriveAt, coins, mobil } | { error }
  }
  // Ankunft einlösen — Reward/Stadt/Zähler server-seitig; nur wenn arriveAt erreicht (Server-Uhr).
  async function claimArrival(memberId) {
    const { data, error } = await _sb.rpc('claim_arrival', {
      p_member_id: memberId, p_group_id: _groupId,
    });
    if (error) throw new Error(error.message);
    return data; // { ok, city, reward, firstVisit, uniqueCount, farthest, dist, mobil } | { error }
  }

  // ══ 🚀 Weltraum (P1) ════════════════════════════════════════════════════════
  // Alle Aufrufe try/catch-gekapselt und mit einem { error }-Objekt als Rückfall:
  // solange die Migration nicht eingespielt ist, fehlen Tabelle/Funktionen — die App
  // darf davon nie abstürzen (CLAUDE.md Regel 3), der Weltraum-Tab zeigt dann nur einen Hinweis.
  // Rohstoffe (Erz/Kristall) laufen NIE über den CC-Ledger — nur die CC-Beträge unten.

  async function ensureGalaxy() {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('ensure_galaxy', { p_group_id: _groupId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function fetchGalaxy() {
    try {
      if (!_groupId) return { planets: [], revealed: {} };
      const [pl, cl] = await Promise.all([
        _sb.from('space_planets').select('*').eq('group_id', _groupId),
        _sb.from('space_clan').select('*').eq('group_id', _groupId).maybeSingle(),
      ]);
      return { planets: pl.data || [], revealed: (cl.data && cl.data.revealed) || {} };
    } catch (e) { console.warn('fetchGalaxy:', e.message); return { planets: [], revealed: {} }; }
  }

  async function saveSpace(memberId, space) {
    try {
      const { data, error } = await _sb.rpc('save_space', { p_member_id: memberId, p_space: space || {} });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Schiffsbau — CC-Ausgabe wird als Investition geloggt (invest:true, wie Forschung/Welt-Ausbau)
  async function buildSpace(memberId, ship, count, cc, erz, kristall) {
    try {
      const { data, error } = await _sb.rpc('build_space', {
        p_member_id: memberId, p_ship: ship, p_count: count | 0,
        p_cc: cc || 0, p_erz: erz || 0, p_kristall: kristall || 0 });
      if (error) return { error: error.message };
      if (data && data.ok && (data.cc || 0) > 0) {
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🚀 Raumschiffbau beauftragt: ${ship} ×${data.count}`, amount: -data.cc,
            cat: 'weltraum', detail: 'Werft am Raumhafen', invest: true, aggKey: 'space_build' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Raumhafen ausbauen / Geschütz bauen / Geschütz aufrüsten.
  // Anders als buildSpace schickt der Client hier KEINE Kosten mit — build_space_defense
  // rechnet sie selbst aus _space_port_stats/_space_turret_stats. Der Betrag für das
  // Tages-Log kommt deshalb aus der Antwort zurück.
  async function buildSpaceDefense(memberId, action, slot, type) {
    try {
      const { data, error } = await _sb.rpc('build_space_defense', {
        p_member_id: memberId, p_action: action,
        p_slot: slot || null, p_type: type || null });
      if (error) return { error: error.message };
      if (data && data.ok && (data.cc || 0) > 0) {
        const label = action === 'port_upgrade'
          ? `🛰️ Raumhafen-Ausbau (Stufe ${data.level})`
          : `🛡️ Geschütz ${action === 'turret_build' ? 'gebaut' : 'aufgerüstet'}: ${data.type} (St. ${data.level})`;
        try {
          await appendTodayLogFresh(memberId, [{
            label, amount: -data.cc, cat: 'weltraum',
            detail: 'Verteidigung am Raumhafen', invest: true, aggKey: 'space_defense' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // ── Weltraum P2: KI-Angriffswellen + Hilferufe ────────────────────────────
  // 🔬 Weltraum-Technik kaufen. Kosten/Voraussetzung rechnet der SERVER
  // (buy_space_tech) — der Client schickt nur den Schlüssel.
  async function buySpaceTech(memberId, tech) {
    try {
      const { data, error } = await _sb.rpc('buy_space_tech', { p_member_id: memberId, p_tech: tech });
      if (error) return { error: error.message };
      if (data && data.ok && (data.cc || 0) > 0) {
        try {
          await appendTodayLogFresh(memberId, [{ label: `🔬 Weltraum-Technik: ${tech}`,
            amount: -data.cc, cat: 'weltraum', detail: 'Forschungsbaum', invest: true }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function ensureSpaceWave(memberId) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('ensure_space_wave', {
        p_member_id: memberId, p_group_id: _groupId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Offene Wellen der ganzen Gruppe — daraus speist sich die Hilferuf-Liste.
  // Die abgewehrten interessieren niemanden mehr, deshalb nur `pending`.
  async function fetchSpaceWaves() {
    try {
      if (!_groupId) return [];
      const { data, error } = await _sb.from('space_waves')
        .select('id, member_id, arrive_at, strength, tier, help_open')
        .eq('group_id', _groupId).eq('status', 'pending')
        .order('arrive_at', { ascending: true });
      if (error) return [];
      return data || [];
    } catch (e) { return []; }
  }

  async function fetchSpaceHelp(waveIds) {
    try {
      if (!waveIds || !waveIds.length) return [];
      const { data, error } = await _sb.from('space_help')
        .select('wave_id, helper_id, power, returned').in('wave_id', waveIds);
      if (error) return [];
      return data || [];
    } catch (e) { return []; }
  }

  async function requestSpaceHelp(memberId) {
    try {
      const { data, error } = await _sb.rpc('request_space_help', { p_member_id: memberId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function sendSpaceHelp(helperId, waveId, fleet) {
    try {
      const { data, error } = await _sb.rpc('send_space_help', {
        p_helper_id: helperId, p_wave_id: waveId, p_fleet: fleet || {} });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function resolveSpaceWave(memberId) {
    try {
      const { data, error } = await _sb.rpc('resolve_space_wave', { p_member_id: memberId });
      if (error) return { error: error.message };
      // Bergungsprämie ins Tages-Log — neue CC-Quelle, Rubrik existiert bereits
      if (data && data.resolved && (data.cc || 0) > 0) {
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🛡️ Angriffswelle abgewehrt (Bergung)`, amount: data.cc,
            cat: 'weltraum', detail: `Stärke ${Math.round(data.strength || 0)}`,
            aggKey: 'space_wave' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // ── 🤝 Clan-Handel: CC ↔ Erz/Kristall (migration_2026-07-22f) ────────────
  // Freier Angebotspreis, Rohstoffe beim Einstellen gesperrt (Server). Käufer-CC
  // ist eine Investition (wie Schiffsbau: CC → Sachwert), Verkäufer-CC eine echte
  // Einnahme — beides landet im Tages-Log (Statistik-Checkliste).
  async function fetchSpaceTrades() {
    try {
      if (!_groupId) return [];
      const { data, error } = await _sb.from('space_trades')
        .select('id, seller_id, seller_name, resource_type, amount, price_cc, created_at, kind')
        .eq('group_id', _groupId).eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } catch (e) { return []; }
  }

  // 🤝 v2 (22i): KAUFGESUCH — Gesucher zahlt den vom Server generierten Festpreis
  // sofort (CC-Sperre); Lieferant erfüllt und bekommt die CC.
  async function createSpaceRequest(memberId, type, amount) {
    try {
      const { data, error } = await _sb.rpc('create_space_request', {
        p_member_id: memberId, p_group_id: _groupId, p_type: type, p_amount: amount });
      if (error) return { error: error.message };
      if (data && data.ok && (data.price || 0) > 0) {
        const icon = type === 'erz' ? '🪨' : '💎';
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🤝 Kaufgesuch: ${Math.round(amount)} ${icon}`, amount: -data.price,
            cat: 'weltraum', invest: true, detail: 'CC gesperrt bis Lieferung/Rückzug',
            aggKey: 'space_trade_req' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // 🚀 Schiffshandel (22i): Anbieten sperrt die Schiffe; Zuschlag zahlt den
  // NORMALEN Kaufpreis (Server rechnet CC+Erz+Kristall) an den Anbieter, die
  // Schiffe landen sofort im Käufer-Hafen (keine Bauzeit).
  async function createSpaceShipOffer(memberId, ship, count) {
    try {
      const { data, error } = await _sb.rpc('create_space_ship_offer', {
        p_member_id: memberId, p_group_id: _groupId, p_ship: ship, p_count: count | 0 });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function buySpaceShipOffer(memberId, tradeId) {
    try {
      const { data, error } = await _sb.rpc('buy_space_ship_offer', {
        p_member_id: memberId, p_trade_id: tradeId });
      if (error) return { error: error.message };
      if (data && data.ok) {
        try {
          if ((data.cc || 0) > 0) await appendTodayLogFresh(memberId, [{
            label: `🤝 Schiff gekauft: ${data.count}× ${data.ship}`, amount: -data.cc,
            cat: 'weltraum', invest: true, detail: `von ${data.seller || 'Clan-Mitglied'}`,
            aggKey: 'space_trade_ship_buy' }]);
        } catch (e) {}
        try {
          if (data.seller_id && (data.cc || 0) > 0) await appendTodayLogFresh(data.seller_id, [{
            label: `🤝 Schiff verkauft: ${data.count}× ${data.ship}`, amount: data.cc,
            cat: 'weltraum', aggKey: 'space_trade_ship_sell', aggBase: '🤝 Clan-Handel (Schiffe)' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function fulfillSpaceRequest(memberId, tradeId) {
    try {
      const { data, error } = await _sb.rpc('fulfill_space_request', {
        p_member_id: memberId, p_trade_id: tradeId });
      if (error) return { error: error.message };
      if (data && data.ok) {
        const icon = data.type === 'erz' ? '🪨' : '💎';
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🤝 Clan-Handel: ${Math.round(data.amount)} ${icon} geliefert`,
            amount: data.price, cat: 'weltraum',
            detail: `an ${data.requester || 'Clan-Mitglied'}`,
            aggKey: 'space_trade_sell', aggBase: '🤝 Clan-Handel (Lieferungen)' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function createSpaceTrade(memberId, type, amount, price) {
    try {
      const { data, error } = await _sb.rpc('create_space_trade', {
        p_member_id: memberId, p_group_id: _groupId,
        p_type: type, p_amount: amount, p_price: price });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function cancelSpaceTrade(memberId, tradeId) {
    try {
      const { data, error } = await _sb.rpc('cancel_space_trade', {
        p_member_id: memberId, p_trade_id: tradeId });
      if (error) return { error: error.message };
      // Gesuch zurückgezogen → CC-Erstattung als reine Kapitalbewegung loggen
      // (kapital:true — die Sperre war als Investition gebucht, der Rückfluss darf
      // weder Einnahme noch erneute Investition zählen).
      if (data && data.ok && (data.refund_cc || 0) > 0) {
        try {
          await appendTodayLogFresh(memberId, [{
            label: '🤝 Kaufgesuch zurückgezogen', amount: data.refund_cc,
            kapital: true, detail: 'CC-Sperre erstattet' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function buySpaceTrade(memberId, tradeId) {
    try {
      const { data, error } = await _sb.rpc('buy_space_trade', {
        p_member_id: memberId, p_trade_id: tradeId });
      if (error) return { error: error.message };
      if (data && data.ok) {
        const icon = data.type === 'erz' ? '🪨' : '💎';
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🤝 Clan-Handel: ${Math.round(data.amount)} ${icon} gekauft`,
            amount: -data.price, cat: 'weltraum', invest: true,
            detail: `von ${data.seller || 'Clan-Mitglied'}`, aggKey: 'space_trade_buy' }]);
        } catch (e) {}
        try {
          if (data.seller_id) await appendTodayLogFresh(data.seller_id, [{
            label: `🤝 Clan-Handel: ${Math.round(data.amount)} ${icon} verkauft`,
            amount: data.price, cat: 'weltraum',
            aggKey: 'space_trade_sell', aggBase: '🤝 Clan-Handel (Verkäufe)' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Flotte zurückrufen — nur auf dem Hinflug. Der Server rechnet die neue Rückkehrzeit
  // selbst (Rückweg = bereits geflogene Zeit); der Client schickt bewusst keine Zeiten mit.
  // Werftauftrag: mehrere Typen auf einmal bestellen. Preise rechnet der Server.
  async function buildSpaceCart(memberId, cart) {
    try {
      const { data, error } = await _sb.rpc('build_space_cart', {
        p_member_id: memberId, p_cart: cart || {} });
      if (error) return { error: error.message };
      if (data && data.ok && (data.cc || 0) > 0) {
        const n = (Array.isArray(data.lines) ? data.lines : []).reduce((a, l) => a + (l.count || 0), 0);
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🚀 Raumschiffbau beauftragt: ${n} Schiff(e)`, amount: -data.cc,
            cat: 'weltraum', detail: 'Werft am Raumhafen', invest: true, aggKey: 'space_build' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Fertige Schiffe aus der Werft übernehmen.
  async function claimSpaceBuild(memberId) {
    try {
      const { data, error } = await _sb.rpc('claim_space_build', { p_member_id: memberId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Dauerernte-Route setzen (0 = auflösen).
  async function setSpaceRoute(memberId, planetId, count, mode) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('set_space_route', {
        p_member_id: memberId, p_group_id: _groupId,
        p_planet_id: planetId, p_count: count | 0, p_mode: mode || 'res' });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function recallSpaceTrip(memberId) {
    try {
      const { data, error } = await _sb.rpc('recall_space_trip', { p_member_id: memberId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function startSpaceTrip(memberId, planetId, intent, fleet, speedPct) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('start_space_trip', {
        p_member_id: memberId, p_group_id: _groupId, p_planet_id: planetId,
        p_intent: intent, p_fleet: fleet || {}, p_speed_pct: speedPct || 0 });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  // Rückkehr abrechnen. Beute-CC ist eine echte Einnahme → Tages-Log ohne invest-Flag.
  async function claimSpaceArrival(memberId) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('claim_space_arrival', {
        p_member_id: memberId, p_group_id: _groupId });
      if (error) return { error: error.message };
      if (data && data.ok && (data.cc || 0) > 0) {
        try {
          await appendTodayLogFresh(memberId, [{
            label: `🚀 Beute: ${data.planet || 'Planet'}`, amount: data.cc,
            cat: 'weltraum', detail: 'Weltraum-Einsatz', aggKey: 'space_loot',
            aggBase: '🚀 Weltraum-Beute' }]);
        } catch (e) {}
      }
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  async function harvestSpace(memberId) {
    try {
      const { data, error } = await _sb.rpc('harvest_space', { p_member_id: memberId });
      if (error) return { error: error.message };
      return data || {};   // reine Rohstoff-Gutschrift → kein CC-Ledger-Eintrag
    } catch (e) { return { error: e.message }; }
  }

  // 🏭 Raffinerie (26a): Erz+Kristall → CC im Batch. refine_start legt eine Charge
  // ein, refine_claim schreibt die fertige CC gut (wie die Beute-Gutschrift).
  async function refineStart(memberId, erz, kri) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('refine_start', {
        p_member_id: memberId, p_group_id: _groupId, p_erz: erz || 0, p_kri: kri || 0 });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }
  async function refineClaim(memberId) {
    try {
      if (!_groupId) return { error: 'no_group' };
      const { data, error } = await _sb.rpc('refine_claim', {
        p_member_id: memberId, p_group_id: _groupId });
      if (error) return { error: error.message };
      return data || {};
    } catch (e) { return { error: e.message }; }
  }

  return {
    init, setGroup, createGroup, joinGroup,
    fetchData, registerUser, addCups, closeSeason, autoCloseSeasonIfDue,
    getTitle, getSeasonId, getSeasonName, calcStreak,
    getLeaderboard, getDailyStats, getSeasons,
    fetchMonthStats, fetchYearSeasons,
    fetchMessages, postMessage,
    getPinnedMessage, setPinnedMessage, clearPinnedMessage,
    // Neu:
    spendCoins, fetchTreasury, contributeToTreasury, syncTreasuryGoals,
    applyDailyLevy, checkWeeklyChallenge,
    purchaseResearchItem, saveCosmetics, buyCiqPerk, applyCiqAttack, fetchMemberMapData,
    updateMapData, addCoins, appendTodayLog, appendTodayLogFresh, dayStats, claimPassive, recordSalarySnapshot, recordSalarySnapshotsAll,
    saveDungeonData, dungeonFight, buyKriegerItem, repairArmor, buyKriegerPotion, buyKriegerCompanion, buyKriegerMount,
    payBaristaBartGroup, addPenaltyToTreasury, payEigeneTasseGroup,
    claimLoginBonus, claimDailyTask,
    investInCountry, investPassive, withdrawPassive, fetchCountryStandings, fetchAllWorldInvestments,
    requestLoan, fundLoan, applyLoanRepayment, repayLoanEarly, cancelLoan, fetchGroupLoans, fetchMyContributions,
    fetchAllWorldBuildings, buildWorldStructure, buyGarde, fetchTaxStats,
    fetchAllProducerInvestments, fetchAllProducerTracks, fetchProducerStandings, upgradeProducerTrack, claimHarvest, claimSupply, sellBeans,
    castSabotage, fetchSabotages,
    fetchAllWorldAlliances, proposeAlliance, respondAlliance, reconcileWorldAlliances, settleAllianceTributes,
    quizStatus, quizStart, quizAnswer, quizFinalize, quizGroupReveal,
    submitSurvey, surveyMyResponse, fetchAllSurveyResponses,
    grantAchievements,
    startMinigame, claimMinigame, getMinigameStatus,
    fetchMobilGraph, startTrip, claimArrival,
    openCafe, buyCafeItem, claimCafe, setCafeBeans, depositCafe, setCafePolicy, setCafeStil, claimCafeTask, unlockCafeRecipe,
    ensureGalaxy, fetchGalaxy, saveSpace, buildSpace, buildSpaceDefense,
    startSpaceTrip, recallSpaceTrip, claimSpaceArrival, harvestSpace, claimSpaceBuild, buildSpaceCart, setSpaceRoute,
    refineStart, refineClaim,
    buySpaceTech, ensureSpaceWave, fetchSpaceWaves, fetchSpaceHelp,
    fetchSpaceTrades, createSpaceTrade, cancelSpaceTrade, buySpaceTrade,
    createSpaceRequest, fulfillSpaceRequest, createSpaceShipOffer, buySpaceShipOffer,
    requestSpaceHelp, sendSpaceHelp, resolveSpaceWave,
  };
})();
