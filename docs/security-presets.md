# Milens Security Presets — AgentShield Equivalent

> Map of ECC AgentShield 102 rules → milens `grep()` patterns.
> Run these before/after every Vibe Code session.

## Secrets Detection
grep({pattern: "password|secret|api_key|token|private_key|AUTH_TOKEN", scope: "code"})

## AWS/Cloud Credentials
grep({pattern: "AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}", scope: "code"})

## Hidden Unicode & Injection
grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u202A-\\u202E]", scope: "code"})

## Dangerous Code Patterns
grep({pattern: "eval\\(|exec\\(|child_process|Function\\(", scope: "code"})

## Data Leaks
grep({pattern: "console\\.(log|debug|info|warn)\\(", scope: "code"})

## Hardcoded URLs
grep({pattern: "https?://(?!localhost|127\\.0\\.0\\.1)", scope: "code"})

## SQL Injection
grep({pattern: "query\\(.*\\$\\{|execute\\(.*\\$\\{", scope: "code"})

## .env Files
grep({pattern: "\\.env", scope: "all"})

## Deprecated Packages
grep({pattern: "request@|core-js@2|left-pad|moment@", scope: "all"})

## TODO/FIXME/HACK Debt Markers
grep({pattern: "TODO|FIXME|HACK|XXX", scope: "code"})

## HTML Comments (potential injection)
grep({pattern: "<!--|<script|data:text/html|base64,", scope: "code"})
