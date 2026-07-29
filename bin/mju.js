#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn, spawnSync } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseLaunchOptions } = require("./mju-options");

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");
const RESTART_AFTER_UPDATE = 75;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

// Resolve next's CLI entry directly to avoid relying on .bin symlinks (which
// may not exist when installed via npx).
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
} catch {
  // Fallback: locate next package root and derive the bin path manually.
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
    nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
  } catch {
    nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
  }
}

const { port, hostname, openBrowser } = parseLaunchOptions();

if (!fs.existsSync(nextDir)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

const nextArgs = ["start", "-p", port];
if (hostname) nextArgs.push("-H", hostname);

function canonicalPath(target) {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
}

function detectInstallMode() {
  // npx places transient packages inside npm's `_npx` cache. This check avoids
  // accidentally treating a temporary execution as an updatable global install.
  if (pkgDir.includes(`${path.sep}_npx${path.sep}`)) return "npx";
  // A source checkout, including one exposed through `npm link`, must keep its
  // development data and workflow separate from the globally published app.
  if (fs.existsSync(path.join(pkgDir, ".git"))) return "local";
  try {
    const result = spawnSync(npmCommand, ["root", "-g"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0 && result.stdout) {
      const globalPackage = path.join(result.stdout.trim(), "@tttangerine", "mju");
      if (canonicalPath(globalPackage) === canonicalPath(pkgDir)) return "global";
    }
  } catch { /* A local source checkout remains safe even if npm is unavailable. */ }
  return process.env.npm_execpath?.includes("npx") ? "npx" : "local";
}

function encodeUpdateResult(status, message) {
  return JSON.stringify({ status, message, at: new Date().toISOString() });
}

function installLatest() {
  return new Promise((resolve) => {
    console.log("\n正在更新 Mju…");
    const updater = spawn(npmCommand, ["install", "-g", "@tttangerine/mju@latest", "--no-audit", "--no-fund"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    updater.once("error", (error) => resolve({ status: "failed", message: error.message }));
    updater.once("exit", (code) => {
      resolve(code === 0
        ? { status: "updated", message: "已更新到最新版本" }
        : { status: "failed", message: `npm 更新失败（退出码 ${code ?? "未知"}）` });
    });
  });
}

let browserOpened = false;
const url = `http://${hostname ?? "localhost"}:${port}`;
const installMode = detectInstallMode();
let updateResult = "";

function startServer() {
  // Always run next's JS entry with node directly — avoids .bin symlink issues
  // and path-with-spaces problems on Windows when shell: true is used.
  const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: pkgDir,
    stdio: ["inherit", "pipe", "inherit"],
    env: {
      ...process.env,
      MJU_INSTALL_MODE: installMode,
      MJU_UPDATE_RESTART_CODE: String(RESTART_AFTER_UPDATE),
      MJU_UPDATE_RESULT: updateResult,
    },
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (openBrowser && !browserOpened && text.includes("Ready")) {
      browserOpened = true;
      const isWindows = process.platform === "win32";
      const isMac = process.platform === "darwin";
      const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
      const opener = spawn(openCmd, [url], {
        shell: isWindows,
        stdio: "ignore",
        detached: true,
      });

      opener.on("error", (error) => {
        console.warn(`Could not open browser automatically: ${error.message}`);
      });
      opener.unref();
    }
  });

  child.on("exit", async (code) => {
    if (code !== RESTART_AFTER_UPDATE) {
      process.exit(code ?? 0);
      return;
    }
    if (installMode !== "global") {
      updateResult = encodeUpdateResult("failed", "当前运行方式不支持应用内更新");
      startServer();
      return;
    }
    const outcome = await installLatest();
    updateResult = encodeUpdateResult(outcome.status, outcome.message);
    startServer();
  });
}

startServer();
