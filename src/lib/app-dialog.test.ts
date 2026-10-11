import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

type DialogApi = Window & {
  appPrompt: (message: string, value?: string) => Promise<string | null>;
  appConfirm: (message: string) => Promise<boolean>;
};
const api = window as unknown as DialogApi;
beforeEach(() => {
  document.body.innerHTML = '';
  new Function(readFileSync('public/app-dialog.js', 'utf8'))();
});
describe('application dialogs', () => {
  it('returns the entered reason and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);trigger.focus();
    const result = api.appPrompt('سبب إعادة الفتح', 'سبب سابق');
    await Promise.resolve();
    const input = document.querySelector('textarea')!;
    expect(input.value).toBe('سبب سابق');
    input.value = 'سبب جديد';
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(await result).toBe('سبب جديد');
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('cancels with Escape without approving an operation', async () => {
    const result = api.appConfirm('حذف المستند؟');
    await Promise.resolve();
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await result).toBe(false);
  });
});
