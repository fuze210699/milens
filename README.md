<div align="center"><h1>milens</h1>Code Intelligence Engine for AI AgentsIndex any codebase → Knowledge graph → AI agents that never miss codeWhy? •Quick Start •Agent Tools •Editors •Languages •Architecture</div>🛑 The ProblemAI agents are blind to structure. They see files as text, not as a connected graph of dependencies.A real scenario:You ask your agent to refactor resolveLinks() in your codebase.The agent searches for "resolveLinks" — finds matches in code, tests, comments, and docs.It renames the function, but misses that resolveLinksWithStats wraps it and analyze() calls the wrapper — a chain invisible to text search.Your pipeline breaks. The agent didn't know the call graph.[!IMPORTANT]The root cause: text search can't distinguish a caller from a comment from a type annotation. It has no concept of "what actually depends on this at the code level."✨ How milens Solves This<p align="center"><img src="docs/diagram1.svg" alt="Without milens vs With milens comparison" width="700"></p>milens builds a pre-indexed knowledge graph at analysis time — resolving every import, call, and inheritance chain — so that any tool query returns the full dependency picture instantly, without multi-step exploration.🚀 Quick Start2 commands. That's it.npx milens analyze                          # index your codebase
npx milens analyze --skills                 # + generate AI skill files
Then add the MCP server to your editor (setup below) and your agent immediately gets 19 tools, 4 resources, and 3 prompts — with built-in instructions that teach it how to use them.[!NOTE]No config files needed. milens sends tool usage guidance via the MCP protocol initialize response — every connected agent automatically learns the workflows.🛠️ What Your AI Agent Gets19 MCP ToolsToolWhat It Does🔍 Search & NavigatequerySymbol search (FTS5 full-text)grepText search ALL files — templates, SCSS, configs, docs. Scoped: all, code, imports, definitionscontext360° symbol view — incoming refs + outgoing depsget_file_symbolsAll symbols in a file with ref/dep countsget_type_hierarchyInheritance/implementation tree🛡️ Impact & SafetyimpactBlast radius: what breaks if this changes? Depth-groupededit_checkPre-edit safety: callers + exports + re-export chains + test coverage + ⚠ warningsdetect_changesgit diff → affected symbols + direct dependentsfind_dead_codeExported symbols with zero references🧠 Understandingsmart_contextIntent-aware context: understand / edit / debug / test — returns only what matterstraceExecution flow: call chains from entrypoints to a target (or downstream)routesDetect framework routes/endpoints (Express, FastAPI, NestJS, Flask, Go, PHP, Rails)explain_relationshipShortest dependency path between two symbols📊 Codebase OverviewoverviewCombined context + impact + grep in ONE call (saves 2-3 round trips)domainsDomain clusters — groups of files forming logical modulesreposList all indexed repositories with summary statsstatusIndex stats, domains, test coverage, staleness4 MCP ResourcesResourceWhat It Returns📈 milens://overviewIndex overview: stats, domains, coverage, staleness🧩 milens://symbol/{name}Symbol definition + relationships📄 milens://file/{path}All symbols in a file🗂️ milens://domain/{name}Domain cluster details3 Guided PromptsPromptWorkflow🗑️ delete-featuregrep → impact → context → full deletion plan🏗️ refactor-symbolcontext → impact → grep → hierarchy → every file to update🧭 explore-symbolquery → context → impact (both directions) → grep → summary💻 Editor SetupVS Code / GitHub Copilot (Recommended)First, run the indexer once:npx milens analyze -p . 
Then, add this to .vscode/mcp.json:{
  "servers": {
    "milens": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "${workspaceFolder}"]
    }
  }
}
Done. Copilot now has access to 19 code intelligence tools.<details><summary><strong>👉 Show setup for other editors (Cursor, Claude Code, Windsurf, etc.)</strong></summary>CursorAdd to .cursor/mcp.json:{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "."]
    }
  }
}
Claude Codeclaude mcp add milens -- npx -y milens serve -p .
WindsurfAdd to ~/.codeium/windsurf/mcp_config.json:{
  "mcpServers": {
    "milens": {
      "command": "npx",
      "args": ["-y", "milens", "serve", "-p", "."]
    }
  }
}
CodexAdd to .codex/config.toml:[mcp_servers.milens]
command = "npx"
args = ["-y", "milens", "serve", "-p", "."]
HTTP Mode (Remote Agents)npx milens serve --http --port 3100         # localhost only, no auth needed
Endpoint: POST http://localhost:3100/mcp</details>🧠 Skills GenerationGenerate editor-specific context files from your knowledge graph:npx milens analyze -p . --skills            # all editors at once
npx milens analyze -p . --skills-copilot    # GitHub Copilot only
npx milens analyze -p . --skills-cursor     # Cursor only
npx milens analyze -p . --skills-claude     # Claude Code only
npx milens analyze -p . --skills-agents     # AGENTS.md only
npx milens analyze -p . --skills-windsurf   # Windsurf only
This generates per-area skill files with: key symbols, entry points, cross-area dependencies, and MCP tool usage instructions — so agents know both the codebase structure and how to use milens tools.EditorOutput PathGitHub Copilot.github/instructions/*.instructions.md + .github/copilot-instructions.mdCursor.cursor/rules/*.mdc + .cursor/index.mdcClaude Code.claude/skills/generated/*/SKILL.md + .claude/rules/*.md + CLAUDE.mdGeneral Agents.agents/skills/*/SKILL.md + AGENTS.mdWindsurf.windsurfrules[!TIP]Root config files use <!-- milens:start/end --> markers for idempotent injection — re-running replaces the milens section without overwriting your custom content.⌨️ CLI Commands# ── Index & Explore ──
npx milens analyze -p .                     # index current directory
npx milens analyze -p . --force --verbose   # full re-index with progress
npx milens search "UserService"             # search symbols (FTS5)
npx milens inspect "AuthService"            # 360° view: refs + deps

