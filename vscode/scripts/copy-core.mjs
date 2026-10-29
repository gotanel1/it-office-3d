// Copies the engine (server, page, three.js), the hook scripts and the licences into the extension before
// packaging, because a .vsix can only contain files from this folder. bundle/ mirrors the repository layout
// (scripts/ next to packages/core/), so the hook scripts find the engine there as they do in the repository.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(ext, '..');
const bundle = path.join(ext, 'bundle');

fs.rmSync(bundle, { recursive: true, force: true });
fs.rmSync(path.join(ext, 'core'), { recursive: true, force: true });
for (const part of ['src', 'public', 'package.json']) {
  fs.cpSync(path.join(repo, 'packages', 'core', part), path.join(bundle, 'packages', 'core', part), { recursive: true });
}
for (const file of ['hook.sh', 'connect.mjs']) {
  fs.cpSync(path.join(repo, 'scripts', file), path.join(bundle, 'scripts', file));
}
for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(repo, file), path.join(ext, file));
console.log('copied the engine and hook scripts into vscode/bundle');
