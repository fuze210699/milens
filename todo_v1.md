# Milens — Vibe Coding Level 2 Action Plan

**Target:** Level 1.5 → Level 2 (autonomous execution loop)
**Started:** 2026-05-28 | **Estimated total:** ~80-100h across 4 phases

---

## Phase 1: Foundation Fixes (P0 — Critical)

### 1.1 Fix schema.sql → khớp annotations.ts
- **File:** `src/store/schema.sql`
- **Status:** `pending`
- **Effort:** 2h

**Schema hiện tại (sai):**
- `annotations.symbol_id` → annotations.ts dùng `symbol`
- Thiếu cột `confidence`
- Thiếu cột `updated_at`
- Bảng `agent_sessions` → annotations.ts dùng `sessions`
- `agent_sessions.context_json` → annotations.ts dùng `context`
- Thiếu cột `tool_calls_count`, `annotations_count` trong bảng `sessions`

**Cần làm:**
- [ ] Thêm cột `confidence REAL DEFAULT 0.5` vào `annotations`
- [ ] Thêm cột `updated_at TEXT NOT NULL DEFAULT (datetime('now'))` vào `annotations`
- [ ] Đổi `symbol_id` thành `symbol`
- [ ] Tạo bảng `sessions` thay cho / thêm vào `agent_sessions` với: `id`, `agent`, `status`, `started_at`, `ended_at`, `context`, `tool_calls_count`, `annotations_count`
- [ ] Viết migration script nếu cần (cho DB cũ đã tồn tại)
- [ ] Verify: chạy test suite → tất cả test pass

---

### 1.2 Wire hooks vào MCP server lifecycle
- **File:** `src/server/mcp.ts`
- **Status:** `pending`
- **Effort:** 4h

**Vấn đề:** `defaultOnSessionStart()`, `defaultOnSessionEnd()`, `defaultOnPreCommit()` đã được implement trong `src/server/hooks.ts` nhưng KHÔNG được gọi từ MCP server.

**Cần làm:**
- [ ] Trong tool `session_start`: gọi `defaultOnSessionStart(ctx, dbPath)` bổ sung vào response
- [ ] Trong tool `session_end`: gọi `defaultOnSessionEnd(ctx, dbPath)` bổ sung vào response
- [ ] Thêm MCP tool mới `pre_commit_check` gọi `defaultOnPreCommit(rootPath)`
- [ ] Xử lý lỗi: nếu hook function throw → vẫn trả về kết quả chính nhưng log warning
- [ ] Verify: gọi `session_start` → thấy codebase context trong output

---

### 1.3 Confidence boost on recall()
- **File:** `src/store/annotations.ts`
- **Status:** `pending`
- **Effort:** 1h

**Vấn đề:** Khi agent gọi `recall()`, confidence của annotation không tăng → hệ thống không "học" real-time.

**Cần làm:**
- [ ] Trong method `recall()`: sau khi lấy annotations, boost confidence +0.05 cho mỗi annotation được recall (tối đa 0.95)
- [ ] Update `evolution_log` với event `confidence_up`
- [ ] Chỉ boost khi confidence < 0.9 (tránh overflow > 1.0)
- [ ] Verify: unit test mới cho recall boost

---

### 1.4 Symbol-level diff detection
- **File:** `src/analyzer/`, `src/server/mcp.ts`
- **Status:** `pending`
- **Effort:** 8h

**Vấn đề:** `detect_changes()` dùng `git diff --name-only` → chỉ biết file nào thay đổi, không biết symbol nào thay đổi.

**Cần làm:**
- [ ] Tạo hash cho mỗi symbol: hash(name + kind + signature + startLine + endLine)
- [ ] Khi `detect_changes()` chạy: lấy diff files → parse → so sánh hash cũ/mới
- [ ] Chỉ báo cáo symbol thực sự thay đổi (không phải tất cả symbol trong file changed)
- [ ] Output: "symbol X signature changed: return type `User` → `UserDTO`"
- [ ] Verify: tạo test case với file có 2 symbol, chỉ sửa 1 → chỉ 1 bị báo cáo

---

### 1.5 Incremental per-file re-indexing
- **File:** `src/cli.ts`, `src/analyzer/index.ts`
- **Status:** `pending`
- **Effort:** 8h

**Vấn đề:** `milens watch` gọi `milens analyze --force` → index toàn bộ codebase mỗi lần có file change.

