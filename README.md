# 忘れ物リマインドボット (ADHDbot)

ADHD特性による行動の困難を補助するボット。仕様書 `carrybotspec.md`（v0.8）に基づく MVP 実装。

- スタック: LINE Messaging API + Google Apps Script + Google Sheets
- スコープ: 仕様書 §2「MVPスコープ」に定義された機能一式（自宅離脱検知＝層Aまで。動的アンカー＝層BはPhase 2で未実装）

## データストア

GASプロジェクトにバインドするスプレッドシートは、指定のGoogle Driveフォルダにあらかじめ作成済みです。

- スプレッドシート: [忘れ物リマインドボット データ](https://docs.google.com/spreadsheets/d/1nd0mYFWPxciYnwDzW4_e-1n5H_OZMUpPQChvXC1sd0Q/edit)
- 格納フォルダ: https://drive.google.com/drive/u/0/folders/1yAMDeVndjywwO4IIzJTtgQwo3p5QJ9X-

シート自体（タブ・ヘッダー）はまだ空です。後述の `setupSpreadsheet()` を一度実行すると、`carry_items` / `routine_items` / `standing_items` / `event_items` / `departure_log` / `log` の6シートとヘッダーが自動生成されます（`dwell_log` はPhase 2のため未作成）。

## ディレクトリ構成

```
src/
  appsscript.json          マニフェスト（タイムゾーン、Webアプリ設定）
  Config.js                定数（シート名・状態enum・ScriptPropertiesキー・確定値§5.0）
  SheetUtil.js             シートCRUDの共通ヘルパー、setupSpreadsheet()
  LogService.js            log シートへの記録 (§4.4)
  LineService.js           LINE Messaging API 入出力のみ (§3 責務分担)
  PushController.js        push上限(1日3通)と優先度制御 (§5.5)
  CarryItemsService.js     carry_items 台帳の状態管理 (§4.1)
  RoutineItemsService.js   曜日ルーチン (§4.2)
  StandingItemsService.js  常備品マスタ (§4.3)
  EventItemsService.js     カレンダー予定→持ち物の表引き (§4.3a)
  WeatherService.js        Open-Meteoによる傘判定 (§5.1)
  RelativeDateParser.js    相対日付指定の解析 (§5.3a)
  DepartureEstimationService.js  出発時刻の段階的推定 (§5.1a, §7.5)
  PromotionService.js      昇格ロジック (§4.3b)
  MorningPush.js           朝push本体 (§5.1)
  HomeDepartureService.js  自宅離脱検知＝層A (§5.4)
  MessageRouter.js         LINEテキスト/postbackの解釈
  WebApp.js                doPost/doGet エントリポイント
  Triggers.js              各時刻トリガーのエントリ関数
  SetupTriggers.js         インストール可能トリガーの初期設定
```

GASはファイル分割してもグローバルスコープを共有するため、`import`は使用していません（通常のGASプロジェクトの流儀に合わせています）。

## セットアップ手順

### 1. clasp でプロジェクトを作成しコードをpush

```bash
npm install -g @google/clasp
clasp login

# 既存の上記スプレッドシートにバインドしたスクリプトを新規作成する場合は
# スプレッドシート側のメニュー「拡張機能 > Apps Script」で一度スクリプトを開き、
# そのスクリプトID(URLの /d/<ID>/edit から取得)を .clasp.json に設定する。
cp .clasp.json.example .clasp.json
# .clasp.json の scriptId を書き換える

clasp push
```

### 2. スクリプトプロパティを設定

GASエディタの「プロジェクトの設定 > スクリプト プロパティ」で以下を設定する。

| キー | 値 | 用途 |
|---|---|---|
| `LINE_TOKEN` | LINEチャネルアクセストークン | push/reply送信 |
| `LINE_USER_ID` | push先のLINEユーザーID | push送信先 |
| `WEBHOOK_SECRET` | 任意のランダム文字列 | 自宅離脱通知の共有シークレット検証 (§5.4) |
| `HOME_LAT` | 自宅の緯度 | Open-Meteo天気判定 |
| `HOME_LNG` | 自宅の経度 | Open-Meteo天気判定 |

### 3. 初回セットアップ関数を実行

GASエディタで以下を順に手動実行する（実行権限の承認ダイアログが出る）。

1. `setupSpreadsheet` — シート・ヘッダーの作成、`event_items` 初期セット投入
2. `installTriggers` — 朝push・予防push・前夜push・週次棚卸し・みなし回収・日次クリーンアップの各トリガーを作成

### 4. Webアプリとしてデプロイ

「デプロイ > 新しいデプロイ」→ 種類「ウェブアプリ」→ アクセスできるユーザー「全員」でデプロイし、発行されたURLを控える。

このURLは以下の**両方**の受け口になる（`doPost` 内でペイロードの形から自動振り分け）。

- LINE Messaging API のWebhook URL
- 自宅離脱通知（iOSショートカット / Wi-Fi切断オートメーション）の送信先

### 5. LINE Developers側の設定

- Messaging APIのWebhook URLに上記デプロイURLを設定し、Webhookを有効化
- 応答メッセージ・あいさつメッセージは無効化推奨（ボット独自の応答ロジックのため）

### 6. iOSショートカットの設定（自宅離脱検知＝層A / §5.4, §5.0）

- ジオフェンス方式: 「自宅から出発」のオートメーションを作成し、半径200〜500mで設定。「実行前に尋ねる」はオフ。アクションは「URLの内容を取得」で上記WebアプリURLへPOST、本文は `{"secret": "<WEBHOOK_SECRETの値>"}`
- Wi-Fi切断方式（フォールバック）: 自宅Wi-FiのSSID切断をトリガーに同様のPOSTを送るオートメーションを併設する
- 両方式とも同一のdoPostを叩くだけなので追加実装は不要（仕様書§5.0）

## 主要な設計判断（仕様書との対応）

- **push型・沈黙優先** (§1 設計原則): 対象0件の日は一切pushしない。全ての判定箇所で `no_items` / `suppressed` を `log` に記録する。
- **常備品は通常pushに出さない** (§4.3): `standing_items` は `buildOnDemandCheckText_()` と `weeklyInventoryTrigger()` からのみ参照する。
- **回収確認は行わない・24:00みなし回収** (§5.2a): `midnightSweepTrigger` が持出中を回収済に一括遷移。「なくした/忘れた」申告のみユーザー起点で未回収に落とす。
- **出発時刻の段階的推定** (§5.1a, §7.5): `morningTriggerChecker` を10分おきに実行し、`getMorningPushTimeForToday()` が算出した時刻に達したら1回だけ朝pushを実行する固定時刻トリガーではなくポーリング方式を採用（GASの時刻トリガーは分単位の動的変更ができないため）。
- **push上限と優先度** (§5.5): `PushController.sendPush()` が唯一の送信経路。1日3通の上限に対し、優先度1（自宅離脱の最終push）のみ上限を超えても送信する。
- **LLM不使用** (§6): 天気閾値判定・曜日表引き・キーワード表引き・正規表現前方一致の相対日付解析・中央値/MADのみで構成。外部API呼び出しはOpen-MeteoとCalendarAppのみ。

## 未実装（意図的にスコープ外 / 仕様書§2「含めないもの」）

- 動的アンカー（層B）による任意地点の離脱検知・`dwell_log`・履歴問い合わせ（「履歴」「どこ」コマンドは仕様上の枠だけ用意し、Phase 2未実装である旨を返す）
- 傘以外の天気判定
- 状態機械（着手支援 / Phase 3）
- 販売関連（Wrapper.gsパターン等 / Phase 4）

## §10 未決事項のうち、実装のため暫定値を採用した箇所

| 項目 | 採用した暫定値 | 該当箇所 |
|---|---|---|
| 降水確率の初期閾値 | 50%（仕様書記載の仮値をそのまま採用） | `Config.js` `WEATHER_PROB_THRESHOLD` |
| 「未回収」を台帳から落とす日数 | 3日（予約の予定日超過と同基準） | `Config.js` `RESERVATION_OVERDUE_DROP_DAYS` |
| 昇格提案を出す登録回数 | 3回 | `Config.js` `PROMOTION_TRIGGER_COUNT` |
| push上限 | 3通/日 | `Config.js` `DAILY_PUSH_CAP` |
| MAD閾値・最小サンプル数 | 40分 / 全体10件・曜日別8件 | `Config.js` `ESTIMATION` |

これらは実データが溜まるまでの仮値。仕様書§8「検証指標」に沿って `log` を確認しながらチューニングすること。
