import { App, TFile, normalizePath } from "obsidian";
import type { CalendarEvent, NoteType, DeskleafSettings, CustomerRef, PersonRef, ProjectRef } from "./types";
import { toDateStr, toTimeStr, addDays } from "./date-utils";
import { toArray, normalizeAttendee, cleanBody } from "./note-utils";
import {
  slugify, brainLink, matchCustomer, matchPerson, displayName,
  meetingFilename, sanitizeNoteName, renderMeetingNote, renderCustomerNote,
  renderProjectNote, renderPersonNote, DEFAULT_MEETING_TEMPLATE,
} from "./brain-vault";

/**
 * Owns the vault side of a calendar event.
 *
 * Notes are written in the Brain structure shared with the Deskleaf MCP:
 * `meetings/YYYY-MM-DD Titel.md` with `type: termin` and the calendar identity
 * (`calendar_event_id` / `calendar_uid`) the MCP resolves notes by. Pre-Brain
 * notes carrying `event-id` are still found, so nothing existing goes dark.
 */
/** A frontmatter flag is done when it says so — as a boolean or as plain text. */
function isDoneFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "yes", "ja", "done", "abgeschlossen"].includes(value.trim().toLowerCase());
}

export class NoteManager {
  constructor(
    private app: App,
    private settings: DeskleafSettings,
    /** Absolute CalDAV URL of an event, when the active backend knows one. */
    private eventUrl: (id: string) => string | null = () => null,
  ) {}

  // ── Vault index ──────────────────────────────────────────────────

  private notesIn(folder: string, type: string): TFile[] {
    const prefix = `${folder}/`;
    return this.app.vault.getMarkdownFiles().filter((file) => {
      if (!file.path.startsWith(prefix)) return false;
      return this.app.metadataCache.getFileCache(file)?.frontmatter?.type === type;
    });
  }

  getCustomers(): CustomerRef[] {
    return this.notesIn(this.settings.vault.customersFolder, "kunde").map((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      return {
        name: file.basename,
        slug: slugify(file.basename),
        path: file.path,
        domains: toArray(fm.domains),
        status: typeof fm.status === "string" ? fm.status : "aktiv",
        logo: typeof fm.logo === "string" ? fm.logo : undefined,
      };
    });
  }

  getPeople(): PersonRef[] {
    return this.notesIn(this.settings.vault.peopleFolder, "person").map((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      return {
        name: file.basename,
        path: file.path,
        emails: [...toArray(fm.email), ...toArray(fm.emails)].filter(Boolean),
      };
    });
  }

  getProjects(): ProjectRef[] {
    return this.notesIn(this.settings.vault.projectsFolder, "project").map((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      // YAML gives `done: true` as a boolean, but a hand-typed "true" or "yes"
      // means the same thing to whoever wrote it.
      return { name: file.basename, path: file.path, done: isDoneFlag(fm.done) };
    });
  }

  /** The customer a calendar event belongs to, or null. */
  customerFor(event: CalendarEvent): CustomerRef | null {
    return matchCustomer(event, this.getCustomers());
  }

  // ── Lookup ───────────────────────────────────────────────────────

  /** UID part of an event id; CalDAV recurring ids are `UID_RECURRENCE-ID`. */
  private uidOf(event: CalendarEvent): string {
    const separator = event.id.indexOf("_");
    return separator === -1 ? event.id.split("|")[0] : event.id.slice(0, separator);
  }

  /**
   * The vault writes `date: 2026-08-21` unquoted, and a YAML parser is free to
   * hand that back as a Date rather than a string. Both shapes have to compare
   * equal to an event's `YYYY-MM-DD`, or the uid+date lookup silently misses.
   */
  private frontmatterDate(value: unknown): string {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
    if (typeof value === "string") return value.slice(0, 10);
    return value == null ? "" : String(value).slice(0, 10);
  }

  private noteDate(fm: Record<string, unknown>): string {
    return this.frontmatterDate(fm.date ?? fm.datum);
  }

  private recurrenceIdOf(event: CalendarEvent): string | null {
    const underscore = event.id.indexOf("_");
    if (underscore !== -1) return event.id.slice(underscore + 1);
    const pipe = event.id.indexOf("|");
    return pipe === -1 ? null : event.id.slice(pipe + 1);
  }

