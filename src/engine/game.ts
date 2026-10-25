/**
 * Pace points: a game built to reward the right kind of work.
 *
 * - Every rep scores. Heavier than last time pays more; dropping weight on a good day pays less.
 * - Effort pays by zone: failure on a green day pays the most, but on a red day the payout goes to
 *   backing off. Coasting (3+ reps left on a good day) barely scores.
 * - Any set can crit (x2, x3, or a x5 jackpot). Honest hard sets get better odds.
 * - PRs, rep records and beating last time pay bonuses. Bounties pay for breaking stalls.
 * - Weekly streaks (not daily, so rest days never break them) multiply everything.
 * - Double or nothing bets on hitting a set's target, and a loot crate after every workout.
 * - Sleep, check-ins and respecting red days earn points too.
 *
 * Everything except bets and loot is recomputed from the training log, so imported history scores
 * and nothing can drift. Crits use a seeded roll per set slot, so a set's luck never changes.
 */
import { addDays, weekStart } from './dates';
import { setPerf, zoneOf } from './training';
import type { AppData, Bet, LoggedSet, LootTier, Session, ZoneOrUnknown } from './types';
import { fmtW, key } from './util';

export const REP_PTS = 10;
export const HEAVIER = 1.25;
export const LIGHTER = 0.85;
export const FINISH_PTS = 100;
export const STAKES = [50, 100, 250] as const;
export const MAX_BETS = 3;

// Effort multipliers by reps left (0, 1, 2, 3, 4+). Barbell lifts peak at 1 rep left on green days.
const EFFORT = {
  green: [2.0, 1.7, 1.2, 0.7, 0.5],
  greenBar: [1.6, 1.9, 1.3, 0.7, 0.5],
  yellow: [1.1, 1.4, 1.6, 1.0, 0.6],
  red: [0.5, 0.8, 1.2, 1.6, 1.0],
} as const;

export function effortMult(rir: number | null, zone: ZoneOrUnknown, barbell: boolean): number {
  if (rir == null) return 1;
  const i = Math.max(0, Math.min(4, Math.round(rir)));
  if (zone === 'red') return EFFORT.red[i];
  if (zone === 'yellow') return EFFORT.yellow[i];
  return (barbell ? EFFORT.greenBar : EFFORT.green)[i];
}

/** The reps-left that pays the most today, for coaching copy. */
export function bestEffort(zone: ZoneOrUnknown, barbell: boolean): number {
  if (zone === 'red') return 3;
  if (zone === 'yellow') return 2;
  return barbell ? 1 : 0;
}

/** A stable number in [0, 1) from a string (FNV-1a). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function critChance(rir: number | null, zone: ZoneOrUnknown): number {
  if (rir == null) return 0.01;
  if (zone === 'red' && rir <= 1) return 0.01;
  return [0.12, 0.09, 0.05, 0.02][Math.round(rir)] ?? 0.01;
}

export type Crit = 1 | 2 | 3 | 5;
/** The seed is the set's slot (day, exercise, set number), so its luck is fixed; effort sets the odds. */
export function critFor(seed: string, rir: number | null, zone: ZoneOrUnknown): Crit {
  if (hash01(seed) >= critChance(rir, zone)) return 1;
  const v = hash01(seed + '#tier');
  return v < 0.1 ? 5 : v < 0.4 ? 3 : 2;
}

export const slotSeed = (date: string, day: string, ex: string, n: number) => `${date}|${key(day)}|${key(ex)}|${n}`;

export interface SetScore {
  pts: number;
  reps: number;
  load: number;
  effort: number;
  crit: Crit;
  heavier: boolean;
  lighter: boolean;
  coast: boolean;
  failure: boolean;
}

export function scoreSet(x: LoggedSet, o: { lastTopW: number | null; zone: ZoneOrUnknown; barbell: boolean; seed: string }): SetScore {
  const reps = Math.max(0, Math.round(x.r));
  const loaded = x.w > 0 && o.lastTopW != null && o.lastTopW > 0;
  const heavier = loaded && x.w > o.lastTopW! + 1e-9;
  const lighter = loaded && o.zone !== 'red' && x.w < o.lastTopW! * 0.9;
  const load = heavier ? HEAVIER : lighter ? LIGHTER : 1;
  const effort = effortMult(x.rir, o.zone, o.barbell);
  const crit = reps > 0 ? critFor(o.seed, x.rir, o.zone) : 1;
  const pts = Math.round(REP_PTS * reps * load * effort * crit);
  const goodDay = o.zone !== 'red' && o.zone !== 'yellow';
  return { pts, reps, load, effort, crit, heavier, lighter, coast: goodDay && x.rir != null && x.rir >= 3, failure: x.rir === 0 };
}

