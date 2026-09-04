/**
 * リッチメニュー定義の検証。
 * リポジトリルートで `node test/rich_menu_test.js`
 *
 * ボタンの領域は隙間なく全幅を覆う必要がある。隙間があるとそこを押しても無反応になり、
 * 重なると意図しないボタンが反応する。
 */
const fs = require('fs');
const vm = require('vm');

const ctx = { console, Math, JSON, Array, String };
vm.createContext(ctx);
['src/Config.js', 'src/RichMenuService.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS: ' + name);
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

function verifyTiling(labels) {
  ctx.CONFIG.RICH_MENU.BUTTONS = labels;
  const def = ctx.buildRichMenuDefinition_();
  const w = ctx.CONFIG.RICH_MENU.WIDTH;
  const h = ctx.CONFIG.RICH_MENU.HEIGHT;

  check(labels.length + 'つ: ボタン数だけ領域ができる', def.areas.length === labels.length);
  check(labels.length + 'つ: 隙間も重なりもなく横に並ぶ', def.areas.every((a, i) => {
    const prev = i === 0 ? null : def.areas[i - 1];
    return a.bounds.x === (prev ? prev.bounds.x + prev.bounds.width : 0);
  }), def.areas.map((a) => a.bounds));
  const last = def.areas[def.areas.length - 1];
  check(labels.length + 'つ: 右端まで覆う（端数を切り捨てない）', last.bounds.x + last.bounds.width === w, last.bounds);
  check(labels.length + 'つ: 高さは全域', def.areas.every((a) => a.bounds.y === 0 && a.bounds.height === h));
  check(labels.length + 'つ: 押すと設定した文字列を送る', JSON.stringify(def.areas.map((a) => a.action.text)) === JSON.stringify(labels), def.areas.map((a) => a.action));
}

console.log('リッチメニューの定義');
verifyTiling(['チェック', '履歴']);
verifyTiling(['チェック', '履歴', 'メモ']); // 2500/3 は割り切れない

ctx.CONFIG.RICH_MENU.BUTTONS = ['チェック', '履歴'];
const def = ctx.buildRichMenuDefinition_();
check('LINEが受け付けるサイズ', def.size.width === 2500 && (def.size.height === 843 || def.size.height === 1686), def.size);
check('既定で開いた状態にする', def.selected === true);

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
