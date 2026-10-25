import { addDays, daysBetween, DOWL, fromISO } from './dates';
import type { AppData, Block, Exercise, ExerciseType, LoggedSet, Session, WorkoutDay, Zone, ZoneOrUnknown } from './types';
import { avg, fmtW, key } from './util';

export const zoneOf = (v: number): Zone => (v >= 67 ? 'green' : v >= 34 ? 'yellow' : 'red');
export const isFree = (t: ExerciseType) => t === 'cardio' || t === 'circuit';

export const ZONES: Record<ZoneOrUnknown, { label: string; head: string; sub: string }> = {
  green: { label: 'Recovered', head: 'Push today', sub: 'Add weight where Pace says. Last set to failure.' },
  yellow: { label: 'Moderate', head: "Train, don't test", sub: 'Match last time. Leave 2 reps in the tank.' },
  red: { label: 'Low', head: 'Recover today', sub: 'Lighter and fewer sets, or easy cardio.' },
  unknown: { label: 'No data', head: '', sub: '' },
};

export interface HistEntry { id: string; date: string; sets: LoggedSet[] }
export interface Readiness {
  zone: ZoneOrUnknown;
  rec?: number;
  hrv?: number | null;
  rhr?: number | null;
  sleep?: number | null;
  src?: string;
  base?: { n: number; mean?: number; sd?: number };
  notes: string[];
}
export type Prescription =
  | { kind: 'free' }
  | { kind: 'new'; w: null; reps: number; sets: number; why: string; effort: string }
  | { kind: 'lift'; w: number; reps: number; sets: number; tag: 'up' | 'reps' | 'hold' | 'down'; tagText: string; why: string; last: string; effort: string };

export interface CoastResult {
  enough: boolean;
  n: number;
  rirSets?: number;
  easy?: number;
  hard?: number;
  easyPct?: number | null;
  stalls?: { name: string; top: string; streak: number }[];
  greenS?: number;
  greenWaste?: number;
  redGrind?: number;
  score?: number;
  level?: 'coasting' | 'close' | 'working' | 'grind';
}

export const setPerf = (x: LoggedSet) => ((x.w || 0) > 0 ? x.w * (1 + x.r / 30) : x.r);
export const bestRaw = (sets: LoggedSet[]) => Math.max(0, ...sets.map(setPerf));
export function topStr(sets: LoggedSet[]) {
  let b = sets[0];
  for (const x of sets) if (setPerf(x) > setPerf(b)) b = x;
  return (b.w || 0) > 0 ? `${fmtW(b.w)} × ${b.r}` : `${b.r} reps`;
}

const LOWER = /(squat|deadlift|\brdl\b|leg press|lunge|hip thrust|hip drive|split|glute|calf|leg ext|leg curl|step-?up|good morning|hack|abduct|adduct)/i;
export function increment(ex: Exercise) {
  const low = LOWER.test(ex.name);
  if (ex.type === 'barbell' || ex.type === 'machine') return low ? 10 : 5;
  return 5;
}
export function roundW(w: number, ex: Exercise) {
  const step = ex.type === 'dumbbell' && w < 20 ? 2.5 : 5;
  return Math.max(step, Math.round(w / step) * step);
}
export function plates(w: number | null, bar: number) {
  if (w == null || w <= bar) return null;
  let per = (w - bar) / 2;
  const out: number[] = [];
  for (const p of [45, 35, 25, 10, 5, 2.5]) while (per >= p - 1e-9) { out.push(p); per -= p; }
  return out.length ? out.map(fmtW).join(' + ') + ' per side' : null;
}
export function effortFor(ex: Exercise, zone: ZoneOrUnknown) {
  if (zone === 'red') return '3 reps left on every set';
  if (zone === 'yellow') return 'Stop each set 2 reps short';
  return ex.type === 'barbell' ? 'Last set: 1 rep left' : 'Last set: to failure';
}
export function rxText(ex: Exercise) {
  if (ex.type === 'cardio') return ex.note || 'Cardio';
  if (ex.type === 'circuit') return ex.note || 'Circuit';
  return `${ex.sets} × ${ex.repLow === ex.repHigh ? ex.repLow : `${ex.repLow}–${ex.repHigh}`}`;
}

/** A read-only view of the data with cached lookups. Build one per render. */
export class Ctx {
  readonly data: AppData;
  readonly today: string;
  private _asc: Session[] | null = null;
  private _hist = new Map<string, HistEntry[]>();
  private _coast: CoastResult | null = null;

