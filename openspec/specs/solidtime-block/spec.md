# SolidTime Block

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Renders tracked time from the SolidTime time-tracking service directly inside a note via a
` ```solidtime ` fenced code block, the same way Dataview renders vault data, so billing and time
context sit next to the customer or project note they're about — read-only.

## Requirements

### Requirement: A solidtime block parses to a view plus field:value filters
`parseSolidTimeQuery` SHALL read the first non-comment line as the view (`entries`,
`summary by client`, `summary by month`, `summary by project`, or bare `summary` meaning
`by-client`) and every subsequent line as a `field: value` filter (`client`/`kunde`,
`project`/`projekt`, `since`/`seit`/`from`/`von`, `until`/`bis`/`to`, `month`/`monat`,
`billable`/`abrechenbar`, `limit`), rejecting an unknown view or field with a
`SolidTimeQueryError`.
_Source: src/solidtime-query.ts, docs/solidtime-blocks.md_

#### Scenario: Unknown view is rejected
- **WHEN** the block's first line is not one of the recognised view strings
- **THEN** rendering shows an error notice naming the allowed views instead of a table

#### Scenario: A customer note supplies its own client filter
- **WHEN** a `solidtime` block sits in a note with `type: kunde` and does not set `client:`
- **THEN** the query is scoped to that note's customer name automatically; `client: all` opts out

### Requirement: Date expressions resolve relative to render time, not write time
`resolveDate` SHALL accept absolute dates (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`), relative offsets
(`-30d`, `-2w`, `-1m`, `-1y`), and named ranges (`today`/`heute`, `this month`, `last month`,
`this year`/`ytd`, `last year`), re-resolving them on every render so a block written once keeps
answering the current question.
_Source: src/solidtime-query.ts (resolveDate), docs/solidtime-blocks.md_

#### Scenario: A "this year" block updates across renders
- **WHEN** a block with `since: this year` is re-rendered on a later date
- **THEN** the resolved start date is January 1 of the year current at render time, not write time

### Requirement: Rendering fetches from the SolidTime API and never writes back
On each render, the block processor SHALL call the SolidTime REST API with the configured API key
and organization (falling back to the account's sole membership when unset), map the result into a
Dataview-styled HTML table matching the note's Dataview theme, and SHALL NOT expose any control that
writes back to SolidTime.
_Source: src/solidtime-block.ts, src/solidtime-client.ts_

#### Scenario: Missing API key shows a hint, not an error
- **WHEN** `settings.solidtime.apiKey` is empty
- **THEN** the block renders a hint notice pointing to Settings → Deskleaf → SolidTime instead of
  attempting a network call

#### Scenario: Rate-less total shows a dash, not zero
- **WHEN** none of the aggregated rows carry a known cost
- **THEN** the rendered total shows "—" for the amount rather than "0 €"

### Requirement: The `entries` view lists individual time entries without amounts
The `entries` view SHALL render one row per time entry (date, project, description, hours) with no
amount column, because SolidTime returns cost only on aggregate endpoints, not per entry.
_Source: src/solidtime-block.ts (runQuery, renderTable), docs/solidtime-blocks.md_

#### Scenario: Entries view omits currency
- **WHEN** a block's view is `entries`
- **THEN** the rendered table's columns are Datum, Projekt, Beschreibung, Stunden — with no Betrag
  column
