import { describe, it, expect } from "vitest";
import {
  classifyTodoStatus,
  extractInlineDate,
  resolveTodoDate,
  groupTodos,
  applyTodoToggle,
} from "../src/todo-utils";

describe("classifyTodoStatus", () => {
  it("treats a space as open", () => {
    expect(classifyTodoStatus(" ")).toBe("open");
  });

  it("treats x and X as closed", () => {
    expect(classifyTodoStatus("x")).toBe("closed");
    expect(classifyTodoStatus("X")).toBe("closed");
  });

  it("treats - (cancelled) as closed", () => {
    expect(classifyTodoStatus("-")).toBe("closed");
  });

  it("treats ! (important) as its own status", () => {
    expect(classifyTodoStatus("!")).toBe("important");
  });

  it("treats / (in progress) as open", () => {
    expect(classifyTodoStatus("/")).toBe("open");
  });

  it("treats any unknown status char as open", () => {
    expect(classifyTodoStatus("?")).toBe("open");
  });
});

describe("extractInlineDate", () => {
  it("extracts a 📅 due date", () => {
    expect(extractInlineDate("Rechnung stellen 📅 2026-07-22")).toBe("2026-07-22");
  });

  it("extracts a ⏳ scheduled date", () => {
    expect(extractInlineDate("Entwurf schreiben ⏳ 2026-07-24")).toBe("2026-07-24");
  });

  it("extracts a 🛫 start date", () => {
    expect(extractInlineDate("Reise vorbereiten 🛫 2026-08-01")).toBe("2026-08-01");
  });

  it("prioritises 📅 over ⏳ and 🛫", () => {
    const text = "Task 🛫 2026-07-01 ⏳ 2026-07-10 📅 2026-07-20";
    expect(extractInlineDate(text)).toBe("2026-07-20");
  });

  it("prioritises ⏳ over 🛫 when no 📅 is present", () => {
    const text = "Task 🛫 2026-07-01 ⏳ 2026-07-10";
    expect(extractInlineDate(text)).toBe("2026-07-10");
  });

  it("ignores ➕/✅/❌ metadata", () => {
    expect(extractInlineDate("Task ➕ 2026-07-01 ✅ 2026-07-05 ❌ 2026-07-06")).toBeNull();
  });

  it("returns null when no inline date is present", () => {
    expect(extractInlineDate("Klären ob nötig")).toBeNull();
  });
});

describe("resolveTodoDate", () => {
  it("prefers the inline date over the frontmatter date", () => {
    expect(resolveTodoDate("Rechnung stellen 📅 2026-07-22", "2026-08-01")).toBe("2026-07-22");
  });

  it("falls back to the frontmatter date when no inline date is present", () => {
    expect(resolveTodoDate("Entwurf schreiben", "2026-07-23")).toBe("2026-07-23");
  });

  it("falls back to null (Ohne Datum) when neither is present", () => {
    expect(resolveTodoDate("Klären ob nötig", null)).toBeNull();
  });
});

describe("groupTodos", () => {
  const today = new Date(2026, 6, 22); // 2026-07-22

  it("puts important todos in their own group, not in a date group", () => {
    const todos = [{ status: "important" as const, date: "2026-07-22" }];
    const groups = groupTodos(todos, today);
    expect(groups.important).toEqual(todos);
    expect(groups.today).toEqual([]);
  });

  it("excludes closed todos entirely", () => {
    const todos = [
      { status: "closed" as const, date: "2026-07-22" },
      { status: "closed" as const, date: null },
    ];
    const groups = groupTodos(todos, today);
    expect(Object.values(groups).flat()).toEqual([]);
  });

  it("treats an in-progress todo as an ordinary open todo in its date group", () => {
    const todo = { status: "open" as const, date: "2026-07-22" };
    const groups = groupTodos([todo], today);
    expect(groups.today).toEqual([todo]);
  });

  it("buckets open todos into today/week/later/undated/past", () => {
    const undated = { status: "open" as const, date: null };
    const past = { status: "open" as const, date: "2026-07-20" };
    const todayTodo = { status: "open" as const, date: "2026-07-22" };
    const week = { status: "open" as const, date: "2026-07-27" };
    const later = { status: "open" as const, date: "2026-08-15" };
    const groups = groupTodos([undated, past, todayTodo, week, later], today);
    expect(groups.undated).toEqual([undated]);
    expect(groups.past).toEqual([past]);
    expect(groups.today).toEqual([todayTodo]);
    expect(groups.week).toEqual([week]);
    expect(groups.later).toEqual([later]);
  });
});

describe("applyTodoToggle", () => {
  it("checking a todo with any open status char writes [x]", () => {
    expect(applyTodoToggle("- [!] Vertrag unterschreiben", true)).toBe("- [x] Vertrag unterschreiben");
    expect(applyTodoToggle("- [/] Entwurf schreiben", true)).toBe("- [x] Entwurf schreiben");
    expect(applyTodoToggle("- [?] Klären ob nötig", true)).toBe("- [x] Klären ob nötig");
    expect(applyTodoToggle("- [ ] Plain todo", true)).toBe("- [x] Plain todo");
  });

  it("unchecking a done todo restores [ ]", () => {
    expect(applyTodoToggle("- [x] Vertrag unterschreiben", false)).toBe("- [ ] Vertrag unterschreiben");
  });
});
