import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import { debugFlowPrompt } from '../../../src/prompts/debug-flow.js';

function text(rendered: { messages: { content: { text: string } }[] }) {
  return rendered.messages[0].content.text;
}

describe('debug_flow prompt', () => {
  it('renders with only flowId and reports symptom as "none"', () => {
    const out = debugFlowPrompt.render({ flowId: 'abc' });
    expect(text(out)).toContain('"abc"');
    expect(text(out)).toContain('User-reported symptom: none');
  });

  it('includes the provided symptom verbatim', () => {
    const out = debugFlowPrompt.render({
      flowId: 'flow-42',
      symptom: 'no messages on mqtt out',
    });
    expect(text(out)).toContain('User-reported symptom: no messages on mqtt out');
  });

  it('rejects an empty flowId via Zod', () => {
    expect(() => debugFlowPrompt.argsSchema.parse({ flowId: '' })).toThrow(ZodError);
  });

  it('declares flowId as required and symptom as optional', () => {
    const argMap = Object.fromEntries(debugFlowPrompt.arguments.map(a => [a.name, a]));
    expect(argMap.flowId.required).toBe(true);
    expect(argMap.symptom.required).toBe(false);
  });
});
