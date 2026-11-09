import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dateKey, validDate, validateData, totalAt, changeLabel, mergeRecord } from '../assets/model.js';

const sample = JSON.parse(await readFile(new URL('../data/energy.json', import.meta.url), 'utf8'));
const record = (kind, operation, amount, note = '') => ({ kind, operation, amount, note });
test('initial records: zero start, school Nov 2–6, home +3 Nov 7–8, total 6', () => {
  const { records } = validateData(sample);
  assert.equal(totalAt(records, '2026-11-01'), 0);
  for (let day = 2; day <= 6; day++) {
    assert.equal(records[`2026-11-0${day}`].kind, 'school');
    assert.equal(totalAt(records, `2026-11-0${day}`), 0);
  }
  assert.deepEqual(records['2026-11-07'], record('home', 'add', 3));
  assert.deepEqual(records['2026-11-08'], record('home', 'add', 3));
  assert.equal(totalAt(records, '2026-11-07'), 3);
  assert.equal(totalAt(records, '2026-11-09'), 6);
});
test('retroactive edits recalculate across months; resets cut off the previous total', () => {
  const records = {
    '2026-12-01': record('home', 'add', 4),
    '2026-11-07': record('home', 'add', 3),
    '2026-11-08': record('small', 'subtract', 2),
    '2026-11-09': record('big', 'reset', 0),
    '2026-11-10': record('home', 'add', 5),
  };
  assert.equal(totalAt(records, '2026-11-08'), 1);
  assert.equal(totalAt(records, '2026-11-09'), 0);
  assert.equal(totalAt(records, '2026-12-01'), 9);
  records['2026-11-07'].amount = 20;
  assert.equal(totalAt(records, '2026-11-08'), 18);
  assert.equal(totalAt(records, '2026-12-01'), 9);
  delete records['2026-11-09'];
  assert.equal(totalAt(records, '2026-12-01'), 27);
});
test('scene and operation are independent; current total excludes future records', () => {
  const data = validateData({ schemaVersion: 1, records: {
    '2026-11-01': record('school', 'add', 2),
    '2026-11-02': record('home', 'subtract', 4),
    '2026-11-20': record('home', 'add', 100),
  } });
  assert.equal(totalAt(data.records, '2026-11-09'), -2);
  assert.equal(changeLabel(record('big', 'reset', 0)), '零');
  assert.equal(changeLabel(record('school', 'keep', 0)), '0');
  assert.equal(changeLabel(record('small', 'subtract', 3)), '−3');
});
test('cloud merge preserves other dates and rejects concurrent edits to the same date', () => {
  const latest = validateData(sample);
  latest.records['2026-11-09'] = record('small', 'subtract', 2, '另一台设备');
  const changed = record('home', 'add', 7, '补记');
  const merged = mergeRecord(latest, '2026-11-07', changed, sample.records['2026-11-07']);
  assert.deepEqual(merged.records['2026-11-09'], latest.records['2026-11-09']);
  assert.equal(totalAt(merged.records, '2026-11-09'), 8);
  assert.throws(() => mergeRecord(latest, '2026-11-09', changed, null), /其他设备更新/);
  const deleted = mergeRecord(latest, '2026-11-09', null, latest.records['2026-11-09']);
  assert.equal(deleted.records['2026-11-09'], undefined);
  assert.equal(latest.records['2026-11-09'].note, '另一台设备');
});
test('dates use local calendar days and reject invalid or out-of-range records', () => {
  assert.equal(dateKey(new Date(2026, 10, 9)), '2026-11-09');
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-13-01'), false);
  for (const r of [record('nope', 'add', 1), record('home', 'add', -1), record('big', 'reset', 3), record('home', 'add', 1.5), record('home', 'add', 1000001)]) {
    assert.throws(() => validateData({ schemaVersion: 1, records: { '2026-11-01': r } }));
  }
  assert.throws(() => validateData({ schemaVersion: 1, records: { '2026-10-31': record('home', 'add', 1) } }));
  assert.throws(() => validateData({ schemaVersion: 1, records: [] }));
  assert.throws(() => validateData(null));
});
