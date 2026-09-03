/**
 * LineService.js
 * LINE Messaging API との入出力のみを担当する (§3 責務分担: LINEはロジックを持たせない)。
 */

var LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
var LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

/**
 * テキストpush。quickReplyItems: [{label:'持った', data:'carried:xxxx'}, ...] 形式(任意)。
 */
function linePush(text, quickReplyItems) {
  var token = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.LINE_TOKEN);
  var userId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.LINE_USER_ID);
  if (!token || !userId) {
    Logger.log('linePush: LINE_TOKEN/LINE_USER_ID 未設定のため送信をスキップしました: ' + text);
    return;
  }

  var message = { type: 'text', text: text };
  if (quickReplyItems && quickReplyItems.length > 0) {
    message.quickReply = { items: quickReplyItems.map(toQuickReplyButton_) };
  }

  var payload = { to: userId, messages: [message] };
  callLineApi_(LINE_PUSH_URL, token, payload);
}

function lineReply(replyToken, text, quickReplyItems) {
  var token = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.LINE_TOKEN);
  if (!token) return;

  var message = { type: 'text', text: text };
  if (quickReplyItems && quickReplyItems.length > 0) {
    message.quickReply = { items: quickReplyItems.map(toQuickReplyButton_) };
  }
  var payload = { replyToken: replyToken, messages: [message] };
  callLineApi_(LINE_REPLY_URL, token, payload);
}

function toQuickReplyButton_(item) {
  return {
    type: 'action',
    action: { type: 'postback', label: item.label, data: item.data, displayText: item.label }
  };
}

function callLineApi_(url, token, payload) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 300) {
    Logger.log('LINE API error: ' + response.getResponseCode() + ' ' + response.getContentText());
  }
}
