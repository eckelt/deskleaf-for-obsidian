import { Notice } from "obsidian";
import type { CalendarEvent } from "./types";
import type { ChildProcess, execFile as ExecFile, spawn as Spawn } from "child_process";
import type { existsSync as ExistsSync } from "fs";

export class CalendarReader {
  private binaryPath: string;
  private events: CalendarEvent[] = [];
  private loadError: string | null = null;
  private cacheDate: string | null = null;
  private watchers: Array<() => void> = [];
  private process: ChildProcess | null = null;
  private lineBuffer = "";
  private saveCache: ((events: CalendarEvent[], date: string) => Promise<void>) | null = null;
  private loadCacheFn: (() => Promise<{ events: CalendarEvent[]; date: string | null }>) | null = null;

  private initialLoaded = false;
  private execFile: typeof ExecFile | null = null;
  private spawn: typeof Spawn | null = null;
  private existsSync: typeof ExistsSync | null = null;

  constructor(binaryPath: string) {
    this.binaryPath = binaryPath;
    try {
      const cp = require("child_process") as typeof import("child_process");
      const fs = require("fs") as typeof import("fs");
      this.execFile  = cp.execFile;
      this.spawn     = cp.spawn;
      this.existsSync = fs.existsSync;
    } catch { /* mobile: Node.js modules unavailable */ }
  }

  setCacheCallbacks(
    save: (events: CalendarEvent[], date: string) => Promise<void>,
    load: () => Promise<{ events: CalendarEvent[]; date: string | null }>
  ) {
    this.saveCache = save;
    this.loadCacheFn = load;
  }

  setBinaryPath(newPath: string): void {
    if (newPath === this.binaryPath) return;
    this.binaryPath = newPath;
    this.stopProcess();
    this.startProcess();
  }

  getEvents(): CalendarEvent[] { return this.events; }
  getLoadError(): string | null { return this.loadError; }
  getCacheDate(): string | null { return this.cacheDate; }
  getPath(): string { return this.binaryPath; }

  getEventsForDate(date: string): CalendarEvent[] {
    const result: CalendarEvent[] = [];
    for (const e of this.events) {
      if (e.isAllDay) continue;
      const startDate = e.start.slice(0, 10);
      const endDate   = e.end.slice(0, 10);
      if (startDate > date || endDate < date) continue;
      if (startDate === date && endDate === date) { result.push(e); continue; }
      const sliceStart = startDate === date ? e.start : `${date}T00:00:00`;
      const sliceEnd   = endDate   === date ? e.end   : `${date}T23:59:59`;
      result.push({ ...e, start: sliceStart, end: sliceEnd,
        _continuesAfter: endDate > date, _continuesBefore: startDate < date } as any);
    }
    return result;
  }

  getAllDayEventsForDate(date: string): CalendarEvent[] {
    return this.events.filter((e) => {
      if (!e.isAllDay) return false;
      const s  = e.start.slice(0, 10);
      const en = e.end.slice(0, 10);
      return s <= date && date <= en;
    });
  }

  onChange(fn: () => void): () => void {
    this.watchers.push(fn);
    return () => { this.watchers = this.watchers.filter((w) => w !== fn); };
  }

  private notify(): void { for (const w of this.watchers) w(); }

