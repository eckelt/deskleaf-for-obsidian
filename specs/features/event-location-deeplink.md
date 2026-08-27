# Feature: Meeting-Notiz-Deeplink ins Location-Feld

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Related Issue
#67

## User Story
Als Nutzer moechte ich, dass beim Anlegen einer neuen Brain-Notiz fuer einen Termin ohne bestehenden Location-Eintrag automatisch ein Obsidian-Deeplink zu dieser Notiz ins Location-Feld des Kalendertermins geschrieben wird, damit Menueleisten-Apps wie meetingbar direkt zur Notiz statt zu einem Online-Meeting springen koennen.

## Acceptance Criteria
- [ ] AC1: Wird ueber `openEvent`/`openOrCreate` eine **neue** Notiz fuer einen Termin angelegt (`isNew === true`) und ist `event.location` zu diesem Zeitpunkt leer oder nur Whitespace, schreibt das Plugin danach automatisch einen Obsidian-Deeplink zur neu angelegten Notiz ins Location-Feld des Termins, ueber `calendarReader.updateEvent(event.id, {...})` — identisch fuer CalDAV- und EventKit-Binary-Backend.
- [ ] AC2: Der geschriebene Deeplink hat die Form `obsidian://open?vault=<Vaultname>&file=<Pfad>`, beide Teile korrekt URL-encoded (`encodeURIComponent`), und der `file`-Parameter nutzt den Vault-relativen Pfad ohne `.md`-Endung — identisch zu Obsidians eigenem "Copy Obsidian URL"-Befehl. Zu verifizieren per manueller QA gegen die echte Obsidian-Ausgabe fuer dieselbe Datei.
- [ ] AC3: Ist `event.location` bereits nicht-leer (Online-Meeting-Link, physische Adresse oder Freitext), wird nichts ueberschrieben — der bestehende Wert bleibt unangetastet, auch wenn dabei eine neue Notiz angelegt wird.
- [ ] AC4: Der automatische Update-Aufruf sendet den **vollstaendigen aktuellen Zustand** des Termins (Titel, Start, Ende, bestehende Beschreibung/`notes`, aktueller Kalender) zusammen mit dem neuen Location-Wert — analog zum bestehenden manuellen Editor-Commit in `calendar-view.ts`. Ein partielles Update, das `notes` oder `calendar` weglaesst, ist nicht zulaessig: Beim EventKit-Binary-Backend wuerde ein fehlendes `notes`-Feld die Beschreibung auf leer setzen (`update.notes ?? ""` in `calendar-reader.ts`), und beim CalDAV-Backend wuerde ein fehlendes `calendar`-Feld das Event ungewollt auf den ersten Kalender verschieben (`resolveCalendar` in `caldav-reader.ts`).
- [ ] AC5: Der Schreibvorgang setzt `span: "this"` bzw. laesst `span` implizit auf Einzelinstanz — es erscheint **kein** "Diese/Alle"-Dialog wie beim manuellen Editieren, auch nicht bei wiederkehrenden Terminen. Andere Instanzen der Serie bleiben unangetastet.
- [ ] AC6: Schlaegt der Location-Update-Schreibvorgang fehl (z. B. Netzwerkfehler), bleibt die Notiz trotzdem angelegt und geoeffnet; der Fehler erscheint nur als `Notice` (analog zum bestehenden Fehler-Handling im manuellen Editor) und blockiert oder revertiert die Notiz-Erstellung nicht.
- [ ] AC7: Bereits existierende Notizen (`isNew === false`) loesen kein nachtraegliches Verlinken aus, selbst wenn ihr Termin aktuell ein leeres Location-Feld hat — das Feature greift ausschliesslich im Moment der Notiz-Neuanlage.

## Acceptance Scenarios
```gherkin
Scenario: Neue Notiz fuer Termin ohne Online-Meeting verlinkt automatisch
  Given ein Kalendertermin "Finanzamt anrufen" hat ein leeres Location-Feld
  When der Nutzer ueber die Kalenderansicht eine neue Notiz fuer diesen Termin anlegt
  Then wird das Location-Feld des Termins auf den Obsidian-Deeplink zu genau dieser Notiz aktualisiert
  And Titel, Zeiten, Beschreibung und Kalender des Termins bleiben unveraendert
```

```gherkin
Scenario: Bestehendes Location-Feld bleibt unangetastet
  Given ein Kalendertermin hat bereits "Buero Raum 3" im Location-Feld
  When der Nutzer ueber die Kalenderansicht eine neue Notiz fuer diesen Termin anlegt
  Then bleibt das Location-Feld unveraendert "Buero Raum 3"
```

```gherkin
Scenario: Oeffnen einer bereits existierenden Notiz verlinkt nicht nachtraeglich
  Given eine Notiz fuer einen Termin mit leerem Location-Feld existiert bereits
  When der Nutzer diese Notiz ueber die Kalenderansicht erneut oeffnet
  Then bleibt das Location-Feld weiterhin leer
```