**Cần làm:**
- [ ] Thêm flag `--files <paths...>` vào `milens analyze`
- [ ] Khi có `--files`: chỉ scan + parse files được liệt kê
- [ ] Cross-file links: cập nhật links liên quan đến changed files, giữ nguyên links của unchanged files
- [ ] Cập nhật `milens watch` để gọi `analyze --files` thay vì `--force`
- [ ] Verify: benchmark — re-index 1 file trong project 100 files phải < 2s

---

## Phase 2: Orchestration Engine (P0 — Core)

### 2.1 Xây dựng Orchestrator class
- **File:** `src/orchestrator/orchestrator.ts` (mới)
- **Dependencies:** 1.2 (hooks), 1.5 (incremental re-index)
- **Status:** `pending`
- **Effort:** 16h

**Mục tiêu:** Class `Orchestrator` tự động chạy pipeline sau mỗi file change (có debounce).

**Cần làm:**
- [ ] Tạo interface `OrchestratorConfig`: `debounceMs`, `autoFix`, `maxIterations`, `rootPath`
- [ ] `subscribe(filePath: string)`: nhận file-change event
- [ ] `run()` flow sau debounce N ms:
  ```
  detect_changes()           → identify affected symbols
  review_pr()                → score risk
  Nếu hotspots found:
    impact() trên từng symbol
    test_plan() cho symbol chưa có test
    security_scan() trên changed files
  Nếu security findings → propose fixes
  find_dead_code()           → newly exposed dead symbols
  ```
- [ ] `report()`: structured report gửi về agent
- [ ] Log mỗi cycle vào `evolution_log`
- [ ] Unit test: mock file change → verify flow

---

### 2.2 Action plan reporter
- **File:** `src/orchestrator/reporter.ts` (mới)
- **Status:** `pending`
- **Effort:** 4h

**Mục tiêu:** Format output của orchestrator thành structured action plan cho agent.

**Cần làm:**
- [ ] Format template:
  ```
  --- Orchestrator Cycle #N ---
  Changed: 3 files, 12 symbols affected
  Risk: MEDIUM (score: 45)

  ❌ 3 HIGH risk symbols need tests. Generate? [Y/n]
    - createUser in src/services/auth.ts:142
    - deleteAccount in src/services/auth.ts:189
    - resetPassword in src/services/auth.ts:210

  ⚠️ 2 security issues found. Auto-fix? [Y/n]
    - [HIGH] hardcoded_secret in src/config.ts:5
    - [MEDIUM] console_log_prod in src/index.ts:88

  💀 1 dead symbol detected. Remove? [Y/n]
    - oldHelper in src/utils/deprecated.ts:12
  ```
- [ ] Support markdown format cho output
- [ ] Emoji chỉ dùng nếu config `useEmoji: true` (default: false)

---

### 2.3 Auto-fix mode (`--auto` flag)
- **File:** `src/cli.ts`, `src/orchestrator/orchestrator.ts`
- **Dependencies:** 2.1, 3.1 (fix_apply)
- **Status:** `pending`
- **Effort:** 4h

**Mục tiêu:** `milens orchestrate --auto` tự động áp dụng LOW/MEDIUM fixes mà không hỏi.

**Cần làm:**
- [ ] Thêm `autoFixLevel` config: `'none'` | `'low'` | `'medium'` | `'all'`
- [ ] Trong orchestrator: nếu finding severity <= autoFixLevel → tự động gọi `fix_apply`
- [ ] CRITICAL and HIGH always require confirmation (kể cả `--auto`)
- [ ] Rollback capability: lưu original content trước khi fix
- [ ] Verify: integration test — chạy `--auto` trên project mẫu có security issues

---

### 2.4 Regression detection (compare_impact tool)
- **File:** `src/orchestrator/compare.ts` (mới), `src/server/mcp.ts`
- **Status:** `pending`
- **Effort:** 6h

**Mục tiêu:** MCP tool `compare_impact` so sánh impact graph trước/sau edit.

**Cần làm:**
- [ ] Lưu snapshot: gọi `impact(target)` → lưu set of dependents + heat scores
- [ ] Sau edit: gọi lại `impact(target)` → compare
- [ ] Report differences:
  - "3 new dependents added"
  - "1 dependency removed"
  - "Heat score changed: 45 → 62"
- [ ] Tích hợp vào orchestrator: nếu impact tăng → cảnh báo
- [ ] MCP tool signature: `compare_impact({name, repo})` → trả về diff report

---

### 2.5 Re-verify loop
- **File:** `src/orchestrator/orchestrator.ts`
- **Dependencies:** 2.1
- **Status:** `pending`
- **Effort:** 4h

