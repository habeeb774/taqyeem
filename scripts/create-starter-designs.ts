import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db';
import { loadSecurityContext, must } from '../src/db/queries/security';
import { fieldInput, dbFieldValues, templateInput } from '../src/server/designs';
import { uploadDesignAsset, deleteDesignAsset } from '../src/server/design-storage';

type Layer = { key: string; label: string; text: string; y: number; size: number; dynamic?: boolean;
  type?: 'text' | 'textarea' | 'date' | 'employee'; x?: number; width?: number; height?: number; color?: string; weight?: number };
type Starter = { slug: string; name: string; category: string; width: number; height: number;
  variant: 'certificate' | 'spotlight' | 'welcome' | 'promotion' | 'notice' | 'meeting'; layers: Layer[] };

const starters: Starter[] = [
  { slug: 'alsweed-appreciation-v1', name: 'شهادة شكر وتقدير', category: 'شكر وتقدير', width: 1600, height: 1130,
    variant: 'certificate', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 188, size: 28 },
      { key: 'title', label: 'عنوان الشهادة', text: 'شهادة شكر وتقدير', y: 288, size: 78, weight: 700 },
      { key: 'intro', label: 'مقدمة الشهادة', text: 'بكل فخر وامتنان، نُقدّم هذه الشهادة إلى', y: 410, size: 30 },
      { key: 'employee_name', label: 'اسم الموظف', text: '{{employee_name}}', y: 510, size: 64, dynamic: true, type: 'employee' },
      { key: 'achievement', label: 'سبب التكريم', text: '{{achievement}}', y: 650, size: 30, height: 150, dynamic: true, type: 'textarea' },
      { key: 'closing', label: 'العبارة الختامية', text: 'عطاؤكم يصنع الفرق، وبكم نواصل النجاح.', y: 822, size: 28 },
      { key: 'issue_date', label: 'تاريخ الشهادة', text: 'التاريخ: {{issue_date}}', y: 942, size: 24, x: 120, width: 550, dynamic: true, type: 'date' },
      { key: 'signatory', label: 'اسم المسؤول', text: '{{signatory}}', y: 942, size: 24, x: 930, width: 550, dynamic: true },
    ] },
  { slug: 'alsweed-employee-month-v1', name: 'بطاقة موظف الشهر', category: 'مناسبات الموظفين', width: 1080, height: 1350,
    variant: 'spotlight', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 183, size: 27 },
      { key: 'title', label: 'العنوان', text: 'موظف الشهر', y: 314, size: 76, weight: 700 },
      { key: 'month', label: 'الشهر والسنة', text: '{{month}}', y: 424, size: 32, dynamic: true },
      { key: 'employee_name', label: 'اسم الموظف', text: '{{employee_name}}', y: 610, size: 56, dynamic: true, type: 'employee' },
      { key: 'job_title', label: 'المسمى الوظيفي', text: '{{job_title}}', y: 704, size: 28, dynamic: true },
      { key: 'achievement', label: 'إنجاز الموظف', text: '{{achievement}}', y: 836, size: 29, height: 165, dynamic: true, type: 'textarea' },
      { key: 'closing', label: 'العبارة الختامية', text: 'تميّز يستحق التقدير', y: 1162, size: 30, color: '#203DD2' },
    ] },
  { slug: 'alsweed-welcome-v1', name: 'ترحيب بموظف جديد', category: 'مناسبات الموظفين', width: 1080, height: 1350,
    variant: 'welcome', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 183, size: 27 },
      { key: 'title', label: 'العنوان', text: 'أهلًا بك في فريقنا', y: 316, size: 62, weight: 700 },
      { key: 'intro', label: 'الترحيب', text: 'يسعدنا انضمامك إلى عائلة السويد', y: 426, size: 29 },
      { key: 'employee_name', label: 'اسم الموظف', text: '{{employee_name}}', y: 616, size: 54, dynamic: true, type: 'employee' },
      { key: 'job_title', label: 'المسمى الوظيفي', text: '{{job_title}}', y: 720, size: 30, dynamic: true },
      { key: 'department', label: 'الإدارة', text: '{{department}}', y: 797, size: 27, dynamic: true },
      { key: 'closing', label: 'رسالة الترحيب', text: 'بداية جديدة، وطموح مشترك.\nنتطلع إلى نجاحات نصنعها معًا.', y: 966, size: 30, height: 145 },
      { key: 'start_date', label: 'تاريخ الانضمام', text: 'تاريخ الانضمام: {{start_date}}', y: 1186, size: 24, dynamic: true, type: 'date' },
    ] },
  { slug: 'alsweed-promotion-v1', name: 'تهنئة بالترقية', category: 'مناسبات الموظفين', width: 1080, height: 1350,
    variant: 'promotion', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 183, size: 27 },
      { key: 'title', label: 'العنوان', text: 'مبارك الترقية', y: 324, size: 74, weight: 700 },
      { key: 'intro', label: 'مقدمة التهنئة', text: 'خطوة جديدة في رحلة التميّز', y: 439, size: 31 },
      { key: 'employee_name', label: 'اسم الموظف', text: '{{employee_name}}', y: 616, size: 55, dynamic: true, type: 'employee' },
      { key: 'job_title', label: 'المنصب الجديد', text: 'إلى منصب {{job_title}}', y: 747, size: 34, height: 115, dynamic: true },
      { key: 'closing', label: 'التهنئة', text: 'تستحق هذا التقدير على جهودك وعطائك.\nنتمنى لك مزيدًا من النجاح والإنجاز.', y: 960, size: 29, height: 145 },
      { key: 'effective_date', label: 'تاريخ الترقية', text: '{{effective_date}}', y: 1193, size: 24, dynamic: true, type: 'date' },
    ] },
  { slug: 'alsweed-internal-notice-v1', name: 'إعلان داخلي', category: 'مناسبات الشركة', width: 1600, height: 900,
    variant: 'notice', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 83, size: 25, x: 230, width: 1000 },
      { key: 'title', label: 'عنوان الإعلان', text: '{{title}}', y: 225, size: 65, height: 115, dynamic: true },
      { key: 'message', label: 'تفاصيل الإعلان', text: '{{message}}', y: 400, size: 33, height: 200, dynamic: true, type: 'textarea' },
      { key: 'department', label: 'الجهة المصدرة', text: 'صادر عن: {{department}}', y: 723, size: 27, x: 100, width: 680, dynamic: true },
      { key: 'issue_date', label: 'تاريخ الإعلان', text: '{{issue_date}}', y: 723, size: 27, x: 850, width: 650, dynamic: true, type: 'date' },
    ] },
  { slug: 'alsweed-meeting-invitation-v1', name: 'دعوة اجتماع', category: 'مناسبات الشركة', width: 1600, height: 900,
    variant: 'meeting', layers: [
      { key: 'company', label: 'اسم الشركة', text: 'شركة السويد التجارية', y: 83, size: 25, x: 230, width: 1000 },
      { key: 'title', label: 'العنوان', text: 'دعوة اجتماع', y: 221, size: 72, weight: 700 },
      { key: 'subject', label: 'موضوع الاجتماع', text: '{{subject}}', y: 354, size: 42, dynamic: true },
      { key: 'meeting_date', label: 'تاريخ الاجتماع', text: 'التاريخ: {{meeting_date}}', y: 550, size: 29, x: 100, width: 680, dynamic: true, type: 'date' },
      { key: 'meeting_time', label: 'وقت الاجتماع', text: 'الوقت: {{meeting_time}}', y: 550, size: 29, x: 850, width: 650, dynamic: true },
      { key: 'location', label: 'المكان أو رابط الاجتماع', text: 'المكان: {{location}}', y: 650, size: 29, height: 100, dynamic: true },
      { key: 'closing', label: 'رسالة ختامية', text: 'حضوركم ومشاركتكم يصنعان الفرق', y: 803, size: 25 },
    ] },
];

