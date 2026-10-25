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
  spo2?: number | null;
  temp?: number | null;
  src: 'export' | 'manual' | 'demo' | 'api';
}

/** A workout WHOOP recorded (any sport), pulled by live sync. */
export interface WhoopWorkout {
  id: string;
  date: string;
  sport: string;
  start: string;
  end: string;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kj: number | null;
}

export interface LoggedSet {
  ex: string;
  w: number;
  r: number;
  rir: number | null;
}

export type Feel = 'easy' | 'right' | 'hard' | 'hurt';
export type LootTier = 'common' | 'rare' | 'epic' | 'legendary';

/** Double or nothing: points staked on hitting a set's target. */
export interface Bet {
  ex: string;
  /** Which logged set of that exercise (0-based). */
  set: number;
  stake: number;
  w: number;
  reps: number;
  won: boolean;
}

export interface Session {
  id: string;
  date: string;
  day: string;
  zone: Zone | null;
  rec: number | null;
  src?: 'app' | 'coach' | 'import' | 'demo';
  sets: LoggedSet[];
  bets?: Bet[];
  loot?: { tier: LootTier; pts: number };
  feel?: Feel;
}

export interface CoachMsg {
  id: string;
  role: 'me' | 'coach';
  text: string;
  at: string;
  /** What the coach changed because of this message ("Leg Press +10 lb next time"). */
  changes?: string[];
}

/** Something the coach should always keep in mind ("Left shoulder gets cranky on presses"). */
export interface CoachNote { id: string; text: string; at: string }

/** A one-time change to an exercise's next target, from feedback. Used up by the next session of that exercise. */
export interface Nudge { ex: string; change: 'up' | 'down' | 'hold'; reason: string; at: string }

export interface CoachState { msgs: CoachMsg[]; notes: CoachNote[]; nudges: Nudge[] }

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
  /** Read the coach's replies out loud. */
  speak: boolean;
  /** Points, crits, bets and loot. */
  game: boolean;
}

export interface AppData {
  version: 3;
  settings: Settings;
  program: Program;
  videos: Record<string, Video>;
  whoop: Record<string, WhoopDay>;
  whoopWorkouts: Record<string, WhoopWorkout>;
  /** When WHOOP live sync last succeeded (ISO time). */
  whoopSync: string | null;
  sessions: Session[];
  coach: CoachState;
}
