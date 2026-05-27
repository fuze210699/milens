// ── Security rules engine for milens ──

export type SecurityCategory =
  | 'secrets'
  | 'injection'
  | 'unicode'
  | 'dangerous'
  | 'config'
  | 'data-leak'
  | 'crypto'
  | 'auth'
  | 'file-access';

export interface SecurityRule {
  id: string;
  category: SecurityCategory;
  owasp: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  name: string;
  description: string;
  patterns: RegExp[];
  fileGlob?: string;
  excludeGlob?: string;
  fix?: string;
  confidence: number;
  enabled: boolean;
}

export interface SecurityMatch {
  ruleId: string;
  category: SecurityCategory;
  severity: string;
  owasp: string;
  file: string;
  line: number;
  match: string;
  context: string;
  fix?: string;
}

export interface SecurityReport {
  summary: {
    totalScanned: number;
    findings: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    score: number;
  };
  findings: SecurityMatch[];
}

export const OWASP_CATEGORIES: Record<string, string> = {
  'A01:2021': 'Broken Access Control',
  'A02:2021': 'Cryptographic Failures',
  'A03:2021': 'Injection',
  'A04:2021': 'Insecure Design',
  'A05:2021': 'Security Misconfiguration',
  'A06:2021': 'Vulnerable and Outdated Components',
  'A07:2021': 'Identification and Authentication Failures',
  'A08:2021': 'Software and Data Integrity Failures',
  'A09:2021': 'Security Logging and Monitoring Failures',
  'A10:2021': 'Server-Side Request Forgery (SSRF)',
};

const DEFAULT_EXCLUDE = '**/*.test.*,**/*.spec.*,**/node_modules/**';

// ── 50 built-in security rules ──

