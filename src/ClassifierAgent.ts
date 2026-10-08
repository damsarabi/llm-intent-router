import { LLMProvider } from './providers';

export interface ClassifierOptions {
  /** The system prompt defining when to classify as CHAT vs COMMAND */
  systemPrompt: string;
  /** History context to give the classifier */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Called when the provider call fails (the result is then COMMAND). */
  onError?: (error: Error) => void;
}

/** Strips code fences, quotes, backticks and trailing punctuation around a one-word answer. */
const normalizeLabel = (text: string) =>
  text
    .replace(/```[a-zA-Z]*/g, '')
    .replace(/["'`]/g, '')
    .replace(/[.!]+$/, '')
    .trim()
    .toUpperCase();

/**
 * A fast, deterministic router that uses a lightweight LLM call to classify
 * user input into binary paths (e.g., CHAT vs COMMAND).
 *
 * Only an exact CHAT answer counts as CHAT. Anything else, including a failed call, is COMMAND,
 * so an ambiguous classification always reaches the heavy model that can act on it.
 */
export class ClassifierAgent {
  constructor(private provider: LLMProvider) {}

  /**
   * Classifies the input. Returns 'CHAT' or 'COMMAND'.
   */
  public async classify(input: string, options: ClassifierOptions): Promise<'CHAT' | 'COMMAND'> {
    try {
      // Force greedy decoding for strict classification
      const result = await this.provider.generateText(input, {
        temperature: 0,
        systemInstruction: options.systemPrompt,
        history: options.history,
      });

      return normalizeLabel(result) === 'CHAT' ? 'CHAT' : 'COMMAND';
    } catch (error) {
      // Fail open to the heavy router
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      return 'COMMAND';
    }
  }
}
