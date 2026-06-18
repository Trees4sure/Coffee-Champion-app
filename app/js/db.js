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

  // Passiv-Einkommen anteilig nach Forschung vs. Gebäude aufschlüsseln, jeweils mit Quellen-Detail
  // (woraus genau es entsteht — für „Heute erhalten"). Von addCups UND claimPassive genutzt.
  function _passiveLogEntries(member, passiveEarned) {
    const rPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    const bPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const totPerDay = rPerDay + bPerDay;
    const rDetail = (typeof researchPerDayDetail === 'function') ? researchPerDayDetail(member.research) : '';
    const bDetail = (typeof buildingPerDayDetail === 'function') ? buildingPerDayDetail(member.map_data?.buildings || {}) : '';
    const out = [];
    if (bPerDay > 0 && totPerDay > 0) {
      const bShare = Math.round(passiveEarned * (bPerDay / totPerDay) * 100) / 100;
      const rShare = Math.round((passiveEarned - bShare) * 100) / 100;
      if (rShare > 0) out.push({ label: '⚙️ Forschung (passiv)', amount: rShare, detail: rDetail });
      if (bShare > 0) out.push({ label: '🏗️ Gebäude-Einkommen',  amount: bShare, detail: bDetail });
    } else {
      out.push({ label: '⚙️ Passiv-Einkommen', amount: passiveEarned, detail: rDetail });
    }
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
    const [m, ds, s, h] = await Promise.all([
      _sb.from('members').select('*').eq('group_id', _groupId).order('total_cups', { ascending: false }),
      _sb.from('daily_stats').select('*').eq('group_id', _groupId).order('date', { ascending: false }).limit(90),
      _sb.from('seasons').select('*').eq('group_id', _groupId).order('season_id', { ascending: false }),
      _sb.from('hall_of_fame').select('*').eq('group_id', _groupId).maybeSingle()
    ]);
    return {
      users: (m.data || []).map(normalizeUser),
      dailyStats: Object.fromEntries((ds.data || []).map(d => [d.date, { date: d.date, total: d.total, entries: d.stats || {} }])),
      seasons: s.data || [],
      halloffame: h.data || {},
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
      coins: 0, research: {}, cosmetics: {}
    }).select().single();
    if (error) throw new Error(error.message);
    await ensureSeason();
    return normalizeUser(data);
  }

  // ── Passiv-Einkommen prüfen und gutschreiben ─────────────────────────────────
  async function _checkAndClaimPassive(memberId, member) {
    const researchPerDay = (typeof calcResearchPerDay === 'function') ? calcResearchPerDay(member.research || {}) : 0;
    const buildingPerDay = (typeof calcBuildingPerDay === 'function') ? calcBuildingPerDay(member.map_data?.buildings || {}) : 0;
    const perDay = researchPerDay + buildingPerDay;
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
      const earned = await _checkAndClaimPassive(memberId, member);
      if (earned > 0) {
        // Tages-Log (Forschung vs. Gebäude anteilig + Quellen-Detail) — Fehler nicht eskalieren
        try {
          const md = appendTodayLog(member.map_data, _passiveLogEntries(member, earned));
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

    // Tageslimit prüfen: max. 15 Tassen pro Person und Tag
    const { data: todayStats } = await _sb.from('daily_stats').select('*')
      .eq('group_id', _groupId).eq('date', dateStr).maybeSingle();
    const alreadyToday = (todayStats?.stats || {})[memberId] || 0;
    if (alreadyToday + amount > 15) {
      throw new Error(`Tageslimit erreicht: heute bereits ${alreadyToday} von 15 Tassen erfasst.`);
    }

    const member    = normalizeUser(rawMember);
    const activeDays = [...(member.activeDays || [])];
    if (!activeDays.includes(dateStr)) activeDays.push(dateStr);
    if (activeDays.length > 400) activeDays.splice(0, activeDays.length - 400);

    const newTotal     = member.totalCups + amount;
    const newStreak    = calcStreak(activeDays);
    const newMaxStreak = Math.max(member.maxStreak, newStreak);
    const seasonCups   = { ...member.seasonCups, [monthStr]: (member.seasonCups[monthStr] || 0) + amount };
    const updatedMember = { ...member, totalCups: newTotal, currentStreak: newStreak, maxStreak: newMaxStreak, seasonCups, activeDays };

    // Achievements prüfen
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

    let totalCoins = baseCoins + morningBonus + researchBonus + achCoinTotal + streakBonus;

    if (totalCoins > 0) {
      const { error: coinErr } = await _sb.rpc('add_coins', { p_member_id: memberId, p_amount: totalCoins });
      if (coinErr) { console.error('add_coins fehlgeschlagen:', coinErr.message); totalCoins = 0; }
    }

    // Passiv-Einkommen prüfen
    const passiveEarned = await _checkAndClaimPassive(memberId, member);

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
      for (const a of allNew) {
        if (a?.coinReward) logEntries.push({ label: `🏆 ${a.name || a.id}`, amount: a.coinReward });
      }
      if (streakBonus > 0) logEntries.push({ label: `🔥 Streak ${newStreak}`, amount: streakBonus });
      if (passiveEarned > 0) {
        for (const e of _passiveLogEntries(member, passiveEarned)) logEntries.push(e);
      }

      if (logEntries.length) {
        const newMapData = appendTodayLog(member.map_data, logEntries);
        await updateMapData(memberId, newMapData);
      }
    } catch (e) { console.warn('Tages-Log konnte nicht gespeichert werden:', e); }

    // Rückgabe: Array mit Achievement-Popups + Coin-Info als Eigenschaft
    allNew.coinsEarned   = totalCoins;
    allNew.passiveEarned = passiveEarned;
    allNew.morning       = morningBonus > 0;
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

  return {
    init, setGroup, createGroup, joinGroup,
    fetchData, registerUser, addCups, closeSeason,
    getTitle, getSeasonId, getSeasonName, calcStreak,
    getLeaderboard, getDailyStats, getSeasons,
    fetchMonthStats, fetchYearSeasons,
    fetchMessages, postMessage,
    getPinnedMessage, setPinnedMessage, clearPinnedMessage,
    // Neu:
    spendCoins, fetchTreasury, contributeToTreasury,
    purchaseResearchItem, saveCosmetics,
    updateMapData, addCoins, appendTodayLog, claimPassive,
  };
})();
