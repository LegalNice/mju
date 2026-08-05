import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Point the mju root at a temp dir before importing modules that persist stores.
const mjuHome = mkdtempSync(join(tmpdir(), "mju-home-"));
process.env.MJU_HOME = mjuHome;

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { createEmptyStore, DEFAULT_LITIGATION_STAGES } = await jiti.import("./mju-models.ts");
const { readStore, writeStore } = await jiti.import("./mju-store.ts");
const { applyCaseMigration, parseParties, scanLegacyCases } = await jiti.import("./case-migration.ts");

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-migrate-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const store = createEmptyStore("迁移测试");
  writeStore(cwd, store);
  return { cwd, store };
}

function seedCaseFolder(cwd, name, files) {
  const dir = join(cwd, name);
  mkdirSync(dir, { recursive: true });
  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(join(dir, fileName), content ?? "x", "utf8");
  }
  return dir;
}

test("parseParties 解析「诉」与「vs」命名", () => {
  assert.deepEqual(parseParties("张三诉李四买卖合同纠纷"), { plaintiff: "张三", defendant: "李四" });
  assert.deepEqual(parseParties("甲公司 vs 乙公司"), { plaintiff: "甲公司", defendant: "乙公司" });
  assert.deepEqual(
    parseParties("（2024）京01民初123号 张三诉李四 北京市海淀区人民法院"),
    { plaintiff: "张三", defendant: "李四" },
  );
  assert.equal(parseParties("常年法律顾问"), undefined);
});

test("scanLegacyCases 跳过标准结构/隐藏目录/已登记案件，识别案件样文件夹", (t) => {
  const { cwd, store } = makeProject(t);
  mkdirSync(join(cwd, "ops", "cases", "案卷"), { recursive: true });
  mkdirSync(join(cwd, ".obsidian"), { recursive: true });
  mkdirSync(join(cwd, "node_modules"), { recursive: true });
  mkdirSync(join(cwd, "学习笔记"), { recursive: true }); // 无信号，不应命中
  writeFileSync(join(cwd, "学习笔记", "民法笔记.md"), "x");

  const registered = seedCaseFolder(cwd, "已登记案件", { "起诉状.pdf": "" });
  store.cases.push({
    id: "c-registered",
    title: "已登记案件",
    type: "litigation",
    stage: "接案",
    status: "active",
    vaultPath: registered,
    createdAt: new Date().toISOString(),
  });
  writeStore(cwd, store);

  seedCaseFolder(cwd, "张三诉李四借款纠纷", { "起诉状.pdf": "", "证据清单.pdf": "" });
  // 目录名无关键词，但内含 ≥2 份法律文件 → 文件特征命中
  seedCaseFolder(cwd, "2023年那个案子", { "判决书.pdf": "", "委托合同.pdf": "" });
  seedCaseFolder(cwd, "王氏家族常年顾问", { "顾问合同.pdf": "" });

  writeFileSync(join(cwd, "AGENTS.md"), "guidance");
  writeFileSync(join(cwd, "散落的合同扫描件.pdf"), "x");

  const { candidates, looseFiles } = scanLegacyCases(cwd, store);
  const titles = candidates.map((c) => c.title).sort();
  assert.deepEqual(titles, ["2023年那个案子", "张三诉李四借款纠纷", "王氏家族常年顾问"].sort());

  const litigation = candidates.find((c) => c.title === "张三诉李四借款纠纷");
  assert.equal(litigation.type, "litigation");
  assert.deepEqual(litigation.parties, { plaintiff: "张三", defendant: "李四" });
  assert.equal(litigation.stage, DEFAULT_LITIGATION_STAGES[0]);

  const advisory = candidates.find((c) => c.title === "王氏家族常年顾问");
  assert.equal(advisory.type, "advisory");

  assert.deepEqual(looseFiles.map((f) => f.name), ["散落的合同扫描件.pdf"]);
});

test("scanLegacyCases 从文件夹与文件名中提取法院与案号", (t) => {
  const { cwd, store } = makeProject(t);
  seedCaseFolder(cwd, "王五诉赵六合同纠纷 北京市朝阳区人民法院", {
    "（2024）京0105民初5678号判决书.pdf": "",
  });
  const { candidates } = scanLegacyCases(cwd, store);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].court, "北京市朝阳区人民法院");
  assert.equal(candidates[0].caseNumber, "（2024）京0105民初5678号");
});

