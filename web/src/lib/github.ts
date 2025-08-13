const GH_API = "https://api.github.com";

function authHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  return headers;
}

export type RepoFile = { path: string; url: string; size?: number };

export async function fetchRepoTree(repo: string, ref = "HEAD"): Promise<RepoFile[]> {
  const url = `${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GitHub tree failed: ${res.status}`);
  const data = await res.json();
  const tree = (data.tree || []) as { path: string; type: string; size?: number }[];
  return tree
    .filter((n) => n.type === "blob")
    .map((n) => ({ path: n.path, url: `${GH_API}/repos/${repo}/contents/${encodeURIComponent(n.path)}?ref=${ref}`, size: n.size }));
}

export async function fetchFileContent(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GitHub content failed: ${res.status}`);
  const data = await res.json();
  if (data.encoding === "base64" && typeof data.content === "string") {
    return Buffer.from(data.content, "base64").toString("utf8");
  }
  if (typeof data.content === "string") return data.content;
  return "";
}
