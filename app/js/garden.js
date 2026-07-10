// ═══════════════════════════════════════════════════════════════════════════
// garden.js — 🪴 Kaffee-Garten (Erlebnis-Minigame #1)
// Plan: plans/2026-07-14-erlebnis-minigames-finalspec.md §1
// Muss VOR imperium.js geladen werden (imperium.js baut den Tab, nutzt die
// Kataloge/Helfer hier). Reiner Content + Logik, kein DOM.
//
// 7 Epochen × 12 Elemente = 84 (= das „Kaffee-Lexikon"). Element-ID = '<epoch>_<slot>'
// (slot 1..12). Preis rein aus dem Slot-Index (GARDEN_SLOT_COST) — dieselbe Tabelle
// steht in sql/migration_2026-07-14_garden.sql (_garden_element_cost). Sync-Pflicht!
// Slot 1–7 = häufig · 8–11 = ungewöhnlich · 12 = selten.
// ═══════════════════════════════════════════════════════════════════════════

// Index 1..12 (Index 0 ungenutzt) — MUSS mit _garden_element_cost(slot) in der SQL übereinstimmen.
const GARDEN_SLOT_COST = [null, 20, 25, 25, 30, 30, 35, 40, 50, 60, 75, 90, 140];

const GARDEN_EPOCHS = [
  { id: 'kaffa',     icon: '🌿', name: 'Kaffa-Wald',        sub: 'Äthiopien · der Ursprung' },
  { id: 'mokka',     icon: '⛵', name: 'Jemen & Mokka',      sub: 'der erste Kaffeehandel' },
  { id: 'osman',     icon: '🕌', name: 'Osmanisches Reich',  sub: 'die ersten Kaffeehäuser' },
  { id: 'europa',    icon: '🏛️', name: 'Europa (17. Jh.)',   sub: 'Kaffeehäuser & Aufklärung' },
  { id: 'kolonial',  icon: '⛴️', name: 'Kolonialzeit',       sub: 'Kaffee erobert die Welt' },
  { id: 'industrie', icon: '⚙️', name: 'Industrialisierung', sub: 'Espresso, Filter & Instant' },
  { id: 'modern',    icon: '✨', name: 'Moderne · Third Wave', sub: 'Kaffee als Handwerk' },
];

