# Milens — Lightweight Code Intelligence Platform

> Bản clone nhẹ của GitNexus, tối ưu cho stack: **Vue, React, PHP, Node.js**

## 1. Tổng quan

### 1.1 GitNexus làm gì?

GitNexus phân tích mã nguồn → xây dựng **đồ thị tri thức (knowledge graph)** chứa tất cả symbol (function, class, method…) và quan hệ giữa chúng (CALLS, IMPORTS, EXTENDS…) → phục vụ truy vấn cho AI agent và developer qua CLI/MCP/Web UI.

### 1.2 Tại sao cần clone nhẹ hơn?

| GitNexus | Milens (clone) |
|----------|-----------------|
| 14+ ngôn ngữ (Tree-sitter native bindings) | 4 ngôn ngữ: JS/TS, Vue, PHP, Node.js |
| LadybugDB (embedded graph DB, native addon) | SQLite (zero-dependency, dễ deploy) |
| 14 phase pipeline phức tạp | 6 phase pipeline đơn giản hóa |
| Community detection (Leiden algorithm) | Skip v1, thêm sau |
| Embeddings (HuggingFace + ONNX) | Skip v1, thêm sau |
| Multi-repo group analysis | Skip v1, single repo |
| WASM browser runtime | Skip v1, server-only |
| ~3300 symbols, ~8000 relationships schema | Schema tối giản ~10 node types, ~8 edge types |

### 1.3 Mục tiêu MVP

- Phân tích codebase Vue/React/PHP/Node.js trong < 30 giây (repo 500 files)
- Trả lời: "Function X được gọi từ đâu?", "Thay đổi X ảnh hưởng gì?"
- Tích hợp AI agent qua MCP protocol
- CLI đơn giản: `Milens analyze`, `Milens query`, `Milens context`, `Milens impact`

---

## 2. Kiến trúc tổng thể

```
Milens/
├── src/
│   ├── cli/                  # CLI commands (Commander.js)
│   │   ├── index.ts          # Entry point
│   │   ├── analyze.ts        # Milens analyze
│   │   ├── query.ts          # Milens query "search term"
│   │   ├── context.ts        # Milens context <symbol>
│   │   ├── impact.ts         # Milens impact <symbol>
│   │   └── serve.ts          # Milens serve (MCP server)
│   │
│   ├── core/
│   │   ├── pipeline/         # Pipeline phân tích
│   │   │   ├── pipeline.ts           # Orchestrator chính
│   │   │   ├── scanner.ts            # Phase 1: Scan files
│   │   │   ├── structure-builder.ts  # Phase 2: File/Folder nodes
│   │   │   ├── parser.ts             # Phase 3: Tree-sitter parse
│   │   │   ├── import-resolver.ts    # Phase 4: Import resolution
│   │   │   ├── call-resolver.ts      # Phase 5: Call resolution
│   │   │   └── post-process.ts       # Phase 6: Index building
│   │   │
│   │   ├── graph/            # In-memory knowledge graph
│   │   │   ├── graph.ts              # KnowledgeGraph class
│   │   │   ├── node.ts               # GraphNode types
│   │   │   └── relationship.ts       # GraphRelationship types
│   │   │
│   │   ├── symbols/          # Symbol table & resolution
│   │   │   ├── symbol-table.ts       # Symbol registry
│   │   │   └── resolution-context.ts # 3-tier resolution
│   │   │
│   │   ├── parsers/          # Language-specific providers
│   │   │   ├── provider.ts           # LanguageProvider interface
│   │   │   ├── javascript.ts         # JS/TS/JSX/TSX
│   │   │   ├── vue.ts                # Vue SFC (.vue)
│   │   │   └── php.ts                # PHP
│   │   │
│   │   ├── search/           # Search engine
│   │   │   └── search.ts            # FTS via SQLite
│   │   │
│   │   └── tree-sitter/      # Parser loader
│   │       └── loader.ts            # Load tree-sitter grammars
│   │
│   ├── storage/              # Persistence layer
│   │   ├── sqlite-adapter.ts         # SQLite read/write
│   │   ├── schema.sql                # DDL for tables
│   │   └── repo-manager.ts           # Registry quản lý repos
│   │
│   ├── mcp/                  # MCP server
│   │   ├── server.ts                 # MCP protocol handler
│   │   ├── tools.ts                  # Tool definitions
│   │   └── resources.ts              # Resource definitions
│   │
│   └── types/                # Shared types
│       ├── graph.ts
│       └── pipeline.ts
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Tech Stack

| Layer | Công nghệ | Lý do chọn |
|-------|-----------|------------|
| **Language** | TypeScript (ES2022, NodeNext) | Tương thích ecosystem, type safety |
| **Runtime** | Node.js >= 20 | Stable LTS, native ESM |
| **Parsing** | Tree-sitter (`tree-sitter` + wasm bindings) | Chính xác, nhanh, incremental |
| **Database** | SQLite (`better-sqlite3`) | Zero-config, embedded, FTS5 built-in |
| **CLI** | Commander.js | Đơn giản, phổ biến |
| **MCP** | `@modelcontextprotocol/sdk` | Chuẩn protocol cho AI agents |
| **Testing** | Vitest | Nhanh, tương thích TypeScript |
| **Build** | `tsc` + esbuild (bundle) | Đơn giản, nhanh |

### Dependencies tối thiểu

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "commander": "^12.0.0",
    "glob": "^11.0.0",
    "ignore": "^7.0.0",
    "tree-sitter": "^0.21.1",
    "tree-sitter-javascript": "^0.23.0",
    "tree-sitter-typescript": "^0.23.2",
    "tree-sitter-php": "^0.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^4.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
```

