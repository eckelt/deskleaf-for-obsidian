# Deskleaf Agent Workflow

## Purpose
This workflow keeps GitHub usable as the main interface while preserving feature specs as versioned project artifacts.

- GitHub issues are the inbox, discussion thread, and status surface.
- `specs/features/[feature-name].md` is the source of truth for implementation.
- Agents must update the spec when decisions change and mirror important status changes back to the issue.

## Roles

### Feature Planner
The Feature Planner turns a rough GitHub issue into an implementable feature spec.

Responsibilities:
- Review the issue against current code, existing feature specs, ADRs, and the design system.
- Challenge unclear requirements before implementation starts.
- Create or update `specs/features/[feature-name].md`.
- Keep acceptance criteria observable and testable.
- Mark the spec as `approved` only when the feature can be implemented without guessing.

The Feature Planner does not implement production code.

### Feature Builder
The Feature Builder implements approved specs.

Responsibilities:
- Work only from specs with status `approved`.
- Follow existing module boundaries, ADRs, and the design system.
- Keep implementation scope inside the spec.
- Add focused tests proportional to the risk and affected behavior.
- Run `npm test` and `npm run build` before handing off.
- Update the spec with implementation notes and QA results.

The Feature Builder does not invent missing requirements. If the spec is unclear, it returns the issue to planning.

## Status Flow

Feature specs use this status progression:

```text
draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done
```

Status meanings:

- `draft`: Initial idea, incomplete or still being discussed.
- `ux-reviewed`: User flow, edge cases, and acceptance criteria have been challenged.
- `design-reviewed`: Visual and interaction details are consistent with the design system.
- `approved`: Ready for implementation.
- `in-development`: Builder is actively implementing the spec.
- `qa`: Implementation is ready for verification against the acceptance criteria.
- `done`: Accepted, tested, and shipped or ready to ship.

## GitHub Labels

Use labels as a lightweight operational layer:

```text
type:feature
status:draft
status:planning
status:needs-human
status:ready-for-build
status:in-build
status:qa
status:done
area:calendar
area:sidebar
area:caldav
area:eventkit
area:settings
area:notes
risk:low
risk:medium
risk:high
```

The spec status is authoritative. GitHub labels should reflect it but do not replace it.

## Handoff Rules

Planner to Builder:
- Spec status is `approved`.
- All open questions are answered or explicitly moved to out of scope.
- Acceptance criteria are concrete enough for QA.
- Affected areas and expected tests are documented.

Builder back to Planner:
- The implementation requires behavior that is not specified.
- Acceptance criteria conflict with existing architecture or design system.
- A hidden dependency or edge case changes the feature shape.

Builder to QA:
- Spec status is `qa`.
- Code is implemented.
- Relevant tests pass.
- `npm run build` passes.
- The QA section explains how each acceptance criterion was verified.

## Release Loop

After QA passes:
- Update the spec status to `done`.
- Close or update the GitHub issue.
- Build and deploy the plugin with `bash deploy.sh` when a local Obsidian update is desired.
