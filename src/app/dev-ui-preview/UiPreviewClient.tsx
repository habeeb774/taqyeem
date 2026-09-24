'use client';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  TableCell,
  TableHeadCell,
  TableRow,
  Textarea,
} from '@/components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 12px' }}>{title}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
}

export default function UiPreviewClient() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: 'var(--dst-color-bg-page)', color: 'var(--dst-color-text)', fontFamily: 'var(--app-font)' }}>
      <PageHeader
        eyebrow="معاينة داخلية — للحذف لاحقًا"
        title="مكونات نظام التصميم"
        nav={<a href="/">الأنظمة</a>}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 34px 60px' }}>
        <Section title="أزرار (Button)">
          <Button variant="primary" size="md">أساسي md</Button>
          <Button variant="primary" size="sm">أساسي sm</Button>
          <Button variant="ghost" size="md">ثانوي</Button>
          <Button variant="danger" size="md">خطر</Button>
          <Button variant="primary" disabled>معطّل</Button>
        </Section>

        <Section title="بطاقة (Card)">
          <Card style={{ width: 260 }}>
            <p style={{ margin: 0 }}>محتوى داخل بطاقة عادية بحواف وظل خفيف.</p>
          </Card>
        </Section>

        <Section title="شارات الحالة (Badge)">
          <Badge>افتراضي</Badge>
          <Badge variant="success">نجاح</Badge>
          <Badge variant="warning">تحذير</Badge>
          <Badge variant="danger">خطر</Badge>
        </Section>

        <Section title="حقول النموذج (Field/Input/Select/Textarea)">
          <Field id="preview-input" label="حقل نصي">
            <Input id="preview-input" placeholder="اكتب هنا..." />
          </Field>
          <Field id="preview-select" label="قائمة منسدلة">
            <Select id="preview-select">
              <option>خيار أول</option>
              <option>خيار ثاني</option>
            </Select>
          </Field>
          <Field id="preview-error" label="حقل بخطأ" error="هذا الحقل مطلوب">
            <Input id="preview-error" aria-invalid="true" />
          </Field>
          <Field id="preview-textarea" label="نص طويل" full>
            <Textarea id="preview-textarea" rows={3} />
          </Field>
        </Section>

        <Section title="حالة فارغة (EmptyState)">
          <EmptyState>لا توجد بيانات لعرضها حاليًا.</EmptyState>
        </Section>

        <Section title="جدول (Table)">
          <Table style={{ width: '100%' }}>
            <thead>
              <TableRow>
                <TableHeadCell>الاسم</TableHeadCell>
                <TableHeadCell>الحالة</TableHeadCell>
              </TableRow>
            </thead>
            <tbody>
              <TableRow>
                <TableCell>مثال أول</TableCell>
                <TableCell><Badge variant="success">نشط</Badge></TableCell>
              </TableRow>
            </tbody>
          </Table>
        </Section>

        <Section title="نافذة منبثقة (Modal)">
          <Button onClick={() => setModalOpen(true)}>فتح نافذة</Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            titleId="preview-modal-title"
            title="عنوان النافذة"
            actions={
              <>
                <Button onClick={() => setModalOpen(false)}>حفظ</Button>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>إلغاء</Button>
              </>
            }
          >
            <p>محتوى تجريبي داخل النافذة. جرّب مفتاح Tab للتنقل و Escape للإغلاق.</p>
          </Modal>
        </Section>
      </div>
    </main>
  );
}
