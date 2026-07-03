import type { CalendarEvent, EventUpdate, EventRsvp, RsvpResponse } from "./types";
import { cleanBody } from "./note-utils";

// ── Line unfolding & property parsing ────────────────────────────

function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

interface ICalProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProp(line: string): ICalProp {
  const colon = line.indexOf(":");
  if (colon === -1) return { name: line.toUpperCase(), params: {}, value: "" };
  const namePart = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = namePart.split(";");
  const name = segs[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf("=");
    if (eq !== -1) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1);
  }
  return { name, params, value };
}

// ── DateTime conversion ───────────────────────────────────────────

function pad2(n: number): string { return n.toString().padStart(2, "0"); }

function wallClockToUtcMs(
  yr: number, mo: number, da: number,
  hr: number, mi: number, se: number,
  tzid: string,
): number {
  const approxUtc = Date.UTC(yr, mo - 1, da, hr, mi, se);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tzid,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(new Date(approxUtc))) p[type] = value;
  const h = +p.hour === 24 ? 0 : +p.hour;
  const wallAtApprox = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second);
  return approxUtc - (wallAtApprox - approxUtc);
}

function parseICalDateTime(value: string, params: Record<string, string>): string {
  if (params.VALUE === "DATE" || !value.includes("T")) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  const yr = +value.slice(0, 4), mo = +value.slice(4, 6), da = +value.slice(6, 8);
  const hr = +value.slice(9, 11), mi = +value.slice(11, 13), se = +value.slice(13, 15);

  if (value.endsWith("Z")) {
    return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(9,11)}:${value.slice(11,13)}:${value.slice(13,15)}Z`;
  }

  const tzid = params.TZID;
  if (tzid) {
    try {
      const utcMs = wallClockToUtcMs(yr, mo, da, hr, mi, se, tzid);
      return new Date(utcMs).toISOString().replace(".000", "");
    } catch { /* fall through to floating */ }
  }

  // Floating: return wall clock as-is (no offset)
  return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${pad2(hr)}:${pad2(mi)}:${pad2(se)}`;
}

