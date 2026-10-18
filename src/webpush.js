// Web Push の送信に必要な処理（VAPID 署名と RFC 8291 の aes128gcm 暗号化）。WebCrypto だけで実装する
const te = new TextEncoder();
const subtle = crypto.subtle;

export const b64u = buf => {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const ub64u = str => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// VAPID 鍵（P-256）を作る。公開鍵は applicationServerKey としてブラウザに渡す
export async function genVapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  const pub = await subtle.exportKey('raw', kp.publicKey);
  return { publicKey: b64u(pub), jwk };
}

// Authorization ヘッダー（RFC 8292）。aud は送信先プッシュサービスのオリジン
export async function vapidAuth(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt, ikm, info, len) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// 本文を購読者の鍵（p256dh, auth）で暗号化する（RFC 8291, 1レコード）
export async function encryptPayload(subKeys, text) {
  const uaPub = ub64u(subKeys.p256dh), auth = ub64u(subKeys.auth);
  if (uaPub.length !== 65 || auth.length < 16) throw Object.assign(new Error('購読情報の鍵が不正です'), { status: 400 });
  const as = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await subtle.exportKey('raw', as.publicKey));
  const uaKey = await subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(te.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // レコードサイズ 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// 1件送る。戻り値の status が 404/410 なら購読は失効している
export async function sendPush(sub, keys, subject, data, { ttl = 86400 } = {}) {
  const body = await encryptPayload(sub.keys, JSON.stringify(data));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high',
    },
    body,
  });
  return { status: res.status, ok: res.ok, text: res.ok ? '' : (await res.text()).slice(0, 300) };
}