// Je Epoche 12 Elemente in Slot-Reihenfolge (1..12). Slot 12 = seltenes „Kronstück".
// Story-Texte verdichtet aus plans/build_quiz.py (Themen Herkunft/Pflanze/Anbau/Roestung).
const GARDEN_ELEMENTS = {
  kaffa: [
    { icon: '🐐', name: 'Kaldi & die Ziegen',   story: 'Der Legende nach bemerkte der äthiopische Hirte Kaldi, wie seine Ziegen nach den roten Kirschen munter umhersprangen.' },
    { icon: '🌳', name: 'Der Wildkaffee-Wald',  story: 'In den Nebelwäldern der Region Kaffa wächst Coffea arabica bis heute wild — die Wiege des Kaffees.' },
    { icon: '☕', name: 'Coffea arabica',       story: 'Arabica gehört zur Familie der Rötegewächse (Rubiaceae) und liefert den Großteil des Welt-Kaffees.' },
    { icon: '🍒', name: 'Die Kaffeekirsche',    story: 'Botanisch eine Steinfrucht: Die „Bohne" ist ihr Samen — meist zwei flache Hälften pro Frucht.' },
    { icon: '🤍', name: 'Die Kaffeeblüte',      story: 'Die weißen Blüten duften jasminartig und öffnen sich oft nur für wenige Tage nach dem ersten Regen.' },
    { icon: '🌱', name: 'Heirloom-Landsorten',  story: 'In Äthiopien wachsen unzählige wilde Landsorten gemischt — „Heirloom" nennt man diese uralte Vielfalt.' },
    { icon: '⛰️', name: 'Das Hochland',         story: 'Arabica gedeiht am besten in 1000–2000 m Höhe: kühl, langsam gereift, geschmacklich komplex.' },
    { icon: '🧬', name: 'Coffea eugenioides',   story: 'Diese sehr koffeinarme Wildart ist einer der beiden natürlichen Eltern des Arabica.' },
    { icon: '🫖', name: 'Die Buna-Zeremonie',   story: 'Äthiopiens Kaffeezeremonie „Buna" röstet, mahlt und brüht die Bohnen frisch vor den Gästen.' },
    { icon: '🏘️', name: 'Handelsstadt Harar',   story: 'Die alte Mauerstadt Harar war ein Umschlagplatz, ihr Name steht bis heute für einen wilden, würzigen Kaffee.' },
    { icon: '🌴', name: 'Der Waldgarten',       story: 'Schattenbäume wie Inga liefern Stickstoff und Schatten — Kaffee wächst hier im Einklang mit dem Wald.' },
    { icon: '👑', name: 'Die Urmutter Arabica', story: 'Arabica entstand als natürliche Kreuzung zweier Wildarten und ist deshalb tetraploid (44 Chromosomen) — einzigartig unter den Kaffees.' },
  ],
  mokka: [
    { icon: '⚓', name: 'Der Hafen Mokka',      story: 'Über den jemenitischen Hafen Mokka lief ab dem 15. Jh. der erste kommerzielle Kaffeehandel der Welt.' },
    { icon: '🌙', name: 'Die Sufi-Mönche',      story: 'Sufi-Mystiker tranken Kaffee, um bei ihren langen nächtlichen Gebeten wach zu bleiben.' },
    { icon: '📜', name: '„Qahwa"',              story: 'Das arabische Wort „qahwa" bezeichnete ein anregendes Getränk — daraus wurde unser „Kaffee".' },
    { icon: '🏞️', name: 'Terrassenfelder',      story: 'An den steilen Hängen des Jemen legten Bauern schmale Terrassen an, um Kaffee zu kultivieren.' },
    { icon: '🌰', name: 'Baba Budan',           story: 'Der Pilger Baba Budan soll sieben Bohnen aus Mokka nach Südindien geschmuggelt und den Handel gebrochen haben.' },
    { icon: '🔥', name: 'Die erste Röstung',    story: 'Erst das Rösten über offenem Feuer verwandelte die grünen Samen in das aromatische Getränk.' },
    { icon: '🫗', name: 'Die Dallah-Kanne',     story: 'In der kupfernen Dallah wurde und wird der arabische Kaffee gebrüht und feierlich eingeschenkt.' },
    { icon: '🔒', name: 'Das Mokka-Monopol',    story: 'Um sein Monopol zu sichern, gab der Jemen nur gebrühte oder gebrühfähig gemachte Bohnen aus.' },
    { icon: '🧕', name: 'Scheich al-Shadhili',  story: 'Dem Sufi-Scheich al-Shadhili wird zugeschrieben, den Kaffee im Jemen religiös etabliert zu haben.' },
    { icon: '🐪', name: 'Die Karawanen',        story: 'Karawanen trugen den Kaffee von Mokka nach Mekka — von dort verbreitete er sich in die islamische Welt.' },
    { icon: '🍷', name: '„Wein des Islam"',     story: 'Weil Alkohol verboten war, wurde der anregende Kaffee zum geselligen „Wein des Islam".' },
    { icon: '👑', name: 'Das Mokka-Siegel',     story: 'Jahrhundertelang war „Mokka" das Gütesiegel schlechthin — der Name überlebt bis heute in jeder Kaffeekarte.' },
  ],
  osman: [
    { icon: '🏠', name: 'Das erste Kaffeehaus', story: 'Um 1554 öffneten in Konstantinopel die ersten öffentlichen Kaffeehäuser — soziale Treffpunkte lange vor Europa.' },
    { icon: '🗣️', name: 'Qahveh khaneh',        story: 'Die „qahveh khaneh" waren Orte für Gespräche, Spiele und Musik — die Universität des kleinen Mannes.' },
    { icon: '♨️', name: 'Türkischer Kaffee',    story: 'Fein gemahlen und mitsamt Satz in der Cezve aufgekocht — der türkische Kaffee ist UNESCO-Kulturerbe.' },
    { icon: '🔮', name: 'Der Kaffeesatz',       story: 'Aus dem Muster des getrockneten Kaffeesatzes las man die Zukunft — eine bis heute gepflegte Tradition.' },
    { icon: '💍', name: 'Kaffee & Ehe',         story: 'Der Überlieferung nach durfte eine Frau die Scheidung fordern, wenn ihr Mann keinen Kaffee bereitstellte.' },
    { icon: '🚫', name: 'Das Verbot von Mekka', story: '1511 versuchten Gelehrte in Mekka, den Kaffee zu verbieten — vergeblich, er war längst unverzichtbar.' },
    { icon: '🏙️', name: 'Kairoer Häuser',       story: 'In Kairo wurden Kaffeehäuser zu belebten Zentren des Austauschs von Nachrichten und Poesie.' },
    { icon: '👳', name: 'Hofkaffee',            story: 'Am Hof der Sultane wachte ein eigener Kaffeemeister über die Zubereitung — ein Amt von hohem Rang.' },
    { icon: '🎒', name: 'Die Kaffeeträger',     story: 'Ganze Zünfte von Trägern brachten den frisch gebrühten Kaffee durch die Gassen zu den Kunden.' },
    { icon: '🪑', name: 'Der Kaffee-Diwan',     story: 'Auf niedrigen Sitzkissen wurde der Kaffee in Runden gereicht — Gastfreundschaft als Zeremonie.' },
    { icon: '🔥', name: 'Die Röstmeister',      story: 'Osmanische Röstmeister entwickelten das Handwerk, die Bohnen gleichmäßig dunkel zu rösten.' },
    { icon: '👑', name: 'Verbot & Aufhebung',   story: 'Trotz mehrerer Verbote unter Todesstrafe setzte sich der Kaffee im Reich endgültig durch — die Lust siegte über das Gesetz.' },
  ],
  europa: [
    { icon: '🚢', name: 'Venedig',              story: 'Über Venedig und den osmanischen Handel erreichte der Kaffee im 17. Jahrhundert erstmals Europa.' },
    { icon: '✝️', name: 'Der Segen des Papstes', story: 'Statt den „Trank der Ungläubigen" zu verbieten, soll Papst Clemens VIII. den Kaffee kurzerhand gesegnet haben.' },
    { icon: '🏛️', name: 'Das Wiener Kaffeehaus', story: 'Das Wiener Kaffeehaus wurde zur Institution — Zeitung, Marmortisch und stundenlanges Verweilen inklusive.' },
    { icon: '🎓', name: 'Penny Universities',   story: 'In Englands Kaffeehäusern gab es für einen Penny Kaffee und gelehrte Gespräche — daher „Penny Universities".' },
    { icon: '📈', name: "Lloyd's of London",    story: "Aus Edward Lloyd's Kaffeehaus, dem Treff der Schiffsversicherer, wurde die Versicherung Lloyd's of London." },
    { icon: '☕', name: 'Café Procope',         story: 'Paris’ Café Procope wurde zum Treffpunkt der Aufklärer — Voltaire und Diderot sollen hier gedacht haben.' },
    { icon: '📰', name: 'Die Zeitungsstube',    story: 'Kaffeehäuser waren die Nachrichtenbörsen ihrer Zeit — hier wurde gelesen, debattiert und gehandelt.' },
    { icon: '🎼', name: 'Bachs Kaffeekantate',  story: 'Johann Sebastian Bach vertonte die Kaffeesucht seiner Zeit augenzwinkernd in einer eigenen Kantate.' },
    { icon: '🥐', name: 'Die Wiener Säcke 1683', story: 'Nach dem Abzug der Osmanier vor Wien blieben Säcke voller Bohnen zurück — der Grundstein der Wiener Kaffeekultur.' },
    { icon: '📝', name: 'Die Frauen-Petition',  story: '1674 beklagte eine Londoner Frauen-Petition, der Kaffee mache die Männer geschwätzig und träge.' },
    { icon: '🥛', name: 'Die Wiener Melange',   story: 'Mit Milchschaum verfeinert entstand aus dem bitteren Sud die sanfte Wiener Melange.' },
    { icon: '👑', name: 'Caffè Florian',        story: 'Das 1720 eröffnete Caffè Florian am Markusplatz gilt als eines der ältesten durchgehend betriebenen Cafés der Welt.' },
  ],
  kolonial: [
    { icon: '🌊', name: 'Gabriel de Clieu',     story: 'De Clieu brachte einen Setzling unter Entbehrungen über den Atlantik nach Martinique — Keimzelle der Neuen Welt.' },
    { icon: '🇮🇩', name: 'Java',                  story: 'Die Niederländer bauten auf Java erfolgreich Kaffee an — bis heute steht „a cup of Java" für eine Tasse Kaffee.' },
    { icon: '🏝️', name: 'Insel Bourbon',        story: 'Auf der Insel Bourbon (heute La Réunion) kultivierten die Franzosen die Varietät, die ihren Namen trägt.' },
    { icon: '🚜', name: 'Die Plantage',         story: 'Aus dem Waldkaffee wurde Monokultur: riesige Plantagen zur Versorgung der europäischen Nachfrage.' },
    { icon: '🔵', name: 'Blue Mountain',        story: 'Jamaikas Blue-Mountain-Kaffee, eine Typica-Linie, gilt als einer der teuersten der Welt.' },
    { icon: '🌺', name: 'Kona (Hawaii)',        story: 'An den Vulkanhängen von Kona auf Hawaii entstand ein weltberühmter, milder Kaffee.' },
    { icon: '🌿', name: 'Die Typica-Linie',     story: 'Von Java über Amsterdam bis in die Karibik: Fast alle alten Sorten stammen von der Linie Typica ab.' },
    { icon: '💐', name: 'Palheta in Brasilien', story: 'Der Legende nach schmuggelte Offizier Palheta Samen in einem Blumenstrauß nach Brasilien.' },
    { icon: '🍂', name: 'Der Fall Ceylons',     story: 'Der Kaffeerost vernichtete um 1870 Ceylons Plantagen — die Insel stieg daraufhin auf Tee um.' },
    { icon: '⛓️', name: 'Das dunkle Kapitel',   story: 'Der koloniale Kaffeeboom beruhte über weite Strecken auf Sklaverei und Zwangsarbeit — ein bitteres Erbe.' },
    { icon: '🐘', name: 'Maragogipe',           story: 'Diese Typica-Mutation bringt auffallend große Bohnen hervor — die „Elefantenbohne".' },
    { icon: '👑', name: 'Der Sorten-Stammbaum', story: 'Bourbon und Typica wurden zu den zwei Stammlinien fast aller Kultur-Arabicas weltweit.' },
  ],
  industrie: [
    { icon: '⚙️', name: 'Moriondos Maschine',   story: 'Angelo Moriondo ließ 1884 in Turin die erste dampfbetriebene Kaffee-Großmaschine patentieren.' },
    { icon: '💨', name: 'Bezzeras Espresso',    story: 'Luigi Bezzera baute 1901 die Maschine, die Kaffee unter Druck in Sekunden brühte — der Espresso war geboren.' },
    { icon: '🤎', name: 'Gaggias Crema',        story: 'Achille Gaggias Hebelmaschine erzeugte 1948 erstmals die stabile goldene Crema des modernen Espresso.' },
    { icon: '🫙', name: 'Nescafé',              story: 'Nestlé machte 1938 mit Nescafé den sprühgetrockneten Instantkaffee weltweit zum Massenprodukt.' },
    { icon: '📄', name: 'Melittas Filter',      story: 'Melitta Bentz erfand 1908 den Papierfilter — Schluss mit Kaffeesatz in der Tasse.' },
    { icon: '☕', name: 'Die Moka-Kanne',       story: 'Alfonso Bialettis Moka-Kanne von 1933 brachte den Espresso auf jeden italienischen Herd.' },
    { icon: '📦', name: 'Die Vakuumdose',       story: 'Die Vakuumverpackung hielt gerösteten Kaffee frisch und machte den Fernversand möglich.' },
    { icon: '🇧🇷', name: 'Brasiliens Aufstieg',  story: 'Seit dem 19. Jahrhundert ist Brasilien der mit Abstand größte Kaffeeproduzent der Welt.' },
    { icon: '🍄', name: 'Der Kaffeerost',       story: 'Der Pilz Hemileia vastatrix verursachte historische Ernteausfälle und veränderte ganze Anbauregionen.' },
    { icon: '🏭', name: 'Der Trommelröster',    story: 'Große Trommelröster industrialisierten das Rösten — Kontakt- und Heißluftwärme in einer Maschine.' },
    { icon: '❄️', name: 'Frost in Brasilien',   story: 'Eine einzige Frostnacht („geada") kann brasilianische Plantagen schädigen und den Weltmarktpreis hochtreiben.' },
    { icon: '👑', name: 'Die italienische Bar', story: 'Aus der Espressomaschine erwuchs die italienische Bar-Kultur — schnell, stehend, im Vorbeigehen genossen.' },
  ],
  modern: [
    { icon: '🎯', name: 'Die Third Wave',       story: 'Die „Third Wave" behandelt Kaffee wie Wein: Herkunft, Handwerk und Transparenz stehen im Mittelpunkt.' },
    { icon: '🏅', name: 'Specialty ≥ 80',       story: 'Ab 80 von 100 Punkten der SCA-Bewertung gilt ein Kaffee offiziell als „Specialty".' },
    { icon: '🤝', name: 'Direct Trade',         story: 'Beim Direct Trade kaufen Röster direkt beim Erzeuger — für bessere Qualität und faireren Preis.' },
    { icon: '🎨', name: 'Latte Art',            story: 'Aus feinem Milchschaum gießen Baristas Herzen, Rosetten und Tulpen — Handwerk zum Ansehen.' },
    { icon: '🌸', name: 'Geisha',               story: 'Die Geisha-Varietät aus Äthiopien wurde 2004 über Panama weltberühmt für ihr florales Profil.' },
    { icon: '🧊', name: 'Cold Brew',            story: 'Kalt und stundenlang extrahiert wird Cold Brew mild und säurearm — kaltes Wasser löst weniger Bitterstoffe.' },
    { icon: '⏳', name: 'Der Handfilter',       story: 'V60, Chemex & Co. brachten den handgebrühten Filterkaffee als klare, präzise Zubereitung zurück.' },
    { icon: '🫧', name: 'Anaerobe Fermentation', story: 'In luftdichten Tanks vergoren entstehen intensive, oft fruchtig-funky Geschmacksprofile.' },
    { icon: '👅', name: 'Cupping & Aromarad',   story: 'Beim Cupping bewerten Prüfer den Kaffee systematisch — das Aromarad gibt den Noten einen Namen.' },
    { icon: '🏆', name: 'Barista-WM',           story: 'Bei Weltmeisterschaften treten Baristas mit perfekt abgestimmten Signature-Getränken gegeneinander an.' },
    { icon: '🌡️', name: 'Klimawandel 2050',     story: 'Steigende Temperaturen könnten die für Arabica geeigneten Anbauflächen bis 2050 drastisch verkleinern.' },
    { icon: '👑', name: 'Kaffee als Terroir',   story: 'Boden, Höhe, Klima und Sorte im Zusammenspiel — moderner Spezialkaffee denkt in Terroir wie der Weinbau.' },
  ],
};

