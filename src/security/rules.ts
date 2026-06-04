// ── Security rules engine for milens ──

export type SecurityCategory =
  | 'secrets'
  | 'injection'
  | 'rce'
  | 'xss'
  | 'deserialization'
  | 'ssrf'
  | 'xxe'
  | 'path-traversal'
  | 'file-upload'
  | 'unicode'
  | 'dangerous'
  | 'config'
  | 'data-leak'
  | 'crypto'
  | 'auth'
  | 'jwt'
  | 'cors-headers'
  | 'dependency'
  | 'cloud'
  | 'docker'
  | 'kubernetes'
  | 'iac'
  | 'business-logic'
  | 'api-security'
  | 'misc'
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
  falsePositiveRisk?: 'high' | 'medium' | 'low';
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

const DEFAULT_EXCLUDE = '**/*.test.*,**/*.spec.*,**/node_modules/**,**/security/rules.ts,**/metric-milens-tool*.md,**/docs/**,**/*.html';

// ── Language-specific fileGlobs for cross-language coverage ──
const JS_TS = '**/*.{js,jsx,ts,tsx,mjs,cjs}';
const JS_TS_PY = '**/*.{js,jsx,ts,tsx,mjs,cjs,py}';
const ALL_CODE = '**/*.{js,jsx,ts,tsx,mjs,cjs,py,java,go,rs,rb,php}';
const PY_ONLY = '**/*.py';
const JAVA_ONLY = '**/*.java';
const PHP_ONLY = '**/*.php';
const DOCKER_FILES = '**/{Dockerfile,docker-compose.yml,docker-compose.yaml,.dockerignore}';
const K8S_FILES = '**/{deployment,service,pod,ingress,statefulset,daemonset,configmap,secret,role,rolebinding,clusterrole,clusterrolebinding}*.{yaml,yml}';
const TF_FILES = '**/*.tf';

