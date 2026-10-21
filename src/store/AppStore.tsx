import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '../engine/dates';
import { normalizeData } from '../engine/normalize';
import { freshData, makeDemo } from '../engine/seed';
import { Ctx } from '../engine/training';
import { AppearanceContext } from '../ui/theme';
import type { AppData } from '../engine/types';
import { clone } from '../engine/util';

const DATA_KEY = 'pace.data.v3';
const DRAFT_KEY = 'pace.draft.v3';

export interface DraftRow { w: string; r: string; rir: number | null }
export interface Draft { sig: string; dayIdx: number; date: string; rows: DraftRow[][] }

interface Store {
  ready: boolean;
  today: string;
  demo: boolean;
  data: AppData;
  ctx: Ctx;
  /** Apply a change to the real (saved) data. Ignored in demo mode. */
  mutate: (fn: (d: AppData) => void) => void;
  startDemo: () => void;
  endDemo: () => void;
  dayIdx: number | null;
  setDayIdx: (i: number | null) => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  eraseAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [real, setReal] = useState<AppData>(freshData);
  const [demoData, setDemoData] = useState<AppData | null>(null);
  const [today, setToday] = useState(todayISO());
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const value = useMemo<Store>(() => ({
    ready, today, demo: !!demoData, data, ctx, mutate, startDemo, endDemo, dayIdx, setDayIdx, draft, setDraft, eraseAll,
  }), [ready, today, demoData, data, ctx, mutate, startDemo, endDemo, dayIdx, draft, setDraft, eraseAll]);

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
