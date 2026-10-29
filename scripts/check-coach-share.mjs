// Live check of the coach view backend (pace-share Edge Function) and page.
// Runs in GitHub Actions: node scripts/check-coach-share.mjs
// Creates a throwaway phone, uploads a report, opens it like the coach page does, then deletes everything.
import assert from 'node:assert/strict';

const API = process.env.PACE_SHARE_URL || 'https://iyneflhujuemucfgsgwb.supabase.co/functions/v1/pace-share';
const PAGE = process.env.PACE_COACH_PAGE || 'https://cpb2992.github.io/Pace-app/coach/';

async function call(action, extra = {}, secret) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://cpb2992.github.io', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cors: res.headers.get('access-control-allow-origin') };
}

const report = {
  v: 1, name: 'Check', coach: 'Coach', tone: 'clean', at: new Date().toISOString(), today: '2026-10-29',
  readiness: { zone: 'green', rec: 80, notes: [] },
  coast: { level: 'early', score: null, line: 'Log 3 sessions to unlock the coasting check.', fix: null, evidence: [] },
  week: null, next: null, sessions: [], recovery: [{ date: '2026-10-29', rec: 80 }], effort: [], lifts: [], program: null, notes: [],
};

const step = (name, ok) => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);

const pre = await fetch(API, { method: 'OPTIONS', headers: { Origin: 'https://cpb2992.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
step(`preflight ${pre.status}, allow-origin ${pre.headers.get('access-control-allow-origin')}`, pre.ok);
assert.ok(pre.ok);

const reg = await call('register');
step(`register ${reg.status}`, reg.status === 200 && !!reg.body.secret);
assert.equal(reg.status, 200, JSON.stringify(reg.body));
const secret = reg.body.secret;

try {
  const push = await call('push', { report }, secret);
  step(`push ${push.status}`, push.status === 200);
  assert.equal(push.status, 200, JSON.stringify(push.body));

  const noAuth = await call('push', { report });
  step(`push without the phone's secret is refused (${noAuth.status})`, noAuth.status === 401);
  assert.equal(noAuth.status, 401);

  const bad = await call('push', { report: { v: 9 } }, secret);
  step(`bad report is refused (${bad.status})`, bad.status === 400);
  assert.equal(bad.status, 400);

  const link = await call('link', {}, secret);
  step(`link ${link.status}`, link.status === 200 && !!link.body.token);
  assert.equal(link.status, 200);
  const token = link.body.token;

  const view = await call('view', { token });
  step(`coach view ${view.status}, cors ${view.cors}, name ${view.body.report?.name}`, view.status === 200 && view.body.report?.name === 'Check');
  assert.equal(view.status, 200);
  assert.equal(view.cors, '*');
  assert.equal(view.body.report.readiness.rec, 80);

  const wrong = await call('view', { token: token.slice(0, -2) + 'xx' });
  step(`wrong token is refused (${wrong.status})`, wrong.status === 404);
  assert.equal(wrong.status, 404);

  const status = await call('status', {}, secret);
  step(`status shows the coach opened it (${status.body.viewed ? 'yes' : 'no'})`, !!status.body.viewed);
  assert.ok(status.body.viewed);

  const rotated = await call('link', {}, secret);
  const old = await call('view', { token });
  step(`a new link turns the old one off (${old.status})`, old.status === 404);
  assert.equal(old.status, 404);
  const fresh = await call('view', { token: rotated.body.token });
  assert.equal(fresh.status, 200);

  const unlink = await call('unlink', {}, secret);
  const afterUnlink = await call('view', { token: rotated.body.token });
  step(`unlink turns the link off (${unlink.status}, then ${afterUnlink.status})`, afterUnlink.status === 404);
  assert.equal(afterUnlink.status, 404);
} finally {
  const del = await call('delete', {}, secret);
  step(`delete ${del.status}`, del.status === 200);
  const gone = await call('push', { report }, secret);
  step(`deleted phone is refused (${gone.status})`, gone.status === 401);
  assert.equal(gone.status, 401);
}

// The page itself (GitHub Pages can take a minute after the first publish, so this only warns).
const page = await fetch(PAGE).catch(e => ({ ok: false, status: String(e) }));
const html = page.ok ? await page.text() : '';
step(`coach page ${page.status}${page.ok ? (html.includes('Pace Coach View') ? '' : ' (unexpected content)') : ' (not live yet)'}`, page.ok);
console.log('All backend checks passed.');
