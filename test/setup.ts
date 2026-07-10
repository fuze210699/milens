import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Isolate RepoRegistry (and anything else keyed off MILENS_HOME) from the
// real user's ~/.milens for the whole test run. Vitest runs test files in
// parallel and resets module state per file (isolate: true is the default),
// so a random suffix generated here gives every test FILE its own registry
// directory — a fixed shared path would still let concurrently-running
// files race on the same registry.json.
process.env.MILENS_HOME = join(tmpdir(), `milens-test-${randomUUID()}`);
