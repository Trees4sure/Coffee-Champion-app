// ═══════════════════════════════════════════════════════════════════════════
// research.js — CoffeeCoins: Forschungsbaum, Sprüche, Kasse-Ziele
// Muss VOR db.js und imperium.js geladen werden
// ═══════════════════════════════════════════════════════════════════════════

// ── Forschungs-Pfade ─────────────────────────────────────────────────────────
const RESEARCH_PATHS = {
  anbau: {
    name: 'Anbau', icon: '🌱',
    items: [
      // Tier 1: keine Voraussetzungen (Einstieg)
      { id: 'kaffeesamen',    name: 'Kaffeesamen',        icon: '🌰', tier: 1, cost: 30,    perCup: 0.2, perDay: 0   },
      { id: 'wasserquelle',   name: 'Wasserquelle',       icon: '💧', tier: 1, cost: 60,    perCup: 0,   perDay: 1   },
      { id: 'duengemittel',   name: 'Düngemittel',        icon: '🧪', tier: 2, cost: 180,   perCup: 0.6, perDay: 0,   requires: ['kaffeesamen'] },
      { id: 'kaffeegarten',   name: 'Kaffeegarten',       icon: '🌳', tier: 3, cost: 600,   perCup: 2,   perDay: 6,   requires: ['kaffeepflanze'] },
      { id: 'plantage',       name: 'Plantage',           icon: '🌄', tier: 4, cost: 3000,  perCup: 7,   perDay: 30,  requires: ['kaffeegarten'] },
      { id: 'exportplantage', name: 'Exportplantage',     icon: '🌍', tier: 5, cost: 10000, perCup: 16,  perDay: 100, requires: ['plantage'] },
    ]
  },
  technik: {
    name: 'Technik', icon: '⚙️',
    items: [
      { id: 'handmuehle',     name: 'Handmühle',          icon: '⚙️', tier: 1, cost: 50,    perCup: 0.4, perDay: 0   },
      { id: 'thermometer',    name: 'Thermometer',        icon: '🌡️', tier: 2, cost: 150,   perCup: 0.6, perDay: 0   },
      { id: 'el_muehle',      name: 'Elektrische Mühle',  icon: '🔌', tier: 2, cost: 200,   perCup: 1.2, perDay: 0,   requires: ['handmuehle'] },
      { id: 'siebtraeger',    name: 'Siebträger',         icon: '🫗', tier: 3, cost: 400,   perCup: 2.4, perDay: 0,   requires: ['el_muehle'] },
      { id: 'roestmaschine',  name: 'Röstmaschine',       icon: '🔥', tier: 3, cost: 1200,  perCup: 5,   perDay: 0,   requires: ['siebtraeger'] },
      { id: 'halbautomatik',  name: 'Halbautomatik',      icon: '🤖', tier: 4, cost: 2500,  perCup: 8,   perDay: 0,   requires: ['el_muehle','roestmaschine'] },
      { id: 'iot_roester',    name: 'IoT-Röster',         icon: '📡', tier: 5, cost: 8000,  perCup: 0,   perDay: 0,   requires: ['halbautomatik'], special: 'technik_x2' },
    ]
  },
  handwerk: {
    name: 'Handwerk', icon: '🏺',
    items: [
      { id: 'ton',            name: 'Ton',                icon: '🟤', tier: 1, cost: 40,    perCup: 0.2, perDay: 0   },
      { id: 'toepferei',      name: 'Töpferei-Werkzeug',  icon: '🏺', tier: 1, cost: 80,    perCup: 0.4, perDay: 0   },
      { id: 'kunstbuch',      name: 'Kunstbuch',          icon: '🎨', tier: 2, cost: 100,   perCup: 0.4, perDay: 0   },
      { id: 'lim_edition',    name: 'Limitierte Edition', icon: '✨', tier: 3, cost: 600,   perCup: 0,   perDay: 0,   requires: ['kunstbuch'], special: 'ach_bonus_25' },
      { id: 'kunstobjekt',    name: 'Kunstobjekt',        icon: '🗿', tier: 4, cost: 2500,  perCup: 0,   perDay: 0,   requires: ['lim_edition'], special: 'ach_bonus_50' },
    ]
  },
  mobilitaet: {
    name: 'Mobilität', icon: '🚗',
    items: [
      { id: 'fahrradkurier',  name: 'Fahrradkurier',      icon: '🚲', tier: 1, cost: 100,   perCup: 0.6, perDay: 0   },
      { id: 'rollwagen',      name: 'Kaffee-Rollwagen',   icon: '🛒', tier: 2, cost: 250,   perCup: 1.2, perDay: 0,   requires: ['fahrradkurier'] },
      { id: 'kaffeemobil',    name: 'Kaffeemobil',        icon: '🚐', tier: 2, cost: 450,   perCup: 2,   perDay: 0   },
      { id: 'lieferwagen',    name: 'Lieferwagen',        icon: '🚚', tier: 3, cost: 1000,  perCup: 4.4, perDay: 0,   requires: ['kaffeemobil'] },
      { id: 'lieferflotte',   name: 'Lieferflotte',       icon: '🚛', tier: 4, cost: 4000,  perCup: 11,  perDay: 50,  requires: ['lieferwagen'] },
      { id: 'logistikzentrum',name: 'Logistikzentrum',    icon: '🏗️', tier: 5, cost: 12000, perCup: 40,  perDay: 0,   requires: ['lieferflotte'] },
    ]
  },
  natur: {
    name: 'Natur & Wissen', icon: '🌿',
    items: [
      { id: 'kompost',        name: 'Kompost',            icon: '🍂', tier: 1, cost: 80,    perCup: 0.4, perDay: 0   },
      { id: 'kaffee_buch',    name: 'Kaffee-Buch',       icon: '📖', tier: 1, cost: 70,    perCup: 0.4, perDay: 0   },
      { id: 'biogarten',      name: 'Biogarten',          icon: '🌻', tier: 2, cost: 300,   perCup: 0,   perDay: 5,   requires: ['kaffeepflanze'] },
      { id: 'barista_kurs',   name: 'Barista-Kurs',      icon: '🎓', tier: 2, cost: 250,   perCup: 0,   perDay: 0,   requires: ['kaffee_buch'], special: 'ach_bonus_25' },
      { id: 'regenwasser',    name: 'Regenwasser-Anlage', icon: '🌧️', tier: 3, cost: 600,   perCup: 0,   perDay: 9   },
      { id: 'sensorik',       name: 'Sensorik-Workshop',  icon: '👃', tier: 3, cost: 800,   perCup: 0,   perDay: 0,   special: 'unlock_title' },
      { id: 'wildnis_camp',   name: 'Wildnis-Camp',      icon: '🏕️', tier: 4, cost: 2000,  perCup: 0,   perDay: 16,  special: 'cosmetic_zen' },
      { id: 'weltreise',      name: 'Kaffee-Weltreise',  icon: '🧳', tier: 5, cost: 5000,  perCup: 0,   perDay: 0,   special: 'all_x1_5' },
    ]
  },
  gastronomie: {
    name: 'Gastronomie', icon: '☕',
    unlockRequires: 3,
    items: [
      { id: 'popup_stand',    name: 'Pop-Up-Stand',       icon: '⛺', tier: 3, cost: 600,   perCup: 0,   perDay: 8   },
      { id: 'kiosk',          name: 'Kiosk',              icon: '🏪', tier: 3, cost: 800,   perCup: 0,   perDay: 12,  requires: ['popup_stand'] },
      { id: 'online_shop',    name: 'Online-Shop',        icon: '🛍️', tier: 4, cost: 2500,  perCup: 3,   perDay: 30  },
      { id: 'erstes_cafe',    name: 'Erstes Café',        icon: '🏠', tier: 4, cost: 3500,  perCup: 0,   perDay: 50,  requires: ['kiosk'] },
      { id: 'kaffeekette',    name: 'Kaffeekette',        icon: '🏢', tier: 5, cost: 15000, perCup: 0,   perDay: 200, requires: ['erstes_cafe'] },
    ]
  }
};

