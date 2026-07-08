#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(join(__dirname, '..', 'src', 'server'));

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const consolePattern = /console\.(log|error|warn)\s*\(/;
let violations = 0;

for (const file of walk(serverDir)) {
  const lines = readFileSync(file, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment/doc lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('/*')) continue;
    if (trimmed.startsWith('/**')) continue;

    if (consolePattern.test(line)) {
      console.log(`VIOLATION: ${file}:${i + 1} — direct console.log/error/warn`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.log(`\n${violations} console call(s) found in src/server/. Use logger callback instead.`);
  process.exit(1);
}

console.log('OK: No direct console calls in src/server/');
