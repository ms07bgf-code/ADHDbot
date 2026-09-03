/**
 * LogService.js
 * 全イベントを log シートへ記録する (§4.4)。
 * event: weather_check / push_sent / postback / no_items / suppressed / departure / manual_register / promotion 等
 */

function writeLog(event, detail) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.LOG);
  appendRow(sheet, {
    timestamp: new Date(),
    event: event,
    detail: JSON.stringify(detail || {})
  });
}

/** 当日分の log を event でフィルタして返す。push上限判定などに使用 (§5.5)。 */
function getTodayLogsByEvent(event) {
  var todayStr = formatDate_(new Date());
  return getAllRows(SHEET_NAMES.LOG).filter(function (row) {
    if (row.event !== event) return false;
    var ts = row.timestamp;
    if (!(ts instanceof Date)) return false;
    return formatDate_(ts) === todayStr;
  });
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}
