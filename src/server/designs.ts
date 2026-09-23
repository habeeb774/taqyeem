import { z } from 'zod';

const htmlSafe = (value: string) => !/[<>]/.test(value);
const htmlSafeMessage = 'HTML is not allowed';

const safeText = (max: number) =>
  z.string().trim().min(1).max(max).refine(htmlSafe, htmlSafeMessage);

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .refine(htmlSafe, htmlSafeMessage)
  .nullable()
  .optional();

const assetUrl = z
  .string()
  .max(1000)
  .refine(
    (value) =>
      /^\/api\/design-assets\/[a-zA-Z0-9%/_.-]+$/.test(value) &&
      !value.includes('..'),
    'Invalid storage URL',
  )
  .nullable()
  .optional();

const storageKey = z
  .string()
  .max(500)
  .refine(
    (value) =>
      /^organizations\/[a-f0-9-]+\/designs\/(backgrounds|generated)\/[a-zA-Z0-9_.-]+$/.test(
        value,
      ) && !value.includes('..'),
    'Invalid storage key',
  )
  .nullable()
  .optional();

export const templateInput = z.object({
  name: safeText(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,119}$/)
    .optional(),
  description: optionalText,
  category_id: z.string().uuid().nullable().optional(),
  background_image_url: assetUrl,
  background_storage_key: storageKey,
  thumbnail_url: assetUrl,
  thumbnail_storage_key: storageKey,
  width: z.coerce.number().int().min(100).max(12000),
  height: z.coerce.number().int().min(100).max(12000),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  notes: optionalText,
});

export const fieldInput = z.object({
  layer_name: safeText(120),
  field_key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$/),
  field_label: safeText(160),
  field_type: z
    .enum([
      'text',
      'textarea',
      'number',
      'date',
      'select',
      'employee',
      'department',
      'branch',
      'job_title',
      'custom',
    ])
    .default('text'),
  content: z.string().max(4000).refine(htmlSafe, htmlSafeMessage).default('نص جديد'),
  default_value: optionalText,
  placeholder: optionalText,
  is_dynamic: z.boolean().default(false),
  is_required: z.boolean().default(false),
  x: z.coerce.number().min(-12000).max(24000),
  y: z.coerce.number().min(-12000).max(24000),
  width: z.coerce.number().min(10).max(24000),
  height: z.coerce.number().min(10).max(24000),
  font_family: safeText(120).default('Alexandria'),
  font_size: z.coerce.number().min(6).max(600),
  font_weight: z.coerce.number().int().min(100).max(900),
  font_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text_align: z.enum(['left', 'center', 'right']),
  direction: z.enum(['rtl', 'ltr', 'auto']),
  line_height: z.coerce.number().min(0.5).max(5),
  letter_spacing: z.coerce.number().min(-20).max(100),
  rotation: z.coerce.number().min(-360).max(360),
  opacity: z.coerce.number().min(0).max(1),
  multiline: z.boolean(),
  auto_fit: z.boolean(),
  min_font_size: z.coerce.number().min(4).max(600),
  max_font_size: z.coerce.number().min(4).max(600),
  max_length: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  is_visible: z.boolean(),
  is_locked: z.boolean(),
  z_index: z.coerce.number().int().min(1),
  sort_order: z.coerce.number().int().min(1),
  options: z.array(z.union([z.string(), z.number()])).max(200).default([]),
});

export type DesignFieldInput = z.infer<typeof fieldInput>;

export function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (base || `design-${Date.now()}`).slice(0, 110);
}

export function dbFieldValues(value: DesignFieldInput) {
  return [
    value.layer_name,
    value.field_key,
    value.field_label,
    value.field_type,
    value.content,
    value.default_value || null,
    value.placeholder || null,
    value.is_dynamic,
    value.is_required,
    value.x,
    value.y,
    value.width,
    value.height,
    value.font_family,
    value.font_size,
    value.font_weight,
    value.font_color,
    value.text_align,
    value.direction,
    value.line_height,
    value.letter_spacing,
    value.rotation,
    value.opacity,
    value.multiline,
    value.auto_fit,
    value.min_font_size,
    value.max_font_size,
    value.max_length || null,
    value.is_visible,
    value.is_locked,
    value.z_index,
    value.sort_order,
    JSON.stringify(value.options),
  ];
}
