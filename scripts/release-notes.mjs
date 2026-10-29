// Prints the release notes for a tag (v0.4.0) from vscode/CHANGELOG.md. Used by the release workflow.
import fs from 'node:fs';

const version = process.argv[2].replace(/^v/, '');
const changelog = fs.readFileSync(new URL('../vscode/CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const entry = changelog.split(/^## /m).find((part) => part.startsWith(`${version}\n`));
if (!entry) {
  console.error(`vscode/CHANGELOG.md has no entry for ${version}`);
  process.exit(1);
}
console.log(`${entry.slice(version.length).trim()}

Download the \`.vsix\` below and run **Extensions: Install from VSIX...** in VS Code, Cursor, Antigravity or another compatible editor. VS Code Marketplace publication is a separate manual step by the maintainer.`);
