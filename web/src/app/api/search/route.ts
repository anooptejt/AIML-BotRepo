import { NextRequest } from "next/server";
import { embedText } from "@/lib/embeddings";
import { getIndex } from "@/lib/pinecone";
import { getGemini } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { query, topK = 5, answer = true, model = "gemini-2.5-pro" } = await req.json();
  if (!query) return Response.json({ error: "MISSING_QUERY" }, { status: 400 });

  const index = getIndex();
  const vec = await embedText(query);
  const res = await index.query({ topK, vector: vec, includeMetadata: true });
  const matches = res.matches || [];

  if (!answer) return Response.json({ matches });

  const context = matches
    .map((m) => `File: ${m.metadata?.filename} (chunk ${m.metadata?.chunk})\n---\n`)
    .join("\n");

  const gm = getGemini(model);
  const isCanI = /^\s*can\s+i\b/i.test(query);
  const instruction = isCanI
    ? `Using the following code context, answer decisively in structured bullet points: Can I ...? Include: feasibility, prerequisites, exact steps/commands, risks, and alternatives.`
    : `Using the following code context, answer as structured bullet points with headings and numbered steps where appropriate. Keep it concise and scannable.`;
  const result = await gm.generateContent({
    contents: [{ role: "user", parts: [{ text: `${instruction}\n\nQuestion: ${query}\n\nContext:\n${context}` }]}],
    generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 1024 },
  });
  const resp = result.response as unknown as { text?: string | (() => string) };
  const text: string = typeof resp?.text === "function" ? resp.text() : (resp?.text as string) ?? "";

  return Response.json({ matches, answer: text });
}
