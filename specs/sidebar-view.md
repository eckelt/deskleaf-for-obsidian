# Sidebar View

View type: `deskleaf-sidebar`. Opened in the **left panel**. Icon: `dl-point` (custom SVG).
Display text: `"Deskleaf"`.

The sidebar stacks four sections, each hideable via the toolbar, resizable, and
reorderable by dragging its toolbar button:

```
┌─────────────────────┐
│  Kalender           │  (mini calendar)
├─────────────────────┤
│  Kunden             │  (scrollable)
├─────────────────────┤
│  Projekte           │  (scrollable)
├─────────────────────┤
│  Todos              │  (scrollable)
└─────────────────────┘
```

Order, visibility and heights persist per device in `localStorage` under
`deskleaf-sidebar-layout-v2`.

Refreshes on: `metadataCache.changed` (skips the currently active file — avoids lag while
typing), vault `create`, `delete`, `rename` — all debounced 400ms. Also refreshes once
(200ms debounce) when the user switches away from a file they were editing.

Internal links rendered by `MarkdownRenderer` get explicit click handling via
`app.workspace.openLinkText` — required because custom `ItemView` containers don't wire
Obsidian link navigation automatically.

The section toolbar uses Obsidian `nav-action-button` buttons and Obsidian icon names so
it visually matches the mobile file explorer. It intentionally avoids Obsidian's
`nav-header` container because that element gets mobile-specific layout treatment.

---

## Kunden & Projekte sections

The vault's anchor is the **customer**: meetings, people and todos all hang off a
`customers/` note by wiki-link and `#kunde/<slug>` tag. These two sections mirror
that structure rather than maintaining a second ordering of their own.

### Discovery

| Section | Source | Condition |
|---|---|---|
| Kunden | `vault.customersFolder` | frontmatter `type: kunde` |
| Projekte | `vault.projectsFolder` | frontmatter `type: project` |

Folder **and** type must match — a `README.md` in `customers/` is not a customer,
and a `type: kunde` note filed elsewhere is not indexed.

### Ordering

User-saved order (`settings.customersOrder` / `settings.projectsOrder`, arrays of
file paths); files not yet in the order are appended. Customers whose `status` is
not `aktiv` keep their relative order but sink below the active ones.

### Row

| Element | Behaviour |
|---|---|
| Row | `draggable="true"`; initiates HTML5 drag for reordering |
| Title | Click → open the note; Cmd/Ctrl+click → open in split; middle-click → split |
| Chips (Kunden) | Up to 6 upcoming, non-cancelled event titles matched to this customer |
| Chips (Projekte) | `<n> offen` — count of unchecked list items in the project note |
| Inactive | `status: pausiert`/`beendet` → `dl-topic-row--inactive`, dimmed title |

There is no delete affordance: a customer is a real entity in the vault, not a
tag to be taken off a note.

### Active note highlight

When one of these notes is the active tab, its row gets `dl-topic-row--active`.
Updated on every `workspace.on("file-open")` and at the end of every `render()`.

### Drag-and-drop reordering

HTML5 drag events on the list element. A 2px accent border shows the drop
insertion point (above or below the target row based on cursor midpoint). On
drop, the new order is saved via `saveSettings()` and the view re-renders.

### New row

A dashed row at the bottom of each list. Clicking it reveals an inline text input:
- **Enter**: creates the note in the Brain shape — a customer with the six
  standard sections and their Dataview blocks, a project with
  `Initial context` / `Sources` / `Related notes` — then opens it. An existing
  note of that name is opened, never overwritten.
- **Escape / blur**: cancels without creating.

---

## Todos section

### Collection

Scans `settings.vault.todoFolders` plus notes at the vault root — the same source
set as `list_open_todos` in the Deskleaf MCP. Excludes files with a
`kanban-plugin` frontmatter key (Kanban boards).

For each file, uses `vault.cachedRead` (not `vault.read`) for performance. Lines
are matched against `- [ ]` / `- [x]`, indented and `*`-prefixed included.

### Dates

A todo's due date comes from its own line first:

1. `due:: yyyy-mm-dd` — canonical
2. `📅 yyyy-mm-dd` — Tasks plugin
3. `[[yyyy-mm-dd]]` — trailing date link

Only when the line carries none does the note's `date` (or the older `datum`)
apply — so an undated todo in a meeting note still lands on that meeting's day.
The markers are stripped from the displayed text; the date shows in the chip.

Title from `frontmatter.title` or `file.basename`.

### Grouping (open todos only — checked items are hidden)
| Group | Label | Condition |
|---|---|---|
| `today` | Heute | `date === today` |
| `week` | Diese Woche | `today < date <= today + 7d` |
| `later` | Später | `date > today + 7d` |
| `undated` | Ohne Datum | neither a line due date nor a note date |
| `past` | Früher | `date < today` |

A count of all open todos is shown next to the "Todos" section header.

### Todo item

| Element | Behaviour |
|---|---|
| Checkbox | Ticks `- [ ]` → `- [x] … ✅ yyyy-mm-dd` in the source file (via `vault.read` + `vault.modify`), then re-renders. Unticking drops the `✅` date and keeps the `due::`. Never stamps a second done date — the same contract as `complete_todo` in the MCP. |
| Todo text | Rendered via `MarkdownRenderer` (supports inline markdown, wikilinks) |
| Source chip | `<noteTitle>[ · <date>]` — click to open source note; Cmd/Ctrl+click → split |

---

## Navigation behaviour (all clickable elements)

All opens in the sidebar use the shared `openFile` helper:

- **Plain click**: find existing open leaf for the file → `setActiveLeaf`; or
  `getLeaf(false).openFile` if not open.
- **Cmd/Ctrl+click**: `getLeaf('split').openFile` — opens in a new vertical split.

Applies to: customer and project titles, todo source chips.
