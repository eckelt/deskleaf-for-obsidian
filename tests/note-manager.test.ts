import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
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
  vault: {
    meetingsFolder: "meetings",
    customersFolder: "customers",
    peopleFolder: "people",
    projectsFolder: "projects",
    todoFolders: ["meetings", "projects", "customers"],
  },
} as DeskleafSettings;

function appForCreate(options: { templateContent?: string } = {}) {
  const created: { path: string | null; content: string | null } = { path: null, content: null };
  const notesFolder = new TFile();
  notesFolder.path = "notes";
  notesFolder.basename = "notes";
  const meetingsFolder = new TFile();
  meetingsFolder.path = "meetings";
  meetingsFolder.basename = "meetings";
  const templateFile = new TFile();
  templateFile.path = "templates/focus.md";
  templateFile.basename = "focus";

  return {
    created,
    app: {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (path: string) => {
          if (path === "notes") return notesFolder;
          if (path === "meetings") return meetingsFolder;
          if (path === "templates/focus.md" && options.templateContent !== undefined) return templateFile;
          return null;
        },
        read: async (file: TFile) => {
          if (file.path === "templates/focus.md") return options.templateContent ?? "";
          return "";
        },
        createFolder: async () => {},
        create: async (path: string, content: string) => {
          created.path = path;
          created.content = content;
          const file = new TFile();
          file.path = path;
          file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
          return file;
        },
      },
      metadataCache: {
        getFileCache: () => null,
      },
    },
  };
}

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

describe("NoteManager focus notes", () => {
  it("creates focus notes for focus title patterns with the built-in Dataview template", async () => {
    const fixture = appForCreate();
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({
      id: "focus-1",
      title: "Deep Work",
      start: "2026-06-22T09:00:00Z",
      end: "2026-06-22T11:00:00Z",
      body: "",
    }));

    expect(fixture.created.path).toBe("notes/Deep Work.md");
    expect(fixture.created.content).toContain("type: focus");
    expect(fixture.created.content).toContain("## Fokus-Todos");
    expect(fixture.created.content).toContain("```dataviewjs");
    expect(fixture.created.content).toContain('folders.some(f => p.file.path.startsWith(f + "/"))');
    expect(fixture.created.content).toContain('["meetings","projects","customers"]');
    expect(fixture.created.content).toContain("const seed = dv.current().file.path;");
    expect(fixture.created.content).toContain(".slice(0, 3);");
  });

  it("loads templates/focus.md for focus notes", async () => {
    const fixture = appForCreate({ templateContent: "## Eigene Fokusliste\n{{focus_todos}}\n" });
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({
      id: "focus-2",
      title: "Fokus",
      start: "2026-06-22T09:00:00Z",
      end: "2026-06-22T11:00:00Z",
      body: "",
    }));

    expect(fixture.created.content).toContain("type: focus");
    expect(fixture.created.content).toContain("## Eigene Fokusliste");
    expect(fixture.created.content).toContain("```dataviewjs");
  });
});

// ── Brain vault structure ──────────────────────────────────────────

interface VaultNote { path: string; frontmatter: Record<string, unknown>; content?: string }

function brainApp(notes: VaultNote[], options: { existingPaths?: string[] } = {}) {
  const created: { path: string | null; content: string | null } = { path: null, content: null };
  const files = notes.map((note) => {
    const file = new TFile();
    file.path = note.path;
    file.basename = note.path.split("/").pop()!.replace(/\.md$/, "");
    return { file, note };
  });
  const existing = new Set([...(options.existingPaths ?? []), ...notes.map((note) => note.path)]);

  return {
    created,
    app: {
      vault: {
        getMarkdownFiles: () => files.map((entry) => entry.file),
        getAbstractFileByPath: (path: string) => {
          const found = files.find((entry) => entry.file.path === path);
          if (found) return found.file;
          if (existing.has(path)) { const f = new TFile(); f.path = path; return f; }
          return null;
        },
        read: async (file: TFile) => files.find((entry) => entry.file.path === file.path)?.note.content ?? "",
        createFolder: async () => {},
        create: async (path: string, content: string) => {
          created.path = path;
          created.content = content;
          const file = new TFile();
          file.path = path;
          file.basename = path.split("/").pop()!.replace(/\.md$/, "");
          return file;
        },
      },
      metadataCache: {
        getFileCache: (file: TFile) => {
          const found = files.find((entry) => entry.file.path === file.path);
          return found ? { frontmatter: found.note.frontmatter } : null;
        },
      },
    },
  };
}

