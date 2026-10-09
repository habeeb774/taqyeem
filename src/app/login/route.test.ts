import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/branding', () => ({ getBrandingHeadHtml: async () => '' }));
import { GET } from './route';

const pages: JSDOM[] = [];
async function open(search: string, error = '') {
  const page = new JSDOM(await (await GET()).text(), {
    url: `https://example.com/login${search}`, runScripts: 'outside-only',
  });
  pages.push(page);
  const fetch = vi.fn().mockResolvedValue({ ok: !error, json: async () => ({ ok: !error, error }) });
  Object.assign(page.window, { fetch });
  for (const script of page.window.document.querySelectorAll('script')) {
    if (!script.src) page.window.eval(script.textContent || '');
  }
  const document = page.window.document;
  async function submit() {
    document.getElementById('login')!.dispatchEvent(new page.window.Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(document.getElementById('error')!.textContent).not.toBe(''));
  }
  return { document, fetch, submit };
}
afterEach(() => pages.splice(0).forEach(page => page.window.close()));

describe('password recovery', () => {
  it('requests a link without requiring the old password', async () => {
    const { document, fetch, submit } = await open('?reset=1');
    (document.getElementById('email') as HTMLInputElement).value = 'employee@example.com';
    expect((document.getElementById('password') as HTMLInputElement).required).toBe(false);
    expect((document.querySelector('.remember') as HTMLElement).hidden).toBe(true);
    await submit();
    expect(fetch.mock.calls[0][0]).toBe('/api/app/auth/password-reset');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'employee@example.com' });
    expect(document.getElementById('error')!.textContent).toContain('راجع البريد غير المرغوب');
  });
  it('saves the new password and explains the next step', async () => {
    const { document, fetch, submit } = await open('?reset_token=test-token');
    const password = document.getElementById('password') as HTMLInputElement;
    expect(password.minLength).toBe(8);
    password.value = 'test-new-password';
    await submit();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'reset', token: 'test-token', password: 'test-new-password' });
    expect(password.value).toBe('');
    expect(document.getElementById('error')!.textContent).toContain('يمكنك تسجيل الدخول الآن');
  });
  it('offers a new link when the token expires', async () => {
    const { document, submit } = await open('?reset_token=expired', 'RESET_TOKEN_INVALID');
    await submit();
    expect(document.querySelector('.forgot')!.textContent).toBe('طلب رابط استعادة جديد');
    expect((document.getElementById('submit') as HTMLButtonElement).disabled).toBe(false);
  });
});