> **So sánh:** GitNexus có ~30 dependencies (graphology, ladybugdb, onnxruntime, huggingface…).
> Milens chỉ cần ~10.

---

## 4. Graph Schema (tối giản)

### 4.1 Node Types

| Node Type | Mô tả | Properties |
|-----------|--------|------------|
| `File` | File mã nguồn | `path, language, size, lastModified` |
| `Folder` | Thư mục | `path` |
| `Function` | Function/Arrow function | `name, filePath, startLine, endLine, isExported, parameterCount, isAsync` |
| `Class` | Class declaration | `name, filePath, startLine, endLine, isExported, isAbstract` |
| `Method` | Method trong class | `name, filePath, startLine, endLine, isStatic, visibility, parameterCount` |
| `Interface` | Interface/Type alias | `name, filePath, startLine, endLine, isExported` |
| `Property` | Property/Field | `name, filePath, startLine, type, visibility` |
| `Component` | Vue/React component | `name, filePath, startLine, endLine, isExported, framework` |
| `Route` | HTTP route | `path, method, filePath, startLine` |
| `Module` | ES module / PHP namespace | `name, filePath` |

### 4.2 Relationship Types

| Edge Type | Source → Target | Confidence | Mô tả |
|-----------|----------------|------------|--------|
| `CONTAINS` | Folder/File → * | 1.0 | Cấu trúc thư mục |
| `DEFINES` | File → Function/Class/... | 1.0 | File chứa symbol |
| `IMPORTS` | File → File | 0.9–1.0 | Import/require |
| `CALLS` | Function/Method → Function/Method | 0.5–0.95 | Gọi hàm |
| `EXTENDS` | Class → Class | 1.0 | Kế thừa |
| `IMPLEMENTS` | Class → Interface | 1.0 | Implement interface |
| `HAS_METHOD` | Class → Method | 1.0 | Class chứa method |
| `HAS_PROPERTY` | Class → Property | 1.0 | Class chứa property |
| `RENDERS` | Component → Component | 0.8–0.95 | Vue/React component tree |
| `HANDLES_ROUTE` | Function → Route | 1.0 | Route handler |

### 4.3 SQLite Schema

