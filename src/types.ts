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
  /** Join link from RFC 7986 CONFERENCE, falling back to URL. */
  conferenceUrl?: string | null;
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

/** A todo line's status character, classified by classifyTodoStatus in todo-parser.ts. */
export type TodoStatus = "open" | "closed" | "important";

/** A customers/ note, reduced to what event matching and linking need. */
export interface CustomerRef {
  name: string;
  slug: string;
  path: string;
  /** Raw `logo:` frontmatter; interpreted by parseLogo in note-logo.ts. */
  logo?: string;
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
  /** `done: true` in the note's frontmatter — the project is finished. */
  done: boolean;
}

// 6 Monokai Pro calendar hues: pink · orange · yellow · green · cyan · purple
export const CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252] as const;

/**
 * Per-hue tones for the calendar palette.
 *
 * HSL lightness is not perceptually uniform: at the same L a yellow reads far
 * brighter than a purple. One shared formula therefore either washes the yellow
 * out or drowns the purple — which is why every palette hue carries its own
 * values, for both themes.
 *
 * The compensation runs in opposite directions: on a light surface the dark
 * hues may stay dark, while on a dark surface they have to be lifted to stay
 * visible. Yellow and purple are the two ends of that.
 *
 * `bgS`/`bgL` are the card surface, `bdL` the left accent bar, `txL` the text.
 * Bar and text run at or near full saturation in both themes.
 */
export interface CalToneMode {
  bgS: number;
  bgL: number;
  bdL: number;
  txL: number;
}

export interface CalTone {
  light: CalToneMode;
  dark: CalToneMode;
  /**
   * Surface of the selected card. It carries near-white text in both themes, so
   * one value serves both — and it has to be dark enough for that text. The
   * previous shared 38 % left yellow at 2.7:1 and green at 2.4:1.
   */
  selL: number;
}

export const CAL_TONES: Record<number, CalTone> = {
  346: { light: { bgS: 95, bgL: 88, bdL: 42, txL: 30 }, dark: { bgS: 55, bgL: 16, bdL: 58, txL: 76 }, selL: 40 },
  21: { light: { bgS: 100, bgL: 88, bdL: 48, txL: 28 }, dark: { bgS: 55, bgL: 16, bdL: 55, txL: 72 }, selL: 38 },
  48: { light: { bgS: 100, bgL: 88, bdL: 50, txL: 25 }, dark: { bgS: 55, bgL: 16, bdL: 52, txL: 66 }, selL: 26 },
  96: { light: { bgS: 100, bgL: 88, bdL: 38, txL: 22 }, dark: { bgS: 55, bgL: 16, bdL: 48, txL: 62 }, selL: 25 },
  188: { light: { bgS: 100, bgL: 88, bdL: 40, txL: 24 }, dark: { bgS: 55, bgL: 16, bdL: 50, txL: 64 }, selL: 28 },
  252: { light: { bgS: 100, bgL: 88, bdL: 48, txL: 32 }, dark: { bgS: 55, bgL: 16, bdL: 68, txL: 78 }, selL: 45 },
};

/** Tones for a hue outside the palette — a custom colour or Obsidian's accent. */
export const CAL_TONE_FALLBACK: CalTone = {
  light: { bgS: 95, bgL: 88, bdL: 45, txL: 27 },
  dark: { bgS: 55, bgL: 16, bdL: 55, txL: 70 },
  selL: 34,
};

export function calTone(hue: number): CalTone {
  return CAL_TONES[hue] ?? CAL_TONE_FALLBACK;
}

/**
 * The solid colour that stands for a calendar: the swatches in the settings,
 * the dot in the event editor, any legend. It is the accent bar's colour, so a
 * swatch always matches the bar on the cards it produces.
 */
export function calSwatchColor(hue: number, isDark: boolean): string {
  const tone = isDark ? calTone(hue).dark : calTone(hue).light;
  return `hsl(${hue} 100% ${tone.bdL}%)`;
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

/**
 * SolidTime access for the ```solidtime blocks. The key lives in the plugin's
 * data.json, in clear text like every Obsidian plugin setting — keep that file
 * out of version control.
 */
export interface SolidTimeSettings {
  apiKey: string;
  /** Only needed when the account belongs to more than one organization. */
  organizationId: string;
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
  solidtime: SolidTimeSettings;
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
  solidtime: {
    apiKey: "",
    organizationId: "",
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
