// ===== SOZLAMALAR =====
const VERSION = '2026-10-20-v10';                      // dashboard shu raqamni tekshiradi
const TOKEN = 'NOTION_TOKEN_SHU_YERGA'; // Notion token
const DB_ID = '3f354e42ad6580bf8c03d11c2bf5347b';      // Storislar jadvali (Junior Story)
const TG_DB_ID = 'TG_BAZA_ID_SHU_YERGA';                // Telegram postlar jadvali (Junior TG)
const TG_TOKEN = 'TG_TOKEN_SHU_YERGA';                  // "Junior Telegram Dashboard" integratsiyasi tokeni (bo'sh qolsa TOKEN ishlatiladi)
const MONTAJ_DB_ID = 'MONTAJ_BAZA_ID_SHU_YERGA';        // Montaj videolari jadvali (Junior Montaj)
const MONTAJ_TOKEN = 'MONTAJ_TOKEN_SHU_YERGA';          // Montaj bazasi uchun alohida integratsiya tokeni (bo'sh qolsa TOKEN ishlatiladi)
const USERS = {                                        // login: parol
  'abdulaziz': 'PAROL_SHU_YERGA'
};
const SESSION_DAYS = 30;                               // necha kun kirib turadi

// Google Sheets (Instagram statistika)
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-hB-55n-oPOXQBt3HI-y-q6d2qufujLRzlpTmIoJrzw/edit?gid=214510469#gid=214510469';   // havola oxiridagi gid=... kerakli varaqni bildiradi
const SHEET_NAME = '';   // bo'sh qolsa: havoladagi gid=... varag'i olinadi

// "1-story", "2-storis", "3 story" kabi qatorlar story sifatida sanaladi
const STORY_RE = /^\s*\d+\s*[-–.)]?\s*stor(is|y|ies)/i;

// ===== NOTION =====
function isSet(v) { return !!v && !/SHU_YERGA/.test(v); }
function tokenFor(db) {
  if (db === 'tg' && isSet(TG_TOKEN)) return TG_TOKEN;
  if (db === 'montaj' && isSet(MONTAJ_TOKEN)) return MONTAJ_TOKEN;
  return TOKEN;
}
function headers(db) { return { Authorization: 'Bearer ' + tokenFor(db), 'Notion-Version': '2022-06-28' }; }

function notion(path, body, db) {
  const opt = { method: body ? 'post' : 'get', headers: headers(db), muteHttpExceptions: true };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const data = JSON.parse(UrlFetchApp.fetch('https://api.notion.com/v1/' + path, opt).getContentText());
  if (data.object === 'error') throw new Error(data.code + ': ' + data.message);
  return data;
}

// Har qanday turdagi ustundan matn qiymatini oladi (Select, Multi-select, Status, Text, Formula, Rollup)
function propVal(p) {
  if (!p) return '';
  switch (p.type) {
    case 'select': return p.select ? p.select.name : '';
    case 'multi_select': return (p.multi_select || []).map(o => o.name).join(',');
    case 'status': return p.status ? p.status.name : '';
    case 'rich_text': return plain(p.rich_text);
    case 'title': return plain(p.title);
    case 'formula': {
      const f = p.formula || {};
      return f.string || (f.number != null ? String(f.number) : '') || (f.boolean != null ? String(f.boolean) : '');
    }
    case 'rollup': {
      const r = p.rollup || {};
      return r.type === 'array' ? (r.array || []).map(propVal).filter(String).join(',') : '';
    }
    default: return '';
  }
}

// Ustunni nomi bo'yicha topadi; aniq nom bo'lmasa, o'xshash nomni qidiradi
function findProp(pr, name, re) {
  if (pr[name]) return pr[name];
  const k = Object.keys(pr).find(k => re.test(k.trim()));
  return k ? pr[k] : null;
}

function plain(rt) { return (rt || []).map(x => x.plain_text).join(''); }

function simplify(b) {
  const v = b[b.type] || {};
  let text = v.rich_text ? plain(v.rich_text) : '';
  let url = '';
  if (['image', 'video', 'file', 'pdf', 'audio'].indexOf(b.type) >= 0) {
    url = v.type === 'external' ? v.external.url : (v.file ? v.file.url : '');
    text = plain(v.caption);
  }
  if (['bookmark', 'embed', 'link_preview'].indexOf(b.type) >= 0) url = v.url || '';
  if (b.type === 'child_page') text = v.title || '';
  return { type: b.type, text: text, url: url, checked: !!v.checked };
}

