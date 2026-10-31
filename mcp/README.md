# ClipGringa MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[ClipGringa](https://clipgringa.gringatools.com) — turn long-form videos (YouTube links or
direct URLs) into short, vertical, subtitled viral clips from any MCP client
(Claude Desktop, Claude Code, Cursor, etc.).

By default it talks to the **official hosted ClipGringa API** at
`https://api.clipgringa.gringatools.com`. Point it at your own deployment by setting
`CLIPGRINGA_API_URL`.

## What it can do

| Tool | Auth | Description |
|------|:----:|-------------|
| `clipgringa_health` | – | API status + how this server is configured |
| `clipgringa_list_caption_templates` | – | Available caption styles (default, hormozi, mrbeast, …) |
| `clipgringa_list_transitions` | – | Available transition effects |
| `clipgringa_broll_status` | – | Whether B-roll overlays are configured |
| `clipgringa_list_fonts` | ✓ | Subtitle fonts available to your account |
| `clipgringa_billing_summary` | ✓ | Plan, usage and remaining quota |
| `clipgringa_create_clip_task` | ✓ | Start clipping a video → returns a `task_id` |
| `clipgringa_list_tasks` | ✓ | List your tasks |
| `clipgringa_get_task` | ✓ | Task status, progress and clips |
| `clipgringa_wait_for_task` | ✓ | Poll until a task finishes |
| `clipgringa_list_clips` | ✓ | List a task's generated clips |
| `clipgringa_download_clip` | ✓ | Save a clip's MP4 to disk |
| `clipgringa_export_clip` | ✓ | Re-encode + save with a platform preset (tiktok/reels/shorts) |
| `clipgringa_cancel_task` / `clipgringa_resume_task` / `clipgringa_delete_task` | ✓ | Manage tasks |

Tools marked ✓ require an API key (or self-host credentials, see below).

## Getting an API key

1. Sign in at [clipgringa.gringatools.com](https://clipgringa.gringatools.com).
2. Go to **Settings → API Keys**.
3. Create a key and copy it (it's shown only once). It looks like `sk_…`.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIPGRINGA_API_KEY` | – | Your API key (recommended auth). |
| `CLIPGRINGA_API_URL` | `https://api.clipgringa.gringatools.com` | Backend base URL. Set for self-hosting. |
| `CLIPGRINGA_DOWNLOAD_DIR` | `./clipgringa-downloads` | Where downloaded/exported clips are written. |
| `CLIPGRINGA_TIMEOUT` | `60` | HTTP timeout (seconds) for non-download requests. |
| `CLIPGRINGA_USER_ID` | – | Self-host only: authenticate by user id (see below). |
| `CLIPGRINGA_AUTH_SECRET` | – | Self-host only: backend `BACKEND_AUTH_SECRET` for HMAC signing. |

### Self-hosting auth

If you run your own backend you have three options:

- **API key** (same as hosted): create a key and set `CLIPGRINGA_API_KEY`.
- **Signed headers**: set `CLIPGRINGA_USER_ID` + `CLIPGRINGA_AUTH_SECRET` (your
  backend's `BACKEND_AUTH_SECRET`).
- **Unsigned**: if the backend runs with `ALLOW_UNSIGNED_BACKEND_AUTH=true`,
  just set `CLIPGRINGA_USER_ID`.

Auth precedence is: API key → signed headers → unsigned user id.

## Install & run

Requires Python 3.10+. With [uv](https://docs.astral.sh/uv/):

```bash
cd mcp
uv run clipgringa-mcp        # runs the stdio server
```

Or install into the current environment:

```bash
pip install -e .
clipgringa-mcp
```

## Hosted SSE server

For clients that add a remote MCP URL, run the server over SSE and require a
ClipGringa API key as the client Bearer token:

```bash
CLIPGRINGA_API_URL=https://api.clipgringa.gringatools.com \
CLIPGRINGA_MCP_TRANSPORT=sse \
CLIPGRINGA_MCP_HOST=0.0.0.0 \
CLIPGRINGA_MCP_PORT=9100 \
CLIPGRINGA_MCP_PUBLIC_URL=https://mcp.clipgringa.gringatools.com \
CLIPGRINGA_MCP_REQUIRE_BEARER_AUTH=true \
clipgringa-mcp
```

Then configure the MCP client with:

```text
Server URL: https://mcp.clipgringa.gringatools.com/sse
Transport: SSE
Authentication: Bearer Token
Token: sk_your_clipgringa_api_key
```

With Docker Compose, the `mcp` service runs this mode by default and binds to
`127.0.0.1:9100` for a reverse proxy.

## Use with Claude Desktop / Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json`, or via
`claude mcp add`). Example using `uv` to run from a checkout:

```json
{
  "mcpServers": {
    "clipgringa": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/clipgringa/mcp", "run", "clipgringa-mcp"],
      "env": {
        "CLIPGRINGA_API_KEY": "sk_your_key_here"
      }
    }
  }
}
```

For a self-hosted backend, add `"CLIPGRINGA_API_URL": "http://localhost:8000"` to `env`.

With Claude Code:

```bash
claude mcp add clipgringa -e CLIPGRINGA_API_KEY=sk_your_key_here \
  -- uv --directory /absolute/path/to/clipgringa/mcp run clipgringa-mcp
```

## Use with Google Antigravity

Antigravity is an MCP client too. Add the same server entry to its MCP config
(`mcp_config.json`, global or per workspace; open it from the agent panel's MCP
settings) and restart the agent:

```json
{
  "mcpServers": {
    "clipgringa": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/clipgringa/mcp", "run", "clipgringa-mcp"],
      "env": { "CLIPGRINGA_API_KEY": "sk_your_key_here" }
    }
  }
}
```

Use your own ClipGringa API key (Settings → API keys). This talks to the public
ClipGringa API; it does not use anyone's Antigravity or Google login. If the tool
list is long, Antigravity's `disabledTools` option can hide the ones you do not need
to save context.

## Example prompts

- "Use clipgringa to make clips from https://youtu.be/… with the hormozi caption template, then wait for it and download the top clip."
- "List my recent clipgringa tasks and show the virality scores of the latest one's clips."
- "Export clip <id> from task <id> as a TikTok preset."

## License

AGPL-3.0-or-later, matching the ClipGringa project.
