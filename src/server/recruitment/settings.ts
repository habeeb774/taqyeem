import { pool } from '@/db';
import { must, type SecurityContext } from '@/db/queries/security';
import { resolveDefaultOrganizationId } from './org';

const SETTINGS_KEY = 'recruitment.public_page';

export type RecruitmentPageSettings = {
  heroTitle: string;
  aboutParagraphs: string[];
  benefits: string[];
  storeUrl: string | null;
  jobsSidebarImageUrl: string | null;
  jobDetailImageUrl: string | null;
};

const DEFAULT_SETTINGS: RecruitmentPageSettings = {
  heroTitle: 'وظائف السويد',
  aboutParagraphs: [
    'تُعدّ شركة إبراهيم عبدالله السويد التجارية إحدى الشركات السعودية الرائدة في توريد مستلزمات السباكة '
      + 'والأدوات الصحية ومواد البناء والكهرباء، وتخدم المشاريع السكنية والتجارية والصناعية في مختلف '
      + 'مناطق المملكة العربية السعودية، من مرحلة التأسيس حتى التشطيب النهائي.',
    'وقد تأسّست الشركة عام 1978م، ورسّخت خلال أكثر من خمسة وأربعين عامًا مكانتها مزوّدًا موثوقًا في '
      + 'القطاع، اعتمادًا على شبكة شراكات مع عدد من العلامات التجارية العالمية، وفريق عمل مؤهّل يضع '
      + 'رضا العملاء في مقدمة أولوياته.',
    'وفي إطار خطط التوسّع التشغيلي، تستقطب الشركة الكفاءات المؤهّلة للانضمام إلى إداراتها الفنية والتشغيلية والإدارية، وتوفّر لها بيئة عمل مستقرة ومسارات تطوير مهني واضحة.',
  ],
  benefits: [
    'تأمين طبي للموظف وأفراد أسرته.',
    'راتب أساسي تنافسي مع بدلَي السكن والمواصلات.',
    'برامج تدريب على الأنظمة والمنتجات المعتمدة في الشركة.',
    'خصم لمنسوبي الشركة على منتجاتها.',
    'بيئة عمل تعتمد الأنظمة الرقمية في جميع الإجراءات.',
  ],
  storeUrl: null,
  jobsSidebarImageUrl: null,
  jobDetailImageUrl: null,
};

function normalize(value: unknown): RecruitmentPageSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const v = value as Partial<RecruitmentPageSettings>;
  return {
    heroTitle: typeof v.heroTitle === 'string' && v.heroTitle.trim() ? v.heroTitle : DEFAULT_SETTINGS.heroTitle,
    aboutParagraphs: Array.isArray(v.aboutParagraphs) && v.aboutParagraphs.length ? v.aboutParagraphs.filter((p) => typeof p === 'string') : DEFAULT_SETTINGS.aboutParagraphs,
    benefits: Array.isArray(v.benefits) && v.benefits.length ? v.benefits.filter((b) => typeof b === 'string') : DEFAULT_SETTINGS.benefits,
    storeUrl: typeof v.storeUrl === 'string' && v.storeUrl.trim() ? v.storeUrl : null,
    jobsSidebarImageUrl: typeof v.jobsSidebarImageUrl === 'string' && v.jobsSidebarImageUrl.trim() ? v.jobsSidebarImageUrl : null,
    jobDetailImageUrl: typeof v.jobDetailImageUrl === 'string' && v.jobDetailImageUrl.trim() ? v.jobDetailImageUrl : null,
  };
}

export async function getPublicRecruitmentSettings(): Promise<RecruitmentPageSettings> {
  const organizationId = await resolveDefaultOrganizationId();
  const result = await pool.query(
    `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
    [organizationId, SETTINGS_KEY],
  );
  return normalize(result.rows[0]?.value);
}

export async function getRecruitmentSettingsForAdmin(context: SecurityContext): Promise<RecruitmentPageSettings> {
  must(context, 'recruitment.jobs.view');
  const result = await pool.query(
    `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
    [context.organizationId, SETTINGS_KEY],
  );
  return normalize(result.rows[0]?.value);
}

export async function updateRecruitmentSettings(
  context: SecurityContext,
  input: RecruitmentPageSettings,
): Promise<RecruitmentPageSettings> {
  must(context, 'recruitment.jobs.manage');
  const value = normalize(input);
  await pool.query(
    `
      insert into public.system_settings(organization_id,key,value,description,updated_by)
      values($1::uuid,$2,$3::jsonb,'محتوى صفحة الوظائف العامة',$4::uuid)
      on conflict(organization_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()
    `,
    [context.organizationId, SETTINGS_KEY, JSON.stringify(value), context.user.id],
  );
  return value;
}

const NOTIFICATIONS_KEY = 'recruitment.notifications';

export type RecruitmentNotificationSettings = {
  hrNotificationEmail: string | null;
};

function normalizeNotifications(value: unknown): RecruitmentNotificationSettings {
  if (!value || typeof value !== 'object') return { hrNotificationEmail: null };
  const v = value as Partial<RecruitmentNotificationSettings>;
  return {
    hrNotificationEmail: typeof v.hrNotificationEmail === 'string' && v.hrNotificationEmail.trim()
      ? v.hrNotificationEmail.trim()
      : null,
  };
}

export async function getHrNotificationEmail(): Promise<string | null> {
  const organizationId = await resolveDefaultOrganizationId();
  const result = await pool.query(
    `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
    [organizationId, NOTIFICATIONS_KEY],
  );
  const stored = normalizeNotifications(result.rows[0]?.value).hrNotificationEmail;
  return stored || process.env.HR_NOTIFICATION_EMAIL || null;
}

export async function getNotificationSettingsForAdmin(
  context: SecurityContext,
): Promise<RecruitmentNotificationSettings> {
  must(context, 'recruitment.jobs.view');
  const result = await pool.query(
    `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
    [context.organizationId, NOTIFICATIONS_KEY],
  );
  return normalizeNotifications(result.rows[0]?.value);
}

export async function updateNotificationSettings(
  context: SecurityContext,
  input: RecruitmentNotificationSettings,
): Promise<RecruitmentNotificationSettings> {
  must(context, 'recruitment.jobs.manage');
  const value = normalizeNotifications(input);
  await pool.query(
    `
      insert into public.system_settings(organization_id,key,value,description,updated_by)
      values($1::uuid,$2,$3::jsonb,'بريد إشعارات المتقدمين الجدد',$4::uuid)
      on conflict(organization_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()
    `,
    [context.organizationId, NOTIFICATIONS_KEY, JSON.stringify(value), context.user.id],
  );
  return value;
}
