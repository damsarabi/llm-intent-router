import { describe, it, expect } from 'vitest';
import { sanitizeForPrompt } from '../sanitizeForPrompt';

describe('sanitizeForPrompt', () => {
  it('strips omitted keys at any depth', () => {
    const state = { visible: 'keep me', eq: { a: 1 }, nested: { eq: 2, ok: true } };
    expect(sanitizeForPrompt(state, { omitKeys: ['eq'] })).toEqual({ visible: 'keep me', nested: { ok: true } });
  });

  it('strips functions from objects and arrays', () => {
    const state = { value: 1, run: () => 1, list: [1, () => 2, 3] };
    expect(sanitizeForPrompt(state)).toEqual({ value: 1, list: [1, 3] });
  });

  it('replaces a real cycle with a marker', () => {
    const state: Record<string, unknown> = { value: 1 };
    state.self = state;
    expect(sanitizeForPrompt(state)).toEqual({ value: 1, self: '[Circular]' });
  });

  it('keeps an object that is shared by two branches (not a cycle)', () => {
    const chord = { root: 'C', quality: 'maj7' };
    const state = { current: chord, history: [chord, chord] };
    expect(sanitizeForPrompt(state)).toEqual({ current: chord, history: [chord, chord] });
  });

  it('truncates at maxDepth', () => {
    const state = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
    expect(sanitizeForPrompt(state, { maxDepth: 4 })).toEqual({ a: { b: { c: { d: '[Max Depth Reached]' } } } });
  });

  it('passes primitives and null through, and drops a top-level function', () => {
    expect(sanitizeForPrompt(5)).toBe(5);
    expect(sanitizeForPrompt(null)).toBeNull();
    expect(sanitizeForPrompt(() => 1)).toBeUndefined();
  });
});
