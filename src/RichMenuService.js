/**
 * RichMenuService.js
 * リッチメニュー（LINEの画面下部に常設されるボタン）の設定。
 *
 * ボタンは押すとテキストを送信するだけなので、ロジックは増えない。
 * 「チェック」ボタンを押す = 「チェック」と打つ、であり routeTextMessage_ の分岐がそのまま使われる
 * (§3 責務分担: LINEはロジックを持たせない)。
 *
 * 使い方:
 *   1. 背景画像(2500x843 の PNG/JPEG)を Google Drive に置く
 *   2. そのファイルIDを ScriptProperties の RICH_MENU_IMAGE_FILE_ID に設定する
 *   3. GASエディタから setupRichMenu() を手動実行する
 *
 * ボタンの数や文言を変えたいときは CONFIG.RICH_MENU.BUTTONS を編集し、
 * 画像を差し替えて setupRichMenu() を再実行する。
 */

var LINE_RICH_MENU_URL = 'https://api.line.me/v2/bot/richmenu';
var LINE_RICH_MENU_DATA_URL = 'https://api-data.line.me/v2/bot/richmenu';

function setupRichMenu() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP_KEYS.LINE_TOKEN);
  var imageFileId = props.getProperty(PROP_KEYS.RICH_MENU_IMAGE_FILE_ID);

  if (!token) throw new Error('LINE_TOKEN が未設定です');
  if (!imageFileId) throw new Error('RICH_MENU_IMAGE_FILE_ID が未設定です（背景画像のDriveファイルID）');

  var blob = DriveApp.getFileById(imageFileId).getBlob();

  // 再実行時に古いメニューが溜まらないよう、先に全て消す
  var removed = deleteAllRichMenus_(token);

  var richMenuId = createRichMenu_(token, buildRichMenuDefinition_());
  uploadRichMenuImage_(token, richMenuId, blob);
  setDefaultRichMenu_(token, richMenuId);

  Logger.log('setupRichMenu: done. richMenuId=' + richMenuId + ' / 削除した旧メニュー=' + removed);
  return richMenuId;
}

/**
 * メニュー定義を組み立てる。ボタンは横一列に等幅で並べる。
 * 端数は最後のボタンに寄せ、隙間なく全幅を覆う。
 */
function buildRichMenuDefinition_() {
  var buttons = CONFIG.RICH_MENU.BUTTONS;
  var totalWidth = CONFIG.RICH_MENU.WIDTH;
  var height = CONFIG.RICH_MENU.HEIGHT;
  var unit = Math.floor(totalWidth / buttons.length);

  var areas = buttons.map(function (label, i) {
    var isLast = i === buttons.length - 1;
    var x = unit * i;
    return {
      bounds: { x: x, y: 0, width: isLast ? totalWidth - x : unit, height: height },
      action: { type: 'message', text: label }
    };
  });

  return {
    size: { width: totalWidth, height: height },
    selected: true,
    name: 'carrybot-menu',
    chatBarText: CONFIG.RICH_MENU.CHAT_BAR_TEXT,
    areas: areas
  };
}

function createRichMenu_(token, definition) {
  var response = UrlFetchApp.fetch(LINE_RICH_MENU_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(definition),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('リッチメニューの作成に失敗: ' + response.getContentText());
  }
  return JSON.parse(response.getContentText()).richMenuId;
}

function uploadRichMenuImage_(token, richMenuId, blob) {
  var response = UrlFetchApp.fetch(LINE_RICH_MENU_DATA_URL + '/' + richMenuId + '/content', {
    method: 'post',
    contentType: blob.getContentType(),
    headers: { Authorization: 'Bearer ' + token },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('リッチメニュー画像のアップロードに失敗: ' + response.getContentText());
  }
}

/** 全ユーザーの既定メニューにする。1対1利用なのでユーザー個別の割り当ては使わない。 */
function setDefaultRichMenu_(token, richMenuId) {
  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('既定メニューの設定に失敗: ' + response.getContentText());
  }
}

/** @returns {number} 削除した件数 */
function deleteAllRichMenus_(token) {
  var response = UrlFetchApp.fetch(LINE_RICH_MENU_URL + '/list', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) return 0;

  var menus = JSON.parse(response.getContentText()).richmenus || [];
  menus.forEach(function (menu) {
    UrlFetchApp.fetch(LINE_RICH_MENU_URL + '/' + menu.richMenuId, {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  });
  return menus.length;
}
