import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  openDatabase,
  closeDatabase,
  _getAdapter,
} from "../gsd-db.ts";
import {
  executeSummarySave,
  executeTaskComplete,
  executeMilestoneStatus,
  executePlanMilestone,
  executePlanSlice,
  executeSliceComplete,
} from "../tools/workflow-tool-executors.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-workflow-executors-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* swallow */ }
}

function openTestDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

async function inProjectDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

function seedMilestone(milestoneId: string, title: string, status = "active"): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)",
  ).run(milestoneId, title, status, new Date().toISOString());
}

function seedSlice(milestoneId: string, sliceId: string, status: string): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO slices (milestone_id, id, title, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(milestoneId, sliceId, `Slice ${sliceId}`, status, new Date().toISOString());
}

function writeRoadmap(base: string, milestoneId: string, sliceIds: string[]): void {
  const milestoneDir = join(base, ".gsd", "milestones", milestoneId);
  mkdirSync(milestoneDir, { recursive: true });
  const lines = [
    `# ${milestoneId}: Workflow MCP planning`,
    "",
    "## Slices",
    "",
    ...sliceIds.map((sliceId) => `- [ ] **${sliceId}: Slice ${sliceId}** \`risk:medium\` \`depends:[]\`\n  - After this: demo`),
    "",
  ];
  writeFileSync(join(milestoneDir, `${milestoneId}-ROADMAP.md`), lines.join("\n"));
}