// ── Kombinations-Freischaltungen ─────────────────────────────────────────────
const RESEARCH_COMBOS = [
  { id: 'eigene_tasse',        name: 'Eigene Tasse',       icon: '🍵', requires: ['handmuehle','ton','toepferei'],                    cost: 0,   perCup: 0,  perDay: 0,   special: 'group_cup_1',      desc: '+1 CC pro 10 Mitspieler-Tassen' },
  { id: 'kaffeepflanze',       name: 'Kaffeepflanze',      icon: '🌱', requires: ['kaffeesamen','wasserquelle'],                       cost: 120, perCup: 0.8,perDay: 0,   special: '',                 desc: 'Rabatt: 120 statt 300 CC' },
  { id: 'fahrende_roesterei',  name: 'Fahrende Rösterei',  icon: '🚐', requires: ['kaffeemobil','roestmaschine'],                      cost: 0,   perCup: 0,  perDay: 20,  special: 'cosmetic_roaster', desc: '+20 CC/Tag + Spezial-Avatar' },
  { id: 'bio_zertifikat',      name: 'Bio-Zertifikat',     icon: '🌿', requires: ['kaffeegarten','biogarten','kompost'],               cost: 0,   perCup: 0,  perDay: 0,   special: 'global_plus20',    desc: 'ALLE CC dauerhaft +20%' },
  { id: 'barista_kunstwerk',   name: 'Barista-Kunstwerk',  icon: '🎭', requires: ['eigene_tasse','sensorik'],                          cost: 0,   perCup: 0,  perDay: 0,   special: 'cosmetic_art',     desc: 'Prestige-Avatar + exklusiver Rahmen' },
  { id: 'natur_cafe',          name: 'Natur-Café',         icon: '🌲', requires: ['erstes_cafe','biogarten'],                          cost: 0,   perCup: 0,  perDay: 0,   special: 'cosmetic_waldcafe',desc: 'Waldcafé-Theme freigeschaltet' },
  { id: 'ki_kaffee_genie',     name: 'KI-Kaffee-Genie',   icon: '🤖', requires: ['iot_roester','weltreise'],                          cost: 0,   perCup: 0,  perDay: 0,   special: 'technik_x3',       desc: 'Technik ×3 + Titel "KI-Röstmeister"' },
  { id: 'weltkonzern',         name: 'Weltkonzern',        icon: '👑', requires: ['exportplantage','logistikzentrum','kaffeekette'],   cost: 0,   perCup: 0,  perDay: 0,   special: 'all_x3',           desc: 'ALLE Boni ×3 — End-Game!' },
  { id: 'welthandelslizenz',   name: 'Welthandels-Lizenz', icon: '🌍', requires: ['kaffeesamen','wasserquelle','handmuehle','ton','toepferei','fahrradkurier','kompost','kaffee_buch'], cost: 200, perCup: 0, perDay: 0, special: 'unlock_world', desc: 'Schaltet die 🌍 Weltkarte frei — alle Tier-1-Forschungen nötig' },
];

// ── Balancing 2026-06-20 (v2): pro Tasse ab Tier 2 knapper ───────────────────────
// „Eher knapp, dann investiert man klüger" — Tassen sollen nur ein moderater Zuschlag
// sein (Sparen + Investitionswahl zählen), nicht der Haupt-Reichtumsmotor. T1 bleibt
// komplett unangetastet. Multiplikativ gebacken → die unterschiedlichen Item-Boni
// (gewollte Vielfalt) bleiben relativ erhalten, und Anzeige (Forschungsbaum/Tages-Log)
// = Verdienst, weil jede Lesestelle dieselben Item-Werte sieht.
const RESEARCH_CUP_SCALE_T2PLUS = 0.30;
for (const _p of Object.values(RESEARCH_PATHS)) for (const _it of _p.items) {
  if (_it.tier >= 2 && _it.perCup) _it.perCup = Math.max(0.1, Math.round(_it.perCup * RESEARCH_CUP_SCALE_T2PLUS * 10) / 10);
}
for (const _c of RESEARCH_COMBOS) {
  if (_c.perCup) _c.perCup = Math.max(0.1, Math.round(_c.perCup * RESEARCH_CUP_SCALE_T2PLUS * 10) / 10);
}

