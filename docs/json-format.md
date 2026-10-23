# RE:main の JSON 形式（`rimain.reminders` v1）

RE:main の「ファイルと設定」→「エクスポート／インポート」で使う JSON の仕様です。実装は `app/app.html` の `exportObj()`・`validateImport()` と、`app/engine.js` の繰り返しルール計算です。AI に作らせるときは [ai-prompt.md](ai-prompt.md) のプロンプトを使ってください。

## 全体

```json
{
  "format": "rimain.reminders",
  "version": 1,
  "exportedAt": "2026-10-23T11:20",
  "timezone": "Asia/Tokyo",
  "lists": [ { "id": "inbox", "name": "リマインダー", "color": "blue" } ],
  "reminders": [ { "title": "燃えるゴミを出す", "rule": { "freq": "weekly", "byDay": [2, 5], "times": ["07:30"] } } ]
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `format` | 任意 | `"rimain.reminders"`。書くなら必ずこの値（違う値だとエラー） |
| `version` | 任意 | `1` |
| `exportedAt` / `timezone` | 任意 | エクスポート時に付く参考情報。取り込みでは使わない |
| `lists` | 任意 | リストの配列。省略・空なら `[{ "id": "inbox", "name": "リマインダー", "color": "blue" }]` |
| `reminders` | **必須** | リマインダーの配列（空配列も可） |

### 日時の書き方

- 日時はすべて端末のローカル時刻（日本なら日本時間）で `"YYYY-MM-DDTHH:mm"`。秒・タイムゾーンは付けない
- 日付だけは `"YYYY-MM-DD"`。リマインダーの `due` に日付だけを書くと 9:00 として取り込む
- 時刻は `"HH:mm"`。取り込み時に `"7:30"` は `"07:30"` にそろえる
- 曜日は番号: `0`=日 `1`=月 `2`=火 `3`=水 `4`=木 `5`=金 `6`=土

## リスト（`lists[]`）

| キー | 必須 | 内容 |
|---|---|---|
| `id` | **必須** | リストの識別子（英数字の短い語） |
| `name` | **必須** | 表示名 |
| `color` | 任意 | `blue` `red` `orange` `green` `teal` `purple` `indigo` `gray` |

`id` か `name` が無いリストは読み飛ばします。

## リマインダー（単発・繰り返し）

| キー | 必須 | 既定値 | 内容 |
|---|---|---|---|
| `title` | **必須** | | 通知に出る文。文字列でなければエラー |
| `notes` | 任意 | `""` | メモ |
| `url` | 任意 | `null` | 通知をタップしたときに開く URL。`http(s)` 以外は捨てる。`www.` や `example.com/…` には `https://` を補う |
| `list` | 任意 | 先頭のリスト | リストの `id`。ファイルの `lists` にも今あるリストにも無ければ先頭のリストに入る（「置き換える」で取り込むときはファイルの `lists` だけを見る） |
| `due` | 繰り返しでは任意 | `null` | 次に通知する日時。**単発では書かないと通知されない**（日時なしのリマインダーになる）。繰り返しで省略すると、取り込み時に `rule` から最初の日時を計算する |
| `rule` | 任意 | `null` | 繰り返しのルール（下記）。単発なら書かない |
| `nag` | 任意 | `null` | 完了するまで再通知: `{ "every": 分 }`（1〜120 に丸める。最大 24 回） |
| `flagged` | 任意 | `false` | フラグ |
| `priority` | 任意 | `0` | 優先度 0〜3 |
| `done` / `doneAt` | 任意 | `false` / `null` | 完了済みか、完了日時 |
| `id` | 任意 | 自動 | 識別子。今のデータと重なれば振り直す |
| `count` / `history` / `input` / `createdAt` / `snoozeUntil` | 任意 | | エクスポートに入る作業用の情報。手で書く必要はない |

`due` が過去の日時だと、取り込んだ直後に通知されます。

### 繰り返し（`rule`）

