# Calendar Sources

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Normalizes calendar data from whichever backend is active — CalDAV, the bundled macOS
`deskleaf-calendar-sync` binary, or both together — into one `CalendarEvent[]` shape and one
reader interface that the calendar view, sidebar, and note manager consume without knowing which
backend is behind it.

## Requirements

### Requirement: Backend selection at startup
The plugin SHALL select `CalDAVReader` when both `caldav.username` and `caldav.password` are set
in settings, and SHALL fall back to the binary-backed `CalendarReader` otherwise; on desktop with a
configured CalDAV backend, it SHALL additionally layer a reminders-only EventKit process on top via
`CompositeCalendarReader`.
_Source: src/main.ts (makeReader), docs/adr/0003-reminders-coexist-with-caldav.md_

#### Scenario: CalDAV credentials configured
- **WHEN** `caldav.username` and `caldav.password` are both non-empty
- **THEN** the plugin uses `CalDAVReader` (wrapped in `CompositeCalendarReader` on desktop) as its
  calendar source

#### Scenario: No CalDAV credentials
- **WHEN** either `caldav.username` or `caldav.password` is empty
- **THEN** the plugin uses the binary-backed `CalendarReader` pointed at the configured or
  auto-detected `deskleaf-calendar-sync` path

### Requirement: Reminders coexist read-only alongside CalDAV
When both CalDAV and the reminders-only process are active, the plugin SHALL merge in only
`isReminder` events from the reminders process (primary CalDAV events always win on id collision),
SHALL never let a failure of the reminders process surface as a calendar-load error, and SHALL
route every write operation (create, move, update, cancel, RSVP) exclusively to the primary CalDAV
reader.
_Source: src/composite-calendar-reader.ts, src/event-filter.ts (mergeReminderEvents)_

#### Scenario: Reminders process failure is silent to the user
- **WHEN** the reminders-only binary process fails to load
- **THEN** the composite reader logs a warning but the calendar's error/status bar is driven only
  by the primary CalDAV reader's state

#### Scenario: Writes never touch the reminders process
- **WHEN** a user creates, moves, edits, cancels, or RSVPs to an event
- **THEN** the composite reader delegates the write exclusively to the primary CalDAV reader

### Requirement: Load failure falls back to the persisted cache
Each reader SHALL persist its last successful `CalendarEvent[]` and load timestamp via the cache
callbacks wired in `main.ts` (`data.json`: `calendarCache`, `calendarCacheDate`), and SHALL load
that cache and append a "cache from <date>" note to the error message whenever a live load fails
or (for the binary backend) returns zero events.
_Source: src/calendar-reader.ts (tryLoadCache), src/caldav-reader.ts (tryLoadCache), src/main.ts_

#### Scenario: Binary missing falls back to cache
- **WHEN** the configured `deskleaf-calendar-sync` binary path does not exist
- **THEN** the reader reports a load error and, if a cache exists, shows the cached events with a
  cache-date note appended

### Requirement: A successful reload fully replaces prior event data
On every successful load or watch push, each reader SHALL replace its entire in-memory event list
with the backend's current result rather than merging or patching individual fields, so a stale
local cache or a previously shown value for an event's time, title, or other backend-owned field
can never persist once a fresh remote read succeeds.
_Source: src/calendar-reader.ts (handleLine: `this.events = events`), src/caldav-reader.ts
(fetchAll: `this.events = allEvents`)_

#### Scenario: A remote change corrects a stale cached time
- **WHEN** the persisted cache shows an event from 10:00–10:30 and the backend now reports
  10:00–11:00 for the same event
- **THEN** the next successful reload replaces the event list wholesale and the calendar shows
  10:00–11:00

### Requirement: Write operations delegate to the active backend's native commands
Creating, moving, resizing, editing, cancelling, and (CalDAV only) RSVP-updating an event SHALL be
implemented per backend: the binary reader shells out to `deskleaf-calendar-sync create|move|update|cancel`
via `execFile`/`spawn`, and the CalDAV reader performs the equivalent CalDAV `PUT`/`MOVE`/`DELETE`
requests by rewriting the fetched iCalendar text.
_Source: src/calendar-reader.ts, src/caldav-reader.ts, src/caldav-client.ts, src/ical-parser.ts_

#### Scenario: Editing a CalDAV event moving calendars
- **WHEN** `updateEvent` is called with a `calendar` different from the event's current calendar
- **THEN** the CalDAV reader `PUT`s the updated iCal to the original href and then issues a CalDAV
  `MOVE` to the target calendar's href

#### Scenario: RSVP is CalDAV-only
- **WHEN** the active reader is the binary-backed `CalendarReader` (no CalDAV)
- **THEN** no `updateRsvp` method is available and the calendar view does not offer RSVP buttons
