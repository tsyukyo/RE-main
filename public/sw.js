// RE:main Service Worker
// プッシュには「時刻」しか入っていない。通知の文面は端末内のデータ（IndexedDB）から作る
importScripts('engine.js', 'core.js');
const CACHE = 'rimain-v1';
// 電波がなくても開けるよう、最初に保存しておくファイル
const ASSETS = ['./', 'index.html', 'engine.js', 'core.js', 'pwa.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 画面はネット優先（更新をすぐ反映）、つながらないときは保存済みのものを使う
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

// プッシュを受けたとき: data.at（鳴らす時刻）の前後で、まだ出していない回の通知を出す
async function showDue(data) {
  if (data.test) {
    return self.registration.showNotification('RE:main（テスト）', { body: '閉じている間の通知が届きました。タップするとアプリが開きます。', tag: 'rimain-test', icon: 'icon-192.png', data: { test: true } });
  }
  const S = await RimainCore.get('state').catch(() => null);
  const shown = (await RimainCore.get('shown').catch(() => null)) || [];
  const now = Date.now(), at = +data.at || now;
  // 予定時刻を少し過ぎたもの（届くのが遅れた分を含む）で、まだ出していない回
  const due = RimainCore.fires(S).filter(f => f.at <= Math.max(now, at) + 60000 && f.at >= at - 6 * 3600000 && !shown.includes(f.key));
  // 同じリマインダーの再通知が溜まっていたら、いちばん新しい回だけ出す
  const latest = new Map();
  for (const f of due) latest.set(f.id + ':' + f.step, f);
  const list = [...latest.values()];
  if (!list.length) {
    // iPhone では、プッシュを受けたら必ず通知を出す決まりがある
    return self.registration.showNotification('RE:main', { body: 'リマインダーの時刻です。タップして確認してください。', tag: 'rimain-generic', icon: 'icon-192.png', data: {} });
  }
  await RimainCore.set('shown', [...shown, ...due.map(f => f.key)].slice(-500));
  await Promise.all(list.map(f => self.registration.showNotification(f.title || 'リマインダー', {
    body: [f.body, f.url ? 'タップで開く: ' + f.url.replace(/^https?:\/\//, '') : ''].filter(Boolean).join('\n'),
    tag: f.id + (f.step != null ? ':' + f.step : ''),
    icon: 'icon-192.png',
    data: { id: f.id, step: f.step, url: f.url, key: f.key },
  })));
}

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(showDue(data));
});

// 通知をタップ: 小さな操作画面（URL を開く・完了・スヌーズ）を出す。設定で「URL を直接開く」にもできる
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const S = await RimainCore.get('state').catch(() => null);
    const direct = S && S.settings && S.settings.tapOpensUrl;
    if (direct && d.url) return self.clients.openWindow(d.url);
    const target = new URL(d.id ? `./?act=${encodeURIComponent(d.id)}${d.step != null ? '&step=' + d.step : ''}` : './', self.registration.scope).href;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(c => new URL(c.url).origin === location.origin);
    if (w) {
      await w.focus().catch(() => {});
      if (d.id) w.postMessage({ type: 'rimain-act', id: d.id, step: d.step });
      return;
    }
    return self.clients.openWindow(target);
  })());
});
