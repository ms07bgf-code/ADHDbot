/**
 * MessageRouter.js
 * LINEからの入力（テキストメッセージ / postback）を解釈する。
 * 判断コストを乗せない設計原則(§1原則2)に沿い、平常時はボタン操作のみで完結させる。
 */

function handleLineWebhook(body) {
  (body.events || []).forEach(function (event) {
    try {
      routeLineEvent_(event);
    } catch (err) {
      writeLog('error', { where: 'handleLineWebhook', message: String(err) });
    }
  });
}

function routeLineEvent_(event) {
  if (event.type === 'postback') {
    routePostback_(event);
    return;
  }
  if (event.type === 'message' && event.message && event.message.type === 'text') {
    routeTextMessage_(event);
  }
}

function routePostback_(event) {
  var data = event.postback && event.postback.data ? event.postback.data : '';
  writeLog('postback_received', { data: data });

  if (data.indexOf('carried_all:') === 0) {
    var date = data.substring('carried_all:'.length);
    handleCarriedAll(date);
    lineReply(event.replyToken, '了解');
    return;
  }

  if (data.indexOf('promote:') === 0) {
    var promoteParts = data.substring('promote:'.length).split(':');
    promoteToRoutine(decodeURIComponent(promoteParts[0]), promoteParts[1]);
    lineReply(event.replyToken, '登録しました');
    return;
  }

  if (data.indexOf('decline_promote:') === 0) {
    var declineParts = data.substring('decline_promote:'.length).split(':');
    declinePromotion(decodeURIComponent(declineParts[0]), declineParts[1]);
    lineReply(event.replyToken, '了解');
    return;
  }
}

function routeTextMessage_(event) {
  var text = (event.message.text || '').trim();

  if (text === 'チェック' || text === '出る') {
    lineReply(event.replyToken, buildOnDemandCheckText_());
    return;
  }

  var lostMatch = text.match(/^(なくした|忘れた)[\s　]+(.+)$/);
  if (lostMatch) {
    var lostOk = markItemAsLost(lostMatch[2].trim());
    lineReply(event.replyToken, lostOk ? '記録しました' : '該当する持出中の品が見つかりませんでした');
    return;
  }

  var foundMatch = text.match(/^見つかった[\s　]+(.+)$/);
  if (foundMatch) {
    var foundOk = markItemAsFound(foundMatch[1].trim());
    lineReply(event.replyToken, foundOk ? '記録しました' : '該当する未回収の品が見つかりませんでした');
    return;
  }

  // 履歴問い合わせ (§5.7)。すべてユーザー起点のため push上限の対象外。
  if (text === '履歴') {
    lineReply(event.replyToken, buildDwellHistoryText(3));
    return;
  }

  var whereMatch = text.match(/^どこ[\s　]+(.+)$/);
  if (whereMatch) {
    lineReply(event.replyToken, buildWhereIsItemText(whereMatch[1].trim()));
    return;
  }

  // それ以外は手動登録 (§5.3, §5.3a)。確認は返さず、登録した事実だけ短く返す。
  var parsed = registerManualItem(text);
  lineReply(event.replyToken, '登録: ' + parsed.item + '（' + parsed.dateStr + '）');
}

/**
 * オンデマンド確認 (§5.1b)。常備品全件 + 当日の routine_items + 持出中 + 先の予約を返す。
 *
 * 予約を含めるのは、登録してから予定日の朝までの間、登録できたか確認する手段が
 * 他にないため（「登録したっけ？」を解消するのがこの機能の役目 / §5.1b）。
 */
function buildOnDemandCheckText_() {
  var standing = getAllStandingItems();
  var routine = getTodayRoutineItems();
  var carrying = getCarryingItems().map(function (r) { return r.item; });
  var reserved = getUpcomingReservedItems();

  var lines = [];
  lines.push('【常備品】' + (standing.length > 0 ? standing.join('、') : 'なし'));
  lines.push('【本日のルーチン】' + (routine.length > 0 ? routine.join('、') : 'なし'));
  lines.push('【持出中】' + (carrying.length > 0 ? carrying.join('、') : 'なし'));
  lines.push('【予約】' + (reserved.length > 0
    ? reserved.map(function (r) { return formatShortDate_(r['予定日']) + ' ' + r.item; }).join('、')
    : 'なし'));
  return lines.join('\n');
}