```gherkin
Scenario: Wiederkehrender Termin — nur die eine Instanz wird verlinkt
  Given ein wiederkehrender Termin ohne Online-Meeting hat ein leeres Location-Feld
  When der Nutzer fuer eine einzelne Instanz dieser Serie eine neue Notiz anlegt
  Then wird nur diese eine Instanz verlinkt, kein Dialog zu "Diese/Alle" erscheint
  And andere Instanzen der Serie bleiben mit leerem Location-Feld
```

```gherkin
Scenario: Location-Update schlaegt fehl
  Given ein Kalendertermin hat ein leeres Location-Feld
  When der Nutzer eine neue Notiz anlegt und der anschliessende updateEvent-Aufruf einen Fehler wirft
  Then bleibt die Notiz trotzdem angelegt und geoeffnet
  And eine Notice zeigt den Fehler an
```

## Out of Scope
- Rueckwirkendes Verlinken bereits existierender Notizen mit leerem Location-Feld (siehe AC7). Kann eine spaetere Iteration nachruesten.
- Erkennen/Unterscheiden "Online-Meeting vorhanden" per Plattform-Erkennung (`meetingPlatform`, Zoom/Teams/Meet-Substring-Suche). Trigger ist ausschliesslich "Location-Feld ist leer".
- Neue Einstellung/Toggle zum Ein-/Ausschalten dieses Verhaltens.
- Integration mit meetingbar oder anderen Drittanbieter-Apps selbst.

## Open Questions
_None_

## Affected Areas
- `src/calendar-view.ts`: `openEvent` erweitert den `openOrCreate`-Aufruf um den automatischen Location-Deeplink-Schreibvorgang, wenn `isNew` und `event.location` leer ist.
- `src/note-utils.ts` oder ein neues kleines Utility: reine Funktion zum Bau des Obsidian-Deeplinks aus Vaultname und Dateipfad (URL-Encoding, `.md`-Handling gemaess AC2).
- `src/types.ts`: keine neuen Typen erwartet, `EventUpdate` deckt `location` bereits ab.

## Test Expectations
- Automated: reine Deeplink-Bau-Funktion (Vaultname + Pfad → `obsidian://open?vault=...&file=...`) mit URL-Encoding-Sonderfaellen (Leerzeichen, Umlaute, Sonderzeichen im Dateinamen) in einem Vitest-Unit-Test.
- Automated: `openEvent`-Pfad ruft bei `isNew === true` und leerem `event.location` `calendarReader.updateEvent` mit vollstaendigem `EventUpdate` (Titel, Start, Ende, bestehende `notes`, bestehender `calendar`, neuer `location`-Deeplink) auf.
- Automated: `openEvent`-Pfad ruft `updateEvent` **nicht** auf, wenn `event.location` bereits nicht-leer ist, obwohl eine neue Notiz angelegt wird.
- Automated: `openEvent`-Pfad ruft `updateEvent` **nicht** auf, wenn `isNew === false`.
- Automated: ein `updateEvent`-Fehlerfall zeigt eine `Notice` und wirft nicht aus `openEvent` heraus (Notiz bleibt geoeffnet).
- Manual QA: In einem echten Vault einen Termin ohne Location anlegen, Notiz erzeugen, Location-Feld im Kalender (CalDAV und/oder EventKit) pruefen und den geschriebenen Link mit Obsidians "Copy Obsidian URL" fuer dieselbe Datei vergleichen (AC2, inkl. `.md`-Frage).
- `npm test`
- `npm run build`

---

## UX Review
Kein sichtbares UI-Element aendert sich — das Feature ist ein stiller Nebeneffekt der bestehenden Notiz-Neuanlage. Der einzige beobachtbare Effekt fuer den Nutzer ist der aktualisierte Location-Wert im Kalendertermin (in Deskleaf selbst nicht direkt editierbar sichtbar, aber ueber CalDAV/EventKit und Drittanbieter-Apps wie meetingbar sichtbar). Kein neuer Dialog, kein neuer Bestaetigungsschritt — das entspricht der Anforderung, dass die Notiz-Erstellung unveraendert bleibt.

Freigabe fuer `ux-reviewed`.

---

## Design Review
Keine neuen visuellen Elemente. Die einzige Design-relevante Entscheidung ist der exakte Deeplink-Formatstandard (AC2), der sich an Obsidians eigenem "Copy Obsidian URL"-Befehl orientiert, damit externe Tools den Link unveraendert konsumieren koennen. Die Implementierung muss den vollstaendigen Event-Zustand mitschreiben (AC4), um nicht versehentlich Beschreibung oder Kalenderzuordnung zu beschaedigen — das ist eine Korrektheitsanforderung, keine Design-Frage, aber kritisch genug, um hier zu verankern.

Freigabe fuer `design-reviewed`.

---

## QA Report
_Pending implementation._