**Mục tiêu:** Sau khi fixes được apply → tự chạy lại review pipeline để verify.

**Cần làm:**
- [ ] `verify()` method trong orchestrator:
  ```
  detect_changes() → review_pr()
  If risk giảm → report "Risk decreased: HIGH → MEDIUM"
  If risk không đổi hoặc tăng → report + log warning
  ```
- [ ] Max 3 re-verify iterations (tránh infinite loop)
- [ ] Mỗi iteration log vào `evolution_log`

---

## Phase 3: Auto-Generation Tools (P1)

### 3.1 fix_apply MCP tool
- **File:** `src/server/mcp.ts`, `src/tools/fix-apply.ts` (mới)
- **Dependencies:** (none)
- **Status:** `pending`
- **Effort:** 8h

**Mục tiêu:** Tool nhận rule ID + file + line, đọc file, áp dụng fix suggestion.

**Cần làm:**
- [ ] Tool signature: `fix_apply({ruleId, file, line, repo})`
- [ ] Đọc file → tìm dòng match → thay thế bằng fix gợi ý từ rule
- [ ] Back up original: lưu file gốc vào `.milens/backups/` với timestamp
- [ ] CRITICAL rules → yêu cầu `confirm: true` parameter
- [ ] Sau khi fix → comment reference: `// milens(fix): rule=hardcoded_secret`
- [ ] Trả về: `{applied: true, file, line, ruleId, backupPath, diff}`
- [ ] Verify: integration test với file mẫu có secret

---

### 3.2 test_generate MCP tool
- **File:** `src/server/mcp.ts`, `src/tools/test-generate.ts` (mới)
- **Dependencies:** test_plan (đã có)
- **Status:** `pending`
- **Effort:** 12h

**Mục tiêu:** Đọc test_plan → detect test framework → generate test file.

**Cần làm:**
- [ ] Tool signature: `test_generate({symbol, repo})`
- [ ] Gọi `test_plan(symbol)` → lấy mock strategy + test scenarios
- [ ] Detect test framework từ codebase (Jest/Vitest/Mocha/pytest):
  - Check `package.json` → `devDependencies`
  - Check existing test file patterns
  - Fallback: Jest (phổ biến nhất)
- [ ] Generate test file:
  - Import symbol under test
  - Import mock dependencies theo mock strategy
  - 3+ test cases: happy path, edge case, error handling
  - Theo convention: `<filename>.test.ts` hoặc `__tests__/<filename>.ts`
- [ ] Không overwrite test file có sẵn → append vào cuối
- [ ] Verify: chạy generate → chạy test file đã generate (phải pass compile)

---

### 3.3 dead_code_remove sub-agent prompt
- **File:** `src/server/mcp.ts`
- **Dependencies:** find_dead_code (đã có)
- **Status:** `pending`
- **Effort:** 4h

**Mục tiêu:** Prompt mô tả workflow safe dead code removal.

**Cần làm:**
- [ ] Prompt: `dead_code_remove` với các bước:
  1. `find_dead_code()` → danh sách symbol không có incoming refs
  2. `context({name})` → xác nhận không bị dùng bởi template/config
  3. `grep({pattern: "symbolName"})` → tìm text references
  4. Nếu không có ref nào → xóa an toàn
  5. `verify:` chạy test suite để đảm bảo không break
- [ ] Không tự động xóa → luôn yêu cầu human confirm từng symbol

---

### 3.4 Auto-snapshot trước edit
- **File:** `src/orchestrator/snapshot.ts` (mới)
- **Dependencies:** 2.4
- **Status:** `pending`
- **Effort:** 6h

**Mục tiêu:** Tự động snapshot knowledge graph trước mỗi edit session.

**Cần làm:**
- [ ] Khi orchestrator detect sắp có edit: snapshot impact graph của affected symbols
- [ ] Lưu snapshot dạng JSON vào `.milens/snapshots/{timestamp}.json`
- [ ] Cleanup: giữ tối đa 10 snapshots gần nhất
- [ ] Compare với snapshot gần nhất khi có edit mới
- [ ] Nếu phát hiện regression → tự động propose revert

---

## Phase 4: Continuous Learning (P1)

### 4.1 Real-time confidence decay
- **File:** `src/store/confidence.ts`
- **Status:** `pending`
- **Effort:** 4h

**Vấn đề:** Confidence decay chỉ chạy khi `milens evolve` được trigger manual/cron.

