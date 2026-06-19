import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import { documentFlowPrompt } from '../../../src/prompts/document-flow.js';

function text(rendered: { messages: { content: { text: string } }[] }) {
  return rendered.messages[0].content.text;
}

describe('document_flow prompt', () => {
  it('includes Mermaid by default', () => {
    const args = documentFlowPrompt.argsSchema.parse({ flowId: 'f1' });
    expect(args.includeDiagram).toBe(true);
    const out = documentFlowPrompt.render(args);
    expect(text(out)).toContain('Mermaid');
  });

  it('omits Mermaid when includeDiagram is false', () => {
    const out = documentFlowPrompt.render({ flowId: 'f1', includeDiagram: false });
    expect(text(out)).not.toContain('Mermaid');
    expect(text(out)).toContain('Plain-text description');
  });

  it('requires flowId', () => {
    expect(() => documentFlowPrompt.argsSchema.parse({})).toThrow(ZodError);
  });
});
