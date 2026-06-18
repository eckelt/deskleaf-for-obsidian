# Codex Issue Demo

This workflow demonstrates an off-machine model call triggered by GitHub issues.

## Trigger

Add the `codex-demo` label to an issue. The workflow also runs when a labeled issue is opened, edited, or reopened.

## Required Configuration

Repository secret:

```text
OPENAI_API_KEY
```

Optional repository variable:

```text
CODEX_DEMO_MODEL
```

If `CODEX_DEMO_MODEL` is not set, the workflow uses `gpt-5.5`.

## Behavior

- Reads the GitHub issue title, body, author, labels, and repository name.
- Sends that context to the OpenAI Responses API.
- Creates or updates one issue comment marked with `<!-- codex-demo-response -->`.
- Does not modify repository files.
- Does not create branches or pull requests.

This is intentionally a read-only demo for repository contents. A later workflow can build on the same trigger pattern to create branches and pull requests.

## Production Agent Path

The feature-planning workflow uses the official `openai/codex-action@v1` action and repository prompt files instead of this raw Responses API demo. Keep this demo small; evolve the production workflows separately.
