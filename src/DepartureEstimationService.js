/**
 * DepartureEstimationService.js
 * 出発時刻の段階的推定 (§5.1a, §7.5)。
 *
 *   段階0（初日〜）    曜日別の既定時刻（手動設定）
 *      ↓ 全体 n>=10 かつ MAD<40分
 *   段階1（2週間〜）   全曜日まとめた分布から推定
 *      ↓ 該当曜日 n>=8 かつ その曜日のMAD<40分
 *   段階2（2ヶ月〜）   曜日別の分布から推定
 *
 * 曜日ごとに独立して段階を判定する。閾値を割ったら段階0へ降格する。
 * 推定値はユーザーに見せない（ボットは黙って寄せる / §5.1a）。
 */

/** departure_log からローリングウィンドウ内の離脱時刻(分, 0-1439)を取得する。 */
function getRecentDepartureMinutes_(weekdayFilter) {
  var windowStart = addDays_(new Date(), -CONFIG.ESTIMATION.ROLLING_WINDOW_DAYS);
  var rows = getAllRows(SHEET_NAMES.DEPARTURE_LOG);
  return rows.filter(function (row) {
    var d = row.date instanceof Date ? row.date : new Date(row.date);
    if (isNaN(d.getTime()) || d < windowStart) return false;
    if (weekdayFilter !== undefined && d.getDay() !== weekdayFilter) return false;
    return !!row['離脱時刻'];
  }).map(function (row) {
    return timeValueToMinutes_(row['離脱時刻']);
  }).filter(function (m) { return m !== null; });
}

function timeValueToMinutes_(value) {
  var d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) {
    var parts = value.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else {
    return null;
  }
  return d.getHours() * 60 + d.getMinutes();
}

function median_(numbers) {
  if (numbers.length === 0) return null;
  var sorted = numbers.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile_(numbers, p) {
  if (numbers.length === 0) return null;
  var sorted = numbers.slice().sort(function (a, b) { return a - b; });
  var idx = (p / 100) * (sorted.length - 1);
  var lower = Math.floor(idx);
  var upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function mad_(numbers) {
  var med = median_(numbers);
  if (med === null) return null;
  var deviations = numbers.map(function (n) { return Math.abs(n - med); });
  return median_(deviations);
}

/**
 * 当日の朝push時刻を決定する (段階0/1/2 を自動判定)。
 * @returns {{time: string, stage: number}} time は 'HH:mm'
 */
function getMorningPushTimeForToday() {
  var weekday = new Date().getDay();
  var perWeekday = getRecentDepartureMinutes_(weekday);
  var allWeekdays = getRecentDepartureMinutes_();

  // 段階2: 該当曜日 n>=8 かつ MAD<40分
  if (perWeekday.length >= CONFIG.ESTIMATION.STAGE2_MIN_SAMPLES_PER_WEEKDAY
      && mad_(perWeekday) < CONFIG.ESTIMATION.STAGE2_MAX_MAD_MINUTES) {
    return buildEstimatedPush_(perWeekday, 2);
  }

  // 段階1: 全体 n>=10 かつ MAD<40分
  if (allWeekdays.length >= CONFIG.ESTIMATION.STAGE1_MIN_SAMPLES
      && mad_(allWeekdays) < CONFIG.ESTIMATION.STAGE1_MAX_MAD_MINUTES) {
    return buildEstimatedPush_(allWeekdays, 1);
  }

  // 段階0: 曜日別既定時刻
  var defaultTime = CONFIG.DEFAULT_DEPARTURE_TIME[weekday];
  return { time: subtractMinutesFromTimeStr_(defaultTime, CONFIG.MORNING_PUSH_LEAD_MINUTES), stage: 0 };
}

function buildEstimatedPush_(minutesArray, stage) {
  var p25 = percentile_(minutesArray, CONFIG.ESTIMATION.PERCENTILE);
  var pushMinutes = p25 - CONFIG.PREDICTED_PUSH_LEAD_MINUTES;
  return { time: minutesToTimeStr_(pushMinutes), stage: stage };
}

function minutesToTimeStr_(totalMinutes) {
  var m = ((totalMinutes % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60);
  var min = Math.round(m % 60);
  return pad2_(h) + ':' + pad2_(min);
}

function subtractMinutesFromTimeStr_(timeStr, minutesToSubtract) {
  var parts = timeStr.split(':');
  var totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) - minutesToSubtract;
  return minutesToTimeStr_(totalMinutes);
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** 自宅離脱を検知した際に呼ぶ。departure_log に記録する (§7.5.1)。 */
function recordDeparture(date) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.DEPARTURE_LOG);
  var predicted = PropertiesService.getScriptProperties().getProperty('predicted_time_' + formatDate_(date));
  appendRow(sheet, {
    date: formatDate_(date),
    '曜日': WEEKDAY_LABELS[date.getDay()],
    '離脱時刻': Utilities.formatDate(date, CONFIG.TIMEZONE, 'HH:mm'),
    '予測時刻': predicted || ''
  });
}

/** 当日の予測push時刻をプロパティに保存しておく（誤差検証用 / §7.5.6）。 */
function savePredictedTimeForToday_(timeStr) {
  PropertiesService.getScriptProperties().setProperty('predicted_time_' + formatDate_(new Date()), timeStr);
}

/** departure_log の保持期間(90日)を超えた行を物理削除する (§7 プライバシー方針)。 */
function cleanupOldDepartureLogs() {
  var threshold = addDays_(new Date(), -CONFIG.DEPARTURE_LOG_RETENTION_DAYS);
  var rows = getAllRows(SHEET_NAMES.DEPARTURE_LOG);
  var removed = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    var d = row.date instanceof Date ? row.date : new Date(row.date);
    if (!isNaN(d.getTime()) && d < threshold) {
      deleteRow(SHEET_NAMES.DEPARTURE_LOG, row);
      removed++;
    }
  }
  if (removed > 0) writeLog('departure_log_cleanup', { removed: removed });
}
