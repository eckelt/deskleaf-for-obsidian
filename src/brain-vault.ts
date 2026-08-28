// Pure helpers for the Brain vault structure (customers · meetings · people ·
// projects) shared with the Deskleaf MCP (eckelt/deskleaf-for-ai → eckelt/brain).
//
// Everything here is deliberately free of Obsidian APIs so the note shapes that
// both tools have to agree on stay unit-testable.

import type { CalendarEvent, CustomerRef, PersonRef } from "./types";

/** `Nordwind` → `nordwind`, `Talwerk GmbH` → `talwerk-gmbh`. Mirrors slugify() in the MCP. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Wraps a bare name in wiki-link brackets, leaving an existing link untouched. */
export function brainLink(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) return trimmed;
  return `[[${trimmed.replace(/\.md$/, "")}]]`;
}

/** The mail domain of an attendee entry, which may be a bare address or "Name <a@b.de>". */
export function attendeeDomain(attendee: string): string | null {
  const match = attendee.match(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/);
  return match ? match[1].toLowerCase() : null;
}

export function attendeeEmail(attendee: string): string | null {
  const match = attendee.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Which customer a calendar event belongs to.
 *
 * Domain first — an attendee from `nordwind.de` is hard evidence. Only when no
 * attendee resolves does the title decide, and then only as a prefix ("Nordwind –
 * Workshop"), never as a substring: "Rethinking Nordwind" is about the customer,
 * a note titled "Retro" at a customer whose name happens to appear mid-sentence
 * is not.
 */
export function matchCustomer(event: CalendarEvent, customers: CustomerRef[]): CustomerRef | null {
  const domains = new Set((event.attendees ?? []).map(attendeeDomain).filter((d): d is string => !!d));
  for (const customer of customers) {
    if (customer.domains.some((domain) => domains.has(domain.toLowerCase()))) return customer;
  }
  return matchCustomerByTitle(event.title, customers);
}

export function matchCustomerByTitle(title: string, customers: CustomerRef[]): CustomerRef | null {
  const normalized = title.trim().toLowerCase();
  // Longest name first so "Talwerk Retail" wins over "Talwerk" when both exist.
  const byLength = [...customers].sort((a, b) => b.name.length - a.name.length);
  for (const customer of byLength) {
    const name = customer.name.toLowerCase();
    if (normalized === name) return customer;
    const rest = normalized.startsWith(name) ? normalized.slice(name.length) : null;
    if (rest !== null && /^\s*[–—\-:·|]/.test(rest)) return customer;
  }
  return null;
}

/** Resolves one attendee to a people/ note, by mail address first, then by display name. */
export function matchPerson(attendee: string, people: PersonRef[]): PersonRef | null {
  const email = attendeeEmail(attendee);
  if (email) {
    const byMail = people.find((person) => person.emails.some((value) => value.toLowerCase() === email));
    if (byMail) return byMail;
  }
  const name = displayName(attendee).toLowerCase();
  if (!name) return null;
  return people.find((person) => person.name.toLowerCase() === name) ?? null;
}

/** "Wanda Sturm <w@x.de>" → "Wanda Sturm"; a bare address keeps its local part. */
export function displayName(attendee: string): string {
  const angled = attendee.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (angled) return angled[1].trim();
  const bare = attendee.trim();
  if (!bare.includes("@")) return bare;
  return bare.slice(0, bare.indexOf("@")).replace(/[._]+/g, " ").trim();
}

/** Vault convention: `meetings/2026-08-21 Nordwind – Kick-off.md`. */
export function meetingFilename(date: string, title: string): string {
  return `${date} ${sanitizeNoteName(title)}`.trim();
}

export function sanitizeNoteName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Serializes a frontmatter value: quoted scalar, or an inline list. */
export function frontmatterValue(value: string | string[]): string {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  return JSON.stringify(value);
}

export interface MeetingNoteInput {
  title: string;
  date: string;
  calendarUid: string;
  calendarEventId?: string | null;
  calendarRecurrenceId?: string | null;
  customer?: CustomerRef | null;
  attendeeLinks?: string[];
  /** Cleaned calendar description; becomes "## Initial context". */
  context?: string;
  relatedLinks?: string[];
  /** Body below the frontmatter; `{{…}}` placeholders are substituted by the caller. */
  body: string;
}

export function renderMeetingFrontmatter(input: MeetingNoteInput): string {
  const attendees = input.attendeeLinks ?? [];
  return [
    "---",
    "type: termin",
    `title: ${frontmatterValue(input.title)}`,
    `date: ${input.date}`,
    ...(input.calendarEventId ? [`calendar_event_id: ${frontmatterValue(input.calendarEventId)}`] : []),
    `calendar_uid: ${frontmatterValue(input.calendarUid)}`,
    ...(input.calendarRecurrenceId ? [`calendar_recurrence_id: ${frontmatterValue(input.calendarRecurrenceId)}`] : []),
    // Both are load-bearing for the customer note's Dataview blocks: the
    // Termin-Historie filters on `kunde`, the open-todo roll-up on the tag.
    ...(input.customer ? [`kunde: ${frontmatterValue(brainLink(input.customer.name))}`] : []),
    ...(attendees.length > 0 ? [`teilnehmer: ${frontmatterValue(attendees)}`] : []),
    ...(input.customer ? [`tags: [kunde/${input.customer.slug}]`] : []),
    "---",
  ].join("\n");
}

/**
 * Display-friendly meeting skeleton: agent and user todos use ordinary Markdown
 * checkboxes under one stable heading, so another consumer need not understand
 * Dataview or the wider Brain structure.
 */
export const DEFAULT_MEETING_TEMPLATE = [
  "## Notizen",
  "",
  "{{context}}",
  "",
  "## Todos",
  "",
  "- [ ] ",
  "",
  "## Related notes",
  "",
  "{{related}}",
  "",
].join("\n");

/**
 * The relation list remains compatible with Brain/MCP consumers. Everything
 * else is intentionally optional: a minimal template should stay minimal.
 */
export const REQUIRED_MEETING_SECTIONS = ["## Related notes"] as const;

export function renderMeetingNote(input: MeetingNoteInput): string {
  const related = [...new Set([
    ...(input.customer ? [brainLink(input.customer.name)] : []),
    ...(input.attendeeLinks ?? []),
    ...(input.relatedLinks ?? []),
  ])];
  const values: Record<string, string> = {
    context: input.context?.trim() || "_Keine Beschreibung im Kalendereintrag._",
    sources: "_No sources linked yet._",
    related: related.length > 0 ? related.map((link) => `- ${link}`).join("\n") : "_No related notes linked yet._",
    title: input.title,
    titel: input.title,
    date: input.date,
    datum: input.date,
    kunde: input.customer?.name ?? "",
    kunde_link: input.customer ? brainLink(input.customer.name) : "",
    kunde_slug: input.customer?.slug ?? "",
    teilnehmer: (input.attendeeLinks ?? []).join(", "),
  };

  let body = input.body.replace(/\{\{(\w+)\}\}/g, (full, key: string) => (key in values ? values[key] : full));

  for (const heading of REQUIRED_MEETING_SECTIONS) {
    if (body.includes(heading)) continue;
    const key = heading.replace("## ", "").toLowerCase().replace(" ", "_");
    const filler = key === "initial_context" ? values.context : key === "sources" ? values.sources : values.related;
    body = `${body.trimEnd()}\n\n${heading}\n\n${filler}\n`;
  }

  // The filename already carries the event title. Keeping the body title-free
  // makes the note compact and leaves the display a small, predictable shape.
  return `${renderMeetingFrontmatter(input)}\n\n${body.trimStart()}`;
}

/**
 * The six sections every customer note in the vault shares, with their Dataview
 * views. Kept byte-compatible with renderCustomerNote() in the MCP so a note
 * created here is indistinguishable from one created by create_customer_note.
 * The billing rate deliberately lives in billing/rates.md, not here.
 */
export function renderCustomerNote(input: { name: string; intro?: string; status?: string; partner?: string; ort?: string }): string {
  const slug = slugify(input.name);
  const intro = (input.intro ?? "").trim();
  return [
    "---",
    "type: kunde",
    `tags: [kunde/${slug}]`,
    `status: ${input.status ?? "aktiv"}`,
    ...(input.partner ? [`partner: ${frontmatterValue(brainLink(input.partner))}`] : []),
    ...(input.ort ? [`ort: ${input.ort}`] : []),
    "---",
    "",
    `# ${input.name}`,
    "",
    intro || "_Noch keine Beschreibung._",
    "",
    "## Ansprechpartner (Kunde-Seite)",
    "",
    "```dataview",
    "LIST rolle",
    'WHERE type = "person" AND contains(kunde, this.file.link)',
    "```",
    "",
    "## Delivery-Team",
    "",
    "```dataview",
    "LIST rolle",
    'WHERE type = "person" AND contains(engagements, this.file.link)',
    "```",
    "",
    "## Laufende Themen",
    "",
    "_Noch nichts erfasst._",
    "",
    "## Offene Todos (alle Termine)",
    "",
    "```dataview",
    "TASK",
    `FROM #kunde/${slug}`,
    "WHERE !completed",
    "GROUP BY file.link",
    "```",
    "",
    "## Zeiten",
    "",
    "```dataview",
    'TABLE WITHOUT ID date AS Datum, hours AS Stunden, description AS Beschreibung, rate_eur AS "Satz €/h", amount_eur AS "Betrag €", invoice AS Rechnung',
    'FROM "time/entries"',
    "WHERE customer = this.file.link",
    "SORT date DESC",
    "```",
    "",
    "```dataview",
    'TABLE WITHOUT ID key AS Rechnung, sum(rows.hours) AS Stunden, sum(rows.amount_eur) AS "Summe €"',
    'FROM "time/entries"',
    "WHERE customer = this.file.link",
    "GROUP BY invoice",
    "```",
    "",
    "## Termin-Historie",
    "",
    "```dataview",
    "TABLE WITHOUT ID file.link AS Termin, teilnehmer AS Teilnehmer",
    'FROM "meetings"',
    'WHERE type = "termin" AND kunde = this.file.link',
    "SORT file.name DESC",
    "```",
    "",
  ].join("\n");
}

/** type: project, matching renderBrainEntityNote("project", …) in the MCP. */
export function renderProjectNote(input: { name: string; initialContext?: string; relatedLinks?: string[] }): string {
  const related = input.relatedLinks ?? [];
  return [
    "---",
    "type: project",
    `title: ${frontmatterValue(input.name)}`,
    "---",
    "",
    `# ${input.name}`,
    "",
    "## Initial context",
    "",
    (input.initialContext ?? "").trim() || "_No initial context recorded._",
    "",
    "## Sources",
    "",
    "_No sources linked yet._",
    "",
    "## Related notes",
    "",
    ...(related.length > 0 ? related.map((link) => `- ${brainLink(link)}`) : ["_No related notes linked yet._"]),
    "",
  ].join("\n");
}

/** type: person, matching the vault's _templates/person.md. */
export function renderPersonNote(input: { name: string; customer?: CustomerRef | null; email?: string; rolle?: string }): string {
  return [
    "---",
    "type: person",
    ...(input.customer ? [`kunde: ${frontmatterValue(brainLink(input.customer.name))}`] : []),
    `rolle: ${input.rolle ?? ""}`,
    `email: ${input.email ?? ""}`,
    "telefon:",
    ...(input.customer ? [`tags: [kunde/${input.customer.slug}]`] : []),
    "---",
    "",
    `# ${input.name}`,
    "",
    input.customer ? `Ansprechpartner bei ${brainLink(input.customer.name)}.` : "",
    "",
    "## Notizen",
    "",
    "- ",
    "",
  ].join("\n");
}
