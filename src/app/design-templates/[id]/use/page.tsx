'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { DesignShell, designApi } from '@/components/design-shell';
import { createDesignCanvas, loadDesignFonts } from '@/lib/design-renderer';

type Field = {
  id: string;
  layer_name: string;
  field_key: string;
  field_label: string;
  field_type: string;
  content: string;
  default_value?: string;
  placeholder?: string;
  is_dynamic: boolean;
  is_required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  font_family: string;
  font_size: number;
  font_weight: number;
  font_color: string;
  text_align: 'left' | 'center' | 'right';
  direction: string;
  line_height: number;
  letter_spacing: number;
  rotation: number;
  opacity: number;
  multiline: boolean;
  auto_fit: boolean;
  min_font_size: number;
  max_font_size: number;
  max_length?: number;
  is_visible: boolean;
  z_index: number;
  options: any[];
};

const numericFields = [
  'x',
  'y',
  'width',
  'height',
  'font_size',
  'font_weight',
  'line_height',
  'letter_spacing',
  'rotation',
  'opacity',
  'min_font_size',
  'max_font_size',
  'max_length',
  'z_index',
];

function norm(field: any) {
  const normalized = { ...field };
  numericFields.forEach((key) => {
    if (normalized[key] != null) normalized[key] = Number(normalized[key]);
  });
  return normalized as Field;
}

function tokens(content: string) {
  return Array.from(content.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g), (match) => match[1]);
}

async function imageForCanvas(url: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('تعذر تحميل صورة الخلفية');

  const blob = await response.blob();
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذر تحميل صورة الخلفية'));
    };
    image.src = objectUrl;
  });
}

