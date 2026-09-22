import * as mock from "./mock-data";
import type { Connection, Execution, ListResponse, Tool, Toolkit, Trigger } from "./types";

/**
 * Arcane API client.
 *
 * Set VITE_API_BASE_URL (e.g. http://localhost:3001) and VITE_API_KEY to talk
 * to the real service. With no base URL configured the client serves the local
 * mock dataset using the exact same response shapes.
 */
const BASE_URL = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";
const API_KEY = (import.meta.env["VITE_API_KEY"] as string | undefined) ?? "";

export const USING_MOCK_DATA = BASE_URL.trim().length === 0;

const MOCK_LATENCY_MS = 180;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as T;
}

export interface ExecutionQuery {
  status?: string;
  toolkit?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export const api = {
  async health(): Promise<{ status: string }> {
    if (USING_MOCK_DATA) return delay({ status: "ok" });
    return request("/health");
  },

  async listToolkits(): Promise<ListResponse<Toolkit>> {
    if (USING_MOCK_DATA) return delay({ data: mock.getToolkits() });
    return request("/toolkits");
  },

  async getToolkit(slug: string): Promise<Toolkit | undefined> {
    const { data } = await this.listToolkits();
    return data.find((t) => t.slug === slug);
  },

  async listTools(slug: string): Promise<ListResponse<Tool>> {
    if (USING_MOCK_DATA) return delay({ data: mock.getTools(slug) });
    return request(`/toolkits/${encodeURIComponent(slug)}/tools`);
  },

  async listConnections(): Promise<ListResponse<Connection>> {
    if (USING_MOCK_DATA) return delay({ data: mock.getConnections() });
    return request("/connections");
  },

  async listExecutions(query: ExecutionQuery = {}): Promise<ListResponse<Execution>> {
    if (USING_MOCK_DATA) {
      let rows = mock.getExecutions();
      if (query.status && query.status !== "all") rows = rows.filter((r) => r.status === query.status);
      if (query.toolkit && query.toolkit !== "all")
        rows = rows.filter((r) => r.toolkit_slug === query.toolkit);
      if (query.from) rows = rows.filter((r) => r.created_at >= query.from!);
      if (query.to) rows = rows.filter((r) => r.created_at <= `${query.to!}T23:59:59.999Z`);
      return delay({ data: rows, next_cursor: null });
    }
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") params.set(k, String(v));
    });
    const qs = params.toString();
    return request(`/executions${qs ? `?${qs}` : ""}`);
  },

  async getExecution(id: string): Promise<Execution | undefined> {
    if (USING_MOCK_DATA) return delay(mock.getExecutions().find((e) => e.id === id));
    return request(`/executions/${encodeURIComponent(id)}`);
  },

  async listTriggers(): Promise<ListResponse<Trigger>> {
    if (USING_MOCK_DATA) return delay({ data: mock.getTriggers() });
    return request("/triggers");
  },

  async setTriggerStatus(id: string, status: Trigger["status"]): Promise<Trigger | undefined> {
    if (USING_MOCK_DATA) return delay(mock.setTriggerStatus(id, status));
    return request(`/triggers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
};

export const REFETCH_INTERVAL = 30_000;
