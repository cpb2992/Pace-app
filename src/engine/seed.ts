import { addDays } from './dates';
import { zoneOf, isFree } from './training';
import type { AppData, Exercise, ExerciseType, Program, Session, WhoopDay } from './types';
import { uid } from './util';

const ex = (id: string, name: string, type: ExerciseType, opts: Partial<Exercise> = {}): Exercise => ({
  id, name, type, sets: 3, repLow: 10, repHigh: 12, note: '', rxSet: false, ...opts,
});
const cardio = (id: string): Exercise => ex(id, 'Cardio', 'cardio', { sets: 1, repLow: 0, repHigh: 0, note: '15–20 min', rxSet: true });

/** Sarah's program as of October 2026, read from the coach app. Sets/reps marked rxSet:false are placeholders. */
export const SARAH_PROGRAM: Program = {
  source: 'coach',
  updated: '2026-10-21',
  blocks: [
    {
      id: 'oct', name: 'October', start: null, days: [
        { id: 'oct-upper', name: 'Upper', dow: 4, exercises: [
          ex('ou1', 'Close Grip Bench Press', 'barbell', { rxSet: true }),
          ex('ou2', 'Wide Lat Pull Down', 'machine', { rxSet: true }),
          ex('ou3', 'Seated Neutral Grip DB Press', 'dumbbell'),
          ex('ou4', 'Hand Supported Single Arm Row', 'dumbbell'),
          ex('ou5', 'Bent Arm Lateral Raise', 'dumbbell'),
        ] },
        { id: 'oct-lower', name: 'Lower', dow: 5, exercises: [
          ex('ol1', 'Alternating Deficit Reverse Lunge', 'dumbbell'),
          ex('ol2', 'Romanian Deadlift', 'barbell'),
          ex('ol3', 'Leg Press', 'machine'),
          ex('ol4', 'Single Leg DB Hip Thrust', 'dumbbell'),
          ex('ol5', 'Forward Lean Seated Abductions', 'machine'),
        ] },
        { id: 'oct-combo', name: 'Combo', dow: 6, exercises: [
          ex('oc1', 'Straight Arm Lat Sweep', 'machine'),
          ex('oc2', 'High to Low Cable Fly', 'machine'),
          ex('oc3', 'Arms Circuit', 'circuit', { sets: 1, repLow: 0, repHigh: 0, rxSet: true }),
          ex('oc4', 'Plate Loaded Hip Drive Machine', 'machine'),
          ex('oc5', 'Sumo Squat', 'dumbbell'),
        ] },
      ],
    },
    {
      id: 'novdec', name: 'Nov/Dec', start: '2026-11-05', days: [
        { id: 'nd-upper', name: 'Nov/Dec Upper', dow: 4, exercises: [
          ex('nu1', 'Dumbbell Bench Press', 'dumbbell', { note: 'Elbows at 45 degrees' }),
          ex('nu2', 'Standing Wide DB Shoulder Press', 'dumbbell'),
          ex('nu3', 'Reverse Grip Lat Pulldown', 'machine'),
          ex('nu4', 'Straight Bar Cable Bicep Curl', 'machine'),
          ex('nu5', 'Straight Bar Cable Tricep Pushdown', 'machine'),
          cardio('nu6'),
        ] },
        { id: 'nd-c1', name: 'Nov/Dec Combo #1', dow: 5, exercises: [
          ex('n1a', 'Banded Barbell Back Squat', 'barbell', { note: 'Band above knees' }),
          ex('n1b', 'Plate Weighted Clamshell w/ Lift', 'bodyweight'),
          ex('n1c', 'Dumbbell Fly', 'dumbbell'),
          ex('n1d', 'Neutral Grip Front Raise', 'dumbbell'),
          cardio('n1e'),
        ] },
        { id: 'nd-c2', name: 'Nov/Dec Combo #2', dow: 6, exercises: [
          ex('n2a', 'Single Leg DB Hip Thrust', 'dumbbell'),
          ex('n2b', 'Weighted Standing Calf Raise Machine', 'machine'),
          ex('n2c', 'Seated Cable Wide Row', 'machine'),
          ex('n2d', 'Seated Hip Adduction', 'machine'),
          cardio('n2e'),
        ] },
      ],
    },
  ],
};

const cg = (reps: number[]) => reps.map(r => ({ ex: 'Close Grip Bench Press', w: 35, r, rir: null }));
export const SARAH_HISTORY: Session[] = [
  { id: 'coach-2026-10-15', date: '2026-10-15', day: 'Upper', zone: null, rec: null, src: 'coach', sets: cg([8, 7, 5]) },
  { id: 'coach-2026-10-22', date: '2026-10-22', day: 'Upper', zone: null, rec: null, src: 'coach', sets: cg([9, 7, 5]) },
];

