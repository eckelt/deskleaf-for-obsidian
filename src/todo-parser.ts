// Pure todo parsing, mirroring list_open_todos / complete_todo in the Deskleaf MCP.
//
// The canonical due syntax in the vault is `due:: yyyy-mm-dd`; the Tasks-plugin
// emoji and a trailing date link are accepted because both already occur in the
// vault. Completion stamps `✅ yyyy-mm-dd`, which is what complete_todo writes.
//
// The Tasks community plugin defines many status characters beyond ` `/`x`
// (`!`, `/`, `-`, `?`, ...). `TODO_PATTERN` matches any single character so a
// line is recognised as a todo regardless of which status collection wrote it;
// `classifyStatus` is the only place that assigns meaning to a given character.

export const TODO_PATTERN = /^(\s*[-*]\s+)\[(.)\]\s+(.*\S)\s*$/;
export const TODO_DONE_PATTERN = /^(\s*[-*]\s+)\[[xX]\]\s+(.*\S)\s*$/;

export type TodoStatus = "open" | "closed" | "important";

const CLOSED_STATUS_CHARS = new Set(["x", "X", "-"]);

/** `x`/`X` (done) and `-` (cancelled) are both "closed"; `!` is "important"; everything else is "open". */
export function classifyStatus(statusChar: string): TodoStatus {
  if (CLOSED_STATUS_CHARS.has(statusChar)) return "closed";
  if (statusChar === "!") return "important";
  return "open";
}

export interface ParsedTodo {
  /** Display text: due markers and the done date stripped out. */
  text: string;
  /** The line as written, minus the checkbox prefix. */
  raw: string;
  checked: boolean;
  important: boolean;
  /** Line-level due date, or null when the line carries none. */
  due: string | null;
  lineIndex: number;
}

export function extractDueDate(text: string): string | null {
  return (
    text.match(/due::\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    text.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    text.match(/⏳\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    text.match(/🛫\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    text.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/)?.[1] ??
    null
  );
}

export function cleanTodoText(text: string): string {
  // Each marker is replaced by a space, not by nothing: the patterns eat the
  // whitespace on both sides, so removing a mid-line `due::` outright would
  // weld the surrounding words together. The collapse and trim below undo the
  // extra space, leaving the common trailing case unchanged.
  return text
    .replace(/[[(]?\s*due::\s*\d{4}-\d{2}-\d{2}\s*[\])]?/g, " ")
    .replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\s*\[\[\d{4}-\d{2}-\d{2}\]\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseTodoLines(content: string): ParsedTodo[] {
  const todos: ParsedTodo[] = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const match = TODO_PATTERN.exec(lines[index]);
    if (!match) continue;
    const status = classifyStatus(match[2]);
    todos.push({
      text: cleanTodoText(match[3]),
      raw: match[3],
      checked: status === "closed",
      important: status === "important",
      due: extractDueDate(match[3]),
      lineIndex: index,
    });
  }
  return todos;
}

/**
 * The date a todo is filed under: its own `due::` first, the note's date only as
 * a fallback. Meeting notes carry `date:` (MCP) or `datum:` (older template), so
 * an undated todo in a meeting note still lands on that meeting's day.
 */
export function resolveTodoDate(todo: ParsedTodo, noteDate: string | null): string | null {
  return todo.due ?? noteDate;
}

/** `- [<any open status>] x` → `- [x] x ✅ 2026-08-23`, without ever stamping a second date. */
export function completeTodoLine(line: string, today: string): string {
  const match = TODO_PATTERN.exec(line);
  if (!match || classifyStatus(match[2]) === "closed") return line;
  const doneDate = /✅\s*\d{4}-\d{2}-\d{2}/.test(match[3]) ? "" : ` ✅ ${today}`;
  return `${match[1]}[x] ${match[3]}${doneDate}`;
}

/** The inverse: unchecking drops the done date the plugin (or the MCP) stamped. */
export function reopenTodoLine(line: string): string {
  const match = TODO_DONE_PATTERN.exec(line);
  if (!match) return line;
  const text = match[2].replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, "").trimEnd();
  return `${match[1]}[ ] ${text}`;
}

export type TodoGroup = "important" | "past" | "today" | "week" | "later" | "undated";

export function groupForDate(date: string | null, today: string, weekEnd: string): TodoGroup {
  if (!date) return "undated";
  if (date < today) return "past";
  if (date === today) return "today";
  if (date <= weekEnd) return "week";
  return "later";
}

/** An important todo lives only in the "important" group, never additionally in its date group. */
export function groupForTodo(important: boolean, date: string | null, today: string, weekEnd: string): TodoGroup {
  return important ? "important" : groupForDate(date, today, weekEnd);
}
