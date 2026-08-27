#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT_PATH = "reports/quality/eslint.json";
const DEFAULT_TOP_N = 10;

function collectFindings(report, cwd) {
  const findings = [];
  for (const fileResult of report) {
    for (const message of fileResult.messages ?? []) {
      findings.push({
        file: relative(cwd, fileResult.filePath),
        line: message.line ?? null,
        ruleId: message.ruleId ?? "unknown",
      });
    }
  }
  return findings;
}

export function createQualitySummary(report, options = {}) {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const cwd = options.cwd ?? process.cwd();
  const findings = collectFindings(report, cwd);

  const byRule = {};
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
  }

  const topFindings = [...findings]
    .sort((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0))
    .slice(0, topN);

  return { total: findings.length, byRule, topFindings };
}

function sortedRuleEntries(byRule) {
  return Object.entries(byRule).sort(
    ([leftRule, leftCount], [rightRule, rightCount]) => rightCount - leftCount || leftRule.localeCompare(rightRule),
  );
}

export function formatQualitySummaryMarkdown(summary) {
  const { total, byRule, topFindings } = summary;
  const lines = ["## Code Quality Baseline (sonarjs)", "", `**Total findings:** ${total}`, ""];

  const ruleEntries = sortedRuleEntries(byRule);
  if (ruleEntries.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Rule | Count |", "| --- | --- |");
    for (const [ruleId, count] of ruleEntries) {
      lines.push(`| ${ruleId} | ${count} |`);
    }
  }

  lines.push("");

  if (topFindings.length > 0) {
    lines.push("### Top Findings", "", "| Datei:Zeile | Regel |", "| --- | --- |");
    for (const finding of topFindings) {
      lines.push(`| ${finding.file}:${finding.line ?? "?"} | ${finding.ruleId} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const reportPath = process.argv[2] ?? DEFAULT_REPORT_PATH;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const markdown = formatQualitySummaryMarkdown(createQualitySummary(report));

  if (summaryPath) {
    await appendFile(summaryPath, `${markdown}\n`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
