import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getParser, loadLanguage } from '../../src/parser/loader.js';
import { extractFromTree } from '../../src/parser/extract.js';
import { extractVueScript, extractVueTemplateRefs, extractVueCompositionApi, extractVueTemplateAst } from '../../src/parser/lang-vue.js';
import tsSpec from '../../src/parser/lang-ts.js';
import pySpec from '../../src/parser/lang-py.js';
import goSpec from '../../src/parser/lang-go.js';
import vueSpec from '../../src/parser/lang-vue.js';
import rubySpec from '../../src/parser/lang-ruby.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('TypeScript extractor', () => {
  it('extracts functions, classes, methods, and exports', async () => {
    const source = readFileSync(join(FIXTURES, 'ts-project', 'src', 'auth.ts'), 'utf-8');
    const parser = await getParser(tsSpec.wasmName);
    const lang = await loadLanguage(tsSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'src/auth.ts');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('AuthService');
    expect(names).toContain('hashPassword');

    // Methods inside class
    const methods = result.symbols.filter(s => s.kind === 'method');
    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods.some(m => m.name === 'register')).toBe(true);
    expect(methods.some(m => m.name === 'findByEmail')).toBe(true);

    // Exports
    expect(result.exportedNames.has('AuthService')).toBe(true);
    expect(result.exportedNames.has('hashPassword')).toBe(true);

    // Imports
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.imports.some(i => i.modulePath.includes('models'))).toBe(true);

    // Calls
    expect(result.calls.some(c => c.calleeName === 'createUser')).toBe(true);
  });

  it('extracts interfaces and types from models', async () => {
    const source = readFileSync(join(FIXTURES, 'ts-project', 'src', 'models.ts'), 'utf-8');
    const parser = await getParser(tsSpec.wasmName);
    const lang = await loadLanguage(tsSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'src/models.ts');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('User');
    expect(names).toContain('createUser');

    // Type alias should be indexed as 'type' kind
    const types = result.symbols.filter(s => s.kind === 'type');
    expect(types.some(t => t.name === 'UserRole')).toBe(true);
  });

  it('extracts decorator argument references (NestJS-style)', async () => {
    const source = readFileSync(join(FIXTURES, 'ts-project', 'src', 'nest-sample.ts'), 'utf-8');
    const parser = await getParser(tsSpec.wasmName);
    const lang = await loadLanguage(tsSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, tsSpec, 'src/nest-sample.ts');

    const calleeNames = result.calls.map(c => c.calleeName);

    // Direct argument: @UseGuards(AuthGuard)
    expect(calleeNames).toContain('AuthGuard');

    // Array items in decorator object: @Module({ imports: [AuthModule], controllers: [...] })
    expect(calleeNames).toContain('AuthModule');
    expect(calleeNames).toContain('UserController');
    expect(calleeNames).toContain('UserService');

    // Property value in decorator object: @ApiBody({ type: UserDto })
    expect(calleeNames).toContain('UserDto');

    // Arrow function body in decorator: @Type(() => UserDto)
    expect(calleeNames.filter(n => n === 'UserDto').length).toBeGreaterThanOrEqual(2);

    // Depth-4: object inside array in decorator object: { useClass: RolesGuard }
    expect(calleeNames).toContain('RolesGuard');

    // Identifier passed as argument to method call: consumer.apply(BodyNormalizeMiddleware)
    expect(calleeNames).toContain('BodyNormalizeMiddleware');

    // Generic return type: Promise<User> → User
    expect(result.returnTypes.some(rt => rt.returnType === 'User')).toBe(true);

    // Type annotation bindings: (dto: UserDto) and return type: User
    expect(result.typeBindings.some(tb => tb.typeName === 'UserDto')).toBe(true);
  });
});

