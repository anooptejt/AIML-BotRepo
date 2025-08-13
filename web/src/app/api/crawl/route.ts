import { NextRequest } from "next/server";
import { fetchAndExtract } from "@/lib/crawl";
import { chunkText, embedText } from "@/lib/embeddings";
import { getIndex } from "@/lib/pinecone";

export async function POST(req: NextRequest) {
  const { urls = [] } = await req.json();
  if (!Array.isArray(urls) || urls.length === 0) {
    return Response.json({ error: "MISSING_URLS" }, { status: 400 });
  }

  const index = getIndex();
  let totalChunks = 0;
  const results: { url: string; title?: string; chunks?: number; error?: string }[] = [];

  for (const url of urls) {
    try {
      const { title, text } = await fetchAndExtract(url);
      const chunks = chunkText(text, 2000, 200);
      const vectors = [] as { id: string; values: number[]; metadata: Record<string, string | number | boolean> }[];
      for (let i = 0; i < chunks.length; i++) {
        const values = await embedText(chunks[i]);
        vectors.push({ id: `${url}#${i}`, values, metadata: { url, title, idx: i } });
      }
      await index.upsert(vectors);
      totalChunks += chunks.length;
      results.push({ url, title, chunks: chunks.length });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ url, error: msg });
    }
  }

  return Response.json({ totalChunks, results });
}
