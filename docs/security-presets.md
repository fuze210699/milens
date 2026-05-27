# Milens Security — 50+ Built-in Rules

> Milens ships with 50+ security rules covering OWASP Top 10. Use `security_scan()` MCP tool or `milens security scan` CLI instead of manual grep patterns.

## Quick Usage

```bash
# Full security audit
milens security scan

# Specific scope
milens security scan --scope secrets
milens security scan --scope injection --severity HIGH

# Dependency audit
milens security deps

# MCP tool (from AI agent)
security_scan({scope: "all", severity: "HIGH"})
```

---

## Rule Categories

### Secrets Detection (10 rules) — OWASP A02:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-001 | CRITICAL | Hardcoded passwords (`password = "..."`) |
| SEC-002 | CRITICAL | Hardcoded secrets (`secret = "..."`) |
| SEC-003 | CRITICAL | Hardcoded API keys (`api_key = "..."`) |
| SEC-004 | CRITICAL | AWS access keys (`AKIA...`) |
| SEC-005 | HIGH | OpenAI / Stripe keys (`sk-...`) |
| SEC-006 | HIGH | GitHub tokens (`ghp_...`) |
| SEC-007 | HIGH | RSA/EC private keys |
| SEC-008 | MEDIUM | Generic tokens |
| SEC-009 | MEDIUM | `.env` files outside `.gitignore` |
| SEC-010 | LOW | Auth tokens |

### Injection Prevention (9 rules) — OWASP A03:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-011 | CRITICAL | `eval()` — arbitrary code execution |
| SEC-012 | HIGH | `exec()` — command injection |
| SEC-013 | HIGH | `child_process.exec` |
| SEC-014 | HIGH | SQL string concatenation |
| SEC-015 | HIGH | SQL template injection |
| SEC-016 | MEDIUM | Dynamic `Function()` |
| SEC-017 | MEDIUM | `innerHTML` — XSS vector |
| SEC-018 | MEDIUM | `dangerouslySetInnerHTML` — React XSS |
| SEC-019 | LOW | `document.write()` |

### Hidden Unicode (4 rules)

| ID | Severity | Pattern |
|---|---|---|
| SEC-020 | HIGH | Bidi override characters |
| SEC-021 | HIGH | Zero-width characters |
| SEC-022 | MEDIUM | Homoglyph attacks (mixed scripts) |
| SEC-023 | LOW | Hidden Unicode in comments |

### Dangerous Patterns (7 rules)

| ID | Severity | Pattern |
|---|---|---|
| SEC-024 | CRITICAL | `os.system()` — Python shell |
| SEC-025 | HIGH | `subprocess.call(shell=True)` |
| SEC-026 | HIGH | `Runtime.exec()` — Java |
| SEC-027 | MEDIUM | `spawn({shell: true})` — Node.js |
| SEC-028 | MEDIUM | `pickle.loads()` — unsafe deserialization |
| SEC-029 | MEDIUM | `unserialize()` — PHP |
| SEC-030 | LOW | `new Function()` — JS |

### Config Misconfiguration (5 rules) — OWASP A05:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-031 | HIGH | `--dangerously-skip-permissions` |
| SEC-032 | HIGH | CORS wildcard `Access-Control-Allow-Origin: *` |
| SEC-033 | MEDIUM | `secure: false` cookies |
| SEC-034 | MEDIUM | `httpOnly: false` cookies |
| SEC-035 | LOW | Debug mode in production |

### Data Leaks (5 rules) — OWASP A09:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-036 | HIGH | `console.log(password)` |
| SEC-037 | HIGH | `console.log(token)` |
| SEC-038 | MEDIUM | `console.log(secret)` |
| SEC-039 | MEDIUM | Hardcoded internal URLs |
| SEC-040 | LOW | General `console.log()` |

### Weak Cryptography (4 rules) — OWASP A02:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-041 | HIGH | MD5 (broken hash) |
| SEC-042 | HIGH | SHA1 (deprecated) |
| SEC-043 | MEDIUM | `Math.random()` for crypto |
| SEC-044 | MEDIUM | Hardcoded salt/IV |

### Authentication (4 rules) — OWASP A07:2021

| ID | Severity | Pattern |
|---|---|---|
| SEC-045 | CRITICAL | Role check with string comparison |
| SEC-046 | HIGH | Missing auth middleware |
| SEC-047 | HIGH | JWT without expiration |
| SEC-048 | MEDIUM | Session ID in URL |

### File Access (2 rules)

| ID | Severity | Pattern |
|---|---|---|
| SEC-049 | HIGH | Path traversal `../` |
| SEC-050 | HIGH | `fs.readFile()` with traversal |

---

## Dependency Audit

Milens ships with an offline CVE database covering 34 known vulnerabilities across npm, Python, Rust, Go, and Java ecosystems.

```bash
milens security deps
```

Output example:
```
Dependency Audit — npm
  Total: 156 | Vulnerable: 3

[HIGH] lodash — CVE-2021-23337
  Affected: < 4.17.21 | Fixed: 4.17.21
  Command injection in lodash template

[MEDIUM] minimist — CVE-2021-44906
  Affected: < 1.2.6 | Fixed: 1.2.6
  Prototype pollution
```

---

## OWASP Top 10 Mapping

All 50 rules map to OWASP Top 10 (2021):

| OWASP | Category | Rules |
|---|---|---|
| A01:2021 | Broken Access Control | SEC-045 → SEC-048 |
| A02:2021 | Cryptographic Failures | SEC-001 → SEC-010, SEC-041 → SEC-044 |
| A03:2021 | Injection | SEC-011 → SEC-019 |
| A05:2021 | Security Misconfiguration | SEC-031 → SEC-035 |
| A07:2021 | Auth Failures | SEC-045 → SEC-048 |
| A08:2021 | Software & Data Integrity | SEC-028, SEC-029 |
| A09:2021 | Logging & Monitoring | SEC-036 → SEC-040 |
