import { describe, expect, it, vi } from 'vitest';
import { drawDesignField, loadDesignFonts, type DesignTextField } from './design-renderer';

const field: DesignTextField = {
  content: '{{name}}', x: 40, y: 25, width: 200, height: 100,
  font_family: 'ThSans', font_size: 20, font_weight: 500, font_color: '#123456',
  text_align: 'right', direction: 'rtl', line_height: 1.5, letter_spacing: 2,
  rotation: 0, opacity: 1, multiline: true, auto_fit: false, min_font_size: 10,
  is_visible: true, z_index: 1,
};

function context() {
  return {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    font: '', direction: '', letterSpacing: '',
  };
}

describe('design canvas text layout', () => {
  it('uses the stored distance from the right edge, for both Arabic and English text', () => {
    for (const direction of ['rtl', 'ltr']) {
      const ctx = context();
      drawDesignField(ctx as unknown as CanvasRenderingContext2D, { ...field, direction }, { name: 'حبيب' }, 1000);
      // Field left is 1000 - 40 - 200 = 760; rotation origin is its center.
      expect(ctx.translate).toHaveBeenNthCalledWith(1, 860, 75);
      expect(ctx.translate).toHaveBeenNthCalledWith(2, -100, -50);
      expect(ctx.font).toBe('500 20px "ThSans"');
      expect(ctx.direction).toBe(direction);
      expect(ctx.letterSpacing).toBe('2px');
      expect(ctx.fillText).toHaveBeenCalledWith('حبيب', 200, 0, 200);
    }
  });

  it('preserves entered newlines and blank lines instead of searching for a literal backslash', () => {
    const ctx = context();
    drawDesignField(ctx as unknown as CanvasRenderingContext2D, field, { name: 'أول\r\n\r\nثالث' }, 1000);
    expect(ctx.fillText.mock.calls).toEqual([
      ['أول', 200, 0, 200], ['', 200, 30, 200], ['ثالث', 200, 60, 200],
    ]);
  });

  it('fits long text before drawing and clips it to the same field box', () => {
    const ctx = context();
    ctx.measureText.mockImplementation(() => ({ width: Number(ctx.font.split(' ')[1].replace('px', '')) * 8 }));
    drawDesignField(ctx as unknown as CanvasRenderingContext2D, {
      ...field, width: 100, auto_fit: true, multiline: false,
    }, { name: 'نص طويل' }, 1000);
    expect(ctx.font).toBe('500 12px "ThSans"');
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith('نص طويل', 100, 0, 100);
  });

  it('waits for the used font stylesheet and the exact weight before rendering, and allows retry after failure', async () => {
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve(), load } });
    const fonts = [
      { id: 'used-test', family: 'ThSans', url: '/used-test.css' },
      { id: 'unused-test', family: 'Unused', url: '/unused-test.css' },
    ];
    const first = loadDesignFonts([field], { name: 'حبيب' }, fonts);
    const failure = expect(first).rejects.toThrow('تعذر تحميل خط التصميم');
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('link[data-design-font="unused-test"]')).toBeNull();
    document.querySelector('link[data-design-font="used-test"]')!.dispatchEvent(new Event('error'));
    await failure;
    expect(document.querySelector('link[data-design-font="used-test"]')).toBeNull();
    const second = loadDesignFonts([field], { name: 'حبيب' }, fonts);
    document.querySelector('link[data-design-font="used-test"]')!.dispatchEvent(new Event('load'));
    await second;
    expect(load).toHaveBeenCalledWith('500 20px "ThSans"', 'حبيب');
    document.querySelector('link[data-design-font="used-test"]')!.remove();
  });
});
