// wrangler dev（ALLOW_ANY_ENDPOINT=1）に対して、偽のプッシュサービスを立てて通しで確かめる
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { b64u } from '../src/webpush.js';
const ece = createRequire(import.meta.url)('http_ece');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const got = [];
const srv = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks);
    const plain = ece.decrypt(body, { version: 'aes128gcm', privateKey: ua, authSecret: b64u(auth) }).toString();
    got.push({ t: Date.now(), headers: req.headers, data: JSON.parse(plain) });
    res.writeHead(201); res.end();
  });
}).listen(9911);
const sub = { endpoint: 'http://127.0.0.1:9911/push/abc', keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, j: await r.json() }));

const idx = await fetch(BASE + '/');
assert.equal(idx.status, 200); assert.match(await idx.text(), /manifest\.webmanifest/);
const v = await fetch(BASE + '/api/vapid').then(r => r.json());
assert.ok(v.publicKey.length > 80);
const v2 = await fetch(BASE + '/api/vapid').then(r => r.json());
assert.equal(v.publicKey, v2.publicKey, 'VAPID 鍵は一度作ったら変わらない');

const bad = await post('/api/sync', { sub: { endpoint: 'x' }, times: [] });
assert.equal(bad.status, 400);

const t0 = Date.now();
const s = await post('/api/sync', { sub, times: [t0 + 6000, t0 + 3000, t0 + 3000, 'x', t0 - 99999999] });
assert.equal(s.status, 200); assert.equal(s.j.count, 2);
const tr = await post('/api/test', { sub });
assert.equal(tr.status, 200); assert.ok(tr.j.ok, JSON.stringify(tr.j));
await new Promise(r => setTimeout(r, 9000));
console.log(got.map(g => ({ lateMs: g.data.at ? g.t - g.data.at : null, ...g.data, auth: g.headers.authorization.slice(0, 20), enc: g.headers['content-encoding'], ttl: g.headers.ttl })));
assert.equal(got.length, 3);
assert.ok(got[0].data.test);
assert.equal(got[1].data.at, t0 + 3000); assert.equal(got[2].data.at, t0 + 6000);
for (const g of got.slice(1)) assert.ok(g.t - g.data.at < 2500, '遅れが大きすぎる');
// 予定を空にするとアラームが止まる
await post('/api/sync', { sub, times: [Date.now() + 2000] });
await post('/api/sync', { sub, times: [] });
await new Promise(r => setTimeout(r, 3000));
assert.equal(got.length, 3, '取り消した予定は送られない');
console.log('server ok');
srv.close();
