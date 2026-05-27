# Milens — Lộ trình triển khai Closed-Loop AI Development

> **Ngày lập:** 2026-05-27 | **Version:** 0.5.8 → target 0.6.0+
> **Căn cứ:** `docs/ecc-milens-vibe-code.md` + `docs/closed-loop-ai-development.md`
> **Trạng thái hiện tại:** 32 MCP tools hoạt động, 7-phase analyzer pipeline, Memory/Learning/Review hoàn chỉnh. **TODO: 100% hoàn thành.**

---

## Tổng quan: Cái gì đã có, cái gì còn thiếu

### Lớp hiện tại (Phase 1-4: Analyze → Plan → Code → Verify)

| Tool | Mô tả | Status |
|------|-------|--------|
| `query` | FTS5 tìm symbol theo tên | Done |
| `grep` | Regex tìm kiếm toàn bộ file trong project | Done |
| `context` | 360° view: incoming + outgoing links của 1 symbol | Done |
| `impact` | Blast radius analysis (upstream/downstream, depth 1-3) | Done |
| `edit_check` | Pre-edit safety check: callers, re-exports, test coverage, warnings | Done |
| `detect_changes` | Git diff → affected symbols + dependents | Done |
| `find_dead_code` | Exported symbols không có incoming references | Done |
| `get_file_symbols` | Tất cả symbols trong 1 file | Done |
| `get_type_hierarchy` | Cây kế thừa (ancestors + descendants) | Done |
| `overview` | Kết hợp context + impact + grep trong 1 call | Done |
| `smart_context` | Context-aware view theo intent (edit/debug/test/understand) | Done |
| `trace` | Call chain từ entrypoints đến target hoặc ngược lại | Done |
| `routes` | Auto-detect API endpoints (7 frameworks) | Done |
| `explain_relationship` | Shortest path BFS giữa 2 symbols | Done |
| `domains` | Module clusters (union-find trên cross-file links) | Done |
| `repos` | List tất cả repo đã index | Done |
| `status` | Index stats + domains + coverage + staleness | Done |
| `ast_explore` | Parse code snippet → S-expression AST | Done |
| `test_query` | Test tree-sitter query trên code snippet | Done |

### Lớp còn thiếu (Phase 4b-6: Review → Learn → Improve)

| # | Tool / Thành phần | Mô tả | Độ khó | File cần sửa |
|---|-------------------|-------|--------|-------------|
| R1 | `review_pr()` | Đọc git diff, với mỗi symbol thay đổi → risk score (LOW/MEDIUM/HIGH/CRITICAL) dựa trên heat + dependents + test coverage | Medium | `src/server/mcp.ts` |
| R2 | `review_symbol({name})` | Deep-dive 1 symbol: role, heat, dependents count, test status → risk level + recommendation | Easy | `src/server/mcp.ts` |
| R3 | `test_coverage_gaps({limit?})` | Symbols exported, không có incoming link từ test file, sắp xếp theo heat giảm dần | Easy | `src/server/mcp.ts`, `src/store/db.ts` |
| R4 | `test_impact()` | Map changed symbols (git diff) → những test file nào cần chạy (dựa vào dependency graph) | Medium | `src/server/mcp.ts`, `src/store/db.ts` |
| R5 | `test_plan({name})` | Dựa trên context của symbol → đề xuất mock strategy + ≥3 test scenarios | Hard | `src/server/mcp.ts` |
| R6 | `codebase_summary()` | Output compact ~500 token: domains + top hubs (top N by heat) + test coverage % + annotation count | Easy | `src/server/mcp.ts`, `src/store/db.ts` |

---

## Giai đoạn 1: Review & Test Layer (target: 0.5.9)

### R1 — `review_pr({})`

**Mô tả:** Tự động đánh giá rủi ro của PR dựa trên các file/symbol bị thay đổi.

**Input schema:**
```typescript
z.object({
  ref: z.string().optional().default('HEAD'), // git ref so sánh (mặc định HEAD~1)
  repo: z.string().optional(),
})
```

**Logic:**
1. `git diff --name-only <ref>` → danh sách file thay đổi
2. Với mỗi file → tìm symbols trong file đó (query DB)
3. Với mỗi symbol:
   - Lấy incoming links count = số dependents
   - Lấy heat score
   - Kiểm tra test coverage (có bị test file nào import/call không)
   - Tính risk score:
     ```
     score = 0
     + (heat / 100) * 40                    // heat factor (0-40)
     + min(dependents / 10, 1) * 35         // blast radius factor (0-35)
     + (hasTest ? 0 : 25)                   // no test penalty (0-25)
     ```
   - Risk level: 0-25 LOW | 26-50 MEDIUM | 51-75 HIGH | 76-100 CRITICAL
