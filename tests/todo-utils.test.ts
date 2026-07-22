import { describe, it, expect } from "vitest";
import {
  classifyTodoStatus,
  extractInlineTaskDates,
  resolveTodoDate,
  dateGroupFor,
  resolveTodoGroup,
  setTodoLineChecked,
} from "../src/todo-utils";

describe("classifyTodoStatus", () => {
  it("treats a space as open", () => {
    expect(classifyTodoStatus(" ")).toBe("open");
  });

  it("treats x and X as closed", () => {
    expect(classifyTodoStatus("x")).toBe("closed");
    expect(classifyTodoStatus("X")).toBe("closed");
  });

  it("treats - as closed (cancelled)", () => {
    expect(classifyTodoStatus("-")).toBe("closed");
  });

  it("treats ! as important", () => {
    expect(classifyTodoStatus("!")).toBe("important");
  });

  it("treats / (in progress) as open", () => {
    expect(classifyTodoStatus("/")).toBe("open");
  });

  it("treats any other unknown character as open", () => {
    expect(classifyTodoStatus("?")).toBe("open");
    expect(classifyTodoStatus(">")).toBe("open");
    expect(classifyTodoStatus("<")).toBe("open");
    expect(classifyTodoStatus("*")).toBe("open");
  });
});

describe("extractInlineTaskDates", () => {
  it("extracts a due date (📅)", () => {
    expect(extractInlineTaskDates("Rechnung stellen 📅 2026-07-22").due).toBe("2026-07-22");
  });

  it("extracts a scheduled date (⏳)", () => {
    expect(extractInlineTaskDates("Entwurf schreiben ⏳ 2026-07-22").scheduled).toBe("2026-07-22");
  });

  it("extracts a start date (🛫)", () => {
    expect(extractInlineTaskDates("Reise vorbereiten 🛫 2026-07-22").start).toBe("2026-07-22");
  });

  it("extracts created/done/cancelled dates without using them for grouping", () => {
    const dates = extractInlineTaskDates("Task ➕ 2026-07-01 ✅ 2026-07-22 ❌ 2026-07-23");
    expect(dates.created).toBe("2026-07-01");
    expect(dates.done).toBe("2026-07-22");
    expect(dates.cancelled).toBe("2026-07-23");
  });

  it("returns null for fields with no inline metadata", () => {
    const dates = extractInlineTaskDates("Plain todo with no metadata");
    expect(dates).toEqual({
      due: null, scheduled: null, start: null, created: null, done: null, cancelled: null,
    });
  });
});

describe("resolveTodoDate", () => {
  it("prioritises the due date over scheduled and start dates", () => {
    const text = "Task 📅 2026-07-22 ⏳ 2026-07-23 🛫 2026-07-24";
    expect(resolveTodoDate(text, "2026-08-01")).toBe("2026-07-22");
  });

  it("falls back to the scheduled date when no due date is present", () => {
    const text = "Task ⏳ 2026-07-23 🛫 2026-07-24";
    expect(resolveTodoDate(text, "2026-08-01")).toBe("2026-07-23");
  });

  it("falls back to the start date when no due or scheduled date is present", () => {
    const text = "Task 🛫 2026-07-24";
    expect(resolveTodoDate(text, "2026-08-01")).toBe("2026-07-24");
  });

  it("falls back to the frontmatter date when no inline date is present", () => {
    expect(resolveTodoDate("Plain todo", "2026-08-01")).toBe("2026-08-01");
  });

  it("falls back to null (no date) when neither inline nor frontmatter date exist", () => {
    expect(resolveTodoDate("Plain todo", null)).toBeNull();
  });
});

describe("dateGroupFor", () => {
  const today = "2026-07-22";
  const weekEnd = "2026-07-29";

  it("groups null as undated", () => {
    expect(dateGroupFor(null, today, weekEnd)).toBe("undated");
  });

  it("groups a date before today as past", () => {
    expect(dateGroupFor("2026-07-21", today, weekEnd)).toBe("past");
  });

  it("groups today's date as today", () => {
    expect(dateGroupFor(today, today, weekEnd)).toBe("today");
  });

  it("groups a date within the week as week", () => {
    expect(dateGroupFor("2026-07-25", today, weekEnd)).toBe("week");
  });

  it("groups a date beyond the week as later", () => {
    expect(dateGroupFor("2026-07-30", today, weekEnd)).toBe("later");
  });
});

describe("resolveTodoGroup", () => {
  const today = "2026-07-22";
  const weekEnd = "2026-07-29";

  it("puts important todos in the important group regardless of date", () => {
    expect(resolveTodoGroup("important", "2026-08-01", today, weekEnd)).toBe("important");
    expect(resolveTodoGroup("important", null, today, weekEnd)).toBe("important");
    expect(resolveTodoGroup("important", "2026-07-01", today, weekEnd)).toBe("important");
  });

  it("excludes closed todos entirely", () => {
    expect(resolveTodoGroup("closed", today, today, weekEnd)).toBeNull();
    expect(resolveTodoGroup("closed", null, today, weekEnd)).toBeNull();
  });

  it("groups open todos by date, same as dateGroupFor", () => {
    expect(resolveTodoGroup("open", today, today, weekEnd)).toBe("today");
    expect(resolveTodoGroup("open", null, today, weekEnd)).toBe("undated");
    expect(resolveTodoGroup("open", "2026-07-21", today, weekEnd)).toBe("past");
  });
});

describe("setTodoLineChecked", () => {
  it("rewrites an important todo's status character to x when checked", () => {
    expect(setTodoLineChecked("- [!] Vertrag unterschreiben", true)).toBe("- [x] Vertrag unterschreiben");
  });

  it("rewrites an in-progress todo's status character to x when checked", () => {
    expect(setTodoLineChecked("- [/] Entwurf schreiben", true)).toBe("- [x] Entwurf schreiben");
  });

  it("rewrites an unknown status character to x when checked", () => {
    expect(setTodoLineChecked("- [?] Klären ob nötig", true)).toBe("- [x] Klären ob nötig");
  });

  it("rewrites a checked todo back to open when unchecked", () => {
    expect(setTodoLineChecked("- [x] Vertrag unterschreiben", false)).toBe("- [ ] Vertrag unterschreiben");
  });

  it("leaves non-todo lines unchanged", () => {
    expect(setTodoLineChecked("Just a regular line", true)).toBe("Just a regular line");
  });
});
