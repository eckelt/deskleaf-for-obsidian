# Feature: Early Access Releases

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/25

## User Story
Als Plugin-Autor moechte ich interessierten Testern eine GitHub-Release-Zip-Datei schicken koennen, die Deskleaf inklusive EventKit-Binary enthaelt, damit sie das Plugin lokal in Obsidian installieren koennen, ohne das Repository selbst bauen zu muessen.

## Acceptance Criteria
- [ ] AC1: Jeder erfolgreiche Release-Lauf fuer `main` veroeffentlicht ein GitHub-Release-Artefakt `deskleaf-for-obsidian.zip`.
- [ ] AC2: Die Zip-Datei enthaelt alle Dateien, die Obsidian fuer eine lokale Plugin-Installation braucht: `main.js`, `styles.css`, `manifest.json` und `deskleaf-calendar-sync`.
- [ ] AC3: `deskleaf-calendar-sync` in der Zip-Datei ist ein aus dem Swift-Projekt gebautes, ausfuehrbares macOS-Release-Binary und nicht ein Platzhalter oder Quelltextartefakt.
- [ ] AC4: Die Zip-Datei enthaelt ein Installationsskript `install.sh`, das unter macOS ein Zielverzeichnis fuer ein Obsidian-Vault-Plugin ermittelt oder interaktiv abfragt und die Plugin-Dateien dorthin kopiert.
- [ ] AC5: Das Installationsskript installiert in einen Plugin-Ordner mit der Manifest-ID aus `manifest.json`; es darf keine hart codierten privaten Vault-Pfade enthalten.
- [ ] AC6: Das Installationsskript bricht mit einer klaren Fehlermeldung ab, wenn keine Obsidian-Vault-Struktur gefunden wird oder der Nutzer kein Zielverzeichnis angibt.
- [ ] AC7: Nach dem Entpacken oder nach erfolgreichem `install.sh` liegt die Binary im selben Plugin-Verzeichnis wie `main.js`, sodass Deskleafs bestehende Default-Binary-Path-Logik sie ohne manuelle Einstellung findet.

## Acceptance Scenarios
```gherkin
Scenario: Release zip contains a complete local plugin bundle
  Given the release workflow has completed successfully for a commit on main
  When a tester downloads and inspects `deskleaf-for-obsidian.zip`
  Then the zip contains `main.js`, `styles.css`, `manifest.json`, `deskleaf-calendar-sync` and `install.sh`
  And `deskleaf-calendar-sync` is marked executable after extraction on macOS
```

```gherkin
Scenario: Installer copies the bundle into a selected vault plugin directory
  Given a tester has extracted `deskleaf-for-obsidian.zip` on macOS
  And the tester provides an Obsidian vault path when prompted
  When the tester runs `./install.sh`
  Then the script creates or updates `.obsidian/plugins/<manifest id>/` inside that vault
  And it copies `main.js`, `styles.css`, `manifest.json` and `deskleaf-calendar-sync` into that directory
  And the copied `deskleaf-calendar-sync` remains executable
```

```gherkin
Scenario: Installer fails clearly when no destination is available
  Given a tester runs `./install.sh`
  And the script cannot infer an Obsidian vault path
  And the tester does not provide a valid path
  When the script exits
  Then no files are copied
  And the terminal output explains that an Obsidian vault directory is required
```

```gherkin
Scenario: Installed bundle matches Deskleaf's default EventKit lookup
  Given the plugin bundle has been installed into `.obsidian/plugins/<manifest id>/`
  When Deskleaf loads without CalDAV credentials configured
  Then the existing default binary path resolves to `<vault>/.obsidian/plugins/<manifest id>/deskleaf-calendar-sync`
  And the EventKit backend can be started without setting a custom binary path
```

## Out of Scope
- Notarization, signing identities or Apple distribution outside ad-hoc/local execution.
- Automatic Obsidian plugin enablement after copying files.
- Windows or Linux EventKit support.
- Mobile installation support for the EventKit binary.
- Publishing to the official Obsidian community plugin registry.

## Open Questions
_None_

## Design Decisions
- The early-access package is a GitHub Release artifact, not a separate distribution channel.
- The zip root should be directly copyable into an Obsidian plugin directory; nested wrapper folders should be avoided unless the installer explicitly handles them.
- The installer is a convenience path for macOS testers. Manual installation by copying the same bundled files remains valid.
- The plugin directory name must come from `manifest.json` (`id`) so package and installer behavior stay aligned if the manifest changes.

## Affected Areas
- `.github/workflows/release.yml`: Ensure the release job builds/downloads the Swift binary and publishes the complete zip.
- `scripts/` or repository root: Add a small `install.sh` suitable for inclusion in the zip.
- `swift/build.sh` or release workflow Swift steps: Preserve executable permissions and release-mode binary output.
- `manifest.json`: Source of truth for plugin folder ID used by the installer.

## Test Expectations
- Automated CI or script-level tests must verify that the produced zip contains the required files from AC2 and AC4.
- Automated tests or shell checks must verify that `install.sh` derives the plugin folder name from `manifest.json` instead of a hard-coded private path.
- Automated tests or shell checks must cover the installer success path using a temporary fake vault containing `.obsidian/`.
- Automated tests or shell checks must cover the installer failure path for a missing or invalid vault path.
- Manual QA is required for one real macOS Obsidian vault: download or locally produce the zip, extract it, run `install.sh`, enable/reload the plugin in Obsidian, and confirm that the EventKit backend works without a custom binary path.

---

## UX Review

### Ergebnis

Freigabe fuer `ux-reviewed`.

### Bewertung

Der Testerfluss muss ohne Entwicklerwissen funktionieren: Zip laden, entpacken, optional Skript ausfuehren, Plugin in Obsidian aktivieren. Ein Installationsskript ist sinnvoll, darf aber nicht verdecken, was passiert; klare Terminalmeldungen und ein explizites Zielverzeichnis sind wichtiger als stille Magie.

---

## Design Review

### Ergebnis

Freigabe fuer `design-reviewed` und `approved`.

### Technische Richtung

Die vorhandene Release-Architektur passt zur Anforderung: TypeScript-Bundle auf Ubuntu, Swift-Binary auf macOS, danach ein gemeinsames Release-Artefakt. Der Builder soll diese Richtung stabilisieren und die Zip-Datei als testbares Artefakt behandeln.

Das Installationsskript soll klein und robust bleiben: Bash mit `set -euo pipefail`, korrekt gequotete Pfade, Manifest-ID per Node oder einem einfachen JSON-Parser aus `manifest.json`, temporar testbar ohne echten Vault. Private lokale Pfade aus `deploy.sh` oder `swift/build.sh` duerfen nicht in den Early-Access-Installer uebernommen werden.

---

## QA Report
_Pending_
