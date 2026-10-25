import { freshData, STARTER_PROGRAM } from './seed';
import { TYPES } from './parse';
import type { AppData, ExerciseType, Program } from './types';
import { uid } from './util';

/** Accepts anything read from storage (including older web-app exports) and returns valid AppData. */
export function normalizeProgram(p: unknown): Program {
  if (!p || typeof p !== 'object') return STARTER_PROGRAM();
  const src = p as Record<string, unknown>;
  const rawBlocks = Array.isArray(src.blocks) ? src.blocks : Array.isArray(src.days) ? [{ id: 'b1', name: 'Program', start: null, days: src.days }] : [];
  const blocks = (rawBlocks as Record<string, unknown>[]).filter(b => b && Array.isArray(b.days)).map(b => ({
    id: String(b.id || uid()),
    name: String(b.name || 'Block'),
    start: typeof b.start === 'string' ? b.start : null,
    days: (b.days as Record<string, unknown>[]).map(d => ({
      id: String(d.id || uid()),
      name: String(d.name || 'Workout'),
      dow: Number.isInteger(d.dow) ? (d.dow as number) : null,
      exercises: (Array.isArray(d.exercises) ? (d.exercises as Record<string, unknown>[]) : []).filter(e => e && e.name).map(e => ({
        id: String(e.id || uid()),
        name: String(e.name),
        sets: Number(e.sets) || 3,
        repLow: e.repLow != null ? Number(e.repLow) : 8,
        repHigh: e.repHigh != null ? Number(e.repHigh) : 12,
        type: (TYPES.includes(e.type as ExerciseType) ? e.type : 'machine') as ExerciseType,
        note: String(e.note || ''),
        rxSet: e.rxSet !== false,
      })),
    })),
  }));
  if (!blocks.length) return STARTER_PROGRAM();
  return { source: src.source === 'starter' ? 'starter' : 'coach', updated: typeof src.updated === 'string' ? src.updated : null, blocks };
}

function normalizeCoach(raw: unknown): AppData['coach'] {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = <T>(v: unknown, ok: (x: T) => boolean): T[] => (Array.isArray(v) ? (v as T[]).filter(x => x && typeof x === 'object' && ok(x)) : []);
  return {
    msgs: list<AppData['coach']['msgs'][number]>(c.msgs, m => typeof m.text === 'string' && (m.role === 'me' || m.role === 'coach')).slice(-200),
    notes: list<AppData['coach']['notes'][number]>(c.notes, n => typeof n.text === 'string'),
    nudges: list<AppData['coach']['nudges'][number]>(c.nudges, n => typeof n.ex === 'string' && ['up', 'down', 'hold'].includes(n.change)),
  };
}

export function normalizeData(raw: unknown): AppData {
  const base = freshData();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Record<string, unknown>;
  const settings = { ...base.settings, ...(s.settings as object | undefined) };
  settings.reminder = { ...base.settings.reminder, ...((s.settings as { reminder?: object } | undefined)?.reminder ?? {}) };
  return {
    version: 3,
    settings,
    program: s.program ? normalizeProgram(s.program) : base.program,
    videos: s.videos && typeof s.videos === 'object' ? (s.videos as AppData['videos']) : {},
    whoop: s.whoop && typeof s.whoop === 'object' ? (s.whoop as AppData['whoop']) : {},
    whoopWorkouts: s.whoopWorkouts && typeof s.whoopWorkouts === 'object' ? (s.whoopWorkouts as AppData['whoopWorkouts']) : {},
    whoopSync: typeof s.whoopSync === 'string' ? s.whoopSync : null,
    sessions: Array.isArray(s.sessions) ? (s.sessions as AppData['sessions']).filter(x => x && x.date && Array.isArray(x.sets)) : base.sessions,
    coach: normalizeCoach(s.coach),
  };
}
