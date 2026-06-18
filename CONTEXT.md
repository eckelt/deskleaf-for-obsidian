# Deskleaf Agent Factory

Deskleaf uses GitHub issues, feature specs, and role-specific agents to evolve the Obsidian plugin consistently over time.

## Language

**Agent Factory**:
The coordinated workflow of role-specific agents that plan, build, and verify Deskleaf features through GitHub issues and versioned project documents.
_Avoid_: Bot swarm, automation magic

**Feature Issue**:
A GitHub issue created by the human owner to start discussion about a requested Deskleaf feature.
_Avoid_: Ticket, task

**Feature Spec**:
A versioned Markdown document in `specs/features/` that captures the implementation-ready shape of a feature.
_Avoid_: Issue body, requirements dump

**Feature Planner**:
The agent role that challenges a feature issue, clarifies ambiguity with the human owner, and updates the feature spec until it is ready for implementation.
_Avoid_: Product manager, analyst

**Feature Builder**:
The agent role that implements an approved feature spec using the existing architecture, ADRs, design system, and tests.
_Avoid_: Developer bot, implementer

**Handoff**:
The explicit transition from one agent role to another after the current role's stop conditions are satisfied.
_Avoid_: Assignment, takeover
