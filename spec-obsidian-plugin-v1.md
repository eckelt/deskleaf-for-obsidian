# Deskleaf for Obsidian – Plugin Specification v1.0
*Stand: Mai 2026*

---

## Vision

Ein Obsidian-Plugin das macOS-Kalenderdaten konsumiert und Obsidian zur zentralen
Arbeitsumgebung macht: Kalender, Notizen, Templates, Topics und Todos – alles in einem.
Keine neue App, kein Backend, kein Cloud-Dienst.

---

## Systemarchitektur

```
macOS Kalender (EventKit)
        ↓  (focal-cal Binary, läuft im Plugin-Prozess)
Obsidian Plugin (liest Events, schreibt Notizen)
        ↓
Obsidian Vault (Markdown-Dateien)
```

---

## Datenquelle: focal-cal Binary

Das Plugin kommuniziert ausschließlich über ein mitgeliefertes Swift-Binary (`focal-cal`),
das über EventKit direkt auf den macOS-Kalender zugreift.

### Binary-Pfad
Konfigurierbar in den Plugin-Settings (`binaryPath`). Default: automatisch im Plugin-Verzeichnis
gesucht (`<vault>/.obsidian/plugins/<plugin>/focal-cal`). Einmalig mit `swift/build.sh` bauen.

### JSON-Schema (Binary-Output)

Das Binary gibt pro Zeile ein JSON-Array aus:

```json
[
  {
    "id": "string",               // eventIdentifier, oder "eventIdentifier|YYYY-MM-DD" bei Recurring
    "title": "string",
    "start": "ISO8601",           // Datum+Zeit bei Timed-Events, nur Datum bei All-Day
    "end": "ISO8601",
    "location": "string | null",
    "attendees": ["string", ...],
    "body": "string | null",
    "calendar": "string",
    "isRecurring": true,
    "isCancelled": false,
    "isAllDay": false,
    "isOrganizer": true,          // true wenn organizer nil oder isCurrentUser
    "meetingPlatform": "zoom | teams | meet | webex | null",
    "numAttendees": 2,
    "organizer": "string | null"
  }
]
```

### Event-ID-Schema
- Einfache Events: rohes `eventIdentifier`
- Recurring-Events: `eventIdentifier|YYYY-MM-DD` (komposit, pro Occurrence)

---

## Obsidian Plugin

### Tech Stack
- **TypeScript** (Obsidian Plugin API Standard)
- **Obsidian API:** ItemView, WorkspaceLeaf, Modal, TFile, Vault
- **Kein externes Framework** – nur DOM + Obsidian-eigene Komponenten
- **CSS:** Custom Properties, kompatibel mit Obsidian Light/Dark-Themes, E-Paper-Ästhetik

### Plugin-Settings

```typescript
interface FocalSettings {
  binaryPath: string;       // leer = automatisch im Plugin-Verzeichnis suchen
  weekStartsOn: "monday";   // fix
  templateFolder: string;   // default: "templates"
  notesFolder: string;      // default: "notes"
  topicsFolder: string;     // default: "topics"
  topicsOrder: string[];    // geordnete Datei-Pfade für Sidebar-Sortierung
}
```

---

## Views & Navigation

### View 1 – Kalender (Hauptansicht)

**Responsive Spalten-Logik:**

Die Anzahl sichtbarer Tages-Slots wird kontinuierlich aus der Container-Breite berechnet
(`ResizeObserver`, Mindest-Spaltenbreite 120px, Gutter 44px):

```
visibleDays = clamp(floor((containerWidth - 44px) / 120px), 1, 6)
```

| visibleDays | Verhalten |
|---|---|
| 6 | Wochenansicht: Mo–Fr als 5 einzelne Spalten + Sa\|So als eine gemeinsame Spalte |
| 2–5 | N-Tages-Ansicht: N Slots ab `anchor` (Sa+So immer zusammen) |
| 1 | Einzeltags-Ansicht |

