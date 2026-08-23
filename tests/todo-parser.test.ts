import { describe, expect, it } from "vitest";
import {
  extractDueDate, cleanTodoText, parseTodoLines, resolveTodoDate,
  completeTodoLine, reopenTodoLine, groupForDate,
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
