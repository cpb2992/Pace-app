import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCoachReply, checkCoachReply, coachSystem, COACH_SCHEMA, feelNudges, programExercises } from '../prompt';
import { summarize } from '../game';
import { freshData } from '../seed';
import { Ctx } from '../training';

test('the coach prompt carries data, notes, nudges and the program list', () => {
  const d = freshData();
  d.whoop['2026-10-23'] = { rec: 80, hrv: 60, rhr: 52, sleep: 7.5, perf: 91, strain: 11.2, src: 'api' };
  d.coach.notes = [{ id: 'n1', text: 'Left shoulder cranky on presses', at: '2026-10-20' }];
  d.coach.nudges = [{ ex: 'Leg Press', change: 'up', reason: 'Felt light', at: '2026-10-21' }];
  const ctx = new Ctx(d, '2026-10-23');
  const sys = coachSystem(ctx, 0, summarize(d, '2026-10-23'), []);
  assert.match(sys, /\[n1\] Left shoulder cranky/);
  assert.match(sys, /Leg Press: up \(Felt light\)/);
  assert.match(sys, /recovery 80% \(green\)/);
  assert.match(sys, /Close Grip Bench Press/);
  assert.ok(programExercises(ctx).includes('Leg Press'));
  assert.deepEqual([...COACH_SCHEMA.required], ['reply', 'remember', 'forget', 'nudges']);
});

test('coach replies are checked before they touch data', () => {
  const d = freshData();
  d.coach.notes = [{ id: 'n1', text: 'Gym leg press maxes at 400', at: '2026-10-20' }];
  d.whoop['2026-10-23'] = { rec: 80, hrv: 60, rhr: 52, sleep: 7.5, src: 'api' };
  const ctx = new Ctx(d, '2026-10-23');
  const c = checkCoachReply({ reply: ' Bumped it. ', remember: ['Gym leg press maxes at 400', 'Prefers heavy, low-rep days'], forget: ['n1', 'nope'], nudges: [{ exercise: 'leg press', change: 'up', reason: 'Too light' }, { exercise: 'Made Up Curl', change: 'up', reason: 'x' }, { exercise: 'Leg Press', change: 'down', reason: 'dupe' }] }, ctx);
  assert.equal(c.reply, 'Bumped it.');
  assert.deepEqual(c.remember, ['Prefers heavy, low-rep days'], 'already-known notes are skipped');
  assert.deepEqual(c.forget, ['n1']);
  assert.deepEqual(c.nudges, [{ exercise: 'Leg Press', change: 'up', reason: 'Too light' }]);
  let n = 0;
  const changes = applyCoachReply(d, c, '2026-10-23', () => 'id' + n++);
  assert.deepEqual(changes, ['Forgot: Gym leg press maxes at 400', 'Remembered: Prefers heavy, low-rep days', 'Leg Press: up a step next time']);
  assert.equal(d.coach.notes.length, 1);
  assert.equal(d.coach.nudges[0].ex, 'Leg Press');
});

test('no bumps on red days, even if the coach asks', () => {
  const d = freshData();
  d.whoop['2026-10-23'] = { rec: 20, hrv: 30, rhr: 62, sleep: 5, src: 'api' };
  const c = checkCoachReply({ reply: 'x', remember: [], forget: [], nudges: [{ exercise: 'Leg Press', change: 'up', reason: 'x' }, { exercise: 'Romanian Deadlift', change: 'down', reason: 'achy' }] }, new Ctx(d, '2026-10-23'));
  assert.deepEqual(c.nudges.map(x => x.change), ['down']);
});

test('feel buttons queue nudges without Claude', () => {
  const s = { id: 's', date: '2026-10-23', day: 'Lower', zone: null, rec: null, sets: [{ ex: 'Leg Press', w: 200, r: 10, rir: 2 }, { ex: 'Leg Press', w: 200, r: 10, rir: 2 }, { ex: 'Cardio', w: 0, r: 1, rir: null }] };
  const typeOf = (n: string) => (n === 'Cardio' ? 'cardio' : 'machine');
  assert.deepEqual(feelNudges(s, 'easy', '2026-10-23', typeOf).map(n => [n.ex, n.change]), [['Leg Press', 'up']]);
  assert.deepEqual(feelNudges(s, 'hard', '2026-10-23', typeOf).map(n => n.change), ['hold']);
  assert.equal(feelNudges(s, 'right', '2026-10-23', typeOf).length, 0);
});