// Regression coverage for findEnclosingViaAst (src/parser/extract.ts): it walks up from
// `descendantForPosition(defNode.startPosition)` to find the tightest enclosing
// function/method/class/struct/trait. An earlier version synthesized the query position as
// `{row, column: 0}` instead of using the real node position — column 0 usually falls on
// leading indentation, which belongs to the *parent* node (e.g. the class body) rather than
// the target node (e.g. a method), so every one of these previously mis-attributed indented
// members to their enclosing class instead of the tighter method/function scope.
describe('Enclosing scope resolution (calls/typeBindings/assignmentChains/callResultBindings)', () => {
  async function extractTs(source: string) {
    const parser = await getParser(tsSpec.wasmName);
    const lang = await loadLanguage(tsSpec.wasmName);
    const tree = parser.parse(source);
    return extractFromTree(tree, lang, tsSpec, 'src/scope.ts');
  }

  it('attributes a call inside an indented method to the method, not the class', async () => {
    const source = `
export class UserRepository {
  private users: User[] = [];

  save(user: User): void {
    this.users.push(user);
  }
}
`;
    const result = await extractTs(source);
    const pushCall = result.calls.find(c => c.calleeName === 'push');
    expect(pushCall).toBeDefined();
    expect(pushCall!.enclosingSymbolId).toContain('#method:save:');
    expect(pushCall!.enclosingSymbolId).not.toContain('#class:UserRepository:');
  });

  it('attributes a method-parameter type annotation to the method, not the class (regression: was mis-attributed to class via column-0 lookup)', async () => {
    const source = `
export interface User { id: number; }

export class UserRepository {
  private users: User[] = [];

  save(user: User): void {
    this.users.push(user);
  }
}
`;
    const result = await extractTs(source);
    const paramBinding = result.typeBindings.find(tb => tb.variableName === 'user' && tb.typeName === 'User');
    expect(paramBinding).toBeDefined();
    expect(paramBinding!.scope).toContain('#method:save:');
    expect(paramBinding!.scope).not.toContain('#class:UserRepository:');
  });

  it('attributes a class-field type annotation directly to the class when there is no enclosing method', async () => {
    const source = `
export interface User { id: number; }

export class UserRepository {
  active: User;
}
`;
    const result = await extractTs(source);
    const fieldBinding = result.typeBindings.find(tb => tb.variableName === 'active' && tb.typeName === 'User');
    expect(fieldBinding).toBeDefined();
    expect(fieldBinding!.scope).toContain('#class:UserRepository:');
  });

  it('attributes a call inside a deeply nested (indented) function to the innermost function', async () => {
    const source = `
function outer() {
  function inner() {
    doSomething();
  }
}
`;
    const result = await extractTs(source);
    const call = result.calls.find(c => c.calleeName === 'doSomething');
    expect(call).toBeDefined();
    expect(call!.enclosingSymbolId).toContain('#function:inner:');
  });

  it('falls back to the module top-level symbol for a call outside any function/class', async () => {
    const source = `
doSomething();
`;
    const result = await extractTs(source);
    const call = result.calls.find(c => c.calleeName === 'doSomething');
    expect(call).toBeDefined();
    expect(call!.enclosingSymbolId).toBe('src/scope.ts#module:_top:0');
  });

  it('attributes an assignment chain inside an indented method to the method', async () => {
    const source = `
class Wrapper {
  run() {
    const a = 1;
    const b = a;
  }
}
`;
    const result = await extractTs(source);
    const chain = result.assignmentBindings.find(ab => ab.target === 'b' && ab.source === 'a');
    expect(chain).toBeDefined();
    expect(chain!.scope).toContain('#method:run:');
    expect(chain!.scope).not.toContain('#class:Wrapper:');
  });

  it('attributes a call-result binding inside an indented method to the method', async () => {
    const source = `
class Wrapper {
  run() {
    const user = getUser();
  }
}
`;
    const result = await extractTs(source);
    const binding = result.callResultBindings.find(cr => cr.target === 'user' && cr.calleeName === 'getUser');
    expect(binding).toBeDefined();
    expect(binding!.scope).toContain('#method:run:');
    expect(binding!.scope).not.toContain('#class:Wrapper:');
  });
});

