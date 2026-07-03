# Feature: Google Meet Description Boilerplate Cleanup

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/20
- Related prior spec: `specs/features/remote-event-source-of-truth.md`

## User Story
Als Nutzer moechte ich Google-Meet-Einladungen ohne generierten Dial-in- und Support-Block in der Event-Beschreibung sehen, damit die Beschreibung nur den fuer mich relevanten Inhalt enthaelt.

## Acceptance Criteria
- [ ] AC1: Beim Laden von Kalenderereignissen entfernt Deskleaf den von Google Meet generierten Boilerplate-Block aus `CalendarEvent.body`, wenn er durch die `-::~...::-` Trennlinien eingefasst ist.
- [ ] AC2: Der entfernte Google-Meet-Block umfasst mindestens `Join with Google Meet`, `Or dial`, `More phone numbers`, `Learn more about Meet`, `Please do not edit this section.` und die beiden Trennlinien aus Issue #20.
- [ ] AC3: Nutzertext vor oder nach dem Google-Meet-Block bleibt in der sichtbaren Beschreibung erhalten.
- [ ] AC4: Bestehende Teams-/Online-Meeting-Beschreibungsbereinigung bleibt unveraendert.
- [ ] AC5: Die Meeting-Plattform-Erkennung fuer Google Meet bleibt erhalten, auch wenn die sichtbare Beschreibung den entfernten Meet-Block nicht mehr enthaelt.

## Acceptance Scenarios
```gherkin
Scenario: Google Meet boilerplate block is removed from a loaded event
  Given a backend event description contains the Google Meet block from issue #20
  When Deskleaf loads and parses the event
  Then the visible event description does not contain the Meet join, dial-in, phone-number, support or "Please do not edit this section." lines
  And the visible event description does not contain the Google Meet delimiter lines
```

```gherkin
Scenario: User-written description text around the Meet block is preserved
  Given a backend event description contains "Agenda" before the Google Meet block
  And it contains "Follow-up notes" after the Google Meet block
  When Deskleaf loads and parses the event
  Then the visible event description contains "Agenda"
  And it contains "Follow-up notes"
  And only the generated Google Meet block is removed
```

```gherkin
Scenario: Meet platform signal survives description cleanup
  Given the only `meet.google.com` URL for an event is inside the generated Google Meet description block
  When Deskleaf loads and parses the event
  Then `CalendarEvent.meetingPlatform` is `meet`
  And `CalendarEvent.body` does not contain the generated Google Meet block
```

## Out of Scope
- New meeting join buttons, embedded meeting clients, or provider-specific UI flows.
- Changing event title, time, location, attendees, calendar selection, or source-of-truth/cache behavior.
- Restoring removed provider text when a user later edits and saves the visible description.
- Reworking the full Online-Meeting cleanup architecture beyond what is needed for this bug.

## Open Questions
_None_

## Design Decisions
- This is a bug-fix slice for Google Meet boilerplate only. The broader remote-source-of-truth behavior remains governed by `specs/features/remote-event-source-of-truth.md`.
- Description cleanup is a read-time normalization of `CalendarEvent.body`; all other event fields must stay backend-derived.
- Meeting-platform detection must use raw description, location, or URL data before assigning the cleaned visible body, so removing the boilerplate does not remove the Meet icon/platform signal.
- The cleanup should live in the existing focused description-cleaning path, currently `cleanBody(...)`, unless the builder finds that a small helper module is needed to keep the code readable.

## Affected Areas
- `src/note-utils.ts`: Extend or tighten `cleanBody(...)` so the exact Google Meet delimiter pattern and enclosed boilerplate from Issue #20 are removed while preserving surrounding user text.
- `src/ical-parser.ts`: Parse CalDAV descriptions so `CalendarEvent.body` receives the cleaned description while `meetingPlatform` can still be detected from the raw values.
- `src/calendar-reader.ts`: Ensure EventKit/binary events also expose cleaned descriptions if the Swift binary does not already guarantee it.
- `src/note-manager.ts`: Continue using cleaned descriptions for generated or synchronized notes.
- `tests/*.test.ts`: Add focused coverage for Google Meet cleanup, surrounding text preservation, and platform detection after cleanup.

## Test Expectations
- Automated Vitest coverage is required for `cleanBody(...)` with the exact delimiter shape and Google Meet boilerplate from Issue #20.
- Automated Vitest coverage is required for preserving user-written text before and after the removed block.
- Automated parser-level coverage is required for `parseICalendar(...)`: `body` is cleaned, and `meetingPlatform` remains `meet` when the only Meet URL appears inside the removed block.
- Existing Teams/underscore cleanup tests must remain green; representative regression coverage is sufficient because these paths share the same helper.
- Manual QA in Obsidian is required with one real Google Meet event: the event card/detail description must omit the generated block while still showing the Google Meet platform treatment.

---

## UX Review

### Ergebnis

Freigabe fuer `ux-reviewed`.

### Bewertung

Der Nutzerwert ist direkt und klein: generierter Provider-Text ist Lesemuell in einer Kalenderbeschreibung. Die UI braucht keine neue Interaktion; korrekt ist, dass der vorhandene Beschreibungstext schlicht sauberer angezeigt wird.

---

## Design Review

### Ergebnis

Freigabe fuer `design-reviewed` und `approved`.

### Technische Richtung

Die bestehende Architektur passt: `note-utils.ts` enthaelt bereits die fokussierte Bereinigung fuer Beschreibungstexte, `ical-parser.ts` erkennt Meeting-Plattformen aus den rohen Eventdaten, und Views rendern nur das resultierende `CalendarEvent`.

Der Builder soll die Bereinigung als kleine pure Funktionalitaet absichern und keine neue Provider-Schicht einfuehren. Entscheidend ist die Reihenfolge: raw Beschreibung fuer Plattform-Erkennung verwenden, danach nur `body` bereinigt weitergeben.

---

## QA Report
_Pending_
