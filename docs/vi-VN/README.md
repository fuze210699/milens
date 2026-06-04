<p align="center">
  <strong>Milens</strong><br>
  <em>AI-DOS — Hệ Điều Hành Cho Phát Triển Dựa Trên AI</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/milens"><img src="https://img.shields.io/npm/v/milens" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node"></a>
  <a href="https://github.com/fuze210699/milens/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <img src="https://img.shields.io/badge/tools-33-purple" alt="33 công cụ">
  <img src="https://img.shields.io/badge/prompts-6-orange" alt="6 prompt">
  <img src="https://img.shields.io/badge/security-50%2B-red" alt="50+ quy tắc">
  <img src="https://img.shields.io/badge/harnesses-7-lightgrey" alt="7 harness">
</p>

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">⭐ Star</a> ·
  <a href="https://github.com/sponsors/fuze210699">💖 Sponsor</a> ·
  <a href="https://github.com/fuze210699/milens/discussions">💬 Thảo Luận</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Pro $1/seat</a>
</p>

---

## Vấn Đề

AI coding agent rất mạnh mẽ — nhưng chúng không thực sự hiểu codebase của bạn.

**Điều gì xảy ra trong mỗi phiên làm việc:**

1. Agent sửa `UserService.validate()`
2. Không biết rằng có 47 hàm khác phụ thuộc vào kiểu trả về của nó
3. **Thay đổi gây lỗi được đưa lên production**

Vấn đề sâu xa hơn: các agent lãng phí **70% context window** chỉ để cố gắng hiểu codebase. Đọc từng file một. Grep để tìm tham chiếu. Truy vết chuỗi gọi thủ công. Mỗi phiên làm việc bắt đầu từ con số không — mọi phát hiện từ phiên trước đều biến mất.

Sau 10-20 phiên AI, codebase tích tụ dead code, các hub chưa được test, và các lỗ hổng bảo mật bị lãng quên. Agent ngày càng chậm hơn, lúng túng hơn, và tốn kém hơn — trong khi developer đốt token và kiên nhẫn.

---

## Không Có Milens vs Có Milens

| Tình Huống | Không Có Milens | Có Milens |
|---|---|---|
| **Hiểu một codebase mới** | Agent đọc 15 file một cách mù mờ (~30.000 token) | `codebase_summary()` — 500 token, tổng quan đầy đủ |
| **Sửa hàm an toàn** | Không biết thứ gì phụ thuộc vào nó. Hy vọng không gây lỗi. | `impact({target, depth: 3})` — phạm vi ảnh hưởng chính xác trước mỗi lần sửa |
| **Tìm tất cả tham chiếu** | Grep 5 lần, đọc 8 file, bỏ sót template | `context({name})` — tham chiếu đến + phụ thuộc đi, một lần gọi |
| **Review PR** | Đọc diff, đoán rủi ro, bỏ sót phụ thuộc ẩn | `review_pr()` — mọi symbol được chấm điểm CRITICAL/HIGH/MEDIUM/LOW |
| **Kiểm tra bảo mật** | 10 lần grep thủ công cho secrets, injection, unicode | `security_scan()` — 50 quy tắc, một lần gọi |
| **Bắt đầu phiên mới** | Không có ngữ cảnh. Học lại mọi thứ từ đầu. | `recall()` — agent ghi nhớ mọi bug, lưu ý, và pattern trong quá khứ |
| **Viết test** | Đoán cái gì cần test. Đoán cách mock. | `test_plan()` — chiến lược mock + 3 kịch bản + khoảng trống coverage xếp theo rủi ro |
| **Tìm dead code** | Tìm thủ công. "Cái này còn dùng không? Tôi không chắc." | `find_dead_code()` — mọi exported symbol không có tham chiếu |

**Tiết kiệm trung bình: ~70% token mỗi phiên. ~50% hoàn thành tác vụ nhanh hơn.**

---

## Milens Là Gì?

Milens cung cấp cho AI coding agent **khả năng hiểu code tức thì**. Thay vì đọc 15 file để hiểu codebase, agent của bạn gọi một công cụ và có được bức tranh toàn cảnh trong 500 token.

