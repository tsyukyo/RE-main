// ホーム画面に追加するアプリ版（PWA）だけで読み込む
// - 保存のたびに端末内の IndexedDB にも書く（Service Worker が通知の文面を作るため）
// - 通知サーバーへ「鳴らす時刻」だけを送る
// - 通知をタップしたときの操作画面
(() => {
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const SIG_KEY = 'rimain.pushSig';
  let reg = null, syncTimer = null, lastSync = null, lastErr = '';

  const u8 = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  async function api(path, body) {
    const r = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `通信エラー（${r.status}）`);
    return j;
  }
  const getSub = async () => (reg ? reg.pushManager.getSubscription() : null);

  // 予定が変わったときだけ送る（同じ内容なら送らない）
  async function sync(force = false) {
    const s = await getSub();
    window.rimainPushOn = !!s;
    if (!s) return null;
    const times = RimainCore.schedule(S);
    const sig = s.endpoint + '|' + times.join(',');
    if (!force && lsGet(SIG_KEY) === sig) return null;
    try {
      const res = await api('sync', { sub: s.toJSON(), times });
      lsSet(SIG_KEY, sig); lastSync = res; lastErr = '';
      return res;
    } catch (e) { lastErr = e.message; throw e; }
  }
  const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync().catch(() => {}), 800); };

  window.rimainOnSave = state => {
    RimainCore.set('state', JSON.parse(JSON.stringify(state))).catch(() => {});
    syncSoon();
  };

  // 端末の通知で出した回は、アプリを開いたときにバナーで重ねて出さない
  async function applyShown() {
    const shown = new Set((await RimainCore.get('shown').catch(() => null)) || []);
    if (!shown.size) return;
    let changed = false;
    for (const f of RimainCore.fires(S)) {
      if (f.nag || !shown.has(f.key)) continue;
      const r = S.reminders.find(x => x.id === f.id); if (!r) continue;
      const k = f.key.slice(f.key.indexOf('@') + 1);
      if (f.step != null) { const st = r.steps[f.step]; if (st && st.lastNotified !== k) { st.lastNotified = k; changed = true; } }
      else if (r.lastNotified !== k) { r.lastNotified = k; r.lastNagAt = fmtLocal(new Date()) + ':' + pad(new Date().getSeconds()); r.nagCount = 0; changed = true; }
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i], r = S.reminders.find(x => x.id === q.id);
      if (!r || q.test || q.act) continue;
      const k = q.step != null ? r.steps[q.step] && r.steps[q.step].lastNotified : r.lastNotified;
      if (k && shown.has(q.step != null ? `${r.id}:${q.step}@${k}` : `${r.id}@${k}`)) queue.splice(i, 1);
    }
    if (changed) save();
    showBanner();
  }

  // ---- 通知をタップしたときの操作画面 ----
  function openAct(id, stepRaw) {
    const r = S.reminders.find(x => x.id === id);
    if (!r) { toast('このリマインダーは見つかりませんでした（削除済みかもしれません）'); return; }
    const step = stepRaw === '' || stepRaw == null ? null : +stepRaw;
    const st = step != null ? r.steps && r.steps[step] : null;
    if (step != null && !st) return;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].id === id && queue[i].step === step) queue.splice(i, 1);
    showBanner();
    const title = st ? st.title : r.title;
    const url = st ? stepUrl(r, st) : r.url;
    const sub = st ? `${r.title}（${step + 1}/${r.steps.length}）` : r.rule ? '↻ ' + describeRule(r.rule) : '';
    const html = sheetHead('通知', '閉じる', '') + `<div class="sheet-b gut act-sheet">
      <div class="act-head"><div class="act-title">${esc(title)}</div>${sub ? `<div class="act-sub">${esc(sub)}</div>` : ''}</div>
      ${url ? `<a class="act-btn pri" href="${esc(url)}" target="_blank" rel="noopener" data-a="open">URL を開く<span>${esc(hostOf(url))}</span></a>` : ''}
      <button class="act-btn ${url ? '' : 'pri'}" data-a="done">完了</button>
      <div class="act-row"><button class="act-btn" data-a="10">10分後</button><button class="act-btn" data-a="60">1時間後</button><button class="act-btn" data-a="tomorrow">明日の朝</button></div>
    </div>`;
    openSheet(html, sh => {
      sh.querySelector('[data-act="ok"]').onclick = closeSheet;
      sh.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'open') { setTimeout(closeSheet, 50); return; }
        let msg = '';
        if (a === 'done') msg = st ? completeStep(r, step) : `「${r.title}」${completeRem(r)}`;
        else {
          const d = new Date(); d.setSeconds(0, 0);
          if (a === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(8, 0); } else d.setMinutes(d.getMinutes() + +a);
          if (st) { st.snoozeUntil = fmtLocal(d); st.lastNotified = null; }
          else { r.snoozeUntil = fmtLocal(d); r.lastNotified = null; r.lastNagAt = null; }
          save(); msg = `${fmtDue(d)} にもう一度お知らせします`;
        }
        closeSheet(); render(); toast(esc(msg));
      }));
    });
  }
  const css = document.createElement('style');
  css.textContent = `.act-sheet { gap: 12px; } .act-head { padding: 4px 4px 8px; } .act-title { font-size: 22px; font-weight: 700; line-height: 1.3; word-break: break-word; }
    .act-sub { color: var(--fg2); font-size: 15px; margin-top: 4px; } .act-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .act-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 54px; border-radius: 12px; background: var(--card); color: var(--blue); font-weight: 600; text-decoration: none; text-align: center; }
    .act-btn span { font-size: 12px; font-weight: 400; opacity: .85; } .act-btn.pri { background: var(--blue); color: #fff; }
    .push-note { font-size: 13px; color: var(--fg2); padding: 0 16px 12px; line-height: 1.5; }`;
  document.head.appendChild(css);

  // ---- 設定画面の「通知」欄 ----
  window.rimainPushUI = async box => {
    const draw = async () => {
      const perm = canPush ? Notification.permission : 'unsupported';
      const s = canPush && reg ? await getSub().catch(() => null) : null;
      const next = RimainCore.schedule(S)[0];
      let body, foot;
      if (!canPush && isIOS && !standalone) {
        body = `<div class="f"><span class="lab">閉じている間の通知</span><span class="val">ホーム画面から開くと使えます</span></div>`;
        foot = 'Safari の共有ボタン →「ホーム画面に追加」で追加し、ホーム画面のRE:mainから開いてください（iOS 16.4 以降）。';
      } else if (!canPush) {
        body = `<div class="f"><span class="lab">閉じている間の通知</span><span class="val">この環境では使えません</span></div>`;
        foot = 'アプリを開いている間は、画面上部のバナーでお知らせします。';
      } else if (perm === 'denied') {
        body = `<div class="f"><span class="lab">閉じている間の通知</span><span class="val">拒否されています</span></div>`;
        foot = isIOS ? '設定アプリ →「通知」→「RE:main」で通知を許可してから、もう一度開いてください。' : 'ブラウザのサイト設定で通知を許可してください。';
      } else if (!s) {
        body = `<div class="f"><span class="lab">閉じている間の通知</span><span class="val">オフ</span></div><button class="btn" id="pOn">オンにする</button><div class="msg" id="pMsg"></div>`;
        foot = 'オンにすると、アプリを閉じていても時刻に通知が届きます。サーバーへ送るのは通知の時刻だけで、内容や URL は送りません。';
      } else {
        body = `<div class="f"><span class="lab">閉じている間の通知</span><span class="val">オン</span></div>
          <div class="f"><span class="lab">次の通知</span><span class="val">${next ? esc(fmtDue(new Date(next))) : 'なし'}</span></div>
          <div class="f"><label for="pDirect">タップで URL を直接開く</label><input type="checkbox" class="switch" id="pDirect" ${S.settings && S.settings.tapOpensUrl ? 'checked' : ''}></div>
          <button class="btn" id="pTest">テスト通知を送る</button><button class="btn" id="pResync">予定を送り直す</button><button class="btn danger" id="pOff">オフにする</button><div class="msg ${lastErr ? 'err' : ''}" id="pMsg">${lastErr ? esc('前回の同期に失敗: ' + lastErr) : ''}</div>`;
        foot = 'テスト通知はすぐ届きます。アプリを閉じて（ホーム画面に戻って）確かめてください。iPhone の通知にはボタンが付かないため、タップで開く画面で完了・スヌーズします。「タップで URL を直接開く」をオンにすると、URL があるときは操作画面を出さずに開きます。';
      }
      box.innerHTML = `<div class="fgroup-h">通知</div><div class="fgroup">${body}</div><div class="fgroup-f">${foot}</div>`;
      const g = id => box.querySelector('#' + id);
      const say = (t, cls = '') => { const m = g('pMsg'); if (m) { m.className = 'msg ' + cls; m.textContent = t; } };
      if (g('pOn')) g('pOn').onclick = async () => {
        try {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { await draw(); return; }
          say('設定しています…');
          const { publicKey } = await api('vapid');
          await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(publicKey) });
          await sync(true); await draw(); say('オンにしました。「テスト通知を送る」で確かめられます', 'ok');
        } catch (e) { say('オンにできませんでした: ' + e.message, 'err'); }
      };
      if (g('pTest')) g('pTest').onclick = async () => {
        try { const s2 = await getSub(); const r = await api('test', { sub: s2.toJSON() }); say(r.ok ? '送りました。数秒で届きます' : `送信に失敗しました（${r.status}）`, r.ok ? 'ok' : 'err'); }
        catch (e) { say('送れませんでした: ' + e.message, 'err'); }
      };
      if (g('pResync')) g('pResync').onclick = async () => {
        try { const r = await sync(true); say(`${r ? r.count : 0}件の予定を送りました`, 'ok'); } catch (e) { say('送れませんでした: ' + e.message, 'err'); }
      };
      if (g('pOff')) g('pOff').onclick = async () => {
        try { const s2 = await getSub(); if (s2) { await api('clear', { sub: s2.toJSON() }).catch(() => {}); await s2.unsubscribe(); } lsSet(SIG_KEY, null); window.rimainPushOn = false; await draw(); }
        catch (e) { say('オフにできませんでした: ' + e.message, 'err'); }
      };
      if (g('pDirect')) g('pDirect').onchange = e => { S.settings = { ...(S.settings || {}), tapOpensUrl: e.target.checked }; save(); };
    };
    draw();
  };

  // ---- 起動 ----
  RimainCore.set('state', JSON.parse(JSON.stringify(S))).catch(() => {});
  const p = new URLSearchParams(location.search);
  if (p.get('act')) { const id = p.get('act'), st = p.get('step'); history.replaceState(null, '', location.pathname); setTimeout(() => openAct(id, st), 0); }
  applyShown();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(r => { reg = r; return sync(); }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'rimain-act') openAct(e.data.id, e.data.step); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { applyShown(); sync().catch(() => {}); } });
  window.addEventListener('online', () => sync().catch(() => {}));
  window.rimainOpenAct = openAct;
})();
