import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

type FactoryMetricsModule = typeof import("../scripts/factory-metrics.mjs");
const execFileAsync = promisify(execFile);

async function loadFactoryMetrics(): Promise<FactoryMetricsModule> {
  return import("../scripts/factory-metrics.mjs");
}

describe("factory metrics", () => {
  it("filters merged pull requests after the last audit timestamp and associates issues from feature branches", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 10,
          mergedAt: "2026-07-01T00:00:00Z",
          headRefName: "feature/issue-9",
          title: "old",
          body: "",
        },
        {
          number: 11,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-28",
          title: "factory review",
          body: "",
        },
      ],
      issueComments: new Map(),
    });

    expect(metrics.summary.mergedPullRequestCount).toBe(1);
    expect(metrics.issues).toEqual([
      expect.objectContaining({
        issueNumber: 28,
        prCount: 1,
      }),
    ]);
  });

  it("counts validator, reviewer, planner, human rejection, and wrong-spec loops per issue", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 12,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-28",
          title: "factory review",
          body: "",
        },
      ],
      issueComments: new Map([
        [
          28,
          [
            "🤖 **Validator**: Nicht bestanden - AC-1 fehlt.",
            "🤖 **Validator**: Nicht bestanden - AC-2 fehlt.",
            "🤖 **Code Reviewer**: Nicht bestanden - lesbarer machen.",
            "Das passt noch nicht, bitte Fix-forward.",
            "Wrong spec: das gehoert zu einem anderen Issue.",
            "🤖 **Pipeline**: Zurück zum Planner. Grund: Validator scheitert wiederholt an AC-2.",
          ],
        ],
      ]),
    });

    expect(metrics.issues).toEqual([
      {
        issueNumber: 28,
        prCount: 1,
        validatorFailures: 2,
        reviewerFailures: 1,
        plannerReturns: 1,
        humanRejections: 1,
        wrongSpecSignals: 1,
        loopCount: 5,
        notable: true,
        pullRequests: [12],
        timeToDoneMs: null,
        actionsMinutes: 0,
        agentCost: { runCount: 0, totalCostUsd: null, totalInputTokens: null, totalOutputTokens: null, totalDurationMs: null },
      },
    ]);
  });

  it("marks an issue notable when total rejection loops exceed three", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 13,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-30",
          title: "threshold",
          body: "",
        },
      ],
      issueComments: new Map([
        [
          30,
          [
            "🤖 **Validator**: Nicht bestanden - AC-1.",
            "🤖 **Validator**: Nicht bestanden - AC-2.",
            "🤖 **Code Reviewer**: Nicht bestanden - style.",
            "Bitte Fix-forward, die Abnahme scheitert.",
          ],
        ],
      ]),
    });

    expect(metrics.issues[0]).toMatchObject({
      validatorFailures: 2,
      reviewerFailures: 1,
      humanRejections: 1,
      wrongSpecSignals: 0,
      loopCount: 4,
      notable: true,
    });
  });

  it("marks an issue notable when more than three pull requests were merged for it", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 14,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-31",
          title: "first build",
          body: "",
        },
        {
          number: 15,
          mergedAt: "2026-07-03T00:00:00Z",
          headRefName: "feature/issue-31",
          title: "second build",
          body: "",
        },
        {
          number: 16,
          mergedAt: "2026-07-04T00:00:00Z",
          headRefName: "feature/issue-31",
          title: "third build",
          body: "",
        },
        {
          number: 17,
          mergedAt: "2026-07-05T00:00:00Z",
          headRefName: "feature/issue-31",
          title: "fourth build",
          body: "",
        },
      ],
      issueComments: new Map(),
    });

    expect(metrics.issues[0]).toMatchObject({
      issueNumber: 31,
      prCount: 4,
      plannerReturns: 0,
      wrongSpecSignals: 0,
      loopCount: 0,
      notable: true,
    });
  });

  it("marks an issue notable when more than one planner return occurred", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 18,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-32",
          title: "planner returns",
          body: "",
        },
      ],
      issueComments: new Map([
        [
          32,
          [
            "🤖 **Pipeline**: Zurück zum Planner. Grund: Validator scheitert wiederholt an AC-2.",
            "🤖 **Pipeline**: Spec vermutlich unklar, zurück zum Planner.",
          ],
        ],
      ]),
    });

    expect(metrics.issues[0]).toMatchObject({
      issueNumber: 32,
      prCount: 1,
      plannerReturns: 2,
      humanRejections: 0,
      wrongSpecSignals: 0,
      loopCount: 2,
      notable: true,
    });
  });

  it("marks an issue notable when the only signal is a wrong-spec comment", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        {
          number: 19,
          mergedAt: "2026-07-02T00:00:00Z",
          headRefName: "feature/issue-33",
          title: "wrong spec signal",
          body: "",
        },
      ],
      issueComments: new Map([[33, ["Wrong spec: the implementation belongs to another issue."]]]),
    });

    expect(metrics.issues[0]).toMatchObject({
      issueNumber: 33,
      prCount: 1,
      plannerReturns: 0,
      humanRejections: 0,
      wrongSpecSignals: 1,
      loopCount: 0,
      notable: true,
    });
  });
});

