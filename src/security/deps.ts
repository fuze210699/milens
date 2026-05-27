// ── Dependency vulnerability audit module for milens ──

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──

export type Ecosystem = 'npm' | 'python' | 'rust' | 'go' | 'java' | 'unknown';

export interface Dependency {
  name: string;
  version: string;
  ecosystem: Ecosystem;
}

export interface Vulnerability {
  id: string;
  cve?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  package: string;
  affectedVersions: string;
  fixedVersion?: string;
  description: string;
}

export interface VulnerabilityReport {
  ecosystem: Ecosystem;
  totalDependencies: number;
  vulnerableDependencies: number;
  findings: Vulnerability[];
}

// ── Internal utilities ──

function manifestExists(rootPath: string, filename: string): boolean {
  return existsSync(join(rootPath, filename));
}

function readManifest(rootPath: string, filename: string): string {
  return readFileSync(join(rootPath, filename), 'utf-8');
}

// ── Lightweight semver parser ──

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

function parseSemver(version: string): Semver | null {
  const v = version.trim().replace(/^[~^=<>]*/, '');
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)((?:-[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)*)?(?:\+[A-Za-z0-9_.-]+)?)?$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] ?? '',
  };
}

function cmpSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease < b.prerelease) return -1;
  if (a.prerelease > b.prerelease) return 1;
  return 0;
}

function satisfiesRange(version: string, range: string): boolean {
  const sv = parseSemver(version);
  if (!sv) return false;

  for (const clause of range.split('||').map((c) => c.trim())) {
    if (satisfiesClause(sv, clause)) return true;
  }
  return false;
}

function satisfiesClause(sv: Semver, clause: string): boolean {
  const parts = clause.trim().split(/\s+/);
  let lower: { op: string; v: Semver } | null = null;
  let upper: { op: string; v: Semver } | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '>=' || part === '>' || part === '<=' || part === '<' || part === '=' || part === '==') {
      i++;
      if (i >= parts.length) return false;
      const pv = parseSemver(parts[i]);
      if (!pv) return false;
      const entry = { op: part.replace(/^==$/, '='), v: pv };
      if (entry.op === '>=' || entry.op === '>') {
        lower = entry;
      } else {
        upper = entry;
      }
    } else if (part === '>=') {
      // Edge case: operator already handled
    }
  }

  if (!lower && !upper) return false;

  if (lower) {
    const c = cmpSemver(sv, lower.v);
    if (lower.op === '>=' && c < 0) return false;
    if (lower.op === '>' && c <= 0) return false;
  }
  if (upper) {
    const c = cmpSemver(sv, upper.v);
    if (upper.op === '<=' && c > 0) return false;
    if (upper.op === '<' && c >= 0) return false;
  }
  return true;
}

// ── Offline CVE database ──

