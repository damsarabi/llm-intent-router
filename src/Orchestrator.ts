import { LLMProvider, GenerationOptions } from './providers';
import { IntentRouter } from './IntentRouter';
import { IntentError, ProcessResult, SchemaDictionary } from './types';

export interface OrchestratorConfig<T extends SchemaDictionary> {
  provider: LLMProvider;
  router: IntentRouter<T>;
  /** Number of times to auto-retry and repair JSON on Zod failure */
  maxRetries?: number;
  /** System instruction for the heavy generator */
  systemPrompt: string;
  /** Called before each repair attempt with the 1-based attempt that failed and its errors. */
  onRetry?: (attempt: number, errors: IntentError[]) => void;
}

/** Thrown when the model still returns invalid intents after every retry. */
export class OrchestratorError<T extends SchemaDictionary> extends Error {
  constructor(message: string, public readonly result: ProcessResult<T>) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

const intentKey = (intent: unknown, payload: unknown) => JSON.stringify([intent, payload]);

const describeError = ({ error, raw }: IntentError, index: number) => {
  const intent = raw && typeof raw === 'object' && 'intent' in raw ? String(raw.intent) : 'response';
  return `${index + 1}. ${intent}: ${error.message}`;
};

/**
 * The main Multi-Agent orchestrator. It acts as the bridge between the LLM and the strict IntentRouter.
 * Features automatic JSON repair loops via Zod error feedback.
 */
export class Orchestrator<T extends SchemaDictionary> {
  private maxRetries: number;

  constructor(private config: OrchestratorConfig<T>) {
    this.maxRetries = config.maxRetries ?? 2;
  }

  /**
   * Sends the prompt to the LLM, validates and executes the intents it returns, and asks the LLM to
   * fix any that fail validation. Intents that already executed are never executed again, even if
   * the model repeats them in a repair response.
   */
  public async execute(
    input: string,
    options?: Omit<GenerationOptions, 'systemInstruction'>
  ): Promise<ProcessResult<T>> {
    const total: ProcessResult<T> = { executed: [], skipped: [], errors: [] };
    const executedKeys = new Set<string>();
    const history = options?.history ? [...options.history] : [];
    let currentInput = input;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Provider errors (network, rate limit) are fatal and propagate without a retry.
      const rawText = await this.config.provider.generateText(currentInput, {
        ...options,
        temperature: 0, // Deterministic greedy decoding
        systemInstruction: this.config.systemPrompt,
        history,
      });

      // Per-call handlers: errors are collected here instead of reaching the router's onError.
      const result = await this.config.router.process(rawText, {
        onError: () => {},
        skip: (intent, payload) => executedKeys.has(intentKey(intent, payload)),
      });

      for (const entry of result.executed) executedKeys.add(intentKey(entry.intent, entry.payload));
      total.executed.push(...result.executed);
      total.skipped.push(...result.skipped);
      total.errors = result.errors;

      if (result.errors.length === 0) return total;
      if (attempt === this.maxRetries) break;

      this.config.onRetry?.(attempt + 1, result.errors);
      history.push({ role: 'user', content: currentInput });
      history.push({ role: 'assistant', content: rawText });
      currentInput = this.repairPrompt(result.errors, total);
    }

    throw new OrchestratorError(
      `Orchestrator failed to generate valid JSON after ${this.maxRetries + 1} attempts.`,
      total
    );
  }

  private repairPrompt(errors: IntentError[], total: ProcessResult<T>): string {
    const lines = ['Your previous JSON response failed schema validation:', ...errors.map(describeError)];
    if (total.executed.length > 0) {
      const done = total.executed.map((e) => `${String(e.intent)} ${JSON.stringify(e.payload)}`).join('; ');
      lines.push(`These intents were already executed and must not be repeated: ${done}.`);
    }
    lines.push('Return ONLY the corrected versions of the failed intents, as valid JSON.');
    return lines.join('\n');
  }
}
