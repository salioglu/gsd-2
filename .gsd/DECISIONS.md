# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M002 | arch | Extension rewrite strategy | Clean rewrite, not iterative evolution | Current extension is 2K lines — small enough that rewriting is faster than refactoring. New architecture needed for modular tool files, self-healing layer, and multi-domain Swift CLI. | No |
| D002 | M002 | arch | Swift CLI architecture | Single binary with multiple source files, JSON stdin/stdout protocol | Proven pattern from current extension. One binary avoids compilation complexity. Multiple source files for organization. Mtime-based compilation caching. | Yes — if compile times become problematic |
| D003 | M002 | library | External dependencies for automation | Zero — Swift CLI uses only Apple frameworks, TS uses only existing deps (TypeBox) | User requirement. Avoids version rot, keeps startup fast, eliminates supply-chain risk. | No |
| D004 | M002 | arch | iOS Simulator UI interaction approach | Accessibility APIs + HID input (AXe CLI approach) | AXe CLI proves feasibility. Accessibility-first with coordinate fallback via HID. No external frameworks needed. | Yes — if accessibility tree access proves unreliable from CLI context |
| D005 | M002 | arch | Visual intelligence approach | On-device Vision framework for OCR, pixel diffing for visual regression | Zero API cost, fast, private. LLM vision handles subjective judgment via existing screenshot tool. | No |
| D006 | M002 | arch | Log reading approach | macOS `log` CLI with predicate filtering + xcodebuild output parsing + crash log reading | Covers all log sources (system, app, build, crash) via native tools. Structured output (JSON/ndjson) from `log` CLI. | No |
| D007 | M002 | arch | Reference architecture | browser-tools extension pattern (modular tool files, core state, lifecycle hooks) | browser-tools is 10K+ lines and works well. Same modular pattern scales to mac-tools complexity. | No |
| D008 | M002 | pattern | Self-healing interaction pattern | Auto-retry with configurable count, auto-wait for accessibility tree stability, fuzzy matching fallback | Native app UIs are dynamic — raw accessibility calls would be unreliable without retry/wait/fallback. | Yes — if specific patterns cause false positives |
| D009 | M002 | pattern | Process tracking | PID registry with session_shutdown cleanup hook | Prevents zombie processes. All launched apps/simulators tracked and cleaned on session end. | No |
| D010 | M002 | scope | iOS scope | Both macOS and iOS Simulator equally important | User confirmed both are core use cases. iPhone app verification is as important as macOS app verification. | No |
