import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildDocumentHtml, type FormDefinition, type FormState } from './document';

// Parity check: the React builder must produce the same document markup as the
// legacy editor's docHtml() for the same saved state, for every built-in form.
type Legacy = {
  FORMS: (FormDefinition & { id: string })[];
  allForms: unknown[];
  openForm(id: string): void;
  captureState(): FormState;
  docHtml(): string;
  currentDocNo: string;
};

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
        alert: () => undefined,
      });
    },
  });
  const w = dom.window as unknown as Legacy & Window;
  // FORMS is a top-level const, so read it through eval in the page's scope.
  const forms = (dom.window as unknown as { eval(code: string): unknown }).eval('FORMS') as Legacy['FORMS'];
  return { w, forms, dom };
}

function fillInputs(document: Document) {
  // Tag checks, not instanceof: the page has its own window, so its element classes differ from the test's.
  let n = 0;
  document.querySelectorAll<HTMLElement>('#formFill .doc-inp').forEach((el) => {
    n++;
    const input = el as HTMLInputElement;
    if (el.getAttribute('contenteditable') === 'true') {
      if (!el.innerHTML.trim()) el.innerHTML = `نص حر ${n}`;
    } else if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      const option = Array.from(select.options).find((o) => o.value && o.value !== '__manual__');
      if (option) select.value = option.value;
    } else if (el.tagName === 'INPUT' && input.type === 'date') {
      input.value = '2026-10-09';
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.id === 'f_amount') input.value = '1000';
      else if (el.id === 'f_inst_count') input.value = '3';
      else if (el.id !== 'f_inst_values') input.value = `قيمة ${n}`;
    }
  });
}

describe('buildDocumentHtml parity with legacy docHtml()', () => {
  const { w, forms, dom } = loadLegacy();
  const run = (code: string) => (dom.window as unknown as { eval(code: string): unknown }).eval(code);
  it.each(forms.map((f) => [f.id, f] as const))('%s', async (id, form) => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the page's async init settle
    run('allForms = FORMS.slice()');
    w.openForm(id);
    fillInputs(dom.window.document);
    run("currentDocNo='HR-HB-0001'");
    const state = w.captureState();
    const legacy = w.docHtml();
    const ported = buildDocumentHtml(form, JSON.parse(JSON.stringify(state)), { formId: id, documentNo: 'HR-HB-0001' });
    expect(legacy).toMatch(/قيمة|نص حر|09\/10\/2026/); // the filled values really reached the document
    expect(legacy).toContain('HR-HB-0001');
    expect(ported).toBe(legacy);
  });
});

describe('buildDocumentHtml parity for document-level edits', () => {
  const { forms, dom } = loadLegacy();
  const run = (code: string) => (dom.window as unknown as { eval(code: string): unknown }).eval(code);
  // Forms with a normal section, and the contract form with boxed clauses.
  const cases = forms.filter((f) => f.id === 'paper_contract' || f.id === 'violation' || f.id === 'cash_advance');

  it.each(cases.map((f) => [f.id, f] as const))('%s: added field, renamed label, font size, clauses', async (id, form) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    run('allForms = FORMS.slice()');
    run(`openForm(${JSON.stringify(id)})`);
    // addField() and addClause() read their answers from prompt(); answer them in order.
    run(`(function(){ var answers=['خانة إضافية','1']; window.prompt=function(){ return answers.shift(); }; })()`);
    run("addField('sec0')");
    run(`(function(){ var answers=['بند جديد']; window.prompt=function(){ return answers.shift(); }; window.confirm=function(){ return true; }; })()`);
    run('if (hasBoxedClauses(allForms.find(function(x){return x.id===activeId;}))) { addClause(); var boxed=(allForms.find(function(x){return x.id===activeId;}).sections||[]).find(function(s){return s.boxed;}); if (boxed) removeClause(boxed.fields[0].id); }');
    const firstField = (form.sections || []).flatMap((s) => s.fields || []).find((f) => f.type !== 'date');
    if (firstField) run(`labelOverrides[${JSON.stringify(firstField.id)}]='اسم معدّل'`);
    const textarea = (form.sections || []).flatMap((s) => s.fields || []).find((f) => f.type === 'textarea' || (form.sections || []).some((s) => s.free));
    if (textarea) run(`taFont(${JSON.stringify(textarea.id)}, 1); taFont(${JSON.stringify(textarea.id)}, 1)`);
    fillInputs(dom.window.document);
    const state = run('captureState()') as FormState;
    const legacy = run('docHtml()') as string;
    expect(legacy).toContain('خانة إضافية');
    const ported = buildDocumentHtml(form, JSON.parse(JSON.stringify(state)), { formId: id });
    expect(ported).toBe(legacy);
  });
});
