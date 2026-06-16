import { describe, expect, it } from "vitest";
import { NoteManager } from "../src/note-manager";
import type { CalendarEvent, DeskleafSettings } from "../src/types";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-old",
    title: "Old title",
    start: "2026-06-16T10:00:00Z",
    end: "2026-06-16T11:00:00Z",
    location: "Old room",
    body: "Old description",
    ...overrides,
  };
}

function appWithNote(content: string) {
  const file = { path: "notes/Old title.md", basename: "Old title" };
  let currentContent = content;
  const frontmatter: Record<string, unknown> = {
    "event-id": "event-old",
    title: "Old title",
    date: "2026-06-16",
  };
  return {
    file,
    getContent: () => currentContent,
    getFrontmatter: () => frontmatter,
    app: {
      vault: {
        getMarkdownFiles: () => [file],
        read: async () => currentContent,
        modify: async (_file: unknown, next: string) => { currentContent = next; },
      },
      metadataCache: {
        getFileCache: () => ({ frontmatter }),
      },
      fileManager: {
        processFrontMatter: async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => fn(frontmatter),
      },
    },
  };
}

const settings = {
  templateFolder: "templates",
  notesFolder: "notes",
} as DeskleafSettings;

describe("NoteManager.syncEventNote", () => {
  it("updates frontmatter, heading and description for an existing event note", async () => {
    const fixture = appWithNote([
      "---",
      "event-id: event-old",
      "---",
      "# Old title",
      "",
      "## Beschreibung",
      "Old description",
      "",
      "## Todos",
      "- [ ] Follow up",
      "",
    ].join("\n"));
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.syncEventNote(event(), event({
      id: "event-new",
      title: "New title",
      start: "2026-06-17T12:00:00Z",
      end: "2026-06-17T13:30:00Z",
      location: "New room",
      body: "New description",
    }));

    expect(fixture.getFrontmatter()).toMatchObject({
      "event-id": "event-new",
      title: "New title",
      date: "2026-06-17",
      start: "12:00",
      end: "13:30",
      location: "New room",
    });
    expect(fixture.getContent()).toContain("# New title");
    expect(fixture.getContent()).toContain("## Beschreibung\nNew description\n");
    expect(fixture.getContent()).toContain("## Todos\n- [ ] Follow up");
  });

  it("does not rename headings that no longer match the old event title", async () => {
    const fixture = appWithNote("# Custom heading\n\n## Beschreibung\nOld\n");
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.syncEventNote(event(), event({ title: "New title", body: "New" }));

    expect(fixture.getContent()).toContain("# Custom heading");
    expect(fixture.getContent()).not.toContain("# New title");
  });
});