// ---------- Bounties ----------

export type BountyKind = 'stall' | 'failure' | 'smart' | 'backoff' | 'honest';
export interface Bounty { id: string; kind: BountyKind; title: string; detail: string; pts: number; ex?: string; beat?: number }

interface ExHist { topW: number[]; best: number[]; tops: { w: number; r: number }[]; pairs: { w: number; r: number }[] }

function stalled(h: ExHist | undefined): number | null {
  if (!h || h.best.length < 3) return null;
  const b = h.best, last = b[b.length - 1];
  return last <= Math.max(b[b.length - 2], b[b.length - 3]) * 1.01 ? last : null;
}

/** Up to three bounties for a workout, from the history before it. */
export function makeBounties(dayExercises: { name: string; type: string }[], zone: ZoneOrUnknown, hist: Map<string, ExHist>): Bounty[] {
  const out: Bounty[] = [];
  const lifts = dayExercises.filter(e => e.type !== 'cardio' && e.type !== 'circuit');
  if (!lifts.length) return out;
  if (zone === 'red') {
    out.push({ id: 'backoff', kind: 'backoff', title: 'Back-off day', detail: 'Keep every set at 2+ reps left. Recovery is training.', pts: 120 });
  } else if (zone === 'yellow') {
    out.push({ id: 'smart', kind: 'smart', title: 'Train, don’t test', detail: 'Every set at 1–2 reps left.', pts: 100 });
  } else {
    for (const e of lifts) {
      const h = hist.get(key(e.name));
      const beat = stalled(h);
      if (beat != null && h) {
        const t = h.tops[h.tops.length - 1];
        out.push({ id: 'stall:' + key(e.name), kind: 'stall', title: `Break the stall on ${e.name}`, detail: `Beat ${t.w > 0 ? `${fmtW(t.w)} × ${t.r}` : `${t.r} reps`}, your top set ${h.best.length} sessions running.`, pts: 200, ex: e.name, beat });
        break;
      }
    }
    const f = lifts.find(e => e.type !== 'barbell') ?? lifts[0];
    out.push({ id: 'failure:' + key(f.name), kind: 'failure', title: `Fight to failure on ${f.name}`, detail: 'Take the last set to 0 reps left.', pts: 100, ex: f.name });
  }
  out.push({ id: 'honest', kind: 'honest', title: 'Honest log', detail: 'Tap reps left on every set.', pts: 50 });
  return out;
}

export function bountyMet(b: Bounty, sets: LoggedSet[]): boolean {
  const lifted = sets.filter(x => x.r > 0);
  if (!lifted.length) return false;
  switch (b.kind) {
    case 'stall': return lifted.some(x => key(x.ex) === key(b.ex) && setPerf(x) > (b.beat ?? Infinity) * 1.005);
    case 'failure': { const mine = lifted.filter(x => key(x.ex) === key(b.ex)); return mine.length > 0 && mine[mine.length - 1].rir === 0; }
    case 'smart': return lifted.every(x => x.rir === 1 || x.rir === 2);
    case 'backoff': return lifted.every(x => x.rir != null && x.rir >= 2);
    case 'honest': return lifted.every(x => x.rir != null);
  }
}

// ---------- Levels ----------