async function background(template: Starter) {
  const { width: w, height: h, variant } = template;
  const logo = (await readFile('public/brand-logo.png')).toString('base64');
  const landscape = w > h;
  const logoX = landscape && variant !== 'certificate' ? w - 170 : w / 2 - 45;
  const logoY = landscape && variant !== 'certificate' ? 54 : 68;
  const border = variant === 'certificate'
    ? `<rect x="34" y="34" width="${w - 68}" height="${h - 68}" rx="12" fill="none" stroke="#203DD2" stroke-width="3"/>
       <rect x="54" y="54" width="${w - 108}" height="${h - 108}" rx="4" fill="none" stroke="#CCD4F5"/>`
    : `<path d="M0 0H${w}V22H0Z" fill="#203DD2"/><path d="M0 ${h - 20}H${w}V${h}H0Z" fill="#203DD2"/>`;
  const ornament = variant === 'spotlight'
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="480" fill="#F2F5FF"/><circle cx="${w / 2}" cy="${h / 2}" r="457" fill="none" stroke="#E0E6FB"/>
       <path d="M110 265l14 30 33 5-24 24 6 34-29-16-30 16 6-34-24-24 34-5Z" fill="#DEB85E"/>
       <path d="M970 1045l10 24 27 4-19 18 5 26-23-13-23 13 5-26-19-18 27-4Z" fill="#DEB85E"/>`
    : variant === 'promotion'
      ? `<path d="M0 1030L${w} 830V${h}H0Z" fill="#F1F4FF"/><path d="M80 480l55-60 55 60" fill="none" stroke="#20B1AF" stroke-width="8"/>
         <path d="M900 950l50-55 50 55" fill="none" stroke="#20B1AF" stroke-width="8"/>`
      : variant === 'welcome'
        ? `<circle cx="-40" cy="720" r="270" fill="#EAF7F6"/><circle cx="${w + 40}" cy="1070" r="300" fill="#F0F3FF"/>
           <path d="M72 480h80M112 440v80" stroke="#20B1AF" stroke-width="6"/>`
        : landscape && variant !== 'certificate'
          ? `<rect x="70" y="360" width="${w - 140}" height="310" rx="24" fill="#F4F6FD"/>
             <path d="M70 173H${w - 70}" stroke="#DCE3FA" stroke-width="2"/><circle cx="-40" cy="${h}" r="190" fill="#EBF7F6"/>`
          : `<path d="M${w / 2 - 250} 465H${w / 2 + 250}" stroke="#D6B76E" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#FFFFFF"/>${ornament}${border}
    <image href="data:image/png;base64,${logo}" x="${logoX}" y="${logoY}" width="90" height="90"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const ownerId = process.argv[2];
  if (!ownerId) throw new Error('Supply the authorized organization administrator ID.');
  const context = await loadSecurityContext(ownerId);
  must(context, 'design_templates.create');
  must(context, 'design_templates.publish');
  const categories = await pool.query('select id,name from design_categories where organization_id=$1 and is_active=true', [context.organizationId]);
  const columns = ['layer_name', 'field_key', 'field_label', 'field_type', 'content', 'default_value', 'placeholder',
    'is_dynamic', 'is_required', 'x', 'y', 'width', 'height', 'font_family', 'font_size', 'font_weight', 'font_color',
    'text_align', 'direction', 'line_height', 'letter_spacing', 'rotation', 'opacity', 'multiline', 'auto_fit',
    'min_font_size', 'max_font_size', 'max_length', 'is_visible', 'is_locked', 'z_index', 'sort_order', 'options'];
  const results = [];
  for (const item of starters) {
    const existing = await pool.query('select id from design_templates where organization_id=$1 and slug=$2 and deleted_at is null',
      [context.organizationId, item.slug]);
    if (existing.rows.length) { results.push({ name: item.name, id: existing.rows[0].id, skipped: true }); continue; }
    const bytes = await background(item);
    const asset = await uploadDesignAsset(new File([new Uint8Array(bytes)], `${item.slug}.png`, { type: 'image/png' }), context.organizationId, 'backgrounds');
    const input = templateInput.parse({ ...item, category_id: categories.rows.find(row => row.name === item.category)?.id,
      background_image_url: asset.url, background_storage_key: asset.key, status: 'published',
      description: 'قالب من مجموعة السويد الإدارية؛ جميع النصوص والمتغيرات قابلة للتعديل.', notes: 'Starter collection v1' });
    const client = await pool.connect();
    try {
      await client.query('begin');
      const created = await client.query(
        `insert into design_templates (organization_id,name,slug,description,category_id,background_image_url,background_storage_key,
          thumbnail_url,thumbnail_storage_key,width,height,status,notes,created_by,updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$6,$7,$8,$9,$10,$11,$12,$12) returning id`,
        [context.organizationId, input.name, item.slug, input.description, input.category_id, asset.url, asset.key,
          item.width, item.height, 'published', input.notes, context.user.id]);
      const id = created.rows[0].id;
      for (const [index, layer] of item.layers.entries()) {
        const value = fieldInput.parse({ layer_name: layer.label, field_key: layer.key, field_label: layer.label,
          field_type: layer.type || 'text', content: layer.text, placeholder: layer.dynamic ? `أدخل ${layer.label}` : null,
          default_value: null, is_dynamic: !!layer.dynamic, is_required: !!layer.dynamic,
          x: layer.x ?? 100, y: layer.y, width: layer.width ?? item.width - 200, height: layer.height ?? layer.size * 1.7,
          font_family: 'Cairo', font_size: layer.size, font_weight: layer.weight ?? (layer.dynamic ? 600 : 400),
          font_color: layer.color || '#18326B', text_align: 'center', direction: 'rtl', line_height: 1.5, letter_spacing: 0,
          rotation: 0, opacity: 1, multiline: true, auto_fit: true, min_font_size: Math.max(18, layer.size * .65),
          max_font_size: layer.size, max_length: layer.type === 'textarea' ? 220 : 100,
          is_visible: true, is_locked: false, z_index: index + 1, sort_order: index + 1, options: [] });
        const values = [id, ...dbFieldValues(value)];
        await client.query(`insert into design_template_fields(template_id,${columns.join(',')})
          values(${values.map((_, n) => `$${n + 1}`).join(',')})`, values);
      }
      await client.query(`insert into audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
        values($1,$2,'design_template.create','design_template',$3,$4::jsonb)`,
        [context.organizationId, context.user.id, id, JSON.stringify({ name: item.name, status: 'published', collection: 'starter-v1', fields: item.layers.length })]);
      await client.query('commit');
      results.push({ name: item.name, id, layers: item.layers.length });
    } catch (error) {
      await client.query('rollback');
      await deleteDesignAsset(asset.key);
      throw error;
    } finally { client.release(); }
  }
  console.log(JSON.stringify(results, null, 2));
}

main().finally(() => pool.end()).catch(error => { console.error(error.message); process.exitCode = 1; });
