import { pool } from '@/db';
import { must, type SecurityContext } from '@/db/queries/security';
import { resolveDefaultOrganizationId } from '@/server/recruitment/org';

const SETTINGS_KEY = 'app.branding';

export const FONT_CHOICES = ['sans', 'alexandria', 'cairo', 'tajawal'] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

const BASE_FALLBACK = '"TaqyeemSans","ThSans","ThmanyahSans",Tahoma,Arial,system-ui,sans-serif';

export const FONT_STACKS: Record<FontChoice, string> = {
  sans: BASE_FALLBACK,
  alexandria: `"Alexandria", ${BASE_FALLBACK}`,
  cairo: `"Cairo", ${BASE_FALLBACK}`,
  tajawal: `"Tajawal", ${BASE_FALLBACK}`,
};

export const FONT_LABELS: Record<FontChoice, string> = {
  sans: 'سانس (الخط الافتراضي)',
  alexandria: 'الإسكندرية (Alexandria)',
  cairo: 'القاهرة (Cairo)',
  tajawal: 'تجوال (Tajawal)',
};

export type BrandingSettings = {
  companyName: string;
  logoUrl: string | null;
  fontChoice: FontChoice;
};

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: 'شركة السويد التجارية',
  logoUrl: null,
  fontChoice: 'sans',
};

function normalize(value: unknown): BrandingSettings {
  if (!value || typeof value !== 'object') return DEFAULT_BRANDING;
  const v = value as Partial<BrandingSettings> & { useSystemFont?: boolean };
  return {
    companyName: typeof v.companyName === 'string' && v.companyName.trim() ? v.companyName : DEFAULT_BRANDING.companyName,
    logoUrl: typeof v.logoUrl === 'string' && v.logoUrl.trim() ? v.logoUrl.replace(/['"()]/g, '') : null,
    fontChoice: typeof v.fontChoice === 'string' && (FONT_CHOICES as readonly string[]).includes(v.fontChoice)
      ? (v.fontChoice as FontChoice)
      : DEFAULT_BRANDING.fontChoice,
  };
}

export async function getPublicBranding(): Promise<BrandingSettings> {
  try {
    const organizationId = await resolveDefaultOrganizationId();
    const result = await pool.query(
      `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
      [organizationId, SETTINGS_KEY],
    );
    return normalize(result.rows[0]?.value);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function getBrandingOverrideCss(): Promise<string> {
  const branding = await getPublicBranding();
  const fontStack = FONT_STACKS[branding.fontChoice];
  const overrides = [
    `--app-font: ${fontStack} !important;`,
    // The legacy forms/assessment templates style every element with their own --ff variable.
    `--ff: ${fontStack} !important;`,
    branding.logoUrl ? `--brand-logo-url: url('${branding.logoUrl}') !important;` : '',
  ].filter(Boolean).join(' ');
  return `:root{${overrides}}`;
}

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700&family=Cairo:wght@300;400;500;600;700&family=Tajawal:wght@300;400;500;700&display=swap';

export async function getBrandingHeadHtml(): Promise<string> {
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">`,
    `<style>${await getBrandingOverrideCss()}</style>`,
  ].join('');
}

export async function getBrandingForAdmin(context: SecurityContext): Promise<BrandingSettings> {
  must(context, 'settings.manage');
  const result = await pool.query(
    `select value from public.system_settings where organization_id=$1::uuid and key=$2 limit 1`,
    [context.organizationId, SETTINGS_KEY],
  );
  return normalize(result.rows[0]?.value);
}

export async function updateBranding(context: SecurityContext, input: BrandingSettings): Promise<BrandingSettings> {
  must(context, 'settings.manage');
  const value = normalize(input);
  await pool.query(
    `
      insert into public.system_settings(organization_id,key,value,description,updated_by)
      values($1::uuid,$2,$3::jsonb,'هوية النظام (الشعار والخط واسم الشركة)',$4::uuid)
      on conflict(organization_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()
    `,
    [context.organizationId, SETTINGS_KEY, JSON.stringify(value), context.user.id],
  );
  return value;
}
