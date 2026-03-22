---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T01: Build custom-verification.ts and wire into CustomExecutionPolicy

**Slice:** S05 — Verification + Context Injection + Parameters
**Milestone:** M001

## Description

Create `custom-verification.ts` — a standalone module that reads the frozen `DEFINITION.yaml` from a run directory, finds a step's `verify` policy, and executes the appropriate handler. Then wire it into `CustomExecutionPolicy.verify()` by passing `runDir` through the constructor and updating `engine-resolver.ts` to supply it. Write comprehensive unit tests for all four policies plus edge cases.

The four verification policies:

- **content-heuristic**: Check that each `produces` path exists in the run directory. Optionally check `minSize` (bytes) and `pattern` (regex match on file content). Returns "continue" if all pass, "pause" if any fail. If the step has no `produces`, returns "continue" (nothing to check).
- **shell-command**: Run the `command` string via `spawnSync` with `sh -c`, 30s timeout, cwd set to the run directory. Returns "continue" if exit code 0, "retry" if non-zero.
- **prompt-verify**: Always returns "pause" — defers to the agent to evaluate on the next iteration.
- **human-review**: Always returns "pause" — waits for manual inspection.
- **No policy**: If the step has no `verify` field, returns "continue" (passthrough).

## Steps

1. **Create `custom-verification.ts`**: Export `runCustomVerification(runDir: string, stepId: string): "continue" | "retry" | "pause"`. Read `DEFINITION.yaml` from `runDir` with `yaml.parse()`. Find the step matching `stepId` in the definition's `steps` array. The frozen DEFINITION.yaml uses camelCase keys (it's serialized from TypeScript objects via `yaml.stringify()`). Dispatch to the appropriate handler based on `step.verify.policy`. If no `verify` field, return "continue".

2. **Implement content-heuristic handler**: For each path in the step's `produces` array, resolve it relative to `runDir` and check `existsSync()`. If `minSize` is set, check `statSync(path).size >= minSize`. If `pattern` is set, read the file content and test `new RegExp(pattern).test(content)`. Return "continue" if all checks pass, "pause" if any fail. If `produces` is empty, return "continue".

3. **Implement shell-command handler**: Use `spawnSync("sh", ["-c", command], { cwd: runDir, timeout: 30_000, encoding: "utf-8", stdio: "pipe" })`. Return "continue" if `result.status === 0`, "retry" otherwise (including timeout/signal kills).

4. **Update `CustomExecutionPolicy`**: Add `private readonly runDir: string` to the constructor. In `verify()`, extract the step ID from `unitId` (split on `/`, take last segment), then call and return `runCustomVerification(this.runDir, stepId)`. Import `runCustomVerification` from `./custom-verification.ts`. Update `engine-resolver.ts` to pass `activeRunDir` to `new CustomExecutionPolicy(activeRunDir)`.

5. **Write `custom-verification.test.ts`**: Create temp run directories with DEFINITION.yaml and test artifacts for each policy. Test cases:
   - content-heuristic: file exists and meets size/pattern → "continue"
   - content-heuristic: file missing → "pause"
   - content-heuristic: file exists but below minSize → "pause"
   - content-heuristic: file exists but pattern doesn't match → "pause"
   - content-heuristic: no produces → "continue"
   - shell-command: `test -f <artifact>` with file present → "continue"
   - shell-command: `test -f <artifact>` with file absent → "retry"
   - prompt-verify: → "pause"
   - human-review: → "pause"
   - no verify policy → "continue"

## Must-Haves

- [ ] `runCustomVerification()` reads the frozen DEFINITION.yaml and dispatches to the correct policy handler
- [ ] content-heuristic checks file existence, minSize, and pattern
- [ ] shell-command runs via spawnSync with 30s timeout
- [ ] prompt-verify returns "pause"
- [ ] human-review returns "pause"
- [ ] No verify policy returns "continue"
- [ ] `CustomExecutionPolicy.verify()` extracts stepId from unitId and calls `runCustomVerification()`
- [ ] `engine-resolver.ts` passes `activeRunDir` to `CustomExecutionPolicy` constructor
- [ ] All imports use `.ts` extensions (KNOWLEDGE.md rule)

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-verification.test.ts` — all tests pass
- `grep -q "new CustomExecutionPolicy(activeRunDir)" src/resources/extensions/gsd/engine-resolver.ts` — wiring confirmed

## Inputs

- `src/resources/extensions/gsd/custom-execution-policy.ts` — stub to modify: add runDir constructor + wire verify
- `src/resources/extensions/gsd/engine-resolver.ts` — resolver to modify: pass activeRunDir to CustomExecutionPolicy
- `src/resources/extensions/gsd/execution-policy.ts` — interface contract (read-only reference, do not modify)
- `src/resources/extensions/gsd/definition-loader.ts` — types `StepDefinition`, `VerifyPolicy`, `WorkflowDefinition` (read-only reference)
- `src/resources/extensions/gsd/verification-gate.ts` — spawnSync pattern reference (read-only reference)

## Expected Output

- `src/resources/extensions/gsd/custom-verification.ts` — new module: `runCustomVerification(runDir, stepId)` with four policy handlers
- `src/resources/extensions/gsd/custom-execution-policy.ts` — modified: runDir constructor, verify() wired to runCustomVerification()
- `src/resources/extensions/gsd/engine-resolver.ts` — modified: passes activeRunDir to CustomExecutionPolicy constructor
- `src/resources/extensions/gsd/tests/custom-verification.test.ts` — new test file with 10+ test cases

## Observability Impact

- **New signal:** `runCustomVerification()` returns a typed verification outcome per step. The `CustomExecutionPolicy.verify()` method passes this through to the auto-loop, making per-step verification results visible in loop dispatch logging.
- **Inspectable state:** The frozen DEFINITION.yaml in the run directory is the authoritative source for which verification policy applies to each step. Future agents can inspect it with `cat <runDir>/DEFINITION.yaml | grep -A5 verify`.
- **Failure visibility:** shell-command policy failures include stderr from the spawned process. content-heuristic failures include the specific check that failed (existence, minSize, pattern). Both are surfaced through the return value path to the caller.
- **No new log files or endpoints.** All observability is through return values and on-disk YAML state.
