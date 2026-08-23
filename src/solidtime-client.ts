import { requestUrl } from "obsidian";
import type { SolidTimeQuery } from "./solidtime-query";

/**
 * Minimal SolidTime read client.
 *
 * Uses Obsidian's requestUrl rather than fetch: the renderer runs in a browser
 * context, and a plain fetch to app.solidtime.io would be blocked by CORS.
 *
 * Read-only by design — a note that renders time should never be able to
 * change it.
 */

const API_BASE = "https://app.solidtime.io/api/v1";

export interface SolidTimeClientRef { id: string; name: string }
export interface SolidTimeProjectRef { id: string; name: string; clientId: string | null }
export interface SolidTimeMembership { memberId: string; organizationId: string; currency: string }

export interface SolidTimeEntry {
  start: string;
  durationSeconds: number;
  description: string | null;
  projectId: string | null;
  billable: boolean;
}

export interface AggregateGroup {
  key: string | null;
  seconds: number;
  cost: number | null;
  grouped_data?: AggregateGroup[] | null;
}

export class SolidTimeError extends Error {}

export class SolidTimeApi {
  private membership: SolidTimeMembership | null = null;
  private index: { clients: SolidTimeClientRef[]; projects: SolidTimeProjectRef[] } | null = null;

  constructor(private apiKey: string, private organizationId?: string) {}

  private async get<T>(path: string, what: string): Promise<T> {
    if (!this.apiKey) throw new SolidTimeError("Kein SolidTime-API-Key in den Einstellungen hinterlegt.");
    const response = await requestUrl({
      url: `${API_BASE}${path}`,
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` },
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      // The body names the rejected field on a 422 and the allowed methods on a
      // 405; without it every failure looks identical.
      const detail = (response.text ?? "").slice(0, 300).replace(/\s+/g, " ").trim();
      throw new SolidTimeError(`${what} (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return (response.json as { data: T }).data;
  }

  async getMembership(): Promise<SolidTimeMembership> {
    if (this.membership) return this.membership;
    const memberships = await this.get<Array<Record<string, unknown>>>(
      "/users/me/memberships",
      "Mitgliedschaften konnten nicht gelesen werden",
    );
    const wanted = this.organizationId?.trim();
    const match = memberships.find(
      (m) => !wanted || (m.organization as { id?: string } | undefined)?.id === wanted,
    );
    if (!match) {
      const seen = memberships
        .map((m) => (m.organization as { id?: string } | undefined)?.id)
        .filter(Boolean)
        .join(", ");
      throw new SolidTimeError(
        `Keine SolidTime-Mitgliedschaft${wanted ? ` für Organisation '${wanted}'` : ""}. Gefunden: ${seen || "keine"}.`,
      );
    }
    const organization = match.organization as { id: string; currency: string };
    this.membership = {
      memberId: String(match.id),
      organizationId: organization.id,
      currency: organization.currency,
    };
    return this.membership;
  }

  /** Clients and projects, fetched once per render cycle and reused. */
  async getIndex(): Promise<{ clients: SolidTimeClientRef[]; projects: SolidTimeProjectRef[] }> {
    if (this.index) return this.index;
    const { organizationId } = await this.getMembership();
    const [clients, projects] = await Promise.all([
      this.get<Array<Record<string, unknown>>>(`/organizations/${organizationId}/clients`, "Kunden konnten nicht gelesen werden"),
      this.get<Array<Record<string, unknown>>>(`/organizations/${organizationId}/projects`, "Projekte konnten nicht gelesen werden"),
    ]);
    this.index = {
      clients: clients.map((c) => ({ id: String(c.id), name: String(c.name ?? "") })),
      projects: projects.map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        clientId: p.client_id ? String(p.client_id) : null,
      })),
    };
    return this.index;
  }

  async aggregate(query: SolidTimeQuery, clientIds: string[], group: string, subGroup?: string): Promise<AggregateGroup> {
    const { organizationId, memberId } = await this.getMembership();
    const params = new URLSearchParams({ member_id: memberId, group });
    if (subGroup) params.set("sub_group", subGroup);
    if (query.since) params.set("start", `${query.since}T00:00:00Z`);
    if (query.until) params.set("end", `${query.until}T23:59:59Z`);
    if (query.billable !== undefined) params.set("billable", String(query.billable));
    for (const id of clientIds) params.append("client_ids[]", id);
    return this.get<AggregateGroup>(
      `/organizations/${organizationId}/time-entries/aggregate?${params}`,
      "Zeiten konnten nicht aggregiert werden",
    );
  }

  async entries(query: SolidTimeQuery): Promise<SolidTimeEntry[]> {
    const { organizationId, memberId } = await this.getMembership();
    const params = new URLSearchParams({ member_id: memberId, limit: String(query.limit) });
    if (query.since) params.set("after", `${query.since}T00:00:00Z`);
    if (query.until) params.set("before", `${query.until}T23:59:59Z`);
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/organizations/${organizationId}/time-entries?${params}`,
      "Zeiteinträge konnten nicht gelesen werden",
    );
    return raw.map((e) => ({
      start: String(e.start ?? ""),
      durationSeconds: Number(e.duration ?? 0),
      description: e.description ? String(e.description) : null,
      projectId: e.project_id ? String(e.project_id) : null,
      billable: Boolean(e.billable),
    }));
  }
}