const nordwind: VaultNote = {
  path: "customers/Nordwind.md",
  frontmatter: { type: "kunde", domains: ["nordwind.de"], status: "aktiv" },
};
const waldemar: VaultNote = {
  path: "people/Wanda Sturm.md",
  frontmatter: { type: "person", email: "wanda.sturm@nordwind.de" },
};

describe("NoteManager vault index", () => {
  it("reads customers, people and projects from their folders by type", () => {
    const fixture = brainApp([
      nordwind,
      waldemar,
      { path: "projects/Benchmark.md", frontmatter: { type: "project" } },
      // Right folder, wrong type — not a customer.
      { path: "customers/README.md", frontmatter: { type: "note" } },
      // Right type, wrong folder — not indexed either.
      { path: "archive/Alt.md", frontmatter: { type: "kunde" } },
    ]);
    const manager = new NoteManager(fixture.app as any, settings);

    expect(manager.getCustomers().map((c) => c.name)).toEqual(["Nordwind"]);
    expect(manager.getCustomers()[0].slug).toBe("nordwind");
    expect(manager.getPeople().map((p) => p.name)).toEqual(["Wanda Sturm"]);
    expect(manager.getProjects().map((p) => p.name)).toEqual(["Benchmark"]);
  });

  it("reads a customer's status so the sidebar can dim inactive ones", () => {
    const fixture = brainApp([{ path: "customers/Alt.md", frontmatter: { type: "kunde", status: "beendet" } }]);
    const manager = new NoteManager(fixture.app as any, settings);
    expect(manager.getCustomers()[0].status).toBe("beendet");
  });

  it("defaults a customer without an explicit status to aktiv", () => {
    const fixture = brainApp([{ path: "customers/Neu.md", frontmatter: { type: "kunde" } }]);
    expect(new NoteManager(fixture.app as any, settings).getCustomers()[0].status).toBe("aktiv");
  });

  it("collects a person's mail addresses from both email and emails", () => {
    const fixture = brainApp([{
      path: "people/X.md",
      frontmatter: { type: "person", email: "a@x.de", emails: ["b@x.de", "c@x.de"] },
    }]);
    expect(new NoteManager(fixture.app as any, settings).getPeople()[0].emails).toEqual(["a@x.de", "b@x.de", "c@x.de"]);
  });
});

