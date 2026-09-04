/**
 * HomeDepartureService.js
 * 自宅離脱検知（層A / MVP / §5.4）。
 *
 *   端末（iOSショートカット「出発」/ 自宅Wi-Fi切断）
 *     → GAS Web App doPost
 *       → シークレット検証 / ディバウンス（5分） / LockService
 *       → その日の1回目か2回目以降かで分ける
 *
 * 1回目（朝の外出）: 朝pushの取りこぼしを拾う最終通告。
 *   朝pushに応答あり → 沈黙 / 応答なし → 今朝の候補を読み上げる
 *   離脱時刻を departure_log に記録する
 *
 * 2回目以降（夕方に一度帰宅してから再度出るなど）: 持出中を読み上げる。
 *   今朝の候補はもう関係がなく、「今日持って出ると決めた物」を確認したい場面のため。
 *   15:00の予防push (§5.2) と同じ考え方。持出中0件なら沈黙する。
 *   departure_log には記録しない（出発時刻推定は朝の分布を見るもので、
 *   夕方の外出を混ぜると分布が二峰性になる / §7.5.2）。
 */

function handleHomeDeparture(body) {
  var props = PropertiesService.getScriptProperties();
  var expectedSecret = props.getProperty(PROP_KEYS.WEBHOOK_SECRET);

  if (!expectedSecret || body.secret !== expectedSecret) {
    writeLog('departure_rejected', { reason: 'invalid_secret' });
    return { ok: false, error: 'invalid_secret' };
  }

  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(5000);
  if (!gotLock) {
    writeLog('departure_rejected', { reason: 'lock_timeout' });
    return { ok: false, error: 'lock_timeout' };
  }

  try {
    var today = formatDate_(new Date());
    var isFirstToday = props.getProperty(PROP_KEYS.FIRED_DEPARTURE) !== today;

    // ジオフェンスとWi-Fi切断の両方を設定していると同じ離脱で二重に叩かれるため、
    // 1回目・2回目以降のどちらでもディバウンスを効かせる。
    var now = new Date().getTime();
    var lastTsStr = props.getProperty(PROP_KEYS.LAST_DEPARTURE_DEBOUNCE);
    var lastTs = lastTsStr ? parseInt(lastTsStr, 10) : 0;
    if (now - lastTs < CONFIG.DEPARTURE_DEBOUNCE_MINUTES * 60 * 1000) {
      writeLog('departure_ignored', { reason: 'debounced' });
      return { ok: true, ignored: 'debounced' };
    }
    props.setProperty(PROP_KEYS.LAST_DEPARTURE_DEBOUNCE, String(now));

    return isFirstToday
      ? handleFirstDeparture_(props, today)
      : handleSubsequentDeparture_();
  } finally {
    lock.releaseLock();
  }
}

/** その日の1回目の離脱。朝pushの取りこぼしを拾う。 */
function handleFirstDeparture_(props, today) {
  // 離脱時刻は常に記録する（出発時刻推定の学習データ / §7.5）
  recordDeparture(new Date());
  props.setProperty(PROP_KEYS.FIRED_DEPARTURE, today);

  if (hasMorningResponseToday()) {
    writeLog('suppressed', { pushType: 'departure', reason: 'morning_responded' });
    return { ok: true, pushed: false };
  }

  var raw = props.getProperty('morning_candidates_' + today);
  var candidates = raw ? JSON.parse(raw) : [];
  if (candidates.length === 0) {
    writeLog('no_items', { pushType: 'departure' });
    return { ok: true, pushed: false };
  }

  var text = candidates.map(function (c) { return c.name; }).join('、');
  sendPush(text, CONFIG.PUSH_PRIORITY.DEPARTURE, null, 'departure');
  return { ok: true, pushed: true };
}

/**
 * その日の2回目以降の離脱。持出中を読み上げる。
 * 持出中は自分で登録したときにしか入らないため、何も登録していない日は
 * 何回出入りしても沈黙する（「持った」を宣言として扱う方針と一貫させる）。
 */
function handleSubsequentDeparture_() {
  var carrying = getCarryingItems();
  if (carrying.length === 0) {
    writeLog('no_items', { pushType: 'departure_again' });
    return { ok: true, pushed: false };
  }

  var text = carrying.map(function (r) { return r.item; }).join('、');
  sendPush(text, CONFIG.PUSH_PRIORITY.DEPARTURE, null, 'departure_again');
  return { ok: true, pushed: true };
}
