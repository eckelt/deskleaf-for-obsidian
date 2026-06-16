import { requestUrl } from "obsidian";

export interface CalDAVCalendar {
  href: string;
  displayName: string;
}

export class CalDAVClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.authHeader = "Basic " + btoa(`${username}:${password}`);
  }

  private async req(
    method: string,
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      ...extraHeaders,
    };
    if (body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/xml; charset=utf-8";
    }
    const resp = await requestUrl({
      url: this.abs(url),
      method,
      headers,
      body,
      throw: false,
    });
    return { status: resp.status, text: resp.text };
  }

  private abs(href: string): string {
    return href.startsWith("http") ? href : `${this.baseUrl}${href}`;
  }

  private parse(xml: string): Document {
    return new DOMParser().parseFromString(xml, "application/xml");
  }

  // ── Discovery ─────────────────────────────────────────────────

  async discoverCalendars(principalPath: string): Promise<CalDAVCalendar[]> {
    const homeHref = await this.findCalendarHome(principalPath);
    return this.listCalendars(homeHref);
  }

  private async findCalendarHome(principalPath: string): Promise<string> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`;
    const resp = await this.req("PROPFIND", principalPath, xml, { Depth: "0" });
    if (resp.status >= 400) throw new Error(`HTTP ${resp.status} — Zugangsdaten oder URL prüfen`);
    const href = this.parse(resp.text).querySelector("calendar-home-set href")?.textContent?.trim();
    if (!href) throw new Error("Kein calendar-home-set gefunden");
    return href;
  }

  private async listCalendars(homeHref: string): Promise<CalDAVCalendar[]> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:displayname/><D:resourcetype/></D:prop>
</D:propfind>`;
    const resp = await this.req("PROPFIND", homeHref, xml, { Depth: "1" });
    const doc = this.parse(resp.text);
    const calendars: CalDAVCalendar[] = [];
    for (const r of Array.from(doc.querySelectorAll("response"))) {
      const href = r.querySelector("href")?.textContent?.trim();
      const isCalendar = r.querySelector("calendar") !== null;
      const displayName = r.querySelector("displayname")?.textContent?.trim() ?? href ?? "";
      if (href && isCalendar && href !== homeHref) {
        calendars.push({ href, displayName });
      }
    }
    return calendars;
  }

  // ── Read ──────────────────────────────────────────────────────

  async fetchEvents(
    calendarHref: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ href: string; ical: string }>> {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data>
      <C:expand start="${fmt(from)}" end="${fmt(to)}"/>
    </C:calendar-data>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${fmt(from)}" end="${fmt(to)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const resp = await this.req("REPORT", calendarHref, xml, { Depth: "1" });
    if (resp.status >= 400) throw new Error(`CalDAV REPORT ${resp.status}`);

    const results: Array<{ href: string; ical: string }> = [];
    for (const r of Array.from(this.parse(resp.text).querySelectorAll("response"))) {
      const href = r.querySelector("href")?.textContent?.trim();
      const ical = r.querySelector("calendar-data")?.textContent;
      if (href && ical) results.push({ href, ical });
    }
    return results;
  }

  async getEvent(href: string): Promise<string> {
    const resp = await this.req("GET", href, undefined, { Accept: "text/calendar" });
    if (resp.status >= 400) throw new Error(`CalDAV GET ${resp.status}`);
    return resp.text;
  }

  // ── Write ─────────────────────────────────────────────────────

  async putEvent(href: string, icalText: string, create: boolean): Promise<void> {
    const resp = await this.req("PUT", href, icalText, {
      "Content-Type": "text/calendar; charset=utf-8",
      ...(create ? { "If-None-Match": "*" } : {}),
    });
    if (resp.status >= 400) throw new Error(`CalDAV PUT ${resp.status}: ${resp.text.slice(0, 300)}`);
  }

  async deleteEvent(href: string): Promise<void> {
    const resp = await this.req("DELETE", href);
    if (resp.status >= 400 && resp.status !== 404) throw new Error(`CalDAV DELETE ${resp.status}`);
  }

  async moveEvent(sourceHref: string, destinationHref: string): Promise<void> {
    const resp = await this.req("MOVE", sourceHref, undefined, {
      Destination: this.abs(destinationHref),
      Overwrite: "F",
    });
    if (resp.status >= 400) throw new Error(`CalDAV MOVE ${resp.status}: ${resp.text.slice(0, 300)}`);
  }

  hrefForEvent(calendarHref: string, uid: string): string {
    const base = this.abs(calendarHref.endsWith("/") ? calendarHref : calendarHref + "/");
    return `${base}${uid}.ics`;
  }
}
