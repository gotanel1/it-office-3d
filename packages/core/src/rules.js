// Maps Claude Code tools to the desks of an IT department. Claude Code has no real roles: these rules read
// the tool name, the file it touches and the shell command, and pick the job that would normally do it.
// The PM (team lead) is not a desk: they walk around and hand out the work.
export const ROLES = ['BA', 'SA', 'Architect', 'UX', 'Dev', 'DBA', 'QA', 'DevOps', 'Security', 'Writer'];

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'Skill']);
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const PLAN_TOOLS = new Set(['EnterPlanMode', 'ExitPlanMode', 'TodoWrite', 'TaskCreate', 'TaskUpdate']);
const ASK_TOOLS = new Set(['AskUserQuestion']);
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

// Checked in order: the first match wins, so the narrow jobs come before the broad ones.
const COMMAND_RULES = [
  ['Security', /\b(npm audit|pnpm audit|yarn audit|pip-audit|snyk|trivy|semgrep|gitleaks|bandit|nmap|zap)\b/i],
  ['DBA', /\b(psql|mysql|sqlite3|mongosh|redis-cli|prisma|knex|sequelize|alembic|flyway|migrate)\b/i],
  ['DevOps', /\b(git|gh|docker|docker-compose|kubectl|helm|terraform|ansible|ssh|scp|systemctl|deploy|vercel|netlify|npm (install|i|ci)|pnpm (install|add)|yarn (add|install)|pip install|apt(-get)?|brew)\b/i],
  ['QA', /\b(test|tests|build|pytest|jest|vitest|mocha|playwright|cypress|tsc|lint|eslint|typecheck|check|cargo test|go test)\b/i],
];

const FILE_RULES = [
  ['Writer', /\.(md|mdx|txt|rst|adoc)$/i],
  ['UX', /\.(css|scss|sass|less|html|svg)$/i],
  ['DBA', /(\.sql$|migrations?\/)/i],
  ['DevOps', /(dockerfile|\.ya?ml$|\.tf$|\.github\/)/i],
];

const MCP_RULES = [
  ['UX', /figma|stitch|design/i],
  ['DBA', /postgres|mysql|sqlite|supabase|database|mongo/i],
  ['DevOps', /github|gitlab|vercel|aws|docker|kubernetes|cloudflare/i],
];

const firstMatch = (rules, text) => rules.find(([, re]) => re.test(text))?.[0] ?? null;

// Subagent types (or their descriptions) are matched by keyword. Anything unknown goes to Dev.
export function roleForAgentType(type = '') {
  const t = String(type).toLowerCase();
  if (/(secur|pentest|vuln)/.test(t)) return 'Security';
  if (/(requirement|business|product|stakeholder)/.test(t)) return 'BA';
  if (/(plan|architect|design-system|system-design)/.test(t)) return 'Architect';
  if (/(explor|research|guide|search|investigat|analy)/.test(t)) return 'SA';
  if (/(test|review|verif|qa|audit|check)/.test(t)) return 'QA';
  if (/(summar|writer|report|doc)/.test(t)) return 'Writer';
  if (/(ui|ux|design|style)/.test(t)) return 'UX';
  if (/(database|sql|schema|migration|\bdb\b)/.test(t)) return 'DBA';
  if (/(deploy|devops|infra|release|\bci\b)/.test(t)) return 'DevOps';
  return 'Dev';
}

// `command` is the shell command, `subagentType` is tool_input.subagent_type for Agent/Task calls,
// `file` is the (shortened) path of the file a tool reads or writes.
export function roleForTool(tool, command = '', subagentType = '', file = '') {
  if (!tool) return null;
  if (tool.startsWith('mcp__')) return firstMatch(MCP_RULES, tool) ?? 'SA';
  if (READ_TOOLS.has(tool)) return 'SA';
  if (ASK_TOOLS.has(tool)) return 'BA';
  if (PLAN_TOOLS.has(tool)) return 'Architect';
  if (WRITE_TOOLS.has(tool)) return firstMatch(FILE_RULES, file ?? '') ?? 'Dev';
  if (SUBAGENT_TOOLS.has(tool)) return roleForAgentType(subagentType);
  if (tool === 'Bash' || tool === 'PowerShell') return firstMatch(COMMAND_RULES, command ?? '') ?? 'Dev';
  return null;
}
