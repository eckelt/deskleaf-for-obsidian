# Feature: Brain-Vault-Struktur (Kunden · Termine · Personen · Projekte)

## Status
`in-development`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nils möchte ich, dass Deskleaf-for-Obsidian dieselbe Vault-Struktur schreibt
und liest wie der Deskleaf-MCP (`eckelt/deskleaf-for-ai` gegen `eckelt/brain`),
damit Kalender und Seitenleiste Teil derselben Arbeitsweise sind: der Agent
bereitet einen Termin vor und ich arbeite im Plugin an *derselben* Notiz weiter —
statt an einem zweiten, parallelen Ordnungssystem.

## Kontext: die beiden Strukturen

**Brain-Vault (MCP-Seite, `eckelt/brain`)** — Anker ist der **Kunde**:

| Ordner | `type:` | Identität |
|---|---|---|
| `customers/` | `kunde` | `tags: [kunde/<slug>]`, `domains: [acme.de]` |
| `meetings/` | `termin` | `calendar_event_id` (CalDAV-href) + `calendar_uid` + `date` |
| `people/` | `person` | `email` / `emails:`, `kunde: "[[…]]"` |
| `projects/` | `project` | — |
| `calendar/agenda.md` | `agenda` | read-only Sync-Spiegel, **kein** Ablageordner |

Todos leben dezentral in den Notizen (`- [ ] … due:: yyyy-mm-dd`), werden zentral
über Dataview beim Kunden gesehen und vom MCP über `list_open_todos` /
`complete_todo` (`- [x] … ✅ yyyy-mm-dd`) bearbeitet.

**Plugin-Seite (vorher)** — Anker war ein eigenes „Topic":
`notes/<Titel>.md` mit `event-id`, `type: meeting|interview|recurring|task|focus`,
`topics: []`; Seitenleiste listete `#topic`-Notizen aus `topics/`.

Beides beschreibt dieselben Termine, aber keine Notiz war für beide Seiten
lesbar: der MCP findet eine Termin-Notiz ausschließlich über
`calendar_event_id`/`calendar_uid` + `type: termin`.

## Acceptance Criteria

### A — Termin-Notizen im Brain-Format
- [x] AC1: Eine neu angelegte Termin-Notiz landet in `meetings/` (Default,
      konfigurierbar) und trägt `type: termin`, `title`, `date`,
      `calendar_uid` sowie — sofern das Backend eine Event-URL kennt (CalDAV) —
      `calendar_event_id`. Bei wiederkehrenden Instanzen zusätzlich
      `calendar_recurrence_id`.
- [x] AC2: Der Dateiname folgt der Vault-Konvention `YYYY-MM-DD <Titel>.md`;
      Kollisionen mit einer *fremden* Notiz gleichen Namens werden durch einen
      numerischen Suffix aufgelöst, nie durch Überschreiben.
- [x] AC3: Erkennt das Plugin einen Kunden zum Termin, schreibt es
      `kunde: "[[Acme]]"` und `tags: [kunde/acme]` ins Frontmatter — genau die
      beiden Felder, auf die die Dataview-Blöcke der Kundennotiz filtern
      (`Termin-Historie` auf `kunde`, `Offene Todos` auf den Tag).
- [x] AC4: Kunden-Erkennung läuft über die E-Mail-Domain der Teilnehmer gegen
      `domains:` der Kundennotizen; schlägt das fehl, über einen Präfix-Match
      des Termin-Titels auf den Kundennamen (`"Nordwind – Workshop"` → `Nordwind`).
      Wird kein Kunde erkannt, bleibt das Frontmatter ohne `kunde`/`tags`.
- [x] AC5: Teilnehmer werden zu `people/`-Notizen aufgelöst (über
      `email:`/`emails:` im Frontmatter, sonst über den Basenamen) und als
      Wikilinks in `teilnehmer:` und unter `## Related notes` abgelegt.
- [x] AC6: Die Notiz enthält die Sektionen, die beide Seiten erwarten:
      `## Initial context` (Kalender-Beschreibung), die Arbeits-Sektionen
      `## Mitgebracht` / `## Notizen` / `## Todos bis nächstes Mal` /
      `## Fürs nächste Treffen` aus `_templates/termin.md`, sowie `## Sources`
      und `## Related notes`. `append_meeting_note` des MCP hängt sein
      `## MCP notes` hinten an, ohne etwas davon zu stören.
