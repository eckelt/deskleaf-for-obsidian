export function toArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return raw ? [String(raw)] : [];
}

export function normalizeAttendee(name: string): string {
  const comma = name.indexOf(",");
  if (comma === -1) return name;
  const last  = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

export function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function cleanBody(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = removeGoogleMeetBoilerplate(normalized.split("\n"));
  const cutAt = lines.findIndex((l) => /^_{3,}\s*$/.test(l));
  return (cutAt === -1 ? lines : lines.slice(0, cutAt)).join("\n").trim();
}

function removeGoogleMeetBoilerplate(lines: string[]): string[] {
  const cleaned: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isGoogleMeetDelimiter(lines[i])) {
      cleaned.push(lines[i]);
      continue;
    }

    const closing = lines.findIndex((line, index) => index > i && isGoogleMeetDelimiter(line));
    if (closing === -1) {
      cleaned.push(lines[i]);
      continue;
    }

    const block = lines.slice(i + 1, closing);
    if (!isGoogleMeetBoilerplateBlock(block)) {
      cleaned.push(lines[i]);
      continue;
    }

    i = closing;
  }

  return cleaned;
}

function isGoogleMeetDelimiter(line: string): boolean {
  return /^-:[:~]+::-$/.test(line.trim());
}

function isGoogleMeetBoilerplateBlock(lines: string[]): boolean {
  const block = lines.join("\n").toLowerCase();
  return block.includes("join with google meet")
    && block.includes("meet.google.com")
    && block.includes("please do not edit this section.");
}
