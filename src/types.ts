// Internal normalized event — used throughout the plugin
export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO8601
  end: string; // ISO8601
  location?: string | null;
  attendees?: string[];
  body?: string | null;
  calendar?: string;
  isRecurring?: boolean;
  isCancelled?: boolean;
  isAllDay?: boolean;
  isOrganizer?: boolean;
  meetingPlatform?: string;
  numAttendees?: number;
  organizer?: string | null;
  rsvp?: EventRsvp;
}

export type RsvpResponse = "accepted" | "tentative" | "declined";

export interface EventRsvp {
  attendeeEmail: string;
  status: RsvpResponse | null;
}

export interface EventUpdate {
  title: string;
  start: string;
  end: string;
  location?: string;
  notes?: string;
  calendar?: string;
  span?: "this" | "series";
}

export interface EventEditInput {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  calendar: string;
}

// Frontmatter for event notes
export interface EventNoteFrontmatter {
  "event-id": string;
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  location: string;
  attendees: string[];
  type: NoteType;
  toBeRemoved: boolean;
  removalDate: string | null;
  topics: string[];
}

export type NoteType = "termin" | "interview" | "recurring" | "task" | "focus";

/** A customers/ note, reduced to what event matching and linking need. */
export interface CustomerRef {
  name: string;
  slug: string;
  path: string;
  /** Frontmatter `domains: [acme.de]` — the primary evidence for a match. */
  domains: string[];
  /** Frontmatter `status:` — aktiv | pausiert | beendet. */
  status: string;
}

/** A people/ note, reduced to what attendee resolution needs. */
export interface PersonRef {
  name: string;
  path: string;
  emails: string[];
}

/** A projects/ note. */
export interface ProjectRef {
  name: string;
  path: string;
}

// 6 Monokai Pro calendar hues: pink · orange · yellow · green · cyan · purple
export const CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252] as const;

/**
 * Light-mode tones per hue.
 *
 * HSL lightness is not perceptually uniform: at the same L a yellow reads far
 * brighter than a purple. One shared formula therefore either washes the yellow
 * out or drowns the purple — which is why each palette hue carries its own
 * values. Pink and yellow are the reference pair the rest is tuned against.
 *
 * `bgS`/`bgL` are the card surface, `bdL` the left accent bar, `txL` the text;
 * bar and text always run at full saturation.
 */
export interface CalTone {
  bgS: number;
  bgL: number;
  bdL: number;
  txL: number;
}

export const CAL_TONES: Record<number, CalTone> = {
  346: { bgS: 95, bgL: 88, bdL: 42, txL: 30 },
  21: { bgS: 100, bgL: 88, bdL: 48, txL: 28 },
  48: { bgS: 100, bgL: 88, bdL: 50, txL: 25 },
  96: { bgS: 100, bgL: 88, bdL: 38, txL: 22 },
  188: { bgS: 100, bgL: 88, bdL: 40, txL: 24 },
  252: { bgS: 100, bgL: 88, bdL: 48, txL: 32 },
};

/** Tones for a hue outside the palette — a custom colour or Obsidian's accent. */
export const CAL_TONE_FALLBACK: CalTone = { bgS: 95, bgL: 88, bdL: 45, txL: 27 };

export function calTone(hue: number): CalTone {
  return CAL_TONES[hue] ?? CAL_TONE_FALLBACK;
}

export interface CalDAVSettings {
  url: string;
  username: string;
  password: string;
  /** hrefs der ausgewählten Kalender; leer = alle */
  selectedCalendars: string[];
  /** zuletzt entdeckte Kalender für die Settings-UI */
  discoveredCalendars: Array<{ href: string; displayName: string }>;
  /** displayName → Hue-Wert aus CAL_COLOR_PALETTE */
  calendarColors: Record<string, number>;
}

export interface ICalFeedSubscription {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  lastFetched: string | null;
  lastError: string | null;
  color?: number; // Hue from CAL_COLOR_PALETTE; optional for backward compatibility
}

export interface BusinessHoursSettings {
  enabled: boolean;
  start: string; // HH:MM
  end: string; // HH:MM
  days: number[]; // JavaScript weekday numbers: 1 = Monday, ... 5 = Friday
}

/** Folder layout of the Brain vault, shared with the Deskleaf MCP. */
export interface VaultSettings {
  meetingsFolder: string;
  customersFolder: string;
  peopleFolder: string;
  projectsFolder: string;
  /** Folders scanned for open todos; root notes are always included. */
  todoFolders: string[];
}

export interface DeskleafSettings {
  binaryPath: string; // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";
  templateFolder: string;
  /** Legacy notes/ folder — still read so pre-Brain notes keep resolving. */
  notesFolder: string;
  vault: VaultSettings;
  /** Persisted order of the customers and projects sidebar sections. */
  customersOrder: string[];
  projectsOrder: string[];
  businessHours: BusinessHoursSettings;
  caldav: CalDAVSettings;
  icalSubscriptions: ICalFeedSubscription[];
}

export const DEFAULT_SETTINGS: DeskleafSettings = {
  binaryPath: "",
  weekStartsOn: "monday",
  templateFolder: "_templates",
  notesFolder: "notes",
  vault: {
    meetingsFolder: "meetings",
    customersFolder: "customers",
    peopleFolder: "people",
    projectsFolder: "projects",
    todoFolders: ["meetings", "projects", "customers"],
  },
  customersOrder: [],
  projectsOrder: [],
  businessHours: {
    enabled: true,
    start: "09:00",
    end: "17:00",
    days: [1, 2, 3, 4, 5],
  },
  caldav: {
    url: "https://caldav.fastmail.com",
    username: "",
    password: "",
    selectedCalendars: [],
    discoveredCalendars: [],
    calendarColors: {},
  },
  icalSubscriptions: [],
};
