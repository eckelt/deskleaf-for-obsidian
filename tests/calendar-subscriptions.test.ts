import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseICalendar } from "../src/ical-parser";
import { CAL_COLOR_PALETTE } from "../src/types";
import type { CalendarEvent, ICalFeedSubscription, DeskleafSettings } from "../src/types";
import { ICalFeedManager, isFeedEvent } from "../src/ical-feed-manager";

// ── Shared fixtures ───────────────────────────────────────────────

const MINIMAL_ICAL = (uid: string, summary: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nDTSTART:20260603T090000Z\r\nDTEND:20260603T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

function makeFeed(overrides: Partial<ICalFeedSubscription> = {}): ICalFeedSubscription {
  return {
    id: "feed-001",
    label: "Abfuhrkalender",
    url: "https://example.com/muell.ics",
    enabled: true,
    lastFetched: null,
    lastError: null,
    ...overrides,
  };
}

// ── AC1 ───────────────────────────────────────────────────────────

describe("AC1 — iCal feed settings management", () => {
  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.

  it("DeskleafSettings carries an icalSubscriptions array defaulting to []", () => {
    const { DEFAULT_SETTINGS } = require("../src/types");
    expect(Array.isArray(DEFAULT_SETTINGS.icalSubscriptions)).toBe(true);
    expect(DEFAULT_SETTINGS.icalSubscriptions).toHaveLength(0);
  });

  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
  it("ICalFeedManager.addFeed accepts a https:// URL and stores it", () => {
    const manager = new ICalFeedManager([]);
    manager.addFeed({ label: "Müllkalender", url: "https://example.com/muell.ics" });
    const feeds = manager.getFeeds();
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe("https://example.com/muell.ics");
    expect(feeds[0].label).toBe("Müllkalender");
  });

  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
  it("ICalFeedManager.addFeed accepts a webcal:// URL and stores it", () => {
    const manager = new ICalFeedManager([]);
    manager.addFeed({ label: "WM-Spielplan", url: "webcal://example.com/wm.ics" });
    const feeds = manager.getFeeds();
    expect(feeds[0].url).toBe("webcal://example.com/wm.ics");
  });

  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
  it("ICalFeedManager.removeFeed removes the feed by id", () => {
    const feed = makeFeed({ id: "feed-to-remove" });
    const manager = new ICalFeedManager([feed]);
    manager.removeFeed("feed-to-remove");
    expect(manager.getFeeds()).toHaveLength(0);
  });

  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
  it("ICalFeedManager.setEnabled toggles a feed on and off", () => {
    const feed = makeFeed({ id: "f1", enabled: true });
    const manager = new ICalFeedManager([feed]);
    manager.setEnabled("f1", false);
    expect(manager.getFeeds()[0].enabled).toBe(false);
    manager.setEnabled("f1", true);
    expect(manager.getFeeds()[0].enabled).toBe(true);
  });

  // AC: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
  it("ICalFeedManager.renameFeed updates the label of an existing feed", () => {
    const feed = makeFeed({ id: "f2", label: "Old Name" });
    const manager = new ICalFeedManager([feed]);
    manager.renameFeed("f2", "New Name");
    expect(manager.getFeeds()[0].label).toBe("New Name");
  });
});

// ── AC2 ───────────────────────────────────────────────────────────

describe("AC2 — background polling and caching", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("ICalFeedManager.startPolling triggers an immediate fetch on start", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MINIMAL_ICAL("uid-1", "Test"));
    const manager = new ICalFeedManager([makeFeed()], { fetchFn });
    manager.startPolling();
    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    manager.stopPolling();
  });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("ICalFeedManager uses 60 minutes as the default polling interval", () => {
    const manager = new ICalFeedManager([]);
    expect(manager.getIntervalMinutes()).toBe(60);
  });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("ICalFeedManager respects a custom polling interval", () => {
    const manager = new ICalFeedManager([], { intervalMinutes: 15 });
    expect(manager.getIntervalMinutes()).toBe(15);
  });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("ICalFeedManager.stopPolling clears the interval so no further fetches occur", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MINIMAL_ICAL("uid-2", "Stopped"));
    const manager = new ICalFeedManager([makeFeed()], { fetchFn, intervalMinutes: 60 });
    manager.startPolling();
    await vi.runAllTimersAsync();
    manager.stopPolling();
    const callsAfterStop = fetchFn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000); // advance 3 hours
    expect(fetchFn).toHaveBeenCalledTimes(callsAfterStop);
  });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("ICalFeedManager.getCachedEvents returns previously fetched events after a successful poll", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MINIMAL_ICAL("uid-3", "Cached Event"));
    const manager = new ICalFeedManager([makeFeed({ id: "f-cache" })], { fetchFn });
    await manager.fetchFeed("f-cache");
    const cached = manager.getCachedEvents("f-cache");
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0].title).toBe("Cached Event");
  });

  // AC: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in data.json (analog zu calendarCache).
  it("disabled feeds are skipped during polling", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MINIMAL_ICAL("uid-4", "Skip Me"));
    const disabledFeed = makeFeed({ id: "f-disabled", enabled: false });
    const manager = new ICalFeedManager([disabledFeed], { fetchFn });
    manager.startPolling();
    await vi.runAllTimersAsync();
    expect(fetchFn).not.toHaveBeenCalled();
    manager.stopPolling();
  });
});

