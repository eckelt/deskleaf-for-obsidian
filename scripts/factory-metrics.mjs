#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const DEFAULT_LAST_AUDIT_AT = "1970-01-01T00:00:00Z";
const FEATURE_BRANCH_ISSUE = /^feature\/issue-(\d+)$/;

function execJson(command, args) {
  return JSON.parse(execFileSync(command, args, { encoding: "utf8" }));
}

function issueNumberFromPullRequest(pullRequest) {
  const branchMatch = FEATURE_BRANCH_ISSUE.exec(pullRequest.headRefName);
  if (branchMatch) {
    return Number.parseInt(branchMatch[1], 10);
  }

  const text = `${pullRequest.title}\n${pullRequest.body}`;
  const referenceMatch = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(text) ?? /#(\d+)/.exec(text);
  if (!referenceMatch) {
    return null;
  }
  return Number.parseInt(referenceMatch[1], 10);
}

function countMatching(comments, pattern) {
  return comments.filter((comment) => pattern.test(comment)).length;
}

function metricForIssue(issueNumber, pullRequests, comments) {
  const validatorFailures = countMatching(comments, /🤖\s+\*\*Validator\*\*:\s+Nicht bestanden/i);
  const reviewerFailures = countMatching(comments, /🤖\s+\*\*Code Reviewer\*\*:\s+Nicht bestanden/i);
  const plannerReturns = countMatching(comments, /Zurück zum Planner|zurück zum Planner|Planner scheitert|Spec vermutlich unklar/i);
  const humanRejections = comments.filter((comment) => {
    const normalized = comment.trim();
    return !normalized.startsWith("🤖") && /(fix-forward|passt noch nicht|abnahme scheitert|rejected|ablehnung|nacharbeit)/i.test(normalized);
  }).length;
  const wrongSpecSignals = countMatching(comments, /wrong spec|falsche spec|spec .*falsch|falsch.* spec|Spec .* anderem Issue|falsch zugewiesen/i);
  const loopCount = validatorFailures + reviewerFailures + plannerReturns + humanRejections;
  const prCount = pullRequests.length;

  return {
    issueNumber,
    prCount,
    validatorFailures,
    reviewerFailures,
    plannerReturns,
    humanRejections,
    wrongSpecSignals,
    loopCount,
    notable: loopCount > 3 || prCount > 3 || plannerReturns > 1 || wrongSpecSignals > 0,
    pullRequests: pullRequests.map((pullRequest) => pullRequest.number),
  };
}

export function createFactoryMetrics(input) {
  const lastAuditAt = input.lastAuditAt || DEFAULT_LAST_AUDIT_AT;
  const pullRequestsAfterLastAudit = input.pullRequests.filter((pullRequest) => pullRequest.mergedAt > lastAuditAt);
  const pullRequestsByIssue = new Map();

  for (const pullRequest of pullRequestsAfterLastAudit) {
    const issueNumber = issueNumberFromPullRequest(pullRequest);
    if (issueNumber === null) {
      continue;
    }

    const existing = pullRequestsByIssue.get(issueNumber) ?? [];
    existing.push(pullRequest);
    pullRequestsByIssue.set(issueNumber, existing);
  }

  const issues = [...pullRequestsByIssue.entries()]
    .sort(([left], [right]) => left - right)
    .map(([issueNumber, pullRequests]) => metricForIssue(issueNumber, pullRequests, input.issueComments.get(issueNumber) ?? []));

  return {
    summary: {
      lastAuditAt,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      mergedPullRequestCount: pullRequestsAfterLastAudit.length,
      issueCount: issues.length,
      notableIssueCount: issues.filter((issue) => issue.notable).length,
    },
    issues,
  };
}

function loadPullRequests() {
  if (process.env.FACTORY_REVIEW_OFFLINE_PULL_REQUESTS) {
    return JSON.parse(process.env.FACTORY_REVIEW_OFFLINE_PULL_REQUESTS);
  }

  return execJson("gh", [
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "100",
    "--json",
    "number,mergedAt,headRefName,title,body",
  ]);
}

function loadIssueComments(issueNumbers) {
  if (process.env.FACTORY_REVIEW_OFFLINE_ISSUE_COMMENTS) {
    const rawComments = JSON.parse(process.env.FACTORY_REVIEW_OFFLINE_ISSUE_COMMENTS);
    return new Map(Object.entries(rawComments).map(([issueNumber, comments]) => [Number.parseInt(issueNumber, 10), comments]));
  }

  return new Map(
    issueNumbers.map((issueNumber) => {
      const raw = execJson("gh", ["issue", "view", String(issueNumber), "--json", "comments"]);
      return [issueNumber, raw.comments.map((comment) => comment.body)];
    }),
  );
}

function uniqueIssueNumbers(pullRequests, lastAuditAt) {
  return [
    ...new Set(
      pullRequests
        .filter((pullRequest) => pullRequest.mergedAt > lastAuditAt)
        .map(issueNumberFromPullRequest)
        .filter((issueNumber) => issueNumber !== null),
    ),
  ];
}

function main() {
  const lastAuditAt = process.argv[2] ?? DEFAULT_LAST_AUDIT_AT;
  const pullRequests = loadPullRequests();
  const issueComments = loadIssueComments(uniqueIssueNumbers(pullRequests, lastAuditAt));
  const generatedAt = process.env.FACTORY_REVIEW_NOW ?? new Date().toISOString();

  process.stdout.write(`${JSON.stringify(createFactoryMetrics({ lastAuditAt, pullRequests, issueComments, generatedAt }), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
