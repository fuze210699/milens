---
name: milens-security-review
description: Security Audit — scan for secrets, hidden unicode, dangerous patterns, data leaks, and produce a security report
---

# milens-security-review — Security Audit

Scan the codebase for security vulnerabilities: exposed secrets, hidden unicode (Trojan Source), dangerous code patterns, data leakage, and unexpected file changes.

## Tools Required

| Tool | Purpose |
|---|---|
| `mcp_milens_review_pr` | Initial risk assessment of changed files and symbols |
| `mcp_milens_grep` | Pattern search for secrets, unicode, dangerous calls, data leaks |
| `mcp_milens_review_symbol` | Deep-dive risk analysis on high-risk symbols |
| `mcp_milens_detect_changes` | Verify only expected files changed |

> **CRITICAL:** All milens MCP tool calls MUST include the `repo` parameter set to the **absolute path of the workspace root**.

## Workflow

### Step 1: Initial Risk Assessment

Start with a PR-level overview to identify high-risk areas.

```
mcp_milens_review_pr({repo: "<workspaceRoot>"})
```

Focus on:
- **New files** — highest risk for secrets or vulnerabilities
- **Modified config files** — `.env`, `config.*`, settings files
- **Auth/routing files** — middleware, guards, session handlers
- **CRITICAL-rated symbols** — these get deep-dived in Step 6

### Step 2: Secret Detection

Search for hardcoded secrets and credentials.

```
mcp_milens_grep({pattern: "password|secret|api_key|token|private_key|AUTH_TOKEN", scope: "code", repo: "<workspaceRoot>"})
```

