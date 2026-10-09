import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

describe('server document numbers', () => {
  it.each([false, true])('rejects failed or incomplete number responses (ok=%s)', async ok => {
    const page = new JSDOM('', { runScripts: 'outside-only' });
    const fetch = vi.fn(async () => ({ ok, json: async () => ({ ok }) }));
    const localWrite = vi.fn();
    Object.assign(page.window, { fetch, currentDept: null, currentUser: null, lsSet: localWrite });
    const source = readFileSync('src/templates/forms.html', 'utf8');
    const start = source.indexOf('async function nextDocNoFromNeon(){');
    page.window.eval(source.slice(start, source.indexOf('/* selectable document fonts', start)));
    const runtime = page.window as unknown as { nextDocNoFromNeon(): Promise<string> };
    await expect(runtime.nextDocNoFromNeon()).rejects.toThrow('تعذر الحصول على رقم المستند');
    expect(localWrite).not.toHaveBeenCalled();
    page.window.close();
  });
  it('reuses the allocated document number after a failed print authorization', async () => {
    const page = new JSDOM('', { runScripts: 'outside-only' });
    const allocate = vi.fn(async () => 'HR-0001');
    const archive = vi.fn(async () => ({ id: 'document' }));
    Object.assign(page.window, {
      $: () => null, validate: () => true, currentDocNo: null,
      nextDocNoFromNeon: allocate, archiveDoc: archive, vals: () => ({}),
      fetch: async () => ({ ok: false }), toast: vi.fn(),
    });
    const source = readFileSync('src/templates/forms.html', 'utf8');
    page.window.eval(source.slice(source.indexOf('var documentActionBusy=false;'), source.indexOf('async function submitForApproval(){')));
    const runtime = page.window as unknown as { exportPDF(): Promise<void> };
    await runtime.exportPDF();
    await runtime.exportPDF();
    expect(allocate).toHaveBeenCalledOnce();
    expect(archive).toHaveBeenCalledTimes(2);
    expect(archive).toHaveBeenLastCalledWith('HR-0001', {}, 'issued');
    page.window.close();
  });
});
