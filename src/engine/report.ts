/**
 * What Pace shares with the coach: the live view behind the coach link and the "Send to coach" text.
 * Built on the phone from the training log, so the server only ever stores this snapshot.
 */
import { addDays, fmtMid, fmtShort, weekStart } from './dates';
import { bestRaw, Ctx, evidence, FIX, rxText, topStr, VOICE, ZONES } from './training';
import type { Feel, Tone, Zone, ZoneOrUnknown } from './types';
import { fmtW, key } from './util';

export const REPORT_VERSION = 1;

export interface RSet { w: number; r: number; rir: number | null }
export interface RExercise {
  name: string;
  /** The coach's prescription for this exercise ("3 × 10–12"), when it's in the program. */
  rx: string | null;
  sets: RSet[];
  top: string;
  prev: string | null;
  prevDate: string | null;
  /** Best set versus the previous session of this exercise, in percent. */
  change: number | null;
  pr: boolean;
}
export interface RSession {
  id: string;
  date: string;
  day: string;
  zone: Zone | null;
  rec: number | null;
  feel: Feel | null;
  exercises: RExercise[];
  /** Sets that ended with 3+ reps left, 0–1 left, and sets with reps-left logged at all. */
  easy: number;
  hard: number;
  logged: number;
}
export interface RDay { date: string; rec: number; hrv?: number | null; rhr?: number | null; sleep?: number | null; strain?: number | null }
export interface RTarget {
  name: string;
  /** The coach's prescription. */
  rx: string;
  /** Pace's target: "200 lb × 6", "12 reps" or the cardio note. */
  target: string;
  sets: number | null;
  tag: string | null;
  why: string;
}
export type CoastLevel = 'coasting' | 'close' | 'working' | 'grind' | 'early';

export interface CoachReport {
  v: typeof REPORT_VERSION;
  name: string;
  coach: string;
  tone: Tone;
  /** When the phone built this (ISO time). */
  at: string;
  today: string;
  readiness: { zone: ZoneOrUnknown; rec: number | null; hrv?: number | null; rhr?: number | null; sleep?: number | null; notes: string[] };
  coast: { level: CoastLevel; score: number | null; line: string; fix: string | null; evidence: string[] };
  week: { goal: number; done: number; streak: number } | null;
  next: { label: string; day: string; zone: ZoneOrUnknown; targets: RTarget[] } | null;
  /** Newest first. */
  sessions: RSession[];
  /** Last 30 days, oldest first. */
  recovery: RDay[];
  effort: { week: string; hard: number; steady: number; easy: number }[];
  lifts: { name: string; series: number[]; top: string; change: number | null; loaded: boolean; last: string }[];
  program: { block: string; days: { name: string; dow: number | null; exercises: { name: string; rx: string }[] }[] } | null;
  /** Things the athlete told the AI coach (injuries, equipment), only when they choose to share them. */
  notes: string[];
}

export interface ReportOpts {
  name: string;
  /** Share HRV, sleep, resting heart rate and strain. Recovery % is always shared: it explains the targets. */
  recovery: boolean;
  /** Share what the athlete told the AI coach to remember. */
  notes: boolean;
}

export const FEEL_LABEL: Record<Feel, string> = { easy: 'Too easy', right: 'Just right', hard: 'Too hard', hurt: 'Something hurt' };

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (a > 0 ? round1(((b - a) / a) * 100) : null);

