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

const SAMPLE_REPORT = [
  {
    filePath: "src/brain-vault.ts",
    messages: [
      { ruleId: "sonarjs/super-linear-regex", severity: 1, message: "Simplify.", line: 16, column: 14 },
      { ruleId: "sonarjs/no-duplicate-string", severity: 1, message: "Duplicate.", line: 40, column: 3 },
    ],
  },
  {
    filePath: "src/todo-parser.ts",
    messages: [
      { ruleId: "sonarjs/super-linear-regex", severity: 1, message: "Simplify.", line: 8, column: 5 },
      { ruleId: "sonarjs/no-identical-functions", severity: 1, message: "Identical.", line: 22, column: 1 },
    ],
  },
  {
    filePath: "src/date-utils.ts",
    messages: [],
  },
];

describe("createQualitySummary", () => {
  it("counts total findings across all files", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary(SAMPLE_REPORT);

    expect(summary.total).toBe(4);
  });

  it("breaks findings down by ruleId", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary(SAMPLE_REPORT);

    expect(summary.byRule).toEqual({
      "sonarjs/super-linear-regex": 2,
      "sonarjs/no-duplicate-string": 1,
      "sonarjs/no-identical-functions": 1,
    });
  });

  it("lists the top-N findings sorted by file then line", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary(SAMPLE_REPORT, { topN: 2 });

    expect(summary.topFindings).toEqual([
      { file: "src/brain-vault.ts", line: 16, ruleId: "sonarjs/super-linear-regex" },
      { file: "src/brain-vault.ts", line: 40, ruleId: "sonarjs/no-duplicate-string" },
    ]);
  });

  it("returns an empty summary when there are no findings", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary([{ filePath: "src/date-utils.ts", messages: [] }]);

    expect(summary.total).toBe(0);
    expect(summary.byRule).toEqual({});
    expect(summary.topFindings).toEqual([]);
  });
});

describe("formatQualitySummaryMarkdown", () => {
  it("renders the total, the per-rule breakdown, and the top findings as Datei:Zeile", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();

    const markdown = formatQualitySummaryMarkdown(createQualitySummary(SAMPLE_REPORT, { topN: 10 }));

    expect(markdown).toContain("**Findings:** 4");
    expect(markdown).toContain("| sonarjs/super-linear-regex | 2 |");
    expect(markdown).toContain("src/brain-vault.ts:16");
    expect(markdown).toContain("src/todo-parser.ts:8");
  });

  it("renders a fallback line when there are no findings", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();

    const markdown = formatQualitySummaryMarkdown(createQualitySummary([{ filePath: "src/date-utils.ts", messages: [] }]));

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
    expect(summary).toContain("**Findings:** 4");
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
