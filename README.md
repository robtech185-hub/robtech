# RobTech — Phase 2

هذه المرحلة تنقل RobTech من Prototype إلى Backend فعلي يحتوي على AI Agent وTools.

## ما تم تنفيذه

- Node.js + Express backend.
- OpenAI Responses API.
- AI Agent instructions.
- Function tools:
  - `write_file`
  - `read_file`
  - `list_files`
  - `create_zip`
- Web search tool متاح للوكيل.
- Workspace منفصل للمشروع.
- حماية أساسية من path traversal.
- إنشاء ZIP حقيقي من ملفات المشروع.
- واجهة عربية تتصل بالـBackend.
- حفظ مفتاح API في `.env` فقط.

## التشغيل

يتطلب Node.js حديثًا.

```bash
npm install
```

ثم:

```bash
cp .env.example .env
```

ضع مفتاح OpenAI في:

```env
OPENAI_API_KEY=...
```

ثم:

```bash
npm start
```

افتح:

```text
http://localhost:3000
```

## ملاحظات مهمة

هذه ليست بعد منصة إنتاجية آمنة لتشغيل أي كود من المستخدمين. لا تضف `run_command` أو Docker execution قبل بناء Sandbox حقيقي بعزل الشبكة والموارد.

المرحلة التالية المقترحة:
1. Docker Sandbox.
2. Preview server لكل مشروع.
3. توليد الصور وحفظها في assets.
4. قاعدة بيانات وحسابات المستخدمين.
5. Streaming للـAgent بدل انتظار الطلب كاملًا.
6. نشر المشروع مباشرة.
