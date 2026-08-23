import { describe, expect, it } from "vitest";
import {
  slugify, brainLink, attendeeDomain, attendeeEmail, displayName,
  matchCustomer, matchCustomerByTitle, matchPerson, meetingFilename,
  frontmatterValue, renderMeetingNote, renderMeetingFrontmatter,
  renderCustomerNote, renderProjectNote, renderPersonNote,
  DEFAULT_MEETING_TEMPLATE,
} from "../src/brain-vault";
import type { CalendarEvent, CustomerRef, PersonRef } from "../src/types";

function customer(name: string, domains: string[] = [], status = "aktiv"): CustomerRef {
  return { name, slug: slugify(name), path: `customers/${name}.md`, domains, status };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "46AAFAE9-B10C",
    title: "Kick-off",
    start: "2026-08-21T09:00:00Z",
    end: "2026-08-21T17:00:00Z",
    ...overrides,
  };
}

describe("slugify", () => {
  it("matches the customer tag slugs used in the vault", () => {
    expect(slugify("Nordwind")).toBe("nordwind");
    expect(slugify("Talwerk")).toBe("talwerk");
    expect(slugify("vierklang")).toBe("vierklang");
    expect(slugify("Werkstatt & Co")).toBe("werkstatt-co");
  });

  it("folds German umlauts rather than dropping them", () => {
    expect(slugify("Müller Groß")).toBe("mueller-gross");
    expect(slugify("Café")).toBe("cafe");
  });
});

describe("brainLink", () => {
  it("wraps a bare name and leaves an existing link alone", () => {
    expect(brainLink("Nordwind")).toBe("[[Nordwind]]");
    expect(brainLink("[[Nordwind]]")).toBe("[[Nordwind]]");
    expect(brainLink("customers/Nordwind.md")).toBe("[[customers/Nordwind]]");
  });
});

describe("attendee parsing", () => {
  it("reads the domain from both address forms", () => {
    expect(attendeeDomain("wanda.sturm@nordwind.de")).toBe("nordwind.de");
    expect(attendeeDomain("Wanda Sturm <wanda.sturm@NORDWIND.de>")).toBe("nordwind.de");
    expect(attendeeDomain("Wanda Sturm")).toBeNull();
  });

  it("reads the address itself, lowercased", () => {
    expect(attendeeEmail("Wanda <W.Sturm@Nordwind.de>")).toBe("w.sturm@nordwind.de");
    expect(attendeeEmail("no address here")).toBeNull();
  });

  it("derives a display name from either form", () => {
    expect(displayName("Wanda Sturm <w@nordwind.de>")).toBe("Wanda Sturm");
    expect(displayName('"Sturm, Wanda" <w@nordwind.de>')).toBe("Sturm, Wanda");
    expect(displayName("wanda.sturm@nordwind.de")).toBe("wanda sturm");
    expect(displayName("Wanda Sturm")).toBe("Wanda Sturm");
  });
});

describe("matchCustomer", () => {
  const customers = [customer("Nordwind", ["nordwind.de"]), customer("Seestern", ["seestern.com"])];

  it("matches on an attendee domain", () => {
    const matched = matchCustomer(event({ attendees: ["w@nordwind.de", "nils@ecke.lt"] }), customers);
    expect(matched?.name).toBe("Nordwind");
  });

  it("is case insensitive on the domain", () => {
    expect(matchCustomer(event({ attendees: ["W@NORDWIND.DE"] }), customers)?.name).toBe("Nordwind");
  });

  it("falls back to a title prefix when no attendee resolves", () => {
    expect(matchCustomer(event({ title: "Nordwind – Workshop Part 2" }), customers)?.name).toBe("Nordwind");
    expect(matchCustomer(event({ title: "Seestern: Review" }), customers)?.name).toBe("Seestern");
  });

  it("prefers the domain over a conflicting title", () => {
    const matched = matchCustomer(event({ title: "Seestern – Sync", attendees: ["w@nordwind.de"] }), customers);
    expect(matched?.name).toBe("Nordwind");
  });

  it("does not match a customer named mid-sentence", () => {
    expect(matchCustomer(event({ title: "Rethinking Nordwind" }), customers)).toBeNull();
    expect(matchCustomer(event({ title: "Zahnarzt" }), customers)).toBeNull();
  });

  it("prefers the longer name when two customers share a prefix", () => {
    const both = [customer("Talwerk"), customer("Talwerk Retail")];
    expect(matchCustomerByTitle("Talwerk Retail – Sync", both)?.name).toBe("Talwerk Retail");
    expect(matchCustomerByTitle("Talwerk – Sync", both)?.name).toBe("Talwerk");
  });

  it("matches a bare customer name as the whole title", () => {
    expect(matchCustomerByTitle("Nordwind", customers)?.name).toBe("Nordwind");
  });
});

