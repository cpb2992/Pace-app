import { daysBetween } from './dates';
import { Ctx, evidence, rxText } from './training';
import type { LoggedSet } from './types';
import { fmtW } from './util';

const setLine = (sets: LoggedSet[]) => sets.map(x => `${x.w > 0 ? fmtW(x.w) + 'x' : ''}${x.r}${x.rir != null ? '@' + x.rir + 'RIR' : ''}`).join(', ');

/** Builds the coaching prompt the backend sends to Claude. Everything the coach knows comes from here. */
export function buildCoachPrompt(ctx: Ctx, dayIdx: number, question: string, previous?: { q: string; a: string }) {
  const d = ctx.data, t = ctx.today, r = ctx.readiness(t), c = ctx.coast(), coach = d.settings.coach || 'Sarah';
  const tone = d.settings.tone === 'clean'
    ? 'Direct and encouraging. No profanity.'
    : `Blunt and funny, like a coach who won't let the lifter coast. When the numbers show coasting, tell them to quit being a bitch and lift more weight; the lifter and ${coach} asked for exactly that line. Keep any swearing to that one line, and only aim it at effort.`;
  const day = ctx.days()[dayIdx];
  const plan = day ? day.exercises.map(ex => {
    const p = ctx.prescribe(ex, r.zone);
    if (p.kind === 'free') return `- ${ex.name}: ${rxText(ex)}`;
    const target = p.kind === 'lift' ? `${p.w ? fmtW(p.w) + ' lb x ' : ''}${p.reps}` : `find weight x ${p.reps}`;
    return `- ${ex.name}: written ${rxText(ex)}${ex.note ? ` (${ex.note})` : ''}; Pace target ${target}, ${p.sets} sets; ${p.effort}; last time ${p.kind === 'lift' ? p.last : 'none'}`;
  }).join('\n') : 'none';
  const wl = Object.keys(d.whoop).filter(x => { const g = daysBetween(x, t); return g >= 0 && g < 21; }).sort().map(x => {
    const v = d.whoop[x];
    return `${x}: recovery ${v.rec}%${v.hrv != null ? `, HRV ${v.hrv}` : ''}${v.rhr != null ? `, RHR ${v.rhr}` : ''}${v.sleep != null ? `, sleep ${v.sleep}h` : ''}${v.strain != null ? `, strain ${v.strain}` : ''}`;
  }).join('\n') || 'none';
  const sl = ctx.sessions.slice(-10).map(s => {
    const byEx = new Map<string, LoggedSet[]>();
    s.sets.forEach(x => { if (!byEx.has(x.ex)) byEx.set(x.ex, []); byEx.get(x.ex)!.push(x); });
    return `${s.date} ${s.day} [${ctx.sessionZone(s) || 'no check-in'}]: ` + [...byEx.entries()].map(([n, g]) => `${n} ${setLine(g)}`).join('; ');
  }).join('\n') || 'none';
  const coast = c.enough ? `score ${c.score}/100 (${c.level}); ${evidence(c).join(' ')}` : `not enough sessions yet (${c.n} in 3 weeks)`;
  return [
    "You are Pace, the strength coach inside a lifter's training app. The goal is getting as strong as possible.",
    'Rules:',
    `- ${coach}, the lifter's coach, writes the program. Never change her exercises, sets or order. Adjust only weight, reps inside her ranges, and effort.`,
    '- WHOOP recovery zones: green 67-100 means progress, yellow 34-66 means match last time, red 0-33 means back off.',
    '- RIR means reps in reserve. Sets ending at 3+ RIR are too easy to build strength. On green days the last set of machine, cable, dumbbell and bodyweight moves should reach failure. Heavy barbell lifts stop at 1 RIR unless there is a spotter.',
    '- Use exercises and pounds from the data. Never invent numbers. If data is missing, say what to log.',
    `- Voice: ${tone}`,
    '- Under 170 words. Plain text in short lines; use "- " for lists. No headings or bold.',
    '',
    'DATA',
    `Today ${t}: ${r.zone === 'unknown' ? 'no check-in yet' : `recovery ${r.rec}% (${r.zone})${r.hrv != null ? `, HRV ${r.hrv}` : ''}${r.sleep != null ? `, sleep ${r.sleep}h` : ''}`}${r.notes.length ? '. ' + r.notes.join(' ') : ''}`,
    `Today's workout: ${day ? day.name : 'none'}`, plan,
    `Coasting check: ${coast}`,
    'WHOOP, last 21 days:', wl,
    'Sessions, oldest first (weight x reps @RIR):', sl,
    previous ? `\nPrevious question: ${previous.q}\nYour previous answer: ${previous.a.slice(0, 1500)}` : '',
    '',
    'QUESTION', question,
  ].join('\n');
}