4. Trả về danh sách symbols + scores + summary (count by risk level)

**Output format:**
```json
{
  "changedFiles": ["src/auth.ts", "src/payment.ts"],
  "affectedSymbols": [
    {
      "symbol": "handlePayment",
      "kind": "function",
      "file": "src/payment.ts",
      "heat": 92,
      "dependents": 15,
      "hasTest": false,
      "riskScore": 85,
      "riskLevel": "CRITICAL"
    }
  ],
  "summary": {
    "CRITICAL": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 5
  }
}
```

**Cần làm:**
- [x] Thêm method `getSymbolTestCoverage(symbolId: string): boolean` vào `src/store/db.ts`
- [x] Thêm `getReviewPrResult()` method tổng hợp
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### R2 — `review_symbol({name})`

**Mô tả:** Deep-dive đánh giá rủi ro của 1 symbol cụ thể.

**Input schema:**
```typescript
z.object({
  name: z.string(),
  repo: z.string().optional(),
})
```

**Logic:**
1. Tìm symbol bằng `findSymbolByName()`
2. Lấy `getIncomingLinks()` → count dependents + list top 5
3. Lấy `getOutgoingLinks()` → count dependencies + list top 5
4. Lấy role + heat từ symbol record
5. Kiểm tra test coverage
6. Check nếu là re-export (tìm trong re-export chains)
7. Tổng hợp → risk level + recommendation string

**Output format:**
```json
{
  "symbol": "handlePayment",
  "role": "hub",
  "heat": 92,
  "dependents": { "count": 15, "top": ["checkoutRoute", "webhookHandler", "refundService"] },
  "dependencies": { "count": 8, "top": ["StripeSDK", "OrderService", "UserModel"] },
  "testCoverage": false,
  "isReexported": true,
  "riskLevel": "CRITICAL",
  "recommendation": "Ham thanh toan — 15 dependents, khong test, re-exported. Can viet test truoc khi sua."
}
```

**Cần làm:**
- [x] Method `getReviewSymbol(name: string)` trong `src/store/db.ts`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### R3 — `test_coverage_gaps({limit})`

**Mô tả:** Trả về các symbol chưa có test, sắp xếp theo mức độ nguy hiểm.

**Input schema:**
```typescript
z.object({
  limit: z.number().optional().default(20),
  repo: z.string().optional(),
})
```

**Logic:**
1. Lấy tất cả exported production symbols (file không nằm trong test directory)
2. Lấy tất cả symbols được test files import/call (từ `getTestCoverage()`)
3. So sánh 2 tập → gaps
4. Sắp xếp theo heat giảm dần
5. Return top `limit`

**Output format:**
```json
{
  "totalExported": 198,
  "testedCount": 107,
  "coveragePercent": 54,
  "gaps": [
    { "symbol": "analyze", "kind": "function", "file": "src/cli.ts", "heat": 100, "dependents": 12, "risk": "CRITICAL" },
    { "symbol": "createMcpServer", "kind": "function", "file": "src/server/mcp.ts", "heat": 95, "dependents": 1, "risk": "HIGH" }
  ]
}
```

**Cần làm:**
- [x] Method `getTestCoverageGaps(limit: number)` trong `src/store/db.ts`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### R4 — `test_impact()`

**Mô tả:** Xác định test files nào cần chạy dựa trên code changes.

**Input schema:**
```typescript
z.object({
  ref: z.string().optional().default('HEAD'),
  repo: z.string().optional(),
})
```

**Logic:**
1. `git diff --name-only <ref>` → changed source files
2. Tìm symbols trong changed files
3. Tìm tất cả dependents của changed symbols (upstream — ai gọi symbol này)
4. Lọc ra dependents nằm trong test files
5. Return danh sách test files + lý do (symbol nào bị ảnh hưởng)

**Output format:**
```json
{
  "changedSymbols": ["handlePayment", "checkoutRoute"],
  "affectedTestFiles": [
    { "file": "test/unit/payment.test.ts", "reason": "Tests handlePayment (changed)" },
    { "file": "test/unit/checkout.test.ts", "reason": "Tests checkoutRoute (changed)" }
  ],
  "suggestedCommand": "npx vitest run test/unit/payment.test.ts test/unit/checkout.test.ts"
}
```