test("applyCaseMigration 移动文件夹、归类散文件、登记案件并深度归位", (t) => {
  const { cwd, store } = makeProject(t);
  const source = seedCaseFolder(cwd, "张三诉李四借款纠纷", {
    "起诉状.pdf": "",
    "判决书2025-01-10.pdf": "",
    "开庭传票2025-03-01.pdf": "",
    "随手记.txt": "",
  });
  writeFileSync(join(cwd, "补充证据.pdf"), "x");

  const decision = {
    sourcePath: source,
    accept: true,
    title: "张三诉李四借款纠纷",
    type: "litigation",
    status: "active",
    stageIndex: 2,
    parties: { plaintiff: "张三", defendant: "李四" },
    looseFiles: [join(cwd, "补充证据.pdf")],
  };
  const result = applyCaseMigration(cwd, store, [decision]);

  assert.equal(result.casesCreated, 1);
  const item = result.items[0];
  assert.equal(item.ok, true, item.error);
  assert.equal(existsSync(source), false, "源文件夹应被移走");

  const target = join(cwd, "ops", "cases", "案卷", "张三诉李四借款纠纷");
  assert.equal(item.targetPath, target);
  for (const dir of ["任务", "期限", "日程", "材料", "分析", "文书", "工作包", "大事记"]) {
    assert.equal(existsSync(join(target, dir)), true, `缺少骨架目录 ${dir}`);
  }
  assert.equal(existsSync(join(target, "张三诉李四借款纠纷.md")), true, "缺少案件主文件");

  // 散文件归类：起诉状→文书/，其余→材料/，根目录不再有散文件
  assert.equal(existsSync(join(target, "文书", "起诉状.pdf")), true);
  assert.equal(existsSync(join(target, "材料", "判决书2025-01-10.pdf")), true);
  assert.equal(existsSync(join(target, "材料", "开庭传票2025-03-01.pdf")), true);
  assert.equal(existsSync(join(target, "材料", "随手记.txt")), true);
  assert.equal(existsSync(join(target, "材料", "补充证据.pdf")), true, "散落文件应并入材料");
  const rootLeftovers = readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== "张三诉李四借款纠纷.md");
  assert.equal(rootLeftovers.length, 0);

  // store 登记
  const persisted = readStore(cwd);
  assert.equal(persisted.cases.length, 1);
  const caseItem = persisted.cases[0];
  assert.equal(caseItem.title, "张三诉李四借款纠纷");
  assert.equal(caseItem.type, "litigation");
  assert.equal(caseItem.stageIndex, 2);
  assert.equal(caseItem.stage, DEFAULT_LITIGATION_STAGES[2]);
  assert.equal(caseItem.stageHistory.length, 1);
  assert.equal(caseItem.vaultPath, target);
  assert.deepEqual(caseItem.parties, { plaintiff: "张三", defendant: "李四" });

  // 期限推断：判决书+15日上诉期、传票法院期限
  assert.equal(result.deadlinesCreated, 2);
  const deadlineTitles = persisted.deadlines.map((d) => d.title);
  assert.ok(deadlineTitles.some((title) => title.includes("上诉期届满")));
  assert.ok(persisted.deadlines.every((d) => d.status === "proposed" && existsSync(d.vaultPath)));

  // 日程推断：开庭传票带日期
  assert.equal(result.schedulesCreated, 1);
  assert.equal(persisted.schedules.length, 1);
  assert.match(persisted.schedules[0].datetime, /^2025-03-01T09:00:00/);
  assert.equal(persisted.schedules[0].type, "court-hearing");
  assert.equal(
    readdirSync(join(target, "日程")).filter((name) => name.endsWith(".md")).length,
    1,
  );

  // 大事记留痕 + 核对任务
  const chronicles = readdirSync(join(target, "大事记")).filter((name) => name.endsWith(".md"));
  assert.equal(chronicles.length, 1);
  assert.match(chronicles[0], /导入既有案卷/);
  assert.equal(result.reviewTasksCreated, 1);
  assert.equal(persisted.tasks.length, 1);
  assert.equal(persisted.tasks[0].title, "核对既有案卷整理结果");
  assert.equal(existsSync(persisted.tasks[0].vaultPath), true);

  // 幂等：再次扫描不应再命中已迁移文件夹
  const rescan = scanLegacyCases(cwd, persisted);
  assert.equal(rescan.candidates.length, 0);
});

test("applyCaseMigration 目标重名时加序号、绝不覆盖", (t) => {
  const { cwd, store } = makeProject(t);
  const existing = join(cwd, "ops", "cases", "案卷", "旧案");
  mkdirSync(existing, { recursive: true });
  writeFileSync(join(existing, "原始文件.txt"), "不要动我");
  const source = seedCaseFolder(cwd, "旧案", { "起诉状.pdf": "" });

  const result = applyCaseMigration(cwd, store, [{
    sourcePath: source,
    accept: true,
    title: "旧案",
    type: "litigation",
    status: "active",
    stageIndex: 0,
  }]);

  assert.equal(result.items[0].ok, true, result.items[0].error);
  assert.match(result.items[0].targetPath, /旧案-2$/);
  assert.equal(existsSync(join(existing, "原始文件.txt")), true, "既有文件夹内容不得被覆盖");
});

test("applyCaseMigration 未勾选项跳过、单案失败不影响其余", (t) => {
  const { cwd, store } = makeProject(t);
  const good = seedCaseFolder(cwd, "好案 甲诉乙", { "起诉状.pdf": "" });

  const result = applyCaseMigration(cwd, store, [
    { sourcePath: join(cwd, "不勾选的案"), accept: false, title: "x", type: "litigation", status: "active" },
    { sourcePath: join(cwd, "根本不存在的案"), accept: true, title: "坏案", type: "litigation", status: "active" },
    { sourcePath: good, accept: true, title: "甲诉乙", type: "litigation", status: "active", stageIndex: 0 },
  ]);

  assert.equal(result.items[0].ok, false);
  assert.equal(result.items[0].error, "skipped");
  assert.equal(result.items[1].ok, false);
  assert.match(result.items[1].error, /源文件夹不存在/);
  assert.equal(result.items[2].ok, true, result.items[2].error);
  assert.equal(result.casesCreated, 1);
});