describe("factory metrics: time-to-done (AC1)", () => {
  it("uses the close timestamp for a closed issue", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 40, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-40", title: "t", body: "" }],
      issueComments: new Map(),
      issueTimestamps: new Map([[40, { createdAt: "2026-07-01T00:00:00Z", closedAt: "2026-07-03T00:00:00Z", readyForAcceptanceAt: null }]]),
    });

    expect(metrics.issues[0].timeToDoneMs).toBe(Date.parse("2026-07-03T00:00:00Z") - Date.parse("2026-07-01T00:00:00Z"));
  });

  it("falls back to the last ready-for-acceptance label event for a still-open issue", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 41, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-41", title: "t", body: "" }],
      issueComments: new Map(),
      issueTimestamps: new Map([[41, { createdAt: "2026-07-01T00:00:00Z", closedAt: null, readyForAcceptanceAt: "2026-07-04T00:00:00Z" }]]),
    });

    expect(metrics.issues[0].timeToDoneMs).toBe(Date.parse("2026-07-04T00:00:00Z") - Date.parse("2026-07-01T00:00:00Z"));
  });

  it("is null for an issue that is still open and never reached ready-for-acceptance", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 42, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-42", title: "t", body: "" }],
      issueComments: new Map(),
      issueTimestamps: new Map([[42, { createdAt: "2026-07-01T00:00:00Z", closedAt: null, readyForAcceptanceAt: null }]]),
    });

    expect(metrics.issues[0].timeToDoneMs).toBeNull();
  });

  it("is null when no timestamps were resolved for the issue at all", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 43, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-43", title: "t", body: "" }],
      issueComments: new Map(),
    });

    expect(metrics.issues[0].timeToDoneMs).toBeNull();
  });
});

describe("factory metrics: GitHub Actions minutes (AC2)", () => {
  it("sums Issue Pipeline and Build Lane run minutes for the issue, ignoring unrelated workflows", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 44, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-44", title: "t", body: "" }],
      issueComments: new Map(),
      actionsRunsByIssue: new Map([
        [
          44,
          [
            { workflowName: "Issue Pipeline", durationMinutes: 4 },
            { workflowName: "Issue Pipeline", durationMinutes: 6 },
            { workflowName: "Build Lane", durationMinutes: 20 },
            { workflowName: "Release", durationMinutes: 100 },
          ],
        ],
      ]),
    });

    expect(metrics.issues[0].actionsMinutes).toBe(30);
  });

  it("is 0 for an issue with no associated runs", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 45, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-45", title: "t", body: "" }],
      issueComments: new Map(),
      actionsRunsByIssue: new Map([[45, []]]),
    });

    expect(metrics.issues[0].actionsMinutes).toBe(0);
  });
});

