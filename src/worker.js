// りまいん 通知サーバー
// サーバーが知るのは「プッシュの宛先」と「鳴らす時刻（UTC ミリ秒）」だけ。リマインダーの内容は受け取らない
import { DurableObject } from 'cloudflare:workers';
import { genVapidKeys, sendPush } from './webpush.js';

const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const MAX_TIMES = 300;
const MAX_AHEAD = 400 * 86400000;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function checkSub(sub, env) {
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') throw bad('購読情報がありません');
  let u; try { u = new URL(sub.endpoint); } catch (e) { throw bad('宛先が不正です'); }
  const devAny = env.ALLOW_ANY_ENDPOINT === '1';
  if (!devAny && (u.protocol !== 'https:' || !PUSH_HOSTS.some(re => re.test(u.hostname)))) throw bad('対応していない宛先です');
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}
function checkTimes(times) {
  if (!Array.isArray(times)) throw bad('times がありません');
  const now = Date.now();
  const out = [...new Set(times.map(Number).filter(t => Number.isFinite(t) && t > now - 60000 && t < now + MAX_AHEAD).map(t => Math.round(t)))];
  return out.sort((a, b) => a - b).slice(0, MAX_TIMES);
}
async function sha256(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (url.pathname === '/api/vapid' && req.method === 'GET') return json({ publicKey: await keysStub(env).publicKey() });
      if (req.method !== 'POST') throw bad('method', 405);
      const text = await req.text();
      if (text.length > 64 * 1024) throw bad('大きすぎます', 413);
      let body; try { body = JSON.parse(text); } catch (e) { throw bad('JSON が不正です'); }
      const sub = checkSub(body.sub, env);
      const stub = env.SCHED.get(env.SCHED.idFromName(await sha256(sub.endpoint)));
      if (url.pathname === '/api/sync') return json(await stub.sync(sub, checkTimes(body.times), url.origin));
      if (url.pathname === '/api/test') return json(await stub.test(sub, url.origin));
      if (url.pathname === '/api/clear') return json(await stub.clear());
      throw bad('not found', 404);
    } catch (e) {
      return json({ error: e.message }, e.status || 500);
    }
  },
};
const keysStub = env => env.KEYS.get(env.KEYS.idFromName('vapid'));

// VAPID 鍵をひとつだけ持つ。初回アクセス時に作って保存する（秘密鍵を手で設定しなくて済む）
export class Keys extends DurableObject {
  async keys() {
    let k = await this.ctx.storage.get('vapid');
    if (!k) { k = await genVapidKeys(); await this.ctx.storage.put('vapid', k); }
    return k;
  }
  async publicKey() { return (await this.keys()).publicKey; }
}

// 端末（購読）ごとに1つ。いちばん近い時刻にアラームを掛け、時刻が来たら中身なしに近い通知（時刻だけ）を送る
export class Scheduler extends DurableObject {
  async sync(sub, times, origin) {
    await this.ctx.storage.put({ sub, times, origin });
    await this.arm(times);
    return { ok: true, count: times.length, next: times[0] || null };
  }
  async test(sub, origin) {
    await this.ctx.storage.put({ sub, origin });
    const r = await this.send(sub, origin, { test: true, at: Date.now() });
    return { ok: r.ok, status: r.status, detail: r.text };
  }
  async clear() {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    return { ok: true };
  }
  async arm(times) {
    if (times.length) await this.ctx.storage.setAlarm(Math.max(times[0], Date.now()));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    const st = await this.ctx.storage.get(['sub', 'times', 'origin']);
    const sub = st.get('sub'), times = st.get('times') || [], origin = st.get('origin');
    if (!sub) return;
    const now = Date.now();
    const due = times.filter(t => t <= now + 1500), rest = times.filter(t => t > now + 1500);
    if (due.length) {
      const r = await this.send(sub, origin, { at: due[due.length - 1], n: due.length });
      if (r.status === 404 || r.status === 410) { await this.clear(); return; }
      // 失敗時は例外にして、Cloudflare の自動再試行に任せる
      if (!r.ok) throw new Error(`push failed ${r.status} ${r.text}`);
    }
    await this.ctx.storage.put('times', rest);
    await this.arm(rest);
  }
  async send(sub, origin, data) {
    const keys = await keysStub(this.env).keys();
    return sendPush(sub, keys, origin || 'https://rimain.workers.dev', data);
  }
}