export const RANKS = ['Rookie', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Titan'] as const;
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
export const levelCost = (lvl: number) => 2000 + 1500 * (lvl - 1);

export function levelFor(xp: number) {
  let level = 1, floor = 0;
  while (xp >= floor + levelCost(level)) { floor += levelCost(level); level++; }
  return { level, floor, next: floor + levelCost(level) };
}

export function rankName(level: number) {
  const band = Math.floor((level - 1) / 5);
  if (band >= RANKS.length) return `Legend ${level - RANKS.length * 5}`;
  return `${RANKS[band]} ${ROMAN[(level - 1) % 5]}`;
}

// ---------- Streaks ----------

export const streakMult = (weeks: number) => (weeks >= 8 ? 1.5 : weeks >= 4 ? 1.4 : 1 + 0.1 * Math.min(3, weeks));

// ---------- Loot ----------

export const LOOT: Record<LootTier, { label: string; min: number; max: number }> = {
  common: { label: 'Common', min: 50, max: 120 },
  rare: { label: 'Rare', min: 150, max: 300 },
  epic: { label: 'Epic', min: 400, max: 700 },
  legendary: { label: 'Legendary', min: 1200, max: 2000 },
};

/** Crate odds. Quality is the share of sets done at the effort that pays most today; a PR helps too. */
export function lootOdds(quality: number, pr: boolean): Record<LootTier, number> {
  const q = Math.max(0, Math.min(1, quality));
  const legendary = 0.01 + 0.04 * q + (pr ? 0.03 : 0);
  const epic = 0.06 + 0.12 * q + (pr ? 0.04 : 0);
  const rare = 0.22 + 0.13 * q;
  return { legendary, epic, rare, common: Math.max(0, 1 - legendary - epic - rare) };
}

export function rollLoot(quality: number, pr: boolean, rnd: () => number = Math.random): { tier: LootTier; pts: number } {
  const odds = lootOdds(quality, pr);
  const u = rnd();
  const tier: LootTier = u < odds.legendary ? 'legendary' : u < odds.legendary + odds.epic ? 'epic' : u < odds.legendary + odds.epic + odds.rare ? 'rare' : 'common';
  const { min, max } = LOOT[tier];
  return { tier, pts: Math.round((min + (max - min) * rnd()) / 10) * 10 };
}

// ---------- Bets ----------

export const betNet = (bets: Bet[] | undefined) => (bets ?? []).reduce((a, b) => a + (b.won ? b.stake : -b.stake), 0);
export const betWon = (bet: { w: number; reps: number }, x: LoggedSet | undefined) => !!x && x.r >= bet.reps && x.w >= bet.w - 1e-9;

// ---------- Whole sessions ----------

export interface Bonus { label: string; pts: number; kind: 'pr' | 'rep' | 'beat' | 'bounty' | 'finish' }
export interface ExerciseScore { name: string; sets: SetScore[]; bonus: Bonus | null; pts: number }
export interface SessionScore {
  exercises: ExerciseScore[];
  setPts: number;
  bonusPts: number;
  bounties: { bounty: Bounty; met: boolean }[];
  streak: number;
  mult: number;
  /** Points from sets, bonuses and bounties after the streak multiplier. */
  earned: number;
  bets: number;
  loot: number;
  total: number;
  crits: number;
  jackpots: number;
  prs: number;
  /** Share of sets at the effort that pays most today (0–1), for loot odds. */
  quality: number;
}

export interface DayPoints { date: string; label: string; pts: number }

export interface GameSummary {
  total: number;
  level: number;
  rank: string;
  into: number;
  need: number;
  next: string;
  /** Completed weeks in a row (plus this one, once its goal is met). */
  streak: number;
  weekGoal: number;
  weekDone: number;
  weekPts: number;
  todayPts: number;
  sessions: Map<string, SessionScore>;
  recovery: DayPoints[];
  /** Points per ISO week start, oldest first. */
  weeks: { week: string; pts: number }[];
}

type Lookup = (name: string) => { type: string } | undefined;

function lookupFor(data: AppData): Lookup {
  const m = new Map<string, { type: string }>();
  for (const b of data.program.blocks) for (const d of b.days) for (const e of d.exercises) if (!m.has(key(e.name))) m.set(key(e.name), e);
  return n => m.get(key(n));
}

function dayExercisesFor(data: AppData, dayName: string, sets: LoggedSet[], look: Lookup) {
  for (const b of data.program.blocks) for (const d of b.days) if (key(d.name) === key(dayName)) return d.exercises.map(e => ({ name: e.name, type: e.type }));
  const seen = new Set<string>();
  const out: { name: string; type: string }[] = [];
  for (const x of sets) if (!seen.has(key(x.ex))) { seen.add(key(x.ex)); out.push({ name: x.ex, type: look(x.ex)?.type ?? 'machine' }); }
  return out;
}

function zoneFor(data: AppData, s: Pick<Session, 'date' | 'zone'>): ZoneOrUnknown {
  const w = data.whoop[s.date];
  if (w && w.rec != null) return zoneOf(w.rec);
  return s.zone ?? 'unknown';
}

/** Runs the log in order. `extra` scores one more (unsaved) session after everything else. */
class Engine {
  readonly hist = new Map<string, ExHist>();
  private weekDates = new Map<string, Set<string>>();
  readonly look: Lookup;
  constructor(readonly data: AppData, readonly weekGoal: number) { this.look = lookupFor(data); }

  /** Weeks in a row that met the goal, counting back from the week before `date`. */
  streakBefore(date: string) {
    let n = 0, w = addDays(weekStart(date), -7);
    while ((this.weekDates.get(w)?.size ?? 0) >= this.weekGoal) { n++; w = addDays(w, -7); }
    return n;
  }

  bountiesFor(s: Pick<Session, 'date' | 'day' | 'zone' | 'sets'>, zone: ZoneOrUnknown) {
    return makeBounties(dayExercisesFor(this.data, s.day, s.sets, this.look), zone, this.hist);
  }

  score(s: Pick<Session, 'date' | 'day' | 'zone' | 'sets' | 'bets' | 'loot'>, commit: boolean): SessionScore {
    const zone = zoneFor(this.data, s);
    const bounties = this.bountiesFor(s, zone).map(b => ({ bounty: b, met: bountyMet(b, s.sets) }));
    const groups = new Map<string, { name: string; sets: LoggedSet[] }>();
    for (const x of s.sets) {
      if (!(x.r > 0)) continue;
      const k = key(x.ex);
      if (!groups.has(k)) groups.set(k, { name: x.ex, sets: [] });
      groups.get(k)!.sets.push(x);
    }
    const exercises: ExerciseScore[] = [];
    let crits = 0, jackpots = 0, prs = 0, best = 0, graded = 0;
    for (const [k, g] of groups) {
      const h = this.hist.get(k);
      const barbell = this.look(g.name)?.type === 'barbell';
      const lastTopW = h?.topW.length ? h.topW[h.topW.length - 1] : null;
      const sets = g.sets.map((x, n) => scoreSet(x, { lastTopW, zone, barbell, seed: slotSeed(s.date, s.day, g.name, n) }));
      for (const r of sets) { if (r.crit > 1) crits++; if (r.crit === 5) jackpots++; }
      for (const x of g.sets) if (x.rir != null) { graded++; if (Math.round(Math.min(4, x.rir)) === bestEffort(zone, barbell)) best++; }
      let bonus: Bonus | null = null;
      if (h && h.best.length) {
        const top = Math.max(...g.sets.map(setPerf));
        const allBest = Math.max(...h.best);
        if (top > allBest * 1.005) { bonus = { label: 'PR', pts: 150, kind: 'pr' }; prs++; }
        else if (g.sets.some(x => x.w > 0 && h.pairs.some(p => p.w >= x.w - 1e-9) && x.r > Math.max(...h.pairs.filter(p => p.w >= x.w - 1e-9).map(p => p.r)))) bonus = { label: 'Rep record', pts: 60, kind: 'rep' };
        else if (top > h.best[h.best.length - 1] * 1.005) bonus = { label: 'Beat last time', pts: 40, kind: 'beat' };
      }
      exercises.push({ name: g.name, sets, bonus, pts: sets.reduce((a, r) => a + r.pts, 0) + (bonus?.pts ?? 0) });
    }
    const lifted = exercises.length > 0;
    const setPts = exercises.reduce((a, e) => a + e.sets.reduce((b, r) => b + r.pts, 0), 0);
    const bonusPts = exercises.reduce((a, e) => a + (e.bonus?.pts ?? 0), 0) + bounties.filter(b => b.met).reduce((a, b) => a + b.bounty.pts, 0) + (lifted ? FINISH_PTS : 0);
    const streak = this.streakBefore(s.date);
    const mult = streakMult(streak);
    const earned = Math.round((setPts + bonusPts) * mult);
    const bets = betNet(s.bets);
    const loot = s.loot?.pts ?? 0;
    const out: SessionScore = { exercises, setPts, bonusPts, bounties, streak, mult, earned, bets, loot, total: earned + bets + loot, crits, jackpots, prs, quality: graded ? best / graded : 0 };
    if (commit) this.commit(s);
    return out;
  }

  private commit(s: Pick<Session, 'date' | 'sets'>) {
    const groups = new Map<string, LoggedSet[]>();
    for (const x of s.sets) if (x.r > 0) { const k = key(x.ex); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(x); }
    for (const [k, sets] of groups) {
      const h = this.hist.get(k) ?? { topW: [], best: [], tops: [], pairs: [] };
      let top = sets[0];
      for (const x of sets) if (setPerf(x) > setPerf(top)) top = x;
      h.topW.push(Math.max(...sets.map(x => x.w || 0)));
      h.best.push(setPerf(top));
      h.tops.push({ w: top.w || 0, r: top.r });
      for (const x of sets) h.pairs.push({ w: x.w || 0, r: x.r });
      this.hist.set(k, h);
    }
    if (groups.size) {
      const w = weekStart(s.date);
      if (!this.weekDates.has(w)) this.weekDates.set(w, new Set());
      this.weekDates.get(w)!.add(s.date);
    }
  }
}

const sortSessions = (list: Session[]) => list.map((s, i) => ({ s, i })).sort((a, b) => (a.s.date < b.s.date ? -1 : a.s.date > b.s.date ? 1 : a.i - b.i)).map(x => x.s);

export const weekGoalFor = (data: AppData, today: string) => {
  let best: AppData['program']['blocks'][number] | undefined;
  for (const b of data.program.blocks) if (!b.start || b.start <= today) if (!best || (b.start || '') >= (best.start || '')) best = b;
  const n = (best ?? data.program.blocks[0])?.days.length ?? 3;
  return Math.max(1, Math.min(5, n || 3));
};

/** Points for a day of WHOOP data: checking in, sleep, and respecting a red day. */
export function recoveryPoints(data: AppData, date: string, sessionsThatDay: Session[]): DayPoints[] {
  const w = data.whoop[date];
  if (!w || w.rec == null) return [];
  const out: DayPoints[] = [{ date, label: 'Checked in', pts: 10 }];
  if (w.sleep != null && w.sleep >= 8) out.push({ date, label: '8+ hours of sleep', pts: 50 });
  else if (w.sleep != null && w.sleep >= 7) out.push({ date, label: '7+ hours of sleep', pts: 30 });
  if (zoneOf(w.rec) === 'red') {
    const sets = sessionsThatDay.flatMap(s => s.sets).filter(x => x.r > 0);
    if (!sets.length || sets.every(x => x.rir != null && x.rir >= 2)) out.push({ date, label: 'Respected a red day', pts: 60 });
  }
  return out;
}

export function summarize(data: AppData, today: string): GameSummary {
  const weekGoal = weekGoalFor(data, today);
  const eng = new Engine(data, weekGoal);
  const list = sortSessions(data.sessions.filter(s => s.date <= today));
  const sessions = new Map<string, SessionScore>();
  const byWeek = new Map<string, number>();
  const add = (date: string, pts: number) => { const w = weekStart(date); byWeek.set(w, (byWeek.get(w) ?? 0) + pts); };
  let total = 0, todayPts = 0;
  for (const s of list) {
    const sc = eng.score(s, true);
    sessions.set(s.id, sc);
    total += sc.total; add(s.date, sc.total);
    if (s.date === today) todayPts += sc.total;
  }
  const recovery: DayPoints[] = [];
  const byDate = new Map<string, Session[]>();
  for (const s of list) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date)!.push(s); }
  for (const date of Object.keys(data.whoop)) {
    if (date > today) continue;
    for (const r of recoveryPoints(data, date, byDate.get(date) ?? [])) { recovery.push(r); total += r.pts; add(date, r.pts); if (date === today) todayPts += r.pts; }
  }
  recovery.sort((a, b) => (a.date < b.date ? 1 : -1));
  const { level, floor, next } = levelFor(Math.max(0, total));
  const thisWeek = weekStart(today);
  const weekDone = new Set(list.filter(s => weekStart(s.date) === thisWeek && s.sets.some(x => x.r > 0)).map(s => s.date)).size;
  const before = eng.streakBefore(today);
  const streak = before + (weekDone >= weekGoal ? 1 : 0);
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, pts]) => ({ week, pts }));
  return {
    total, level, rank: rankName(level), into: Math.max(0, total) - floor, need: next - floor, next: rankName(level + 1),
    streak, weekGoal, weekDone, weekPts: byWeek.get(thisWeek) ?? 0, todayPts, sessions, recovery, weeks,
  };
}

/** Scores a workout in progress (not saved yet) against everything logged before it. */
export function scoreDraft(data: AppData, s: Pick<Session, 'date' | 'day' | 'zone' | 'sets' | 'bets'>): SessionScore {
  const eng = new Engine(data, weekGoalFor(data, s.date));
  for (const x of sortSessions(data.sessions.filter(v => v.date <= s.date))) eng.score(x, true);
  return eng.score({ ...s, loot: undefined }, false);
}

/** Today's bounties for a workout day, before anything is logged. */
export function bountiesToday(data: AppData, date: string, day: string, zone: ZoneOrUnknown): Bounty[] {
  const eng = new Engine(data, weekGoalFor(data, date));
  for (const x of sortSessions(data.sessions.filter(v => v.date <= date))) eng.score(x, true);
  return eng.bountiesFor({ date, day, zone: zone === 'unknown' ? null : zone, sets: [] }, zone);
}
