/**
 * EventItemsService.js
 * カレンダー予定 → 持ち物の表引き (§4.3a)。
 * 表引きで拾えなかった予定は黙って無視する。LLM推論は使わない (§6)。
 */

function getTodayCalendarItems() {
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(new Date());
  var mappings = getAllRows(SHEET_NAMES.EVENT_ITEMS).filter(function (row) {
    return row['有効'] !== false;
  });

  var matchedItems = [];
  events.forEach(function (event) {
    var title = event.getTitle() || '';
    mappings.forEach(function (mapping) {
      if (title.indexOf(mapping.keyword) !== -1) {
        String(mapping.items).split(',').forEach(function (item) {
          var trimmed = item.trim();
          if (trimmed && matchedItems.indexOf(trimmed) === -1) {
            matchedItems.push(trimmed);
          }
        });
      }
    });
  });

  return matchedItems;
}
