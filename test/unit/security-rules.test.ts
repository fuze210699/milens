import { describe, it, expect } from 'vitest';
import { loadRules, getRulesByCategory, getRulesBySeverity } from '../../src/security/rules.js';

describe('Security Rules', () => {
  it('loads all 50 rules', () => {
    const rules = loadRules();
    expect(rules.length).toBeGreaterThanOrEqual(50);
  });

  it('all rules have required fields', () => {
    const rules = loadRules();
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(rule.severity).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(rule.owasp).toBeTruthy();
    }
  });

  it('all rule IDs are unique', () => {
    const rules = loadRules();
    const ids = new Set(rules.map((r) => r.id));
    expect(ids.size).toBe(rules.length);
  });

  it('filters by category', () => {
    const secrets = getRulesByCategory('secrets');
    expect(secrets.length).toBeGreaterThanOrEqual(10);
    for (const r of secrets) {
      expect(r.category).toBe('secrets');
    }
  });

  it('filters by severity', () => {
    const critical = getRulesBySeverity('CRITICAL');
    expect(critical.length).toBeGreaterThanOrEqual(3);
    for (const r of critical) {
      expect(r.severity).toBe('CRITICAL');
    }
  });

  it('detects hardcoded passwords', () => {
    const rules = loadRules();
    const passwordRule = rules.find((r) => r.id === 'SEC-001');
    expect(passwordRule).toBeTruthy();
    expect(passwordRule!.patterns.length).toBe(1);

    // Pattern 0: colon/equals with quoted value
    const code1 = `const config = { password: "admin123" };`;
    passwordRule!.patterns[0].lastIndex = 0;
    expect(passwordRule!.patterns[0].test(code1)).toBe(true);
  });

  it('detects eval() usage', () => {
    const rules = loadRules();
    const evalRule = rules.find((r) => r.id === 'SEC-011');
    expect(evalRule).toBeTruthy();
    expect(evalRule!.patterns.length).toBe(2);

    // Pattern 0: direct eval(str)
    const code1 = `eval(userInput);`;
    evalRule!.patterns[0].lastIndex = 0;
    expect(evalRule!.patterns[0].test(code1)).toBe(true);

    // Pattern 1: eval with template literal
    const code2 = 'eval(`result: ${x}`);';
    evalRule!.patterns[1].lastIndex = 0;
    expect(evalRule!.patterns[1].test(code2)).toBe(true);
  });

  it('does not false-positive on safe code', () => {
    const rules = loadRules();
    const safeCode = `
      import { Database } from './db.js';
      const db = new Database(':memory:');
      const result = db.query('SELECT * FROM users WHERE id = ?', [userId]);
      console.log('User found:', result.name);
    `;
    const secretRules = rules.filter((r) => r.category === 'secrets');
    let triggered = 0;
    for (const rule of secretRules) {
      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(safeCode)) triggered++;
      }
    }
    expect(triggered).toBe(0);
  });

  it('SEC-001 still catches hardcoded passwords in JavaScript objects', () => {
    const rules = loadRules();
    const passwordRule = rules.find((r) => r.id === 'SEC-001')!;
    const genuine = [
      'const password = "admin123"',
      'password: "secret123"',
      'pwd = "mypassword"',
    ];
    for (const text of genuine) {
      const matched = passwordRule.patterns.some(p => { p.lastIndex = 0; return p.test(text); });
      expect(matched, `should match: ${text}`).toBe(true);
    }
  });

  it('SEC-001 does not false-positive on os.getenv() and Column() patterns', () => {
    const rules = loadRules();
    const passwordRule = rules.find((r) => r.id === 'SEC-001')!;
    const safe = [
      'password = os.getenv("DB_PASSWORD", "")',
      'password = Column(String(255), nullable=False)',
      'password = payload.get("password")',
      'password = ref(false)',
      'password = quote_plus(password_raw)',
    ];
    for (const text of safe) {
      const matched = passwordRule.patterns.some(p => { p.lastIndex = 0; return p.test(text); });
      expect(matched, `should not match: ${text}`).toBe(false);
    }
  });
});
