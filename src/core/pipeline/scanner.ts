import { readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { glob } from 'glob';
import ignore from 'ignore';
import type { FileInfo, ScanResult, SupportedLanguage } from '../../types/pipeline.js';

const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.vue': 'vue',
  '.php': 'php',
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE_MAP));

const DEFAULT_IGNORE = [
  'node_modules/**',
  'vendor/**',
  'dist/**',
  'build/**',
  '.git/**',
  '.milens/**',
  '*.min.js',
  '*.bundle.js',
  '*.map',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '__pycache__/**',
];

export async function scan(rootPath: string, extraExclude?: string[]): Promise<ScanResult> {
  const start = performance.now();

  // Load .gitignore
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);
  if (extraExclude) ig.add(extraExclude);

  try {
    const gitignoreContent = readFileSync(join(rootPath, '.gitignore'), 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore, that's fine
  }

  // Glob all files
  const allFiles = await glob('**/*', {
    cwd: rootPath,
    nodir: true,
    dot: false,
    absolute: false,
  });

  // Filter: supported extensions + respect ignore
  const files: FileInfo[] = [];
  for (const relativePath of allFiles) {
    const ext = extname(relativePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    if (ig.ignores(relativePath)) continue;

    const absolutePath = join(rootPath, relativePath);
    try {
      const stat = statSync(absolutePath);
      // Skip files > 1MB
      if (stat.size > 1_048_576) continue;

      files.push({
        path: relativePath.replace(/\\/g, '/'),  // normalize to forward slashes
        absolutePath,
        language: EXTENSION_LANGUAGE_MAP[ext]!,
        size: stat.size,
        lastModified: stat.mtimeMs,
      });
    } catch {
      // Skip inaccessible files
    }
  }

  const duration = performance.now() - start;
  return { files, rootPath, duration };
}
