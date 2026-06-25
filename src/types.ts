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

export interface EventUpdate {
  title: string;
  start: string;
  end: string;
  location?: string;
  notes?: string;
  calendar?: string;
  span?: "this" | "series";
}

export interface AnchoredScrollInput {
  currentScrollTop: number;
  anchorOffsetY: number;
  previousHourPx: number;
  nextHourPx: number;
}

export interface CalendarViewTestElement {
  children: CalendarViewTestElement[];
  scrollTop: number;
  addClass: () => void;
  empty: () => void;
  createDiv: () => CalendarViewTestElement;
  querySelector: () => null;
}

export interface CalendarViewZoomHarness {
  app: { workspace: { trigger: () => void } };
  containerEl: CalendarViewTestElement & { children: CalendarViewTestElement[] };
  hourPx: number;
  visibleDays: number;
  anchor: Date;
  render: () => void;
  navigate: (dir: number) => void;
  gridHeight: () => number;
  clampHourPxToViewport: (scrollEl: { clientHeight: number }) => boolean;
  buildStatusBar: () => void;
  buildTimeGrid: () => void;
  buildMobileTodayFab: () => void;
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

export type NoteType = "meeting" | "interview" | "recurring" | "task" | "focus";

// 6 Monokai Pro calendar hues: pink · orange · yellow · green · cyan · purple
export const CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252] as const;

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

export interface DeskleafSettings {
  binaryPath: string; // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";
  templateFolder: string;
  notesFolder: string;
  topicsFolder: string;
  topicsOrder: string[];
  businessHours: BusinessHoursSettings;
  caldav: CalDAVSettings;
  icalSubscriptions: ICalFeedSubscription[];
}

export const DEFAULT_SETTINGS: DeskleafSettings = {
  binaryPath: "",
  weekStartsOn: "monday",
  templateFolder: "templates",
  notesFolder: "notes",
  topicsFolder: "topics",
  topicsOrder: [],
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
