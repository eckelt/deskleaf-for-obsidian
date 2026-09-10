# ADR 3: Reminders Coexist With CalDAV via a Parallel Reminders-Only Binary Process

Date: 2026-09-10

## Status
Accepted.

## Context

`main.ts:makeReader()` picks exactly one active calendar backend: `CalDAVReader` if
`caldav.username`+`caldav.password` are set, otherwise the binary-backed `CalendarReader`
(macOS EventKit). This exclusivity is intentional and documented in `CLAUDE.md` — the two
backends never run together for **events**.

The read-only Reminders overlay (issue #81, merged as #82/#83) sources `isReminder`
events exclusively from the binary/EventKit `CalendarReader`, spread through unchanged
from the Swift process's JSON output. Because reader selection is exclusive, any user who
configures CalDAV never instantiates the binary reader at all — the shipped Reminders
feature is a silent no-op for them. The issue author confirmed (2026-09-10) they run
CalDAV as their active backend and want Reminders anyway, explicitly authorizing an
architecture change if a workable solution exists, and accepting a permanent desktop-only
scope otherwise (EventKit reminders cannot be read on iOS/mobile — there is no local
process there regardless of backend).

## Decision

### Events stay exclusive; Reminders become independent of the active event backend

The one-active-reader rule for **events** is unchanged: CalDAV, once configured, remains
the sole source of calendar events. The plugin never merges EventKit-sourced events on
top of CalDAV events.

Reminders are decoupled from that choice. When CalDAV is the active event backend **and**
the plugin runs on a device with local filesystem access to the binary (macOS desktop —
the same `basePath` check `getBinaryPath()` already uses to detect iOS), the plugin
additionally starts a second, parallel binary process in a new `--reminders-only` mode.

### The binary gains a `--reminders-only` mode

`export`/`watch` accept a `--reminders-only` flag. In that mode the binary skips
`requestAccess()` (the `.event` EventKit scope, currently requested unconditionally
before the command dispatch) and only calls `requestReminderAccess()`, then emits just
the `EKReminder`-derived `DeskleafEvent` objects (no `EKEvent` entries). Without the flag,
existing behavior is unchanged. This keeps the parallel process's output pre-filtered —
the TS layer never de-duplicates reminders against EventKit events — and avoids prompting
a CalDAV user for full macOS Calendar access they never asked for.

### Desktop-only stays a hard constraint, not a gap

On iOS/mobile (no `basePath`, no local binary process possible under any backend), the
second process is never started. Reminders remain absent there when CalDAV is active,
identical to the existing "Mobiles Gerät" fallback for events. No transport for EventKit
reminder data to mobile Obsidian exists or is planned.

### Failure isolation carries over

A denied/failed reminders-only process must never affect the CalDAV event path — same
principle the original Reminders spec already established between `.event` and
`.reminder` access inside the binary.

### Recommended shape: a composite reader, not a view-layer merge

`main.ts` currently exposes a single `calendarReader: CalendarReader | CalDAVReader`
field that `calendar-view.ts`/`sidebar-view.ts`/`note-manager.ts` read directly. Rather
than teach the view layer to merge two sources, the composite (CalDAV events ⊕
reminders-only binary events) should live behind the same reader interface
(`getEvents`, `getEventsForDate`, `getAllDayEventsForDate`, `onChange`, `load`,
`startWatching`, `stopWatching`, `getLoadError`, `getCacheDate`, `getEventUrl`), with
write methods (`createEvent`/`moveEvent`/`updateEvent`/`cancelEvent`) delegating only to
the primary CalDAV reader. This keeps the blast radius inside `main.ts`.

## Consequences

- `main.ts` gains a second, optional reader process lifecycle, mirrored in
  `onLayoutReady`, `onunload`, and the CalDAV credential-swap branch of `saveSettings()`.
- The Swift binary gains one optional flag; `export`/`watch` behavior without it is
  unchanged, so the already-shipped binary-only Reminders path (#82/#83) needs no rework.
- Desktop-only is now an explicit, permanent product constraint for CalDAV users who want
  Reminders — not a TODO. Revisit only if a transport for local EventKit data to
  mobile Obsidian becomes technically feasible.
- Future EventKit-only data (anything else that only exists locally via the binary) can
  reuse this same "parallel reminders-only-style process alongside CalDAV" pattern instead
  of inventing a new one.
