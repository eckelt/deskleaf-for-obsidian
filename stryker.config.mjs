// Mutation testing scope: only pure utility modules with no Obsidian API
// import. Obsidian-coupled modules (calendar-view.ts, note-manager.ts,
// sidebar-view.ts, ...) are out of reach without heavy API mocking — see
// specs/features/mutation-testing-daily-cron.md.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: [
    "src/brain-vault.ts",
    "src/todo-parser.ts",
    "src/event-layout.ts",
    "src/date-utils.ts",
    "src/event-filter.ts",
    "src/note-utils.ts",
  ],
  testRunner: "vitest",
  reporters: ["json", "progress"],
  coverageAnalysis: "perTest",
  tempDirName: ".stryker-tmp",
  // No `thresholds.break` — this is a reporting-only nightly run, never a
  // merge gate (see AC3/AC6). Stryker only exits non-zero on `break`.
  thresholds: { high: 80, low: 60, break: null },
};
