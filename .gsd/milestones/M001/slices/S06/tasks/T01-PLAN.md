---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T01: Wire iterate expansion into resolveDispatch and prove with integration tests

**Slice:** S06 — Iterate / Fan-Out
**Milestone:** M001

## Description

Connect the already-implemented `expandIteration()` function in `graph.ts` to the engine's dispatch loop in `custom-workflow-engine.ts`. When `resolveDispatch()` encounters a pending step that has an `iterate` config in the frozen DEFINITION.yaml, it reads the source artifact, applies the regex to extract items, calls `expandIteration()`, writes the expanded graph to disk, and dispatches the first instance step. Write comprehensive integration tests proving the full expansion→dispatch→reconcile cycle.

## Steps

1. **Modify `resolveDispatch()` in `custom-workflow-engine.ts`:**
   - After `getNextPendingStep(graph)` returns a step, read the frozen DEFINITION.yaml from `join(this.runDir, "DEFINITION.yaml")` using `readFileSync` + `parse` (from `yaml` package). The frozen def uses **camelCase** property names (it was serialized from a TypeScript `WorkflowDefinition` object by `run-manager.ts`).
   - Find the matching step definition by ID: `def.steps.find(s => s.id === next.id)`.
   - If the step definition has an `iterate` property (with `source` and `pattern` fields):
     a. Read the source artifact: `readFileSync(join(this.runDir, iterate.source), "utf-8")`. If the file doesn't exist, throw an `Error` with a clear message including the path.
     b. Apply the regex with global flag: `[...content.matchAll(new RegExp(iterate.pattern, 'g'))].map(m => m[1])` to collect capture group 1 from each match.
     c. Call `expandIteration(graph, next.id, items, next.prompt)` — note: `next.prompt` is the prompt from GRAPH.yaml, which uses `{{item}}` placeholders that `expandIteration()` replaces.
     d. Write the expanded graph: `writeGraph(this.runDir, expandedGraph)`.
     e. Re-query: `getNextPendingStep(expandedGraph)` to get the first instance step.
     f. If no next step after expansion (zero items case), return `{ action: "stop", reason: "Iterate expansion produced no instances", level: "info" }`.
     g. Otherwise, apply context injection and return dispatch for the instance step.
   - If no `iterate` property, proceed with existing behavior (unchanged).
   - Add imports: `readFileSync`, `existsSync` from `node:fs`; `parse` from `yaml`; `expandIteration`, `writeGraph` (already imported); `join` from `node:path` (already used via `injectContext`).

2. **Add required imports to `custom-workflow-engine.ts`:**
   - Add `import { readFileSync, existsSync } from "node:fs";`
   - Add `import { join } from "node:path";`
   - Add `import { parse } from "yaml";`
   - Add `expandIteration` to the existing `graph.ts` import.
   - Add `writeGraph` is already imported — just add `expandIteration` to that import line.

3. **Write `iterate-engine-integration.test.ts`:**
   - Use the same temp-dir pattern as `custom-workflow-engine.test.ts` and `context-injector.test.ts`.
   - Create a helper `makeTempRun(def, graph, files?)` that writes DEFINITION.yaml (camelCase, via `stringify(def)`), GRAPH.yaml (via `writeGraph()`), and optional artifact files.
   - **Test: basic expansion** — Create a run with an iterate step `iterate: { source: "topics.md", pattern: "^- (.+)$" }` and a `topics.md` file with 3 bullet items. Call `resolveDispatch()`. Assert it returns dispatch for the first instance step (`iter-step--001`). Read GRAPH.yaml from disk and verify parent is "expanded" with 3 instance steps.
   - **Test: full dispatch→reconcile sequence** — After expansion, reconcile instance 1, dispatch again → instance 2, reconcile, dispatch → instance 3, reconcile, dispatch → should return the downstream step (or stop if no downstream). Proves independent dispatch.
   - **Test: downstream blocking** — Add a step that depends on the iterate step. After expanding, verify reconciling only some instances means downstream is still blocked. Only after all instances are complete does the downstream step become dispatchable.
   - **Test: zero matches** — Source file exists but content doesn't match the pattern. After dispatch, parent should be "expanded" with no instance steps. The engine should handle this gracefully (either dispatch next step or stop).
   - **Test: missing source artifact** — Source file doesn't exist. `resolveDispatch()` should throw an Error mentioning the missing file path.

4. **Run verification:** Execute all three test files and confirm no regressions.

## Must-Haves

- [ ] `resolveDispatch()` reads frozen DEFINITION.yaml to detect iterate config on the next pending step
- [ ] Source artifact read + regex applied with global flag + capture group 1 collected
- [ ] `expandIteration()` called and expanded graph written to disk before dispatch
- [ ] Instance steps dispatch and reconcile independently through normal engine cycle
- [ ] Missing source artifact throws a clear error
- [ ] Zero-match expansion handled gracefully (parent expanded, engine proceeds)
- [ ] All existing `custom-workflow-engine.test.ts` tests pass (no regression)
- [ ] All existing `graph-operations.test.ts` tests pass (no regression)

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts` — all tests pass
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts` — 17 existing tests pass
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts` — 33 existing tests pass

## Inputs

- `src/resources/extensions/gsd/custom-workflow-engine.ts` — the engine file to modify (add iterate expansion to `resolveDispatch()`)
- `src/resources/extensions/gsd/graph.ts` — provides `expandIteration()`, `writeGraph()`, `readGraph()`, `getNextPendingStep()` (no changes needed, already fully implemented)
- `src/resources/extensions/gsd/definition-loader.ts` — provides `IterateConfig`, `StepDefinition`, `WorkflowDefinition` types (no changes needed)
- `src/resources/extensions/gsd/context-injector.ts` — provides `injectContext()` already used by the engine (no changes needed, silently passes through for instance steps not found in definition)
- `src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts` — existing tests to verify no regression

## Expected Output

- `src/resources/extensions/gsd/custom-workflow-engine.ts` — modified with iterate expansion logic in `resolveDispatch()`
- `src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts` — new test file with 5 test cases proving end-to-end iterate expansion + dispatch
