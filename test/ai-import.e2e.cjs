// AI 用プロンプトのコピーと、AI が返す形の JSON（test/fixtures）を実際の画面から取り込めることを確かめる（Chromium）
// 先に npm run build で dist/rimain.html を作っておく。サーバーは不要
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const NOW = '2026-10-23T11:20:00'; // 金曜
const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(NOW + '+09:00'));
  await p.addInitScript(() => localStorage.clear());
  await p.goto('file://' + path.join(__dirname, '../dist/rimain.html')); await p.waitForTimeout(800);
  // サンプルデータを消して空から始める
  await p.evaluate(() => { S = { format: 'rimain.reminders', version: 1, lists: [{ id: 'inbox', name: 'リマインダー', color: 'blue' }], reminders: [] }; save(); render(); });

  // プロンプト: 枠が埋め込まれ、今日・曜日表・リストが入る
  const prompt = await p.evaluate(() => aiPrompt());
  assert.match(prompt, /今日: 2026-10-23\(金\) 11:20/);
  assert.match(prompt, /2026-10-26\(月\)/);
  assert.match(prompt, /"id":"inbox"/);
  assert.doesNotMatch(prompt, /\{\{/);
  assert.match(prompt, /予定:$/);
  console.log('ok: プロンプトに今日・曜日表・リストが入る');

  // 画面から取り込む（ファイルと設定 → 貼り付け → 取り込む）
  const importText = async text => {
    await p.click('#dataBtn'); await p.waitForTimeout(500);
    await p.fill('#iTxt', text); await p.click('#iGo'); await p.waitForTimeout(300);
    const msg = await p.textContent('#iMsg');
    await p.click('.sheet [data-act="ok"]'); await p.waitForTimeout(500);
    return msg;
  };
  // 「AI 用のプロンプトをコピー」ボタンが押せる（クリップボードが使えない環境でも欄に出る）
  await p.click('#dataBtn'); await p.waitForTimeout(500); await p.click('#iAi'); await p.waitForTimeout(300);
  const aiMsg = await p.textContent('#aiMsg');
  assert.ok(/コピー/.test(aiMsg), aiMsg);
  await p.click('.sheet [data-act="ok"]'); await p.waitForTimeout(500);
  console.log('ok: コピーボタン →', aiMsg);

  const msg1 = await importText(fx('ai-output.json'));
  assert.equal(msg1, '13件を追加して取り込みました');
  const got = await p.evaluate(() => S.reminders.map(r => ({ title: r.title, due: r.due, desc: r.rule ? describeRule(r.rule) : '', list: r.list, nag: r.nag })));
  const due = Object.fromEntries(got.map(r => [r.title, r.due]));
  assert.deepEqual(due, {
    '燃えるゴミを出す': '2026-10-27T07:30',
    '歯医者': '2026-10-24T15:00',
    '家賃を振り込む': '2026-11-25T09:00', // 10/23 9:00 は過ぎている
    '資源ごみを出す': '2026-10-28T08:00',
    '定例ミーティング': '2026-11-10T10:00',
    '薬を飲む': '2026-10-23T22:00',
    '出社': '2026-10-26T08:00',
    'エアコンのフィルター掃除': '2027-01-23T09:00',
    '地域チェック': '2026-11-03T09:00',
    'ベランダの水やり': '2026-10-24T07:00',
    '水分補給': '2026-10-23T14:20',
    '母の誕生日': '2027-03-10T09:00',
    '経費精算': '2026-10-31T18:00',
  });
  assert.equal(got.find(r => r.title === '定例ミーティング').list, 'work');
  for (const r of got) console.log('  ', r.title.padEnd(14, '　'), r.due, r.desc);
  // 繰り返しは完了すると次の回へ進む（隔週は2週間後）
  const next = await p.evaluate(() => { const r = S.reminders.find(x => x.title === '資源ごみを出す'); return fmtLocal(nextOnComplete(r, new Date())); });
  assert.equal(next, '2026-11-11T08:00');
  // 一覧に出る
  await p.click('[data-smart="all"]'); await p.waitForTimeout(600);
  const listText = await p.textContent('#scroll');
  for (const t of ['燃えるゴミを出す', '歯医者', '地域チェック', '経費精算']) assert.ok(listText.includes(t), t + ' が一覧にない');
  await p.click('#backBtn'); await p.waitForTimeout(600);
  console.log('ok: 13件を取り込み、最初の通知日時がルールどおり');

  // 書き方が揺れた JSON（説明文つきの返事まるごと・時刻 7:30・日付だけ・配列でない曜日）
  const msg2 = await importText(fx('ai-output-loose.md'));
  assert.equal(msg2, '3件を追加して取り込みました');
  const loose = await p.evaluate(() => S.reminders.slice(-3).map(r => ({ due: r.due, times: r.rule && r.rule.times, byDay: r.rule && r.rule.byDay, nag: r.nag })));
  assert.deepEqual(loose, [
    { due: '2026-10-27T07:30', times: ['07:30'], byDay: [2], nag: null },
    { due: '2026-10-25T09:00', times: null, byDay: null, nag: null },
    { due: '2026-10-23T20:00', times: ['08:00', '20:00'], byDay: undefined, nag: { every: 10 } },
  ]);
  console.log('ok: 書き方の揺れをそろえて取り込める');

  // 読めないものは日本語のエラー
  const bad = await importText(JSON.stringify({ reminders: [{ title: 'x', due: '明日の朝' }] }));
  assert.match(bad, /1件目の due "明日の朝" が読めません/);
  console.log('ok: エラー →', bad);

  assert.deepEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
