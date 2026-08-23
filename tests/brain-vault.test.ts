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
    expect(slugify("Tchibo")).toBe("tchibo");
    expect(slugify("dmTECH")).toBe("dmtech");
    expect(slugify("re-cinq")).toBe("re-cinq");
    expect(slugify("Hacker & Wizards")).toBe("hacker-wizards");
  });

  it("folds German umlauts rather than dropping them", () => {
    expect(slugify("Müller Groß")).toBe("mueller-gross");
    expect(slugify("Café")).toBe("cafe");
  });
});

describe("brainLink", () => {
  it("wraps a bare name and leaves an existing link alone", () => {
    expect(brainLink("Tchibo")).toBe("[[Tchibo]]");
    expect(brainLink("[[Tchibo]]")).toBe("[[Tchibo]]");
    expect(brainLink("customers/Tchibo.md")).toBe("[[customers/Tchibo]]");
  });
});

describe("attendee parsing", () => {
  it("reads the domain from both address forms", () => {
    expect(attendeeDomain("waldemar.spaet@tchibo.de")).toBe("tchibo.de");
    expect(attendeeDomain("Waldemar Spät <waldemar.spaet@TCHIBO.de>")).toBe("tchibo.de");
    expect(attendeeDomain("Waldemar Spät")).toBeNull();
  });

  it("reads the address itself, lowercased", () => {
    expect(attendeeEmail("Waldemar <W.Spaet@Tchibo.de>")).toBe("w.spaet@tchibo.de");
    expect(attendeeEmail("no address here")).toBeNull();
  });

  it("derives a display name from either form", () => {
    expect(displayName("Waldemar Spät <w@tchibo.de>")).toBe("Waldemar Spät");
    expect(displayName('"Spät, Waldemar" <w@tchibo.de>')).toBe("Spät, Waldemar");
    expect(displayName("waldemar.spaet@tchibo.de")).toBe("waldemar spaet");
    expect(displayName("Waldemar Spät")).toBe("Waldemar Spät");
  });
});

describe("matchCustomer", () => {
  const customers = [customer("Tchibo", ["tchibo.de"]), customer("Moonfare", ["moonfare.com"])];

  it("matches on an attendee domain", () => {
    const matched = matchCustomer(event({ attendees: ["w@tchibo.de", "nils@ecke.lt"] }), customers);
    expect(matched?.name).toBe("Tchibo");
  });

  it("is case insensitive on the domain", () => {
    expect(matchCustomer(event({ attendees: ["W@TCHIBO.DE"] }), customers)?.name).toBe("Tchibo");
  });

  it("falls back to a title prefix when no attendee resolves", () => {
    expect(matchCustomer(event({ title: "Tchibo – Workshop Part 2" }), customers)?.name).toBe("Tchibo");
    expect(matchCustomer(event({ title: "Moonfare: Review" }), customers)?.name).toBe("Moonfare");
  });

  it("prefers the domain over a conflicting title", () => {
    const matched = matchCustomer(event({ title: "Moonfare – Sync", attendees: ["w@tchibo.de"] }), customers);
    expect(matched?.name).toBe("Tchibo");
  });

  it("does not match a customer named mid-sentence", () => {
    expect(matchCustomer(event({ title: "Rethinking Tchibo" }), customers)).toBeNull();
    expect(matchCustomer(event({ title: "Zahnarzt" }), customers)).toBeNull();
  });

  it("prefers the longer name when two customers share a prefix", () => {
    const both = [customer("dmTECH"), customer("dmTECH Retail")];
    expect(matchCustomerByTitle("dmTECH Retail – Sync", both)?.name).toBe("dmTECH Retail");
    expect(matchCustomerByTitle("dmTECH – Sync", both)?.name).toBe("dmTECH");
  });

  it("matches a bare customer name as the whole title", () => {
    expect(matchCustomerByTitle("Tchibo", customers)?.name).toBe("Tchibo");
  });
});

