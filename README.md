# りまいん（PWA ＋ 通知サーバー）

話し言葉で登録できる iPhone 向けリマインダー。ホーム画面に追加して使う Web アプリ（PWA）で、アプリを閉じていても時刻に通知が届きます。Cloudflare の無料プランだけで動きます。

## しくみ

- `public/` … アプリ本体（PWA）。`index.html` は `app/app.html` から `npm run build` で作る
- `src/worker.js` … 通知サーバー。端末ごとの Durable Object がいちばん近い時刻にアラームを掛け、Web Push を送る
- サーバーに送るのは「プッシュの宛先」と「鳴らす時刻」だけ。タイトル・メモ・URL は端末の外に出ない
- 通知の文面は、iPhone 側の Service Worker（`public/sw.js`）が端末内のデータから作る
- VAPID 鍵は初回アクセス時にサーバーが自動で作って保存する（手で設定する秘密情報はない）

## 公開（Cloudflare ダッシュボードから、1回だけ）

1. このリポジトリを GitHub に置く
2. Cloudflare ダッシュボード →「Workers & Pages」→「Create」→「Import a repository」→ このリポジトリを選ぶ
3. ビルドコマンドは空欄、デプロイコマンドは `npx wrangler deploy` のまま「Deploy」
4. 表示された `https://rimain.<アカウント名>.workers.dev` を iPhone の Safari で開き、共有 →「ホーム画面に追加」
5. ホーム画面のりまいんを開き、設定（右上）→「閉じている間の通知」→「オンにする」→「テスト通知を送る」

以後は GitHub に push するたびに自動で更新されます。

## 開発

```sh
npm install
npm run build                 # app/ から public/index.html と dist/rimain.html を作る
npx wrangler dev --var ALLOW_ANY_ENDPOINT:1
npm test                      # 暗号化と VAPID 署名の検証
node test/server.test.mjs     # wrangler dev に対する通しの確認（偽のプッシュサービスを使う）
node test/pwa.e2e.cjs         # 画面と Service Worker の確認（Playwright）
```

## 無料枠（2026-10 時点）

Workers 10万リクエスト/日、Durable Object の書き込み 10万行/日。個人利用では枠の1%程度にとどまる見込みです。

## 制約

- iPhone は iOS 16.4 以降、ホーム画面に追加したときだけ通知が届く
- iPhone の Web 通知にはボタン（スヌーズ等）が付かない。タップで開く操作画面で完了・スヌーズする
- 配信は Apple 経由のため、数十秒ほど遅れることがある
