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
  let inGoogleMeetBlock = false;
  const lines = normalized.split("\n").filter((line) => {
    const stripped = line.trim();
    if (stripped.match(/^-:[:~]+::-$/)) {
      inGoogleMeetBlock = !inGoogleMeetBlock;
      return false;
    }
    return !inGoogleMeetBlock;
  });
  const cutAt = lines.findIndex((l) => /^_{3,}\s*$/.test(l));
  return (cutAt === -1 ? lines : lines.slice(0, cutAt)).join("\n").trim();
}
