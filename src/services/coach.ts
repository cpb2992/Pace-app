/** One turn of the coach chat: builds the conversation, calls Claude, checks what came back. */
import type { Bounty, GameSummary } from '../engine/game';
import { checkCoachReply, coachSystem, COACH_SCHEMA, type CoachReply } from '../engine/prompt';
import type { Ctx } from '../engine/training';
import type { CoachMsg } from '../engine/types';
import { callClaude, COACH_MODEL, type ClaudeTurn } from './claude';

const HISTORY = 16;

/** Earlier messages as alternating turns, starting with the lifter, ending with the new message. */
export function toTurns(history: CoachMsg[], message: string): ClaudeTurn[] {
  const turns: ClaudeTurn[] = [];
  for (const m of history.slice(-HISTORY)) {
    const role = m.role === 'me' ? 'user' : 'assistant';
    if (!turns.length && role === 'assistant') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.text}`;
    else turns.push({ role, content: m.text });
  }
  const last = turns[turns.length - 1];
  if (last && last.role === 'user') last.content += `\n\n${message}`;
  else turns.push({ role: 'user', content: message });
  return turns;
}

export async function askCoach(o: { key: string; ctx: Ctx; dayIdx: number; game: GameSummary | null; bounties: Bounty[]; history: CoachMsg[]; message: string }): Promise<CoachReply> {
  const text = await callClaude({
    key: o.key,
    model: COACH_MODEL,
    system: coachSystem(o.ctx, o.dayIdx, o.game, o.bounties),
    messages: toTurns(o.history, o.message),
    schema: COACH_SCHEMA,
    maxTokens: 1500,
  });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { raw = { reply: text, remember: [], forget: [], nudges: [] }; }
  return checkCoachReply(raw, o.ctx);
}
