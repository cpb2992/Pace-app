import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ctx, plates, rxText, zoneOf } from '../training';
import { parseHistoryCSV, parseProgramText, parseWhoopCycles, parseYouTube, validateProgram, ytLink } from '../parse';
import { freshData, makeDemo } from '../seed';
import type { AppData, Exercise } from '../types';

const ex = (o: Partial<Exercise> = {}): Exercise => ({ id: 'x', name: 'Close Grip Bench Press', sets: 3, repLow: 10, repHigh: 12, type: 'barbell', note: '', rxSet: true, ...o });

test('zones follow WHOOP thresholds', () => {
  assert.equal(zoneOf(67), 'green');
  assert.equal(zoneOf(66), 'yellow');
  assert.equal(zoneOf(34), 'yellow');
  assert.equal(zoneOf(33), 'red');
});

test('seeded close grip history asks for one more rep', () => {
  const ctx = new Ctx(freshData(), '2026-10-23');
  const p = ctx.prescribe(ex(), 'green');
  assert.equal(p.kind, 'lift');
  if (p.kind === 'lift') { assert.equal(p.w, 35); assert.equal(p.reps, 10); assert.equal(p.tag, 'reps'); assert.equal(p.last, '35 × 9'); }
});

test('hitting the top of the range on every set adds weight', () => {
  const d: AppData = freshData();
  d.sessions = [{ id: 's', date: '2026-10-20', day: 'Upper', zone: null, rec: null, sets: [12, 12, 12].map(r => ({ ex: 'Close Grip Bench Press', w: 95, r, rir: 1 })) }];
  const p = new Ctx(d, '2026-10-22').prescribe(ex(), 'green');
  assert.ok(p.kind === 'lift' && p.w === 100 && p.reps === 10 && p.tag === 'up');
});

test('easy sets (3+ reps left) also add weight; red recovery backs off', () => {
  const d: AppData = freshData();
  d.sessions = [{ id: 's', date: '2026-10-20', day: 'Lower', zone: null, rec: null, sets: [8, 8, 8].map(r => ({ ex: 'Leg Press', w: 200, r, rir: 3 })) }];
  const ctx = new Ctx(d, '2026-10-22');
  const lp = ex({ name: 'Leg Press', type: 'machine' });
  const g = ctx.prescribe(lp, 'green');
  assert.ok(g.kind === 'lift' && g.w === 210 && g.tag === 'up');
  const r = ctx.prescribe(lp, 'red');
  assert.ok(r.kind === 'lift' && r.w === 170 && r.sets === 2 && r.tag === 'down');
});

test('plate math', () => {
  assert.equal(plates(135, 45), '45 per side');
  assert.equal(plates(185, 45), '45 + 25 per side');
  assert.equal(plates(35, 45), null);
});

test('demo data trips the coasting check', () => {
  const today = '2026-10-21';
  const ctx = new Ctx(makeDemo(today, freshData().settings), today);
  const c = ctx.coast();
  assert.equal(c.enough, true);
  assert.equal(c.level, 'coasting');
  assert.ok((c.stalls ?? []).some(s => s.name === 'Barbell Bench Press'));
});

test('active block switches on its start date', () => {
  assert.equal(new Ctx(freshData(), '2026-11-04').activeBlock()?.id, 'oct');
  assert.equal(new Ctx(freshData(), '2026-11-05').activeBlock()?.id, 'novdec');
});

test('pickDay uses the weekday schedule', () => {
  const fri = new Ctx(freshData(), '2026-10-23').pickDay();
  assert.deepEqual(fri, { idx: 1, label: 'Today' });
});

test('WHOOP cycles dated by wake-up morning', () => {
  const csv = 'Cycle start time,Cycle end time,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Day Strain,Wake onset,Asleep duration (min)\n' +
    '2026-10-20 22:30:00,2026-10-21 22:10:00,72,55,61,10.2,2026-10-21 06:40:00,432\n' +
    '2026-10-19 23:05:00,2026-10-20 22:30:00,31,61,40,14.1,,390';
  const out = parseWhoopCycles(csv);
  assert.equal(out['2026-10-21'].rec, 72);
  assert.equal(out['2026-10-21'].sleep, 7.2);
  assert.equal(out['2026-10-20'].rec, 31);
});

test('history CSV with RPE', () => {
  const s = parseHistoryCSV('Date,Workout Name,Exercise Name,Weight,Reps,RPE\n2026-10-01 18:00:00,Push,Bench Press,155,8,7\n2026-10-01 18:05:00,Push,Bench Press,155,7,8');
  assert.equal(s.length, 1);
  assert.equal(s[0].sets[0].rir, 3);
  assert.equal(s[0].day, 'Push');
});

test('program paste from the coach app', () => {
  const p = validateProgram(parseProgramText('Nov/Dec UPPER\nA: Dumbbell Bench Press [Elbows at 45 Degrees]\nB: Reverse Grip Lat Pulldown 3x10-12\nF: Cardio [15-20min]'));
  assert.ok(p);
  const exs = p!.days[0].exercises;
  assert.equal(p!.days[0].name, 'Nov/Dec UPPER');
  assert.equal(exs[0].name, 'Dumbbell Bench Press');
  assert.equal(exs[0].note, 'Elbows at 45 Degrees');
  assert.equal(exs[1].repHigh, 12);
  assert.equal(exs[2].type, 'cardio');
  assert.equal(rxText({ ...exs[1], id: 'a', rxSet: true }), '3 × 10–12');
});

test('YouTube links', () => {
  const s = parseYouTube('https://youtube.com/shorts/abc123XYZ_-?si=foo');
  assert.ok(s && s.shorts && s.id === 'abc123XYZ_-');
  const w = parseYouTube('youtu.be/dQw4w9WgXcQ?t=1m5s');
  assert.ok(w && w.start === 65);
  assert.equal(ytLink(w!), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s');
  assert.equal(parseYouTube('https://example.com/watch?v=abc'), null);
});
