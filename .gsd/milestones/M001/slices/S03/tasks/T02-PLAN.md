---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T02: Implement graph.ts with DAG operations, iteration expansion, and YAML I/O

**Slice:** S03 — YAML Definition Schema + DAG Graph
**Milestone:** M001

## Description

Create `graph.ts` — the pure data module for GRAPH.yaml workflow step tracking. Provides types and functions for reading, writing, and querying the step DAG that `CustomWorkflowEngine` (S04) will use. Depends on `WorkflowDefinition` type from `definition-loader.ts` (T01). Adapt from prior art on `feat/declarative-workflow-engine-v2` branch (~290 lines).

Write comprehensive tests in `graph-operations.test.ts` covering YAML I/O round-trips, DAG query operations, iteration expansion with downstream dep rewriting, and `initializeGraph` conversion.

## Steps

1. **Extract prior art and create `graph.ts`.** Run `git show feat/declarative-workflow-engine-v2:src/resources/extensions/gsd/graph.ts` to get the ~290-line source. Place at `src/resources/extensions/gsd/graph.ts`. This file already has: types (`WorkflowGraph`, `GraphStep`), `readGraph()`, `writeGraph()`, `getNextPendingStep()`, `markStepComplete()`, `expandIteration()`, `graphFromDefinition()`.

2. **Rename `graphFromDefinition` to `initializeGraph`.** The boundary map specifies S04 expects `initializeGraph()`. Rename the function but also export the old name as an alias for backward compat: `export { initializeGraph as graphFromDefinition }`. Update the import from definition-loader to use `type` import: `import type { WorkflowDefinition } from "./definition-loader.js"`.

3. **Write `graph-operations.test.ts`.** Create comprehensive test file at `src/resources/extensions/gsd/tests/graph-operations.test.ts` with tests covering:
   - `writeGraph` + `readGraph` round-trip: write a graph, read it back, verify all fields survive
   - `readGraph` missing file → throws with descriptive error
   - `readGraph` malformed YAML → throws with descriptive error
   - `getNextPendingStep` returns first step with all deps complete
   - `getNextPendingStep` skips steps with incomplete deps
   - `getNextPendingStep` returns null when all steps complete or blocked
   - `markStepComplete` returns new graph with step status "complete" (original unchanged)
   - `markStepComplete` unknown step → throws
   - `expandIteration` creates instance steps with correct IDs (`stepId--001`, `stepId--002`, etc.)
   - `expandIteration` marks parent step as "expanded"
   - `expandIteration` rewrites downstream deps from parent ID to all instance IDs
   - `expandIteration` non-pending parent → throws
   - `expandIteration` unknown step → throws
   - `initializeGraph` from valid 3-step definition → all pending, correct deps, metadata populated
   - Atomic write safety: verify `.tmp` pattern by checking file exists after write
   
   Tests use `mkdtempSync` for isolation and clean up in `finally` blocks. Import from `node:test` and `node:assert/strict`.

4. **Run tests and verify.** Execute `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts`. All 15+ tests must pass. Run import smoke test: `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/graph.ts').then(() => console.log('OK'))"`.

## Must-Haves

- [ ] `initializeGraph()` exported (renamed from `graphFromDefinition`; old name also exported as alias)
- [ ] `readGraph()` / `writeGraph()` round-trip preserves all fields including `parentStepId` and `dependsOn`
- [ ] `writeGraph()` uses atomic write pattern (write to `.tmp`, rename to final)
- [ ] `getNextPendingStep()` respects dependency ordering — only returns steps whose deps are all "complete"
- [ ] `markStepComplete()` is immutable — returns new graph, does not mutate input
- [ ] `expandIteration()` creates instance steps, marks parent "expanded", rewrites downstream deps
- [ ] YAML uses snake_case (`depends_on`, `parent_step_id`, `created_at`); TypeScript uses camelCase
- [ ] Import from definition-loader uses `.js` extension and `type` keyword: `import type { WorkflowDefinition } from "./definition-loader.js"`
- [ ] File imports only `yaml`, `node:` builtins, and `definition-loader.js` — no other GSD imports

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts` — all tests pass (15+ tests)
- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/graph.ts').then(() => console.log('OK'))"` — prints OK

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — `WorkflowDefinition` type import for `initializeGraph()`

## Observability Impact

- **New signal: GRAPH.yaml on disk** — `writeGraph()` persists the full step DAG as human-readable YAML with snake_case keys. Agents and humans can `cat GRAPH.yaml` to inspect step statuses, dependency edges, parent-child relationships, and timing fields (`started_at`, `finished_at`).
- **New signal: step status lifecycle** — Each `GraphStep` tracks `status` (pending/active/complete/expanded), `startedAt`, and `finishedAt`. `markStepComplete()` auto-sets `finishedAt`. These are visible in the serialized GRAPH.yaml.
- **New signal: atomic write safety** — `writeGraph()` writes to `.tmp` then renames, so partial writes never corrupt the graph file. A missing `.tmp` file after write confirms atomicity.
- **Failure state: descriptive errors** — `readGraph()` throws with the full file path when GRAPH.yaml is missing or malformed. `expandIteration()` includes step ID and current status in error messages. `markStepComplete()` identifies the unknown step ID in its error.
- **Inspection: dependency ordering** — `getNextPendingStep()` can be called on any graph to see what's dispatchable next. Returns `null` when everything is blocked or complete — useful for diagnosing stuck workflows.

## Expected Output

- `src/resources/extensions/gsd/graph.ts` — DAG types and operations, YAML I/O, iteration expansion (~300 lines)
- `src/resources/extensions/gsd/tests/graph-operations.test.ts` — comprehensive test suite (15+ tests, ~350 lines)
