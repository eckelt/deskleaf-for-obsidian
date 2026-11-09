# Schnittstellen und Telemetrie vollständig

Teil eines Changes über alle fünf Deskleaf-Repos. Warum, Fragen an den Inhaber und Umsetzung: Proposal in
`eckelt/deskleaf-factory`, `openspec/changes/schnittstellen-vollstaendig/proposal.md`.

## Was in diesem Repo

Das Plugin bekommt contractRefs für die genutzten externen Dienste: `obsidian-api` → `external.obsidian.api.v1` (v4 `obsidian-api:api@1`), `ical-feeds` → `external.ical.feeds.v1` (`ical-feeds:feeds@1`), `vault-files` → `external.vault.files.v1` (`vault-files:files@1`).

Reiner Architektur-Change: Bei der Umsetzung zieht das Gewerk nur den `declared`-Teil von
`.deskleaf/architecture.json` nach; kein Code, keine Spec-Deltas. Das Soll steht als v4 in
`openspec/changes/schnittstellen-vollstaendig/twin.json`. Umsetzung erst nach dem Change `x4-pro-an-der-bridge`.
