#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT_PATH = "reports/mutation/mutation.json";
const DEFAULT_TOP_N = 10;

function collectMutants(report) {
  const mutants = [];
  for (const [file, fileReport] of Object.entries(report.files ?? {})) {
    for (const mutant of fileReport.mutants ?? []) {
      mutants.push({
        file,
        line: mutant.location?.start?.line ?? null,
        mutatorName: mutant.mutatorName,
        status: mutant.status,
      });
    }
  }
  return mutants;
}

function countByStatus(mutants, status) {
  return mutants.filter((mutant) => mutant.status === status).length;
}

export function createMutationSummary(report, options = {}) {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const mutants = collectMutants(report);

  const killed = countByStatus(mutants, "Killed");
  const survived = countByStatus(mutants, "Survived");
  const timeout = countByStatus(mutants, "Timeout");
  const noCoverage = countByStatus(mutants, "NoCoverage");
  const validMutantCount = killed + survived + timeout + noCoverage;

  const topSurvived = mutants
    .filter((mutant) => mutant.status === "Survived")
    .sort((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0))
    .slice(0, topN);

  return {
    score: validMutantCount === 0 ? null : (100 * (killed + timeout)) / validMutantCount,
    counts: { killed, survived, timeout, noCoverage, total: mutants.length },
    topSurvived,
  };
}

function formatScore(score) {
  return score === null ? "n/a" : `${score.toFixed(2)}%`;
}

export function formatMutationSummaryMarkdown(summary) {
  const { score, counts, topSurvived } = summary;
  const lines = [
    "## Mutation Testing",
    "",
    `**Mutation Score:** ${formatScore(score)}`,
    "",
    "| Killed | Survived | Timeout | No Coverage |",
    "| --- | --- | --- | --- |",
    `| ${counts.killed} | ${counts.survived} | ${counts.timeout} | ${counts.noCoverage} |`,
    "",
  ];

  if (topSurvived.length === 0) {
    lines.push("No survived mutants.");
  } else {
    lines.push("### Top Survived Mutants", "", "| Datei:Zeile | Mutator |", "| --- | --- |");
    for (const mutant of topSurvived) {
      lines.push(`| ${mutant.file}:${mutant.line ?? "?"} | ${mutant.mutatorName} |`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const reportPath = process.argv[2] ?? DEFAULT_REPORT_PATH;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const markdown = formatMutationSummaryMarkdown(createMutationSummary(report));

  if (summaryPath) {
    await appendFile(summaryPath, `${markdown}\n`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
