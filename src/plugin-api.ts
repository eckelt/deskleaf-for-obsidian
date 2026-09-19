import type { Plugin } from "obsidian";
import type { CalendarReader } from "./calendar-reader";
import type { CalDAVReader } from "./caldav-reader";
import type { CompositeCalendarReader } from "./composite-calendar-reader";
import type { NoteManager } from "./note-manager";
import type { ICalFeedManager } from "./ical-feed-manager";
import type { DeskleafSettings } from "./types";

/** Whatever currently serves calendar events: the EventKit binary, CalDAV, or both. */
export type CalendarSource = CalendarReader | CalDAVReader | CompositeCalendarReader;

/**
 * The plugin surface that views, modals, settings and block processors may
 * use. They depend on this interface, never on the DeskleafPlugin class, so
 * main.ts stays the only module that knows the views and the import graph
 * has no cycle (the architecture twin flags one otherwise). It extends the
 * Obsidian Plugin type because settings tabs and views must hand a real
 * Plugin back to the Obsidian API.
 */
export interface DeskleafPluginApi extends Plugin {
  settings: DeskleafSettings;
  releaseDate: string | null;
  calendarReader: CalendarSource;
  noteManager: NoteManager;
  icalFeedManager: ICalFeedManager;
  saveSettings(): Promise<void>;
  reloadFeeds(): void;
}
