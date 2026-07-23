import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { readStore } from "@/lib/mju-store";
import type { MjuStore } from "@/lib/mju-models";

export type ProjectStoreResult =
  | { cwd: string; store: MjuStore }
  | { response: NextResponse };

export function getProjectStore(cwd: string | null | undefined): ProjectStoreResult {
  if (!cwd || !existsSync(cwd)) {
    return { response: NextResponse.json({ error: "cwd does not exist" }, { status: 400 }) };
  }
  const store = readStore(cwd);
  if (!store) {
    return { response: NextResponse.json({ error: "Mju project not initialized" }, { status: 404 }) };
  }
  return { cwd, store };
}

export function isProjectStore(result: ProjectStoreResult): result is { cwd: string; store: MjuStore } {
  return "store" in result;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidDate(value: unknown): value is string {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidDateTime(value: unknown): value is string {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && isValidDate(value.slice(0, 10));
}

export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function findCase(store: MjuStore, caseId: string) {
  return store.cases.find((caseItem) => caseItem.id === caseId);
}
