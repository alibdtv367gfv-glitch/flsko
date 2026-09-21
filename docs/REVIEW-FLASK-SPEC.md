# مراجعة مواصفات «Flask + 8 مشاريع + GCS»

## تعارض مع المشروع الفعلي

| المواصفة المرفقة | واقع Flsko |
|------------------|------------|
| خادم **Flask** (Python) | **Expo + TypeScript**؛ الـ API الإنتاجي **Cloudflare Workers + D1**؛ حزمة `server/` هي **Express/tRPC** للمرجع والتطوير |
| Flask Blueprints | عندنا **tRPC routers** (`server/routers.ts`) + وحدات `server/providers/*` |
| أوزان صفر على القرص | متوافق مع فلسفتنا: استدعاء عن بُعد فقط (لا PyTorch داخل التطبيق) |
| GCS Signed URLs | التخزين الحالي عبر Forge/S3 presign؛ يمكن إضافة **GCS** كخيار موازٍ |

**الخلاصة:** لا يُنصح بإعادة بناء Flsko كـ Flask. تُؤخذ الأفكار الجيدة (موصّلات عن بُعد، رفع سحابي، تقسيم مسارات) وتُنفَّذ على الستاك الحالي.

## المشاريع الثمانية — تقييم عملي

| # | المشروع | دمج واقعي؟ | كيف؟ |
|---|---------|------------|------|
| 1 | SkyReels | فقط عبر **API/GPU مستضاف** (RunPod/Modal/…) | `connectors/skyreels.ts` → `REMOTE_SKYREELS_URL` |
| 2 | Allegro | نفس الأسلوب | `REMOTE_ALLEGRO_URL` |
| 3 | NVIDIA Cosmos | يحتاج بنية NVIDIA/NGC؛ ليس عامًا مجانيًا | اختياري `REMOTE_COSMOS_URL` |
| 4 | LibreChat / MCP | بروتوكول وكلاء؛ طبقة توجيه | `connectors/mcp-bridge.ts` |
| 5 | Open Gen AI Studio | إن وُجد endpoint عام | `REMOTE_GENSTUDIO_URL` |
| 6 | Open-LLM-VTuber | صوتي/Live2D؛ غالبًا عميل محلي | رابط WebSocket اختياري |
| 7 | Context Mode | ضغط سياق | منطق في `translation-bridge` / طبقة قبل LLM |
| 8 | Vibe Trading | وكيل مالي؛ حساس تنظيميًا | معزول، لا يُعرض كـ«نصيحة استثمار» ملزمة |

لا تُحمَّل أوزان هذه المشاريع على Workers أو على هاتف المستخدم.

## الهيكل الموصى به (الستاك الحقيقي)

```text
server/
  connectors/          # أغلفة HTTP للخدمات البعيدة (Zero local weights)
  services/
    gcs.ts             # رفع GCS + Signed URL (اختياري)
  providers/           # Pollinations, Horde, HF, free-media
  flsko-ai.ts          # المنسّق
  routers.ts           # tRPC (بديل Blueprints)
adapters/              # Docker MusicGen / video stub (GPU عندك)
```

## ما نُفِّذ في المستودع استجابةً لهذه المواصفة

- `server/services/gcs.ts` — مدير GCS بـ TypeScript (بدون Flask)
- `server/connectors/remote-media.ts` — موصّلات SkyReels/Allegro/GenStudio عبر URL فقط
- `server/connectors/context-mode.ts` — ضغط سياق تقريبي قبل الإرسال للمزود
- تحديث `.env.example` بمتغيرات GCP والموصّلات البعيدة

## Flask؟

إن أردت خدمة Python منفصلة لاحقًا، اجعلها **microservice جانبي** يستدعيه Workers، لا تستبدل تطبيق الموبايل ولا الـ API الرئيسي.
