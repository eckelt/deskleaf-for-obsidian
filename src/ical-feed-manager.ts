import type { CalendarEvent, ICalFeedSubscription } from "./types.ts";
import { CAL_COLOR_PALETTE } from "./types.ts";
import { parseICalendar } from "./ical-parser.ts";

type FetchFn = (url: string) => Promise<string>;

interface ICalFeedManagerOpts {
  fetchFn?: FetchFn;
  intervalMinutes?: number;
}

export function isFeedEvent(event: CalendarEvent): boolean {
  return event.id.startsWith("ical:");
}

export class ICalFeedManager {
  private feeds: ICalFeedSubscription[];
  private cache: Map<string, CalendarEvent[]> = new Map();
  private intervalMinutes: number;
  private fetchFn: FetchFn;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(feeds: ICalFeedSubscription[], opts: ICalFeedManagerOpts = {}) {
    this.feeds = feeds.map(f => ({ ...f }));
    this.intervalMinutes = opts.intervalMinutes ?? 60;
    this.fetchFn = opts.fetchFn ?? defaultFetchFn;
  }

  getFeeds(): ICalFeedSubscription[] {
    return this.feeds;
  }

  getIntervalMinutes(): number {
    return this.intervalMinutes;
  }

  addFeed(input: { label: string; url: string }): void {
    const id = generateId();
    this.feeds.push({ id, label: input.label, url: input.url, enabled: true, lastFetched: null, lastError: null });
  }

  removeFeed(id: string): void {
    this.feeds = this.feeds.filter(f => f.id !== id);
    this.cache.delete(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const feed = this.feeds.find(f => f.id === id);
    if (feed) feed.enabled = enabled;
  }

  renameFeed(id: string, label: string): void {
    const feed = this.feeds.find(f => f.id === id);
    if (feed) feed.label = label;
  }

  startPolling(): void {
    this._pollAll();
    this.intervalHandle = setInterval(() => this._pollAll(), this.intervalMinutes * 60 * 1000);
  }

  stopPolling(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async fetchFeed(feedId: string): Promise<void> {
    const feed = this.feeds.find(f => f.id === feedId);
    if (!feed) return;

    const url = feed.url.replace(/^webcal:/, "https:");
    try {
      const text = await this.fetchFn(url);
      const events = parseICalendar(text, feed.label).map(e => ({
        ...e,
        id: `ical:${feedId}:${e.id}`,
      }));
      this.cache.set(feedId, events);
      feed.lastFetched = new Date().toISOString();
      feed.lastError = null;
    } catch (err) {
      feed.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  getCachedEvents(feedId: string): CalendarEvent[] {
    return this.cache.get(feedId) ?? [];
  }

  getAllEvents(): CalendarEvent[] {
    const result: CalendarEvent[] = [];
    for (const feed of this.feeds) {
      if (feed.enabled) {
        const events = this.cache.get(feed.id);
        if (events) result.push(...events);
      }
    }
    return result;
  }

  assignColors(): Record<string, number> {
    const result: Record<string, number> = {};
    this.feeds.forEach((feed, i) => {
      result[feed.id] = CAL_COLOR_PALETTE[i % CAL_COLOR_PALETTE.length];
    });
    return result;
  }

  getWarnFeeds(): ICalFeedSubscription[] {
    return this.feeds.filter(f => f.lastError !== null);
  }

  private _pollAll(): void {
    for (const feed of this.feeds) {
      if (feed.enabled) {
        this.fetchFeed(feed.id).catch(() => { /* error stored on feed.lastError */ });
      }
    }
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Falls back used only in Obsidian runtime; tests always inject fetchFn.
function defaultFetchFn(url: string): Promise<string> {
  // requestUrl is Obsidian-only; accessed via dynamic require to keep this module testable in Node.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestUrl } = require("obsidian");
    return requestUrl({ url, method: "GET" }).then((r: { text: string }) => r.text);
  } catch {
    return fetch(url).then(r => r.text());
  }
}
