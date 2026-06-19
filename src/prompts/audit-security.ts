import { z } from 'zod';

import type { PromptDefinition } from './types.js';
import { userMessage } from './types.js';

const argsSchema = z.object({
  flowId: z.string().min(1).optional(),
  severity: z.enum(['all', 'high']).default('all'),
});

export const auditSecurityPrompt: PromptDefinition<typeof argsSchema> = {
  name: 'audit_security',
  description:
    'Perform a basic security audit: exposed credentials, unauthenticated HTTP endpoints, unsafe eval in function nodes, sensitive global context.',
  arguments: [
    {
      name: 'flowId',
      description: 'Limit the audit to a specific flow (omit to audit all flows)',
      required: false,
    },
    {
      name: 'severity',
      description: 'Reporting threshold: "all" (default) or "high" only',
      required: false,
    },
  ],
  argsSchema,
  render: ({ flowId, severity }) => {
    const scopePhrase = flowId ? ` in flow "${flowId}"` : ' across all flows';
    const flowFilterArg = flowId ? `, flowId="${flowId}"` : '';
    const severityFilterLine =
      severity === 'high'
        ? 'Filter: report only HIGH-severity findings; suppress medium and low.'
        : 'Filter: report all findings (high, medium, low).';

    const text = [
      `Audit Node-RED for security issues${scopePhrase}.`,
      '',
      'Checks:',
      '1. **Credentials in plaintext** — search for nodes with `username`, `password`, `apikey`, `token` properties not using the `credentials` storage.',
      `   Use: \`search_flows(query="password"${flowFilterArg})\`, \`search_flows(query="apikey"${flowFilterArg})\`, \`search_flows(query="token"${flowFilterArg})\`.`,
      '',
      '2. **Unauthenticated HTTP endpoints** — find `http in` nodes; check the flow path for an auth middleware.',
      `   Use: \`search_flows(type="http in"${flowFilterArg})\`.`,
      '',
      '3. **eval / new Function in function nodes** — unsafe dynamic code.',
      `   Use: \`search_flows(type="function"${flowFilterArg})\`, then fetch each and check for \`eval(\`, \`new Function(\`, \`require(\`.`,
      '',
      '4. **Exposed global context** — sensitive keys in global context.',
      '   Use: `get_context(scope="global")`.',
      '',
      'Report each finding as: severity (high/medium/low) → location → evidence → fix.',
      severityFilterLine,
    ].join('\n');

    return {
      description: flowId
        ? `Security audit for flow ${flowId} (severity: ${severity})`
        : `Security audit across all flows (severity: ${severity})`,
      messages: [userMessage(text)],
    };
  },
};
