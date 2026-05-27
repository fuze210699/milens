# Hệ thống Khép kín Tuần hoàn cho AI-Driven Development

> **Token Optimization + Self-Learning → Closed-Loop System**
>
> Từ ý tưởng ECC, xây dựng một hệ thống vận hành dự án phần mềm khép kín, nơi AI coding agent là tác nhân chính, và mỗi vòng lặp đều thông minh hơn vòng lặp trước.

---

## Mục lục

### PHẦN I: NỀN TẢNG — Token Optimization
1. [Kinh tế Token](#1-kinh-tế-token-trong-ai-development)
2. [ECC Token Optimization Deep-Dive](#2-ecc-token-optimization-deep-dive)
3. [Áp dụng vào Milens](#3-áp-dụng-token-optimization-vào-milens)

### PHẦN II: TRÁI TIM — Self-Learning
4. [ECC Self-Learning Architecture](#4-ecc-self-learning-architecture)
5. [Self-Learning Data Flow](#5-self-learning-data-flow)
6. [Milens Self-Learning Implementation](#6-milens-self-learning-implementation)

### PHẦN III: ĐỈNH CAO — Hệ thống Khép kín
7. [Kiến trúc Tổng thể](#7-kiến-trúc-tổng-thể)
8. [Vòng lặp Token — "Token sinh Token"](#8-vòng-lặp-token--token-sinh-token)
9. [Vòng lặp Chất lượng](#9-vòng-lặp-chất-lượng--code-sinh-code-chất-lượng)
10. [Vòng lặp Kiến trúc](#10-vòng-lặp-kiến-trúc--architecture-tự-cải-thiện)

### PHẦN IV: TRIỂN KHAI
11. [System Components](#11-system-components)
12. [Implementation Roadmap — 12 tuần](#12-implementation-roadmap--12-tuần)
13. [Metrics & KPIs](#13-metrics--kpis)

### PHẦN V: CASE STUDIES
14. [Dự án mới từ số 0](#14-case-study-1--dự-án-mới-từ-số-0)
15. [Thêm tính năng](#15-case-study-2--thêm-tính-năng-vào-dự-án-có-sẵn)
16. [Refactor lớn](#16-case-study-3--refactor-lớn)

### PHẦN VI: PHỤ LỤC
- [A: Token Budget Calculator](#phụ-lục-a-token-budget-calculator)
- [B: Annotation Schema](#phụ-lục-b-annotation-schema--best-practices)
- [C: CI/CD Pipeline](#phụ-lục-c-cicd-pipeline-cho-closed-loop-system)
- [D: Migration Path](#phụ-lục-d-migration-path--manual--automated)
- [E: ECC Instinct vs Milens Annotation](#phụ-lục-e-ecc-instinct-vs-milens-annotation)


---

## PHẦN I: NỀN TẢNG — Token Optimization

---

### 1. Kinh tế Token trong AI Development

#### 1.1 Context Window = Tài nguyên hữu hạn

Mỗi AI coding agent có context window giới hạn. Claude Code: 200K tokens. Nhưng context thực tế khả dụng thấp hơn nhiều:

```
Context DANH NGHĨA:        200,000 tokens
Trừ system prompt:         -20,000
Trừ rules/CLAUDE.md:       -15,000
Trừ MCP tool descriptions: -25,000 (nếu enable nhiều)
Trừ memory/context files:  -10,000
Trừ conversation history:  -30,000 (sau 1h làm việc)
                            ─────────
Context THỰC TẾ:           ~100,000 tokens

Sau PreCompact (tự động):   ~70,000 hoặc ít hơn
```

> *"Your 200k context window before compacting might only be 70k with too many tools enabled."* — ECC Longform Guide

#### 1.2 Bảy loại "Token Waste"

| # | Loại | Mô tả | Tần suất | Chi phí/phiên |
|---|---|---|---|---|
| 1 | Exploratory Reading | Agent đọc file dò dẫm | Mỗi phiên | 30K tokens |
| 2 | Redundant Discovery | Đọc lại file đã đọc phiên trước | Mỗi phiên | 15K tokens |
| 3 | Wrong File Reading | Đọc sai file, sai function | 3-5 lần/phiên | 9K tokens |
| 4 | Over-Reading | Đọc cả file khi chỉ cần 1 function | Mỗi lần đọc | 5K tokens |
| 5 | Grep Flooding | Grep 200 kết quả, đọc từng cái | Mỗi grep | 3K tokens |
| 6 | Context Pollution | Context cũ không liên quan | Liên tục | 20K/giờ |
| 7 | Tool Metadata Bloat | Mô tả tool quá dài | Mỗi request | 5K/request |

**Tổng waste 1 phiên 2h: ~150K tokens. Với Opus: $5.25/phiên, $105/tháng, $1,260/năm.**

#### 1.3 ECC Token Strategy Map — 8 chiến lược

```
STRATEGY 1: Model Routing
  Haiku cho search/explore (rẻ 25x Opus)
  Sonnet cho coding (cân bằng nhất)
  Opus cho architecture/security (chỉ khi cần)

STRATEGY 2: Sub-agent Delegation
  Main agent giữ context code chính
  Sub-agents trả về SUMMARY, không raw data

STRATEGY 3: Strategic Compact
  TẮT auto-compact, manual compact tại logical intervals
  Lưu state TRƯỚC KHI compact

STRATEGY 4: Dynamic System Prompt
  Load context theo MODE: dev / review / research
  System prompt có authority cao hơn user messages

STRATEGY 5: Replace MCP with CLI
  GitHub MCP → gh CLI qua skill. Mỗi MCP tốn ~5K tokens

STRATEGY 6: Modular Codebase
  File < 500 dòng, function < 50 dòng, nesting < 4

STRATEGY 7: Fewer Enabled Tools
  Cấu hình 20-30 MCPs, chỉ ENABLE 5-10. < 80 tools active

STRATEGY 8: Skill-based Workflows
  Gói logic phức tạp vào skill file. Lazy loading.
```

#### 1.4 Milens Token Saving Calculator

| Thao tác không có milens | Token | Milens thay thế | Token | Tiết kiệm |
|---|---|---|---|---|
| Đọc 15 file hiểu codebase | 30,000 | `codebase_summary()` | 500 | **98.3%** |
| Grep + đọc tìm function | 2,000 | `query()` | 50 | **97.5%** |
| Đọc 10 file trace deps | 15,000 | `context()` | 200 | **98.7%** |
| Trace thủ công blast radius | 10,000 | `impact()` | 200 | **98.0%** |
| Phân tích dead code | 5,000 | `find_dead_code()` | 100 | **98.0%** |
| Đọc diff review PR | 15,000 | `review_pr()` | 500 | **96.7%** |
| Phân tích test strategy | 8,000 | `test_plan()` | 300 | **96.3%** |
| Tìm API endpoints | 5,000 | `routes()` | 200 | **96.0%** |
| Trace execution path | 12,000 | `trace()` | 250 | **97.9%** |
| Manual grep patterns | 3,000 | `grep()` | 150 | **95.0%** |

**Trung bình tiết kiệm: 97.2% cho code intelligence operations.**


---

### 2. ECC Token Optimization Deep-Dive

#### 2.1 Model Routing Matrix

| Tiêu chí | Trọng số | Mô tả |
|---|---|---|
| Complexity | 40% | Số file, deps, độ sâu logic |
| Risk | 30% | Security impact, blast radius |
| Context Need | 20% | Cần bao nhiêu context |
| Iteration Count | 10% | Dự kiến thử-sai |

```
COMPLEXITY LOW (1 file, simple edit):
  RISK LOW → Haiku ($0.80/MTok) | RISK MED/HIGH → Sonnet ($3.00/MTok)

COMPLEXITY MED (2-5 files):
  RISK LOW/MED → Sonnet | RISK HIGH → Opus ($15.00/MTok)

COMPLEXITY HIGH (5+ files, architecture):
  RISK LOW → Sonnet (extensive planning) | RISK MED/HIGH → Opus

SPECIAL: Security audit → Opus | Docs → Haiku | Debug → Opus | Greenfield → Sonnet→Opus
```

#### 2.2 Strategic Compact Pattern

```
CHU KỲ:
  Context đầy (100%) → SAVE STATE (.tmp file) → MANUAL /compact
  → Context còn 30% → LOAD STATE từ .tmp → CONTINUE

Milens PreCompact:  codebase_summary() → lưu top symbols
                    annotate() decisions quan trọng
Milens PostCompact: recall() → phục hồi annotations
                    codebase_summary() → re-establish intelligence
```

#### 2.3 Dynamic System Prompt Injection

```bash
# ECC: alias với system prompt theo MODE
alias vibe-dev='claude --system-prompt "$(cat ~/.claude/contexts/dev.md)"'
alias vibe-review='claude --system-prompt "$(cat ~/.claude/contexts/review.md)"'

# Milens: generate context files từ intelligence
npx milens analyze -p . --force --skills
# → .agents/skills/milens/SKILL.md (context compact)
# Dev context: codebase_summary + domains
# Review context: review_pr + test_coverage_gaps
```

#### 2.4 Tại sao ít Tool = nhiều Context

```
Tools enabled | Tool desc tokens | Available context | Relative perf
5 tools       | 1,500            | 98,500            | 100%
20 tools      | 6,000            | 94,000            | 95%
50 tools      | 15,000           | 85,000            | 85%
100 tools     | 30,000           | 70,000            | 70%
200 tools     | 60,000           | 40,000            | 40%

QUY TẮC: Cấu hình 20-30 MCPs, chỉ ENABLE 5-10, < 80 tools active.
Milens: 1 MCP server, 32 tools — tiết kiệm 90% tool metadata tokens.
```

#### 2.5 Sub-agent Context Delegation

```
KHÔNG DELEGATION: Main agent (200K) chứa CODE+PLAN+RESEARCH+REVIEW+DEBUG → ĐẦY
CÓ DELEGATION:    Main (140K: CODE+PLAN) + Research Agent (50K→SUMMARY 2K)
                  + Review Agent (30K→REPORT 1K)
                  Main nhận: 3K thay vì 80K → tiết kiệm 77K tokens!
```

#### 2.6 Modular Codebase Impact

```
Monolithic (1,500 dòng):  Agent đọc → 3,000 tokens (2,800 không liên quan)
Modular (5×300 dòng):     Agent đọc 1 file → 600 tokens
→ Tiết kiệm 80% token!
```

---

### 3. Áp dụng Token Optimization vào Milens

#### 3.1 Milens như "Context Compressor"

```
KHÔNG CÓ MILENS (agent tự explore):
  1. Grep "checkoutHandler" → 15 files
  2-6. Đọc 5 file để tìm đúng
  7. Grep "import.*checkout" → 8 files
  8-11. Đọc 4 file caller
  → ~20 thao tác, ~40,000 tokens, ~3-5 phút

CÓ MILENS (3 tools):
  1. smart_context({name:"checkoutHandler", intent:"edit"})
     → callers(3)+deps(5)+role:hub+heat:0.7+test:YES
  2. impact({target:"checkoutHandler", depth:2})
     → [1] WILL BREAK: 2 symbols | [2] LIKELY: 3 symbols
  3. test_plan({name:"checkoutHandler"})
     → Mock: StripeSDK, 3 scenarios
  → 3 thao tác, ~700 tokens, ~10 giây
  → TIẾT KIỆM: 98.3% token, 95% thời gian
```

#### 3.2 Token Budget Allocation

```
TOKEN BUDGET 1 PHIÊN (200K context, 2h):

  SYSTEM OVERHEAD: 30K (15%) — prompt + rules + tools + memory
  MILENS INTELLIGENCE: 5K (2.5%) — 20 tool calls
  ACTUAL CODING: 145K (72.5%) — read/write code + test + debug
  RESERVE: 20K (10%) — overflow buffer

  SO SÁNH: Không milens → intelligence 60-80K (30-40%) → code còn 90-110K
           Có milens → intelligence 5K (2.5%) → code có 145K (+32-61%!)
```


---

## PHẦN II: TRÁI TIM — Self-Learning

---

### 4. ECC Self-Learning Architecture

#### 4.1 Tổng quan

ECC xây dựng "Instinct System" cho phép agent học từ kinh nghiệm qua các phiên:

```
SESSION N → Stop Hook extract patterns → Instincts lưu
SESSION N+1 → SessionStart load Instincts → agent thông minh hơn
SESSION N+2 → Load all Instincts N, N+1 → ngày càng thông minh
```

#### 4.2 Instinct Lifecycle (5 giai đoạn)

```
STAGE 1: OBSERVATION — Agent gặp vấn đề lặp lại (bug pattern, workflow)
STAGE 2: EXTRACTION — Stop hook extract → category + confidence 0.5 → file
STAGE 3: VERIFICATION — Pattern gặp lại → confidence↑ (2x:0.7, 3x+:0.9)
                        0 lần sau 5 phiên → confidence↓ → xóa
STAGE 4: PROMOTION — confidence > 0.8 → instinct → skill → rule
STAGE 5: EVOLUTION — Skill dùng nhiều → refine | lỗi thời → archive
```

#### 4.3 Tại sao Stop Hook (không UserPromptSubmit)?

```
UserPromptSubmit: Chạy MỖI LẦN gửi message (50 lần/phiên)
  → +200ms latency mỗi lần = +10s/phiên
  → Pattern kém chất lượng (thiếu context)

Stop Hook: Chạy 1 LẦN cuối phiên
  → +500ms (chấp nhận được)
  → Pattern chất lượng cao (có context đầy đủ cả phiên)

QUYẾT ĐỊNH ECC: Stop hook — lightweight, pattern chất lượng hơn.
```

#### 4.4 Pattern Extraction Pipeline

```
INPUT: Toàn bộ phiên (conversation + tool calls)

STEP 1: EVENT STREAM PROCESSING
  Parse tool calls, errors, decisions, discoveries

STEP 2: PATTERN DETECTION
  Bug ≥ 2 lần | Workflow ≥ 3 lần | Architecture insights | Security findings

STEP 3: CONFIDENCE SCORING
  Mới: 0.4 | 2 lần: 0.6 | 3+ lần: 0.8 | Có evidence: +0.1
  Chưa gặp 5 phiên: -0.1/phiên

STEP 4: CLASSIFICATION
  Category: bug|workflow|architecture|security|performance|convention
  Scope: project-specific | language-specific | universal
  Action: warn | block | suggest | auto-fix

OUTPUT: Structured instinct file
```

#### 4.5 Skill Evolution Lifecycle

```
BIRTH (Instinct, conf 0.4) → GROWTH (Skill, conf 0.6) → MATURITY (Rule, conf 0.9)
                                                                      ↓
DECLINE (Deprecated, warning) ←───────────────────────────── OBSOLETE
                                                                      ↓
                                                                  DEATH (Archive)
```


---

### 5. Self-Learning Data Flow

#### 5.1 Session Recording → Detection → Scoring

```
SESSION N:
  Agent fix bug "email bị overwrite bởi normalize"
  → Stop hook: extract pattern P-042
  → Title: "checkoutHandler cần validate price trước xử lý"
  → Confidence: 0.5 | Evidence: "1 lần" | Related: [checkoutHandler]

SESSION N+1:
  SessionStart load P-042
  Agent: "Tôi thấy trước checkout cần validate → sẽ áp dụng cho feature mới"
  → Tự động thêm validate mà không cần nhắc!
  → Stop hook: P-042 confidence ↑ 0.7 | Evidence: "2 lần"
```

#### 5.2 Cross-Session Aggregation

```
WEEKLY AGGREGATION:
  SELECT category, COUNT(*), AVG(confidence)
  FROM instincts WHERE created_at > DATE('now', '-7 days')
  GROUP BY category ORDER BY occurrences DESC;

  bug: 23 lần, avg confidence 0.72 → investigate systemic issues
  convention: 12 lần, avg 0.81 → promote → rules ngay
  security: 3 lần, avg 0.91 → add AgentShield rules
  architecture: 8 lần, avg 0.58 → cần thêm evidence
```

#### 5.3 Feedback Loop

```
IMPLEMENTATION → VERIFICATION → CORRECTION → LEARNING → (loop)

  VERIFICATION: test results + review feedback + linter errors + security scan
  CORRECTION:   test fail → "approach X failed" | review catch → "cần check Y"
  LEARNING:     cập nhật confidence | tạo instinct mới | deprecate | promote
```

#### 5.4 Anti-Patterns — KHÔNG nên học

```
1. OVERFITTING: Bug 1 lần do typo → KHÔNG học. Bug 3+ lần pattern rõ → NÊN học
2. CONTEXT-SPECIFIC: "Checkout API cần validate" → chỉ đúng cho checkout.
   "Mọi API cần validate input" → universal → NÊN học
3. PREMATURE PROMOTION: Confidence 0.5 → promote → rule sai!
   Đợi ≥ 0.8 mới promote
4. STALE PATTERNS: Codebase thay đổi → pattern lỗi thời → archive
5. HALLUCINATED: Agent "nghĩ" ra rule không có thật → cần human verify
```

---

### 6. Milens Self-Learning Implementation

#### 6.1 Annotation System như "Learning Substrate"

```
SCHEMA (SQLite):
  symbol      | Tên symbol (hoặc "_global")
  key         | note|bug|security|architecture|workflow|test|dependency|refactor
  value       | Nội dung (nên có evidence)
  agent       | Ai tạo
  session_id  | Phiên nào
  confidence  | 0.0 - 1.0
  created_at  | Timestamp
  updated_at  | Timestamp
```

#### 6.2 Session Memory Pipeline

```
SESSION START:
  session_start({agent}) + codebase_summary() + recall({})
  → Agent có ngay: context codebase + mọi caveat từ quá khứ

SESSION WORK:
  Agent code bình thường, phát hiện pattern mới → annotate()

SESSION END:
  review_pr() + test_impact() + annotate(đã sửa) + session_context()
  handoff({to:"reviewer"}) nếu cần

WEEKLY:
  recall({}) → phân tích → promote high-confidence → archive stale
```

#### 6.3 Codebase Evolution Tracking

```
Analyze #1:  200 symbols, 350 links, 0% coverage, 0 dead
Analyze #10: 350 symbols, 680 links, 35% coverage, 12 dead → cần refactor
Analyze #50: 520 symbols, 1050 links, 62% coverage, 8 dead → cần split hubs

LEARNING: Dead tăng → refactor | Hubs tăng deps → split | Coverage chậm → ưu tiên test
```

#### 6.4 Từ Annotation → Knowledge Base (5 giai đoạn)

```
STAGE 1: ISOLATED — Các mảnh kiến thức rời rạc
STAGE 2: CLUSTERING — find_similar() + semantic_search() → gom cluster
STAGE 3: SKILL — Cluster đủ lớn → tạo skill với best practices
STAGE 4: RULE — Skill dùng 10+ lần → promote → luôn enforced
STAGE 5: MAINTENANCE — Định kỳ deprecate, merge, refine, archive
```


---

## PHẦN III: ĐỈNH CAO — Hệ thống Khép kín Tuần hoàn

---

### 7. Kiến trúc Tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│              CLOSED-LOOP AI DEVELOPMENT SYSTEM                       │
│              "Code → Verify → Learn → Improve → Code"               │
└─────────────────────────────────────────────────────────────────────┘

  ╔══════════════════════╗
  ║ 1. ANALYZE (Hiểu)   ║
  ╚══════════════════════╝
  Input: Codebase + Annotations + Session history
  Tools: codebase_summary(), domains(), routes(), recall(), status()
  Output: Context Map + Domain Map + Risk Map + Memory
              │
              ▼
  ╔══════════════════════╗
  ║ 2. PLAN (Kế hoạch)  ║
  ╚══════════════════════╝
  Input: Context Map + Task Requirements
  Tools: smart_context(), edit_check(), trace(), impact(), test_plan()
  Output: Implementation Plan + Test Strategy + Risk Log
              │
              ▼
  ╔══════════════════════╗
  ║ 3. CODE (Thực thi)  ║
  ╚══════════════════════╝
  Agent: AI Coding Agent (Claude Code / OpenCode / Codex)
  Guard: edit_check() pre-edit | impact() mid-edit | context() reference
  Output: Code Changes
              │
              ▼
  ╔══════════════════════╗
  ║ 4. VERIFY (Xác minh)║
  ╚══════════════════════╝
  Tools: detect_changes(), review_pr(), review_symbol(),
         test_impact(), test_coverage_gaps(), find_dead_code(),
         grep(security), grep(hidden unicode)
  Output: Verification Report + Risk Scores + Action Items
              │
              ▼
  ╔══════════════════════╗
  ║ 5. LEARN (Học hỏi)  ║
  ╚══════════════════════╝
  Tools: annotate(), session_context(), recall(),
         find_similar(), semantic_search(), handoff()
  Output: Annotations + Updated Knowledge Base
              │
              ▼
  ╔══════════════════════╗
  ║ 6. IMPROVE (Cải     ║
  ║     thiện hệ thống)  ║
  ╚══════════════════════╝
  Actions: Promote patterns → skills/rules | Update AGENTS.md
           Tune token strategy | Evolve test patterns
           Refine architecture | Archive obsolete
  Output: Improved System → feeds into next ANALYZE
              │
              ▼
         (quay lại PHASE 1 — hệ thống thông minh hơn)

METRICS:
  Vòng 1: Token 100% | Quality baseline
  Vòng 2: Token 80%  | Quality +15%
  Vòng 3: Token 68%  | Quality +25%
  Vòng 5: Token 55%  | Quality +37%
  Vòng N: Token ~50% | Quality +40% (hội tụ)
```

---

### 8. Vòng lặp Token — "Token sinh Token"

#### 8.1 Cơ chế

```
VÒNG 1 (baseline):        Token: 100K | Investment: 2K | ROI: n/a
VÒNG 2 (có context):      Token: 85K  | Investment: 3.5K | ROI: 4.3x
VÒNG 3 (có patterns):     Token: 72K  | Investment: 3.5K | ROI: 8.0x
VÒNG 4 (có rules):        Token: 62K  | Investment: 3K | ROI: 12.7x
VÒNG 10 (hội tụ):         Token: 52K  | Investment: 2.5K | ROI: 19.2x
```

#### 8.2 Công thức toán

```
T(n) = T_min + (T(1) - T_min) × (1 - r)^(n-1)

  T(1)  = 100,000 | T_min = 50,000 | r = 0.2
  T(2)  = 90,000 (↓10%) | T(5) = 70,500 (↓30%)
  T(10) = 56,700 (↓43%) | T(20) = 50,700 (↓49%)

ROI(n) = (T(1) - T(n)) / Investment
  Vòng 2:  2.9x | Vòng 5: 8.4x | Vòng 10: 12.4x | Vòng 20: 14.1x
```

#### 8.3 Yếu tố ảnh hưởng Learning Rate

| Yếu tố | Impact | Tối ưu |
|---|---|---|
| Codebase stability | Ổn định → r cao | Refactor định kỳ |
| Annotation quality | Tốt → r cao | Viết cụ thể, có evidence |
| Session frequency | Thường xuyên → r cao | Daily sessions |
| Pattern reuse | Nhiều → r cao | Promote instinct→skill→rule |
| Tool optimization | Ít, đúng → r cao | Disable unused, dùng milens |
| Codebase modularity | Modular → r cao | File < 500 dòng |

---

### 9. Vòng lặp Chất lượng — "Code sinh Code chất lượng"

#### 9.1 Test Coverage Growth

```
Vòng 1: 0%  → test_coverage_gaps() → ưu tiên symbols nguy hiểm
Vòng 2: 15% → test_plan() → viết test top 5
Vòng 3: 30% → test_impact() → verify coverage
Vòng 4: 45% → review_pr() → check trong PR
Vòng 5: 58% → edit_check() → warning nếu không test
Vòng 10: 85% (asymptotic)
```

#### 9.2 Dead Code Elimination

```
PHASE 1: TÍCH LŨY — Agent tạo code mới, không xóa code cũ → 10-15 dead symbols
PHASE 2: PHÁT HIỆN — find_dead_code() + context() + grep() → verify
PHASE 3: DỌN DẸP — impact() → confirm safe → xóa → detect_changes() verify
PHASE 4: NGĂN CHẶN — annotate(pattern) → agent học "replace + delete"
```

#### 9.3 Bug Recurrence Prevention

```
KHÔNG LEARNING:
  Phiên 1: Bug "email overwrite" → fix
  Phiên 2: KHÔNG NHỚ → lại bug → fix lại
  Phiên 3: LẠI bug → 3× debug = 45K tokens lãng phí

CÓ MILENS:
  Phiên 1: Bug → fix + annotate("Gọi normalize sau createUser", conf 0.8)
  Phiên 2: recall() → agent BIẾT, không mắc lại
  Phiên 5: Conf 0.9 → promote → rule → LUÔN enforced
  → Tiết kiệm 30K tokens

BRR (Bug Recurrence Rate):
  Không learning: 40-50% | Có milens: 5-10% (↓80-90%)
```

#### 9.4 Security Hardening

```
VÒNG 1: grep(secrets)=0 | grep(unicode)=1 found → xóa
        review_pr() → 2 HIGH → review_symbol("handlePayment") → CRITICAL
        → Viết test + annotate(security warning)

VÒNG 2: handlePayment có test + annotation → edit_check() cảnh báo agent
        → Agent chọn approach an toàn hơn

VÒNG 5: 5 security annotations → promote → SECURITY.md rule
        → Agent LUÔN validate input, hash password, dùng parameterized queries
        → 0 lỗ hổng mới
```

---

### 10. Vòng lặp Kiến trúc — "Architecture tự cải thiện"

#### 10.1 Module Clustering & Decoupling

```
domains() → "core": 45 files, 380 symbols → ⚠ QUÁ LỚN!
  Sub-clusters: auth(12), payment(8), user(10), shared(15)
  → Split "core" → 4 domains

impact({target:"auth"}) → blast radius | 
explain_relationship({from:"auth",to:"payment"}) → dependency inversion
Refactor plan → mỗi lần tách → verify → detect_changes()

HỌC: annotate("Đừng để domain > 20 files", conf 0.9)
```

#### 10.2 Dependency Optimization

```
BEFORE: impact({target:"AuthService", depth:3})
  [1] WILL BREAK: 15 | [2] LIKELY: 38 | [3] MAY: 72 → 125 symbols!

FACADE PATTERN: AuthService → AuthServiceImpl + TokenSvc + SessionSvc + PasswordSvc

AFTER: impact({target:"TokenService", depth:2})
  [1] WILL BREAK: 4 (↓73%) | [2] LIKELY: 12 (↓68%)
  → Blast radius giảm 73%!
```

#### 10.3 Route Auditing

```
routes() → 23 endpoints (18 active, 5 potentially unused)
  grep("legacy|old-dashboard") → tìm references
  context({name:"migrateData"}) → còn ai gọi không?
  → Xóa unused endpoints + handlers
```

#### 10.4 Type Hierarchy

```
get_type_hierarchy({name:"BaseModel"})
  → 350 dòng, 25 methods, 15 subclasses → GOD CLASS!
  → Split: TimestampedModel + SoftDeletableModel + ValidatableModel + SerializableModel
  → Mỗi trait 5-7 methods, chỉ extend cái cần
  → Blast radius giảm 70%
```


---

## PHẦN IV: TRIỂN KHAI

---

### 11. System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                 SYSTEM COMPONENT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   AI CODING AGENT                         │   │
│  │         (Claude Code / OpenCode / Codex / Cursor)         │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│          ┌────────────────┼────────────────┐                    │
│          ▼                ▼                ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  KNOWLEDGE   │ │    GUARD     │ │   LEARNING   │            │
│  │    BASE      │ │    LAYER     │ │    ENGINE    │            │
│  ├──────────────┤ ├──────────────┤ ├──────────────┤            │
│  │ milens index │ │ edit_check() │ │ annotate()   │            │
│  │ annotations  │ │ impact()     │ │ recall()     │            │
│  │ sessions     │ │ review_pr()  │ │ find_similar │            │
│  │ vectors      │ │ grep(sec)    │ │ semantic_srch│            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     DATA LAYER                            │   │
│  │  milens.db (SQLite+FTS5): symbols, links, annotations    │   │
│  │  tracking.db: tool calls, token usage, response times   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              FEEDBACK CONTROLLER                          │   │
│  │  Metrics: TER, LR, CQI, CTR, BRR, TCGR, DCER            │   │
│  │  Thresholds → auto-actions: alert, adjust, refactor      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              EVOLUTION ENGINE                             │   │
│  │  Instinct→Skill→Rule lifecycle | Confidence tracking     │   │
│  │  Auto-promotion | Conflict detection | Stale archival    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Component Details

**Knowledge Base:**
- milens index: Knowledge graph tự động (587 symbols, 1021 links ở milens self)
- annotations: Cross-session memory, queryable SQLite
- sessions: Multi-agent coordination, audit trail
- vectors: Semantic search (cần --embeddings)

**Guard Layer:**
- edit_check(): Pre-edit safety — callers, exports, test coverage, warnings
- impact(): Blast radius — 3 tầng depth, recursive CTE
- review_pr(): PR risk — CRITICAL/HIGH/MEDIUM/LOW scores
- grep(): Hidden unicode, secrets, dangerous patterns
- detect_changes(): Verify expected files only
- test_impact(): Maps changes → test files

**Learning Engine:**
- annotate(): Record observations, bugs, patterns
- recall(): Retrieve past learnings, filterable
- find_similar(): Find related patterns (embedding proximity)
- semantic_search(): Discover hidden connections
- session_*(): Multi-session awareness + handoff

**Feedback Controller:**
```
INPUT METRICS → THRESHOLD CHECK → AUTO-CORRECTIONS

TER < 0.7  → WARNING: lãng phí token → tối ưu strategy
BRR > 15%  → ALERT: learning yếu → tăng threshold, thêm test
CQI < 6.0  → ACTION: trigger refactor session
DCER > 10% → ACTION: schedule cleanup
TCGR < 2%  → SUGGEST: prioritize test writing
```

**Evolution Engine:**
```
IF confidence ≥ 0.8 AND occurrences ≥ 3 AND age ≤ 30 days
  → promote → skill

IF skill.usage ≥ 10 AND success_rate ≥ 0.9
  → promote → rule (always enforced)

IF age > 60 days AND last_verified < 30 days
  → flag stale

IF confidence < 0.3 AND age > 90 days
  → archive

IF two rules conflict
  → flag for human merge/resolve
```

---

### 12. Implementation Roadmap — 12 tuần

```
WEEK 1-2: FOUNDATION
☐ Cài milens, npx milens analyze --force
☐ Tạo AGENTS.md, CLAUDE.md với milens context
☐ Bootstrap annotations cho top 10 symbols
☐ session_start() mỗi phiên, baseline metrics

WEEK 3-4: TOKEN OPTIMIZATION
☐ Phân tích 7 loại token waste → fix
☐ Model routing: task → model phù hợp
☐ Strategic compact pattern (manual, save state)
☐ Dynamic system prompt (dev/review/research modes)
☐ Reduce enabled MCPs → only milens + essentials
☐ Token budget framework

WEEK 5-6: VERIFICATION LOOP
☐ 6 checkpoint evals (Analyze→Plan→Code→Verify→Learn→Improve)
☐ CI/CD scheduled evals (mỗi 4h hoặc daily)
☐ Security scan tích hợp vào mỗi phiên
☐ Dead code detection schedule (weekly)
☐ Pre-commit hook với milens tools

WEEK 7-8: SELF-LEARNING
☐ Pattern extraction từ annotations
☐ Confidence scoring (0.0-1.0)
☐ Auto-classify annotations
☐ Promotion rules (instinct→skill→rule)
☐ Stale pattern detection
☐ Weekly knowledge base review

WEEK 9-10: CLOSED LOOP
☐ Full 6-phase cycle tự động
☐ Feedback controller (monitor + auto-correct)
☐ Evolution engine (auto-promote patterns)
☐ Cross-session memory pipeline
☐ Architecture improvement loop
☐ Test coverage growth loop

WEEK 11-12: OPTIMIZATION
☐ Fine-tune thresholds (TER, BRR, CQI)
☐ Tối ưu learning rate
☐ Refine skill evolution lifecycle
☐ A/B test: có vs không có learning
☐ Document best practices
☐ Plan next evolution cycle (W13+)
```

---

### 13. Metrics & KPIs

#### 13.1 Token Efficiency Ratio (TER)

```
TER = Useful Tokens / Total Tokens

  > 0.80 → Excellent    | 0.60-0.80 → Good
  0.40-0.60 → Fair      | < 0.40 → Poor

  MILENS: TER tăng từ ~0.5 → ~0.85 (↑70%)
```

#### 13.2 Learning Rate (LR)

```
LR = Savings Gained / Savings Possible

  LR(5):  (100K-70.5K)/50K = 59% của maximum
  LR(10): (100K-56.7K)/50K = 87% của maximum
```

#### 13.3 Code Quality Index (CQI)

```
CQI = 0.35×Coverage + 0.20×(1-DeadCode) + 0.20×SecurityScore
    + 0.15×(1-Coupling) + 0.10×Documentation

  > 8.0 → Excellent | 6.0-8.0 → Good | 4.0-6.0 → Fair | < 4.0 → Poor
```

#### 13.4 Cycle Time Reduction (CTR)

```
Task "Sửa checkoutHandler":
  Manual: 45 phút | Milens: 15 phút → CTR = 67%

Task "Review PR 15 files":
  Manual: 120 phút | Milens: 10 phút → CTR = 92%
```

#### 13.5 Bug Recurrence Rate (BRR)

```
Week 1 (no learning):    5/12 = 42%
Week 4 (annotations):    2/10 = 20%
Week 8 (promoted rules): 1/14 = 7%
Week 12 (optimized):     0/11 = 0%

TARGET: BRR < 10%
```

#### 13.6 Test Coverage Growth Rate (TCGR)

```
Week 1-2:  7.5%/tuần (easy wins)
Week 3-4:  10%/tuần (learning kicks in)
Week 5-8:  6.25%/tuần (harder symbols)
Week 9-12: 3.75%/tuần (asymptotic)

TARGET: > 5%/tuần early, > 2%/tuần sustained, ổn định 80-85%
```

#### 13.7 Dead Code Elimination Rate (DCER)

```
After accumulate: DCER = 8-12%
After cleanup:    DCER = 2-4%
After learning:   DCER = 1-3% (agent tự dọn)

TARGET: DCER < 3%
```


---

## PHẦN V: CASE STUDIES

---

### 14. Case Study 1 — Dự án mới từ số 0

#### Bối cảnh
- Dự án: SaaS subscription management (Stripe billing)
- Stack: TypeScript, Express, PostgreSQL, React
- Agent: Claude Code + Sonnet | Mục tiêu: MVP 2 tuần, 100% AI

#### Vòng 1: Bootstrap (Ngày 1-3)

```
SESSION 1: Khởi tạo
  npx create-next-app → npx milens analyze --force
  codebase_summary() → 45 symbols, 78 links
  session_start({agent:"saas-builder"})
  Agent: tạo schema, setup Stripe, basic auth
  Token: 85K

SESSION 2: Core features
  codebase_summary() → 120 symbols, 210 links
  recall() → chưa có annotations
  Agent: Stripe Checkout, webhook, middleware, UI
  Guard: edit_check({name:"checkoutHandler"}) → new, safe
  Token: 92K

SESSION 3: Polish & Test
  codebase_summary() → 185 symbols, 380 links
  recall() → 2 annotations: "checkoutHandler cần validate" (conf 0.6)
  Agent: "Tôi thấy trước cần validate → sẽ kiểm tra lại"
  test_coverage_gaps() → 45 untested → test_plan() top 5 → viết test
  review_pr() → 0 CRITICAL, 2 HIGH → fix
  Token: 78K (↓15% nhờ learning!)
```

#### Vòng 2: Iteration (Ngày 4-7)

```
SESSION 4-6: Feature expansion
  recall() → 12 annotations → agent có sẵn caveats
  Agent: team management, invoice PDF, email notifications
  Guard: impact({target:"createSubscription", depth:2})
    → WILL BREAK: checkoutHandler, upgradeTier
    → Agent biết cần update cả 2
  Token: 75K (↓12%)

SESSION 7: Cleanup
  find_dead_code() → 8 symbols → xóa → detect_changes() verify
  test_coverage_gaps() → ưu tiên HIGH risk → viết test
  Token: 68K (↓20%)
```

#### Vòng 3: Stabilize (Ngày 8-14)

```
SESSION 8-10: Final polish
  Coverage: 48% → 68% | Dead code: 8 → 2
  Promoted rules: 3 (input validation, idempotency, error handling)
  Token: 62K (↓27% from baseline)

FINAL RESULTS (10 phiên, 2 tuần):
  Symbols: 380 | Links: 820 | Coverage: 68%
  Annotations: 35 | Skills: 2 | Rules: 3 | Dead code: 2
  Security issues: 0

  Token trajectory:
    Phiên 1: 85K | Phiên 5: 75K (↓12%) | Phiên 10: 62K (↓27%)

  ROI: Investment 35K | Savings 150K | ROI = 4.3x

  Key Learnings:
    "Dùng edit_check()+impact() trước mỗi edit lớn"
    "Annotate sau bug fix → tiết kiệm 30K tokens"
    "find_dead_code() mỗi 5 phiên → codebase sạch"
```

---

### 15. Case Study 2 — Thêm tính năng vào dự án có sẵn

#### Bối cảnh
- Dự án: E-commerce (12 tháng, 15K dòng, 1200 symbols)
- Yêu cầu: Thêm "loyalty points"
- Thách thức: Codebase lớn, nhiều deps, không muốn vỡ

#### Workflow

```
PHASE 1: ANALYZE (2 phút, 2,500 tokens)
  codebase_summary() → 1,200 symbols, 3,500 links, 58% coverage
  Top hubs: OrderService(45 deps), UserService(32), ProductService(28)
  domains() → orders(180), users(120), products(95)...
  routes() → 34 endpoints
  recall() → 67 annotations:
    "OrderService: CRITICAL hub, LUÔN impact() trước khi sửa"
    "PaymentService: KHÔNG modify schema"
    "User model: email unique, validate trước insert"

PHASE 2: PLAN (5 phút, 2,800 tokens)
  smart_context({name:"OrderService", intent:"edit"})
    → heat 0.95, 45 deps → ⚠ EXTREMELY HIGH
  impact({target:"OrderService", depth:3})
    → 85 symbols affected!
  DECISION: KHÔNG modify OrderService.
    Tạo LoyaltyService riêng, dùng hook pattern để integrate.
    Giảm blast radius từ 85 → 1 symbol!
  test_plan({name:"LoyaltyService"})
    → Mock OrderService, UserService, 3 scenarios

PHASE 3: CODE (72,000 tokens)
  Agent tạo: LoyaltyService, LoyaltyController, routes
  Guard mỗi edit:
    edit_check({name:"LoyaltyService"}) → new, safe
    edit_check({name:"OrderService"}) → ⚠ 12 callers → chỉ add hook
    impact({target:"OrderService", depth:1}) → only 1 new file affected

PHASE 4: VERIFY (1,800 tokens)
  detect_changes() → expected files only ✓
  review_pr() → 0 CRITICAL, 1 HIGH (new code)
  test_impact() → test/unit/order.test.ts, test/unit/loyalty.test.ts
  grep(secrets) → 0 found ✓

PHASE 5: LEARN (500 tokens)
  annotate("LoyaltyService: interface-based, hook pattern, safe for hubs")
  annotate("Pattern: extend hubs qua hooks thay vì modify core → ↓85% risk")
  annotate("OrderService: conf 0.9 — NEVER modify core, only extend")

KẾT QUẢ:
  Hoàn thành 1 phiên (2h) | 0 bugs do blast radius
  0 core modifications | Knowledge saved for future
  Token: 79,600 | NẾU KHÔNG CÓ MILENS: 140,000 (↓43%)
```

---

### 16. Case Study 3 — Refactor lớn

#### Bối cảnh
- Dự án: Monolithic Express (3 năm, 25K dòng)
- Vấn đề: OrderService 850 dòng, 45 dependents, 0 tests, 23 methods
- Mục tiêu: Split → 5 services, giảm blast radius
- Rủi ro: RẤT CAO — production app, nhiều dependents

#### Workflow

```
PRE-REFACTOR:
  codebase_summary() → 1,850 symbols, 5,200 links, 22% coverage
  get_file_symbols({file:"src/services/order.ts"})
    → 850 dòng, 23 methods: createOrder...archiveOrder
  context({name:"OrderService"})
    → incoming 45 (12 controllers, 8 services, 15 routes...)
    → outgoing 18 (UserSvc, PaymentSvc, DB, Cache, Queue...)

PHASE 1: STABILIZE (Tuần 1)
  test_coverage_gaps({limit:50}) → ưu tiên 45 callers
  test_plan({name:"OrderService"}) → Mock all 18 dependencies
  Viết 69 integration tests (23 methods × 3 scenarios)
  Coverage: 22% → 45%

PHASE 2: SPLIT (Tuần 2)
  Dựa trên analysis → split thành:
    OrderCore (create,update,cancel,get) 
    OrderPricing (calculate,discount,tax)
    OrderPayment (process,refund,fraud)
    OrderFulfillment (ship,track,return)
    OrderNotification (email,invoice,notify)

  Mỗi lần split:
    impact({target, depth:2}) → verify blast radius
    detect_changes() → verify expected files
    test_impact() → run affected tests

PHASE 3: VERIFY (Tuần 3)
  review_pr() → 0 CRITICAL, ≤2 HIGH ✓
  test_coverage_gaps() → coverage ≥ 70% ✓
  find_dead_code() → old OrderService deleted ✓
  routes() → endpoints unchanged ✓
  explain_relationship({from:"OrderCore",to:"OrderPricing"}) → decoupled ✓

PHASE 4: LEARN
  annotate("Split pattern: Test→Split→Verify→Learn. Tools: gaps→plan→impact→detect→review")
  annotate("OrderService_split: blast ↓78%, coverage ↑22%→68%")

KẾT QUẢ:
  BEFORE: 850 dòng, 23 methods, 45 deps (depth 1), coverage 22%
  AFTER:  5 services (120-200 dòng), max 8 deps (depth 1), coverage 68%
  BLAST RADIUS: ↓82% | COVERAGE: ↑209%
```


---

## PHẦN VI: PHỤ LỤC

---

### Phụ lục A: Token Budget Calculator

```
TOTAL CONTEXT: 200,000 tokens
  System overhead:    30,000 (15%) — prompt + rules + tools + memory
  Milens tools:        5,000 (2.5%) — 20 tool calls
  Available coding:  145,000 (72.5%)
  Reserve buffer:     20,000 (10%)

MILENS TOOL BREAKDOWN (5,000):
  codebase_summary:    500 (1 call)    smart_context:   600 (3 calls)
  impact:              400 (2 calls)   context:         600 (3 calls)
  edit_check:          300 (2 calls)   query:           250 (5 calls)
  grep:                450 (3 calls)   test_plan:       300 (1 call)
  review_pr:           500 (1 call)    test_impact:     250 (1 call)
  annotate:            200 (4 calls)   recall:          100 (2 calls)
  others:              550 (còn lại)

CODING BREAKDOWN (145,000):
  File reading:       30,000    File writing:     50,000
  Test output:        15,000    Debugging:        20,000
  Conversation:       20,000    Overflow buffer:  10,000
```

---

### Phụ lục B: Annotation Schema & Best Practices

#### Schema

```typescript
interface Annotation {
  symbol: string;        // Tên symbol hoặc "_global"
  key: AnnotationKey;    // Loại ghi chú
  value: string;         // Nội dung (nên có evidence)
  agent?: string;        // Agent tạo
  session_id?: string;   // Phiên làm việc
  confidence: number;    // 0.0 - 1.0
  created_at: string;    // ISO timestamp
  updated_at: string;    // ISO timestamp
}

type AnnotationKey =
  | "note"          // Ghi chú tổng quát
  | "bug"           // Bug pattern đã gặp
  | "security"      // Cảnh báo bảo mật
  | "architecture"  // Hiểu biết kiến trúc
  | "workflow"      // Pattern làm việc hiệu quả
  | "test"          // Strategy test
  | "dependency"    // Lưu ý về dependency
  | "refactor"      // Ghi chú refactor
```

#### Best Practices

```
1. LUÔN kèm evidence trong value
   X: "Hàm này dễ vỡ"
   ✓: "Hàm này dễ vỡ vì normalizeEmail() overwrite email
       nếu gọi sai thứ tự. Đã xảy ra 2 lần (session #3, #7)."

2. Gán confidence ban đầu dựa trên evidence strength
   - 1 evidence: confidence 0.5
   - 2 evidence: confidence 0.7
   - 3+ evidence + verified: confidence 0.9

3. Đặt key phù hợp để dễ filter/aggregate
   - Bug patterns → key: "bug"
   - Security concerns → key: "security"
   - Architecture insights → key: "architecture"

4. Dùng "_global" symbol cho patterns không gắn với symbol cụ thể
   annotate({symbol: "_global", key: "workflow",
     value: "Luôn chạy tsc --noEmit trước commit"})

5. Review annotations định kỳ (weekly)
   - Deprecate stale (age > 30d, no confirms)
   - Promote high-confidence (≥ 0.8, ≥ 3 occurrences)
   - Merge duplicates
```

---

### Phụ lục C: CI/CD Pipeline cho Closed-Loop System

#### GitHub Actions — Full Pipeline

```yaml
name: Closed-Loop AI Dev Pipeline
on:
  pull_request:
    types: [opened, synchronize]
  schedule:
    - cron: '0 6 * * 1'  # Weekly audit mỗi sáng thứ 2

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g milens

      # PHASE 1: ANALYZE
      - name: Analyze codebase
        run: npx milens analyze -p . --force

      # PHASE 4: VERIFY
      - name: Review PR Risk
        run: |
          echo "## Milens PR Review" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "review_pr" >> $GITHUB_STEP_SUMMARY 2>&1 || true

      - name: Test Coverage Gaps
        run: |
          echo "## Coverage Gaps" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "test_coverage_gaps" >> $GITHUB_STEP_SUMMARY 2>&1 || true

      - name: Find Dead Code
        run: |
          echo "## Dead Code" >> $GITHUB_STEP_SUMMARY
          npx milens inspect "find_dead_code" >> $GITHUB_STEP_SUMMARY 2>&1 || true

      - name: Security Scan
        run: |
          echo "## Security" >> $GITHUB_STEP_SUMMARY
          npx milens search "password|secret|api_key|token" >> $GITHUB_STEP_SUMMARY 2>&1 || true

  evolve:
    needs: analyze
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Evolution Check
        run: |
          echo "## Evolution Report" >> $GITHUB_STEP_SUMMARY
          echo "Check annotations with confidence >= 0.8"
          echo "Promote to skills/rules"
          echo "Archive stale patterns (age > 60 days, no confirms)"
```

#### Pre-commit Hook (local)

```bash
#!/bin/bash
# .git/hooks/pre-commit
echo "Milens: Refreshing index..."
npx milens analyze -p . --force 2>&1 | tail -1
echo "Milens: Detecting changes..."
npx milens inspect "detect_changes" 2>&1 || true
echo "Milens: Checking dead code..."
npx milens inspect "find_dead_code" 2>&1 || true
echo "Milens: Test coverage gaps..."
npx milens inspect "test_coverage_gaps" 2>&1 || true
echo "Done."
```

---

### Phụ lục D: Migration Path — Manual → Automated

```
STAGE 0: MANUAL (Hiện tại)
  Agent tự explore codebase, không intelligence
  Không learning, không memory

STAGE 1: BOOTSTRAP (Tuần 1-2)
  + milens analyze mỗi phiên
  + codebase_summary() đầu phiên
  + Manual annotations

STAGE 2: GUARDED (Tuần 3-6)
  + edit_check() trước mỗi edit
  + impact() trước khi sửa hub
  + review_pr() cuối phiên
  + CI/CD integration

STAGE 3: LEARNING (Tuần 7-10)
  + Auto-annotate patterns
  + Confidence scoring
  + recall() đầu phiên
  + Cross-session memory

STAGE 4: CLOSED LOOP (Tuần 11-12+)
  + Full 6-phase automation
  + Feedback controller
  + Evolution engine
  + Self-improving system

MIGRATION PRINCIPLES:
  1. Không cần hoàn hảo ngay — mỗi stage thêm 1 lớp value
  2. Bắt đầu với 2-3 tools, thêm dần
  3. Review annotations weekly trước khi trust auto-promotion
  4. Keep human in the loop cho confidence < 0.9
```

---

### Phụ lục E: ECC Instinct vs Milens Annotation

| Tiêu chí | ECC Instinct System | Milens Annotation System |
|---|---|---|
| **Storage** | File-based (.md files) | SQLite database |
| **Query** | Manual grep/file search | SQL queryable (filter, aggregate, join) |
| **Confidence** | Implicit (pattern repetition) | Explicit (0.0-1.0 field) |
| **Evolution** | Auto (Stop hook extraction) | Manual (annotate) → có thể auto hóa |
| **Promotion** | Manual or skill-based | Manual (review → promote) |
| **Scope** | Project or global | Symbol-level granular |
| **Multi-agent** | Via file sharing | session_start() + handoff() |
| **Staleness** | Manual review | Query age + last_verified |
| **Integration** | Claude Code hooks | MCP protocol (any harness) |
| **Audit trail** | Git history of .md files | SQLite + timestamps + agent/session IDs |
| **Setup** | Cần ECC plugin + hooks | npx milens analyze (1 lệnh) |
| **Learning type** | Auto (passive) | Manual → semi-auto → auto path |

**Tổng kết:** ECC Instinct mạnh về automation (auto-extract, auto-promote). Milens Annotation mạnh về structure (queryable, granular, auditable). Lý tưởng: kết hợp cả hai — dùng milens làm storage engine, thêm auto-extraction layer phía trên.

---

## Tài liệu tham khảo

### ECC
- [ECC GitHub (182K+ stars)](https://github.com/affaan-m/ECC)
- [The Shorthand Guide](https://github.com/affaan-m/ECC/blob/main/the-shortform-guide.md)
- [The Longform Guide](https://github.com/affaan-m/ECC/blob/main/the-longform-guide.md)
- [The Security Guide](https://github.com/affaan-m/ECC/blob/main/the-security-guide.md)
- [ECC Planner Agent Spec](https://github.com/affaan-m/ECC/blob/main/agents/planner.md)
- [AgentShield](https://github.com/affaan-m/agentshield)

### milens
- [milens GitHub](https://github.com/fuze210699/milens)
- [milens README — 32 MCP tools](https://github.com/fuze210699/milens#readme)

### Bảo mật
- Check Point Research, CVE-2025-59536 & CVE-2026-21852
- Microsoft Security, "AI Recommendation Poisoning" (Feb 2026)
- Snyk, "ToxicSkills: Malicious AI Agent Skills" (Feb 2026)
- Unit 42, "Web-Based Indirect Prompt Injection" (Mar 2026)
- OWASP MCP Top 10

---

*Báo cáo: 2026-05-27 | Dựa trên milens index (587 symbols, 1021 links) + 3 ECC guides*
*"Token Optimization + Self-Learning → Closed-Loop AI Development System"*