```sql
-- Nodes
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,    -- "Function:src/utils.ts:formatDate"
  label       TEXT NOT NULL,       -- "Function"
  name        TEXT NOT NULL,
  file_path   TEXT,
  start_line  INTEGER,
  end_line    INTEGER,
  is_exported INTEGER DEFAULT 0,
  properties  TEXT                 -- JSON cho extra fields
);

-- Relationships
CREATE TABLE relationships (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES nodes(id),
  target_id   TEXT NOT NULL REFERENCES nodes(id),
  type        TEXT NOT NULL,       -- "CALLS"
  confidence  REAL DEFAULT 1.0,
  reason      TEXT,
  properties  TEXT                 -- JSON cho extra fields
);

-- Indexes
CREATE INDEX idx_nodes_label ON nodes(label);
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_nodes_file ON nodes(file_path);
CREATE INDEX idx_rel_source ON relationships(source_id);
CREATE INDEX idx_rel_target ON relationships(target_id);
CREATE INDEX idx_rel_type ON relationships(type);

-- Full-text search
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  name, file_path, label,
  content='nodes',
  content_rowid='rowid'
);
```

---

## 5. Pipeline phân tích (6 phases)

### Phase 1: Scan — Thu thập files

```
Input:  Repository root path
Output: FileInfo[] (path, language, size)
```

- Walk thư mục, respect `.gitignore` (dùng `ignore` package)
- Filter theo ngôn ngữ hỗ trợ: `.js`, `.ts`, `.jsx`, `.tsx`, `.vue`, `.php`
- Skip: `node_modules/`, `vendor/`, `dist/`, `.git/`, binary files
- Tính toán language dựa trên extension

**Tham khảo GitNexus:** `gitnexus/src/core/ingestion/pipeline.ts` phase 1-2

### Phase 2: Structure — Xây dựng cấu trúc

```
Input:  FileInfo[]
Output: Graph nodes: File, Folder + CONTAINS edges
```

- Tạo Folder nodes cho mỗi directory
- Tạo File nodes cho mỗi file
- CONTAINS edges: Folder → File, Folder → Folder

### Phase 3: Parse — Phân tích AST

```
Input:  File nodes + source code
Output: Symbol nodes (Function, Class, Method, Interface, Property, Component)
        + DEFINES edges (File → Symbol)
        + HAS_METHOD, HAS_PROPERTY edges
```

- Load tree-sitter parser cho mỗi ngôn ngữ
- Chạy tree-sitter queries để extract symbols
- **Vue SFC:** Tách `<script>` block, parse phần JS/TS bên trong, extract component name từ `<script setup>` hoặc `defineComponent`
- **React:** Detect component qua `function Component()` return JSX, hoặc `React.FC`
- **PHP:** Extract classes, functions, methods, interfaces, traits, namespaces
- Đăng ký symbol vào **Symbol Table**

**Tree-sitter queries mẫu (JS/TS):**
```scheme
;; Functions
(function_declaration
  name: (identifier) @function.name) @function.def

;; Arrow functions assigned to variable
(lexical_declaration
  (variable_declarator
    name: (identifier) @function.name
    value: (arrow_function) @function.def))

;; Classes
(class_declaration
  name: (type_identifier) @class.name
  (class_heritage
    (extends_clause (identifier) @class.extends))?) @class.def

;; Methods
(method_definition
  name: (property_identifier) @method.name) @method.def

;; Exports
(export_statement) @export
```

### Phase 4: Import Resolution — Giải quyết imports

```
Input:  Parsed AST + Symbol Table
Output: IMPORTS edges (File → File)
        + Named import bindings (local name → source + exported name)
```

**3-tier resolution (copy từ GitNexus):**

| Tier | Scope | Confidence | Lookup |
|------|-------|------------|--------|
| 1 | Same-file | 0.95 | Symbol Table exact lookup |
| 2 | Import-scoped | 0.90 | Named import map filter |
| 3 | Global | 0.50 | Fuzzy lookup toàn bộ |

**Import patterns cần xử lý:**