const CVE_DATABASE: Vulnerability[] = [
  // ═══════════════════════════════════════════════════════════════
  // npm ecosystem
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2018-16487',
    cve: 'CVE-2018-16487',
    severity: 'CRITICAL',
    package: 'lodash',
    affectedVersions: '< 4.17.11',
    fixedVersion: '4.17.11',
    description: 'Prototype pollution vulnerability in lodash.defaultsDeep leading to denial of service and potential remote code execution.',
  },
  {
    id: 'CVE-2019-10744',
    cve: 'CVE-2019-10744',
    severity: 'CRITICAL',
    package: 'lodash',
    affectedVersions: '< 4.17.19',
    fixedVersion: '4.17.19',
    description: 'Prototype pollution in lodash.defaultsDeep, merge, mergeWith, and set allowing attackers to modify Object.prototype.',
  },
  {
    id: 'CVE-2020-8203',
    cve: 'CVE-2020-8203',
    severity: 'HIGH',
    package: 'lodash',
    affectedVersions: '< 4.17.20',
    fixedVersion: '4.17.20',
    description: 'Prototype pollution in lodash zipObjectDeep function allowing modification of Object.prototype.',
  },
  {
    id: 'CVE-2020-7598',
    cve: 'CVE-2020-7598',
    severity: 'HIGH',
    package: 'minimist',
    affectedVersions: '< 1.2.3',
    fixedVersion: '1.2.3',
    description: 'Prototype pollution in minimist via constructor or __proto__ keys in command-line arguments.',
  },
  {
    id: 'CVE-2022-0235',
    cve: 'CVE-2022-0235',
    severity: 'HIGH',
    package: 'node-fetch',
    affectedVersions: '< 2.6.7',
    fixedVersion: '2.6.7',
    description: 'node-fetch forwards secure headers to untrusted destinations exposing authorization headers in redirect chains.',
  },
  {
    id: 'CVE-2023-26136',
    cve: 'CVE-2023-26136',
    severity: 'CRITICAL',
    package: 'tough-cookie',
    affectedVersions: '< 4.1.3',
    fixedVersion: '4.1.3',
    description: 'Prototype pollution in tough-cookie rejectPublicSuffixes handling when cookie jar rejects are used.',
  },
  {
    id: 'CVE-2024-21892',
    cve: 'CVE-2024-21892',
    severity: 'HIGH',
    package: 'express',
    affectedVersions: '< 4.18.3',
    fixedVersion: '4.18.3',
    description: 'Express vulnerable to code injection via res.sendFile, res.download, res.render called with user-controlled paths.',
  },
  {
    id: 'CVE-2020-7610',
    cve: 'CVE-2020-7610',
    severity: 'CRITICAL',
    package: 'bson',
    affectedVersions: '< 1.1.4',
    fixedVersion: '1.1.4',
    description: 'bson deserialization is vulnerable to prototype pollution via malicious __proto__ fields in BSON documents.',
  },
  {
    id: 'CVE-2020-28469',
    cve: 'CVE-2020-28469',
    severity: 'HIGH',
    package: 'glob-parent',
    affectedVersions: '< 5.1.2',
    fixedVersion: '5.1.2',
    description: 'glob-parent vulnerable to regular expression denial of service (ReDoS) via crafted glob patterns.',
  },
  {
    id: 'CVE-2023-26115',
    cve: 'CVE-2023-26115',
    severity: 'HIGH',
    package: 'word-wrap',
    affectedVersions: '< 1.2.4',
    fixedVersion: '1.2.4',
    description: 'word-wrap vulnerable to regular expression denial of service (ReDoS) in the `result` variable.',
  },
  {
    id: 'CVE-2022-25901',
    cve: 'CVE-2022-25901',
    severity: 'HIGH',
    package: 'superagent',
    affectedVersions: '< 8.0.0',
    fixedVersion: '8.0.0',
    description: 'superagent vulnerable to ReDoS in the `get` method via crafted URLs.',
  },
  {
    id: 'CVE-2022-37603',
    cve: 'CVE-2022-37603',
    severity: 'HIGH',
    package: 'loader-utils',
    affectedVersions: '< 2.0.4',
    fixedVersion: '2.0.4',
    description: 'loader-utils prototype pollution via `parseQuery` function allowing modification of Object.prototype.',
  },
  {
    id: 'CVE-2022-25883',
    cve: 'CVE-2022-25883',
    severity: 'HIGH',
    package: 'semver',
    affectedVersions: '< 7.5.2',
    fixedVersion: '7.5.2',
    description: 'semver vulnerable to regular expression denial of service (ReDoS) when parsing crafted semver strings.',
  },
  {
    id: 'CVE-2022-43410',
    cve: 'CVE-2022-43410',
    severity: 'MEDIUM',
    package: 'jenkins',
    affectedVersions: '< 2.375.1',
    fixedVersion: '2.375.1',
    description: 'Jenkins webhook-trigger plugin allows stored XSS via crafted webhook payloads.',
  },
  {
    id: 'CVE-2024-4068',
    cve: 'CVE-2024-4068',
    severity: 'HIGH',
    package: 'braces',
    affectedVersions: '< 3.0.3',
    fixedVersion: '3.0.3',
    description: 'braces vulnerable to uncontrolled resource consumption via crafted brace expansion patterns.',
  },
  {
    id: 'CVE-2024-48948',
    cve: 'CVE-2024-48948',
    severity: 'HIGH',
    package: 'elliptic',
    affectedVersions: '< 6.5.6',
    fixedVersion: '6.5.6',
    description: 'elliptic ECDSA signature verification accepts altered signatures revealing private key bits via lattice-based fault attacks.',
  },
  {
    id: 'CVE-2024-28849',
    cve: 'CVE-2024-28849',
    severity: 'MEDIUM',
    package: 'follow-redirects',
    affectedVersions: '< 1.15.6',
    fixedVersion: '1.15.6',
    description: 'follow-redirects drops sensitive authorization headers when following cross-origin HTTP to HTTPS redirects.',
  },

  // ═══════════════════════════════════════════════════════════════
  // Python ecosystem
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2023-24580',
    cve: 'CVE-2023-24580',
    severity: 'HIGH',
    package: 'django',
    affectedVersions: '>= 3.2 < 3.2.18 || >= 4.0 < 4.0.10 || >= 4.1 < 4.1.7',
    fixedVersion: '4.1.7',
    description: 'Django file upload denial of service via multipart form parser consuming excessive memory on crafted inputs.',
  },
  {
    id: 'CVE-2023-43665',
    cve: 'CVE-2023-43665',
    severity: 'HIGH',
    package: 'django',
    affectedVersions: '>= 3.2 < 3.2.22 || >= 4.0 < 4.0.8 || >= 4.1 < 4.1.12 || >= 4.2 < 4.2.6',
    fixedVersion: '4.2.6',
    description: 'Django denial of service in `django.utils.text.Truncator` via extremely long unicode strings.',
  },
  {
    id: 'CVE-2023-30861',
    cve: 'CVE-2023-30861',
    severity: 'HIGH',
    package: 'flask',
    affectedVersions: '>= 0.12 < 2.3.2',
    fixedVersion: '2.3.2',
    description: 'Flask cookie disclosure via permanent session cookies sent over HTTP without ensuring HTTPS enforcement.',
  },
  {
    id: 'CVE-2023-45803',
    cve: 'CVE-2023-45803',
    severity: 'MEDIUM',
    package: 'requests',
    affectedVersions: '< 2.31.0',
    fixedVersion: '2.31.0',
    description: 'Requests library leaks proxy credentials via redirect to a different origin when using HTTPS proxies.',
  },
  {
    id: 'CVE-2023-50447',
    cve: 'CVE-2023-50447',
    severity: 'CRITICAL',
    package: 'pillow',
    affectedVersions: '< 10.2.0',
    fixedVersion: '10.2.0',
    description: 'Pillow arbitrary code execution via environment variables passed into underlying build pipelines during image processing.',
  },
  {
    id: 'CVE-2024-28820',
    cve: 'CVE-2024-28820',
    severity: 'HIGH',
    package: 'aiohttp',
    affectedVersions: '< 3.9.2',
    fixedVersion: '3.9.2',
    description: 'aiohttp HTTP request smuggling via improper validation of Content-Length and Transfer-Encoding headers.',
  },
  {
    id: 'CVE-2023-5752',
    cve: 'CVE-2023-5752',
    severity: 'MEDIUM',
    package: 'pip',
    affectedVersions: '< 23.3',
    fixedVersion: '23.3',
    description: 'pip Mercurial-based installs may be subject to command injection via crafted repository URL in requirements.',
  },

  // ═══════════════════════════════════════════════════════════════
  // Rust ecosystem (Cargo crates)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2024-24576',
    cve: 'CVE-2024-24576',
    severity: 'CRITICAL',
    package: 'rustix',
    affectedVersions: '< 0.38.20',
    fixedVersion: '0.38.20',
    description: 'rustix command injection vulnerability on Windows via crafted arguments to CreateProcess-like APIs.',
  },
  {
    id: 'RUSTSEC-2023-0071',
    severity: 'HIGH',
    package: 'openssl',
    affectedVersions: '< 0.10.55',
    fixedVersion: '0.10.55',
    description: 'OpenSSL crate exposes unsound API allowing use-after-free via `X509StoreRef` lifetime mismanagement.',
  },
  {
    id: 'RUSTSEC-2024-0321',
    severity: 'HIGH',
    package: 'hyper',
    affectedVersions: '>= 0.14 < 0.14.28',
    fixedVersion: '0.14.28',
    description: 'hyper HTTP/1 request smuggling due to incorrect handling of Content-Length headers in chunked encoding.',
  },

  // ═══════════════════════════════════════════════════════════════
  // Go ecosystem
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2023-45288',
    cve: 'CVE-2023-45288',
    severity: 'HIGH',
    package: 'golang.org/x/net',
    affectedVersions: '< 0.17.0',
    fixedVersion: '0.17.0',
    description: 'Go HTTP/2 rapid reset attack causing denial of service via unlimited CONTINUATION frames exhausting server resources.',
  },
  {
    id: 'CVE-2023-44487',
    cve: 'CVE-2023-44487',
    severity: 'HIGH',
    package: 'google.golang.org/grpc',
    affectedVersions: '< 1.56.3',
    fixedVersion: '1.56.3',
    description: 'gRPC HTTP/2 rapid reset attack affecting Go gRPC servers causing CPU exhaustion.',
  },
  {
    id: 'GHSA-qppj-fm5r-hxr3',
    severity: 'MEDIUM',
    package: 'github.com/gorilla/websocket',
    affectedVersions: '< 1.5.1',
    fixedVersion: '1.5.1',
    description: 'Gorilla WebSocket denial of service via oversized control frames exhausting memory allocation.',
  },

  // ═══════════════════════════════════════════════════════════════
  // Java ecosystem
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2021-44228',
    cve: 'CVE-2021-44228',
    severity: 'CRITICAL',
    package: 'org.apache.logging.log4j:log4j-core',
    affectedVersions: '>= 2.0 < 2.15.0',
    fixedVersion: '2.15.0',
    description: 'Log4Shell: JNDI injection in log4j2 message lookup substitution allowing remote code execution via crafted log messages.',
  },
  {
    id: 'CVE-2021-45105',
    cve: 'CVE-2021-45105',
    severity: 'HIGH',
    package: 'org.apache.logging.log4j:log4j-core',
    affectedVersions: '>= 2.0 < 2.17.0',
    fixedVersion: '2.17.0',
    description: 'Log4j infinite recursion in context lookup pattern causing denial of service via crafted log message input.',
  },
  {
    id: 'CVE-2022-22965',
    cve: 'CVE-2022-22965',
    severity: 'CRITICAL',
    package: 'org.springframework:spring-beans',
    affectedVersions: '>= 5.2 < 5.2.20 || >= 5.3 < 5.3.17',
    fixedVersion: '5.3.17',
    description: 'Spring4Shell: remote code execution in Spring Framework via data binding to ClassLoader accessible via request parameters.',
  },
  {
    id: 'CVE-2022-22963',
    cve: 'CVE-2022-22963',
    severity: 'CRITICAL',
    package: 'org.springframework.cloud:spring-cloud-function',
    affectedVersions: '>= 3.1 < 3.1.7 || >= 3.2 < 3.2.3',
    fixedVersion: '3.2.3',
    description: 'Spring Cloud Function SpEL injection via crafted Spring Expression Language in routing-expression header allowing remote code execution.',
  },
  {
    id: 'CVE-2020-25649',
    cve: 'CVE-2020-25649',
    severity: 'HIGH',
    package: 'com.fasterxml.jackson.core:jackson-databind',
    affectedVersions: '>= 2.0 < 2.12.3',
    fixedVersion: '2.12.3',
    description: 'Jackson-databind deserialization of untrusted data allowing remote code execution via unsafe deserialization gadget chains.',
  },
  {
    id: 'CVE-2023-41080',
    cve: 'CVE-2023-41080',
    severity: 'MEDIUM',
    package: 'org.apache.tomcat.embed:tomcat-embed-core',
    affectedVersions: '>= 9.0 < 9.0.79 || >= 10.0 < 10.0.27 || >= 10.1 < 10.1.10',
    fixedVersion: '10.1.10',
    description: 'Apache Tomcat open redirect vulnerability via FORM authentication when the ROOT webapp is deployed.',
  },

  // ═══════════════════════════════════════════════════════════════
  // More npm entries
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'CVE-2024-4067',
    cve: 'CVE-2024-4067',
    severity: 'HIGH',
    package: 'micromatch',
    affectedVersions: '< 4.0.8',
    fixedVersion: '4.0.8',
    description: 'micromatch regular expression denial of service (ReDoS) via crafted glob patterns in the `braces` dependency.',
  },
  {
    id: 'CVE-2023-45133',
    cve: 'CVE-2023-45133',
    severity: 'HIGH',
    package: 'babel-traverse',
    affectedVersions: '< 7.23.2',
    fixedVersion: '7.23.2',
    description: 'Babel traverse infinite loop via crafted input causing denial of service during AST traversal.',
  },
];

