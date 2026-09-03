/**
 * HomeDepartureService.js
 * 自宅離脱検知（層A / MVP / §5.4）。
 *
 *   端末（iOSショートカット「出発」/ 自宅Wi-Fi切断）
 *     → GAS Web App doPost
 *       → シークレット検証
 *       → ディバウンス（5分）/ 当日発火済みチェック / LockService
 *       → 朝pushに応答があったか確認
 *          応答あり → 沈黙
 *          応答なし → 最終push
 *       → departure_log に離脱時刻を記録
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

    if (props.getProperty(PROP_KEYS.FIRED_DEPARTURE) === today) {
      writeLog('departure_ignored', { reason: 'already_fired_today' });
      return { ok: true, ignored: 'already_fired_today' };
    }

    var now = new Date().getTime();
    var lastTsStr = props.getProperty(PROP_KEYS.LAST_DEPARTURE_DEBOUNCE);
    var lastTs = lastTsStr ? parseInt(lastTsStr, 10) : 0;
    if (now - lastTs < CONFIG.DEPARTURE_DEBOUNCE_MINUTES * 60 * 1000) {
      writeLog('departure_ignored', { reason: 'debounced' });
      return { ok: true, ignored: 'debounced' };
    }
    props.setProperty(PROP_KEYS.LAST_DEPARTURE_DEBOUNCE, String(now));

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
  } finally {
    lock.releaseLock();
  }
}
