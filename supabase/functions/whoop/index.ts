// WHOOP live sync for Pace.
//   GET  /whoop/start?device=ID   → sends the user to WHOOP's sign-in
//   GET  /whoop/callback          → WHOOP returns here; tokens are stored; user goes back to pace://whoop
//   POST /whoop {action:"sync", device}  → last 30 days of recovery, HRV, resting HR and sleep
//
// Secrets:
//   supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... \
//     WHOOP_REDIRECT_URL=https://<project>.supabase.co/functions/v1/whoop/callback
// Deploy (browser redirects can't carry a JWT, so this function checks its own state values):
//   supabase functions deploy whoop --no-verify-jwt
//
// Phase 1 identifies the phone by a random device id. Before selling, replace it with the signed-in
// Supabase user id so tokens are tied to an account.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer';
const SCOPES = 'read:recovery read:sleep read:cycles offline';
const APP_RETURN = 'pace://whoop';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } });

const env = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing secret ${k}`); return v; };
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Tokens = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('WHOOP_CLIENT_ID'), client_secret: env('WHOOP_CLIENT_SECRET'), ...params }),
  });
  if (!res.ok) throw new Error(`WHOOP token error ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function saveTokens(device: string, t: Tokens) {
  const { error } = await db().from('whoop_tokens').upsert({
    device_id: device, access_token: t.access_token, refresh_token: t.refresh_token ?? null,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function accessToken(device: string): Promise<string | null> {
  const { data } = await db().from('whoop_tokens').select('*').eq('device_id', device).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() > Date.now()) return data.access_token;
  if (!data.refresh_token) return null;
  // Refreshing invalidates the old refresh token, so save the new pair right away.
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: data.refresh_token, scope: 'offline' });
  await saveTokens(device, t);
  return t.access_token;
}

async function collect(token: string, path: string, start: string) {
  const out: Record<string, unknown>[] = [];
  let next: string | undefined;
  for (let page = 0; page < 6; page++) {
    const q = new URLSearchParams({ limit: '25', start });
    if (next) q.set('nextToken', next);
    const res = await fetch(`${API}${path}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`WHOOP ${path} ${res.status}`);
    const body = await res.json();
    out.push(...(body.records ?? []));
    next = body.next_token;
    if (!next) break;
  }
  return out;
}

/** Local calendar date of a timestamp, using WHOOP's timezone_offset like "-04:00". */
function localDate(iso: string, offset?: string) {
  const d = new Date(iso);
  const m = offset?.match(/^([+-])(\d{2}):(\d{2})$/);
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(d.getTime() + mins * 60000).toISOString().slice(0, 10);
}

async function sync(device: string) {
  const token = await accessToken(device);
  if (!token) return json({ error: 'Connect WHOOP first.' }, 401);
  const start = new Date(Date.now() - 30 * 864e5).toISOString();
  const [recovery, sleep] = await Promise.all([collect(token, '/v2/recovery', start), collect(token, '/v2/activity/sleep', start)]);
  const sleepById = new Map<string, Record<string, any>>();
  for (const s of sleep as Record<string, any>[]) sleepById.set(String(s.id), s);
  const days: Record<string, unknown> = {};
  for (const r of recovery as Record<string, any>[]) {
    if (r.score_state !== 'SCORED' || !r.score) continue;
    const s = sleepById.get(String(r.sleep_id));
    const date = s?.end ? localDate(s.end, s.timezone_offset) : String(r.created_at).slice(0, 10);
    const st = s?.score?.stage_summary;
    const asleepMs = st ? st.total_in_bed_time_milli - st.total_awake_time_milli : null;
    days[date] = {
      rec: Math.round(r.score.recovery_score),
      hrv: r.score.hrv_rmssd_milli != null ? Math.round(r.score.hrv_rmssd_milli) : null,
      rhr: r.score.resting_heart_rate != null ? Math.round(r.score.resting_heart_rate) : null,
      sleep: asleepMs != null ? Math.round(asleepMs / 360000) / 10 : null,
      src: 'api',
    };
  }
  return json({ days });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.split('/').pop();
  try {
    if (req.method === 'GET' && route === 'start') {
      const device = url.searchParams.get('device') ?? '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) return json({ error: 'Missing device id.' }, 400);
      const state = crypto.randomUUID().replace(/-/g, '');
      const { error } = await db().from('whoop_auth_states').insert({ state, device_id: device });
      if (error) throw error;
      const q = new URLSearchParams({ response_type: 'code', client_id: env('WHOOP_CLIENT_ID'), redirect_uri: env('WHOOP_REDIRECT_URL'), scope: SCOPES, state });
      return redirect(`${AUTH_URL}?${q}`);
    }
    if (req.method === 'GET' && route === 'callback') {
      const code = url.searchParams.get('code'), state = url.searchParams.get('state');
      if (!code || !state) return redirect(`${APP_RETURN}?error=denied`);
      const { data } = await db().from('whoop_auth_states').delete().eq('state', state).select().maybeSingle();
      if (!data) return redirect(`${APP_RETURN}?error=expired`);
      const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: env('WHOOP_REDIRECT_URL') });
      await saveTokens(data.device_id, t);
      return redirect(`${APP_RETURN}?connected=1`);
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.action === 'sync' && typeof body.device === 'string') return await sync(body.device);
      return json({ error: 'Unknown action.' }, 400);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'WHOOP sync failed. Try again.' }, 502);
  }
});
