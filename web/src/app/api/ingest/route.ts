import { NextRequest } from "next/server";
import { chunkText, embedText } from "@/lib/embeddings";
import { getIndex } from "@/lib/pinecone";

type Meta = { filename: string; chunk: number; ext: string };

type Vector = { id: string; values: number[]; metadata: Record<string, string | number | boolean> };

function summarize(name: string, content: string): string {
  const lines = content.split(/\r?\n/);
  const head = lines.slice(0, 30).join("\n");
  return `File: ${name}\nLines: ${lines.length}\nPreview:\n${head}`;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files");
  const results: { name: string; summary: string }[] = [];
  const vectors: Vector[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    if (f.size > 2 * 1024 * 1024) {
      results.push({ name: f.name, summary: "Skipped (file too large)" });
      continue;
    }
    const text = await f.text();
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (["sh","tf","yaml","yml","groovy"].includes(ext)) {
      results.push({ name: f.name, summary: summarize(f.name, text) });
      const chunks = chunkText(text);
      for (let i = 0; i < chunks.length; i++) {
        const values = await embedText(chunks[i]);
        vectors.push({ id: `${f.name}-${i}`, values, metadata: { filename: f.name, chunk: i, ext } });
      }
    } else {
      results.push({ name: f.name, summary: "Unsupported file type" });
    }
  }

  if (vectors.length > 0) {
    const index = getIndex();
    await index.upsert(vectors);
  }

  return Response.json({ results, upserted: vectors.length });
}
