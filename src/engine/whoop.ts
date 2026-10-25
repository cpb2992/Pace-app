/** Turns WHOOP API v2 records into Pace's per-day recovery and workout entries. No network here. */
import type { WhoopDay, WhoopWorkout } from './types';

type Rec = Record<string, any>;

/** Local calendar date of a timestamp, using WHOOP's timezone_offset like "-04:00". */
export function localDate(iso: string, offset?: string | null) {
  const d = new Date(iso);
  const m = offset?.match(/^([+-])(\d{2}):?(\d{2})$/);
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -d.getTimezoneOffset();
  return new Date(d.getTime() + mins * 60000).toISOString().slice(0, 10);
}

const round = (v: unknown, places = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** places) / 10 ** places : null);

/** One entry per wake-up day: recovery, HRV, resting HR, sleep, sleep performance, day strain, SpO2, skin temp. */
export function whoopDays(recovery: Rec[], sleep: Rec[], cycles: Rec[]): Record<string, WhoopDay> {
  const sleepById = new Map<string, Rec>();
  for (const s of sleep) if (!s.nap) sleepById.set(String(s.id), s);
  const cycleById = new Map<string, Rec>();
  for (const c of cycles) cycleById.set(String(c.id), c);
  const days: Record<string, WhoopDay> = {};
  for (const r of recovery) {
    if (r.score_state !== 'SCORED' || !r.score) continue;
    const s = sleepById.get(String(r.sleep_id));
    const c = cycleById.get(String(r.cycle_id));
    const date = s?.end ? localDate(s.end, s.timezone_offset) : c?.start ? localDate(c.start, c.timezone_offset) : String(r.created_at).slice(0, 10);
    const st = s?.score?.stage_summary;
    const asleepMs = st ? st.total_in_bed_time_milli - st.total_awake_time_milli : null;
    days[date] = {
      rec: Math.round(r.score.recovery_score),
      hrv: round(r.score.hrv_rmssd_milli),
      rhr: round(r.score.resting_heart_rate),
      sleep: asleepMs != null ? Math.round(asleepMs / 360000) / 10 : null,
      perf: round(s?.score?.sleep_performance_percentage),
      strain: c?.score_state === 'SCORED' ? round(c.score?.strain, 1) : null,
      spo2: round(r.score.spo2_percentage, 1),
      temp: round(r.score.skin_temp_celsius, 1),
      src: 'api',
    };
  }
  return days;
}

export function whoopWorkouts(records: Rec[]): Record<string, WhoopWorkout> {
  const out: Record<string, WhoopWorkout> = {};
  for (const w of records) {
    if (!w.id || !w.start) continue;
    const scored = w.score_state === 'SCORED' && w.score;
    out[String(w.id)] = {
      id: String(w.id),
      date: localDate(w.start, w.timezone_offset),
      sport: String(w.sport_name || 'Activity').replace(/[-_]/g, ' ').replace(/\b\w/g, (m: string) => m.toUpperCase()),
      start: String(w.start),
      end: String(w.end ?? w.start),
      strain: scored ? round(w.score.strain, 1) : null,
      avgHr: scored ? round(w.score.average_heart_rate) : null,
      maxHr: scored ? round(w.score.max_heart_rate) : null,
      kj: scored ? round(w.score.kilojoule) : null,
    };
  }
  return out;
}

/** Merge synced days into stored ones. WHOOP wins where it has a value; manual numbers fill the gaps. */
export function mergeWhoop(have: Record<string, WhoopDay>, incoming: Record<string, WhoopDay>) {
  const out = { ...have };
  for (const [date, d] of Object.entries(incoming)) {
    const old = out[date];
    const merged: WhoopDay = { ...(old ?? {}), ...d };
    if (old) for (const k of ['hrv', 'rhr', 'sleep', 'strain', 'perf'] as const) if (merged[k] == null && old[k] != null) merged[k] = old[k];
    out[date] = merged;
  }
  return out;
}
