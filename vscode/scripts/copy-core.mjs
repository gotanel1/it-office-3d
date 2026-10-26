// Copies the engine (server, page, three.js) and the licences into the extension before packaging,
// because a .vsix can only contain files from this folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(ext, '..');
const core = path.join(ext, 'core');

fs.rmSync(core, { recursive: true, force: true });
for (const part of ['src', 'public', 'package.json']) {
  fs.cpSync(path.join(repo, 'packages', 'core', part), path.join(core, part), { recursive: true });
}
for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(repo, file), path.join(ext, file));
console.log('copied the engine into vscode/core');
