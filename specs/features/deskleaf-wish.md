# Feature: Deskleaf Wish (Feedback-Rückkanal, Plugin-Client)

## Status
`draft`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Deskleaf-Nutzer möchte ich über einen Command "Deskleaf wish" direkt aus
Obsidian heraus Feedback, Feature-Wünsche oder Probleme einreichen und auf
Rückfragen dazu antworten können, damit ich dafür nicht auf GitHub wechseln
muss und trotzdem an einem strukturierten Klärungsprozess teilnehme.

## Scope-Hinweis

Dieses Repo (`deskleaf-for-obsidian`) liefert **ausschließlich den
Plugin-seitigen Client**. Der "Deskleaf-Communication-Service" (Speicherung
der Wishes, Rückfragen-Logik, Agent-Auswertung) ist ein separates, noch zu
bauendes Projekt in einem eigenen Repo — er wird hier **nicht** implementiert.
Diese Spec beschreibt das Plugin-Verhalten gegen einen angenommenen,
minimalen HTTP-Vertrag:

- `POST {serverUrl}/wishes` mit `{ title, description, outcome }` →
  `{ uuid }`
- `GET {serverUrl}/wishes/{uuid}` → `{ status, hasNewReply, replies: [...] }`
- `POST {serverUrl}/wishes/{uuid}/replies` mit `{ text }` → `2xx`

