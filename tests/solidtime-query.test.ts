import { describe, expect, it } from "vitest";
import {
  parseSolidTimeQuery, resolveDate, SolidTimeQueryError, roundHours, centsToEur,
  formatHours, formatEur, totalRow, monthLabel, DEFAULT_LIMIT,
} from "../src/solidtime-query";

const TODAY = new Date("2026-08-23T12:00:00Z");
const parse = (src: string, client?: string) => parseSolidTimeQuery(src, TODAY, client);

describe("parseSolidTimeQuery — Ansicht", () => {
  it("erkennt die vier Ansichten", () => {
    expect(parse("entries").view).toBe("entries");
    expect(parse("time entries").view).toBe("entries");
    expect(parse("summary by client").view).toBe("by-client");
    expect(parse("summary by month").view).toBe("by-month");
    expect(parse("summary by project").view).toBe("by-project");
  });

  it("nimmt 'summary' allein als Kundenübersicht", () => {
    expect(parse("summary").view).toBe("by-client");
  });

  it("ist unempfindlich gegen Groß-/Kleinschreibung", () => {
    expect(parse("SUMMARY BY CLIENT").view).toBe("by-client");
  });

  it("nennt die erlaubten Ansichten, wenn die erste Zeile keine ist", () => {
    expect(() => parse("gib mir alles")).toThrow(/keine Ansicht/);
    expect(() => parse("gib mir alles")).toThrow(/summary by month/);
  });

  it("beschwert sich über einen leeren Block", () => {
    expect(() => parse("   \n  \n")).toThrow(/leer/);
  });
});

describe("parseSolidTimeQuery — Filter", () => {
  it("liest Kunde und Projekt, deutsch wie englisch", () => {
    expect(parse("summary\nclient: Tchibo").client).toBe("Tchibo");
    expect(parse("summary\nkunde: Tchibo").client).toBe("Tchibo");
    expect(parse("summary\nprojekt: Workshop").project).toBe("Workshop");
  });

  it("entfernt Anführungszeichen um den Wert", () => {
    expect(parse('summary\nclient: "Hacker & Wizards"').client).toBe("Hacker & Wizards");
  });

  it("übernimmt den Kunden der umgebenden Notiz", () => {
    expect(parse("summary by month", "Tchibo").client).toBe("Tchibo");
  });

  it("lässt den Block den Notiz-Kunden überschreiben oder abwählen", () => {
    expect(parse("summary\nclient: Moonfare", "Tchibo").client).toBe("Moonfare");
    expect(parse("summary\nclient: all", "Tchibo").client).toBeUndefined();
    expect(parse("summary\nkunde: alle", "Tchibo").client).toBeUndefined();
  });

  it("liest abrechenbar als ja/nein", () => {
    expect(parse("summary\nbillable: true").billable).toBe(true);
    expect(parse("summary\nabrechenbar: nein").billable).toBe(false);
    expect(() => parse("summary\nbillable: vielleicht")).toThrow(/ja\/nein/);
  });

  it("begrenzt limit und weist Unsinn ab", () => {
    expect(parse("entries").limit).toBe(DEFAULT_LIMIT);
    expect(parse("entries\nlimit: 20").limit).toBe(20);
    expect(parse("entries\nlimit: 99999").limit).toBe(1000);
    expect(() => parse("entries\nlimit: viele")).toThrow(/keine Zahl/);
  });

  it("ignoriert Kommentare und Leerzeilen", () => {
    const q = parse("summary  # nur Stunden\n\n  client: Tchibo  # der Kunde\n");
    expect(q.client).toBe("Tchibo");
  });

  it("nennt das Feld, das es nicht kennt", () => {
    expect(() => parse("summary\nfarbe: blau")).toThrow(/'farbe'/);
  });

  it("weist eine Zeile ohne Doppelpunkt ab", () => {
    expect(() => parse("summary\neinfach so")).toThrow(/kein 'feld: wert'/);
  });

  it("weist einen rückwärts laufenden Zeitraum ab", () => {
    expect(() => parse("summary\nsince: 2026-08-01\nuntil: 2026-07-01")).toThrow(/rückwärts/);
  });

  it("setzt mit month: Anfang und Ende zugleich", () => {
    const q = parse("summary\nmonth: 2026-07");
    expect(q.since).toBe("2026-07-01");
    expect(q.until).toBe("2026-07-31");
  });
});

