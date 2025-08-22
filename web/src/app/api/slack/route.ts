import { NextRequest } from "next/server";
import { verifySlackSignature, slackPostMessage, slackResolveChannelId } from "@/lib/slack";
import { isAllowedTopic } from "@/lib/guardrails";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  // Slack URL verification (Events API)
  try {
    const body = JSON.parse(rawBody);
    if (body.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: body.challenge }), { headers: { "Content-Type": "application/json" } });
    }
  } catch {}

  if (!verifySlackSignature(req as unknown as Request, rawBody)) {
    return new Response("invalid signature", { status: 401 });
  }

  // Helper to call our chat API and return text
  async function generateAnswer(prompt: string): Promise<string> {
    if (!isAllowedTopic(prompt)) {
      return "This Slack integration only answers DevOps/CI/CD topics (Terraform, Ansible, Jenkins, Argo, Kubernetes, Helm, DevSecOps).";
    }
    const base = req.nextUrl.origin;
    try {
      const r = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await r.json();
      return (j?.output as string) || "(no response)";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error generating response: ${msg}`;
    }
  }

  // Try JSON first (Events API)
  try {
    const body = JSON.parse(rawBody);
    if (body?.type === "event_callback" && body?.event) {
      const ev = body.event as { type: string; text?: string; channel?: string; thread_ts?: string; ts?: string };
      if (ev.type === "app_mention" && ev.text && ev.channel) {
        const clean = ev.text.replace(/<@[^>]+>/g, "").trim();
        const reply = await generateAnswer(clean);
        await slackPostMessage({ channel: ev.channel, text: reply, thread_ts: ev.thread_ts || ev.ts });
        return new Response("ok");
      }
    }
  } catch {}

  // Fallback: slash commands (x-www-form-urlencoded)
  try {
    const params = new URLSearchParams(rawBody);
    const command = params.get("command");
    if (command === "/shipsense") {
      const text = params.get("text") || "";
      const channel = params.get("channel_id") || "";
      const reply = await generateAnswer(text);
      // Resolve for richer error handling
      try {
        await slackResolveChannelId(channel);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(`Channel error: ${msg}`, { status: 400 });
      }
      await slackPostMessage({ channel, text: reply });
      return new Response("ok");
    }
  } catch {}

  return new Response("ignored");
}


