import crypto from "crypto";

export function verifySlackSignature(req: Request, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET || "";
  if (!signingSecret) return false;
  const ts = (req.headers.get("x-slack-request-timestamp") || "").toString();
  const sig = (req.headers.get("x-slack-signature") || "").toString();
  if (!ts || !sig) return false;
  // Prevent replay attacks (5 min window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 60 * 5) return false;

  const base = `v0:${ts}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export async function slackPostMessage(params: { channel: string; text: string; thread_ts?: string }) {
  const token = process.env.SLACK_BOT_TOKEN || "";
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  const channelId = await slackResolveChannelId(params.channel);
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: channelId,
      text: params.text,
      thread_ts: params.thread_ts,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack postMessage failed: ${data.error}`);
  return data;
}

// If already an ID (C... or D...), return as-is; otherwise look up by name
export async function slackResolveChannelId(channelOrName: string): Promise<string> {
  if (/^[CD][A-Z0-9]+$/.test(channelOrName)) return channelOrName;
  const name = channelOrName.replace(/^#/, "").trim();
  const found = await slackFindChannelId(name);
  if (!found) throw new Error(`Channel not found: ${channelOrName}`);
  return found;
}

export async function slackFindChannelId(name: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN || "";
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("types", "public_channel,private_channel");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: { ok: boolean; error?: string; channels?: Array<{ id: string; name: string }>; response_metadata?: { next_cursor?: string } } = await res.json();
    if (!data.ok) throw new Error(`conversations.list failed: ${data.error}`);
    const match = (data.channels || []).find((c) => (c.name || "").toLowerCase() === name.toLowerCase());
    if (match?.id) return match.id;
    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return null;
}