let LAST_PROPS = null;   // diagnostika uchun: ustun nomlari va turlari

// db: 'story' (Instagram story'lar), 'tg' (Telegram postlar) yoki 'montaj' (montaj videolari)
function dbId(db) {
  if (db === 'tg') {
    if (!isSet(TG_DB_ID)) throw new Error('TG_DB_ID sozlanmagan: Apps Script\'da Telegram Notion bazasi ID sini yozing');
    return TG_DB_ID.replace(/-/g, '');
  }
  if (db === 'montaj') {
    if (!isSet(MONTAJ_DB_ID)) throw new Error('MONTAJ_DB_ID sozlanmagan: Apps Script\'da Montaj Notion bazasi ID sini yozing');
    return MONTAJ_DB_ID.replace(/-/g, '');
  }
  return DB_ID;
}

// Bazadagi sana ustuni: "Sana" bo'lsa o'sha, bo'lmasa birinchi Date turidagi ustun (6 soat keshlanadi)
function dateProp(id, db) {
  const cache = CacheService.getScriptCache(), key = 'dp_' + id;
  const hit = cache.get(key);
  if (hit) return hit;
  const pr = notion('databases/' + id, null, db).properties || {};
  let name = pr['Sana'] && pr['Sana'].type === 'date' ? 'Sana' : Object.keys(pr).find(k => pr[k].type === 'date');
  if (!name) throw new Error('Notion bazasida sana (Date) ustuni topilmadi');
  cache.put(key, name, 21600);
  return name;
}

