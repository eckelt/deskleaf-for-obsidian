import { describe, expect, it } from "vitest";
import {
  extractDueDate, cleanTodoText, parseTodoLines, resolveTodoDate,
  completeTodoLine, reopenTodoLine, groupForDate, groupForTodo, classifyStatus,
} from "../src/todo-parser";

describe("extractDueDate", () => {
  it("reads the canonical due:: syntax", () => {
    expect(extractDueDate("Mail rausschicken due:: 2026-08-21")).toBe("2026-08-21");
  });

  it("reads the Tasks-plugin emoji", () => {
    expect(extractDueDate("Mail rausschicken 📅 2026-08-21")).toBe("2026-08-21");
  });

  it("reads a trailing date link", () => {
    expect(extractDueDate("Mail rausschicken [[2026-08-21]]")).toBe("2026-08-21");
  });

  it("prefers due:: when several are present", () => {
    expect(extractDueDate("x due:: 2026-08-21 📅 2026-09-01")).toBe("2026-08-21");
  });

  it("returns null when the line carries no date", () => {
    expect(extractDueDate("Mail rausschicken")).toBeNull();
    expect(extractDueDate("Version 2026-13-45 bauen")).toBeNull();
  });

  it("reads the Tasks-plugin scheduled emoji", () => {
    expect(extractDueDate("Mail rausschicken ⏳ 2026-08-21")).toBe("2026-08-21");
  });

  it("reads the Tasks-plugin start emoji", () => {
    expect(extractDueDate("Mail rausschicken 🛫 2026-08-21")).toBe("2026-08-21");
  });

  it("prefers 📅 over ⏳ and 🛫 when several are present", () => {
    expect(extractDueDate("x 📅 2026-08-21 ⏳ 2026-08-22 🛫 2026-08-23")).toBe("2026-08-21");
  });

  it("prefers ⏳ over 🛫 when 📅 is absent", () => {
    expect(extractDueDate("x ⏳ 2026-08-22 🛫 2026-08-23")).toBe("2026-08-22");
  });

  it("ignores ➕/✅/❌ metadata for grouping purposes", () => {
    expect(extractDueDate("x ➕ 2026-08-01 ✅ 2026-08-02 ❌ 2026-08-03")).toBeNull();
  });
});

describe("classifyStatus", () => {
  it("treats a space as open", () => {
    expect(classifyStatus(" ")).toBe("open");
  });

  it("treats x/X as closed", () => {
    expect(classifyStatus("x")).toBe("closed");
    expect(classifyStatus("X")).toBe("closed");
  });

  it("treats - as closed (cancelled)", () => {
    expect(classifyStatus("-")).toBe("closed");
  });

  it("treats ! as important", () => {
    expect(classifyStatus("!")).toBe("important");
  });

  it("treats any other status character as open", () => {
    expect(classifyStatus("/")).toBe("open");
    expect(classifyStatus("?")).toBe("open");
  });
});

describe("cleanTodoText", () => {
  it("strips every due marker form", () => {
    expect(cleanTodoText("Mail rausschicken due:: 2026-08-21")).toBe("Mail rausschicken");
    expect(cleanTodoText("Mail rausschicken 📅 2026-08-21")).toBe("Mail rausschicken");
    expect(cleanTodoText("Mail rausschicken [[2026-08-21]]")).toBe("Mail rausschicken");
    expect(cleanTodoText("Mail rausschicken (due:: 2026-08-21)")).toBe("Mail rausschicken");
  });

  it("strips a done date too", () => {
    expect(cleanTodoText("Mail raus ✅ 2026-08-21")).toBe("Mail raus");
  });

  it("collapses the gap the removal leaves behind", () => {
    expect(cleanTodoText("Mail due:: 2026-08-21 rausschicken")).toBe("Mail rausschicken");
  });

  it("keeps a date that is part of the text", () => {
    expect(cleanTodoText("Rechnung für 2026-08 stellen")).toBe("Rechnung für 2026-08 stellen");
  });
});

describe("parseTodoLines", () => {
  const content = [
    "# Termin",
    "",
    "## Todos bis nächstes Mal",
    "",
    "- [ ] Konsolidierte Mail an Wanda due:: 2026-08-21",
    "- [ ] Zeitbudget klären",
    "  - [ ] Eingerückter Unterpunkt",
    "* [ ] Sternchen-Liste",
    "- [x] Sandbox einbauen ✅ 2026-08-19",
    "- [ ]",
    "Kein Todo - [ ] mitten im Satz",
  ].join("\n");

  const todos = parseTodoLines(content);

  it("finds open and done items, indented and star-prefixed alike", () => {
    expect(todos.map((todo) => todo.text)).toEqual([
      "Konsolidierte Mail an Wanda",
      "Zeitbudget klären",
      "Eingerückter Unterpunkt",
      "Sternchen-Liste",
      "Sandbox einbauen",
    ]);
  });

  it("marks the done item as checked and the rest as open", () => {
    expect(todos.filter((todo) => todo.checked).map((todo) => todo.text)).toEqual(["Sandbox einbauen"]);
  });

  it("reads the per-line due date", () => {
    expect(todos[0].due).toBe("2026-08-21");
    expect(todos[1].due).toBeNull();
  });

  it("reports the line index so the file can be patched in place", () => {
    expect(todos[0].lineIndex).toBe(4);
  });

  it("ignores an empty checkbox and a checkbox mid-sentence", () => {
    expect(todos).toHaveLength(5);
  });
});

