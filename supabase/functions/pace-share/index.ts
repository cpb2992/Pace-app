/**
 * pace-share: the athlete's phone uploads a coach report; the coach reads it with a private link.
 *
 * POST { action: 'register' }                         → { id, secret }       new phone, no auth
 * POST { action: 'view', token }                      → { report, at }       the coach page, no auth
 * POST { action: 'push', report }   + Bearer secret   → { at, live, viewed }
 * POST { action: 'link' }           + Bearer secret   → { token }            new link; the old one stops working
 * POST { action: 'unlink' }         + Bearer secret   → { ok }               link off, data kept
 * POST { action: 'status' }         + Bearer secret   → { live, viewed, at }
 * POST { action: 'delete' }         + Bearer secret   → { ok }               everything removed
 *
 * Deploy with verify_jwt off: requests are authorized by the phone's secret or the link token, both
 * stored only as SHA-256 hashes in public.pace_athletes (RLS on, no policies; service role only).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const secretKeys = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); } catch { return {}; } })();
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || secretKeys.default;
const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const MAX_BODY = 600_000;
const MAX_NEW_PER_HOUR = 30;

async function sha256(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes: number) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'That report is too big.' }, 413);
  let body: Record<string, unknown>;
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: 'Bad JSON.' }, 400); }
  const action = String(body.action ?? '');

  try {
    if (action === 'view') {
      const token = String(body.token ?? '');
      if (token.length < 20 || token.length > 100) return json({ error: 'not_found' }, 404);
      const { data, error } = await db.from('pace_athletes').select('id, report, report_at').eq('view_hash', await sha256(token)).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'not_found' }, 404);
      await db.from('pace_athletes').update({ viewed_at: new Date().toISOString() }).eq('id', data.id);
      return json({ report: data.report, at: data.report_at });
    }

    if (action === 'register') {
      const since = new Date(Date.now() - 3_600_000).toISOString();
      const { count } = await db.from('pace_athletes').select('id', { count: 'exact', head: true }).gte('created_at', since);
      if ((count ?? 0) >= MAX_NEW_PER_HOUR) return json({ error: 'Too many new phones this hour. Try again later.' }, 429);
      const secret = randomToken(32);
      const { data, error } = await db.from('pace_athletes').insert({ secret_hash: await sha256(secret) }).select('id').single();
      if (error) throw error;
      return json({ id: data.id, secret });
    }

    // Everything else comes from the athlete's phone, signed with its secret.
    const secret = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (secret.length < 40 || secret.length > 100) return json({ error: 'unauthorized' }, 401);
    const { data: me, error } = await db.from('pace_athletes').select('id, view_hash, viewed_at, report_at').eq('secret_hash', await sha256(secret)).maybeSingle();
    if (error) throw error;
    if (!me) return json({ error: 'unauthorized' }, 401);

    switch (action) {
      case 'push': {
        const report = body.report as Record<string, unknown> | undefined;
        if (!report || typeof report !== 'object' || report.v !== 1) return json({ error: 'Bad report.' }, 400);
        const at = new Date().toISOString();
        const { error: e } = await db.from('pace_athletes').update({ report, report_at: at }).eq('id', me.id);
        if (e) throw e;
        return json({ at, live: !!me.view_hash, viewed: me.viewed_at });
      }
      case 'link': {
        const token = randomToken(24);
        const { error: e } = await db.from('pace_athletes').update({ view_hash: await sha256(token), viewed_at: null }).eq('id', me.id);
        if (e) throw e;
        return json({ token });
      }
      case 'unlink': {
        const { error: e } = await db.from('pace_athletes').update({ view_hash: null, viewed_at: null }).eq('id', me.id);
        if (e) throw e;
        return json({ ok: true });
      }
      case 'status':
        return json({ live: !!me.view_hash, viewed: me.viewed_at, at: me.report_at });
      case 'delete': {
        const { error: e } = await db.from('pace_athletes').delete().eq('id', me.id);
        if (e) throw e;
        return json({ ok: true });
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    console.error('pace-share', action, e);
    return json({ error: 'Server error. Try again.' }, 500);
  }
});
