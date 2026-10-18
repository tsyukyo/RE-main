// 「今夜」「朝」など時刻を補う表現で、過去の時刻にならないこと
const assert = require('node:assert/strict');
const E = require('../app/engine.js');
const at = (h, m = 0) => new Date(2026, 9, 18, h, m);
const due = (t, now) => E.fmtLocal(E.parseInput(t, now).due);
assert.equal(due('今夜 ゴミ出し', at(22)), '2026-10-18T23:00');
assert.equal(due('今夜 ゴミ出し', at(15)), '2026-10-18T20:00');
assert.equal(due('今晩 電話', at(23, 40)), '2026-10-19T00:00');
assert.equal(due('夜に電話', at(22)), '2026-10-18T23:00');
assert.equal(due('今日の夕方 買い物', at(18)), '2026-10-18T19:00');
assert.equal(due('朝 散歩', at(10)), '2026-10-19T08:00');
assert.equal(due('寝る前に歯ブラシ', at(23)), '2026-10-19T00:00');
assert.equal(due('明日の朝 散歩', at(10)), '2026-10-19T08:00');
// 時刻をはっきり書いたときは変えずに警告する
assert.deepEqual(E.parseInput('今夜9時 ゴミ', at(22)).warn, ['過去の日時です']);
console.log('vague ok');
