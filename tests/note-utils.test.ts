import { describe, it, expect } from "vitest";
import { toArray, normalizeAttendee, sanitizeFilename, cleanBody } from "../src/note-utils";

describe("toArray", () => {
  it("returns empty array for null", () => {
    expect(toArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("wraps a string in an array", () => {
    expect(toArray("abc")).toEqual(["abc"]);
  });

  it("passes through a string array", () => {
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });

  it("converts number array to strings", () => {
    expect(toArray([1, 2])).toEqual(["1", "2"]);
  });

  it("wraps a number in an array string", () => {
    expect(toArray(42)).toEqual(["42"]);
  });
});

describe("normalizeAttendee", () => {
  it("converts Last, First to First Last", () => {
    expect(normalizeAttendee("Müller, Hans")).toBe("Hans Müller");
  });

  it("leaves names without a comma unchanged", () => {
    expect(normalizeAttendee("Alice Smith")).toBe("Alice Smith");
  });

  it("handles missing first name (trailing comma)", () => {
    expect(normalizeAttendee("Smith, ")).toBe("Smith");
  });

  it("handles a single word name", () => {
    expect(normalizeAttendee("Madonna")).toBe("Madonna");
  });

  it("trims whitespace around the comma", () => {
    expect(normalizeAttendee("  Jones , Bob  ")).toBe("Bob Jones");
  });
});

describe("sanitizeFilename", () => {
  it("removes forbidden characters", () => {
    expect(sanitizeFilename('Meeting: "Sales" / Q1')).not.toMatch(/[/:*?"<>|]/);
  });

  it("removes # ^ [ ] characters", () => {
    expect(sanitizeFilename("Tags #work [urgent] ^note")).not.toMatch(/[#^[\]]/);
  });

  it("collapses multiple spaces into one", () => {
    expect(sanitizeFilename("Hello   World")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeFilename("  Meeting  ")).toBe("Meeting");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(150);
    expect(sanitizeFilename(long)).toHaveLength(100);
  });

  it("preserves normal text", () => {
    expect(sanitizeFilename("Team Weekly 2026")).toBe("Team Weekly 2026");
  });

  it("preserves German umlauts", () => {
    expect(sanitizeFilename("Rückblick März")).toBe("Rückblick März");
  });
});

describe("cleanBody", () => {
  const googleMeetDelimiter = "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-";
  const googleMeetBoilerplate = [
    googleMeetDelimiter,
    "Join with Google Meet: https://meet.google.com/pam-uaqp-wyj",
    "Or dial: (DE) +49 40 8081615507 PIN: 924830059#",
    "More phone numbers: https://tel.meet/pam-uaqp-wyj?pin=4910928293376&hs=7",
    "",
    "Learn more about Meet at: https://support.google.com/a/users/answer/9282720",
    "",
    "Please do not edit this section.",
    googleMeetDelimiter,
  ].join("\n");

  it("returns empty string for null", () => {
    expect(cleanBody(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(cleanBody(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(cleanBody("")).toBe("");
  });

  it("returns text unchanged when no separator", () => {
    expect(cleanBody("Agenda\n- Item 1\n- Item 2")).toBe("Agenda\n- Item 1\n- Item 2");
  });

  it("truncates content at ___ separator (3 underscores)", () => {
    const body = "Notes here\n___\nJunk below";
    expect(cleanBody(body)).toBe("Notes here");
  });

  it("truncates at longer underscores separator too", () => {
    const body = "Notes\n______\nMore junk";
    expect(cleanBody(body)).toBe("Notes");
  });

  it("does not truncate at __ (only 2 underscores)", () => {
    const body = "Notes\n__\nMore";
    expect(cleanBody(body)).toBe("Notes\n__\nMore");
  });

  it("normalizes Windows CRLF line endings", () => {
    const body = "Line 1\r\nLine 2\r\n___\r\nJunk";
    expect(cleanBody(body)).toBe("Line 1\nLine 2");
  });

  it("normalizes old Mac CR line endings", () => {
    const body = "Line 1\rLine 2\r___\rJunk";
    expect(cleanBody(body)).toBe("Line 1\nLine 2");
  });

  it("trims leading and trailing whitespace from result", () => {
    expect(cleanBody("  \n  Notes  \n  ")).toBe("Notes");
  });

  it("removes a generated Google Meet block with dial-in and support lines", () => {
    const body = [
      "Agenda",
      "- Review milestones",
      "",
      googleMeetBoilerplate,
      "",
      "Bring current numbers",
    ].join("\n");

    expect(cleanBody(body)).toBe("Agenda\n- Review milestones\n\n\nBring current numbers");
  });

  it("keeps user-written text around a generated provider block", () => {
    const body = [
      "Before",
      "-::~:~::~:~:~:~:~:~:~:~:~::~:~::-",
      "Join with Google Meet: https://meet.google.com/abc-defg-hij",
      "Please do not edit this section.",
      "-::~:~::~:~:~:~:~:~:~:~:~::~:~::-",
      "After",
    ].join("\n");

    expect(cleanBody(body)).toBe("Before\nAfter");
  });

  it("keeps non-Google-Meet content between delimiter-looking lines", () => {
    const body = [
      "Agenda",
      googleMeetDelimiter,
      "This is user-written context, not generated Google Meet boilerplate.",
      googleMeetDelimiter,
      "Follow-up",
    ].join("\n");

    expect(cleanBody(body)).toBe(body);
  });
});
