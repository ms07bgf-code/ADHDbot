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
  DWELL_LOG: 'dwell_log',
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
  LAST_DEPARTURE_DEBOUNCE: 'last_departure_debounce_ts',
  // 動的アンカー（層B / §7）の作業バッファ。離脱時に破棄する。
  DWELL_STATE: 'dwell_state', // {state, anchor:{lat,lng}, arrivedAt}
  DWELL_POINTS: 'dwell_points', // [[lat, lng, 秒単位ts], ...] 直近90分ぶん
  LAST_DWELL_DEBOUNCE: 'last_dwell_debounce_ts'
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
  // 文面切り替えの距離しきい値 (§5.4 / §10 未決だった箇所)。
  // 離脱判定半径(300m)と同値にすると「単語のみ」の分岐が到達不能になるため、
  // 必ず離脱判定半径より大きくすること。
  // 300〜500m = 境界を跨いだ直後で取りに戻れる → 単語のみ
  // 500m〜   = 報告が遅れて既に遠い → 「置いてきた？」（行動を要求しない）
  DEPARTURE_NEAR_DISTANCE_TEXT_THRESHOLD_M: 500,

  // 動的アンカー = 任意地点の滞在→離脱検知 (層B / §7)
  DWELL: {
    STAY_RADIUS_M: 150, // 滞在判定半径
    EXIT_RADIUS_M: 300, // 離脱判定半径。滞在半径より大きくする（ヒステリシス）
    MIN_STAY_MINUTES: 30, // 滞在時間閾値。信号待ち・コンビニ寄りを除外する
    DEBOUNCE_MINUTES: 5,
    // 報告欠落を滞在と誤認しないためのガード (§7 実装上の注意)
    MIN_POINTS: 3, // 「点が2つで30分空いている」ケースを弾く
    MAX_POINT_GAP_MINUTES: 15, // これを超える間隔があれば滞在の連続性を認めない
    BUFFER_MINUTES: 90, // 作業バッファの保持長
    BUFFER_MAX_POINTS: 150, // ScriptPropertiesの値サイズ上限に対する保険
    // 自宅は層A（固定ジオフェンス）が担当するため、この距離内のアンカーは層Bの対象外
    HOME_SUPPRESS_RADIUS_M: 300
  },

  // push上限と優先度 (§5.5)
  DAILY_PUSH_CAP: 3,
  PUSH_PRIORITY: {
    DEPARTURE: 1, // 移動検知push（自宅離脱の最終push / 任意地点の離脱push）
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

  // 保持期間 (§7 プライバシー方針)。日次トリガーで期限切れ行を物理削除する。
  DEPARTURE_LOG_RETENTION_DAYS: 90,
  DWELL_LOG_RETENTION_DAYS: 90,

  TIMEZONE: 'Asia/Tokyo'
};

// event_items 初期セット (§5.0)
var EVENT_ITEMS_SEED = [
  { keyword: '打ち合わせ', items: '名刺,PC', enabled: true },
  { keyword: '面談', items: '名刺,PC', enabled: true }
];
