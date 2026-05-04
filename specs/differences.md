# Spec vs Implementation — Resolved Findings

All findings from the initial comparison have been addressed.

| Finding | Resolution |
|---|---|
| `todo-board-view.ts` dead code | Deleted |
| `topics-view.ts` dead code | Deleted |
| `defaultView` setting shown in UI but unused | Removed from settings tab UI; field retained in type for `data.json` compatibility |
| Search modal always opened new tab | Fixed to use `openFile` helper (existing tab / split on Cmd) |
| `isSameDay` exported but unused | Removed from `date-utils.ts` |
| Past-event todos grouped under "Später" | Added `past` group ("Früher") for `date < today` |
