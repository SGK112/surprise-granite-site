# @webstew/bridge

Run [Webstew](https://webstew.net) workspace chats against your **local Claude Code Pro/Max subscription** instead of paying separate Anthropic API rates.

```
npx @webstew/bridge connect <code>
```

Get the `<code>` from Webstew → **/integrations → Connect Local Bridge**.

## Why

Webstew's AI builder (`/workspace`) talks to Claude. By default, that goes through the Console API and bills against your API credits. If you already pay for **Claude Pro** or **Claude Max**, your subscription already covers Claude usage on your own machine via Claude Code — this bridge proxies your Webstew chats through that same path so your subscription handles the bill.

## How it works

```
[your browser] ──► Webstew server ──► (you have a bridge?) ──► your local CLI
                                                                    │
                                                                    └─► Claude (your sub)
```

1. You click **Connect Local Bridge** in Webstew settings — get a pairing code.
2. You paste the code into `webstew-bridge connect <code>` in your terminal.
3. The bridge process stays running. It long-polls Webstew for any agent requests originating from your account.
4. Each request runs through Claude Agent SDK on your machine, using your Pro/Max subscription. Output streams back to your browser chat.

## Requirements

- Node.js ≥ 18
- An active Webstew account
- An active **Claude Pro** or **Claude Max** subscription, authenticated locally (e.g. via Claude Code or the Anthropic CLI). The bridge uses whatever OAuth credentials Claude Code uses.

## Commands

| Command | What it does |
|---|---|
| `webstew-bridge connect <code>` | Pair with a workspace and start the bridge |
| `webstew-bridge status` | Print connection state |
| `webstew-bridge logout` | Forget saved pairing token |
| `webstew-bridge --version` | Print version + protocol version |

## Where your auth lives

The bridge stores its pairing token at `~/.webstew/bridge.json` with `0600` permissions on POSIX (owner-only). The Claude subscription token itself is owned by Claude Code; the bridge invokes Claude Code rather than re-implementing auth.

## Protocol

See [`src/protocol.ts`](./src/protocol.ts) for the wire contract. Versioned via `PROTOCOL_VERSION`; the server rejects bridges on an incompatible major version with an explicit upgrade hint.

## Not for

- **Production deployments** — the bridge is a developer tool. If you publish a site via Webstew, the deploy pipeline runs on Webstew's infra and doesn't touch your bridge.
- **Multi-user teams** — each user runs their own bridge. There's no concept of a "team bridge" (yet).

## Live E2E test (developer only)

To validate the full flow against a local Webstew dev server:

```bash
# Terminal 1 — Webstew dev server
cd /Users/homepc/ai-website-builder/apps/web
env -u MONGODB_URI npx next dev -p 3000 -H 0.0.0.0
```

```
# Browser
http://localhost:3000/integrations
# → Click "Connect Local Bridge" → copy the pairing code
```

```bash
# Terminal 2 — bridge process pointing at local server
cd /Users/homepc/ai-website-builder/packages/bridge
WEBSTEW_SERVER_URL=http://localhost:3000 npx tsx src/cli.ts connect <code>
# expect: "paired ✓  bridgeId=brg_…", then "bridge online — waiting for work"
```

```
# Browser /integrations should auto-flip to "Connected ✓"
# Browser /workspace → send any chat
# Terminal 2 should log "▶ request …" → "✓ request … N.Ns"
# Browser chat should show streaming text + file updates
```

## Troubleshooting

- **`error: pairing failed (HTTP 400): Pairing code is invalid or expired`**
  Pairing codes are single-use and expire in 10 minutes. Generate a fresh one in `/integrations`.

- **`error: pairing failed (HTTP 426)`**
  Your bridge version is on an incompatible protocol. `npm i -g @webstew/bridge@latest`.

- **`claude exited with code 127` (in bridge logs)**
  The bridge couldn't find the `claude` binary on `PATH`. Install Claude Code first ([claude.com/code](https://claude.com/code)), then restart the bridge.

- **`Local bridge is offline. Start it with webstew-bridge connect …` (in /workspace chat)**
  Bridge process isn't running, or hasn't checked in for 60s. Restart it in the terminal.

## License

MIT
