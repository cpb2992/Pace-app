/**
 * WHOOP live sync, straight from the phone (no server).
 *
 * Chris makes his own WHOOP developer app (developer.whoop.com) with the redirect URL pace://whoop and
 * pastes its Client ID and Secret into Settings. They and the WHOOP tokens live in the phone's secure
 * storage. Sandbox apps work for up to 10 WHOOP members with no review, which covers personal use.
 * Before selling Pace, move the secret and tokens to the backend in /supabase (see README).
 */
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { whoopDays, whoopWorkouts } from '../engine/whoop';
import type { WhoopDay, WhoopWorkout } from '../engine/types';

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer';
export const WHOOP_REDIRECT = 'pace://whoop';
export const WHOOP_SCOPES = 'read:recovery read:sleep read:cycles read:workout offline';

const K = { client: 'pace.whoop.client', tokens: 'pace.whoop.tokens', state: 'pace.whoop.state' };
const memory = new Map<string, string>();

async function get(k: string): Promise<string | null> {
  if (Platform.OS === 'web') return memory.get(k) ?? null;
  try { return await SecureStore.getItemAsync(k); } catch { return null; }
}
async function put(k: string, v: string | null) {
  if (Platform.OS === 'web') { if (v == null) memory.delete(k); else memory.set(k, v); return; }
  try { if (v == null) await SecureStore.deleteItemAsync(k); else await SecureStore.setItemAsync(k, v); } catch { /* secure storage unavailable */ }
}
/** Plain query-string helpers (React Native's URL support is partial). */
const qs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
export function queryOf(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = url.split('#')[0].split('?')[1] ?? '';
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* skip a bad pair */ }
  }
  return out;
}
const getJSON = async <T>(k: string): Promise<T | null> => { try { const v = await get(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };

export interface WhoopClient { id: string; secret: string }
interface Tokens { access: string; refresh: string | null; exp: number }

export const getWhoopClient = () => getJSON<WhoopClient>(K.client);
export async function setWhoopClient(c: WhoopClient | null) {
  await put(K.client, c && c.id.trim() && c.secret.trim() ? JSON.stringify({ id: c.id.trim(), secret: c.secret.trim() }) : null);
}

export type WhoopStatus = 'no-app' | 'ready' | 'connected';
export async function whoopStatus(): Promise<WhoopStatus> {
  if (!(await getWhoopClient())) return 'no-app';
  return (await getJSON<Tokens>(K.tokens)) ? 'connected' : 'ready';
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const c = await getWhoopClient();
  if (!c) throw new Error('Add your WHOOP app first.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: qs({ client_id: c.id, client_secret: c.secret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const why = body.error_description || body.error || `status ${res.status}`;
    throw new Error(res.status === 401 || body.error === 'invalid_client' ? 'WHOOP turned down the Client ID or Secret. Check them in Settings.' : `WHOOP sign-in failed (${why}).`);
  }
  const t: Tokens = { access: body.access_token, refresh: body.refresh_token ?? null, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000 };
  await put(K.tokens, JSON.stringify(t));
  return t;
}

const exchanges = new Map<string, Promise<void>>();
/** Swap the code WHOOP sent back for tokens. Safe to call twice with the same code (deep link + browser result). */
export function finishWhoopLogin(code: string, state: string | null): Promise<void> {
  const hit = exchanges.get(code);
  if (hit) return hit;
  const p = (async () => {
    const want = await get(K.state);
    if (want && state && want !== state) throw new Error('That WHOOP sign-in expired. Try Connect again.');
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: WHOOP_REDIRECT });
    await put(K.state, null);
  })();
  exchanges.set(code, p);
  return p;
}

const randomState = () => Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

/** Opens WHOOP's sign-in. Resolves 'connected' when tokens are saved, or 'cancelled'. */
export async function connectWhoop(): Promise<'connected' | 'cancelled'> {
  const c = await getWhoopClient();
  if (!c) throw new Error('Add your WHOOP app first.');
  const state = randomState();
  await put(K.state, state);
  const q = qs({ response_type: 'code', client_id: c.id, redirect_uri: WHOOP_REDIRECT, scope: WHOOP_SCOPES, state });
  const res = await WebBrowser.openAuthSessionAsync(`${AUTH_URL}?${q}`, WHOOP_REDIRECT);
  if (res.type === 'success' && res.url) {
    const u = queryOf(res.url);
    if (u.error) throw new Error(u.error === 'access_denied' ? 'WHOOP access was not allowed.' : `WHOOP said: ${u.error_description || u.error}`);
    if (u.code) { await finishWhoopLogin(u.code, u.state ?? null); return 'connected'; }
  }
  // On some phones the redirect opens Pace's /whoop screen instead of returning here; give it a moment.
  for (let i = 0; i < 6; i++) {
    if ((await getJSON<Tokens>(K.tokens)) && !(await get(K.state))) return 'connected';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'cancelled';
}

let refreshing: Promise<Tokens> | null = null;
async function accessToken(): Promise<string> {
  const t = await getJSON<Tokens>(K.tokens);
  if (!t) throw new Error('Connect WHOOP first.');
  if (t.exp > Date.now()) return t.access;
  if (!t.refresh) { await put(K.tokens, null); throw new Error('WHOOP signed you out. Connect again.'); }
  // A refresh token works once, so every caller waits on the same refresh.
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, scope: 'offline' })
    .catch(async e => { await put(K.tokens, null); throw e; })
    .finally(() => { refreshing = null; });
  return (await refreshing).access;
}

async function collect(token: string, path: string, start: string) {
  const out: Record<string, unknown>[] = [];
  let next: string | undefined;
  for (let page = 0; page < 8; page++) {
    const q = qs(next ? { limit: '25', start, nextToken: next } : { limit: '25', start });
    const res = await fetch(`${API}${path}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error('WHOOP signed you out. Connect again.');
    if (res.status === 429) throw new Error('WHOOP is rate-limiting. Try again in a minute.');
    if (!res.ok) throw new Error(`WHOOP sync failed (${path.split('/').pop()} ${res.status}).`);
    const body = await res.json();
    out.push(...(body.records ?? []));
    next = body.next_token || undefined;
    if (!next) break;
  }
  return out;
}

/** Pull recovery, sleep, strain and workouts for the last `days` days. */
export async function syncWhoop(days = 30): Promise<{ days: Record<string, WhoopDay>; workouts: Record<string, WhoopWorkout> }> {
  const token = await accessToken();
  const start = new Date(Date.now() - days * 864e5).toISOString();
  const [recovery, sleep, cycles, workouts] = await Promise.all([
    collect(token, '/v2/recovery', start),
    collect(token, '/v2/activity/sleep', start),
    collect(token, '/v2/cycle', start),
    collect(token, '/v2/activity/workout', start).catch(() => []),
  ]);
  return { days: whoopDays(recovery, sleep, cycles), workouts: whoopWorkouts(workouts) };
}

export async function disconnectWhoop() {
  const t = await getJSON<Tokens>(K.tokens);
  if (t && t.exp > Date.now()) fetch(`${API}/v2/user/access`, { method: 'DELETE', headers: { Authorization: `Bearer ${t.access}` } }).catch(() => {});
  await put(K.tokens, null);
  await put(K.state, null);
}