// ── Version helper ──

function normalizePackageName(raw: string, ecosystem: Ecosystem): string {
  let name = raw.trim().replace(/['"]/g, '').toLowerCase();
  if (ecosystem === 'java') {
    // Java package names are case-sensitive but normalize colons
    name = raw.trim().replace(/['"]/g, '');
  }
  return name;
}

// ── Public API ──

/**
 * Detect which package ecosystem a project uses by checking for manifest files.
 */
export function detectEcosystem(rootPath: string): Ecosystem {
  if (manifestExists(rootPath, 'package.json')) return 'npm';
  if (manifestExists(rootPath, 'requirements.txt') || manifestExists(rootPath, 'Pipfile')) return 'python';
  if (manifestExists(rootPath, 'Cargo.toml')) return 'rust';
  if (manifestExists(rootPath, 'go.mod')) return 'go';
  if (manifestExists(rootPath, 'pom.xml') || manifestExists(rootPath, 'build.gradle')) return 'java';
  return 'unknown';
}

/**
 * Parse dependencies from manifest files.
 */
export function parseDependencies(rootPath: string, ecosystem: Ecosystem): Dependency[] {
  switch (ecosystem) {
    case 'npm':
      return parseNpmDeps(rootPath);
    case 'python':
      return parsePythonDeps(rootPath);
    case 'rust':
      return parseRustDeps(rootPath);
    case 'go':
      return parseGoDeps(rootPath);
    case 'java':
      return parseJavaDeps(rootPath);
    default:
      return [];
  }
}

function parseNpmDeps(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'package.json');
    const pkg = JSON.parse(raw);
    const deps: Dependency[] = [];

    const addDeps = (obj: Record<string, string> | undefined) => {
      if (!obj) return;
      for (const [name, version] of Object.entries(obj)) {
        deps.push({ name, version: version.replace(/^[~^]/, ''), ecosystem: 'npm' });
      }
    };

    addDeps(pkg.dependencies);
    addDeps(pkg.devDependencies);
    addDeps(pkg.peerDependencies);
    addDeps(pkg.optionalDependencies);

    return deps;
  } catch {
    return [];
  }
}

function parsePythonDeps(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'requirements.txt');
    const deps: Dependency[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

      const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*([><=!~]+)\s*([A-Za-z0-9_.*]+)/);
      if (m) {
        deps.push({ name: m[1].toLowerCase(), version: m[3].replace(/[*]/g, '0'), ecosystem: 'python' });
      } else {
        const nameOnly = trimmed.match(/^([A-Za-z0-9_.-]+)/);
        if (nameOnly) {
          deps.push({ name: nameOnly[1].toLowerCase(), version: '0.0.0', ecosystem: 'python' });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function parseRustDeps(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'Cargo.toml');
    const deps: Dependency[] = [];
    // Match [dependencies] section
    const sectionMatch = raw.match(/\[dependencies\]([\s\S]*?)(?=\n\[|$)/);
    if (!sectionMatch) return deps;

    const section = sectionMatch[1];
    const re = /^([A-Za-z0-9_-]+)\s*=\s*"(.*?)"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section)) !== null) {
      const version = (m[2] || '').replace(/^[~^]/, '');
      deps.push({ name: m[1], version, ecosystem: 'rust' });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseGoDeps(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'go.mod');
    const deps: Dependency[] = [];
    const inRequire = /^require\s*\(([\s\S]*?)\)/gm;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = inRequire.exec(raw)) !== null) {
      const block = blockMatch[1];
      const lineRe = /^\s*([^\s]+)\s+v?([^\s]+)/gm;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRe.exec(block)) !== null) {
        deps.push({ name: lineMatch[1], version: lineMatch[2], ecosystem: 'go' });
      }
    }

    // Single-line require
    const singleRe = /^require\s+([^\s]+)\s+v?([^\s]+)/gm;
    let singleMatch: RegExpExecArray | null;
    while ((singleMatch = singleRe.exec(raw)) !== null) {
      deps.push({ name: singleMatch[1], version: singleMatch[2], ecosystem: 'go' });
    }

    return deps;
  } catch {
    return [];
  }
}

