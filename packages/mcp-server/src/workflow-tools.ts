/**
 * Workflow MCP tools — exposes the core GSD mutation/read handlers over MCP.
 */

import { z } from "zod";

const SUMMARY_ARTIFACT_TYPES = ["SUMMARY", "RESEARCH", "CONTEXT", "ASSESSMENT", "CONTEXT-DRAFT"] as const;

type WorkflowToolExecutors = {
  SUPPORTED_SUMMARY_ARTIFACT_TYPES: readonly string[];
  executeMilestoneStatus: (params: { milestoneId: string }) => Promise<unknown>;
  executePlanMilestone: (
    params: {
      milestoneId: string;
      title: string;
      vision: string;
      slices: Array<{
        sliceId: string;
        title: string;
        risk: string;
        depends: string[];
        demo: string;
        goal: string;
        successCriteria: string;
        proofLevel: string;
        integrationClosure: string;
        observabilityImpact: string;
      }>;
      status?: string;
      dependsOn?: string[];
      successCriteria?: string[];
      keyRisks?: Array<{ risk: string; whyItMatters: string }>;
      proofStrategy?: Array<{ riskOrUnknown: string; retireIn: string; whatWillBeProven: string }>;
      verificationContract?: string;
      verificationIntegration?: string;
      verificationOperational?: string;
      verificationUat?: string;
      definitionOfDone?: string[];
      requirementCoverage?: string;
      boundaryMapMarkdown?: string;
    },
    basePath?: string,
  ) => Promise<unknown>;
  executePlanSlice: (
    params: {
      milestoneId: string;
      sliceId: string;
      goal: string;
      tasks: Array<{
        taskId: string;
        title: string;
        description: string;
        estimate: string;
        files: string[];
        verify: string;
        inputs: string[];
        expectedOutput: string[];
        observabilityImpact?: string;
      }>;
      successCriteria?: string;
      proofLevel?: string;
      integrationClosure?: string;
      observabilityImpact?: string;
    },
    basePath?: string,
  ) => Promise<unknown>;
  executeSliceComplete: (
    params: {
      sliceId: string;
      milestoneId: string;
      sliceTitle: string;
      oneLiner: string;
      narrative: string;
      verification: string;
      uatContent: string;
      deviations?: string;
      knownLimitations?: string;
      followUps?: string;
      keyFiles?: string[] | string;
      keyDecisions?: string[] | string;
      patternsEstablished?: string[] | string;
      observabilitySurfaces?: string[] | string;
      provides?: string[] | string;
      requirementsSurfaced?: string[] | string;
      drillDownPaths?: string[] | string;
      affects?: string[] | string;
      requirementsAdvanced?: Array<{ id: string; how: string } | string>;
      requirementsValidated?: Array<{ id: string; proof: string } | string>;
      requirementsInvalidated?: Array<{ id: string; what: string } | string>;
      filesModified?: Array<{ path: string; description: string } | string>;
      requires?: Array<{ slice: string; provides: string } | string>;
    },
    basePath?: string,
  ) => Promise<unknown>;
  executeSummarySave: (
    params: {
      milestone_id: string;
      slice_id?: string;
      task_id?: string;
      artifact_type: string;
      content: string;
    },
    basePath?: string,
  ) => Promise<unknown>;
  executeTaskComplete: (
    params: {
      taskId: string;
      sliceId: string;
      milestoneId: string;
      oneLiner: string;
      narrative: string;
      verification: string;
      deviations?: string;
      knownIssues?: string;
      keyFiles?: string[];
      keyDecisions?: string[];
      blockerDiscovered?: boolean;
      verificationEvidence?: Array<
        { command: string; exitCode: number; verdict: string; durationMs: number } | string
      >;
    },
    basePath?: string,
  ) => Promise<unknown>;
};

let workflowToolExecutorsPromise: Promise<WorkflowToolExecutors> | null = null;

