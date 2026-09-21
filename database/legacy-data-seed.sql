-- ============================================================
-- TAQYEEM — ترحيل الموظفين والبيانات الثابتة من الملف القديم
-- المصدر: تقييم-الموظفين-السويد(4).html
-- تم توليد هذا الملف آليًا من البيانات الثابتة الموجودة في المصدر.
--
-- متطلبات التشغيل:
--   1) تشغيل migrations الخاصة بمشروع TAQYEEM أولًا.
--   2) تنفيذ هذا الملف على قاعدة production / neondb.
--
-- ملاحظات:
--   - الملف قابل لإعادة التشغيل (Idempotent) قدر الإمكان.
--   - لا يحذف الموظفين أو التقييمات الحالية.
--   - أرقام PIN القديمة غير مستوردة لأن النظام الحالي يستخدم البريد وكلمة المرور.
--   - employees.active عمود Generated من status، لذلك لا يتم إدخاله أو تحديثه يدويًا.
-- ============================================================

DO $seed$
DECLARE
    v_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    rec jsonb;
    crit jsonb;
    v_job_title_id uuid;
    v_emp_id uuid;
    v_manager_id uuid;
    v_template_id uuid;
    v_criterion_id uuid;
    v_emp_no text;
    v_code text;
    v_count integer;
