# iCal Feed Subscriptions

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Lets a user add read-only calendar subscriptions (e.g. a public iCal URL) that show up on the
calendar alongside the primary backend's events, independent of whether that backend is CalDAV or
the EventKit binary.

## Requirements

### Requirement: Feed subscriptions are configured and polled independently of the main backend
The plugin SHALL let a user add, rename, enable/disable, and remove iCal feed subscriptions
(`DeskleafSettings.icalSubscriptions`) from the settings tab, and SHALL poll every enabled feed on
a fixed interval (default 60 minutes) plus once immediately on load, independent of which primary
calendar backend is active.
_Source: src/ical-feed-manager.ts, src/settings.ts, src/types.ts (ICalFeedSubscription)_

#### Scenario: Adding a feed
- **WHEN** a user submits a label and URL in the "+ Abonnement hinzufügen" form
- **THEN** a new `ICalFeedSubscription` is appended, saved, and polled on the next cycle

#### Scenario: Disabled feed contributes no events
- **WHEN** a feed's `enabled` flag is `false`
- **THEN** `ICalFeedManager.getAllEvents()` excludes that feed's cached events entirely

### Requirement: Feed events are parsed via the shared iCal parser and namespaced by feed
Each feed's iCalendar text SHALL be fetched (via `requestUrl`, with a `webcal:` URL rewritten to
`https:`) and parsed with the same RFC 5545 parser used by the CalDAV backend, and every resulting
event id SHALL be prefixed `ical:<feedId>:` so feed events are distinguishable from primary
calendar events.
_Source: src/ical-feed-manager.ts, src/ical-parser.ts, src/ical-feed-manager.ts (isFeedEvent)_

#### Scenario: Feed events are marked read-only
- **WHEN** an event's id starts with `ical:`
- **THEN** `isFeedEvent()` returns true and the calendar view treats the event as read-only (no
  drag-to-move, drag-to-resize, or edit form writes)

### Requirement: A feed's fetch error is surfaced without breaking other feeds
A fetch failure for one feed SHALL be recorded on that feed's own `lastError` field and SHALL NOT
prevent other feeds from polling or the primary backend from loading.
_Source: src/ical-feed-manager.ts (fetchFeed, _pollAll, getWarnFeeds)_

#### Scenario: One broken feed does not block the rest
- **WHEN** one subscribed feed URL returns an HTTP error or invalid iCal text
- **THEN** that feed's `lastError` is set and its previous cached events (if any) remain available,
  while every other enabled feed still polls normally

### Requirement: Each feed gets a distinct color for calendar display
Each feed SHALL be assignable one of the six `CAL_COLOR_PALETTE` hues via the settings UI, stored
on the subscription's own `color` field, independent of the CalDAV per-calendar color map.
_Source: src/ical-feed-manager.ts (assignColors), src/settings.ts (renderICalList), src/types.ts_

#### Scenario: New feed gets a default color
- **WHEN** a feed is added without explicitly picking a swatch
- **THEN** it is assigned a `CAL_COLOR_PALETTE` hue by index (`feeds.length % palette.length`)