Dieser Vertrag wurde vom Autor als Ausgangsannahme bestätigt ("Deine
getroffenen Annahmen zur API passen erstmal"). Weicht der tatsächliche
Service später davon ab, ist das ein Fix-Forward am Client, keine
Spec-Änderung im Kern.

## Acceptance Criteria
- [ ] AC1: Der Command "Deskleaf wish" öffnet ein Modal mit genau drei
      Pflichtfeldern — **Titel**, **Beschreibung/Problem**,
      **Outcome/Lösung**. Der Absenden-Button ist deaktiviert, solange
      mindestens eines der drei Felder leer ist.
- [ ] AC2: Ist in den Plugin-Einstellungen keine Feedback-Server-URL
      hinterlegt, öffnet der Command kein Modal, sondern zeigt eine Notice,
      die auf die fehlende Einstellung hinweist.
- [ ] AC3: Beim Absenden sendet das Plugin `POST {serverUrl}/wishes` mit den
      drei Feldern. Bei Erfolg wird die zurückgegebene UUID zusammen mit
      Titel und Einreichungszeitpunkt lokal gecacht (übersteht einen
      Obsidian-Neustart) und das Modal schließt sich.
- [ ] AC4: Schlägt der Submit fehl (Netzwerkfehler oder Nicht-2xx-Antwort),
      bleibt das Modal mit den eingegebenen Werten geöffnet, zeigt eine
      Fehlermeldung, und es wird kein lokaler Cache-Eintrag angelegt.
- [ ] AC5: Die Kalenderansicht zeigt eine Pane-Header-Action (Icon-Button)
      neben dem bestehenden "Heute"-Button. Sobald für mindestens einen
      lokal gecachten Wish eine neue Rückfrage vorliegt, erscheint ein
      Badge auf diesem Icon. Die Anzahl offener Rückfragen wird nicht
      angezeigt — nur die Tatsache, dass mindestens eine vorliegt.
- [ ] AC6: Ein Klick auf diese Pane-Header-Action öffnet eine Übersicht aller
      lokal gecachten Wishes mit Titel und Status; Wishes mit neuer
      Rückfrage zeigen dort den Rückfragetext und ein Antwortfeld.
- [ ] AC7: Das Absenden einer Antwort aus der Übersicht sendet
      `POST {serverUrl}/wishes/{uuid}/replies`. Bei Erfolg verschwindet der
      Badge für diesen Wish, sofern keine weiteren offenen Rückfragen
      bestehen; bei Fehler bleibt die Rückfrage sichtbar und eine
      Fehlermeldung erscheint.
- [ ] AC8: Das Plugin fragt im Hintergrund periodisch (eigenständiges
      Intervall, Standard alle 5 Minuten, analog zum bestehenden
      CalDAV-Polling) für jeden gecachten Wish mit offenem Status per
      `GET {serverUrl}/wishes/{uuid}` nach Updates. Das Polling läuft
      unabhängig vom aktiven Kalender-Backend (CalDAV oder EventKit/Binary).
      Ein Fehler beim Abfragen eines einzelnen Wishes bricht das Polling der
      übrigen Wishes nicht ab.

## Acceptance Scenarios
```gherkin
Scenario: Wish ohne konfigurierte Server-URL
  Given keine Feedback-Server-URL ist in den Einstellungen gesetzt
  When der Nutzer den Command "Deskleaf wish" ausführt
  Then öffnet sich kein Modal
  And eine Notice weist auf die fehlende Einstellung hin

Scenario: Wish erfolgreich einreichen
  Given eine gültige Feedback-Server-URL ist konfiguriert
  When der Nutzer Titel, Beschreibung/Problem und Outcome/Lösung ausfüllt und absendet
  Then sendet das Plugin POST {serverUrl}/wishes mit den drei Feldern
  And bei einer 2xx-Antwort mit UUID wird der Wish lokal gecacht und das Modal schließt sich

Scenario: Submit schlägt fehl
  Given eine gültige Feedback-Server-URL ist konfiguriert
  When der Nutzer absendet und der Server nicht erreichbar ist
  Then bleibt das Modal mit den eingegebenen Werten geöffnet
  And eine Fehlermeldung wird angezeigt
  And es wird kein lokaler Cache-Eintrag angelegt

Scenario: Badge erscheint bei neuer Rückfrage
  Given ein gecachter Wish hat aktuell keine offene Rückfrage
  When das periodische Polling für diesen Wish hasNewReply: true liefert
  Then erscheint ein Badge auf der Pane-Header-Action in der Kalenderansicht

Scenario: Auf Rückfrage antworten löscht den Badge
  Given ein gecachter Wish zeigt eine offene Rückfrage und der Badge ist sichtbar
  When der Nutzer über die Wish-Übersicht eine Antwort absendet und der Server 2xx liefert
  Then verschwindet die Rückfrage aus der Übersicht
  And der Badge verschwindet, sofern kein anderer gecachter Wish eine offene Rückfrage hat

Scenario: Fehler bei einzelnem Wish blockiert restliches Polling nicht
  Given zwei Wishes sind lokal gecacht
  When das periodische Polling für Wish A einen Netzwerkfehler liefert
  Then wird Wish B trotzdem regulär abgefragt
  And der Fehler bei Wish A wird beim nächsten Intervall erneut versucht
```

## Out of Scope
- Der Deskleaf-Communication-Service selbst (Backend, Datenhaltung, Hosting,
  Agent-Auswertung der Wishes) — separates Repo/Vorhaben.
- Direkte GitHub-Integration/-Auth im Plugin (kein Erstellen von
  GitHub-Issues aus Deskleaf heraus).
- Betriebssystem-Benachrichtigungen/Toasts außerhalb der Kalenderansicht bei
  neuen Rückfragen — der Badge ist nur sichtbar, während die Kalenderansicht
  offen ist.
- Bearbeiten oder Löschen bereits eingereichter Wishes.
- Mehrere Feedback-Server-Profile / Multi-Tenant-Konfiguration.
- Rich-Text, Markdown-Rendering oder Anhänge in den drei Feldern
  (Freitext genügt).
- Eine sichtbare Wish-Liste im Sidebar-Panel — die Übersicht ist ausschließlich
  über die Pane-Header-Action der Kalenderansicht erreichbar.
- Retry-/Offline-Queueing für einen fehlgeschlagenen initialen Submit (AC4:
  der Nutzer sendet manuell erneut ab).
- Eine Installations-Identität über die einzelne Wish-UUID hinaus (kein
  Login, kein Gerätekonto).

## Open Questions
- Exakte Icon-Wahl und Positionierung der neuen Pane-Header-Action relativ
  zum "Heute"-Button liegt im UX Review.
- Polling-Intervall (Default 5 Min, analog CalDAV) kann im Design Review
  angepasst werden, falls Serverlast eine Rolle spielt.

## Affected Areas
- `src/main.ts` — neuer Command "Deskleaf wish"; Start/Stop des
  Polling-Timers in `onLayoutReady`/`onunload` (analog `icalFeedManager`).
- `src/types.ts` — `DeskleafSettings.feedback: { serverUrl: string }`
  (Default `""`); neuer Typ `WishRecord { uuid, title, status, submittedAt,
  hasNewReply, replies }`.
- neue Datei `src/wish-manager.ts` — HTTP-Client (POST/GET/Reply via
  Obsidian `requestUrl`), lokaler Cache in `data.json`, eigenständiger
  Polling-Timer (analog `caldav-reader.ts` / `ical-feed-manager.ts`).
- neue Datei `src/wish-modal.ts` — Compose-Modal mit den drei Feldern und
  Submit-Validierung.
- neue Datei `src/wish-overview-modal.ts` — Liste gecachter Wishes +
  Antwort-UI je Wish mit offener Rückfrage.
- `src/calendar-view.ts` — neue Pane-Header-Action (`addAction`, analog
  "Heute") mit Badge-Overlay, das an `wishManager`-Änderungen gebunden ist.
- `src/settings.ts` — neues Einstellungsfeld "Feedback-Server-URL".
- `styles.css` — Badge-Styling auf dem Header-Icon.

## Test Expectations
- `WishManager`-Kernlogik (Cache anlegen/aktualisieren, Statusübergänge,
  `hasNewReply`-Berechnung, Polling überspringt geschlossene Wishes,
  Fehler-Isolation bei Multi-Wish-Polling analog `ical-feed-manager.test.ts`)
  → automatisiert mit Vitest.
- HTTP-Client-Funktionen (POST/GET/Reply: URL-Zusammensetzung,
  Payload-Form, Fehlerbehandlung bei Nicht-2xx) → automatisiert mit Vitest
  gegen einen gemockten `requestUrl`.
- Modal-Validierung (Submit erst aktiv, wenn alle drei Felder gefüllt sind)
  → automatisiert mit Vitest, sofern die Validierungslogik als reine
  Funktion isoliert wird.
- Guard bei fehlender Server-URL (kein Modal, Notice-Pfad) →
  automatisiert mit Vitest auf der Guard-Funktion; der Notice-Text selbst
  manuell QA.
- Badge-Rendering, Icon-Platzierung neben "Heute", Übersichts-Modal-Layout
  → manuelle QA (visuell, DOM-Struktur nicht stabil genug für Snapshot-Tests).
- End-to-End-Fluss (Submit → lokaler Cache → Badge erscheint nach Polling →
  Antwort senden → Badge verschwindet) → manuelle QA gegen einen
  Mock-/Test-Server, da der reale Service außerhalb dieses Repos liegt und
  in CI nicht verfügbar ist.

---

## UX Review
_Pending_

---

## Design Review
_Pending_

---

## QA Report
_Pending_
