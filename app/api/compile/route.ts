import { env } from 'cloudflare:workers';

type CompilePage = { id: number; label: string; image: string };
type CompileRequest = { request?: string; notebook?: string; pages?: CompilePage[] };

const compilationSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'sections'],
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['heading', 'lines', 'sourcePageIds', 'sourceRegions'],
        properties: {
          heading: { type: 'string' },
          lines: { type: 'array', maxItems: 4, items: { type: 'string' } },
          sourcePageIds: { type: 'array', items: { type: 'integer' } },
          sourceRegions: {
            type: 'array', maxItems: 4,
            items: {
              type: 'object', additionalProperties: false,
              required: ['pageId', 'x', 'y', 'width', 'height'],
              properties: {
                pageId: { type: 'integer' },
                x: { type: 'number', minimum: 0, maximum: 1000 },
                y: { type: 'number', minimum: 0, maximum: 1000 },
                width: { type: 'number', minimum: 1, maximum: 1000 },
                height: { type: 'number', minimum: 1, maximum: 1000 },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'This request must come from Scribbly.' }, { status: 403 });

  let body: CompileRequest;
  try { body = (await request.json()) as CompileRequest; }
  catch { return Response.json({ error: 'The compilation request was not valid.' }, { status: 400 }); }

  const prompt = body.request?.trim().slice(0, 500);
  const pages = body.pages?.slice(0, 8).filter((page) => Number.isFinite(page.id) && page.label && page.image.startsWith('data:image/png;base64,'));
  if (!prompt || !pages?.length) return Response.json({ error: 'Add some notes before compiling them.' }, { status: 400 });

  const apiKey = (env as unknown as Record<string, string | undefined>).OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Scribbly AI has not been connected yet.' }, { status: 503 });

  const pageGuide = pages.map((page, index) => `Image ${index + 1}: page id ${page.id}, title "${page.label}"`).join('\n');
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: `Notebook: ${body.notebook?.slice(0, 100) || 'Untitled'}\nUser request: ${prompt}\n\n${pageGuide}` },
    ...pages.map((page) => ({ type: 'input_image', image_url: page.image, detail: 'high' })),
  ];

  try {
    const result = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', store: false,
        instructions: `You compile handwritten study notes by locating the user's original ink. Read every supplied page image carefully and follow the user request exactly.

For formulas: find equations, identities, rules, and formula blocks.
For examples: find complete worked-example blocks, especially anything marked EX, EXAMPLE, or followed by working.
For definitions: find the term and its full written definition.
For custom requests: locate every relevant handwritten block.

For every matching item, return a tight sourceRegions rectangle around the complete original handwritten block. Coordinates are normalized from 0 to 1000 relative to the full image: x from the left, y from the top, width and height. Do not combine distant items into one large region. pageId must be one supplied in the prompt. sourcePageIds must list the same pages used by sourceRegions. Use heading only as a short generated label. Keep lines empty when original handwriting exists; lines are a fallback only for relevant typed content that has no handwritten source region. Do not invent facts. If nothing matches the request, return an empty sections array.`,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: 'scribbly_compilation', strict: true, schema: compilationSchema } },
        max_output_tokens: 1800,
      }),
    });
    const data = await result.json() as { output_text?: string; error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (!result.ok) return Response.json({ error: data.error?.message || 'The AI could not compile these notes.' }, { status: result.status });
    const outputText = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!outputText) throw new Error('The AI returned an empty result.');
    return Response.json(JSON.parse(outputText));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The AI could not compile these notes.' }, { status: 500 });
  }
}