function getStories(from, to, db) {
  const id = dbId(db), dp = dateProp(id, db);
  let rows = [], cursor = null;
  do {
    const body = {
      filter: { and: [
        { property: dp, date: { on_or_after: from } },
        { property: dp, date: { on_or_before: to } }
      ]},
      sorts: [{ property: dp, direction: 'ascending' }],
      page_size: 100
    };
    if (cursor) body.start_cursor = cursor;
    const data = notion('databases/' + id + '/query', body, db);
    data.results.forEach(p => {
      const pr = p.properties;
      if (!LAST_PROPS) { LAST_PROPS = {}; Object.keys(pr).forEach(k => LAST_PROPS[k] = pr[k].type); }
      if (!pr[dp] || !pr[dp].date) return;
      const titleProp = Object.keys(pr).map(k => pr[k]).find(x => x.type === 'title');
      rows.push({
        id: p.id,
        e: p.last_edited_time || '',
        t: propVal(titleProp),
        c: propVal(findProp(pr, 'Kategoriya', /kategor|category|toifa|turi/i)),
        h: propVal(findProp(pr, 'Holat', /holat|status/i)),
        d: pr[dp].date.start
      });
    });
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return rows;
}

// Bir nechta story sahifasini parallel o'qiydi. Sahifa o'zgarmagan bo'lsa (e = oxirgi tahrir vaqti),
// natija 6 soat keshdan olinadi — shuning uchun qayta yuklash juda tez.
function getPages(ids, es, db) {
  const cache = CacheService.getScriptCache();
  const keys = ids.map((id, i) => 'pg_' + id.replace(/-/g, '') + '_' + String(es[i] || '').replace(/\D/g, ''));
  const got = cache.getAll(keys.filter((k, i) => es[i]));
  const out = {}, need = [];
  ids.forEach((id, i) => {
    if (es[i] && got[keys[i]]) out[id] = { b: JSON.parse(got[keys[i]]) };
    else need.push(i);
  });
  for (let attempt = 0; attempt < 2 && need.length; attempt++) {
    const resps = UrlFetchApp.fetchAll(need.map(i => ({
      url: 'https://api.notion.com/v1/blocks/' + ids[i] + '/children?page_size=100',
      headers: headers(db), muteHttpExceptions: true
    })));
    const retry = [];
    resps.forEach((res, j) => {
      const i = need[j];
      if (res.getResponseCode() === 429) { retry.push(i); return; }
      try {
        const d = JSON.parse(res.getContentText());
        if (d.object === 'error') { out[ids[i]] = { b: [] }; return; }
        const b = d.results.map(simplify);
        out[ids[i]] = { b: b };
        const str = JSON.stringify(b);
        if (es[i] && str.length < 90000) cache.put(keys[i], str, 21600);
      } catch (e) { out[ids[i]] = { b: [] }; }
    });
    need.length = 0; retry.forEach(i => need.push(i));
    if (need.length) Utilities.sleep(1000);
  }
  return out;
}

function getPage(id, db) {
  const out = []; let cursor = null;
  do {
    const data = notion('blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''), null, db);
    data.results.forEach(b => out.push(simplify(b)));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

// ===== GOOGLE SHEETS (Instagram statistika) =====
// Ustunlar sarlavha nomi bo'yicha topiladi:
// Podpischiklar, Prosmotr 1 stories, Prosmotr ohirgi stories, Podpischiklar %, Lidlar, Podpiska fact.
function sheetStats(from, to) {
  const ss = SpreadsheetApp.openByUrl(SHEET_URL);
  const tz = ss.getSpreadsheetTimeZone();
  // Varaq: SHEET_NAME > havoladagi gid=... > "Prosmotr" ustunlari eng ko'p topilgan varaq
  const gid = (String(SHEET_URL).match(/[#&?]gid=(\d+)/) || [])[1];
  let sheets = ss.getSheets();
  if (SHEET_NAME) sheets = [ss.getSheetByName(SHEET_NAME)].filter(Boolean);
  else if (gid != null) sheets = sheets.filter(sh => String(sh.getSheetId()) === gid);
  if (!sheets.length) throw new Error('Varaq topilmadi: ' + (SHEET_NAME ? '"' + SHEET_NAME + '"' : 'gid=' + gid));
  let best = null;
  sheets.forEach(sh => {
    const rg = sh.getDataRange();
    const res = parseStats(rg.getValues(), rg.getDisplayValues(), from, to, v => Utilities.formatDate(v, tz, 'yyyy-MM-dd'));
    if (!res) return;
    res.sheet = sh.getName();
    if (!best || Object.keys(res.cols).length > Object.keys(best.cols).length) best = res;
  });
  if (!best) throw new Error('"' + sheets[0].getName() + '"' + (sheets.length > 1 ? ' va boshqa varaqlarda' : ' varag\'ida') + ' "Prosmotr" sarlavhali ustun topilmadi');
  return best;
}

function parseStats(values, disp, from, to, fmtDate) {
  let h = -1;
  for (let i = 0; i < Math.min(values.length, 60); i++) {
    if (values[i].some(c => /prosmotr|просмотр/i.test(String(c)))) { h = i; break; }
  }
  if (h < 0) return null;
  const col = {};
  values[h].forEach((c, j) => {
    const t = String(c).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return;
    let k = null;
    if (/fa[ck]t|факт/.test(t)) k = 'subs';
    else if (/lid|лид/.test(t)) k = 'leads';
    else if (/prosmotr|просмотр/.test(t)) k = /(^|\D)1(\D|$)|perv|перв/.test(t) ? 'first' : (/o[hx]ir|posled|послед|last/.test(t) ? 'last' : null);
    else if (/%|foiz|процент/.test(t)) k = 'pct';
    else if (/pod?pis|подпис|obunachi/.test(t)) k = col.followers == null ? 'followers' : 'pct';
    else if (/sana|дата|date/.test(t)) k = 'date';
    if (k && col[k] == null) col[k] = j;
  });
  const rows = values.slice(h + 1), drows = disp.slice(h + 1);
  if (col.date == null) col.date = firstCol(rows, v => toIso(v, fmtDate) != null);
  const typeCol = firstCol(rows, v => /^stor(ies|is|y)$/i.test(String(v).trim()));
  const out = [];
  rows.forEach((r, i) => {
    const d = col.date == null ? null : toIso(r[col.date], fmtDate);
    if (!d || d < from || d > to) return;
    if (typeCol != null && !/^stor/i.test(String(r[typeCol]).trim())) return;
    const g = k => col[k] == null ? null : num(r[col[k]]);
    out.push({
      d: d, followers: g('followers'), first: g('first'), last: g('last'),
      pct: col.pct == null ? null : num(drows[i][col.pct]),   // ko'rinishidan: "0,79%" → 0.79
      leads: g('leads'), subs: g('subs')
    });
  });
  const cols = {};
  Object.keys(col).forEach(k => { cols[k] = String(values[h][col[k]] || ('ustun ' + (col[k] + 1))); });
  return { rows: out, cols: cols, head: values[h].map(String) };
}

function firstCol(rows, test) {
  for (const r of rows.slice(0, 80)) for (let j = 0; j < r.length; j++) if (test(r[j])) return j;
  return null;
}

function toIso(v, fmtDate) {
  if (v instanceof Date && !isNaN(v)) return fmtDate(v);
  const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

function num(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[\s %]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ===== ORQA FONDA KESHLASH (dashboard yopiq bo'lsa ham) =====
// setupTrigger() ni bir marta ishga tushiring: warmCache har 15 daqiqada o'tgan va joriy oy
// story'larini hamda sahifa matnlarini oldindan yuklab, keshga qo'yadi.
const WARM_KEY = 'rows_window';
function warmKey(db) { return WARM_KEY + '_' + (db === 'tg' || db === 'montaj' ? db : 'story'); }

function ymd(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function warmWindow() {
  const t = new Date();
  return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
}

function warmCache() {
  let n = warmDb('story');
  if (isSet(TG_DB_ID)) {
    try { n += warmDb('tg'); } catch (e) { Logger.log('TG keshlanmadi: ' + e.message); }
  }
  if (isSet(MONTAJ_DB_ID)) {
    try { n += warmDb('montaj'); } catch (e) { Logger.log('Montaj keshlanmadi: ' + e.message); }
  }
  return n;
}

function warmDb(db) {
  const w = warmWindow();
  LAST_PROPS = null;
  const rows = getStories(w[0], w[1], db);
  const data = JSON.stringify({ from: w[0], to: w[1], at: Date.now(), rows: rows, props: LAST_PROPS });
  if (data.length < 95000) CacheService.getScriptCache().put(warmKey(db), data, 1800);
  for (let i = 0; i < rows.length; i += 10) {           // Notion limitiga tushmaslik uchun 10 tadan
    const g = rows.slice(i, i + 10);
    getPages(g.map(r => r.id), g.map(r => r.e), db);
    Utilities.sleep(400);
  }
  return rows.length;
}

// Kesh 20 daqiqadan yangi bo'lsa va so'ralgan oraliq kesh oynasi ichida bo'lsa — keshdan beradi.
function cachedStories(from, to, db) {
  const raw = CacheService.getScriptCache().get(warmKey(db));
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
  Logger.log('Trigger o\'rnatildi: warmCache har 15 daqiqada ishlaydi. Hozir ' + n + ' ta qator keshga olindi.');
}

// ===== LOGIN =====
function props() { return PropertiesService.getScriptProperties(); }

function checkSession(token) {
  if (!token) return null;
  const raw = props().getProperty('s_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (Date.now() > s.exp) { props().deleteProperty('s_' + token); return null; }
  return s.user;
}

function cleanSessions() {
  const all = props().getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('s_') === 0) { try { if (JSON.parse(all[k]).exp < now) props().deleteProperty(k); } catch (e) {} }
  });
}

// ===== KIRISH NUQTASI =====
function doGet(e) {
  const q = (e && e.parameter) || {};
  let res;
  try {
    if (q.action === 'login') {
      const u = String(q.user || '').toLowerCase().trim();
      if (USERS[u] && USERS[u] === q.pass) {
        cleanSessions();
        const t = Utilities.getUuid();
        props().setProperty('s_' + t, JSON.stringify({ user: u, exp: Date.now() + SESSION_DAYS * 864e5 }));
        res = { ok: true, token: t, user: u };
      } else {
        Utilities.sleep(1500);
        res = { ok: false, error: 'login' };
      }
    } else {
      const user = checkSession(q.token);
      if (!user) res = { ok: false, error: 'auth' };
      else if (q.action === 'logout') { props().deleteProperty('s_' + q.token); res = { ok: true }; }
      else if (q.action === 'page') res = { ok: true, blocks: getPage(q.id, q.db) };
      else if (q.action === 'sheet') res = Object.assign({ ok: true }, sheetStats(q.from || '2000-01-01', q.to || '2100-12-31'));
      else if (q.action === 'pages') {
        const ids = String(q.ids || '').split(',').filter(String).slice(0, 10);
        const es = String(q.es || '').split(',');
        res = { ok: true, pages: getPages(ids, es, q.db) };
      }
      else {
        const from = q.from || '2000-01-01', to = q.to || '2100-12-31';
        const c = q.fresh ? null : cachedStories(from, to, q.db);   // ⟳ bosilganda (fresh=1) to'g'ridan-to'g'ri Notion'dan
        res = c ? { ok: true, user: user, rows: c.rows, props: LAST_PROPS, cachedAt: c.at }
                : { ok: true, user: user, rows: getStories(from, to, q.db), props: LAST_PROPS };
      }
    }
  } catch (err) {
    res = { ok: false, error: 'server', message: String(err.message || err) };
  }
  res.v = VERSION;
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// Dashboard login'ni POST bilan yuboradi (parol URL'da qolmasligi uchun).
// So'rov tanasidagi JSON'ni doGet'ga uzatamiz — mantiq bitta joyda qoladi.
function doPost(e) {
  let q = {};
  try { q = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return doGet({ parameter: q });
}

// ===== TEKSHIRUV FUNKSIYALARI (Выполнить orqali ishga tushiriladi) =====
function test() {
  const t0 = Date.now();
  const rows = getStories('2026-10-01', '2026-10-31');
  Logger.log('VERSIYA: ' + VERSION);
  Logger.log('USTUNLAR: ' + JSON.stringify(LAST_PROPS));
  Logger.log(rows.length + ' ta qator, ' + (Date.now() - t0) + ' ms');
  rows.forEach(r => Logger.log(r.d + ' | ' + r.t + ' | Kategoriya: "' + r.c + '" | Holat: "' + r.h + '"'));
  const sample = rows.slice(0, 6);
  const pages = getPages(sample.map(r => r.id), sample.map(r => r.e));
  sample.forEach(r => {
    // bitta blok ichida Shift+Enter bilan yozilgan story'lar ham sanaladi
    let n = 0;
    (pages[r.id].b || []).forEach(x => String(x.text || '').split(/\r?\n/).forEach(l => { if (STORY_RE.test(l)) n++; }));
    Logger.log(r.t + ' → ' + n + ' ta story');
  });
  Logger.log('Jami: ' + (Date.now() - t0) + ' ms');
}

function testTG() {
  const id = dbId('tg');
  Logger.log('TG bazasi: ' + id + ' | token: ' + (tokenFor('tg') === TOKEN ? 'asosiy TOKEN' : 'TG_TOKEN') + ' | sana ustuni: ' + dateProp(id, 'tg'));
  const rows = getStories('2026-10-01', '2026-10-31', 'tg');
  Logger.log('USTUNLAR: ' + JSON.stringify(LAST_PROPS));
  Logger.log(rows.length + ' ta qator');
  rows.slice(0, 15).forEach(r => Logger.log(r.d + ' | ' + r.t + ' | Kategoriya: "' + r.c + '" | Holat: "' + r.h + '"'));
}

function testMontaj() {
  const id = dbId('montaj');
  Logger.log('Montaj bazasi: ' + id + ' | token: ' + (tokenFor('montaj') === TOKEN ? 'asosiy TOKEN' : 'MONTAJ_TOKEN') + ' | sana ustuni: ' + dateProp(id, 'montaj'));
  const rows = getStories('2026-10-01', '2026-10-31', 'montaj');
  Logger.log('USTUNLAR: ' + JSON.stringify(LAST_PROPS));
  Logger.log(rows.length + ' ta qator');
  rows.slice(0, 15).forEach(r => Logger.log(r.d + ' | ' + r.t + ' | Kategoriya: "' + r.c + '" | Holat: "' + r.h + '"'));
}

function testSheet() {
  const r = sheetStats('2026-10-01', '2026-10-31');
  Logger.log('Varaq: ' + r.sheet);
  Logger.log('Sarlavha qatori: ' + JSON.stringify(r.head));
  Logger.log('Topilgan ustunlar: ' + JSON.stringify(r.cols));
  Logger.log(r.rows.length + ' ta Stories qatori');
  r.rows.forEach(x => Logger.log(JSON.stringify(x)));
}
