import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import type DeskleafPlugin from "./main";
import { SolidTimeApi, SolidTimeError, type SolidTimeClientRef, type SolidTimeProjectRef } from "./solidtime-client";
import {
  parseSolidTimeQuery, SolidTimeQueryError, roundHours, centsToEur, formatHours, formatEur,
  totalRow, monthLabel, type SolidTimeQuery, type SolidTimeRow,
} from "./solidtime-query";

/**
 * Renders a ```solidtime block into a table, the way dataview renders its own.
 *
 * The block is re-run on every render of the note rather than cached: tracked
 * time changes while the note stays open, and a stale number is worse than a
 * short wait.
 */
export function registerSolidTimeBlock(plugin: DeskleafPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("solidtime", async (source, el, ctx) => {
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);
    await renderSolidTime(plugin, source, el, ctx);
  });
}

/** The customer a note is about, so a block inside it need not repeat the name. */
function noteCustomer(plugin: DeskleafPlugin, ctx: MarkdownPostProcessorContext): string | undefined {
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return undefined;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  if (fm?.type !== "kunde") return undefined;
  return typeof fm.title === "string" ? fm.title : file.basename;
}

function notice(el: HTMLElement, cls: string, text: string): void {
  el.createDiv({ cls: `dl-solidtime-notice ${cls}`, text });
}

async function renderSolidTime(
  plugin: DeskleafPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  el.empty();
  el.addClass("dl-solidtime");

  let query: SolidTimeQuery;
  try {
    query = parseSolidTimeQuery(source, new Date(), noteCustomer(plugin, ctx));
  } catch (error) {
    notice(el, "dl-solidtime-notice--error", error instanceof SolidTimeQueryError
      ? error.message
      : String(error));
    return;
  }

  const { apiKey, organizationId } = plugin.settings.solidtime;
  if (!apiKey) {
    notice(el, "dl-solidtime-notice--hint", "Kein SolidTime-API-Key hinterlegt — Einstellungen → Deskleaf → SolidTime.");
    return;
  }

  const loading = el.createDiv({ cls: "dl-solidtime-notice", text: "SolidTime …" });
  const api = new SolidTimeApi(apiKey, organizationId);

  try {
    const { rows, columns } = await runQuery(api, query);
    loading.remove();
    if (rows.length === 0) {
      notice(el, "dl-solidtime-notice--hint", "Keine Zeiten für diese Abfrage.");
      return;
    }
    renderTable(el, rows, columns);
  } catch (error) {
    loading.remove();
    notice(el, "dl-solidtime-notice--error", error instanceof SolidTimeError || error instanceof SolidTimeQueryError
      ? error.message
      : `SolidTime: ${String(error)}`);
  }
}

type Columns = "label" | "entries";

/** Resolves the query's client filter to SolidTime client ids. */
function resolveClientIds(query: SolidTimeQuery, clients: SolidTimeClientRef[]): string[] {
  if (!query.client) return [];
  const wanted = query.client.toLocaleLowerCase();
  const matches = clients.filter((c) => c.name.toLocaleLowerCase() === wanted);
  if (matches.length === 0) {
    throw new SolidTimeQueryError(`In SolidTime gibt es keinen Kunden '${query.client}'.`);
  }
  return matches.map((c) => c.id);
}

async function runQuery(api: SolidTimeApi, query: SolidTimeQuery): Promise<{ rows: SolidTimeRow[]; columns: Columns }> {
  const { clients, projects } = await api.getIndex();
  const clientIds = resolveClientIds(query, clients);

  if (query.view === "entries") {
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const clientOfProject = new Map(projects.map((p) => [p.id, p.clientId]));
    const wanted = new Set(clientIds);
    const entries = (await api.entries(query))
      .filter((e) => wanted.size === 0 || (e.projectId !== null && wanted.has(clientOfProject.get(e.projectId) ?? "")))
      .filter((e) => query.billable === undefined || e.billable === query.billable)
      .filter((e) => !query.project || projectNames.get(e.projectId ?? "")?.toLocaleLowerCase() === query.project.toLocaleLowerCase());
    return {
      columns: "entries",
      rows: entries.map((e) => ({
        date: e.start.slice(0, 10),
        label: projectNames.get(e.projectId ?? "") ?? "(ohne Projekt)",
        description: e.description ?? "",
        hours: roundHours(e.durationSeconds),
        amountEur: null,
      })),
    };
  }

  const group = query.view === "by-month" ? "month" : query.view === "by-project" ? "project" : "client";
  const aggregate = await api.aggregate(query, clientIds, group);
  const names = new Map<string, string>([
    ...clients.map((c) => [c.id, c.name] as [string, string]),
    ...projects.map((p) => [p.id, p.name] as [string, string]),
  ]);

  const rows = (aggregate.grouped_data ?? []).map((entry) => ({
    label: entry.key === null
      ? "(ohne Zuordnung)"
      : query.view === "by-month" ? monthLabel(entry.key) : names.get(entry.key) ?? entry.key,
    hours: roundHours(entry.seconds),
    amountEur: centsToEur(entry.cost),
  }));
  return { columns: "label", rows };
}

function renderTable(el: HTMLElement, rows: SolidTimeRow[], columns: Columns): void {
  const table = el.createEl("table", { cls: "dl-solidtime-table" });
  const head = table.createEl("thead").createEl("tr");
  const headers = columns === "entries"
    ? ["Datum", "Projekt", "Beschreibung", "Stunden"]
    : ["", "Stunden", "Betrag"];
  for (const [i, label] of headers.entries()) {
    head.createEl("th", { text: label, cls: i >= headers.length - (columns === "entries" ? 1 : 2) ? "dl-num" : "" });
  }

  const body = table.createEl("tbody");
  for (const row of rows) {
    const tr = body.createEl("tr");
    if (columns === "entries") {
      tr.createEl("td", { text: row.date ?? "", cls: "dl-st-date" });
      tr.createEl("td", { text: row.label });
      tr.createEl("td", { text: row.description ?? "" });
      tr.createEl("td", { text: formatHours(row.hours), cls: "dl-num" });
    } else {
      tr.createEl("td", { text: row.label });
      tr.createEl("td", { text: formatHours(row.hours), cls: "dl-num" });
      tr.createEl("td", { text: formatEur(row.amountEur), cls: "dl-num" });
    }
  }

  // A single row is its own total; repeating it adds noise, not information.
  if (rows.length < 2) return;
  const total = totalRow(rows);
  const foot = table.createEl("tfoot").createEl("tr");
  if (columns === "entries") {
    foot.createEl("td", { text: "Summe", attr: { colspan: "3" } });
    foot.createEl("td", { text: formatHours(total.hours), cls: "dl-num" });
  } else {
    foot.createEl("td", { text: "Summe" });
    foot.createEl("td", { text: formatHours(total.hours), cls: "dl-num" });
    foot.createEl("td", { text: formatEur(total.amountEur), cls: "dl-num" });
  }
}
