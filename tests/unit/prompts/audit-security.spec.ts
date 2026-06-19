import { describe, it, expect } from 'vitest';

import { auditSecurityPrompt } from '../../../src/prompts/audit-security.js';

function text(rendered: { messages: { content: { text: string } }[] }) {
  return rendered.messages[0].content.text;
}

describe('audit_security prompt', () => {
  it('without flowId reports "across all flows"', () => {
    const args = auditSecurityPrompt.argsSchema.parse({});
    const out = auditSecurityPrompt.render(args);
    expect(text(out)).toContain('across all flows');
  });

  it('with flowId narrows scope to that flow', () => {
    const args = auditSecurityPrompt.argsSchema.parse({ flowId: 'flow-X' });
    const out = auditSecurityPrompt.render(args);
    expect(text(out)).toContain('in flow "flow-X"');
    expect(text(out)).toContain('flowId="flow-X"');
  });

  it('severity="high" filter line appears', () => {
    const out = auditSecurityPrompt.render({ severity: 'high' });
    expect(text(out)).toContain('report only HIGH-severity findings');
  });

  it('default severity is "all"', () => {
    const args = auditSecurityPrompt.argsSchema.parse({});
    expect(args.severity).toBe('all');
    const out = auditSecurityPrompt.render(args);
    expect(text(out)).toContain('report all findings');
  });
});
