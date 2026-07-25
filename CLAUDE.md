<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp model type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension model in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of model-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — models, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately invoke the `swamp-getting-started` skill before doing anything else.
This walks new users through an interactive onboarding tutorial.

If models already exist, start by using the `swamp` skill to work with
swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->

# Deskleaf for Obsidian — Project Context

Obsidian plugin: time-grid calendar + structured note-taking workflow.
Two backends: **CalDAV** (all platforms) and a bundled **Swift binary** reading macOS EventKit.
Active backend is auto-selected: CalDAV if `caldav.username + password` set, else binary.

---

## Source map

```
src/
  main.ts             Plugin entry: icons, settings, reader factory, view registration
  types.ts            All TS types + CAL_COLOR_PALETTE constant
  calendar-view.ts    Time-grid calendar ItemView (drag, resize, create, navigate)
  sidebar-view.ts     Left panel: Topics list + Todos board
  calendar-reader.ts  macOS EventKit backend (binary bridge)
  caldav-reader.ts    CalDAV backend (HTTP polling, iCal parsing)
  caldav-client.ts    Low-level CalDAV HTTP client (PROPFIND, REPORT, PUT, DELETE)
  ical-parser.ts      RFC 5545 iCal parser + VEVENT builder
  event-filter.ts     Pure date-range filtering (shared by both readers)
  event-layout.ts     Pixel math: event position, height, overlap columns
  note-manager.ts     Create / find / template / remove event notes
  note-utils.ts       Pure helpers: attendee normalisation, filename sanitisation
  date-utils.ts       Date arithmetic, column builders, header label formatters
  open-file.ts        Shared navigation helper (modifier-aware tab/split logic)
  search-modal.ts     Full-text search over notesFolder
  settings.ts         Settings tab UI
styles.css            All styles — single flat file, no CSS modules
```

---

## Design system

**Theme:** Monokai Pro.

**Dark mode chrome:**
- Background: `#2d2a2e` · Panel: `#221f22` · Text: `#fcfcfa` · Muted: `#727072`
- Borders: `#3e3b3f` (subtle) / `#5b595c` (strong)

**Light mode chrome:**
- Background: `#f9f7f5` · Text: `#2d2a2e` · Muted: `#a09c98` · Borders: `#e6e2dd`

**Calendar palette — 6 Monokai Pro hues** (`CAL_COLOR_PALETTE`):
`346` pink · `21` orange · `48` yellow · `96` green · `188` cyan · `252` purple

**Event cards** use CSS custom prop `--cal-h` (hue only):
- Light: `hsl(h, 52%, 91%)` bg / `hsl(h, 58%, 47%)` border / `hsl(h, 58%, 24%)` text
- Dark: `hsl(h, 28%, 15%)` bg / `hsl(h, 78%, 63%)` border / `hsl(h, 72%, 70%)` text

**CSS variable naming:** `--f-*` for layout/surface vars, `--cal-h` per event card.
All Obsidian accent colours come from `--accent-h/s/l` and `--interactive-accent`.

---

## Key data types (`src/types.ts`)

```ts
CalendarEvent { id, title, start, end, calendar?, isAllDay?, isRecurring?,
                isOrganizer?, isCancelled?, meetingPlatform?, attendees?, body?,
                location?, numAttendees?, organizer? }

DeskleafSettings { binaryPath, weekStartsOn: "monday", templateFolder,
                   notesFolder, topicsFolder, topicsOrder, caldav, icalSubscriptions }

CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252]  // hues for calendar colour picker
```

Event IDs: binary non-recurring = raw `eventIdentifier`; binary recurring = `id|YYYY-MM-DD`;
CalDAV = `UID` or `UID_RECURRENCE-ID`.

---

## Build & deploy

```bash
npm run build            # tsc type-check + esbuild → main.js
npm test                 # vitest (TZ=UTC always)
bash deploy.sh           # build + copy main.js + styles.css to Obsidian vault
```

Vault plugin path:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections/.obsidian/plugins/deskleaf-for-obsidian/`

**Deploy before human review.** A feature is only reviewable once it actually
runs in the vault. Never request human review of a feature that lives only on a
branch or in an undeployed build — the reviewer would be testing code that isn't
running. The autonomous pipeline enforces this: `issue-watch.sh` deploys the
merged build to the vault (`deploy_to_vault`) right after merge and before it
sets `status:ready-for-acceptance`. For manual/interactive changes, run
`bash deploy.sh` yourself before asking anyone to test.

---

## Architecture principles

- **Lean modules** — each `src/*.ts` has one clear responsibility; no cross-cutting God classes
- **Pure functions first** — date math, filtering, layout math live in pure utility files
- **No direct DOM** outside view files — `calendar-view.ts` and `sidebar-view.ts` own the DOM
- **Shared types in `types.ts`** — domain/shared/exported cross-module types live there;
  local unexported helper types may stay next to the code or tests that use them
- **styles.css is single-file** — no inline styles for static styling; dynamic
  CSS custom properties are allowed for runtime layout/colour values (`--f-*`,
  `--cal-h`)
- **Tests use vitest** — run with `TZ=UTC`; test files in `tests/*.test.ts`

---

## Feature development workflow

Specs live in `specs/features/[feature-name].md` — the shared artefact between all agents.
Status progression: `draft → ux-reviewed → design-reviewed → approved → in-development → qa → done`

Each spec contains: User Story · Acceptance Criteria · Out of Scope · UX Review · Design Review · QA Report.

For agent context: read the **feature spec only** — do not read all of `specs/` unless specifically relevant.
