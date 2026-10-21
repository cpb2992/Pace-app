import { addDays, isoDate, parseDT } from './dates';
import { isFree } from './training';
import type { ExerciseType, Session, Video, WhoopDay } from './types';
import { num } from './util';

export const TYPES: ExerciseType[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cardio', 'circuit'];
export const TYPE_LABEL: Record<ExerciseType, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine or cable', bodyweight: 'Bodyweight', cardio: 'Cardio', circuit: 'Circuit',
};

export function parseCSV(input: string): string[][] {
  const text = String(input).replace(/^﻿/, '');
  const nl = text.indexOf('\n');
  const first = nl > 0 ? text.slice(0, nl) : text;
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

const headerIndex = (hdr: string[]) => {
  const H = hdr.map(h => String(h).toLowerCase().trim());
  return (...words: string[]) => H.findIndex(h => words.every(w => h.includes(w)));
};

/** Reads WHOOP's physiological_cycles.csv. Recovery is dated by the morning you woke up. */
export function parseWhoopCycles(csv: string): Record<string, WhoopDay> {
  const rows = parseCSV(csv);
  const out: Record<string, WhoopDay> = {};
  if (rows.length < 2) return out;
  const ix = headerIndex(rows[0]);
  const iRec = ix('recovery score');
  if (iRec < 0) return out;
  const iHrv = ix('heart rate variability'), iRhr = ix('resting heart rate'), iStrain = ix('day strain'), iPerf = ix('sleep performance');
  const iAsleep = ix('asleep duration'), iDebt = ix('sleep debt'), iWake = ix('wake onset'), iStart = ix('cycle start');
  for (const r of rows.slice(1)) {
    const rec = num(r[iRec]);
    if (rec == null) continue;
    let date: string | null = null;
    const w = iWake >= 0 ? parseDT(r[iWake]) : null;
    if (w) date = isoDate(w);
    else {
      const s = iStart >= 0 ? parseDT(r[iStart]) : null;
      if (s) { date = isoDate(s); if (s.getHours() >= 12) date = addDays(date, 1); }
    }
    if (!date) continue;
    const g = (i: number) => (i >= 0 ? num(r[i]) : null);
    const asleep = g(iAsleep);
    out[date] = { rec: Math.round(rec), hrv: g(iHrv), rhr: g(iRhr), strain: g(iStrain), perf: g(iPerf), sleep: asleep != null ? Math.round(asleep / 6) / 10 : null, debt: g(iDebt), src: 'export' };
  }
  return out;
}

/** Reads a generic workout-history CSV (Strong, Hevy, coach-app exports): date, exercise, weight, reps, optional RPE/RIR. */
export function parseHistoryCSV(csv: string): Session[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('That file has no rows.');
  const ix = headerIndex(rows[0]);
  const H = rows[0].map(h => String(h).toLowerCase());
  let iDate = ix('date');
  if (iDate < 0) iDate = ix('start');
  const iEx = ix('exercise');
  const iW = H.findIndex(h => h.includes('weight') && !h.includes('body'));
  const iR = ix('reps'), iRir = ix('rir'), iRpe = ix('rpe');
  let iName = ix('workout name');
  if (iName < 0) iName = ix('routine');
  if (iDate < 0 || iEx < 0 || iR < 0) throw new Error('The file needs Date, Exercise and Reps columns.');
  const kg = iW >= 0 && /\bkgs?\b/.test(H[iW]);
  const byDate: Record<string, Session> = {};
  for (const r of rows.slice(1)) {
    const dt = parseDT(r[iDate]);
    const ex = String(r[iEx] || '').trim();
    const reps = num(r[iR]);
    if (!dt || !ex || !reps) continue;
    let w = iW >= 0 ? num(r[iW]) || 0 : 0;
    if (kg) w = Math.round(w * 2.20462 * 2) / 2;
    let rir = iRir >= 0 ? num(r[iRir]) : null;
    if (rir == null && iRpe >= 0) { const rpe = num(r[iRpe]); if (rpe != null && rpe > 0) rir = Math.max(0, Math.round(10 - rpe)); }
    const iso = isoDate(dt);
    const s = byDate[iso] || (byDate[iso] = { id: 'imp-' + iso, date: iso, day: iName >= 0 && r[iName] ? String(r[iName]).trim() : 'Imported', zone: null, rec: null, src: 'import', sets: [] });
    s.sets.push({ ex, w, r: Math.round(reps), rir: rir != null ? Math.min(5, Math.max(0, Math.round(rir))) : null });
  }
  const list = Object.values(byDate);
  if (!list.length) throw new Error('No rows had a date, exercise and reps.');
  return list;
}

export function guessType(name: string): ExerciseType {
  const n = name.toLowerCase();
  if (/circuit/.test(n)) return 'circuit';
  if (/(lunge|carry|split squat|step-?up)/.test(n)) return /(barbell|\bbb\b)/.test(n) ? 'barbell' : 'dumbbell';
  if (/(^cardio|\bwalk\b|incline walk|bike|cycl|\brun\b|jog|treadmill|rower|row erg|rowing machine|elliptical|stair|zone ?2|sprint|swim|jump rope|assault|airdyne|ski erg)/.test(n)) return 'cardio';
  if (/(dumbbell|\bdbs?\b|kettlebell|\bkb\b)/.test(n)) return 'dumbbell';
  if (/(cable|machine|pulldown|pull down|pushdown|leg press|leg extension|leg curl|pec deck|smith|hack squat|seated row|lat pull|chest press|abduction|adduction)/.test(n)) return 'machine';
  if (/(push-?up|pull-?up|chin-?up|\bdips?\b|plank|crunch|sit-?up|burpee|bodyweight|\bbw\b|hanging|leg raise|clamshell)/.test(n)) return 'bodyweight';
  if (/(barbell|\bbb\b|bench press|squat|deadlift|\brdl\b|overhead press|\bohp\b|hip thrust|good morning|clean|pendlay)/.test(n)) return 'barbell';
  return 'machine';
}

export interface ParsedExercise { name: string; sets: number; repLow: number; repHigh: number; type: ExerciseType; note: string }
export interface ParsedProgram { days: { name: string; exercises: ParsedExercise[] }[] }

/** Offline parser for workouts pasted from a coach app. */
export function parseProgramText(txt: string): ParsedProgram {
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const setRe = /(\d+)\s*(?:sets?\s*(?:of|x|×)?|[x×])\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i;
  const days: ParsedProgram['days'] = [];
  let cur: ParsedProgram['days'][number] | null = null;
  for (const raw of lines) {
    if (/^\d+\s+exercises?$/i.test(raw) || /^(instructions|results|single|superset)$/i.test(raw)) continue;
    let l = raw.replace(/^(?:[-*•]|\d+[.)]|[A-Z][:.)])\s+/, '').trim();
    const br = l.match(/\[(.*?)\]/);
    const note = br ? br[1].trim() : '';
    l = l.replace(/\[.*?\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const m = l.match(setRe);
    const header = !m && l.length < 40 && !/^[A-Z][:.)]\s/.test(raw) &&
      (/:$/.test(l) || /^(day\s*\d+|push|pull|legs?|combo|upper|lower|full\s*body|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|workout\b|week\b|session\b)/i.test(l));
    if (header) { cur = { name: l.replace(/:$/, '').trim(), exercises: [] }; days.push(cur); continue; }
    if (!cur) { cur = { name: 'Day 1', exercises: [] }; days.push(cur); }
    if (m) {
      const name = l.replace(m[0], ' ').replace(/@.*$/, '').replace(/\(.*?\)/g, '').replace(/\s*[-–:|,]+\s*$/, '').replace(/^\s*[-–:|,]+\s*/, '').replace(/\s{2,}/g, ' ').trim() || 'Exercise';
      cur.exercises.push({ name, sets: +m[1], repLow: +m[2], repHigh: +(m[3] || m[2]), type: guessType(name), note });
    } else {
      const type = guessType(l);
      const mins = (note || l).match(/\d+\s*(?:-\s*\d+\s*)?(?:min|minutes|mins)\b/i);
      cur.exercises.push({ name: l.replace(/\(.*?\)/g, '').trim(), sets: isFree(type) ? 1 : 3, repLow: isFree(type) ? 0 : 10, repHigh: isFree(type) ? 0 : 12, type, note: type === 'cardio' && mins ? mins[0] : note });
    }
  }
  return { days: days.filter(d => d.exercises.length) };
}

