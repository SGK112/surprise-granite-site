// Invoke the local `claude` CLI for one agent turn, stream events back
// to the caller as BridgeResponse chunks.
//
// Why CLI instead of @anthropic-ai/claude-agent-sdk:
// - User already has `claude` on PATH if they have Pro/Max — zero extra
//   install for the bridge to work.
// - The CLI's `--output-format stream-json` emits one JSON event per
//   line which is trivial to parse line-buffered.
// - Same auth path as Claude Code (subscription tokens, OAuth refresh,
//   --resume sessions) — the bridge inherits whatever the user already
//   authenticated.
//
// Flow per request:
//   1. Materialize the project VFS into a per-project workspace dir
//      (write each file, mkdir -p as needed).
//   2. Snapshot the dir (path → contents map) so we can diff after.
//   3. Spawn `claude --print "..." --output-format stream-json [...]`
//      with cwd = workspace dir.
//   4. Read its stdout line-by-line, parse each JSON event, map to a
//      BridgeResponse chunk, hand to the onEvent callback.
//   5. On process exit, diff dir vs snapshot — emit file_update for
//      changed/new files, file_delete for removed.
//   6. Emit `done` (or `error` on non-zero exit).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { AgentRunRequest, BridgeResponse } from './protocol'
import { workspaceDirFor, ensureMcpConfig } from './auth'

// CLI flag mapping. Versions of `claude` may differ — these are the
// stable v0.x flags. If a flag is unsupported the CLI errors out; we
// surface the error in the BridgeResponse so the user sees it in chat.
function pickModelFlag(model?: string): string[] {
  // Only pass --model when it's a real Claude Code model identifier
  // (claude-opus-4-x, claude-sonnet-4-x, claude-haiku-4-x, etc.).
  // Webstew's selector also has 'auto' (server router), 'gpt-4o', etc.
  // — those would make claude exit 1 with no stderr. Skip them, let
  // claude use its own default (which is whatever the user picked in
  // Claude Code settings).
  if (!model) return []
  if (!/^claude-(opus|sonnet|haiku)-/i.test(model)) return []
  return ['--model', model]
}

interface RunOpts {
  request: AgentRunRequest
  requestId: string
  onEvent: (chunk: BridgeResponse) => Promise<void>
  // Override claude binary path (mainly for testing). Defaults to
  // `claude` from PATH.
  claudeBin?: string
  // Cancellation: aborted when the runtime detects BridgeCancelled.
  // We SIGTERM the spawned claude child so subscription tokens stop
  // burning the moment the user clicks Stop in the workspace UI.
  signal?: AbortSignal
}

