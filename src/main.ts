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
        M 85.7 9.2
        C 80.2 9.9 71.4 11.7 63.8 11.4
        C 55.5 11.1 50.7 8.9 34.8 10.4
        C 18.9 11.9 8.9 23.0 7.5 36.0
        C 6.4 45.5 20.2 56.0 27.3 57.2
        C 38.7 52.4 55.3 41.6 64.4 34.0
        C 53.4 48.3 26.2 67.4 7.9 65.1
        C 7.5 68.6 7.5 71.5 8.6 73.2
        C 11.0 77.9 14.6 72.1 14.6 72.1
        C 14.6 72.1 22.7 69.5 30.3 66.2
        C 30.3 66.2 29.6 91.0 50.3 89.8
        C 73.7 88.5 82.5 74.8 87.0 59.6
        C 90.6 47.8 91.2 14.5 85.7 9.2 Z
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
    }

    // Create sidebar in left panel only if it doesn't already exist
    if (workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR).length === 0) {
      const leftLeaf = workspace.getLeftLeaf(false);
      if (leftLeaf) await leftLeaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: false });
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
