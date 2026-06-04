import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Point the type-only obsidian package to a minimal JS stub so that
      // files importing from "obsidian" (e.g. calendar-view.ts) can be
      // loaded in the Node test environment without errors.
      obsidian: resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    execArgv: ["--experimental-strip-types"],
    // Only fake the one-shot timer APIs; leave setInterval/clearInterval as
    // real so vi.runAllTimersAsync() doesn't enter an infinite loop when
    // ICalFeedManager's background polling interval is active.
    fakeTimers: {
      toFake: ["setTimeout", "clearTimeout", "Date", "queueMicrotask"],
    },
  },
});
