import { addDays, daysBetween } from './dates';
import type { Bounty, GameSummary } from './game';
import { Ctx, evidence, isFree, rxText } from './training';
import type { AppData, CoachNote, Feel, LoggedSet, Nudge, Session } from './types';
import { fmtW, key } from './util';

const setLine = (sets: LoggedSet[]) => sets.map(x => `${x.w > 0 ? fmtW(x.w) + 'x' : ''}${x.r}${x.rir != null ? '@' + x.rir + 'RIR' : ''}`).join(', ');
const FEEL: Record<Feel, string> = { easy: 'felt too easy', right: 'felt just right', hard: 'felt too hard', hurt: 'something hurt' };

/** Every exercise name the coach may nudge: the active block and any block starting later. */
export function programExercises(ctx: Ctx): string[] {
  const names = new Map<string, string>();
  const active = ctx.activeBlock();
  for (const b of ctx.data.program.blocks) {
    if (b !== active && b.start && b.start <= ctx.today) continue;
    for (const d of b.days) for (const e of d.exercises) if (!isFree(e.type) && !names.has(key(e.name))) names.set(key(e.name), e.name);
  }
  return [...names.values()];
}

/** The coach's standing instructions plus everything it knows today. Sent as the system prompt. */
export function coachSystem(ctx: Ctx, dayIdx: number, game: GameSummary | null, bounties: Bounty[]): string {
  const d = ctx.data, t = ctx.today, r = ctx.readiness(t), c = ctx.coast(), coach = d.settings.coach || 'Sarah';
  const tone = d.settings.tone === 'clean'
    ? 'Direct and encouraging. No profanity.'
    : `Blunt and funny, like a coach who won't let the lifter coast. When the numbers show coasting, tell them to quit being a bitch and lift more weight; the lifter and ${coach} asked for exactly that line. Keep any swearing to that one line, and only aim it at effort.`;
  const day = ctx.days()[dayIdx];
  const plan = day ? day.exercises.map(ex => {
    const p = ctx.prescribe(ex, r.zone);
    if (p.kind === 'free') return `- ${ex.name}: ${rxText(ex)}`;
    const target = p.kind === 'lift' ? `${p.w ? fmtW(p.w) + ' lb x ' : ''}${p.reps}` : `find weight x ${p.reps}`;
    return `- ${ex.name}: written ${rxText(ex)}${ex.note ? ` (${ex.note})` : ''}; Pace target ${target}, ${p.sets} sets; ${p.effort}; last time ${p.kind === 'lift' ? p.last : 'none'}${p.kind === 'lift' && p.why.startsWith('Coach:') ? `; ${p.why}` : ''}`;
  }).join('\n') : 'none';
  const wl = Object.keys(d.whoop).filter(x => { const g = daysBetween(x, t); return g >= 0 && g < 14; }).sort().map(x => {
    const v = d.whoop[x];
    return `${x}: recovery ${v.rec}%${v.hrv != null ? `, HRV ${v.hrv}` : ''}${v.rhr != null ? `, RHR ${v.rhr}` : ''}${v.sleep != null ? `, sleep ${v.sleep}h` : ''}${v.perf != null ? ` (${v.perf}% of need)` : ''}${v.strain != null ? `, strain ${v.strain}` : ''}`;
  }).join('\n') || 'none';
  const since = addDays(t, -14);
  const ww = Object.values(d.whoopWorkouts ?? {}).filter(w => w.date >= since && w.date <= t).sort((a, b) => (a.start < b.start ? -1 : 1))
    .map(w => `${w.date} ${w.sport}${w.strain != null ? `, strain ${w.strain}` : ''}${w.avgHr != null ? `, avg HR ${w.avgHr}` : ''}`).join('\n') || 'none';
  const sl = ctx.sessions.slice(-10).map(s => {
    const byEx = new Map<string, LoggedSet[]>();
    s.sets.forEach(x => { if (!byEx.has(x.ex)) byEx.set(x.ex, []); byEx.get(x.ex)!.push(x); });
    const pts = game?.sessions.get(s.id);
    return `${s.date} ${s.day} [${ctx.sessionZone(s) || 'no check-in'}]${s.feel ? ` (${FEEL[s.feel]})` : ''}${pts ? ` ${pts.total} pts${pts.prs ? `, ${pts.prs} PR` : ''}` : ''}: ` + [...byEx.entries()].map(([n, g]) => `${n} ${setLine(g)}`).join('; ');
  }).join('\n') || 'none';
  const coast = c.enough ? `score ${c.score}/100 (${c.level}); ${evidence(c).join(' ')}` : `not enough sessions yet (${c.n} in 3 weeks)`;
  const notes = d.coach.notes.map(n => `[${n.id}] ${n.text}`).join('\n') || 'none';
  const nudges = d.coach.nudges.map(n => `${n.ex}: ${n.change} (${n.reason})`).join('\n') || 'none';
  const gameLine = game && d.settings.game
    ? `${game.rank}, ${game.total} points, ${game.streak}-week streak, ${game.weekDone} of ${game.weekGoal} workouts this week, ${game.todayPts} points today.${bounties.length ? ' Bounties today: ' + bounties.map(b => `${b.title} (+${b.pts})`).join('; ') + '.' : ''}`
    : 'off';
  return [
    `You are Pace, the strength coach inside a lifter's training app, talking with them in a chat. The goal is getting as strong as possible. Coach like a real coach texting: specific, from the numbers, never generic.`,
    'Rules:',
    `- ${coach}, the lifter's coach, writes the program. Never change her exercises, sets or order. Adjust only weight, reps inside her ranges, and effort.`,
    '- WHOOP recovery zones: green 67-100 means progress, yellow 34-66 means match last time, red 0-33 means back off.',
    '- RIR means reps in reserve. Sets ending at 3+ RIR are too easy to build strength. On green days the last set of machine, cable, dumbbell and bodyweight moves should reach failure. Heavy barbell lifts stop at 1 RIR unless there is a spotter.',
    '- Use exercises and pounds from the data. Never invent numbers. If data is missing, say what to log.',
    '- Feedback changes the plan. When the lifter says an exercise felt too light or too heavy, a machine maxed out, or they want to repeat a weight, add a nudge for that exercise: up = one weight step heavier next time, down = one step lighter, hold = repeat last time. Use exact names from PROGRAM EXERCISES. Never nudge up on a red day or for something that hurts.',
    '- Pain: for sharp pain, numbness, or pain that lasts after training, tell them to stop that movement and get it checked by a physical therapist or doctor. Never coach through it. For mild achiness, suggest backing off that lift (nudge down or hold) and remember it.',
    '- Memory: use remember for durable facts worth keeping (injuries, equipment limits, preferences, goals, schedule), each under 100 characters. Skip one-off chatter and anything already in NOTES. Use forget with a note id when something no longer applies.',
    '- Points: Pace has a points game (reps, effort by zone, crits, double-or-nothing bets, loot crates, weekly streaks). Use it to motivate when it fits, but recovery and form come first. Never push failure on a red day to chase points; red days pay for backing off.',
    `- Voice: ${tone}`,
    '- Under 120 words unless they ask for a plan. Plain text in short lines; use "- " for lists. No headings, bold or emoji.',
    '- In reply, mention any nudge or memory change in plain words (for example "Bumped Leg Press up a step for next time.").',
    '',
    'DATA',
    `Today ${t}: ${r.zone === 'unknown' ? 'no recovery yet' : `recovery ${r.rec}% (${r.zone})${r.hrv != null ? `, HRV ${r.hrv}` : ''}${r.sleep != null ? `, sleep ${r.sleep}h` : ''}`}${r.notes.length ? '. ' + r.notes.join(' ') : ''}`,
    `Today's workout: ${day ? day.name : 'none'}`, plan,
    `Coasting check: ${coast}`,
    `Points: ${gameLine}`,
    'WHOOP, last 14 days:', wl,
    'WHOOP workouts, last 14 days:', ww,
    'Sessions, oldest first (weight x reps @RIR):', sl,
    'NOTES (things to always keep in mind):', notes,
    'PENDING NUDGES (applied to next targets):', nudges,
    'PROGRAM EXERCISES:', programExercises(ctx).join('; ') || 'none',
  ].join('\n');
}

