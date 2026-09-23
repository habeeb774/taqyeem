const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd(), 'src/app/api/app');
const publicAuthRoutes = new Set([
  'auth/login/route.ts',
  'auth/logout/route.ts',
  'auth/status/route.ts',
  'auth/setup/route.ts',
  'auth/password-reset/route.ts'
]);
const selfServiceRoutes = new Set([
  'auth/me/route.ts',
  'notifications/route.ts',
  'portal/route.ts'
]);
const delegatedGuardRoutes = new Map([
  ['candidates/route.ts', ['listCandidates(', 'createCandidate(', 'convertCandidateToEmployee(']],
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
