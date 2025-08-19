import { GoogleGenerativeAI } from "@google/generative-ai";

let embeddingModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

async function embedWithLlama(text: string): Promise<number[]> {
  const base = process.env.LLAMA_BASE_URL || "https://api.openrouter.ai"; // default OpenAI-compatible
  const apiKey = process.env.LLAMA_API_KEY;
  const model = process.env.LLAMA_EMBED_MODEL || "llama-text-embed-v2"; // 1024 dims expected
  if (!apiKey) throw new Error("LLAMA_API_KEY not set");
  const resp = await fetch(`${base.replace(/\/$/, "")}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`Llama embed failed: ${resp.status} ${msg}`);
  }
  const data = await resp.json();
  const vec = data?.data?.[0]?.embedding as number[] | undefined;
  if (!vec) throw new Error("No embedding in response");
  return vec;
}

async function embedWithGoogle(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  if (!embeddingModel) {
    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    embeddingModel = genai.getGenerativeModel({ model: "text-embedding-004" });
  }
  const res = await embeddingModel!.embedContent(text);
  return res.embedding.values as number[];
}

export async function embedText(text: string): Promise<number[]> {
  if (process.env.LLAMA_API_KEY) {
    return embedWithLlama(text);
  }
  return embedWithGoogle(text);
}

export function chunkText(text: string, maxLen = 2000, overlap = 200): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxLen);
    chunks.push(text.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
    if (i >= text.length) break;
  }
  return chunks;
}
