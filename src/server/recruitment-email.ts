async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
  }).catch(() => undefined);
}

export async function sendApplicationReceivedEmail(to: string, fullName: string, referenceNumber: string) {
  await sendMail(
    to,
    'تم استلام طلب التوظيف',
    `
      <p>مرحبًا ${fullName}،</p>
      <p>تم استلام طلبك بنجاح.</p>
      <p>رقم الطلب: <strong>${referenceNumber}</strong></p>
      <p>يرجى الاحتفاظ بهذا الرقم لمتابعة حالة طلبك.</p>
    `,
  );
}

export async function sendNewApplicationHrNotification(
  applicantName: string,
  referenceNumber: string,
  jobTitle: string | null,
  applicationId: string,
) {
  const hrEmail = process.env.HR_NOTIFICATION_EMAIL;
  if (!hrEmail) return;

  await sendMail(
    hrEmail,
    'متقدم جديد على وظيفة',
    `
      <p>تم استلام طلب توظيف جديد.</p>
      <p>المتقدم: <strong>${applicantName}</strong></p>
      <p>الوظيفة: <strong>${jobTitle || 'تقديم عام (بدون وظيفة محددة)'}</strong></p>
      <p>رقم الطلب: <strong>${referenceNumber}</strong></p>
      <p><a href="https://taqyeem.alsweed.sa/admin/recruitment/applications/${applicationId}">عرض الطلب في لوحة التوظيف</a></p>
    `,
  );
}
