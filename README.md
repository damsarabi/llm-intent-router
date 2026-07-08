# llm-intent-router

[![npm version](https://badge.fury.io/js/llm-intent-router.svg)](https://badge.fury.io/js/llm-intent-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Deterministic state routing for unpredictable LLM outputs.**

Stop piping raw LLM text into your application state. `llm-intent-router` is a lightweight, framework-agnostic middleware that safely translates non-deterministic AI text into strictly typed, Zod-validated execution callbacks.

## The Problem

Wiring Generative AI into traditional UI state (React, Zustand, Redux) is notoriously fragile:
1. **Markdown Formatting:** Even in JSON mode, models often wrap responses in Markdown (e.g., ````json ... ````). 
2. **Hallucinations:** LLMs hallucinate object properties or return invalid enum values.
3. **Fatal Crashes:** Passing a raw `JSON.parse(aiOutput)` directly to your global store will eventually crash your application.

## The Solution

`llm-intent-router` acts as a safety barrier between your AI and your application code. It automatically:
- **Sanitizes** strings by stripping Markdown code blocks.
- **Parses** the payload (gracefully handling both single JSON objects and arrays/batches).
- **Validates** the LLM's payload against your strict `zod` schemas.
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

## License

MIT