- [x] AC7: Die Notiz zu einem Event wird über `calendar_event_id`, sonst über
      `calendar_uid` + `date` gefunden — dieselbe Auflösungsregel wie
      `findMeetingNoteForEvent` im MCP. Notizen im alten Format (`event-id`)
      werden weiterhin gefunden, damit Bestandsnotizen nicht verwaisen.

### B — Seitenleiste auf Kunden und Projekte
- [x] AC8: Die Sektion „Topics" ist ersetzt durch zwei Sektionen: **Kunden**
      (`customers/`, `type: kunde`) und **Projekte** (`projects/`,
      `type: project`). Beide bleiben ein-/ausblendbar, in der Höhe
      veränderbar und per Drag & Drop sortierbar wie zuvor.
- [x] AC9: Eine Kundenzeile zeigt als Chips die kommenden Termine dieses
      Kunden (aus dem Kalender, über dieselbe Kunden-Erkennung wie AC4), eine
      Projektzeile die Anzahl offener Todos.
- [x] AC10: Über die „Neu"-Zeile angelegte Kunden- und Projektnotizen tragen
      das Brain-Format: der Kunde die sechs Standard-Sektionen samt ihrer
      Dataview-Blöcke (identisch zu `renderCustomerNote` im MCP), das Projekt
      `type: project` mit `Initial context` / `Sources` / `Related notes`.
- [x] AC11: Ein inaktiver Kunde (`status: pausiert`/`beendet`) wird optisch
      abgesetzt und hinter den aktiven einsortiert.

### C — Todos kompatibel zum MCP
- [x] AC12: Die Fälligkeit eines Todos wird pro Zeile aus `due:: yyyy-mm-dd`
      (kanonisch), `📅 yyyy-mm-dd` oder einem `[[yyyy-mm-dd]]` gelesen; erst
      wenn die Zeile keine trägt, gilt das `date`/`datum` der Notiz.
- [x] AC13: Die Fälligkeits-Marker werden aus dem angezeigten Text entfernt
      (wie `cleanTodoText` im MCP); das Datum erscheint im Chip.
- [x] AC14: Abhaken schreibt `- [x] … ✅ yyyy-mm-dd`; ein bereits vorhandenes
      Datum wird nicht verdoppelt. Das Häkchen zu entfernen entfernt auch das
      `✅`-Datum wieder.
- [x] AC15: Gesammelt wird aus `meetings/`, `projects/`, `customers/` und den
      Notizen im Vault-Root (Default, konfigurierbar) — dieselbe Quellmenge
      wie `list_open_todos`. Kanban-Boards bleiben ausgeschlossen.

## Out of Scope
- Tagesrituale `prepare_day` / `close_day` im Plugin — die liegen im MCP
  (wayfinder-Task 05) und würden sich hier doppeln.
- Zeiterfassung (`time/entries/`, `billing/rates.md`) aus dem Kalender heraus —
  die Rate-Logik gehört nicht ins Plugin dupliziert.
- Research (`research/sources/`, `research/thema/`) — eigener Schnitt.
- Schreiben nach `calendar/agenda.md` — read-only Sync-Spiegel, gehört dem
  `tools/calendar-sync`-Job.
- Kontakt-Sync (CardDAV, `contact_uid`) — bleibt beim MCP.
- Migration bestehender `notes/`-Notizen ins neue Format — Bestandsnotizen
  werden weiter *gefunden* (AC7), aber nicht automatisch umgeschrieben.

## Affected Areas
- `src/types.ts` — `vault`-Settings (Ordner + Todo-Quellen), `NoteType` um
  `termin` erweitert, neue Typen `CustomerNote` / `PersonNote` / `ProjectNote`.
- neue Datei `src/brain-vault.ts` — reine Funktionen: Slug, Frontmatter-Rendering,
  Kunden-Match über Domain/Titel, Dateinamen, Notiz-Templates (Kunde/Projekt/Termin).
- neue Datei `src/todo-parser.ts` — reine Funktionen: `due::`-Erkennung,
  Text-Bereinigung, Gruppierung, Abhak-Zeilentransformation.
