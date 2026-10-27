export const uid = () => Math.random().toString(36).slice(2, 9);

export const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** Normalized exercise key, so "Close-Grip Bench Press" and "close grip bench press" match. */
export const key = (n: unknown) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const fmtW = (w: number) => String(Math.round(w * 10) / 10);

export const avg = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export const letter = (i: number) => String.fromCharCode(65 + (i % 26));
