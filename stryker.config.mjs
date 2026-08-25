// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  reporters: ["html", "json", "clear-text", "progress"],
  // Pure utility modules only — no Obsidian API dependency, so mutants can
  // run against the existing vitest suite without mocking the Obsidian host.
  mutate: [
    "src/brain-vault.ts",
    "src/todo-parser.ts",
    "src/event-layout.ts",
    "src/date-utils.ts",
    "src/event-filter.ts",
    "src/note-utils.ts",
  ],
  // No break threshold: mutation testing here is informational only and
  // must never fail a run based on the resulting score (see spec Non-Goals).
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  tempDirName: ".stryker-tmp",
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
};

export default config;
