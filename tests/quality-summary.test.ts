import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

type QualitySummaryModule = typeof import("../scripts/quality-summary.mjs");
const execFileAsync = promisify(execFile);

async function loadQualitySummary(): Promise<QualitySummaryModule> {
  return import("../scripts/quality-summary.mjs");
}

const CWD = "/repo";

const SAMPLE_REPORT = [
  {
    filePath: "/repo/src/todo-parser.ts",
    messages: [
      { ruleId: "sonarjs/no-identical-expressions", severity: 1, line: 10, column: 2 },
      { ruleId: "sonarjs/no-identical-expressions", severity: 1, line: 20, column: 2 },
      { ruleId: "sonarjs/no-small-switch", severity: 1, line: 3, column: 1 },
    ],
  },
  {
    filePath: "/repo/src/date-utils.ts",
    messages: [{ ruleId: "sonarjs/no-small-switch", severity: 1, line: 42, column: 1 }],
  },
  {
    filePath: "/repo/src/event-filter.ts",
    messages: [],
  },
];

describe("createQualitySummary", () => {
  it("counts total findings and breaks them down by rule", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary(SAMPLE_REPORT, { cwd: CWD });

    expect(summary.total).toBe(4);
    expect(summary.byRule).toEqual({
      "sonarjs/no-identical-expressions": 2,
      "sonarjs/no-small-switch": 2,
    });
  });

  it("lists findings sorted by file then line, capped at the requested top-N, with paths relative to cwd", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary(SAMPLE_REPORT, { cwd: CWD, topN: 2 });

    expect(summary.topFindings).toEqual([
      { file: "src/date-utils.ts", line: 42, ruleId: "sonarjs/no-small-switch" },
      { file: "src/todo-parser.ts", line: 3, ruleId: "sonarjs/no-small-switch" },
    ]);
  });

  it("returns an empty summary when there are no findings", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary([{ filePath: "/repo/src/empty.ts", messages: [] }], { cwd: CWD });

    expect(summary.total).toBe(0);
    expect(summary.byRule).toEqual({});
    expect(summary.topFindings).toEqual([]);
  });
});

describe("formatQualitySummaryMarkdown", () => {
  it("renders the total, the per-rule breakdown sorted by count, and the top findings as Datei:Zeile", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();

    const markdown = formatQualitySummaryMarkdown(createQualitySummary(SAMPLE_REPORT, { cwd: CWD }));

    expect(markdown).toContain("**Total findings:** 4");
    expect(markdown).toContain("| sonarjs/no-identical-expressions | 2 |");
    expect(markdown).toContain("| sonarjs/no-small-switch | 2 |");
    expect(markdown).toContain("src/date-utils.ts:42");
    expect(markdown).toContain("src/todo-parser.ts:3");
  });

  it("renders a fallback line when there are no findings", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();

    const markdown = formatQualitySummaryMarkdown(createQualitySummary([{ filePath: "/repo/src/empty.ts", messages: [] }], { cwd: CWD }));

    expect(markdown).toContain("No findings.");
  });
});

describe("quality-summary CLI", () => {
  it("appends the rendered markdown to GITHUB_STEP_SUMMARY when reading a report file", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-quality-summary-"));
    const reportFile = join(root, "eslint.json");
    const summaryFile = join(root, "step-summary.md");

    await writeFile(reportFile, JSON.stringify(SAMPLE_REPORT));
    await writeFile(summaryFile, "# existing summary\n");

    await execFileAsync("node", ["scripts/quality-summary.mjs", reportFile], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
    });

    const summary = await readFile(summaryFile, "utf8");
    expect(summary).toContain("# existing summary");
    expect(summary).toContain("Code Quality Baseline");
    expect(summary).toContain("**Total findings:** 4");
  });

  it("prints to stdout when GITHUB_STEP_SUMMARY is not set", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-quality-summary-"));
    const reportFile = join(root, "eslint.json");
    await writeFile(reportFile, JSON.stringify(SAMPLE_REPORT));

    const { GITHUB_STEP_SUMMARY: _unused, ...envWithoutSummary } = process.env;
    const { stdout } = await execFileAsync("node", ["scripts/quality-summary.mjs", reportFile], {
      env: envWithoutSummary,
    });

    expect(stdout).toContain("Code Quality Baseline");
  });
});
