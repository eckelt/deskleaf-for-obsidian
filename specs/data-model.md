# Data Model

## CalendarEvent (internal)

The normalised shape used everywhere in the plugin. Produced directly by the `focal-cal`
binary (Swift/EventKit) and passed as JSON.

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
  isOrganizer?: boolean;    // true if organizer is nil OR isCurrentUser
  meetingPlatform?: string; // "zoom" | "teams" | "meet" | "webex" | null
  numAttendees?: number;
  organizer?: string | null;
}
```

### Event ID schema

| Event type | ID format | Example |
|---|---|---|
| Non-recurring | Raw `eventIdentifier` | `"ABC123"` |
| Recurring | `eventIdentifier\|YYYY-MM-DD` | `"ABC123\|2026-04-22"` |

The composite recurring ID is unique per occurrence. The `|` separator is used by the
binary's `findEvent()` to look up the correct occurrence in EventKit.

`id` is the stable link between the calendar and the note. It is stored in the note's
frontmatter as `event-id`. The filename is not load-bearing.

Multi-day events returned by `getEventsForDate` carry two extra runtime flags (not in
the interface, added as `any` casts):

```ts
_continuesBefore: boolean  // event started on an earlier day
_continuesAfter:  boolean  // event ends on a later day
```

---

## JSON input format

A JSON array is emitted on stdout by `focal-cal export` and `focal-cal watch` (one JSON
line per output). The array contains objects matching the `CalendarEvent` interface above.

All-day events use `YYYY-MM-DD` for `start`/`end`. Timed events use full ISO 8601 with
timezone offset.

---

## Event note frontmatter

Written by `NoteManager` when creating a new note. Consumed by the calendar and sidebar views.

```yaml
---
event-id: "ABC123|2026-04-22"
title: "Team Weekly"
date: "2026-04-22"
start: "10:00"
end: "11:00"
location: ""
attendees: ["[[Alice Smith]]", "[[Bob Jones]]"]
type: meeting          # meeting | interview | recurring | task
toBeRemoved: false
removalDate: null
topics: []             # list of topic titles this note is associated with
---
```

`event-id` in the frontmatter can be a single string or a YAML array (for notes manually
linked to multiple events).

### Attendee name normalisation

Attendee names in the format `"Last, First"` are normalised to `"First Last"` before
being written as `[[wikilinks]]`. Names without a comma are used as-is.

---

## Topic note

Any vault file with the `#topic` tag (inline body tag) or `topic` in frontmatter `tags`
array is treated as a topic. Both `topic` and `#topic` YAML tag formats are accepted.

Created by the sidebar with the following template:

```markdown
---
tags: [topic]
---

# <Title>

```

Topics are identified by file path. Display name = `file.basename`.

---

## FocalSettings

```ts
interface FocalSettings {
  binaryPath: string;         // empty = auto-detect focal-cal in plugin directory
  weekStartsOn: "monday";     // fixed, not user-configurable
  templateFolder: string;     // default: "templates"
  notesFolder: string;        // default: "notes"
  topicsFolder: string;       // default: "topics"
  topicsOrder: string[];      // ordered file paths for sidebar sort
}
```

Also persisted in `data.json` alongside settings (not part of the interface):

```ts
calendarCache:     CalendarEvent[]  // last successful load
calendarCacheDate: string | null    // ISO timestamp of that load
```
