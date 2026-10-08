export interface SanitizeConfig {
  /** Property names to drop wherever they appear, e.g. `['eq', 'uuid', 'internalRefs']`. */
  omitKeys?: string[];
  /** Depth at which nested values are replaced with a marker. Defaults to 5. */
  maxDepth?: number;
}

/**
 * Prepares app state (for example a Zustand store) to be sent to an LLM as context:
 * drops functions and the keys you name, cuts off deep nesting, and replaces reference
 * cycles with a marker. An object referenced from two places is kept in both; only a
 * value that contains itself is a cycle.
 */
export function sanitizeForPrompt(state: unknown, config: SanitizeConfig = {}): unknown {
  const maxDepth = config.maxDepth ?? 5;
  const omitKeys = new Set(config.omitKeys ?? []);
  const ancestors = new WeakSet<object>();

  const walk = (value: unknown, depth: number): unknown => {
    if (typeof value === 'function') return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (depth >= maxDepth) return '[Max Depth Reached]';
    if (ancestors.has(value)) return '[Circular]';

    ancestors.add(value);
    let result: unknown;
    if (Array.isArray(value)) {
      result = value.map((item) => walk(item, depth + 1)).filter((item) => item !== undefined);
    } else {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        if (omitKeys.has(key)) continue;
        const sanitized = walk(child, depth + 1);
        if (sanitized !== undefined) out[key] = sanitized;
      }
      result = out;
    }
    ancestors.delete(value);
    return result;
  };

  return walk(state, 0);
}
