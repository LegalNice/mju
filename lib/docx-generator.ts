import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

export interface DocxGeneratorOptions {
  /** Override the default `<cwd>/templates/legal` template root. */
  templatesDir?: string;
}

const PANDOC_TIMEOUT_MS = 60_000;

/** Default DOCX template root for a project. */
export function defaultTemplatesDir(cwd: string): string {
  return join(cwd, "templates", "legal");
}

/** Resolve the effective templates directory. */
export function resolveTemplatesDir(cwd: string, options?: DocxGeneratorOptions): string {
  return options?.templatesDir ? resolve(options.templatesDir) : resolve(defaultTemplatesDir(cwd));
}

/** Recursively list available .docx templates under the templates directory.
 * Returns relative names without extension, e.g. "civil/民事起诉状（要素式）".
 */
export function listTemplates(cwd: string, options?: DocxGeneratorOptions): string[] {
  const root = resolveTemplatesDir(cwd, options);
  const out: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || out.length >= 100) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".docx")) {
        out.push(full.slice(root.length + 1, -extname(entry.name).length));
      }
    }
  };

  walk(root, 0);
  return out;
}

/** Generate a non-conflicting DOCX output path next to the source markdown. */
export function uniqueDocxPath(sourcePath: string): string {
  const base = sourcePath.replace(/\.md$/i, "");
  let candidate = `${base}.docx`;
  let n = 2;
  while (existsSync(candidate)) {
    candidate = `${base}-${n}.docx`;
    n++;
  }
  return candidate;
}

export interface GenerateDocxOptions {
  sourcePath: string;
  templateName?: string;
  templatesDir?: string;
}

function isValidTemplateName(name: string): boolean {
  return !!name && !name.includes("..") && !name.startsWith("/") && !name.includes("\\");
}

/** Resolve a template name to an absolute path, validating containment. */
export function resolveTemplatePath(templatesDir: string, templateName: string): string {
  if (!isValidTemplateName(templateName)) {
    throw new Error("invalid templateName");
  }
  const root = resolve(templatesDir);
  const templatePath = resolve(join(root, `${templateName}.docx`));
  if (!templatePath.startsWith(root + sep) || !existsSync(templatePath)) {
    throw new Error("template not found");
  }
  return templatePath;
}

/** Run pandoc to convert a markdown file to DOCX.
 * Returns the output path. Throws on pandoc failure or invalid options.
 */
export function generateDocx(options: GenerateDocxOptions): string {
  const { sourcePath, templateName, templatesDir } = options;
  if (!/\.md$/i.test(sourcePath) || !existsSync(sourcePath)) {
    throw new Error("sourcePath must be an existing .md file");
  }

  const args = [sourcePath, "-o", ""] as string[];
  const outputPath = uniqueDocxPath(sourcePath);
  args[2] = outputPath;

  if (templateName) {
    if (!templatesDir) throw new Error("templatesDir required when templateName is given");
    const templatePath = resolveTemplatePath(templatesDir, templateName);
    args.push("--reference-doc", templatePath);
  }

  execFileSync("pandoc", args, { timeout: PANDOC_TIMEOUT_MS, stdio: ["ignore", "ignore", "pipe"] });
  return outputPath;
}
