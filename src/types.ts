import { z } from 'zod';

export type SchemaDictionary = Record<string, z.ZodTypeAny>;

export interface IntentRouterConfig<T extends SchemaDictionary> {
  schemas: T;
  onExecute: <K extends keyof T>(intent: K, payload: z.infer<T[K]>) => void | Promise<void>;
  onError: (error: Error, rawData: unknown) => void | Promise<void>;
}
