'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal } from '@/components/ui';
import { designApi } from '@/components/design-shell';

export function CatalogDialog({ kind, onClose, onSaved }: {
  kind: 'font' | 'category';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const font = kind === 'font';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const url = String(data.get('url') || '').trim() || null;
    setBusy(true);
    setError('');
    try {
      await designApi(font ? '/api/design-fonts' : '/api/design-categories', {
        method: 'POST',
        body: JSON.stringify(font ? {
          name, family: String(data.get('family') || '').trim(),
          url, source: url ? 'custom' : 'system', is_default: false,
        } : { name }),
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر الحفظ، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal open onClose={() => { if (!busy) onClose(); }}
    title={font ? 'إضافة خط' : 'إضافة تصنيف'} titleId="catalog-dialog-title">
    <form onSubmit={save}>
      <p className="dst-field__hint">{font
        ? 'أضف خطًا لاستخدامه في نصوص قوالب التصميم.'
        : 'نظّم القوالب في مجموعات يسهل العثور عليها.'}</p>
      <div className="ds-form">
        <Field id="catalog-name" label={font ? 'اسم الخط في القائمة' : 'اسم التصنيف'} full>
          <Input id="catalog-name" name="name" autoFocus required maxLength={120}
            placeholder={font ? 'مثال: خط الشركة' : 'مثال: شهادات وتكريم'} disabled={busy} />
        </Field>
        {font && <>
          <Field id="catalog-family" label="اسم عائلة الخط" hint="الاسم المعتمد في ملف الخط، مثل Cairo." full>
            <Input id="catalog-family" name="family" dir="ltr" required maxLength={120}
              placeholder="Cairo" disabled={busy} aria-describedby="catalog-family-hint" />
          </Field>
          <Field id="catalog-url" label="رابط ملف CSS للخط (اختياري)"
            hint="اتركه فارغًا إذا كان الخط متاحًا بالفعل في النظام. الرابط وحده لا يضمن أن المتصفح يسمح بتحميله." full>
            <Input id="catalog-url" name="url" type="url" pattern="https://.*" maxLength={1000}
              dir="ltr" placeholder="https://example.com/font.css" disabled={busy} aria-describedby="catalog-url-hint" />
          </Field>
        </>}
      </div>
      {error && <p className="dst-field__error" role="alert">{error}</p>}
      <div className="dst-modal__actions">
        <Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ...' : font ? 'حفظ الخط' : 'حفظ التصنيف'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>إلغاء</Button>
      </div>
    </form>
  </Modal>;
}
