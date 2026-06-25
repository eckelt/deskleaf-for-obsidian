# Deskleaf Design System

## Theme
Deskleaf follows a Monokai Pro inspired visual system.

## Dark Mode Chrome
- Background: `#2d2a2e`
- Panel: `#221f22`
- Text: `#fcfcfa`
- Muted: `#727072`
- Subtle border: `#3e3b3f`
- Strong border: `#5b595c`

## Light Mode Chrome
- Background: `#f9f7f5`
- Text: `#2d2a2e`
- Muted: `#a09c98`
- Border: `#e6e2dd`

## Calendar Palette
Calendar colors use the six Monokai Pro hues from `CAL_COLOR_PALETTE`:

```text
346 pink
21 orange
48 yellow
96 green
188 cyan
252 purple
```

The source of truth for these values is `src/types.ts`.

## Event Cards
Event cards use the CSS custom property `--cal-h` for the hue only.

Light mode:

```css
background: hsl(h, 52%, 91%);
border: hsl(h, 58%, 47%);
color: hsl(h, 58%, 24%);
```

Dark mode:

```css
background: hsl(h, 28%, 15%);
border: hsl(h, 78%, 63%);
color: hsl(h, 72%, 70%);
```

## CSS Variables
- Use `--f-*` for layout and surface variables.
- Use `--cal-h` per event card.
- Use Obsidian accent variables from `--accent-h`, `--accent-s`, `--accent-l`, and `--interactive-accent`.

## Styling Rules
- Keep styles in `styles.css`.
- Do not use inline styles for static styling.
- Use dynamic CSS custom properties for runtime layout or color values
  (`--f-*`, `--cal-h`) when values must be computed in TypeScript.
- Keep visual additions consistent with Obsidian plugin UI patterns.
- Prefer compact, scannable operational UI over marketing-style presentation.
