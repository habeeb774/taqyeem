import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

// Execute the shipped picker code in isolation; no API requests or user data.
function picker() {
  const source = readFileSync('public/full-services.js', 'utf8');
  const page = new JSDOM('<div id="cyclePicker"><select id="cycleSelect"></select></div>', { runScripts: 'outside-only' });
  const selectCycle = vi.fn();
  Object.assign(page.window, {
    $: (id: string) => page.window.document.getElementById(id),
    esc: (value: string) => value,
    MONTHS: [], selectCycle,
  });
  page.window.eval(source.slice(0, source.indexOf('  function empById'))
    + 'window.pickerTest={render:renderCyclePicker,latest:latestCycle};})();');
  const runtime = page.window as unknown as {
    TAQYEEM_APP: { permissions: string[]; data: { cycles: Record<string, unknown>[] } };
    pickerTest: { render(): void; latest(): { id: string } };
  };
  runtime.TAQYEEM_APP.permissions = ['evaluations.view'];
  return { page, selectCycle, runtime };
}

describe('cycle picker', () => {
  it('selects a newly loaded cycle and renders its Arabic status', () => {
    const { page, selectCycle, runtime } = picker();
    runtime.TAQYEEM_APP.data = { cycles: [{ id: 'old', name: 'قديمة', status: 'open' }] };
    runtime.pickerTest.render();
    runtime.TAQYEEM_APP.data = { cycles: [{ id: 'new', name: 'جديدة', status: 'review' }] };
    runtime.pickerTest.render();
    const select = page.window.document.getElementById('cycleSelect') as HTMLSelectElement;
    expect(select.textContent).toContain('قيد المراجعة');
    select.value = 'new';
    select.dispatchEvent(new page.window.Event('change'));
    expect(selectCycle).toHaveBeenCalledOnce();
    expect(selectCycle).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
    page.window.close();
  });
  it('chooses the latest open cycle even when input is unsorted', () => {
    const { page, runtime } = picker();
    runtime.TAQYEEM_APP.data = { cycles: [
      { id: 'old', year: 2025, month: 12, status: 'open' },
      { id: 'locked', year: 2027, month: 1, status: 'locked' },
      { id: 'latest', year: 2026, month: 10, status: 'in_progress' },
    ] };
    expect(runtime.pickerTest.latest().id).toBe('latest');
    page.window.close();
  });
});