Nó xây dựng một **đồ thị tri thức** cho toàn bộ dự án — mọi hàm, class, import, lời gọi, và chuỗi kế thừa — sau đó phơi bày qua 33 công cụ MCP. Agent truy vấn đồ thị thay vì tìm kiếm file. Kết quả: **ít hơn 70% token** mỗi phiên, **không phụ thuộc bị hỏng**, và một hệ thống **học hỏi từ mỗi phiên làm việc**.

- **Phân tích một lần.** Tree-sitter phân tích 12 ngôn ngữ thành đồ thị tri thức SQLite.
- **Truy vấn tức thì.** FTS5 search, recursive CTE traversal, vector similarity — tất cả trong database.
- **Sửa an toàn.** Mọi công cụ trả về phạm vi ảnh hưởng trước khi bạn thay đổi bất cứ thứ gì.
- **Quét tự động.** 50+ quy tắc bảo mật chạy trong một lần gọi, không phải mười lần grep.
- **Học liên tục.** Annotation tồn tại xuyên suốt các phiên. Pattern tự động được thăng cấp thành quy tắc.

Hoàn toàn offline. Không telemetry. MCP server chỉ chạy localhost. Một lệnh để khởi tạo.

```
npx milens init --profile full
```

---

## Bắt Đầu Nhanh

```bash
npm install -g milens                     # cài đặt global
cd your-project
milens init --profile full --interactive   # khởi tạo mọi thứ
```

Một lệnh duy nhất đó phân tích codebase của bạn, xây dựng đồ thị tri thức, tạo `AGENTS.md`, cài đặt skill files, cấu hình quy tắc bảo mật, và thiết lập pre-commit hooks.

Sau đó kết nối editor của bạn:

**Điều kiện tiên quyết:** Cài milens global trên máy:
```bash
npm install -g milens      # cài một lần duy nhất
```

```json
// .vscode/mcp.json — VS Code / Copilot
{
  "servers": {
    "milens": {
      "type": "stdio",
      "command": "milens",
      "args": ["serve", "-p", "${workspaceFolder}"]
    }
  }
}
```

```bash
# Claude Code
claude mcp add milens -- milens serve -p .

# Cursor — .cursor/mcp.json
{ "mcpServers": { "milens": { "command": "milens", "args": ["serve", "-p", "${workspaceFolder}"] } } }

# OpenCode — opencode.json
{ "mcp": { "milens": { "type": "local", "command": ["milens", "serve", "-p", "."] } } }
```

Mở AI agent của bạn. Nó tự động tải `AGENTS.md` với ngữ cảnh codebase. Bạn đã sẵn sàng.

---

## Kiến Trúc

```
                         npx milens init
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         PHÂN TÍCH           TẠO               CẤU HÌNH
     tree-sitter parse     AGENTS.md         quy tắc bảo mật
     phân giải imports     skill files       pre-commit hooks
     xây dựng đồ thị      adapter packs     CI templates
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                        milens serve
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         33 CÔNG CỤ MCP   6 SUB-AGENT     50+ QUY TẮC
        query, impact,      PROMPTS         BẢO MẬT
        context, trace,   planner,         secrets, injection,
        review_pr, ...    reviewer, ...    unicode, crypto, ...
                               │
                               ▼
                         AI CODING AGENT
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
          CODE AN TOÀN    REVIEW TỰ ĐỘNG    HỌC LIÊN TỤC
        edit_check()     review_pr()      annotate → recall
        impact()         security_scan()  evolve → promote
```

### Ngăn Xếp Bốn Lớp

```
┌─────────────────────────────────────────────────────────┐
│  LỚP NỀN TẢNG                                           │
│  GitHub App · npm · 7 adapter packs · Desktop Dashboard │
│  Giá: Free / Pro ($1/seat)                │
├─────────────────────────────────────────────────────────┤
│  LỚP TỰ ĐỘNG HÓA                                        │
│  6 Hook (SessionStart, SessionEnd, PreCommit, ...)      │
│  Auto-annotate · Auto-recall · Watch mode               │
│  Scheduled evolve (cron/schtasks) · Pre-commit hooks    │
├─────────────────────────────────────────────────────────┤
│  LỚP QUY TRÌNH                                          │
│  6 Sub-agent Prompt (planner, reviewer, tester, ...)    │
│  6 Skill files · AGENTS.md auto-generator               │
│  Selective profiles (minimal/standard/full)             │
├─────────────────────────────────────────────────────────┤
│  LỚP THÔNG MINH                                         │
│  Đồ Thị Tri Thức (SQLite+FTS5) · 33 Công Cụ MCP         │
│  Bộ Nhớ (annotations+sessions) · Học (confidence)       │
│  50+ Quy Tắc Bảo Mật (OWASP) · 7 Chỉ Số (TER, CQI, ...)│
└─────────────────────────────────────────────────────────┘
```