export function buildReport(ctx: Ctx, opts: ReportOpts, now: Date = new Date(), week?: { goal: number; done: number; streak: number }): CoachReport {
  const { data, today } = ctx;
  const tone: Tone = data.settings.tone === 'clean' ? 'clean' : 'nofilter';

  // The coach's prescription by exercise, active block first.
  const rxBy = new Map<string, string>();
  const active = ctx.activeBlock();
  for (const b of [active, ...data.program.blocks]) for (const d of b?.days ?? []) for (const e of d.exercises) if (!rxBy.has(key(e.name))) rxBy.set(key(e.name), rxText(e));

  const r = ctx.readiness(today);
  const readiness: CoachReport['readiness'] = { zone: r.zone, rec: r.rec ?? null, notes: opts.recovery ? r.notes : [] };
  if (opts.recovery) { readiness.hrv = r.hrv ?? null; readiness.rhr = r.rhr ?? null; readiness.sleep = r.sleep ?? null; }

  const c = ctx.coast();
  const v = VOICE[tone];
  const coast: CoachReport['coast'] = c.enough && c.level
    ? { level: c.level, score: c.score ?? null, line: c.level === 'coasting' && r.zone === 'green' ? v.greenCoast : v[c.level], fix: FIX[c.level], evidence: evidence(c) }
    : { level: 'early', score: null, line: v.early, fix: null, evidence: [] };

  // Today's (or the next) workout and the targets Pace is giving for it.
  let next: CoachReport['next'] = null;
  const days = ctx.days();
  if (days.length) {
    const pick = ctx.pickDay();
    const day = days[pick.idx] ?? days[0];
    const zone = r.zone;
    next = {
      label: pick.label, day: day.name, zone,
      targets: day.exercises.map(ex => {
        const p = ctx.prescribe(ex, zone);
        if (p.kind === 'free') return { name: ex.name, rx: rxText(ex), target: ex.note || rxText(ex), sets: null, tag: null, why: '' };
        if (p.kind === 'new') return { name: ex.name, rx: rxText(ex), target: `${p.reps} reps`, sets: p.sets, tag: 'First time', why: p.why };
        return { name: ex.name, rx: rxText(ex), target: p.w > 0 ? `${fmtW(p.w)} lb × ${p.reps}` : `${p.reps} reps`, sets: p.sets, tag: p.tagText, why: p.why };
      }),
    };
  }

  const sessions: RSession[] = ctx.sessions
    .filter(s => s.date <= today && s.date >= addDays(today, -56) && s.sets.length)
    .slice(-20)
    .reverse()
    .map(s => {
      const order: string[] = [];
      const byEx = new Map<string, { name: string; sets: RSet[] }>();
      for (const x of s.sets) {
        const k = key(x.ex);
        if (!byEx.has(k)) { byEx.set(k, { name: x.ex, sets: [] }); order.push(k); }
        byEx.get(k)!.sets.push({ w: x.w || 0, r: x.r, rir: x.rir });
      }
      const exercises = order.map(k => {
        const g = byEx.get(k)!;
        const h = ctx.hist(g.name);
        const i = h.findIndex(e => e.id === s.id);
        const before = i > 0 ? h.slice(0, i) : [];
        const prev = before[before.length - 1];
        const asLogged = g.sets.map(x => ({ ex: g.name, ...x }));
        const best = bestRaw(asLogged);
        const prevBest = before.length ? Math.max(...before.map(e => bestRaw(e.sets))) : 0;
        return {
          name: g.name,
          rx: rxBy.get(k) ?? null,
          sets: g.sets,
          top: topStr(asLogged),
          prev: prev ? topStr(prev.sets) : null,
          prevDate: prev ? prev.date : null,
          change: prev ? pct(bestRaw(prev.sets), best) : null,
          pr: before.length > 0 && best > prevBest * 1.001,
        };
      });
      const rirs = s.sets.map(x => x.rir).filter((x): x is number => x != null);
      return {
        id: s.id, date: s.date, day: s.day, zone: ctx.sessionZone(s), rec: data.whoop[s.date]?.rec ?? s.rec ?? null, feel: s.feel ?? null,
        exercises, easy: rirs.filter(x => x >= 3).length, hard: rirs.filter(x => x <= 1).length, logged: rirs.length,
      };
    });

  const recovery: RDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = data.whoop[date];
    if (!d || d.rec == null) continue;
    recovery.push(opts.recovery ? { date, rec: d.rec, hrv: d.hrv, rhr: d.rhr, sleep: d.sleep, strain: d.strain ?? null } : { date, rec: d.rec });
  }

  const start = weekStart(today);
  const effort = Array.from({ length: 6 }, (_, i) => addDays(start, -7 * (5 - i))).map(w => {
    const end = addDays(w, 7);
    let hard = 0, steady = 0, easy = 0;
    for (const s of ctx.sessions) if (s.date >= w && s.date < end) for (const x of s.sets) { if (x.rir == null) continue; if (x.rir <= 1) hard++; else if (x.rir === 2) steady++; else easy++; }
    return { week: w, hard, steady, easy };
  });

  const names = new Map<string, string>();
  for (const s of ctx.sessions) for (const x of s.sets) if (!names.has(key(x.ex))) names.set(key(x.ex), x.ex);
  const lifts = [...names.values()].map(n => ({ name: n, h: ctx.hist(n) })).filter(g => g.h.length >= 2)
    .sort((a, b) => b.h[b.h.length - 1].date.localeCompare(a.h[a.h.length - 1].date) || b.h.length - a.h.length)
    .slice(0, 10)
    .map(g => {
      const series = g.h.slice(-10).map(e => round1(bestRaw(e.sets)));
      const last = g.h[g.h.length - 1];
      return { name: g.name, series, top: topStr(last.sets), change: pct(series[0], series[series.length - 1]), loaded: last.sets.some(x => x.w > 0), last: last.date };
    });

  const program = active
    ? { block: active.name, days: active.days.map(d => ({ name: d.name, dow: d.dow, exercises: d.exercises.map(e => ({ name: e.name, rx: rxText(e) })) })) }
    : null;

  return {
    v: REPORT_VERSION,
    name: opts.name.trim().slice(0, 40),
    coach: data.settings.coach,
    tone,
    at: now.toISOString(),
    today,
    readiness,
    coast,
    week: week ?? null,
    next,
    sessions,
    recovery,
    effort,
    lifts,
    program,
    notes: opts.notes ? data.coach.notes.map(n => n.text).slice(0, 20) : [],
  };
}

