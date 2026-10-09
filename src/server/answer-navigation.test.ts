import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function question() {
  const page = new JSDOM('<div id="evalProg"></div><div id="evalDots"></div><div id="evalStepLbl"></div><div id="evalQ"></div><div id="evalHint"></div><div id="evalOptions"></div><div id="evalNav"></div>', {
    runScripts: 'outside-only',
  });
  let resolve!: (saved: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  Object.assign(page.window, {
    $: (id: string) => page.window.document.getElementById(id),
    _eCrit: [{ key: 'first', text: 'First' }, { key: 'second', text: 'Second' }],
    _eStep: 0, _eAns: {}, _eNotes: '',
    RATINGS: [{ val: 1, label: 'One' }, { val: 2, label: 'Two' }],
    scoreTone: () => 'none', taqAutosaveAnswer: save,
  });
  const source = readFileSync('src/templates/assessment.html', 'utf8');
  page.window.eval(source.slice(source.indexOf('function renderEvalStep(){'), source.indexOf('function finishEval(){')));
  const runtime = page.window as unknown as { renderEvalStep(): void; _eStep: number };
  runtime.renderEvalStep();
  return { page, runtime, save, resolve: (saved: boolean) => resolve(saved) };
}

describe('answer navigation', () => {
  it('waits for the save and prevents double-clicks from skipping a question', async () => {
    const { page, runtime, save, resolve } = question();
    const button = page.window.document.querySelector('button.eval-opt') as HTMLButtonElement;
    button.click();
    button.click();
    expect(save).toHaveBeenCalledOnce();
    expect(runtime._eStep).toBe(0);
    resolve(true);
    await vi.waitFor(() => expect(runtime._eStep).toBe(1));
    page.window.close();
  });
  it('keeps the same question and offers retry after a failed save', async () => {
    const { page, runtime, resolve } = question();
    (page.window.document.querySelector('button.eval-opt') as HTMLButtonElement).click();
    resolve(false);
    await vi.waitFor(() => expect(page.window.document.querySelector('.eval-next')!.textContent).toContain('إعادة الحفظ'));
    expect(runtime._eStep).toBe(0);
    expect((page.window.document.querySelector('button.eval-opt') as HTMLButtonElement).disabled).toBe(false);
    page.window.close();
  });
});
