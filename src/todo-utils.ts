/** Matches "- [<char>] text" — any single status character between the brackets (Tasks plugin support) */
export const TODO_LINE_REGEX = /^- \[(.)\] (.+)$/;

export type TodoStatus = "open" | "closed" | "important";
export type TodoDateGroup = "today" | "week" | "later" | "undated" | "past";
export type TodoGroup = "important" | TodoDateGroup;

export interface InlineTaskDates {
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
}

/** Classifies a Tasks-plugin status character into open / closed / important. */
export function classifyTodoStatus(statusChar: string): TodoStatus {
  if (statusChar === "x" || statusChar === "X" || statusChar === "-") return "closed";
  if (statusChar === "!") return "important";
  return "open";
}

const INLINE_DATE_FIELDS: { key: keyof InlineTaskDates; emoji: string }[] = [
  { key: "due", emoji: "📅" },
  { key: "scheduled", emoji: "⏳" },
  { key: "start", emoji: "🛫" },
  { key: "created", emoji: "➕" },
  { key: "done", emoji: "✅" },
  { key: "cancelled", emoji: "❌" },
];

/** Extracts all recognised Tasks-plugin inline date metadata from a todo's text. */
export function extractInlineTaskDates(text: string): InlineTaskDates {
  const dates: InlineTaskDates = {
    due: null, scheduled: null, start: null, created: null, done: null, cancelled: null,
  };
  for (const { key, emoji } of INLINE_DATE_FIELDS) {
    const match = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, "u").exec(text);
    if (match) dates[key] = match[1];
  }
  return dates;
}

/**
 * Resolves the date used for grouping a todo: inline due > scheduled > start
 * dates take priority (AC7); falls back to the note's frontmatter date.
 */
export function resolveTodoDate(text: string, frontmatterDate: string | null): string | null {
  const inline = extractInlineTaskDates(text);
  return inline.due ?? inline.scheduled ?? inline.start ?? frontmatterDate;
}

/** Buckets a resolved date (or null) into a sidebar date group. */
export function dateGroupFor(date: string | null, todayStr: string, weekEndStr: string): TodoDateGroup {
  if (!date) return "undated";
  if (date < todayStr) return "past";
  if (date === todayStr) return "today";
  if (date <= weekEndStr) return "week";
  return "later";
}

/**
 * Resolves the sidebar group a todo belongs to, or null if it should be
 * hidden entirely (closed). Important todos are grouped separately, above
 * all date groups, regardless of their date (AC3).
 */
export function resolveTodoGroup(
  status: TodoStatus,
  date: string | null,
  todayStr: string,
  weekEndStr: string
): TodoGroup | null {
  if (status === "closed") return null;
  if (status === "important") return "important";
  return dateGroupFor(date, todayStr, weekEndStr);
}

/**
 * Rewrites a "- [<char>] text" line's status character to reflect checked
 * state, regardless of the original status character (AC6).
 */
export function setTodoLineChecked(line: string, checked: boolean): string {
  return line.replace(TODO_LINE_REGEX, (_line, _statusChar, rest) => `- [${checked ? "x" : " "}] ${rest}`);
}
