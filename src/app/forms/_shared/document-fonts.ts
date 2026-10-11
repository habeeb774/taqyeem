// Offer only families backed by real files in forms-print.css.
export const DOC_FONTS: [string, string][] = [
  ["'TSans-Light'", 'Sans خفيف'],
  ["'TSans-Regular'", 'Sans عادي'],
  ["'TSans-Medium'", 'Sans متوسط'],
  ["'TSans-Bold'", 'Sans عريض'],
  ["'TSans-Black'", 'Sans أسود'],
  ["'TDisp-Light'", 'Serif Display خفيف'],
  ["'TDisp-Regular'", 'Serif Display عادي'],
  ["'TText-Medium'", 'Serif Text متوسط'],
  ["'TText-Bold'", 'Serif Text عريض'],
  ["'TText-Black'", 'Serif Text أسود'],
  ["'Alexandria'", 'Alexandria'],
];

// Older drafts offered these weights without including their font files.
const legacyFonts: Record<string, string> = {
  "'TDisp-Medium'": "'TDisp-Regular'",
  "'TDisp-Bold'": "'TDisp-Regular'",
  "'TDisp-Black'": "'TDisp-Regular'",
  "'TText-Light'": "'TText-Medium'",
  "'TText-Regular'": "'TText-Medium'",
};

export function resolveDocumentFont(font?: string): string {
  if (DOC_FONTS.some(([family]) => family === font)) return font!;
  return (font && legacyFonts[font]) || DOC_FONTS[0][0];
}
