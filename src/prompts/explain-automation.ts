import { z } from 'zod';

import type { PromptDefinition } from './types.js';
import { userMessage } from './types.js';

const argsSchema = z.object({
  flowId: z.string().min(1, 'flowId is required'),
  audience: z.enum(['developer', 'end-user']).default('developer'),
});

export const explainAutomationPrompt: PromptDefinition<typeof argsSchema> = {
  name: 'explain_automation',
  description:
    'Explain a Node-RED flow in plain language for the given audience: what triggers it, what it does, where data ends up.',
  arguments: [
    { name: 'flowId', description: 'ID of the flow to explain', required: true },
    {
      name: 'audience',
      description: 'Target audience: "developer" (default) or "end-user"',
      required: false,
    },
  ],
  argsSchema,
  render: ({ flowId, audience }) => {
    const audienceNote =
      audience === 'end-user'
        ? 'For "end-user" audience: skip implementation details, focus on outcomes and user impact.'
        : 'For "developer" audience: include node-level detail and side effects.';

    const text = [
      `Explain Node-RED flow "${flowId}" to a ${audience}.`,
      '',
      'Steps:',
      `1. Fetch the flow: \`get_flow(flowId="${flowId}")\`.`,
      '2. Identify the trigger nodes (inject, mqtt-in, http-in, schedule).',
      '3. Trace the data path through processing nodes.',
      '4. List all side effects (outbound MQTT, HTTP, function nodes with global writes).',
      '',
      'Format:',
      '- **What triggers it:** ...',
      '- **What it does:** (one-paragraph plain-language summary)',
      '- **Where the data ends up:** ...',
      '- **Key nodes:** [list with one-line role each]',
      '',
      "Use Hebrew if the flow's label/comments are in Hebrew, otherwise English.",
      audienceNote,
    ].join('\n');

    return {
      description: `Explain Node-RED flow ${flowId} (${audience})`,
      messages: [userMessage(text)],
    };
  },
};
