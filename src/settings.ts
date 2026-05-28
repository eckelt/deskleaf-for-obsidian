import { App, PluginSettingTab, Setting } from "obsidian";
import type DeskleafPlugin from "./main";
import { CalDAVReader } from "./caldav-reader";

export class DeskleafSettingTab extends PluginSettingTab {
  plugin: DeskleafPlugin;

  constructor(app: App, plugin: DeskleafPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── CalDAV ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Kalender (CalDAV)" });

    new Setting(containerEl)
      .setName("Server-URL")
      .setDesc("CalDAV-Server-URL deines Kalenderanbieters.")
      .addText(text =>
        text
          .setPlaceholder("https://caldav.fastmail.com")
          .setValue(this.plugin.settings.caldav.url)
          .onChange(async value => {
            this.plugin.settings.caldav.url = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Benutzername")
      .setDesc("Deine E-Mail-Adresse beim Kalenderanbieter.")
      .addText(text =>
        text
          .setPlaceholder("deine@email.com")
          .setValue(this.plugin.settings.caldav.username)
          .onChange(async value => {
            this.plugin.settings.caldav.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("App-Passwort")
      .setDesc("Für Fastmail: Einstellungen → Passwörter & Sicherheit → App-Passwörter → Neu.")
      .addText(text => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("••••••••••••••••")
          .setValue(this.plugin.settings.caldav.password)
          .onChange(async value => {
            this.plugin.settings.caldav.password = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Verbindung testen")
      .setDesc("Prüft Zugangsdaten und zeigt gefundene Kalender.")
      .addButton(btn =>
        btn.setButtonText("Testen").onClick(async () => {
          btn.setButtonText("…").setDisabled(true);
          try {
            const { caldav } = this.plugin.settings;
            const reader = new CalDAVReader(caldav.url, caldav.username, caldav.password);
            const cals = await (reader as any).client.discoverCalendars(
              `/dav/principals/user/${encodeURIComponent(caldav.username)}/`
            );
            btn.setButtonText(`✓ ${cals.length} Kalender gefunden`).setDisabled(false);
          } catch (err) {
            btn.setButtonText(`✗ ${(err as Error).message}`).setDisabled(false);
          }
        })
      );

    // ── Notizen ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Notizen" });

    new Setting(containerEl)
      .setName("Template-Ordner")
      .setDesc("Ordner mit Event-Vorlagen (meeting.md, interview.md, …)")
      .addText(text =>
        text
          .setPlaceholder("templates")
          .setValue(this.plugin.settings.templateFolder)
          .onChange(async value => {
            this.plugin.settings.templateFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Notizen-Ordner")
      .setDesc("Zielordner für Event-Notizen")
      .addText(text =>
        text
          .setPlaceholder("notes")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async value => {
            this.plugin.settings.notesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Topics-Ordner")
      .setDesc("Zielordner für neue Topics")
      .addText(text =>
        text
          .setPlaceholder("topics")
          .setValue(this.plugin.settings.topicsFolder)
          .onChange(async value => {
            this.plugin.settings.topicsFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Erweitert ─────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Erweitert" });

    new Setting(containerEl)
      .setName("deskleaf-calendar-sync Binary (macOS)")
      .setDesc("Pfad zum Binary für nativen Kalenderzugriff. Leer = automatisch im Plugin-Verzeichnis suchen.")
      .addText(text =>
        text
          .setPlaceholder("(automatisch)")
          .setValue(this.plugin.settings.binaryPath)
          .onChange(async value => {
            this.plugin.settings.binaryPath = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
