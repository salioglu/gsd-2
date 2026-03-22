---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T01: Implement definition-loader.ts with V1 schema validation and parameter substitution

**Slice:** S03 — YAML Definition Schema + DAG Graph
**Milestone:** M001

## Description

Create `definition-loader.ts` — the YAML parsing, validation, and type conversion layer for V1 workflow definitions. This is a pure data module with no GSD runtime dependencies (imports only `yaml` and `node:` builtins). Adapt from prior art on `feat/declarative-workflow-engine-v2` branch (354 lines) and add four validation gaps: duplicate step IDs, dangling dependencies, self-referencing dependencies, and cycle detection.

Write comprehensive tests in `definition-loader.test.ts` covering all validation paths, loading, snake_case→camelCase conversion, parameter substitution, and the new gap validations.

## Steps

1. **Extract prior art and create `definition-loader.ts`.** Run `git show feat/declarative-workflow-engine-v2:src/resources/extensions/gsd/definition-loader.ts` to get the 354-line source. Place it at `src/resources/extensions/gsd/definition-loader.ts`. This file already has: types (`WorkflowDefinition`, `StepDefinition`, `VerifyPolicy`, `IterateConfig`), `validateDefinition()`, `loadDefinition()`, `substituteParams()`, `substitutePromptString()`.

2. **Add four new validations to `validateDefinition()`.** Insert these checks after the per-step field validation loop, before the return statement:
   - **Duplicate step ID check:** Collect all step IDs into a `Set`, compare `Set.size` vs array length. Error: `"Duplicate step id: <id>"`.
   - **Dangling dependency check:** Build `Set<string>` of all valid step IDs. For each step, check every entry in `requires`/`depends_on` exists in the set. Error: `"Step '<id>' requires unknown step '<depId>'"`.
   - **Self-referencing dependency check:** For each step, check its requires array doesn't contain its own ID. Error: `"Step '<id>' depends on itself"`.
   - **Cycle detection:** DFS-based cycle detection on the step dependency graph. Error: `"Cycle detected: A → B → C → A"` naming the cycle path.
   
   All four checks should only run after the step-level field validation passes (i.e., only when all steps have valid `id` fields). Collect errors — don't short-circuit.

3. **Extract and adapt prior test file.** Run `git show feat/declarative-workflow-engine-v2:src/resources/extensions/gsd/tests/definition-loader.test.ts` to get the ~482-line test file. Place at `src/resources/extensions/gsd/tests/definition-loader.test.ts`. Update: change `graphFromDefinition` import to `initializeGraph` (or remove — graph tests belong in T02's test file). Keep all 25 existing tests.

4. **Add new tests for gap validations and substituteParams.** Add tests for:
   - Duplicate step IDs → error containing "Duplicate step id"
   - Dangling dependency → error containing "requires unknown step"
   - Self-referencing dependency → error containing "depends on itself"
   - Simple cycle (A→B→A) → error containing "Cycle detected"
   - Complex cycle (A→B→C→A) → error containing "Cycle detected"
   - Diamond dependency (A→B, A→C, B→D, C→D) → accepted (no cycle)
   - `substituteParams` with defaults and overrides → placeholders replaced
   - `substituteParams` with `..` in value → error
   - `substituteParams` with unresolved placeholder → error
   
   Remove the `graphFromDefinition` test from this file (it belongs in T02's `graph-operations.test.ts`).

5. **Run tests and verify.** Execute `node --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts`. All 30+ tests must pass. Run import smoke test: `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/definition-loader.ts').then(() => console.log('OK'))"`.

## Must-Haves

- [ ] `validateDefinition()` rejects duplicate step IDs with descriptive error
- [ ] `validateDefinition()` rejects dangling dependencies (step references non-existent step ID)
- [ ] `validateDefinition()` rejects self-referencing dependencies
- [ ] `validateDefinition()` rejects cyclic dependencies with a cycle-path error message
- [ ] `validateDefinition()` accepts diamond dependency patterns (no false positive cycles)
- [ ] `substituteParams()` replaces `{{key}}` placeholders, merging defaults with overrides
- [ ] `substituteParams()` rejects values containing `..` (path traversal guard)
- [ ] `substituteParams()` errors on unresolved `{{key}}` placeholders after substitution
- [ ] All imports use `.js` extension for ESM compatibility
- [ ] File imports only `yaml` and `node:` builtins — no GSD module imports

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all tests pass (30+ tests)
- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/definition-loader.ts').then(() => console.log('OK'))"` — prints OK

## Inputs

- `src/resources/extensions/gsd/engine-types.ts` — read-only reference for type alignment (S03 does NOT import from this file)

## Expected Output

- `src/resources/extensions/gsd/definition-loader.ts` — V1 schema types, validation with gap fixes, loading, param substitution (~380 lines)
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — comprehensive test suite (30+ tests, ~550 lines)
