import { z } from 'zod';

export type SchemaDictionary = Record<string, z.ZodTypeAny>;

/**
 * How the router finds JSON in a model response.
 * - `strict`: the response must be raw JSON, or consist of exactly one fenced code block.
 * - `fenced` (default): also accepts prose around a fenced code block, using the first block.
 * - `lenient`: also falls back to the outermost `{…}` / `[…]` in unfenced prose. Use with care:
 *   JSON the model only quoted as an example (or echoed from user input) will be executed.
 */
export type ExtractionMode = 'strict' | 'fenced' | 'lenient';

export type ErrorHandler = (error: Error, rawData: unknown) => void | Promise<void>;

export interface IntentRouterConfig<T extends SchemaDictionary> {
  schemas: T;
  onExecute: <K extends keyof T>(intent: K, payload: z.infer<T[K]>) => void | Promise<void>;
  onError: ErrorHandler;
  /** Defaults to `fenced`. */
  extraction?: ExtractionMode;
}

export interface ExecutedIntent<T extends SchemaDictionary> {
  intent: keyof T;
  payload: z.infer<T[keyof T]>;
}

export interface IntentError {
  error: Error;
  /** The intent object that failed, or the raw response text when it could not be parsed. */
  raw: unknown;
}

export interface ProcessOptions<T extends SchemaDictionary> {
  /** Replaces the configured `onError` for this call only. */
  onError?: ErrorHandler;
  /** Return true to skip a validated intent without executing it (it is listed in `skipped`). */
  skip?: (intent: keyof T, payload: z.infer<T[keyof T]>) => boolean;
}

export interface ProcessResult<T extends SchemaDictionary> {
  executed: ExecutedIntent<T>[];
  skipped: ExecutedIntent<T>[];
  errors: IntentError[];
}
