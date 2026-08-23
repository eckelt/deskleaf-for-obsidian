# Note Manager

Handles all note lifecycle operations: lookup, creation, templating, and removal.

---

## Note lookup

`noteExists(event): TFile | null`

Scans all markdown files in the vault, in this order — the same resolution the
Deskleaf MCP's `findMeetingNoteForEvent` uses, so both tools land on one note:

1. `calendar_event_id` equals the event's absolute CalDAV URL. Exact identity;
   returns immediately.
2. `calendar_uid` equals the event's UID **and** `date` equals its date. The path
   for the EventKit backend, which has no URL.
3. `frontmatter["event-id"]` contains the event id — pre-Brain notes. Supports
   both a single string and a YAML array.
4. `title` + `date` — last resort for notes carrying neither identity.

`date` is compared tolerantly: an unquoted YAML date may reach the plugin as a
`Date` rather than a string, and both must equal `YYYY-MM-DD`. The older `datum`
key is accepted alongside `date`.

The filename is not load-bearing — only frontmatter fields are used.

`buildNoteCache()` builds the same index once for a render cycle (keyed by URL,
`uid@date` and event id); `lookupInCache(cache, event)` queries it in the same
order. Callers iterating many events use the pair to avoid O(n²) vault scans.

---

## Open or create

`openOrCreate(event): Promise<{ file: TFile; isNew: boolean }>`

1. If a note exists: optionally patch in a `## Beschreibung` section from `event.body`
   (skipped if the section already exists or `body` is empty). Return `{ file, isNew: false }`.
2. If no note exists: call `createNote(event)`. Return `{ file, isNew: true }`.

The caller (calendar view) folds the frontmatter properties block when `isNew` is true,
via `editor.fold({ line: 0, ch: 0 })` with a 100ms timeout.

### File path resolution

For a `termin` note: `<vault.meetingsFolder>/<YYYY-MM-DD> <sanitizedTitle>.md` —
the vault's own convention, so meeting notes sort chronologically in the file
explorer. Every other type keeps `<notesFolder>/<sanitizedTitle>.md`.

If that path is already taken, a numeric suffix is appended (`… 2.md`, `… 3.md`).
An existing note is **never** overwritten.

Filename sanitisation removes `\ / : * ? " < > | # ^ [ ]`, collapses whitespace, and
truncates to 100 characters.

---

## Type inference

| Type | Condition |
|---|---|
| `focus` | title matches "fokus", "focus", "deep work", or "deepwork" (case-insensitive) |
| `interview` | title contains "interview" or "bewerbung" (case-insensitive) |
| `termin` | fallback — the Brain vault's meeting type |

`recurring` is no longer inferred: a recurring event is a `termin` like any other,
distinguished by `calendar_recurrence_id` rather than by a separate note type.
`task` and `recurring` remain valid types but must be set manually.

---

## Vault index

`NoteManager` also indexes the Brain entity folders, which is what lets the
calendar and the sidebar speak in customers and people rather than file paths:

| Method | Source | Returns |
|---|---|---|
| `getCustomers()` | `vault.customersFolder`, `type: kunde` | name, slug, path, `domains`, `status` |
| `getPeople()` | `vault.peopleFolder`, `type: person` | name, path, `email` + `emails` merged |
| `getProjects()` | `vault.projectsFolder`, `type: project` | name, path |
| `customerFor(event)` | the above | the matched customer, or `null` |

`createCustomerNote` / `createProjectNote` / `createPersonNote` write those notes
in the MCP's shape and return an existing note untouched.

---

## Templates

Template files are loaded from `<templateFolder>/<type>.md` (`termin.md` for
meetings). If the file doesn't exist, a built-in default is used. A template's
own frontmatter and H1 are stripped — the note's own are authoritative.

Whatever a custom template omits of `## Initial context`, `## Sources` and
`## Related notes` is appended: `prepare_meeting` in the MCP reads the wiki-links
under Related notes, and `append_meeting_note` appends after them.

### Substitution tokens

| Token | Value |
|---|---|
| `{{title}}` / `{{titel}}` | `event.title` |
| `{{date}}` / `{{datum}}` | `event.start.slice(0, 10)` |
| `{{context}}` | Time, location and the cleaned calendar description |
| `{{kunde}}` / `{{kunde_link}}` / `{{kunde_slug}}` | The matched customer, or empty |
| `{{teilnehmer}}` | Comma-separated attendee wiki-links |
| `{{related}}` | `- [[…]]` list: customer, attendees, related notes |
| `{{sources}}` | `_No sources linked yet._` |
| `{{attendees}}` | `- [[First Last]]` list (legacy types) |
| `{{location}}` | `event.location ?? ""` (legacy types) |
| `{{body}}` | `## Beschreibung\n<cleaned body>\n\n` (legacy types) |
| `{{carried_todos}}` | DataviewJS live query block (see below) |
| `{{focus_todos}}` | DataviewJS live task query for Focus Block notes (see below) |

An unknown `{{token}}` is left in place rather than blanked, so a typo is visible
instead of silently eating content.

### Default templates

**termin**
```
## Initial context
{{context}}

## Mitgebracht
-

## Notizen
-

## Todos bis nächstes Mal
- [ ]

## Fürs nächste Treffen
-

## Sources
{{sources}}

## Related notes
{{related}}
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

**focus**
```
{{body}}## Fokus-Todos
{{focus_todos}}

## Fokus

## Notizen
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

### `{{focus_todos}}` — DataviewJS live query

Expands to a DataviewJS block that mirrors the Sidebar Todos source set: files in
`notesFolder/` plus files tagged `#topic`, excluding Kanban boards. It shows exactly
three open tasks. The selection is semistable: tasks are deterministically shuffled by
the current Focus Block note path, so the list stays stable within one note while different
Focus Blocks can surface different tasks. Dataview is required for live rendering and
source-task toggling.

```js
const folder = "<notesFolder>";
const pages = dv.pages()
  .where(p => !p["kanban-plugin"])
  .where(p => p.file.path.startsWith(folder + "/") || (p.file.tags ?? []).includes("#topic"));
const seed = dv.current().file.path;
const hash = (value) => [...value].reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0);
const tasks = pages.file.tasks
  .where(t => !t.completed)
  .array()
  .sort((a, b) => hash(seed + a.path + a.line + a.text) - hash(seed + b.path + b.line + b.text))
  .slice(0, 3);
if (tasks.length > 0) dv.taskList(tasks, false);
else dv.paragraph("_Keine offenen Todos._");
```

---

## Frontmatter written on creation

For a `termin` note — the Brain shape shared with the Deskleaf MCP:

```yaml
type: termin
title: "<title>"
date: <YYYY-MM-DD>
calendar_event_id: "<absolute CalDAV URL>"   # only when the backend knows one
calendar_uid: "<UID>"
calendar_recurrence_id: "<RECURRENCE-ID>"    # only for one instance of a series
kunde: "[[<Customer>]]"                      # only when a customer matched
teilnehmer: ["[[First Last]]", …]
tags: [kunde/<slug>]                         # only when a customer matched
```

For the legacy types (`focus`, `interview`, `recurring`, `task`):

```yaml
event-id: "<id>"
title: "<title>"
date: "<YYYY-MM-DD>"
start: "<HH:MM>"
end: "<HH:MM>"
location: "<location>"
attendees: ["[[First Last]]", …]
type: <interview|recurring|task|focus>
toBeRemoved: false
removalDate: null
```

See `specs/data-model.md` for how a note is resolved back from an event.

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
