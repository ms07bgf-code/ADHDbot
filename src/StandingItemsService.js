/**
 * StandingItemsService.js
 * 常備品マスタ (§4.3)。通常の朝pushには絶対に含めない。
 * 用途はオンデマンド確認 (§5.1b) と週次棚卸し (§5.1c) の2つのみ。
 */

function getAllStandingItems() {
  return getAllRows(SHEET_NAMES.STANDING_ITEMS).filter(function (row) {
    return row['有効'] !== false;
  }).map(function (row) { return row.item; });
}