/** The report without its timestamp, for deciding whether anything changed since the last upload. */
export const reportSignature = (r: CoachReport) => JSON.stringify({ ...r, at: '' });

// ---------- Text for the share sheet ----------

export function setText(x: RSet) {
  const load = x.w > 0 ? `${fmtW(x.w)}×${x.r}` : `${x.r} reps`;
  return x.rir == null ? load : `${load} (${x.rir} left)`;
}

const zoneWord = (z: ZoneOrUnknown | null) => (z && z !== 'unknown' ? ZONES[z].label.toLowerCase() : null);

function recoveryLine(rec: number | null, zone: ZoneOrUnknown | null, d?: { hrv?: number | null; sleep?: number | null }) {
  const bits: string[] = [];
  if (rec != null) bits.push(`Recovery ${Math.round(rec)}%${zoneWord(zone) ? ` (${zoneWord(zone)})` : ''}`);
  if (d?.hrv != null) bits.push(`HRV ${Math.round(d.hrv)} ms`);
  if (d?.sleep != null) bits.push(`Sleep ${round1(d.sleep)} h`);
  return bits.join(' · ');
}

function exerciseLines(e: RExercise, withRx = true) {
  const head = withRx && e.rx ? `${e.name} (${e.rx})` : e.name;
  const out = [head, e.sets.map(setText).join(', ')];
  if (e.pr) out.push('New best');
  else if (e.change != null && e.prevDate) out.push(Math.abs(e.change) < 0.5 ? `Same as ${fmtShort(e.prevDate)}` : `Best set ${e.change > 0 ? 'up' : 'down'} ${Math.abs(e.change)}% from ${fmtShort(e.prevDate)}`);
  return out;
}

function coastLine(r: CoachReport) {
  if (r.coast.level === 'early') return null;
  const head = { coasting: 'Coasting', close: 'Close', working: 'Working', grind: 'Grinding on red days' }[r.coast.level];
  return `Coasting check: ${head}. ${r.coast.evidence.slice(0, 2).join(' ')}`.trim();
}

/** One workout, ready to text to the coach. */
export function workoutText(r: CoachReport, sessionId: string, link?: string | null): string | null {
  const s = r.sessions.find(x => x.id === sessionId);
  if (!s) return null;
  const day = r.recovery.find(d => d.date === s.date);
  const L: string[] = [`${s.day} · ${fmtMid(s.date)}`];
  const rec = recoveryLine(s.rec, s.zone, day);
  if (rec) L.push(rec);
  if (s.feel) L.push(`Felt: ${FEEL_LABEL[s.feel]}`);
  for (const e of s.exercises) L.push('', ...exerciseLines(e));
  if (s.logged) L.push('', `${s.hard} of ${s.logged} sets within a rep of failure, ${s.easy} with 3+ left.`);
  const cl = coastLine(r);
  if (cl) L.push(cl);
  if (link) L.push('', `Live view: ${link}`);
  return L.join('\n');
}

/** The last 7 days, ready to text to the coach. */
export function weekText(r: CoachReport, link?: string | null): string {
  const from = addDays(r.today, -6);
  const list = r.sessions.filter(s => s.date >= from).reverse();
  const L: string[] = [`${r.name ? `${r.name}'s` : 'My'} week · ${fmtShort(from)} to ${fmtShort(r.today)}`];
  const recs = r.recovery.filter(d => d.date >= from).map(d => d.rec);
  if (recs.length) L.push(`Average recovery ${Math.round(recs.reduce((a, b) => a + b, 0) / recs.length)}% over ${recs.length} day${recs.length === 1 ? '' : 's'}`);
  if (!list.length) L.push('', 'No workouts logged this week.');
  for (const s of list) {
    const rec = s.rec != null ? ` · ${Math.round(s.rec)}% recovery` : '';
    L.push('', `${fmtMid(s.date)} · ${s.day}${rec}${s.feel ? ` · ${FEEL_LABEL[s.feel]}` : ''}`);
    for (const e of s.exercises) L.push(`${e.name}: ${e.sets.map(setText).join(', ')}${e.pr ? ' · new best' : ''}`);
  }
  const cl = coastLine(r);
  if (cl) L.push('', cl);
  if (link) L.push('', `Live view: ${link}`);
  return L.join('\n');
}