### Pipeline

| Giai Đoạn | Điều Gì Xảy Ra | Công Nghệ |
|---|---|---|
| **Quét** | Phát hiện file nguồn theo phần mở rộng | Node.js `fs` |
| **Phân Tích** | Trích xuất symbol, import, lời gọi, kế thừa | tree-sitter WASM (12 ngôn ngữ) |
| **Phân Giải** | Khớp import với file, lời gọi với định nghĩa | Cross-file linker |
| **Làm Giàu** | Tính toán role, heat score, domain cluster | Union-find + PageRank-like |
| **Lưu Trữ** | Lưu mọi thứ vào SQLite | better-sqlite3 + FTS5 |
| **Phục Vụ** | Phơi bày qua giao thức MCP | stdio + StreamableHTTP |
| **Học** | Annotate → confidence score → promote → skill | SQLite + evolution log |
| **Quét** | 50+ quy tắc regex trên tất cả file | Built-in security engine |

### Nguyên Tắc Thiết Kế

| Nguyên Tắc | Triển Khai |
|---|---|
| **Phân tích một lần, truy vấn vô hạn** | Đồ thị tri thức được tính toán trước tại thời điểm phân tích |
| **Không mạng** | Mọi thứ offline. Không gọi API. Không telemetry. |
| **Token-compact** | Định dạng `name [kind] file:line` tiết kiệm 40-60% token |
| **Gia tăng** | SHA-256 file hashing. Chỉ phân tích lại file đã thay đổi. |
| **Duyệt trong database** | Recursive CTE cho truy vấn đồ thị. Không tải toàn bộ đồ thị vào bộ nhớ. |
| **Chỉ localhost** | HTTP bind 127.0.0.1. Không phơi bày ra mạng. |
| **Chuẩn MCP** | Hoạt động với mọi agent tương thích MCP. Không vendor lock-in. |

---

## Công Cụ MCP (33)

### Tìm Kiếm & Điều Hướng

| Công Cụ | Chức Năng |
|---|---|
| `query` | Tìm kiếm toàn văn FTS5 cho định nghĩa symbol |
| `grep` | Tìm kiếm regex trên TẤT CẢ file dự án (code, config, docs, template) |
| `context` | Góc nhìn 360°: ai gọi cái này + cái này phụ thuộc vào gì |
| `get_file_symbols` | Mọi symbol trong một file với số lượng ref/dep |
| `get_type_hierarchy` | Cây kế thừa đầy đủ — tổ tiên + hậu duệ |

### An Toàn & Ảnh Hưởng

| Công Cụ | Chức Năng |
|---|---|
| `impact` | Phạm vi ảnh hưởng: duyệt độ sâu 1-3 hiển thị thứ gì sẽ hỏng |
| `edit_check` | Kiểm tra an toàn trước khi sửa: caller, re-export, test coverage, cảnh báo |
| `detect_changes` | Git diff → symbol nào thay đổi + dependents của chúng |
| `find_dead_code` | Exported symbol không có tham chiếu đến |
| `overview` | context + impact + grep kết hợp trong một lần gọi |

### Hiểu Code

| Công Cụ | Chức Năng |
|---|---|
| `smart_context` | Ngữ cảnh theo ý định: `edit` / `debug` / `test` / `understand` |
| `trace` | Đường dẫn thực thi đầy đủ từ entrypoint đến mục tiêu (hoặc ngược lại) |
| `routes` | Tự động phát hiện API endpoint trên 11 framework |
| `explain_relationship` | Chuỗi phụ thuộc ngắn nhất giữa hai symbol bất kỳ |
| `domains` | Cụm module dựa trên đồ thị phụ thuộc cross-file |

### Review & Testing

