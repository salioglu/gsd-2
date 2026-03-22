# S05: Verification + Context Injection + Parameters

**Goal:** Custom workflow steps verify their output via four configurable policies (content-heuristic, shell-command, prompt-verify, human-review), inject prior step artifacts as context, and substitute parameters — all driven by the frozen DEFINITION.yaml in the run directory.

**Demo:** A unit test dispatches a step that references `contextFrom: ["step-1"]`, receives step-1's artifact content prepended to its prompt, and verifies via `content-heuristic` that the produced file exists and meets size/pattern criteria. Parameter substitution is already proven by 5 existing tests in `definition-loader.test.ts`.

## Must-Haves

- `custom-verification.ts` implements all four verification policies: content-heuristic (file existence + size + pattern), shell-command (spawnSync with timeout), prompt-verify (returns "pause"), human-review (returns "pause")
- `CustomExecutionPolicy.verify()` calls `runCustomVerification()` with the run directory and step ID extracted from the `unitId`
- `engine-resolver.ts` passes `activeRunDir` to the `CustomExecutionPolicy` constructor
- `context-injector.ts` reads `contextFrom` step references, locates their `produces` artifacts in the run directory, and returns formatted context to prepend to the prompt
- `CustomWorkflowEngine.resolveDispatch()` calls `injectContext()` to enrich the step prompt before dispatch
- Missing artifacts in context injection are skipped gracefully (no crash)
- Injected context is truncated to a reasonable limit (10k chars per artifact) to prevent context window blowout
- No verification policy configured → `verify()` returns "continue" (passthrough)

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

All tests run with `node --experimental-strip-types --test`:

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-verification.test.ts` — all four policies + no-policy passthrough + missing file handling
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/context-injector.test.ts` — single-step context, multi-step chain, missing artifact graceful skip, no-contextFrom passthrough, truncation guard

## Tasks

- [x] **T01: Build custom-verification.ts and wire into CustomExecutionPolicy** `est:45m`
  - Why: The `CustomExecutionPolicy.verify()` stub always returns "continue". This task builds the real verification module with four policy handlers and wires it into the execution policy via the run directory.
  - Files: `src/resources/extensions/gsd/custom-verification.ts`, `src/resources/extensions/gsd/custom-execution-policy.ts`, `src/resources/extensions/gsd/engine-resolver.ts`, `src/resources/extensions/gsd/tests/custom-verification.test.ts`
  - Do: Create `custom-verification.ts` with `runCustomVerification(runDir, stepId)` that reads the frozen DEFINITION.yaml to find the step's `verify` policy and dispatches to the appropriate handler. Update `CustomExecutionPolicy` to accept `runDir` in its constructor, extract the stepId from the `unitId` (format: `"<name>/<stepId>"`), and call `runCustomVerification()`. Update `engine-resolver.ts` to pass `activeRunDir` to `CustomExecutionPolicy(runDir)`. Use `spawnSync` for shell-command with 30s timeout. Import with `.ts` extensions per KNOWLEDGE.md.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-verification.test.ts`
  - Done when: All verification policy tests pass — content-heuristic checks file existence/size/pattern, shell-command executes real commands, prompt-verify and human-review return "pause", no-policy returns "continue"

- [x] **T02: Build context-injector.ts and wire into CustomWorkflowEngine** `est:35m`
  - Why: Steps with `contextFrom` need prior step artifacts injected into their prompts. This task builds the context injection module and integrates it into the engine's dispatch flow.
  - Files: `src/resources/extensions/gsd/context-injector.ts`, `src/resources/extensions/gsd/custom-workflow-engine.ts`, `src/resources/extensions/gsd/tests/context-injector.test.ts`
  - Do: Create `context-injector.ts` with `injectContext(runDir, stepId)` that reads the frozen DEFINITION.yaml, finds the step's `contextFrom` references, locates each referenced step's `produces` artifacts on disk (relative to runDir), reads their content (truncated to 10k chars each), and returns a formatted context block. Wire into `resolveDispatch()` — after finding the next pending step, call `injectContext()` and prepend the result to `step.prompt`. Handle missing files gracefully (skip with warning). Import with `.ts` extensions per KNOWLEDGE.md.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/context-injector.test.ts`
  - Done when: All context injection tests pass — single-step context prepends content, multi-step chain prepends both, missing artifact is skipped gracefully, no-contextFrom returns prompt unchanged, large artifacts are truncated

## Observability / Diagnostics

- **Verification outcome logging:** `runCustomVerification()` returns a typed `"continue" | "retry" | "pause"` result per step — callers log which policy produced which outcome, making verification behavior inspectable without debugging.
- **Shell-command stderr capture:** `shell-command` policy captures stderr from `spawnSync` — on "retry" outcomes, the command's stderr is available for diagnosis.
- **Content-heuristic failure specifics:** When a `content-heuristic` check fails (missing file, below minSize, pattern mismatch), the specific failure reason is logged, not just a generic "pause".
- **Context injection truncation:** `injectContext()` truncates per-artifact to 10k chars and logs when truncation occurs, preventing silent context window overflow.
- **Frozen DEFINITION.yaml on disk:** The run directory's DEFINITION.yaml is the single source of truth for step verification config — inspectable via `cat <runDir>/DEFINITION.yaml`.
- **Redaction:** No secrets are involved in verification or context injection. Shell commands run in the run directory sandbox (no access to env secrets).

## Failure-path verification

- `custom-verification.test.ts` explicitly tests: missing produces file → "pause", file below minSize → "pause", pattern mismatch → "pause", shell command failure → "retry", missing DEFINITION.yaml → throws
- `context-injector.test.ts` explicitly tests: missing artifact file → graceful skip (no crash), no contextFrom field → passthrough

## Files Likely Touched

- `src/resources/extensions/gsd/custom-verification.ts` (new)
- `src/resources/extensions/gsd/context-injector.ts` (new)
- `src/resources/extensions/gsd/custom-execution-policy.ts` (modify — add runDir constructor, wire verify)
- `src/resources/extensions/gsd/engine-resolver.ts` (modify — pass runDir to CustomExecutionPolicy)
- `src/resources/extensions/gsd/custom-workflow-engine.ts` (modify — integrate context injection into resolveDispatch)
- `src/resources/extensions/gsd/tests/custom-verification.test.ts` (new)
- `src/resources/extensions/gsd/tests/context-injector.test.ts` (new)