export async function runClaudeOnce(opts: RunOpts): Promise<void> {
  const { request, requestId, onEvent } = opts
  const projectId = request.projectId || '_unscoped_'
  const workspaceDir = workspaceDirFor(projectId)

  // 1a. Drop a CLAUDE.md ONLY for real project work (the request carries
  //     a VFS or a target). It tells claude it's the website-builder Chef
  //     (Edit over Bash, /api/media for images, preserve scope, etc.).
  //     For a RAW prompt dispatch — no files, no target — the prompt is
  //     self-contained (e.g. SG blueprint takeoff: "curl this image, read
  //     it, return takeoff JSON"). Dropping the Chef CLAUDE.md there
  //     HIJACKS the task: claude acts like a site editor and echoes empty
  //     results instead of reading the sheet. So skip it, and clear any
  //     stale copy left in the shared _unscoped_ workspace.
  const hasProject =
    (request.files && Object.keys(request.files).length > 0) || !!request.target
  if (hasProject) {
    writeClaudeMd(workspaceDir, request.target)
  } else {
    try { fs.rmSync(path.join(workspaceDir, 'CLAUDE.md'), { force: true }) } catch {}
  }
  // 1b. Materialize the VFS to disk.
  writeVfs(workspaceDir, request.files || {})
  // 2. Snapshot for diffing after the run.
  const before = snapshotDir(workspaceDir)

  // 3. Spawn claude.
  // Flag rationale:
  //   --print               non-interactive (no REPL)
  //   --output-format stream-json   one JSON event per stdout line
  //   --verbose             REQUIRED with --print + stream-json; CLI
  //                         errors otherwise
  //   --permission-mode acceptEdits
  //                         critical: without this, claude won't write
  //                         files (no human at the TTY to grant
  //                         permission). The user invoking the chat
  //                         already authorized changes by asking.
  //   --dangerously-skip-permissions
  //                         fallback for older CLI versions that
  //                         don't recognize --permission-mode; the
  //                         CLI ignores unknown flags before the
  //                         positional prompt arg.
  // Pass --mcp-config so claude loads the webstew MCP server (switch_target,
  // cms, integrations, etc.). ensureMcpConfig() writes ~/.sg-bridge/mcp.json if
  // it doesn't exist yet and returns the path. The file is written once; later
  // calls are a no-op so users can extend it manually.
  const mcpConfigPath = ensureMcpConfig()
  const args = [
    '--print',
    request.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    // Skip all permission prompts. User already authorized by
    // submitting the request via the workspace UI.
    '--dangerously-skip-permissions',
    '--mcp-config',
    mcpConfigPath,
    ...pickModelFlag(request.model),
  ]
  if (request.maxIterations) {
    args.push('--max-turns', String(request.maxIterations))
  }

  const child = spawn(opts.claudeBin || 'claude', args, {
    cwd: workspaceDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Hard-kill the child when the runtime aborts (BridgeCancelled).
  // SIGTERM first; SIGKILL after 1s if it hasn't exited (claude is
  // usually mid-API-call so SIGTERM is enough). The readline loop
  // below will see stdin EOF and exit naturally once the child dies.
  let aborted = false
  if (opts.signal) {
    const onAbort = () => {
      aborted = true
      try { child.kill('SIGTERM') } catch {}
      setTimeout(() => {
        if (!child.killed) {
          try { child.kill('SIGKILL') } catch {}
        }
      }, 1000)
    }
    if (opts.signal.aborted) onAbort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }

  // Timeout safety: if the claude process hangs for >90s (likely waiting
  // on stdin for a permission prompt due to unsupported --permission-mode
  // flag), kill it and emit an error.
  const processTimeout = setTimeout(() => {
    if (!child.killed) {
      stderr += '\n[bridge] Process hung for 90s, killing.'
      try { child.kill('SIGKILL') } catch {}
    }
  }, 90_000)

  let stderr = ''
  let stdoutTail = ''
  let lastStdoutAt = Date.now()
  child.stderr.on('data', (b) => { stderr += b.toString() })
  // Mirror stdout to a tail buffer too — when claude exits 1 with no
  // stderr, the error is often a single non-JSON line on stdout that
  // never makes it through our line-by-line parser before the process
  // closes. Capturing the tail lets us surface it on failure.
  child.stdout.on('data', (b) => {
    lastStdoutAt = Date.now()
    stdoutTail = (stdoutTail + b.toString()).slice(-2000)
  })

  // 4. Line-by-line JSON event stream.
  const rl = readline.createInterface({ input: child.stdout })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let evt: any
    try { evt = JSON.parse(trimmed) } catch {
      // Non-JSON line — surface as a text event so the user sees
      // whatever claude printed.
      await onEvent({ requestId, kind: 'text', data: { text: trimmed } })
      continue
    }
    await emitEventFromClaude(evt, requestId, onEvent)
  }

  // 5. Process exit.
  const exitCode: number = await new Promise((res) => {
    child.on('close', (c) => {
      clearTimeout(processTimeout)
      res(c ?? 1)
    })
  })

  // 6. Diff filesystem and emit file_update / file_delete.
  const after = snapshotDir(workspaceDir)
  for (const [p, contents] of after) {
    if (before.get(p) !== contents) {
      await onEvent({ requestId, kind: 'file_update', data: { path: p, contents } })
    }
  }
  for (const p of before.keys()) {
    if (!after.has(p)) {
      await onEvent({ requestId, kind: 'file_delete', data: { path: p } })
    }
  }

  if (exitCode !== 0) {
    // Don't surface an "error" event when the user explicitly aborted
    // — that path already emits its own cancelled signal up the chain.
    if (aborted) return
    process.stderr.write(
      `\n[claude-runner] exit ${exitCode}\n` +
      `[claude-runner] cwd: ${workspaceDir}\n` +
      `[claude-runner] bin: ${opts.claudeBin || 'claude'}\n` +
      `[claude-runner] args: ${JSON.stringify(args)}\n` +
      `[claude-runner] stderr:\n${stderr || '(empty)'}\n` +
      `[claude-runner] stdout tail:\n${stdoutTail || '(empty)'}\n\n`
    )
    const detail =
      stderr.trim().slice(-400) ||
      stdoutTail.trim().slice(-400) ||
      'No stderr or stdout — likely an invalid CLI flag combination.'
    await onEvent({
      requestId,
      kind: 'error',
      data: { message: `claude exited with code ${exitCode}. ${detail}` },
    })
    return
  }
  await onEvent({ requestId, kind: 'done', data: { summary: 'Done.', iterations: 0 } })
}

// Map one claude stream-json event to our BridgeResponse schema. The
// claude CLI's event shapes (as of v0.x): { type: 'system'|'assistant'|
// 'user'|'result'|... , ... }. We translate to our subset; unknown
// types are skipped silently — better to under-emit than to spam the
// chat with internal noise.
async function emitEventFromClaude(
  evt: any,
  requestId: string,
  onEvent: (c: BridgeResponse) => Promise<void>
) {
  // Assistant text token / message
  if (evt.type === 'assistant' && evt.message?.content) {
    const blocks = Array.isArray(evt.message.content) ? evt.message.content : []
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        await onEvent({ requestId, kind: 'text', data: { text: block.text } })
      } else if (block.type === 'tool_use') {
        await onEvent({
          requestId,
          kind: 'tool_use',
          data: { id: block.id, name: block.name, input: block.input },
        })
      }
    }
    return
  }
  // Tool result echoed back into the conversation
  if (evt.type === 'user' && Array.isArray(evt.message?.content)) {
    for (const block of evt.message.content) {
      if (block.type === 'tool_result') {
        const c = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content).slice(0, 2000)
        await onEvent({
          requestId,
          kind: 'tool_result',
          data: {
            tool_use_id: block.tool_use_id,
            ok: !block.is_error,
            content: c,
          },
        })
      }
    }
    return
  }
  // Final result row — claude emits this last. We ignore here because
  // we synthesize our own `done` event after diffing the filesystem,
  // which carries the post-run file state. Letting claude's `result`
  // through would race the diff.
  if (evt.type === 'result') return
  // System / model setup events — drop. Plumbing chatter not useful in
  // the workspace chat thread.
}

