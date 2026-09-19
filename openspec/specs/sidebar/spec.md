# Sidebar

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Gives a persistent left-panel overview (view type `deskleaf-sidebar`) of the vault's Customers and
Projects entities plus a mini-calendar, so a user can jump into any active customer, project, or
its meeting history without leaving the workspace they're in.

## Requirements

### Requirement: Sections are independently hideable, resizable, and reorderable
The sidebar SHALL stack a mini calendar, Kunden (customers), and Projekte (projects) sections (plus
the Todos section — see the `todos` capability), each toggleable, resizable, and reorderable by
dragging its toolbar button, persisting order/visibility/heights per device in `localStorage` under
`deskleaf-sidebar-layout-v2`.
_Source: src/sidebar-view.ts, specs/sidebar-view.md_

#### Scenario: Layout survives a restart
- **WHEN** a user hides a section or reorders the toolbar buttons
- **THEN** that layout is read back from `localStorage` the next time the sidebar view mounts on
  the same device

### Requirement: Customers and projects are discovered by folder and frontmatter type together
The Kunden section SHALL list notes under `settings.vault.customersFolder` with frontmatter
`type: kunde`, and the Projekte section SHALL list notes under `settings.vault.projectsFolder` with
frontmatter `type: project`; a note failing either the folder or the type check for its section is
excluded.
_Source: src/sidebar-view.ts, specs/sidebar-view.md_

#### Scenario: Wrong-folder note is not listed
- **WHEN** a note has `type: kunde` but lives outside `customersFolder`
- **THEN** it does not appear in the Kunden section

### Requirement: Rows are ordered by user preference, then by active status
Customer and project rows SHALL follow the persisted order in `settings.customersOrder` /
`settings.projectsOrder` (file paths not yet in the order are appended), and customers whose
`status` is not `aktiv` SHALL keep their relative order but sink below active customers; inactive
customers get the `dl-topic-row--inactive` styling.
_Source: src/sidebar-view.ts, specs/sidebar-view.md_

#### Scenario: Paused customer sinks in the list
- **WHEN** a customer note has `status: pausiert`
- **THEN** it renders dimmed and below every `status: aktiv` customer, keeping its relative order
  among other inactive ones

### Requirement: Drag-and-drop reordering persists the new order
Rows SHALL be HTML5-draggable within their list; dropping a row above or below another SHALL
compute the new order from cursor position and save it via `saveSettings()`, then re-render.
_Source: src/sidebar-view.ts, specs/sidebar-view.md_

#### Scenario: Reordering a customer row
- **WHEN** a user drags a customer row and drops it above another row
- **THEN** `settings.customersOrder` is rewritten to reflect the new position and persisted

### Requirement: Inline creation of new customer/project notes in the Brain shape
Each section SHALL offer a dashed "new row" that, on Enter with a non-empty name, creates a note in
the Brain shape (customer: six standard sections with Dataview blocks; project: `Initial context`/
`Sources`/`Related notes`) and opens it — never overwriting an existing note of the same name.
_Source: src/sidebar-view.ts, src/note-manager.ts, specs/sidebar-view.md_

#### Scenario: Creating a duplicate name opens the existing note
- **WHEN** a user types a name that already exists as a customer note and presses Enter
- **THEN** the existing note is opened rather than a second note being created
