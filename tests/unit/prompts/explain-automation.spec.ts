import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import { explainAutomationPrompt } from '../../../src/prompts/explain-automation.js';

function text(rendered: { messages: { content: { text: string } }[] }) {
  return rendered.messages[0].content.text;
}

describe('explain_automation prompt', () => {
  it('defaults audience to "developer"', () => {
    const args = explainAutomationPrompt.argsSchema.parse({ flowId: 'flow-1' });
    expect(args.audience).toBe('developer');
    const out = explainAutomationPrompt.render(args);
    expect(text(out)).toContain('to a developer');
  });

  it('end-user audience changes the output instructions', () => {
    const out = explainAutomationPrompt.render({ flowId: 'flow-1', audience: 'end-user' });
    expect(text(out)).toContain('to a end-user');
    expect(text(out)).toContain('skip implementation details');
  });

  it('rejects invalid audience', () => {
    expect(() =>
      explainAutomationPrompt.argsSchema.parse({ flowId: 'x', audience: 'wrong' })
    ).toThrow(ZodError);
  });
});
