/**
 * WebApp.js
 * Web App のエントリポイント。
 * 同一の doPost を、(1) LINE Messaging API の Webhook と (2) 自宅離脱通知（iOSショートカット/Wi-Fi切断）
 * の両方から受ける (§5.0: 「実装は同じ doPost を叩くだけ」)。ペイロードの形で振り分ける。
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

  if (body.hasOwnProperty('secret')) {
    var result = handleHomeDeparture(body);
    return jsonResponse_(result);
  }

  return jsonResponse_({ ok: false, error: 'unrecognized_payload' });
}

function doGet(e) {
  return ContentService.createTextOutput('OK');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
