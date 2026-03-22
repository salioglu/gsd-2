# S03: YAML Definition Schema + DAG Graph

**Goal:** YAML workflow definitions parse and validate against the V1 schema; `graph.ts` tracks step state in a DAG with dependency ordering; path traversal guards reject malicious produces paths; cycle detection catches invalid definitions.
**Demo:** Unit tests for validation, parsing, graph operations all pass — both files import cleanly under `--experimental-strip-types`.

## Must-Haves

- `definition-loader.ts` exports `WorkflowDefinition`, `StepDefinition`, `VerifyPolicy`, `IterateConfig` types plus `validateDefinition()`, `loadDefinition()`, `substituteParams()`, `substitutePromptString()` functions
- `graph.ts` exports `WorkflowGraph`, `GraphStep` types plus `readGraph()`, `writeGraph()`, `getNextPendingStep()`, `markStepComplete()`, `expandIteration()`, `initializeGraph()` functions
- `validateDefinition()` catches: missing/invalid version, missing step fields, path traversal in `produces`, duplicate step IDs, dangling dependencies, self-referencing dependencies, dependency cycles
- Path traversal guards on `produces` and `iterate.source` reject `..` patterns
- `substituteParams()` replaces `{{key}}` placeholders with defaults + overrides, rejects `..` values and unresolved placeholders
- All graph operations are immutable (return new objects)
- YAML uses snake_case, TypeScript uses camelCase — conversion happens at I/O boundaries
- Both files are pure data modules importing only `yaml`, `node:` builtins, and (for graph.ts) `definition-loader.js`

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all tests pass (25+ tests covering validation, loading, snake_case conversion, param substitution, gap validations)
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts` — all tests pass (15+ tests covering YAML I/O, DAG queries, iteration expansion, initializeGraph)
- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/definition-loader.ts').then(() => console.log('OK'))"` — prints OK
- `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/graph.ts').then(() => console.log('OK'))"` — prints OK

## Integration Closure

- Upstream surfaces consumed: `engine-types.ts` (read-only reference for type alignment — S03 files do NOT import from it)
- New wiring introduced in this slice: none — these are standalone data modules
- What remains before the milestone is truly usable end-to-end: S04 bridges definition-loader and graph to the custom engine; S05 wires verification/context; S06 wires iterate

## Observability / Diagnostics

- **Validation error surface:** `validateDefinition()` returns `{ valid: boolean; errors: string[] }` — callers log or surface the full error list for agent self-repair. All errors are collected (no short-circuit), so one call reveals every problem.
- **Substitution error surface:** `substituteParams()` throws with the offending key name and violation type (path traversal or unresolved placeholder) for traceability.
- **Graph state inspection:** `readGraph()` / `writeGraph()` use YAML on disk — human-readable, diffable, and inspectable with `cat` or any YAML viewer.
- **Step status tracking:** Each `GraphStep` has `status`, `startedAt`, `finishedAt` fields visible in GRAPH.yaml.
- **No secrets or PII:** These modules handle workflow structure only — no user data, credentials, or PII passes through. No redaction constraints needed.

## Tasks

- [x] **T01: Implement definition-loader.ts with V1 schema validation and parameter substitution** `est:25m`
  - Why: Provides the YAML parsing, validation, and type conversion layer that graph.ts and all downstream slices depend on. Includes the four validation gaps (duplicate IDs, dangling deps, self-deps, cycles) not present in prior art.
  - Files: `src/resources/extensions/gsd/definition-loader.ts`, `src/resources/extensions/gsd/tests/definition-loader.test.ts`
  - Do: Adapt prior art (354 lines) from `feat/declarative-workflow-engine-v2` branch. Add four new validations to `validateDefinition()`: duplicate step ID check, dangling dependency check, self-referencing dependency check, cycle detection (DFS topological sort). Port the 25 existing tests, add ~10 new tests for the gap validations and `substituteParams`. Export `substitutePromptString` for graph.ts use.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all 30+ tests pass
  - Done when: All validation, loading, conversion, and substitution tests pass; import smoke test succeeds

- [x] **T02: Implement graph.ts with DAG operations, iteration expansion, and YAML I/O** `est:20m`
  - Why: Provides the step-state tracking DAG that `CustomWorkflowEngine` (S04) reads and writes. Depends on `WorkflowDefinition` type from T01.
  - Files: `src/resources/extensions/gsd/graph.ts`, `src/resources/extensions/gsd/tests/graph-operations.test.ts`
  - Do: Adapt prior art (~290 lines) from `feat/declarative-workflow-engine-v2` branch. Rename `graphFromDefinition` to `initializeGraph` (export both for compatibility). Write comprehensive test file covering: `readGraph`/`writeGraph` round-trip, `getNextPendingStep` with dependency ordering, `markStepComplete` immutability, `expandIteration` with downstream dep rewriting and error cases, `initializeGraph` from valid definition, atomic write safety.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/graph-operations.test.ts` — all 15+ tests pass
  - Done when: All graph operation tests pass; import smoke test succeeds; `initializeGraph` is exported

## Files Likely Touched

- `src/resources/extensions/gsd/definition-loader.ts`
- `src/resources/extensions/gsd/graph.ts`
- `src/resources/extensions/gsd/tests/definition-loader.test.ts`
- `src/resources/extensions/gsd/tests/graph-operations.test.ts`
