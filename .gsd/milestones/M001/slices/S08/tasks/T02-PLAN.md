---
estimated_steps: 3
estimated_files: 4
skills_used: []
---

# T02: Write bundled example YAMLs and validation test

**Slice:** S08 — Workflow Creator Skill + Bundled Examples
**Milestone:** M001

## Description

Create 3 bundled YAML workflow definitions that demonstrate the engine's key features (context chaining, verification policies, parameters, iterate/fan-out, diamond dependencies) and a test that proves all 3 pass `validateDefinition()` from `definition-loader.ts`.

The examples serve as both reference material and forward inputs for S09's end-to-end integration test. Each example exercises different features so together they demonstrate the full engine capability surface.

## Steps

1. **Write `blog-post-pipeline.yaml`** — A 3-step linear chain demonstrating `context_from` and `params`:
   - `version: 1`, `name: blog-post-pipeline`, `params: { topic: "AI", audience: "developers" }`
   - Step `research`: prompt uses `{{ topic }}` and `{{ audience }}`, produces `research.md`, verify with `content-heuristic` (minSize: 200)
   - Step `outline`: requires `[research]`, context_from `[research]`, produces `outline.md`, verify `content-heuristic`
   - Step `draft`: requires `[outline]`, context_from `[outline]`, produces `draft.md`, verify `content-heuristic` (minSize: 500)

2. **Write `code-audit.yaml`** — A 3-step workflow demonstrating `iterate` and `shell-command` verification:
   - Step `inventory`: produces `inventory.md`, verify `content-heuristic`
   - Step `audit-file`: requires `[inventory]`, context_from `[inventory]`, iterate with source `inventory.md` and pattern to capture file paths (e.g. `^- (.+\\.ts)$`), produces `audit-results.md`, verify `shell-command` with a command that checks file existence
   - Step `report`: requires `[audit-file]`, context_from `[audit-file]`, produces `audit-report.md`, verify `prompt-verify` with a prompt asking if the report covers all audited files

3. **Write `release-checklist.yaml`** and **validation test**:
   - `release-checklist.yaml` — 4 steps with diamond dependency pattern:
     - Step `changelog`: produces `CHANGELOG-draft.md`, verify `content-heuristic`
     - Step `version-bump`: requires `[changelog]`, produces `version.txt`, verify `shell-command` (grep version pattern)
     - Step `test-suite`: requires `[changelog]`, produces `test-results.md`, verify `shell-command` (exit code check)
     - Step `publish`: requires `[version-bump, test-suite]` (diamond join), produces `release-notes.md`, verify `human-review`
   - `bundled-workflow-defs.test.ts` — uses `node:test` + `node:assert/strict`. For each YAML file: read with `readFileSync`, parse with `yaml.parse()`, call `validateDefinition()`, assert `valid === true` and `errors.length === 0`. Import `validateDefinition` from `../definition-loader.ts`. Resolve file paths relative to `import.meta.url` using `fileURLToPath` + `join` to locate `src/resources/skills/create-workflow/templates/*.yaml`.

## Must-Haves

- [ ] `blog-post-pipeline.yaml` has 3 steps, uses `context_from`, `params`, and `content-heuristic` verify
- [ ] `code-audit.yaml` has a step with `iterate` config (source + pattern with capture group) and `shell-command` verify
- [ ] `release-checklist.yaml` has diamond dependencies (2 steps depend on same parent, 1 step depends on both) and `human-review` verify
- [ ] All 3 YAMLs pass `validateDefinition()` with `{ valid: true, errors: [] }`
- [ ] Test file uses `node:test` + `node:assert/strict` and runs with the project's test runner
- [ ] No `produces` path contains `..`
- [ ] Iterate `pattern` contains at least one capture group and is valid regex

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts` — all tests pass

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — `validateDefinition()` function and `WorkflowDefinition` types
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — existing test patterns for reference
- `src/resources/skills/create-workflow/templates/workflow-definition.yaml` — blank scaffold (created by T01, but T02 doesn't depend on its content — only creates files alongside it)

## Expected Output

- `src/resources/skills/create-workflow/templates/blog-post-pipeline.yaml` — linear chain + params example
- `src/resources/skills/create-workflow/templates/code-audit.yaml` — iterate + shell-command example
- `src/resources/skills/create-workflow/templates/release-checklist.yaml` — diamond deps + human-review example
- `src/resources/extensions/gsd/tests/bundled-workflow-defs.test.ts` — validation test for all 3 examples

## Observability Impact

- **New test file**: `bundled-workflow-defs.test.ts` runs 8 assertions — 1 per example YAML validation, 1 per structural property check (params/context_from/iterate/diamond), 1 cross-cutting path-traversal check, and 1 scaffold validation. All results surface via `node:test` runner with pass/fail counts.
- **Validation error tracing**: If any example YAML drifts from the V1 schema, `validateDefinition()` returns specific `errors[]` strings containing step IDs and field names — these appear in the test failure output for precise diagnosis.
- **Diagnostic command**: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types -e "import {validateDefinition} from './src/resources/extensions/gsd/definition-loader.ts'; import {parse} from 'yaml'; import {readFileSync} from 'fs'; ['blog-post-pipeline','code-audit','release-checklist'].forEach(f => { const r = validateDefinition(parse(readFileSync('src/resources/skills/create-workflow/templates/'+f+'.yaml','utf-8'))); console.log(f, JSON.stringify(r)) })"` — validates all 3 examples inline.
- **No runtime signals**: These are static YAML files and a test file — no runtime observability changes.
