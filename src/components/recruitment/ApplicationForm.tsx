'use client';

import { useState, type FormEvent } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 46,
  borderRadius: 12,
  border: '1px solid #dcdfe6',
  padding: '0 16px',
  fontSize: 14,
  fontFamily: 'var(--app-font)',
};

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, marginBottom: 6, color: '#333' };
const fieldWrapStyle: React.CSSProperties = { marginBottom: 16 };

export function ApplicationForm({ jobId, jobTitle }: { jobId: string | null; jobTitle: string | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      if (jobId) formData.set('job_id', jobId);
      formData.set('consent', formData.get('consent') ? 'true' : 'false');

      const cvFile = formData.get('cv');
      if (cvFile instanceof File && cvFile.size > 5 * 1024 * 1024) {
        throw new Error('حجم الملف يتجاوز 5 ميجابايت.');
      }

      const response = await fetch('/api/app/applications', { method: 'POST', body: formData });
      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          response.status === 413
            ? 'حجم الملف كبير جدًا على الخادم. يرجى إرفاق سيرة ذاتية أصغر من 5 ميجابايت.'
            : 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى.',
        );
      }

      if (!data.ok) {
        const messages: Record<string, string> = {
          DUPLICATE_APPLICATION: 'لقد تقدمت لهذه الوظيفة مؤخرًا. سيتواصل معك فريق التوظيف عند مراجعة طلبك.',
          UNSUPPORTED_CV_TYPE: 'صيغة الملف غير مدعومة. يُسمح فقط بملفات PDF أو DOC أو DOCX.',
          CV_TOO_LARGE: 'حجم الملف يتجاوز 5 ميجابايت.',
          CONSENT_REQUIRED: 'يجب الموافقة على معالجة بياناتك للمتابعة.',
          CV_REQUIRED: 'يرجى إرفاق السيرة الذاتية.',
          RATE_LIMITED: 'محاولات كثيرة، يرجى المحاولة لاحقًا.',
          JOB_NOT_AVAILABLE: 'هذه الوظيفة لم تعد متاحة للتقديم.',
        };
        throw new Error(messages[data.error] || 'تعذر إرسال الطلب، تحقق من البيانات وحاول مرة أخرى.');
      }

      setReferenceNumber(data.reference_number);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (referenceNumber) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 12px' }}>تم استلام طلبك بنجاح</h1>
        <p style={{ color: '#64748b', margin: '0 0 16px' }}>رقم الطلب</p>
        <p style={{ fontSize: 24, fontWeight: 600, color: '#173BD1', margin: '0 0 20px' }}>{referenceNumber}</p>
        <p style={{ color: '#888', fontSize: 13 }}>يرجى الاحتفاظ بهذا الرقم لمتابعة حالة طلبك.</p>
        <a href="/jobs" style={{ display: 'inline-block', marginTop: 24, color: '#173BD1' }}>
          العودة لقائمة الوظائف
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560, margin: '0 auto', padding: '28px 24px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 4px' }}>التقديم على الوظيفة</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>{jobTitle || 'تقديم عام بدون وظيفة محددة'}</p>

      <div style={fieldWrapStyle}>
        <label style={labelStyle}>الاسم الكامل *</label>
        <input name="full_name" required minLength={2} maxLength={200} style={inputStyle} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>البريد الإلكتروني *</label>
        <input type="email" name="email" required maxLength={320} style={inputStyle} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>رقم الجوال *</label>
        <input name="phone" required minLength={6} maxLength={40} style={inputStyle} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>المدينة</label>
        <input name="city" maxLength={120} style={inputStyle} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>سنوات الخبرة</label>
        <input type="number" name="years_experience" min={0} max={60} style={inputStyle} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>رابط LinkedIn</label>
        <input type="url" name="linkedin_url" maxLength={300} style={inputStyle} placeholder="https://" />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>نبذة / رسالة تعريفية</label>
        <textarea name="cover_letter" maxLength={4000} rows={4} style={{ ...inputStyle, height: 'auto', padding: 12, resize: 'vertical' }} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle}>السيرة الذاتية (PDF أو DOC أو DOCX، حتى 5 ميجابايت) *</label>
        <input type="file" name="cv" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={inputStyle} />
      </div>
      <div style={{ ...fieldWrapStyle, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input type="checkbox" name="consent" required id="consent" style={{ marginTop: 3 }} />
        <label htmlFor="consent" style={{ fontSize: 12.5, color: '#333', lineHeight: 1.7 }}>
          أوافق على معالجة بياناتي الشخصية المرسلة عبر هذا النموذج لأغراض التوظيف لدى شركة السويد التجارية.
        </label>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          height: 50,
          color: '#fff',
          background: submitting ? '#8896e0' : '#173BD1',
          border: 'none',
          borderRadius: 13,
          fontSize: 15,
          fontWeight: 500,
          fontFamily: 'var(--app-font)',
          cursor: submitting ? 'default' : 'pointer',
        }}
      >
        {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
      </button>
    </form>
  );
}
