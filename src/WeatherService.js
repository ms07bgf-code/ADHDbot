/**
 * WeatherService.js
 * Open-Meteo による傘判定 (§5.1)。
 * 判定: 降水確率の最大値 >= 50% かつ 降水量 >= 0.5mm/h の時間帯が1つ以上存在。
 * 降水確率のみでは判定しない（20%が終日続く日への誤爆防止）。
 *
 * 自宅の緯度経度は ScriptProperties の HOME_LAT / HOME_LNG に設定する。
 */

function shouldBringUmbrella() {
  var props = PropertiesService.getScriptProperties();
  var lat = props.getProperty('HOME_LAT');
  var lng = props.getProperty('HOME_LNG');
  if (!lat || !lng) {
    Logger.log('shouldBringUmbrella: HOME_LAT/HOME_LNG 未設定のため天気判定をスキップします');
    return false;
  }

  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + encodeURIComponent(lat)
    + '&longitude=' + encodeURIComponent(lng)
    + '&hourly=precipitation_probability,precipitation'
    + '&timezone=' + encodeURIComponent(CONFIG.TIMEZONE)
    + '&forecast_days=1';

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() >= 300) {
    Logger.log('Open-Meteo error: ' + response.getResponseCode() + ' ' + response.getContentText());
    return false;
  }

  var data = JSON.parse(response.getContentText());
  var hourly = data.hourly;
  if (!hourly || !hourly.time) return false;

  var maxProb = 0;
  var hasRainHour = false;

  for (var i = 0; i < hourly.time.length; i++) {
    var hour = new Date(hourly.time[i]).getHours();
    if (hour < CONFIG.WEATHER_CHECK_START_HOUR || hour > CONFIG.WEATHER_CHECK_END_HOUR) continue;
    var prob = hourly.precipitation_probability[i];
    var rain = hourly.precipitation[i];
    if (prob > maxProb) maxProb = prob;
    if (rain >= CONFIG.WEATHER_RAIN_THRESHOLD) hasRainHour = true;
  }

  var result = maxProb >= CONFIG.WEATHER_PROB_THRESHOLD && hasRainHour;
  writeLog('weather_check', { maxProb: maxProb, hasRainHour: hasRainHour, result: result });
  return result;
}
