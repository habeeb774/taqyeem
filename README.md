# TAQYEEM — النسخة المؤسسية النهائية

نظام تقييم أداء الموظفين مع الحفاظ على الواجهة الأصلية، وتحويل طبقة البيانات والمصادقة إلى بنية Server-Side حقيقية تعتمد على Neon PostgreSQL.

## ما تم تطبيقه

- Neon PostgreSQL هو المصدر المركزي للبيانات.
- Drizzle ORM + Drizzle Kit مع schema ومجلد migrations فعلي.
- Auth.js / NextAuth Credentials مع جلسات موقعة وكلمات مرور `bcrypt`.
- توافق انتقالي لمرة واحدة مع حسابات Neon Auth القديمة: بعد أول دخول ناجح يُحفظ hash آمن ويستمر الحساب عبر Auth.js.
- Role / Permission / Permission Override / Scope على السيرفر.
- نطاقات: `organization`, `branch`, `department`, `assigned_employees`.
- منع الوصول إلى الموظفين والتقييمات خارج نطاق المستخدم من Backend.
- الموظفون والفروع والإدارات والأقسام والمسميات من PostgreSQL.
- سجل تاريخي لنقل وتغيير تبعية الموظف (`employee_assignments`).
- دورات وقوالب ومعايير وتقييمات وإجابات فعلية في قاعدة البيانات.
- Autosave لكل إجابة وملاحظات، واستئناف التقييم من أول سؤال غير مكتمل.
- حالات التقييم: Draft → Submitted → Reviewed → Approved → Published → Locked، مع Reopen بسبب إلزامي.
- أهداف المبيعات والحضور وسجل تغيير الهدف.
- Audit Log + Notifications + System Settings.
- تقارير Excel تُنشأ من بيانات Neon المسموح للمستخدم الوصول إليها.
- Pagination / Server-side search للموظفين، مع تجميع التقارير على السيرفر.
- إزالة الاعتماد على `localStorage` لتخزين بيانات العمل. ما بقي في الواجهة القديمة هو Cache ذاكرة مؤقت غير دائم فقط.
- Zod للتحقق من مدخلات العمليات الحساسة.
- Soft delete للكيانات التاريخية المهمة.
- واجهة HTML الأصلية محفوظة قدر الإمكان؛ التغيير الأساسي في Backend.

## الملفات المهمة

- `src/db/index.ts` — اتصال Neon المركزي + Drizzle.
- `src/db/schema/` — مخطط Drizzle.
- `src/db/queries/` — استعلامات الصلاحيات والتقييمات.
- `drizzle/0001_public_authjs_upgrade.sql` — Migration الترقية النهائية.
- `database/legacy-full-schema.sql` — مخطط TAQYEEM الأساسي لقاعدة جديدة كليًا.
- `database/legacy-data-seed.sql` — بيانات الموظفين والمعايير القديمة بطريقة idempotent.
- `src/auth.ts` — Auth.js.
- `src/server/context.ts` — Session + Permission + Scope context.
- `public/legacy.html` — الواجهة الأصلية.
- `public/full-services.js` — ربط الواجهة بالـ API الحقيقي.

## الرفع اليدوي على Vercel

1. فك ضغط المشروع، وارفع **المجلد الذي يحتوي `package.json` مباشرة** إلى مستودع/مشروع Vercel.
2. في Vercel > Project Settings > Environment Variables أضف:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
AUTH_SECRET=ضع_قيمة_عشوائية_طويلة_جداً
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://YOUR-PROJECT.vercel.app
```


3. لا تغيّر Build Command. Vercel سيستخدم `vercel-build` الموجود في `package.json`:

```bash
tsx scripts/prepare-base.ts && tsx scripts/apply-upgrade.ts && next build
```

- إذا كانت قاعدة TAQYEEM الحالية موجودة: لا يتم حذف أو إعادة إنشاء البيانات؛ يتم تطبيق Migration الترقية فقط.
- إذا كانت قاعدة Neon فارغة تمامًا: يتم تهيئة المخطط الأساسي أولًا، ثم تطبيق Migration النهائية.

4. بعد نجاح النشر افتح رابط الموقع.
   - إذا كانت القاعدة الحالية تحتوي مستخدمين: ستظهر شاشة تسجيل الدخول المعتادة.
   - إذا كانت قاعدة جديدة بلا مستخدمين: ستظهر شاشة **تهيئة مدير النظام لأول مرة**، وبعد إنشائه تختفي تلقائيًا.

## أوامر محلية مفيدة

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate
npm run db:seed
```

إنشاء/إعادة ضبط Super Admin من الطرفية عند الحاجة:

```bash
SUPER_ADMIN_EMAIL=admin@example.com \
SUPER_ADMIN_PASSWORD='StrongPasswordHere' \
SUPER_ADMIN_NAME='مدير النظام' \
npm run create:super-admin
```

لا تُرفع ملفات `.env` أو أي Secrets إلى Git.

## ملاحظات قاعدة البيانات

- `DATABASE_URL` يستخدم على السيرفر فقط ولا يوجد أي متغير `NEXT_PUBLIC_DATABASE_URL`.
- الاستعلامات التي تعرض الموظفين والتقييمات تمر عبر Security Context وتُقيّد حسب Scope.
- تعديل هدف معتمد/موجود إلى قيمة جديدة يتطلب سببًا، ويُسجل في `target_change_history` و`audit_logs`.
- بيانات Seed تستخدم Upsert / Unique Constraints ولا يُفترض تكرارها عند إعادة التنفيذ.
- PIN القديم وكلمات المرور الصريحة لا يتم استيرادها إلى قاعدة البيانات.

## فحص ما قبل الإنتاج

اختبر بهذا التسلسل بعد النشر:

1. تسجيل الدخول.
2. التأكد أن المستخدم يرى الموظفين ضمن Scope فقط.
3. فتح دورة شهرية وموظف مسموح.
4. بدء تقييم والإجابة عن بعض الأسئلة.
5. إغلاق الصفحة والعودة؛ يجب فتح التقييم عند أول سؤال غير مكتمل مع بقاء الإجابات السابقة.
6. إكمال وإرسال التقييم ثم مراجعته واعتماده ونشره بحسابات الصلاحيات المناسبة.
7. التأكد من ظهوره في التقرير وAudit Log.
8. محاولة الوصول لموظف خارج النطاق من API؛ يجب أن تعود `403 FORBIDDEN`.



## Vercel migration runner

Vercel uses `scripts/apply-upgrade.ts` to apply the Drizzle SQL migration through the Neon server-side client before `next build`. This avoids build-time websocket/driver issues from invoking Drizzle Kit directly while retaining the Drizzle schema and migration file as the source of truth. `npm run db:migrate:drizzle` remains available for manual Drizzle Kit migration runs.


## Vercel/Neon compatibility fix
This revision removes the obsolete `auth.users` / Neon Auth dependency. Auth.js uses `public.users`, and the enterprise migration upgrades an existing TAQYEEM public schema in-place (including `user_scopes`, permission overrides, sales target history, and indexes).

## Build cleanup fix
- Removes stale src/lib/neon/legacy-auth.ts before local and Vercel builds.
- Fails fast if any @neondatabase/auth import remains under src.
