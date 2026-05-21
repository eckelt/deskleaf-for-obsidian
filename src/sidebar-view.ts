import { ItemView, WorkspaceLeaf, TFile, normalizePath, MarkdownRenderer } from "obsidian";
import type DeskleafPlugin from "./main";
import { toDateStr, addDays } from "./date-utils";
import { openFile } from "./open-file";

export const VIEW_TYPE_SIDEBAR = "deskleaf-sidebar";

interface TopicEntry { file: TFile; title: string; }
interface TodoItem {
  text: string; checked: boolean; file: TFile;
  lineIndex: number; date: string | null; noteTitle: string;
}
type TodoGroup = "today" | "week" | "later" | "undated" | "past";

export class DeskleafSidebarView extends ItemView {
  plugin: DeskleafPlugin;
  private refreshTimer: number | null = null;
  private activeFilePath: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeskleafPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_SIDEBAR; }
  getDisplayText() { return "Deskleaf"; }
  getIcon() { return "deskleaf"; }

  async onOpen() {
    await this.render();
    this.activeFilePath = this.app.workspace.getActiveFile()?.path ?? null;
    this.highlightActiveTopic();

    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      const prev = this.activeFilePath;
      this.activeFilePath = file?.path ?? null;
      this.highlightActiveTopic();
      if (file?.path !== prev) this.debouncedRefresh(200);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      // Skip while the user is actively editing — refresh fires on every keystroke otherwise
      if (file === this.app.workspace.getActiveFile()) return;
      this.debouncedRefresh();
    }));
    this.registerEvent(this.app.vault.on("create", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.debouncedRefresh()));

    // Internal links rendered by MarkdownRenderer need explicit click handling in custom views
    this.registerDomEvent(this.containerEl, "click", (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a.internal-link") as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute("data-href") ?? anchor.textContent ?? "";
      this.app.workspace.openLinkText(href, "", e.metaKey || e.ctrlKey);
    });
  }

  async onClose() {}

  private highlightActiveTopic() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.querySelectorAll<HTMLElement>(".dl-topic-row[data-path]").forEach((row) => {
      row.toggleClass("dl-topic-row--active", row.getAttribute("data-path") === this.activeFilePath);
    });
  }

  private debouncedRefresh(delay = 400) {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(async () => {
      this.refreshTimer = null;
      await this.render();
    }, delay);
  }

  // ── Root render ──────────────────────────────────────────────────

  async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("dl-sidebar-root");

    const topicsEl = root.createDiv("dl-sidebar-topics");
    await this.renderTopics(topicsEl);

    root.createDiv("dl-sidebar-divider");

    const todosEl = root.createDiv("dl-sidebar-todos");
    await this.renderTodos(todosEl);

    this.highlightActiveTopic();
  }

  // ── Topics ───────────────────────────────────────────────────────

  private get order(): string[] { return this.plugin.settings.topicsOrder; }
  private async saveOrder(o: string[]) {
    this.plugin.settings.topicsOrder = o;
    await this.plugin.saveSettings();
  }

  private hasTopicTag(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;
    if ((cache.tags ?? []).some((t) => t.tag.toLowerCase() === "#topic")) return true;
    const fmTags = cache.frontmatter?.tags ?? [];
    const arr: string[] = Array.isArray(fmTags) ? fmTags : [fmTags];
    return arr.some((t) => typeof t === "string" && t.replace(/^#/, "").toLowerCase() === "topic");
  }

  private getTopics(): TopicEntry[] {
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.hasTopicTag(f));
    const inOrder: TopicEntry[] = [];
    const seen = new Set<string>();
    for (const p of this.order) {
      const f = files.find((x) => x.path === p);
      if (f) { inOrder.push({ file: f, title: f.basename }); seen.add(f.path); }
    }
    for (const f of files) {
      if (!seen.has(f.path)) inOrder.push({ file: f, title: f.basename });
    }
    return inOrder;
  }

  private async renderTopics(container: HTMLElement) {
    container.createDiv({ cls: "dl-sidebar-section-header", text: "Topics" });
    const topics = this.getTopics();
    const list = container.createDiv("dl-topics-list");
    for (let i = 0; i < topics.length; i++) this.renderTopicRow(list, topics[i]);
    if (topics.length > 0) this.initDragDrop(list, topics);
    this.renderNewTopicRow(list);
  }

  private renderTopicRow(container: HTMLElement, topic: TopicEntry) {
    const row = container.createDiv("dl-topic-row");
    row.setAttribute("draggable", "true");
    row.setAttribute("data-path", topic.file.path);
    row.createDiv({ cls: "dl-topic-handle", text: "⠿" });

    const content = row.createDiv("dl-topic-content");
    content.createEl("span", { cls: "dl-topic-title", text: topic.title })
      .addEventListener("click", (e) => this.openTopic(topic.file, e.metaKey || e.ctrlKey));

    const linkedEvents = this.plugin.calendarReader.getEvents().filter((e) => {
      const nf = this.plugin.noteManager.noteExists(e);
      if (!nf) return false;
      return (this.app.metadataCache.getFileCache(nf)?.frontmatter?.topics ?? []).includes(topic.title);
    });
    if (linkedEvents.length > 0) {
      const chips = content.createDiv("dl-topic-chips");
      for (const ev of linkedEvents.slice(0, 6))
        chips.createSpan({ cls: "dl-chip", text: ev.title });
    }

    const del = row.createEl("span", { cls: "dl-topic-delete", text: "✕" });
    del.setAttribute("title", "Topic-Tag entfernen");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.removeTopicTag(topic.file);
      await this.saveOrder(this.order.filter((p) => p !== topic.file.path));
      await this.render();
    });
  }

  private renderNewTopicRow(container: HTMLElement) {
    const row = container.createDiv("dl-topic-new-row");
    const activate = () => {
      row.empty();
      row.addClass("dl-topic-new-row--active");
      const input = row.createEl("input", { type: "text", placeholder: "Topic-Titel …", cls: "dl-topic-new-input" });
      const cancel = () => {
        row.removeClass("dl-topic-new-row--active");
        row.empty();
        row.addEventListener("click", activate, { once: true });
      };
      const confirm = async () => {
        const title = input.value.trim();
        if (title) await this.createTopic(title); else cancel();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); confirm(); }
        if (e.key === "Escape") cancel();
      });
      input.addEventListener("blur", () => {
        setTimeout(() => { if (document.activeElement !== input) cancel(); }, 150);
      });
      setTimeout(() => input.focus(), 0);
    };
    row.addEventListener("click", activate, { once: true });
  }

  private async openTopic(file: TFile, modifier = false) {
    await openFile(this.app, file, modifier);
  }

  private async createTopic(title: string) {
    const folder = this.plugin.settings.topicsFolder;
    if (!this.app.vault.getAbstractFileByPath(folder))
      await this.app.vault.createFolder(folder);
    const path = normalizePath(`${folder}/${title}.md`);
    let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!file)
      file = await this.app.vault.create(path, `---\ntags: [topic]\n---\n\n# ${title}\n\n`);
    await this.openTopic(file);
  }

  private async removeTopicTag(file: TFile) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const tags = fm.tags ?? [];
      const arr: string[] = Array.isArray(tags) ? tags : [String(tags)];
      const filtered = arr.filter((t) => t.toLowerCase() !== "topic");
      if (filtered.length === 0) delete fm.tags; else fm.tags = filtered;
    });
    const content = await this.app.vault.read(file);
    const cleaned = content.replace(/\s?#topic\b/gi, "");
    if (cleaned !== content) await this.app.vault.modify(file, cleaned);
  }

  private initDragDrop(list: HTMLElement, topics: TopicEntry[]) {
    let dragSrcPath: string | null = null;
    const clearIndicators = () => {
      list.querySelectorAll(".dl-dragging").forEach((el) => el.removeClass("dl-dragging"));
      list.querySelectorAll(".dl-drop-before").forEach((el) => el.removeClass("dl-drop-before"));
      list.querySelectorAll(".dl-drop-after").forEach((el) => el.removeClass("dl-drop-after"));
    };
    list.addEventListener("dragstart", (e: DragEvent) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!row) return;
      dragSrcPath = row.getAttribute("data-path");
      e.dataTransfer?.setData("text/plain", dragSrcPath ?? "");
      setTimeout(() => row.addClass("dl-dragging"), 0);
    });
    list.addEventListener("dragend", () => { clearIndicators(); dragSrcPath = null; });
    list.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!row) return;
      clearIndicators();
      const rect = row.getBoundingClientRect();
      row.addClass(e.clientY > rect.top + rect.height / 2 ? "dl-drop-after" : "dl-drop-before");
    });
    list.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const targetRow = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!targetRow || !dragSrcPath) return;
      const targetPath = targetRow.getAttribute("data-path");
      if (!targetPath || targetPath === dragSrcPath) return;
      const insertAfter = e.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
      const order = topics.map((t) => t.file.path);
      const si = order.indexOf(dragSrcPath);
      if (si === -1) return;
      order.splice(si, 1);
      const ti = order.indexOf(targetPath);
      if (ti === -1) return;
      order.splice(insertAfter ? ti + 1 : ti, 0, dragSrcPath);

      // Move row in DOM immediately for instant feedback
      const srcRow = list.querySelector<HTMLElement>(`[data-path="${dragSrcPath.replace(/"/g, '\\"')}"]`);
      if (srcRow) {
        if (insertAfter) targetRow.after(srcRow);
        else targetRow.before(srcRow);
      }
      clearIndicators();

      // Persist and re-render in background
      this.saveOrder(order).then(() => this.render());
    });
  }

  // ── Todos ────────────────────────────────────────────────────────

  private async renderTodos(container: HTMLElement) {
    const todos = await this.collectTodos();
    const groups = this.groupTodos(todos);
    const openCount = Object.values(groups).reduce((s, g) => s + g.length, 0);

    const header = container.createDiv("dl-sidebar-section-header dl-sidebar-todos-header");
    header.createSpan({ text: "Todos" });
    header.createSpan({ cls: "dl-sidebar-count", text: String(openCount) });
    const filterInput = header.createEl("input", {
      type: "text",
      cls: "dl-todo-filter",
      placeholder: "Filtern …",
    } as any) as HTMLInputElement;

    const labels: Record<TodoGroup, string> = {
      today: "Heute", week: "Diese Woche", later: "Später", undated: "Ohne Datum", past: "Früher",
    };
    const sections: HTMLElement[] = [];
    for (const key of (["today", "week", "later", "undated", "past"] as TodoGroup[])) {
      const items = groups[key];
      if (items.length === 0) continue;
      const section = container.createDiv("dl-board-section");
      sections.push(section);
      section.createDiv({ cls: "dl-board-group-label", text: labels[key] });
      for (const todo of items) await this.renderTodoItem(section, todo);
    }

    filterInput.addEventListener("input", () => {
      const q = filterInput.value.trim().toLowerCase();
      for (const section of sections) {
        let visible = 0;
        section.querySelectorAll<HTMLElement>(".dl-todo-row").forEach((row) => {
          const match = !q || (row.dataset.filter ?? "").includes(q);
          row.style.display = match ? "" : "none";
          if (match) visible++;
        });
        const lbl = section.querySelector<HTMLElement>(".dl-board-group-label");
        if (lbl) lbl.style.display = visible === 0 ? "none" : "";
      }
    });
  }


  private async renderTodoItem(container: HTMLElement, todo: TodoItem) {
    const row = container.createDiv("dl-todo-row");
    row.dataset.filter = `${todo.text} ${todo.noteTitle}`.toLowerCase();
    const checkbox = row.createEl("input", { type: "checkbox" } as any) as HTMLInputElement;
    checkbox.checked = todo.checked;
    checkbox.addEventListener("change", async () => {
      await this.toggleTodo(todo, checkbox.checked);
      await this.render();
    });
    const content = row.createDiv("dl-todo-content");
    const label = content.createSpan({ cls: "dl-todo-text" });
    await MarkdownRenderer.render(this.app, todo.text, label, todo.file.path, this);
    const chip = content.createEl("span", {
      cls: "dl-todo-chip",
      text: `${todo.noteTitle}${todo.date ? " · " + todo.date : ""}`,
    });
    chip.addEventListener("click", (e) => {
      openFile(this.app, todo.file, e.metaKey || e.ctrlKey);
    });
  }

  private parseTodosFromFile(file: TFile, content: string): TodoItem[] {
    const lines = content.split("\n");
    const cache = this.app.metadataCache.getFileCache(file);
    const date: string | null = cache?.frontmatter?.date ?? null;
    const noteTitle: string = cache?.frontmatter?.title ?? file.basename;
    const todos: TodoItem[] = [];
    for (let i = 0; i < lines.length; i++) {
      const openMatch = /^- \[ \] (.+)$/.exec(lines[i]);
      const doneMatch = /^- \[x\] (.+)$/i.exec(lines[i]);
      if (openMatch || doneMatch)
        todos.push({ text: (openMatch ?? doneMatch)![1], checked: !!doneMatch, file, lineIndex: i, date, noteTitle });
    }
    return todos;
  }

  private async collectTodos(): Promise<TodoItem[]> {
    const notesFolder = this.plugin.settings.notesFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.["kanban-plugin"]) return false;
      return f.path.startsWith(notesFolder + "/") || this.hasTopicTag(f);
    });
    const todos: TodoItem[] = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      todos.push(...this.parseTodosFromFile(file, content));
    }
    return todos;
  }

  private groupTodos(todos: TodoItem[]): Record<TodoGroup, TodoItem[]> {
    const today = toDateStr(new Date());
    const weekEnd = toDateStr(addDays(new Date(), 7));
    const groups: Record<TodoGroup, TodoItem[]> = { today: [], week: [], later: [], undated: [], past: [] };
    for (const todo of todos) {
      if (todo.checked) continue;
      if (!todo.date) groups.undated.push(todo);
      else if (todo.date < today) groups.past.push(todo);
      else if (todo.date === today) groups.today.push(todo);
      else if (todo.date <= weekEnd) groups.week.push(todo);
      else groups.later.push(todo);
    }
    return groups;
  }

  private async toggleTodo(todo: TodoItem, checked: boolean) {
    const content = await this.app.vault.read(todo.file);
    const lines = content.split("\n");
    lines[todo.lineIndex] = checked
      ? lines[todo.lineIndex].replace(/^- \[ \]/, "- [x]")
      : lines[todo.lineIndex].replace(/^- \[x\]/i, "- [ ]");
    await this.app.vault.modify(todo.file, lines.join("\n"));
  }
}
