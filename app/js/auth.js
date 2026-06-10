const AUTH = {
  getGroup()          { try { return JSON.parse(localStorage.getItem('cc_group') || 'null'); } catch { return null; } },
  setGroup(g)         { localStorage.setItem('cc_group', JSON.stringify({ id: g.id, name: g.name })); },
  clearGroup()        { localStorage.removeItem('cc_group'); },
  getCurrentUser()    { try { return JSON.parse(localStorage.getItem('cc_user') || 'null'); } catch { return null; } },
  setCurrentUser(u)   { localStorage.setItem('cc_user', JSON.stringify({ id: u.id, name: u.name })); },
  clearCurrentUser()  { localStorage.removeItem('cc_user'); },
  clearAll()          { localStorage.removeItem('cc_group'); localStorage.removeItem('cc_user'); }
};
