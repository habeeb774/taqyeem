import { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import {
  convertCandidateToEmployee,
  createCandidate,
  listCandidates,
} from '@/server/forms/candidates';

const nullableUuid = z.string().uuid().nullable().optional();

const createCandidateSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  status: z.enum(['active', 'hired', 'rejected', 'archived']).optional(),
  employee_id: nullableUuid,
});

const convertCandidateSchema = z.object({
  action: z.literal('convert_to_employee'),
  candidate_id: z.string().uuid(),
  job_title_id: nullableUuid,
  branch_id: nullableUuid,
  department_id: nullableUuid,
  manager_id: nullableUuid,
  supervisor_id: nullableUuid,
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    const query = request.nextUrl.searchParams;
    const result = await listCandidates(context, {
      search: query.get('q') || '',
      limit: Number(query.get('limit') || 25),
      offset: Number(query.get('offset') || 0),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser();
    const value = createCandidateSchema.parse(await request.json());
    const candidate = await createCandidate(context, {
      fullName: value.full_name,
      email: value.email,
      phone: value.phone,
      status: value.status,
      employeeId: value.employee_id,
    });
    return jsonOk({ candidate });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireUser();
    const value = convertCandidateSchema.parse(await request.json());
    const result = await convertCandidateToEmployee(context, {
      candidateId: value.candidate_id,
      jobTitleId: value.job_title_id,
      branchId: value.branch_id,
      departmentId: value.department_id,
      managerId: value.manager_id,
      supervisorId: value.supervisor_id,
      hireDate: value.hire_date,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}
