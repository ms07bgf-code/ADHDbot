/**
 * 朝pushの「持った」案内文の検証。
 * リポジトリルートで `node test/morning_hint_test.js`
 *
 * 案内は最初の数回だけで打ち切る。毎朝同じ説明が付くと文面が伸び、
 * 単語だけを読ませる設計 (§5.1 / §1 原則4) が崩れるため。
 */
const fs = require('fs');
const vm = require('vm');

const store = {};
const ctx = {
  console, Math, JSON, String, parseInt,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); }
    })
  }
};
vm.createContext(ctx);
['src/Config.js', 'src/MorningPush.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
});

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS: ' + name);
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

const limit = ctx.CONFIG.MORNING_HINT_SHOW_COUNT;
console.log('「持った」案内文（上限 ' + limit + ' 回）');

const results = [];
for (let i = 0; i < limit + 3; i++) results.push(ctx.consumeMorningHint_());

check('最初の' + limit + '回は案内が出る', results.slice(0, limit).every((r) => typeof r === 'string' && r.length > 0), results);
check('上限を超えたら出ない', results.slice(limit).every((r) => r === null), results.slice(limit));
check('案内は質問形ではない (§1 原則4)', results[0].indexOf('？') === -1 && results[0].indexOf('?') === -1, results[0]);
check('回数がScriptPropertiesに残る', store['morning_hint_count'] === String(limit), store['morning_hint_count']);

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
