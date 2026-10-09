'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DesignShell, designApi } from '@/components/design-shell';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';

type Template = {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  thumbnail_url?: string;
  background_image_url?: string;
  width: number;
  height: number;
  status: string;
  created_by_name?: string;
  updated_at: string;
  usage_count: number;
};

type Category = { id: string; name: string };
type Creator = { id: string; name: string };
type ViewMode = 'grid' | 'list';
type TemplateAction = 'duplicate' | 'archive' | 'delete';

function statusLabel(status: string) {
  if (status === 'published') return 'منشور';
  if (status === 'archived') return 'مؤرشف';
  return 'مسودة';
}

function statusVariant(status: string): 'default' | 'success' | 'warning' {
  if (status === 'published') return 'success';
  if (status === 'archived') return 'warning';
  return 'default';
}

export default function DesignsPage() {
  const router = useRouter();
  const browseForUse = useSearchParams().get('task') === 'create-design';
  const [items, setItems] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [sort, setSort] = useState('newest');
  const [toast, setToast] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);

  const can = (permission: string) => permissions.includes(permission);
  const pages = Math.max(1, Math.ceil(total / 12));

  async function load() {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError('');
    setItems([]);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        q,
        category,
        status: browseForUse ? 'published' : status,
        ready: browseForUse ? '1' : '0',
        created_by: createdBy,
        sort,
      });

      const [list, cats, me] = await Promise.all([
        designApi(`/api/design-templates?${params}`),
        designApi('/api/design-categories'),
        designApi('/api/app/auth/me'),
      ]);
      if (version !== loadVersion.current) return;

      setItems(list.templates);
      setTotal(list.total);
      setCategories(cats.categories);
      setPermissions(me.permissions || []);
      setCreators(list.creators || []);
    } catch (error: any) {
      if (version === loadVersion.current) setLoadError(error.message || 'تعذر تحميل القوالب.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadVersion.current += 1;
    setLoading(true);
    setItems([]);
    setLoadError('');
    const timer = setTimeout(load, 250);
    return () => { clearTimeout(timer); loadVersion.current += 1; };
  }, [page, q, category, status, createdBy, sort, browseForUse]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const body = {
      name: formData.get('name'),
      description: formData.get('description') || null,
      category_id: formData.get('category_id') || null,
      width: Number(formData.get('width')),
      height: Number(formData.get('height')),
      status: 'draft',
      notes: formData.get('notes') || null,
    };

    try {
      const result = await designApi('/api/design-templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setModal(false);
      router.push(`/design-templates/${result.template.id}/edit`);
    } catch (error: any) {
      setToast(error.message);
    }
  }

  async function action(id: string, type: TemplateAction) {
    try {
      if (type === 'duplicate') {
        const result = await designApi(`/api/design-templates/${id}/duplicate`, { method: 'POST' });
        router.push(`/design-templates/${result.template.id}/edit`);
        return;
      }

      const message = type === 'delete'
        ? 'سيتم حذف القالب من القائمة. هل تريد المتابعة؟'
        : 'هل تريد أرشفة القالب؟';

      if (!confirm(message)) return;

      const request = type === 'delete'
        ? { method: 'DELETE' }
        : { method: 'PUT', body: JSON.stringify({ status: 'archived' }) };

      await designApi(`/api/design-templates/${id}`, request);
      setToast('تم تحديث القالب');
      load();
    } catch (error: any) {
      setToast(error.message);
    }
  }

  async function addCategory() {
    const name = prompt('اسم التصنيف الجديد:')?.trim();
    if (!name) return;

    try {
      await designApi('/api/design-categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      const response = await designApi('/api/design-categories');
      setCategories(response.categories);
      setToast('تمت إضافة التصنيف');
    } catch (error: any) {
      setToast(error.message);
    }
  }

  async function addFont() {
    const name = prompt('اسم الخط:')?.trim();
    if (!name) return;

    const family = prompt('Font Family:', name)?.trim();
    if (!family) return;

    const url = prompt('رابط ملف أو CSS للخط (اختياري):')?.trim() || null;

    try {
      await designApi('/api/design-fonts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          family,
          source: url ? 'custom' : 'system',
          url,
          is_default: false,
        }),
      });
      setToast('تمت إضافة الخط');
    } catch (error: any) {
      setToast(error.message);
    }
  }

  return (
    <DesignShell>
      <main className="ds-main">
        <div className="ds-head">
          <div>
            <h1>{browseForUse ? 'أنشئ تصميمًا' : 'قوالب التصاميم'}</h1>
            <p>{browseForUse ? 'اختر قالبًا جاهزًا، ثم عبّئ بياناته وحمّل التصميم.' : 'اختر قالبًا لاستخدامه، أو أدر قوالب التصميم بحسب صلاحياتك.'}</p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!browseForUse && can('design_templates.manage_categories') && (
              <Button variant="ghost" size="sm" onClick={addCategory}>
                إضافة تصنيف
              </Button>
            )}

            {!browseForUse && can('design_templates.manage_fonts') && (
              <Button variant="ghost" size="sm" onClick={addFont}>
                إضافة خط
              </Button>
            )}

            {!browseForUse && can('design_templates.create') && (
              <Button size="sm" onClick={() => setModal(true)}>
                + إضافة قالب تصميم
              </Button>
            )}
          </div>
        </div>

        <section className="ds-filters">
          <Input
            placeholder="ابحث باسم القالب..."
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            aria-label="بحث باسم القالب"
          />

          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            aria-label="فلترة بالتصنيف"
          >
            <option value="">كل التصنيفات</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>

          <Select
            value={browseForUse ? 'published' : status}
            disabled={browseForUse}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="فلترة بالحالة"
          >
            {!browseForUse && <option value="">كل الحالات</option>}
            {!browseForUse && <option value="draft">مسودة</option>}
            <option value="published">منشور</option>
            {!browseForUse && <option value="archived">مؤرشف</option>}
          </Select>

          <Select value={createdBy} onChange={(event) => { setCreatedBy(event.target.value); setPage(1); }} aria-label="فلترة بالمنشئ">
            <option value="">كل المنشئين</option>
            {creators.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>

          <Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="ترتيب النتائج">
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="name">الاسم</option>
            <option value="usage">الأكثر استخدامًا</option>
          </Select>

          <Button variant="ghost" size="sm" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
            {view === 'grid' ? 'عرض قائمة' : 'عرض بطاقات'}
          </Button>
        </section>

        {loading ? (
          <div className="ds-loading" role="status">جارٍ تحميل القوالب...</div>
        ) : loadError ? <EmptyState>
          <p role="alert">{loadError}</p>
          <Button onClick={load}>إعادة المحاولة</Button>
        </EmptyState> : items.length ? (
          <div className={`ds-grid ${view}`}>
            {items.map((template) => (
              <article className="dst-card" key={template.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div className="ds-thumb">
                  {template.thumbnail_url || template.background_image_url ? (
                    <img src={template.thumbnail_url || template.background_image_url} alt="" />
                  ) : (
                    <span>✦</span>
                  )}
                </div>

                <div className="ds-card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <h3>{template.name}</h3>
                    <Badge variant={statusVariant(template.status)}>{statusLabel(template.status)}</Badge>
                  </div>

                  <div className="ds-meta">
                    <span>التصنيف: {template.category_name || 'بدون تصنيف'}</span>
                    <span>المقاس: {template.width}×{template.height}</span>
                    <span>المنشئ: {template.created_by_name || '—'}</span>
                    <span>الاستخدام: {template.usage_count || 0}</span>
                    <span>آخر تعديل: {new Date(template.updated_at).toLocaleDateString('ar-SA')}</span>
                  </div>

                  <div className="ds-actions">
                    {can('design_templates.use') && template.status === 'published' && (
                      <Link className="primary" href={`/design-templates/${template.id}/use`}>
                        استخدام القالب
                      </Link>
                    )}

                    <Link href={`/design-templates/${template.id}/use?preview=1`}>معاينة</Link>

                    {!browseForUse && can('design_templates.edit') && (
                      <Link href={`/design-templates/${template.id}/edit`}>تعديل</Link>
                    )}

                    {!browseForUse && can('design_templates.create') && (
                      <button onClick={() => action(template.id, 'duplicate')}>نسخ</button>
                    )}

                    {!browseForUse && can('design_templates.edit') && template.status !== 'archived' && (
                      <button onClick={() => action(template.id, 'archive')}>أرشفة</button>
                    )}

                    {!browseForUse && can('design_templates.delete') && (
                      <button onClick={() => action(template.id, 'delete')}>حذف</button>
                    )}

                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState>
            <p>{q || category || createdBy || (!browseForUse && status) ? 'لا توجد قوالب تطابق البحث والتصفية.'
              : browseForUse ? 'لا توجد قوالب جاهزة للاستخدام حاليًا. يلزم نشر قالب يحتوي على خلفية بواسطة مسؤول القوالب.'
              : can('design_templates.create') ? 'لا توجد قوالب بعد. يمكنك إضافة قالب تصميم جديد.' : 'لا توجد قوالب متاحة لك حاليًا.'}</p>
            {(q || category || createdBy || (!browseForUse && status)) && <Button variant="ghost" onClick={() => {
              setQ(''); setCategory(''); setCreatedBy(''); setStatus(''); setPage(1);
            }}>عرض جميع القوالب</Button>}
          </EmptyState>
        )}

        {!loading && !loadError && items.length > 0 && <div className="ds-pages">
          {Array.from({ length: pages }, (_, index) => index + 1)
            .slice(Math.max(0, page - 3), page + 2)
            .map((pageNumber) => (
              <button
                className={pageNumber === page ? 'active' : ''}
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
        </div>}
      </main>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        titleId="new-template-title"
        title="إضافة قالب تصميم"
      >
        <form id="create-template-form" onSubmit={create}>
          <div className="ds-form">
            <Field id="template-name" label="اسم القالب" full>
              <Input id="template-name" name="name" required maxLength={160} />
            </Field>

            <Field id="template-description" label="الوصف" full>
              <Textarea id="template-description" name="description" rows={3} />
            </Field>

            <Field id="template-category" label="التصنيف">
              <Select id="template-category" name="category_id">
                <option value="">بدون تصنيف</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="template-width" label="العرض">
              <Input id="template-width" name="width" type="number" min="100" max="12000" defaultValue="1080" required />
            </Field>

            <Field id="template-height" label="الارتفاع">
              <Input id="template-height" name="height" type="number" min="100" max="12000" defaultValue="1080" required />
            </Field>

            <Field id="template-notes" label="ملاحظات" full>
              <Textarea id="template-notes" name="notes" rows={2} />
            </Field>
          </div>

          <div className="dst-modal__actions">
            <Button type="submit">إنشاء وفتح المحرر</Button>
            <Button variant="ghost" type="button" onClick={() => setModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      {toast && <div className="ds-toast">{toast}</div>}
    </DesignShell>
  );
}