  // ── Lifecycle ────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.execFile || !this.existsSync) {
      this.loadError = "Mobiles Gerät";
      await this.tryLoadCache();
      this.notify();
      return;
    }

    if (!this.existsSync(this.binaryPath)) {
      this.loadError = `deskleaf-calendar-sync nicht gefunden: ${this.binaryPath} — bitte swift/build.sh ausführen`;
      await this.tryLoadCache();
      this.notify();
      return;
    }

    return new Promise<void>((resolve) => {
      this.execFile!(
        this.binaryPath,
        ["export", "--days-back", "90", "--days-forward", "365"],
        { timeout: 15_000 },
        async (err, stdout) => {
          if (err) {
            this.loadError = `deskleaf-calendar-sync Fehler: ${err.message}`;
            await this.tryLoadCache();
          } else {
            this.handleLine(stdout.trim());
            if (this.events.length === 0 && !this.loadError) {
              this.loadError = "deskleaf-calendar-sync: keine Ausgabe (Kalenderzugriff verweigert?)";
              await this.tryLoadCache();
            }
          }
          resolve();
        }
      );
    });
  }

  startWatching(): void {
    this.startProcess();
  }

  stopWatching(): void {
    this.stopProcess();
  }

  // ── Watch process ────────────────────────────────────────────────

  private startProcess(): void {
    this.stopProcess();

    if (!this.spawn || !this.existsSync) return; // mobile
    if (!this.existsSync(this.binaryPath)) return;

    this.lineBuffer = "";
    const proc = this.spawn(this.binaryPath, [
      "watch", "--days-back", "90", "--days-forward", "365"
    ]);
    this.process = proc;

    proc.stdout.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      let nl = this.lineBuffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.lineBuffer.slice(0, nl).trim();
        this.lineBuffer = this.lineBuffer.slice(nl + 1);
        if (line) this.handleLine(line);
        nl = this.lineBuffer.indexOf("\n");
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.warn("[deskleaf-calendar-sync]", msg);
    });

    proc.on("error", async (err: Error) => {
      this.loadError = `deskleaf-calendar-sync konnte nicht gestartet werden: ${err.message}`;
      this.process = null;
      await this.tryLoadCache();
      this.notify();
    });

    proc.on("exit", async (code: number | null) => {
      if (code !== 0 && code !== null) {
        this.loadError = `deskleaf-calendar-sync beendet mit Code ${code}`;
        if (this.events.length === 0) await this.tryLoadCache();
        this.notify();
      }
      if (this.process === proc) this.process = null;
    });
  }

  private stopProcess(): void {
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
    }
  }

  private handleLine(line: string): void {
    if (!line) return;
    try {
      const events = JSON.parse(line) as CalendarEvent[];
      this.events    = events;
      this.loadError = null;
      this.cacheDate = new Date().toISOString();
      if (this.saveCache) this.saveCache(events, this.cacheDate);
      if (!this.initialLoaded) {
        new Notice(`Deskleaf: ${events.length} Events geladen`, 2000);
        this.initialLoaded = true;
      }
      console.log(`[Deskleaf] ${events.length} events received from binary`);
      this.notify();
    } catch (e) {
      console.error("[Focal] Failed to parse events from binary:", e);
    }
  }

  private async tryLoadCache(): Promise<void> {
    if (!this.loadCacheFn) return;
    const cached = await this.loadCacheFn();
    if (cached.events.length > 0) {
      this.events    = cached.events;
      this.cacheDate = cached.date;
      const dateStr  = this.formatCacheDate(cached.date);
      this.loadError = `${this.loadError ?? ""} — Cache vom ${dateStr}`.trim();
    }
  }

  private formatCacheDate(iso: string | null): string {
    if (!iso) return "unbekannt";
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  // ── Write operations ─────────────────────────────────────────────

  async createEvent(params: {
    title: string;
    start: string;
    end: string;
    calendar?: string;
    notes?: string;
    location?: string;
  }): Promise<string> {
    if (!this.execFile) return Promise.reject(new Error("Nicht auf diesem Gerät verfügbar"));
    return new Promise((resolve, reject) => {
      const args = [
        "create",
        "--title",    params.title,
        "--start",    params.start,
        "--end",      params.end,
        "--calendar", params.calendar ?? "",
        ...(params.notes    ? ["--notes",    params.notes]    : []),
        ...(params.location ? ["--location", params.location] : []),
      ];
      this.execFile!(this.binaryPath, args, { timeout: 10_000 }, (err, stdout) => {
        if (err) { reject(err); return; }
        resolve(stdout.trim());
      });
    });
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<void> {
    if (!this.execFile) return Promise.reject(new Error("Nicht auf diesem Gerät verfügbar"));
    return new Promise((resolve, reject) => {
      this.execFile!(
        this.binaryPath,
        ["move", "--id", id, "--start", newStart, "--end", newEnd],
        { timeout: 10_000 },
        (err) => { if (err) { reject(err); return; } resolve(); }
      );
    });
  }

  async cancelEvent(id: string, span: "this" | "future" = "this"): Promise<void> {
    if (!this.execFile) return Promise.reject(new Error("Nicht auf diesem Gerät verfügbar"));
    return new Promise((resolve, reject) => {
      this.execFile!(
        this.binaryPath,
        ["cancel", "--id", id, "--span", span],
        { timeout: 10_000 },
        (err) => { if (err) { reject(err); return; } resolve(); }
      );
    });
  }
}