/** Cleans up a program from any source (AI or offline parser). Returns null when nothing usable is there. */
export function validateProgram(j: unknown): ParsedProgram | null {
  if (!j || typeof j !== 'object' || !Array.isArray((j as { days?: unknown }).days)) return null;
  const days = ((j as { days: unknown[] }).days).map((d, i) => {
    const dd = (d ?? {}) as { name?: unknown; exercises?: unknown };
    const list = Array.isArray(dd.exercises) ? dd.exercises : [];
    return {
      name: String(dd.name || `Day ${i + 1}`).slice(0, 40),
      exercises: list.filter(e => e && typeof e === 'object' && (e as { name?: unknown }).name).map(e => {
        const x = e as Record<string, unknown>;
        const type = TYPES.includes(x.type as ExerciseType) ? (x.type as ExerciseType) : guessType(String(x.name));
        const lo = Math.max(0, Math.round(num(x.repLow) || 0));
        const hi = Math.max(lo, Math.round(num(x.repHigh) || lo));
        return {
          name: String(x.name).slice(0, 80),
          sets: Math.max(1, Math.min(12, Math.round(num(x.sets) || (isFree(type) ? 1 : 3)))),
          repLow: isFree(type) ? 0 : lo || 10,
          repHigh: isFree(type) ? 0 : hi || lo || 12,
          type,
          note: x.note ? String(x.note).slice(0, 80) : '',
        };
      }),
    };
  }).filter(d => d.exercises.length);
  return days.length ? { days } : null;
}

export function parseYouTube(input: string): Extract<Video, { kind: 'yt' }> | null {
  const s = String(input || '').trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null, shorts = false;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h.endsWith('.youtube.com')) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/); if (m) { id = m[2]; shorts = m[1] === 'shorts'; } }
  }
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  let start = 0;
  if (t) { const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); if (m) start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); }
  return { kind: 'yt', id, start, shorts };
}
export const ytLink = (v: { id: string; start: number; shorts: boolean }) =>
  v.shorts ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ''}`;
export const ytSearch = (name: string) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`how to ${name} shorts`);

export const PROGRAM_PROMPT = `Convert this workout program into JSON. Reply with only a JSON object shaped like:
{"days":[{"name":"Upper","exercises":[{"name":"Close Grip Bench Press","sets":3,"repLow":10,"repHigh":12,"type":"barbell","note":""}]}]}
Rules: keep every exercise name, day name and order exactly as written, minus any leading "A:" style letters. Text in square brackets is a coaching cue: move it to note. type is one of barbell, dumbbell, machine, bodyweight, cardio, circuit (cables count as machine). A single rep count means repLow equals repHigh. When sets or reps aren't given, use 3 sets of 10-12. For timed or cardio items use sets 1, repLow 0, repHigh 0 and put the duration in note. Skip dates, "5 Exercises" counts and app labels.

PROGRAM:
`;
