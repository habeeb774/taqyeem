import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function archive(saveSucceeds: boolean) {
  const page = new JSDOM('<div id="sec-archive" class="active"></div><div id="archList"></div>', { runScripts: 'outside-only' });
  const lsSet = vi.fn();
  Object.assign(page.window, {
    $: (id: string) => page.window.document.getElementById(id),
    allForms: [{ id: 'form', name: 'نموذج' }], activeId: 'form', docTitle: '', docDept: '',
    currentDept: null, currentUser: null, selectedFormEmployee: null, EMPLOYEES: [],
    archiveKey: () => 'archive', lsGet: () => [], lsSet, captureState: () => ({}),
    fetch: vi.fn(async () => ({ ok: saveSucceeds, json: async () => ({ ok: saveSucceeds, document: {} }) })),
  });
  const source = readFileSync('src/templates/forms.html', 'utf8');
  page.window.eval(source.slice(source.indexOf('async function archiveDoc('), source.indexOf('function openArchivedDoc(')));
  const runtime = page.window as unknown as {
    archiveDoc(number: string, values: Record<string, unknown>): Promise<unknown>;
    loadRemoteArchive(): Promise<void>;
  };
  return { page, lsSet, runtime };
}

describe('forms archive feedback', () => {
  it('does not show a document as saved when the server rejects it', async () => {
    const { page, lsSet, runtime } = archive(false);
    await expect(runtime.archiveDoc('DOC-1', {})).rejects.toThrow('SAVE_FAILED');
    expect(lsSet).not.toHaveBeenCalled();
    page.window.close();
  });
  it('adds a document after the server confirms saving', async () => {
    const { page, lsSet, runtime } = archive(true);
    await runtime.archiveDoc('DOC-1', {});
    expect(lsSet).toHaveBeenCalledWith('archive', expect.arrayContaining([expect.objectContaining({ docNo: 'DOC-1' })]));
    page.window.close();
  });
  it('offers retry after the archive request fails', async () => {
    const { page, runtime } = archive(false);
    Object.assign(page.window, { archivePage: 1 });
    await runtime.loadRemoteArchive();
    expect(page.window.document.getElementById('archList')!.textContent).toContain('تعذر تحميل المستندات');
    expect(page.window.document.querySelector('button')!.textContent).toBe('إعادة المحاولة');
    page.window.close();
  });
});
