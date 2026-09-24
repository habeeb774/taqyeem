import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { corsHeaders } from '@/server/cors';
import { createApplication, listApplicationsForAdmin } from '@/server/recruitment/applications';
import { checkRateLimit, clientIp } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

const applicationSchema = z.object({
  job_id: z.string().uuid().nullable().optional(),
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(6).max(40),
  city: z.string().trim().max(120).nullable().optional(),
  years_experience: z.coerce.number().int().min(0).max(60).nullable().optional(),
  linkedin_url: z.string().trim().url().max(300).nullable().optional().or(z.literal('')),
  cover_letter: z.string().trim().max(4000).nullable().optional(),
  consent: z.coerce.boolean(),
});

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    if (checkRateLimit(`application-submit:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
      throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
    }

    const formData = await request.formData();
    const cvFile = formData.get('cv');
    if (!(cvFile instanceof File)) {
      throw Object.assign(new Error('CV_REQUIRED'), { status: 400 });
    }

    const value = applicationSchema.parse({
      job_id: formData.get('job_id') || null,
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      city: formData.get('city') || null,
      years_experience: formData.get('years_experience') || null,
      linkedin_url: formData.get('linkedin_url') || null,
      cover_letter: formData.get('cover_letter') || null,
      consent: formData.get('consent'),
    });

    const application = await createApplication(
      {
        jobId: value.job_id,
        fullName: value.full_name,
        email: value.email,
        phone: value.phone,
        city: value.city,
        yearsExperience: value.years_experience,
        linkedinUrl: value.linkedin_url || null,
        coverLetter: value.cover_letter,
        consent: value.consent,
      },
      cvFile,
    );

    return jsonOk({ reference_number: application.reference_number, id: application.id }, { headers });
  } catch (error) {
    const err = error as { message?: string; referenceNumber?: string; applicationStatus?: string };
    if (err?.message === 'DUPLICATE_APPLICATION' && err.referenceNumber) {
      return jsonOk(
        { duplicate: true, reference_number: err.referenceNumber, status: err.applicationStatus },
        { headers },
      );
    }
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    const query = request.nextUrl.searchParams;
    const result = await listApplicationsForAdmin(context, {
      search: query.get('q') || '',
      status: query.get('status') || '',
      jobId: query.get('job_id') || undefined,
      limit: Number(query.get('limit') || 25),
      offset: Number(query.get('offset') || 0),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}
