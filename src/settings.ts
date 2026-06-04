import { App, PluginSettingTab, Setting } from "obsidian";
import type DeskleafPlugin from "./main";
import { CalDAVClient } from "./caldav-client";
import { CAL_COLOR_PALETTE, type ICalFeedSubscription } from "./types";

function trashIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle;fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round">` +
    `<g transform="matrix(1.006849,0,0,0.973742,0.430345,0.626623)"><path d="M9.526,3C9.919,3 10.295,3.161 10.573,3.448C10.851,3.736 11.007,4.125 11.007,4.531C11.007,4.802 11.007,5 11.007,5L7,5L7,4.531C7,4.125 7.156,3.736 7.434,3.448C7.711,3.161 8.088,3 8.481,3C8.822,3 9.185,3 9.526,3Z" style="fill:none;stroke:currentColor;stroke-width:1.05px"/></g>` +
    `<g transform="matrix(1,0,0,1,0,1)"><path d="M5,5C5,5 5.673,11.889 5.927,14.495C5.982,15.053 6.451,15.479 7.011,15.479C8.342,15.479 10.698,15.479 12.031,15.479C12.593,15.479 13.063,15.05 13.115,14.491C13.359,11.88 14,5 14,5" style="fill:none;stroke:currentColor;stroke-width:1.04px"/></g>` +
    `<g transform="matrix(1,0,0,0.92714,0.496693,1.954559)"><path d="M7,6L7,13" style="fill:none;stroke:currentColor;stroke-width:1.08px"/></g>` +
    `<g transform="matrix(1,0,0,0.92714,0.496693,1.954559)"><path d="M9,6L9,13" style="fill:none;stroke:currentColor;stroke-width:1.08px"/></g>` +
    `<g transform="matrix(1,0,0,0.92714,0.496693,1.954559)"><path d="M11,6L11,13" style="fill:none;stroke:currentColor;stroke-width:1.08px"/></g>` +
    `<g transform="matrix(1,0,0,1,-0.487514,1.493664)"><path d="M4,4L16,4" style="fill:none;stroke:currentColor;stroke-width:1.04px"/></g>` +
    `</svg>`
  );
}

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

    const calendarSection = containerEl.createDiv();
    this.renderCalDAVList(calendarSection);

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
            this.plugin.settings.caldav.selectedCalendars = cals.map(c => c.href);
            await this.plugin.saveSettings();
            btn.setButtonText(`✓ ${cals.length} Kalender`).setDisabled(false);
            calendarSection.empty();
            this.renderCalDAVList(calendarSection);
          } catch (err) {
            btn.setButtonText(`✗ ${(err as Error).message}`).setDisabled(false);
          }
        })
      );

    // ── Kalender-Abonnements (iCal) ──────────────────────────────
    containerEl.createEl("h3", { text: "Kalender-Abonnements (iCal)" });

    const icalSection = containerEl.createDiv();
    this.renderICalList(icalSection);

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

  private renderCalDAVList(el: HTMLElement): void {
    const { discoveredCalendars, selectedCalendars } = this.plugin.settings.caldav;
    if (discoveredCalendars.length === 0) return;

    el.createEl("p", {
      text: "Kalender auswählen. Farben werden automatisch je Kalender vergeben.",
      cls: "setting-item-description",
    });

    for (const cal of discoveredCalendars) {
      const isSelected = selectedCalendars.length === 0 || selectedCalendars.includes(cal.href);

      const row = el.createDiv("dl-caldav-row");

      // Name
      const name = row.createEl("div", { cls: "dl-caldav-name", text: cal.displayName || cal.href });

      // Farb-Swatches + Toggle-Kreis
      const circles = row.createDiv("dl-caldav-circles");
      const isDark = document.body.classList.contains("theme-dark");
      const savedHue = this.plugin.settings.caldav.calendarColors?.[cal.displayName];

      for (const hue of CAL_COLOR_PALETTE) {
        const sw = circles.createDiv("dl-circle");
        const swatchS = isDark ? 78 : 58;
        const swatchL = isDark ? (hue === 48 ? 68 : 63) : (hue === 48 ? 46 : 50);
        sw.style.background = `hsl(${hue}, ${swatchS}%, ${swatchL}%)`;
        sw.title = `${hue}°`;
        if (isSelected && savedHue === hue) sw.addClass("dl-circle--active");
        sw.addEventListener("click", async () => {
          this.plugin.settings.caldav.calendarColors ??= {};
          this.plugin.settings.caldav.calendarColors[cal.displayName] = hue;
          let sel = this.plugin.settings.caldav.selectedCalendars;
          if (sel.length === 0) {
            sel = discoveredCalendars.map(c => c.href);
            this.plugin.settings.caldav.selectedCalendars = sel;
          }
          if (!sel.includes(cal.href)) sel.push(cal.href);
          await this.plugin.saveSettings();
          this.display();
        });
      }

      // Durchgestrichener Kreis für enable/disable
      const toggleCircle = circles.createDiv("dl-circle dl-circle--outline");
      if (!isSelected) {
        toggleCircle.addClass("dl-circle--active");
      }
      toggleCircle.addEventListener("click", async () => {
        let sel = this.plugin.settings.caldav.selectedCalendars;
        if (sel.length === 0) {
          sel = discoveredCalendars.map(c => c.href);
          this.plugin.settings.caldav.selectedCalendars = sel;
        }
        if (isSelected) {
          const idx = sel.indexOf(cal.href);
          if (idx !== -1) sel.splice(idx, 1);
        } else {
          if (!sel.includes(cal.href)) sel.push(cal.href);
        }
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }

  private renderICalList(el: HTMLElement): void {
    const feeds = this.plugin.settings.icalSubscriptions;

    if (feeds.length === 0) {
      el.createEl("p", {
        text: "Noch keine Abonnements.",
        cls: "setting-item-description",
      });
    }

    for (const feed of feeds) {
      const row = el.createDiv("dl-ical-feed-row");

      // Name + URL
      const info = row.createDiv("dl-ical-feed-info");
      info.createEl("div", { cls: "dl-ical-feed-name", text: feed.label });
      info.createEl("div", { cls: "dl-ical-feed-url", text: feed.url });
      info.title = feed.url;

      // Farb-Swatches + Toggle-Kreis
      const circles = row.createDiv("dl-ical-circles");
      const isDark = document.body.classList.contains("theme-dark");
      const savedHue = feed.color;

      for (const hue of CAL_COLOR_PALETTE) {
        const sw = circles.createDiv("dl-circle");
        const swatchS = isDark ? 78 : 58;
        const swatchL = isDark ? (hue === 48 ? 68 : 63) : (hue === 48 ? 46 : 50);
        sw.style.background = `hsl(${hue}, ${swatchS}%, ${swatchL}%)`;
        sw.title = `${hue}°`;
        if (feed.enabled && savedHue === hue) sw.addClass("dl-circle--active");
        sw.addEventListener("click", async () => {
          feed.color = hue;
          feed.enabled = true;
          await this.plugin.saveSettings();
          this.plugin.reloadFeeds();
          this.display();
        });
      }

      // Durchgestrichener Kreis für enable/disable
      const toggleCircle = circles.createDiv("dl-circle dl-circle--outline");
      if (!feed.enabled) {
        toggleCircle.addClass("dl-circle--active");
      }
      toggleCircle.addEventListener("click", async () => {
        feed.enabled = !feed.enabled;
        await this.plugin.saveSettings();
        this.plugin.reloadFeeds();
        this.display();
      });

      // Mülltonne
      const trash = row.createDiv("dl-ical-trash");
      trash.innerHTML = trashIconSvg(16);
      trash.style.cursor = "pointer";
      trash.addEventListener("click", async () => {
        this.plugin.settings.icalSubscriptions = this.plugin.settings.icalSubscriptions.filter(f => f.id !== feed.id);
        await this.plugin.saveSettings();
        this.plugin.reloadFeeds();
        this.display();
      });
    }

    // "+ Abonnement hinzufügen"-Button
    let formEl: HTMLElement | null = null;
    const addBtn = new Setting(el)
      .addButton(btn =>
        btn
          .setButtonText("+ Abonnement hinzufügen")
          .onClick(() => {
            if (formEl) { formEl.remove(); formEl = null; return; }
            formEl = el.createDiv("dl-ical-add-form");

            const nameInput = formEl.createEl("input", {
              type: "text",
              placeholder: "Name (z.B. Abfuhrkalender)",
              cls: "dl-ical-add-input",
            } as any) as HTMLInputElement;

            const urlInput = formEl.createEl("input", {
              type: "text",
              placeholder: "URL (https:// oder webcal://)",
              cls: "dl-ical-add-input",
            } as any) as HTMLInputElement;

            const confirmBtn = formEl.createEl("button", {
              cls: "dl-create-btn dl-create-btn--primary",
              text: "Hinzufügen",
            });

            confirmBtn.addEventListener("click", async () => {
              const label = nameInput.value.trim();
              const url = urlInput.value.trim();
              if (!label || !url) return;
              const newFeed: ICalFeedSubscription = {
                id: crypto.randomUUID(),
                label,
                url,
                enabled: true,
                lastFetched: null,
                lastError: null,
                color: CAL_COLOR_PALETTE[feeds.length % CAL_COLOR_PALETTE.length],
              };
              this.plugin.settings.icalSubscriptions.push(newFeed);
              await this.plugin.saveSettings();
              this.plugin.reloadFeeds();
              this.display();
            });
          })
      );
    void addBtn;
  }
}
