#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const eventPath = process.env.GITHUB_EVENT_PATH;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.5";
const outputPath = process.env.CODEX_DEMO_OUTPUT || "codex-issue-demo-comment.md";

if (!eventPath) {
  throw new Error("GITHUB_EVENT_PATH is required.");
}

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
const issue = event.issue;

if (!issue) {
  throw new Error("This script must run from a GitHub issues event.");
}

const labels = issue.labels.map((label) => label.name).join(", ") || "none";
const prompt = [
  `Repository: ${event.repository.full_name}`,
  `Issue #${issue.number}: ${issue.title}`,
  `Author: ${issue.user.login}`,
  `Labels: ${labels}`,
  "",
  issue.body || "(No issue body provided.)",
].join("\n");

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    instructions: [
      "You are a concise repository triage assistant.",
      "Reply in German.",
      "Do not claim that you changed files or ran tests.",
      "Focus on the next useful engineering step for this GitHub issue.",
      "Use the repository context from the issue only; do not invent hidden code details.",
      "Keep the answer under 180 words.",
    ].join(" "),
    input: prompt,
    max_output_tokens: 500,
  }),
});

const payload = await response.json();

if (!response.ok) {
  const message = payload.error?.message || response.statusText;
  throw new Error(`OpenAI API request failed: ${message}`);
}

const text = payload.output_text?.trim();

if (!text) {
  throw new Error("OpenAI API response did not include output_text.");
}

const comment = [
  "<!-- codex-demo-response -->",
  `**Codex Demo (${model})**`,
  "",
  text,
  "",
  "_Automatisch durch GitHub Actions erzeugt. Dieser Demo-Workflow kommentiert nur und ändert keinen Code._",
].join("\n");

await writeFile(outputPath, `${comment}\n`, "utf8");
