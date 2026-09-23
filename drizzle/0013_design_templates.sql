create table if not exists public.design_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_categories_org_slug_uq unique (organization_id, slug)
);

create table if not exists public.design_fonts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  family text not null,
  source text not null default 'system',
  url text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_fonts_org_family_uq unique (organization_id, family)
);

create unique index if not exists design_fonts_one_default_uq
  on public.design_fonts(organization_id) where is_default = true and is_active = true;

create table if not exists public.design_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  slug text not null,
  description text,
  category_id uuid references public.design_categories(id),
  background_image_url text,
  background_storage_key text,
  thumbnail_url text,
  thumbnail_storage_key text,
  width integer not null,
  height integer not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  notes text,
  created_by uuid not null references public.users(id),
  updated_by uuid not null references public.users(id),
  usage_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint design_templates_size_ck check (width between 100 and 12000 and height between 100 and 12000),
  constraint design_templates_org_slug_uq unique (organization_id, slug)
);

create table if not exists public.design_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.design_templates(id) on delete cascade,
  layer_name text not null,
  field_key text not null,
  field_label text not null,
  field_type text not null default 'text' check (field_type in ('text','textarea','number','date','select','employee','department','branch','job_title','custom')),
  content text not null default 'نص جديد',
  default_value text,
  placeholder text,
  is_dynamic boolean not null default false,
  is_required boolean not null default false,
  x numeric(12,4) not null default 40,
  y numeric(12,4) not null default 40,
  width numeric(12,4) not null default 360,
  height numeric(12,4) not null default 80,
  font_family text not null default 'Alexandria',
  font_size numeric(8,2) not null default 32,
  font_weight integer not null default 400,
  font_color text not null default '#111827',
  text_align text not null default 'center' check (text_align in ('left','center','right')),
  direction text not null default 'rtl' check (direction in ('rtl','ltr','auto')),
  line_height numeric(8,3) not null default 1.4,
  letter_spacing numeric(8,3) not null default 0,
  rotation numeric(8,3) not null default 0,
  opacity numeric(5,4) not null default 1,
  multiline boolean not null default true,
  auto_fit boolean not null default true,
  min_font_size numeric(8,2) not null default 10,
  max_font_size numeric(8,2) not null default 200,
  max_length integer,
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  z_index integer not null default 1,
  sort_order integer not null default 1,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_template_fields_template_key_uq unique (template_id, field_key),
  constraint design_template_fields_geometry_ck check (width > 0 and height > 0 and opacity between 0 and 1)
);

create table if not exists public.generated_designs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_id uuid not null references public.design_templates(id),
  generated_by uuid not null references public.users(id),
  employee_id uuid references public.employees(id),
  generated_data jsonb not null default '{}'::jsonb,
  image_url text,
  image_storage_key text,
  image_format text not null check (image_format in ('png','jpg','jpeg')),
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now()
);

create index if not exists design_templates_org_status_idx on public.design_templates(organization_id,status,updated_at desc) where deleted_at is null;
create index if not exists design_templates_category_idx on public.design_templates(category_id) where deleted_at is null;
create index if not exists design_templates_created_by_idx on public.design_templates(created_by) where deleted_at is null;
create index if not exists design_template_fields_template_order_idx on public.design_template_fields(template_id,z_index,sort_order);
create index if not exists generated_designs_org_created_idx on public.generated_designs(organization_id,created_at desc);
create index if not exists generated_designs_template_idx on public.generated_designs(template_id);
create index if not exists generated_designs_employee_idx on public.generated_designs(employee_id) where employee_id is not null;

insert into public.permissions(code,name_ar,description)
values
 ('design_templates.view','عرض قوالب التصاميم','عرض قائمة القوالب'),
 ('design_templates.create','إنشاء قوالب التصاميم','إنشاء قالب جديد'),
 ('design_templates.edit','تعديل قوالب التصاميم','تعديل بيانات وتصميم القالب'),
 ('design_templates.delete','حذف قوالب التصاميم','أرشفة وحذف القوالب'),
 ('design_templates.publish','نشر قوالب التصاميم','نشر القالب للاستخدام'),
 ('design_templates.use','استخدام قوالب التصاميم','تعبئة القوالب وإنشاء تصميم'),
 ('design_templates.export','تصدير التصاميم','تصدير PNG وJPG'),
 ('design_templates.manage_fields','إدارة طبقات التصميم','إضافة وحذف وترتيب النصوص'),
 ('design_templates.manage_fonts','إدارة خطوط التصاميم','إدارة الخطوط المتاحة'),
 ('design_templates.manage_categories','إدارة تصنيفات التصاميم','إدارة التصنيفات'),
 ('generated_designs.view','عرض سجل التصاميم','عرض التصاميم الصادرة')
on conflict(code) do update set name_ar=excluded.name_ar,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('super_admin','hr_admin') and p.code like 'design_templates.%' or r.code in ('super_admin','hr_admin') and p.code='generated_designs.view'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('employee','evaluator','supervisor','department_manager','branch_manager')
  and p.code in ('design_templates.view','design_templates.use','design_templates.export')
on conflict do nothing;

insert into public.design_categories(organization_id,name,slug,description)
select o.id,v.name,v.slug,v.description from public.organizations o cross join (values
 ('مناسبات الموظفين','employee-events','تهنئة وترقية وزواج ومولود وتخرج'),
 ('مناسبات الشركة','company-events','مناسبات وهوية الشركة'),
 ('مناسبات وطنية','national-events','اليوم الوطني ويوم التأسيس'),
 ('مناسبات دينية','religious-events','رمضان والأعياد'),
 ('شكر وتقدير','appreciation','بطاقات الشكر والتقدير'),
 ('مخصصة','custom','قوالب مخصصة')
) as v(name,slug,description)
on conflict(organization_id,slug) do nothing;

insert into public.design_fonts(organization_id,name,family,source,url,is_default)
select o.id,v.name,v.family,v.source,v.url,v.is_default from public.organizations o cross join (values
 ('Alexandria','Alexandria','google','https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700;800&display=swap',true),
 ('Cairo','Cairo','google','https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap',false),
 ('Tajawal','Tajawal','google','https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap',false),
 ('IBM Plex Sans Arabic','IBM Plex Sans Arabic','google','https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap',false),
 ('Noto Kufi Arabic','Noto Kufi Arabic','google','https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@300;400;500;600;700&display=swap',false),
 ('Noto Naskh Arabic','Noto Naskh Arabic','google','https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap',false),
 ('Tahoma','Tahoma','system',null,false),
 ('Arial','Arial','system',null,false)
) as v(name,family,source,url,is_default)
on conflict(organization_id,family) do nothing;
