const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const textExtensions = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|html|css|sql|toml|yml|yaml|env\.example)$/i;
const binaryExtensions = /\.(png|jpg|jpeg|webp|gif|ico|woff|woff2|otf|ttf|xlsx|zip)$/i;

const allowedPlaceholderPatterns = [
  /postgres(?:ql)?:\/\/USER:PASSWORD@HOST\//i,
  /^AUTH_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET$/,
  /^AUTH_SECRET=ضع_قيمة_عشوائية_طويلة_جداً$/,
  /SUPER_ADMIN_PASSWORD='StrongPasswordHere'/,
  /NEXTAUTH_URL=https:\/\/YOUR-PROJECT\.vercel\.app/,
  /^NEXTAUTH_URL=http:\/\/localhost:3000$/,
  /admin@example\.com/,
];

const secretAssignmentNames = new Set([
  'DATABASE_URL',
  'TAQYEEM_DATABASE_URL',
  'AUTH_SECRET',
  'RESEND_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
]);

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function isAllowedPlaceholder(line) {
  return allowedPlaceholderPatterns.some((pattern) => pattern.test(line));
}

function hasRealPostgresUrl(line) {
  if (!/postgres(?:ql)?:\/\//i.test(line)) return false;
  return !/postgres(?:ql)?:\/\/USER:PASSWORD@HOST\//i.test(line);
}

function hasSuspiciousAssignment(line) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!match) return false;

  const [, key, rawValue] = match;
  if (!secretAssignmentNames.has(key)) return false;

  const value = rawValue.trim();
  if (!value) return false;
  if (isAllowedPlaceholder(`${key}=${value}`)) return false;
  if (key === 'NEXTAUTH_URL') return false;

  return true;
}

const failures = [];
for (const file of trackedFiles()) {
  if (binaryExtensions.test(file) || !textExtensions.test(file)) continue;
  if (!fs.existsSync(file)) continue;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isAllowedPlaceholder(line)) return;
    if (hasRealPostgresUrl(line) || hasSuspiciousAssignment(line)) {
      failures.push(`${file}:${index + 1}: possible secret`);
    }
  });
}

if (failures.length) {
  console.error(`Secret audit failed: ${failures.length} possible secrets found.`);
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Secret audit passed: tracked files do not contain real-looking secrets.');
