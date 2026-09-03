/**
 * PushController.js
 * push上限(1日3通)と優先度制御 (§5.5)。
 * 全てのpush送信はここを経由させ、送信可否の判定と log 記録を一箇所に集約する。
 */

/**
 * @param {string} text 送信文面
 * @param {number} priority CONFIG.PUSH_PRIORITY のいずれか(数値が小さいほど優先)
 * @param {Array} quickReplyItems 任意
 * @param {string} pushType ログ用ラベル (例: 'morning', 'departure')
 * @returns {boolean} 実際に送信したか
 */
function sendPush(text, priority, quickReplyItems, pushType) {
  var sentToday = getTodayLogsByEvent('push_sent').length;
  var isTopPriority = priority === CONFIG.PUSH_PRIORITY.DEPARTURE;

  if (!isTopPriority && sentToday >= CONFIG.DAILY_PUSH_CAP) {
    writeLog('suppressed', { pushType: pushType, priority: priority, reason: 'daily_cap', text: text });
    return false;
  }

  linePush(text, quickReplyItems);
  writeLog('push_sent', { pushType: pushType, priority: priority, text: text });
  return true;
}
