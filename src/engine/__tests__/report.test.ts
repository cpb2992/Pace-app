import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportSignature, setText, weekText, workoutText } from '../report';
import { freshData, makeDemo } from '../seed';
import { Ctx } from '../training';

const opts = { name: 'Chris', recovery: true, notes: false };

test('the report carries sessions with the coach prescription, progress and effort', () => {
  const d = freshData();
  d.whoop['2026-10-22'] = { rec: 78, hrv: 62, rhr: 51, sleep: 7.4, src: 'api' };
  d.sessions[1].feel = 'easy';
  const r = buildReport(new Ctx(d, '2026-10-23'), opts, new Date('2026-10-23T12:00:00Z'));
  assert.equal(r.v, 1);
  assert.equal(r.name, 'Chris');
  assert.equal(r.coach, 'Sarah');
  assert.equal(r.sessions.length, 2);
  const last = r.sessions[0];
  assert.equal(last.date, '2026-10-22', 'newest first');
  assert.equal(last.feel, 'easy');
  assert.equal(last.rec, 78);
  assert.equal(last.zone, 'green');
  const cg = last.exercises[0];
  assert.equal(cg.name, 'Close Grip Bench Press');
  assert.equal(cg.rx, '3 × 10–12');
  assert.deepEqual(cg.sets.map(x => x.r), [9, 7, 5]);
  assert.equal(cg.prev, '35 × 8');
  assert.ok(cg.change! > 0 && cg.pr, '9 reps beat 8 reps at 35 lb');
  assert.ok(r.next && r.next.targets.length > 0, 'next workout has targets');
  assert.equal(r.recovery.length, 1);
  assert.equal(r.recovery[0].hrv, 62);
  assert.equal(r.coast.level, 'early', 'two sessions is not enough for the coasting check');
});

test('recovery details and coach notes stay off the report unless shared', () => {
  const d = freshData();
  d.whoop['2026-10-23'] = { rec: 40, hrv: 30, rhr: 60, sleep: 5.2, src: 'api' };
  d.coach.notes = [{ id: 'n1', text: 'Left shoulder cranky on presses', at: '2026-10-20' }];
  const hidden = buildReport(new Ctx(d, '2026-10-23'), { name: '', recovery: false, notes: false });
  assert.equal(hidden.readiness.rec, 40);
  assert.equal(hidden.readiness.hrv, undefined);
  assert.equal(hidden.readiness.sleep, undefined);
  assert.deepEqual(hidden.readiness.notes, []);
  assert.deepEqual(Object.keys(hidden.recovery[0]).sort(), ['date', 'rec']);
  assert.deepEqual(hidden.notes, []);
  const shown = buildReport(new Ctx(d, '2026-10-23'), { name: '', recovery: true, notes: true });
  assert.equal(shown.readiness.sleep, 5.2);
  assert.deepEqual(shown.notes, ['Left shoulder cranky on presses']);
});

test('the coasting check uses the athlete voice, including the no-filter line', () => {
  const today = '2026-10-29';
  const demo = makeDemo(today, freshData().settings);
  const r = buildReport(new Ctx(demo, today), opts);
  assert.notEqual(r.coast.level, 'early');
  assert.ok(r.coast.line.length > 0);
  assert.ok(r.coast.evidence.length > 0);
  assert.ok(r.lifts.length > 0 && r.lifts[0].series.length >= 2);
  assert.equal(r.effort.length, 6);
  const clean = buildReport(new Ctx({ ...demo, settings: { ...demo.settings, tone: 'clean' } }, today), opts);
  assert.ok(!/bitch/.test(clean.coast.line));
});

test('the signature ignores the build time', () => {
  const ctx = new Ctx(freshData(), '2026-10-23');
  const a = buildReport(ctx, opts, new Date('2026-10-23T10:00:00Z'));
  const b = buildReport(ctx, opts, new Date('2026-10-23T11:00:00Z'));
  assert.notEqual(a.at, b.at);
  assert.equal(reportSignature(a), reportSignature(b));
});

test('share text reads like a message to the coach', () => {
  const d = freshData();
  d.whoop['2026-10-22'] = { rec: 78, hrv: 62, rhr: 51, sleep: 7.4, src: 'api' };
  const r = buildReport(new Ctx(d, '2026-10-23'), opts);
  const id = r.sessions[0].id;
  const w = workoutText(r, id, 'https://example.com/coach/#abc')!;
  assert.match(w, /^Upper · Thu, Oct 22/);
  assert.match(w, /Recovery 78% \(recovered\) · HRV 62 ms · Sleep 7.4 h/);
  assert.match(w, /Close Grip Bench Press \(3 × 10–12\)\n35×9, 35×7, 35×5\n/);
  assert.match(w, /New best/);
  assert.match(w, /Live view: https:\/\/example.com\/coach\/#abc$/);
  assert.equal(workoutText(r, 'nope'), null);
  const wk = weekText(r);
  assert.match(wk, /^Chris's week · Oct 17 to Oct 23/);
  assert.match(wk, /Close Grip Bench Press: 35×9/);
  assert.equal(setText({ w: 0, r: 12, rir: null }), '12 reps');
  assert.equal(setText({ w: 62.5, r: 8, rir: 1 }), '62.5×8 (1 left)');
});
