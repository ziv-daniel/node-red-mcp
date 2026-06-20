import { z } from 'zod';

import { userMessage, type PromptDefinition } from './types.js';

const argsSchema = z.object({
  flowId: z.string().min(1, 'flowId is required'),
  symptom: z.string().optional(),
});

export const debugFlowPrompt: PromptDefinition<typeof argsSchema> = {
  name: 'debug_flow',
  description:
    'Walks the agent through diagnosing a Node-RED flow: fetch, validate, check state, search nodes, then report root cause.',
  arguments: [
    { name: 'flowId', description: 'ID of the flow to debug', required: true },
    {
      name: 'symptom',
      description: 'Free-text description of the observed problem (optional)',
      required: false,
    },
  ],
  argsSchema,
  render: ({ flowId, symptom }) => {
    const symptomLine = symptom?.trim() || 'none';
    const text = [
      'You are debugging a Node-RED flow.',
      '',
      'Steps to follow:',
      `1. Call \`get_flow(flowId="${flowId}")\` to fetch the full flow definition.`,
      `2. Call \`validate_flow(flowId="${flowId}")\` to find structural errors.`,
      '3. Call `get_flow_state()` to confirm the flow is running.',
      `4. If the symptom mentions a specific node, use \`search_flows(flowId="${flowId}", query="<node-ref>")\`.`,
      `5. Cross-reference with \`get_context(scope="flow", flowId="${flowId}")\` if state-dependent.`,
      '',
      `User-reported symptom: ${symptomLine}`,
      '',
      'Report findings as: root cause → evidence → suggested fix.',
    ].join('\n');

    return {
      description: `Debug Node-RED flow ${flowId}`,
      messages: [userMessage(text)],
    };
  },
};
