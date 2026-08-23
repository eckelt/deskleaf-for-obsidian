# Data Model

## CalendarEvent (internal)

The normalised shape used everywhere in the plugin. Produced by both `CalendarReader`
(via the Swift binary) and `CalDAVReader` (via `ical-parser.ts`).

```ts
interface CalendarEvent {
  id: string;               // primary key — see Event ID schema below
  title: string;
  start: string;            // ISO 8601 datetime (timed) or YYYY-MM-DD (all-day)
  end: string;              // ISO 8601 datetime (timed) or YYYY-MM-DD (all-day)
  location?: string | null;
  attendees?: string[];
  body?: string | null;     // calendar event notes/description
  calendar?: string;        // source calendar name
  isRecurring?: boolean;
  isCancelled?: boolean;
  isAllDay?: boolean;
  isOrganizer?: boolean;    // true if organizer is nil OR isCurrentUser (binary); always false (CalDAV)
  meetingPlatform?: string; // "zoom" | "teams" | "meet" | "webex" | undefined
  numAttendees?: number;
  organizer?: string | null;
}
```

### Event ID schema

| Backend | Event type | ID format | Example |
|---|---|---|---|
| Binary | Non-recurring | Raw `eventIdentifier` | `"ABC123"` |
| Binary | Recurring | `eventIdentifier\|YYYY-MM-DD` | `"ABC123\|2026-04-22"` |
| CalDAV | Non-recurring | `UID` | `"abc-uuid"` |
| CalDAV | Recurring instance | `UID_RECURRENCE-ID.value` | `"abc-uuid_20260422T100000Z"` |

`id` is the stable link between the calendar and the note. Stored in note frontmatter as `event-id`.

Multi-day events from `getEventsForDate` carry two extra runtime flags (added as `any` casts,
not part of the interface):

```ts
_continuesBefore: boolean  // event started on an earlier day
_continuesAfter:  boolean  // event ends on a later day
```

---

## JSON input format (binary backend)

A JSON array is emitted on stdout by `deskleaf-calendar-sync export` and once per
`EKEventStoreChanged` notification by `deskleaf-calendar-sync watch`.

All-day events use `YYYY-MM-DD` for `start`/`end`. Timed events use full ISO 8601 with
timezone offset.

---

## Meeting note frontmatter (`type: termin`)

Written by `NoteManager` when creating a new note for a calendar event. The shape
is the Brain vault's `type: termin`, shared with the Deskleaf MCP
(`eckelt/deskleaf-for-ai` → `eckelt/brain`), so a note created here and one
created by `create_meeting_note` are indistinguishable.

```yaml
---
type: termin
title: "Tchibo – Kick-off"
date: 2026-08-21
calendar_event_id: "https://caldav.fastmail.com/dav/calendars/user/…/46AAFAE9.ics"
calendar_uid: "46AAFAE9-B10C-4BB9-81EC-54F25B320565"
calendar_recurrence_id: "20260821T090000Z"   # only for one instance of a series
kunde: "[[Tchibo]]"                          # only when a customer matched
teilnehmer: ["[[Waldemar Spät]]", "[[Kamil Kubica]]"]
tags: [kunde/tchibo]                         # only when a customer matched
---
```

`calendar_event_id` is the absolute CalDAV URL and is written only when the active
backend knows one — the EventKit binary does not, so those notes resolve by
`calendar_uid` + `date` alone.

`kunde` and `tags` are both load-bearing and neither is redundant: the customer
note's **Termin-Historie** filters on `kunde`, its **Offene Todos** roll-up on
`#kunde/<slug>`.

### Resolving a note from an event

In order, matching `findMeetingNoteForEvent` in the MCP:

1. `calendar_event_id` equals the event's CalDAV URL
2. `calendar_uid` equals the event's UID **and** `date` equals its date
3. `event-id` contains the event id — pre-Brain notes
4. `title` + `date` — last-resort fallback for notes with neither identity

`date` is read tolerantly: an unquoted YAML date may come back from Obsidian as a
`Date` rather than a string, and both compare equal to `YYYY-MM-DD`.

### Non-meeting notes

`focus`, `interview`, `recurring` and `task` notes are not calendar-anchored
entities in the vault; they keep the legacy `event-id` frontmatter and land in
`notesFolder`.

### Attendee resolution

