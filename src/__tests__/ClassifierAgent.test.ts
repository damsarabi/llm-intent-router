import { describe, it, expect, vi } from 'vitest';
import { ClassifierAgent } from '../ClassifierAgent';
import { LLMProvider } from '../providers';

const classifierSaying = (text: string) => {
  const provider: LLMProvider = { generateText: vi.fn().mockResolvedValue(text) };
  return { provider, classifier: new ClassifierAgent(provider) };
};

describe('ClassifierAgent', () => {
  it.each(['CHAT', 'chat', ' Chat \n', '"CHAT"', 'CHAT.', '`CHAT`', '```\nCHAT\n```'])(
    'classifies %j as CHAT',
    async (answer) => {
      const { classifier } = classifierSaying(answer);
      expect(await classifier.classify('hi', { systemPrompt: 'sys' })).toBe('CHAT');
    }
  );

  it.each(['COMMAND', 'COMMAND (not CHAT)', 'Probably CHAT', 'CHATTY', '', 'I am not sure'])(
    'fails safe to COMMAND for %j',
    async (answer) => {
      const { classifier } = classifierSaying(answer);
      expect(await classifier.classify('hi', { systemPrompt: 'sys' })).toBe('COMMAND');
    }
  );

  it('uses greedy decoding and passes the system prompt and history', async () => {
    const { provider, classifier } = classifierSaying('CHAT');
    const history = [{ role: 'user' as const, content: 'earlier' }];
    await classifier.classify('hi', { systemPrompt: 'sys', history });
    expect(provider.generateText).toHaveBeenCalledWith('hi', {
      temperature: 0,
      systemInstruction: 'sys',
      history,
    });
  });

  it('fails safe to COMMAND when the provider throws, and reports the error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider: LLMProvider = { generateText: vi.fn().mockRejectedValue(new Error('timeout')) };
    const onError = vi.fn();
    const result = await new ClassifierAgent(provider).classify('hi', { systemPrompt: 'sys', onError });
    expect(result).toBe('COMMAND');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'timeout' }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('normalizes a non-Error rejection before reporting it', async () => {
    const provider: LLMProvider = { generateText: vi.fn().mockRejectedValue('boom') };
    const onError = vi.fn();
    await new ClassifierAgent(provider).classify('hi', { systemPrompt: 'sys', onError });
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