describe("factory metrics: aggregated agent cost (AC3)", () => {
  it("sums cost, tokens, and duration across all agent runs", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 46, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-46", title: "t", body: "" }],
      issueComments: new Map(),
      agentRunsByIssue: new Map([
        [
          46,
          [
            { costUsd: 0.12, inputTokens: 1000, outputTokens: 500, durationMs: 4000 },
            { costUsd: 0.08, inputTokens: 2000, outputTokens: 300, durationMs: 6000 },
          ],
        ],
      ]),
    });

    expect(metrics.issues[0].agentCost).toEqual({
      runCount: 2,
      totalCostUsd: 0.2,
      totalInputTokens: 3000,
      totalOutputTokens: 800,
      totalDurationMs: 10000,
    });
  });

  it("only sums fields that are actually present across runs, per the acceptance scenario", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [{ number: 47, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-47", title: "t", body: "" }],
      issueComments: new Map(),
      agentRunsByIssue: new Map([
        [
          47,
          [
            { costUsd: 0.12, inputTokens: 1000 },
            { costUsd: 0.08 },
          ],
        ],
      ]),
    });

    expect(metrics.issues[0].agentCost.runCount).toBe(2);
    expect(metrics.issues[0].agentCost.totalCostUsd).toBe(0.2);
    expect(metrics.issues[0].agentCost.totalInputTokens).toBe(1000);
    expect(metrics.issues[0].agentCost.totalOutputTokens).toBeNull();
    expect(metrics.issues[0].agentCost.totalDurationMs).toBeNull();
  });

  it("does not abort the report and defaults every total to null when agentRuns is missing or empty", async () => {
    const { createFactoryMetrics } = await loadFactoryMetrics();

    const metrics = createFactoryMetrics({
      lastAuditAt: "2026-07-01T00:00:00Z",
      pullRequests: [
        { number: 48, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-48", title: "t", body: "" },
        { number: 49, mergedAt: "2026-07-04T00:00:00Z", headRefName: "feature/issue-49", title: "t", body: "" },
      ],
      issueComments: new Map(),
      agentRunsByIssue: new Map([[48, []]]),
    });

    const expectedDefault = { runCount: 0, totalCostUsd: null, totalInputTokens: null, totalOutputTokens: null, totalDurationMs: null };
    expect(metrics.issues[0].agentCost).toEqual(expectedDefault);
    expect(metrics.issues[1].agentCost).toEqual(expectedDefault);
  });
});

describe("guarded factory review command", () => {
  it("can be started through both manual and daily package scripts", async () => {
    const commands = [
      { label: "manual", args: ["run", "factory:review", "--silent"] },
      { label: "daily", args: ["run", "factory:review:daily", "--silent"] },
    ];

    for (const command of commands) {
      const root = await mkdtemp(join(tmpdir(), `deskleaf-factory-review-${command.label}-`));
      const stateFile = join(root, "factory-review-state.json");
      const agentMarker = join(root, "agent-was-called");

      await writeFile(stateFile, JSON.stringify({ lastAuditAt: "2026-07-02T00:00:00Z" }));

      const { stdout } = await execFileAsync("npm", command.args, {
        env: {
          ...process.env,
          FACTORY_REVIEW_STATE: stateFile,
          FACTORY_REVIEW_NOW: "2026-07-03T00:00:00Z",
          FACTORY_REVIEW_METRICS_FILE: join(root, "metrics.json"),
          FACTORY_REVIEW_AGENT_CMD: `touch ${agentMarker}`,
          FACTORY_REVIEW_OFFLINE_PULL_REQUESTS: JSON.stringify([]),
        },
      });

      await expect(stat(agentMarker)).rejects.toMatchObject({ code: "ENOENT" });
      expect(stdout).toContain("No pull requests merged since last Factory Review audit");

      const state = JSON.parse(await readFile(stateFile, "utf8")) as {
        lastAuditAt: string;
      };
      expect(state.lastAuditAt).toBe("2026-07-03T00:00:00Z");
    }
  }, 15000);

  it("skips without invoking the agent and updates state when no PR was merged after the last audit", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-factory-review-"));
    const stateFile = join(root, "factory-review-state.json");
    const agentMarker = join(root, "agent-was-called");

    await writeFile(stateFile, JSON.stringify({ lastAuditAt: "2026-07-02T00:00:00Z" }));

    const { stdout } = await execFileAsync("bash", ["scripts/factory-review.sh"], {
      env: {
        ...process.env,
        FACTORY_REVIEW_STATE: stateFile,
        FACTORY_REVIEW_NOW: "2026-07-03T00:00:00Z",
        FACTORY_REVIEW_METRICS_FILE: join(root, "metrics.json"),
        FACTORY_REVIEW_AGENT_CMD: `touch ${agentMarker}`,
        FACTORY_REVIEW_OFFLINE_PULL_REQUESTS: JSON.stringify([
          {
            number: 1,
            mergedAt: "2026-07-01T00:00:00Z",
            headRefName: "feature/issue-28",
            title: "old",
            body: "",
          },
        ]),
      },
    });

    await expect(stat(agentMarker)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(root, "metrics.json"))).resolves.toBeTruthy();
    expect(stdout).toContain("No pull requests merged since last Factory Review audit");

    const state = JSON.parse(await readFile(stateFile, "utf8")) as {
      lastAuditAt: string;
    };
    expect(state.lastAuditAt).toBe("2026-07-03T00:00:00Z");
  });

  it("invokes the agent with metrics and updates state when a PR was merged after the last audit", async () => {
    const root = await mkdtemp(join(tmpdir(), "deskleaf-factory-review-"));
    const stateFile = join(root, "factory-review-state.json");
    const agentInput = join(root, "agent-input.md");

    await writeFile(stateFile, JSON.stringify({ lastAuditAt: "2026-07-01T00:00:00Z" }));

    await execFileAsync("bash", ["scripts/factory-review.sh"], {
      env: {
        ...process.env,
        FACTORY_REVIEW_STATE: stateFile,
        FACTORY_REVIEW_NOW: "2026-07-03T00:00:00Z",
        FACTORY_REVIEW_METRICS_FILE: join(root, "metrics.json"),
        FACTORY_REVIEW_AGENT_CMD: `cat > ${agentInput}`,
        FACTORY_REVIEW_OFFLINE_PULL_REQUESTS: JSON.stringify([
          {
            number: 2,
            mergedAt: "2026-07-02T00:00:00Z",
            headRefName: "feature/issue-28",
            title: "factory review",
            body: "",
          },
        ]),
        FACTORY_REVIEW_OFFLINE_ISSUE_COMMENTS: JSON.stringify({
          28: ["🤖 **Validator**: Nicht bestanden - AC-1 fehlt."],
        }),
        FACTORY_REVIEW_OFFLINE_ISSUE_TIMESTAMPS: JSON.stringify({}),
        FACTORY_REVIEW_OFFLINE_ACTIONS_RUNS: JSON.stringify({}),
      },
    });

    const prompt = await readFile(agentInput, "utf8");
    expect(prompt).toContain("Factory Reviewer Agent");
    expect(prompt).toContain('"issueNumber": 28');
    expect(prompt).toContain('"validatorFailures": 1');

    const state = JSON.parse(await readFile(stateFile, "utf8")) as {
      lastAuditAt: string;
    };
    expect(state.lastAuditAt).toBe("2026-07-03T00:00:00Z");
  });
});