```javascript
// JS/TS
import { User } from './models/user'           // Named import
import * as utils from './utils'                // Namespace import
import defaultExport from './config'            // Default import
const { helper } = require('./helper')          // CommonJS

// Vue
import UserCard from '@/components/UserCard.vue'  // Vue component

// PHP
use App\Models\User;                             // PHP use statement
use App\Services\{AuthService, UserService};     // Grouped use
require_once __DIR__ . '/helpers.php';           // PHP require
```

**Import resolution đặc biệt:**

- **Node.js:** Resolve `@/` alias (tsconfig paths, vite alias), `node_modules/` lookup
- **Vue:** `.vue` extension tự động thêm, `<script setup>` auto-imports
- **PHP:** PSR-4 autoloading (đọc `composer.json` → namespace → directory mapping)

### Phase 5: Call Resolution — Giải quyết lời gọi hàm

```
Input:  Parsed AST + Symbol Table + Import Map
Output: CALLS edges (Function/Method → Function/Method)
        + RENDERS edges (Component → Component)
```

- Extract call expressions từ AST
- Phân loại: `direct` (function call), `member` (obj.method()), `construct` (new Class())
- Resolve callee qua 3-tier resolution
- **Vue/React components:** Detect JSX/template component usage → RENDERS edges

```javascript
// Direct call → CALLS edge
formatDate(now)

// Member call → resolve receiver type → CALLS edge
userService.findById(id)

// Constructor → CALLS edge to constructor
new UserService()

// Vue template → RENDERS edge
// <UserCard :user="user" />

// React JSX → RENDERS edge
// <UserCard user={user} />

// PHP static call → CALLS edge
User::find($id)
```

**Receiver type resolution (đơn giản hóa từ GitNexus):**
1. Tra symbol table: biến `userService` được khai báo kiểu `UserService`
2. Nếu có type annotation → resolve trực tiếp
3. Nếu không → check `new UserService()` assignment trong cùng scope
4. Fallback → fuzzy match tên method toàn cục (confidence 0.5)

### Phase 6: Post-process — Index & persist

```
Input:  Complete graph
Output: SQLite database tại .Milens/db.sqlite
```

- Stream nodes → INSERT vào SQLite
- Stream relationships → INSERT vào SQLite
- Build FTS5 index
- Lưu metadata (commit hash, timestamp, file count, symbol count)
- Đăng ký repo vào `~/.Milens/registry.json`

---

## 6. Symbol Table (trái tim của hệ thống)

```typescript
interface SymbolTable {
  // Đăng ký symbol
  add(filePath: string, name: string, nodeId: string, label: NodeLabel, meta?: SymbolMeta): void;

  // Tier 1: Same-file lookup (confidence 0.95)
  lookupExact(filePath: string, name: string): SymbolDef | null;

  // Tier 2: Import-scoped lookup (confidence 0.90)
  lookupImported(filePath: string, name: string, importMap: ImportMap): SymbolDef | null;

  // Tier 3: Global fuzzy lookup (confidence 0.50)
  lookupGlobal(name: string): SymbolDef[];

  // Specialized lookups
  lookupMethodByOwner(ownerNodeId: string, methodName: string): SymbolDef | null;
  lookupFieldByOwner(ownerNodeId: string, fieldName: string): SymbolDef | null;
  lookupClassByName(name: string): SymbolDef[];
}

interface SymbolDef {
  nodeId: string;         // Graph node ID
  name: string;
  filePath: string;
  label: NodeLabel;       // "Function" | "Class" | "Method" | ...
  isExported: boolean;
  parameterCount?: number;
}
```

**Internal indexes (copy design từ GitNexus):**
```typescript
class SymbolTableImpl {
  // Primary: file-scoped symbols
  private fileIndex = new Map<string, Map<string, SymbolDef[]>>();
  // filePath → name → [definitions]

  // Secondary: global name → all definitions
  private globalIndex = new Map<string, SymbolDef[]>();

  // Specialized: ownerNodeId + "\0" + fieldName → SymbolDef
  private fieldByOwner = new Map<string, SymbolDef>();
  private methodByOwner = new Map<string, SymbolDef[]>();
}
```

