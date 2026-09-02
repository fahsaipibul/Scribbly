import { env } from 'cloudflare:workers';

type CompilePage = { id: number; label: string; image: string };
type CompileRequest = { request?: string; notebook?: string; pages?: CompilePage[] };

const compilationSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'sections'],
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['heading', 'lines', 'sourcePageIds'],
        properties: {
          heading: { type: 'string' },
          lines: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
          sourcePageIds: { type: 'array', items: { type: 'integer' } },
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
        instructions: 'You compile handwritten study notes. Read every supplied page image carefully. Follow the user request exactly. Preserve mathematical notation in plain keyboard-friendly form. Do not invent facts not present in the notes. Keep lines concise enough to fit on a handwritten study sheet. sourcePageIds must contain only page ids supplied in the prompt and must identify where each section came from.',
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
