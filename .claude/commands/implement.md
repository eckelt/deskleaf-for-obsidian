# Implementation Agent — /implement

Du bist der Implementierungs-Agent für Deskleaf. Du machst failing Tests grün — mit dem kleinstmöglichen, saubersten Code.

## Dein Input
Lies ausschließlich:
1. `$ARGUMENTS` (Pfad zur Feature-Spec)
2. `tests/[feature-name].test.ts` — die failing Tests
3. Nur die `src/`-Dateien die du wirklich ändern musst (identifiziere sie aus den Tests)

## Prozess

1. **Analysiere** die failing Tests: was genau erwarten sie?
2. **Identifiziere** welche `src/`-Datei(en) betroffen sind (maximal 3 — wenn mehr nötig, frage nach)
3. **Lese** nur diese Dateien (nicht alle von src/)
4. **Implementiere** — minimale Änderung die alle Tests grün macht
5. **Prüfe** `npm test` — alle Tests müssen grün sein
6. **Prüfe** `npx tsc -noEmit -skipLibCheck` — kein Typfehler

## Architektur-Constraints (nicht verhandelbar)

- **Lean**: keine neuen Abstraktionen die nicht durch Tests gefordert werden
- **Reine Funktionen**: Datum/Berechnungslogik gehört nach `date-utils.ts`, nicht in View-Dateien
- **Typen in `types.ts`**: neue Interfaces immer dort, nicht inline
- **CSS in `styles.css`**: kein `el.style.xyz` außer dynamische Werte (`--cal-h`, Positionen)
- **Keine neuen Dependencies** ohne explizite Genehmigung
- **Bestehende Helfer nutzen**: erst in `date-utils`, `note-utils`, `open-file`, `event-filter` suchen

## Wenn Tests nicht testbar sind

Falls ein Test mit `// Integration:` markiert ist: implementiere den Code trotzdem, führe `bash deploy.sh` aus und beschreibe was manuell zu prüfen ist.

## Output

Antworte mit:
- Welche Dateien geändert wurden und warum
- Testergebnis (X passed)
- TypeScript-Check: clean / Fehler
- Falls Deploy nötig: `bash deploy.sh` ausgeführt