export default function UsePage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const previewOnly = params.get('preview') !== null;
  const [template, setTemplate] = useState<any>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [fonts, setFonts] = useState<any[]>([]);
  const [data, setData] = useState<any>({ employees: [], departments: [], branches: [], job_titles: [] });
  const [values, setValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const exporting = useRef(false);
  const background = useRef<{ url: string; image: Promise<HTMLImageElement> } | null>(null);
  const [viewport, setViewport] = useState(700);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setTemplate(null);
    setMessage('');
    setFailed(false);
    Promise.all([
      designApi(`/api/design-templates/${id}`),
      designApi('/api/design-fonts'),
      designApi('/api/app/auth/me'),
    ])
      .then(async ([templateResponse, fontResponse, userResponse]) => {
        if (cancelled) return;
        const nextPermissions: string[] = userResponse.permissions || [];
        if (!previewOnly && !nextPermissions.includes('design_templates.use')) {
          throw new Error('ليس لديك صلاحية استخدام هذا القالب. يمكنك فتح المعاينة من قائمة القوالب.');
        }
        const dataResponse = previewOnly
          ? { employees: [], departments: [], branches: [], job_titles: [] }
          : await designApi('/api/design-data');
        if (cancelled) return;
        const nextFields = templateResponse.fields.map(norm);
        const initial: Record<string, string> = {};

        nextFields.forEach((field: Field) => {
          if (!field.is_visible) return;
          tokens(field.content).forEach((key) => {
            if (initial[key] == null) initial[key] = field.default_value || '';
          });

          if (field.is_dynamic && initial[field.field_key] == null) {
            initial[field.field_key] = field.default_value ?? (tokens(field.content).length ? '' : field.content);
          }
        });

        setTemplate(templateResponse.template);
        setFields(nextFields);
        setFonts(fontResponse.fonts);
        setData(dataResponse);
        setValues(initial);
        setPermissions(nextPermissions);

      })
      .catch((error) => {
        if (cancelled) return;
        setFailed(true);
        setMessage(error.message);
      });
    return () => { cancelled = true; };
  }, [id, previewOnly, loadAttempt]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setViewport(Math.max(260, entries[0].contentRect.width - 36));
    });

    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, [template]);

  const variables = useMemo(() => {
    const map = new Map<string, Field>();

    fields.forEach((field) => {
      if (!field.is_visible) return;
      tokens(field.content).forEach((key) => {
        if (!map.has(key)) map.set(key, field);
      });

      if (field.is_dynamic && !map.has(field.field_key)) {
        map.set(field.field_key, field);
      }
    });

    return [...map.entries()];
  }, [fields]);

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectEmployee(employeeId: string, key: string) {
    const employee = data.employees.find((item: any) => item.id === employeeId);

    setValues({
      ...values,
      [key]: employee?.full_name || '',
      employee_name: employee?.full_name || '',
      employee_id: employeeId,
      'employee.name': employee?.full_name || '',
      'employee.employee_number': employee?.employee_number || '',
      'employee.job_title': employee?.job_title_name || '',
      'employee.department': employee?.department_name || '',
      'employee.branch': employee?.branch_name || '',
    });
  }

  async function render(validate = true) {
    for (const [key, field] of validate ? variables : []) {
      if (field.is_required && !String(values[key] || '').trim()) {
        throw new Error(`الحقل مطلوب: ${field.field_label || key}`);
      }
    }

    if (!template?.background_image_url) {
      throw new Error('القالب لا يحتوي صورة خلفية');
    }

    await loadDesignFonts(fields, values, fonts);
    if (background.current?.url !== template.background_image_url) {
      const entry = { url: template.background_image_url, image: imageForCanvas(template.background_image_url) };
      background.current = entry;
      entry.image.catch(() => { if (background.current === entry) background.current = null; });
    }
    const canvas = createDesignCanvas(
      Number(template.width), Number(template.height), await background.current!.image, fields, values, format,
    );

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('تعذر إنشاء الصورة'))),
        format === 'png' ? 'image/png' : 'image/jpeg',
        0.95,
      );
    });
  }

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setPreviewUrl('');
    setPreviewError('');
    const timer = setTimeout(() => {
      if (!template) return;
      render(false).then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      }).catch(error => {
        if (!cancelled) setPreviewError(error.message || 'تعذر إنشاء المعاينة.');
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [template, fields, values, fonts, format, previewAttempt]);

  async function exportDesign(save: boolean) {
    if (exporting.current || previewOnly || !permissions.includes('design_templates.export')) return;
    exporting.current = true;
    try {
      setMessage('');
      setSaving(true);
      const blob = await render();
      const name = `${template.slug || 'design'}-${Date.now()}.${format}`;

      if (save) {
        const formData = new FormData();
        formData.append('file', new File([blob], name, { type: blob.type }));
        formData.append('folder', 'generated');

        const asset = await designApi('/api/design-assets', { method: 'POST', body: formData });
        await designApi('/api/designs/generate', {
          method: 'POST',
          body: JSON.stringify({
            template_id: id,
            employee_id: values.employee_id || null,
            generated_data: values,
            image_url: asset.url,
            image_storage_key: asset.key,
            image_format: format,
            width: Number(template.width),
            height: Number(template.height),
          }),
        });
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(save ? 'تم حفظ التصميم في السجل وبدأ تحميل الملف.' : 'بدأ تحميل التصميم على جهازك.');
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      exporting.current = false;
      setSaving(false);
    }
  }

  if (!template) {
    return (
      <DesignShell>
        <div className="ds-loading">
          <p role={failed ? 'alert' : 'status'}>{message || 'جارٍ تحميل القالب...'}</p>
          {failed && <button className="ds-btn" onClick={() => setLoadAttempt(value => value + 1)}>إعادة المحاولة</button>}
        </div>
      </DesignShell>
    );
  }

  const scale = Math.min(1, viewport / Number(template.width), 520 / Number(template.height));

  return (
    <DesignShell>
      <main className="ds-main">
        <div className="ds-head">
          <div>
            <h1>
              {previewOnly ? 'معاينة القالب' : 'استخدام القالب'}: {template.name}
            </h1>
            <p>{previewOnly ? 'شاهد شكل القالب قبل استخدامه.' : 'املأ الحقول وشاهد النتيجة مباشرة، ثم حمّل التصميم.'}</p>
          </div>
        </div>

        <div className="du-layout">
          <section className="du-form">
            {previewOnly ? (
              <>
                <h2>معاينة القالب</h2>
                <p className="du-note">هذه معاينة للبيانات الافتراضية للقالب.</p>
                {permissions.includes('design_templates.use') && <a className="ds-btn" href={`/design-templates/${id}/use`}>استخدام القالب</a>}
              </>
            ) : <>
            <h2>البيانات المتغيرة</h2>
            <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            {variables.length ? renderVariableFields() : (
              <p className="du-note">هذا القالب لا يحتوي حقولًا متغيرة. يمكنك تصديره مباشرة.</p>
            )}

            <div className="du-format">
              <button className={`ds-btn ghost ${format === 'png' ? 'active' : ''}`} onClick={() => setFormat('png')}>
                PNG
              </button>
              <button className={`ds-btn ghost ${format === 'jpg' ? 'active' : ''}`} onClick={() => setFormat('jpg')}>
                JPG
              </button>
            </div>
            </fieldset>

            {permissions.includes('design_templates.export') ? <div className="du-actions">
              <button className="ds-btn" disabled={saving} onClick={() => exportDesign(false)}>
                {saving ? 'جاري الإصدار...' : 'تحميل فقط'}
              </button>
              <button className="ds-btn ghost" disabled={saving} onClick={() => exportDesign(true)}>
                حفظ في النظام وتحميل
              </button>
            </div> : <p className="du-note">يمكنك تعبئة البيانات ومعاينة التصميم. تحميله يحتاج صلاحية تصدير التصاميم.</p>}

            <p className="du-note">
              يتم التصدير بالمقاس الأصلي {template.width}×{template.height} مع تحميل الخطوط المختارة وبدون أدوات التحرير.
            </p>
            </>}
          </section>

          <section className="du-preview" ref={holder}>
            {previewError ? <div>
              <p role="status">{previewError}</p>
              <button className="ds-btn" onClick={() => setPreviewAttempt(value => value + 1)}>إعادة تحميل المعاينة</button>
            </div> : !previewUrl ? <p role="status">جارٍ تحديث المعاينة...</p> :
            <div
              className="du-canvas"
              style={{ width: Number(template.width) * scale, height: Number(template.height) * scale }}
            >
              <img src={previewUrl} alt={`معاينة التصميم: ${template.name}`} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
            }
          </section>
        </div>
      </main>

      {message && (
        <div className="ds-toast" role="status" onClick={() => setMessage('')}>
          {message}
        </div>
      )}
    </DesignShell>
  );

  function renderVariableFields() {
    return (
      <div className="du-vars">
        {variables.map(([key, field]) => (
          <label className="ds-field" key={key}>
            {field.field_label || key}
            {renderInput(key, field)}
          </label>
        ))}
      </div>
    );
  }

  function renderInput(key: string, field: Field) {
    if (field.field_type === 'employee') {
      return (
        <select
          className="ds-select"
          value={values.employee_id || ''}
          onChange={(event) => selectEmployee(event.target.value, key)}
          required={field.is_required}
        >
          <option value="">اختر الموظف</option>
          {data.employees.map((employee: any) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} · {employee.employee_number || ''}
            </option>
          ))}
        </select>
      );
    }

    if (['department', 'branch', 'job_title'].includes(field.field_type)) {
      const list = field.field_type === 'department'
        ? data.departments
        : field.field_type === 'branch'
          ? data.branches
          : data.job_titles;

      return (
        <select
          className="ds-select"
          value={values[key] || ''}
          onChange={(event) => setValue(key, event.target.value)}
          required={field.is_required}
        >
          <option value="">اختر...</option>
          {list.map((item: any) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      );
    }

    if (field.field_type === 'select') {
      return (
        <select
          className="ds-select"
          value={values[key] || ''}
          onChange={(event) => setValue(key, event.target.value)}
          required={field.is_required}
        >
          <option value="">اختر...</option>
          {(field.options || []).map((option) => (
            <option key={String(option)}>{String(option)}</option>
          ))}
        </select>
      );
    }

    if (field.field_type === 'textarea') {
      return (
        <textarea
          className="ds-textarea"
          rows={3}
          value={values[key] || ''}
          placeholder={field.placeholder || ''}
          onChange={(event) => setValue(key, event.target.value)}
          required={field.is_required}
        />
      );
    }

    return (
      <input
        className="ds-input"
        type={['number', 'date'].includes(field.field_type) ? field.field_type : 'text'}
        value={values[key] || ''}
        placeholder={field.placeholder || ''}
        onChange={(event) => setValue(key, event.target.value)}
        required={field.is_required}
      />
    );
  }

}
