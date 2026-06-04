# Ship — Feature Delivery Pipeline

Du bist der Orchestrator. Du koordinierst alle Agents für ein Feature von der Idee bis zum Deploy.
CLAUDE.md ist automatisch geladen — alle Agents erben diesen Kontext, kein explizites Lesen nötig.

## Aufruf-Varianten

- `/ship "Feature-Beschreibung"` → startet von vorne (kein Spec vorhanden)
- `/ship specs/features/[name].md` → setzt an der aktuellen Stage an

## Stage-Erkennung

Lies `$ARGUMENTS`. Ist es ein existierender Dateipfad → lese den `## Status` und springe zur passenden Stage. Sonst → Stage 1.

---

### Stage 1 — Requirements (interaktiv, bleibt in dieser Session)

Führe den `/req`-Workflow direkt aus — **nicht als Sub-Agent**, weil Dialog mit User nötig ist.
Ziel: `specs/features/[slug].md` mit Status `draft` existiert und User ist zufrieden.

→ Frage: **„Spec fertig — soll ich UX und Design-Review parallel starten?"**

---

### Stage 2 — UX + Design Review (parallel)

Starte beide gleichzeitig als Sub-Agents. Jeder bekommt nur den Spec-Pfad:

```
Agent(ux):     "Führe /ux durch für specs/features/[slug].md"
Agent(design): "Führe /design durch für specs/features/[slug].md"
```

Warte bis beide fertig. Zeige kombinierte Befunde kompakt.

→ Frage: **„Gibt es ❌-Befunde die gelöst werden müssen, oder soll ich weitermachen?"**

Wenn OK: setze Status auf `approved`.

---

### Stage 3 — Tests (Sub-Agent, kein Stop danach)

```
Agent(tdd): "Führe /tdd durch für specs/features/[slug].md"
```

Zeige kurz was erstellt wurde → direkt weiter mit Stage 4.

---

### Stage 4 — Implementierung (Sub-Agent)

```
Agent(implement): "Führe /implement durch für specs/features/[slug].md"
```

Zeige Ergebnis. Wenn Tests rot oder TypeScript-Fehler → stoppe und melde Problem.

---

### Stage 5 — QA (Sub-Agent)

```
Agent(qa): "Führe /qa durch für specs/features/[slug].md"
```

Zeige QA Report. Liste manuelle Prüfpunkte auf die der User in Obsidian prüfen soll.

---

## Grundregeln

- **Minimal lesen** — kein Agent liest mehr als die Feature-Spec + die Dateien die er direkt ändert
- **Nur einmal fragen** — nach Stage 1 und wenn etwas fehlschlägt
- **Stoppe bei ❌** — nicht blindlings weiter wenn ein Agent ein echtes Problem meldet
- **CLAUDE.md reicht** — Projekt-Kontext ist automatisch geladen, nicht nochmal lesen

## Input
$ARGUMENTS
