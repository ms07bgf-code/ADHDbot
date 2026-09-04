/**
 * MorningPush.js
 * 朝push (§5.1)。出発想定時刻の15〜20分前に、未回収の再提示 + 当日候補(予約/ルーチン/予定/天気)をまとめて送る。
 *
 *   1. 未回収アイテムがあれば先に提示
 *   2. carry_items から 予定日=今日 かつ 状態=予約 を取得
 *   3. routine_items から当日の曜日に該当する行を取得
 *   4. CalendarApp で当日の予定を取得し、event_items で表引き
 *   5. Open-Meteo で傘判定
 *   6. 2〜5 を合流させて1通にまとめる（重複は名寄せ）
 *   7. 0件 → 沈黙
 *   8. push「傘・ゴミ袋・診察券」+ ボタン[持った]
 */

function runMorningPush() {
  var today = formatDate_(new Date());

  var lostItems = getLostItems(); // 未回収（翌朝再提示 / §4.1）
  var reserved = getTodayReservedItems(); // [{id, item, ...}]
  var routineNames = getTodayRoutineItems();
  var calendarNames = getTodayCalendarItems();
  var umbrella = shouldBringUmbrella();

  var candidates = [];
  reserved.forEach(function (row) {
    candidates.push({ name: row.item, kind: 'reserved', id: row.id });
  });
  routineNames.forEach(function (name) {
    candidates.push({ name: name, kind: 'new', source: CARRY_SOURCE.ROUTINE });
  });
  calendarNames.forEach(function (name) {
    candidates.push({ name: name, kind: 'new', source: CARRY_SOURCE.CALENDAR });
  });
  if (umbrella) {
    candidates.push({ name: '傘', kind: 'new', source: CARRY_SOURCE.WEATHER });
  }

  // 名寄せ（同名は最初のものを残す。予約行が既にあればそれを優先）
  var dedupMap = {};
  var dedupedCandidates = [];
  candidates.forEach(function (c) {
    if (dedupMap.hasOwnProperty(c.name)) {
      if (dedupMap[c.name].kind !== 'reserved' && c.kind === 'reserved') {
        dedupMap[c.name] = c;
      }
      return;
    }
    dedupMap[c.name] = c;
  });
  Object.keys(dedupMap).forEach(function (name) { dedupedCandidates.push(dedupMap[name]); });

  PropertiesService.getScriptProperties().setProperty(
    'morning_candidates_' + today,
    JSON.stringify(dedupedCandidates)
  );

  if (dedupedCandidates.length === 0 && lostItems.length === 0) {
    writeLog('no_items', { pushType: 'morning' });
    PropertiesService.getScriptProperties().setProperty(PROP_KEYS.FIRED_MORNING, today);
    return;
  }

  var lines = [];
  if (lostItems.length > 0) {
    lines.push('【未回収】' + lostItems.map(function (r) { return r.item; }).join('、'));
  }
  if (dedupedCandidates.length > 0) {
    lines.push(dedupedCandidates.map(function (c) { return c.name; }).join('、'));
  }
  var text = lines.join('\n');

  var quickReply = dedupedCandidates.length > 0
    ? [{ label: '持った', data: 'carried_all:' + today }]
    : null;

  if (quickReply) {
    var hint = consumeMorningHint_();
    if (hint) text += '\n' + hint;
  }

  sendPush(text, CONFIG.PUSH_PRIORITY.MORNING, quickReply, 'morning');
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.FIRED_MORNING, today);
}

/**
 * 「持った」の意味を案内する文。最初の数回だけ返し、以降は null。
 *
 * 「持った」は単なる記録ではなく「今日はこれを持って出る＝外出先でも見張ってほしい」の宣言であり、
 * 押さなければ持出中が空のまま＝予防pushも滞在地点からの離脱リマインドも鳴らない。
 * この対応関係は押してみないと分からないため、最初だけ明示する。
 *
 * 恒久的には出さない。毎朝同じ説明が付くと文面が伸び、単語だけを読ませる設計 (§5.1) が崩れるため。
 */
function consumeMorningHint_() {
  var props = PropertiesService.getScriptProperties();
  var shown = parseInt(props.getProperty(PROP_KEYS.MORNING_HINT_COUNT) || '0', 10);
  if (shown >= CONFIG.MORNING_HINT_SHOW_COUNT) return null;

  props.setProperty(PROP_KEYS.MORNING_HINT_COUNT, String(shown + 1));
  return '（持ったら[持った]。押した物は外出先でも見ておきます）';
}

/** postback「持った」で当日の候補を一括で持出中にする。 */
function handleCarriedAll(dateStr) {
  var raw = PropertiesService.getScriptProperties().getProperty('morning_candidates_' + dateStr);
  if (!raw) return;
  var candidates = JSON.parse(raw);
  candidates.forEach(function (c) {
    if (c.kind === 'reserved') {
      markReservedAsCarrying(c.id);
    } else {
      registerCarryingFromCandidate(c.name, c.source);
    }
  });
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.MORNING_RESPONDED, dateStr);
  PropertiesService.getScriptProperties().deleteProperty('morning_candidates_' + dateStr);
  writeLog('postback', { action: 'carried_all', date: dateStr, items: candidates.map(function (c) { return c.name; }) });
}

function hasMorningResponseToday() {
  var today = formatDate_(new Date());
  return PropertiesService.getScriptProperties().getProperty(PROP_KEYS.MORNING_RESPONDED) === today;
}

function hasMorningFiredToday() {
  var today = formatDate_(new Date());
  return PropertiesService.getScriptProperties().getProperty(PROP_KEYS.FIRED_MORNING) === today;
}
