// 暗号化と VAPID 署名を、別実装（http_ece と node:crypto）で検証する
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { encryptPayload, genVapidKeys, vapidAuth, b64u, ub64u } from '../src/webpush.js';
const ece = createRequire(import.meta.url)('http_ece');

// 受信側（ブラウザ役）の鍵
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const subKeys = { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) };

const msg = JSON.stringify({ at: 1760774400000, n: 2, note: 'りまいん' });
const body = await encryptPayload(subKeys, msg);
const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, dh: undefined, authSecret: b64u(auth) });
assert.equal(plain.toString('utf8'), msg);
console.log('ok decrypt', body.length, 'bytes');

const keys = await genVapidKeys();
assert.equal(ub64u(keys.publicKey).length, 65);
const h = await vapidAuth('https://web.push.apple.com/QGuQyavXutnMH', keys, 'https://rimain.example.workers.dev');
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
assert.ok(m);
const claims = JSON.parse(Buffer.from(ub64u(m[2])).toString());
assert.equal(claims.aud, 'https://web.push.apple.com');
assert.ok(claims.exp > Date.now() / 1000);
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(ub64u(keys.publicKey).slice(1, 33)), y: b64u(ub64u(keys.publicKey).slice(33)) }, format: 'jwk' });
assert.ok(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(ub64u(m[3]))));
console.log('ok vapid', claims);
