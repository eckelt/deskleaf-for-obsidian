import { App, PluginSettingTab, Setting } from "obsidian";
import type FocalPlugin from "./main";

export class FocalSettingTab extends PluginSettingTab {
  plugin: FocalPlugin;

  constructor(app: App, plugin: FocalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("focal-cal binary")
      .setDesc("Pfad zum focal-cal Binary (leer = automatisch im Plugin-Verzeichnis suchen). Einmalig mit swift/build.sh bauen.")
      .addText((text) =>
        text
          .setPlaceholder("(automatisch)")
          .setValue(this.plugin.settings.binaryPath)
          .onChange(async (value) => {
            this.plugin.settings.binaryPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Template folder")
      .setDesc("Folder containing note templates (meeting.md, interview.md, …)")
      .addText((text) =>
        text
          .setPlaceholder("templates")
          .setValue(this.plugin.settings.templateFolder)
          .onChange(async (value) => {
            this.plugin.settings.templateFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Destination folder for event notes")
      .addText((text) =>
        text
          .setPlaceholder("notes")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Topics folder")
      .setDesc("Zielordner für neue Topics (Erkennung via #topic-Tag, nicht via Ordner)")
      .addText((text) =>
        text
          .setPlaceholder("topics")
          .setValue(this.plugin.settings.topicsFolder)
          .onChange(async (value) => {
            this.plugin.settings.topicsFolder = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
