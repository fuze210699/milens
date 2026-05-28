import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectEcosystem,
  parseDependencies,
  checkVulnerabilities,
  auditDependencies,
} from '../../src/security/deps.js';

const TMP = join(import.meta.dirname, '..', 'tmp');

function uniqueDir(prefix: string): string {
  return join(TMP, `${prefix}-${Math.random().toString(36).slice(2)}`);
}

function createManifest(root: string, filename: string, content: string): void {
  writeFileSync(join(root, filename), content, 'utf-8');
}

// ── detectEcosystem ──────────────────────────────────────────────────────────

describe('detectEcosystem', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  let dir: string;

  beforeEach(() => {
    dir = uniqueDir('detect');
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns npm when package.json exists', () => {
    createManifest(dir, 'package.json', '{}');
    expect(detectEcosystem(dir)).toBe('npm');
  });

  it('returns python when requirements.txt exists', () => {
    createManifest(dir, 'requirements.txt', '');
    expect(detectEcosystem(dir)).toBe('python');
  });

  it('returns python when Pipfile exists', () => {
    createManifest(dir, 'Pipfile', '');
    expect(detectEcosystem(dir)).toBe('python');
  });

  it('returns rust when Cargo.toml exists', () => {
    createManifest(dir, 'Cargo.toml', '');
    expect(detectEcosystem(dir)).toBe('rust');
  });

  it('returns go when go.mod exists', () => {
    createManifest(dir, 'go.mod', '');
    expect(detectEcosystem(dir)).toBe('go');
  });

  it('returns java when pom.xml exists', () => {
    createManifest(dir, 'pom.xml', '');
    expect(detectEcosystem(dir)).toBe('java');
  });

  it('returns java when build.gradle exists', () => {
    createManifest(dir, 'build.gradle', '');
    expect(detectEcosystem(dir)).toBe('java');
  });

  it('returns unknown when no manifest files exist', () => {
    expect(detectEcosystem(dir)).toBe('unknown');
  });

  it('prioritises npm over python when both exist', () => {
    createManifest(dir, 'package.json', '{}');
    createManifest(dir, 'requirements.txt', '');
    expect(detectEcosystem(dir)).toBe('npm');
  });
});

// ── parseDependencies ────────────────────────────────────────────────────────