// ── AC3 ───────────────────────────────────────────────────────────

describe("AC3 — event appearance in calendar view", () => {
  // AC: Events aus abonnierten Feeds erscheinen in der Kalenderansicht als reguläre Event-Cards; jeder Feed erhält eine eigene Farbe aus CAL_COLOR_PALETTE, und der Feed-Name wird als calendar-Feld der CalendarEvent-Einträge gesetzt.
  it("parseICalendar sets the calendarName as the calendar field on every returned event", () => {
    const events = parseICalendar(MINIMAL_ICAL("uid-c3", "Spieltag"), "WM-Spielplan");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].calendar).toBe("WM-Spielplan");
  });

  // AC: Events aus abonnierten Feeds erscheinen in der Kalenderansicht als reguläre Event-Cards; jeder Feed erhält eine eigene Farbe aus CAL_COLOR_PALETTE, und der Feed-Name wird als calendar-Feld der CalendarEvent-Einträge gesetzt.
  it("ICalFeedManager.assignColors gives each feed a distinct hue from CAL_COLOR_PALETTE", () => {
    const feeds = [
      makeFeed({ id: "f-a", label: "Feed A" }),
      makeFeed({ id: "f-b", label: "Feed B" }),
      makeFeed({ id: "f-c", label: "Feed C" }),
    ];
    const manager = new ICalFeedManager(feeds);
    const colors = manager.assignColors();
    const hues = Object.values(colors);
    expect(hues).toHaveLength(3);
    expect(new Set(hues).size).toBe(3); // all distinct
    for (const hue of hues) {
      expect(CAL_COLOR_PALETTE).toContain(hue);
    }
  });

  // AC: Events aus abonnierten Feeds erscheinen in der Kalenderansicht als reguläre Event-Cards; jeder Feed erhält eine eigene Farbe aus CAL_COLOR_PALETTE, und der Feed-Name wird als calendar-Feld der CalendarEvent-Einträge gesetzt.
  it("ICalFeedManager.assignColors wraps around CAL_COLOR_PALETTE when there are more feeds than palette entries", () => {
    const feeds = Array.from({ length: CAL_COLOR_PALETTE.length + 2 }, (_, i) =>
      makeFeed({ id: `f-${i}`, label: `Feed ${i}` })
    );
    const manager = new ICalFeedManager(feeds);
    const colors = manager.assignColors();
    const hues = Object.values(colors);
    expect(hues.every((h) => (CAL_COLOR_PALETTE as ReadonlyArray<number>).includes(h))).toBe(true);
  });

  // AC: Events aus abonnierten Feeds erscheinen in der Kalenderansicht als reguläre Event-Cards; jeder Feed erhält eine eigene Farbe aus CAL_COLOR_PALETTE, und der Feed-Name wird als calendar-Feld der CalendarEvent-Einträge gesetzt.
  it("ICalFeedManager.getAllEvents merges events from all enabled feeds into a single flat array", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-merge-1", "Feed A Event"))
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-merge-2", "Feed B Event"));
    const feeds = [
      makeFeed({ id: "fa", label: "Feed A" }),
      makeFeed({ id: "fb", label: "Feed B" }),
    ];
    const manager = new ICalFeedManager(feeds, { fetchFn });
    await manager.fetchFeed("fa");
    await manager.fetchFeed("fb");
    const all = manager.getAllEvents();
    const titles = all.map((e) => e.title);
    expect(titles).toContain("Feed A Event");
    expect(titles).toContain("Feed B Event");
  });
});

// ── AC4 ───────────────────────────────────────────────────────────