// ── Tier-Namen ────────────────────────────────────────────────────────────────
const TIER_NAMES = {
  1: { name: 'Anfänger',      color: '#E1F5EE', border: '#9FE1CB', text: '#04342C' },
  2: { name: 'Barista',       color: '#FFF8EC', border: '#FAC775', text: '#412402' },
  3: { name: 'Händler',       color: '#FEF3E0', border: '#EF9F27', text: '#412402' },
  4: { name: 'Unternehmer',   color: '#FAC775', border: '#BA7517', text: '#412402' },
  5: { name: 'Kaffee-Kaiser', color: '#BA7517', border: '#854F0B', text: '#FAC775' },
};

function getTierRange(tier) {
  const ranges = { 1:'30–180 CC', 2:'100–450 CC', 3:'400–1.200 CC', 4:'2.000–5.000 CC', 5:'5k–15k CC' };
  return ranges[tier] || '';
}

// ── Sprüche ───────────────────────────────────────────────────────────────────
const SPRUECHE_TIERS = [
  { minCups: 0,    quotes: [
    "Kaffee zuerst. Existenzielle Krisen können warten.",
    "Ich bin nicht süchtig — ich bin loyal.",
    "Guten Morgen heißt übersetzt: Wo ist die Kanne?",
    "Diese Tasse hat mehr Verantwortung als manche Kollegen.",
    "Ohne Kaffee bin ich nur ein Entwurf von mir selbst.",
  ]},
  { minCups: 50,   quotes: [
    "50 Tassen. Mein Hausarzt hat aufgehört, mich zu fragen.",
    "Ich heize nicht mehr auf — ich bin permanent im Turbo-Modus.",
    "Andere zählen Schafe. Ich zähle Tassen.",
    "Mein Kaffeekonsum ist kein Hobby mehr. Es ist eine Lebensform.",
    "Wasser ist für Pflanzen. Ich bin kein Kaktus.",
  ]},
  { minCups: 250,  quotes: [
    "250 Tassen. Die Kaffeemaschine kennt meinen Geburtstag.",
    "Ich bin nicht hier, um zu schlafen. Ich bin hier, um zu dominieren — koffeiniert.",
    "Manche jagen Träume. Ich jage den nächsten Refill.",
    "Mein Blutbild zeigt: 70% Kaffee, 30% Entschlossenheit.",
    "Legenden sterben nie. Sie holen sich nur Nachschub.",
  ]},
];

const ACH_SPRUECHE = {
  early_bird:   "Frühaufsteher? Ich nenne es: vor allen anderen Kaffee klauen.",
  night_owl:    "22 Uhr und wach. Der Kaffee fragt nicht, er liefert.",
  streak_7:     "7 Tage, 7 Tassen, 0 Reue. So sieht Disziplin aus — meine Version davon.",
  monthly_win:  "Saison gewonnen. Die Krone ist aus Bohnen, aber sie sitzt.",
  top1:         "Platz 1. Weil Kaffee schneller ist als Ausreden.",
  cups_1000:    "1000 Tassen. Mein Magen hat ein eigenes Postfach.",
  doppio:       "Doppelter Espresso. Einfaches Leben. Klare Prioritäten.",
};

const PACK_SPRUECHE = {
  wiener:       ["Der Kaffee hier ist nicht heiß — er ist heiß wie Wien.", "Ein gutes Leben beginnt mit einem guten Kaffee.", "Die Zeit vergeht. Der Kaffee bleibt.", "Im Zweifelsfall: Kaffee.", "Melancholie schmeckt besser mit Schlagobers."],
  italiano:     ["Senza caffè, la vita è niente.", "Espresso ist keine Bohne — es ist eine Haltung.", "Corretto? Sempre.", "In Italia il caffè è religione.", "Tre cose durano: amore, morte e caffè."],
  wissenschaft: ["Koffein blockiert Adenosin-Rezeptoren. Du bist buchstäblich wach durch Chemie.", "LD50 von Koffein: ~200 mg/kg. Du bist safe.", "Coffea arabica: 2n=44 Chromosomen. Doppelt so viele wie du.", "Kaffee enthält über 1.000 Aromastoffe. Wein nur 200.", "Bei ~400 mg Koffein täglich ist der Mensch optimiert."],
  philosophie:  ["Ich denke, also koffeiniere ich.", "Was ist Realität? Kaffee ist Realität.", "Zwischen dem ersten Schluck und dem letzten liegt ein ganzes Leben.", "Carpe diem heißt auf Lateinisch: Mach erstmal Kaffee.", "Der Weg ist das Ziel. Kaffee ist der Weg."],
  grob:         ["Ohne Kaffee bist du kein Mensch. Mit Kaffee bist du erträglich.", "Gut Morgen gibt's nach dem Kaffee.", "Reden ist Silber. Schweigen und Kaffee kochen ist Gold.", "Ich bin nicht müde. Ich bin unterkoffeiniert.", "Wer keinen Kaffee trinkt, hat schlechte Gründe."],
  natur:        ["In den Bergen schmeckt Kaffee nach Freiheit.", "Ein Lagerfeuer, ein Kaffee, kein WLAN — das ist Luxus.", "Kaffeebohnen wachsen zwischen den Wendekreisen. Du trinkst Weltatlas.", "Regen draußen, Kaffee drinnen — das Gleichgewicht stimmt.", "Die Natur hat Heilpflanzen. Der Mensch hat Kaffee."],
  buero:        ["Montag-Meeting ohne Kaffee? Das ist kein Termin, das ist ein Überfall.", "Ich habe nicht verschlafen. Ich war im Energiesparmodus bis zur ersten Tasse.", "'Kurz ein Update' kostet 45 Minuten meines Lebens. Hol mir Kaffee, das ist fair.", "Drucker kaputt, WLAN spinnt, Kaffeemaschine läuft. Prioritäten sitzen.", "Mein Output ist direkt proportional zu meinem Input. Kaffee ist der Input."],
  meme:         ["POV: Du bist 0% Mensch, bis die erste Tasse droppt.", "Kaffee: der einzige Hype, der nie nachlässt.", "Main Character Energy braucht Main Character Koffein.", "Plot Twist: Es war die ganze Zeit der Kaffee.", "Sleep is cancelled. Coffee is forever."],
};

