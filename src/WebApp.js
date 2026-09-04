/**
 * WebApp.js
 * Web App のエントリポイント。
 * 同一の doPost を、(1) LINE Messaging API の Webhook、(2) 自宅離脱通知（iOSショートカット/Wi-Fi切断 / 層A）、
 * (3) 位置ロガーからの位置情報POST（層B）の3つから受ける
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

  // 位置ロガーからのPOST（層B）。lat/lng を持つものは滞在→離脱の状態機械へ回す。
  if (body.hasOwnProperty('lat') && body.hasOwnProperty('lng')) {
    return jsonResponse_(handleLocationPost(body));
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