**Navigation:**
- Pfeile ‹ / ›: bewegen `anchor` um den vollen sichtbaren Bereich (7 Tage bei Week-Ansicht, N Tage sonst)
- "Heute"-Button: eigenes Custom-SVG (Kalender + Punkt + Aufwärtspfeil von unten)
- Sticky Spalten-Header

**Event-Karte:**
- Position und Höhe aus ISO-Timestamps (64px/h, DAY_START=0, DAY_END=24)
- Spalten-Zuweisung bei überlappenden Events: Cluster-Algorithmus mit gierigem Row-Assignment
- Initialer Scroll: 30 Minuten vor dem frühesten Event in der Ansicht (Fallback: 08:00 Uhr)

### View 2 – Sidebar (Links-Panel)

- Topics: Dateien mit `#topic`-Tag (als Inline-Tag oder `topic` im Frontmatter-Tags-Array)
- Todos: Gruppiert nach Heute / Diese Woche / Später / Ohne Datum / Früher
- Details siehe eigene Spezifikation: `specs/sidebar-view.md`

### View 3 – Suche (Modal)

- Öffnet als Modal (Ribbon-Icon, Command oder `Cmd+F`)
- Default: 6 zuletzt bearbeitete Dateien aus `notesFolder` ("Zuletzt bearbeitet")
- Volltextsuche ab 2 Zeichen: Dateiname + Inhalt, bis zu 20 Treffer mit ±40-Zeichen-Snippet

---

## Notiz-System

### Verknüpfung Event → Notiz

Beim Klick auf ein Event:
1. Plugin prüft ob Notiz existiert: Scan aller Markdown-Dateien nach `frontmatter["event-id"]`
2. Fallback für ältere Notizen: Suche nach `title` + `date` im Frontmatter
3. Falls nein: neue Notiz aus Template erstellen
4. Notiz öffnen; bei neuer Notiz: Frontmatter-Properties einfalten

### Datei-Pfad-Auflösung

- Bevorzugt: `<notesFolder>/<sanitizedTitle>.md`
- Fallback bei Kollision: `<notesFolder>/<sanitizedTitle> <YYYY-MM-DD>.md`

### Frontmatter (jede Event-Notiz)

```yaml
---
event-id: "string"           # rohes ID oder "baseId|YYYY-MM-DD" für Recurring
title: "string"
date: "YYYY-MM-DD"
start: "HH:MM"
end: "HH:MM"
location: "string"
attendees: ["[[First Last]]", ...]   # "Last, First" → "First Last" normalisiert
type: meeting | interview | recurring | task
toBeRemoved: false
removalDate: null
topics: []                   # Liste von Topic-Titeln
---
```

`event-id` kann im Frontmatter auch als YAML-Array für Notizen mit mehreren Events angegeben werden.

### Type-Erkennung (automatisch)

| Type | Bedingung |
|---|---|
| `interview` | Titel enthält "interview" oder "bewerbung" (case-insensitiv) |
| `recurring` | `event.isRecurring === true` |
| `meeting` | Fallback |

`task` wird nur durch manuelles Setzen im Frontmatter genutzt.

### toBeRemoved (Datenschutz)

- `markForRemoval(file, true)`: setzt `toBeRemoved: true`, `removalDate: heute + 180 Tage`
- `markForRemoval(file, false)`: setzt beide Felder zurück
- Beim Plugin-Start: `runRemovalCleanup()` schiebt Notizen mit überschrittenem `removalDate` in den Systempapiereimer

---

## Templates

Template-Dateien werden aus `<templateFolder>/<type>.md` geladen.
Wenn nicht vorhanden, wird ein eingebautes Default verwendet.

### Substitutions-Token

