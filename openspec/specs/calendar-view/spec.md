# Calendar View

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Renders the plugin's main time-grid calendar (view type `deskleaf-calendar`) so a user preparing
for a day or week can see events, navigate dates, create or reshape events by dragging, and jump
straight from an event or a day into its note.

## Requirements

### Requirement: Responsive day-column layout
The calendar view SHALL compute the number of visible day-slots continuously from the container
width (`visibleDays = clamp(floor((containerWidth - 44px) / 120px), 1, 6)`) via `ResizeObserver`,
and SHALL always render Saturday and Sunday merged into a single shared column regardless of the
computed width.
_Source: src/calendar-view.ts, specs/calendar-view.md_

#### Scenario: Narrow pane shows a single day
- **WHEN** the calendar leaf is narrower than ~284px
- **THEN** the view renders exactly one day-slot for the anchor date

#### Scenario: Wide pane shows a full week with merged weekend
- **WHEN** the calendar leaf is at least ~764px wide
- **THEN** the view renders Monday through Friday as five individual columns and Saturday+Sunday
  merged into one shared sixth column

### Requirement: Time grid with business-hours shading and now-line
The calendar view SHALL render a full 24-hour grid at a configurable pixel-per-hour scale, shade
the configured business-hours window as a background segment behind the grid, and draw a
continuously updated "now" line in today's column.
_Source: src/calendar-view.ts, src/business-hours.ts, specs/calendar-view.md_

#### Scenario: Business hours are highlighted
- **WHEN** business-hours shading is enabled in settings and the current day is one of the
  configured days
- **THEN** the configured start–end window is rendered as a subtle tinted segment behind the hour
  lines and event cards for that day

#### Scenario: Now-line tracks the clock
- **WHEN** today's column is visible
- **THEN** a line with a dot marks the current time and moves every 60 seconds

### Requirement: Event card layout and visual states
The calendar view SHALL position timed event cards absolutely from their ISO start/end timestamps
using a greedy cluster/column-assignment algorithm for overlapping events, and SHALL style cards
with modifiers reflecting selection, series membership, linked-note presence, recurrence,
cancellation, and multi-day continuation.
_Source: src/calendar-view.ts, src/event-layout.ts, specs/calendar-view.md_

#### Scenario: Overlapping events share width
- **WHEN** two events on the same day overlap in time
- **THEN** each is assigned its own sub-column so both remain fully visible side by side

#### Scenario: Event with a linked note is marked
- **WHEN** a note exists whose frontmatter identity matches the event
- **THEN** the event card is rendered with a left accent border (`--has-note`)

### Requirement: Drag-to-create, drag-to-move, and drag-to-resize
On desktop, the calendar view SHALL let the user draw a new event on empty grid space
(drag-to-create), and SHALL let the user drag or resize an existing event card to change its time
via the active calendar backend — but only when the event is organizer-owned; read-only events
(cancelled, iCal-feed, all-day, non-organizer, or reminder) SHALL NOT be draggable.
_Source: src/calendar-view.ts, src/event-edit.ts, specs/calendar-view.md_

#### Scenario: Creating an event by dragging
- **WHEN** a user mouses down on empty day-body space and drags before releasing
- **THEN** a popover appears with title/time/location fields, and confirming calls the active
  reader's `createEvent`

#### Scenario: Non-organizer event cannot be dragged
- **WHEN** the event's `isOrganizer` is `false`, or it is a reminder, all-day, cancelled, or from
  an iCal feed
- **THEN** drag-to-move and drag-to-resize are not offered for that card

### Requirement: Pinch-to-zoom vertical time density
The calendar view SHALL let the user change the grid's pixel-per-hour density with a two-finger
touch pinch (mobile) or a trackpad pinch gesture (desktop), clamped between showing the full
24-hour day and showing 4 hours, keeping the time under the gesture's focal point anchored on
screen.
_Source: src/calendar-view.ts, src/event-layout.ts_

#### Scenario: Pinching out zooms in
- **WHEN** the user pinches outward on the time grid
- **THEN** fewer hours become visible in the same viewport and the hour under the gesture stays in
  place

### Requirement: Note opening, daily-note navigation, and active-tab selection
Clicking an event card SHALL open (or create, via the note manager) its linked note; clicking a
day-column header SHALL open (or create) that date's daily note under `Journal/YYYY-MM-DD.md`;
and the calendar SHALL highlight the event card or day column corresponding to whichever file is
currently active in the workspace.
_Source: src/calendar-view.ts, specs/calendar-view.md_

#### Scenario: Opening a daily note from the header
- **WHEN** a user clicks a day-column header
- **THEN** `Journal/<date>.md` is opened, created first if it does not yet exist

#### Scenario: Active daily note highlights its column
- **WHEN** the active editor tab is the daily note for a visible date
- **THEN** that day's header and body receive the `--selected` styling

### Requirement: Event editing with RSVP and location deeplink
The calendar view SHALL open an inline edit form for a clicked event exposing title, time,
location, description, and calendar fields for organizer-owned events, SHALL offer Accept /
Tentative / Decline RSVP buttons when the event carries RSVP state and the active backend supports
`updateRsvp` (CalDAV only), and SHALL surface a one-click "open" button for a detected
location/conference URL.
_Source: src/calendar-view.ts, src/event-edit.ts, src/caldav-reader.ts_

#### Scenario: Invitee sees RSVP actions
- **WHEN** the active backend is CalDAV, the event has RSVP state, and the event is read-only for
  the current user (an invitee, not the organizer)
- **THEN** the edit form shows Accept/Tentative/Decline buttons above the rest of the form

#### Scenario: Conference link opens externally
- **WHEN** the event's location or RFC 7986 `CONFERENCE`/`URL` field resolves to a web address
- **THEN** an "open" button in the edit form opens that URL in the system browser