// ── 190+ built-in security rules across 25 categories ──

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
      /(?:password|passwd|pwd)\s*=\s*(?!process\.env\.)[^'"`\s;]{4,}/i,
    ],
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace hardcoded password with process.env.DB_PASSWORD or a secrets manager.',
    confidence: 0.92,
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
      /res\.cookie\s*\((?!.*secure\s*:\s*true)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Set secure:true on all cookies in production. Use HTTPS everywhere.',
    confidence: 0.85,
    falsePositiveRisk: 'low', enabled: true,
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
      /res\.cookie\s*\((?!.*httpOnly\s*:\s*true)/,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Set httpOnly:true on all session/authentication cookies to prevent JavaScript access.',
    confidence: 0.85,
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
  },

  {
    id: 'SEC-040',
    category: 'data-leak',
    owasp: 'A09:2021',
    severity: 'LOW',
    name: 'General console.log left in production code',
    description: 'Unconditional console.log statements may leak internal state to the browser console in production.',
    patterns: [
      /^\s*console\.log\s*\([^)]*(?:\$\{|req\.|res\.|err|error|user|token|secret)/m,
      /^\s*console\.warn\s*\([^)]*(?:\$\{|req\.|res\.|err|error)/m,
      /^\s*console\.debug\s*\([^)]*(?:\$\{|req\.|res\.|token|secret)/m,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Replace console.log with a proper logging framework that supports log levels and can be silenced in production.',
    confidence: 0.70,
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
  },

  {
    id: 'SEC-047',
    category: 'auth',
    owasp: 'A01:2021',
    severity: 'MEDIUM',
    name: 'JWT created without expiration',
    description: 'JWTs without an exp claim are valid indefinitely, increasing the blast radius if a token is leaked.',
    patterns: [
      /jwt\.sign\s*\(\s*(?!.*\b(?:expiresIn|expires|exp)\b)[^)]*\)/i,
      /sign\s*\(\s*payload(?!.*\b(?:expiresIn|expires|exp)\b)[^)]*\)/i,
    ],
    fileGlob: '**/*.{js,jsx,ts,tsx,py}',
    excludeGlob: DEFAULT_EXCLUDE,
    fix: 'Always set an expiresIn or exp claim when signing JWTs. Use short-lived tokens with refresh token rotation.',
    confidence: 0.82,
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
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
    falsePositiveRisk: 'low', enabled: true,
  },

  { id: 'SEC-051', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Hardcoded JWT secret', description: 'JWT signing secret hardcoded in source code.', patterns: [/\b(?:jwtSecret|JWT_SECRET|jwt_secret)\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`]/, /secret\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`].*jwt/i], excludeGlob: DEFAULT_EXCLUDE, fix: 'Use process.env.JWT_SECRET from environment variables.', confidence: 0.95, falsePositiveRisk: 'medium', enabled: true },
  { id: 'SEC-052', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Hardcoded encryption key', description: 'Encryption key hardcoded in source code.', patterns: [/\b(?:encrypt(?:ion)?Key|ENCRYPT(?:ION)?_KEY|secretKey|SECRET_KEY)\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`]/i], fix: 'Use process.env.ENCRYPTION_KEY or a key management service.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-053', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Hardcoded AWS Secret Access Key', description: 'AWS secret access key exposed.', patterns: [/aws_secret_access_key\s*[:=]\s*['"`][A-Za-z0-9+\/=]{40}['"`]/i, /secretAccessKey\s*[:=]\s*['"`][A-Za-z0-9+\/=]{40}['"`]/], fix: 'Use AWS IAM roles or environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-054', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Hardcoded AWS Session Token', description: 'AWS session token exposed.', patterns: [/aws_session_token\s*[:=]\s*['"`][A-Za-z0-9+\/=]{100,}['"`]/i], fix: 'Use temporary credentials via IAM roles.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-055', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'GCP Service Account Key', description: 'Google Cloud service account JSON key exposed.', patterns: [/"type"\s*:\s*"service_account"/, /"private_key_id"\s*:\s*"[a-f0-9]+"/], fileGlob: '**/*.{json,js,ts}', fix: 'Use GCP IAM roles or Workload Identity.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-056', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Azure Storage Key', description: 'Azure storage account key exposed.', patterns: [/AccountKey\s*=\s*[A-Za-z0-9+\/=]{88}/, /DefaultEndpointsProtocol.*AccountKey/], fix: 'Use Azure Managed Identity.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-057', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Slack Token', description: 'Slack bot or user token exposed.', patterns: [/xox[baprs]\-[0-9A-Za-z\-]{10,}/], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-058', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Discord Token', description: 'Discord bot token exposed.', patterns: [/[MNO][A-Za-z\d\-_]{23,25}\.[A-Za-z\d\-_]{6}\.[A-Za-z\d\-_]{27,38}/], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-059', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Twilio Token', description: 'Twilio auth token or API key exposed.', patterns: [/SK[0-9a-fA-F]{32}/, /twilio.*token\s*[:=]\s*['"`][A-Za-z0-9]{32,}['"`]/i], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-060', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'SendGrid API Key', description: 'SendGrid API key exposed.', patterns: [/SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/, /sendgrid.*(?:api[_-]?key|key)\s*[:=]\s*['"`][A-Za-z0-9_\-]{20,}['"`]/i], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-061', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Firebase Admin Key', description: 'Firebase service account key or config exposed.', patterns: [/"project_id"\s*:\s*"[^"]+".*"private_key"/, /firebase.*config.*apiKey/i], fileGlob: '**/*.{json,js,ts}', fix: 'Use Firebase Admin SDK with environment-based credentials.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-062', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'DSA Private Key', description: 'DSA private key exposed.', patterns: [/-----BEGIN DSA PRIVATE KEY-----/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Store outside the repository.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-063', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'PGP Private Key', description: 'PGP/GPG private key exposed.', patterns: [/-----BEGIN PGP PRIVATE KEY BLOCK-----/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Store outside the repository.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-064', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'SSH Private Key', description: 'SSH private key exposed.', patterns: [/-----BEGIN (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Store outside the repository.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-065', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Generic Refresh Token', description: 'OAuth refresh token hardcoded.', patterns: [/refresh[_-]?token\s*[:=]\s*['"`][A-Za-z0-9_\-.]{16,}['"`]/i], fix: 'Store refresh tokens in secure storage.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-066', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Credential in Dockerfile', description: 'Credentials hardcoded in Dockerfile.', patterns: [/ENV\s+(?:PASSWORD|SECRET|TOKEN|KEY)\s*=\s*\S+/i, /ARG\s+(?:PASSWORD|SECRET|TOKEN|KEY)\s*=\s*\S+/i], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use Docker secrets or build args without default values.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-067', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Credential in Terraform', description: 'Secrets hardcoded in Terraform files.', patterns: [/(?:password|secret|token|key)\s*=\s*"[^"]{4,}"/i], fileGlob: TF_FILES, fix: 'Use Terraform variables with sensitive=true.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-068', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Credential in Kubernetes Manifest', description: 'Secrets hardcoded in K8s manifests.', patterns: [/(?:password|secret|token)\s*:\s*[A-Za-z0-9_\-]{8,}/], fileGlob: K8S_FILES, fix: 'Use Kubernetes Secrets and reference via secretKeyRef.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-069', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'GitLab Token', description: 'GitLab PAT exposed.', patterns: [/glpat\-[A-Za-z0-9_\-]{20,}/, /gitlab.*token\s*[:=]\s*['"`][A-Za-z0-9_\-]{20,}['"`]/i], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-070', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Hardcoded OAuth client secret', description: 'OAuth client secret hardcoded.', patterns: [/client[_-]?secret\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`]/i, /CLIENT_SECRET\s*=\s*['"`][A-Za-z0-9_\-]{16,}['"`]/], fix: 'Use environment variables or OAuth secret management.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-071 – SEC-087 : SQLi/NoSQLi/Template/Log Injection (A03:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-071', category: 'injection', owasp: 'A03:2021', severity: 'CRITICAL', name: 'NoSQL Injection', description: 'Unsanitized user input in NoSQL query.', patterns: [/\{\s*\$where\s*:\s*req\./, /\{\s*\$regex\s*:\s*req\./, /\.find\(\s*\{\s*[^}]*req\./, /\{\s*(?:\$(?:where|gt|lt|ne|in|nin|regex|eq|expr))\s*:/], fileGlob: JS_TS, fix: 'Sanitize all user input used in NoSQL queries.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-072', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'LDAP Injection', description: 'Unsanitized input in LDAP query filters.', patterns: [/\(.*=\s*(?:req\.|request\.|params\.|query\.|body\.)/, /ldap.*search.*filter.*req\./i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Escape LDAP filter special characters.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-073', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'XPath Injection', description: 'Unsanitized input in XPath expressions.', patterns: [/\.evaluate\s*\(\s*[`'"].*req\./, /xpath.*compile.*req\./i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use parameterized XPath queries.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-074', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'CRLF Injection', description: 'CRLF injection in HTTP response headers.', patterns: [/setHeader\s*\(\s*[`'"][^`'"]*\\r\\n/, /header\s*\(\s*[`'"][^`'"]*\\r\\n/, /response\.write.*%0d%0a/i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Strip CR/LF characters from user input before inserting into headers.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-075', category: 'injection', owasp: 'A03:2021', severity: 'CRITICAL', name: 'Server-Side Template Injection', description: 'User input rendered in template without sanitization.', patterns: [/render_template_string\s*\(.*req\./i, /\.render\s*\(\s*\{.*req\./, /\{\{.*req\.(?:params|query|body)/, /\$\{.*req\.(?:params|query|body)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Never pass raw user input to template render functions.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-076', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'EL/OGNL Injection', description: 'Expression Language injection in Java.', patterns: [/\$\{[^}]*request\.getParameter/, /#\{[^}]*request\.getParameter/], fileGlob: JAVA_ONLY, fix: 'Do not evaluate user input as EL/OGNL.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-077', category: 'injection', owasp: 'A03:2021', severity: 'MEDIUM', name: 'CSV Formula Injection', description: 'CSV export vulnerable to formula injection.', patterns: [/\.write\s*\(\s*[`'"].*=[`'"]/, /csv.*write.*=/i, /to_csv.*=/i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Prefix cells starting with =, +, -, @ with a single quote.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-078', category: 'injection', owasp: 'A03:2021', severity: 'MEDIUM', name: 'Log Injection', description: 'User input written to logs without sanitization.', patterns: [/logger\s*\.\s*(?:info|error|warn|debug|log)\s*\(\s*[^)]*req\./, /console\.log\s*\(\s*[^)]*req\.(?:params|query|body)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Sanitize user input before logging. Strip newlines.', confidence: 0.75, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-079', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'Mongo Operator Injection', description: 'User-controlled $ operators in MongoDB.', patterns: [/\$\s*(?:where|regex|gt|lt|ne|in|nin|expr)\s*:\s*(?:req\.|request\.|params\.|query\.|body\.)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Whitelist allowed operators and sanitize values.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-080', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'GraphQL Injection', description: 'Raw GraphQL query built with user input.', patterns: [/graphql\s*\(\s*[`'].*req\./, /gql\s*\(\s*[`'].*req\./, /execute\s*\(\s*[`'].*req\./i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use parameterized queries and input validation.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-081', category: 'injection', owasp: 'A03:2021', severity: 'MEDIUM', name: 'Host Header Injection', description: 'Request host header used unsafely.', patterns: [/req\.(?:headers|get)\(?['"]host['"]/, /request\.getHeader\s*\(\s*['"]Host['"]/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate host header against a trusted domain list.', confidence: 0.75, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-082', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'Email Header Injection', description: 'User input in email headers.', patterns: [/mail\s*\(\s*\{[^}]*subject\s*:\s*(?:req\.|request\.|params\.)/, /sendmail.*(?:req\.|request\.|params\.)/i, /transport\.sendMail.*req\./i], fileGlob: JS_TS_PY, fix: 'Sanitize user input before inserting into email headers.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-083', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'HTTP Header Injection', description: 'User input inserted into HTTP response headers.', patterns: [/res\.setHeader\s*\(\s*(?:req\.|request\.|params\.)/, /response\.headers\.set\s*\(\s*[`'][^`']*\$\{/, /header\s*\(\s*[`'][^`']*\$\{.*req\./], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Strip newline characters from user input before setting headers.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-084', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'XML Injection', description: 'User input inserted into XML without encoding.', patterns: [/\.innerHTML\s*=\s*['"`]<\?xml/, /xml\s*\+\s*(?:req\.|request\.|params\.)/, /xmldom.*parse.*req\./i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Encode special XML characters before insertion.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-085', category: 'injection', owasp: 'A03:2021', severity: 'MEDIUM', name: 'Argument Injection', description: 'Command arguments built from user input.', patterns: [/\.spawn\s*\(\s*['"][^'"]+['"]\s*,\s*\[.*(?:req\.|request\.|params\.)/, /execFile\s*\(\s*['"][^'"]+['"]\s*,\s*\[.*(?:req\.|request\.|params\.)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate and sanitize arguments. Do not use user input in command arguments.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-086', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'Shell Injection', description: 'Shell command with user-supplied input.', patterns: [/exec\s*\(\s*[`'].*\$\{.*req\./, /exec\s*\(\s*['"][^'"]*['"]\s*\+\s*(?:req\.|request\.|params\.)/, /`[^`]*\$[({]\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use execFile instead of exec. Avoid shell interpretation.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-087', category: 'injection', owasp: 'A03:2021', severity: 'HIGH', name: 'Dynamic Code Generation', description: 'User input used to generate executable code.', patterns: [/new Function\s*\(\s*(?:req\.|request\.|params\.)/, /compile\s*\(\s*(?:req\.|request\.|params\.)/, /vm\.runInNewContext.*req\./], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Never generate executable code from user input.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-088 – SEC-095 : RCE (A03:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-088', category: 'rce', owasp: 'A03:2021', severity: 'CRITICAL', name: 'execSync() dynamic input', description: 'execSync with user-controlled input.', patterns: [/execSync\s*\(\s*[^)]*(?:req\.|request\.|params\.|query\.|body\.)/, /execSync\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`/], fileGlob: JS_TS, fix: 'Avoid execSync with user input.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-089', category: 'rce', owasp: 'A03:2021', severity: 'CRITICAL', name: 'PowerShell Invoke-Expression', description: 'Invoke-Expression with dynamic input.', patterns: [/Invoke-Expression\s+\$/, /iex\s+\$/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Never use Invoke-Expression with variable input.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-090', category: 'rce', owasp: 'A03:2021', severity: 'HIGH', name: 'Dynamic Class Loading', description: 'Dynamic class loading with user-controlled name.', patterns: [/Class\.forName\s*\(\s*req\./, /classLoader\.loadClass\s*\(\s*req\./i, /importlib\.import_module\s*\(\s*req\./i, /__import__\s*\(\s*req\./i], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use an allowlist for dynamically loaded classes.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-091', category: 'rce', owasp: 'A03:2021', severity: 'HIGH', name: 'Reflection Execute', description: 'Reflection-based invocation with user input.', patterns: [/\.getMethod\s*\(\s*req\./, /\.invoke\s*\([^)]*req\./, /method\.call\s*\([^)]*req\./], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use an allowlist of permitted methods.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-092', category: 'rce', owasp: 'A03:2021', severity: 'HIGH', name: 'Unsafe Script Engine', description: 'Script engine evaluating user input.', patterns: [/scriptEngine\.eval\s*\(\s*req\./i, /ScriptEngine.*eval.*request/i], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Never pass user input to script engine eval.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-093', category: 'rce', owasp: 'A03:2021', severity: 'HIGH', name: 'Bash Command Substitution', description: 'Shell command substitution with user input.', patterns: [/`\s*\$[({]\s*(?:req\.|request\.|params\.|query\.)/, /\$\(\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use execFile instead of shell commands with substitution.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-094 – SEC-100 : XSS (A03:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-094', category: 'xss', owasp: 'A03:2021', severity: 'HIGH', name: 'outerHTML dynamic assignment', description: 'outerHTML set with dynamic content.', patterns: [/\.outerHTML\s*=\s*(?:req\.|request\.|params\.|query\.)/, /\.outerHTML\s*=\s*[`'].*\$\{/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use textContent or DOM manipulation instead.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-095', category: 'xss', owasp: 'A03:2021', severity: 'HIGH', name: 'insertAdjacentHTML dynamic', description: 'insertAdjacentHTML called with user input.', patterns: [/\.insertAdjacentHTML\s*\(\s*[^,]*,\s*(?:req\.|request\.|params\.)/, /\.insertAdjacentHTML\s*\(\s*[^,]*,\s*`[^`]*\$/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use insertAdjacentElement or textContent instead.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-096', category: 'xss', owasp: 'A03:2021', severity: 'HIGH', name: 'jQuery html() dynamic', description: 'jQuery .html() called with user input.', patterns: [/\$\([^)]*\)\s*\.\s*html\s*\(\s*(?:req\.|request\.|params\.)/, /\.html\s*\(\s*[`'].*\$\{[^}]*req\./], fileGlob: JS_TS, fix: 'Use .text() instead of .html() for user content.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-097', category: 'xss', owasp: 'A03:2021', severity: 'HIGH', name: 'DOM XSS Sink', description: 'User input flowing into DOM XSS sink.', patterns: [/\.(?:innerHTML|outerHTML)\s*=\s*(?:location|document\.)/, /eval\s*\(\s*(?:location\.hash|location\.search)/, /document\.write\s*\(\s*(?:location\.hash|location\.search)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Sanitize all user input before DOM insertion.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-098', category: 'xss', owasp: 'A03:2021', severity: 'MEDIUM', name: 'SVG Script Injection', description: 'Inline SVG with script tag.', patterns: [/<svg[^>]*>.*<script/i, /<svg[^>]*onload\s*=/i], fileGlob: '**/*.{jsx,tsx}', fix: 'Sanitize SVG content before rendering.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-099', category: 'xss', owasp: 'A03:2021', severity: 'HIGH', name: 'Inline Event Handler Injection', description: 'Inline event handlers with user data.', patterns: [/on(?:click|load|error|mouseover|focus|blur|submit)\s*=\s*[`'].*\$\{/, /on\w+\s*=\s*\{.*req\./], fileGlob: '**/*.{jsx,tsx}', fix: 'Use addEventListener instead of inline handlers.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-100', category: 'xss', owasp: 'A03:2021', severity: 'MEDIUM', name: 'Unsafe Markdown Rendering', description: 'Markdown rendered without sanitization.', patterns: [/dangerouslySetInnerHTML.*marked/, /\.innerHTML\s*=.*markdown/i, /\.innerHTML\s*=.*md\s*\(/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use DOMPurify to sanitize rendered HTML.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-101 – SEC-110 : Deserialization (A08:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-101', category: 'deserialization', owasp: 'A08:2021', severity: 'CRITICAL', name: 'marshal.loads() untrusted', description: 'Python marshal.loads on untrusted data.', patterns: [/marshal\.loads?\s*\(/, /marshal\.load\s*\(/], fileGlob: PY_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use json.loads instead.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-102', category: 'deserialization', owasp: 'A08:2021', severity: 'CRITICAL', name: 'yaml.load() unsafe', description: 'PyYAML yaml.load without SafeLoader.', patterns: [/yaml\.load\s*\(/, /yaml\.load\s*\([^,)]*\)/, /yaml\.load_all\s*\(/], fileGlob: PY_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use yaml.safe_load() instead.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-103', category: 'deserialization', owasp: 'A08:2021', severity: 'CRITICAL', name: 'Java readObject() untrusted', description: 'ObjectInputStream.readObject on untrusted data.', patterns: [/ObjectInputStream.*readObject/, /\.readObject\s*\(\s*\)/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate serialized objects. Use a whitelist.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-104', category: 'deserialization', owasp: 'A08:2021', severity: 'CRITICAL', name: 'BinaryFormatter Deserialize', description: 'BinaryFormatter.Deserialize.', patterns: [/BinaryFormatter.*Deserialize/, /IFormatter.*Deserialize/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Use a safer serializer or whitelist allowed types.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-105', category: 'deserialization', owasp: 'A08:2021', severity: 'HIGH', name: 'Jackson Default Typing', description: 'Jackson ObjectMapper with default typing.', patterns: [/enableDefaultTyping\s*\(/, /ObjectMapper.*enableDefaultTyping/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable default typing or use a strict type whitelist.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-106', category: 'deserialization', owasp: 'A08:2021', severity: 'HIGH', name: 'Fastjson AutoType', description: 'Fastjson with autoType enabled.', patterns: [/JSON\.parse.*autoType/, /ParserConfig.*AutoTypeSupport/, /@type\s*:/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable autoType in Fastjson.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-107', category: 'deserialization', owasp: 'A08:2021', severity: 'HIGH', name: 'PHP unserialize() untrusted', description: 'unserialize on untrusted data.', patterns: [/unserialize\s*\(\s*(?:\$_(?:GET|POST|REQUEST|COOKIE)|req\.|request\.)/i, /unserialize\s*\(\s*[^)]*base64_decode/], fileGlob: PHP_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use json_decode instead. Never unserialize user input.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-108', category: 'deserialization', owasp: 'A08:2021', severity: 'HIGH', name: 'Kryo Unsafe Deserialize', description: 'Kryo deserialization without registration.', patterns: [/new Kryo\s*\(/, /kryo\.readClassAndObject/, /kryo\.readObject/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Enable registration required.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-109', category: 'deserialization', owasp: 'A08:2021', severity: 'HIGH', name: 'XMLDecoder Deserialization', description: 'XMLDecoder used for deserialization.', patterns: [/XMLDecoder/, /xmlDecoder\.readObject/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Avoid XMLDecoder. Use a safer data format.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-110 – SEC-115 : SSRF (A10:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-110', category: 'ssrf', owasp: 'A10:2021', severity: 'CRITICAL', name: 'User Controlled URL Fetch', description: 'User-supplied URL in HTTP request.', patterns: [/fetch\s*\(\s*(?:req\.|request\.|params\.|query\.|body\.)/, /axios\s*\(\s*\{[^}]*url\s*:\s*(?:req\.|request\.)/, /requests\.(?:get|post|put)\s*\(\s*(?:req\.|request\.|params\.)/i, /http\.(?:get|request)\s*\(\s*(?:req\.|request\.|params\.)/, /got\s*\(\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, fix: 'Validate user-supplied URLs against a whitelist of allowed domains.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-111', category: 'ssrf', owasp: 'A10:2021', severity: 'HIGH', name: 'SSRF via File URL', description: 'file:// URL used with user input.', patterns: [/['"`]file:\/\/['"`]\s*\+/, /url\.startsWith\s*\(\s*['"`]file:/, /['"`]file:\/\/['"`]\s*\+\s*(?:req\.|request\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Block file:// URLs from user input.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-112', category: 'ssrf', owasp: 'A10:2021', severity: 'MEDIUM', name: 'SSRF via Gopher Protocol', description: 'gopher:// URL with user input.', patterns: [/['"`]gopher:\/\/['"`]/, /url\.includes\s*\(\s*['"`]gopher:/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Block gopher:// URLs from user input.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-113', category: 'ssrf', owasp: 'A10:2021', severity: 'HIGH', name: 'SSRF Cloud Metadata', description: 'Requests to cloud metadata endpoints.', patterns: [/169\.254\.169\.254/, /metadata\.google\.internal/, /instance-data/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Block requests to internal IPs and metadata endpoints.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-114 – SEC-116 : XXE (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-114', category: 'xxe', owasp: 'A05:2021', severity: 'CRITICAL', name: 'XML External Entity', description: 'XML parser with external entities enabled.', patterns: [/DocumentBuilderFactory.*setExpandEntityReferences\s*\(\s*true/, /SAXParserFactory.*external-general-entities.*true/, /XMLInputFactory.*IS_SUPPORTING_EXTERNAL_ENTITIES.*true/], fileGlob: JAVA_ONLY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable external entities.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-115', category: 'xxe', owasp: 'A05:2021', severity: 'HIGH', name: 'DTD Processing Enabled', description: 'XML DTD processing enabled.', patterns: [/DOCTYPE/, /<!ENTITY/, /xml\.etree\.ElementTree.*DOCTYPE/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable DTD processing in XML parsers.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-116', category: 'xxe', owasp: 'A05:2021', severity: 'HIGH', name: 'External Schema Loading', description: 'XML schema loaded from external URL.', patterns: [/schemaLocation\s*=\s*['"`]http/, /xsi:schemaLocation\s*=\s*['"`]http/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable loading of external schemas.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-117 – SEC-122 : Path Traversal & File Operations (A01:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-117', category: 'path-traversal', owasp: 'A01:2021', severity: 'HIGH', name: 'Absolute Path Injection', description: 'User input used as absolute file path.', patterns: [/\/\s*\+\s*(?:req\.|request\.|params\.|query\.|body\.)/, /path\.join\s*\(\s*['"`]\/['"`]\s*,\s*(?:req\.|request\.|params\.)/, /os\.path\.join\s*\(\s*['"`]\/['"`]\s*,\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Restrict file access to an allowed directory.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-118', category: 'path-traversal', owasp: 'A01:2021', severity: 'HIGH', name: 'Zip Slip', description: 'Zip extraction with path traversal.', patterns: [/\.extract\s*\(\s*(?:req\.|request\.)/, /unzip.*\.\./i, /extractall\s*\(/, /tar\.extract/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate each entry path before extraction.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-119', category: 'file-access', owasp: 'A01:2021', severity: 'HIGH', name: 'fs.writeFile user path', description: 'fs.writeFile with user-controlled path.', patterns: [/fs\.writeFile(?:Sync)?\s*\(\s*(?:req\.|request\.|params\.|query\.|body\.)/, /fs\.writeFile(?:Sync)?\s*\(\s*`[^`]*\$\{/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Restrict write paths to an allowed directory.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-120', category: 'file-upload', owasp: 'A01:2021', severity: 'CRITICAL', name: 'Unrestricted File Upload', description: 'File upload without type/size validation.', patterns: [/\.upload\s*\(/, /multer\s*\(\s*\{[^}]*\}\s*\)/, /req\.file\s*\./, /request\.files\s*\./], fileGlob: JS_TS_PY, fix: 'Validate file type, size, and scan for malware.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-121 – SEC-128 : Authentication & Authorization (A07:2021 + A01:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-121', category: 'auth', owasp: 'A07:2021', severity: 'CRITICAL', name: 'Missing Authentication', description: 'Route handler without authentication check.', patterns: [/router\.(?:get|post|put|delete|patch)\s*\(\s*['"`]\/(?:admin|api|dashboard)['"`]\s*,\s*(?!\s*(?:auth|middleware|guard|authenticate|isAuth|requireAuth|withAuth)\b)/i, /@(?:Get|Post|Put|Delete)\s*\(\s*['"].*(?:admin|api)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Add authentication middleware.', confidence: 0.65, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-122', category: 'auth', owasp: 'A07:2021', severity: 'HIGH', name: 'Default Credentials', description: 'Default username/password in code.', patterns: [/['"`]admin['"`]\s*,\s*['"`]admin['"`]/, /['"`]root['"`]\s*,\s*['"`]root['"`]/, /['"`]admin['"`]\s*,\s*['"`]password['"`]/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Replace default credentials. Use environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-123', category: 'auth', owasp: 'A07:2021', severity: 'HIGH', name: 'Session Fixation', description: 'Session ID not regenerated after login.', patterns: [/session\.regenerate/, /req\.session\.regenerate/, /login.*session/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Regenerate session ID after authentication.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-124', category: 'auth', owasp: 'A01:2021', severity: 'HIGH', name: 'IDOR Vulnerability', description: 'User ID from request used in data access.', patterns: [/\.findById\s*\(\s*req\.params\.(?!.*(?:userId|ownerId|user_id)\s*[:=])/, /\.get\s*\(\s*req\.params\.id(?!.*(?:userId|ownerId|user_id)\s*[:=])/, /WHERE.*=\s*req\.params\./i, /SELECT.*req\.params\./i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Verify that the requesting user owns the resource.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-125', category: 'auth', owasp: 'A01:2021', severity: 'HIGH', name: 'Mass Assignment', description: 'Request body spread directly into model.', patterns: [/\.create\s*\(\s*req\.body/, /\.update\s*\(\s*[^,]*,\s*req\.body/, /new\s+\w+\s*\(\s*req\.body/, /\w+\s*\.\s*set\s*\(\s*req\.body/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Whitelist allowed fields.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-126', category: 'auth', owasp: 'A01:2021', severity: 'MEDIUM', name: 'Privilege Escalation', description: 'Role set from request without validation.', patterns: [/role\s*[:=]\s*req\.(?:body|params|query)\./, /req\.body\.role/, /\.role\s*=\s*req\./], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Never set user role from client input.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-127', category: 'auth', owasp: 'A07:2021', severity: 'HIGH', name: 'Missing Rate Limiting', description: 'Login endpoint without rate limiting.', patterns: [/router\.(?:post|get)\s*\(\s*['"`]\/(?:login|signin|auth)/, /@(?:Post|Get)\s*\(\s*['"].*(?:login|signin|auth)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Add rate limiting to auth endpoints.', confidence: 0.60, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-128', category: 'auth', owasp: 'A07:2021', severity: 'MEDIUM', name: 'Predictable Session ID', description: 'Custom session ID generation.', patterns: [/Math\.random.*session/i, /Date\.now\s*\(\s*\).*session/i, /session.*=.*toString\s*\(\s*36\s*\)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use framework built-in session ID generation.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-129 – SEC-135 : JWT & Session (A07:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-129', category: 'jwt', owasp: 'A07:2021', severity: 'CRITICAL', name: 'JWT None Algorithm', description: 'JWT verified without algorithm check.', patterns: [/algorithms\s*:\s*\[['"`]none['"`]\]/, /verify\s*\(\s*token.*none/i, /jwt\.verify\s*\((?!.*algorithms\s*:)/i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Always specify allowed algorithms in jwt.verify().', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-130', category: 'jwt', owasp: 'A07:2021', severity: 'HIGH', name: 'JWT weak secret', description: 'JWT signed with short/weak secret.', patterns: [/jwt\.sign\s*\([^,]*,\s*['"`][A-Za-z0-9]{1,15}['"`]\)/, /JWT_SECRET\s*=\s*['"`][A-Za-z0-9]{1,15}['"`]/], fix: 'Use a secret of at least 256 bits.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-131', category: 'jwt', owasp: 'A07:2021', severity: 'CRITICAL', name: 'JWT Signature Not Verified', description: 'JWT used without signature verification.', patterns: [/jwt\.decode\s*\(\s*token\s*\)/, /\.decode\s*\(\s*token\s*\)/, /jose.*decode.*without.*verify/i], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Always use jwt.verify() instead of jwt.decode().', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-132', category: 'jwt', owasp: 'A07:2021', severity: 'MEDIUM', name: 'JWT Long Expiration', description: 'JWT with excessively long expiration.', patterns: [/expiresIn\s*:\s*['"`]\d{2,}d['"`]/, /expiresIn\s*:\s*\d{8,}/, /maxAge\s*:\s*\d{8,}/], fileGlob: JS_TS_PY, fix: 'Use short-lived tokens with refresh tokens.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-133 – SEC-142 : Crypto (A02:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-133', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'MD2 Hash', description: 'MD2 hash used (broken).', patterns: [/['"`]md2['"`]/i, /MD2\s*\./, /hashlib\.md2/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use SHA-256 or better.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-134', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'MD4 Hash', description: 'MD4 hash used (broken).', patterns: [/['"`]md4['"`]/i, /MD4\s*\./, /hashlib\.md4/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use SHA-256 or better.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-135', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'DES Encryption', description: 'DES cipher used (broken).', patterns: [/['"`]des['"`]/i, /Cipher\.getInstance\s*\(\s*['"]DES/, /DES\.MODE/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use AES-256-GCM. Do not use DES.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-136', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: '3DES Encryption', description: '3DES cipher used (deprecated).', patterns: [/['"`]3des['"`]/i, /['"`]DESede['"`]/, /TripleDES/, /3DES\.MODE/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use AES-256-GCM.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-137', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'RC2 Encryption', description: 'RC2 cipher used (broken).', patterns: [/['"`]rc2['"`]/i, /RC2\.MODE/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use AES-256-GCM.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-138', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'RC4 Encryption', description: 'RC4 cipher used (broken).', patterns: [/['"`]rc4['"`]/i, /ArcFour/, /RC4\.MODE/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use AES-256-GCM.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-139', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'ECB Mode Encryption', description: 'ECB cipher mode used (insecure).', patterns: [/['"`]ECB['"`]/, /Cipher\.getInstance\s*\(\s*['"]AES\/ECB/, /AES\.MODE_ECB/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use AES-GCM or AES-CBC with random IV.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-140', category: 'crypto', owasp: 'A02:2021', severity: 'MEDIUM', name: 'Weak RSA Key Length', description: 'RSA key < 2048 bits.', patterns: [/RSA\.generate\s*\(\s*1024/, /rsa\.generate\s*\(\s*1024/], fileGlob: ALL_CODE, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use RSA keys of at least 2048 bits.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-141', category: 'crypto', owasp: 'A02:2021', severity: 'HIGH', name: 'Custom Crypto Implementation', description: 'Custom cryptography detected.', patterns: [/function\s+(?:encrypt|decrypt|hash|cipher)\s*\(/, /class\s+(?:Encrypt|Decrypt|Cipher|Hash)\s*\{/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use well-vetted libraries. Never roll your own crypto.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-142', category: 'crypto', owasp: 'A02:2021', severity: 'MEDIUM', name: 'Insecure UUID Generation', description: 'Non-cryptographic UUID.', patterns: [/Math\.random.*uuid/i, /\.substring.*Math\.random/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use crypto.randomUUID() instead.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-143 – SEC-148 : CORS & Headers (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-143', category: 'cors-headers', owasp: 'A05:2021', severity: 'HIGH', name: 'CORS Wildcard Credentials', description: 'CORS with credentials and wildcard origin.', patterns: [/credentials\s*:\s*true.*origin\s*:\s*['"`]\*['"`]/, /origin\s*:\s*['"`]\*['"`].*credentials\s*:\s*true/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Specify explicit origins when using credentials.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-144', category: 'cors-headers', owasp: 'A05:2021', severity: 'HIGH', name: 'Missing HSTS Header', description: 'Strict-Transport-Security not configured.', patterns: [/hsts\s*:\s*false/i, /Strict-Transport-Security.*max-age=0/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Enable HSTS with max-age at least 1 year.', confidence: 0.60, falsePositiveRisk: 'medium', enabled: true },
  { id: 'SEC-145', category: 'cors-headers', owasp: 'A05:2021', severity: 'MEDIUM', name: 'Missing X-Frame-Options', description: 'X-Frame-Options not set.', patterns: [/frameGuard\s*:\s*false/i, /frameguard\s*:\s*false/i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set X-Frame-Options: DENY or SAMEORIGIN.', confidence: 0.55, falsePositiveRisk: 'medium', enabled: true },
  { id: 'SEC-146', category: 'cors-headers', owasp: 'A05:2021', severity: 'MEDIUM', name: 'Missing X-Content-Type-Options', description: 'nosniff header not set.', patterns: [/noSniff\s*:\s*false/i, /nosniff\s*:\s*false/i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set X-Content-Type-Options: nosniff.', confidence: 0.55, falsePositiveRisk: 'medium', enabled: true },
  { id: 'SEC-147', category: 'cors-headers', owasp: 'A05:2021', severity: 'LOW', name: 'Missing Referrer Policy', description: 'Referrer-Policy not set.', patterns: [/referrerPolicy\s*:\s*false/i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set Referrer-Policy: strict-origin-when-cross-origin.', confidence: 0.45, falsePositiveRisk: 'high', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-148 – SEC-155 : Info Disclosure (A09:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-148', category: 'data-leak', owasp: 'A09:2021', severity: 'HIGH', name: 'Stack Trace Exposure', description: 'Error details sent to client.', patterns: [/res\.send\s*\(\s*err\.stack/, /\.status.*\.send.*err/, /\.json\s*\(\s*\{\s*error\s*:\s*err/, /traceback\.format_exc\s*\(\s*\)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Log errors server-side. Send generic error messages.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-149', category: 'data-leak', owasp: 'A09:2021', severity: 'MEDIUM', name: 'Source Map Exposure', description: 'Source maps deployed to production.', patterns: [/\.map['"`]\s*\)/, /sourceMap.*true.*production/i, /devtool.*source-map/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Do not deploy source maps to production.', confidence: 0.55, falsePositiveRisk: 'medium', enabled: true },
  { id: 'SEC-150', category: 'data-leak', owasp: 'A09:2021', severity: 'HIGH', name: 'Git Directory Exposure', description: '.git directory accessible.', patterns: [/\.git\/HEAD/, /\.git\/config/], fileGlob: '**/*.{json,yaml,yml}', fix: 'Ensure .git directory is not deployed.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-151', category: 'data-leak', owasp: 'A09:2021', severity: 'MEDIUM', name: 'Backup File Exposure', description: 'Backup files deployed.', patterns: [/\.bak['"`]/, /\.backup['"`]/, /\.old['"`]/, /\.swp['"`]/, /~\s*$/], excludeGlob: DEFAULT_EXCLUDE, fix: 'Remove backup files before deployment.', confidence: 0.50, falsePositiveRisk: 'high', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-152 – SEC-156 : Docker Security (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-152', category: 'docker', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Container Running As Root', description: 'Docker container runs as root.', patterns: [/USER\s+root/, /^USER\s+0$/m], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Run containers as a non-root user.', confidence: 0.55, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-153', category: 'docker', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Privileged Container', description: 'Container in privileged mode.', patterns: [/privileged\s*:\s*true/, /--privileged/], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Remove privileged mode.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-154', category: 'docker', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Docker Socket Mounted', description: 'Docker socket mounted.', patterns: [/\/var\/run\/docker\.sock/], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Do not mount Docker socket.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-155', category: 'docker', owasp: 'A05:2021', severity: 'HIGH', name: 'ADD Remote URL', description: 'ADD with remote URL.', patterns: [/^ADD\s+https?:/, /^ADD\s+http:/], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use curl with pinned checksums.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-156', category: 'docker', owasp: 'A05:2021', severity: 'MEDIUM', name: 'Latest Tag Usage', description: ':latest tag in production.', patterns: [/:latest/, /image\s*:\s*\w+\s*$/, /FROM\s+\w+\s*$/], fileGlob: DOCKER_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Pin to a specific version tag.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-157 – SEC-162 : Kubernetes Security (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-157', category: 'kubernetes', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Privileged Pod', description: 'K8s pod with privileged context.', patterns: [/privileged\s*:\s*true/, /securityContext\s*:\s*\n\s*privileged\s*:\s*true/], fileGlob: K8S_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Do not run pods in privileged mode.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-158', category: 'kubernetes', owasp: 'A05:2021', severity: 'CRITICAL', name: 'HostPath Mount', description: 'hostPath volume mount.', patterns: [/hostPath\s*:/, /path\s*:\s*\/[^\/]/], fileGlob: K8S_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Avoid hostPath mounts.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-159', category: 'kubernetes', owasp: 'A05:2021', severity: 'HIGH', name: 'Run As Root', description: 'Pod with runAsUser 0.', patterns: [/runAsUser\s*:\s*0/, /runAsNonRoot\s*:\s*false/], fileGlob: K8S_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set runAsNonRoot: true.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-160', category: 'kubernetes', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Cluster Admin Binding', description: 'ClusterRoleBinding to cluster-admin.', patterns: [/cluster-admin/, /ClusterRoleBinding.*cluster-admin/], fileGlob: K8S_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use least-privilege roles.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-161', category: 'kubernetes', owasp: 'A05:2021', severity: 'HIGH', name: 'Host Network Enabled', description: 'Pod using host network.', patterns: [/hostNetwork\s*:\s*true/, /hostPID\s*:\s*true/, /hostIPC\s*:\s*true/], fileGlob: K8S_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable hostNetwork/hostPID/hostIPC.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-162 – SEC-166 : Terraform/IaC (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-162', category: 'iac', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Open CIDR 0.0.0.0/0', description: 'Security group open to world.', patterns: [/cidr_blocks\s*=\s*\[['"]0\.0\.0\.0\/0['"]\]/, /source_ranges\s*=\s*\[['"]0\.0\.0\.0\/0['"]\]/], fileGlob: TF_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Restrict CIDR blocks.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-163', category: 'iac', owasp: 'A05:2021', severity: 'HIGH', name: 'Unencrypted Storage', description: 'Storage without encryption.', patterns: [/encrypted\s*=\s*false/, /encryption\s*{\s*enabled\s*=\s*false/], fileGlob: TF_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Enable encryption at rest.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-164', category: 'iac', owasp: 'A05:2021', severity: 'HIGH', name: 'Public Database Instance', description: 'Database publicly accessible.', patterns: [/publicly_accessible\s*=\s*true/], fileGlob: TF_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set publicly_accessible to false.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-165 – SEC-172 : Cloud Security (A05:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-165', category: 'cloud', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Public S3 Bucket', description: 'S3 bucket with public access.', patterns: [/acl\s*=\s*['"]public/, /block_public_acls\s*=\s*false/, /block_public_policy\s*=\s*false/], fileGlob: TF_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Block all public access to S3 buckets.', confidence: 0.50, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-166', category: 'cloud', owasp: 'A05:2021', severity: 'CRITICAL', name: 'Open Security Group', description: 'Security group wide-open ports.', patterns: [/from_port\s*=\s*0.*to_port\s*=\s*0/, /protocol\s*=\s*['"]\-1['"]/], fileGlob: TF_FILES, excludeGlob: DEFAULT_EXCLUDE, fix: 'Restrict security group rules.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-167 – SEC-172 : API Security (A01/A04:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-167', category: 'api-security', owasp: 'A01:2021', severity: 'HIGH', name: 'Missing API Authentication', description: 'API endpoint without auth.', patterns: [/router\.\w+\s*\(\s*['"`]\/api\/v?\d*\/\w+['"`]\s*,/, /@\w+\s*\(\s*['"`]\/api\/v?\d*\/\w+['"`]\)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Require authentication for all API endpoints.', confidence: 0.65, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-168', category: 'api-security', owasp: 'A04:2021', severity: 'MEDIUM', name: 'Missing Request Size Limit', description: 'No body size limit on API.', patterns: [/bodyParser\.json\s*\(\s*\)/, /express\.json\s*\(\s*\)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set a reasonable request body size limit.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-169', category: 'api-security', owasp: 'A04:2021', severity: 'MEDIUM', name: 'GraphQL Introspection Enabled', description: 'Introspection left enabled.', patterns: [/introspection\s*:\s*true/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Disable GraphQL introspection in production.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-170', category: 'api-security', owasp: 'A04:2021', severity: 'MEDIUM', name: 'GraphQL Excessive Depth', description: 'No depth limit on queries.', patterns: [/ApolloServer.*no.*depth/, /graphql.*no.*maxDepth/i, /validationRules.*\[\s*\]/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Set a maximum query depth.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-171 – SEC-175 : Business Logic (A04:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-171', category: 'business-logic', owasp: 'A04:2021', severity: 'MEDIUM', name: 'Integer Overflow', description: 'Integer arithmetic potentially vulnerable to overflow.', patterns: [/amount\s*\*\s*\d+\s*\+/, /\b(?:price|amount|total|cost)\s*\*\s*(?:req\.|request\.|params\.|query\.|body\.)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use BigInt for financial calculations.', confidence: 0.40, falsePositiveRisk: 'high', enabled: true },
  { id: 'SEC-172', category: 'business-logic', owasp: 'A04:2021', severity: 'MEDIUM', name: 'Negative Value Processing', description: 'No validation for negative values.', patterns: [/price\s*=\s*req\.body\./, /amount\s*=\s*req\.body\./, /quantity\s*=\s*req\.body\./], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate that price/amount values are positive.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-173', category: 'business-logic', owasp: 'A04:2021', severity: 'MEDIUM', name: 'TOCTOU Vulnerability', description: 'Check-then-use pattern.', patterns: [/if\s*\(\s*existsSync/, /if\s*\(\s*fs\.existsSync/, /if\s*\(\s*os\.path\.exists/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Use atomic operations.', confidence: 0.75, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-174 – SEC-180 : Misc (various OWASP)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-174', category: 'misc', owasp: 'A01:2021', severity: 'HIGH', name: 'Open Redirect', description: 'User-controlled URL in redirect.', patterns: [/res\.redirect\s*\(\s*(?:req\.|request\.|params\.|query\.|body\.)/, /redirect\s*\(\s*(?:req\.|request\.|params\.|query\.|body\.)/, /location\.(?:replace|href|assign)\s*=\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate redirect URLs against a whitelist.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-175', category: 'misc', owasp: 'A01:2021', severity: 'HIGH', name: 'Missing CSRF Protection', description: 'State-changing endpoint without CSRF.', patterns: [/csrf\s*:\s*false/i, /\.post\s*\(\s*['"`]\/[^'"]*['"`]\s*,(?!.*csrf)/], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Enable CSRF protection.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-176', category: 'misc', owasp: 'A03:2021', severity: 'MEDIUM', name: 'Unsafe Regex (ReDoS)', description: 'Regex with catastrophic backtracking.', patterns: [/\(\s*\w\+\s*\)\s*\+\s*\)/, /\(\s*\.\*\s*\)\s*\+/, /\(\s*(?:\w\+\s*\|)+\w\+\s*\)\s*\*/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Rewrite regex to avoid nested quantifiers.', confidence: 0.75, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-177', category: 'misc', owasp: 'A04:2021', severity: 'HIGH', name: 'Prototype Pollution', description: 'Object merge with user input.', patterns: [/Object\.assign\s*\(\s*[^,]*,\s*req\./, /\.\.\.\s*req\.body/, /\{\s*\.\.\.\s*req\.body/, /\.extend\s*\(\s*[^,]*,\s*req\./, /_.merge\s*\(\s*[^,]*,\s*req\./, /lodash.*merge.*req\./i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Validate user input before merging.', confidence: 0.90, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-178', category: 'misc', owasp: 'A01:2021', severity: 'MEDIUM', name: 'Reverse Tabnabbing', description: 'target="_blank" without noopener.', patterns: [/target\s*=\s*['"`]_blank['"`](?!.*noopener)/, /window\.open\s*\(\s*(?!.*noopener)/], fileGlob: '**/*.{jsx,tsx}', fix: 'Add rel="noopener noreferrer".', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-179', category: 'misc', owasp: 'A04:2021', severity: 'MEDIUM', name: 'Resource Exhaustion', description: 'Unbounded resource allocation.', patterns: [/\.split\s*\(\s*(?:req\.|request\.|params\.)/, /Array\s*\(\s*parseInt\s*\(\s*(?:req\.|request\.|params\.)/, /\.repeat\s*\(\s*(?:req\.|request\.|params\.)/], fileGlob: JS_TS_PY, excludeGlob: DEFAULT_EXCLUDE, fix: 'Apply limits to user-supplied values.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-180 – SEC-185 : Dependency Security (A06:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-180', category: 'dependency', owasp: 'A06:2021', severity: 'HIGH', name: 'Unpinned Dependency', description: 'Version not pinned.', patterns: [/"\*"\s*:/, /"\^/, /"~/, /">=/], fileGlob: '**/package.json', excludeGlob: DEFAULT_EXCLUDE, fix: 'Pin dependency versions.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-181', category: 'dependency', owasp: 'A06:2021', severity: 'HIGH', name: 'Untrusted Package Source', description: 'Non-standard registry.', patterns: [/registry\s*=\s*['"`]https?:\/\/(?!registry\.npmjs|registry\.yarnpkg)/], fileGlob: '**/{.npmrc,.yarnrc}', fix: 'Only use trusted registries.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-182', category: 'dependency', owasp: 'A06:2021', severity: 'MEDIUM', name: 'Unsafe Postinstall', description: 'postinstall scripts enabled.', patterns: [/ignore-scripts\s*=\s*false/, /unsafe-perm\s*=\s*true/], fileGlob: '**/{.npmrc,.yarnrc}', fix: 'Set ignore-scripts=true.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-183', category: 'dependency', owasp: 'A06:2021', severity: 'HIGH', name: 'Dependency Confusion', description: 'Internal package name collision.', patterns: [/"@(?:company|internal|private)\//], fileGlob: '**/package.json', excludeGlob: DEFAULT_EXCLUDE, fix: 'Use scoped packages with registry mappings.', confidence: 0.80, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-184 – SEC-188 : Session & Cookie (A07:2021)
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-184', category: 'config', owasp: 'A07:2021', severity: 'HIGH', name: 'Session Cookie Missing SameSite', description: 'Cookie without SameSite.', patterns: [/cookie\s*\(\s*['"`][^'"]*['"`]\s*,\s*(?!.*sameSite)/i, /session.*cookie.*(?!.*sameSite)/i], excludeGlob: DEFAULT_EXCLUDE, fileGlob: JS_TS_PY, fix: 'Set SameSite=Lax on session cookies.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-185', category: 'config', owasp: 'A07:2021', severity: 'MEDIUM', name: 'Session Stored Client Side', description: 'Session data in client storage.', patterns: [/localStorage\.setItem/, /sessionStorage\.setItem/, /document\.cookie\s*=\s*[^;]*token/i], fileGlob: JS_TS, excludeGlob: DEFAULT_EXCLUDE, fix: 'Store tokens in httpOnly cookies.', confidence: 0.85, falsePositiveRisk: 'low', enabled: true },

  // ═══════════════════════════════════════════════════════════════
  // SEC-186 – SEC-190 : Additional Secrets
  // ═══════════════════════════════════════════════════════════════
  { id: 'SEC-186', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Hardcoded SMTP Credential', description: 'SMTP credentials hardcoded.', patterns: [/smtp.*(?:user|pass)\s*[:=]\s*['"`][^'"`]{3,}['"`]/i, /nodemailer.*auth\s*:\s*\{[^}]*pass\s*:\s*['"`]/i], fix: 'Use environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-187', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Hardcoded LDAP Credential', description: 'LDAP bind password.', patterns: [/ldap.*(?:password|bindpw)\s*[:=]\s*['"`][^'"`]{3,}['"`]/i], fix: 'Use environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-188', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Hardcoded FTP Credential', description: 'FTP password hardcoded.', patterns: [/ftp.*(?:password|pass)\s*[:=]\s*['"`][^'"`]{3,}['"`]/i], fix: 'Use environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-189', category: 'secrets', owasp: 'A02:2021', severity: 'CRITICAL', name: 'Anthropic API Key', description: 'Anthropic API key exposed.', patterns: [/sk-ant-[a-zA-Z0-9\-_]{30,}/, /anthropic.*(?:api[_-]?key|key)\s*[:=]\s*['"`]sk-ant/i], fix: 'Store in environment variables.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
  { id: 'SEC-190', category: 'secrets', owasp: 'A02:2021', severity: 'HIGH', name: 'Hardcoded Database Password', description: 'DB password in connection string.', patterns: [/mysql:\/\/[^:]+:[^@]+@/, /postgres:\/\/[^:]+:[^@]+@/, /mongodb:\/\/[^:]+:[^@]+@/, /DATABASE_URL\s*=\s*[`'"][^`'"]*:[^`'"]*@/i], excludeGlob: DEFAULT_EXCLUDE, fix: 'Use environment variables for DB credentials.', confidence: 0.95, falsePositiveRisk: 'low', enabled: true },
];

// ── Utility functions ──

export function loadRules(): SecurityRule[] {
  return ALL_RULES.filter((r) => r.enabled).map(r => ({
    ...r,
    patterns: r.patterns.map(p => new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g')),
  }));
}

export function getRulesByCategory(category: SecurityCategory): SecurityRule[] {
  return ALL_RULES.filter((r) => r.category === category);
}

export function getRulesBySeverity(severity: string): SecurityRule[] {
  return ALL_RULES.filter((r) => r.severity === severity);
}
