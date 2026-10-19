// 月末と「土日祝なら前の平日」
const assert = require('node:assert/strict');
const E = require('../app/engine.js');
const now = new Date(2026, 9, 19, 9);
const days = t => { const p = E.parseInput(t, now); return E.upcoming({ due: E.fmtLocal(p.due), rule: p.rule }, 6, now).map(d => E.fmtLocal(d).slice(5, 10)); };
assert.deepEqual(days('毎月末 9時 家賃'), ['10-31', '11-30', '12-31', '01-31', '02-28', '03-31']);
// 2026/10/31(土)→10/30、2027/1/31(日)→1/29、2/28(日)→2/26
for (const t of ['毎月末 土日祝NG 9時 経費', '毎月 月末の平日 経費', '最終営業日 18時 締め', '毎月末 土日祝の場合は前の平日 経費'])
  assert.deepEqual(days(t), ['10-30', '11-30', '12-31', '01-29', '02-26', '03-31'], t);
// 25日が日曜→23日、1日が日曜・元日→前月の最後の平日
assert.deepEqual(days('毎月25日 土日祝なら前の平日 給料').slice(0, 2), ['10-23', '11-25']);
assert.deepEqual(days('毎月1日 土日祝NG 9時 x').slice(0, 3), ['10-30', '12-01', '12-31']);
assert.equal(E.parseInput('毎月25日 土日祝なら前の平日 給料', now).title, '給料');
// 毎日・平日は土日祝を除くだけ
assert.deepEqual(E.parseInput('毎日 土日祝NG 8時 薬', now).rule.onlyDays, [1, 2, 3, 4, 5]);
assert.equal(E.parseInput('土日 10時 掃除', now).rule.byDay.join(), '0,6');
console.log('monthend ok');
