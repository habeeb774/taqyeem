import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildDocumentHtml, type FormDefinition } from './document';
import { employeeAutofill, initialState, type Employee } from './editor-state';

// The React editor must start from, and autofill into, the same document the legacy editor produces.
const employee: Employee = {
  id: '11111111-1111-1111-1111-111111111111',
  employee_number: '1042',
  full_name: 'سارة أحمد',
  email: 'sara@example.com',
  phone: '0550000000',
  branch_name: 'فرع بريدة',
  department_name: 'المبيعات',
  job_title_name: 'أخصائية مبيعات',
  manager_name: 'خالد علي',
};

/** null when equal, otherwise the text around the first difference (readable failures on long HTML). */
function firstDiff(actual: string, expected: string) {
  if (actual === expected) return null;
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  return { at: i, ported: actual.slice(Math.max(0, i - 60), i + 120), legacy: expected.slice(Math.max(0, i - 60), i + 120) };
}

function loadLegacy() {
  const html = readFileSync('src/templates/forms.html', 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*src=[^>]*><\/script>/g, ''), {
    url: 'https://example.com/forms/editor?task=parity-test',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.assign(window, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, templates: [], documents: [], permissions: [] }) }),
        requestAnimationFrame: () => 0,
        confirm: () => false,
      });
    },
  });
  const run = (code: string) => (dom.window as unknown as { eval(code: string): unknown }).eval(code);
  return { run, forms: run('FORMS') as (FormDefinition & { id: string })[] };
}

describe('React editor state parity with the legacy editor', () => {
  const { run, forms } = loadLegacy();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it.each(forms.map((f) => [f.id, f] as const))('new document: %s', async (id, form) => {
    await settle();
    run('allForms = FORMS.slice(); currentDocNo = ""');
    run(`openForm(${JSON.stringify(id)})`);
    const legacy = run('docHtml()') as string;
    const ported = buildDocumentHtml(form, initialState(id, form), { formId: id, deptFallback: 'إدارة الموارد البشرية' });
    expect(firstDiff(ported, legacy)).toBeNull();
  });

  it.each(forms.map((f) => [f.id, f] as const))('employee autofill: %s', async (id, form) => {
    await settle();
    run('allForms = FORMS.slice(); currentDocNo = ""');
    run(`openForm(${JSON.stringify(id)})`);
    run(`EMPLOYEES = [mapEmployee(${JSON.stringify(employee)})]`);
    // Legacy empPick from the name field: sets name + number, then empAutofill.
    run(`(function(){ var n=$('f_emp_name'); if(n) n.value=${JSON.stringify(employee.full_name)}; var no=$('f_emp_no'); if(no) no.value=${JSON.stringify(employee.employee_number)}; empAutofill(${JSON.stringify(employee.full_name)}); })()`);
    const legacy = run('docHtml()') as string;
    const start = initialState(id, form);
    const state = { ...start, inputs: { ...start.inputs, ...employeeAutofill(form, start, employee, 'emp_name') } };
    const ported = buildDocumentHtml(form, state, { formId: id, deptFallback: 'إدارة الموارد البشرية' });
    expect(firstDiff(ported, legacy)).toBeNull();
  });
});