---

## 7. Language Providers

### 7.1 Interface

```typescript
interface LanguageProvider {
  id: 'javascript' | 'typescript' | 'vue' | 'php';
  extensions: string[];           // ['.js', '.jsx', '.ts', '.tsx']
  treeSitterLang: string;         // 'javascript', 'typescript', 'php'
  importSemantics: 'named' | 'wildcard';

  // Tree-sitter query strings
  queries: {
    functions: string;
    classes: string;
    methods: string;
    interfaces: string;
    imports: string;
    exports: string;
    calls: string;
    components?: string;          // Vue/React specific
  };

  // Import resolution strategy
  resolveImport(importPath: string, fromFile: string, config: ProjectConfig): string | null;

  // Extract additional info (routes, etc.)
  extractExtras?(ast: Tree, filePath: string): ExtraNode[];
}
```

### 7.2 JavaScript/TypeScript Provider

```typescript
const jstsProvider: LanguageProvider = {
  id: 'javascript', // Hoặc 'typescript'
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  treeSitterLang: 'typescript',  // TS parser handles JS too
  importSemantics: 'named',

  resolveImport(importPath, fromFile, config) {
    // 1. Relative: './utils' → resolve extension (.ts, .js, /index.ts)
    // 2. Alias: '@/' → resolve via tsconfig paths hoặc vite alias
    // 3. Package: 'lodash' → skip (external)
    // 4. Node built-in: 'fs', 'path' → skip
  },

  extractExtras(ast, filePath) {
    // Express routes: app.get('/api/users', handler)
    // Next.js: export async function GET(req) {}
    return routes;
  }
};
```

### 7.3 Vue Provider

```typescript
const vueProvider: LanguageProvider = {
  id: 'vue',
  extensions: ['.vue'],
  treeSitterLang: 'typescript', // Parse <script> block as TS
  importSemantics: 'named',

  // Preprocessing: Extract <script> từ SFC trước khi parse
  preprocess(source: string): { script: string; scriptOffset: number } {
    // Regex extract <script setup lang="ts"> ... </script>
    // Return chỉ phần script + line offset để map lại positions
  },

  resolveImport(importPath, fromFile, config) {
    // Thêm .vue extension nếu resolve không có extension
    // Handle auto-imports (defineProps, defineEmits, ref, computed...)
  },

  extractExtras(ast, filePath) {
    // Extract component name từ filename hoặc defineComponent
    // Extract props từ defineProps<{ ... }>()
    // Extract emits từ defineEmits<{ ... }>()
    // Template refs → component usage (cần parse <template>)
  }
};
```

### 7.4 PHP Provider

```typescript
const phpProvider: LanguageProvider = {
  id: 'php',
  extensions: ['.php'],
  treeSitterLang: 'php',
  importSemantics: 'named',

  resolveImport(importPath, fromFile, config) {
    // PSR-4 resolution:
    // 1. Đọc composer.json → autoload.psr-4 mapping
    // 2. "App\\Models\\User" → "app/Models/User.php"
    // 3. "App\\Services\\{A, B}" → resolve từng class
  },

  extractExtras(ast, filePath) {
    // Laravel routes: Route::get('/users', [UserController::class, 'index'])
    // Laravel middleware: ->middleware(['auth', 'throttle'])
    // PHP 8 attributes: #[Route('/api/users', methods: ['GET'])]
  }
};
```

---

## 8. Query Engine

### 8.1 query — Tìm kiếm symbol

```typescript
async function query(searchTerm: string, options?: QueryOptions): Promise<QueryResult[]> {
  // 1. FTS5 search trên nodes_fts
  // 2. Rank by BM25 score
  // 3. Group by file (giống GitNexus)
  // 4. Return top-K results

  const sql = `
    SELECT n.*, rank
    FROM nodes_fts
    JOIN nodes n ON nodes_fts.rowid = n.rowid
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `;
}
```

### 8.2 context — 360° view của 1 symbol

