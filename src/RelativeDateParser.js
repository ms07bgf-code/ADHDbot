/**
 * RelativeDateParser.js
 * 相対日付指定 (§5.3a)。
 *
 *   「本」          → 今日
 *   「明日 本」      → 翌朝
 *   「金曜 診察券」  → 次の金曜
 *   「来週 書類」    → 翌週月曜
 *
 * 曜日名 + 「明日/明後日/来週」のみを前方一致で解析する。自由入力の日付解析はしない(§5.3a)。
 */

var WEEKDAY_PREFIX_MAP = {
  '日': 0, '日曜': 0, '日曜日': 0,
  '月': 1, '月曜': 1, '月曜日': 1,
  '火': 2, '火曜': 2, '火曜日': 2,
  '水': 3, '水曜': 3, '水曜日': 3,
  '木': 4, '木曜': 4, '木曜日': 4,
  '金': 5, '金曜': 5, '金曜日': 5,
  '土': 6, '土曜': 6, '土曜日': 6
};

/**
 * @param {string} text ユーザー入力
 * @returns {{item: string, dateStr: string}} dateStr は 'yyyy-MM-dd'
 */
function parseRelativeDate(text) {
  var trimmed = String(text).trim();
  var parts = trimmed.split(/[\s　]+/); // 半角/全角スペースで分割
  var today = new Date();

  if (parts.length >= 2) {
    var prefix = parts[0];
    var rest = parts.slice(1).join(' ');

    if (prefix === '明日') {
      return { item: rest, dateStr: formatDate_(addDays_(today, 1)) };
    }
    if (prefix === '明後日') {
      return { item: rest, dateStr: formatDate_(addDays_(today, 2)) };
    }
    if (prefix === '来週') {
      return { item: rest, dateStr: formatDate_(nextMonday_(today)) };
    }
    if (WEEKDAY_PREFIX_MAP.hasOwnProperty(prefix)) {
      return { item: rest, dateStr: formatDate_(nextWeekday_(today, WEEKDAY_PREFIX_MAP[prefix])) };
    }
  }

  // プレフィックスに一致しなければ全体をアイテム名として扱い、今日扱いにする
  return { item: trimmed, dateStr: formatDate_(today) };
}

function addDays_(date, days) {
  var d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextMonday_(date) {
  var d = new Date(date);
  var diff = (8 - d.getDay()) % 7;
  diff = diff === 0 ? 7 : diff;
  return addDays_(d, diff);
}

/** 明日以降で最初に該当する曜日の日付を返す（今日と同じ曜日なら来週）。 */
function nextWeekday_(date, targetWeekday) {
  var d = new Date(date);
  for (var i = 1; i <= 7; i++) {
    var candidate = addDays_(d, i);
    if (candidate.getDay() === targetWeekday) return candidate;
  }
  return d;
}
