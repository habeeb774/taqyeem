const fs = require('node:fs');
const path = require('node:path');

const roots = ['src'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const forbiddenPatterns = [
  { pattern: /@\/db(?:\/|['"])/, reason: 'imports database code into a client file' },
  { pattern: /@\/server(?:\/|['"])/, reason: 'imports server-only code into a client file' },
  { pattern: /process\.env/, reason: 'reads environment variables in a client file' },
  { pattern: /DATABASE_URL|TAQYEEM_DATABASE_URL/, reason: 'references a database URL in a client file' },
];

function collectFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(fullPath, files);
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }

  return files;
}

function isClientFile(source) {
  const firstStatements = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .slice(0, 3);

  return firstStatements.some((line) => line === "'use client';" || line === '"use client";');
}

const violations = [];
for (const file of roots.flatMap((root) => collectFiles(root))) {
  const source = fs.readFileSync(file, 'utf8');
  if (!isClientFile(source)) continue;

  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, reason } of forbiddenPatterns) {
      if (!pattern.test(line)) continue;
      violations.push({ file, line: index + 1, reason });
    }
  });
}

if (violations.length) {
  console.error(`Client/server boundary audit failed: ${violations.length} violations.`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} ${violation.reason}`);
  }
  process.exit(1);
}

console.log('Client/server boundary audit passed: client files do not import server/database code.');
