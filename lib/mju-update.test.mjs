import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  checkMjuUpdate,
  compareMjuVersions,
  extractReleaseNotes,
  getLastMjuUpdate,
} = await jiti.import("./mju-update.ts");

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("compares release and prerelease Mju versions", () => {
  assert.ok(compareMjuVersions("1.7.4", "1.7.3") > 0);
  assert.ok(compareMjuVersions("1.7.3", "1.7.4") < 0);
  assert.ok(compareMjuVersions("1.7.3", "1.7.3-beta.1") > 0);
  assert.equal(compareMjuVersions("invalid", "1.7.3"), 0);
});

test("extracts one release section from a changelog", () => {
  const changelog = "# 更新日志\n\n## 1.7.4 - 2026-07-30\n\n- 一键更新。\n\n## 1.7.3 - 2026-07-29\n\n- 旧版本。\n";
  assert.equal(extractReleaseNotes(changelog, "1.7.4"), "## 1.7.4 - 2026-07-30\n\n- 一键更新。");
  assert.equal(extractReleaseNotes(changelog, "9.9.9"), null);
});

test("reports an available global update and its remote changelog entry", async () => {
  const calls = [];
  const update = await checkMjuUpdate({
    currentVersion: "1.7.3",
    installMode: "global",
    now: () => new Date("2026-07-29T00:00:00Z"),
    env: {},
    fetcher: async (url) => {
      calls.push(url);
      if (url.includes("registry.npmjs.org")) return jsonResponse({ version: "1.7.4" });
      return new Response("## 1.7.4 - 2026-07-30\n\n- 一键更新。\n\n## 1.7.3 - 2026-07-29\n\n- 旧版本。\n");
    },
  });

  assert.equal(update.state, "update-available");
  assert.equal(update.latestVersion, "1.7.4");
  assert.equal(update.canUpdate, true);
  assert.match(update.releaseNotes, /一键更新/);
  assert.equal(calls.length, 2);
});

test("does not offer in-app update to npx or when already current", async () => {
  const npxUpdate = await checkMjuUpdate({
    currentVersion: "1.7.3",
    installMode: "npx",
    env: {},
    fetcher: async (url) => url.includes("registry.npmjs.org")
      ? jsonResponse({ version: "1.7.4" })
      : new Response("## 1.7.4\n"),
  });
  assert.equal(npxUpdate.state, "update-available");
  assert.equal(npxUpdate.canUpdate, false);

  const current = await checkMjuUpdate({
    currentVersion: "1.7.4",
    installMode: "global",
    env: {},
    fetcher: async () => jsonResponse({ version: "1.7.4" }),
  });
  assert.equal(current.state, "up-to-date");
  assert.equal(current.canUpdate, false);
});

test("keeps only a validated launcher update outcome", () => {
  assert.deepEqual(getLastMjuUpdate({ MJU_UPDATE_RESULT: JSON.stringify({ status: "updated", message: "完成" }) }), {
    status: "updated",
    message: "完成",
    at: undefined,
  });
  assert.equal(getLastMjuUpdate({ MJU_UPDATE_RESULT: "not-json" }), null);
  assert.equal(getLastMjuUpdate({ MJU_UPDATE_RESULT: JSON.stringify({ status: "other" }) }), null);
});
