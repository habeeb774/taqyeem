import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

describe('direct task entry', () => {
  it.each([true, false])('opens forms approval only with permission (allowed=%s)', allowed => {
    const page = new JSDOM('', { url: 'https://example.com/forms?task=approvals', runScripts: 'outside-only' });
    const showSection = vi.fn();
    Object.assign(page.window, { currentPermissions: allowed ? ['forms.approve'] : [], showSection });
    const source = readFileSync('src/templates/forms.html', 'utf8');
    const start = source.indexOf('function openRequestedFormsTask(){');
    page.window.eval(source.slice(start, source.indexOf("var formCatalogState=", start)));
    (page.window as unknown as { openRequestedFormsTask(): void }).openRequestedFormsTask();
    expect(showSection).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(showSection).toHaveBeenCalledWith('approvals');
    page.window.close();
  });
  it('lets the explicit assessment task override the saved month screen', () => {
    const page = new JSDOM('', { url: 'https://example.com/assessment?task=review', runScripts: 'outside-only' });
    page.window.sessionStorage.setItem('view', JSON.stringify({ screen: 'month' }));
    Object.assign(page.window, { VIEW_KEY: 'view', can: () => false, tabs: () => [['review', 'المراجعة']] });
    const source = readFileSync('public/full-services.js', 'utf8');
    const start = source.indexOf('  function loadView(){');
    page.window.eval(source.slice(start, source.indexOf('  function showSystems(){', start)));
    const runtime = page.window as unknown as { loadView(): { screen: string } };
    expect(runtime.loadView().screen).toBe('dashboard');
    page.window.close();
  });
});
