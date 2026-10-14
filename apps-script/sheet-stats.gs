// ===== GOOGLE SHEETS (Instagram statistika) =====
// Kod.gs oxiriga qo'shiladi. Ustunlar sarlavha nomi bo'yicha topiladi:
// Podpischiklar, Prosmotr 1 stories, Prosmotr ohirgi stories, Podpischiklar %, Lidlar, Podpiska fact.
const SHEET_URL = 'JADVAL_HAVOLASINI_SHU_YERGA_QOYING';   // docs.google.com/spreadsheets/d/... havolasi
const SHEET_NAME = '';   // bo'sh qolsa: havoladagi gid=... varag'i olinadi

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

function testSheet() {
  const r = sheetStats('2026-10-01', '2026-10-31');
  Logger.log('Varaq: ' + r.sheet);
  Logger.log('Sarlavha qatori: ' + JSON.stringify(r.head));
  Logger.log('Topilgan ustunlar: ' + JSON.stringify(r.cols));
  Logger.log(r.rows.length + ' ta Stories qatori');
  r.rows.forEach(x => Logger.log(JSON.stringify(x)));
}
