const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd(), 'src/app/api/app');
const publicAuthRoutes = new Set([
  'auth/login/route.ts',
  'auth/logout/route.ts',
  'auth/status/route.ts',
  'auth/setup/route.ts',
  'auth/password-reset/route.ts',
  // Public recruitment listings: published jobs are meant for anonymous candidates.
  'jobs/route.ts',
  'jobs/[slug]/route.ts',
  // Public recruitment page copy/settings, consumed cross-origin by the public jobs site.
  'jobs/settings/route.ts',
  // Public recruitment page images (sidebar/detail), served without auth like a static asset.
  'jobs/images/[...key]/route.ts',
  // Public application status lookup; requires the caller to know both the reference number and the email on file.
  'applications/track/route.ts',
]);
const selfServiceRoutes = new Set([
  'auth/me/route.ts',
  'notifications/route.ts',
  'portal/route.ts',
]);
const delegatedGuardRoutes = new Map([
  ['candidates/route.ts', ['listCandidates(', 'createCandidate(', 'convertCandidateToEmployee(']],
  // POST is a public, rate-limited application submission by design; GET (admin listing) is guarded via listApplicationsForAdmin(.
  ['applications/route.ts', ['listApplicationsForAdmin(']],
  ['applications/[id]/route.ts', ['getApplicationForAdmin(']],
  ['applications/[id]/cv/route.ts', ['getApplicationCvForAdmin(']],
  ['applications/[id]/notes/route.ts', ['addApplicationNote(']],
  ['applications/[id]/status/route.ts', ['changeApplicationStatus(']],
  ['recruitment/dashboard/route.ts', ['getRecruitmentDashboard(']],
  ['recruitment/jobs/route.ts', ['listJobsForAdmin(', 'createJob(']],
  ['recruitment/jobs/[id]/route.ts', ['getJobForAdmin(', 'updateJob(']],
  ['recruitment/jobs/[id]/status/route.ts', ['changeJobStatus(']],
  ['recruitment/jobs/[id]/duplicate/route.ts', ['duplicateJob(']],
  ['recruitment/settings/route.ts', ['getRecruitmentSettingsForAdmin(', 'updateRecruitmentSettings(']],
  ['recruitment/notifications/route.ts', ['getNotificationSettingsForAdmin(', 'updateNotificationSettings(']],
]);
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full = path.join(dir, entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}
const files = walk(root).filter((file)=>file.endsWith('route.ts'));
const failures = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g,'/');
  if (publicAuthRoutes.has(rel)) continue;
  const src = fs.readFileSync(file,'utf8');
  const hasUser = src.includes('requireUser(');
  const hasInlineGuard = /\bmust\(|\bcan\(|assertEmployeeAccess\(|canAccessEmployee\(/.test(src);
  const delegated = delegatedGuardRoutes.get(rel);
  const hasDelegatedGuard = delegated ? delegated.every((needle)=>src.includes(needle)) : false;
  if (!hasUser) failures.push(`${rel}: missing requireUser()`);
  if (!selfServiceRoutes.has(rel) && !hasInlineGuard && !hasDelegatedGuard) {
    failures.push(`${rel}: missing permission/access check`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`API security audit passed for ${files.length} route files.`);
