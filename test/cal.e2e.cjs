// カレンダーで日時を選ぶ流れを確かめる（ホームの入力欄・会話の「いつ」・確認画面の日時欄）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:8787', OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(1000);
  
  // ホーム: カレンダー → 明日 → 18:00 → 毎週 → 完了
  await p.tap('#calBtn'); await p.waitForTimeout(600);
  
  await p.tap('.cal-q [data-q="1"]'); await p.tap('.cal-t [data-t="18:00"]'); await p.tap('.cal-r [data-r="week"]'); await p.waitForTimeout(300);
  
  await p.tap('#calWrap [data-c="ok"]'); await p.waitForTimeout(400);
  const v = await p.inputValue('#quick'); console.log('quick:', v);
  await p.type('#quick', 'ゴミ出し'); await p.waitForTimeout(300);
  
  const pv = await p.textContent('#preview'); console.log('preview:', pv.replace(/\s+/g,' '));
  assert.match(pv, /毎週/);
  // 再度選び直すと置き換わる（今日の時刻は夜に走らせると過ぎていることがあるので明日にする）
  await p.tap('#calBtn'); await p.waitForTimeout(400); await p.tap('.cal-q [data-q="1"]'); await p.tap('.cal-t [data-t="21:30"]'); await p.tap('#calWrap [data-c="ok"]'); await p.waitForTimeout(400);
  console.log('quick2:', await p.inputValue('#quick'));
  await p.fill('#quick', '');
  // ウィザード: カレンダーで選ぶ
  await p.tap('#newBtn'); await p.waitForTimeout(500);
  await p.fill('#wIn', '歯医者'); await p.tap('#wNext'); await p.waitForTimeout(500);
  
  await p.tap('[data-ans="__cal"]'); await p.waitForTimeout(500);
  // 来月の15日
  await p.tap('.cal-mh [data-nav="1"]'); await p.waitForTimeout(200);
  const m = await p.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 15); return `${d.getFullYear()}-${d.getMonth() + 1}-15`; });
  await p.tap(`.cal-g [data-day="${m}"]`); await p.tap('.cal-t [data-t="9:00"]'); await p.waitForTimeout(200);
  
  await p.tap('#calWrap [data-c="ok"]'); await p.waitForTimeout(700);
  
  const chat = await p.textContent('#wChat'); assert.match(chat, /\/15\(/); 
  await p.tap('[data-ans=""]'); await p.waitForTimeout(1000);
  // 確認画面の日時欄のカレンダーボタン
  
  const before = await p.inputValue('#dDue'); console.log('dDue:', before);
  await p.tap('[data-cal="dDue"]'); await p.waitForTimeout(500);
  await p.tap('.cal-t [data-t="20:00"]'); await p.tap('#calWrap [data-c="ok"]'); await p.waitForTimeout(400);
  const after = await p.inputValue('#dDue'); console.log('dDue after:', after); assert.ok(after.endsWith('T20:00'));
  // 過去の時刻は完了できない（ウィザード経由）
  // 音声: このヘッドレス環境には音声認識がない → 案内が出る
  await p.keyboard.press('Escape');
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