| Công Cụ | Chức Năng |
|---|---|
| `review_pr` | Chấm điểm mọi symbol thay đổi CRITICAL/HIGH/MEDIUM/LOW |
| `review_symbol` | Phân tích chuyên sâu: role, heat, dependent, trạng thái test, khuyến nghị |
| `codebase_summary` | Tổng quan ~500 token để khởi tạo phiên |
| `test_plan` | Chiến lược mock + 3+ kịch bản test dựa trên phụ thuộc |
| `test_coverage_gaps` | Symbol chưa được test xếp theo rủi ro |
| `test_impact` | Ánh xạ code thay đổi → file test nào cần chạy |

### Bộ Nhớ & Phiên Làm Việc

| Công Cụ | Chức Năng |
|---|---|
| `annotate` | Lưu ghi chú về một symbol (tồn tại vĩnh viễn) |
| `recall` | Truy xuất annotation cũ theo symbol, key, agent, hoặc phiên |
| `session_start` | Bắt đầu phiên mới với danh tính agent |
| `session_context` | Metadata phiên + lệnh gọi công cụ + annotation |
| `session_end` | Đóng phiên, ghi lại thống kê |
| `handoff` | Chuyển toàn bộ ngữ cảnh từ phiên agent này sang phiên khác |

### Bảo Mật

| Công Cụ | Chức Năng |
|---|---|
| `security_scan` | **50+ quy tắc trong một lần gọi.** Phạm vi: secrets, injection, unicode, dangerous, config, data-leak, crypto, auth, file-access |

### Tổng Quan & Tương Đồng

| Công Cụ | Chức Năng |
|---|---|
| `status` | Thống kê index, % test coverage, độ chính xác liên kết |
| `repos` | Liệt kê tất cả repository đã được index |
| `semantic_search` | Tìm kiếm symbol theo ngữ nghĩa (FTS5 + vector hybrid) |
| `find_similar` | Symbol có chung caller/callee (tương đồng topology) |

### Developer

| Công Cụ | Chức Năng |
|---|---|
| `ast_explore` | Phân tích đoạn code → cây AST S-expression |
| `test_query` | Kiểm tra tree-sitter query với code |

---

## Ví Dụ Đầu Ra Công Cụ

### Context — Góc Nhìn Symbol 360°

```
context({name: "AuthService"})

AuthService [class] src/auth.ts:15 (exported)
role: hub | heat: 0.85

incoming (3):
  calls: handleLogin [function] src/routes.ts:23
  calls: UserController [class] src/controllers/user.ts:8
  imports: authRouter [variable] src/routes.ts:1

outgoing (3):
  imports: User [class] src/models.ts:5
  calls: hashPassword [function] src/auth.ts:3
  calls: createUser [function] src/models.ts:42
```

### Impact — Phạm Vi Ảnh Hưởng

```
impact({target: "createUser", direction: "upstream", depth: 3})

TARGET: createUser [function] src/models.ts:42

  [depth 1] SẼ HỎNG:
    AuthService [class] src/auth.ts:15 (calls)
    UserController [class] src/controllers/user.ts:8 (calls)

  [depth 2] CÓ KHẢ NĂNG BỊ ẢNH HƯỞNG:
    handleLogin [function] src/routes.ts:23 (calls)
    handleRegister [function] src/routes.ts:45 (calls)

  [depth 3] CÓ THỂ CẦN TEST:
    authRouter [variable] src/routes.ts:1 (imports)
    adminDashboard [function] src/admin.ts:10 (calls)

5 dependent trên 3 độ sâu
```

### Review PR — Đánh Giá Rủi Ro

```
review_pr({})

PR Risk Assessment (vs HEAD):
  6 file thay đổi, 12 symbol bị ảnh hưởng

  handlePayment [function] src/payment.ts:30 — heat:92 deps:15 test:no → CRITICAL(85)
  checkoutRoute [function] src/routes/checkout.ts:5 — heat:78 deps:8 test:yes → HIGH(58)
  UserModel [class] src/models.ts:20 — heat:65 deps:3 test:yes → MEDIUM(35)
  formatCurrency [function] src/utils.ts:45 — heat:10 deps:0 test:no → LOW(15)

Tổng kết: CRITICAL=1 HIGH=2 MEDIUM=4 LOW=5
```

### Security Scan — 50 Quy Tắc Cùng Lúc

