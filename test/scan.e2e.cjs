// 写真・文章から期日を探して登録する流れを確かめる（文字の読み取りは端末内の tesseract.js）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:8787', OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch();
  // 1) テスト用のチラシ画像を作る
  const pg = await b.newPage({ viewport: { width: 600, height: 800 } });
  await pg.setContent(`<div style="font-family:'WenQuanYi Zen Hei';padding:40px;background:#fffaf0;color:#222;width:520px">
    <h1 style="font-size:44px;margin:0 0 20px">秋の町内清掃</h1>
    <p style="font-size:30px;line-height:1.7;margin:0">日時 11月8日(日) 午前9:00〜11:00<br>集合 第二公民館前<br>持ち物 軍手・タオル<br><b>申込締切 10月31日(土)</b></p></div>`);
  await pg.screenshot({ path: OUT + '/flyer.png', fullPage: true }); await pg.close();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('scanBtn').click()); await p.waitForTimeout(500);
  
  // 2) 文章の貼り付け
  await p.fill('#scText', '冬のアコースティックライブ 2026\n一般発売：2026年11月1日(日)10:00〜\nお支払いは11/4(水)23:59まで\nhttps://ticket.example.jp/e/1');
  await p.waitForTimeout(500);
  
  assert.equal(await p.locator('.sc-c').count(), 2);
  assert.equal(await p.locator('.sc-c.on').count(), 2);
  const before = await p.evaluate(() => S.reminders.length);
  await p.tap('#scGo'); await p.waitForTimeout(600);
  const added = await p.evaluate(n => S.reminders.slice(n).map(r => [r.title, r.due, r.url]), before);
  console.log(added); assert.equal(added.length, 2); assert.equal(added[0][2], 'https://ticket.example.jp/e/1');
  // 3) 写真
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('scanBtn').click()); await p.waitForTimeout(500);
  const t0 = Date.now();
  await p.setInputFiles('#scFile', OUT + '/flyer.png');
  await p.waitForFunction(() => /読み取りました|見つかりません|読み取れません/.test(document.getElementById('scSt')?.textContent || ''), null, { timeout: 120000 });
  console.log('ocr ms', Date.now() - t0, '|', await p.textContent('#scSt'));
  console.log('text:', JSON.stringify(await p.inputValue('#scText')));
  await p.waitForTimeout(400);
  
  const cands = await p.$$eval('.sc-c', els => els.map(e => e.querySelector('input').value + ' | ' + e.querySelector('.wh').textContent));
  console.log(cands);
  assert.ok(cands.some(c => c.includes('11/8')), '11/8 を拾う');
  // 1件だけ選ぶと確認画面へ
  await p.tap('.sc-c.on .ck'); await p.waitForTimeout(200);
  if (await p.locator('.sc-c.on').count() === 1) { await p.tap('#scGo'); await p.waitForTimeout(800); console.log('detail due:', await p.inputValue('#dDue')); }
  
  console.log('errors:', errs); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
