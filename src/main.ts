import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { DeskleafSettingTab } from "./settings";
import { CalendarReader } from "./calendar-reader";
import { CalDAVReader } from "./caldav-reader";
import { NoteManager } from "./note-manager";
import { DeskleafCalendarView, VIEW_TYPE_CALENDAR } from "./calendar-view";
import { DeskleafSidebarView, VIEW_TYPE_SIDEBAR } from "./sidebar-view";
import { DeskleafSearchModal } from "./search-modal";
import { DEFAULT_SETTINGS, type DeskleafSettings, type CalendarEvent } from "./types";

export default class DeskleafPlugin extends Plugin {
  settings!: DeskleafSettings;
  private calendarCache: CalendarEvent[] = [];
  private calendarCacheDate: string | null = null;
  calendarReader!: CalendarReader | CalDAVReader;
  noteManager!: NoteManager;

  private makeReader(): CalendarReader | CalDAVReader {
    const { caldav } = this.settings;
    if (caldav.username && caldav.password) {
      return new CalDAVReader(caldav.url || "https://caldav.fastmail.com", caldav.username, caldav.password);
    }
    return new CalendarReader(this.getBinaryPath());
  }

  private getBinaryPath(): string {
    if (this.settings.binaryPath) return this.settings.binaryPath;
    const basePath: string | undefined = (this.app.vault.adapter as any).basePath;
    if (!basePath) return "deskleaf-calendar-sync"; // iOS: no filesystem path; binary won't exist → cache fallback
    return `${basePath}/${this.manifest.dir}/deskleaf-calendar-sync`;
  }

