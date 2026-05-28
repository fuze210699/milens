---
paths:
  - "src/security/**"
---

# Security

## Overview
Contains 35 symbols (15 exported) across 2 files.

## Key Symbols
- **`loadRules`** [function] (src/security/rules.ts:1044) — 6 refs
- **`Ecosystem`** [type] (src/security/deps.ts:8) — 3 refs
- **`auditDependencies`** [function] (src/security/deps.ts:732) — 2 refs
- **`VulnerabilityReport`** [interface] (src/security/deps.ts:26) — 2 refs
- **`getRulesByCategory`** [function] (src/security/rules.ts:1048) — 2 refs
- **`getRulesBySeverity`** [function] (src/security/rules.ts:1052) — 2 refs
- **`detectEcosystem`** [function] (src/security/deps.ts:512) — 1 refs
- **`parseDependencies`** [function] (src/security/deps.ts:524) — 1 refs
- **`checkVulnerabilities`** [function] (src/security/deps.ts:687) — 1 refs
- **`SecurityCategory`** [type] (src/security/rules.ts:3) — 1 refs
- **`Dependency`** [interface] (src/security/deps.ts:10) — 0 refs
- **`Vulnerability`** [interface] (src/security/deps.ts:16) — 0 refs
- **`SecurityRule`** [interface] (src/security/rules.ts:14) — 0 refs
- **`SecurityMatch`** [interface] (src/security/rules.ts:29) — 0 refs
- **`SecurityReport`** [interface] (src/security/rules.ts:41) — 0 refs

## Entry Points
- **`readManifest`** [function] — 6 incoming references
- **`loadRules`** [function] — 6 incoming references
- **`Ecosystem`** [type] — 3 incoming references
- **`manifestExists`** [function] — 2 incoming references
- **`parseSemver`** [function] — 2 incoming references

## Dependencies
- **root**: `has`

## Used By
- **root**: `loadRules`, `auditDependencies`
- **server**: `loadRules`
- **test**: `loadRules`, `getRulesByCategory`, `getRulesBySeverity`

## Files
- src/security/deps.ts
- src/security/rules.ts
