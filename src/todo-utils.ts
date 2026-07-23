import { toDateStr, addDays } from "./date-utils";
import type { TodoStatus, TodoGroupKey } from "./types";

const CLOSED_STATUS_CHARS = new Set(["x", "X", "-"]);
const IMPORTANT_STATUS_CHAR = "!";

/** Tasks-plugin status char → open/closed/important. Any char not in the
 *  closed/important sets is treated as open, so future Tasks status
 *  collections need no maintained list here. */
export function classifyTodoStatus(statusChar: string): TodoStatus {
  if (CLOSED_STATUS_CHARS.has(statusChar)) return "closed";
  if (statusChar === IMPORTANT_STATUS_CHAR) return "important";
  return "open";
}

// Priority order per Tasks plugin convention: due > scheduled > start.
// ➕/✅/❌ (created/done/cancelled) are intentionally not read here — they
// exist in Tasks-authored text but never affect grouping.
const INLINE_DATE_EMOJIS = ["📅", "⏳", "🛫"] as const;
const INLINE_DATE_VALUE_RE = /(\d{4}-\d{2}-\d{2})/;

export function extractInlineDate(text: string): string | null {
  for (const emoji of INLINE_DATE_EMOJIS) {
    const idx = text.indexOf(emoji);
    if (idx === -1) continue;
    const match = INLINE_DATE_VALUE_RE.exec(text.slice(idx + emoji.length));
    if (match) return match[1];
  }
  return null;
}

export function resolveTodoDate(text: string, frontmatterDate: string | null): string | null {
  return extractInlineDate(text) ?? frontmatterDate;
}

interface GroupableTodo {
  status: TodoStatus;
  date: string | null;
}

export function groupTodos<T extends GroupableTodo>(todos: T[], today: Date): Record<TodoGroupKey, T[]> {
  const todayStr = toDateStr(today);
  const weekEndStr = toDateStr(addDays(today, 7));
  const groups: Record<TodoGroupKey, T[]> = {
    important: [], today: [], week: [], later: [], undated: [], past: [],
  };
  for (const todo of todos) {
    if (todo.status === "closed") continue;
    if (todo.status === "important") { groups.important.push(todo); continue; }
    if (!todo.date) groups.undated.push(todo);
    else if (todo.date < todayStr) groups.past.push(todo);
    else if (todo.date === todayStr) groups.today.push(todo);
    else if (todo.date <= weekEndStr) groups.week.push(todo);
    else groups.later.push(todo);
  }
  return groups;
}

/** Rewrites a todo source line's status char to `x`/` ` — independent of
 *  what the original status char was (AC6). */
export function applyTodoToggle(line: string, checked: boolean): string {
  return checked
    ? line.replace(/^- \[.\]/, "- [x]")
    : line.replace(/^- \[x\]/i, "- [ ]");
}
