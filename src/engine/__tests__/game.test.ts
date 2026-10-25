import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betNet, bountiesToday, bountyMet, critChance, critFor, effortMult, hash01, levelCost, levelFor, lootOdds, rankName, rollLoot, scoreDraft, scoreSet, slotSeed, streakMult, summarize } from '../game';
import { freshData } from '../seed';
import type { AppData, LoggedSet, Session } from '../types';

const set = (ex: string, w: number, r: number, rir: number | null): LoggedSet => ({ ex, w, r, rir });
const sess = (id: string, date: string, day: string, sets: LoggedSet[], extra: Partial<Session> = {}): Session => ({ id, date, day, zone: null, rec: null, sets, ...extra });
const base = (): AppData => { const d = freshData(); d.sessions = []; return d; };

test('effort pays by zone: failure on green, backing off on red', () => {
  assert.equal(effortMult(0, 'green', false), 2);
  assert.ok(effortMult(1, 'green', true) > effortMult(0, 'green', true), 'barbell peaks at 1 rep left');
  assert.ok(effortMult(3, 'green', false) < 1, 'coasting barely scores');
  assert.ok(effortMult(3, 'red', false) > effortMult(0, 'red', false), 'red days pay for backing off');
  assert.ok(effortMult(2, 'yellow', false) > effortMult(0, 'yellow', false));
  assert.equal(effortMult(null, 'green', false), 1);
});

test('a set scores reps x load x effort x crit', () => {
  const plain = scoreSet(set('Leg Press', 200, 10, 0), { lastTopW: 200, zone: 'green', barbell: false, seed: 'no-crit-seed' });
  if (plain.crit === 1) assert.equal(plain.pts, 200);
  const heavier = scoreSet(set('Leg Press', 210, 10, 0), { lastTopW: 200, zone: 'green', barbell: false, seed: 'no-crit-seed' });
  assert.ok(heavier.heavier && heavier.load === 1.25);
  const coast = scoreSet(set('Leg Press', 200, 10, 3), { lastTopW: 200, zone: 'green', barbell: false, seed: 'x' });
  assert.ok(coast.coast);
  const lighter = scoreSet(set('Leg Press', 150, 10, 1), { lastTopW: 200, zone: 'green', barbell: false, seed: 'x' });
  assert.ok(lighter.lighter);
  const redLight = scoreSet(set('Leg Press', 150, 10, 3), { lastTopW: 200, zone: 'red', barbell: false, seed: 'x' });
  assert.ok(!redLight.lighter, 'going lighter on a red day is not penalized');
});

test('crits are fixed per set slot and harder sets get better odds', () => {
  assert.equal(hash01('abc'), hash01('abc'));
  assert.ok(critChance(0, 'green') > critChance(3, 'green'));
  assert.equal(critChance(0, 'red'), 0.01);
  let hard = 0, easy = 0;
  for (let i = 0; i < 4000; i++) {
    const seed = slotSeed('2026-10-25', 'Upper', 'Bench', i);
    if (critFor(seed, 0, 'green') > 1) hard++;
    if (critFor(seed, 4, 'green') > 1) easy++;
    assert.equal(critFor(seed, 0, 'green'), critFor(seed, 0, 'green'));
  }
  assert.ok(hard > easy * 5, `hard ${hard} vs easy ${easy}`);
  assert.ok(hard > 350 && hard < 620, `about 12% of hard sets crit (${hard})`);
});

test('levels, ranks and streak multipliers', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(levelCost(1)).level, 2);
  assert.equal(levelFor(levelCost(1) - 1).level, 1);
  assert.equal(rankName(1), 'Rookie I');
  assert.equal(rankName(6), 'Iron I');
  assert.equal(rankName(40), 'Titan V');
  assert.equal(rankName(41), 'Legend 1');
  assert.equal(streakMult(0), 1);
  assert.equal(streakMult(2), 1.2);
  assert.equal(streakMult(9), 1.5);
});

test('loot odds improve with effort and PRs, and always add up', () => {
  const lo = lootOdds(0, false), hi = lootOdds(1, true);
  for (const o of [lo, hi]) assert.ok(Math.abs(o.common + o.rare + o.epic + o.legendary - 1) < 1e-9);
  assert.ok(hi.legendary > lo.legendary * 4);
  const r = rollLoot(1, true, () => 0.0001);
  assert.equal(r.tier, 'legendary');
  assert.ok(r.pts >= 1200 && r.pts <= 2000);
  assert.equal(rollLoot(0, false, () => 0.9999).tier, 'common');
});

test('bets are double or nothing', () => {
  assert.equal(betNet([{ ex: 'a', set: 0, stake: 100, w: 100, reps: 8, won: true }, { ex: 'a', set: 1, stake: 50, w: 100, reps: 8, won: false }]), 50);
});

