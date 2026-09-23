import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id'),
  employeeId: uuid('employee_id'),
  fullName: text('full_name'),
  email: text('email'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id'),
  code: text('code').notNull(),
  nameAr: text('name_ar').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  active: boolean('active').notNull().default(true),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  description: text('description'),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  roleId: uuid('role_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roleScopes = pgTable('role_scopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userRoleId: uuid('user_role_id').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeId: uuid('scope_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userScopes = pgTable(
  'user_scopes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    scopeType: text('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_scope_uq').on(
      table.userId,
      table.organizationId,
      table.scopeType,
      table.scopeId,
    ),
  ],
);

export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    effect: text('effect').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('upo_user_permission_org_uq').on(
      table.userId,
      table.permissionId,
      table.organizationId,
    ),
  ],
);

export const branches = pgTable('branches', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  city: text('city'),
  address: text('address'),
  managerEmployeeId: uuid('manager_employee_id'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  branchId: uuid('branch_id'),
  parentDepartmentId: uuid('parent_department_id'),
  name: text('name').notNull(),
  code: text('code').notNull(),
  managerEmployeeId: uuid('manager_employee_id'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const sections = pgTable('sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  managerEmployeeId: uuid('manager_employee_id'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const jobTitles = pgTable('job_titles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  employeeNumber: text('employee_number').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  hireDate: date('hire_date'),
  branchId: uuid('branch_id'),
  departmentId: uuid('department_id'),
  sectionId: uuid('section_id'),
  jobTitleId: uuid('job_title_id'),
  managerId: uuid('manager_id'),
  supervisorId: uuid('supervisor_id'),
  status: text('status').notNull().default('active'),
  workEndDate: date('work_end_date'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const employeeAssignments = pgTable('employee_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeId: uuid('employee_id').notNull(),
  branchId: uuid('branch_id'),
  departmentId: uuid('department_id'),
  sectionId: uuid('section_id'),
  jobTitleId: uuid('job_title_id'),
  managerId: uuid('manager_id'),
  supervisorId: uuid('supervisor_id'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  reason: text('reason'),
  isCurrent: boolean('is_current').notNull().default(true),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationCycles = pgTable('evaluation_cycles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  month: smallint('month').notNull(),
  year: smallint('year').notNull(),
  startsAt: date('starts_at').notNull(),
  endsAt: date('ends_at').notNull(),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationTemplates = pgTable('evaluation_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  scopeType: text('scope_type').notNull().default('general'),
  scopeId: uuid('scope_id'),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationCriteria = pgTable('evaluation_criteria', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  maxScore: numeric('max_score', { precision: 6, scale: 2 }).notNull().default('5'),
  mandatory: boolean('mandatory').notNull().default(true),
  visibleToEmployee: boolean('visible_to_employee').notNull().default(true),
  commentRequired: boolean('comment_required').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by'),
});

export const templateCriteria = pgTable('template_criteria', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id').notNull(),
  criterionId: uuid('criterion_id').notNull(),
  weight: numeric('weight', { precision: 8, scale: 4 }).notNull().default('1'),
  sortOrder: integer('sort_order').notNull().default(0),
  mandatory: boolean('mandatory').notNull().default(true),
  visibleToEmployee: boolean('visible_to_employee').notNull().default(true),
  commentRequired: boolean('comment_required').notNull().default(false),
});

export const evaluationAssignments = pgTable(
  'evaluation_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cycleId: uuid('cycle_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    evaluatorUserId: uuid('evaluator_user_id').notNull(),
    templateId: uuid('template_id'),
    evaluationType: text('evaluation_type').notNull().default('performance'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
  },
  (table) => [
    uniqueIndex('evaluation_assignments_cycle_employee_evaluator_type_uq').on(
      table.cycleId,
      table.employeeId,
      table.evaluatorUserId,
      table.evaluationType,
    ),
  ],
);

export const evaluations = pgTable('evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  assignmentId: uuid('assignment_id').notNull().unique(),
  cycleId: uuid('cycle_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  evaluatorUserId: uuid('evaluator_user_id').notNull(),
  evaluationType: text('evaluation_type').notNull().default('performance'),
  templateId: uuid('template_id'),
  templateSnapshot: jsonb('template_snapshot').notNull().default({}),
  status: text('status').notNull().default('draft'),
  weightedScore: numeric('weighted_score', { precision: 8, scale: 3 }),
  finalScore: numeric('final_score', { precision: 8, scale: 3 }),
  resultLabel: text('result_label'),
  notes: text('notes'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  reopenedAt: timestamp('reopened_at', { withTimezone: true }),
  reopenReason: text('reopen_reason'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationAnswers = pgTable(
  'evaluation_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    evaluationId: uuid('evaluation_id').notNull(),
    criterionId: uuid('criterion_id'),
    criterionNameSnapshot: text('criterion_name_snapshot').notNull(),
    criterionDescriptionSnapshot: text('criterion_description_snapshot'),
    weightSnapshot: numeric('weight_snapshot', { precision: 8, scale: 4 })
      .notNull()
      .default('1'),
    maxScoreSnapshot: numeric('max_score_snapshot', { precision: 6, scale: 2 })
      .notNull()
      .default('5'),
    score: numeric('score', { precision: 6, scale: 2 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('evaluation_answer_uq').on(table.evaluationId, table.criterionId),
  ],
);

export const salesTargets = pgTable('sales_targets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  cycleId: uuid('cycle_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  branchId: uuid('branch_id'),
  departmentId: uuid('department_id'),
  targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
  achievedAmount: numeric('achieved_amount', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  source: text('source').notNull().default('individual'),
  lastEditReason: text('last_edit_reason'),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branchTargets = pgTable(
  'branch_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    cycleId: uuid('cycle_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
    achievedAmount: numeric('achieved_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    targetMode: text('target_mode').notNull().default('independent'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('branch_target_cycle_branch_uq').on(table.cycleId, table.branchId),
  ],
);

export const targetChangeHistory = pgTable('target_change_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetId: uuid('target_id').notNull(),
  oldTarget: numeric('old_target', { precision: 14, scale: 2 }),
  newTarget: numeric('new_target', { precision: 14, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  changedBy: uuid('changed_by'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attendancePenaltyTypes = pgTable('attendance_penalty_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  deductionPoints: numeric('deduction_points', {
    precision: 8,
    scale: 2,
  }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const attendanceEvaluations = pgTable('attendance_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  cycleId: uuid('cycle_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  baseScore: numeric('base_score', { precision: 8, scale: 2 })
    .notNull()
    .default('100'),
  finalScore: numeric('final_score', { precision: 8, scale: 2 })
    .notNull()
    .default('100'),
  notes: text('notes'),
  status: text('status').notNull().default('draft'),
  evaluatorUserId: uuid('evaluator_user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attendancePenaltyEntries = pgTable('attendance_penalty_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  attendanceEvaluationId: uuid('attendance_evaluation_id').notNull(),
  penaltyTypeId: uuid('penalty_type_id').notNull(),
  occurrences: integer('occurrences').notNull().default(0),
  deductionPointsSnapshot: numeric('deduction_points_snapshot', {
    precision: 8,
    scale: 2,
  }).notNull(),
  note: text('note'),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id'),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  reason: text('reason'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  kind: text('kind'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    description: text('description'),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('system_setting_uq').on(table.organizationId, table.key),
  ],
);
