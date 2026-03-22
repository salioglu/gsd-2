---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T01: Implement DevWorkflowEngine, DevExecutionPolicy, resolver wiring, and auto.ts exports

**Slice:** S02 — Dev Engine Wrapper + Kill Switch
**Milestone:** M001

## Description

Create the two engine implementation classes (`DevWorkflowEngine`, `DevExecutionPolicy`), update the resolver stub from S01 to return the dev engine pair, and add engine ID accessors to `auto.ts`. This is the production code — the test file is T02.

`DevWorkflowEngine` is the substantive class. It implements `WorkflowEngine` by delegating `deriveState()` to the existing `state.ts::deriveState()` and mapping `GSDState` → `EngineState`, and delegating `resolveDispatch()` to `auto-dispatch.ts::resolveDispatch()` with a `bridgeDispatchAction()` function that maps `DispatchAction` (GSD-specific, has `matchedRule`) → `EngineDispatchAction` (engine-generic). The `reconcile()` method is a pass-through stub (returns "continue" for non-complete state, "milestone-complete" if `isComplete`). `getDisplayMetadata()` maps GSD state fields to `DisplayMetadata`.

`DevExecutionPolicy` is trivial — all five methods return safe defaults. The real verification/closeout continues running in `phases.ts` via `LoopDeps` (unchanged). Wiring the policy into the loop is S04's job.

The resolver update replaces the S01 "throws for everything" stub with real routing: `GSD_ENGINE_BYPASS=1` → throw, `null`/`"dev"` → dev engine pair, anything else → throw.

The `auto.ts` exports are two one-line functions: `setActiveEngineId(id)` and `getActiveEngineId()`, both wrapping `s.activeEngineId`. These must be `function` declarations (not `let`/`var`) to satisfy the `auto-session-encapsulation.test.ts` invariant.

## Steps

1. **Create `dev-workflow-engine.ts`**
   - Import `WorkflowEngine` from `./workflow-engine.js`, all needed types from `./engine-types.js`
   - Import `deriveState` from `./state.js` (returns `GSDState`)
   - Import `resolveDispatch` from `./auto-dispatch.js` (takes `DispatchContext`, returns `DispatchAction`)
   - Import `DispatchAction`, `DispatchContext` types from `./auto-dispatch.js`
   - Import `loadEffectiveGSDPreferences` from `./preferences.js`
   - Implement `bridgeDispatchAction(da: DispatchAction): EngineDispatchAction` — exported for testing:
     - `da.action === "dispatch"` → `{ action: "dispatch", step: { unitType: da.unitType, unitId: da.unitId, prompt: da.prompt } }`
     - `da.action === "stop"` → `{ action: "stop", reason: da.reason, level: da.level }`
     - `da.action === "skip"` → `{ action: "skip" }`
   - Implement `DevWorkflowEngine` class:
     - `engineId = "dev"` (readonly)
     - `deriveState(basePath)`: call `deriveState(basePath)`, map `GSDState` to `EngineState` — `phase: gsd.phase`, `currentMilestoneId: gsd.activeMilestone?.id ?? null`, `activeSliceId: gsd.activeSlice?.id ?? null`, `activeTaskId: gsd.activeTask?.id ?? null`, `isComplete: gsd.phase === "complete"`, `raw: gsd`
     - `resolveDispatch(state, { basePath })`: extract `mid`/`midTitle` from `state.raw` (cast to `GSDState`), load prefs via `loadEffectiveGSDPreferences()`, build `DispatchContext`, call `resolveDispatch(ctx)`, return `bridgeDispatchAction(result)`
     - `reconcile(state, _completedStep)`: return `{ outcome: state.isComplete ? "milestone-complete" : "continue" }`
     - `getDisplayMetadata(state)`: return `{ engineLabel: "GSD Dev", currentPhase: state.phase, progressSummary: \`${state.currentMilestoneId ?? "no milestone"} / ${state.activeSliceId ?? "—"} / ${state.activeTaskId ?? "—"}\`, stepCount: null }`

2. **Create `dev-execution-policy.ts`**
   - Import `ExecutionPolicy` from `./execution-policy.js`, needed types from `./engine-types.js`
   - Implement `DevExecutionPolicy` class with all five methods as stubs:
     - `prepareWorkspace()` — no-op (`return`)
     - `selectModel()` — `return null`
     - `verify()` — `return "continue"`
     - `recover()` — `return { outcome: "retry" }`
     - `closeout()` — `return { committed: false, artifacts: [] }`