// iCal DTEND for DATE-only (all-day) events is exclusive per RFC 5545.
// Subtract one day to make it inclusive, matching how the calendar view renders spans.
function allDayEndInclusive(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Text unescaping ───────────────────────────────────────────────

function unescape(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// ── Meeting platform detection (mirrors Swift MeetingPlatform.swift) ─

function detectMeetingPlatform(haystack: string): string | undefined {
  if (haystack.includes("zoom.us")) return "zoom";
  if (haystack.includes("teams.microsoft.com") || haystack.includes("teams.live.com")) return "teams";
  if (haystack.includes("meet.google.com")) return "meet";
  if (haystack.includes("jitsi") || haystack.includes("meet.jit.si")) return "jitsi";
  if (haystack.includes("webex.com")) return "webex";
  return undefined;
}

// ── VEVENT builder ────────────────────────────────────────────────

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildProps(props: ICalProp[]): Record<string, ICalProp[]> {
  const map: Record<string, ICalProp[]> = {};
  for (const p of props) {
    if (!map[p.name]) map[p.name] = [];
    map[p.name].push(p);
  }
  return map;
}

function normalizeMailto(value: string): string {
  return value.replace(/^mailto:/i, "").trim().toLowerCase();
}

function rsvpStatusFromPartstat(value: string | undefined): RsvpResponse | null {
  switch (value?.toUpperCase()) {
    case "ACCEPTED":
      return "accepted";
    case "TENTATIVE":
      return "tentative";
    case "DECLINED":
      return "declined";
    default:
      return null;
  }
}

function findEventRsvp(attendeeProps: ICalProp[], currentUserEmail: string | undefined): EventRsvp | undefined {
  const normalizedUser = currentUserEmail?.trim().toLowerCase();
  if (!normalizedUser) return undefined;
  const match = attendeeProps.find((attendee) => normalizeMailto(attendee.value) === normalizedUser);
  if (!match) return undefined;
  return {
    attendeeEmail: normalizeMailto(match.value),
    status: rsvpStatusFromPartstat(match.params.PARTSTAT),
  };
}

function buildEvent(props: ICalProp[], calendarName: string, currentUserEmail?: string): CalendarEvent | null {
  const m = buildProps(props);
  const first = (name: string) => m[name]?.[0];

  const uid = first("UID")?.value;
  const dtstart = first("DTSTART");
  if (!uid || !dtstart) return null;

  const recurrenceId = first("RECURRENCE-ID");
  const id = recurrenceId ? `${uid}_${recurrenceId.value}` : uid;

  const dtend = first("DTEND");
  const start = parseICalDateTime(dtstart.value, dtstart.params);
  let end = dtend ? parseICalDateTime(dtend.value, dtend.params) : start;
  const isAllDay = dtstart.params.VALUE === "DATE" || !dtstart.value.includes("T");

  if (isAllDay && end) {
    end = allDayEndInclusive(end);
  }

  const attendeeProps = m["ATTENDEE"] ?? [];
  const attendees = attendeeProps
    .map(p => p.params.CN ?? p.value.replace(/^mailto:/i, ""))
    .filter(Boolean);
  const rsvp = findEventRsvp(attendeeProps, currentUserEmail);

  const organizerProp = first("ORGANIZER");
  const organizer = unescape(
    organizerProp?.params.CN ?? organizerProp?.value.replace(/^mailto:/i, "") ?? null
  );

  const location = unescape(first("LOCATION")?.value ?? null);
  const description = unescape(first("DESCRIPTION")?.value ?? null);
  const url = first("URL")?.value ?? null;
  const haystack = [description, url, location].filter(Boolean).join(" ").toLowerCase();

  return {
    id,
    title: unescape(first("SUMMARY")?.value ?? null) ?? "(no title)",
    start,
    end,
    isAllDay,
    location,
    body: cleanBody(description),
    attendees,
    numAttendees: attendeeProps.length,
    organizer,
    ...(rsvp ? { rsvp } : {}),
    isRecurring: !!first("RRULE") || !!first("RECURRENCE-ID"),
    isCancelled: first("STATUS")?.value?.toUpperCase() === "CANCELLED",
    meetingPlatform: detectMeetingPlatform(haystack),
    calendar: calendarName,
  };
}

// ── Public API ────────────────────────────────────────────────────

export function parseICalendar(icalText: string, calendarName = "", currentUserEmail?: string): CalendarEvent[] {
  const lines = unfold(icalText).split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let inEvent = false;
  let props: ICalProp[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { inEvent = true; props = []; }
    else if (line === "END:VEVENT") {
      inEvent = false;
      const ev = buildEvent(props, calendarName, currentUserEmail);
      if (ev) events.push(ev);
    } else if (inEvent) {
      props.push(parseProp(line));
    }
  }
  return events;
}

const fmtDT = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

export function buildVEvent(params: {
  uid: string;
  summary: string;
  dtstart: string; // ISO8601
  dtend: string;   // ISO8601
  description?: string;
  location?: string;
}): string {
  const start = params.dtstart;
  const end = params.dtend;
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start);

  const dtStartLine = isAllDay
    ? `DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`
    : `DTSTART:${fmtDT(new Date(start))}`;
  const dtEndLine = isAllDay
    ? `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`
    : `DTEND:${fmtDT(new Date(end))}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Deskleaf//Deskleaf//EN",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${fmtDT(new Date())}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeText(params.summary ?? "")}`,
  ];
  if (params.description) lines.push(`DESCRIPTION:${escapeText(params.description)}`);
  if (params.location) lines.push(`LOCATION:${escapeText(params.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

export function updateVEventTimes(icalText: string, newStart: string, newEnd: string): string {
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(newStart);
  const dtStartLine = isAllDay
    ? `DTSTART;VALUE=DATE:${newStart.replace(/-/g, "")}`
    : `DTSTART:${fmtDT(new Date(newStart))}`;
  const dtEndLine = isAllDay
    ? `DTEND;VALUE=DATE:${newEnd.replace(/-/g, "")}`
    : `DTEND:${fmtDT(new Date(newEnd))}`;

  return updateFirstVEvent(icalText, (eventText) => {
    let next = upsertEventLine(eventText, "DTSTART", dtStartLine);
    next = upsertEventLine(next, "DTEND", dtEndLine);
    return next;
  });
}

function lineForTextProp(name: string, value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? `${name}:${escapeText(trimmed)}` : null;
}

function updateFirstVEvent(icalText: string, update: (eventText: string) => string): string {
  return icalText.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/, update);
}

function upsertEventLine(eventText: string, propName: string, line: string | null): string {
  const re = new RegExp(`^${propName}[^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*`, "m");
  if (re.test(eventText)) {
    if (line) return eventText.replace(re, line);
    return eventText.replace(new RegExp(`^${propName}[^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*(\\r?\\n)?`, "m"), "");
  }
  if (!line) return eventText;
  return eventText.replace(/^END:VEVENT/m, `${line}\r\nEND:VEVENT`);
}

export function updateVEvent(icalText: string, update: EventUpdate): string {
  let next = updateVEventTimes(icalText, update.start, update.end);
  next = updateFirstVEvent(next, (eventText) =>
    upsertEventLine(
      upsertEventLine(
        upsertEventLine(eventText, "SUMMARY", `SUMMARY:${escapeText(update.title)}`),
        "LOCATION",
        lineForTextProp("LOCATION", update.location),
      ),
      "DESCRIPTION",
      lineForTextProp("DESCRIPTION", update.notes),
    )
  );
  return next;
}

function partstatForResponse(response: RsvpResponse): string {
  switch (response) {
    case "accepted":
      return "ACCEPTED";
    case "tentative":
      return "TENTATIVE";
    case "declined":
      return "DECLINED";
  }
}

function updateAttendeeLinePartstat(line: string, partstat: string): string {
  const colon = line.indexOf(":");
  if (colon === -1) return line;
  const namePart = line.slice(0, colon);
  const valuePart = line.slice(colon);
  if (/;PARTSTAT=/i.test(namePart)) {
    return `${namePart.replace(/;PARTSTAT=[^;:]*/i, `;PARTSTAT=${partstat}`)}${valuePart}`;
  }
  return `${namePart};PARTSTAT=${partstat}${valuePart}`;
}

export function updateVEventAttendeePartstat(
  icalText: string,
  attendeeEmail: string,
  response: RsvpResponse,
): string {
  const normalizedAttendeeEmail = attendeeEmail.trim().toLowerCase();
  const nextPartstat = partstatForResponse(response);

  return updateFirstVEvent(icalText, (eventText) => {
    const lines = eventText.split(/\r?\n/);
    let updated = false;
    const nextLines = lines.map((line) => {
      if (updated || !line.toUpperCase().startsWith("ATTENDEE")) return line;
      const colon = line.indexOf(":");
      if (colon === -1) return line;
      if (normalizeMailto(line.slice(colon + 1)) !== normalizedAttendeeEmail) return line;
      updated = true;
      return updateAttendeeLinePartstat(line, nextPartstat);
    });
    if (!updated) throw new Error("Keine passende Teilnehmerzeile für RSVP gefunden");
    return nextLines.join("\r\n");
  });
}