// ── Helfer ───────────────────────────────────────────────────────────────────
const GARDEN_TOTAL = GARDEN_EPOCHS.length * 12; // 84

function gardenElementCost(slot) { return GARDEN_SLOT_COST[slot] || 0; }
function gardenElementId(epochId, slot) { return epochId + '_' + slot; }
function gardenRarity(slot) { return slot <= 7 ? 'haeufig' : (slot <= 11 ? 'ungewoehnlich' : 'selten'); }
function gardenRarityLabel(slot) {
  return slot <= 7 ? 'häufig' : (slot <= 11 ? 'ungewöhnlich' : 'selten');
}
function gardenEpochDef(epochId) { return GARDEN_EPOCHS.find(e => e.id === epochId) || null; }
function gardenElementDef(epochId, slot) {
  const arr = GARDEN_ELEMENTS[epochId]; return (arr && arr[slot - 1]) || null;
}
// slot aus einer Element-ID ('kaffa_9' → 9)
function gardenSlotOfId(id) { const n = parseInt(String(id).split('_')[1], 10); return isNaN(n) ? 0 : n; }

function gardenUnlockedMap(garden) { return (garden && garden.unlocked) || {}; }
function gardenIsUnlocked(garden, id) { return !!gardenUnlockedMap(garden)[id]; }
function gardenLexikonCount(garden) { return Object.keys(gardenUnlockedMap(garden)).length; }
function gardenEpochUnlockedCount(garden, epochId) {
  const u = gardenUnlockedMap(garden); let n = 0;
  for (const k in u) { if (k.split('_')[0] === epochId) n++; }
  return n;
}
function gardenEpochComplete(garden, epochId) { return gardenEpochUnlockedCount(garden, epochId) === 12; }
function gardenAllComplete(garden) { return gardenLexikonCount(garden) === GARDEN_TOTAL; }
// Gesamtwert (Summe gezahlter Freischaltkosten) → für _ccVermoegen / Gesamtvermögen
function gardenValue(garden) {
  const u = gardenUnlockedMap(garden); let sum = 0;
  for (const k in u) sum += gardenElementCost(gardenSlotOfId(k));
  return sum;
}