`freq` 以外はすべて任意です。

| キー | 内容 |
|---|---|
| `freq` | `daily` `weekly` `monthly` `yearly` `parity` `hourly` `minutely` `afterDone` のどれか（それ以外はエラー） |
| `interval` | 何回ごとか（既定 1）。隔日・隔週・隔月は 2。アプリの「N日おき」は N+1 |
| `times` | 時刻の配列（既定 `["09:00"]`）。1日に複数回なら `["08:00","20:00"]`。`hourly`/`minutely` では先頭が数え始めの時刻 |
| `start` | 数え始めの日 `"YYYY-MM-DD"`。省略すると `due` の日付（`due` も無ければ最初に当てはまる日）。隔週などの「どの週か」はここで決まる |
| `until` | この日まで `"YYYY-MM-DD"` |
| `count` | この回数まで |
| `skipHolidays` | `true` で日本の祝日は通知しない |
| `onlyDays` | 曜日の番号の配列。`daily`・`parity` などを特定の曜日だけに絞る |
| `byDay` | `weekly` の曜日（配列。省略すると `start` の曜日） |
| `byMonthDay` | `monthly` の日（配列。`-1` は月末。31日指定は短い月では月末）、`yearly` の日（先頭だけ使う） |
| `byNth` | `monthly` の第N○曜日 `{ "n": 1〜5 または -1(最終), "wd": 曜日 }` |
| `byMonth` | `yearly` の月 1〜12 |
| `parity` | `parity` で `"even"`（偶数日）か `"odd"`（奇数日） |
| `bizBefore` | `monthly` の日付指定で、土日祝なら前の平日にずらす |
| `unit` | `afterDone` の単位 `minute` `hour` `day` `week` `month` `year` |
| `cond` | 詳細条件（満たす日だけ通知）。下記 |
| `ifs` | 「もし〜なら」の配列。下記 |

`byDay`・`onlyDays`・`byMonthDay` は数値1つでも配列にそろえて取り込みます。

#### 例

| 言い方 | `rule` |
|---|---|
| 毎日 21時 | `{ "freq": "daily", "times": ["21:00"] }` |
| 隔日 / 3日ごと | `{ "freq": "daily", "interval": 2 }` / `{ "freq": "daily", "interval": 3 }` |
| 毎週火・金 7:30 | `{ "freq": "weekly", "byDay": [2, 5], "times": ["07:30"] }` |
| 隔週水曜 8時 | `{ "freq": "weekly", "interval": 2, "byDay": [3], "times": ["08:00"] }` |
| 平日 8時 祝日除く | `{ "freq": "weekly", "byDay": [1, 2, 3, 4, 5], "times": ["08:00"], "skipHolidays": true }` |
| 毎月25日、土日祝なら前の平日 | `{ "freq": "monthly", "byMonthDay": [25], "bizBefore": true }` |
| 毎月末 | `{ "freq": "monthly", "byMonthDay": [-1] }` |
| 毎月第2火曜 | `{ "freq": "monthly", "byNth": { "n": 2, "wd": 2 } }` |
| 毎月最終金曜 | `{ "freq": "monthly", "byNth": { "n": -1, "wd": 5 } }` |
| 毎年3月10日 | `{ "freq": "yearly", "byMonth": 3, "byMonthDay": [10] }` |
| 偶数日 7時 | `{ "freq": "parity", "parity": "even", "times": ["07:00"] }` |
| 奇数日の平日 | `{ "freq": "parity", "parity": "odd", "onlyDays": [1, 2, 3, 4, 5] }` |
| 3時間ごと | `{ "freq": "hourly", "interval": 3 }` |
| 30分ごと（9時から） | `{ "freq": "minutely", "interval": 30, "times": ["09:00"] }` |
| 完了から1ヶ月後 | `{ "freq": "afterDone", "interval": 1, "unit": "month" }` |
| 12/31まで / 5回まで | `"until": "2026-12-31"` / `"count": 5` を足す |