describe("NoteManager meeting note creation", () => {
  it("writes a type: termin note into meetings/ with the calendar identity", async () => {
    const fixture = brainApp([nordwind, waldemar]);
    const manager = new NoteManager(
      fixture.app as any,
      settings,
      () => "https://caldav.fastmail.com/dav/calendars/user/nils/x.ics",
    );

    await manager.openOrCreate(event({
      id: "46AAFAE9",
      title: "Nordwind – Kick-off",
      start: "2026-08-21T09:00:00Z",
      end: "2026-08-21T17:00:00Z",
      attendees: ["Wanda Sturm <wanda.sturm@nordwind.de>"],
      body: "Workshop Tag 1.",
      location: "Hamburg",
    }));

    expect(fixture.created.path).toBe("meetings/2026-08-21 Nordwind – Kick-off.md");
    const content = fixture.created.content!;
    expect(content).toContain("type: termin");
    expect(content).toContain('calendar_event_id: "https://caldav.fastmail.com/dav/calendars/user/nils/x.ics"');
    expect(content).toContain('calendar_uid: "46AAFAE9"');
    expect(content).toContain("date: 2026-08-21");
  });

  it("links the matched customer through both kunde and the tag", async () => {
    const fixture = brainApp([nordwind]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({
      id: "u1", title: "Sync", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z",
      attendees: ["someone@nordwind.de"],
    }));

    expect(fixture.created.content).toContain('kunde: "[[Nordwind]]"');
    expect(fixture.created.content).toContain("tags: [kunde/nordwind]");
  });

  it("resolves attendees to their people/ notes", async () => {
    const fixture = brainApp([nordwind, waldemar]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({
      id: "u2", title: "Sync", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z",
      attendees: ["wanda.sturm@nordwind.de", "Fremde Person <x@extern.io>"],
    }));

    expect(fixture.created.content).toContain('teilnehmer: ["[[Wanda Sturm]]", "[[Fremde Person]]"]');
  });

  it("leaves the customer fields out when nothing matches", async () => {
    const fixture = brainApp([nordwind]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({
      id: "u3", title: "Zahnarzt", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z",
    }));

    expect(fixture.created.content).not.toContain("kunde:");
    expect(fixture.created.content).not.toContain("tags:");
  });

  it("omits calendar_event_id when the backend knows no URL", async () => {
    const fixture = brainApp([]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({ id: "u4", title: "Sync", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z" }));

    expect(fixture.created.content).not.toContain("calendar_event_id");
    expect(fixture.created.content).toContain('calendar_uid: "u4"');
  });

  it("splits a recurring instance id into uid and recurrence id", async () => {
    const fixture = brainApp([]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({ id: "UID-1_20260821T090000Z", title: "Weekly", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z" }));

    expect(fixture.created.content).toContain('calendar_uid: "UID-1"');
    expect(fixture.created.content).toContain('calendar_recurrence_id: "20260821T090000Z"');
  });

  it("suffixes rather than overwrites when the filename is taken", async () => {
    const fixture = brainApp([], { existingPaths: ["meetings/2026-08-21 Sync.md"] });
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.openOrCreate(event({ id: "u5", title: "Sync", start: "2026-08-21T09:00:00Z", end: "2026-08-21T10:00:00Z" }));

    expect(fixture.created.path).toBe("meetings/2026-08-21 Sync 2.md");
  });
});

describe("NoteManager note lookup", () => {
  const url = "https://caldav.fastmail.com/dav/calendars/user/nils/x.ics";

  it("resolves by calendar_event_id first", () => {
    const fixture = brainApp([
      { path: "meetings/2026-08-21 A.md", frontmatter: { type: "termin", calendar_event_id: url, calendar_uid: "u", date: "2026-08-21" } },
      { path: "meetings/Falsch.md", frontmatter: { type: "termin", calendar_uid: "u", date: "2026-08-21" } },
    ]);
    const manager = new NoteManager(fixture.app as any, settings, () => url);

    expect(manager.noteExists(event({ id: "u", start: "2026-08-21T09:00:00Z" }))?.path).toBe("meetings/2026-08-21 A.md");
  });

  it("falls back to calendar_uid plus date when no URL is known", () => {
    const fixture = brainApp([
      { path: "meetings/2026-08-21 A.md", frontmatter: { type: "termin", calendar_uid: "u", date: "2026-08-21" } },
      { path: "meetings/2026-08-28 A.md", frontmatter: { type: "termin", calendar_uid: "u", date: "2026-08-28" } },
    ]);
    const manager = new NoteManager(fixture.app as any, settings);

    expect(manager.noteExists(event({ id: "u", start: "2026-08-28T09:00:00Z" }))?.path).toBe("meetings/2026-08-28 A.md");
  });

  it("still finds pre-Brain notes by event-id", () => {
    const fixture = brainApp([{ path: "notes/Alt.md", frontmatter: { "event-id": "legacy-1", title: "Alt", date: "2026-08-21" } }]);
    const manager = new NoteManager(fixture.app as any, settings);

    expect(manager.noteExists(event({ id: "legacy-1", start: "2026-08-21T09:00:00Z" }))?.path).toBe("notes/Alt.md");
  });

  it("returns null when nothing matches", () => {
    const fixture = brainApp([{ path: "meetings/2026-08-21 A.md", frontmatter: { type: "termin", calendar_uid: "other", date: "2026-08-21" } }]);
    expect(new NoteManager(fixture.app as any, settings).noteExists(event({ id: "u", title: "X" }))).toBeNull();
  });

  it("looks up through a note cache the same way", () => {
    const fixture = brainApp([
      { path: "meetings/2026-08-21 A.md", frontmatter: { type: "termin", calendar_uid: "u", date: "2026-08-21" } },
    ]);
    const manager = new NoteManager(fixture.app as any, settings);
    const cache = manager.buildNoteCache();

    expect(manager.lookupInCache(cache, event({ id: "u", start: "2026-08-21T09:00:00Z" }))?.path).toBe("meetings/2026-08-21 A.md");
    expect(manager.lookupInCache(cache, event({ id: "u", start: "2026-09-01T09:00:00Z" }))).toBeNull();
  });
});

describe("NoteManager entity notes", () => {
  it("creates a customer note in the Brain shape", async () => {
    const fixture = brainApp([]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.createCustomerNote("Acme");

    expect(fixture.created.path).toBe("customers/Acme.md");
    expect(fixture.created.content).toContain("type: kunde");
    expect(fixture.created.content).toContain("tags: [kunde/acme]");
    expect(fixture.created.content).toContain("## Termin-Historie");
  });

  it("creates a project note in the Brain shape", async () => {
    const fixture = brainApp([]);
    const manager = new NoteManager(fixture.app as any, settings);

    await manager.createProjectNote("Benchmark");

    expect(fixture.created.path).toBe("projects/Benchmark.md");
    expect(fixture.created.content).toContain("type: project");
  });

  it("returns the existing note instead of overwriting it", async () => {
    const fixture = brainApp([nordwind]);
    const manager = new NoteManager(fixture.app as any, settings);

    const file = await manager.createCustomerNote("Nordwind");

    expect(file.path).toBe("customers/Nordwind.md");
    expect(fixture.created.path).toBeNull();
  });
});

describe("NoteManager.syncEventNote on Brain notes", () => {
  it("updates the calendar identity and never rewrites the authored context", async () => {
    const original = [
      "---",
      "type: termin",
      'calendar_uid: "u"',
      "date: 2026-08-21",
      "---",
      "# Alt",
      "",
      "## Initial context",
      "Handgeschriebene Vorbereitung.",
      "",
      "## Notizen",
      "- wichtig",
      "",
    ].join("\n");
    let content = original;
    const frontmatter: Record<string, unknown> = { type: "termin", calendar_uid: "u", date: "2026-08-21", title: "Alt" };
    const file = new TFile();
    file.path = "meetings/2026-08-21 Alt.md";
    file.basename = "2026-08-21 Alt";
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        read: async () => content,
        modify: async (_f: unknown, next: string) => { content = next; },
      },
      metadataCache: { getFileCache: () => ({ frontmatter }) },
      fileManager: {
        processFrontMatter: async (_f: unknown, fn: (fm: Record<string, unknown>) => void) => fn(frontmatter),
      },
    };
    const manager = new NoteManager(app as any, settings, () => "https://caldav/x.ics");

    await manager.syncEventNote(
      event({ id: "u", title: "Alt", start: "2026-08-21T09:00:00Z" }),
      event({ id: "u", title: "Neu", start: "2026-08-28T09:00:00Z", body: "Neue Beschreibung" }),
    );

    expect(frontmatter).toMatchObject({ title: "Neu", date: "2026-08-28", calendar_event_id: "https://caldav/x.ics" });
    expect(frontmatter["event-id"]).toBeUndefined();
    expect(content).toContain("# Neu");
    expect(content).toContain("Handgeschriebene Vorbereitung.");
    expect(content).not.toContain("Neue Beschreibung");
    expect(content).toContain("## Notizen\n- wichtig");
  });
});

describe("NoteManager frontmatter date handling", () => {
  it("matches a note whose YAML date came back as a Date object", () => {
    const fixture = brainApp([{
      path: "meetings/2026-08-21 A.md",
      // Obsidian's YAML may hand an unquoted `date: 2026-08-21` back as a Date.
      frontmatter: { type: "termin", calendar_uid: "u", date: new Date("2026-08-21T00:00:00Z") },
    }]);
    const manager = new NoteManager(fixture.app as any, settings);

    expect(manager.noteExists(event({ id: "u", start: "2026-08-21T09:00:00Z" }))?.path)
      .toBe("meetings/2026-08-21 A.md");
    expect(manager.lookupInCache(manager.buildNoteCache(), event({ id: "u", start: "2026-08-21T09:00:00Z" }))?.path)
      .toBe("meetings/2026-08-21 A.md");
  });

  it("matches the older datum: field too", () => {
    const fixture = brainApp([{
      path: "meetings/2026-08-21 A.md",
      frontmatter: { type: "termin", calendar_uid: "u", datum: "2026-08-21" },
    }]);
    expect(new NoteManager(fixture.app as any, settings).noteExists(event({ id: "u", start: "2026-08-21T09:00:00Z" }))?.path)
      .toBe("meetings/2026-08-21 A.md");
  });
});