describe("matchPerson", () => {
  const people: PersonRef[] = [
    { name: "Wanda Sturm", path: "people/Wanda Sturm.md", emails: ["wanda.sturm@nordwind.de"] },
    { name: "Kai Berger", path: "people/Kai Berger.md", emails: [] },
  ];

  it("matches on the mail address first", () => {
    expect(matchPerson("Whoever <WANDA.STURM@nordwind.de>", people)?.name).toBe("Wanda Sturm");
  });

  it("falls back to the display name", () => {
    expect(matchPerson("Kai Berger <k@elsewhere.io>", people)?.name).toBe("Kai Berger");
  });

  it("returns null for an unknown attendee", () => {
    expect(matchPerson("Someone Else <x@y.de>", people)).toBeNull();
  });
});

describe("meetingFilename", () => {
  it("follows the vault convention", () => {
    expect(meetingFilename("2026-08-21", "Nordwind – Kick-off")).toBe("2026-08-21 Nordwind – Kick-off");
  });

  it("strips characters Obsidian rejects in filenames", () => {
    expect(meetingFilename("2026-08-21", "Q3: Review/Plan?")).toBe("2026-08-21 Q3 ReviewPlan");
  });
});

describe("frontmatterValue", () => {
  it("quotes scalars and renders inline lists", () => {
    expect(frontmatterValue("Nordwind")).toBe('"Nordwind"');
    expect(frontmatterValue(['[[A]]', '[[B]]'])).toBe('["[[A]]", "[[B]]"]');
  });
});

describe("renderMeetingFrontmatter", () => {
  const base = { title: "Kick-off", date: "2026-08-21", calendarUid: "46AAFAE9", body: "" };

  it("writes the calendar identity the MCP resolves notes by", () => {
    const fm = renderMeetingFrontmatter({ ...base, calendarEventId: "https://caldav.fastmail.com/x.ics" });
    expect(fm).toContain("type: termin");
    expect(fm).toContain('calendar_event_id: "https://caldav.fastmail.com/x.ics"');
    expect(fm).toContain('calendar_uid: "46AAFAE9"');
    expect(fm).toContain("date: 2026-08-21");
  });

  it("omits calendar_event_id when the backend has no URL", () => {
    expect(renderMeetingFrontmatter(base)).not.toContain("calendar_event_id");
  });

  it("writes both kunde and the tag, which drive separate Dataview blocks", () => {
    const fm = renderMeetingFrontmatter({ ...base, customer: customer("Nordwind", ["nordwind.de"]) });
    expect(fm).toContain('kunde: "[[Nordwind]]"');
    expect(fm).toContain("tags: [kunde/nordwind]");
  });

  it("leaves kunde and tags out when no customer matched", () => {
    const fm = renderMeetingFrontmatter(base);
    expect(fm).not.toContain("kunde:");
    expect(fm).not.toContain("tags:");
  });

  it("records the recurrence id for a single instance of a series", () => {
    const fm = renderMeetingFrontmatter({ ...base, calendarRecurrenceId: "20260821T090000Z" });
    expect(fm).toContain('calendar_recurrence_id: "20260821T090000Z"');
  });
});

describe("renderMeetingNote", () => {
  const note = renderMeetingNote({
    title: "Nordwind – Kick-off",
    date: "2026-08-21",
    calendarUid: "46AAFAE9",
    calendarEventId: "https://caldav.fastmail.com/x.ics",
    customer: customer("Nordwind", ["nordwind.de"]),
    attendeeLinks: ["[[Wanda Sturm]]", "[[Kai Berger]]"],
    context: "09:00–17:00 · Hamburg\n\nWorkshop Tag 1.",
    body: DEFAULT_MEETING_TEMPLATE,
  });

  it("carries the sections both tools read", () => {
    for (const heading of ["## Initial context", "## Mitgebracht", "## Notizen", "## Todos bis nächstes Mal", "## Fürs nächste Treffen", "## Sources", "## Related notes"]) {
      expect(note).toContain(heading);
    }
  });

  it("puts the customer and the attendees under Related notes", () => {
    const related = note.slice(note.indexOf("## Related notes"));
    expect(related).toContain("- [[Nordwind]]");
    expect(related).toContain("- [[Wanda Sturm]]");
    expect(related).toContain("- [[Kai Berger]]");
  });

  it("uses the calendar description as the initial context", () => {
    expect(note).toContain("Workshop Tag 1.");
  });

  it("leaves an H1 with the event title right after the frontmatter", () => {
    expect(note.split("\n---\n")[1].trimStart().split("\n")[0]).toBe("# Nordwind – Kick-off");
  });

  it("does not leave placeholders behind", () => {
    expect(note).not.toMatch(/\{\{\w+\}\}/);
  });

  it("falls back to a marker when the event has no description", () => {
    const empty = renderMeetingNote({ title: "X", date: "2026-08-21", calendarUid: "u", body: DEFAULT_MEETING_TEMPLATE });
    expect(empty).toContain("_Keine Beschreibung im Kalendereintrag._");
    expect(empty).toContain("_No related notes linked yet._");
  });

  it("does not repeat a link that is both customer and related", () => {
    const once = renderMeetingNote({
      title: "X", date: "2026-08-21", calendarUid: "u", body: DEFAULT_MEETING_TEMPLATE,
      customer: customer("Nordwind"), relatedLinks: ["[[Nordwind]]"],
    });
    expect(once.split("- [[Nordwind]]").length - 1).toBe(1);
  });
});