const SPRUCH_PACKS = [
  { id: 'wiener',       icon: '🎩', name: 'Wiener Kaffeehausstil', cost: 50 },
  { id: 'italiano',     icon: '🇮🇹', name: 'Italiano Espresso',    cost: 50 },
  { id: 'wissenschaft', icon: '🔬', name: 'Kaffeewissenschaft',     cost: 50 },
  { id: 'philosophie',  icon: '🤔', name: 'Philosophie am Morgen', cost: 50 },
  { id: 'grob',         icon: '🪓', name: 'Der grobe Klotz',       cost: 50 },
  { id: 'natur',        icon: '🏕️', name: 'Kaffee & Natur',        cost: 50 },
  { id: 'buero',        icon: '🏢', name: 'Büro-Survival',         cost: 50 },
  { id: 'meme',         icon: '📱', name: 'Meme-Modus',            cost: 50 },
];

// Sprüche-Booster: schaltet alle noch fehlenden Spruch-Packs auf einmal frei (Rabatt ggü. Einzelkauf)
const SPRUCH_BOOSTER_COST = 250;

// Pro freigeschaltetem Pack: mehrere passende Kurz-Presets für die Chat-Pinnwand (wie "☕ Kaffee alle!")
const PACK_PRESETS = {
  wiener:       ['🎩 Schlagobers, bitte!', '☕ Wiener Melange für alle!', '🕰️ Kaffeehaus-Pause, meine Herren!'],
  italiano:     ['🇮🇹 Espresso, presto!', '☕ Caffè pronto?', '🤌 Senza caffè, niente lavoro!'],
  wissenschaft: ['🔬 Koffein-Nachschub nötig!', '🧪 Adenosin-Rezeptoren blockiert — Kaffee fällig!', '☕ Experiment „Mehr Kaffee“ läuft!'],
  philosophie:  ['🤔 Erstmal Kaffee, dann denken!', '☕ Carpe Kaffee!', '🧘 Kaffeepause zum Nachdenken?'],
  grob:         ['🪓 Kaffee. Jetzt. Sofort.', '☕ Ohne Kaffee kein Gespräch!', '😤 Wo ist mein Kaffee?!'],
  natur:        ['🏕️ Kaffeepause draußen?', '🌲 Lagerfeuer-Kaffee gefällig?', '☕ Frische Luft + frischer Kaffee!'],
  buero:        ['🏢 Kaffeemaschine kaputt!!!', '📠 Drucker UND Kaffee leer — Katastrophe!', '☕ Meeting ohne Kaffee = Sabotage!'],
  meme:         ['🚀 Sleep cancelled, Kaffee incoming!', '☕ POV: kein Kaffee mehr.', '🔥 Main Character Energy braucht Kaffee!'],
};

// ── Saisonale Gewinner-Themes ─────────────────────────────────────────────────
// Ein Theme pro Monat — nur der Saison-Gewinner erhält es dauerhaft
const SEASON_THEMES = {
  '01': { id: 'saison_jan', icon: '❄️', name: 'Eiskaffee-Winter',   month: 'Januar'    },
  '02': { id: 'saison_feb', icon: '💝', name: 'Valentino Rosso',    month: 'Februar'   },
  '03': { id: 'saison_mar', icon: '🌱', name: 'Frühlingserwachen',  month: 'März'      },
  '04': { id: 'saison_apr', icon: '🐣', name: 'Osterröstung',       month: 'April'     },
  '05': { id: 'saison_mai', icon: '🌸', name: 'Maienblüte',         month: 'Mai'       },
  '06': { id: 'saison_jun', icon: '☀️', name: 'Sommerbrise',        month: 'Juni'      },
  '07': { id: 'saison_jul', icon: '🌊', name: 'Hitzewelle',         month: 'Juli'      },
  '08': { id: 'saison_aug', icon: '🌾', name: 'Erntedank',          month: 'August'    },
  '09': { id: 'saison_sep', icon: '🍂', name: 'Herbstgold',         month: 'September' },
  '10': { id: 'saison_okt', icon: '🎃', name: 'Kürbis-Latte',       month: 'Oktober'   },
  '11': { id: 'saison_nov', icon: '🌫️', name: 'Nebeltage',          month: 'November'  },
  '12': { id: 'saison_dez', icon: '🕯️', name: 'Adventsröster',      month: 'Dezember'  },
};

function getSeasonThemeId(seasonId) {
  const month = seasonId.split('-')[1]; // '2026-06' → '06'
  return SEASON_THEMES[month]?.id || null;
}

