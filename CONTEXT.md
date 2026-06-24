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

**Business Hours**:
The user-configured recurring time window in the calendar grid that represents the normal working period. Deskleaf treats Business Hours as global plugin settings, not as calendar-provider data.
_Avoid_: Office hours, availability

**Non-Business Hours**:
All calendar-grid time outside the configured Business Hours. Non-Business Hours are the baseline grid state; Business Hours may be visually highlighted against them.
_Avoid_: Free time, off hours

**Calendar Time Grid**:
The 24-hour visual grid in the Deskleaf calendar view where timed events, hour lines, the now line, and background time-state cues are rendered.
_Avoid_: Timeline, calendar canvas

**Event Location**:
A free-text event field that identifies where or how an event takes place. It may contain a physical address, a room name, or a video-call link.
_Avoid_: Venue-only field, meeting room

**Event Note**:
A Markdown note linked to a calendar event through Deskleaf frontmatter such as `event-id`. Event Notes hold agenda, notes, todos, and follow-up context for a concrete calendar event.
_Avoid_: Appointment note, meeting file

**Calendar Series**:
A set of related recurring calendar events that share the same recurrence pattern or user-facing event title. Deskleaf treats series behavior carefully because changing one instance and changing the series have different consequences.
_Avoid_: CalSeries, repeating blob

**Focus Block**:
An existing calendar event reserved for focused work or deep work. Deskleaf identifies it primarily through Event Note frontmatter `type: focus`, with title-pattern and explicit user selection fallbacks.
_Avoid_: Blocker, focus appointment

**Todo Assignment**:
A user-approved link between an existing source todo and a Focus Block. The source todo remains authoritative; the assignment gives the Focus Block a way to show and toggle that task without creating an independent duplicate.
_Avoid_: Todo copy, task clone
