# `solidtime`-Blöcke

Zeigt getrackte Zeiten aus SolidTime direkt in einer Notiz — so wie Dataview
Vault-Daten zeigt, nur ist die Quelle die SolidTime-API.

```solidtime
summary by month
client: Tchibo
since: this year
```

## Aufbau

Die **erste Zeile** ist die Ansicht, jede weitere ein Filter als `feld: wert`.
Alles nach `#` ist Kommentar.

| Ansicht | zeigt |
|---|---|
| `entries` | einzelne Zeiteinträge: Datum, Projekt, Beschreibung, Stunden |
| `summary by client` | Stunden und Betrag je Kunde |
| `summary by month` | Stunden und Betrag je Monat |
| `summary by project` | Stunden und Betrag je Projekt |

`summary` allein bedeutet `summary by client`.

## Filter

| Feld | deutsch | Beispiel |
|---|---|---|
| `client` | `kunde` | `client: Tchibo`, `client: all` |
| `project` | `projekt` | `projekt: Workshop` |
| `since` | `seit`, `von` | `since: 2026-01-01`, `since: -30d` |
| `until` | `bis` | `until: last month` |
| `month` | `monat` | `month: 2026-07` — setzt Anfang und Ende |
| `billable` | `abrechenbar` | `billable: true` |
| `limit` | | `limit: 20` (nur `entries`, max. 1000) |

### Datumsangaben

Absolut `2026-03-14`, `2026-02` (ganzer Monat), `2025` (ganzes Jahr).
Relativ `-30d`, `-2w`, `-1m`, `-1y`.
Benannt `today`/`heute`, `this month`/`dieser monat`, `last month`,
`this year`/`ytd`, `last year`.

Relative Angaben werden bei jedem Rendern neu aufgelöst — ein Block bleibt
also aktuell, statt auf dem Tag einzufrieren, an dem er geschrieben wurde.

## In einer Kundennotiz

Steht der Block in einer Notiz mit `type: kunde`, ist der Kunde automatisch
gesetzt. Das genügt dort:

```solidtime
summary by month
```

`client: all` hebt das auf, wenn ein Block in einer Kundennotiz ausnahmsweise
alles zeigen soll.

## Grenzen

- **Nur lesend.** Eine Notiz kann Zeiten zeigen, aber nie ändern.
- **Beträge nur in den Summen-Ansichten.** SolidTime liefert Kosten beim
  Aggregat, nicht am einzelnen Eintrag; die `entries`-Ansicht zeigt daher
  Stunden ohne Betrag.
- **Fehlt der Satz**, steht in der Summe ein Strich statt `0 €` — eine Null
  würde behaupten, die Arbeit sei unbezahlt gewesen.
- **Braucht Netz.** Ohne Verbindung bleibt der Block mit einer Meldung stehen.

## API-Key

Einstellungen → Deskleaf → SolidTime. Der Key landet in der `data.json` des
Plugins, im Klartext wie jede Obsidian-Plugin-Einstellung. Liegt der Vault in
Git, gehört diese Datei in die `.gitignore`.