describe("AC4 — read-only enforcement for feed events", () => {
  // AC: Abonnierte Feeds sind read-only — Drag-to-move, Drag-to-resize und Drag-to-create erzeugen für diese Events keine Schreiboperation; der Nutzer sieht keinen Drag-Handle und keinen Resize-Griff an diesen Cards.
  it("parseICalendar leaves organizer ownership unspecified for regular parsed events", () => {
    const events = parseICalendar(MINIMAL_ICAL("uid-ac4", "Read-only Event"), "Some Feed");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.isOrganizer === undefined)).toBe(true);
  });

  // AC: Abonnierte Feeds sind read-only — Drag-to-move, Drag-to-resize und Drag-to-create erzeugen für diese Events keine Schreiboperation; der Nutzer sieht keinen Drag-Handle und keinen Resize-Griff an diesen Cards.
  it("isFeedEvent returns true for events whose id starts with the ical: prefix", () => {
    const feedEvent: CalendarEvent = {
      id: "ical:feed-001:some-uid@example.com",
      title: "Feed Event",
      start: "2026-06-03T09:00:00Z",
      end: "2026-06-03T10:00:00Z",
      isOrganizer: false,
    };
    expect(isFeedEvent(feedEvent)).toBe(true);
  });

  // AC: Abonnierte Feeds sind read-only — Drag-to-move, Drag-to-resize und Drag-to-create erzeugen für diese Events keine Schreiboperation; der Nutzer sieht keinen Drag-Handle und keinen Resize-Griff an diesen Cards.
  it("isFeedEvent returns false for regular (non-feed) events", () => {
    const regularEvent: CalendarEvent = {
      id: "local-uid-12345",
      title: "Regular Event",
      start: "2026-06-03T09:00:00Z",
      end: "2026-06-03T10:00:00Z",
      isOrganizer: true,
    };
    expect(isFeedEvent(regularEvent)).toBe(false);
  });

  // AC: Abonnierte Feeds sind read-only — Drag-to-move, Drag-to-resize und Drag-to-create erzeugen für diese Events keine Schreiboperation; der Nutzer sieht keinen Drag-Handle und keinen Resize-Griff an diesen Cards.
  it("ICalFeedManager.fetchFeed prefixes event ids with ical:<feedId>:", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MINIMAL_ICAL("raw-uid-ac4", "Prefixed Event"));
    const manager = new ICalFeedManager([makeFeed({ id: "feed-prefix" })], { fetchFn });
    await manager.fetchFeed("feed-prefix");
    const events = manager.getCachedEvents("feed-prefix");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].id).toMatch(/^ical:feed-prefix:/);
  });
});

// ── AC5 ───────────────────────────────────────────────────────────

describe("AC5 — error isolation and fallback to cached data", () => {
  // AC: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.
  it("a failing fetch preserves the previously cached events for that feed", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-good", "Cached Before Failure"))
      .mockRejectedValueOnce(new Error("Network error"));
    const manager = new ICalFeedManager([makeFeed({ id: "f-err" })], { fetchFn });
    await manager.fetchFeed("f-err"); // succeeds, populates cache
    await manager.fetchFeed("f-err"); // fails — must not wipe cache
    const cached = manager.getCachedEvents("f-err");
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0].title).toBe("Cached Before Failure");
  });

  // AC: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.
  it("a failing fetch records the error message on the feed's lastError field", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("DNS lookup failed"));
    const manager = new ICalFeedManager([makeFeed({ id: "f-last-err" })], { fetchFn });
    await manager.fetchFeed("f-last-err");
    const feed = manager.getFeeds().find((f) => f.id === "f-last-err")!;
    expect(feed.lastError).toBeTruthy();
    expect(feed.lastError).toMatch(/DNS lookup failed/);
  });

  // AC: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.
  it("a failure on one feed does not affect the cached events of other feeds", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-ok", "Healthy Feed Event")) // feed-ok succeeds
      .mockRejectedValueOnce(new Error("Broken")); // feed-broken fails
    const manager = new ICalFeedManager(
      [makeFeed({ id: "feed-ok" }), makeFeed({ id: "feed-broken" })],
      { fetchFn }
    );
    await manager.fetchFeed("feed-ok");
    await manager.fetchFeed("feed-broken");
    const okEvents = manager.getCachedEvents("feed-ok");
    expect(okEvents.length).toBeGreaterThan(0);
    expect(okEvents[0].title).toBe("Healthy Feed Event");
  });

  // AC: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.
  it("ICalFeedManager.getWarnFeeds returns only feeds whose lastError is non-null", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-warn-ok", "Fine"))
      .mockRejectedValueOnce(new Error("Parse error: invalid VCALENDAR"));
    const manager = new ICalFeedManager(
      [makeFeed({ id: "warn-ok" }), makeFeed({ id: "warn-bad" })],
      { fetchFn }
    );
    await manager.fetchFeed("warn-ok");
    await manager.fetchFeed("warn-bad");
    const warnFeeds = manager.getWarnFeeds();
    expect(warnFeeds.map((f) => f.id)).toContain("warn-bad");
    expect(warnFeeds.map((f) => f.id)).not.toContain("warn-ok");
  });

  // AC: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.
  it("a successful fetch after a previous failure clears lastError", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("Temporary error"))
      .mockResolvedValueOnce(MINIMAL_ICAL("uid-recovery", "Recovered Event"));
    const manager = new ICalFeedManager([makeFeed({ id: "f-recovery" })], { fetchFn });
    await manager.fetchFeed("f-recovery"); // fails → sets lastError
    await manager.fetchFeed("f-recovery"); // succeeds → clears lastError
    const feed = manager.getFeeds().find((f) => f.id === "f-recovery")!;
    expect(feed.lastError).toBeNull();
  });
});
