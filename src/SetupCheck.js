/**
 * SetupCheck.js
 * セットアップ状況の診断。GASエディタから checkSetup() を実行し、実行ログを見る。
 *
 * 何が足りないかを一度に把握するためのもの。動かないときの最初の切り分けにも使う。
 * トークン等の値は出力しない（ログを他人に見せられるようにするため）。
 */

function checkSetup() {
  var lines = ['===== セットアップ診断 ====='];

  lines.push('', '[スクリプトプロパティ]');
  var props = PropertiesService.getScriptProperties();
  var required = [
    [PROP_KEYS.LINE_TOKEN, 'LINEへの送信'],
    [PROP_KEYS.LINE_USER_ID, 'push先'],
    [PROP_KEYS.WEBHOOK_SECRET, '自宅離脱/位置情報の検証'],
    ['HOME_LAT', '天気判定・自宅アンカーの抑止'],
    ['HOME_LNG', '天気判定・自宅アンカーの抑止']
  ];
  required.forEach(function (pair) {
    var ok = !!props.getProperty(pair[0]);
    lines.push((ok ? '  OK   ' : '  未設定 ') + pair[0] + ' — ' + pair[1]);
  });
  var richMenuImage = props.getProperty(PROP_KEYS.RICH_MENU_IMAGE_FILE_ID);
  lines.push('  ' + (richMenuImage ? 'OK   ' : '任意 ') + PROP_KEYS.RICH_MENU_IMAGE_FILE_ID + ' — リッチメニュー（未設定でも動く）');

  lines.push('', '[シート]');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var rows = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    lines.push((sheet ? '  OK   ' : '  なし ') + name + (sheet ? '（' + rows + '行）' : ' — setupSpreadsheet() を実行'));
  });

  lines.push('', '[トリガー]');
  var expected = ['morningTriggerChecker', 'preventionPushTrigger', 'previousNightPushTrigger',
                  'weeklyInventoryTrigger', 'midnightSweepTrigger', 'dailyCleanupTrigger'];
  var installed = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  expected.forEach(function (name) {
    lines.push((installed.indexOf(name) !== -1 ? '  OK   ' : '  なし ') + name);
  });
  if (installed.length === 0) lines.push('  → installTriggers() を実行');

  lines.push('', '[Webアプリ]');
  var url = ScriptApp.getService().getUrl();
  if (url) {
    lines.push('  OK   ' + url);
    lines.push('  LINE Webhook   : 上記URLをそのまま設定');
    lines.push('  OwnTracks      : 上記URL + "?secret=<WEBHOOK_SECRETの値>"');
    lines.push('  iOSショートカット: 上記URLへ {"secret":"<WEBHOOK_SECRETの値>"} をPOST');
  } else {
    lines.push('  未デプロイ — 「デプロイ > 新しいデプロイ > ウェブアプリ」でアクセス権「全員」を選ぶ');
  }

  lines.push('', '[当日の状態]');
  var today = formatDate_(new Date());
  lines.push('  朝pushの評価: ' + (props.getProperty(PROP_KEYS.FIRED_MORNING) === today ? '実施済み' : '未実施'));
  lines.push('  「持った」の応答: ' + (props.getProperty(PROP_KEYS.MORNING_RESPONDED) === today ? 'あり' : 'なし'));
  lines.push('  自宅離脱の検知: ' + (props.getProperty(PROP_KEYS.FIRED_DEPARTURE) === today ? 'あり' : 'なし'));
  lines.push('  滞在地点からの離脱検知(層B): ' + (props.getProperty(PROP_KEYS.FIRED_DWELL_EXIT) === today ? 'あり' : 'なし'));
  var dwellState = props.getProperty(PROP_KEYS.DWELL_STATE);
  lines.push('  層Bの状態機械: ' + (dwellState ? dwellState : '未起動（位置情報のPOSTがまだ届いていない）'));

  var report = lines.join('\n');
  Logger.log(report);
  return report;
}

/** LINEへの送信経路だけを確認する。checkSetup() が OK でも届かない場合に使う。 */
function sendTestPush() {
  linePush('テスト送信です');
  Logger.log('sendTestPush: 送信しました。LINEに届いていなければ LINE_TOKEN / LINE_USER_ID を確認してください');
}
