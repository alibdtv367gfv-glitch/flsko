# ربط Hugging Face (عناق الوجه) مع Flsko

## ما هو مفعّل في الكود أصلًا

| الوظيفة | المتغير | المسار |
|---------|---------|--------|
| محادثة | `HF_TOKEN` | `router.huggingface.co/v1/chat/completions` في `flsko-ai.ts` |
| صور | `HF_TOKEN` + اختياري `FLSKO_HF_IMAGE_MODEL` | طبقة في `server/providers/free-media.ts` |
| نموذج محادثة افتراضي | `FLSKO_HF_MODEL` | مثل `meta-llama/Llama-3.1-8B-Instruct` |

## إنشاء التوكن (مجاني)

1. https://huggingface.co/settings/tokens  
2. Fine-grained أو classic **Read**  
3. صلاحية مهمة: **Make calls to Inference Providers**  
4. ضع القيمة على Workers / السيرفر فقط:

```env
HF_TOKEN=hf_xxxxxxxx
FLSKO_HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
FLSKO_HF_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell
```

لا تضع `HF_TOKEN` داخل تطبيق الهاتف (`EXPO_PUBLIC_*`).

## الطبقة المجانية على HF (2026)

- رصيد استدلال شهري صغير على الحساب المجاني عبر **Inference Providers**
- بعد نفاد الرصيد قد تحتاج شحن رصيد أو الاعتماد على Pollinations / AI Horde (بلا HF)
- الفيديو عبر HF غالبًا عبر مزودي شركاء (fal / Replicate…) ويستهلك رصيدًا — ليس “بلا حدود”

## مصادر موصى بربطها مع المشروع

| المصدر | مجاني؟ | الاستخدام في Flsko |
|--------|--------|---------------------|
| Hugging Face Router | توكن مجاني + رصيد محدود | محادثة + صور |
| Pollinations legacy | بدون مفتاح | صور |
| AI Horde | بدون مفتاح (أو مفتاح مجاني) | صور |
| enter.pollinations.ai | مفتاح مجاني اختياري | صور/فيديو/صوت أعلى حصة |
| Docker MusicGen (`adapters/musicgen`) | ذاتي | موسيقى |
| `FLSKO_VIDEO_PROVIDER_URL` | ذاتي / GPU | فيديو |

## المفاتيح التي أرسلتها سابقًا بالصور

ضعها على **أسرار Cloudflare Workers** (أو Render) وليس في GitHub:

- `HF_TOKEN` / أي توكن Hugging Face ظهر في اللقطات  
- `FLSKO_GEMINI_API_KEY` بعد تفعيل Generative Language API  
- `FLSKO_POLLINATIONS_API_KEY` إن وُجد  
- Google OAuth client id/secret + redirect URI للإنتاج  

إذا أعدت لصق **HF_TOKEN** هنا أختبره مباشرة على المحادثة وتوليد صورة.
