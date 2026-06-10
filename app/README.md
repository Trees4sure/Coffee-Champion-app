# ☕ Coffee Champion

Ein spielerisches Kaffee-Tracking-System im Gaming-/E-Sport-Stil — für beliebig viele Teams gleichzeitig.

Jedes Team erstellt eine eigene Gruppe mit Passwort. Kein Account, keine Installation, kein Kreditkarte.

## Features

| Feature | Beschreibung |
|---|---|
| Gruppen-System | Beliebig viele Teams, jeweils isoliert mit eigenem Passwort |
| Rangliste | Automatisch alle 30 Sek. aktualisiert, manuell per Knopfdruck |
| Podium | 2./1./3.-Reihenfolge mit Gold/Silber/Bronze |
| Schnelleingabe | +1/+2/+3/+5 oder eigene Menge |
| Titel-System | 10 Ränge (Kaffee-Neuling → Kaiser des Koffeins) |
| 20 Achievements | Meilensteine, Aktivität, Eingabe, Zeit, Wettbewerb |
| Streak-Tracking | Tagesbasiert |
| Saison-System | Monatlich, automatisch erstellt |
| Hall of Fame | Ewige Bestenliste: meiste Tassen, Serien, Siege |
| Statistiken | Tägliche Balkendiagramme, Top-10-Saisonvergleich |
| Poster-Generator | Druckbares A3-Meisterschaftsposter mit aktuellen Daten |
| Admin-Bereich | Saison abschließen, Daten zurücksetzen (nur Gruppenadmin) |
| QR-Code | App-URL als scannbarer Code zum Teilen |
| PWA-fähig | Installierbar als App |

## Technik

- **Frontend:** Reines HTML/CSS/JS — kein Framework, kein Build-Step
- **Backend:** [Supabase](https://supabase.com) (Postgres + Row Level Security)
- **Hosting:** [Netlify](https://netlify.com) (kostenlos)
- **Auth:** Kein Account nötig — Gruppenpasswort (SHA-256) + Name-Auswahl

## Einrichtung

### 1. Supabase-Projekt anlegen

1. [supabase.com](https://supabase.com) → neues Projekt anlegen
2. Im SQL Editor das Schema aus `reference/supabase_schema.sql` ausführen
3. Unter **Project Settings → API** die Werte kopieren:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`

### 2. `js/config.js` befüllen

```js
const SUPABASE_URL      = 'https://dein-projekt.supabase.co';
const SUPABASE_ANON_KEY = 'dein-anon-key';
```

Der Anon Key ist per Design public — er ist client-seitig sicher, solange Row Level Security aktiviert ist (im Schema bereits enthalten).

### 3. Deployen

Den gesamten Ordner per Drag & Drop in ein [Netlify](https://netlify.com)-Projekt ziehen — oder mit GitHub verbinden für automatische Deploys bei jedem Push.

## Benutzung

1. App öffnen → **Gruppe erstellen** (Name + Passwort wählen)
2. Link oder QR-Code ans Team schicken → **Beitreten** mit demselben Gruppenname + Passwort
3. Namen eingeben → Tassen eintragen → Meisterschaft läuft

Der erste Nutzer einer Gruppe wird automatisch **Admin** und kann Saisons abschließen sowie Daten zurücksetzen.

## Titel-System

| Tassen | Titel |
|---|---|
| 0 | Kaffee-Neuling |
| 50 | Bohnenanwärter |
| 100 | Filtermeister |
| 250 | Espresso-Ritter |
| 500 | Koffein-Kommandant |
| 750 | Bohnenkönig |
| 1000 | Kaffee-Legende |
| 1500 | Unsterblicher Koffeinlord |
| 2500 | Herrscher der Bohnen |
| 5000 | Kaiser des Koffeins |

## Dateistruktur

```
index.html          # Single-Page-App
manifest.json       # PWA-Manifest
css/style.css       # Espresso-Dark + Gold Design
js/
  config.js         # Supabase URL + Key (anpassen!)
  auth.js           # Session (localStorage)
  achievements.js   # Achievement-Definitionen
  db.js             # Supabase Daten-Layer
  app.js            # App-Logik und Views
icons/              # PWA-Icons
```
