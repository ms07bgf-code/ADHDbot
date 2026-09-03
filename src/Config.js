/**
 * Config.js
 * 忘れ物リマインドボット - 定数定義
 * 仕様書 §5.0 確定値 / §4.5 ScriptProperties を参照
 */

// ===== シート名 =====
var SHEET_NAMES = {
  CARRY_ITEMS: 'carry_items',
  ROUTINE_ITEMS: 'routine_items',
  STANDING_ITEMS: 'standing_items',
  EVENT_ITEMS: 'event_items',
  DEPARTURE_LOG: 'departure_log',
  LOG: 'log'
};

// ===== carry_items の状態 (§4.1) =====
var CARRY_STATE = {
  RESERVED: '予約',
  CARRYING: '持出中',
  RECOVERED: '回収済',
  LOST: '未回収'
};

var CARRY_SOURCE = {
  WEATHER: 'weather_trigger',
  ROUTINE: 'routine',
  CALENDAR: 'calendar',
  MANUAL: 'manual'
};

// ===== ScriptProperties キー (§4.5) =====
var PROP_KEYS = {
  LINE_TOKEN: 'LINE_TOKEN',
  LINE_USER_ID: 'LINE_USER_ID',
  WEBHOOK_SECRET: 'WEBHOOK_SECRET',
  FIRED_MORNING: 'fired_date_morning',
  FIRED_EVENING: 'fired_date_evening', // 予防push (§5.2)
  FIRED_PREV_NIGHT: 'fired_date_prev_night',
  FIRED_WEEK_INVENTORY: 'fired_week_inventory',
  FIRED_DEPARTURE: 'fired_date_departure', // 自宅離脱の最終push (層A / §5.4)
  MORNING_RESPONDED: 'morning_responded_date', // 朝pushへの応答があった日
  LAST_DEPARTURE_DEBOUNCE: 'last_departure_debounce_ts'
};

// ===== 確定値 (§5.0) =====
var CONFIG = {
  // 出発既定時刻 (段階0のフォールバック / §5.1a §7.5.1)
  DEFAULT_DEPARTURE_TIME: {
    // 0=日, 1=月 ... 6=土
    0: '09:00', // 休日
    1: '07:00',
    2: '07:00',
    3: '07:00',
    4: '07:00',
    5: '07:00',
    6: '09:00' // 休日
  },
  MORNING_PUSH_LEAD_MINUTES: 20, // 出発の20分前 (既定時刻使用時)
  PREDICTED_PUSH_LEAD_MINUTES: 20, // §7.5.3 予測時刻からの追加マージン

  // 予防push (§5.2)
  PREVENTION_PUSH_TIME: '15:00', // 平日のみ

  // 週次棚卸し (§5.1c / §5.0: 月曜の夜)
  WEEKLY_INVENTORY_HOUR: 21,

  // 天気判定 (§5.1)
  WEATHER_PROB_THRESHOLD: 50, // %
  WEATHER_RAIN_THRESHOLD: 0.5, // mm/h
  WEATHER_CHECK_START_HOUR: 6,
  WEATHER_CHECK_END_HOUR: 22,

  // 自宅離脱検知 (層A / §5.4)
  DEPARTURE_DEBOUNCE_MINUTES: 5,
  DEPARTURE_NEAR_DISTANCE_TEXT_THRESHOLD_M: 300, // 参考(現状は距離未送信・文面は固定)

  // push上限と優先度 (§5.5)
  DAILY_PUSH_CAP: 3,
  PUSH_PRIORITY: {
    DEPARTURE: 1, // 移動検知push（自宅離脱の最終push）
    MORNING: 2,
    PREVENTION: 3,
    PREV_NIGHT: 4,
    WEEKLY_INVENTORY: 5
  },

  // 出発時刻の段階的推定 (§5.1a / §7.5)
  ESTIMATION: {
    STAGE1_MIN_SAMPLES: 10,
    STAGE1_MAX_MAD_MINUTES: 40,
    STAGE2_MIN_SAMPLES_PER_WEEKDAY: 8,
    STAGE2_MAX_MAD_MINUTES: 40,
    ROLLING_WINDOW_DAYS: 45, // 30〜60日の中間値
    PERCENTILE: 25
  },

  // 予約の予定日超過を落とすまでの日数 (§4.1 未決 → 暫定値)
  RESERVATION_OVERDUE_DROP_DAYS: 3,

  // 昇格ロジック (§4.3b 暫定値)
  PROMOTION_TRIGGER_COUNT: 3,

  // departure_log 保持期間 (§7 プライバシー方針)
  DEPARTURE_LOG_RETENTION_DAYS: 90,

  TIMEZONE: 'Asia/Tokyo'
};

// event_items 初期セット (§5.0)
var EVENT_ITEMS_SEED = [
  { keyword: '打ち合わせ', items: '名刺,PC', enabled: true },
  { keyword: '面談', items: '名刺,PC', enabled: true }
];