BEGIN
    -- --------------------------------------------------------
    -- 1) الشركة
    -- --------------------------------------------------------
    INSERT INTO public.organizations (id, name, code, active)
    VALUES (v_org, 'السويد', 'ALSUWAID', true)
    ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           code = EXCLUDED.code,
           active = true,
           updated_at = now();

    -- --------------------------------------------------------
    -- 2) المسميات الوظيفية
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"code":"LEGACY-JT-001","name":"أخصائي عمليات الموارد البشرية"},{"code":"LEGACY-JT-002","name":"أخصائي مشتريات"},{"code":"LEGACY-JT-003","name":"أمين مستودع رئيسي"},{"code":"LEGACY-JT-004","name":"أمين مستودع فرعي"},{"code":"LEGACY-JT-005","name":"الرئيس التنفيذي"},{"code":"LEGACY-JT-006","name":"المدير المالي"},{"code":"LEGACY-JT-007","name":"بائع"},{"code":"LEGACY-JT-008","name":"بائع خدمة ذاتية"},{"code":"LEGACY-JT-009","name":"خدمة عملاء"},{"code":"LEGACY-JT-010","name":"سائق"},{"code":"LEGACY-JT-011","name":"صانع محتوى"},{"code":"LEGACY-JT-012","name":"عامل مستودع رئيسي"},{"code":"LEGACY-JT-013","name":"عامل مستودع فرعي"},{"code":"LEGACY-JT-014","name":"فني تركيب"},{"code":"LEGACY-JT-015","name":"كاتب محتوى وأخصائي SEO"},{"code":"LEGACY-JT-016","name":"محاسب الإيرادات"},{"code":"LEGACY-JT-017","name":"محاسب المصروفات"},{"code":"LEGACY-JT-018","name":"محاسب مراقبة المخزون"},{"code":"LEGACY-JT-019","name":"محاسب مستودع فرعي"},{"code":"LEGACY-JT-020","name":"مدير التسويق الإلكتروني"},{"code":"LEGACY-JT-021","name":"مدير المبيعات والتسويق"},{"code":"LEGACY-JT-022","name":"مدير الموارد البشرية"},{"code":"LEGACY-JT-023","name":"مدير عمليات المتجر الإلكتروني"},{"code":"LEGACY-JT-024","name":"مدير فرع"},{"code":"LEGACY-JT-025","name":"مدير قسم منتجات الكهرباء"},{"code":"LEGACY-JT-026","name":"مدير مستودع رئيسي"},{"code":"LEGACY-JT-027","name":"مراقب موارد بشرية"},{"code":"LEGACY-JT-028","name":"مشرف الدعم التقني"},{"code":"LEGACY-JT-029","name":"مشرف خدمة عملاء الفروع"},{"code":"LEGACY-JT-030","name":"مشرف خدمة عملاء المتجر الإلكتروني"},{"code":"LEGACY-JT-031","name":"مشرف صيانة"},{"code":"LEGACY-JT-032","name":"مشرف قسم الحركة والنقل"},{"code":"LEGACY-JT-033","name":"مشرف مستودع رئيسي"},{"code":"LEGACY-JT-034","name":"مصمم جرافيك ومسؤول إضافة منتجات"},{"code":"LEGACY-JT-035","name":"مندوب مشتريات منتجات الكهرباء"},{"code":"LEGACY-JT-036","name":"منسق شؤون حكومية"},{"code":"LEGACY-JT-037","name":"نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن"},{"code":"LEGACY-JT-038","name":"نائب مدير المبيعات والتسويق"}]$json$::jsonb)
    LOOP
        SELECT id INTO v_job_title_id
        FROM public.job_titles
        WHERE organization_id = v_org
          AND name = rec->>'name'
        LIMIT 1;

        IF v_job_title_id IS NULL THEN
            v_code := rec->>'code';

            IF EXISTS (
                SELECT 1 FROM public.job_titles
                WHERE organization_id = v_org AND code = v_code
            ) THEN
                v_code := 'LEGACY-JT-X-' || upper(substr(md5(rec->>'name'), 1, 8));
            END IF;

            INSERT INTO public.job_titles
                (organization_id, name, code, description, active)
            VALUES
                (v_org, rec->>'name', v_code, 'مرحّل من الملف القديم', true)
            RETURNING id INTO v_job_title_id;
        ELSE
            UPDATE public.job_titles
               SET active = true,
                   deleted_at = NULL,
                   updated_at = now()
             WHERE id = v_job_title_id;
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- 3) الموظفون
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"employee_number":"LEGACY-001","name":"محمد عبد العزيز السيد عبد الله","title":"بائع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-002","name":"عزام عبدالله محمد السويد","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-003","name":"حمد مصطفي بسطاوي محمد","title":"منسق شؤون حكومية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-004","name":"محمد البشير الكباشي الشيخ","title":"أخصائي مشتريات","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-005","name":"جهاد الدين علي ضياء الدين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-006","name":"عدنان خان صافي الله","title":"عامل مستودع فرعي","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-007","name":"ابراهيم محمد أحمد رحمة الله","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-008","name":"عبدالله سالم حسن الحنيني","title":"أخصائي عمليات الموارد البشرية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-009","name":"عبد العزيز الشبرمي","title":"مدير عمليات المتجر الإلكتروني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-010","name":"سليمان عبد الله سليمان التويجري","title":"مندوب مشتريات منتجات الكهرباء","manager":"منصور احمد منصور"},{"employee_number":"LEGACY-011","name":"احمد ابراهيم فتحي بريقع","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-012","name":"على حمد صالح الخطيب","title":"مشرف خدمة عملاء الفروع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-013","name":"محمد ابجال انصاري افضل","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-014","name":"عبدالعزيز محمد حسن عبدالعزيز","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-015","name":"حسان ابراهيم عبدالله السويد","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-016","name":"عمران احمد معين الدين","title":"مشرف مستودع رئيسي","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-017","name":"محمد أيوب انصاري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-018","name":"محمد سليمان عبدالله السويد","title":"الرئيس التنفيذي","manager":null},{"employee_number":"LEGACY-019","name":"محمد فوزي الشرباصي الشهاوي","title":"محاسب مراقبة المخزون","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-020","name":"امين الله شاكر الله","title":"أمين مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-021","name":"محمد عثمان محمد اسلم","title":"مشرف قسم الحركة والنقل","manager":"محمد علي عبدالله المطوع"},{"employee_number":"LEGACY-022","name":"محمد خالد عبدالرحمن السويد","title":"نائب مدير المبيعات والتسويق","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-023","name":"ابراهيم فهد عبدالعزيز المهنا","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-024","name":"عبدالله محمد اسلم خان","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-025","name":"غلام نابي محمد دين","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-026","name":"محمد عبدالحليم ابراهيم حسن","title":"المدير المالي","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-027","name":"حمادة محمد عبدالجواد مصطفى","title":"محاسب الإيرادات","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-028","name":"اسلام احمد خليفة احمد","title":"محاسب المصروفات","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-029","name":"معاذ عبدالرحمن عبدالله البشري","title":"مدير الموارد البشرية","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-030","name":"عمر شاهين محمد سيد","title":"مشرف مستودع رئيسي","manager":"محمد علي عبدالله المطوع"},{"employee_number":"LEGACY-031","name":"محمد سمان محمد ليم","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-032","name":"محمد حسن مير حسن","title":"سائق","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-033","name":"حسام حيدر يوسف العبيد","title":"مشرف الدعم التقني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-034","name":"سليمان عبدالله خريف الخريف","title":"بائع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-035","name":"عابد محمد محمد دين توباسوم","title":"أمين مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-036","name":"متيار خان","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-037","name":"خالد خان خان زاده","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-038","name":"نعيم كهوني قل","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-039","name":"يزيد إبراهيم فهد الشمري","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-040","name":"رحيم الله شاكر الله","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-041","name":"عدنان محمد ارشد محمد ايوب أيوب","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-042","name":"عبدالله عبدالرحمن عبدالله البشري","title":"نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-043","name":"محمد نصر جمشين","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-044","name":"جاكر حسين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-045","name":"محمد السيد محمد دسوقي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-046","name":"علي بدر علي الجربوع","title":"بائع خدمة ذاتية","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-047","name":"محمد اشرف صابر سليمان","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-048","name":"شاكر حسين","title":"مشرف مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-049","name":"الوليد عبد الرحمن عبدالله الزارع","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-050","name":"محمد ارشد اسحاق نظام الدين","title":"أمين مستودع فرعي","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-051","name":"عرفان حسين مزمل حسن","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-052","name":"هاشم سالم جعفر الكاف","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-053","name":"عبدالله تيسير علي الأطرش","title":"مشرف صيانة","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-054","name":"أحمد جمال العبيدي","title":"مدير التسويق الإلكتروني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-055","name":"نور الدين حسن حاج علي","title":"أمين مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-056","name":"شاه فهد أخلاق","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-057","name":"هشام سباعي محمودي سالم","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-058","name":"تورخان شاه زمان خان","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-059","name":"عدي عوض الكريم محمد دفع الله","title":"مشرف خدمة عملاء المتجر الإلكتروني","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-060","name":"نصر محمد حبيب الله احمد علي نصر","title":"بائع خدمة ذاتية","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-061","name":"محمد عطيه السيد أبو رواش","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-062","name":"نبيل محسن","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-063","name":"إبراهيم كوري تراوري","title":"محاسب مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-064","name":"هاشم محمد الياس ألياس","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-065","name":"ابراهيم علي عبد العليم النادي","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-066","name":"ابراهيم سعود ناصر الحوطي","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-067","name":"عبدلله ابراهيم ابراهيم شمس الدين","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-068","name":"خالد رمضان حسن علي","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-069","name":"عبدالله السنيدي","title":"صانع محتوى","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-070","name":"سلمان خان","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-071","name":"احمد وجيه ناصف","title":"كاتب محتوى وأخصائي SEO","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-072","name":"عمار عبدالكريم البرادي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-073","name":"سامي عبدالرحمن الجاسر","title":"مراقب موارد بشرية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-074","name":"منصور احمد منصور","title":"مدير قسم منتجات الكهرباء","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-075","name":"محمد صابر سعد ابو مسلم","title":"مدير المبيعات والتسويق","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-076","name":"محمد علي عبدالله المطوع","title":"مدير مستودع رئيسي","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-077","name":"محمد سليمان محمد العقيل","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-078","name":"اسامة عبدالله محمد التويجري","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-079","name":"ابراهيم عبدالله صالح العليان","title":"بائع","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-080","name":"رضا عبدالقادر ابراهيم الحنفي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-081","name":"السيد عبدالرحمن عبدالرحمن الصردي","title":"بائع","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-082","name":"علي احمد راشد احمد","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-083","name":"حبيب ناظر عبدالواحد عبده","title":"مصمم جرافيك ومسؤول إضافة منتجات","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-084","name":"مجتبى لطيف","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-085","name":"عمران أحمد أنصاري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-086","name":"وسيم صالح محمد الخوبري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-087","name":"نعمان إسحاق","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-088","name":"برهان خان محمد خان","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-089","name":"محمد سجاد محمد عليم","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-090","name":"امام حسين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-091","name":"سميع الله نو","title":"عامل مستودع فرعي","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-092","name":"محمد روبيل","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-093","name":"إبراهيم اسماعيل","title":"فني تركيب","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-094","name":"منى","title":"خدمة عملاء","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-095","name":"أمل","title":"خدمة عملاء","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-096","name":"عبدالعزيز إسماعيل","title":"فني تركيب","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-097","name":"فني تركيب","title":null,"manager":null}]$json$::jsonb)
    LOOP
        v_job_title_id := NULL;

        IF NULLIF(rec->>'title', '') IS NOT NULL THEN
            SELECT id INTO v_job_title_id
            FROM public.job_titles
            WHERE organization_id = v_org
              AND name = rec->>'title'
            LIMIT 1;
        END IF;

        SELECT id INTO v_emp_id
        FROM public.employees
        WHERE organization_id = v_org
          AND (
              legacy_source_id = rec->>'name'
              OR full_name = rec->>'name'
          )
        ORDER BY CASE WHEN legacy_source_id = rec->>'name' THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_emp_id IS NULL THEN
            v_emp_no := rec->>'employee_number';

            IF EXISTS (
                SELECT 1
                FROM public.employees
                WHERE organization_id = v_org
                  AND employee_number = v_emp_no
            ) THEN
                v_emp_no := 'LEGACY-X-' || upper(substr(md5(rec->>'name'), 1, 10));
            END IF;

            INSERT INTO public.employees
                (organization_id, employee_number, full_name, normalized_name,
                 job_title_id, legacy_source_id, status)
            VALUES
                (v_org, v_emp_no, rec->>'name', rec->>'name',
                 v_job_title_id, rec->>'name', 'active')
            RETURNING id INTO v_emp_id;
        ELSE
            UPDATE public.employees
               SET full_name = rec->>'name',
                   normalized_name = rec->>'name',
                   job_title_id = v_job_title_id,
                   legacy_source_id = COALESCE(legacy_source_id, rec->>'name'),
                   status = 'active',
                   deleted_at = NULL,
                   updated_at = now()
             WHERE id = v_emp_id;
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- 4) ربط كل موظف بمديره/المقيّم الأساسي من الملف القديم
    --    المقيّم HR رقم 16 لا يُستخدم كمدير مباشر.
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"employee_number":"LEGACY-001","name":"محمد عبد العزيز السيد عبد الله","title":"بائع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-002","name":"عزام عبدالله محمد السويد","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-003","name":"حمد مصطفي بسطاوي محمد","title":"منسق شؤون حكومية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-004","name":"محمد البشير الكباشي الشيخ","title":"أخصائي مشتريات","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-005","name":"جهاد الدين علي ضياء الدين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-006","name":"عدنان خان صافي الله","title":"عامل مستودع فرعي","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-007","name":"ابراهيم محمد أحمد رحمة الله","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-008","name":"عبدالله سالم حسن الحنيني","title":"أخصائي عمليات الموارد البشرية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-009","name":"عبد العزيز الشبرمي","title":"مدير عمليات المتجر الإلكتروني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-010","name":"سليمان عبد الله سليمان التويجري","title":"مندوب مشتريات منتجات الكهرباء","manager":"منصور احمد منصور"},{"employee_number":"LEGACY-011","name":"احمد ابراهيم فتحي بريقع","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-012","name":"على حمد صالح الخطيب","title":"مشرف خدمة عملاء الفروع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-013","name":"محمد ابجال انصاري افضل","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-014","name":"عبدالعزيز محمد حسن عبدالعزيز","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-015","name":"حسان ابراهيم عبدالله السويد","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-016","name":"عمران احمد معين الدين","title":"مشرف مستودع رئيسي","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-017","name":"محمد أيوب انصاري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-018","name":"محمد سليمان عبدالله السويد","title":"الرئيس التنفيذي","manager":null},{"employee_number":"LEGACY-019","name":"محمد فوزي الشرباصي الشهاوي","title":"محاسب مراقبة المخزون","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-020","name":"امين الله شاكر الله","title":"أمين مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-021","name":"محمد عثمان محمد اسلم","title":"مشرف قسم الحركة والنقل","manager":"محمد علي عبدالله المطوع"},{"employee_number":"LEGACY-022","name":"محمد خالد عبدالرحمن السويد","title":"نائب مدير المبيعات والتسويق","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-023","name":"ابراهيم فهد عبدالعزيز المهنا","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-024","name":"عبدالله محمد اسلم خان","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-025","name":"غلام نابي محمد دين","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-026","name":"محمد عبدالحليم ابراهيم حسن","title":"المدير المالي","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-027","name":"حمادة محمد عبدالجواد مصطفى","title":"محاسب الإيرادات","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-028","name":"اسلام احمد خليفة احمد","title":"محاسب المصروفات","manager":"محمد عبدالحليم ابراهيم حسن"},{"employee_number":"LEGACY-029","name":"معاذ عبدالرحمن عبدالله البشري","title":"مدير الموارد البشرية","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-030","name":"عمر شاهين محمد سيد","title":"مشرف مستودع رئيسي","manager":"محمد علي عبدالله المطوع"},{"employee_number":"LEGACY-031","name":"محمد سمان محمد ليم","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-032","name":"محمد حسن مير حسن","title":"سائق","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-033","name":"حسام حيدر يوسف العبيد","title":"مشرف الدعم التقني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-034","name":"سليمان عبدالله خريف الخريف","title":"بائع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-035","name":"عابد محمد محمد دين توباسوم","title":"أمين مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-036","name":"متيار خان","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-037","name":"خالد خان خان زاده","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-038","name":"نعيم كهوني قل","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-039","name":"يزيد إبراهيم فهد الشمري","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-040","name":"رحيم الله شاكر الله","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-041","name":"عدنان محمد ارشد محمد ايوب أيوب","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-042","name":"عبدالله عبدالرحمن عبدالله البشري","title":"نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-043","name":"محمد نصر جمشين","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-044","name":"جاكر حسين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-045","name":"محمد السيد محمد دسوقي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-046","name":"علي بدر علي الجربوع","title":"بائع خدمة ذاتية","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-047","name":"محمد اشرف صابر سليمان","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-048","name":"شاكر حسين","title":"مشرف مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-049","name":"الوليد عبد الرحمن عبدالله الزارع","title":"مدير فرع","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-050","name":"محمد ارشد اسحاق نظام الدين","title":"أمين مستودع فرعي","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-051","name":"عرفان حسين مزمل حسن","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-052","name":"هاشم سالم جعفر الكاف","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-053","name":"عبدالله تيسير علي الأطرش","title":"مشرف صيانة","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-054","name":"أحمد جمال العبيدي","title":"مدير التسويق الإلكتروني","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-055","name":"نور الدين حسن حاج علي","title":"أمين مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-056","name":"شاه فهد أخلاق","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-057","name":"هشام سباعي محمودي سالم","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-058","name":"تورخان شاه زمان خان","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-059","name":"عدي عوض الكريم محمد دفع الله","title":"مشرف خدمة عملاء المتجر الإلكتروني","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-060","name":"نصر محمد حبيب الله احمد علي نصر","title":"بائع خدمة ذاتية","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-061","name":"محمد عطيه السيد أبو رواش","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-062","name":"نبيل محسن","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-063","name":"إبراهيم كوري تراوري","title":"محاسب مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-064","name":"هاشم محمد الياس ألياس","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-065","name":"ابراهيم علي عبد العليم النادي","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-066","name":"ابراهيم سعود ناصر الحوطي","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-067","name":"عبدلله ابراهيم ابراهيم شمس الدين","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-068","name":"خالد رمضان حسن علي","title":"بائع","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-069","name":"عبدالله السنيدي","title":"صانع محتوى","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-070","name":"سلمان خان","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-071","name":"احمد وجيه ناصف","title":"كاتب محتوى وأخصائي SEO","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-072","name":"عمار عبدالكريم البرادي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-073","name":"سامي عبدالرحمن الجاسر","title":"مراقب موارد بشرية","manager":"معاذ عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-074","name":"منصور احمد منصور","title":"مدير قسم منتجات الكهرباء","manager":"محمد صابر سعد ابو مسلم"},{"employee_number":"LEGACY-075","name":"محمد صابر سعد ابو مسلم","title":"مدير المبيعات والتسويق","manager":"محمد سليمان عبدالله السويد"},{"employee_number":"LEGACY-076","name":"محمد علي عبدالله المطوع","title":"مدير مستودع رئيسي","manager":"عبدالله عبدالرحمن عبدالله البشري"},{"employee_number":"LEGACY-077","name":"محمد سليمان محمد العقيل","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-078","name":"اسامة عبدالله محمد التويجري","title":"بائع","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-079","name":"ابراهيم عبدالله صالح العليان","title":"بائع","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-080","name":"رضا عبدالقادر ابراهيم الحنفي","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-081","name":"السيد عبدالرحمن عبدالرحمن الصردي","title":"بائع","manager":"حسان ابراهيم عبدالله السويد"},{"employee_number":"LEGACY-082","name":"علي احمد راشد احمد","title":"بائع","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-083","name":"حبيب ناظر عبدالواحد عبده","title":"مصمم جرافيك ومسؤول إضافة منتجات","manager":"احمد جمال العبيدي"},{"employee_number":"LEGACY-084","name":"مجتبى لطيف","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-085","name":"عمران أحمد أنصاري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-086","name":"وسيم صالح محمد الخوبري","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-087","name":"نعمان إسحاق","title":"سائق","manager":"محمد عثمان محمد اسلم"},{"employee_number":"LEGACY-088","name":"برهان خان محمد خان","title":"عامل مستودع فرعي","manager":"الوليد عبد الرحمن عبدالله الزارع"},{"employee_number":"LEGACY-089","name":"محمد سجاد محمد عليم","title":"عامل مستودع فرعي","manager":"ابراهيم فهد عبدالعزيز المهنا"},{"employee_number":"LEGACY-090","name":"امام حسين","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-091","name":"سميع الله نو","title":"عامل مستودع فرعي","manager":"عبدالعزيز محمد حسن عبدالعزيز"},{"employee_number":"LEGACY-092","name":"محمد روبيل","title":"عامل مستودع رئيسي","manager":"عمر شاهين محمد سيد"},{"employee_number":"LEGACY-093","name":"إبراهيم اسماعيل","title":"فني تركيب","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-094","name":"منى","title":"خدمة عملاء","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-095","name":"أمل","title":"خدمة عملاء","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-096","name":"عبدالعزيز إسماعيل","title":"فني تركيب","manager":"عبد العزيز الشبرمي"},{"employee_number":"LEGACY-097","name":"فني تركيب","title":null,"manager":null}]$json$::jsonb)
    LOOP
        SELECT id INTO v_emp_id
        FROM public.employees
        WHERE organization_id = v_org
          AND (legacy_source_id = rec->>'name' OR full_name = rec->>'name')
        LIMIT 1;

        v_manager_id := NULL;
        IF NULLIF(rec->>'manager', '') IS NOT NULL THEN
            SELECT id INTO v_manager_id
            FROM public.employees
            WHERE organization_id = v_org
              AND (legacy_source_id = rec->>'manager' OR full_name = rec->>'manager')
            LIMIT 1;
        END IF;

        SELECT id INTO v_job_title_id
        FROM public.job_titles
        WHERE organization_id = v_org
          AND name = NULLIF(rec->>'title', '')
        LIMIT 1;

        UPDATE public.employees
           SET manager_id = v_manager_id,
               job_title_id = v_job_title_id,
               updated_at = now()
         WHERE id = v_emp_id;

        UPDATE public.employee_assignments
           SET job_title_id = v_job_title_id,
               manager_id = v_manager_id,
               effective_to = NULL,
               reason = 'ترحيل من الملف القديم',
               is_current = true
         WHERE employee_id = v_emp_id
           AND is_current = true;

        IF NOT FOUND THEN
            INSERT INTO public.employee_assignments
                (employee_id, job_title_id, manager_id, effective_from,
                 reason, is_current)
            VALUES
                (v_emp_id, v_job_title_id, v_manager_id, CURRENT_DATE,
                 'ترحيل من الملف القديم', true);
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- 5) معايير التقييم — 175 معيارًا فريدًا
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"key":"q1","text":"مدى التزام الموظف بالحضور والانضباط والأنظمة والسياسات المعتمدة.","hint":"الحضور والانصراف في وقتهما وتسجيل البصمة عبر تطبيق جسر دون نسيان، وتقديم طلبات الإجازة والاستئذان مسبقاً بوقت كافٍ، والالتزام بسياسات الشركة ولوائحها."},{"key":"q2","text":"جودة ودقة العمل المنجز وقدرته على إنجاز المهام المطلوبة بكفاءة.","hint":"إتقان المهام وخلوّها من الأخطاء، وإنجازها بالجودة المطلوبة دون الحاجة لإعادة العمل."},{"key":"q3","text":"التعاون والعمل بروح الفريق والتعامل الإيجابي مع الزملاء والعملاء.","hint":"التعاون مع الزملاء، والمشاركة الفعّالة في العمل الجماعي، وحسن التعامل مع العملاء."},{"key":"q4","text":"المبادرة وتحمل المسؤولية والمساهمة في حل المشكلات وتطوير العمل.","hint":"استباق المشكلات واقتراح الحلول، وتحمّل مسؤولية النتائج دون انتظار التوجيه."},{"key":"q5","text":"تحقيق الأهداف والمؤشرات المطلوبة منه خلال فترة التقييم.","hint":"بلوغ الأرقام والمؤشرات المتفق عليها خلال فترة التقييم."},{"key":"sl2","text":"يتعامل مع العملاء باحترافية ويقدم خدمة متميزة.","hint":"استقبال العميل بلباقة، وفهم احتياجه، ومتابعته حتى إتمام البيع."},{"key":"sl3","text":"يمتلك معرفة كافية بالمنتجات ويجيد عرضها.","hint":"الإلمام بمواصفات المنتجات وأسعارها والبدائل المتاحة، وعرضها بطريقة مقنعة."},{"key":"sl5","text":"ينجز مهام الفرع اليومية بكفاءة.","hint":"إنجاز المهام التشغيلية اليومية داخل الفرع في وقتها وبالجودة المطلوبة."},{"key":"sl6","text":"يتقن استخدام نظام نقاط البيع دون أخطاء.","hint":"إتمام الفواتير والمرتجعات والخصومات بدقة وسرعة دون أخطاء."},{"key":"n1","text":"يحافظ على الزيّ والمظهر والسلوك المهني.","hint":"الالتزام بالزيّ الرسمي وآداب التعامل داخل الفرع."},{"key":"wh1","text":"ينفذ عمليات الاستلام والصرف بدقة.","hint":"استلام البضائع وصرفها بالكميات الصحيحة وتوثيقها في النظام دون فروقات."},{"key":"wh2","text":"يحافظ على ترتيب ونظافة المستودع.","hint":"ترتيب الأرفف وتنظيف المواقع وسهولة الوصول للأصناف."},{"key":"wh4","text":"ينجز المهام المطلوبة في الوقت المحدد.","hint":"إنهاء أوامر التحميل والتفريغ ضمن الوقت المحدد دون تأخير."},{"key":"wh5","text":"يتعاون بفعالية مع فريق العمل.","hint":"مساندة الزملاء في أوقات الذروة والتنسيق معهم لإنجاز العمل."},{"key":"n2","text":"يحافظ على سلامة البضائع ويقلل التالف.","hint":"التستيف الصحيح ومنع الكسر والتلف أثناء المناولة."},{"key":"dr1","text":"يلتزم بمواعيد التسليم والاستلام.","hint":"الوصول لمواقع التسليم والاستلام في الوقت المتفق عليه مع العميل."},{"key":"dr2","text":"يحافظ على المركبة ويتابع جاهزيتها.","hint":"نظافة المركبة وفحصها دورياً ومتابعة الصيانة والتأمين والفحص."},{"key":"dr3","text":"يلتزم بأنظمة المرور وإجراءات السلامة.","hint":"القيادة الآمنة والالتزام بالسرعات المحددة وتجنّب المخالفات."},{"key":"dr4","text":"يحافظ على سلامة البضائع أثناء النقل.","hint":"تحميل البضائع وتثبيتها بطريقة تمنع التلف أو الفقد أثناء النقل."},{"key":"dr5","text":"يتعامل باحترافية مع العملاء والزملاء.","hint":"التعامل بلباقة مع العملاء عند التسليم وتمثيل الشركة بصورة لائقة."},{"key":"bm3","text":"يحقق مستوى مرتفعاً من رضا العملاء.","hint":"متابعة ملاحظات العملاء ومعالجة الشكاوى ورفع مستوى الرضا."},{"key":"bm5","text":"يدير موارد الفرع والمخزون بكفاءة ويحقق النتائج المطلوبة.","hint":"إدارة المخزون والمصروفات والموارد البشرية للفرع بكفاءة."},{"key":"n3","text":"يحقق مستهدف الربحية وضبط المصروفات.","hint":"إدارة تكاليف الفرع ضمن الموازنة المعتمدة."},{"key":"n4","text":"يضبط انضباط الفريق ويطبّق اللوائح.","hint":"متابعة الحضور والزيّ والسلوك المهني."},{"key":"ws1","text":"يدير عمليات المستودع بكفاءة.","hint":"تنظيم سير العمل اليومي وتوزيع المساحات ومتابعة الإنتاجية."},{"key":"ws3","text":"يحافظ على دقة المخزون ويعالج الفروقات.","hint":"ضمان تطابق الرصيد الفعلي مع النظام والتحقيق في أسباب الفروقات."},{"key":"ws5","text":"يتخذ القرارات المناسبة لحل المشكلات وتحسين الأداء.","hint":"معالجة المعوقات التشغيلية واتخاذ قرارات سريعة لتحسين الأداء."},{"key":"n5","text":"يجهّز طلبات الفروع في الوقت المحدد.","hint":"إنهاء أوامر التحويل دون تأخير على الفروع."},{"key":"n6","text":"ينسّق مع المشتريات والمبيعات بفعالية.","hint":"التواصل حول التوريد والنواقص واحتياج الفروع."},{"key":"ws2","text":"يوزع المهام ويتابع أداء فريق العمل بفعالية.","hint":"توزيع المهام على الفريق بعدالة ومتابعة إنجازها وتقييم الأداء."},{"key":"ft1","text":"الالتزام بالمواعيد اليومية وعدم التأخير على العملاء","hint":"الوصول لموقع العميل في الموعد المحدد وإشعاره مسبقاً عند أي تغيير."},{"key":"ft2","text":"جودة التركيب وخلو العمل من الأخطاء أو الشكاوى","hint":"تنفيذ التركيب بإتقان من أول مرة دون إعادة زيارة أو شكوى لاحقة."},{"key":"ft3","text":"التعامل الاحترافي مع العملاء أثناء الزيارة","hint":"احترام العميل وشرح العمل له والمحافظة على نظافة الموقع بعد الانتهاء."},{"key":"ft4","text":"القدرة على حل المشكلات الفنية في الموقع","hint":"تشخيص العطل ومعالجته ميدانياً دون تأجيل غير مبرر."},{"key":"ft5","text":"المحافظة على أدوات العمل والمعدات","hint":"العناية بالعدد والمعدات وقطع الغيار ومنع فقدها أو تلفها."},{"key":"q11","text":"حسن التعامل والتعاون مع باقي الموظفين داخل الفريق","hint":"التعاون مع الزملاء وتبادل المساندة داخل الفريق."},{"key":"q12","text":"سرعة التجاوب مع توجيهات المدير المباشر وتنفيذ المهام المطلوبة بدقة وفي الوقت المحدد","hint":"تنفيذ توجيهات المدير المباشر بدقة وضمن الوقت المطلوب."},{"key":"q13","text":"القدرة على اتخاذ القرار في المهام الروتينية دون الرجوع المتكرر للإدارة","hint":"البتّ في الأمور الروتينية باستقلالية دون الرجوع المتكرر للإدارة."},{"key":"q14","text":"تقليل الاستفسارات المتكررة والاعتماد على الحلول المتاحة والإجراءات المعتمدة","hint":"الاعتماد على الإجراءات المعتمدة والحلول المتاحة قبل طلب المساعدة."},{"key":"cs1","text":"سرعة الرد على العملاء (واتساب / مكالمات)","hint":"الرد على رسائل الواتساب والمكالمات ضمن الوقت المعتمد دون تأخير أو إهمال."},{"key":"cs2","text":"دقة إدخال البيانات في نظام Notion","hint":"تسجيل بيانات العميل والطلب في نوشن كاملة وصحيحة دون أخطاء تستدعي إعادة العمل."},{"key":"cs3","text":"متابعة مواعيد الصيانة الدورية بدون تأخير","hint":"تذكير العملاء بمواعيد الصيانة ومتابعة تنفيذها في وقتها دون نسيان."},{"key":"cs4","text":"تحويل الطلبات بشكل صحيح للفنيين أو الأقسام","hint":"توجيه الطلب للجهة الصحيحة من أول مرة وتقليل التحويلات المتكررة."},{"key":"cs5","text":"أسلوب التواصل ورضا العملاء","hint":"التعامل بلباقة واحترافية واحتواء الشكاوى وتحقيق رضا العميل."},{"key":"n7","text":"يدقّق مستندات الاستلام والصرف قبل الاعتماد.","hint":"مطابقة الفاتورة وأمر الشراء والكمية الفعلية."},{"key":"cc1","text":"جودة وإبداع المحتوى.","hint":"جودة الفكرة والتنفيذ وقدرة المحتوى على جذب الانتباه."},{"key":"cc2","text":"الالتزام بخطة النشر.","hint":"الالتزام بجدول النشر المعتمد وعدد المنشورات المستهدف."},{"key":"cc3","text":"جودة التصميم والإخراج.","hint":"جودة التصوير والمونتاج والإخراج النهائي للمحتوى."},{"key":"cc4","text":"الالتزام بالمواعيد.","hint":"تسليم المواد قبل موعد النشر بوقت كافٍ للمراجعة."},{"key":"cc5","text":"تحقيق التفاعل مع الجمهور.","hint":"نمو نسب المشاهدة والتفاعل والوصول للمنشورات."},{"key":"cw1","text":"جودة ودقة المحتوى المكتوب.","hint":"دقة المعلومة وسلامة الصياغة وملاءمتها للجمهور المستهدف."},{"key":"cw2","text":"الالتزام بالهوية والأسلوب.","hint":"اتساق المحتوى مع نبرة العلامة التجارية وهويتها البصرية."},{"key":"cw3","text":"سلامة اللغة والإملاء.","hint":"خلوّ النصوص من الأخطاء الإملائية والنحوية وعلامات الترقيم."},{"key":"cw4","text":"الالتزام بمواعيد التسليم.","hint":"تسليم المحتوى وفق الجدول المتفق عليه دون تأخير."},{"key":"cw5","text":"الإبداع في طرح الأفكار.","hint":"تقديم أفكار جديدة تميّز محتوى الشركة عن المنافسين."},{"key":"pu1","text":"دقة إدخال بيانات المنتجات.","hint":"إدخال الأسماء والأسعار والأكواد والمواصفات دون أخطاء."},{"key":"pu2","text":"اكتمال معلومات المنتجات.","hint":"استيفاء كل حقول المنتج من صور ووصف وتصنيف ومخزون."},{"key":"pu3","text":"سرعة تحديث المنتجات.","hint":"رفع المنتجات الجديدة وتحديث المتوفر منها في وقت قصير."},{"key":"pu4","text":"الالتزام بمعايير عرض المنتجات.","hint":"اتباع دليل عرض المنتجات في الصور والوصف والتصنيف."},{"key":"pu5","text":"تقليل أخطاء البيانات.","hint":"مراجعة البيانات قبل النشر وتقليل الأخطاء المتكررة."},{"key":"wa1","text":"يسجل الحركات المخزنية بدقة.","hint":"إدخال حركات الإدخال والإخراج في النظام فور حدوثها وبأرقام صحيحة."},{"key":"wa2","text":"يطابق أرصدة المخزون ويحد من الفروقات.","hint":"مطابقة الرصيد الدفتري بالفعلي دورياً ومعالجة أي فروقات فوراً."},{"key":"wa3","text":"يعد التقارير والسجلات في الوقت المحدد.","hint":"تسليم تقارير المخزون والجرد في مواعيدها المعتمدة."},{"key":"wa4","text":"يلتزم بالإجراءات والسياسات المحاسبية.","hint":"تطبيق الدورة المستندية وسياسات الصرف والاستلام المعتمدة."},{"key":"wa5","text":"يتعاون مع الإدارات ذات العلاقة بكفاءة.","hint":"التنسيق مع المشتريات والمبيعات والمالية لإنهاء المعاملات."},{"key":"q6","text":"دقة إدارة المخزون (تحديث الكميات وعدم وجود أخطاء جرد)","hint":"تحديث الكميات في النظام أولاً بأول وخلوّ الجرد من الفروقات."},{"key":"q7","text":"سرعة ودقة تجهيز الطلبات داخل المتجر","hint":"تجميع الطلب بالأصناف والكميات الصحيحة وتسليمه في وقته."},{"key":"q8","text":"مهارات البيع المباشر وزيادة متوسط قيمة الفاتورة","hint":"إقناع العميل واقتراح المنتجات المكمّلة لرفع قيمة الطلب."},{"key":"q9","text":"تنظيم المستودع وترتيب المنتجات وسهولة الوصول لها","hint":"ترتيب الأصناف في مواقعها وتسهيل الوصول إليها وقت التجهيز."},{"key":"q10","text":"متابعة الأسعار والتأكد من تحديثها بشكل مستمر","hint":"مراجعة الأسعار دورياً والتأكد من مطابقتها للمعتمد."},{"key":"pa1","text":"دقة تنفيذ إجراءات الشراء.","hint":"إعداد طلبات الشراء ومطابقتها للمواصفات والكميات."},{"key":"pa3","text":"التواصل مع الموردين.","hint":"التواصل مع الموردين لطلب العروض ومتابعة التوريد."},{"key":"pa4","text":"الالتزام بسياسات المشتريات.","hint":"الالتزام بدورة الشراء والصلاحيات والموافقات المعتمدة."},{"key":"pa5","text":"سرعة إنجاز الأعمال.","hint":"إنهاء المعاملات في وقت قصير دون تعطيل احتياج الأقسام."},{"key":"n8","text":"ينسّق مع المستودع حول النواقص","hint":"متابعة حدود إعادة الطلب."},{"key":"eo1","text":"كفاءة إدارة عمليات المتجر.","hint":"انسياب العمليات من الطلب حتى التسليم دون تعطّل."},{"key":"eo2","text":"تحسين تجربة العملاء.","hint":"تحسين رحلة الشراء وتقليل خطواتها ومعالجة نقاط الشكوى."},{"key":"eo4","text":"تطوير الأداء التشغيلي.","hint":"تطوير الإجراءات ورفع كفاءة التشغيل وتقليل الأخطاء."},{"key":"eo5","text":"التنسيق مع الإدارات.","hint":"التنسيق مع المستودع والمبيعات والتسويق والدعم التقني."},{"key":"n9","text":"يطوّر فريق المتجر ويرفع كفاءته","hint":"تدريب الفريق وتوزيع المهام."},{"key":"it1","text":"يعالج الأعطال والبلاغات بكفاءة وسرعة.","hint":"معالجة البلاغات التقنية بسرعة وإعادة الأنظمة للعمل."},{"key":"it3","text":"يلتزم بإنهاء الأعمال في الوقت المحدد.","hint":"إغلاق تذاكر الدعم ضمن الوقت المعتمد لكل نوع بلاغ."},{"key":"it4","text":"يتواصل بفعالية مع المستفيدين والإدارات.","hint":"شرح الحلول للمستفيدين والتنسيق مع الأقسام والموردين."},{"key":"it5","text":"يبادر إلى اقتراح حلول لتحسين جودة الدعم الفني.","hint":"اقتراح تحسينات تقنية تقلل الأعطال وترفع جودة الخدمة."},{"key":"n10","text":"يدرّب الموظفين على استخدام الأنظمة","hint":"رفع كفاءة المستخدمين وتقليل البلاغات."},{"key":"dm1","text":"تحقيق أهداف التسويق الرقمي.","hint":"بلوغ مستهدفات الزيارات والتحويل والمبيعات من القنوات الرقمية."},{"key":"dm2","text":"إدارة الحملات الإعلانية بكفاءة.","hint":"تخطيط الحملات وتنفيذها ومتابعة أدائها وتحسينها."},{"key":"dm4","text":"إدارة الميزانية التسويقية.","hint":"توزيع الإنفاق الإعلاني بكفاءة وتحقيق عائد مناسب."},{"key":"dm5","text":"قيادة فريق التسويق.","hint":"توجيه الفريق وتطوير مهاراته ومتابعة إنجازه."},{"key":"n11","text":"يحسّن نسبة التحويل على المتجر","hint":"رفع نسبة الزوار الذين يشترون."},{"key":"wm1","text":"كفاءة إدارة المستودع.","hint":"إدارة المساحات والعمالة والمعدات وتخطيط التشغيل."},{"key":"wm4","text":"الالتزام بالسياسات والإجراءات التشغيلية.","hint":"تطبيق الدورة المستندية وإجراءات الاستلام والصرف."},{"key":"wm5","text":"تحسين كفاءة التشغيل.","hint":"تقليل وقت التجهيز والتكاليف ورفع كفاءة التخزين."},{"key":"n12","text":"ينسّق مع المشتريات والمبيعات","hint":"التنسيق حول التوريد والاحتياج."},{"key":"n13","text":"يقترح تحسينات تشغيلية مستمرة","hint":"مبادرات لرفع الكفاءة وخفض التكلفة."},{"key":"cf1","text":"كفاءة إدارة الموارد المالية.","hint":"إدارة السيولة والالتزامات والتدفقات النقدية بكفاءة."},{"key":"cf2","text":"دقة التقارير والتحليلات المالية.","hint":"إعداد القوائم والتقارير المالية بدقة وفي مواعيدها."},{"key":"cf3","text":"الرقابة على التكاليف والمصروفات.","hint":"مراقبة التكاليف وضبط المصروفات ضمن الموازنة المعتمدة."},{"key":"cf4","text":"جودة اتخاذ القرارات المالية.","hint":"اتخاذ قرارات مالية مدروسة تدعم أهداف الشركة."},{"key":"cf5","text":"تطوير أداء الفريق المالي.","hint":"تدريب الفريق المالي ورفع كفاءته وتوزيع المهام بعدالة."},{"key":"hm1","text":"كفاءة إدارة الموارد البشرية.","hint":"إدارة التوظيف والرواتب والحضور وشؤون الموظفين بكفاءة."},{"key":"hm2","text":"تطوير السياسات والإجراءات.","hint":"تحديث السياسات واللوائح بما يتوافق مع نظام العمل."},{"key":"hm3","text":"تنمية أداء الموظفين.","hint":"وضع خطط التدريب والتقييم ومتابعة تطور الموظفين."},{"key":"hm4","text":"الالتزام بالأنظمة.","hint":"الالتزام بأنظمة العمل والتأمينات والجهات الحكومية."},{"key":"n14","text":"يدير الرواتب والمستحقات بدقة وفي موعدها","hint":"صرف الرواتب دون أخطاء أو تأخير."},{"key":"vc1","text":"دعم تحقيق الأهداف الاستراتيجية.","hint":"دعم تحقيق أهداف الشركة الاستراتيجية ومتابعة مؤشراتها."},{"key":"vc2","text":"متابعة تنفيذ الخطط التشغيلية.","hint":"متابعة تنفيذ الخطط التشغيلية في جميع الإدارات."},{"key":"vc3","text":"جودة اتخاذ القرارات.","hint":"اتخاذ قرارات مدروسة وسريعة في الأمور التشغيلية."},{"key":"vc4","text":"قيادة فرق العمل بفعالية.","hint":"قيادة المديرين وتوجيههم ورفع كفاءتهم."},{"key":"vc5","text":"تعزيز التعاون بين الإدارات.","hint":"تحسين التنسيق بين الإدارات وإزالة معوقات العمل."},{"key":"mt1","text":"يتابع أعمال الصيانة بكفاءة.","hint":"متابعة أعمال الصيانة الوقائية والتصحيحية وجدولتها."},{"key":"mt2","text":"يستجيب للأعطال ويعالجها في الوقت المناسب.","hint":"الاستجابة للبلاغات وإصلاح الأعطال في وقت قصير."},{"key":"mt3","text":"يضمن جودة أعمال الصيانة المنفذة.","hint":"ضمان جودة الإصلاح وعدم تكرار العطل نفسه."},{"key":"mt4","text":"يحافظ على جاهزية المعدات والأصول.","hint":"المحافظة على جاهزية المعدات والأصول وتقليل التوقف."},{"key":"mt5","text":"يخطط وينظم أعمال الصيانة بفعالية.","hint":"وضع خطة صيانة دورية وتوفير قطع الغيار مسبقاً."},{"key":"sm1","text":"تحقيق أهداف المبيعات والتسويق.","hint":"بلوغ المستهدف العام للمبيعات ونمو الحصة السوقية."},{"key":"sm2","text":"إعداد وتنفيذ الخطط.","hint":"وضع الخطط البيعية والتسويقية ومتابعة تنفيذها."},{"key":"sm3","text":"قيادة فرق العمل.","hint":"قيادة مديري الفروع والمشرفين ورفع كفاءتهم."},{"key":"sm4","text":"تنمية المبيعات والعملاء.","hint":"استقطاب عملاء جدد وتنمية العملاء الحاليين."},{"key":"n15","text":"ينسّق مع المشتريات حول الأصناف","hint":"التنسيق حول الاحتياج والنواقص."},{"key":"cx2","text":"يتعامل مع الشكاوى والاستفسارات بفعالية.","hint":"استقبال الشكاوى وتصعيدها ومتابعتها حتى الحل."},{"key":"cx3","text":"يحرص على تحقيق رضا العملاء.","hint":"رفع نسبة رضا العملاء وتقليل الشكاوى المتكررة."},{"key":"cx4","text":"يلتزم بسرعة الاستجابة وإنجاز الطلبات.","hint":"الرد على الاستفسارات وإنجاز الطلبات ضمن الوقت المحدد."},{"key":"cx5","text":"يبني علاقات إيجابية مع العملاء ويحافظ عليها.","hint":"بناء ثقة العملاء وتشجيعهم على التعامل المتكرر."},{"key":"n16","text":"يقلّل زمن الاستجابة للعملاء","hint":"الرد ضمن الوقت المعتمد لكل قناة."},{"key":"vs2","text":"متابعة أداء الفرق.","hint":"متابعة أداء الفرق ورفع تقارير دورية عنها."},{"key":"vs3","text":"تحسين نتائج المبيعات.","hint":"معالجة أسباب انخفاض المبيعات واقتراح حلول عملية."},{"key":"vs5","text":"التنسيق بين الإدارات.","hint":"الربط بين المبيعات والمستودع والمشتريات والتسويق."},{"key":"n17","text":"يدعم الفروع ميدانياً ويحل معوقاتها","hint":"زيارات ميدانية ومعالجة المشكلات."},{"key":"n18","text":"ينسّق مع التسويق والمخازن","hint":"التنسيق حول الحملات والتوفر."},{"key":"ep1","text":"يحقق أهداف مبيعات قسم منتجات الكهرباء.","hint":"بلوغ المستهدف البيعي للقسم شهرياً وتحقيق نمو مقارنة بالفترة السابقة."},{"key":"ep2","text":"يمتلك معرفة فنية بالمنتجات ويقدّم الاستشارة المناسبة للعملاء.","hint":"الإلمام بمواصفات الأصناف الكهربائية وبدائلها وترشيح الأنسب لحاجة العميل."},{"key":"ep3","text":"يدير مخزون القسم ويضمن توفر الأصناف المطلوبة.","hint":"متابعة النواقص والرواكد والتنسيق مع المشتريات قبل نفاد الأصناف."},{"key":"ep5","text":"يتابع السوق والمنافسين ويقترح المنتجات والعروض.","hint":"رصد أسعار وعروض المنافسين واقتراح أصناف وعروض تنافسية."},{"key":"n19","text":"يحقق هامش الربح المستهدف للقسم","hint":"التوازن بين حجم المبيعات وهامش الربح."},{"key":"ic1","text":"دقة متابعة أرصدة المخزون.","hint":"مراقبة أرصدة الأصناف ورصد النواقص والرواكد وحدود إعادة الطلب."},{"key":"ic2","text":"معالجة فروقات الجرد.","hint":"تحليل فروقات الجرد وتحديد أسبابها واقتراح إجراءات تصحيحية."},{"key":"ic3","text":"إعداد تقارير المخزون بانتظام.","hint":"إصدار تقارير حركة المخزون ودورانه بانتظام."},{"key":"ic4","text":"الالتزام بالإجراءات المحاسبية.","hint":"تطبيق الإجراءات المحاسبية المعتمدة في تسعير وتقييم المخزون."},{"key":"ic5","text":"التنسيق مع المستودعات والإدارات.","hint":"التنسيق مع المستودعات والمشتريات لضبط الأرصدة."},{"key":"rv1","text":"دقة تسجيل الإيرادات اليومية.","hint":"قيد الإيرادات اليومية في النظام بالمبالغ والتواريخ الصحيحة."},{"key":"rv2","text":"مطابقة الإيرادات مع السجلات.","hint":"مطابقة الإيرادات مع كشوف البنك وتقارير نقاط البيع."},{"key":"rv4","text":"تطبيق السياسات المالية المعتمدة.","hint":"تطبيق السياسات المحاسبية ومعايير الاعتراف بالإيراد المعتمدة."},{"key":"rv5","text":"معالجة الفروقات المالية بكفاءة.","hint":"تتبّع أسباب الفروقات وتسويتها في وقت قصير."},{"key":"n20","text":"يتابع تحصيل المبيعات الآجلة","hint":"متابعة الذمم وأعمارها."},{"key":"ex1","text":"دقة مراجعة واعتماد المصروفات.","hint":"التحقق من المستندات والفواتير قبل الاعتماد ومطابقتها للطلب."},{"key":"ex2","text":"الالتزام بسياسات الصرف.","hint":"الالتزام بحدود الصلاحيات والموازنات المعتمدة عند الصرف."},{"key":"ex3","text":"سرعة إنجاز طلبات الصرف.","hint":"معالجة طلبات الصرف وصرف المستحقات في الوقت المحدد."},{"key":"ex4","text":"المحافظة على السجلات المالية.","hint":"أرشفة المستندات وحفظها بطريقة تسهّل الرجوع إليها والتدقيق."},{"key":"ex5","text":"التعاون مع الإدارات ذات العلاقة.","hint":"التنسيق مع المشتريات والموردين والأقسام لإنهاء المعاملات."},{"key":"ts1","text":"تنظيم عمليات النقل.","hint":"توزيع الرحلات على المركبات والسائقين بكفاءة."},{"key":"ts2","text":"الالتزام بجداول التشغيل.","hint":"تنفيذ جدول التوصيل اليومي دون تأخير أو إلغاء."},{"key":"ts3","text":"متابعة السائقين والمركبات.","hint":"مراقبة أداء السائقين والتزامهم بالمسارات والمواعيد."},{"key":"ts5","text":"معالجة المشكلات التشغيلية.","hint":"معالجة الأعطال والحوادث وتأخير الرحلات فور وقوعها."},{"key":"n21","text":"ينسّق مع المستودع والمبيعات","hint":"التنسيق حول أولويات التسليم."},{"key":"gr1","text":"سرعة إنجاز المعاملات الحكومية.","hint":"إنهاء معاملات قوى والتأمينات والبلدية في وقت قصير."},{"key":"gr2","text":"متابعة التراخيص والتجديدات.","hint":"متابعة تجديد السجلات والرخص قبل انتهائها."},{"key":"gr3","text":"الالتزام بالأنظمة واللوائح.","hint":"الالتزام بالأنظمة واللوائح وتجنّب المخالفات والغرامات."},{"key":"gr4","text":"جودة التواصل مع الجهات الحكومية.","hint":"التواصل الفعّال مع الجهات الحكومية وممثليها."},{"key":"gr5","text":"دقة وسرية البيانات.","hint":"دقة البيانات المقدّمة وحفظ سرية وثائق الشركة."},{"key":"hs1","text":"يضبط سجلات حضور الموظفين ويعالج الاستثناءات بدقة.","hint":"مراجعة سجلات الحضور والانصراف للموظفين وتصحيح الاستثناءات وتوثيقها."},{"key":"hs2","text":"يتابع طلبات الإجازات والغياب وينجزها في الوقت المناسب.","hint":"دراسة طلبات الإجازات واعتمادها وتحديث أرصدتها في النظام."},{"key":"hs4","text":"يحافظ على تحديث بيانات وسجلات الموظفين.","hint":"تحديث ملفات الموظفين والعقود والوثائق أولاً بأول."},{"key":"hs5","text":"يقدم الدعم اللازم للموظفين ويستجيب لاستفساراتهم بفعالية.","hint":"الرد على استفسارات الموظفين ومساعدتهم في معاملاتهم."},{"key":"n22","text":"يدير ملفات الموظفين إلكترونياً","hint":"أرشفة منظّمة ومحدّثة."},{"key":"hc1","text":"يرصد انضباط الموظفين في الفروع ويوثّق المخالفات.","hint":"متابعة التزام الموظفين بساعات العمل ورصد التأخير والغياب وتوثيقه بالأدلة."},{"key":"hs3","text":"ينفذ الزيارات الميدانية وفق الخطة المعتمدة ويرفع تقاريرها في الوقت المحدد.","hint":"تنفيذ الزيارات الميدانية للفروع حسب الخطة ورفع التقارير."},{"key":"hc3","text":"يرصد الملاحظات والمخالفات بدقة.","hint":"توثيق المخالفات بالأدلة ووفق لائحة الجزاءات المعتمدة."},{"key":"hc5","text":"يتابع معالجة الملاحظات حتى إغلاقها.","hint":"متابعة الملاحظات مع الإدارات حتى معالجتها وإغلاقها."},{"key":"n23","text":"يتحقق من تطبيق اللوائح في الفروع","hint":"جولات تدقيق دورية."},{"key":"pe1","text":"توفير المنتجات بالمواصفات المطلوبة.","hint":"توفير الأصناف بالمواصفات والجودة المطلوبة وفي وقتها."},{"key":"pe2","text":"التفاوض مع الموردين.","hint":"التفاوض على الأسعار وشروط الدفع والتوريد لصالح الشركة."},{"key":"pe4","text":"متابعة التوريد.","hint":"متابعة الشحنات والتأكد من مطابقتها عند الاستلام."},{"key":"pe5","text":"بناء علاقات مع الموردين.","hint":"توسيع قاعدة الموردين وبناء علاقات طويلة الأمد."},{"key":"n24","text":"ينسّق مع قسم الكهرباء والمستودع","hint":"التنسيق حول الاحتياج والتوفر."}]$json$::jsonb)
    LOOP
        INSERT INTO public.evaluation_criteria
            (organization_id, code, name, description, max_score,
             mandatory, visible_to_employee, comment_required, active)
        VALUES
            (v_org,
             'legacy:' || (rec->>'key'),
             rec->>'text',
             rec->>'hint',
             5, true, true, false, true)
        ON CONFLICT (organization_id, code) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               max_score = EXCLUDED.max_score,
               mandatory = EXCLUDED.mandatory,
               visible_to_employee = EXCLUDED.visible_to_employee,
               active = true,
               updated_at = now();
    END LOOP;

    -- --------------------------------------------------------
    -- 6) النموذج العام
    -- --------------------------------------------------------
    SELECT id INTO v_template_id
    FROM public.evaluation_templates
    WHERE organization_id = v_org
      AND scope_type = 'general'
      AND scope_id IS NULL
      AND version = 1
      AND active = true
    LIMIT 1;

    IF v_template_id IS NULL THEN
        INSERT INTO public.evaluation_templates
            (organization_id, name, description, scope_type, scope_id, active, version)
        VALUES
            (v_org, 'النموذج العام - مرحّل',
             'المعايير العامة من الملف القديم',
             'general', NULL, true, 1)
        RETURNING id INTO v_template_id;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.template_criteria
    WHERE template_id = v_template_id;

    IF v_count = 0 THEN
        FOR crit IN
            SELECT value
            FROM jsonb_array_elements($json$[{"key":"q1","sort_order":1},{"key":"q2","sort_order":2},{"key":"q3","sort_order":3},{"key":"q4","sort_order":4},{"key":"q5","sort_order":5}]$json$::jsonb)
        LOOP
            SELECT id INTO v_criterion_id
            FROM public.evaluation_criteria
            WHERE organization_id = v_org
              AND code = 'legacy:' || (crit->>'key')
            LIMIT 1;

            INSERT INTO public.template_criteria
                (template_id, criterion_id, weight, sort_order,
                 mandatory, visible_to_employee, comment_required)
            VALUES
                (v_template_id, v_criterion_id, 1,
                 (crit->>'sort_order')::integer,
                 true, true, false);
        END LOOP;
    END IF;

    -- --------------------------------------------------------
    -- 7) نماذج المعايير حسب المسمى الوظيفي
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"title":"بائع","criteria":[{"key":"sl2","sort_order":1},{"key":"sl3","sort_order":2},{"key":"sl5","sort_order":3},{"key":"sl6","sort_order":4},{"key":"n1","sort_order":5}]},{"title":"عامل مستودع فرعي","criteria":[{"key":"wh1","sort_order":1},{"key":"wh2","sort_order":2},{"key":"wh4","sort_order":3},{"key":"wh5","sort_order":4},{"key":"n2","sort_order":5}]},{"title":"عامل مستودع رئيسي","criteria":[{"key":"wh1","sort_order":1},{"key":"wh2","sort_order":2},{"key":"wh4","sort_order":3},{"key":"wh5","sort_order":4},{"key":"n2","sort_order":5}]},{"title":"سائق","criteria":[{"key":"dr1","sort_order":1},{"key":"dr2","sort_order":2},{"key":"dr3","sort_order":3},{"key":"dr4","sort_order":4},{"key":"dr5","sort_order":5}]},{"title":"مدير فرع","criteria":[{"key":"bm3","sort_order":1},{"key":"bm5","sort_order":2},{"key":"n3","sort_order":3},{"key":"n4","sort_order":4}]},{"title":"مشرف مستودع رئيسي","criteria":[{"key":"ws1","sort_order":1},{"key":"ws3","sort_order":2},{"key":"ws5","sort_order":3},{"key":"n5","sort_order":4},{"key":"n6","sort_order":5}]},{"title":"بائع خدمة ذاتية","criteria":[{"key":"sl2","sort_order":1},{"key":"sl3","sort_order":2},{"key":"sl6","sort_order":3},{"key":"n1","sort_order":4}]},{"title":"أمين مستودع فرعي","criteria":[{"key":"ws1","sort_order":1},{"key":"ws2","sort_order":2},{"key":"ws3","sort_order":3},{"key":"ws5","sort_order":4},{"key":"n6","sort_order":5}]},{"title":"فني تركيب","criteria":[{"key":"ft1","sort_order":1},{"key":"ft2","sort_order":2},{"key":"ft3","sort_order":3},{"key":"ft4","sort_order":4},{"key":"ft5","sort_order":5},{"key":"q11","sort_order":6},{"key":"q12","sort_order":7},{"key":"q13","sort_order":8},{"key":"q14","sort_order":9}]},{"title":"خدمة عملاء","criteria":[{"key":"cs1","sort_order":1},{"key":"cs2","sort_order":2},{"key":"cs3","sort_order":3},{"key":"cs4","sort_order":4},{"key":"cs5","sort_order":5},{"key":"q11","sort_order":6},{"key":"q12","sort_order":7},{"key":"q13","sort_order":8},{"key":"q14","sort_order":9}]},{"title":"أمين مستودع رئيسي","criteria":[{"key":"ws1","sort_order":1},{"key":"ws3","sort_order":2},{"key":"ws5","sort_order":3},{"key":"n7","sort_order":4},{"key":"n6","sort_order":5}]},{"title":"صانع محتوى","criteria":[{"key":"cc1","sort_order":1},{"key":"cc2","sort_order":2},{"key":"cc3","sort_order":3},{"key":"cc4","sort_order":4},{"key":"cc5","sort_order":5}]},{"title":"كاتب محتوى وأخصائي SEO","criteria":[{"key":"cw1","sort_order":1},{"key":"cw2","sort_order":2},{"key":"cw3","sort_order":3},{"key":"cw4","sort_order":4},{"key":"cw5","sort_order":5}]},{"title":"مصمم جرافيك ومسؤول إضافة منتجات","criteria":[{"key":"pu1","sort_order":1},{"key":"pu2","sort_order":2},{"key":"pu3","sort_order":3},{"key":"pu4","sort_order":4},{"key":"pu5","sort_order":5}]},{"title":"محاسب مستودع فرعي","criteria":[{"key":"wa1","sort_order":1},{"key":"wa2","sort_order":2},{"key":"wa3","sort_order":3},{"key":"wa4","sort_order":4},{"key":"wa5","sort_order":5}]},{"title":"مشرف خدمة عملاء المتجر الإلكتروني","criteria":[{"key":"q2","sort_order":1},{"key":"q3","sort_order":2},{"key":"q4","sort_order":3},{"key":"q5","sort_order":4},{"key":"q6","sort_order":5},{"key":"q7","sort_order":6},{"key":"q8","sort_order":7},{"key":"q9","sort_order":8},{"key":"q10","sort_order":9},{"key":"q11","sort_order":10},{"key":"q12","sort_order":11},{"key":"q13","sort_order":12},{"key":"q14","sort_order":13}]},{"title":"أخصائي مشتريات","criteria":[{"key":"pa1","sort_order":1},{"key":"pa3","sort_order":2},{"key":"pa4","sort_order":3},{"key":"pa5","sort_order":4},{"key":"n8","sort_order":5}]},{"title":"مدير عمليات المتجر الإلكتروني","criteria":[{"key":"eo1","sort_order":1},{"key":"eo2","sort_order":2},{"key":"eo4","sort_order":3},{"key":"eo5","sort_order":4},{"key":"n9","sort_order":5}]},{"title":"مشرف الدعم التقني","criteria":[{"key":"it1","sort_order":1},{"key":"it3","sort_order":2},{"key":"it4","sort_order":3},{"key":"it5","sort_order":4},{"key":"n10","sort_order":5}]},{"title":"مدير التسويق الإلكتروني","criteria":[{"key":"dm1","sort_order":1},{"key":"dm2","sort_order":2},{"key":"dm4","sort_order":3},{"key":"dm5","sort_order":4},{"key":"n11","sort_order":5}]},{"title":"مدير مستودع رئيسي","criteria":[{"key":"wm1","sort_order":1},{"key":"wm4","sort_order":2},{"key":"wm5","sort_order":3},{"key":"n12","sort_order":4},{"key":"n13","sort_order":5}]},{"title":"المدير المالي","criteria":[{"key":"cf1","sort_order":1},{"key":"cf2","sort_order":2},{"key":"cf3","sort_order":3},{"key":"cf4","sort_order":4},{"key":"cf5","sort_order":5}]},{"title":"مدير الموارد البشرية","criteria":[{"key":"hm1","sort_order":1},{"key":"hm2","sort_order":2},{"key":"hm3","sort_order":3},{"key":"hm4","sort_order":4},{"key":"n14","sort_order":5}]},{"title":"نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن","criteria":[{"key":"vc1","sort_order":1},{"key":"vc2","sort_order":2},{"key":"vc3","sort_order":3},{"key":"vc4","sort_order":4},{"key":"vc5","sort_order":5}]},{"title":"مشرف صيانة","criteria":[{"key":"mt1","sort_order":1},{"key":"mt2","sort_order":2},{"key":"mt3","sort_order":3},{"key":"mt4","sort_order":4},{"key":"mt5","sort_order":5}]},{"title":"مدير المبيعات والتسويق","criteria":[{"key":"sm1","sort_order":1},{"key":"sm2","sort_order":2},{"key":"sm3","sort_order":3},{"key":"sm4","sort_order":4},{"key":"n15","sort_order":5}]},{"title":"مشرف خدمة عملاء الفروع","criteria":[{"key":"cx2","sort_order":1},{"key":"cx3","sort_order":2},{"key":"cx4","sort_order":3},{"key":"cx5","sort_order":4},{"key":"n16","sort_order":5}]},{"title":"نائب مدير المبيعات والتسويق","criteria":[{"key":"vs2","sort_order":1},{"key":"vs3","sort_order":2},{"key":"vs5","sort_order":3},{"key":"n17","sort_order":4},{"key":"n18","sort_order":5}]},{"title":"مدير قسم منتجات الكهرباء","criteria":[{"key":"ep1","sort_order":1},{"key":"ep2","sort_order":2},{"key":"ep3","sort_order":3},{"key":"ep5","sort_order":4},{"key":"n19","sort_order":5}]},{"title":"محاسب مراقبة المخزون","criteria":[{"key":"ic1","sort_order":1},{"key":"ic2","sort_order":2},{"key":"ic3","sort_order":3},{"key":"ic4","sort_order":4},{"key":"ic5","sort_order":5}]},{"title":"محاسب الإيرادات","criteria":[{"key":"rv1","sort_order":1},{"key":"rv2","sort_order":2},{"key":"rv4","sort_order":3},{"key":"rv5","sort_order":4},{"key":"n20","sort_order":5}]},{"title":"محاسب المصروفات","criteria":[{"key":"ex1","sort_order":1},{"key":"ex2","sort_order":2},{"key":"ex3","sort_order":3},{"key":"ex4","sort_order":4},{"key":"ex5","sort_order":5}]},{"title":"مشرف قسم الحركة والنقل","criteria":[{"key":"ts1","sort_order":1},{"key":"ts2","sort_order":2},{"key":"ts3","sort_order":3},{"key":"ts5","sort_order":4},{"key":"n21","sort_order":5}]},{"title":"منسق شؤون حكومية","criteria":[{"key":"gr1","sort_order":1},{"key":"gr2","sort_order":2},{"key":"gr3","sort_order":3},{"key":"gr4","sort_order":4},{"key":"gr5","sort_order":5}]},{"title":"أخصائي عمليات الموارد البشرية","criteria":[{"key":"hs1","sort_order":1},{"key":"hs2","sort_order":2},{"key":"hs4","sort_order":3},{"key":"hs5","sort_order":4},{"key":"n22","sort_order":5}]},{"title":"مراقب موارد بشرية","criteria":[{"key":"hc1","sort_order":1},{"key":"hs3","sort_order":2},{"key":"hc3","sort_order":3},{"key":"hc5","sort_order":4},{"key":"n23","sort_order":5}]},{"title":"مندوب مشتريات منتجات الكهرباء","criteria":[{"key":"pe1","sort_order":1},{"key":"pe2","sort_order":2},{"key":"pe4","sort_order":3},{"key":"pe5","sort_order":4},{"key":"n24","sort_order":5}]}]$json$::jsonb)
    LOOP
        SELECT id INTO v_job_title_id
        FROM public.job_titles
        WHERE organization_id = v_org
          AND name = rec->>'title'
        LIMIT 1;

        IF v_job_title_id IS NOT NULL THEN
            SELECT id INTO v_template_id
            FROM public.evaluation_templates
            WHERE organization_id = v_org
              AND scope_type = 'job_title'
              AND scope_id = v_job_title_id
              AND version = 1
              AND active = true
            LIMIT 1;

            IF v_template_id IS NULL THEN
                INSERT INTO public.evaluation_templates
                    (organization_id, name, description, scope_type,
                     scope_id, active, version)
                VALUES
                    (v_org,
                     'تقييم ' || (rec->>'title'),
                     'معايير المسمى الوظيفي من الملف القديم',
                     'job_title',
                     v_job_title_id,
                     true,
                     1)
                RETURNING id INTO v_template_id;
            END IF;

            SELECT count(*) INTO v_count
            FROM public.template_criteria
            WHERE template_id = v_template_id;

            IF v_count = 0 THEN
                FOR crit IN
                    SELECT value
                    FROM jsonb_array_elements(rec->'criteria')
                LOOP
                    SELECT id INTO v_criterion_id
                    FROM public.evaluation_criteria
                    WHERE organization_id = v_org
                      AND code = 'legacy:' || (crit->>'key')
                    LIMIT 1;

                    INSERT INTO public.template_criteria
                        (template_id, criterion_id, weight, sort_order,
                         mandatory, visible_to_employee, comment_required)
                    VALUES
                        (v_template_id, v_criterion_id, 1,
                         (crit->>'sort_order')::integer,
                         true, true, false);
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- 8) سلم التقييم
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"value":5,"label":"ممتاز","sort_order":1},{"value":4,"label":"جيد جداً","sort_order":2},{"value":3,"label":"جيد","sort_order":3},{"value":2,"label":"مقبول","sort_order":4},{"value":1,"label":"ضعيف","sort_order":5}]$json$::jsonb)
    LOOP
        INSERT INTO public.rating_scale_items
            (organization_id, value, label, active, sort_order)
        VALUES
            (v_org,
             (rec->>'value')::numeric,
             rec->>'label',
             true,
             (rec->>'sort_order')::integer)
        ON CONFLICT (organization_id, value) DO UPDATE
           SET label = EXCLUDED.label,
               active = true,
               sort_order = EXCLUDED.sort_order,
               updated_at = now();
    END LOOP;

    -- --------------------------------------------------------
    -- 9) خصومات الحضور
    -- --------------------------------------------------------
    FOR rec IN
        SELECT value
        FROM jsonb_array_elements($json$[{"code":"fp","name":"نسيان البصمة","description":"عدد مرات نسيان تسجيل الحضور أو الانصراف في تطبيق جسر.","deduction_points":3},{"code":"late","name":"التأخير بدون سبب","description":"عدد مرات التأخر عن موعد الدوام دون تقديم عذر مسبق.","deduction_points":5},{"code":"early","name":"الانصراف المبكر بدون سبب","description":"عدد مرات مغادرة العمل قبل نهاية الدوام دون إذن.","deduction_points":5},{"code":"ord","name":"تأخير الطلبات","description":"عدد المهام أو الطلبات التي تأخّر إنجازها عن موعدها.","deduction_points":3}]$json$::jsonb)
    LOOP
        INSERT INTO public.attendance_penalty_types
            (organization_id, code, name, description, deduction_points, active)
        VALUES
            (v_org,
             rec->>'code',
             rec->>'name',
             rec->>'description',
             (rec->>'deduction_points')::numeric,
             true)
        ON CONFLICT (organization_id, code) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               deduction_points = EXCLUDED.deduction_points,
               active = true,
               updated_at = now();
    END LOOP;

    -- --------------------------------------------------------
    -- 10) الإعدادات الثابتة
    -- --------------------------------------------------------
    INSERT INTO public.system_settings
        (organization_id, key, value, description)
    VALUES
        (v_org, 'sales_target_default', to_jsonb(100000::integer),
         'الهدف الافتراضي للمبيعات من الملف القديم')
    ON CONFLICT (organization_id, key) DO UPDATE
       SET value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = now();

    INSERT INTO public.system_settings
        (organization_id, key, value, description)
    VALUES
        (v_org, 'legacy_import',
         jsonb_build_object(
             'source', 'تقييم-الموظفين-السويد(4).html',
             'pins_imported', false,
             'legacy_hr_evaluator', 'عبدالله سالم حسن الحنيني'
         ),
         'بيانات تعريف الترحيل من النظام القديم')
    ON CONFLICT (organization_id, key) DO UPDATE
       SET value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = now();

    INSERT INTO public.system_settings
        (organization_id, key, value, description)
    VALUES
        (v_org, 'legacy_months',
         $months$["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"]$months$::jsonb,
         'قائمة الشهور التي كانت ثابتة في الملف القديم')
    ON CONFLICT (organization_id, key) DO UPDATE
       SET value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = now();

    RAISE NOTICE 'TAQYEEM legacy seed completed: % employees, % job titles, % criteria.',
        97, 38, 175;
END
$seed$;
