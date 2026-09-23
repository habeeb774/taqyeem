const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd(), 'src/app/api/app');
const maxLineLength = 420;

// Temporary baseline for legacy route files that still need progressive cleanup.
// New routes, and routes removed from this list after cleanup, must stay readable.
const legacyLongLineRoutes = new Set([
  'admin/route.ts',
  'attendance/route.ts',
  'audit/route.ts',
  'auth/login/route.ts',
  'auth/status/route.ts',
  'bootstrap/route.ts',
  'criteria/route.ts',
  'employees/route.ts',
  'exclusions/route.ts',
  'form-data/route.ts',
  'notifications/route.ts',
  'portal/route.ts',
  'reports/route.ts',
  'targets/route.ts',
]);

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full = path.join(dir, entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}

const failures = [];
const legacyFindings = [];
for (const file of walk(root).filter((entry)=>entry.endsWith('route.ts'))) {
  const rel = path.relative(root, file).replace(/\\/g,'/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.length <= maxLineLength) return;
    const message = `${rel}:${index + 1}: route line is ${line.length} chars; split route code for reviewability`;
    if (legacyLongLineRoutes.has(rel)) legacyFindings.push(message);
    else failures.push(message);
  });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`API readability audit passed: no non-baselined route lines exceed ${maxLineLength} chars.`);
if (legacyFindings.length) {
  console.log(`Legacy readability debt remains in ${new Set(legacyFindings.map((item)=>item.split(':')[0])).size} route files.`);
}
