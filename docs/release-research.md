# مراجع الإطلاق

هذه مراجع رسمية راجعتها لتجهيز Flsko للنشر على Google Play:

## الموسيقى

- [ACE-Step 1.5 الرسمي](https://github.com/ace-step/ACE-Step-1.5): نموذج مفتوح المصدر بترخيص MIT مع REST API، لكنه يحتاج خادم GPU مناسبًا للإنتاج الاحترافي.
- [Google Lyria 3.5 عبر Gemini API](https://ai.google.dev/gemini-api/docs/music-generation): مسار مغلق اختياري لإنتاج مقاطع أو أغانٍ كاملة؛ تُحفظ المفاتيح في الخادم فقط.
- [Stable Audio Open](https://stability.ai/news-updates/introducing-stable-audio-open): مناسب أكثر للعينات والمؤثرات القصيرة حتى 47 ثانية، وليس البديل الأفضل للأغاني الكاملة.

## قنوات المصادر المفتوحة

- [Pollinations API الرسمي](https://gen.pollinations.ai/docs): واجهة للنص والصورة مع اشتراطات مصادقة تتغير حسب المنتج؛ لا يُوضع المفتاح داخل تطبيق الهاتف. أضيف دعمها في المنسق عبر `FLSKO_POLLINATIONS_API_KEY`، وتُستخدم فقط عند نجاح فحص الاستجابة.
- [Wan 2.2 الرسمي](https://github.com/Wan-Video/Wan2.2): أوزان Apache-2.0، لكن التشغيل الذاتي يحتاج GPU كبيرًا؛ واجهة Model Studio الرسمية مناسبة للخادم وتعيد مهمة غير متزامنة، ويجب تنزيل الفيديو إلى تخزين Flsko لأن رابط الخدمة مؤقت.
- [LTX-Video الرسمي](https://github.com/Lightricks/LTX-Video) و[API الرسمي](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video): خيار فيديو مُدار غير متزامن خلف خادم Node. أوزان الإصدارات الحديثة لها ترخيص Open Weights منفصل عن ترخيص الكود، لذا يجب فحص العتبة التجارية قبل الاستخدام.
- [ACE-Step 1.5 الرسمي](https://github.com/ace-step/ACE-Step-1.5): نموذج موسيقى MIT مع API رسمي محلي (`/release_task` و`/query_result`) ويحتاج GPU وخادمًا داخليًا محميًا؛ لا نعرض API النموذج مباشرة للهاتف.
- [MusicGen الرسمي من Meta](https://github.com/facebookresearch/audiocraft/blob/main/docs/MUSICGEN.md): متاح داخل AudioCraft، لكن الأوزان المنشورة CC-BY-NC 4.0؛ لذلك لا نعتمد عليه للإطلاق التجاري دون ترخيص مستقل.
- [CogVideoX الرسمي](https://github.com/zai-org/CogVideo): لا يوجد endpoint REST عام موثق في المصدر الرسمي المفحوص؛ التشغيل الذاتي يحتاج عامل GPU، وترخيص الأوزان يفرض قيودًا تجارية، لذلك لا يُفعل تلقائيًا.

لا تعتبر Flsko هذه الخدمات مضمونة أو مجانية بلا حدود؛ حالة كل خدمة ومفتاحها تُفحص على الخادم، وعند تعذرها ينتقل المنسق إلى مرشح آخر أو يعرض حالة انتظار صريحة بدل إنتاج نتيجة وهمية.

- سياسة بيانات المستخدم والخصوصية: https://support.google.com/googleplay/android-developer/answer/10144311
- نموذج Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- سياسة المحتوى المولّد بالذكاء الاصطناعي: https://support.google.com/googleplay/android-developer/answer/13985936
- سياسة المحتوى الذي ينشئه المستخدمون: https://support.google.com/googleplay/android-developer/answer/9876937
- متطلبات target API: https://developer.android.com/google/play/requirements/target-sdk

الاستنتاج العملي: يجب توفير سياسة خصوصية عامة، تعبئة Data safety بدقة، وإضافة آلية داخل التطبيق للإبلاغ عن المحتوى المسيء الناتج عن الذكاء الاصطناعي. كما يجب التحقق من target API المطلوب وقت رفع النسخة، لأنه يتغير بمرور الوقت.