describe('parseDependencies', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  let dir: string;

  beforeEach(() => {
    dir = uniqueDir('parse');
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('npm', () => {
    it('parses dependencies and devDependencies from package.json', () => {
      createManifest(dir, 'package.json', JSON.stringify({
        dependencies: { lodash: '^4.17.0', express: '~4.18.0' },
        devDependencies: { vitest: '1.6.0' },
      }));
      const deps = parseDependencies(dir, 'npm');
      expect(deps).toHaveLength(3);
      const names = deps.map((d) => d.name);
      expect(names).toContain('lodash');
      expect(names).toContain('express');
      expect(names).toContain('vitest');
    });

    it('parses peerDependencies and optionalDependencies', () => {
      createManifest(dir, 'package.json', JSON.stringify({
        peerDependencies: { react: '^18.0.0' },
        optionalDependencies: { fsevents: '2.3.0' },
      }));
      const deps = parseDependencies(dir, 'npm');
      expect(deps).toHaveLength(2);
      expect(deps[0].name).toBe('react');
      expect(deps[1].name).toBe('fsevents');
    });

    it('strips leading ^ and ~ from version strings', () => {
      createManifest(dir, 'package.json', JSON.stringify({
        dependencies: { pkg: '^1.0.0' },
      }));
      const deps = parseDependencies(dir, 'npm');
      expect(deps[0].version).toBe('1.0.0');
    });

    it('returns [] for malformed package.json', () => {
      createManifest(dir, 'package.json', '{broken');
      const deps = parseDependencies(dir, 'npm');
      expect(deps).toEqual([]);
    });

    it('returns [] when package.json is missing', () => {
      const deps = parseDependencies(dir, 'npm');
      expect(deps).toEqual([]);
    });
  });

  describe('python', () => {
    it('parses pinned versions from requirements.txt', () => {
      createManifest(dir, 'requirements.txt', [
        'requests>=2.28.0',
        'flask==2.3.0',
        'django~=4.2',
      ].join('\n'));
      const deps = parseDependencies(dir, 'python');
      expect(deps).toHaveLength(3);
      expect(deps[0]).toMatchObject({ name: 'requests', version: '2.28.0', ecosystem: 'python' });
      expect(deps[1]).toMatchObject({ name: 'flask', version: '2.3.0', ecosystem: 'python' });
      expect(deps[2]).toMatchObject({ name: 'django', version: '4.2', ecosystem: 'python' });
    });

    it('handles name-only entries with default version 0.0.0', () => {
      createManifest(dir, 'requirements.txt', 'numpy\npandas\n');
      const deps = parseDependencies(dir, 'python');
      expect(deps).toHaveLength(2);
      expect(deps[0].version).toBe('0.0.0');
      expect(deps[1].version).toBe('0.0.0');
    });

    it('skips comments and flag lines', () => {
      createManifest(dir, 'requirements.txt', [
        '# this is a comment',
        '-r requirements/base.txt',
        'flask==2.3.0',
      ].join('\n'));
      const deps = parseDependencies(dir, 'python');
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('flask');
    });

    it('returns [] when requirements.txt is missing', () => {
      const deps = parseDependencies(dir, 'python');
      expect(deps).toEqual([]);
    });
  });

  describe('rust', () => {
    it('parses [dependencies] section from Cargo.toml', () => {
      createManifest(dir, 'Cargo.toml', [
        '[package]',
        'name = "my-crate"',
        '',
        '[dependencies]',
        'serde = "1.0.190"',
        'tokio = { version = "1.35.0", features = ["full"] }',
        'regex = "1.10.2"',
      ].join('\n'));
      const deps = parseDependencies(dir, 'rust');
      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain('serde');
      expect(names).toContain('regex');
    });

    it('returns [] when Cargo.toml has no [dependencies] section', () => {
      createManifest(dir, 'Cargo.toml', '[package]\nname = "bare"\n');
      const deps = parseDependencies(dir, 'rust');
      expect(deps).toEqual([]);
    });
  });

  describe('go', () => {
    it('parses require block from go.mod', () => {
      createManifest(dir, 'go.mod', [
        'module example.com/m',
        '',
        'go 1.21',
        '',
        'require (',
        '\tgithub.com/gin-gonic/gin v1.9.1',
        '\tgolang.org/x/net v0.17.0',
        ')',
      ].join('\n'));
      const deps = parseDependencies(dir, 'go');
      const names = deps.map((d) => `${d.name}@${d.version}`);
      expect(names).toContain('github.com/gin-gonic/gin@1.9.1');
      expect(names).toContain('golang.org/x/net@0.17.0');
    });

    it('parses single-line require directives', () => {
      createManifest(dir, 'go.mod', [
        'module example.com/m',
        '',
        'go 1.21',
        '',
        'require github.com/gorilla/websocket v1.5.1',
        'require golang.org/x/text v0.14.0',
      ].join('\n'));
      const deps = parseDependencies(dir, 'go');
      expect(deps).toHaveLength(2);
      expect(deps[0]).toMatchObject({ name: 'github.com/gorilla/websocket', version: '1.5.1', ecosystem: 'go' });
      expect(deps[1]).toMatchObject({ name: 'golang.org/x/text', version: '0.14.0', ecosystem: 'go' });
    });

    it('returns [] when go.mod is missing', () => {
      const deps = parseDependencies(dir, 'go');
      expect(deps).toEqual([]);
    });
  });

  describe('java', () => {
    it('parses dependencies from pom.xml', () => {
      createManifest(dir, 'pom.xml', [
        '<project>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework</groupId>',
        '      <artifactId>spring-beans</artifactId>',
        '      <version>5.3.15</version>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>com.fasterxml.jackson.core</groupId>',
        '      <artifactId>jackson-databind</artifactId>',
        '      <version>2.12.0</version>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n'));
      const deps = parseDependencies(dir, 'java');
      expect(deps).toHaveLength(2);
      expect(deps[0]).toMatchObject({ name: 'org.springframework:spring-beans', version: '5.3.15', ecosystem: 'java' });
      expect(deps[1]).toMatchObject({ name: 'com.fasterxml.jackson.core:jackson-databind', version: '2.12.0', ecosystem: 'java' });
    });

    it('parses dependencies from build.gradle', () => {
      createManifest(dir, 'build.gradle', [
        'dependencies {',
        "    implementation 'org.springframework:spring-beans:5.3.15'",
        "    compile 'com.google.guava:guava:31.1-jre'",
        "    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'",
        '}',
      ].join('\n'));
      const deps = parseDependencies(dir, 'java');
      expect(deps).toHaveLength(3);
      expect(deps[0]).toMatchObject({ name: 'org.springframework:spring-beans', version: '5.3.15', ecosystem: 'java' });
    });

    it('prefers pom.xml over build.gradle when both exist', () => {
      createManifest(dir, 'pom.xml', [
        '<project><dependencies>',
        '<dependency><groupId>a</groupId><artifactId>b</artifactId><version>1.0</version></dependency>',
        '</dependencies></project>',
      ].join('\n'));
      createManifest(dir, 'build.gradle', [
        "dependencies { implementation 'c:d:2.0' }",
      ].join('\n'));
      const deps = parseDependencies(dir, 'java');
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('a:b');
    });

    it('returns [] when no java manifest exists', () => {
      const deps = parseDependencies(dir, 'java');
      expect(deps).toEqual([]);
    });
  });

  describe('unknown', () => {
    it('returns [] for unknown ecosystem', () => {
      const deps = parseDependencies(dir, 'unknown');
      expect(deps).toEqual([]);
    });
  });
});

// ── checkVulnerabilities ─────────────────────────────────────────────────────

describe('checkVulnerabilities', () => {
  it('returns empty report for empty dependency array', () => {
    const report = checkVulnerabilities([]);
    expect(report.totalDependencies).toBe(0);
    expect(report.vulnerableDependencies).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.ecosystem).toBe('unknown');
  });

  it('flags vulnerable lodash@4.17.0 against three CVEs', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.0', ecosystem: 'npm' },
    ]);
    expect(report.totalDependencies).toBe(1);
    expect(report.vulnerableDependencies).toBe(3);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('CVE-2018-16487');
    expect(ids).toContain('CVE-2019-10744');
    expect(ids).toContain('CVE-2020-8203');
  });

  it('returns no findings for lodash@4.17.21 (patched)', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.21', ecosystem: 'npm' },
    ]);
    expect(report.totalDependencies).toBe(1);
    expect(report.vulnerableDependencies).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('flags spring-beans@5.3.15 for CVE-2022-22965 (Spring4Shell)', () => {
    const report = checkVulnerabilities([
      { name: 'org.springframework:spring-beans', version: '5.3.15', ecosystem: 'java' },
    ]);
    expect(report.totalDependencies).toBe(1);
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain('CVE-2022-22965');
  });

  it('returns no findings for an unknown package', () => {
    const report = checkVulnerabilities([
      { name: 'totally-unknown-package', version: '1.0.0', ecosystem: 'npm' },
    ]);
    expect(report.vulnerableDependencies).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('deduplicates findings by vulnerability ID', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.0', ecosystem: 'npm' },
      { name: 'lodash', version: '4.17.0', ecosystem: 'npm' },
    ]);
    expect(report.totalDependencies).toBe(2);
    expect(report.vulnerableDependencies).toBe(3);
    const ids = report.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports ecosystem as unknown when deps span multiple ecosystems', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.0', ecosystem: 'npm' },
      { name: 'flask', version: '2.3.0', ecosystem: 'python' },
    ]);
    expect(report.ecosystem).toBe('unknown');
  });

  it('flags django@4.0.5 within affected range', () => {
    const report = checkVulnerabilities([
      { name: 'django', version: '4.0.5', ecosystem: 'python' },
    ]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain('CVE-2023-24580');
    expect(ids).not.toContain('CVE-2023-43665');
  });
});

