# Feature: Versionsnummer + Release-Datum im Settings-Tab

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->
<!-- ux-reviewed and design-reviewed were skipped for this spec: approved directly by the author, same as tasks-plugin-status-support.md. -->

## Source
- GitHub issue: #64

## User Story
Als Nutzer möchte ich am unteren Ende des Deskleaf-Settings-Tabs die aktuell
installierte Plugin-Version mit Release-Datum sehen, klein und blass, rein
informativ, damit ich beim Support/Debugging oder bei einem Update-Vergleich
sofort weiß, welchen Build ich installiert habe.

## Acceptance Criteria
- AC1: Am Ende von `display()` in `src/settings.ts` (nach dem „Erweitert"-Abschnitt,
  letztes Element im Tab) erscheint eine einzeilige Fußzeile mit Versionsnummer,
  z. B. „Version 1.2.109".
- AC2: Ist zusätzlich zur Version ein Release-Datum bekannt, wird es an die
  Versionsnummer angehängt, getrennt durch ` · `, im Format `TT.MM.JJJJ`
  (z. B. „Version 1.2.109 · 25.08.2026").
- AC3: Ist kein Release-Datum bekannt (z. B. lokaler Dev-Build über
  `bash deploy.sh`, der nicht durch die Release-Pipeline gelaufen ist), zeigt
  die Fußzeile nur die Versionsnummer ohne Datum und ohne Trennzeichen —
  kein Platzhaltertext wie „unbekannt".
- AC4: Die Fußzeile ist rein informativ: kein Link, kein Button, kein Klick-Handler,
  keine neue Einstellung/kein Toggle zum Ein-/Ausblenden.
- AC5: Optik folgt der bestehenden „muted"-Sprache des Design-Systems (siehe
  `--f-muted` / `var(--text-muted)` in `styles.css`, wie z. B. bereits bei
  `.setting-item-description` genutzt): kleine Schriftgröße, gedämpfte Textfarbe,
  kein Fokuspunkt. Kein neuer Farbwert wird erfunden.
- AC6: Jeder automatische Build, der über `.github/workflows/release.yml`
  (Merge nach `main`) läuft, stampt zusätzlich zur Versionsnummer ein
  Release-Datum, das der laufende Plugin-Code zur Laufzeit lesen kann, ohne
  dass der Nutzer manuell etwas tun muss.

## Acceptance Scenarios
```gherkin
Scenario: Release-Build zeigt Version und Datum
  Given das Plugin wurde aus einem automatischen Release-Build installiert, der
    Version "1.2.109" und Release-Datum "2026-08-25" gestampt hat
  When der Nutzer den Settings-Tab öffnet
  Then erscheint am Ende des Tabs der Text "Version 1.2.109 · 25.08.2026"
  And der Text ist klein und in gedämpfter Farbe (kein Fokuspunkt)

Scenario: Lokaler Dev-Build ohne Release-Datum zeigt nur die Version
  Given das Plugin wurde lokal über "bash deploy.sh" gebaut, ohne dass ein
    Release-Datum verfügbar ist
  When der Nutzer den Settings-Tab öffnet
  Then erscheint am Ende des Tabs der Text "Version 1.2.0" ohne Datum und ohne
    Trennzeichen

Scenario: Fußzeile ist nicht interaktiv
  Given der Settings-Tab zeigt die Versions-Fußzeile
  When der Nutzer auf den Text klickt
  Then passiert nichts (kein Link, kein Update-Check, keine Navigation)
```

## Out of Scope
- Kein Update-Check, kein "Neue Version verfügbar"-Hinweis, kein Link auf
  GitHub Releases.
- Keine neue Einstellung/kein Toggle, um die Fußzeile ein-/auszublenden.
- Kein rückwirkendes Befüllen des Release-Datums für bereits veröffentlichte
  Releases vor dieser Änderung — ältere installierte Builds zeigen einfach nur
  die Version (siehe AC3), bis der Nutzer das nächste Mal aktualisiert.
- Keine Anzeige an anderer Stelle der UI (z. B. Sidebar, Calendar-View) —
  ausschließlich der Settings-Tab.

## Open Questions
_None_

## Affected Areas
- `src/settings.ts`: neue Fußzeile am Ende von `display()`.
- `styles.css`: ggf. eine kleine neue Klasse für die Fußzeile (Schriftgröße +
  `var(--text-muted)`/`--f-muted`), analog zu bestehenden `muted`-Verwendungen
  — kein neuer Farbwert.
- `.github/workflows/release.yml`: „Stamp build version"-Step muss zusätzlich
  zur Versionsnummer ein Release-Datum für den laufenden Build ausgeben, das
  im gepackten Plugin landet (Teil der `files:`-Listen beider
  `action-gh-release`-Steps und von `scripts/package-release.sh`, falls dort
  eine neue Datei hinzukommt).