```
security_scan({scope: "all", severity: "HIGH"})

{
  "summary": {
    "totalScanned": 1240,
    "findings": 8,
    "bySeverity": { "CRITICAL": 1, "HIGH": 3, "MEDIUM": 4 },
    "score": 78
  },
  "findings": [
    {
      "ruleId": "SEC-001",
      "category": "secrets",
      "severity": "CRITICAL",
      "owasp": "A02:2021",
      "file": "src/config.ts",
      "line": 15,
      "match": "password = 'admin123'",
      "fix": "Chuyển sang biến môi trường: process.env.DB_PASSWORD"
    },
    {
      "ruleId": "SEC-011",
      "category": "injection",
      "severity": "HIGH",
      "owasp": "A03:2021",
      "file": "src/routes/admin.ts",
      "line": 42,
      "match": "eval(userInput)",
      "fix": "Thay eval() bằng parser hoặc validator an toàn"
    }
  ]
}
```

---

## Sub-agent Prompts (6)

Thay vì nối chuỗi 5-10 công cụ thủ công, agent của bạn gọi một prompt:

| Prompt | Đầu Vào | Quy Trình |
|---|---|---|
| `milens-planner` | Mô tả tính năng | Nghiên cứu → Phân tích Mục tiêu → Dự đoán Ảnh hưởng → Lập kế hoạch Test → **Kế Hoạch Triển Khai** |
| `milens-reviewer` | Mô tả thay đổi | Quét PR → Phân tích sâu Symbol → Tìm Dead Code → Tìm kiếm Văn bản → **Báo Cáo Review** |
| `milens-tester` | Tên symbol | Tìm Khoảng trống → Tạo Kế hoạch → Triển khai → Xác minh → **Báo Cáo Coverage** |
| `milens-architect` | (không) | Tổng quan → Domain → Route → Kế thừa → Kết nối → **Phân Tích Kiến Trúc** |
| `milens-security` | (không) | Quét PR → Secrets → Unicode → Dangerous → Data Leak → **Kiểm Toán Bảo Mật** |
| `milens-debugger` | Mục tiêu + lỗi | Context → Trace Execution → Impact → Tìm Mối Quan Hệ → **Phân Tích Nguyên Nhân Gốc** |

---

## Lệnh CLI

```
milens init [--profile minimal|standard|full] [--interactive]    Khởi tạo dự án
milens analyze [-p .] [--force] [--skills] [--embeddings]        Index codebase
milens serve [-p .] [--http] [--port 3100] [--profile minimal]   Khởi động MCP server
milens workflow <name>                                            Chạy pipeline định sẵn
milens security scan [--scope secrets] [--severity HIGH]          Kiểm tra bảo mật
milens security deps                                              Kiểm tra CVE phụ thuộc
milens hooks enable|disable|list|profile                          Quản lý tự động hóa
milens watch [--debounce 2000]                                    Tự động re-index khi thay đổi
milens evolve [--schedule install|uninstall|status]               Thăng cấp pattern đã học
milens metrics                                                    TER, CQI, BRR, CTR...
milens search <query> [--limit 50]                                Tìm symbol
milens inspect <symbol>                                           Phụ thuộc đến + đi
milens impact <symbol> [-d downstream] [--depth 2]                Phạm vi ảnh hưởng
milens status [-p .]                                              Sức khỏe index
milens list                                                       Tất cả repo đã index
milens clean [-p .] [--all]                                       Xóa index
milens dashboard [--port 8080]                                    Phân tích sử dụng
```

### Ví Dụ Workflow

```bash
milens workflow tdd                          # Tìm khoảng trống test → lập kế hoạch → xác minh
milens workflow review                       # PR review → điểm rủi ro → dead code
milens workflow plan "Thêm Stripe billing"   # Kế hoạch triển khai đầy đủ
milens workflow onboard                      # Danh sách khởi động phiên
milens workflow security-scan                # Tất cả 50 quy tắc cùng lúc
```

### Lựa Chọn Profile

Kiểm soát số lượng công cụ hoạt động để tối ưu chi phí token:

```bash
MILENS_PROFILE=minimal milens serve          # 10 công cụ — ~500 token chi phí
MILENS_PROFILE=standard milens serve         # 25 công cụ — lập trình hàng ngày đầy đủ
milens serve --profile full                  # 33 công cụ — mọi thứ
```

---

## Bảo Mật (50+ Quy Tắc)

Tất cả 50 quy tắc ánh xạ tới **OWASP Top 10 (2021)**. Một lần gọi công cụ thay thế cho 10 lần grep thủ công.