describe("parseTodoLines — Tasks-plugin status characters", () => {
  it("recognises ! as important and open (not checked)", () => {
    const [todo] = parseTodoLines("- [!] Vertrag unterschreiben");
    expect(todo.important).toBe(true);
    expect(todo.checked).toBe(false);
  });

  it("recognises / (in progress) as open, not important", () => {
    const [todo] = parseTodoLines("- [/] Entwurf schreiben");
    expect(todo.checked).toBe(false);
    expect(todo.important).toBe(false);
  });

  it("recognises - (cancelled) as closed", () => {
    const [todo] = parseTodoLines("- [-] Alten Plan verwerfen");
    expect(todo.checked).toBe(true);
    expect(todo.important).toBe(false);
  });

  it("recognises an unknown status character (e.g. ?) as open", () => {
    const [todo] = parseTodoLines("- [?] Klären ob nötig");
    expect(todo.checked).toBe(false);
    expect(todo.important).toBe(false);
  });

  it("recognises ➕/❌ inline metadata without letting it affect the due date", () => {
    const [todo] = parseTodoLines("- [ ] Rechnung stellen ➕ 2026-08-01 ❌ 2026-08-03");
    expect(todo.due).toBeNull();
  });
});

describe("resolveTodoDate", () => {
  const [dated, undated] = parseTodoLines("- [ ] a due:: 2026-08-21\n- [ ] b");

  it("prefers the line's own due date over the note's", () => {
    expect(resolveTodoDate(dated, "2026-09-01")).toBe("2026-08-21");
  });

  it("falls back to the note date", () => {
    expect(resolveTodoDate(undated, "2026-09-01")).toBe("2026-09-01");
  });

  it("stays undated when neither has a date", () => {
    expect(resolveTodoDate(undated, null)).toBeNull();
  });
});

describe("completeTodoLine", () => {
  it("ticks the box and stamps the done date", () => {
    expect(completeTodoLine("- [ ] Mail raus", "2026-08-23")).toBe("- [x] Mail raus ✅ 2026-08-23");
  });

  it("keeps the due date on the line", () => {
    expect(completeTodoLine("- [ ] Mail raus due:: 2026-08-21", "2026-08-23"))
      .toBe("- [x] Mail raus due:: 2026-08-21 ✅ 2026-08-23");
  });

  it("does not stamp a second date", () => {
    expect(completeTodoLine("- [ ] Mail raus ✅ 2026-08-19", "2026-08-23"))
      .toBe("- [x] Mail raus ✅ 2026-08-19");
  });

  it("preserves indentation and the bullet character", () => {
    expect(completeTodoLine("  * [ ] Mail raus", "2026-08-23")).toBe("  * [x] Mail raus ✅ 2026-08-23");
  });

  it("ticks the box regardless of the original open status character", () => {
    expect(completeTodoLine("- [!] Vertrag unterschreiben", "2026-08-25"))
      .toBe("- [x] Vertrag unterschreiben ✅ 2026-08-25");
    expect(completeTodoLine("- [/] Entwurf schreiben", "2026-08-25"))
      .toBe("- [x] Entwurf schreiben ✅ 2026-08-25");
    expect(completeTodoLine("- [?] Klären ob nötig", "2026-08-25"))
      .toBe("- [x] Klären ob nötig ✅ 2026-08-25");
  });

  it("leaves an already-closed line (done or cancelled) untouched", () => {
    expect(completeTodoLine("- [-] Alten Plan verwerfen", "2026-08-25")).toBe("- [-] Alten Plan verwerfen");
  });

  it("leaves a line that is not an open todo untouched", () => {
    expect(completeTodoLine("- [x] schon fertig", "2026-08-23")).toBe("- [x] schon fertig");
    expect(completeTodoLine("Fließtext", "2026-08-23")).toBe("Fließtext");
  });
});

describe("reopenTodoLine", () => {
  it("unticks and drops the done date", () => {
    expect(reopenTodoLine("- [x] Mail raus ✅ 2026-08-23")).toBe("- [ ] Mail raus");
  });

  it("keeps the due date when reopening", () => {
    expect(reopenTodoLine("- [x] Mail raus due:: 2026-08-21 ✅ 2026-08-23"))
      .toBe("- [ ] Mail raus due:: 2026-08-21");
  });

  it("round-trips with completeTodoLine", () => {
    const original = "  - [ ] Mail raus due:: 2026-08-21";
    expect(reopenTodoLine(completeTodoLine(original, "2026-08-23"))).toBe(original);
  });

  it("leaves a line that is not a done todo untouched", () => {
    expect(reopenTodoLine("- [ ] offen")).toBe("- [ ] offen");
  });
});

describe("groupForDate", () => {
  const today = "2026-08-23";
  const weekEnd = "2026-08-30";

  it("buckets by due date", () => {
    expect(groupForDate("2026-08-19", today, weekEnd)).toBe("past");
    expect(groupForDate(today, today, weekEnd)).toBe("today");
    expect(groupForDate("2026-08-27", today, weekEnd)).toBe("week");
    expect(groupForDate(weekEnd, today, weekEnd)).toBe("week");
    expect(groupForDate("2026-09-15", today, weekEnd)).toBe("later");
    expect(groupForDate(null, today, weekEnd)).toBe("undated");
  });
});

describe("groupForTodo", () => {
  const today = "2026-08-23";
  const weekEnd = "2026-08-30";

  it("puts an important todo in the important group, not its date group", () => {
    expect(groupForTodo(true, today, today, weekEnd)).toBe("important");
    expect(groupForTodo(true, null, today, weekEnd)).toBe("important");
  });

  it("falls back to date-based grouping when not important", () => {
    expect(groupForTodo(false, today, today, weekEnd)).toBe("today");
    expect(groupForTodo(false, null, today, weekEnd)).toBe("undated");
  });
});
