import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import { promptRegistry, PromptNotFoundError } from '../../../src/prompts/index.js';

describe('promptRegistry', () => {
  it('lists all four prompts', () => {
    const names = promptRegistry.list().map(p => p.name);
    expect(names.sort()).toEqual([
      'audit_security',
      'debug_flow',
      'document_flow',
      'explain_automation',
    ]);
  });

  it('returns MCP-shaped prompt entries (name, description, arguments)', () => {
    for (const entry of promptRegistry.list()) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('description');
      expect(Array.isArray(entry.arguments)).toBe(true);
      for (const arg of entry.arguments) {
        expect(arg).toHaveProperty('name');
        expect(arg).toHaveProperty('description');
      }
    }
  });

  it('throws PromptNotFoundError for unknown name', async () => {
    await expect(promptRegistry.get('not_a_prompt', {})).rejects.toBeInstanceOf(
      PromptNotFoundError
    );
  });

  it('throws ZodError when required args are missing', async () => {
    await expect(promptRegistry.get('debug_flow', {})).rejects.toBeInstanceOf(ZodError);
  });

  it('has() returns true for known prompts and false otherwise', () => {
    expect(promptRegistry.has('debug_flow')).toBe(true);
    expect(promptRegistry.has('totally_made_up')).toBe(false);
  });
});
