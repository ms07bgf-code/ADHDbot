/**
 * 予防push（平日15:00 / §5.2）の発火条件の検証。
 * リポジトリルートで `node test/prevention_push_test.js`
 *
 * 層Bの離脱検知が当日動いていれば、実際の離脱で鳴るので固定時刻の代役は不要。
 * 検知が来ていない日だけフォールバックとして鳴らす (§1 の排他)。
 */
const fs = require('fs');
const vm = require('vm');

function buildContext() {
  const store = {};
  const pushes = [];
  const logs = [];
  let carrying = [];
  let morningResponded = true;

  const ctx = {
    console, Math, JSON, String, Date, parseInt, isNaN, Array,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); }
      })
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'HH:mm') return p(d.getHours()) + ':' + p(d.getMinutes());
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    CalendarApp: { getDefaultCalendar: () => ({ getEventsForDay: () => [] }) },
    getAllRows: () => [],
    getCarryingItems: () => carrying,
    hasMorningResponseToday: () => morningResponded,
    sendPush: (text, priority, qr, type) => { pushes.push({ text, priority, type }); return true; },
    __state: {
      store, pushes, logs,
      setCarrying: (v) => { carrying = v; },
      setMorningResponded: (v) => { morningResponded = v; }
    }
  };
  vm.createContext(ctx);
  ['src/Config.js', 'src/RoutineItemsService.js', 'src/LogService.js',
   'src/RelativeDateParser.js', 'src/Triggers.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  vm.runInContext('writeLog = function (event, detail) { __state.logs.push({ event: event, detail: detail }); };', ctx);
  return ctx;
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS: ' + name);
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

const MON = new Date('2026-09-07T15:00:00');  // 月曜
const SUN = new Date('2026-09-06T15:00:00');  // 日曜
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

console.log('見送る条件');
{
  const ctx = buildContext();
  check('休日は鳴らさない', ctx.preventionSkipReason_(SUN) === 'weekend', ctx.preventionSkipReason_(SUN));
}
{
  const ctx = buildContext();
  ctx.__state.store['fired_date_dwell_exit'] = ymd(MON);
  check('層Bが当日離脱を検知していれば見送る', ctx.preventionSkipReason_(MON) === 'dwell_detection_active', ctx.preventionSkipReason_(MON));
}
{
  const ctx = buildContext();
  ctx.__state.store['fired_date_dwell_exit'] = '2026-09-01'; // 前日以前
  check('層Bの検知が別日なら見送らない', ctx.preventionSkipReason_(MON) === null, ctx.preventionSkipReason_(MON));
}
{
  const ctx = buildContext();
  ctx.__state.setMorningResponded(false);
  check('朝pushに応答がなければ見送る', ctx.preventionSkipReason_(MON) === 'no_morning_response', ctx.preventionSkipReason_(MON));
}
{
  const ctx = buildContext();
  check('平日・層B未発火・朝応答ありなら鳴らしてよい', ctx.preventionSkipReason_(MON) === null, ctx.preventionSkipReason_(MON));
}

console.log('実際の発火');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([{ item: '傘' }, { item: '弁当箱' }]);
  ctx.preventionPushTrigger();
  const isWeekdayNow = [1, 2, 3, 4, 5].indexOf(new Date().getDay()) !== -1;
  if (isWeekdayNow) {
    check('持出中を読み上げる', ctx.__state.pushes[0] && ctx.__state.pushes[0].text === '傘、弁当箱', ctx.__state.pushes);
    check('優先度3', ctx.__state.pushes[0].priority === 3);
  } else {
    check('休日なので沈黙（今日が休日のため発火の確認はスキップ）', ctx.__state.pushes.length === 0);
  }
}
{
  const ctx = buildContext();
  ctx.__state.setCarrying([]);
  ctx.preventionPushTrigger();
  check('持出中0件なら沈黙', ctx.__state.pushes.length === 0, ctx.__state.pushes);
}

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
