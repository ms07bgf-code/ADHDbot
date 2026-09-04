/**
 * 自宅離脱（層A / §5.4）の検証。
 * リポジトリルートで `node test/home_departure_test.js`
 *
 * その日の1回目（朝の外出）と2回目以降（夕方に一度帰宅してから再度出る等）で
 * 読み上げる中身が変わる。
 */
const fs = require('fs');
const vm = require('vm');

function buildContext() {
  const store = {};
  const pushes = [];
  const logs = [];
  const departures = [];
  let carrying = [];
  let morningResponded = false;

  const ctx = {
    console, Math, JSON, String, Date, parseInt, isNaN, Array,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); }
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    writeLog: (event, detail) => { logs.push({ event, detail }); },
    recordDeparture: (d) => { departures.push(d); },
    getCarryingItems: () => carrying,
    hasMorningResponseToday: () => morningResponded,
    sendPush: (text, priority, qr, type) => { pushes.push({ text, priority, type }); return true; },
    __state: {
      store, pushes, logs, departures,
      setCarrying: (v) => { carrying = v; },
      setMorningResponded: (v) => { morningResponded = v; }
    }
  };
  vm.createContext(ctx);
  ['src/Config.js', 'src/LogService.js', 'src/HomeDepartureService.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  // LogService.js が実物の writeLog を定義するため、読み込み後に観測用へ差し替える
  vm.runInContext('writeLog = function (event, detail) { __state.logs.push({ event: event, detail: detail }); };', ctx);
  return ctx;
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS: ' + name);
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

const today = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();
const SECRET = { secret: 's3cret' };
const setup = (ctx) => { ctx.__state.store['WEBHOOK_SECRET'] = 's3cret'; };
// ディバウンス(5分)をまたいだ2回目を模擬する
const clearDebounce = (ctx) => { ctx.__state.store['last_departure_debounce_ts'] = '0'; };

console.log('1回目（朝の外出）');
{
  const ctx = buildContext();
  setup(ctx);
  ctx.__state.store['morning_candidates_' + today] = JSON.stringify([{ name: '傘' }, { name: 'ゴミ袋' }]);
  const res = ctx.handleHomeDeparture(SECRET);
  check('今朝の候補を読み上げる', ctx.__state.pushes[0] && ctx.__state.pushes[0].text === '傘、ゴミ袋', ctx.__state.pushes);
  check('pushTypeは departure', ctx.__state.pushes[0].type === 'departure');
  check('departure_log に記録する', ctx.__state.departures.length === 1);
  check('pushed:true を返す', res.pushed === true, res);
}
{
  const ctx = buildContext();
  setup(ctx);
  ctx.__state.setMorningResponded(true);
  ctx.__state.store['morning_candidates_' + today] = JSON.stringify([{ name: '傘' }]);
  ctx.handleHomeDeparture(SECRET);
  check('朝pushに応答済みなら沈黙', ctx.__state.pushes.length === 0, ctx.__state.pushes);
  check('沈黙しても departure_log には記録する', ctx.__state.departures.length === 1);
}

console.log('2回目以降（夕方に一度帰宅してから再度出る）');
{
  const ctx = buildContext();
  setup(ctx);
  ctx.__state.store['morning_candidates_' + today] = JSON.stringify([{ name: '傘' }]);
  ctx.handleHomeDeparture(SECRET); // 1回目
  clearDebounce(ctx);
  ctx.__state.setCarrying([{ item: 'トートバッグ' }, { item: '資料' }]);
  const res = ctx.handleHomeDeparture(SECRET); // 2回目

  check('持出中を読み上げる（今朝の候補ではない）', ctx.__state.pushes[1] && ctx.__state.pushes[1].text === 'トートバッグ、資料', ctx.__state.pushes);
  check('pushTypeは departure_again', ctx.__state.pushes[1].type === 'departure_again');
  check('優先度1（移動検知push）', ctx.__state.pushes[1].priority === 1);
  check('departure_log には記録しない（朝の分布を汚さない）', ctx.__state.departures.length === 1, ctx.__state.departures.length);
  check('pushed:true を返す', res.pushed === true, res);
}
{
  const ctx = buildContext();
  setup(ctx);
  ctx.handleHomeDeparture(SECRET); // 1回目（候補なし）
  clearDebounce(ctx);
  ctx.__state.setCarrying([]);
  ctx.handleHomeDeparture(SECRET); // 2回目
  check('持出中0件なら沈黙', ctx.__state.pushes.length === 0, ctx.__state.pushes);
  check('no_items を記録する', ctx.__state.logs.some((l) => l.event === 'no_items' && l.detail.pushType === 'departure_again'), ctx.__state.logs);
}

console.log('共通');
{
  const ctx = buildContext();
  setup(ctx);
  ctx.__state.store['morning_candidates_' + today] = JSON.stringify([{ name: '傘' }]);
  ctx.handleHomeDeparture(SECRET);
  const res = ctx.handleHomeDeparture(SECRET); // ディバウンスを解除せず連続
  check('5分以内の再送はディバウンスで無視', res.ignored === 'debounced' && ctx.__state.pushes.length === 1, res);
}
{
  const ctx = buildContext();
  setup(ctx);
  const res = ctx.handleHomeDeparture({ secret: 'wrong' });
  check('誤ったシークレットを拒否する', res.ok === false && res.error === 'invalid_secret', res);
}

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
