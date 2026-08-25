import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

type MutationSummaryModule = typeof import("../scripts/mutation-summary.mjs");
const execFileAsync = promisify(execFile);

async function loadMutationSummary(): Promise<MutationSummaryModule> {
  return import("../scripts/mutation-summary.mjs");
}

const SAMPLE_REPORT = {
  schemaVersion: "1.0",
  files: {
    "src/todo-parser.ts": {
      language: "typescript",
      source: "",
      mutants: [
        { id: "1", mutatorName: "StringLiteral", status: "Killed", location: { start: { line: 3, column: 1 }, end: { line: 3, column: 5 } } },
        { id: "2", mutatorName: "ConditionalExpression", status: "Survived", location: { start: { line: 10, column: 2 }, end: { line: 10, column: 8 } } },
        { id: "3", mutatorName: "BooleanLiteral", status: "Timeout", location: { start: { line: 15, column: 1 }, end: { line: 15, column: 4 } } },
      ],
    },
    "src/date-utils.ts": {
      language: "typescript",
      source: "",
      mutants: [
        { id: "4", mutatorName: "ArithmeticOperator", status: "Survived", location: { start: { line: 42, column: 1 }, end: { line: 42, column: 6 } } },
        { id: "5", mutatorName: "EqualityOperator", status: "NoCoverage", location: { start: { line: 7, column: 1 }, end: { line: 7, column: 3 } } },
      ],
    },
  },
};

describe("createMutationSummary", () => {
  it("counts killed, survived, timeout and no-coverage mutants and computes the mutation score", async () => {
    const { createMutationSummary } = await loadMutationSummary();

    const summary = createMutationSummary(SAMPLE_REPORT);

    expect(summary.counts).toEqual({ killed: 1, survived: 2, timeout: 1, noCoverage: 1, total: 5 });
    // score = (killed + timeout) / (killed + survived + timeout + noCoverage) * 100 = 2/5 * 100
    expect(summary.score).toBeCloseTo(40);
  });

  it("lists survived mutants sorted by file then line, capped at the requested top-N", async () => {
    const { createMutationSummary } = await loadMutationSummary();

    const summary = createMutationSummary(SAMPLE_REPORT, { topN: 1 });

    expect(summary.topSurvived).toEqual([
      { file: "src/date-utils.ts", line: 42, mutatorName: "ArithmeticOperator", status: "Survived" },
    ]);
  });

  it("returns a null score when there are no valid mutants", async () => {
    const { createMutationSummary } = await loadMutationSummary();

    const summary = createMutationSummary({ files: {} });

    expect(summary.score).toBeNull();
    expect(summary.counts).toEqual({ killed: 0, survived: 0, timeout: 0, noCoverage: 0, total: 0 });
    expect(summary.topSurvived).toEqual([]);
  });
});

describe("formatMutationSummaryMarkdown", () => {
  it("renders the mutation score, counts table, and top survived mutants as Datei:Zeile", async () => {
    const { createMutationSummary, formatMutationSummaryMarkdown } = await loadMutationSummary();

    const markdown = formatMutationSummaryMarkdown(createMutationSummary(SAMPLE_REPORT, { topN: 10 }));

    expect(markdown).toContain("40.00%");
    expect(markdown).toContain("| 1 | 2 | 1 | 1 |");
    expect(markdown).toContain("src/date-utils.ts:42");
    expect(markdown).toContain("src/todo-parser.ts:10");
  });

  it("renders a fallback line when no mutants survived", async () => {
    const { createMutationSummary, formatMutationSummaryMarkdown } = await loadMutationSummary();

    const markdown = formatMutationSummaryMarkdown(createMutationSummary({ files: {} }));

    expect(markdown).toContain("No survived mutants.");
  });
});

describe("mutation-summary CLI", () => {
  it("appends the rendered markdown to GITHUB_STEP_SUMMARY when reading a report file", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-mutation-summary-"));
    const reportFile = join(root, "mutation.json");
    const summaryFile = join(root, "step-summary.md");

    await writeFile(reportFile, JSON.stringify(SAMPLE_REPORT));
    await writeFile(summaryFile, "# existing summary\n");

    await execFileAsync("node", ["scripts/mutation-summary.mjs", reportFile], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
    });

    const summary = await readFile(summaryFile, "utf8");
    expect(summary).toContain("# existing summary");
    expect(summary).toContain("Mutation Score");
    expect(summary).toContain("40.00%");
  });

  it("prints to stdout when GITHUB_STEP_SUMMARY is not set", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-mutation-summary-"));
    const reportFile = join(root, "mutation.json");
    await writeFile(reportFile, JSON.stringify(SAMPLE_REPORT));

    const { GITHUB_STEP_SUMMARY: _unused, ...envWithoutSummary } = process.env;
    const { stdout } = await execFileAsync("node", ["scripts/mutation-summary.mjs", reportFile], {
      env: envWithoutSummary,
    });

    expect(stdout).toContain("Mutation Score");
  });
});