test('PRs, rep records and beating last time pay once per exercise', () => {
  const d = base();
  d.sessions = [
    sess('a', '2026-10-01', 'Upper', [set('Close Grip Bench Press', 100, 8, 1), set('Close Grip Bench Press', 100, 8, 1)]),
    sess('b', '2026-10-08', 'Upper', [set('Close Grip Bench Press', 105, 8, 1)]),
    sess('c', '2026-10-15', 'Upper', [set('Close Grip Bench Press', 100, 9, 1)]),
  ];
  const g = summarize(d, '2026-10-20');
  assert.equal(g.sessions.get('a')!.exercises[0].bonus, null, 'first time is not a PR');
  assert.equal(g.sessions.get('b')!.exercises[0].bonus?.kind, 'pr');
  assert.equal(g.sessions.get('c')!.exercises[0].bonus?.kind, 'rep', '9 reps at 100 beats the old 8');
  assert.ok(g.total > 0);
});

test('weekly streak multiplies the next week, and rest days never break it', () => {
  const d = base();
  const wk = (start: string, n: number, id: string) => Array.from({ length: n }, (_, i) => sess(`${id}${i}`, start.replace(/\d\d$/, m => String(Number(m) + i * 2).padStart(2, '0')), 'Upper', [set('Leg Press', 200, 10, 1)]));
  d.sessions = [...wk('2026-10-05', 3, 'w1'), ...wk('2026-10-12', 3, 'w2'), ...wk('2026-10-19', 1, 'w3')];
  const g = summarize(d, '2026-10-20');
  assert.equal(g.sessions.get('w30')!.streak, 2);
  assert.equal(g.sessions.get('w30')!.mult, 1.2);
  assert.equal(g.streak, 2);
  assert.equal(g.weekDone, 1);
});

test('recovery earns points: check-ins, sleep, and respecting red days', () => {
  const d = base();
  d.whoop['2026-10-18'] = { rec: 25, hrv: 30, rhr: 60, sleep: 8.2, src: 'api' };
  d.whoop['2026-10-19'] = { rec: 80, hrv: 60, rhr: 52, sleep: 6.5, src: 'api' };
  const g = summarize(d, '2026-10-20');
  const labels = g.recovery.map(r => r.label).sort();
  assert.deepEqual(labels, ['8+ hours of sleep', 'Checked in', 'Checked in', 'Respected a red day']);
  assert.equal(g.total, 10 + 50 + 60 + 10);
});

test('bounties: break a stall on green, back off on red', () => {
  const d = base();
  d.sessions = ['2026-10-01', '2026-10-08', '2026-10-15'].map((date, i) => sess('s' + i, date, 'Upper', [set('Close Grip Bench Press', 95, 8, 2)]));
  const green = bountiesToday(d, '2026-10-22', 'Upper', 'green');
  const stall = green.find(b => b.kind === 'stall');
  assert.ok(stall, 'stalled bench becomes a bounty');
  assert.match(stall!.detail, /95 × 8/);
  assert.ok(bountyMet(stall!, [set('Close Grip Bench Press', 95, 9, 1)]));
  assert.ok(!bountyMet(stall!, [set('Close Grip Bench Press', 95, 8, 1)]));
  const red = bountiesToday(d, '2026-10-22', 'Upper', 'red');
  assert.equal(red[0].kind, 'backoff');
  assert.ok(bountyMet(red[0], [set('Close Grip Bench Press', 80, 8, 3)]));
  assert.ok(!bountyMet(red[0], [set('Close Grip Bench Press', 80, 8, 0)]));
});

test('a draft scores the same as the saved session', () => {
  const d = base();
  d.whoop['2026-10-22'] = { rec: 80, hrv: 60, rhr: 52, sleep: 7.5, src: 'api' };
  d.sessions = [sess('a', '2026-10-15', 'Upper', [set('Close Grip Bench Press', 95, 8, 2), set('Wide Lat Pull Down', 120, 10, 2)])];
  const sets = [set('Close Grip Bench Press', 100, 8, 1), set('Close Grip Bench Press', 100, 7, 0), set('Wide Lat Pull Down', 120, 12, 0)];
  const draft = scoreDraft(d, { date: '2026-10-22', day: 'Upper', zone: 'green', sets });
  d.sessions.push(sess('b', '2026-10-22', 'Upper', sets, { zone: 'green' }));
  const saved = summarize(d, '2026-10-22').sessions.get('b')!;
  assert.equal(draft.earned, saved.earned);
  assert.ok(draft.exercises[0].sets[0].heavier);
  assert.equal(draft.exercises.find(e => e.name === 'Close Grip Bench Press')!.bonus?.kind, 'pr');
});