```typescript
async function context(symbolName: string): Promise<ContextResult> {
  // 1. Tìm symbol node
  // 2. Query tất cả relationships liên quan
  return {
    symbol: node,
    callers:    findRelationships(nodeId, 'CALLS', 'incoming'),
    callees:    findRelationships(nodeId, 'CALLS', 'outgoing'),
    importedBy: findRelationships(nodeId, 'IMPORTS', 'incoming'),
    imports:    findRelationships(nodeId, 'IMPORTS', 'outgoing'),
    extends:    findRelationships(nodeId, 'EXTENDS', 'outgoing'),
    implementedBy: findRelationships(nodeId, 'IMPLEMENTS', 'incoming'),
    methods:    findRelationships(nodeId, 'HAS_METHOD', 'outgoing'),
    properties: findRelationships(nodeId, 'HAS_PROPERTY', 'outgoing'),
    renderedBy: findRelationships(nodeId, 'RENDERS', 'incoming'),
  };
}
```

### 8.3 impact — Phân tích blast radius

```typescript
async function impact(
  target: string,
  direction: 'upstream' | 'downstream' = 'upstream',
  maxDepth: number = 3
): Promise<ImpactResult> {
  // BFS từ target node theo direction
  // upstream = ai gọi tôi? (CALLS incoming, IMPORTS incoming)
  // downstream = tôi gọi ai? (CALLS outgoing)

  const affected = new Map<string, { depth: number; paths: string[][] }>();
  const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
    { nodeId: targetId, depth: 0, path: [targetId] }
  ];

  while (queue.length > 0) {
    const { nodeId, depth, path } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const edges = direction === 'upstream'
      ? getIncoming(nodeId, ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'])
      : getOutgoing(nodeId, ['CALLS', 'IMPORTS']);

    for (const edge of edges) {
      const nextId = direction === 'upstream' ? edge.source_id : edge.target_id;
      if (!affected.has(nextId)) {
        affected.set(nextId, { depth: depth + 1, paths: [] });
        queue.push({ nodeId: nextId, depth: depth + 1, path: [...path, nextId] });
      }
      affected.get(nextId)!.paths.push([...path, nextId]);
    }
  }

  return {
    target: targetNode,
    riskLevel: calculateRisk(affected),  // LOW | MEDIUM | HIGH | CRITICAL
    affected: groupByDepth(affected),
    // d=1: WILL BREAK
    // d=2: LIKELY AFFECTED
    // d=3: MAY NEED TESTING
  };
}
```

---

## 9. MCP Server

### 9.1 Tools

```typescript
const tools = [
  {
    name: 'query',
    description: 'Search symbols by name or concept',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'context',
    description: 'Get full context of a symbol: callers, callees, relationships',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'impact',
    description: 'Analyze blast radius of changing a symbol',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Symbol name to analyze' },
        direction: { type: 'string', enum: ['upstream', 'downstream'], default: 'upstream' },
        depth: { type: 'number', default: 3 },
      },
      required: ['target'],
    },
  },
  {
    name: 'detect_changes',
    description: 'Map git diff to affected symbols',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['staged', 'unstaged', 'all'], default: 'all' },
      },
    },
  },
];
```

### 9.2 Kết nối

