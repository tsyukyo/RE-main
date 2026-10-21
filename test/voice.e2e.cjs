// 音声入力を確かめる（偽の音声認識で、入力欄への書き込みと使えないときの案内を見る）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 偽の音声認識: start すると途中結果→確定結果を返して終わる
  await p.addInitScript(() => {
    if (location.search.includes('nosr')) { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; window.webkitSpeechRecognition = undefined; return; }
    class FakeSR { start() { window.__srStarted = true; const r = (t, f) => { const a = [{ transcript: t }]; a.isFinal = f; return a; };
      setTimeout(() => this.onresult({ resultIndex: 0, results: [r('明日の10時に', false)] }), 100);
      setTimeout(() => this.onresult({ resultIndex: 0, results: [r('明日の10時に歯医者', true)] }), 300);
      setTimeout(() => this.onend(), 400); } stop() { this.onend(); } }
    window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = undefined;
  });
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(800);
  await p.tap('[data-mic="quick"]'); await p.waitForTimeout(150);
  assert.ok(await p.$eval('[data-mic="quick"]', e => e.classList.contains('rec')), '聞き取り中の表示');
  
  await p.waitForTimeout(500);
  const v = await p.inputValue('#quick'); console.log('quick:', v); assert.equal(v, '明日の10時に歯医者');
  const pv = (await p.textContent('#preview')).replace(/\s+/g, ' '); console.log('preview:', pv); assert.match(pv, /歯医者/);
  assert.ok(!(await p.$eval('[data-mic="quick"]', e => e.classList.contains('rec'))));
  
  // 使えない環境
  await p.goto(BASE + '/?demo&nosr'); await p.waitForTimeout(800);
  await p.tap('[data-mic="quick"]'); await p.waitForTimeout(300);
  const t = await p.textContent('#toast'); console.log('toast:', t); assert.match(t, /キーボードのマイク/);
  // ウィザード内のマイク
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('newBtn').click()); await p.waitForTimeout(600);  await p.tap('[data-mic="wIn"]'); await p.waitForTimeout(600);
  console.log('wIn:', await p.inputValue('#wIn'));
  console.log('errors:', errs); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
