# Vận hành dự án Vibe Code với triết lý ECC + milens

> **Không cần cài ECC** — dùng ý tưởng vận hành của ECC, dùng milens làm công cụ thực thi code intelligence.
>
> Báo cáo mở rộng: Token Economics • Memory Persistence • Verification Loops • Parallelization • Security Architecture • Sub-agent Orchestration • Planner Agent • Cheatsheet • Phụ lục

---

## Mục lục

1. [Vibe Code là gì và đau ở đâu?](#1-vibe-code-là-gì-và-đau-ở-đâu)
2. [Kiến trúc ECC — hệ quy chiếu](#2-kiến-trúc-ecc--hệ-quy-chiếu)
3. [Token Economics — Kinh tế token](#3-token-economics--kinh-tế-token)
4. [Memory Persistence — Bộ nhớ xuyên phiên](#4-memory-persistence--bộ-nhớ-xuyên-phiên)
5. [Verification Loops — Vòng lặp xác minh](#5-verification-loops--vòng-lặp-xác-minh)
6. [Parallelization — Song song hóa](#6-parallelization--song-song-hóa)
7. [Security Architecture — Kiến trúc bảo mật](#7-security-architecture--kiến-trúc-bảo-mật)
8. [Sub-agent Orchestration — Điều phối đa tác nhân](#8-sub-agent-orchestration--điều-phối-đa-tác-nhân)
9. [Planner Agent — Deep-dive](#9-planner-agent--deep-dive)
10. [Ánh xạ ECC → milens (đầy đủ)](#10-ánh-xạ-ecc--milens-đầy-đủ)
11. [Bảng so sánh trực tiếp](#11-bảng-so-sánh-trực-tiếp)
12. [Quy trình Vibe Code hoàn chỉnh 6 bước](#12-quy-trình-vibe-code-hoàn-chỉnh-6-bước)
13. [Cheatsheet: Tình huống → milens tool](#13-cheatsheet-tình-huống--milens-tool)
14. [Lợi thế & Hạn chế](#14-lợi-thế--hạn-chế)
15. [Phụ lục A: 32 milens tools — use case cụ thể](#phụ-lục-a-32-milens-tools--use-case-cụ-thể)
16. [Phụ lục B: Mẫu CI/CD tích hợp milens](#phụ-lục-b-mẫu-cicd-tích-hợp-milens)
17. [Phụ lục C: Security checklist cho Vibe Code](#phụ-lục-c-security-checklist-cho-vibe-code)

---

## 1. Vibe Code là gì và đau ở đâu?

Vibe Code = phát triển phần mềm bằng AI agent qua mô tả ý tưởng ("làm cho tôi một app quản lý task", "thêm chức năng đăng nhập GitHub"). Agent tự đọc codebase, viết code, sửa file — developer chủ yếu review và hướng dẫn.

### 1.1 Vấn đề điển hình sau 10-20 vòng lặp AI

| Vấn đề | Hậu quả | Tần suất |
|---|---|---|
| Agent không biết cấu trúc codebase → đọc file dò dẫm | Tốn token, chậm, context window cạn nhanh | Mỗi phiên |
| Sửa 1 hàm → vỡ 5 chỗ khác (blast radius) | Fix bug sinh bug mới, chuỗi fix vô tận | 3-5 lần/phiên |
| Dead code tích tụ qua nhiều phiên | Codebase phình to, agent bị confused bởi code thừa | Sau 5-10 phiên |
| Không viết test → sợ refactor | Technical debt tích lũy, sợ đụng vào code cũ | Luôn luôn |
| Mỗi phiên agent bắt đầu từ con số 0 | Lặp lại sai lầm cũ, hỏi lại câu đã hỏi | Mỗi phiên |
| Không rà soát bảo mật | Lỗ hổng不被 phát hiện, prompt injection, secret leak | Sau mỗi lần thêm tính năng |

### 1.2 Chi phí ẩn của Vibe Code

```
Không có code intelligence:
  Agent đọc 15 file × 2000 token/file = 30,000 token
  Agent gọi grep 5 lần × 500 token/lần  = 2,500 token
  Agent đọc sai file 3 lần                = 6,000 token
  ─────────────────────────────────────────────────
  Tổng token lãng phí mỗi phiên:         ~38,500 token
  Với Opus ($15/MTok input):             ~$0.58/phên

Có milens codebase_summary():
  1 lần gọi                                = ~500 token
  ─────────────────────────────────────────────────
  Tiết kiệm:                              98.7% token
```

### 1.3 Tại sao ECC là hệ quy chiếu tốt?

- **182K+ GitHub stars** — đã được battle-test bởi hàng nghìn developer
- **10+ tháng sử dụng hàng ngày** — không phải lý thuyết, là kinh nghiệm thực chiến
- **Thắng Anthropic Hackathon** — xây dựng [zenith.chat](https://zenith.chat) hoàn toàn bằng Claude Code + ECC
- **7 harness** — Claude Code, Codex, Cursor, OpenCode, Gemini, Zed, Copilot

---

## 2. Kiến trúc ECC — hệ quy chiếu

ECC không phải 1 repo đơn thuần — là **hệ thống 4 lớp**:

| Lớp | Thành phần | Mô tả | Tương đương milens |
|---|---|---|---|
| **Distribution** | 246 skills, 61 agents, 76 commands | Workflow đóng gói sẵn | 32 MCP tools (code intelligence) |
| **Protection** | AgentShield (102 rules, 1282 tests) | Quét bảo mật cấu hình agent | `review_pr()` + `grep()` + `review_symbol()` |
| **Control-plane** | ECC 2.0 (Rust daemon) | Observability, session orchestration | `session_*()` + `dashboard()` |
| **Memory** | Instincts + hooks persistence | Học liên tục, ghi nhớ xuyên phiên | `annotate()` + `recall()` + `handoff()` |

### 2.1 Năm trụ cột vận hành

```
┌──────────────────────────────────────────────────────────────┐
│                    ECC OPERATING MODEL                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. SKILLS/AGENTS    Workflow bundles đóng gói                │
│     /tdd  /code-review  /plan  /refactor-clean  /eval        │
│                                                               │
│  2. HOOKS            Trigger-based automation                 │
│     PreToolUse  PostToolUse  Stop  SessionStart  PreCompact  │
│                                                               │
│  3. SUB-AGENTS       Delegate task với scope giới hạn         │
│     planner  reviewer  tester  architect  builder             │
│                                                               │
│  4. CONTINUOUS LEARNING  Instinct system                      │
│     Auto-extract patterns → reusable skills + confidence      │
│                                                               │
│  5. CONTEXT MGMT     Token economics + model routing           │
│     Haiku↔Sonnet↔Opus  compact  system-prompt injection      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Token Economics — Kinh tế token

> *"Your 200k context window before compacting might only be 70k with too many tools enabled."*
> — ECC Longform Guide

### 3.1 Model Routing — khi nào dùng model nào

ECC khuyến nghị routing task theo độ phức tạp:

| Task | Model | Lý do | Dùng milens thay thế? |
|---|---|---|---|
| Exploration/search file | Haiku | Nhanh, rẻ, đủ để tìm file | **Có** — `query()` + `grep()` nhanh hơn |
| Simple single-file edit | Haiku | Rõ ràng, ít context | **Có** — `edit_check()` trước khi edit |
| Multi-file implementation | Sonnet | Balance tốt nhất cho code | Dùng milens để **giảm** số file cần đọc |
| Complex architecture | Opus | Cần deep reasoning | Dùng milens để cung cấp context compact |
| PR reviews | Sonnet | Hiểu context, bắt nuance | **Có** — `review_pr()` tự động hóa |
| Security analysis | Opus | Không thể bỏ sót | **Có** — `review_symbol()` + `grep()` |
| Writing docs | Haiku | Cấu trúc đơn giản | Dùng `get_file_symbols()` để biết cần doc gì |
| Debugging complex bugs | Opus | Cần giữ toàn bộ hệ thống trong đầu | **Có** — `trace()` + `context()` |

### 3.2 Token saving pattern — "Replace MCP with CLI"

ECC khuyến nghị: thay vì để MCP server chạy ngầm ăn context window, gói chức năng vào CLI command hoặc skill.

Áp dụng cho milens:

```bash
# Thay vì agent tự đọc 10 file để hiểu codebase (30,000 token):
agent: đọc file A, đọc file B, đọc file C, ...

# Dùng milens (500 token):
agent: Gọi codebase_summary({})
→ Trả về: Top symbols, domains, test coverage, annotations
→ Agent hiểu ngay bối cảnh, tiết kiệm 98% token
```

### 3.3 Context injection patterns

ECC dùng dynamic system prompt injection để nạp context theo ngữ cảnh:

```bash
# ECC pattern: alias với system prompt khác nhau
alias claude-dev='claude --system-prompt "$(cat ~/.claude/contexts/dev.md)"'
alias claude-review='claude --system-prompt "$(cat ~/.claude/contexts/review.md)"'
```

Với milens:

```bash
# Milens pattern: codebase_summary làm system prompt injection
# Tạo file context từ milens:
npx milens analyze -p . --force --skills
cat .agents/skills/milens/SKILL.md  # Đã có context compact từ milens

# Agent khởi động → đọc SKILL.md → hiểu ngay codebase
```

### 3.4 Bảng so sánh chi phí token

| Tác vụ | Không có milens | Có milens | Tiết kiệm |
|---|---|---|---|
| Hiểu codebase mới | 30,000 token (đọc 15 file) | 500 token (`codebase_summary`) | 98.3% |
| Tìm symbol | 2,000 token (grep + đọc) | 50 token (`query`) | 97.5% |
| Kiểm tra blast radius | 10,000 token (đọc + trace thủ công) | 200 token (`impact`) | 98.0% |
| Tìm code chết | 5,000 token (grep + phân tích) | 100 token (`find_dead_code`) | 98.0% |
| Review PR | 15,000 token (đọc diff + context) | 500 token (`review_pr`) | 96.7% |
| Lập test plan | 8,000 token (phân tích thủ công) | 300 token (`test_plan`) | 96.3% |

---

## 4. Memory Persistence — Bộ nhớ xuyên phiên

> *"Claude creates a file summarizing current state. Review it, ask for edits if needed, then start fresh. For the new conversation, just provide the file path."*
> — ECC Longform Guide

### 4.1 Vấn đề "Mỗi phiên bắt đầu từ số 0"

```
Phiên 1: Agent debug lỗi auth, phát hiện createUser() có bug tinh vi,
         fix xong, hết phiên.
Phiên 2: Agent KHÔNG BIẾT gì về phiên 1.
         Lại đọc code, lại phát hiện bug cũ, lại fix...
         → Lãng phí token, thời gian, context window.
```

### 4.2 ECC Memory Persistence Hooks

ECC dùng 3 hook để duy trì bộ nhớ:

| Hook | Trigger | Chức năng |
|---|---|---|
| **PreCompact** | Trước khi compact context | Lưu state quan trọng ra file `.tmp` |
| **Stop** | Khi kết thúc phiên | Persist learning vào file session |
| **SessionStart** | Khi bắt đầu phiên mới | Load context từ phiên trước |

### 4.3 Milens Memory System — vượt trội hơn ECC

```
┌─────────────────────────────────────────────────────────────┐
│              MILENS MEMORY ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ECC: File-based instincts (.md files)                      │
│   └─ Khó query, khó filter, không structured               │
│                                                              │
│  MILENS: SQLite-based annotations + sessions                │
│   └─ Queryable, filterable, structured, persistent          │
│                                                              │
│  ┌────────────────────┐  ┌────────────────────┐             │
│  │   annotations       │  │   sessions          │             │
│  │   table             │  │   table             │             │
│  ├────────────────────┤  ├────────────────────┤             │
│  │ symbol: createUser  │  │ agent: vibe-coder   │             │
│  │ key: note           │  │ status: active      │             │
│  │ value: "Hay vỡ..."  │  │ started: 2026-05-27 │             │
│  │ agent: vibe-coder   │  │ tool_calls: 142     │             │
│  │ session: abc123     │  │ annotations: 23     │             │
│  └────────────────────┘  └────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Workflow Memory cụ thể

```bash
# === CUỐI PHIÊN 1: Ghi nhớ ===
annotate({symbol: "createUser", key: "note",
          value: "Bug tinh vi: field 'email' bị overwrite bởi normalizeEmail() nếu gọi sai thứ tự. Fix: gọi createUser() trước normalizeEmail(). Đã test với 3 edge case."})

annotate({symbol: "createUser", key: "security",
          value: "Hàm này nhận password plaintext → cần hash trước khi insert. Dependency: hashPassword() trong cùng file."})

annotate({symbol: "AuthService", key: "architecture",
          value: "Hub function với 15 dependents. ĐỪNG refactor nếu không có test coverage đủ. Xem impact() trước khi sửa."})

# === ĐẦU PHIÊN 2: Nhớ lại ===
recall({symbol: "createUser"})
# → Trả về 2 annotations với key "note" và "security"
# → Agent biết ngay: cẩn thận với normalizeEmail(), cần hash password

recall({symbol: "AuthService"})
# → "Hub function với 15 dependents. ĐỪNG refactor..."
# → Agent tránh sửa AuthService, chọn approach an toàn hơn
```

#### Multi-agent Memory Handoff

```bash
# Vibe-coder hoàn thành 1 đợt code
session_start({agent: "vibe-coder-01"})
# ... vibe coding ...

# Handoff cho reviewer
handoff({
  from_session: "vibe-coder-01",
  to_agent: "reviewer-01",
  context: "Vừa thêm tính năng Stripe billing. Đã sửa: checkout.ts, webhooks.ts, middleware.ts. createUser() đã được sửa — xem annotation để biết caveat."
})

# Reviewer nhận context
session_context({session_id: "reviewer-01"})
# → Có ngay: files đã sửa, annotations liên quan, symbols rủi ro
```

---

## 5. Verification Loops — Vòng lặp xác minh

> *"Compare asking for the same thing with and without a skill and checking the output difference."*
> — ECC Longform Guide

### 5.1 Hai loại eval pattern

| Pattern | Mô tả | Khi nào dùng |
|---|---|---|
| **Checkpoint-based** | Đặt checkpoint rõ ràng, verify trước khi tiếp tục | Dự án có cấu trúc, multi-phase |
| **Continuous** | Chạy mỗi N phút hoặc sau mỗi thay đổi lớn | Vibe code liên tục, fast iteration |

### 5.2 pass@k và pass^k metrics

```
pass@k: Ít nhất 1 trong k lần thử THÀNH CÔNG
  k=1: 70%   k=3: 91%   k=5: 97%
  → Dùng khi: chỉ cần code chạy được

pass^k: TẤT CẢ k lần thử phải THÀNH CÔNG
  k=1: 70%   k=3: 34%   k=5: 17%
  → Dùng khi: cần consistency (production, security)
```

Áp dụng với milens:

```bash
# Checkpoint eval: test_plan → implement → test_impact → verify
# pass@k=3: agent viết test 3 lần, ít nhất 1 lần pass

test_plan({name: "checkoutHandler"})
# → Trả về: mock Stripe SDK, test 3 scenarios, dùng stub cho webhook
# Agent implement test lần 1 → fail
# Agent implement test lần 2 → fail
# Agent implement test lần 3 → pass ✓
# → pass@3 = success
```

### 5.3 Checkpoint-based eval với milens

```
┌─────────────────────────────────────────────────────────────┐
│               CHECKPOINT EVAL WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CHECKPOINT 1: Plan                                         │
│  > smart_context({name: "target", intent: "edit"})         │
│  > edit_check({name: "target"})                             │
│  → Verify: callers ≤ 5? test coverage > 0? re-exports ok?  │
│                                                              │
│  CHECKPOINT 2: Test                                         │
│  > test_plan({name: "target"})                             │
│  → Verify: mock strategy rõ ràng? ≥ 3 test cases?          │
│                                                              │
│  CHECKPOINT 3: Implement                                    │
│  [Agent viết code]                                          │
│  > detect_changes({})                                       │
│  → Verify: chỉ expected files bị sửa?                      │
│                                                              │
│  CHECKPOINT 4: Impact                                       │
│  > impact({target: "modifiedSymbol", depth: 3})            │
│  → Verify: depth 1 WILL BREAK ≤ 3 symbols?                 │
│                                                              │
│  CHECKPOINT 5: Review                                       │
│  > review_pr({})                                             │
│  → Verify: 0 CRITICAL? ≤ 2 HIGH?                           │
│                                                              │
│  CHECKPOINT 6: Coverage                                      │
│  > test_coverage_gaps({limit: 10})                         │
│  → Verify: target symbol có test coverage?                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Continuous eval — tự động hóa

```yaml
# .github/workflows/milens-continuous-eval.yml
name: Milens Continuous Eval
on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 */4 * * *'  # Mỗi 4 giờ

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Refresh index
        run: npx milens analyze -p . --force
      - name: Checkpoint 1 — Dead code
        run: npx milens inspect "find_dead_code" # via MCP
      - name: Checkpoint 2 — Test gaps
        run: npx milens inspect "test_coverage_gaps"
      - name: Checkpoint 3 — PR risk
        run: npx milens inspect "review_pr"
      - name: Alert if CRITICAL
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"⚠️ Milens eval FAILED — CRITICAL issues detected"}'
```

---

## 6. Parallelization — Song song hóa

> *"Your goal should be: how much can you get done with the minimum viable amount of parallelization."*
> — ECC Longform Guide

### 6.1 Cascade Method (ECC)

```
┌──────────────────────────────────────────────────────────┐
│                  CASCADE METHOD                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Terminal 1    Terminal 2    Terminal 3    Terminal 4    │
│  (oldest)      (newer)       (newer)       (newest)      │
│  ┌────────┐   ┌────────┐    ┌────────┐    ┌────────┐    │
│  │ MAIN   │   │ FORK 1 │    │ FORK 2 │    │ FORK 3 │    │
│  │ code   │   │ ques-  │    │ refac- │    │ secu-  │    │
│  │ changes│   │ tions  │    │ toring │    │ rity   │    │
│  └────────┘   └────────┘    └────────┘    └────────┘    │
│                                                           │
│  Sweep left → right. Focus on ≤ 3-4 tasks at a time.    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Milens Domain-based Parallelization

Thay vì phân chia theo file, phân chia theo **domain** (cụm module độc lập):

```bash
# Gọi domains() để biết codebase có những cụm nào độc lập
domains({})
# → parser (396 symbols, 43 files)    ← Terminal 1
# → store  (89 symbols, 4 files)      ← Terminal 2
# → server (38 symbols, 1 file)       ← Terminal 3
# → test   (... symbols, ... files)   ← Terminal 4

# Mỗi terminal làm việc trên 1 domain KHÔNG overlap
# Milens index là shared — mọi terminal dùng chung knowledge graph
```

### 6.3 Git Worktrees + milens

```bash
# Tạo worktrees cho các task song song
git worktree add ../project-feature-a feature-a
git worktree add ../project-feature-b feature-b
git worktree add ../project-security-audit security-audit

# Mỗi worktree có milens index riêng
cd ../project-feature-a && npx milens analyze -p . --force
cd ../project-feature-b && npx milens analyze -p . --force

# Mỗi worktree có agent riêng, dùng milens làm context riêng
# KHÔNG overlap code changes, share knowledge graph structure
```

### 6.4 Two-Instance Kickoff Pattern (ECC)

ECC khởi động dự án mới với 2 instance song song:

| Instance | Vai trò | Milens tool hỗ trợ |
|---|---|---|
| **Scaffolding Agent** | Tạo project structure, configs, CLAUDE.md | `codebase_summary()` sau khi scaffold |
| **Deep Research Agent** | PRD, architecture diagrams, references | `semantic_search()` để tìm pattern tương tự |

---

## 7. Security Architecture — Kiến trúc bảo mật

> *"Build as if malicious text will get into context. Build as if a tool description can lie. Build as if a repo can be poisoned."*
> — ECC Security Guide

### 7.1 Bối cảnh: Vibe Code = rủi ro bảo mật cao

Số liệu từ ECC Security Guide (2025-2026):

| Thống kê | Chi tiết |
|---|---|
| **CVSS 8.7** | CVE-2025-59536 — Claude Code hook pre-trust execution |
| **36%** | Skills công khai chứa prompt injection (Snyk ToxicSkills, 3,984 skills) |
| **1,467** | Malicious payloads identified trong public skills |
| **31 companies / 14 industries** | AI Recommendation Poisoning (Microsoft, Feb 2026) |
| **17,470** | OpenClaw instances exposed trên internet (Hunt.io) |

### 7.2 Attack Surface của Vibe Code Project

```
┌────────────────────────────────────────────────────────────┐
│               ATTACK SURFACE MAP                            │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Entry Points                Attack Vectors                 │
│  ┌──────────┐               ┌──────────────────┐           │
│  │ Git Repo │──→ PR comments, commit messages,  │          │
│  │          │    diff comments, issue bodies     │          │
│  ├──────────┤               ├──────────────────┤           │
│  │ MCP      │──→ Tool poisoning, shadow servers,│          │
│  │ Servers  │    schema injection               │          │
│  ├──────────┤               ├──────────────────┤           │
│  │ Skills/  │──→ Prompt injection, hidden       │          │
│  │ Rules    │    unicode, command injection      │          │
│  ├──────────┤               ├──────────────────┤           │
│  │ External │──→ Email attachments, PDFs,       │          │
│  │ Content  │    screenshots, web pages          │          │
│  ├──────────┤               ├──────────────────┤           │
│  │ Depend-  │──→ Malicious npm packages,        │          │
│  │ encies   │    supply chain attacks            │          │
│  └──────────┘               └──────────────────┘           │
│                                                             │
│  TARGET: Agent với filesystem access + API keys             │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 7.3 Milens Security Toolkit — thay thế AgentShield

ECC có AgentShield (102 rules). Với milens, dùng bộ công cụ sau:

#### 7.3.1 Secret Detection

```bash
# Phát hiện secrets trong code
grep({pattern: "password|secret|api_key|token|private_key|AUTH_TOKEN",
      scope: "code"})

# Phát hiện AWS/cloud credentials
grep({pattern: "AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{32,}",
      scope: "code"})

# Phát hiện .env files không trong .gitignore
grep({pattern: "\\.env", scope: "all"})
```

#### 7.3.2 Hidden Unicode & Injection Detection

```bash
# Phát hiện zero-width characters và bidi override
grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u202A-\\u202E]",
      scope: "code"})

# Phát hiện HTML comments ẩn trong code (potential injection)
grep({pattern: "<!--|<script|data:text/html|base64,",
      scope: "code"})

# Phát hiện eval/exec patterns nguy hiểm
grep({pattern: "eval\\(|exec\\(|child_process|Function\\(",
      scope: "code"})
```

#### 7.3.3 Dependency Security Audit

```bash
# Kiểm tra dependencies có lỗ hổng không
grep({pattern: "lodash|minimist|node-fetch", scope: "imports"})
# → Kết hợp với npm audit / snyk test cho version cụ thể

# Phát hiện deprecated packages
grep({pattern: "request@|core-js@2|left-pad",
      scope: "all"})
```

#### 7.3.4 Code Quality Security Checks

```bash
# Phát hiện console.log (potential data leak)
grep({pattern: "console\\.(log|debug|info)\\(",
      scope: "code"})

# Phát hiện hardcoded URLs/configs
grep({pattern: "https?://(?!your-domain\\.com)",
      scope: "code"})

# Phát hiện SQL injection patterns
grep({pattern: "query\\(.*\\$\\{|execute\\(.*\\$\\{",
      scope: "code"})
```

#### 7.3.5 Structural Security với review tools

```bash
# Đánh giá rủi ro tổng thể
review_pr({})
# → Từng symbol được score: LOW / MEDIUM / HIGH / CRITICAL
# → Symbols CRITICAL cần audit ngay

# Đánh giá single symbol risk
review_symbol({name: "handlePayment"})
# → role: hub | heat: 0.92 (rất nóng, được gọi nhiều)
# → 15 dependents | test coverage: NO
# → Risk: CRITICAL — hàm thanh toán, không test, nhiều dependents!
```

### 7.4 Sandboxing cho Vibe Code (khuyến nghị từ ECC)

```yaml
# docker-compose.yml — sandbox cho agent
services:
  agent:
    build: .
    user: "1000:1000"
    working_dir: /workspace
    volumes:
      - ./workspace:/workspace:rw
    cap_drop:
      - ALL                          # Bỏ tất cả capabilities
    security_opt:
      - no-new-privileges:true       # Không escalate privilege
    networks:
      - agent-internal

networks:
  agent-internal:
    internal: true                   # KHÔNG có outbound network
```

### 7.5 Kill Switch Pattern

```bash
# Heartbeat check — nếu agent không phản hồi 30s → kill
# Dùng milens dashboard để monitor agent activity
milens_dashboard()
# → Xem usage stats, tool calls, response times
# → Nếu detect anomaly pattern → kill process group

# Process group kill (Node.js)
# process.kill(-child.pid, "SIGKILL");
# Kill cả parent + children, tránh zombie processes
```

### 7.6 Observability với milens

```bash
# Mỗi phiên có session ID → full audit trail
session_start({agent: "vibe-coder-session-42"})

# Tất cả tool calls được track:
# tool name + input summary + files touched + timestamp
# Có thể query lại lịch sử để audit

session_context({session_id: "vibe-coder-session-42"})
# → 142 tool calls, 23 annotations, 15 files modified
```

---

## 8. Sub-agent Orchestration — Điều phối đa tác nhân

> *"The orchestrator has semantic context the sub-agent lacks. The sub-agent only knows the literal query, not the PURPOSE behind the request."*
> — ECC Longform Guide, "Sub-Agent Context Problem"

### 8.1 Sub-Agent Context Problem

```
┌──────────────────────────────────────────────────────────┐
│          THE SUB-AGENT CONTEXT PROBLEM                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ORCHESTRATOR (main agent)      SUB-AGENT (delegated)    │
│  ┌────────────────────┐        ┌────────────────────┐    │
│  │ Biết:               │        │ Biết:               │    │
│  │ - Mục tiêu dự án   │        │ - Query literal    │    │
│  │ - Context đầy đủ   │   ──→  │ - KHÔNG biết WHY   │    │
│  │ - Tại sao cần làm   │   ←──  │ - KHÔNG biết mục   │    │
│  │ - Ưu tiên hiện tại  │        │   tiêu tổng thể    │    │
│  └────────────────────┘        └────────────────────┘    │
│                                                           │
│  Vấn đề: Sub-agent trả về kết quả đúng về mặt kỹ thuật  │
│  nhưng SAI về mặt ngữ cảnh vì không hiểu PURPOSE.       │
│                                                           │
│  Giải pháp (ECC): Iterative Retrieval — orchestrator     │
│  đánh giá kết quả, hỏi follow-up, lặp tối đa 3 lần.     │
│                                                           │
│  Giải pháp (milens): smart_context() TRUYỀN intent       │
│  + context đầy đủ cho sub-agent ngay từ đầu.             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Phase-based Sequential Execution (ECC)

ECC Planner Agent chia dự án thành 5 phase:

```
┌─────────────────────────────────────────────────────────────┐
│           5-PHASE EXECUTION PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: RESEARCH ──→ research-summary.md                  │
│  │  milens: domains() + codebase_summary() + grep()        │
│  │  Tìm hiểu cấu trúc, patterns hiện có                     │
│  │                                                           │
│  Phase 2: PLAN ──→ plan.md                                  │
│  │  milens: smart_context({intent: "edit"}) + trace()      │
│  │  Lập kế hoạch dựa trên hiểu biết codebase               │
│  │                                                           │
│  Phase 3: IMPLEMENT ──→ code changes                        │
│  │  milens: edit_check() + impact() + query()              │
│  │  Implement từng bước, kiểm tra blast radius             │
│  │                                                           │
│  Phase 4: REVIEW ──→ review-comments.md                     │
│  │  milens: review_pr() + review_symbol() +                │
│  │          find_dead_code() + test_coverage_gaps()        │
│  │  Review toàn diện, phát hiện vấn đề                     │
│  │                                                           │
│  Phase 5: VERIFY ──→ done or loop back                      │
│  │  milens: test_impact() + detect_changes()               │
│  │  Xác minh mọi thứ OK, nếu không → loop về Phase 3       │
│  │                                                           │
│  ⚡ Mỗi phase: 1 input rõ ràng → 1 output rõ ràng          │
│  ⚡ Output của phase trước = input của phase sau            │
│  ⚡ Dùng /clear giữa các phase để giải phóng context       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 Ánh xạ Phase → milens tools

| Phase | Milens tools | Output |
|---|---|---|
| **RESEARCH** | `codebase_summary()`, `domains()`, `grep()`, `routes()`, `semantic_search()` | Hiểu codebase, pattern, endpoint |
| **PLAN** | `smart_context({intent})`, `trace()`, `edit_check()`, `explain_relationship()` | Kế hoạch có blast radius awareness |
| **IMPLEMENT** | `impact()`, `edit_check()`, `context()`, `query()` | Code thay đổi an toàn |
| **REVIEW** | `review_pr()`, `review_symbol()`, `find_dead_code()`, `test_coverage_gaps()` | Báo cáo risk + gaps |
| **VERIFY** | `test_impact()`, `detect_changes()`, `impact()` | Xác minh hoàn tất |

### 8.4 Sub-agent roles với milens

```markdown
## Sub-agent: Reviewer (Milens-powered)
Scope: Chỉ đọc codebase, không sửa file
Tools: review_pr, review_symbol, find_dead_code, context, grep

Workflow:
1. review_pr({}) → danh sách file/symbol thay đổi + risk scores
2. Với mỗi symbol CRITICAL/HIGH:
   a. review_symbol({name}) → role, heat, dependents, test status
   b. context({name}) → incoming/outgoing links
   c. grep({pattern: "symbolName"}) → text references ngoài code
3. find_dead_code({}) → symbols export nhưng không ai dùng
4. Tạo báo cáo: symbols nào OK để merge, symbols nào cần fix

## Sub-agent: Tester (Milens-powered)
Scope: Đọc codebase + viết test files
Tools: test_coverage_gaps, test_plan, test_impact, context, query

Workflow:
1. test_coverage_gaps({limit: 15}) → untested symbols (sorted by risk)
2. Với top 5 symbols nguy hiểm nhất:
   a. test_plan({name}) → mock strategy, test scenarios
   b. context({name}) → hiểu dependencies để mock đúng
3. Viết test dựa trên test_plan
4. test_impact({}) → verify test coverage cho changes

## Sub-agent: Architect (Milens-powered)
Scope: Chỉ đọc, phân tích cấu trúc
Tools: codebase_summary, domains, trace, routes, explain_relationship

Workflow:
1. codebase_summary({}) → tổng quan toàn codebase
2. domains({}) → module clusters
3. trace({to: "mainEntryPoint"}) → execution flow
4. routes({}) → tất cả API endpoints
5. explain_relationship({from: "A", to: "B"}) → kết nối module
6. Tạo architecture decision record (ADR)
```

---

## 9. Planner Agent — Deep-dive

> *"A great plan is specific, actionable, and considers both the happy path and edge cases."*
> — ECC Planner Agent Spec

### 9.1 ECC Planner Agent — Cấu trúc

ECC Planner có workflow 4 bước:

```
1. Requirements Analysis → Hiểu yêu cầu, hỏi clarifying questions
2. Architecture Review   → Phân tích codebase, xác định affected components
3. Step Breakdown        → Chi tiết từng bước với file path, dependencies, risk
4. Implementation Order  → Sắp xếp theo dependencies, group related changes
```

Plan format chuẩn của ECC:

```markdown
# Implementation Plan: [Feature Name]

## Overview
[2-3 sentence summary]

## Requirements
- [Requirement 1]
- [Requirement 2]

## Architecture Changes
- [Change 1: file path and description]
- [Change 2: file path and description]

## Implementation Steps

### Phase 1: [Phase Name]
1. **[Step Name]** (File: path/to/file.ts)
   - Action: Specific action to take
   - Why: Reason for this step
   - Dependencies: None / Requires step X
   - Risk: Low/Medium/High

## Testing Strategy
- Unit tests: [files to test]
- Integration tests: [flows to test]
- E2E tests: [user journeys to test]

## Risks & Mitigations
- **Risk**: [Description]
  - Mitigation: [How to address]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

### 9.2 Milens-powered Planner — workflow nâng cao

```
┌─────────────────────────────────────────────────────────────┐
│         MILENS-POWERED PLANNER WORKFLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1: CODEBASE INTELLIGENCE                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ codebase_summary({})                                 │    │
│  │ → 587 symbols, top hubs: analyze, createMcpServer  │    │
│  │ → Test coverage: 54%                                │    │
│  │                                                      │    │
│  │ domains({})                                          │    │
│  │ → parser (396), server (38), store (89)            │    │
│  │ → Mỗi domain là 1 module cluster độc lập           │    │
│  │                                                      │    │
│  │ routes({})                                           │    │
│  │ → 11 routes detected: GET /api/users, POST /auth.. │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  STEP 2: TARGET ANALYSIS                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ smart_context({name: "targetFunction",              │    │
│  │                intent: "edit"})                      │    │
│  │ → callers (5): funcA, funcB, funcC, funcD, funcE   │    │
│  │ → deps (3): importX, importY, importZ               │    │
│  │ → role: hub | heat: 0.85                            │    │
│  │ → ✓ has test coverage                               │    │
│  │ → re-exported via: src/index.ts:3                   │    │
│  │                                                      │    │
│  │ edit_check({name: "targetFunction"})                 │    │
│  │ → ⚠ 5 direct callers — review cẩn thận             │    │
│  │ → ⚠ re-export chain — đừng đổi signature           │    │
│  │ → ✓ test coverage exists                            │    │
│  │                                                      │    │
│  │ trace({to: "targetFunction"})                        │    │
│  │ → Entry → Router → Controller → Service → target   │    │
│  │ → Hiểu execution flow đầy đủ                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  STEP 3: IMPACT PREDICTION                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ impact({target: "targetFunction", depth: 3})        │    │
│  │ → [depth 1] WILL BREAK: funcA, funcB, funcC        │    │
│  │ → [depth 2] LIKELY AFFECTED: funcD, funcE           │    │
│  │ → [depth 3] MAY NEED TESTING: funcF, funcG, funcH  │    │
│  │                                                      │    │
│  │ explain_relationship({from: "targetFunction",       │    │
│  │                       to: "distantFunc"})            │    │
│  │ → targetFunction → helperX → serviceY → distantFunc│    │
│  │ → 3 bước trung gian, hiểu tại sao distantFunc      │    │
│  │   cũng bị ảnh hưởng                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  STEP 4: TEST STRATEGY                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ test_plan({name: "targetFunction"})                  │    │
│  │ → Mock: importX (dùng stub), importY (dùng spy)    │    │
│  │ → Test cases:                                        │    │
│  │   1. Happy path — input valid → output expected     │    │
│  │   2. Edge case — null input → graceful error        │    │
│  │   3. Error case — dependency fails → proper handling│    │
│  │ → Existing tests: src/__tests__/target.test.ts      │    │
│  │                                                      │    │
│  │ test_coverage_gaps({limit: 10})                     │    │
│  │ → Những symbols liên quan cũng cần test?           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  STEP 5: FINAL PLAN                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tổng hợp tất cả thông tin → Implementation Plan     │    │
│  │ - Mỗi step có: file path + action + risk + deps    │    │
│  │ - Test strategy rõ ràng                              │    │
│  │ - Success criteria measurable                        │    │
│  │ - Risks identified + mitigations                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Ví dụ plan cụ thể với milens

Dựa trên ECC planner agent spec, đây là plan mẫu tích hợp milens:

```markdown
# Implementation Plan: Stripe Subscription Billing
# (Generated with milens intelligence)

## Codebase Intelligence (milens)
- Total: 587 symbols, 1021 links
- Affected domain: billing (new), auth (existing hub: AuthService)
- Existing routes: /api/auth/*, /api/users/* — cần thêm /api/checkout, /api/webhooks/stripe
- Blast radius warning: AuthService có 15 dependents → không modify, chỉ extend

## Architecture Changes
- New file: src/api/checkout/route.ts — Stripe Checkout session
- New file: src/api/webhooks/stripe/route.ts — Stripe event handler
- Modified: src/middleware.ts — thêm tier check
- Modified: src/types.ts — thêm SubscriptionTier enum (IMPACT: 8 dependents)

## Implementation Steps

### Phase 1: Database & Types (Minimal Viable)
1. **Add SubscriptionTier type** (File: src/types.ts)
   - Action: Thêm enum SubscriptionTier { FREE, PRO, ENTERPRISE }
   - Why: Cần type definition trước khi dùng
   - Dependencies: None
   - Risk: HIGH — types.ts có 8 dependents (milens impact depth 1)
   - ⚠  Milens: edit_check({name: "SubscriptionTier"}) trước khi merge

2. **Create checkout API** (File: src/api/checkout/route.ts)
   - Action: POST /api/checkout → Stripe Checkout session
   - Why: Server-side session creation, chống price tampering
   - Dependencies: Step 1
   - Risk: MEDIUM — cần Stripe secret key (dùng env var)

### Phase 2: Webhook & Middleware (Core Experience)
3. **Create Stripe webhook handler** (File: src/api/webhooks/stripe/route.ts)
   - Action: Handle checkout.session.completed, customer.subscription.updated
   - Why: Giữ subscription status đồng bộ với Stripe
   - Dependencies: Step 1
   - Risk: HIGH — webhook signature verification CRITICAL

4. **Add tier middleware** (File: src/middleware.ts)
   - Action: Check subscription tier, redirect free users
   - Why: Enforce tier limits server-side
   - Dependencies: Step 2
   - Risk: MEDIUM — phải handle expired, past_due states
   - ⚠  Milens: trace({from: "middleware", to: "AuthService"})
   - ⚠  Milens: impact({target: "middleware", depth: 3})

## Testing Strategy (milens-powered)
- test_plan({name: "createCheckoutSession"}) → mock Stripe SDK, 3 scenarios
- test_plan({name: "handleStripeWebhook"}) → mock event types, signature verification
- test_coverage_gaps({}) → check symbols liên quan đã có test chưa

## Risks & Mitigations
- **Risk**: Webhook events arrive out of order
  - Mitigation: Sử dụng event timestamps + idempotent updates
- **Risk**: types.ts modification breaks 8 dependents
  - Mitigation: milens impact() analysis → test tất cả depth-1 dependents
  - Milens: test_impact() → chạy đúng test files bị ảnh hưởng
- **Risk**: Prompt injection qua PR review automation
  - Mitigation: Không auto-merge; luôn cần human review

## Success Criteria
- [ ] User nâng cấp từ Free → Pro qua Stripe Checkout
- [ ] Webhook sync đúng subscription status
- [ ] Free user không access Pro features
- [ ] All depth-1 dependents của types.ts vẫn pass test
- [ ] test_coverage_gaps({}) không có CRITICAL symbols mới
```

---

## 10. Ánh xạ ECC → milens (đầy đủ)

### 10.1 Skills → Toolchains

```
ECC Skill/Command           →  milens Toolchain
──────────────────────────────────────────────────────────────────
/tdd                         →  test_coverage_gaps() → test_plan() → [implement] → test_impact()
/code-review                 →  review_pr() → review_symbol() → find_dead_code() → context()
/plan                        →  codebase_summary() → domains() → trace() → routes() → explain_relationship()
/refactor-clean              →  find_dead_code() → impact({target, depth: 2}) → grep({pattern})
/security-review             →  review_pr() → grep({pattern: secrets}) → review_symbol()
/test-coverage               →  test_coverage_gaps() → test_impact()
/eval                        →  test_plan() → review_pr() → detect_changes()
/update-docs                 →  get_file_symbols() → context() → grep({include: "**/*.md"})
/update-codemaps             →  get_file_symbols() → domains()
/build-fix                   →  impact({target: errorSymbol}) → context() → edit_check()
/verify                      →  detect_changes() → impact() → test_impact()
/checkpoint                  →  annotate() → session_context()
/learn                       →  annotate({all modified symbols})
/evolve                      →  recall() → find_similar() → promote patterns → annotate()
/model-route                 →  codebase_summary() (quyết định model dựa trên complexity)
/loop-start                  →  session_start() → codebase_summary()
/quality-gate                →  review_pr() → test_coverage_gaps() → detect_changes()
/harness-audit               →  overview() + status()
/save-session                →  annotate() + session_context()
/resume-session              →  recall() + codebase_summary() + session_start()
```

### 10.2 Hooks → Milens Checks

| ECC Hook | Trigger | Milens Equivalent |
|---|---|---|
| `PreToolUse: Bash(npm/pytest)` | Trước khi chạy npm/pytest | `impact({target})` — blast radius check |
| `PreToolUse: Write(.md)` | Trước khi tạo file .md | Không tương đương trực tiếp |
| `PreToolUse: git push` | Trước khi push | `detect_changes()` + `review_pr()` |
| `PostToolUse: Edit(.ts/.tsx)` | Sau khi edit TypeScript | `impact({target})` hoặc `detect_changes()` |
| `PostToolUse: Edit` | Sau mọi edit | `grep({pattern: "console\\.log"})` |
| `Stop: *` | Khi agent dừng | `review_pr()` + `test_impact()` + `annotate()` |
| `SessionStart` | Đầu phiên mới | `codebase_summary()` + `session_start()` + `recall()` |
| `PreCompact` | Trước compact context | `codebase_summary()` (save state) |
| `Notification` | Permission request | `review_symbol()` cho risky operations |

### 10.3 Sub-agents → Prompt Chains

```markdown
## Planner Agent (Milens)
Tools: codebase_summary, domains, smart_context, trace, routes,
       explain_relationship, edit_check, impact, test_plan

Workflow: RESEARCH → PLAN → IMPACT_PREDICT → TEST_STRATEGY → FINAL_PLAN

## Reviewer Agent (Milens)
Tools: review_pr, review_symbol, find_dead_code, context, grep,
       detect_changes

Workflow: PR_SCAN → SYMBOL_DEEP_DIVE → DEAD_CODE → TEXT_SEARCH → REPORT

## Tester Agent (Milens)
Tools: test_coverage_gaps, test_plan, test_impact, context, query

Workflow: GAPS → PLAN → IMPLEMENT → VERIFY

## Architect Agent (Milens)
Tools: codebase_summary, domains, trace, routes, explain_relationship,
       get_type_hierarchy, find_similar, semantic_search

Workflow: OVERVIEW → DOMAINS → ROUTES → HIERARCHY → CONNECTIONS

## Security Agent (Milens)
Tools: review_pr, review_symbol, grep, context, detect_changes

Workflow: PR_SCAN → SECRET_SCAN → UNICODE_SCAN → DEPENDENCY_AUDIT → REPORT

## Debugger Agent (Milens)
Tools: smart_context({intent: "debug"}), trace, context, impact, grep,
       explain_relationship

Workflow: CONTEXT → TRACE → IMPACT → RELATIONSHIP → FIND_ROOT_CAUSE
```

---

## 11. Bảng so sánh trực tiếp

| Chức năng | ECC | milens | Winner |
|---|---|---|---|
| **Code intelligence** | Codemaps (file thủ công) | Knowledge graph SQLite (tự động, real-time) | milens |
| **Blast radius** | Không có | `impact()` — chính xác đến từng symbol, 3 tầng depth | milens |
| **Dead code detection** | Agent refactor-cleaner | `find_dead_code()` — SQL query trực tiếp | milens |
| **Test coverage analysis** | Agent tdd-guide | `test_coverage_gaps()` + `test_plan()` + `test_impact()` | milens |
| **PR review** | GitHub App tự động | `review_pr()` + `review_symbol()` | ECC |
| **Session memory** | Instincts (file-based) | `annotate()` + `sessions()` (SQLite, queryable) | milens |
| **Security scan** | AgentShield (102 rules) | `review_pr()` + `grep()` + `review_symbol()` | ECC |
| **Code search** | mgrep plugin | `query()` (FTS5) + `grep()` (regex toàn file) | Tie |
| **Semantic search** | Không có | `semantic_search()` — hybrid FTS5 + vector | milens |
| **Routes detection** | Không có | `routes()` — 11 frameworks tự động | milens |
| **Type hierarchy** | Không có | `get_type_hierarchy()` — inheritance tree | milens |
| **Execution tracing** | Thủ công (đọc code) | `trace()` — call chains tự động | milens |
| **Symbol similarity** | Không có | `find_similar()` — embedding proximity | milens |
| **Multi-agent** | Sub-agents + dmux | `session_start()` + `handoff()` + `session_context()` | Tie |
| **Hooks system** | JSON hook trigger-based | Gọi milens CLI trong CI/CD hoặc prompt chain | ECC |
| **Continuous learning** | Instinct system (auto) | `annotate()` + `recall()` (manual nhưng queryable) | ECC |
| **GitHub App** | Có (tự động PR review) | Chạy CLI trong GitHub Actions | ECC |
| **Dashboard GUI** | Tkinter desktop app | Browser-based analytics dashboard | Tie |
| **Độ phủ ngôn ngữ** | Rules thủ công cho 12 ngôn ngữ | Tree-sitter parser tự động cho 12 ngôn ngữ | milens |
| **Framework detection** | Không có | 11 frameworks (Express, FastAPI, NestJS, Flask, ...) | milens |
| **Offline capability** | OSS layer offline | 100% offline (zero network, zero telemetry) | milens |
| **Install complexity** | Plugin + marketplace + rules copy | `npx milens analyze` — 1 lệnh | milens |
| **Context window cost** | 30+ tools nếu enable nhiều MCP | 1 MCP server, 32 tools, có thể disable | Tie |

---

## 12. Quy trình Vibe Code hoàn chỉnh 6 bước

```
┌─────────────────────────────────────────────────────────────────┐
│                    VIBE CODE WORKFLOW v2                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  1. BOOTSTRAP (đầu phiên — 30s)                          ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  $ milens analyze -p . --force                            ║  │
│  ║  > codebase_summary({})                                   ║  │
│  ║    → 587 symbols, 1021 links, 54% coverage               ║  │
│  ║    → Top hubs: analyze, createMcpServer                  ║  │
│  ║  > domains({})                                            ║  │
│  ║    → parser (396), root (89), server (38), store (89)   ║  │
│  ║  > session_start({agent: "vibe-coder"})                  ║  │
│  ║  > recall({}) — nhớ lại annotations phiên trước          ║  │
│  ║    → "AuthService: 15 dependents, cẩn thận khi sửa"     ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                           ↓                                      │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  2. PLAN (trước khi code — 2-5 phút)                     ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  > smart_context({name: "target", intent: "edit"})      ║  │
│  ║    → callers (5) + deps (3) + role: hub + heat: 0.85    ║  │
│  ║  > edit_check({name: "target"})                          ║  │
│  ║    → ⚠ 5 callers | ✓ test coverage | ⚠ re-export       ║  │
│  ║  > trace({to: "target"})                                 ║  │
│  ║    → Entry → Router → Controller → Service → Target     ║  │
│  ║  > impact({target: "target", depth: 3})                 ║  │
│  ║    → [1] WILL BREAK: A, B, C                            ║  │
│  ║    → [2] LIKELY: D, E                                    ║  │
│  ║    → [3] MAY NEED TEST: F, G, H                          ║  │
│  ║  > test_plan({name: "target"})                           ║  │
│  ║    → Mock strategy + 3 test cases                        ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                           ↓                                      │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  3. CODE (vibe coding — thời gian chính)                 ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  > query({query: "functionName"})                        ║  │
│  ║    → Symbol [kind] file:line (exported)                   ║  │
│  ║  > context({name: "dependency"})                          ║  │
│  ║    → incoming 3 / outgoing 5                              ║  │
│  ║  > grep({pattern: "pattern"})                             ║  │
│  ║    → Text search toàn bộ files                            ║  │
│  ║  > get_type_hierarchy({name: "BaseClass"})               ║  │
│  ║    → Xem cây kế thừa trước khi extend                    ║  │
│  ║  > find_similar({name: "existingFunc"})                  ║  │
│  ║    → Tìm pattern tương tự để copy structure              ║  │
│  ║  > explain_relationship({from: "A", to: "B"})           ║  │
│  ║    → Hiểu tại sao 2 module distant lại liên quan         ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                           ↓                                      │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  4. VERIFY (sau mỗi đợt code — 1-2 phút)                 ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  > detect_changes({})                                     ║  │
│  ║    → affected symbols + direct dependents                 ║  │
│  ║  > impact({target: "modifiedSymbol", depth: 3})         ║  │
│  ║    → [depth 1] WILL BREAK: 3 symbols                     ║  │
│  ║    → [depth 2] LIKELY AFFECTED: 5 symbols                ║  │
│  ║  > test_impact({})                                        ║  │
│  ║    → test/unit/auth.test.ts, test/unit/user.test.ts      ║  │
│  ║  $ npm test (chạy test files được đề xuất)               ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                           ↓                                      │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  5. REVIEW (trước khi kết thúc phiên — 2-3 phút)         ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  > review_pr({})                                          ║  │
│  ║    → LOW: 5, MEDIUM: 3, HIGH: 2, CRITICAL: 1             ║  │
│  ║    → CRITICAL: handlePayment (hub, 0 test, 15 deps)      ║  │
│  ║  > review_symbol({name: "handlePayment"})                ║  │
│  ║    → Risk: CRITICAL — cần test ngay!                     ║  │
│  ║  > find_dead_code({})                                     ║  │
│  ║    → 12 exported symbols, 0 references                    ║  │
│  ║  > grep({pattern: "TODO|FIXME|HACK|console\\.log"})     ║  │
│  ║    → 8 files cần cleanup                                 ║  │
│  ║  > grep({pattern: "password|secret|token|api_key"})     ║  │
│  ║    → 0 secrets found ✓                                   ║  │
│  ║  > test_coverage_gaps({limit: 20})                      ║  │
│  ║    → Untested hub symbols cần ưu tiên                    ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                           ↓                                      │
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  6. LEARN (ghi nhớ cho phiên sau — 30s)                  ║  │
│  ╠═══════════════════════════════════════════════════════════╣  │
│  ║  > annotate({symbol: "handlePayment",                    ║  │
│  ║              key: "note",                                 ║  │
│  ║              value: "Hàm thanh toán quan trọng. Đã fix  ║  │
│  ║               bug race condition. Xem impact() trước     ║  │
│  ║               khi sửa — 15 dependents."})                ║  │
│  ║  > annotate({symbol: "checkoutRoute",                    ║  │
│  ║              key: "security",                             ║  │
│  ║              value: "Endpoint nhận input từ client —     ║  │
│  ║               validate price ID server-side để chống     ║  │
│  ║               price tampering."})                         ║  │
│  ║  > session_context({})                                    ║  │
│  ║    → Lưu metadata phiên: tool calls, files, annotations  ║  │
│  ║  > handoff({to: "reviewer"}) nếu cần review thêm        ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                                                                  │
│  📊 KẾT QUẢ CUỐI PHIÊN:                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Token tiết kiệm:       ~38,000 token (98%)              │    │
│  │ Dead code removed:     12 symbols                        │    │
│  │ Tests added:           3 test files mới                  │    │
│  │ Security issues:       0                                 │    │
│  │ Annotations saved:     5 observations                    │    │
│  │ Ready for next session: ✓                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Cheatsheet: Tình huống → milens tool

### KHI NÀO DÙNG GÌ

```
TÌNH HUỐNG                              → MILENS TOOL ĐẦU TIÊN
──────────────────────────────────────────────────────────────────
Mở codebase lần đầu                     → codebase_summary()
Chuẩn bị sửa 1 hàm                      → edit_check({name})
                                         → smart_context({name, intent: "edit"})
Đang sửa hàm, sợ vỡ code                → impact({target, depth: 3})
Không biết hàm nào gọi hàm này          → context({name})
Muốn biết codebase có những module nào  → domains()
Muốn biết có những API endpoints nào    → routes()
Tìm 1 hàm tên "xyz"                     → query({query: "xyz"})
Tìm text bất kỳ trong toàn bộ project  → grep({pattern: "..."})
2 module A và B liên quan thế nào?      → explain_relationship({from: "A", to: "B"})
Debug: request đi từ đâu đến target?    → trace({to: "target"})
                                         → smart_context({name, intent: "debug"})
Refactor: muốn biết code nào vô dụng    → find_dead_code()
Refactor: muốn biết cây kế thừa         → get_type_hierarchy({name})
Trước khi commit: có file lạ không?     → detect_changes()
Review PR: risk assessment              → review_pr()
Review 1 symbol cụ thể                  → review_symbol({name})
Muốn viết test cho 1 hàm               → test_plan({name})
Muốn biết hàm nào chưa có test          → test_coverage_gaps()
Sau khi sửa code: test file nào?        → test_impact()
Muốn ghi nhớ điều gì về 1 symbol       → annotate({symbol, key, value})
Muốn nhớ lại ghi chú cũ                 → recall({symbol})
Multi-agent: bắt đầu phiên mới          → session_start({agent})
Multi-agent: chuyển giao context        → handoff({from, to})
Tìm code tương tự 1 pattern             → find_similar({name})
Tìm theo ý nghĩa (không phải tên)       → semantic_search({query})
Muốn xem tất cả symbols trong 1 file    → get_file_symbols({file})
Parse code snippet thành AST            → ast_explore({code, language})
Test tree-sitter query                  → test_query({query, code, language})
Xem tổng quan sức khỏe index            → status()
Xem tất cả repo đã index                → repos()
Check nhanh 1 symbol                    → overview({name})
Danh sách tất cả MCP tools              → tools/list (MCP protocol)
```

### QUICK PIPELINES

```
PIPELINE                              → CHUỖI TOOLS
──────────────────────────────────────────────────────────────────
EDIT AN TOÀN                          → edit_check → impact → [edit] → detect_changes → test_impact
REVIEW PR                             → review_pr → review_symbol → find_dead_code → grep
THÊM TEST                             → test_coverage_gaps → test_plan → [write tests] → test_impact
REFACTOR                              → find_dead_code → impact → context → [refactor] → detect_changes
DEBUG BUG                             → smart_context(debug) → trace → impact → explain_relationship
THÊM TÍNH NĂNG MỚI                    → codebase_summary → domains → smart_context(edit) → test_plan
BẮT ĐẦU PHIÊN MỚI                    → codebase_summary → session_start → recall
KẾT THÚC PHIÊN                        → detect_changes → review_pr → annotate → session_context
SECURITY AUDIT                        → grep(secrets) → grep(unicode) → review_pr → review_symbol
```

---

## 14. Lợi thế & Hạn chế

### 14.1 Lợi thế của milens so với ECC cho Vibe Code

| Lợi thế | Giải thích |
|---|---|
| **Knowledge graph real-time** | 587 symbols, 1021 links — agent không cần đọc file dò dẫm, tiết kiệm 40-98% token tùy tác vụ |
| **Không cần cài đặt phức tạp** | `npx milens analyze` → xong. ECC cần plugin + marketplace + rules copy thủ công |
| **Blast radius chính xác** | `impact()` tính toán recursive CTE trong SQLite với 3 tầng depth — ECC không có công cụ tương đương |
| **Đa ngôn ngữ tự động** | 12 ngôn ngữ qua tree-sitter parser, không cần rules thủ công như ECC |
| **Semantic search** | Hybrid FTS5 + vector search — tìm theo ý nghĩa, không chỉ theo tên |
| **Memory queryable** | SQLite-based annotations — filter, search, aggregate được. ECC instincts là file-based |
| **Offline 100%** | Zero network calls, zero telemetry. Phù hợp môi trường air-gapped |
| **CI/CD ready** | CLI tool dễ tích hợp vào GitHub Actions — không cần marketplace, không cần GitHub App |
| **Framework detection** | `routes()` tự động nhận diện 11 frameworks (Express, FastAPI, NestJS, Flask, Django, Go, Gin, PHP, Rails, Sinatra, Spring) |
| **AST exploration** | `ast_explore()` + `test_query()` — công cụ cho developer muốn mở rộng parser |

### 14.2 Hạn chế & Giải pháp

| Hạn chế | Giải pháp |
|---|---|
| Không có hook system | Dùng CI/CD yml hoặc prompt chain thủ công. Có thể tích hợp pre-commit hook gọi milens CLI |
| Không có GitHub App tự động | Chạy milens CLI trong GitHub Actions với trigger `on: pull_request` |
| Không có sub-agent sandbox | Dùng prompt scope + tool filtering của harness (Claude Code system prompt, OpenCode agent config) |
| Không có AgentShield 102 rules | Dùng `grep()` + custom patterns (xem Phụ lục C) |
| Index cần refresh thủ công | Chạy `milens analyze` định kỳ (pre-commit hook, CI schedule, hoặc đầu mỗi phiên) |
| Không có continuous learning tự động | Dùng `annotate()` + `recall()` thủ công nhưng queryable — vẫn hơn ECC instincts file-based |
| Test coverage 54% (milens self) | Đang cải thiện — 136 tests, 12 test files |
| Cần Node.js ≥ 20 | Đã phổ biến, nhưng vẫn là dependency |

---

## Phụ lục A: 32 milens tools — use case cụ thể

### Search & Navigate

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `query` | `{query: "functionName"}` | `[symbol] [kind] file:line (exported)` | Tìm nhanh 1 hàm, class, biến |
| `grep` | `{pattern: "regex", scope: "all\|code\|imports"}` | `file:line: matched text` | Tìm text pattern trong toàn bộ codebase |
| `context` | `{name: "Symbol"}` | `incoming (N): ... \| outgoing (M): ...` | Hiểu ai gọi và bị gọi bởi symbol |
| `get_file_symbols` | `{file: "path/to/file.ts"}` | `[symbol] [kind] line (refs/deps)` | Xem tất cả symbols trong 1 file |
| `get_type_hierarchy` | `{name: "BaseClass"}` | `BaseClass ← Child1 ← Child2 ← ...` | Hiểu cây kế thừa, refactor class |

### Impact & Safety

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `impact` | `{target: "func", depth: 3}` | `[depth 1] WILL BREAK: A,B,C \| [2] LIKELY: D,E \| [3] MAY: F,G` | Kiểm tra blast radius trước khi sửa |
| `edit_check` | `{name: "func"}` | `callers (N) + export status + re-exports + ⚠ warnings` | Pre-edit safety check nhanh |
| `detect_changes` | `{}` | `[modified files] → affected symbols + dependents` | Kiểm tra unexpected changes trước commit |
| `find_dead_code` | `{limit: 20}` | `[symbol] [kind] file:line — 0 references` | Dọn dẹp code chết sau vibe coding |
| `overview` | `{name: "func"}` | `context + impact + grep — tất cả trong 1 call` | Quick overview trước khi quyết định sửa |

### Understanding

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `smart_context` | `{name: "func", intent: "edit\|debug\|test\|understand"}` | Context phù hợp với intent | Context-aware intelligence |
| `trace` | `{to: "func"}` | `Entry → Router → Controller → Service → func` | Debug: request flow từ đâu đến |
| `routes` | `{}` | `[GET/POST] /api/endpoint → handlerFunction` | Audit tất cả API endpoints |
| `explain_relationship` | `{from: "A", to: "B"}` | `A → X → Y → B (3 steps)` | Hiểu kết nối giữa 2 module xa |
| `overview` | `{name: "func"}` | `context + impact + grep` | All-in-one intelligence |

### Codebase Overview

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `domains` | `{}` | `[domain] (N files, M symbols)` | Hiểu module structure |
| `repos` | `{}` | `[repo path] — symbols, files, indexed date` | Multi-repo management |
| `status` | `{}` | `symbols, links, files, coverage, staleness` | Index health check |
| `codebase_summary` | `{}` | `domains + top symbols + coverage + annotations` | Bootstrap context cho agent |

### Developer Tools

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `ast_explore` | `{code: "const x=1", language: "ts"}` | S-expression AST tree | Hiểu cấu trúc AST, debug parser |
| `test_query` | `{query: "(identifier)", code: "...", language: "ts"}` | Matched nodes | Test tree-sitter query, extend parser |

### Review & Risk

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `review_pr` | `{}` | `[symbol]: risk (LOW/MEDIUM/HIGH/CRITICAL) + test coverage` | PR risk assessment tự động |
| `review_symbol` | `{name: "func"}` | `role + heat + dependents + test status + risk level` | Deep-dive single symbol risk |

### Testing

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `test_plan` | `{name: "func"}` | `mock strategy (stub/spy/fake) + suggested tests` | Dependency-aware test plan |
| `test_coverage_gaps` | `{limit: 20}` | `[untested symbol] [risk: high/medium/low]` | Ưu tiên viết test |
| `test_impact` | `{}` | `[changed symbol] → [test files to run]` | Chạy đúng test, không thừa |

### Annotations & Sessions

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `annotate` | `{symbol: "X", key: "note", value: "..."}` | Confirmation | Ghi nhớ cross-session |
| `recall` | `{symbol: "X"}` | `[{key, value, agent, session, timestamp}]` | Nhớ lại ghi chú cũ |
| `session_start` | `{agent: "name"}` | Session ID | Bắt đầu phiên mới |
| `session_context` | `{session_id: "..."}` | `metadata + annotations` | Xem context phiên |
| `handoff` | `{from_session, to_agent, context}` | Confirmation | Chuyển giao multi-agent |

### Search & Similarity

| Tool | Input | Output | Use case Vibe Code |
|---|---|---|---|
| `semantic_search` | `{query: "auth flow"}` | `[symbol] [score]` | Tìm theo ý nghĩa, không chỉ tên |
| `find_similar` | `{name: "func"}` | `[similar symbol] [score]` | Tìm pattern tương tự để copy |

> `semantic_search` và `find_similar` cần `milens analyze --embeddings` để tạo vector embeddings.

---

## Phụ lục B: Mẫu CI/CD tích hợp milens

### B.1 Pre-commit Hook (local)

```bash
#!/bin/bash
# .git/hooks/pre-commit
# Tự động chạy milens checks trước mỗi commit

echo "🔍 Milens: Refreshing index..."
npx milens analyze -p . --force 2>&1 | tail -1

echo "🔍 Milens: Detecting changes..."
npx milens inspect "detect_changes"

echo "🔍 Milens: Checking for dead code..."
npx milens inspect "find_dead_code"

echo "🔍 Milens: Test coverage gaps..."
npx milens inspect "test_coverage_gaps"

echo "✅ Milens pre-commit checks passed"
```

### B.2 GitHub Actions — PR Guard

```yaml
# .github/workflows/milens-pr-guard.yml
name: Milens PR Guard
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  milens-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Cần full history cho detect_changes

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install milens
        run: npm install -g milens

      - name: Analyze codebase
        run: npx milens analyze -p . --force

      - name: Review PR Risk
        run: |
          echo "## Milens PR Review" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "review_pr" >> $GITHUB_STEP_SUMMARY

      - name: Test Coverage Gaps
        run: |
          echo "## Test Coverage Gaps" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "test_coverage_gaps" >> $GITHUB_STEP_SUMMARY

      - name: Find Dead Code
        run: |
          echo "## Dead Code" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "find_dead_code" >> $GITHUB_STEP_SUMMARY

      - name: Security Scan (secrets)
        run: |
          echo "## Security Scan" >> $GITHUB_STEP_SUMMARY
          npx milens search "password|secret|api_key|token" >> $GITHUB_STEP_SUMMARY
```

### B.3 GitHub Actions — Scheduled Audit

```yaml
# .github/workflows/milens-scheduled-audit.yml
name: Milens Scheduled Audit
on:
  schedule:
    - cron: '0 6 * * 1'  # Mỗi sáng thứ 2
  workflow_dispatch:      # Cho phép trigger thủ công

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g milens

      - name: Full Analysis
        run: npx milens analyze -p . --force

      - name: Generate Report
        run: |
          echo "# Milens Weekly Audit Report" > report.md
          echo "## Codebase Summary" >> report.md
          npx milens status -p . >> report.md
          echo "" >> report.md
          echo "## Test Coverage Gaps" >> report.md
          npx milens inspect "test_coverage_gaps" >> report.md
          echo "" >> report.md
          echo "## Dead Code" >> report.md
          npx milens inspect "find_dead_code" >> report.md

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: milens-audit-report
          path: report.md
```

### B.4 GitLab CI

```yaml
# .gitlab-ci.yml
milens-check:
  image: node:20
  before_script:
    - npm install -g milens
    - npx milens analyze -p . --force
  script:
    - npx milens status -p .
    - npx milens search "TODO|FIXME|HACK"
    - npx milens inspect "test_coverage_gaps"
  only:
    - merge_requests
    - main
```

---

## Phụ lục C: Security checklist cho Vibe Code

> Dựa trên "The Minimum Bar Checklist" từ ECC Security Guide, ánh xạ sang milens.

### C.1 Trước mỗi phiên Vibe Code

- [ ] `milens analyze -p . --force` — refresh index
- [ ] `grep({pattern: "password\|secret\|api_key\|token\|private_key\|AUTH_TOKEN"})` — secret scan
- [ ] `grep({pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u202A-\\u202E]"})` — hidden unicode scan
- [ ] `grep({pattern: "eval\\(\|exec\\(\|child_process\|Function\\("})` — dangerous patterns
- [ ] `grep({pattern: "TODO\|FIXME\|HACK\|console\\.(log\|debug)"})` — tech debt markers
- [ ] `review_pr({})` — risk assessment tổng thể

### C.2 Trong phiên Vibe Code

- [ ] `edit_check({name})` trước mỗi edit quan trọng
- [ ] `impact({target, depth: 2})` trước khi sửa hub functions
- [ ] `context({name})` để hiểu incoming/outgoing
- [ ] Không copy-paste code từ external sources mà không audit
- [ ] Không cài MCP servers không rõ nguồn gốc
- [ ] Không chạy agent với `--dangerously-skip-permissions`

### C.3 Sau khi Vibe Code (review)

- [ ] `detect_changes({})` — kiểm tra unexpected files
- [ ] `review_pr({})` — risk assessment
- [ ] `review_symbol({name})` cho tất cả symbols CRITICAL/HIGH
- [ ] `find_dead_code({})` — dọn rác
- [ ] `grep({pattern: "console\\.(log\|debug\|info)\\("})` — data leak check
- [ ] `test_coverage_gaps({limit: 20})` — untested symbols
- [ ] `test_impact({})` — chạy test files bị ảnh hưởng

### C.4 Sandboxing (môi trường)

- [ ] Agent chạy trong Docker container / devcontainer
- [ ] `internal: true` cho network — không outbound mặc định
- [ ] `cap_drop: ALL` — bỏ tất cả Linux capabilities
- [ ] Separate agent identity (không dùng personal GitHub token)
- [ ] Short-lived credentials, scope giới hạn
- [ ] Deny reads từ `~/.ssh/`, `~/.aws/`, `**/.env*`

### C.5 Kill Switch

- [ ] Heartbeat check: nếu agent không phản hồi 30s → SIGKILL process group
- [ ] Không auto-merge PRs — luôn cần human review
- [ ] Log tất cả tool calls, network attempts, approval decisions
- [ ] `session_start()` + `session_context()` để audit trail

### C.6 Dependency Security

- [ ] `grep({pattern: "deprecated\|vulnerability\|CVE", scope: "all"})`
- [ ] `npm audit` / `pip audit` / `cargo audit` — theo ecosystem
- [ ] Review diff của `package.json` / `requirements.txt` / `Cargo.toml`

### C.7 Memory Hygiene (theo ECC)

- [ ] Không lưu secrets trong annotations
- [ ] Tách project memory (`annotate()`) khỏi global memory
- [ ] Reset memory sau untrusted runs
- [ ] Disable long-lived memory cho high-risk workflows
- [ ] `recall({})` để audit memory trước khi bắt đầu

---

## Tài liệu tham khảo

### ECC
- [ECC GitHub Repository](https://github.com/affaan-m/ECC) — 182K+ stars, MIT License
- [ECC Tools Website](https://ecc.tools/) — GitHub App, AgentShield, Pricing
- [The Shorthand Guide to ECC](https://github.com/affaan-m/ECC/blob/main/the-shortform-guide.md) — Setup, hooks, subagents, plugins
- [The Longform Guide to ECC](https://github.com/affaan-m/ECC/blob/main/the-longform-guide.md) — Token economics, memory, evals, parallelization
- [The Security Guide](https://github.com/affaan-m/ECC/blob/main/the-security-guide.md) — Attack vectors, CVEs, sandboxing, sanitization
- [AgentShield](https://github.com/affaan-m/agentshield) — 102 rules, 1282 tests
- [ECC Planner Agent Spec](https://github.com/affaan-m/ECC/blob/main/agents/planner.md) — Plan format chuẩn

### milens
- [milens GitHub Repository](https://github.com/fuze210699/milens)
- [milens README — 32 MCP tools](https://github.com/fuze210699/milens#readme)

### Tham khảo bảo mật
- Check Point Research, CVE-2025-59536 & CVE-2026-21852
- Microsoft Security, "AI Recommendation Poisoning" (Feb 2026)
- Snyk, "ToxicSkills: Malicious AI Agent Skills" (Feb 2026)
- Unit 42, "Web-Based Indirect Prompt Injection" (Mar 2026)
- OWASP MCP Top 10
- Simon Willison, Prompt Injection Series

---

*Báo cáo tổng hợp: 2026-05-27 | Dữ liệu từ milens index (587 symbols, 1021 links, 66 files)*
*Phiên bản: 2.0 — Mở rộng với Token Economics, Memory Persistence, Verification Loops, Parallelization, Security Architecture, Sub-agent Orchestration, Planner Agent Deep-dive*
