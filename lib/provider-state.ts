import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface ProviderState {
  deleted?: string[];
}

function statePath(): string {
  return join(getAgentDir(), "provider-state.json");
}

function readState(): ProviderState {
  try { return JSON.parse(readFileSync(statePath(), "utf8")) as ProviderState; }
  catch { return {}; }
}

export function isProviderDeleted(provider: string): boolean {
  return new Set(readState().deleted ?? []).has(provider);
}

export function setProviderDeleted(provider: string, deleted: boolean): void {
  const state = readState();
  const values = new Set(state.deleted ?? []);
  if (deleted) values.add(provider); else values.delete(provider);
  const path = statePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...state, deleted: [...values].sort() }, null, 2), "utf8");
}
