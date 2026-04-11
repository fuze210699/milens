import type { LangSpec } from './extract.js';
import tsSpec from './lang-ts.js';
import jsSpec from './lang-js.js';
import pySpec from './lang-py.js';
import javaSpec from './lang-java.js';
import goSpec from './lang-go.js';
import rustSpec from './lang-rust.js';
import phpSpec from './lang-php.js';
import rubySpec from './lang-ruby.js';
import vueSpec from './lang-vue.js';
import htmlSpec from './lang-html.js';
import cssSpec from './lang-css.js';

const ALL_LANGS: LangSpec[] = [tsSpec, jsSpec, pySpec, javaSpec, goSpec, rustSpec, phpSpec, rubySpec, vueSpec, htmlSpec, cssSpec];

const byExtension = new Map<string, LangSpec>();
for (const lang of ALL_LANGS) {
  for (const ext of lang.extensions) {
    byExtension.set(ext, lang);
  }
}

export function langForFile(filePath: string): LangSpec | undefined {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  return byExtension.get(ext);
}

export function supportedExtensions(): string[] {
  return [...byExtension.keys()];
}

export { ALL_LANGS };
