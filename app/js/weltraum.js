// ═══════════════════════════════════════════════════════════════════════════
// weltraum.js — 🚀 Weltraum-Endgame „Kaffee-Clan" (Phase 1 / MVP)
// Plan: plans/PLAN_weltraum.md. VOR imperium.js laden.
//
// Die Galaxie ist GETEILT: alle Spieler einer Gruppe sehen dieselben Planeten
// (space_planets, einmalig deterministisch geseedet) und decken den Nebel gemeinsam auf
// (space_clan.revealed). Flotten, Rohstoffe und Kolonien gehören dagegen dem einzelnen
// Spieler (members.space).
//
// AUTORITÄT: Reisezeiten, Kampf, Beute und Kolonie-Erträge rechnet ausschließlich der
// Server (start_space_trip / claim_space_arrival / harvest_space). Dieses Modul rendert
// und zeigt Vorschauwerte — es bucht nichts selbst.
//
// BILD-ASSETS: Forschungs-Icons liegen fertig unter assets/weltraum/ (aus JPs Render
// plans/Weltraum_expansion.png geschnitten). Die Schiffs-Portraits assets/space/ship_*.png
// generiert JP nach plans/PROMPT_weltraum_schiffe.md — bis dahin greift überall der
// Emoji-Rückfall. Ablegen genügt, es ist KEINE Code-Änderung nötig.
//
// ⚠️ SPACE_SHIPS spiegelt _space_ship_stats() in migration_2026-07-21_weltraum_p1.sql.
//    Bei Balance-Änderungen BEIDE Seiten anfassen.
// ═══════════════════════════════════════════════════════════════════════════

// ── Schiffe ──────────────────────────────────────────────────────────────────
// atk = Kampfkraft · mine = Abbau je Schiff · needs = Forschungs-Freischaltung
// Erste Bauten sind bewusst REIN CC: wer noch keine Rohstoffe hat, muss trotzdem
// starten können (sonst Deadlock — Rohstoffe gibt es nur aus dem All).
const SPACE_SHIPS = [
  { key:'sonde', buildMin:10, art:'ship_spaeher',   icon:'🛰️', name:'Bohnen-Sonde',   atk:1,  mine:0, cc:600,  erz:0,  kristall:0,
    needs:'wt_ionenantrieb', desc:'Deckt den Nebel eines Quadranten auf' },
  { key:'jaeger', buildMin:15, art:'ship_jaeger',  icon:'🔫', name:'Jäger',           atk:10, mine:0, cc:900,  erz:0,  kristall:0,
    needs:'wt_ionenantrieb', desc:'Billige Kampfkraft — Anzahl entscheidet' },
  // 🛩️ Großer Jäger (JP 2026-07-27): füllt die Lücke zwischen Wegwerf-Jäger und der
  // Fregatte. Bleibt leichte Klasse — Konterbonus gegen Schwärme, kleiner Schild.
  // ⚠️ Spiegel: _space_ship_cost/_stats/_role/_build_min in migration_2026-07-26i.
  { key:'grossjaeger', buildMin:22, art:'ship_grossjaeger', icon:'🛩️', name:'Großer Jäger', atk:20, mine:0, cc:1400, erz:20, kristall:0,
    needs:'wt_frachtmodule', desc:'Schwerer Abfangjäger — doppelte Feuerkraft je Rumpf, leichter Schild' },
  { key:'kutter', buildMin:25, art:'ship_kutter',  icon:'🚀', name:'Espresso-Kutter', atk:2,  mine:0, cc:1200, erz:0,  kristall:0,
    needs:'wt_frachtmodule', desc:'Frachter, bringt Ausbeute sicher heim' },
  { key:'ernter', buildMin:35, art:'ship_ernter',  icon:'⛏️', name:'Röstkomet',       atk:3,  mine:8, cc:1200, erz:20, kristall:0,
    needs:'wt_handbohrer',   desc:'Baut Erz und Koffeinkristall ab' },
  { key:'berger', buildMin:30, art:'ship_berger',  icon:'♻️', name:'Bergungsschiff', atk:1,  mine:0, cc:1500, erz:40, kristall:0,
    needs:'wt_frachtmodule', desc:'Holt mehr aus Wracks — im Kampf und an befreiten Planeten' },
  { key:'kolonie', buildMin:90, art:'ship_kolonie', icon:'🛸', name:'Kolonieschiff',   atk:0,  mine:0, cc:3000, erz:70, kristall:20,
    needs:'wt_frachtmodule', desc:'Gründet eine Kolonie — bleibt am Zielplaneten' },
  { key:'fregatte', buildMin:40, art:'ship_fregatte', icon:'🛡️', name:'Fregatte', atk:28, mine:0, cc:1800, erz:55, kristall:0,
    needs:'wt_frachtmodule', desc:'Leichter Begleitschutz — Schild senkt die Verluste des ganzen Verbands' },
  // 🛩️ Trägerschiff (JP 2026-07-29): der Grund, warum es kleine Jäger weiterhin gibt.
  // ⚠️ Spiegel: _space_ship_cost/_stats/_role/_build_min in migration_2026-07-26m.
  // ⚠️ KEIN Plasmoid im Preis, obwohl der Plan 30 🟣 vorsah — _space_ship_cost liefert nur
  // (cc, erz, kristall); eine vierte Spalte hätte den ganzen Warenkorb-Pfad mitgerissen
  // (42P13). Steht so auch im Kopf der Migration.
  // Die Kapazität gehört in den desc-Text: es gibt bewusst KEIN What's-New-Popup (JP),
  // also muss die Regel dort stehen, wo man das Schiff kauft.
  { key:'traeger', buildMin:150, art:'ship_traeger', icon:'🛩️', name:'Trägerschiff', atk:40, mine:0, cc:18000, erz:500, kristall:180,
    needs:'wt_frachtmodule', desc:'Nimmt 20 Jäger auf: nur so kommen kleine Jäger nach Ring 2/3. Schützt sie mit seinem Schild und gibt +5 % Kampfkraft auf den ganzen Verband (max. +15 %)' },
  // ⚠️ JP 2026-07-22: Bomber ↔ Kreuzer haben NAME/BILD/ICON getauscht — der Kreuzer
  // ist optisch größer und soll daher das stärkere, teurere Schiff sein. Die KEYS,
  // Werte und Rollen (SPACE_ROLES) bleiben unverändert: Keys stecken serverseitig in
  // _space_ship_stats/loss_order UND in den Flottenbeständen der Spieler — ein
  // Key-Tausch hätte bestehende Flotten still umbewertet. CHAT_ART (app.js) ist
  // spiegelbildlich mitgetauscht, sonst zeigte der Chat das alte Bild zum neuen Namen.
  { key:'kreuzer', buildMin:70, art:'ship_bomber', icon:'💣', name:'Bomber', atk:65, mine:0, cc:3600, erz:140, kristall:20,
    needs:'wt_frachtmodule', desc:'Kapitalschiff-Jäger: stark gegen schwere Gegner, träge gegen Schwärme' },
  { key:'bomber', buildMin:100, art:'ship_kreuzer', icon:'🚨', name:'Kreuzer', atk:90, mine:0, cc:5500, erz:210, kristall:45,
    needs:'wt_frachtmodule', desc:'Überall stark, gegen Geschütze verheerend' },
  { key:'schlachtschiff', buildMin:150, art:'ship_schlachtschiff', icon:'⚔️', name:'Schlachtschiff', atk:180, mine:0, cc:11000, erz:440, kristall:110,
    needs:'wt_frachtmodule', desc:'Überall stark, hoher Schild — das Rückgrat einer großen Flotte' },
  { key:'dunkle_roestung', buildMin:240, art:'ship_dunkle_roestung', icon:'🌑', name:'Dunkle Röstung', atk:320, mine:0, cc:21000, erz:850, kristall:260,
    needs:'wt_frachtmodule', desc:'Elite-Kapitalschiff: überall stark, höchster Schild, enormer Preis' },
  // 🛸 Flaggschiff (JP 2026-07-27). `special:'flagship'` heißt: NICHT über den Warenkorb
  // kaufbar — es entsteht nur in build_mutterschiff aus eingelösten Rümpfen. Die Werft
  // überspringt solche Schiffe deshalb in beiden Schleifen und zeigt ein eigenes Panel.
  { key:'mutterschiff', buildMin:300, art:'ship_mutterschiff', icon:'🛸', name:'Mutterschiff', atk:1170, mine:0,
    cc:30000, erz:600, kristall:250, plasmoid:80, quantum:40, special:'flagship',
    needs:'wt_frachtmodule', desc:'Flaggschiff aus eingelösten Rümpfen — hebt die Kampfkraft des ganzen Verbands' },
];
const SPACE_SHIP_BY_KEY = SPACE_SHIPS.reduce((m, s) => (m[s.key] = s, m), {});

// ── 🔬 Weltraum-Technik (Spiegel von migration_2026-07-21k/l) ────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: Kosten, Ketten und Effekte stehen identisch in
// _space_tech_def() und den _space_tech_*-Funktionen. Weicht eine Zahl ab, zeigt
// die Vorschau etwas anderes an, als der Server rechnet.
//
// `live:false` = Effekt ist serverseitig NOCH NICHT eingehängt. Solche Techniken
// sind bewusst NICHT kaufbar — lieber sichtbar „in Vorbereitung" als 25.000 CC für
// nichts. Ast A ist verdrahtet (21l), B/C/D folgen.
// ⚠️ UMBAU 2026-07-29 (JP): „Du kannst doch die Dinge aus Plasmoid-Technik und
// Quanten-Technik einfach in die bestehenden Rubriken einsortieren als komplett
// durchmischt dort einzufügen?" — die früheren Äste 🟣 E und 🌀 F sind AUFGELÖST; ihre
// 25 Techniken stehen jetzt thematisch in A–D. Das passte ohnehin besser, weil ihre
// `requires` schon immer in A–D zeigten (wt_e1 → wt_b3, wt_e7 → wt_c4, wt_e13 → wt_d5 …).
// Die SCHLÜSSEL bleiben `wt_e*`/`wt_f*` — sie stecken in `members.space.tech` und in
// _space_tech_def. Nur `ast` und `stufe` ändern sich, und die sind REIN ANZEIGE:
// buy_space_tech prüft ausschliesslich Kosten und `requires`, liest weder ast noch stufe.
// Deshalb braucht dieser Umbau KEINE Migration.
const SPACE_TECH_ASTE = [
  { key:'a', icon:'🚀', name:'Antrieb & Hülle',        art:'base_werft_2',        live:true  },
  { key:'b', icon:'🛡️', name:'Bewaffnung',             art:'turret_plasma',       live:true  },
  { key:'c', icon:'⛏️', name:'Schürftechnik',          art:'base_erzraffinerie',  live:true  },
  { key:'d', icon:'🏭', name:'Raffinerie & Logistik',  art:'base_kristallreactor', live:true  },
];
const SPACE_TECH = [
  // Ast A — verdrahtet
  // art: dedizierte Forschungs-Icons aus assets/weltraum/ (JP-Fix 2026-07-26), nicht mehr generische space/-Namen
  { key:'wt_a3', ast:'a', stufe:3, name:'Warp-Kessel',    cc:15000, erz:240, kristall:65,  requires:null,
    wirkung:'Flugzeit −25 %',            art:'wt3_warp_kessel', live:true },
  { key:'wt_a4', ast:'a', stufe:4, name:'Orbitalwerft',   cc:24000, erz:400, kristall:130,  requires:'wt_a3',
    wirkung:'Bauzeit −15 %',             art:'wt4_werft', live:true },
  { key:'wt_a5', ast:'a', stufe:5, name:'Dunkle Materie', cc:39000, erz:640, kristall:240, requires:'wt_a4',
    wirkung:'Flugzeit weitere −25 %',    art:'wt5_dunkle_materie', live:true },
  // Ast B — noch nicht verdrahtet
  { key:'wt_b1', ast:'b', stufe:1, name:'Bohnen-Railgun',       cc:4800,  erz:65,  kristall:0,   requires:null,   wirkung:'Geschütz-Feuerkraft +15 %',      art:'wt1_railgun',        live:true },
  { key:'wt_b2', ast:'b', stufe:2, name:'Koffein-Laser',        cc:9000, erz:130,  kristall:25,  requires:'wt_b1', wirkung:'Flotten-Kampfkraft +10 %',       art:'wt2_koffein_laser',  live:true },
  { key:'wt_b3', ast:'b', stufe:3, name:'Plasma-Kanone',        cc:15000, erz:240, kristall:65,  requires:'wt_b2', wirkung:'Kampfverluste −15 %',            art:'wt3_plasma_kanone',  live:true },
  { key:'wt_b4', ast:'b', stufe:4, name:'EMP-Espresso',         cc:24000, erz:400, kristall:130,  requires:'wt_b3', wirkung:'Hinterhalte halb so oft',        art:'wt4_emp_espresso',   live:true },
  { key:'wt_b5', ast:'b', stufe:5, name:'Singularitätswerfer',  cc:39000, erz:640, kristall:240, requires:'wt_b4', wirkung:'Geschütze +40 %, Reparatur 4 h', art:'wt5_singularitaet',  live:true },
  // Ast C
  { key:'wt_c2', ast:'c', stufe:2, name:'Tiefenscanner',    cc:9000, erz:130,  kristall:25,  requires:null,   wirkung:'Abbau +15 %',            art:'wt2_scanner',        live:true },
  { key:'wt_c3', ast:'c', stufe:3, name:'Plasma-Bohrkopf',  cc:15000, erz:240, kristall:65,  requires:'wt_c2', wirkung:'Dauerernte +25 %',       art:'wt3_plasma_bohrkopf', live:true },
  { key:'wt_c4', ast:'c', stufe:4, name:'Schürfdrohnen',    cc:24000, erz:400, kristall:130,  requires:'wt_c3', wirkung:'Treibstoff −50 %',       art:'wt4_schuerfdrohnen', live:true },
  { key:'wt_c5', ast:'c', stufe:5, name:'Kern-Extraktor',   cc:39000, erz:640, kristall:240, requires:'wt_c4', wirkung:'Kolonie-Ertrag +50 %',   art:'wt5_kern_extraktor', live:true },
  // Ast D
  { key:'wt_d1', ast:'d', stufe:1, name:'Raffinerie',         cc:4800,  erz:65,  kristall:0,   requires:null,   wirkung:'Rohstoffkosten −20 %',    art:'wt1_raffinerie',      live:true },
  { key:'wt_d2', ast:'d', stufe:2, name:'Handelsdock',        cc:9000, erz:130,  kristall:25,  requires:'wt_d1', wirkung:'Kampf-Bergung +25 %',     art:'wt2_handelsdock',     live:true },
  { key:'wt_d3', ast:'d', stufe:3, name:'Orbitallager',       cc:15000, erz:240, kristall:65,  requires:'wt_d2', wirkung:'Ansammlung 14 → 21 Tage', art:'wt3_lager',           live:true },
  { key:'wt_d4', ast:'d', stufe:4, name:'Fern-Handelsroute',  cc:24000, erz:400, kristall:130,  requires:'wt_d3', wirkung:'Kolonien geben CC/Tag',   art:'wt4_handelsroute',    live:true },
  { key:'wt_d5', ast:'d', stufe:5, name:'Sternenbörse',       cc:39000, erz:640, kristall:240, requires:'wt_d4', wirkung:'Wrack-Ausbeute +30 %',    art:'wt5_sternenboerse',   live:true },
  // ── Fortgeschrittene Forschung (26d), Kosten teils in 🟣/🌀. LIVE: wt_e7/wt_f5 (Abbau-Gates)
  //    + wt_f9 (Transmuter-Sink). Die übrigen 22 sind sichtbare Roadmap (live:false). ──
  // 🟣 Ehemaliger Ast E („Plasmoid-Technik") — seit 2026-07-29 nach Thema in A–D
  // einsortiert (JP). Die Schlüssel bleiben `wt_e*`, weil sie in Spielerdaten stehen;
  // `ast`/`stufe` je Zeile sagen jetzt, wo die Technik im Baum erscheint.
  { key:'wt_e1',  ast:'b', stufe:7,  name:'Plasmoid-Torpedo',        cc:22000, erz:300, kristall:60,  plasmoid:20, quantum:0, requires:'wt_b3', wirkung:'Schiffs-Angriff +12 % gegen schwere Ziele', art:'wt6_plasmoid_torpedo',  live:true  },
  { key:'wt_e2',  ast:'b', stufe:8,  name:'Resonanz-Geschütz',       cc:26000, erz:360, kristall:90,  plasmoid:30, quantum:0, requires:'wt_b5', wirkung:'Neues Geschütz atk 200 (hebt Cap)',          art:'wt6_resonanz_geschuetz', live:true  },
  { key:'wt_e3',  ast:'b', stufe:6,  name:'Schwarmraketen',          cc:20000, erz:280, kristall:50,  plasmoid:20, quantum:0, requires:'wt_b2', wirkung:'+20 % gegen Schwärme / leichte Gegner',      art:'wt6_schwarmraketen',    live:true  },
  { key:'wt_e4',  ast:'a', stufe:6,  name:'Plasmoid-Triebwerk',      cc:24000, erz:320, kristall:80,  plasmoid:30, quantum:0, requires:'wt_a5', wirkung:'Flugzeit −20 %',                            art:'wt6_plasmoid_triebwerk', live:true  },
  { key:'wt_e5',  ast:'d', stufe:6,  name:'Trägheitsdämpfer',        cc:20000, erz:260, kristall:60,  plasmoid:20, quantum:0, requires:'wt_d2', wirkung:'Verlust-Rückbergung +25 %',                 art:'wt6_traegheitsdaempfer', live:true  },
  // ⚠️ WIRKUNGSTEXT KORRIGIERT 2026-07-29 (JP: „ist das nicht echt unwichtig, weil Sonden
  // so günstig sind... oder ich verstehe es nicht"). Der Text war schlicht FALSCH und
  // verkaufte die Technik viel zu billig: `wrRevealed()` gibt mit wt_e6 für JEDEN
  // Quadranten true zurück — die Technik hebt den Nebel der GANZEN Galaxie dauerhaft,
  // nicht nur die Gegnerstärke eines Planeten. Eine Sonde deckt einen Quadranten pro
  // Flug auf; diese Technik alle, für immer. Der Effekt war immer schon so verdrahtet.
  { key:'wt_e6',  ast:'a', stufe:8,  name:'Deep-Space-Sensorik',     cc:18000, erz:240, kristall:50,  plasmoid:15, quantum:0, requires:'wt_a3', wirkung:'Deckt die GANZE Galaxie auf — kein Sonden-Flug mehr nötig', art:'wt6_deepspace_sensor',  live:true  },
  { key:'wt_e7',  ast:'c', stufe:7,  name:'Plasmoid-Kollektor',      cc:20000, erz:300, kristall:80,  plasmoid:0,  quantum:0, requires:'wt_c4', wirkung:'Schaltet 🟣 Plasmoiden-Abbau frei',        art:'wt6_plasmoid_kollektor', live:true  },
  { key:'wt_e8',  ast:'c', stufe:6,  name:'Wrack-Tiefenscanner',     cc:22000, erz:300, kristall:70,  plasmoid:25, quantum:0, requires:'wt_c2', wirkung:'+30 % Wrack-Ausbeute',                      art:'wt6_wrack_scanner',     live:true  },
  { key:'wt_e9',  ast:'c', stufe:10,  name:'Auto-Ernte-Protokoll',    cc:28000, erz:400, kristall:120, plasmoid:40, quantum:0, requires:'wt_c5', wirkung:'Kolonien ernten selbsttätig',               art:'wt6_auto_ernte',        live:true  },
  { key:'wt_e10', ast:'b', stufe:11, name:'Planetar-Schildgenerator',cc:26000, erz:380, kristall:100, plasmoid:40, quantum:0, requires:'wt_b4', wirkung:'Schaltet Planeten-Geschütze frei',          art:'wt6_planetar_schild',   live:true  },
  { key:'wt_e11', ast:'b', stufe:12, name:'Selbstreparatur-Nanobots',cc:24000, erz:340, kristall:90,  plasmoid:35, quantum:0, requires:'wt_e10',wirkung:'Geschütz-Ausfallzeit −50 %',                art:'wt6_nanobots',          live:true  },
  { key:'wt_e12', ast:'b', stufe:13, name:'Frühwarn-Netz',           cc:22000, erz:300, kristall:80,  plasmoid:30, quantum:0, requires:'wt_e6', wirkung:'Rückfall-Frist +2 Tage + Wellen-Vorwarnung',art:'wt6_fruehwarnnetz',     live:true  },
  { key:'wt_e13', ast:'d', stufe:8, name:'Plasma-Raffinerie',       cc:30000, erz:500, kristall:150, plasmoid:50, quantum:0, requires:'wt_d5', wirkung:'Höchste Raffinerie-Stufe',                   art:'wt6_plasma_raffinerie', live:true  },
  { key:'wt_e14', ast:'a', stufe:7, name:'Orbital-Fabrik',          cc:26000, erz:400, kristall:110, plasmoid:40, quantum:0, requires:'wt_a4', wirkung:'Bauzeit −25 %',                             art:'wt6_orbital_fabrik',    live:true  },
  { key:'wt_e15', ast:'d', stufe:7, name:'Handelskolonie',          cc:28000, erz:420, kristall:120, plasmoid:45, quantum:0, requires:'wt_d4', wirkung:'Kolonien geben zusätzlich CC/Tag',          art:'wt6_handelskolonie',    live:true  },
  // 🌀 Ehemaliger Ast F („Quanten-Technik") — ebenfalls in A–D einsortiert.
  // ⚠️ Anzeigename 2026-07-29 von „Quanten-Lanze" auf „Quanten-Geschütz" geändert (JP).
  // Schlüssel `wt_f1` und Bildname bleiben — beide stecken in Spielerdaten bzw. Assets.
  { key:'wt_f1',  ast:'b', stufe:9,  name:'Quanten-Geschütz',        cc:40000, erz:500, kristall:180, plasmoid:60, quantum:30, requires:'wt_e2', wirkung:'Neues Geschütz atk 320',                    art:'wt7_quanten_lanze',     live:true  },
  { key:'wt_f2',  ast:'b', stufe:10,  name:'Antimaterie-Sprengkopf',  cc:45000, erz:550, kristall:200, plasmoid:70, quantum:40, requires:'wt_f1', wirkung:'Erstschlag −15 % Gegnerstärke',             art:'wt7_antimaterie_kopf',  live:true  },
  { key:'wt_f3',  ast:'a', stufe:9,  name:'Sprungtor-Netzwerk',      cc:38000, erz:480, kristall:160, plasmoid:50, quantum:25, requires:'wt_e4', wirkung:'Multi-Flotten-Strafe +15 → +8 min',         art:'wt7_sprungtor',         live:true  },
  { key:'wt_f4',  ast:'a', stufe:10,  name:'Faltraum-Anker',          cc:42000, erz:520, kristall:180, plasmoid:60, quantum:35, requires:'wt_f3', wirkung:'1×/Tag sofortiger Flotten-Rückruf',         art:'wt7_faltraum_anker',    live:true  },
  { key:'wt_f5',  ast:'c', stufe:8,  name:'Quantenschaum-Extraktor', cc:30000, erz:400, kristall:120, plasmoid:60, quantum:0,  requires:'wt_e7', wirkung:'Schaltet 🌀 Quantenschaum-Abbau frei',      art:'wt7_quantum_extraktor', live:true  },
  { key:'wt_f6',  ast:'c', stufe:9,  name:'Resonanz-Bohrung',        cc:40000, erz:500, kristall:170, plasmoid:50, quantum:40, requires:'wt_f5', wirkung:'Abbau Ring 2/3 +25 %',                      art:'wt7_resonanz_bohrung',  live:true  },
  { key:'wt_f7',  ast:'b', stufe:14,  name:'Quadranten-Kommandostation',cc:48000,erz:600, kristall:220, plasmoid:80, quantum:50, requires:'wt_e10',wirkung:'Schaltet Quadranten-Station frei',          art:'wt7_quadranten_station',live:true  },
  { key:'wt_f8',  ast:'c', stufe:11,  name:'Terraforming-Kern',       cc:44000, erz:560, kristall:200, plasmoid:70, quantum:45, requires:'wt_c5', wirkung:'Kolonie-Ertrag +50 %',                      art:'wt7_terraforming_kern', live:true  },
  { key:'wt_f9',  ast:'d', stufe:9,  name:'Transmuter',              cc:40000, erz:0,   kristall:0,   plasmoid:40, quantum:30, requires:'wt_f5', wirkung:'Wandelt 🟣/🌀 in CC (🟣 60 · 🌀 150 CC)',   art:'wt7_transmuter',        live:true  },
  { key:'wt_f10', ast:'d', stufe:10, name:'Xeno-Diplomatie',         cc:46000, erz:580, kristall:210, plasmoid:75, quantum:50, requires:'wt_f7', wirkung:'Hinterhalt −20 %, gelegentl. Gratis-Rohstoffe',art:'wt7_xeno_diplomatie',  live:true  },
];
const SPACE_TECH_BY_KEY = SPACE_TECH.reduce((m, t) => (m[t.key] = t, m), {});

// Menschenlesbarer Verweis auf eine Forschung: „🌀 Quanten-Technik · Stufe 7".
// ⚠️ In SICHTBAREN Texten nie den nackten Schlüssel zeigen (JP 2026-07-29: „solche wt*-Namen
// kommen noch öfter vor — was fehlt da?"). Es fehlte nichts, der Schlüssel stand absichtlich
// da — er liest sich nur wie ein vergessener Platzhalter. In Kommentaren bleibt er stehen.
function wrTechRef(key) {
  const t = SPACE_TECH_BY_KEY[key];
  if (!t) return '';
  const a = SPACE_TECH_ASTE.find(x => x.key === t.ast);
  return `${a ? a.icon + ' ' + a.name : 'Forschung'} · Stufe ${t.stufe}`;
}
function wrTechName(key) { return (SPACE_TECH_BY_KEY[key] || {}).name || ''; }

function wrTech(m)            { return (m && m.space && m.space.tech) || {}; }
function wrHasTech(m, key)    { return !!wrTech(m)[key]; }
// Spiegel von _space_tech_speed / _space_tech_buildtime (21k).
// Spiegel der _space_tech_*-Helfer inkl. 26e-Effekte (wt_e*/wt_f*).
function wrTechSpeed(m)       { return Math.min(90, (wrHasTech(m,'wt_a3') ? 25 : 0) + (wrHasTech(m,'wt_a5') ? 25 : 0) + (wrHasTech(m,'wt_e4') ? 20 : 0)); }
function wrTechBuildTime(m)   { return (wrHasTech(m,'wt_a4') ? 0.85 : 1.0) * (wrHasTech(m,'wt_e14') ? 0.75 : 1.0); }
// Ast B (+ E2/F1 Geschütz-Tiers, E1/E3 Flotte, F2 Verluste, F10 Hinterhalt).
// ⚠️ Geschütz-Tiers ERSETZEN sich (höchster gewinnt), Flotte/Verluste multiplizieren.
function wrTechTurret(m) { return wrHasTech(m,'wt_f1') ? 2.20 : wrHasTech(m,'wt_e2') ? 1.70 : wrHasTech(m,'wt_b5') ? 1.40 : wrHasTech(m,'wt_b1') ? 1.15 : 1.0; }
function wrTechFleet(m)  { return (wrHasTech(m,'wt_b2') ? 1.10 : 1.0) * (wrHasTech(m,'wt_e1') ? 1.10 : 1.0) * (wrHasTech(m,'wt_e3') ? 1.08 : 1.0); }
function wrTechLoss(m)   { return (wrHasTech(m,'wt_b3') ? 0.85 : 1.0) * (wrHasTech(m,'wt_f2') ? 0.85 : 1.0); }
function wrTechAmbush(m) { return (wrHasTech(m,'wt_b4') ? 0.5  : 1.0) * (wrHasTech(m,'wt_f10') ? 0.8 : 1.0); }
// Ast C (+ F6 Abbau, E9 Kolonie).
function wrTechMine(m)   { return (wrHasTech(m,'wt_c2') ? 1.15 : 1.0) * (wrHasTech(m,'wt_f6') ? 1.25 : 1.0); }
function wrTechRoute(m)  { return wrHasTech(m,'wt_c3') ? 1.25 : 1.0; }
function wrTechFuel(m)   { return wrHasTech(m,'wt_c4') ? 0.5  : 1.0; }
function wrTechColony(m) { return (wrHasTech(m,'wt_c5') ? 1.5 : 1.0) * (wrHasTech(m,'wt_f8') ? 1.5 : 1.0) * (wrHasTech(m,'wt_e9') ? 1.15 : 1.0); }
// Ast D (+ E5 Bergung, E15 Kolonie-CC, E8 Wrack).
function wrTechResCost(m)  { return wrHasTech(m,'wt_d1') ? 0.8  : 1.0; }
function wrTechSalvage(m)  { return (wrHasTech(m,'wt_d2') ? 1.25 : 1.0) * (wrHasTech(m,'wt_e5') ? 1.25 : 1.0); }
function wrTechCapDays(m)  { return wrHasTech(m,'wt_d3') ? 21   : 14; }
function wrTechColonyCc(m) { return (wrHasTech(m,'wt_d4') ? 25 : 0) + (wrHasTech(m,'wt_e15') ? 25 : 0); }
function wrTechWreck(m)    { return (wrHasTech(m,'wt_d5') ? 1.3 : 1.0) * (wrHasTech(m,'wt_e8') ? 1.3 : 1.0); }
// Kaufbar? (Voraussetzung erfüllt, noch nicht besessen, Effekt verdrahtet)
function wrTechState(m, t) {
  if (!t) return 'unknown';
  if (wrHasTech(m, t.key))                        return 'owned';
  if (!t.live)                                    return 'soon';
  if (t.requires && !wrHasTech(m, t.requires))    return 'locked';
  const sp = (m && m.space) || {};
  const affordable = (m.coins || 0) >= t.cc
    && (parseFloat(sp.erz) || 0) >= (t.erz || 0) && (parseFloat(sp.kristall) || 0) >= (t.kristall || 0)
    && (parseFloat(sp.plasmoid) || 0) >= (t.plasmoid || 0) && (parseFloat(sp.quantum) || 0) >= (t.quantum || 0);
  return affordable ? 'buy' : 'poor';
}


// ── Rollen (Spiegel von migration_2026-07-21j_weltraum_rollen.sql) ───────────
// ⚠️ CLIENT-SYNC-PFLICHT: jede Zahl hier steht identisch in _space_ship_role() /
// _space_foe_role() / _space_foe_comp(). Weicht eine ab, zeigt die Kampfvorschau
// etwas anderes an, als der Server abrechnet — in diesem Feature ist genau das
// schon dreimal passiert (doppelte Rundung, Kampfvorschau, Geschützschaden).
//
// Modell (JP 2026-07-21): GRÖSSEN-HIERARCHIE, kein Schere-Stein-Papier.
// Leicht schlägt leicht, schwer schlägt schwer; Bomber/Schlachtschiff/Dunkle
// Röstung sind gegen alles stark — gebremst wird über den Preis, nicht per Konter.
const WR_BONUS = 0.8, WR_MALUS = -0.3;   // Konterhärte "mittel" (JP-Entscheidung)
const SPACE_ROLES = {
  jaeger:          { cls:'light', shield:0.00, vsLight: WR_BONUS, vsHeavy: WR_MALUS, vsStruct:0,   order:10 },
  grossjaeger:     { cls:'light', shield:0.05, vsLight: WR_BONUS, vsHeavy: WR_MALUS, vsStruct:0,   order:15 },
  fregatte:        { cls:'light', shield:0.15, vsLight: WR_BONUS, vsHeavy: WR_MALUS, vsStruct:0,   order:20 },
  sonde:           { cls:'light', shield:0.00, vsLight:0,         vsHeavy:0,         vsStruct:0,   order:30 },
  kutter:          { cls:'light', shield:0.00, vsLight:0,         vsHeavy:0,         vsStruct:0,   order:40 },
  berger:          { cls:'light', shield:0.00, vsLight:0,         vsHeavy:0,         vsStruct:0,   order:50 },
  ernter:          { cls:'light', shield:0.00, vsLight:0,         vsHeavy:0,         vsStruct:0,   order:60 },
  // 🛩️ Träger (26m): schwere Klasse, hoher Schild — er soll die Jäger in seinem Bauch
  // schützen. order 65 = fällt VOR den Kreuzern, aber nach allen leichten Schiffen.
  traeger:         { cls:'heavy', shield:0.30, vsLight: WR_MALUS, vsHeavy:0.3,       vsStruct:0,   order:65 },
  kreuzer:         { cls:'heavy', shield:0.05, vsLight: WR_MALUS, vsHeavy: WR_BONUS, vsStruct:0,   order:70 },
  bomber:          { cls:'heavy', shield:0.10, vsLight: WR_BONUS, vsHeavy: WR_BONUS, vsStruct:1.5, order:80 },
  schlachtschiff:  { cls:'heavy', shield:0.20, vsLight: WR_BONUS, vsHeavy: WR_BONUS, vsStruct:0.8, order:90 },
  dunkle_roestung: { cls:'heavy', shield:0.30, vsLight: WR_BONUS, vsHeavy: WR_BONUS, vsStruct:0.8, order:95 },
  mutterschiff:    { cls:'heavy', shield:0.35, vsLight: WR_BONUS, vsHeavy: WR_BONUS, vsStruct:1.0, order:96 },
  kolonie:         { cls:'light', shield:0.00, vsLight:0,         vsHeavy:0,         vsStruct:0,   order:99 },
};
// ⚠️ HALBE Modifikatoren gegenüber den eigenen Schiffen. Das ist keine Willkür,
// sondern notwendig: wären beide Seiten gleich stark moduliert, KÜRZT SICH DIE
// ROLLE HERAUS. Gemessen (rollen_test.js): 80 Jäger gegen ein Schwarm-Nest ergaben
// 800×1.8 / 600×1.8 = 1.33, zwölf Kreuzer 780×0.7 / 600×0.7 = 1.30 — die
// Flottenwahl war praktisch folgenlos. Halbiert: 1.71 gegenüber 1.07.
// Spielerisch begründet: KI-Verbände sind grob zusammengewürfelt, die eigene
// Flotte ist bewusst spezialisiert.
const WR_FOE_BONUS = 0.4, WR_FOE_MALUS = -0.15;
const SPACE_FOE_ROLES = {
  schwarm:       { cls:'light', shield:0.00, vsLight: WR_FOE_BONUS, vsHeavy: WR_FOE_MALUS, vsStruct:0    },
  drohne:        { cls:'light', shield:0.00, vsLight: WR_FOE_BONUS, vsHeavy: WR_FOE_MALUS, vsStruct:0    },
  pirat:         { cls:'light', shield:0.05, vsLight: WR_FOE_BONUS, vsHeavy: WR_FOE_MALUS, vsStruct:0    },
  waechter:      { cls:'heavy', shield:0.15, vsLight: WR_FOE_MALUS, vsHeavy: WR_FOE_BONUS, vsStruct:0    },
  kreuzer_feind: { cls:'heavy', shield:0.05, vsLight: WR_FOE_MALUS, vsHeavy: WR_FOE_BONUS, vsStruct:0    },
  mutterschiff:  { cls:'heavy', shield:0.20, vsLight: WR_FOE_BONUS, vsHeavy: WR_FOE_BONUS, vsStruct:0.75 },
};
// Sechs Verbandsprofile. Welches ein Planet hat, ist DETERMINISTISCH aus seinen
// Quadranten-Koordinaten abgeleitet — bewusst arithmetisch statt per Hash, damit
// Client und Server ohne md5 dasselbe Ergebnis bekommen (JS hat kein md5 eingebaut).
const SPACE_FOE_PROFILES = [
  { name:'Schwarm-Nest',         comp:{ schwarm:0.70, drohne:0.30 } },
  { name:'Drohnen-Wache',        comp:{ drohne:0.60, waechter:0.40 } },
  { name:'Räuberbande',          comp:{ pirat:0.50, schwarm:0.30, kreuzer_feind:0.20 } },
  { name:'Schwere Wache',        comp:{ waechter:0.60, drohne:0.40 } },
  { name:'Kreuzer-Patrouille',   comp:{ kreuzer_feind:0.60, schwarm:0.40 } },
  { name:'Mutterschiff-Verband', comp:{ mutterschiff:0.50, kreuzer_feind:0.30, drohne:0.20 } },
];
// Doppeltes Modulo: qx/qy sind Hex-Koordinaten und können negativ sein.
function wrFoeProfile(p) {
  const n = ((p && p.qx || 0) * 7 + (p && p.qy || 0) * 13 + (p && p.slot || 0) * 3) % 6;
  return SPACE_FOE_PROFILES[(n + 6) % 6];
}
// Gegner-Zusammensetzung als [{ foe, share, strength }] — Summe = enemy_strength.
function wrFoeComp(p) {
  const prof = wrFoeProfile(p), str = parseFloat(p && p.enemy_strength) || 0;
  return Object.entries(prof.comp).map(([foe, share]) => ({ foe, share, strength: str * share }));
}
function wrFoeShares(p) {
  let light = 0, heavy = 0;
  for (const c of wrFoeComp(p)) {
    const r = SPACE_FOE_ROLES[c.foe];
    if (!r) continue;
    if (r.cls === 'heavy') heavy += c.share; else light += c.share;
  }
  return { light, heavy };
}
// Klassenanteile der eigenen Flotte — nach KAMPFKRAFT gewichtet, nicht nach Stückzahl:
// 40 Sonden neben 3 Schlachtschiffen dürfen die Flotte nicht als "leicht" ausweisen.
function wrFleetShares(fleet) {
  let light = 0, heavy = 0;
  for (const [k, n] of Object.entries(fleet || {})) {
    const s = SPACE_SHIP_BY_KEY[k]; if (!s) continue;
    const p = (parseInt(n, 10) || 0) * (s.atk || 0);
    if ((SPACE_ROLES[k] && SPACE_ROLES[k].cls) === 'heavy') heavy += p; else light += p;
  }
  const tot = Math.max(1, light + heavy);
  return { light: light / tot, heavy: heavy / tot };
}
// Effektive Kampfkraft gegen einen Gegner-Mix. Untergrenze 0.1 — ein Schiff soll
// durch den Malus nie ganz wertlos werden (sonst kippt die Rechnung bei reinen Flotten).
function wrEffPower(fleet, sLight, sHeavy, sStruct) {
  let sum = 0;
  for (const [k, n] of Object.entries(fleet || {})) {
    const s = SPACE_SHIP_BY_KEY[k]; if (!s) continue;
    const r = SPACE_ROLES[k] || { vsLight:0, vsHeavy:0, vsStruct:0 };
    const m = Math.max(0.1, 1 + (sLight || 0) * r.vsLight + (sHeavy || 0) * r.vsHeavy
                              + (sStruct || 0) * r.vsStruct);
    sum += (parseInt(n, 10) || 0) * (s.atk || 0) * m;
  }
  // 🛸 Flaggschiff-Bonus — Spiegel von _space_flagship_bonus (26j). Sitzt bewusst hier,
  // weil _space_eff_power ihn serverseitig ebenfalls einschließt: so stimmen Vorschau
  // (wrBattlePreview) und Abrechnung überein.
  // 🛩️ 26m: der Trägerbonus kommt MULTIPLIKATIV dazu, genau wie in der SQL
  // (`… * _space_flagship_bonus(p_fleet) * _space_carrier_bonus(p_fleet)`).
  // Zusammen also max. 1,30 × 1,15 = +49,5 %.
  return sum * wrFlagshipBonus(fleet) * wrCarrierBonus(fleet);
}
// ⚠️ Spiegel von _space_flagship_bonus/_space_flagship_parts/_space_flagship_cost
// in migration_2026-07-26j_mutterschiff.sql. Bei Balance-Änderungen BEIDE Seiten.
const WR_FLAG_PER = 0.10, WR_FLAG_CAP = 1.30;
const WR_MUTTER_PARTS = [
  { ship:'jaeger',      count:40 },
  { ship:'grossjaeger', count:20 },
  { ship:'fregatte',    count:10 },
  // ⚠️ Key `bomber` = das im Spiel „Kreuzer" genannte Schiff (Namenstausch vom 22.07.)
  { ship:'bomber',      count:1  },
];
const WR_MUTTER_COST = { cc:30000, erz:600, kristall:250, plasmoid:80, quantum:40 };
function wrFlagshipBonus(fleet) {
  const n = parseInt((fleet || {}).mutterschiff, 10) || 0;
  return Math.min(WR_FLAG_CAP, 1 + WR_FLAG_PER * Math.max(0, n));
}
// ── 🟣🌀 Ring-Beute (Spiegel von migration_2026-07-26o) ──────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: claim_space_arrival (Kampfbeute), _space_salvage (Bergung im
// Kampf) und harvest_space (Bergungsroute). Bei Balance-Änderungen BEIDE Seiten.
// JP 2026-07-29: „ab Ring 2 auch Plasmoid ... bei Ring 3 auch Quantenschaum ... Aber so,
// dass man genug bekommen kann!" — bewusst OHNE Abbau-Tech-Gate: es ist Kriegsbeute,
// kein Abbau.
const WR_RING_LOOT = {
  plaRing: 2,             // ab diesem Ring fällt 🟣 an
  quaRing: 3,             // ab diesem Ring zusätzlich 🌀
  plaPerStar: 8,   plaPerFoe: 0.02,   // Kampfbeute: richness × 8 + Wächter × 0,02
  quaPerStar: 4,   quaPerFoe: 0.01,
  salPla: 0.06,    salQua: 0.03,      // Kampfbergung: Anteil der Wrackstärke
  wreckPla: 0.12,  wreckQua: 0.06,    // Bergungsroute: Anteil der Bergungsmenge
};
// Ring-Beute eines gewonnenen Kampfes — Spiegel der beiden IF-Blöcke in
// claim_space_arrival PLUS des Ring-Anteils aus _space_salvage.
function wrRingLoot(ring, richness, foeStrength, bergerFaktor) {
  const R = WR_RING_LOOT;
  const r = parseInt(ring, 10) || 0;
  const st = parseInt(richness, 10) || 0;
  const fo = parseFloat(foeStrength) || 0;
  const f = 0.5 * (parseFloat(bergerFaktor) || 1);   // wie im Kampf: 0,5 × Berger-Bonus
  let pla = 0, qua = 0;
  if (r >= R.plaRing) {
    pla = Math.round(st * R.plaPerStar + fo * R.plaPerFoe) + Math.round(fo * R.salPla * f);
  }
  if (r >= R.quaRing) {
    qua = Math.round(st * R.quaPerStar + fo * R.quaPerFoe) + Math.round(fo * R.salQua * f);
  }
  return { pla, qua };
}

// ── 🛩️ Trägerschiff (Spiegel von migration_2026-07-26m) ─────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: _space_carrier_bonus / _space_carrier_seats / das Ring-Gate in
// start_space_trip. Weicht eine Zahl ab, verspricht der Picker etwas anderes als der
// Server rechnet — oder er lässt einen in den Serverfehler laufen.
const WR_CARRIER_SEATS = 20;    // Jäger je Träger
const WR_CARRIER_PER   = 0.05;  // +5 % Kampfkraft je Träger
const WR_CARRIER_CAP   = 1.15;  // Deckel +15 % (3 Träger)
const WR_CARRIER_RING  = 2;     // ab diesem Ring greift das Gate
function wrCarrierBonus(fleet) {
  const n = parseInt((fleet || {}).traeger, 10) || 0;
  return Math.min(WR_CARRIER_CAP, 1 + WR_CARRIER_PER * Math.max(0, n));
}
// Wie viele Jäger sitzen geschützt an Bord? Nie mehr, als überhaupt mitfliegen.
function wrCarrierSeats(fleet) {
  const j = parseInt((fleet || {}).jaeger,  10) || 0;
  const t = parseInt((fleet || {}).traeger, 10) || 0;
  return Math.min(j, WR_CARRIER_SEATS * Math.max(0, t));
}
// Fehlen dem Verband Träger für seine kleinen Jäger? Liefert die Zahlen, die der Picker
// UND der Fehlertext brauchen. `ring` 0/1 → nie ein Problem.
function wrCarrierGap(fleet, ring) {
  const j = parseInt((fleet || {}).jaeger,  10) || 0;
  const t = parseInt((fleet || {}).traeger, 10) || 0;
  const cap = WR_CARRIER_SEATS * t;
  const need = Math.ceil(j / WR_CARRIER_SEATS);
  return { blocked: (ring || 0) >= WR_CARRIER_RING && j > cap,
           jaeger: j, carrier: t, capacity: cap, need, missing: Math.max(0, need - t) };
}
function wrFleetShield(fleet) {
  let w = 0, sh = 0;
  // 🛩️ 26m: die an Bord genommenen Jäger zählen mit dem Schild des TRÄGERS (0,30)
  // statt mit ihrem eigenen (0,00). Spiegel von _space_fleet_shield: dort wird die
  // Jäger-Zeile um `seats × atk` gekürzt und per UNION ALL mit dem Träger-Schild
  // wieder eingehängt. Das Gesamtgewicht bleibt dadurch identisch.
  const seats  = wrCarrierSeats(fleet);
  const jAtk   = SPACE_SHIP_BY_KEY.jaeger?.atk || 0;
  const tShield = (SPACE_ROLES.traeger && SPACE_ROLES.traeger.shield) || 0;
  for (const [k, n] of Object.entries(fleet || {})) {
    const s = SPACE_SHIP_BY_KEY[k]; if (!s) continue;
    let p = (parseInt(n, 10) || 0) * (s.atk || 0);
    if (k === 'jaeger') p -= seats * jAtk;    // der geschützte Anteil kommt unten dazu
    w += p; sh += p * ((SPACE_ROLES[k] && SPACE_ROLES[k].shield) || 0);
  }
  w += seats * jAtk; sh += seats * jAtk * tShield;
  return Math.min(0.4, w > 0 ? sh / w : 0);
}
// Effektive Gegnerstärke gegen den eigenen Mix — spiegelbildlich.
function wrFoeEff(p, sLight, sHeavy, sStruct) {
  let sum = 0;
  for (const c of wrFoeComp(p)) {
    const r = SPACE_FOE_ROLES[c.foe] || { vsLight:0, vsHeavy:0, vsStruct:0 };
    const m = Math.max(0.1, 1 + (sLight || 0) * r.vsLight + (sHeavy || 0) * r.vsHeavy
                              + (sStruct || 0) * r.vsStruct);
    sum += c.strength * m;
  }
  return sum;
}
// Die EINE Stelle, die einen Planetenkampf vorhersagt. Alles, was der Server in
// claim_space_arrival rechnet, muss hier identisch stehen.
function wrBattlePreview(fleet, p, member) {
  const me = member || _wrMember;
  const f = wrFoeShares(p), m = wrFleetShares(fleet);
  // ⚠️ B2 multipliziert NUR die eigene Seite. Käme der Faktor auch auf `foe`,
  // kürzte er sich vollständig heraus — der Fehler aus den Rollen-Modifikatoren.
  const eff = wrEffPower(fleet, f.light, f.heavy, 0) * wrTechFleet(me);
  const foe = wrFoeEff(p, m.light, m.heavy, 0);
  const shield = wrFleetShield(fleet);
  const loss = Math.min(0.6, foe / Math.max(1, eff + foe)) * (1 - shield) * wrTechLoss(me);
  return { eff, foe, shield, loss, win: eff > foe, comp: wrFoeComp(p), profile: wrFoeProfile(p) };
}


// ── Raumhafen & Geschütze ────────────────────────────────────────────────────
// ⚠️ SPACE_TURRETS/SPACE_PORT spiegeln _space_turret_base()/_space_port_stats() in
//    migration_2026-07-21b_weltraum_geschuetze.sql. Bei Balance-Änderungen BEIDE Seiten.
//
// Jeder Spieler hat einen EIGENEN Raumhafen (JP) — er lebt in members.space.base.
// Der Heimatquadrant 0,0 ist trotzdem für alle derselbe Startpunkt.
const SPACE_PORT = [
  { level: 1, slots: 2, cc: 0,     erz: 0,   kristall: 0  },
  { level: 2, slots: 4, cc: 5000,  erz: 60,  kristall: 0  },
  { level: 3, slots: 6, cc: 15000, erz: 200, kristall: 50 },
];
// ⚠️ Spiegel von _space_turret_base in migration_2026-07-26k. `needs` = Forschung, die
// den Typ freischaltet (26k) — der Neubau ist ohne sie gesperrt, ein BESTEHENDES Geschütz
// bleibt aber nutz- und aufrüstbar. Bei Balance-Änderungen IMMER beide Seiten.
// ⚠️ BILDER (JP 2026-07-29): die Geschütze zeigen die FORSCHUNGS-Renders aus
// `assets/weltraum/`, nicht mehr die `space/turret_*`-Charge. Grund: wir erforschen
// Railgun/Koffein-Laser/Plasma-Kanone/Singularität mit eigenen, sehr unterschiedlichen
// Bildern — die space-Charge vom 21.07. sieht dagegen bei allen vier gleich aus (dieselbe
// braune Standard-Kanone), im Browser wirkte der ganze Ausbau dadurch wie ein Fehler.
// Deshalb trägt jeder Typ jetzt seinen eigenen `folder`; gerendert wird zentral über
// wrTurretImg(), nicht mehr an fünf Stellen mit fest verdrahtetem `assets/space/`.
const SPACE_TURRETS = [
  { key:'railgun',     art:'wt1_railgun',        folder:'weltraum', icon:'🔩', name:'Railgun',       atk:20,  cc:800,   erz:10,  kristall:0,   plasmoid:0,  minPort:1, needs:null,
    desc:'Solides Standardgeschütz — billig und sofort verfügbar' },
  { key:'laser',       art:'wt2_koffein_laser',  folder:'weltraum', icon:'⚡', name:'Laserbatterie', atk:45,  cc:1600,  erz:25,  kristall:0,   plasmoid:0,  minPort:1, needs:'wt_b2',
    desc:'Doppelte Feuerkraft, immer noch ohne Kristall' },
  { key:'plasma',      art:'wt3_plasma_kanone',  folder:'weltraum', icon:'🔥', name:'Plasmawerfer',  atk:85,  cc:3200,  erz:50,  kristall:10,  plasmoid:0,  minPort:2, needs:'wt_b3',
    desc:'Braucht einen ausgebauten Hafen und Koffeinkristall' },
  { key:'singularity', art:'wt5_singularitaet',  folder:'weltraum', icon:'🌀', name:'Singularität',  atk:130, cc:6400,  erz:100, kristall:30,  plasmoid:0,  minPort:3, needs:'wt_b5',
    desc:'Schwere Standardverteidigung — nur am Vollausbau' },
  // NEU (26k): die beiden Geschütze, die der Forschungsbaum längst versprach —
  // wt_e2 „Neues Geschütz atk 200", wt_f1 „Neues Geschütz atk 320".
  { key:'resonanz',     art:'wt6_resonanz_geschuetz', folder:'weltraum', icon:'💜', name:'Resonanz-Geschütz', atk:200, cc:14000, erz:180, kristall:60,  plasmoid:15, minPort:3, needs:'wt_e2',
    desc:'Plasmoid-Resonanz zerreisst Rümpfe auf Distanz — die erste echte Festungswaffe' },
  // ⚠️ UMBENANNT 2026-07-29 (JP): hieß „Quanten-Lanze" und zeigte einen schlanken Speer.
  // „Lanze ist lächerlich in diesem Zusammenhang, sind ja keine Amazonen, die hier
  // kämpfen" — es ist eine Festungswaffe, also ein GESCHÜTZ. Der SCHLÜSSEL bleibt
  // `quantenlanze` (er steckt server- und spielerseitig in `base.turrets`; ein
  // Key-Wechsel hätte bestehende Bauplätze still entwertet — dieselbe Regel wie beim
  // Kreuzer/Bomber-Namenstausch vom 22.07.). Nur der Anzeigename wechselt.
  // Das Bild `wt7_quanten_lanze.png` wird durch ein Geschütz-Render ersetzt
  // (Prompt: plans/PROMPT_quanten_geschuetz.md) — es dient Forschung UND Bauplatz.
  { key:'quantenlanze', art:'wt7_quanten_lanze', folder:'weltraum', icon:'🌠', name:'Quanten-Geschütz',  atk:320, cc:26000, erz:300, kristall:110, plasmoid:40, minPort:3, needs:'wt_f1',
    desc:'Gebündelter Quantenschaum: die stärkste Verteidigung, die gebaut werden kann' },
];
const SPACE_TURRET_BY_KEY = SPACE_TURRETS.reduce((m, t) => (m[t.key] = t, m), {});
// Ordner eines Geschütz-Bildes. Fällt auf 'space' zurück, damit ein neuer Typ ohne
// `folder` nicht ins Leere zeigt.
function wrTurretFolder(t) { return (t && t.folder) || 'space'; }
// ⬆️ Umrüst-Knopf — EIN Bauplan für Hafen und Kolonie (JP-Meldung 2026-07-29:
// „Fehler in der Darstellung", Screenshots in reference/).
// ⚠️ URSACHE des Fehlers, damit er nicht zurückkommt: der Rabatt stand in einem
// `<span class="wr-ok">`. `.wr-ok` ist aber ein BLOCK-Kasten für Statusmeldungen —
// mit Rahmen, 8/10 px Polsterung und `margin-bottom:10px`. In einem `.wr-btn`
// (`display:inline-flex; flex-direction:column; align-items:center`) hat dieser Kasten
// die Zeilen darüber und darunter überlappt: Name durchgestrichen, Preis doppelt.
// MERKE: Meldungs-Klassen (`wr-ok`, `wr-warn`, `wr-bad` als Kasten) NIE in einen Button
// verschachteln — dort gehören reine Inline-Spans hin.
// Jede Angabe steht jetzt in ihrer eigenen Zeile, damit auch lange Namen wie
// „Resonanz-Geschütz" nichts verschieben.
function wrConvBtnHtml(val, attr, ziel, preis, bezahlbar, preisTxt) {
  return `<button class="wr-btn wr-btn-sm wr-btn-conv" ${attr}="${val}" ${bezahlbar ? '' : 'disabled'}>
    <span class="wr-conv-name">⬆️ ${_wrEsc(ziel.name)}</span>
    <span class="wr-conv-line">${preisTxt}</span>
    ${preis.rebate > 0 ? `<span class="wr-conv-save">−${wrFmt(preis.rebate)} CC angerechnet</span>` : ''}
    <span class="wr-conv-line">→ 🛡️ ${wrFmt(preis.atk)} · zurück auf Stufe 1</span>
  </button>`;
}
// Das <img>-Tag eines Geschützes — EINE Stelle für alle fünf Render-Orte (belegter und
// freier Bauplatz, jeweils Hafen und Kolonie, plus Lightbox).
function wrTurretImg(t) {
  if (!t) return '';
  return `<img src="assets/${wrTurretFolder(t)}/${t.art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()">`;
}
// Feuerkraft ×1 / ×1.6 / ×2.4 · Kosten des Ausbauschritts ×1 / ×1 / ×2 (Spiegel der SQL)
const WR_TURRET_ATK_MULT  = [1, 1, 1.6, 2.4];
const WR_TURRET_COST_MULT = [1, 1, 1,   2  ];
const WR_TURRET_MAX = 3;

// ── Werft-Stufen ─────────────────────────────────────────────────────────────
// ⚠️ Spiegel von _space_yard_stats in migration_2026-07-21d_weltraum_werft.sql.
// timeCut/costCut = Anteil, der WEGFÄLLT. Der Kosten-Rabatt ist bewusst kleiner als der
// Zeit-Rabatt: die Werft soll Tempo bringen, nicht die Ökonomie aushebeln.
const SPACE_YARD = [
  { level:1, timeCut:0.00, costCut:0.00, cc:0,     erz:0,   kristall:0,
    desc:'Einfaches Trockendock — baut in Grundgeschwindigkeit.' },
  { level:2, timeCut:0.25, costCut:0.10, cc:4000,  erz:50,  kristall:0,
    desc:'Zweite Helling und Roboterarme: 25 % schneller, 10 % billiger.' },
  { level:3, timeCut:0.45, costCut:0.20, cc:12000, erz:150, kristall:40,
    desc:'Vollautomatische Fertigung: 45 % schneller, 20 % billiger.' },
];

// ── KI-Angriffswellen (P2) ───────────────────────────────────────────────────
// ⚠️ Spiegel von _space_wave_strength/_space_wave_tier in
//    migration_2026-07-21c_weltraum_wellen.sql. Bei Balance-Änderungen BEIDE Seiten.
// Die Welle skaliert mit dem Besitz (JP): wer expandiert, wird interessant.
// 26k: kräftig angehoben, weil die Geschütze mit den neuen Typen bis ~10 000 reichen —
// mit den alten Werten (40/20/35) wäre jede Welle ab Mittelbau bedeutungslos gewesen.
// 15 Planeten + 8 Kolonien: 620 → 1 455.
const WR_WAVE_BASE = 60, WR_WAVE_PER_PLANET = 45, WR_WAVE_PER_COLONY = 90;
// Klassen-Mix der Angriffswellen — Spiegel von _space_wave_shares (21m, TEXT-Fassung).
// Braucht die Wellen-Vorschau, um dieselbe Rollenrechnung wie resolve_space_wave zu machen.
const WR_WAVE_SHARES = {
  schwarm:      { light: 0.85, heavy: 0.15 },
  kreuzer:      { light: 0.40, heavy: 0.60 },
  mutterschiff: { light: 0.20, heavy: 0.80 },
};
const WR_WAVE_TIERS = [
  { key:'mutterschiff', min:900, art:'foe_mutterschiff', icon:'🛰️', name:'Mutterschiff-Angriff' },
  { key:'kreuzer',      min:400, art:'foe_kreuzer_feind', icon:'🚨', name:'Angriffskreuzer' },
  { key:'schwarm',      min:0,   art:'foe_schwarm',       icon:'🦟', name:'Schwarm-Angriff' },
];
function wrWaveStrength(planets, colonies) {
  return Math.round(WR_WAVE_BASE + Math.max(0, planets || 0) * WR_WAVE_PER_PLANET
                                 + Math.max(0, colonies || 0) * WR_WAVE_PER_COLONY);
}
function wrWaveTier(strength) {
  return WR_WAVE_TIERS.find(t => (strength || 0) >= t.min) || WR_WAVE_TIERS[2];
}

// ── Gegner-Portraits (assets/space/foe_*.png) ────────────────────────────────
// Der Wächter eines Planeten bekommt ein Gesicht: Ring 1 die billige Drohne, Ring 2 den
// schweren Wächter, ein befreiter Planet das Wrack. Das ist keine Deko — man sieht auf
// einen Blick, ob dort noch etwas steht und wie schwer es wiegt.
const WR_FOE = {
  drohne:   { art:'foe_drohne',   icon:'🛸', name:'Wächterdrohne' },
  waechter: { art:'foe_waechter', icon:'👾', name:'Schwerer Wächter' },
  pirat:    { art:'foe_pirat',    icon:'🏴‍☠️', name:'Räuber' },
  wrack:    { art:'foe_wrack',    icon:'💀', name:'Wrack' },
  // Seit 21j sind das echte Einheiten im Gegner-Verband, nicht mehr nur Wellen-Deko.
  schwarm:       { art:'foe_schwarm',       icon:'🦟', name:'Schwarm' },
  kreuzer_feind: { art:'foe_kreuzer_feind', icon:'🚨', name:'Angriffskreuzer' },
  mutterschiff:  { art:'foe_mutterschiff',  icon:'🛰️', name:'Mutterschiff' },
};
function wrFoeFor(planet) {
  if (!planet) return WR_FOE.drohne;
  if (planet.cleared_by) return WR_FOE.wrack;
  return (planet.ring >= 2 || planet.enemy_strength >= 150) ? WR_FOE.waechter : WR_FOE.drohne;
}
// Bild mit Emoji-Rückfall (gleiche Mechanik wie überall)
function wrFoeArt(foe, cls) {
  return `<span class="${cls || 'wr-foe'}"><img src="assets/space/${foe.art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"><span class="wr-foe-fb">${foe.icon}</span></span>`;
}

// Hinterhalt-Wahrscheinlichkeit je Ring — Spiegel von claim_space_arrival.
const WR_AMBUSH = { 1: { chance: 0.12, min: 20, max: 60 }, 2: { chance: 0.30, min: 60, max: 160 },
                    3: { chance: 0.45, min: 150, max: 400 } };   // Ring 3 (Spiegel 22g)
// B4 EMP-Espresso halbiert die WAHRSCHEINLICHKEIT (nicht den Schaden) — Spiegel von 21n.
function wrAmbushChance(ring, m) {
  return ((WR_AMBUSH[ring] || {}).chance || 0) * wrTechAmbush(m || _wrMember);
}

const SPACE_INTENTS = {
  scout:    { icon:'🛰️', name:'Aufklären',    hint:'Deckt den Quadranten für den ganzen Klan auf' },
  attack:   { icon:'⚔️', name:'Angreifen',    hint:'Kampf gegen die Wächter — befreit den Planeten dauerhaft' },
  harvest:  { icon:'⛏️', name:'Abbauen',      hint:'Nur auf befreiten Planeten, braucht Röstkometen' },
  colonize: { icon:'🛸', name:'Kolonisieren', hint:'Nur auf befreiten Planeten, verbraucht ein Kolonieschiff' },
};

const SPACE_MIN_PER_RING = 20;  // Minuten je Ring und Strecke — Spiegel von start_space_trip
                                //   (war 6; JP wollte längere Flugzeiten)

// Canvas-Geometrie an EINER Stelle: Zeichnen und Klick-Treffer müssen dieselbe Größe
// benutzen, sonst greift der Klick daneben. Die Maße sind aus dem Hex-Raster hergeleitet
// (nachgerechnet im Test): Breite = 8 × size, Höhe = (4√3 + 2) × size ≈ 8,93 × size.
// Bei size 80 → 640 × 715, gerundet auf 720 Höhe. Mit kleinerem Canvas ragten die
// äußeren Ring-2-Quadranten aus dem Bild.
const WR_HEX_SIZE = 56;   // 80 → 56: Ring 3 muss in den Canvas passen (Zoom gleicht mobil aus)
const WR_CANVAS_W = 640;
const WR_CANVAS_H = 720;

// ── 🔍 Karten-Zoom (JP 2026-07-22: „mobil etwas klein") ─────────────────────
// Zoom + Pan als reine ANZEIGE-Transformation um die Canvas-Mitte:
//   screen = (world − c) · zoom + c + pan
// wrDrawMap zeichnet die ganze Szene innerhalb dieser Transformation; wrCanvasClick
// rechnet Zeigerkoordinaten mit der INVERSEN zurück — Zeichnung und Treffertest
// bleiben damit zwangsläufig deckungsgleich (dieselbe Quelle, wie bei wrPlanetOffset).
// Bedienung: ➕/➖-Buttons, Pinch mit zwei Fingern, Ziehen verschiebt (ab Zoom > 1).
let _wrZoom = 1, _wrPanX = 0, _wrPanY = 0;
function _wrClampPan() {
  // Inhalt nie aus dem Sichtfenster schieben: bei Zoom z ragt (z−1)·Halbkante über.
  const mx = (WR_CANVAS_W * (_wrZoom - 1)) / 2, my = (WR_CANVAS_H * (_wrZoom - 1)) / 2;
  _wrPanX = Math.max(-mx, Math.min(mx, _wrPanX));
  _wrPanY = Math.max(-my, Math.min(my, _wrPanY));
}
function wrSetZoom(z, fx, fy) {
  const old = _wrZoom;
  _wrZoom = Math.max(1, Math.min(3, z));
  if (fx != null && old > 0) {
    // Fixpunkt (Finger/Buttonmitte) beibehalten: Weltpunkt unter (fx,fy) bleibt liegen
    const cx = WR_CANVAS_W / 2, cy = WR_CANVAS_H / 2;
    const wx = (fx - cx - _wrPanX) / old + cx, wy = (fy - cy - _wrPanY) / old + cy;
    _wrPanX = fx - cx - (wx - cx) * _wrZoom;
    _wrPanY = fy - cy - (wy - cy) * _wrZoom;
  }
  if (_wrZoom === 1) { _wrPanX = 0; _wrPanY = 0; }
  _wrClampPan();
  wrDrawMap();
}

// ── Modul-State ──────────────────────────────────────────────────────────────
let _wrEl       = null;
let _wrMember   = null;
let _wrGalaxy   = null;   // { planets:[], revealed:{} }
let _wrSel      = null;   // ausgewählter Planet
let _wrTimer    = null;   // Countdown-Loop
let _wrBusy     = false;  // In-Flight-Guard
let _wrClaiming = false;
let _wrSelFleet = null;   // { shipKey: anzahl } — vom Spieler zusammengestellter Verband
let _wrSelFor   = null;   // Planet/Quadrant, für den _wrSelFleet gilt (Wechsel → neu vorbelegen)
let _wrSelPort  = null;   // Schiffszahl im Hafen beim letzten Abgleich (Übergang leer→voll)
// Höchstzahl gleichzeitiger Verbände — Spiegel von _space_trips()/start_space_trip (26b).
const WR_MAX_TRIPS = 5;
// 📋 Flotten-Vorlage, die auf ihre Anwendung wartet. Eine per Klick geladene Vorlage darf
// von wrSyncFleetSel NICHT sofort wieder mit der Vorbelegung überschrieben werden — und
// der Picker existiert nur, solange ein Ziel gewählt ist. Deshalb parkt die Vorlage hier,
// bis der Picker das nächste Mal rendert (Vorlage laden → Ziel wählen funktioniert damit
// in beliebiger Reihenfolge).
let _wrTplPending = null;
let _wrTplName    = '';   // Eingabefeld „Auswahl merken" (überlebt das Neurendern)
// 🏙️ Welche Kolonie ist im Raumhafen-Tab aufgeklappt? (26l — immer höchstens eine,
// sonst wäre die Liste bei vielen Kolonien genauso lang wie vorher.)
let _wrColOpen    = null;

// Werft-Käufe werden gesammelt und als EINE Chat-Zeile gepostet. Wer zehn Jäger
// hintereinander baut, soll den Chat nicht zehnmal fluten (Muster `_krSession`
// aus dem Kaffee-Krieger).
let _wrWave     = null;   // eigene offene Welle { id, arriveAt, strength, tier, helpOpen }
let _wrAllWaves = [];     // offene Wellen der Gruppe (für Hilferufe)
let _wrHelp     = [];     // eigene/fremde Verstärkungen zu diesen Wellen
let _wrResolving = false;
let _wrWaveTimer = null;
let _wrHelpFleet = null;  // Verband-Auswahl im Hilferuf-Dialog
let _wrCart      = null;  // geplanter Werftauftrag { schiffsTyp: anzahl }
                          // (interner Name/RPC heißen weiter *cart* — im UI heißt es
                          //  ausschließlich „Werftauftrag", JP: „bloß kein Einkaufskorb")
let _wrRouteSel  = null;  // Vorauswahl im Dauerernte-Panel { planetId: anzahl }

let _wrBuySession = null;   // { name, ships:{key:n}, cc:0 }
let _wrBuyTimer   = null;
const WR_BUY_FLUSH_MS = 60000;

// ── State-Helfer (alle optional-chaining-fest) ───────────────────────────────
function wrSpace(m)     { return (m && m.space) || {}; }
function wrErz(m)       { return Math.floor(parseFloat(wrSpace(m).erz) || 0); }
function wrKristall(m)  { return Math.floor(parseFloat(wrSpace(m).kristall) || 0); }
// 🪨 Ring-Rohstoffe (26c): Plasmoiden-Staub (Ring 2) + Quantenschaum (Ring 3).
// SPIEGELT _space_res_ok() (SQL 26c) + die Abbau-Faktoren aus claim_space_arrival.
const WR_RES_META = {
  erz:      { icon: '🪨', name: 'Erz',              art: 'res_erz',      mine: 1,   loot: 45, color: '#c89a5a' },
  // ⚠️ Kristall war #b98fe0 (violett) und lag damit nur 22 Helligkeitsstufen neben dem
  // Plasmoid — auf der Sternkarte praktisch nicht zu unterscheiden (JP 2026-07-29).
  // Jetzt Eisblau, passend zum 💎. Die Legende in weltraum.css (.wr-dot-kri) MUSS mit.
  kristall: { icon: '💎', name: 'Koffeinkristall',  art: 'res_kristall', mine: 0.5, loot: 22, color: '#7fd4ff' },
  plasmoid: { icon: '🟣', name: 'Plasmoiden-Staub', art: 'res_plasmoid', mine: 0.3, loot: 10, color: '#a24bd8' },
  quantum:  { icon: '🌀', name: 'Quantenschaum',    art: 'res_quantum',  mine: 0.2, loot: 5,  color: '#5fe0c0' },
};
function wrResMeta(t)     { return WR_RES_META[t] || WR_RES_META.erz; }
function wrPlasmoid(m)    { return Math.floor(parseFloat(wrSpace(m).plasmoid) || 0); }
function wrQuantum(m)     { return Math.floor(parseFloat(wrSpace(m).quantum) || 0); }
function wrResHave(m, t)  { return t === 'plasmoid' ? wrPlasmoid(m) : t === 'quantum' ? wrQuantum(m) : t === 'kristall' ? wrKristall(m) : wrErz(m); }
// Abbau-Gate: erz/kristall immer, Ring-Rohstoffe nur mit passendem Abbau-Tech (wt_e7/wt_f5).
function wrResMinable(m, t) { return t === 'plasmoid' ? wrHasTech(m, 'wt_e7') : t === 'quantum' ? wrHasTech(m, 'wt_f5') : true; }
function wrHomeShips(m) { return wrSpace(m).fleets?.home?.ships || {}; }
function wrAway(m)      { return wrSpace(m).fleets?.away || null; }
// 🚀 Multi-Flotte (26b): away = { trips: [ {id, ships, …} ] }. Legacy-Einzeltrip
// { trip, ships } wird on the fly zu einem Ein-Element-Array normalisiert; jeder
// Trip bekommt garantiert eine id (für ETA-/Recall-Zuordnung).
function wrTrips(m) {
  const a = wrAway(m);
  if (!a) return [];
  let arr = Array.isArray(a.trips) ? a.trips.slice()
          : (a.trip && typeof a.trip === 'object') ? [{ ...a.trip, ships: a.ships || {} }] : [];
  return arr.filter(t => t && typeof t === 'object')
            .map((t, i) => t.id ? t : { ...t, id: t.startAt || ('t' + i) });
}
function wrTrip(m)      { return wrTrips(m)[0] || null; }   // erster Trip (Legacy-Aufrufer)
// Summe aller unterwegs befindlichen Schiffe über ALLE Trips (Hafen-Übersicht).
function wrAwayShipsAll(m) {
  const agg = {};
  for (const t of wrTrips(m)) for (const [k, n] of Object.entries(t.ships || {})) agg[k] = (agg[k] || 0) + (parseInt(n, 10) || 0);
  return agg;
}
function wrColonies(m)  { return wrSpace(m).colonies || {}; }
// 🛸 ANZEIGE-Flotte des Away-Verbands (JP 2026-07-22, #36): Bei einer Kolonie-
// Mission auf dem RÜCKFLUG das Kolonieschiff nicht mehr mitzeigen — es bleibt am
// Ziel, aber die Buchhaltung läuft erst beim Rückkehr-Claim. Ohne diesen Filter
// sah es aus, als käme das Kolonieschiff zurück. Reine Anzeige, keine Logik.
function wrTripShipsDisplay(trip) {
  const ships = trip?.ships || {};
  if (!trip || trip.intent !== 'colonize') return ships;
  if (Date.now() < Date.parse(trip.arriveAt)) return ships;   // Hinflug: noch an Bord
  const n = parseInt(ships.kolonie, 10) || 0;
  if (n < 1) return ships;
  return { ...ships, kolonie: n - 1 };
}
// Wie viele Schiffe eines Typs sind auf Dauerernte-/Bergungs-Routen gebunden?
// (JP 2026-07-22: die „Röstkometen im Verband"-Warnung war unverständlich, wenn
// alle Ernter auf Routen standen — jetzt sagt sie, WO die Schiffe stecken.)
function wrRouteBound(m, shipKey) {
  let n = 0;
  for (const r of Object.values(wrSpace(m).routes || {})) {
    if (r && r.ship === shipKey) n += parseInt(r.count, 10) || 0;
  }
  return n;
}
function wrResearch(m)  { return (m && m.research) || {}; }

// Antriebs-Forschung verkürzt Reisen — in P1 gibt es noch keine (Warp = P2/P3).
// Nur noch fuer die ANZEIGE der Flugzeit. Der Server ignoriert den mitgeschickten
// Wert seit 21l und rechnet selbst aus space.tech — sonst koennte der Client sich
// beliebig schnell machen (dieselbe Lehre wie bei den Schiffspreisen).
function wrSpeedPct(m) { return wrTechSpeed(m || _wrMember); }

// Flugzeit-Anzeige inkl. Technik-Ersparnis (JP 2026-07-22: die Verkürzung durch die
// Weiterentwicklungen soll DIREKT am Ziel sichtbar sein, nicht erst beim beauftragten
// Flug). Reine Anzeige — abgerechnet wird serverseitig aus space.tech (21l).
function wrTravelHtml(baseMin) {
  const sp = Math.round(wrSpeedPct(_wrMember) || 0);
  if (sp <= 0) return `<strong>${baseMin} Min</strong>`;
  const eff = Math.max(1, Math.round(baseMin * (100 - sp) / 100));
  return `<strong>${eff} Min</strong> <span class="wr-good">(−${sp} % Technik, statt ${baseMin})</span>`;
}

function wrShipCount(m, key) { return parseInt(wrHomeShips(m)[key], 10) || 0; }
function wrFleetPower(fleet) {
  let p = 0;
  for (const [k, n] of Object.entries(fleet || {})) p += (SPACE_SHIP_BY_KEY[k]?.atk || 0) * (parseInt(n, 10) || 0);
  return p;
}
function wrFleetMine(fleet) {
  let p = 0;
  for (const [k, n] of Object.entries(fleet || {})) p += (SPACE_SHIP_BY_KEY[k]?.mine || 0) * (parseInt(n, 10) || 0);
  return p;
}
// 📋 Verlust-Aufschlüsselung je Typ (JP 2026-07-22: „WELCHE hat man verloren?").
// r.lost = { jaeger: 5, fregatte: 2, … } aus claim_space_arrival/resolve_space_wave (22j).
function wrLossBreakdown(lost) {
  const parts = Object.entries(lost || {})
    .filter(([, n]) => (parseInt(n, 10) || 0) > 0)
    .map(([k, n]) => `${n}× ${SPACE_SHIP_BY_KEY[k]?.name || k}`);
  return parts.length ? ` — ${parts.join(' · ')}` : '';
}

// 💎 Treibstoff je Reise (JP 2026-07-22): schwere/Nutz-Schiffe × (Ring − 1) Kristall —
// Spiegel von start_space_trip (22h). DOPPELT deadlock-sicher: Ring 1 ist frei UND
// Sonde/Jäger/Kutter fliegen immer treibstofffrei (JP: „sonst könnte man anfangs
// gar nicht fliegen" — Kristall gibt es nur im All).
const WR_FUEL_FREE = { sonde: true, jaeger: true, kutter: true };
function wrTripFuel(fleet, ring) {
  let tot = 0;
  for (const [k, n] of Object.entries(fleet || {})) {
    if (WR_FUEL_FREE[k]) continue;
    tot += parseInt(n, 10) || 0;
  }
  return tot * Math.max(0, (parseInt(ring, 10) || 0) - 1);
}
function _wrEsc(s) { return (typeof _esc === 'function') ? _esc(s) : String(s == null ? '' : s); }
function wrFmt(n) { return Math.round(n || 0).toLocaleString('de-DE'); }
// Minutenangabe menschenlesbar (Bauzeiten/Flugzeiten)
function wrDur(min) {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return m + ' Min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} Std ${r} Min` : `${h} Std`;
}
// Zeitpunkt in der Zukunft benennen („Fr, 01.08., 14:10"). Eine reine Restdauer reicht
// bei mehrtägigen Läufen nicht — JP wollte wissen, WANN etwas fertig ist, nicht nur „in
// 3,3 Tagen". Über ~6 Tage hinaus verliert der Wochentag seinen Nutzen, dann nur Datum.
function wrWhen(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  const weit = (ts - Date.now()) > 6 * 86400000;
  try {
    return d.toLocaleString('de-DE', weit
      ? { day: '2-digit', month: '2-digit', year: '2-digit' }
      : { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return d.toLocaleString(); }
}
// Tageszahl menschenlesbar: „3,3 Tage" / „18 Std" / „40 Min".
function wrDays(days) {
  const d = Math.max(0, days || 0);
  if (d >= 1) return `${d.toFixed(1).replace('.', ',')} Tage`;
  const h = d * 24;
  return h >= 1 ? `${Math.round(h)} Std` : `${Math.max(1, Math.round(h * 60))} Min`;
}

// ── Bild-Cache für den Canvas ────────────────────────────────────────────────
// Im HTML genügt `<img onerror>` als Emoji-Rückfall — auf dem Canvas geht das nicht,
// dort brauchen wir das geladene Element. Fehlt eine Datei, bleibt der Eintrag `false`
// und der Aufrufer zeichnet das Emoji. Nach dem Laden EINMAL neu zeichnen.
const _wrImgCache = {};
function wrImg(name) {
  const hit = _wrImgCache[name];
  if (hit !== undefined) return (hit && hit.complete && hit.naturalWidth > 0) ? hit : null;
  const img = new Image();
  _wrImgCache[name] = img;
  img.onload  = () => { try { wrDrawMap(); } catch (e) {} };
  img.onerror = () => { _wrImgCache[name] = false; };
  img.src = 'assets/space/' + name + '.png';
  return null;
}
// Bild zentriert auf (x,y) in eine Box der Kantenlänge `box` einpassen.
function wrDrawImg(ctx, name, x, y, box) {
  const img = wrImg(name);
  if (!img) return false;
  const sc = box / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  return true;
}

// ── Eigenschafts-Icons ───────────────────────────────────────────────────────
// Flache Bernstein-Symbole (assets/space/ic_*.png) statt Emoji. Emoji sehen auf jedem
// Gerät anders aus und passen nicht zu den Renders — genau JPs Kritik am 🔫-Jäger.
// Rückfall wie überall: schlägt das Bild fehl, entfernt sich das <img> und der
// CSS-Nachbarselektor gibt das Emoji frei.
// Charge I (2026-07-21) vervollständigt den Satz: die 8 Kennzahlen des 🚀-Tabs, die
// bisher noch als Emoji standen. Der Wert ist immer der Emoji-RÜCKFALL, nie der
// Anzeigewert — schlägt das PNG fehl, greift der CSS-Nachbarselektor.
// ⚠️ Nur an Kennzahl-Stellen einsetzen. In Chat-Meldungen und Toasts bleiben Emoji:
// dort wird kein HTML gerendert (dafür gäbe es die [[s:key]]-Token).
const WR_IC = { atk:'⚔️', def:'🛡️', mine:'🔨', time:'⏱️', erz:'🪨', kri:'💎',
  pla:'🟣', qua:'🌀',
  fleet:'✈️', travel:'✈️', colony:'🪐', yard:'🏗️', salvage:'♻️', wreck:'💀',
  help:'🤝', yield:'📥', port:'🛰️' };
// Beliebiges Asset in Icon-Größe — für Dinge, die kein ic_*-Symbol haben, aber ein
// Portrait (Raumhafen, Werft). Gleiche Hülle wie wrIc, damit das CSS greift.
// ⚠️ NUR für flache Grafiken verwenden. Ein detailliertes 3D-Render (base_*, ship_*)
// wird bei ~16 px zu Matsch — genau deshalb ist „Im Hafen" wieder auf das flache
// wrIc('fleet') umgestellt worden (JP: „im Hafen — kann man nicht erkennen").
// Dieselbe Regel galt schon beim Rendern der Icon-Chargen: Schiffe = Render,
// Eigenschafts-Icons = flach und einfarbig.
// Fliesstext mit Rohstoff-Symbolen: escapen und die vier Rohstoff-Emojis durch die
// echten Icons ersetzen. ⚠️ REIHENFOLGE: erst _wrEsc, dann ersetzen — andersherum
// wuerde die eingefuegte Bild-Huelle selbst escaped und als Text sichtbar.
// Nur fuer HTML-Kontexte verwenden; Toasts und Lightbox-Stats bleiben reiner Text.
function wrIcText(str) {
  return _wrEsc(str)
    .split('🪨').join(wrIc('erz'))
    .split('💎').join(wrIc('kri'))
    .split('🟣').join(wrIc('pla'))
    .split('🌀').join(wrIc('qua'));
}

function wrIcArt(art, fb) {
  return `<span class="wr-ic"><img src="assets/space/${art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"><span class="wr-ic-fb">${fb || '•'}</span></span>`;
}
function wrIc(key) {
  // JP 2026-07-22: an den Kennzahlen wieder ERKENNBARE Symbole statt der flachen
  // gelben Icons — ⚔️ Kampfkraft, 🔨 Abbau, ⏱️ Bauzeit/Zeit als REINER TEXT
  // (bewusst OHNE <span>-Hülle: die Lektion der „leeren Kreise" — Element-Selektoren
  // wie `.wr-lb-stats span` stylen jede Icon-Hülle mit, reiner Text bleibt verschont,
  // genau wie die schon immer funktionierenden 💰🔷🛡️).
  if (key === 'atk')  return '⚔️';
  if (key === 'mine') return '🔨';
  if (key === 'time') return '⏱️';
  // Erz/Kristall zeigen die ECHTEN Rohstoff-Bilder, 'yard' das Werft-I-Portrait
  // (statt Baukran), 'port' den Raumhafen (für „Im Hafen") — alles JP 2026-07-22.
  const art = key === 'erz'  ? 'res_erz'
            : key === 'kri'  ? 'res_kristall'
            : key === 'pla'  ? 'res_plasmoid'      // Ring-2-Rohstoff (JP 2026-07-27)
            : key === 'qua'  ? 'res_quantum'       // Ring-3-Rohstoff
            // JP 2026-07-29: `base_werft` (das stufenneutrale Blatt) statt `base_werft_1`.
            // Inhaltlich identisch (byte-gleich), aber richtig: ein allgemeines Icon soll
            // nicht die Stufe-1-Variante sein — die Stufenbilder base_werft_1..3 gehören
            // ins Werft-Panel und in die Lightbox, wo die Stufe auch gemeint ist.
            : key === 'yard' ? 'base_werft'
            : key === 'port' ? 'base_1'
            // JP 2026-07-29: „Flotte" zeigt ic_travel statt ic_fleet — das flache
            // Reise-Symbol ist bei 16 px besser erkennbar. (Zwischenstand war kurz das
            // Große-Jäger-Render; verworfen, weil ein 3D-Render in Icon-Größe matscht —
            // genau die Regel, die oben an wrIcArt steht.)
            : key === 'fleet' ? 'ic_travel'
            : 'ic_' + key;
  const fb = WR_IC[key] || '•';
  // ⚠️ Der Emoji-Rückfall hängt NICHT mehr am CSS-Nachbarselektor `img + .wr-ic-fb`.
  // Grund (JP-Meldung 2026-07-21): der versteckt das Emoji, sobald ein <img> im DOM
  // steht — auch wenn das Bild nie geladen hat. Feuert `onerror` nicht (404 aus dem
  // Cache, abgebrochener Ladevorgang, fehlendes Asset auf dem Server), blieb ein
  // leeres Bild-Kästchen stehen UND das Emoji unsichtbar: „leere Kreise".
  // Jetzt umgekehrt: erst ein ERFOLGREICH geladenes Bild blendet das Emoji aus.
  // Merke: einen Rückfall nie an die ANWESENHEIT des Elements knüpfen, sondern an
  // seinen Erfolg.
  return `<span class="wr-ic"><img src="assets/space/${art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"><span class="wr-ic-fb">${fb}</span></span>`;
}

// ── Chat ─────────────────────────────────────────────────────────────────────
// Alle anderen Module posten ihre Ereignisse in den Gruppen-Chat (world.js, krieger,
// cafe, kaffeemobil …) — der Weltraum tat es bisher nicht. Immer in try/catch:
// ein fehlgeschlagener Post darf die Aktion nie blockieren (CLAUDE.md Regel 3).
// Jede Weltraum-Meldung trägt den unsichtbaren Marker `[[wr]]` am Anfang —
// _chatArt (app.js) entfernt ihn beim Rendern. Er macht die Meldungen VERLÄSSLICH
// filterbar (JP 2026-07-22: Ereignis-Protokoll im 🚀-Tab; vorher wären sie nur am
// Emoji erkennbar gewesen). Das 📜-Protokoll zeigt alles ab Einführung des Markers.
const WR_CHAT_MARK = '[[wr]]';
function wrChat(msg, author) {
  try {
    if (typeof DB === 'undefined' || !DB.postMessage) return;
    DB.postMessage(WR_CHAT_MARK + msg, author || _wrMember?.name || 'Weltraum').catch(() => {});
  } catch (e) { /* non-critical */ }
}

// Schiffs-Portrait als kleines Bild mit Emoji-Rückfall. Überall dort einsetzen, wo bisher
// nur `s.icon` stand — die Emoji sind teils irreführend (🔫 ist eine Wasserpistole).
function wrShipArt(key, cls) {
  const s = SPACE_SHIP_BY_KEY[key];
  if (!s) return '<span class="' + (cls || 'wr-mini') + '">•</span>';
  return `<span class="${cls || 'wr-mini'}"><img src="assets/space/${s.art}.png" alt=""
    onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"><span class="wr-mini-fb">${s.icon}</span></span>`;
}

// Bild-Token für den Chat. `app.js: _chatArt()` ersetzt `[[s:jaeger]]` nach dem Escapen
// durch das echte 18px-Render aus assets/space/ (Emoji nur noch als Rückfall).
function wrArtTok(key) { return '[[s:' + key + ']]'; }

// Werft-Käufe sammeln statt einzeln posten (sonst 10 Zeilen für 10 Jäger).
function wrBuyTrack(ship) {
  const name = _wrMember?.name || 'Jemand';
  if (!_wrBuySession || _wrBuySession.name !== name) _wrBuySession = { name, ships: {}, cc: 0 };
  _wrBuySession.ships[ship.key] = (_wrBuySession.ships[ship.key] || 0) + 1;
  _wrBuySession.cc += ship.cc;
  if (_wrBuyTimer) clearTimeout(_wrBuyTimer);
  _wrBuyTimer = setTimeout(() => { try { wrBuyFlush(); } catch (e) {} }, WR_BUY_FLUSH_MS);
}
function wrBuyFlush() {
  const s = _wrBuySession;
  _wrBuySession = null;
  if (_wrBuyTimer) { clearTimeout(_wrBuyTimer); _wrBuyTimer = null; }
  if (!s) return;
  const parts = Object.entries(s.ships)
    .map(([k, n]) => `${wrArtTok(k)} ${n}× ${SPACE_SHIP_BY_KEY[k]?.name || k}`);
  if (!parts.length) return;
  // Kosten inkl. Rohstoffe — die ECHTE Server-Abbuchung (wrBuildCart überschreibt
  // s.cc/erz/kri mit res.*), nicht die unrabattierten Basispreise (JP 2026-07-23).
  const cost = [`${wrFmt(s.cc)} CC`]
    .concat(s.erz ? [`${wrFmt(s.erz)} 🪨`] : [])
    .concat(s.kri ? [`${wrFmt(s.kri)} 💎`] : []).join(' · ');
  wrChat(`🏗️ ${_wrEsc(s.name)} hat in der Werft gebaut: ${parts.join(' · ')} (${cost}).`, s.name);
}

// ── Quadranten / Hex-Geometrie ───────────────────────────────────────────────
function wrQKey(qx, qy) { return qx + ',' + qy; }
function wrRing(qx, qy) { return (Math.abs(qx) + Math.abs(qy) + Math.abs(qx + qy)) / 2; }
function wrAllQuadrants() {
  const out = [];
  for (let qx = -3; qx <= 3; qx++) for (let qy = -3; qy <= 3; qy++) {
    const r = wrRing(qx, qy);
    if (r <= 3) out.push({ qx, qy, ring: r, key: wrQKey(qx, qy) });   // Ring 3: JP 2026-07-22
  }
  return out;
}
// Pixel-Mitte einer Wabe (flat-top), relativ zur Canvas-Mitte
function wrHexCenter(qx, qy, size) {
  return { x: size * 1.5 * qx, y: size * Math.sqrt(3) * (qy + qx / 2) };
}
// Der Heimatquadrant ist immer bekannt (dort steht der Raumhafen).
// E6 Deep-Space-Sensorik (26g): der Besitzer sieht die ganze Karte ohne Aufklärung
// (persönlich — der Klan-Reveal via Sonde bleibt davon unberührt).
function wrRevealed(qkey) { return qkey === '0,0' || !!(_wrGalaxy?.revealed || {})[qkey] || wrHasTech(_wrMember, 'wt_e6'); }
// F3 Sprungtor-Netzwerk: Multi-Flotten-Strafe je bereits unterwegs befindlicher Flotte.
function wrFleetGap(m) { return wrHasTech(m, 'wt_f3') ? 8 : 15; }

// Ring-2-Quadranten lassen sich erst aufklären, wenn ein benachbarter Ring-1-Quadrant
// bekannt ist — sonst könnte man den ganzen Nebel in beliebiger Reihenfolge abräumen.
function wrScoutable(q) {
  if (wrRevealed(q.key)) return false;
  if (q.ring === 1) return true;
  const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  return dirs.some(([dx, dy]) => {
    const nx = q.qx + dx, ny = q.qy + dy;
    return wrRing(nx, ny) < q.ring && wrRevealed(wrQKey(nx, ny));
  });
}

function wrPlanetsOf(qkey) { return (_wrGalaxy?.planets || []).filter(p => p.quadrant === qkey); }

// ── Zeitformat ───────────────────────────────────────────────────────────────
function wrCountdown(ms) {
  if (ms <= 0) return 'jetzt';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return min + ' Min';
  const h = Math.floor(min / 60), rm = min % 60;
  return rm ? `${h} Std ${rm} Min` : `${h} Std`;
}

// ── Laden ────────────────────────────────────────────────────────────────────
async function wrEnsureGalaxy(force) {
  if (_wrGalaxy && !force) return _wrGalaxy;
  try {
    const ens = await DB.ensureGalaxy();
    if (ens && ens.error) { _wrGalaxy = { planets: [], revealed: {}, error: ens.error }; return _wrGalaxy; }
    await wrSweepReconquest();      // 26h: VOR dem Laden — sonst zeigt die Karte Planeten,
                                    // die der Server im selben Atemzug zurückgibt
    _wrGalaxy = await DB.fetchGalaxy();
    wrClearLayoutCache();     // Anordnung haengt an den Planeten-IDs
  } catch (e) {
    _wrGalaxy = { planets: [], revealed: {}, error: e.message };
  }
  return _wrGalaxy;
}

// 🛡️ Feature ④ (26h): Rückeroberung ungeschützter Planeten. Lazy und zeitbasiert
// (kein Cron, Projekt-Philosophie) — wer den Tab öffnet, löst den Sweep für die
// GANZE Gruppe aus. Gedrosselt auf 1×/5 Min je Sitzung, damit ein Poll-Sturm nicht
// bei jedem Neuzeichnen eine RPC feuert. Fehler bleiben still (CLAUDE.md Regel 3).
let _wrSweepTs = 0;
async function wrSweepReconquest() {
  if (Date.now() - _wrSweepTs < 5 * 60 * 1000) return;
  _wrSweepTs = Date.now();
  try {
    const res = await DB.sweepSpaceReconquest();
    if (!res || res.error || !Array.isArray(res.lost) || !res.lost.length) return;
    for (const p of res.lost) {
      const mine = p.memberId === _wrMember?.id;
      if (mine) {
        wrToast(`🪐 ${p.name} wurde von Feinden zurückerobert — der Planet war ungeschützt.`, 'error');
      }
      // Die Meldung geht an den ganzen Clan: ein verlorener Planet im Quadranten
      // betrifft auch die Nachbarn (Wächter stehen wieder im Weg).
      try {
        wrChat(`🪐 <strong>${_wrEsc(p.name)}</strong> (${_wrEsc(p.quadrant)}, Ring ${p.ring}) `
             + `wurde von Feinden zurückerobert — ungeschützt zu lange sich selbst überlassen. `
             + `Wächter jetzt ⚔️ ${wrFmt(p.enemy)}.`);
      } catch (e) {}
    }
  } catch (e) { /* der Sweep darf das Laden des Tabs nie blockieren */ }
}

// ── Haupt-Renderer ───────────────────────────────────────────────────────────
async function _buildWeltraum(member, el) {
  _wrEl = el;
  _wrMember = member || (typeof currentUserData !== 'undefined' ? currentUserData : null);
  el.innerHTML = '<p style="color:var(--muted);padding:16px">🌌 Sternkarte wird geladen …</p>';

  await wrEnsureGalaxy(true);

  if (_wrGalaxy.error) {
    el.innerHTML = `<div class="wr-wrap"><div class="wr-empty">
      🚀 <strong>Der Weltraum ist noch nicht bereit.</strong><br>
      Die Datenbank-Migration <code>migration_2026-07-21_weltraum_p1.sql</code> fehlt noch.<br>
      <span style="color:var(--muted);font-size:.8rem">(${_wrEsc(_wrGalaxy.error)})</span>
    </div></div>`;
    return;
  }

  // Erste Rückkehr direkt einlösen, falls die Flotte während der Abwesenheit gelandet ist
  await wrTryClaim(true);
  await wrClaimBuild(true);
  await wrAutoHarvest();
  await wrAutoRefineClaim();
  await wrLoadWaves(true);
  wrRender();
  wrStartLoop();
}

// 📥 Auto-Ernte beim Öffnen des 🚀-Tabs (JP 2026-07-22: „warum wird es nicht
// automatisch gemacht?"). Kolonien- und Routen-Ertrag werden claim-on-action
// eingesammelt (Projekt-Philosophie: kein Cron) — bisher aber nur per Button.
// Jetzt zusätzlich still beim Tab-Öffnen, gedrosselt auf 1×/10 Min; Toast nur,
// wenn tatsächlich etwas hereinkam. Der Button bleibt für Zwischendurch.
let _wrAutoHarvestTs = 0;
async function wrAutoHarvest() {
  if (Date.now() - _wrAutoHarvestTs < 10 * 60 * 1000) return;
  _wrAutoHarvestTs = Date.now();
  try {
    const res = await DB.harvestSpace(_wrMember.id);
    if (!res || res.error) return;                 // still — Fehler zeigt der manuelle Weg
    if (res.space) wrApplySpace(res.space);
    const parts = [];
    if (res.erz > 0)      parts.push(`${wrFmt(res.erz)} 🪨`);
    if (res.kristall > 0) parts.push(`${wrFmt(res.kristall)} 💎`);
    if (parts.length) wrToast(`📥 Automatisch eingesammelt: ${parts.join(' · ')}`, 'success');
    if (res.paused > 0) wrToast(`⚠️ ${wrFmt(res.paused)} Route(n) pausieren — der Kristall reicht nicht als Treibstoff.`, 'error');
  } catch (e) { /* Auto-Ernte darf das Laden des Tabs nie blockieren */ }
}

// ── Angriffswellen laden ────────────────────────────────────────────────────
// `schedule` nur beim Tab-Öffnen: die Planung ist zeitbasiert und lazy (kein Cron),
// muss aber nicht bei jedem Poll erneut angefragt werden.
// Der Layout-Cache haengt an den Planeten-IDs — beim Neuladen der Galaxie verwerfen,
// sonst behielte eine aufgestockte Wabe ihre alte Anordnung.
function wrClearLayoutCache() { for (const k of Object.keys(_wrLayoutCache)) delete _wrLayoutCache[k]; }

async function wrLoadWaves(schedule) {
  const m = _wrMember;
  if (!m?.id) return;
  try {
    if (schedule) {
      const r = await DB.ensureSpaceWave(m.id);
      if (r && r.wave) _wrWave = r.wave;
    }
    const waves = await DB.fetchSpaceWaves();
    _wrAllWaves = waves || [];
    const own = _wrAllWaves.find(w => w.member_id === m.id);
    _wrWave = own ? { id: own.id, arriveAt: own.arrive_at, strength: own.strength,
                      tier: own.tier, helpOpen: own.help_open } : null;
    _wrHelp = await DB.fetchSpaceHelp(_wrAllWaves.map(w => w.id));
  } catch (e) { console.warn('wrLoadWaves:', e.message); }
}

// ── Untertabs (JP 2026-07-22: „nicht ewig weit hinunterscrollen") ───────────
// Rohstoffleiste + Tabs bleiben oben stehen; darunter wird nur EIN Bereich gezeigt.
// Wellen, Hilferufe und die laufende Reise stehen BEWUSST über den Tabs: sie sind
// zeitkritisch und dürfen nicht hinter einem Tab verschwinden.
let _wrTab = 'karte';
const WR_TABS = [
  { key:'karte', icon:'🌌', name:'Karte' },
  // 🛩️ Flotten (JP 2026-07-29): Verbände, Dauerernte und Bergung lagen vorher verstreut —
  // die Reise-Karten über ALLEN Tabs, die Routen im Raumhafen. Jetzt an einem Ort.
  { key:'flotten', icon:'🛩️', name:'Flotten' },
  { key:'hafen', icon:'🛰️', name:'Raumhafen' },
  { key:'werft', icon:'🏗️', name:'Werft' },
  { key:'tech',  icon:'🔬', name:'Forschung' },
  { key:'handel', icon:'🤝', name:'Handel' },
  { key:'log',   icon:'📜', name:'Protokoll' },
];
function wrTabsHtml() {
  return `<div class="wr-tabs">${WR_TABS.map(t =>
    `<button class="wr-tab${_wrTab === t.key ? ' active' : ''}" data-wr-tab="${t.key}"
      >${t.icon} <span class="wr-tab-l">${t.name}</span></button>`).join('')}</div>`;
}
function wrSetTab(key) {
  if (!WR_TABS.some(t => t.key === key) || _wrTab === key) return;
  _wrTab = key;
  wrRender();
}

function wrRender() {
  if (!_wrEl) return;
  const m = _wrMember;
  const trips = wrTrips(m);

  _wrEl.innerHTML = `
    <div class="wr-wrap">
      <div class="wr-sticky">
        ${wrHudHtml(m)}
        ${wrTabsHtml()}
      </div>
      ${wrWaveHtml(m)}
      ${wrHelpCallsHtml(m)}
      ${wrTripStripHtml(m, trips)}
      <div class="wr-map-card"${_wrTab === 'karte' ? '' : ' hidden'}>
        <div class="wr-card-title">🌌 Sternkarte <span class="wr-sub">— geteilt mit deinem Kaffee-Clan</span></div>
        <div class="wr-canvas-wrap">
          <canvas id="wr-canvas" class="wr-canvas" width="${WR_CANVAS_W}" height="${WR_CANVAS_H}"></canvas>
          <div class="wr-zoom">
            <button type="button" class="wr-zoom-btn" data-wr-zoom="in" title="Vergrößern">➕</button>
            <button type="button" class="wr-zoom-btn" data-wr-zoom="out" title="Verkleinern">➖</button>
          </div>
        </div>
        <div class="wr-legend">
          <span><i class="wr-dot wr-dot-home"></i> Raumhafen</span>
          <span><i class="wr-dot wr-dot-fog"></i> Nebel</span>
          <span><i class="wr-dot wr-dot-erz"></i> 🪨 Erz</span>
          <span><i class="wr-dot wr-dot-kri"></i> 💎 Kristall</span>
          <span><i class="wr-dot wr-dot-pla"></i> 🟣 Plasmoid</span>
          <span><i class="wr-dot wr-dot-qua"></i> 🌀 Quantenschaum</span>
          <span><i class="wr-dot wr-dot-clear"></i> befreit</span>
          <span><i class="wr-dot wr-dot-colony"></i> Kolonie (Spielerfarbe · Ringe = Stufe)</span>
          <span>🛡️ Geschütze · 📡 Station</span>
          <span><i class="wr-dot wr-dot-risk"></i> ungeschützt — Rückfall droht</span>
        </div>
      </div>
      <div id="wr-detail"${_wrTab === 'karte' ? '' : ' hidden'}>${wrDetailHtml(m)}</div>
      <div${_wrTab === 'flotten' ? '' : ' hidden'}>${wrFlottenHtml(m, trips)}</div>
      <div${_wrTab === 'hafen' ? '' : ' hidden'}>
        ${wrHafenHtml(m)}
        ${WR_RES_NOTE}
        ${wrRaffinerieHtml(m)}
        ${wrColoniesHtml(m)}
      </div>
      <div${_wrTab === 'werft' ? '' : ' hidden'}>${wrWerftHtml(m)}</div>
      <div${_wrTab === 'tech'  ? '' : ' hidden'}>${wrTechHtml(m)}</div>
      <div id="wr-handel"${_wrTab === 'handel' ? '' : ' hidden'}></div>
      <div id="wr-log"${_wrTab === 'log' ? '' : ' hidden'}></div>
    </div>`;

  if (_wrTab === 'log')    wrLoadProtokoll();
  if (_wrTab === 'handel') wrLoadHandel();

  // Der Canvas wird nur gezeichnet, wenn er sichtbar ist — auf einem versteckten
  // Element liefert getBoundingClientRect() Nullen und die Klick-Umrechnung wäre kaputt.
  if (_wrTab === 'karte') wrDrawMap();
  wrBindEvents();
}

// ── 📣 Hilferuf-Broadcast-Popup (JP-Backlog §3, Muster js/loans.js) ──────────
// Läuft APP-WEIT im Poll (app.js ruft wrCheckHelpPopup), nicht nur im 🚀-Tab —
// sonst erfährt ein Verbündeter erst vom Hilferuf, wenn er zufällig vorbeischaut.
// ⚠️ Merker PRO WELLEN-ID (nicht pro Tag) — sonst verschluckt er den zweiten
// Hilferuf desselben Tages. localStorage, auf 60 IDs gedeckelt.
const _WR_HELP_SEEN_KEY = 'wr_help_seen_waves';
function _wrHelpSeen() {
  try { return JSON.parse(localStorage.getItem(_WR_HELP_SEEN_KEY)) || []; } catch (e) { return []; }
}
function _wrHelpMarkSeen(ids) {
  try {
    const s = [...new Set(_wrHelpSeen().concat(ids))].slice(-60);
    localStorage.setItem(_WR_HELP_SEEN_KEY, JSON.stringify(s));
  } catch (e) {}
}
async function wrCheckHelpPopup() {
  try {
    const me = (typeof currentUserData !== 'undefined' && currentUserData) || _wrMember;
    if (!me?.id) return;
    // Nicht über andere Modals legen (Quiz/Kredit/eigenes)
    if (document.getElementById('wr-help-modal') || document.getElementById('loan-modal')?.innerHTML) return;
    if (typeof DB === 'undefined' || !DB.fetchSpaceWaves) return;
    const waves = await DB.fetchSpaceWaves();
    const seen = new Set(_wrHelpSeen());
    const fresh = (waves || []).filter(w => w.help_open && w.member_id !== me.id
      && !seen.has(w.id) && Date.parse(w.arrive_at) > Date.now());
    if (!fresh.length) return;
    _wrHelpMarkSeen(fresh.map(w => w.id));
    const nameOf = (id) => {
      const u = (typeof appData !== 'undefined' && appData?.users || []).find(x => x.id === id);
      return u?.name || 'Ein Clan-Mitglied';
    };
    const list = fresh.map(w => {
      const tier = wrWaveTier(w.strength);
      return `<div style="margin:8px 0"><strong>${_wrEsc(nameOf(w.member_id))}</strong> ruft um Hilfe —
        ${_wrEsc(tier.name)} (Stärke ${wrFmt(w.strength)}) schlägt in
        <b>${wrCountdown(Date.parse(w.arrive_at) - Date.now())}</b> ein!</div>`;
    }).join('');
    let mEl = document.getElementById('wr-help-modal');
    if (!mEl) { mEl = document.createElement('div'); mEl.id = 'wr-help-modal'; document.body.appendChild(mEl); }
    mEl.innerHTML = `
      <div class="quiz-backdrop"></div>
      <div class="quiz-box"><div class="quiz-card" style="text-align:center">
        <div class="quiz-emoji">📣</div>
        <h2>Hilferuf aus dem All!</h2>
        ${list}
        <p style="color:var(--muted);font-size:.8rem">Schick einen Verband zur Verstärkung — bei
        erfolgreicher Abwehr winkt eine Bergungsprämie. Scheitert sie, verlierst auch du anteilig Schiffe.</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
          <button class="wr-btn" id="wr-help-later">Später</button>
          <button class="wr-btn wr-btn-go" id="wr-help-go">🚀 Zum Weltall</button>
        </div>
      </div></div>`;
    mEl.querySelector('#wr-help-later').onclick = () => mEl.remove();
    mEl.querySelector('#wr-help-go').onclick = () => {
      mEl.remove();
      try {
        if (typeof switchView === 'function') switchView('imperium');
        setTimeout(() => document.querySelector('#imp-tabs [data-tab="weltall"]')?.click(), 250);
      } catch (e) {}
    };
  } catch (e) { /* Popup darf den Poll nie stören */ }
}

// ── 🤝 Clan-Handel v2: KAUFGESUCHE (JP 2026-07-22, migration_2026-07-22i) ────
// JP: keine weißen Eingabefelder — Rohstoff + Menge als Schaltflächen, der Preis
// wird GENERIERT (Festpreis, Server-autoritativ), abschicken, der Clan liefert.
// ⚠️ CLIENT-SYNC: WR_TRADE_PRICE spiegelt _space_trade_price() in 22i.
// Kaufen ist bewusst teurer als Selbst-Ernten (Komfort-Aufschlag): Erz 25,
// Kristall 60 CC/Stück (Beute-Verhältnis ≈ 2:1 + Treibstoff-Premium für Kristall).
const WR_TRADE_PRICE = { erz: 25, kristall: 60 };
const WR_TRADE_AMOUNTS = [25, 50, 75, 100];
let _wrTrType = 'erz', _wrTrAmount = 50;

async function wrLoadHandel() {
  const el = document.getElementById('wr-handel');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);padding:12px">🤝 Lade Gesuche …</p>';
  const offers = await DB.fetchSpaceTrades();
  if (!document.getElementById('wr-handel')) return;   // Tab inzwischen gewechselt
  const m = _wrMember;
  const rows = (offers || []).map(o => {
    const own = o.seller_id === m?.id;
    // 🚀 Schiffsangebot: resource_type trägt den Schiffs-Key, Preis = normaler Kaufpreis
    if (o.kind === 'ship') {
      const sd = SPACE_SHIP_BY_KEY[o.resource_type];
      if (!sd) return '';
      const cc = sd.cc * o.amount, erz = sd.erz * o.amount, kri = sd.kristall * o.amount;
      const afford = (parseFloat(m?.coins) || 0) >= cc && wrErz(m) >= erz && wrKristall(m) >= kri;
      const kost = [`${wrFmt(cc)} CC`];
      if (erz > 0) kost.push(`${wrFmt(erz)} 🪨`);
      if (kri > 0) kost.push(`${wrFmt(kri)} 💎`);
      return `<div class="wr-trade-row${own ? ' is-own' : ''}">
        <span class="wr-trade-what">${sd.icon} <strong>${o.amount}×</strong> ${_wrEsc(sd.name)}</span>
        <span class="wr-trade-who">${own ? 'dein Angebot' : _wrEsc(o.seller_name || 'Clan-Mitglied') + ' bietet'}</span>
        <span class="wr-trade-price"><strong>${kost.join(' + ')}</strong></span>
        ${own
          ? `<button class="wr-btn wr-btn-sm" data-wr-trade-cancel="${o.id}">Zurückziehen</button>`
          : `<button class="wr-btn wr-btn-sm wr-btn-go" data-wr-trade-shipbuy="${o.id}" ${afford ? '' : 'disabled'}>⚡ Zuschlag</button>`}
      </div>`;
    }
    const icon = o.resource_type === 'erz' ? '🪨' : '💎';
    const isReq = o.kind === 'request';
    const have = o.resource_type === 'erz' ? wrErz(m) : wrKristall(m);
    const canFill = !own && have >= o.amount;
    return `<div class="wr-trade-row${own ? ' is-own' : ''}">
      <span class="wr-trade-what">${icon} <strong>${wrFmt(o.amount)}</strong></span>
      <span class="wr-trade-who">${own ? (isReq ? 'dein Gesuch' : 'dein Angebot')
        : _wrEsc(o.seller_name || 'Clan-Mitglied') + (isReq ? ' sucht' : ' bietet')}</span>
      <span class="wr-trade-price"><strong>${wrFmt(o.price_cc)} CC</strong></span>
      ${own
        ? `<button class="wr-btn wr-btn-sm" data-wr-trade-cancel="${o.id}">Zurückziehen</button>`
        : isReq
          ? `<button class="wr-btn wr-btn-sm wr-btn-go" data-wr-trade-fill="${o.id}" ${canFill ? '' : 'disabled'}>📦 Liefern</button>`
          : `<button class="wr-btn wr-btn-sm wr-btn-go" data-wr-trade-buy="${o.id}">Kaufen</button>`}
    </div>`;
  }).join('');
  // 🚀 Eigene Hafen-Schiffe zum Anbieten (je Klick 1 Schiff — bewusst simpel)
  const ships = wrHomeShips(m);
  const shipBtns = SPACE_SHIPS
    .filter(s => (parseInt(ships[s.key], 10) || 0) > 0)
    .map(s => `<button class="wr-tr-btn" data-wr-tr-shipoffer="${s.key}"
        title="Preis: ${wrFmt(s.cc)} CC${s.erz ? ` + ${wrFmt(s.erz)} 🪨` : ''}${s.kristall ? ` + ${wrFmt(s.kristall)} 💎` : ''}">
        ${wrShipArt(s.key, 'wr-mini')} ${_wrEsc(s.name)} <span class="wr-sub">×${wrFmt(parseInt(ships[s.key], 10) || 0)}</span></button>`)
    .join('');
  const price = _wrTrAmount * (WR_TRADE_PRICE[_wrTrType] || 0);
  const afford = (parseFloat(m?.coins) || 0) >= price;
  el.innerHTML = `
    <div class="wr-card">
      <div class="wr-card-title">🤝 Kaufgesuch aufgeben <span class="wr-sub">— der Clan liefert, du zahlst den Festpreis</span></div>
      <div class="wr-tr-btnrow">
        <button class="wr-tr-btn${_wrTrType === 'erz' ? ' active' : ''}" data-wr-tr-type="erz">🪨 Erz <span class="wr-sub">${WR_TRADE_PRICE.erz} CC/Stk</span></button>
        <button class="wr-tr-btn${_wrTrType === 'kristall' ? ' active' : ''}" data-wr-tr-type="kristall">💎 Kristall <span class="wr-sub">${WR_TRADE_PRICE.kristall} CC/Stk</span></button>
      </div>
      <div class="wr-tr-btnrow">
        ${WR_TRADE_AMOUNTS.map(a =>
          `<button class="wr-tr-btn${_wrTrAmount === a ? ' active' : ''}" data-wr-tr-amount="${a}">${a}</button>`).join('')}
      </div>
      <div class="wr-tr-sum">
        <span>Du zahlst: <strong class="${afford ? '' : 'wr-bad'}">${wrFmt(price)} CC</strong>
          ${afford ? '' : '<span class="wr-sub">(zu wenig CC!)</span>'}</span>
        <button class="wr-btn wr-btn-go" id="wr-tr-request" ${afford ? '' : 'disabled'}>📨 Gesuch abschicken</button>
      </div>
      <p class="wr-sub" style="margin:6px 0 0">Die CC werden beim Abschicken gesperrt; Rückzug erstattet.
        Dein Lager: ${wrFmt(wrErz(m))} 🪨 · ${wrFmt(wrKristall(m))} 💎</p>
    </div>
    <div class="wr-card">
      <div class="wr-card-title">🚀 Schiff anbieten <span class="wr-sub">— zum normalen Kaufpreis, Käufer erhält es sofort (ohne Bauzeit)</span></div>
      ${shipBtns
        ? `<div class="wr-tr-btnrow wr-tr-ships">${shipBtns}</div>
           <p class="wr-sub" style="margin:6px 0 0">Je Klick wird 1 Schiff eingestellt (und gesperrt) — Rückzug holt es zurück.</p>`
        : '<p class="wr-sub" style="padding:4px 0 8px">Keine Schiffe im Hafen.</p>'}
    </div>
    <div class="wr-card">
      <div class="wr-card-title">📋 Offene Gesuche & Angebote</div>
      ${rows || '<p class="wr-sub" style="padding:4px 0 8px">Nichts offen — gib das erste Gesuch auf!</p>'}
    </div>`;
}

async function wrShipOffer(shipKey) {
  if (_wrBusy) return;
  const sd = SPACE_SHIP_BY_KEY[shipKey];
  if (!sd) return;
  _wrBusy = true;
  try {
    const res = await DB.createSpaceShipOffer(_wrMember.id, shipKey, 1);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    wrToast(`🚀 ${sd.name} eingestellt — im Hafen gesperrt.`, 'success');
    wrChat(`🤝 ${_wrEsc(_wrMember.name)} bietet ${wrArtTok(shipKey)} ${_wrEsc(sd.name)} zum Kaufpreis an — `
         + `Zuschlag im 🚀-Tab unter Handel.`);
    wrRender();
  } catch (e) {
    wrToast('Anbieten fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrShipBuy(tradeId) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.buySpaceShipOffer(_wrMember.id, tradeId);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    const sd = SPACE_SHIP_BY_KEY[res.ship];
    wrToast(`⚡ Zuschlag: ${res.count}× ${sd?.name || res.ship} — sofort im Hafen!`, 'success');
    wrChat(`⚡ ${_wrEsc(_wrMember.name)} hat den Zuschlag für ${wrArtTok(res.ship)} `
         + `${_wrEsc(sd?.name || res.ship)} von ${_wrEsc(res.seller || 'einem Clan-Mitglied')} erhalten.`);
    wrRender();
  } catch (e) {
    wrToast('Zuschlag fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrTradeRequest() {
  if (_wrBusy) return;
  const type = _wrTrType, amount = _wrTrAmount;
  const price = amount * (WR_TRADE_PRICE[type] || 0);
  _wrBusy = true;
  try {
    const res = await DB.createSpaceRequest(_wrMember.id, type, amount);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    wrToast(`📨 Gesuch abgeschickt — ${wrFmt(res.price || price)} CC gesperrt.`, 'success');
    wrChat(`🤝 ${_wrEsc(_wrMember.name)} sucht ${wrFmt(amount)} ${wrArtTok(type)} für ${wrFmt(res.price || price)} CC — `
         + `liefern im 🚀-Tab unter Handel.`);
    wrRender();
  } catch (e) {
    wrToast('Gesuch fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrTradeFulfill(tradeId) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.fulfillSpaceRequest(_wrMember.id, tradeId);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    const icon = res.type === 'erz' ? '🪨' : '💎';
    wrToast(`📦 Geliefert: ${wrFmt(res.amount)} ${icon} — +${wrFmt(res.price)} CC`, 'success');
    wrChat(`📦 ${_wrEsc(_wrMember.name)} hat das Gesuch von ${_wrEsc(res.requester || 'einem Clan-Mitglied')} beliefert: `
         + `${wrFmt(res.amount)} ${wrArtTok(res.type)} für ${wrFmt(res.price)} CC.`);
    wrRender();
  } catch (e) {
    wrToast('Liefern fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrTradeBuy(tradeId) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.buySpaceTrade(_wrMember.id, tradeId);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    const icon = res.type === 'erz' ? '🪨' : '💎';
    wrToast(`🤝 Gekauft: ${wrFmt(res.amount)} ${icon} für ${wrFmt(res.price)} CC`, 'success');
    wrChat(`🤝 ${_wrEsc(_wrMember.name)} hat das Angebot von ${_wrEsc(res.seller || 'einem Clan-Mitglied')} gekauft: `
         + `${wrFmt(res.amount)} ${wrArtTok(res.type)} für ${wrFmt(res.price)} CC.`);
    wrRender();
  } catch (e) {
    wrToast('Kauf fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrTradeCancel(tradeId) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.cancelSpaceTrade(_wrMember.id, tradeId);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    wrToast('↩️ Zurückgezogen — die Sperre (CC/Ware/Schiff) ist erstattet.', 'info');
    wrRender();
  } catch (e) {
    wrToast('Zurückziehen fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ── 📜 Ereignis-Protokoll (JP 2026-07-22) ────────────────────────────────────
// Alle Weltraum-Meldungen laufen bereits durch wrChat → Gruppen-Chat; der Marker
// [[wr]] macht sie dort verlässlich herausfilterbar. Kein eigenes Backend nötig.
// Zeigt die jüngsten 80 Ereignisse ab Marker-Einführung, neueste zuerst.
async function wrLoadProtokoll() {
  const el = document.getElementById('wr-log');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);padding:12px">📜 Lade Protokoll …</p>';
  let msgs = [];
  try { msgs = (await DB.fetchMessages()) || []; } catch (e) {}
  const rows = msgs
    .filter(x => typeof x.message === 'string' && x.message.indexOf(WR_CHAT_MARK) !== -1)
    .slice(-80).reverse();
  if (!document.getElementById('wr-log')) return;   // Tab inzwischen gewechselt
  if (!rows.length) {
    el.innerHTML = `<div class="wr-card"><div class="wr-card-title">📜 Ereignis-Protokoll</div>
      <p class="wr-sub" style="padding:4px 0 8px">Noch keine Einträge — das Protokoll sammelt ab jetzt
      alle Weltraum-Meldungen des Clans (Kämpfe, Wellen, Bauten, Forschung, Kolonien).</p></div>`;
    return;
  }
  const fmtT = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' '
           + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  };
  el.innerHTML = `<div class="wr-card"><div class="wr-card-title">📜 Ereignis-Protokoll
      <span class="wr-sub">— alle Weltraum-Meldungen des Clans</span></div>
    <div class="wr-log-list">${rows.map(x => `
      <div class="wr-log-row"><span class="wr-log-t">${fmtT(x.created_at)}</span>
        <span class="wr-log-msg">${(typeof _chatArt === 'function' ? _chatArt(_wrEsc(x.message)) : _wrEsc(x.message))}</span></div>`).join('')}
    </div></div>`;
}

// ── HUD ──────────────────────────────────────────────────────────────────────
// Rohstoff-Symbol als Bild mit Emoji-Rückfall (gleiche Mechanik wie bei den Schiffen:
// schlägt das Bild fehl, entfernt sich das <img> und der CSS-Nachbarselektor gibt das Emoji frei).
function wrResIcon(art, emoji) {
  return `<img class="wr-res-art" src="assets/space/${art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-res-ic wr-res-ic-fb">${emoji}</span>`;
}

// JP 2026-07-22: „Die Rohstoffzeile ist viel zu groß und blockiert für ein
// mobile-phone die komplette Sicht" — eine EINZIGE schmale Zeile statt der
// 4er-Kachel-Grid. Labels via title-Tooltip, auf schmalen Screens nur Icon+Wert.
// Die Nicht-käuflich-Notiz ist aus dem Sticky-Header in den Raumhafen-Tab gezogen.
function wrHudHtml(m) {
  const ships = wrHomeShips(m);
  const total = Object.values(ships).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  return `
    <div class="wr-hud">
      <div class="wr-res" title="Erz">${wrResIcon('res_erz', '🪨')}<span class="wr-res-v">${wrFmt(wrErz(m))}</span><span class="wr-res-l">Erz</span></div>
      <div class="wr-res" title="Koffeinkristall">${wrResIcon('res_kristall', '💎')}<span class="wr-res-v">${wrFmt(wrKristall(m))}</span><span class="wr-res-l">Kristall</span></div>
      ${wrPlasmoid(m) > 0 ? `<div class="wr-res" title="Plasmoiden-Staub (Ring 2)">${wrResIcon('res_plasmoid', '🟣')}<span class="wr-res-v">${wrFmt(wrPlasmoid(m))}</span><span class="wr-res-l">Plasmoid</span></div>` : ''}
      ${wrQuantum(m) > 0 ? `<div class="wr-res" title="Quantenschaum (Ring 3)">${wrResIcon('res_quantum', '🌀')}<span class="wr-res-v">${wrFmt(wrQuantum(m))}</span><span class="wr-res-l">Quantum</span></div>` : ''}
      <div class="wr-res" title="Schiffe im Hafen"><span class="wr-res-ic">🛰️</span><span class="wr-res-v">${wrFmt(total)}</span><span class="wr-res-l">Hafen</span></div>
      <div class="wr-res" title="Kolonien"><span class="wr-res-ic">🪐</span><span class="wr-res-v">${wrFmt(Object.keys(wrColonies(m)).length)}</span><span class="wr-res-l">Kolonien</span></div>
    </div>`;
}
const WR_RES_NOTE = `<div class="wr-note">🪨 Erz und 💎 Koffeinkristall sind <strong>nicht käuflich</strong> — es gibt sie
      ausschließlich im All. Sie zählen nicht zu deinem CoffeeCoin-Vermögen.</div>`;

// ── Laufende Reise ───────────────────────────────────────────────────────────
function wrTripHtml(m, trip) {
  const now = Date.now();
  const arrive = Date.parse(trip.arriveAt), ret = Date.parse(trip.returnAt);
  const back = now >= ret;
  const phase = back ? 'zurück im Hafen' : (now >= arrive ? 'am Ziel — Rückflug läuft' : 'auf dem Hinflug');
  const target = (_wrGalaxy?.planets || []).find(p => p.id === trip.planetId);
  const info = SPACE_INTENTS[trip.intent] || { icon: '🚀', name: trip.intent };
  const ships = wrTripShipsDisplay(trip);   // 🚀 pro Trip (nicht mehr away.ships)
  const list = Object.entries(ships).filter(([, n]) => n > 0)
    .map(([k, n]) => `${wrShipArt(k)} ${n}`).join(' · ');
  return `
    <div class="wr-trip ${back ? 'wr-trip-done' : ''}" data-wr-tripcard="${trip.id}" title="Verband ansehen">
      <div class="wr-trip-head">${info.icon} <strong>${_wrEsc(info.name)}</strong> → ${_wrEsc(target?.name || 'Planet')}
        <span class="wr-trip-more">🔍 Details</span></div>
      <div class="wr-trip-body">
        <span class="wr-trip-ships">${list || '—'}</span>
        <span class="wr-trip-phase">${phase}</span>
      </div>
      ${back
        ? '<button class="wr-btn wr-btn-go" data-wr-claim="1">📥 Flotte empfangen</button>'
        : `<div class="wr-trip-eta">Rückkehr in <strong data-wr-eta="${trip.id}">${wrCountdown(ret - now)}</strong></div>
           ${(now < arrive && !trip.recalled)
             ? `<button class="wr-btn wr-btn-sm wr-btn-recall" data-wr-recall="${trip.id}">↩️ Zurückrufen`
               + '<span class="wr-btn-sub">Auftrag verfällt · Rückweg = bisherige Flugzeit</span></button>'
             : ''}
           ${trip.recalled ? '<div class="wr-sub">↩️ Auf dem Rückweg — der Auftrag wurde abgebrochen.</div>' : ''}`}
    </div>`;
}

// Kompakte Dauer-Leiste über den Tabs. Die vollen Reise-Karten sind in den 🛩️-Tab
// gewandert (JP 2026-07-29), aber eine fällige Rückkehr darf NICHT hinter einem Tab
// verschwinden — genau deshalb standen sie ursprünglich überall. Kompromiss: eine Zeile
// je Verband mit Countdown, Klick springt in den Flotten-Tab.
function wrTripStripHtml(m, trips) {
  if (!trips || !trips.length) return '';
  const now = Date.now();
  const rows = trips.map(t => {
    const ret    = Date.parse(t.returnAt);
    const back   = now >= ret;
    const target = (_wrGalaxy?.planets || []).find(p => p.id === t.planetId);
    const info   = SPACE_INTENTS[t.intent] || { icon: '🚀', name: t.intent };
    return `
      <button type="button" class="wr-ts-row${back ? ' wr-ts-done' : ''}" data-wr-tab="flotten"
        title="Im Flotten-Tab ansehen">
        <span class="wr-ts-ic">${info.icon}</span>
        <span class="wr-ts-txt">${_wrEsc(target?.name || info.name)}</span>
        <span class="wr-ts-eta">${back
          ? '📥 zurück'
          : `<span data-wr-eta="${t.id}">${wrCountdown(ret - now)}</span>`}</span>
      </button>`;
  }).join('');
  return `<div class="wr-tripstrip">${rows}</div>`;
}

// ── 🛩️ Flotten-Tab ──────────────────────────────────────────────────────────
function wrFlottenHtml(m, trips) {
  const list = trips || wrTrips(m);
  const verbaende = list.length
    ? list.map(t => wrTripHtml(m, t)).join('')
    : `<div class="wr-sub" style="padding:6px 0">Kein Verband unterwegs — wähle auf der
         🌌 Sternkarte ein Ziel und stelle deine Flotte zusammen.</div>`;
  return `
    <div class="wr-card">
      <div class="wr-card-title">🛩️ Verbände unterwegs
        <span class="wr-sub">${list.length} von ${WR_MAX_TRIPS} · jeder weitere startet mit
          ${wrFleetGap(m)} Min Vorlauf</span></div>
      ${verbaende}
    </div>
    ${wrFleetTemplatesHtml(m)}
    ${wrHomeDetailHtml(m)}
    ${wrRoutesHtml(m)}`;
}

// ── 📋 Flotten-Vorlagen (Backlog §8 „Flottenkommando") ──────────────────────
// Benannte Zusammenstellungen, die per Klick in die Auswahl geladen werden.
// Ablage in map_data.wrFleets über die bestehende save_map_data-RPC — kein Schema-Change
// und im Gegensatz zu localStorage gerätübergreifend (Muster map_data.revier/todayLog).
const WR_TPL_MAX = 8;
function wrTemplates(m) {
  const a = m?.map_data?.wrFleets;
  return Array.isArray(a) ? a.filter(t => t && typeof t === 'object' && t.ships) : [];
}
// Wie viele Schiffe der Vorlage sind gerade wirklich da? Eine Vorlage soll nie blockieren —
// sie lädt, was vorhanden ist, sagt aber vorher ehrlich, wie vollständig sie ist.
function wrTplAvail(m, tpl) {
  const ships = wrHomeShips(m);
  let want = 0, have = 0;
  for (const [k, n] of Object.entries(tpl.ships || {})) {
    const w = parseInt(n, 10) || 0;
    if (w <= 0) continue;
    want += w;
    have += Math.min(w, parseInt(ships[k], 10) || 0);
  }
  return { want, have, full: want > 0 && have >= want };
}
function wrFleetTemplatesHtml(m) {
  const tpls = wrTemplates(m);
  const sel  = _wrSelFleet || {};
  const selN = SPACE_SHIPS.reduce((a, s) => a + (parseInt(sel[s.key], 10) || 0), 0);
  const rows = tpls.map(t => {
    const av = wrTplAvail(m, t);
    const shipTxt = Object.entries(t.ships || {})
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${wrShipArt(k)} ${n}`).join(' · ') || '—';
    return `
      <div class="wr-tpl${av.full ? '' : ' wr-tpl-part'}">
        <button type="button" class="wr-tpl-load" data-wr-tplload="${_wrEsc(t.id)}"
          title="In die Flottenauswahl laden">
          <span class="wr-tpl-name">${_wrEsc(t.name || 'Vorlage')}</span>
          <span class="wr-tpl-ships">${shipTxt}</span>
          <span class="wr-tpl-av${av.full ? ' wr-ok' : ' wr-bad'}">${av.full
            ? `✓ ${av.want} Schiffe bereit`
            : `${av.have} von ${av.want} verfügbar`}</span>
        </button>
        <button type="button" class="wr-btn wr-btn-sm wr-tpl-del" data-wr-tpldel="${_wrEsc(t.id)}"
          title="Vorlage löschen">🗑️</button>
      </div>`;
  }).join('');
  return `
    <div class="wr-card">
      <div class="wr-card-title">📋 Flottenkommando
        <span class="wr-sub">— gespeicherte Zusammenstellungen, ${tpls.length} von ${WR_TPL_MAX}</span></div>
      ${tpls.length ? `<div class="wr-tpl-list">${rows}</div>`
        : `<div class="wr-sub" style="padding:4px 0">Noch keine Vorlage. Stell auf der 🌌 Sternkarte
             einen Verband zusammen und sichere ihn hier — dann lädst du ihn künftig mit einem Klick.</div>`}
      <div class="wr-tpl-new">
        <input type="text" id="wr-tpl-name" class="wr-tpl-input" maxlength="24"
          placeholder="Name, z. B. Sturmverband" value="${_wrEsc(_wrTplName)}">
        <button class="wr-btn wr-btn-sm" id="wr-tpl-save" ${(selN < 1 || tpls.length >= WR_TPL_MAX) ? 'disabled' : ''}
          >➕ Auswahl merken${selN > 0 ? ` <span class="wr-btn-sub">${selN} Schiffe</span>` : ''}</button>
      </div>
      ${selN < 1 ? '<div class="wr-sub">Die aktuelle Auswahl ist leer — es gibt nichts zu merken.</div>' : ''}
      ${tpls.length >= WR_TPL_MAX ? `<div class="wr-warn">Höchstens ${WR_TPL_MAX} Vorlagen. Lösch erst eine.</div>` : ''}
    </div>`;
}

// ── Flottenverband zusammenstellen ──────────────────────────────────────────
// Vorher flog bei „Angreifen" stur die GESAMTE Heimatflotte mit — inklusive Röstkometen
// und Sonden, die im Kampf mit derselben Quote verheizt wurden wie die Jäger. Jetzt stellt
// der Spieler den Verband selbst zusammen; die Vorschlagswerte kommen weiterhin aus
// wrFleetFor(), sind aber nur noch eine Vorbelegung.
function wrSelKey() {
  if (!_wrSel) return null;
  return _wrSel.fog ? ('q:' + _wrSel.q.key) : ('p:' + (_wrSel.planet?.id || ''));
}

// Vorbelegung, sobald ein anderes Ziel gewählt wurde. Danach bleibt die Auswahl des
// Spielers stehen — sie wird nur noch auf den tatsächlichen Hafenbestand geklemmt.
function wrSyncFleetSel(m) {
  const key   = wrSelKey();
  const ships = wrHomeShips(m);
  const inPort = SPACE_SHIPS.reduce((a, s) => a + (parseInt(ships[s.key], 10) || 0), 0);
  // Während eine Flotte unterwegs ist, ist der Hafen leer und die Auswahl klemmt auf 0.
  // Kommt sie zurück, muss neu vorbelegt werden — sonst bliebe der Verband dauerhaft leer
  // und der Angriffsknopf gesperrt, bis man manuell nachklickt.
  //
  // ⚠️ Die Bedingung ist bewusst NUR der Übergang leer→voll. Ein simples „Auswahl ist leer,
  // Hafen ist voll" würde den „Leeren"-Knopf unbrauchbar machen: der Handler rendert direkt
  // danach neu und würde die Auswahl sofort wieder auffüllen.
  const returned = _wrSelPort === 0 && inPort > 0;
  _wrSelPort = inPort;
  if (_wrTplPending) {
    // 📋 Eine geladene Vorlage schlägt jede Vorbelegung — sonst wäre sie beim ersten
    // Zielwechsel wieder weg. Sie gilt genau einmal; danach zählt wieder die Auswahl.
    _wrSelFor    = key;
    _wrSelFleet  = Object.assign({}, _wrTplPending);
    _wrTplPending = null;
  } else if (key !== _wrSelFor || returned) {
    _wrSelFor   = key;
    _wrSelFleet = Object.assign({}, wrFleetFor(wrDefaultIntent(m), m));
  }
  const out = {};
  for (const s of SPACE_SHIPS) {
    const have = parseInt(ships[s.key], 10) || 0;
    const want = parseInt(_wrSelFleet?.[s.key], 10) || 0;
    out[s.key] = Math.max(0, Math.min(have, want));
  }
  _wrSelFleet = out;
  return out;
}

// Welcher Auftrag ist beim aktuellen Ziel der naheliegende? (nur für die Vorbelegung)
function wrDefaultIntent(m) {
  if (_wrSel?.fog) return 'scout';
  const p = _wrSel?.planet;
  if (!p) return 'scout';
  if (!p.cleared_by) return 'attack';
  return 'harvest';
}

function wrSelCount(key) { return parseInt(_wrSelFleet?.[key], 10) || 0; }
function wrSelTotal() { return SPACE_SHIPS.reduce((a, s) => a + wrSelCount(s.key), 0); }

function wrFleetPickerHtml(m) {
  const sel   = wrSyncFleetSel(m);
  const ships = wrHomeShips(m);
  const avail = SPACE_SHIPS.filter(s => (parseInt(ships[s.key], 10) || 0) > 0);
  if (!avail.length) {
    return `<div class="wr-fleetsel wr-fleetsel-empty">🏗️ Kein Schiff im Hafen — bau erst in der Werft.</div>`;
  }
  let rows = '';
  for (const s of avail) {
    const have = parseInt(ships[s.key], 10) || 0;
    const n    = sel[s.key] || 0;
    rows += `
      <div class="wr-fs-row${n > 0 ? ' wr-fs-on' : ''}">
        <span class="wr-fs-ic">${wrShipArt(s.key, 'wr-mini wr-mini-md')}</span>
        <span class="wr-fs-name">${_wrEsc(s.name)}
          <span class="wr-sub">${s.atk ? `⚔️ ${s.atk}` : ''}${s.mine ? ` ⛏️ ${s.mine}` : ''}</span></span>
        <span class="wr-fs-stepper">
          <button class="wr-fs-btn" data-wr-fadj="${s.key}:-1" ${n < 1 ? 'disabled' : ''}>−</button>
          <span class="wr-fs-n">${n}<span class="wr-sub">/${have}</span></span>
          <button class="wr-fs-btn" data-wr-fadj="${s.key}:1" ${n >= have ? 'disabled' : ''}>+</button>
        </span>
      </div>`;
  }
  const power = wrFleetPower(sel), mine = wrFleetMine(sel);
  return `
    <div class="wr-fleetsel">
      <div class="wr-fs-head">🚀 Flottenverband
        <span class="wr-sub">— wähle, was mitfliegt</span></div>
      ${rows}
      <div class="wr-fs-quick">
        <button class="wr-fs-q" data-wr-fq="attack">⚔️ Kampfflotte</button>
        <button class="wr-fs-q" data-wr-fq="harvest">⛏️ Ernteflotte</button>
        <button class="wr-fs-q" data-wr-fq="all">Alles</button>
        <button class="wr-fs-q" data-wr-fq="none">Leeren</button>
      </div>
      <div class="wr-fs-sum">
        <span>Schiffe: <strong>${wrFmt(wrSelTotal())}</strong></span>
        <span>${wrIc("atk")} Kampfkraft: <strong>${wrFmt(power)}</strong></span>
        ${mine > 0 ? `<span>${wrIc("mine")} Abbau: <strong>${wrFmt(mine)}</strong></span>` : ''}
        ${(() => {
          // 💎 Treibstoff der aktuellen Auswahl zum gewählten Ziel (Ring aus der Auswahl)
          const ring = _wrSel?.planet?.ring ?? _wrSel?.q?.ring ?? 0;
          if (!ring) return '';
          const fuel = wrTripFuel(wrSyncFleetSel(m), ring);
          if (fuel <= 0) return `<span>💎 Treibstoff: <strong>frei</strong></span>`;
          const ok = wrKristall(m) >= fuel;
          return `<span class="${ok ? '' : 'wr-bad'}">💎 Treibstoff: <strong>${wrFmt(fuel)}</strong>`
               + `${ok ? '' : ` <span class="wr-sub">(nur ${wrFmt(wrKristall(m))} auf Lager!)</span>`}</span>`;
        })()}
        ${(() => {
          // JP 2026-07-22 (#33): Kutter & Co. im Kampfverband sind Kanonenfutter —
          // die Verlust-Reihenfolge trifft kleine Schiffe zuerst. Warnen, solange das
          // Ziel noch Wächter hat und Nutzschiffe (atk ≤ 3) in der Auswahl stecken.
          const pt = _wrSel?.planet;
          if (!pt || pt.cleared_by) return '';
          const weak = Object.entries(wrSyncFleetSel(m))
            .filter(([k, n]) => n > 0 && (SPACE_SHIP_BY_KEY[k]?.atk || 0) <= 3)
            .map(([k]) => SPACE_SHIP_BY_KEY[k]?.name || k);
          return weak.length
            ? `<span class="wr-bad" style="flex-basis:100%">⚠️ ${_wrEsc(weak.join(' & '))} sind im Kampf `
              + `Kanonenfutter — Verluste treffen kleine Schiffe zuerst. Für den Angriff besser draußen lassen.</span>`
            : '';
        })()}
        ${(() => {
          // 🛩️ RING-GATE (26m). Es gibt bewusst KEIN What's-New-Popup (JP-Entscheidung,
          // Plan §11) — diese Zeile IST die Erklärung der neuen Regel. Sie muss deshalb
          // vollständig sein: was fehlt, wie viele Träger es braucht, und dass große
          // Jäger nicht betroffen sind. Der Server lehnt sonst mit jaeger_need_carrier ab.
          const ring = _wrSel?.planet?.ring ?? _wrSel?.q?.ring ?? 0;
          const g = wrCarrierGap(wrSyncFleetSel(m), ring);
          if (!g.blocked) {
            // Positiv-Rückmeldung, wenn Jäger tatsächlich an Bord sitzen — sonst merkt
            // niemand, dass der Träger gerade etwas tut.
            const seats = wrCarrierSeats(wrSyncFleetSel(m));
            return seats > 0
              ? `<span class="wr-good" style="flex-basis:100%">🛩️ ${wrFmt(seats)} Jäger an Bord `
                + `— sie fliegen geschützt mit (Schild des Trägers statt eigenem).</span>`
              : '';
          }
          return `<span class="wr-bad" style="flex-basis:100%">🛩️ <strong>Ring ${ring} nicht erreichbar:</strong> `
               + `${wrFmt(g.jaeger)} kleine Jäger, aber nur Platz für ${wrFmt(g.capacity)}. `
               + `Je ${WR_CARRIER_SEATS} Jäger braucht es ein Trägerschiff — `
               + `${g.missing === 1 ? 'es fehlt <strong>1 Träger</strong>' : `es fehlen <strong>${wrFmt(g.missing)} Träger</strong>`}. `
               + `(Große Jäger fliegen überall hin.)</span>`;
        })()}
      </div>
    </div>`;
}

// ── Vorlagen speichern / laden / löschen ────────────────────────────────────
// ⚠️ Schreiben läuft über DB.updateMapData (save_map_data-RPC), NIE per direktem
// .update() — das hatte beim Karten-Feature 401er wegen RLS gegeben. Und: immer den
// FRISCHEN map_data-Stand als Basis nehmen, sonst überschreibt ein Vorlagen-Save
// nebenbei den Tages-Log (Last-Write-Wins auf dem Blob, die Tagesbilanz-Lehre).
async function wrTplPersist(list) {
  const m = _wrMember;
  if (!m) return false;
  const md = Object.assign({}, m.map_data || {}, { wrFleets: list });
  try {
    await DB.updateMapData(m.id, md);
    m.map_data = md;
    if (typeof currentUserData !== 'undefined' && currentUserData) currentUserData.map_data = md;
    return true;
  } catch (e) {
    wrToast('Vorlage konnte nicht gespeichert werden: ' + e.message, 'error');
    return false;
  }
}

async function wrTplSave() {
  const m = _wrMember;
  const sel = {};
  let n = 0;
  for (const s of SPACE_SHIPS) {
    const c = parseInt(_wrSelFleet?.[s.key], 10) || 0;
    if (c > 0) { sel[s.key] = c; n += c; }
  }
  if (n < 1) { wrToast('Stell zuerst auf der Sternkarte einen Verband zusammen.', 'error'); return; }
  const list = wrTemplates(m);
  if (list.length >= WR_TPL_MAX) { wrToast(`Höchstens ${WR_TPL_MAX} Vorlagen.`, 'error'); return; }
  const input = document.getElementById('wr-tpl-name');
  const name  = String((input && input.value) || _wrTplName || '').trim().slice(0, 24)
             || `Verband ${list.length + 1}`;
  const tpl = { id: 'f' + Date.now().toString(36), name, ships: sel };
  if (!(await wrTplPersist(list.concat([tpl])))) return;
  _wrTplName = '';
  wrToast(`📋 „${name}" gespeichert — ${n} Schiffe.`, 'success');
  wrRender();
}

function wrTplLoad(id) {
  const tpl = wrTemplates(_wrMember).find(t => t.id === id);
  if (!tpl) return;
  _wrTplPending = Object.assign({}, tpl.ships);
  const av = wrTplAvail(_wrMember, tpl);
  // Auf der Karte greift die Vorlage sofort; ohne gewähltes Ziel wartet sie.
  if (_wrSel) {
    _wrSelFor = null;              // erzwingt die Übernahme im nächsten wrSyncFleetSel
    wrSetTab('karte');
    wrRender();
  } else {
    wrSetTab('karte');
    wrRender();
  }
  wrToast(av.full
    ? `📋 „${tpl.name}" geladen — ${av.want} Schiffe. Wähle ein Ziel.`
    : `📋 „${tpl.name}" geladen — nur ${av.have} von ${av.want} Schiffen im Hafen.`,
    av.full ? 'success' : 'info');
}

async function wrTplDelete(id) {
  const list = wrTemplates(_wrMember);
  const tpl  = list.find(t => t.id === id);
  if (!tpl) return;
  if (!(await wrTplPersist(list.filter(t => t.id !== id)))) return;
  wrToast(`🗑️ „${tpl.name}" gelöscht.`, 'info');
  wrRender();
}

// Schnellauswahl-Presets
function wrFleetQuick(kind, m) {
  const ships = wrHomeShips(m);
  const all   = (keys) => {
    const f = {};
    for (const s of SPACE_SHIPS) f[s.key] = keys.includes(s.key) ? (parseInt(ships[s.key], 10) || 0) : 0;
    return f;
  };
  if (kind === 'attack')  _wrSelFleet = all(['jaeger', 'grossjaeger', 'kutter']);
  if (kind === 'harvest') _wrSelFleet = all(['ernter', 'kutter', 'jaeger']);
  if (kind === 'all')     _wrSelFleet = all(SPACE_SHIPS.map(s => s.key));
  if (kind === 'none')    _wrSelFleet = all([]);
}

// ── Hafen-Übersicht (Klick auf den Heimatquadranten) ────────────────────────
// Zeigt die Heimatflotte auf einen Blick — vorher sah man seine Schiffe nur, wenn man
// einen Planeten anklickte, und dort auch nur als Auswahl-Stepper.
function wrHomeDetailHtml(m) {
  const ships  = wrHomeShips(m);
  const away   = wrAwayShipsAll(m);
  const nTrips = wrTrips(m).length;
  const inPort = SPACE_SHIPS.reduce((a, s) => a + (parseInt(ships[s.key], 10) || 0), 0);
  const out    = SPACE_SHIPS.reduce((a, s) => a + (parseInt(away[s.key], 10) || 0), 0);

  let rows = '';
  for (const s of SPACE_SHIPS) {
    const here = parseInt(ships[s.key], 10) || 0;
    const gone = parseInt(away[s.key], 10) || 0;
    if (here + gone < 1) continue;
    rows += `
      <div class="wr-fl-row">
        <span class="wr-fl-art wr-ship-zoom" data-wr-info="${s.key}" title="Groß ansehen"
          ><img src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-fl-fb">${s.icon}</span></span>
        <span class="wr-fl-name">${_wrEsc(s.name)}
          ${gone > 0 ? `<span class="wr-sub">${gone} unterwegs</span>` : ''}</span>
        <span class="wr-fl-n">${wrFmt(here)}</span>
        <span class="wr-fl-atk">${s.atk ? `⚔️ ${wrFmt(s.atk * here)}` : (s.mine ? `⛏️ ${wrFmt(s.mine * here)}` : '—')}</span>
      </div>`;
  }

  return `
    <div class="wr-detail">
      <div class="wr-planet-head">
        <span class="wr-foe wr-foe-lg wr-ship-zoom" data-wr-pinfo="1" title="Groß ansehen"
          ><img src="assets/space/base_${wrBaseLevel(m)}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-foe-fb">🛰️</span><span class="wr-zoom-hint">🔍</span></span>
        <div>
          <div class="wr-card-title">Dein Raumhafen
            <span class="wr-sub">Stufe ${wrBaseLevel(m)}</span></div>
          <div class="wr-sub">Heimatbasis aller Flüge. Was hier liegt, verteidigt
            bei einer Angriffswelle mit.</div>
        </div>
      </div>
      <div class="wr-facts">
        <span>${wrIc("port")} Im Hafen: <strong>${wrFmt(inPort)}</strong></span>
        ${out > 0 ? `<span>${wrIc("travel")} Unterwegs: <strong>${wrFmt(out)}</strong></span>` : ''}
        <span>${wrIc("atk")} Kampfkraft: <strong>${wrFmt(wrFleetPower(ships))}</strong></span>
        <span>${wrIc("def")} Geschütze: <strong>${wrFmt(wrTurretPower(m))}</strong></span>
      </div>
      ${rows
        ? `<div class="wr-fl-list">${rows}</div>`
        : '<div class="wr-warn">Noch kein Schiff gebaut — schau in der Werft weiter unten.</div>'}
      ${nTrips
        ? `<div class="wr-ok">✈️ ${nTrips === 1 ? 'Ein Verband ist' : nTrips + ' Verbände sind'} unterwegs (max. ${WR_MAX_TRIPS} gleichzeitig) — Details bei den Verbänden.</div>`
        : '<div class="wr-sub">Wähle einen Quadranten auf der Sternkarte, um eine Flotte auszusenden.</div>'}
    </div>`;
}

// Gegner-Verband sichtbar machen. OHNE diese Anzeige wären die Rollen unbenutzbar:
// man könnte nicht wissen, ob dort Schwärme (→ Jäger/Fregatten) oder Kapitalschiffe
// (→ Kreuzer) stehen. Der Verband ist deterministisch, also darf er offen liegen.
function wrFoeCompHtml(p) {
  const comp = wrFoeComp(p);
  if (!comp.length) return '';
  const rows = comp
    .slice().sort((a, b) => b.strength - a.strength)
    .map(c => {
      const r  = SPACE_FOE_ROLES[c.foe] || {};
      const fd = WR_FOE[c.foe] || { art:'foe_drohne', icon: '?', name: c.foe };
      const cls = r.cls === 'heavy' ? '🔷 schwer' : '🔹 leicht';
      return `<span class="wr-foe-chip">${wrFoeArt({ art: fd.art, icon: fd.icon }, 'wr-mini')}
        <strong>${_wrEsc(fd.name)}</strong> ${cls} · ${wrFmt(Math.round(c.strength))}</span>`;
    }).join('');
  return `<div class="wr-foecomp">
      <div class="wr-sub">Aufklärung: <strong>${_wrEsc(wrFoeProfile(p).name)}</strong>
        — leichte Ziele bekämpfst du mit Jägern und Fregatten, schwere mit Kreuzern.</div>
      <div class="wr-foecomp-row">${rows}</div>
    </div>`;
}


// ── 🔬 Forschungsbaum-Karte im 🚀-Tab ───────────────────────────────────────
// Muster der Kaffee-Krieger-Ausruestung: je Ast eine Spalte, Zustand am Knoten.
// Nicht verdrahtete Aeste sind sichtbar, aber nicht kaufbar — sie zeigen das Ziel,
// ohne Geld fuer Wirkungslosigkeit zu nehmen.
function wrTechHtml(m) {
  const spalten = SPACE_TECH_ASTE.map(a => {
    const knoten = SPACE_TECH.filter(t => t.ast === a.key)
      .sort((x, y) => x.stufe - y.stufe).map(t => {
        const st = wrTechState(m, t);
        const aktion = {
          owned:  '<span class="wr-tech-ok">✓ erforscht</span>',
          soon:   '<span class="wr-tech-soon">in Vorbereitung</span>',
          locked: `<span class="wr-tech-lock">🔒 braucht ${_wrEsc((SPACE_TECH_BY_KEY[t.requires] || {}).name || '')}</span>`,
          poor:   '<span class="wr-tech-poor">Mittel reichen nicht</span>',
          buy:    `<button class="wr-btn wr-btn-sm" data-wr-tech="${t.key}">Erforschen</button>`,
        }[st] || '';
        return `<div class="wr-tech-node wr-tech-${st}">
            <span class="wr-fl-art wr-ship-zoom" data-wr-techinfo="${t.key}" title="Groß ansehen"><img src="assets/weltraum/${t.art}.png" alt=""
              onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
              ><span class="wr-fl-fb">${a.icon}</span><span class="wr-zoom-hint">🔍</span></span>
            <span class="wr-tech-txt">
              <strong>${_wrEsc(t.name)}</strong>
              <span class="wr-sub">${wrIcText(t.wirkung)}</span>
              <span class="wr-sub">${wrFmt(t.cc)} CC${t.erz ? ` · ${wrFmt(t.erz)} ${wrIc('erz')}` : ''}${
                t.kristall ? ` · ${wrFmt(t.kristall)} ${wrIc('kri')}` : ''}${
                t.plasmoid ? ` · ${wrFmt(t.plasmoid)} ${wrIc('pla')}` : ''}${
                t.quantum ? ` · ${wrFmt(t.quantum)} ${wrIc('qua')}` : ''}</span>
            </span>
            <span class="wr-tech-act">${aktion}</span>
          </div>`;
      }).join('');
    return `<div class="wr-tech-ast${a.live ? '' : ' wr-tech-ast-soon'}">
        <div class="wr-tech-ast-head"><span class="wr-ast-art wr-ship-zoom"
            data-wr-astinfo="${a.key}" title="Groß ansehen"><img src="assets/space/${a.art}.png" alt=""
            onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
            ><span class="wr-ast-fb">${a.icon}</span><span class="wr-zoom-hint">🔍</span></span> ${_wrEsc(a.name)}${
          a.live ? '' : ' <span class="wr-sub">— in Vorbereitung</span>'}</div>
        ${knoten}
      </div>`;
  }).join('');
  const sp = wrTechSpeed(m), bt = Math.round((1 - wrTechBuildTime(m)) * 100);
  return `${wrTransmuterHtml(m)}<div class="wr-card">
      <div class="wr-card-title">🔬 Weltraum-Technik
        <span class="wr-sub">verstärkt, was du schon hast</span></div>
      ${(sp || bt) ? `<div class="wr-facts">
        ${sp ? `<span>${wrIc('time')} Flugzeit: <strong>−${sp} %</strong></span>` : ''}
        ${bt ? `<span>${wrIc('time')} Bauzeit: <strong>−${bt} %</strong></span>` : ''}
      </div>` : '<div class="wr-sub">Noch keine Technik erforscht.</div>'}
      <div class="wr-tech-grid">${spalten}</div>
    </div>`;
}

// ⚗️ Transmuter (wt_f9): Ring-Rohstoffe → CC. Erscheint im Forschungs-Tab, sobald erforscht.
function wrTransmuterHtml(m) {
  if (!wrHasTech(m, 'wt_f9')) return '';
  const pla = wrPlasmoid(m), qua = wrQuantum(m);
  return `<div class="wr-card">
    <div class="wr-card-title">⚗️ Transmuter <span class="wr-sub">— Ring-Rohstoffe zu CC</span></div>
    <div class="wr-refine-row">
      <span>${wrIc('pla')} Plasmoiden-Staub: <strong>${wrFmt(pla)}</strong></span>
      <button class="wr-btn wr-btn-sm" data-wr-transmute="plasmoid" ${pla < 1 ? 'disabled' : ''}>→ ${wrFmt(pla * 60)} CC</button>
    </div>
    <div class="wr-refine-row">
      <span>${wrIc('qua')} Quantenschaum: <strong>${wrFmt(qua)}</strong></span>
      <button class="wr-btn wr-btn-sm" data-wr-transmute="quantum" ${qua < 1 ? 'disabled' : ''}>→ ${wrFmt(qua * 150)} CC</button>
    </div>
    <p class="wr-sub" style="margin:4px 0 0">Kurs: ${wrIc('pla')} 60 CC · ${wrIc('qua')} 150 CC je Einheit.</p>
  </div>`;
}
async function wrTransmute(type) {
  if (_wrBusy) return;
  const amt = type === 'plasmoid' ? wrPlasmoid(_wrMember) : wrQuantum(_wrMember);
  if (amt < 1) return;
  _wrBusy = true;
  try {
    const res = await DB.spaceTransmute(_wrMember.id, type, amt);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    const rm = wrResMeta(type);
    wrToast(`⚗️ ${wrFmt(res.amount)} ${rm.icon} → ${wrFmt(res.cc)} CC`, 'success');
    wrChat(`⚗️ ${_wrEsc(_wrMember.name)} hat ${wrFmt(res.amount)} ${rm.name} zu ${wrFmt(res.cc)} CC transmutiert.`);
    try {
      await DB.appendTodayLogFresh(_wrMember.id, [{ label: '⚗️ Transmuter', amount: res.cc,
        cat: 'weltraum', detail: rm.name, aggKey: 'transmute', aggBase: '⚗️ Transmuter' }]);
    } catch (e) {}
    wrRender();
  } catch (e) {
    wrToast('Transmutation fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrBuyTech(key) {
  const t = SPACE_TECH_BY_KEY[key];
  if (_wrBusy || !t || !t.live) return;
  _wrBusy = true;
  try {
    const res = await DB.buySpaceTech(_wrMember.id, key);
    if (!res || res.error) { wrToast(wrErrText(res.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    wrToast(`🔬 ${t.name} erforscht — ${t.wirkung}`, 'success');
    // JP 2026-07-22: Kosten gehören mit in die Meldung (wie beim Werft-Bau)
    const kost = [`${wrFmt(t.cc)} CC`];
    if (t.erz > 0)      kost.push(`${wrFmt(t.erz)} ${wrArtTok('erz')}`);
    if (t.kristall > 0) kost.push(`${wrFmt(t.kristall)} ${wrArtTok('kristall')}`);
    // KEIN **Markdown** — der Chat rendert das nicht (JP sah die rohen Sterne).
    // Das Technik-Icon kommt als [[s:art]]-Token (Präfix-Erkennung in _chatArt).
    wrChat(`🔬 ${_wrEsc(_wrMember.name)} hat ${wrArtTok(t.art)} ${_wrEsc(t.name)} erforscht (${_wrEsc(t.wirkung)}) — ${kost.join(' · ')}.`);
    wrRender();
  } catch (e) {
    wrToast('Forschung fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ── 🏭 Raffinerie (Plan 2026-07-26 §3): Erz + Kristall → CC im Batch ──────────
// Stufe = höchste besessene Ast-d-Forschung. WR_REFINE SPIEGELT _space_refine_def()
// (SQL 26a) — bei Änderung BEIDE Seiten + scratchpad/test_raffinerie.js. Kurse liegen
// über dem Clan-Handelsboden (25/60). Zeitbasiert, Auto-Claim beim Tab-Öffnen.
// 26o: 🟣 ab Stufe 3, 🌀 ab Stufe 4 verwertbar (JP 2026-07-29: „Leveln und dann kann man
// das auch verwerten, falls man es mal über hat"). capPla/capQua = 0 heisst gesperrt —
// die Sperre braucht keinen Sonderfall, LEAST klemmt server- wie clientseitig auf 0.
const WR_REFINE = [
  null,
  { capErz: 40,  capKri: 15,  hours: 6,   rErz: 32, rKri: 80,  capPla: 0,  capQua: 0,  ratePla: 0,   rateQua: 0   },
  { capErz: 80,  capKri: 30,  hours: 5,   rErz: 34, rKri: 84,  capPla: 0,  capQua: 0,  ratePla: 0,   rateQua: 0   },
  { capErz: 140, capKri: 55,  hours: 4,   rErz: 36, rKri: 88,  capPla: 20, capQua: 0,  ratePla: 150, rateQua: 0   },
  { capErz: 240, capKri: 100, hours: 3,   rErz: 38, rKri: 92,  capPla: 35, capQua: 12, ratePla: 170, rateQua: 280 },
  { capErz: 400, capKri: 160, hours: 2,   rErz: 42, rKri: 100, capPla: 50, capQua: 25, ratePla: 190, rateQua: 340 },
  // Stufe 6: wt_e13 Plasma-Raffinerie
  { capErz: 600, capKri: 260, hours: 1.5, rErz: 46, rKri: 110, capPla: 80, capQua: 40, ratePla: 210, rateQua: 400 },
];
function wrRefineTier(m) {
  if (wrHasTech(m, 'wt_e13')) return 6;
  for (let i = 5; i >= 1; i--) if (wrHasTech(m, 'wt_d' + i)) return i;
  return 0;
}
let _wrRefErz = 0, _wrRefKri = 0, _wrRefPla = 0, _wrRefQua = 0;
function wrRefineRemaining(readyAt) {
  const t = new Date(readyAt).getTime() - Date.now();
  if (!(t > 0)) return 'fertig';
  const h = Math.floor(t / 3600000), min = Math.round((t % 3600000) / 60000);
  return h > 0 ? `${h} h ${min} min` : `${min} min`;
}

// Portrait als Zoom-Ziel statt des kleinen Icons im Titel (JP 2026-07-29: „das Raffinerie
// Bild soll zoombar sein und das html icon raus"). Gleiches Muster wie Raumhafen/Station:
// eigenes Klick-Ziel, damit kein verschachtelter Button entsteht.
function wrRefineArt() {
  return `<span class="wr-refine-art wr-ship-zoom" data-wr-rinfo="1" title="Groß ansehen">`
       + `<img src="assets/space/base_raffinerie.png" alt=""`
       + ` onerror="this.parentNode.classList.add('wr-art-fail');this.remove()">`
       + `<span class="wr-refine-fb">🏭</span><span class="wr-zoom-hint">🔍</span></span>`;
}
function wrRefineLightbox() {
  const m = _wrMember;
  const tier = wrRefineTier(m);
  const def = WR_REFINE[Math.max(1, tier)];
  wrArtLightbox('base_raffinerie', '🏭', 'Raffinerie',
    'Erz und Koffeinkristall werden im Batch zu CoffeeCoins veredelt: beladen, warten, abholen. '
  + 'Jede Ausbaustufe im Ast 🏭 Raffinerie & Logistik erhöht Chargengröße, Tempo und Kurs.', [
    ['🔬 Stufe', tier < 1 ? 'nicht erforscht' : `${tier} von 6`],
    [`${wrIc('time')} Laufzeit`, tier < 1 ? '—' : `${def.hours} h je Charge`],
    ['💰 Kurs', tier < 1 ? '—' : `${def.rErz} CC/🪨 · ${def.rKri} CC/💎`],
    ['📦 Charge max', tier < 1 ? '—' : `${wrFmt(def.capErz)} 🪨 / ${wrFmt(def.capKri)} 💎`],
    // 26o: die Ring-Rohstoffe als eigene Zeile — sonst fällt gar nicht auf, dass eine
    // höhere Stufe sie freischaltet.
    ['🟣🌀 Ring-Rohstoffe', tier < 1 ? '—'
      : [def.ratePla ? `${def.ratePla} CC/🟣 (max ${wrFmt(def.capPla)})` : '🟣 ab Stufe 3',
         def.rateQua ? `${def.rateQua} CC/🌀 (max ${wrFmt(def.capQua)})` : '🌀 ab Stufe 4'].join(' · ')],
  ]);
}

function wrRaffinerieHtml(m) {
  const tier = wrRefineTier(m);
  if (tier < 1) {
    return `<div class="wr-card wr-refine">
      <div class="wr-card-title">🏭 Raffinerie <span class="wr-sub">— Rohstoffe zu CC veredeln</span></div>
      <div class="wr-refine-head">
        ${wrRefineArt()}
        <p class="wr-sub">🔒 Erforsche zuerst <strong>Raffinerie</strong> (Forschung → Ast 🏭 Raffinerie &amp; Logistik). Jede weitere Ausbaustufe erhöht Menge, Tempo und Kurs.</p>
      </div>
    </div>`;
  }
  const def = WR_REFINE[tier];
  const r = wrSpace(m).refinery;
  let body;
  if (r && Object.keys(r).length) {
    const ready = new Date(r.readyAt).getTime() <= Date.now();
    // 26o: die Charge kann jetzt vier Rohstoffe enthalten. Nur zeigen, was drin ist —
    // „0 🟣" in jeder Charge wäre Rauschen.
    const inhalt = [`${wrFmt(r.erz)} 🪨`, `${wrFmt(r.kristall)} 💎`]
      .concat((r.plasmoid || 0) > 0 ? [`${wrFmt(r.plasmoid)} 🟣`] : [])
      .concat((r.quantum  || 0) > 0 ? [`${wrFmt(r.quantum)} 🌀`]  : []).join(' · ');
    body = ready
      ? `<div class="wr-refine-done">
           <div class="wr-ok">✅ Charge fertig — <strong>${wrFmt(r.cc)} CC</strong> aus ${inhalt}</div>
           <button class="wr-btn wr-btn-go" id="wr-refine-claim">CC abholen</button>
         </div>`
      : `<div class="wr-refine-run">
           <div>⚙️ Läuft — <strong>${wrFmt(r.cc)} CC</strong> in <strong>${wrRefineRemaining(r.readyAt)}</strong></div>
           <div class="wr-sub">verarbeitet ${inhalt}</div>
         </div>`;
  } else {
    const maxE = Math.min(def.capErz, wrErz(m));
    const maxK = Math.min(def.capKri, wrKristall(m));
    // 26o: bei gesperrter Stufe ist capPla/capQua = 0 → maxP/maxQ = 0 → die Auswahl kann
    // gar nicht hochgezählt werden. Genau dieselbe Klemmung rechnet refine_start.
    const maxP = Math.min(def.capPla || 0, wrPlasmoid(m));
    const maxQ = Math.min(def.capQua || 0, wrQuantum(m));
    _wrRefErz = Math.max(0, Math.min(_wrRefErz, maxE));
    _wrRefKri = Math.max(0, Math.min(_wrRefKri, maxK));
    _wrRefPla = Math.max(0, Math.min(_wrRefPla, maxP));
    _wrRefQua = Math.max(0, Math.min(_wrRefQua, maxQ));
    const cc = Math.round(_wrRefErz * def.rErz + _wrRefKri * def.rKri
                        + _wrRefPla * (def.ratePla || 0) + _wrRefQua * (def.rateQua || 0));
    const canStart = (_wrRefErz + _wrRefKri + _wrRefPla + _wrRefQua) > 0;
    body = `
      <div class="wr-refine-row">
        <span>🪨 Erz <strong>${wrFmt(_wrRefErz)}</strong> <span class="wr-sub">/ ${wrFmt(maxE)}</span></span>
        <span class="wr-refine-adj">
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:-10" ${_wrRefErz <= 0 ? 'disabled' : ''}>−10</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:10" ${_wrRefErz >= maxE ? 'disabled' : ''}>+10</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:max" ${_wrRefErz >= maxE ? 'disabled' : ''}>Max</button>
        </span>
      </div>
      <div class="wr-refine-row">
        <span>💎 Kristall <strong>${wrFmt(_wrRefKri)}</strong> <span class="wr-sub">/ ${wrFmt(maxK)}</span></span>
        <span class="wr-refine-adj">
          <button class="wr-btn wr-btn-sm" data-wr-refadj="kri:-5" ${_wrRefKri <= 0 ? 'disabled' : ''}>−5</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="kri:5" ${_wrRefKri >= maxK ? 'disabled' : ''}>+5</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="kri:max" ${_wrRefKri >= maxK ? 'disabled' : ''}>Max</button>
        </span>
      </div>
      ${(() => {
        // 🟣🌀 26o: Ring-Rohstoffe verwerten. Die Zeile erscheint erst, wenn die Stufe sie
        // freigibt (capPla/capQua > 0) — vorher steht stattdessen EIN Hinweis, ab welcher
        // Stufe es losgeht. Ohne den Hinweis wäre nicht erkennbar, dass es das Feature gibt.
        const gesperrt = [];
        if (def.capPla <= 0) gesperrt.push('🟣 ab Stufe 3');
        if (def.capQua <= 0) gesperrt.push('🌀 ab Stufe 4');
        const zeile = (ic, name, val, max, key, step) => `
          <div class="wr-refine-row">
            <span>${ic} ${name} <strong>${wrFmt(val)}</strong> <span class="wr-sub">/ ${wrFmt(max)}</span></span>
            <span class="wr-refine-adj">
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:-${step}" ${val <= 0 ? 'disabled' : ''}>−${step}</button>
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:${step}" ${val >= max ? 'disabled' : ''}>+${step}</button>
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:max" ${val >= max ? 'disabled' : ''}>Max</button>
            </span>
          </div>`;
        return (def.capPla > 0 ? zeile('🟣', 'Plasmoid', _wrRefPla, maxP, 'pla', 5) : '')
             + (def.capQua > 0 ? zeile('🌀', 'Quantenschaum', _wrRefQua, maxQ, 'qua', 2) : '')
             + (gesperrt.length ? `<p class="wr-sub" style="margin:2px 0 0">🔒 Ring-Rohstoffe verwerten: ${gesperrt.join(' · ')} (Ast 🏭 weiter ausbauen)</p>` : '');
      })()}
      <div class="wr-refine-sum">
        <span>Ertrag: <strong>${wrFmt(cc)} CC</strong> in ${def.hours} h</span>
        <button class="wr-btn wr-btn-go" id="wr-refine-start" ${canStart ? '' : 'disabled'}>Verarbeiten starten</button>
      </div>
      <p class="wr-sub" style="margin:4px 0 0">Stufe ${tier} · Kurs ${def.rErz} CC/🪨 · ${def.rKri} CC/💎${
        def.ratePla ? ` · ${def.ratePla} CC/🟣` : ''}${def.rateQua ? ` · ${def.rateQua} CC/🌀` : ''
        } · max ${wrFmt(def.capErz)} 🪨 / ${wrFmt(def.capKri)} 💎${
        def.capPla ? ` / ${wrFmt(def.capPla)} 🟣` : ''}${def.capQua ? ` / ${wrFmt(def.capQua)} 🌀` : ''} je Charge</p>`;
  }
  return `<div class="wr-card wr-refine">
    <div class="wr-card-title">🏭 Raffinerie <span class="wr-sub">— Rohstoffe zu CC (Stufe ${tier})</span></div>
    <div class="wr-refine-head">${wrRefineArt()}<div class="wr-refine-body">${body}</div></div>
  </div>`;
}

async function wrRefineStart() {
  if (_wrBusy) return;
  if ((_wrRefErz + _wrRefKri + _wrRefPla + _wrRefQua) <= 0) return;
  _wrBusy = true;
  try {
    const res = await DB.refineStart(_wrMember.id, _wrRefErz, _wrRefKri, _wrRefPla, _wrRefQua);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    _wrRefErz = 0; _wrRefKri = 0; _wrRefPla = 0; _wrRefQua = 0;
    wrToast(`🏭 Verarbeitung gestartet — ${wrFmt(res.cc)} CC in ${res.hours} h.`, 'success');
    wrRender();
  } catch (e) {
    wrToast('Start fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrRefineClaim() {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.refineClaim(_wrMember.id);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    if ((res.cc || 0) > 0) {
      wrToast(`🏭 +${wrFmt(res.cc)} CC aus der Raffinerie`, 'success');
      wrChat(`🏭 ${_wrEsc(_wrMember.name)} hat in der Raffinerie ${wrFmt(res.cc)} CC veredelt.`);
      try {
        await DB.appendTodayLogFresh(_wrMember.id, [{ label: '🏭 Raffinerie', amount: res.cc,
          cat: 'weltraum', detail: 'Rohstoff-Veredelung', aggKey: 'refine', aggBase: '🏭 Raffinerie' }]);
      } catch (e) {}
    }
    wrRender();
  } catch (e) {
    wrToast('Abholen fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Auto-Claim beim Tab-Öffnen (analog wrAutoHarvest) — still, nur Toast wenn etwas kam.
async function wrAutoRefineClaim() {
  const r = wrSpace(_wrMember).refinery;
  if (!r || !Object.keys(r).length) return;
  if (new Date(r.readyAt).getTime() > Date.now()) return;
  try {
    const res = await DB.refineClaim(_wrMember.id);
    if (!res || res.error) return;
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins === 'number') wrApplyCoins(res.coins);
    if ((res.cc || 0) > 0) {
      wrToast(`🏭 Raffinerie fertig: +${wrFmt(res.cc)} CC`, 'success');
      try {
        await DB.appendTodayLogFresh(_wrMember.id, [{ label: '🏭 Raffinerie', amount: res.cc,
          cat: 'weltraum', detail: 'Rohstoff-Veredelung', aggKey: 'refine', aggBase: '🏭 Raffinerie' }]);
      } catch (e) {}
    }
  } catch (e) { /* Auto-Claim darf das Laden nie blockieren */ }
}

// ── Planeten-Detail (Auswahl) ────────────────────────────────────────────────
function wrDetailHtml(m) {
  // Ohne Auswahl gleich den Hafen zeigen — ein leeres Panel hilft niemandem.
  if (!_wrSel || _wrSel.home) return wrHomeDetailHtml(m);
  // Nebel-Quadrant → nur Aufklärung anbieten
  if (_wrSel.fog) {
    const q = _wrSel.q;
    const canScout = wrScoutable(q);
    const sel      = wrSyncFleetSel(m);
    const sonden   = sel.sonde || 0;
    const nAway    = wrTrips(m).length;
    const busy     = nAway >= 5;
    const min = q.ring * SPACE_MIN_PER_RING;
    // 🛩️ 26m: das Ring-Gate gilt für JEDEN Start, auch für die Aufklärung — wer der
    // Sonde Jäger als Geleit mitgibt, läuft sonst hier in den Serverfehler.
    const gate = wrCarrierGap(sel, q.ring);
    return `
      <div class="wr-detail">
        <div class="wr-card-title">🌫️ Unerforschter Quadrant <span class="wr-sub">${_wrEsc(q.key)} · Ring ${q.ring}</span></div>
        <p class="wr-p">Hinter dem Nebel liegen 8 Planeten. Schick eine 🛰️ Bohnen-Sonde, um den Quadranten
           für den <strong>gesamten Klan</strong> aufzudecken. Gib ihr Geleitschutz mit — draußen ist
           nicht jeder Nebel leer.</p>
        <div class="wr-facts">
          <span>Flugzeit: ${wrTravelHtml(min)} je Strecke${nAway > 0 ? ` <span class="wr-sub">+${wrFleetGap(m) * nAway} min (${nAway} unterwegs)</span>` : ''}</span>
          <span>Sonden im Hafen: <strong>${wrShipCount(m, 'sonde')}</strong></span>
        </div>
        ${busy ? '' : wrFleetPickerHtml(m)}
        ${busy ? '' : wrAmbushHint(q.ring, wrFleetPower(sel), wrTurretPower(m))}
        ${!canScout ? '<div class="wr-warn">Zu weit draußen — erkunde zuerst einen angrenzenden Quadranten weiter innen.</div>' : ''}
        ${busy
          ? '<div class="wr-warn">Maximal 5 Flotten gleichzeitig unterwegs — warte, bis eine zurückkehrt.</div>'
          : (canScout && sonden < 1 ? '<div class="wr-warn">Für die Aufklärung muss mindestens eine 🛰️ Bohnen-Sonde im Verband sein.</div>' : '')}
        <button class="wr-btn wr-btn-go" data-wr-send="scout" ${(!canScout || sonden < 1 || busy || gate.blocked) ? 'disabled' : ''}>
          🛰️ Verband entsenden</button>
      </div>`;
  }

  const p = _wrSel.planet;
  if (!p) return '<div class="wr-detail wr-detail-empty">Wähle einen Planeten.</div>';
  const cleared = !!p.cleared_by;
  const mine    = p.cleared_by === m?.id;
  const colon   = !!p.colonized_by;
  const resMeta = wrResMeta(p.resource_type);
  const resIcon = resMeta.icon;
  const resName = resMeta.name;
  const resGated = !wrResMinable(m, p.resource_type);   // Ring-Rohstoff ohne Abbau-Tech
  const min     = p.ring * SPACE_MIN_PER_RING;
  const nAway    = wrTrips(m).length;
  const busy    = nAway >= 5;

  // ⚠️ Vorschau IMMER aus dem gewählten Verband rechnen, nicht aus der Heimatflotte —
  // sonst verspricht die Anzeige eine Kampfkraft, die gar nicht mitfliegt.
  const sel     = wrSyncFleetSel(m);
  const power   = wrFleetPower(sel);
  const mineCap = wrFleetMine(sel);
  const jaeger  = power;
  const ernter  = mineCap;
  const kolo    = sel.kolonie || 0;

  // Verlust-Vorschau mit der SERVER-Formel (reine Anzeige — gerechnet wird drüben).
  // Seit 21j laufen Rollen mit: wrBattlePreview spiegelt claim_space_arrival exakt.
  const bp      = wrBattlePreview(sel, p);
  const lossPct = cleared ? 0 : bp.loss;
  // 🛩️ 26m Ring-Gate: sperrt ALLE drei Aktionen (Angriff, Abbau, Kolonisieren) — sie
  // laufen alle über start_space_trip, und die Prüfung sitzt dort vor dem Treibstoff.
  // Die Begründung steht im Picker (wrFleetPickerHtml), damit sie am Regler klebt.
  const gate    = wrCarrierGap(sel, p.ring);

  return `
    <div class="wr-detail">
      <div class="wr-planet-head">
        ${wrFoeArt(wrFoeFor(p), 'wr-foe wr-foe-lg')}
        <div>
          <div class="wr-card-title">${resIcon} ${_wrEsc(p.name)}
            <span class="wr-sub">Quadrant ${_wrEsc(p.quadrant)} · Ring ${p.ring}</span></div>
          <div class="wr-sub">${cleared
            ? (wrWreckLeft(p) > 0
                ? `${wrIc("wreck")} Wrackfeld: <strong>${wrFmt(wrWreckLeft(p))}</strong> Einheiten bergbar`
                : `${wrIc("wreck")} Das Wrackfeld ist vollständig abgetragen.`)
            : `${wrFoeFor(p).name} · Stärke ${wrFmt(p.enemy_strength)}`}</div>
        </div>
      </div>
      <div class="wr-facts">
        <span>Vorkommen: <strong>${resName}</strong></span>
        <span>Reichtum: <strong>${'★'.repeat(p.richness)}${'☆'.repeat(Math.max(0, 5 - p.richness))}</strong></span>
        <span>Flugzeit: ${wrTravelHtml(min)} je Strecke</span>
        <span>Wächter: <strong>${cleared ? '— befreit' : wrFmt(p.enemy_strength)}</strong></span>
      </div>
      ${cleared
        ? `<div class="wr-ok">✅ Befreit${mine ? ' — von dir' : ''}${colon ? ' · ' + wrIc("colony") + ' bereits kolonisiert' : ''}${
             wrDefLevel(p) ? ` · 🛡️ Geschütze Stufe ${wrDefLevel(p)}` : ''}${wrIsStation(p) ? ' · 📡 Station' : ''}</div>
           ${wrFallbackHtml(p, m)}`
        : `<div class="wr-facts wr-facts-fight">
             <span>Kampfkraft des Verbands: <strong>${wrFmt(power)}</strong>${
               Math.round(bp.eff) !== Math.round(power)
                 ? ` <span class="${bp.eff > power ? 'wr-good' : 'wr-bad'}">→ ${wrFmt(Math.round(bp.eff))} gegen diesen Verband</span>`
                 : ''}</span>
             <span>Gegner: <strong>${wrFmt(Math.round(bp.foe))}</strong> effektiv${
               Math.round(bp.foe) !== Math.round(p.enemy_strength) ? ` (roh ${wrFmt(p.enemy_strength)})` : ''}</span>
             <span>Erwartete Verluste: <strong>${Math.round(lossPct * 100)} %</strong> der Flotte${
               bp.shield > 0 ? ` <span class="wr-good">(Schild −${Math.round(bp.shield * 100)} %)</span>` : ''}</span>
             <span class="${bp.win ? 'wr-good' : 'wr-bad'}">
               ${bp.win ? '→ Sieg wahrscheinlich' : '→ zu schwach, du verlierst Schiffe ohne Erfolg'}</span>
           </div>
           ${wrFoeCompHtml(p)}`}
      ${busy ? '' : wrFleetPickerHtml(m)}
      ${/* 26h: Geschütze des Ziels decken den Anflug mit — exakt wie in claim_space_arrival
            ((Hafen + Planeten-Deckung) × Tech-Faktor), sonst verspricht die Vorschau zu wenig. */''}
      ${busy ? '' : wrAmbushHint(p.ring, power, wrTurretPower(m) + wrPlanetCover(p, m) * wrTechTurret(m))}
      <div class="wr-actions">
        ${!cleared ? `<button class="wr-btn wr-btn-go" data-wr-send="attack" ${(busy || jaeger < 1 || gate.blocked) ? 'disabled' : ''}>
            ⚔️ Angreifen <span class="wr-btn-sub">⚔️ ${wrFmt(power)} Kampfkraft</span></button>` : ''}
        ${cleared ? `<button class="wr-btn" data-wr-send="harvest" ${(busy || ernter < 1 || gate.blocked) ? 'disabled' : ''}>
            ${wrIc("mine")} Abbauen <span class="wr-btn-sub">${resGated ? '🔒 Abbau-Tech fehlt' : `≈ ${wrFmt(Math.round(ernter * p.richness * resMeta.mine))} ${resIcon}`}</span></button>` : ''}
        ${cleared && !colon ? `<button class="wr-btn" data-wr-send="colonize" ${(busy || kolo < 1 || gate.blocked) ? 'disabled' : ''}>
            🛸 Kolonisieren <span class="wr-btn-sub">Schiff bleibt dort · dauerhaft ~${wrFmt(Math.round(p.richness * 3 * resMeta.mine))} ${resIcon}/Tag</span></button>` : ''}
      </div>
      ${cleared ? wrPlanetDefHtml(m, p) : ''}
      ${resGated && cleared ? `<div class="wr-warn">🔒 ${resName} lässt sich erst mit der Forschung <strong>${p.resource_type === 'plasmoid' ? 'Plasmoid-Kollektor' : 'Quantenschaum-Extraktor'}</strong> abbauen — bis dahin wirft dieser Planet nichts ab.</div>` : ''}
      ${cleared ? wrRoutePanelHtml(m, p) : ''}
      ${/* ⚠️ Bei laufender Reise NUR diesen Hinweis zeigen. Vorher lief der Verband-Picker
            weiter, klemmte die Auswahl auf den (jetzt leeren) Hafen und meldete deshalb
            „⚔️ 0" plus „Nimm kampffähige Schiffe mit" — direkt nach dem Aussenden, also
            genau dann, wenn alles richtig gemacht wurde. */ ''}
      ${busy
        ? '<div class="wr-warn">Maximal 5 Flotten gleichzeitig unterwegs — warte, bis eine zurückkehrt.</div>'
        : `${nAway > 0 ? `<div class="wr-sub">✈️ ${nAway} unterwegs — diese Flotte fliegt +${wrFleetGap(m) * nAway} min länger.</div>` : ''}
           ${!cleared && jaeger < 1 ? '<div class="wr-warn">Nimm kampffähige Schiffe in den Verband — ohne Kampfkraft kein Angriff.</div>' : ''}
           ${cleared && ernter < 1 ? `<div class="wr-warn">Für einen EINMAL-Flug „🔨 Abbauen" müssen Röstkometen im Verband sein.${
             wrRouteBound(m, 'ernter') > 0
               ? ` Deine ${wrFmt(wrRouteBound(m, 'ernter'))} Röstkometen sind auf 🛰️ Dauerernte-Routen gebunden — Route verkleinern/auflösen oder neue in der Werft bauen.`
               : ''}</div>` : ''}`}
    </div>`;
}

// Portrait der Quadranten-Station (assets/space/base_station.png, JP 2026-07-27).
// Klickbar wie alle anderen Portraits — Emoji-Rückfall, falls das Bild fehlt.
function wrStationArt() {
  return `<span class="wr-station-art" data-wr-sinfo="1" title="Groß ansehen">`
       + `<img src="assets/space/base_station.png" alt=""`
       + ` onerror="this.parentNode.classList.add('wr-art-fail');this.remove()">`
       + `<span class="wr-station-fb">📡</span></span>`;
}
// Zoom auf einen Forschungs-Ast (JP 2026-07-27: „und man soll es auch zoomen können").
// Zeigt das Ast-Portrait groß plus den Fortschritt in diesem Ast.
// ⚠️ Nur noch vier Äste (JP 2026-07-29, s. SPACE_TECH_ASTE): die früheren 🟣/🌀-Äste sind
// aufgelöst, ihre Techniken stehen hinten in A–D. Die Beschreibungen sagen das jetzt auch —
// sonst wirkt es wie ein Zufall, dass ab der Mitte plötzlich 🟣/🌀 im Preis stehen.
const WR_AST_DESC = {
  a: 'Antrieb und Rumpf: kürzere Flugzeiten, schnellere und günstigere Werft. '
   + 'Ab der Mitte des Astes kommen Plasmoid- und Quanten-Antriebe dazu — Sprungtore, '
   + 'Faltraum-Anker und die Sensorik der ganzen Galaxie.',
  b: 'Bewaffnung: Feuerkraft der Geschütze, Kampfkraft der Flotte, weniger Verluste und Hinterhalte. '
   + 'Oben im Ast stehen die schweren Geschütze aus 🟣 Plasmoid und 🌀 Quantenschaum sowie '
   + 'die Planeten-Verteidigung.',
  c: 'Schürftechnik: mehr Ausbeute beim Abbau, ergiebigere Dauerernte, sparsamerer Treibstoff. '
   + 'Hier liegen auch die beiden Schlüssel-Techniken, die 🟣 Plasmoiden- und '
   + '🌀 Quantenschaum-Abbau überhaupt erst freischalten.',
  d: 'Raffinerie und Logistik: billigere Rohstoffkosten, bessere Bergung, längere Ertrags-Ansammlung. '
   + 'Weiter oben verwertet die Raffinerie auch 🟣 und 🌀, und der Transmuter macht Ring-Rohstoffe zu CC.',
};
function wrAstLightbox(key) {
  const a = SPACE_TECH_ASTE.find(x => x.key === key);
  if (!a) return;
  const alle = SPACE_TECH.filter(t => t.ast === key);
  const hat  = alle.filter(t => wrHasTech(_wrMember, t.key)).length;
  wrArtLightbox(a.art, a.icon, a.name, WR_AST_DESC[key] || '', [
    ['🔬 Erforscht', `${hat} von ${alle.length}`],
    ['📦 Status', a.live ? 'freigeschaltet' : 'in Vorbereitung'],
  ]);
}
function wrStationLightbox() {
  const c = WR_STATION;
  wrArtLightbox('base_station', '📡 ', 'Quadranten-Station',
    'Ein ausgebauter Geschütz-Planet wird zum Kommandoposten des ganzen Quadranten. '
  + 'Die Station hält alle befreiten Planeten im selben Quadranten dauerhaft in Clan-Hand — '
  + 'auch die deiner Mitspieler — und deckt anfliegende Verbände mit halber Feuerkraft.', [
    ['🔬 Freischaltung', `${_wrEsc(wrTechName('wt_f7'))}<br><span class="wr-sub">${_wrEsc(wrTechRef('wt_f7'))}</span>`],
    ['🛡️ Voraussetzung', 'Planeten-Geschütze Stufe 3'],
    ['💰 Kosten', `${wrFmt(c.cc)} CC · ${c.erz} 🪨 · ${c.kristall} 💎 · ${c.plasmoid} 🟣 · ${c.quantum} 🌀`],
    ['📡 Reichweite', 'ganzer Quadrant, eine Station je Quadrant'],
  ]);
}

// 🏙️ Die drei Geschütz-Bauplätze einer Kolonie (26l). Bewusst dasselbe Muster wie
// wrHafenHtml — JP: „genau gleich wie der Raumhafen soll man ihn ausbauen können".
// Unterschiede: nur 3 Slots, Preise ×1,5, und `minPort` gilt NICHT (eine Kolonie hat
// keinen Hafenausbau — die einzige Schranke ist die Forschung).
function wrPlanetSlotsHtml(m, p) {
  const tur   = wrPlanetTurrets(p);
  const coins = parseFloat(m?.coins) || 0;
  const canPay = (c) => c && coins >= c.cc && wrErz(m) >= c.erz
                     && wrKristall(m) >= c.kristall && wrPlasmoid(m) >= (c.plasmoid || 0);
  const priceTxt = (c) => [`${wrFmt(c.cc)} CC`]
    .concat(c.erz ? [`${c.erz} 🪨`] : []).concat(c.kristall ? [`${c.kristall} 💎`] : [])
    .concat(c.plasmoid ? [`${c.plasmoid} 🟣`] : []).join(' · ');

  let out = '';
  for (let i = 0; i < WR_PLANET_SLOTS; i++) {
    const key = 'g' + i;
    const cur = tur[key];
    if (cur && typeof cur === 'object' && SPACE_TURRET_BY_KEY[cur.type]) {
      const t   = SPACE_TURRET_BY_KEY[cur.type];
      const clv = Math.max(1, Math.min(WR_TURRET_MAX, parseInt(cur.level, 10) || 1));
      const st  = wrPturretStats(cur.type, clv);
      const up  = clv < WR_TURRET_MAX ? wrPturretStats(cur.type, clv + 1) : null;
      const ziele = SPACE_TURRETS.filter(z => z.atk > t.atk && wrTurretUnlocked(m, z.key));
      out += `
        <div class="wr-pslot wr-pslot-full">
          <span class="wr-pslot-art wr-ship-zoom" data-wr-tinfo="${t.key}" title="Groß ansehen">
            ${wrTurretImg(t)}
              <span class="wr-pslot-fb">${t.icon}</span></span>
          <span class="wr-pslot-txt"><strong>${_wrEsc(t.name)}</strong>
            <span class="wr-sub">Stufe ${clv} · 🛡️ ${wrFmt(st.atk)}</span></span>
          <span class="wr-pslot-act">
            ${up ? `<button class="wr-btn wr-btn-sm" data-wr-pturret="${p.id}:turret_upgrade:${key}:"
                      ${canPay(up) ? '' : 'disabled'}>Aufrüsten
                      <span class="wr-btn-sub">${priceTxt(up)} → 🛡️ ${wrFmt(up.atk)}</span></button>`
                 : '<span class="wr-slot-max">✅ Vollausbau</span>'}
            ${ziele.map(z => {
              const pr = wrPturretConvertPrice(t.key, clv, z.key);
              return wrConvBtnHtml(`${p.id}:turret_convert:${key}:${z.key}`, 'data-wr-pturret',
                                   z, pr, canPay(pr), priceTxt(pr));
            }).join('')}
          </span>
        </div>`;
    } else {
      const opts = SPACE_TURRETS.map(t => {
        const st   = wrPturretStats(t.key, 1);
        const frei = wrTurretUnlocked(m, t.key);
        return `
          <div class="wr-slot-opt${frei ? '' : ' wr-slot-opt-lock'}">
            <span class="wr-slot-opt-art wr-ship-zoom" data-wr-tinfo="${t.key}" title="Groß ansehen">
              ${wrTurretImg(t)}
                <span class="wr-slot-opt-fb">${t.icon}</span><span class="wr-zoom-hint">🔍</span></span>
            <span class="wr-slot-opt-txt">
              <span class="wr-slot-opt-n">${_wrEsc(t.name)}</span>
              <span class="wr-slot-opt-a">🛡️ ${wrFmt(st.atk)}</span>
              <span class="wr-slot-opt-p">${frei ? priceTxt(st)
                : `🔒 Forschung „${_wrEsc(wrTechName(t.needs))}"`}</span>
            </span>
            <button class="wr-btn wr-btn-sm" data-wr-pturret="${p.id}:turret_build:${key}:${t.key}"
              ${(frei && canPay(st)) ? '' : 'disabled'}>Bauen</button>
          </div>`;
      }).join('');
      out += `
        <div class="wr-pslot wr-pslot-empty">
          <div class="wr-slot-name">⬚ Freier Bauplatz ${i + 1}</div>
          <div class="wr-slot-opts">${opts}</div>
        </div>`;
    }
  }
  return `<div class="wr-pslots">${out}</div>`;
}

// ── 🛡️ Feature ④: Kolonie & Verteidigung im Planeten-Detail (26h) ───────────
// Erscheint NUR auf eigenen Kolonien. Die Kosten hier sind reine Anzeige —
// gerechnet und abgebucht wird in build_planet_defense (server-autoritativ).
function wrPlanetDefHtml(m, p) {
  if (!p || p.colonized_by !== m?.id) return '';
  const coins = parseFloat(m?.coins) || 0;
  const canPay = (c) => coins >= (c.cc || 0) && wrErz(m) >= (c.erz || 0)
    && wrKristall(m) >= (c.kristall || 0) && wrPlasmoid(m) >= (c.plasmoid || 0)
    && wrQuantum(m) >= (c.quantum || 0);
  const priceTxt = (c) => [`${wrFmt(c.cc)} CC`]
    .concat(c.erz ? [`${c.erz} 🪨`] : []).concat(c.kristall ? [`${c.kristall} 💎`] : [])
    .concat(c.plasmoid ? [`${c.plasmoid} ${wrIc('pla')}`] : [])
    .concat(c.quantum ? [`${c.quantum} ${wrIc('qua')}`] : [])
    .join(' · ');

  const clv  = wrColonyLevel(p);
  const dlv  = wrDefLevel(p);
  const cUp  = clv < 3 ? WR_COLONY_UP[clv + 1] : null;
  // ⚠️ `dUp` (nächste Pauschalstufe aus WR_PDEF) ist mit 26l ERSATZLOS ENTFALLEN —
  // die Geschütze sitzen jetzt auf einzelnen Bauplätzen (wrPlanetSlotsHtml).
  // `dlv` bleibt: es ist die Zahl der belegten Bauplätze und entscheidet weiterhin
  // über die Stations-Voraussetzung („3 von 3 belegt").
  const hasE10 = wrHasTech(m, 'wt_e10');
  const hasF7  = wrHasTech(m, 'wt_f7');
  const stationHere = wrIsStation(p);
  const stationQ    = wrQuadStation(p.quadrant);
  const resMeta = wrResMeta(p.resource_type);
  // Tagesertrag: gleiche Formel wie harvest_space (Reichtum × 3 × Stufe, Kristall/Ring halbiert).
  const yieldFor = (lv) => {
    const base = Math.round((p.richness || 1) * 3 * lv * wrTechColony(m));
    return p.resource_type === 'erz' ? base
         : p.resource_type === 'kristall' ? Math.round(base * 0.5)
         : p.resource_type === 'plasmoid' ? Math.round(base * 0.3) : Math.round(base * 0.2);
  };

  return `
    <div class="wr-pdef">
      <div class="wr-card-title">🏙️ Kolonie & Verteidigung
        <span class="wr-sub">Stufe ${clv} · ${dlv ? `🛡️ ${wrFmt(wrPlanetDef(p))} Feuerkraft` : 'ohne Geschütze'}${
          stationHere ? ' · 📡 Quadranten-Station' : ''}</span></div>

      <div class="wr-pdef-row">
        <div class="wr-pdef-lbl">🏙️ Kolonie-Ausbau <span class="wr-sub">Stufe ${clv} von 3</span></div>
        <div class="wr-pdef-val">${resMeta.icon} ${wrFmt(yieldFor(clv))}/Tag</div>
        ${cUp
          ? `<button class="wr-btn wr-btn-sm" data-wr-pbuild="${p.id}:colony_upgrade" ${canPay(cUp) ? '' : 'disabled'}
               >Auf Stufe ${cUp.level} ausbauen
               <span class="wr-btn-sub">${priceTxt(cUp)} → ${resMeta.icon} ${wrFmt(yieldFor(cUp.level))}/Tag</span></button>`
          : '<div class="wr-slot-max">✅ Vollausbau</div>'}
      </div>

      <div class="wr-pdef-row">
        <div class="wr-pdef-lbl">🛡️ Geschütz-Bauplätze
          <span class="wr-sub">${dlv} von ${WR_PLANET_SLOTS} belegt · Preise ×${String(WR_PTURRET_MULT).replace('.', ',')} (Transport)</span></div>
        <div class="wr-pdef-val">${dlv ? `🛡️ ${wrFmt(wrPlanetDef(p))}` : '—'}</div>
        ${!hasE10
          ? `<div class="wr-warn">🔒 Braucht die Forschung ${wrIc('pla')} <strong>${_wrEsc(wrTechName('wt_e10'))}</strong>
               <span class="wr-sub">(${_wrEsc(wrTechRef('wt_e10'))})</span>.</div>`
          : wrPlanetSlotsHtml(m, p)}
      </div>

      ${stationHere
        ? `<div class="wr-station-done">
             ${wrStationArt()}
             <div class="wr-ok">📡 <strong>Quadranten-Station aktiv</strong> — alle befreiten Planeten
               in ${_wrEsc(p.quadrant)} sind vor Rückeroberung geschützt, auch die deiner Clan-Mitglieder.</div>
           </div>`
        : `<div class="wr-pdef-row">
             <div class="wr-pdef-lbl">${wrStationArt()} Quadranten-Station <span class="wr-sub">schützt ${_wrEsc(p.quadrant)} komplett</span></div>
             <div class="wr-pdef-val">${stationQ ? '— vorhanden' : '—'}</div>
             ${stationQ
               ? `<div class="wr-sub">In diesem Quadranten steht bereits eine Station (${_wrEsc(stationQ.name)}).</div>`
               : !hasF7
                 ? `<div class="wr-warn">🔒 Braucht die Forschung ${wrIc('qua')} <strong>${_wrEsc(wrTechName('wt_f7'))}</strong>
                      <span class="wr-sub">(${_wrEsc(wrTechRef('wt_f7'))})</span>.</div>`
                 : dlv < 3
                   ? '<div class="wr-warn">🔒 Erst die Planeten-Geschütze auf Stufe 3 ausbauen.</div>'
                   : `<button class="wr-btn wr-btn-sm" data-wr-pbuild="${p.id}:station_build" ${canPay(WR_STATION) ? '' : 'disabled'}
                        >📡 Station errichten
                        <span class="wr-btn-sub">${priceTxt(WR_STATION)}</span></button>`}
           </div>`}

      <div class="wr-sub">Geschütze decken den Anflug auf diesen Planeten, schießen zu 50 %
        gegen Angriffswellen auf deinen Hafen mit — und halten den Planeten dauerhaft in deiner Hand.</div>
    </div>`;
}

// Rückfall-Warnung für befreite, aber ungeschützte Planeten (26h).
function wrFallbackHtml(p, m) {
  const at = wrFallbackAt(p, m);
  if (!at) return '';
  const left = at - Date.now();
  const own  = p.cleared_by === m?.id;
  return `<div class="${left < 86400000 ? 'wr-warn' : 'wr-sub'}">⏳ Ungeschützt —
    ${own ? 'dein Planet' : 'dieser Planet'} fällt in <strong>${wrCountdown(left)}</strong> an die Feinde zurück.
    Kolonie gründen, Geschütze bauen, eine Station im Quadranten errichten oder Schiffe
    stationieren hält ihn.</div>`;
}

// ── Kolonien ─────────────────────────────────────────────────────────────────
function wrColoniesHtml(m) {
  const cols = wrColonies(m);
  const keys = Object.keys(cols);
  if (!keys.length) return '';
  let pending = 0, rows = '';
  for (const id of keys) {
    const c = cols[id] || {};
    const days = Math.min(wrTechCapDays(m), Math.max(0, (Date.now() - Date.parse(c.lastHarvest || 0)) / 86400000));
    // ⚠️ Reihenfolge exakt wie in harvest_space: erst den Betrag runden, DANN den
    // Typfaktor anwenden und erneut runden. In einem Rutsch gerechnet weicht die
    // Vorschau um 1 ab (Test 7).
    // Zwei Abweichungen von der SQL, die hier lange unbemerkt drinsteckten und am
    // 29.07. behoben wurden: der Tech-Faktor (_space_tech_colony) fehlte ganz, und
    // 🟣/🌀-Kolonien wurden wie Kristall mit 0,5 gerechnet statt mit 0,3/0,2.
    const typ  = c.type || 'erz';
    const base = Math.round(days * (c.richness || 1) * 3 * (c.level || 1) * wrTechColony(m));
    const fak  = { erz: 1, kristall: 0.5, plasmoid: 0.3, quantum: 0.2 }[typ] ?? 1;
    const amt  = wrResMinable(m, typ) ? (fak === 1 ? base : Math.round(base * fak)) : 0;
    // 26n: Ring-Kolonien werfen zusätzlich Erz und Kristall ab — ohne Abbau-Gate.
    const side = (typ === 'plasmoid' || typ === 'quantum')
      ? { erz: Math.round(base * 0.5), kri: Math.round(base * 0.5 * 0.25) } : null;
    pending += amt + (side ? side.erz + side.kri : 0);
    // 26h: Geschütz-/Stationsstand kommt aus der Planetenzeile (die Kolonie-JSON kennt ihn nicht)
    const pl = wrPlanetById(id);
    const meta = wrResMeta(typ);
    // 26l: aufklappbar (JP: „die aufgeführten klickt man an, sie erweitern sich und zeigen
    // dann die Informationen, nicht dass man zu viel scrollen muss"). Immer nur EINE offen.
    const offen = _wrColOpen === id;
    // 📊 Zusammenfassung je Kolonie (JP 2026-07-29: „dort werden alle aufgeführt mit den
    // stats zusammengefasst (Abbau/Tag, Level, Stärke usw)"). Der fette Wert rechts war
    // der ANGESAMMELTE Ertrag — ohne Bezugsgrösse nicht deutbar. Jetzt steht die Rate
    // je Tag daneben; sie ist dieselbe Formel mit days = 1.
    const tagBase = Math.round((c.richness || 1) * 3 * (c.level || 1) * wrTechColony(m));
    const tagAmt  = wrResMinable(m, typ) ? (fak === 1 ? tagBase : Math.round(tagBase * fak)) : 0;
    const tagSide = (typ === 'plasmoid' || typ === 'quantum')
      ? { erz: Math.round(tagBase * 0.5), kri: Math.round(tagBase * 0.5 * 0.25) } : null;
    const proTag = [tagAmt > 0 ? `${wrFmt(tagAmt)} ${meta.icon}` : '']
      .concat(tagSide ? [`${wrFmt(tagSide.erz)} 🪨`, `${wrFmt(tagSide.kri)} 💎`] : [])
      .filter(Boolean).join(' · ');
    rows += `
      <div class="wr-col-item${offen ? ' wr-col-open' : ''}">
        <button type="button" class="wr-col-row" data-wr-coltoggle="${_wrEsc(id)}">
          <span class="wr-col-caret">${offen ? '▾' : '▸'}</span>
          <span>${meta.icon} ${_wrEsc(c.name || 'Kolonie')}
            <span class="wr-sub">Ring ${pl ? pl.ring : '?'}${pl ? ` · ${_wrEsc(pl.quadrant)}` : ''}</span></span>
          <span class="wr-sub">Stufe ${c.level || 1} · ${'★'.repeat(c.richness || 1)}${
            wrDefLevel(pl) ? ` · 🛡️ ${wrFmt(wrPlanetDef(pl))}` : ' · 🛡️ —'}${wrIsStation(pl) ? ' · 📡' : ''}
            <span class="wr-col-day">${proTag ? `📥 ${proTag} /Tag` : ''}${
              (!wrResMinable(m, typ) && tagAmt === 0) ? ` 🔒 ${meta.icon} braucht die Abbau-Technik` : ''}</span></span>
          <strong>+${wrFmt(amt + (side ? side.erz + side.kri : 0))}</strong>
        </button>
        ${offen && pl ? `<div class="wr-col-body">${wrPlanetDefHtml(m, pl)}</div>` : ''}
        ${offen && !pl ? '<div class="wr-col-body"><div class="wr-sub">Planetendaten noch nicht geladen.</div></div>' : ''}
      </div>`;
  }
  return `
    <div class="wr-card">
      <div class="wr-card-title">${wrIc("colony")} Kolonien <span class="wr-sub">Ertrag sammelt sich max. 14 Tage an</span></div>
      ${rows}
      <button class="wr-btn wr-btn-go" data-wr-harvest="1" ${pending < 1 ? 'disabled' : ''}>
        ${wrIc("yield")} Ertrag einsammeln${pending > 0 ? ` (${wrFmt(pending)})` : ''}</button>
    </div>`;
}

// ── Angriffswelle auf den eigenen Hafen ─────────────────────────────────────
// Der Vorlauf (30–60 Min) ist der Kern des Features: nur deshalb kann man reagieren,
// Geschütze nachrüsten oder die Gruppe um Hilfe bitten.
function wrWaveHtml(m) {
  const w = _wrWave;
  if (!w) return '';
  const now = Date.now(), arrive = Date.parse(w.arriveAt);
  const due = now >= arrive;
  const tier = wrWaveTier(w.strength);
  const turret = wrTurretPower(m);
  // ⚠️ MIRROR-FIX (26m): hier stand `wrFleetPower(...)` — die ROHE Summe. resolve_space_wave
  // rechnet aber `_space_eff_power(home, wLight, wHeavy, 0) * _space_tech_fleet(space)`.
  // Dadurch fehlten in der Anzeige seit 21j die Rollen-Modifikatoren, seit 26j der
  // Flaggschiff-Bonus und der Tech-Faktor — und mit 26m auch der Trägerbonus, obwohl
  // „+5 % auf die gesamte Flotte" genau hier sichtbar werden muss. Jetzt exakter Spiegel.
  const wSh    = WR_WAVE_SHARES[tier.key] || WR_WAVE_SHARES.schwarm;
  const fleet  = Math.round(wrEffPower(wrHomeShips(m), wSh.light, wSh.heavy, 0) * wrTechFleet(m));
  const help   = _wrHelp.filter(h => h.wave_id === w.id && !h.returned)
                        .reduce((a, h) => a + (parseFloat(h.power) || 0), 0);
  // 26h: die Planeten-Geschütze der eigenen Kolonien schießen zur Hälfte mit
  // (Spiegel von resolve_space_wave: _space_planet_defense_total × Tech × 0.5).
  const pdef   = wrPlanetWaveDef(m);
  const def    = turret + fleet + help + pdef;
  const ok     = def >= w.strength;
  const loss   = Math.round(Math.min(0.5, w.strength / Math.max(1, def + w.strength)) * 100);

  return `
    <div class="wr-wave ${ok ? 'wr-wave-ok' : 'wr-wave-danger'}">
      <div class="wr-wave-head">
        <span class="wr-wave-art"><img src="assets/space/${tier.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-wave-fb">${tier.icon}</span></span>
        <span class="wr-wave-title">${_wrEsc(tier.name)} auf deinen Raumhafen
          <span class="wr-sub">Stärke ${wrFmt(w.strength)}</span></span>
      </div>
      <div class="wr-wave-eta">${due
        ? '<strong>Die Welle ist da!</strong>'
        : `Einschlag in <strong id="wr-wave-eta">${wrCountdown(arrive - now)}</strong>`}</div>
      <div class="wr-facts">
        <span>${wrIc("def")} Geschütze: <strong>${wrFmt(turret)}</strong></span>
        <span>${wrIc("fleet")} Heimatflotte: <strong>${wrFmt(fleet)}</strong></span>
        ${help > 0 ? `<span>${wrIc("help")} Verstärkung: <strong>${wrFmt(help)}</strong></span>` : ''}
        ${pdef > 0 ? `<span>🛡️ Planeten-Geschütze: <strong>${wrFmt(pdef)}</strong></span>` : ''}
        <span>Σ Verteidigung: <strong>${wrFmt(def)}</strong></span>
      </div>
      ${wrHasTech(m, 'wt_e12')
        ? '<div class="wr-sub">📡 Frühwarn-Netz aktiv — du bekommst 30 Minuten mehr Vorlauf.</div>' : ''}
      <div class="${ok ? 'wr-good' : 'wr-bad'}">
        ${ok ? '→ Die Verteidigung sollte halten.'
             : `→ Zu schwach! Es fehlen ${wrFmt(w.strength - def)} Punkte.`}
        <span class="wr-sub"> Verluste ca. ${loss} % der Heimatflotte.</span>
      </div>
      <div class="wr-sub wr-wave-note">Eine Niederlage kostet dich <strong>keine</strong> Kolonien —
        aber ein Viertel deiner Rohstoffe, und Geschütze fallen für 12 h aus.</div>
      ${/* 26k-Regelanpassung ohne Ankündigungs-Popup (JP, Plan §11): die Wellen wachsen
            seit dem Geschütz-Ausbau deutlich schneller. Ohne diesen Satz wirkt der
            Sprung wie ein Fehler — er muss also hier stehen, wo die Stärke steht. */''}
      <div class="wr-sub wr-wave-note">🛡️ Angriffswellen wachsen mit deinem Besitz — seit dem
        Geschütz-Ausbau schneller (je Planet und Kolonie). Dafür reichen die neuen
        Geschütztypen weit höher: ein Vollausbau trägt die Verteidigung allein.</div>
      ${due
        ? '<button class="wr-btn wr-btn-go" id="wr-wave-resolve">🛡️ Angriff abwehren</button>'
        : (w.helpOpen
            ? '<div class="wr-ok">📣 Hilferuf läuft — die Gruppe sieht ihn im 🚀-Tab und im Chat.</div>'
            : '<button class="wr-btn wr-btn-go" id="wr-wave-help">📣 Verbündete um Hilfe rufen</button>')}
    </div>`;
}

// Hilferufe der anderen — hier schickt man Verstärkung los.
function wrHelpCallsHtml(m) {
  const mine = _wrWave?.id;
  const calls = (_wrAllWaves || []).filter(w =>
    w.help_open && w.id !== mine && w.member_id !== m?.id && Date.parse(w.arrive_at) > Date.now());
  if (!calls.length) return '';
  let rows = '';
  for (const w of calls) {
    const helping = _wrHelp.some(h => h.wave_id === w.id && h.helper_id === m?.id);
    const sum = _wrHelp.filter(h => h.wave_id === w.id && !h.returned)
                       .reduce((a, h) => a + (parseFloat(h.power) || 0), 0);
    const tier = wrWaveTier(w.strength);
    rows += `
      <div class="wr-call">
        <div class="wr-call-main">
          <strong>${tier.icon} ${_wrEsc(wrMemberName(w.member_id))}</strong> wird angegriffen
          <span class="wr-sub">Stärke ${wrFmt(w.strength)} · Einschlag in ${wrCountdown(Date.parse(w.arrive_at) - Date.now())}
            ${sum > 0 ? ` · bereits 🤝 ${wrFmt(sum)}` : ''}</span>
        </div>
        ${helping
          ? '<span class="wr-call-done">✅ Du hilfst</span>'
          : `<button class="wr-btn wr-btn-sm" data-wr-help="${w.id}">🤝 Verstärkung</button>`}
      </div>`;
  }
  return `
    <div class="wr-card wr-card-call">
      <div class="wr-card-title">📣 Hilferufe aus dem Clan
        <span class="wr-sub">— deine Schiffe kommen nach dem Kampf zurück</span></div>
      ${rows}
      <div class="wr-sub">Bei erfolgreicher Abwehr bekommst du eine Bergungsprämie.
        Verlierst ihr, verlierst du anteilig Schiffe — Helfen ist nicht umsonst.</div>
    </div>`;
}

// Namensauflösung über die bereits geladene Mitgliederliste der App
function wrMemberName(id) {
  try {
    const list = (typeof allMembers !== 'undefined' && allMembers) ? allMembers : [];
    return (list.find(x => x.id === id) || {}).name || 'Ein Clan-Mitglied';
  } catch (e) { return 'Ein Clan-Mitglied'; }
}

// ── Raumhafen: Ausbau + Geschütz-Slots ──────────────────────────────────────
// Die Geschütze wirken SOFORT (JP-Entscheidung Variante b): sie senken die Verluste aus
// Hinterhalten auf dem Rückweg. Ob ein Verband durchkommt, entscheidet dagegen allein
// seine eigene Kampfkraft — Geschütze stehen zu Hause.
function wrHafenHtml(m) {
  const lv    = wrBaseLevel(m);
  const def   = wrPortDef(lv);
  const next  = lv < 3 ? wrPortDef(lv + 1) : null;
  const tur   = wrTurrets(m);
  const power = wrTurretPower(m);
  const coins = parseFloat(m?.coins) || 0;
  // 26k: Plasmoid ist die vierte Kostenart (Resonanz-Geschütz, Quanten-Geschütz).
  const canPay = (c) => coins >= c.cc && wrErz(m) >= c.erz && wrKristall(m) >= c.kristall
                     && wrPlasmoid(m) >= (c.plasmoid || 0);
  const priceTxt = (c) => [`${wrFmt(c.cc)} CC`]
    .concat(c.erz ? [`${c.erz} 🪨`] : []).concat(c.kristall ? [`${c.kristall} 💎`] : [])
    .concat(c.plasmoid ? [`${c.plasmoid} 🟣`] : []).join(' · ');

  let slots = '';
  for (let i = 0; i < def.slots; i++) {
    const key = 'g' + i;
    const cur = tur[key];
    if (cur && typeof cur === 'object' && SPACE_TURRET_BY_KEY[cur.type]) {
      const t   = SPACE_TURRET_BY_KEY[cur.type];
      const clv = Math.max(1, Math.min(WR_TURRET_MAX, parseInt(cur.level, 10) || 1));
      const st  = wrTurretStats(cur.type, clv);
      const up  = clv < WR_TURRET_MAX ? wrTurretStats(cur.type, clv + 1) : null;
      const dmg = wrTurretDamaged(cur);
      slots += `
        <div class="wr-slot wr-slot-full${dmg ? ' wr-slot-dmg' : ''}">
          <div class="wr-slot-art" data-wr-tinfo="${t.key}" title="Groß ansehen">
            ${wrTurretImg(t)}
              <span class="wr-slot-fb">${t.icon}</span></div>
          <div class="wr-slot-name">${_wrEsc(t.name)} <span class="wr-sub">Stufe ${clv}</span></div>
          <div class="wr-slot-atk">${dmg
            ? `<span class="wr-bad">⚠️ beschädigt</span><span class="wr-sub">wieder einsatzbereit in ${wrCountdown(Date.parse(cur.dmg) - Date.now())}</span>`
            : `🛡️ ${wrFmt(st.atk)}`}</div>
          ${up
            ? `<button class="wr-btn wr-btn-sm" data-wr-tup="${key}" ${canPay(up) ? '' : 'disabled'}
                 >Aufrüsten <span class="wr-btn-sub">${priceTxt(up)} → 🛡️ ${wrFmt(up.atk)}</span></button>`
            : '<div class="wr-slot-max">✅ Vollausbau</div>'}
          ${(() => {
            // ⬆️ Umrüsten (26k, JP: „indem man seine Geschütze updaten kann für Geld").
            // Nur stärkere, freigeschaltete Typen; die Stufe fällt dabei auf 1 zurück —
            // das steht im Knopf, sonst wirkt der Verlust wie ein Fehler.
            if (dmg) return '';
            const ziele = SPACE_TURRETS.filter(z => z.atk > t.atk && lv >= z.minPort
                                                 && wrTurretUnlocked(m, z.key));
            if (!ziele.length) return '';
            return `<div class="wr-slot-conv">${ziele.map(z => {
              const p = wrConvertPrice(t.key, clv, z.key);
              return wrConvBtnHtml(`${key}:${z.key}`, 'data-wr-tconv', z, p, canPay(p), priceTxt(p));
            }).join('')}</div>`;
          })()}
        </div>`;
    } else {
      // Leerer Slot: die baubaren Typen anbieten (nach Hafenstufe gefiltert).
      // ⚠️ Das Portrait darf NICHT im <button> stecken — verschachtelte Buttons sind
      // ungültiges HTML und der Zoom-Klick würde den Bau auslösen. Deshalb eine Zeile
      // mit eigenem Zoom-Ziel links und dem Bauen-Button rechts (Muster wie in der Werft).
      let opts = '';
      for (const t of SPACE_TURRETS) {
        const st    = wrTurretStats(t.key, 1);
        const port  = lv >= t.minPort;
        const tech  = wrTurretUnlocked(m, t.key);
        const ok    = port && tech;
        // Zwei Sperrgründe, getrennt benannt — „🔒 gesperrt" allein sagt nicht, was fehlt.
        const grund = !port ? `🔒 ab Hafen-Stufe ${t.minPort}`
                    : !tech ? `🔒 Forschung „${_wrEsc(wrTechName(t.needs))}" (${_wrEsc(wrTechRef(t.needs))})`
                    : priceTxt(st);
        opts += `
          <div class="wr-slot-opt${ok ? '' : ' wr-slot-opt-lock'}">
            <span class="wr-slot-opt-art wr-ship-zoom" data-wr-tinfo="${t.key}" title="Groß ansehen">
              ${wrTurretImg(t)}
                <span class="wr-slot-opt-fb">${t.icon}</span><span class="wr-zoom-hint">🔍</span></span>
            <span class="wr-slot-opt-txt">
              <span class="wr-slot-opt-n">${_wrEsc(t.name)}</span>
              <span class="wr-slot-opt-a">🛡️ ${wrFmt(st.atk)}</span>
              <span class="wr-slot-opt-p">${grund}</span>
            </span>
            <button class="wr-btn wr-btn-sm" data-wr-tbuild="${key}:${t.key}"
              ${(ok && canPay(st)) ? '' : 'disabled'}>Bauen</button>
          </div>`;
      }
      slots += `
        <div class="wr-slot wr-slot-empty">
          <div class="wr-slot-name">⬚ Freier Bauslot ${i + 1}</div>
          <div class="wr-slot-opts">${opts}</div>
        </div>`;
    }
  }

  return `
    <div class="wr-card">
      <div class="wr-card-title">🛡️ Dein Raumhafen
        <span class="wr-sub">Stufe ${lv} · ${def.slots} Bauslots</span></div>
      <div class="wr-hafen-head">
        <div class="wr-hafen-art" data-wr-pinfo="1" title="Groß ansehen">
          <img src="assets/space/base_${lv}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
            ><span class="wr-hafen-fb">🛰️</span><span class="wr-zoom-hint">🔍</span></div>
        <div class="wr-hafen-info">
          <div class="wr-hafen-power">${wrIc("def")} Feuerkraft <strong>${wrFmt(power)}</strong></div>
          <div class="wr-sub">Deckungsfeuer beim Anflug und bei Angriffswellen. Jeder Spieler
            hat einen eigenen Hafen — alle starten aber aus demselben Quadranten.</div>
          ${next
            ? `<button class="wr-btn wr-btn-sm" id="wr-port-up" ${canPay(next) ? '' : 'disabled'}
                 >Auf Stufe ${lv + 1} ausbauen
                 <span class="wr-btn-sub">${priceTxt(next)} → ${next.slots} Slots</span></button>`
            : '<div class="wr-slot-max">✅ Vollausbau erreicht</div>'}
        </div>
      </div>
      <!-- Ausbau-Leiter: macht sichtbar, dass es DREI Stufen gibt (Stufe 1 ist der
           Startzustand, daher nur zwei Ausbau-Schritte — das sah vorher nach 2 Stufen aus). -->
      <div class="wr-ladder">
        ${SPACE_PORT.map(p => `
          <div class="wr-rung ${p.level === lv ? 'wr-rung-now' : (p.level < lv ? 'wr-rung-done' : 'wr-rung-todo')}">
            <span class="wr-rung-art"><img src="assets/space/base_${p.level}.png" alt=""
              onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"><span class="wr-rung-fb">🛰️</span></span>
            <span class="wr-rung-lv">Stufe ${p.level}</span>
            <span class="wr-rung-sl">${p.slots} Slots</span>
            <span class="wr-rung-st">${p.level < lv ? '✓' : (p.level === lv ? 'aktuell'
              : priceTxt(p))}</span>
          </div>`).join('')}
      </div>
      <div class="wr-slots">${slots}</div>
    </div>`;
}

// Einstell-Panel im Planeten-Detail (nur auf befreiten Planeten)
function wrRoutePanelHtml(m, p) {
  return wrRouteModeHtml(m, p, 'res') + wrRouteModeHtml(m, p, 'wreck');
}

// Ein Panel je Modus: Röstkometen auf den Rohstoff, Bergungsschiffe auf das Wrackfeld.
// Beide dürfen am selben Planeten parallel laufen (Routen-Schlüssel enthält den Modus).
function wrRouteModeHtml(m, p, mode) {
  const wreck = mode === 'wreck';
  const left  = wrWreckLeft(p);
  if (wreck && left <= 0) return '';                 // nichts mehr zu bergen
  const ship  = wreck ? 'berger' : 'ernter';
  const rkey  = p.id + (wreck ? ':w' : '');
  const cur   = parseInt(wrRoutes(m)[rkey]?.count, 10) || 0;
  const free  = wrShipCount(m, ship);
  if (!wreck && cur === 0 && free === 0) return '';   // ohne Röstkometen kein Panel
  if (wreck  && cur === 0 && free === 0) {
    return `<div class="wr-routebox"><div class="wr-fs-head">${wrIc("salvage")} Wracks bergen
      <span class="wr-sub">— ${wrFmt(left)} Einheiten liegen hier</span></div>
      <div class="wr-sub">Dafür brauchst du ${wrIc("salvage")} Bergungsschiffe aus der Werft.</div></div>`;
  }
  const sel  = Math.max(0, Math.min(cur + free, parseInt(_wrRouteSel?.[rkey], 10) ?? cur));
  const fuel = wrRouteFuel(sel);
  const sd   = SPACE_SHIP_BY_KEY[ship];

  let facts;
  if (wreck) {
    const perDay = wrWreckRate(sel);
    const tage   = perDay > 0 ? Math.ceil(left / perDay) : 0;
    facts = `<span>Abtrag: <strong>${wrFmt(perDay)}/Tag</strong></span>
             <span>Ausbeute: <strong>${Math.round(WR_WRECK_ERZ * 100)} % ${wrIc('erz')} ·
               ${Math.round(WR_WRECK_KRI * 100)} % ${wrIc('kri')}</strong></span>
             <span>Restbestand: <strong>${wrFmt(left)}</strong>${
               sel > 0 ? ` (leer in ${tage} Tag${tage === 1 ? '' : 'en'})` : ''}</span>`;
  } else {
    const ic = wrResMeta(p.resource_type).icon;
    facts = `<span>Ertrag: <strong>${wrFmt(wrRouteRate(p.resource_type, p.richness, sel))} ${ic}/Tag</strong></span>`;
  }

  return `
    <div class="wr-routebox${wreck ? ' wr-routebox-wreck' : ''}">
      <div class="wr-fs-head">${wreck ? wrIc("salvage") + ' Wracks bergen' : '🛰️ Dauerernte einrichten'}
        <span class="wr-sub">— ${wreck
          ? 'das Feld ist endlich und wird mit dem ganzen Clan geteilt'
          : 'sie sammeln automatisch, verteidigen aber den Hafen nicht mehr'}</span></div>
      <div class="wr-fs-row${sel > 0 ? ' wr-fs-on' : ''}">
        <span class="wr-fs-ic">${wrShipArt(ship, 'wr-mini wr-mini-md')}</span>
        <span class="wr-fs-name">${_wrEsc(sd.name)} stationieren
          <span class="wr-sub">${cur > 0 ? `aktuell ${cur} dort · ` : ''}${free} im Hafen</span></span>
        <span class="wr-fs-stepper">
          <button class="wr-fs-btn" data-wr-route="${rkey}:-1" ${sel < 1 ? 'disabled' : ''}>−</button>
          <span class="wr-fs-n">${sel}</span>
          <button class="wr-fs-btn" data-wr-route="${rkey}:1" ${sel >= cur + free ? 'disabled' : ''}>+</button>
        </span>
      </div>
      <div class="wr-facts">${facts}
        <span>Treibstoff: <strong>${wrFmt(fuel)} ${wrIc('kri')}/Tag</strong></span></div>
      ${sel !== cur
        ? `<button class="wr-btn wr-btn-sm" data-wr-routeset="${p.id}:${sel}:${mode}">
             ${sel === 0 ? 'Route auflösen' : (cur === 0 ? 'Route einrichten' : 'Route ändern')}</button>`
        : '<div class="wr-sub">Stelle die Anzahl ein, um die Route zu ändern.</div>'}
    </div>`;
}

// ── Dauerernte-Karte ────────────────────────────────────────────────────────
function wrRoutesHtml(m) {
  const routes = wrRoutes(m);
  const keys = Object.keys(routes).filter(k => routes[k] && typeof routes[k] === 'object');
  if (!keys.length) return '';
  const stock = wrKristall(m);
  let rows = '', pendErz = 0, pendKri = 0, fuelSum = 0, perDayFuel = 0;
  for (const rk of keys) {
    const r = routes[rk];
    const wreck = r.mode === 'wreck';
    const planet = wrPlanetById(r.planetId || rk.replace(/:w$/, ''));
    const pd = wrRoutePending(r, planet);
    const cnt = parseInt(r.count, 10) || 0;
    perDayFuel += wrRouteFuel(cnt);
    fuelSum += pd.fuel;
    let amtTxt;
    if (wreck) {
      pendErz += pd.erz; pendKri += pd.kri;
      amtTxt = `+${wrFmt(pd.erz)} ${wrIc('erz')} · +${wrFmt(pd.kri)} ${wrIc('kri')}`;
    } else {
      const meta = wrResMeta(r.type);
      if (r.type === 'erz') pendErz += pd.amount; else pendKri += pd.amount;
      pendErz += pd.sideErz || 0;
      pendKri += pd.sideKri || 0;
      // ⚠️ wrIc kennt nur erz/kri — für 🟣/🌀 das Emoji aus WR_RES_META nehmen,
      // sonst stünde auf einer Plasmoid-Route fälschlich das Kristall-Bild.
      const ic = r.type === 'erz' ? wrIc('erz') : r.type === 'kristall' ? wrIc('kri')
               : r.type === 'plasmoid' ? wrIc('pla') : r.type === 'quantum' ? wrIc('qua') : meta.icon;
      amtTxt = `+${wrFmt(pd.amount)} ${ic}`
             + ((pd.sideErz || pd.sideKri)
                 ? `<span class="wr-sub">+${wrFmt(pd.sideErz)} ${wrIc('erz')} · +${wrFmt(pd.sideKri)} ${wrIc('kri')}</span>`
                 : '');
    }
    const sub = wreck
      ? `${cnt}× Bergungsschiff · ${wrFmt(wrWreckRate(cnt))}/Tag · noch `
        + `${wrFmt(planet ? wrWreckLeft(planet) : 0)} im Feld`
      : `${cnt}× Röstkomet · ${'★'.repeat(Math.max(1, Math.min(5, r.richness || 1)))}`
        + ` · ${wrFmt(wrRouteRate(r.type, r.richness, cnt))}/Tag`;

    // ⬇️ JP 2026-07-29: „Bei den Bergungs-Trupps fehlt es noch an Information, wie lange
    // noch abgebaut wird und wann erwarteter Rückflug ist."
    let hinweis = '';
    if (wreck) {
      const rate = wrWreckRate(cnt);
      // Der bereits aufgelaufene, noch nicht eingesammelte Ertrag zählt schon gegen das Feld —
      // sonst rechnet die Prognose einen Vorrat mit, der faktisch vergeben ist.
      const rest = Math.max(0, (planet ? wrWreckLeft(planet) : 0) - pd.amount);
      if (rest <= 0) {
        hinweis = `<span class="wr-route-eta wr-ok">✅ Feld abgetragen — die ${cnt} Bergungsschiffe
          kehren beim nächsten Einsammeln heim.</span>`;
      } else if (rate > 0) {
        const days = rest / rate;
        hinweis = `<span class="wr-route-eta">⏳ Feld leer in <strong>${wrDays(days)}</strong>
          <span class="wr-sub">(${wrWhen(Date.now() + days * 86400000)}) → dann fliegen die
          ${cnt} Bergungsschiffe zurück</span></span>`;
      }
    } else if (cnt > 0) {
      // Rohstoff-Routen laufen unbefristet — begrenzt ist nur der Treibstoff.
      const reachOne = Math.floor(stock / wrRouteFuel(cnt));
      if (Number.isFinite(reachOne)) {
        hinweis = `<span class="wr-route-eta">${wrIc('kri')} Treibstoff für
          <strong>${reachOne > 99 ? '99+' : reachOne} Tage</strong>
          <span class="wr-sub">— danach pausiert die Route</span></span>`;
      }
    }

    rows += `
      <div class="wr-route">
        <span class="wr-fl-art">${wrShipArt(wreck ? 'berger' : 'ernter', 'wr-mini wr-mini-md')}</span>
        <span class="wr-route-txt">
          <strong>${wreck ? '♻️ ' : ''}${_wrEsc(r.name || 'Planet')}</strong>
          <span class="wr-sub">${sub} · ${wrFmt(wrRouteFuel(cnt))} ${wrIc('kri')}/Tag Treibstoff</span>
          ${hinweis}
        </span>
        <span class="wr-route-amt">${amtTxt}</span>
      </div>`;
  }
  const short = fuelSum > stock + pendKri;
  const reach = perDayFuel > 0 ? Math.floor(stock / perDayFuel) : 999;
  const pending = pendErz + pendKri;
  return `
    <div class="wr-card">
      <div class="wr-card-title">🛰️ Dauerernte &amp; Bergung
        <span class="wr-sub">— stationierte Schiffe verteidigen den Hafen NICHT mit</span></div>
      <div class="wr-sub" style="padding-bottom:4px">Ein Wrackfeld ist <strong>endlich und
        geteilt</strong> — ein Mitspieler kann schneller abbauen, dann ist es früher leer als
        prognostiziert.</div>
      ${rows}
      <div class="wr-facts">
        <span>Treibstoff: <strong>${wrFmt(perDayFuel)} ${wrIc('kri')}/Tag</strong></span>
        <span>Vorrat reicht: <strong>${reach > 99 ? '99+' : reach} Tage</strong></span>
      </div>
      ${short
        ? `<div class="wr-warn">💎 Der Kristall reicht nicht für den ganzen Zeitraum — die Routen
             pausieren, bis wieder Treibstoff da ist. Schiffe gehen dabei nicht verloren.</div>`
        : ''}
      <button class="wr-btn wr-btn-go" data-wr-harvest="1" ${pending < 1 ? 'disabled' : ''}>
        ${wrIc("yield")} Ertrag einsammeln${pending > 0 ? ` (${wrFmt(pending)})` : ''}</button>
    </div>`;
}

// ── Werft ────────────────────────────────────────────────────────────────────
function wrWerftHtml(m) {
  const research = wrResearch(m);
  const coins = parseFloat(m?.coins) || 0;
  const yl    = wrYardLevel(m);
  const yd    = wrYardDef(yl);
  const yNext = yl < 3 ? wrYardDef(yl + 1) : null;
  const jobs  = wrYardJobs(m);
  const cart  = _wrCart || {};

  // Warenkorb-Summe. Je Typ ein eigener Auftrag, alle laufen PARALLEL — die Wartezeit
  // ist deshalb die längste Einzelzeit, nicht die Summe.
  let sumCc = 0, sumErz = 0, sumKri = 0, maxMin = 0, items = 0;
  for (const sp of SPACE_SHIPS) {
    if (sp.special) continue;                 // 🛸 Flaggschiff: eigener Bauweg, nie im Korb
    const n = parseInt(cart[sp.key], 10) || 0;
    if (n < 1) continue;
    const c = wrShipCost(sp, m, n);
    sumCc += c.cc; sumErz += c.erz; sumKri += c.kristall;
    maxMin = Math.max(maxMin, wrShipBuildMin(sp, m, n));
    items += n;
  }
  const affordCart = coins >= sumCc && wrErz(m) >= sumErz && wrKristall(m) >= sumKri;

  let rows = '';
  for (const s of SPACE_SHIPS) {
    if (s.special) continue;                  // 🛸 Flaggschiff: siehe wrMutterHtml
    const unlocked = !!research[s.needs];
    const have  = wrShipCount(m, s.key);
    const busy  = wrYardHasJob(m, s.key);
    const n     = parseInt(cart[s.key], 10) || 0;
    const unit  = wrShipCost(s, m, 1);
    const price = [`${wrFmt(unit.cc)} CC`]
      .concat(unit.erz ? [`${unit.erz} 🪨`] : [])
      .concat(unit.kristall ? [`${unit.kristall} 💎`] : []).join(' · ');
    rows += `
      <div class="wr-ship ${unlocked ? '' : 'wr-ship-locked'}${busy ? ' wr-ship-busy' : ''}">
        <div class="wr-ship-ic wr-ship-zoom" data-wr-info="${s.key}" title="Groß ansehen">${s.art
          ? `<img class="wr-ship-art" src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
               ><span class="wr-ship-ic-fb">${s.icon}</span>`
          : s.icon}<span class="wr-zoom-hint">🔍</span></div>
        <div class="wr-ship-main">
          <div class="wr-ship-name">${_wrEsc(s.name)} <span class="wr-sub">×${have}</span></div>
          <div class="wr-ship-desc">${_wrEsc(s.desc)}</div>
          <div class="wr-ship-stats">${s.atk ? `${wrIc("atk")} ${s.atk}` : ''}${s.mine ? ` · ${wrIc("mine")} ${s.mine}` : ''}
            · ${wrIc("time")} ${wrDur(wrShipBuildMin(s, m, 1))}${n > 1 ? ` → ${wrDur(wrShipBuildMin(s, m, n))} für ${n}` : ''}</div>
        </div>
        <div class="wr-ship-buy">
          <div class="wr-ship-price">${price}</div>
          ${!unlocked
            ? `<span class="wr-lock">🔒 ${_wrEsc(spaceItemName(s.needs))}</span>`
            : busy
              ? '<span class="wr-lock">🏗️ im Bau</span>'
              : `<span class="wr-fs-stepper">
                   <button class="wr-fs-btn" data-wr-cart="${s.key}:-1" ${n < 1 ? 'disabled' : ''}>−</button>
                   <span class="wr-fs-n">${n}</span>
                   <button class="wr-fs-btn" data-wr-cart="${s.key}:1" ${n >= 50 ? 'disabled' : ''}>+</button>
                 </span>`}
        </div>
      </div>`;
  }

  // Laufende Aufträge — einer je Typ, parallel
  let jobHtml = '';
  const keys = Object.keys(jobs).filter(k => jobs[k] && typeof jobs[k] === 'object');
  if (keys.length) {
    let anyDone = false;
    let jr = '';
    for (const k of keys) {
      const sd   = SPACE_SHIP_BY_KEY[k] || {};
      const rem  = Date.parse(jobs[k].doneAt) - Date.now();
      const done = !(rem > 0);
      if (done) anyDone = true;
      jr += `
        <div class="wr-job ${done ? 'wr-job-done' : ''}">
          <span class="wr-fl-art"><img src="assets/space/${sd.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
            ><span class="wr-fl-fb">${sd.icon || '🚀'}</span></span>
          <span class="wr-job-txt">
            <strong>${wrFmt(jobs[k].count)}× ${_wrEsc(sd.name || k)}</strong>
            <span class="wr-sub">${done ? 'fertig' : `noch <span data-wr-jobeta="${k}">${wrCountdown(rem)}</span>`}</span>
          </span>
        </div>`;
    }
    jobHtml = `<div class="wr-jobs"><div class="wr-sub">${wrIc("yard")} Laufende Bauaufträge</div>${jr}
      ${anyDone ? `<button class="wr-btn wr-btn-go" id="wr-job-claim">${wrIc("yield")} Fertige Schiffe übernehmen</button>` : ''}
    </div>`;
  }

  return `<div class="wr-card">
    <div class="wr-werft-head">
      <span class="wr-werft-art wr-ship-zoom" data-wr-winfo="1" title="Groß ansehen"
        ><img src="assets/space/base_werft_${yl}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
        ><span class="wr-werft-fb">🏗️</span><span class="wr-zoom-hint">🔍</span></span>
      <span>
        <div class="wr-card-title">Werft am Raumhafen
          <span class="wr-sub">Stufe ${yl}</span></div>
        <div class="wr-sub">${_wrEsc(yd.desc)}</div>
        ${yNext
          ? `<button class="wr-btn wr-btn-sm" id="wr-yard-up"
               ${(coins >= yNext.cc && wrErz(m) >= yNext.erz && wrKristall(m) >= yNext.kristall) ? '' : 'disabled'}
               >Werft auf Stufe ${yl + 1} ausbauen
               <span class="wr-btn-sub">${[`${wrFmt(yNext.cc)} CC`]
                 .concat(yNext.erz ? [`${yNext.erz} 🪨`] : [])
                 .concat(yNext.kristall ? [`${yNext.kristall} 💎`] : []).join(' · ')}
                 → −${Math.round(yNext.timeCut * 100)} % Bauzeit, −${Math.round(yNext.costCut * 100)} % Kosten</span></button>`
          : '<div class="wr-slot-max">✅ Werft voll ausgebaut</div>'}
      </span>
    </div>
    ${jobHtml}
    <div class="wr-sub wr-job-note">Bauzeit = Grundzeit + 1 Minute je Stück. Jeder Schiffstyp
      bekommt eine eigene Helling und baut <strong>parallel</strong> — Serienbau lohnt sich.</div>
    ${rows}
    ${wrMutterHtml(m)}
    ${items > 0
      ? `<div class="wr-cart">
           <div class="wr-cart-sum">
             <span>${wrIc("yard")} <strong>${wrFmt(items)}</strong> Schiff(e) eingeplant</span>
             <span>${[`${wrFmt(sumCc)} CC`]
               .concat(sumErz ? [`${wrFmt(sumErz)} 🪨`] : [])
               .concat(sumKri ? [`${wrFmt(sumKri)} 💎`] : []).join(' · ')}</span>
             <span>⏱️ ${wrDur(maxMin)}</span>
           </div>
           <div class="wr-cart-act">
             <button class="wr-btn wr-btn-go" id="wr-cart-buy" ${affordCart ? '' : 'disabled'}>
               🏗️ Bauauftrag erteilen</button>
             <button class="wr-btn wr-btn-sm" id="wr-cart-clear">Verwerfen</button>
           </div>
           ${affordCart ? '' : '<div class="wr-warn">Dafür reichen deine Mittel nicht.</div>'}
         </div>`
      : '<div class="wr-sub">Wähle oben Stückzahlen — sie sammeln sich zum Werftauftrag.</div>'}
  </div>`;
}

// ── 🛸 Mutterschiff-Panel in der Werft (26j) ────────────────────────────────
// Kein Warenkorb-Eintrag: das Flaggschiff entsteht ausschließlich aus eingelösten
// Rümpfen. Das Panel zeigt jede Bauteil-Zeile mit Soll/Ist, damit sichtbar ist, was
// noch fehlt — und was die Rümpfe an Kampfkraft mitbringen.
function wrMutterCost(m) {
  // Spiegel von build_mutterschiff: Werft-Rabatt auf alles, D1 Erzraffinerie zusätzlich
  // auf die Rohstoffe. Gleiche Rundungsreihenfolge wie serverseitig.
  const cut = 1 - (wrYardDef(wrYardLevel(m)).costCut || 0);
  const rc  = wrTechResCost(m);
  return {
    cc:       Math.round(WR_MUTTER_COST.cc * cut),
    erz:      Math.round(WR_MUTTER_COST.erz * cut * rc),
    kristall: Math.round(WR_MUTTER_COST.kristall * cut * rc),
    plasmoid: Math.round(WR_MUTTER_COST.plasmoid * cut * rc),
    quantum:  Math.round(WR_MUTTER_COST.quantum * cut * rc),
  };
}
function wrMutterHtml(m) {
  const s = SPACE_SHIP_BY_KEY.mutterschiff;
  if (!s) return '';
  const unlocked = !!wrResearch(m)[s.needs];
  const have     = wrShipCount(m, s.key);
  const busy     = wrYardHasJob(m, s.key);
  const c        = wrMutterCost(m);
  const bonus    = wrFlagshipBonus(wrHomeShips(m));

  let ok = true, parts = '';
  for (const p of WR_MUTTER_PARTS) {
    const def = SPACE_SHIP_BY_KEY[p.ship] || {};
    const n   = wrShipCount(m, p.ship);
    const good = n >= p.count;
    if (!good) ok = false;
    parts += `<div class="wr-mutter-part ${good ? 'wr-good' : 'wr-bad'}">
        <span class="wr-fl-art"><img src="assets/space/${def.art}.png" alt=""
          onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-fl-fb">${def.icon || '🚀'}</span></span>
        <span>${good ? '✅' : '⬚'} <strong>${p.count}×</strong> ${_wrEsc(def.name || p.ship)}
          <span class="wr-sub">du hast ${wrFmt(n)} · ${wrIc("atk")} ${wrFmt(p.count * (def.atk || 0))}</span></span>
      </div>`;
  }
  const priceTxt = [`${wrFmt(c.cc)} CC`]
    .concat(c.erz ? [`${c.erz} 🪨`] : []).concat(c.kristall ? [`${c.kristall} 💎`] : [])
    .concat(c.plasmoid ? [`${c.plasmoid} ${wrIc('pla')}`] : [])
    .concat(c.quantum ? [`${c.quantum} ${wrIc('qua')}`] : []).join(' · ');
  const afford = (parseFloat(m?.coins) || 0) >= c.cc && wrErz(m) >= c.erz
    && wrKristall(m) >= c.kristall && wrPlasmoid(m) >= c.plasmoid && wrQuantum(m) >= c.quantum;

  return `
    <div class="wr-mutter${ok && afford && unlocked && !busy ? ' wr-mutter-ready' : ''}">
      <div class="wr-mutter-head">
        <span class="wr-mutter-art wr-ship-zoom" data-wr-info="${s.key}" title="Groß ansehen"
          ><img src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-fl-fb">${s.icon}</span><span class="wr-zoom-hint">🔍</span></span>
        <span>
          <div class="wr-card-title">${s.icon} Mutterschiff <span class="wr-sub">×${have}</span></div>
          <div class="wr-ship-desc">${_wrEsc(s.desc)}</div>
          <div class="wr-ship-stats">${wrIc("atk")} <strong>${wrFmt(s.atk)}</strong>
            · 🛡️ Schild 35 % · ${wrIc("time")} ${wrDur(wrShipBuildMin(s, m, 1))}</div>
        </span>
      </div>
      <div class="wr-sub wr-mutter-note">Die Rümpfe <strong>fliegen aus und gehen im Flaggschiff auf</strong>:
        sie werden beim Auftrag aus der Heimatflotte entnommen, ihre Kampfkraft steckt
        anschließend im Mutterschiff. Solange eines im Verband ist, kämpfen
        <strong>alle</strong> Schiffe mit +${Math.round(WR_FLAG_PER * 100)} % Kampfkraft
        (höchstens +${Math.round((WR_FLAG_CAP - 1) * 100)} %).${
        bonus > 1 ? ` <span class="wr-good">Aktuell aktiv: +${Math.round((bonus - 1) * 100)} %.</span>` : ''}</div>
      <div class="wr-mutter-parts">${parts}</div>
      <div class="wr-mutter-foot">
        <span>Zusätzlich: <strong>${priceTxt}</strong></span>
        ${!unlocked
          ? `<span class="wr-lock">🔒 ${_wrEsc(spaceItemName(s.needs))}</span>`
          : busy
            ? '<span class="wr-lock">🏗️ im Bau</span>'
            : `<button class="wr-btn wr-btn-go" id="wr-mutter-build" ${(ok && afford) ? '' : 'disabled'}>
                 🛸 Mutterschiff auf Kiel legen</button>`}
      </div>
      ${unlocked && !busy && !ok ? '<div class="wr-warn">Es fehlen noch Rümpfe — die fehlenden Zeilen sind rot.</div>' : ''}
      ${unlocked && !busy && ok && !afford ? '<div class="wr-warn">Die Rümpfe stehen bereit, aber die Zusatzkosten reichen nicht.</div>' : ''}
    </div>`;
}

function spaceItemName(id) {
  try { return (SPACE_RESEARCH.find(s => s.id === id) || {}).name || id; } catch (e) { return id; }
}

// ── ♻️ Bergungsschiffe ───────────────────────────────────────────────────────
// ⚠️ Spiegel von _space_berger_bonus/_space_wreck_rate in
//    migration_2026-07-21g_weltraum_berger.sql.
// Der Deckel ist wesentlich: ohne ihn würde eine Flotte aus 20 Bergern jeden Kampf zur
// Goldgrube machen. So bleibt es eine Abwägung — Berger haben kaum Kampfkraft, belegen
// aber Plätze im Verband und gehen bei Verlusten genauso drauf.
const WR_BERGER_BONUS = 0.25;   // je Berger im Verband
const WR_BERGER_CAP   = 1.00;   // maximal +100 %
const WR_WRECK_RATE   = 25;     // Einheiten Wrack je Berger und Tag
const WR_WRECK_ERZ    = 0.7;    // Wracks enthalten beides
const WR_WRECK_KRI    = 0.3;

function wrBergerBonus(fleet) {
  const n = parseInt((fleet || {}).berger, 10) || 0;
  return 1 + Math.min(WR_BERGER_CAP, WR_BERGER_BONUS * Math.max(0, n));
}
function wrWreckRate(count) { return Math.max(0, count || 0) * WR_WRECK_RATE; }
function wrWreckLeft(p) { return Math.max(0, Math.round(parseFloat(p?.wreck_left) || 0)); }

// ── Dauerernte-Routen ────────────────────────────────────────────────────────
// ⚠️ Spiegel von _space_route_rate/_space_route_fuel in
//    migration_2026-07-21f_weltraum_routen.sql. Bei Balance-Änderungen BEIDE Seiten.
//
// Stationierte Röstkometen liegen NICHT mehr in der Heimatflotte — sie zählen dadurch
// automatisch nicht mehr bei der Verteidigung gegen Angriffswellen. Genau das ist die
// Abwägung: Dauerertrag gegen Verteidigungsstärke.
const WR_ROUTE_ERZ = 4;      // je Röstkomet, Reichtumspunkt und Tag
const WR_ROUTE_KRI = 2;      // Kristall ist knapper — er ist auch der Treibstoff
const WR_ROUTE_FUEL = 1;     // 💎 je Röstkomet und Tag (JP: Kristallantrieb)
const WR_ROUTE_CAP_DAYS = 14;

function wrRoutes(m) {
  const r = wrSpace(m).routes;
  return (r && typeof r === 'object') ? r : {};
}
function wrRouteRate(type, richness, count) {
  const rich = Math.max(1, Math.min(5, parseInt(richness, 10) || 1));
  return Math.max(0, count || 0) * rich * (type === 'erz' ? WR_ROUTE_ERZ : WR_ROUTE_KRI);
}
function wrRouteFuel(count) { return Math.max(0, count || 0) * WR_ROUTE_FUEL; }

// Aufgelaufener Ertrag einer Route (Vorschau — abgerechnet wird am Server)
function wrRoutePending(r, planet) {
  const days = Math.min(WR_ROUTE_CAP_DAYS,
    Math.max(0, (Date.now() - Date.parse(r.lastClaim || 0)) / 86400000));
  const cnt = parseInt(r.count, 10) || 0;
  if (r.mode === 'wreck') {
    // ⚠️ Das Wrackfeld ist ENDLICH und GETEILT — die Vorschau deckelt auf den Restbestand,
    // abgerechnet wird trotzdem am Server (ein Mitspieler kann schneller sein).
    const want = Math.round(days * wrWreckRate(cnt));
    const left = planet ? wrWreckLeft(planet) : want;
    const got  = Math.min(want, left);
    // 26o: Wrackfelder in Ring 2/3 geben zusätzlich 🟣/🌀 her — Spiegel des Ring-Blocks
    // in harvest_space. Der Ring kommt vom Planeten, NICHT vom Rohstofftyp: JP wollte
    // „entweder aufgrund des Planetentyps ... oder entsprechend des Rings".
    const wrRing = parseInt(planet?.ring, 10) || 0;
    const R = WR_RING_LOOT;
    return { days, mode:'wreck', amount: got,
             erz: Math.round(got * WR_WRECK_ERZ), kri: Math.round(got * WR_WRECK_KRI),
             pla: wrRing >= R.plaRing ? Math.round(got * R.wreckPla) : 0,
             qua: wrRing >= R.quaRing ? Math.round(got * R.wreckQua) : 0,
             fuel: Math.round(days * wrRouteFuel(cnt) * (want > 0 ? got / want : 0)) };
  }
  // 26n: Ring-Routen liefern zusätzlich Erz/Kristall (50 % / 25 % der Routenmenge).
  const amount = Math.round(days * wrRouteRate(r.type, r.richness, cnt));
  const ring   = (r.type === 'plasmoid' || r.type === 'quantum');
  return {
    days, mode:'res', amount,
    sideErz: ring ? Math.round(amount * 0.5)  : 0,
    sideKri: ring ? Math.round(amount * 0.25) : 0,
    fuel:    Math.round(days * wrRouteFuel(cnt)),
  };
}
function wrPlanetById(id) {
  return (_wrGalaxy?.planets || []).find(p => p.id === id) || null;
}

// ── Werft-Helfer ─────────────────────────────────────────────────────────────
function wrYardLevel(m) {
  return Math.max(1, Math.min(3, parseInt(wrSpace(m).yard?.level, 10) || 1));
}
function wrYardDef(level) { return SPACE_YARD[Math.max(1, Math.min(3, level || 1)) - 1]; }

// ⚠️ Rundungs-Reihenfolge exakt wie in build_space: erst Rabatt auf den Einzelpreis,
// DANN mal Stückzahl, DANN runden. Andersherum weicht die Vorschau um 1 ab.
// D1 Raffinerie −20 % Rohstoffkosten: wirkt NUR auf Erz/Kristall, nie auf CC —
// exakt wie _space_tech_rescost in build_space/-_cart. Fehlte hier zunächst:
// der Server rechnete rabattiert, die Anzeige nicht (JP-Fund 2026-07-23).
function wrShipCost(s, m, count) {
  const cut = wrYardDef(wrYardLevel(m)).costCut, n = count || 1;
  const res = wrTechResCost(m);
  return {
    cc:       Math.round((s.cc || 0)       * (1 - cut) * n),
    erz:      Math.round((s.erz || 0)      * (1 - cut) * n * res),
    kristall: Math.round((s.kristall || 0) * (1 - cut) * n * res),
  };
}
// ⚠️ JP-Formel: Grundzeit + 1 Minute JE STÜCK — nicht Grundzeit × Stück.
// 2 Sonden = 10 + 2 = 12 Min. Serienbau lohnt sich dadurch massiv; die Bremse
// sind die Kosten, nicht die Uhr. Spiegel von build_space_cart —
// inkl. A4 Orbitalwerft (_space_tech_buildtime), die hier ebenfalls fehlte.
function wrShipBuildMin(s, m, count) {
  const cut = wrYardDef(wrYardLevel(m)).timeCut;
  return Math.max(1, Math.round(((s.buildMin || 10) + (count || 1))
                                * (1 - cut) * wrTechBuildTime(m)));
}

// Laufende Aufträge: Objekt { schiffsTyp: {count, doneAt} } — der Schlüssel ist der Typ,
// dadurch ist „eine Baustelle je Typ" schon durch die Datenstruktur garantiert.
function wrYardJobs(m) {
  const j = wrSpace(m).yard?.jobs;
  return (j && typeof j === 'object') ? j : {};
}
function wrYardHasJob(m, shipKey) {
  const j = wrYardJobs(m)[shipKey];
  return !!(j && typeof j === 'object');
}

// ── Raumhafen-Helfer ─────────────────────────────────────────────────────────
// Ausbaustufe des eigenen Raumhafens (1–3): bestimmt Portrait, Slots und Geschütz-Typen.
function wrBaseLevel(m) {
  const lv = parseInt(wrSpace(m).base?.level, 10) || 1;
  return Math.max(1, Math.min(3, lv));
}
function wrPortDef(level) { return SPACE_PORT[Math.max(1, Math.min(3, level || 1)) - 1]; }
function wrPortSlots(m)   { return wrPortDef(wrBaseLevel(m)).slots; }
function wrTurrets(m)     { return wrSpace(m).base?.turrets || {}; }

// Werte eines Geschützes auf Stufe 1..3 — exakt die Reihenfolge aus _space_turret_stats:
// erst multiplizieren, DANN runden. (Die Lehre aus der doppelten Rundung bei harvest_space.)
function wrTurretStats(type, level) {
  const t = SPACE_TURRET_BY_KEY[type];
  if (!t) return null;
  const lv = Math.max(1, Math.min(WR_TURRET_MAX, level || 1));
  return {
    atk:      Math.round(t.atk      * WR_TURRET_ATK_MULT[lv]),
    cc:       Math.round(t.cc       * WR_TURRET_COST_MULT[lv]),
    erz:      Math.round(t.erz      * WR_TURRET_COST_MULT[lv]),
    kristall: Math.round(t.kristall * WR_TURRET_COST_MULT[lv]),
    plasmoid: Math.round((t.plasmoid || 0) * WR_TURRET_COST_MULT[lv]),
  };
}
// Forschungs-Gate (26k) — Spiegel von _space_turret_ok. Betrifft NUR Neubau und
// Umrüsten; ein bereits gebautes Geschütz bleibt ohne die Tech nutz- und aufrüstbar.
function wrTurretUnlocked(m, type) {
  const t = SPACE_TURRET_BY_KEY[type];
  if (!t) return false;
  return !t.needs || wrHasTech(m, t.needs);
}
// Umrüstpreis: Neubaupreis des Zieltyps minus 50 % des Zeitwerts des alten Geschützes.
// Spiegel der Rechnung in build_space_defense/turret_convert.
function wrConvertPrice(fromType, fromLevel, toType) {
  const to  = wrTurretStats(toType, 1);
  const old = wrTurretStats(fromType, fromLevel);
  if (!to) return null;
  const rebate = Math.round((old?.cc || 0) * 0.5);
  return { cc: Math.max(0, to.cc - rebate), rebate,
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid, atk: to.atk };
}
// Ein von einer Angriffswelle beschädigtes Geschütz trägt bis `dmg` nichts bei (P2).
// ⚠️ Ein unlesbarer Zeitstempel darf es NICHT dauerhaft ausschalten — gleiche Absicherung
// wie im SQL-Pendant _space_turret_power.
function wrTurretDamaged(slot) {
  const raw = slot && slot.dmg;
  if (!raw) return false;
  const until = Date.parse(raw);
  return Number.isFinite(until) && until > Date.now();
}

// Gesamte Feuerkraft des eigenen Hafens (Spiegel von _space_turret_power)
// B1/B5 wirken auf die ANZEIGE genauso wie serverseitig am Aufrufort (21n).
function wrTurretPower(m) { return wrTurretPowerRaw(m) * wrTechTurret(m); }
function wrTurretPowerRaw(m) {
  let sum = 0;
  for (const slot of Object.values(wrTurrets(m))) {
    if (!slot || typeof slot !== 'object') continue;
    if (wrTurretDamaged(slot)) continue;
    sum += wrTurretStats(slot.type, slot.level)?.atk || 0;
  }
  return sum;
}

// ── 🛡️ Feature ④: Kolonie-Ausbau · Planeten-Geschütze · Quadranten-Station (26h) ──
// ⚠️ CLIENT-SYNC-PFLICHT: exakte Spiegel von _space_pdef_stats / _space_colony_cost /
// _space_station_cost in migration_2026-07-26h_planeten_verteidigung.sql. Bei
// Balance-Änderungen BEIDE Seiten anfassen (Regel wie SPACE_SHIPS ↔ _space_ship_stats).
// Index = Stufe, Feld 0 bleibt leer — dann ist WR_PDEF[lv] direkt lesbar.
// ⚠️ SEIT 26l NUR NOCH HISTORIE: Planeten haben keine Pauschalstufe mehr, sondern drei
// echte Bauplätze mit derselben Geschütz-Tabelle wie der Hafen. Die Tabelle bleibt für
// den Vergleich stehen (Bestandsplaneten wurden auf 72/208/416 migriert).
const WR_PDEF = [ null,
  { level: 1, atk:  60, cc:  6000, erz: 120, kristall:  30, plasmoid:  0 },
  { level: 2, atk: 150, cc: 14000, erz: 260, kristall:  80, plasmoid: 10 },
  { level: 3, atk: 320, cc: 26000, erz: 450, kristall: 160, plasmoid: 25 },
];
// 🏙️ Kolonie-Bauplätze (26l) — Spiegel von _space_planet_slots/_space_pturret_mult.
const WR_PLANET_SLOTS = 3;
const WR_PTURRET_MULT = 1.5;   // Kolonie-Aufschlag auf alle Geschützkosten
function wrPturretStats(type, level) {
  const s = wrTurretStats(type, level);
  if (!s) return null;
  return { atk: s.atk,
           cc:       Math.round(s.cc       * WR_PTURRET_MULT),
           erz:      Math.round(s.erz      * WR_PTURRET_MULT),
           kristall: Math.round(s.kristall * WR_PTURRET_MULT),
           plasmoid: Math.round(s.plasmoid * WR_PTURRET_MULT) };
}
function wrPturretConvertPrice(fromType, fromLevel, toType) {
  const to  = wrPturretStats(toType, 1);
  const old = wrPturretStats(fromType, fromLevel);
  if (!to) return null;
  const rebate = Math.round((old?.cc || 0) * 0.5);
  return { cc: Math.max(0, to.cc - rebate), rebate,
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid, atk: to.atk };
}
// Belegte Bauplätze eines Planeten. Bestandsplaneten ohne `turrets` (vor 26l) liefern {}.
function wrPlanetTurrets(p) {
  const t = p && p.turrets;
  return (t && typeof t === 'object') ? t : {};
}
const WR_COLONY_UP = [ null, null,
  { level: 2, cc:  9000, erz: 180, kristall:  45, plasmoid:  0 },
  { level: 3, cc: 20000, erz: 380, kristall: 120, plasmoid: 15 },
];
const WR_STATION = { cc: 30000, erz: 500, kristall: 200, plasmoid: 60, quantum: 30 };
// Rückfall-Frist ungeschützter Planeten — Spiegel von _space_fallback_days.
const WR_FALLBACK_DAYS = 5, WR_FALLBACK_E12 = 7;

function wrDefLevel(p)    { return Math.max(0, Math.min(3, parseInt(p?.def_level, 10) || 0)); }
function wrPlanetDef(p)   { return Math.max(0, parseInt(p?.planet_defense, 10) || 0); }
function wrColonyLevel(p) { return Math.max(1, Math.min(3, parseInt(p?.colony_level, 10) || 1)); }
function wrIsStation(p)   { return !!(p && p.station); }
function wrQuadStation(qkey) {
  return (_wrGalaxy?.planets || []).find(p => p.quadrant === qkey && p.station) || null;
}
// Deckungsfeuer am Ziel — Spiegel von _space_planet_cover (OHNE Tech-Faktor; der kommt
// wie am Hafen erst am Aufrufort dazu, sonst wäre er doppelt drin).
function wrPlanetCover(p, m) {
  if (!p) return 0;
  if (p.colonized_by && p.colonized_by === m?.id) return wrPlanetDef(p);
  const st = wrQuadStation(p.quadrant);
  return st ? Math.round(wrPlanetDef(st) * 0.5) : 0;
}
// Summe der eigenen Planeten-Geschütze — Spiegel von _space_planet_defense_total.
function wrPlanetDefTotal(m) {
  return (_wrGalaxy?.planets || [])
    .filter(p => p.colonized_by && p.colonized_by === m?.id)
    .reduce((a, p) => a + wrPlanetDef(p), 0);
}
// Anteil, mit dem die Planeten-Geschütze eine Angriffswelle abwehren (Server: × 0.5),
// 26l zusätzlich **gedeckelt auf die Feuerkraft des eigenen Hafens**. Ohne den Deckel
// hätten drei Bauplätze je Kolonie × acht Kolonien jede Welle dauerhaft entwertet —
// Kolonien sollen die Heimatverteidigung verdoppeln können, nicht ersetzen.
// ⚠️ Spiegel von resolve_space_wave (`v_pdef := LEAST(v_pdef, v_turret)`).
function wrPlanetWaveDef(m) {
  const roh = wrPlanetDefTotal(m) * wrTechTurret(m) * 0.5;
  return Math.round(Math.min(roh, wrTurretPower(m)));
}
// Ungedeckelter Rohwert — nur für die Anzeige („davon angerechnet: …").
function wrPlanetWaveDefRaw(m) { return Math.round(wrPlanetDefTotal(m) * wrTechTurret(m) * 0.5); }
function wrFallbackDays(m)  { return wrHasTech(m, 'wt_e12') ? WR_FALLBACK_E12 : WR_FALLBACK_DAYS; }

// Ist der Planet gegen Rückeroberung geschützt? Spiegel der Bedingungen in
// sweep_space_reconquest — mit EINER Einschränkung: fremde Dauerernte-Routen sieht der
// Client nicht (sie stehen in members.space anderer Spieler). Die Anzeige ist deshalb
// „schlimmstenfalls", der Server schützt notfalls mehr als hier angekündigt.
function wrPlanetProtected(p, m) {
  if (!p || !p.cleared_by) return true;
  if (p.colonized_by) return true;
  if (wrPlanetDef(p) > 0) return true;
  if (wrQuadStation(p.quadrant)) return true;
  const r = wrRoutes(m) || {};
  return (parseInt(r[p.id]?.count, 10) || 0) > 0 || (parseInt(r[p.id + ':w']?.count, 10) || 0) > 0;
}
// Zeitpunkt des Rückfalls (ms) oder null, wenn geschützt / nicht befreit.
// ⚠️ Die Frist richtet sich serverseitig nach der Technik des BEFREIERS. Für fremde
// Planeten rechnet der Client mit der eigenen (die Tech-Daten anderer Spieler liegen
// nicht vor) — bei eigenen Planeten, und nur die zählen für Entscheidungen, stimmt es.
function wrFallbackAt(p, m) {
  if (wrPlanetProtected(p, m)) return null;
  const t = Date.parse(p.cleared_at || '');
  if (!Number.isFinite(t)) return null;
  return t + wrFallbackDays(m) * 86400000;
}
// Spielerfarbe, deterministisch aus der member_id (kein Durchnummerieren — bei
// Neuzugängen bliebe sonst keine Farbe stabil). Gleiche Quelle wie _wrHash.
function wrMemberColor(id) {
  if (!id) return '#8aa0c0';
  return `hsl(${_wrHash(String(id)) % 360}, 72%, 58%)`;
}

// Verlustanteil aus einem Hinterhalt — exakter Spiegel von claim_space_arrival.
// ⚠️ REIHENFOLGE: erst deckeln, DANN die Geschütze abziehen (sonst verpuffen sie genau
// bei den schwachen Flotten, die am Deckel kleben).
function wrAmbushLoss(amb, power, turret) {
  let loss = Math.min(0.5, amb / Math.max(1, power + amb));
  if (turret > 0) loss *= (1 - Math.min(0.6, turret / Math.max(1, turret + amb)));
  return loss;
}

// Hinweistext zum Hinterhalt-Risiko einer Reise (reine Anzeige — gewürfelt wird am Server).
function wrAmbushHint(ring, power, turret) {
  const a = WR_AMBUSH[ring];
  if (!a) return '';
  const worst = a.max;
  const safe  = power >= worst;
  const loss  = Math.round(wrAmbushLoss(worst, power, turret) * 100);
  return `<div class="${safe ? 'wr-good' : 'wr-bad'}">`
       + `⚠️ Ring ${ring}: ${Math.round(a.chance * 100)} % Hinterhalt-Risiko (Stärke ${a.min}–${a.max}). `
       + (safe
          ? `Dein Verband (⚔️ ${wrFmt(power)}) kommt sicher durch.`
          : `Bei ⚔️ ${wrFmt(power)} kann der Verband abgedrängt werden — der Auftrag scheitert dann.`)
       + `</div><div class="wr-sub">Schlimmstenfalls ${loss} % Verluste`
       + (turret > 0 ? ` (Geschütze senken das: 🛡️ ${wrFmt(turret)} Deckungsfeuer).` : ` — Geschütze am Hafen würden das senken.`)
       + `</div>`;
}
// Pixel-Position eines Planeten auf dem Canvas — EINE Quelle für Zeichnen, Klick-Treffer
// und Flugbahn. Vorher rechnete die Flugbahn nur mit der Wabenmitte, dadurch flog die
// Flotte sichtbar am Zielplaneten vorbei. Formel identisch zum Planeten-Rendering.
function wrPlanetPos(p, cx, cy, size) {
  const c = wrHexCenter(p.qx, p.qy, size);
  const o = wrPlanetOffset(p, p.quadrant, size);
  return { x: cx + c.x + o.dx, y: cy + c.y + o.dy };
}

// ── Verteilung der Planeten INNERHALB einer Wabe ────────────────────────────
// Früher saßen alle Planeten gleich groß auf einem perfekten Kreis — das sah wie ein
// Zahnrad aus, nicht wie ein Sonnensystem (JP). Jetzt:
//   • Größe ∝ Reichtum (trägt also Information, nicht nur Optik) + etwas Streuung
//   • zufällig verstreut statt im Kranz, mit Abstoßung gegen Überlappung
//   • große Planeten bekommen Monde
//
// ⚠️ Alles DETERMINISTISCH aus der Planeten-ID abgeleitet — die Galaxie ist geteilt, alle
// Clan-Mitglieder müssen dieselbe Anordnung sehen, und sie darf beim Neuzeichnen nicht
// springen. Kein Math.random() an dieser Stelle.
function _wrHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Mulberry32 — dasselbe PRNG wie in karte.js
function _wrPrng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Radius eines Planetenpunkts in Pixeln (bei WR_HEX_SIZE = 80).
// Reichtum 1 → klein, Reichtum 5 → deutlich größer.
function wrPlanetRadius(p) {
  const rich = Math.max(1, Math.min(5, parseInt(p?.richness, 10) || 1));
  const jit  = (_wrPrng(_wrHash('r' + (p?.id || '')))() - 0.5) * 2.2;
  return Math.max(4.5, 4.5 + rich * 1.7 + jit);
}

// Layout je Quadrant, gecacht — die Abstoßungsschleife soll nicht 60×/Sekunde laufen.
// Cache-Schlüssel enthält die Planetenzahl, damit die Aufstockung ihn automatisch verwirft.
const _wrLayoutCache = {};
function wrQuadLayout(qkey) {
  const pls = wrPlanetsOf(qkey);
  const ck  = qkey + ':' + pls.length;
  if (_wrLayoutCache[ck]) return _wrLayoutCache[ck];

  const RMAX = 0.70;                 // Anteil von `size`; die Wabe reicht bis 0.92
  const pts  = pls.map((p) => {
    const rnd = _wrPrng(_wrHash('p' + p.id));
    // sqrt für gleichmäßige Flächenverteilung — sonst klumpt alles in der Mitte
    const d = Math.sqrt(rnd()) * RMAX;
    const a = rnd() * Math.PI * 2;
    const rad = wrPlanetRadius(p);
    // Monde: erst ab mittlerer Größe, 0–2 Stück, eigener Abstand/Winkel
    const moons = [];
    const mn = rad > 8 ? Math.floor(rnd() * 3) : (rad > 6.5 ? Math.floor(rnd() * 2) : 0);
    for (let k = 0; k < mn; k++) {
      moons.push({ ang: rnd() * Math.PI * 2, dist: rad + 4 + rnd() * 4, r: 1.6 + rnd() * 1.2 });
    }
    return { id: p.id, x: Math.cos(a) * d, y: Math.sin(a) * d, r: rad, moons };
  });

  // Abstoßung: verstreut heißt nicht überlappend. Wenige Durchgänge genügen, weil die
  // Startverteilung schon flächengleich ist.
  const pad = 5 / WR_HEX_SIZE;       // Mindestabstand in `size`-Einheiten
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const A = pts[i], B = pts[j];
        const need = (A.r + B.r) / WR_HEX_SIZE + pad;
        let dx = B.x - A.x, dy = B.y - A.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= need) continue;
        if (dist < 1e-6) { dx = 0.01; dy = 0; dist = 0.01; }   // exakt deckungsgleich
        const push = (need - dist) / 2;
        const ux = dx / dist, uy = dy / dist;
        A.x -= ux * push; A.y -= uy * push;
        B.x += ux * push; B.y += uy * push;
        moved = true;
      }
    }
    // Zurück in die Wabe klemmen (Monde brauchen auch noch Platz)
    for (const P of pts) {
      const lim = RMAX - (P.r + 6) / WR_HEX_SIZE;
      const d = Math.hypot(P.x, P.y);
      if (d > lim && d > 1e-6) { P.x *= lim / d; P.y *= lim / d; }
    }
    if (!moved) break;
  }

  const map = {};
  for (const P of pts) map[P.id] = P;
  _wrLayoutCache[ck] = map;
  return map;
}

// Versatz eines Planeten gegenüber der Wabenmitte — EINE Quelle für Zeichnen,
// Klick-Treffer und Flugbahn.
function wrPlanetOffset(planetOrIndex, qkey, size) {
  const p = (planetOrIndex && typeof planetOrIndex === 'object') ? planetOrIndex : null;
  if (!p) return { dx: 0, dy: 0, r: 8, moons: [] };
  const L = wrQuadLayout(qkey || p.quadrant)[p.id];
  if (!L) return { dx: 0, dy: 0, r: wrPlanetRadius(p), moons: [] };
  return { dx: L.x * size, dy: L.y * size, r: L.r, moons: L.moons };
}

// „Leitschiff" eines Verbands: das mit der höchsten Kampfkraft, sonst irgendeines.
function wrLeadShip(fleet) {
  let best = null;
  for (const [k, n] of Object.entries(fleet || {})) {
    if ((parseInt(n, 10) || 0) < 1) continue;
    const s = SPACE_SHIP_BY_KEY[k];
    if (!s) continue;
    if (!best || s.atk > best.atk) best = s;
  }
  return best;
}

// ── Canvas: Hex-Quadranten mit Nebel ────────────────────────────────────────
function wrDrawMap() {
  const cv = document.getElementById('wr-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, size = WR_HEX_SIZE;
  const cx = W / 2, cy = H / 2;

  ctx.clearRect(0, 0, W, H);
  // Sternenhintergrund — deterministisch, damit er beim Neuzeichnen nicht flackert
  ctx.fillStyle = '#080b18'; ctx.fillRect(0, 0, W, H);
  let seed = 1337;
  for (let i = 0; i < 160; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const sx = (seed % W), sy = ((seed >> 8) % H), a = ((seed >> 16) % 60) / 100 + 0.15;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(sx, sy, 1, 1);
  }

  // 🔍 Ab hier zeichnet ALLES innerhalb der Zoom/Pan-Transformation (Sterne bewusst
  // davor — der Hintergrund bleibt ruhig, nur die Szene zoomt). restore() am Ende.
  ctx.save();
  ctx.translate(cx + _wrPanX, cy + _wrPanY);
  ctx.scale(_wrZoom, _wrZoom);
  ctx.translate(-cx, -cy);

  const me = _wrMember?.id;
  for (const q of wrAllQuadrants()) {
    const c = wrHexCenter(q.qx, q.qy, size);
    const x = cx + c.x, y = cy + c.y;
    const revealed = wrRevealed(q.key);
    const home = q.ring === 0;
    const sel = _wrSel && ((_wrSel.fog && _wrSel.q.key === q.key) || (_wrSel.planet && _wrSel.planet.quadrant === q.key));

    // Wabe
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      const px = x + size * 0.92 * Math.cos(a), py = y + size * 0.92 * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = home ? 'rgba(212,170,55,.13)' : (revealed ? 'rgba(90,140,200,.09)' : 'rgba(150,160,200,.05)');
    ctx.fill();
    ctx.strokeStyle = sel ? '#ffd15c' : (revealed ? 'rgba(140,180,230,.35)' : 'rgba(120,130,170,.22)');
    ctx.lineWidth = sel ? 2.5 : 1;
    ctx.stroke();

    if (home) {
      // Echtes Raumhafen-Portrait (assets/space/base_N.png), Emoji nur als Rückfall.
      // Jeder Spieler hat einen EIGENEN Hafen — Stufe kommt aus dem eigenen space-State,
      // der Quadrant 0,0 ist trotzdem für alle derselbe Startpunkt.
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!wrDrawImg(ctx, 'base_' + wrBaseLevel(_wrMember), x, y - 6, size * 0.95)) {
        ctx.font = '26px system-ui'; ctx.fillStyle = '#fff';
        ctx.fillText('🛰️', x, y - 8);
      }
      ctx.font = '11px system-ui'; ctx.fillStyle = '#d4aa37';
      ctx.fillText('Dein Raumhafen', x, y + size * 0.62);
      continue;
    }

    if (!revealed) {
      // Nebelschwaden
      const g = ctx.createRadialGradient(x, y, 6, x, y, size * 0.85);
      g.addColorStop(0, 'rgba(130,120,190,.30)');
      g.addColorStop(1, 'rgba(130,120,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🌫️', x, y - 4);
      ctx.font = '10px system-ui';
      ctx.fillStyle = wrScoutable(q) ? '#9fd1ff' : 'rgba(200,200,220,.4)';
      ctx.fillText(wrScoutable(q) ? 'aufklärbar' : 'zu weit', x, y + 20);
      continue;
    }

    // Planeten des Quadranten
    const pls = wrPlanetsOf(q.key);
    pls.forEach((p) => {
      // Position/Größe aus derselben Quelle wie Klick-Treffer und Flugbahn
      const o = wrPlanetOffset(p, q.key, size);
      const px = x + o.dx, py = y + o.dy;
      const selP = _wrSel?.planet?.id === p.id;
      // Monde zuerst — sie liegen hinter dem Planeten
      for (const mo of o.moons) {
        ctx.beginPath();
        ctx.arc(px + Math.cos(mo.ang) * mo.dist, py + Math.sin(mo.ang) * mo.dist, mo.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(190,200,225,.55)';
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(px, py, selP ? o.r + 3 : o.r, 0, Math.PI * 2);
      ctx.fillStyle = p.cleared_by ? (p.cleared_by === me ? '#7ad48a' : '#68a0d8')
                                   : wrResMeta(p.resource_type).color;
      ctx.fill();
      ctx.lineWidth = selP ? 3 : 1.2;
      ctx.strokeStyle = selP ? '#ffd15c' : 'rgba(0,0,0,.5)';
      ctx.stroke();
      // ── 26h: Kolonie-Markierung (JP) — Punkt in Spielerfarbe MITTIG, darum ein Ring
      // je Ausbaustufe 1–3 (Optik wie die Raumhafen-Stufen). Die Farbe kommt
      // deterministisch aus der member_id, damit sie bei Neuzugängen stabil bleibt.
      if (p.colonized_by) {
        const col = wrMemberColor(p.colonized_by);
        ctx.beginPath(); ctx.arc(px, py, Math.max(2.5, o.r * 0.34), 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
        const clv = wrColonyLevel(p);
        for (let ri = 0; ri < clv; ri++) {
          ctx.beginPath(); ctx.arc(px, py, o.r + 2.5 + ri * 2.6, 0, Math.PI * 2);
          ctx.strokeStyle = col; ctx.globalAlpha = 0.85 - ri * 0.22;
          ctx.lineWidth = 1.4; ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🪐', px, py - o.r - 6);
      }
      // Verteidigung: Schild-Marker (Geschütze) bzw. Antenne (Quadranten-Station)
      if (wrIsStation(p)) {
        ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('📡', px + o.r + 5, py - o.r - 2);
      } else if (wrDefLevel(p) > 0) {
        ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', px + o.r + 4, py - o.r - 1);
      }
      // Ungeschützt befreit → gestrichelter Warnring, solange die Frist läuft (26h)
      if (!p.colonized_by && p.cleared_by && wrFallbackAt(p, _wrMember)) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,140,120,.75)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(px, py, o.r + 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    });
    // Quadranten-Beschriftung: bei 8 Planeten reicht der Kranz bis 0.58 — Label weiter raus
    ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200,215,240,.45)';
    ctx.fillText(`${q.key} · ${pls.length}`, x, y + size * 0.80);
  }

  // 🚀 Alle reisenden Flotten als Punkt zwischen Hafen und Ziel (Muster kmPos)
  for (const trip of wrTrips(_wrMember)) {
    const tp = (_wrGalaxy?.planets || []).find(p => p.id === trip.planetId);
    if (tp) {
      // Ziel ist der PLANET, nicht die Wabenmitte — sonst endet die Flugbahn daneben
      const tc = wrPlanetPos(tp, cx, cy, size);
      const s = Date.parse(trip.startAt), a = Date.parse(trip.arriveAt), r = Date.parse(trip.returnAt), now = Date.now();
      let f;                                             // 0 = Hafen, 1 = Ziel
      if (now <= a) f = (a > s) ? (now - s) / (a - s) : 1;
      else          f = (r > a) ? 1 - (now - a) / (r - a) : 0;
      f = Math.max(0, Math.min(1, f));
      // Interpolation vom Raumhafen (Canvas-Mitte) zum Planeten
      const fx = cx + (tc.x - cx) * f, fy = cy + (tc.y - cy) * f;

      // Flugbahn andeuten, damit erkennbar ist, wohin der Verband unterwegs ist
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,209,92,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tc.x, tc.y); ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Das Leitschiff des Verbands zeigen statt eines generischen 🚀
      const lead = wrLeadShip(wrTripShipsDisplay(trip));
      if (!(lead && wrDrawImg(ctx, lead.art, fx, fy, 46))) {
        ctx.font = '18px system-ui'; ctx.fillStyle = '#fff';
        ctx.fillText(lead?.icon || '🚀', fx, fy);
      }
    }
  }

  ctx.restore();   // 🔍 Ende der Zoom/Pan-Transformation
}

// Klick → Quadrant/Planet auswählen
function wrCanvasClick(ev) {
  const cv = document.getElementById('wr-canvas');
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const size = WR_HEX_SIZE, cx = cv.width / 2, cy = cv.height / 2;
  // 🔍 Zeiger → Canvas → INVERSE der Zoom/Pan-Transformation aus wrDrawMap.
  // So testen Klick und Zeichnung immer gegen dieselben Welt-Koordinaten.
  const rawX = (ev.clientX - rect.left) * (cv.width / rect.width);
  const rawY = (ev.clientY - rect.top)  * (cv.height / rect.height);
  const mx = (rawX - cx - _wrPanX) / _wrZoom + cx;
  const my = (rawY - cy - _wrPanY) / _wrZoom + cy;

  // Zuerst prüfen, ob die eigene reisende Flotte getroffen wurde — sie liegt ÜBER den
  // Waben, also muss sie auch beim Klick Vorrang haben. Position identisch zu wrDrawMap.
  const trip0 = wrTrip(_wrMember);
  if (trip0) {
    const tp = (_wrGalaxy?.planets || []).find(p => p.id === trip0.planetId);
    if (tp) {
      const tc = wrPlanetPos(tp, cx, cy, size);
      const s = Date.parse(trip0.startAt), a = Date.parse(trip0.arriveAt),
            r = Date.parse(trip0.returnAt), now = Date.now();
      let f = (now <= a) ? ((a > s) ? (now - s) / (a - s) : 1)
                         : ((r > a) ? 1 - (now - a) / (r - a) : 0);
      f = Math.max(0, Math.min(1, f));
      if (Math.hypot(cx + (tc.x - cx) * f - mx, cy + (tc.y - cy) * f - my) < 28) { wrFleetLightbox(); return; }
    }
  }

  let best = null, bestD = 1e9;
  for (const q of wrAllQuadrants()) {
    const c = wrHexCenter(q.qx, q.qy, size);
    const d = Math.hypot(cx + c.x - mx, cy + c.y - my);
    if (d < bestD) { bestD = d; best = { q, x: cx + c.x, y: cy + c.y }; }
  }
  if (!best || bestD > size) return;
  // Heimatquadrant → Hafen-Übersicht mit der kompletten Flotte. Vorher wurde hier nur die
  // Auswahl geleert, sodass man seine Schiffe erst nach Anklicken eines Planeten sah.
  if (best.q.ring === 0) { _wrSel = { home: true }; wrRefreshDetail(); wrDrawMap(); return; }

  if (!wrRevealed(best.q.key)) { _wrSel = { fog: true, q: best.q }; wrRefreshDetail(); wrDrawMap(); return; }

  // Innerhalb des Quadranten den nächsten Planeten wählen
  const pls = wrPlanetsOf(best.q.key);
  let pick = null, pd = 1e9;
  pls.forEach((p) => {
    // Dieselbe Quelle wie das Zeichnen — sonst greift der Klick daneben.
    // Der Radius geht mit ein: große Planeten sollen sich leichter treffen lassen.
    const o = wrPlanetOffset(p, best.q.key, size);
    const d = Math.hypot(best.x + o.dx - mx, best.y + o.dy - my) - o.r;
    if (d < pd) { pd = d; pick = p; }
  });
  if (pick) { _wrSel = { planet: pick }; wrRefreshDetail(); wrDrawMap(); }
}

function wrRefreshDetail() {
  const d = document.getElementById('wr-detail');
  if (d) d.innerHTML = wrDetailHtml(_wrMember);
}

// ── Events ───────────────────────────────────────────────────────────────────
function wrBindEvents() {
  const cv = document.getElementById('wr-canvas');
  if (cv) {
    // 🔍 Pointer-Gesten statt onclick: Tap = Auswahl (wrCanvasClick), Ziehen = Pan
    // (ab Zoom > 1), zwei Finger = Pinch-Zoom. 8-px-Schwelle trennt Tap von Drag
    // (Muster karte.js). touch-action:none steht im CSS, sonst scrollt die Seite mit.
    const pts = new Map();
    let start = null, moved = false, pinch0 = 0, z0 = 1;
    cv.onclick = null;
    cv.onpointerdown = (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, px: _wrPanX, py: _wrPanY }; moved = false; }
      else if (pts.size === 2) {
        const a = [...pts.values()];
        pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); z0 = _wrZoom; moved = true;
      }
    };
    cv.onpointermove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = cv.getBoundingClientRect();
      const sx = cv.width / rect.width, sy = cv.height / rect.height;
      if (pts.size === 2 && pinch0 > 0) {
        const a = [...pts.values()];
        const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        const midx = ((a[0].x + a[1].x) / 2 - rect.left) * sx;
        const midy = ((a[0].y + a[1].y) / 2 - rect.top) * sy;
        wrSetZoom(z0 * d / pinch0, midx, midy);
      } else if (start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (moved && _wrZoom > 1) {
          _wrPanX = start.px + dx * sx; _wrPanY = start.py + dy * sy;
          _wrClampPan(); wrDrawMap();
        }
      }
    };
    cv.onpointerup = (e) => {
      pts.delete(e.pointerId);
      if (pts.size === 0) { if (!moved) wrCanvasClick(e); start = null; pinch0 = 0; }
    };
    cv.onpointercancel = (e) => { pts.delete(e.pointerId); if (!pts.size) { start = null; pinch0 = 0; } };
  }

  _wrEl.onclick = async (e) => {
    const zb = e.target.closest('[data-wr-zoom]');
    if (zb) {
      wrSetZoom(_wrZoom + (zb.dataset.wrZoom === 'in' ? 0.5 : -0.5),
                WR_CANVAS_W / 2, WR_CANVAS_H / 2);
      return;
    }
    // Flottenauswahl zuerst — sie ändert nur das Detail-Panel, kein Server-Roundtrip
    const adj = e.target.closest('[data-wr-fadj]');
    if (adj && !adj.disabled) {
      const [key, d] = adj.dataset.wrFadj.split(':');
      const have = wrShipCount(_wrMember, key);
      _wrSelFleet = _wrSelFleet || {};
      _wrSelFleet[key] = Math.max(0, Math.min(have, wrSelCount(key) + parseInt(d, 10)));
      wrRefreshDetail();
      return;
    }
    const quick = e.target.closest('[data-wr-fq]');
    if (quick) { wrFleetQuick(quick.dataset.wrFq, _wrMember); wrRefreshDetail(); return; }

    const info = e.target.closest('[data-wr-info]');
    if (info) { wrShipLightbox(info.dataset.wrInfo); return; }
    const tinfo = e.target.closest('[data-wr-tinfo]');
    if (tinfo) { wrTurretLightbox(tinfo.dataset.wrTinfo); return; }
    const techInfo = e.target.closest('[data-wr-techinfo]');
    if (techInfo) { wrTechLightbox(techInfo.dataset.wrTechinfo); return; }
    if (e.target.closest('[data-wr-pinfo]')) { wrPortLightbox(); return; }
    if (e.target.closest('[data-wr-sinfo]')) { wrStationLightbox(); return; }
    if (e.target.closest('[data-wr-rinfo]')) { wrRefineLightbox(); return; }
    const astInfo = e.target.closest('[data-wr-astinfo]');
    if (astInfo) { wrAstLightbox(astInfo.dataset.wrAstinfo); return; }
    if (e.target.closest('[data-wr-winfo]')) { wrWerftLightbox(); return; }

    // Reise-Karte anklicken → Verband-Details (auch das Schiff auf der Sternkarte, s. wrCanvasClick)
    // ⚠️ ALLE Buttons in der Trip-Karte ausnehmen — der Karten-Klick (Lightbox) steht
    // VOR den Button-Handlern und schluckte sonst den Klick (JP: „Zurückrufen geht
    // nicht — da öffnet sich nur der Verband").
    const tripCard = e.target.closest('[data-wr-tripcard]');
    if (tripCard && !e.target.closest('[data-wr-claim]') && !e.target.closest('[data-wr-recall]')) { wrFleetLightbox(tripCard.dataset.wrTripcard); return; }

    // Raumhafen: Ausbau + Geschütze
    if (e.target.closest('#wr-port-up')) { await wrDefense('port_upgrade', null, null); return; }
    if (e.target.closest('#wr-yard-up'))  { await wrDefense('yard_upgrade', null, null); return; }
    if (e.target.closest('#wr-job-claim')) { await wrClaimBuild(false); return; }
    const tb = e.target.closest('[data-wr-tbuild]');
    if (tb && !tb.disabled) {
      const [slot, type] = tb.dataset.wrTbuild.split(':');
      await wrDefense('turret_build', slot, type); return;
    }
    const tu = e.target.closest('[data-wr-tup]');
    if (tu && !tu.disabled) { await wrDefense('turret_upgrade', tu.dataset.wrTup, null); return; }
    // ⬆️ Umrüsten (26k). Wert ist 'slot:zieltyp' — beide sind schlüsselartig, kein Doppelpunkt drin.
    const tc = e.target.closest('[data-wr-tconv]');
    if (tc && !tc.disabled) {
      const [slot, type] = tc.dataset.wrTconv.split(':');
      await wrDefense('turret_convert', slot, type); return;
    }

    // 🛡️ Planeten-Verteidigung (26h) — Wert ist 'planetId:action'; die UUID enthält
    // keine Doppelpunkte, ein einfaches split reicht hier (anders als bei den Routen).
    const pb = e.target.closest('[data-wr-pbuild]');
    if (pb && !pb.disabled) {
      const [pid, action] = pb.dataset.wrPbuild.split(':');
      await wrPlanetBuild(pid, action); return;
    }
    // 🏙️ Kolonie-Bauplätze (26l) — Wert ist 'planetId:action:slot:type'. Der Typ darf
    // leer sein (Aufrüsten), deshalb feste 4 Felder statt einer Längenprüfung.
    const pt = e.target.closest('[data-wr-pturret]');
    if (pt && !pt.disabled) {
      const [pid, action, slot, type] = pt.dataset.wrPturret.split(':');
      await wrPlanetBuild(pid, action, slot, type || null); return;
    }
    // 🏙️ Kolonie im Raumhafen auf-/zuklappen (26l)
    const ct = e.target.closest('[data-wr-coltoggle]');
    if (ct) {
      const id = ct.dataset.wrColtoggle;
      _wrColOpen = (_wrColOpen === id) ? null : id;
      wrRender(); return;
    }

    // 🤝 Clan-Handel v2 (Gesuche + Schiffshandel)
    const trType = e.target.closest('[data-wr-tr-type]');
    if (trType) { _wrTrType = trType.dataset.wrTrType; wrLoadHandel(); return; }
    const trAmt = e.target.closest('[data-wr-tr-amount]');
    if (trAmt) { _wrTrAmount = parseInt(trAmt.dataset.wrTrAmount, 10) || 50; wrLoadHandel(); return; }
    if (e.target.closest('#wr-tr-request')) { await wrTradeRequest(); return; }
    const trFill = e.target.closest('[data-wr-trade-fill]');
    if (trFill && !trFill.disabled) { await wrTradeFulfill(trFill.dataset.wrTradeFill); return; }
    const trShipOffer = e.target.closest('[data-wr-tr-shipoffer]');
    if (trShipOffer) { await wrShipOffer(trShipOffer.dataset.wrTrShipoffer); return; }
    const trShipBuy = e.target.closest('[data-wr-trade-shipbuy]');
    if (trShipBuy && !trShipBuy.disabled) { await wrShipBuy(trShipBuy.dataset.wrTradeShipbuy); return; }
    const trBuy = e.target.closest('[data-wr-trade-buy]');
    if (trBuy) { await wrTradeBuy(trBuy.dataset.wrTradeBuy); return; }
    const trCancel = e.target.closest('[data-wr-trade-cancel]');
    if (trCancel) { await wrTradeCancel(trCancel.dataset.wrTradeCancel); return; }

    const send = e.target.closest('[data-wr-send]');
    if (send && !send.disabled) { await wrSend(send.dataset.wrSend); return; }
    const cart = e.target.closest('[data-wr-cart]');
    if (cart && !cart.disabled) {
      const [key, d] = cart.dataset.wrCart.split(':');
      _wrCart = _wrCart || {};
      _wrCart[key] = Math.max(0, Math.min(50, (parseInt(_wrCart[key], 10) || 0) + parseInt(d, 10)));
      wrRender();
      return;
    }
    const rAdj = e.target.closest('[data-wr-route]');
    if (rAdj && !rAdj.disabled) {
      // ⚠️ Der Routen-Schlüssel kann selbst ein ':' enthalten (':w' für Wrack-Routen) —
      // deshalb von RECHTS trennen, nicht mit einem einfachen split(':').
      const raw = rAdj.dataset.wrRoute;
      const cut = raw.lastIndexOf(':');
      const rkey = raw.slice(0, cut), d = raw.slice(cut + 1);
      const cur  = parseInt(wrRoutes(_wrMember)[rkey]?.count, 10) || 0;
      const free = wrShipCount(_wrMember, rkey.endsWith(':w') ? 'berger' : 'ernter');
      _wrRouteSel = _wrRouteSel || {};
      const now = _wrRouteSel[rkey] ?? cur;
      _wrRouteSel[rkey] = Math.max(0, Math.min(cur + free, now + parseInt(d, 10)));
      wrRefreshDetail();
      return;
    }
    const rSet = e.target.closest('[data-wr-routeset]');
    if (rSet && !rSet.disabled) {
      const [pid, n, mode] = rSet.dataset.wrRouteset.split(':');
      await wrSetRoute(pid, parseInt(n, 10), mode || 'res');
      return;
    }
    if (e.target.closest('#wr-mutter-build')) { await wrBuildMutterschiff(); return; }
    if (e.target.closest('#wr-cart-buy'))   { await wrBuildCart(); return; }
    if (e.target.closest('#wr-cart-clear')) { _wrCart = null; wrRender(); return; }
    // Angriffswellen + Hilferufe
    const tab = e.target.closest('[data-wr-tab]');
    if (tab) { wrSetTab(tab.dataset.wrTab); return; }
    const tech = e.target.closest('[data-wr-tech]');
    if (tech) { await wrBuyTech(tech.dataset.wrTech); return; }
    const tm = e.target.closest('[data-wr-transmute]');
    if (tm && !tm.disabled) { await wrTransmute(tm.dataset.wrTransmute); return; }
    if (e.target.closest('#wr-wave-help'))    { await wrRequestHelp(); return; }
    if (e.target.closest('#wr-wave-resolve')) { await wrResolveWave(); return; }
    const help = e.target.closest('[data-wr-help]');
    if (help && !help.disabled) { wrHelpDialog(help.dataset.wrHelp); return; }

    // 🏭 Raffinerie
    const rfa = e.target.closest('[data-wr-refadj]');
    if (rfa && !rfa.disabled) {
      const [k, d] = rfa.dataset.wrRefadj.split(':');
      // 26o: vier Rohstoffe statt zwei — als Tabelle, damit der vierte Zweig nicht wieder
      // als `else` mitläuft (vorher war „alles ausser erz" = Kristall).
      const def = WR_REFINE[wrRefineTier(_wrMember)]
               || { capErz: 0, capKri: 0, capPla: 0, capQua: 0 };
      const SLOT = {
        erz: { cap: def.capErz,      have: wrErz(_wrMember),      get: () => _wrRefErz, set: (v) => { _wrRefErz = v; } },
        kri: { cap: def.capKri,      have: wrKristall(_wrMember), get: () => _wrRefKri, set: (v) => { _wrRefKri = v; } },
        pla: { cap: def.capPla || 0, have: wrPlasmoid(_wrMember), get: () => _wrRefPla, set: (v) => { _wrRefPla = v; } },
        qua: { cap: def.capQua || 0, have: wrQuantum(_wrMember),  get: () => _wrRefQua, set: (v) => { _wrRefQua = v; } },
      };
      const s = SLOT[k];
      if (s) {
        const max = Math.min(s.cap, s.have);
        s.set(d === 'max' ? max : Math.max(0, Math.min(max, s.get() + parseInt(d, 10))));
      }
      wrRender(); return;
    }
    if (e.target.closest('#wr-refine-start')) { await wrRefineStart(); return; }
    if (e.target.closest('#wr-refine-claim')) { await wrRefineClaim(); return; }

    const recallBtn = e.target.closest('[data-wr-recall]');
    if (recallBtn) { await wrRecall(recallBtn.dataset.wrRecall); return; }
    if (e.target.closest('[data-wr-claim]')) { await wrTryClaim(false); return; }
    if (e.target.closest('[data-wr-harvest]')) { await wrHarvest(); return; }

    // 📋 Flottenkommando. Löschen VOR Laden prüfen — der 🗑️-Knopf liegt neben der
    // Lade-Fläche, ein umgekehrter Test würde beim Löschen die Vorlage laden.
    const tplDel = e.target.closest('[data-wr-tpldel]');
    if (tplDel) { await wrTplDelete(tplDel.dataset.wrTpldel); return; }
    const tplLoad = e.target.closest('[data-wr-tplload]');
    if (tplLoad) { wrTplLoad(tplLoad.dataset.wrTplload); return; }
    if (e.target.closest('#wr-tpl-save')) { await wrTplSave(); return; }
  };

  // Der Vorlagen-Name muss das Neurendern überleben (jeder wrRender baut das DOM neu auf);
  // deshalb bei jeder Eingabe in die Modulvariable spiegeln — dasselbe Muster wie die
  // Raffinerie-Regler. Ohne das wäre das Feld nach dem ersten Tastendruck wieder leer.
  const tplName = document.getElementById('wr-tpl-name');
  if (tplName) tplName.oninput = () => { _wrTplName = tplName.value; };
}

// ── Aktionen ─────────────────────────────────────────────────────────────────
// Zusammenstellung der mitfliegenden Schiffe je Auftrag. Bewusst simpel (P1):
// Angriff = alles Kampffähige, Abbau = alle Ernter, Aufklärung = 1 Sonde.
function wrFleetFor(intent, m) {
  const ships = wrHomeShips(m);
  const take = (keys) => {
    const f = {};
    for (const k of keys) { const n = parseInt(ships[k], 10) || 0; if (n > 0) f[k] = n; }
    return f;
  };
  if (intent === 'scout')    return { sonde: 1 };
  if (intent === 'attack')   return take(['jaeger', 'grossjaeger', 'kutter', 'ernter', 'sonde']);
  if (intent === 'harvest')  return take(['ernter', 'kutter']);
  if (intent === 'colonize') return Object.assign({ kolonie: 1 }, take(['jaeger']));
  return {};
}

async function wrSend(intent) {
  if (_wrBusy) return;
  const m = _wrMember;
  if (wrTrips(m).length >= 5) { wrToast('Maximal 5 Flotten gleichzeitig unterwegs.', 'error'); return; }

  // Ziel bestimmen: bei Nebel der erste Planet des Quadranten (Aufklärung gilt dem Quadranten)
  let planet = _wrSel?.planet;
  if (!planet && _wrSel?.fog) planet = wrPlanetsOf(_wrSel.q.key)[0];
  if (!planet) { wrToast('Kein Ziel gewählt.', 'error'); return; }

  // Der vom Spieler gestellte Verband (Nullwerte raus — der Server lehnt '{}' ab)
  const sel = wrSyncFleetSel(m);
  const fleet = {};
  for (const [k, n] of Object.entries(sel)) if (n > 0) fleet[k] = n;
  if (!Object.keys(fleet).length) { wrToast('Kein Schiff im Verband — wähle oben aus, was mitfliegt.', 'error'); return; }

  // Auftragsbedingte Mindestanforderungen, bevor die Flotte umsonst startet
  if (intent === 'scout'    && !(fleet.sonde   > 0)) { wrToast('Ohne 🛰️ Bohnen-Sonde lässt sich kein Quadrant aufklären.', 'error'); return; }
  if (intent === 'colonize' && !(fleet.kolonie > 0)) { wrToast('Ohne 🛸 Kolonieschiff keine Kolonie.', 'error'); return; }
  if (intent === 'harvest'  && wrFleetMine(fleet) < 1) { wrToast('Ohne ⛏️ Röstkometen gibt es nichts abzubauen.', 'error'); return; }
  if (intent === 'attack'   && wrFleetPower(fleet) < 1) { wrToast('Dieser Verband hat keine Kampfkraft.', 'error'); return; }

  // 💎 Treibstoff-Vorabcheck (Server prüft autoritativ nochmal — 22h)
  const fuel = wrTripFuel(fleet, planet.ring);
  if (fuel > 0 && wrKristall(m) < fuel) {
    wrToast(`Nicht genug 💎 Kristall als Treibstoff: Reise braucht ${wrFmt(fuel)}, du hast ${wrFmt(wrKristall(m))}.`, 'error');
    return;
  }

  _wrBusy = true;
  try {
    const res = await DB.startSpaceTrip(m.id, planet.id, intent, fleet, wrSpeedPct(m));
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    const info = SPACE_INTENTS[intent] || {};
    // JP 2026-07-22 (#32): „zurück in 30 Min" ergab bei der Kolonie keinen Sinn —
    // das Kolonieschiff BLEIBT am Ziel, nur die Eskorte kehrt zurück.
    const fuelTxt = (res.fuel > 0) ? ` · 💎 −${wrFmt(res.fuel)} Treibstoff` : '';
    wrToast(intent === 'colonize'
      ? `🛸 Kolonie-Mission gestartet — Gründung bei Ankunft in ${wrCountdown(Date.parse(res.trip.arriveAt) - Date.now())}; `
        + `das Kolonieschiff bleibt dort, der Rest kehrt zurück${fuelTxt}`
      : `${info.icon || '🚀'} Flotte gestartet — zurück in ${wrCountdown(Date.parse(res.trip.returnAt) - Date.now())}${fuelTxt}`,
      'success');

    // Chat: offene Werft-Käufe zuerst rausschreiben, damit die Reihenfolge stimmt
    wrBuyFlush();
    const list = Object.entries(fleet)
      .map(([k, n]) => `${wrArtTok(k)} ${n}`).join(' · ');
    wrChat(`${info.icon || '🚀'} ${_wrEsc(m.name)} schickt einen Verband (${list}) zum ${_wrEsc(planet.name)} — `
         + `Auftrag: ${_wrEsc(info.name || intent)}, zurück in ${wrCountdown(Date.parse(res.trip.returnAt) - Date.now())}.`);
    wrRender();
  } catch (e) {
    wrToast('Start fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrBuildCart() {
  if (_wrBusy) return;
  const cart = {};
  for (const [k, n] of Object.entries(_wrCart || {})) if (n > 0) cart[k] = n;
  if (!Object.keys(cart).length) { wrToast('Es ist kein Schiff eingeplant.', 'error'); return; }
  _wrBusy = true;
  try {
    // Preise rechnet der SERVER (build_space_cart) — beim Warenkorb wäre ein vom Client
    // mitgeschickter Preis je Position eine offene Flanke.
    const res = await DB.buildSpaceCart(_wrMember.id, cart);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins_left === 'number') wrApplyCoins(res.coins_left);
    _wrCart = null;

    const lines = Array.isArray(res.lines) ? res.lines : [];
    const total = lines.reduce((a, l) => a + (l.count || 0), 0);
    const longest = lines.reduce((a, l) => Math.max(a, l.minutes || 0), 0);
    // Abgebuchte Kosten im Toast — der Server liefert die ECHTEN Beträge (inkl.
    // Werft-Rabatt + Raffinerie), damit sieht JP sofort, was wirklich abging.
    const paid = [`${wrFmt(res.cc || 0)} CC`]
      .concat(res.erz ? [`${wrFmt(res.erz)} 🪨`] : [])
      .concat(res.kristall ? [`${wrFmt(res.kristall)} 💎`] : []).join(' · ');
    wrToast(`🏗️ ${wrFmt(total)} Schiff(e) in Bau — fertig in ${wrDur(longest)} (${paid})`, 'success');
    for (const l of lines) {
      const sd = SPACE_SHIP_BY_KEY[l.ship];
      if (sd) for (let i = 0; i < (l.count || 0); i++) wrBuyTrack(sd);
    }
    // Sofort in den Chat statt 60-s-Sammler: ein Warenkorb IST schon die Sammlung —
    // und wer die App direkt nach dem Auftrag schließt, verlöre die Meldung sonst.
    // Chat-Protokoll bekommt die Server-Beträge statt der aufsummierten Basispreise.
    if (_wrBuySession) {
      _wrBuySession.cc  = res.cc || 0;
      _wrBuySession.erz = res.erz || 0;
      _wrBuySession.kri = res.kristall || 0;
    }
    wrBuyFlush();
    wrRender();
  } catch (e) {
    wrToast('Bau fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Fertige Schiffe aus der Werft übernehmen (zeitbasiert, wie alles hier).
async function wrClaimBuild(silent) {
  if (_wrBusy) return false;
  const jobs = wrYardJobs(_wrMember);
  const due  = Object.values(jobs).some(j => j && typeof j === 'object'
                                          && Date.now() >= Date.parse(j.doneAt));
  if (!due) return false;
  _wrBusy = true;
  try {
    const res = await DB.claimSpaceBuild(_wrMember.id);
    if (!res || res.error) {
      if (!silent && res.error) wrToast(wrErrText(res.error), 'error');
      return false;
    }
    if (res.space) wrApplySpace(res.space);
    if (res.built && Array.isArray(res.got) && res.got.length) {
      const txt = res.got.map(g => `${wrFmt(g.count)}× ${SPACE_SHIP_BY_KEY[g.ship]?.name || g.ship}`);
      wrToast(`🚀 Fertiggestellt: ${txt.join(' · ')}`, 'success');
      // 🛩️ Trägerverband (26m). Eigener Feldname `builtShips`, damit die Prüfung dort
      // nicht versehentlich an den Reise-/Aktions-Feldern hängt. Regel 3: nie blockierend.
      try {
        if (typeof checkSpaceAchievements === 'function') {
          await checkSpaceAchievements(_wrMember, { builtShips: res.got, space: res.space });
        }
      } catch (e) { /* non-critical */ }
    }
    if (!silent) wrRender();
    return true;
  } catch (e) {
    if (!silent) wrToast('Übernahme fehlgeschlagen: ' + e.message, 'error');
    return false;
  } finally { _wrBusy = false; }
}


// ── Angriffswellen: Aktionen ────────────────────────────────────────────────
async function wrRequestHelp() {
  if (_wrBusy || !_wrWave) return;
  _wrBusy = true;
  try {
    const res = await DB.requestSpaceHelp(_wrMember.id);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    _wrWave.helpOpen = true;
    const tier = wrWaveTier(_wrWave.strength);
    wrToast('📣 Hilferuf abgesetzt', 'success');
    wrChat(`📣 ${_wrEsc(_wrMember.name)} ruft um Hilfe! Ein ${_wrEsc(tier.name)} (Stärke `
         + `${wrFmt(_wrWave.strength)}) trifft in ${wrCountdown(Date.parse(_wrWave.arriveAt) - Date.now())} `
         + `am Raumhafen ein. Wer Schiffe übrig hat: 🚀 Weltall-Tab → Verstärkung schicken!`);
    await wrLoadWaves(false);
    wrRender();
  } catch (e) {
    wrToast('Hilferuf fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

async function wrResolveWave() {
  if (_wrBusy || _wrResolving) return;
  _wrBusy = true; _wrResolving = true;
  try {
    const res = await DB.resolveSpaceWave(_wrMember.id);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.nothing) { await wrLoadWaves(false); wrRender(); return; }
    if (res.space) wrApplySpace(res.space);
    wrWaveReport(res);
    wrChatWave(res);
    try { if (typeof checkSpaceAchievements === 'function') await checkSpaceAchievements(_wrMember, res); } catch (e) {}
    await wrLoadWaves(false);
    wrRender();
  } catch (e) {
    wrToast('Abwehr fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; _wrResolving = false; }
}

// Verstärkung schicken — nutzt denselben Verband-Picker wie die Reisen.
function wrHelpDialog(waveId) {
  const m = _wrMember;
  const w = (_wrAllWaves || []).find(x => x.id === waveId);
  if (!w) return;
  _wrHelpFleet = _wrHelpFleet || {};
  const ships = wrHomeShips(m);
  let rows = '';
  for (const s of SPACE_SHIPS) {
    const have = parseInt(ships[s.key], 10) || 0;
    if (have < 1) continue;
    const n = Math.min(have, parseInt(_wrHelpFleet[s.key], 10) || 0);
    rows += `
      <div class="wr-fs-row${n > 0 ? ' wr-fs-on' : ''}">
        <span class="wr-fs-ic">${wrShipArt(s.key, 'wr-mini wr-mini-md')}</span>
        <span class="wr-fs-name">${_wrEsc(s.name)}<span class="wr-sub">⚔️ ${s.atk}</span></span>
        <span class="wr-fs-stepper">
          <button class="wr-fs-btn" data-wr-hadj="${s.key}:-1" ${n < 1 ? 'disabled' : ''}>−</button>
          <span class="wr-fs-n">${n}<span class="wr-sub">/${have}</span></span>
          <button class="wr-fs-btn" data-wr-hadj="${s.key}:1" ${n >= have ? 'disabled' : ''}>+</button>
        </span>
      </div>`;
  }
  const power = wrFleetPower(_wrHelpFleet);
  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-lightbox wr-fleetbox">
        <div class="wr-lb-title">🤝 Verstärkung für ${_wrEsc(wrMemberName(w.member_id))}</div>
        <div class="wr-lb-desc">Angriffsstärke <strong>${wrFmt(w.strength)}</strong> ·
          Einschlag in ${wrCountdown(Date.parse(w.arrive_at) - Date.now())}.
          Deine Schiffe kommen nach dem Kampf zurück — abzüglich der Verluste.</div>
        ${rows || '<div class="wr-warn">Du hast keine Schiffe im Hafen.</div>'}
        <div class="wr-fs-sum"><span>⚔️ Verstärkung: <strong>${wrFmt(power)}</strong></span></div>
        <button class="wr-btn wr-btn-go" id="wr-help-send" data-wave="${w.id}"
          ${power < 1 ? 'disabled' : ''}>🤝 Verband entsenden</button>
        <button class="wr-btn wr-btn-sm" id="wr-lb-ok">Abbrechen</button>
      </div>`;
    ov.addEventListener('click', async (e) => {
      const adj = e.target.closest('[data-wr-hadj]');
      if (adj && !adj.disabled) {
        const [key, d] = adj.dataset.wrHadj.split(':');
        const have = wrShipCount(_wrMember, key);
        _wrHelpFleet[key] = Math.max(0, Math.min(have,
          (parseInt(_wrHelpFleet[key], 10) || 0) + parseInt(d, 10)));
        wrHelpDialog(waveId);   // neu zeichnen
        return;
      }
      const send = e.target.closest('#wr-help-send');
      if (send && !send.disabled) { ov.remove(); await wrSendHelp(waveId); return; }
      if (e.target === ov || e.target.id === 'wr-lb-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) { /* non-critical */ }
}

async function wrSendHelp(waveId) {
  if (_wrBusy) return;
  const fleet = {};
  for (const [k, n] of Object.entries(_wrHelpFleet || {})) if (n > 0) fleet[k] = n;
  if (!Object.keys(fleet).length) { wrToast('Kein Schiff ausgewählt.', 'error'); return; }
  _wrBusy = true;
  try {
    const res = await DB.sendSpaceHelp(_wrMember.id, waveId, fleet);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    _wrHelpFleet = null;
    const w = (_wrAllWaves || []).find(x => x.id === waveId);
    wrToast(`🤝 Verstärkung unterwegs (⚔️ ${wrFmt(res.power)})`, 'success');
    const list = Object.entries(fleet).map(([k, n]) => `${wrArtTok(k)} ${n}`).join(' · ');
    wrChat(`🤝 ${_wrEsc(_wrMember.name)} schickt ${_wrEsc(wrMemberName(w?.member_id))} `
         + `Verstärkung (${list}, ⚔️ ${wrFmt(res.power)}).`);
    // `helped` ist das Signal für das Waffenbruder-Achievement
    try { if (typeof checkSpaceAchievements === 'function') {
      await checkSpaceAchievements(_wrMember, { helped: true, space: res.space });
    } } catch (e) {}
    await wrLoadWaves(false);
    wrRender();
  } catch (e) {
    wrToast('Verstärkung fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Dauerernte einrichten/ändern/auflösen.
async function wrSetRoute(planetId, count, mode) {
  if (_wrBusy) return;
  const wreck = mode === 'wreck';
  _wrBusy = true;
  try {
    const res = await DB.setSpaceRoute(_wrMember.id, planetId, count, mode || 'res');
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (_wrRouteSel) delete _wrRouteSel[planetId + (wreck ? ':w' : '')];
    const ship = wreck ? 'berger' : 'ernter';
    const nm   = SPACE_SHIP_BY_KEY[ship].name;
    wrToast(count > 0
      ? `${wreck ? '♻️' : '🛰️'} ${wrFmt(count)}× ${nm} bei ${res.planet} stationiert`
      : `${wreck ? '♻️' : '🛰️'} Route bei ${res.planet} aufgelöst`, 'success');
    if (count > 0) {
      wrChat(`${wreck ? '♻️' : '🛰️'} ${_wrEsc(_wrMember.name)} `
           + `${wreck ? 'bergt die Wracks bei' : 'richtet eine Dauerernte ein bei'} `
           + `${_wrEsc(res.planet)} (${wrArtTok(ship)} ${wrFmt(count)}×).`);
    }
    wrRender();
  } catch (e) {
    wrToast('Route fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Flotte zurückrufen. Nur auf dem Hinflug sinnvoll — der Button wird sonst gar nicht
// gerendert, der Server lehnt es zusätzlich ab (Client-Prüfungen sind nie die letzte Instanz).
async function wrRecall(tripId) {
  if (_wrBusy) return;
  const m = _wrMember;
  if (!wrTrips(m).length) return;
  _wrBusy = true;
  try {
    const res = await DB.recallSpaceTrip(m.id, tripId || null);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    const back = Date.parse(res.trip?.returnAt) - Date.now();
    wrToast(`↩️ Flotte kehrt um — zurück in ${wrCountdown(back)}`, 'info');
    wrChat(`↩️ ${_wrEsc(m.name)} hat den Verband zurückgerufen — der Auftrag wurde abgebrochen.`);
    wrRender();
  } catch (e) {
    wrToast('Rückruf fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Raumhafen ausbauen / Geschütz bauen / Geschütz aufrüsten.
// Kosten rechnet der SERVER (build_space_defense) — der Client schickt sie bewusst NICHT
// mit, anders als bei build_space. Die Werte hier dienen nur der Anzeige.
async function wrDefense(action, slot, type) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.buildSpaceDefense(_wrMember.id, action, slot, type);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins_left === 'number') wrApplyCoins(res.coins_left);

    const name = _wrMember?.name || 'Jemand';
    if (action === 'yard_upgrade') {
      const d = wrYardDef(res.level);
      wrToast(`🏗️ Werft auf Stufe ${res.level} ausgebaut`, 'success');
      wrChat(`🏗️ ${_wrEsc(name)} hat die Werft auf Stufe ${res.level} ausgebaut `
           + `(${wrFmt(res.cc)} CC) — jetzt ${Math.round(d.timeCut * 100)} % schneller `
           + `und ${Math.round(d.costCut * 100)} % günstiger.`);
    } else if (action === 'port_upgrade') {
      wrToast(`🛰️ Raumhafen auf Stufe ${res.level} ausgebaut`, 'success');
      wrChat(`[[s:hafen]] ${_wrEsc(name)} hat den Raumhafen auf Stufe ${res.level} ausgebaut `
           + `(${wrFmt(res.cc)} CC) — jetzt ${wrPortDef(res.level).slots} Bauslots.`);
    } else if (action === 'turret_convert') {
      // 26k: eigener Zweig — „aufgerüstet" wäre hier irreführend, es ist ein Typwechsel.
      const t = SPACE_TURRET_BY_KEY[res.type] || {};
      const f = SPACE_TURRET_BY_KEY[res.from] || {};
      wrToast(`${t.icon || '🛡️'} Umgerüstet auf ${t.name || 'Geschütz'} `
            + `(${wrFmt(res.cc)} CC${res.rebate > 0 ? `, ${wrFmt(res.rebate)} CC angerechnet` : ''})`, 'success');
      wrChat(`[[s:${res.type}]] ${_wrEsc(name)} hat am Raumhafen `
           + `${_wrEsc(f.name || 'ein Geschütz')} auf ${_wrEsc(t.name || 'ein neues Geschütz')} umgerüstet `
           + `— Feuerkraft jetzt 🛡️ ${wrFmt(res.turretPower)}.`);
    } else {
      const t = SPACE_TURRET_BY_KEY[res.type] || {};
      const verb = action === 'turret_build' ? 'gebaut' : `auf Stufe ${res.level} aufgerüstet`;
      wrToast(`${t.icon || '🛡️'} ${t.name || 'Geschütz'} ${verb}`, 'success');
      wrChat(`[[s:${res.type}]] ${_wrEsc(name)} hat am Raumhafen ${_wrEsc(t.name || 'ein Geschütz')} ${verb} `
           + `— Feuerkraft jetzt 🛡️ ${wrFmt(res.turretPower)}.`);
    }
    // ⚠️ KEIN Tages-Log-Eintrag hier — das erledigt bereits DB.buildSpaceDefense
    // (db.js, aggKey 'space_defense'). Ein zweiter Eintrag an dieser Stelle würde die
    // Ausgabe doppelt buchen. Regel 1 ist damit über die db.js-Seite erfüllt.
    //
    // 🏰 Bastion-Achievement (26k). `harbor:true` ist PFLICHT — build_space_defense und
    // build_planet_defense liefern beide `action:'turret_build'`; ohne die Kennzeichnung
    // gäbe es „Festungswelt" (Planet) für ein Hafen-Geschütz. Regel 3: nie blockierend.
    try {
      if (typeof checkSpaceAchievements === 'function') {
        await checkSpaceAchievements(_wrMember, Object.assign({}, res, { harbor: true }));
      }
    } catch (e) { /* non-critical */ }
    wrRender();
  } catch (e) {
    wrToast('Bau fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// 🛸 Mutterschiff auf Kiel legen (26j). Bauteile und Kosten prüft der SERVER —
// der Client schickt nichts als seine ID. Die Rümpfe sind sofort weg (sie fliegen aus),
// das Flaggschiff kommt über die normale Werft-Abholung.
async function wrBuildMutterschiff() {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.buildMutterschiff(_wrMember.id);
    if (!res || res.error) {
      // Fehlende Rümpfe im Klartext auflisten — „missing_parts" allein hilft niemandem.
      if (res && res.error === 'missing_parts' && Array.isArray(res.missing)) {
        const txt = res.missing.map(x =>
          `${SPACE_SHIP_BY_KEY[x.ship]?.name || x.ship}: ${x.have}/${x.need}`).join(' · ');
        wrToast('Es fehlen Rümpfe — ' + txt, 'error');
      } else {
        wrToast(wrErrText(res?.error), 'error');
      }
      return;
    }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins_left === 'number') wrApplyCoins(res.coins_left);
    _wrCart = null;
    wrToast(`🛸 Mutterschiff auf Kiel gelegt — fertig in ${wrDur(res.minutes)}`, 'success');
    wrChat(`[[s:mutterschiff]] ${_wrEsc(_wrMember?.name || 'Jemand')} lässt ein `
         + `<strong>Mutterschiff</strong> bauen: ${WR_MUTTER_PARTS.map(p =>
             `${p.count}× ${SPACE_SHIP_BY_KEY[p.ship]?.name || p.ship}`).join(', ')} `
         + `sind ausgeflogen und gehen darin auf — ${wrFmt(res.cc)} CC obendrauf.`);
    wrRender();
  } catch (e) {
    wrToast('Bau fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// 🛡️ Feature ④ (26h): Kolonie ausbauen / Geschütz bauen / Quadranten-Station.
// Kosten rechnet der SERVER (build_planet_defense) — der Client schickt nur die Aktion.
// 26l: slot/type kamen dazu (Kolonie hat drei Bauplätze). Die alten Aufrufer
// (colony_upgrade, station_build) rufen weiterhin mit zwei Argumenten auf — die RPC
// hat für beide Parameter DEFAULT NULL.
async function wrPlanetBuild(planetId, action, slot, type) {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.buildPlanetDefense(_wrMember.id, planetId, action, slot, type);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    if (typeof res.coins_left === 'number') wrApplyCoins(res.coins_left);

    const name = _wrMember?.name || 'Jemand';
    const pl   = res.planet || 'Planet';
    if (action === 'colony_upgrade') {
      wrToast(`🏙️ ${pl} auf Kolonie-Stufe ${res.level} ausgebaut`, 'success');
      wrChat(`🏙️ ${_wrEsc(name)} hat die Kolonie ${_wrEsc(pl)} auf Stufe ${res.level} `
           + `ausgebaut (${wrFmt(res.cc)} CC) — mehr Ertrag pro Tag.`);
    } else if (action === 'station_build') {
      wrToast(`📡 Quadranten-Station bei ${pl} errichtet`, 'success');
      wrChat(`📡 ${_wrEsc(name)} hat bei ${_wrEsc(pl)} eine <strong>Quadranten-Station</strong> errichtet — `
           + `alle befreiten Planeten in ${_wrEsc(res.quadrant || '')} sind jetzt vor Rückeroberung geschützt.`);
    } else {
      // 26l: Kolonie-Geschütze sind jetzt einzelne Waffen auf Bauplätzen, nicht mehr
      // eine Pauschalstufe — die Meldung nennt deshalb den Typ statt „Stufe N".
      const t = SPACE_TURRET_BY_KEY[res.type] || {};
      const f = SPACE_TURRET_BY_KEY[res.from] || {};
      const verb = action === 'turret_convert' ? `umgerüstet (${f.name || '?'} → ${t.name || '?'})`
                 : action === 'turret_upgrade' ? 'aufgerüstet' : 'gebaut';
      wrToast(`${t.icon || '🛡️'} ${t.name || 'Geschütz'} auf ${pl} ${verb}`, 'success');
      wrChat(`[[s:${res.type}]] ${_wrEsc(name)} hat auf der Kolonie ${_wrEsc(pl)} `
           + `${_wrEsc(t.name || 'ein Geschütz')} ${_wrEsc(verb)} (${wrFmt(res.cc)} CC) — `
           + `🛡️ ${wrFmt(res.defense)} Feuerkraft, ${res.slots || 0} von ${WR_PLANET_SLOTS} Bauplätzen belegt.`);
    }
    try { if (typeof checkSpaceAchievements === 'function') await checkSpaceAchievements(_wrMember, res); } catch (e) {}
    // Die Planetenzeile hat sich geändert (Stufe/Geschütz/Station) → Galaxie neu holen,
    // sonst zeigt die Karte den alten Stand und das Panel rechnet gegen alte Werte.
    await wrEnsureGalaxy(true);
    if (_wrSel?.planet) _wrSel.planet = wrPlanetById(_wrSel.planet.id) || _wrSel.planet;
    wrRender();
  } catch (e) {
    wrToast('Ausbau fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// silent = beim Öffnen des Tabs (kein Popup, wenn nichts zu tun ist)
async function wrTryClaim(silent) {
  const m = _wrMember;
  if (_wrClaiming) return false;
  // 🚀 Multi-Flotte: ist IRGENDEIN Trip fällig? Dann in Schleife alle fälligen abrechnen.
  const due = wrTrips(m).some(t => Date.now() >= Date.parse(t.returnAt));
  if (!due) return false;
  _wrClaiming = true;
  try {
    let any = false, guard = 0;
    while (guard++ < 6) {   // Schutz: maximal 5 Flotten gleichzeitig
      const res = await DB.claimSpaceArrival(m.id);
      if (!res || res.error) {
        if (res?.error !== 'still_traveling' && !silent) wrToast(wrErrText(res?.error), 'error');
        break;
      }
      if (res.space) wrApplySpace(res.space);
      if (!res.nothing) {
        wrReport(res);
        wrChatReport(res, m?.name);
        try { if (typeof checkSpaceAchievements === 'function') await checkSpaceAchievements(_wrMember, res); } catch (e) {}
      }
      any = true;
      if (!res.more) break;   // keine weiteren fälligen Trips
    }
    if (any) {
      await wrEnsureGalaxy(true);          // Planeten-Status/Nebel können sich geändert haben
      if (!silent) wrRender();
    }
    return any;
  } catch (e) {
    if (!silent) wrToast('Abrechnung fehlgeschlagen: ' + e.message, 'error');
    return false;
  } finally { _wrClaiming = false; }
}

async function wrHarvest() {
  if (_wrBusy) return;
  _wrBusy = true;
  try {
    const res = await DB.harvestSpace(_wrMember.id);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    const parts = [];
    if (res.erz > 0)      parts.push(`${wrFmt(res.erz)} 🪨`);
    if (res.kristall > 0) parts.push(`${wrFmt(res.kristall)} 💎`);
    if (res.fuel > 0)     parts.push(`−${wrFmt(res.fuel)} 💎 Treibstoff`);
    wrToast(parts.length ? `📥 Eingesammelt: ${parts.join(' · ')}` : 'Noch nichts zu holen.',
            parts.length ? 'success' : 'info');
    if (Array.isArray(res.emptied) && res.emptied.length) {
      for (const e of res.emptied) {
        wrToast(`♻️ Wrackfeld bei ${e.name} vollständig abgetragen — `
              + `${wrFmt(e.count)} Bergungsschiff(e) sind zurück im Hafen.`, 'info');
      }
    }
    if (res.paused > 0) {
      wrToast(`⚠️ ${wrFmt(res.paused)} Route(n) pausieren — der Kristall reicht nicht als Treibstoff.`, 'error');
    }
    wrRender();
  } catch (e) {
    wrToast('Einsammeln fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ── Chat-Meldung nach der Rückkehr ──────────────────────────────────────────
// Nur die Ereignisse posten, die für die Gruppe interessant sind (befreiter Planet,
// aufgeklärter Quadrant, neue Kolonie) — nicht jeden Erntflug.
function wrChatReport(r, name) {
  try {
    if (!r || r.nothing) return;
    const who = _wrEsc(name || _wrMember?.name || 'Jemand');
    const loss = r.shipsLost > 0
      ? ` (Verluste: ${wrFmt(r.shipsLost)} Schiff(e)${_wrEsc(wrLossBreakdown(r.lost))})` : '';
    if (r.recalled) {
      return;   // beim Auslösen bereits gepostet
    } else if (r.ambushed) {
      wrChat(`💥 ${who} ist unterwegs in einen Hinterhalt geraten (Stärke ${wrFmt(r.ambush)}) `
           + `und musste umkehren${loss}.`, name);
    } else if (r.intent === 'attack') {
      if (r.won) {
        const kap = (r.foundShip && r.foundCount > 0)
          ? ` Dabei wurde ein feindliches Schiff gekapert: ${wrArtTok(r.foundShip)} `
            + `${_wrEsc(SPACE_SHIP_BY_KEY[r.foundShip]?.name || r.foundShip)}!`
          : '';
        // JP 2026-07-22: die Beute gehört in die Meldung — bisher stand sie nur im Popup
        const b = [];
        if (r.cc > 0)       b.push(`${wrFmt(r.cc)} CC`);
        if (r.erz > 0)      b.push(`${wrFmt(r.erz)} ${wrArtTok('erz')} Erz`);
        if (r.kristall > 0) b.push(`${wrFmt(r.kristall)} ${wrArtTok('kristall')} Kristall`);
        // 26c liefert die Ring-Rohstoffe mit — sie fehlten nur in der Meldung (JP 2026-07-29).
        // ⚠️ `plasmoid`/`quantum` mussten dafür in CHAT_ART (app.js) ergänzt werden, sonst
        // steht statt des Bildes ein neutrales Ersatzsymbol im Chat.
        if (r.plasmoid > 0) b.push(`${wrFmt(r.plasmoid)} ${wrArtTok('plasmoid')} Plasmoiden-Staub`);
        if (r.quantum > 0)  b.push(`${wrFmt(r.quantum)} ${wrArtTok('quantum')} Quantenschaum`);
        const beute = b.length ? ` Beute: ${b.join(' · ')}.` : '';
        wrChat(`⚔️ ${who} hat die Wächter von ${_wrEsc(r.planet)} besiegt — Planet befreit!${loss}${beute}${kap}`, name);
      } else {
        wrChat(`💥 ${who} ist bei ${_wrEsc(r.planet)} an den Wächtern gescheitert${loss}.`, name);
      }
    } else if (r.intent === 'scout') {
      const fund = (r.foundShip && r.foundCount > 0)
        ? ` Und im Nebel trieb ein Wrack: ${wrArtTok(r.foundShip)} ${wrFmt(r.foundCount)}× `
          + `${_wrEsc(SPACE_SHIP_BY_KEY[r.foundShip]?.name || r.foundShip)} geborgen!`
        : '';
      wrChat(`🛰️ ${who} hat Quadrant ${_wrEsc(r.quadrant)} aufgeklärt — der ganze Clan sieht ihn jetzt.${fund}`, name);
    } else if (r.intent === 'colonize' && !r.note) {
      wrChat(`🪐 ${who} hat eine Kolonie auf ${_wrEsc(r.planet)} gegründet!`, name);
    }
  } catch (e) { /* non-critical */ }
}

// ── Schiff in groß ansehen ──────────────────────────────────────────────────
// Die Portraits aus assets/space/ sind 256² — in der Werft-Zeile sieht man davon fast
// nichts. Klick auf das Bild/„Details" öffnet es formatfüllend samt Werten.
// „Stark gegen" in einem Satz — die Rollen sind sonst nur Zahlen in einer Tabelle.
function wrRoleVsText(key) {
  const r = SPACE_ROLES[key];
  if (!r) return '—';
  const gut = [];
  if (r.vsLight  > 0) gut.push('leichte');
  if (r.vsHeavy  > 0) gut.push('schwere');
  if (r.vsStruct > 0) gut.push('Geschütze');
  if (!gut.length) return (r.vsLight < 0 || r.vsHeavy < 0) ? 'nichts (Zivilschiff)' : '—';
  return gut.join(', ');
}
function wrShipLightbox(shipKey) {
  const s = SPACE_SHIP_BY_KEY[shipKey];
  if (!s) return;
  const m = _wrMember;
  const have = wrShipCount(m, s.key);
  const cost = [`${wrFmt(s.cc)} CC`];
  if (s.erz)      cost.push(`${wrFmt(s.erz)} ${wrIc('erz')}`);
  if (s.kristall) cost.push(`${wrFmt(s.kristall)} ${wrIc('kri')}`);
  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-lightbox">
        <div class="wr-lb-art">
          <img src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()">
          <span class="wr-lb-fb">${s.icon}</span>
        </div>
        <div class="wr-lb-title">${_wrEsc(s.name)}</div>
        <div class="wr-lb-desc">${_wrEsc(s.desc)}</div>
        <div class="wr-lb-stats">
          <span>${wrIc("atk")} Kampfkraft<strong>${s.atk || '—'}</strong></span>
          <span>${wrIc("mine")} Abbau<strong>${s.mine || '—'}</strong></span>
          <span>💰 Kosten<strong>${cost.join(' · ')}</strong></span>
          <span>${wrIc("port")} Im Hafen<strong>${wrFmt(have)}</strong></span>
          <span>${wrIc("time")} Bauzeit<strong>${wrDur(s.buildMin)}</strong></span>
          <span>${(SPACE_ROLES[s.key] && SPACE_ROLES[s.key].cls === 'heavy') ? '🔷' : '🔹'} Klasse<strong>${
            (SPACE_ROLES[s.key] && SPACE_ROLES[s.key].cls === 'heavy') ? 'schwer' : 'leicht'}</strong></span>
          <span>🛡️ Schild<strong>${Math.round(((SPACE_ROLES[s.key] || {}).shield || 0) * 100)} %</strong></span>
          <span>➜ Stark gegen<strong>${wrRoleVsText(s.key)}</strong></span>
        </div>
        <button class="wr-btn wr-btn-go" id="wr-lb-ok">Schließen</button>
      </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.id === 'wr-lb-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) { /* non-critical */ }
}

// Gemeinsames Gerüst für alle „groß ansehen"-Popups (Schiff, Geschütz, Raumhafen).
function wrArtLightbox(art, icon, title, desc, stats, folder) {
  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-lightbox">
        <div class="wr-lb-art">
          <img src="assets/${folder || 'space'}/${art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()">
          <span class="wr-lb-fb">${icon}</span>
        </div>
        <div class="wr-lb-title">${_wrEsc(title)}</div>
        <div class="wr-lb-desc">${_wrEsc(desc)}</div>
        <div class="wr-lb-stats">
          ${stats.map(([l, v]) => `<span>${l}<strong>${v}</strong></span>`).join('')}
        </div>
        <button class="wr-btn wr-btn-go" id="wr-lb-ok">Schließen</button>
      </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.id === 'wr-lb-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) { /* non-critical */ }
}

function wrTurretLightbox(type) {
  const t = SPACE_TURRET_BY_KEY[type];
  if (!t) return;
  const s = [1, 2, 3].map(lv => wrTurretStats(t.key, lv));
  const frei = wrTurretUnlocked(_wrMember, t.key);
  wrArtLightbox(t.art, t.icon, t.name, t.desc, [
    [`${wrIc("def")} Feuerkraft`, `${s[0].atk} / ${s[1].atk} / ${s[2].atk}`],
    [`${wrIc("yard")} Hafen ab`, `Stufe ${t.minPort}`],
    ['💰 Neubau', `${wrFmt(t.cc)} CC${t.plasmoid ? ` · ${t.plasmoid} 🟣` : ''}`],
    ['⬆️ Ausbau', `${wrFmt(s[1].cc)} / ${wrFmt(s[2].cc)} CC`],
    // 26k: die Freischaltung gehört sichtbar dazu — sonst rätselt man, warum „Bauen" fehlt.
    ['🔬 Forschung', t.needs ? `${frei ? '✓ ' : '🔒 '}${_wrEsc(wrTechName(t.needs))}` : '— frei verfügbar'],
  // ⚠️ Der Ordner MUSS mit: die Geschütz-Bilder liegen seit JPs Meldung vom 29.07.
  // alle in assets/weltraum/ (die Forschungs-Renders).
  ], wrTurretFolder(t));
}

// 🔬 Zoom für Forschungselemente (JP 2026-07-26): großes Bild + Wirkung/Kosten/Status.
function wrTechLightbox(key) {
  const t = SPACE_TECH_BY_KEY[key];
  if (!t) return;
  const st = wrTechState(_wrMember, t);
  const stLabel = { owned: '✓ erforscht', soon: 'in Vorbereitung', locked: '🔒 Voraussetzung fehlt',
                    poor: 'Mittel reichen nicht', buy: 'erforschbar' }[st] || '';
  const ast = SPACE_TECH_ASTE.find(a => a.key === t.ast) || {};
  const cost = [`${wrFmt(t.cc)} CC`]
    .concat(t.erz ? [`${wrFmt(t.erz)} 🪨`] : [])
    .concat(t.kristall ? [`${wrFmt(t.kristall)} 💎`] : [])
    .concat(t.plasmoid ? [`${wrFmt(t.plasmoid)} 🟣`] : [])
    .concat(t.quantum ? [`${wrFmt(t.quantum)} 🌀`] : []).join(' · ');
  const rows = [['💰 Kosten', cost], ['📊 Status', stLabel], [`${ast.icon || '🔬'} Ast`, _wrEsc(ast.name || '')]];
  if (t.requires) rows.push(['🔗 Braucht', _wrEsc((SPACE_TECH_BY_KEY[t.requires] || {}).name || t.requires)]);
  wrArtLightbox(t.art, ast.icon || '🔬', t.name, t.wirkung, rows, 'weltraum');
}

function wrWerftLightbox() {
  const m = _wrMember;
  const built = SPACE_SHIPS.reduce((a, s) => a + wrShipCount(m, s.key), 0);
  wrArtLightbox('base_werft_' + wrYardLevel(m), '🏗️', 'Werft am Raumhafen',
    'Das Trockendock deines Hafens. Hier entstehen alle Schiffe; fertige Rümpfe werden '
  + 'direkt in die Heimatflotte übergeben. Eine ausgebaute Werft baut schneller und günstiger.', [
    [`${wrIc("fleet")} Gebaut`, wrFmt(built)],
    [`${wrIc("yard")} Werft-Stufe`, wrYardLevel(m)],
    [`${wrIc("time")} Bauzeit`, `−${Math.round(wrYardDef(wrYardLevel(m)).timeCut * 100)} %`],
    ['💰 Kosten', `−${Math.round(wrYardDef(wrYardLevel(m)).costCut * 100)} %`],
  ]);
}

function wrPortLightbox() {
  const m = _wrMember, lv = wrBaseLevel(m), def = wrPortDef(lv);
  wrArtLightbox('base_' + lv, '🛰️', `Raumhafen — Stufe ${lv}`,
    'Dein persönlicher Heimatstützpunkt. Von hier startet jede Reise, hier stehen deine '
  + 'Geschütze und hier liegt die Heimatflotte. Alle Clan-Mitglieder starten aus demselben '
  + 'Quadranten, aber jeder baut seinen eigenen Hafen aus.', [
    ['⬚ Bauslots', def.slots],
    [`${wrIc("def")} Feuerkraft`, wrFmt(wrTurretPower(m))],
    [`${wrIc("fleet")} Schiffe`, wrFmt(Object.values(wrHomeShips(m)).reduce((a, b) => a + (parseInt(b, 10) || 0), 0))],
    [`${wrIc("colony")} Kolonien`, wrFmt(Object.keys(wrColonies(m)).length)],
  ]);
}

// ── Flotte unterwegs: Detail-Ansicht ────────────────────────────────────────
// Erreichbar über den Klick auf die Reise-Karte ODER auf das Schiff auf der Sternkarte.
function wrFleetLightbox(tripId) {
  const m = _wrMember;
  const trips = wrTrips(m);
  const trip = tripId ? (trips.find(t => t.id === tripId) || trips[0]) : trips[0];
  if (!trip) return;
  const ships  = wrTripShipsDisplay(trip);   // #36: Kolonieschiff auf dem Rückflug nicht mehr zeigen
  const target = (_wrGalaxy?.planets || []).find(p => p.id === trip.planetId);
  const info   = SPACE_INTENTS[trip.intent] || { icon: '🚀', name: trip.intent };
  const power  = wrFleetPower(ships), mine = wrFleetMine(ships);
  const now = Date.now(), arrive = Date.parse(trip.arriveAt), ret = Date.parse(trip.returnAt);
  const phase = now >= ret ? 'zurück im Hafen'
              : (now >= arrive ? 'am Ziel — Rückflug läuft' : 'auf dem Hinflug');

  let rows = '';
  for (const [k, n] of Object.entries(ships)) {
    const s = SPACE_SHIP_BY_KEY[k];
    if (!s || (parseInt(n, 10) || 0) < 1) continue;
    rows += `
      <div class="wr-fl-row">
        <span class="wr-fl-art"><img src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-fl-fb">${s.icon}</span></span>
        <span class="wr-fl-name">${_wrEsc(s.name)}</span>
        <span class="wr-fl-n">×${wrFmt(n)}</span>
        <span class="wr-fl-atk">${s.atk ? `⚔️ ${wrFmt(s.atk * n)}` : (s.mine ? `⛏️ ${wrFmt(s.mine * n)}` : '—')}</span>
      </div>`;
  }

  // Erwartete Ausbeute — dieselben Formeln wie in claim_space_arrival, rein als Vorschau.
  // ⚠️ Doppelseitig (21p + 22d): Rebalance Stärke×50 + Reichtum×400 mit Boden 2000 CC,
  // Rohstoff-Beute Reichtum×45 (Erz) bzw. ×22 (Kristall). Die alte Vorformel (×4/×60)
  // zeigte JP „624 CC", während der Server längst mehr auszahlt.
  const beute = [];
  if (target) {
    if (trip.intent === 'attack' && !target.cleared_by) {
      beute.push(`${wrFmt(Math.max(2000, target.enemy_strength * 50 + target.richness * 400))} CC bei Sieg`);
      { const rm = wrResMeta(target.resource_type);
        beute.push(wrResMinable(m, target.resource_type)
          ? `${wrFmt(Math.round(target.richness * rm.loot))} ${rm.icon} ${rm.name}`
          : `🔒 ${rm.name} (Abbau-Tech fehlt)`); }
    } else if (trip.intent === 'harvest') {
      const rm = wrResMeta(target.resource_type);
      beute.push(wrResMinable(m, target.resource_type)
        ? `${wrFmt(Math.round(mine * target.richness * rm.mine))} ${rm.icon} ${rm.name}`
        : `🔒 ${rm.name} (Abbau-Tech fehlt)`);
    } else if (trip.intent === 'scout') {
      beute.push('Quadrant wird für den ganzen Clan aufgedeckt');
    } else if (trip.intent === 'colonize') {
      beute.push('Dauerhafte Kolonie (Ertrag sammelt sich an)');
    }
  }

  const risk = wrAmbushHint(target?.ring || 0, power, wrTurretPower(m));

  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-lightbox wr-fleetbox">
        <div class="wr-lb-title">Verband unterwegs</div>
        <div class="wr-lb-desc">${_wrEsc(info.name)} → <strong>${_wrEsc(target?.name || 'Planet')}</strong>
          ${target ? `<span class="wr-sub">(Quadrant ${_wrEsc(target.quadrant)} · Ring ${target.ring})</span>` : ''}</div>
        <div class="wr-fl-list">${rows || '<div class="wr-sub">—</div>'}</div>
        <div class="wr-lb-stats">
          <span>${wrIc("atk")} Kampfkraft<strong>${wrFmt(power)}</strong></span>
          <span>${wrIc("mine")} Abbau<strong>${mine ? wrFmt(mine) : '—'}</strong></span>
          <span>🚩 Status<strong>${phase}</strong></span>
          <span>${wrIc("time")} Rückkehr<strong>${now >= ret ? 'jetzt' : wrCountdown(ret - now)}</strong></span>
        </div>
        ${beute.length ? `<div class="wr-fl-beute">🎁 Erwartet: ${beute.map(_wrEsc).join(' · ')}</div>` : ''}
        ${risk ? `<div class="wr-fl-risk">${risk}</div>` : ''}
        <button class="wr-btn wr-btn-go" id="wr-lb-ok">Schließen</button>
      </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.id === 'wr-lb-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) { /* non-critical */ }
}

// ── Ergebnis der Angriffswelle ──────────────────────────────────────────────
function wrWaveReport(r) {
  const tier = wrWaveTier(r.strength);
  const lines = [];
  lines.push(r.won
    ? `<div class="wr-rep-head wr-good">🛡️ Angriff abgewehrt!</div>`
    : `<div class="wr-rep-head wr-bad">💥 Der Raumhafen wurde überrannt.</div>`);
  lines.push(`<div>${tier.icon} ${_wrEsc(tier.name)} · Stärke <strong>${wrFmt(r.strength)}</strong>
    gegen deine <strong>${wrFmt(r.defense)}</strong></div>`);
  lines.push(`<div class="wr-sub">🛡️ ${wrFmt(r.turret)} Geschütze · 🚀 ${wrFmt(r.fleet)} Flotte`
    + (r.help > 0 ? ` · 🤝 ${wrFmt(r.help)} Verstärkung` : '')
    + (r.planetDef > 0 ? ` · 🪐 ${wrFmt(r.planetDef)} Planeten-Geschütze` : '') + '</div>');
  if (r.shipsLost > 0) {
    lines.push(`<div class="wr-bad">Verluste: ${wrFmt(r.shipsLost)} Schiff(e)
      (${Math.round((r.lossRatio || 0) * 100)} %)${_wrEsc(wrLossBreakdown(r.lost))}</div>`);
  }
  if (!r.won) {
    const pl = [];
    if (r.plunderErz > 0)      pl.push(`${wrFmt(r.plunderErz)} 🪨`);
    if (r.plunderKristall > 0) pl.push(`${wrFmt(r.plunderKristall)} 💎`);
    if (pl.length) lines.push(`<div class="wr-bad">Geplündert: ${pl.join(' · ')}</div>`);
    if (r.turretsDamaged > 0) {
      lines.push(`<div class="wr-bad">${wrFmt(r.turretsDamaged)} Geschütz(e) beschädigt —
        sie fallen 12 Stunden aus.</div>`);
    }
    lines.push('<div class="wr-sub">Deine Kolonien und befreiten Planeten sind unangetastet.</div>');
  } else {
    const berg = [];
    if (r.cc > 0)       berg.push(`${wrFmt(r.cc)} CC`);
    if (r.erz > 0)      berg.push(`${wrFmt(r.erz)} ${wrIc('erz')}`);
    if (r.kristall > 0) berg.push(`${wrFmt(r.kristall)} ${wrIc('kri')}`);
    if (berg.length) {
      lines.push(`<div class="wr-good">Bergung aus den Wracks: ${berg.join(' · ')}</div>`);
    }
  }
  const helpers = Array.isArray(r.helpers) ? r.helpers : [];
  if (helpers.length) {
    lines.push(`<div class="wr-sub">🤝 Geholfen haben: ${helpers
      .map(h => `${_wrEsc(wrMemberName(h.helperId))}${h.lost > 0 ? ` (−${h.lost})` : ''}`)
      .join(', ')}</div>`);
  }

  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-report">
        <div class="wr-report-title">${tier.icon} Angriff auf deinen Raumhafen</div>
        ${lines.join('')}
        <button class="wr-btn wr-btn-go" id="wr-report-ok">Weiter</button>
      </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.id === 'wr-report-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) {
    wrToast(r.won ? '🛡️ Angriff abgewehrt!' : '💥 Raumhafen überrannt', r.won ? 'success' : 'error');
  }
}

function wrChatWave(r) {
  try {
    const who = _wrEsc(_wrMember?.name || 'Jemand');
    const tier = wrWaveTier(r.strength);
    const helpTxt = r.help > 0 ? ' — mit Verstärkung aus dem Clan' : '';
    // Verlust-Aufschlüsselung (22j) auch im Chat — welche Schiffe es erwischt hat
    const lossTxt = r.shipsLost > 0
      ? ` Verluste: ${wrFmt(r.shipsLost)} Schiff(e)${_wrEsc(wrLossBreakdown(r.lost))}.` : '';
    if (r.won) {
      wrChat(`🛡️ ${who} hat einen ${_wrEsc(tier.name)} (Stärke ${wrFmt(r.strength)}) `
           + `am Raumhafen abgewehrt${helpTxt}!${lossTxt}`);
    } else {
      wrChat(`💥 ${who} wurde von einem ${_wrEsc(tier.name)} überrannt — Rohstoffe geplündert, `
           + `${wrFmt(r.turretsDamaged)} Geschütz(e) beschädigt.${lossTxt}`);
    }
  } catch (e) { /* non-critical */ }
}

// ── Ergebnis-Popup nach der Rückkehr ────────────────────────────────────────
function wrReport(r) {
  const info = SPACE_INTENTS[r.intent] || { icon: '🚀', name: r.intent };
  const lines = [];

  if (r.recalled) {
    lines.push('<div class="wr-rep-head">↩️ Verband zurückgerufen</div>');
    lines.push('<div>Die Flotte ist wohlbehalten im Hafen — der Auftrag wurde nicht ausgeführt.</div>');
  }

  // Hinterhalt zuerst — er erklärt, warum der eigentliche Auftrag ggf. gar nicht lief
  if (r.ambush > 0) {
    lines.push(`<div class="wr-rep-foe">${wrFoeArt(WR_FOE.pirat, 'wr-foe wr-foe-lg')}</div>`);
    lines.push(r.ambushed
      ? `<div class="wr-rep-head wr-bad">💥 Räuber! Stärke ${wrFmt(r.ambush)} — dein Verband wurde abgedrängt.</div>`
      : `<div class="wr-rep-head wr-good">💥 Räuber abgeschüttelt (Stärke ${wrFmt(r.ambush)}) — durchgebrochen!</div>`);
    if (r.turretPower > 0) {
      lines.push(`<div class="wr-sub">🛡️ Deine Geschütze (${wrFmt(r.turretPower)}) haben den Anflug gedeckt`
        + (r.planetCover > 0 ? ` — davon 🪐 ${wrFmt(r.planetCover)} vom Zielplaneten.` : '.') + '</div>');
    }
    if (r.ambushed) {
      lines.push('<div>Der Auftrag wurde abgebrochen — die Flotte kehrt heim. Nimm mehr Kampfkraft mit.</div>');
    }
  }

  if (r.ambushed || r.recalled) {
    // Bei Abbruch gibt es kein Kampf-/Aufklärungs-Ergebnis zu melden
  } else if (r.intent === 'attack') {
    lines.push(r.won
      ? `<div class="wr-rep-head wr-good">⚔️ Sieg über die Wächter von ${_wrEsc(r.planet)}!</div>`
      : `<div class="wr-rep-head wr-bad">⚔️ Die Wächter von ${_wrEsc(r.planet)} haben standgehalten.</div>`);
    lines.push(`<div>Deine Kampfkraft <strong>${wrFmt(r.power)}</strong> gegen <strong>${wrFmt(r.enemy)}</strong></div>`);
  } else if (r.intent === 'scout') {
    lines.push(`<div class="wr-rep-head wr-good">🛰️ Quadrant ${_wrEsc(r.quadrant)} aufgeklärt!</div>`);
    lines.push('<div>Der ganze Kaffee-Clan sieht diesen Quadranten jetzt.</div>');
  } else if (r.intent === 'colonize') {
    // r.note = der Auftrag ist am Ziel gescheitert (die Flotte kommt trotzdem heim, siehe
    // claim_space_arrival). Ohne diese Abfrage meldeten wir fälschlich einen Erfolg.
    if (r.note === 'already_colonized') {
      lines.push(`<div class="wr-rep-head wr-bad">🪐 ${_wrEsc(r.planet)} war bereits kolonisiert</div>`);
      lines.push('<div>Ein Mitspieler war schneller — deine Flotte kehrt unverrichteter Dinge zurück, das Kolonieschiff bleibt dir erhalten.</div>');
    } else if (r.note === 'no_colony_ship') {
      lines.push(`<div class="wr-rep-head wr-bad">🛸 Kein Kolonieschiff dabei</div>`);
      lines.push('<div>Die Flotte ist zurück, gegründet wurde nichts.</div>');
    } else {
      lines.push(`<div class="wr-rep-head wr-good">🪐 Kolonie auf ${_wrEsc(r.planet)} gegründet!</div>`);
    }
  } else {
    lines.push(`<div class="wr-rep-head">${info.icon} ${_wrEsc(r.planet)}</div>`);
  }
  if (r.shipsLost > 0) lines.push(`<div class="wr-bad">Verluste: ${wrFmt(r.shipsLost)} Schiff(e) (${Math.round((r.lossRatio || 0) * 100)} %)${_wrEsc(wrLossBreakdown(r.lost))}</div>`);
  // NEU: gekapertes Schiff / treibendes Wrack
  if (r.foundShip && r.foundCount > 0) {
    const fs = SPACE_SHIP_BY_KEY[r.foundShip];
    lines.push(`<div class="wr-rep-found">${wrShipArt(r.foundShip, 'wr-mini wr-mini-md')}
      <span class="wr-good">Fundstück: ${wrFmt(r.foundCount)}× ${_wrEsc(fs?.name || r.foundShip)}
      <span class="wr-sub">— geborgen und in die Heimatflotte übernommen</span></span></div>`);
  }

  // 🟣/🌀 fehlten hier (JP 2026-07-29: „bei dem Sieg werden nur erbeutetes CC, Erz und Kristall
  // angegeben"). Der Server liefert sie seit 26c längst mit — es war reine Anzeige-Lücke.
  // ⚠️ ZWEI Fassungen: `beute` mit echten Icons fürs Overlay, `beuteTxt` mit Emoji für den
  // Toast-Rückfall unten. Eine wrIc()-Bildhülle im Toast käme als leerer Kreis heraus.
  const beute = [], beuteTxt = [];
  const push = (n, ic, emoji, name) => {
    if (!(n > 0)) return;
    beute.push(`${wrFmt(n)} ${ic} ${name}`);
    beuteTxt.push(`${wrFmt(n)} ${emoji} ${name}`);
  };
  if (r.cc > 0) { beute.push(`${wrFmt(r.cc)} CC`); beuteTxt.push(`${wrFmt(r.cc)} CC`); }
  push(r.erz,      wrIc('erz'), '🪨', 'Erz');
  push(r.kristall, wrIc('kri'), '💎', 'Kristall');
  push(r.plasmoid, wrIc('pla'), '🟣', 'Plasmoiden-Staub');
  push(r.quantum,  wrIc('qua'), '🌀', 'Quantenschaum');
  if (beute.length) lines.push(`<div class="wr-good">Beute: ${beute.join(' · ')}</div>`);
  if (r.bergerBonus > 1) {
    lines.push(`<div class="wr-sub">♻️ Bergungsschiffe haben die Ausbeute um `
             + `${Math.round((r.bergerBonus - 1) * 100)} % erhöht.</div>`);
  }
  if (r.wreckField > 0) {
    lines.push(`<div class="wr-sub">${wrIc("wreck")} Auf ${_wrEsc(r.planet)} liegt jetzt ein Wrackfeld mit `
             + `${wrFmt(r.wreckField)} Einheiten${r.ownWreck > 0
               ? ` <span class="wr-good">(davon ${wrFmt(r.ownWreck)} aus deinen eigenen Verlusten — hol dir den Wert zurück!)</span>` : ''}`
             + ` — mit ${wrIc("salvage")} Bergungsschiffen abbaubar.</div>`);
  } else if (r.ownWreck > 0) {
    lines.push(`<div class="wr-sub">${wrIc("wreck")} Deine Verluste liegen als <strong>${wrFmt(r.ownWreck)}</strong> `
             + `bergbare Wrack-Einheiten bei ${_wrEsc(r.planet)} — nach der Eroberung mit ${wrIc("salvage")} Bergungsschiffen abtragbar.</div>`);
  }

  // Eigenes, selbstgenügsames Overlay: die vorhandenen Popups (`cc-karte-popup`,
  // `_showDungeonModal`) hängen an ihren jeweiligen Views — hier wäre das eine
  // versteckte Abhängigkeit. Bei jedem Fehler bleibt der Toast als Rückfall.
  try {
    document.getElementById('wr-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wr-overlay';
    ov.className = 'wr-overlay';
    ov.innerHTML = `
      <div class="wr-report">
        <div class="wr-report-title">🚀 Rückkehr der Flotte</div>
        ${lines.join('')}
        <button class="wr-btn wr-btn-go" id="wr-report-ok">Weiter</button>
      </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.id === 'wr-report-ok') ov.remove();
    });
    document.body.appendChild(ov);
  } catch (e) {
    wrToast(`🚀 Flotte zurück${beuteTxt.length ? ' — Beute: ' + beuteTxt.join(' · ') : ''}`, 'success');
  }
}

// ── Loop: Countdown + automatische Abrechnung bei Rückkehr ──────────────────
function wrStartLoop() {
  if (_wrTimer) clearInterval(_wrTimer);
  _wrTimer = setInterval(async () => {
    // Tab verlassen → Loop beenden (Muster kmStartLoop)
    if (!document.getElementById('wr-canvas')) { clearInterval(_wrTimer); _wrTimer = null; return; }
    const trips = wrTrips(_wrMember);
    if (!trips.length) return;
    let due = false;
    for (const t of trips) {
      const rem = Date.parse(t.returnAt) - Date.now();
      // Reise-Karte UND kompakte Leiste tragen dasselbe Attribut -> querySelectorAll.
      for (const eta of document.querySelectorAll(`[data-wr-eta="${t.id}"]`)) {
        eta.textContent = wrCountdown(rem);
      }
      if (rem <= 0) due = true;
    }
    wrDrawMap();
    if (due) { await wrTryClaim(false); }
  }, 1000);

  // Wellen-Countdown getrennt: er läuft auch, wenn gerade keine Reise unterwegs ist.
  // Bei Fälligkeit NICHT automatisch abrechnen — der Spieler soll den Angriff sehen
  // und drücken (sonst poppt das Ergebnis unbemerkt weg).
  if (_wrWaveTimer) clearInterval(_wrWaveTimer);
  _wrWaveTimer = setInterval(async () => {
    if (!document.getElementById('wr-canvas')) { clearInterval(_wrWaveTimer); _wrWaveTimer = null; return; }
    // Werft-Countdowns mitlaufen lassen — je Schiffstyp ein eigener Auftrag
    const jobs = wrYardJobs(_wrMember);
    for (const [k, j] of Object.entries(jobs)) {
      if (!j || typeof j !== 'object') continue;
      const el = document.querySelector(`[data-wr-jobeta="${k}"]`);
      if (!el) continue;
      const jr = Date.parse(j.doneAt) - Date.now();
      if (jr > 0) { el.textContent = wrCountdown(jr); }
      else { wrRender(); break; }        // genau einmal: der Abhol-Knopf erscheint
    }
    if (!_wrWave) return;
    const rem = Date.parse(_wrWave.arriveAt) - Date.now();
    const el = document.getElementById('wr-wave-eta');
    if (el) el.textContent = wrCountdown(rem);
    // Genau EINMAL neu rendern, wenn die Welle fällig wird (Button erscheint)
    if (rem <= 0 && el) wrRender();
  }, 1000);
}

// ── Globale Rückkehr (auch ohne offenen Tab) ────────────────────────────────
// Muster kmMaybeArrive: wird beim App-Start aufgerufen. Wer seine Flotte losschickt und
// die App schließt, soll die Beute trotzdem bekommen — sonst wartet sie bis zum nächsten
// Tab-Besuch. Läuft still (kein Popup), meldet nur einen Toast.
async function wrMaybeArrive() {
  try {
    const u = (typeof currentUserData !== 'undefined') ? currentUserData : null;
    if (!u || !u.id) return false;
    // 🚀 Multi-Flotte: ist irgendein Trip fällig? Dann alle fälligen in Schleife abrechnen.
    if (!wrTrips(u).some(t => Date.now() >= Date.parse(t.returnAt))) return false;
    let cc = 0, erz = 0, kri = 0, n = 0, guard = 0, last = null;
    while (guard++ < 6) {
      const res = await DB.claimSpaceArrival(u.id);
      if (!res || res.error || res.nothing) { if (res && res.space) wrApplySpace(res.space); if (!res || !res.more) break; else continue; }
      wrApplySpace(res.space);
      if (_wrMember && _wrMember.id === u.id) _wrMember.space = res.space;
      cc += res.cc || 0; erz += res.erz || 0; kri += res.kristall || 0; n++; last = res;
      wrChatReport(res, u.name);
      try { if (typeof checkSpaceAchievements === 'function') await checkSpaceAchievements(u, res); } catch (e) {}
      if (!res.more) break;
    }
    if (n === 0) return false;
    const beute = [];
    if (cc > 0)  beute.push(`${wrFmt(cc)} CC`);
    if (erz > 0) beute.push(`${wrFmt(erz)} 🪨`);
    if (kri > 0) beute.push(`${wrFmt(kri)} 💎`);
    wrToast(`🚀 ${n === 1 ? 'Deine Flotte ist' : n + ' Flotten sind'} zurück${beute.length ? ' — ' + beute.join(' · ') : ''}`, 'success');
    return true;
  } catch (e) { console.warn('wrMaybeArrive:', e.message); return false; }
}

// ── Kleinkram ────────────────────────────────────────────────────────────────
// Server-State in das lokale Member-Objekt spiegeln, damit die UI ohne Reload stimmt.
function wrApplySpace(space) {
  if (!space) return;
  if (_wrMember) _wrMember.space = space;
  try { if (typeof currentUserData !== 'undefined' && currentUserData) currentUserData.space = space; } catch (e) {}
}
function wrApplyCoins(coins) {
  if (typeof coins !== 'number') return;
  if (_wrMember) _wrMember.coins = coins;
  try { if (typeof currentUserData !== 'undefined' && currentUserData) currentUserData.coins = coins; } catch (e) {}
}
function wrToast(msg, kind) {
  if (typeof showToast === 'function') { try { showToast(msg, kind || 'info'); return; } catch (e) {} }
  console.log('[weltraum]', msg);
}
function wrErrText(err) {
  const map = {
    no_group:              'Keine Gruppe aktiv.',
    no_planet:             'Planet nicht gefunden.',
    not_cleared:           'Erst die Wächter besiegen.',
    already_traveling:     'Deine Flotte ist bereits unterwegs.',
    not_enough_ships:      'Nicht genug Schiffe im Hafen.',
    empty_fleet:           'Keine Schiffe ausgewählt.',
    bad_intent:            'Unbekannter Auftrag.',
    bad_ship:              'Dieses Schiff lässt sich so nicht bauen (das Mutterschiff nur über sein eigenes Panel).',
    insufficient_coins:    'Nicht genug CoffeeCoins.',
    insufficient_erz:      'Nicht genug 🪨 Erz.',
    insufficient_kristall: 'Nicht genug 💎 Koffeinkristall.',
    no_colony_ship:        'Kein Kolonieschiff dabei.',
    already_colonized:     'Dieser Planet ist bereits kolonisiert.',
    still_traveling:       'Die Flotte ist noch unterwegs.',
    not_found:             'Mitglied nicht gefunden.',
    bad_action:            'Unbekannte Bauaktion.',
    bad_slot:              'Diesen Bauslot gibt es (noch) nicht.',
    bad_turret:            'Unbekannter Geschütztyp.',
    slot_taken:            'Auf diesem Slot steht schon ein Geschütz.',
    slot_empty:            'Auf diesem Slot steht noch kein Geschütz.',
    port_max:              'Dein Raumhafen ist bereits voll ausgebaut.',
    port_too_small:        'Dafür muss dein Raumhafen weiter ausgebaut sein.',
    turret_max:            'Dieses Geschütz ist bereits auf der höchsten Stufe.',
    no_trip:               'Es ist keine Flotte unterwegs.',
    already_recalled:      'Der Verband kehrt bereits um.',
    already_returning:     'Die Flotte ist schon am Ziel und auf dem Rückweg.',
    bad_trip:              'Die Reisedaten sind unvollständig.',
    no_wave:               'Es läuft gerade kein Angriff auf dich.',
    wave_done:             'Dieser Angriff ist bereits abgerechnet.',
    wave_too_late:         'Zu spät — die Welle schlägt gleich ein.',
    self_help:             'Du kannst dir nicht selbst Verstärkung schicken.',
    no_refinery:           'Erforsche zuerst die Raffinerie (Ast 🏭 Raffinerie & Logistik).',
    refine_busy:           'Die Raffinerie verarbeitet bereits eine Charge — erst abholen.',
    empty_batch:           'Lege Erz oder Kristall in die Raffinerie.',
    still_refining:        'Die Charge ist noch nicht fertig.',
    already_helping:       'Du hast dieser Verteidigung bereits Schiffe geschickt.',
    not_yet:               'Die Welle ist noch nicht eingetroffen.',
    yard_busy:             'Von diesem Schiffstyp läuft bereits ein Bauauftrag.',
    empty_cart:            'Es ist kein Schiff eingeplant.',
    no_wrecks:             'Hier ist kein Wrackfeld mehr übrig.',
    too_many:              'Höchstens 50 Schiffe je Auftrag.',
    yard_max:              'Deine Werft ist bereits voll ausgebaut.',
    still_building:        'Das Schiff ist noch nicht fertig.',
    // 💎 Treibstoff (22h)
    not_enough_fuel:       'Nicht genug 💎 Kristall als Treibstoff für diese Reise.',
    fleet_limit:           'Maximal 5 Flotten gleichzeitig unterwegs.',
    no_plasmoid:           'Nicht genug 🟣 Plasmoiden-Staub.',
    no_quantum:            'Nicht genug 🌀 Quantenschaum.',
    no_transmuter:         'Erforsche zuerst den Transmuter (Ast 🌀 Quanten-Technik).',
    bad_type:              'Unbekannter Rohstoff.',
    // 🤝 Clan-Handel (22f)
    bad_type:              'Unbekannter Rohstoff.',
    bad_amount:            'Menge und Preis müssen mindestens 1 sein.',
    not_enough_resources:  'So viel hast du nicht auf Lager.',
    not_enough_cc:         'Nicht genug CoffeeCoins für dieses Angebot.',
    not_yours:             'Das ist nicht dein Angebot.',
    not_open:              'Dieses Angebot ist nicht mehr verfügbar.',
    own_offer:             'Dein eigenes Angebot kannst du nicht kaufen.',
    // 🛡️ Feature ④ — Planeten-Verteidigung (26h)
    insufficient_plasmoid: 'Nicht genug 🟣 Plasmoiden-Staub.',
    insufficient_quantum:  'Nicht genug 🌀 Quantenschaum.',
    not_your_colony:       'Nur auf deinen eigenen Kolonien möglich.',
    colony_max:            'Diese Kolonie ist bereits voll ausgebaut (Stufe 3).',
    defense_max:           'Die Planeten-Geschütze sind bereits auf Stufe 3.',
    // ⚠️ Reiner Text (Toast) — hier KEINE wrIc()-Icons, die Hülle würde als Markup sichtbar.
    // Kein führendes Emoji: wrTechRef bringt das Ast-Icon bereits mit (sonst steht es doppelt).
    need_tech_e10:         `Erforsche zuerst „${wrTechName('wt_e10')}" — ${wrTechRef('wt_e10')}.`,
    need_tech_f7:          `Erforsche zuerst „${wrTechName('wt_f7')}" — ${wrTechRef('wt_f7')}.`,
    need_defense_3:        'Erst Planeten-Geschütze auf Stufe 3 ausbauen.',
    station_exists:        'Hier steht bereits eine Quadranten-Station.',
    quadrant_has_station:  'In diesem Quadranten steht schon eine Station.',
    // 🛸 Mutterschiff (26j)
    missing_parts:         'Es fehlen Rümpfe für das Mutterschiff.',
    // 🛩️ Ring-Gate (26m). Der Picker warnt schon VOR dem Absenden und sperrt den Knopf —
    // dieser Text greift nur noch bei einem veralteten Client oder einem Direktaufruf.
    jaeger_need_carrier:   'Kleine Jäger schaffen den Sprung nach Ring 2/3 nicht aus eigener Kraft — '
                         + `je ${WR_CARRIER_SEATS} Jäger braucht es ein 🛩️ Trägerschiff im Verband. `
                         + '(Große Jäger fliegen überall hin.)',
    // 🛡️ Geschütz-Ausbau (26k)
    turret_locked:         'Dieses Geschütz musst du zuerst erforschen (Ast 🛡️ Bewaffnung bzw. 🟣/🌀).',
    turret_not_better:     'Umrüsten geht nur auf ein STÄRKERES Geschütz.',
    same_turret:           'Dieses Geschütz steht dort bereits.',
    turret_damaged:        'Ein beschädigtes Geschütz lässt sich nicht umrüsten — warte die Reparatur ab.',
    port_too_small:        'Dafür ist der Raumhafen noch zu klein — erst ausbauen.',
    yard_max:              'Die Werft ist bereits voll ausgebaut (Stufe 3).',
  };
  return map[err] || ('Fehler: ' + (err || 'unbekannt'));
}
