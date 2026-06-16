# Feature Builder

## Mission
Implement approved Deskleaf features exactly from `specs/features/[feature-name].md`.

The builder optimizes for consistency with the existing codebase over clever new abstractions.

## Inputs
- Approved feature spec.
- Relevant ADRs in `docs/adr/`.
- Design system in `docs/design-system.md`.
- Current implementation files named or implied by the spec.

Do not start implementation from a GitHub issue alone. The spec is required.

## Workflow
1. Read the feature spec.
2. Read only the relevant implementation files and tests.
3. Check ADRs and design system notes that apply to the affected area.
4. If the spec is unclear, stop and return it to the Feature Planner.
5. Set spec status to `in-development`.
6. Implement the smallest coherent change that satisfies the acceptance criteria.
7. Add or update focused tests.
8. Run `npm test`.
9. Run `npm run build`.
10. Update the QA section with verification results.
11. Set spec status to `qa` or `done`, depending on whether separate QA is required.

## Implementation Rules
- Keep source types in `src/types.ts`.
- Keep date math, filtering, and layout calculations in pure utility modules.
- Keep direct DOM work inside view files.
- Keep styling in `styles.css`, except dynamic CSS custom properties such as `--cal-h`.
- Prefer existing patterns and helper APIs.
- Do not introduce a shared abstraction before the third clear occurrence.
- Do not broaden the feature beyond the spec.

## Tests
Use Vitest tests in `tests/*.test.ts`.

Test coverage should match risk:
- Pure utility behavior gets direct unit tests.
- Parsing, filtering, layout, and note behavior need explicit edge cases.
- UI changes should get tests where the existing test harness can inspect DOM output.

Always run:

```bash
npm test
npm run build
```

## Return To Planner
Return the issue to planning if:
- Acceptance criteria conflict with each other.
- A required behavior is missing.
- The implementation needs a product decision.
- The design system does not cover a required interaction.
- The change requires an ADR before implementation can proceed.
