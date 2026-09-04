/**
 * DwellDetectionService.js
 * 動的アンカーによる「滞在 → 離脱」検知（層B / §7）。
 *
 *   MOVING ──(直近K点が半径150m以内 かつ 30分以上)──→ DWELLING(anchor)
 *   DWELLING ──(anchorから300m超)──→ 離脱イベント発火 → MOVING
 *
 * 事前登録が不要なため、カフェ・店など「置き忘れ」が起きる地点をそのまま拾える。
 *
 * 責務分担 (§7):
 *   端末側 = 位置のPOSTのみ。判断ロジックを一切持たせない
 *   GAS側  = 滞在判定・離脱判定・発火可否・台帳突き合わせ
 *
 * プライバシー (§7):
 *   移動経路（軌跡）は保存しない。滞在地点のみ dwell_log に残す。
 *   状態機械の作業バッファ（ScriptProperties / 直近90分ぶん）は離脱時に破棄する。
 */

/**
 * 位置情報POSTの受け口。ロガーアプリから {secret, lat, lng} を受ける。
 * @returns {Object} 応答JSON
 */
function handleLocationPost(body) {
  var props = PropertiesService.getScriptProperties();
  var expectedSecret = props.getProperty(PROP_KEYS.WEBHOOK_SECRET);

  if (!expectedSecret || body.secret !== expectedSecret) {
    writeLog('location_rejected', { reason: 'invalid_secret' });
    return { ok: false, error: 'invalid_secret' };
  }

  var lat = parseFloat(body.lat);
  var lng = parseFloat(body.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: 'invalid_coordinates' };
  }

  // 境界上で往復すると数秒差で二重に叩かれるため LockService は必須 (§7)
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    writeLog('location_rejected', { reason: 'lock_timeout' });
    return { ok: false, error: 'lock_timeout' };
  }

  try {
    return processLocationPoint_(lat, lng, new Date());
  } finally {
    lock.releaseLock();
  }
}

function processLocationPoint_(lat, lng, now) {
  var nowSec = Math.floor(now.getTime() / 1000);

  var points = loadDwellPoints_();
  points.push([round5_(lat), round5_(lng), nowSec]);
  points = pruneDwellPoints_(points, nowSec);

  var state = loadDwellState_();
  var result = { ok: true, state: state.state };

  if (state.state === 'DWELLING') {
    var distance = distanceMeters(lat, lng, state.anchor.lat, state.anchor.lng);

    if (distance > CONFIG.DWELL.EXIT_RADIUS_M) {
      result = handleDwellExit_(state, distance, now);
      // 作業バッファは離脱時に破棄する (§7 プライバシー方針)。直近1点だけ次の判定の種として残す。
      saveDwellPoints_([[round5_(lat), round5_(lng), nowSec]]);
      return result;
    }

    // 滞在継続。アンカーは滞在中の点の重心で更新する（屋内ドリフト対策 / §7）
    var dwellPoints = points.filter(function (p) {
      return p[2] >= state.arrivedAt
        && distanceMeters(p[0], p[1], state.anchor.lat, state.anchor.lng) <= CONFIG.DWELL.STAY_RADIUS_M;
    });
    var updatedAnchor = centroidOf(dwellPoints);
    if (updatedAnchor) state.anchor = updatedAnchor;
    saveDwellState_(state);
    result.distanceM = Math.round(distance);
  } else {
    var dwell = detectDwellStart_(points, nowSec);
    if (dwell) {
      saveDwellState_({ state: 'DWELLING', anchor: dwell.anchor, arrivedAt: dwell.arrivedAt });
      writeLog('dwell_started', {
        arrivedAt: Utilities.formatDate(new Date(dwell.arrivedAt * 1000), CONFIG.TIMEZONE, 'HH:mm'),
        points: dwell.pointCount
      });
      result.state = 'DWELLING';
    }
  }

  saveDwellPoints_(points);
  return result;
}

/**
 * 滞在の開始を判定する。新しい点から遡り、重心から STAY_RADIUS_M 以内に収まる
 * 最長の連続区間を求め、時間・点数・報告間隔の条件を満たせば滞在とみなす。
 * @returns {?{anchor: Object, arrivedAt: number, pointCount: number}}
 */