**Cần làm:**
- [x] Method `getTestImpact(changedSymbolIds: string[]): string[]` trong `src/store/db.ts`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### R5 — `test_plan({name})`

**Mô tả:** Sinh test strategy cho 1 symbol dựa trên dependencies của nó.

**Input schema:**
```typescript
z.object({
  name: z.string(),
  repo: z.string().optional(),
})
```

**Logic:**
1. Lấy symbol info + context (incoming/outgoing links)
2. Với mỗi outgoing dependency → phân loại mock strategy:
   - External package → mock hoàn toàn
   - Database/IO → stub
   - Internal service → spy nếu đơn giản, mock nếu phức tạp
3. Dựa trên signature + context của symbol → đề xuất ≥ 3 test scenarios:
   - Happy path (input valid → output expected)
   - Edge case (null/empty/negative input)
   - Error handling (dependency throws → graceful error)
4. Format → markdown plan string

**Note:** Tool này không cần store method mới — chỉ dùng existing methods (`findSymbolByName`, `getIncomingLinks`, `getOutgoingLinks`) + template rendering.

**Cần làm:**
- [x] Hàm `generateTestPlan(name, db)` trong `src/server/mcp.ts` (hoặc file riêng `src/server/test-plan.ts`)
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### R6 — `codebase_summary()`

**Mô tả:** Trả về context compact ~500 token để agent khởi động nhanh.

**Input schema:**
```typescript
z.object({
  repo: z.string().optional(),
})
```

**Logic:**
1. Gọi `getStats()` → total symbols, links, files
2. Gọi `getDomainStats()` → domains + counts
3. Lấy top 10 symbols by heat (hubs/entrypoints)
4. Gọi `getTestCoverage()` → coverage %
5. Return text summary

**Output format (plain text, compact):**
```
Milens Codebase Summary:
  Symbols: 587 | Links: 1021 | Files: 66
  Test coverage: 54% (107/198 exported symbols tested)
  Domains: parser(396), store(89), server(38), test(28), analyzer(23), root(15)
  Top hubs: analyze(fn,heat:100), createMcpServer(fn,heat:95), extractFromTree(fn,heat:88)
  Total annotations: 0 | Sessions: 0
```

**Cần làm:**
- [x] Method `getCodebaseSummary()` trong `src/store/db.ts`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

## Giai đoạn 2: Memory Layer (target: 0.6.0)

### Schema mới trong `src/store/schema.sql`

```sql
-- Annotations: cross-session memory
CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,            -- symbol name hoặc '_global'
  key         TEXT NOT NULL,            -- note|bug|security|architecture|workflow|test|dependency|refactor
  value       TEXT NOT NULL,            -- nội dung ghi chú
  agent       TEXT,                     -- tên agent tạo annotation
  session_id  TEXT,                     -- session ID
  confidence  REAL DEFAULT 0.5,         -- 0.0-1.0
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_annotations_symbol ON annotations(symbol);
CREATE INDEX IF NOT EXISTS idx_annotations_key    ON annotations(key);
CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);

-- Sessions: multi-agent coordination
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  agent             TEXT NOT NULL,
  status            TEXT DEFAULT 'active',  -- active|completed|failed
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT,
  tool_calls_count  INTEGER DEFAULT 0,
  annotations_count INTEGER DEFAULT 0,
  context           TEXT                    -- handoff context
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent  ON sessions(agent);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Evolution log: track pattern promotion/demotion/archive
CREATE TABLE IF NOT EXISTS evolution_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id TEXT NOT NULL,
  event       TEXT NOT NULL,              -- created|confidence_up|confidence_down|promoted|demoted|archived
  old_value   TEXT,
  new_value   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (annotation_id) REFERENCES annotations(id)
);

CREATE INDEX IF NOT EXISTS idx_evolution_annotation ON evolution_log(annotation_id);
```

### Types mới trong `src/types.ts`

```typescript
export type AnnotationKey =
  | 'note' | 'bug' | 'security' | 'architecture'
  | 'workflow' | 'test' | 'dependency' | 'refactor';

export interface Annotation {
  id: string;
  symbol: string;
  key: AnnotationKey;
  value: string;
  agent?: string;
  sessionId?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  agent: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  toolCallsCount: number;
  annotationsCount: number;
  context?: string;
}

export interface EvolutionEvent {
  id: number;
  annotationId: string;
  event: 'created' | 'confidence_up' | 'confidence_down' | 'promoted' | 'demoted' | 'archived';
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}
```

