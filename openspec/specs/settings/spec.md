# Settings

Draft baseline written by the Cartographer from code and docs; awaiting operator review.

## Purpose
Provides the single settings tab where a user configures the CalDAV connection, iCal
subscriptions, business hours, the Brain vault folder layout, SolidTime access, and the macOS
binary path — and persists all of it (plus the calendar cache) into the plugin's `data.json`.

## Requirements

### Requirement: Settings load with defaults deep-merged onto stored data
On load, the plugin SHALL start from `DEFAULT_SETTINGS` and shallow-assign persisted `data.json`
values on top, with an explicit deep-merge for the `caldav`, `businessHours`, `vault`, and
`solidtime` sub-objects so a settings file written before a given sub-field existed still gets
every current key rather than `undefined`.
_Source: src/main.ts (loadSettings), src/types.ts (DEFAULT_SETTINGS)_

#### Scenario: Old data.json gains new vault sub-fields
- **WHEN** a persisted `data.json` predates the `vault.todoFolders` field
- **THEN** after `loadSettings()`, `settings.vault.todoFolders` holds its default value rather than
  being `undefined`

### Requirement: Per-calendar and per-feed colors use a shared six-hue palette
The settings tab SHALL let a user assign one of the six `CAL_COLOR_PALETTE` hues (pink, orange,
yellow, green, cyan, purple) to each discovered CalDAV calendar and to each iCal feed via clickable
swatches, and SHALL let a user toggle a calendar or feed on/off via a separate outline swatch.
_Source: src/settings.ts (renderCalDAVList, renderICalList), src/types.ts (CAL_COLOR_PALETTE)_

#### Scenario: Toggling a calendar off excludes it without losing its color
- **WHEN** a user clicks the outline toggle circle for an already-selected calendar
- **THEN** that calendar's href is removed from `selectedCalendars` but its saved hue in
  `calendarColors` is left untouched

### Requirement: Changing CalDAV credentials or the binary path swaps or restarts the reader live
Saving new CalDAV username/password SHALL either update credentials and refresh the existing
CalDAV-based reader, or (if the active reader was binary-based) stop it and construct a fresh
CalDAV reader; saving a new binary path when CalDAV is not configured SHALL call
`setBinaryPath()`, restarting the watch process.
_Source: src/main.ts (saveSettings), src/settings.ts_

#### Scenario: Switching from binary to CalDAV mid-session
- **WHEN** a user enters CalDAV username and password for the first time while the binary reader is
  active
- **THEN** `saveSettings()` stops the binary reader, constructs a `CalendarReader | CalDAVReader |
  CompositeCalendarReader` via `makeReader()`, loads it, and starts watching

### Requirement: Calendar colors persist separately from the rest of settings
Calendar colors (`caldav.calendarColors`) SHALL additionally be written to and restored from
`<manifest.dir>/calendar-colors.json`, independent of the main `data.json` save path, via
`saveSettingsQuiet()` so a color-swatch click does not trigger a reader restart.
_Source: src/main.ts (persistCalendarColors, restoreCalendarColors, saveSettingsQuiet)_

#### Scenario: Picking a swatch does not reload the calendar
- **WHEN** a user clicks a color swatch for a calendar
- **THEN** `saveSettingsQuiet()` runs instead of `saveSettings()`, so no live reader reload is
  triggered

### Requirement: Vault-structure fields fall back to their defaults, never to the vault root
A blank folder field in the Vault-Struktur section (meetings, customers, people, projects) SHALL
be coerced back to its documented default on save rather than being allowed to write notes to the
vault root.
_Source: src/settings.ts (folders loop: `value.trim() || placeholder`)_

#### Scenario: Clearing the customers folder field keeps the default
- **WHEN** a user clears the "Kunden" folder field and the input loses focus
- **THEN** `settings.vault.customersFolder` is saved as `"customers"`, not an empty string
