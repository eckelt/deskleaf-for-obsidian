import { describe, expect, it } from "vitest";

type MutationSummaryModule = typeof import("../scripts/mutation-summary.mjs");

async function loadMutationSummary(): Promise<MutationSummaryModule> {
  return import("../scripts/mutation-summary.mjs");
}

function mutant(status: string, line: number, mutatorName = "ConditionalExpression") {
  return { status, mutatorName, location: { start: { line }, end: { line } } };
}

describe("mutation summary", () => {
  it("computes the mutation score from killed, timeout, and survived mutants", async () => {
    const { summarize } = await loadMutationSummary();

    const summary = summarize({
      files: {
        "src/date-utils.ts": {
          mutants: [mutant("Killed", 1), mutant("Timeout", 2), mutant("Survived", 3), mutant("NoCoverage", 4)],
        },
      },
    });

    expect(summary.counts).toMatchObject({ Killed: 1, Timeout: 1, Survived: 1, NoCoverage: 1 });
    expect(summary.score).toBeCloseTo(66.67, 1);
  });

  it("scores 0 when there are no killed, timeout, or survived mutants to cover", async () => {
    const { summarize } = await loadMutationSummary();

    const summary = summarize({
      files: { "src/date-utils.ts": { mutants: [mutant("NoCoverage", 1)] } },
    });

    expect(summary.score).toBe(0);
  });

  it("sorts survived mutants by file then by line and slices to the top N", async () => {
    const { summarize } = await loadMutationSummary();

    const summary = summarize({
      files: {
        "src/note-utils.ts": { mutants: [mutant("Survived", 30), mutant("Survived", 10)] },
        "src/date-utils.ts": { mutants: [mutant("Survived", 5)] },
      },
    });

    expect(summary.survived.map((entry) => `${entry.file}:${entry.location.start.line}`)).toEqual([
      "src/date-utils.ts:5",
      "src/note-utils.ts:10",
      "src/note-utils.ts:30",
    ]);
  });

  it("caps the survived mutant list at the top 20 entries", async () => {
    const { summarize } = await loadMutationSummary();

    const mutants = Array.from({ length: 25 }, (_unused, index) => mutant("Survived", index + 1));

    const summary = summarize({ files: { "src/date-utils.ts": { mutants } } });

    expect(summary.survived).toHaveLength(20);
    expect(summary.survived[0].location.start.line).toBe(1);
    expect(summary.survived[19].location.start.line).toBe(20);
  });

  it("renders a markdown job summary with score, counts, and survived mutants", async () => {
    const { renderMarkdown } = await loadMutationSummary();

    const markdown = renderMarkdown({
      counts: { Killed: 3, Survived: 1, Timeout: 1, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 },
      score: 80,
      survived: [{ file: "src/date-utils.ts", location: { start: { line: 12 } }, mutatorName: "EqualityOperator" }],
    });

    expect(markdown).toContain("## Mutation Testing Report");
    expect(markdown).toContain("**Mutation score:** 80.00%");
    expect(markdown).toContain("| 3 | 1 | 1 | 0 |");
    expect(markdown).toContain("### Survived mutants (top 1)");
    expect(markdown).toContain("| src/date-utils.ts | 12 | EqualityOperator |");
  });

  it("renders a fallback message when no mutants survived", async () => {
    const { renderMarkdown } = await loadMutationSummary();

    const markdown = renderMarkdown({
      counts: { Killed: 4, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 },
      score: 100,
      survived: [],
    });

    expect(markdown).toContain("No survived mutants.");
    expect(markdown).not.toContain("### Survived mutants");
  });
});