// ── Kaffee-Kasse Ziele (Gruppen-Effekte) ──────────────────────────────────────
// Werden automatisch freigeschaltet, sobald der Kassenstand die Kosten erreicht
// (DB.syncTreasuryGoals). Der Effekt wirkt DAUERHAFT für ALLE Gruppenmitglieder und
// fließt in jede Tasse (perCup) bzw. das Passiv-Einkommen (perDay) ein — siehe
// treasuryGroupPerks() + Anwendung in db.js addCups / _checkAndClaimPassive.
// Jedes Ziel ist einer Kassen-Stufe (level) zugeordnet und wird erst kaufbar/
// freischaltbar, wenn die Gruppe diese Stufe erreicht hat (treasuryLevel, s.u.).
const KASSE_GOALS = [
  // ── Stufe 1 — Kaffeeküche ──
  { id: 'gruppenroester',  level: 1, icon: '☕', name: 'Gemeinschafts-Röster',     cost: 500,   effect: { perCup: 0.5 },            desc: 'Alle Mitglieder dauerhaft +0,5 CC pro Tasse' },
  { id: 'wanderwege',      level: 1, icon: '👣', name: 'Gruppen-Wanderwege',       cost: 1000,  effect: { steps: 2 },               desc: 'Alle Mitglieder dauerhaft +2 Karten-Schritte/Tag' },
  // ── Stufe 2 — Rösterei ──
  { id: 'biogarten_grp',   level: 2, icon: '🌿', name: 'Gemeinsamer Biogarten',    cost: 1500,  effect: { perDay: 8 },              desc: 'Alle Mitglieder dauerhaft +8 CC passiv/Tag' },
  { id: 'schatzarchiv',    level: 2, icon: '🗺️', name: 'Schatzkarten-Archiv',      cost: 3000,  effect: { treasure: 0.25 },         desc: 'Schatzausbeute aller Mitglieder +25%' },
  // ── Stufe 3 — Plantage ──
  { id: 'team_espresso',   level: 3, icon: '🏆', name: 'Team-Espresso-Maschine',   cost: 4000,  effect: { perCup: 1 },              desc: 'Alle Mitglieder dauerhaft +1 CC pro Tasse extra' },
  { id: 'kaffeereise_grp', level: 3, icon: '🌍', name: 'Kaffeereise für alle',     cost: 8000,  effect: { perDay: 25 },             desc: 'Alle Mitglieder dauerhaft +25 CC passiv/Tag' },
  // ── Stufe 4 — Handelshaus ──
  { id: 'handelskontor',   level: 4, icon: '⚓', name: 'Gemeinsames Handelskontor', cost: 12000, effect: { perDay: 35 },            desc: 'Alle Mitglieder dauerhaft +35 CC passiv/Tag' },
  { id: 'barista_uni',     level: 4, icon: '🎓', name: 'Barista-Universität',      cost: 18000, effect: { perCup: 1.5 },            desc: 'Alle Mitglieder dauerhaft +1,5 CC pro Tasse' },
  // ── Stufe 5 — Kaffee-Imperium ──
  { id: 'wbc',             level: 5, icon: '🏅', name: 'World Barista Championship', cost: 28000, effect: { perCup: 2, perDay: 40 },  desc: 'Alle +2 CC/Tasse UND +40 CC passiv/Tag' },
  { id: 'kaffeesatellit',  level: 5, icon: '🛰️', name: 'Kaffee-Satellit',          cost: 50000, effect: { perDay: 100, treasure: 0.5 }, desc: 'Endstufe: alle +100 CC passiv/Tag UND +50% Schatzausbeute' },
];

// ── Kassen-Stufen (1–5) ───────────────────────────────────────────────────────
// Die Stufe richtet sich nach den KUMULATIVEN Gesamt-Einzahlungen (Summe aller
// contributions, ohne reservierte _-Keys) und sinkt nie — auch wenn die Kasse fürs
// Freischalten von Zielen geleert wird. Jede Stufe schaltet (a) neue Gruppen-Ziele
// frei und gewährt (b) einen dauerhaften Stufen-Bonus für ALLE Mitglieder (perk),
// der — kumulativ über alle erreichten Stufen — in treasuryGroupPerks einfließt.
// Zusätzliche frische Mechaniken: ab Stufe 2 doppelte Wochen-Challenge-Belohnung
// (challengeMult), ab Stufe 4 Spar-Zins auf den Kassenstand (interest, in db.js
// applyDailyLevy angewandt).
const KASSE_LEVELS = [
  { level: 1, threshold: 0,     name: 'Kaffeeküche',     icon: '🥄', perk: {},                              mechanic: 'Basis-Gruppenziele freigeschaltet' },
  { level: 2, threshold: 2000,  name: 'Rösterei',        icon: '⚙️', perk: { perCup: 0.5 }, challengeMult: 2, mechanic: 'Wochen-Challenge-Belohnung ×2 · +0,5 CC/Tasse für alle' },
  { level: 3, threshold: 6000,  name: 'Plantage',        icon: '🌱', perk: { perDay: 10, steps: 2 },        mechanic: 'Gruppen-Dividende +10 CC passiv/Tag · +2 Karten-Schritte für alle' },
  { level: 4, threshold: 15000, name: 'Handelshaus',     icon: '🏛️', perk: { perCup: 0.5, perDay: 20 }, interest: 0.01, mechanic: 'Spar-Zins: Kasse +1 %/Tag · +0,5 CC/Tasse · +20 CC passiv/Tag' },
  { level: 5, threshold: 40000, name: 'Kaffee-Imperium', icon: '👑', perk: { perCup: 1, perDay: 40, treasure: 0.25 }, interest: 0.02, mechanic: 'Endstufe: Spar-Zins 2 %/Tag · +1 CC/Tasse · +40 CC passiv/Tag · +25 % Schatz' },
];

// Summe aller echten Einzahlungen (reservierte _-Keys wie _levy ignorieren).
function treasuryTotalContributed(treasury) {
  const c = (treasury && treasury.contributions) || {};
  let sum = 0;
  for (const k in c) { if (k[0] !== '_') sum += parseFloat(c[k]) || 0; }
  return Math.round(sum * 100) / 100;
}

// Aktuelle Stufeninfo: erreichte Stufe + Fortschritt zur nächsten.
function treasuryLevelInfo(treasury) {
  const total = treasuryTotalContributed(treasury);
  let cur = KASSE_LEVELS[0];
  for (const l of KASSE_LEVELS) { if (total >= l.threshold) cur = l; }
  const next = KASSE_LEVELS.find(l => l.level === cur.level + 1) || null;
  const base = cur.threshold;
  const pct  = next ? Math.min(100, Math.round(((total - base) / (next.threshold - base)) * 100)) : 100;
  return { level: cur.level, name: cur.name, icon: cur.icon, mechanic: cur.mechanic, cur, next, total, pct };
}

// Kumulative Stufen-Boni (alle Stufen ≤ aktueller Stufe).
function treasuryLevelPerks(treasury) {
  const out = { perCup: 0, perDay: 0, steps: 0, treasure: 0 };
  const lvl = treasuryLevelInfo(treasury).level;
  for (const l of KASSE_LEVELS) {
    if (l.level <= lvl && l.perk) {
      out.perCup   += l.perk.perCup   || 0;
      out.perDay   += l.perk.perDay   || 0;
      out.steps    += l.perk.steps    || 0;
      out.treasure += l.perk.treasure || 0;
    }
  }
  return out;
}