// ── Einkommen (der „Gegenwert" des Gartens) ──────────────────────────────────
// Jedes freigeschaltete Element wirft raritäts-skaliert CC ab: ein Passiv-Kanal
// (CC/Tag, tassen-unabhängig = verlässliche Amortisation) UND ein Tassen-Kanal
// (CC/Tasse). Balancing 2026-07-14 (JP-Vorgabe nach Live-Test): bei voller
// Sammlung (84/84) soll die BASIS (ohne Forschungs-Boni) ~80 CC/Tag passiv +
// ~20 CC/Tasse ergeben — vorher ~59,5/Tag + ~1,16/Tasse war zu mager für 4.340 CC
// Investition. Der Tassen-Kanal wurde bewusst stark aufgewertet → aktives
// Kaffeetrinken lohnt sich jetzt spürbar. Amortisation passiv allein ~54 Tage,
// mit Tassen + Boni deutlich schneller.
//   perDay voll: 49×0,5 + 28×1,1 + 7×3,5 = 79,8 ≈ 80/Tag
//   perCup voll: 49×0,125 + 28×0,275 + 7×0,875 = 19,95 ≈ 20/Tasse
// Beide laufen zusätzlich durch gardenIncomeMult() — dieselben globalen
// Forschungs-Multiplikatoren wie beim Forschungs-Einkommen (+25% je abgeschlossenem
// Tier · Bio-Zertifikat +20% · Weltkonzern ×3). Der Tassen-Kanal bekommt den
// CIQ-Kartell-×2 zusätzlich über den normalen totalCoins-Pfad in db.js addCups.
// Slot-Index 1..12 (häufig 1–7 · ungewöhnlich 8–11 · selten 12).
const GARDEN_SLOT_PERDAY = [null, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.1, 1.1, 1.1, 1.1, 3.5];
const GARDEN_SLOT_PERCUP = [null, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.275, 0.275, 0.275, 0.275, 0.875];