**Cần làm:**
- [ ] Background tick: mỗi lần MCP tool được gọi, check nếu > 5 phút từ lần decay cuối → chạy decay pass nhẹ
- [ ] Decay logic: annotation > 30 ngày, confidence < 0.5 → giảm confidence * 0.8
- [ ] Bỏ qua annotation đã được recall/update trong 24h gần nhất
- [ ] Chỉ chạy decay nếu annotation store có > 100 records (tránh overhead cho project nhỏ)

---

### 4.2 Auto-promote confidence >= 0.8
- **File:** `src/store/evolve.ts` (mới)
- **Dependencies:** 4.1
- **Status:** `pending`
- **Effort:** 4h

**Mục tiêu:** Tự động promote annotation thành skill khi confidence đạt ngưỡng.

**Cần làm:**
- [ ] Trong confidence boost flow: nếu annotation.confidence >= 0.8 → trigger promote
- [ ] Promote action: tạo/write file vào `.agents/skills/milens-{key}/SKILL.md`
- [ ] Format SKILL.md: annotation value → permanent rule
- [ ] Log vào `evolution_log`: `promoted`
- [ ] Annotation gốc giữ lại với confidence = 1.0 (đã promote)

---

### 4.3 Historical metrics tracking
- **File:** `src/metrics/history.ts` (mới), `src/store/schema.sql`
- **Status:** `pending`
- **Effort:** 8h

**Vấn đề:** CQI, BRR, TCGR dùng hardcoded values.

**Cần làm:**
- [ ] Thêm bảng `metric_history` trong schema:
  ```
  id, metric_name, value, recorded_at
  ```
- [ ] Ghi metric snapshot sau mỗi session end hoặc orchestrator cycle
- [ ] Tính toán trend: so sánh metric hiện tại với 7/30 ngày trước
- [ ] Cập nhật `milens metrics` CLI để hiển thị trend (↑ ↓ →)
- [ ] Thay thế hardcoded values trong CQI bằng data thực tế

---

### 4.4 Deep hook integration (onFileChange, onPreCompact, onPostCompact)
- **File:** `src/server/mcp.ts`, `src/server/hooks.ts`
- **Dependencies:** 2.1 (orchestrator)
- **Status:** `pending`
- **Effort:** 8h

**Mục tiêu:** Wire các hook còn lại vào MCP server.

**Cần làm:**
- [ ] `onFileChange`: khi orchestrator nhận file-change → gọi `defaultOnFileChange()`
- [ ] `onPreCompact`: MCP tool `pre_compact_hook` → agent gọi trước khi compact context
- [ ] `onPostCompact`: MCP tool `post_compact_hook` → agent gọi sau khi compact
- [ ] `onFileChange` default action: detect_changes + review_pr trên changed files
- [ ] `onPreCompact` default action: snapshot current state
- [ ] `onPostCompact` default action: recall annotations để restore context
- [ ] Verify: integration test cho từng hook

---

## Execution Order & Dependencies

```
Phase 1 (P0 — Foundation)
├── 1.1 Fix schema.sql          ← START HERE (blocker: fresh install crash)
├── 1.2 Wire hooks              ← depends on 1.1
├── 1.3 Confidence boost        ← độc lập
├── 1.4 Symbol-level diff       ← độc lập, phụ thuộc 2.x
└── 1.5 Incremental re-index    ← độc lập

     ↓

Phase 2 (P0 — Orchestration)
├── 2.1 Orchestrator class      ← depends on 1.2, 1.5
├── 2.2 Reporter                 ← depends on 2.1
├── 2.3 Auto-fix mode           ← depends on 2.1, 3.1
├── 2.4 Compare impact          ← depends on 2.1
└── 2.5 Re-verify loop          ← depends on 2.1

     ↓

Phase 3 (P1 — Auto-Generation)
├── 3.1 fix_apply tool          ← độc lập
├── 3.2 test_generate tool      ← độc lập
├── 3.3 dead_code_remove prompt ← độc lập
└── 3.4 Auto-snapshot           ← depends on 2.4

     ↓

Phase 4 (P1 — Continuous Learning)
├── 4.1 Real-time decay         ← độc lập
├── 4.2 Auto-promote            ← depends on 4.1
├── 4.3 Historical metrics      ← depends on 2.1
└── 4.4 Deep hook integration   ← depends on 2.1
```

---

## Quick Wins (có thể làm song song)

Những task này có thể làm độc lập, không đợi task khác:

- `1.3` Confidence boost on recall (1h)
- `1.5` Incremental per-file re-indexing (8h)
- `3.1` fix_apply MCP tool (8h)
- `3.2` test_generate MCP tool (12h)
- `4.1` Real-time confidence decay (4h)