describe('Python extractor', () => {
  it('extracts classes and functions', async () => {
    const source = readFileSync(join(FIXTURES, 'py-project', 'models.py'), 'utf-8');
    const parser = await getParser(pySpec.wasmName);
    const lang = await loadLanguage(pySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, pySpec, 'models.py');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('User');
    expect(names).toContain('create_user');

    const methods = result.symbols.filter(s => s.kind === 'method');
    expect(methods.some(m => m.name === '__init__')).toBe(true);
    expect(methods.some(m => m.name === 'display')).toBe(true);
  });

  it('extracts imports and calls', async () => {
    const source = readFileSync(join(FIXTURES, 'py-project', 'service.py'), 'utf-8');
    const parser = await getParser(pySpec.wasmName);
    const lang = await loadLanguage(pySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, pySpec, 'service.py');

    expect(result.imports.some(i => i.modulePath === 'models')).toBe(true);
    expect(result.calls.some(c => c.calleeName === 'create_user')).toBe(true);
  });
});

describe('Go extractor', () => {
  it('extracts structs, interfaces, and functions', async () => {
    const source = readFileSync(join(FIXTURES, 'go-project', 'models', 'user.go'), 'utf-8');
    const parser = await getParser(goSpec.wasmName);
    const lang = await loadLanguage(goSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, goSpec, 'models/user.go');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('User');
    expect(names).toContain('UserRepository');
    expect(names).toContain('NewUser');

    const structs = result.symbols.filter(s => s.kind === 'struct');
    expect(structs.some(s => s.name === 'User')).toBe(true);

    const interfaces = result.symbols.filter(s => s.kind === 'interface');
    expect(interfaces.some(i => i.name === 'UserRepository')).toBe(true);
  });

  it('extracts methods and calls', async () => {
    const source = readFileSync(join(FIXTURES, 'go-project', 'service', 'handler.go'), 'utf-8');
    const parser = await getParser(goSpec.wasmName);
    const lang = await loadLanguage(goSpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, goSpec, 'service/handler.go');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('UserService');
    expect(names).toContain('NewUserService');
    expect(names).toContain('Register');

    expect(result.calls.some(c => c.calleeName === 'NewUser')).toBe(true);
  });
});

describe('Vue extractor', () => {
  it('extracts script symbols from Vue SFC', async () => {
    const source = readFileSync(join(FIXTURES, 'ts-project', 'src', 'UserProfile.vue'), 'utf-8');
    const script = extractVueScript(source);
    expect(script).not.toBeNull();

    const parser = await getParser(vueSpec.wasmName);
    const lang = await loadLanguage(vueSpec.wasmName);
    const tree = parser.parse(script!.content);
    const result = extractFromTree(tree, lang, vueSpec, 'src/UserProfile.vue');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('handleClick');
    expect(names).toContain('onSubmit');
  });

  it('extracts template references from Vue SFC', () => {
    const source = readFileSync(join(FIXTURES, 'ts-project', 'src', 'UserProfile.vue'), 'utf-8');
    const calls = extractVueTemplateRefs(source, 'src/UserProfile.vue');

    const calleeNames = calls.map(c => c.calleeName);
    // Component refs
    expect(calleeNames).toContain('UserAvatar');
    expect(calleeNames).toContain('el-button');
    // Event handlers
    expect(calleeNames).toContain('handleClick');
    expect(calleeNames).toContain('onSubmit');
    // Directive expressions
    expect(calleeNames).toContain('isVisible');
    expect(calleeNames).toContain('avatarUrl');
    expect(calleeNames).toContain('canEdit');
    // Template interpolations
    expect(calleeNames).toContain('displayName');
  });

  it('AST-based extraction captures component tags and event handlers', async () => {
    const source = `<template>
  <MyComponent @click="handleClick" />
  <el-button v-on:submit="onSubmit" />
</template>`;
    const htmlParser = await getParser('tree-sitter-html');
    const result = extractVueTemplateAst(htmlParser, source, 'Test.vue');

    expect(result.calls.length).toBeGreaterThan(0);
    const calleeNames = result.calls.map(c => c.calleeName);
    expect(calleeNames).toContain('MyComponent');
    expect(calleeNames).toContain('el-button');
    expect(calleeNames).toContain('handleClick');
    expect(calleeNames).toContain('onSubmit');
  });

  it('AST-based extraction captures class attributes with . prefix', async () => {
    const source = `<template><div class="container main" /></template>`;
    const htmlParser = await getParser('tree-sitter-html');
    const result = extractVueTemplateAst(htmlParser, source, 'Test.vue');

    const calleeNames = result.calls.map(c => c.calleeName);
    expect(calleeNames).toContain('.container');
    expect(calleeNames).toContain('.main');
  });

  it('AST-based extraction captures ref attributes as symbols', async () => {
    const source = `<template><input ref="inputEl" /></template>`;
    const htmlParser = await getParser('tree-sitter-html');
    const result = extractVueTemplateAst(htmlParser, source, 'Test.vue');

    const refSym = result.symbols.find(s => s.name === 'inputEl');
    expect(refSym).toBeDefined();
    expect(refSym!.kind).toBe('variable');
    expect(refSym!.exported).toBe(false);
  });

  it('AST-based extraction handles multi-line attributes', async () => {
    const source = `<template>
  <MyComponent
    v-if="isVisible"
    :data="items"
    @update="onUpdate"
  />
</template>`;
    const htmlParser = await getParser('tree-sitter-html');
    const result = extractVueTemplateAst(htmlParser, source, 'Test.vue');

    const calleeNames = result.calls.map(c => c.calleeName);
    expect(calleeNames).toContain('MyComponent');
    expect(calleeNames).toContain('isVisible');
    expect(calleeNames).toContain('items');
    expect(calleeNames).toContain('onUpdate');
  });

  it('AST-based extraction returns empty for no template', async () => {
    const source = `<script setup>const x = 1;</script>`;
    const htmlParser = await getParser('tree-sitter-html');
    const result = extractVueTemplateAst(htmlParser, source, 'NoTemplate.vue');

    expect(result.calls.length).toBe(0);
    expect(result.symbols.length).toBe(0);
  });

  it('extracts Composition API defineProps child symbols', () => {
    const scriptContent = `const props = defineProps<{ name: string; age?: number }>();`;
    const syms = extractVueCompositionApi(scriptContent, 'Test.vue', 10);
    const names = syms.map(s => s.name);
    expect(names).toContain('name');
    expect(names).toContain('age');
    // Child props should have parentId pointing to the props variable
    const child = syms.find(s => s.name === 'name');
    expect(child!.parentId).toContain('props');
  });

  it('extracts Composition API defineEmits event names from array', () => {
    const scriptContent = `const emit = defineEmits(['update:modelValue', 'change']);`;
    const syms = extractVueCompositionApi(scriptContent, 'Test.vue', 5);
    const names = syms.map(s => s.name);
    expect(names).toContain('update:modelValue');
    expect(names).toContain('change');
  });
});

