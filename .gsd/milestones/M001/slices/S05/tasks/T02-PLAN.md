---
estimated_steps: 4
estimated_files: 3
skills_used: []
---

# T02: Build context-injector.ts and wire into CustomWorkflowEngine

**Slice:** S05 — Verification + Context Injection + Parameters
**Milestone:** M001

## Description

Create `context-injector.ts` — a standalone module that reads the frozen `DEFINITION.yaml` from a run directory, finds a step's `contextFrom` references, locates the referenced steps' `produces` artifacts on disk, reads their content (with truncation), and returns a formatted context block. Then wire it into `CustomWorkflowEngine.resolveDispatch()` so the context is prepended to the step's prompt before dispatch.

The context injection logic:

1. Read `DEFINITION.yaml` from `runDir` (camelCase keys — it's a serialized TypeScript object).
2. Find the current step by `stepId` in the definition's `steps` array.
3. If the step has no `contextFrom`, return the prompt unchanged.
4. For each step ID in `contextFrom`, find that step in the definition and get its `produces` paths.
5. For each `produces` path, resolve it relative to `runDir`, read the file content if it exists.
6. Truncate each artifact to 10,000 characters to prevent context window blowout.
7. Format as a labeled block: `--- Context from step "<stepId>" (file: <path>) ---\n<content>\n---\n\n`.
8. Prepend the assembled context block to the original prompt and return it.

## Steps

1. **Create `context-injector.ts`**: Export `injectContext(runDir: string, stepId: string, prompt: string): string`. Read `DEFINITION.yaml` from `runDir` with `yaml.parse()`. Find the step matching `stepId`. If no `contextFrom`, return `prompt` unchanged. For each referenced step ID in `contextFrom`, look up that step in the definition, iterate its `produces` paths, resolve each relative to `runDir`, read with `readFileSync` if `existsSync` returns true. Truncate to `MAX_CONTEXT_CHARS = 10_000` per artifact. Format as clearly-delimited context blocks. Prepend the assembled context to `prompt` and return.

2. **Handle edge cases**: Missing artifact files — skip silently (the step may not have produced the file yet, or it's optional). Step ID in `contextFrom` not found in definition — skip with a console warning. Empty `produces` array on a referenced step — skip (nothing to inject).

3. **Wire into `CustomWorkflowEngine.resolveDispatch()`**: After `getNextPendingStep(graph)` returns a step, extract the step's ID, call `injectContext(this.runDir, next.id, next.prompt)` to get the enriched prompt, and use it as `step.prompt` in the dispatch action. Import `injectContext` from `./context-injector.ts`.

4. **Write `context-injector.test.ts`**: Create temp run directories with DEFINITION.yaml and artifact files. Test cases:
   - Single-step context: step-2 has `contextFrom: ["step-1"]`, step-1 produces `output.md` → prompt is prepended with output.md content
   - Multi-step chain: step-3 has `contextFrom: ["step-1", "step-2"]` → prompt has both artifacts
   - Missing artifact file: referenced file doesn't exist on disk → gracefully skipped, prompt has context from other files that do exist
   - No contextFrom: step has no `contextFrom` field → prompt returned unchanged
   - Truncation: artifact content exceeds 10,000 chars → truncated with marker
   - Referenced step ID not in definition → skipped gracefully

## Must-Haves

- [ ] `injectContext()` reads DEFINITION.yaml and resolves `contextFrom` step references
- [ ] Each `produces` artifact is read from disk (relative to runDir) and prepended to the prompt
- [ ] Missing artifact files are skipped without crashing
- [ ] Artifacts are truncated to 10,000 characters each
- [ ] Context blocks are clearly delimited with step ID and file path labels
- [ ] `CustomWorkflowEngine.resolveDispatch()` calls `injectContext()` for enriched prompts
- [ ] All imports use `.ts` extensions (KNOWLEDGE.md rule)

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/context-injector.test.ts` — all tests pass
- `grep -q "injectContext" src/resources/extensions/gsd/custom-workflow-engine.ts` — wiring confirmed

## Inputs

- `src/resources/extensions/gsd/custom-workflow-engine.ts` — engine to modify: integrate injectContext into resolveDispatch
- `src/resources/extensions/gsd/definition-loader.ts` — types `StepDefinition`, `WorkflowDefinition` (read-only reference)
- `src/resources/extensions/gsd/graph.ts` — `GraphStep` type, `getNextPendingStep()` (read-only reference)

## Expected Output

- `src/resources/extensions/gsd/context-injector.ts` — new module: `injectContext(runDir, stepId, prompt)` with artifact reading and formatting
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — modified: `resolveDispatch()` calls `injectContext()` before returning dispatch
- `src/resources/extensions/gsd/tests/context-injector.test.ts` — new test file with 6+ test cases

## Observability Impact

- **Context injection visible in dispatch:** `resolveDispatch()` now calls `injectContext()` before returning the dispatch action, so the `step.prompt` in the dispatch contains the assembled context. Agents/callers see the enriched prompt without needing separate context lookup.
- **Truncation warnings:** When an artifact exceeds 10,000 chars, `console.warn` fires with the artifact path, source step ID, and before/after sizes — visible in process stderr.
- **Unknown step warnings:** When `contextFrom` references a step ID not in the definition, `console.warn` fires with the step ID pair — diagnosable from stderr.
- **Inspectable on disk:** `cat <runDir>/DEFINITION.yaml | grep -A3 contextFrom` shows which steps reference which context sources.
