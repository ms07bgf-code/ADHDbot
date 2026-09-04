/**
 * SheetUtil.js
 * シートアクセスの共通ヘルパー。
 * 「1シート1責務」の原則(§3)に沿い、ロジックは各 *Service.js に置き、
 * ここでは行⇔オブジェクトの変換とCRUDのみを扱う。
 */

var SHEET_SCHEMAS = {
  carry_items: ['id', 'item', '予定日', '持出日', '状態', '発生元', '更新日時'],
  routine_items: ['item', '曜日', '有効'],
  standing_items: ['item', '有効'],
  event_items: ['keyword', 'items', '有効'],
  departure_log: ['date', '曜日', '離脱時刻', '予測時刻'],
  dwell_log: ['日付', '到着', '出発', 'lat', 'lng', 'ラベル'],
  log: ['timestamp', 'event', 'detail']
};

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/** 初回セットアップ: 全シートを作成しヘッダーを設定する。GASエディタから手動実行する。 */
function setupSpreadsheet() {
  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    var sheet = getOrCreateSheet_(name);
    var headers = SHEET_SCHEMAS[name];
    var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var needsHeader = headers.some(function (h, i) { return firstRow[i] !== h; });
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });

  // 既定のシートが空シート("シート1"等)として残っていたら削除
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (SHEET_SCHEMAS[name]) return;
    if (sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });

  // event_items 初期セット (§5.0) が空なら投入
  seedEventItemsIfEmpty_();

  Logger.log('setupSpreadsheet: done');
}

function seedEventItemsIfEmpty_() {
  var rows = getAllRows(SHEET_NAMES.EVENT_ITEMS);
  if (rows.length > 0) return;
  var sheet = getOrCreateSheet_(SHEET_NAMES.EVENT_ITEMS);
  EVENT_ITEMS_SEED.forEach(function (row) {
    appendRow(sheet, row);
  });
}

/** シート全行をヘッダー名をキーとしたオブジェクト配列で返す。行番号は _row に格納。 */
function getAllRows(sheetName) {
  var sheet = getOrCreateSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var results = [];
  for (var r = 0; r < values.length; r++) {
    var obj = { _row: r + 2 };
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
    }
    results.push(obj);
  }
  return results;
}

/** オブジェクトをシート定義のヘッダー順に変換して1行追加する。sheetはシート名でもシートオブジェクトでもよい。 */
function appendRow(sheet, obj) {
  var sheetObj = sheet.getName ? sheet : getOrCreateSheet_(sheet);
  var headers = SHEET_SCHEMAS[sheetObj.getName()];
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheetObj.appendRow(row);
}

/** _row を持つオブジェクトの指定列だけを更新する。 */
function updateRowFields(sheetName, rowRecord, fields) {
  var sheet = getOrCreateSheet_(sheetName);
  var headers = SHEET_SCHEMAS[sheetName];
  Object.keys(fields).forEach(function (key) {
    var colIndex = headers.indexOf(key);
    if (colIndex === -1) return;
    sheet.getRange(rowRecord._row, colIndex + 1).setValue(fields[key]);
  });
}

function deleteRow(sheetName, rowRecord) {
  var sheet = getOrCreateSheet_(sheetName);
  sheet.deleteRow(rowRecord._row);
}

function generateId_() {
  return Utilities.getUuid();
}
