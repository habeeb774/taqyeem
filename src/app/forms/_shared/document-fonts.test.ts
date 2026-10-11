import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOC_FONTS, resolveDocumentFont } from './document-fonts';
import { buildDocumentHtml, buildPrintPage } from './document';

const css = readFileSync('public/forms-print.css', 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);

describe('document fonts', () => {
  it.each(DOC_FONTS)('loads %s from a real font resource', (family) => {
    const definitions = faces.filter((face) => face.includes(`font-family:${family};`));
    expect(definitions.length).toBeGreaterThan(0);
    for (const face of definitions) {
      const url = /src:url\('([^']+)'\)/.exec(face)?.[1];
      expect(url).toBeTruthy();
      if (url!.startsWith('data:')) continue;
      expect(url).toMatch(/^\/fonts\/forms\//);
      const bytes = readFileSync(`public${url}`);
      expect(bytes.subarray(0, 4).toString()).toBe('OTTO');
    }
  });

  it.each(DOC_FONTS)('keeps %s in the preview and print document', (family) => {
    const html = buildDocumentHtml({ name: 'اختبار', sections: [] }, { font: family }, { formId: 'test' });
    expect(html).toContain(`style="font-family:${family}"`);
    expect(buildPrintPage(html, 'اختبار')).toContain('/forms-print.css');
    expect(resolveDocumentFont(family)).toBe(family);
  });

  it('resolves unavailable old weights to an available family', () => {
    expect(resolveDocumentFont("'TDisp-Bold'")).toBe("'TDisp-Regular'");
    expect(resolveDocumentFont("'TText-Light'")).toBe("'TText-Medium'");
    expect(resolveDocumentFont()).toBe("'TSans-Light'");
    expect(resolveDocumentFont('unknown')).toBe("'TSans-Light'");
  });

  it('never publishes a Windows file path as a font URL', () => {
    expect(css).not.toContain('C:/');
    expect(readFileSync('src/templates/forms.html', 'utf8')).not.toContain('C:/Program Files/Git/fonts');
  });
});
