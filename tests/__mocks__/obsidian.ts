// Minimal stub of the obsidian module for unit tests.
// Only the symbols imported by src/calendar-view.ts (and other src files) need to exist;
// they do not have to be functional because no test exercises Obsidian UI code paths.

export class App {}
export class ItemView {
  app: App = new App();
  containerEl = { children: [] as any[], empty: () => {}, createEl: () => ({}) };
  constructor(public leaf: WorkspaceLeaf) {}
  getViewType() { return ""; }
  getDisplayText() { return ""; }
  async onOpen() {}
  async onClose() {}
  registerEvent(_: any) {}
  registerInterval(_: number) {}
  addAction(_icon: string, _title: string, _cb: () => void) { return document.createElement("div"); }
}
export class WorkspaceLeaf {}
export class TFile { path = ""; basename = ""; extension = ""; }
export class Notice { constructor(_msg: string) {} }
export class Menu {
  addItem(_cb: (item: MenuItem) => void) { return this; }
  showAtMouseEvent(_e: MouseEvent) {}
}
export class MenuItem {
  setTitle(_t: string) { return this; }
  setIcon(_i: string) { return this; }
  onClick(_cb: () => void) { return this; }
}
export const Platform = { isMobile: false, isDesktop: true };
export class MarkdownView {}
export function setIcon(_el: HTMLElement, _icon: string) {}
export function normalizePath(p: string) { return p; }