### MCP Tools mới

### M1 — `annotate({symbol, key, value, agent?, session_id?, confidence?})`

**Mô tả:** Ghi nhớ 1 observation về 1 symbol hoặc global pattern.

**Logic:**
1. Validate `key` nằm trong các giá trị hợp lệ
2. Nếu `symbol` + `key` đã tồn tại → update existing (tăng confidence +0.1 nếu trùng value)
3. Nếu mới → insert với confidence mặc định 0.5
4. Log event vào `evolution_log`
5. Nếu `session_id` được cung cấp → tăng `annotations_count` của session

**Cần làm:**
- [x] `src/store/annotations.ts` — class `AnnotationStore` với CRUD
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### M2 — `recall({symbol?, key?, agent?, limit?})`

**Mô tả:** Truy xuất annotations đã lưu, có filter.

**Logic:**
1. Query `annotations` table với các filter tùy chọn
2. Sắp xếp theo `confidence DESC, updated_at DESC`
3. Return list

**Cần làm:**
- [x] Method `queryAnnotations(filters)` trong `AnnotationStore`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### M3 — `session_start({agent})`

**Mô tả:** Bắt đầu 1 phiên làm việc mới.

**Logic:**
1. Tạo UUID cho session ID
2. INSERT vào `sessions` với status `active`
3. Return session ID cho các tool khác dùng

**Cần làm:**
- [x] Method `startSession(agent)` trong `AnnotationStore`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### M4 — `session_context({session_id})`

**Mô tả:** Lấy metadata của 1 phiên làm việc.

**Logic:**
1. Query session record
2. Query tất cả annotations trong session
3. Query tool_usage trong khoảng thời gian phiên
4. Return tổng hợp

**Cần làm:**
- [x] Method `getSessionContext(sessionId)` trong `AnnotationStore`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### M5 — `session_end({session_id, status?})`

**Mô tả:** Kết thúc phiên, lưu metadata.

**Logic:**
1. UPDATE session: set `ended_at`, `status`, `tool_calls_count` (từ tracking DB), `annotations_count`
2. Return summary

**Cần làm:**
- [x] Method `endSession(sessionId, status)` trong `AnnotationStore`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

### M6 — `handoff({from_session, to_agent, context})`

**Mô tả:** Chuyển giao context giữa các agent.

**Logic:**
1. Kết thúc `from_session`
2. Tạo session mới với `to_agent`, `status = active`
3. Copy `context` string vào session mới
4. Copy tất cả annotations từ from_session sang session mới (với session_id mới)
5. Trả về session ID mới + summary

**Cần làm:**
- [x] Method `handoff(fromSessionId, toAgent, context)` trong `AnnotationStore`
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

## Giai đoạn 3: Self-Learning Engine (target: 0.6.1)

### S1 — Confidence scoring system

**File:** `src/store/confidence.ts`

**Logic:**
- `boostConfidence(annotationId: string, increment?: number)`: Tăng confidence, log evolution event
- `decayConfidence(annotationId: string, decrement?: number)`: Giảm confidence (gọi khi pattern không gặp lại sau N ngày)
- `recalculateConfidence(symbol, key)`: Mỗi lần `annotate()` gọi cho cùng symbol+key → auto-boost 0.1 (max 1.0)
- `getStaleAnnotations(daysOld: number, confidenceThreshold: number)`: Tìm annotations cũ chưa được xác nhận lại

**Cần làm:**
- [x] File `src/store/confidence.ts`
- [x] Tích hợp vào `annotate()` flow

---

### S2 — Pattern promotion pipeline

**File:** `src/cli.ts` — thêm command `milens evolve`

**Logic:**
1. Query tất cả annotations với `confidence >= 0.8`
2. Gom nhóm theo `key` (bug, security, architecture, etc.)
3. Với mỗi nhóm:
   - Tạo content cho rule/skill file
   - Ghi vào `.agents/skills/` hoặc `.claude/rules/` tương ứng
   - Log event `promoted` vào `evolution_log`
4. Query annotations với `updated_at > 30 days` AND `confidence < 0.5` → flag để review
5. In báo cáo

**Output format:**
```
Milens Evolution Report:
  Promoted to rules:  3 patterns (security: 2, bug: 1)
  Flagged stale:      5 annotations (30+ days, low confidence)
  Archived:           2 annotations (90+ days, confidence < 0.3)
```

