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
  const lines = normalized.split("\n");
  const filtered = lines.filter((line) => {
    const stripped = line.trim();
    if (stripped === ":~:~") return false;
    return true;
  });
  let inGoogleMeetBlock = false;
  const result = filtered.filter((line) => {
    const stripped = line.trim();
    if (stripped === ":~:~") {
      inGoogleMeetBlock = !inGoogleMeetBlock;
      return false;
    }
    return !inGoogleMeetBlock;
  });
  const cutAt = result.findIndex((l) => /^_{3,}\s*$/.test(l));
  return (cutAt === -1 ? result : result.slice(0, cutAt)).join("\n").trim();
}
