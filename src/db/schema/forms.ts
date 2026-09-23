import { bigint, boolean, date, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { branches, departments, employees, organizations, roles } from './core';

export const formTemplates = pgTable('form_templates', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  templateKey: text('template_key').notNull(), name: text('name').notNull(), category: text('category').notNull().default('other'),
  icon: text('icon'), description: text('description'), definition: jsonb('definition').notNull().default({}), active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references(()=>users.id), updatedBy: uuid('updated_by').references(()=>users.id),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_templates_org_key_uq').on(t.organizationId,t.templateKey)]);

export const formTemplateSections = pgTable('form_template_sections', {
  id: uuid('id').defaultRandom().primaryKey(), templateId: uuid('template_id').notNull().references(()=>formTemplates.id,{onDelete:'cascade'}),
  title: text('title').notNull(), description: text('description'), sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_template_sections_template_order_uq').on(t.templateId,t.sortOrder)]);

export const formTemplateFields = pgTable('form_template_fields', {
  id: uuid('id').defaultRandom().primaryKey(), sectionId: uuid('section_id').notNull().references(()=>formTemplateSections.id,{onDelete:'cascade'}),
  fieldKey: text('field_key').notNull(), label: text('label').notNull(), fieldType: text('field_type').notNull(), employeeBinding: text('employee_binding'),
  required: boolean('required').notNull().default(false), options: jsonb('options').notNull().default([]), settings: jsonb('settings').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0), active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_template_fields_section_key_uq').on(t.sectionId,t.fieldKey)]);

export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  fullName: text('full_name').notNull(), email: text('email'), phone: text('phone'), status: text('status').notNull().default('active'),
  employeeId: uuid('employee_id').references(()=>employees.id), createdBy: uuid('created_by').references(()=>users.id),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  documentNumber: text('document_number').notNull(), formTemplateId: uuid('form_template_id').references(()=>formTemplates.id),
  employeeId: uuid('employee_id').references(()=>employees.id), candidateId: uuid('candidate_id').references(()=>candidates.id),
  branchId: uuid('branch_id').references(()=>branches.id), departmentId: uuid('department_id').references(()=>departments.id),
  createdBy: uuid('created_by').references(()=>users.id), employeeSnapshot: jsonb('employee_snapshot').notNull().default({}),
  status: text('status').notNull().default('draft'), currentApprovalStep: integer('current_approval_step').notNull().default(0),
  submittedAt: timestamp('submitted_at',{withTimezone:true}), approvedAt: timestamp('approved_at',{withTimezone:true}),
  rejectedAt: timestamp('rejected_at',{withTimezone:true}), cancelledAt: timestamp('cancelled_at',{withTimezone:true}),
  deletedAt: timestamp('deleted_at',{withTimezone:true}),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_submissions_org_document_uq').on(t.organizationId,t.documentNumber)]);

export const formSubmissionValues = pgTable('form_submission_values', {
  id: uuid('id').defaultRandom().primaryKey(), submissionId: uuid('submission_id').notNull().references(()=>formSubmissions.id,{onDelete:'cascade'}),
  fieldId: text('field_id'), fieldKey: text('field_key').notNull(), value: jsonb('value').notNull().default(null),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_submission_values_submission_key_uq').on(t.submissionId,t.fieldKey)]);

export const formSubmissionItems = pgTable('form_submission_items', {
  id: uuid('id').defaultRandom().primaryKey(), submissionId: uuid('submission_id').notNull().references(()=>formSubmissions.id,{onDelete:'cascade'}),
  itemKey: text('item_key').notNull(), position: integer('position').notNull().default(0), value: jsonb('value').notNull().default({}),
},t=>[uniqueIndex('form_submission_items_submission_key_position_uq').on(t.submissionId,t.itemKey,t.position)]);

export const formComments = pgTable('form_comments', {
  id: uuid('id').defaultRandom().primaryKey(), submissionId: uuid('submission_id').notNull().references(()=>formSubmissions.id,{onDelete:'cascade'}),
  userId: uuid('user_id').notNull().references(()=>users.id), body: text('body').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const formSignatures = pgTable('form_signatures', {
  id: uuid('id').defaultRandom().primaryKey(), submissionId: uuid('submission_id').notNull().references(()=>formSubmissions.id,{onDelete:'cascade'}),
  userId: uuid('user_id').notNull().references(()=>users.id), action: text('action').notNull(), displayName: text('display_name').notNull(),
  comment: text('comment'), signedAt: timestamp('signed_at',{withTimezone:true}).notNull().defaultNow(),
});

export const formAttachments = pgTable('form_attachments', {
  id: uuid('id').defaultRandom().primaryKey(), submissionId: uuid('submission_id').notNull().references(()=>formSubmissions.id,{onDelete:'cascade'}),
  fileName: text('file_name').notNull(), storageKey: text('storage_key').notNull(), mimeType: text('mime_type'),
  sizeBytes: bigint('size_bytes',{mode:'number'}), uploadedBy: uuid('uploaded_by').references(()=>users.id), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const formWorkflows = pgTable('form_workflows', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  templateId: uuid('template_id').notNull().references(()=>formTemplates.id,{onDelete:'cascade'}), name: text('name').notNull(), active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references(()=>users.id), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_workflows_template_name_uq').on(t.templateId,t.name)]);

export const formApprovalSteps = pgTable('form_approval_steps', {
  id: uuid('id').defaultRandom().primaryKey(), workflowId: uuid('workflow_id').notNull().references(()=>formWorkflows.id,{onDelete:'cascade'}),
  stepOrder: integer('step_order').notNull(), approverType: text('approver_type').notNull(), approverRoleId: uuid('approver_role_id').references(()=>roles.id),
  approverUserId: uuid('approver_user_id').references(()=>users.id), title: text('title'), required: boolean('required').notNull().default(true),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('form_approval_steps_workflow_order_uq').on(t.workflowId,t.stepOrder)]);

export const employeeAssets = pgTable('employee_assets', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  employeeId: uuid('employee_id').notNull().references(()=>employees.id), sourceSubmissionId: uuid('source_submission_id').notNull().references(()=>formSubmissions.id),
  itemPosition: integer('item_position').notNull(), assetName: text('asset_name').notNull(), quantity: numeric('quantity',{precision:14,scale:3}).notNull().default('1'),
  assetValue: numeric('asset_value',{precision:14,scale:2}), conditionOnDelivery: text('condition_on_delivery'), notes: text('notes'),
  status: text('status').notNull().default('assigned'), assignedAt: date('assigned_at'), returnedAt: date('returned_at'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employee_assets_submission_position_uq').on(t.sourceSubmissionId,t.itemPosition)]);

export const employeeAssetEvents = pgTable('employee_asset_events', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  assetId: uuid('asset_id').notNull().references(()=>employeeAssets.id,{onDelete:'cascade'}), eventType: text('event_type').notNull(),
  eventDate: date('event_date'), condition: text('condition'), notes: text('notes'), sourceSubmissionId: uuid('source_submission_id').references(()=>formSubmissions.id),
  createdBy: uuid('created_by').references(()=>users.id), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const employeeViolations = pgTable('employee_violations', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  employeeId: uuid('employee_id').notNull().references(()=>employees.id), sourceSubmissionId: uuid('source_submission_id').notNull().references(()=>formSubmissions.id),
  violationDate: date('violation_date'), violationType: text('violation_type'), penalty: text('penalty'), description: text('description'), managerName: text('manager_name'),
  status: text('status').notNull().default('recorded'), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employee_violations_submission_uq').on(t.sourceSubmissionId)]);

export const employeeAdvances = pgTable('employee_advances', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  employeeId: uuid('employee_id').notNull().references(()=>employees.id), sourceSubmissionId: uuid('source_submission_id').notNull().references(()=>formSubmissions.id),
  requestDate: date('request_date'), requestType: text('request_type'), amount: numeric('amount',{precision:14,scale:2}), installmentCount: integer('installment_count'),
  paymentMethod: text('payment_method'), reason: text('reason'), status: text('status').notNull().default('approved'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employee_advances_submission_uq').on(t.sourceSubmissionId)]);

export const employeeMonthlyReports = pgTable('employee_monthly_reports', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(()=>organizations.id),
  employeeId: uuid('employee_id').notNull().references(()=>employees.id), sourceSubmissionId: uuid('source_submission_id').notNull().references(()=>formSubmissions.id),
  periodFrom: date('period_from'), periodTo: date('period_to'), tasks: jsonb('tasks').notNull().default([]), highlights: text('highlights'), nextPlan: text('next_plan'), notes: text('notes'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employee_monthly_reports_submission_uq').on(t.sourceSubmissionId)]);
