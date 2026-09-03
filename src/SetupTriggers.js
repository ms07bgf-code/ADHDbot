/**
 * SetupTriggers.js
 * インストール可能トリガーの初期設定。GASエディタから installTriggers() を一度だけ手動実行する。
 */

function installTriggers() {
  deleteAllTriggers_();

  // 朝pushチェッカー: 出発想定時刻は日々変動するため10分おきにチェックする (§5.1a)
  ScriptApp.newTrigger('morningTriggerChecker')
    .timeBased()
    .everyMinutes(10)
    .create();

  // 予防push: 平日15:00固定 (§5.0)。関数内で平日判定。
  ScriptApp.newTrigger('preventionPushTrigger')
    .timeBased()
    .atHour(15)
    .everyDays(1)
    .create();

  // 前夜push（実験扱い / §5.3b）: 21:00
  ScriptApp.newTrigger('previousNightPushTrigger')
    .timeBased()
    .atHour(21)
    .everyDays(1)
    .create();

  // 週次棚卸し（実験扱い / §5.1c）: 月曜21:00。関数内で発火制御はしていないため、
  // 曜日はこのトリガー自体が「毎週月曜」で作成することで担保する。
  ScriptApp.newTrigger('weeklyInventoryTrigger')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(CONFIG.WEEKLY_INVENTORY_HOUR)
    .create();

  // 24:00 みなし回収 (§5.2a): 深夜0:05
  ScriptApp.newTrigger('midnightSweepTrigger')
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .everyDays(1)
    .create();

  // 日次クリーンアップ: 深夜0:10
  ScriptApp.newTrigger('dailyCleanupTrigger')
    .timeBased()
    .atHour(0)
    .nearMinute(10)
    .everyDays(1)
    .create();

  Logger.log('installTriggers: done. Installed triggers = ' + ScriptApp.getProjectTriggers().length);
}

function deleteAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
}
