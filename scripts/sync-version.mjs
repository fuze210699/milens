// Runs as npm's "version" lifecycle script (triggered by `npm version <bump>`).
// npm has already written the new version into package.json/package-lock.json by
// this point but hasn't committed yet — so any file this script touches gets
// swept into that same version-bump commit if git-added before npm exits.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));

const pluginManifestPath = 'adapters/claude-code/.claude-plugin/plugin.json';
const manifest = JSON.parse(readFileSync(pluginManifestPath, 'utf-8'));
manifest.version = version;
writeFileSync(pluginManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

execFileSync('git', ['add', pluginManifestPath]);

console.log(`Synced version ${version} -> ${pluginManifestPath}`);