| Danh Mục | Quy Tắc | Phát Hiện |
|---|---|---|
| **secrets** | 10 | AWS keys, GitHub tokens, OpenAI keys, private keys, mật khẩu cứng |
| **injection** | 9 | SQL injection, XSS, command injection, `eval()`, `exec()`, DOM nguy hiểm |
| **unicode** | 4 | Ký tự zero-width, bidi override, tấn công homoglyph |
| **dangerous** | 7 | `os.system`, `subprocess shell`, deserialization không an toàn, `spawn shell` |
| **config** | 5 | CORS wildcard, cookie không an toàn, chế độ debug, `--dangerously-skip-permissions` |
| **data-leak** | 5 | `console.log` secrets, URL cứng |
| **crypto** | 4 | MD5, SHA1, `Math.random()` cho crypto, salt/IV cứng |
| **auth** | 4 | So sánh chuỗi, thiếu middleware, JWT không có hạn, session trong URL |
| **file-access** | 2 | Path traversal, đọc file không an toàn |

```bash
milens security scan --scope secrets --severity HIGH --format json
milens security deps                    # Kiểm tra CVE offline (34 lỗ hổng đã biết, 5 hệ sinh thái)
```

Từ AI agent: `security_scan({scope: "all", severity: "HIGH"})`

---

## Hệ Thống Hook (6 Trigger)

Tự động hóa để agent của bạn không bao giờ quên:

| Hook | Khi Nào | Hành Động Mặc Định |
|---|---|---|
| `onSessionStart` | Agent bắt đầu làm việc | Làm mới index + codebase_summary + recall cảnh báo cũ |
| `onSessionEnd` | Agent kết thúc | detect_changes + review_pr + auto-annotate symbol đã thay đổi |
| `onPreCommit` | Trước `git commit` | detect_changes + review_pr + find_dead_code |
| `onFileChange` | File bị sửa | Phân tích lại file đã thay đổi + impact lên symbol bị ảnh hưởng |
| `onPreCompact` | Trước khi context window bị nén | Lưu snapshot codebase_summary |
| `onPostCompact` | Sau khi nén | recall annotation để khôi phục ngữ cảnh đã mất |

```bash
milens hooks enable                          # Bật tất cả hook
milens hooks profile standard                # Cài sẵn: SessionStart, SessionEnd, PreCommit
milens hooks disable --hook preCommit        # Tắt một hook
```

---

## Học Hỏi & Tiến Hóa

Hệ thống ngày càng thông minh hơn qua mỗi phiên:

```
PHIÊN 1:  Agent tìm thấy bug trong createUser()
          → annotate({symbol: "createUser", key: "bug", value: "Gọi createUser() trước normalizeEmail()"})
          → confidence: 0.5

PHIÊN 2:  Agent tự động recall annotation
          → "Tôi biết createUser() có một vấn đề đã biết. Tôi sẽ xử lý đúng thứ tự."
          → Bug được tránh. confidence ↑ 0.7

PHIÊN 5:  Confidence đạt 0.9
          → milens evolve thăng cấp thành .agents/skills/milens-bug/SKILL.md
          → Giờ được thực thi như một quy tắc cho mọi phiên sau
```

```bash
milens evolve                           # Thăng cấp pattern có confidence cao ngay bây giờ
milens evolve --schedule install        # Tự động chạy hàng tuần (cron/schtasks)
```

---

## Ngôn Ngữ Hỗ Trợ

12 ngôn ngữ thông qua tree-sitter:

