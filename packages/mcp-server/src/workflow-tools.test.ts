import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { registerWorkflowTools } from "./workflow-tools.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-mcp-workflow-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    // swallow
  }
}

function makeMockServer() {
  const tools: Array<{
    name: string;
    description: string;
    params: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];
  return {
    tools,
    tool(
      name: string,
      description: string,
      params: Record<string, unknown>,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) {
      tools.push({ name, description, params, handler });
    },
  };
}

describe("workflow MCP tools", () => {
  it("registers the eight workflow tools", () => {
    const server = makeMockServer();
    registerWorkflowTools(server as any);

    assert.equal(server.tools.length, 8);
    assert.deepEqual(
      server.tools.map((t) => t.name),
      [
        "gsd_plan_milestone",
        "gsd_plan_slice",
        "gsd_slice_complete",
        "gsd_complete_slice",
        "gsd_summary_save",
        "gsd_task_complete",
        "gsd_complete_task",
        "gsd_milestone_status",
      ],
    );
  });

  it("gsd_summary_save writes artifact through the shared executor", async () => {
    const base = makeTmpBase();
    try {
      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const tool = server.tools.find((t) => t.name === "gsd_summary_save");
      assert.ok(tool, "summary tool should be registered");

      const result = await tool!.handler({
        projectDir: base,
        milestone_id: "M001",
        slice_id: "S01",
        artifact_type: "SUMMARY",
        content: "# Summary\n\nHello",
      });

      const text = (result as any).content[0].text as string;
      assert.match(text, /Saved SUMMARY artifact/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md")),
        "summary file should exist on disk",
      );
    } finally {
      cleanup(base);
    }
  });

  it("gsd_task_complete and gsd_milestone_status work end-to-end", async () => {
    const base = makeTmpBase();
    try {
      mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });
      writeFileSync(
        join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
        "# S01\n\n- [ ] **T01: Demo** `est:5m`\n",
      );

      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const taskTool = server.tools.find((t) => t.name === "gsd_task_complete");
      const statusTool = server.tools.find((t) => t.name === "gsd_milestone_status");
      assert.ok(taskTool, "task tool should be registered");
      assert.ok(statusTool, "status tool should be registered");

      const taskResult = await taskTool!.handler({
        projectDir: base,
        taskId: "T01",
        sliceId: "S01",
        milestoneId: "M001",
        oneLiner: "Completed task",
        narrative: "Did the work",
        verification: "npm test",
      });

      assert.match((taskResult as any).content[0].text as string, /Completed task T01/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md")),
        "task summary should be written to disk",
      );

      const statusResult = await statusTool!.handler({
        projectDir: base,
        milestoneId: "M001",
      });
      const parsed = JSON.parse((statusResult as any).content[0].text as string);
      assert.equal(parsed.milestoneId, "M001");
      assert.equal(parsed.sliceCount, 1);
      assert.equal(parsed.slices[0].id, "S01");
    } finally {
      cleanup(base);
    }
  });

  it("gsd_complete_task alias delegates to gsd_task_complete behavior", async () => {
    const base = makeTmpBase();
    try {
      mkdirSync(join(base, ".gsd", "milestones", "M002", "slices", "S02"), { recursive: true });
      writeFileSync(
        join(base, ".gsd", "milestones", "M002", "slices", "S02", "S02-PLAN.md"),
        "# S02\n\n- [ ] **T02: Demo** `est:5m`\n",
      );

      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const aliasTool = server.tools.find((t) => t.name === "gsd_complete_task");
      assert.ok(aliasTool, "task completion alias should be registered");

      const result = await aliasTool!.handler({
        projectDir: base,
        taskId: "T02",
        sliceId: "S02",
        milestoneId: "M002",
        oneLiner: "Completed task via alias",
        narrative: "Did the work through alias",
        verification: "npm test",
      });

      assert.match((result as any).content[0].text as string, /Completed task T02/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M002", "slices", "S02", "tasks", "T02-SUMMARY.md")),
        "alias should write task summary to disk",
      );
    } finally {
      cleanup(base);
    }
  });

  it("gsd_plan_milestone and gsd_plan_slice work end-to-end", async () => {
    const base = makeTmpBase();
    try {
      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const milestoneTool = server.tools.find((t) => t.name === "gsd_plan_milestone");
      const sliceTool = server.tools.find((t) => t.name === "gsd_plan_slice");
      assert.ok(milestoneTool, "milestone planning tool should be registered");
      assert.ok(sliceTool, "slice planning tool should be registered");

      const milestoneResult = await milestoneTool!.handler({
        projectDir: base,
        milestoneId: "M001",
        title: "Workflow MCP planning",
        vision: "Plan milestone over MCP.",
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
      });
      assert.match((milestoneResult as any).content[0].text as string, /Planned milestone M001/);

      const sliceResult = await sliceTool!.handler({
        projectDir: base,
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
      });
      assert.match((sliceResult as any).content[0].text as string, /Planned slice S01/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md")),
        "slice plan should exist on disk",
      );
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-PLAN.md")),
        "task plan should exist on disk",
      );
    } finally {
      cleanup(base);
    }
  });

  it("gsd_slice_complete and gsd_complete_slice work end-to-end", async () => {
    const base = makeTmpBase();
    try {
      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const milestoneTool = server.tools.find((t) => t.name === "gsd_plan_milestone");
      const sliceTool = server.tools.find((t) => t.name === "gsd_plan_slice");
      const taskTool = server.tools.find((t) => t.name === "gsd_task_complete");
      const canonicalTool = server.tools.find((t) => t.name === "gsd_slice_complete");
      const aliasTool = server.tools.find((t) => t.name === "gsd_complete_slice");
      assert.ok(milestoneTool, "milestone planning tool should be registered");
      assert.ok(sliceTool, "slice planning tool should be registered");
      assert.ok(taskTool, "task completion tool should be registered");
      assert.ok(canonicalTool, "slice completion tool should be registered");
      assert.ok(aliasTool, "slice completion alias should be registered");

      await milestoneTool!.handler({
        projectDir: base,
        milestoneId: "M003",
        title: "Demo milestone",
        vision: "Prepare canonical slice completion state.",
        slices: [
          {
            sliceId: "S03",
            title: "Demo Slice",
            risk: "medium",
            depends: [],
            demo: "Canonical slice completes through MCP.",
            goal: "Seed workflow state.",
            successCriteria: "Slice summary and UAT files are written.",
            proofLevel: "integration",
            integrationClosure: "Planning and completion share the MCP bridge.",
            observabilityImpact: "Workflow tests cover canonical completion.",
          },
        ],
      });
      await sliceTool!.handler({
        projectDir: base,
        milestoneId: "M003",
        sliceId: "S03",
        goal: "Complete canonical slice over MCP.",
        tasks: [
          {
            taskId: "T03",
            title: "Canonical task",
            description: "Seed a completed task for slice completion.",
            estimate: "5m",
            files: ["packages/mcp-server/src/workflow-tools.ts"],
            verify: "node --test",
            inputs: ["M003-ROADMAP.md"],
            expectedOutput: ["S03-SUMMARY.md", "S03-UAT.md"],
          },
        ],
      });
      await taskTool!.handler({
        projectDir: base,
        milestoneId: "M003",
        sliceId: "S03",
        taskId: "T03",
        oneLiner: "Completed canonical task",
        narrative: "Prepared the canonical slice for completion.",
        verification: "node --test",
      });

      const canonicalResult = await canonicalTool!.handler({
        projectDir: base,
        milestoneId: "M003",
        sliceId: "S03",
        sliceTitle: "Demo Slice",
        oneLiner: "Completed canonical slice",
        narrative: "Did the slice work",
        verification: "npm test",
        uatContent: "## UAT\n\nPASS",
      });
      assert.match((canonicalResult as any).content[0].text as string, /Completed slice S03/);
      await milestoneTool!.handler({
        projectDir: base,
        milestoneId: "M004",
        title: "Alias milestone",
        vision: "Prepare alias slice completion state.",
        slices: [
          {
            sliceId: "S04",
            title: "Alias Slice",
            risk: "medium",
            depends: [],
            demo: "Alias slice completes through MCP.",
            goal: "Seed alias workflow state.",
            successCriteria: "Alias summary and UAT files are written.",
            proofLevel: "integration",
            integrationClosure: "Alias reaches the shared slice executor.",
            observabilityImpact: "Workflow tests cover alias completion.",
          },
        ],
      });
      await sliceTool!.handler({
        projectDir: base,
        milestoneId: "M004",
        sliceId: "S04",
        goal: "Complete alias slice over MCP.",
        tasks: [
          {
            taskId: "T04",
            title: "Alias task",
            description: "Seed a completed task for alias slice completion.",
            estimate: "5m",
            files: ["packages/mcp-server/src/workflow-tools.ts"],
            verify: "node --test",
            inputs: ["M004-ROADMAP.md"],
            expectedOutput: ["S04-SUMMARY.md", "S04-UAT.md"],
          },
        ],
      });
      await taskTool!.handler({
        projectDir: base,
        milestoneId: "M004",
        sliceId: "S04",
        taskId: "T04",
        oneLiner: "Completed alias task",
        narrative: "Prepared the alias slice for completion.",
        verification: "node --test",
      });

      const aliasResult = await aliasTool!.handler({
        projectDir: base,
        milestoneId: "M004",
        sliceId: "S04",
        sliceTitle: "Alias Slice",
        oneLiner: "Completed alias slice",
        narrative: "Did the slice work via alias",
        verification: "npm test",
        uatContent: "## UAT\n\nPASS",
      });
      assert.match((aliasResult as any).content[0].text as string, /Completed slice S04/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M004", "slices", "S04", "S04-SUMMARY.md")),
        "alias should write slice summary to disk",
      );
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M004", "slices", "S04", "S04-UAT.md")),
        "alias should write slice UAT to disk",
      );
    } finally {
      cleanup(base);
    }
  });
});
