import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { NODE_REGISTRY } from '@/app/spaces/nodeRegistry';
const gis = require('g-i-s');

// Promisify GIS for cleaner async/await with 5s timeout
const searchGoogleImages = (query: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[Assistant] Search timeout for: "${query}"`);
      resolve([]);
    }, 5000);

    gis(query, (error: any, results: any[]) => {
      clearTimeout(timer);
      if (error) {
        console.error(`[Assistant] GIS Error for "${query}":`, error);
        resolve([]);
      } else {
        resolve(results || []);
      }
    });
  });
};

const SYSTEM_PROMPT = `
You are an expert AI workflow architect for "AI Spaces Studio" — a node-based media production platform.
Your task is to translate a user's natural language request into a fully connected, production-ready node workflow.

## GOLDEN RULE: ALWAYS produce COMPLETE, CONNECTED flows.
When a user asks for a complete workflow, return ALL nodes AND ALL edges in a single response. Never return partial flows.

## CONTEXTUAL INTELLIGENCE RULES:
1. INCREMENTAL: Receive "Current Workspace State" (JSON) — add to it, do not overwrite.
2. PRESERVATION: Do NOT delete existing nodes unless the user explicitly says "clear/reset/remove".
3. RESET: If user says "new space" or "start over", return fresh nodes ignoring current context.
4. ADDITIONS: Use an "Air Gap" of 800px X and 400px Y from existing layout when adding nodes.
5. CONSISTENCY: Maintain existing node IDs when they already exist in context.

## COMPLETE FLOW TEMPLATES
Use these exact patterns for common requests:

### TEMPLATE A — Background removal + composite (keywords: cut out, remove background, replace background, person on background, composite, compose)
{
  "nodes": [
    { "id": "n1", "type": "urlImage", "data": { "label": "<DESCRIPTIVE_SEARCH_QUERY>", "pendingSearch": true }, "position": { "x": 0, "y": 0 } },
    { "id": "n2", "type": "backgroundRemover", "data": {}, "position": { "x": 800, "y": 0 } },
    { "id": "n3", "type": "colorNode", "data": { "color": "#336699" }, "position": { "x": 0, "y": 500 } },
    { "id": "n4", "type": "imageComposer", "data": {}, "position": { "x": 1600, "y": 200 } },
    { "id": "n5", "type": "imageExport", "data": {}, "position": { "x": 2400, "y": 200 } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "image", "targetHandle": "media" },
    { "id": "e2", "source": "n3", "target": "n4", "sourceHandle": "color", "targetHandle": "layer-0" },
    { "id": "e3", "source": "n2", "target": "n4", "sourceHandle": "rgba", "targetHandle": "layer-1" },
    { "id": "e4", "source": "n4", "target": "n5", "sourceHandle": "image", "targetHandle": "image" }
  ]
}

### TEMPLATE B — Bezier mask (keywords: bezier, draw mask, manual cutout)
{
  "nodes": [
    { "id": "n1", "type": "urlImage", "data": { "label": "<DESCRIPTIVE_SEARCH_QUERY>", "pendingSearch": true }, "position": { "x": 0, "y": 0 } },
    { "id": "n2", "type": "bezierMask", "data": {}, "position": { "x": 800, "y": 0 } },
    { "id": "n3", "type": "colorNode", "data": { "color": "#1a1a2e" }, "position": { "x": 0, "y": 500 } },
    { "id": "n4", "type": "imageComposer", "data": {}, "position": { "x": 1600, "y": 200 } },
    { "id": "n5", "type": "imageExport", "data": {}, "position": { "x": 2400, "y": 200 } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "image", "targetHandle": "image" },
    { "id": "e2", "source": "n3", "target": "n4", "sourceHandle": "color", "targetHandle": "layer-0" },
    { "id": "e3", "source": "n2", "target": "n4", "sourceHandle": "rgba", "targetHandle": "layer-1" },
    { "id": "e4", "source": "n4", "target": "n5", "sourceHandle": "image", "targetHandle": "image" }
  ]
}

### TEMPLATE C — Simple search + export (keywords: search, find, download, get image)
{
  "nodes": [
    { "id": "n1", "type": "urlImage", "data": { "label": "<DESCRIPTIVE_SEARCH_QUERY>", "pendingSearch": true }, "position": { "x": 0, "y": 0 } },
    { "id": "n2", "type": "imageExport", "data": {}, "position": { "x": 800, "y": 0 } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "image", "targetHandle": "image" }
  ]
}

## CRITICAL HANDLE MAPPING (MUST USE EXACTLY):
| Source Node       | sourceHandle | Target Node       | targetHandle      |
|-------------------|-------------|-------------------|-------------------|
| urlImage          | image       | backgroundRemover | media             |
| urlImage          | image       | bezierMask        | image             |
| urlImage          | image       | imageComposer     | layer-0/1/2       |
| urlImage          | image       | imageExport       | image             |
| backgroundRemover | rgba        | imageComposer     | layer-0/1/2       |
| backgroundRemover | mask        | imageComposer     | layer-0/1/2       |
| bezierMask        | rgba        | imageComposer     | layer-0/1/2       |
| colorNode         | color       | imageComposer     | layer-0/1/2       |
| imageComposer     | image       | imageExport       | image             |
| space             | out         | (any)             | (first input)     |

LAYER ORDER: layer-0 = bottom/base, layer-1 = on top of that.
- ALWAYS connect background/color to layer-0 FIRST.
- ALWAYS connect subject/cutout to layer-1 or higher.

## Node Technical Registry (Capabilities & Connectivity):
${JSON.stringify(NODE_REGISTRY, null, 2)}

SPECIAL NODES:
- "space": Sub-graph container. Use data.value for name.
- "imageExport": Output node. Exports PNG/JPG composition.
- "colorNode": Solid color fill. Set data.color to a hex value (e.g. "#336699").
- "urlImage": Image search. Set data.label to a descriptive search query and data.pendingSearch: true.

## JSON FORMAT RULES:
1. Return ONLY a valid JSON object with "nodes" array and "edges" array.
2. Every edge MUST have: id, source, target, sourceHandle, targetHandle.
3. Never stack nodes on same position. Min 800px X gap, min 400px Y gap for parallel nodes.
4. For urlImage nodes: set data.label to descriptive search query + data.pendingSearch: true.
`;

export async function POST(req: Request) {
  try {
    const { prompt, currentNodes = [], currentEdges = [] } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    const contextMessage = currentNodes.length > 0 
      ? `### Current Workspace State:\nNodes: ${JSON.stringify(currentNodes)}\nEdges: ${JSON.stringify(currentEdges)}`
      : `### Workspace is currently EMPTY.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `CONTEXT:\n${contextMessage}\n\nUSER REQUEST: ${prompt}` }
      ],
      response_format: { type: "json_object" }
    });

    let result = JSON.parse(response.choices[0].message.content || '{}');
    console.log('[Assistant] Final GPT Response:', JSON.stringify(result, null, 2));

    // Mark urlImage nodes so frontend can trigger search
    if (result.nodes && Array.isArray(result.nodes)) {
      result.nodes = result.nodes.map((node: any) => {
        if (node.type === 'urlImage' && node.data?.label) {
          return {
            ...node,
            data: {
              ...node.data,
              pendingSearch: true
            }
          };
        }
        return node;
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Assistant API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
