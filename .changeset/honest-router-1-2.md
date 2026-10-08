---
"@damsarabi/llm-intent-router": minor
---

Router, Orchestrator and packaging fixes.

- `process()` now returns `{ executed, skipped, errors }` and accepts per-call `onError` and `skip` options.
- New `extraction` option (`strict` | `fenced` | `lenient`). The default, `fenced`, now finds a fenced JSON block surrounded by prose, so some responses that used to go to `onError` now execute. Use `extraction: 'strict'` for the previous behaviour.
- Orchestrator: no longer swaps the router's `onError` (it was left replaced if `onExecute` threw), never re-executes intents that already ran when it retries, includes every validation error in the repair prompt, returns the result, throws `OrchestratorError` with the partial result, and reports retries through `onRetry` instead of `console.warn`.
- ClassifierAgent: only an exact `CHAT` answer is CHAT (previously any answer containing "CHAT", such as "COMMAND (not CHAT)"); provider failures go to an optional `onError` instead of `console.warn`.
- `LLMProvider.generateStructured` is now optional.
- New `sanitizeForPrompt()` helper.
- Packaging: no runtime dependencies (tsup's internals were listed by mistake), only `dist` is published, Zod 4 supported, license metadata is MIT.
