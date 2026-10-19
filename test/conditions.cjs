// 詳細条件（AND / OR / もし〜なら）
const assert = require('node:assert/strict');
const E = require('../app/engine.js');
const now = new Date(2026, 9, 19, 0, 0); // 10/19(月)
const days = (rule, n = 8) => { const r = { interval: 1, times: ['09:00'], ...rule }; const f = E.firstOccurrence(r, now); return E.upcoming({ due: E.fmtLocal(f), rule: r }, n, now).map(d => E.fmtLocal(d).slice(5).replace('T', ' ')); };
// AND: 毎日 かつ 平日 かつ 1〜10日
assert.deepEqual(days({ freq: 'daily', cond: { op: 'and', items: [{ t: 'day', v: 'bizday' }, { t: 'mday', from: 1, to: 3 }] } }, 4),
  ['11-02 09:00', '12-01 09:00', '12-02 09:00', '12-03 09:00']); // 11/1(日) と 11/3 文化の日は除く
// OR: 月曜 または 月末
assert.deepEqual(days({ freq: 'daily', cond: { op: 'or', items: [{ t: 'wd', v: [1] }, { t: 'last', n: 1 }] } }, 5),
  ['10-19 09:00', '10-26 09:00', '10-31 09:00', '11-02 09:00', '11-09 09:00']);
// 入れ子: 平日 かつ (5日 または 第3金曜)
assert.deepEqual(days({ freq: 'daily', cond: { op: 'and', items: [{ t: 'day', v: 'weekday' }, { op: 'or', items: [{ t: 'mday', from: 5, to: 5 }, { t: 'nth', n: 3, wd: 5 }] }] } }, 4),
  ['11-05 09:00', '11-20 09:00', '12-18 09:00', '01-05 09:00']); // 12/5 は土曜
// 「以外」
assert.deepEqual(days({ freq: 'daily', cond: { op: 'and', items: [{ t: 'month', v: [10, 11], not: true }] } }, 1), ['12-01 09:00']);
// もし: 毎月10日、土日祝なら次の平日、金曜なら18時
assert.deepEqual(days({ freq: 'monthly', byMonthDay: [10], ifs: [{ cond: { t: 'day', v: 'offday' }, act: 'next' }, { cond: { t: 'wd', v: [5] }, act: 'time', time: '18:00' }] }, 5),
  ['11-10 09:00', '12-10 09:00', '01-12 09:00', '02-10 09:00', '03-10 09:00']); // 2027/1/10(日)→1/11 成人の日→1/12
assert.deepEqual(days({ freq: 'weekly', byDay: [5], ifs: [{ cond: { t: 'mday', from: 1, to: 7 }, act: 'time', time: '7:30' }] }, 3),
  ['10-23 09:00', '10-30 09:00', '11-06 07:30']);
// もし: 毎週月曜、祝日なら通知しない / 前の平日
assert.ok(!days({ freq: 'weekly', byDay: [1], ifs: [{ cond: { t: 'day', v: 'holiday' }, act: 'skip' }] }, 15).some(x => x.startsWith('11-23') || x.startsWith('01-11')));
assert.ok(days({ freq: 'weekly', byDay: [1], ifs: [{ cond: { t: 'day', v: 'holiday' }, act: 'prev' }] }, 15).includes('01-08 09:00'));
assert.equal(E.describeRule({ freq: 'daily', interval: 1, times: ['09:00'], cond: { op: 'and', items: [{ t: 'day', v: 'weekday' }, { op: 'or', items: [{ t: 'mday', from: 1, to: 5 }, { t: 'last', n: 1 }] }] }, ifs: [{ cond: { t: 'day', v: 'holiday' }, act: 'skip' }] }),
  '毎日 9:00（平日 かつ (1〜5日 または 月末)）・もし祝日なら通知しない');
console.log('conditions ok');
