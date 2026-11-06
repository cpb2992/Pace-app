import test from 'node:test';
import assert from 'node:assert/strict';
import { freshData } from '../seed';
import { Ctx } from '../training';
import { baseDayName, minimalDay } from '../minimal';
import { summarize } from '../game';

test('every Nov/Dec day works with dumbbells and bodyweight, same sets and order', () => {
  const ctx = new Ctx(freshData(), '2026-11-06', true);
  const plain = new Ctx(freshData(), '2026-11-06').days();
  const days = ctx.days();
  assert.equal(days.length, plain.length);
  days.forEach((d, i) => {
    assert.equal(baseDayName(d.name), plain[i].name);
    assert.equal(d.exercises.length, plain[i].exercises.length);
    const names = d.exercises.map(e => e.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `no duplicate names in ${d.name}`);
    d.exercises.forEach((e, j) => {
      assert.equal(e.sets, plain[i].exercises[j].sets);
      assert.ok(!/machine|cable|barbell|plate|smith|band/i.test(e.name), `${e.name} needs gym equipment`);
      assert.ok(['dumbbell', 'bodyweight', 'cardio', 'circuit'].includes(e.type), `${e.name} is ${e.type}`);
    });
  });
});

test('home-ready moves keep their name and history', () => {
  const day = new Ctx(freshData(), '2026-11-06').days().find(d => d.exercises.some(e => e.name === 'Single Leg DB Hip Thrust'))!;
  const min = minimalDay(day);
  assert.ok(min.exercises.some(e => e.name === 'Single Leg DB Hip Thrust' && !e.id.endsWith('~min')));
});

test('a minimal session still moves the rotation and scores with the right types', () => {
  const d = freshData();
  const day = minimalDay(new Ctx(d, '2026-11-06').days()[0]);
  d.sessions.push({ id: 'm1', date: '2026-11-04', day: day.name, zone: 'green', rec: 80, src: 'app',
    sets: [{ ex: day.exercises[0].name, w: 40, r: 10, rir: 1 }] });
  const pick = new Ctx(d, '2026-11-07').pickDay();
  assert.ok(pick.idx >= 0);
  const s = summarize(d, '2026-11-06');
  assert.ok(s.total > 0);
});

test('the October block swaps too, with no duplicate names', () => {
  for (const d of new Ctx(freshData(), '2026-10-23', true).days()) {
    const names = d.exercises.map(e => e.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, d.name);
    for (const e of d.exercises) assert.ok(['dumbbell', 'bodyweight', 'cardio', 'circuit'].includes(e.type), `${e.name} is ${e.type}`);
  }
});
