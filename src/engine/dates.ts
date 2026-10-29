const pad = (n: number) => String(n).padStart(2, '0');

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const fromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
export const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5);
export const weekStart = (iso: string) => addDays(iso, -((fromISO(iso).getDay() + 6) % 7));
export const dowOf = (iso: string) => fromISO(iso).getDay();

/** "just now", "12 min ago", "3 hr ago", "yesterday", "4 days ago". */
export function ago(ts: string, now = Date.now()) {
  const m = Math.round((now - Date.parse(ts)) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
export const fmtShort = (iso: string) => { const d = fromISO(iso); return `${MON[d.getMonth()]} ${d.getDate()}`; };
export const fmtMid = (iso: string) => { const d = fromISO(iso); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
export const fmtLong = (iso: string) => { const d = fromISO(iso); return `${DOWL[d.getDay()]}, ${MONL[d.getMonth()]} ${d.getDate()}`; };

/** Parses ISO ("2026-10-20 22:14:00"), US ("10/20/2026 10:14") or anything Date understands. */
export function parseDT(s: unknown): Date | null {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return new Date(y, +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
