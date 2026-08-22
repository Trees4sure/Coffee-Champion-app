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
// ⚠️ EMOJI SIND HIER NUR DER RÜCKFALL. Angezeigt wird `assets/space/ship_*.png` über
// `wrShipArt()`; das Emoji erscheint erst, wenn das Bild fehlt. Trotzdem muss es passen —
// es steht in Toasts und Chat-Meldungen, wo kein HTML gerendert wird.
// ⚠️ 2026-08-17 (JP: „bitte die richtigen Assets auswählen, nicht die Spritzpistole"):
// Der Jäger trug 🔫, und das rendert auf iOS seit 2016 und auf Android seit 2018 als
// WASSERPISTOLE. Auf dem Desktop fällt es nicht auf — auf dem Handy steht dort ein
// Spielzeug. Jetzt 🗡️: der kleine, schnelle Angreifer neben dem ⚔️ Schlachtschiff.
const SPACE_SHIPS = [
  { key:'sonde', buildMin:60, art:'ship_spaeher',   icon:'🛰️', name:'Bohnen-Sonde',   atk:1,  mine:0, cc:750,  erz:0,  kristall:0,
    needs:'wt_ionenantrieb', desc:'Deckt den Nebel eines Quadranten auf' },
  { key:'jaeger', buildMin:90, art:'ship_jaeger',  icon:'🗡️', name:'Jäger',           atk:10, mine:0, cc:1150, erz:0,  kristall:0,
    needs:'wt_ionenantrieb', desc:'Billige Kampfkraft — Anzahl entscheidet' },
  // 🛩️ Großer Jäger (JP 2026-07-27): füllt die Lücke zwischen Wegwerf-Jäger und der
  // Fregatte. Bleibt leichte Klasse — Konterbonus gegen Schwärme, kleiner Schild.
  // ⚠️ Spiegel: _space_ship_cost/_stats/_role/_build_min in migration_2026-07-26i.
  // ⚠️ 27i (JP 2026-08-20): Kristall-Posten NEU. Der Große Jäger hatte keinen, dadurch war
  // die Fregatte das strikt bessere Schiff bei EINFACHEREM Rohstoffprofil. Bewusst nur 10
  // (statt der Formel-15 aus dem Handover): sonst liegen die beiden bei Kristall/Angriffskraft
  // nur 7 % auseinander und die Invariante „der Große Jäger bleibt sinnvoll" ist zwar formal
  // erfüllt, aber praktisch verfehlt. Siehe Kopf von migration_2026-08-20_27i.
  { key:'grossjaeger', buildMin:180, art:'ship_grossjaeger', icon:'🛩️', name:'Großer Jäger', atk:20, mine:0, cc:2000, erz:30, kristall:10,
    needs:'wt_frachtmodule', desc:'Schwerer Abfangjäger — doppelte Feuerkraft je Rumpf, leichter Schild' },
  { key:'kutter', buildMin:180, art:'ship_kutter',  icon:'🚀', name:'Espresso-Kutter', atk:2,  mine:0, cc:1500, erz:0,  kristall:0,
    needs:'wt_frachtmodule', desc:'Frachter, bringt Ausbeute sicher heim' },
  { key:'ernter', buildMin:240, art:'ship_ernter',  icon:'⛏️', name:'Röstkomet',       atk:3,  mine:8, cc:1500, erz:30, kristall:0,
    needs:'wt_handbohrer',   desc:'Baut Erz und Koffeinkristall ab' },
  { key:'berger', buildMin:240, art:'ship_berger',  icon:'♻️', name:'Bergungsschiff', atk:1,  mine:0, cc:1900, erz:50, kristall:0,
    needs:'wt_frachtmodule', desc:'Holt mehr aus Wracks — im Kampf und an befreiten Planeten' },
  { key:'kolonie', buildMin:1440, art:'ship_kolonie', icon:'🛸', name:'Kolonieschiff',   atk:0,  mine:0, cc:3750, erz:90, kristall:30,
    needs:'wt_frachtmodule', desc:'Gründet eine Kolonie — bleibt am Zielplaneten' },
  { key:'fregatte', buildMin:360, art:'ship_fregatte', icon:'🛡️', name:'Fregatte', atk:28, mine:0, cc:2250, erz:70, kristall:30,
    needs:'wt_frachtmodule', desc:'Leichter Begleitschutz — Schild senkt die Verluste des ganzen Verbands' },
  // 🛩️ Trägerschiff (JP 2026-07-29): der Grund, warum es kleine Jäger weiterhin gibt.
  // ⚠️ Spiegel: _space_ship_cost/_stats/_role/_build_min in migration_2026-07-26m.
  // ⚠️ Der alte Hinweis „KEIN Plasmoid im Preis, obwohl der Plan 30 🟣 vorsah" ist mit 27i
  // ERLEDIGT: _space_ship_cost liefert jetzt fünf Spalten. Der Träger bleibt trotzdem
  // bewusst ohne Exoten — er ist ein Transporter, und §1.4 nennt nur Kreuzer/Schlachtschiff.
  // Die Kapazität gehört in den desc-Text: es gibt bewusst KEIN What's-New-Popup (JP),
  // also muss die Regel dort stehen, wo man das Schiff kauft.
  // ⚠️ 27q ABGRENZUNG (JP 2026-08-20): das gilt für REGELN, nicht für KOSTEN.
  // Kreuzer/Schlachtschiff/Dunkle Röstung trugen seit 27i ein „— braucht 🟣
  // Plasmoiden-Staub" im desc. JP: „das kann eigentlich komplett weg der Satz, weil
  // die Kosten ja klar sind!" — die Preiszeile daneben nennt jeden Posten mit Bild
  // und Menge. Ein desc, der sie in Worten wiederholt, sagt WENIGER und kostet Platz.
  // Die Kapazität des Trägers bleibt: sie steht in KEINER Kostenzeile.
  { key:'traeger', buildMin:2880, art:'ship_traeger', icon:'🛩️', name:'Trägerschiff', atk:40, mine:0, cc:22500, erz:630, kristall:230,
    needs:'wt_frachtmodule', desc:'Nimmt 20 Jäger auf: nur so kommen kleine Jäger nach Ring 2/3. Schützt sie mit seinem Schild und gibt +5 % Kampfkraft auf den ganzen Verband (max. +15 %)' },
  // ⚠️ JP 2026-07-22: Bomber ↔ Kreuzer haben NAME/BILD/ICON getauscht — der Kreuzer
  // ist optisch größer und soll daher das stärkere, teurere Schiff sein. Die KEYS,
  // Werte und Rollen (SPACE_ROLES) bleiben unverändert: Keys stecken serverseitig in
  // _space_ship_stats/loss_order UND in den Flottenbeständen der Spieler — ein
  // Key-Tausch hätte bestehende Flotten still umbewertet. CHAT_ART (app.js) ist
  // spiegelbildlich mitgetauscht, sonst zeigte der Chat das alte Bild zum neuen Namen.
  // ⚠️ ANZEIGENAME ≠ KEY (siehe Block darüber). 27i-Vorgaben lauten auf den ANZEIGENAMEN:
  // „Kreuzer bekommt Plasmoid" trifft deshalb `bomber`, NICHT `kreuzer`.
  { key:'kreuzer', buildMin:720, art:'ship_bomber', icon:'💣', name:'Bomber', atk:65, mine:0, cc:4500, erz:180, kristall:30,
    needs:'wt_frachtmodule', desc:'Kapitalschiff-Jäger: stark gegen schwere Gegner, träge gegen Schwärme' },
  { key:'bomber', buildMin:1440, art:'ship_kreuzer', icon:'🚨', name:'Kreuzer', atk:90, mine:0, cc:6900, erz:260, kristall:60, plasmoid:20,
    needs:'wt_frachtmodule', desc:'Überall stark, gegen Geschütze verheerend' },
  { key:'schlachtschiff', buildMin:2880, art:'ship_schlachtschiff', icon:'⚔️', name:'Schlachtschiff', atk:180, mine:0, cc:13800, erz:550, kristall:140, plasmoid:40,
    needs:'wt_frachtmodule', desc:'Überall stark, hoher Schild — das Rückgrat einer großen Flotte' },
  { key:'dunkle_roestung', buildMin:5760, art:'ship_dunkle_roestung', icon:'🌑', name:'Dunkle Röstung', atk:320, mine:0, cc:26300, erz:1060, kristall:330, plasmoid:75, quantum:200,
    needs:'wt_frachtmodule', desc:'Elite-Kapitalschiff: überall stark, höchster Schild' },
  // 🛸 Flaggschiff (JP 2026-07-27). `special:'flagship'` heißt: NICHT über den Warenkorb
  // kaufbar — es entsteht nur in build_mutterschiff aus eingelösten Rümpfen. Die Werft
  // überspringt solche Schiffe deshalb in beiden Schleifen und zeigt ein eigenes Panel.
  // 27i: zieht bei den +25 % mit (JP 2026-08-20, „ja mitziehen"). Sein `cc` speist
  // Flottensold und Verlustbewertung — bliebe es stehen, würde das Flaggschiff relativ
  // billiger, und der Plasmoid-Anker für §1.4 würde nach unten kippen.
  // ⚠️ EXOTEN 100/250 → 180/400 (JP 2026-08-20, nach eigener Beobachtung): „mutterschiff
  // ist günstiger bei plasmoid und quantenschaum als röstung". Stimmte je Kampfkraft —
  // und die 71 Rümpfe retten es NICHT: sie enthalten zusammen 20 🟣 und NULL 🌀.
  // Gerechnet mit Rümpfen war es beim Quantenschaum 2,9× sparsamer je atk als die
  // Dunkle Röstung. Jetzt absolut klar teurer; je Kampfkraft bleibt es günstiger, und das
  // ist gewollt — das ist der Lohn für 71 eingelöste Rümpfe und 7 Tage Bauzeit.
  // ⚠️ Spiegel: _space_flagship_cost() in migration_2026-08-20_27i (NICHT _space_ship_cost —
  // das Mutterschiff darf nie über den Warenkorb kaufbar sein).
  { key:'mutterschiff', buildMin:10080, art:'ship_mutterschiff', icon:'🛸', name:'Mutterschiff', atk:1170, mine:0,
    cc:37500, erz:750, kristall:310, plasmoid:180, quantum:400, special:'flagship',
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
  // ⚠️ Die Raffinerie-STUFE ist ein unsichtbarer Nebeneffekt dieses Astes: wrRefineTier()
  // nimmt schlicht die höchste besessene wt_d*-Technik (e13 = 6). In den Wirkungstexten
  // stand das nirgends — man konnte im Baum nicht erkennen, welche Forschung die Raffinerie
  // hebt (JP 2026-07-30: „Und die Raffinerie-Stufen sind nur über Forschung?"). Deshalb
  // steht die Stufe jetzt VORNE, und die zwei Freischaltungen (🟣 ab St. 2, 🌀 ab St. 4)
  // sind benannt. ⚠️ Wer WR_REFINE/_space_refine_def ändert, muss diese Texte mitziehen —
  // test_26s_plasmoid.js prüft die Zuordnung Technik → Stufe gegen wrRefineTier.
  { key:'wt_d1', ast:'d', stufe:1, name:'Raffinerie',         cc:4800,  erz:65,  kristall:0,   requires:null,   wirkung:'🏭 Raffinerie Stufe 1 · Rohstoffkosten −20 %',    art:'wt1_raffinerie',      live:true },
  { key:'wt_d2', ast:'d', stufe:2, name:'Handelsdock',        cc:9000, erz:130,  kristall:25,  requires:'wt_d1', wirkung:'🏭 Raffinerie Stufe 2 — verwertet 🟣 · Kampf-Bergung +25 %',     art:'wt2_handelsdock',     live:true },
  { key:'wt_d3', ast:'d', stufe:3, name:'Orbitallager',       cc:15000, erz:240, kristall:65,  requires:'wt_d2', wirkung:'🏭 Raffinerie Stufe 3 · Ansammlung 14 → 21 Tage', art:'wt3_lager',           live:true },
  { key:'wt_d4', ast:'d', stufe:4, name:'Fern-Handelsroute',  cc:24000, erz:400, kristall:130,  requires:'wt_d3', wirkung:'🏭 Raffinerie Stufe 4 — verwertet 🌀 · Kolonien geben CC/Tag',   art:'wt4_handelsroute',    live:true },
  { key:'wt_d5', ast:'d', stufe:5, name:'Sternenbörse',       cc:39000, erz:640, kristall:240, requires:'wt_d4', wirkung:'🏭 Raffinerie Stufe 5 · Wrack-Ausbeute +30 %',    art:'wt5_sternenboerse',   live:true },
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
  // ⚠️ EFFEKT NEU GESTALTET 2026-07-30 (JP: „Ich habe die Funktion freigeschaltet, dass
  // ich alle Quadranten sehen kann ohne Sonde - das finde ich doof - Alles sichtbar ist
  // OP. Kannst du das Rückgängig machen und diese Forschung anders gestalten?").
  //
  // Geschichte dieser einen Technik, damit sie nicht ein drittes Mal kippt:
  //   • ursprünglich versprach der Text „Gegnerstärke sichtbar ohne Sonde" — mild.
  //   • verdrahtet war aber immer `wrRevealed() || wt_e6`, also die GANZE Galaxie.
  //   • 2026-07-29 wurde deshalb der TEXT an den Effekt angepasst (statt umgekehrt).
  //   • 2026-07-30 ist klar: der Effekt war das Problem, nicht der Text. Zurückgebaut.
  //
  // Jetzt: 📡 Nahbereichs-Ortung (wrSensed/wrSensorIntel). Geortet wird nur, was ohnehin
  // als nächstes aufklärbar ist — Summen statt Einzelplaneten, und die Sonde bleibt
  // Pflicht. Information statt Zugang. Preis bewusst UNVERÄNDERT (18 000 CC): die Technik
  // ist damit nicht mehr allmächtig, aber der blinde Sondenflug war die eigentliche
  // Schwäche der Erkundung, und die behebt sie vollständig.
  { key:'wt_e6',  ast:'a', stufe:8,  name:'Deep-Space-Sensorik',     cc:18000, erz:240, kristall:50,  plasmoid:15, quantum:0, requires:'wt_a3', wirkung:'📡 Ortet angrenzende Nebel-Quadranten: Planetenzahl, Wächterstärke, Wracks und Ring-Rohstoffe — die Sonde bleibt nötig', art:'wt6_deepspace_sensor',  live:true  },
  { key:'wt_e7',  ast:'c', stufe:7,  name:'Plasmoid-Kollektor',      cc:20000, erz:300, kristall:80,  plasmoid:0,  quantum:0, requires:'wt_c4', wirkung:'Schaltet 🟣 Plasmoiden-Abbau frei',        art:'wt6_plasmoid_kollektor', live:true  },
  { key:'wt_e8',  ast:'c', stufe:6,  name:'Wrack-Tiefenscanner',     cc:22000, erz:300, kristall:70,  plasmoid:25, quantum:0, requires:'wt_c2', wirkung:'+30 % Wrack-Ausbeute',                      art:'wt6_wrack_scanner',     live:true  },
  { key:'wt_e9',  ast:'c', stufe:10,  name:'Auto-Ernte-Protokoll',    cc:28000, erz:400, kristall:120, plasmoid:40, quantum:0, requires:'wt_c5', wirkung:'Kolonien ernten selbsttätig',               art:'wt6_auto_ernte',        live:true  },
  { key:'wt_e10', ast:'b', stufe:11, name:'Planetar-Schildgenerator',cc:26000, erz:380, kristall:100, plasmoid:40, quantum:0, requires:'wt_b4', wirkung:'Schaltet Planeten-Geschütze frei',          art:'wt6_planetar_schild',   live:true  },
  { key:'wt_e11', ast:'b', stufe:12, name:'Selbstreparatur-Nanobots',cc:24000, erz:340, kristall:90,  plasmoid:35, quantum:0, requires:'wt_e10',wirkung:'Geschütz-Ausfallzeit −50 %',                art:'wt6_nanobots',          live:true  },
  { key:'wt_e12', ast:'b', stufe:13, name:'Frühwarn-Netz',           cc:22000, erz:300, kristall:80,  plasmoid:30, quantum:0, requires:'wt_e6', wirkung:'Rückfall-Frist +2 Tage + Wellen-Vorwarnung',art:'wt6_fruehwarnnetz',     live:true  },
  { key:'wt_e13', ast:'d', stufe:8, name:'Plasma-Raffinerie',       cc:30000, erz:500, kristall:150, plasmoid:50, quantum:0, requires:'wt_d5', wirkung:'🏭 Raffinerie Stufe 6 (höchste) — 180 🟣 / 70 🌀 je Charge',                   art:'wt6_plasma_raffinerie', live:true  },
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
  { key:'wt_f9',  ast:'d', stufe:9,  name:'Transmuter',              cc:40000, erz:0,   kristall:0,   plasmoid:40, quantum:30, requires:'wt_f5', wirkung:'Wandelt 🟣/🌀 sofort in CC (🟣 120 · 🌀 260 CC)',   art:'wt7_transmuter',        live:true  },
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
// ⚠️ 27x ERSETZT DIESE FUNKTION. Sie bleibt als Beleg stehen, wird aber nirgends mehr
// gerufen — `harvest_space` rechnet seit 27x nach KOLONIE-STUFE statt nach Reichtum.
// JP: „Die Einnahmen/Tag sind lächerlich niedrig gegenüber den Kosten einer Kolonie."
// Nachgerechnet stimmte das: höchstens 250 CC/Tag (Reichtum 5 × 50) gegen 400–2.820 CC
// Verwaltung — eine Kolonie war ab Stufe 2 unter JEDER Bedingung ein Verlustgeschäft.
// ⚠️ ÜBERTRAGBARE LEHRE: Ein Ertrag gehört gegen die UNTERHALTSKOSTEN derselben Sache
// gemessen, nicht gegen null. Der Gegenposten stand die ganze Zeit sichtbar in derselben
// Kostenkarte.
function wrTechColonyCc(m) { return (wrHasTech(m,'wt_d4') ? 25 : 0) + (wrHasTech(m,'wt_e15') ? 25 : 0); }

// 💰 27x — Spiegel von `_space_colony_cc_base` / `_space_tech_colony_share` /
// `_space_colony_kutter_cc`.
const WR_COLONY_CC = [0, 1500, 3500, 5000];   // je Kolonie-Stufe und Tag
const WR_KUTTER_CC = 150;                     // 10 % des Kutter-Bauwerts (1.500 CC)
// ⚠️ AUF ZWEI TECHNIKEN AUFGETEILT: wt_d4 die Hälfte, wt_e15 die andere. Läge alles auf
// einer, wäre die spätere wertlos — und JPs Sorge („die Investitionen kann man vielleicht
// gar nicht mehr einholen") verlangt, dass sich beide noch lohnen.
function wrColonyCcShare(m) {
  return (wrHasTech(m, 'wt_d4') ? 0.5 : 0) + (wrHasTech(m, 'wt_e15') ? 0.5 : 0);
}
// 🚀 Handels-Kutter: KEIN eigenes System — sie stehen in der GARNISON (27k), wo es die
// „10 Plätze je Stufe" längst gibt und Kutter längst stationierbar sind. Sie taten dort
// bloss nichts. Ein zweites Stationierungs-System wäre in diesem Modul der vierte Fall
// von „zwei Dinge, ein Name" gewesen.
// ⚠️ Eingemottet ⇒ 0, spiegelbildlich zu `wrGarrisonPower`.
function wrColonyKutterCc(m, planetId) {
  if (wrMothCount(m) > 0) return 0;
  return (parseInt(wrGarrisonShips(m, planetId).kutter, 10) || 0) * WR_KUTTER_CC;
}
// Voller Tagesertrag einer Kolonie in CC — Grundertrag + Kutter, mal Regionsbonus.
function wrColonyCcDay(m, p) {
  if (!p) return 0;
  const basis = WR_COLONY_CC[wrColonyLevel(p)] * wrColonyCcShare(m);
  const mult  = wrRegionMine(p.quadrant, m) ? WR_REGION_RATES.ertrag : 1;
  return Math.round((basis + wrColonyKutterCc(m, p.id)) * mult);
}
// ⚠️ 27w — GEFUNDEN BEI EINER PRÜFUNG ALLER 42 TECHNIKEN (JP: „prüfe by the way, ob alle
// Forschungen wirklich greifen"). Ergebnis: 41 wirken serverseitig, wt_e6 ist bewusst
// eine reine Client-Sache (Nahbereichs-Ortung). ABER drei wirkten, ohne dass der Client
// es je sagte — dieselbe Familie wie mothballed (26w), merc (26x), garrison (27k),
// wrAllUsers (27s):
//   • wt_d4/wt_e15 → CC je Kolonie: `wrTechColonyCc` war seit 26e definiert und NIE
//     aufgerufen. Geld, das jeden Tag floss, ohne dass irgendwo stand, woher.
//   • wt_e11/wt_b5 → Reparaturzeit beschädigter Geschütze. Der Client nannte an zwei
//     Stellen fest „12 Stunden", obwohl der Server 2 h (e11) bzw. 4 h (b5) rechnet.
//   • wt_f4 → Faltraum-Anker: einmal am Tag kehrt ein zurückgerufener Verband SOFORT
//     heim. Der Rückruf-Knopf versprach weiterhin „Rückweg = bisherige Flugzeit".
// ⚠️ MERKE: Eine Zahl, die im Fliesstext festgeschrieben ist, überlebt jede Forschung,
// die sie ändern soll. Konstanten in Erklärtexten gehören durch Funktionen ersetzt.
// Spiegel von `_space_tech_turret_repair_h` (26e).
function wrTechRepairH(m) {
  return wrHasTech(m, 'wt_e11') ? 2 : wrHasTech(m, 'wt_b5') ? 4 : 12;
}
// Ist der Faltraum-Anker HEUTE noch frei? Spiegel der `faltraumDay`-Prüfung in
// `recall_space_trip` (26g). ⚠️ Der Server vergleicht gegen UTC — der Client muss
// dasselbe tun, sonst zeigt er den Anker am Abend als verbraucht an, obwohl er frei ist.
function wrFaltraumFrei(m) {
  if (!wrHasTech(m, 'wt_f4')) return false;
  const heute = new Date().toISOString().slice(0, 10);
  return (wrSpace(m).faltraumDay || '') !== heute;
}
function wrTechWreck(m)    { return (wrHasTech(m,'wt_d5') ? 1.3 : 1.0) * (wrHasTech(m,'wt_e8') ? 1.3 : 1.0); }
// Kaufbar? (Voraussetzung erfüllt, noch nicht besessen, Effekt verdrahtet)
// ── ⏳ 26u: das laufende Forschungsprojekt ──────────────────────────────────
// ⚠️ NACHGEREICHT 2026-08-17 (JP: „wenn man eine Forschung anklickt, heisst es ‚es läuft
// bereits eine Forschung', aber man sieht keine laufende Forschung und das, was ich
// gerade erforschen wollte, ist immer noch anklickbar").
//
// Derselbe Fehlertyp wie bei den Kolonie-Angriffen: Ich habe in 26u die Server-Mechanik
// gebaut (`space.techJob`, `claim_space_tech`) und die ANZEIGE vergessen. Der Baum kannte
// nur „besessen" und „nicht besessen" — ein bezahltes, laufendes Projekt sah deshalb aus
// wie ein unangetastetes, und jeder weitere Klick lief in `tech_busy`.
//
// ⚠️ ÜBERTRAGBARE LEHRE: Wer einen Vorgang von SOFORT auf DAUERT umstellt, führt einen
// dritten Zustand ein. Jede Anzeige, die vorher mit zwei Zuständen auskam, ist damit
// unvollständig — und zwar stillschweigend, weil sie weiterhin etwas Plausibles zeigt.
// ⏱️ 27q: Wie lange dauert diese Forschung? (JP 2026-08-20: „Zeiten werden bei den
// Forschungen nicht angezeigt — man kann nicht planen.")
//
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel von `_space_tech_min(stufe)` aus
// migration_2026-08-17_26u_tempo.sql. Die Laufzeit hängt allein an der STUFE im Ast.
// ⚠️ Und sie hängt an NICHTS sonst: wt_a4/wt_e14 verkürzen die WERFT, nicht das Labor
// (ausdrücklich in 26u). Wer hier `wrTechBuildTime` einrechnet, zeigt eine Zahl an,
// die der Server nie verwendet — genau die Sorte Fehler, die 26u beim Flugzeit-Tempo
// schon einmal erzeugt hat.
//
// ⚠️ DIESELBE LÜCKE ZUM DRITTEN MAL IN DIESEM MODUL: 26u hat den Vorgang von SOFORT auf
// DAUERT umgestellt, danach fehlte erst die Anzeige des LAUFENDEN Projekts (nachgereicht)
// — und jetzt fiel auf, dass die Dauer VOR dem Kauf nie irgendwo stand. Ein Vorgang, der
// Zeit kostet, braucht beides: den Zustand währenddessen UND den Preis in Zeit davor.
const WR_TECH_MIN = [0, 120, 360, 720, 1440, 2880];   // Stufe 1..5
const WR_TECH_MIN_MID = 4320;    // Stufe 6–8: 3 Tage
const WR_TECH_MIN_TOP = 7200;    // ab Stufe 9: 5 Tage
function wrTechMinFor(t) {
  const st = Math.max(1, parseInt(t && t.stufe, 10) || 1);
  if (st <= 5) return WR_TECH_MIN[st];
  return st <= 8 ? WR_TECH_MIN_MID : WR_TECH_MIN_TOP;
}

function wrTechJob(m) {
  const j = wrSpace(m).techJob;
  return (j && typeof j === 'object' && j.key) ? j : null;
}
// Restzeit in ms. Ein unlesbarer Zeitstempel gilt als fertig — eine kaputte Uhr darf ein
// bezahltes Projekt nicht ewig festhalten (Kulanzrichtung wie bei readyAt in 26u).
function wrTechJobLeftMs(m) {
  const j = wrTechJob(m);
  if (!j || !j.doneAt) return 0;
  const done = Date.parse(j.doneAt);
  if (!isFinite(done)) return 0;
  return Math.max(0, done - Date.now());
}
function wrTechJobRestTxt(m) {
  const ms = wrTechJobLeftMs(m);
  if (ms <= 0) return 'gleich fertig';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const std = Math.floor(min / 60);
  return std < 24 ? `${std} h ${min % 60} min` : `${Math.floor(std / 24)} d ${std % 24} h`;
}

function wrTechState(m, t) {
  if (!t) return 'unknown';
  if (wrHasTech(m, t.key))                        return 'owned';
  const job = wrTechJob(m);
  // ⚠️ VOR den übrigen Prüfungen: ein laufendes Projekt ist bezahlt und muss als solches
  // erkennbar sein, auch wenn die Mittel inzwischen für etwas anderes ausgegeben wurden.
  if (job && job.key === t.key)                   return 'running';
  if (!t.live)                                    return 'soon';
  if (t.requires && !wrHasTech(m, t.requires))    return 'locked';
  // Labor belegt — die Sperre kommt NACH 'locked', damit eine gesperrte Technik weiter
  // ihre Voraussetzung nennt (die ist die nützlichere Auskunft).
  if (job)                                        return 'blocked';
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
  { key:'railgun',     art:'wt1_railgun',        folder:'weltraum', icon:'🔩', name:'Railgun',       atk:20,  cc:800,   erz:10,  kristall:0,   plasmoid:0, quantum:0,  minPort:1, needs:null,
    desc:'Solides Standardgeschütz — billig und sofort verfügbar' },
  { key:'laser',       art:'wt2_koffein_laser',  folder:'weltraum', icon:'⚡', name:'Laserbatterie', atk:45,  cc:1600,  erz:25,  kristall:0,   plasmoid:0, quantum:0,  minPort:1, needs:'wt_b2',
    desc:'Doppelte Feuerkraft, immer noch ohne Kristall' },
  { key:'plasma',      art:'wt3_plasma_kanone',  folder:'weltraum', icon:'🔥', name:'Plasmawerfer',  atk:85,  cc:3200,  erz:50,  kristall:10,  plasmoid:0, quantum:0,  minPort:2, needs:'wt_b3',
    desc:'Braucht einen ausgebauten Hafen und Koffeinkristall' },
  { key:'singularity', art:'wt5_singularitaet',  folder:'weltraum', icon:'🌀', name:'Singularität',  atk:130, cc:6400,  erz:100, kristall:30,  plasmoid:0, quantum:0,  minPort:3, needs:'wt_b5',
    desc:'Schwere Standardverteidigung — nur am Vollausbau' },
  // NEU (26k): die beiden Geschütze, die der Forschungsbaum längst versprach —
  // wt_e2 „Neues Geschütz atk 200", wt_f1 „Neues Geschütz atk 320".
  { key:'resonanz',     art:'wt6_resonanz_geschuetz', folder:'weltraum', icon:'💜', name:'Resonanz-Geschütz', atk:200, cc:14000, erz:180, kristall:60,  plasmoid:15, quantum:0, minPort:3, needs:'wt_e2',
    desc:'Plasmoid-Resonanz zerreisst Rümpfe auf Distanz — die erste echte Festungswaffe' },
  // ⚠️ UMBENANNT 2026-07-29 (JP): hieß „Quanten-Lanze" und zeigte einen schlanken Speer.
  // „Lanze ist lächerlich in diesem Zusammenhang, sind ja keine Amazonen, die hier
  // kämpfen" — es ist eine Festungswaffe, also ein GESCHÜTZ. Der SCHLÜSSEL bleibt
  // `quantenlanze` (er steckt server- und spielerseitig in `base.turrets`; ein
  // Key-Wechsel hätte bestehende Bauplätze still entwertet — dieselbe Regel wie beim
  // Kreuzer/Bomber-Namenstausch vom 22.07.). Nur der Anzeigename wechselt.
  // Das Bild `wt7_quanten_lanze.png` wird durch ein Geschütz-Render ersetzt
  // (Prompt: plans/PROMPT_quanten_geschuetz.md) — es dient Forschung UND Bauplatz.
  // 🌀 NEU 26p: das Quanten-Geschütz kostet zusätzlich 30 Quantenschaum (JP 2026-07-30:
  // „ja geschütz soll kosten"). Alle anderen Typen haben quantum 0.
  { key:'quantenlanze', art:'wt7_quanten_lanze', folder:'weltraum', icon:'🌠', name:'Quanten-Geschütz',  atk:320, cc:26000, erz:300, kristall:110, plasmoid:40, quantum:30, minPort:3, needs:'wt_f1',
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

// ── ⚡ Energie-System (26p) ───────────────────────────────────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel von _space_turret_energy / _space_power_base /
// _space_power_def / _space_power_supply / _space_turret_demand / _space_power_factor in
// migration_2026-07-26p_energie.sql. Bei Balance-Änderungen IMMER beide Seiten.
// ⚠️ Die AKTUELLEN Zahlen für WR_TURRET_ENERGY und WR_POWER_FLOOR stehen in
// migration_2026-08-17_26t_energie_balance.sql — 26p ist für diese beiden überholt.
//
// JP 2026-07-30: „Je mehr Geschütze, desto mehr Energie muss die Raumstation bekommen …
// holt das OP der Geschützflut etwas runter! Wenn zu wenig Energie vorhanden ist, dann
// werden die Geschützfähigkeiten reduziert."
//
// Energiebedarf je Geschütz auf Stufe 1. Der Stufenfaktor ist derselbe wie bei der
// Feuerkraft (WR_TURRET_ATK_MULT) — Energie ist Unterhalt und skaliert mit der Wirkung,
// nicht mit dem Kaufpreis.
//
// ⚠️ BALANCE 26t (Plan B.6.1): resonanz 26 → 34, quantenlanze 40 → 64. Nachgerechnet,
// nicht geschätzt: mit den alten Werten brauchte ein Quanten-Vollausbau (6 Slots, St. 3)
// 576 Energie, ein Plasmoid-Reaktor St. 3 lieferte 540 — also 94 %. Der Quantenschaum-
// Reaktor war damit totes Inventar, obwohl seine Beschreibung ihn als einzigen ausweist,
// der einen Quanten-Vollausbau trägt. Auf Kolonien war es eindeutig: 3 Quanten-Geschütze
// St. 3 brauchten 288, ein Plasmoid-Reaktor St. 1 liefert bereits 310.
// Neu: Vollausbau Resonanz 490 (Plasmoid St. 3 trägt ihn bequem), Quanten 922 (nur der
// Quanten-Reaktor trägt ihn). Die Beschreibung stimmt ab jetzt.
const WR_TURRET_ENERGY = {
  railgun: 2, laser: 4, plasma: 8, singularity: 14, resonanz: 34, quantenlanze: 64,
};
// Grundversorgung des Hafens OHNE Generator: 10 + Stufe × 10 → 20 / 30 / 40.
// Ein voller Railgun-Ausbau (29) läuft damit ab Hafenstufe 2 ohne Kraftwerk — wer klein
// spielt, merkt von der Mechanik nichts. Absicht.
const WR_POWER_BASE_SUPPLY = 10, WR_POWER_PER_LEVEL = 10;
// Untergrenze des Faktors. Unterversorgung soll wehtun, aber niemanden wehrlos machen:
// sonst ruiniert sich ein Spieler durch einen Bau unwiederbringlich — genau dann, wenn er
// investiert hat. Heilbar ist der Zustand jederzeit durch einen Generator-Ausbau.
//
// ⚠️ BALANCE 26t (Plan B.6.3): 0,35 → 0,25. Bei 0,35 trug ein Quanten-Vollausbau OHNE
// einen einzigen CC für Energie noch 1 613 Feuerkraft — mehr als ein sauber versorgter
// Ausbau mit mittleren Geschützen. Der Boden war als Rettungsleine gedacht und wirkte als
// Rabatt; mit 0,25 sind es 1 152. Er bleibt bewusst bestehen und wird NICHT auf 0 gesetzt
// (siehe Begründung oben). Einsteiger merken nichts: zwei Railguns brauchen 29 Energie und
// bekommen 20–40 aus der Grundversorgung — der Boden greift erst bei massivem Überbau.
const WR_POWER_FLOOR = 0.25;
// Generatoren. `out` = Ausgabe je Stufe (Index 1..3, Feld 0 bleibt leer). Die Kurve ist
// bewusst flacher als bei den Geschützen: der Sprung liegt im TYP, nicht in der Stufe —
// sonst liesse sich der Quanten-Generator über Stufen umgehen.
// Die Gates sind die ROHSTOFF-Freischaltungen: wer den Brennstoff nicht abbauen kann,
// soll das Kraftwerk nicht betreiben.
const SPACE_POWER = [
  { key:'kristall', art:'gen_kristall', folder:'weltraum', icon:'☕', name:'Koffein-Kristall-Reaktor',
    out:[0, 90, 140, 200], cc:6000,  erz:120, kristall:40,  plasmoid:0,  quantum:0,  needs:null,
    desc:'Ein Meiler aus geschichteten Koffeinkristallen — der Einstieg in die eigene Stromversorgung' },
  { key:'plasmoid', art:'gen_plasmoid', folder:'weltraum', icon:'🟣', name:'Plasmoid-Reaktor',
    out:[0, 280, 380, 500], cc:18000, erz:300, kristall:120, plasmoid:30, quantum:0,  needs:'wt_e7',
    desc:'Gebändigte Plasmoiden liefern ein Vielfaches — braucht den Plasmoiden-Abbau' },
  { key:'quanten',  art:'gen_quanten',  folder:'weltraum', icon:'🌀', name:'Quantenschaum-Reaktor',
    out:[0, 640, 820, 1000], cc:34000, erz:500, kristall:200, plasmoid:60, quantum:30, needs:'wt_f5',
    desc:'Das einzige Kraftwerk, das einen Vollausbau mit Quanten-Geschützen tragen kann' },
];
const SPACE_POWER_BY_KEY = SPACE_POWER.reduce((m, g) => (m[g.key] = g, m), {});
// Kostenfaktor je Stufe ×1 / ×1,8 / ×3 auf ALLE Rohstoffe — steiler als bei den
// Geschützen: ein Kraftwerk soll sich nicht nebenbei durchstufen lassen.
const WR_POWER_COST_MULT = [1, 1, 1.8, 3];
const WR_POWER_MAX = 3;

// ── Werft-Stufen ─────────────────────────────────────────────────────────────
// ⚠️ Spiegel von _space_yard_stats in migration_2026-07-21d_weltraum_werft.sql.
// timeCut/costCut = Anteil, der WEGFÄLLT. Der Kosten-Rabatt ist bewusst kleiner als der
// Zeit-Rabatt: die Werft soll Tempo bringen, nicht die Ökonomie aushebeln.
// ⚠️ `slots` NEU mit 27u (Hellingen). Spiegel von `_space_yard_slots`.
const SPACE_YARD = [
  { level:1, timeCut:0.00, costCut:0.00, slots:2, cc:0,     erz:0,   kristall:0,
    desc:'Einfaches Trockendock — 2 Hellingen, Grundgeschwindigkeit.' },
  { level:2, timeCut:0.25, costCut:0.10, slots:3, cc:4000,  erz:50,  kristall:0,
    desc:'Dritte Helling und Roboterarme: 3 gleichzeitig, 25 % schneller, 10 % billiger.' },
  { level:3, timeCut:0.45, costCut:0.20, slots:4, cc:12000, erz:150, kristall:40,
    desc:'Vollautomatische Fertigung: 4 Hellingen, 45 % schneller, 20 % billiger.' },
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
// ── 🏛️ 26u/26y: Ausrüstung einer Kolonie-Mission ────────────────────────────
// ⚠️ Spiegel von `_space_colony_kit` in migration_2026-08-17_26u_tempo.sql.
// JP 2026-08-17: „ich wollte kolonisieren und dann ging es nicht" → `colony_kit_incomplete`.
// Zum VIERTEN Mal derselbe Fehlertyp: die Regel stand serverseitig, die Anzeige fehlte.
// Der Plan verlangt sie ausdrücklich („Der Kolonisieren-Knopf zeigt die Anforderung
// vorab, wie beim Mutterschiff-Panel") — ich hatte sie in 26u nicht gebaut.
//
// ⚠️ Die Schiffe gehen bei der Gründung im Rumpf auf (26y) und kommen NICHT zurück.
// Das gehört in den Erklärtext, sonst wirkt der Verlust wie ein Fehler.
const WR_COLONY_KIT = {
  1: { erz: 600,  kristall: 180, plasmoid:   0, quantum:  0, cc:  8000,
       jaeger: 10, kutter: 3, fregatte: 0, ernter: 0 },
  2: { erz: 1000, kristall: 320, plasmoid:  60, quantum:  0, cc: 16000,
       jaeger: 20, kutter: 5, fregatte: 2, ernter: 1 },
  3: { erz: 1600, kristall: 500, plasmoid: 120, quantum: 50, cc: 28000,
       jaeger: 30, kutter: 8, fregatte: 4, ernter: 2 },
};
const WR_KIT_SHIPS = ['jaeger', 'kutter', 'fregatte', 'ernter'];

// Was fehlt für eine Kolonie-Mission? Liefert eine Liste [{was, need, have, schiff}].
// ⚠️ Es werden ALLE Posten gesammelt statt beim ersten Treffer abzubrechen — sonst
// sammelt man in vier Anläufen vier Fehlermeldungen (dieselbe Überlegung wie serverseitig).
function wrColonyKitMissing(m, ring, sel) {
  const k = WR_COLONY_KIT[Math.max(1, Math.min(3, ring || 1))];
  if (!k) return [];
  const f = sel || {};
  const out = [];
  if (!((f.kolonie || 0) >= 1)) out.push({ was: 'kolonie', need: 1, have: f.kolonie || 0, schiff: true });
  for (const key of WR_KIT_SHIPS) {
    if (k[key] > 0 && (f[key] || 0) < k[key]) {
      out.push({ was: key, need: k[key], have: f[key] || 0, schiff: true });
    }
  }
  const vorrat = { cc: parseFloat(m?.coins) || 0, erz: wrErz(m), kristall: wrKristall(m),
                   plasmoid: wrPlasmoid(m), quantum: wrQuantum(m) };
  for (const key of ['cc', 'erz', 'kristall', 'plasmoid', 'quantum']) {
    if (k[key] > 0 && vorrat[key] < k[key]) {
      out.push({ was: key, need: k[key], have: Math.floor(vorrat[key]), schiff: false });
    }
  }
  return out;
}
// ⚠️ KEINE zweite Emoji-Tabelle. Die Schiffssymbole stehen in SPACE_SHIPS und werden
// von dort gelesen — sonst hätte man beim nächsten Symbolwechsel zwei Orte zu pflegen
// und würde genau einen davon vergessen. (Ich hatte hier zuerst 🔫 hartkodiert und damit
// die Wasserpistole wieder eingeschleppt, die anderswo längst behoben war.)
const WR_KIT_RES = { cc: ['💰', 'CC'], erz: ['🪨', 'Erz'],
  kristall: ['💎', 'Kristall'], plasmoid: ['🟣', 'Plasmoid'],
  quantum: ['🌀', 'Quantenschaum'] };

// Reiner Text — für Toasts und Chat, wo KEIN HTML gerendert wird (Lehre aus Teil 23).
function wrKitLabel(k) {
  const sh = SPACE_SHIP_BY_KEY[k];
  if (sh) return `${sh.icon} ${sh.name}`;
  const r = WR_KIT_RES[k];
  return r ? `${r[0]} ${r[1]}` : k;
}
// Mit Bild — für Panels. Nutzt `wrShipArt()`, das genau für dieses Problem gebaut wurde
// („die Emoji sind teils irreführend"): echtes Render, Emoji nur als Rückfall.
function wrKitLabelHtml(k) {
  const sh = SPACE_SHIP_BY_KEY[k];
  if (sh) return `${wrShipArt(k)} ${_wrEsc(sh.name)}`;
  const r = WR_KIT_RES[k];
  if (!r) return _wrEsc(k);
  // ⚠️ 27q: die HTML-Schwester gab Schiffe als BILD (wrShipArt), Rohstoffe aber als
  // rohes Emoji zurück — dieselbe Halbheit wie bei den Preiszeilen. `WR_KIT_RES[k][0]`
  // bleibt der Emoji-Rückfall für `wrKitLabel` (Text, für Toasts).
  const ic = { erz:'erz', kristall:'kri', plasmoid:'pla', quantum:'qua' }[k];
  return `${ic ? wrIc(ic) : r[0]} ${r[1]}`;
}

// Die Anforderung als Block unter dem Kolonisieren-Knopf. Fehlendes rot.
function wrColonyKitHtml(m, ring, sel) {
  const k = WR_COLONY_KIT[Math.max(1, Math.min(3, ring || 1))];
  if (!k) return '';
  const fehlt = new Set(wrColonyKitMissing(m, ring, sel).map(x => x.was));
  const zeile = (key, wert, ist) => wert <= 0 ? '' :
    `<span class="${fehlt.has(key) ? 'wr-bad' : 'wr-good'}">${wrKitLabelHtml(key)} ${wrFmt(ist)}/${wrFmt(wert)}</span>`;
  const f = sel || {};
  // 🛸 Der Knopf macht die Automatik SICHTBAR. Sie gab es schon (erster Klick auf
  // „Kolonisieren" stellt zusammen), aber sie war hinter einem Knopf versteckt, der bei
  // fehlendem Rohstoff mit einer Fehlermeldung antwortete — für JP sah das aus, als
  // wäre sie abgeschaltet. Eine Automatik, die man nicht sieht, gibt es für den
  // Spieler nicht.
  const schiffeFehlen = wrColonyKitMissing(m, ring, f).some(x => x.schiff);
  return `<div class="wr-kit">
    <div class="wr-sub"><strong>Ring ${ring}: Ausrüstung der Kolonie-Mission</strong> —
      diese Schiffe gehen bei der Gründung im Rumpf auf und kehren <strong>nicht</strong> zurück.</div>
    <div class="wr-kit-grid">
      ${zeile('kolonie', 1, f.kolonie || 0)}
      ${WR_KIT_SHIPS.map(key => zeile(key, k[key], f[key] || 0)).join('')}
      ${zeile('cc', k.cc, Math.floor(parseFloat(m?.coins) || 0))}
      ${zeile('erz', k.erz, wrErz(m))}
      ${zeile('kristall', k.kristall, wrKristall(m))}
      ${zeile('plasmoid', k.plasmoid, wrPlasmoid(m))}
      ${zeile('quantum', k.quantum, wrQuantum(m))}
    </div>
    ${schiffeFehlen ? `<button class="wr-btn wr-btn-sm" data-wr-kitfill="${ring}"
      style="margin-top:6px">🛸 Verband automatisch zusammenstellen</button>` : ''}
  </div>`;
}

// ⚠️ BALANCE 26u (Plan B.1.1): 20 → 240 Minuten je Ring und Strecke.
// Ring 1 = 4 h · Ring 2 = 8 h · Ring 3 = 12 h. Damit wird die Antriebsforschung erstmals
// wertvoll: mit wt_a3 + wt_a5 + wt_e4 sinkt Ring 1 auf ~1,2 h. Spiegel von
// `v_per_ring` in start_space_trip (migration_2026-08-17_26u_tempo.sql).
const SPACE_MIN_PER_RING = 240;
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

// 🛡️ 27k: Auswahl im Garnison-Panel. Wie _wrSelFleet nur Sitzungszustand — es muss das
// Neurendern überleben, aber nicht den Reload (der Server hält die Wahrheit).
let _wrGarSel  = null;         // { planetId, ships:{key:n} }
let _wrGarMode = 'garrison';   // 'garrison' = hinschicken · 'recall' = zurückholen
// ⚠️ In-Flight-Sperre für den Sekundentakt. Ohne sie feuert der Loop die Einlöse-RPC
// jede Sekunde erneut, solange die Antwort noch unterwegs ist — dasselbe Muster wie
// `_passiveBusy` in db.js und `_wrsBusy` beim Flottensold.
let _wrGarBusy = false;

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
// ⚗️ Plasmoid-Injektion (26s) — Spiegel der Zahlen in claim_space_arrival/space_inject_load.
// ⚠️ Nur Anzeige: geladen und verbraucht wird server-seitig. Der Vorrat lebt in space.inject.
const WR_INJECT_MAX = 100, WR_INJECT_PCT = 0.4;   // 100 🟣 = +40 % Kampfkraft (Deckel)
function wrInject(m)      { return Math.max(0, Math.min(WR_INJECT_MAX, Math.floor(parseFloat(wrSpace(m).inject) || 0))); }
function wrInjectFactor(m) { return 1 + wrInject(m) * WR_INJECT_PCT / 100; }
function wrHomeShips(m) { return wrSpace(m).fleets?.home?.ships || {}; }
// 🧊 Eingemottete Flotte (26w). Bei Soldrückstand VERSCHIEBT der Server die Heimatflotte
// nach `fleets.mothballed` — die Schiffe sind nicht zerstört, nur wirkungslos.
// ⚠️ JP 2026-08-20: „wo sind die vermotteten schiffe und es gibt bisher keine Meldung
// dass sie wieder frei liegen". Genau das war der Fehler: dieser Schlüssel wurde im
// ganzen Client NIRGENDS gelesen. Die Heimatflotte stand danach auf 0, und der einzige
// Hinweis war ein Toast, der nach ein paar Sekunden fort war. `wrsUnmothball()` gab es
// zwar, aber KEIN Knopf rief sie auf — der Weg zurück führte nur über die Browser-Konsole.
// ⚠️ Merke (Teil 31, dritter Fall): eine Anzeige, die einen Zustand meldet, muss den Weg
// zur Handlung mitliefern. Ein Zustand ohne Ausweg liest sich wie ein Defekt.
function wrMothballed(m) {
  const o = wrSpace(m).fleets?.mothballed;
  return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
}
function wrMothCount(m) {
  const o = wrMothballed(m);
  return SPACE_SHIPS.reduce((a, s) => a + (parseInt(o[s.key], 10) || 0), 0);
}
// Offener Rückstand in CC. Liegt serverseitig in `space.sold.due` und wird beim Auslösen
// vollständig fällig — Teilzahlung gibt es bewusst nicht (26w).
function wrSoldDue(m) {
  return Math.max(0, Math.round(parseFloat(wrSpace(m).sold?.due) || 0));
}
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

// 🟣🌀 EXOTEN-TREIBSTOFF (27aa, JP 2026-08-21: „kann man noch einführen, dass die
// Schiffe, die plasmoid und die schiffe die quantenschaum kosten diese ebenfalls als
// Flugkosten verbrauchen?")
// Ein Schiff verbrennt je Reise 20 % SEINER EIGENEN Exoten-Baukosten je Ring-Stufe
// über 1 — Ring 1 frei, Ring 2 = 20 %, Ring 3 = 40 %.
//
// ⚠️ ANTEILIG statt pauschal, anders als die Kristall-Regel darüber. Flach wäre hier
// falsch: dann kosteten 20 billige Kreuzer mehr Flug-Plasmoid als die gesamte
// Elite-Flotte. Anteilig trägt sich die Regel selbst — was teuer zu bauen war, ist
// teuer zu bewegen — und sie braucht keine eigene Tabelle: SPACE_SHIPS hat die Zahlen.
// ⚠️ HÖHE VON JP, nicht hergeleitet: „mache je Schiff und Ring diese Berechnung …
// gemäss der Baukosten für 10, also 1 Schlachter 16" — sein Plasmoid-Ertrag liegt über
// 1.500/Tag, gegen den gemessen war mein erster Vorschlag (2 %) Rauschen.
// ⚠️ SPIEGEL von `_space_trip_exo_fuel` (SQL 27aa). Weicht eine Zahl ab, verspricht die
// Vorschau etwas anderes, als der Server abbucht (die Lehre aus 22e/27i).
// ⚠️ AUFRUNDEN GENAU EINMAL, auf die FLOTTENSUMME — je Schiff aufgerundet würde aus
// 0,4 eine ganze Einheit und bestrafte kleine Verbände. Weil jede Reise ihre eigene
// Aufrundung zahlt, ist Aufteilen nie billiger (die Bauzeiten-Lehre 27u/27v).
const WR_EXO_FUEL_PCT = 0.20;   // je Ring-Stufe über 1
function wrTripExoFuel(fleet, ring) {
  const pct = WR_EXO_FUEL_PCT * Math.max(0, (parseInt(ring, 10) || 0) - 1);
  if (pct <= 0) return { pla: 0, qua: 0 };
  let pla = 0, qua = 0;
  for (const [k, n] of Object.entries(fleet || {})) {
    const cnt = parseInt(n, 10) || 0;
    if (cnt <= 0) continue;
    const s = SPACE_SHIP_BY_KEY[k];
    if (!s) continue;                       // unbekannter Schlüssel: still überspringen
    pla += (s.plasmoid || 0) * cnt * pct;
    qua += (s.quantum  || 0) * cnt * pct;
  }
  return { pla: Math.ceil(pla), qua: Math.ceil(qua) };
}

// 🏗️ KOLONIE-AUSBAUZEIT (27ad, JP 2026-08-22: „Eine Kolonie Stufe zu erhöhen kostet
// keine Zeit das macht keinen Sinn. Das muss auch mindestens ein Tag").
// ⚠️ SPIEGEL von `_space_colony_build_min` (SQL 27ad). Es gibt nur DREI Stufen —
// `build_planet_defense` klemmt seit 26h auf LEAST(3, …), eine vierte Zeile wäre die
// Beschreibung einer Stufe, die es nicht gibt.
const WR_COLONY_BUILD_MIN = { 2: 1440, 3: 2160 };   // Minuten je ZIELSTUFE
function wrColonyBuildMin(target) {
  return WR_COLONY_BUILD_MIN[Math.max(2, Math.min(3, parseInt(target, 10) || 2))] || 1440;
}

// Läuft auf dieser Kolonie ein Ausbau? Liest die Planetenzeile — `colony_ready_at` und
// `colony_next_lvl` kommen über `select('*')` mit der Galaxie mit, es braucht also keinen
// eigenen Abruf.
// ⚠️ Die RESTZEIT kommt aus einem SERVER-Zeitstempel, nicht aus einer Client-Konstante.
// Genau daran ist der Transmuter gescheitert (27ac §1): dort rechneten beide Seiten
// selbst, und ab 27w rechneten sie verschieden — die Anzeige gab frei, was der Server
// ablehnte. Die Konstante oben dient nur der VORSCHAU vor dem Klick.
function wrColonyBuild(p) {
  if (!p || !p.colony_ready_at) return null;
  const ready = Date.parse(p.colony_ready_at);
  if (!isFinite(ready)) return null;
  const leftMin = Math.max(0, (ready - Date.now()) / 60000);
  if (leftMin <= 0) return null;          // fällig — die nächste Abholung bucht ihn ein
  const target = Math.max(2, Math.min(3, parseInt(p.colony_next_lvl, 10) || 2));
  return { target, minutesLeft: leftMin, totalMin: wrColonyBuildMin(target) };
}

// 💰 EINSATZKOSTEN je Absendung (27ac, JP 2026-08-22: „Bei einer im Absenden einer
// Flotte soll man dreimal die kampfkraft bezahlen").
// ⚠️ SPIEGEL von `start_space_trip` (SQL 27ac). Die Kampfkraft ist derselbe Wert, den
// der Verband-Picker als ⚔️ zeigt — kein zweiter Kennwert, sonst rechnet die Vorschau
// mit einer Zahl, die der Spieler nirgends sieht.
// ⚠️ WARUM KAMPFKRAFT UND NICHT BAUKOSTEN: an den Baukosten gemessen läge ein
// Röstkometen-Flug bei 22.500 CC und die Dauerernte wäre tot. Kampfkraft misst genau
// das, was JP besteuern wollte — Krieg. Ein Aufklärungsflug kostet 3 CC.
const WR_DISPATCH_CC = 3;   // CC je Punkt Kampfkraft
function wrDispatchCc(fleet) {
  return Math.ceil(Math.max(0, wrFleetPower(fleet || {})) * WR_DISPATCH_CC);
}

// ⚡ NOTFALL-BOOST (27ac): 5 × Kristall-Treibstoff der Reise je halbe Stunde, min. 5 💎.
// ⚠️ SPIEGEL von `_space_boost_cost`. Der Bezug ist `trip.fuel` — der Kristall-Posten,
// den diese Reise beim Start bezahlt hat; er liegt seit 22h im Reisedatensatz.
const WR_BOOST_MIN     = 5;    // 💎 Untergrenze (fängt den treibstofffreien Ring-1-Flug ab)
const WR_BOOST_FACTOR  = 5;
const WR_BOOST_MINUTES = 30;   // Zeitgewinn je Stufe
function wrBoostCost(trip) {
  return Math.max(WR_BOOST_MIN,
    Math.ceil(Math.max(0, parseFloat(trip?.fuel) || 0) * WR_BOOST_FACTOR));
}

function _wrEsc(s) { return (typeof _esc === 'function') ? _esc(s) : String(s == null ? '' : s); }
function wrFmt(n) { return Math.round(n || 0).toLocaleString('de-DE'); }
// Minutenangabe menschenlesbar (Bauzeiten/Flugzeiten)
function wrDur(min) {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return m + ' Min';
  const h = Math.floor(m / 60), r = m % 60;
  // ⚠️ 27q: ab zwei Tagen in TAGEN. Anlass war die Forschungsdauer (JP: „man kann nicht
  // planen") — die oberste Stufe sind 7 200 Minuten, und „120 Std" ist keine Zahl, mit der
  // jemand plant. Betrifft ebenso die grossen Schiffe: das Mutterschiff stand mit
  // „168 Std" da statt „7 Tage".
  // ⚠️ Bewusst in DIESER Funktion und nicht in einer zweiten daneben: zwei Zeitformate
  // nebeneinander wären genau die Doppeldeutigkeit, die in diesem Modul schon zwei
  // „Garnisonen" und zwei Symboltabellen erzeugt hat. Unter 48 h ändert sich nichts.
  if (h >= 48) {
    const d = Math.floor(h / 24), hr = h % 24;
    return hr ? `${d} Tage ${hr} Std` : `${d} Tage`;
  }
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
  // ⚠️ HIER BLEIBT ✈️ — bewusst. Das sind die EMOJI-RÜCKFÄLLE der Kennzahl-Icons, und
  // die zeigen weiterhin das flache `ic_travel.png`. JP 2026-08-20: den Jäger-Render nur
  // in die zwei Fließtext-Stellen. Grund steht bei wrIcArt: ein 256²-Render matscht bei
  // 16 px — genau deshalb wurde er am 2026-07-29 hier schon einmal wieder entfernt.
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

// 🪨💎🟣🌀 Rohstoff-SYMBOL zu einem Rohstoff-TYP — als Bild, nicht als Emoji.
// ⚠️ 27y (JP 2026-08-21): „Bei Sieg weiterhin Plasmoid Symbol statt Assets … bei den
// Kolonie-Abbau-Grundlagen ist es dasselbe."
// BEFUND: `wrIc()` kennt die KURZ-Schlüssel erz/kri/pla/qua. Die Rohstoff-TYPEN aus den
// Planetendaten heissen aber erz/kristall/plasmoid/quantum — und überall, wo ein TYP
// herkam, stand deshalb weiter `meta.icon` (das rohe Emoji). 27p hat genau die Stellen
// umgestellt, an denen der Schlüssel schon kurz war; die Typ-Stellen blieben zurück.
//   ⚠️ ÜBERTRAGBARE LEHRE (zweiter Fall nach 27p): Ein Mischbild entsteht nicht dadurch,
//   dass man eine Stelle VERGISST, sondern dadurch, dass zwei SCHREIBWEISEN desselben
//   Dings existieren und nur die eine umgestellt wird. Ab jetzt EINE Funktion, die
//   beide Schreibweisen versteht.
// ⚠️ NUR FÜR HTML — das Ergebnis ist eine <span>-Hülle. In Toast/Chat/title/fillText
// bleibt `wrResMeta(t).icon`.
const WR_RES_IC_KEY = { erz:'erz', kri:'kri', kristall:'kri', pla:'pla', plasmoid:'pla',
                        qua:'qua', quantum:'qua' };
function wrResIc(t) {
  const k = WR_RES_IC_KEY[t];
  return k ? wrIc(k) : wrResMeta(t).icon;
}
// Rohstoff-Liste `{erz,kri,pla,qua}` als HTML-Zeile. Nullposten fallen weg — sonst stünde
// dort dauerhaft „0 · 0 · 0 · 0". `suffix` z. B. „/Tag".
// `vz` ist das Vorzeichen ('+' oder '−'), Standard '+'.
// ⚠️ 27ab: Vorher habe ich das Minus per Regex ins FERTIGE HTML gepatcht — auf einer
// Zeichenkette, die Bild-Hüllen enthält. Das funktionierte, war aber genau die Sorte
// Griff, die beim nächsten Umbau bricht. Ein Parameter kostet eine Zeile und hält.
function wrResListe(o, suffix, vz) {
  const sfx = suffix || '', s = vz || '+';
  return [['erz', o.erz], ['kri', o.kri], ['pla', o.pla], ['qua', o.qua]]
    .map(([k, v]) => [k, Math.round(v || 0)])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${s}${wrFmt(n)} ${wrIc(k)}${sfx}`).join(' · ');
}
// ⚠️ Hier stand bis 27z eine zweite Fassung `wrResListeTxt` mit Emoji — für Toasts,
// weil `showToast` `textContent` setzte. Seit `showToast(msg, type, {html:true})`
// braucht es die nicht mehr, und eine ungenutzte Zwillingsfunktion, die „für Toasts"
// im Kommentar trägt, wäre ab sofort eine Fehlleitung. Fliesstext-Emoji ersetzt
// weiterhin `wrIcText`, Chat-Bilder das `[[s:key]]`-Token.

// ── 💰 Preis-/Kostenzeile in HTML (27p) ──────────────────────────────────────
// JP 2026-08-20: „die plasmoid assets und erz sowie kristall assets sollst du verwenden."
//
// ⚠️ BEFUND, der den Auftrag erklärt: `wrIc('pla')`/`wrIc('qua')` standen an diesen
// Stellen längst — 🪨 und 💎 waren als rohe Emoji danebengeblieben. Eine Zeile zeigte
// also zwei Bilder und zwei Emoji nebeneinander. Nicht vergessen, sondern HALB gemacht:
// beim Nachziehen der Ring-Rohstoffe (26o/26p) wurden nur die neuen Posten umgestellt.
//   ⚠️ ÜBERTRAGBARE LEHRE: Wer eine Darstellung für NEUE Fälle umstellt, muss die alten
//   im selben Zug mitnehmen — sonst entsteht kein Fortschritt, sondern ein Mischbild,
//   und das sieht schlechter aus als der Zustand davor.
//
// ⚠️ Und es gab FÜNF Beinahe-Kopien dieser Zeile (Kolonie-Bauplätze, Kolonie-Panel,
// Raumhafen, Kolonie-Kit, Generator-Lightbox) — teils mit `wrFmt`, teils ohne. Genau
// deshalb konnte die Hälfte davon zurückbleiben. Ab jetzt EINE Funktion.
//
// ⚠️ NUR FÜR HTML. Das Ergebnis enthält <span>-Hüllen: niemals in einen Toast, in eine
// Chat-Meldung, in ein `title="…"`-Attribut oder in `ctx.fillText` geben. Dort bleiben
// die Emoji stehen (für den Chat gibt es die [[s:key]]-Token).
function wrPreisTxt(c) {
  if (!c) return '';
  return [`${wrFmt(c.cc || 0)} CC`]
    .concat(c.erz      ? [`${wrFmt(c.erz)} ${wrIc('erz')}`]      : [])
    .concat(c.kristall ? [`${wrFmt(c.kristall)} ${wrIc('kri')}`] : [])
    .concat(c.plasmoid ? [`${wrFmt(c.plasmoid)} ${wrIc('pla')}`] : [])
    .concat(c.quantum  ? [`${wrFmt(c.quantum)} ${wrIc('qua')}`]  : []).join(' · ');
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
  // ⚠️ 27q (JP 2026-08-20): „im Chat bei Bau von Flugzeugen werden nicht die Erz und
  // Kristall assets angezeigt — was ist mit plasmoid und quantenschaum?"
  // Die SCHIFFE standen hier längst als `wrArtTok(k)` (= `[[s:key]]`, das `_chatArt()` in
  // app.js gegen das echte Bild tauscht) — die ROHSTOFFE daneben als rohes Emoji.
  // Dieselbe Halbheit wie in den Preiszeilen, nur im Chat: ein Bild und drei Emoji in
  // EINER Meldung. CHAT_ART kennt alle vier Sorten seit 26c.
  // ⚠️ Und ja, Plasmoid/Quantenschaum stehen hier: `wrBuildCart` füllt `s.pla`/`s.qua`
  // aus der Server-Antwort (27i-Kosten). Sie fehlten nicht — sie sahen nur nicht so aus.
  const cost = [`${wrFmt(s.cc)} CC`]
    .concat(s.erz ? [`${wrFmt(s.erz)} ${wrArtTok('erz')}`] : [])
    .concat(s.kri ? [`${wrFmt(s.kri)} ${wrArtTok('kristall')}`] : [])
    .concat(s.pla ? [`${wrFmt(s.pla)} ${wrArtTok('plasmoid')}`] : [])
    .concat(s.qua ? [`${wrFmt(s.qua)} ${wrArtTok('quantum')}`] : []).join(' · ');
  // ⏱️ Bauzeit mitnennen (JP 2026-08-20). Nur wenn sie bekannt ist: wrBuyTrack kann auch
  // ohne Warenkorb-Antwort laufen, dann bleibt `min` leer — und eine erfundene Zahl wäre
  // schlimmer als keine.
  const zeit = s.min > 0 ? ` — fertig in ${wrDur(s.min)}` : '';
  wrChat(`🏗️ ${_wrEsc(s.name)} hat in der Werft gebaut: ${parts.join(' · ')} (${cost})${zeit}.`, s.name);
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
// ⚠️ RÜCKBAU 2026-07-30 (JP): hier stand `|| wrHasTech(_wrMember, 'wt_e6')` — die
// Deep-Space-Sensorik hob damit den Nebel der GANZEN Galaxie dauerhaft.
// JP: „das finde ich doof — Alles sichtbar ist OP."
// Und er hat recht: eine einzige Technik entwertete die Bohnen-Sonde, den Schiffstyp,
// die Aufklärungs-Reise und die ganze Ring-für-Ring-Erkundung auf einen Schlag.
// `revealed` kommt jetzt wieder AUSSCHLIESSLICH aus dem Klan-Fortschritt (space_clan.revealed,
// gesetzt von claim_space_arrival nach einem Sonden-Flug) — Stand vor 26e.
// Die Technik hat einen neuen, milderen Effekt: wrSensed() (Nahbereichs-Ortung).
function wrRevealed(qkey) { return qkey === '0,0' || !!(_wrGalaxy?.revealed || {})[qkey]; }

// ── 📡 Nahbereichs-Ortung (wt_e6, neu gestaltet 2026-07-30) ──────────────────
// Der Ersatz für „deckt alles auf". Geortet wird NUR, was ohnehin als nächstes dran ist:
// ein Quadrant, der an einen erkundeten grenzt (= genau die, die `wrScoutable` erlaubt).
//
// Was die Ortung liefert: Planetenzahl, Gesamt-Wächterstärke, Wrackfelder, Ring-Rohstoffe.
// Was sie NICHT liefert: die einzelnen Planeten, ihre Namen, und keinerlei Reise dorthin.
// Der Nebel bleibt, der Sonden-Flug bleibt Pflicht.
//
// Warum das trotzdem 18 000 CC wert ist: die Sondenwahl war vorher BLIND. Man schickte
// eine Sonde ins Ungewisse und sah erst nach der Flugzeit, ob sich der Quadrant lohnt.
// Jetzt zielt man — Information statt Zugang. Das ist der Unterschied zwischen einem
// Sensor und einem Cheat.
function wrSensed(q) {
  return !!q && !wrRevealed(q.key) && wrHasTech(_wrMember, 'wt_e6') && wrScoutable(q);
}
// Aggregat-Aufklärung eines georteten Quadranten. Bewusst nur Summen — Einzelplaneten
// bleiben hinter dem Nebel.
// ⚠️ Die Planetenliste des Klans enthält ohnehin ALLE Quadranten (fetchGalaxy lädt
// `space_planets` ungefiltert); der Nebel war immer nur eine Anzeige-Schicht. Diese
// Funktion macht daraus also keine neue Information verfügbar, sie zeigt nur einen Teil
// dessen, was der Client längst hat — kontrolliert und an die Technik gebunden.
function wrSensorIntel(q) {
  const pls = wrPlanetsOf(q.key);
  if (!pls.length) return null;
  let str = 0, frei = 0, wreck = 0, ring = 0;
  for (const p of pls) {
    if (p.cleared_by) frei++; else str += parseFloat(p.enemy_strength) || 0;
    if (wrWreckLeft(p) > 0) wreck++;
    if (p.resource_type === 'plasmoid' || p.resource_type === 'quantum') ring++;
  }
  return { planets: pls.length, strength: Math.round(str), cleared: frei, wreck, ring };
}
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
        // ⚠️ KEIN HTML im Chat-Text: beide Renderer (renderMessages in app.js und das
        // 📜-Protokoll in wrLoadProtokoll) schicken die Nachricht durch _esc()/_wrEsc()
        // — ein <strong> steht dann als roher Text in der Blase (JP 2026-07-30).
        // Betonung nur über Emoji, Großschreibung oder „Anführungszeichen".
        wrChat(`🪐 ${_wrEsc(p.name)} (${_wrEsc(p.quadrant)}, Ring ${p.ring}) `
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
  await wrClaimTech(true);        // ⏳ 26u: fertige Forschung
  await wrClaimTurrets(true);     // ⏳ 26u: fertige Bauplätze auf Kolonien
  await wrSyncAttacks(true);      // 🚨 26v: Kolonie-Angriffe auswerten und planen
  // 🛡️ 27k: NACH wrSyncAttacks — fällt in dieser Runde eine Kolonie, hat der Trigger den
  // Garnisonsverlust schon abgelegt und wir melden ihn in derselben Sitzung. Umgekehrt
  // erführe der Spieler erst beim nächsten Öffnen, dass seine Schiffe mit gefallen sind.
  await wrClaimGarrison(false);
  try { await DB.spaceMercSweep(_wrMember.id); } catch (e) {}   // 🎖️ 26x: abgelaufene Söldner
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
    // ⚠️ 27y (JP 2026-08-21, zu „automatisch eingesammelt"): `harvest_space` liefert
    // seit 26c auch `plasmoid`/`quantum` und seit 21p `cc` zurück — die Meldung nannte
    // aber nur Erz und Kristall. Wieder „Server-Mechanik gebaut, Anzeige vergessen":
    // die Rohstoffe kamen an, nur sagte es niemand.
    // ⚠️ 27z: JETZT MIT BILDERN. `showToast` kann seit heute Markup (Opt-in
    // `{html:true}`) — vorher ging jede Meldung über `textContent`, und genau deshalb
    // standen hier Emoji. Der reine Text bleibt als Rückfall für die Konsole.
    wrErnteLogAdd(res, true);
    const parts = [];
    const resHtml = wrResListe({ erz: res.erz, kri: res.kristall, pla: res.plasmoid, qua: res.quantum });
    if (resHtml) parts.push(resHtml);
    if (res.cc > 0) parts.push(`+${wrFmt(res.cc)} CC`);
    if (parts.length) wrToast(`📥 Automatisch eingesammelt: ${parts.join(' · ')}`, 'success', true);
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
  // 🖼️ ECHTE BILDER statt Emoji (JP 2026-07-30): „das Flugzeug bei Flotten ist komisch und
  // der Satellit für Raumhafen auch." Das Emoji bleibt als `icon` stehen — es ist der
  // Rückfall, wenn das Bild fehlt (`wr-art-fail`-Muster wie überall sonst).
  { key:'flotten', icon:'🛩️', art:'ic_travel', name:'Flotten' },
  { key:'hafen', icon:'🛰️', art:'base_3', name:'Raumhafen' },
  // ⚠️ Bewusst `base_werft_3` (Vollausbau-Render) und NICHT das stufenabhängige Bild:
  // ein Tab-Symbol, das sich beim Werft-Ausbau ändert, wirkt wie ein Fehler — man sucht
  // den Tab an seinem Aussehen. Der Stufen-Render steht im Panel und in der Lightbox.
  { key:'werft', icon:'🏗️', art:'base_werft_3', name:'Werft' },
  { key:'tech',  icon:'🔬', name:'Forschung' },
  { key:'handel', icon:'🤝', name:'Handel' },
  { key:'log',   icon:'📜', name:'Protokoll' },
];
function wrTabsHtml() {
  return `<div class="wr-tabs">${WR_TABS.map(t =>
    `<button class="wr-tab${_wrTab === t.key ? ' active' : ''}" data-wr-tab="${t.key}"
      >${t.art
          // ⚠️ Der Rückfall gehört an den ELTERN-Knoten (`wr-art-fail` auf dem <span>),
          // nicht an das <img> selbst — sonst bliebe der Tab ohne jedes Symbol, wenn ein
          // Bild fehlt. Gleiches Muster wie wrTurretImg/wr-slot-art.
          ? `<span class="wr-tab-art"><img src="assets/space/${t.art}.png" alt=""
               onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
             ><span class="wr-tab-fb">${t.icon}</span></span>`
          : t.icon
        } <span class="wr-tab-l">${t.name}</span></button>`).join('')}</div>`;
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
      ${wrColonyAlertHtml(m)}
      ${wrHelpCallsHtml(m)}
      ${wrTripStripHtml(m, trips)}
      <div class="wr-map-card"${_wrTab === 'karte' ? '' : ' hidden'}>
        <div class="wr-card-title">🌌 Sternkarte <span class="wr-sub">— geteilt mit deinem Kaffee-Clan</span></div>
        <div class="wr-canvas-wrap">
          <canvas id="wr-canvas" class="wr-canvas" width="${WR_CANVAS_W}" height="${WR_CANVAS_H}"></canvas>
          <div class="wr-zoom">
            <button type="button" class="wr-zoom-btn" data-wr-zoom="in" title="Vergrößern">➕</button>
            <button type="button" class="wr-zoom-btn" data-wr-zoom="out" title="Verkleinern">➖</button>
            ${/* 🛰️ 27s: JP wollte die Ansicht abschaltbar („der Übersicht halber").
                  Der Knopf sitzt bei den Zoom-Knöpfen, weil beides dasselbe ist: eine
                  Einstellung der KARTE, keine Spielhandlung. */''}
            <button type="button" class="wr-zoom-btn${_wrShowOthers ? ' wr-zoom-on' : ''}"
              data-wr-others="1" title="Flotten der Mitspieler ${_wrShowOthers ? 'ausblenden' : 'einblenden'}"
              >${_wrShowOthers ? '👥' : '👤'}</button>
          </div>
        </div>
        <div class="wr-legend">
          <span><i class="wr-dot wr-dot-home"></i> Raumhafen</span>
          <span><i class="wr-dot wr-dot-fog"></i> Nebel</span>
          <span><i class="wr-dot wr-dot-erz"></i> ${wrIc('erz')} Erz</span>
          <span><i class="wr-dot wr-dot-kri"></i> ${wrIc('kri')} Kristall</span>
          <span><i class="wr-dot wr-dot-pla"></i> ${wrIc('pla')} Plasmoid</span>
          <span><i class="wr-dot wr-dot-qua"></i> ${wrIc('qua')} Quantenschaum</span>
          <span><i class="wr-dot wr-dot-clear"></i> befreit</span>
          <span><i class="wr-dot wr-dot-colony"></i> Kolonie (Spielerfarbe · Ringe = Stufe)</span>
          <span>🛡️ Geschütze · 📡 Station</span>
          <span><i class="wr-dot wr-dot-risk"></i> ungeschützt — Rückfall droht</span>
          ${(() => {
            // Die Legende nennt den Zustand des Schalters, nicht nur die Bedeutung —
            // sonst sucht man ausgeblendete Flotten auf der Karte statt am Knopf.
            const n = wrOtherTrips().length;
            return `<span><i class="wr-dot wr-dot-other"></i> ${_wrShowOthers
              ? `Flotten der Mitspieler (Spielerfarbe)${n ? ` — ${n} unterwegs` : ' — gerade keine'}`
              : 'Mitspieler-Flotten ausgeblendet — 👤 schaltet sie ein'}</span>`;
          })()}
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
    // ⚠️ FIX 2026-08-17 (JP, Screenshot `reference/Fehlermeldung_Popup-hilferuf.PNG`):
    // Der Hilferuf klebte oben links, überdeckte die Kopfzeile und war unten so
    // abgeschnitten, dass „Später" und „Zum Weltall" nicht mehr sichtbar waren — man
    // konnte ihn also gar nicht wegklicken.
    //
    // URSACHE: Das Popup borgte sich `quiz-backdrop`/`quiz-box` aus `css/style.css`.
    // Dort ist `.quiz-backdrop` aber `position: ABSOLUTE` und `.quiz-box`
    // `position: relative` — beide setzen einen POSITIONIERTEN Eltern-Container voraus,
    // den das Quiz-Modal mitbringt. `#wr-help-modal` ist ein nacktes <div> an
    // `document.body`: kein `fixed`, kein Zentrieren, Inhalt im normalen Textfluss.
    //
    // ⚠️ ÜBERTRAGBARE LEHRE: Geborgte CSS-Klassen bringen ihre VORAUSSETZUNGEN nicht mit.
    // `.quiz-card` (reines Aussehen) lässt sich überall verwenden, `.quiz-box`/-backdrop
    // (Positionierung) nur im vorgesehenen Rahmen. Wer Layout-Klassen ausleiht, muss den
    // Container mitliefern — hier die bereits vorhandene `.wr-overlay` (fixed, zentriert,
    // z-index 9000), die im selben Stylesheet steht und genau dafür da ist.
    let mEl = document.getElementById('wr-help-modal');
    if (!mEl) { mEl = document.createElement('div'); mEl.id = 'wr-help-modal'; document.body.appendChild(mEl); }
    mEl.className = 'wr-overlay';
    mEl.innerHTML = `
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
      // ⚠️ 27i: Der Zuschlag zahlt den NORMALEN Kaufpreis (SQL 22i) — seit die schweren
      // Schiffe Exoten kosten, gehören die hier mit hinein. Ohne das zeigt die Zeile einen
      // Preis an, den der Server so nie abbucht, und der Knopf wäre freigeschaltet, obwohl
      // 🟣/🌀 fehlen. `|| 0` überall: die leichten Schiffe haben diese Felder gar nicht.
      const cc  = (sd.cc || 0) * o.amount, erz = (sd.erz || 0) * o.amount;
      const kri = (sd.kristall || 0) * o.amount;
      const pla = (sd.plasmoid || 0) * o.amount, qua = (sd.quantum || 0) * o.amount;
      const afford = (parseFloat(m?.coins) || 0) >= cc && wrErz(m) >= erz && wrKristall(m) >= kri
                  && wrPlasmoid(m) >= pla && wrQuantum(m) >= qua;
      const kost = [`${wrFmt(cc)} CC`];
      if (erz > 0) kost.push(`${wrFmt(erz)} ${wrIc('erz')}`);
      if (kri > 0) kost.push(`${wrFmt(kri)} ${wrIc('kri')}`);
      if (pla > 0) kost.push(`${wrFmt(pla)} ${wrIc('pla')}`);
      if (qua > 0) kost.push(`${wrFmt(qua)} ${wrIc('qua')}`);
      // ⚠️ JP 2026-08-20: „Bei den angebotenen Schiffen die man verkauft fehlen ebenfalls
      // die korrekten Assets." Hier stand `sd.icon` — das ROHE Emoji —, während die
      // Anbieten-Knöpfe zwanzig Zeilen tiefer längst wrShipArt() benutzen. Eine Zeile,
      // die dasselbe Schiff anders darstellt als die daneben.
      return `<div class="wr-trade-row${own ? ' is-own' : ''}">
        <span class="wr-trade-what">${wrShipArt(sd.key, 'wr-mini')} <strong>${o.amount}×</strong> ${_wrEsc(sd.name)}</span>
        <span class="wr-trade-who">${own ? 'dein Angebot' : _wrEsc(o.seller_name || 'Clan-Mitglied') + ' bietet'}</span>
        <span class="wr-trade-price"><strong>${kost.join(' + ')}</strong></span>
        ${own
          ? `<button class="wr-btn wr-btn-sm" data-wr-trade-cancel="${o.id}">Zurückziehen</button>`
          : `<button class="wr-btn wr-btn-sm wr-btn-go" data-wr-trade-shipbuy="${o.id}" ${afford ? '' : 'disabled'}>⚡ Zuschlag</button>`}
      </div>`;
    }
    const icon = wrIc(o.resource_type === 'erz' ? 'erz' : 'kri');
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
        <button class="wr-tr-btn${_wrTrType === 'erz' ? ' active' : ''}" data-wr-tr-type="erz">${wrIc('erz')} Erz <span class="wr-sub">${WR_TRADE_PRICE.erz} CC/Stk</span></button>
        <button class="wr-tr-btn${_wrTrType === 'kristall' ? ' active' : ''}" data-wr-tr-type="kristall">${wrIc('kri')} Kristall <span class="wr-sub">${WR_TRADE_PRICE.kristall} CC/Stk</span></button>
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
        Dein Lager: ${wrFmt(wrErz(m))} ${wrIc('erz')} · ${wrFmt(wrKristall(m))} ${wrIc('kri')}</p>
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

// ── 📥 Ernte-Protokoll (27z) ───────────────────────────────────────
// JP 2026-08-21: „automatisch eingesammelt kommt lediglich als popup — kann es auch in
// das protokoll?" Ja — aber NICHT über `wrChat`.
//
// ⚠️ BEGRÜNDUNG, warum hier ausnahmsweise KEIN Chat-Eintrag entsteht: die Auto-Ernte
// läuft bei jedem Öffnen des 🚀-Tabs (gedrosselt auf 10 Minuten). Im Gruppen-Chat wäre
// das für JEDEN Mitspieler mehrmals täglich eine Zeile — genau der Spam, den die
// Krieger-Sitzungszusammenfassung (2026-07-16) schon einmal abstellen musste. Eine Ernte
// ist ein PRIVATES Ereignis; sie gehört neben das Clan-Protokoll, nicht hinein.
//   ⚠️ ÜBERTRAGBARE LEHRE: „ins Protokoll" heißt nicht automatisch „in den geteilten
//   Kanal". Vor dem Eintragen fragen, WIE OFT das Ereignis eintritt und WEN es angeht.
//
// ⚠️ Speicher: `localStorage`, also geräte-lokal. Das steht auch in der Karte — ein
// Protokoll, das auf dem Telefon anders aussieht als am Rechner, muss das sagen.
// ⚠️ Jeder Zugriff in try/catch (Regel 3): `localStorage` wirft in privaten Fenstern
// und bei gesperrten Seitendaten, und eine Ernte darf daran nie scheitern.
const WR_ERNTE_LOG_MAX = 40;
function _wrErnteKey() { return 'wr_ernte_' + (_wrMember?.id || 'x'); }
function wrErnteLog() {
  try {
    const r = JSON.parse(localStorage.getItem(_wrErnteKey()) || '[]');
    return Array.isArray(r) ? r : [];
  } catch (e) { return []; }
}
function wrErnteLogAdd(res, auto) {
  try {
    const n = (v) => Math.round(parseFloat(v) || 0);
    const eintrag = { t: Date.now(), auto: !!auto,
      erz: n(res?.erz), kri: n(res?.kristall), pla: n(res?.plasmoid), qua: n(res?.quantum),
      cc:  n(res?.cc),  fuel: n(res?.fuel) };
    // Eine Ernte ohne Ertrag ist kein Ereignis — sonst füllt sich die Liste mit Nullen,
    // und genau die waren JPs Ausgangsbeschwerde an der Dauerernte-Karte.
    if (!(eintrag.erz || eintrag.kri || eintrag.pla || eintrag.qua || eintrag.cc)) return;
    const list = wrErnteLog();
    list.push(eintrag);
    localStorage.setItem(_wrErnteKey(), JSON.stringify(list.slice(-WR_ERNTE_LOG_MAX)));
  } catch (e) { /* Regel 3: darf das Einsammeln nie stören */ }
}
function wrErnteLogHtml() {
  const list = wrErnteLog().slice().reverse();
  if (!list.length) return '';
  const sum = list.reduce((a, x) => ({ erz: a.erz + x.erz, kri: a.kri + x.kri,
    pla: a.pla + x.pla, qua: a.qua + x.qua, cc: a.cc + x.cc }), { erz:0, kri:0, pla:0, qua:0, cc:0 });
  const zeile = (x) => `${wrResListe(x) || '—'}${x.cc > 0 ? ` · +${wrFmt(x.cc)} CC` : ''}`;
  const rows = list.map(x => `
    <div class="wr-log-row"><span class="wr-log-t">${wrWhen(x.t)}</span>
      <span class="wr-log-msg">${x.auto ? '📥' : '✋'} ${zeile(x)}${
        x.fuel > 0 ? ` <span class="wr-sub">−${wrFmt(x.fuel)} ${wrIc('kri')} Treibstoff</span>` : ''}</span></div>`).join('');
  return `<div class="wr-card">
      <div class="wr-card-title">📥 Deine letzten Ernten
        <span class="wr-sub">— Kolonien, Dauerernte und Bergung</span></div>
      <div class="wr-facts"><span>Summe dieser ${list.length}: <strong>${zeile(sum)}</strong></span></div>
      <div class="wr-log-list">${rows}</div>
      <div class="wr-sub">📥 automatisch beim Öffnen des 🚀-Tabs · ✋ per Knopf.
        Die letzten ${WR_ERNTE_LOG_MAX} Einträge, gespeichert in DIESEM Browser — auf einem
        anderen Gerät steht hier eine andere Liste. Bewusst nicht im Gruppen-Chat: dort
        stünde sonst mehrmals täglich eine Zeile von jedem Mitspieler.</div>
    </div>`;
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
  const ernte = wrErnteLogHtml();
  if (!rows.length) {
    el.innerHTML = ernte + `<div class="wr-card"><div class="wr-card-title">📜 Ereignis-Protokoll</div>
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
  el.innerHTML = ernte + `<div class="wr-card"><div class="wr-card-title">📜 Ereignis-Protokoll
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
const WR_RES_NOTE = `<div class="wr-note">${wrIc('erz')} Erz und ${wrIc('kri')} Koffeinkristall sind <strong>nicht käuflich</strong> — es gibt sie
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
               + `<span class="wr-btn-sub">Auftrag verfällt · ${wrFaltraumFrei(m)
                   ? '🌀 Faltraum-Anker: SOFORT zu Hause (1× am Tag)'
                   : 'Rückweg = bisherige Flugzeit'}</span></button>`
             : ''}
           ${(() => {
             // ⚡ NOTFALL-BOOST (27ac). JP: „Wenn eine Kolonie angegriffen wird schafft
             // man gar nichts seine eigene Garnison noch mal hinzuschicken."
             // Es gibt bewusst KEIN What's-New-Popup — dieser Knopf IST die Erklärung
             // der Regel und muss deshalb vollständig sein: Preis, Zeitgewinn und die
             // Untergrenze stehen dran, nicht in einer Meldung nach dem Klick.
             if (now >= arrive || trip.recalled) return '';
             const restMin = (arrive - now) / 60000;
             const kosten  = wrBoostCost(trip);
             const zuNah   = restMin - WR_BOOST_MINUTES < 5;
             const knapp   = wrKristall(m) < kosten;
             if (zuNah) {
               return `<div class="wr-sub">⚡ Für einen Boost zu kurz vor der Ankunft `
                    + `(es müssen 5 Minuten übrig bleiben).</div>`;
             }
             return `<button class="wr-btn wr-btn-sm" data-wr-boost="${trip.id}"
                 ${knapp ? 'disabled' : ''}>⚡ Beschleunigen −${WR_BOOST_MINUTES} min`
               + `<span class="wr-btn-sub">${wrFmt(kosten)} ${wrIc('kri')}`
               + `${knapp ? ` — du hast nur ${wrFmt(wrKristall(m))}` : ' · beliebig oft'}`
               + `</span></button>`;
           })()}
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
// ── 🧊 Eingemottete Flotte (JP 2026-08-20) ──────────────────────────────────
// Der Ort, an den man zurückkehren kann. Ein Toast taugt für Vollzugsmeldungen, nicht
// für einen Dauerzustand — und dieser hier hält an, bis der Rückstand bezahlt ist.
// Steht bewusst GANZ OBEN im Flotten-Tab: solange die Flotte eingemottet ist, ist alles
// andere auf dieser Seite nachrangig.
function wrMothballHtml(m) {
  const moth = wrMothballed(m);
  const n    = wrMothCount(m);
  if (n < 1) return '';
  const due   = wrSoldDue(m);
  const coins = Math.floor(parseFloat(m?.coins) || 0);
  const kann  = coins >= due;
  const rows  = SPACE_SHIPS
    .filter(s => (parseInt(moth[s.key], 10) || 0) > 0)
    .map(s => `<div class="wr-fl-row">
        <span class="wr-fl-art wr-ship-zoom" data-wr-info="${s.key}" title="Groß ansehen"
          ><img src="assets/space/${s.art}.png" alt="" onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-fl-fb">${s.icon}</span></span>
        <span class="wr-fl-name">${_wrEsc(s.name)}</span>
        <span class="wr-fl-n">${wrFmt(parseInt(moth[s.key], 10) || 0)}</span>
        <span class="wr-fl-atk">🧊 stillgelegt</span>
      </div>`).join('');
  return `
    <div class="wr-card wr-moth">
      <div class="wr-card-title">🧊 Eingemottete Flotte
        <span class="wr-sub">— ${wrFmt(n)} Schiffe stillgelegt, nicht verloren</span></div>
      <div class="wr-warn">Der Flottensold war nicht gedeckt. Diese Schiffe liegen im Hafen
        fest: sie fliegen nicht, verteidigen nicht und zählen nirgends mit — sie kosten aber
        auch <strong>keinen Unterhalt</strong>, solange sie hier stehen.</div>
      ${rows}
      <div class="wr-facts">
        <span>💰 Rückstand: <strong>${wrFmt(due)} CC</strong></span>
        <span>👛 Guthaben: <strong>${wrFmt(coins)} CC</strong></span>
      </div>
      <button class="wr-btn${kann ? ' wr-btn-go' : ''}" data-wr-unmothball="1" ${kann ? '' : 'disabled'}>
        ⚓ Flotte auslösen
        <span class="wr-btn-sub">${kann
          ? `−${wrFmt(due)} CC, danach ist sie sofort wieder einsatzbereit`
          : `es fehlen noch ${wrFmt(due - coins)} CC — Teilzahlung ist nicht möglich`}</span>
      </button>
    </div>`;
}

// ── 🛡️ Garnisonen im Flotten-Tab (27m, JP 2026-08-20) ──────────────────────
// JP: „Ich möchte unter Flotten auch die geschickten Garnisonen, wo sie stationiert
// sind, angezeigt bekommen, um sie evtl. zurückbeordern zu können."
//
// ⚠️ DIESELBE LÜCKE WIE BEIM EINMOTT-PANEL, UND ZWAR AUS DEMSELBEN GRUND.
// Die Garnison liegt bewusst NICHT in `fleets` (27k: „unmöglich" schlägt „verboten") —
// dadurch sieht sie aber auch keine der Anzeigen, die aus `fleets` gespeist werden.
// Der Entwurf war richtig, die Folge für die Oberfläche war nicht mitgedacht:
//   ⚠️ Wer einen Bestand ABSICHTLICH aus der gemeinsamen Struktur heraushält, muss ihm
//      eine EIGENE Anzeige geben. Sonst ist er nicht nur unerreichbar für den Code,
//      sondern auch für den Spieler.
// Zum dritten Mal in diesem Modul (mothballed 26w, merc 26x, garrison 27k).
//
// Der Rückhol-Knopf holt ALLES von einer Kolonie. Für Teilmengen bleibt der Stepper im
// Kolonie-Panel zuständig — bewusst kein zweiter Picker: zwei Auswahlwege für dieselbe
// Sache sind der Weg zu zwei Auffassungen davon, was ausgewählt ist.
function wrGarrisonFleetHtml(m) {
  const all   = wrGarrisonAll(m);
  const trips = wrGarrisonTrips(m);
  const moth  = wrMothCount(m) > 0;
  // Alle Kolonien, die etwas stehen haben ODER auf etwas warten.
  const ids = Array.from(new Set(
    Object.keys(all).filter(id => wrGarrisonCount(m, id) > 0)
      .concat(trips.map(t => t && t.planetId).filter(Boolean))));
  if (!ids.length) return '';

  const satz = (typeof WRS_SOLD_SHIP === 'number') ? WRS_SOLD_SHIP : 0.01;
  let gesN = 0, gesPow = 0, gesSold = 0;
  const karten = ids.map(pid => {
    const p     = wrPlanetById(pid);
    const ships = wrGarrisonShips(m, pid);
    const n     = wrGarrisonCount(m, pid);
    const pow   = wrGarrisonPower(m, pid);
    const trip  = wrGarrisonTripFor(m, pid);
    // ⚠️ Sold auch für Schiffe im Transport — sie sind im Dienst (wrsSoldRate zählt sie
    // ebenso). Eine Anzeige, die weniger nennt als die Abbuchung, wirkt wie ein Fehler.
    const quellen = [ships].concat(trip ? [trip.ships || {}] : []);
    let sold = 0, unterwegsN = 0;
    for (const q of quellen) {
      for (const [k, v] of Object.entries(q)) {
        const x = parseInt(v, 10) || 0;
        if (x <= 0) continue;
        sold += x * ((SPACE_SHIP_BY_KEY[k]?.cc || 0) * satz);
      }
    }
    if (trip) unterwegsN = Object.values(trip.ships || {})
      .reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
    gesN += n; gesPow += pow; gesSold += sold;

    const rows = SPACE_SHIPS
      .filter(s => (parseInt(ships[s.key], 10) || 0) > 0)
      .map(s => {
        const x = parseInt(ships[s.key], 10) || 0;
        return `<div class="wr-fl-row">
            ${wrShipArt(s.key, 'wr-fl-art')}
            <span class="wr-fl-name">${_wrEsc(s.name)}</span>
            <span class="wr-fl-n">${wrFmt(x)}</span>
            <span class="wr-fl-atk">${wrIc('atk')} ${wrFmt((s.atk || 0) * x)}</span>
          </div>`;
      }).join('');

    return `
      <div class="wr-gar-card">
        <div class="wr-gar-head">
          <span>🏙️ <strong>${_wrEsc(p?.name || 'Kolonie')}</strong>
            <span class="wr-sub">${p ? `Ring ${p.ring} · ${_wrEsc(p.quadrant)} · Stufe ${wrColonyLevel(p)}` : 'Planet noch nicht geladen'}</span></span>
          <span class="wr-sub">${wrFmt(n)}${p ? ` von ${wrFmt(wrGarrisonCap(p))}` : ''} Plätze${
            pow ? ` · ${wrIc('atk')} ${wrFmt(pow)}` : ''} · ⚓ ${wrFmt(Math.round(sold))} CC/Tag</span>
        </div>
        ${rows || '<div class="wr-sub" style="padding:4px 0">Noch nichts stationiert.</div>'}
        ${trip
          ? `<div class="wr-ok">🚚 ${trip.kind === 'recall' ? 'Rückholung' : 'Verlegung'} unterwegs
               (${wrFmt(unterwegsN)} Schiffe) — Ankunft in
               <strong data-wr-gareta="${_wrEsc(trip.id || '')}"
               >${wrCountdown(Date.parse(trip.arriveAt) - Date.now())}</strong>.</div>`
          : ''}
        <div class="wr-gar-acts">
          <button class="wr-btn wr-btn-sm" data-wr-goto-colony="${_wrEsc(pid)}"
            >🏙️ Zur Kolonie<span class="wr-btn-sub">einzeln verlegen oder abziehen</span></button>
          <button class="wr-btn wr-btn-sm" data-wr-garpull="${_wrEsc(pid)}"
            ${(trip || n < 1 || moth) ? 'disabled' : ''}>⬅️ Alles zurückholen
            <span class="wr-btn-sub">${moth
              ? 'erst die eingemottete Flotte auslösen'
              : trip ? 'erst den laufenden Transport abwarten'
                     : n < 1 ? 'hier steht nichts'
                             : `${wrFmt(n)} Schiffe · volle Flugzeit zurück`}</span></button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="wr-card">
      <div class="wr-card-title">🛡️ Garnisonen auf Kolonien
        <span class="wr-sub">— ${wrFmt(gesN)} Schiffe auf ${ids.length} Kolonie(n)${
          gesPow ? ` · ${wrFmt(gesPow)} Feuerkraft` : ''} · ⚓ ${wrFmt(Math.round(gesSold))} CC/Tag</span></div>
      <div class="wr-sub">Diese Schiffe stehen dauerhaft auf deinen Kolonien und verteidigen
        sie mit voller Kampfkraft. Sie verteidigen den Raumhafen <strong>nicht</strong>, fliegen
        von dort keine Angriffe und zählen nicht zur Heimatflotte — sie zahlen aber vollen
        Flottensold, weil sie nichts erwirtschaften. Zurückgeholte Schiffe brauchen die volle
        Flugzeit; je Kolonie läuft immer nur ein Transport.</div>
      ${moth ? `<div class="wr-warn">🧊 Deine Flotte ist eingemottet — die Garnison zählt
        solange mit 0 Feuerkraft und kostet nichts. Verlegen und Zurückholen sind gesperrt,
        bis die Flotte ausgelöst ist.</div>` : ''}
      ${karten}
    </div>`;
}

function wrFlottenHtml(m, trips) {
  const list = trips || wrTrips(m);
  const verbaende = list.length
    ? list.map(t => wrTripHtml(m, t)).join('')
    : `<div class="wr-sub" style="padding:6px 0">Kein Verband unterwegs — wähle auf der
         🌌 Sternkarte ein Ziel und stelle deine Flotte zusammen.</div>`;
  return `
    ${wrMothballHtml(m)}
    <div class="wr-card">
      ${/* 27p (JP 2026-08-20): „bei Flottenverbänden einfach das Flotten Symbol,
            was du schon im reiter hast, statt das Kleinflugzeug." 🛩️ ist als
            Emoji buchstäblich „small airplane" — hier steht jetzt dasselbe Bild wie
            im Reiter (assets/space/ic_travel.png über wrIc('fleet')), das Emoji
            bleibt sein Rückfall. */''}
      <div class="wr-card-title">${wrIc('fleet')} Verbände unterwegs
        <span class="wr-sub">${list.length} von ${WR_MAX_TRIPS} · jeder weitere startet mit
          ${wrFleetGap(m)} Min Vorlauf</span></div>
      ${verbaende}
    </div>
    ${wrGarrisonFleetHtml(m)}
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
  // 📋 27ac / D1 (JP 2026-08-22: „Der flottenverband den man auswählen kann ist sehr gut
  // allerdings auch versteckt und man könnte ihn mit Hinweis auf führen bei der Auswahl
  // des Planeten").
  // ⚠️ BEFUND: Die Vorlagen stehen im 🛩️ Flotten-Tab, zusammengestellt wird aber HIER,
  // auf der 🌌 Sternkarte. Zwei Tabs auseinander — man findet sie nur, wenn man schon
  // weiss, dass es sie gibt. Eine Abkürzung, die man suchen muss, ist keine.
  // ⚠️ BEWUSST DIESELBEN `data-wr-tplload`-Knöpfe wie dort und KEINE eigenen IDs: der
  // Klick-Handler existiert längst und gilt global. Ein zweites Bedienelement mit
  // eigener Logik wäre der Anfang von zwei Wahrheiten (die Lehre aus 27p/27y).
  const tplList = wrTemplates(m);
  const tplHtml = `
    <div class="wr-fs-tplrow">
      <span class="wr-sub">📋 Flottenverband laden:</span>
      ${tplList.length
        ? tplList.map(t => {
            const av = wrTplAvail(m, t);
            return `<button type="button" class="wr-fs-q${av.full ? '' : ' wr-tpl-part'}"
              data-wr-tplload="${_wrEsc(t.id)}"
              title="${av.full ? 'Vollständig verfügbar' : `nur ${av.have} von ${av.want} Schiffen im Hafen`}"
              >${_wrEsc(t.name || 'Vorlage')}${av.full ? '' : ' ⚠️'}</button>`;
          }).join('')
        : `<span class="wr-sub">— noch keine. Tipp: häufige Zusammenstellungen einmal merken
             und danach mit einem Klick laden.</span>`}
      ${wrSelTotal() > 0 && tplList.length < WR_TPL_MAX
        ? `<button type="button" class="wr-fs-q" id="wr-fs-tplsave"
             title="Die aktuelle Auswahl als Verband speichern">➕ merken</button>` : ''}
    </div>`;

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
      ${tplHtml}
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
          // 💰 27ac: Absendekosten. Sie stehen NEBEN der Kampfkraft, aus der sie
          // gerechnet werden — dann muss niemand raten, worauf sich die „dreimal"
          // bezieht. Und sie wandern bei jedem ± mit, weil dieser ganze Block bei
          // jedem Rendern neu entsteht.
          const kost = wrDispatchCc(sel);
          if (kost <= 0) return '';
          const habe = Math.floor(parseFloat(m?.coins) || 0);
          return `<span class="${habe < kost ? 'wr-bad' : ''}">💰 Einsatzkosten:
            <strong>${wrFmt(kost)} CC</strong>${habe < kost
              ? ` <span class="wr-sub">(nur ${wrFmt(habe)} CC auf dem Konto!)</span>` : ''}</span>`;
        })()}
        ${(() => {
          // 💎 Treibstoff der aktuellen Auswahl zum gewählten Ziel (Ring aus der Auswahl)
          const ring = _wrSel?.planet?.ring ?? _wrSel?.q?.ring ?? 0;
          if (!ring) return '';
          const sel  = wrSyncFleetSel(m);
          const fuel = wrTripFuel(sel, ring);
          // 🟣🌀 27aa: Exoten gehören in DIESELBE Zeile wie der Kristall — sie sind
          // derselbe Posten. Eine zweite Treibstoff-Zeile wäre der fünfte Fall von
          // „zwei Dinge, ein Name".
          const exo  = wrTripExoFuel(sel, ring);
          const teile = [];
          if (fuel > 0)    teile.push({ n: fuel,    ic: wrIc('kri'), have: wrKristall(m) });
          if (exo.pla > 0) teile.push({ n: exo.pla, ic: wrIc('pla'), have: wrPlasmoid(m) });
          if (exo.qua > 0) teile.push({ n: exo.qua, ic: wrIc('qua'), have: wrQuantum(m) });
          if (!teile.length) return `<span>${wrIc('kri')} Treibstoff: <strong>frei</strong></span>`;
          const knapp = teile.filter(t => t.have < t.n);
          return `<span class="${knapp.length ? 'wr-bad' : ''}">Treibstoff: <strong>`
               + teile.map(t => `${wrFmt(t.n)} ${t.ic}`).join(' · ') + '</strong>'
               + (knapp.length
                   ? ` <span class="wr-sub">(nur ${knapp.map(t => `${wrFmt(t.have)} ${t.ic}`).join(' · ')} auf Lager!)</span>`
                   : '') + '</span>';
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
      ${wrInjectHtml(m)}
    </div>`;
}

// ⚗️ Plasmoid-Injektion (26s). Steht bewusst IM Flotten-Picker: sie wirkt auf den
// nächsten Anflug, und genau hier entscheidet man über den Angriff. Nur sichtbar, wenn
// das Ziel noch Wächter hat — auf einem Ernte- oder Kolonieflug wäre sie nur Ballast.
// Es gibt kein What's-New-Popup (JP), also erklärt diese Box die Regel vollständig.
function wrInjectHtml(m) {
  const pt = _wrSel?.planet;
  const geladen = wrInject(m);
  if ((!pt || pt.cleared_by) && geladen <= 0) return '';
  const have = wrPlasmoid(m);
  const rest = WR_INJECT_MAX - geladen;
  const pct  = Math.round(geladen * WR_INJECT_PCT * 10) / 10;
  const paket = [10, 25, 50].filter(n => n <= Math.min(have, rest));
  const alles = Math.min(have, rest);
  return `
    <div class="wr-inject${geladen > 0 ? ' wr-inject-on' : ''}">
      <div class="wr-fs-head">⚗️ Plasmoid-Injektion
        <span class="wr-sub">— ${wrIc('pla')} als Munition: 1 Stück = +${String(WR_INJECT_PCT).replace('.', ',')} % Kampfkraft</span></div>
      <div class="wr-fs-sum">
        <span>Geladen: <strong>${wrFmt(geladen)}</strong> / ${WR_INJECT_MAX} ${wrIc('pla')}</span>
        <span>Bonus: <strong class="${geladen > 0 ? 'wr-good' : ''}">+${pct} %</strong></span>
        <span class="wr-sub">Lager: ${wrFmt(have)} ${wrIc('pla')}</span>
      </div>
      <div class="wr-fs-quick">
        ${paket.map(n => `<button class="wr-fs-q" data-wr-inject="${n}">+${n}</button>`).join('')}
        ${alles > 0 ? `<button class="wr-fs-q" data-wr-inject="${alles}">Max (+${alles})</button>` : ''}
      </div>
      <div class="wr-sub">Wird beim nächsten Gefecht gegen Wächter verbraucht — Sieg oder Niederlage.
        Ein Abbau- oder Transportflug verbrennt nichts, die Ladung bleibt liegen.
        <br>⚠️ <strong>Die Ladung fliegt mit DIESEM Angriff mit</strong> und ist danach hier wieder
        leer — sie gilt nicht mehr für alle Flotten zugleich. Kommt der Verband zurück, ohne
        gekämpft zu haben, ist sie wieder da.</div>
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

// 🏛️ 26u: Verband für eine Kolonie-Mission automatisch zusammenstellen (JP 2026-08-17:
// „ich fänds cooler, wenn direkt alle Schiffe ausgewählt werden, wenn man kolonisieren
// klickt"). Genau die geforderte Menge, nicht mehr — die Schiffe gehen bei der Gründung
// im Rumpf auf (26y), ein zu grosser Verband wäre also verschenkt.
// ⚠️ Gedeckelt auf den Hafenbestand: fehlt etwas, wird so viel gesetzt wie da ist, und
// die Anforderungsliste zeigt weiterhin rot, was fehlt. Stillschweigend weniger zu
// nehmen wäre schlimmer als gar nichts zu tun.
// Rückgabe: true, wenn der Verband damit vollständig ist.
// 🛸 27e: Fliegt bereits eine Kolonie-Mission zu diesem Planeten? Spiegel von
// `_space_colonize_inbound`. ⚠️ CLAN-WEIT — die Reisen ALLER Mitglieder stehen in
// `appData.users[].space`, nicht nur die eigenen. Nur die eigenen zu prüfen wäre der
// teuerste Fall: zwei Spieler zahlen voll, einer bekommt nichts.
function wrColonizeInbound(planetId) {
  try {
    const users = (typeof appData !== 'undefined' && appData?.users) || [];
    for (const u of users) {
      const trips = u?.space?.fleets?.away?.trips;
      if (!Array.isArray(trips)) continue;
      for (const t of trips) {
        if (!t || t.intent !== 'colonize' || t.planetId !== planetId) continue;
        const an = Date.parse(t.arriveAt);
        // Abgelaufene Reisen blockieren nicht — sie warten nur auf den Claim.
        if (!isFinite(an) || an <= Date.now()) continue;
        return { id: u.id, name: u.name || 'Jemand', arriveAt: t.arriveAt,
                 self: u.id === _wrMember?.id };
      }
    }
  } catch (e) {}
  return null;
}

// Stellt den Begleitverband einer Kolonie-Mission zusammen.
// ⚠️ Der Rückgabewert meldet, ob die SCHIFFE vollständig sind — nicht, ob die Mission
// startklar ist (JP 2026-08-22: „das wurde schon mal gemacht das ist jetzt wieder
// deaktiviert"). Vorher lieferte er `wrColonyKitMissing(...).length === 0`, und darin
// stecken auch CC/Erz/Plasmoid. Wem nur ein Rohstoff fehlte, der bekam „unvollständig"
// zu sehen, obwohl das Zusammenstellen tadellos funktioniert hatte — die Automatik sah
// dadurch abgeschaltet aus, während sie in Wahrheit lief.
// ⚠️ ZWEI FRAGEN, ZWEI ANTWORTEN: „Habe ich die Schiffe?" beantwortet der Hafen,
// „Kann ich es bezahlen?" das Lager. Ein Rückgabewert für beides beantwortet keine.
function wrColonyFleetFill(m, ring) {
  const k = WR_COLONY_KIT[Math.max(1, Math.min(3, ring || 1))];
  if (!k) return false;
  const ships = wrHomeShips(m);
  const f = {};
  for (const sh of SPACE_SHIPS) f[sh.key] = 0;
  const nimm = (key, n) => { f[key] = Math.min(n, parseInt(ships[key], 10) || 0); };
  nimm('kolonie', 1);
  for (const key of WR_KIT_SHIPS) if (k[key] > 0) nimm(key, k[key]);
  _wrSelFleet = f;
  return !wrColonyKitMissing(m, ring, f).some(x => x.schiff);
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
        ${/* 🧊 JP 2026-08-20: ohne diese Zeile sieht ein leerer Hafen aus wie eine
              vernichtete Flotte. Der Weg zur Handlung steht im 🛩️-Tab (wrMothballHtml). */
          wrMothCount(m) > 0
            ? `<span class="wr-bad">🧊 Eingemottet: <strong>${wrFmt(wrMothCount(m))}</strong>
                 <span class="wr-sub">— im ${wrIc('fleet')} Flotten-Tab auslösen</span></span>`
            : ''}
        <span>${wrIc("atk")} Kampfkraft: <strong>${wrFmt(wrFleetPower(ships))}</strong></span>
        <span>${wrIc("def")} Geschütze: <strong>${wrFmt(wrTurretPower(m))}</strong></span>
        ${/* ⚡ 26p (Regel 1): Die Geschütz-Zahl links ist gedrosselt. Sie hier ohne die
              Ursache zu zeigen wäre eine Statistik-Lücke — dieselbe Klasse Fehler wie die
              perCup-Anzeigelücke in der Welt-Statistik. Nur bei Unterversorgung, damit die
              Zeile nicht dauerhaft Platz kostet. */''}
        ${wrPowerFactor(m) < 1
          ? `<span class="wr-bad">⚡ Energie: <strong>${Math.round(wrPowerFactor(m) * 100)} %</strong></span>`
          : ''}
      </div>
      ${rows
        ? `<div class="wr-fl-list">${rows}</div>`
        : '<div class="wr-warn">Noch kein Schiff gebaut — schau in der Werft weiter unten.</div>'}
      ${nTrips
        ? `<div class="wr-ok">${wrShipArt('jaeger', 'wr-mini')} ${nTrips === 1 ? 'Ein Verband ist' : nTrips + ' Verbände sind'} unterwegs (max. ${WR_MAX_TRIPS} gleichzeitig) — Details bei den Verbänden.</div>`
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
          running: `<span class="wr-tech-run">⏳ läuft — noch ${wrTechJobRestTxt(m)}</span>`,
          blocked: '<span class="wr-tech-lock">🔬 Labor belegt</span>',
          soon:   '<span class="wr-tech-soon">in Vorbereitung</span>',
          locked: `<span class="wr-tech-lock">🔒 braucht ${_wrEsc((SPACE_TECH_BY_KEY[t.requires] || {}).name || '')}</span>`,
          poor:   '<span class="wr-tech-poor">Mittel reichen nicht</span>',
          buy:    `<button class="wr-btn wr-btn-sm" data-wr-tech="${t.key}">Erforschen</button>`,
        }[st] || '';
        // 📐 Aufbau (JP 2026-07-30: „Die Forschung ist sehr gequetscht … schreibe ihn doch
        // darüber oder darunter und den Beschreibungstext auf die komplette Breite,
        // darunter die Kosten, dann Abstand und diese Texte"):
        //   Zeile 1: Bild + Name
        //   Zeile 2: Wirkung  — über die GANZE Breite
        //   Zeile 3: Kosten
        //   Zeile 4: Zustand/Knopf, mit Abstand darüber
        // Vorher stand der Zustand als dritte Flex-Spalte RECHTS und nahm der Beschreibung
        // in einer ~230-px-Spalte den halben Platz weg.
        return `<div class="wr-tech-node wr-tech-${st}">
            <span class="wr-fl-art wr-ship-zoom" data-wr-techinfo="${t.key}" title="Groß ansehen"><img src="assets/weltraum/${t.art}.png" alt=""
              onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
              ><span class="wr-fl-fb">${a.icon}</span><span class="wr-zoom-hint">🔍</span></span>
            <strong class="wr-tech-name">${_wrEsc(t.name)}</strong>
            <span class="wr-tech-desc wr-sub">${wrIcText(t.wirkung)}</span>
            ${/* ⏱️ 27q: die Dauer gehört NEBEN die Kosten — sie ist der zweite Preis.
                  Ohne sie liess sich nicht planen (JP), obwohl das Labor immer nur EIN
                  Projekt gleichzeitig annimmt: wer die Laufzeit nicht kennt, weiss auch
                  nicht, wie lange er damit alles andere blockiert. */''}
            <span class="wr-tech-cost wr-sub">${wrFmt(t.cc)} CC${t.erz ? ` · ${wrFmt(t.erz)} ${wrIc('erz')}` : ''}${
              t.kristall ? ` · ${wrFmt(t.kristall)} ${wrIc('kri')}` : ''}${
              t.plasmoid ? ` · ${wrFmt(t.plasmoid)} ${wrIc('pla')}` : ''}${
              t.quantum ? ` · ${wrFmt(t.quantum)} ${wrIc('qua')}` : ''}
              <span class="wr-tech-dauer">${wrIc('time')} ${wrDur(wrTechMinFor(t))}</span></span>
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
        <span class="wr-sub">verstärkt, was du schon hast · ein Projekt gleichzeitig,
          Dauer nach Stufe (2 h → 5 Tage)</span></div>
      ${/* ⏳ 26u: das laufende Projekt ganz oben. Ohne diese Zeile musste man den
            richtigen Ast suchen, um überhaupt zu sehen, DASS etwas läuft — und die
            Fehlermeldung „es läuft bereits eine Forschung" blieb unerklärlich. */''}
      ${(() => {
        const job = wrTechJob(m);
        if (!job) return '';
        const t = SPACE_TECH_BY_KEY[job.key];
        const fertig = wrTechJobLeftMs(m) <= 0;
        return `<div class="wr-techjob${fertig ? ' wr-techjob-done' : ''}">
          <span>⏳ <strong>${_wrEsc(t?.name || job.key)}</strong> wird erforscht</span>
          <span class="wr-sub">${fertig
            ? 'fertig — wird beim nächsten Öffnen übernommen'
            : `noch ${wrTechJobRestTxt(m)} · solange ist das Labor belegt`}</span>
        </div>`;
      })()}
      ${(sp || bt) ? `<div class="wr-facts">
        ${sp ? `<span>${wrIc('time')} Flugzeit: <strong>−${sp} %</strong></span>` : ''}
        ${bt ? `<span>${wrIc('time')} Bauzeit: <strong>−${bt} %</strong></span>` : ''}
      </div>` : '<div class="wr-sub">Noch keine Technik erforscht.</div>'}
      <div class="wr-tech-grid">${spalten}</div>
    </div>`;
}

// ⚗️ Transmuter (wt_f9): Ring-Rohstoffe → CC. Erscheint im Forschungs-Tab, sobald erforscht.
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel der Kurse in space_transmute (26s).
// 26s (JP 2026-07-30): 60/150 → 120/260. Der Transmuter lag bei einem Drittel der
// Raffinerie und war damit ein toter Knopf hinter einer 40.000-CC-Technik. Neue Regel:
// knapp UNTER dem schlechtesten Raffinerie-Kurs derselben Sorte (🟣 140 auf Stufe 2,
// 🌀 280 auf Stufe 4) — sofort und unbegrenzt, aber immer der schlechtere Preis.
// ── ⚗️ Transmuter (Kurse 26s, Losgrösse + Pause 27b) ────────────────────────
// ⚠️ Spiegel von `_space_transmute_def` in migration_2026-08-17_27b_transmuter.sql.
// JP 2026-08-17: „> 1.300.000 CC instant … das ist ziemlich OP!" — der Kurs war nie das
// Problem, die fehlende Mengengrenze war es. Ein Preisnachteil von 43 % gegenüber der
// Raffinerie wiegt keine 34 Stunden Wartezeit auf.
const WR_TRANSMUTE       = { plasmoid: 120, quantum: 260 };
const WR_TRANSMUTE_MAX   = 500;   // Einheiten je Vorgang
// ⚠️ 27w: 48 → 24 h (JP). Geprüft gegen den KONKURRIERENDEN Weg, nicht gegen sich selbst:
// die Raffinerie schafft auf Stufe 6 rund 1.280 🟣 + 640 🌀 am Tag zu besseren Kursen
// (210/400 gegen 120/260). Der Transmuter bleibt also auch verdoppelt der zweitbeste Weg
// und damit das, was 27b aus ihm machen wollte — ein Notausgang, kein Hauptweg.
const WR_TRANSMUTE_PAUSE = 24;    // Stunden Pause danach — gilt fürs GANZE Gerät

// Wann ist der Transmuter wieder frei? 0 = jetzt. Spiegel von `_space_transmute_ready`.
// ⚠️ Ein unlesbarer Zeitstempel gilt als „frei" — eine kaputte Uhr darf das Gerät nicht
// dauerhaft sperren (dieselbe Kulanzrichtung wie bei wrSlotLevel/readyAt).
function wrTransmuteLeftMs(m) {
  const t = wrSpace(m).transmute;
  if (!t || typeof t !== 'object' || !t.at) return 0;
  const at = Date.parse(t.at);
  if (!isFinite(at)) return 0;
  return Math.max(0, at + WR_TRANSMUTE_PAUSE * 3600000 - Date.now());
}

function wrTransmuterHtml(m) {
  if (!wrHasTech(m, 'wt_f9')) return '';
  const pla = wrPlasmoid(m), qua = wrQuantum(m);
  const restMs = wrTransmuteLeftMs(m);
  const gesperrt = restMs > 0;
  const std = Math.floor(restMs / 3600000), min = Math.round((restMs % 3600000) / 60000);
  const restTxt = std >= 1 ? `${std} h ${min} min` : `${min} min`;

  // ⚠️ Der Knopf zeigt, was WIRKLICH passiert (höchstens 500), nicht den ganzen Bestand.
  // Vorher versprach er den Gesamtwert des Lagers — der Server hätte ihn geklemmt, und
  // der Spieler hätte den Unterschied erst am Kontostand gemerkt.
  const zeile = (typ, menge, icon, name) => {
    const los = Math.min(menge, WR_TRANSMUTE_MAX);
    return `<div class="wr-refine-row">
      <span>${icon} ${name}: <strong>${wrFmt(menge)}</strong>${
        menge > WR_TRANSMUTE_MAX ? ` <span class="wr-sub">(${WR_TRANSMUTE_MAX} je Vorgang)</span>` : ''}</span>
      ${gesperrt
        ? `<span class="wr-sub">⏳ ${restTxt}</span>`
        : `<button class="wr-btn wr-btn-sm" data-wr-transmute="${typ}" ${los < 1 ? 'disabled' : ''}>→ ${wrFmt(los * WR_TRANSMUTE[typ])} CC</button>`}
    </div>`;
  };

  return `<div class="wr-card">
    <div class="wr-card-title">⚗️ Transmuter <span class="wr-sub">— Ring-Rohstoffe zu CC</span></div>
    ${zeile('plasmoid', pla, wrIc('pla'), 'Plasmoiden-Staub')}
    ${zeile('quantum',  qua, wrIc('qua'), 'Quantenschaum')}
    <p class="wr-sub" style="margin:4px 0 0">Kurs: ${wrIc('pla')} ${WR_TRANSMUTE.plasmoid} CC ·
      ${wrIc('qua')} ${WR_TRANSMUTE.quantum} CC je Einheit — sofort, aber höchstens
      <strong>${WR_TRANSMUTE_MAX} Einheiten</strong>, danach <strong>${WR_TRANSMUTE_PAUSE} h Pause</strong>
      für beide Sorten. ${gesperrt ? `Wieder frei in ${restTxt}.` : ''}
      Die 🏭 Raffinerie zahlt mehr (${WR_REFINE[2].ratePla}–${WR_REFINE[6].ratePla} bzw.
      ${WR_REFINE[4].rateQua}–${WR_REFINE[6].rateQua}) und hat den besseren Durchsatz —
      der Transmuter ist der Notausgang, nicht der Hauptweg.</p>
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

// ⛽ 26s: Reaktor betanken (Hafen: planetId null). Rein server-autoritativ — die RPC
// klemmt selbst auf Vorrat und freien Tankraum und liefert den neuen Stand zurück.
// Bewusst KEIN Chat-Post: Nachtanken ist Routine und würde das Protokoll fluten.
async function wrRefuel(planetId, amount) {
  if (_wrBusy || !(amount > 0)) return;
  _wrBusy = true;
  try {
    const res = await DB.spacePowerRefuel(_wrMember.id, planetId, amount);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    const ic = res.res === 'quantum' ? '🌀' : '🟣';
    wrToast(`⛽ ${wrFmt(res.added)} ${ic} getankt — Tank ${wrFmt(Math.round(res.fuel))} `
          + `(${Math.floor((res.fuel || 0) / Math.max(1, res.perDay || 1))} Tage)`, 'success');
    // Der Kolonie-Tank lebt in space_planets, nicht im Mitglied — Galaxie neu laden,
    // sonst zeigt das Akkordeon den alten Stand (Zwei-Quellen-Falle aus Teil 22).
    if (planetId) await wrEnsureGalaxy(true);
    wrRender();
  } catch (e) {
    wrToast('Betanken fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ⚗️ 26s: Plasmoid-Injektion laden. Wirkt auf den NÄCHSTEN Anflug mit Gefecht und wird
// dort verbraucht (claim_space_arrival). Der Vorrat liegt in space.inject.
async function wrInjectLoad(amount) {
  if (_wrBusy || !(amount > 0)) return;
  _wrBusy = true;
  try {
    const res = await DB.spaceInjectLoad(_wrMember.id, amount);
    if (!res || res.error) { wrToast(wrErrText(res?.error), 'error'); return; }
    if (res.space) wrApplySpace(res.space);
    wrToast(`⚗️ ${wrFmt(res.added)} 🟣 injiziert — Kampfkraft +${res.pct} % im nächsten Gefecht`, 'success');
    wrRender();
  } catch (e) {
    wrToast('Injektion fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ⚡ NOTFALL-BOOST (27ac): Ankunft einer laufenden Reise um 30 Minuten vorziehen.
// ⚠️ Der SERVER verschiebt die Zeitstempel, nie der Client — sonst hätte jeder Browser
// seine eigene Ankunftszeit, und `claim_space_arrival` entschiede etwas anderes als die
// Anzeige. Der Client schickt nur die Reise-ID und übernimmt, was zurückkommt.
async function wrTripBoost(tripId) {
  if (_wrBusy || !tripId) return;
  _wrBusy = true;
  try {
    const res = await DB.spaceTripBoost(_wrMember.id, tripId);
    if (!res || res.error) {
      if (res?.error === 'boost_no_kristall') {
        // ⚠️ Fehler-Toast OHNE HTML-Freigabe → hier bleibt es beim Emoji. Die Regel
        // steht an WR_IC: Bilder nur dort, wo `showToast(..., true)` gerufen wird.
        wrToast(`Nicht genug 💎 Kristall: der Boost kostet ${wrFmt(res.need)}, `
              + `du hast ${wrFmt(res.have)}.`, 'error');
      } else if (res?.error === 'boost_too_close') {
        wrToast(`Zu kurz vor der Ankunft — es bleiben nur noch ${wrFmt(res.minutesLeft)} Minuten. `
              + `Nach einem Boost müssen 5 übrig bleiben.`, 'error');
      } else {
        wrToast(wrErrText(res?.error), 'error');
      }
      return;
    }
    if (res.space) wrApplySpace(res.space);
    wrToast(`⚡ Ankunft um ${WR_BOOST_MINUTES} Minuten vorgezogen — noch `
          + `${wrCountdown((parseFloat(res.minutesLeft) || 0) * 60000)}. `
          + `−${wrFmt(res.cost)} ${wrIc('kri')}`, 'success', true);

    // 📒 Regel 1: eine neue Kristall-Ausgabe gehört ab dem ersten Tag ins Log.
    // ⚠️ Das Tages-Log beziffert CC — der Kristall steht deshalb in der Detailzeile und
    // der Betrag auf 0. Eine erfundene CC-Zahl wäre schlimmer als keine: sie ginge in
    // die Tagesbilanz ein und wäre dort nicht mehr als Kristall erkennbar.
    try {
      await DB.appendTodayLogFresh(_wrMember.id, [{
        label: '⚡ Flug-Beschleunigung', amount: 0, cat: 'weltraum',
        detail: `−${wrFmt(res.cost)} 💎 Kristall für ${WR_BOOST_MINUTES} Minuten`,
        aggKey: 'space_boost', aggBase: '⚡ Flug-Beschleunigung' }]);
    } catch (e) { console.warn('Boost nicht geloggt:', e); }
    wrRender();
  } catch (e) {
    wrToast('Beschleunigen fehlgeschlagen: ' + e.message, 'error');
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
    // ⏱️ JP 2026-08-20: Forschungszeit gehört in die Meldung.
    // ⚠️ Und dabei fiel auf: seit 26u ist Forschung KEIN Sofortvorgang mehr — buy_space_tech
    // liefert `queued: true` mit `minutes`/`doneAt`. Toast und Chat sagten trotzdem „hat
    // erforscht", also den Abschluss, den claim_space_tech erst Stunden später meldet.
    // Genau das Muster aus Teil 31: wer einen Vorgang von SOFORT auf DAUERT umstellt, macht
    // jede Meldung unvollständig, die vorher richtig war — und zwar stillschweigend.
    const min  = parseFloat(res.minutes) || 0;
    const dauer = min > 0 ? wrDur(min) : '';
    wrToast(min > 0
      ? `🔬 ${t.name} in Arbeit — fertig in ${dauer}`
      : `🔬 ${t.name} erforscht — ${t.wirkung}`, 'success');
    // JP 2026-07-22: Kosten gehören mit in die Meldung (wie beim Werft-Bau)
    const kost = [`${wrFmt(t.cc)} CC`];
    if (t.erz > 0)      kost.push(`${wrFmt(t.erz)} ${wrArtTok('erz')}`);
    if (t.kristall > 0) kost.push(`${wrFmt(t.kristall)} ${wrArtTok('kristall')}`);
    // KEIN **Markdown** — der Chat rendert das nicht (JP sah die rohen Sterne).
    // Das Technik-Icon kommt als [[s:art]]-Token (Präfix-Erkennung in _chatArt).
    wrChat(min > 0
      ? `🔬 ${_wrEsc(_wrMember.name)} erforscht ${wrArtTok(t.art)} ${_wrEsc(t.name)} `
        + `(${_wrEsc(t.wirkung)}) — ${kost.join(' · ')}, fertig in ${dauer}.`
      : `🔬 ${_wrEsc(_wrMember.name)} hat ${wrArtTok(t.art)} ${_wrEsc(t.name)} erforscht `
        + `(${_wrEsc(t.wirkung)}) — ${kost.join(' · ')}.`);
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
// ⚠️ 26s (JP 2026-07-30, „> 598 Plasmoid — was mache ich damit?"): 🟣 ab Stufe 2 statt 3
// und deutlich grössere Chargen (20/35/50/80 → 40/70/110/180), 🌀 ebenso (12/25/40 →
// 25/45/70). Die KURSE sind bewusst unverändert — 🟣 soll abfliessen können, nicht mehr
// wert werden. Alle Erz-/Kristall-Werte und die Stundenzahlen sind unangetastet.
const WR_REFINE = [
  null,
  { capErz: 40,  capKri: 15,  hours: 6,   rErz: 32, rKri: 80,  capPla: 0,   capQua: 0,  ratePla: 0,   rateQua: 0   },
  { capErz: 80,  capKri: 30,  hours: 5,   rErz: 34, rKri: 84,  capPla: 15,  capQua: 0,  ratePla: 140, rateQua: 0   },
  { capErz: 140, capKri: 55,  hours: 4,   rErz: 36, rKri: 88,  capPla: 40,  capQua: 0,  ratePla: 150, rateQua: 0   },
  { capErz: 240, capKri: 100, hours: 3,   rErz: 38, rKri: 92,  capPla: 70,  capQua: 25, ratePla: 170, rateQua: 280 },
  { capErz: 400, capKri: 160, hours: 2,   rErz: 42, rKri: 100, capPla: 110, capQua: 45, ratePla: 190, rateQua: 340 },
  // Stufe 6: wt_e13 Plasma-Raffinerie
  { capErz: 600, capKri: 260, hours: 1.5, rErz: 46, rKri: 110, capPla: 180, capQua: 70, ratePla: 210, rateQua: 400 },
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
    ['💰 Kurs', tier < 1 ? '—' : `${def.rErz} CC/${wrIc('erz')} · ${def.rKri} CC/${wrIc('kri')}`],
    ['📦 Charge max', tier < 1 ? '—' : `${wrFmt(def.capErz)} ${wrIc('erz')} / ${wrFmt(def.capKri)} ${wrIc('kri')}`],
    // 26o: die Ring-Rohstoffe als eigene Zeile — sonst fällt gar nicht auf, dass eine
    // höhere Stufe sie freischaltet.
    [`${wrIc('pla')}${wrIc('qua')} Ring-Rohstoffe`, tier < 1 ? '—'
      : [def.ratePla ? `${def.ratePla} CC/${wrIc('pla')} (max ${wrFmt(def.capPla)})` : `${wrIc('pla')} ab Stufe 3`,
         def.rateQua ? `${def.rateQua} CC/${wrIc('qua')} (max ${wrFmt(def.capQua)})` : `${wrIc('qua')} ab Stufe 4`].join(' · ')],
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
    const inhalt = [`${wrFmt(r.erz)} ${wrIc('erz')}`, `${wrFmt(r.kristall)} ${wrIc('kri')}`]
      .concat((r.plasmoid || 0) > 0 ? [`${wrFmt(r.plasmoid)} ${wrIc('pla')}`] : [])
      .concat((r.quantum  || 0) > 0 ? [`${wrFmt(r.quantum)} ${wrIc('qua')}`]  : []).join(' · ');
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
        <span>${wrIc('erz')} Erz <strong>${wrFmt(_wrRefErz)}</strong> <span class="wr-sub">/ ${wrFmt(maxE)}</span></span>
        <span class="wr-refine-adj">
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:-10" ${_wrRefErz <= 0 ? 'disabled' : ''}>−10</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:10" ${_wrRefErz >= maxE ? 'disabled' : ''}>+10</button>
          <button class="wr-btn wr-btn-sm" data-wr-refadj="erz:max" ${_wrRefErz >= maxE ? 'disabled' : ''}>Max</button>
        </span>
      </div>
      <div class="wr-refine-row">
        <span>${wrIc('kri')} Kristall <strong>${wrFmt(_wrRefKri)}</strong> <span class="wr-sub">/ ${wrFmt(maxK)}</span></span>
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
        if (def.capPla <= 0) gesperrt.push(wrIc('pla') + ' ab Stufe 3');
        if (def.capQua <= 0) gesperrt.push(wrIc('qua') + ' ab Stufe 4');
        const zeile = (ic, name, val, max, key, step) => `
          <div class="wr-refine-row">
            <span>${ic} ${name} <strong>${wrFmt(val)}</strong> <span class="wr-sub">/ ${wrFmt(max)}</span></span>
            <span class="wr-refine-adj">
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:-${step}" ${val <= 0 ? 'disabled' : ''}>−${step}</button>
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:${step}" ${val >= max ? 'disabled' : ''}>+${step}</button>
              <button class="wr-btn wr-btn-sm" data-wr-refadj="${key}:max" ${val >= max ? 'disabled' : ''}>Max</button>
            </span>
          </div>`;
        return (def.capPla > 0 ? zeile(wrIc('pla'), 'Plasmoid', _wrRefPla, maxP, 'pla', 5) : '')
             + (def.capQua > 0 ? zeile(wrIc('qua'), 'Quantenschaum', _wrRefQua, maxQ, 'qua', 2) : '')
             + (gesperrt.length ? `<p class="wr-sub" style="margin:2px 0 0">🔒 Ring-Rohstoffe verwerten: ${gesperrt.join(' · ')} (Ast 🏭 weiter ausbauen)</p>` : '');
      })()}
      <div class="wr-refine-sum">
        <span>Ertrag: <strong>${wrFmt(cc)} CC</strong> in ${def.hours} h</span>
        <button class="wr-btn wr-btn-go" id="wr-refine-start" ${canStart ? '' : 'disabled'}>Verarbeiten starten</button>
      </div>
      <p class="wr-sub" style="margin:4px 0 0">Stufe ${tier} · Kurs ${def.rErz} CC/${wrIc('erz')} · ${def.rKri} CC/${wrIc('kri')}${
        def.ratePla ? ` · ${def.ratePla} CC/${wrIc('pla')}` : ''}${def.rateQua ? ` · ${def.rateQua} CC/${wrIc('qua')}` : ''
        } · max ${wrFmt(def.capErz)} ${wrIc('erz')} / ${wrFmt(def.capKri)} ${wrIc('kri')}${
        def.capPla ? ` / ${wrFmt(def.capPla)} ${wrIc('pla')}` : ''}${def.capQua ? ` / ${wrFmt(def.capQua)} ${wrIc('qua')}` : ''} je Charge</p>`;
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
    const min = wrTripMin(q.ring, q.key, m);   // 🗺️ 26z: −20 % in der eigenen Region
    // 🛩️ 26m: das Ring-Gate gilt für JEDEN Start, auch für die Aufklärung — wer der
    // Sonde Jäger als Geleit mitgibt, läuft sonst hier in den Serverfehler.
    const gate = wrCarrierGap(sel, q.ring);
    // 📡 Nahbereichs-Ortung (wt_e6, neu gestaltet 2026-07-30). Vorher stand hier die
    // pauschale Behauptung „Hinter dem Nebel liegen 8 Planeten" — die stimmte nicht
    // einmal zuverlässig. Mit der Technik stehen jetzt die echten Summen da.
    const sensed = wrSensed(q);
    const intel  = sensed ? wrSensorIntel(q) : null;
    return `
      <div class="wr-detail">
        <div class="wr-card-title">${sensed ? '📡 Georteter' : '🌫️ Unerforschter'} Quadrant
          <span class="wr-sub">${_wrEsc(q.key)} · Ring ${q.ring}</span></div>
        ${intel
          ? `<p class="wr-p">Die 📡 Deep-Space-Sensorik hat den Quadranten angepeilt: <strong>${intel.planets} Planeten</strong>${intel.cleared ? `, davon ${intel.cleared} bereits befreit` : ''}.
               Welche das sind, zeigt erst die Sonde — schick eine 🛰️ Bohnen-Sonde, um ihn
               für den <strong>gesamten Klan</strong> aufzudecken.</p>
             <div class="wr-facts">
               <span>📡 Wächter gesamt: <strong>${wrFmt(intel.strength)}</strong></span>
               ${intel.ring  > 0 ? `<span>Ring-Rohstoffe: <strong>${intel.ring}×</strong> ${wrIc('pla')}/${wrIc('qua')}</span>` : ''}
               ${intel.wreck > 0 ? `<span>${wrIc('salvage')} Wrackfelder: <strong>${intel.wreck}</strong></span>` : ''}
             </div>`
          : `<p class="wr-p">Hinter dem Nebel liegen unbekannte Planeten. Schick eine 🛰️ Bohnen-Sonde, um den Quadranten
               für den <strong>gesamten Klan</strong> aufzudecken. Gib ihr Geleitschutz mit — draußen ist
               nicht jeder Nebel leer.${wrHasTech(m, 'wt_e6') ? '' : `<br><span class="wr-sub">📡 Die Forschung „${_wrEsc(wrTechName('wt_e6'))}" ortet angrenzende Quadranten vorab — dann fliegt die Sonde nicht mehr blind.</span>`}</p>`}
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
  const resIcon = wrResIc(p.resource_type);
  const resName = resMeta.name;
  const resGated = !wrResMinable(m, p.resource_type);   // Ring-Rohstoff ohne Abbau-Tech
  const min     = wrTripMin(p.ring, p.quadrant, m);   // 🗺️ 26z
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
                // ⚠️ 27l: Die Abgetragen-Meldung nur, wenn es hier WIRKLICH ein Feld gab.
                // Vorher stand sie auf jedem befreiten Planeten — auch auf denen ohne Feld.
                : wrHadWreck(p)
                  ? `${wrIc("wreck")} Das Wrackfeld ist vollständig abgetragen.`
                  : '✅ Befreit — hier liegt nichts mehr.')
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
        ${cleared && !colon ? (() => {
          // 🏛️ 26u: Die Mission verlangt einen kompletten Verband. Ohne diese Vorschau
          // sah man nur „colony_kit_incomplete", nachdem man auf Start gedrückt hatte.
          // 🛸 27e: Fliegt schon jemand hin? Dann gibt es hier nichts mehr zu tun —
          // ein zweiter Verband käme an, fände die Kolonie vor und kehrte um. Bezahlt
          // wäre er längst (alles wird beim START abgebucht).
          const inb = wrColonizeInbound(p.id);
          if (inb) {
            return `<div class="wr-warn">🛸 ${inb.self ? 'Deine' : `${_wrEsc(inb.name)}s`}
              Kolonie-Mission ist unterwegs — Ankunft in
              ${wrCountdown(Date.parse(inb.arriveAt) - Date.now())}.
              ${inb.self ? 'Ein zweiter Verband würde nur umkehren.'
                         : 'Warte ab oder such dir ein anderes Ziel.'}</div>`;
          }
          const kitFehlt = wrColonyKitMissing(m, p.ring, sel);
          // Was fehlt, weil es im HAFEN nicht da ist? Nur das ist ein echtes Hindernis —
          // eine unvollständige AUSWAHL füllt der Knopf selbst auf (JP-Wunsch).
          const probe = {}; for (const sh of SPACE_SHIPS) probe[sh.key] = parseInt(wrHomeShips(m)[sh.key], 10) || 0;
          const echtFehlt = wrColonyKitMissing(m, p.ring, probe);
          const nurAuswahl = kitFehlt.length > 0 && echtFehlt.length === 0;
          return `<button class="wr-btn${nurAuswahl ? '' : ' wr-btn-go'}" data-wr-send="colonize"
              ${(busy || gate.blocked || echtFehlt.length) ? 'disabled' : ''}>
            🛸 ${nurAuswahl ? 'Verband zusammenstellen' : 'Kolonisieren'}
            <span class="wr-btn-sub">${echtFehlt.length
              ? `es fehlt: ${echtFehlt.map(x => wrKitLabel(x.was)).join(' · ')}`
              : nurAuswahl
                ? 'setzt genau die nötigen Schiffe — danach nochmal drücken'
                : `Verband geht im Rumpf auf · dauerhaft ~${wrFmt(Math.round(p.richness * 3 * resMeta.mine))} ${resIcon}/Tag`}</span></button>`;
        })() : ''}
      </div>
      ${cleared && !colon ? wrColonyKitHtml(m, p.ring, sel) : ''}
      ${cleared ? wrPlanetDefHtml(m, p) : ''}
      ${resGated && cleared ? `<div class="wr-warn">🔒 ${resName} lässt sich erst mit der Forschung <strong>${p.resource_type === 'plasmoid' ? 'Plasmoid-Kollektor' : 'Quantenschaum-Extraktor'}</strong> abbauen — bis dahin wirft dieser Planet nichts ab.</div>` : ''}
      ${cleared ? wrRoutePanelHtml(m, p) : ''}
      ${/* ⚠️ Bei laufender Reise NUR diesen Hinweis zeigen. Vorher lief der Verband-Picker
            weiter, klemmte die Auswahl auf den (jetzt leeren) Hafen und meldete deshalb
            „⚔️ 0" plus „Nimm kampffähige Schiffe mit" — direkt nach dem Aussenden, also
            genau dann, wenn alles richtig gemacht wurde. */ ''}
      ${busy
        ? '<div class="wr-warn">Maximal 5 Flotten gleichzeitig unterwegs — warte, bis eine zurückkehrt.</div>'
        : `${nAway > 0 ? `<div class="wr-sub">${wrShipArt('jaeger', 'wr-mini')} ${nAway} unterwegs — diese Flotte fliegt +${wrFleetGap(m) * nAway} min länger.</div>` : ''}
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
  + `Sie verdreifacht die Rückfallfrist für ALLE befreiten Planeten im selben Quadranten `
  + `— auch die deiner Mitspieler — und deckt anfliegende Verbände mit halber Feuerkraft. `
  + `Aus ${WR_FALLBACK_DAYS} Tagen werden ${WR_FALLBACK_DAYS * WR_FALLBACK_STATION_MULT}, `
  + `mit Frühwarn-Netz aus ${WR_FALLBACK_E12} sogar ${WR_FALLBACK_E12 * WR_FALLBACK_STATION_MULT}. `
  + `Sie macht Planeten NICHT unverlierbar — wer gar nicht hinsieht, verliert sie trotzdem.`, [
    ['🔬 Freischaltung', `${_wrEsc(wrTechName('wt_f7'))}<br><span class="wr-sub">${_wrEsc(wrTechRef('wt_f7'))}</span>`],
    ['🛡️ Voraussetzung', 'Planeten-Geschütze Stufe 3'],
    ['💰 Kosten', wrPreisTxt(c)],   // 27p
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
  // 🌀 26p: Quantenschaum ist die fünfte Kostenart — auf der Kolonie ×1,5 (45 für das
  // Quanten-Geschütz). Ohne die Prüfung stünde „Bauen" offen und der Server lehnte mit
  // 'insufficient_quantum' ab.
  const canPay = (c) => c && coins >= c.cc && wrErz(m) >= c.erz
                     && wrKristall(m) >= c.kristall && wrPlasmoid(m) >= (c.plasmoid || 0)
                     && wrQuantum(m) >= (c.quantum || 0);
  const priceTxt = wrPreisTxt;                       // 27p: eine Fassung fuer alle

  let out = '';
  // 27o: freigeschaltet hängt am Quantenschaum-Reaktor, angezeigt wird mindestens das
  // Belegte (Bestandsschutz — siehe wrPlanetSlotsShown).
  // ⚠️ NICHT `frei` nennen: weiter unten in derselben Funktion heisst `frei`, ob ein
  // GESCHÜTZTYP erforscht ist. Zwei Bedeutungen unter einem Namen in einem Rumpf sind
  // genau das Muster, das hier schon zwei Garnisonen und zwei Symboltabellen erzeugt hat.
  const freigeschaltet = wrPlanetSlotsFree(p);
  const zeigen = wrPlanetSlotsShown(p);
  for (let i = 0; i < zeigen; i++) {
    const key = 'g' + i;
    const cur = tur[key];
    // ⚠️ Ein Bauplatz oberhalb der Freischaltung, der LEER ist, wird nicht als „bauen"
    // angeboten — sonst liefe der Spieler in die Server-Sperre. Regel 4: der Grund steht
    // dort, wo er auf die Regel trifft, nicht in einer Fehlermeldung danach.
    if (i >= freigeschaltet && !(cur && typeof cur === 'object')) continue;
    if (cur && typeof cur === 'object' && SPACE_TURRET_BY_KEY[cur.type]) {
      const t   = SPACE_TURRET_BY_KEY[cur.type];
      const clv = Math.max(1, Math.min(WR_TURRET_MAX, parseInt(cur.level, 10) || 1));
      const st  = wrPturretStats(cur.type, clv);
      const up  = clv < WR_TURRET_MAX ? wrPturretStats(cur.type, clv + 1) : null;
      const ziele = SPACE_TURRETS.filter(z => z.atk > t.atk && wrTurretUnlocked(m, z.key));
      // ── 🚨 26v: Wrack aus einem Kolonie-Angriff ──────────────────────────
      // ⚠️ Ganz oder gar nicht (JPs Regel): keine Teilreparatur, kein anteiliges
      // Hochfahren. Bis zur bezahlten Reparatur zählt der Bauplatz mit 0 — deshalb
      // stehen hier weder Ausbau- noch Umrüst-Knöpfe, nur die Reparatur.
      if (cur.wreck) {
        const rep = wrRepairPrice(cur.type, clv);
        out += `
          <div class="wr-pslot wr-pslot-full wr-pslot-wreck">
            <span class="wr-pslot-art">💥<span class="wr-pslot-fb">${t.icon}</span></span>
            <span class="wr-pslot-txt"><strong>⚠️ ${_wrEsc(t.name)} — Wrack</strong>
              <span class="wr-sub">Stufe ${clv} · 🛡️ 0 (feuert nicht)</span></span>
            <span class="wr-pslot-act">
              <button class="wr-btn wr-btn-sm${canPay(rep) ? '' : ' wr-btn-off'}"
                      data-wr-repair="${p.id}:${key}">🛠️ Reparieren
                <span class="wr-btn-sub">${priceTxt(rep)}</span></button>
            </span>
          </div>`;
        continue;
      }
      out += `
        <div class="wr-pslot wr-pslot-full">
          <span class="wr-pslot-art wr-ship-zoom" data-wr-tinfo="${t.key}" title="Groß ansehen">
            ${wrTurretImg(t)}
              <span class="wr-pslot-fb">${t.icon}</span></span>
          <span class="wr-pslot-txt"><strong>${_wrEsc(t.name)}</strong>
            <span class="wr-sub">Stufe ${clv} · 🛡️ ${wrFmt(st.atk)}</span></span>
          <span class="wr-pslot-act">
            ${wrSlotBuilding(cur) ? wrBuildBadgeHtml(cur) : (up
              ? `<button class="wr-btn wr-btn-sm" data-wr-pturret="${p.id}:turret_upgrade:${key}:"
                      ${canPay(up) ? '' : 'disabled'}>Aufrüsten
                      <span class="wr-btn-sub">${priceTxt(up)} → 🛡️ ${wrFmt(up.atk)}</span></button>`
              : '<span class="wr-slot-max">✅ Vollausbau</span>')}
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
  // ⚠️ 27o, Regel 4: die gesperrten Bauplätze werden GEZEIGT, mit dem Grund. Sie
  // wegzulassen wäre der Fehler, den es hier schon zweimal gab — eine Mechanik, die
  // nirgends erklärt ist, existiert für den Spieler nicht (mothballed 26w, merc 26x).
  if (freigeschaltet < WR_PLANET_SLOTS_QUA) {
    const qua = SPACE_POWER_BY_KEY['quanten'];
    const konv = wrGenConverting(wrPlanetPower(p));
    out += `
      <div class="wr-pslot wr-pslot-lock">
        <div class="wr-slot-name">🔒 Bauplätze ${freigeschaltet + 1}–${WR_PLANET_SLOTS_QUA}</div>
        <div class="wr-sub">Diese Kolonie hat ${freigeschaltet} Bauplätze. Die restlichen
          ${WR_PLANET_SLOTS_QUA - freigeschaltet} schaltet ein fertiger
          <strong>${_wrEsc(qua?.name || 'Quantenschaum-Reaktor')}</strong> auf diesem Planeten frei.${
          konv ? ' Die Umrüstung läuft bereits — sobald sie steht, sind es sechs.' : ''}
          <br>Ein voller Ausbau mit ${WR_PLANET_SLOTS_QUA} Quanten-Geschützen auf Stufe 3
          braucht ${wrFmt(Math.round(WR_PLANET_SLOTS_QUA * wrTurretEnergy('quantenlanze', 3)))} Energie —
          das trägt allein dieser Reaktor.</div>
      </div>`;
  }
  return `<div class="wr-pslots">${out}</div>`;
}

// ── 🛡️ Feature ④: Kolonie & Verteidigung im Planeten-Detail (26h) ───────────
// Erscheint NUR auf eigenen Kolonien. Die Kosten hier sind reine Anzeige —
// gerechnet und abgebucht wird in build_planet_defense (server-autoritativ).
// ── ⚡ Kraftwerk-Panel einer Kolonie (26p) ────────────────────────────────────
// Bewusst kompakter als das Hafen-Panel (wrPowerHtml): eine Kolonie hat einen Generator
// und drei Bauplätze, kein Ausbau-Leiter-Drumherum. Die Werte sind dieselben Formeln.
function wrColonyPowerHtml(m, p, canPay, priceTxt) {
  const dem = wrColonyDemand(p), sup = wrColonySupply(p), fac = wrColonyFactor(p);
  const gen = wrPlanetPower(p), def = wrPlanetGenDef(p);
  const pid = p.id;
  let body;
  if (gen && def) {
    const glv = wrPlanetGenLevel(p);
    // ⚡ 27n: siehe wrPowerHtml — Ausgabe vom LAUFENDEN, Baumarke vom BESTELLTEN Reaktor.
    const live = wrGenLive(gen);
    const lDef = live ? SPACE_POWER_BY_KEY[live.type] : null;
    const st   = live ? wrPgenStats(live.type, live.level) : null;
    const up  = glv < WR_POWER_MAX ? wrPgenStats(def.key, glv + 1) : null;
    const zie = SPACE_POWER.filter(g => g.out[1] > def.out[1] && wrPowerUnlocked(m, g.key));
    body = `
      <div class="wr-gen wr-gen-full">
        <div class="wr-gen-art" data-wr-geninfo="${def.key}" title="Groß ansehen">
          <img src="assets/${def.folder}/${def.art}.png" alt=""
            onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-gen-fb">${def.icon}</span><span class="wr-zoom-hint">🔍</span></div>
        <div class="wr-gen-info">
          <div class="wr-gen-name">${_wrEsc((lDef || def).name)}
            <span class="wr-sub">Stufe ${live ? live.level : glv}${
              (live && live.type !== def.key) ? ` · 🔧 Umrüstung auf ${_wrEsc(def.name)} läuft` : ''}</span></div>
          <div class="wr-gen-out">⚡ ${wrFmt(st ? st.output : 0)}
            <span class="wr-sub">+ ${wrFmt(wrColonyLevel(p) * WR_COLONY_PER_LEVEL)} aus der Kolonie-Stufe</span></div>
          ${wrFuelHtml(m, gen, pid)}
          ${wrSlotBuilding(gen) ? wrBuildBadgeHtml(gen) : (up
            ? `<button class="wr-btn wr-btn-sm" data-wr-pturret="${pid}:power_upgrade::"
                 ${canPay(up) ? '' : 'disabled'}>Auf Stufe ${glv + 1} ausbauen
                 <span class="wr-btn-sub">${priceTxt(up)} → ⚡ ${wrFmt(up.output)}</span></button>`
            : '<div class="wr-slot-max">✅ Vollausbau</div>')}
          ${zie.length ? `<div class="wr-slot-conv">${zie.map(g => {
            const pr = wrPgenConvertPrice(p, g.key);
            return `<button class="wr-btn wr-btn-sm wr-btn-conv"
                      data-wr-pturret="${pid}:power_convert::${g.key}" ${canPay(pr) ? '' : 'disabled'}>
              <span class="wr-conv-name">⬆️ ${_wrEsc(g.name)}</span>
              <span class="wr-conv-line">${priceTxt(pr)}</span>
              ${pr.rebate > 0 ? `<span class="wr-conv-save">−${wrFmt(pr.rebate)} CC angerechnet</span>` : ''}
              <span class="wr-conv-line">→ ⚡ ${wrFmt(pr.output)} · zurück auf Stufe 1</span>
            </button>`;
          }).join('')}</div>` : ''}
        </div>
      </div>`;
  } else {
    body = `<div class="wr-gen-opts">${SPACE_POWER.map(g => {
      const st   = wrPgenStats(g.key, 1);
      const frei = wrPowerUnlocked(m, g.key);
      const txt  = frei ? priceTxt(st)
                        : `🔒 Forschung „${_wrEsc(wrTechName(g.needs))}" (${_wrEsc(wrTechRef(g.needs))})`;
      return `
        <div class="wr-slot-opt${frei ? '' : ' wr-slot-opt-lock'}">
          <span class="wr-slot-opt-art wr-ship-zoom" data-wr-geninfo="${g.key}" title="Groß ansehen">
            <img src="assets/${g.folder}/${g.art}.png" alt=""
              onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
            ><span class="wr-slot-opt-fb">${g.icon}</span><span class="wr-zoom-hint">🔍</span></span>
          <span class="wr-slot-opt-txt">
            <span class="wr-slot-opt-n">${_wrEsc(g.name)}</span>
            <span class="wr-slot-opt-a">⚡ ${wrFmt(g.out[1])} / ${wrFmt(g.out[2])} / ${wrFmt(g.out[3])}</span>
            <span class="wr-slot-opt-p">${txt}</span>
          </span>
          <button class="wr-btn wr-btn-sm" data-wr-pturret="${pid}:power_build::${g.key}"
            ${(frei && canPay(st)) ? '' : 'disabled'}>Bauen</button>
        </div>`;
    }).join('')}</div>`;
  }
  return `
    <div class="wr-pdef-row wr-pdef-power">
      <div class="wr-pdef-lbl">⚡ Energieversorgung
        <span class="wr-sub">Grundversorgung ${wrFmt(wrColonyLevel(p) * WR_COLONY_PER_LEVEL)} aus Kolonie-Stufe ${wrColonyLevel(p)} · Preise ×${String(WR_PTURRET_MULT).replace('.', ',')}</span></div>
      <div class="wr-pdef-val ${fac < 1 ? 'wr-bad' : ''}">${wrFmt(dem)} / ${wrFmt(sup)}</div>
      <div class="wr-nrg-bar ${dem > sup ? 'wr-nrg-short' : ''}">
        <div class="wr-nrg-fill" style="width:${sup > 0 ? Math.min(100, Math.round(dem / sup * 100)) : 100}%"></div>
      </div>
      ${/* ⚠️ wr-nrg-msg ist PFLICHT: .wr-pdef-row ist ein 2-Spalten-Grid und die Meldung
            landet sonst in der schmalen auto-Spalte, wo ihr langer Text die Spalte
            aufbläht und die Bau-Optionen daneben zerquetscht. Eigene Klasse statt
            .wr-bad, weil .wr-pdef-val oben ebenfalls .wr-bad trägt — die darf NICHT
            über beide Spalten gehen. */ ''}
      ${fac < 1
        ? `<div class="wr-nrg-msg wr-bad">⚡ Unterversorgt — die Geschütze dieser Kolonie feuern mit
             ${Math.round(fac * 100)} % (es fehlen ${wrFmt(dem - sup)} Energie).</div>`
        : `<div class="wr-nrg-msg wr-sub">Versorgt. Noch ${wrFmt(Math.max(0, sup - dem))} Energie frei.</div>`}
      ${body}
    </div>`;
}

function wrPlanetDefHtml(m, p) {
  if (!p || p.colonized_by !== m?.id) return '';
  const coins = parseFloat(m?.coins) || 0;
  const canPay = (c) => coins >= (c.cc || 0) && wrErz(m) >= (c.erz || 0)
    && wrKristall(m) >= (c.kristall || 0) && wrPlasmoid(m) >= (c.plasmoid || 0)
    && wrQuantum(m) >= (c.quantum || 0);
  const priceTxt = wrPreisTxt;                       // 27p: eine Fassung fuer alle

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
      ${/* ⚠️ 27o: dieselbe Quelle wie das Dreieck in der Liste — hier ausgeschrieben.
            Das Dreieck sagt DASS etwas ist, dieser Block sagt WAS und was zu tun ist. */''}
      ${(() => {
        const w = wrColonyWarnings(m, p);
        if (!w.level) return '';
        return `<div class="${w.level === 'bad' ? 'wr-warn' : 'wr-nrg-msg wr-sub'}">
          ${w.level === 'bad' ? '⚠️ Diese Kolonie braucht Aufmerksamkeit:' : 'Hinweise:'}
          <ul class="wr-cwarn-list">${w.items.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
      })()}

      <div class="wr-pdef-row">
        <div class="wr-pdef-lbl">🏙️ Kolonie-Ausbau <span class="wr-sub">Stufe ${clv} von 3</span></div>
        <div class="wr-pdef-val">${wrResIc(p.resource_type)} ${wrFmt(yieldFor(clv))}/Tag</div>
        ${(() => {
          // 🏗️ 27ad (JP 2026-08-22: „Eine Kolonie Stufe zu erhoehen kostet keine Zeit
          // das macht keinen Sinn"). Es gibt bewusst KEIN What's-New-Popup — dieser
          // Block IST die Erklärung der neuen Regel, und er steht dort, wo man auf sie
          // trifft: am Ausbau-Knopf.
          const bau = wrColonyBuild(p);
          if (bau) {
            const pct = bau.totalMin > 0
              ? Math.max(0, Math.min(100, Math.round((1 - bau.minutesLeft / bau.totalMin) * 100)))
              : 0;
            return `<div class="wr-colbuild">
              <div class="wr-sub">🏗️ Ausbau auf Stufe ${bau.target} läuft —
                noch <strong data-wr-coleta="${p.id}">${wrCountdown(bau.minutesLeft * 60000)}</strong></div>
              <div class="wr-colbuild-bar"><span style="width:${pct}%"></span></div>
              <div class="wr-sub">Die Kolonie liefert währenddessen weiter Stufe ${clv} —
                Ertrag und Verteidigung laufen normal.</div>
            </div>`;
          }
          if (!cUp) return '<div class="wr-slot-max">✅ Vollausbau</div>';
          return `<button class="wr-btn wr-btn-sm" data-wr-pbuild="${p.id}:colony_upgrade" ${canPay(cUp) ? '' : 'disabled'}
               >Auf Stufe ${cUp.level} ausbauen
               <span class="wr-btn-sub">${priceTxt(cUp)} · ⏳ ${wrDur(wrColonyBuildMin(cUp.level))}
                 → ${wrResIc(p.resource_type)} ${wrFmt(yieldFor(cUp.level))}/Tag</span></button>`;
        })()}
      </div>

      <div class="wr-pdef-row">
        <div class="wr-pdef-lbl">🛡️ Geschütz-Bauplätze
          <span class="wr-sub">${dlv} von ${wrPlanetSlotsFree(p)} belegt · Preise ×${String(WR_PTURRET_MULT).replace('.', ',')} (Transport)</span></div>
        <div class="wr-pdef-val">${dlv ? `🛡️ ${wrFmt(wrPlanetDef(p))}` : '—'}</div>
        ${!hasE10
          ? `<div class="wr-warn">🔒 Braucht die Forschung ${wrIc('pla')} <strong>${_wrEsc(wrTechName('wt_e10'))}</strong>
               <span class="wr-sub">(${_wrEsc(wrTechRef('wt_e10'))})</span>.</div>`
          : wrPlanetSlotsHtml(m, p)}
      </div>

      ${/* ⚡ Kolonie-Kraftwerk (26p, JP 2026-07-30: „Die Kolonien brauchen ebenfalls
            Energie-Generatoren!"). Steht DIREKT unter den Bauplätzen — dort entsteht der
            Bedarf. Nur zeigen, wenn die Geschütze überhaupt freigeschaltet sind, sonst
            erklärt das Panel eine Mechanik zu etwas, das es noch nicht gibt. */''}
      ${hasE10 ? wrColonyPowerHtml(m, p, canPay, priceTxt) : ''}

      ${stationHere
        ? `<div class="wr-station-done">
             ${wrStationArt()}
             <div class="wr-ok">📡 <strong>Quadranten-Station aktiv</strong> — alle befreiten Planeten
               in ${_wrEsc(p.quadrant)} sind vor Rückeroberung geschützt, auch die deiner Clan-Mitglieder.</div>
           </div>`
        : `<div class="wr-pdef-row">
             <div class="wr-pdef-lbl">${wrStationArt()} Quadranten-Station <span class="wr-sub">verdreifacht die Rückfallfrist in ${_wrEsc(p.quadrant)}</span></div>
             <div class="wr-pdef-val">${stationQ ? '— vorhanden' : '—'}</div>
             ${stationQ
               ? `<div class="wr-sub">In diesem Quadranten steht bereits eine Station (${_wrEsc(stationQ.name)}).</div>`
               : !hasF7
                 ? `<div class="wr-warn">🔒 Braucht die Forschung ${wrIc('qua')} <strong>${_wrEsc(wrTechName('wt_f7'))}</strong>
                      <span class="wr-sub">(${_wrEsc(wrTechRef('wt_f7'))})</span>.</div>`
                 : dlv < 3
                   ? '<div class="wr-warn">🔒 Erst die Planeten-Geschütze auf Stufe 3 ausbauen.</div>'
                   : wrStationCount(m) >= WR_STATION_MAX
                     ? `<div class="wr-warn">📡 Du hast bereits ${WR_STATION_MAX} Stationen —
                          mehr sind je Spieler nicht erlaubt.
                          <span class="wr-sub">Sonst kauft der Führende auf Dauer die halbe
                          Karte still zusammen.</span></div>`
                     : `<button class="wr-btn wr-btn-sm" data-wr-pbuild="${p.id}:station_build" ${canPay(WR_STATION) ? '' : 'disabled'}
                        >📡 Station errichten
                        <span class="wr-btn-sub">${priceTxt(WR_STATION)} · ${wrStationCount(m)}/${WR_STATION_MAX} gebaut</span></button>`}
           </div>`}

      <div class="wr-sub">Geschütze decken den Anflug auf diesen Planeten, schießen zu 50 %
        gegen Angriffswellen auf deinen Hafen mit — und halten den Planeten dauerhaft in deiner Hand.</div>

      ${wrGarrisonHtml(m, p)}
    </div>`;
}

// ── 🛡️ Garnison-Panel (27k) ─────────────────────────────────────────────────
// JPs Anlass: „durch Vollausbau der Geschütze ist natürlich eine gewisse Grenze erreicht,
// was als Verteidigung möglich ist." Die Garnison hebt die Decke — gegen laufende Kosten.
// ⚠️ Die Obergrenze MUSS vor dem Absenden sichtbar sein (Handover §2.2). Sie steht
// deshalb in der Kopfzeile UND am Knopf, nicht erst in der Fehlermeldung des Servers.
function wrGarrisonHtml(m, p) {
  const pid   = p.id;
  const stand = wrGarrisonCount(m, pid);
  const cap   = wrGarrisonCap(p);
  const pow   = wrGarrisonPower(m, pid);
  const trip  = wrGarrisonTripFor(m, pid);
  const ships = wrGarrisonShips(m, pid);
  const home  = wrHomeShips(m);
  const moth  = wrMothCount(m) > 0;
  const sel   = (_wrGarSel && _wrGarSel.planetId === pid) ? _wrGarSel.ships : {};
  const selN  = SPACE_SHIPS.reduce((a, s) => a + (parseInt(sel[s.key], 10) || 0), 0);
  const frei  = Math.max(0, cap - stand);

  // Stationierte Schiffe einzeln.
  const rows = SPACE_SHIPS
    .filter(s => (parseInt(ships[s.key], 10) || 0) > 0)
    .map(s => `<div class="wr-fl-row">
        ${wrShipArt(s.key, 'wr-fl-art')}
        <span class="wr-fl-name">${_wrEsc(s.name)}</span>
        <span class="wr-fl-n">${wrFmt(parseInt(ships[s.key], 10) || 0)}</span>
        <span class="wr-fl-atk">${wrIc('atk')} ${wrFmt((s.atk || 0) * (parseInt(ships[s.key], 10) || 0))}</span>
      </div>`).join('');

  // Auswahl-Stepper: beim Verlegen aus dem Hafen, beim Rückholen aus der Garnison.
  const quelle = _wrGarMode === 'recall' ? ships : home;
  const picker = SPACE_SHIPS
    .filter(s => !s.special && (parseInt(quelle[s.key], 10) || 0) > 0)
    .map(s => {
      const max = parseInt(quelle[s.key], 10) || 0;
      const n   = parseInt(sel[s.key], 10) || 0;
      return `<div class="wr-gar-pick">
          <span class="wr-gar-pn">${wrShipArt(s.key, 'wr-mini')} ${_wrEsc(s.name)}
            <span class="wr-sub">${max} da</span></span>
          <span class="wr-fs-stepper">
            <button class="wr-fs-btn" data-wr-gar="${pid}:${s.key}:-1" ${n < 1 ? 'disabled' : ''}>−</button>
            <span class="wr-fs-n">${n}</span>
            <button class="wr-fs-btn" data-wr-gar="${pid}:${s.key}:1" ${n >= max ? 'disabled' : ''}>+</button>
          </span>
        </div>`;
    }).join('');

  // ⚠️ Die Grenze wird HIER geprüft, nicht erst vom Server — der Handover verlangt
  // ausdrücklich, dass sie vor dem Absenden sichtbar ist.
  const zuViel = _wrGarMode === 'garrison' && (stand + selN) > cap;

  return `
    <div class="wr-gar">
      <div class="wr-card-title">🛡️ Garnison
        <span class="wr-sub">— ${wrFmt(stand)} von ${wrFmt(cap)} Plätzen belegt${
          pow ? ` · ${wrFmt(pow)} Feuerkraft` : ''}</span></div>

      <div class="wr-sub">Eigene Schiffe, die hier dauerhaft stehen. Sie verteidigen diese
        Kolonie mit voller Kampfkraft — dafür verteidigen sie den Raumhafen nicht mehr und
        können von hier keine Angriffe fliegen. <strong>Sie zahlen vollen Flottensold</strong>.
        Platz: ${WR_GARRISON_PER_LEVEL} Schiffe je Kolonie-Stufe.</div>
      ${/* 🚀 27x: der Kutter ist die Ausnahme von „sie erwirtschaften nichts" — deshalb
            steht der Satz oben jetzt ohne diese Begründung da. Regel 4: die neue Regel
            gehört an den Ort, an dem man sie benutzt. */''}
      <div class="wr-sub">🚀 <strong>Espresso-Kutter handeln hier:</strong>
        ${wrFmt(WR_KUTTER_CC)} CC je Tag und Stück (10 % seines Bauwerts), abzüglich
        ${wrFmt(Math.round((SPACE_SHIP_BY_KEY.kutter?.cc || 1500) * 0.01))} CC Sold.
        Er belegt dafür einen Platz, den sonst ein Kampfschiff hätte — Handel gegen Schutz.${
        (parseInt(ships.kutter, 10) || 0) > 0
          ? ` Hier stehen <strong>${wrFmt(parseInt(ships.kutter, 10))}</strong> und bringen
              <strong>${wrFmt(wrColonyKutterCc(m, pid))} CC/Tag</strong>.`
          : ''}</div>

      ${moth ? `<div class="wr-warn">🧊 Deine Flotte ist eingemottet — die Garnison zählt
        solange mit 0 und kostet auch nichts. Erst auslösen, dann verteidigt sie wieder.</div>` : ''}
      ${rows || '<div class="wr-sub" style="padding:4px 0">Noch keine Schiffe stationiert.</div>'}

      ${trip
        ? `<div class="wr-ok">🚚 Transport unterwegs (${trip.kind === 'recall' ? 'Rückholung' : 'Verlegung'})
             — Ankunft in <strong data-wr-gareta="${_wrEsc(trip.id || '')}"
             >${wrCountdown(Date.parse(trip.arriveAt) - Date.now())}</strong>.
             <span class="wr-sub">Je Kolonie läuft immer nur ein Transport.</span></div>`
        : `<div class="wr-gar-mode">
             <button class="wr-btn wr-btn-sm${_wrGarMode === 'garrison' ? ' wr-btn-on' : ''}"
                     data-wr-garmode="garrison">➡️ Hinschicken</button>
             <button class="wr-btn wr-btn-sm${_wrGarMode === 'recall' ? ' wr-btn-on' : ''}"
                     data-wr-garmode="recall" ${stand < 1 ? 'disabled' : ''}>⬅️ Zurückholen</button>
           </div>
           ${picker || `<div class="wr-sub" style="padding:4px 0">${_wrGarMode === 'recall'
              ? 'Hier steht nichts, was sich zurückholen ließe.'
              : 'Keine Schiffe im Hafen.'}</div>`}
           ${selN > 0 ? `
             <button class="wr-btn wr-btn-go" data-wr-garsend="${pid}" ${(zuViel || moth) ? 'disabled' : ''}>
               ${_wrGarMode === 'recall' ? '⬅️ Zurückholen' : '➡️ Verlegen'} · ${wrFmt(selN)} Schiffe
               <span class="wr-btn-sub">${moth
                 ? 'erst die eingemottete Flotte auslösen'
                 : zuViel
                   ? `zu viel — hier ist nur noch für ${wrFmt(frei)} Schiffe Platz`
                   : `volle Flugzeit · ${_wrGarMode === 'recall'
                       ? 'kommt in den Hafen zurück'
                       : `danach ${wrFmt(stand + selN)} von ${wrFmt(cap)} Plätzen belegt`}`}</span></button>`
             : ''}`}
    </div>`;
}

// Rückfall-Warnung für befreite, aber ungeschützte Planeten (26h).
function wrFallbackHtml(p, m) {
  const at = wrFallbackAt(p, m);
  if (!at) return '';
  const left = at - Date.now();
  const own  = p.cleared_by === m?.id;
  // ⚠️ Die Aufzählung nennt nur Wege, die es auf einem NICHT kolonisierten Planeten
  // wirklich gibt: Geschütze und Station verlangen serverseitig `colonized_by = member`
  // (build_planet_defense) und sind hier gar nicht baubar. Vorher standen sie gleichrangig
  // daneben (JP 2026-07-30: „man kann doch nur eine Kolonie gründen, danach ein Geschütz").
  return `<div class="${left < 86400000 ? 'wr-warn' : 'wr-sub'}">⏳ Ungeschützt —
    ${own ? 'dein Planet' : 'dieser Planet'} fällt in <strong>${wrCountdown(left)}</strong> an die Feinde zurück.
    Es hält ihn: eine <b>Kolonie</b> darauf gründen, <b>Schiffe stationieren</b> (Route) oder
    eine <b>📡 Station</b> irgendwo in ${_wrEsc(p.quadrant || 'diesem Quadranten')} — sie
    verdreifacht die Frist im ganzen Quadranten (${wrFallbackDays(m)} → ${wrFallbackDays(m) * WR_FALLBACK_STATION_MULT} Tage),
    hält den Planeten aber nicht für immer. Geschütze gibt es nur auf Kolonien.
    ${wrQuadStationDown(p.quadrant)
      ? `<br><span class="wr-bad">📡 Die Station auf ${_wrEsc(wrQuadStationDown(p.quadrant).name)}
         ist ausgefallen — ihre Geschütze sind Wracks. Repariere eines, dann wirkt sie wieder.</span>`
      : ''}</div>`;
}

// ── Kolonien ─────────────────────────────────────────────────────────────────
function wrColoniesHtml(m) {
  const cols = wrColonies(m);
  // ⚠️ FIX 2026-07-30, ZWEITER ANLAUF (JP: „Die Kolonien sind immer noch nicht über
  // Raumhafen anzusteuern").
  //
  // MEIN ERSTER FEHLER: ich habe die fehlenden PANELS ergänzt (Routen, Rückfall) und
  // angenommen, damit sei die Liste vollständig. Sie war es nicht — die LISTE selbst war
  // zu kurz. `wrColonies(m)` liefert nur `space.colonies`, also **kolonisierte** Planeten.
  // BEFREIT ≠ KOLONISIERT: Kolonisieren braucht ein Kolonieschiff, Befreien nur einen
  // Sieg. JP hat Ring 1 komplett BEFREIT — diese Planeten tragen die Dauerernte- und
  // Bergungsrouten, tauchten hier aber überhaupt nicht auf. Für sie war die Sternkarte
  // weiter der einzige Weg, genau wie er sagt.
  //
  // MERKE: Wenn ein Nutzer sagt „X ist nicht erreichbar", obwohl X gerendert wird, zuerst
  // prüfen, ob die QUELLE der Liste dasselbe X meint wie er. Zweimal am selben Punkt
  // vorbeigelaufen, weil ich „Kolonie" technisch gelesen habe und er es umgangssprachlich
  // meinte (= „meine Planeten").
  // ⚠️ DRITTER ANLAUF, und diesmal die Ursache statt des Symptoms (JP: „Die Kolonien
  // werden weiterhin nicht aufgeführt. Die Planeten sind angegeben").
  //
  // BEFUND: `wrColonies(m)` liest `space.colonies` — einen JSON-SPIEGEL, den
  // claim_space_arrival beim Kolonisieren schreibt. Die WAHRHEIT steht aber in
  // `space_planets.colonized_by`. Läuft der Spiegel nach (verpasster Claim, alter
  // Datensatz, Rückeroberung), fehlt die Kolonie in der Liste, obwohl der Planet sie ist.
  // Genau dieselbe Zwei-Quellen-Falle wie bei colony_level in 26h („BEIDE Seiten").
  //
  // FIX: die LISTE kommt jetzt aus der Planetentabelle (autoritativ), der JSON-Spiegel
  // nur noch für den ANGESAMMELTEN Ertrag (den kennt nur er). Fehlt der Spiegeleintrag,
  // erscheint die Kolonie trotzdem — mit Ertrag 0 statt gar nicht.
  const mine = (_wrGalaxy?.planets || []).filter(p => p.cleared_by === m?.id
                                                   || p.colonized_by === m?.id);
  const colIds = mine.filter(p => p.colonized_by === m?.id).map(p => p.id);
  // Spiegel-Einträge ohne Planetenzeile (noch nicht geladen) trotzdem mitnehmen.
  for (const id of Object.keys(cols)) if (!colIds.includes(id)) colIds.push(id);
  const keys = colIds;
  const rest = mine.filter(p => p.colonized_by !== m?.id);
  if (!keys.length && !rest.length) return '';
  let pending = 0, rows = '';
  for (const id of keys) {
    const plRow = wrPlanetById(id);
    // ⚠️ Spiegel-Lücken auffüllen (siehe Befund oben): fehlt der JSON-Eintrag, kommen
    // Typ/Reichtum/Stufe aus der Planetenzeile. OHNE das wird `Date.parse(undefined)` zu
    // NaN, damit `days` → NaN, `amt` → NaN und `pending` → NaN — der Ernte-Knopf zeigte
    // dann „NaN" und liesse sich nie aktivieren. Ein fehlender Spiegel darf die ganze
    // Karte nicht vergiften.
    const c = Object.assign(
      plRow ? { type: plRow.resource_type, richness: plRow.richness,
                name: plRow.name, level: plRow.colony_level } : {},
      cols[id] || {});
    const lastH = Date.parse(c.lastHarvest || 0);
    const days = Number.isFinite(lastH)
      ? Math.min(wrTechCapDays(m), Math.max(0, (Date.now() - lastH) / 86400000))
      : 0;   // kein Spiegel → noch kein angesammelter Ertrag bekannt
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
    // ⚠️ 27w (JP 2026-08-20: „Bekomme ich nun eigentlich auch CC je Kolonie … es wird
    // nämlich nicht angegeben."). JA — und zwar seit wt_d4 (Fern-Handelsroute, 25) plus
    // wt_e15 (Handelskolonie, nochmal 25), mal Reichtum, mal Regionsbonus. `harvest_space`
    // zahlt es bei jeder Ernte aus.
    // ⚠️ `wrTechColonyCc` gab es im Client SEIT 26e — definiert und NIE aufgerufen. Wieder
    // der Fall „Server-Mechanik gebaut, Anzeige vergessen" (mothballed 26w, merc 26x,
    // garrison 27k, wrAllUsers 27s). Diesmal war es Geld, das jeden Tag floss, ohne dass
    // irgendwo stand, woher. Ein Einkommen, das niemand sieht, ist kein Anreiz.
    const ccTag = wrColonyCcDay(m, pl);
    const proTag = [tagAmt > 0 ? `${wrFmt(tagAmt)} ${wrResIc(typ)}` : '']
      .concat(tagSide ? [`${wrFmt(tagSide.erz)} ${wrIc('erz')}`,
                         `${wrFmt(tagSide.kri)} ${wrIc('kri')}`] : [])
      .concat(ccTag > 0 ? [`${wrFmt(ccTag)} CC`] : [])
      .filter(Boolean).join(' · ');
    rows += `
      <div class="wr-col-item${offen ? ' wr-col-open' : ''}">
        <button type="button" class="wr-col-row" data-wr-coltoggle="${_wrEsc(id)}">
          <span class="wr-col-caret">${offen ? '▾' : '▸'}</span>
          <span>${wrResIc(typ)} ${wrColonyWarnBadge(m, pl)}${_wrEsc(c.name || 'Kolonie')}
            <span class="wr-sub">Ring ${pl ? pl.ring : '?'}${pl ? ` · ${_wrEsc(pl.quadrant)}` : ''}</span></span>
          ${/* ⚠️ 27q (JP 2026-08-20): „man könnte die Garnisonsfeuerkraft noch in der
                Kolonieübersicht je Kolonie aufzeigen mit Schwertern. das Schild sind ja
                die Geschütze." — Zwei GETRENNTE Posten, absichtlich nicht addiert:
                🛡️ ist `planet_defense` (nur die Geschütze, serverseitig materialisiert),
                ⚔️ die Garnison. Eine Summe hier wäre eine dritte Zahl, die es
                serverseitig nicht gibt — `_space_colony_defense` addiert ausserdem noch
                Routen, Söldner und Station. Wer zusammenzählt, was der Server getrennt
                führt, erfindet eine Kennzahl (dieselbe Falle wie die zwei „Garnisonen"
                in 26v/27k).
                ⚠️ Angezeigt wird, sobald SCHIFFE dastehen — nicht erst ab Feuerkraft > 0.
                Eingemottet liefert `wrGarrisonPower` bewusst 0 (wie der Server), und
                genau dann MUSS „⚔️ 0" sichtbar sein: sonst verschwände die Garnison
                stillschweigend aus der Übersicht, statt ihren Zustand zu zeigen. */''}
          <span class="wr-sub">Stufe ${c.level || 1} · ${'★'.repeat(c.richness || 1)}${
            wrDefLevel(pl) ? ` · 🛡️ ${wrFmt(wrPlanetDef(pl))}` : ' · 🛡️ —'}${
            wrGarrisonCount(m, id) > 0
              ? ` · ${wrIc('atk')} ${wrFmt(wrGarrisonPower(m, id))}` : ''}${wrIsStation(pl) ? ' · 📡' : ''}
            <span class="wr-col-day">${proTag ? `📥 ${proTag} /Tag` : ''}${
              (!wrResMinable(m, typ) && tagAmt === 0) ? ` 🔒 ${wrResIc(typ)} braucht die Abbau-Technik` : ''}</span></span>
          <strong>+${wrFmt(amt + (side ? side.erz + side.kri : 0))}</strong>
        </button>
        ${/* 🏙️ VOLLSTÄNDIGE Steuerung im Akkordeon (JP 2026-07-30: „Ich wollte doch, dass
              man die Kolonien unter Raumhafen ebenfalls ansteuern kann anstatt nur über
              den Klick in die Karte!").
              BEFUND: das Akkordeon gab es seit 26l, es zeigte aber NUR wrPlanetDefHtml
              (Ausbau + Geschütze + Station). Der Karten-Klick rendert DREI Panels — es
              fehlten die Routen (Dauerernte/Bergung) und die Rückfall-Warnung. Genau die
              braucht man zum „Ansteuern", also war die Karte weiter Pflicht.
              MERKE: Wenn zwei Orte denselben Gegenstand zeigen, die Panel-LISTE
              vergleichen, nicht nur prüfen, ob „etwas" da ist. */''}
        ${offen && pl ? `<div class="wr-col-body">
            ${wrFallbackHtml(pl, m)}
            ${wrPlanetDefHtml(m, pl)}
            ${wrRoutePanelHtml(m, pl)}
            ${/* Für alles Flottenbezogene (Angriff, Verstärkung, Kolonieschiff) bleibt die
                  Karte der richtige Ort — der Verband-Picker gehört an die Flugbahn.
                  Dieser Knopf springt dorthin, statt den Picker zu duplizieren. */''}
            <button class="wr-btn wr-btn-sm" data-wr-colmap="${_wrEsc(id)}"
              >🌌 Auf der Sternkarte zeigen</button>
          </div>` : ''}
        ${offen && !pl ? '<div class="wr-col-body"><div class="wr-sub">Planetendaten noch nicht geladen.</div></div>' : ''}
      </div>`;
  }
  // ── 🚩 Befreite Planeten OHNE Kolonie ──────────────────────────────────────
  // Sie tragen Dauerernte- und Bergungsrouten und können zurückfallen — genau deshalb
  // müssen sie von hier aus steuerbar sein. Kein Ertragszähler: ohne Kolonie sammelt
  // sich nichts an, geerntet wird über die Routen.
  // ── Gliederung (JP 2026-07-30): „unterteilt in Abbau, Kolonie, ungeschützt, Wrack
  // (sortiert mit max oben)".
  // Jeder Planet steht in GENAU EINEM Abschnitt — sonst sucht man denselben Eintrag an
  // vier Stellen und weiss nie, welcher der aktuelle ist. Zuordnung nach Dringlichkeit:
  //   ungeschützt zuerst (Rückfall droht, das ist zeitkritisch)
  //   dann Wrack (endlicher Vorrat, lohnt sich abzuräumen)
  //   dann Abbau (läuft von allein weiter)
  // Kolonien haben ihren eigenen Abschnitt und können nicht ungeschützt sein.
  const secRisk = [], secWreck = [], secMine = [];
  for (const pl of rest) {
    if (wrFallbackAt(pl, m)) secRisk.push(pl);
    else if (wrWreckLeft(pl) > 0) secWreck.push(pl);
    else secMine.push(pl);
  }
  // „Max oben" je Abschnitt: die Zahl, die in der Zeile fett steht.
  secRisk.sort((a, b) => wrPlanetDef(b) - wrPlanetDef(a) || b.ring - a.ring);
  secWreck.sort((a, b) => wrWreckLeft(b) - wrWreckLeft(a));
  secMine.sort((a, b) => (b.richness || 0) - (a.richness || 0) || b.ring - a.ring);

  const planetRow = (pl) => {
    const id    = pl.id;
    const offen = _wrColOpen === id;
    const meta  = wrResMeta(pl.resource_type);
    const wreck = wrWreckLeft(pl);
    const risk  = wrFallbackAt(pl, m);
    return `
      <div class="wr-col-item${offen ? ' wr-col-open' : ''}">
        <button type="button" class="wr-col-row" data-wr-coltoggle="${_wrEsc(id)}">
          <span class="wr-col-caret">${offen ? '▾' : '▸'}</span>
          <span>${wrResIc(pl.resource_type)} ${_wrEsc(pl.name || 'Planet')}
            <span class="wr-sub">Ring ${pl.ring} · ${_wrEsc(pl.quadrant)}</span></span>
          <span class="wr-sub">${'★'.repeat(Math.max(1, pl.richness || 1))} ${_wrEsc(meta.name)}${
            wrDefLevel(pl) ? ` · 🛡️ ${wrFmt(wrPlanetDef(pl))}` : ''}${wrIsStation(pl) ? ' · 📡' : ''}
            <span class="wr-col-day">${wreck > 0 ? `${wrIc('salvage')} ${wrFmt(wreck)} Wrackteile` : ''}${
              !wrResMinable(m, pl.resource_type) ? ` 🔒 ${wrResIc(pl.resource_type)} braucht die Abbau-Technik` : ''}</span></span>
          ${/* Der fette Wert rechts ist die SORTIERGRÖSSE des Abschnitts — sonst steht dort
                eine Zahl, nach der die Liste gar nicht geordnet ist, und die Reihenfolge
                wirkt willkürlich. */''}
          <strong class="${risk ? 'wr-bad' : ''}">${risk
            ? `⚠️ ${wrFmt(wrPlanetDef(pl))}`
            : (wreck > 0 ? wrFmt(wreck) : '★'.repeat(Math.max(1, pl.richness || 1)))}</strong>
        </button>
        ${offen ? `<div class="wr-col-body">
            ${wrFallbackHtml(pl, m)}
            ${wrPlanetDefHtml(m, pl)}
            ${wrRoutePanelHtml(m, pl)}
            <button class="wr-btn wr-btn-sm" data-wr-colmap="${_wrEsc(id)}"
              >🌌 Auf der Sternkarte zeigen</button>
          </div>` : ''}
      </div>`;
  }

  // 📂 Alle vier Abschnitte klappen als GANZES zu (JP 2026-07-30: „Die ganzen Planeten
  // ebenfalls" in einen Akkordeon). Die Zusammenfassung in der Kopfzeile ist Pflicht —
  // zugeklappt muss man sehen, ob sich das Öffnen lohnt. Der Ernte-Knopf bleibt als
  // `foot` IMMER sichtbar: er ist die meistgedrückte Aktion des Tabs.
  const naechster = secRisk.map(p => wrFallbackAt(p, m)).filter(Boolean).sort((a, b) => a - b)[0];
  const wrackSum  = secWreck.reduce((a, p) => a + wrWreckLeft(p), 0);
  return `
    ${rows ? wrSecCard('colonies',
      `${wrIc("colony")} Kolonien`,
      `${keys.length} · +${wrFmt(pending)} bereit`,
      `${rows}${(() => {
         // ⚠️ Woher die CC kommen, gehört unter die Liste (Regel 4: die Regel dort, wo
         // man auf sie trifft). Seit 27x hängt der Grundertrag an der KOLONIE-STUFE,
         // nicht mehr am Reichtum — der treibt schon den Rohstoff-Ertrag.
         const anteil = wrColonyCcShare(m);
         const stufen = [1, 2, 3].map(lv => wrFmt(Math.round(WR_COLONY_CC[lv] * (anteil || 1))))
                                 .join(' / ');
         if (!anteil) return `<div class="wr-sub">💰 Kolonien werfen zusätzlich CC ab, sobald
           <strong>${_wrEsc(wrTechName('wt_d4'))}</strong> erforscht ist
           (${_wrEsc(wrTechRef('wt_d4'))}) — die Hälfte von ${stufen} CC je Tag nach
           Kolonie-Stufe, den Rest mit <strong>${_wrEsc(wrTechName('wt_e15'))}</strong>.</div>`;
         return `<div class="wr-sub">💰 <strong>${stufen} CC je Tag</strong> nach Kolonie-Stufe${
           anteil < 1 ? ` — die Hälfte, weil <strong>${_wrEsc(wrTechName('wt_e15'))}</strong>
           noch fehlt (damit wären es ${[1, 2, 3].map(lv => wrFmt(WR_COLONY_CC[lv])).join(' / ')})`
           : ''}. Dazu <strong>${wrFmt(WR_KUTTER_CC)} CC je Tag und Espresso-Kutter</strong>,
           den du in die Garnison einer Kolonie stellst — er belegt dort einen der
           ${WR_GARRISON_PER_LEVEL} Plätze je Stufe, den sonst ein Kampfschiff hätte.
           Alles wird beim Ernten ausgezahlt.</div>`;
       })()}<div class="wr-sub">🛡️ Geschütze der Kolonie · ${wrIc('atk')} Garnison (deine dort stationierten Schiffe) — zwei getrennte Posten, der Server führt sie auch getrennt. Ertrag sammelt sich max. ${wrTechCapDays(m)} Tage an.</div>`,
      `<button class="wr-btn wr-btn-go" data-wr-harvest="1" ${pending < 1 ? 'disabled' : ''}>
        ${wrIc("yield")} Ertrag einsammeln${pending > 0 ? ` (${wrFmt(pending)})` : ''}</button>`) : ''}
    ${secRisk.length ? wrSecCard('risk',
      '⚠️ Ungeschützt',
      `${secRisk.length} · ${naechster ? `nächster Rückfall in ${wrCountdown(naechster - Date.now())}` : 'Rückfall droht'}`,
      `${secRisk.map(planetRow).join('')}
       ${/* ⚠️ TEXT KORRIGIERT (JP 2026-07-30): „Ohne Kolonie, Geschütz oder Station …
             Ein einziges Geschütz genügt" war irreführend. build_planet_defense verlangt
             `colonized_by = member` für JEDE Aktion — Geschütze UND Station setzen also
             selbst eine Kolonie voraus und sind auf einem bloss befreiten Planeten gar
             nicht baubar. Die Aufzählung las sich wie vier gleichwertige Optionen.
             MERKE: eine Aufzählung von Schutzmöglichkeiten muss die VORAUSSETZUNGEN
             mitnennen, sonst beschreibt sie Wege, die es nicht gibt. */''}
       <div class="wr-sub">Einen befreiten Planeten hält nur dreierlei:
         <b>eine Kolonie darauf</b> (braucht ein Kolonieschiff), <b>stationierte Schiffe</b>
         (Dauerernte- oder Bergungsroute) oder eine <b>📡 Quadranten-Station</b> irgendwo im
         selben Quadranten — auch die eines Clan-Mitglieds.<br>
         Geschütze und Station stehen selbst immer auf einer Kolonie; auf einem nur befreiten
         Planeten lassen sie sich nicht bauen. Der Unterschied: die Station schützt den
         <b>ganzen Quadranten</b>, die Kolonie nur ihren eigenen Planeten.<br>
         Sonst fällt er nach ${wrFallbackDays(m)} Tagen zurück — und die Wächter kehren
         <b>verstärkt</b> wieder: mindestens ⚔️ ${wrFmt(WR_FALLBACK_FLOOR[1])}
         (Ring 2 ${wrFmt(WR_FALLBACK_FLOOR[2])} · Ring 3 ${wrFmt(WR_FALLBACK_FLOOR[3])}),
         jeder weitere Rückfall ×${WR_FALLBACK_GROWTH.toLocaleString('de-DE')}.</div>`,
      '', 'wr-card-call') : ''}
    ${secWreck.length ? wrSecCard('wreck',
      `${wrIc('salvage')} Wrackfelder`,
      `${secWreck.length} · ${wrFmt(wrackSum)} Wrackteile`,
      `${secWreck.map(planetRow).join('')}
       <div class="wr-sub">Bergungsschiffe räumen die Felder ab; der Vorrat ist endlich.</div>`) : ''}
    ${secMine.length ? wrSecCard('mine',
      '⛏️ Abbau',
      `${secMine.length} befreite Planeten`,
      `${secMine.map(planetRow).join('')}
       <div class="wr-sub">Röstkometen als Dauerernte-Route einstellen — oder ein Kolonieschiff
         schicken, dann sammelt der Planet von allein.</div>`) : ''}`;
}

// ── 📂 Abschnitts-Akkordeon (JP 2026-07-30) ─────────────────────────────────
// „Wäre vielleicht schön, wenn man Geschütze noch in einen accordion unterbringt.
//  Die ganzen Planeten ebenfalls."
//
// Die EINZELNEN Planeten klappen schon seit 26l auf (wr-col-item). Was fehlte, war die
// Ebene darüber: mit sechs Bauplätzen und drei Dutzend Planeten scrollt man an allem
// vorbei, was man gerade nicht braucht. Diese Klappe fasst einen ganzen ABSCHNITT zusammen.
//
// ⚠️ Zwei Regeln, die den Unterschied machen:
//  1. Die Kopfzeile trägt die ZUSAMMENFASSUNG (Anzahl, Feuerkraft, Ertrag). Ein
//     zugeklappter Abschnitt, der nur seinen Namen zeigt, zwingt zum Öffnen und hat
//     nichts gespart.
//  2. Die HAUPTAKTION bleibt draussen (z. B. „Ertrag einsammeln"). Sonst versteckt die
//     Klappe genau den Knopf, den man am häufigsten drückt.
//
// Der Zustand lebt nur in dieser Sitzung (Modul-Variable) — bewusst nicht in map_data:
// das wäre ein Schreibzugriff auf den Blob für eine reine Ansichtssache (Tagesbilanz-Lehre).
const WR_SEC_DEFAULT = {
  turrets: false,   // Bauplätze: viel Fläche, selten geändert
  colonies: true,   // der Hauptinhalt bleibt offen
  risk: true,       // zeitkritisch (Rückfall droht) — nie verstecken
  wreck: false,
  mine: false,
};
const _wrSec = {};
function wrSecOpen(key) {
  return key in _wrSec ? _wrSec[key] : (WR_SEC_DEFAULT[key] !== false);
}
// Ein aufklappbarer Karten-Abschnitt. `head` ist der Titel, `sum` die Zusammenfassung
// (immer sichtbar), `body` der einklappbare Inhalt, `foot` bleibt ebenfalls immer sichtbar.
function wrSecCard(key, head, sum, body, foot, cls) {
  const offen = wrSecOpen(key);
  return `
    <div class="wr-card ${cls || ''} wr-sec${offen ? ' wr-sec-open' : ''}">
      <button type="button" class="wr-sec-head" data-wr-sec="${key}">
        <span class="wr-sec-caret">${offen ? '▾' : '▸'}</span>
        <span class="wr-sec-title">${head}</span>
        <span class="wr-sec-sum">${sum || ''}</span>
      </button>
      ${offen ? `<div class="wr-sec-body">${body}</div>` : ''}
      ${foot || ''}
    </div>`;
}

// ── Angriffswelle auf den eigenen Hafen ─────────────────────────────────────
// Der Vorlauf (30–60 Min) ist der Kern des Features: nur deshalb kann man reagieren,
// Geschütze nachrüsten oder die Gruppe um Hilfe bitten.
// ── 🚨 26v/26aa: Vorwarnung bei Kolonie-Angriffen ───────────────────────────
// ⚠️ NACHGEREICHT 2026-08-17 (JP: „ganz viele kurze Popupmeldungen von Angriffen auf
// Kolonien … aber ich kann sie weder anschauen noch irgendwo anders wahrnehmen").
// Der Fehler war ein Denkfehler, kein Tippfehler: Ich hatte in 26v die Auswertung,
// den Chat-Eintrag und die Wrack-Anzeige gebaut — aber für die VORWARNUNG nur einen
// Toast. Ein Toast ist nach drei Sekunden weg, und genau in dem Fenster, in dem der
// Spieler etwas tun könnte (30–120 min), gab es nichts mehr zu sehen.
//
// ⚠️ ÜBERTRAGBARE LEHRE: Eine Meldung über etwas, das ERST NOCH passiert, darf nie nur
// flüchtig sein. Ein Toast taugt für Vollzugsmeldungen („abgewehrt"), nicht für
// Vorwarnungen — die brauchen einen Ort, an den man zurückkehren kann.
//
// Deshalb steht dieses Panel direkt neben `wrWaveHtml` und wird damit auf JEDEM Tab
// gezeigt, nicht nur unter Raumhafen. Dieselben Klassen wie die Hafen-Welle: zwei
// Bedrohungen derselben Art sollen nicht verschieden aussehen.
function wrColonyAlertHtml(m) {
  const list = (_wrAttacks || []).slice().sort(
    (a, b) => Date.parse(a.arriveAt) - Date.parse(b.arriveAt));
  if (!list.length) return '';

  const mercFrei = wrMercActive(m);
  const zeilen = list.map(a => {
    const rest = Date.parse(a.arriveAt) - Date.now();
    const min  = Math.max(0, Math.round(rest / 60000));
    const zeit = rest <= 0 ? 'JETZT'
               : min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
    const def  = parseFloat(a.defense) || 0;
    const str  = parseFloat(a.strength) || 0;
    const ok   = def >= str;
    const mc   = wrMerc(m);
    const wacht = mc && mc.guard === a.planetId;
    // 🛡️ 27k: Garnison im Angriffspanel. ⚠️ JP 2026-08-20: „aktuell bei angriff einer
    // kolonie gibt es nur die Schaltfläche ‚zur Kolonie' und ‚Söldner hin'."
    // Der Kommentar zwei Blöcke tiefer beschreibt genau diesen Fehler — ich habe die
    // Garnison gebaut und das Panel, das sie am dringendsten braucht, nicht angefasst.
    //
    // ⚠️ ABER: EIN KNOPF WÄRE HIER EINE FALLE. „Söldner hin" ist eine ZUWEISUNG und wirkt
    // sofort; eine Garnison muss FLIEGEN (Ring × 240 min). Wer 30 Minuten vor dem
    // Einschlag Schiffe losschickt, verliert sie an eine Kolonie, die vorher fällt.
    // Deshalb steht hier die ehrliche Auskunft statt eines Knopfes: was schon dort steht,
    // und ob eine Verlegung überhaupt noch ankäme.
    const garN   = wrGarrisonCount(m, a.planetId);
    const garPow = wrGarrisonPower(m, a.planetId);
    const flugMin = Math.max(1, Math.round(wrTripMin(a.ring, a.quadrant, m)
                                           * (100 - (wrSpeedPct(m) || 0)) / 100));
    const schafftEs = rest > 0 && min > flugMin;
    return `
      <div class="wr-calert-row">
        <span class="wr-calert-txt">
          <strong>🏙️ ${_wrEsc(a.planet)}</strong>
          <span class="wr-sub">Ring ${a.ring} · Quadrant ${_wrEsc(a.quadrant)}</span>
          <span class="wr-sub">🛡️ ${wrFmt(def)} gegen 👾 ${wrFmt(str)} —
            ${ok ? '<span class="wr-good">wird gehalten</span>'
                 : '<span class="wr-bad">zu schwach!</span>'}</span>
          ${/* Der Verteidigungswert oben ENTHÄLT die Garnison bereits (der Server rechnet
                sie seit 27k in _space_colony_defense mit). Diese Zeile schlüsselt nur auf,
                damit erkennbar ist, welcher Teil aus stationierten Schiffen kommt. */''}
          ${garN > 0
            ? `<span class="wr-sub">🛡️ Garnison: <strong>${wrFmt(garN)}</strong> Schiffe
                 (${wrFmt(garPow)} davon)${wrMothCount(m) > 0
                   ? ' — <span class="wr-bad">eingemottet, zählt 0!</span>' : ''}</span>`
            : ''}
          ${rest > 0 && !ok
            ? (schafftEs
                ? `<span class="wr-sub">🛡️ Eine Verlegung bräuchte <strong>${wrDur(flugMin)}</strong>
                     — käme rechtzeitig an. Über „Zur Kolonie".</span>`
                : `<span class="wr-sub">🛡️ Eine Verlegung bräuchte <strong>${wrDur(flugMin)}</strong>
                     — <span class="wr-bad">zu spät</span>.${mercFrei && !wacht
                       ? ' Söldner wirken dagegen sofort.' : ''}</span>`)
            : ''}
        </span>
        <span class="wr-calert-act">
          <strong class="${rest <= 0 ? 'wr-bad' : ''}">⏳ ${zeit}</strong>
          ${/* ⚠️ NACHGEREICHT 2026-08-17 (JP, Screenshot Weltraum_Angriff_Kolonie.PNG):
                „wie kann man nun zu dem Angriff übergehen? Und man hat auch nicht die
                Möglichkeit, direkt auf die angegebene Kolonie zu gehen und dort evtl.
                noch Geschütze zu bauen."
                Das Panel war eine Sackgasse: es zeigte vier Angriffe auf JETZT und bot
                nichts zum Drücken. Die Auswertung lief zwar automatisch beim Öffnen des
                Tabs — aber sie ist in try/catch gekapselt und meldet sich nie, also war
                für JP nicht unterscheidbar, ob sie hängt oder gar nicht vorgesehen ist.
                ⚠️ ÜBERTRAGBARE LEHRE: Eine Anzeige, die einen Zustand meldet, muss den
                Weg zur Handlung gleich mitliefern — sonst ist sie eine Sackgasse, und
                der Spieler sucht die Handlung dort, wo sie nicht ist. */''}
          ${rest <= 0
            ? `<button class="wr-btn wr-btn-sm wr-btn-go"
                 data-wr-resolve-attack="${a.planetId}">⚔️ Auswerten</button>`
            : `<button class="wr-btn wr-btn-sm"
                 data-wr-goto-colony="${a.planetId}">🏙️ Zur Kolonie</button>`}
          ${mercFrei && !wacht && rest > 0 ? `<button class="wr-btn wr-btn-sm"
              data-wr-merc-guard="${a.planetId}">🎖️ Söldner hin</button>` : ''}
          ${wacht ? '<span class="wr-sub">🎖️ bewacht</span>' : ''}
        </span>
      </div>`;
  }).join('');

  // ⚠️ Die Erklärzeile nennt die VORAUSSETZUNGEN der Gegenmittel (Lehre aus Teil 25):
  // ohne Kolonie kann man dort nichts bauen, und Schiffe müssen VOR dem Einschlag da sein.
  return `
    <div class="wr-wave wr-calert${list.some(a => (parseFloat(a.defense) || 0)
        < (parseFloat(a.strength) || 0)) ? ' wr-wave-danger' : ''}">
      <div class="wr-card-title">🚨 Angriff auf ${list.length === 1 ? 'eine Kolonie' : `${list.length} Kolonien`}</div>
      ${zeilen}
      <div class="wr-sub" style="margin-top:6px">
        Es zählt, was beim Einschlag da ist: Planeten-Geschütze der Kolonie, dort
        stationierte Ernte-/Bergungsschiffe und eine 📡 Station im selben Quadranten.
        Ein Söldner-Geschwader lässt sich sofort hinschicken — es verteidigt dann aber
        nicht mehr den Raumhafen.
      </div>
    </div>`;
}

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
      ${/* ⚡ 26p: Hier MUSS die Unterversorgung stehen. Die Geschütz-Zahl oben ist bereits
            gedrosselt — ohne diese Zeile sucht man die fehlenden Punkte bei der Flotte,
            obwohl ein Generator-Ausbau sie zurückholt. Die Zeile ist der Unterschied
            zwischen „Verteidigung hält" und „Verteidigung hält nicht". */''}
      ${wrPowerFactor(m) < 1
        ? `<div class="wr-bad">⚡ Unterversorgt — deine Geschütze feuern mit
             ${Math.round(wrPowerFactor(m) * 100)} % (${wrFmt(wrPowerDemand(m))} /
             ${wrFmt(wrPowerSupply(m))} Energie). Voll versorgt wären es
             ${wrFmt(Math.round(wrTurretPower(m) / Math.max(0.01, wrPowerFactor(m))))}.</div>`
        : ''}
      ${wrHasTech(m, 'wt_e12')
        ? '<div class="wr-sub">📡 Frühwarn-Netz aktiv — du bekommst 30 Minuten mehr Vorlauf.</div>' : ''}
      <div class="${ok ? 'wr-good' : 'wr-bad'}">
        ${ok ? '→ Die Verteidigung sollte halten.'
             : `→ Zu schwach! Es fehlen ${wrFmt(w.strength - def)} Punkte.`}
        <span class="wr-sub"> Verluste ca. ${loss} % der Heimatflotte.</span>
      </div>
      <div class="wr-sub wr-wave-note">Eine Niederlage kostet dich <strong>keine</strong> Kolonien —
        aber ein Viertel deiner Rohstoffe, und Geschütze fallen für ${wrTechRepairH(m)} h aus.</div>
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
    // ⚠️ 27s: hier stand `typeof allMembers !== 'undefined'` — ein globales `allMembers`
    // gibt es in dieser App NIRGENDS (nur eine lokale Variable gleichen Namens in
    // db.js: registerUser). Die Bedingung war also immer falsch, und JEDE Hilferuf- und
    // Angriffsmeldung nannte „Ein Clan-Mitglied" statt eines Namens.
    // ⚠️ ÜBERTRAGBARE LEHRE: `typeof x !== 'undefined'` als Absicherung verwandelt einen
    // falschen Namen in einen stillen Rückfall. Der Code sieht robust aus und ist nur
    // dauerhaft wirkungslos — dieselbe Falle wie `wrAllUsers` in der IIFE (27s).
    const list = (typeof wrAllUsers === 'function') ? wrAllUsers() : [];
    return (list.find(x => x.id === id) || {}).name || 'Ein Clan-Mitglied';
  } catch (e) { return 'Ein Clan-Mitglied'; }
}

// ── Raumhafen: Ausbau + Geschütz-Slots ──────────────────────────────────────
// Die Geschütze wirken SOFORT (JP-Entscheidung Variante b): sie senken die Verluste aus
// Hinterhalten auf dem Rückweg. Ob ein Verband durchkommt, entscheidet dagegen allein
// seine eigene Kampfkraft — Geschütze stehen zu Hause.
// ── ⚡ Energie-Panel im Raumhafen (26p) ──────────────────────────────────────
// Pflicht-Anzeige: es gibt bewusst KEIN What's-New-Popup (JP), also muss die neue
// Mechanik an der Stelle erklärt sein, an der sie wirkt. Drei Dinge müssen sichtbar
// sein: Bedarf gegen Versorgung, was Unterversorgung konkret kostet, und wie man sie
// behebt.
// ⛽ Tankanzeige eines Reaktors — EINE Funktion für Hafen und Kolonie (26s).
// `planetId` null = Raumhafen. Bewusst mit den fertigen Mengen in den Knöpfen: die
// RPC klemmt server-seitig ohnehin auf Vorrat und freien Tankraum, aber ein Knopf mit
// einer Zahl, die dann nicht ankommt, wirkt wie ein Fehler.
function wrFuelHtml(m, pw, planetId) {
  if (!pw || typeof pw !== 'object' || !pw.type) return '';
  // ⚡ 27n: getankt wird der LAUFENDE Reaktor. Bei einer Umrüstung ist das der
  // Vorgänger — in SEINER Sorte. Vorher stand hier `pw.type`/`pw.level`, also der
  // bestellte Reaktor: der Knopf bot 🌀 an, wo 🟣 gebraucht wurde, und der Vorrat
  // verschwand in eine Baustelle.
  const live = wrGenLive(pw);
  if (!live) {
    // Echter Neubau: es gibt noch nichts zu betanken. Ohne diese Zeile stünde hier
    // ein Tank auf 0 mit aktiven Knöpfen — genau die Falle aus JPs Meldung.
    return `<div class="wr-nrg-msg wr-sub">⛽ Noch kein Tank — der Reaktor wird gerade
      erst gebaut. Betankt werden kann er, sobald er steht.</div>`;
  }
  const konv = wrGenConverting(pw);
  const lv   = live.level;
  const rate = wrGenFuelRate(live.type, lv);
  if (rate <= 0) {
    return `<div class="wr-nrg-msg wr-sub">⛽ Wartungsfrei — dieser Reaktortyp braucht keinen Treibstoff.</div>`;
  }
  const res  = wrGenFuelRes(live.type);
  const ic   = res === 'quantum' ? wrIc('qua') : wrIc('pla');
  const left = wrGenFuelLeft(pw), max = wrGenFuelMax(live.type, lv);
  const days = left / rate;
  const have = res === 'quantum' ? wrQuantum(m) : wrPlasmoid(m);
  const room = Math.max(0, Math.floor(max - left));
  const voll = Math.min(have, room);
  const wo   = planetId || '-';
  const dTxt = days >= 1 ? `${Math.floor(days)} Tage` : `${Math.max(0, Math.round(days * 24))} h`;
  return `
    <div class="wr-fuel ${left <= 0 ? 'wr-fuel-dry' : days < 3 ? 'wr-fuel-low' : ''}">
      ${/* ⚠️ Regel 4 (kein What's-New-Popup): die neue Regel steht dort, wo der Spieler
            auf sie trifft — im Panel, das die Kosten verursacht. */''}
      ${konv ? `<div class="wr-nrg-msg wr-sub">🔧 Umrüstung läuft — solange versorgt dich
        weiter der <strong>${_wrEsc(SPACE_POWER_BY_KEY[live.type]?.name || live.type)}</strong>
        auf Stufe ${lv}. Getankt wird deshalb ${ic} ${res === 'quantum' ? 'Quantenschaum' : 'Plasmoiden-Staub'},
        nicht die Sorte des neuen Reaktors. Sein Restvorrat verfällt, sobald der neue steht.</div>` : ''}
      <div class="wr-fuel-head">⛽ Tank: <strong>${wrFmt(Math.round(left))}</strong> ${ic}
        <span class="wr-sub">von ${wrFmt(max)} · Verbrauch ${wrFmt(rate)} / Tag · reicht ${dTxt}</span></div>
      <div class="wr-fuel-bar"><div class="wr-fuel-fill" style="width:${max > 0 ? Math.min(100, Math.round(left / max * 100)) : 0}%"></div></div>
      ${left <= 0
        ? `<div class="wr-nrg-msg wr-bad">⛽ Tank leer — der Reaktor liefert nichts, es zählt nur die Grundversorgung.</div>`
        : days < 3
          ? `<div class="wr-nrg-msg wr-sub">⚠️ Reicht nur noch ${dTxt} — nachtanken, bevor die Geschütze drosseln.</div>`
          : ''}
      <div class="wr-fuel-btns">
        <button class="wr-btn wr-btn-sm" data-wr-refuel="${wo}:${Math.min(have, rate * 7)}"
          ${(have >= 1 && room >= 1) ? '' : 'disabled'}>7 Tage tanken
          <span class="wr-btn-sub">${wrFmt(Math.min(have, rate * 7, room))} ${ic}</span></button>
        <button class="wr-btn wr-btn-sm" data-wr-refuel="${wo}:${voll}"
          ${voll >= 1 ? '' : 'disabled'}>Volltanken
          <span class="wr-btn-sub">${wrFmt(voll)} ${ic}</span></button>
      </div>
      ${have < 1 ? `<div class="wr-nrg-msg wr-sub">Kein ${res === 'quantum' ? 'Quantenschaum' : 'Plasmoiden-Staub'} im Lager.</div>` : ''}
    </div>`;
}

function wrPowerHtml(m, canPay, priceTxt) {
  const dem = wrPowerDemand(m), sup = wrPowerSupply(m), fac = wrPowerFactor(m);
  const gen = wrPowerGen(m), def = wrPowerGenDef(m);
  const glv = wrPowerGenLevel(m);
  const lv  = wrBaseLevel(m);
  // Balkenbreite: der Bedarf im Verhältnis zur Versorgung, gedeckelt bei 100 %.
  const pct = sup > 0 ? Math.min(100, Math.round(dem / sup * 100)) : 100;

  // Der bestehende Generator: Ausbau bis Stufe 3, danach Umrüsten auf den nächsten Typ.
  let genHtml;
  if (gen && def) {
    // ⚡ 27n: die Ausgabe gehört zum LAUFENDEN Reaktor. Während einer Umrüstung ist das
    // der Vorgänger — `def` bleibt der bestellte, damit die Baumarke sagt, WORAUF
    // umgerüstet wird. Zwei Rollen, zwei Variablen: genau die Lehre aus 26u
    // („was der Bauplatz KANN" gegen „was bestellt ist").
    const live  = wrGenLive(gen);
    const lDef  = live ? SPACE_POWER_BY_KEY[live.type] : null;
    const st    = live ? wrPowerStats(live.type, live.level) : null;
    const up  = glv < WR_POWER_MAX ? wrPowerStats(def.key, glv + 1) : null;
    const zie = SPACE_POWER.filter(g => g.out[1] > def.out[1] && wrPowerUnlocked(m, g.key));
    genHtml = `
      <div class="wr-gen wr-gen-full">
        <div class="wr-gen-art" data-wr-geninfo="${def.key}" title="Groß ansehen">
          <img src="assets/${def.folder}/${def.art}.png" alt=""
            onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
          ><span class="wr-gen-fb">${def.icon}</span><span class="wr-zoom-hint">🔍</span></div>
        <div class="wr-gen-info">
          <div class="wr-gen-name">${_wrEsc((lDef || def).name)}
            <span class="wr-sub">Stufe ${live ? live.level : glv}${
              (live && live.type !== def.key) ? ` · 🔧 Umrüstung auf ${_wrEsc(def.name)} läuft` : ''}</span></div>
          <div class="wr-gen-out">⚡ ${wrFmt(st ? st.output : 0)} Ausgabe
            <span class="wr-sub">+ ${wrFmt(WR_POWER_BASE_SUPPLY + lv * WR_POWER_PER_LEVEL)} Grundversorgung des Hafens</span></div>
          ${wrFuelHtml(m, gen, null)}
          ${wrSlotBuilding(gen) ? wrBuildBadgeHtml(gen) : (up
            ? `<button class="wr-btn wr-btn-sm" id="wr-power-up" ${canPay(up) ? '' : 'disabled'}
                 >Auf Stufe ${glv + 1} ausbauen
                 <span class="wr-btn-sub">${priceTxt(up)} → ⚡ ${wrFmt(up.output)}</span></button>`
            : '<div class="wr-slot-max">✅ Vollausbau erreicht</div>')}
          ${zie.length ? `<div class="wr-slot-conv">${zie.map(g => {
            const p = wrPowerConvertPrice(m, g.key);
            // Gleicher Bauplan wie beim Geschütz-Umrüsten (26k) — vier gestapelte
            // Zeilen. ⚠️ Meldungs-Klassen NIE in den Button verschachteln.
            return `<button class="wr-btn wr-btn-sm wr-btn-conv" data-wr-genconv="${g.key}"
                      ${canPay(p) ? '' : 'disabled'}>
              <span class="wr-conv-name">⬆️ ${_wrEsc(g.name)}</span>
              <span class="wr-conv-line">${priceTxt(p)}</span>
              ${p.rebate > 0 ? `<span class="wr-conv-save">−${wrFmt(p.rebate)} CC angerechnet</span>` : ''}
              <span class="wr-conv-line">→ ⚡ ${wrFmt(p.output)} · zurück auf Stufe 1</span>
            </button>`;
          }).join('')}</div>` : ''}
        </div>
      </div>`;
  } else {
    // Noch kein Kraftwerk: alle drei Typen anbieten, gesperrte mit dem GRUND.
    genHtml = `<div class="wr-gen-opts">${SPACE_POWER.map(g => {
      const st   = wrPowerStats(g.key, 1);
      const frei = wrPowerUnlocked(m, g.key);
      const txt  = frei ? priceTxt(st)
                        : `🔒 Forschung „${_wrEsc(wrTechName(g.needs))}" (${_wrEsc(wrTechRef(g.needs))})`;
      return `
        <div class="wr-slot-opt${frei ? '' : ' wr-slot-opt-lock'}">
          <span class="wr-slot-opt-art wr-ship-zoom" data-wr-geninfo="${g.key}" title="Groß ansehen">
            <img src="assets/${g.folder}/${g.art}.png" alt=""
              onerror="this.parentNode.classList.add('wr-art-fail');this.remove()"
            ><span class="wr-slot-opt-fb">${g.icon}</span><span class="wr-zoom-hint">🔍</span></span>
          <span class="wr-slot-opt-txt">
            <span class="wr-slot-opt-n">${_wrEsc(g.name)}</span>
            <span class="wr-slot-opt-a">⚡ ${wrFmt(g.out[1])} / ${wrFmt(g.out[2])} / ${wrFmt(g.out[3])}</span>
            <span class="wr-slot-opt-p">${txt}</span>
          </span>
          <button class="wr-btn wr-btn-sm" data-wr-genbuild="${g.key}"
            ${(frei && canPay(st)) ? '' : 'disabled'}>Bauen</button>
        </div>`;
    }).join('')}</div>`;
  }

  return `
    <div class="wr-card wr-card-power">
      <div class="wr-card-title">⚡ Energieversorgung
        <span class="wr-sub">— Geschütze brauchen Strom</span></div>
      <div class="wr-nrg-bar ${dem > sup ? 'wr-nrg-short' : ''}">
        <div class="wr-nrg-fill" style="width:${pct}%"></div>
      </div>
      <div class="wr-facts">
        <span>Bedarf: <strong>${wrFmt(dem)}</strong></span>
        <span>Versorgung: <strong>${wrFmt(sup)}</strong></span>
        <span>Wirkung: <strong class="${fac < 1 ? 'wr-bad' : 'wr-good'}">${Math.round(fac * 100)} %</strong></span>
      </div>
      ${fac < 1
        ? `<div class="wr-bad">⚡ Unterversorgt — deine Geschütze feuern mit
             ${Math.round(fac * 100)} % (es fehlen ${wrFmt(dem - sup)} Energie).
             <span class="wr-sub">Ein Generator-Ausbau behebt das sofort.</span></div>`
        : `<div class="wr-sub">Alles versorgt. Noch ${wrFmt(Math.max(0, sup - dem))} Energie frei —
             so viel kannst du zubauen, bevor die Feuerkraft sinkt.</div>`}
      ${genHtml}
      <div class="wr-sub">Die Wirkung sinkt nie unter ${Math.round(WR_POWER_FLOOR * 100)} %:
        ein Fehlkauf kann dich schwächen, aber nie wehrlos machen.</div>
    </div>`;
}

function wrHafenHtml(m) {
  const lv    = wrBaseLevel(m);
  const def   = wrPortDef(lv);
  const next  = lv < 3 ? wrPortDef(lv + 1) : null;
  const tur   = wrTurrets(m);
  const power = wrTurretPower(m);
  const coins = parseFloat(m?.coins) || 0;
  // 26k: Plasmoid ist die vierte Kostenart · 26p: Quantenschaum die fünfte.
  const canPay = (c) => coins >= c.cc && wrErz(m) >= c.erz && wrKristall(m) >= c.kristall
                     && wrPlasmoid(m) >= (c.plasmoid || 0) && wrQuantum(m) >= (c.quantum || 0);
  const priceTxt = wrPreisTxt;                       // 27p: eine Fassung fuer alle

  // ⚡ Energie (26p) — einmal oben gerechnet, damit Panel, Bauplätze und die
  // Bau-Vorschau garantiert DIESELBE Momentaufnahme zeigen.
  const eDem = wrPowerDemand(m), eSup = wrPowerSupply(m), eFac = wrPowerFactor(m);
  const eShort = eDem > eSup;

  let slots = '', belegt = 0;
  for (let i = 0; i < def.slots; i++) {
    const key = 'g' + i;
    const cur = tur[key];
    if (cur && typeof cur === 'object' && SPACE_TURRET_BY_KEY[cur.type]) belegt++;
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
            : `🛡️ ${wrFmt(st.atk)}${eFac < 1 ? ` <span class="wr-bad">→ ${wrFmt(Math.round(st.atk * eFac))}</span>` : ''}`}</div>
          ${/* ⚡ 26p: Jeder Bauplatz zeigt seinen Bedarf — sonst ist nicht rechenbar,
                was ein weiteres Geschütz kostet. Ein beschädigtes zieht keine Energie. */''}
          <div class="wr-slot-nrg">⚡ ${dmg ? '<span class="wr-sub">0 (beschädigt)</span>'
            : wrFmt(Math.round(wrTurretEnergy(cur.type, clv)))}</div>
          ${wrSlotBuilding(cur) ? wrBuildBadgeHtml(cur) : (up
            ? `<button class="wr-btn wr-btn-sm" data-wr-tup="${key}" ${canPay(up) ? '' : 'disabled'}
                 >Aufrüsten <span class="wr-btn-sub">${priceTxt(up)} → 🛡️ ${wrFmt(up.atk)}</span></button>`
            : '<div class="wr-slot-max">✅ Vollausbau</div>')}
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
              <span class="wr-slot-opt-a">🛡️ ${wrFmt(st.atk)} · ⚡ ${wrFmt(Math.round(wrTurretEnergy(t.key, 1)))}</span>
              <span class="wr-slot-opt-p">${grund}</span>
              ${/* ⚡ 26p: WARNEN, BEVOR der Bau die Versorgung reisst (Plan §4). Ohne
                    diese Zeile sähe der Spieler erst nach dem Kauf, dass alle seine
                    Geschütze schwächer feuern — die schlimmste Variante. */''}
              ${(() => {
                const nach = eDem + Math.round(wrTurretEnergy(t.key, 1));
                if (!ok || nach <= eSup) return '';
                return `<span class="wr-slot-opt-nrg wr-bad">⚡ Danach ${wrFmt(nach)} / ${wrFmt(eSup)}
                  — alle Geschütze feuern mit ${Math.round(Math.max(WR_POWER_FLOOR, eSup / nach) * 100)} %</span>`;
              })()}
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
          ${/* ⚡ 26p: Die Feuerkraft daneben IST bereits gedrosselt. Ohne diesen Hinweis
                wirkt der gesunkene Wert wie ein Fehler — der Spieler sucht ihn bei den
                Geschützen, nicht beim Strom. */''}
          ${eShort
            ? `<div class="wr-bad">⚡ Unterversorgt: ${wrFmt(eDem)} / ${wrFmt(eSup)} —
                 die Feuerkraft oben ist bereits auf ${Math.round(eFac * 100)} % gedrosselt.</div>`
            : `<div class="wr-sub">⚡ Energie ${wrFmt(eDem)} / ${wrFmt(eSup)} — versorgt.</div>`}
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
    </div>
    ${/* 📂 Bauplätze als eigener Klapp-Abschnitt (JP 2026-07-30). Sechs Slots mit
          Bau-Optionen sind der längste Block des Tabs und werden selten geändert —
          zugeklappt steht in der Kopfzeile trotzdem alles Entscheidende: wie viele Plätze
          belegt sind, die Feuerkraft und die Energielage. */''}
    ${wrSecCard('turrets',
      `${wrIc("def")} Geschütze`,
      `${belegt}/${def.slots} belegt · 🛡️ ${wrFmt(power)} · ⚡ ${wrFmt(eDem)}/${wrFmt(eSup)}`
        + (eShort ? ' <span class="wr-bad">unterversorgt</span>' : ''),
      `<div class="wr-slots">${slots}</div>`)}
    ${/* ⚡ Das Energie-Panel steht bewusst DIREKT unter den Bauplätzen: dort entsteht der
          Bedarf, dort wird die Entscheidung getroffen. */''}
    ${wrPowerHtml(m, canPay, priceTxt)}
    ${wrMercHtml(m)}`;
}

// ── 🎖️ Söldner-Geschwader (26x) ─────────────────────────────────────────────
// Drei feste Grössen statt eines freien Zusammenstellers: der Zweck ist eine SCHNELLE
// Entscheidung im Vorwarnfenster, nicht Flottenplanung. Wer frei wählen will, baut selbst.
const WR_MERC_SQUADS = [
  // ⚠️ NICHT 🔫 verwenden: das Zeichen rendert auf iOS und Android als WASSERPISTOLE
  // (Apple hat es 2016 umgestellt, Google 2018 nachgezogen). Auf JPs Handy stand also
  // eine Wasserpistole vor dem Söldner-Geschwader. Die drei Symbole steigern sich
  // stattdessen als Wache → Schild → Schwerter.
  { key: 'klein',  icon: '💂', name: 'Streifengeschwader', ships: { jaeger: 15, fregatte: 3 } },
  { key: 'mittel', icon: '🛡️', name: 'Schutzverband',      ships: { jaeger: 30, fregatte: 8, kreuzer: 2 } },
  { key: 'gross',  icon: '⚔️', name: 'Kriegsflotte',        ships: { jaeger: 50, fregatte: 15, kreuzer: 6, schlachtschiff: 2 } },
];

function wrMercHtml(m) {
  const aktiv = wrMercActive(m);
  const coins = parseFloat(m?.coins) || 0;
  const mc    = wrMerc(m);
  let body = '', sum = '';

  if (aktiv) {
    const left  = wrMercLeftMs(m);
    const std   = Math.floor(left / 3600000);
    const rest  = std >= 24 ? `${Math.floor(std / 24)} d ${std % 24} h` : `${std} h`;
    const liste = Object.entries(mc.ships || {})
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${wrFmt(n)}× ${_wrEsc(SPACE_SHIP_BY_KEY[k]?.name || k)}`).join(' · ');
    // Wo steht das Geschwader? ⚠️ Entweder Hafen ODER eine Kolonie — nie beides. Genau
    // diese Entscheidung ist der taktische Gehalt; deshalb steht sie ganz oben.
    const wache = mc.guard
      ? ((_wrGalaxy?.planets || []).find(p => p.id === mc.guard)?.name || 'unbekannt')
      : null;
    const kolonien = (_wrGalaxy?.planets || []).filter(p => p.colonized_by === m?.id);
    sum = `${wrFmt(wrMercCount(m))} Schiffe · noch ${rest} · `
        + (wache ? `bewacht ${_wrEsc(wache)}` : 'am Raumhafen');
    body = `
      <div class="wr-merc-run">
        <div class="wr-sub">${liste}</div>
        <div class="wr-sub">⏳ Läuft noch <strong>${rest}</strong> — danach verfällt das
          Geschwader ersatzlos. Verluste im Gefecht werden nicht erstattet.</div>
        <div class="wr-merc-guard">
          <span class="wr-sub"><strong>Standort:</strong> Ein Geschwader kann nur an EINEM
            Ort verteidigen.</span>
          <button class="wr-btn wr-btn-sm${mc.guard ? '' : ' wr-btn-on'}"
                  data-wr-merc-guard="">🛰️ Raumhafen</button>
          ${kolonien.map(p => `
            <button class="wr-btn wr-btn-sm${mc.guard === p.id ? ' wr-btn-on' : ''}"
                    data-wr-merc-guard="${p.id}">🏙️ ${_wrEsc(p.name)}</button>`).join('')}
        </div>
      </div>`;
  } else {
    sum = 'kein Geschwader — anheuerbar';
    body = `
      <div class="wr-sub">Gemietete Kampfkraft für <strong>${WR_MERC_DAYS} Tage</strong>.
        Söldner verteidigen sofort, aber sie fliegen keine Einsätze, lassen sich nicht
        stationieren und nicht in Mutterschiff-Rümpfe einlösen — man mietet Bereitschaft,
        keinen Besitz.</div>
      <div class="wr-merc-list">
        ${WR_MERC_SQUADS.map(s => {
          const preis = wrMercPrice(s.ships);
          const liste = Object.entries(s.ships)
            .map(([k, n]) => `${n}× ${_wrEsc(SPACE_SHIP_BY_KEY[k]?.name || k)}`).join(' · ');
          return `
            <div class="wr-merc-row">
              <span class="wr-merc-ic">${s.icon}</span>
              <span class="wr-merc-txt"><strong>${_wrEsc(s.name)}</strong>
                <span class="wr-sub">${liste}</span></span>
              <button class="wr-btn wr-btn-sm${coins >= preis ? '' : ' wr-btn-off'}"
                      data-wr-merc="${s.key}">Anheuern
                <span class="wr-btn-sub">${wrFmt(preis)} CC</span></button>
            </div>`;
        }).join('')}
      </div>`;
  }
  return wrSecCard('merc', '🎖️ Söldner', sum, body);
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
  // ⚠️ HIER LAG DER EIGENTLICHE FEHLER (JP 2026-07-30: „reagiert weiterhin nicht"):
  //     parseInt(_wrRouteSel?.[rkey], 10) ?? cur
  // `??` fängt nur null/undefined — `parseInt(undefined, 10)` liefert aber **NaN**, und
  // NaN ist keins von beidem. Solange für diesen Planeten noch nichts vorgewählt war,
  // stand deshalb `sel = NaN`:
  //   • die Anzahl zeigte „NaN“,
  //   • beide Stepper-Knöpfe waren aktiv (jeder Vergleich mit NaN ist false),
  //   • und der Bestätigungsknopf trug `data-wr-routeset="<id>:NaN:wreck"` — der Klick
  //     lief damit ins Leere, es passierte sichtbar NICHTS.
  // Der Klick auf + hat also immer funktioniert und `_wrRouteSel` korrekt hochgezählt
  // (der Handler rechnet ohne parseInt); nur die ANZEIGE war von Anfang an kaputt.
  // ⚠️ MERKE: `parseInt(...) ?? fallback` ist immer falsch — `??` rettet nicht vor NaN.
  // Richtig ist `Number.isFinite()` (oder `|| fallback`, wenn 0 kein gültiger Wert ist —
  // hier ist 0 gültig: „Route auflösen").
  const wunsch = parseInt(_wrRouteSel?.[rkey], 10);
  const sel  = Math.max(0, Math.min(cur + free, Number.isFinite(wunsch) ? wunsch : cur));
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
  // ⚠️ 27y: VIER Töpfe statt zwei. Eine 🟣/🌀-Route buchte ihren Ertrag bisher auf
  // `pendKri` — der Einsammeln-Knopf zählte Plasmoiden als Kristall —, und die
  // Ring-Boni pla/qua einer Bergungsroute (die `wrRoutePending` seit 26o mitliefert)
  // fielen in der Summe ganz unter den Tisch.
  let rows = '', pendErz = 0, pendKri = 0, pendPla = 0, pendQua = 0, fuelSum = 0, perDayFuel = 0;
  let dayErz = 0, dayKri = 0, dayPla = 0, dayQua = 0;   // Tagesleistung aller Routen
  for (const rk of keys) {
    const r = routes[rk];
    const wreck = r.mode === 'wreck';
    const planet = wrPlanetById(r.planetId || rk.replace(/:w$/, ''));
    const pd = wrRoutePending(r, planet);
    const cnt = parseInt(r.count, 10) || 0;
    perDayFuel += wrRouteFuel(cnt);
    fuelSum += pd.fuel;
    // ⚠️ 27y — JP 2026-08-21: „bei der Übersicht Dauerernte-Bergung werden immer +0
    // Rohstoffe angezeigt, warum?"
    // BEFUND: Die Zahl war RICHTIG und trotzdem wertlos. `wrAutoHarvest()` sammelt seit
    // 2026-07-22 bei JEDEM Öffnen des 🚀-Tabs automatisch ein (gedrosselt auf 10 Min)
    // und rückt dabei `lastClaim` auf jetzt. Wer diese Karte ansieht, liest den Stand
    // von Sekunden nach dem Einsammeln — also 0. Immer.
    //   ⚠️ ÜBERTRAGBARE LEHRE: Wenn eine AUTOMATIK eine Größe genau in dem Moment
    //   zurücksetzt, in dem der Spieler sie liest, ist nicht der Wert kaputt, sondern
    //   die WAHL DER KENNZAHL. Anzeigen, was sich durch das Einsammeln nicht ändert.
    // Rechts steht deshalb jetzt die TAGESLEISTUNG; das Aufgelaufene kommt als Zusatz
    // nur dazu, wenn wirklich etwas liegt.
    const day = { erz:0, kri:0, pla:0, qua:0 };
    let amtTxt;
    if (wreck) {
      pendErz += pd.erz; pendKri += pd.kri;
      pendPla += pd.pla || 0; pendQua += pd.qua || 0;
      const wrate = wrWreckRate(cnt);
      const wRing = parseInt(planet?.ring, 10) || 0;
      day.erz = wrate * WR_WRECK_ERZ;
      day.kri = wrate * WR_WRECK_KRI;
      day.pla = wRing >= WR_RING_LOOT.plaRing ? wrate * WR_RING_LOOT.wreckPla : 0;
      day.qua = wRing >= WR_RING_LOOT.quaRing ? wrate * WR_RING_LOOT.wreckQua : 0;
    } else {
      const t = r.type;
      if      (t === 'erz')      pendErz += pd.amount;
      else if (t === 'plasmoid') pendPla += pd.amount;
      else if (t === 'quantum')  pendQua += pd.amount;
      else                       pendKri += pd.amount;
      pendErz += pd.sideErz || 0;
      pendKri += pd.sideKri || 0;
      // Spiegel von wrRoutePending: Ring-Routen werfen zusätzlich 50 % Erz und
      // 25 % davon als Kristall ab.
      const rate = wrRouteRate(t, r.richness, cnt);
      const ring = (t === 'plasmoid' || t === 'quantum');
      day.erz = (t === 'erz' ? rate : 0) + (ring ? rate * 0.5 : 0);
      day.kri = (t === 'kristall' ? rate : 0) + (ring ? rate * 0.5 * 0.25 : 0);
      day.pla = t === 'plasmoid' ? rate : 0;
      day.qua = t === 'quantum'  ? rate : 0;
    }
    dayErz += day.erz; dayKri += day.kri; dayPla += day.pla; dayQua += day.qua;
    const bereit = wreck
      ? (pd.erz + pd.kri + (pd.pla || 0) + (pd.qua || 0))
      : (pd.amount + (pd.sideErz || 0) + (pd.sideKri || 0));
    amtTxt = (wrResListe(day, '/Tag') || '—')
           + (bereit > 0
                ? `<span class="wr-sub">${wrFmt(bereit)} liegen bereit</span>`
                : '<span class="wr-sub">gerade eingesammelt</span>');
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
  const pending = pendErz + pendKri + pendPla + pendQua;
  const tagTxt  = wrResListe({ erz: dayErz, kri: dayKri, pla: dayPla, qua: dayQua }, '/Tag');
  return `
    <div class="wr-card">
      <div class="wr-card-title">🛰️ Dauerernte &amp; Bergung
        <span class="wr-sub">— stationierte Schiffe verteidigen den Hafen NICHT mit</span></div>
      <div class="wr-sub" style="padding-bottom:4px">Ein Wrackfeld ist <strong>endlich und
        geteilt</strong> — ein Mitspieler kann schneller abbauen, dann ist es früher leer als
        prognostiziert.</div>
      ${rows}
      <div class="wr-facts">
        <span>Ertrag: <strong>${tagTxt || '—'}</strong></span>
        <span>Treibstoff: <strong>${wrFmt(perDayFuel)} ${wrIc('kri')}/Tag</strong></span>
        <span>Vorrat reicht: <strong>${reach > 99 ? '99+' : reach} Tage</strong></span>
      </div>
      <div class="wr-sub">Beim Öffnen des 🚀-Tabs wird automatisch eingesammelt (höchstens
        alle 10 Minuten). Rechts steht deshalb die <strong>Tagesleistung</strong> — der
        aufgelaufene Rest ist meist längst abgeholt und stünde sonst dauerhaft auf 0.</div>
      ${short
        ? `<div class="wr-warn">${wrIc('kri')} Der Kristall reicht nicht für den ganzen Zeitraum — die Routen
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
  let sumCc = 0, sumErz = 0, sumKri = 0, sumPla = 0, sumQua = 0, maxMin = 0, items = 0;
  for (const sp of SPACE_SHIPS) {
    if (sp.special) continue;                 // 🛸 Flaggschiff: eigener Bauweg, nie im Korb
    const n = parseInt(cart[sp.key], 10) || 0;
    if (n < 1) continue;
    const c = wrShipCost(sp, m, n);
    sumCc += c.cc; sumErz += c.erz; sumKri += c.kristall;
    sumPla += c.plasmoid; sumQua += c.quantum;
    maxMin = Math.max(maxMin, wrShipBuildMin(sp, m, n));
    items += n;
  }
  const affordCart = coins >= sumCc && wrErz(m) >= sumErz && wrKristall(m) >= sumKri
                  && wrPlasmoid(m) >= sumPla && wrQuantum(m) >= sumQua;
  // Handover §8: „fehlt ein Rohstoff, wird BENANNT welcher und wie viel fehlt" — kein
  // generisches „nicht genug Ressourcen". Der Server meldet nur `insufficient_<art>`;
  // die Menge kennt an dieser Stelle ohnehin nur der Client.
  const fehlt = [];
  if (coins < sumCc)            fehlt.push(`${wrFmt(sumCc - coins)} CC`);
  if (wrErz(m) < sumErz)        fehlt.push(`${wrFmt(sumErz - wrErz(m))} ${wrIc('erz')}`);
  if (wrKristall(m) < sumKri)   fehlt.push(`${wrFmt(sumKri - wrKristall(m))} ${wrIc('kri')}`);
  if (wrPlasmoid(m) < sumPla)   fehlt.push(`${wrFmt(sumPla - wrPlasmoid(m))} ${wrIc('pla')}`);
  if (wrQuantum(m) < sumQua)    fehlt.push(`${wrFmt(sumQua - wrQuantum(m))} ${wrIc('qua')}`);

  let rows = '';
  for (const s of SPACE_SHIPS) {
    if (s.special) continue;                  // 🛸 Flaggschiff: siehe wrMutterHtml
    const unlocked = !!research[s.needs];
    const have  = wrShipCount(m, s.key);
    const busy  = wrYardHasJob(m, s.key);
    const n     = parseInt(cart[s.key], 10) || 0;
    const unit  = wrShipCost(s, m, 1);
    // §3.1: echte Assets statt 🪨/💎 in der Kostenzeile. wrIc() liefert das Bild mit
    // Emoji-Rückfall — bewusst KEIN neuer Helfer (der existierende kann das seit 26c,
    // und eine zweite Symboltabelle hat zuletzt die Wasserpistole zurückgebracht).
    const price = [`${wrFmt(unit.cc)} CC`]
      .concat(unit.erz      ? [`${unit.erz} ${wrIc('erz')}`] : [])
      .concat(unit.kristall ? [`${unit.kristall} ${wrIc('kri')}`] : [])
      .concat(unit.plasmoid ? [`${unit.plasmoid} ${wrIc('pla')}`] : [])
      .concat(unit.quantum  ? [`${unit.quantum} ${wrIc('qua')}`] : []).join(' · ');
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
                 .concat(yNext.erz ? [`${yNext.erz} ${wrIc('erz')}`] : [])
                 .concat(yNext.kristall ? [`${yNext.kristall} ${wrIc('kri')}`] : []).join(' · ')}
                 → ${wrYardDef(yl + 1).slots} Hellingen (statt ${wrYardDef(yl).slots}),
                 −${Math.round(yNext.timeCut * 100)} % Bauzeit, −${Math.round(yNext.costCut * 100)} % Kosten</span></button>`
          : '<div class="wr-slot-max">✅ Werft voll ausgebaut</div>'}
      </span>
    </div>
    ${jobHtml}
    ${/* ⚠️ 27u: DIESER SATZ WAR ZWEIMAL FALSCH (JP 2026-08-20: „es steht noch Grundzeit
          und +1 Minute je Stück").
          ① Die Formel „+1 Minute je Stück" gilt seit 26u nicht mehr — sie hat drei
             Regeländerungen (26u, 27r, 27t, 27u) unbemerkt überlebt. Ein Regeltext, der
             beim Ändern der Regel nicht mitgesucht wird, altert still weiter.
          ② Schlimmer: „Jeder Schiffstyp bekommt eine eigene HELLING" benutzte dasselbe
             Wort für etwas anderes — dort waren die parallelen AUFTRÄGE je Schiffstyp
             gemeint, seit 27u sind Hellingen die parallelen RÜMPFE INNERHALB eines
             Auftrags. Zwei Dinge unter einem Namen: genau das Muster, das hier schon
             zwei „Garnisonen" (26v/27k) und zwei Symboltabellen erzeugt hat. Der
             Schiffstyp bekommt ab jetzt einen eigenen AUFTRAG, nicht eine Helling. */''}
    <div class="wr-sub wr-job-note">Deine Werft hat
      <strong>${wrYardSlots(m)} Hellingen</strong> — so viele Rümpfe wachsen gleichzeitig.
      Der erste kostet die volle Grundzeit, jeder weitere verlängert den Durchgang um
      <strong>ein ${wrYardSlots(m) === 2 ? 'Halb' : wrYardSlots(m) === 3 ? 'Drittel' : 'Viertel'}</strong>
      davon. <strong>Aufteilen lohnt nie</strong> — jeder zusätzliche Auftrag kostet eine
      Anlaufzeit extra, ein einziger ist immer der günstigste Weg.
      Jeder Schiffstyp läuft als <strong>eigener Auftrag</strong> daneben.</div>
    ${rows}
    ${wrMutterHtml(m)}
    ${items > 0
      ? `<div class="wr-cart">
           <div class="wr-cart-sum">
             <span>${wrIc("yard")} <strong>${wrFmt(items)}</strong> Schiff(e) eingeplant</span>
             <span>${[`${wrFmt(sumCc)} CC`]
               .concat(sumErz ? [`${wrFmt(sumErz)} ${wrIc('erz')}`] : [])
               .concat(sumKri ? [`${wrFmt(sumKri)} ${wrIc('kri')}`] : [])
               .concat(sumPla ? [`${wrFmt(sumPla)} ${wrIc('pla')}`] : [])
               .concat(sumQua ? [`${wrFmt(sumQua)} ${wrIc('qua')}`] : []).join(' · ')}</span>
             <span>⏱️ ${wrDur(maxMin)}</span>
           </div>
           <div class="wr-cart-act">
             <button class="wr-btn wr-btn-go" id="wr-cart-buy" ${affordCart ? '' : 'disabled'}>
               🏗️ Bauauftrag erteilen</button>
             <button class="wr-btn wr-btn-sm" id="wr-cart-clear">Verwerfen</button>
           </div>
           ${affordCart ? '' : `<div class="wr-warn">Es fehlt: ${fehlt.join(' · ')}.</div>`}
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
  const priceTxt = wrPreisTxt(c);                    // 27p
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
// ⚠️ 27l: „Gab es hier je ein Wrackfeld?" ist NICHT dasselbe wie „liegt noch etwas da?".
// `wrWreckLeft` klemmt beides auf 0 — ein Planet ohne Feld (`wreck_left` = null) und ein
// leergeräumtes Feld (`wreck_left` = 0) sind danach ununterscheidbar. Genau deshalb stand
// im Planeten-Kopf auf JEDEM befreiten Planeten „Das Wrackfeld ist vollständig abgetragen",
// auch auf solchen, die nie eines hatten — eine Behauptung über einen Ertrag, den es nie gab.
// Handover §4 verlangt ausdrücklich Toleranz gegen null/undefined; hier ist sie.
function wrHadWreck(p) {
  return p != null && p.wreck_left !== null && p.wreck_left !== undefined
      && !Number.isNaN(parseFloat(p.wreck_left));
}

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
// ⚠️ SPIEGEL von build_space_cart (27i). Weicht eine Zahl ab, zeigt die Vorschau etwas
// anderes an, als der Server abbucht. Plasmoid/Quantenschaum laufen über denselben
// Rabatt- und rescost-Pfad wie Erz/Kristall — genau wie in build_mutterschiff (26j),
// das dieses Fünf-Rohstoff-Muster seit Juli vormacht.
// `|| 0` auf allen Posten: ein Schiff ohne `plasmoid`-Feld darf nichts werfen (Regel 3).
function wrShipCost(s, m, count) {
  const cut = wrYardDef(wrYardLevel(m)).costCut, n = count || 1;
  const res = wrTechResCost(m);
  return {
    cc:       Math.round((s.cc || 0)       * (1 - cut) * n),
    erz:      Math.round((s.erz || 0)      * (1 - cut) * n * res),
    kristall: Math.round((s.kristall || 0) * (1 - cut) * n * res),
    plasmoid: Math.round((s.plasmoid || 0) * (1 - cut) * n * res),
    quantum:  Math.round((s.quantum || 0)  * (1 - cut) * n * res),
  };
}
// ⚠️ JP-Formel: Grundzeit + 1 Minute JE STÜCK — nicht Grundzeit × Stück.
// 2 Sonden = 10 + 2 = 12 Min. Serienbau lohnt sich dadurch massiv; die Bremse
// sind die Kosten, nicht die Uhr. Spiegel von build_space_cart —
// inkl. A4 Orbitalwerft (_space_tech_buildtime), die hier ebenfalls fehlte.
// ⚠️ BALANCE 26u (Plan B.1.3): Stückzuschlag war „Grundzeit + 1 Minute je Stück" — bei
// 7 Tagen Grundzeit bedeutungslos. Dann: +2 % der Grundzeit je ZUSÄTZLICHEM Stück.
// ⚠️ BALANCE 27r → **27t ERSETZT SIE** (JP 2026-08-20). 27r hob Grundzeiten UND Zuschlag
// an; beides ist zurückgenommen bzw. ersetzt.
//   ⚠️ JPs sechs gemeldete Zeiten (30 Jäger 1:18, 20 Große 2:17, Kutter 2:17, Komet 3:02,
//   Bergungsschiff 3:02, 1 Fregatte 3:18) beschreiben den Stand VOR 27r — sie passen alle
//   exakt auf die ALTE Formel. Eindeutiger Beleg ist die Fregatte, weil dort kein
//   Stückzuschlag mitspielt: 3:18 = 198 min = 360 × 0,55 (mit 27r wären es 297 min).
//   JP hat 27r danach eingespielt und bestätigt: „gr. Jäger hat nun 2:45" = 300 × 0,55.
//   ⚠️ ÜBERTRAGBARE LEHRE: Eine Balance-Meldung ist immer auch eine MESSUNG — und sie hat
//   einen ZEITPUNKT. Erst prüfen, welche Formel die genannten Zahlen erzeugt; das sagt,
//   GEGEN WELCHEN STAND gemeldet wurde. Ein Einzelstück ohne Zuschlag ist der beste
//   Prüfstein, denn die Grundzeit darin verrät die Version.
//
// 27t (JPs Vorschlag): **Zinseszins statt fester Erhöhung.**
//     zeit = grundzeit × 1,10^min(n−1, 9) × 1,04^max(0, n−10)
// JPs Reihe stimmt damit exakt: 100 · 110 · 121 · 133 · 146 …
// ⚠️ NICHT durchgehend 10 %: 1,10^49 = 106 — 50 Jäger wären 3,7 Tage, eine Dunkle
// Röstung über vier Monate. `build_space` lässt 50 Stück zu, das ist kein Randfall.
// ⚠️ NICHT gedeckelt: ein harter Deckel macht Stück 25 und 50 gleich teuer, dann bestellt
// man immer 50. Die zweite Stufe hält die Kurve MONOTON — jedes Schiff kostet weiter Zeit,
// nur nicht mehr exponentiell. Und sie hat eine Begründung, die zur Sache passt: eine
// lange Serie wird ROUTINE, die ersten zehn Rümpfe sind die teuren.
// ⚠️ Die Grundzeiten sind bewusst wieder die alten: zwei Hebel für eine Wirkung sind einer
// zu viel, und höhere Grundzeiten treffen das EINZELNE Schiff im frühen Spiel — genau das,
// was JP geschützt sehen wollte („die ersten Wächter kreuzen zu früh auf"). Einzelstücke
// kosten deshalb exakt so viel wie heute.
// Spiegel von `_space_ship_build_min_n` in migration_2026-08-20_27t.
// ⚠️ Nebenbefund aus 26u: Server und Client hatten hier ZWEI Formeln — `build_space`
// (Einzelkauf) rechnete voll multiplikativ (× Stück), `build_space_cart` sublinear
// (+ Stück), obwohl ein Kommentar in 21e das Gegenteil behauptet. Beide Pfade rufen
// jetzt dieselbe Funktion, und diese hier ist ihr Spiegel.
// 🏗️ 27u HELLINGEN — Spiegel von `_space_ship_build_min_n` / `_space_yard_slots`.
// ⚠️ JP 2026-08-20: „Es lohnt sich eher kleine Chargen zu produzieren. 50 Jäger > 9 h,
// 10 Jäger à 5× = < 8 h." Nachgerechnet: 5 × 10 sind 9:45, aber das OPTIMUM lag bei
// 2 × 25 = 7:00 gegen 9:20 für einen Auftrag. Der Schluss stimmte, die Aufteilung nicht.
//
// ⚠️ ÜBERTRAGBARE LEHRE, und sie erledigt drei Anläufe auf einmal: **eine Kostenfunktion,
// die am AUFTRAG hängt und aufsteigend gekrümmt ist, lässt sich IMMER durch Aufteilen
// unterlaufen.** Konvex heisst superadditiv. 26u (+2 %), 27r (+4 %) und 27t (Zinseszins)
// hatten alle dieselbe Schwäche — sie fiel nur erst auf, als die Kurve steil genug wurde,
// dass sich das Aufteilen lohnt. Keine Prozentzahl der Welt behebt das.
//
// Die Werft hat stattdessen HELLINGEN — die Kosten hängen an der STÜCKZAHL, und die
// ändert das Aufteilen nicht.
//
// ⚠️ 27v: aus `ceil(n/Hellingen)` wurde `1 + (n−1)/Hellingen` (JP 2026-08-20: „nach
// dieser deiner Einteilung trifft man die Entscheidung, lieber 4 statt 5 und lieber 8
// statt 5, sowie 16 statt 12"). Die Treppe legte Sprungstellen bei jedem Vielfachen der
// Hellingen an: wer 13 Rümpfe wollte, zahlte vier volle Durchgänge und bestellte deshalb
// 16. Eine Rechenaufgabe, die das Spiel aufzwingt, ohne interessant zu sein.
// ⚠️ Und die Treppe war das schlechtere MODELL: sie unterstellt Gleichschritt. Eine echte
// Werft arbeitet im Fluss — der fünfte Rumpf rückt nach, sobald die erste Helling frei
// wird, der Auftrag dauert ein Viertel länger statt doppelt so lang.
// ⚠️ MERKE: Wenn eine Formel dem Spieler eine unangenehme Optimierung aufdrängt, lohnt
// der Blick auf das Modell dahinter — die Sprungstelle war ein Nebenprodukt der bequemen
// Rechnung, nicht der Absicht.
//
// Aufteilen bleibt verboten, und zwar BEWEISBAR statt gemessen:
//     f(a) + f(b) − f(a+b) = 1 − 1/Hellingen        (in Grundzeiten)
// Der Term hängt nicht von a und b ab — es gibt keine Stückzahl, bei der Stückeln lohnt.
function wrYardSlots(m) { return wrYardDef(wrYardLevel(m)).slots || 2; }
function wrBuildFactor(count, slots) {
  const n = Math.max(1, parseInt(count, 10) || 1);
  const s = Math.max(1, slots || 2);
  // ⚠️ Auf 6 Stellen gerundet — GENAU wie die SQL. Unter `ceil` war das unnötig (ganze
  // Zahlen), hier nicht: 1 + (n−1)/3 ergibt Drittel, und an einer .5-Grenze könnten
  // JS-Fliesskomma und PostgreSQL-`numeric` sonst verschieden runden.
  return Math.round((1 + (n - 1) / s) * 1e6) / 1e6;
}
function wrShipBuildMin(s, m, count) {
  const def = wrYardDef(wrYardLevel(m));
  return Math.max(1, Math.round((s.buildMin || 10) * wrBuildFactor(count, def.slots)
                                * (1 - def.timeCut) * wrTechBuildTime(m)));
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
    // 🌀 NEU 26p — nur das Quanten-Geschütz hat einen Wert, alle anderen 0.
    quantum:  Math.round((t.quantum  || 0) * WR_TURRET_COST_MULT[lv]),
  };
}
// ⚡ Energiebedarf eines Geschützes auf Stufe 1..3 (Spiegel von _space_turret_energy
// samt Stufenfaktor). UNGERUNDET — die SQL rundet erst die Summe, nicht die Summanden.
function wrTurretEnergy(type, level) {
  const e = WR_TURRET_ENERGY[type];
  if (!e) return 0;
  const lv = Math.max(1, Math.min(WR_TURRET_MAX, level || 1));
  return e * WR_TURRET_ATK_MULT[lv];
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
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid,
           quantum: to.quantum, atk: to.atk };
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

// ── ⚡ Energie: Versorgung, Bedarf, Faktor (26p) ─────────────────────────────
// Spiegel von _space_power_supply / _space_turret_demand / _space_power_factor.
// ⚠️ Der Generator lebt in base.power = { type, level } — NICHT in space.power.
function wrPowerGen(m)    { return wrSpace(m).base?.power || null; }
function wrPowerGenDef(m) { const g = wrPowerGen(m); return g ? SPACE_POWER_BY_KEY[g.type] || null : null; }
function wrPowerGenLevel(m) {
  // 26u: während eines Ausbaus zählt die ALTE Stufe (wrSlotLevel), nicht die bestellte.
  return Math.max(1, Math.min(WR_POWER_MAX, wrSlotLevel(wrPowerGen(m)) || 1));
}
// Ausgabe und Kosten eines Generators auf einer Stufe (Spiegel von _space_power_def).
function wrPowerStats(type, level) {
  const g = SPACE_POWER_BY_KEY[type];
  if (!g) return null;
  const lv = Math.max(1, Math.min(WR_POWER_MAX, level || 1));
  const cm = WR_POWER_COST_MULT[lv];
  return {
    output:   g.out[lv],
    cc:       Math.round(g.cc       * cm),
    erz:      Math.round(g.erz      * cm),
    kristall: Math.round(g.kristall * cm),
    plasmoid: Math.round(g.plasmoid * cm),
    quantum:  Math.round(g.quantum  * cm),
  };
}
function wrPowerUnlocked(m, type) {
  const g = SPACE_POWER_BY_KEY[type];
  if (!g) return false;
  return !g.needs || wrHasTech(m, g.needs);
}
function wrPowerConvertPrice(m, toType) {
  const to = wrPowerStats(toType, 1);
  if (!to) return null;
  const cur = wrPowerGen(m);
  const old = cur ? wrPowerStats(cur.type, wrPowerGenLevel(m)) : null;
  const rebate = Math.round((old?.cc || 0) * 0.5);
  return { cc: Math.max(0, to.cc - rebate), rebate, output: to.output,
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid, quantum: to.quantum };
}
// ── ⛽ Reaktor-Treibstoff (26s, JP 2026-07-30) ────────────────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel von _space_gen_fuel_rate / _space_gen_fuel_left /
// _space_gen_online. Gerechnet wird server-autoritativ, hier nur angezeigt —
// aber die Anzeige muss dieselbe Zahl nennen, sonst wirkt ein leerer Tank wie ein Bug.
//
// Warum überhaupt: 🟣 hatte ausser Forschung keinen Verbrauch (JP: „nach wenigen Tagen
// > 598 Plasmoid … was mache ich damit?"). Der Kristall-Reaktor bleibt bewusst
// wartungsfrei — die kostenlose Einstiegsstufe darf niemanden blockieren.
// ⚠️ 27w (JP 2026-08-20: „wir müssen den Verbrauch durch die Kraftwerke nochmal erhöhen,
// weil sonst ist es weniger relevant außer für Bau und Forschung").
// Plasmoid 8/13/20 → 10/18/30 · Quanten 10/16/25 → 14/26/42.
// ⚠️ NACH OBEN GEWICHTET: Stufe 1 steigt kaum, Stufe 3 deutlich. Wer seinen ersten
// Reaktor anwirft, merkt fast nichts; wer vier Kolonien auf Vollausbau fährt, zahlt
// spürbar. Genau dort liegt der Überschuss. Eine gleichmässige Erhöhung hätte die
// getroffen, die noch gar keinen haben — dieselbe Vorsicht wie bei den Bauzeiten.
const WR_GEN_FUEL = { plasmoid: [0, 10, 18, 30], quanten: [0, 14, 26, 42] };
const WR_GEN_FUEL_DAYS = 30;                      // Tankgrösse in Tagesrationen
function wrGenFuelRes(type)  { return type === 'plasmoid' ? 'plasmoid' : type === 'quanten' ? 'quantum' : null; }
function wrGenFuelRate(type, level) {
  const row = WR_GEN_FUEL[type];
  return row ? row[Math.max(1, Math.min(WR_POWER_MAX, level || 1))] : 0;
}
function wrGenFuelMax(type, level) { return wrGenFuelRate(type, level) * WR_GEN_FUEL_DAYS; }
// Restbestand JETZT. Ohne `since` wird nichts abgezogen (Bestandsschutz) — genau wie in SQL.
// ── ⏳ Bauzeit für Bauplätze (26u, Plan B.1.3) ───────────────────────────────
// ⚠️ Spiegel von `_space_slot_level` in migration_2026-08-17_26u_tempo.sql.
// Effektive Stufe eines Bauplatzes (Geschütz ODER Generator):
//   • kein `readyAt` oder abgelaufen → die eingetragene Stufe (Normalfall)
//   • Bau läuft und `lvlFrom` da     → die ALTE Stufe: ein AUSBAU läuft weiter
//   • Bau läuft und kein `lvlFrom`   → null = zählt gar nicht (Neubau/Umrüstung)
// null ist damit die Antwort auf „dieser Bauplatz kann noch nichts".
// ⚠️ Ein unlesbarer Zeitstempel darf einen Bauplatz nicht dauerhaft abschalten —
// dieselbe Regel wie bei `wrTurretDamaged`.
function wrSlotLevel(slot) {
  if (!slot || typeof slot !== 'object') return null;
  // ⚠️ 26v: ein Wrack aus einem Kolonie-Angriff zählt gar nicht, bis es BEZAHLT
  // repariert ist (JPs Regel: ganz oder gar nicht). Bewusst ein eigenes Feld statt des
  // bestehenden `dmg` — `dmg` ist ein Zeitstempel und heilt nach 12 h von selbst, das
  // ist die richtige Regel für den Hafen und die falsche hier.
  if (slot.wreck) return null;
  const clamp = (v) => Math.max(1, Math.min(WR_TURRET_MAX, parseInt(v, 10) || 1));
  const ready = slot.readyAt ? Date.parse(slot.readyAt) : NaN;
  if (!isFinite(ready) || ready <= Date.now()) return clamp(slot.level);
  if (slot.lvlFrom === undefined || slot.lvlFrom === null) return null;
  return clamp(slot.lvlFrom);
}
// Restzeit eines laufenden Baus in Millisekunden (0 = fertig). Für die Anzeige.
function wrSlotBuildLeft(slot) {
  const ready = slot?.readyAt ? Date.parse(slot.readyAt) : NaN;
  if (!isFinite(ready)) return 0;
  return Math.max(0, ready - Date.now());
}
function wrSlotBuilding(slot) { return wrSlotBuildLeft(slot) > 0; }

// ⚠️ NACHGEREICHT 2026-08-17 (JP, Screenshot Weltraum_Kolonie_Kraftwerk_fehler.PNG):
// „Stufe 3 will ich bauen, aber es zeigt, dass es nicht ginge, weil bereits erreicht."
//
// URSACHE — und es ist die Kehrseite einer bewussten Entscheidung aus 26u:
// `wrSlotLevel` liefert während eines Ausbaus die ALTE Stufe, damit die Versorgung nicht
// einbricht. Die Anzeige stand deshalb auf „Stufe 2" und bot den Ausbau erneut an —
// während der Server die EINGETRAGENE Stufe 3 liest und mit `power_max` ablehnt.
//
// ⚠️ ÜBERTRAGBARE LEHRE: Ein Feld mit zwei Bedeutungen („was der Bauplatz KANN" gegen
// „was bestellt ist") braucht zwei Abfragen. Für Ausgabe, Energie und Feuerkraft zählt
// die effektive Stufe — für die Frage „ist noch ein Ausbau möglich?" die bestellte. Wer
// nur eine davon anbietet, bekommt genau diesen Widerspruch: die Oberfläche verspricht
// etwas, das der Server bereits vergeben hat.
//
// Diese Marke ersetzt deshalb den Ausbau-Knopf, solange gebaut wird.
function wrBuildBadgeHtml(slot) {
  const ms = wrSlotBuildLeft(slot);
  if (ms <= 0) return '';
  const neu  = slot.lvlFrom === undefined || slot.lvlFrom === null;
  const ziel = Math.max(1, Math.min(WR_TURRET_MAX, parseInt(slot.level, 10) || 1));
  // ⚡ 27n: bei einer Reaktor-UMRÜSTUNG steht der Vorgänger in `prev` und liefert weiter.
  // Der Zusatz gehört hierher, weil dies die Stelle ist, an der der Spieler den Zustand
  // sieht — Regel 4: keine Popups, die Erklärung zieht an den Ort der Wirkung.
  const alt = (slot.prev && typeof slot.prev === 'object' && slot.prev.type)
    ? (SPACE_POWER_BY_KEY[slot.prev.type]?.name || slot.prev.type) : null;
  return `<div class="wr-slot-build">🔧 ${neu
    ? 'wird gebaut' : `wird auf Stufe ${ziel} ausgebaut`}
    <span class="wr-sub">noch ${wrCountdown(ms)}${alt
      ? ` — solange liefert weiter der ${_wrEsc(alt)}`
      : (neu ? '' : ' — solange zählt die alte Stufe')}</span></div>`;
}

// ── ⚡ 27n: WELCHER Reaktor läuft gerade? ────────────────────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel von `_space_gen_live` / `_space_gen_converting` in
// migration_2026-08-20_27n_reaktor_umruestung.sql. Der Server ist autoritativ.
//
// JP 2026-08-20: „Der Quantenschaum-Reaktor kann befüllt werden … obwohl er noch im Bau
// ist — die Energie ist = 0, sollte doch aber eigentlich vom Reaktor davor vorhanden
// sein." Genau das leistet `prev`: bei einer UMRÜSTUNG läuft der alte Reaktor weiter,
// mit seinem eigenen Tank und seiner eigenen Treibstoffsorte.
//
// ⚠️ Diese eine Funktion beantwortet ab jetzt jede Frage nach dem Reaktor — Ausgabe,
// Tank, Sorte, online. Vorher standen `pw.type` (der BESTELLTE Typ) und `wrSlotLevel(pw)`
// (die alte Stufe) nebeneinander: zwei Halbwahrheiten, die sich nur deshalb nicht
// widersprachen, weil `null` vorher alles abgeschaltet hat.
function wrGenLive(pw) {
  if (!pw || typeof pw !== 'object' || !pw.type) return null;
  const clamp = (v) => Math.max(1, Math.min(WR_POWER_MAX, parseInt(v, 10) || 1));
  const ready = pw.readyAt ? Date.parse(pw.readyAt) : NaN;
  // Unlesbarer Zeitstempel gilt als „fertig" — wie in wrSlotLevel: ein kaputtes Feld
  // darf kein Kraftwerk dauerhaft abschalten.
  if (!isFinite(ready) || ready <= Date.now()) {
    return { type: pw.type, level: clamp(pw.level), fuel: pw.fuel, since: pw.since };
  }
  const prev = pw.prev;
  if (prev && typeof prev === 'object' && prev.type) {
    return { type: prev.type, level: clamp(prev.level), fuel: prev.fuel, since: prev.since };
  }
  if (pw.lvlFrom !== undefined && pw.lvlFrom !== null) {
    return { type: pw.type, level: clamp(pw.lvlFrom), fuel: pw.fuel, since: pw.since };
  }
  return null;                                   // echter Neubau: es läuft nichts
}
// Läuft gerade eine Umrüstung, bei der noch der Vorgänger trägt?
function wrGenConverting(pw) {
  if (!pw || typeof pw !== 'object' || !pw.prev || typeof pw.prev !== 'object') return false;
  const ready = pw.readyAt ? Date.parse(pw.readyAt) : NaN;
  return isFinite(ready) && ready > Date.now();
}
function wrGenFuelLeft(pw) {
  const live = wrGenLive(pw);
  if (!live) return 0;                           // 26u: echter Neubau
  const rate = wrGenFuelRate(live.type, live.level);
  if (rate <= 0) return 0;
  const fuel = Math.max(0, parseFloat(live.fuel) || 0);
  const since = live.since ? Date.parse(live.since) : NaN;
  if (!isFinite(since)) return fuel;
  return Math.max(0, fuel - (Date.now() - since) / 86400000 * rate);
}
function wrGenOnline(pw) {
  const live = wrGenLive(pw);
  if (!live) return false;                       // 26u: im Bau = offline
  return wrGenFuelRate(live.type, live.level) <= 0 || wrGenFuelLeft(pw) > 0;
}
function wrGenFuelDaysLeft(pw) {
  const live = wrGenLive(pw);
  const rate = live ? wrGenFuelRate(live.type, live.level) : 0;
  return rate > 0 ? wrGenFuelLeft(pw) / rate : Infinity;
}

function wrPowerSupply(m) {
  const lv = wrBaseLevel(m);
  let sup = WR_POWER_BASE_SUPPLY + lv * WR_POWER_PER_LEVEL;
  const g = wrPowerGen(m);
  // ⛽ 26s: ein trockener Reaktor liefert nichts — es bleibt die Grundversorgung.
  // ⚡ 27n: Typ UND Stufe kommen aus demselben Objekt (dem LAUFENDEN Reaktor). Vorher
  // stand hier `g.type` (der bestellte) neben `wrPowerGenLevel` (der alten Stufe).
  const live = wrGenLive(g);
  if (live && wrGenOnline(g)) sup += wrPowerStats(live.type, live.level)?.output || 0;
  return sup;
}
// ⚠️ BESCHÄDIGTE GESCHÜTZE ZIEHEN KEINE ENERGIE — dieselbe dmg-Prüfung wie in
// wrTurretPowerRaw. Sonst würde eine verlorene Angriffswelle doppelt bestrafen: die
// intakten Geschütze müssten sich den Strom mit Wracks teilen, die gar nicht feuern.
// Sichtbare Folge: der Bedarf sinkt für die 12 h Reparaturzeit. Gewollt, kein Anzeigefehler.
function wrPowerDemand(m) {
  let sum = 0;
  for (const slot of Object.values(wrTurrets(m))) {
    if (!slot || typeof slot !== 'object') continue;
    if (wrTurretDamaged(slot)) continue;
    const lv = wrSlotLevel(slot);            // 26u: null = noch im Bau, zieht keine Energie
    if (lv === null) continue;
    sum += wrTurretEnergy(slot.type, lv);
  }
  return Math.round(sum);
}
function wrPowerFactor(m) {
  const dem = wrPowerDemand(m);
  if (dem <= 0) return 1;                       // ohne Geschütze kein Bedarf, keine Strafe
  return Math.min(1, Math.max(WR_POWER_FLOOR, wrPowerSupply(m) / Math.max(1, dem)));
}

// Gesamte Feuerkraft des eigenen Hafens (Spiegel von _space_turret_power)
// B1/B5 wirken auf die ANZEIGE genauso wie serverseitig am Aufrufort (21n).
// ⚠️ 26p: der Energie-Faktor gehört in wrTurretPowerRaw und NICHT in wrTurretPower —
// serverseitig steckt er ebenfalls IN _space_turret_power, also vor dem Tech-Faktor.
// Stünde er hier aussen, wäre die Rundung eine andere (round(sum × f) × tech statt
// round(sum × f × tech)) und die Anzeige driftete um ein paar Punkte von der SQL weg.
function wrTurretPower(m) { return wrTurretPowerRaw(m) * wrTechTurret(m); }
function wrTurretPowerRaw(m) {
  let sum = 0;
  for (const slot of Object.values(wrTurrets(m))) {
    if (!slot || typeof slot !== 'object') continue;
    if (wrTurretDamaged(slot)) continue;
    const lv = wrSlotLevel(slot);            // 26u: ein Bauplatz im Bau trägt nichts bei
    if (lv === null) continue;
    sum += wrTurretStats(slot.type, lv)?.atk || 0;
  }
  return Math.round(sum * wrPowerFactor(m));
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
// ⚠️ 27o: die Zahl ist nicht mehr fest. Spiegel von `_space_planet_slots_for`.
// JP 2026-08-20: „Man könnte ja machen, dass erst, wenn ein Quantenreaktor vorhanden ist,
// 6 Slots zur Verfügung stehen." — Damit ist der Quantenschaum-Reaktor auf Kolonien nicht
// mehr die FOLGE des Ausbaus (ein Plasmoid St. 3 trug den 3-Platz-Vollausbau mit Reserve),
// sondern seine VORAUSSETZUNG.
const WR_PLANET_SLOTS = 3;          // Sockel
const WR_PLANET_SLOTS_QUA = 6;      // mit fertigem Quantenschaum-Reaktor
const WR_PTURRET_MULT = 1.5;   // Kolonie-Aufschlag auf alle Geschützkosten
// Freigeschaltete Bauplätze dieser Kolonie.
// ⚠️ `wrGenLive` (27n): ein Reaktor IM BAU zählt nicht — sonst brächte schon das Starten
// einer Umrüstung drei Bauplätze, und ein Abbruch liesse Geschütze ohne Kraftwerk zurück.
function wrPlanetSlotsFree(p) {
  return wrGenLive(wrPlanetPower(p))?.type === 'quanten' ? WR_PLANET_SLOTS_QUA : WR_PLANET_SLOTS;
}
// Wie viele Bauplätze werden ANGEZEIGT? Mindestens so viele, wie belegt sind.
// ⚠️ BESTANDSSCHUTZ, und er ist kein Randfall: `resolve_colony_attack` (26v) setzt bei
// einem verlorenen Angriff `power = NULL`. Eine Kolonie mit 6 belegten Bauplätzen fällt
// dann auf „3 freigeschaltet" zurück — die drei bezahlten Geschütze in g3..g5 müssen
// trotzdem sichtbar, reparierbar und ausbaubar bleiben. Der Server sieht das genauso
// (`_space_slot_guard` prüft nur NEU hinzugekommene Bauplätze).
// ── ⚠️ 27o: Was stimmt mit dieser Kolonie nicht? ────────────────────────────
// JP 2026-08-20: „Beschädigte Kolonien könnten evtl. mit einem Achtungs-Dreieck versehen
// werden, auch solche, die z. B. Energie-Lacks haben."
//
// ⚠️ EINE Quelle für alle Anzeigestellen — Liste, Panel und (später) Karte fragen
// dieselbe Funktion. Zwei Listen von Missständen wären zwei Auffassungen davon, wann
// eine Kolonie „in Ordnung" ist; genau so sind in diesem Modul schon zwei Garnisonen
// und zwei Symboltabellen entstanden.
//
// ⚠️ ZWEI STUFEN, und die Trennlinie ist „heilt das von selbst?":
//   bad  = braucht eine Handlung (Wrack bezahlen, Energie beschaffen, tanken, abwehren)
//   warn = erledigt sich (dmg heilt nach 12 h, Tank reicht noch ein paar Tage)
// Ein Dreieck, das auch für Selbstheilendes rot leuchtet, wird ignoriert — und dann
// sieht man das echte nicht mehr.
function wrColonyWarnings(m, p) {
  const items = [];
  let bad = false;
  try {
    if (!p || p.colonized_by !== m?.id) return { level: null, items };

    const slots = Object.values(wrPlanetTurrets(p));
    const wracks = slots.filter(s => s && typeof s === 'object' && s.wreck).length;
    const dmg    = slots.filter(s => s && typeof s === 'object' && !s.wreck && wrTurretDamaged(s)).length;
    if (wracks > 0) {
      bad = true;
      items.push(`🛠️ ${wrFmt(wracks)} Geschütz-Wrack${wracks > 1 ? 'e' : ''} — sie zählen `
               + `erst wieder, wenn die Reparatur bezahlt ist.`);
    }
    if (dmg > 0) {
      items.push(`💥 ${wrFmt(dmg)} Geschütz${dmg > 1 ? 'e' : ''} beschädigt — heilt von selbst.`);
    }

    // ⚡ Unterversorgung. Der Faktor ist dieselbe Rechnung wie im Energie-Panel.
    const fac = wrColonyFactor(p);
    if (fac < 1) {
      bad = true;
      const fehlt = Math.max(0, wrColonyDemand(p) - wrColonySupply(p));
      items.push(`⚡ Unterversorgt — die Geschütze feuern mit ${Math.round(fac * 100)} %, `
               + `es fehlen ${wrFmt(fehlt)} Energie.`);
    }

    // ⛽ Tank. Ein leerer Tank IST die Unterversorgung von morgen — er gehört hierher,
    // auch wenn der Faktor heute noch 100 % zeigt.
    const gen  = wrPlanetPower(p);
    const live = wrGenLive(gen);
    if (live && wrGenFuelRate(live.type, live.level) > 0) {
      const tage = wrGenFuelDaysLeft(gen);
      if (wrGenFuelLeft(gen) <= 0) {
        bad = true;
        items.push('⛽ Reaktor-Tank leer — er liefert nichts, es zählt nur die Grundversorgung.');
      } else if (tage < 3) {
        items.push(`⛽ Treibstoff reicht nur noch ${tage < 1
          ? `${Math.max(0, Math.round(tage * 24))} h` : `${Math.floor(tage)} Tage`}.`);
      }
    }

    // 🧊 27q: Die Übersicht zeigt „⚔️ 0", sobald die Flotte eingemottet ist — der GRUND
    // dafür stand bisher nur im Flotten-Tab. Eine Zahl, die ohne erkennbaren Anlass auf
    // null steht, sieht aus wie ein Fehler.
    if (wrGarrisonCount(m, p.id) > 0 && wrMothCount(m) > 0) {
      bad = true;
      items.push(`🧊 Deine Flotte ist eingemottet — die ${wrFmt(wrGarrisonCount(m, p.id))} `
               + `Schiffe der Garnison verteidigen hier mit 0. Im Flotten-Tab auslösen.`);
    }

    // 🚨 Angriff unterwegs (26v). `_wrAttacks` ist Serverzustand dieser Sitzung.
    try {
      const a = (typeof _wrAttacks !== 'undefined' ? _wrAttacks : [])
        .find(x => x && x.planetId === p.id && Date.parse(x.arriveAt) > Date.now());
      if (a) {
        bad = true;
        items.push(`🚨 Angriff im Anflug (Stärke ${wrFmt(a.strength)}) — Einschlag in `
                 + `${wrCountdown(Date.parse(a.arriveAt) - Date.now())}.`);
      }
    } catch (e) {}
  } catch (e) { /* Regel 3: eine Warnung darf die Kolonie-Liste nie zerlegen */ }
  return { level: items.length ? (bad ? 'bad' : 'warn') : null, items };
}
// Kompaktes Zeichen für die Kolonie-Liste. Leerstring, wenn alles in Ordnung ist —
// ein Symbol, das immer da ist, sagt nichts.
function wrColonyWarnBadge(m, p) {
  const w = wrColonyWarnings(m, p);
  if (!w.level) return '';
  // ⚠️ `title` statt eines eigenen Tooltips: der Text muss auch auf dem Handy
  // erreichbar sein, und dort steht er ausgeschrieben im aufgeklappten Panel.
  return `<span class="wr-cwarn wr-cwarn-${w.level}" title="${_wrEsc(w.items.join(' · '))}"
    >${w.level === 'bad' ? '⚠️' : '⚡'}</span>`;
}

function wrPlanetSlotsShown(p) {
  let hoechster = -1;
  for (const key of Object.keys(wrPlanetTurrets(p))) {
    const i = parseInt(String(key).replace(/^g/, ''), 10);
    if (Number.isFinite(i) && i > hoechster) hoechster = i;
  }
  return Math.min(WR_PLANET_SLOTS_QUA, Math.max(wrPlanetSlotsFree(p), hoechster + 1));
}
// ── 🗺️ 26z: Regionen-Effekte ────────────────────────────────────────────────
// ⚠️ Spiegel von `_space_region_rates` in migration_2026-08-17_26z_regionen.sql.
const WR_REGION_RATES = {
  ertrag: 1.20,      // Abbau und Kolonie-Ertrag in der eigenen Region
  flugzeit: 0.80,    // Flugzeit zu Zielen in der eigenen Region
  sonde: 0.50,       // Sondenkosten (Treibstoff) dort
  abgabe: 0.05,      // Regionsabgabe an den Zweitplatzierten
  uebernahme: 1.15,  // nötige Übermacht für eine Kolonie in fremder Region
};
// ⚠️ Die Regionen-TABELLE steht bewusst NICHT hier, sondern in weltraum_stats.js
// (`WR_REGIONS` / `WR_REGION_OF`, dort seit Teil A und im Betrieb bewährt). Sie ein
// zweites Mal zu schreiben wäre die sicherste Art, sie auseinanderlaufen zu lassen —
// dieselbe Falle wie bei jeder Spiegel-Konstante, nur schlimmer, weil sie 36 Zeilen hat.
// weltraum_stats.js lädt NACH dieser Datei, deshalb wird erst beim Aufruf zugegriffen.
function wrRegionOfQuad(q) { return (window.WR_REGION_OF || {})[q] || null; }
function wrRegionHolderId(regionKey) {
  try {
    if (typeof wrRegionStand !== 'function' || !regionKey) return null;
    return wrRegionStand(regionKey).holder?.id || null;
  } catch (e) { return null; }
}
// Kontrolliere ICH die Region dieses Planeten/Quadranten?
function wrRegionMine(quadrant, m) {
  const h = wrRegionHolderId(wrRegionOfQuad(quadrant));
  return !!(h && h === (m || _wrMember)?.id);
}
// Flugzeit-Vorschau inklusive Regionsbonus — Spiegel der Rechnung in start_space_trip.
function wrTripMin(ring, quadrant, m) {
  const bonus = wrRegionMine(quadrant, m) ? WR_REGION_RATES.flugzeit : 1;
  return Math.round(ring * SPACE_MIN_PER_RING * bonus);
}

// ── 🎖️ 26x: Söldner ─────────────────────────────────────────────────────────
// ⚠️ Spiegel von `_space_merc_rates` / `_space_merc_price` / `_space_merc_active` in
// migration_2026-08-17_26x_soeldner.sql.
//
// ⚠️ DIE WICHTIGSTE EIGENSCHAFT IST EINE AUSLASSUNG: Söldner stehen NICHT in
// `space.fleets`, sondern in `space.merc`. Dadurch sind sie automatisch von allem
// ausgeschlossen, was `fleets` liest — Mutterschiff-Recycling, Reisen, Routen und der
// Flottensold aus 26w. Es gibt keine Prüfung, die jemand vergessen könnte.
// Wer sie je nach `fleets` verschiebt, hebt alle vier Verbote auf einmal auf.
const WR_MERC_FACTOR = 3;   // Preis = 3 × CC-Bauwert
const WR_MERC_DAYS   = 7;   // Laufzeit
function wrMerc(m)   { const x = wrSpace(m).merc; return (x && typeof x === 'object') ? x : null; }
function wrMercPrice(ships) {
  let cc = 0;
  for (const [k, n] of Object.entries(ships || {})) {
    const c = SPACE_SHIP_BY_KEY[k];
    if (!c || !(n > 0)) continue;
    cc += (c.cc || 0) * n;
  }
  return Math.round(cc * WR_MERC_FACTOR);
}
// ⚠️ Im Zweifel „aktiv": ein unlesbarer Zeitstempel darf ein BEZAHLTES Geschwader nicht
// stillschweigend verfallen lassen. Umgekehrt als bei `readyAt` in 26u, wo „fertig" die
// für den Spieler harmlose Richtung war — hier ist es „läuft noch".
function wrMercActive(m) {
  const x = wrMerc(m);
  if (!x || !x.ships || !Object.values(x.ships).some(n => n > 0)) return false;
  const until = x.until ? Date.parse(x.until) : NaN;
  if (!isFinite(until)) return true;
  return until > Date.now();
}
function wrMercLeftMs(m) {
  const x = wrMerc(m);
  const until = x?.until ? Date.parse(x.until) : NaN;
  return isFinite(until) ? Math.max(0, until - Date.now()) : 0;
}
function wrMercCount(m) {
  const x = wrMerc(m);
  return Object.values(x?.ships || {}).reduce((a, n) => a + (parseInt(n, 10) || 0), 0);
}

// 🛠️ 26v: Reparaturpreis eines Wracks = 40 % des Kolonie-Neupreises der AKTUELLEN Stufe
// („Kosten proportional zum Schaden", JP). Spiegel von `repair_planet_turret`.
// ⚠️ Der Server rechnet den Preis selbst nach — dieser Wert ist reine Anzeige. Weicht er
// ab, lehnt der Server ab, und der Knopf wäre trotzdem aktiv gewesen (dieselbe Falle wie
// beim Umrüstpreis in 26p). Deshalb steht der Faktor hier als benannte Konstante.
const WR_REPAIR_FACTOR = 0.4;
function wrRepairPrice(type, level) {
  const s = wrPturretStats(type, level);
  if (!s) return { cc: 0, erz: 0, kristall: 0, plasmoid: 0, quantum: 0 };
  const f = (v) => Math.round((v || 0) * WR_REPAIR_FACTOR);
  return { cc: f(s.cc), erz: f(s.erz), kristall: f(s.kristall),
           plasmoid: f(s.plasmoid), quantum: f(s.quantum) };
}
function wrPturretStats(type, level) {
  const s = wrTurretStats(type, level);
  if (!s) return null;
  return { atk: s.atk,
           cc:       Math.round(s.cc       * WR_PTURRET_MULT),
           erz:      Math.round(s.erz      * WR_PTURRET_MULT),
           kristall: Math.round(s.kristall * WR_PTURRET_MULT),
           plasmoid: Math.round(s.plasmoid * WR_PTURRET_MULT),
           // 🌀 26p: der Kolonie-Aufschlag gilt auch für Quantenschaum → 30 × 1,5 = 45.
           quantum:  Math.round(s.quantum  * WR_PTURRET_MULT) };
}
function wrPturretConvertPrice(fromType, fromLevel, toType) {
  const to  = wrPturretStats(toType, 1);
  const old = wrPturretStats(fromType, fromLevel);
  if (!to) return null;
  const rebate = Math.round((old?.cc || 0) * 0.5);
  return { cc: Math.max(0, to.cc - rebate), rebate,
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid,
           quantum: to.quantum, atk: to.atk };
}
// Belegte Bauplätze eines Planeten. Bestandsplaneten ohne `turrets` (vor 26l) liefern {}.
function wrPlanetTurrets(p) {
  const t = p && p.turrets;
  return (t && typeof t === 'object') ? t : {};
}

// ── ⚡ Kolonie-Kraftwerke (26p, JP 2026-07-30) ────────────────────────────────
// ⚠️ CLIENT-SYNC-PFLICHT: Spiegel von _space_colony_supply / _space_pgen_def /
// _space_colony_power_factor / _space_planet_power_nrg.
// Die Kolonie rechnet mit ihrer EIGENEN Versorgung — ein gemeinsamer Topf mit dem
// Raumhafen wäre falsch (Kolonien liegen Ringe entfernt) und hätte den Hafen mitgerissen.
// Grundversorgung = Kolonie-Stufe × 10 (10/20/30): der Ausbau bekommt damit einen zweiten
// Sinn neben dem Ertrag.
const WR_COLONY_PER_LEVEL = 10;
function wrPlanetPower(p)   { const g = p && p.power; return (g && typeof g === 'object' && g.type) ? g : null; }
function wrPlanetGenDef(p)  { const g = wrPlanetPower(p); return g ? SPACE_POWER_BY_KEY[g.type] || null : null; }
function wrPlanetGenLevel(p) {
  // 26u: siehe wrPowerGenLevel.
  return Math.max(1, Math.min(WR_POWER_MAX, wrSlotLevel(wrPlanetPower(p)) || 1));
}
// Kolonie-Generator: gleiche Ausgabe, Preis ×1,5 (wie alle Kolonie-Bauten, 26l).
function wrPgenStats(type, level) {
  const s = wrPowerStats(type, level);
  if (!s) return null;
  return { output: s.output,
           cc:       Math.round(s.cc       * WR_PTURRET_MULT),
           erz:      Math.round(s.erz      * WR_PTURRET_MULT),
           kristall: Math.round(s.kristall * WR_PTURRET_MULT),
           plasmoid: Math.round(s.plasmoid * WR_PTURRET_MULT),
           quantum:  Math.round(s.quantum  * WR_PTURRET_MULT) };
}
function wrPgenConvertPrice(p, toType) {
  const to = wrPgenStats(toType, 1);
  if (!to) return null;
  const cur = wrPlanetPower(p);
  const old = cur ? wrPgenStats(cur.type, wrPlanetGenLevel(p)) : null;
  const rebate = Math.round((old?.cc || 0) * 0.5);
  return { cc: Math.max(0, to.cc - rebate), rebate, output: to.output,
           erz: to.erz, kristall: to.kristall, plasmoid: to.plasmoid, quantum: to.quantum };
}
function wrColonySupply(p) {
  let sup = wrColonyLevel(p) * WR_COLONY_PER_LEVEL;
  const g = wrPlanetPower(p);
  // ⛽ 26s: gleiche Regel wie am Hafen — ohne Treibstoff keine Generator-Ausgabe.
  // ⚡ 27n: der LAUFENDE Reaktor (bei einer Umrüstung ist das der Vorgänger).
  const live = wrGenLive(g);
  if (live && wrGenOnline(g)) sup += wrPgenStats(live.type, live.level)?.output || 0;
  return sup;
}
// Bedarf aller einsatzbereiten Kolonie-Geschütze — dieselbe dmg-Regel wie am Hafen.
function wrColonyDemand(p) {
  let sum = 0;
  for (const slot of Object.values(wrPlanetTurrets(p))) {
    if (!slot || typeof slot !== 'object') continue;
    if (wrTurretDamaged(slot)) continue;
    const lv = wrSlotLevel(slot);            // 26u
    if (lv === null) continue;
    sum += wrTurretEnergy(slot.type, lv);
  }
  return Math.round(sum);
}
function wrColonyFactor(p) {
  const dem = wrColonyDemand(p);
  if (dem <= 0) return 1;
  return Math.min(1, Math.max(WR_POWER_FLOOR, wrColonySupply(p) / Math.max(1, dem)));
}
const WR_COLONY_UP = [ null, null,
  { level: 2, cc:  9000, erz: 180, kristall:  45, plasmoid:  0 },
  { level: 3, cc: 20000, erz: 380, kristall: 120, plasmoid: 15 },
];
const WR_STATION = { cc: 30000, erz: 500, kristall: 200, plasmoid: 60, quantum: 30 };
// Rückfall-Frist ungeschützter Planeten — Spiegel von _space_fallback_days.
// ⚠️ 5 → 3 Tage (JP 2026-07-30, migration_2026-07-26q): „es muss die Rückeroberung
// schneller gehen … da sonst bei komplettem Clan alles frei ist. Nach nur 1 Woche habe ich
// den ersten Ring vollständig erobert und nur noch Wracks sind da."
// Die Frist war gegen einen EINZELNEN Spieler bemessen, muss aber gegen den ganzen Klan
// wirken — alle teilen dieselbe Galaxie. wt_e12 gibt weiterhin +2 Tage (3 → 5).
const WR_FALLBACK_DAYS = 3, WR_FALLBACK_E12 = 5;
// 📡 27g (Plan B.6.2): Die Station gewährt keine IMMUNITÄT mehr, sondern verdreifacht
// die Rückfallfrist. Spiegel von `_space_fallback_mult` / `_space_fallback_days_at`.
// ⚠️ JPs Begründung im Plan ist der Kern: die Rückeroberung ist der MATERIALKREISLAUF
// des Spiels — sie erzeugt Wrackfelder, neue Ziele und hält die Karte in Bewegung. Ein
// Bauwerk, das sie quadrantenweise abschaltet, nimmt dem Endgame seinen Nachschub, und
// zwar unbemerkt: es fühlt sich nichts falsch an, es passiert nur nichts mehr.
const WR_FALLBACK_STATION_MULT = 3;
const WR_STATION_MAX = 3;   // je Spieler (Plan B.6.2, Punkt 3)
// Frist für EINEN Planeten, inklusive Stations-Verlängerung.
function wrFallbackDaysAt(p, m) {
  return wrFallbackDays(m) * (wrQuadStation(p?.quadrant) ? WR_FALLBACK_STATION_MULT : 1);
}
// Wie viele Stationen hat dieser Spieler schon?
function wrStationCount(m) {
  // ⚠️ Zählt nach BESITZ, nicht nach Wirksamkeit: eine ausgefallene Station belegt den
  // Bauplatz weiterhin (sie lässt sich reparieren). Sonst könnte man bei drei
  // beschädigten Stationen eine vierte bauen und hätte am Ende vier.
  return (_wrGalaxy?.planets || [])
    .filter(p => p.station && p.colonized_by === (m || _wrMember)?.id).length;
}
// 👾 Wächter-Eskalation beim Rückfall — Spiegel von sweep_space_reconquest
// (migration_2026-07-26r). ⚠️ NUR ANZEIGE: die Zahlen rechnet ausschliesslich der Server,
// der Client liest `enemy_strength` fertig aus space_planets. Trotzdem hier festhalten,
// damit die Warnung im Panel „⚠️ Ungeschützt" nicht als Fliesstext verwaist —
// bei einer SQL-Balanceänderung beide Stellen anfassen.
// JP 2026-07-30: „die Wächter sind zwischen 50 und 120 stark, meist aber unter 80" —
// ×1,15 war gegen eine Mutterschiff-Flotte kein Widerstand.
const WR_FALLBACK_GROWTH = 1.6;                        // je Rückfall (vorher 1,15)
const WR_FALLBACK_FLOOR  = { 1: 200, 2: 550, 3: 1400 }; // Mindeststärke nach dem Rückfall
const WR_FALLBACK_CAP    = { 1: 900, 2: 2500, 3: 6000 };// Deckel (vorher 240/800/2200)

function wrDefLevel(p)    { return Math.max(0, Math.min(3, parseInt(p?.def_level, 10) || 0)); }
function wrPlanetDef(p)   { return Math.max(0, parseInt(p?.planet_defense, 10) || 0); }
// ⏳ 26u: Was in `planet_defense` stehen MÜSSTE — Spiegel von `_space_planet_power_nrg`.
// Wird für die Vorprüfung in wrClaimTurrets gebraucht: weicht der gespeicherte Wert ab,
// ist auf dieser Kolonie ein Bau fertig geworden (oder eine Balance-Änderung wirksam),
// und der Server muss ihn neu eintragen. Bauplätze im Bau zählen über wrSlotLevel nicht.
function wrColonyPowerExpected(p) {
  let raw = 0;
  for (const slot of Object.values(wrPlanetTurrets(p) || {})) {
    if (!slot || typeof slot !== 'object') continue;
    if (wrTurretDamaged(slot)) continue;
    const lv = wrSlotLevel(slot);
    if (lv === null) continue;
    raw += wrTurretStats(slot.type, lv)?.atk || 0;
  }
  return Math.round(raw * wrColonyFactor(p));
}
function wrColonyLevel(p) { return Math.max(1, Math.min(3, parseInt(p?.colony_level, 10) || 1)); }

// ── 🛡️ 27k: Kolonie-Garnison ────────────────────────────────────────────────
// ⚠️ SPIEGEL von _space_garrison_power / _space_garrison_count (SQL 27k). Der Server ist
// autoritativ; das hier ist reine Vorschau. Weicht eine Zahl ab, verspricht das Panel
// eine Verteidigung, die im Kampf nicht antritt.
// ⚠️ Die Garnison liegt bewusst NICHT in `fleets` — dadurch zählt sie nirgends doppelt
// (Heimatsumme, Angriffs-Picker, Warenkorb sehen sie strukturell nicht).
const WR_GARRISON_PER_LEVEL = 10;            // R11: 10 Schiffe je Kolonie-Stufe
function wrGarrisonAll(m) {
  const g = wrSpace(m).garrison;
  return (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
}
function wrGarrisonShips(m, planetId) {
  const s = wrGarrisonAll(m)[planetId]?.ships;
  return (s && typeof s === 'object') ? s : {};
}
function wrGarrisonCount(m, planetId) {
  const s = wrGarrisonShips(m, planetId);
  return SPACE_SHIPS.reduce((a, x) => a + (parseInt(s[x.key], 10) || 0), 0);
}
function wrGarrisonCap(p) { return WR_GARRISON_PER_LEVEL * wrColonyLevel(p); }
// Kampfkraft der Garnison. ⚠️ Eingemottet ⇒ 0, genau wie serverseitig: wer den Sold
// nicht zahlt, verteidigt nicht — sonst wäre die Kolonie ein Weg, das Einmotten zu umgehen.
function wrGarrisonPower(m, planetId) {
  if (wrMothCount(m) > 0) return 0;
  const s = wrGarrisonShips(m, planetId);
  return SPACE_SHIPS.reduce((a, x) => a + (x.atk || 0) * (parseInt(s[x.key], 10) || 0), 0);
}
function wrGarrisonTrips(m) {
  const t = wrSpace(m).garrisonTrips;
  return Array.isArray(t) ? t : [];
}
// Läuft gerade ein Transport zu dieser Kolonie? (Ein Transport je Kolonie, 27e-Regel.)
// ⚠️ Abgelaufene zählen NICHT als laufend — sonst sperrt ein nie abgeholter Flug die
// Kolonie für immer. Dieselbe Bedingung wie im Server.
function wrGarrisonTripFor(m, planetId) {
  const now = Date.now();
  return wrGarrisonTrips(m).find(t => t && t.planetId === planetId
    && Date.parse(t.arriveAt) > now) || null;
}
function wrIsStation(p)   { return !!(p && p.station); }
// 📡 27h: Eine Station wirkt nur, solange sie STEHT — ihr Planet muss kolonisiert sein
// und mindestens ein intaktes Geschütz tragen. JP 2026-08-17: „sie kann ja dennoch
// angegriffen werden, und würde dann beschädigt werden können, also deren Bestandteile."
// Genau so ist es jetzt: sind nach einem Angriff alle Geschütze Wracks, sinkt
// `planet_defense` auf 0 und die Station fällt aus, bis eines repariert ist.
//
// ⚠️ Vorher fragte diese Funktion nur `p.station` — ein blosses Flag, das jede Zerstörung
// überlebte. Eine Station, deren Kolonie vernichtet wurde, verlängerte die Frist im
// Quadranten damit FÜR IMMER: ohne Besitzer, ohne Unterhalt, ohne auf die 3er-Grenze zu
// zählen. Spiegel von `_space_quad_station_active`.
function wrStationActive(p) {
  return !!(p && p.station && p.colonized_by && wrPlanetDef(p) > 0);
}
function wrQuadStation(qkey) {
  return (_wrGalaxy?.planets || []).find(p => p.quadrant === qkey && wrStationActive(p)) || null;
}
// Steht dort eine Station, die gerade NICHT wirkt? Für die Anzeige — „da ist eine, aber
// sie schweigt" ist eine andere Auskunft als „da ist keine".
function wrQuadStationDown(qkey) {
  return (_wrGalaxy?.planets || [])
    .find(p => p.quadrant === qkey && p.station && !wrStationActive(p)) || null;
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
  // ⚠️ 27g: Hier stand `if (wrQuadStation(...)) return true;` — die Station galt als
  // dauerhafter Schutz. Sie verlängert jetzt nur noch die Frist (wrFallbackDaysAt), der
  // Planet fällt also weiterhin zurück. Ohne diese Entfernung würde die Anzeige „sicher"
  // melden, während der Server nach 9 Tagen zugreift.
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
  return t + wrFallbackDaysAt(p, m) * 86400000;   // 📡 27g: Station verdreifacht
}
// Spielerfarbe, deterministisch aus der member_id (kein Durchnummerieren — bei
// Neuzugängen bliebe sonst keine Farbe stabil). Gleiche Quelle wie _wrHash.
// ── 🛰️ 27s: Flotten der Mitspieler auf der Karte ───────────────────────────
// JP 2026-08-20: „Ich fänds cool, wenn man die Flotten der Mitspieler auch auf der Karte
// fliegen sehen kann … wieder mit einem farbigen Rand wie bei Kaffee-Mobil? Wäre sonst
// auch, der Übersicht halber, gut, wenn man die Ansicht an- und abschalten könnte."
//
// ⚠️ KEINE SQL NÖTIG, UND DAS WAR DIE ERSTE PRÜFUNG: `fetchData` in db.js liest
// `members.select('*')` für die ganze Gruppe, `normalizeUser` behält die Spalte `space`.
// Die Flüge der anderen liegen also längst im Client — ein neuer Endpunkt hätte dieselben
// Daten ein zweites Mal geholt. (Und die Egress-Notiz aus [[coffee-champion-egress]] wäre
// dadurch schlechter geworden, nicht besser.)
//
// ⚠️ Der Startpunkt stimmt ohne Zusatzdaten: der Raumhafen liegt für ALLE im Ring-0-Hex
// in der Canvas-Mitte („der Quadrant 0,0 ist trotzdem für alle derselbe Startpunkt",
// wrDrawMap). Die Flugbahn ist also dieselbe Interpolation wie bei der eigenen Flotte.
//
// ⚠️ Farbe = `wrMemberColor(id)` — dieselbe Funktion, die schon die Kolonie-Punkte färbt.
// Eine zweite Farbtabelle „für Flotten" wäre genau das Muster, das hier zweimal zwei
// Garnisonen und zwei Symboltabellen erzeugt hat.
let _wrShowOthers = true;
const _WR_OTHERS_KEY = 'wr_show_others';
try {
  const v = localStorage.getItem(_WR_OTHERS_KEY);
  if (v !== null) _wrShowOthers = v === '1';
} catch (e) { /* privater Modus: Vorgabe bleibt an */ }

// Alle laufenden Flüge der ANDEREN — {id, name, color, trip}.
// ⚠️ typeof-Guard auf `wrAllUsers`: das lebt in weltraum_stats.js, und die Karte darf
// nicht davon abhängen, dass diese Datei geladen ist (Regel 3).
function wrOtherTrips() {
  const out = [];
  try {
    if (!_wrShowOthers) return out;
    const users = (typeof wrAllUsers === 'function') ? wrAllUsers() : [];
    const now = Date.now();
    for (const u of users) {
      if (!u || u.id === _wrMember?.id) continue;
      const trips = _space_trips_of(u);
      for (const t of trips) {
        // Abgelaufene Flüge nicht zeichnen: der Besitzer holt sie beim nächsten Öffnen
        // ab, bis dahin stünde sonst ein Geisterschiff auf dem Zielplaneten.
        const r = Date.parse(t.returnAt);
        if (isFinite(r) && r <= now) continue;
        out.push({ id: u.id, name: u.name || 'Clan-Mitglied', color: wrMemberColor(u.id), trip: t });
      }
    }
  } catch (e) { /* eine fremde Flotte darf die Karte nie zerlegen */ }
  return out;
}
// Reisen eines BELIEBIGEN Mitglieds. `wrTrips(m)` tut dasselbe, liest aber implizit den
// eigenen Zustand mit — deshalb hier eine Fassung ohne Nebenwirkungen.
function _space_trips_of(u) {
  const away = u?.space?.fleets?.away;
  if (!away || typeof away !== 'object') return [];
  if (Array.isArray(away.trips)) return away.trips.filter(t => t && t.planetId);
  return (away.planetId && away.startAt) ? [away] : [];
}

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
      // 📡 Geortete Quadranten (wt_e6) tragen ein Sensor-Symbol statt der leeren Schwade —
      // der Nebel bleibt, aber er ist nicht mehr blind.
      const sensed = wrSensed(q);
      ctx.fillText(sensed ? '📡' : '🌫️', x, y - 4);
      ctx.font = '10px system-ui';
      ctx.fillStyle = wrScoutable(q) ? '#9fd1ff' : 'rgba(200,200,220,.4)';
      ctx.fillText(wrScoutable(q) ? 'aufklärbar' : 'zu weit', x, y + 20);
      // Zweite Zeile nur bei Ortung: Planetenzahl und Wächterstärke — genau die zwei
      // Zahlen, nach denen man das Sondenziel wählt.
      if (sensed) {
        const it = wrSensorIntel(q);
        if (it) {
          ctx.font = '10px system-ui'; ctx.fillStyle = '#ffc94a';
          ctx.fillText(`${it.planets} Pl · 🛡️ ${wrFmt(it.strength)}`, x, y + 33);
          if (it.ring > 0 || it.wreck > 0) {
            ctx.fillStyle = '#a88fe0';
            ctx.fillText(`${it.ring ? `${it.ring}× 🟣/🌀 ` : ''}${it.wreck ? `${it.wreck}× ♻️` : ''}`.trim(), x, y + 45);
          }
        }
      }
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

  // 🛰️ 27s: die Flotten der anderen — dünner, farbiger, mit Namen. Bewusst NACH der
  // eigenen gezeichnet? Nein: DAVOR wäre falsch herum. Sie liegen UNTER der eigenen,
  // damit die eigene Flotte im Gedränge immer obenauf bleibt — deshalb steht dieser
  // Block direkt hier, nach der eigenen Schleife, mit kleinerem Radius und Alpha.
  for (const o of wrOtherTrips()) {
    const tp = (_wrGalaxy?.planets || []).find(p => p.id === o.trip.planetId);
    if (!tp) continue;
    const tc = wrPlanetPos(tp, cx, cy, size);
    const st = Date.parse(o.trip.startAt), ar = Date.parse(o.trip.arriveAt),
          rt = Date.parse(o.trip.returnAt), now = Date.now();
    let f = (now <= ar) ? ((ar > st) ? (now - st) / (ar - st) : 1)
                        : ((rt > ar) ? 1 - (now - ar) / (rt - ar) : 0);
    f = Math.max(0, Math.min(1, f));
    const fx = cx + (tc.x - cx) * f, fy = cy + (tc.y - cy) * f;

    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = o.color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tc.x, tc.y); ctx.stroke();
    ctx.setLineDash([]);
    // Der „farbige Rand" (JP, Muster Kaffee-Mobil): ein Ring in der Spielerfarbe um das
    // Leitschiff. Ohne ihn wäre auf einer Karte mit mehreren Flotten nicht erkennbar,
    // wem welche gehört — das Schiffsbild allein sagt nur die Klasse.
    ctx.beginPath(); ctx.arc(fx, fy, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,11,24,.75)'; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = o.color; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lead = wrLeadShip(o.trip.ships || {});
    if (!(lead && wrDrawImg(ctx, lead.art, fx, fy, 22))) {
      ctx.font = '12px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(lead?.icon || '🚀', fx, fy);
    }
    ctx.font = '9px system-ui'; ctx.fillStyle = o.color;
    ctx.fillText(o.name, fx, fy + 20);
    ctx.restore();
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

// ⚠️ FIX 2026-07-30 (JP: „man kann unter Raumhafen die Dauerernte und Wracks bergen die
// Flotten nicht erhöhen, sie reagiert nicht direkt beim Klicken").
//
// BEFUND: Diese Funktion zeichnet AUSSCHLIESSLICH `#wr-detail` neu — das Detail-Panel der
// Sternkarte. Seit die Routen-, Rückfall- und Verteidigungs-Panels auch im
// Kolonie-Akkordeon unter 🛰️ Raumhafen stehen (Teil 22), liegen dieselben +/−-Knöpfe an
// einem Ort, an dem es `#wr-detail` gar nicht gibt: der Zähler stieg intern (`_wrRouteSel`),
// aber nichts wurde neu gezeichnet — der Klick wirkte tot.
//
// MERKE: Sobald ein Panel an einer ZWEITEN Stelle wiederverwendet wird, ist jede
// Aktualisierung, die einen festen Container-Namen annimmt, ein stiller Fehler. Der
// Rückfall auf den vollen Render ist hier richtig: auf der Karte bleibt es beim billigen
// Teil-Redraw (Canvas bleibt stehen), überall sonst wird der ganze Tab neu gebaut.
// ⚠️ ZWEITER ANLAUF (JP 2026-07-30: „reagiert weiterhin nicht"). Der erste Fix prüfte
// `document.getElementById('wr-detail')` — und das schlägt IMMER an: wrRender() baut alle
// Tab-Container in einem Rutsch und blendet die inaktiven nur mit `hidden` aus. Das
// Element ist also auch auf dem Raumhafen-Tab da, nur unsichtbar; der Rückfall auf
// wrRender() wurde nie erreicht und der Klick blieb wirkungslos wie zuvor.
//
// ⚠️ ÜBERTRAGBARE LEHRE: `hidden` heisst NICHT „nicht im DOM". Eine Existenzprüfung auf
// ein bloss verstecktes Element ist immer wahr — die richtige Frage ist, welcher Tab
// gerade AKTIV ist (`_wrTab`), nicht ob ein Container existiert.
function wrRefreshDetail() {
  const d = document.getElementById('wr-detail');
  // Nur auf der Sternkarte lohnt der billige Teil-Redraw (er lässt den Canvas stehen).
  if (_wrTab === 'karte' && d) { d.innerHTML = wrDetailHtml(_wrMember); return; }
  wrRender();
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
    const geninfo = e.target.closest('[data-wr-geninfo]');
    if (geninfo) { wrPowerLightbox(geninfo.dataset.wrGeninfo); return; }
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
    // ⚡ 27ac: Der Boost-Knopf gehört in DIESELBE Ausnahmeliste. Ein neuer Knopf in der
    // Karte, der nicht hier steht, öffnet nur die Lightbox — genau der Fehler, den JP
    // beim Zurückrufen gemeldet hat. Wer hier einen Knopf ergänzt, ergänzt ihn zweimal.
    const boostBtn = e.target.closest('[data-wr-boost]');
    if (boostBtn && !boostBtn.disabled) { await wrTripBoost(boostBtn.dataset.wrBoost); return; }
    const tripCard = e.target.closest('[data-wr-tripcard]');
    if (tripCard && !e.target.closest('[data-wr-claim]') && !e.target.closest('[data-wr-recall]')
        && !e.target.closest('[data-wr-boost]')) { wrFleetLightbox(tripCard.dataset.wrTripcard); return; }

    // Raumhafen: Ausbau + Geschütze
    // 🛰️ 27s: Mitspieler-Flotten ein/aus. Nur Karte neu zeichnen, kein wrRender() —
    // ein voller Neuaufbau würde offene Akkordeons und Auswahlen mit zurücksetzen.
    // ⚠️ Der KNOPF selbst muss trotzdem neu, sonst zeigt er weiter das alte Symbol;
    // deshalb wird er hier direkt umgeschrieben statt über einen Render-Umweg.
    const othBtn = e.target.closest('[data-wr-others]');
    if (othBtn) {
      _wrShowOthers = !_wrShowOthers;
      try { localStorage.setItem(_WR_OTHERS_KEY, _wrShowOthers ? '1' : '0'); } catch (err) {}
      othBtn.textContent = _wrShowOthers ? '👥' : '👤';
      othBtn.title = `Flotten der Mitspieler ${_wrShowOthers ? 'ausblenden' : 'einblenden'}`;
      othBtn.classList[_wrShowOthers ? 'add' : 'remove']('wr-zoom-on');
      wrDrawMap();
      wrRender();      // die Legende nennt Zustand und Anzahl — die muss mit
      return;
    }
    if (e.target.closest('#wr-port-up')) { await wrDefense('port_upgrade', null, null); return; }
    if (e.target.closest('#wr-yard-up'))  { await wrDefense('yard_upgrade', null, null); return; }
    if (e.target.closest('#wr-job-claim')) { await wrClaimBuild(false); return; }
    // 🏙️ Zur betroffenen Kolonie springen (Raumhafen → Abschnitt Kolonien → aufklappen).
    const goCol = e.target.closest('[data-wr-goto-colony]');
    if (goCol) {
      const pid = goCol.getAttribute('data-wr-goto-colony');
      _wrTab = 'hafen';          // wrSetTab() würde bei gleichem Tab früh aussteigen
      _wrSec.colonies = true;    // Abschnitt offen, falls zugeklappt
      _wrColOpen = pid;          // genau diese Kolonie aufklappen
      wrRender();
      // Nach dem Neuaufbau zur Kolonie scrollen — sonst landet man oben und sucht sie.
      setTimeout(() => {
        try {
          document.querySelector(`[data-wr-coltoggle="${pid}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {}
      }, 60);
      return;
    }
    // ⚔️ Fälligen Angriff von Hand auswerten.
    // ⚠️ Der automatische Lauf beim Tab-Öffnen bleibt — dieser Knopf ist der sichtbare
    // Weg für den Fall, dass er nicht gegriffen hat. Und er MELDET Fehler, während der
    // automatische Lauf sie schluckt (Regel 3): so wird ein Problem überhaupt sichtbar.
    const resAtk = e.target.closest('[data-wr-resolve-attack]');
    if (resAtk) {
      if (_wrBusy) return;
      const pid = resAtk.getAttribute('data-wr-resolve-attack');
      _wrBusy = true;
      try {
        const res = await DB.resolveColonyAttack(_wrMember.id, pid);
        if (!res || res.error) { wrToast(wrErrText(res && res.error), 'error'); return; }
        if (res.nothing) { wrToast('Dieser Angriff ist bereits erledigt.', 'info'); }
        _wrGalaxy  = await DB.fetchGalaxy();
        _wrAttacks = await DB.fetchColonyAttacks(_wrMember.id);
        if (res.resolved) {
          const r = res.report || {};
          wrToast(res.outcome === 'held'
            ? `🛡️ Angriff auf ${r.planet} abgewehrt (${r.turretsHit} Geschütz(e) beschädigt)`
            : res.outcome === 'partial'
              ? `💥 ${r.planet}: gehalten hat es nicht — Stufe ${r.levelAfter}, alle Geschütze Wracks`
              : `☠️ Kolonie ${r.planet} verloren`,
            res.outcome === 'held' ? 'success' : 'error');
        }
        wrRender();
      } catch (err) {
        wrToast('Auswertung fehlgeschlagen: ' + err.message, 'error');
      } finally { _wrBusy = false; }
      return;
    }
    // 🎖️ 26x: Söldner anheuern.
    const mrc = e.target.closest('[data-wr-merc]');
    if (mrc) {
      if (_wrBusy) return;
      const sq = WR_MERC_SQUADS.find(s => s.key === mrc.getAttribute('data-wr-merc'));
      if (!sq) return;
      _wrBusy = true;
      try {
        const res = await DB.hireSpaceMerc(_wrMember.id, sq.ships);
        if (!res || res.error) { wrToast(wrErrText(res && res.error), 'error'); return; }
        if (res.space) wrApplySpace(res.space);
        wrToast(`🎖️ ${sq.name} angeheuert (${wrFmt(res.cc)} CC, ${res.days} Tage)`, 'success');
        // ⚠️ Chat ist reiner Text (Teil 23) — Betonung nur über Emoji.
        try {
          wrChat(`🎖️ ${_wrEsc(_wrMember?.name || 'Jemand')} hat ein Söldner-Geschwader `
               + `angeheuert: ${_wrEsc(sq.name)}, ${wrFmt(res.count)} Schiffe für `
               + `${res.days} Tage.`);
        } catch (err) {}
        wrRender();
      } catch (err) {
        wrToast('Anheuern fehlgeschlagen: ' + err.message, 'error');
      } finally { _wrBusy = false; }
      return;
    }
    // 🎖️ 26x: Bewachung umstellen (leerer Wert = zurück an den Raumhafen).
    const grd = e.target.closest('[data-wr-merc-guard]');
    if (grd) {
      if (_wrBusy) return;
      const pid = grd.getAttribute('data-wr-merc-guard') || null;
      _wrBusy = true;
      try {
        const res = await DB.setSpaceMercGuard(_wrMember.id, pid || null);
        if (!res || res.error) { wrToast(wrErrText(res && res.error), 'error'); return; }
        if (res.space) wrApplySpace(res.space);
        wrToast(pid ? '🎖️ Geschwader bewacht die Kolonie' : '🎖️ Geschwader am Raumhafen', 'info');
        wrRender();
      } catch (err) {
        wrToast('Umstellen fehlgeschlagen: ' + err.message, 'error');
      } finally { _wrBusy = false; }
      return;
    }
    // 🛠️ 26v: Wrack reparieren — ganz oder gar nicht.
    const rep = e.target.closest('[data-wr-repair]');
    if (rep) {
      if (_wrBusy) return;
      const [pid, slot] = (rep.getAttribute('data-wr-repair') || '').split(':');
      if (!pid || !slot) return;
      _wrBusy = true;
      try {
        const res = await DB.repairPlanetTurret(_wrMember.id, pid, slot);
        if (!res || res.error) { wrToast(wrErrText(res && res.error), 'error'); return; }
        if (res.space) wrApplySpace(res.space);
        _wrGalaxy = await DB.fetchGalaxy();
        wrToast(`🛠️ ${SPACE_TURRET_BY_KEY[res.type]?.name || 'Geschütz'} repariert `
              + `(${wrFmt(res.cc)} CC)`, 'success');
        wrRender();
      } catch (err) {
        wrToast('Reparatur fehlgeschlagen: ' + err.message, 'error');
      } finally { _wrBusy = false; }
      return;
    }
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
    // ⚡ Energie-Generator (26p). Er hat KEINEN Bauplatz — slot bleibt null, die RPC
    // prüft bei diesen drei Aktionen bewusst vor der Slot-Prüfung.
    if (e.target.closest('#wr-power-up')) { await wrDefense('power_upgrade', null, null); return; }
    const gb = e.target.closest('[data-wr-genbuild]');
    if (gb && !gb.disabled) { await wrDefense('power_build', null, gb.dataset.wrGenbuild); return; }
    const gc = e.target.closest('[data-wr-genconv]');
    if (gc && !gc.disabled) { await wrDefense('power_convert', null, gc.dataset.wrGenconv); return; }

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
    // 🌌 Von der Kolonie-Liste zur Sternkarte springen (JP 2026-07-30). Wählt den Planeten
    // aus UND wechselt den Tab — wrSetTab rendert selbst, deshalb danach kein wrRender().
    const cm = e.target.closest('[data-wr-colmap]');
    if (cm) {
      const pl = wrPlanetById(cm.dataset.wrColmap);
      if (pl) { _wrSel = { planet: pl }; wrSetTab('karte'); }
      return;
    }
    // 📂 Abschnitts-Akkordeon auf/zu (Geschütze, Kolonien, Ungeschützt, Wrack, Abbau)
    const sec = e.target.closest('[data-wr-sec]');
    if (sec) {
      const k = sec.dataset.wrSec;
      _wrSec[k] = !wrSecOpen(k);
      wrRender();
      return;
    }
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
    // ⛽ 26s: Reaktor betanken. Format „<planetId|->:<menge>" — '-' ist der Raumhafen.
    const rf = e.target.closest('[data-wr-refuel]');
    if (rf && !rf.disabled) {
      const [wo, amt] = rf.dataset.wrRefuel.split(':');
      await wrRefuel(wo === '-' ? null : wo, parseInt(amt, 10) || 0);
      return;
    }
    const inj = e.target.closest('[data-wr-inject]');
    if (inj && !inj.disabled) { await wrInjectLoad(parseInt(inj.dataset.wrInject, 10) || 0); return; }
    // 🛸 Kolonie-Verband automatisch zusammenstellen (sichtbarer Weg zur Automatik).
    const kf = e.target.closest('[data-wr-kitfill]');
    if (kf) {
      try {
        const ring = parseInt(kf.dataset.wrKitfill, 10) || 1;
        const ok = wrColonyFleetFill(_wrMember, ring);
        wrRefreshDetail();
        const rest = wrColonyKitMissing(_wrMember, ring, wrSyncFleetSel(_wrMember));
        wrToast(ok
          ? (rest.length
              ? '🛸 Verband steht — es fehlt noch: '
                + rest.map(x => `${wrKitLabel(x.was)} ${wrFmt(x.have)}/${wrFmt(x.need)}`).join(' · ')
              : '🛸 Verband steht — bereit zum Kolonisieren.')
          : '🛸 Es fehlen Schiffe: '
            + rest.filter(x => x.schiff)
                  .map(x => `${wrKitLabel(x.was)} ${wrFmt(x.have)}/${wrFmt(x.need)}`).join(' · '),
          ok && !rest.length ? 'success' : 'info');
      } catch (err) { wrToast('Zusammenstellen fehlgeschlagen: ' + err.message, 'error'); }
      return;
    }
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

    // 🛡️ 27k: Garnison — Modus, Stückzahlen, Absenden.
    const garMode = e.target.closest('[data-wr-garmode]');
    if (garMode) {
      _wrGarMode = garMode.dataset.wrGarmode === 'recall' ? 'recall' : 'garrison';
      _wrGarSel = null;                 // Auswahl gehört zum Modus, nicht zum Planeten
      wrRender(); return;
    }
    const garStep = e.target.closest('[data-wr-gar]');
    if (garStep && !garStep.disabled) {
      const [pid, key, d] = garStep.dataset.wrGar.split(':');
      if (!_wrGarSel || _wrGarSel.planetId !== pid) _wrGarSel = { planetId: pid, ships: {} };
      // Obergrenze der QUELLE (Hafen bzw. Garnison) — der Stepper darf nie mehr anbieten,
      // als tatsächlich da ist, sonst läuft man in einen Serverfehler.
      const quelle = _wrGarMode === 'recall'
        ? wrGarrisonShips(_wrMember, pid) : wrHomeShips(_wrMember);
      const max = parseInt(quelle[key], 10) || 0;
      const cur = parseInt(_wrGarSel.ships[key], 10) || 0;
      _wrGarSel.ships[key] = Math.max(0, Math.min(max, cur + parseInt(d, 10)));
      wrRender(); return;
    }
    const garSend = e.target.closest('[data-wr-garsend]');
    if (garSend && !garSend.disabled) { await wrGarrisonSend(garSend.dataset.wrGarsend); return; }

    // ⬅️ 27m: alles von einer Kolonie zurückholen (Flotten-Tab). Setzt dieselbe Auswahl,
    // die der Stepper im Kolonie-Panel füllen würde, und ruft denselben Weg — KEIN
    // zweiter Absendepfad. Ein eigener wäre die Gelegenheit, eine der Prüfungen
    // (Transport läuft, eingemottet, Bestand) genau hier zu vergessen.
    const garPull = e.target.closest('[data-wr-garpull]');
    if (garPull && !garPull.disabled) {
      const pid   = garPull.dataset.wrGarpull;
      const ships = wrGarrisonShips(_wrMember, pid);
      const alle  = {};
      for (const [k, v] of Object.entries(ships)) {
        const n = parseInt(v, 10) || 0;
        if (n > 0) alle[k] = n;
      }
      if (!Object.keys(alle).length) { wrToast('Auf dieser Kolonie steht nichts.', 'error'); return; }
      _wrGarMode = 'recall';
      _wrGarSel  = { planetId: pid, ships: alle };
      await wrGarrisonSend(pid);
      return;
    }

    // 🧊 Eingemottete Flotte auslösen (JP 2026-08-20). wrsUnmothball() gab es seit 26w,
    // aber KEIN Knopf rief sie auf — der Weg zurück war nur über die Konsole erreichbar.
    // typeof-geguarded: weltraum_sold.js kann fehlen, ohne dass der Tab bricht (Regel 3).
    if (e.target.closest('[data-wr-unmothball]')) {
      if (typeof wrsUnmothball === 'function') await wrsUnmothball();
      else wrToast('Flottensold-Modul nicht geladen — bitte Seite neu laden.', 'error');
      return;
    }

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
    // ⚠️ 27ac: BEIDE Speichern-Knöpfe. Der im Flotten-Tab hat ein Namensfeld daneben,
    // der auf der Sternkarte nicht — `wrTplSave` liest das Feld ohnehin über
    // `getElementById` und vergibt ohne Feld einen laufenden Namen. Deshalb genügt
    // hier derselbe Aufruf; ein zweiter Speicher-Weg wäre die zweite Wahrheit.
    if (e.target.closest('#wr-tpl-save') || e.target.closest('#wr-fs-tplsave')) {
      await wrTplSave(); return;
    }
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
  if (intent === 'colonize') {
    // 🛸 27e: Doppelflug abfangen, BEVOR irgendetwas zusammengestellt oder gesendet wird.
    const inb = wrColonizeInbound(planet.id);
    if (inb) {
      wrToast(inb.self
        ? `🛸 Deine Kolonie-Mission fliegt bereits dorthin — Ankunft in ${wrCountdown(Date.parse(inb.arriveAt) - Date.now())}.`
        : `🛸 ${inb.name} fliegt diesen Planeten bereits an — Ankunft in ${wrCountdown(Date.parse(inb.arriveAt) - Date.now())}.`,
        'error');
      return;
    }
    // 🏛️ Erster Klick bei unvollständiger Auswahl: Verband automatisch zusammenstellen
    // statt abzulehnen (JP 2026-08-17). Bewusst KEIN Sofortstart danach — eine Mission,
    // die dauerhaft 30 Jäger und 8 Kutter verbraucht, soll nicht aus einem einzigen
    // Klick entstehen. Der Spieler sieht erst, was zusammengestellt wurde.
    //
    // ⚠️ 2026-08-22 GERADEGEZOGEN. Der alte Ablauf hatte zwei Ausgänge und einen davon
    // falsch beschriftet: bei fehlendem ROHSTOFF galt das Zusammenstellen als
    // gescheitert, die Auswahl war aber bereits ersetzt — der Spieler sah seine eigene
    // Zusammenstellung verschwinden und daneben „unvollständig". Genau das meint JP mit
    // „ist jetzt wieder deaktiviert": die Automatik lief, sie sagte es nur nicht.
    // Jetzt EIN Durchgang: zusammenstellen, übernehmen, dann sagen, was übrig bleibt.
    if (wrColonyKitMissing(m, planet.ring, fleet).length) {
      const vorher = JSON.stringify(fleet);
      wrColonyFleetFill(m, planet.ring);
      wrRefreshDetail();
      // ⚠️ `fleet` ist `const` — den Inhalt austauschen statt die Bindung. (Ein
      // `fleet = …` hätte `node --check` klaglos passiert und wäre erst beim Klick als
      // „Assignment to constant variable" hochgekommen: derselbe Mechanismus wie bei den
      // plpgsql-Körpern, nur in JS.)
      for (const k of Object.keys(fleet)) delete fleet[k];
      for (const [k, n] of Object.entries(wrSyncFleetSel(m))) if (n > 0) fleet[k] = n;

      // ⚠️ Alle fehlenden Posten auf einmal nennen — vier Anläufe für vier Meldungen
      // wären genau die Zumutung, die der Server bereits vermeidet (er sammelt sie
      // ebenfalls). Schiffe und Rohstoffe getrennt: das eine baut die Werft, das andere
      // bringt eine Ernte — zwei verschiedene Wege für den Spieler.
      const rest   = wrColonyKitMissing(m, planet.ring, fleet);
      const schiff = rest.filter(x => x.schiff);
      const roh    = rest.filter(x => !x.schiff);
      if (schiff.length) {
        wrToast('🛸 Es fehlen Schiffe für die Kolonie-Mission: '
          + schiff.map(x => `${wrKitLabel(x.was)} ${wrFmt(x.have)}/${wrFmt(x.need)}`).join(' · '), 'error');
        return;
      }
      if (roh.length) {
        wrToast('🛸 Verband steht — es fehlt noch: '
          + roh.map(x => `${wrKitLabel(x.was)} ${wrFmt(x.have)}/${wrFmt(x.need)}`).join(' · '), 'error');
        return;
      }
      if (vorher !== JSON.stringify(fleet)) {
        wrToast('🛸 Verband zusammengestellt — nochmal auf Kolonisieren drücken zum Start.', 'info');
        return;
      }
    }
  }
  if (intent === 'harvest'  && wrFleetMine(fleet) < 1) { wrToast('Ohne ⛏️ Röstkometen gibt es nichts abzubauen.', 'error'); return; }
  if (intent === 'attack'   && wrFleetPower(fleet) < 1) { wrToast('Dieser Verband hat keine Kampfkraft.', 'error'); return; }

  // 💰 EINSATZKOSTEN-Vorabcheck (27ac). Gleiche Bauart wie die Treibstoff-Checks
  // darunter: der Server prüft autoritativ nochmal, aber der Spieler soll den Grund
  // schon vor dem Klick sehen — und er sieht ihn: die Zahl steht im Verband-Picker.
  // ⚠️ Bei der Kolonie-Mission wird NICHT hier geprüft. Dort kommt das Kit hinzu, und
  // der Server nennt Kit + Einsatzkosten in EINER Zahl (`colony_kit_incomplete`).
  // Zwei Prüfungen mit zwei Zahlen für denselben Klick wären genau die Zumutung, die
  // 27e schon einmal beseitigt hat.
  const einsatz = wrDispatchCc(fleet);
  if (intent !== 'colonize' && einsatz > 0 && (parseFloat(m?.coins) || 0) < einsatz) {
    wrToast(`Nicht genug CC für den Einsatz: das Absenden kostet ${wrFmt(einsatz)} CC `
          + `(3× Kampfkraft ${wrFmt(wrFleetPower(fleet))}), du hast `
          + `${wrFmt(Math.floor(parseFloat(m?.coins) || 0))} CC.`, 'error');
    return;
  }

  // 💎 Treibstoff-Vorabcheck (Server prüft autoritativ nochmal — 22h/27aa)
  const fuel = wrTripFuel(fleet, planet.ring);
  if (fuel > 0 && wrKristall(m) < fuel) {
    wrToast(`Nicht genug 💎 Kristall als Treibstoff: Reise braucht ${wrFmt(fuel)}, du hast ${wrFmt(wrKristall(m))}.`, 'error');
    return;
  }
  // 🟣🌀 27aa: Exoten-Treibstoff. JP-Entscheidung: Start verweigern wie beim Kristall
  // — eine Regel, kein Sonderfall. Die Meldung nennt den Rohstoff, sonst steht der
  // Spieler vor einem „geht nicht" ohne Grund.
  {
    const exo = wrTripExoFuel(fleet, planet.ring);
    if (exo.pla > 0 && wrPlasmoid(m) < exo.pla) {
      wrToast(`Nicht genug 🟣 Plasmoiden-Staub als Treibstoff: Reise braucht ${wrFmt(exo.pla)}, du hast ${wrFmt(wrPlasmoid(m))}.`, 'error');
      return;
    }
    if (exo.qua > 0 && wrQuantum(m) < exo.qua) {
      wrToast(`Nicht genug 🌀 Quantenschaum als Treibstoff: Reise braucht ${wrFmt(exo.qua)}, du hast ${wrFmt(wrQuantum(m))}.`, 'error');
      return;
    }
  }

  _wrBusy = true;
  try {
    const res = await DB.startSpaceTrip(m.id, planet.id, intent, fleet, wrSpeedPct(m));
    if (!res || res.error) {
      // ⚠️ `colony_kit_incomplete` und `region_too_strong` liefern KONKRETE Angaben mit.
      // Sie zu verwerfen und nur den Code anzuzeigen war der eigentliche Ärger: die
      // Antwort auf „warum nicht?" lag vor und wurde weggeworfen.
      if (res?.error === 'colony_kit_incomplete' && Array.isArray(res.missing)) {
        wrToast(`Ring ${res.ring}: es fehlen `
          + res.missing.map(x => `${wrKitLabel(x.what)} ${wrFmt(x.have)}/${wrFmt(x.need)}`).join(' · '),
          'error');
      } else if (res?.error === 'not_enough_exo') {
        // ⚠️ Wie bei `colony_kit_incomplete`: die Antwort auf „warum nicht?" liegt in
        // der Serverantwort. Sie zu verwerfen und nur den Code zu zeigen war genau der
        // Ärger, den 26u/27e schon einmal behoben haben.
        const rm = wrResMeta(res.what);
        wrToast(`Nicht genug ${rm.icon} ${rm.name} als Treibstoff: Reise braucht `
              + `${wrFmt(res.need)}, du hast ${wrFmt(res.have)}.`, 'error');
      } else if (res?.error === 'region_too_strong') {
        wrToast(`Diese Region gehört jemand anderem — dein Verband bringt ⚔️ ${wrFmt(res.have)}, `
              + `nötig sind ${wrFmt(res.need)} (das 1,15-fache der Regionsverteidigung).`, 'error');
      } else {
        wrToast(wrErrText(res?.error), 'error');
      }
      return;
    }
    if (res.space) wrApplySpace(res.space);
    const info = SPACE_INTENTS[intent] || {};
    // JP 2026-07-22 (#32): „zurück in 30 Min" ergab bei der Kolonie keinen Sinn —
    // das Kolonieschiff BLEIBT am Ziel.
    // ⚠️ TEXT KORRIGIERT 2026-08-17: hier stand „der Rest kehrt zurück". Seit 26y stimmt
    // das nicht mehr — der GANZE Begleitverband geht bei der Gründung im Rumpf auf. Der
    // Text beschrieb also weiter die Welt vor der Regeländerung, und der Spieler hätte
    // seine 30 Jäger zurückerwartet. Genau die Sorte Text, die wie ein Fehler aussieht,
    // wenn die Schiffe dann nicht kommen.
    // ⚠️ 27aa: Die Meldung nannte nur den Kristall. Der Exoten-Treibstoff wäre sonst
    // eine stille Abbuchung — Rohstoffe, die verschwinden, ohne dass irgendwo steht,
    // wohin (Regel 4: die Regel dort, wo man auf sie trifft).
    //
    // ⚠️ 27ab (JP: „beim Losschicken einer Flotte werden nicht die Kosten angezeigt mit
    // den assets"): DREI Darstellungen desselben Postens, weil drei Ziele drei Formate
    // verlangen — und das ist kein Wildwuchs, sondern eine Eigenschaft der Ziele:
    //   • Toast    → HTML mit Bild-Hüllen (`showToast` kann das seit 27z per Opt-in)
    //   • Chat     → `[[s:key]]`-Token, die `_chatArt` in app.js zu Bildern macht
    //   • Konsole  → keiner von beiden; der Toast-Text ist dort der Rückfall
    // Gebaut aus EINEM Objekt, damit die Zahlen nicht auseinanderlaufen können.
    const fuelObj  = { kri: res.fuel, pla: res.fuelPla, qua: res.fuelQua };
    const fuelHtml = wrResListe(fuelObj, '', '−');
    const fuelTxt  = fuelHtml ? ` · ⛽ ${fuelHtml}` : '';
    // Chat-Fassung: dieselben Zahlen, aber als Token — im Chat wird kein HTML gerendert.
    const fuelTok = [['kristall', res.fuel], ['plasmoid', res.fuelPla], ['quantum', res.fuelQua]]
      .filter(([, n]) => (n || 0) > 0)
      .map(([k, n]) => `−${wrFmt(n)} ${wrArtTok(k)}`).join(' · ');
    // 💰 27ac: die Absendekosten stehen in derselben Zeile wie der Treibstoff — es ist
    // derselbe Posten „was dieser Start gekostet hat". Der Betrag kommt aus der
    // SERVER-Antwort, nicht aus dem Client-Spiegel: was abgebucht wurde, entscheidet
    // der Server (die Lehre aus 22e — der Client versprach 4.080, es waren 6.400).
    const dispCc  = Math.round(parseFloat(res.dispatchCc) || 0);
    const dispTxt = dispCc > 0 ? ` · 💰 −${wrFmt(dispCc)} CC Einsatz` : '';
    wrToast(intent === 'colonize'
      ? `🛸 Kolonie-Mission gestartet — Gründung bei Ankunft in ${wrCountdown(Date.parse(res.trip.arriveAt) - Date.now())}. `
        + `Der Verband geht bei der Gründung im Rumpf auf und kehrt NICHT zurück`
        + `${res.colonyCc ? ` · 💰 −${wrFmt(res.colonyCc)} CC` : ''}${dispTxt}${fuelTxt}`
      : `${info.icon || '🚀'} Flotte gestartet — zurück in ${wrCountdown(Date.parse(res.trip.returnAt) - Date.now())}${dispTxt}${fuelTxt}`,
      // ⚠️ `true` = HTML erlaubt. Zulässig, weil in dieser Zeichenkette KEIN fremder
      // Text steckt — nur Zahlen, feste Wörter und selbst erzeugte Bild-Hüllen.
      // Planeten- und Spielernamen stehen bewusst nur in der Chat-Fassung unten.
      'success', true);

    // Chat: offene Werft-Käufe zuerst rausschreiben, damit die Reihenfolge stimmt
    wrBuyFlush();
    const list = Object.entries(fleet)
      .map(([k, n]) => `${wrArtTok(k)} ${n}`).join(' · ');
    // ⏱️ Flugzeit stand hier schon — aber IMMER als „zurück in", auch bei einer
    // Kolonie-Mission, von der nichts zurückkommt (der Verband geht seit 26y im Rumpf auf).
    // ⚠️ Texte veralten mit Regeländerungen (Lehre aus Teil 32, Punkt 10): die Meldung
    // beschrieb eine Rückkehr, die es nicht mehr gibt. Jetzt Ankunft statt Rückkehr.
    const ankunft = wrCountdown(Date.parse(res.trip.arriveAt) - Date.now());
    // ⛽ 27ab (JP: „die Flugkosten sollen ebenfalls im chat oder im protokoll aufgeführt
    // werden"). Anders als bei der Ernte ist der Chat hier der RICHTIGE Ort: ein Start
    // ist eine bewusste, seltene Handlung (höchstens 5 Verbände gleichzeitig) und geht
    // den Clan an — die Ernte lief dagegen bei jedem Tab-Öffnen und hätte gespammt.
    //   ⚠️ Dieselbe Frage, zwei gegensätzliche Antworten: „ins Protokoll" entscheidet
    //   sich an der HÄUFIGKEIT des Ereignisses, nicht am Ereignistyp.
    // Über `wrChat` landet die Zeile automatisch auch im 📜-Protokoll (Marker [[wr]]).
    wrChat(`${info.icon || '🚀'} ${_wrEsc(m.name)} schickt einen Verband (${list}) zum ${_wrEsc(planet.name)} — `
         + `Auftrag: ${_wrEsc(info.name || intent)}, ` + (intent === 'colonize'
            ? `Ankunft in ${ankunft}, der Verband kehrt nicht zurück.`
            : `Ankunft in ${ankunft}, zurück in ${wrCountdown(Date.parse(res.trip.returnAt) - Date.now())}.`)
         + (fuelTok ? ` ⛽ Treibstoff: ${fuelTok}` : '')
         + (dispCc > 0 ? ` 💰 Einsatzkosten: −${wrFmt(dispCc)} CC` : ''));

    // 📒 CLAUDE.md Regel 1 (Statistik-Vollständigkeit): die Einsatzkosten sind eine
    // neue, wiederkehrende CC-Ausgabe und gehören ab dem ERSTEN Tag ins Tages-Log —
    // nicht nachgezogen. Eigene Kategorie, damit im Profil sichtbar wird, was der Krieg
    // kostet; `aggKey` fasst mehrere Starts eines Tages zu EINER Zeile zusammen (dieselbe
    // Verdichtung wie beim Transmuter, JP: „bitte auf einen Tag zusammenfassen").
    // ⚠️ try/catch: ein fehlgeschlagener Log-Eintrag darf einen laufenden Start nie kippen.
    if (dispCc > 0) {
      try {
        await DB.appendTodayLogFresh(m.id, [{
          label: '🚀 Flotten-Einsatzkosten', amount: -dispCc, cat: 'weltraum',
          detail: `${info.name || intent} → ${planet.name}`,
          aggKey: 'space_dispatch', aggBase: '🚀 Flotten-Einsatzkosten' }]);
      } catch (e) { console.warn('Einsatzkosten nicht geloggt:', e); }
    }
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
    // Toast rendert KEIN HTML → hier bleiben es bewusst Emoji (die Regel steht an WR_IC).
    const paid = [`${wrFmt(res.cc || 0)} CC`]
      .concat(res.erz ? [`${wrFmt(res.erz)} 🪨`] : [])
      .concat(res.kristall ? [`${wrFmt(res.kristall)} 💎`] : [])
      .concat(res.plasmoid ? [`${wrFmt(res.plasmoid)} 🟣`] : [])
      .concat(res.quantum ? [`${wrFmt(res.quantum)} 🌀`] : []).join(' · ');
    wrToast(`🏗️ ${wrFmt(total)} Schiff(e) in Bau — fertig in ${wrDur(longest)} (${paid})`, 'success');

    // 📒 Handover §6 / CLAUDE.md Regel 1: Schiffbau ist die grösste laufende CC-Ausgabe
    // im Weltraum und fehlte im Tages-Log komplett — im Profil war nicht zu sehen, wohin
    // das Geld ging. Rohstoffe stehen in der Detailzeile, weil das Log nur CC beziffert.
    // ⚠️ Die Beträge kommen aus der SERVER-Antwort (Werft-Rabatt + Raffinerie sind darin
    // schon berücksichtigt), nicht aus den Basispreisen — sonst weicht das Log von der
    // echten Abbuchung ab. try/catch: ein Log-Eintrag darf einen Bauauftrag nie kippen.
    try {
      const roh = [];
      if (res.erz)      roh.push(`${wrFmt(res.erz)} Erz`);
      if (res.kristall) roh.push(`${wrFmt(res.kristall)} Kristall`);
      if (res.plasmoid) roh.push(`${wrFmt(res.plasmoid)} Plasmoid`);
      if (res.quantum)  roh.push(`${wrFmt(res.quantum)} Quantenschaum`);
      const was = lines.map(l => `${l.count}× ${SPACE_SHIP_BY_KEY[l.ship]?.name || l.ship}`).join(', ');
      await DB.appendTodayLogFresh(_wrMember.id, [{
        label: '🛠️ Schiffbau', amount: -(res.cc || 0), cat: 'weltraum',
        detail: was + (roh.length ? ` · ${roh.join(' · ')}` : ''),
        aggKey: 'space_build', aggBase: '🛠️ Schiffbau' }]);
    } catch (e) {}
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
      _wrBuySession.pla = res.plasmoid || 0;
      _wrBuySession.qua = res.quantum || 0;
      // ⏱️ JP 2026-08-20: „Zeiten von Schiffbau … sollen auch im Chat genannt werden."
      // `longest`, nicht die Summe: die Aufträge laufen PARALLEL (Kommentar bei
      // wrBuyFlush), fertig ist der Korb also mit der längsten Einzelzeit.
      _wrBuySession.min = longest;
    }
    wrBuyFlush();
    wrRender();
  } catch (e) {
    wrToast('Bau fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// ── 🛡️ 27k: Garnison verlegen / zurückholen ────────────────────────────────
async function wrGarrisonSend(planetId) {
  if (_wrBusy) return;
  const sel = (_wrGarSel && _wrGarSel.planetId === planetId) ? _wrGarSel.ships : {};
  const ships = {};
  for (const [k, n] of Object.entries(sel)) if (n > 0) ships[k] = n;
  if (!Object.keys(ships).length) { wrToast('Es ist kein Schiff ausgewählt.', 'error'); return; }
  const p = (_wrGalaxy?.planets || []).find(x => x.id === planetId);
  _wrBusy = true;
  try {
    const res = await DB.startSpaceGarrison(_wrMember.id, planetId, _wrGarMode, ships);
    if (!res || res.error) {
      // ⚠️ Der Server liefert bei `garrison_full` die Zahlen mit. Sie wegzuwerfen und nur
      // „voll" zu melden, war 2026-08-17 gleich zweimal der Fehler (Kolonie-Kit, Forschung).
      wrToast(res?.error === 'garrison_full'
        ? `🛡️ Kein Platz: ${wrFmt(res.have)} von ${wrFmt(res.cap)} Plätzen belegt, `
          + `du willst ${wrFmt(res.want)} schicken.`
        : res?.error === 'not_enough_ships'
          ? `Von ${SPACE_SHIP_BY_KEY[res.ship]?.name || res.ship} sind nur ${wrFmt(res.have)} da `
            + `(gewählt: ${wrFmt(res.want)}).`
          : wrErrText(res?.error), 'error');
      return;
    }
    if (res.space) wrApplySpace(res.space);
    _wrGarSel = null;
    const n   = res.count || 0;
    const min = parseFloat(res.minutes) || 0;
    const hin = _wrGarMode !== 'recall';
    wrToast(`🛡️ ${wrFmt(n)} Schiff(e) ${hin ? 'unterwegs zur Kolonie' : 'auf dem Rückweg'} — `
          + `Ankunft in ${wrDur(min)}`, 'success');
    // ⏱️ Zeiten gehören in den Chat (JP 2026-08-20) — hier von Anfang an.
    try {
      const list = Object.entries(ships).map(([k, x]) => `${wrArtTok(k)} ${x}`).join(' · ');
      wrChat(`🛡️ ${_wrEsc(_wrMember.name)} ${hin ? 'verlegt' : 'holt'} ${list} `
           + `${hin ? 'auf die Kolonie' : 'von der Kolonie'} ${_wrEsc(p?.name || 'unbekannt')} `
           + `${hin ? 'zurück' : ''}— Ankunft in ${wrDur(min)}.`.replace(' zurück—', ' —'));
    } catch (e) {}
    wrRender();
  } catch (e) {
    wrToast('Verlegen fehlgeschlagen: ' + e.message, 'error');
  } finally { _wrBusy = false; }
}

// Fällige Transporte und verlorene Garnisonen einlösen. Zeitbasiert wie alles hier,
// kein Cron. ⚠️ `silent`: beim Poll soll nichts aufpoppen, nur beim Tab-Öffnen.
async function wrClaimGarrison(silent) {
  if (!_wrMember?.id || typeof DB.claimSpaceGarrison !== 'function') return false;
  let etwas = false;
  try {
    // 1) Ankünfte
    if (wrGarrisonTrips(_wrMember).some(t => Date.parse(t.arriveAt) <= Date.now())) {
      const res = await DB.claimSpaceGarrison(_wrMember.id);
      if (res && !res.error && res.count > 0) {
        if (res.space) wrApplySpace(res.space);
        etwas = true;
        for (const t of (res.done || [])) {
          const p = (_wrGalaxy?.planets || []).find(x => x.id === t.planetId);
          const n = Object.values(t.ships || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
          if (!silent) {
            wrToast(t.kind === 'recall'
              ? `🛡️ ${wrFmt(n)} Schiff(e) sind aus der Garnison zurück im Hafen.`
              : `🛡️ ${wrFmt(n)} Schiff(e) haben auf ${p?.name || 'der Kolonie'} Stellung bezogen.`,
              'success');
          }
          // ⚠️ 27m (JP: „Die Benachrichtigung kam nur über ein Popup, aber nicht im
          // Ereignis-Protokoll."). Ein Toast ist weg, sobald man wegsieht — der Start
          // stand seit 27k im Chat, die Ankunft nicht. Ein Vorgang, dessen Anfang
          // protokolliert wird und dessen Ende nicht, sieht aus wie ein verschollener.
          // ⚠️ Auch bei `silent`: der Poll soll nicht aufpoppen, aber das Protokoll
          // darf keine Lücke bekommen, nur weil der Tab gerade offen lag.
          try {
            const list = Object.entries(t.ships || {})
              .filter(([, x]) => (parseInt(x, 10) || 0) > 0)
              .map(([k, x]) => `${wrArtTok(k)} ${x}`).join(' · ');
            wrChat(t.kind === 'recall'
              ? `🛡️ ${_wrEsc(_wrMember.name)} hat ${list} aus der Garnison von `
                + `${_wrEsc(p?.name || 'einer Kolonie')} zurück in den Hafen geholt.`
              : `🛡️ ${list} von ${_wrEsc(_wrMember.name)} haben auf `
                + `${_wrEsc(p?.name || 'einer Kolonie')} Stellung bezogen.`);
          } catch (e) {}
        }
        // ⚠️ 27m: der Server liefert seit dieser Migration den BESTAND mit zurück, nicht
        // nur die Zahl der abgearbeiteten Transporte. Genau dieser Unterschied war der
        // Bug: `count > 0` meldete Erfolg, während `garrison` leer blieb (jsonb_set legt
        // nur die letzte Ebene an). Bleibt der Bestand leer, obwohl eine Verlegung
        // ankam, läuft eine Fassung vor 27m — dann lieber laut sein als still verlieren.
        if (res.garrison && (res.done || []).some(t => t.kind !== 'recall')
            && !Object.values(res.garrison).some(g => Object.values(g?.ships || {})
                 .some(v => (parseInt(v, 10) || 0) > 0))) {
          console.warn('claim_space_garrison: Transport eingelöst, Bestand leer — 27m fehlt?');
          wrToast('⚠️ Die Garnison ist angekommen, steht aber nicht im Bestand. '
                + 'Bitte melde das — die Migration 27m fehlt vermutlich.', 'error');
        }
      }
    }
    // 2) ⚠️ Verlorene Garnisonen. Der Trigger (27k) legt sie beim Kolonieverlust ab —
    // ohne dieses Abholen erführe der Spieler NIE, dass seine Schiffe mit gefallen sind.
    if (typeof DB.claimSpaceGarrisonLost === 'function') {
      const lost = await DB.claimSpaceGarrisonLost(_wrMember.id);
      if (lost && !lost.error && Array.isArray(lost.lost) && lost.lost.length) {
        if (lost.space) wrApplySpace(lost.space);
        etwas = true;
        for (const ev of lost.lost) {
          // In die Verlust-Statistik verbuchen. ⚠️ `wrBumpLost` (weltraum_stats.js) ist die
          // EINZIGE Schreibstelle für lostByType — sie nimmt genau die `{key: n}`-Map, die
          // auch `res.lost` aus claim_space_arrival liefert. Keine zweite Buchführung.
          try {
            if (typeof wrBumpLost === 'function') wrBumpLost(ev.ships);
          } catch (e) {}
          wrToast(`💥 Die Garnison auf ${ev.planet || 'einer Kolonie'} ist mit der Kolonie `
                + `gefallen — ${wrFmt(ev.count || 0)} Schiffe verloren.`, 'error');
          try {
            wrChat(`💥 Die Garnison von ${_wrEsc(_wrMember.name)} auf `
                 + `${_wrEsc(ev.planet || 'einer Kolonie')} ist mit der Kolonie gefallen — `
                 + `${wrFmt(ev.count || 0)} Schiffe verloren.`);
          } catch (e) {}
        }
      }
    }
  } catch (e) { console.warn('wrClaimGarrison:', e.message); }
  return etwas;
}

// ── 🚨 26v: Angriffe auf Kolonien ───────────────────────────────────────────
// Offene Vorwarnungen dieser Sitzung. Bewusst NICHT in `map_data` — es ist ein
// Serverzustand, den `fetch_colony_attacks` jederzeit liefert (Tagesbilanz-Lehre:
// keine Blob-Schreibzugriffe für Dinge, die woanders autoritativ stehen).
let _wrAttacks = [];

// Planen, lesen, fällige auswerten — alles beim Öffnen des 🚀-Tabs.
// ⚠️ Reihenfolge: erst AUSWERTEN, dann neu planen. Andersherum könnte ein Angriff, der
// gerade eingeschlagen ist, im selben Durchgang durch einen neuen ersetzt werden und
// stillschweigend verpuffen.
async function wrSyncAttacks(silent) {
  try {
    _wrAttacks = await DB.fetchColonyAttacks(_wrMember.id);
    const faellig = _wrAttacks.filter(a => Date.parse(a.arriveAt) <= Date.now());
    for (const a of faellig) {
      const res = await DB.resolveColonyAttack(_wrMember.id, a.planetId);
      if (!res || res.error || !res.resolved) continue;
      const r = res.report || {};
      // ⚠️ Chat-Text ist REINER TEXT (Lehre aus Teil 23) — Betonung nur über Emoji und
      // Grossschreibung, niemals <strong>.
      if (res.outcome === 'held') {
        wrToast(`🛡️ Angriff auf ${r.planet} abgewehrt`, 'success');
        wrChat(`[[s:hafen]] ${_wrEsc(_wrMember?.name || 'Jemand')} hat einen Angriff auf `
             + `die Kolonie ${_wrEsc(r.planet)} abgewehrt `
             + `(${wrFmt(r.strength)} gegen ${wrFmt(r.defense)}). `
             + `${r.turretsHit} Geschütz(e) beschädigt.`);
      } else if (res.outcome === 'partial') {
        wrToast(`💥 ${r.planet}: Kolonie beschädigt — Stufe ${r.levelAfter}`, 'error');
        wrChat(`💥 Die Kolonie ${_wrEsc(r.planet)} von ${_wrEsc(_wrMember?.name || 'Jemand')} `
             + `hat einen Angriff NICHT gehalten (${wrFmt(r.strength)} gegen `
             + `${wrFmt(r.defense)}). Alle Geschütze sind Wracks, die Stufe ist auf `
             + `${r.levelAfter} gefallen.`);
      } else {
        wrToast(`☠️ Kolonie ${r.planet} verloren!`, 'error');
        wrChat(`☠️ Die Kolonie ${_wrEsc(r.planet)} von ${_wrEsc(_wrMember?.name || 'Jemand')} `
             + `wurde vernichtet — der Planet ist wieder in der Hand der Wächter. `
             + `Ohne Geschütze, Besatzung oder Station im Quadranten war nichts zu halten.`);
      }
      // 📊 Regel 4: Karriere-Zähler (weltraum_stats.js). Nie blockierend.
      try {
        if (typeof wrStatBump === 'function') {
          wrStatBump(res.outcome === 'held'
            ? { colonyAttacksWon: 1 }
            : { colonyAttacksLost: 1,
                coloniesDestroyed: res.outcome === 'destroyed' ? 1 : 0 });
        }
      } catch (e) { /* Statistik darf die Auswertung nie verhindern */ }
    }
    if (faellig.length) {
      _wrGalaxy   = await DB.fetchGalaxy();
      _wrAttacks  = await DB.fetchColonyAttacks(_wrMember.id);
    }
    // Erst jetzt neu planen (siehe Reihenfolge-Hinweis oben).
    const plan = await DB.ensureColonyAttacks(_wrMember.id);
    if (plan && plan.count > 0) {
      _wrAttacks = await DB.fetchColonyAttacks(_wrMember.id);
      for (const n of (plan.new || [])) {
        wrToast(`🚨 Angriff auf ${n.planet} in Anflug!`, 'error');
        // ⚠️ Zusätzlich ins Protokoll: ein Toast ist nach Sekunden weg, die Vorwarnzeit
        // dauert aber 30–120 Minuten. Wer die App in dem Moment nicht offen hat, soll
        // den Angriff später noch nachlesen können (JP 2026-08-17).
        try {
          wrChat(`🚨 ${_wrEsc(_wrMember?.name || 'Jemand')} bekommt Besuch: die Kolonie `
               + `${_wrEsc(n.planet)} (Ring ${n.ring}) wird angegriffen — Stärke `
               + `${wrFmt(n.strength)} gegen ${wrFmt(n.defense)} Verteidigung. `
               + `Vorwarnzeit ${plan.warnMin} Minuten.`);
        } catch (e) {}
      }
    }
    if (!silent && faellig.length) wrRender();
  } catch (e) { /* Regel 3: der Tab muss auch ohne Angriffssystem aufgehen */ }
}

// ── ⏳ 26u: die zwei neuen Abholungen ────────────────────────────────────────
// Beide folgen exakt dem Muster von wrClaimBuild: erst lokal prüfen, ob überhaupt etwas
// fällig ist (spart bei jedem Tab-Wechsel einen RPC), dann einlösen.
// ⚠️ Regel 3: eine fehlgeschlagene Abholung darf den Tab-Aufbau nie blockieren, deshalb
// im stillen Modus keine Toasts und kein Weiterreichen von Fehlern.
async function wrClaimTech(silent) {
  if (_wrBusy) return false;
  const job = wrSpace(_wrMember).techJob;
  if (!job || typeof job !== 'object' || !job.key) return false;
  const due = Date.parse(job.doneAt);
  if (isFinite(due) && Date.now() < due) return false;
  _wrBusy = true;
  try {
    const res = await DB.claimSpaceTech(_wrMember.id);
    if (!res || res.error) {
      if (!silent && res && res.error) wrToast(wrErrText(res.error), 'error');
      return false;
    }
    if (res.space) wrApplySpace(res.space);
    if (res.done) {
      const t = SPACE_TECH_BY_KEY?.[res.tech];
      wrToast(`🔬 Forschung abgeschlossen: ${t?.name || res.tech}`, 'success');
      try {
        wrChat(`[[s:hafen]] ${_wrEsc(_wrMember?.name || 'Jemand')} hat die Forschung `
             + `„${t?.name || res.tech}" abgeschlossen.`);
      } catch (e) { /* Meldung darf den Abschluss nie verhindern */ }
    }
    if (!silent) wrRender();
    return true;
  } catch (e) {
    if (!silent) wrToast('Übernahme fehlgeschlagen: ' + e.message, 'error');
    return false;
  } finally { _wrBusy = false; }
}

// Fertige Bauplätze auf KOLONIEN in die materialisierte Feuerkraft übernehmen.
// ⚠️ Der Raumhafen braucht das nicht: seine Feuerkraft rechnet der Server bei jedem
// Lesen. Eine Kolonie trägt sie in `space_planets.planet_defense` — dort muss der
// fertige Bau eingetragen werden, sonst bliebe er bis zum nächsten Bau unsichtbar.
async function wrClaimTurrets(silent) {
  if (_wrBusy) return false;
  // ⚠️ Die Vorprüfung vergleicht den GESPEICHERTEN Wert mit dem, den der Client gerade
  // ausrechnet. Naheliegender wäre „gibt es einen Bauplatz, dessen readyAt abgelaufen
  // ist" — das wäre aber nach dem ersten Claim für immer wahr (readyAt bleibt stehen)
  // und würde bei JEDEM Tab-Wechsel einen RPC auslösen. Der Wertvergleich stimmt nach
  // dem Claim wieder überein und schaltet sich damit selbst ab.
  const mine = (_wrGalaxy?.planets || []).filter(p => p.colonized_by === _wrMember?.id);
  // 🏗️ 27ad: ZWEITER Grund für einen Claim — ein fälliger Kolonie-Ausbau.
  // ⚠️ OHNE DIESE ZEILE WÜRDE EIN AUSBAU NIE FERTIG. Die Bedingung darüber vergleicht
  // die Feuerkraft; die Kolonie-Stufe steht während des Ausbaus aber noch auf dem alten
  // Wert, Erwartung und Speicher stimmen also überein — der Claim liefe nie, und die
  // Stufe bliebe für immer „gleich fertig". Ein bezahlter Ausbau, der nichts tut.
  //   ⚠️ Und wie die Bedingung darüber schaltet auch diese sich selbst ab: der Claim
  //   räumt `colony_ready_at` auf NULL, danach findet `faellig` nichts mehr.
  const faellig = mine.some(p => p.colony_ready_at
    && isFinite(Date.parse(p.colony_ready_at)) && Date.parse(p.colony_ready_at) <= Date.now());
  if (!faellig && !mine.some(p => wrColonyPowerExpected(p) !== wrPlanetDef(p))) return false;
  _wrBusy = true;
  try {
    const res = await DB.claimSpaceTurrets(_wrMember.id);
    if (!res || res.error) return false;
    // 🏗️ 27ad: Fertige Ausbauten melden. Ein Vorgang, der einen TAG gedauert hat, darf
    // nicht wortlos passieren — sonst weiss niemand, ob er je fertig wurde.
    const fertig = Array.isArray(res.upgraded) ? res.upgraded : [];
    if (fertig.length) {
      _wrGalaxy = await DB.fetchGalaxy();
      // Den lokalen Spiegel nachziehen. Der Server hat ihn in derselben RPC gesetzt,
      // aber unsere Kopie von `space` ist von vorher — und `harvest_space` rechnet mit
      // genau diesem Feld. Ohne das zeigte die Kolonie-Liste bis zum nächsten vollen
      // Laden die alte Stufe, obwohl der Ertrag schon der neuen entspricht.
      try {
        const cols = _wrMember?.space?.colonies || {};
        for (const p of (_wrGalaxy?.planets || [])) {
          if (p.colonized_by === _wrMember?.id && cols[p.id]) {
            cols[p.id].level = Math.max(1, Math.min(3, parseInt(p.colony_level, 10) || 1));
          }
        }
      } catch (e) { /* Anzeige-Korrektur, darf nie werfen */ }
      for (const u of fertig) {
        wrToast(`🏙️ ${u.planet} ist auf Kolonie-Stufe ${u.level} ausgebaut — der höhere `
              + `Ertrag läuft ab sofort.`, 'success');
        wrChat(`🏙️ ${_wrEsc(_wrMember?.name || 'Jemand')}: die Kolonie ${_wrEsc(u.planet)} `
             + `ist fertig auf Stufe ${u.level} ausgebaut.`);
      }
    }
    if (res.updated > 0) {
      _wrGalaxy = await DB.fetchGalaxy();   // planet_defense hat sich geändert
      if (!silent) wrToast(`🛡️ ${res.updated} Kolonie(n) neu berechnet`, 'success');
    }
    if (!silent || fertig.length) wrRender();
    return true;
  } catch (e) {
    return false;
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
    } else if (action === 'power_build' || action === 'power_upgrade' || action === 'power_convert') {
      // ⚡ 26p: eigener Zweig. Die Geschütz-Texte passen hier nicht — und die
      // interessante Zahl ist nicht die Feuerkraft, sondern was sich an der
      // Versorgungslage geändert hat.
      const g = SPACE_POWER_BY_KEY[res.type] || {};
      const f = SPACE_POWER_BY_KEY[res.from] || {};
      const nrg = res.energy || {};
      const pct = Math.round((parseFloat(nrg.factor) || 1) * 100);
      const verb = action === 'power_build'   ? 'gebaut'
                 : action === 'power_convert' ? `ersetzt (vorher ${f.name || 'Generator'})`
                 : `auf Stufe ${res.level} ausgebaut`;
      wrToast(`${g.icon || '⚡'} ${g.name || 'Generator'} ${verb} — ⚡ ${wrFmt(res.output)}`, 'success');
      // ⚠️ NAMENSFALLE: NICHT `[[s:${res.type}]]` — die Generator-Schlüssel heissen
      // `kristall`/`plasmoid`/`quanten`, und `kristall`/`plasmoid` stehen in CHAT_ART
      // längst als ROHSTOFFE (res_kristall/res_plasmoid). Der Chat hätte ein 💎 statt
      // des Kraftwerks gezeigt. Deshalb direkt der ART-Name (`gen_*`), den app.js über
      // das Präfix auflöst.
      wrChat(`[[s:${g.art || 'gen_kristall'}]] ${_wrEsc(name)} hat den ${_wrEsc(g.name || 'Energie-Generator')} `
           + `${verb} — Versorgung jetzt ⚡ ${wrFmt(nrg.supply)} bei ${wrFmt(nrg.demand)} Bedarf`
           + `${pct < 100 ? ` (Geschütze bei ${pct} %)` : ''}.`);
      // ⛽ 26s: ein frisch gebauter Reaktor kommt mit LEEREM Tank (die Bau-RPC schreibt
      // bewusst kein fuel-Feld — sie wird dafür nicht angefasst). Ohne diesen Hinweis
      // wirkt der teure Neubau wie ein Fehlkauf: er liefert nichts.
      if (action !== 'power_upgrade' && wrGenFuelRate(res.type, res.level || 1) > 0) {
        wrToast(`⛽ Tank ist leer — ${g.name || 'der Reaktor'} liefert erst nach dem Betanken Energie `
              + `(${wrFmt(wrGenFuelRate(res.type, res.level || 1))} ${res.type === 'quanten' ? '🌀' : '🟣'} pro Tag).`, 'error');
      }
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
         + `Mutterschiff bauen: ${WR_MUTTER_PARTS.map(p =>
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
    if (action === 'power_build' || action === 'power_upgrade' || action === 'power_convert') {
      // ⚡ 26p: eigener Zweig. Die interessante Zahl ist die Versorgungslage der Kolonie,
      // nicht die Feuerkraft — die Meldung nennt beides, weil der Bau sie hebt.
      const g   = SPACE_POWER_BY_KEY[res.type] || {};
      const f   = SPACE_POWER_BY_KEY[res.from] || {};
      const nrg = res.energy || {};
      const pct = Math.round((parseFloat(nrg.factor) || 1) * 100);
      const verb = action === 'power_build'   ? 'gebaut'
                 : action === 'power_convert' ? `ersetzt (vorher ${f.name || 'Generator'})`
                 : `auf Stufe ${res.level} ausgebaut`;
      wrToast(`${g.icon || '⚡'} ${g.name || 'Generator'} auf ${pl} ${verb} — `
            + `⚡ ${wrFmt(nrg.supply)} / ${wrFmt(nrg.demand)}${pct < 100 ? ` (${pct} %)` : ''}`, 'success');
      // ⚠️ ART-Name, nicht der Generator-Key: `kristall`/`plasmoid` stehen in CHAT_ART
      // längst als ROHSTOFFE (dieselbe Falle wie am Hafen).
      wrChat(`[[s:${g.art || 'gen_kristall'}]] ${_wrEsc(name)} hat auf ${_wrEsc(pl)} den `
           + `${_wrEsc(g.name || 'Energie-Generator')} ${verb} — Geschütze jetzt `
           + `🛡️ ${wrFmt(res.defense)}${pct < 100 ? ` (noch ${pct} % Versorgung)` : ''}.`);
    } else if (action === 'colony_upgrade') {
      // ⚠️ 27ad: Der Ausbau ist ab jetzt BEAUFTRAGT, nicht fertig. `res.level` ist die
      // ZIELSTUFE — die RPC meldet sie unverändert, weil der Trigger die Erhöhung erst
      // danach zurücknimmt. Wer hier weiter „ausgebaut" schreibt, meldet einen Abschluss,
      // den es erst morgen gibt: exakt der Fehler, den 26u bei der Forschung gemacht hat
      // („hat erforscht", während der Vorgang noch Stunden lief).
      // ⚠️ UND `res.space` IST HIER FALSCH. Die RPC baut ihr Rückgabe-Objekt, BEVOR der
      // Trigger die Erhöhung zurücknimmt — im gelieferten Spiegel steht also schon die
      // Zielstufe, in der Datenbank nicht. Angewendet hätte der Client bis zum nächsten
      // vollen Laden den Ertrag der neuen Stufe angezeigt, den es noch gar nicht gibt.
      //   ⚠️ Das ist die alte 27f-Lehre in neuem Gewand: was eine Funktion ZURÜCKGIBT,
      //   ist nicht automatisch das, was am Ende in der Zeile steht — dazwischen liegen
      //   die Trigger. Wer einen Trigger einführt, muss jeden Rückgabewert nachsehen,
      //   den er verändert.
      try {
        const cols = _wrMember?.space?.colonies;
        if (cols && cols[planetId]) {
          cols[planetId].level = Math.max(1, (parseInt(res.level, 10) || 2) - 1);
        }
      } catch (e) { /* Anzeige-Korrektur, darf nie werfen */ }
      const dauer = wrDur(wrColonyBuildMin(res.level));
      wrToast(`🏙️ Ausbau von ${pl} auf Stufe ${res.level} beauftragt — fertig in ${dauer}. `
            + `Bis dahin liefert die Kolonie weiter Stufe ${Math.max(1, (res.level || 2) - 1)}.`, 'success');
      wrChat(`🏙️ ${_wrEsc(name)} baut die Kolonie ${_wrEsc(pl)} auf Stufe ${res.level} `
           + `aus (${wrFmt(res.cc)} CC) — fertig in ${dauer}.`);
    } else if (action === 'station_build') {
      wrToast(`📡 Quadranten-Station bei ${pl} errichtet`, 'success');
      wrChat(`📡 ${_wrEsc(name)} hat bei ${_wrEsc(pl)} eine Quadranten-Station errichtet — `
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
           + `🛡️ ${wrFmt(res.defense)} Feuerkraft, ${res.slots || 0} von `
           + `${wrPlanetSlotsFree(wrPlanetById(planetId))} Bauplätzen belegt.`);
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
    wrErnteLogAdd(res, false);
    const parts = [];
    const resHtml = wrResListe({ erz: res.erz, kri: res.kristall, pla: res.plasmoid, qua: res.quantum });
    if (resHtml) parts.push(resHtml);
    if (res.cc > 0)   parts.push(`+${wrFmt(res.cc)} CC`);
    if (res.fuel > 0) parts.push(`−${wrFmt(res.fuel)} ${wrIc('kri')} Treibstoff`);
    wrToast(parts.length ? `📥 Eingesammelt: ${parts.join(' · ')}` : 'Noch nichts zu holen.',
            parts.length ? 'success' : 'info', parts.length > 0);
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
          ${/* ⚠️ 27u: hier stand `wrDur(s.buildMin)` — die ROHE Grundzeit aus der Tabelle,
                ohne Werft-Rabatt und ohne Forschung. Ein Jäger wurde mit „1 Std 30 Min"
                ausgewiesen, während er bei voller Werft in 50 Minuten fertig ist. Der Wert
                war seit jeher da und hat alle vier Bauzeit-Regeländerungen überlebt, weil
                er nie falsch AUSSAH — er war nur nie der Wert, den der Spieler bekommt.
                ⚠️ Merke: eine Kennzahl aus der Definitionstabelle ist nicht dasselbe wie
                die Zahl, die für DIESEN Spieler gilt. `wrShipBuildMin(s, m, 1)` rechnet
                mit seiner Werft. */''}
          <span>${wrIc("time")} Bauzeit<strong>${wrDur(wrShipBuildMin(s, m, 1))}</strong></span>
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
    ['💰 Neubau', `${wrFmt(t.cc)} CC${t.plasmoid ? ` · ${t.plasmoid} ${wrIc('pla')}` : ''}`
                + `${t.quantum ? ` · ${t.quantum} ${wrIc('qua')}` : ''}`],
    ['⬆️ Ausbau', `${wrFmt(s[1].cc)} / ${wrFmt(s[2].cc)} CC`],
    // ⚡ 26p: der Energiebedarf gehört sichtbar dazu — er ist der eigentliche Preis der
    // starken Typen. Gerundet je Stufe, wie es der Bauplatz zeigt.
    ['⚡ Energie', [1, 2, 3].map(lv => Math.round(wrTurretEnergy(t.key, lv))).join(' / ')],
    // 26k: die Freischaltung gehört sichtbar dazu — sonst rätselt man, warum „Bauen" fehlt.
    ['🔬 Forschung', t.needs ? `${frei ? '✓ ' : '🔒 '}${_wrEsc(wrTechName(t.needs))}` : '— frei verfügbar'],
  // ⚠️ Der Ordner MUSS mit: die Geschütz-Bilder liegen seit JPs Meldung vom 29.07.
  // alle in assets/weltraum/ (die Forschungs-Renders).
  ], wrTurretFolder(t));
}

// ⚡ Zoom für die Energie-Generatoren (26p). Gleiches Muster wie wrTurretLightbox.
function wrPowerLightbox(key) {
  const g = SPACE_POWER_BY_KEY[key];
  if (!g) return;
  const s = [1, 2, 3].map(lv => wrPowerStats(g.key, lv));
  const frei = wrPowerUnlocked(_wrMember, g.key);
  const kosten = wrPreisTxt;                         // 27p
  wrArtLightbox(g.art, g.icon, g.name, g.desc, [
    ['⚡ Ausgabe', `${wrFmt(s[0].output)} / ${wrFmt(s[1].output)} / ${wrFmt(s[2].output)}`],
    ['💰 Neubau', kosten(s[0])],
    ['⬆️ Ausbau', `${wrFmt(s[1].cc)} / ${wrFmt(s[2].cc)} CC`],
    // Das Gate ist bewusst die ROHSTOFF-Freischaltung: wer den Brennstoff nicht abbauen
    // kann, soll das Kraftwerk nicht betreiben.
    ['🔬 Forschung', g.needs ? `${frei ? '✓ ' : '🔒 '}${_wrEsc(wrTechName(g.needs))}` : '— frei verfügbar'],
  ], g.folder);
}

// 🔬 Zoom für Forschungselemente (JP 2026-07-26): großes Bild + Wirkung/Kosten/Status.
function wrTechLightbox(key) {
  const t = SPACE_TECH_BY_KEY[key];
  if (!t) return;
  const st = wrTechState(_wrMember, t);
  const stLabel = { owned: '✓ erforscht', soon: 'in Vorbereitung', locked: '🔒 Voraussetzung fehlt',
                    poor: 'Mittel reichen nicht', buy: 'erforschbar' }[st] || '';
  const ast = SPACE_TECH_ASTE.find(a => a.key === t.ast) || {};
  const cost = wrPreisTxt(t);   // 27p: die Lightbox rendert HTML (wrArtLightbox)
  const rows = [['💰 Kosten', cost],
                // ⏱️ 27q: auch hier — die Lightbox ist der Ort, an dem man ein Projekt
                // vor dem Kauf ansieht.
                [`${wrIc('time')} Dauer`, wrDur(wrTechMinFor(t))],
                ['📊 Status', stLabel], [`${ast.icon || '🔬'} Ast`, _wrEsc(ast.name || '')]];
  if (t.requires) rows.push(['🔗 Braucht', _wrEsc((SPACE_TECH_BY_KEY[t.requires] || {}).name || t.requires)]);
  wrArtLightbox(t.art, ast.icon || '🔬', t.name, t.wirkung, rows, 'weltraum');
}

function wrWerftLightbox() {
  const m = _wrMember;
  const built = SPACE_SHIPS.reduce((a, s) => a + wrShipCount(m, s.key), 0);
  wrArtLightbox('base_werft_' + wrYardLevel(m), '🏗️', 'Werft am Raumhafen',
    'Das Trockendock deines Hafens. Hier entstehen alle Schiffe; fertige Rümpfe werden '
  + 'direkt in die Heimatflotte übergeben. Auf jeder Helling wächst ein Rumpf — eine '
  + 'ausgebaute Werft baut schneller, günstiger und BREITER.', [
    [`${wrIc("fleet")} Gebaut`, wrFmt(built)],
    [`${wrIc("yard")} Werft-Stufe`, wrYardLevel(m)],
    // ⚠️ 27u: die Hellingen gehören hierher — sie sind seit dieser Migration die Kennzahl,
    // die über einen Grossauftrag entscheidet. Ohne sie erklärt die Lightbox die Werft
    // über zwei Rabatte und verschweigt das, was man tatsächlich merkt.
    ['⚓ Hellingen', `${wrYardSlots(m)} Rümpfe gleichzeitig`],
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
    // ⚡ 26p: Bedarf/Versorgung gehören in die Hafen-Übersicht — hier schaut man nach,
    // warum die Feuerkraft darüber nicht zur Summe der Bauplätze passt.
    ['⚡ Energie', `${wrFmt(wrPowerDemand(m))} / ${wrFmt(wrPowerSupply(m))}`
                + `${wrPowerFactor(m) < 1 ? ` — ${Math.round(wrPowerFactor(m) * 100)} %` : ''}`],
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
          ? `${wrFmt(Math.round(target.richness * rm.loot))} ${wrResIc(target.resource_type)} ${_wrEsc(rm.name)}`
          : `🔒 ${_wrEsc(rm.name)} (Abbau-Tech fehlt)`); }
    } else if (trip.intent === 'harvest') {
      const rm = wrResMeta(target.resource_type);
      beute.push(wrResMinable(m, target.resource_type)
        ? `${wrFmt(Math.round(mine * target.richness * rm.mine))} ${wrResIc(target.resource_type)} ${_wrEsc(rm.name)}`
        : `🔒 ${_wrEsc(rm.name)} (Abbau-Tech fehlt)`);
    } else if (trip.intent === 'scout') {
      beute.push('Quadrant wird für den ganzen Clan aufgedeckt');
    } else if (trip.intent === 'colonize') {
      beute.push('Dauerhafte Kolonie (Ertrag sammelt sich an)');
    }
  }
  // 🟣🌀💎 27ab: Was die Reise GEKOSTET hat, gehört neben das, was sie einbringt.
  // Der Treibstoff wurde beim Start abgebucht und stand danach nirgends mehr — man sah
  // nur den kurzen Toast. `trip.fuel/fuelPla/fuelQua` schreibt der Server seit 22h/27aa
  // in den Reise-Datensatz; gelesen hat sie bisher niemand.
  //   ⚠️ Wieder „Server-Mechanik gebaut, Anzeige vergessen" — diesmal im eigenen Feature
  //   vom selben Tag. Ein Feld in den Datensatz zu schreiben ist NICHT dasselbe wie es
  //   anzuzeigen, und der Abstand dazwischen betrug hier eine Stunde.
  const kosten = wrResListe({ kri: trip.fuel, pla: trip.fuelPla, qua: trip.fuelQua }, '', '−');

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
        ${/* ⚠️ 27ab — REGRESSION AUS 27y, VON JP GEMELDET („beim Losschicken einer Flotte
              werden nicht die Kosten angezeigt mit den assets"):
              Seit 27y enthalten die `beute`-Einträge Bild-Hüllen aus `wrResIc()`. Hier
              lief weiter `beute.map(_wrEsc)` darüber — und escapte damit das eigene
              Markup, das dann als roher `<span …>`-Text im Kasten stand.
              ⚠️ ÜBERTRAGBARE LEHRE: Wer einen Wert von TEXT auf HTML umstellt, muss JEDE
              Stelle mitnehmen, die ihn ausgibt. Ein `_wrEsc` an der Ausgabe ist bis dahin
              richtig und danach genau falsch — und es sieht an beiden Tagen gleich aus.
              Genau davor warnt der Kommentar bei `wrIcText` seit Juli: erst escapen,
              dann Bilder einsetzen — nie andersherum.
              Jeder Eintrag escapt seine Textteile jetzt beim BAUEN (siehe oben). */''}
        ${beute.length ? `<div class="wr-fl-beute">🎁 Erwartet: ${beute.join(' · ')}</div>` : ''}
        ${kosten ? `<div class="wr-fl-kosten">⛽ Treibstoff dieser Reise: ${kosten}</div>` : ''}
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
    if (r.plunderErz > 0)      pl.push(`${wrFmt(r.plunderErz)} ${wrIc('erz')}`);
    if (r.plunderKristall > 0) pl.push(`${wrFmt(r.plunderKristall)} ${wrIc('kri')}`);
    if (pl.length) lines.push(`<div class="wr-bad">Geplündert: ${pl.join(' · ')}</div>`);
    if (r.turretsDamaged > 0) {
      lines.push(`<div class="wr-bad">${wrFmt(r.turretsDamaged)} Geschütz(e) beschädigt —
        sie fallen ${wrTechRepairH(_wrMember)} Stunden aus.</div>`);
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
  } else if (r.intent === 'attack' && r.note === 'too_late') {
    // 🏁 27ac / R6a: Ein anderer war schneller. Vorher meldete der Server hier einen
    // SIEG mit leerer Beute — der Spieler las „gewonnen" und suchte den Fehler bei der
    // Beute statt bei der Uhr. Jetzt sagt der Bericht, was wirklich passiert ist.
    lines.push(`<div class="wr-rep-head wr-bad">🏁 Zu spät gekommen</div>`);
    lines.push(`<div>Die Wächter von ${_wrEsc(r.planet)} waren schon besiegt, als dein Verband eintraf —
      ein Mitspieler war schneller. Es gab keinen Kampf und keine Beute.</div>`);
    if ((r.salvage || 0) > 0) {
      lines.push(`<div class="wr-good">♻️ Immerhin: deine Bergungseinheiten haben
        <strong>${wrFmt(r.salvage)}</strong> aus dem Trümmerfeld geholt
        <span class="wr-sub">— der Sieger hat Vorrang, mehr als ein Viertel des Rests geht nicht.</span></div>`);
    } else {
      lines.push(`<div class="wr-sub">♻️ Ohne 🚀 Espresso-Kutter oder ♻️ Bergungsschiffe im Verband
        gab es auch nichts zu bergen — und das Trümmerfeld kann bereits abgetragen sein.</div>`);
    }
  } else if (r.intent === 'attack') {
    lines.push(r.won
      ? `<div class="wr-rep-head wr-good">⚔️ Sieg über die Wächter von ${_wrEsc(r.planet)}!</div>`
      : `<div class="wr-rep-head wr-bad">⚔️ Die Wächter von ${_wrEsc(r.planet)} haben standgehalten.</div>`);
    lines.push(`<div>Deine Kampfkraft <strong>${wrFmt(r.power)}</strong> gegen <strong>${wrFmt(r.enemy)}</strong></div>`);
    // ⚗️ 26s: verbrauchte Injektion ausweisen — sonst wundert man sich über den
    // verschwundenen Vorrat. `inject` steht nur im Bericht eines echten Gefechts.
    if ((r.inject || 0) > 0) {
      lines.push(`<div class="wr-good">⚗️ Plasmoid-Injektion: ${wrFmt(r.inject)} ${wrIc('pla')} verbrannt `
                + `(+${wrFmt(r.injectPct || 0)} % Kampfkraft in diesem Gefecht)</div>`);
    }
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
    // 🏛️ 27ac / R6b: Das Kit wird beim START abgebucht und erst bei der Gründung
    // verbraucht. Kam es nicht dazu, war es bisher trotzdem weg — bis zu 28.000 CC.
    // ⚠️ Diese Zeile muss stehen, auch wenn niemand sie je zu sehen bekommt: eine
    // Erstattung, die der Spieler nicht bemerkt, sieht aus wie ein Buchungsfehler.
    {
      const rf = r.refund || {};
      const teile = [];
      if ((rf.cc || 0) > 0)       teile.push(`${wrFmt(rf.cc)} CC`);
      if ((rf.erz || 0) > 0)      teile.push(`${wrFmt(rf.erz)} ${wrIc('erz')}`);
      if ((rf.kristall || 0) > 0) teile.push(`${wrFmt(rf.kristall)} ${wrIc('kri')}`);
      if ((rf.plasmoid || 0) > 0) teile.push(`${wrFmt(rf.plasmoid)} ${wrIc('pla')}`);
      if ((rf.quantum || 0) > 0)  teile.push(`${wrFmt(rf.quantum)} ${wrIc('qua')}`);
      if (teile.length) {
        lines.push(`<div class="wr-good">💰 Ausrüstung der Mission zurückerstattet:
          <strong>${teile.join(' · ')}</strong>
          <span class="wr-sub">— Treibstoff und Einsatzkosten nicht, die Reise hat stattgefunden.</span></div>`);
      }
    }
  } else {
    lines.push(`<div class="wr-rep-head">${info.icon} ${_wrEsc(r.planet)}</div>`);
  }
  if (r.shipsLost > 0) lines.push(`<div class="wr-bad">Verluste: ${wrFmt(r.shipsLost)} Schiff(e) (${Math.round((r.lossRatio || 0) * 100)} %)${_wrEsc(wrLossBreakdown(r.lost))}</div>`);
  // ⚗️ 27ac: Mitgeführte, aber nicht verschossene Injektion kommt ins Magazin zurück.
  // ⚠️ Ohne diese Zeile wäre die Rückgabe unsichtbar — und ein Spieler, der beim Start
  // „Magazin 0" gesehen hat, würde es für einen Fehler halten, dass es wieder voll ist.
  if ((r.injectBack || 0) > 0) {
    lines.push(`<div class="wr-good">⚗️ ${wrFmt(r.injectBack)} ${wrIc('pla')} Injektion kommen zurück ins Magazin
      <span class="wr-sub">— es kam zu keinem Gefecht, verschossen wurde nichts.</span></div>`);
  }
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

    // 🛡️ 27k: Garnisonstransporte. ⚠️ VOR dem `return` unten — der greift, sobald keine
    // normale Flotte unterwegs ist, und hätte eine ankommende Garnison bis zum nächsten
    // Tab-Wechsel liegen lassen. Die Countdowns laufen sichtbar mit; die RPC feuert nur
    // bei tatsächlicher Fälligkeit, nicht jede Sekunde.
    let garDue = false;
    for (const g of wrGarrisonTrips(_wrMember)) {
      const rem = Date.parse(g.arriveAt) - Date.now();
      for (const eta of document.querySelectorAll(`[data-wr-gareta="${g.id}"]`)) {
        eta.textContent = wrCountdown(rem);
      }
      if (rem <= 0) garDue = true;
    }
    if (garDue && !_wrGarBusy) {
      _wrGarBusy = true;
      try { if (await wrClaimGarrison(false)) wrRender(); } finally { _wrGarBusy = false; }
    }

    // 🏗️ 27ad: Kolonie-Ausbau-Countdown. Steht BEWUSST vor dem `return` unten — er läuft
    // auch, wenn gerade keine Flotte unterwegs ist, und ein Ausbau dauert Stunden.
    // ⚠️ Wird er fällig, holt `wrClaimTurrets` ihn ab. Ohne diesen Aufruf bliebe ein
    // fertiger Ausbau bis zum nächsten Tab-Wechsel liegen — die Anzeige stünde auf
    // „0:00" und täte nichts, was wie ein Defekt aussieht.
    let colDue = false;
    for (const p of (_wrGalaxy?.planets || [])) {
      if (p.colonized_by !== _wrMember?.id || !p.colony_ready_at) continue;
      const rem = Date.parse(p.colony_ready_at) - Date.now();
      if (!isFinite(rem)) continue;
      const el = document.querySelector(`[data-wr-coleta="${p.id}"]`);
      if (el) el.textContent = wrCountdown(Math.max(0, rem));
      if (rem <= 0) colDue = true;
    }
    if (colDue) { try { await wrClaimTurrets(false); } catch (e) {} }

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
    // 🟣🌀 27ab: Plasmoid und Quantenschaum fehlten hier — wer die App geschlossen
    // hatte, bekam beim nächsten Start eine Beute-Meldung ohne die Ring-Rohstoffe.
    let cc = 0, erz = 0, kri = 0, pla = 0, qua = 0, n = 0, guard = 0, last = null;
    while (guard++ < 6) {
      const res = await DB.claimSpaceArrival(u.id);
      if (!res || res.error || res.nothing) { if (res && res.space) wrApplySpace(res.space); if (!res || !res.more) break; else continue; }
      wrApplySpace(res.space);
      if (_wrMember && _wrMember.id === u.id) _wrMember.space = res.space;
      cc += res.cc || 0; erz += res.erz || 0; kri += res.kristall || 0;
      pla += res.plasmoid || 0; qua += res.quantum || 0; n++; last = res;
      wrChatReport(res, u.name);
      try { if (typeof checkSpaceAchievements === 'function') await checkSpaceAchievements(u, res); } catch (e) {}
      if (!res.more) break;
    }
    if (n === 0) return false;
    // ⚠️ 27ab: jetzt mit echten Bildern und allen vier Rohstoffen. Zulässig als HTML,
    // weil in dieser Zeichenkette kein fremder Text steckt — nur Zahlen und feste Wörter.
    const beute = [];
    const resTxt = wrResListe({ erz, kri, pla, qua });
    if (resTxt) beute.push(resTxt);
    if (cc > 0) beute.push(`+${wrFmt(cc)} CC`);
    wrToast(`🚀 ${n === 1 ? 'Deine Flotte ist' : n + ' Flotten sind'} zurück${beute.length ? ' — ' + beute.join(' · ') : ''}`, 'success', beute.length > 0);
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
  // 💰 FIX 2026-07-30 (JP: „die Abgeflossenen CC werden erst sichtbar, wenn ich komplett
  // das Thema Wechsel, z.B. auf Profil gehe").
  // URSACHE: diese Funktion schrieb den neuen Stand nur in die DATENOBJEKTE. Die Kopfzeile
  // ist ein eigener DOM-Knoten, der nur beim Rendern einer View neu geschrieben wird —
  // wrRender() zeichnet aber nur den 🚀-Tab, nicht den Header. Jeder Kauf im Weltraum
  // (Schiffe, Geschütze, Forschung, Generatoren, Handel) lief hier durch und liess oben
  // die alte Zahl stehen.
  // MERKE: Wer `coins` ändert, MUSS _updateHeaderCoins mitrufen — das Datenobjekt allein
  // ist nicht die Anzeige. Regel 3: nie blockierend, der Kauf ist längst gebucht.
  try {
    if (typeof _updateHeaderCoins === 'function') _updateHeaderCoins({ coins });
  } catch (e) { /* non-critical */ }
}
// `html = true` gibt das Markup durch (Rohstoff-Bilder aus wrIc). Nur für selbst
// erzeugte Zeichenketten verwenden — nie für Servertexte oder Spielernamen.
function wrToast(msg, kind, html) {
  if (typeof showToast === 'function') {
    try { showToast(msg, kind || 'info', html ? { html: true } : undefined); return; } catch (e) {}
  }
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
    station_limit:         'Höchstens 3 Quadranten-Stationen je Spieler.',
    colony_inbound:        'Zu diesem Planeten fliegt bereits eine Kolonie-Mission — ein zweiter Verband würde nur umkehren.',
    already_colonized:     'Dieser Planet ist bereits kolonisiert.',
    colony_kit_incomplete: 'Der Kolonie-Mission fehlt noch etwas — die Anforderung steht unter dem Kolonisieren-Knopf.',
    // ⚠️ 27ac: Hier stand „48 Stunden". Der Text war seit 27w falsch (24) — und dieselbe
    // 48 stand hartkodiert in `_space_transmute_ready`, weshalb JP tatsächlich 48 warten
    // musste. Der Text war also RICHTIG für einen Fehler, der jetzt behoben ist.
    // Deshalb nennt er ab sofort gar keine Zahl mehr, sondern die Anzeige verweist auf
    // die Restzeit, die daneben steht — eine Zahl an zwei Orten läuft wieder auseinander.
    transmute_cooldown:    'Der Transmuter läuft noch nach — die Restzeit steht am Gerät.',
    // ⚡ 27ac
    boost_arrived:         'Diese Flotte ist schon angekommen — beschleunigen bringt nichts mehr.',
    boost_too_close:       'Zu kurz vor der Ankunft: nach einem Boost müssen 5 Minuten übrig bleiben.',
    boost_no_kristall:     'Nicht genug 💎 Kristall für den Boost.',
    no_trip:               'Diese Reise gibt es nicht mehr — vielleicht ist sie gerade angekommen.',
    // 💰 27ac
    not_enough_cc_dispatch: 'Nicht genug CC für den Einsatz — das Absenden kostet 3× die Kampfkraft des Verbands.',
    region_too_strong:     'Diese Region gehört jemand anderem — dein Verband ist zu schwach für eine Kolonie dort (nötig: das 1,15-fache der Regionsverteidigung).',
    merc_active:           'Es läuft bereits ein Söldner-Geschwader.',
    merc_not_rentable:     'Dieses Schiff lässt sich nicht mieten.',
    merc_too_big:          'So grosse Geschwader vermittelt niemand.',
    no_merc:               'Kein Söldner-Geschwader vorhanden.',
    not_your_colony:       'Das ist nicht deine Kolonie.',
    tech_busy:             'Es läuft bereits ein Forschungsprojekt.',
    not_damaged:           'Dieses Geschütz ist unbeschädigt.',
    bad_ship:              'Dieses Schiff lässt sich so nicht bauen (das Mutterschiff nur über sein eigenes Panel).',
    insufficient_coins:    'Nicht genug CoffeeCoins.',
    insufficient_erz:      'Nicht genug 🪨 Erz.',
    insufficient_kristall: 'Nicht genug 💎 Koffeinkristall.',
    // 27i: seit die schweren Schiffe Exoten kosten, kann der Warenkorb auch daran
    // scheitern. build_mutterschiff wirft diese beiden Codes seit 26j — sie fehlten hier
    // trotzdem und wären als roher Code durchgeschlagen.
    insufficient_plasmoid: 'Nicht genug 🟣 Plasmoiden-Staub.',
    insufficient_quantum:  'Nicht genug 🌀 Quantenschaum.',
    // 🛡️ 27k Garnison. `garrison_full` und `not_enough_ships` werden in wrGarrisonSend
    // mit den Server-Zahlen ausformuliert — hier steht nur der Rückfall.
    garrison_busy:    'Zu dieser Kolonie ist bereits ein Transport unterwegs. Es läuft immer nur einer.',
    garrison_full:    'Auf dieser Kolonie ist kein Platz mehr für weitere Schiffe.',
    not_your_colony:  'Das ist nicht deine Kolonie.',
    not_enough_ships: 'So viele Schiffe sind nicht da.',
    fleet_mothballed: 'Deine Flotte ist eingemottet — erst den Soldrückstand begleichen.',
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
    // 27aa — der Server liefert `what/need/have` mit; wrTripStart wertet das aus und
    // zeigt die Zahlen. Dieser Text ist nur der Rückfall, falls die Angaben fehlen.
    not_enough_exo:        'Nicht genug Ring-Rohstoffe als Treibstoff für diese Reise.',
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
    // ⚡ Energie-Generator (26p)
    bad_power:             'Unbekannter Generator-Typ.',
    power_empty:           'Du hast noch kein Kraftwerk — erst einen Generator bauen.',
    power_exists:          'Es steht schon ein Generator. Baue ihn aus oder rüste ihn um.',
    // ⛽🟣 Plasmoid-Kreislauf (26s)
    no_fuel_needed:        'Dieser Reaktortyp ist wartungsfrei — er braucht keinen Treibstoff.',
    // ⚡ 27n: vorher wurde hier stillschweigend gebucht und der Vorrat verbrannte.
    power_building:        'Der Reaktor wird noch gebaut — betankt werden kann er erst, '
                         + 'wenn er steht. Es wurde nichts abgebucht.',
    tank_full:             'Der Tank ist voll.',
    inject_full:           'Mehr als 100 🟣 lassen sich nicht injizieren (+40 % ist der Deckel).',
    power_max:             'Dieser Generator ist bereits auf der höchsten Stufe.',
    power_locked:          'Diesen Generator musst du zuerst freischalten — er braucht den '
                         + 'passenden Rohstoff-Abbau (Plasmoid-Kollektor bzw. Quantenschaum-Extraktor).',
    power_not_better:      'Umrüsten geht nur auf ein STÄRKERES Kraftwerk.',
    same_power:            'Dieser Generator steht bereits.',
  };
  return map[err] || ('Fehler: ' + (err || 'unbekannt'));
}