- `src/note-manager.ts` — schreibt/findet Termin-Notizen im Brain-Format.
- `src/sidebar-view.ts` — Kunden- und Projekt-Sektion statt Topics; Todos über
  `todo-parser`.
- `src/caldav-reader.ts` / `src/calendar-reader.ts` — `getEventUrl(id)` für
  `calendar_event_id`.
- `src/settings.ts` — Ordner-Einstellungen.
- `styles.css` — Zeilen-Styles für Kunden/Projekte, inaktive Kunden.

## Test Expectations
- `brain-vault.ts` (Slug, Domain-Match, Titel-Match, Dateiname, alle drei
  Templates) → Vitest, rein.
- `todo-parser.ts` (alle drei Due-Syntaxen, Vorrang Zeile vor Frontmatter,
  Text-Bereinigung, Gruppierung, Abhaken mit/ohne bestehendes ✅) → Vitest, rein.
- `note-manager.ts` (Frontmatter-Felder, Auflösung über `calendar_event_id` bzw.
  `calendar_uid`+`date`, Rückwärtskompatibilität `event-id`) → Vitest gegen die
  bestehenden App-Stubs.
- Seitenleisten-Rendering, Drag & Drop, Chips → manuelle QA.

---

## UX Review
_Übernommen aus der Nutzer-Entscheidung: Kunden + Projekte **ersetzen** Topics
(kein zweites Ordnungssystem daneben). Der Kunde ist der Anker des Vaults; die
Seitenleiste bildet das ab, statt eine parallele Hierarchie zu pflegen._

---

## Design Review
_Bestehendes Sektions-Framework der Seitenleiste (Reihenfolge, Sichtbarkeit,
Höhen in `localStorage`) wird wiederverwendet; Kunden- und Projektzeilen erben
die Topic-Zeilen-Styles. Keine neuen Farben — inaktive Kunden über
`--f-muted` + reduzierte Deckkraft._

---

## QA Report

**Automatisiert (Vitest, 361 Tests grün):**
- `brain-vault.test.ts` — 43 Tests: Slug (inkl. Umlaute), Domain- und Titel-Match
  (inkl. der Nicht-Treffer „Rethinking Nordwind"), Personen-Auflösung, Dateinamen,
  Frontmatter-Rendering, alle drei Notiz-Templates, Verhalten bei
  handgeschriebenem Template.
- `todo-parser.test.ts` — 27 Tests: alle drei Due-Syntaxen, Vorrang Zeile vor
  Frontmatter, Text-Bereinigung, Abhaken/Wieder-Öffnen inkl. Round-Trip.
- `note-manager.test.ts` — 24 Tests: Vault-Index, Notiz-Erzeugung im
  Brain-Format, alle vier Auflösungspfade, Date-vs-String-Frontmatter,
  Entity-Notizen, `syncEventNote` auf Brain-Notizen.

**Beim Bauen gefunden und behoben:**
- `cleanTodoText` verschweißte Wörter, wenn ein `due::` mitten in der Zeile stand
  (`"Mail due:: … rausschicken"` → `"Mailrausschicken"`). Die Muster fressen den
  Whitespace auf beiden Seiten; jetzt wird durch ein Leerzeichen ersetzt. Der
  MCP hat denselben Defekt — dort fällt er nicht auf, weil die kanonische
  Position am Zeilenende liegt.
- Ein eigenes `termin.md`-Template (etwa das `_templates/termin.md` des Vaults)
  hätte `## Initial context` / `## Sources` / `## Related notes` verloren und
  `{{kunde_link}}` stehen lassen. Fehlende Pflichtsektionen werden jetzt
  angehängt, die Platzhalter des Vault-Templates werden aufgelöst.
- Ein unquotiertes `date: 2026-08-21` kann von Obsidian als `Date` statt als
  String zurückkommen — die uid+date-Auflösung hätte still danebengegriffen.
  Wird jetzt toleriert.

**Offen (manuelle QA im Vault):**
- Seitenleisten-Rendering: Kunden-Chips, Projekt-Zähler, inaktive Kunden,
  Drag & Drop, Sektions-Reihenfolge nach dem Layout-Key-Wechsel.
- Ende-zu-Ende: Termin im Kalender anlegen → Notiz öffnen → `prepare_meeting`
  bzw. `append_meeting_note` des MCP auf dieselbe Notiz laufen lassen.
