// PWA の画面と Service Worker を wrangler dev 上で確かめる（Chromium）
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); // 新しいヘッドレスでないと通知が出せない
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const syncs = []; p.on('request', r => { if (r.url().endsWith('/api/sync')) syncs.push(JSON.parse(r.postData())); });
  // 購読を偽装（ヘッドレスの Chromium は実際のプッシュサービスに登録できないため）
  await p.addInitScript(() => {
    const fake = { endpoint: 'http://127.0.0.1:9911/push/e2e', keys: { p256dh: 'BOr9pX5Uop8ZNOdVD3XWv8m8TS4LdlhJRLkFzzlUmSQ2xsrHs2gN6hMZ71uqX9_mrxjJQV0cqgyN7FLKeAVoIlw', auth: 'c2VjcmV0c2VjcmV0c2VjcmV0' } };
    PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakeSub') ? { ...fake, toJSON: () => fake, unsubscribe: async () => { localStorage.removeItem('fakeSub'); return true; } } : null; };
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted';
    PushManager.prototype.subscribe = async function () { localStorage.setItem('fakeSub', '1'); return this.getSubscription(); };
  });
  await p.goto(BASE + '/?demo'); await p.waitForTimeout(1500);
  const swOk = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  assert.ok(swOk, 'Service Worker が登録されている');
  const st = await p.evaluate(() => RimainCore.get('state').then(s => s && s.reminders.length));
  assert.ok(st > 5, 'IndexedDB に状態が入っている');
  assert.equal(syncs.length, 0, '購読前は送らない');

  // 設定 → 通知をオン
  await p.click('#dataBtn'); await p.waitForTimeout(300);
  await p.locator('#pushBox').scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + '/pwa-push-off.png' });
  await p.click('#pOn'); await p.waitForTimeout(1500);
  assert.equal(syncs.length, 1, 'オンにすると予定を送る');
  assert.ok(syncs[0].times.length > 5 && syncs[0].times.every(t => t > Date.now() - 5000));
  assert.ok(!JSON.stringify(syncs[0]).includes('ゴミ'), '内容は送らない');
  await p.locator('#pushBox').scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + '/pwa-push-on.png' });
  await p.click('#sheet [data-act="ok"]'); await p.waitForTimeout(200);

  // 1件登録すると、その時刻が増えて送られる
  await p.evaluate(() => { S.settings = { ...(S.settings || {}), quickAdd: true }; save(); });
  await p.waitForTimeout(1200);
  const before = syncs.length;
  await p.fill('#quick', '2分後 E2Eテスト'); await p.click('#sendBtn'); await p.waitForTimeout(1500);
  assert.ok(syncs.length > before, '登録後に同期される');
  const r = await p.evaluate(() => { const x = S.reminders.find(x => x.title.includes('E2E')); return x && { ...x, at: +parseLocal(x.due) }; });
  assert.ok(r, '登録されている');
  const at = r.at;
  assert.ok(syncs[syncs.length - 1].times.includes(at), '新しい時刻が含まれる');

  // Service Worker にプッシュを届ける（時刻だけのデータ）→ 端末内のデータから通知を作る
  await p.evaluate(id => { const x = S.reminders.find(y => y.id === id); x.due = fmtLocal(new Date(Date.now() - 30000)); x.url = 'https://example.com/e2e'; save(); }, r.id);
  await p.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('ServiceWorker.enable');
  const regs = await new Promise(res => { cdp.on('ServiceWorker.workerRegistrationUpdated', e => e.registrations.length && res(e.registrations)); });
  const due = await p.evaluate(id => +parseLocal(S.reminders.find(y => y.id === id).due), r.id);
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regs[0].registrationId, data: JSON.stringify({ at: due, n: 1 }) });
  await p.waitForTimeout(800);
  let ns = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ title: n.title, body: n.body, data: n.data })));
  console.log(ns);
  assert.ok(ns.some(n => n.title === 'E2Eテスト' && n.data.url === 'https://example.com/e2e'), '通知のタイトルは端末内のデータから');
  // 同じプッシュがもう一度来ても同じ回は出さない（汎用の通知になる）
  await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close()));
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regs[0].registrationId, data: JSON.stringify({ at: due, n: 1 }) });
  await p.waitForTimeout(800);
  ns = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title));
  assert.deepEqual(ns, ['RE:main']);
  // テスト通知
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regs[0].registrationId, data: JSON.stringify({ test: true }) });
  await p.waitForTimeout(500);
  ns = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title));
  assert.ok(ns.includes('RE:main（テスト）'));

  // 開き直すと、端末の通知で出した回はバナーに重ねない
  await p.reload(); await p.waitForTimeout(1500);
  assert.equal(await p.locator('#banner').isHidden(), true, 'バナーは出ない');
  const ln = await p.evaluate(id => S.reminders.find(y => y.id === id).lastNotified, r.id);
  assert.ok(ln, 'lastNotified が反映される');

  // 通知タップ → 操作画面（?act=）
  await p.goto(BASE + '/?act=' + r.id); await p.waitForTimeout(1200);
  assert.ok(await p.locator('.act-sheet').isVisible(), '操作画面が開く');
  assert.equal(new URL(p.url()).search, '', 'URL の act は消える');
  await p.screenshot({ path: OUT + '/pwa-act-light.png' });
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/pwa-act-dark.png' });
  await p.emulateMedia({ colorScheme: 'light' });
  const n0 = syncs.length;
  await p.click('[data-a="10"]'); await p.waitForTimeout(1500);
  const r2 = await p.evaluate(id => S.reminders.find(y => y.id === id), r.id);
  const exp = new Date(); exp.setSeconds(0, 0); exp.setMinutes(exp.getMinutes() + 10);
  assert.equal(r2.snoozeUntil, (await p.evaluate(d => fmtLocal(new Date(d)), +exp)));
  assert.ok(syncs.length > n0 && syncs[syncs.length - 1].times.includes(+exp), 'スヌーズ後の時刻が送られる');

  // グループの項目の操作画面
  const g = await p.evaluate(() => S.reminders.find(x => x.kind === 'group').id);
  await p.evaluate(gid => window.rimainOpenAct(gid, '1'), g); await p.waitForTimeout(300);
  assert.match(await p.locator('.act-title').textContent(), /東京/);
  await p.screenshot({ path: OUT + '/pwa-act-group.png' });
  await p.click('[data-a="done"]'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(gid => S.reminders.find(x => x.id === gid).steps[1].done, g));

  // オフ
  await p.click('#dataBtn'); await p.waitForTimeout(300);
  await p.click('#pOff'); await p.waitForTimeout(800);
  assert.match(await p.locator('#pushBox').textContent(), /オフ/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errs.filter(e => !/9911|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)), []);
  console.log('pwa ok');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
