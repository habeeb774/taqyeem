import { bigint, boolean, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { branches, departments, organizations } from './core';

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  titleAr: text('title_ar').notNull(), titleEn: text('title_en'), slug: text('slug').notNull(),
  departmentId: uuid('department_id').references(()=>departments.id), branchId: uuid('branch_id').references(()=>branches.id),
  employmentType: text('employment_type').notNull().default('full_time'), workplaceType: text('workplace_type').notNull().default('onsite'),
  experienceMin: integer('experience_min'), experienceMax: integer('experience_max'),
  description: text('description'), responsibilities: text('responsibilities'), requirements: text('requirements'), benefits: text('benefits'),
  salaryMin: numeric('salary_min',{precision:12,scale:2}), salaryMax: numeric('salary_max',{precision:12,scale:2}), salaryVisible: boolean('salary_visible').notNull().default(false),
  vacanciesCount: integer('vacancies_count').notNull().default(1), status: text('status').notNull().default('draft'),
  externalApplyUrl: text('external_apply_url'),
  publishAt: timestamp('publish_at',{withTimezone:true}), expiresAt: timestamp('expires_at',{withTimezone:true}),
  createdBy: uuid('created_by').references(()=>users.id),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('jobs_org_slug_uq').on(t.organizationId,t.slug)]);

export const jobApplications = pgTable('job_applications', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  referenceNumber: text('reference_number'), jobId: uuid('job_id').references(()=>jobs.id),
  fullName: text('full_name').notNull(), email: text('email').notNull(), phone: text('phone').notNull(), city: text('city'),
  yearsExperience: integer('years_experience'), linkedinUrl: text('linkedin_url'), coverLetter: text('cover_letter'),
  cvFileUrl: text('cv_file_url').notNull(), cvFileName: text('cv_file_name').notNull(), cvMimeType: text('cv_mime_type').notNull(),
  cvFileSize: bigint('cv_file_size',{mode:'number'}).notNull(), cvStorageKey: text('cv_storage_key').notNull(),
  status: text('status').notNull().default('new'), source: text('source').notNull().default('website'),
  consent: boolean('consent').notNull().default(false), consentAt: timestamp('consent_at',{withTimezone:true}),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('job_applications_reference_number_uq').on(t.referenceNumber)]);

export const applicationStatusHistory = pgTable('application_status_history', {
  id: uuid('id').defaultRandom().primaryKey(), applicationId: uuid('application_id').notNull().references(()=>jobApplications.id,{onDelete:'cascade'}),
  oldStatus: text('old_status'), newStatus: text('new_status').notNull(), changedBy: uuid('changed_by').references(()=>users.id), note: text('note'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const applicationNotes = pgTable('application_notes', {
  id: uuid('id').defaultRandom().primaryKey(), applicationId: uuid('application_id').notNull().references(()=>jobApplications.id,{onDelete:'cascade'}),
  userId: uuid('user_id').notNull().references(()=>users.id), note: text('note').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