async function getWorkflowToolExecutors(): Promise<WorkflowToolExecutors> {
  if (!workflowToolExecutorsPromise) {
    const jsUrl = new URL("../../../src/resources/extensions/gsd/tools/workflow-tool-executors.js", import.meta.url).href;
    const tsUrl = new URL("../../../src/resources/extensions/gsd/tools/workflow-tool-executors.ts", import.meta.url).href;
    workflowToolExecutorsPromise = import(jsUrl)
      .catch(() => import(tsUrl)) as Promise<WorkflowToolExecutors>;
  }
  return workflowToolExecutorsPromise;
}

interface McpToolServer {
  tool(
    name: string,
    description: string,
    params: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): unknown;
}

async function withProjectDir<T>(projectDir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(projectDir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

async function handleTaskComplete(
  projectDir: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    taskId,
    sliceId,
    milestoneId,
    oneLiner,
    narrative,
    verification,
    deviations,
    knownIssues,
    keyFiles,
    keyDecisions,
    blockerDiscovered,
    verificationEvidence,
  } = args as {
    taskId: string;
    sliceId: string;
    milestoneId: string;
    oneLiner: string;
    narrative: string;
    verification: string;
    deviations?: string;
    knownIssues?: string;
    keyFiles?: string[];
    keyDecisions?: string[];
    blockerDiscovered?: boolean;
    verificationEvidence?: Array<
      { command: string; exitCode: number; verdict: string; durationMs: number } | string
    >;
  };
  const { executeTaskComplete } = await getWorkflowToolExecutors();
  return withProjectDir(projectDir, () =>
    executeTaskComplete(
      {
        taskId,
        sliceId,
        milestoneId,
        oneLiner,
        narrative,
        verification,
        deviations,
        knownIssues,
        keyFiles,
        keyDecisions,
        blockerDiscovered,
        verificationEvidence,
      },
      projectDir,
    ),
  );
}

async function handleSliceComplete(
  projectDir: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { executeSliceComplete } = await getWorkflowToolExecutors();
  return withProjectDir(projectDir, () => executeSliceComplete(args as any, projectDir));
}

export function registerWorkflowTools(server: McpToolServer): void {
  server.tool(
    "gsd_plan_milestone",
    "Write milestone planning state to the GSD database and render ROADMAP.md from DB.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      title: z.string().describe("Milestone title"),
      vision: z.string().describe("Milestone vision"),
      slices: z.array(z.object({
        sliceId: z.string(),
        title: z.string(),
        risk: z.string(),
        depends: z.array(z.string()),
        demo: z.string(),
        goal: z.string(),
        successCriteria: z.string(),
        proofLevel: z.string(),
        integrationClosure: z.string(),
        observabilityImpact: z.string(),
      })).describe("Planned slices for the milestone"),
      status: z.string().optional().describe("Milestone status"),
      dependsOn: z.array(z.string()).optional().describe("Milestone dependencies"),
      successCriteria: z.array(z.string()).optional().describe("Top-level success criteria bullets"),
      keyRisks: z.array(z.object({
        risk: z.string(),
        whyItMatters: z.string(),
      })).optional().describe("Structured risk entries"),
      proofStrategy: z.array(z.object({
        riskOrUnknown: z.string(),
        retireIn: z.string(),
        whatWillBeProven: z.string(),
      })).optional().describe("Structured proof strategy entries"),
      verificationContract: z.string().optional(),
      verificationIntegration: z.string().optional(),
      verificationOperational: z.string().optional(),
      verificationUat: z.string().optional(),
      definitionOfDone: z.array(z.string()).optional(),
      requirementCoverage: z.string().optional(),
      boundaryMapMarkdown: z.string().optional(),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...params } = args as { projectDir: string } & Record<string, unknown>;
      const { executePlanMilestone } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () => executePlanMilestone(params as any, projectDir));
    },
  );

  server.tool(
    "gsd_plan_slice",
    "Write slice/task planning state to the GSD database and render plan artifacts from DB.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      goal: z.string().describe("Slice goal"),
      tasks: z.array(z.object({
        taskId: z.string(),
        title: z.string(),
        description: z.string(),
        estimate: z.string(),
        files: z.array(z.string()),
        verify: z.string(),
        inputs: z.array(z.string()),
        expectedOutput: z.array(z.string()),
        observabilityImpact: z.string().optional(),
      })).describe("Planned tasks for the slice"),
      successCriteria: z.string().optional(),
      proofLevel: z.string().optional(),
      integrationClosure: z.string().optional(),
      observabilityImpact: z.string().optional(),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...params } = args as { projectDir: string } & Record<string, unknown>;
      const { executePlanSlice } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () => executePlanSlice(params as any, projectDir));
    },
  );

  server.tool(
    "gsd_slice_complete",
    "Record a completed slice to the GSD database, render SUMMARY.md + UAT.md, and update roadmap projection.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      sliceTitle: z.string().describe("Title of the slice"),
      oneLiner: z.string().describe("One-line summary of what the slice accomplished"),
      narrative: z.string().describe("Detailed narrative of what happened across all tasks"),
      verification: z.string().describe("What was verified across all tasks"),
      uatContent: z.string().describe("UAT test content (markdown body)"),
      deviations: z.string().optional(),
      knownLimitations: z.string().optional(),
      followUps: z.string().optional(),
      keyFiles: z.union([z.array(z.string()), z.string()]).optional(),
      keyDecisions: z.union([z.array(z.string()), z.string()]).optional(),
      patternsEstablished: z.union([z.array(z.string()), z.string()]).optional(),
      observabilitySurfaces: z.union([z.array(z.string()), z.string()]).optional(),
      provides: z.union([z.array(z.string()), z.string()]).optional(),
      requirementsSurfaced: z.union([z.array(z.string()), z.string()]).optional(),
      drillDownPaths: z.union([z.array(z.string()), z.string()]).optional(),
      affects: z.union([z.array(z.string()), z.string()]).optional(),
      requirementsAdvanced: z.array(z.union([
        z.object({ id: z.string(), how: z.string() }),
        z.string(),
      ])).optional(),
      requirementsValidated: z.array(z.union([
        z.object({ id: z.string(), proof: z.string() }),
        z.string(),
      ])).optional(),
      requirementsInvalidated: z.array(z.union([
        z.object({ id: z.string(), what: z.string() }),
        z.string(),
      ])).optional(),
      filesModified: z.array(z.union([
        z.object({ path: z.string(), description: z.string() }),
        z.string(),
      ])).optional(),
      requires: z.array(z.union([
        z.object({ slice: z.string(), provides: z.string() }),
        z.string(),
      ])).optional(),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...sliceArgs } = args as { projectDir: string } & Record<string, unknown>;
      return handleSliceComplete(projectDir, sliceArgs);
    },
  );

  server.tool(
    "gsd_complete_slice",
    "Alias for gsd_slice_complete. Record a completed slice to the GSD database and render summary/UAT artifacts.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      sliceTitle: z.string().describe("Title of the slice"),
      oneLiner: z.string().describe("One-line summary of what the slice accomplished"),
      narrative: z.string().describe("Detailed narrative of what happened across all tasks"),
      verification: z.string().describe("What was verified across all tasks"),
      uatContent: z.string().describe("UAT test content (markdown body)"),
      deviations: z.string().optional(),
      knownLimitations: z.string().optional(),
      followUps: z.string().optional(),
      keyFiles: z.union([z.array(z.string()), z.string()]).optional(),
      keyDecisions: z.union([z.array(z.string()), z.string()]).optional(),
      patternsEstablished: z.union([z.array(z.string()), z.string()]).optional(),
      observabilitySurfaces: z.union([z.array(z.string()), z.string()]).optional(),
      provides: z.union([z.array(z.string()), z.string()]).optional(),
      requirementsSurfaced: z.union([z.array(z.string()), z.string()]).optional(),
      drillDownPaths: z.union([z.array(z.string()), z.string()]).optional(),
      affects: z.union([z.array(z.string()), z.string()]).optional(),
      requirementsAdvanced: z.array(z.union([
        z.object({ id: z.string(), how: z.string() }),
        z.string(),
      ])).optional(),
      requirementsValidated: z.array(z.union([
        z.object({ id: z.string(), proof: z.string() }),
        z.string(),
      ])).optional(),
      requirementsInvalidated: z.array(z.union([
        z.object({ id: z.string(), what: z.string() }),
        z.string(),
      ])).optional(),
      filesModified: z.array(z.union([
        z.object({ path: z.string(), description: z.string() }),
        z.string(),
      ])).optional(),
      requires: z.array(z.union([
        z.object({ slice: z.string(), provides: z.string() }),
        z.string(),
      ])).optional(),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...sliceArgs } = args as { projectDir: string } & Record<string, unknown>;
      return handleSliceComplete(projectDir, sliceArgs);
    },
  );

  server.tool(
    "gsd_summary_save",
    "Save a GSD summary/research/context/assessment artifact to the database and disk.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestone_id: z.string().describe("Milestone ID (e.g. M001)"),
      slice_id: z.string().optional().describe("Slice ID (e.g. S01)"),
      task_id: z.string().optional().describe("Task ID (e.g. T01)"),
      artifact_type: z.enum(SUMMARY_ARTIFACT_TYPES).describe("Artifact type to save"),
      content: z.string().describe("The full markdown content of the artifact"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, milestone_id, slice_id, task_id, artifact_type, content } = args as {
        projectDir: string;
        milestone_id: string;
        slice_id?: string;
        task_id?: string;
        artifact_type: string;
        content: string;
      };
      const { executeSummarySave } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () =>
        executeSummarySave({ milestone_id, slice_id, task_id, artifact_type, content }, projectDir),
      );
    },
  );

  server.tool(
    "gsd_task_complete",
    "Record a completed task to the GSD database and render its SUMMARY.md.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      taskId: z.string().describe("Task ID (e.g. T01)"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      oneLiner: z.string().describe("One-line summary of what was accomplished"),
      narrative: z.string().describe("Detailed narrative of what happened during the task"),
      verification: z.string().describe("What was verified and how"),
      deviations: z.string().optional().describe("Deviations from the task plan"),
      knownIssues: z.string().optional().describe("Known issues discovered but not fixed"),
      keyFiles: z.array(z.string()).optional().describe("List of key files created or modified"),
      keyDecisions: z.array(z.string()).optional().describe("List of key decisions made during this task"),
      blockerDiscovered: z.boolean().optional().describe("Whether a plan-invalidating blocker was discovered"),
      verificationEvidence: z.array(z.union([
        z.object({
          command: z.string(),
          exitCode: z.number(),
          verdict: z.string(),
          durationMs: z.number(),
        }),
        z.string(),
      ])).optional().describe("Verification evidence entries"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...taskArgs } = args as { projectDir: string } & Record<string, unknown>;
      return handleTaskComplete(projectDir, taskArgs);
    },
  );

  server.tool(
    "gsd_complete_task",
    "Alias for gsd_task_complete. Record a completed task to the GSD database and render its SUMMARY.md.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      taskId: z.string().describe("Task ID (e.g. T01)"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      oneLiner: z.string().describe("One-line summary of what was accomplished"),
      narrative: z.string().describe("Detailed narrative of what happened during the task"),
      verification: z.string().describe("What was verified and how"),
      deviations: z.string().optional().describe("Deviations from the task plan"),
      knownIssues: z.string().optional().describe("Known issues discovered but not fixed"),
      keyFiles: z.array(z.string()).optional().describe("List of key files created or modified"),
      keyDecisions: z.array(z.string()).optional().describe("List of key decisions made during this task"),
      blockerDiscovered: z.boolean().optional().describe("Whether a plan-invalidating blocker was discovered"),
      verificationEvidence: z.array(z.union([
        z.object({
          command: z.string(),
          exitCode: z.number(),
          verdict: z.string(),
          durationMs: z.number(),
        }),
        z.string(),
      ])).optional().describe("Verification evidence entries"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, ...taskArgs } = args as { projectDir: string } & Record<string, unknown>;
      return handleTaskComplete(projectDir, taskArgs);
    },
  );

  server.tool(
    "gsd_milestone_status",
    "Read the current status of a milestone and all its slices from the GSD database.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestoneId: z.string().describe("Milestone ID to query (e.g. M001)"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, milestoneId } = args as { projectDir: string; milestoneId: string };
      const { executeMilestoneStatus } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () => executeMilestoneStatus({ milestoneId }));
    },
  );
}
