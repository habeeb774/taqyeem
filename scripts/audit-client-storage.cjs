const fs = require('fs');
const path = require('path');
const roots = ['src', 'public'];
const allowedSessionKeys = [
  'taqyeem_cycle_id',
  'taqyeem_view_state',
  'taqyeem_assessment_view',
];
const forbiddenDataWords = [
  'employees', 'evaluations', 'targets', 'attendance', 'branches', 'departments',
  'users', 'roles', 'permissions', 'criteria', 'forms', 'documents', 'settings'
];
function walk(dir){
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full = path.join(dir, entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}
function resolveSessionArg(arg, constants) {
  const text = arg.trim();
  const literal = text.match(/^['"]([^'"]+)['"]/);
  if (literal) return literal[1];
  return constants.get(text) || text;
}
const failures = [];
for (const root of roots) {
  for (const file of walk(path.join(process.cwd(), root))) {
    if (!/\.(js|jsx|ts|tsx|html)$/.test(file)) continue;
    const src = fs.readFileSync(file,'utf8');
    const rel = path.relative(process.cwd(), file).replace(/\\/g,'/');
    const constants = new Map();
    for (const match of src.matchAll(/\b(?:const|var|let)\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g)) {
      constants.set(match[1], match[2]);
    }
    src.split(/\r?\n/).forEach((line, index)=>{
      if (line.includes('localStorage.')) failures.push(`${rel}:${index+1}: localStorage is not allowed for production data`);
      const match = line.match(/sessionStorage\.(?:getItem|setItem|removeItem)\(([^,)]*)/);
      if (match) {
        const key = resolveSessionArg(match[1], constants);
        const hasAllowedKey = allowedSessionKeys.includes(key);
        const hasForbiddenDataKey = forbiddenDataWords.some((word)=>key.toLowerCase().includes(word));
        if (!hasAllowedKey || hasForbiddenDataKey) failures.push(`${rel}:${index+1}: sessionStorage key must be an approved UI preference only (${key})`);
      }
    });
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Client storage audit passed: no production data stored in local/session storage.');
