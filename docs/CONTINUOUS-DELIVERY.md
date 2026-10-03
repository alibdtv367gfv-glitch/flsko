# Flsko — تطوير ونشر مستمر

## المستودع
- الفرع الأساسي: `main`
- كل ميزة = commit واضح + push
- نشر Worker: يدوي الآن (`wrangler deploy`) أو Actions لاحقًا عند توكن GitHub بصلاحية `workflow`

### أسرار GitHub (لنشر تلقائي لاحقًا)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- توكن المستودع يحتاج صلاحية **workflow** لإضافة ملف Actions

### نشر يدوي للـ Worker
```bash
pnpm deploy:worker
# أو
cd cloudflare && npx wrangler deploy
```

## تحديث التطبيق بدون إعادة تثبيت كاملة
1. **OTA (expo-updates)** — تحديث JS/الواجهة بعد `eas update --channel production`
2. **فحص `/api/app/version`** — رسالة تحديث أو إجبار عند كسر توافق
3. **Store builds** — عند تغييرات native (صلاحيات، وحدات أصلية)

## قنوات EAS
- `development` / `preview` / `production` في `eas.json`

## الإصدار 2 لاحقًا
- ارفع `version` في `app.config.ts`
- `eas build --profile production`
- `eas update` للتعديلات السريعة على نفس runtimeVersion
- حدّث `minVersion` على Worker إن لزم إجبار الترقية
