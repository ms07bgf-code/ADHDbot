/**
 * Geo.js
 * 距離計算の共通ヘルパー (§6: 移動検知は距離計算のみ。LLMは使わない)。
 */

var EARTH_RADIUS_M = 6371000;

/** 2点間の距離(m)。Haversine。 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 点群の重心。
 * 屋内はドリフトが大きく1点固定では100m以上ずれるため、アンカーには重心を使う (§7 実装上の注意)。
 * @param {Array} points [[lat, lng, ts], ...]
 */
function centroidOf(points) {
  if (points.length === 0) return null;
  var sumLat = 0;
  var sumLng = 0;
  points.forEach(function (p) {
    sumLat += p[0];
    sumLng += p[1];
  });
  return { lat: sumLat / points.length, lng: sumLng / points.length };
}

/** 点群の全ての点が中心から半径内に収まっているか。 */
function allWithinRadius_(points, center, radiusM) {
  return points.every(function (p) {
    return distanceMeters(p[0], p[1], center.lat, center.lng) <= radiusM;
  });
}