| Ngôn Ngữ | File | Import | Lời Gọi | Kế Thừa |
|---|---|---|---|---|
| TypeScript | `.ts` `.tsx` | ESM + CJS + decorators | ✓ + decorators | extends / implements |
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` | ESM + CJS | ✓ | extends |
| Python | `.py` | import + relative | ✓ + decorators | extends |
| Java | `.java` | import + static | ✓ + annotations | extends / implements |
| Go | `.go` | import + go.mod | ✓ | embedding |
| Rust | `.rs` | use | ✓ + macros | trait impl |
| PHP | `.php` | use + include | ✓ + static, new | extends + traits |
| Ruby | `.rb` | require | ✓ | extends |
| Vue | `.vue` | ESM | ✓ template refs | extends |
| HTML | `.html` `.htm` | `<script src>` `<link>` | ✓ inline | — |
| CSS | `.css` | `@import` | — | — |
| Markdown | `.md` `.mdx` | local `[links]()` | — | heading như section |

**Phát hiện framework** (qua `routes()`)**: Express, FastAPI, NestJS, Flask, Django, Go net/http, Gin, PHP Laravel, Rails, Sinatra, Spring.

---

## Hỗ Trợ Editor & Harness

Milens hoạt động với mọi agent tương thích MCP. Hai cách sử dụng:

| | MCP Server | CLI |
|---|---|---|
| **Là gì** | Công cụ thời gian thực cho AI agent trong lúc lập trình | Lệnh trực tiếp từ terminal |
| **Dành cho** | Phát triển hàng ngày với AI agent | Script, CI/CD, phân tích một lần |
| **Cài đặt** | Thêm MCP config vào editor | `npm install -g milens` |
| **Công cụ** | Tất cả 33 công cụ + 6 prompt | Bộ lệnh CLI đầy đủ |
| **Ví dụ** | Agent gọi `impact()` trước khi sửa | `milens security scan --scope secrets` |

**Harness adapter có sẵn cho 7 editor:**

| Harness | File Cấu Hình | Profile Khuyến Nghị |
|---|---|---|
| **Claude Code** | `.claude/mcp.json` | standard (25 công cụ) |
| **OpenCode** | `.opencode/config.json` | standard |
| **VS Code / Copilot** | `.vscode/mcp.json` | standard |
| **Cursor** | `.cursorrules` | standard |
| **Codex** | `.codex/codex.md` | standard |
| **Gemini** | `.gemini/context.md` | minimal (10 công cụ) |
| **Zed** | `.zed/settings.json` | minimal |

Mỗi adapter nằm trong thư mục `adapters/` với file cấu hình sẵn sàng để sao chép và hướng dẫn cho agent.

---

## Chỉ Số

Bảy chỉ số định lượng cho phát triển dựa trên AI:

```
$ milens metrics

