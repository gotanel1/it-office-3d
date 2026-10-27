// Starts the background server if needed and opens the 3D office in the default browser.
//   node scripts/open.mjs [--no-open]
import { spawn } from 'node:child_process';
import { ensureServer } from './lib.mjs';

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The address is printed anyway, so the user can open it by hand.
  }
}

const info = await ensureServer({ wait: 8000 });
if (info) {
  console.log(`IT-Office-3D is running at ${info.url}`);
  if (!noOpen) openBrowser(info.url);
} else {
  console.log('IT-Office-3D could not start its local server. Make sure Node.js 18 or newer is installed, then try again.');
}
// Let Node exit by itself, as in hook.mjs: process.exit() right after spawning the server aborts Node on
// Windows (libuv assertion in win/async.c).
process.exitCode = info ? 0 : 1;
setTimeout(() => process.exit(), 2000).unref();