describe("factory review documentation", () => {
  function expectSection(document: string, heading: string): string {
    const sectionPattern = new RegExp(`(?:^|\\n)## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = sectionPattern.exec(document);

    expect(match, `Expected section "## ${heading}"`).not.toBeNull();

    return match?.[1] ?? "";
  }

  it("documents measurable Factory Reviewer rules and the guarded audit workflow", async () => {
    const factoryReviewer = await readFile(".github/agents/factory-reviewer.md", "utf8");
    const workflow = await readFile("docs/agent-workflow.md", "utf8");
    const adr = await readFile("docs/adr/0001-autonomous-issue-pipeline.md", "utf8");

    expect(factoryReviewer).toContain("measurable");
    expect(factoryReviewer).toContain("more than three total rejection loops");
    expect(workflow).toContain("First checks whether any PR was merged since the last Factory Review audit");
    expect(workflow).toContain("Factory Metrics");
    expect(adr).toContain("without an LLM/agent call");
  });

  it("keeps the UX Designer as planning support without spec or code ownership", async () => {
    const uxDesigner = await readFile(".github/agents/ux-designer.md", "utf8");
    const workflow = await readFile("docs/agent-workflow.md", "utf8");
    const modelChoice = expectSection(uxDesigner, "Model Choice");
    const inputs = expectSection(uxDesigner, "Inputs");
    const scopeControl = expectSection(uxDesigner, "Scope Control");
    const outputFormat = expectSection(uxDesigner, "Output Format");

    expect(modelChoice).toContain("Use a strong visual-reasoning model");
    expect(inputs).toContain("The GitHub issue and human clarification");
    expect(inputs).toContain("Relevant screenshots, screen recordings, or current UI files");
    expect(inputs).toContain("The design system and existing workflow documentation");
    expect(scopeControl).toContain("You do not own or edit the feature spec");
    expect(scopeControl).toContain("You do not write production code or tests");
    expect(scopeControl).toContain("Hand UX contract material back to the Planner");
    expect(outputFormat).toContain("Respond with UX contract material the Planner can use");
    expect(workflow).toContain("Optional planning support for visually or interaction-heavy features");
    expect(workflow).toContain("Helps the Planner explore screenshots, interaction flows, states, and manual");
    expect(workflow).toContain("Produces UX contract material for the Planner");
  });
});
