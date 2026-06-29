const ACHIEVEMENTS = [
  { id: 'first_cup',   icon: '☕', name: 'Erste Tasse',     desc: 'Erste Tasse erfasst',               coinReward: 10,    condition: u => u.totalCups >= 1     },
  // ── Leichte Einsteiger-Erfolge (gegen die Anfangs-Durststrecke, front-loaded) ──
  { id: 'cups_3',      icon: '🥄', name: 'Aufgewärmt',     desc: '3 Tassen erreicht',                 coinReward: 15,    condition: u => u.totalCups >= 3     },
  { id: 'streak_3',    icon: '📆', name: 'Dranbleiber',    desc: '3 Werktage in Folge aktiv',         coinReward: 30,    condition: u => u.maxStreak >= 3     },
  { id: 'first_research', icon: '🔬', name: 'Erste Forschung', desc: 'Erstes Forschungs-Item gekauft', coinReward: 20, condition: u => Object.keys(u.research || {}).length >= 1 },
  { id: 'saver_100',   icon: '🪙', name: 'Sparschwein',    desc: '100 CoffeeCoins angespart',         coinReward: 25,    condition: u => (u.coins || 0) >= 100 },
  { id: 'cups_10',     icon: '🫘', name: '10 Tassen',       desc: '10 Tassen erreicht',                coinReward: 20,    condition: u => u.totalCups >= 10    },
  { id: 'cups_25',     icon: '🎟️', name: 'Stammkunde',     desc: '25 Tassen erreicht',                coinReward: 30,    condition: u => u.totalCups >= 25    },
  { id: 'cups_50',     icon: '🏅', name: '50 Tassen',       desc: '50 Tassen erreicht',                coinReward: 50,    condition: u => u.totalCups >= 50    },
  { id: 'cups_100',    icon: '💯', name: '100 Tassen',      desc: '100 Tassen erreicht',               coinReward: 100,   condition: u => u.totalCups >= 100   },
  { id: 'cups_250',    icon: '⚔️', name: '250 Tassen',      desc: '250 Tassen erreicht',               coinReward: 200,   condition: u => u.totalCups >= 250   },
  { id: 'cups_500',    icon: '🎖️', name: '500 Tassen',      desc: '500 Tassen erreicht',               coinReward: 400,   condition: u => u.totalCups >= 500   },
  { id: 'cups_750',    icon: '👑', name: '750 Tassen',      desc: '750 Tassen erreicht',               coinReward: 600,   condition: u => u.totalCups >= 750   },
  { id: 'cups_1000',   icon: '🌟', name: '1000 Tassen',     desc: '1000 Tassen erreicht',              coinReward: 1000,  condition: u => u.totalCups >= 1000  },
  { id: 'cups_1500',   icon: '⚡', name: '1500 Tassen',     desc: '1500 Tassen erreicht',              coinReward: 1500,  condition: u => u.totalCups >= 1500  },
  { id: 'cups_2500',   icon: '🔥', name: '2500 Tassen',     desc: '2500 Tassen erreicht',              coinReward: 2000,  condition: u => u.totalCups >= 2500  },
  { id: 'cups_5000',   icon: '🏆', name: '5000 Tassen',     desc: '5000 Tassen erreicht',              coinReward: 4000,  condition: u => u.totalCups >= 5000  },
  { id: 'streak_7',    icon: '📅', name: '7 Tage Serie',    desc: '7 Werktage in Folge aktiv',         coinReward: 100,   condition: u => u.maxStreak >= 7     },
  { id: 'streak_30',   icon: '🗓️', name: '30 Tage Serie',   desc: '30 Werktage in Folge aktiv',        coinReward: 300,   condition: u => u.maxStreak >= 30    },
  { id: 'streak_100',  icon: '💎', name: '100 Tage Serie',  desc: '100 Werktage in Folge aktiv',       coinReward: 700,   condition: u => u.maxStreak >= 100   },
  { id: 'doppio',      icon: '🥤', name: 'Doppio-Meister',  desc: '10+ Tassen auf einmal erfasst',     coinReward: 20,    condition: null },
  { id: 'barista',     icon: '🎩', name: 'Barista',         desc: '5+ Tassen auf einmal erfasst',      coinReward: 10,    condition: null },
  { id: 'early_bird',  icon: '🌅', name: 'Frühaufsteher',   desc: 'Vor 8 Uhr Tassen erfasst',          coinReward: 20,    condition: null },
  { id: 'night_owl',   icon: '🦉', name: 'Nachteule',       desc: 'Nach 22 Uhr Tassen erfasst',        coinReward: 20,    condition: null },
  { id: 'top1',          icon: '🥇', name: 'Spitzenreiter',    desc: 'Platz 1 in der Rangliste',              coinReward: 20,   condition: null },
  { id: 'top2',          icon: '🥈', name: 'Vize-Röster',      desc: 'Platz 2 in der Rangliste',              coinReward: 30,   condition: null },
  { id: 'top3',          icon: '🥉', name: 'Dritter Mann',     desc: 'Platz 3 in der Rangliste',              coinReward: 10,   condition: null },
  { id: 'monthly_win',  icon: '🏆', name: 'Monatssieger',     desc: 'Eine Saison gewonnen',                  coinReward: 50,   condition: u => (u.monthlyWins || 0) >= 1 },
  // ── Kaffee-Dungeon ──
  { id: 'dungeon_first',  icon: '⚔️',  name: 'Dungeon-Debütant', desc: 'Ersten Dungeon abgeschlossen',          coinReward: 25,   condition: u => (u.map_data?.dungeonStats?.count  || 0) >= 1  },
  { id: 'dungeon_5',      icon: '🏚️', name: 'Dungeon-Veteran',  desc: '5 Dungeons abgeschlossen',              coinReward: 75,   condition: u => (u.map_data?.dungeonStats?.count  || 0) >= 5  },
  { id: 'dungeon_master', icon: '🗡️', name: 'Dungeon-Meister',  desc: '100+ Punkte in einem Dungeon',           coinReward: 100,  condition: u => (u.map_data?.dungeonStats?.bestScore || 0) >= 100 },
];

function checkAchievements(userData, newAchievements = {}) {
  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (newAchievements[ach.id]) continue;
    if (userData.achievements && userData.achievements[ach.id]) continue;
    if (ach.condition && ach.condition(userData)) unlocked.push(ach);
  }
  return unlocked;
}

function checkInputAchievements(amount, hour, userData) {
  const unlocked = [];
  const existing = userData.achievements || {};
  const newAch = { ...existing };
  if (amount >= 10 && !existing.doppio)     { unlocked.push(ACHIEVEMENTS.find(a => a.id === 'doppio'));     newAch.doppio     = true; }
  if (amount >= 5  && !existing.barista)    { unlocked.push(ACHIEVEMENTS.find(a => a.id === 'barista'));    newAch.barista    = true; }
  if (hour < 8     && !existing.early_bird) { unlocked.push(ACHIEVEMENTS.find(a => a.id === 'early_bird')); newAch.early_bird = true; }
  if (hour >= 22   && !existing.night_owl)  { unlocked.push(ACHIEVEMENTS.find(a => a.id === 'night_owl'));  newAch.night_owl  = true; }
  return { unlocked, newAch };
}