| Token | Inhalt |
|---|---|
| `{{title}}` | Event-Titel |
| `{{date}}` | Datum (`YYYY-MM-DD`) |
| `{{attendees}}` | Teilnehmer als `- [[Name]]`-Liste |
| `{{location}}` | Ort |
| `{{body}}` | `## Beschreibung\n<bereinigter Body>\n\n` (leer wenn kein Body) |
| `{{carried_todos}}` | DataviewJS-Live-Query-Block für offene Todos aus älteren Instanzen |

### Default-Templates

**meeting.md**
```markdown
{{body}}
## Agenda
-

## Notizen

## Todos
- [ ]

## Entscheidungen
```

**interview.md**
```markdown
## Kandidat
Name: {{title}}
Position:
Quelle:

## Lebenslauf-Highlights

## Fragen

## Eindrücke

## Todos
- [ ]

## Bewertung
[ ] Weiterführen  [ ] Absage
```

**recurring.md**
```markdown
## Offene Todos (aus letzter Instanz)
{{carried_todos}}

## Status letztes Mal

## Heute

## Todos
- [ ]
```

**task.md**
```markdown
## Kontext

## Notizen

## Todos
- [ ]
```

---

## Drag-Interaktionen (Desktop, nicht-mobile)

### Drag-to-Create
- Mousedown auf leere Fläche im Tages-Body → Ghost-Element mit Zeitbereich-Anzeige
- Beim Loslassen: Popover mit Titel-Input, Erstellen/Abbrechen-Buttons
- Bei Bestätigung: ruft `focal-cal create` auf

### Drag-to-Move (nur für Organizer-Events)
- Mousedown auf Event-Karte → nach 5px Threshold: Ghost-Element + Landing-Indikator
- Beim Loslassen auf Ziel-Tag: ruft `focal-cal move` auf

### Drag-to-Resize (nur für Organizer-Events)
- Resize-Handle an der Unterkante der Event-Karte
- Beim Loslassen: ruft `focal-cal move` mit neuer End-Zeit auf

---

## Design & Ästhetik

### E-Paper-Prinzipien
- Palette von Obsidians Theme-Akzentfarben abgeleitet (CSS Custom Properties)
- Keine schweren Schatten, keine Verläufe
- Typografie: Monospace für Zeiten, Serifenlos für Titel
- Minimale Animationen

### CSS Custom Properties
Definiert auf `:root`, überschrieben pro `.theme-light` / `.theme-dark`.

Schlüssel-Variablen: `--f-bg`, `--f-fg`, `--f-muted`, `--f-border`, `--f-today-bg`,
`--f-now-color`, `--f-event-bg`, `--f-event-sel-bg`, u.a.

---

## Dateistruktur im Vault

```
[Vault]/
├── notes/                         ← Event-Notizen
│   └── [Titel].md                 (oder [Titel] YYYY-MM-DD.md bei Kollision)
├── topics/                        ← Neue Topics werden hier erstellt
│   └── [topic-titel].md
├── templates/                     ← Plugin-Templates (optional, sonst Defaults)
│   ├── meeting.md
│   ├── interview.md
│   ├── recurring.md
│   └── task.md
└── .obsidian/plugins/[plugin-name]/
    ├── focal-cal                   ← Swift-Binary (mit swift/build.sh bauen)
    └── data.json                   ← Plugin-Settings + Calendar-Cache
```

---

## Nicht implementiert (Out of Scope)

- Obsidian-zu-Kalender Sync (Termine aus Obsidian in macOS Kalender schreiben) — Ausnahme: Drag-to-Create und Drag-to-Move nutzen das Binary
- Mobiles Gerät: Binary nicht verfügbar; Plugin lädt automatisch aus dem gespeicherten Cache (`data.json`)
- Multi-Vault
- Cloud-Sync (Obsidian Sync reicht für Mobile)
- Split-View-Layout mit fixer Golden-Ratio-Aufteilung — das Plugin nutzt stattdessen Obsidians natives Tab/Leaf-System
