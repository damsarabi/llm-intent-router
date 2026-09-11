# llm-intent-router

[![npm version](https://img.shields.io/npm/v/@damsarabi/llm-intent-router.svg)](https://www.npmjs.com/package/@damsarabi/llm-intent-router)
[![codecov](https://codecov.io/gh/damsarabi/llm-intent-router/branch/main/graph/badge.svg)](https://codecov.io/gh/damsarabi/llm-intent-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/damsarabi/llm-intent-router/actions/workflows/ci.yml/badge.svg)](https://github.com/damsarabi/llm-intent-router/actions)

**Deterministic state routing for unpredictable LLM outputs.**

Stop piping raw LLM text into your application state. `llm-intent-router` is a lightweight, framework-agnostic middleware that safely translates non-deterministic AI text into strictly typed, Zod-validated execution callbacks.

## The Problem

Wiring Generative AI into traditional UI state (React, Zustand, Redux) is notoriously fragile:
1. **Markdown Formatting:** Even in JSON mode, models often wrap responses in Markdown (e.g., ````json ... ````). 
2. **Hallucinations:** LLMs hallucinate object properties or return invalid enum values.
3. **Fatal Crashes:** Passing a raw `JSON.parse(aiOutput)` directly to your global store will eventually crash your application.

## The Solution

`llm-intent-router` acts as a safety barrier and orchestration engine between your AI and your application code. It operates in two phases:

### Phase 1: The Orchestrator (Multi-Agent Routing)
Instead of piping all user input into an expensive, slow model, you can use the `ClassifierAgent` to do a cheap, fast binary check: *Is this just a chat, or an actionable command?* 
If it's a command, the `Orchestrator` takes over, using greedy decoding (`temperature: 0`) to force the LLM to output predictable JSON.

### Phase 2: The Intent Router (Validation & Repair)
Once the LLM outputs JSON, the Router:
- **Sanitizes** strings by stripping Markdown code blocks.
- **Parses** the payload (gracefully handling both single JSON objects and arrays/batches).
- **Validates** the LLM's payload against your strict `zod` schemas.
- **Auto-Repairs:** If Zod validation fails, the Orchestrator automatically feeds the exact Zod error back to the LLM so it can fix its own hallucination.
- **Routes** the validated data to your execution callback, entirely typed and safe.

## Installation

```bash
npm install llm-intent-router zod
```

## Quick Start

```typescript
import { IntentRouter } from 'llm-intent-router';
import { z } from 'zod';

// 1. Define your strict UI schemas
const schemas = {
  TOGGLE_THEME: z.object({
    theme: z.enum(['dark', 'light']),
  }),
  FILTER_TABLE: z.object({
    region: z.string(),
    minRevenue: z.number().optional(),
  }),
};

// 2. Initialize the router
const router = new IntentRouter({
  schemas,
  onExecute: (intent, payload) => {
    // 🟢 SAFE: 'payload' is strictly typed based on the matched intent.
    // Perfect place to dispatch to Zustand, Redux, or Context.
    console.log(`Executing ${intent}:`, payload);
  },
  onError: (error, rawItem) => {
    // 🔴 CAUGHT: The LLM hallucinated, or parsing failed. 
    // State remains protected.
    console.error('LLM Validation Failed:', error.message);
  },
});

// 3. Process raw AI responses (even messy ones)
const messyAiResponse = `
Here is your data:
\`\`\`json
[
  { "intent": "TOGGLE_THEME", "payload": { "theme": "dark" } },
  { "intent": "FILTER_TABLE", "payload": { "region": "North America" } }
]
\`\`\`
`;

// Automatically strips markdown, validates payloads, and fires onExecute twice.
router.process(messyAiResponse);
```

## Advanced: Batch Execution

The router natively supports batch execution. If the LLM returns an array of intent objects, `llm-intent-router` will parse the array and sequentially fire the `onExecute` callback for every valid intent in the batch.

## Advanced: The Orchestrator (Auto-Repair)

If you want the library to handle the actual LLM API calls, you can use the `Orchestrator`. It wraps your LLM SDK and automatically feeds Zod validation errors back to the model for self-correction.

```typescript
import { Orchestrator, ClassifierAgent } from 'llm-intent-router';

// Fast lane classification (e.g. Gemini Flash Lite)
const classifier = new ClassifierAgent(myFastLLMProvider);
const intentType = await classifier.classify(userInput, { systemPrompt: '...' });

if (intentType === 'COMMAND') {
  // Slow lane execution (e.g. Gemini Pro)
  const orchestrator = new Orchestrator({
    provider: myHeavyLLMProvider,
    router: myIntentRouter,
    maxRetries: 2, // If it hallucinates, it gets 2 chances to fix it!
    systemPrompt: 'You are a strict JSON command engine.'
  });

  await orchestrator.execute(userInput); // Validates and executes safely
}
```

## 🧪 Production Evals (Promptfoo)

A routing engine is only as good as its tests. `llm-intent-router` ships with a production-grade [Promptfoo](https://promptfoo.dev) evaluation suite in the `evals/` directory.

The suite mathematically proves the router's resilience across 4 dimensions:
1. **Dual-Routing Accuracy:** Proving the classifier accurately separates conversational chat from actionable commands.
2. **Schema Adherence:** Proving the generator outputs valid JSON matching complex Zod expectations.
3. **Resilience & Fallback:** Proving the system degrades gracefully when required data (like an `orderId`) is missing from the user's prompt.
4. **Batch Execution:** Proving the router can execute multiple distinct intents from a single prompt.

To run the evals:
```bash
npm install -g promptfoo
cd evals
promptfoo eval
promptfoo view
```

## License

MIT
