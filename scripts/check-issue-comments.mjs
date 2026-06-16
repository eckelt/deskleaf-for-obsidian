#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const issue = process.argv[2];
if (!issue) {
  console.error("Usage: node scripts/check-issue-comments.mjs <issue-number>");
  process.exit(2);
}

const raw = execFileSync("gh", [
  "issue",
  "view",
  issue,
  "--comments",
  "--json",
  "comments",
], { encoding: "utf8" });

const { comments } = JSON.parse(raw);
const isAgentComment = (comment) =>
  /^(Feature Planner|Planner|Design Review|Feature Builder|QA feedback|CalDAV calendar move error fixed|QA feedback addressed|Comment check)/i
    .test(comment.body.trim());

const lastAgentIndex = comments.findLastIndex(isAgentComment);

const unchecked = comments
  .slice(lastAgentIndex + 1)
  .filter((comment) => !isAgentComment(comment));

if (unchecked.length === 0) {
  console.log(`Issue #${issue}: no unchecked human comments.`);
  process.exit(0);
}

console.log(`Issue #${issue}: ${unchecked.length} unchecked human comment(s):`);
for (const comment of unchecked) {
  const firstLine = comment.body.trim().split(/\r?\n/)[0];
  console.log(`- ${comment.createdAt} ${comment.author.login}: ${firstLine}`);
  console.log(`  ${comment.url}`);
}
process.exit(1);
