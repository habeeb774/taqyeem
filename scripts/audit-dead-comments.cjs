const fs = require('node:fs');
const path = require('node:path');

const roots = ['src'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const maxBlockLines = 12;

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

function findLargeCommentBlocks(file) {
  const source = fs.readFileSync(file, 'utf8');
  const failures = [];
  const pattern = /\/\*[\s\S]*?\*\//g;
  let match;

  while ((match = pattern.exec(source))) {
    const before = source.slice(0, match.index);
    const startLine = before.split(/\r?\n/).length;
    const lineCount = match[0].split(/\r?\n/).length;

    if (lineCount > maxBlockLines) {
      failures.push(`${file}:${startLine}: comment block has ${lineCount} lines`);
    }
  }

  return failures;
}

const failures = roots.flatMap((root) =>
  collectFiles(root).flatMap((file) => findLargeCommentBlocks(file)),
);

if (failures.length) {
  console.error('Dead comment audit failed: remove large commented blocks.');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dead comment audit passed: no large commented code blocks remain.');
