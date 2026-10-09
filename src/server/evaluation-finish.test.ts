import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function evaluation(submitPermission: boolean, failSubmission = false) {
  const page = new JSDOM('<div id="evalNav"><button class="eval-next">حفظ</button></div><div id="pgDash"></div>', { runScripts: 'outside-only' });
  const api = vi.fn(async (_url: string, options: { body: { action: string } }) => {
    if (failSubmission && options.body.action === 'submitted') throw new Error('network failed');
    return { score: 4 };
  });
  const toast = vi.fn();
  const hide = vi.fn();
  Object.assign(page.window, {
    A: { evaluationIds: { employee: 'evaluation' }, evaluationStatus: {} },
    empById: () => ({ id: 'employee', name: 'موظف' }),
    _eId: 'employee', _eMode: 'criteria', _eCrit: [{ key: 'criterion' }],
    _eAns: { criterion: 4 }, _eComments: {}, _eNotes: 'ملاحظات', evals: {},
    finishingEvaluation: false, pendingNotesSave: Promise.resolve(), _autosaveNotesTimer: null,
    $: (id: string) => page.window.document.getElementById(id),
    api, toast, hide, pg: vi.fn(), renderGrid: vi.fn(), busy: vi.fn(),
    nowDT: () => ({ date: '', time: '' }), can: () => submitPermission, humanError: (message: string) => message,
  });
  const source = readFileSync('public/full-services.js', 'utf8');
  page.window.eval(source.slice(source.indexOf('  finishEval=async function(){'), source.indexOf('  fullMark=async function')));
  const finish = () => (page.window as unknown as { finishEval(): Promise<void> }).finishEval();
  return { page, api, toast, hide, finish };
}

describe('evaluation completion feedback', () => {
  it('saves a draft without sending when submission is unavailable', async () => {
    const { page, api, toast, finish } = evaluation(false);
    await finish();
    expect(api).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith('تم حفظ مسودة تقييم موظف');
    page.window.close();
  });
  it('confirms submission only after it succeeds', async () => {
    const { page, api, toast, finish } = evaluation(true);
    await finish();
    expect(api).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledWith('تم إرسال تقييم موظف للمراجعة');
    page.window.close();
  });
  it('keeps the editor open and distinguishes a saved draft from failed submission', async () => {
    const { page, toast, hide, finish } = evaluation(true, true);
    await finish();
    expect(hide).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('حُفظت المسودة، لكن لم يتم إرسالها'));
    page.window.close();
  });
});
