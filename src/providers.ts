import { z } from 'zod';

/**
 * Agnostic interface for LLM calls.
 * This allows developers to plug in OpenAI, Google GenAI, Anthropic, or any custom client.
 */
export interface LLMProvider {
  /**
   * Generates a text response from the LLM.
   * Useful for classification or lightweight chat.
   */
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;

  /**
   * Generates a structured JSON response from the LLM.
   * Useful for the main command generation.
   */
  generateStructured<T>(prompt: string, schema?: z.ZodType<T>, options?: GenerationOptions): Promise<T>;
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
  // Generic chat history
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
