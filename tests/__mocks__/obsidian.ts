// Minimal stub of the obsidian module for unit tests.
// Only the symbols imported by src/calendar-view.ts (and other src files) need to exist;
// they do not have to be functional because no test exercises Obsidian UI code paths.

export class App {}
export class Plugin {
  app!: App;
  manifest!: { dir: string };
}

type TextControl = {
  inputEl: { type: string };
  setPlaceholder: (value: string) => TextControl;
  setValue: (value: string) => TextControl;
  onChange: (cb: (value: string) => Promise<void>) => TextControl;
};

type ButtonControl = {
  setButtonText: (value: string) => ButtonControl;
  setDisabled: (value: boolean) => ButtonControl;
  onClick: (cb: () => Promise<void>) => ButtonControl;
};

type ToggleControl = {
  setValue: (value: boolean) => ToggleControl;
  onChange: (cb: (value: boolean) => Promise<void>) => ToggleControl;
};

export class PluginSettingTab {
  containerEl = {
    empty: () => {},
    createEl: () => ({}),
    createDiv: () => ({}),
  };
  constructor(public app: App, public plugin: Plugin) {}
}
export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: (text: TextControl) => void) { return this; }
  addButton(_cb: (button: ButtonControl) => void) { return this; }
  addToggle(_cb: (toggle: ToggleControl) => void) { return this; }
}
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
export class Notice {
  static instances: string[] = [];
  constructor(msg: string) { Notice.instances.push(msg); }
}
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
export class Modal {
  contentEl = { empty: () => {}, addClass: (_cls: string) => {}, createEl: () => ({ addEventListener: () => {}, focus: () => {}, value: "" }), createDiv: () => ({}) };
  constructor(public app: App) {}
}
export function addIcon(_id: string, _svg: string) {}
export function setIcon(_el: HTMLElement, _icon: string) {}
export function normalizePath(p: string) { return p; }
