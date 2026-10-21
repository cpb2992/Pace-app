export type Zone = 'green' | 'yellow' | 'red';
export type ZoneOrUnknown = Zone | 'unknown';
export type ExerciseType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio' | 'circuit';
export type Tone = 'nofilter' | 'clean';

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  repLow: number;
  repHigh: number;
  type: ExerciseType;
  note: string;
  /** false when sets/reps are placeholders that still need to match the coach's program */
  rxSet: boolean;
}

export interface WorkoutDay {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday; null = any day */
  dow: number | null;
  exercises: Exercise[];
}

export interface Block {
  id: string;
  name: string;
  /** ISO date the block starts; null = always eligible (first block) */
  start: string | null;
  days: WorkoutDay[];
}

export interface Program {
  source: 'starter' | 'coach';
  updated: string | null;
  blocks: Block[];
}

export interface WhoopDay {
  rec: number;
  hrv: number | null;
  rhr: number | null;
  sleep: number | null;
  strain?: number | null;
  perf?: number | null;
  debt?: number | null;
  src: 'export' | 'manual' | 'demo' | 'api';
}

export interface LoggedSet {
  ex: string;
  w: number;
  r: number;
  rir: number | null;
}

export interface Session {
  id: string;
  date: string;
  day: string;
  zone: Zone | null;
  rec: number | null;
  src?: 'app' | 'coach' | 'import' | 'demo';
  sets: LoggedSet[];
}

export type Video =
  | { kind: 'yt'; id: string; start: number; shorts: boolean }
  | { kind: 'clip'; uri: string };

export type Appearance = 'system' | 'light' | 'dark';

export interface Settings {
  tone: Tone;
  appearance: Appearance;
  bar: number;
  coach: string;
  reminder: { on: boolean; hour: number; minute: number };
}

export interface AppData {
  version: 3;
  settings: Settings;
  program: Program;
  videos: Record<string, Video>;
  whoop: Record<string, WhoopDay>;
  sessions: Session[];
}
