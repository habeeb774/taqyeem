"use client";
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';

type Branding = {
  companyName: string;
  logoUrl: string | null;
  useSystemFont: boolean;
};

export default function BrandingClient() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/app/admin/branding')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message || 'تعذر تحميل الإعدادات');
        setBranding(data.branding);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function uploadLogo(file: File) {
    if (!branding) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await fetch('/api/app/admin/branding/logo', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر رفع الشعار');
      setBranding({ ...branding, logoUrl: data.url });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!branding) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/app/admin/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر الحفظ');
      setBranding(data.branding);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      location.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: 'var(--dst-color-bg-page)', color: 'var(--dst-color-text)', fontFamily: 'var(--app-font)' }}>
      <PageHeader
        eyebrow="إعدادات النظام"
        title="هوية النظام"
        maxWidth={700}
        nav={
          <a href="/" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.28)', borderRadius: 10, padding: '9px 13px', fontSize: 12 }}>
            الأنظمة
          </a>
        }
      />

      <section style={{ maxWidth: 700, margin: '0 auto', padding: '28px 34px 60px' }}>
        {loading ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>جارٍ التحميل...</p>
        ) : !branding ? (
          <p style={{ color: 'var(--dst-color-danger)' }}>{error || 'تعذر تحميل الإعدادات'}</p>
        ) : (
          <>
            {error && <p style={{ color: 'var(--dst-color-danger)', fontSize: 12 }}>{error}</p>}
            {saved && <p style={{ color: 'var(--dst-color-success)', fontSize: 12 }}>تم الحفظ بنجاح، جارٍ إعادة التحميل...</p>}

            <Card style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>اسم الشركة</h2>
              <Field id="company-name" label="يظهر في رأس الصفحات داخل النظام">
                <Input
                  id="company-name"
                  value={branding.companyName}
                  onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                />
              </Field>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>شعار النظام</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 64, height: 64, borderRadius: 14, background: '#173BD1',
                    backgroundImage: branding.logoUrl ? `url('${branding.logoUrl}')` : "var(--brand-logo-url)",
                    backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
                    flexShrink: 0,
                  }}
                />
                <label className="dst-btn dst-btn--ghost dst-btn--sm" style={{ cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? 'جارٍ الرفع...' : 'رفع شعار جديد'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo(file);
                      e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>خط الأنظمة</h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={branding.useSystemFont}
                  onChange={(e) => setBranding({ ...branding, useSystemFont: e.target.checked })}
                />
                استخدام خط النظام الافتراضي (Tahoma) بدل الخط المخصص لجميع الأنظمة
              </label>
            </Card>

            <Button onClick={save} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
