import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Keep package names dynamic so Next does not try to bundle the TypeScript
// source of a runtime Pi extension into the web application.
const PI_SUBAGENTS_PACKAGE = ["pi", "-", "subagents"].join("");

function resolvePackageRoot(from: string): string | null {
  try {
    return dirname(createRequire(from).resolve(PI_SUBAGENTS_PACKAGE));
  } catch {
    return null;
  }
}

function findPackageRoot(): string | null {
  // Under Next/Turbopack, import.meta.url points into the bundled output, so
  // resolving from there fails. Fall back to the project root (process.cwd()).
  const candidates = [
    import.meta.url,
    pathToFileURL(join(process.cwd(), "package.json")).href,
  ];
  for (const from of candidates) {
    const root = resolvePackageRoot(from);
    if (root) return root;
  }
  const local = join(process.cwd(), "node_modules", PI_SUBAGENTS_PACKAGE);
  return existsSync(join(local, "package.json")) ? local : null;
}

/** Resolve bundled runtime packages, independently of the selected workspace. */
export function getPiSubagentsPaths(): { extension: string; skills: string; prompts: string } | null {
  const packageRoot = findPackageRoot();
  if (!packageRoot) return null;
  return {
    extension: join(packageRoot, "index.ts"),
    skills: join(packageRoot, "skills"),
    prompts: join(packageRoot, "prompts"),
  };
}

export function getPiCliPath(): string | null {
  const packageRoot = findPackageRoot();
  if (!packageRoot) return null;
  const candidate = join(packageRoot, "..", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
  return existsSync(candidate) ? candidate : null;
}
