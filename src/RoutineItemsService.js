/**
 * RoutineItemsService.js
 * 曜日ルーチン (§4.2)。
 */

var WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function getTodayRoutineItems() {
  var weekdayLabel = WEEKDAY_LABELS[new Date().getDay()];
  return getAllRows(SHEET_NAMES.ROUTINE_ITEMS).filter(function (row) {
    if (row['有効'] === false) return false;
    var days = String(row['曜日'] || '').split(',').map(function (s) { return s.trim(); });
    return days.indexOf(weekdayLabel) !== -1;
  }).map(function (row) { return row.item; });
}
