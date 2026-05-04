# Note Manager

Handles all note lifecycle operations: lookup, creation, templating, and removal.

---

## Note lookup

`noteExists(event): TFile | null`

Scans all markdown files in the vault. For each file:

1. **Primary lookup**: reads `frontmatter["event-id"]`. Supports both a single string and
   a YAML array. If the event's `id` is in that list, returns the file.
2. **Fallback** (legacy notes with older ID formats): if no primary match is found, returns
   the first file where `frontmatter.title === event.title` and
   `frontmatter.date === event.start.slice(0, 10)`.

The filename is not load-bearing — only frontmatter fields are used.

---

## Open or create

`openOrCreate(event): Promise<{ file: TFile; isNew: boolean }>`

1. If a note exists: optionally patch in a `## Beschreibung` section from `event.body`
   (skipped if the section already exists or `body` is empty). Return `{ file, isNew: false }`.
2. If no note exists: call `createNote(event)`. Return `{ file, isNew: true }`.

The caller (calendar view) folds the frontmatter properties block when `isNew` is true,
via `editor.fold({ line: 0, ch: 0 })` with a 100ms timeout.

### File path resolution

Preferred path: `<notesFolder>/<sanitizedTitle>.md`

If that path is already taken by a **different** event (different `event-id`), fall back
to: `<notesFolder>/<sanitizedTitle> <YYYY-MM-DD>.md`

Filename sanitisation removes `\ / : * ? " < > | # ^ [ ]`, collapses whitespace, and
truncates to 100 characters.

---

## Type inference

| Type | Condition |
|---|---|
| `interview` | title contains "interview" or "bewerbung" (case-insensitive) |
| `recurring` | `event.isRecurring === true` |
| `meeting` | fallback |

`task` is not inferred automatically — it must be set manually in the frontmatter.

---

## Templates

Template files are loaded from `<templateFolder>/<type>.md`. If the file doesn't exist,
a built-in default is used.

### Substitution tokens

| Token | Value |
|---|---|
| `{{title}}` | `event.title` |
| `{{date}}` | `event.start.slice(0, 10)` |
| `{{attendees}}` | `- [[First Last]]` list (names normalised from "Last, First" format) |
| `{{location}}` | `event.location ?? ""` |
| `{{body}}` | `## Beschreibung\n<cleaned body>\n\n` (empty string if no body) |
| `{{carried_todos}}` | DataviewJS live query block (see below) |

### Default templates

**meeting**
```
{{body}}## Agenda
-

## Notizen

## Todos
- [ ]

## Entscheidungen
```

**interview**
```
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

**recurring**
```
## Offene Todos (aus letzter Instanz)
{{carried_todos}}

## Status letztes Mal

## Heute

## Todos
- [ ]
```

**task**
```
## Kontext

## Notizen

## Todos
- [ ]
```

### `{{carried_todos}}` — DataviewJS live query

Expands to a DataviewJS code block that queries open tasks from older notes with the same
title. No physical copy — always live at read time.

```js
const title = dv.current().title;
const date  = dv.current().date;
const tasks = dv.pages('"<notesFolder>"')
  .where(p => p.title === title && p.date < date)
  .file.tasks.where(t => !t.completed);
if (tasks.length > 0) dv.taskList(tasks, false);
else dv.paragraph("_Keine offenen Todos aus vorherigen Instanzen._");
```

---

## Frontmatter written on creation

```yaml
event-id: "<id>"
title: "<title>"
date: "<YYYY-MM-DD>"
start: "<HH:MM>"
end: "<HH:MM>"
location: "<location>"
attendees: ["[[First Last]]", …]
type: <meeting|interview|recurring|task>
toBeRemoved: false
removalDate: null
topics: []
```

---

## Removal workflow

`markForRemoval(file, true)`: sets `toBeRemoved: true`, `removalDate: <today + 180 days>`.
Uses `app.fileManager.processFrontMatter` for safe frontmatter editing.

`markForRemoval(file, false)`: sets `toBeRemoved: false`, `removalDate: null`.

`runRemovalCleanup()`: called on every plugin load. Moves to system trash (via
`vault.trash(file, true)`) any note where `toBeRemoved: true` and `removalDate <= today`.

---

## Body cleaning

`event.body` (the calendar event's description/notes field) is cleaned before insertion:

- Normalises line endings to `\n` (handles `\r\n` and `\r`).
- Truncates at the first line matching `___` or more underscores (common calendar separator).
- Trims surrounding whitespace.