function detectDwellStart_(points, nowSec) {
  if (points.length < CONFIG.DWELL.MIN_POINTS) return null;

  var best = null;
  for (var start = points.length - CONFIG.DWELL.MIN_POINTS; start >= 0; start--) {
    var window = points.slice(start);
    var center = centroidOf(window);
    if (!allWithinRadius_(window, center, CONFIG.DWELL.STAY_RADIUS_M)) break;
    best = { window: window, center: center };
  }
  if (!best) return null;

  var window = best.window;
  var durationMinutes = (nowSec - window[0][2]) / 60;
  if (durationMinutes < CONFIG.DWELL.MIN_STAY_MINUTES) return null;

  // 「点が2つで30分空いている」ような報告欠落を滞在と誤認しないためのガード (§7)
  if (window.length < CONFIG.DWELL.MIN_POINTS) return null;
  for (var i = 1; i < window.length; i++) {
    if ((window[i][2] - window[i - 1][2]) / 60 > CONFIG.DWELL.MAX_POINT_GAP_MINUTES) return null;
  }

  return { anchor: best.center, arrivedAt: window[0][2], pointCount: window.length };
}

/** 離脱イベント。dwell_log へ記録し、条件を満たせばリマインドpushを出す。 */
function handleDwellExit_(state, distanceM, now) {
  var props = PropertiesService.getScriptProperties();
  saveDwellState_({ state: 'MOVING' });

  var nowMs = now.getTime();
  var lastTsStr = props.getProperty(PROP_KEYS.LAST_DWELL_DEBOUNCE);
  var lastTs = lastTsStr ? parseInt(lastTsStr, 10) : 0;
  if (nowMs - lastTs < CONFIG.DWELL.DEBOUNCE_MINUTES * 60 * 1000) {
    writeLog('dwell_exit_ignored', { reason: 'debounced' });
    return { ok: true, state: 'MOVING', ignored: 'debounced' };
  }
  props.setProperty(PROP_KEYS.LAST_DWELL_DEBOUNCE, String(nowMs));

  recordDwell(state.anchor, new Date(state.arrivedAt * 1000), now);

  var pushed = pushDwellDepartureReminder_(state.anchor, distanceM);
  return { ok: true, state: 'MOVING', pushed: pushed };
}

/**
 * 離脱時のリマインドpush (§5.4)。
 * 持出中が0件なら沈黙する。自宅アンカーは層A（固定ジオフェンス）が担当するため対象外。
 * @returns {boolean} 送信したか
 */
function pushDwellDepartureReminder_(anchor, distanceM) {
  if (isNearHome_(anchor)) {
    writeLog('suppressed', { pushType: 'dwell_departure', reason: 'home_anchor_layer_a' });
    return false;
  }

  var carrying = getCarryingItems();
  if (carrying.length === 0) {
    writeLog('no_items', { pushType: 'dwell_departure' });
    return false;
  }

  var names = carrying.map(function (r) { return r.item; }).join('、');
  // 距離による文面切り替え (§5.4)。近ければ単語のみ（取りに戻れる）、
  // 遠ければ行動を要求せず記録だけ促す。
  var text = distanceM <= CONFIG.DEPARTURE_NEAR_DISTANCE_TEXT_THRESHOLD_M
    ? names
    : names + '、置いてきた？';

  return sendPush(text, CONFIG.PUSH_PRIORITY.DEPARTURE, null, 'dwell_departure');
}

function isNearHome_(anchor) {
  var props = PropertiesService.getScriptProperties();
  var homeLat = parseFloat(props.getProperty('HOME_LAT'));
  var homeLng = parseFloat(props.getProperty('HOME_LNG'));
  if (isNaN(homeLat) || isNaN(homeLng)) return false;
  return distanceMeters(anchor.lat, anchor.lng, homeLat, homeLng) <= CONFIG.DWELL.HOME_SUPPRESS_RADIUS_M;
}

// ===== 作業バッファ (ScriptProperties) =====

function loadDwellState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DWELL_STATE);
  if (!raw) return { state: 'MOVING' };
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { state: 'MOVING' };
  }
}

function saveDwellState_(state) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.DWELL_STATE, JSON.stringify(state));
}

function loadDwellPoints_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DWELL_POINTS);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveDwellPoints_(points) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.DWELL_POINTS, JSON.stringify(points));
}

/** 直近 BUFFER_MINUTES 分だけ残す。点数上限も設けて値サイズを抑える。 */
function pruneDwellPoints_(points, nowSec) {
  var cutoff = nowSec - CONFIG.DWELL.BUFFER_MINUTES * 60;
  var pruned = points.filter(function (p) { return p[2] >= cutoff; });
  if (pruned.length > CONFIG.DWELL.BUFFER_MAX_POINTS) {
    pruned = pruned.slice(pruned.length - CONFIG.DWELL.BUFFER_MAX_POINTS);
  }
  return pruned;
}

function round5_(value) {
  return Math.round(value * 100000) / 100000;
}