```typescript
// stdio mode — cho Cursor, Claude, Copilot
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({ name: 'Milens', version: '1.0.0' }, {
  capabilities: { tools: {}, resources: {} }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'query':   return handleQuery(request.params.arguments);
    case 'context': return handleContext(request.params.arguments);
    case 'impact':  return handleImpact(request.params.arguments);
    case 'detect_changes': return handleDetectChanges(request.params.arguments);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 10. Lộ trình phát triển

### Phase 1 — Foundation (2 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| Project setup | TypeScript, ESM, vitest, commander | P0 |
| Scanner | Walk files, gitignore, language detect | P0 |
| Structure builder | File/Folder nodes + CONTAINS | P0 |
| SQLite adapter | Schema, CRUD, FTS5 setup | P0 |
| Graph types | Node, Relationship interfaces | P0 |
| Repo manager | Registry, metadata | P1 |

**Deliverable:** `Milens analyze` tạo được danh sách files + folders trong SQLite

### Phase 2 — Parsing (2 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| Tree-sitter loader | Load JS/TS/PHP parsers | P0 |
| JS/TS provider | Functions, classes, methods, interfaces | P0 |
| PHP provider | Classes, functions, namespaces, traits | P0 |
| Vue provider | SFC extraction, component detection | P0 |
| Symbol table | 3-tier lookup, indexes | P0 |
| DEFINES edges | File → Symbol relationships | P0 |

**Deliverable:** `Milens analyze` extract được tất cả symbols + đưa vào SQLite

### Phase 3 — Resolution (2 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| Import resolver (JS/TS) | ESM, CJS, alias paths, .vue | P0 |
| Import resolver (PHP) | PSR-4, composer.json | P0 |
| Import map builder | Named imports, namespace imports | P0 |
| Resolution context | 3-tier: same-file → import → global | P0 |
| Call resolver | Direct, member, constructor calls | P0 |
| CALLS edges | Function → Function relationships | P0 |
| Heritage resolver | EXTENDS, IMPLEMENTS | P1 |

**Deliverable:** Graph hoàn chỉnh với IMPORTS + CALLS + EXTENDS edges

### Phase 4 — Query Engine (1 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| FTS search | BM25 via SQLite FTS5 | P0 |
| Context query | Callers/callees/relationships | P0 |
| Impact analysis | BFS upstream/downstream | P0 |
| Detect changes | Git diff → affected symbols | P1 |
| CLI commands | query, context, impact | P0 |

**Deliverable:** CLI tools hoạt động đầy đủ

### Phase 5 — MCP Integration (1 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| MCP server (stdio) | Protocol handler | P0 |
| Tool handlers | query, context, impact, detect_changes | P0 |
| Resources | Schema, repo info | P1 |
| Cursor config | `.cursor/mcp.json` | P0 |
| Staleness check | Compare indexed commit vs HEAD | P1 |

**Deliverable:** AI agent (Cursor/Claude) sử dụng được qua MCP

### Phase 6 — Polish & Extras (1 tuần)

| Task | Chi tiết | Ưu tiên |
|------|----------|---------|
| Vue template parsing | Component usage trong template | P1 |
| React JSX component tree | RENDERS edges | P1 |
| Laravel route extraction | Route::get() patterns | P1 |
| Express route extraction | app.get() patterns | P1 |
| Progress bar CLI | cli-progress | P2 |
| Error handling | Graceful failures, partial index | P1 |

**Deliverable:** Production-ready cho internal use

---

## 11. Những gì bỏ qua (v1) vs thêm sau (v2+)

### Bỏ qua ở v1

| Feature GitNexus | Lý do bỏ | Thêm lại khi nào |
|------------------|----------|-------------------|
| Community detection (Leiden) | Phức tạp, cần vendored algo | v2 - khi repo > 1000 files |
| Process detection (execution flows) | Phụ thuộc community | v2 |
| Embeddings (HuggingFace + ONNX) | Nặng, cần ML runtime | v2 - khi cần semantic search |
| Multi-repo group analysis | Chưa cần cho single workspace | v3 |
| WASM browser runtime | Chỉ cần CLI/MCP | v3 - nếu cần web UI |
| Cypher query language | Overkill cho SQLite | v2 - nếu migrate sang Neo4j |
| Worker pool (parallel parsing) | Thừa cho 4 ngôn ngữ, repo nhỏ | v2 - khi perf là vấn đề |
| Byte-budget chunking | Repo < 500MB không cần | v2 |
| Wiki generation | Cần LLM | v2 |
| Route response shape extraction | Phức tạp | v2 |
| Variadic method matching | Edge case | v2 |
| Type-hash overload disambiguation | Edge case cho PHP/JS | v2 |

### Thêm ở v2

| Feature | Giá trị | Effort |
|---------|---------|--------|
| **Incremental re-index** | Chỉ parse files đã thay đổi | Medium |
| **Watch mode** | Auto re-index on file save | Low |
| **Community detection** | Nhóm chức năng tự động | High |
| **Rename tool** | Safe multi-file rename qua graph | Medium |
| **HTTP API** | Cho web dashboard | Medium |
| **Vue template AST** | Parse `<template>` ngoài `<script>` | Medium |

---

## 12. Khác biệt thiết kế so với GitNexus

| Aspect | GitNexus | Milens (clone) |
|--------|----------|-----------------|
| **DB** | LadybugDB (native addon, mmap, custom Cypher) | SQLite (FTS5, zero-dep, SQL) |
| **Graph in-memory** | Graphology library | Plain Map/Set (đủ cho scale nhỏ) |
| **Parse workers** | Child process pool, byte-budget chunks | Single-threaded sequential (đủ nhanh cho 4 langs) |
| **Import resolution** | 14 language-specific resolvers | 3 resolvers: JS/TS, Vue, PHP |
| **Heritage** | Full MRO, type-hash, const-qualifier, arity suffix | Basic EXTENDS/IMPLEMENTS, arity suffix only |
| **Search** | BM25 + semantic (embeddings) hybrid | BM25 only (SQLite FTS5) |
| **MCP** | 15+ tools + resources + multi-repo | 4 tools, single repo |
| **Build** | Custom script (tsc + shared inlining) | Simple `tsc` hoặc esbuild |
| **License** | PolyForm Noncommercial | Internal use |

---

## 13. Ước lượng effort

| Phase | Thời gian | Developer |
|-------|-----------|-----------|
| Phase 1: Foundation | 2 tuần | 1 dev |
| Phase 2: Parsing | 2 tuần | 1 dev |
| Phase 3: Resolution | 2 tuần | 1 dev |
| Phase 4: Query Engine | 1 tuần | 1 dev |
| Phase 5: MCP | 1 tuần | 1 dev |
| Phase 6: Polish | 1 tuần | 1 dev |
| **Tổng MVP** | **~9 tuần** | **1 developer** |

Với 2 developers song song (1 backend pipeline + 1 language providers), có thể rút xuống **~5-6 tuần**.

---

## 14. Kiểm thử

### Unit tests (Vitest)

```
test/
├── unit/
│   ├── scanner.test.ts          # File scan + gitignore
│   ├── structure-builder.test.ts
│   ├── symbol-table.test.ts     # 3-tier lookup
│   ├── resolution-context.test.ts
│   ├── parsers/
│   │   ├── javascript.test.ts   # JS/TS extraction
│   │   ├── vue.test.ts          # Vue SFC extraction
│   │   └── php.test.ts          # PHP extraction
│   ├── import-resolver.test.ts  # Import path resolution
│   ├── call-resolver.test.ts    # Call edge creation
│   └── sqlite-adapter.test.ts   # DB read/write
├── integration/
│   ├── pipeline.test.ts         # End-to-end pipeline
│   ├── query.test.ts            # Search + context + impact
│   └── mcp-server.test.ts       # MCP protocol
└── fixtures/
    ├── vue-app/                 # Sample Vue project
    ├── react-app/               # Sample React project
    ├── php-laravel/             # Sample Laravel project
    └── node-express/            # Sample Express project
```

### Test coverage targets

| Module | Target |
|--------|--------|
| Symbol Table | 90%+ |
| Resolution Context | 85%+ |
| Language Providers | 80%+ |
| Import Resolvers | 80%+ |
| Pipeline E2E | 70%+ |
| SQLite Adapter | 80%+ |

---

## 15. Quick Start sau khi build xong

```bash
# Install
npm install -g Milens

# Index repo
cd /path/to/your/project
Milens analyze

# Query
Milens query "UserService"
Milens context "handleLogin"
Milens impact "validateToken" --direction upstream

# MCP cho Cursor
# Thêm vào .cursor/mcp.json:
{
  "mcpServers": {
    "Milens": {
      "command": "Milens",
      "args": ["serve", "--mcp"]
    }
  }
}
```
