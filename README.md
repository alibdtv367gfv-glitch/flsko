---
title: Flsko
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# Flsko — الوكيل السوري الذكي

Flsko تطبيق موبايل عربي أولًا مبني بـ Expo وReact Native وTypeScript. العلامة الظاهرة هي Flsko، وعندما يتحدث الوكيل بالعربية عن اسمه يقول «فلسقوا». يجمع التطبيق بين المحادثة، إنشاء الصور والفيديو، الذاكرة السحابية الاختيارية، ومصادر المعرفة العامة التي يضيفها المستخدم بإذن واضح.

## مبدأ التشغيل

لا يرى المستخدم أسماء النماذج ولا يختار بينها. يستقبل Flsko الطلب، ويرسل العمل في الخلفية إلى المزودات المتاحة من Gemini وChatGPT والمزودات المفتوحة، ثم يقارن الاستجابات من حيث اكتمالها، ملاءمتها للغة المستخدم، وجودة النص، والسرعة. يختار جوابًا واحدًا ويقدمه بصياغة ولهجة قريبة من رسالة المستخدم. يسجل الخادم فقط عدد المزودات المستخدمة داخليًا، ولا يعرض تفاصيل المقارنة في واجهة المستخدم.

**الهوية:** الاسم فلسقوا (Flsko). المطوّر: علي يوسف (Ali Youssef). تُحقن هذه الحقائق في سياق النظام قبل كل محادثة (`server/flsko-identity.ts`) حتى تُفهم الأسئلة الدلالية دون كلمات مفتاحية جامدة.

**المنسّق:** قاطع دائرة (`server/circuit-breaker.ts`)، طبقة تكييف نصي (`server/translation-bridge.ts`)، وسلسلة صور مجانية موثّقة Pollinations + AI Horde (`server/providers/image-free.ts`). التفاصيل في `docs/ARCHITECTURE.md`.

إذا لم توجد مفاتيح Gemini أو OpenAI أو مزود مفتوح، يعمل التطبيق بمزود الخادم المدمج والمسارات العامة الموثّقة حتى تبقى النسخة قابلة للتجربة. هذه ليست مفاتيح سرية جاهزة؛ يجب على مالك المشروع وضع مفاتيحه في مدير الأسرار الخاص بالاستضافة، ولا يجوز اختراعها أو وضعها داخل تطبيق الهاتف.

## ما الذي يعمل في هذه النسخة

توجد واجهة موبايل عربية بمساحات: الرئيسية، إنشاء الصور والفيديو والموسيقى، مكتبة الصور والفيديو والمستندات، الحوار، والذاكرة. أثناء العمل تظهر للمستخدم مراحل عامة ومطمئنة مثل فهم الطلب، جمع المعرفة، موازنة الاحتمالات وصياغة الجواب، من دون كشف أسماء النماذج أو تفاصيل التنفيذ الداخلية. توجد مصادقة OAuth، ومحادثة وذاكرة ومصادر معرفة في قاعدة سحابية، وتخزين سحابي للنتائج والملفات. نتائج الفيديو والصوت يمكن تشغيلها داخل التطبيق بمشغلات مدمجة. رفع الملفات يتم بعد تسجيل الدخول وبحد حجم مضبوط، ولا يقرأ الوكيل الملف إلا عند طلب المستخدم.

المصادر الاجتماعية ليست كشطًا مفتوحًا: الطبقة الحالية تستقبل روابط عامة يرسلها المستخدم وبموافقة صريحة، وتضعها في المراجعة. لا تقرأ حسابات خاصة ولا تجمع منشورات تلقائيًا.

## متغيرات الخادم

ضع القيم على الخادم فقط:

```env
FLSKO_GEMINI_API_KEY=secret
FLSKO_GEMINI_MODEL=gemini-2.5-flash
FLSKO_GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
FLSKO_OPENAI_API_KEY=secret
FLSKO_OPENAI_MODEL=gpt-4o-mini
FLSKO_LLM_PROVIDER_URL=https://your-openai-compatible-endpoint/v1/chat/completions
FLSKO_LLM_PROVIDER_KEY=optional-secret
FLSKO_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
HF_TOKEN=secret-with-inference-providers-permission
FLSKO_HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
FLSKO_RESEARCH_PROVIDER_URL=https://your-open-research-endpoint/search
FLSKO_RESEARCH_PROVIDER_KEY=optional-secret
FLSKO_IMAGE_PROVIDER_URL=https://your-image-provider/generate
FLSKO_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0
FLSKO_VIDEO_PROVIDER_URL=https://your-video-provider/generate
FLSKO_VIDEO_MODEL=Wan-AI/Wan2.2-TI2V-5B
FLSKO_MUSIC_PROVIDER_URL=https://your-open-source-music-provider/generate
FLSKO_GEMINI_MUSIC_PROVIDER_URL=https://your-gemini-music-adapter/generate
FLSKO_POLLINATIONS_API_KEY=optional-server-key

# Google OAuth — production (Cloudflare Workers API)
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://flsko-api.flsko.workers.dev/api/google/callback
EXPO_PUBLIC_API_BASE_URL=https://flsko-api.flsko.workers.dev
JWT_SECRET=long-random-string
```

### Google OAuth في الإنتاج

