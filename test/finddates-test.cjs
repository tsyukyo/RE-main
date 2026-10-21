// 文章から期日の候補を探す処理（findDates）の確認
const assert = require('node:assert/strict');
const { findDates, fmtLocal } = require('../app/engine.js');
const now = new Date(2026, 9, 20, 14, 0);
const pick = t => findDates(t, now).map(c => `${fmtLocal(c.due)} ${c.title}${c.hasTime ? '' : ' (時刻なし)'}${c.deadline ? ' [締切]' : ''}`);

const flyer = `秋の町内清掃
日時 11月8日(日) 午前9:00〜11:00
集合 第二公民館前
申込締切 10月31日(土)`;
assert.deepEqual(pick(flyer), ['2026-10-31T09:00 秋の町内清掃の申込締切 (時刻なし) [締切]', '2026-11-08T09:00 秋の町内清掃']);

const page = `冬のアコースティックライブ 2026
一般発売：2026年11月1日(日)10:00〜
お支払いは11/4(水)23:59まで
公演日 12月13日(日) 開場16:30／開演17:00`;
console.log(pick(page));
const p = pick(page);
assert.ok(p.includes('2026-11-01T10:00 冬のアコースティックライブ2026の一般発売'));
assert.ok(p.some(x => x.startsWith('2026-11-04T23:59') && x.includes('[締切]')));
assert.ok(p.some(x => x.startsWith('2026-12-13T16:30')) && p.some(x => x.startsWith('2026-12-13T17:00')));

