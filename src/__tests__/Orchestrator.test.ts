import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../Orchestrator';
import { IntentRouter } from '../IntentRouter';
import { LLMProvider } from '../providers';
import { z } from 'zod';

describe('Orchestrator', () => {
  const mockSchemas = {
    TEST_INTENT: z.object({
      field: z.string()
    })
  };

  it('successfully generates and validates on first attempt', async () => {
    const mockProvider: LLMProvider = {
      generateText: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'TEST_INTENT',
        payload: { field: 'value' }
      })),
      generateStructured: vi.fn()
    };

    const mockExecute = vi.fn();
    const router = new IntentRouter({
      schemas: mockSchemas,
      onExecute: mockExecute,
      onError: vi.fn()
    });

    const orchestrator = new Orchestrator({
      provider: mockProvider,
      router,
      systemPrompt: 'You are a test agent',
      maxRetries: 2
    });

    await orchestrator.execute('do something');

    expect(mockProvider.generateText).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith('TEST_INTENT', { field: 'value' });
  });

  it('repairs a bad JSON payload by feeding the Zod error back to the LLM', async () => {
    // First attempt: returns bad payload (number instead of string)
    // Second attempt: returns fixed payload
    const mockProvider: LLMProvider = {
      generateText: vi.fn()
        .mockResolvedValueOnce(JSON.stringify({
          intent: 'TEST_INTENT',
          payload: { field: 123 }
        }))
        .mockResolvedValueOnce(JSON.stringify({
          intent: 'TEST_INTENT',
          payload: { field: 'fixed value' }
        })),
      generateStructured: vi.fn()
    };

    const mockExecute = vi.fn();
    const router = new IntentRouter({
      schemas: mockSchemas,
      onExecute: mockExecute,
      onError: vi.fn()
    });

    const orchestrator = new Orchestrator({
      provider: mockProvider,
      router,
      systemPrompt: 'You are a test agent',
      maxRetries: 2
    });

    await orchestrator.execute('do something');

    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);
    // Ensure the second call includes the error message in the history
    const secondCallArg = (mockProvider.generateText as any).mock.calls[1][0];
    expect(secondCallArg).toContain('Expected string, received number');
    
    expect(mockExecute).toHaveBeenCalledWith('TEST_INTENT', { field: 'fixed value' });
  });

  it('throws an error if max retries are exceeded', async () => {
    // Always returns invalid payload
    const mockProvider: LLMProvider = {
      generateText: vi.fn().mockResolvedValue(JSON.stringify({
        intent: 'TEST_INTENT',
        payload: { field: 123 }
      })),
      generateStructured: vi.fn()
    };

    const router = new IntentRouter({
      schemas: mockSchemas,
      onExecute: vi.fn(),
      onError: vi.fn()
    });

    const orchestrator = new Orchestrator({
      provider: mockProvider,
      router,
      systemPrompt: 'You are a test agent',
      maxRetries: 1 // Only 1 retry allowed (2 attempts total)
    });

    await expect(orchestrator.execute('do something')).rejects.toThrow(/failed to generate valid JSON after 2 attempts/);
    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);
  });
});
