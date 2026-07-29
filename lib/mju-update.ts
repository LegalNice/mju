import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MJU_PACKAGE = "@tttangerine/mju";
const REGISTRY_URL = "https://registry.npmjs.org/@tttangerine%2fmju/latest";
const CHANGELOG_URL = "https://raw.githubusercontent.com/LegalNice/mju/v{version}/CHANGELOG.md";
const CHECK_TIMEOUT_MS = 4_000;
const CACHE_MS = 30 * 60 * 1_000;

export type MjuInstallMode = "global" | "npx" | "local" | "unknown";
export type MjuUpdateState = "up-to-date" | "update-available" | "unavailable";

export interface MjuUpdateOutcome {
  status: "updated" | "failed";
  message?: string;
  at?: string;
}

export interface MjuUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  state: MjuUpdateState;
  installMode: MjuInstallMode;
  canUpdate: boolean;
  releaseNotes: string | null;
  checkedAt: string;
  message?: string;
  lastUpdate: MjuUpdateOutcome | null;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface CheckOptions {
  currentVersion?: string;
  installMode?: MjuInstallMode;
  fetcher?: Fetcher;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

let cached: { expiresAt: number; info: MjuUpdateInfo } | null = null;

export function getMjuVersion(cwd = process.cwd()): string {
  try {
    const packagePath = join(cwd, "package.json");
    if (!existsSync(packagePath)) return "";
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "";
  } catch {
    return "";
  }
}

export function getMjuInstallMode(env: NodeJS.ProcessEnv = process.env): MjuInstallMode {
  const value = env.MJU_INSTALL_MODE;
  return value === "global" || value === "npx" || value === "local" ? value : "unknown";
}

export function getLastMjuUpdate(env: NodeJS.ProcessEnv = process.env): MjuUpdateOutcome | null {
  try {
    const parsed = JSON.parse(env.MJU_UPDATE_RESULT ?? "") as Partial<MjuUpdateOutcome>;
    if (parsed.status !== "updated" && parsed.status !== "failed") return null;
    return {
      status: parsed.status,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      at: typeof parsed.at === "string" ? parsed.at : undefined,
    };
  } catch {
    return null;
  }
}

function parseVersion(value: string): { parts: number[]; prerelease: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ?? null };
}

/** Positive when `left` is newer than `right`. */
export function compareMjuVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < a.parts.length; index++) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function extractReleaseNotes(changelog: string, version: string): string | null {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##\\s+${escaped}(?:\\s|$).*`, "m");
  const match = heading.exec(changelog);
  if (!match || match.index === undefined) return null;
  const afterHeading = match.index + match[0].length;
  const nextHeading = changelog.slice(afterHeading).search(/^##\s+/m);
  return changelog.slice(match.index, nextHeading < 0 ? undefined : afterHeading + nextHeading).trim() || null;
}

async function fetchRemoteNotes(version: string, fetcher: Fetcher): Promise<string | null> {
  try {
    const response = await fetcher(CHANGELOG_URL.replace("{version}", encodeURIComponent(version)), {
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return extractReleaseNotes(await response.text(), version);
  } catch {
    return null;
  }
}

export async function checkMjuUpdate(options: CheckOptions = {}): Promise<MjuUpdateInfo> {
  const now = options.now ?? (() => new Date());
  const currentVersion = options.currentVersion ?? getMjuVersion();
  const installMode = options.installMode ?? getMjuInstallMode(options.env);
  const lastUpdate = getLastMjuUpdate(options.env);
  const timestamp = now().toISOString();
  const useCache = !options.fetcher && !options.currentVersion && !options.installMode && !options.env;

  if (useCache && cached && cached.expiresAt > Date.now()) return { ...cached.info, lastUpdate };
  if (!currentVersion) {
    return { currentVersion: "", latestVersion: null, state: "unavailable", installMode, canUpdate: false, releaseNotes: null, checkedAt: timestamp, message: "无法识别当前版本", lastUpdate };
  }

  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(REGISTRY_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
    const payload = await response.json() as { version?: unknown };
    if (typeof payload.version !== "string") throw new Error("Registry returned no version");

    const hasUpdate = compareMjuVersions(payload.version, currentVersion) > 0;
    const info: MjuUpdateInfo = {
      currentVersion,
      latestVersion: payload.version,
      state: hasUpdate ? "update-available" : "up-to-date",
      installMode,
      canUpdate: hasUpdate && installMode === "global",
      releaseNotes: hasUpdate ? await fetchRemoteNotes(payload.version, fetcher) : null,
      checkedAt: timestamp,
      lastUpdate,
    };
    if (useCache) cached = { expiresAt: Date.now() + CACHE_MS, info };
    return info;
  } catch {
    return {
      currentVersion,
      latestVersion: null,
      state: "unavailable",
      installMode,
      canUpdate: false,
      releaseNotes: null,
      checkedAt: timestamp,
      message: "暂时无法连接 npm Registry",
      lastUpdate,
    };
  }
}
