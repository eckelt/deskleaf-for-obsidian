# Calendar Sync Daemon

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
A macOS Swift command-line binary (`deskleaf-calendar-sync`) that bridges the plugin to
EventKit — the only way the plugin reads or writes native macOS Calendar events and reminders —
spawned as a child process and never used directly by the user.

## Requirements

### Requirement: Five commands cover the whole read/write surface
The binary SHALL implement `export` (fetch once, print JSON, exit), `watch` (fetch, print, then
re-print on every `EKEventStoreChanged` notification, never exiting on its own), `create`, `move`,
`update`, and `cancel`, each requiring its own set of `--flag value` arguments and exiting non-zero
with a message on `stderr` for missing arguments or an EventKit save/remove failure.
_Source: swift/Sources/DeskleafCalendarSync/main.swift, specs/internals.md_

#### Scenario: watch keeps running after the first print
- **WHEN** `deskleaf-calendar-sync watch` is invoked
- **THEN** it prints the current event set once immediately, registers for
  `EKEventStoreChanged`, and keeps the process alive via `RunLoop.main.run()`

#### Scenario: create requires title, start, and end
- **WHEN** `create` is invoked without `--title`, `--start`, or `--end`
- **THEN** the process prints a usage error to `stderr` and exits with a non-zero status

### Requirement: A composite id encodes recurring occurrences
An event's `id` SHALL be its raw `eventIdentifier` for a non-recurring event, or
`<eventIdentifier>|<YYYY-MM-DD>` for one occurrence of a recurring series (since EventKit shares
one `eventIdentifier` across all occurrences); `move`/`update`/`cancel` SHALL parse this composite
form back into a base id plus a day-window search when locating the target event.
_Source: swift/Sources/DeskleafCalendarSync/main.swift (DeskleafEvent.init, findEvent)_

#### Scenario: Moving one occurrence of a recurring event
- **WHEN** `move --id "ABC123|2026-04-22" --start … --end …` is invoked
- **THEN** the binary searches events on 2026-04-22 for `eventIdentifier == "ABC123"` and updates
  that instance's `EKEvent` with the given span

### Requirement: Reminders are read-only, sourced from a single fixed list
The binary SHALL surface only reminders from the EventKit list titled exactly "Erinnerungen",
excluding completed or list-mismatched reminders entirely, mapping a due date without a time to an
all-day tile and a due date with a time to a 30-minute timed tile; reminders carry `isReminder:
true` and have no corresponding write command.
_Source: swift/Sources/DeskleafCore/ReminderMapping.swift, swift/Sources/DeskleafCalendarSync/main.swift_

#### Scenario: Reminder in another list is excluded
- **WHEN** an `EKReminder`'s calendar (list) title is not "Erinnerungen"
- **THEN** `mapReminderDueDate` returns `.excluded` and no tile is emitted for it

#### Scenario: Completed reminder is excluded
- **WHEN** a reminder's `isCompleted` is `true`
- **THEN** it is excluded regardless of its due date or list

### Requirement: A `--reminders-only` mode never requests full Calendar access
Passing `--reminders-only` SHALL make the binary request only reminder access (never
`requestAccess()` for the `.event` scope) and support only `export`/`watch`, emitting exclusively
reminder-derived events — this is what lets a CalDAV user run a second, parallel process for
reminders without ever being prompted for full Calendar permission.
_Source: swift/Sources/DeskleafCalendarSync/main.swift (fetchAndPrintReminders, remindersOnly
branch), docs/adr/0003-reminders-coexist-with-caldav.md_

#### Scenario: Reminders-only mode skips event permission
- **WHEN** the binary is invoked with `--reminders-only export`
- **THEN** only `requestReminderAccess()` is called; `requestAccess()` for events is never invoked

### Requirement: Meeting platform is detected from notes, URL, and location text
`detectMeetingPlatform` SHALL scan the lowercased concatenation of an event's notes, URL, and
location for `zoom.us` → `zoom`, `teams.microsoft.com`/`teams.live.com` → `teams`,
`meet.google.com` → `meet`, or `webex.com` → `webex`, returning no platform when none match.
_Source: swift/Sources/DeskleafCore/MeetingPlatform.swift_

#### Scenario: Zoom link in notes is detected
- **WHEN** an event's notes field contains a `https://zoom.us/j/...` URL
- **THEN** the emitted event's `meetingPlatform` is `"zoom"`

### Requirement: isOrganizer treats ownerless events as organizer-owned
`isOrganizer` SHALL be `true` when the EventKit event has no organizer at all, or when the
organizer `isCurrentUser`; this is what allows drag-to-move/resize on personal or local-calendar
entries that carry no organizer field.
_Source: swift/Sources/DeskleafCalendarSync/main.swift (DeskleafEvent.init: isOrganizer)_

#### Scenario: Local calendar entry with no organizer is draggable
- **WHEN** an `EKEvent.organizer` is `nil`
- **THEN** `isOrganizer` is emitted as `true`

_Open question: the daemon's Swift source tree (`swift/Sources/DeskleafCalendarSync/` +
`swift/Sources/DeskleafCore/`) differs from the path documented in the old `spec-obsidian-plugin-v1.md`
and `specs/internals.md` (`swift/Sources/FocalCal/main.swift`); this baseline follows the code._
