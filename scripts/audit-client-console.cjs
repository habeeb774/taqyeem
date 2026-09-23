const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'public'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const allowed = [
  { file: 'src/templates/forms.html', reason: 'legacy print-layout diagnostic guarded by window.console' },
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

function normalized(file) {
  return file.replace(/\\/g, '/');
}

function isAllowed(file) {
  const rel = normalized(path.relative(process.cwd(), file));
  return allowed.some((item) => item.file === rel);
}

const violations = [];
for (const root of roots) {
  for (const file of collectFiles(path.join(process.cwd(), root))) {
    if (isAllowed(file)) continue;

    const rel = normalized(path.relative(process.cwd(), file));
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/\bconsole\.(log|debug|info|warn|error)\s*\(/.test(line)) {
        violations.push(`${rel}:${index + 1}: console.* is not allowed in production UI code`);
      }
    });
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Client console audit passed: production UI code has no console.* calls.');
