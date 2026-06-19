/**
 * Prompts library types — modular MCP prompts with Zod-validated arguments.
 */
import type { ZodTypeAny, z } from 'zod';

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface RenderedPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface RenderedPrompt {
  description: string;
  messages: RenderedPromptMessage[];
}

export interface PromptDefinition<S extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  arguments: PromptArgument[];
  argsSchema: S;
  render: (args: z.infer<S>) => RenderedPrompt | Promise<RenderedPrompt>;
}

export class PromptNotFoundError extends Error {
  constructor(name: string) {
    super(`Prompt not found: ${name}`);
    this.name = 'PromptNotFoundError';
  }
}

export function userMessage(text: string): RenderedPromptMessage {
  return { role: 'user', content: { type: 'text', text } };
}
