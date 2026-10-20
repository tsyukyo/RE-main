// URL のページを読む流れを確かめる（/api/page はテスト用のページを返すように差し替える）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:8787', OUT = process.env.OUT || '.';
const iconv = s => new TextEncoder().encode(s); // UTF-8 のページ
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], asked = []; p.on('pageerror', e => errs.push(e.message));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>冬のアコースティックライブ 2026 | チケット販売サイト</title>
    <meta property="og:title" content="冬のアコースティックライブ 2026">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"MusicEvent","name":"冬のアコースティックライブ 2026","startDate":"2026-12-13T17:00:00+09:00"}</script>
    <script>document.title='x'</script><style>p{color:red}</style></head>
    <body><nav>ホーム 11月30日 メニュー</nav><h1>冬のアコースティックライブ 2026</h1>
    <table><tr><th>一般発売</th><td>2026年11月1日(日)10:00〜</td></tr><tr><th>お支払い期限</th><td>11/4(水)23:59まで</td></tr></table></body></html>`;
  await p.route('**/api/page', async r => { asked.push(r.request().postDataJSON().url); await r.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'x-page-type': 'text/html; charset=utf-8', 'x-page-url': 'https://ticket.example.jp/e/1' }, body: Buffer.from(iconv(html)) }); });
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(800);
  // 設定がオフのときは案内だけ
  await p.evaluate(() => document.getElementById('scanBtn').click()); await p.waitForTimeout(400);
  await p.fill('#scText', 'https://ticket.example.jp/e/1'); await p.waitForTimeout(500);
  assert.equal(await p.$('#scPage'), null);
  assert.match(await p.textContent('#scOut'), /設定の「URL のページを読む」/);
  // 設定でオンにする
  await p.evaluate(() => { S.settings = { ...(S.settings || {}), pageFetch: true }; SC = null; closeSheet(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('scanBtn').click()); await p.waitForTimeout(400);
  await p.fill('#scText', 'https://ticket.example.jp/e/1'); await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('scPage').click());
  await p.waitForFunction(() => document.querySelectorAll('.sc-c').length > 0, null, { timeout: 5000 });
  const text = await p.inputValue('#scText');
  console.log(JSON.stringify(text));
  const got = await p.$$eval('.sc-c', els => els.map(e => e.querySelector('input').value + ' | ' + e.querySelector('.wh').textContent));
  console.log(got);
  assert.deepEqual(asked, ['https://ticket.example.jp/e/1']);
  assert.ok(text.startsWith('https://ticket.example.jp/e/1\n'));
  assert.ok(!/document\.title|color:red|メニュー/.test(text));
  // タイトルはどれもページのタイトル（末尾のサイト名は外す）
  assert.ok(got.every(g => g.startsWith('冬のアコースティックライブ 2026 | ')), 'ページのタイトル');
  assert.ok(got.some(g => /12\/13.*17:00/.test(g)), 'JSON-LD の公演日');
  assert.ok(got.some(g => /11\/1.*10:00/.test(g)));
  assert.ok(got.some(g => /11\/4.*23:59/.test(g)));
  await p.screenshot({ path: OUT + '/page.png' });
  // 失敗したときはメッセージを出す
  await p.unroute('**/api/page');
  await p.route('**/api/page', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'ページを開けませんでした（404）' }) }));
  await p.evaluate(() => document.getElementById('scPage').click()); await p.waitForTimeout(500);
  assert.match(await p.textContent('#scOut'), /ページを開けませんでした（404）/);
  console.log('errors:', errs); assert.deepEqual(errs, []);
  await b.close(); console.log('ok: page');
})();
