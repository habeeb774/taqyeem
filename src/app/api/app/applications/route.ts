import { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { createApplication, listApplicationsForAdmin } from '@/server/recruitment/applications';

export const dynamic = 'force-dynamic';

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

const attempts = new Map<string, { count: number; resetAt: number }>();

function checkLimit(key: string, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function clientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    if (checkLimit(`application-submit:${clientIp(request)}`, 8)) {
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

    return jsonOk({ reference_number: application.reference_number, id: application.id });
  } catch (error) {
    return jsonFail(error);
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
