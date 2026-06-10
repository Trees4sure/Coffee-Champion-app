// Supabase-basiertes Daten-Layer — ersetzt GitHub API
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

  function calcStreak(activeDays) {
    if (!activeDays?.length) return 0;
    const sorted = [...new Set(activeDays)].sort().reverse();
    let streak = 0, cur = today();
    for (const d of sorted) {
      if (d === cur) {
        streak++;
        const dt = new Date(cur); dt.setDate(dt.getDate() - 1);
        cur = dt.toISOString().slice(0, 10);
      } else if (d < cur) break;
    }
    return streak;
  }

  // ── Gruppe erstellen ────────────────────────────────────────────────────────
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

  // ── Gruppe beitreten ────────────────────────────────────────────────────────
  async function joinGroup(name, password) {
    const hash = await hashPassword(password);
    const { data, error } = await _sb.rpc('check_group_password', { p_name: name.trim(), p_hash: hash });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Falscher Gruppenname oder Passwort');
    _groupId = data[0].id;
    return { id: data[0].id, name: data[0].name };
  }

  // ── Daten laden ─────────────────────────────────────────────────────────────
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

  function normalizeUser(u) {
    return {
      id: u.id, name: u.name, totalCups: u.total_cups || 0,
      currentStreak: u.current_streak || 0, maxStreak: u.max_streak || 0,
      monthlyWins: u.monthly_wins || 0, isAdmin: u.is_admin || false,
      joinDate: u.join_date, lastActive: u.last_active,
      achievements: u.achievements || {}, activeDays: u.active_days || [],
      seasonCups: u.season_cups || {}
    };
  }

  // ── User registrieren ───────────────────────────────────────────────────────
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
      achievements: {}, active_days: [], season_cups: {}
    }).select().single();
    if (error) throw new Error(error.message);
    await ensureSeason();
    return normalizeUser(data);
  }

 // ── Tassen eintragen ────────────────────────────────────────────────────────
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
  const member = normalizeUser(rawMember);

  // ── Entry einfügen — Trigger prüft Tageslimit HIER ───────────────────────
  // Bewusst vor den Member-Updates: schlägt der Trigger an, bleiben
  // total_cups / streak / daily_stats unverändert (kein inkonsistenter Zustand).
  const { error: entryError } = await _sb.from('entries')
    .insert({ group_id: _groupId, member_id: memberId, amount, date: dateStr });
  if (entryError) {
    if (entryError.message?.includes('Tageslimit')) throw new Error(entryError.message);
    throw new Error('Eintrag konnte nicht gespeichert werden');
  }

  // Ab hier: Entry ist in DB — Statistiken aktualisieren ────────────────────
  const activeDays = [...(member.activeDays || [])];
  if (!activeDays.includes(dateStr)) activeDays.push(dateStr);
  if (activeDays.length > 400) activeDays.splice(0, activeDays.length - 400);

  const newTotal      = member.totalCups + amount;
  const newStreak     = calcStreak(activeDays);
  const newMaxStreak  = Math.max(member.maxStreak, newStreak);
  const seasonCups    = { ...member.seasonCups, [monthStr]: (member.seasonCups[monthStr] || 0) + amount };
  const updatedMember = { ...member, totalCups: newTotal, currentStreak: newStreak, maxStreak: newMaxStreak, seasonCups, activeDays };

  // Achievements prüfen
  const { unlocked: inputUnlocked, newAch: inputAch } = checkInputAchievements(amount, hour, updatedMember);
  const milestoneUnlocked = checkAchievements(updatedMember, inputAch);
  const allNew = [...inputUnlocked, ...milestoneUnlocked].filter(Boolean);
  const achievements = { ...(member.achievements || {}), ...inputAch };
  for (const a of milestoneUnlocked) achievements[a.id] = true;

  // Top-1 Achievement
  const { data: topMember } = await _sb.from('members').select('id')
    .eq('group_id', _groupId).order('total_cups', { ascending: false }).limit(1).single();
  if (topMember?.id === memberId && !achievements.top1) {
    achievements.top1 = true;
    const top1Ach = ACHIEVEMENTS.find(a => a.id === 'top1');
    if (top1Ach) allNew.push(top1Ach);
  }

  // Member updaten
  await _sb.from('members').update({
    total_cups: newTotal, current_streak: newStreak,
    max_streak: newMaxStreak, last_active: dateStr,
    active_days: activeDays, season_cups: seasonCups, achievements
  }).eq('id', memberId);

  // Daily stats upsert
  const { data: todayStats } = await _sb.from('daily_stats').select('*')
    .eq('group_id', _groupId).eq('date', dateStr).maybeSingle();
  const newDayTotal = (todayStats?.total || 0) + amount;
  const newStats    = { ...(todayStats?.stats || {}), [memberId]: ((todayStats?.stats || {})[memberId] || 0) + amount };
  await _sb.from('daily_stats').upsert(
    { group_id: _groupId, date: dateStr, total: newDayTotal, stats: newStats },
    { onConflict: 'group_id,date' }
  );

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
  return allNew;
}

  // ── Saison abschließen ──────────────────────────────────────────────────────
  async function closeSeason(seasonId) {
    const { data: members } = await _sb.from('members').select('*').eq('group_id', _groupId);
    let winner = null, maxCups = -1;
    for (const m of (members || [])) {
      const sc = (m.season_cups || {})[seasonId] || 0;
      if (sc > maxCups) { maxCups = sc; winner = { id: m.id, name: m.name, cups: sc }; }
    }
    await _sb.from('seasons').update({ is_active: false, winner_name: winner?.name, winner_cups: winner?.cups })
      .eq('group_id', _groupId).eq('season_id', seasonId);
    if (winner) {
      const { data: wm } = await _sb.from('members').select('*').eq('id', winner.id).single();
      if (wm) {
        const newWins = (wm.monthly_wins || 0) + 1;
        const ach = { ...(wm.achievements || {}), monthly_win: true };
        await _sb.from('members').update({ monthly_wins: newWins, achievements: ach }).eq('id', winner.id);
        const { data: hof } = await _sb.from('hall_of_fame').select('*').eq('group_id', _groupId).maybeSingle();
        if (!hof?.most_wins_value || newWins > (hof.most_wins_value || 0)) {
          await _sb.from('hall_of_fame').upsert({ ...(hof || {}), group_id: _groupId, most_wins_value: newWins, most_wins_name: wm.name }, { onConflict: 'group_id' });
        }
      }
    }
    return winner;
  }

  // ── Saison sicherstellen ────────────────────────────────────────────────────
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

  // ── Abgeleitete Getter ──────────────────────────────────────────────────────
  function getLeaderboard(data)   { return [...(data.users || [])].sort((a, b) => b.totalCups - a.totalCups); }
  function getSeasons(data)       { return [...(data.seasons || [])].sort((a, b) => b.season_id?.localeCompare(a.season_id)); }
  function getDailyStats(data, days = 30) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return Object.values(data.dailyStats || {}).filter(d => d.date >= cutoff.toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── Auswertung ──────────────────────────────────────────────────────────────
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

  // ── Nachrichten ─────────────────────────────────────────────────────────────
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

  // ── Pinnwand ────────────────────────────────────────────────────────────────
  async function getPinnedMessage() {
    const { data } = await _sb.from('groups_public')
      .select('pinned_message, pinned_by, pinned_at').eq('id', _groupId).single();
    return data || {};
  }

  async function setPinnedMessage(message, userName) {
    await _sb.from('groups').update({
      pinned_message: message.trim(),
      pinned_by: userName,
      pinned_at: new Date().toISOString()
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
    getPinnedMessage, setPinnedMessage, clearPinnedMessage
  };
})();