#### 詳細条件（`cond`）と「もし〜なら」（`ifs`）

アプリの詳細画面の「条件」で作れるものと同じです。

- `cond`: `{ "op": "and" | "or", "items": [条件 または 入れ子の { op, items }] }`。満たす日だけ通知する
- `ifs`: `[{ "cond": 条件, "act": "skip" | "prev" | "next" | "time", "time": "HH:mm" }]`。上から順に、最初に当てはまったものを使う（`skip` 通知しない、`prev`/`next` 前/次の平日へずらす、`time` その日だけ時刻を変える）
- 条件 `{ "t": 種類, ..., "not": true で否定 }`:

| `t` | 項目 | 意味 |
|---|---|---|
| `day` | `v`: `weekday` `weekend` `holiday` `offday`(土日祝) `bizday`(平日かつ祝日でない) | 日の種類 |
| `wd` | `v`: 曜日の配列 | 曜日 |
| `mday` | `from`, `to` | 日付の範囲 |
| `last` | `n` | 月末 n 日間 |
| `month` | `v`: 月の配列 | 月 |
| `nth` | `n`, `wd` | 第n○曜日 |
| `parity` | `v`: `even` / `odd` | 偶数日・奇数日 |
| `period` | `from`, `to`（`YYYY-MM-DD`） | 期間 |

例: 毎月10日、土日祝なら次の平日、金曜なら18時

```json
{ "freq": "monthly", "byMonthDay": [10], "ifs": [
  { "cond": { "t": "day", "v": "offday" }, "act": "next" },
  { "cond": { "t": "wd", "v": [5] }, "act": "time", "time": "18:00" } ] }
```

## グループ（時間差で順番に通知）

1件目だけ日時を決め、2件目以降は「ひとつ前の通知から N 分/時間/日後」に通知します。項目ごとに通知・完了します。

```json
{ "kind": "group", "title": "地域チェック", "due": "2026-11-03T09:00",
  "spacing": "equal", "every": { "value": 30, "unit": "minute" },
  "urlMode": "none",
  "steps": [ { "title": "千葉" }, { "title": "東京" }, { "title": "神奈川" } ] }
```

| キー | 必須 | 内容 |
|---|---|---|
| `kind` | **必須** | `"group"` |
| `title` | **必須** | まとめの名前 |
| `due` | **必須** | 1件目の通知日時（日付だけなら 9:00） |
| `steps` | **必須** | 項目の配列（1件以上）。各項目は `title` 必須、`url` 任意、`after` 任意 |
| `spacing` | 任意 | `"equal"`（既定、全部 `every` の間隔）か `"each"`（項目ごとの `after`） |
| `every` | 任意 | `{ "value": 数, "unit": "minute" | "hour" | "day" }` |
| `steps[].after` | 任意 | `spacing: "each"` のときの、ひとつ前からの間隔（1件目は 0） |
| `urlMode` | 任意 | `"none"`（既定）、`"same"`（全項目で `url`）、`"each"`（項目ごとの `steps[].url`） |
| `url` | 任意 | `urlMode: "same"` のときの URL |
| `notes` `list` `flagged` `priority` `done` `doneAt` `id` | 任意 | 単発と同じ |

グループには `rule` と `nag` は使えません。

## 取り込みの動き

- 「今のデータに追加」: リストは id が無いものだけ足す。リマインダーは全部足す（id が重なれば振り直す）
- 「置き換える」: 今のリストとリマインダーを、ファイルの内容に入れ替える（設定は残る）
- AI の返事をまるごと貼っても、```` ```json ```` のコードブロックの中だけを読む
- エラーは「3件目の due "明日の朝" が読めません」のように、何件目のどこが悪いかを日本語で出す。1件でもエラーがあれば何も取り込まない

## エクスポートに入らないもの

通知の途中経過（`lastNotified`・`lastNagAt`・`nagCount`、グループ項目の `snoozeUntil`）と、通知音などの設定は端末ごとのものなので含めません。