export const COACH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'remember', 'forget', 'nudges'],
  properties: {
    reply: { type: 'string' },
    remember: { type: 'array', items: { type: 'string' } },
    forget: { type: 'array', items: { type: 'string' } },
    nudges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['exercise', 'change', 'reason'],
        properties: { exercise: { type: 'string' }, change: { type: 'string', enum: ['up', 'down', 'hold'] }, reason: { type: 'string' } },
      },
    },
  },
} as const;

export interface CoachReply { reply: string; remember: string[]; forget: string[]; nudges: { exercise: string; change: 'up' | 'down' | 'hold'; reason: string }[] }

/** Keeps only what the app can act on: real exercise names, real note ids, short notes, no duplicates. */
export function checkCoachReply(raw: unknown, ctx: Ctx): CoachReply {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CoachReply>;
  const names = new Map(programExercises(ctx).map(n => [key(n), n]));
  const have = new Set(ctx.data.coach.notes.map(n => n.text.toLowerCase().trim()));
  const ids = new Set(ctx.data.coach.notes.map(n => n.id));
  const zone = ctx.readiness(ctx.today).zone;
  const remember = (Array.isArray(r.remember) ? r.remember : []).map(s => String(s).trim().slice(0, 140)).filter(s => s && !have.has(s.toLowerCase())).slice(0, 3);
  const forget = (Array.isArray(r.forget) ? r.forget : []).map(String).filter(id => ids.has(id));
  const seen = new Set<string>();
  const nudges = (Array.isArray(r.nudges) ? r.nudges : []).flatMap(n => {
    const name = names.get(key(n?.exercise));
    if (!name || seen.has(key(name)) || !['up', 'down', 'hold'].includes(n.change)) return [];
    if (n.change === 'up' && zone === 'red') return [];
    seen.add(key(name));
    return [{ exercise: name, change: n.change, reason: String(n.reason || '').trim().slice(0, 80) || 'Your feedback' }];
  }).slice(0, 6);
  const reply = typeof r.reply === 'string' && r.reply.trim() ? r.reply.trim() : 'Got it.';
  return { reply, remember, forget, nudges };
}

