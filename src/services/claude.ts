/** Calls the Claude API directly with the key from Settings. */
import { Platform } from 'react-native';

export const COACH_MODEL = 'claude-sonnet-5-5';
export const READER_MODEL = 'claude-haiku-5-5';

export class ClaudeError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface ClaudeTurn { role: 'user' | 'assistant'; content: string }

export async function callClaude(o: { key: string; model: string; system?: string; messages: ClaudeTurn[]; maxTokens?: number; schema?: object; timeoutMs?: number }): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': o.key, 'anthropic-version': '2023-06-01' };
  if (Platform.OS === 'web') headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 45000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      signal: ctl.signal,
      body: JSON.stringify({
        model: o.model,
        max_tokens: o.maxTokens ?? 1200,
        ...(o.system ? { system: o.system } : {}),
        ...(o.schema ? { output_config: { format: { type: 'json_schema', schema: o.schema } } } : {}),
        messages: o.messages,
      }),
    });
    if (!res.ok) {
      let msg = `Claude returned ${res.status}`;
      try { const j = await res.json(); if (j?.error?.message) msg = j.error.message; } catch { /* keep the status message */ }
      throw new ClaudeError(msg, res.status);
    }
    const body = await res.json();
    if (body?.stop_reason === 'refusal') throw new ClaudeError('Claude declined that one.');
    const text: string | undefined = (body?.content ?? []).find((b: { type: string }) => b.type === 'text')?.text;
    if (!text) throw new ClaudeError('Claude sent nothing back.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** A short, human reason for a failed call. */
export function claudeReason(e: unknown): string {
  if (e instanceof ClaudeError) {
    if (e.status === 401) return 'Your Claude key was turned down. Check it in Settings.';
    if (e.status === 429) return 'Claude is busy right now. Try again in a moment.';
    if (e.status === 400 && /credit|billing/i.test(e.message)) return 'Your Claude account is out of credits. Add some at platform.claude.com.';
    if (e.status && e.status >= 500) return 'Claude is having trouble right now. Try again in a moment.';
    return e.message;
  }
  if (e instanceof Error && e.name === 'AbortError') return 'Claude took too long. Try again.';
  return 'Couldn’t reach Claude. Check your internet.';
}

/** Checks a key with the smallest possible call. */
export async function testClaudeKey(key: string): Promise<string | null> {
  try {
    await callClaude({ key, model: READER_MODEL, maxTokens: 5, messages: [{ role: 'user', content: 'Reply with OK.' }], timeoutMs: 20000 });
    return null;
  } catch (e) {
    return claudeReason(e);
  }
}
