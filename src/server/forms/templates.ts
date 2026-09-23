import { pool } from "@/db";
import type { SecurityContext } from "@/db/queries/security";

const supportedTypes = new Set([
  "text",
  "number",
  "date",
  "select",
  "textarea",
  "employee_picker",
  "department_picker",
  "branch_picker",
  "table",
  "signature",
  "employee_name",
  "employee_number",
  "employee_department",
  "employee_branch",
  "employee_job_title",
  "employee_manager",
  "employee_phone",
  "employee_email",
]);

const employeeBindings: Record<string, string> = {
  emp_name: "employee.full_name",
  emp_no: "employee.employee_number",
  department: "employee.department_name",
  dept: "employee.department_name",
  branch: "employee.branch_name",
  title: "employee.job_title_name",
  job_title: "employee.job_title_name",
  emp_id: "employee.job_title_name",
  manager: "employee.manager_name",
  direct_manager: "employee.manager_name",
  emp_phone: "employee.phone",
  emp_email: "employee.email",
  emp_natid: "employee.national_id",
};

type TemplateInput = {
  template_key: string;
  name: string;
  category: string;
  icon?: string | null;
  description?: string | null;
  definition: Record<string, any>;
};

function normalizedType(raw: unknown) {
  const type = String(raw || "text");
  return supportedTypes.has(type) ? type : "text";
}

/** Keep the render snapshot and the editable relational builder model in one transaction. */
export async function saveFormTemplate(
  context: SecurityContext,
  input: TemplateInput,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const template = await client.query(
      `insert into public.form_templates(
         organization_id,template_key,name,category,icon,description,definition,created_by,updated_by
       ) values($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid,$8::uuid)
       on conflict(organization_id,template_key) do update set
         name=excluded.name,category=excluded.category,icon=excluded.icon,
         description=excluded.description,definition=excluded.definition,
         updated_by=excluded.updated_by,updated_at=now(),active=true
       returning *`,
      [
        context.organizationId,
        input.template_key,
        input.name,
        input.category,
        input.icon || null,
        input.description || null,
        JSON.stringify(input.definition),
        context.user.id,
      ],
    );
    await client.query(
      "delete from public.form_template_sections where template_id=$1::uuid",
      [template.rows[0].id],
    );

    const sections = Array.isArray(input.definition.sections)
      ? input.definition.sections
      : [];
    for (const [sectionIndex, rawSection] of sections.entries()) {
      const section =
        rawSection && typeof rawSection === "object" ? rawSection : {};
      const inserted = await client.query(
        `insert into public.form_template_sections(template_id,title,description,sort_order)
         values($1::uuid,$2,$3,$4) returning id`,
        [
          template.rows[0].id,
          String(section.title || `قسم ${sectionIndex + 1}`),
          section.description ? String(section.description) : null,
          sectionIndex,
        ],
      );
      const fields = Array.isArray(section.fields) ? section.fields : [];
      for (const [fieldIndex, rawField] of fields.entries()) {
        const field = rawField && typeof rawField === "object" ? rawField : {};
        const key = String(field.id || `field_${fieldIndex + 1}`);
        await client.query(
          `insert into public.form_template_fields(
             section_id,field_key,label,field_type,employee_binding,required,options,settings,sort_order
           ) values($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
          [
            inserted.rows[0].id,
            key,
            String(field.label || `حقل ${fieldIndex + 1}`),
            normalizedType(field.type),
            field.employee_binding || employeeBindings[key] || null,
            Boolean(field.req),
            JSON.stringify(Array.isArray(field.opts) ? field.opts : []),
            JSON.stringify(field),
            fieldIndex,
          ],
        );
      }
    }

    if (
      input.definition.itemsTable &&
      typeof input.definition.itemsTable === "object"
    ) {
      const table = input.definition.itemsTable;
      const inserted = await client.query(
        `insert into public.form_template_sections(template_id,title,sort_order)
         values($1::uuid,$2,$3) returning id`,
        [
          template.rows[0].id,
          String(table.title || "البيانات المتكررة"),
          sections.length,
        ],
      );
      await client.query(
        `insert into public.form_template_fields(section_id,field_key,label,field_type,required,settings,sort_order)
         values($1::uuid,'items_table',$2,'table',false,$3::jsonb,0)`,
        [
          inserted.rows[0].id,
          String(table.title || "البيانات المتكررة"),
          JSON.stringify(table),
        ],
      );
    }

    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
       values($1::uuid,$2::uuid,'form.template.save','form_template',$3::uuid,$4::jsonb)`,
      [
        context.organizationId,
        context.user.id,
        template.rows[0].id,
        JSON.stringify({ template_key: input.template_key, name: input.name }),
      ],
    );
    await client.query("commit");
    return template.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
