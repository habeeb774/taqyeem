import { readFileSync } from "node:fs";
import { Client } from "@neondatabase/serverless";

const envText = readFileSync(".env.local", "utf8");
const databaseUrlLine = envText
  .split(/\r?\n/)
  .find((line) => line.startsWith("DATABASE_URL="));
const databaseUrl = databaseUrlLine
  ?.slice("DATABASE_URL=".length)
  .replace(/^"|"$/g, "");
if (!databaseUrl) throw new Error("DATABASE_URL is missing from .env.local");
const db = new Client({ connectionString: databaseUrl });
function check(value, message) {
  if (!value) throw new Error(message);
}
async function main() {
  await db.connect();
  try {
    const tables = [
      "design_categories",
      "design_templates",
      "design_template_fields",
      "design_fonts",
      "generated_designs",
    ];
    const t = await db.query(
      `select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])`,
      [tables],
    );
    check(
      t.rows.length === tables.length,
      `Missing design tables: ${tables.filter((x) => !t.rows.some((r) => r.table_name === x)).join(", ")}`,
    );
    const columns = await db.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name='design_template_fields'`,
    );
    for (const name of [
      "layer_name",
      "field_key",
      "content",
      "font_family",
      "x",
      "y",
      "width",
      "height",
      "z_index",
      "options",
    ])
      check(
        columns.rows.some((r) => r.column_name === name),
        `Missing design field column: ${name}`,
      );
    const constraints = await db.query(
      `select constraint_name from information_schema.table_constraints where table_schema='public' and table_name in ('design_templates','design_template_fields')`,
    );
    check(
      constraints.rows.some(
        (r) => r.constraint_name === "design_template_fields_template_key_uq",
      ),
      "Missing unique field-key constraint",
    );
    const indexes = await db.query(
      `select indexname from pg_indexes where schemaname='public' and tablename=any($1::text[])`,
      [["design_templates", "design_template_fields", "generated_designs"]],
    );
    for (const name of [
      "design_templates_org_status_idx",
      "design_template_fields_template_order_idx",
      "generated_designs_org_created_idx",
    ])
      check(
        indexes.rows.some((r) => r.indexname === name),
        `Missing index: ${name}`,
      );
    const required = [
      "design_templates.view",
      "design_templates.create",
      "design_templates.edit",
      "design_templates.delete",
      "design_templates.publish",
      "design_templates.use",
      "design_templates.export",
      "design_templates.manage_fields",
      "design_templates.manage_fonts",
      "design_templates.manage_categories",
      "generated_designs.view",
    ];
    const p = await db.query(
      `select code from public.permissions where code=any($1::text[])`,
      [required],
    );
    check(p.rows.length === required.length, "Missing design permissions");
    const fonts = await db.query(
      `select count(*)::int count,count(*) filter(where family='Alexandria' and is_default=true)::int defaults from public.design_fonts`,
    );
    check(Number(fonts.rows[0].count) >= 8, "Default font seed is incomplete");
    check(
      Number(fonts.rows[0].defaults) >= 1,
      "Alexandria is not the default font",
    );
    const categories = await db.query(
      `select count(*)::int count from public.design_categories where is_active=true`,
    );
    check(Number(categories.rows[0].count) >= 6, "Category seed is incomplete");
    const organization = await db.query(
      `select id from public.organizations order by created_at limit 1`,
    );
    if (organization.rows[0]) {
      const args = [organization.rows[0].id, false, [], [], false, null, null];
      const scopeSql = `(
        $2::boolean
        or (cardinality($3::uuid[]) > 0 and e.branch_id = any($3::uuid[]))
        or (cardinality($4::uuid[]) > 0 and e.department_id = any($4::uuid[]))
        or (
          $5::boolean
          and exists(
            select 1
            from public.evaluation_assignments a
            where a.employee_id = e.id
              and a.evaluator_user_id = $6::uuid
          )
        )
        or (
          $7::uuid is not null
          and (e.id = $7::uuid or e.manager_id = $7::uuid or e.supervisor_id = $7::uuid)
        )
      )`;
      await Promise.all([
        db.query(
          `select distinct d.id
           from public.departments d
           left join public.employees e on e.department_id = d.id and e.deleted_at is null
           where d.organization_id = $1::uuid
             and d.active = true
             and (
               d.id = any($4::uuid[])
               or exists(
                 select 1
                 from public.employees e
                 where e.department_id = d.id
                   and e.organization_id = $1::uuid
                   and e.deleted_at is null
                   and ${scopeSql}
               )
             )`,
          args,
        ),
        db.query(
          `select distinct b.id
           from public.branches b
           left join public.employees e on e.branch_id = b.id and e.deleted_at is null
           where b.organization_id = $1::uuid
             and b.active = true
             and (
               b.id = any($3::uuid[])
               or exists(
                 select 1
                 from public.departments d
                 where d.branch_id = b.id and d.id = any($4::uuid[])
               )
               or exists(
                 select 1
                 from public.employees e
                 where e.branch_id = b.id
                   and e.organization_id = $1::uuid
                   and e.deleted_at is null
                   and ${scopeSql}
               )
             )`,
          args,
        ),
        db.query(
          `select distinct j.id
           from public.job_titles j
           join public.employees e on e.job_title_id = j.id and e.deleted_at is null
           where j.organization_id = $1::uuid
             and e.organization_id = $1::uuid
             and j.active = true
             and ${scopeSql}`,
          args,
        ),
      ]);
    }
    console.log(
      "PASS design schema: 5 tables, dynamic fields, constraints, indexes, permissions, categories, and Alexandria font seed.",
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
