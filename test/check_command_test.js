/**
 * オンデマンド確認（「チェック」）に出す予約一覧の検証。
 * リポジトリルートで `node test/check_command_test.js`
 *
 * 相対日付の記法 (§5.3a) が7日先までしか表現できないため日数上限は設けず、
 * 予定日が今日以降の予約を日付順で全件出す。
 */
const fs = require('fs');
const vm = require('vm');

let rows = [];
const ctx = {
  console, Math, JSON, String, Date, isNaN, Array,
  getAllRows: () => rows,
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'M/d') return (d.getMonth() + 1) + '/' + d.getDate();
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
  }
};
vm.createContext(ctx);
['src/Config.js', 'src/RoutineItemsService.js', 'src/LogService.js', 'src/CarryItemsService.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS: ' + name);
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

console.log('「チェック」の予約一覧');

rows = [
  { _row: 2, item: '書類', '予定日': iso(7), '状態': '予約' },
  { _row: 3, item: '診察券', '予定日': iso(2), '状態': '予約' },
  { _row: 4, item: '返却本', '予定日': iso(-1), '状態': '予約' },   // 過去 → 出さない
  { _row: 5, item: '傘', '予定日': iso(1), '状態': '持出中' },      // 予約でない → 出さない
  { _row: 6, item: 'ジム用品', '予定日': iso(1), '状態': '予約' }
];

const upcoming = ctx.getUpcomingReservedItems();
check('予約だけを返す', upcoming.every((r) => r['状態'] === '予約'), upcoming.map((r) => r.item));
check('過去の予定日は含めない', !upcoming.some((r) => r.item === '返却本'), upcoming.map((r) => r.item));
check('日付の昇順に並ぶ', JSON.stringify(upcoming.map((r) => r.item)) === JSON.stringify(['ジム用品', '診察券', '書類']), upcoming.map((r) => r.item));

const today = new Date();
check('日付は M/d(曜) 形式', ctx.formatShortDate_(iso(0)) === (today.getMonth() + 1) + '/' + today.getDate() + '(' + '日月火水木金土'[today.getDay()] + ')', ctx.formatShortDate_(iso(0)));

rows = [];
check('予約が無ければ空配列', ctx.getUpcomingReservedItems().length === 0);

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
