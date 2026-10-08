# llm-intent-router

[![npm version](https://img.shields.io/npm/v/@damsarabi/llm-intent-router.svg)](https://www.npmjs.com/package/@damsarabi/llm-intent-router)
[![codecov](https://codecov.io/gh/damsarabi/llm-intent-router/branch/main/graph/badge.svg)](https://codecov.io/gh/damsarabi/llm-intent-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/damsarabi/llm-intent-router/actions/workflows/ci.yml/badge.svg)](https://github.com/damsarabi/llm-intent-router/actions)

Turn LLM JSON output into typed, validated calls into your app.

You define a Zod schema per intent. The router takes the model's raw text, finds the JSON, validates each intent against its schema, and calls your handler only with payloads that passed. Anything else goes to your error handler, so a malformed response never reaches your state.

On top of the router, two optional pieces implement a dual-lane pattern: a cheap `ClassifierAgent` that decides whether a message is plain chat or a command, and an `Orchestrator` that calls the heavier model and feeds validation errors back to it until the output is valid. The design follows the AI routing in [Jamprovise](https://jamprovise.com).

No runtime dependencies; `zod` (v3.25+ or v4) is a peer dependency.

## Install

```bash
npm install @damsarabi/llm-intent-router zod
```

## Quick start

```typescript
import { IntentRouter } from '@damsarabi/llm-intent-router';
import { z } from 'zod';

const router = new IntentRouter({
  schemas: {
    TOGGLE_THEME: z.object({ theme: z.enum(['dark', 'light']) }),
    FILTER_TABLE: z.object({ region: z.string(), minRevenue: z.number().optional() }),
  },
  onExecute: (intent, payload) => {
    // payload is typed for the matched intent: dispatch to Zustand, Redux, etc.
    console.log(`Executing ${intent}:`, payload);
  },
  onError: (error, raw) => {
    // Unparseable JSON, unknown intent, or a payload that failed validation.
    console.error('Rejected:', error.message, raw);
  },
});

const response = `
Here is your data:
\`\`\`json
[
  { "intent": "TOGGLE_THEME", "payload": { "theme": "dark" } },
  { "intent": "FILTER_TABLE", "payload": { "region": "North America" } }
]
\`\`\`
`;

const result = await router.process(response);
// result.executed: both intents; result.errors: []
```

The response is either one `{ intent, payload }` object or an array of them. Intents in an array run in order, and one invalid item doesn't stop the others.

## Finding the JSON

Models often wrap JSON in a code fence or add a sentence around it. The `extraction` option controls how forgiving the router is:

| Mode | Accepts |
|---|---|
| `strict` | Raw JSON, or a response that is exactly one fenced block |
| `fenced` (default) | Also prose around a fenced block (the first block is used) |
| `lenient` | Also the outermost `{…}` or `[…]` in unfenced prose |

`lenient` is off by default for a reason: if the model quotes JSON as an example ("for instance, `{"intent": "REFUND", …}`"), or echoes JSON a user pasted into the chat, that JSON gets executed.

## The result of `process()`

```typescript
const { executed, skipped, errors } = await router.process(text, {
  onError: (error) => {/* replaces the configured onError for this call */},
  skip: (intent, payload) => false, // return true to validate an intent without executing it
});
```

`executed` and `skipped` hold `{ intent, payload }` entries. Each entry in `errors` holds the `error` and the `raw` item that caused it (or the whole response text if it couldn't be parsed). Errors thrown by your own `onExecute` are not caught: they propagate to the caller.

## Orchestrator: generate, validate, repair

```typescript
import { Orchestrator, OrchestratorError } from '@damsarabi/llm-intent-router';

const orchestrator = new Orchestrator({
  provider: heavyModel,     // any LLMProvider, see below
  router,
  systemPrompt: 'You are a strict JSON command engine. Intents: TOGGLE_THEME, FILTER_TABLE.',
  maxRetries: 2,            // default 2
  onRetry: (attempt, errors) => console.warn(`attempt ${attempt} failed`, errors),
});

try {
  const { executed } = await orchestrator.execute(userInput);
} catch (e) {
  if (e instanceof OrchestratorError) console.error(e.result.errors);
  else throw e; // provider errors (network, rate limit) are not retried
}
```

Generation always uses `temperature: 0`. If any intent fails validation, the Orchestrator sends the model the validation errors and asks for corrected versions of the failed intents only. Intents that already ran are never run again, even if the model repeats them, so a retry can't duplicate a side effect. While it is retrying, the router's own `onError` isn't called; after the last attempt it throws an `OrchestratorError` whose `result` lists what ran and what still failed.

## ClassifierAgent: the fast lane

```typescript
import { ClassifierAgent } from '@damsarabi/llm-intent-router';

const lane = await new ClassifierAgent(fastModel).classify(userInput, {
  systemPrompt: 'Answer with exactly one word: CHAT for small talk or questions, COMMAND for anything that changes the app.',
});
```

Only an exact `CHAT` answer counts (case, quotes, code fences and a trailing period are ignored). Anything else, including a provider error, returns `COMMAND`, so an uncertain classification goes to the model that can act on it rather than being answered as chat. Pass `onError` to observe provider failures.

## Providers

The Orchestrator and classifier talk to models through a small interface, so any SDK works:

```typescript
import type { LLMProvider } from '@damsarabi/llm-intent-router';

const provider: LLMProvider = {
  async generateText(prompt, { systemInstruction, temperature, history } = {}) {
    // call your model and return its text
  },
};
```

`demo.ts` has a complete Gemini adapter and runs the repair loop against a real model (`GEMINI_API_KEY=… npx tsx demo.ts`).

## Sending app state as context

`sanitizeForPrompt(state, { omitKeys, maxDepth })` prepares a state object for a prompt: it drops functions and the keys you name, cuts off deep nesting (default depth 5), and replaces reference cycles with `"[Circular]"`.

## Tests and evals

The package is covered by Vitest (`npm test`), run in CI against Node 22 and 24 with Zod 3 and Zod 4.

`evals/` is a separate [Promptfoo](https://promptfoo.dev) suite for the example system prompt in `evals/system-prompt.txt`. It checks that a model following that prompt returns intents the router would accept: chat vs. command, schema shape, asking for missing data instead of inventing it, and batches. It tests the prompt and the model (OpenAI by default), not this package's code.

```bash
cd evals && npx promptfoo eval
```

## License

MIT
