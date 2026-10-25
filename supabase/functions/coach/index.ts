// Pace AI coach. Proxies prompts built in the app (src/engine/prompt.ts) to the Claude API so the
// API key never ships inside the app.
//
// Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy:   supabase functions deploy coach
//
// Before selling: require a signed-in Supabase user (check the JWT's sub claim), and enforce a
// per-user daily limit (see coach_usage in the migration) so API costs stay inside the subscription price.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODELS = { coach: 'claude-sonnet-5-5', program: 'claude-haiku-5-5' } as const;
const MAX_TOKENS = { coach: 700, program: 2500 } as const;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let mode: keyof typeof MODELS = 'coach';
  let prompt = '';
  try {
    const body = await req.json();
    mode = body.mode === 'program' ? 'program' : 'coach';
    prompt = typeof body.prompt === 'string' ? body.prompt : '';
  } catch {
    return json({ error: 'Send JSON with a prompt.' }, 400);
  }
  if (!prompt.trim()) return json({ error: 'The prompt is empty.' }, 400);
  if (prompt.length > 60000) return json({ error: 'That prompt is too long.' }, 413);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'The coach is not set up yet.' }, 500);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELS[mode], max_tokens: MAX_TOKENS[mode], messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    console.error('Claude API error', res.status, data);
    return json({ error: res.status === 429 ? 'The coach is busy. Try again in a minute.' : 'The coach is unavailable right now.' }, 502);
  }
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n')
    .trim();
  if (!text) return json({ error: "The coach couldn't answer that. Try rewording it." }, 502);
  return json({ text });
});
