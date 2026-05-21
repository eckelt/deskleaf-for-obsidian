import { App, TFile, normalizePath } from "obsidian";
import type { CalendarEvent, NoteType, DeskleafSettings } from "./types";
import { toDateStr, toTimeStr, parseDate, addDays } from "./date-utils";
import { toArray, normalizeAttendee, sanitizeFilename, cleanBody } from "./note-utils";

export class NoteManager {
  constructor(private app: App, private settings: DeskleafSettings) {}

  /**
   * Find an existing note for this event by scanning frontmatter event-id.
   * This is the primary lookup — filename is not load-bearing.
   */
  noteExists(event: CalendarEvent): TFile | null {
    const date = event.start.slice(0, 10);
    let titleDateMatch: TFile | null = null;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;
      const ids = toArray(fm["event-id"]);
      if (ids.includes(event.id)) return f;
      // Fallback for notes created with older event-id formats (slug or colon-based)
      if (!titleDateMatch && fm.title === event.title && fm.date === date) titleDateMatch = f;
    }
    return titleDateMatch;
  }

  /**
   * Build a snapshot Map<eventId, TFile> for the current render cycle.
   * Callers that iterate over many events should use this once instead of
   * calling noteExists() per event to avoid O(n²) vault scans.
   */
  buildNoteCache(): Map<string, TFile> {
    const cache = new Map<string, TFile>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;
      for (const id of toArray(fm["event-id"])) cache.set(id, f);
    }
    return cache;
  }

  /** Open or create the note for the given event. Returns the file and whether it was just created. */
  async openOrCreate(event: CalendarEvent): Promise<{ file: TFile; isNew: boolean }> {
    const existing = this.noteExists(event);
    if (existing) {
      await this.patchDescription(existing, event);
      return { file: existing, isNew: false };
    }
    return { file: await this.createNote(event), isNew: true };
  }

  private async patchDescription(file: TFile, event: CalendarEvent): Promise<void> {
    const cleaned = cleanBody(event.body);
    if (!cleaned) return;
    const content = await this.app.vault.read(file);
    if (content.includes("## Beschreibung")) return; // already patched
    const section = `## Beschreibung\n${cleaned}\n\n`;
    // Insert before the first ## heading after the frontmatter closing ---
    const fmEnd = content.indexOf("\n---", 3);
    const insertAt = fmEnd === -1 ? 0 : fmEnd + 4;
    const patched = content.slice(0, insertAt) + "\n" + section + content.slice(insertAt).replace(/^\n/, "");
    await this.app.vault.modify(file, patched);
  }

  private async createNote(event: CalendarEvent): Promise<TFile> {
    const path = await this.resolveNewPath(event);
    const type = this.inferType(event);
    const content = await this.renderTemplate(event, type, "");

    const folder = this.settings.notesFolder;
    if (!this.app.vault.getAbstractFileByPath(folder))
      await this.app.vault.createFolder(folder);

    return this.app.vault.create(path, content);
  }

  /**
   * Determine the file path for a new note.
   * Preferred: [notesFolder]/[Title].md
   * Fallback if that name is already taken by a different event: [Title] YYYY-MM-DD.md
   */
  private async resolveNewPath(event: CalendarEvent): Promise<string> {
    const folder = this.settings.notesFolder;
    const base = sanitizeFilename(event.title);
    const preferred = normalizePath(`${folder}/${base}.md`);

    const existing = this.app.vault.getAbstractFileByPath(preferred);
    if (!existing) return preferred;

    // File exists — is it owned by a different event?
    const cache = this.app.metadataCache.getFileCache(existing as TFile);
    if (cache?.frontmatter?.["event-id"] === event.id) return preferred; // same event

    // Disambiguation: append date
    const date = event.start.slice(0, 10);
    return normalizePath(`${folder}/${base} ${date}.md`);
  }

  private inferType(event: CalendarEvent): NoteType {
    const t = event.title.toLowerCase();
    if (t.includes("interview") || t.includes("bewerbung")) return "interview";
    if (event.isRecurring) return "recurring";
    return "meeting";
  }

  private buildAttendeesList(event: CalendarEvent): string {
    return (event.attendees ?? []).map((a) => `- [[${normalizeAttendee(a)}]]`).join("\n") || "- ";
  }

  private buildBodySection(event: CalendarEvent): string {
    const cleaned = cleanBody(event.body);
    return cleaned ? `## Beschreibung\n${cleaned}\n\n` : "";
  }

  private async renderTemplate(event: CalendarEvent, type: NoteType, _carriedTodos: string): Promise<string> {
    const frontmatter = this.buildFrontmatter(event, type);
    const templateContent = await this.loadTemplate(type);

    const body = templateContent
      .replace(/\{\{title\}\}/g, event.title)
      .replace(/\{\{date\}\}/g, event.start.slice(0, 10))
      .replace(/\{\{attendees\}\}/g, this.buildAttendeesList(event))
      .replace(/\{\{location\}\}/g, event.location ?? "")
      .replace(/\{\{body\}\}/g, this.buildBodySection(event))
      .replace(/\{\{carried_todos\}\}/g, this.buildCarriedTodosQuery(event));

    return `${frontmatter}\n${body}`;
  }

  /**
   * Returns a DataviewJS block that live-queries open todos from older instances
   * of the same recurring event. No physical copy → no duplication.
   */
  private buildCarriedTodosQuery(event: CalendarEvent): string {
    const folder = this.settings.notesFolder;
    const date = event.start.slice(0, 10);
    return (
      "```dataviewjs\n" +
      `const title = dv.current().title;\n` +
      `const date = dv.current().date;\n` +
      `const tasks = dv.pages('"${folder}"')\n` +
      `  .where(p => p.title === title && p.date < date)\n` +
      `  .file.tasks.where(t => !t.completed);\n` +
      `if (tasks.length > 0) dv.taskList(tasks, false);\n` +
      `else dv.paragraph("_Keine offenen Todos aus vorherigen Instanzen._");\n` +
      "```"
    );
  }

  private buildFrontmatter(event: CalendarEvent, type: NoteType): string {
    const date = event.start.slice(0, 10);
    const attendees = event.attendees ?? [];
    const lines = [
      "---",
      `event-id: "${event.id}"`,
      `title: "${event.title.replace(/"/g, '\\"')}"`,
      `date: "${date}"`,
      `start: "${toTimeStr(event.start)}"`,
      `end: "${toTimeStr(event.end)}"`,
      `location: "${(event.location ?? "").replace(/"/g, '\\"')}"`,
      `attendees: [${attendees.map((a) => `"[[${normalizeAttendee(a)}]]"`).join(", ")}]`,
      `type: ${type}`,
      `toBeRemoved: false`,
      `removalDate: null`,
      `topics: []`,
      "---",
    ];
    return lines.join("\n");
  }

  private async loadTemplate(type: NoteType): Promise<string> {
    const path = normalizePath(`${this.settings.templateFolder}/${type}.md`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return this.app.vault.read(file);
    return this.defaultTemplate(type);
  }

  private defaultTemplate(type: NoteType): string {
    switch (type) {
      case "meeting":    return `{{body}}## Agenda\n-\n\n## Notizen\n\n## Todos\n- [ ]\n\n## Entscheidungen\n`;
      case "interview":  return `## Kandidat\nName: {{title}}\nPosition:\nQuelle:\n\n## Lebenslauf-Highlights\n\n## Fragen\n\n## Eindrücke\n\n## Todos\n- [ ]\n\n## Bewertung\n[ ] Weiterführen  [ ] Absage\n`;
      case "recurring":  return `## Offene Todos (aus letzter Instanz)\n{{carried_todos}}\n\n## Status letztes Mal\n\n## Heute\n\n## Todos\n- [ ]\n`;
      case "task":       return `## Kontext\n\n## Notizen\n\n## Todos\n- [ ]\n`;
    }
  }

  async markForRemoval(file: TFile, remove: boolean): Promise<void> {
    const removalDate = remove ? toDateStr(addDays(new Date(), 180)) : null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.toBeRemoved = remove;
      fm.removalDate = removalDate;
    });
  }

  async runRemovalCleanup(): Promise<void> {
    const today = toDateStr(new Date());
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.toBeRemoved && fm?.removalDate && fm.removalDate <= today) {
        await this.app.vault.trash(f, true);
      }
    }
  }
}
