import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function draft(ok: boolean) {
  const page = new JSDOM('<span id="saveIndicator"></span><div id="pgForm"></div><div id="app"></div>', { runScripts: 'outside-only' });
  let resolve!: () => void;
  const fetch = vi.fn((_url: string, _options: RequestInit) => new Promise(done => { resolve = () => done({ ok, json: async () => ({ ok }) }); }));
  Object.assign(page.window, {
    $: (id: string) => page.window.document.getElementById(id), fetch,
    activeId: 'form', captureState: () => ({ field: 'value' }),
    currentPermissions: ['forms.create'], draftDirty: true, draftChangeVersion: 1,
    lsGet: () => ({}), lsSet: vi.fn(), draftKey: () => 'drafts',
    formMemory: {}, documentActionBusy: false,
    draftDocumentNo: (id: string) => 'draft_' + id, toast: vi.fn(), _saveTimer: null,
  });
  const source = readFileSync('src/templates/forms.html', 'utf8');
  page.window.eval(source.slice(source.indexOf('var draftSaveQueue='), source.indexOf('function nextDocNo(){')));
  page.window.eval(source.slice(source.indexOf('async function saveDraft(){'), source.indexOf('/* the fill view IS')));
  const runtime = page.window as unknown as {
    saveDraft(): Promise<boolean>; closeForm(): Promise<void>; clearDraft(id: string): Promise<boolean>; activeId: string | null;
  };
  return { page, runtime, fetch, resolve: () => resolve() };
}

describe('draft persistence feedback', () => {
  it('does not claim success before the server confirms saving', async () => {
    const { page, runtime, fetch, resolve } = draft(true);
    const saving = runtime.saveDraft();
    expect(page.window.document.getElementById('saveIndicator')!.textContent).toContain('جارٍ حفظ');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    resolve();
    expect(await saving).toBe(true);
    expect(page.window.document.getElementById('saveIndicator')!.textContent).toBe('تم حفظ المسودة');
    page.window.close();
  });
  it('keeps the document open after closing fails to save its draft', async () => {
    const { page, runtime, fetch, resolve } = draft(false);
    const closing = runtime.closeForm();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    resolve();
    await closing;
    expect(runtime.activeId).toBe('form');
    expect(page.window.document.getElementById('saveIndicator')!.textContent).toContain('إعادة المحاولة');
    expect(page.window.document.getElementById('saveIndicator')!.getAttribute('role')).toBe('button');
    page.window.close();
  });
  it('deletes the draft only after its pending save finishes', async () => {
    const { page, runtime, fetch, resolve } = draft(true);
    const saving = runtime.saveDraft();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const deleting = runtime.clearDraft('form');
    expect(fetch).toHaveBeenCalledOnce();
    resolve();
    await saving;
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    resolve();
    expect(await deleting).toBe(true);
    page.window.close();
  });
});
