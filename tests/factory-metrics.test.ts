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
});

describe("guarded factory review command", () => {
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

    expect(uxDesigner).toContain("Use a strong visual-reasoning model");
    expect(uxDesigner).toContain("You do not own or edit the feature spec");
    expect(uxDesigner).toContain("You do not write production code or tests");
    expect(uxDesigner).toContain("Hand UX contract material back to the Planner");
    expect(workflow).toContain("Produces UX contract material for the Planner");
  });
});
