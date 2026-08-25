// Pure todo parsing, mirroring list_open_todos / complete_todo in the Deskleaf MCP.
//
// The canonical due syntax in the vault is `due:: yyyy-mm-dd`; the Tasks-plugin
// emoji and a trailing date link are accepted because both already occur in the
// vault. Completion stamps `✅ yyyy-mm-dd`, which is what complete_todo writes.
//
// Status characters follow the Tasks community plugin: any character between the brackets is valid, and anything but x/X/-/! is treated as open.

import type { TodoStatus, TodoGroup } from "./types";

export const TODO_LINE_PATTERN = /^(\s*[-*]\s+)\[(.)\]\s+(.*\S)\s*$/;
export const TODO_DONE_PATTERN = /^(\s*[-*]\s+)\[[xX]\]\s+(.*\S)\s*$/;

export function classifyStatus(char: string): TodoStatus {
  if (char === "x" || char === "X" || char === "-") return "closed";
  if (char === "!") return "important";
  return "open";
}

export interface ParsedTodo {
  /** Display text: due markers and the done date stripped out. */
  text: string;
  /** The line as written, minus the checkbox prefix. */
  raw: string;
  status: TodoStatus;
  /** Line-level due date, or null when the line carries none. */
  due: string | null;
  lineIndex: number;
}

/** Priority order for Tasks-plugin inline dates: due 📅 > scheduled ⏳ > start 🛫. */
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
    const match = TODO_LINE_PATTERN.exec(lines[index]);
    if (!match) continue;
    todos.push({
      text: cleanTodoText(match[3]),
      raw: match[3],
      status: classifyStatus(match[2]),
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

/** `- [ ] x` → `- [x] x ✅ 2026-08-23`; any non-closed status char is accepted, not just the plain space. */
export function completeTodoLine(line: string, today: string): string {
  const match = TODO_LINE_PATTERN.exec(line);
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

export function groupForDate(date: string | null, today: string, weekEnd: string): TodoGroup {
  if (!date) return "undated";
  if (date < today) return "past";
  if (date === today) return "today";
  if (date <= weekEnd) return "week";
  return "later";
}

/** The group an open/important todo is filed under; `important` wins over date grouping. */
export function todoGroupFor(status: TodoStatus, date: string | null, today: string, weekEnd: string): TodoGroup {
  if (status === "important") return "important";
  return groupForDate(date, today, weekEnd);
}
