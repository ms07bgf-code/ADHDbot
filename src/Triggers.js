/**
 * Triggers.js
 * 時刻トリガーから呼ばれるエントリポイント群。
 * インストール可能トリガーの作成は SetupTriggers.js の installTriggers() を参照。
 */

/**
 * 朝pushの時刻チェッカー。10分おきに実行する想定。
 * 出発想定時刻は §5.1a の段階推定により日々変動するため、固定時刻トリガーではなく
 * 「計算した時刻に達したら1回だけ実行する」チェッカー方式を採る。
 */
function morningTriggerChecker() {
  if (hasMorningFiredToday()) return;

  var estimate = getMorningPushTimeForToday();
  var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HH:mm');
  if (nowStr < estimate.time) return;

  savePredictedTimeForToday_(estimate.time);
  runMorningPush();
}

/** 予防push (§5.2)。平日 15:00 固定。持出中0件、または朝pushに応答なしの日は沈黙。 */
function preventionPushTrigger() {
  var today = new Date();
  var isWeekday = today.getDay() >= 1 && today.getDay() <= 5;
  if (!isWeekday) return;

  var carrying = getCarryingItems();
  if (carrying.length === 0) {
    writeLog('no_items', { pushType: 'prevention' });
    return;
  }
  if (!hasMorningResponseToday()) {
    writeLog('suppressed', { pushType: 'prevention', reason: 'no_morning_response' });
    return;
  }

  var text = carrying.map(function (r) { return r.item; }).join('、');
  sendPush(text, CONFIG.PUSH_PRIORITY.PREVENTION, null, 'prevention');
}

/**
 * 前夜push（実験扱い / §5.3b）。
 * 翌日にカレンダー予定があり、かつ event_items の表引きで持ち物が判明する
 * （= routine_items で毎回自動的に拾える定常品ではない）日のみ発火する。
 * 表引きで拾えなかった予定は黙って無視する (§4.3a)。
 */
function previousNightPushTrigger() {
  var tomorrow = addDays_(new Date(), 1);
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(tomorrow);
  if (events.length === 0) {
    writeLog('no_items', { pushType: 'prev_night' });
    return;
  }

  var mappings = getAllRows(SHEET_NAMES.EVENT_ITEMS).filter(function (row) { return row['有効'] !== false; });
  var hasMatchedEvent = events.some(function (event) {
    var title = event.getTitle() || '';
    return mappings.some(function (m) { return title.indexOf(m.keyword) !== -1; });
  });

  if (!hasMatchedEvent) {
    writeLog('no_items', { pushType: 'prev_night' });
    return;
  }

  sendPush('明日の予定あり。持ち物の準備を。', CONFIG.PUSH_PRIORITY.PREV_NIGHT, null, 'prev_night');
}

/** 週次棚卸し（実験扱い / §5.1c）。月曜の夜、常備品全件のみを流す。 */
function weeklyInventoryTrigger() {
  var items = getAllStandingItems();
  if (items.length === 0) return;
  sendPush('【今週の常備品確認】\n' + items.join('、'), CONFIG.PUSH_PRIORITY.WEEKLY_INVENTORY, null, 'weekly_inventory');
}

/** 24:00 みなし回収 (§5.2a)。深夜0:05頃に実行する想定。 */
function midnightSweepTrigger() {
  sweepCarryingToRecovered();
}

/** 日次クリーンアップ。予定日超過の予約/古い未回収を落とし、departure_log と dwell_log の保持期間を適用する。 */
function dailyCleanupTrigger() {
  cleanupOverdueCarryItems();
  cleanupOldDepartureLogs();
  cleanupOldDwellLogs();
}