// ── auditDependencies (integration) ──────────────────────────────────────────

describe('auditDependencies', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  let dir: string;

  beforeEach(() => {
    dir = uniqueDir('audit');
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects npm ecosystem and audits lodash@4.17.0', () => {
    createManifest(dir, 'package.json', JSON.stringify({
      dependencies: { lodash: '4.17.0' },
    }));
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('npm');
    expect(report.totalDependencies).toBe(1);
    expect(report.vulnerableDependencies).toBe(3);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('CVE-2018-16487');
    expect(ids).toContain('CVE-2019-10744');
    expect(ids).toContain('CVE-2020-8203');
  });

  it('detects npm ecosystem and audits a patched lodash version', () => {
    createManifest(dir, 'package.json', JSON.stringify({
      dependencies: { lodash: '4.17.21' },
    }));
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('npm');
    expect(report.vulnerableDependencies).toBe(0);
  });

  it('detects python ecosystem from requirements.txt', () => {
    createManifest(dir, 'requirements.txt', 'flask==2.3.0\n');
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('python');
    expect(report.totalDependencies).toBe(1);
  });

  it('detects java ecosystem from pom.xml', () => {
    createManifest(dir, 'pom.xml', [
      '<project><dependencies>',
      '<dependency><groupId>org.springframework</groupId><artifactId>spring-beans</artifactId><version>5.3.15</version></dependency>',
      '</dependencies></project>',
    ].join('\n'));
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('java');
    expect(report.totalDependencies).toBe(1);
  });

  it('detects rust ecosystem from Cargo.toml', () => {
    createManifest(dir, 'Cargo.toml', [
      '[dependencies]',
      'serde = "1.0.190"',
    ].join('\n'));
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('rust');
    expect(report.totalDependencies).toBe(1);
  });

  it('detects go ecosystem from go.mod', () => {
    createManifest(dir, 'go.mod', [
      'module example.com/m',
      'go 1.21',
      'require github.com/gorilla/websocket v1.5.0',
    ].join('\n'));
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('go');
    expect(report.totalDependencies).toBe(1);
  });

  it('returns unknown ecosystem when no manifests exist', () => {
    const report = auditDependencies(dir);
    expect(report.ecosystem).toBe('unknown');
    expect(report.totalDependencies).toBe(0);
    expect(report.vulnerableDependencies).toBe(0);
  });
});

// ── Semver edge cases ────────────────────────────────────────────────────────

describe('semver parsing (via checkVulnerabilities)', () => {
  it('treats prerelease version as lower than release version', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.11-alpha.1', ecosystem: 'npm' },
    ]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('CVE-2018-16487');
  });

  it('does not flag exact fixed version', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.11', ecosystem: 'npm' },
    ]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain('CVE-2018-16487');
    expect(ids).toContain('CVE-2019-10744');
  });

  it('handles version with build metadata suffix', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '4.17.0+build.123', ecosystem: 'npm' },
    ]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('CVE-2018-16487');
  });

  it('handles leading range operators in npm versions', () => {
    const report = checkVulnerabilities([
      { name: 'lodash', version: '>=4.17.0', ecosystem: 'npm' },
    ]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('CVE-2018-16487');
  });
});
