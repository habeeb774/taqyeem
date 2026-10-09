// Builds the printable document HTML from a saved form state, without the legacy
// editor's DOM. This is a port of docHtml()/vals()/renderFieldRows()/doPrint()
// in src/templates/forms.html and must produce the same markup, so both share
// public/forms-print.css. Keep the two in sync until the legacy editor is retired.

export type FieldDef = {
  id: string;
  label: string;
  type?: string;
  wide?: boolean;
  req?: boolean;
  options?: string[];
  def?: string;
  employee_binding?: string;
};

export type SectionDef = {
  title?: string;
  fields?: FieldDef[];
  fixed?: string;
  line?: string;
  free?: boolean;
  boxed?: boolean;
};

export type FormDefinition = {
  id?: string;
  name?: string;
  sections?: SectionDef[];
  sections2?: SectionDef[];
  itemsTable?: { title: string; cols: { id: string; label: string; type?: string }[] };
  installments?: boolean;
  pledge?: string;
  delivery?: FieldDef[];
  returnBlock?: { title: string; fields: FieldDef[]; checks?: { label: string; options: string[] } };
};

export type FormState = {
  inputs?: Record<string, string>;
  items?: Record<string, string>[];
  hiddenFields?: Record<string, boolean>;
  labelOverrides?: Record<string, string>;
  extraFields?: Record<string, FieldDef[]>;
  sigs?: string[];
  docTitle?: string;
  docDept?: string;
  font?: string;
  checks?: string[];
  taFontSize?: Record<string, number>;
  clauseExtra?: { id: string; title: string }[];
  clauseRemoved?: Record<string, boolean>;
  clauseSeq?: number;
};

const LOGO_URL = '/brand-logo.png';
const DEFAULT_FONT = "'TSans-Light'";
const FOOTER = { addr: 'بريدة، حي الرفيعة، طريق عمر بن عبدالعزيز', email: 'hr@alsweed.sa', phone: '+966 55 513 6074' };
const PAGE = { top: 14, side: 12, bottom: 14, gap: 8, style: 1 };
const FOOT_MIN = 14;

export function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '';
}

function parseAmount(value: unknown) {
  const digits = String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\d.]/g, '');
  const n = parseFloat(digits);
  return Number.isNaN(n) ? 0 : n;
}