describe("matchPerson", () => {
  const people: PersonRef[] = [
    { name: "Waldemar Spät", path: "people/Waldemar Spät.md", emails: ["waldemar.spaet@tchibo.de"] },
    { name: "Kamil Kubica", path: "people/Kamil Kubica.md", emails: [] },
  ];

  it("matches on the mail address first", () => {
    expect(matchPerson("Whoever <WALDEMAR.SPAET@tchibo.de>", people)?.name).toBe("Waldemar Spät");
  });

  it("falls back to the display name", () => {
    expect(matchPerson("Kamil Kubica <k@elsewhere.io>", people)?.name).toBe("Kamil Kubica");
  });

  it("returns null for an unknown attendee", () => {
    expect(matchPerson("Someone Else <x@y.de>", people)).toBeNull();
  });
});

describe("meetingFilename", () => {
  it("follows the vault convention", () => {
    expect(meetingFilename("2026-08-21", "Tchibo – Kick-off")).toBe("2026-08-21 Tchibo – Kick-off");
  });

  it("strips characters Obsidian rejects in filenames", () => {
    expect(meetingFilename("2026-08-21", "Q3: Review/Plan?")).toBe("2026-08-21 Q3 ReviewPlan");
  });
});

describe("frontmatterValue", () => {
  it("quotes scalars and renders inline lists", () => {
    expect(frontmatterValue("Tchibo")).toBe('"Tchibo"');
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
    const fm = renderMeetingFrontmatter({ ...base, customer: customer("Tchibo", ["tchibo.de"]) });
    expect(fm).toContain('kunde: "[[Tchibo]]"');
    expect(fm).toContain("tags: [kunde/tchibo]");
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
    title: "Tchibo – Kick-off",
    date: "2026-08-21",
    calendarUid: "46AAFAE9",
    calendarEventId: "https://caldav.fastmail.com/x.ics",
    customer: customer("Tchibo", ["tchibo.de"]),
    attendeeLinks: ["[[Waldemar Spät]]", "[[Kamil Kubica]]"],
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
    expect(related).toContain("- [[Tchibo]]");
    expect(related).toContain("- [[Waldemar Spät]]");
    expect(related).toContain("- [[Kamil Kubica]]");
  });

  it("uses the calendar description as the initial context", () => {
    expect(note).toContain("Workshop Tag 1.");
  });

  it("leaves an H1 with the event title right after the frontmatter", () => {
    expect(note.split("\n---\n")[1].trimStart().split("\n")[0]).toBe("# Tchibo – Kick-off");
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
      customer: customer("Tchibo"), relatedLinks: ["[[Tchibo]]"],
    });
    expect(once.split("- [[Tchibo]]").length - 1).toBe(1);
  });
});

describe("renderCustomerNote", () => {
  const note = renderCustomerNote({ name: "Acme", partner: "Hacker & Wizards", ort: "Hamburg" });

  it("writes the frontmatter the vault's queries filter on", () => {
    expect(note).toContain("type: kunde");
    expect(note).toContain("tags: [kunde/acme]");
    expect(note).toContain("status: aktiv");
    expect(note).toContain('partner: "[[Hacker & Wizards]]"');
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
    const note = renderProjectNote({ name: "Benchmark", relatedLinks: ["Tchibo"] });
    expect(note).toContain("type: project");
    expect(note).toContain('title: "Benchmark"');
    expect(note).toContain("## Initial context");
    expect(note).toContain("- [[Tchibo]]");
  });

  it("links a person to their customer and tag", () => {
    const note = renderPersonNote({ name: "Waldemar Spät", customer: customer("Tchibo"), email: "w@tchibo.de" });
    expect(note).toContain("type: person");
    expect(note).toContain('kunde: "[[Tchibo]]"');
    expect(note).toContain("tags: [kunde/tchibo]");
    expect(note).toContain("email: w@tchibo.de");
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
    customer: { name: "Tchibo", slug: "tchibo", path: "customers/Tchibo.md", domains: [], status: "aktiv" },
    attendeeLinks: ["[[Waldemar Spät]]"],
    context: "09:00–10:00",
    body: vaultTemplate,
  });

  it("substitutes the template's own placeholders", () => {
    expect(note).toContain("Termin mit [[Tchibo]].");
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
    expect(note.slice(note.indexOf("## Related notes"))).toContain("- [[Tchibo]]");
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
