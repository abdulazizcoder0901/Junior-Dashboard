// ===== ORQA FONDA KESHLASH (dashboard yopiq bo'lsa ham) =====
// setupTrigger() ni bir marta ishga tushiring: warmCache har 15 daqiqada o'tgan va joriy oy
// story'larini hamda sahifa matnlarini oldindan yuklab, keshga qo'yadi.
const WARM_KEY = 'rows_window';

function ymd(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function warmWindow() {
  const t = new Date();
  return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
}

function warmCache() {
  const w = warmWindow();
  const rows = getStories(w[0], w[1]);
  const data = JSON.stringify({ from: w[0], to: w[1], at: Date.now(), rows: rows, props: LAST_PROPS });
  if (data.length < 95000) CacheService.getScriptCache().put(WARM_KEY, data, 1800);
  for (let i = 0; i < rows.length; i += 10) {           // Notion limitiga tushmaslik uchun 10 tadan
    const g = rows.slice(i, i + 10);
    getPages(g.map(r => r.id), g.map(r => r.e));
    Utilities.sleep(400);
  }
  return rows.length;
}

// Kesh 20 daqiqadan yangi bo'lsa va so'ralgan oraliq kesh oynasi ichida bo'lsa — keshdan beradi.
function cachedStories(from, to) {
  const raw = CacheService.getScriptCache().get(WARM_KEY);
  if (!raw) return null;
  const c = JSON.parse(raw);
  if (from < c.from || to > c.to || Date.now() - c.at > 20 * 60000) return null;
  LAST_PROPS = c.props;
  return { at: c.at, rows: c.rows.filter(r => String(r.d).slice(0, 10) >= from && String(r.d).slice(0, 10) <= to) };
}

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'warmCache')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('warmCache').timeBased().everyMinutes(15).create();
  const n = warmCache();
  Logger.log('Trigger o\'rnatildi: warmCache har 15 daqiqada ishlaydi. Hozir ' + n + ' ta story keshga olindi.');
}
