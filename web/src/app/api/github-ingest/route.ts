import { NextRequest } from "next/server";
import { fetchRepoTree, fetchFileContent } from "@/lib/github";
import { chunkText, embedText } from "@/lib/embeddings";
import { getIndex } from "@/lib/pinecone";

const ALLOWED_EXT = new Set([
  "md", "adoc", // docs
  "yaml", "yml", "json",
  "groovy", "java", "kt", // Spinnaker languages
  "gradle", // build files
  "tf", "sh", "py", "go", "ts", "js"
]);

export async function POST(req: NextRequest) {
  const { repo, ref = "HEAD", maxFiles = 500 } = await req.json();
  if (!repo || typeof repo !== "string") return Response.json({ error: "MISSING_REPO" }, { status: 400 });

  const index = getIndex();
  const tree = await fetchRepoTree(repo, ref);
  const candidates = tree.filter((f) => {
    const ext = (f.path.split(".").pop() || "").toLowerCase();
    return ALLOWED_EXT.has(ext) && (f.size || 0) < 1024 * 1024;
  }).slice(0, maxFiles);

  let filesProcessed = 0;
  for (const file of candidates) {
    try {
      const content = await fetchFileContent(file.url);
      const chunks = chunkText(content, 2000, 200);
      const vectors = [] as { id: string; values: number[]; metadata: Record<string, string | number | boolean> }[];
      for (let i = 0; i < chunks.length; i++) {
        const values = await embedText(chunks[i]);
        vectors.push({ id: `${repo}@${ref}:${file.path}#${i}`, values, metadata: { repo, ref, path: file.path, idx: i } });
      }
      if (vectors.length) await index.upsert(vectors);
      filesProcessed++;
    } catch {
      // skip errors
    }
  }

  return Response.json({ repo, ref, filesProcessed, totalFiles: candidates.length });
}
