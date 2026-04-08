#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeCommand } from './analyze.js';
import { queryCommand } from './query.js';
import { contextCommand } from './context.js';
import { impactCommand } from './impact.js';
import { changesCommand } from './changes.js';
import { serveCommand } from './serve.js';

const program = new Command();

program
  .name('milens')
  .description('Lightweight Code Intelligence Platform')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a codebase and build the knowledge graph')
  .option('-p, --path <path>', 'Root path of the repository', '.')
  .option('-o, --output <dir>', 'Output directory for the database')
  .option('-v, --verbose', 'Show detailed output')
  .action(analyzeCommand);

program
  .command('query <search>')
  .description('Search symbols by name or concept')
  .option('-l, --limit <n>', 'Max results', '20')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(queryCommand);

program
  .command('context <symbol>')
  .description('Get full 360° context of a symbol')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(contextCommand);

program
  .command('impact <symbol>')
  .description('Analyze blast radius of changing a symbol')
  .option('-d, --direction <dir>', 'upstream or downstream', 'upstream')
  .option('--depth <n>', 'Max traversal depth', '3')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(impactCommand);

program.addCommand(changesCommand);
program.addCommand(serveCommand);

program.parse();
