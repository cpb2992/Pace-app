/**
 * The live coach view. The phone uploads a read-only report to the pace-share Edge Function
 * (supabase/functions/pace-share) and the coach opens it at COACH_PAGE#<token>.
 *
 * The phone's secret and the link token live in secure storage. The server keeps only their hashes.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { CoachReport } from '../engine/report';

export const SHARE_API = process.env.EXPO_PUBLIC_PACE_SHARE_URL || 'https://iyneflhujuemucfgsgwb.supabase.co/functions/v1/pace-share';
export const COACH_PAGE = process.env.EXPO_PUBLIC_PACE_COACH_PAGE || 'https://cpb2992.github.io/Pace-app/coach/';

const K = { secret: 'pace.share.secret', token: 'pace.share.token' };
const memory = new Map<string, string>();

async function get(k: string): Promise<string | null> {
  if (Platform.OS === 'web') return memory.get(k) ?? null;
  try { return await SecureStore.getItemAsync(k); } catch { return null; }
}
async function put(k: string, v: string | null) {
  if (Platform.OS === 'web') { if (v == null) memory.delete(k); else memory.set(k, v); return; }
  try { if (v == null) await SecureStore.deleteItemAsync(k); else await SecureStore.setItemAsync(k, v); } catch { /* secure storage unavailable */ }
}

export class ShareError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(action: string, extra: Record<string, unknown> = {}, secret?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(SHARE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch {
    throw new ShareError('No connection. Pace will try again when you are back online.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ShareError(res.status === 401 ? 'This phone is no longer connected to the live view.' : body.error || `Sharing failed (${res.status}).`, res.status);
  return body;
}

export const linkFor = (token: string) => `${COACH_PAGE}#${token}`;

/** The current link, if sharing is on. */
export async function currentLink(): Promise<string | null> {
  const [secret, token] = await Promise.all([get(K.secret), get(K.token)]);
  return secret && token ? linkFor(token) : null;
}

/** Turns the live view on: registers this phone if needed, uploads the report, and makes a link. */
export async function startSharing(report: CoachReport): Promise<string> {
  let secret = await get(K.secret);
  if (!secret) {
    const r = await call<{ id: string; secret: string }>('register');
    secret = r.secret;
    await put(K.secret, secret);
  }
  try {
    await call('push', { report }, secret);
  } catch (e) {
    // The server forgot this phone (or it was deleted elsewhere): start over once.
    if (e instanceof ShareError && e.status === 401) { await put(K.secret, null); return startSharing(report); }
    throw e;
  }
  const { token } = await call<{ token: string }>('link', {}, secret);
  await put(K.token, token);
  return linkFor(token);
}

export interface PushResult { at: string; live: boolean; viewed: string | null }

/** Uploads the latest report. Returns null when sharing is off. */
export async function pushReport(report: CoachReport): Promise<PushResult | null> {
  const secret = await get(K.secret);
  if (!secret || !(await get(K.token))) return null;
  try {
    return await call<PushResult>('push', { report }, secret);
  } catch (e) {
    if (e instanceof ShareError && e.status === 401) { await Promise.all([put(K.secret, null), put(K.token, null)]); }
    throw e;
  }
}

/** A new link. The old one stops working right away. */
export async function newLink(): Promise<string> {
  const secret = await get(K.secret);
  if (!secret) throw new ShareError('Turn on the live view first.', 0);
  const { token } = await call<{ token: string }>('link', {}, secret);
  await put(K.token, token);
  return linkFor(token);
}

/** Turns the live view off and deletes everything Pace uploaded. */
export async function stopSharing(): Promise<void> {
  const secret = await get(K.secret);
  if (secret) {
    try { await call('delete', {}, secret); } catch (e) { if (!(e instanceof ShareError && e.status === 401)) throw e; }
  }
  await Promise.all([put(K.secret, null), put(K.token, null)]);
}