- `src/main.ts`: falls das Release-Datum aus einer eigenen Datei
  (z. B. `version.json` im Plugin-Verzeichnis) gelesen wird — der bestehende
  `calendar-colors.json`-Lese-Pfad (`normalizePath(\`${this.manifest.dir}/...\`)`
  + `this.app.vault.adapter.read(...)`, siehe `colorsPath()`/`loadColors()`
  in `main.ts`) ist ein direktes Vorbild für „kleine JSON-Datei aus dem
  Plugin-Verzeichnis lesen, Datei fehlt = kein Fehler, nur leerer Zustand".
- `.gitignore`: falls eine neue generierte Datei (z. B. `version.json`)
  eingeführt wird, gehört sie dorthin wie `main.js` — sie wird nur von der
  Release-Pipeline geschrieben, nicht eingecheckt.

## Implementation Notes (nicht bindend)
Der genaue Mechanismus, wie das Release-Datum vom Workflow zum laufenden
Plugin kommt, ist laut Issue explizit dem Builder überlassen — die einzige
harte Anforderung ist AC6 (Verfügbarkeit zur Laufzeit ohne Nutzerzutun) und
AC3 (sauberer Fallback, wenn es fehlt). `manifest.json` selbst ist laut
Obsidian-Typdefinition (`PluginManifest`) auf bekannte Felder beschränkt;
ein zusätzliches, nicht deklariertes Feld dort zu lesen erzwingt einen
Typ-Cast. Eine kleine separate Datei (z. B. `version.json` neben `main.js`)
im „Stamp build version"-Step geschrieben und beim Plugin-Start einmalig
gelesen/gecached, vermeidet das und passt zum bestehenden
`calendar-colors.json`-Muster in `main.ts`. `src/date-utils.ts` hat noch
keinen TT.MM.JJJJ-Formatter (nur `toDateStr` für ISO/YYYY-MM-DD) — AC2
braucht entweder eine neue kleine pure Formatierfunktion dort oder Inline-
Formatierung in `settings.ts`.

## Test Expectations
- Automatisiert (Vitest):
  - Falls eine neue pure Formatierfunktion für TT.MM.JJJJ entsteht (z. B. in
    `date-utils.ts`): Unit-Test für ein reguläres Datum sowie für einstellige
    Tage/Monate (führende Nullen, z. B. "2026-01-05" → "05.01.2026").
  - Falls die Version/Datum-Kombination als pure Funktion zusammengesetzt wird
    (z. B. `formatVersionFooter(version, date | undefined)`): Test für
    "Version + Datum vorhanden" (AC2) und "Datum fehlt" (AC3) — jeweils exakter
    erwarteter String, kein Platzhaltertext bei fehlendem Datum.
  - Reines DOM-Wiring (dass die Fußzeile das letzte Element in `display()` ist,
    mit der richtigen CSS-Klasse) ist stabile, aber triviale DOM-Struktur —
    laut Test-Prinzipien aus `CLAUDE.md` optional als schneller Snapshot/Smoke-
    Test, keine Pflicht für jedes Detail.
- Manuelle QA:
  - Sichtprüfung nach `bash deploy.sh`: Fußzeile erscheint unten im Settings-
    Tab, klein und blass, in Light- und Dark-Mode gut lesbar (kein zu
    niedriger Kontrast).
  - Sichtprüfung, dass sie nach dem "Erweitert"-Abschnitt kommt und keine
    anderen Einstellungen verschiebt.
  - Da lokale Dev-Builds kein Release-Datum haben (siehe Out of Scope), zeigt
    die manuelle QA im Vault erwartungsgemäß nur die Version ohne Datum
    (Szenario 2) — das vollständige "Version · Datum"-Bild (Szenario 1) ist
    erst nach dem nächsten echten Merge/Release sichtbar und nicht Teil der
    lokalen QA-Verifikation dieser Iteration.

---

## UX Review
Rein informative Fußzeile ohne Interaktion (AC4): kein Link, kein Button, kein
Klick-Handler, keine neue Einstellung. Einziges Element, einziger Ort (Ende
des Settings-Tabs), einziger Zustand mit sauberem Fallback ohne Datum (AC3).
Kein Interaktionsfluss zu prüfen.

Freigabe für `ux-reviewed`.

---

## Design Review
Verwendet ausschließlich bestehende „muted"-Design-Sprache
(`var(--text-muted)` / `--f-muted`, wie bei `.setting-item-description`
bereits im Projekt etabliert) — kein neuer Farbwert, keine neue Komponente,
keine Abweichung vom Monokai-Pro-System (AC5). Platzierung als letztes
Element in `display()` verschiebt keine bestehenden Abschnitte.

Freigabe für `design-reviewed`.

---

## QA Report
_Pending_
