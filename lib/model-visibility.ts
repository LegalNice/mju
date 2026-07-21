import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type ModelVisibility = Record<string, Record<string, boolean>>;

function visibilityPath(): string {
  return join(getAgentDir(), "model-visibility.json");
}

export function readModelVisibility(): ModelVisibility {
  try {
    const value = JSON.parse(readFileSync(visibilityPath(), "utf8")) as { providers?: unknown };
    return value.providers && typeof value.providers === "object" ? value.providers as ModelVisibility : {};
  } catch {
    return {};
  }
}

export function writeModelVisibility(providers: ModelVisibility): void {
  const path = visibilityPath();
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ providers }, null, 2), "utf8");
}

export function isModelVisible(visibility: ModelVisibility, provider: string, modelId: string): boolean {
  return visibility[provider]?.[modelId] !== false;
}
