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

/**
 * 予防push (§5.2)。平日 15:00 固定。
 *
 * これは §5.4「職場離脱」の時刻トリガーによる代役であり、仕様書§5.9では
 * 「Phase 2で離脱検知に置換」とされている。ただし §1 のとおり位置検知は静かに失敗する
 * （端末再起動・権限失効・機内モード・ロガーの停止）ため、削除せずフォールバックとして残す。
 *
 *   層Bが当日離脱を検知している → 代役は不要なのでスキップ
 *   検知が来ていない            → 固定時刻で鳴らす
 *
 * これは §1 が定める「離脱検知が来た日は固定時刻をスキップする」排他の適用にあたる。
 */
function preventionPushTrigger() {
  var skipReason = preventionSkipReason_(new Date());
  if (skipReason) {
    writeLog('suppressed', { pushType: 'prevention', reason: skipReason });
    return;
  }

  var carrying = getCarryingItems();
  if (carrying.length === 0) {
    writeLog('no_items', { pushType: 'prevention' });
    return;
  }

  var text = carrying.map(function (r) { return r.item; }).join('、');
  sendPush(text, CONFIG.PUSH_PRIORITY.PREVENTION, null, 'prevention');
}

/** 予防pushを見送る理由。鳴らしてよければ null。 */
function preventionSkipReason_(now) {
  var isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  if (!isWeekday) return 'weekend';

  // 層Bが当日動いていれば、実際の離脱で鳴るので固定時刻の代役は不要
  var dwellExitDate = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.FIRED_DWELL_EXIT);
  if (dwellExitDate === formatDate_(now)) return 'dwell_detection_active';

  // 持ち出したか不明な状態で聞くと外れが続き、push全体の信頼が失われる (§5.2 条件3)
  if (!hasMorningResponseToday()) return 'no_morning_response';

  return null;
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
