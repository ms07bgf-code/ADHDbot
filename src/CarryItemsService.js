/**
 * CarryItemsService.js
 * carry_items 台帳の状態管理 (§4.1)。
 *
 * 状態遷移:
 *   (相対日付付きで登録) → 予約 → (予定日の朝) 朝pushに掲載 → 持出中
 *   (当日登録/天気・ルーチン・予定由来で「持った」) → 持出中(新規行) → (24:00 みなし) → 回収済
 *   持出中 → (「なくした/忘れた」申告) → 未回収 → (翌朝再提示) → (「見つかった」で回収済)
 */

/** 今日を予定日とする「予約」状態の行を取得する。 */
function getTodayReservedItems() {
  var today = formatDate_(new Date());
  return getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.RESERVED && formatDateValue_(row['予定日']) === today;
  });
}

/**
 * 予定日が今日以降の予約を日付順で返す（オンデマンド確認用 / §5.1b）。
 * 相対日付の記法 (§5.3a) が7日先までしか表現できないため、日数の上限は設けず全件返す。
 */
function getUpcomingReservedItems() {
  var today = formatDate_(new Date());
  return getAllRows(SHEET_NAMES.CARRY_ITEMS)
    .filter(function (row) {
      return row['状態'] === CARRY_STATE.RESERVED && formatDateValue_(row['予定日']) >= today;
    })
    .sort(function (a, b) {
      var x = formatDateValue_(a['予定日']);
      var y = formatDateValue_(b['予定日']);
      return x < y ? -1 : (x > y ? 1 : 0);
    });
}

/** 現在「未回収」の行を全件取得する（翌朝再提示用 / §4.1）。 */
function getLostItems() {
  return getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.LOST;
  });
}

/** 現在「持出中」の行を全件取得する。 */
function getCarryingItems() {
  return getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.CARRYING;
  });
}

/** 相対日付付き、または当日の手動登録 (§5.3, §5.3a)。 */
function registerManualItem(itemName) {
  var parsed = parseRelativeDate(itemName);
  var sheet = getOrCreateSheet_(SHEET_NAMES.CARRY_ITEMS);
  var today = formatDate_(new Date());

  if (parsed.dateStr === today) {
    // 当日分はそのまま候補として扱う。実体化は他の当日候補と同様「持った」で行う設計だが、
    // 手動登録は明示的な行動なので即時に持出中として記録する。
    appendRow(sheet, {
      id: generateId_(),
      item: parsed.item,
      '予定日': today,
      '持出日': today,
      '状態': CARRY_STATE.CARRYING,
      '発生元': CARRY_SOURCE.MANUAL,
      '更新日時': new Date()
    });
  } else {
    appendRow(sheet, {
      id: generateId_(),
      item: parsed.item,
      '予定日': parsed.dateStr,
      '持出日': '',
      '状態': CARRY_STATE.RESERVED,
      '発生元': CARRY_SOURCE.MANUAL,
      '更新日時': new Date()
    });
  }

  writeLog('manual_register', { item: parsed.item, 予定日: parsed.dateStr });
  checkPromotionCandidate(parsed.item, parsed.dateStr);
  return parsed;
}

/** 朝push経由でない、天気・ルーチン・予定由来の候補を「持った」時点で新規登録する。 */
function registerCarryingFromCandidate(itemName, source) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.CARRY_ITEMS);
  var today = formatDate_(new Date());
  appendRow(sheet, {
    id: generateId_(),
    item: itemName,
    '予定日': today,
    '持出日': today,
    '状態': CARRY_STATE.CARRYING,
    '発生元': source,
    '更新日時': new Date()
  });
}

/** 予約行を「持出中」に更新する（予定日を迎えて「持った」が押された場合）。 */
function markReservedAsCarrying(rowId) {
  var rows = getAllRows(SHEET_NAMES.CARRY_ITEMS);
  var row = rows.filter(function (r) { return r.id === rowId; })[0];
  if (!row) return;
  updateRowFields(SHEET_NAMES.CARRY_ITEMS, row, {
    '状態': CARRY_STATE.CARRYING,
    '持出日': formatDate_(new Date()),
    '更新日時': new Date()
  });
}

/** 「なくした/忘れた <item>」申告。直近の持出中行を未回収に落とす。 */
function markItemAsLost(itemName) {
  var rows = getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.CARRYING && row.item === itemName;
  });
  if (rows.length === 0) return false;
  // 更新日時が最新の行を対象にする
  rows.sort(function (a, b) { return new Date(b['更新日時']) - new Date(a['更新日時']); });
  updateRowFields(SHEET_NAMES.CARRY_ITEMS, rows[0], {
    '状態': CARRY_STATE.LOST,
    '更新日時': new Date()
  });
  writeLog('marked_lost', { item: itemName });
  return true;
}

/** 「見つかった <item>」で未回収を回収済に戻す。 */
function markItemAsFound(itemName) {
  var rows = getAllRows(SHEET_NAMES.CARRY_ITEMS).filter(function (row) {
    return row['状態'] === CARRY_STATE.LOST && row.item === itemName;
  });
  if (rows.length === 0) return false;
  rows.forEach(function (row) {
    updateRowFields(SHEET_NAMES.CARRY_ITEMS, row, {
      '状態': CARRY_STATE.RECOVERED,
      '更新日時': new Date()
    });
  });
  writeLog('marked_found', { item: itemName });
  return true;
}

/** 24:00 みなし回収 (§5.2a)。持出中を全て回収済にする。夜間トリガーから呼ぶ。 */
function sweepCarryingToRecovered() {
  var rows = getCarryingItems();
  rows.forEach(function (row) {
    updateRowFields(SHEET_NAMES.CARRY_ITEMS, row, {
      '状態': CARRY_STATE.RECOVERED,
      '更新日時': new Date()
    });
  });
  if (rows.length > 0) {
    writeLog('auto_recovered', { count: rows.length, items: rows.map(function (r) { return r.item; }) });
  }
}

/**
 * 予定日超過の予約 / 古い未回収を落とす (§4.1, §10 暫定 N日)。
 * 日次トリガーから呼ぶ。
 */
function cleanupOverdueCarryItems() {
  var today = new Date();
  var thresholdMs = CONFIG.RESERVATION_OVERDUE_DROP_DAYS * 24 * 60 * 60 * 1000;
  var rows = getAllRows(SHEET_NAMES.CARRY_ITEMS);
  var dropped = [];

  // 後ろから消すと行番号がずれないため逆順に処理
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    var refDateStr = row['状態'] === CARRY_STATE.RESERVED ? row['予定日'] : row['持出日'];
    if (row['状態'] !== CARRY_STATE.RESERVED && row['状態'] !== CARRY_STATE.LOST) continue;
    if (!refDateStr) continue;
    var refDate = new Date(formatDateValue_(refDateStr));
    if (isNaN(refDate.getTime())) continue;
    if (today.getTime() - refDate.getTime() > thresholdMs) {
      deleteRow(SHEET_NAMES.CARRY_ITEMS, row);
      dropped.push({ item: row.item, 状態: row['状態'] });
    }
  }

  if (dropped.length > 0) {
    writeLog('overdue_dropped', { items: dropped });
  }
}

function formatDateValue_(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDate_(value);
  return String(value);
}
