#!/usr/bin/env node
/**
 * End-to-end smoke test: spawns milens MCP server via stdio and performs
 * a real JSON-RPC handshake:
 *   initialize → tools/list → call "status" → shutdown
 *
 * Usage: node scripts/smoke-test.mjs
 * Requires: `npm run build` first (or tsx)
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function log(msg) {
  process.stderr.write(`[smoke] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[smoke] FAIL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  log('Starting MCP smoke test...');

  // Use dist/cli.js when available (tests the actual build artifact), fall back to tsx for dev
  const distCli = resolve(repoRoot, 'dist', 'cli.js');
  const useDist = existsSync(distCli);
  const child = spawn(
    useDist ? 'node' : 'npx',
    useDist ? [distCli, 'serve', '-p', repoRoot] : ['tsx', 'src/cli.ts', 'serve', '-p', repoRoot],
    {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  );
  log(`Spawning via: ${useDist ? 'node dist/cli.js' : 'npx tsx src/cli.ts'}`);

  const timeout = 30_000; // 30 seconds
  let buffer = '';
  let requestId = 0;
  let dead = false;

  const timer = setTimeout(() => {
    if (!dead) {
      dead = true;
      child.kill();
      fail('Timeout — server did not respond within 30s');
    }
  }, timeout);

  child.on('exit', (code) => {
    if (!dead && code !== 0 && code !== null) {
      dead = true;
      fail(`Server exited with code ${code}`);
    }
  });

  child.stderr.on('data', (data) => {
    // MCP servers may log to stderr — not a failure
  });

  // Collect stdout data
  const stdoutChunks = [];
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(chunk);
    buffer += chunk.toString();

    // Try to parse complete JSON-RPC responses (newline-delimited)
    while (true) {
      const nl = buffer.indexOf('\n');
      if (nl === -1) break;
      const line = buffer.substring(0, nl).trim();
      buffer = buffer.substring(nl + 1);

      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        handleResponse(msg);
      } catch {
        // Incomplete or non-JSON — ignore
      }
    }
  });

  let initializeResult = null;
  let toolsListResult = null;
  let statusResult = null;
  let step = 0;

  function send(method, params = {}) {
    const id = ++requestId;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    child.stdin.write(request);
    return id;
  }

  function handleResponse(msg) {
    step++;
    if (msg.id === 1 && msg.result) {
      // initialize response
      initializeResult = msg.result;
      log(`✓ Initialize OK — server: ${msg.result.serverInfo?.name} v${msg.result.serverInfo?.version}`);

      if (!msg.result.capabilities?.tools) {
        fail('Server does not support tools capability');
      }
      log(`✓ Server capabilities: ${JSON.stringify(msg.result.capabilities)}`);
    } else if (msg.id === 2 && msg.result) {
      // tools/list response
      toolsListResult = msg.result;
      const toolNames = msg.result.tools?.map(t => t.name) || [];
      log(`✓ tools/list OK — ${toolNames.length} tools registered`);

      if (toolNames.length < 10) {
        fail(`Expected >= 10 tools, got ${toolNames.length}`);
      }

      // Required tools must be present
      for (const required of ['query', 'status', 'grep', 'context']) {
        if (!toolNames.includes(required)) {
          fail(`Missing required tool: ${required}`);
        }
      }
      log(`✓ All required core tools present`);
    } else if (msg.id === 3 && msg.result) {
      // status tool response
      statusResult = msg.result;
      log(`✓ status tool OK — got response`);
    } else if (msg.error) {
      fail(`JSON-RPC error id=${msg.id}: ${JSON.stringify(msg.error)}`);
    }
  }

  async function done() {
    clearTimeout(timer);
    dead = true;

    // Verify results
    if (!initializeResult) fail('No initialize response received');
    if (!toolsListResult) fail('No tools/list response received');
    if (!statusResult) fail('No status tool response received');

    log('');
    log('=== SMOKE TEST PASSED ===');
    log(`Server: ${initializeResult.serverInfo?.name} v${initializeResult.serverInfo?.version}`);
    log(`Tools: ${toolsListResult.tools?.length || 0}`);
    log(`Initialize → tools/list → status → shutdown — all OK`);

    child.kill();
    process.exit(0);
  }

  // Wait for server to start, then send initialize
  await new Promise(r => setTimeout(r, 2000));

  if (child.exitCode !== null) {
    fail(`Server exited prematurely with code ${child.exitCode}`);
  }

  log('Sending initialize...');
  send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'smoke-test', version: '1.0.0' },
  });

  // After initialize, send tools/list
  await new Promise(r => setTimeout(r, 1000));
  log('Sending tools/list...');
  send('tools/list', {});

  // After tools/list, call status tool
  await new Promise(r => setTimeout(r, 1000));
  log('Sending tools/call (status)...');
  send('tools/call', { name: 'status', arguments: { repo: repoRoot } });

  // After status, gracefully shut down via SIGTERM
  await new Promise(r => setTimeout(r, 1000));
  log('Sending SIGTERM for graceful shutdown...');
  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });
  child.kill('SIGTERM');
  const exitCode = await Promise.race([exitPromise, new Promise(r => setTimeout(() => r('timeout'), 5000))]);
  if (exitCode === 'timeout') {
    child.kill('SIGKILL');
    log('⚠ Server did not exit within 5s after SIGTERM, sent SIGKILL');
  } else {
    log(`✓ Server exited with code ${exitCode} after SIGTERM`);
  }
  done();
}

main().catch((err) => {
  process.stderr.write(`[smoke] FATAL: ${err.message}\n`);
  process.exit(1);
});
