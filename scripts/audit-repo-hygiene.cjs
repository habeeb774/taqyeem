const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const forbiddenPatterns = [
  { pattern: /(^|\/)\.next(\/|$)/, reason: 'Next.js build output must not be tracked' },
  { pattern: /(^|\/)node_modules(\/|$)/, reason: 'dependencies must not be tracked' },
  { pattern: /(^|\/)\.env($|\.)/, reason: 'environment files must not be tracked' },
  { pattern: /(^|\/)(dist|build|coverage)(\/|$)/, reason: 'generated output must not be tracked' },
  { pattern: /(^|\/)__pycache__(\/|$)/, reason: 'Python cache must not be tracked' },
  { pattern: /\.zip$/i, reason: 'archives must not be tracked' },
  { pattern: /\.(log|tmp|bak|old)$/i, reason: 'temporary files must not be tracked' },
  { pattern: /\.tsbuildinfo$/i, reason: 'TypeScript incremental cache must not be tracked' },
];

const maxTrackedFileBytes = 5 * 1024 * 1024;
const allowedTrackedFiles = new Set([
  '.env.example',
]);

const allowedLargeFiles = new Set([
  'package-lock.json',
]);

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

const failures = [];
for (const file of trackedFiles()) {
  const normalized = file.replace(/\\/g, '/');
  if (allowedTrackedFiles.has(normalized)) continue;

  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(normalized)) failures.push(`${file}: ${reason}`);
  }

  if (!fs.existsSync(file)) continue;
  const size = fs.statSync(file).size;
  if (size > maxTrackedFileBytes && !allowedLargeFiles.has(normalized)) {
    failures.push(`${file}: tracked file is larger than ${maxTrackedFileBytes} bytes`);
  }
}

if (failures.length) {
  console.error(`Repository hygiene audit failed: ${failures.length} issues.`);
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Repository hygiene audit passed: tracked files exclude generated, secret, and temporary artifacts.');
