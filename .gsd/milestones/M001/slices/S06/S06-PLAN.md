# S06: Iterate / Fan-Out

**Goal:** Steps with `iterate` config expand into independent sub-steps at dispatch time, driven by regex matches from a source artifact.
**Demo:** A test creates a run directory with a DEFINITION.yaml containing an iterate step and a source artifact with 3 bullet items. The engine's `resolveDispatch()` expands the step into 3 instances, persists the expanded graph, and dispatches them sequentially. Downstream steps wait until all instances complete.

## Must-Haves

- `resolveDispatch()` detects iterate config from the frozen DEFINITION.yaml and expands via `expandIteration()`
- Source artifact is read from disk, regex applied with global flag, capture-group matches collected as items
- Expanded graph is written to disk before dispatching the first instance
- Instance steps dispatch and reconcile independently through the normal engine cycle
- Parent step transitions to "expanded" status and is skipped by subsequent dispatch calls
- Downstream steps blocked until all instances complete (dep rewriting from `expandIteration()`)
- Missing source artifact throws (configuration error, not transient)
- Zero matches produces an expanded parent with no instances (next step proceeds)
- Idempotency: calling `resolveDispatch()` again after expansion returns instance steps, not re-expansion

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts` — all tests pass
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts` — existing tests still pass (no regression)
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts` — existing 33 tests still pass

## Tasks

- [ ] **T01: Wire iterate expansion into resolveDispatch and prove with integration tests** `est:45m`
  - Why: This is the only code change for S06 — connecting the already-implemented `expandIteration()` function to the engine's dispatch loop, plus comprehensive tests proving the full expansion→dispatch→reconcile cycle works.
  - Files: `src/resources/extensions/gsd/custom-workflow-engine.ts`, `src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts`
  - Do: In `resolveDispatch()`, after getting the next pending step from the graph, read the frozen DEFINITION.yaml to check if that step has an `iterate` config. If yes: read the source artifact from `join(this.runDir, iterate.source)`, apply `new RegExp(iterate.pattern, 'g')` via `matchAll()` to collect capture-group matches, call `expandIteration(graph, stepId, items, step.prompt)`, write the expanded graph with `writeGraph()`, then re-query `getNextPendingStep()` on the expanded graph to get the first instance step and dispatch it. If source file is missing, throw an error. Write a test file covering: basic 3-item expansion, full dispatch→reconcile sequence through all instances, downstream step blocking until instances complete, zero-match expansion, missing source file error, and existing test regression check.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts && node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts`
  - Done when: All iterate integration tests pass, all existing engine tests pass, the engine correctly expands iterate steps, dispatches instances independently, and blocks downstream steps until all instances complete.

## Files Likely Touched

- `src/resources/extensions/gsd/custom-workflow-engine.ts`
- `src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts`
