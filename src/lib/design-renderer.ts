export type DesignTextField = {
  content: string;
  is_dynamic?: boolean;
  field_key?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_family: string;
  font_size: number;
  font_weight: number;
  font_color: string;
  text_align: 'left' | 'center' | 'right';
  direction: string;
  line_height: number;
  letter_spacing: number;
  rotation: number;
  opacity: number;
  multiline: boolean;
  auto_fit: boolean;
  min_font_size: number;
  max_length?: number;
  is_visible: boolean;
  z_index: number;
};

export function replaceDesignText(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

function fieldText(field: DesignTextField, values: Record<string, string>) {
  if (field.is_dynamic && field.field_key && !/{{\s*[a-zA-Z][a-zA-Z0-9_.-]*\s*}}/.test(field.content)) {
    return values[field.field_key] ?? field.content;
  }
  return replaceDesignText(field.content, values);
}

export async function loadDesignFonts(
  fields: DesignTextField[],
  values: Record<string, string>,
  fonts: { id: string; family: string; url?: string }[],
) {
  const usedFonts = fonts.filter(font => font.url && fields.some(field => field.is_visible && field.font_family === font.family));
  await Promise.all(usedFonts.map(font => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-design-font="${font.id}"]`);
    if (existing?.sheet) return Promise.resolve();
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.url!;
    link.dataset.designFont = font.id;
    return new Promise<void>((resolve, reject) => {
      const finish = (success: boolean) => {
        clearTimeout(timeout);
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
        if (success) resolve();
        else {
          link.remove();
          reject(new Error('تعذر تحميل خط التصميم. أعد المحاولة.'));
        }
      };
      const loaded = () => finish(true);
      const failed = () => finish(false);
      const timeout = setTimeout(failed, 10000);
      link.addEventListener('load', loaded, { once: true });
      link.addEventListener('error', failed, { once: true });
      if (!existing) document.head.appendChild(link);
    });
  }));
  await document.fonts.ready;
  await Promise.all(fields.filter(field => field.is_visible).map(field =>
    document.fonts.load(`${field.font_weight} ${field.font_size}px "${field.font_family}"`, fieldText(field, values)),
  ));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, multiline: boolean) {
  if (!multiline) return [text.replace(/\r?\n/g, ' ')];
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export function drawDesignField(
  ctx: CanvasRenderingContext2D,
  field: DesignTextField,
  values: Record<string, string>,
  canvasWidth: number,
) {
  let text = fieldText(field, values);
  if (field.max_length) text = text.slice(0, field.max_length);
  ctx.save();
  ctx.globalAlpha = field.opacity;
  // Stored x is the distance from the right edge, including in the editor.
  ctx.translate(canvasWidth - field.x - field.width / 2, field.y + field.height / 2);
  ctx.rotate(field.rotation * Math.PI / 180);
  ctx.translate(-field.width / 2, -field.height / 2);
  ctx.beginPath();
  ctx.rect(0, 0, field.width, field.height);
  ctx.clip();
  ctx.direction = field.direction === 'ltr' ? 'ltr' : 'rtl';
  ctx.letterSpacing = `${field.letter_spacing}px`;
  let size = field.font_size;
  ctx.font = `${field.font_weight} ${size}px "${field.font_family}"`;
  let lines = wrap(ctx, text, field.width, field.multiline);
  if (field.auto_fit) {
    while (size > field.min_font_size && (
      lines.length * size * field.line_height > field.height ||
      lines.some(line => ctx.measureText(line).width > field.width)
    )) {
      size -= 1;
      ctx.font = `${field.font_weight} ${size}px "${field.font_family}"`;
      lines = wrap(ctx, text, field.width, field.multiline);
    }
  }
  ctx.fillStyle = field.font_color;
  ctx.textAlign = field.text_align;
  ctx.textBaseline = 'top';
  const x = field.text_align === 'center' ? field.width / 2 : field.text_align === 'left' ? 0 : field.width;
  lines.forEach((line, index) => ctx.fillText(line, x, index * size * field.line_height, field.width));
  ctx.restore();
}

export function createDesignCanvas(
  width: number,
  height: number,
  background: HTMLImageElement,
  fields: DesignTextField[],
  values: Record<string, string>,
  format: 'png' | 'jpg',
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر رسم التصميم في هذا المتصفح.');
  if (format === 'jpg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(background, 0, 0, width, height);
  for (const field of [...fields].sort((a, b) => a.z_index - b.z_index)) {
    if (field.is_visible) drawDesignField(ctx, field, values, width);
  }
  return canvas;
}