// ── Filesystem helpers ────────────────────────────────────────────────

function writeVfs(root: string, files: Record<string, string>): void {
  for (const [rel, contents] of Object.entries(files)) {
    const safe = sanitizeRel(rel)
    if (!safe) continue
    const full = path.join(root, safe)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, contents)
  }
}

// Filenames the bridge writes for its own bookkeeping. Excluded from
// snapshot diff so they don't surface as user project changes.
const BRIDGE_OWNED_FILES = new Set(['CLAUDE.md'])

function snapshotDir(root: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!fs.existsSync(root)) return out
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue // skip dotfiles like .git
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
      } else if (ent.isFile()) {
        const rel = path.relative(root, full)
        if (BRIDGE_OWNED_FILES.has(rel)) continue
        try {
          out.set(rel, fs.readFileSync(full, 'utf8'))
        } catch {
          // Binary or unreadable — skip; the workspace shouldn't contain
          // binaries in v1 (HTML/CSS/JS/MD only).
        }
      }
    }
  }
  walk(root)
  return out
}

function sanitizeRel(p: string): string | null {
  // Reject absolute paths and traversal — same rule the agent route
  // applies on the server side.
  if (!p || p.startsWith('/') || p.includes('..')) return null
  return p
}

// CLAUDE.md written into the workspace dir so claude has the same
// project context the direct-Anthropic agent route's system prompt
// gives. Without this, bridge claude is a generic Claude Code session
// that doesn't know it's editing a live Webstew site preview, defaults
// to Bash where Edit would do, and ignores Webstew's image proxy.
function writeClaudeMd(root: string, target?: string): void {
  const targetLabel =
    target === 'nextjs' ? 'Next.js app'
    : target === 'react' ? 'Vite + React app'
    : target === 'astro' ? 'Astro site'
    : target === 'expo'  ? 'React Native / Expo app'
    : 'single-page HTML website'
  const md = `# Webstew project — Chef context

You are the **Chef** — the AI cook inside a live Webstew workspace
session. The user sees a real-time browser preview of this directory.
Every file you write here ships to their preview iframe immediately,
and (when they're on a saved project) persists to Mongo so it survives
a refresh. Your subscription is paying for this call — be efficient
but generous.

## What Webstew is
Webstew (https://surprise-granite-email-api.onrender.com) is an AI website + app builder. One
prompt turns into a production-ready site, store, or mobile app the
user can deploy. They picked you (their local Claude Code) as the brain
so their subscription handles the bill instead of API credits.

## What the user has at their disposal in this workspace

**Build targets** — the user can scaffold any of these from the same chat:
- **website** — single \`index.html\`, Tailwind via CDN, vanilla JS. ← THIS PROJECT
- **nextjs** — full Next.js 14 app router, Tailwind, TypeScript
- **astro** — content-focused static sites, MDX, islands
- **react** — Vite + React + TypeScript SPA
- **expo** — React Native mobile app (iOS + Android), Expo Router

**CMS** — every project can have content collections (blog posts,
services, team members, products). Use the MCP tools:
\`webstew_list_cms_collections\` → see what exists, then
\`webstew_list_cms_items(collection)\` → see items, then
\`webstew_create_cms_item(collection, slug, fields)\` → write new items.
Field names must match the collection's schema. Default status is
"published" — pass status: "draft" to stage.

**Integrations** (Composio): Gmail, Slack, HubSpot, Salesforce, Google
Sheets, Drive, Calendar, Microsoft Teams, Intercom, Zendesk, Jira,
Monday, Stripe, Shopify, LinkedIn, Facebook, GitHub, QuickBooks,
Google Ads. Three-step flow:
1. \`webstew_list_integrations\` → see what's connected. If the user's
   requested toolkit isn't there, tell them to connect it at
   /integrations (you can offer to open that panel via
   \`webstew_open_panel("integrations", ...)\`).
2. \`webstew_list_integration_actions(toolkit)\` → see available verbs.
   NEVER guess action slugs — always confirm here first.
3. \`webstew_run_integration_action(action, args)\` → do the thing.

**Image pipeline** — Two paths:
- For images you ADD: write \`<img src="/api/media?q=KEYWORDS&w=W&h=H">\`
  directly into HTML (Webstew proxies Pexels). No tool call needed.
- For user-supplied images they want stored permanently: call
  \`webstew_upload_image(sourceUrl)\` → returns a Cloudinary URL.

**Workspace navigation** — \`webstew_open_panel(panel, reason)\` opens
any sidebar panel for the user (build, templates, projects, images,
video, integrations, env, console, deploy, webstew). User sees an
Approve/Deny modal. Use when their task is better done in a panel
(e.g. "open integrations so you can connect Slack").

**Deploy** — Render integration (auto-deploy from generated project),
GitHub push, custom domains. Use \`webstew_open_panel("deploy", ...)\`
to surface the deploy UI for them.

**Grader** — \`webstew_grade_site(url)\` runs SEO + AI-visibility scoring
on any public URL and returns issues. After grading, fix the top 2-3
actionable items yourself instead of pasting the report back.

**Marketplace** — Users can publish their sites as templates others
buy (Stripe Connect, 30% platform fee). Read-only from chat.

## This project: ${targetLabel}

Working dir: this dir IS the project. No \`cd\`.
${target === 'website' || !target
  ? '- One file: `index.html`. Tailwind via CDN, vanilla JS. Edit in place.'
  : '- Multi-file. Run `Glob \"**/*\"` once if you don\'t know the layout.'}
${target === 'expo' ? `
## ⚠ EXPO — FILE WRITES ONLY, NO SHELL COMMANDS

The workspace preview renders the VFS files directly — local npm installs,
npx commands, and package manager operations do NOTHING here and will time
out the session. NEVER run:
- npm install / npm ci / yarn / pnpm install
- npx create-expo-app or any scaffolding CLI
- npx expo start / npx expo build
- Any Bash command that installs, builds, or starts a dev server

**Write JSX/TSX files directly.** Assume these are pre-installed and can
be imported without any install step:
- react, react-native (View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, TextInput, FlatList, etc.)
- expo (Expo.* APIs)
- @expo/vector-icons (Ionicons, MaterialIcons, etc.)
- expo-router (Link, Stack, Tabs — use file-based routing under app/)
- expo-linear-gradient, expo-blur, expo-status-bar

**package.json — required web script:**
Every expo project MUST include this script so the browser preview can start:
\`\`\`json
{
  "scripts": {
    "web": "expo start --web",
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios"
  }
}
\`\`\`
If you create or modify package.json, always include \`"web": "expo start --web"\`.

**First response in a new expo project — minimal files only:**
Write these files and nothing else:
1. \`package.json\` — with the scripts above + minimal deps: react, react-native, expo, expo-status-bar
2. \`app/index.tsx\` (expo-router) OR \`App.js\` (bare) — one complete screen

No app.json changes, no babel.config, no tsconfig, no additional screens
unless the user explicitly asked for them. Start lean — iterate from there.
` : ''}

## ⚠ TARGET MISMATCH — handle via tool call, not by asking the user

The user is currently on the **${targetLabel}** target. If their
request clearly implies a DIFFERENT target, call the
**\`mcp__webstew__webstew_switch_target\`** tool. The user gets an
Approve/Deny modal automatically — do NOT ask them to switch manually
in the sidebar.

Flow:
1. Detect mismatch (see triggers below).
2. Call \`mcp__webstew__webstew_switch_target\` with \`target\` + \`reason\` args
   — e.g. \`{target: "expo", reason: "You asked for a mobile app — the current workspace is HTML."}\`.
3. The tool blocks while the user clicks Approve / Deny.
4. **Approved** → tool returns success. End this turn with a one-liner
   ("Switched to Expo. Tell me about the app — features, screens, vibe.")
   and STOP. Don't try to scaffold the new project in the same turn —
   the user's next message lands in the new target.
5. **Declined** → tool returns "declined". Acknowledge ("Staying here
   then.") and offer the closest thing you CAN do in the current
   target (e.g. responsive HTML).

Trigger examples:
- "Build me a mobile app" / "iOS / Android / native / Expo / push notifications" → \`expo\`
- "Build a Next.js site" / "server components" / "API routes" / "SSR" → \`nextjs\`
- "Build a blog with MDX" / "static site generator" / "content collections" → \`astro\`
- "Build a React SPA" / "Vite" / "client-side routing" → \`react\`

If the request *could* work in the current target (e.g. "make my site
mobile-responsive" on the website target — yes, responsive CSS works),
just do it. Mismatch only applies when the OUTPUT FORMAT requires a
different runtime.

If \`mcp__webstew__webstew_switch_target\` isn't in your tool list, the
MCP server didn't load — tell them to run \`sg-bridge connect\`
(no code needed) and retry. Don't ask them to switch manually.

## Your toolkit

**Standard Claude Code tools** (always available):
Read, Write, Edit, Bash, Glob, Grep, plus whatever MCP servers the
user has installed in their own Claude Code config (\`~/.claude/\`).

**Webstew MCP tools** (loaded at startup via \`@webstew/agent-tools\`).
Tool names are prefixed \`mcp__webstew__webstew_*\`. Call them directly —
no schema-loading step required in this environment.

- \`mcp__webstew__webstew_switch_target(target, reason)\` — switch workspace target (website / nextjs / astro / react / expo). User approval in chat.
- \`mcp__webstew__webstew_open_panel(panel, reason)\` — open sidebar panel. User approval in chat.
- \`mcp__webstew__webstew_list_cms_collections\` / \`webstew_list_cms_items\` / \`webstew_create_cms_item\` — CMS read/write.
- \`mcp__webstew__webstew_upload_image(sourceUrl)\` — store image in Cloudinary.
- \`mcp__webstew__webstew_grade_site(url)\` — SEO + AI-visibility scoring.
- \`mcp__webstew__webstew_list_integrations\` / \`webstew_list_integration_actions(toolkit)\` / \`webstew_run_integration_action(action, args)\` — Slack, Gmail, HubSpot, Stripe, Shopify, etc.

If you don't see any \`mcp__webstew__*\` tools in your tool list, the
MCP server didn't load — tell the user to run \`sg-bridge connect\`
(no code needed if already paired) and retry.

## How to edit (THE MOST IMPORTANT RULES)
- **Make the SMALLEST change that satisfies the literal request.** If
  the user says "change the title", change the \`<title>\` tag (and
  \`<h1>\` if clearly implied) and NOTHING else. Same image URLs, same
  copy, same classes, same comments, same whitespace.
- **Prefer Edit over Write** for narrow changes. Edit is surgical;
  Write/full-rewrites drift unrelated content.
- **Never touch \`background-image\`, \`src="..."\`, \`url(...)\` URLs**
  when changing colors or theme. Hero bg-images disappearing is a
  recurring bug from blanket rewrites — don't be that bug.
- One sentence of prose max before tool calls. No "let me start by…"
  preambles. Get cooking.

## Images
- For images you ADD: \`<img src="/api/media?q=KEYWORDS&w=W&h=H">\` —
  Webstew's Pexels-backed proxy. Keywords describe content, not feature
  names. Example: \`q=modern+startup+team\` not \`q=hero1\`.
- DO NOT emit \`picsum.photos\`, \`source.unsplash.com\`, or
  \`loremflickr.com\` — they're dead or rate-limited.

## Empty workspace
If you arrive and the directory is empty (no index.html), the user
hasn't generated a site yet. Don't pretend they have one — offer to
generate a starter (write a complete index.html based on what they
describe), OR direct them to click "Build" in the workspace and pick
a template.

## Selected-element prompts
When the user's prompt starts with \`User has selected this element in
the live preview:\` followed by a code block, edit ONLY that exact
node. Locate it by literal substring; touch nothing outside it.

## Conversational asks
If they say "hi" or ask a meta-question, answer briefly chef-style
("Ready to cook — what are we making?") and ask what they want to
build/change. Don't invent edits.
`
  try {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), md)
  } catch {
    // Non-fatal — claude works without it, just less Webstew-aware.
  }
}
