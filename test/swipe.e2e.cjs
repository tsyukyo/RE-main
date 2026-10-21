// 一覧の行を右へスワイプすると完了になることを確かめる（タッチ操作, Chromium）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const BASE = process.env.BASE || 'http://127.0.0.1:8787';
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(1200);
  await p.click('[data-smart="all"]').catch(()=>p.click('[data-smart]')); await p.waitForTimeout(600);
  const sel = '.swipe:not(:has(.row.done))';
  const id = await p.$eval(sel, e => e.dataset.sw);
  const box = await p.locator(`.swipe[data-sw="${id}"]`).boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + 60;
  // タッチ相当のポインタ操作（CDP で touch を送る）
  const cdp = await ctx.newCDPSession(p);
  const tp = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await tp('touchStart', x0);
  for (let i = 1; i <= 12; i++) { await tp('touchMove', x0 + i * 18); await p.waitForTimeout(16); }
  await tp('touchEnd');
  await p.waitForTimeout(1800);
  const r = await p.evaluate(id => { const r = S.reminders.find(x => x.id === id); return { title: r.title, done: r.done, due: r.due, rule: !!r.rule }; }, id);
  require('node:assert/strict').ok(r.done, '右スワイプで完了になる: ' + JSON.stringify(r)); console.log('ok: 右スワイプで完了');
  await b.close();
})();
