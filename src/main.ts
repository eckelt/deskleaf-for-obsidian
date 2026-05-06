import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { FocalSettingTab } from "./settings";
import { CalendarReader } from "./calendar-reader";
import { NoteManager } from "./note-manager";
import { FocalCalendarView, VIEW_TYPE_FOCAL } from "./calendar-view";
import { FocalSidebarView, VIEW_TYPE_SIDEBAR } from "./sidebar-view";
import { FocalSearchModal } from "./search-modal";
import { DEFAULT_SETTINGS, type FocalSettings, type CalendarEvent } from "./types";

export default class FocalPlugin extends Plugin {
  settings!: FocalSettings;
  private calendarCache: CalendarEvent[] = [];
  private calendarCacheDate: string | null = null;
  calendarReader!: CalendarReader;
  noteManager!: NoteManager;

  private getBinaryPath(): string {
    if (this.settings.binaryPath) return this.settings.binaryPath;
    const basePath: string | undefined = (this.app.vault.adapter as any).basePath;
    if (!basePath) return "focal-cal"; // iOS: no filesystem path; binary won't exist → cache fallback
    return `${basePath}/${this.manifest.dir}/focal-cal`;
  }

  async onload() {
    addIcon("focal-point", `
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="6"/>
      <line x1="50" y1="5"  x2="50" y2="16" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="50" y1="84" x2="50" y2="95" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="5"  y1="50" x2="16" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="84" y1="50" x2="95" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    `);

    addIcon("deskleaf", `
      <path fill="currentColor" d="
        M 30.2 64.1
        C 29.1 63.9 22.2 62.6 18.7 58.8
        C 15.0 54.6 10.6 49.0 17.6 36.4
        C 21.1 30.2 26.1 25.1 33.6 20.5
        C 40.3 16.3 49.2 15.4 57.9 15.6
        C 74.9 16.1 80.1 14.8 83.9 11.7
        C 83.9 11.7 85.8 37.1 83.3 50.1
        C 80.9 62.1 71.0 83.1 49.2 82.2
        C 38.1 81.8 34.1 71.9 32.8 67.4
        C 27.9 71.8 24.1 76.4 21.0 83.7
        C 20.9 83.8 20.3 85.1 19.0 84.8
        C 18.7 84.7 18.3 84.0 18.2 83.4
        C 18.4 83.3 18.5 83.2 18.7 83.1
        C 18.8 83.1 18.8 82.9 18.9 82.8
        C 22.3 74.8 26.6 70.1 32.2 65.3
        C 34.1 63.6 36.3 61.9 38.6 60.2
        C 38.8 59.9 39.1 59.7 39.4 59.5
        C 50.2 51.1 64.2 36.0 64.4 35.6
        C 64.5 35.4 64.3 35.2 64.4 35.1
        C 64.2 35.1 64.0 35.0 63.9 35.1
        C 63.7 35.2 63.6 35.4 63.5 35.5
        C 59.6 39.5 51.4 47.3 44.2 53.3
        C 39.3 57.4 34.5 60.5 30.2 64.1 Z
      "/>
    `);

    await this.loadSettings();

    this.calendarReader = new CalendarReader(this.getBinaryPath());
    this.calendarReader.setCacheCallbacks(
      async (events, date) => {
        this.calendarCache = events;
        this.calendarCacheDate = date;
        await this.saveData({ ...this.settings, calendarCache: events, calendarCacheDate: date });
      },
      async () => ({ events: this.calendarCache, date: this.calendarCacheDate })
    );
    this.noteManager = new NoteManager(this.app, this.settings);

    // Register views
    this.registerView(VIEW_TYPE_FOCAL, (leaf) => new FocalCalendarView(leaf, this));
    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new FocalSidebarView(leaf, this));

    // Load calendar data and open views once the vault is ready
    this.app.workspace.onLayoutReady(async () => {
      await this.calendarReader.load();
      this.calendarReader.startWatching();
      await this.noteManager.runRemovalCleanup();
      await this.openDefaultViews();
    });

    // Ribbon icons
    this.addRibbonIcon("deskleaf", "Deskleaf: Kalender", () => this.activateView(VIEW_TYPE_FOCAL));
    this.addRibbonIcon("focal-point", "Deskleaf: Sidebar", () => this.activateSidebar());
    this.addRibbonIcon("search", "Deskleaf: Suche", () => new FocalSearchModal(this.app, this).open());

    // Commands
    this.addCommand({
      id: "focal-open-calendar",
      name: "Kalender öffnen",
      callback: () => this.activateView(VIEW_TYPE_FOCAL),
    });

    this.addCommand({
      id: "focal-open-sidebar",
      name: "Sidebar öffnen",
      callback: () => this.activateSidebar(),
    });

    this.addCommand({
      id: "focal-search",
      name: "Suche öffnen",
      hotkeys: [{ modifiers: ["Mod"], key: "f" }],
      callback: () => new FocalSearchModal(this.app, this).open(),
    });

    this.addSettingTab(new FocalSettingTab(this.app, this));
  }

  onunload() {
    this.calendarReader.stopWatching();
  }

  async loadSettings() {
    const data = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.calendarCache = data.calendarCache ?? [];
    this.calendarCacheDate = data.calendarCacheDate ?? null;
  }

  async saveSettings() {
    this.calendarReader?.setBinaryPath(this.getBinaryPath());
    await this.saveData({ ...this.settings, calendarCache: this.calendarCache, calendarCacheDate: this.calendarCacheDate });
  }

  private async openDefaultViews() {
    const { workspace } = this.app;

    // Open calendar in main area if not already open
    if (workspace.getLeavesOfType(VIEW_TYPE_FOCAL).length === 0) {
      const leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_FOCAL, active: true });
    } else {
      // updateHeader() re-reads getIcon() and re-renders the tab icon.
      // Needed because Obsidian can paint tab headers before addIcon()
      // has been called during plugin load.
      (workspace.getLeavesOfType(VIEW_TYPE_FOCAL)[0] as any).updateHeader?.();
    }

    // Create sidebar in left panel only if it doesn't already exist
    if (workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR).length === 0) {
      const leftLeaf = workspace.getLeftLeaf(false);
      if (leftLeaf) await leftLeaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: false });
    } else {
      (workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0] as any).updateHeader?.();
    }

    workspace.revealLeaf(workspace.getLeavesOfType(VIEW_TYPE_FOCAL)[0]);
  }

  private async activateSidebar() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const leftLeaf = workspace.getLeftLeaf(false);
      if (leftLeaf) {
        await leftLeaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
        workspace.revealLeaf(leftLeaf);
      }
    }
  }

  async activateView(viewType: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: viewType, active: true });
    }

    workspace.revealLeaf(leaf);
  }
}