  async onload() {
    addIcon("dl-point", `
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="6"/>
      <line x1="50" y1="5"  x2="50" y2="16" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="50" y1="84" x2="50" y2="95" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="5"  y1="50" x2="16" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <line x1="84" y1="50" x2="95" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    `);

    addIcon("deskleaf-calendar", `
      <rect x="7" y="7" width="86" height="86" rx="8" fill="none" stroke="currentColor" stroke-width="7"/>
      <path fill="currentColor" d="M 15 7 Q 7 7 7 15 L 7 30 L 93 30 L 93 15 Q 93 7 85 7 Z"/>
      <g transform="translate(12,26) scale(1.2) translate(0.414023,0.934705)" style="fill-rule:evenodd;clip-rule:evenodd">
        <path fill="currentColor" d="M11.945,40.638C15.831,40.266 28.662,30.675 29.528,29.942C30.947,28.741 32.043,27.809 32.97,26.959C34.372,25.676 35.389,24.584 36.556,23.045C37.214,22.177 37.92,21.167 38.771,19.9C37.735,21.006 36.661,22.067 35.55,23.086C34.973,23.615 34.387,24.133 33.791,24.639C31.029,26.987 28.061,29.099 24.92,31.012C23.203,32.057 21.435,33.043 19.619,33.974C13.698,33 9.175,27.859 9.175,21.672C9.175,14.791 14.77,9.204 21.661,9.204L49.052,9.204L49.052,35.513C49.052,42.395 43.457,47.982 36.566,47.982C30.155,47.982 24.866,43.146 24.16,36.931L24.08,37.048C24.08,37.048 17.148,42.54 13.712,43.8C13.077,44.032 11.683,42.31 11.945,40.638Z"/>
      </g>
    `);

    addIcon("deskleaf", `
      <g transform="scale(1.6667) translate(0.414023,0.934705)" style="fill-rule:evenodd;clip-rule:evenodd">
        <path fill="currentColor" d="M11.945,40.638C15.831,40.266 28.662,30.675 29.528,29.942C30.947,28.741 32.043,27.809 32.97,26.959C34.372,25.676 35.389,24.584 36.556,23.045C37.214,22.177 37.92,21.167 38.771,19.9C37.735,21.006 36.661,22.067 35.55,23.086C34.973,23.615 34.387,24.133 33.791,24.639C31.029,26.987 28.061,29.099 24.92,31.012C23.203,32.057 21.435,33.043 19.619,33.974C13.698,33 9.175,27.859 9.175,21.672C9.175,14.791 14.77,9.204 21.661,9.204L49.052,9.204L49.052,35.513C49.052,42.395 43.457,47.982 36.566,47.982C30.155,47.982 24.866,43.146 24.16,36.931L24.08,37.048C24.08,37.048 17.148,42.54 13.712,43.8C13.077,44.032 11.683,42.31 11.945,40.638Z"/>
      </g>
    `);

    await this.loadSettings();

    this.calendarReader = this.makeReader();
    this.calendarReader.setCacheCallbacks(
      async (events, date) => {
        this.calendarCache = events;
        this.calendarCacheDate = date;
        await this.saveData({ ...this.settings, calendarCache: events, calendarCacheDate: date });
      },
      async () => ({ events: this.calendarCache, date: this.calendarCacheDate })
    );
    this.noteManager = new NoteManager(this.app, this.settings);

    this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new DeskleafCalendarView(leaf, this));
    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new DeskleafSidebarView(leaf, this));

    this.app.workspace.onLayoutReady(async () => {
      await this.calendarReader.load();
      this.calendarReader.startWatching();
      await this.noteManager.runRemovalCleanup();
      await this.openDefaultViews();
    });

    this.addRibbonIcon("deskleaf", "Deskleaf: Kalender", () => this.activateView(VIEW_TYPE_CALENDAR));
    this.addRibbonIcon("dl-point", "Deskleaf: Sidebar", () => this.activateSidebar());
    this.addRibbonIcon("search", "Deskleaf: Suche", () => new DeskleafSearchModal(this.app, this).open());

    this.addCommand({
      id: "dl-open-calendar",
      name: "Kalender öffnen",
      callback: () => this.activateView(VIEW_TYPE_CALENDAR),
    });

    this.addCommand({
      id: "dl-open-sidebar",
      name: "Sidebar öffnen",
      callback: () => this.activateSidebar(),
    });

    this.addCommand({
      id: "dl-search",
      name: "Suche öffnen",
      hotkeys: [{ modifiers: ["Mod"], key: "f" }],
      callback: () => new DeskleafSearchModal(this.app, this).open(),
    });

    this.addSettingTab(new DeskleafSettingTab(this.app, this));
    window.addEventListener("beforeunload", this._beforeUnloadHandler);
  }

  onunload() {
    window.removeEventListener("beforeunload", this._beforeUnloadHandler);
    this.calendarReader.stopWatching();
  }

  private _beforeUnloadHandler = () => this.calendarReader.stopWatching();

  async loadSettings() {
    const data = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.calendarCache = data.calendarCache ?? [];
    this.calendarCacheDate = data.calendarCacheDate ?? null;
  }

  async saveSettings() {
    const { caldav } = this.settings;
    if (caldav.username && caldav.password) {
      if (this.calendarReader instanceof CalDAVReader) {
        this.calendarReader.updateCredentials(caldav.url, caldav.username, caldav.password);
      } else {
        this.calendarReader.stopWatching();
        this.calendarReader = this.makeReader();
        this.calendarReader.setCacheCallbacks(
          async (events, date) => {
            this.calendarCache = events;
            this.calendarCacheDate = date;
            await this.saveData({ ...this.settings, calendarCache: events, calendarCacheDate: date });
          },
          async () => ({ events: this.calendarCache, date: this.calendarCacheDate }),
        );
        await this.calendarReader.load();
        this.calendarReader.startWatching();
      }
    } else {
      this.calendarReader.setBinaryPath(this.getBinaryPath());
    }
    await this.saveData({ ...this.settings, calendarCache: this.calendarCache, calendarCacheDate: this.calendarCacheDate });
  }

  private async ensureView(
    viewType: string,
    getLeaf: () => WorkspaceLeaf | null,
    active: boolean,
  ) {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(viewType);
    if (leaves.length === 0) {
      const leaf = getLeaf();
      // updateHeader() re-reads getIcon() after addIcon() has been called.
      if (leaf) await leaf.setViewState({ type: viewType, active });
    } else {
      (leaves[0] as any).updateHeader?.();
    }
  }

  private async openDefaultViews() {
    const { workspace } = this.app;
    await this.ensureView(VIEW_TYPE_CALENDAR, () => workspace.getLeaf(false), true);
    await this.ensureView(VIEW_TYPE_SIDEBAR, () => workspace.getLeftLeaf(false), false);
    workspace.revealLeaf(workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0]);
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