1. في [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client → **Authorized redirect URIs** أضف بالضبط:
   `https://flsko-api.flsko.workers.dev/api/google/callback`
2. على خادم الـ API (Workers secrets / env) ضع نفس القيمة في `GOOGLE_OAUTH_REDIRECT_URI`.
3. لا تستخدم عناوين Manus القديمة (`3000-*.manus.computer`) في الإنتاج.

التحقق من أسماء نماذج Gemini يتغير بمرور الوقت، لذلك يجب تأكيد الاسم من كتالوج Google عند إعداد البيئة. المزود المفتوح للمحادثة متوقع أن يكون متوافقًا مع OpenAI Chat Completions، ويمكن توصيل HuggingChat أو Qwen/Llama عبر endpoint خادمي. مزود البحث المفتوح يستقبل `{ "query": "...", "language": "ar", "include_sources": true }` ويعيد `answer` أو `text` أو `summary`، ويمكنه إعادة قائمة `sources`. عند تفعيله، يبحث Flsko هناك بالتوازي مع قنوات الذكاء الاصطناعي، ثم يقارن النتيجة ويعيد صياغتها بالعربية ولهجة المستخدم. مزود الصورة متوقع أن يعيد `{ "url": "https://.../asset.png" }`، أو يمكن تفعيل Pollinations عبر `FLSKO_POLLINATIONS_API_KEY` لاستخدام FLUX. مزود الفيديو متوقع أن يعيد `{ "url": "https://.../asset.mp4", "job_id": "optional-id" }` ويمكن توصيل CogVideoX أو AnimateDiff أو Wan عبر `FLSKO_VIDEO_PROVIDER_URL`. مزود الموسيقى يستقبل `{ "prompt": "...", "durationSeconds": 30, "instrumental": false }` ويعيد `{ "url": "https://.../asset.mp3", "job_id": "optional-id" }`، ويمكن توصيل ACE-Step أو MusicGen عبر `FLSKO_MUSIC_PROVIDER_URL`. لا يفترض Flsko أن المنصات العامة مجانية أو بلا تسجيل؛ وثائق Pollinations الحالية تتطلب مفتاحًا للتوليد، لذلك لا يضع التطبيق مفتاحًا داخل الهاتف. لا ينشئ Flsko حسابات Gemini أو ChatGPT باسم المستخدم تلقائيًا؛ يستخدم مفاتيح الخادم أو تسجيلًا صريحًا يوافق عليه المستخدم.

لأفضل مسار مفتوح في الإنتاج: استخدم خادمًا خاصًا لـ`ACE-Step 1.5` للموسيقى، أو محولًا خادميًا لـ`Wan 2.2`/`LTX-Video` للفيديو. لا تربط تطبيق Expo مباشرةً بأي نموذج أو GPU. يجب أن يتحقق خادم Node من الجلسة والحصة ونوع الملف، ويضع مهام الفيديو/الموسيقى في طابور، ثم ينقل الناتج إلى تخزين Flsko قبل إرساله كرابط داخلي. التشغيل الذاتي لـWan وLTX وACE-Step يحتاج GPU؛ لذلك لا يمكن اعتبار هذه الميزات «محلية على الهاتف» ولا يجوز عرضها للمستخدم كأنها مضمونة أو مجانية بلا حدود.

## مساحة المعرفة السورية

توجد طبقة `server/syrian-knowledge.ts` داخل الخادم السحابي، وتحتوي على إرشادات غير تنميطية للتنوع بين المحافظات والبيئات واللهجات، مع كشف لطيف لمؤشرات اللهجة من رسالة المستخدم. لا تفترض الطبقة محافظة أو طائفة أو عِرقًا أو موقفًا سياسيًا، ولا تقلّد اللهجة بشكل كاريكاتوري. تتغير النبرة تلقائيًا: مزاح محترم عند المزاح، وصياغة عملية صارمة عند طلب الخطوات أو المعلومات الدقيقة. يستطيع المستخدم تصحيح اللهجة، ولا يُحفظ التصحيح كذاكرة إلا بموافقته.

التعلم من المحادثة هو تعلم شخصي قابل للتحكم، وليس تدريبًا خفيًا على جميع المستخدمين. الذاكرة تُسجل فقط عبر إجراء موافق عليه، ومصادر الثقافة العامة تمر بحالة مراجعة قبل دخولها إلى قاعدة المعرفة. يمكن لاحقًا إضافة لوحة تحرير سحابية للمصادر الموثقة، مع تصنيف المحافظة والموضوع والجيل واللهجة، وسجل للمراجعة وإمكانية سحب المصدر.

## الخصوصية والأمان

لا تُحفظ ملفات المحتوى كبيانات دائمة على الهاتف؛ تنتقل إلى الخادم بعد المصادقة وتُخزن في قاعدة البيانات أو التخزين السحابي. يبقى رمز الجلسة في SecureStore/Keychain فقط كي يستطيع التطبيق المصادقة. التنظيف التلقائي محافظ: يحذف مهام التوليد الفاشلة أو المهجورة فقط بعد 14 يومًا عند استخدام الوكيل، ولا يحذف الملفات أو الذكريات أو المحادثات أو النتائج الناجحة لأن أهمية بيانات المستخدم لا يجوز تخمينها. يستطيع المستخدم حذف أي ملف منفردًا أو حذف الحساب وجميع سجلاته. قبل الإنتاج يجب إضافة WAF/rate limiting، نسخ احتياطي مشفر، سجلات تدقيق، فحص للروابط والملفات، مراجعة حقوق النشر، واختبار حق النسيان الكامل.

## تطوير محلي

```bash
pnpm install
pnpm check
pnpm lint
pnpm dev
```

ملفات الواجهة الأساسية: `app/(tabs)/index.tsx` و`app/(tabs)/create.tsx` و`app/(tabs)/chat.tsx` و`app/(tabs)/memory.tsx`.

ملفات الخادم الأساسية: `server/routers.ts` و`server/flsko-ai.ts` و`server/db.ts` و`drizzle/schema.ts`.
