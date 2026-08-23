import { describe, expect, it } from "vitest";
import { parseLogo } from "../src/note-logo";

describe("parseLogo", () => {
  it("reads a plain vault path", () => {
    expect(parseLogo("assets/tchibo.png")).toEqual({ kind: "vault", path: "assets/tchibo.png" });
  });

  it("unwraps the wiki-link Obsidian writes for a dropped image", () => {
    expect(parseLogo("[[tchibo.png]]")).toEqual({ kind: "vault", path: "tchibo.png" });
    expect(parseLogo("![[assets/logo.svg]]")).toEqual({ kind: "vault", path: "assets/logo.svg" });
    expect(parseLogo("[[assets/logo.png|80]]")).toEqual({ kind: "vault", path: "assets/logo.png" });
  });

  it("recognises a URL", () => {
    expect(parseLogo("https://example.com/l.png")).toEqual({ kind: "url", url: "https://example.com/l.png" });
    expect(parseLogo("HTTP://example.com/l.png")).toEqual({ kind: "url", url: "HTTP://example.com/l.png" });
  });

  it("treats an emoji or initials as a mark", () => {
    expect(parseLogo("☕")).toEqual({ kind: "text", value: "☕" });
    expect(parseLogo("dm")).toEqual({ kind: "text", value: "dm" });
  });

  it("keeps a multi-code-unit emoji in one piece", () => {
    expect(parseLogo("👨‍👩‍👧")).toBeNull();
    expect(parseLogo("🇩🇪")).toEqual({ kind: "text", value: "🇩🇪" });
  });

  it("refuses a long string rather than stretching the row", () => {
    expect(parseLogo("Tchibo GmbH")).toBeNull();
  });

  it("ignores an empty, missing or non-string field", () => {
    for (const value of ["", "   ", undefined, null, 42, [], "[[]]"]) {
      expect(parseLogo(value), String(value)).toBeNull();
    }
  });

  it("accepts the common image extensions, case-insensitively", () => {
    for (const ext of ["png", "JPG", "jpeg", "gif", "svg", "webp", "avif"]) {
      expect(parseLogo(`a.${ext}`), ext).toEqual({ kind: "vault", path: `a.${ext}` });
    }
  });
});