function gardenSlotPerDay(slot) { return GARDEN_SLOT_PERDAY[slot] || 0; }
function gardenSlotPerCup(slot) { return GARDEN_SLOT_PERCUP[slot] || 0; }

// Rohsummen (ohne Multiplikator) über alle freigeschalteten Elemente.
function gardenPerDayBase(garden) {
  const u = gardenUnlockedMap(garden); let s = 0;
  for (const k in u) s += gardenSlotPerDay(gardenSlotOfId(k));
  return Math.round(s * 100) / 100;
}
function gardenPerCupBase(garden) {
  const u = gardenUnlockedMap(garden); let s = 0;
  for (const k in u) s += gardenSlotPerCup(gardenSlotOfId(k));
  return Math.round(s * 1000) / 1000;
}
// Globale Forschungs-Multiplikatoren (Spiegel der „ALLE CC"-Boni aus research.js).
// tierBonusMult stammt aus research.js (lädt vor garden.js) → typeof-Guard robust.
function gardenIncomeMult(research) {
  const r = research || {}; let m = 1;
  if (r.bio_zertifikat) m *= 1.2;   // global_plus20
  if (r.weltkonzern)    m *= 3;     // all_x3 (Endgame)
  if (typeof tierBonusMult === 'function') m *= tierBonusMult(r); // +25% je abgeschlossenem Tier
  return m;
}
// Effektives Einkommen inkl. Multiplikator — von db.js (addCups / Passiv) genutzt.
function gardenPerDay(garden, research) { return Math.round(gardenPerDayBase(garden) * gardenIncomeMult(research) * 100) / 100; }
function gardenPerCup(garden, research) { return Math.round(gardenPerCupBase(garden) * gardenIncomeMult(research) * 1000) / 1000; }