describe("resolveDate", () => {
  it("nimmt ein volles Datum unverändert", () => {
    expect(resolveDate("2026-03-14", TODAY, "start")).toBe("2026-03-14");
  });

  it("spannt Monat und Jahr auf die passende Kante", () => {
    expect(resolveDate("2026-02", TODAY, "start")).toBe("2026-02-01");
    expect(resolveDate("2026-02", TODAY, "end")).toBe("2026-02-28");
    expect(resolveDate("2024-02", TODAY, "end")).toBe("2024-02-29");
    expect(resolveDate("2025", TODAY, "start")).toBe("2025-01-01");
    expect(resolveDate("2025", TODAY, "end")).toBe("2025-12-31");
  });

  it("versteht relative Angaben", () => {
    expect(resolveDate("-30d", TODAY, "start")).toBe("2026-07-24");
    expect(resolveDate("-2w", TODAY, "start")).toBe("2026-08-09");
    expect(resolveDate("-1m", TODAY, "start")).toBe("2026-07-23");
    expect(resolveDate("-1y", TODAY, "start")).toBe("2025-08-23");
  });

  it("versteht benannte Zeiträume, deutsch wie englisch", () => {
    expect(resolveDate("this month", TODAY, "start")).toBe("2026-08-01");
    expect(resolveDate("dieser monat", TODAY, "end")).toBe("2026-08-31");
    expect(resolveDate("last month", TODAY, "start")).toBe("2026-07-01");
    expect(resolveDate("letzter monat", TODAY, "end")).toBe("2026-07-31");
    expect(resolveDate("this year", TODAY, "start")).toBe("2026-01-01");
    expect(resolveDate("ytd", TODAY, "end")).toBe("2026-08-23");
    expect(resolveDate("last year", TODAY, "end")).toBe("2025-12-31");
    expect(resolveDate("heute", TODAY, "start")).toBe("2026-08-23");
  });

  it("meldet, was es nicht versteht", () => {
    expect(() => resolveDate("neulich", TODAY, "start")).toThrow(SolidTimeQueryError);
  });
});

describe("Aufbereitung", () => {
  it("rechnet Sekunden in Stunden und Cent in Euro", () => {
    expect(roundHours(5400)).toBe(1.5);
    expect(roundHours(0)).toBe(0);
    expect(centsToEur(15000)).toBe(150);
    expect(centsToEur(null)).toBeNull();
    expect(centsToEur(undefined)).toBeNull();
  });

  it("schreibt Stunden mit Minuten statt als Dezimalzahl", () => {
    expect(formatHours(1.5)).toBe("1:30 h");
    expect(formatHours(2)).toBe("2 h");
    expect(formatHours(0.25)).toBe("0:15 h");
  });

  it("zeigt einen fehlenden Betrag als Strich, nicht als null", () => {
    expect(formatEur(null)).toBe("—");
    expect(formatEur(150)).toMatch(/150/);
  });

  it("summiert Stunden und Beträge", () => {
    const total = totalRow([
      { label: "a", hours: 1.5, amountEur: 225 },
      { label: "b", hours: 2.25, amountEur: 337.5 },
    ]);
    expect(total.hours).toBe(3.75);
    expect(total.amountEur).toBe(562.5);
  });

  it("meldet die Summe als unbekannt, wenn keine Zeile einen Satz trägt", () => {
    // Ein "0 €" würde behaupten, die Arbeit sei unbezahlt gewesen.
    const total = totalRow([{ label: "a", hours: 1, amountEur: null }]);
    expect(total.amountEur).toBeNull();
    expect(total.hours).toBe(1);
  });

  it("summiert die bekannten Beträge, auch wenn einzelne fehlen", () => {
    const total = totalRow([
      { label: "a", hours: 1, amountEur: 150 },
      { label: "b", hours: 1, amountEur: null },
    ]);
    expect(total.amountEur).toBe(150);
    expect(total.hours).toBe(2);
  });

  it("macht aus dem Monatsschlüssel einen lesbaren Namen", () => {
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthLabel("2026-08-01T00:00:00Z")).toBe("August 2026");
    expect(monthLabel("kaputt")).toBe("kaputt");
  });
});
