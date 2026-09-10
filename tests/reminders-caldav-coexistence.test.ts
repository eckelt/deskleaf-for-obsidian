import { describe, expect, it } from "vitest";
import DeskleafPlugin from "../src/main";
import { CalendarReader } from "../src/calendar-reader";
import { CalDAVReader } from "../src/caldav-reader";
import { CompositeCalendarReader } from "../src/composite-calendar-reader";
import { DEFAULT_SETTINGS } from "../src/types";

// ADR 3 / spec "Reader-Auswahl" (AC8, AC10, AC12): the reminders-only second process is
// instantiated exactly when CalDAV is the active event backend AND the device has local
// filesystem access to the binary (macOS desktop) — never on iOS, never when the binary
// is already the sole active backend.

function makePlugin(overrides: { basePath?: string; caldavUsername?: string; caldavPassword?: string }) {
  const plugin = new DeskleafPlugin();
  plugin.settings = {
    ...DEFAULT_SETTINGS,
    caldav: {
      ...DEFAULT_SETTINGS.caldav,
      username: overrides.caldavUsername ?? "",
      password: overrides.caldavPassword ?? "",
    },
  };
  plugin.app = { vault: { adapter: { basePath: overrides.basePath } } } as any;
  plugin.manifest = { dir: ".obsidian/plugins/deskleaf" } as any;
  return plugin;
}

describe("makeReader — CalDAV/reminders-only coexistence (ADR 3)", () => {
  it("AC8: CalDAV credentials + desktop basePath → CompositeCalendarReader", () => {
    const plugin = makePlugin({ basePath: "/Users/nils/Vault", caldavUsername: "nils", caldavPassword: "secret" });
    const reader = plugin["makeReader"]();
    expect(reader).toBeInstanceOf(CompositeCalendarReader);
  });

  it("AC10: CalDAV credentials without a basePath (iOS) → plain CalDAVReader, no second process", () => {
    const plugin = makePlugin({ basePath: undefined, caldavUsername: "nils", caldavPassword: "secret" });
    const reader = plugin["makeReader"]();
    expect(reader).toBeInstanceOf(CalDAVReader);
    expect(reader).not.toBeInstanceOf(CompositeCalendarReader);
  });

  it("AC12: no CalDAV credentials, even with a desktop basePath → plain binary CalendarReader, no composite", () => {
    const plugin = makePlugin({ basePath: "/Users/nils/Vault", caldavUsername: "", caldavPassword: "" });
    const reader = plugin["makeReader"]();
    expect(reader).toBeInstanceOf(CalendarReader);
    expect(reader).not.toBeInstanceOf(CompositeCalendarReader);
  });

  it("the reminders-only sub-process is started with the --reminders-only flag", () => {
    const plugin = makePlugin({ basePath: "/Users/nils/Vault", caldavUsername: "nils", caldavPassword: "secret" });
    const reader = plugin["makeReader"]() as CompositeCalendarReader;
    const remindersReader = Reflect.get(reader, "reminders") as CalendarReader;
    expect(Reflect.get(remindersReader, "extraArgs")).toEqual(["--reminders-only"]);
  });
});