An attendee is resolved to a `people/` note by mail address (`email:` or the
`emails:` list) first, then by display name. Unresolved attendees still become a
wiki-link, so the note is ready the moment the person note is created. Names in
the format `"Last, First"` are normalised to `"First Last"`
(`note-utils.normalizeAttendee`).

---

## Customer note (`type: kunde`)

Lives in `customersFolder`. Created by the sidebar's Kunden section with the six
standard sections and their Dataview blocks — byte-compatible with
`renderCustomerNote` in the MCP.

```yaml
---
type: kunde
tags: [kunde/tchibo]
status: aktiv          # aktiv | pausiert | beendet
partner: "[[Hacker & Wizards]]"
ort: Hamburg
domains: [tchibo.de]   # hand-maintained; drives event → customer matching
---
```

The billing rate deliberately does **not** live here — `billing/rates.md` is the
single source.

### Event → customer matching

1. **Attendee domain** against `domains:` — hard evidence, checked first.
2. **Title prefix** — `"Tchibo – Workshop"` matches, `"Rethinking Tchibo"` does
   not. Longest customer name wins when two share a prefix.

No match leaves `kunde` and `tags` off the meeting note entirely.

---

## Person note (`type: person`)

Lives in `peopleFolder`.

```yaml
---
type: person
kunde: "[[Tchibo]]"
rolle: Engineering
email: waldemar.spaet@tchibo.de
telefon:
tags: [kunde/tchibo]
---
```

## Project note (`type: project`)

Lives in `projectsFolder`, with `## Initial context` / `## Sources` /
`## Related notes` — the MCP's entity shape.

---

## Todos

Todos live where they are written (a meeting note, a project note) and are seen
centrally — in the sidebar, and via Dataview on the customer note.

```markdown
- [ ] Konsolidierte Mail an Waldemar due:: 2026-08-21
- [x] Sandbox einbauen ✅ 2026-08-19
```

| Aspect | Rule |
|---|---|
| Due date | `due:: yyyy-mm-dd` (canonical), `📅 yyyy-mm-dd`, or `[[yyyy-mm-dd]]` |
| Fallback | The note's `date`/`datum` when the line carries none |
| Completion | `- [x] … ✅ yyyy-mm-dd`, never a second date |
| Reopening | Drops the `✅` date, keeps the `due::` |
| Sources | `vault.todoFolders` plus notes at the vault root; Kanban boards excluded |

Identical to `list_open_todos` / `complete_todo` in the MCP, so both tools can
tick the same box.

---

## DeskleafSettings

```ts
interface DeskleafSettings {
  binaryPath: string;         // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";     // fixed, not user-configurable
  templateFolder: string;     // default: "_templates"
  notesFolder: string;        // default: "notes" — legacy, read-only
  vault: VaultSettings;
  customersOrder: string[];   // ordered file paths for the sidebar's Kunden section
  projectsOrder: string[];    // same for Projekte
  businessHours: BusinessHoursSettings;
  caldav: CalDAVSettings;
  icalSubscriptions: ICalFeedSubscription[];
}

interface VaultSettings {
  meetingsFolder: string;     // default: "meetings"
  customersFolder: string;    // default: "customers"
  peopleFolder: string;       // default: "people"
  projectsFolder: string;     // default: "projects"
  todoFolders: string[];      // default: ["meetings", "projects", "customers"]
}
```

## CalDAVSettings

```ts
interface CalDAVSettings {
  url: string;                // CalDAV server URL
  username: string;
  password: string;
  selectedCalendars: string[]; // hrefs; empty = all
  discoveredCalendars: Array<{ href: string; displayName: string }>;
  calendarColors: Record<string, number>; // displayName → hue from CAL_COLOR_PALETTE
}
```

## CAL_COLOR_PALETTE

Six Monokai Pro hues used for per-calendar colour assignment:

```ts
const CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252] as const;
// pink · orange · yellow · green · cyan · purple
```

Assigned to calendars via colour swatches in the settings UI. Persisted in
`<manifest.dir>/calendar-colors.json` separately from `data.json`.

---

## data.json persistence

Stores `DeskleafSettings` plus:

```ts
calendarCache:     CalendarEvent[]  // last successful load
calendarCacheDate: string | null    // ISO timestamp of that load
```

Calendar colours are stored separately in `calendar-colors.json` (not in `data.json`).
