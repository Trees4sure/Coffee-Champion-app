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
    };
  }

  // ── Tages-Log: woher kamen die CoffeeCoins heute? (Transparenz für Spieler) ──
  // Lebt in map_data.todayLog, wird bei Datumswechsel automatisch geleert.
  function appendTodayLog(mapData, entries) {
    if (!entries || !entries.length) return mapData || {};
    const day  = today();
    const prev = (mapData?.todayLog?.date === day) ? (mapData.todayLog.entries || []) : [];
    const next = [...prev, ...entries.map(e => ({ ...e, t: new Date().toISOString() }))].slice(-30);
    return { ...(mapData || {}), todayLog: { date: day, entries: next } };
  }

  // Passiv-Einkommen anteilig nach Forschung / Gebäude / Welt-Einfluss aufschlüsseln,
  // jeweils mit Quellen-Detail (woraus es entsteht — für „Heute erhalten").
  function _passiveLogEntries(member, passiveEarned, worldRankMap, worldByCountry, groupPerDay) {
    const rPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    const bPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const wRank   = (worldRankMap && typeof calcWorldPerDay === 'function') ? calcWorldPerDay(worldRankMap) : 0;
    const wBld    = (worldRankMap && typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(worldRankMap, worldByCountry) : 0;
    const wPerDay = wRank + wBld;
    const gPerDay = groupPerDay || 0;
    const tot = rPerDay + bPerDay + wPerDay + gPerDay;
    if (tot <= 0) return [{ label: '⚙️ Passiv-Einkommen', amount: passiveEarned }];
    const bShare = Math.round(passiveEarned * (bPerDay / tot) * 100) / 100;
    const wShare = Math.round(passiveEarned * (wPerDay / tot) * 100) / 100;
    const gShare = Math.round(passiveEarned * (gPerDay / tot) * 100) / 100;
    const rShare = Math.round((passiveEarned - bShare - wShare - gShare) * 100) / 100;
    const wDetail = [
      (typeof worldPerDayDetail === 'function') ? worldPerDayDetail(worldRankMap) : '',
      (typeof worldBuildingPerDayDetail === 'function') ? worldBuildingPerDayDetail(worldRankMap, worldByCountry) : '',
    ].filter(Boolean).join(', ');
    const out = [];
    if (rShare > 0) out.push({ label: '⚙️ Forschung (passiv)', amount: rShare, detail: (typeof researchPerDayDetail === 'function') ? researchPerDayDetail(member.research) : '' });
    if (bShare > 0) out.push({ label: '🏗️ Gebäude-Einkommen',  amount: bShare, detail: (typeof buildingPerDayDetail === 'function') ? buildingPerDayDetail(member.map_data?.buildings || {}) : '' });
    if (wShare > 0) out.push({ label: '🌍 Welt-Einfluss',       amount: wShare, detail: wDetail });
    if (gShare > 0) out.push({ label: '🏛️ Gruppenkasse (passiv)', amount: gShare, detail: `+${gPerDay} CC/Tag für alle` });
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
    const [m, ds, s, h, wi, wb, tr] = await Promise.all([
      _sb.from('members').select('*').eq('group_id', _groupId).order('total_cups', { ascending: false }),
      _sb.from('daily_stats').select('*').eq('group_id', _groupId).order('date', { ascending: false }).limit(90),
      _sb.from('seasons').select('*').eq('group_id', _groupId).order('season_id', { ascending: false }),
      _sb.from('hall_of_fame').select('*').eq('group_id', _groupId).maybeSingle(),
      // Welt-Daten (Phase 1.5): liefern {data:null,error} falls noch nicht migriert → []. Kein Reject.
      _sb.from('world_investments').select('member_id, country_id, total_invested, garde_purchased').eq('group_id', _groupId),
      _sb.from('world_buildings').select('member_id, country_id, building_id, level').eq('group_id', _groupId),
      _sb.from('group_treasury').select('balance, contributions, unlocked_goals').eq('group_id', _groupId).maybeSingle(),
    ]);
    return {
      users: (m.data || []).map(normalizeUser),
      dailyStats: Object.fromEntries((ds.data || []).map(d => [d.date, { date: d.date, total: d.total, entries: d.stats || {} }])),
      seasons: s.data || [],
      halloffame: h.data || {},
      worldInvestments: wi.data || [],
      worldBuildings: wb.data || [],
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
  async function _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry) {
    const researchPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    const buildingPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const rankMap = worldRankMap || await _fetchWorldRankMap(memberId);
    const byCountry = worldByCountry || (Object.keys(rankMap).length ? await _fetchWorldBuildingsByCountry() : {});
    const _gm = _gardeMult(member);
    const worldPerDay = Math.round(((typeof calcWorldPerDay === 'function') ? calcWorldPerDay(rankMap) : 0) * _gm * 100) / 100;
    const worldBldPerDay = Math.round(((typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(rankMap, byCountry) : 0) * _gm * 100) / 100;
    const groupPerDay = (await _fetchGroupPerks()).perDay || 0; // Gruppenkasse-Passiv für alle
    const perDay = researchPerDay + buildingPerDay + worldPerDay + worldBldPerDay + groupPerDay;
    if (perDay <= 0) return 0;

    const cosm = member.cosmetics || {};
    const lastClaim = cosm.lastPassiveClaim ? new Date(cosm.lastPassiveClaim) : new Date(member.joinDate || today());
    const hoursDiff = (Date.now() - lastClaim.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 1) return 0; // Max einmal pro Stunde

    const earned  = Math.round(perDay * (hoursDiff / 24) * 100) / 100;
    const capped  = Math.min(earned, perDay * 4); // Max 4 Tages-Passiv auf einmal (deckt Wochenende/Abwesenheit ab)
    if (capped < 0.01) return 0;

    await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: capped });
    const newCosmetics = { ...cosm, lastPassiveClaim: new Date().toISOString() };
    await _sb.from('members').update({ cosmetics: newCosmetics }).eq('id', memberId);
    return capped;
  }

  // ── Passives Einkommen EIGENSTÄNDIG einlösen (entkoppelt von Tassen) ──────────
  // Damit das passive Einkommen wirklich passiv ist: wird beim App-Start und
  // periodisch aufgerufen, nicht nur beim Tassen-Eintrag. Zeitbasiert (kein Cron),
  // _checkAndClaimPassive begrenzt selbst auf max. 1×/Stunde und 2 Tages-Passiv.
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
      const worldByCountry = Object.keys(worldRankMap).length ? await _fetchWorldBuildingsByCountry() : {};
      const earned = await _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry);
      if (earned > 0) {
        // Tages-Log (Forschung / Gebäude / Welt / Gruppenkasse anteilig + Quellen-Detail) — Fehler nicht eskalieren
        try {
          const gPerDay = (await _fetchGroupPerks()).perDay || 0;
          // map_data UNMITTELBAR vor dem Write frisch lesen und nur todayLog mergen:
          // sonst überschreibt ein zeitgleicher Gehalts-Snapshot (recordSalarySnapshotsAll
          // läuft ebenfalls bei showApp) den eben angehängten Passiv-Eintrag — und umgekehrt.
          // Das Write-Fenster schrumpft so auf einen RPC (wie in _writeSalaryPoint).
          const { data: fresh } = await _sb.from('members').select('map_data').eq('id', memberId).single();
          const md = appendTodayLog((fresh && fresh.map_data) || member.map_data,
            _passiveLogEntries(member, earned, worldRankMap, worldByCountry, gPerDay));
          await updateMapData(memberId, md);
        } catch (e) { console.warn('Passiv-Log konnte nicht gespeichert werden:', e); }
      }
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
      const { data: raw } = await _sb.from('members').select('map_data').eq('id', memberId).single();
      const md  = (raw && raw.map_data) || {};
      const lb  = md.loginBonus || {};
      const day = today();
      if (lb.lastDate === day) return 0; // heute bereits eingelöst
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yStr   = y.toISOString().slice(0, 10);
      const streak = (lb.lastDate === yStr) ? ((lb.streak || 0) + 1) : 1; // Lücke → Serie startet neu
      const reward = (typeof loginBonusFor === 'function') ? loginBonusFor(streak) : Math.min(5 + (streak - 1) * 2, 25);
      await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: reward });
      const md2 = appendTodayLog({ ...md, loginBonus: { lastDate: day, streak } },
                    [{ label: `📅 Login-Bonus (Tag ${streak})`, amount: reward }]);
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
      const { data: raw } = await _sb.from('members').select('map_data, name').eq('id', memberId).single();
      const md     = (raw && raw.map_data) || {};
      const claims = { ...(md.taskClaims || {}) };
      if (claims[periodKey]) return { already: true };
      claims[periodKey] = { taskId, at: new Date().toISOString() };
      // alte Perioden beschneiden (nur die letzten ~12 behalten)
      const keys = Object.keys(claims).sort();
      while (keys.length > 12) delete claims[keys.shift()];
      const amt = Math.max(0, parseFloat(reward) || 0);
      if (amt > 0) await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: amt });
      const md2 = appendTodayLog({ ...md, taskClaims: claims },
                    [{ label: '✨ Kaffee-Aufgabe', amount: amt }]);
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
    const bc        = byCountry || (Object.keys(rankMap).length ? await _fetchWorldBuildingsByCountry() : {});
    const pk        = perks || await _fetchGroupPerks();
    const gm        = _gardeMult(member);

    const resDay = (typeof calcResearchPerDay === 'function')      ? calcResearchPerDay(research) : 0;
    const bldDay = (typeof calcBuildingPerDay === 'function')      ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const wDay   = (typeof calcWorldPerDay === 'function')         ? calcWorldPerDay(rankMap) * gm : 0;
    const wbDay  = (typeof calcWorldBuildingPerDay === 'function') ? calcWorldBuildingPerDay(rankMap, bc) * gm : 0;
    const perDay = Math.round((resDay + bldDay + wDay + wbDay + (pk.perDay || 0)) * 100) / 100;

    const resCup = (typeof calcResearchPerCup === 'function')      ? calcResearchPerCup(research) : 0;
    const wCup   = (typeof calcWorldPerCup === 'function')         ? calcWorldPerCup(rankMap) * gm : 0;
    const wbCup  = (typeof calcWorldBuildingPerCup === 'function') ? calcWorldBuildingPerCup(rankMap, bc) * gm : 0;
    const perCup = Math.round((resCup + wCup + wbCup + (pk.perCup || 0)) * 100) / 100;

    // Realisiertes Gesamteinkommen HEUTE (alle Quellen: Tassen, Schätze, Forschung,
    // Welt, Login, Aufgaben …) aus dem Tages-Log — so erfasst der Verlauf nicht nur
    // das passive Einkommen, sondern was tatsächlich reinkam.
    const tl    = member.map_data && member.map_data.todayLog;
    const gross = (tl && tl.date === today())
      ? Math.round((tl.entries || []).reduce((s, e) => s + (e.amount > 0 ? e.amount : 0), 0) * 100) / 100
      : 0;

    return { day: perDay, cup: perCup, coins: Math.round(member.coins || 0), gross };
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
    const entry  = { ts: bucket, day: sal.day, cup: sal.cup, coins: sal.coins, gross: sal.gross };
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

    // Tageslimit prüfen: normal 15 Tassen/Tag — aber wenn gestern >6 Tassen getrunken
    // wurden, ist heute eine Koffein-Red-Flag aktiv (map_data.caffeineFlag === heute) → max. 3.
    const { data: todayStats } = await _sb.from('daily_stats').select('*')
      .eq('group_id', _groupId).eq('date', dateStr).maybeSingle();
    const alreadyToday = (todayStats?.stats || {})[memberId] || 0;
    const caffeineActive = rawMember.map_data?.caffeineFlag === dateStr;
    const dailyMax = caffeineActive ? 3 : 15;
    if (alreadyToday + amount > dailyMax) {
      throw new Error(caffeineActive
        ? `🚩 Koffein-Limit aktiv: wegen zu viel Koffein gestern heute nur ${dailyMax} Tassen (bereits ${alreadyToday} erfasst).`
        : `Tageslimit erreicht: heute bereits ${alreadyToday} von ${dailyMax} Tassen erfasst.`);
    }
    // Red-Flag für MORGEN: wer heute mit diesem Eintrag über 6 Tassen kommt, wird morgen
    // auf 3 gedrosselt (einmal pro Tag setzen, nicht bei jeder weiteren Tasse neu).
    const personalToday = alreadyToday + amount;
    const tomorrowStr   = new Date(Date.parse(dateStr + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const caffeineRedFlag = personalToday > 6 && rawMember.map_data?.caffeineFlag !== tomorrowStr;
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

    // Top-1 Achievement: nur bei echter Konkurrenz (mind. 2 Mitglieder), nicht trivial beim ersten Eintrag
    if (!achievements.top1) {
      const { data: groupMembers } = await _sb.from('members').select('id, total_cups').eq('group_id', _groupId);
      if ((groupMembers || []).length > 1) {
        const othersMax = Math.max(0, ...groupMembers.filter(m => m.id !== memberId).map(m => m.total_cups || 0));
        if (newTotal > othersMax) {
          achievements.top1 = true;
          const top1Ach = ACHIEVEMENTS.find(a => a.id === 'top1');
          if (top1Ach) allNew.push(top1Ach);
        }
      }
    }

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
    const researchBonus = (typeof calcResearchPerCup === 'function')
      ? Math.round(amount * calcResearchPerCup(member.research) * 100) / 100
      : 0;
    // Welt-Einfluss-Bonus pro Tasse (eigene Länder-Ränge + rangabhängige Land-Gebäude) — robust, 0 falls Backend fehlt
    const worldRankMap = await _fetchWorldRankMap(memberId);
    const worldByCountry = Object.keys(worldRankMap).length ? await _fetchWorldBuildingsByCountry() : {};
    const worldPerCup = Math.round((((typeof calcWorldPerCup === 'function' ? calcWorldPerCup(worldRankMap) : 0)
                      + (typeof calcWorldBuildingPerCup === 'function' ? calcWorldBuildingPerCup(worldRankMap, worldByCountry) : 0))
                      * _gardeMult(member)) * 100) / 100;
    const worldBonus = Math.round(amount * worldPerCup * 100) / 100;
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

    let totalCoins = baseCoins + morningBonus + researchBonus + worldBonus + groupBonus + achCoinTotal + streakBonus;

    if (totalCoins > 0) {
      const { error: coinErr } = await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: totalCoins });
      if (coinErr) { console.error('add_coins fehlgeschlagen:', coinErr.message); totalCoins = 0; }
    }
    // Eigene Tasse: alle ANDEREN Mitspieler mit der Kombo erhalten +1 CC pro 10 Tassen
    payEigeneTasseGroup(memberId, amount).catch(() => {});

    // Passiv-Einkommen prüfen (Welt-Ränge + Gebäude wiederverwenden, kein Doppel-Fetch)
    const passiveEarned = await _checkAndClaimPassive(memberId, member, worldRankMap, worldByCountry);

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
    const weekendCupIncome = Math.round((baseCoins + morningBonus + researchBonus + worldBonus + groupBonus) * 100) / 100;
    const weekendLevy = isWeekend
      ? Math.round(Math.max(0, Math.min(weekendCupIncome, (member.coins || 0) + totalCoins - caffeinePenalty)) * 100) / 100
      : 0;

    // Tages-Log aktualisieren (woher kamen die Coins?) — Fehler hier dürfen den Tassen-Eintrag nicht blockieren
    try {
      const logEntries = [];
      if (baseCoins + morningBonus > 0) {
        logEntries.push({ label: amount > 1 ? `☕ ${amount} Tassen` : '☕ Tasse', amount: Math.round((baseCoins + morningBonus) * 100) / 100 });
      }
      if (researchBonus > 0) {
        const detail = (typeof researchPerCupDetail === 'function')
          ? researchPerCupDetail(member.research, amount, calcResearchPerCup(member.research)) : '';
        logEntries.push({ label: '🔬 Forschung', amount: researchBonus, detail });
      }
      if (worldBonus > 0) {
        const detail = (typeof worldPerCupDetail === 'function')
          ? `${amount}× à ${worldPerCup}/Tasse · ${worldPerCupDetail(worldRankMap)}` : '';
        logEntries.push({ label: '🌍 Welt-Einfluss', amount: worldBonus, detail });
      }
      if (groupBonus > 0) {
        logEntries.push({ label: '🏛️ Gruppenkasse', amount: groupBonus, detail: `${amount}× à ${groupPerks.perCup}/Tasse (Gruppen-Effekt)` });
      }
      for (const a of allNew) {
        if (a?.coinReward) logEntries.push({ label: `🏆 ${a.name || a.id}`, amount: a.coinReward });
      }
      if (streakBonus > 0) logEntries.push({ label: `🔥 Streak ${newStreak}`, amount: streakBonus });
      if (caffeinePenalty > 0) logEntries.push({ label: '🚩 Koffein-Strafe → Gruppenkasse', amount: -caffeinePenalty });
      if (weekendLevy > 0)     logEntries.push({ label: '📅 Wochenend-Abgabe → Gruppenkasse', amount: -weekendLevy });
      if (passiveEarned > 0) {
        for (const e of _passiveLogEntries(member, passiveEarned, worldRankMap, worldByCountry, groupPerks.perDay)) logEntries.push(e);
      }

      let md = member.map_data || {};
      if (logEntries.length) md = appendTodayLog(md, logEntries);
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
          if (amt < 0.01) continue;
          const bal = parseFloat(member.coins) || 0;
          if (amt > bal) amt = Math.round(bal * 100) / 100; // aufs Guthaben deckeln, nie Minus
          if (amt < 0.01) continue;
          const left = await spendCoins(member.id, amt);
          if (left === null || left === undefined) continue; // unerwartet nicht genug — überspringen
          levied = Math.round((levied + amt) * 100) / 100;
          contribs[member.id] = Math.round(((parseFloat(contribs[member.id]) || 0) + amt) * 100) / 100;
          details.push({ name: member.name, amt });
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

    const item  = allItems.find(i => i.id === itemId);
    const combo = allCombos.find(c => c.id === itemId);
    if (!item && !combo) throw new Error('Item nicht gefunden');

    const target = item || combo;
    const cost   = target.cost || 0;

    const { data: raw } = await _sb.from('members')
      .select('coins, research, cosmetics').eq('id', memberId).single();
    if (!raw) throw new Error('Mitglied nicht gefunden');

    const research = raw.research || {};
    if (research[itemId]) throw new Error('Bereits freigeschaltet');

    // Voraussetzungen prüfen — für Kombos UND normale Items mit requires.
    // Gated nur Neukäufe; bereits besessene Items bleiben unberührt (target ist hier noch nicht owned).
    const prereqs = target.requires || [];
    if (prereqs.length && !prereqs.every(req => research[req])) {
      throw new Error('Voraussetzungen nicht erfüllt');
    }

    // Coins abziehen (bei kostenpflichtigen Items)
    if (cost > 0) {
      const { data: newCoins, error } = await _sb.rpc('spend_coins', { p_member_id: memberId, p_amount: cost });
      if (error) throw new Error(error.message);
      if (newCoins === null || newCoins === undefined) throw new Error('Nicht genug CoffeeCoins');
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
              const ml = appendTodayLog(m.map_data, [{ label: '⚓ Handelshafen-Anteil', amount: cut }]);
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

  // ── Saison abschließen ───────────────────────────────────────────────────────
  async function closeSeason(seasonId) {
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

  // ── Abgeleitete Getter ───────────────────────────────────────────────────────
  function getLeaderboard(data)   { return [...(data.users || [])].sort((a, b) => b.totalCups - a.totalCups); }
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
  async function fetchMessages(limit = 40) {
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
    const { error } = await _sb.rpc('save_map_data', { p_member_id: memberId, p_map_data: mapData });
    if (error) throw new Error(error.message);
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
    return data; // { ok, total_invested, coins_left } oder { error }
  }

  async function fetchCountryStandings(countryId) {
    const { data, error } = await _sb.rpc('get_country_standings', { p_group_id: _groupId, p_country_id: countryId });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function fetchAllWorldInvestments() {
    const { data, error } = await _sb.from('world_investments')
      .select('member_id, country_id, total_invested, garde_purchased').eq('group_id', _groupId);
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

  async function buyGarde(memberId, countryId) {
    const { data, error } = await _sb.rpc('buy_garde', {
      p_member_id: memberId, p_group_id: _groupId, p_country_id: countryId
    });
    if (error) throw new Error(error.message);
    return data; // { ok, cost } oder { error, cost }
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
          const ml = appendTodayLog(m.map_data, [{ label: '🧔 Barista-Bart-Anteil', amount: 1 }]);
          await _sb.rpc('save_map_data', { p_member_id: m.id, p_map_data: ml });
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
          const ml = appendTodayLog(m.map_data, [{ label: '+' + cups + ' Tassen (Eigene Tasse)', amount: bonus }]);
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

  return {
    init, setGroup, createGroup, joinGroup,
    fetchData, registerUser, addCups, closeSeason,
    getTitle, getSeasonId, getSeasonName, calcStreak,
    getLeaderboard, getDailyStats, getSeasons,
    fetchMonthStats, fetchYearSeasons,
    fetchMessages, postMessage,
    getPinnedMessage, setPinnedMessage, clearPinnedMessage,
    // Neu:
    spendCoins, fetchTreasury, contributeToTreasury, syncTreasuryGoals,
    applyDailyLevy, checkWeeklyChallenge,
    purchaseResearchItem, saveCosmetics,
    updateMapData, addCoins, appendTodayLog, claimPassive, recordSalarySnapshot, recordSalarySnapshotsAll,
    payBaristaBartGroup, addPenaltyToTreasury, payEigeneTasseGroup,
    claimLoginBonus, claimDailyTask,
    investInCountry, fetchCountryStandings, fetchAllWorldInvestments,
    fetchAllWorldBuildings, buildWorldStructure, buyGarde, fetchTaxStats,
    castSabotage, fetchSabotages,
    quizStatus, quizStart, quizAnswer, quizFinalize, quizGroupReveal,
  };
})();
