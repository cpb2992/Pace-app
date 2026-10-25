import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '../engine/dates';
import { summarize, type GameSummary } from '../engine/game';
import { mergeWhoop } from '../engine/whoop';
import { syncWhoop as pullWhoop, whoopStatus, type WhoopStatus } from '../services/whoop';
import { normalizeData } from '../engine/normalize';
import { freshData, makeDemo } from '../engine/seed';
import { Ctx } from '../engine/training';
import { AppearanceContext } from '../ui/theme';
import type { AppData } from '../engine/types';
import { clone } from '../engine/util';

const DATA_KEY = 'pace.data.v3';
const DRAFT_KEY = 'pace.draft.v3';

export interface DraftRow { w: string; r: string; rir: number | null; /** Points staked, double or nothing, on hitting this set's target. */ bet?: number }
export interface Draft { sig: string; dayIdx: number; date: string; rows: DraftRow[][] }

interface Store {
  ready: boolean;
  today: string;
  demo: boolean;
  data: AppData;
  ctx: Ctx;
  /** Points, level, streak and every session's score. */
  game: GameSummary;
  /** Apply a change to the real (saved) data. Ignored in demo mode. */
  mutate: (fn: (d: AppData) => void) => void;
  startDemo: () => void;
  endDemo: () => void;
  dayIdx: number | null;
  setDayIdx: (i: number | null) => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  eraseAll: () => void;
  whoop: { status: WhoopStatus; busy: boolean; msg: string };
  /** Pull the latest from WHOOP. Quiet syncs don't post a message unless something fails. */
  syncWhoop: (quiet?: boolean) => Promise<void>;
  refreshWhoop: () => Promise<WhoopStatus>;
}

const AUTO_SYNC_MIN = 45;

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [real, setReal] = useState<AppData>(freshData);
  const [demoData, setDemoData] = useState<AppData | null>(null);
  const [today, setToday] = useState(todayISO());
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [whoop, setWhoop] = useState<Store['whoop']>({ status: 'no-app', busy: false, msg: '' });
  const syncing = useRef(false);
  const lastSync = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [raw, rawDraft] = await Promise.all([AsyncStorage.getItem(DATA_KEY), AsyncStorage.getItem(DRAFT_KEY)]);
        if (raw) setReal(normalizeData(JSON.parse(raw)));
        if (rawDraft) {
          const d = JSON.parse(rawDraft) as Draft;
          if (d && d.date === todayISO()) { setDraftState(d); setDayIdx(d.dayIdx); }
        }
      } catch {
        // Corrupt storage falls back to fresh data rather than blocking launch.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setToday(todayISO()); });
    return () => sub.remove();
  }, []);

  const persist = useCallback((next: AppData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { AsyncStorage.setItem(DATA_KEY, JSON.stringify(next)).catch(() => {}); }, 250);
  }, []);

  const mutate = useCallback((fn: (d: AppData) => void) => {
    if (demoData) return;
    setReal(prev => { const next = clone(prev); fn(next); persist(next); return next; });
  }, [demoData, persist]);

  useEffect(() => { lastSync.current = real.whoopSync; }, [real.whoopSync]);

  const refreshWhoop = useCallback(async () => {
    const status = await whoopStatus();
    setWhoop(w => (w.status === status ? w : { ...w, status }));
    return status;
  }, []);

  const syncWhoop = useCallback(async (quiet = false) => {
    if (syncing.current) return;
    syncing.current = true;
    setWhoop(w => ({ ...w, busy: true, msg: quiet ? w.msg : 'Syncing with WHOOP…' }));
    try {
      const got = await pullWhoop(30);
      const at = new Date().toISOString();
      // Real data only: syncing never writes into the demo.
      setReal(prev => {
        const next = clone(prev);
        next.whoop = mergeWhoop(next.whoop, got.days);
        next.whoopWorkouts = { ...next.whoopWorkouts, ...got.workouts };
        next.whoopSync = at;
        persist(next);
        return next;
      });
      const n = Object.keys(got.days).length;
      setWhoop(w => ({ ...w, status: 'connected', busy: false, msg: quiet ? w.msg : `Synced ${n} day${n === 1 ? '' : 's'} from WHOOP.` }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'WHOOP sync failed.';
      const status = await whoopStatus();
      setWhoop({ status, busy: false, msg });
    } finally {
      syncing.current = false;
    }
  }, [persist]);

  // Sync on launch and whenever Pace comes back to the front, at most every AUTO_SYNC_MIN minutes.
  useEffect(() => {
    if (!ready) return;
    const maybe = async () => {
      if ((await refreshWhoop()) !== 'connected') return;
      const last = lastSync.current ? Date.parse(lastSync.current) : 0;
      if (Date.now() - last > AUTO_SYNC_MIN * 60_000) syncWhoop(true);
    };
    maybe();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') maybe(); });
    return () => sub.remove();
  }, [ready, refreshWhoop, syncWhoop]);

  const setDraft = useCallback((d: Draft | null) => {
    setDraftState(d);
    if (demoData) return;
    if (d) AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d)).catch(() => {});
    else AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  }, [demoData]);

  const startDemo = useCallback(() => { setDemoData(makeDemo(todayISO(), real.settings)); setDayIdx(null); setDraftState(null); }, [real.settings]);
  const endDemo = useCallback(() => { setDemoData(null); setDayIdx(null); setDraftState(null); }, []);

  const eraseAll = useCallback(() => {
    const next = freshData();
    next.program = { source: 'starter', updated: null, blocks: [] };
    next.sessions = [];
    setReal(normalizeData(next));
    setDayIdx(null);
    setDraftState(null);
    AsyncStorage.multiRemove([DATA_KEY, DRAFT_KEY]).catch(() => {});
  }, []);

  const data = demoData ?? real;
  const ctx = useMemo(() => new Ctx(data, today), [data, today]);
  const game = useMemo(() => summarize(data, today), [data, today]);

  const value = useMemo<Store>(() => ({
    ready, today, demo: !!demoData, data, ctx, game, mutate, startDemo, endDemo, dayIdx, setDayIdx, draft, setDraft, eraseAll, whoop, syncWhoop, refreshWhoop,
  }), [ready, today, demoData, data, ctx, game, mutate, startDemo, endDemo, dayIdx, draft, setDraft, eraseAll, whoop, syncWhoop, refreshWhoop]);

  return (
    <StoreContext.Provider value={value}>
      <AppearanceContext.Provider value={real.settings.appearance}>{children}</AppearanceContext.Provider>
    </StoreContext.Provider>
  );
}

export function useApp(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useApp must be used inside AppStoreProvider');
  return s;
}

/** The workout index shown on Today and Train. */
export function useDayIdx() {
  const { ctx, dayIdx } = useApp();
  const n = ctx.days().length;
  const i = dayIdx == null ? ctx.pickDay().idx : dayIdx;
  return i < n ? i : 0;
}
