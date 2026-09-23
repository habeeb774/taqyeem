const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const currentFile = path.normalize(__filename);
const forbiddenPatterns = [
  { pattern: new RegExp('@ts-' + 'ignore'), label: '@ts-' + 'ignore' },
  { pattern: new RegExp('@ts-' + 'expect-error'), label: '@ts-' + 'expect-error' },
  { pattern: new RegExp('eslint-' + 'disable'), label: 'eslint-' + 'disable' },
  { pattern: new RegExp('\\bTO' + 'DO\\b', 'i'), label: 'TO' + 'DO' },
  { pattern: new RegExp('\\bFIX' + 'ME\\b', 'i'), label: 'FIX' + 'ME' },
  { pattern: new RegExp('\\bHA' + 'CK\\b', 'i'), label: 'HA' + 'CK' },
  { pattern: new RegExp('\\bX' + 'XX\\b', 'i'), label: 'X' + 'XX' },
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

const failures = [];
for (const root of roots) {
  for (const file of collectFiles(root)) {
    if (path.normalize(file) === currentFile) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const item of forbiddenPatterns) {
        if (item.pattern.test(line)) {
          failures.push(`${file}:${index + 1}: remove ${item.label}`);
        }
      }
    });
  }
}

if (failures.length) {
  console.error(`Code cleanliness audit failed: ${failures.length} issues.`);
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Code cleanliness audit passed: no disabled checks or deferred-work markers remain.');
