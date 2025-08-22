import { NextRequest } from "next/server";
import { createJiraTicket } from "@/lib/tickets";

export async function POST(req: NextRequest) {
  try {
    const { title, description } = await req.json();
    if (!title || !description) return new Response("missing title/description", { status: 400 });
    const out = await createJiraTicket({ title, description });
    return Response.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 500 });
  }
}


