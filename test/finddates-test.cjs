// 文章から期日の候補を探す処理（findDates）の確認
const assert = require('node:assert/strict');
const { findDates, fmtLocal } = require('../app/engine.js');
const now = new Date(2026, 9, 20, 14, 0);
const pick = t => findDates(t, now).map(c => `${fmtLocal(c.due)} ${c.title}${c.hasTime ? '' : ' (時刻なし)'}${c.deadline ? ' [締切]' : ''}`);

const flyer = `秋の町内清掃
日時 11月8日(日) 午前9:00〜11:00
集合 第二公民館前
申込締切 10月31日(土)`;
assert.deepEqual(pick(flyer), ['2026-10-31T09:00 秋の町内清掃（申込締切） (時刻なし) [締切]', '2026-11-08T09:00 秋の町内清掃']);

const page = `冬のアコースティックライブ 2026
一般発売：2026年11月1日(日)10:00〜
お支払いは11/4(水)23:59まで
公演日 12月13日(日) 開場16:30／開演17:00`;
console.log(pick(page));
const p = pick(page);
assert.ok(p.includes('2026-11-01T10:00 冬のアコースティックライブ2026（一般発売）'));
assert.ok(p.some(x => x.startsWith('2026-11-04T23:59') && x.includes('[締切]')));
assert.ok(p.some(x => x.startsWith('2026-12-13T16:30')) && p.some(x => x.startsWith('2026-12-13T17:00')));

// 写真の読み取りで字の間に空白が入っても拾う / 全角数字 / 令和 / 年の補完（過ぎた月は来年）
assert.deepEqual(pick('健康診断\n1 1 月 2 0 日 ( 金 ) 1 4 時 3 0 分'), ['2026-11-20T14:30 健康診断']);
assert.deepEqual(pick('更新期限 令和９年３月３１日'), ['2027-03-31T09:00 更新期限 (時刻なし) [締切]']);
assert.deepEqual(pick('歯医者 2月3日 午後3時'), ['2027-02-03T15:00 歯医者']);
assert.deepEqual(pick('2026-12-01 18:30 忘年会'), ['2026-12-01T18:30 忘年会']);
// 拾わないもの
assert.deepEqual(pick('明日の9時に電話する'), []);
assert.deepEqual(pick('A4サイズ 1/2ページ 13/40'), ['2027-01-02T09:00 A4サイズ ページ (時刻なし)']);
assert.deepEqual(pick('電話 03-1234-5678 / 3.5kg'), []);
console.log('ok: findDates');
// 写真の読み取りで「〜」が消えた時刻の範囲
assert.deepEqual(pick('清掃\n日時 11月8日(日) 午前9:0011:00'), ['2026-11-08T09:00 清掃']);
console.log('ok: findDates (ocr range)');
