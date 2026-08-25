const DAYS   = ["So","Mo","Di","Mi","Do","Fr","Sa"] as const;
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"] as const;

/** Format a Date as YYYY-MM-DD */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format HH:MM from a Date or ISO string */
export function toTimeStr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function minsToTimeStr(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function minsToISO(date: string, mins: number): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${date}T${minsToTimeStr(mins)}:00${tz}`;
}

/** Parse YYYY-MM-DD into a local Date at midnight */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Add N days to a Date */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday of the week containing d */
export function weekStart(d: Date): Date {
  const day = d.getDay(); // 0=Sun…6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** Format a Date as a short human label, e.g. "Do – 28. Mai" */
export function shortDayLabel(d: Date): string {
  return `${DAYS[d.getDay()]} – ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/**
 * 3-day column logic per spec:
 *  Mo–Do  → [today, +1, +2]
 *  Fr     → [Fri, Sat+Sun stacked, Mon]
 *  Sa     → [Sat+Sun stacked, Mon, Tue]
 *  So     → [Sat+Sun stacked, Mon, Tue]
 */
export interface DayColumn {
  label: string;
  dates: string[]; // one or two YYYY-MM-DD strings (two = Sa+So stacked)
}

export function get3DayColumns(anchor: Date): DayColumn[] {
  // Always 3 individual day columns — no stacking
  return [0, 1, 2].map((n) => {
    const d = addDays(anchor, n);
    return { label: shortDayLabel(d), dates: [toDateStr(d)] };
  });
}

/** Mon–Fri as individual columns + Sa+So sharing one column slot */
export function getWeekColumns(anchor: Date): DayColumn[] {
  const mon = weekStart(anchor);
  const cols: DayColumn[] = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(mon, i);
    cols.push({ label: shortDayLabel(d), dates: [toDateStr(d)] });
  }
  const sat = addDays(mon, 5);
  const sun = addDays(mon, 6);
  cols.push({ label: shortDayLabel(sat), dates: [toDateStr(sat), toDateStr(sun)] });
  return cols;
}

export function get1DayColumn(anchor: Date): DayColumn[] {
  return [{ label: shortDayLabel(anchor), dates: [toDateStr(anchor)] }];
}

export function getNDayColumns(anchor: Date, n: number): DayColumn[] {
  // Sunday snaps back to Saturday so the weekend pair always starts at Sa
  const start = anchor.getDay() === 0 ? addDays(anchor, -1) : anchor;
  const cols: DayColumn[] = [];
  let i = 0;
  while (cols.length < n) {
    const d = addDays(start, i);
    if (d.getDay() === 6) {
      // Always pair Saturday with Sunday, even if Sunday is outside the original range
      cols.push({ label: shortDayLabel(d), dates: [toDateStr(d), toDateStr(addDays(start, i + 1))] });
      i += 2;
    } else {
      cols.push({ label: shortDayLabel(d), dates: [toDateStr(d)] });
      i++;
    }
  }
  return cols;
}

/** Format e.g. "Mo 20. – Fr 24. April 2026" for multi-day range nav label */
export function rangeHeaderLabel(start: Date, end: Date): string {
  const s = `${DAYS[start.getDay()]} ${start.getDate()}.`;
  const yr = end.getFullYear();
  const yearStr = yr === new Date().getFullYear() ? "" : ` ${yr}`;
  const e = `${DAYS[end.getDay()]} ${end.getDate()}. ${MONTHS[end.getMonth()]}${yearStr}`;
  return `${s} – ${e}`;
}

/** Format e.g. "Di, 22. April 2026" for single-day nav label */
export function dayHeaderLabel(anchor: Date): string {
  const yr = anchor.getFullYear();
  const yearStr = yr === new Date().getFullYear() ? "" : ` ${yr}`;
  return `${DAYS[anchor.getDay()]}, ${anchor.getDate()}. ${MONTHS[anchor.getMonth()]}${yearStr}`;
}

/** Format e.g. "KW 17 · April 2026" */
export function weekHeaderLabel(anchor: Date): string {
  const mon = weekStart(anchor);
  const kw = getWeekNumber(mon);
  const yr = mon.getFullYear();
  const yearStr = yr === new Date().getFullYear() ? "" : ` ${yr}`;
  return `KW ${kw} · ${MONTHS[mon.getMonth()]}${yearStr}`;
}

/** Format a "YYYY-MM-DD" release date as "TT.MM.JJJJ" */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Compose the settings-tab footer text, e.g. "Version 1.2.109 · 25.08.2026" */
export function formatVersionFooter(version: string, releaseDate: string | null): string {
  if (!releaseDate) return `Version ${version}`;
  return `Version ${version} · ${formatReleaseDate(releaseDate)}`;
}

export function getWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
