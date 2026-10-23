# りまいん（PWA ＋ 通知サーバー）

話し言葉で登録できる iPhone 向けリマインダー。ホーム画面に追加して使う Web アプリ（PWA）で、アプリを閉じていても時刻に通知が届きます。Cloudflare の無料プランだけで動きます。

## しくみ

- `public/` … アプリ本体（PWA）。`index.html` は `app/app.html` から `npm run build` で作る
- `src/worker.js` … 通知サーバー。端末ごとの Durable Object がいちばん近い時刻にアラームを掛け、Web Push を送る
- サーバーに送るのは「プッシュの宛先」と「鳴らす時刻」だけ。タイトル・メモ・URL は端末の外に出ない
- 通知の文面は、iPhone 側の Service Worker（`public/sw.js`）が端末内のデータから作る
- VAPID 鍵は初回アクセス時にサーバーが自動で作って保存する（手で設定する秘密情報はない）
- 写真の文字読み取り（`public/ocr/`、tesseract.js 7 と日本語データ）と、文章からの日付探し（`findDates`）は端末内だけで行う。写真や文章はサーバーに送らない
- 例外として、設定の「URL のページを読む」をオンにした人だけ、URL のページを `POST /api/page` でサーバーが代わりに取り寄せる（ブラウザからは CORS でほかのサイトを読めないため）。サーバーはページを保存せずそのまま返し、本文の取り出しと日付探しは端末で行う。IP 直打ち・社内向けの名前・80/443 以外のポートは拒否し、転送4回・8秒・1.5MB までに制限している
- 音声入力は Safari の音声認識を使う。ホーム画面のアプリで使えないときは、キーボードのマイクを案内する

## 公開（Cloudflare ダッシュボードから、1回だけ）

1. このリポジトリを GitHub に置く
2. Cloudflare ダッシュボード →「Workers & Pages」→「Create」→「Import a repository」→ このリポジトリを選ぶ
3. ビルドコマンドは空欄、デプロイコマンドは `npx wrangler deploy` のまま「Deploy」
4. 表示された `https://re-main.<アカウント名>.workers.dev`（Worker 名は wrangler.jsonc の name と Cloudflare 側の名前を一致させる） を iPhone の Safari で開き、共有 →「ホーム画面に追加」
5. ホーム画面のりまいんを開き、設定（右上）→「閉じている間の通知」→「オンにする」→「テスト通知を送る」

以後は GitHub に push するたびに自動で更新されます。

## 開発

```sh
npm install
npm run build                 # app/ から public/index.html と dist/rimain.html を作る
npx wrangler dev --var ALLOW_ANY_ENDPOINT:1
npm test                      # 暗号化と VAPID 署名の検証
node test/finddates-test.cjs  # 文章から期日を探す処理
node test/server.test.mjs     # wrangler dev に対する通しの確認（偽のプッシュサービスを使う）
node test/pwa.e2e.cjs         # 画面と Service Worker の確認（Playwright）
node test/ai-import.e2e.cjs   # AI 用プロンプトと、AI が返す形の JSON の取り込み（dist/rimain.html を使う。サーバー不要）
node test/scan.e2e.cjs        # 写真・文章から期日を拾う（page / cal / voice / swipe の e2e も同様）
```

## データ形式と AI での作成

- [docs/json-format.md](docs/json-format.md) … エクスポート／インポートする JSON（`rimain.reminders` v1）の仕様
- [docs/ai-prompt.md](docs/ai-prompt.md) … ChatGPT・Claude などに予定を書いて、取り込める JSON を作ってもらうプロンプト。アプリの「ファイルと設定」→「AI 用のプロンプトをコピー」でも、今日の日付入りでコピーできる（プロンプトの正本はこのファイルで、`npm run build` でアプリに埋め込む）

## 無料枠（2026-10 時点）

Workers 10万リクエスト/日、Durable Object の書き込み 10万行/日。個人利用では枠の1%程度にとどまる見込みです。

## 制約

- iPhone は iOS 16.4 以降、ホーム画面に追加したときだけ通知が届く
- iPhone の Web 通知にはボタン（スヌーズ等）が付かない。タップで開く操作画面で完了・スヌーズする
- 配信は Apple 経由のため、数十秒ほど遅れることがある

## 写真の文字読み取りファイルの更新

`public/ocr/` は npm の `tesseract.js`（dist/tesseract.min.js, worker.min.js）、`tesseract.js-core`（tesseract-core-simd-lstm.wasm.js）、`@tesseract.js-data/jpn`（4.0.0_best_int/jpn.traineddata.gz）からコピーしたもの。いずれも Apache-2.0（同じフォルダにライセンスを同梱）。
