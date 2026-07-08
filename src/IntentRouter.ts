import { z } from 'zod';
import { IntentRouterConfig, SchemaDictionary } from './types';

export class IntentRouter<T extends SchemaDictionary> {
  private config: IntentRouterConfig<T>;

  constructor(config: IntentRouterConfig<T>) {
    this.config = config;
  }

  private stripMarkdown(rawInput: string): string {
    const text = rawInput.trim();
    // Matches markdown code blocks, capturing the content inside (ignoring leading lang tags like json)
    const blockMatch = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    if (blockMatch && blockMatch[1]) {
      return blockMatch[1].trim();
    }
    return text;
  }

  public async process(rawInput: string): Promise<void> {
    const strippedInput = this.stripMarkdown(rawInput);
    let parsedData: any;

    try {
      parsedData = JSON.parse(strippedInput);
    } catch (error) {
      await this.config.onError(error as Error, rawInput);
      return;
    }

    // Normalize to an array to handle batch execution
    const intents = Array.isArray(parsedData) ? parsedData : [parsedData];

    for (const intentObj of intents) {
      if (!intentObj || typeof intentObj !== 'object') {
        await this.config.onError(
          new Error('Intent payload is not a valid object'),
          intentObj
        );
        continue;
      }

      const { intent, payload } = intentObj;
      if (!intent || typeof intent !== 'string') {
        await this.config.onError(
          new Error('Missing or invalid "intent" property in payload'),
          intentObj
        );
        continue;
      }

      const schema = this.config.schemas[intent as keyof T];
      if (!schema) {
        await this.config.onError(
          new Error(`No schema found for intent: ${intent}`),
          intentObj
        );
        continue;
      }

      try {
        const validPayload = schema.parse(payload);
        await this.config.onExecute(intent as keyof T, validPayload as any);
      } catch (error) {
        if (error instanceof z.ZodError) {
          await this.config.onError(error, intentObj);
        } else {
          await this.config.onError(error as Error, intentObj);
        }
      }
    }
  }
}