// Wochen-Challenge-Multiplikator (höchster erreichter), Spar-Zinssatz (höchster erreichter).
function treasuryChallengeMult(treasury) {
  const lvl = treasuryLevelInfo(treasury).level;
  let m = 1; for (const l of KASSE_LEVELS) { if (l.level <= lvl && l.challengeMult) m = Math.max(m, l.challengeMult); }
  return m;
}
function treasuryInterestRate(treasury) {
  const lvl = treasuryLevelInfo(treasury).level;
  let r = 0; for (const l of KASSE_LEVELS) { if (l.level <= lvl && l.interest) r = Math.max(r, l.interest); }
  return r;
}

// Aggregierte Gruppen-Boni aus freigeschalteten Kassen-Zielen UND erreichten Stufen.
// Beides fließt in dieselbe perCup/perDay/steps/treasure-Summe → alle bestehenden
// Anwendungsstellen (addCups, Passiv-Einlösung, Karte, Gehalts-Snapshot) bekommen
// die Stufen-Boni automatisch, ohne neue Verkabelung.
// treasury = { balance, contributions, unlocked_goals }
function treasuryGroupPerks(treasury) {
  const out = { perCup: 0, perDay: 0, steps: 0, treasure: 0 };
  const unlocked = (treasury && treasury.unlocked_goals) || {};
  for (const g of KASSE_GOALS) {
    if (unlocked[g.id] && g.effect) {
      out.perCup   += g.effect.perCup   || 0;
      out.perDay   += g.effect.perDay   || 0;
      out.steps    += g.effect.steps    || 0;
      out.treasure += g.effect.treasure || 0;
    }
  }
  const lp = treasuryLevelPerks(treasury);
  out.perCup   += lp.perCup;
  out.perDay   += lp.perDay;
  out.steps    += lp.steps;
  out.treasure += lp.treasure;
  out.perCup   = Math.round(out.perCup * 100) / 100;
  out.perDay   = Math.round(out.perDay * 100) / 100;
  out.treasure = Math.round(out.treasure * 100) / 100;
  return out;
}
// ── Wöchentliche Gruppen-Challenge (kollektiv) ───────────────────────────────
// Belohnt gemeinsame Aktivität (nicht nur Einzahlen): Fortschritt = Summe ALLER
// Gruppen-Tassen der laufenden ISO-Woche. Bei Erreichen bekommt JEDES Mitglied die
// Belohnung — einmalig pro Woche, idempotent über treasury.unlocked_goals[week_<key>].
const WEEKLY_CHALLENGE = { goalCups: 100, reward: 50, icon: '🎯', label: 'Gemeinsam 100 Tassen diese Woche' };