  constructor(data: AppData, today: string) {
    this.data = data;
    this.today = today;
  }

  get sessions(): Session[] {
    if (!this._asc) this._asc = this.data.sessions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return this._asc;
  }

  hist(name: string): HistEntry[] {
    const k = key(name);
    const hit = this._hist.get(k);
    if (hit) return hit;
    const out: HistEntry[] = [];
    for (const s of this.sessions) {
      const sets = s.sets.filter(x => key(x.ex) === k);
      if (sets.length) out.push({ id: s.id, date: s.date, sets });
    }
    this._hist.set(k, out);
    return out;
  }

  activeBlock(): Block | undefined {
    let best: Block | undefined;
    for (const b of this.data.program.blocks) {
      if (!b.start || b.start <= this.today) {
        if (!best || (b.start || '') >= (best.start || '')) best = b;
      }
    }
    return best || this.data.program.blocks[0];
  }

  days(): WorkoutDay[] {
    return this.activeBlock()?.days ?? [];
  }

  video(name: string) {
    return this.data.videos[key(name)] ?? null;
  }

  baseline(date: string) {
    const vals: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const x = this.data.whoop[addDays(date, -i)];
      if (x && x.hrv != null) vals.push(x.hrv);
    }
    if (!vals.length) return { n: 0 };
    const mean = avg(vals)!;
    const sd = Math.sqrt(avg(vals.map(v => (v - mean) ** 2))!);
    return { n: vals.length, mean, sd };
  }

  readiness(date: string): Readiness {
    const d = this.data.whoop[date];
    if (!d || d.rec == null) return { zone: 'unknown', notes: [] };
    let zone: Zone = zoneOf(d.rec);
    const notes: string[] = [];
    const base = this.baseline(date);
    if (d.hrv != null && base.n >= 7 && base.mean != null) {
      const z = (d.hrv - base.mean) / (base.sd || 1);
      if (z <= -1.5 && zone === 'green') { zone = 'yellow'; notes.push(`HRV is well below your ${Math.round(base.mean)} ms average, so Pace is holding you at moderate.`); }
    }
    if (d.sleep != null && d.sleep < 6 && zone === 'green') { zone = 'yellow'; notes.push('Under 6 hours of sleep. Capped at moderate.'); }
    return { zone, rec: d.rec, hrv: d.hrv, rhr: d.rhr, sleep: d.sleep, src: d.src, base, notes };
  }

  sessionZone(s: Session): Zone | null {
    const r = this.readiness(s.date);
    return r.zone !== 'unknown' ? r.zone : s.zone;
  }

  prescribe(ex: Exercise, zone: ZoneOrUnknown): Prescription {
    if (isFree(ex.type)) return { kind: 'free' };
    const lo = ex.repLow || 8;
    const hi = Math.max(ex.repHigh || lo, lo);
    const h = this.hist(ex.name);
    const last = h[h.length - 1];
    const effort = effortFor(ex, zone);
    if (!last) return { kind: 'new', w: null, reps: hi, sets: ex.sets, why: `Pick a weight you can lift ${hi} times with 2 reps left.`, effort };
    const sets = last.sets;
    const topW = Math.max(...sets.map(s => s.w || 0));
    const at = sets.filter(s => (s.w || 0) === topW);
    const minR = Math.min(...at.map(s => s.r));
    const maxR = Math.max(...at.map(s => s.r));
    const avgRir = avg(at.map(s => s.rir).filter((v): v is number => v != null));
    const loaded = topW > 0;
    const inc = increment(ex);
    const lastStr = loaded ? `${fmtW(topW)} × ${maxR}` : `${maxR} reps`;
    let w = topW, reps: number, n = ex.sets;
    let tag: 'up' | 'reps' | 'hold' | 'down', tagText: string, why: string;
    if (zone === 'red') {
      w = loaded ? roundW(topW * 0.85, ex) : 0; n = Math.max(2, ex.sets - 1); reps = lo; tag = 'down'; tagText = 'Lighter';
      why = `Low recovery: ${n} sets${loaded ? ' at about 85%' : ''}, 3 reps in reserve.`;
    } else if (zone === 'yellow') {
      const easy = avgRir != null && avgRir >= 3;
      reps = Math.min(hi, easy ? maxR + 1 : maxR); tag = 'hold'; tagText = easy ? '+1 rep' : 'Hold';
      why = easy ? `You had ${Math.round(avgRir!)} reps left last time. Take ${reps}.` : 'Match last session.';
    } else if (minR >= hi) {
      if (loaded) { w = roundW(topW + inc, ex); reps = lo; tag = 'up'; tagText = `+${inc} lb`; why = `You hit ${hi} on every set. Move up.`; }
      else { reps = hi; tag = 'up'; tagText = 'Add load'; why = `You own ${hi}+ reps. Add weight or slow the lowering.`; }
    } else if (avgRir != null && avgRir >= 3) {
      if (loaded) { w = roundW(topW + inc, ex); reps = Math.max(lo, Math.min(minR, hi)); tag = 'up'; tagText = `+${inc} lb`; why = `You left ${Math.round(avgRir)} reps in the tank. That's maintenance.`; }
      else { reps = Math.min(hi, maxR + 2); tag = 'reps'; tagText = '+2 reps'; why = `You had ${Math.round(avgRir)} reps left. Do more.`; }
    } else {
      reps = Math.min(hi, maxR + 1); tag = 'reps'; tagText = '+1 rep';
      why = reps > maxR ? `Same weight. Beat ${maxR} on set 1.` : `Hit ${hi} on every set, then the weight goes up.`;
    }
    // Feedback from the coach chat or the post-workout check changes the next target once.
    const nudge = this.data.coach?.nudges?.find(x => key(x.ex) === key(ex.name));
    if (nudge) {
      const said = `Coach: ${nudge.reason.replace(/[.!]$/, '')}.`;
      if (nudge.change === 'down') {
        if (loaded) w = Math.min(w, roundW(Math.max(0, topW - inc), ex)); else reps = Math.max(lo, Math.min(reps, maxR - 2));
        tag = 'down'; tagText = 'Lighter'; why = `${said} Down a step.`;
      } else if (zone !== 'red' && nudge.change === 'up') {
        if (loaded) { w = roundW(topW + inc, ex); reps = lo; tag = 'up'; tagText = `+${inc} lb`; } else { reps = Math.min(hi, maxR + 2); tag = 'reps'; tagText = '+2 reps'; }
        why = `${said} Up a step.`;
      } else if (zone !== 'red' && nudge.change === 'hold') {
        w = topW; reps = Math.min(hi, maxR); tag = 'hold'; tagText = 'Hold'; why = `${said} Repeat last time.`;
      }
    }
    return { kind: 'lift', w, reps, sets: n, tag, tagText, why, last: lastStr, effort };
  }

  private progressed(s: Session) {
    const byEx = new Map<string, { name: string; sets: LoggedSet[] }>();
    for (const x of s.sets) {
      const k = key(x.ex);
      if (!byEx.has(k)) byEx.set(k, { name: x.ex, sets: [] });
      byEx.get(k)!.sets.push(x);
    }
    for (const g of byEx.values()) {
      const h = this.hist(g.name);
      const i = h.findIndex(e => e.id === s.id);
      if (i > 0 && bestRaw(g.sets) > bestRaw(h[i - 1].sets) * 1.01) return true;
    }
    return false;
  }

  /** The coasting check: easy sets, stalled lifts and wasted green days over the last 3 weeks. */
  coast(): CoastResult {
    if (this._coast) return this._coast;
    const recent = this.sessions.filter(s => { const g = daysBetween(s.date, this.today); return g >= -1 && g <= 21; });
    if (recent.length < 3) return (this._coast = { enough: false, n: recent.length });
    let rirSets = 0, easy = 0, hard = 0;
    for (const s of recent) for (const x of s.sets) if (x.rir != null) { rirSets++; if (x.rir >= 3) easy++; if (x.rir <= 1) hard++; }
    const names = new Map<string, string>();
    for (const s of recent) for (const x of s.sets) if (!names.has(key(x.ex))) names.set(key(x.ex), x.ex);
    const stalls: { name: string; top: string; streak: number }[] = [];
    let checked = 0;
    for (const name of names.values()) {
      const h = this.hist(name);
      if (h.length < 3) continue;
      checked++;
      const perf = h.map(e => bestRaw(e.sets));
      const lastP = perf[perf.length - 1];
      const prevMax = Math.max(...perf.slice(-3, -1));
      if (lastP <= prevMax * 1.01) {
        let streak = 1;
        for (let i = perf.length - 2; i >= 0; i--) { if (perf[i] >= lastP * 0.97) streak++; else break; }
        stalls.push({ name, top: topStr(h[h.length - 1].sets), streak });
      }
    }
    stalls.sort((a, b) => b.streak - a.streak);
    let greenS = 0, greenWaste = 0, redGrind = 0;
    for (const s of recent) {
      const z = this.sessionZone(s);
      const r = s.sets.filter(x => x.rir != null);
      if (z === 'green') {
        greenS++;
        const a = r.length ? avg(r.map(x => x.rir!)) : null;
        if (!this.progressed(s) && (a == null || a >= 2)) greenWaste++;
      }
      if (z === 'red' && r.length && r.filter(x => x.rir! <= 1).length / r.length >= 0.5) redGrind++;
    }
    const easyPct = rirSets ? easy / rirSets : null;
    const stallPct = checked ? stalls.length / checked : 0;
    const wastePct = greenS ? greenWaste / greenS : 0;
    const raw = easyPct != null ? 0.5 * easyPct + 0.3 * stallPct + 0.2 * wastePct : 0.6 * stallPct + 0.4 * wastePct;
    const score = Math.round(raw * 100);
    const level = redGrind >= 2 ? 'grind' : score >= 45 ? 'coasting' : score >= 25 ? 'close' : 'working';
    return (this._coast = { enough: true, n: recent.length, rirSets, easy, hard, easyPct, stalls, greenS, greenWaste, redGrind, score, level });
  }

  /** Which workout to show today: logged today > scheduled today > next in rotation > next scheduled. */
  pickDay(): { idx: number; label: string } {
    const days = this.days();
    if (!days.length) return { idx: 0, label: 'Up next' };
    const dow = fromISO(this.today).getDay();
    const ss = this.sessions;
    const todays = ss.filter(s => s.date === this.today).pop();
    if (todays) { const j = days.findIndex(d => key(d.name) === key(todays.day)); if (j >= 0) return { idx: j, label: 'Today' }; }
    const j = days.findIndex(d => d.dow === dow);
    if (j >= 0) return { idx: j, label: 'Today' };
    for (let i = ss.length - 1; i >= 0; i--) {
      const k = days.findIndex(d => key(d.name) === key(ss[i].day));
      if (k >= 0) { const n = (k + 1) % days.length; return { idx: n, label: days[n].dow != null ? DOWL[days[n].dow!] : 'Up next' }; }
    }
    for (let i = 1; i <= 7; i++) { const dd = (dow + i) % 7; const k = days.findIndex(d => d.dow === dd); if (k >= 0) return { idx: k, label: DOWL[dd] }; }
    return { idx: 0, label: 'Up next' };
  }
}

