#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT_PATH = "reports/quality/eslint.json";
const DEFAULT_TOP_N = 10;

function collectFindings(report) {
  const findings = [];
  for (const fileResult of report) {
    for (const message of fileResult.messages ?? []) {
      findings.push({
        file: fileResult.filePath,
        line: message.line ?? null,
        ruleId: message.ruleId ?? "unknown",
      });
    }
  }
  return findings;
}

function countByRule(findings) {
  const byRule = {};
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
  }
  return byRule;
}

export function createQualitySummary(report, options = {}) {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const findings = collectFindings(report);

  const topFindings = [...findings]
    .sort((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0))
    .slice(0, topN);

  return {
    total: findings.length,
    byRule: countByRule(findings),
    topFindings,
  };
}

function sortedRuleEntries(byRule) {
  return Object.entries(byRule).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

export function formatQualitySummaryMarkdown(summary) {
  const { total, byRule, topFindings } = summary;
  const lines = ["## Code Quality Baseline", "", `**Findings:** ${total}`, ""];

  const ruleEntries = sortedRuleEntries(byRule);
  if (ruleEntries.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("### Findings by Rule", "", "| Rule | Count |", "| --- | --- |");
    for (const [ruleId, count] of ruleEntries) {
      lines.push(`| ${ruleId} | ${count} |`);
    }

    lines.push("", "### Top Findings", "", "| Datei:Zeile | Rule |", "| --- | --- |");
    for (const finding of topFindings) {
      lines.push(`| ${finding.file}:${finding.line ?? "?"} | ${finding.ruleId} |`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const reportPath = process.argv[2] ?? DEFAULT_REPORT_PATH;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  const rawReport = JSON.parse(await readFile(reportPath, "utf8"));
  const report = rawReport.map((fileResult) => ({
    ...fileResult,
    filePath: relative(process.cwd(), fileResult.filePath),
  }));
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
