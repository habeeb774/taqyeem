// Pure helpers for the React form editor. The editor keeps the same state shape
// the legacy editor saved (captureState in src/templates/forms.html), so drafts
// and archived documents open in either editor.
import { DEFAULT_SIGNATURES, FALLBACK_SIGNATURES } from './default-signatures';
import type { FieldDef, FormDefinition, FormState } from './document';

export type Employee = {
  id: string;
  employee_number: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  branch_name: string;
  department_name: string;
  job_title_name: string;
  manager_name?: string | null;
};

export const DOC_FONTS: [string, string][] = [
  ["'TSans-Light'", 'Sans خفيف'],
  ["'TSans-Regular'", 'Sans عادي'],
  ["'TSans-Medium'", 'Sans متوسط'],
  ["'TSans-Bold'", 'Sans عريض'],
  ["'TSans-Black'", 'Sans أسود'],
  ["'TDisp-Light'", 'Serif Display خفيف'],
  ["'TDisp-Regular'", 'Serif Display عادي'],
  ["'TText-Medium'", 'Serif Text متوسط'],
  ["'TText-Bold'", 'Serif Text عريض'],
  ["'TText-Black'", 'Serif Text أسود'],
];

// The legacy editor hard-codes the HR department and the HR-HB number prefix.
export const DEFAULT_DEPT = 'إدارة الموارد البشرية';
export const NUMBER_PREFIX = 'HR-HB';

export type EditorState = FormState & { formId: string; employeeId?: string | null };

/** Every input field the form renders, in document order (sections, sections2, delivery, return block). */
export function allFields(form: FormDefinition, state: FormState): FieldDef[] {
  const extra = state.extraFields || {};
  const out: FieldDef[] = [];
  (form.sections || []).forEach((s, si) => {
    if (s.fixed) return;
    out.push(...(s.fields || []), ...(extra[`sec${si}`] || []));
  });
  (form.sections2 || []).forEach((s, si) => out.push(...(s.fields || []), ...(extra[`s2_${si}`] || [])));
  out.push(...(form.delivery || []));
  if (form.returnBlock) out.push(...form.returnBlock.fields);
  return out;
}

/** A fresh state for a new document: defaults (fl.def), default signatures, pledge text. Mirrors openForm(). */
export function initialState(formId: string, form: FormDefinition): EditorState {
  // Like the legacy editor, every field has an input (empty or not); the document builder relies on that.
  const inputs: Record<string, string> = {};
  allFields(form, {}).forEach((fl) => {
    inputs[`f_${fl.id}`] = '';
    if (fl.def === undefined) return;
    if (fl.type === 'select' && fl.options && !fl.options.includes(fl.def)) {
      inputs[`f_${fl.id}`] = '__manual__';
      inputs[`m_${fl.id}`] = fl.def;
    } else {
      inputs[`f_${fl.id}`] = fl.def;
    }
  });
  if (form.pledge) inputs.f_pledge_text = form.pledge;
  if (form.installments) inputs.f_inst_values = '';
  if (formId === 'dept_request' && !inputs.f_from_dept) inputs.f_from_dept = DEFAULT_DEPT;
  return {
    formId,
    inputs,
    items: [],
    hiddenFields: {},
    labelOverrides: {},
    extraFields: {},
    sigs: (DEFAULT_SIGNATURES[formId] || FALLBACK_SIGNATURES).slice(),
    docTitle: form.name,
    docDept: DEFAULT_DEPT,
    font: DOC_FONTS[0][0],
    checks: [],
    taFontSize: {},
    clauseExtra: [],
    clauseRemoved: {},
  };
}

/** Values to copy into the form when an employee is picked. Mirrors empPick()/empAutofill(). */
export function employeeAutofill(form: FormDefinition, state: FormState, employee: Employee, sourceFieldId: string) {
  const patch: Record<string, string> = {};
  const number = employee.employee_number || '';
  if (sourceFieldId === 'pay_to') {
    patch.f_pay_to = employee.full_name;
    return patch;
  }
  patch[`f_${sourceFieldId}`] = employee.full_name;
  patch.f_emp_name = employee.full_name;
  patch.f_emp_no = number;
  const fields = new Set(allFields(form, state).map((fl) => fl.id));
  const setIf = (ids: string[], value: string | null | undefined) =>
    ids.forEach((id) => {
      if (fields.has(id) && value) patch[`f_${id}`] = value;
    });
  setIf(['dept', 'department', 'current_dept'], employee.department_name);
  setIf(['branch', 'employee_branch', 'work_branch'], employee.branch_name);
  setIf(['title', 'emp_id', 'job_title'], employee.job_title_name);
  setIf(['manager', 'direct_manager', 'mgr'], employee.manager_name);
  setIf(['emp_no', 'func_no', 'employee_no', 'emp_number'], number);
  const bindings: Record<string, string | null | undefined> = {
    'employee.full_name': employee.full_name,
    'employee.employee_number': number,
    'employee.department_name': employee.department_name,
    'employee.branch_name': employee.branch_name,
    'employee.job_title_name': employee.job_title_name,
    'employee.manager_name': employee.manager_name,
    'employee.phone': employee.phone,
    'employee.email': employee.email,
  };
  allFields(form, state).forEach((fl) => {
    const value = fl.employee_binding ? bindings[fl.employee_binding] : null;
    if (value) patch[`f_${fl.id}`] = value;
  });
  // Only keep the fields that exist (emp_name/emp_no may not be on this form).
  return Object.fromEntries(Object.entries(patch).filter(([key]) => fields.has(key.slice(2))));
}

/** Offer letters: total = base + housing + transport. Mirrors recalcOfferTotal(). */
export function withOfferTotal(inputs: Record<string, string>) {
  if (!('f_total_salary' in inputs)) return inputs;
  const num = (id: string) => {
    let v = inputs[`f_${id}`] || '';
    if (v === '__manual__') v = inputs[`m_${id}`] || '';
    const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
    return Number.isNaN(n) ? 0 : n;
  };
  const sum = (parseFloat(inputs.f_base_salary) || 0) + num('housing') + num('transport');
  return { ...inputs, f_total_salary: sum ? String(Math.round(sum * 100) / 100) : '' };
}

/** First required, visible, empty field (the legacy validate()). */
export function firstMissingField(form: FormDefinition, state: FormState): FieldDef | null {
  const hidden = state.hiddenFields || {};
  const inputs = state.inputs || {};
  const check: FieldDef[] = [];
  const extra = state.extraFields || {};
  (form.sections || []).forEach((s, si) => check.push(...(s.fields || []), ...(extra[`sec${si}`] || [])));
  (form.sections2 || []).forEach((s, si) => check.push(...(s.fields || []), ...(extra[`s2_${si}`] || [])));
  check.push(...(form.delivery || []));
  return check.find((fl) => fl.req && !hidden[fl.id] && !String(inputs[`f_${fl.id}`] || '').trim()) || null;
}

export function draftDocumentNo(userId: string, formId: string) {
  return `draft_${userId}_${formId}`;
}