export const describeNudge = (n: Pick<Nudge, 'ex' | 'change'>) =>
  n.change === 'up' ? `${n.ex}: up a step next time` : n.change === 'down' ? `${n.ex}: down a step next time` : `${n.ex}: repeat last time`;

/** Applies a checked reply to the data. Returns the list of changes to show under the message. */
export function applyCoachReply(d: AppData, c: CoachReply, today: string, newId: () => string): string[] {
  const changes: string[] = [];
  if (c.forget.length) {
    for (const id of c.forget) { const n = d.coach.notes.find(x => x.id === id); if (n) changes.push(`Forgot: ${n.text}`); }
    d.coach.notes = d.coach.notes.filter(n => !c.forget.includes(n.id));
  }
  for (const text of c.remember) {
    const note: CoachNote = { id: newId(), text, at: today };
    d.coach.notes.push(note);
    changes.push(`Remembered: ${text}`);
  }
  if (d.coach.notes.length > 30) d.coach.notes = d.coach.notes.slice(-30);
  for (const n of c.nudges) {
    d.coach.nudges = d.coach.nudges.filter(x => key(x.ex) !== key(n.exercise)).concat({ ex: n.exercise, change: n.change, reason: n.reason, at: today });
    changes.push(describeNudge({ ex: n.exercise, change: n.change }));
  }
  return changes;
}

/** Without Claude: "too easy" moves every loaded lift up a step next time; "too hard" holds them. */
export function feelNudges(s: Session, feel: Feel, today: string, typeOf: (name: string) => string | undefined): Nudge[] {
  if (feel !== 'easy' && feel !== 'hard') return [];
  const seen = new Set<string>();
  const out: Nudge[] = [];
  for (const x of s.sets) {
    const t = typeOf(x.ex);
    if (!(x.r > 0) || seen.has(key(x.ex)) || t === 'cardio' || t === 'circuit') continue;
    seen.add(key(x.ex));
    out.push({ ex: x.ex, change: feel === 'easy' ? 'up' : 'hold', reason: feel === 'easy' ? `${s.day} felt too easy` : `${s.day} felt too hard`, at: today });
  }
  return out;
}

export const feelMessage = (s: Session, feel: Feel, queued: Nudge[]) =>
  `Workout feedback: ${s.day} on ${s.date} ${FEEL[feel]}.${queued.length ? ` Pace queued: ${queued.map(n => describeNudge(n)).join('; ')}.` : ''}${feel === 'hurt' ? ' Ask me what hurt and adjust.' : ' What should I change?'}`;
