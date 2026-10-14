# Apps Script (Notion + Google Sheets ko'prigi)

`Kod.template.gs` — Apps Script loyihasidagi `Kod.gs` ning to'liq nusxasi, maxfiy qiymatlarsiz.
Joylashda `NOTION_TOKEN_SHU_YERGA`, `PAROL_SHU_YERGA` va `TG_BAZA_ID_SHU_YERGA` ni to'ldiring.

- `VERSION` dashboard'dagi `SCRIPT_VERSION` bilan bir xil bo'lishi kerak.
- `setupTrigger()` ni bir marta ishga tushiring — `warmCache` har 15 daqiqada keshni yangilaydi.
- Kod o'zgargach: Управление развертываниями → ✏️ → Новая версия → Развернуть (URL o'zgarmaydi).
