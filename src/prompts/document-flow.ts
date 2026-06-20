import { z } from 'zod';

import { userMessage, type PromptDefinition } from './types.js';

const argsSchema = z.object({
  flowId: z.string().min(1, 'flowId is required'),
  includeDiagram: z.boolean().default(true),
});

export const documentFlowPrompt: PromptDefinition<typeof argsSchema> = {
  name: 'document_flow',
  description:
    'Generate a complete Markdown document for a Node-RED flow: overview, trigger, data flow (with optional Mermaid diagram), nodes table, dependencies, configuration.',
  arguments: [
    { name: 'flowId', description: 'ID of the flow to document', required: true },
    {
      name: 'includeDiagram',
      description: 'Include a Mermaid diagram of node connections (default: true)',
      required: false,
    },
  ],
  argsSchema,
  render: ({ flowId, includeDiagram }) => {
    const diagramLine = includeDiagram
      ? '<Mermaid `graph TD` of node connections, one edge per wire.>'
      : '<Plain-text description of the data flow path through the nodes.>';

    const text = [
      `Generate complete documentation for Node-RED flow "${flowId}".`,
      '',
      'Steps:',
      `1. \`get_flow(flowId="${flowId}")\` — fetch nodes + wires.`,
      '2. Identify: trigger → processors → outputs → side effects.',
      '3. Build sections:',
      '',
      '## Overview',
      'One paragraph: purpose, trigger, output.',
      '',
      '## Trigger',
      'Trigger node(s) details (type, schedule/topic/path).',
      '',
      '## Data Flow',
      diagramLine,
      '',
      '## Nodes',
      'Table: id | type | name | purpose.',
      '',
      '## Dependencies',
      'External: MQTT topics, HTTP endpoints, HA entities, npm packages.',
      '',
      '## Configuration',
      'Required env vars, credentials, context variables.',
      '',
      'Output as a single Markdown document, ready to paste into a wiki.',
    ].join('\n');

    return {
      description: `Documentation for Node-RED flow ${flowId}`,
      messages: [userMessage(text)],
    };
  },
};
