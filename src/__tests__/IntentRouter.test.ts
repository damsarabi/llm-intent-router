import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { IntentRouter } from '../IntentRouter';

describe('IntentRouter', () => {
  let onExecute: any;
  let onError: any;
  let router: IntentRouter<any>;

  const schemas = {
    TEST_INTENT: z.object({
      message: z.string(),
    }),
    OTHER_INTENT: z.object({
      id: z.number(),
    }),
    FAIL_INTENT: z.any().superRefine(() => {
      throw new Error('Generic error');
    })
  };

  beforeEach(() => {
    onExecute = vi.fn();
    onError = vi.fn();
    router = new IntentRouter({ schemas, onExecute, onError });
  });

  it('should parse and execute a valid single JSON object', async () => {
    const rawInput = JSON.stringify({ intent: 'TEST_INTENT', payload: { message: 'hello' } });
    await router.process(rawInput);
    expect(onExecute).toHaveBeenCalledWith('TEST_INTENT', { message: 'hello' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('should parse and execute a valid array of JSON objects (batch execution)', async () => {
    const rawInput = JSON.stringify([
      { intent: 'TEST_INTENT', payload: { message: 'hello' } },
      { intent: 'OTHER_INTENT', payload: { id: 123 } },
    ]);
    await router.process(rawInput);
    expect(onExecute).toHaveBeenCalledTimes(2);
    expect(onExecute).toHaveBeenNthCalledWith(1, 'TEST_INTENT', { message: 'hello' });
    expect(onExecute).toHaveBeenNthCalledWith(2, 'OTHER_INTENT', { id: 123 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('should strip markdown blocks and parse', async () => {
    const rawInput = `\`\`\`json\n{ "intent": "TEST_INTENT", "payload": { "message": "hello markdown" } }\n\`\`\``;
    await router.process(rawInput);
    expect(onExecute).toHaveBeenCalledWith('TEST_INTENT', { message: 'hello markdown' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('should strip markdown blocks without a language tag and parse', async () => {
    const rawInput = `\`\`\`\n{ "intent": "TEST_INTENT", "payload": { "message": "hello markdown no lang" } }\n\`\`\``;
    await router.process(rawInput);
    expect(onExecute).toHaveBeenCalledWith('TEST_INTENT', { message: 'hello markdown no lang' });
  });

  it('should fail gracefully on invalid JSON', async () => {
    const rawInput = `{ bad json }`;
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][1]).toBe(rawInput);
  });

  it('should fail gracefully when payload is not an object', async () => {
    const rawInput = JSON.stringify("not an object");
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('Intent payload is not a valid object');
    expect(onError.mock.calls[0][1]).toBe("not an object");
  });

  it('should fail gracefully when intent property is missing', async () => {
    const rawInput = JSON.stringify({ payload: { message: 'hello' } });
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('Missing or invalid "intent" property in payload');
    expect(onError.mock.calls[0][1]).toEqual({ payload: { message: 'hello' } });
  });

  it('should fail gracefully when intent property is not a string', async () => {
    const rawInput = JSON.stringify({ intent: 123, payload: { message: 'hello' } });
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('Missing or invalid "intent" property in payload');
  });

  it('should fail gracefully when schema is not found', async () => {
    const rawInput = JSON.stringify({ intent: 'UNKNOWN', payload: { message: 'hello' } });
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('No schema found for intent: UNKNOWN');
  });

  it('should fail gracefully on Zod validation error', async () => {
    const rawInput = JSON.stringify({ intent: 'TEST_INTENT', payload: { message: 123 } });
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(z.ZodError);
    expect(onError.mock.calls[0][1]).toEqual({ intent: 'TEST_INTENT', payload: { message: 123 } });
  });

  it('should catch non-Zod errors thrown during parsing', async () => {
    const rawInput = JSON.stringify({ intent: 'FAIL_INTENT', payload: {} });
    await router.process(rawInput);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('Generic error');
    expect(onError.mock.calls[0][1]).toEqual({ intent: 'FAIL_INTENT', payload: {} });
  });

  it('should handle non-Error thrown from JSON.parse', async () => {
    const originalParse = JSON.parse;
    JSON.parse = vi.fn().mockImplementation(() => { throw 'String error'; });
    await router.process('dummy');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('String error');
    JSON.parse = originalParse; // Restore
  });

  it('should handle non-Error thrown from schema parsing', async () => {
    const schemas2 = {
      FAIL: z.any().superRefine(() => { throw 'String schema error'; })
    };
    const router2 = new IntentRouter({ schemas: schemas2, onExecute: vi.fn(), onError });
    await router2.process(JSON.stringify({ intent: 'FAIL', payload: {} }));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('String schema error');
  });

  it('should not swallow application errors thrown by onExecute', async () => {
    onExecute.mockRejectedValueOnce(new Error('App crashed!'));
    const rawInput = JSON.stringify({ intent: 'TEST_INTENT', payload: { message: 'hello' } });
    await expect(router.process(rawInput)).rejects.toThrow('App crashed!');
    expect(onError).not.toHaveBeenCalled();
  });
});
