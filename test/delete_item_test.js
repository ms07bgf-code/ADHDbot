/**
 * 誤登録の取り消しの検証。
 * リポジトリルートで `node test/delete_item_test.js`
 */
const fs = require('fs');
const vm = require('vm');

let rows = [];
let deleted = [];
const ctx = {
  console, Math, JSON, String, Date, isNaN, Array,
  getAllRows: () => rows,
  deleteRow: (sheet, row) => { deleted.push(row.id); },
  getOrCreateSheet_: () => ({ getName: () => 'log' }),
  appendRow: () => {},
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      if (fmt === 'M/d') return (d.getMonth() + 1) + '/' + d.getDate();
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
  }
};
vm.createContext(ctx);
['src/Config.js', 'src/RoutineItemsService.js', 'src/LogService.js', 'src/LineService.js',
 'src/CarryItemsService.js', 'src/MessageRouter.js']
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

console.log('誤登録の取り消し');

rows = [
  { _row: 2, id: 'a', item: '診察券', '予定日': iso(2), '状態': '予約' },
  { _row: 3, id: 'b', item: '傘', '予定日': iso(0), '状態': '持出中' },
  { _row: 4, id: 'c', item: '弁当箱', '予定日': iso(-2), '状態': '回収済' },  // 履歴 → 対象外
  { _row: 5, id: 'd', item: '本', '予定日': iso(-5), '状態': '予約' },        // 過去 → 対象外
  { _row: 6, id: 'e', item: '鍵', '予定日': iso(-1), '状態': '未回収' }       // 「見つかった」で戻す → 対象外
];

const deletable = ctx.getDeletableItems().map((r) => r.id);
check('予約(今日以降)と持出中だけが対象', JSON.stringify(deletable) === JSON.stringify(['a', 'b']), deletable);

check('ラベルは押すと消えると分かる文言', /^取消 /.test(ctx.buildDeleteLabel_(rows[0])), ctx.buildDeleteLabel_(rows[0]));
check('予約のラベルには日付と曜日が付く', /^取消 \d+\/\d+\(.\) 診察券$/.test(ctx.buildDeleteLabel_(rows[0])), ctx.buildDeleteLabel_(rows[0]));
check('持出中のラベルは品名のみ', ctx.buildDeleteLabel_(rows[1]) === '取消 傘', ctx.buildDeleteLabel_(rows[1]));

const longRow = { id: 'x', item: 'あ'.repeat(40), '予定日': iso(0), '状態': '持出中' };
const longLabel = ctx.buildDeleteLabel_(longRow);
check('ラベルはLINEの上限20文字に収まる', longLabel.length <= 20, longLabel.length);

check('指定したidの行を消して品名を返す', ctx.deleteCarryItemById('a') === '診察券' && deleted[0] === 'a', deleted);
check('存在しないidはnullを返す', ctx.deleteCarryItemById('zzz') === null);

rows = [];
check('対象が無ければ空配列', ctx.getDeletableItems().length === 0);

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