function isoWeekKey(d) {
  const date = new Date(Date.UTC(
    (d ? new Date(d) : new Date()).getFullYear(),
    (d ? new Date(d) : new Date()).getMonth(),
    (d ? new Date(d) : new Date()).getDate()
  ));
  const dayNum = (date.getUTCDay() + 6) % 7;       // Mo=0 … So=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Donnerstag dieser Woche
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Liste der aktiven Gruppen-Effekte (für Anzeige in Statistik / Kasse-Tab)
function treasuryActiveGoals(treasury) {
  const unlocked = (treasury && treasury.unlocked_goals) || {};
  return KASSE_GOALS.filter(g => unlocked[g.id]);
}
// ID des Mitglieds mit der höchsten Gesamteinzahlung („Wohltäter") — null bei leer.
// validIds (optional): nur diese IDs zählen → schließt gelöschte Ex-Mitglieder aus,
// deren Beiträge als Altlast im JSONB verbleiben (sonst gewinnt ein „Geist").
function treasuryTopContributor(treasury, validIds) {
  const c = (treasury && treasury.contributions) || {};
  const valid = validIds ? new Set(validIds) : null;
  let bestId = null, best = 0;
  for (const [id, amt] of Object.entries(c)) {
    if (id.startsWith('_')) continue;          // reservierte Meta-Keys (z.B. _levy) überspringen
    if (valid && !valid.has(id)) continue;     // nur aktuelle Mitglieder
    const v = parseFloat(amt) || 0;
    if (v > best) { best = v; bestId = id; }
  }
  return best > 0 ? bestId : null;
}

// ── Cosmetics ────────────────────────────────────────────────────────────────
const COSMETIC_THEMES = [
  { id: 'default',       icon: '☕', name: 'Standard',        how: 'immer frei',         free: true },
  { id: 'waldcafe',      icon: '🌲', name: 'Waldcafé',        how: 'Natur-Café Kombo' },
  { id: 'berge',         icon: '🏔️', name: 'Berghütte',       how: 'Kaffee-Weltreise' },
  { id: 'fruehling',     icon: '🌸', name: 'Frühlingsgarten', how: '30 Werktage Streak' },
  { id: 'beach',         icon: '🌊', name: 'Beach Roast',     how: 'Saison gewonnen' },
  { id: 'midnight',      icon: '🌙', name: 'Midnight Roast',  how: '100 Werktage Streak' },
  { id: 'herbst',        icon: '🍂', name: 'Herbstkaffee',    how: '500 Tassen' },
  { id: 'zen',           icon: '🌿', name: 'Zen-Garten',      how: 'Wildnis-Camp' },
  { id: 'roester',       icon: '🔥', name: 'Röster-Atelier',  how: 'Fahrende Rösterei' },
  // Saisonale Gewinner-Themes (12 Stück, je nach Monat)
  { id: 'saison_jan', icon: '❄️', name: 'Eiskaffee-Winter',  how: 'Saison Januar gewonnen' },
  { id: 'saison_feb', icon: '💝', name: 'Valentino Rosso',   how: 'Saison Februar gewonnen' },
  { id: 'saison_mar', icon: '🌱', name: 'Frühlingserwachen', how: 'Saison März gewonnen' },
  { id: 'saison_apr', icon: '🐣', name: 'Osterröstung',      how: 'Saison April gewonnen' },
  { id: 'saison_mai', icon: '🌸', name: 'Maienblüte',        how: 'Saison Mai gewonnen' },
  { id: 'saison_jun', icon: '☀️', name: 'Sommerbrise',       how: 'Saison Juni gewonnen' },
  { id: 'saison_jul', icon: '🌊', name: 'Hitzewelle',        how: 'Saison Juli gewonnen' },
  { id: 'saison_aug', icon: '🌾', name: 'Erntedank',         how: 'Saison August gewonnen' },
  { id: 'saison_sep', icon: '🍂', name: 'Herbstgold',        how: 'Saison September gewonnen' },
  { id: 'saison_okt', icon: '🎃', name: 'Kürbis-Latte',      how: 'Saison Oktober gewonnen' },
  { id: 'saison_nov', icon: '🌫️', name: 'Nebeltage',         how: 'Saison November gewonnen' },
  { id: 'saison_dez', icon: '🕯️', name: 'Adventsröster',     how: 'Saison Dezember gewonnen' },
];

const COSMETIC_AVATARS = [
  { id: 'kaffee',   icon: '☕', name: 'Standard',        how: 'immer frei', free: true },
  { id: 'keimling', icon: '🌱', name: 'Keimling',        how: 'Anbau T2' },
  { id: 'kanne',    icon: '🫖', name: 'Teekanne',        how: '200 CC',     cost: 200 },
  { id: 'bubble',   icon: '🧋', name: 'Bubble Tea',      how: '150 CC',     cost: 150 },
  { id: 'feuer',    icon: '🔥', name: 'Flammen-Barista', how: 'Röstmaschine' },
  { id: 'welt',     icon: '🌍', name: 'Weltbürger',      how: 'Kaffee-Weltreise' },
  { id: 'kunst',    icon: '🎭', name: 'Barista-Künstler',how: 'Barista-Kunstwerk' },
  { id: 'krone',    icon: '👑', name: 'Kaiser',           how: 'Level 10 (5000+ Tassen)' },
];

const ZUSATZTITEL = [
  { id: 'caffe_nerd',    icon: '☕', name: 'Caffè-Nerd',      cost: 500,   how: '500 CC kaufen' },
  { id: 'roestmeister',  icon: '🔥', name: 'Röstmeister',     cost: 0,    how: 'Röstmaschine freischalten' },
  { id: 'baron',         icon: '🌍', name: 'Plantagen-Baron', cost: 0,    how: 'Exportplantage freischalten' },
  { id: 'bio',           icon: '🌿', name: 'Bio-Enthusiast',  cost: 0,    how: 'Bio-Zertifikat Kombo' },
  { id: 'toepfer',       icon: '🏺', name: 'Töpfer-Barista',  cost: 0,    how: 'Eigene Tasse Kombo' },
  { id: 'ki',            icon: '🤖', name: 'KI-Röstmeister',  cost: 0,    how: 'KI-Kaffee-Genie Kombo' },
  { id: 'berg',          icon: '🏔️', name: 'Bergkaffee-Mönch',cost: 1000, how: 'Wildnis-Camp + 1.000 CC' },
  { id: 'nomade',        icon: '🚗', name: 'Kaffeenomade',    cost: 0,    how: 'Fahrende Rösterei Kombo' },
  { id: 'wald',          icon: '🌲', name: 'Waldbewohner',    cost: 0,    how: 'Natur-Café Kombo' },
  { id: 'kuenstler',     icon: '🎭', name: 'Barista-Künstler',cost: 0,    how: 'Barista-Kunstwerk Kombo' },
  { id: 'beach',         icon: '🌊', name: 'Beach Roaster',   cost: 800,  how: 'Saison gewonnen + 800 CC' },
  { id: 'kaiser',        icon: '👑', name: 'Kaffee-Kaiser',   cost: 0,    how: 'Nur Level 10 — nicht kaufbar', exclusive: true },
];

// ── Helfer-Funktionen ─────────────────────────────────────────────────────────
function getAllResearchItems() {
  const items = [];
  for (const [key, path] of Object.entries(RESEARCH_PATHS)) {
    for (const item of path.items) items.push({ ...item, path: key, pathName: path.name, pathIcon: path.icon });
  }
  return items;
}

function calcResearchPerCup(research) {
  if (!research) return 0;
  let bonus = 0;
  for (const item of getAllResearchItems()) {
    if (research[item.id]) bonus += (item.perCup || 0);
  }
  for (const combo of RESEARCH_COMBOS) {
    if (research[combo.id]) bonus += (combo.perCup || 0);
  }
  if (research.bio_zertifikat) bonus *= 1.2;
  if (research.iot_roester)    bonus += bonus; // technik_x2 adds the technik portion — simplified: double whole bonus
  if (research.ki_kaffee_genie) bonus *= 3;
  if (research.weltreise)      bonus *= 1.5;
  if (research.weltkonzern)    bonus *= 3;
  bonus *= tierBonusMult(research); // +25% je vollständig abgeschlossenem Tier
  return Math.round(bonus * 100) / 100;
}

function calcResearchPerDay(research) {
  if (!research) return 0;
  let bonus = 0;
  for (const item of getAllResearchItems()) {
    if (research[item.id]) bonus += (item.perDay || 0);
  }
  for (const combo of RESEARCH_COMBOS) {
    if (research[combo.id]) bonus += (combo.perDay || 0);
  }
  if (research.bio_zertifikat) bonus *= 1.2;
  if (research.weltkonzern)    bonus *= 3;
  if (research.weltreise)      bonus *= 1.5;
  bonus *= tierBonusMult(research);     // +25% je vollständig abgeschlossenem Tier
  bonus += tierFlatPerDay(research);    // flacher Abschluss-Bonus (front-loaded, NICHT multipliziert)
  return Math.round(bonus * 100) / 100;
}

// ── Tier-Abschluss-Bonus ────────────────────────────────────────────────────────
// Wer ALLE Items eines Tiers besitzt, bekommt +25% auf alle Forschungs-Effekte
// (perCup + perDay). Kumulativ: T1+T2+T3 voll = +75% → ×1.75. Macht das Komplettieren
// eines Tiers lohnend und beschleunigt den (sonst als zäh empfundenen) CC-Aufbau.
function completedResearchTiers(research) {
  if (!research) return 0;
  const items = getAllResearchItems();
  let n = 0;
  for (let t = 1; t <= 5; t++) {
    const tierItems = items.filter(i => i.tier === t);
    if (tierItems.length && tierItems.every(i => research[i.id])) n++;
  }
  return n;
}
function tierBonusMult(research) {
  return 1 + 0.25 * completedResearchTiers(research);
}

// ── Flacher Gehalts-Bonus je VOLLSTÄNDIG abgeschlossenem Tier ────────────────────
// Bewusst FRONT-LOADED (T1 am höchsten): im frühen Spiel existiert kaum passives
// Einkommen, der +25%-Multiplikator wirkt dort auf fast Null — dieser flache CC/Tag-
// Bonus gibt einen absoluten Boden und macht die Entwicklungen (200–400 CC) erreichbar.
// Späte Tiers bringen über Item-Werte + Multiplikator ohnehin viel, daher tapert er aus.
// Wird NICHT vom Tier-Multiplikator erfasst (separater Abschluss-Bonus, kein Item-Ertrag).
const TIER_FLAT_PERDAY = { 1: 20, 2: 5, 3: 4, 4: 2, 5: 1 };
function tierFlatPerDay(research) {
  if (!research) return 0;
  const items = getAllResearchItems();
  let sum = 0;
  for (let t = 1; t <= 5; t++) {
    const tierItems = items.filter(i => i.tier === t);
    if (tierItems.length && tierItems.every(i => research[i.id])) sum += TIER_FLAT_PERDAY[t] || 0;
  }
  return sum;
}

// ── Quellen-Aufschlüsselung (für „Heute erhalten" — Transparenz/Lerneffekt) ──────
function researchPerCupSources(research) {
  if (!research) return [];
  const out = [];
  for (const item of getAllResearchItems()) if (research[item.id] && (item.perCup || 0) > 0) out.push(item);
  for (const combo of RESEARCH_COMBOS)     if (research[combo.id] && (combo.perCup || 0) > 0) out.push(combo);
  return out;
}
function researchPerDaySources(research) {
  if (!research) return [];
  const out = [];
  for (const item of getAllResearchItems()) if (research[item.id] && (item.perDay || 0) > 0) out.push(item);
  for (const combo of RESEARCH_COMBOS)     if (research[combo.id] && (combo.perDay || 0) > 0) out.push(combo);
  return out;
}
// Aktive globale Multiplikatoren, getrennt nach Wirkung auf Tasse vs. Tag
function researchPerCupMultipliers(research) {
  const m = [];
  if (research?.bio_zertifikat)  m.push('Bio +20%');
  if (research?.iot_roester)     m.push('IoT-Röster ×2');
  if (research?.ki_kaffee_genie) m.push('KI-Genie ×3');
  if (research?.weltreise)       m.push('Weltreise ×1.5');
  if (research?.weltkonzern)     m.push('Weltkonzern ×3');
  const ct = completedResearchTiers(research);
  if (ct > 0) m.push(`Tier-Bonus +${ct * 25}%`);
  return m;
}
function researchPerDayMultipliers(research) {
  const m = [];
  if (research?.bio_zertifikat) m.push('Bio +20%');
  if (research?.weltreise)      m.push('Weltreise ×1.5');
  if (research?.weltkonzern)    m.push('Weltkonzern ×3');
  const ct = completedResearchTiers(research);
  if (ct > 0) m.push(`Tier-Bonus +${ct * 25}%`);
  return m;
}
// Detail-Strings für das Tages-Log
function researchPerCupDetail(research, amount, perCupRate) {
  const src = researchPerCupSources(research).map(s => `${s.icon}+${s.perCup}`).join(', ');
  const mul = researchPerCupMultipliers(research);
  let d = `${amount}× à ${perCupRate}/Tasse`;
  if (src) d += ` · ${src}`;
  if (mul.length) d += ` · ${mul.join(', ')}`;
  return d;
}
function researchPerDayDetail(research) {
  const src = researchPerDaySources(research).map(s => `${s.icon} ${s.name} +${s.perDay}/Tag`).join(', ');
  const mul = researchPerDayMultipliers(research);
  const flat = tierFlatPerDay(research);
  let d = src + (mul.length ? ` · ${mul.join(', ')}` : '');
  if (flat > 0) d += `${d ? ' · ' : ''}🎖️ Tier-Abschluss +${flat}/Tag`;
  return d;
}

function isComboAutoUnlocked(comboId, research) {
  const combo = RESEARCH_COMBOS.find(c => c.id === comboId);
  if (!combo || combo.cost > 0) return false;
  return combo.requires.every(req => research && research[req]);
}

function countTier3PlusOwned(research) {
  if (!research) return 0;
  return getAllResearchItems().filter(i => i.tier >= 3 && research[i.id]).length;
}

function calcResearchScore(research) {
  if (!research) return 0;
  let score = 0;
  for (const item of getAllResearchItems()) if (research[item.id]) score += item.cost;
  for (const combo of RESEARCH_COMBOS)     if (research[combo.id] && combo.cost > 0) score += combo.cost;
  return score;
}

function getCurrentSpruch(totalCups, achievements, unlockedPacks) {
  const packs = unlockedPacks || {};
  const achKeys = Object.keys(achievements || {});

  // Check for achievement-specific quotes first
  for (const key of achKeys) {
    if (ACH_SPRUECHE[key]) return ACH_SPRUECHE[key];
  }

  // Pack quotes
  const ownedPacks = SPRUCH_PACKS.filter(p => packs[p.id]);
  if (ownedPacks.length > 0) {
    const pack = ownedPacks[Math.floor(Date.now() / (1000*60*60*24)) % ownedPacks.length];
    const quotes = PACK_SPRUECHE[pack.id] || [];
    if (quotes.length) return quotes[Math.floor(Date.now() / (1000*60*60*6)) % quotes.length];
  }

  // Tier quotes
  let tier = SPRUECHE_TIERS[0];
  for (const t of SPRUECHE_TIERS) { if (totalCups >= t.minCups) tier = t; }
  const idx = Math.floor(Date.now() / (1000*60*60*12)) % tier.quotes.length;
  return tier.quotes[idx];
}
