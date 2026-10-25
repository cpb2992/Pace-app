import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, mergeWhoop, whoopDays, whoopWorkouts } from '../whoop';

test('WHOOP records become one day per wake-up', () => {
  const recovery = [
    { cycle_id: 1, sleep_id: 's1', created_at: '2026-10-25T11:00:00Z', score_state: 'SCORED', score: { recovery_score: 71.6, hrv_rmssd_milli: 54.4, resting_heart_rate: 52, spo2_percentage: 96.2, skin_temp_celsius: 33.71 } },
    { cycle_id: 2, sleep_id: 's2', created_at: '2026-10-24T11:00:00Z', score_state: 'PENDING_SCORE', score: null },
  ];
  const sleep = [
    { id: 's1', end: '2026-10-25T10:30:00Z', timezone_offset: '-04:00', nap: false, score: { sleep_performance_percentage: 88, stage_summary: { total_in_bed_time_milli: 8 * 3600e3, total_awake_time_milli: 0.5 * 3600e3 } } },
    { id: 'nap', end: '2026-10-25T18:30:00Z', timezone_offset: '-04:00', nap: true, score: {} },
  ];
  const cycles = [{ id: 1, start: '2026-10-25T02:00:00Z', timezone_offset: '-04:00', score_state: 'SCORED', score: { strain: 12.345 } }];
  const days = whoopDays(recovery, sleep, cycles);
  assert.deepEqual(Object.keys(days), ['2026-10-25']);
  const d = days['2026-10-25'];
  assert.equal(d.rec, 72);
  assert.equal(d.hrv, 54);
  assert.equal(d.sleep, 7.5);
  assert.equal(d.perf, 88);
  assert.equal(d.strain, 12.3);
  assert.equal(d.spo2, 96.2);
  assert.equal(d.src, 'api');
});

test('timezone offsets set the local date', () => {
  assert.equal(localDate('2026-10-25T02:30:00Z', '-04:00'), '2026-10-24');
  assert.equal(localDate('2026-10-25T02:30:00Z', '+01:00'), '2026-10-25');
});

test('workouts and merging', () => {
  const w = whoopWorkouts([{ id: 'w1', start: '2026-10-24T22:00:00Z', end: '2026-10-24T23:10:00Z', timezone_offset: '-04:00', sport_name: 'weightlifting', score_state: 'SCORED', score: { strain: 9.84, average_heart_rate: 121, max_heart_rate: 163, kilojoule: 1500.4 } }]);
  assert.equal(w.w1.sport, 'Weightlifting');
  assert.equal(w.w1.strain, 9.8);
  assert.equal(w.w1.date, '2026-10-24');
  const merged = mergeWhoop({ '2026-10-24': { rec: 60, hrv: 50, rhr: 55, sleep: 7, src: 'manual' } }, { '2026-10-24': { rec: 62, hrv: null, rhr: 54, sleep: 7.2, src: 'api' } });
  assert.equal(merged['2026-10-24'].rec, 62);
  assert.equal(merged['2026-10-24'].hrv, 50, 'manual fills a gap');
  assert.equal(merged['2026-10-24'].src, 'api');
});
