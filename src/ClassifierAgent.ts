import { LLMProvider } from './providers';

export interface ClassifierOptions {
  /** The system prompt defining when to classify as CHAT vs COMMAND */
  systemPrompt: string;
  /** History context to give the classifier */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * A fast, deterministic router that uses a lightweight LLM call to classify
 * user input into binary paths (e.g., CHAT vs COMMAND).
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

      const clean = result.trim().toUpperCase();
      if (clean === 'CHAT' || clean.includes('CHAT')) {
        return 'CHAT';
      }
      return 'COMMAND';
    } catch (error) {
      console.warn('[ClassifierAgent] Classification failed, defaulting to COMMAND', error);
      // Fail open to the heavy router
      return 'COMMAND';
    }
  }
}