describe("renderCustomerNote", () => {
  const note = renderCustomerNote({ name: "Acme", partner: "Werkstatt & Co", ort: "Hamburg" });

  it("writes the frontmatter the vault's queries filter on", () => {
    expect(note).toContain("type: kunde");
    expect(note).toContain("tags: [kunde/acme]");
    expect(note).toContain("status: aktiv");
    expect(note).toContain('partner: "[[Werkstatt & Co]]"');
    expect(note).toContain("ort: Hamburg");
  });

  it("ships the six standard sections", () => {
    for (const heading of ["## Ansprechpartner (Kunde-Seite)", "## Delivery-Team", "## Laufende Themen", "## Offene Todos (alle Termine)", "## Zeiten", "## Termin-Historie"]) {
      expect(note).toContain(heading);
    }
  });

  it("scopes the todo roll-up to this customer's tag", () => {
    expect(note).toContain("FROM #kunde/acme");
  });

  it("finds meetings by the kunde link, matching what the meeting note writes", () => {
    expect(note).toContain('WHERE type = "termin" AND kunde = this.file.link');
  });

  it("does not carry a billing rate — billing/rates.md owns that", () => {
    expect(note).not.toContain("rate_eur:");
  });
});

describe("renderProjectNote / renderPersonNote", () => {
  it("renders a project in the MCP's entity shape", () => {
    const note = renderProjectNote({ name: "Benchmark", relatedLinks: ["Nordwind"] });
    expect(note).toContain("type: project");
    expect(note).toContain('title: "Benchmark"');
    expect(note).toContain("## Initial context");
    expect(note).toContain("- [[Nordwind]]");
  });

  it("links a person to their customer and tag", () => {
    const note = renderPersonNote({ name: "Wanda Sturm", customer: customer("Nordwind"), email: "w@nordwind.de" });
    expect(note).toContain("type: person");
    expect(note).toContain('kunde: "[[Nordwind]]"');
    expect(note).toContain("tags: [kunde/nordwind]");
    expect(note).toContain("email: w@nordwind.de");
  });
});

describe("renderMeetingNote with a hand-written template", () => {
  // The vault's own _templates/termin.md: German working sections, no
  // Initial context / Sources / Related notes, and its own placeholders.
  const vaultTemplate = [
    "Termin mit {{kunde_link}}.",
    "",
    "## Mitgebracht",
    "",
    "- ",
    "",
    "## Todos bis nächstes Mal",
    "",
    "- [ ] ",
    "",
  ].join("\n");

  const note = renderMeetingNote({
    title: "Sync",
    date: "2026-08-21",
    calendarUid: "u",
    customer: { name: "Nordwind", slug: "nordwind", path: "customers/Nordwind.md", domains: [], status: "aktiv" },
    attendeeLinks: ["[[Wanda Sturm]]"],
    context: "09:00–10:00",
    body: vaultTemplate,
  });

  it("substitutes the template's own placeholders", () => {
    expect(note).toContain("Termin mit [[Nordwind]].");
    expect(note).not.toMatch(/\{\{\w+\}\}/);
  });

  it("keeps the template's sections", () => {
    expect(note).toContain("## Mitgebracht");
    expect(note).toContain("## Todos bis nächstes Mal");
  });

  it("appends the sections the MCP relies on rather than losing them", () => {
    expect(note).toContain("## Initial context");
    expect(note).toContain("## Sources");
    expect(note).toContain("## Related notes");
    expect(note.slice(note.indexOf("## Related notes"))).toContain("- [[Nordwind]]");
  });

  it("leaves an unknown placeholder alone instead of blanking it", () => {
    const custom = renderMeetingNote({ title: "X", date: "2026-08-21", calendarUid: "u", body: "{{eigenes_feld}}" });
    expect(custom).toContain("{{eigenes_feld}}");
  });

  it("does not append a section the template already provides", () => {
    const withSources = renderMeetingNote({
      title: "X", date: "2026-08-21", calendarUid: "u",
      body: "## Initial context\n\n{{context}}\n\n## Sources\n\neigene Quelle\n\n## Related notes\n\n{{related}}\n",
    });
    expect(withSources.split("## Sources").length - 1).toBe(1);
    expect(withSources).toContain("eigene Quelle");
  });
});