3. **Update `engine-resolver.ts`**
   - Add imports for `DevWorkflowEngine` from `./dev-workflow-engine.js` and `DevExecutionPolicy` from `./dev-execution-policy.js`
   - Replace the stub body with:
     - Check `process.env.GSD_ENGINE_BYPASS === "1"` — if true, throw `new Error("Engine layer bypassed (GSD_ENGINE_BYPASS=1) — falling through to direct auto-mode path")`
     - Extract `activeEngineId` from session
     - If `activeEngineId === null || activeEngineId === "dev"` — return `{ engine: new DevWorkflowEngine(), policy: new DevExecutionPolicy() }`
     - Otherwise throw `new Error(\`Unknown engine ID: "${activeEngineId}" — only "dev" is registered\`)`

4. **Add exports to `auto.ts`**
   - Add two exported functions after the existing `isAutoPaused()` export (or any reasonable location):
     ```typescript
     export function setActiveEngineId(id: string | null): void {
       s.activeEngineId = id;
     }

     export function getActiveEngineId(): string | null {
       return s.activeEngineId;
     }
     ```
   - These MUST be `function` declarations, not `let`/`var`, to satisfy the encapsulation test

5. **Smoke-test the resolver**
   - Run: `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/engine-resolver.ts').then(m => { const r = m.resolveEngine({activeEngineId: null}); console.log(r.engine.engineId) })"`
   - Expected output: `dev`

## Must-Haves

- [ ] `DevWorkflowEngine` implements `WorkflowEngine` interface with `engineId: "dev"`
- [ ] `bridgeDispatchAction()` correctly maps all three `DispatchAction` variants to `EngineDispatchAction`
- [ ] `DevExecutionPolicy` implements `ExecutionPolicy` interface with all five stub methods
- [ ] `resolveEngine()` returns dev engine for `null` and `"dev"` engine IDs
- [ ] `resolveEngine()` throws with descriptive message for `GSD_ENGINE_BYPASS=1`
- [ ] `resolveEngine()` throws for unknown engine IDs
- [ ] `auto.ts` exports `setActiveEngineId()` and `getActiveEngineId()` as function declarations (no `let`/`var`)
- [ ] All imports use `.js` extension (ESM convention)

## Verification

- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/engine-resolver.ts').then(m => { const r = m.resolveEngine({activeEngineId: null}); console.log(r.engine.engineId) })"` prints `dev`
- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/auto.ts').then(m => { m.setActiveEngineId('test'); console.log(m.getActiveEngineId()) })"` prints `test`

## Inputs

- `src/resources/extensions/gsd/engine-types.ts` — S01 type contracts: `EngineState`, `EngineDispatchAction`, `StepContract`, `DisplayMetadata`, `ReconcileResult`, `RecoveryAction`, `CloseoutResult`, `CompletedStep`
- `src/resources/extensions/gsd/workflow-engine.ts` — S01 `WorkflowEngine` interface to implement
- `src/resources/extensions/gsd/execution-policy.ts` — S01 `ExecutionPolicy` interface to implement
- `src/resources/extensions/gsd/engine-resolver.ts` — S01 stub to replace with real routing
- `src/resources/extensions/gsd/state.ts` — `deriveState(basePath)` function to delegate to
- `src/resources/extensions/gsd/auto-dispatch.ts` — `resolveDispatch(ctx)` function and `DispatchAction`/`DispatchContext` types to delegate to
- `src/resources/extensions/gsd/preferences.ts` — `loadEffectiveGSDPreferences()` for dispatch context
- `src/resources/extensions/gsd/auto.ts` — add engine ID accessors
- `src/resources/extensions/gsd/types.ts` — `GSDState` type for the bridge mapping

## Expected Output

- `src/resources/extensions/gsd/dev-workflow-engine.ts` — new file: `DevWorkflowEngine` class + `bridgeDispatchAction()` export
- `src/resources/extensions/gsd/dev-execution-policy.ts` — new file: `DevExecutionPolicy` class with stub methods
- `src/resources/extensions/gsd/engine-resolver.ts` — modified: real routing replacing S01 stub
- `src/resources/extensions/gsd/auto.ts` — modified: two new function exports