export function formatAmount(n: number) {
  const r = Math.round(n * 100) / 100;
  const s = r % 1 === 0 ? String(r) : r.toFixed(2);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function evenParts(amount: number, count: number) {
  const base = Math.floor((amount / count) * 100) / 100;
  const parts = Array.from({ length: count }, () => base);
  const diff = Math.round((amount - base * count) * 100) / 100;
  if (diff !== 0) parts[count - 1] = Math.round((parts[count - 1] + diff) * 100) / 100;
  return parts;
}

export function computeInstallments(inputs: Record<string, string>) {
  const amount = parseAmount(inputs.f_amount);
  const n = parseInt(String(inputs.f_inst_count || '').replace(/[^\d]/g, ''), 10);
  const count = !n || n < 1 ? 0 : n;
  if (!amount || !count) return { amount, count, parts: [] as number[] };
  if (inputs.f_inst_values) {
    const saved = inputs.f_inst_values.split(',').map(parseAmount);
    if (saved.length === count) return { amount, count, parts: saved };
  }
  return { amount, count, parts: evenParts(amount, count) };
}

type Values = Record<string, { label: string; value: string }>;

/** Builds the inner document markup (the legacy docHtml()). blank=true prints an empty copy. */
export function buildDocumentHtml(
  form: FormDefinition,
  state: FormState,
  options: { formId: string; documentNo?: string; deptFallback?: string; blank?: boolean },
) {
  const inputs = state.inputs || {};
  const hidden = state.hiddenFields || {};
  const overrides = state.labelOverrides || {};
  const extra = state.extraFields || {};
  const fontSizes = state.taFontSize || {};
  const clauseRemoved = state.clauseRemoved || {};
  const blank = Boolean(options.blank);

  const labelOf = (fl: FieldDef) => (overrides[fl.id] !== undefined ? overrides[fl.id] : fl.label);
  const fieldValue = (fl: FieldDef, keepBlank = false): string | null => {
    if (blank && !keepBlank) return '';
    const key = `f_${fl.id}`;
    if (!(key in inputs)) return null;
    let value = inputs[key] || '';
    if (fl.type === 'select' && value === '__manual__') value = inputs[`m_${fl.id}`] || '';
    if (fl.type === 'date') value = formatDate(value);
    return value;
  };

  // Mirrors vals(): visible fields only, in definition order.
  const values: Values = {};
  const collect = (fields?: FieldDef[]) =>
    (fields || []).forEach((fl) => {
      if (hidden[fl.id]) return;
      const value = fieldValue(fl);
      if (value === null) return;
      values[fl.id] = { label: labelOf(fl), value: value || '' };
    });
  (form.sections || []).forEach((s, si) => {
    collect(s.fields);
    collect(extra[`sec${si}`]);
  });
  (form.sections2 || []).forEach((s, si) => {
    collect(s.fields);
    collect(extra[`s2_${si}`]);
  });
  collect(form.delivery);
  if (form.returnBlock) collect(form.returnBlock.fields);

  const label = (fl: FieldDef) => (values[fl.id] ? values[fl.id].label : labelOf(fl));
  const val = (fl: FieldDef) => (values[fl.id] && values[fl.id].value) || '&nbsp;';
  const sizeStyle = (id: string) => {
    const fs = fontSizes[id] || 1;
    return `white-space:pre-wrap;text-align:justify;${fs !== 1 ? `font-size:${fs}em;` : ''}`;
  };

  const fieldRows = (fields: FieldDef[]) => {
    let html = '';
    let i = 0;
    while (i < fields.length) {
      const a = fields[i];
      if (a.wide && a.type !== 'textarea') {
        html += `<tr><td class="lbl">${label(a)}</td><td colspan="3">${val(a)}</td></tr>`;
        i++;
      } else if (a.type === 'textarea') {
        html += `<tr><td class="lbl">${label(a)}</td><td colspan="3" style="${sizeStyle(a.id)}">${val(a)}</td></tr>`;
        i++;
      } else {
        const b = i + 1 < fields.length && fields[i + 1].type !== 'textarea' && !fields[i + 1].wide ? fields[i + 1] : null;
        if (b) {
          html += `<tr><td class="lbl">${label(a)}</td><td>${val(a)}</td><td class="lbl">${label(b)}</td><td>${val(b)}</td></tr>`;
          i += 2;
        } else {
          html += `<tr><td class="lbl">${label(a)}</td><td colspan="3">${val(a)}</td></tr>`;
          i++;
        }
      }
    }
    return html;
  };
  const table = (title: string, fields: FieldDef[], extraRows = '') =>
    `<div class="sec-h">${title}</div><table class="bord"><colgroup><col class="c-l"><col class="c-v"><col class="c-l"><col class="c-v"></colgroup><tbody>${fieldRows(fields)}${extraRows}</tbody></table>`;

  let dateFieldId: string | null = null;
  let dateFieldVal = '';
  for (const id of Object.keys(values)) {
    if (id === 'date' || /_date$/.test(id)) {
      dateFieldId = id;
      dateFieldVal = values[id].value || '';
      break;
    }
  }

  const docNo = options.documentNo || '';
  const dept = state.docDept || options.deptFallback || 'الإدارة';
  const title = state.docTitle || form.name || '';
  const font = state.font || DEFAULT_FONT;

  let html = `<div class="doc doc-${options.formId}" style="font-family:${font}">`;
  const dateChip =
    dateFieldId || docNo
      ? `<div class="hd-date">${dateFieldId ? `<div class="hd-date-val">${dateFieldVal || '__________'}</div>` : ''}${docNo ? `<div class="hd-docno">${docNo}</div>` : ''}</div>`
      : '<div class="hd-date"></div>';
  html += `<div class="hd hd-centered hdst-${PAGE.style}"><div class="hd-row"><div class="hd-dept-wrap"><div class="hd-dept">${dept}</div><div class="hd-company">شركة السويد التجارية</div></div><div class="hd-logo-wrap"><img class="hd-logo" src="${LOGO_URL}" alt=""></div>${dateChip}</div></div>`;
  html += `<div class="doc-title"><h1>${title}</h1></div>`;

  (form.sections || []).forEach((sec, si) => {
    if (sec.fixed) {
      html += `<div class="fixed-txt">${sec.fixed}</div>`;
      return;
    }
    if (sec.line) {
      const lineFields = (sec.fields || []).filter((fl) => fl.id !== dateFieldId);
      html += `<div class="line-txt">${sec.line}${lineFields.map((fl) => `<b>${fieldValue(fl) || '&nbsp;'.repeat(18)}</b>`).join(' ')}</div>`;
      return;
    }
    const all = (sec.fields || []).concat(extra[`sec${si}`] || []);
    if (sec.free) {
      const fld = (sec.fields || [])[0];
      if (fld && !hidden[fld.id]) {
        const text = ((values[fld.id] && values[fld.id].value) || '').replace(
          /^(\s|&nbsp;|<br\s*\/?>|<div>\s*(<br\s*\/?>)?\s*<\/div>|<p>\s*(<br\s*\/?>)?\s*<\/p>)+/i,
          '',
        );
        if (sec.boxed) {
          if (clauseRemoved[fld.id]) return;
          html += `<div class="clause-box"><div class="clause-h">${sec.title}</div><div class="clause-b" style="${sizeStyle(fld.id)}">${text || '&nbsp;'}</div></div>`;
        } else {
          html += `<div class="free-print" style="${sizeStyle(fld.id)}">${text || '&nbsp;'}</div>`;
        }
      }
      return;
    }
    const visible = all.filter((fl) => !hidden[fl.id] && fl.id !== dateFieldId);
    if (visible.length) html += table(sec.title || '', visible);
  });

  const hasBoxedClauses = (form.sections || []).some((s) => s.free && s.boxed);
  if (hasBoxedClauses) {
    (state.clauseExtra || []).forEach((c) => {
      if (hidden[c.id]) return;
      const text = fieldValue({ id: c.id, label: '' }, true) || '';
      html += `<div class="clause-box"><div class="clause-h">${c.title}</div><div class="clause-b" style="${sizeStyle(c.id)}">${text || '&nbsp;'}</div></div>`;
    });
  }

  if (form.itemsTable) {
    const dateCols = new Set(form.itemsTable.cols.filter((c) => c.type === 'date').map((c) => c.id));
    const items = blank
      ? []
      : (state.items || []).filter((row) => Object.values(row).some((v) => v && String(v).trim()));
    html += `<div class="sec-h">${form.itemsTable.title}</div><table class="bord"><thead><tr>${form.itemsTable.cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>`;
    if (items.length) {
      items.forEach((row) => {
        html += `<tr>${form.itemsTable!.cols
          .map((c) => {
            let v = row[c.id] || '';
            if (dateCols.has(c.id)) v = formatDate(v);
            return `<td>${v || '&nbsp;'}</td>`;
          })
          .join('')}</tr>`;
      });
    } else {
      for (let r = 0; r < 3; r++) html += `<tr>${form.itemsTable.cols.map(() => '<td>&nbsp;</td>').join('')}</tr>`;
    }
    html += '</tbody></table>';
  }

  (form.sections2 || []).forEach((sec, si) => {
    const all = (sec.fields || []).concat(extra[`s2_${si}`] || []);
    const visible = all.filter((fl) => !hidden[fl.id] && fl.id !== dateFieldId);
    if (visible.length) html += table(sec.title || '', visible);
  });

  if (form.installments && !blank) {
    const r = computeInstallments(inputs);
    if (r.parts.length) {
      const total = Math.round(r.parts.reduce((a, b) => a + b, 0) * 100) / 100;
      html += '<div class="sec-h">جدول الدفعات</div>';
      html += `<table class="bord inst-tbl"><tbody><tr><td class="lbl">إجمالي المبلغ</td><td>${formatAmount(r.amount)} ريال</td><td class="lbl">عدد الدفعات</td><td>${r.count}</td></tr></tbody></table>`;
      html += '<table class="bord inst-tbl"><tbody>';
      for (let s = 0; s < r.parts.length; s += 6) {
        const chunk = r.parts.slice(s, s + 6);
        html += `<tr>${chunk.map((_, k) => `<td class="lbl">الدفعة ${s + k + 1}</td>`).join('')}</tr>`;
        html += `<tr>${chunk.map((p) => `<td>${formatAmount(p)}</td>`).join('')}</tr>`;
      }
      html += '</tbody></table>';
      if (Math.round(r.amount * 100) / 100 !== total) html += `<div class="inst-note">مجموع الدفعات ${formatAmount(total)} ريال</div>`;
    }
  }

  if (form.pledge) {
    const saved = inputs.f_pledge_text;
    const text = !blank && saved && saved.trim() ? saved : form.pledge;
    html += `<div class="sec-h">تعهد وإقرار</div><div class="pledge">${text}</div>`;
  }

  if (form.delivery) {
    const visible = form.delivery.filter((fl) => !hidden[fl.id] && fl.id !== dateFieldId);
    if (visible.length) html += table('بيانات التسليم', visible);
  }

  if (form.returnBlock) {
    const visible = form.returnBlock.fields.filter((fl) => !hidden[fl.id] && fl.id !== dateFieldId);
    const checks = form.returnBlock.checks;
    if (visible.length || checks) {
      let checkRow = '';
      if (checks) {
        const ticked = new Set(blank ? [] : (state.checks || []).map((id) => checks.options[Number(id.replace('chk_', ''))]));
        const opts = checks.options.map((o) => `${ticked.has(o) ? '☑' : '☐'} ${o}`).join('&nbsp;&nbsp;&nbsp;');
        checkRow = `<tr><td class="lbl">${checks.label}</td><td colspan="3">${opts}</td></tr>`;
      }
      html += table(form.returnBlock.title, visible, checkRow);
    }
  }

  const sigs = (state.sigs || []).filter((s) => s && s.trim());
  if (sigs.length) html += `<div class="sig-s">${sigs.map((s) => `<div class="sig-b"><div class="sig-l">${s}</div></div>`).join('')}</div>`;

  return `${html}</div>`;
}

function footerHtml() {
  return `<div class="pp-foot hdst-${PAGE.style}"><div class="pp-foot-addr">${FOOTER.addr}</div><div class="pp-foot-contact" dir="ltr">${FOOTER.phone} &nbsp;|&nbsp; ${FOOTER.email}</div></div>`;
}

function pageCss() {
  const bottom = Math.max(PAGE.bottom, FOOT_MIN);
  const gap = PAGE.gap;
  return (
    `@page{size:A4 portrait;margin:0;}html,body{margin:0;padding:0;background:#fff;}` +
    `.pp-top{height:${PAGE.top}mm;}#pp-fit{padding:0 ${PAGE.side}mm 0;}.pp-bot{height:${bottom}mm;}` +
    `.pp-foot-fixed{position:fixed;bottom:4mm;left:${PAGE.side}mm;right:${PAGE.side}mm;}` +
    `.doc table{margin-bottom:${gap}px;}.doc .clause-box{margin:${Math.round(gap * 0.9)}px 0;}.doc .sec-h{margin-top:${Math.round(gap * 1.5)}px;}` +
    `table{margin-bottom:${gap}px;}.clause-box{margin:${Math.round(gap * 0.9)}px 0;}.sec-h{margin-top:${Math.round(gap * 1.5)}px;}` +
    '.pp-sheet{width:100%;border-collapse:collapse;border:0;}.pp-sheet>thead{display:table-header-group;}.pp-sheet>tfoot{display:table-footer-group;}' +
    '.pp-sheet>thead>tr>td,.pp-sheet>tfoot>tr>td,.pp-sheet>tbody>tr>td{border:0;padding:0;background:none;vertical-align:top;text-align:right;font-size:initial;}' +
    '.pp-sheet,.pp-sheet>tbody,.pp-sheet>tbody>tr,.pp-sheet>tbody>tr>td{page-break-inside:auto;break-inside:auto;}' +
    '.doc{width:100%;}.free-print{orphans:3;widows:3;}.hd,.doc-title{page-break-after:avoid;break-after:avoid;}' +
    '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}'
  );
}

/** Full standalone HTML page for a document (the legacy doPrint() frame contents). */
export function buildPrintPage(inner: string, title: string) {
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'مستند';
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${safeTitle}</title><link rel="stylesheet" href="/forms-print.css"><style>${pageCss()}</style></head><body><div class="pp-foot-fixed">${footerHtml()}</div><div id="pp-fit"><table class="pp-sheet"><thead><tr><td class="pp-top"></td></tr></thead><tfoot><tr><td class="pp-bot"></td></tr></tfoot><tbody><tr><td>${inner}</td></tr></tbody></table></div></body></html>`;
}

/** Prints a page built by buildPrintPage through a hidden iframe, after its fonts and CSS load. */
export function printPage(page: string) {
  document.getElementById('printFrame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'printFrame';
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', border: '0', width: '794px', height: '1123px', background: '#fff' });
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(page);
  doc.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  frame.contentWindow!.addEventListener('load', () => {
    (doc.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150));
  });
  setTimeout(go, 5000);
}
