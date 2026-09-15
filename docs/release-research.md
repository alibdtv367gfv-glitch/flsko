# مراجع الإطلاق

هذه مراجع رسمية راجعتها لتجهيز Flsko للنشر على Google Play:

## الموسيقى

- [ACE-Step 1.5 الرسمي](https://github.com/ace-step/ACE-Step-1.5): نموذج مفتوح المصدر بترخيص MIT مع REST API، لكنه يحتاج خادم GPU مناسبًا للإنتاج الاحترافي.
- [Google Lyria 3.5 عبر Gemini API](https://ai.google.dev/gemini-api/docs/music-generation): مسار مغلق اختياري لإنتاج مقاطع أو أغانٍ كاملة؛ تُحفظ المفاتيح في الخادم فقط.
- [Stable Audio Open](https://stability.ai/news-updates/introducing-stable-audio-open): مناسب أكثر للعينات والمؤثرات القصيرة حتى 47 ثانية، وليس البديل الأفضل للأغاني الكاملة.

## قنوات المصادر المفتوحة

- [Pollinations API الرسمي](https://gen.pollinations.ai/docs): واجهة موحدة للنص والصورة والصوت والفيديو؛ وثائقها الحالية تشترط مفتاحًا للتوليد، لذلك لا يُوضع المفتاح داخل تطبيق الهاتف. أضيف دعمها في المنسق عبر `FLSKO_POLLINATIONS_API_KEY`، وتُستخدم للصورة والنص عند تفعيلها.
- [MusicGen Space الرسمي](https://huggingface.co/spaces/facebook/MusicGen): مساحة عامة لتجربة MusicGen، ويمكن توصيلها عبر محول خادمي متوافق مع عقد الموسيقى في Flsko.
- [AnimateDiff في Diffusers](https://huggingface.co/docs/diffusers/en/api/pipelines/animatediff): مسار مفتوح لتحريك الصور، ويمكن توصيله عبر `FLSKO_VIDEO_PROVIDER_URL`.
- [CogVideoX على Hugging Face](https://huggingface.co/THUDM/CogVideoX-5b): مسار مفتوح للفيديو القصير، ويُوصل عبر نفس عقد الفيديو دون كشف النموذج للمستخدم.

لا تعتبر Flsko هذه الخدمات مضمونة أو مجانية بلا حدود؛ حالة كل خدمة ومفتاحها تُفحص على الخادم، وعند تعذرها ينتقل المنسق إلى مرشح آخر أو يعرض حالة انتظار صريحة بدل إنتاج نتيجة وهمية.

- سياسة بيانات المستخدم والخصوصية: https://support.google.com/googleplay/android-developer/answer/10144311
- نموذج Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- سياسة المحتوى المولّد بالذكاء الاصطناعي: https://support.google.com/googleplay/android-developer/answer/13985936
- سياسة المحتوى الذي ينشئه المستخدمون: https://support.google.com/googleplay/android-developer/answer/9876937
- متطلبات target API: https://developer.android.com/google/play/requirements/target-sdk

الاستنتاج العملي: يجب توفير سياسة خصوصية عامة، تعبئة Data safety بدقة، وإضافة آلية داخل التطبيق للإبلاغ عن المحتوى المسيء الناتج عن الذكاء الاصطناعي. كما يجب التحقق من target API المطلوب وقت رفع النسخة، لأنه يتغير بمرور الوقت.
