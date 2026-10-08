import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { IntentRouter } from '../IntentRouter';
import { ExtractionMode } from '../types';

const schemas = {
  TOGGLE_THEME: z.object({ theme: z.enum(['dark', 'light']) }),
  FILTER_TABLE: z.object({ region: z.string(), minRevenue: z.number().optional() }),
};

const makeRouter = (extraction?: ExtractionMode) => {
  const onExecute = vi.fn();
  const onError = vi.fn();
  const router = new IntentRouter({ schemas, onExecute, onError, extraction });
  return { router, onExecute, onError };
};

// The exact input from the README Quick Start.
const readmeResponse = `
Here is your data:
\`\`\`json
[
  { "intent": "TOGGLE_THEME", "payload": { "theme": "dark" } },
  { "intent": "FILTER_TABLE", "payload": { "region": "North America" } }
]
\`\`\`
`;

describe('IntentRouter JSON extraction', () => {
  it('runs the README Quick Start example (prose around a fenced block)', async () => {
    const { router, onExecute, onError } = makeRouter();
    await router.process(readmeResponse);
    expect(onError).not.toHaveBeenCalled();
    expect(onExecute).toHaveBeenNthCalledWith(1, 'TOGGLE_THEME', { theme: 'dark' });
    expect(onExecute).toHaveBeenNthCalledWith(2, 'FILTER_TABLE', { region: 'North America' });
  });

  it('uses the first fenced block when there are several', async () => {
    const { router, onExecute } = makeRouter();
    await router.process(
      'Done:\n```json\n{"intent":"TOGGLE_THEME","payload":{"theme":"light"}}\n```\nAlt:\n```json\n{"intent":"TOGGLE_THEME","payload":{"theme":"dark"}}\n```'
    );
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute).toHaveBeenCalledWith('TOGGLE_THEME', { theme: 'light' });
  });

  it('does not execute unfenced JSON embedded in prose by default', async () => {
    const { router, onExecute, onError } = makeRouter();
    await router.process('For example, {"intent":"TOGGLE_THEME","payload":{"theme":"dark"}} would switch themes.');
    expect(onExecute).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("'strict' only accepts raw JSON or a response that is entirely one fenced block", async () => {
    const strict = makeRouter('strict');
    await strict.router.process(readmeResponse);
    expect(strict.onExecute).not.toHaveBeenCalled();
    expect(strict.onError).toHaveBeenCalledTimes(1);

    await strict.router.process('```json\n{"intent":"TOGGLE_THEME","payload":{"theme":"dark"}}\n```');
    expect(strict.onExecute).toHaveBeenCalledWith('TOGGLE_THEME', { theme: 'dark' });
  });

  it("'lenient' falls back to the outermost JSON object or array in prose", async () => {
    const { router, onExecute, onError } = makeRouter('lenient');
    await router.process('Sure! {"intent":"TOGGLE_THEME","payload":{"theme":"dark"}} Let me know.');
    expect(onError).not.toHaveBeenCalled();
    expect(onExecute).toHaveBeenCalledWith('TOGGLE_THEME', { theme: 'dark' });

    await router.process('Batch: [{"intent":"FILTER_TABLE","payload":{"region":"EU"}}]');
    expect(onExecute).toHaveBeenLastCalledWith('FILTER_TABLE', { region: 'EU' });
  });

  it("'lenient' still reports an error when nothing parses", async () => {
    const { router, onExecute, onError } = makeRouter('lenient');
    await router.process('No JSON here, just {broken braces}.');
    await router.process('Nothing at all');
    expect(onExecute).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('reports an error for a fenced block that is not valid JSON', async () => {
    const { router, onExecute, onError } = makeRouter();
    await router.process('Here:\n```json\n{ not json }\n```');
    expect(onExecute).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('IntentRouter.process result and per-call options', () => {
  it('returns what was executed and what failed', async () => {
    const { router } = makeRouter();
    const result = await router.process(
      JSON.stringify([
        { intent: 'TOGGLE_THEME', payload: { theme: 'dark' } },
        { intent: 'TOGGLE_THEME', payload: { theme: 'neon' } },
        { intent: 'UNKNOWN', payload: {} },
      ])
    );
    expect(result.executed).toEqual([{ intent: 'TOGGLE_THEME', payload: { theme: 'dark' } }]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].raw).toEqual({ intent: 'TOGGLE_THEME', payload: { theme: 'neon' } });
    expect(result.errors[1].error.message).toMatch(/No schema found for intent: UNKNOWN/);
    expect(result.skipped).toEqual([]);
  });

  it('returns the parse error in the result', async () => {
    const { router } = makeRouter();
    const result = await router.process('not json');
    expect(result.executed).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].raw).toBe('not json');
  });

  it('a per-call onError replaces the configured one for that call only', async () => {
    const { router, onError } = makeRouter();
    const callError = vi.fn();
    await router.process('not json', { onError: callError });
    expect(callError).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await router.process('still not json');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('skips intents the caller filters out, without executing them', async () => {
    const { router, onExecute } = makeRouter();
    const result = await router.process(
      JSON.stringify([
        { intent: 'TOGGLE_THEME', payload: { theme: 'dark' } },
        { intent: 'FILTER_TABLE', payload: { region: 'EU' } },
      ]),
      { skip: (intent) => intent === 'TOGGLE_THEME' }
    );
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute).toHaveBeenCalledWith('FILTER_TABLE', { region: 'EU' });
    expect(result.skipped).toEqual([{ intent: 'TOGGLE_THEME', payload: { theme: 'dark' } }]);
  });
});
