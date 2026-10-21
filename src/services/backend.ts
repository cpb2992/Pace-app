/**
 * Talks to Pace's backend (Supabase Edge Functions, see /supabase). Everything here is optional:
 * with no backend configured the app runs fully on-device and hides the AI coach and WHOOP sync.
 *
 * Configure in .env:
 *   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WhoopDay } from '../engine/types';

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const backendReady = Boolean(BASE && KEY);

async function call<T>(fn: string, body: unknown, token?: string | null): Promise<T> {
  const res = await fetch(`${BASE}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token || KEY}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/** Ask the AI coach. The prompt comes from buildCoachPrompt in the engine. */
export async function askCoach(prompt: string, token?: string | null): Promise<string> {
  const out = await call<{ text: string }>('coach', { mode: 'coach', prompt }, token);
  return out.text;
}

/** Turn pasted workout text into structured JSON (validated again on-device). */
export async function parseProgramRemote(prompt: string, token?: string | null): Promise<unknown> {
  const out = await call<{ text: string }>('coach', { mode: 'program', prompt }, token);
  const t = out.text.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = m ? m[1] : t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

/** URL that starts WHOOP's sign-in. WHOOP sends the user back to the app at pace://whoop. */
export const whoopConnectUrl = (deviceId: string) => `${BASE}/functions/v1/whoop/start?device=${encodeURIComponent(deviceId)}`;

/** Pull recent recovery from WHOOP through the backend. */
export async function syncWhoop(deviceId: string, token?: string | null): Promise<Record<string, WhoopDay>> {
  const out = await call<{ days: Record<string, WhoopDay> }>('whoop', { action: 'sync', device: deviceId }, token);
  return out.days;
}

/** A random id for this phone, used to link WHOOP until accounts exist (see README, phase 2). */
export async function getDeviceId(): Promise<string> {
  const k = 'pace.device';
  const have = await AsyncStorage.getItem(k);
  if (have) return have;
  const id = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('').slice(0, 32);
  await AsyncStorage.setItem(k, id);
  return id;
}
