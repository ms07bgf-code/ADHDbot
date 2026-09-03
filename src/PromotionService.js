/**
 * PromotionService.js
 * 昇格ロジック (§4.3b)。手動登録が同じ曜日パターンで繰り返されたら routine_items 化を提案する。
 *
 *  「図書館の本」が隔週土曜に3回登録される
 *    → 「毎週これ出す?」+ ボタン[はい/いいえ]
 *    → はい → routine_items へ昇格
 */

/** 手動登録の直後に呼ぶ。同一item×同一曜日の手動登録が閾値回数に達したら提案push。 */
function checkPromotionCandidate(item, dateStr) {
  var weekday = new Date(dateStr).getDay();
  var weekdayLabel = WEEKDAY_LABELS[weekday];

  // 既に routine_items にある場合は提案不要
  var already = getAllRows(SHEET_NAMES.ROUTINE_ITEMS).some(function (row) {
    return row.item === item && String(row['曜日'] || '').split(',').indexOf(weekdayLabel) !== -1;
  });
  if (already) return;

  // 直近で「いいえ」を選んだ組み合わせは再提案しない
  var declinedKey = 'promotion_declined_' + item + '_' + weekdayLabel;
  if (PropertiesService.getScriptProperties().getProperty(declinedKey)) return;

  var count = getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    if (row['発生元'] !== CARRY_SOURCE.MANUAL || row.item !== item) return false;
    var rowDate = row['予定日'] instanceof Date ? row['予定日'] : new Date(row['予定日']);
    if (isNaN(rowDate.getTime())) return false;
    return rowDate.getDay() === weekday;
  }).length;

  if (count >= CONFIG.PROMOTION_TRIGGER_COUNT) {
    var data = 'promote:' + encodeURIComponent(item) + ':' + weekdayLabel;
    var declineData = 'decline_promote:' + encodeURIComponent(item) + ':' + weekdayLabel;
    linePush('「' + item + '」を毎週' + weekdayLabel + '曜に出しますか？', [
      { label: 'はい', data: data },
      { label: 'いいえ', data: declineData }
    ]);
    writeLog('promotion_suggested', { item: item, weekday: weekdayLabel });
  }
}

function promoteToRoutine(item, weekdayLabel) {
  var existing = getAllRows(SHEET_NAMES.ROUTINE_ITEMS).filter(function (row) { return row.item === item; })[0];
  if (existing) {
    var days = String(existing['曜日'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (days.indexOf(weekdayLabel) === -1) days.push(weekdayLabel);
    updateRowFields(SHEET_NAMES.ROUTINE_ITEMS, existing, { '曜日': days.join(','), '有効': true });
  } else {
    var sheet = getOrCreateSheet_(SHEET_NAMES.ROUTINE_ITEMS);
    appendRow(sheet, { item: item, '曜日': weekdayLabel, '有効': true });
  }
  writeLog('promotion_accepted', { item: item, weekday: weekdayLabel });
}

function declinePromotion(item, weekdayLabel) {
  PropertiesService.getScriptProperties().setProperty('promotion_declined_' + item + '_' + weekdayLabel, 'true');
  writeLog('promotion_declined', { item: item, weekday: weekdayLabel });
}
