import { App, PluginSettingTab, Setting } from "obsidian";
import type DeskleafPlugin from "./main";
import { CalDAVClient } from "./caldav-client";
import { CAL_COLOR_PALETTE } from "./types";

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

    // Testknopf + Kalender-Checkboxen
    const calendarSection = containerEl.createDiv();
    this.renderCalendarList(calendarSection);

    new Setting(containerEl)
      .setName("Kalender neu laden")
      .setDesc("Verbindung prüfen und Kalenderliste aktualisieren.")
      .addButton(btn =>
        btn.setButtonText("Neu laden").onClick(async () => {
          btn.setButtonText("…").setDisabled(true);
          try {
            const { caldav } = this.plugin.settings;
            const client = new CalDAVClient(caldav.url, caldav.username, caldav.password);
            const principalPath = `/dav/principals/user/${encodeURIComponent(caldav.username)}/`;
            const cals = await client.discoverCalendars(principalPath);
            this.plugin.settings.caldav.discoveredCalendars = cals;
            // Alle neu entdeckten Kalender aktivieren (überschreibt ggf. kaputten Zustand)
            this.plugin.settings.caldav.selectedCalendars = cals.map(c => c.href);
            await this.plugin.saveSettings();
            btn.setButtonText(`✓ ${cals.length} Kalender`).setDisabled(false);
            calendarSection.empty();
            this.renderCalendarList(calendarSection);
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

  private renderCalendarList(el: HTMLElement): void {
    const { discoveredCalendars, selectedCalendars } = this.plugin.settings.caldav;
    if (discoveredCalendars.length === 0) return;

    el.createEl("p", {
      text: "Kalender auswählen. Farben werden automatisch je Kalender vergeben.",
      cls: "setting-item-description",
    });

    for (const cal of discoveredCalendars) {
      const setting = new Setting(el)
        .setName(cal.displayName || cal.href)
        .addToggle(toggle =>
          toggle
            .setValue(selectedCalendars.length === 0 || selectedCalendars.includes(cal.href))
            .onChange(async checked => {
              let sel = this.plugin.settings.caldav.selectedCalendars;
              if (sel.length === 0) {
                sel = discoveredCalendars.map(c => c.href);
                this.plugin.settings.caldav.selectedCalendars = sel;
              }
              if (checked) {
                if (!sel.includes(cal.href)) sel.push(cal.href);
              } else {
                const idx = sel.indexOf(cal.href);
                if (idx !== -1) sel.splice(idx, 1);
              }
              await this.plugin.saveSettings();
            })
        );

      // Farbwahl: 8 Swatches vor dem Toggle
      const swatches = setting.controlEl.createDiv("dl-color-swatches");
      swatches.style.order = "-1";
      const savedHue = this.plugin.settings.caldav.calendarColors?.[cal.displayName];
      for (const hue of CAL_COLOR_PALETTE) {
        const sw = swatches.createDiv("dl-color-swatch");
        const swatchL = (hue >= 38 && hue <= 65) ? 55 : 50;
        sw.style.background = `hsl(${hue}, 92%, ${swatchL}%)`;
        sw.title = `${hue}°`;
        if (savedHue === hue) sw.addClass("dl-color-swatch--active");
        sw.addEventListener("click", async () => {
          this.plugin.settings.caldav.calendarColors ??= {};
          this.plugin.settings.caldav.calendarColors[cal.displayName] = hue;
          swatches.querySelectorAll(".dl-color-swatch--active").forEach(s => s.removeClass("dl-color-swatch--active"));
          sw.addClass("dl-color-swatch--active");
          await this.plugin.saveSettingsQuiet();
        });
      }
    }
  }
}
