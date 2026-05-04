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

    // Leaf shape with calendar grid inside (header strip + date dots)
    addIcon("deskleaf", `
      <path fill-rule="evenodd" fill="currentColor" d="
        M 50 85 C 34 84 18 70 16 56 C 14 42 20 24 36 18 C 44 14 58 14 68 22
        C 74 26 78 26 76 32 C 74 36 68 38 64 42
        C 74 52 76 66 68 76 C 60 84 56 86 50 85 Z
        M 26 80 C 20 82 14 88 16 92 C 20 96 28 90 28 84 Z
        M 26 31 L 70 31 L 70 40 L 26 40 Z
        M 32 50 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 43 50 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 54 50 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 65 50 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 32 61 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 43 61 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 54 61 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 65 61 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 32 72 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 43 72 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 54 72 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
        M 65 72 m -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0
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