**Cần làm:**
- [x] Method `getPromotableAnnotations()` trong `AnnotationStore`
- [x] Method `getStaleAnnotations()` trong `AnnotationStore` (dùng confidence.ts)
- [x] Method `archiveAnnotation(id)` trong `AnnotationStore`
- [x] CLI command `evolve` trong `src/cli.ts`
- [x] Logic generate rule/skill file từ annotation content

---

### S3 — `find_similar({name})` (cần phase 2 của embeddings)

**Mô tả:** Tìm symbols tương tự dựa trên topological similarity (cùng callers/callees).

**Logic (fallback khi chưa có embeddings):**
1. Lấy incoming + outgoing links của target symbol
2. Tìm symbols khác có overlap ≥ 50% với link set của target
3. Score = Jaccard similarity giữa 2 link sets
4. Return top 5-10

**Cần làm:**
- [x] Method `findTopologicallySimilar(symbolId, limit)` trong `src/store/db.ts`
- [x] Đăng ký tool trong `src/server/mcp.ts`
- [x] (Dài hạn) Khi có `--embeddings` flag → dùng vector similarity

---

### S4 — `semantic_search({query})` (cần phase 2 của embeddings)

**Mô tả:** Tìm symbols theo ý nghĩa (không phải tên).

**Dependency:** Cần embedding model (all-MiniLM-L6-v2 hoặc tương tự) để tạo vector cho mỗi symbol từ name + signature + file path.

**??? khi chưa có embeddings:**
- [x] Fallback to FTS5 với query tokens
- [x] Báo lỗi "Embeddings not available. Run `milens analyze --embeddings` first."

**Cần làm (dài hạn, không ưu tiên giai đoạn này):**
- [x] Tích hợp embedding model (ONNX Runtime hoặc thư viện WASM)
- [x] Thêm bảng `symbol_embeddings` vào schema
- [x] Thêm phase 8 vào analyzer pipeline
- [x] Đăng ký tool trong `src/server/mcp.ts`

---

## Giai đoạn 4: Feedback Controller & Dashboard (target: 0.6.2)

### Các metrics cần compute

| Metric | Formula | Source data |
|--------|---------|-------------|
| **TER** (Token Efficiency Ratio) | Useful Tokens / Total Tokens | `tool_usage` table |
| **LR** (Learning Rate) | Savings Gained / Savings Possible | `tool_usage` (tokens_saved) |
| **CQI** (Code Quality Index) | 0.35×Coverage + 0.20×(1-DeadCode) + ... | Symbols + links + test metadata |
| **BRR** (Bug Recurrence Rate) | Recurring bugs / Total bugs fixed | `annotations` với key='bug', đếm confidence ≥ 0.7 |
| **TCGR** (Test Coverage Growth Rate) | ΔCoverage / week | `repo_meta` snapshots |
| **DCER** (Dead Code Elimination Rate) | Dead symbols / Total exported symbols | `find_dead_code()` |

### F1 — `milens metrics` CLI command

**Logic:**
1. Compute tất cả 6 metrics từ DB hiện tại
2. In bảng + trạng thái (Excellent/Good/Fair/Poor)
3. Nếu metric vượt threshold → in cảnh báo

**Cần làm:**
- [x] File `src/metrics.ts` với các hàm tính toán
- [x] Command `metrics` trong `src/cli.ts`

### F2 — Dashboard enrich

**New tab "Learning" trong dashboard:**
- Annotation count trend (line chart: by day)
- Confidence distribution (pie chart: 0.0-0.4 / 0.4-0.7 / 0.7-0.9 / 0.9-1.0)
- Top annotations (recent, high confidence)
- Session history (recent sessions with stats)
- Metrics summary (TER, BRR, TCGR, DCER)

**Cần làm:**
- [x] Cập nhật dashboard template/renderer (nếu dashboard là web-based)

---

## Thứ tự ưu tiên triển khai