// 写真の読み取りで字の間に空白が入っても拾う / 全角数字 / 令和 / 年の補完（過ぎた月は来年）
assert.deepEqual(pick('健康診断\n1 1 月 2 0 日 ( 金 ) 1 4 時 3 0 分'), ['2026-11-20T14:30 健康診断']);
assert.deepEqual(pick('更新期限 令和９年３月３１日'), ['2027-03-31T09:00 更新期限 (時刻なし) [締切]']);
assert.deepEqual(pick('歯医者 2月3日 午後3時'), ['2027-02-03T15:00 歯医者']);
assert.deepEqual(pick('2026-12-01 18:30 忘年会'), ['2026-12-01T18:30 忘年会']);
// 拾わないもの
assert.deepEqual(pick('明日の9時に電話する'), []);
assert.deepEqual(pick('A4サイズ 1/2ページ 13/40'), ['2027-01-02T09:00 A4サイズページ (時刻なし)']);
assert.deepEqual(pick('電話 03-1234-5678 / 3.5kg'), []);
console.log('ok: findDates');
// 写真の読み取りで「〜」が消えた時刻の範囲
assert.deepEqual(pick('清掃\n日時 11月8日(日) 午前9:0011:00'), ['2026-11-08T09:00 清掃']);
assert.deepEqual(pick('清掃\n日時 11月8日(日) 午前9:00 へ11:00'), ['2026-11-08T09:00 清掃']);
console.log('ok: findDates (ocr range)');
// タイトルの付け方: 決まり文句・飾りを落とす / 見出し行 / 文の言い切りを落とす / 番号の行は見出しにしない
const titles = t => findDates(t, now).map(c => c.title);
assert.deepEqual(titles('【重要】保護者会のお知らせ\n日時：11月14日(土) 10:00〜11:30\n場所：体育館\n出欠票は11月7日(金)までに担任へ提出してください'), ['出欠票は担任へ提出', '保護者会']);
assert.deepEqual(titles('ご予約ありがとうございます\n予約番号 A1234\nご来店日時 2026年11月3日(火) 18:30\n店舗 渋谷店'), ['ご来店']);
assert.deepEqual(titles('■説明会\n10月25日(日) 14:00\n■エントリー締切\n11月1日(日) 23:59'), ['説明会', '説明会のエントリー締切']);
assert.deepEqual(titles('Amazon.co.jp ご注文の確認\nお届け予定: 10月23日(金)\nお支払い期限：10月22日(木)'), ['Amazon.co.jpのお支払い期限', 'Amazon.co.jpのお届け予定']);
assert.deepEqual(titles('第3回 定例ミーティング\n日程 2026/11/05 15:00-16:00'), ['第3回定例ミーティング']);
// 写真の一番大きい文字を見出しとして渡したとき
assert.deepEqual(findDates('受付 9:00\n日時 11月8日(日) 9:30', now, { title: '秋祭り' }).map(c => c.title), ['秋祭り']);
console.log('ok: findDates (titles)');
// 抽選サイト: 期日の種類を見分け、期間は始まりと終わりに分ける
const kinds = t => findDates(t, now).map(c => `${fmtLocal(c.due)} ${c.title} [${c.tag}]`);
assert.deepEqual(kinds('【抽選販売】拡張パック「インフェルノX」\n応募期間：2026年10月22日(木)11:00〜10月27日(火)23:59\n当選発表：2026年10月30日(金)15:00頃（当選者のみメールでご連絡）\n購入期限：2026年11月2日(月)23:59まで'), [
  '2026-10-22T11:00 拡張パック「インフェルノX」の応募開始 [応募開始]',
  '2026-10-27T23:59 拡張パック「インフェルノX」の応募終了 [応募締切]',
  '2026-10-30T15:00 拡張パック「インフェルノX」の当選発表 [抽選発表]',
  '2026-11-02T23:59 拡張パック「インフェルノX」の購入期限 [購入期限]',
]);
assert.deepEqual(kinds('Switch 2 抽選販売のご案内\n■受付期間\n11/5(木) 10:00 ～ 11/10(火) 9:59\n■抽選結果のご連絡\n11月13日(金)以降順次'), [
  '2026-11-05T10:00 Switch 2抽選販売の受付開始 [応募開始]',
  '2026-11-10T09:59 Switch 2抽選販売の受付終了 [応募締切]',
  '2026-11-13T09:00 Switch 2抽選販売の抽選結果 [抽選発表]',
]);
// チケットサイト（ライブポケットのような書き方）
assert.deepEqual(kinds('ONE-MAN LIVE「HELLO」\n開催日時\n2026年11月28日(土) 開場 17:30 / 開演 18:00\n受付期間 2026/10/22(木) 12:00 〜 2026/10/25(日) 23:59\n抽選結果発表 2026/10/27(火) 18:00 予定\n支払期限 2026/10/30(金) 23:59\n【一般販売】\n販売期間 2026/11/07(土) 10:00 〜 2026/11/27(金) 23:59'), [
  '2026-10-22T12:00 ONE-MAN LIVE「HELLO」の受付開始 [応募開始]',
  '2026-10-25T23:59 ONE-MAN LIVE「HELLO」の受付終了 [応募締切]',
  '2026-10-27T18:00 ONE-MAN LIVE「HELLO」の抽選結果発表 [抽選発表]',
  '2026-10-30T23:59 ONE-MAN LIVE「HELLO」の支払期限 [購入期限]',
  '2026-11-07T10:00 ONE-MAN LIVE「HELLO」の販売開始 [販売開始]',
  '2026-11-27T23:59 ONE-MAN LIVE「HELLO」の販売終了 [販売終了]',
  '2026-11-28T17:30 ONE-MAN LIVE「HELLO」 開場 []',
  '2026-11-28T18:00 ONE-MAN LIVE「HELLO」 開演 []',
]);
console.log('ok: findDates (lottery)');
// いろいろな書き方
const one = t => findDates(t, now).map(c => `${fmtLocal(c.due)} [${c.tag}]`);
assert.deepEqual(one('Lottery results: Oct 30, 2026 at 3:00 PM'), ['2026-10-30T15:00 [抽選発表]']);
assert.deepEqual(one('Entry closes Friday, November 6th 11:59pm'), ['2026-11-06T23:59 [応募締切]']);
assert.deepEqual(one('Draw 30 Oct 2026 18:00'), ['2026-10-30T18:00 [抽選発表]']);
assert.deepEqual(one('当選発表 10.30(金) 18時頃'), ['2026-10-30T18:00 [抽選発表]']);
assert.deepEqual(one('受付 10月30日(金)〜31日(土)'), ['2026-10-30T09:00 [応募開始]', '2026-10-31T09:00 [応募締切]']);
assert.deepEqual(one('発表 2026年11/2 正午'), ['2026-11-02T12:00 [抽選発表]']);
assert.deepEqual(one('当選発表 2026.11.05 午後6時半'), ['2026-11-05T18:30 [抽選発表]']);
assert.deepEqual(one('発表 2026-11-05T18:00:00+09:00'), ['2026-11-05T18:00 [抽選発表]']);
assert.deepEqual(one('支払期限 １１／７（土）２３：５９'), ['2026-11-07T23:59 [購入期限]']);
assert.deepEqual(one('抽選結果 令和8年11月10日 夜8時'), ['2026-11-10T20:00 [抽選発表]']);
assert.deepEqual(one('当選発表 R8.11.12 20:00'), ['2026-11-12T20:00 [抽選発表]']);
console.log('ok: findDates (formats)');
