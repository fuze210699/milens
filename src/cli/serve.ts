import { Command } from 'commander';
import { resolve } from 'node:path';
import { startMcpServer } from '../mcp/server.js';

export const serveCommand = new Command('serve')
  .description('Start MCP server for AI agent integration (stdio)')
  .option('-p, --path <path>', 'Repository root path', '.')
  .action(async (options: { path: string }) => {
    const rootPath = resolve(options.path);
    await startMcpServer(rootPath);
  });
