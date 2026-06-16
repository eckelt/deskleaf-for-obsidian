# Deskleaf for Obsidian

Root context for coding agents working on this repository.

## Project
Obsidian plugin for a time-grid calendar and structured note-taking workflow.

Calendar backends:
- CalDAV on all platforms.
- Bundled Swift binary for macOS EventKit.

Backend selection is automatic:
- CalDAV when `caldav.username` and `caldav.password` are set.
- Swift binary otherwise.

## Source Map

```text
src/
  main.ts              Plugin entry: icons, settings, reader factory, view registration
  types.ts             Shared TypeScript types and CAL_COLOR_PALETTE
  calendar-view.ts     Time-grid calendar ItemView
  sidebar-view.ts      Left panel: topics list and todos board
  calendar-reader.ts   macOS EventKit backend through the Swift binary
  caldav-reader.ts     CalDAV backend
  caldav-client.ts     Low-level CalDAV HTTP client
  ical-parser.ts       RFC 5545 iCal parser and VEVENT builder
  ical-feed-manager.ts Internet calendar feed polling and cache management
  event-filter.ts      Shared date-range filtering
  event-layout.ts      Event position, height, and overlap-column math
  note-manager.ts      Event note creation, lookup, templates, and cleanup
  note-utils.ts        Attendee normalization and filename sanitization
  date-utils.ts        Date arithmetic and header label helpers
  open-file.ts         Modifier-aware navigation helper
  search-modal.ts      Full-text search over notesFolder
  settings.ts          Settings tab UI

styles.css             Single flat stylesheet
```

## Canonical Docs

- Design system: `docs/design-system.md`
- Agent workflow: `docs/agent-workflow.md`
- Feature Planner instructions: `docs/agents/feature-planner.md`
- Feature Builder instructions: `docs/agents/feature-builder.md`
- QA Agent instructions: `docs/agents/qa-agent.md`
- ADRs: `docs/adr/`
- Feature specs: `specs/features/`

Do not duplicate these docs here. Update the canonical document instead.

## Build And Test

```bash
npm run build
npm test
bash deploy.sh
```

`npm test` runs Vitest with `TZ=UTC`.

## Architecture Rules

- Keep modules lean: each `src/*.ts` should have one clear responsibility.
- Prefer pure functions for date math, filtering, layout math, and parsing helpers.
- Keep direct DOM work inside view files.
- Keep shared types in `src/types.ts`.
- Keep styling in `styles.css`, except dynamic CSS custom properties such as `--cal-h`.
- Follow existing patterns before introducing abstractions.
- Do not introduce a shared abstraction before the third clear occurrence.

## Feature Workflow

GitHub issues are the inbox and discussion surface. Feature specs in `specs/features/[feature-name].md` are the source of truth for implementation.

Status flow:

```text
draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done
```

For feature work, read the relevant feature spec first. Do not read all of `specs/` unless the feature requires it.
