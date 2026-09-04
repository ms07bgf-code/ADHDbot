/**
 * 動的アンカー状態機械（層B / §7）の動作検証。
 * GASのAPIをスタブしてnodeで実行する: リポジトリルートで `node test/dwell_test.js`
 *
 * 閾値（滞在半径150m / 離脱半径300m / 滞在30分 など）を CONFIG.DWELL で調整したあと、
 * 想定どおりの発火・沈黙になるかをここで確認してからデプロイすること。
 */
const fs = require('fs');
const vm = require('vm');

function buildContext() {
  const store = {};
  const pushes = [];
  const dwellRows = [];
  const logs = [];
  let carrying = [];

  const ctx = {
    console,
    Math, JSON, Array, Date, parseFloat, parseInt, isNaN, String, Object,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; }
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'HH:mm') return p(d.getHours()) + ':' + p(d.getMinutes());
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    // 他ファイル由来の依存をスタブ
    writeLog: (event, detail) => { logs.push({ event, detail }); },
    recordDwell: (anchor, arrivedAt, departedAt) => { dwellRows.push({ anchor, arrivedAt, departedAt }); },
    getCarryingItems: () => carrying,
    sendPush: (text, priority, qr, type) => { pushes.push({ text, priority, type }); return true; },
    formatDate_: (d) => d.toISOString().slice(0, 10),
    // テスト用フック
    __state: { store, pushes, dwellRows, logs, setCarrying: (v) => { carrying = v; } }
  };
  vm.createContext(ctx);
  ['src/Config.js', 'src/Geo.js', 'src/DwellDetectionService.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  PASS: ' + name); }
  else { console.log('  FAIL: ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); failures++; }
}

// 緯度0.001度 ≒ 111m
const BASE_LAT = 35.6812, BASE_LNG = 139.7671;
function post(ctx, lat, lng, minutesFromStart, t0) {
  const now = new Date(t0.getTime() + minutesFromStart * 60000);
  return ctx.processLocationPoint_(lat, lng, now);
}

// --- A: 35分の滞在で DWELLING に入る ---
console.log('A: 滞在判定（5分間隔で35分）');
{
  const ctx = buildContext();
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  let last;
  for (let m = 0; m <= 35; m += 5) {
    // 半径150m以内の微小なゆらぎ（約±55m）を与える
    last = post(ctx, BASE_LAT + (m % 10 === 0 ? 0.0005 : -0.0005), BASE_LNG, m, t0);
  }
  check('DWELLING に遷移する', last.state === 'DWELLING', last);
  const st = JSON.parse(ctx.__state.store['dwell_state']);
  check('アンカーが重心として保持される', st.anchor && Math.abs(st.anchor.lat - BASE_LAT) < 0.001, st);
}

// --- B: 300m超で離脱し、記録とpushが出る ---
console.log('B: 離脱判定とリマインド');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([{ item: '傘' }, { item: '弁当箱' }]);
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  for (let m = 0; m <= 35; m += 5) post(ctx, BASE_LAT, BASE_LNG, m, t0);
  // 約778m north（文面しきい値500m超）
  const res = post(ctx, BASE_LAT + 0.007, BASE_LNG, 40, t0);
  check('MOVING に戻る', res.state === 'MOVING', res);
  check('dwell_log に1件記録される', ctx.__state.dwellRows.length === 1, ctx.__state.dwellRows);
  check('pushが1件出る', ctx.__state.pushes.length === 1, ctx.__state.pushes);
  check('持出中の品名が入る', ctx.__state.pushes[0] && ctx.__state.pushes[0].text.indexOf('傘') === 0, ctx.__state.pushes[0]);
  check('500m超なので「置いてきた？」形', ctx.__state.pushes[0] && /置いてきた/.test(ctx.__state.pushes[0].text), ctx.__state.pushes[0]);
  check('優先度1（移動検知push）', ctx.__state.pushes[0] && ctx.__state.pushes[0].priority === 1);
  check('作業バッファが破棄される（直近1点のみ）', JSON.parse(ctx.__state.store['dwell_points']).length === 1);
}

// --- B2: 境界を跨いだ直後（300〜500m）は単語のみ ---
console.log('B2: 近距離離脱の文面');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([{ item: '傘' }]);
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  for (let m = 0; m <= 35; m += 5) post(ctx, BASE_LAT, BASE_LNG, m, t0);
  post(ctx, BASE_LAT + 0.0035, BASE_LNG, 40, t0); // 約389m
  check('pushが出る', ctx.__state.pushes.length === 1, ctx.__state.pushes);
  check('単語のみ（取りに戻れる）', ctx.__state.pushes[0] && ctx.__state.pushes[0].text === '傘', ctx.__state.pushes[0]);
}

// --- C: 報告欠落ガード（2点が30分空いているだけ） ---
console.log('C: 報告欠落を滞在と誤認しない');
{
  const ctx = buildContext();
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  post(ctx, BASE_LAT, BASE_LNG, 0, t0);
  const last = post(ctx, BASE_LAT, BASE_LNG, 35, t0);
  check('DWELLING に入らない', last.state !== 'DWELLING', last);
}

// --- D: 移動中は滞在にならない ---
console.log('D: 移動中');
{
  const ctx = buildContext();
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  let last;
  for (let m = 0; m <= 40; m += 5) last = post(ctx, BASE_LAT + m * 0.002, BASE_LNG, m, t0);
  check('DWELLING に入らない', last.state !== 'DWELLING', last);
}

// --- E: ヒステリシス（150m超300m以内では発火しない） ---
console.log('E: ヒステリシス');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([{ item: '傘' }]);
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  for (let m = 0; m <= 35; m += 5) post(ctx, BASE_LAT, BASE_LNG, m, t0);
  const res = post(ctx, BASE_LAT + 0.002, BASE_LNG, 40, t0); // 約222m
  check('DWELLING を維持する', res.state === 'DWELLING', res);
  check('pushは出ない', ctx.__state.pushes.length === 0, ctx.__state.pushes);
}

// --- F: 持出中0件なら沈黙 ---
console.log('F: 持出中0件は沈黙');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([]);
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  for (let m = 0; m <= 35; m += 5) post(ctx, BASE_LAT, BASE_LNG, m, t0);
  post(ctx, BASE_LAT + 0.004, BASE_LNG, 40, t0);
  check('pushは出ない', ctx.__state.pushes.length === 0, ctx.__state.pushes);
  check('dwell_log には記録される', ctx.__state.dwellRows.length === 1);
}

// --- G: 自宅アンカーは層Aに任せて沈黙 ---
console.log('G: 自宅アンカーの抑止');
{
  const ctx = buildContext();
  ctx.__state.setCarrying([{ item: '傘' }]);
  ctx.__state.store['HOME_LAT'] = String(BASE_LAT);
  ctx.__state.store['HOME_LNG'] = String(BASE_LNG);
  const t0 = new Date('2026-09-04T10:00:00+09:00');
  for (let m = 0; m <= 35; m += 5) post(ctx, BASE_LAT, BASE_LNG, m, t0);
  post(ctx, BASE_LAT + 0.004, BASE_LNG, 40, t0);
  check('pushは出ない', ctx.__state.pushes.length === 0, ctx.__state.pushes);
  const suppressed = ctx.__state.logs.filter((l) => l.event === 'suppressed');
  check('suppressed が記録される', suppressed.length === 1, suppressed);
}

console.log(failures === 0 ? '\nすべて通過' : '\n失敗: ' + failures);
process.exit(failures === 0 ? 0 : 1);
