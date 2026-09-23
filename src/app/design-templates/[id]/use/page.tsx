'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { DesignShell, designApi } from '@/components/design-shell';

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

function replace(content: string, values: Record<string, string>) {
  return content.replace(
    /{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g,
    (_, key) => values[key] ?? `{{${key}}}`,
  );
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
    image.onerror = reject;
    image.src = objectUrl;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, multiline: boolean) {
  if (!multiline) return [text];

  const lines: string[] = [];
  for (const paragraph of text.split('\\n')) {
    const words = paragraph.split(/\s+/);
    let line = '';

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    lines.push(line);
  }

  return lines;
}

export default function UsePage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [template, setTemplate] = useState<any>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [fonts, setFonts] = useState<any[]>([]);
  const [data, setData] = useState<any>({ employees: [], departments: [], branches: [], job_titles: [] });
  const [values, setValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [viewport, setViewport] = useState(700);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      designApi(`/api/design-templates/${id}`),
      designApi('/api/design-fonts'),
      designApi('/api/design-data'),
    ])
      .then(([templateResponse, fontResponse, dataResponse]) => {
        const nextFields = templateResponse.fields.map(norm);
        const initial: Record<string, string> = {};

        nextFields.forEach((field: Field) => {
          tokens(field.content).forEach((key) => {
            if (initial[key] == null) initial[key] = field.default_value || '';
          });

          if (field.is_dynamic && initial[field.field_key] == null) {
            initial[field.field_key] = field.default_value || '';
          }
        });

        setTemplate(templateResponse.template);
        setFields(nextFields);
        setFonts(fontResponse.fonts);
        setData(dataResponse);
        setValues(initial);

        fontResponse.fonts
          .filter((font: any) => font.url)
          .forEach((font: any) => {
            if (document.querySelector(`link[data-design-font="${font.id}"]`)) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = font.url;
            link.dataset.designFont = font.id;
            document.head.appendChild(link);
          });
      })
      .catch((error) => setMessage(error.message));
  }, [id]);

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

  async function render() {
    for (const [key, field] of variables) {
      if (field.is_required && !String(values[key] || '').trim()) {
        throw new Error(`الحقل مطلوب: ${field.field_label || key}`);
      }
    }

    if (!template?.background_image_url) {
      throw new Error('القالب لا يحتوي صورة خلفية');
    }

    await Promise.all(
      fonts.map((font: any) => document.fonts.load(`400 24px "${font.family}"`).catch(() => null)),
    );

    const canvas = document.createElement('canvas');
    canvas.width = Number(template.width);
    canvas.height = Number(template.height);

    const ctx = canvas.getContext('2d')!;
    if (format === 'jpg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(await imageForCanvas(template.background_image_url), 0, 0, canvas.width, canvas.height);

    for (const field of [...fields].sort((a, b) => a.z_index - b.z_index)) {
      if (!field.is_visible) continue;
      drawField(ctx, field);
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('تعذر إنشاء الصورة'))),
        format === 'png' ? 'image/png' : 'image/jpeg',
        0.95,
      );
    });
  }

  function drawField(ctx: CanvasRenderingContext2D, field: Field) {
    let text = replace(field.content, values);
    if (field.max_length) text = text.slice(0, field.max_length);

    ctx.save();
    ctx.globalAlpha = field.opacity;
    ctx.translate(field.x + field.width / 2, field.y + field.height / 2);
    ctx.rotate((field.rotation * Math.PI) / 180);
    ctx.translate(-field.width / 2, -field.height / 2);

    let size = field.font_size;
    ctx.font = `${field.font_weight} ${size}px "${field.font_family}"`;
    let lines = wrap(ctx, text, field.width, field.multiline);

    if (field.auto_fit) {
      while (
        size > field.min_font_size &&
        (lines.length * size * field.line_height > field.height ||
          lines.some((line) => ctx.measureText(line).width > field.width))
      ) {
        size -= 1;
        ctx.font = `${field.font_weight} ${size}px "${field.font_family}"`;
        lines = wrap(ctx, text, field.width, field.multiline);
      }
    }

    ctx.fillStyle = field.font_color;
    ctx.textAlign = field.text_align;
    ctx.textBaseline = 'top';
    ctx.direction = field.direction === 'ltr' ? 'ltr' : 'rtl';

    const x = field.text_align === 'center' ? field.width / 2 : field.text_align === 'left' ? 0 : field.width;
    lines.forEach((line, index) => ctx.fillText(line, x, index * size * field.line_height, field.width));
    ctx.restore();
  }

  async function exportDesign(save: boolean) {
    try {
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
        setMessage('تم حفظ التصميم في السجل');
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!template) {
    return (
      <DesignShell>
        <div className="ds-loading">{message || 'جارٍ تحميل القالب...'}</div>
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
              {params.get('preview') ? 'معاينة القالب' : 'استخدام القالب'}: {template.name}
            </h1>
            <p>املأ الحقول وشاهد النتيجة مباشرة، ثم صدّر التصميم بالأبعاد الأصلية.</p>
          </div>
        </div>

        <div className="du-layout">
          <section className="du-form">
            <h2>البيانات المتغيرة</h2>
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

            <div className="du-actions">
              <button className="ds-btn" disabled={saving} onClick={() => exportDesign(false)}>
                {saving ? 'جاري الإصدار...' : 'تحميل فقط'}
              </button>
              <button className="ds-btn ghost" disabled={saving} onClick={() => exportDesign(true)}>
                حفظ في النظام وتحميل
              </button>
            </div>

            <p className="du-note">
              يتم التصدير بالمقاس الأصلي {template.width}×{template.height} مع تحميل الخطوط المختارة وبدون أدوات التحرير.
            </p>
          </section>

          <section className="du-preview" ref={holder}>
            <div
              className="du-canvas"
              style={{ width: Number(template.width) * scale, height: Number(template.height) * scale }}
            >
              <div
                style={{
                  position: 'relative',
                  width: template.width,
                  height: template.height,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top right',
                  backgroundImage: `url(${template.background_image_url})`,
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                }}
              >
                {fields.map((field) => field.is_visible && renderPreviewField(field))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {message && (
        <div className="ds-toast" onClick={() => setMessage('')}>
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

  function renderPreviewField(field: Field) {
    return (
      <div
        className="du-text"
        key={field.id}
        style={{
          right: field.x,
          top: field.y,
          width: field.width,
          height: field.height,
          fontFamily: field.font_family,
          fontSize: field.font_size,
          fontWeight: field.font_weight,
          color: field.font_color,
          textAlign: field.text_align as any,
          direction: field.direction as any,
          lineHeight: field.line_height,
          letterSpacing: field.letter_spacing,
          opacity: field.opacity,
          transform: `rotate(${field.rotation}deg)`,
          zIndex: field.z_index,
          justifyContent:
            field.text_align === 'center' ? 'center' : field.text_align === 'left' ? 'flex-end' : 'flex-start',
        }}
      >
        {replace(field.content, values)}
      </div>
    );
  }
}
