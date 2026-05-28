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
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      ...extraHeaders,
    };
    if (body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/xml; charset=utf-8";
    }
    return fetch(this.abs(url), { method, headers, body });
  }

  private abs(href: string): string {
    return href.startsWith("http") ? href : `${this.baseUrl}${href}`;
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
    const doc = new DOMParser().parseFromString(await resp.text(), "application/xml");
    const href = doc.querySelector("calendar-home-set href")?.textContent?.trim();
    if (!href) throw new Error("Kein calendar-home-set gefunden — Zugangsdaten prüfen");
    return href;
  }

  private async listCalendars(homeHref: string): Promise<CalDAVCalendar[]> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:displayname/><D:resourcetype/></D:prop>
</D:propfind>`;
    const resp = await this.req("PROPFIND", homeHref, xml, { Depth: "1" });
    const doc = new DOMParser().parseFromString(await resp.text(), "application/xml");
    const calendars: CalDAVCalendar[] = [];
    for (const response of Array.from(doc.querySelectorAll("response"))) {
      const href = response.querySelector("href")?.textContent?.trim();
      const isCalendar = response.querySelector("calendar") !== null;
      const displayName = response.querySelector("displayname")?.textContent?.trim() ?? href ?? "";
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
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(".000", "");

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${fmt(from)}" end="${fmt(to)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const resp = await this.req("REPORT", calendarHref, xml, { Depth: "1" });
    if (!resp.ok && resp.status !== 207) {
      throw new Error(`CalDAV REPORT ${resp.status}: ${resp.statusText}`);
    }

    const doc = new DOMParser().parseFromString(await resp.text(), "application/xml");
    const results: Array<{ href: string; ical: string }> = [];
    for (const r of Array.from(doc.querySelectorAll("response"))) {
      const href = r.querySelector("href")?.textContent?.trim();
      const ical = r.querySelector("calendar-data")?.textContent;
      if (href && ical) results.push({ href, ical });
    }
    return results;
  }

  async getEvent(href: string): Promise<string> {
    const resp = await this.req("GET", href, undefined, {
      Accept: "text/calendar",
    });
    if (!resp.ok) throw new Error(`CalDAV GET ${resp.status}`);
    return resp.text();
  }

  // ── Write ─────────────────────────────────────────────────────

  async putEvent(href: string, icalText: string, create: boolean): Promise<void> {
    const resp = await this.req("PUT", href, icalText, {
      "Content-Type": "text/calendar; charset=utf-8",
      ...(create ? { "If-None-Match": "*" } : {}),
    });
    if (!resp.ok) throw new Error(`CalDAV PUT ${resp.status}: ${resp.statusText}`);
  }

  async deleteEvent(href: string): Promise<void> {
    const resp = await this.req("DELETE", href);
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`CalDAV DELETE ${resp.status}`);
    }
  }

  hrefForEvent(calendarHref: string, uid: string): string {
    const base = calendarHref.endsWith("/") ? calendarHref : calendarHref + "/";
    const absBase = this.abs(base);
    return `${absBase}${uid}.ics`;
  }
}
