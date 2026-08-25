#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_PATH = "reports/mutation/mutation.json";
const TOP_N_SURVIVED = 20;

function loadReport(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function summarize(report) {
  const mutants = Object.entries(report.files).flatMap(([file, data]) =>
    data.mutants.map((mutant) => ({ ...mutant, file })),
  );

  const counts = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 };
  for (const mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
  }

  const detected = counts.Killed + counts.Timeout;
  const covered = detected + counts.Survived;
  const score = covered > 0 ? (detected / covered) * 100 : 0;

  const survived = mutants
    .filter((mutant) => mutant.status === "Survived")
    .sort((a, b) => (a.file === b.file ? a.location.start.line - b.location.start.line : a.file.localeCompare(b.file)))
    .slice(0, TOP_N_SURVIVED);

  return { counts, score, survived };
}

export function renderMarkdown({ counts, score, survived }) {
  const lines = [];
  lines.push("## Mutation Testing Report");
  lines.push("");
  lines.push(`**Mutation score:** ${score.toFixed(2)}%`);
  lines.push("");
  lines.push("| Killed | Survived | Timeout | No coverage |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(`| ${counts.Killed} | ${counts.Survived} | ${counts.Timeout} | ${counts.NoCoverage} |`);
  lines.push("");
  if (survived.length > 0) {
    lines.push(`### Survived mutants (top ${survived.length})`);
    lines.push("");
    lines.push("| File | Line | Mutator |");
    lines.push("| --- | --- | --- |");
    for (const mutant of survived) {
      lines.push(`| ${mutant.file} | ${mutant.location.start.line} | ${mutant.mutatorName} |`);
    }
  } else {
    lines.push("No survived mutants.");
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const report = loadReport(REPORT_PATH);
  process.stdout.write(renderMarkdown(summarize(report)));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
