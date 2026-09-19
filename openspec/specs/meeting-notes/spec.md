# Meeting Notes

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Resolves calendar events to vault notes and back, creates new notes from templates in the shared
"Brain" vault shape (the shape also written by the separate Deskleaf MCP), and retires notes a user
has marked for removal — so a calendar event and its note are always the same entity in both tools.

## Requirements

### Requirement: An event resolves to at most one note via a fixed identity order
`NoteManager.noteExists` SHALL look up a note for a given event by trying, in order:
`calendar_event_id` (exact CalDAV URL), `calendar_uid` + `date` (EventKit path), legacy
`event-id` frontmatter (string or array), and finally `title` + `date` — returning on the first
match, tolerating a YAML `date` value that Obsidian parses as a `Date` rather than a string.
_Source: src/note-manager.ts (noteExists, buildNoteCache, lookupInCache), specs/note-manager.md_

#### Scenario: CalDAV URL match wins outright
- **WHEN** a note's `calendar_event_id` equals the event's absolute CalDAV URL
- **THEN** that note is returned immediately without checking the other three identity paths

#### Scenario: Pre-Brain note still resolves
- **WHEN** no note carries `calendar_event_id` or `calendar_uid`, but a note has a legacy
  `event-id` frontmatter value matching the event's id
- **THEN** that note is returned

### Requirement: Opening a missing note creates it in the Brain shape from a template
`NoteManager.openOrCreate` SHALL create a new note when none is found, using
`<vault.meetingsFolder>/<YYYY-MM-DD> <sanitizedTitle>.md` for the inferred type `termin` (appending
a numeric suffix on a path collision, never overwriting an existing file), filling frontmatter with
`type`, `title`, `date`, calendar identity fields, matched customer (`kunde`, `tags`), and attendee
wiki-links, and templating the body from `<templateFolder>/termin.md` or a built-in default.
_Source: src/note-manager.ts (openOrCreate, createNote, resolveNotePath), specs/note-manager.md,
specs/data-model.md_

#### Scenario: New meeting note gets Brain frontmatter
- **WHEN** an event has no existing note and matches a customer by attendee domain or title prefix
- **THEN** the created note's frontmatter includes `type: termin`, `kunde: "[[<Customer>]]"`, and
  `tags: [kunde/<slug>]`

#### Scenario: Filename collision does not overwrite
- **WHEN** the resolved file path already exists as a different note
- **THEN** the new note is created at the same path with a numeric suffix (` 2.md`, ` 3.md`, …)
  instead of overwriting the existing file

### Requirement: Non-meeting note types are inferred from the title
Note type inference SHALL classify a new note as `focus` when the title matches "fokus"/"focus"/
"deep work"/"deepwork", as `interview` when it contains "interview" or "bewerbung"
(case-insensitive), and as `termin` otherwise; `task` and `recurring` remain valid types but are
only ever set manually, never inferred.
_Source: src/note-manager.ts (inferType), specs/note-manager.md_

#### Scenario: Focus block title is detected
- **WHEN** an event's title contains "Fokus"
- **THEN** the created note uses the `focus` template and legacy `event-id` frontmatter shape
  rather than the Brain `termin` shape

### Requirement: A note marked for removal is trashed automatically after its grace period
`markForRemoval(file, true)` SHALL set `toBeRemoved: true` and `removalDate` to today plus 180
days using `processFrontMatter`; on every plugin load, `runRemovalCleanup()` SHALL move to the
system trash every note whose `removalDate` has passed.
_Source: src/note-manager.ts (markForRemoval, runRemovalCleanup), specs/note-manager.md_

#### Scenario: Overdue removal note is trashed on startup
- **WHEN** a note has `toBeRemoved: true` and `removalDate` on or before today
- **THEN** the plugin's next `onLayoutReady` cleanup moves that file to the system trash via
  `vault.trash(file, true)`

### Requirement: Customer, person, and project notes are indexed and matched to events
`NoteManager` SHALL index `customersFolder` (`type: kunde`), `peopleFolder` (`type: person`), and
`projectsFolder` (`type: project`) notes, SHALL match an event to a customer first by attendee
email domain against the customer's `domains:` list and then by title-prefix (longest name wins),
and SHALL create missing customer/person/project notes in the MCP's shared shape without ever
overwriting an existing note of the same name.
_Source: src/note-manager.ts (getCustomers, getPeople, getProjects, customerFor,
createCustomerNote/createProjectNote/createPersonNote), src/brain-vault.ts, specs/data-model.md_

#### Scenario: Attendee domain match takes priority over title
- **WHEN** an attendee's email domain matches a customer's `domains:` entry and the event title
  also happens to prefix-match a different customer's name
- **THEN** the domain match wins
