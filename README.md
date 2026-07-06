# Deskleaf for Obsidian

Mit Deskleaf bereite ich mich auf Termine vor, halte daraus entstandene Aufgaben nach und behalte Kontinuität in Terminserien.

## Installation

Deskleaf is not listed in the Obsidian Community Plugin directory yet.

Install the latest build manually:

1. Open the latest GitHub release.
2. Download `deskleaf-for-obsidian.zip`.
3. Extract it into your vault plugin folder:

```text
<vault>/.obsidian/plugins/deskleaf-for-obsidian/
```

The folder must contain:

```text
main.js
styles.css
manifest.json
deskleaf-calendar-sync
```

Then restart Obsidian or reload plugins and enable `Deskleaf for Obsidian` in the Community Plugins settings.

On macOS, the bundled `deskleaf-calendar-sync` binary reads EventKit calendars. If CalDAV credentials are configured in the plugin settings, Deskleaf uses CalDAV instead.

## Local Development

```bash
npm ci
npm test
npm run build
```

Factory review automation:

```bash
npm run factory:metrics
npm run factory:review
npm run factory:review:daily
```

`factory:review` is the manual entry point; `factory:review:daily` is the
scheduler entry point. Both are guarded: if no PR was merged since the last
audit, the command updates the local audit timestamp and exits without invoking
the reviewer agent.

Deploy the current local build into the configured Obsidian vault:

```bash
bash deploy.sh
```

## Feature Workflow

GitHub issues are the inbox and discussion surface. Feature specs in `specs/features/[feature-name].md` are the source of truth for implementation.

For local agent work:

```text
Act as docs/agents/feature-planner.md.
Use GitHub issue #<number> as input.
Create or update the matching spec in specs/features/.
Do not implement.
```

After the spec is approved:

```text
Act as docs/agents/feature-builder.md.
Implement specs/features/<feature-name>.md.
Run npm test and npm run build.
```

For QA:

```text
Act as docs/agents/qa-agent.md.
Use GitHub issue #<number> and specs/features/<feature-name>.md as input.
Check latest comments, run automated checks, and perform manual Obsidian QA.
```

See `AGENTS.md` and `docs/agent-workflow.md` for the full agent workflow.
