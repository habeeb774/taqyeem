const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const maxLineLength = 220;

function collectFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const violations = [];
for (const root of roots) {
  for (const file of collectFiles(root)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (line.length <= maxLineLength) return;
      violations.push({
        file,
        line: index + 1,
        length: line.length,
      });
    });
  }
}

if (violations.length) {
  console.error(`Source readability audit failed: ${violations.length} lines exceed ${maxLineLength} chars.`);
  for (const violation of violations.slice(0, 40)) {
    console.error(`${violation.file}:${violation.line} has ${violation.length} chars`);
  }
  if (violations.length > 40) {
    console.error(`...and ${violations.length - 40} more.`);
  }
  process.exit(1);
}

console.log(`Source readability audit passed: no source/script lines exceed ${maxLineLength} chars.`);
