// Starts the server and plays a fake session through it. No Claude Code needed.
import { startServer } from '../src/server.js';
import { openBrowser } from '../src/cli.js';

const SESSION = 'demo-session';
// Long enough for the PM to walk to each desk and brief the person there.
const STEP_MS = 4200;

// One tool call per desk, in a plausible order. A tool's PostToolUse repeats its file or command,
// because that is what picks the desk. `note` is the one-line summary Claude attaches to Bash and Agent calls.
const calls = [
  { tool: 'AskUserQuestion' },
  { tool: 'Agent', subagent_type: 'Explore', note: 'Find where the server starts' },
  { tool: 'TodoWrite' },
  { tool: 'Edit', path: 'public/style.css' },
  { tool: 'Edit', path: 'src/state.js' },
  { tool: 'Write', path: 'migrations/001_users.sql' },
  { tool: 'Bash', command: 'npm test', note: 'Run the core test suite' },
  { tool: 'Bash', command: 'git commit -m "Add users"', note: 'Commit the users feature' },
  { tool: 'Bash', command: 'npm audit', note: 'Check dependencies for known vulnerabilities' },
  { tool: 'Edit', path: 'docs/README.md' },
];
const script = [
  { event: 'UserPromptSubmit' },
  ...calls.flatMap((call) => [{ event: 'PreToolUse', ...call }, { event: 'PostToolUse', ...call }]),
  { event: 'SubagentStop', role: 'Dev' },
  { event: 'Stop' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The demo replays forever so a page opened late still sees the action. Use --once to play a single time.
const once = process.argv.includes('--once');
const noOpen = process.argv.includes('--no-open');

const { url, close } = await startServer({ preferredPort: 3737 });
console.log(`demo running at ${url}`);
console.log('Open that address in a browser if it did not open by itself. Press Ctrl+C to stop.');
if (!noOpen) openBrowser(url);

const shutdown = async () => {
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const post = (route, body) =>
  fetch(`${url}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

async function playOnce() {
  for (const step of script) {
    await post('event', { ...step, session_id: SESSION });
    console.log(`sent ${step.event}${step.tool ? ` (${step.tool})` : ''}`);
    // Finishing a tool is quick; starting one gives the PM time to walk over.
    await sleep(step.event === 'PostToolUse' ? 1000 : STEP_MS);
  }
}

// Wait briefly so the page can connect before the first event.
await sleep(STEP_MS);

for (;;) {
  await playOnce();
  if (once) break;
  console.log('demo finished, replaying in a few seconds...');
  await sleep(8000);
  await post('reset');
  await sleep(3000);
}
console.log('demo finished. Press Ctrl+C to stop the server.');
