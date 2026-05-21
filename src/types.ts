// Internal normalized event — used throughout the plugin
export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO8601
  end: string;   // ISO8601
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
  date: string;       // YYYY-MM-DD
  start: string;      // HH:MM
  end: string;        // HH:MM
  location: string;
  attendees: string[];
  type: NoteType;
  toBeRemoved: boolean;
  removalDate: string | null;
  topics: string[];
}

export type NoteType = "meeting" | "interview" | "recurring" | "task";

export interface DeskleafSettings {
  binaryPath: string;   // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";
  templateFolder: string;
  notesFolder: string;
  topicsFolder: string;
  topicsOrder: string[];
}

export const DEFAULT_SETTINGS: DeskleafSettings = {
  binaryPath: "",
  weekStartsOn: "monday",
  templateFolder: "templates",
  notesFolder: "notes",
  topicsFolder: "topics",
  topicsOrder: [],
};
