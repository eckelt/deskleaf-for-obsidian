# Todos

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Surfaces open Markdown checkbox todos from across the vault's meeting, project, and customer notes
in one grouped list in the sidebar, using the same parsing and completion rules as the separate
Deskleaf MCP so both tools can tick the same box without conflict.

## Requirements

### Requirement: Todos are collected from configured folders plus the vault root
The Todos section SHALL scan `settings.vault.todoFolders` (default: meetings, projects, customers)
plus every note at the vault root, reading each file with `vault.cachedRead`, matching lines against
`- [ ]` / `- [x]` (indented and `*`-prefixed included), and excluding any file carrying a
`kanban-plugin` frontmatter key.
_Source: src/todo-parser.ts, src/sidebar-view.ts, specs/sidebar-view.md, specs/data-model.md_

#### Scenario: Kanban board is excluded
- **WHEN** a note's frontmatter includes `kanban-plugin`
- **THEN** none of its checkbox lines appear in the Todos section

### Requirement: A todo's status character determines its group and styling
`classifyTodoStatus` SHALL treat `x`/`X`/`-` as closed (hidden from the open-todo list), `!` as
`important` (always its own group regardless of date), and any other character as `open`.
_Source: src/todo-parser.ts (classifyTodoStatus, groupForDate)_

#### Scenario: Important todo bypasses date grouping
- **WHEN** a line is `- [!] Call the client`
- **THEN** it is grouped as `important` even if it also carries a `due::` date in the past or future

### Requirement: Due date resolution falls back from the line to the note
A todo's date SHALL come from its own line first — `due:: yyyy-mm-dd` (canonical), then
`📅 yyyy-mm-dd` (Tasks plugin), `⏳`/`🛫` dates, or a trailing `[[yyyy-mm-dd]]` link — and only when
the line carries none of these does the containing note's `date` (or legacy `datum`) frontmatter
apply.
_Source: src/todo-parser.ts (extractDueDate, resolveTodoDate), specs/data-model.md_

#### Scenario: Undated todo inherits the meeting's date
- **WHEN** a todo line in a meeting note carries no due marker
- **THEN** it is grouped under the meeting note's own `date` frontmatter value

### Requirement: Open todos group into fixed buckets relative to today
Open (non-`important`) todos SHALL group as `today` (date === today), `week` (today < date ≤
today+7d), `later` (date > today+7d), `past` (date < today), or `undated` (no resolvable date), and
the sidebar SHALL show a running count of all open todos next to the section header.
_Source: src/todo-parser.ts (groupForDate), specs/sidebar-view.md_

#### Scenario: A todo three days overdue lands in "Früher"
- **WHEN** a todo's resolved date is three days before today
- **THEN** it is grouped under `past` ("Früher"), not `today` or `undated`

### Requirement: Completion and reopening never double-stamp a date
Ticking a checkbox SHALL rewrite `- [ ] …` to `- [x] … ✅ <today>` (skipping the stamp if a
`✅` date is already present), and unticking SHALL strip any `✅` date while preserving the
`due::` marker — matching the Deskleaf MCP's `complete_todo` contract exactly.
_Source: src/todo-parser.ts (completeTodoLine, reopenTodoLine), specs/data-model.md_

#### Scenario: Re-checking an already-done line is a no-op on the date
- **WHEN** `completeTodoLine` is called on a line that already has a `✅` date
- **THEN** no second done-date is appended
