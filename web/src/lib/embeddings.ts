import { GoogleGenerativeAI } from "@google/generative-ai";

let embeddingModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

export async function embedText(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  if (!embeddingModel) {
    const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    embeddingModel = genai.getGenerativeModel({ model: "text-embedding-004" });
  }
  const res = await embeddingModel!.embedContent(text);
  return res.embedding.values as number[];
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
