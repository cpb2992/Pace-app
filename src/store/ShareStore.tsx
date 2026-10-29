import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Share } from 'react-native';
import { buildReport, reportSignature, weekText, workoutText, type CoachReport } from '../engine/report';
import { currentLink, newLink, pushReport, ShareError, startSharing, stopSharing } from '../services/share';
import { useApp } from './AppStore';

interface ShareStore {
  ready: boolean;
  /** The coach link; null while the live view is off. */
  link: string | null;
  busy: boolean;
  msg: string;
  /** Last successful upload (ISO time). */
  uploaded: string | null;
  /** When the coach last opened the link (ISO time). */
  viewed: string | null;
  turnOn: () => Promise<void>;
  rotate: () => Promise<void>;
  turnOff: () => Promise<void>;
  sendLink: () => Promise<void>;
  sendWorkout: (sessionId: string) => Promise<void>;
  sendWeek: () => Promise<void>;
}

/** Wait this long after the last change before uploading, so a workout's sets go up together. */
const PUSH_DELAY_MS = 3000;
/** Upload at least this often while sharing, so the coach sees today's recovery even on rest days. */
const REFRESH_MS = 6 * 3_600_000;

const ShareContext = createContext<ShareStore | null>(null);

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function ShareProvider({ children }: { children: ReactNode }) {
  const { ctx, game, data, demo, ready: appReady } = useApp();
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [viewed, setViewed] = useState<string | null>(null);
  const [wake, setWake] = useState(0);
  const lastSig = useRef('');
  const lastAt = useRef(0);
  const coach = data.settings.coach || 'your coach';

  useEffect(() => { currentLink().then(l => { setLink(l); setReady(true); }).catch(() => setReady(true)); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setWake(n => n + 1); });
    return () => sub.remove();
  }, []);

  const opts = data.settings.share;
  const build = useCallback((): CoachReport => buildReport(ctx, opts, new Date(), { goal: game.weekGoal, done: game.weekDone, streak: game.streak }), [ctx, game, opts]);

  // Keep the coach's view current: upload when anything in the report changes (and every few hours).
  useEffect(() => {
    if (!ready || !appReady || !link || demo) return;
    const report = build();
    const sig = reportSignature(report);
    if (sig === lastSig.current && Date.now() - lastAt.current < REFRESH_MS) return;
    const id = setTimeout(async () => {
      try {
        const r = await pushReport(report);
        if (!r) { setLink(null); return; }
        lastSig.current = sig;
        lastAt.current = Date.now();
        setUploaded(r.at);
        setViewed(r.viewed);
        setMsg('');
      } catch (e) {
        if (e instanceof ShareError && e.status === 401) setLink(null);
        setMsg(errText(e, 'Upload failed. Pace will try again.'));
      }
    }, PUSH_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, appReady, link, demo, build, wake]);

  const run = useCallback(async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) { setMsg(errText(e, fallback)); } finally { setBusy(false); }
  }, []);

  const turnOn = useCallback(() => run(async () => {
    if (demo) return;
    const report = build();
    const l = await startSharing(report);
    lastSig.current = reportSignature(report);
    lastAt.current = Date.now();
    setUploaded(new Date().toISOString());
    setViewed(null);
    setLink(l);
  }, 'Could not turn on the live view.'), [run, demo, build]);

  const rotate = useCallback(() => run(async () => { setLink(await newLink()); setViewed(null); }, 'Could not make a new link.'), [run]);

  const turnOff = useCallback(() => run(async () => {
    await stopSharing();
    lastSig.current = '';
    setLink(null); setUploaded(null); setViewed(null);
  }, 'Could not turn off the live view. Try again with a connection.'), [run]);

  const share = useCallback(async (message: string) => {
    try { await Share.share({ message }, { dialogTitle: `Send to ${coach}` }); } catch { /* closed */ }
  }, [coach]);

  const sendLink = useCallback(async () => {
    if (link) await share(`Here's my training, live from Pace. It updates on its own: ${link}`);
  }, [link, share]);

  const sendWorkout = useCallback(async (sessionId: string) => {
    const text = workoutText(build(), sessionId, link);
    if (text) await share(text);
  }, [build, link, share]);

  const sendWeek = useCallback(async () => { await share(weekText(build(), link)); }, [build, link, share]);

  const value = useMemo<ShareStore>(() => ({ ready, link, busy, msg, uploaded, viewed, turnOn, rotate, turnOff, sendLink, sendWorkout, sendWeek }),
    [ready, link, busy, msg, uploaded, viewed, turnOn, rotate, turnOff, sendLink, sendWorkout, sendWeek]);

  return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>;
}

export function useShare(): ShareStore {
  const s = useContext(ShareContext);
  if (!s) throw new Error('useShare must be used inside ShareProvider');
  return s;
}