  /**
   * Find the note for this event. Resolution order matches the MCP's
   * findMeetingNoteForEvent: the exact calendar URL, then UID + date. The
   * legacy `event-id` and the title+date fallback keep older notes reachable.
   */
  noteExists(event: CalendarEvent): TFile | null {
    const date = event.start.slice(0, 10);
    const url = this.eventUrl(event.id);
    const uid = this.uidOf(event);
    let byUid: TFile | null = null;
    let byLegacyId: TFile | null = null;
    let byTitleDate: TFile | null = null;

    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;

      if (url && fm.calendar_event_id === url) return file;
      if (!byUid && fm.calendar_uid === uid && this.noteDate(fm) === date) byUid = file;
      if (!byLegacyId && toArray(fm["event-id"]).includes(event.id)) byLegacyId = file;
      if (!byTitleDate && fm.title === event.title && this.noteDate(fm) === date) byTitleDate = file;
    }
    return byUid ?? byLegacyId ?? byTitleDate;
  }

  /**
   * Snapshot Map<eventId, TFile> for a render cycle. Callers iterating many
   * events use this once instead of noteExists() per event (O(n²) vault scans).
   */
  buildNoteCache(): Map<string, TFile> {
    const cache = new Map<string, TFile>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      for (const id of toArray(fm["event-id"])) cache.set(id, file);
      if (typeof fm.calendar_event_id === "string") cache.set(fm.calendar_event_id, file);
      if (typeof fm.calendar_uid === "string") cache.set(`${fm.calendar_uid}@${this.noteDate(fm)}`, file);
    }
    return cache;
  }

  /** Looks an event up in a buildNoteCache() snapshot using the same key order. */
  lookupInCache(cache: Map<string, TFile>, event: CalendarEvent): TFile | null {
    const url = this.eventUrl(event.id);
    if (url) {
      const byUrl = cache.get(url);
      if (byUrl) return byUrl;
    }
    return cache.get(`${this.uidOf(event)}@${event.start.slice(0, 10)}`) ?? cache.get(event.id) ?? null;
  }

  // ── Create / open ────────────────────────────────────────────────

  async openOrCreate(event: CalendarEvent): Promise<{ file: TFile; isNew: boolean }> {
    const existing = this.noteExists(event);
    if (existing) {
      await this.patchDescription(existing, event);
      return { file: existing, isNew: false };
    }
    return { file: await this.createNote(event), isNew: true };
  }

  private async createNote(event: CalendarEvent): Promise<TFile> {
    const type = this.inferType(event);
    const folder = type === "termin" ? this.settings.vault.meetingsFolder : this.settings.notesFolder;
    await this.ensureFolder(folder);

    const path = await this.resolveNewPath(event, folder, type);
    return this.app.vault.create(path, await this.renderNote(event, type));
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
  }

  /**
   * `meetings/YYYY-MM-DD Titel.md`, the vault's convention. A name already taken
   * by a *different* event gets a numeric suffix — never an overwrite.
   */
  private async resolveNewPath(event: CalendarEvent, folder: string, type: NoteType): Promise<string> {
    const date = event.start.slice(0, 10);
    const base = type === "termin" ? meetingFilename(date, event.title) : sanitizeNoteName(event.title);
    const preferred = normalizePath(`${folder}/${base}.md`);
    if (!this.app.vault.getAbstractFileByPath(preferred)) return preferred;

    for (let suffix = 2; suffix < 50; suffix++) {
      const candidate = normalizePath(`${folder}/${base} ${suffix}.md`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    return normalizePath(`${folder}/${base} ${Date.now()}.md`);
  }

  private async renderNote(event: CalendarEvent, type: NoteType): Promise<string> {
    const date = event.start.slice(0, 10);
    const customer = this.customerFor(event);
    const attendeeLinks = this.attendeeLinks(event);
    const body = await this.loadTemplate(type);

    if (type !== "termin") {
      return `${this.buildLegacyFrontmatter(event, type)}\n${this.fillLegacyTemplate(body, event)}`;
    }

    return renderMeetingNote({
      title: event.title,
      date,
      calendarUid: this.uidOf(event),
      calendarEventId: this.eventUrl(event.id),
      calendarRecurrenceId: this.recurrenceIdOf(event),
      customer,
      attendeeLinks,
      context: this.buildContext(event),
      body,
    });
  }

  /** "## Initial context": the calendar description plus the facts it omits. */
  private buildContext(event: CalendarEvent): string {
    const lines: string[] = [];
    const when = `${toTimeStr(event.start)}–${toTimeStr(event.end)}`;
    const location = (event.location ?? "").replace(/\n/g, ", ").trim();
    lines.push(event.isAllDay ? "Ganztägig." : `${when}${location ? ` · ${location}` : ""}`);
    const description = cleanBody(event.body);
    if (description) lines.push("", description);
    return lines.join("\n");
  }

  /** Attendees as wiki-links, resolved to people/ notes where one exists. */
  private attendeeLinks(event: CalendarEvent): string[] {
    const people = this.getPeople();
    const links = (event.attendees ?? []).map((attendee) => {
      const person = matchPerson(attendee, people);
      if (person) return brainLink(person.name);
      return brainLink(normalizeAttendee(displayName(attendee)));
    });
    return [...new Set(links)];
  }

  // ── Note creation for the sidebar ────────────────────────────────

  async createCustomerNote(name: string): Promise<TFile> {
    const folder = this.settings.vault.customersFolder;
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${sanitizeNoteName(name)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    return this.app.vault.create(path, renderCustomerNote({ name }));
  }

  async createProjectNote(name: string): Promise<TFile> {
    const folder = this.settings.vault.projectsFolder;
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${sanitizeNoteName(name)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    return this.app.vault.create(path, renderProjectNote({ name }));
  }

  async createPersonNote(name: string, customer?: CustomerRef | null, email?: string): Promise<TFile> {
    const folder = this.settings.vault.peopleFolder;
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${sanitizeNoteName(name)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    return this.app.vault.create(path, renderPersonNote({ name, customer, email }));
  }

  // ── Keeping a note in sync with its event ────────────────────────

  async syncEventNote(previousEvent: CalendarEvent, updatedEvent: CalendarEvent): Promise<void> {
    const file = this.noteExists(previousEvent);
    if (!file) return;

    const isBrainNote = this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "termin";
    const url = this.eventUrl(updatedEvent.id);

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.title = updatedEvent.title;
      if (isBrainNote) {
        fm.date = updatedEvent.start.slice(0, 10);
        fm.calendar_uid = this.uidOf(updatedEvent);
        if (url) fm.calendar_event_id = url;
      } else {
        fm["event-id"] = updatedEvent.id;
        fm.date = updatedEvent.start.slice(0, 10);
        fm.start = toTimeStr(updatedEvent.start);
        fm.end = toTimeStr(updatedEvent.end);
        fm.location = (updatedEvent.location ?? "").replace(/\n/g, ", ");
      }
    });

    const content = await this.app.vault.read(file);
    const withHeading = this.replaceEventHeading(content, previousEvent.title, updatedEvent.title);
    const patched = this.replaceDescription(withHeading, cleanBody(updatedEvent.body));
    if (patched !== content) await this.app.vault.modify(file, patched);
  }

  /** The heading the description lives under — Brain notes vs. legacy notes. */
  private descriptionHeading(content: string): string {
    return content.includes("## Initial context") ? "## Initial context" : "## Beschreibung";
  }

  private async patchDescription(file: TFile, event: CalendarEvent): Promise<void> {
    const cleaned = cleanBody(event.body);
    if (!cleaned) return;
    const content = await this.app.vault.read(file);
    if (content.includes("## Beschreibung") || content.includes("## Initial context")) return;
    const section = `## Beschreibung\n${cleaned}\n\n`;
    const fmEnd = content.indexOf("\n---", 3);
    const insertAt = fmEnd === -1 ? 0 : fmEnd + 4;
    const patched = content.slice(0, insertAt) + "\n" + section + content.slice(insertAt).replace(/^\n/, "");
    await this.app.vault.modify(file, patched);
  }

  private replaceEventHeading(content: string, oldTitle: string, newTitle: string): string {
    const lines = content.split("\n");
    const firstHeading = lines.findIndex((line) => /^#\s+/.test(line));
    if (firstHeading === -1) return content;
    const current = lines[firstHeading].replace(/^#\s+/, "").trim();
    if (current !== oldTitle) return content;
    lines[firstHeading] = `# ${newTitle}`;
    return lines.join("\n");
  }

  private replaceDescription(content: string, description: string): string {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const heading = this.descriptionHeading(normalized);
    const start = normalized.indexOf(heading);
    if (!description && start === -1) return normalized;

    if (start === -1) {
      const fmEnd = normalized.indexOf("\n---", 3);
      const insertAt = fmEnd === -1 ? 0 : fmEnd + 4;
      const section = `\n${heading}\n${description}\n`;
      return normalized.slice(0, insertAt) + section + normalized.slice(insertAt).replace(/^\n/, "\n");
    }

    // A Brain note's Initial context is authored — replacing it would discard
    // the meeting prep. Only the legacy Beschreibung block is machine-owned.
    if (heading === "## Initial context") return normalized;

    const afterHeading = start + heading.length;
    const nextHeading = normalized.slice(afterHeading).search(/\n##\s+/);
    const end = nextHeading === -1 ? normalized.length : afterHeading + nextHeading;
    if (!description) {
      return (normalized.slice(0, start) + normalized.slice(end)).replace(/\n{3,}/g, "\n\n");
    }
    return `${normalized.slice(0, afterHeading)}\n${description}\n${normalized.slice(end).replace(/^\n?/, "\n")}`;
  }

  // ── Templates ────────────────────────────────────────────────────

  private inferType(event: CalendarEvent): NoteType {
    const title = event.title.toLowerCase();
    if (/\b(fokus|focus|deep\s*work|deepwork)\b/i.test(title)) return "focus";
    if (title.includes("interview") || title.includes("bewerbung")) return "interview";
    return "termin";
  }

  private async loadTemplate(type: NoteType): Promise<string> {
    const name = type === "termin" ? "termin" : type;
    const path = normalizePath(`${this.settings.templateFolder}/${name}.md`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const raw = await this.app.vault.read(file);
      // A vault template may ship its own frontmatter; the note's is authoritative.
      return raw.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^#\s+.*\n/, "").trimStart();
    }
    return this.defaultTemplate(type);
  }

  private defaultTemplate(type: NoteType): string {
    switch (type) {
      case "termin":     return DEFAULT_MEETING_TEMPLATE;
      case "interview":  return `## Kandidat\nName: {{title}}\nPosition:\nQuelle:\n\n## Lebenslauf-Highlights\n\n## Fragen\n\n## Eindrücke\n\n## Todos\n- [ ]\n\n## Bewertung\n[ ] Weiterführen  [ ] Absage\n`;
      case "recurring":  return `## Offene Todos (aus letzter Instanz)\n{{carried_todos}}\n\n## Status letztes Mal\n\n## Heute\n\n## Todos\n- [ ]\n`;
      case "task":       return `## Kontext\n\n## Notizen\n\n## Todos\n- [ ]\n`;
      case "focus":      return `{{body}}## Fokus-Todos\n{{focus_todos}}\n\n## Fokus\n\n## Notizen\n`;
    }
  }

  // ── Legacy (non-termin) notes ────────────────────────────────────

  private fillLegacyTemplate(template: string, event: CalendarEvent): string {
    const cleaned = cleanBody(event.body);
    return template
      .replace(/\{\{title\}\}/g, event.title)
      .replace(/\{\{date\}\}/g, event.start.slice(0, 10))
      .replace(/\{\{attendees\}\}/g, this.attendeeLinks(event).map((link) => `- ${link}`).join("\n") || "- ")
      .replace(/\{\{location\}\}/g, (event.location ?? "").replace(/\n/g, ", "))
      .replace(/\{\{body\}\}/g, cleaned ? `## Beschreibung\n${cleaned}\n\n` : "")
      .replace(/\{\{carried_todos\}\}/g, this.buildCarriedTodosQuery())
      .replace(/\{\{focus_todos\}\}/g, this.buildFocusTodosQuery());
  }

  /** Live-queries open todos from older instances of the same recurring event. */
  private buildCarriedTodosQuery(): string {
    const folder = this.settings.vault.meetingsFolder;
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

  /** Mirrors the sidebar's todo source set: the configured folders plus root notes. */
  private buildFocusTodosQuery(): string {
    const folders = JSON.stringify(this.settings.vault.todoFolders);
    return (
      "```dataviewjs\n" +
      `const folders = ${folders};\n` +
      `const pages = dv.pages()\n` +
      `  .where(p => !p["kanban-plugin"])\n` +
      `  .where(p => folders.some(f => p.file.path.startsWith(f + "/")) || !p.file.path.includes("/"));\n` +
      `const seed = dv.current().file.path;\n` +
      `const hash = (value) => [...value].reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0);\n` +
      `const tasks = pages.file.tasks\n` +
      `  .where(t => !t.completed)\n` +
      `  .array()\n` +
      `  .sort((a, b) => hash(seed + a.path + a.line + a.text) - hash(seed + b.path + b.line + b.text))\n` +
      `  .slice(0, 3);\n` +
      `if (tasks.length > 0) dv.taskList(tasks, false);\n` +
      `else dv.paragraph("_Keine offenen Todos._");\n` +
      "```"
    );
  }

  private buildLegacyFrontmatter(event: CalendarEvent, type: NoteType): string {
    return [
      "---",
      `event-id: "${event.id}"`,
      `title: ${JSON.stringify(event.title)}`,
      `date: "${event.start.slice(0, 10)}"`,
      `start: "${toTimeStr(event.start)}"`,
      `end: "${toTimeStr(event.end)}"`,
      `location: ${JSON.stringify((event.location ?? "").replace(/\n/g, ", "))}`,
      `attendees: [${this.attendeeLinks(event).map((link) => JSON.stringify(link)).join(", ")}]`,
      `type: ${type}`,
      `toBeRemoved: false`,
      `removalDate: null`,
      "---",
    ].join("\n");
  }

  // ── Removal ──────────────────────────────────────────────────────

  async markForRemoval(file: TFile, remove: boolean): Promise<void> {
    const removalDate = remove ? toDateStr(addDays(new Date(), 180)) : null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.toBeRemoved = remove;
      fm.removalDate = removalDate;
    });
  }

  async runRemovalCleanup(): Promise<void> {
    const today = toDateStr(new Date());
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.toBeRemoved && fm?.removalDate && fm.removalDate <= today) {
        await this.app.vault.trash(file, true);
      }
    }
  }
}