Key patterns to flag:
- **Assignments to secrets** — `const apiKey = "sk-..."` (critical)
- **Config values** — `password: "admin123"` (high)
- **Variable names only** — `const apiKey = process.env.KEY` (low — already env-var'd)
- **Test fixtures** — `const testPassword = "..."` (verify it's not a real password)

### Step 3: Hidden Unicode Detection (Trojan Source)

Search for invisible and bidirectional Unicode characters used in supply-chain attacks.

```
mcp_milens_grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u202A-\\u202E]", scope: "code", isRegex: true, repo: "<workspaceRoot>"})
```

These characters can:
- Make code look like one thing but compile as another
- Hide backdoors in copy-pasted code
- Exploit bidirectional text in string literals and comments

**Any match is a CRITICAL finding** — flag for immediate removal.

### Step 4: Dangerous Code Patterns

Search for patterns that enable code injection or arbitrary execution.

```
mcp_milens_grep({pattern: "eval\\(|exec\\(|child_process|Function\\(", scope: "code", isRegex: true, repo: "<workspaceRoot>"})
```

Severity guidance:
- `eval()` / `exec()` with user input — **CRITICAL**
- `child_process.exec()` with dynamic arguments — **CRITICAL**
- `new Function()` — **HIGH** (eval equivalent)
- `child_process.spawn()` with fixed arguments — **LOW** (safer than exec)

### Step 5: Data Leak Detection

Find logging statements that may expose sensitive data.

```
mcp_milens_grep({pattern: "console\\.(log|debug|info)\\(", scope: "code", isRegex: true, repo: "<workspaceRoot>"})
```

Flag any `console.log` that logs:
- User data (emails, names, PII)
- Tokens, passwords, keys
- Request bodies or headers
- Database query results with user data

### Step 6: Deep-Dive on Critical Symbols

For any symbol flagged as CRITICAL in Step 1, run a deep-dive.

```
mcp_milens_review_symbol({name: "<symbolName>", repo: "<workspaceRoot>"})
```

This provides:
- **Role** — what the symbol does (auth, routing, data access)
- **Heat** — how frequently it changes (volatile code = higher risk)
- **Dependents** — blast radius if compromised
- **Test status** — whether its behavior is verified

### Step 7: Verify Change Scope

Confirm that only expected files were modified.

```
mcp_milens_detect_changes({repo: "<workspaceRoot>"})
```

This catches:
- Unintended file modifications (config drift)
- Stray files included in the commit
- Missing or extra changes vs. expectations

### Step 8: Produce Security Audit Report

Consolidate into a structured report:

1. **Executive Summary** — overall risk level, critical findings count
2. **Secret Scan Results** — each match with file, line, severity, and remediation
3. **Unicode Scan Results** — each match (any match is critical)
4. **Dangerous Patterns** — each `eval`/`exec`/`Function` usage with justification
5. **Data Leak Findings** — each `console.log` that logs sensitive data
6. **Symbol Risk Deep-Dives** — per CRITICAL symbol from Step 6
7. **Change Scope Verification** — expected vs. actual changed files
8. **Remediation Plan** — ordered by severity, with specific fix recommendations
9. **Verdict** — PASSED / NEEDS REMEDIATION / BLOCKED

## Example Session

### Input

```
"run a security audit before the release"
```

### Tool Calls

**Step 1 — PR overview:**
```
mcp_milens_review_pr({repo: "/home/user/project"})
```

**Output:** 8 changed files, 2 CRITICAL symbols (`authHandler`, `paymentProcessor`).

**Step 2 — Secret detection:**
```
mcp_milens_grep({pattern: "password|secret|api_key|token|private_key|AUTH_TOKEN", scope: "code", repo: "/home/user/project"})
```

**Output:**
```
src/config.ts:12    apiKey: "sk-prod-abc123..."     ← CRITICAL: hardcoded API key
src/auth/login.ts:34 const password = req.body.pass   ← LOW: variable assignment
src/__tests__/helpers.ts:8  const testToken = "test"  ← OK: test fixture
```

**Step 3 — Unicode scan:**
```
mcp_milens_grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u202A-\\u202E]", scope: "code", isRegex: true, repo: "/home/user/project"})
```

**Output:** 0 matches. Clean.

**Step 4 — Dangerous patterns:**
```
mcp_milens_grep({pattern: "eval\\(|exec\\(|child_process|Function\\(", scope: "code", isRegex: true, repo: "/home/user/project"})
```

**Output:**
```
src/scripts/migrate.ts:22  exec(`pg_dump ${dbName}`)  ← CRITICAL: dynamic args
```

**Step 5 — Data leak:**
```
mcp_milens_grep({pattern: "console\\.(log|debug|info)\\(", scope: "code", isRegex: true, repo: "/home/user/project"})
```

**Output:**
```
src/auth/login.ts:28  console.log("User login:", email)  ← HIGH: logs PII
```

**Step 6 — Deep-dive:**
```
mcp_milens_review_symbol({name: "authHandler", repo: "/home/user/project"})
```

**Output:** Core auth entry point, 23 dependents, 0 tests — very high risk.

**Step 7 — Verify scope:**
```
mcp_milens_detect_changes({repo: "/home/user/project"})
```

**Output:** 8 files changed — matches expectations.

**Step 8 — Report produced** (see report format above). Verdict: **NEEDS REMEDIATION** (1 critical secret, 1 critical dangerous pattern, 1 high data leak).

## Best Practices

1. **Don't assume variable names are safe.** `const password = process.env.DB_PASS` is fine; `const password = "admin123"` is not. Read the value, not just the name.
2. **Unicode scan is non-negotiable.** Trojan Source attacks are invisible to human reviewers. Even a single zero-width character match is a blocking finding.
3. **Test fixtures get a pass — but verify.** `const testApiKey = "test-key"` is acceptable, but `const testApiKey = "sk-live-..."` is a leaked production key.
4. **Dynamic exec/Function is almost always wrong.** If `exec()` takes user-controlled input, it's remote code execution. The only acceptable pattern is fully-hardcoded command strings.
5. **Detect changes verifies the boundary.** If `detect_changes` shows files you didn't touch, something went wrong — config drift, lockfile churn, or accidental staging.

## Quality Gate

| Criteria | Pass | Fail |
|---|---|---|
| Secret scan | No hardcoded secrets found outside test fixtures | Any production secret in code |
| Unicode scan | Zero matches | Any hidden unicode character found |
| Dangerous patterns | No `eval`/`exec` with dynamic input | Any dynamic `exec()` or `Function()` call |
| Data leak | No PII/credentials in `console.log` | Sensitive data logged to console |
| Change scope | `detect_changes` matches expectations | Unexpected files in the diff |
| All scans completed | All 7 steps executed | Any tool call skipped or failed |