export const ALL_RULES: SecurityRule[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEC-001 – SEC-010 : Secrets (A02:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-001',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'Hardcoded password',
    description: 'Password value appears to be hardcoded in source code. Use environment variables or a secrets manager instead.',
    patterns: [
      /(?:password|passwd|pwd)\s*[:=]\s*['"`][^'"`\n]{4,}['"`]/i,
      /(?:password|passwd|pwd)\s*=\s*[^'"`\s;]{4,}/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace hardcoded password with process.env.DB_PASSWORD or a secrets manager.',
    confidence: 0.92,
    enabled: true,
  },

  {
    id: 'SEC-002',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'Hardcoded secret key',
    description: 'A secret or signing key appears to be hardcoded. Use a secure key management service.',
    patterns: [
      /(?:secret|secretKey|secret_key|clientSecret)\s*[:=]\s*['"`][A-Za-z0-9_\-+=/]{16,}['"`]/i,
      /(?:signingKey|signing_key|encryptionKey|encryption_key)\s*[:=]\s*['"`][A-Za-z0-9_\-+=/]{16,}['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Store secrets in a vault (HashiCorp Vault, AWS Secrets Manager, etc.) or environment variables.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-003',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'Hardcoded API key',
    description: 'An API key literal is embedded in source code. Rotate the key immediately and use environment variables.',
    patterns: [
      /(?:api[_-]?key|apiKey|apikey)\s*[:=]\s*['"`][A-Za-z0-9_\-]{20,}['"`]/i,
      /(?:api[_-]?secret|apiSecret)\s*[:=]\s*['"`][A-Za-z0-9_\-]{20,}['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Move the API key to process.env.API_KEY and never commit credentials.',
    confidence: 0.93,
    enabled: true,
  },

  {
    id: 'SEC-004',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'AWS Access Key ID exposed',
    description: 'An AWS access key ID (starting with AKIA) is exposed. Rotate the key immediately.',
    patterns: [
      /\bAKIA[0-9A-Z]{16}\b/,
      /(?:aws[_-]?access[_-]?key|AWS_ACCESS_KEY_ID)\s*[:=]\s*['"`]AKIA[0-9A-Z]{16}['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use IAM roles, instance profiles, or AWS Secrets Manager. If the key is leaked, deactivate it in the AWS console immediately.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-005',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'Stripe / OpenAI secret key exposed',
    description: 'A secret key starting with "sk-" (Stripe or OpenAI) is exposed in source code.',
    patterns: [
      /\b(sk-(?:live|test|ant|admin)-[A-Za-z0-9_\-]{30,})\b/,
      /(?:stripe[_-]?key|openai[_-]?key|OPENAI_API_KEY)\s*[:=]\s*['"`]sk-[A-Za-z0-9_\-]+['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use environment variables (STRIPE_SECRET_KEY, OPENAI_API_KEY) and never commit sk- keys.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-006',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'GitHub personal access token exposed',
    description: 'A GitHub personal access token (ghp_...) is exposed in source code.',
    patterns: [
      /\bghp_[A-Za-z0-9_]{36,}\b/,
      /(?:github[_-]?token|GITHUB_TOKEN|gh[_-]?token)\s*[:=]\s*['"`]ghp_[A-Za-z0-9_]+['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use GITHUB_TOKEN in Actions workflows, or store PATs in repository secrets.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-007',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'RSA private key exposed',
    description: 'An RSA private key block is embedded in source code. Private keys must never be committed.',
    patterns: [
      /-----BEGIN\s+(?:RSA|ENCRYPTED)\s+PRIVATE\s+KEY-----/,
      /['"`]-----BEGIN\s+(?:RSA|ENCRYPTED)\s+PRIVATE\s+KEY-----/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Store private keys outside the repository; use a secrets manager or PKI infrastructure.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-008',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'CRITICAL',
    name: 'EC private key exposed',
    description: 'An elliptic-curve (EC) private key block is embedded in source code.',
    patterns: [
      /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
      /['"`]-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Store private keys outside the repository; use a secrets manager or PKI infrastructure.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-009',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'HIGH',
    name: 'Generic token / bearer token hardcoded',
    description: 'A token or bearer token appears to be hardcoded in source code.',
    patterns: [
      /(?:token|authToken|accessToken|bearerToken)\s*[:=]\s*['"`][A-Za-z0-9_\-+=.]{20,}['"`]/i,
      /(?:authorization|Authorization)\s*[:=]\s*['"`]Bearer\s+[A-Za-z0-9_\-+=.]+['"`]/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use environment variables or a secure token store. Rotate the exposed token.',
    confidence: 0.88,
    enabled: true,
  },

  {
    id: 'SEC-010',
    category: 'secrets',
    owasp: 'A02:2021',
    severity: 'HIGH',
    name: 'Sensitive environment variable or AUTH_TOKEN',
    description: 'AUTH_TOKEN or similar sensitive credential is set to a literal value rather than referencing an external secret.',
    patterns: [
      /AUTH_TOKEN\s*=\s*['"`][^'"`]{8,}['"`]/i,
      /(?:\.env\s*(?:file)?\s*[:=]\s*['"`][^'"`]*['"`])/i,
      /process\.env\.([A-Z_]+)\s*=\s*['"`][^'"`]{8,}['"`]/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Never assign secret values to process.env in code. Use external .env files (gitignored) or a secrets manager.',
    confidence: 0.85,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-011 – SEC-019 : Injection (A03:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-011',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'Use of eval()',
    description: 'eval() executes arbitrary code from a string and is extremely dangerous. Almost always avoidable.',
    patterns: [
      /\beval\s*\(\s*[^)]*\s*\)/,
      /\beval\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`\s*\)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace eval() with safer alternatives: JSON.parse() for data, or design a non-eval code path.',
    confidence: 0.92,
    enabled: true,
  },

  {
    id: 'SEC-012',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'Use of exec() in Python',
    description: 'Python exec() executes arbitrary code from a string. Avoid using it.',
    patterns: [
      /\bexec\s*\(\s*[^)]*\s*\)/,
      /\bexec\s*\(\s*(?:f['"]|['"]\s*%\s*)/,
    ],
    fileGlob: '**/*.py',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Avoid exec(). Use getattr(), importlib, or restructure logic to not require dynamic execution.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-013',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'child_process.exec with dynamic input',
    description: 'child_process.exec() spawns a shell — user-controlled input can lead to command injection.',
    patterns: [
      /child_process\s*\.\s*exec\s*\(\s*[^)]*(?:\+|\$\{|`)[^)]*\)/,
      /require\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*exec\s*\(/,
      /\bexec\s*\(\s*['"`][^'"`]*\$\{[^}]*\}[^'"`]*['"`]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use child_process.execFile() or child_process.spawn() with argument arrays instead of string commands.',
    confidence: 0.88,
    enabled: true,
  },

  {
    id: 'SEC-014',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'SQL query built via string concatenation',
    description: 'SQL query is built with string concatenation or interpolation — vulnerable to SQL injection.',
    patterns: [
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s.*(?:\+\s*|`\$\{)/i,
      /(?:query|sql|q)\s*=\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{[^}]*\}[^`]*`/i,
      /(?:query|sql|q)\s*=\s*['"].*\b(?:SELECT|INSERT|UPDATE|DELETE)\b.*(?:\+\s*["'`]|\+\s*\w+)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py,java,go,rs,rb,php}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use parameterized queries or an ORM with safe query builders (e.g., $1 placeholders, Prisma, SQLAlchemy ORM).',
    confidence: 0.91,
    enabled: true,
  },

  {
    id: 'SEC-015',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'Use of new Function() constructor',
    description: 'The Function constructor evaluates a string as code, similar to eval(). Extremely dangerous.',
    patterns: [
      /\bnew\s+Function\s*\(\s*[^)]*\s*\)/,
      /\bFunction\s*\(\s*[^)]*(?:\+|\$\{)[^)]*\)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Avoid the Function constructor. Use closures, higher-order functions, or refactor logic.',
    confidence: 0.92,
    enabled: true,
  },

  {
    id: 'SEC-016',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'innerHTML assignment with dynamic content',
    description: 'Assigning user-controlled content to innerHTML enables XSS attacks.',
    patterns: [
      /\.innerHTML\s*=\s*(?!['"`]\s*['"`])/,
      /\.innerHTML\s*=\s*`[^`]*\$\{[^}]*\}[^`]*`/,
      /\.innerHTML\s*=\s*\w+/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use textContent, createElement, or a sanitization library like DOMPurify before setting innerHTML.',
    confidence: 0.87,
    enabled: true,
  },

  {
    id: 'SEC-017',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'dangerouslySetInnerHTML in React',
    description: 'React dangerouslySetInnerHTML bypasses React XSS protections. Use with caution.',
    patterns: [
      /dangerouslySetInnerHTML\s*[=:]\s*\{/,
      /dangerouslySetInnerHTML\s*:/,
      /__html\s*:\s*(?!['"`]\s*['"`])/,
    ],
    fileGlob: '**/*.{jsx,tsx}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Sanitize HTML content with DOMPurify before passing to dangerouslySetInnerHTML, or use React elements instead.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-018',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'Use of document.write()',
    description: 'document.write() can be used for DOM-based XSS attacks and should be avoided.',
    patterns: [
      /\.write\s*\(\s*[^)]*(?:\+|\$\{|`)[^)]*\)/,
      /\bdocument\s*\.\s*write\s*\(/,
      /\bdocument\s*\.\s*writeln\s*\(/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use DOM manipulation APIs (createElement, appendChild) or framework-specific rendering.',
    confidence: 0.88,
    enabled: true,
  },

  {
    id: 'SEC-019',
    category: 'injection',
    owasp: 'A03:2021',
    severity: 'MEDIUM',
    name: 'setTimeout / setInterval with string argument',
    description: 'Passing a string to setTimeout or setInterval evaluates it as code (like eval).',
    patterns: [
      /\bsetTimeout\s*\(\s*['"`][^'"`]+\$\{[^}]*\}[^'"`]*['"`]/,
      /\bsetInterval\s*\(\s*['"`][^'"`]+\$\{[^}]*\}[^'"`]*['"`]/,
      /\bsetTimeout\s*\(\s*['"`][^'"`)]+\+\s*\w+/,
      /\bsetInterval\s*\(\s*['"`][^'"`)]+\+\s*\w+/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Pass a function reference instead of a string to setTimeout/setInterval.',
    confidence: 0.85,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-020 – SEC-023 : Unicode (A03:2021 / various)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-020',
    category: 'unicode',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'Bidi override characters detected',
    description: 'Unicode bidirectional override characters (U+202A–U+202E, U+2066–U+2069) can be used for trojan source attacks.',
    patterns: [
      /[\u202A\u202B\u202C\u202D\u202E]/,
      /[\u2066\u2067\u2068\u2069]/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Remove bidi override characters. Use explicit markup for bidirectional text if needed.',
    confidence: 0.95,
    enabled: true,
  },

  {
    id: 'SEC-021',
    category: 'unicode',
    owasp: 'A03:2021',
    severity: 'MEDIUM',
    name: 'Zero-width characters detected',
    description: 'Zero-width characters (U+200B, U+200C, U+200D, U+FEFF) can be used to hide code or confuse reviewers.',
    patterns: [
      /[\u200B\u200C\u200D\uFEFF]/,
      /[\u00AD\u2060\u2061\u2062\u2063\u2064]/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Remove invisible/zero-width characters. These are often introduced accidentally or maliciously.',
    confidence: 0.93,
    enabled: true,
  },

  {
    id: 'SEC-022',
    category: 'unicode',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'Potential homoglyph attack',
    description: 'Confusable Unicode characters (e.g., Cyrillic "а" vs Latin "a") detected outside of string literals.',
    patterns: [
      /[а-яА-Я]/,
      /[\u0391\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u039D\u039F\u03A1\u03A4\u03A5\u03A7]/,
      /[\u0430\u0435\u043E\u0441\u0443\u0445]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs,rb,php}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace homoglyph characters with their intended ASCII/Latin equivalents. Review for malicious intent.',
    confidence: 0.80,
    enabled: true,
  },

  {
    id: 'SEC-023',
    category: 'unicode',
    owasp: 'A03:2021',
    severity: 'LOW',
    name: 'Hidden Unicode in comments',
    description: 'Unicode control or invisible characters found inside comments may indicate an attempt to hide code.',
    patterns: [
      /\/\/[^\n]*[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069][^\n]*/,
      /\/\*[^*]*[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069][^*]*\*\//,
      /#[^\n]*[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069][^\n]*/,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Remove hidden Unicode characters from comments during code review.',
    confidence: 0.78,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-024 – SEC-030 : Dangerous (A03:2021 / A08:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-024',
    category: 'dangerous',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'Use of os.system() with dynamic input',
    description: 'os.system() passes a string to the shell — user input can lead to command injection.',
    patterns: [
      /\bos\.system\s*\(\s*(?:f['"]|['"][^'"]*\s*%\s*)/,
      /\bos\.system\s*\(\s*[^'")]*\s*\+\s*/,
      /\bos\.system\s*\(\s*[^'")]*(?:\{|\+format\()/,
    ],
    fileGlob: '**/*.py',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use subprocess.run() with a list of arguments and shell=False (the default).',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-025',
    category: 'dangerous',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'subprocess with shell=True',
    description: 'subprocess calls with shell=True are vulnerable to command injection if input is not strictly sanitized.',
    patterns: [
      /subprocess\s*\.\s*(?:call|run|Popen|check_output|check_call)\s*\([^)]*shell\s*=\s*True/,
      /\bshell\s*=\s*True\b.*subprocess/,
    ],
    fileGlob: '**/*.py',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use shell=False (default) and pass command arguments as a list. Validate all user input.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-026',
    category: 'dangerous',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'Runtime.exec() with dynamic input',
    description: 'Java Runtime.exec() with string concatenation is vulnerable to command injection.',
    patterns: [
      /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\([^)]*\s*\+\s*/,
      /\bRuntime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(\s*"/,
    ],
    fileGlob: '**/*.java',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use ProcessBuilder with a List<String> of arguments instead of Runtime.exec() with a single string.',
    confidence: 0.85,
    enabled: true,
  },

  {
    id: 'SEC-027',
    category: 'dangerous',
    owasp: 'A03:2021',
    severity: 'HIGH',
    name: 'child_process.spawn with shell:true',
    description: 'spawn() or exec() with shell:true enables shell interpretation — treat user input as untrusted.',
    patterns: [
      /spawn\s*\([^)]*\{\s*shell\s*:\s*true\s*\}/,
      /\bshell\s*:\s*true\b/,
      /spawn\s*\(\s*[^)]*(?:\+\s*|\$\{)[^)]*\)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Set shell:false (default) and pass arguments as an array. Sanitize all user-supplied input.',
    confidence: 0.86,
    enabled: true,
  },

  {
    id: 'SEC-028',
    category: 'dangerous',
    owasp: 'A08:2021',
    severity: 'CRITICAL',
    name: 'Use of pickle.loads() on untrusted data',
    description: 'pickle.loads() can execute arbitrary code when deserializing untrusted data.',
    patterns: [
      /\bpickle\s*\.\s*loads?\s*\(/,
      /\bpickle\s*\.\s*load\s*\(/,
      /\bcPickle\s*\.\s*loads?\s*\(/,
    ],
    fileGlob: '**/*.py',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use json.loads() or a safe serialization format. Never unpickle data from untrusted sources.',
    confidence: 0.92,
    enabled: true,
  },

  {
    id: 'SEC-029',
    category: 'dangerous',
    owasp: 'A08:2021',
    severity: 'CRITICAL',
    name: 'Use of unserialize() on untrusted data',
    description: 'PHP unserialize() can trigger object instantiation and lead to RCE via gadget chains.',
    patterns: [
      /\bunserialize\s*\(\s*/,
      /\bunserialize\s*\(\s*\$/,
    ],
    fileGlob: '**/*.php',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use json_decode() instead of unserialize(). If unserialize() is required, restrict allowed_classes.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-030',
    category: 'dangerous',
    owasp: 'A03:2021',
    severity: 'CRITICAL',
    name: 'Dynamic require / import with variable path',
    description: 'Loading modules via require() or import() with a dynamic path can enable code injection.',
    patterns: [
      /\brequire\s*\(\s*\w+\s*\+\s*/,
      /\bimport\s*\(\s*\w+\s*\+\s*/,
      /\brequire\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`\s*\)/,
      /\bimport\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`\s*\)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Avoid dynamic module loading. Use static imports or maintain an allowlist of safe module paths.',
    confidence: 0.84,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-031 – SEC-035 : Config (A05:2021 / A04:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-031',
    category: 'config',
    owasp: 'A05:2021',
    severity: 'HIGH',
    name: 'Dangerously skip middleware permissions',
    description: 'Skipping authentication/authorization middleware (e.g., Next.js matcher config) exposes routes.',
    patterns: [
      /config\s*=\s*\{\s*matcher\s*:\s*\[\s*['"`](?!\/)/,
      /dangerously.*skip.*permission/i,
      /skipAuth\s*:\s*true/i,
      /publicRoutes\s*:\s*\[\s*['"`]\*['"`]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Ensure middleware matcher config explicitly lists protected routes. Do not use wildcard exclusions.',
    confidence: 0.82,
    enabled: true,
  },

  {
    id: 'SEC-032',
    category: 'config',
    owasp: 'A05:2021',
    severity: 'HIGH',
    name: 'CORS configured with wildcard origin',
    description: 'CORS Access-Control-Allow-Origin set to "*" combined with credentials:true is insecure.',
    patterns: [
      /Access-Control-Allow-Origin\s*[=:]\s*['"`]\*['"`]/,
      /origin\s*:\s*['"`]\*['"`].*credentials\s*:\s*true/,
      /credentials\s*:\s*true.*origin\s*:\s*['"`]\*['"`]/,
      /\bcors\s*\(\s*\{\s*origin\s*:\s*['"`]\*['"`]\s*,?\s*credentials\s*:\s*true\s*\}/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace "*" with an explicit allowlist of trusted origins. Never pair "*" with credentials:true.',
    confidence: 0.88,
    enabled: true,
  },

  {
    id: 'SEC-033',
    category: 'config',
    owasp: 'A05:2021',
    severity: 'HIGH',
    name: 'Cookie set with secure:false',
    description: 'Cookies without the Secure flag can be transmitted over unencrypted HTTP connections.',
    patterns: [
      /secure\s*:\s*false/,
      /\bcookie\s*\(\s*[^)]*secure\s*:\s*false[^)]*\)/,
      /Set-Cookie\s*[=:].*;\s*Secure\s*=\s*false/i,
      /res\.cookie\s*\([^)]*\)(?!.*secure\s*:\s*true)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Set secure:true on all cookies in production. Use HTTPS everywhere.',
    confidence: 0.85,
    enabled: true,
  },

  {
    id: 'SEC-034',
    category: 'config',
    owasp: 'A05:2021',
    severity: 'HIGH',
    name: 'Cookie set with httpOnly:false',
    description: 'Cookies without the HttpOnly flag are accessible to client-side JavaScript, enabling XSS-based theft.',
    patterns: [
      /httpOnly\s*:\s*false/,
      /\bcookie\s*\(\s*[^)]*httpOnly\s*:\s*false[^)]*\)/,
      /Set-Cookie\s*[=:].*;\s*HttpOnly\s*=\s*false/i,
      /res\.cookie\s*\([^)]*\)(?!.*httpOnly\s*:\s*true)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Set httpOnly:true on all session/authentication cookies to prevent JavaScript access.',
    confidence: 0.85,
    enabled: true,
  },

  {
    id: 'SEC-035',
    category: 'config',
    owasp: 'A04:2021',
    severity: 'MEDIUM',
    name: 'Debug mode enabled in production',
    description: 'Debug/verbose mode enabled in a production-like configuration may leak sensitive information.',
    patterns: [
      /(?:debug|DEBUG)\s*[=:]\s*(?:true|1|['"`](?:true|1|on)['"`])/,
      /(?:NODE_ENV|ENV|environment)\s*[=:]\s*['"`]development['"`]/,
      /DJANGO_DEBUG\s*=\s*True/,
      /FLASK_ENV\s*=\s*['"`]development['"`]/,
      /debugger\s*:\s*true/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,env,json,yaml,yml,toml,php,ini,cfg}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Disable debug mode in production. Use environment-specific config files.',
    confidence: 0.78,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-036 – SEC-040 : Data Leak (A09:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-036',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'HIGH',
    name: 'console.log with password',
    description: 'Logging a variable or value that appears to be a password can leak credentials to log files.',
    patterns: [
      /console\.(?:log|warn|error|info|debug)\s*\([^)]*\bpassword\b[^)]*\)/i,
      /console\.(?:log|warn|error|info|debug)\s*\([^)]*\bpasswd\b[^)]*\)/i,
      /console\.(?:log|warn|error|info|debug)\s*\([^)]*\bpwd\b[^)]*\)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Remove or redact password values from log output. Use a logging library with automatic PII redaction.',
    confidence: 0.82,
    enabled: true,
  },

  {
    id: 'SEC-037',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'HIGH',
    name: 'console.log with token or secret',
    description: 'Logging tokens or secrets can expose credentials in monitoring systems and log aggregators.',
    patterns: [
      /console\.(?:log|warn|error|info|debug)\s*\([^)]*\b(?:token|secret)\b[^)]*\)/i,
      /console\.(?:log|warn|error|info|debug)\s*\([^)]*\bapi[_-]?key\b[^)]*\)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Never log tokens or secrets. Mask sensitive values before logging (e.g., log only first 4 chars).',
    confidence: 0.83,
    enabled: true,
  },

  {
    id: 'SEC-038',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'MEDIUM',
    name: 'Hardcoded URL with embedded credentials',
    description: 'A URL contains embedded username:password credentials (e.g., https://user:pass@host).',
    patterns: [
      /https?:\/\/[^\/\s@]+:[^\/\s@]+@/i,
      /['"`]https?:\/\/[^:'"\s]+:[^@'"\s]+@[^'"`\s]+['"`]/i,
      /(?:DATABASE_URL|DB_URL|MONGO_URL|REDIS_URL)\s*[=:]\s*['"`][^'"`]*:\/\/[^\/\s@]+:[^\/\s@]+@/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,env,json,yaml,yml,toml,ini,cfg}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Store connection strings without credentials in code; inject credentials from environment variables at runtime.',
    confidence: 0.89,
    enabled: true,
  },

  {
    id: 'SEC-039',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'MEDIUM',
    name: 'Hardcoded URLs that may expose internal infrastructure',
    description: 'Hardcoded URLs (especially non-HTTPS or internal IPs) may reveal internal network topology.',
    patterns: [
      /['"`]http:\/\/(?:\d{1,3}\.){3}\d{1,3}['"`]/,
      /['"`]http:\/\/localhost:\d+['"`]/,
      /['"`]http:\/\/192\.168\.\d+\.\d+['"`]/,
      /['"`]http:\/\/10\.\d+\.\d+\.\d+['"`]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use HTTPS URLs from environment variables. Never hardcode internal IPs.',
    confidence: 0.75,
    enabled: true,
  },

  {
    id: 'SEC-040',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'LOW',
    name: 'General console.log left in production code',
    description: 'Unconditional console.log statements may leak internal state to the browser console in production.',
    patterns: [
      /^\s*console\.log\s*\(/m,
      /^\s*console\.warn\s*\(/m,
      /^\s*console\.debug\s*\(/m,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace console.log with a proper logging framework that supports log levels and can be silenced in production.',
    confidence: 0.70,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-041 – SEC-044 : Crypto (A02:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-041',
    category: 'crypto',
    owasp: 'A02:2021',
    severity: 'HIGH',
    name: 'Use of MD5 hash',
    description: 'MD5 is cryptographically broken and unsuitable for security purposes. Use SHA-256 or better.',
    patterns: [
      /\bmd5\s*\(/i,
      /['"`]md5['"`]/i,
      /\bcreateHash\s*\(\s*['"`]md5['"`]/,
      /\bhashlib\.md5\s*\(/,
      /\bMessageDigest\.getInstance\s*\(\s*['"`]MD5['"`]/,
      /\bcrypto\.createHash\s*\(\s*['"`]md5['"`]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace MD5 with SHA-256 or SHA-3 for security-sensitive hashing. MD5 is only acceptable for non-cryptographic checksums.',
    confidence: 0.93,
    enabled: true,
  },

  {
    id: 'SEC-042',
    category: 'crypto',
    owasp: 'A02:2021',
    severity: 'HIGH',
    name: 'Use of SHA-1 hash',
    description: 'SHA-1 is considered weak. Use SHA-256 or better for cryptographic operations.',
    patterns: [
      /['"`]sha1['"`]/i,
      /\bSHA-1\b/,
      /\bcreateHash\s*\(\s*['"`]sha1?['"`]/i,
      /\bhashlib\.sha1\s*\(/,
      /\bMessageDigest\.getInstance\s*\(\s*['"`]SHA-?1['"`]/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs,rb}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use SHA-256 or SHA-3 instead of SHA-1 for any security-sensitive operation.',
    confidence: 0.90,
    enabled: true,
  },

  {
    id: 'SEC-043',
    category: 'crypto',
    owasp: 'A02:2021',
    severity: 'MEDIUM',
    name: 'Math.random() used for cryptographic purposes',
    description: 'Math.random() is not cryptographically secure. Use crypto.randomBytes() or crypto.getRandomValues().',
    patterns: [
      /Math\.random\s*\(\s*\).*(?:token|key|secret|password|nonce|salt|iv)/i,
      /(?:token|key|secret|password|nonce|salt|iv).*Math\.random\s*\(\)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use crypto.randomBytes(), crypto.randomUUID(), or crypto.getRandomValues() for cryptographically secure randomness.',
    confidence: 0.85,
    enabled: true,
  },

  {
    id: 'SEC-044',
    category: 'crypto',
    owasp: 'A02:2021',
    severity: 'HIGH',
    name: 'Hardcoded cryptographic salt or IV',
    description: 'A hardcoded salt or initialization vector (IV) weakens encryption. Salts and IVs must be unique and random per operation.',
    patterns: [
      /(?:salt|Salt)\s*[:=]\s*['"`][A-Za-z0-9_\-+=/]{4,}['"`]/,
      /(?:iv|IV|initVector|init_vector)\s*[:=]\s*['"`][A-Za-z0-9_\-+=/]{4,}['"`]/,
      /(?:salt|Salt)\s*=\s*(?![A-Za-z_]\w*\.)(?:0x)?[A-Fa-f0-9]{8,}/,
      /(?:iv|IV)\s*=\s*(?![A-Za-z_]\w*\.)(?:0x)?[A-Fa-f0-9]{8,}/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs,rb,php}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Generate a unique, cryptographically random salt/IV per operation using crypto.randomBytes(). Never hardcode.',
    confidence: 0.86,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-045 – SEC-048 : Auth (A01:2021 / A07:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-045',
    category: 'auth',
    owasp: 'A01:2021',
    severity: 'HIGH',
    name: 'Role check via string comparison',
    description: 'Checking user role against a literal string (e.g., role === "admin") can be bypassed if roles are not validated upstream.',
    patterns: [
      /\b(?:role|userRole|user\.role)\s*[=!]==?\s*['"`](?:admin|superadmin|superuser)['"`]/i,
      /\bif\s*\(\s*(?:role|userRole|user\.role)\s*==\s*['"`](?:admin|superadmin|superuser)['"`]/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use a role hierarchy checker or a dedicated authorization library (e.g., CASL, Oso). Validate RBAC claims from a trusted source.',
    confidence: 0.80,
    enabled: true,
  },

  {
    id: 'SEC-046',
    category: 'auth',
    owasp: 'A01:2021',
    severity: 'CRITICAL',
    name: 'Route handler missing auth middleware',
    description: 'A route handler appears to be defined without authentication/authorization middleware.',
    patterns: [
      /\brouter\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"`]\/(?!auth|login|register|health)[^'"`]*['"`]\s*,\s*(?!.*auth)(?!.*middleware)(?!.*guard)\s*\(/i,
      /\bapp\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"`]\/(?!auth|login|register|health|public)[^'"`]*['"`]\s*,\s*(?!.*auth)(?!.*middleware)(?!.*guard)\s*\(/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Apply authentication middleware to all protected routes. Use a route grouping pattern to apply middleware consistently.',
    confidence: 0.78,
    enabled: true,
  },

  {
    id: 'SEC-047',
    category: 'auth',
    owasp: 'A01:2021',
    severity: 'MEDIUM',
    name: 'JWT created without expiration',
    description: 'JWTs without an exp claim are valid indefinitely, increasing the blast radius if a token is leaked.',
    patterns: [
      /jwt\.sign\s*\(\s*[^)]*\{(?![^}]*\bexpiresIn\b)[^}]*\}\s*\)/i,
      /jwt\.sign\s*\(\s*[^)]*\{(?![^}]*\bexp\b)[^}]*\}\s*\)/i,
      /sign\s*\(\s*payload[^)]*\)(?!.*expiresIn)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Always set an expiresIn or exp claim when signing JWTs. Use short-lived tokens with refresh token rotation.',
    confidence: 0.82,
    enabled: true,
  },

  {
    id: 'SEC-048',
    category: 'auth',
    owasp: 'A07:2021',
    severity: 'HIGH',
    name: 'Session ID passed in URL',
    description: 'Session IDs in URLs are logged in server logs, browser history, and Referer headers.',
    patterns: [
      /session[_-]?id\s*=\s*req\.query/i,
      /req\.query\.(?:session|sid|token)/i,
      /window\.location.*session/i,
      /\?session=/i,
      /\?sid=/i,
      /\?token=\w+/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,java,go,rs,php}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Use HttpOnly, Secure cookies for session tokens. Never pass session IDs in URL query parameters.',
    confidence: 0.86,
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEC-049 – SEC-050 : File Access (A01:2021)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'SEC-049',
    category: 'file-access',
    owasp: 'A01:2021',
    severity: 'CRITICAL',
    name: 'Path traversal with ../',
    description: 'User-controlled input used in file paths with "../" can enable path traversal attacks.',
    patterns: [
      /\b(?:req\.(?:query|params|body)|request\.(?:query|params|body)|input|userInput|filePath)\b[^;]*\.\.\//,
      /path\.join\s*\([^)]*(?:req\.|request\.|params\.|query\.)/,
      /path\.resolve\s*\([^)]*(?:req\.|request\.|params\.|query\.)/,
      /\bfs\s*\.\s*(?:read|write|append|unlink|rmdir|mkdir|open|create)\w*\s*\([^)]*\+\s*/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py,go,rs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Validate and sanitize user input. Use path.resolve() and check that the resolved path is within the allowed directory.',
    confidence: 0.88,
    enabled: true,
  },

  {
    id: 'SEC-050',
    category: 'file-access',
    owasp: 'A01:2021',
    severity: 'CRITICAL',
    name: 'fs.readFile with user-controlled path',
    description: 'fs.readFile or fs.readFileSync with a user-influenced path enables arbitrary file read attacks.',
    patterns: [
      /\bfs\s*\.\s*readFile(?:Sync)?\s*\(\s*(?:req\.|request\.|params\.|query\.|body\.|\w+\.\w+\s*\+)/,
      /\bfs\s*\.\s*readFile(?:Sync)?\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`/,
      /\bfs\s*\.\s*readFile(?:Sync)?\s*\(\s*[^)]*(?:req\.params|req\.query|req\.body|request\.params|request\.query|request\.body)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Sanitize file paths. Use an allowlist of permitted paths. Validate that resolved paths stay within an allowed root directory.',
    confidence: 0.90,
    enabled: true,
  },
];

// ── Utility functions ──

export function loadRules(): SecurityRule[] {
  return ALL_RULES.filter((r) => r.enabled);
}

export function getRulesByCategory(category: SecurityCategory): SecurityRule[] {
  return ALL_RULES.filter((r) => r.category === category);
}

export function getRulesBySeverity(severity: string): SecurityRule[] {
  return ALL_RULES.filter((r) => r.severity === severity);
}