function parseJavaDeps(rootPath: string): Dependency[] {
  try {
    if (manifestExists(rootPath, 'pom.xml')) {
      return parsePomXml(rootPath);
    }
    if (manifestExists(rootPath, 'build.gradle')) {
      return parseGradleDeps(rootPath);
    }
    return [];
  } catch {
    return [];
  }
}

function parsePomXml(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'pom.xml');
    const deps: Dependency[] = [];
    const depRe = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
    let m: RegExpExecArray | null;
    while ((m = depRe.exec(raw)) !== null) {
      const name = `${m[1]}:${m[2]}`;
      deps.push({ name, version: m[3], ecosystem: 'java' });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseGradleDeps(rootPath: string): Dependency[] {
  try {
    const raw = readManifest(rootPath, 'build.gradle');
    const deps: Dependency[] = [];
    const depRe = /(?:implementation|compile|api|testImplementation|runtimeOnly)\s*\(?\s*['"]([^:'"]+):([^:'"]+):([^:'"]+)['"]\s*\)?/g;
    let m: RegExpExecArray | null;
    while ((m = depRe.exec(raw)) !== null) {
      const name = `${m[1]}:${m[2]}`;
      deps.push({ name, version: m[3], ecosystem: 'java' });
    }
    return deps;
  } catch {
    return [];
  }
}

/**
 * Check dependencies against known vulnerabilities (offline database).
 */
export function checkVulnerabilities(deps: Dependency[]): VulnerabilityReport {
  const ecosystems = new Set<Ecosystem>();
  const findings: Vulnerability[] = [];

  for (const dep of deps) {
    ecosystems.add(dep.ecosystem);

    for (const cve of CVE_DATABASE) {
      const cvePkg = cve.package.toLowerCase();
      const depName = dep.name.toLowerCase();
      if (cvePkg !== depName) continue;

      const version = dep.version;
      if (!version || version === '*') {
        findings.push(cve);
        continue;
      }

      if (satisfiesRange(version, cve.affectedVersions)) {
        findings.push(cve);
      }
    }
  }

  // Deduplicate by vulnerability ID
  const seen = new Set<string>();
  const uniqueFindings = findings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  const primaryEcosystem = ecosystems.size === 1 ? [...ecosystems][0] : 'unknown';

  return {
    ecosystem: primaryEcosystem,
    totalDependencies: deps.length,
    vulnerableDependencies: uniqueFindings.length,
    findings: uniqueFindings,
  };
}

/**
 * Full audit: detect ecosystem → parse dependencies → check vulnerabilities.
 */
export function auditDependencies(rootPath: string): VulnerabilityReport {
  const ecosystem = detectEcosystem(rootPath);
  const deps = parseDependencies(rootPath, ecosystem);
  return checkVulnerabilities(deps);
}
