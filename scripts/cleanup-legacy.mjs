import { existsSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// Static HTML scripts are not compiled by Next.js. Exercise them explicitly.
execFileSync(process.execPath, ['scripts/check-forms.cjs'], { stdio: 'inherit' });

const root = process.cwd();
const staleFiles = [
  'src/lib/neon/legacy-auth.ts',
  'src/lib/neon/legacy-auth.tsx',
  'src/lib/neon/auth.ts',
];

for (const file of staleFiles) {
  const full = join(root, file);
  if (existsSync(full)) {
    rmSync(full, { force: true });
    console.log(`Removed stale Neon Auth file: ${file}`);
  }
}

const forbiddenPackage = '@neondatabase' + '/auth';
const matches = [];

function scan(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(entry)) continue;
      scan(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes(forbiddenPackage)) matches.push(relative(root, full));
  }
}

scan(join(root, 'src'));

const packageJsonPath = join(root, 'package.json');
if (existsSync(packageJsonPath)) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (pkg.dependencies?.[forbiddenPackage] || pkg.devDependencies?.[forbiddenPackage]) {
    matches.push('package.json');
  }
}

if (matches.length) {
  console.error('Legacy Neon Auth references still exist in:');
  for (const file of matches) console.error(` - ${file}`);
  process.exit(1);
}

console.log('Legacy Neon Auth cleanup check passed.');
