import { describe, expect, it } from "vitest";
import {
  extractDueDate, cleanTodoText, parseTodoLines, resolveTodoDate,
  completeTodoLine, reopenTodoLine, groupForDate, classifyStatus, todoGroupFor,
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

  it("reads the Tasks-plugin scheduled emoji", () => {
    expect(extractDueDate("Mail rausschicken ⏳ 2026-08-21")).toBe("2026-08-21");
  });

  it("reads the Tasks-plugin start emoji", () => {
    expect(extractDueDate("Mail rausschicken 🛫 2026-08-21")).toBe("2026-08-21");
  });

  it("prefers due:: when several are present", () => {
    expect(extractDueDate("x due:: 2026-08-21 📅 2026-09-01")).toBe("2026-08-21");
  });

  it("orders the Tasks emoji as due 📅 > scheduled ⏳ > start 🛫", () => {
    expect(extractDueDate("x 📅 2026-08-21 ⏳ 2026-08-22 🛫 2026-08-23")).toBe("2026-08-21");
    expect(extractDueDate("x ⏳ 2026-08-22 🛫 2026-08-23")).toBe("2026-08-22");
  });

  it("does not treat created/done/cancelled Tasks emoji as a due date", () => {
    expect(extractDueDate("Mail rausschicken ➕ 2026-08-01")).toBeNull();
    expect(extractDueDate("Mail rausschicken ❌ 2026-08-01")).toBeNull();
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

  it("keeps scheduled/start/created/cancelled Tasks emoji as raw text", () => {
    expect(cleanTodoText("Rechnung stellen ⏳ 2026-08-21")).toBe("Rechnung stellen ⏳ 2026-08-21");
    expect(cleanTodoText("Rechnung stellen 🛫 2026-08-21")).toBe("Rechnung stellen 🛫 2026-08-21");
    expect(cleanTodoText("Rechnung stellen ➕ 2026-08-21")).toBe("Rechnung stellen ➕ 2026-08-21");
    expect(cleanTodoText("Rechnung stellen ❌ 2026-08-21")).toBe("Rechnung stellen ❌ 2026-08-21");
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

describe("classifyStatus", () => {
  it("treats the plain space as open", () => {
    expect(classifyStatus(" ")).toBe("open");
  });

  it("treats x/X and - as closed", () => {
    expect(classifyStatus("x")).toBe("closed");
    expect(classifyStatus("X")).toBe("closed");
    expect(classifyStatus("-")).toBe("closed");
  });

  it("treats ! as important", () => {
    expect(classifyStatus("!")).toBe("important");
  });

  it("treats every other Tasks status character as open", () => {
    expect(classifyStatus("/")).toBe("open");
    expect(classifyStatus("?")).toBe("open");
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

  it("marks the done item as closed and the rest as open", () => {
    expect(todos.filter((todo) => todo.status === "closed").map((todo) => todo.text)).toEqual(["Sandbox einbauen"]);
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

describe("parseTodoLines with Tasks-plugin status characters", () => {
  const content = [
    "- [!] Vertrag unterschreiben",
    "- [/] Entwurf schreiben",
    "- [-] Alten Plan verwerfen",
    "- [?] Klären ob nötig",
  ].join("\n");

  const todos = parseTodoLines(content);

  it("classifies each line's status", () => {
    expect(todos.map((todo) => todo.status)).toEqual(["important", "open", "closed", "open"]);
  });

  it("keeps the display text unaffected by the status character", () => {
    expect(todos.map((todo) => todo.text)).toEqual([
      "Vertrag unterschreiben",
      "Entwurf schreiben",
      "Alten Plan verwerfen",
      "Klären ob nötig",
    ]);
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
    expect(completeTodoLine("- [-] abgebrochen", "2026-08-23")).toBe("- [-] abgebrochen");
    expect(completeTodoLine("Fließtext", "2026-08-23")).toBe("Fließtext");
  });

  it("ticks any open Tasks status character, not just the plain space", () => {
    expect(completeTodoLine("- [!] Vertrag unterschreiben", "2026-08-23"))
      .toBe("- [x] Vertrag unterschreiben ✅ 2026-08-23");
    expect(completeTodoLine("- [/] Entwurf schreiben", "2026-08-23"))
      .toBe("- [x] Entwurf schreiben ✅ 2026-08-23");
    expect(completeTodoLine("- [?] Klären ob nötig", "2026-08-23"))
      .toBe("- [x] Klären ob nötig ✅ 2026-08-23");
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

describe("todoGroupFor", () => {
  const today = "2026-08-23";
  const weekEnd = "2026-08-30";

  it("files an important todo under 'important' regardless of its date", () => {
    expect(todoGroupFor("important", today, today, weekEnd)).toBe("important");
    expect(todoGroupFor("important", null, today, weekEnd)).toBe("important");
    expect(todoGroupFor("important", "2026-08-19", today, weekEnd)).toBe("important");
  });

  it("falls back to date grouping for an open todo", () => {
    expect(todoGroupFor("open", today, today, weekEnd)).toBe("today");
    expect(todoGroupFor("open", null, today, weekEnd)).toBe("undated");
  });
});