test("executeSummarySave persists artifact and returns computed path", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    const result = await inProjectDir(base, () => executeSummarySave({
      milestone_id: "M001",
      slice_id: "S01",
      artifact_type: "SUMMARY",
      content: "# Summary\n\ncontent",
    }, base));

    assert.equal(result.details.operation, "save_summary");
    assert.equal(result.details.path, "milestones/M001/slices/S01/S01-SUMMARY.md");

    const filePath = join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md");
    assert.ok(existsSync(filePath), "summary artifact should be written to disk");
    assert.match(readFileSync(filePath, "utf-8"), /# Summary/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executeTaskComplete coerces string verificationEvidence entries", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    const planDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "S01-PLAN.md"), "# S01\n\n- [ ] **T01: Demo** `est:5m`\n");

    const result = await inProjectDir(base, () => executeTaskComplete({
      milestoneId: "M001",
      sliceId: "S01",
      taskId: "T01",
      oneLiner: "Completed task",
      narrative: "Did the work",
      verification: "npm test",
      verificationEvidence: ["npm test"],
    }, base));

    assert.equal(result.details.operation, "complete_task");
    assert.equal(result.details.taskId, "T01");

    const db = _getAdapter();
    assert.ok(db, "DB should be open");
    const rows = db!.prepare(
      "SELECT command, exit_code, verdict, duration_ms FROM verification_evidence WHERE milestone_id = ? AND slice_id = ? AND task_id = ?",
    ).all("M001", "S01", "T01") as Array<Record<string, unknown>>;

    assert.equal(rows.length, 1, "one coerced verification evidence row should be inserted");
    assert.equal(rows[0]["command"], "npm test");
    assert.equal(rows[0]["exit_code"], -1);
    assert.match(String(rows[0]["verdict"]), /coerced from string/);

    const summaryPath = String(result.details.summaryPath);
    assert.ok(existsSync(summaryPath), "task summary should be written to disk");
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executeMilestoneStatus returns milestone metadata and slice counts", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Milestone One");
    seedSlice("M001", "S01", "active");
    const db = _getAdapter();
    db!.prepare(
      "INSERT OR REPLACE INTO tasks (milestone_id, slice_id, id, title, status) VALUES (?, ?, ?, ?, ?)",
    ).run("M001", "S01", "T01", "Task T01", "pending");

    const result = await inProjectDir(base, () => executeMilestoneStatus({ milestoneId: "M001" }));
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.milestoneId, "M001");
    assert.equal(parsed.title, "Milestone One");
    assert.equal(parsed.sliceCount, 1);
    assert.equal(parsed.slices[0].id, "S01");
    assert.equal(parsed.slices[0].taskCounts.pending, 1);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executePlanMilestone writes roadmap state and rendered roadmap path", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);

    const result = await inProjectDir(base, () => executePlanMilestone({
      milestoneId: "M001",
      title: "Workflow MCP planning",
      vision: "Plan milestone over shared executors.",
      slices: [
        {
          sliceId: "S01",
          title: "Bridge planning",
          risk: "medium",
          depends: [],
          demo: "Milestone plan persists through MCP.",
          goal: "Persist roadmap state.",
          successCriteria: "ROADMAP.md renders from DB.",
          proofLevel: "integration",
          integrationClosure: "Prompts and MCP call the same handler.",
          observabilityImpact: "Executor tests cover output paths.",
        },
      ],
    }, base));

    assert.equal(result.details.operation, "plan_milestone");
    assert.equal(result.details.milestoneId, "M001");
    const roadmapPath = String(result.details.roadmapPath);
    assert.ok(existsSync(roadmapPath), "roadmap should be rendered to disk");
    assert.match(readFileSync(roadmapPath, "utf-8"), /Workflow MCP planning/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executePlanSlice writes task planning state and rendered plan artifacts", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    await inProjectDir(base, () => executePlanMilestone({
      milestoneId: "M001",
      title: "Workflow MCP planning",
      vision: "Plan milestone over shared executors.",
      slices: [
        {
          sliceId: "S01",
          title: "Bridge planning",
          risk: "medium",
          depends: [],
          demo: "Milestone plan persists through MCP.",
          goal: "Persist roadmap state.",
          successCriteria: "ROADMAP.md renders from DB.",
          proofLevel: "integration",
          integrationClosure: "Prompts and MCP call the same handler.",
          observabilityImpact: "Executor tests cover output paths.",
        },
      ],
    }, base));

    const result = await inProjectDir(base, () => executePlanSlice({
      milestoneId: "M001",
      sliceId: "S01",
      goal: "Persist slice plan over MCP.",
      tasks: [
        {
          taskId: "T01",
          title: "Add planning bridge",
          description: "Implement the shared executor path.",
          estimate: "15m",
          files: ["src/resources/extensions/gsd/tools/workflow-tool-executors.ts"],
          verify: "node --test",
          inputs: ["ROADMAP.md"],
          expectedOutput: ["S01-PLAN.md", "T01-PLAN.md"],
        },
      ],
    }, base));

    assert.equal(result.details.operation, "plan_slice");
    assert.equal(result.details.sliceId, "S01");
    const planPath = String(result.details.planPath);
    assert.ok(existsSync(planPath), "slice plan should be rendered to disk");
    assert.match(readFileSync(planPath, "utf-8"), /Persist slice plan over MCP/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executeSliceComplete coerces string enrichment entries and writes summary/UAT artifacts", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Milestone One");
    seedSlice("M001", "S01", "pending");
    writeRoadmap(base, "M001", ["S01"]);
    const db = _getAdapter();
    db!.prepare(
      "INSERT OR REPLACE INTO tasks (milestone_id, slice_id, id, title, status) VALUES (?, ?, ?, ?, ?)",
    ).run("M001", "S01", "T01", "Task T01", "complete");

    const result = await inProjectDir(base, () => executeSliceComplete({
      milestoneId: "M001",
      sliceId: "S01",
      sliceTitle: "Slice S01",
      oneLiner: "Completed slice",
      narrative: "Implemented the slice",
      verification: "node --test",
      uatContent: "## UAT\n\nPASS",
      provides: "shared executor path",
      requirementsAdvanced: ["R001 - added slice completion support"],
      filesModified: ["src/file.ts - updated logic"],
      requires: ["S00 - upstream context"],
    }, base));

    assert.equal(result.details.operation, "complete_slice");
    const summaryPath = String(result.details.summaryPath);
    const uatPath = String(result.details.uatPath);
    assert.ok(existsSync(summaryPath), "slice summary should be written to disk");
    assert.ok(existsSync(uatPath), "slice UAT should be written to disk");
    assert.match(readFileSync(summaryPath, "utf-8"), /shared executor path/);
    assert.match(readFileSync(summaryPath, "utf-8"), /R001/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});
