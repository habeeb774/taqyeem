import { bigint, boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { employees, organizations } from './core';

export const designCategories = pgTable('design_categories', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  name: text('name').notNull(), slug: text('slug').notNull(), description: text('description'), isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('design_categories_org_slug_uq').on(t.organizationId,t.slug)]);

export const designFonts = pgTable('design_fonts', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  name: text('name').notNull(), family: text('family').notNull(), source: text('source').notNull().default('system'), url: text('url'),
  isDefault: boolean('is_default').notNull().default(false), isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('design_fonts_org_family_uq').on(t.organizationId,t.family)]);

export const designTemplates = pgTable('design_templates', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  name: text('name').notNull(), slug: text('slug').notNull(), description: text('description'), categoryId: uuid('category_id').references(()=>designCategories.id),
  backgroundImageUrl: text('background_image_url'), backgroundStorageKey: text('background_storage_key'), thumbnailUrl: text('thumbnail_url'), thumbnailStorageKey: text('thumbnail_storage_key'),
  width: integer('width').notNull(), height: integer('height').notNull(), status: text('status').notNull().default('draft'), notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(()=>users.id), updatedBy: uuid('updated_by').notNull().references(()=>users.id), usageCount: bigint('usage_count',{mode:'number'}).notNull().default(0),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), deletedAt: timestamp('deleted_at',{withTimezone:true}),
},t=>[uniqueIndex('design_templates_org_slug_uq').on(t.organizationId,t.slug)]);

export const designTemplateFields = pgTable('design_template_fields', {
  id: uuid('id').defaultRandom().primaryKey(), templateId: uuid('template_id').notNull().references(()=>designTemplates.id,{onDelete:'cascade'}),
  layerName: text('layer_name').notNull(), fieldKey: text('field_key').notNull(), fieldLabel: text('field_label').notNull(), fieldType: text('field_type').notNull().default('text'),
  content: text('content').notNull().default('نص جديد'), defaultValue: text('default_value'), placeholder: text('placeholder'), isDynamic: boolean('is_dynamic').notNull().default(false), isRequired: boolean('is_required').notNull().default(false),
  x: numeric('x',{precision:12,scale:4}).notNull().default('40'), y: numeric('y',{precision:12,scale:4}).notNull().default('40'), width: numeric('width',{precision:12,scale:4}).notNull().default('360'), height: numeric('height',{precision:12,scale:4}).notNull().default('80'),
  fontFamily: text('font_family').notNull().default('Alexandria'), fontSize: numeric('font_size',{precision:8,scale:2}).notNull().default('32'), fontWeight: integer('font_weight').notNull().default(400), fontColor: text('font_color').notNull().default('#111827'),
  textAlign: text('text_align').notNull().default('center'), direction: text('direction').notNull().default('rtl'), lineHeight: numeric('line_height',{precision:8,scale:3}).notNull().default('1.4'), letterSpacing: numeric('letter_spacing',{precision:8,scale:3}).notNull().default('0'),
  rotation: numeric('rotation',{precision:8,scale:3}).notNull().default('0'), opacity: numeric('opacity',{precision:5,scale:4}).notNull().default('1'), multiline: boolean('multiline').notNull().default(true), autoFit: boolean('auto_fit').notNull().default(true),
  minFontSize: numeric('min_font_size',{precision:8,scale:2}).notNull().default('10'), maxFontSize: numeric('max_font_size',{precision:8,scale:2}).notNull().default('200'), maxLength: integer('max_length'),
  isVisible: boolean('is_visible').notNull().default(true), isLocked: boolean('is_locked').notNull().default(false), zIndex: integer('z_index').notNull().default(1), sortOrder: integer('sort_order').notNull().default(1),
  options: jsonb('options').notNull().default([]), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('design_template_fields_template_key_uq').on(t.templateId,t.fieldKey)]);

export const generatedDesigns = pgTable('generated_designs', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id), templateId: uuid('template_id').notNull().references(()=>designTemplates.id),
  generatedBy: uuid('generated_by').notNull().references(()=>users.id), employeeId: uuid('employee_id').references(()=>employees.id), generatedData: jsonb('generated_data').notNull().default({}),
  imageUrl: text('image_url'), imageStorageKey: text('image_storage_key'), imageFormat: text('image_format').notNull(), width: integer('width').notNull(), height: integer('height').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
