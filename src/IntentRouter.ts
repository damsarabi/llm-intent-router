import { z } from 'zod';
import {
  ErrorHandler,
  ExtractionMode,
  IntentRouterConfig,
  ProcessOptions,
  ProcessResult,
  SchemaDictionary,
} from './types';

const WHOLE_FENCE = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/;
const FIRST_FENCE = /```[a-zA-Z]*\s*([\s\S]*?)```/;
const OUTERMOST_JSON = /(\{[\s\S]*\}|\[[\s\S]*\])/;

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export class IntentRouter<T extends SchemaDictionary> {
  private config: IntentRouterConfig<T>;

  constructor(config: IntentRouterConfig<T>) {
    this.config = config;
  }

  /** Returns the parsed JSON, or throws the error from the first candidate tried. */
  private parseResponse(rawInput: string): unknown {
    const mode: ExtractionMode = this.config.extraction ?? 'fenced';
    const text = rawInput.trim();
    const whole = text.match(WHOLE_FENCE);
    const candidates = [whole ? whole[1] : text];

    if (mode !== 'strict') {
      const fenced = text.match(FIRST_FENCE);
      if (fenced) candidates.push(fenced[1]);
    }
    if (mode === 'lenient') {
      const outer = text.match(OUTERMOST_JSON);
      if (outer) candidates.push(outer[1]);
    }

    let firstError: unknown;
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate.trim());
      } catch (error) {
        firstError ??= error;
      }
    }
    throw firstError;
  }

  public async process(rawInput: string, options: ProcessOptions<T> = {}): Promise<ProcessResult<T>> {
    const onError: ErrorHandler = options.onError ?? this.config.onError;
    const result: ProcessResult<T> = { executed: [], skipped: [], errors: [] };
    const fail = async (error: Error, raw: unknown) => {
      result.errors.push({ error, raw });
      await onError(error, raw);
    };

    let parsedData: unknown;
    try {
      parsedData = this.parseResponse(rawInput);
    } catch (error) {
      await fail(toError(error), rawInput);
      return result;
    }

    // Normalize to an array to handle batch execution
    const intents = Array.isArray(parsedData) ? parsedData : [parsedData];

    for (const intentObj of intents) {
      if (!intentObj || typeof intentObj !== 'object') {
        await fail(new Error('Intent payload is not a valid object'), intentObj);
        continue;
      }

      const { intent, payload } = intentObj as { intent?: unknown; payload?: unknown };
      if (!intent || typeof intent !== 'string') {
        await fail(new Error('Missing or invalid "intent" property in payload'), intentObj);
        continue;
      }

      const schema = this.config.schemas[intent as keyof T];
      if (!schema) {
        await fail(new Error(`No schema found for intent: ${intent}`), intentObj);
        continue;
      }

      let validPayload: z.infer<T[keyof T]>;
      try {
        validPayload = schema.parse(payload);
      } catch (error) {
        await fail(toError(error), intentObj);
        continue;
      }

      const entry = { intent: intent as keyof T, payload: validPayload };
      if (options.skip?.(entry.intent, entry.payload)) {
        result.skipped.push(entry);
        continue;
      }

      await this.config.onExecute(entry.intent, entry.payload);
      result.executed.push(entry);
    }

    return result;
  }
}