```
TUẦN 1-2: GIAI ĐOẠN 1 — Review & Test Layer
  Ngày 1-2:   Schema migration (thêm annotations, sessions, evolution_log)
  Ngày 3-5:   R6 codebase_summary() + R2 review_symbol() + R3 test_coverage_gaps()
  Ngày 6-8:   R1 review_pr() + R4 test_impact()
  Ngày 9-10:  R5 test_plan()
  → Milestone: 25 MCP tools, phase Verify hoàn chỉnh

TUẦN 3-4: GIAI ĐOẠN 2 — Memory Layer
  Ngày 1-3:   AnnotationStore class + CRUD methods
  Ngày 4-6:   M1 annotate() + M2 recall() MCP tools
  Ngày 7-8:   M3 session_start() + M4 session_context() + M5 session_end()
  Ngày 9-10:  M6 handoff()
  → Milestone: 31 MCP tools, Memory layer hoạt động

TUẦN 5-6: GIAI ĐOẠN 3 — Self-Learning
  Ngày 1-3:   S1 Confidence scoring + decay
  Ngày 4-6:   S2 Pattern promotion pipeline + `milens evolve` CLI
  Ngày 7-9:   S3 find_similar() (topological fallback)
  Ngày 10:    Test end-to-end: annotate → promote → consume as skill
  → Milestone: 32 MCP tools, Self-learning engine hoạt động

TUẦN 7-8: GIAI ĐOẠN 4 — Metrics & Polish
  Ngày 1-3:   F1 Metrics computation + `milens metrics` CLI
  Ngày 4-6:   F2 Dashboard enrich (Learning tab)
  Ngày 7-8:   Integration tests cho toàn bộ closed-loop workflow
  Ngày 9-10:  Bug fixes + documentation
  → Milestone: 0.6.2 release, Closed-loop system hoàn chỉnh

DÀI HẠN (sau 0.6.2):
  - Embeddings support: semantic_search(), find_similar() với vector
  - Auto-promotion scheduler (CI/CD integration)
  - Sub-agent orchestration MCP prompts
  - Multi-repo annotations (cross-project knowledge sharing)
```

---

## File checklist khi triển khai

| File | Hành động | Giai đoạn |
|------|-----------|-----------|
| `src/store/schema.sql` | Thêm bảng `annotations`, `sessions`, `evolution_log` | GĐ1 |
| `src/types.ts` | Thêm types `Annotation`, `AnnotationKey`, `Session`, `EvolutionEvent` | GĐ1 |
| `src/store/db.ts` | Thêm methods: `getSymbolTestCoverage`, `getTestCoverageGaps`, `getTestImpact`, `getCodebaseSummary`, `findTopologicallySimilar` | GĐ1 |
| `src/store/annotations.ts` | **NEW** — class `AnnotationStore` với CRUD + query + confidence + session | GĐ2 |
| `src/store/confidence.ts` | **NEW** — confidence scoring, decay, stale detection | GĐ3 |
| `src/server/mcp.ts` | Register tools R1→R6, M1→M6, S3 | GĐ1-3 |
| `src/server/test-plan.ts` | **NEW** — Test plan generation logic | GĐ1 |
| `src/server/mcp-prompts.ts` | **NEW** — MCP prompts cho sub-agent orchestration | GĐ3 |
| `src/cli.ts` | Thêm command `evolve`, `metrics` | GĐ3-4 |
| `src/metrics.ts` | **NEW** — TER, LR, CQI, BRR, TCGR, DCER computation | GĐ4 |
| `test/unit/database.test.ts` | Thêm tests cho annotations CRUD, sessions, confidence | GĐ2-3 |
| `test/unit/mcp-tools.test.ts` | **NEW** — Integration tests cho MCP tool calls | GĐ4 |

---

## Tổng token savings dự kiến sau khi hoàn thành

| Giai đoạn | Công cụ mới | Token tiết kiệm dự kiến |
|-----------|-------------|------------------------|
| Sau GĐ1 | review_pr, test_coverage_gaps, test_impact, codebase_summary | ~40,000 token/phiên (↓30%) |
| Sau GĐ2 | annotate, recall, session_start, handoff | ~15,000 token/phiên (tránh lặp lại) |
| Sau GĐ3 | pattern promotion, find_similar | ~10,000 token/phiên (pattern reuse) |
| Sau GĐ4 | metrics feedback loop | ~5,000 token/phiên (continuous improvement) |
| **Tổng** | | **~70,000 token/phiên (~50% reduction)** |

---

## References

- `docs/ecc-milens-vibe-code.md` — Section 5 (Verification Loops), Section 8 (Sub-agent Orchestration), Section 10 (ECC→Milens mapping)
- `docs/closed-loop-ai-development.md` — Section 11 (System Components), Section 12 (Roadmap), Section 13 (Metrics), Phụ lục B (Annotation Schema), Phụ lục D (Migration Path)
- `src/store/schema.sql` — Current schema (symbols, links, file_hashes, tool_usage)
- `src/store/db.ts` — Current Database class with all query methods
- `src/server/mcp.ts` — Current 19 MCP tools + lazy DB + usage tracking
