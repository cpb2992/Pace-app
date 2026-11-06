/**
 * Minimal-equipment days: when the gym isn't happening, turn today's workout into
 * one that needs only a pair of dumbbells and your bodyweight. Same sets, reps and
 * order as the coach's day, so the plan still matches hers. Pure, no UI.
 */
import type { Exercise, ExerciseType, WorkoutDay } from './types';

export const MINIMAL_TAG = 'Minimal';
export const MINIMAL_KIT = 'A pair of dumbbells and your bodyweight';

interface Swap { name: string; type: ExerciseType; cue: string }
const sw = (name: string, type: ExerciseType, cue: string): Swap => ({ name, type, cue });

/** First match wins, so specific moves come before general ones. */
const RULES: [RegExp, Swap][] = [
  [/close[- ]?grip.*(bench|press)/, sw('Close-Grip Push-up', 'bodyweight', 'Hands under shoulders, elbows tight. Elevate hands to make it easier.')],
  [/straight[- ]?arm|pullover|lat sweep/, sw('DB Pullover', 'dumbbell', 'Lie on the floor, arms long, pull the bell over your chest.')],
  [/pull[- ]?down|pull[- ]?up|chin[- ]?up|\brow\b|rows\b/, sw('One-Arm DB Row', 'dumbbell', 'Brace a hand on a chair or couch, pull the elbow to your hip.')],
  [/\bfly\b|flye/, sw('DB Floor Fly', 'dumbbell', 'On the floor, slight bend in the elbows, stop when they touch down.')],
  [/(bench|chest).*press|\bbench\b/, sw('DB Floor Press', 'dumbbell', 'Elbows at 45 degrees, pause when they touch the floor.')],
  [/(shoulder|overhead|military).*press|\bohp\b/, sw('Standing DB Shoulder Press', 'dumbbell', 'Ribs down, squeeze glutes.')],
  [/front raise/, sw('DB Front Raise', 'dumbbell', 'Neutral grip, stop at shoulder height.')],
  [/lateral raise|side raise/, sw('DB Lateral Raise', 'dumbbell', 'Lead with the elbows.')],
  [/curl/, sw('DB Curl', 'dumbbell', 'No swinging. Slow on the way down.')],
  [/tricep|pushdown|push[- ]?down|skull|extension(?!.*(leg|back|hip))/, sw('DB Overhead Tricep Extension', 'dumbbell', 'One bell, both hands, elbows pointing forward.')],
  [/deadlift|\brdl\b/, sw('DB Romanian Deadlift', 'dumbbell', 'Soft knees, push hips back, bells slide down the thighs.')],
  [/hip thrust|hip drive|glute bridge/, sw('Single Leg DB Hip Thrust', 'dumbbell', 'Shoulders on the couch, bell on the working hip.')],
  [/abduct|clamshell|side[- ]?lying/, sw('Side-Lying Leg Raise', 'bodyweight', 'Toes forward, slow lower. Hold a bell on the hip to load it.')],
  [/adduct/, sw('Copenhagen Plank', 'bodyweight', 'Top leg on the couch, short holds count as reps.')],
  [/calf/, sw('Single Leg DB Calf Raise', 'dumbbell', 'On a stair, full stretch at the bottom.')],
  [/lunge|split squat/, sw('DB Reverse Lunge', 'dumbbell', 'Step back long, front knee over the toes.')],
  [/leg press|squat|hack|leg extension/, sw('DB Goblet Squat', 'dumbbell', 'Bell at the chest, sit between the heels.')],
  [/leg curl|hamstring curl/, sw('Single Leg DB Romanian Deadlift', 'dumbbell', 'Hips square, slow on the way down.')],
  [/crunch|ab |abs|core|cable crunch|wood ?chop/, sw('Dead Bug', 'bodyweight', 'Low back stays on the floor.')],
];

/** Moves that already work at home keep their name, so their history and targets carry over. */
const worksAtHome = (ex: Exercise) => {
  const n = ex.name.toLowerCase();
  if (/machine|cable|smith|plate|barbell|\bbar\b|band|\bsled\b/.test(n)) return false;
  return ex.type === 'dumbbell' || ex.type === 'bodyweight' || ex.type === 'circuit';
};

export function minimalExercise(ex: Exercise): Exercise {
  if (ex.type === 'cardio')
    return { ...ex, note: [ex.note, 'Brisk walk, stairs, jump rope or a bodyweight circuit'].filter(Boolean).join(' · ') };
  if (worksAtHome(ex)) return ex;
  const n = ex.name.toLowerCase();
  const hit = RULES.find(([re]) => re.test(n))?.[1];
  const swap = hit ?? (ex.type === 'barbell' || /press|push/.test(n)
    ? sw('Push-up', 'bodyweight', 'Elevate hands to make it easier.')
    : sw('DB Goblet Squat', 'dumbbell', 'Bell at the chest, sit between the heels.'));
  return {
    ...ex,
    id: `${ex.id}~min`,
    name: swap.name,
    type: swap.type,
    note: `For ${ex.name}. ${swap.cue}`,
  };
}

/** Second choices, so two swaps in one day never log under the same name. */
const ALT: Record<string, [string, ExerciseType]> = {
  'One-Arm DB Row': ['DB Bent-Over Row', 'dumbbell'],
  'DB Floor Press': ['Push-up', 'bodyweight'],
  'DB Goblet Squat': ['DB Bulgarian Split Squat', 'dumbbell'],
  'DB Curl': ['DB Hammer Curl', 'dumbbell'],
  'Single Leg DB Hip Thrust': ['DB Glute Bridge', 'dumbbell'],
  'DB Romanian Deadlift': ['Single Leg DB Romanian Deadlift', 'dumbbell'],
  'DB Overhead Tricep Extension': ['Chair Dip', 'bodyweight'],
  'Side-Lying Leg Raise': ['Fire Hydrant', 'bodyweight'],
};

export function minimalDay(day: WorkoutDay): WorkoutDay {
  const used = new Set<string>();
  const exercises = day.exercises.map(ex => {
    let out = minimalExercise(ex);
    if (out !== ex && used.has(out.name.toLowerCase())) {
      const alt = ALT[out.name];
      out = alt && !used.has(alt[0].toLowerCase()) ? { ...out, name: alt[0], type: alt[1] } : { ...out, name: `${out.name} (2)` };
    }
    used.add(out.name.toLowerCase());
    return out;
  });
  return { ...day, id: `${day.id}~min`, name: `${day.name} · ${MINIMAL_TAG}`, exercises };
}

/** How many exercises were swapped, for the "3 swaps" label. */
export const swapCount = (day: WorkoutDay) => day.exercises.filter(e => e.id.endsWith('~min')).length;

/** "Upper · Minimal" → "Upper": a minimal day still counts for the rotation. */
export const baseDayName = (name: string) => name.replace(new RegExp(`\\s*·\\s*${MINIMAL_TAG}$`, 'i'), '');

/** Every program day plus its minimal version, for looking up logged exercises by name. */
export const withMinimal = (days: WorkoutDay[]) => days.flatMap(d => [d, minimalDay(d)]);
