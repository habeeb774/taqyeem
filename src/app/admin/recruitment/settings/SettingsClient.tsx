"use client";
import { useEffect, useState } from 'react';
import { RecruitmentTopbar } from '@/components/recruitment/RecruitmentTopbar';

type Settings = {
  heroTitle: string;
  aboutParagraphs: string[];
  benefits: string[];
  storeUrl: string | null;
  jobsSidebarImageUrl: string | null;
  jobDetailImageUrl: string | null;
};

export default function SettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<'jobs_sidebar' | 'job_detail' | null>(null);

  const [hrEmail, setHrEmail] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationsSaved, setNotificationsSaved] = useState(false);

  useEffect(() => {
    fetch('/api/app/recruitment/settings')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message || 'تعذر تحميل الإعدادات');
        setSettings(data.settings);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    fetch('/api/app/recruitment/notifications')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message || 'تعذر تحميل إعدادات الإشعارات');
        setHrEmail(data.settings.hrNotificationEmail || '');
      })
      .catch((e) => setNotificationsError(e.message))
      .finally(() => setNotificationsLoading(false));
  }, []);

  async function saveNotifications() {
    setNotificationsSaving(true);
    setNotificationsError('');
    setNotificationsSaved(false);
    try {
      const res = await fetch('/api/app/recruitment/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrNotificationEmail: hrEmail.trim() || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر الحفظ');
      setHrEmail(data.settings.hrNotificationEmail || '');
      setNotificationsSaved(true);
      setTimeout(() => setNotificationsSaved(false), 3000);
    } catch (e: any) {
      setNotificationsError(e.message);
    } finally {
      setNotificationsSaving(false);
    }
  }

  function updateParagraph(index: number, value: string) {
    if (!settings) return;
    const next = [...settings.aboutParagraphs];
    next[index] = value;
    setSettings({ ...settings, aboutParagraphs: next });
  }

  function addParagraph() {
    if (!settings) return;
    setSettings({ ...settings, aboutParagraphs: [...settings.aboutParagraphs, ''] });
  }

  function removeParagraph(index: number) {
    if (!settings) return;
    setSettings({ ...settings, aboutParagraphs: settings.aboutParagraphs.filter((_, i) => i !== index) });
  }

  function updateBenefit(index: number, value: string) {
    if (!settings) return;
    const next = [...settings.benefits];
    next[index] = value;
    setSettings({ ...settings, benefits: next });
  }

  function addBenefit() {
    if (!settings) return;
    setSettings({ ...settings, benefits: [...settings.benefits, ''] });
  }

  function removeBenefit(index: number) {
    if (!settings) return;
    setSettings({ ...settings, benefits: settings.benefits.filter((_, i) => i !== index) });
  }

  async function uploadImage(slot: 'jobs_sidebar' | 'job_detail', file: File) {
    if (!settings) return;
    setUploading(slot);
    setError('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('slot', slot);
      const res = await fetch('/api/app/recruitment/settings/images', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر رفع الصورة');
      setSettings({
        ...settings,
        ...(slot === 'jobs_sidebar' ? { jobsSidebarImageUrl: data.url } : { jobDetailImageUrl: data.url }),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = {
        heroTitle: settings.heroTitle,
        aboutParagraphs: settings.aboutParagraphs.map((p) => p.trim()).filter(Boolean),
        benefits: settings.benefits.map((b) => b.trim()).filter(Boolean),
        storeUrl: settings.storeUrl?.trim() || null,
        jobsSidebarImageUrl: settings.jobsSidebarImageUrl || null,
        jobDetailImageUrl: settings.jobDetailImageUrl || null,
      };
      const res = await fetch('/api/app/recruitment/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر الحفظ');
      setSettings(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <RecruitmentTopbar pageTitle="إعدادات صفحة الوظائف العامة" active="settings" />

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '28px 34px 60px' }}>
        {loading ? (
          <p style={{ color: '#888' }}>جارٍ التحميل...</p>
        ) : !settings ? (
          <p style={{ color: '#d14343' }}>{error || 'تعذر تحميل الإعدادات'}</p>
        ) : (
          <>
            {error && <p style={{ color: '#d14343', fontSize: 12 }}>{error}</p>}
            {saved && <p style={{ color: '#169b62', fontSize: 12 }}>تم الحفظ بنجاح.</p>}

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>إشعارات المتقدمين الجدد</h2>
              {notificationsLoading ? (
                <p style={{ color: '#888', fontSize: 12 }}>جارٍ التحميل...</p>
              ) : (
                <>
                  {notificationsError && <p style={{ color: '#d14343', fontSize: 12 }}>{notificationsError}</p>}
                  {notificationsSaved && <p style={{ color: '#169b62', fontSize: 12 }}>تم الحفظ بنجاح.</p>}
                  <Field label="البريد الإلكتروني لإشعار الموارد البشرية عند وجود متقدم جديد (اختياري)">
                    <input
                      type="email"
                      placeholder="hr@alsweed.sa"
                      value={hrEmail}
                      onChange={(e) => setHrEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    onClick={saveNotifications}
                    disabled={notificationsSaving}
                    style={{ border: 0, borderRadius: 10, padding: '9px 18px', background: '#173BD1', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', opacity: notificationsSaving ? 0.6 : 1 }}
                  >
                    {notificationsSaving ? 'جارٍ الحفظ...' : 'حفظ بريد الإشعارات'}
                  </button>
                </>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>العنوان الرئيسي وروابط المتجر</h2>
              <Field label="عنوان الصفحة (مثال: وظائف السويد)">
                <input value={settings.heroTitle} onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="رابط العودة للمتجر (اختياري)">
                <input
                  placeholder="https://..."
                  value={settings.storeUrl || ''}
                  onChange={(e) => setSettings({ ...settings, storeUrl: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>صور صفحة الوظائف</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ImageField
                  label="صورة الشريط الجانبي (قائمة الوظائف)"
                  url={settings.jobsSidebarImageUrl}
                  uploading={uploading === 'jobs_sidebar'}
                  onUpload={(file) => uploadImage('jobs_sidebar', file)}
                  onRemove={() => setSettings({ ...settings, jobsSidebarImageUrl: null })}
                />
                <ImageField
                  label="صورة صفحة تفاصيل الشاغر"
                  url={settings.jobDetailImageUrl}
                  uploading={uploading === 'job_detail'}
                  onUpload={(file) => uploadImage('job_detail', file)}
                  onRemove={() => setSettings({ ...settings, jobDetailImageUrl: null })}
                />
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>تعريف الشركة</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {settings.aboutParagraphs.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <textarea rows={3} value={p} onChange={(e) => updateParagraph(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => removeParagraph(i)} style={removeBtnStyle}>حذف</button>
                  </div>
                ))}
              </div>
              <button onClick={addParagraph} style={addBtnStyle}>+ إضافة فقرة</button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 500 }}>المزايا الوظيفية</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {settings.benefits.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={b} onChange={(e) => updateBenefit(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => removeBenefit(i)} style={removeBtnStyle}>حذف</button>
                  </div>
                ))}
              </div>
              <button onClick={addBenefit} style={addBtnStyle}>+ إضافة ميزة</button>
            </div>

            <button
              onClick={save}
              disabled={saving}
              style={{ border: 0, borderRadius: 10, padding: '11px 22px', background: '#173BD1', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const removeBtnStyle: React.CSSProperties = { border: '1px solid #ffd4d4', background: '#fff1f1', color: '#d14343', borderRadius: 8, padding: '9px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };
const addBtnStyle: React.CSSProperties = { marginTop: 10, border: '1px solid #e0e0e0', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>{label}</label>
      {children}
    </div>
  );
}

function ImageField({
  label,
  url,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>{label}</label>
      {url ? (
        <div
          style={{
            width: '100%', aspectRatio: '3 / 4', borderRadius: 10, border: '1px solid #e0e0e0',
            backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center',
          }}
        />
      ) : (
        <div style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 10, border: '1px dashed #dcdfe6', display: 'grid', placeItems: 'center', color: '#aaa', fontSize: 12 }}>
          لا توجد صورة
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...addBtnStyle, marginTop: 0, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'جارٍ الرفع...' : url ? 'استبدال الصورة' : 'رفع صورة'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
        {url && (
          <button onClick={onRemove} style={removeBtnStyle}>حذف</button>
        )}
      </div>
    </div>
  );
}
