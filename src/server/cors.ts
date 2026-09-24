const allowedOrigins = new Set(
  (process.env.PUBLIC_JOBS_SITE_ORIGINS || 'https://jobs.alsweed.sa')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