describe('Ruby extractor', () => {
  it('extracts constants from Ruby', async () => {
    const source = `MAX_USERS = 100`;
    const parser = await getParser(rubySpec.wasmName);
    const lang = await loadLanguage(rubySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, rubySpec, 'consts.rb');

    const constSym = result.symbols.find(s => s.name === 'MAX_USERS');
    expect(constSym).toBeDefined();
    expect(constSym!.kind).toBe('variable');
  });

  it('extracts instance and class variables', async () => {
    const source = `
class Counter
  @@count = 0

  def initialize
    @value = 0
  end
end
`;
    const parser = await getParser(rubySpec.wasmName);
    const lang = await loadLanguage(rubySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, rubySpec, 'vars.rb');

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('@value');
    expect(names).toContain('@@count');
  });

  it('extracts type bindings from .new calls', async () => {
    const source = `
class Service
  def run
    repo = UserRepo.new
    @cache = Cache.new
  end
end
`;
    const parser = await getParser(rubySpec.wasmName);
    const lang = await loadLanguage(rubySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, rubySpec, 'types.rb');

    const typeNames = result.typeBindings.map(tb => tb.typeName);
    expect(typeNames).toContain('UserRepo');
    expect(typeNames).toContain('Cache');

    const varNames = result.typeBindings.map(tb => tb.variableName);
    expect(varNames).toContain('repo');
    expect(varNames).toContain('@cache');
  });

  it('extracts require and require_relative as imports', async () => {
    const source = `require_relative './models'`;
    const parser = await getParser(rubySpec.wasmName);
    const lang = await loadLanguage(rubySpec.wasmName);
    const tree = parser.parse(source);
    const result = extractFromTree(tree, lang, rubySpec, 'imports.rb');

    expect(result.imports.some(i => i.modulePath === './models')).toBe(true);
  });
});
