/**
 * A customer's logo, taken from the note's `logo:` frontmatter.
 *
 * The field is deliberately forgiving about what it holds — an emoji typed on
 * the phone, an image dropped into the vault, a wiki-link Obsidian produced
 * when it was dropped, or a URL. Which of those it is decides how it renders,
 * and that decision is pure so it can be tested without a vault.
 */
export type LogoRef =
  | { kind: "text"; value: string }
  | { kind: "vault"; path: string }
  | { kind: "url"; url: string }
  | null;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;

/** Longest run that still reads as a mark rather than a word. */
const MAX_TEXT_GRAPHEMES = 2;

function graphemeCount(value: string): number {
  // Emoji are multi-code-unit; the spread iterates code points, which is close
  // enough to separate "🟡" or "AB" from an actual word.
  return [...value].length;
}

export function parseLogo(raw: unknown): LogoRef {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  // Obsidian turns a dropped image into a wiki-link; unwrap it.
  const wiki = value.match(/^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
  const bare = (wiki ? wiki[1] : value).trim();
  if (!bare) return null;

  if (/^https?:\/\//i.test(bare)) return { kind: "url", url: bare };
  if (IMAGE_EXTENSIONS.test(bare)) return { kind: "vault", path: bare };

  // Anything short and without a path separator is treated as a mark — an
  // emoji, or initials. A longer string is a mistake we should not render as
  // a giant label in a 16px slot.
  if (!bare.includes("/") && graphemeCount(bare) <= MAX_TEXT_GRAPHEMES) {
    return { kind: "text", value: bare };
  }
  return null;
}
