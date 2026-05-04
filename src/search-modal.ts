import { App, Modal, TFile } from "obsidian";
import type FocalPlugin from "./main";
import { openFile } from "./open-file";

export class FocalSearchModal extends Modal {
  plugin: FocalPlugin;

  constructor(app: App, plugin: FocalPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("focal-search-modal");

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Notizen durchsuchen…",
      cls: "focal-search-input",
    });

    const results = contentEl.createDiv("focal-search-results");
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

  private getNotesFiles(): TFile[] {
    const folder = this.plugin.settings.notesFolder;
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + "/"));
  }

  private showRecentNotes(container: HTMLElement) {
    container.empty();
    container.createDiv({ cls: "focal-search-section-title", text: "Zuletzt bearbeitet" });

    const files = this.getNotesFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 6);

    for (const file of files) {
      this.renderResultRow(container, file, "");
    }
  }

  private async showSearchResults(container: HTMLElement, query: string) {
    container.empty();
    container.createDiv({ cls: "focal-search-section-title", text: `Ergebnisse für „${query}"` });

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
      container.createDiv({ cls: "focal-search-empty", text: "Keine Treffer." });
      return;
    }

    for (const m of matches) {
      this.renderResultRow(container, m.file, m.snippet);
    }
  }

  private renderResultRow(container: HTMLElement, file: TFile, snippet: string) {
    const row = container.createDiv("focal-search-row");

    const cache = this.app.metadataCache.getFileCache(file);
    const title = cache?.frontmatter?.title ?? file.basename;
    const date = cache?.frontmatter?.date ?? "";

    const titleEl = row.createEl("button", { cls: "focal-search-title", text: title });
    titleEl.addEventListener("click", (e) => {
      openFile(this.app, file, e.metaKey || e.ctrlKey);
      this.close();
    });

    if (date) row.createSpan({ cls: "focal-search-date", text: date });
    if (snippet) row.createDiv({ cls: "focal-search-snippet", text: snippet });
  }

  onClose() {
    this.contentEl.empty();
  }
}
