/**
 * Prompts registry — central list/get for all MCP prompts.
 */
import { auditSecurityPrompt } from './audit-security.js';
import { debugFlowPrompt } from './debug-flow.js';
import { documentFlowPrompt } from './document-flow.js';
import { explainAutomationPrompt } from './explain-automation.js';
import type { PromptDefinition, RenderedPrompt, PromptArgument } from './types.js';
import { PromptNotFoundError } from './types.js';

export interface ListedPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
}

class PromptRegistry {
  private readonly prompts: Map<string, PromptDefinition>;

  constructor(prompts: PromptDefinition[]) {
    this.prompts = new Map(prompts.map(p => [p.name, p]));
  }

  list(): ListedPrompt[] {
    return Array.from(this.prompts.values()).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }));
  }

  async get(name: string, args: unknown): Promise<RenderedPrompt> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new PromptNotFoundError(name);
    }
    const parsed = prompt.argsSchema.parse(args ?? {});
    return await prompt.render(parsed);
  }

  has(name: string): boolean {
    return this.prompts.has(name);
  }
}

export const promptRegistry = new PromptRegistry([
  debugFlowPrompt,
  explainAutomationPrompt,
  auditSecurityPrompt,
  documentFlowPrompt,
]);

export { PromptNotFoundError } from './types.js';
export type { PromptDefinition, RenderedPrompt, PromptArgument } from './types.js';
