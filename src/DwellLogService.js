/**
 * DwellLogService.js
 * 滞在地点の記録 (§4.5a) と表示 (§5.8)。
 *
 * 経路（軌跡）は保存せず、滞在地点のみを1日3〜8行の規模で残す (§7 プライバシー方針)。
 * 保持期間は90日。日次トリガーで期限切れ行を物理削除する。
 */

/** 離脱確定時に滞在を1行記録する。 */
function recordDwell(anchor, arrivedAt, departedAt) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.DWELL_LOG);
  appendRow(sheet, {
    '日付': formatDate_(departedAt),
    '到着': Utilities.formatDate(arrivedAt, CONFIG.TIMEZONE, 'HH:mm'),
    '出発': Utilities.formatDate(departedAt, CONFIG.TIMEZONE, 'HH:mm'),
    lat: anchor.lat,
    lng: anchor.lng,
    'ラベル': ''
  });
  writeLog('dwell_recorded', {
    到着: Utilities.formatDate(arrivedAt, CONFIG.TIMEZONE, 'HH:mm'),
    出発: Utilities.formatDate(departedAt, CONFIG.TIMEZONE, 'HH:mm')
  });
}

/**
 * 滞在履歴のテキスト表示 (§5.8)。
 * 地点名がなくても時刻だけで大半は思い出せるため、まずテキストで運用する。
 * @param {number} days 直近何日ぶんを返すか
 */
function buildDwellHistoryText(days) {
  var cutoff = addDays_(new Date(), -(days - 1));
  var cutoffStr = formatDate_(cutoff);

  var rows = getAllRows(SHEET_NAMES.DWELL_LOG).filter(function (row) {
    return formatDateValue_(row['日付']) >= cutoffStr;
  });

  if (rows.length === 0) return '記録された滞在はありません';

  var byDate = {};
  rows.forEach(function (row) {
    var date = formatDateValue_(row['日付']);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(row);
  });

  var lines = [];
  Object.keys(byDate).sort().forEach(function (date) {
    lines.push(date + 'の滞在');
    byDate[date].forEach(function (row) {
      var label = row['ラベル'] ? row['ラベル'] : '(未設定)';
      lines.push(row['到着'] + '-' + row['出発'] + ' ' + label);
    });
  });
  return lines.join('\n');
}

/** dwell_log の保持期間(90日)を超えた行を物理削除する (§7 プライバシー方針)。 */
function cleanupOldDwellLogs() {
  var thresholdStr = formatDate_(addDays_(new Date(), -CONFIG.DWELL_LOG_RETENTION_DAYS));
  var rows = getAllRows(SHEET_NAMES.DWELL_LOG);
  var removed = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (formatDateValue_(rows[i]['日付']) < thresholdStr) {
      deleteRow(SHEET_NAMES.DWELL_LOG, rows[i]);
      removed++;
    }
  }
  if (removed > 0) writeLog('dwell_log_cleanup', { removed: removed });
}

/**
 * 物からの逆引き (§5.7)。「どこ 傘」で未回収の発生日とその日の滞在地点を返す。
 * carry_items の 未回収 と dwell_log が繋がって初めて成立する、dwell_log を持つ理由そのものの機能。
 */
function buildWhereIsItemText(itemName) {
  var lostRows = getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.LOST && row.item === itemName;
  });

  if (lostRows.length === 0) return '「' + itemName + '」の未回収の記録はありません';

  var lines = [];
  lostRows.forEach(function (row) {
    var dateStr = formatDateValue_(row['持出日']);
    lines.push(itemName + ' / ' + (dateStr || '日付不明'));

    var dwells = getAllRows(SHEET_NAMES.DWELL_LOG).filter(function (d) {
      return formatDateValue_(d['日付']) === dateStr;
    });
    if (dwells.length === 0) {
      lines.push('  その日の滞在記録はありません');
      return;
    }
    dwells.forEach(function (d) {
      var label = d['ラベル'] ? d['ラベル'] : '(未設定)';
      lines.push('  ' + d['到着'] + '-' + d['出発'] + ' ' + label);
    });
  });
  return lines.join('\n');
}
