#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LAST_AUDIT_AT = "1970-01-01T00:00:00Z";
const FEATURE_BRANCH_ISSUE = /^feature\/issue-(\d+)$/;
const ACTIONS_WORKFLOW_NAMES = new Set(["Issue Pipeline", "Build Lane"]);
const LABEL_READY_FOR_ACCEPTANCE = "status:ready-for-acceptance";
const BUILD_LANE_JOB_ISSUE = /^Build issue #(\d+)$/;

function execJson(command, args) {
  return JSON.parse(execFileSync(command, args, { encoding: "utf8" }));
}

// gh api --paginate --slurp returns one array per page; flat() folds them
// into a single array, mirroring the `jq 'flatten'` step in scripts/pipeline/lib.sh.
function execJsonPaginated(command, args) {
  return execJson(command, [...args, "--paginate", "--slurp"]).flat();
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

function timeToDoneMsFor(timestamps) {
  if (!timestamps) {
    return null;
  }
  const endpoint = timestamps.closedAt ?? timestamps.readyForAcceptanceAt;
  if (!endpoint) {
    return null;
  }
  return Date.parse(endpoint) - Date.parse(timestamps.createdAt);
}

function actionsMinutesFor(actionsRuns) {
  return actionsRuns
    .filter((run) => ACTIONS_WORKFLOW_NAMES.has(run.workflowName))
    .reduce((total, run) => total + run.durationMinutes, 0);
}

// null distinguishes "no run reported this field" from a real zero total.
function sumNumericField(agentRuns, field) {
  const values = agentRuns.map((run) => run[field]).filter((value) => typeof value === "number");
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
}

function agentCostFor(agentRuns) {
  return {
    runCount: agentRuns.length,
    totalCostUsd: sumNumericField(agentRuns, "costUsd"),
    totalInputTokens: sumNumericField(agentRuns, "inputTokens"),
    totalOutputTokens: sumNumericField(agentRuns, "outputTokens"),
    totalDurationMs: sumNumericField(agentRuns, "durationMs"),
  };
}

function metricForIssue(issueNumber, pullRequests, comments, timestamps, actionsRuns, agentRuns) {
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
    timeToDoneMs: timeToDoneMsFor(timestamps),
    actionsMinutes: actionsMinutesFor(actionsRuns),
    agentCost: agentCostFor(agentRuns),
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

  const issueTimestamps = input.issueTimestamps ?? new Map();
  const actionsRunsByIssue = input.actionsRunsByIssue ?? new Map();
  const agentRunsByIssue = input.agentRunsByIssue ?? new Map();

  const issues = [...pullRequestsByIssue.entries()]
    .sort(([left], [right]) => left - right)
    .map(([issueNumber, pullRequests]) =>
      metricForIssue(
        issueNumber,
        pullRequests,
        input.issueComments.get(issueNumber) ?? [],
        issueTimestamps.get(issueNumber),
        actionsRunsByIssue.get(issueNumber) ?? [],
        agentRunsByIssue.get(issueNumber) ?? [],
      ),
    );

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

// The pipeline-state comment (scripts/pipeline/lib.sh: STATE_MARKER) is a
// normal issue comment; agentRuns lives in its fenced ```json block. Missing
// marker, fence, or agentRuns array all resolve to null so the caller can
// fall back to an empty list instead of aborting.
const STATE_COMMENT_MARKER = "<!-- deskleaf-pipeline-state -->";

function extractAgentRunsFromComment(comment) {
  if (!comment.startsWith(STATE_COMMENT_MARKER)) {
    return null;
  }
  const fenceMatch = /```json\n([\s\S]*?)\n```/.exec(comment);
  if (!fenceMatch) {
    return null;
  }
  try {
    const state = JSON.parse(fenceMatch[1]);
    return Array.isArray(state.agentRuns) ? state.agentRuns : null;
  } catch {
    return null;
  }
}

// Reuses the already-loaded issue comments (no extra `gh` call): the pipeline
// state is only ever posted as one of an issue's own comments.
function loadAgentRunsByIssue(issueComments) {
  return new Map(
    [...issueComments.entries()].map(([issueNumber, comments]) => {
      const stateEntries = comments.map(extractAgentRunsFromComment).filter((agentRuns) => agentRuns !== null);
      return [issueNumber, stateEntries.length > 0 ? stateEntries[stateEntries.length - 1] : []];
    }),
  );
}

function loadIssueTimestamps(issueNumbers) {
  if (process.env.FACTORY_REVIEW_OFFLINE_ISSUE_TIMESTAMPS) {
    const raw = JSON.parse(process.env.FACTORY_REVIEW_OFFLINE_ISSUE_TIMESTAMPS);
    return new Map(Object.entries(raw).map(([issueNumber, timestamps]) => [Number.parseInt(issueNumber, 10), timestamps]));
  }

  return new Map(
    issueNumbers.map((issueNumber) => {
      const issue = execJson("gh", ["issue", "view", String(issueNumber), "--json", "createdAt,closedAt,title"]);
      const events = execJsonPaginated("gh", ["api", `repos/:owner/:repo/issues/${issueNumber}/events`]);
      const readyEvents = events.filter((event) => event.event === "labeled" && event.label?.name === LABEL_READY_FOR_ACCEPTANCE);
      const readyForAcceptanceAt = readyEvents.length > 0 ? readyEvents[readyEvents.length - 1].created_at : null;
      return [issueNumber, { createdAt: issue.createdAt, closedAt: issue.closedAt, readyForAcceptanceAt, title: issue.title }];
    }),
  );
}

function runDurationMinutes(run) {
  return (Date.parse(run.updatedAt) - Date.parse(run.startedAt)) / 60000;
}

// Build Lane's single job is named "Build issue #<n>" (.github/workflows/build-lane.yml),
// a reliable per-run association. Issue Pipeline (.github/workflows/issue-pipeline.yml)
// has no such job name; runs triggered by an issue event get displayTitle set to the
// issue's own title, so those are matched by title instead. workflow_dispatch re-plan
// runs keep the generic "Issue Pipeline" title and are not attributable to an issue —
// the GitHub Actions API exposes no workflow_dispatch inputs after the fact — so they
// are left out of actionsMinutes, an accepted undercount for an informational proxy.
function buildLaneIssueNumber(run) {
  const jobs = execJson("gh", ["run", "view", String(run.databaseId), "--json", "jobs"]).jobs;
  const match = jobs.length > 0 ? BUILD_LANE_JOB_ISSUE.exec(jobs[0].name) : null;
  return match ? Number.parseInt(match[1], 10) : null;
}

function issuePipelineIssueNumber(run, issueTimestamps) {
  const match = [...issueTimestamps.entries()].find(([, details]) => details.title === run.displayTitle);
  return match ? match[0] : null;
}

function loadActionsRunsByIssue(issueNumbers, issueTimestamps) {
  if (process.env.FACTORY_REVIEW_OFFLINE_ACTIONS_RUNS) {
    const raw = JSON.parse(process.env.FACTORY_REVIEW_OFFLINE_ACTIONS_RUNS);
    return new Map(Object.entries(raw).map(([issueNumber, runs]) => [Number.parseInt(issueNumber, 10), runs]));
  }

  const result = new Map();
  if (issueNumbers.length === 0) {
    return result;
  }

  const addRun = (issueNumber, workflowName, durationMinutes) => {
    if (issueNumber === null) {
      return;
    }
    const existing = result.get(issueNumber) ?? [];
    existing.push({ workflowName, durationMinutes });
    result.set(issueNumber, existing);
  };

  const buildLaneRuns = execJson("gh", [
    "run",
    "list",
    "--workflow",
    "Build Lane",
    "--status",
    "completed",
    "--limit",
    "100",
    "--json",
    "databaseId,startedAt,updatedAt",
  ]);
  for (const run of buildLaneRuns) {
    addRun(buildLaneIssueNumber(run), "Build Lane", runDurationMinutes(run));
  }

  const issuePipelineRuns = execJson("gh", [
    "run",
    "list",
    "--workflow",
    "Issue Pipeline",
    "--status",
    "completed",
    "--limit",
    "100",
    "--json",
    "displayTitle,startedAt,updatedAt",
  ]);
  for (const run of issuePipelineRuns) {
    addRun(issuePipelineIssueNumber(run, issueTimestamps), "Issue Pipeline", runDurationMinutes(run));
  }

  return result;
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
  const issueNumbers = uniqueIssueNumbers(pullRequests, lastAuditAt);
  const issueComments = loadIssueComments(issueNumbers);
  const issueTimestamps = loadIssueTimestamps(issueNumbers);
  const actionsRunsByIssue = loadActionsRunsByIssue(issueNumbers, issueTimestamps);
  const agentRunsByIssue = loadAgentRunsByIssue(issueComments);
  const generatedAt = process.env.FACTORY_REVIEW_NOW ?? new Date().toISOString();

  process.stdout.write(
    `${JSON.stringify(
      createFactoryMetrics({
        lastAuditAt,
        pullRequests,
        issueComments,
        issueTimestamps,
        actionsRunsByIssue,
        agentRunsByIssue,
        generatedAt,
      }),
      null,
      2,
    )}\n`,
  );
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
