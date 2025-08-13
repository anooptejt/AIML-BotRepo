import { NextRequest } from "next/server";
import { CORE_DOC_URLS, CORE_GH_REPOS } from "@/lib/sources";
import { fetchAndExtract } from "@/lib/crawl";
import { fetchRepoTree, fetchFileContent } from "@/lib/github";
import { chunkText, embedText } from "@/lib/embeddings";
import { getIndex } from "@/lib/pinecone";

export async function POST(_req: NextRequest) {
  const index = getIndex();
  let chunks = 0, files = 0, pages = 0;

  // Docs
  for (const url of CORE_DOC_URLS) {
    try {
      const { title, text } = await fetchAndExtract(url);
      const parts = chunkText(text, 2000, 200);
      const vectors = [] as { id: string; values: number[]; metadata: Record<string, string | number | boolean> }[];
      for (let i = 0; i < parts.length; i++) {
        const values = await embedText(parts[i]);
        vectors.push({ id: `${url}#${i}`, values, metadata: { url, title, idx: i } });
      }
      if (vectors.length) await index.upsert(vectors);
      chunks += parts.length; pages += 1;
    } catch {}
  }

  // Repos (HEAD)
  for (const repo of CORE_GH_REPOS) {
    try {
      const tree = await fetchRepoTree(repo, "HEAD");
      const candidates = tree.filter((f) => {
        const ext = (f.path.split(".").pop() || "").toLowerCase();
        return ["md","yaml","yml","json","groovy","tf","sh","py","go","ts","js"].includes(ext) && (f.size || 0) < 1024*1024;
      }).slice(0, 400);
      for (const f of candidates) {
        try {
          const content = await fetchFileContent(f.url);
          const parts = chunkText(content, 2000, 200);
          const vectors = [] as { id: string; values: number[]; metadata: Record<string, string | number | boolean> }[];
          for (let i = 0; i < parts.length; i++) {
            const values = await embedText(parts[i]);
            vectors.push({ id: `${repo}@HEAD:${f.path}#${i}`, values, metadata: { repo, ref: "HEAD", path: f.path, idx: i } });
          }
          if (vectors.length) await index.upsert(vectors);
          chunks += parts.length; files += 1;
        } catch {}
      }
    } catch {}
  }

  return Response.json({ pages, files, chunks });
}
