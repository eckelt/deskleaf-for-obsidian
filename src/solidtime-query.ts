/**
 * The `solidtime` code block language.
 *
 * Deliberately not a query language. Every block is a view plus a handful of
 * filters, one per line, because the useful questions about tracked time are
 * few and always the same shape: how much, for whom, in which period.
 *
 *     ```solidtime
 *     summary by month
 *     client: Tchibo
 *     since: this year
 *     ```
 *
 * Everything here is pure so the whole language is testable without a network.
 */

export type SolidTimeView = "entries" | "by-client" | "by-month" | "by-project";

export interface SolidTimeQuery {
  view: SolidTimeView;
  client?: string;
  project?: string;
  /** Inclusive ISO date, resolved from the `since:` expression. */
  since?: string;
  /** Inclusive ISO date, resolved from the `until:` expression. */
  until?: string;
  billable?: boolean;
  limit: number;
}

export const DEFAULT_LIMIT = 100;

const VIEWS: Array<[RegExp, SolidTimeView]> = [
  [/^(time\s+)?entries$/i, "entries"],
  [/^summary\s+by\s+client$/i, "by-client"],
  [/^summary\s+by\s+(month|monat)$/i, "by-month"],
  [/^summary\s+by\s+project$/i, "by-project"],
  [/^summary$/i, "by-client"],
];

export class SolidTimeQueryError extends Error {}

/**
 * Resolves a date expression against a reference day. Relative forms exist so a
 * block written once keeps answering the current question instead of freezing
 * on the day it was typed.
 */
export function resolveDate(expression: string, today: Date, edge: "start" | "end"): string {
  const value = expression.trim().toLowerCase();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [yy, mm] = value.split("-").map(Number);
    return iso(edge === "start" ? utc(yy, mm - 1, 1) : utc(yy, mm, 0));
  }
  if (/^\d{4}$/.test(value)) {
    return edge === "start" ? `${value}-01-01` : `${value}-12-31`;
  }

  const relative = value.match(/^-(\d+)\s*([dwmy])$/);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2];
    const d = new Date(today);
    if (unit === "d") d.setUTCDate(d.getUTCDate() - n);
    if (unit === "w") d.setUTCDate(d.getUTCDate() - n * 7);
    if (unit === "m") d.setUTCMonth(d.getUTCMonth() - n);
    if (unit === "y") d.setUTCFullYear(d.getUTCFullYear() - n);
    return iso(d);
  }

  switch (value) {
    case "today":
    case "heute":
      return iso(today);
    case "this month":
    case "dieser monat":
      return iso(edge === "start" ? utc(y, m, 1) : utc(y, m + 1, 0));
    case "last month":
    case "letzter monat":
      return iso(edge === "start" ? utc(y, m - 1, 1) : utc(y, m, 0));
    case "this year":
    case "dieses jahr":
    case "ytd":
      return edge === "start" ? `${y}-01-01` : iso(today);
    case "last year":
    case "letztes jahr":
      return edge === "start" ? `${y - 1}-01-01` : `${y - 1}-12-31`;
    default:
      throw new SolidTimeQueryError(`Datum '${expression}' nicht verstanden`);
  }
}

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "ja", "1"].includes(v)) return true;
  if (["false", "no", "nein", "0"].includes(v)) return false;
  throw new SolidTimeQueryError(`'${value}' ist kein ja/nein`);
}

/**
 * @param defaultClient the customer a surrounding note is about; a block inside
 *   a customer note should not have to repeat the name it already sits under.
 */
export function parseSolidTimeQuery(source: string, today: Date, defaultClient?: string): SolidTimeQuery {
  const lines = source
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) throw new SolidTimeQueryError("Der Block ist leer");

  const view = VIEWS.find(([pattern]) => pattern.test(lines[0]))?.[1];
  if (!view) {
    throw new SolidTimeQueryError(
      `'${lines[0]}' ist keine Ansicht. Erlaubt: entries, summary by client, summary by month, summary by project`,
    );
  }

  const query: SolidTimeQuery = { view, limit: DEFAULT_LIMIT };
  if (defaultClient) query.client = defaultClient;

  for (const line of lines.slice(1)) {
    const match = line.match(/^([a-zA-Zä]+)\s*[:=]\s*(.+)$/);
    if (!match) throw new SolidTimeQueryError(`'${line}' ist kein 'feld: wert'`);
    const [, rawKey, rawValue] = match;
    const key = rawKey.toLowerCase();
    const value = rawValue.trim().replace(/^["']|["']$/g, "");

    switch (key) {
      case "client":
      case "kunde":
        // An explicit `client: all` opts out of the surrounding note's customer.
        query.client = /^(all|alle|\*)$/i.test(value) ? undefined : value;
        break;
      case "project":
      case "projekt":
        query.project = value;
        break;
      case "since":
      case "seit":
      case "from":
      case "von":
        query.since = resolveDate(value, today, "start");
        break;
      case "until":
      case "bis":
      case "to":
        query.until = resolveDate(value, today, "end");
        break;
      case "month":
      case "monat":
        query.since = resolveDate(value, today, "start");
        query.until = resolveDate(value, today, "end");
        break;
      case "billable":
      case "abrechenbar":
        query.billable = parseBoolean(value);
        break;
      case "limit":
        if (!/^\d+$/.test(value)) throw new SolidTimeQueryError(`limit '${value}' ist keine Zahl`);
        query.limit = Math.min(Number(value), 1000);
        break;
      default:
        throw new SolidTimeQueryError(`Feld '${rawKey}' kenne ich nicht`);
    }
  }

  if (query.since && query.until && query.since > query.until) {
    throw new SolidTimeQueryError(`Zeitraum läuft rückwärts: ${query.since} bis ${query.until}`);
  }
  return query;
}

// ── Ergebnisaufbereitung ──────────────────────────────────────────────

export interface SolidTimeRow {
  label: string;
  hours: number;
  amountEur: number | null;
  /** Only set by the entries view. */
  date?: string;
  description?: string;
}

export function roundHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

/** SolidTime keeps money in cents. */
export function centsToEur(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : Math.round(cents) / 100;
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const minutes = Math.round((hours - h) * 60);
  return minutes === 0 ? `${h} h` : `${h}:${String(minutes).padStart(2, "0")} h`;
}

export function formatEur(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function totalRow(rows: SolidTimeRow[]): { hours: number; amountEur: number | null } {
  const hours = Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 100) / 100;
  const known = rows.filter((row) => row.amountEur !== null);
  // A total of "0 €" would claim the work was unpaid; when nothing carries a
  // rate the honest answer is that the sum is unknown.
  const amountEur = known.length === 0
    ? null
    : Math.round(known.reduce((sum, row) => sum + (row.amountEur ?? 0), 0) * 100) / 100;
  return { hours, amountEur };
}

/** `2026-08` → `August 2026`, for the by-month view. */
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function monthLabel(key: string): string {
  const match = key.match(/^(\d{4})-(\d{2})/);
  if (!match) return key;
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}
