import type { GraphNode, GraphRelationship } from '../../types/graph.js';
import type { ProjectConfig } from '../../types/pipeline.js';
import type { LanguageProvider, ParsedSymbols, RawImport, RawExport } from './provider.js';
import { typescriptProvider } from './javascript.js';

// Regex to extract <script> block from Vue SFC
const SCRIPT_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const TEMPLATE_REGEX = /<template\b[^>]*>([\s\S]*?)<\/template>/i;
const COMPONENT_TAG_REGEX = /<([A-Z][a-zA-Z0-9]*)\b/g;

interface ScriptBlock {
  content: string;
  offset: number;     // line offset
  isSetup: boolean;
  lang: string;       // 'ts' | 'js'
}

function extractScriptBlock(source: string): ScriptBlock | null {
  SCRIPT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let result: ScriptBlock | null = null;

  while ((match = SCRIPT_REGEX.exec(source)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const isSetup = /\bsetup\b/.test(attrs);
    const lang = /\blang\s*=\s*["']?(ts|typescript)["']?/.test(attrs) ? 'ts' : 'js';

    // Prefer <script setup> over regular <script>
    const linesBefore = source.substring(0, match.index).split('\n').length;
    const candidate: ScriptBlock = { content, offset: linesBefore, isSetup, lang };

    if (isSetup || !result) {
      result = candidate;
    }
  }

  return result;
}

function extractComponentName(filePath: string, source: string): string {
  // Try to find defineComponent({ name: '...' })
  const nameMatch = source.match(/name\s*:\s*['"]([^'"]+)['"]/);
  if (nameMatch) return nameMatch[1];

  // Fallback: derive from filename
  const fileName = filePath.split('/').pop()?.replace(/\.vue$/, '') ?? 'Unknown';
  return fileName.charAt(0).toUpperCase() + fileName.slice(1);
}

function extractTemplateComponents(source: string): string[] {
  const templateMatch = source.match(TEMPLATE_REGEX);
  if (!templateMatch) return [];

  const components: string[] = [];
  let match: RegExpExecArray | null;
  COMPONENT_TAG_REGEX.lastIndex = 0;
  while ((match = COMPONENT_TAG_REGEX.exec(templateMatch[1])) !== null) {
    components.push(match[1]);
  }
  return [...new Set(components)];
}

export const vueProvider: LanguageProvider = {
  id: 'vue',
  extensions: ['.vue'],
  treeSitterLang: 'typescript', // We parse the <script> block as TS

  extract(source: string, filePath: string, tree: any): ParsedSymbols {
    const scriptBlock = extractScriptBlock(source);
    if (!scriptBlock) {
      // No script block — create just a Component node
      const componentName = extractComponentName(filePath, source);
      const componentId = `Component:${filePath}:${componentName}`;
      return {
        nodes: [{
          id: componentId,
          label: 'Component',
          name: componentName,
          filePath,
          startLine: 1,
          isExported: true,
          properties: { framework: 'vue' },
        }],
        relationships: [{
          id: `DEFINES:File:${filePath}->${componentId}`,
          sourceId: `File:${filePath}`,
          targetId: componentId,
          type: 'DEFINES',
          confidence: 1.0,
        }],
        imports: [],
        exports: [{ name: 'default', line: 1 }],
        calls: [],
      };
    }

    // Parse the script block using the TS provider
    const parsed = typescriptProvider.extract(scriptBlock.content, filePath, tree);

    // Adjust line numbers by offset
    for (const node of parsed.nodes) {
      if (node.startLine) node.startLine += scriptBlock.offset;
      if (node.endLine) node.endLine += scriptBlock.offset;
    }
    for (const imp of parsed.imports) {
      imp.line += scriptBlock.offset;
    }
    for (const exp of parsed.exports) {
      exp.line += scriptBlock.offset;
    }

    // Add the Component node itself
    const componentName = extractComponentName(filePath, source);
    const componentId = `Component:${filePath}:${componentName}`;
    parsed.nodes.push({
      id: componentId,
      label: 'Component',
      name: componentName,
      filePath,
      startLine: 1,
      endLine: source.split('\n').length,
      isExported: true,
      properties: { framework: 'vue', isSetup: scriptBlock.isSetup },
    });
    parsed.relationships.push({
      id: `DEFINES:File:${filePath}->${componentId}`,
      sourceId: `File:${filePath}`,
      targetId: componentId,
      type: 'DEFINES',
      confidence: 1.0,
    });

    // Extract component usage from <template>
    const usedComponents = extractTemplateComponents(source);
    for (const usedName of usedComponents) {
      parsed.relationships.push({
        id: `RENDERS:${componentId}->?:${usedName}`,
        sourceId: componentId,
        targetId: `Component:?:${usedName}`,
        type: 'RENDERS',
        confidence: 0.85,
        properties: { unresolvedTarget: usedName },
      });
    }

    // Ensure default export
    if (!parsed.exports.some(e => e.name === 'default')) {
      parsed.exports.push({ name: 'default', line: 1 });
    }

    return parsed;
  },

  resolveImport(importPath: string, fromFile: string, config: ProjectConfig): string | null {
    // Delegate to TS provider, but also try .vue extension
    const resolved = typescriptProvider.resolveImport(importPath, fromFile, config);
    if (resolved) return resolved;

    // Try adding .vue extension if not present
    if (!importPath.endsWith('.vue')) {
      return typescriptProvider.resolveImport(importPath + '.vue', fromFile, config);
    }

    return null;
  },
};
