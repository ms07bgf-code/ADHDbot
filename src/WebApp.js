/**
 * WebApp.js
 * Web App のエントリポイント。
 * 同一の doPost を、(1) LINE Messaging API の Webhook、(2) 自宅離脱通知（iOSショートカット/Wi-Fi切断 / 層A）、
 * (3) 位置ロガー(OwnTracks)からの位置情報POST（層B）の3つから受ける
 * (§5.0: 「実装は同じ doPost を叩くだけ」)。ペイロードの形で振り分ける。
 */

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'invalid_json' });
  }

  if (body.events) {
    handleLineWebhook(body);
    return jsonResponse_({ ok: true });
  }

  var params = (e && e.parameter) ? e.parameter : {};

  // OwnTracks からのPOST（層B）。
  // location 以外の種別(lwt / transition / waypoint 等)も届くため、位置以外は黙って無視する。
  // OwnTracks はレスポンスとしてJSON配列を期待するので、常に空配列を返す。
  if (body._type) {
    if (body._type === 'location') handleLocationPost(body, params);
    return jsonResponse_([]);
  }

  // OwnTracks以外のロガー、および手動テスト用。
  if (body.hasOwnProperty('lat') && (body.hasOwnProperty('lng') || body.hasOwnProperty('lon'))) {
    return jsonResponse_(handleLocationPost(body, params));
  }

  // 自宅離脱通知（層A）
  if (body.hasOwnProperty('secret')) {
    return jsonResponse_(handleHomeDeparture(body));
  }

  return jsonResponse_({ ok: false, error: 'unrecognized_payload' });
}

function doGet(e) {
  return ContentService.createTextOutput('OK');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