# ── Impact Analysis ──
npx milens impact "createUser"              # what breaks if this changes?
npx milens impact "UserModel" -d downstream # what does this depend on?

# ── MCP Server ──
npx milens serve -p .                       # stdio (for editors)
npx milens serve --http --port 3100         # HTTP (for remote agents)

# ── Management ──
npx milens status -p .                      # index stats
npx milens list                             # all indexed repos
npx milens clean -p .                       # remove index
npx milens clean --all                      # remove all indexes

# ── Dashboard ──
npx milens dashboard                        # usage analytics on port 3200
npx milens dashboard --port 8080            # custom port
🌍 Supported LanguagesLanguageExtensionsImportsCallsHeritageFrameworksTypeScript.ts .tsx✓✓✓NestJS, React JSXJavaScript.js .jsx .mjs .cjs✓✓✓React JSX, ExpressPython.py✓✓✓FastAPI, FlaskJava.java✓✓✓SpringGo.go✓✓—net/httpRust.rs✓✓✓—PHP.php✓✓✓LaravelRuby.rb✓✓✓RailsVue.vue✓✓✓Vue 3 SFCHTML.html .htm✓✓——CSS.css✓——Custom properties🏗️ Architecture<p align="center"><img src="docs/diagram2.svg" alt="milens architecture: Indexing Pipeline → MCP Server → AI Agent" width="700"></p>Multi-Repo Architecturemilens uses a global registry — one MCP server serves all indexed repos. No per-project server config needed.<p align="center"><img src="docs/diagram3.svg" alt="Multi-repo architecture: CLI → Registry → Per-Repo DBs → MCP Server" width="500"></p>Security & Privacymilens is offline by design — zero network calls, zero telemetry. Everything executes on your machine.LayerProtectionData localityIndex lives in .milens/ per repo (gitignored). Global registry (~/.milens/) stores only file paths — no source code.HTTP transportBinds to 127.0.0.1 only — requires explicit --http flag, never auto-exposed.File accessAll reads bounded to the repo root — no path traversal.🔍 Tool ExamplesThese examples are from milens indexing itself (npx milens analyze -p .):# Pre-edit safety check — real output from milens self-index
edit_check({name: "createMcpServer"})
→ createMcpServer [function] src/server/mcp.ts:272 {utility,heat:70} (exported)
  callers (2):
    calls: startStdio [function] src/server/mcp.ts:1475
    calls: startHttp [function] src/server/mcp.ts:1483
  deps (32): searchSymbols, findSymbolByName, getIncomingLinks, findUpstream,
             grepFiles, traceToEntrypoints, getDomainStats, getStaleFiles, ...

# Context — 360° view with callers and callees
context({name: "analyze"})
→ analyze [function] src/analyzer/engine.ts:23 {utility,heat:55} (exported)
  incoming:
    calls: src/cli.ts (CLI entry point)
  outgoing (26 deps):
    calls: scanFiles [function] src/analyzer/scanner.ts:11
    calls: resolveLinksWithStats [function] src/analyzer/resolver.ts:27
    calls: enrichMetadata [function] src/analyzer/enrich.ts:21
    calls: loadLanguage [function] src/parser/loader.ts:20
    calls: transaction, insertSymbol, insertLink, rebuildSearch ... (db ops)

# Impact analysis — what breaks if searchSymbols changes?
impact({target: "searchSymbols", direction: "upstream"})
→ depth 1:
    createMcpServer [function] src/server/mcp.ts:272 (calls)
  depth 2:
    startStdio [function] src/server/mcp.ts:1475 (calls)
    startHttp [function] src/server/mcp.ts:1483 (calls)
🤝 Adding a LanguageCreate src/parser/lang-xxx.ts:import type { LangSpec } from './extract.js';

const spec: LangSpec = {
  id: 'xxx',
  extensions: ['.xxx'],
  wasmName: 'tree-sitter-xxx',
  queries: {
    functions: `(function_definition name: (identifier) @name) @def`,
    classes: `(class_definition name: (identifier) @name) @def`,
  },
  resolveImport(raw, fromFile, root, aliases) {
    // return resolved file path or null
  },
};

export default spec;
Then register it in src/parser/languages.ts.💻 Developmentnpm install              # install dependencies
npm run build            # tsc → dist/
npm test                 # vitest (43 tests)
npm run lint             # tsc --noEmit
npm run self-analyze     # index this repo
npm run self-serve       # start MCP server on port 3100
npx milens dashboard     # open usage analytics dashboard
📜 LicensePolyForm Noncommercial 1.0.0Architectural inspiration from GitNexus by Abhigyan Patwari.
