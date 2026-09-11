import { LLMProvider, GenerationOptions } from './providers';
import { IntentRouter } from './IntentRouter';
import { SchemaDictionary } from './types';

export interface OrchestratorConfig<T extends SchemaDictionary> {
  provider: LLMProvider;
  router: IntentRouter<T>;
  /** Number of times to auto-retry and repair JSON on Zod failure */
  maxRetries?: number;
  /** System instruction for the heavy generator */
  systemPrompt: string;
}

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
   * Sends the prompt to the LLM, attempts to parse and validate it,
   * and automatically asks the LLM to fix it if Zod validation fails.
   */
  public async execute(input: string, options?: Omit<GenerationOptions, 'systemInstruction'>): Promise<void> {
    let attempts = 0;
    let currentInput = input;
    let currentHistory = options?.history ? [...options.history] : [];

    while (attempts <= this.maxRetries) {
      try {
        // Step 1: Generate the raw JSON text from the heavy model
        // We use generateText and parse manually, so we can feed errors back
        const rawText = await this.config.provider.generateText(currentInput, {
          ...options,
          temperature: 0, // Deterministic greedy decoding
          systemInstruction: this.config.systemPrompt,
          history: currentHistory,
        });

        // Step 2: Try to process it through the strict Zod router
        let validationError: Error | null = null;
        
        // We override the onError callback temporarily for this execution
        // to catch errors instead of firing the global error handler
        const originalOnError = (this.config.router as any).config.onError;
        
        (this.config.router as any).config.onError = (err: Error) => {
          validationError = err;
        };

        await this.config.router.process(rawText);

        // Restore global error handler
        (this.config.router as any).config.onError = originalOnError;

        if (!validationError) {
          // Success! The router fired the onExecute callbacks.
          return;
        }

        // Step 3: We hit a Zod or Parse error. We need to repair.
        console.warn(`[Orchestrator] Validation failed on attempt ${attempts + 1}:`, (validationError as Error).message);
        
        // Feed the error back to the LLM
        currentHistory.push({ role: 'user', content: currentInput });
        currentHistory.push({ role: 'assistant', content: rawText });
        
        currentInput = `Your previous JSON response failed schema validation. Please fix the following error and return ONLY valid JSON: ${(validationError as Error).message}`;
        attempts++;

      } catch (fatalError) {
        // Fatal LLM API error (network, rate limit, etc)
        throw fatalError;
      }
    }

    throw new Error(`Orchestrator failed to generate valid JSON after ${this.maxRetries + 1} attempts.`);
  }
}
