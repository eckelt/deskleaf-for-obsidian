import { App, Modal, TFile } from "obsidian";
import type DeskleafPlugin from "./main";
import { openFile } from "./open-file";

export class DeskleafSearchModal extends Modal {
  plugin: DeskleafPlugin;

  constructor(app: App, plugin: DeskleafPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dl-search-modal");

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Notizen durchsuchen…",
      cls: "dl-search-input",
    });

    const results = contentEl.createDiv("dl-search-results");
    this.showRecentNotes(results);

    input.addEventListener("input", () => {
      const query = input.value.trim();
      if (query.length < 2) {
        this.showRecentNotes(results);
      } else {
        this.showSearchResults(results, query);
      }
    });

    // Focus input immediately
    setTimeout(() => input.focus(), 50);
  }

  /**
   * Everything the Brain structure treats as a note the user writes: meetings,
   * customers, people, projects — plus the legacy notes/ folder so older notes
   * stay findable.
   */
  private getNotesFiles(): TFile[] {
    const { vault, notesFolder } = this.plugin.settings;
    const folders = [vault.meetingsFolder, vault.customersFolder, vault.peopleFolder, vault.projectsFolder, notesFolder]
      .filter(Boolean)
      .map((folder) => folder + "/");
    return this.app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => file.path.startsWith(folder)));
  }

  private showRecentNotes(container: HTMLElement) {
    container.empty();
    container.createDiv({ cls: "dl-search-section-title", text: "Zuletzt bearbeitet" });

    const files = this.getNotesFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 6);

    for (const file of files) {
      this.renderResultRow(container, file, "");
    }
  }

  private async showSearchResults(container: HTMLElement, query: string) {
    container.empty();
    container.createDiv({ cls: "dl-search-section-title", text: `Ergebnisse für „${query}"` });

    const files = this.getNotesFiles();

    const lq = query.toLowerCase();
    const matches: { file: TFile; snippet: string }[] = [];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      if (
        file.basename.toLowerCase().includes(lq) ||
        content.toLowerCase().includes(lq)
      ) {
        const idx = content.toLowerCase().indexOf(lq);
        const snippet = idx >= 0
          ? "…" + content.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, " ") + "…"
          : "";
        matches.push({ file, snippet });
        if (matches.length >= 20) break;
      }
    }

    if (matches.length === 0) {
      container.createDiv({ cls: "dl-search-empty", text: "Keine Treffer." });
      return;
    }

    for (const m of matches) {
      this.renderResultRow(container, m.file, m.snippet);
    }
  }

  private renderResultRow(container: HTMLElement, file: TFile, snippet: string) {
    const row = container.createDiv("dl-search-row");

    const cache = this.app.metadataCache.getFileCache(file);
    const title = cache?.frontmatter?.title ?? file.basename;
    const date = cache?.frontmatter?.date ?? "";

    const titleEl = row.createEl("button", { cls: "dl-search-title", text: title });
    titleEl.addEventListener("click", (e) => {
      openFile(this.app, file, e.metaKey || e.ctrlKey);
      this.close();
    });

    if (date) row.createSpan({ cls: "dl-search-date", text: date });
    if (snippet) row.createDiv({ cls: "dl-search-snippet", text: snippet });
  }

  onClose() {
    this.contentEl.empty();
  }
}
