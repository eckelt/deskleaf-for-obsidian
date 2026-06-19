# Sidebar View

View type: `deskleaf-sidebar`. Opened in the **left panel**. Icon: `dl-point` (custom SVG).
Display text: `"Deskleaf"`.

The sidebar combines two sections stacked vertically:

```
┌─────────────────────┐
│  Topics             │  (scrollable)
├─────────────────────┤
│  ─────────────────  │  (divider)
├─────────────────────┤
│  Todos              │  (scrollable)
└─────────────────────┘
```

Refreshes on: `metadataCache.changed` (skips the currently active file — avoids lag while
typing), vault `create`, `delete`, `rename` — all debounced 400ms. Also refreshes once
(200ms debounce) when the user switches away from a file they were editing.

Internal links rendered by `MarkdownRenderer` get explicit click handling via
`app.workspace.openLinkText` — required because custom `ItemView` containers don't wire
Obsidian link navigation automatically.

The section toolbar uses Obsidian `nav-header` / `nav-action-button` structure and
Obsidian icon names so it visually matches the mobile file explorer. On narrow/mobile
layouts, sections do not stretch only to create blank space above the toolbar.

---

## Topics section

### Discovery

Any vault file with `#topic` as an inline tag **or** `topic` in its frontmatter `tags`
array is treated as a topic. Both `topic` and `#topic` YAML formats are accepted.

Topics can live anywhere in the vault — the `topicsFolder` setting only controls where
**new** topics are created.

### Ordering

Topics appear in the user-saved order (`settings.topicsOrder`, array of file paths). Files
not yet in the order are appended at the end.

### Topic row

Each row contains:

| Element | Behaviour |
|---|---|
| Drag handle `⠿` | Initiates HTML5 drag; row is `draggable="true"` |
| Title | Click → open the topic note; Cmd/Ctrl+click → open in split |
| Event chips | Up to 6 event titles whose notes list this topic in `frontmatter.topics`; shown as small muted text below the title |
| Delete `✕` | Appears on hover. Removes `#topic`/`topic` tag from frontmatter array and inline body. Removes file from `topicsOrder`. Does **not** delete the file. |

### Active topic highlight

When a topic note is the active tab, its row gets `focal-topic-row--active` (accent tint
background). Updated on every `workspace.on("file-open")` event and at the end of every
full `render()`.

### Drag-and-drop reordering

HTML5 drag events on the list element. A 2px accent border shows the drop insertion point
(above or below the target row based on cursor midpoint). On drop, the new order is saved
to `settings.topicsOrder` via `saveSettings()` and the view re-renders.

### New topic row

A dashed row at the bottom of the list. Clicking it reveals an inline text input:
- **Enter**: creates `<topicsFolder>/<title>.md` with `tags: [topic]` frontmatter +
  `# <title>` heading, then opens it.
- **Escape / blur**: cancels without creating.

---

## Todos section

### Collection

Scans all files in `notesFolder/` **and** all topic-tagged files. Excludes files with a
`kanban-plugin` frontmatter key (Kanban boards).

For each file, uses `vault.cachedRead` (not `vault.read`) for performance. Lines are
matched against:
- Open: `- [ ] <text>`
- Done: `- [x] <text>` (case-insensitive)

Date is taken from `frontmatter.date`. Title from `frontmatter.title` or `file.basename`.

### Grouping (open todos only — checked items are hidden)

| Group | Label | Condition |
|---|---|---|
| `today` | Heute | `date === today` |
| `week` | Diese Woche | `today < date <= today + 7d` |
| `later` | Später | `date > today + 7d` |
| `undated` | Ohne Datum | no `date` frontmatter |
| `past` | Früher | `date < today` |

A count of all open todos is shown next to the "Todos" section header.

### Todo item

| Element | Behaviour |
|---|---|
| Checkbox | Toggles `- [ ]` ↔ `- [x]` in the source file (via `vault.read` + `vault.modify`), then re-renders |
| Todo text | Rendered via `MarkdownRenderer` (supports inline markdown, wikilinks) |
| Source chip | `<noteTitle>[ · <date>]` — click to open source note; Cmd/Ctrl+click → split |

---

## Navigation behaviour (all clickable elements)

All opens in the sidebar use the shared `openFile` helper:

- **Plain click**: find existing open leaf for the file → `setActiveLeaf`; or
  `getLeaf(false).openFile` if not open.
- **Cmd/Ctrl+click**: `getLeaf('split').openFile` — opens in a new vertical split.

Applies to: topic titles, todo source chips.
