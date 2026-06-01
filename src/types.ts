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

export type NoteType = "meeting" | "interview" | "recurring" | "task";

// 8 wählbare Farbtöne (Hue-Werte) für Kalender
export const CAL_COLOR_PALETTE = [4, 28, 42, 130, 183, 210, 268, 322] as const;

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

export interface DeskleafSettings {
  binaryPath: string; // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";
  templateFolder: string;
  notesFolder: string;
  topicsFolder: string;
  topicsOrder: string[];
  caldav: CalDAVSettings;
}

export const DEFAULT_SETTINGS: DeskleafSettings = {
  binaryPath: "",
  weekStartsOn: "monday",
  templateFolder: "templates",
  notesFolder: "notes",
  topicsFolder: "topics",
  topicsOrder: [],
  caldav: {
    url: "https://caldav.fastmail.com",
    username: "",
    password: "",
    selectedCalendars: [],
    discoveredCalendars: [],
    calendarColors: {},
  },
};
