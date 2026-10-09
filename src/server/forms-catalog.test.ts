import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function catalog(ok: boolean, templates: unknown[] = []) {
  const page = new JSDOM('<div id="secLabel"></div><input id="srch"><div id="empGrid"></div>', { runScripts: 'outside-only' });
  const fetch = vi.fn(async () => ({ ok, json: async () => ({ ok, templates }) }));
  Object.assign(page.window, {
    $: (id: string) => page.window.document.getElementById(id),
    fetch, allForms: [], currentFilter: 'all',
    deptForms: () => (page.window as unknown as { allForms: unknown[] }).allForms,
    cardHtml: (form: { name: string }) => '<article>' + form.name + '</article>',
  });
  const source = readFileSync('src/templates/forms.html', 'utf8');
  const start = source.indexOf("var formCatalogState='loading';");
  page.window.eval(source.slice(start, source.indexOf('function fmtTs(', start)));
  page.window.eval(source.slice(source.indexOf('async function loadFormTemplates(){'), source.indexOf('/* ── INIT ── */')));
  const runtime = page.window as unknown as { loadFormTemplates(): Promise<void>; renderForms(): void };
  return { page, runtime, fetch };
}

describe('forms catalog guidance', () => {
  it('shows a retry action rather than an empty catalog when the server fails', async () => {
    const { page, runtime } = catalog(false);
    await runtime.loadFormTemplates();
    expect(page.window.document.getElementById('empGrid')!.textContent).toContain('تعذر تحميل النماذج');
    expect(page.window.document.querySelector('button')!.textContent).toBe('إعادة المحاولة');
    page.window.close();
  });
  it('does not try to seed a catalog from browser data', async () => {
    const { page, runtime, fetch } = catalog(true);
    await runtime.loadFormTemplates();
    expect(fetch).toHaveBeenCalledOnce();
    expect(page.window.document.getElementById('empGrid')!.textContent).toContain('لا توجد نماذج متاحة لك');
    page.window.close();
  });
  it('clears a search with no results using the visible recovery action', async () => {
    const { page, runtime } = catalog(true, [{ template_key: 'one', name: 'نموذج', category: 'نماذج' }]);
    await runtime.loadFormTemplates();
    (page.window.document.getElementById('srch') as HTMLInputElement).value = 'غير موجود';
    runtime.renderForms();
    (page.window.document.querySelector('button') as HTMLButtonElement).click();
    expect(page.window.document.querySelector('article')!.textContent).toBe('نموذج');
    page.window.close();
  });
});