╔══════════════════════════════════════════════╗
║         Báo Cáo Chỉ Số Milens               ║
╠══════════════════════════════════════════════╣
║ TER:   Tỷ Lệ Hiệu Quả Token          0.85    ║
║ LR:    Tỷ Lệ Học                     0.59    ║
║ CQI:   Chỉ Số Chất Lượng Code        7.2/10  ║
║ BRR:   Tỷ Lệ Bug Tái Diễn            8%      ║
║ TCGR:  Tỷ Lệ Tăng Trưởng Coverage    5.2%/tuần║
║ DCER:  Tỷ Lệ Loại Bỏ Dead Code       3%      ║
║ CTR:   Giảm Thời Gian Chu Kỳ         67%     ║
╚══════════════════════════════════════════════╝
```

| Chỉ Số | Tên Đầy Đủ | Theo Dõi Gì |
|---|---|---|
| **TER** | Token Efficiency Ratio | Token hữu ích ÷ tổng token |
| **LR** | Learning Rate | Tiết kiệm đạt được ÷ tiết kiệm có thể |
| **CQI** | Code Quality Index | Coverage + bảo mật + coupling + tài liệu |
| **BRR** | Bug Recurrence Rate | Bug lặp lại ÷ tổng đã sửa |
| **TCGR** | Test Coverage Growth Rate | Cải thiện coverage hàng tuần |
| **DCER** | Dead Code Elimination Rate | Dead symbol ÷ tổng exported |
| **CTR** | Cycle Time Reduction | Thời gian tiết kiệm so với cách thủ công |

---

## Bảo Mật & Quyền Riêng Tư

**Không mạng. Không telemetry. Không dữ liệu rời khỏi máy của bạn.**

| Lớp | Đảm Bảo |
|---|---|
| **Dữ liệu** | Index lưu trong `.milens/` mỗi repo (đã gitignore). Không có source code trong registry. |
| **Mạng** | HTTP chỉ bind `127.0.0.1`. Không có kết nối ra ngoài. |
| **Đầu vào** | User regex được kiểm tra ReDoS. FTS5 token được quote như literal. |
| **Truy cập file** | Mọi đường dẫn bị giới hạn trong thư mục gốc của repo. Không thể traversal. |
| **Git** | `execFileSync` với mảng đối số. Không shell interpolation. |
| **Embedding** | Tùy chọn. Tạo cục bộ qua Xenova transformers. Không gọi API. |

---

## Giá

| Gói | Giá | Tính Năng Chính |
|---|---|---|
| **Free** | $0 | Tất cả 33 công cụ, repo công khai, 50+ quy tắc bảo mật, CLI, hỗ trợ cộng đồng. MIT core. |
| **Pro** | $1/seat/tháng | Repo riêng tư, GitHub App, quét nâng cao, hỗ trợ ưu tiên, skill tùy chỉnh |


OSS miễn phí mãi mãi. [Chi tiết giá →](docs/pricing.md)

---

## Có Gì Mới Trong v0.7.0

- **6 Sub-agent MCP Prompt** — planner, reviewer, tester, architect, security-auditor, debugger. Một prompt thay thế 5-10 lần gọi công cụ nối chuỗi.
- **50+ Quy Tắc Bảo Mật Tích Hợp** — Ánh xạ OWASP Top 10. `security_scan()` thay thế 10 lần grep thủ công. Kiểm tra phụ thuộc cho 5 hệ sinh thái.
- **Hệ Thống Hook** — 6 trigger sự kiện (SessionStart, SessionEnd, PreCommit, FileChange, PreCompact, PostCompact). Auto-annotate, auto-recall.
- **`milens init`** — Khởi tạo một lệnh: phân tích + AGENTS.md + skill files + quy tắc bảo mật + pre-commit hooks.
- **`milens workflow`** — 7 pipeline định sẵn: tdd, review, plan, security-scan, refactor, onboard, handoff.
- **Selective Profile** — `minimal` (10 công cụ), `standard` (25), `full` (33). Kiểm soát chi phí token.
- **Watch Mode** — Tự động re-index khi file thay đổi. `milens watch`.
- **Scheduled Evolve** — Tự động thăng cấp pattern có confidence cao thành skill. `milens evolve --schedule install`.
- **7 Harness Adapter** — Claude Code, OpenCode, Codex, Cursor, Copilot, Gemini, Zed.
- **GitHub App** — Ứng dụng dựa trên Probot để tự động review PR và `/milens analyze` trên repo.
- **Desktop Dashboard** — Ứng dụng desktop Electron với 6 tab (Overview, Domains, Learning, Metrics, Security, Settings).
- **Interactive Installer** — `milens init --interactive` hướng dẫn từng bước qua mọi tùy chọn.

[Xem đầy đủ changelog →](https://github.com/fuze210699/milens/releases)

---

## Biến Môi Trường

| Biến | Mặc Định | Hiệu Ứng |
|---|---|---|
| `MILENS_PROFILE` | (không đặt = full) | Bộ công cụ: `minimal` (10 công cụ), `standard` (25), `full` (33) |
| `MILENS_VERSION` | (từ package.json) | Ghi đè phiên bản báo cáo trong metadata MCP server |

Sử dụng trong MCP config:
```json
{
  "mcpServers": {
    "milens": {
      "command": "milens",
      "args": ["serve", "-p", "${workspaceFolder}"],
      "env": { "MILENS_PROFILE": "standard" }
    }
  }
}
```

Hoặc từ CLI:
```bash
MILENS_PROFILE=minimal milens serve
```

---

## Phát Triển

```bash
git clone https://github.com/fuze210699/milens.git
cd milens
npm install
npm run build          # tsc → dist/
npm test               # vitest (136 tests)
npm run lint           # tsc --noEmit
npm run self-analyze   # Index milens bằng milens
npm run self-serve     # Khởi động MCP trên cổng 3100
```

**Tech Stack:** TypeScript (ESM) · tree-sitter (WASM) · SQLite (better-sqlite3 + FTS5) · MCP SDK · Vitest · Commander

---

## Giấy Phép

Phần lõi (analyzer, parser, store, CLI, các công cụ MCP): **MIT License**
Tính năng nâng cao (GitHub App, enterprise): Commercial license
Xem [LICENSE](LICENSE) để biết chi tiết.

---

<p align="center">
  <a href="https://github.com/fuze210699/milens">GitHub</a> ·
  <a href="https://github.com/fuze210699/milens/tree/main/docs">Tài Liệu</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/docs/pricing.md">Giá</a> ·
  <a href="https://github.com/fuze210699/milens/blob/main/CONTRIBUTING.md">Đóng Góp</a>
</p>