export function evidence(c: CoastResult): string[] {
  if (!c.enough) return [];
  const L: string[] = [];
  if (c.level === 'working' && c.hard) L.push(`${c.hard} sets within a rep of failure in 3 weeks.`);
  if (c.easyPct != null && c.rirSets) L.push(`${c.easy} of ${c.rirSets} sets ended with 3+ reps left.`);
  (c.stalls ?? []).slice(0, 2).forEach(s => L.push(`${s.name} stuck at ${s.top} for ${s.streak} sessions.`));
  if (c.greenS) L.push(`${c.greenWaste} of ${c.greenS} green days spent maintaining.`);
  if (c.redGrind) L.push(`${c.redGrind} red days pushed to failure.`);
  return L.slice(0, 4);
}

export const VOICE = {
  nofilter: {
    coasting: "You're being a bitch. Lift more weight.",
    greenCoast: "Green recovery and you're still coasting. Quit being a bitch and lift more weight.",
    close: 'Not bad. Not enough. Push the last set.',
    working: 'Real work. Keep stacking plates.',
    grind: "Grinding on red recovery isn't tough. Back off on red days.",
    early: 'Log 3 sessions to unlock the coasting check.',
  },
  clean: {
    coasting: "You're coasting. Lift more weight.",
    greenCoast: "Green recovery and you're still coasting. Lift more weight.",
    close: "Close, but there's more in the tank. Push the last set.",
    working: 'Real work. Keep stacking plates.',
    grind: 'Ease off on red days. Recovering is part of getting strong.',
    early: 'Log 3 sessions to unlock the coasting check.',
  },
} as const;

export const FIX = {
  coasting: 'Today: use the weights in Train and take the last set of every machine, cable and dumbbell move to failure.',
  close: 'Make the last set of each exercise a real fight, and log reps left honestly.',
  working: 'Keep logging reps left so this stays honest.',
  grind: 'On red days leave 3 reps in every set. Save the fight for green.',
} as const;
