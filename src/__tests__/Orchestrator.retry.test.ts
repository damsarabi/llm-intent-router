import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Orchestrator, OrchestratorError } from '../Orchestrator';
import { IntentRouter } from '../IntentRouter';
import { LLMProvider } from '../providers';

const schemas = {
  CHARGE: z.object({ orderId: z.string() }),
  NOTIFY: z.object({ message: z.string() }),
};

const providerReturning = (...responses: unknown[]): LLMProvider => {
  const generateText = vi.fn();
  responses.forEach((r) => generateText.mockResolvedValueOnce(JSON.stringify(r)));
  return { generateText };
};

const charge = { intent: 'CHARGE', payload: { orderId: 'A1' } };
const badNotify = { intent: 'NOTIFY', payload: { message: 42 } };
const goodNotify = { intent: 'NOTIFY', payload: { message: 'done' } };

describe('Orchestrator retries', () => {
  it('does not re-execute intents that already succeeded when the model resends the whole batch', async () => {
    const onExecute = vi.fn();
    const router = new IntentRouter({ schemas, onExecute, onError: vi.fn() });
    const provider = providerReturning([charge, badNotify], [charge, goodNotify]);

    const result = await new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('charge and notify');

    expect(onExecute.mock.calls).toEqual([
      ['CHARGE', { orderId: 'A1' }],
      ['NOTIFY', { message: 'done' }],
    ]);
    expect(result.executed).toEqual([charge, goodNotify]);
  });

  it('tells the model which intents already ran and asks only for the failed ones', async () => {
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError: vi.fn() });
    const provider = providerReturning([charge, badNotify], [goodNotify]);

    await new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('charge and notify');

    const repairPrompt = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(repairPrompt).toContain('CHARGE');
    expect(repairPrompt).toMatch(/already executed/i);
    expect(repairPrompt).toMatch(/only the corrected/i);
  });

  it('includes every validation error in the repair prompt, not just the last one', async () => {
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError: vi.fn() });
    const provider = providerReturning(
      [badNotify, { intent: 'CHARGE', payload: {} }],
      [goodNotify, charge]
    );

    await new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('x');

    const repairPrompt = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(repairPrompt).toContain('NOTIFY');
    expect(repairPrompt).toContain('CHARGE');
  });

  it('repairs a response that was not JSON at all', async () => {
    const onExecute = vi.fn();
    const router = new IntentRouter({ schemas, onExecute, onError: vi.fn() });
    const generateText = vi.fn().mockResolvedValueOnce('Sure, charging now!').mockResolvedValueOnce(JSON.stringify(charge));

    await new Orchestrator({ provider: { generateText }, router, systemPrompt: 'sys' }).execute('x');

    expect(generateText.mock.calls[1][0]).toMatch(/1\. response: /);
    expect(onExecute).toHaveBeenCalledWith('CHARGE', { orderId: 'A1' });
  });

  it("never calls the router's configured onError while it is repairing", async () => {
    const onError = vi.fn();
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError });
    const provider = providerReturning([badNotify], [goodNotify]);

    await new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('x');

    expect(onError).not.toHaveBeenCalled();
  });

  it("leaves the router's onError intact when onExecute throws mid-run", async () => {
    const onError = vi.fn();
    const onExecute = vi.fn().mockRejectedValueOnce(new Error('app crashed'));
    const router = new IntentRouter({ schemas, onExecute, onError });
    const provider = providerReturning([charge]);

    await expect(new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('x')).rejects.toThrow(
      'app crashed'
    );

    await router.process('not json');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports each retry through onRetry instead of logging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onRetry = vi.fn();
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError: vi.fn() });
    const provider = providerReturning([badNotify], [goodNotify]);

    await new Orchestrator({ provider, router, systemPrompt: 'sys', onRetry }).execute('x');

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toBe(1);
    expect(onRetry.mock.calls[0][1]).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throws an OrchestratorError carrying the partial result when retries run out', async () => {
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError: vi.fn() });
    const provider = providerReturning([charge, badNotify], [badNotify]);

    const run = new Orchestrator({ provider, router, systemPrompt: 'sys', maxRetries: 1 }).execute('x');

    await expect(run).rejects.toBeInstanceOf(OrchestratorError);
    const err = (await run.catch((e) => e)) as OrchestratorError<typeof schemas>;
    expect(err.result.executed).toEqual([charge]);
    expect(err.result.errors).toHaveLength(1);
  });

  it('does not pass a caller temperature through: generation is always greedy', async () => {
    const router = new IntentRouter({ schemas, onExecute: vi.fn(), onError: vi.fn() });
    const provider = providerReturning([charge]);

    await new Orchestrator({ provider, router, systemPrompt: 'sys' }).execute('x', { maxTokens: 50 });

    expect((provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      temperature: 0,
      maxTokens: 50,
      systemInstruction: 'sys',
    });
  });
});