export const STARTER_PROGRAM = (): Program => {
  const m = (name: string, sets: number, lo: number, hi: number, type: ExerciseType, note = ''): Exercise => ({ id: uid(), name, sets, repLow: lo, repHigh: hi, type, note, rxSet: true });
  return { source: 'starter', updated: null, blocks: [{ id: 'starter', name: 'Starter', start: null, days: [
    { id: uid(), name: 'Push', dow: null, exercises: [m('Barbell Bench Press', 4, 6, 8, 'barbell'), m('Seated DB Shoulder Press', 3, 8, 10, 'dumbbell'), m('Leg Press', 3, 10, 12, 'machine'), m('Cable Triceps Pushdown', 3, 10, 15, 'machine'), m('Incline Walk', 1, 0, 0, 'cardio', '15 min')] },
    { id: uid(), name: 'Pull', dow: null, exercises: [m('Romanian Deadlift', 4, 6, 8, 'barbell'), m('Lat Pulldown', 3, 8, 12, 'machine'), m('Chest-Supported DB Row', 3, 8, 12, 'dumbbell'), m('DB Hammer Curl', 3, 10, 12, 'dumbbell'), m('Bike Intervals', 1, 0, 0, 'cardio', '10 min')] },
    { id: uid(), name: 'Combo', dow: null, exercises: [m('Back Squat', 4, 5, 8, 'barbell'), m('Weighted Pull-up', 3, 5, 8, 'bodyweight'), m('Incline DB Press', 3, 8, 10, 'dumbbell'), m('Walking Lunge', 3, 10, 12, 'dumbbell'), m('Rower', 1, 0, 0, 'cardio', '10 min')] },
  ] }] };
};

export const freshData = (): AppData => ({
  version: 3,
  settings: { tone: 'nofilter', appearance: 'dark', bar: 45, coach: 'Sarah', reminder: { on: false, hour: 7, minute: 0 }, speak: false, game: true, share: { name: '', recovery: true, notes: false } },
  program: JSON.parse(JSON.stringify(SARAH_PROGRAM)),
  videos: {},
  whoop: {},
  whoopWorkouts: {},
  whoopSync: null,
  sessions: JSON.parse(JSON.stringify(SARAH_HISTORY)),
  coach: { msgs: [], notes: [], nudges: [] },
});

/** Six weeks of sample data that shows a lifter coasting on bench while RDL climbs. Never saved. */
export function makeDemo(today: string, settings: AppData['settings']): AppData {
  const whoop: Record<string, WhoopDay> = {};
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 42; i >= 0; i--) {
    const d = addDays(today, -i), rec = Math.round(40 + rnd() * 55);
    whoop[d] = { rec, hrv: Math.round(44 + (rec - 60) * 0.35 + rnd() * 8), rhr: Math.round(57 - (rec - 60) * 0.06 + rnd() * 3), sleep: Math.round((6.3 + rnd() * 1.9) * 10) / 10, strain: Math.round((8 + rnd() * 8) * 10) / 10, src: 'demo' };
  }
  whoop[today] = { rec: 81, hrv: 58, rhr: 54, sleep: 7.6, strain: 4.2, src: 'demo' };
  const program = STARTER_PROGRAM();
  const days = program.blocks[0].days;
  const base: Record<string, number> = { 'Barbell Bench Press': 155, 'Seated DB Shoulder Press': 40, 'Leg Press': 270, 'Cable Triceps Pushdown': 50, 'Romanian Deadlift': 175, 'Lat Pulldown': 120, 'Chest-Supported DB Row': 45, 'DB Hammer Curl': 30, 'Back Squat': 205, 'Weighted Pull-up': 0, 'Incline DB Press': 55, 'Walking Lunge': 30 };
  const sessions: Session[] = [];
  let di = 0;
  for (let i = 38; i >= 1; i -= i % 3 === 0 ? 3 : 2) {
    const d = addDays(today, -i), day = days[di % 3];
    di++;
    const sets: Session['sets'] = [];
    for (const e of day.exercises) {
      if (isFree(e.type)) continue;
      const w = base[e.name];
      let r = e.repHigh - 1, rir = 3;
      if (e.name === 'Romanian Deadlift') { base[e.name] += 5; r = 8; rir = 1; }
      if (e.name === 'Weighted Pull-up') { r = 6; rir = 2; }
      for (let k = 0; k < e.sets; k++) sets.push({ ex: e.name, w, r, rir: k === e.sets - 1 ? Math.max(0, rir - 1) : rir });
    }
    sessions.push({ id: 'demo' + i, date: d, day: day.name, zone: zoneOf(whoop[d].rec), rec: whoop[d].rec, src: 'demo', sets });
  }
  return { version: 3, settings: { ...settings }, program, videos: {}, whoop, whoopWorkouts: {}, whoopSync: null, sessions, coach: { msgs: [], notes: [], nudges: [] } };
}
