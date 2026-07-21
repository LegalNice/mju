import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// Keep package names dynamic so Next does not try to bundle the TypeScript
// source of a runtime Pi extension into the web application.
const PI_SUBAGENTS_PACKAGE = ["pi", "-", "subagents"].join("");

/** Resolve bundled runtime packages, independently of the selected workspace. */
export function getPiSubagentsPaths(): { extension: string; skills: string; prompts: string } | null {
  try {
    const packageRoot = dirname(require.resolve(PI_SUBAGENTS_PACKAGE));
    return {
      extension: join(packageRoot, "index.ts"),
      skills: join(packageRoot, "skills"),
      prompts: join(packageRoot, "prompts"),
    };
  } catch {
    return null;
  }
}

export function getPiCliPath(): string | null {
  try {
    const subagentsPackageRoot = dirname(require.resolve(PI_SUBAGENTS_PACKAGE));
    const candidate = join(subagentsPackageRoot, "..", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
