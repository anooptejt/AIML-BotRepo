# ShipSense Slack Integration - Setup Guide

## 1) Create a Slack App
- Go to `https://api.slack.com/apps` → Create New App (From scratch)
- Add a Bot user

### Scopes (OAuth & Permissions)
- Bot Token Scopes:
  - `chat:write`
  - `commands` (for `/shipsense` slash command)
  - `channels:read` (optional, for channel lookups)
- Install the app to your workspace → copy the Bot User OAuth Token (starts with `xoxb-`)

### Events API (for @mention)
- Enable Events
- Request URL: `https://YOUR_DOMAIN/api/slack`
- Subscribe to bot events: `app_mention`

### Slash Command (optional)
- Command: `/shipsense`
- Request URL: `https://YOUR_DOMAIN/api/slack`
- Short description: "Ask ShipSense"

## 2) Configure Environment Variables
In `web/.env.local` (or platform env):
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

## 3) What Works
- Mention the bot in any channel/thread: `@ShipSense what is Argo CD?`
  - The bot replies in a thread with a structured answer
- Use `/shipsense your question` to query directly

## 4) How it Works Internally
- Endpoint: `POST /api/slack`
  - Verifies Slack signature (`SLACK_SIGNING_SECRET`)
  - Handles Events API (app_mention) and Slash commands
  - Forwards the text to `/api/chat` and posts the answer back to Slack (`SLACK_BOT_TOKEN`)

## 5) Troubleshooting
- 401 invalid signature → check `SLACK_SIGNING_SECRET` and server time skew
- No reply on mentions → ensure Events are enabled and Request URL is verified
- Slash command says "not found" → verify Request URL and method POST

## 6) Security Notes
- Keep tokens in env, never commit to git
- Limit scopes to required ones only
- Consider rate limits and retries in production


