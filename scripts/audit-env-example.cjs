const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['.git', '.next', 'node_modules']);
const intentionallyUndocumented = new Set(['NODE_ENV']);

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

function usedEnvironmentKeys() {
  const keys = new Set();

  for (const root of roots) {
    for (const file of collectFiles(root)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        if (!intentionallyUndocumented.has(match[1])) keys.add(match[1]);
      }
    }
  }

  return keys;
}

function documentedEnvironmentKeys() {
  const source = fs.readFileSync('.env.example', 'utf8');
  return new Set(Array.from(source.matchAll(/^([A-Z0-9_]+)=/gm), (match) => match[1]));
}

const used = usedEnvironmentKeys();
const documented = documentedEnvironmentKeys();
const missing = [...used].filter((key) => !documented.has(key)).sort();

if (missing.length) {
  console.error(`Environment example audit failed. Missing keys in .env.example: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Environment example audit passed: .env.example documents every required process.env key.');
