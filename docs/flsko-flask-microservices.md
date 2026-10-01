# Flsko Flask — Remote AI Microservices

هذه حزمة Flask خفيفة لا تحتوي PyTorch أو أوزان نماذج أو ملفات وسائط محلية. كل نموذج من المشاريع الثمانية يُستدعى عبر موصل HTTP خارجي قابل للتهيئة، مثل RunPod أو Modal أو Replicate أو Cloud Run GPU أو بوابة MCP/LibreChat.

## الهيكل

```text
flsko_flask/
  app.py                         # Flask factory + health
  env.example                    # قالب المتغيرات (لا يحتوي أسرارًا)
  requirements.txt
  blueprints/
    video_bp.py                 # SkyReels, Allegro, Cosmos, Open Generative AI
    chat_agent_bp.py            # LibreChat/MCP + Context Mode
    interactive_bp.py           # Open-LLM-VTuber + Vibe Trading
  services/
    gcs_service.py              # Streaming uploads + signed URLs
    remote_inference.py         # HTTP connectors, no model weights
    context_mode.py             # deterministic context reduction
```

## التشغيل

```bash
cd flsko_flask
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp env.example .env
# املأ GCP_BUCKET_NAME وهوية GCP في بيئة الاستضافة، لا ترفع .env
python -m flsko_flask.app
```

## أمثلة المسارات

```bash
curl http://localhost:7860/health
curl -X POST http://localhost:7860/api/video/generate \
  -H 'content-type: application/json' \
  -d '{"provider":"allegro","prompt":"لقطة قصيرة لمدينة دمشق عند الغروب"}'

curl -X POST http://localhost:7860/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"اكتب لي جوابًا باللهجة الشامية"}'

curl -X POST http://localhost:7860/api/interactive/vtuber \
  -H 'content-type: application/json' \
  -d '{"text":"أهلًا بالحبيب"}'
```

## عقد الموصلات الخارجية

كل endpoint يَستقبل JSON ويعيد JSON. للنتائج الفورية يمكن أن يعيد `url` أو `output_url` أو `video_url` أو `audio_url` أو `image_url`. للمهام غير المتزامنة يعيد `job_id` ويُترك polling للموصل الخارجي أو طبقة job queue لاحقة.

هذا الهيكل لا يدّعي أن المشاريع الثمانية توفر APIs عامة موحدة؛ يجب نشر أو اختيار gateway مناسب لكل مشروع، ثم ضبط متغير URL الخاص به. لا تُضع التوكنات داخل تطبيق الهاتف.

## سياسة Zero-Disk

- GCS يرفع استجابة HTTP عبر `.raw` مباشرة إلى bucket.
- لا تُحفظ الصور أو الفيديوهات أو الأوديوهات في مجلد المشروع.
- يُستخدم الذاكرة فقط للطلبات الصغيرة؛ الإنتاج يُفضّل فيه streaming multipart أو روابط provider البعيدة.
- Signed URLs مؤقتة افتراضيًا لمدة 900 ثانية.
- Google credentials تُقرأ من JSON/base64 أو هوية المنصة ولا تُكتب إلى القرص.

## حدود السلامة

Vibe Trading يعيد تحليلًا آليًا فقط مع إخلاء مسؤولية، وليس توصية مالية. Context Mode يضغط السياق بطريقة حتمية، ولا يضمن نسبة توفير ثابتة مثل 90% لأن النسبة تعتمد على المحادثة.
