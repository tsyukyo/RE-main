// アプリ画面と Service Worker の両方で使う処理（engine.js の後に読み込む）
// - 端末内の保存（IndexedDB）: Service Worker は localStorage を読めないため、同じデータをここにも置く
// - 通知の予定: いつ鳴るか（サーバーへ送る時刻）と、そのとき出す通知の中身
const RimainCore = (() => {
  // IndexedDB はキーと値を入れるだけの1つの保管庫（'state' = アプリの全データ、'shown' = 出した通知の key）
  const DB = 'rimain', STORE = 'kv';
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result);
    q.onerror = () => { dbp = null; rej(q.error); };
  }));
  // 1回の読み書きを1トランザクションで行い、完了したら結果を返す
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode); const r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
  }));
  const get = k => tx('readonly', s => s.get(k));
  const set = (k, v) => tx('readwrite', s => s.put(v, k));

  // グループ項目の URL（アプリ側の stepUrl と同じ決め方。保存時に整えてあるので normUrl は通さない）
  const groupUrl = (r, st) => (r.urlMode === 'each' ? st.url || null : r.urlMode === 'same' ? r.url || null : null);
  const NAG_MAX = 24; // 「確実に通知」の再通知は最大 24 回まで先に予約する

  // 通知の予定をすべて並べる。key は「この回の通知」を一意に表す（同じ回を二度出さないため）
  function fires(S) {
    const out = [];
    for (const r of (S && S.reminders) || []) {
      if (r.done) continue;
      if (r.kind === 'group') {
        const ts = stepTimes(r);
        r.steps.forEach((st, i) => {
          if (st.done) return;
          const t = stepAt(st, ts[i]);
          if (!t) return;
          // 本文は「グループ名（2/4） ・ 次: 東京 9:30」
          const nx = r.steps[i + 1];
          out.push({ key: `${r.id}:${i}@${fmtLocal(t)}`, at: +t, id: r.id, step: i, title: st.title, url: groupUrl(r, st),
            body: `${r.title}（${i + 1}/${r.steps.length}）${nx && ts[i + 1] ? ` ・ 次: ${nx.title} ${ts[i + 1].getHours()}:${pad(ts[i + 1].getMinutes())}` : ''}` });
        });
        continue;
      }
      // 単発・繰り返し: 次回（スヌーズ中ならスヌーズ先）と、「確実に通知」の再通知
      const base = r.snoozeUntil || r.due, t = parseLocal(base);
      if (!t) continue;
      const body = r.rule ? '↻ ' + describeRule(r.rule) : (r.notes || '').slice(0, 80);
      out.push({ key: `${r.id}@${base}`, at: +t, id: r.id, step: null, title: r.title, url: r.url || null, body });
      if (r.nag && r.nag.every > 0) for (let k = 1; k <= NAG_MAX; k++) {
        out.push({ key: `${r.id}@${base}#${k}`, at: +t + k * r.nag.every * 60000, id: r.id, step: null, title: r.title, url: r.url || null, body: `完了するまで${r.nag.every}分ごとにお知らせします（${k}回目）`, nag: k });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  // サーバーに渡す時刻（未来のものだけ）
  const schedule = (S, now = Date.now()) => [...new Set(fires(S).filter(f => f.at > now).map(f => f.at))].slice(0, 300);

  return { get, set, fires, schedule };
})();
