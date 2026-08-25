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

function sampleReport(cwd: string) {
  return [
    {
      filePath: join(cwd, "src/todo-parser.ts"),
      messages: [
        { ruleId: "sonarjs/no-identical-functions", severity: 1, message: "Duplicate function.", line: 10, column: 2 },
        { ruleId: "sonarjs/cognitive-complexity", severity: 1, message: "Too complex.", line: 25, column: 1 },
        { ruleId: null, severity: 2, message: "Parsing error.", line: 1, column: 1 },
      ],
      errorCount: 1,
      warningCount: 2,
    },
    {
      filePath: join(cwd, "src/date-utils.ts"),
      messages: [
        { ruleId: "sonarjs/no-identical-functions", severity: 1, message: "Duplicate function.", line: 5, column: 3 },
      ],
      errorCount: 0,
      warningCount: 1,
    },
    {
      filePath: join(cwd, "src/event-filter.ts"),
      messages: [],
      errorCount: 0,
      warningCount: 0,
    },
  ];
}

describe("createQualitySummary", () => {
  it("counts total findings, excluding messages without a ruleId", async () => {
    const { createQualitySummary } = await loadQualitySummary();
    const cwd = "/repo";

    const summary = createQualitySummary(sampleReport(cwd), { cwd });

    expect(summary.total).toBe(3);
  });

  it("breaks findings down by ruleId", async () => {
    const { createQualitySummary } = await loadQualitySummary();
    const cwd = "/repo";

    const summary = createQualitySummary(sampleReport(cwd), { cwd });

    expect(summary.byRule).toEqual({
      "sonarjs/no-identical-functions": 2,
      "sonarjs/cognitive-complexity": 1,
    });
  });

  it("lists the top-N findings sorted by file then line, using paths relative to cwd", async () => {
    const { createQualitySummary } = await loadQualitySummary();
    const cwd = "/repo";

    const summary = createQualitySummary(sampleReport(cwd), { cwd, topN: 2 });

    expect(summary.topFindings).toEqual([
      { file: "src/date-utils.ts", line: 5, ruleId: "sonarjs/no-identical-functions", message: "Duplicate function." },
      { file: "src/todo-parser.ts", line: 10, ruleId: "sonarjs/no-identical-functions", message: "Duplicate function." },
    ]);
  });

  it("returns an empty summary for a report with no findings", async () => {
    const { createQualitySummary } = await loadQualitySummary();

    const summary = createQualitySummary([], { cwd: "/repo" });

    expect(summary.total).toBe(0);
    expect(summary.byRule).toEqual({});
    expect(summary.topFindings).toEqual([]);
  });
});

describe("formatQualitySummaryMarkdown", () => {
  it("renders the total count, per-rule breakdown, and top findings as Datei:Zeile", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();
    const cwd = "/repo";

    const markdown = formatQualitySummaryMarkdown(createQualitySummary(sampleReport(cwd), { cwd, topN: 10 }));

    expect(markdown).toContain("**Findings:** 3");
    expect(markdown).toContain("| sonarjs/no-identical-functions | 2 |");
    expect(markdown).toContain("| sonarjs/cognitive-complexity | 1 |");
    expect(markdown).toContain("src/date-utils.ts:5");
    expect(markdown).toContain("src/todo-parser.ts:10");
    expect(markdown).toContain("src/todo-parser.ts:25");
  });

  it("renders fallback text when there are no findings", async () => {
    const { createQualitySummary, formatQualitySummaryMarkdown } = await loadQualitySummary();

    const markdown = formatQualitySummaryMarkdown(createQualitySummary([], { cwd: "/repo" }));

    expect(markdown).toContain("No findings.");
  });
});

describe("quality-summary CLI", () => {
  it("appends the rendered markdown to GITHUB_STEP_SUMMARY when reading a report file", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-quality-summary-"));
    const reportFile = join(root, "eslint.json");
    const summaryFile = join(root, "step-summary.md");

    await writeFile(reportFile, JSON.stringify(sampleReport(process.cwd())));
    await writeFile(summaryFile, "# existing summary\n");

    await execFileAsync("node", ["scripts/quality-summary.mjs", reportFile], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
    });

    const summary = await readFile(summaryFile, "utf8");
    expect(summary).toContain("# existing summary");
    expect(summary).toContain("Code Quality Baseline");
    expect(summary).toContain("**Findings:** 3");
  });

  it("prints to stdout when GITHUB_STEP_SUMMARY is not set", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-quality-summary-"));
    const reportFile = join(root, "eslint.json");
    await writeFile(reportFile, JSON.stringify(sampleReport(process.cwd())));

    const { GITHUB_STEP_SUMMARY: _unused, ...envWithoutSummary } = process.env;
    const { stdout } = await execFileAsync("node", ["scripts/quality-summary.mjs", reportFile], {
      env: envWithoutSummary,
    });

    expect(stdout).toContain("Code Quality Baseline");
  });
});
